// BATTLE HUB (home): arena + trophy road, season pass banner, deck preview, BATTLE button, 4 chest slots.

import { h, mount, countdown, fmtNum } from '../dom.js';
import { ARENAS, arenaFor, CHESTS, PASS } from '../../data/catalog.js';
import { getCard } from '../../data/cards.js';
import { playerState } from '../../state/playerState.js';
import {
  averageElixir, chestReady, isUnlocking, startUnlock, chestSkipCost, skipChest, openChestSlot,
  passTier, claimablePassRewards,
} from '../../state/economy.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { openRewardReveal } from '../components/rewardReveal.js';
import { openPassModal } from '../components/passModal.js';
import { playBattle } from '../../game/battleFlow.js';

export const battleHub = {
  id: 'battle',
  label: 'Battaglia',
  icon: '⚔️',

  render(el, { router }) {
    const s = playerState;
    const arena = arenaFor(s.trophies);
    const next = ARENAS[arena.id + 1];

    mount(el, 
      // Arena display
      h('div', { class: 'arena-card', style: { '--a1': arena.colors[0], '--a2': arena.colors[1] } },
        h('div', { class: 'arena-icon' }, arena.icon),
        h('div', { class: 'arena-info' },
          h('small', {}, `Arena ${arena.id + 1}`),
          h('h2', {}, arena.name),
          h('div', { class: 'trophies' }, '🏆 ', h('b', {}, fmtNum(s.trophies)),
            next ? h('small', {}, ` · ${next.min - s.trophies} per ${next.name}`) : h('small', {}, ' · Arena massima!')),
        ),
      ),
      trophyRoad(s.trophies),

      // Season pass banner
      passBanner(),

      // Deck preview + battle buttons
      h('div', { class: 'battle-zone' },
        h('button', { class: 'deck-preview', onClick: () => router.navigate('cards'), 'aria-label': 'Modifica mazzo' },
          s.deck.map((id) => h('span', {}, getCard(id).art)),
          h('small', {}, `💧 ${averageElixir().toFixed(1)}`),
        ),
        h('button', { class: 'battle-btn', onClick: () => playBattle({ mode: 'ladder' }) },
          h('span', { class: 'battle-btn-label' }, 'BATTAGLIA'),
          h('small', {}, '1 contro 1 · trofei in palio'),
        ),
        h('button', {
          class: 'btn btn-ghost small',
          onClick: () => playBattle({ mode: 'friendly', skipSearch: true, opponentName: 'Bot di allenamento', label: 'Allenamento' }),
        }, '🎯 Allenamento contro il bot'),
      ),

      // Chest slots
      h('div', { class: 'chest-slots' }, s.chestSlots.map((slot, i) => chestSlot(slot, i))),
    );
  },

  onShow(el) {
    // Bring the player's position on the trophy road into view.
    const road = el.querySelector('.trophy-road');
    const marker = el.querySelector('.road-marker');
    if (road && marker) road.scrollLeft = marker.offsetLeft - road.clientWidth / 2;
  },
};

function trophyRoad(trophies) {
  const max = ARENAS[ARENAS.length - 1].min + 500;
  const px = (t) => 40 + (t / max) * 1100;
  return h('div', { class: 'trophy-road h-scroll' },
    h('div', { class: 'road-track', style: { width: px(max) + 40 + 'px' } },
      h('div', { class: 'road-line' }),
      h('div', { class: 'road-fill', style: { width: px(trophies) + 'px' } }),
      ARENAS.map((a) => h('div', { class: ['road-node', trophies >= a.min && 'reached'], style: { left: px(a.min) + 'px' } },
        h('span', { class: 'road-ico' }, a.icon),
        h('small', {}, `${a.min}`),
        h('small', { class: 'road-name' }, a.name),
      )),
      h('div', { class: 'road-marker', style: { left: px(trophies) + 'px' } }, '🏆'),
    ),
  );
}

