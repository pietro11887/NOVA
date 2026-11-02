// Game rules that act on playerState: currencies, cards, upgrades, chests, XP, battle rewards.
// Every function here goes through update() so all screens stay in sync.

import { playerState, update } from './playerState.js';
import { CARDS, getCard, RARITIES, upgradeCost, upgradeXp, MAX_LEVEL } from '../data/cards.js';
import { CHESTS, CHEST_CYCLE, arenaFor, skipCost, PASS } from '../data/catalog.js';
import { randInt, pick } from '../ui/dom.js';

export const MAX_KING_LEVEL = 14;
export const xpToNext = (level) => 20 + level * level * 18;

// ── Currencies ─────────────────────────────────────────────────────────────
export const canAfford = (cost = {}) =>
  (cost.gold ?? 0) <= playerState.gold && (cost.gems ?? 0) <= playerState.gems;

/** Deducts gold/gems atomically. Returns false (and changes nothing) if not affordable. */
export function spend(cost, reason = 'spend') {
  if (!canAfford(cost)) return false;
  update((s) => {
    s.gold -= cost.gold ?? 0;
    s.gems -= cost.gems ?? 0;
  }, reason);
  return true;
}

export function addXp(amount) {
  update((s) => {
    s.xp += amount;
    while (s.level < MAX_KING_LEVEL && s.xp >= xpToNext(s.level)) {
      s.xp -= xpToNext(s.level);
      s.level += 1;
      s.gems += 10 * s.level; // level-up bonus
    }
  }, 'xp');
}

// ── Cards & deck ───────────────────────────────────────────────────────────
export const ownsCard = (id) => Boolean(playerState.cards[id]);
export const cardLevel = (id) => playerState.cards[id]?.level ?? RARITIES[getCard(id).rarity].startLevel;

export function averageElixir(deck = playerState.deck) {
  if (!deck.length) return 0;
  return deck.reduce((sum, id) => sum + getCard(id).elixir, 0) / deck.length;
}

/** Card ids not in the active deck, owned first. */
export function collectionCards() {
  return CARDS.filter((c) => !playerState.deck.includes(c.id));
}

export function canUpgrade(id) {
  const owned = playerState.cards[id];
  if (!owned) return false;
  const cost = upgradeCost(getCard(id), owned.level);
  return Boolean(cost && owned.count >= cost.cards && playerState.gold >= cost.gold);
}

export const upgradableCount = () => Object.keys(playerState.cards).filter(canUpgrade).length;

export function upgradeCard(id) {
  if (!canUpgrade(id)) return false;
  const owned = playerState.cards[id];
  const cost = upgradeCost(getCard(id), owned.level);
  const xp = upgradeXp(owned.level);
  update((s) => {
    s.cards[id].count -= cost.cards;
    s.cards[id].level += 1;
    s.gold -= cost.gold;
  }, 'upgrade');
  addXp(xp);
  return { level: owned.level, xp };
}

/** Puts `id` into deck slot `slot`. If it's already in the deck the two slots swap. */
export function setDeckCard(slot, id) {
  update((s) => {
    const from = s.deck.indexOf(id);
    if (from === slot) return;
    if (from >= 0) [s.deck[from], s.deck[slot]] = [s.deck[slot], s.deck[from]];
    else s.deck[slot] = id;
  }, 'deck');
}

export function grantCards(list) {
  update((s) => {
    for (const { id, count } of list) {
      const card = getCard(id);
      if (!s.cards[id]) s.cards[id] = { level: RARITIES[card.rarity].startLevel, count: 0 };
      s.cards[id].count += count;
    }
  }, 'cards');
}

// ── Rewards / chests ───────────────────────────────────────────────────────
/** Builds a reward bundle for a chest type at the player's current arena. */
export function rollChest(type, arena = arenaFor(playerState.trophies).id) {
  const chest = CHESTS[type];
  const pool = CARDS.filter((c) => c.arena <= arena);
  const byRarity = (r) => pool.filter((c) => c.rarity === r);
  const scale = 1 + arena * 0.35;
  const cards = new Map();
  const add = (card, n) => cards.set(card.id, (cards.get(card.id) ?? 0) + n);

  for (const [rarity, n] of Object.entries(chest.guaranteed)) {
    const options = byRarity(rarity);
    if (options.length) add(pick(options), Math.round(n * scale));
  }
  if (chest.legendaryChance && Math.random() < chest.legendaryChance) {
    const legends = byRarity('legendary');
    if (legends.length) add(pick(legends), 1);
  }

  // Remaining cards split over N stacks, weighted by rarity.
  let remaining = Math.round(chest.cards * scale);
  for (let i = 0; i < chest.stacks && remaining > 0; i++) {
    const rarity = rollRarity();
    const options = byRarity(rarity).length ? byRarity(rarity) : byRarity('common');
    const share = i === chest.stacks - 1 ? remaining : Math.max(1, Math.round(remaining / (chest.stacks - i) * (0.6 + Math.random() * 0.8)));
    const count = rarity === 'common' ? share : Math.max(1, Math.round(share / (rarity === 'rare' ? 4 : rarity === 'epic' ? 15 : 40)));
    add(pick(options), count);
    remaining -= share;
  }

  return {
    source: chest.name,
    chestType: type,
    gold: Math.round(randInt(chest.gold[0], chest.gold[1]) * scale),
    gems: randInt(chest.gems[0], chest.gems[1]),
    cards: [...cards].map(([id, count]) => ({ id, count, isNew: !ownsCard(id) })),
  };
}

function rollRarity() {
  const total = Object.values(RARITIES).reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of Object.values(RARITIES)) {
    roll -= r.weight;
    if (roll <= 0) return r.id;
  }
  return 'common';
}

