// Card visuals: tile used in deck/collection/rewards, and the elixir drop / currency pills.

import { h } from '../dom.js';
import { FACTIONS, RARITIES, upgradeCost } from '../../data/cards.js';
import { ARENAS } from '../../data/catalog.js';
import { playerState } from '../../state/playerState.js';
import { canUpgrade } from '../../state/economy.js';

export const elixirDrop = (value, extra = '') => h('span', { class: ['elixir', extra] }, String(value));
export const gold = (n) => h('span', { class: 'cur cur-gold' }, h('i', {}, '🪙'), String(n));
export const gems = (n) => h('span', { class: 'cur cur-gems' }, h('i', {}, '💎'), String(n));

/** The square-ish art block (faction gradient + emoji). */
export function cardArt(card, size = '') {
  const f = FACTIONS[card.faction];
  return h('div', {
    class: ['card-art', size, `rarity-${card.rarity}`],
    style: { '--f1': f.color, '--f2': f.accent, '--rc': RARITIES[card.rarity].color },
  }, h('span', { class: 'card-emoji' }, card.art));
}

/**
 * opts: { onClick, compact, showProgress = true, highlight, extraClass, countBadge, levelOverride }
 */
export function cardTile(card, opts = {}) {
  const owned = playerState.cards[card.id];
  const locked = !owned && opts.levelOverride == null;
  const level = opts.levelOverride ?? owned?.level;
  const cost = owned && opts.levelOverride == null ? upgradeCost(card, owned.level) : null;
  const upgradable = opts.levelOverride == null && canUpgrade(card.id);

  return h('button', {
    class: ['card-tile', `rarity-${card.rarity}`, locked && 'locked', upgradable && 'upgradable', opts.compact && 'compact', opts.highlight && 'highlight', opts.extraClass],
    'aria-label': `${card.name}, ${card.elixir} elisir`,
    dataset: { cardId: card.id },
    onClick: opts.onClick ? () => opts.onClick(card) : null,
  },
    elixirDrop(card.elixir),
    cardArt(card),
    upgradable && h('span', { class: 'upgrade-arrow', title: 'Migliorabile' }, '▲'),
    opts.countBadge && h('span', { class: 'count-badge' }, `x${opts.countBadge}`),
    h('div', { class: 'card-name' }, card.name),
    locked
      ? h('div', { class: 'card-lock' }, '🔒 ', ARENAS[card.arena].name)
      : h('div', { class: 'card-level' }, level >= 14 ? 'MAX' : `Liv. ${level}`),
    opts.showProgress !== false && cost && h('div', { class: ['card-progress', owned.count >= cost.cards && 'full'] },
      h('div', { class: 'bar', style: { width: Math.min(100, (owned.count / cost.cards) * 100) + '%' } }),
      h('span', {}, `${owned.count}/${cost.cards}`),
    ),
  );
}