function passBanner() {
  const tier = passTier();
  const inTier = playerState.pass.crowns % PASS.crownsPerTier;
  const claimable = claimablePassRewards();
  const maxed = tier >= PASS.tiers.length;
  return h('button', { class: 'pass-banner', onClick: openPassModal },
    h('span', { class: 'pass-ico' }, '🎟️'),
    h('span', { class: 'pass-text' },
      h('b', {}, `${PASS.name} · Livello ${tier}`),
      h('span', { class: 'progress slim' },
        h('span', { class: 'bar', style: { width: (maxed ? 100 : (inTier / PASS.crownsPerTier) * 100) + '%' } }),
        h('small', {}, maxed ? 'Completato' : `👑 ${inTier}/${PASS.crownsPerTier}`)),
    ),
    claimable > 0 ? h('span', { class: 'pill-alert' }, `${claimable} da riscattare`) : h('span', { class: 'chev' }, '›'),
  );
}

function chestSlot(slot, idx) {
  if (!slot) return h('div', { class: 'chest-slot empty' }, h('small', {}, 'Slot libero'));
  const chest = CHESTS[slot.type];
  const ready = chestReady(slot);
  const unlocking = slot.readyAt && !ready;
  return h('button', {
    class: ['chest-slot', ready && 'ready', unlocking && 'unlocking'],
    style: { '--cc': chest.color },
    onClick: () => onChestTap(idx),
  },
    h('span', { class: 'chest-ico' }, chest.icon),
    h('small', { class: 'chest-name' }, chest.name.replace('Forziere ', '')),
    ready ? h('b', { class: 'chest-state' }, 'APRI!')
      : unlocking ? h('b', { class: 'chest-state' }, countdown(slot.readyAt, { done: 'APRI!' }))
        : h('b', { class: 'chest-state locked' }, isUnlocking() ? '🔒' : `🔓 ${fmtHours(chest.unlockMs)}`),
  );
}

const fmtHours = (ms) => `${Math.round(ms / 3600000)}h`;

async function onChestTap(idx) {
  const slot = playerState.chestSlots[idx];
  if (!slot) return;
  if (chestReady(slot)) {
    const bundle = openChestSlot(idx);
    if (bundle) await openRewardReveal(bundle);
    return;
  }
  const chest = CHESTS[slot.type];
  const cost = chestSkipCost(idx);
  const unlocking = Boolean(slot.readyAt);
  openModal({
    title: chest.name,
    className: 'modal-small',
    body: h('div', { class: 'chest-info', style: { '--cc': chest.color } },
      h('div', { class: 'chest-big' }, chest.icon),
      h('ul', { class: 'chest-contents' },
        h('li', {}, `🪙 ${chest.gold[0]}–${chest.gold[1]} oro (×arena)`),
        h('li', {}, `🃏 ${chest.cards}+ carte`),
        Object.entries(chest.guaranteed).map(([r, n]) => h('li', {}, `✨ almeno ${n} ${r === 'rare' ? 'rare' : 'epiche'}`)),
        chest.gems[1] > 0 && h('li', {}, `💎 fino a ${chest.gems[1]} gemme`),
      ),
      unlocking
        ? h('p', {}, 'Sblocco in corso: ', countdown(slot.readyAt))
        : h('p', { class: 'muted' }, `Tempo di sblocco: ${fmtHours(chest.unlockMs)}`),
      !unlocking && isUnlocking() && h('p', { class: 'hint' }, 'Un altro forziere si sta già sbloccando.'),
    ),
    actions: [
      !unlocking && !isUnlocking() && {
        label: `Sblocca (${fmtHours(chest.unlockMs)})`, class: 'btn-blue',
        onClick: (close) => { startUnlock(idx); close(); toast('Sblocco avviato', 'ok'); },
      },
      {
        label: `Apri ora 💎 ${cost}`, class: 'btn-green',
        onClick: async (close) => {
          if (!skipChest(idx)) return toast('Gemme insufficienti', 'error');
          close();
          const bundle = openChestSlot(idx);
          if (bundle) await openRewardReveal(bundle);
        },
      },
    ].filter(Boolean),
  });
}