/** Applies a bundle { gold, gems, cards[], chest? } — chests from bundles are rolled immediately. */
export function applyRewards(bundle) {
  update((s) => {
    s.gold += bundle.gold ?? 0;
    s.gems += bundle.gems ?? 0;
  }, 'reward');
  if (bundle.cards?.length) grantCards(bundle.cards);
}

/** Simple reward spec (from events / pass) → full bundle ready for the reveal modal. */
export function resolveReward(spec) {
  if (spec.chest) return rollChest(spec.chest);
  const bundle = { source: 'Ricompensa', gold: spec.gold ?? 0, gems: spec.gems ?? 0, cards: [] };
  if (spec.cardsRarity) {
    const arena = arenaFor(playerState.trophies).id;
    const options = CARDS.filter((c) => c.rarity === spec.cardsRarity && c.arena <= arena);
    const card = pick(options.length ? options : CARDS.filter((c) => c.rarity === 'common'));
    bundle.cards.push({ id: card.id, count: spec.count ?? 1, isNew: !ownsCard(card.id) });
  }
  return bundle;
}

/** Puts a chest into the first empty slot. Returns slot index or -1 if all full. */
export function awardChest(type) {
  return update((s) => {
    const idx = s.chestSlots.findIndex((slot) => slot === null);
    if (idx >= 0) s.chestSlots[idx] = { type, unlockStartedAt: null, readyAt: null };
    return idx;
  }, 'chests');
}

export const isUnlocking = () => playerState.chestSlots.some((c) => c && c.readyAt && c.readyAt > Date.now());
export const chestReady = (slot) => Boolean(slot?.readyAt && slot.readyAt <= Date.now());
export const readyChestCount = () => playerState.chestSlots.filter(chestReady).length;

export function startUnlock(idx) {
  const slot = playerState.chestSlots[idx];
  if (!slot || slot.readyAt || isUnlocking()) return false;
  update((s) => {
    const now = Date.now();
    s.chestSlots[idx].unlockStartedAt = now;
    s.chestSlots[idx].readyAt = now + CHESTS[slot.type].unlockMs;
  }, 'chests');
  return true;
}

export function chestSkipCost(idx) {
  const slot = playerState.chestSlots[idx];
  if (!slot) return 0;
  const left = slot.readyAt ? slot.readyAt - Date.now() : CHESTS[slot.type].unlockMs;
  return skipCost(left);
}

export function skipChest(idx) {
  const cost = chestSkipCost(idx);
  if (!spend({ gems: cost }, 'chests')) return false;
  update((s) => { s.chestSlots[idx].readyAt = Date.now() - 1; }, 'chests');
  return true;
}

/** Opens a ready chest: removes it from the slot, applies rewards, returns the bundle. */
export function openChestSlot(idx) {
  const slot = playerState.chestSlots[idx];
  if (!chestReady(slot)) return null;
  const bundle = rollChest(slot.type);
  update((s) => { s.chestSlots[idx] = null; }, 'chests');
  applyRewards(bundle);
  return bundle;
}

// ── Season pass ────────────────────────────────────────────────────────────
export const passTier = () => Math.min(PASS.tiers.length, Math.floor(playerState.pass.crowns / PASS.crownsPerTier));

export function claimablePassRewards() {
  const tier = passTier();
  const { claimed, premium } = playerState.pass;
  let n = 0;
  for (let t = 1; t <= tier; t++) {
    if (!claimed.free.includes(t)) n++;
    if (premium && !claimed.premium.includes(t)) n++;
  }
  return n;
}

export function claimPassReward(tier, track) {
  const { pass } = playerState;
  if (tier > passTier() || pass.claimed[track].includes(tier)) return null;
  if (track === 'premium' && !pass.premium) return null;
  const bundle = resolveReward(PASS.tiers[tier - 1][track]);
  update((s) => { s.pass.claimed[track].push(tier); }, 'pass');
  applyRewards(bundle);
  return bundle;
}

// ── Battles ────────────────────────────────────────────────────────────────
/**
 * Applies a ladder battle result. Returns a summary for the result screen.
 * result: { outcome: 'win'|'loss'|'draw', crowns, mode: 'ladder'|'friendly'|'event'|'spectate' }
 */
export function applyBattleResult({ outcome, crowns, mode }) {
  const summary = { trophies: 0, gold: 0, chest: null, chestLost: false, crowns };
  if (mode === 'friendly' || mode === 'spectate') return summary;

  const arena = arenaFor(playerState.trophies);
  update((s) => {
    s.pass.crowns += crowns;
    if (outcome === 'win') s.stats.wins++;
    else if (outcome === 'loss') s.stats.losses++;
    else s.stats.draws++;
    if (crowns === 3) s.stats.threeCrowns++;
  }, 'battle');

  if (mode !== 'ladder') return summary;

  if (outcome === 'win') {
    summary.trophies = randInt(28, 32);
    summary.gold = Math.round(randInt(15, 25) * (1 + arena.id * 0.5));
    const type = CHEST_CYCLE[playerState.chestCycle % CHEST_CYCLE.length];
    const slot = awardChest(type);
    if (slot >= 0) {
      summary.chest = type;
      update((s) => { s.chestCycle++; }, 'chests');
    } else {
      summary.chestLost = true;
    }
  } else if (outcome === 'loss') {
    // Can't drop below the floor of the current arena.
    summary.trophies = -Math.min(randInt(26, 30), Math.max(0, playerState.trophies - arena.min));
  }

  update((s) => {
    s.trophies = Math.max(0, s.trophies + summary.trophies);
    s.bestTrophies = Math.max(s.bestTrophies, s.trophies);
    s.gold += summary.gold;
  }, 'battle');
  if (outcome === 'win') addXp(6 + arena.id * 2);
  return summary;
}

export { MAX_LEVEL };
