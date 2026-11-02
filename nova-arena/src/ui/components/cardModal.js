// Card inspection modal: art, faction, archetype tags, flavor text, stats (now → next level), upgrade.

import { h, mount, fmtNum } from '../dom.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { cardArt, elixirDrop } from './cardTile.js';
import { FACTIONS, RARITIES, TYPES, TAGS, MAX_LEVEL, upgradeCost, statMultiplier, upgradeXp } from '../../data/cards.js';
import { ARENAS } from '../../data/catalog.js';
import { playerState, subscribe } from '../../state/playerState.js';
import { upgradeCard } from '../../state/economy.js';

const STAT_ROWS = [
  ['hp', 'Punti vita', '❤️', true],
  ['shield', 'Scudo', '🛡️', true],
  ['dmg', 'Danni', '⚔️', true],
  ['deathDmg', 'Danni alla morte', '💥', true],
  ['heal', 'Cura', '💚', true],
  ['hitSpeed', 'Velocità attacco', '⏱️', false, (v) => `${v}s`],
  ['speed', 'Movimento', '👟', false, (v) => (v >= 1.6 ? 'Molto veloce' : v >= 1.2 ? 'Veloce' : v >= 0.9 ? 'Medio' : 'Lento')],
  ['range', 'Gittata', '🎯', false, (v) => (v <= 1.2 ? 'Mischia' : `${v} caselle`)],
  ['radius', 'Raggio', '⭕', false, (v) => `${v} caselle`],
  ['count', 'Quantità', '👥', false, (v) => `x${v}`],
  ['lifetime', 'Durata', '⌛', false, (v) => `${v}s`],
];

/** opts: { onUse(card) } — shows a "Usa nel mazzo" button when given and the card is owned. */
export function openCardModal(card, opts = {}) {
  const container = h('div', { class: 'card-detail' });
  let selectedTag = null;

  const draw = () => {
    const owned = playerState.cards[card.id];
    const faction = FACTIONS[card.faction];
    const rarity = RARITIES[card.rarity];
    const level = owned?.level ?? rarity.startLevel;
    const cost = owned ? upgradeCost(card, level) : null;
    const m = statMultiplier(level), mNext = statMultiplier(level + 1);
    const inDeck = playerState.deck.includes(card.id);

    mount(container,
      h('div', { class: 'detail-hero', style: { '--f1': faction.color, '--f2': faction.accent } },
        cardArt(card, 'xl'),
        h('div', { class: 'detail-meta' },
          h('div', { class: 'detail-rarity', style: { color: rarity.color } }, rarity.name),
          h('div', { class: 'detail-faction' }, faction.icon, ' ', faction.name, ' · ', TYPES[card.type]),
          h('div', { class: 'detail-elixir' }, elixirDrop(card.elixir, 'lg'), ' elisir'),
          h('div', { class: 'detail-level' }, owned ? (level >= MAX_LEVEL ? 'Livello MAX' : `Livello ${level}`) : '🔒 Non ancora trovata'),
        ),
      ),

      h('div', { class: 'tag-row' },
        card.tags.map((tag) => h('button', {
          class: ['tag-chip', selectedTag === tag && 'active', TAGS[tag]?.sim && 'sim'],
          onClick: () => { selectedTag = selectedTag === tag ? null : tag; draw(); },
        }, tag)),
      ),
      selectedTag && h('p', { class: 'tag-desc' }, h('b', {}, selectedTag + ': '), TAGS[selectedTag]?.desc ?? ''),

      h('blockquote', { class: 'flavor' }, '“', card.flavor, '”'),

      h('table', { class: 'stats-table' },
        h('tbody', {},
          STAT_ROWS.filter(([key]) => card.stats[key] != null && card.stats[key] !== 0).map(([key, label, icon, scales, fmt]) => {
            const base = card.stats[key];
            const now = scales ? Math.round(base * m) : base;
            const next = scales ? Math.round(base * mNext) : null;
            return h('tr', {},
              h('td', {}, icon, ' ', label),
              h('td', { class: 'num' }, fmt ? fmt(now) : fmtNum(now)),
              h('td', { class: 'num plus' }, cost && scales && owned ? `+${next - now}` : ''),
            );
          }),
          card.stats.spawn && h('tr', {}, h('td', {}, '🥚 Genera'), h('td', { class: 'num' }, `ogni ${card.stats.spawn.every}s`), h('td', {})),
        ),
      ),

      !owned && h('p', { class: 'hint' }, `Si trova nei forzieri a partire da: ${ARENAS[card.arena].icon} ${ARENAS[card.arena].name} (${ARENAS[card.arena].min} 🏆).`),

      owned && cost && h('div', { class: 'upgrade-box' },
        h('div', { class: ['card-progress', 'big', owned.count >= cost.cards && 'full'] },
          h('div', { class: 'bar', style: { width: Math.min(100, (owned.count / cost.cards) * 100) + '%' } }),
          h('span', {}, `${owned.count} / ${cost.cards} copie`),
        ),
        h('button', {
          class: ['btn', 'btn-gold', 'btn-upgrade'],
          disabled: owned.count < cost.cards || playerState.gold < cost.gold,
          onClick: () => {
            const res = upgradeCard(card.id);
            if (!res) return;
            container.classList.remove('flash');
            void container.offsetWidth;
            container.classList.add('flash');
            toast(`${card.name} al livello ${res.level}! +${res.xp} XP`, 'ok');
          },
        }, `Migliora  🪙 ${fmtNum(cost.gold)}`),
        h('small', { class: 'hint' },
          owned.count < cost.cards ? `Servono altre ${cost.cards - owned.count} copie.`
            : playerState.gold < cost.gold ? `Ti mancano ${fmtNum(cost.gold - playerState.gold)} monete.`
              : `+${upgradeXp(level)} XP esperienza re`),
      ),
      owned && !cost && h('p', { class: 'hint center' }, `Livello massimo raggiunto · ${owned.count} copie in più`),

      opts.onUse && owned && !inDeck && h('button', { class: 'btn btn-green wide', onClick: () => { closeModal(); opts.onUse(card); } }, 'Usa nel mazzo'),
      inDeck && h('p', { class: 'hint center' }, '✔ Nel mazzo attivo'),
    );
  };

  draw();
  const unsubscribe = subscribe((_, reason) => { if (['upgrade', 'xp', 'cards', 'reward', 'spend'].includes(reason)) draw(); });
  const closeModal = openModal({ title: card.name, body: container, className: 'modal-card', onClose: unsubscribe });
  return closeModal;
}
