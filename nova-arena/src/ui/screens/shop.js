// SHOP: 3 daily deals (rotate at midnight), premium chests for gems, gold & gem packs (simulated checkout).

import { h, mount, countdown, fmtNum, seededRandom, pick, randInt } from '../dom.js';
import { CARDS, RARITIES, getCard } from '../../data/cards.js';
import { CHESTS, GOLD_PACKS, GEM_PACKS, dayIndex, nextDayAt, arenaFor, DAILY_DEAL_SLOTS } from '../../data/catalog.js';
import { playerState, update } from '../../state/playerState.js';
import { spend, rollChest, applyRewards, grantCards, ownsCard } from '../../state/economy.js';
import { cardArt } from '../components/cardTile.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { openRewardReveal } from '../components/rewardReveal.js';

const CARD_PRICE = { common: 10, rare: 100, epic: 1000, legendary: 20000 };
const CARD_QTY = { common: [20, 60], rare: [5, 15], epic: [1, 3], legendary: [1, 1] };

/** Deterministic deals for a given day (same for everyone, same after reload). */
export function dailyDeals(day = dayIndex(), arenaId = arenaFor(playerState.trophies).id) {
  const rnd = seededRandom(day * 7919 + arenaId);
  const pool = CARDS.filter((c) => c.arena <= arenaId);
  const fromRarity = (rarities) => pick(pool.filter((c) => rarities.includes(c.rarity)), rnd);
  const deals = [];

  const common = fromRarity(['common']);
  const cq = randInt(...CARD_QTY.common, rnd);
  deals.push({ id: `${day}-0`, kind: 'card', cardId: common.id, count: cq, cost: { gold: cq * CARD_PRICE.common } });

  const rarePool = pool.some((c) => c.rarity === 'epic') && rnd() < 0.35 ? ['epic'] : ['rare'];
  const special = fromRarity(rarePool);
  const sq = randInt(...CARD_QTY[special.rarity], rnd);
  deals.push({ id: `${day}-1`, kind: 'card', cardId: special.id, count: sq, cost: { gold: sq * CARD_PRICE[special.rarity] } });

  const chestType = rnd() < 0.7 ? 'rare' : 'cosmic';
  deals.push({ id: `${day}-2`, kind: 'chest', chestType, cost: { gems: Math.round(CHESTS[chestType].shopGems * 0.7) }, discount: 30 });

  return deals.slice(0, DAILY_DEAL_SLOTS);
}

export const shop = {
  id: 'shop',
  label: 'Negozio',
  icon: '🛒',

  render(el) {
    const today = dayIndex();
    if (playerState.shop.day !== today) update((s) => { s.shop = { day: today, bought: [] }; }, 'shop');
    const bought = new Set(playerState.shop.bought);

    mount(el, 
      h('div', { class: 'section-head' },
        h('h2', {}, 'Offerte del giorno'),
        h('small', { class: 'muted' }, 'Nuove tra ', countdown(nextDayAt(), { done: 'ora' })),
      ),
      h('div', { class: 'deals' }, dailyDeals(today).map((deal) => dealTile(deal, bought.has(deal.id)))),

      h('div', { class: 'section-head' }, h('h2', {}, 'Forzieri')),
      h('div', { class: 'shop-chests' }, ['common', 'rare', 'cosmic'].map(chestTile)),

      h('div', { class: 'section-head', id: 'currency' }, h('h2', {}, 'Oro')),
      h('div', { class: 'pack-grid' }, GOLD_PACKS.map((p) => h('button', { class: 'pack gold-pack', onClick: () => buyGold(p) },
        h('span', { class: 'pack-ico' }, p.icon),
        h('b', {}, fmtNum(p.gold)),
        h('small', {}, p.name),
        h('span', { class: 'price' }, '💎 ', fmtNum(p.gems)),
      ))),

      h('div', { class: 'section-head' }, h('h2', {}, 'Gemme'), h('small', { class: 'muted' }, 'Acquisti simulati')),
      h('div', { class: 'pack-grid' }, GEM_PACKS.map((p) => h('button', { class: ['pack', 'gem-pack', p.best && 'best'], onClick: () => buyGems(p) },
        p.bonus && h('span', { class: 'ribbon' }, p.bonus),
        h('span', { class: 'pack-ico' }, p.icon),
        h('b', {}, fmtNum(p.gems)),
        h('small', {}, p.name),
        h('span', { class: 'price real' }, p.price),
      ))),
    );
  },

  onShow(el, { params }) {
    if (params?.[0] === 'currency') el.querySelector('#currency')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
};

function dealTile(deal, sold) {
  const price = deal.cost.gold != null ? ['🪙', deal.cost.gold] : ['💎', deal.cost.gems];
  let art, title, sub;
  if (deal.kind === 'card') {
    const card = getCard(deal.cardId);
    art = cardArt(card);
    title = card.name;
    sub = h('span', { style: { color: RARITIES[card.rarity].color } }, `x${deal.count} · ${RARITIES[card.rarity].name}`);
  } else {
    const chest = CHESTS[deal.chestType];
    art = h('div', { class: 'deal-chest', style: { '--cc': chest.color } }, chest.icon);
    title = chest.name;
    sub = h('span', { class: 'discount' }, `-${deal.discount}%`);
  }
  return h('button', { class: ['deal', sold && 'sold'], disabled: sold, onClick: () => buyDeal(deal) },
    art,
    h('b', { class: 'deal-title' }, title),
    h('small', {}, sub),
    h('span', { class: 'price' }, sold ? 'Acquistato ✔' : [price[0], ' ', fmtNum(price[1])]),
  );
}

async function buyDeal(deal) {
  const what = deal.kind === 'card' ? `${deal.count}× ${getCard(deal.cardId).name}` : CHESTS[deal.chestType].name;
  const price = deal.cost.gold != null ? `${fmtNum(deal.cost.gold)} oro` : `${deal.cost.gems} gemme`;
  if (!await confirmDialog({ title: 'Offerta del giorno', message: `Acquistare ${what} per ${price}?`, confirmLabel: 'Acquista' })) return;
  if (!spend(deal.cost, 'shop')) return toast(deal.cost.gold != null ? 'Oro insufficiente' : 'Gemme insufficienti', 'error');
  update((s) => { s.shop.bought.push(deal.id); }, 'shop');
  if (deal.kind === 'card') {
    const isNew = !ownsCard(deal.cardId);
    grantCards([{ id: deal.cardId, count: deal.count }]);
    await openRewardReveal({ source: 'Offerta del giorno', cards: [{ id: deal.cardId, count: deal.count, isNew }] });
  } else {
    const bundle = rollChest(deal.chestType);
    applyRewards(bundle);
    await openRewardReveal(bundle);
  }
}

function chestTile(type) {
  const chest = CHESTS[type];
  return h('div', { class: ['shop-chest', `chest-${type}`], style: { '--cc': chest.color } },
    h('div', { class: 'shop-chest-ico' }, chest.icon),
    h('b', {}, chest.name),
    h('small', { class: 'muted' }, `${chest.cards}+ carte · ${chest.gold[0]}+ oro`),
    h('button', { class: 'btn btn-green unlock-btn', onClick: () => buyChest(type) }, '💎 ', String(chest.shopGems)),
  );
}

async function buyChest(type) {
  const chest = CHESTS[type];
  if (!await confirmDialog({ title: chest.name, message: `Acquistare e aprire subito per ${chest.shopGems} gemme?`, confirmLabel: 'Acquista' })) return;
  if (!spend({ gems: chest.shopGems }, 'shop')) return toast('Gemme insufficienti', 'error');
  const bundle = rollChest(type);
  applyRewards(bundle);
  await openRewardReveal(bundle);
}

async function buyGold(pack) {
  if (!await confirmDialog({ title: pack.name, message: `Scambiare ${fmtNum(pack.gems)} gemme con ${fmtNum(pack.gold)} oro?`, confirmLabel: 'Scambia' })) return;
  if (!spend({ gems: pack.gems }, 'shop')) return toast('Gemme insufficienti', 'error');
  update((s) => { s.gold += pack.gold; }, 'shop');
  toast(`+${fmtNum(pack.gold)} oro`, 'ok');
}

/** Simulated store checkout: no real payment, just a short "processing" state. */
function buyGems(pack) {
  const body = h('div', { class: 'checkout' },
    h('div', { class: 'checkout-item' }, h('span', { class: 'pack-ico' }, pack.icon), h('b', {}, `${fmtNum(pack.gems)} gemme`), h('span', { class: 'price real' }, pack.price)),
    h('p', { class: 'hint' }, 'Modalità demo: il pagamento è simulato, nessun addebito reale.'),
  );
  openModal({
    title: 'Conferma acquisto',
    className: 'modal-small',
    body,
    actions: [{
      label: `Paga ${pack.price}`, class: 'btn-green',
      onClick: (close) => {
        body.replaceChildren(h('div', { class: 'processing' }, h('div', { class: 'spinner' }), h('p', {}, 'Elaborazione pagamento…')));
        body.closest('.modal').querySelector('.modal-actions')?.remove();
        setTimeout(() => {
          update((s) => { s.gems += pack.gems; }, 'shop');
          body.replaceChildren(h('div', { class: 'processing done' }, h('div', { class: 'big-ico' }, '✅'), h('p', {}, `+${fmtNum(pack.gems)} gemme accreditate!`)));
          setTimeout(close, 1100);
        }, 1300);
      },
    }],
  });
}

