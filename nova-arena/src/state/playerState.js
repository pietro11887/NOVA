// Global player state: a single mutable object, changed only through update(),
// persisted to localStorage and broadcast to subscribers (top bar, nav badges, active screen).

import { getCard, RARITIES } from '../data/cards.js';
import { FRIENDS } from '../data/catalog.js';

const SAVE_KEY = 'nova-arena.save';
const SAVE_VERSION = 1;

export const STARTER_DECK = [
  'nc_glitch_runner', 'nc_drone_swarm', 'bm_spore_crawler', 'bm_acid_spitter',
  'sp_cog_soldier', 'sp_boiler_bomb', 'cm_void_wraith', 'cm_star_sprite',
];

const STARTER_EXTRAS = [
  'nc_holo_decoy', 'sp_rivet_gunner', 'bm_brute', 'bm_toxic_cloud',
  'nc_firewall', 'sp_pressure_turret', 'cm_moon_oracle', 'cm_comet_strike',
];

function createDefaultState() {
  const now = Date.now();
  const cards = {};
  for (const id of [...STARTER_DECK, ...STARTER_EXTRAS]) {
    const card = getCard(id);
    const start = RARITIES[card.rarity].startLevel;
    cards[id] = { level: start, count: card.rarity === 'common' ? 3 : 1 };
  }
  return {
    v: SAVE_VERSION,
    createdAt: now,
    name: 'Comandante',
    tag: '#NV' + Math.random().toString(36).slice(2, 7).toUpperCase(),
    level: 1,
    xp: 0,
    gold: 1500,
    gems: 150,
    trophies: 0,
    bestTrophies: 0,
    stats: { wins: 0, losses: 0, draws: 0, threeCrowns: 0, cardsDonated: 0 },
    cards,                  // unlocked cards: { [id]: { level, count } }
    deck: [...STARTER_DECK],
    chestSlots: [
      { type: 'common', unlockStartedAt: null, readyAt: null },
      { type: 'rare', unlockStartedAt: null, readyAt: null },
      null,
      null,
    ],
    chestCycle: 0,
    pass: { crowns: 0, premium: false, claimed: { free: [], premium: [] }, season: seasonKey() },
    shop: { day: 0, bought: [] },
    events: {},             // { [eventId]: { cycleId, entered, wins, losses, rewarded: [], deck } }
    clan: null,             // { id, name, badge, role, joinedAt, chat: [], lastRequestAt }
    friends: FRIENDS.map((f) => ({ ...f })),
    settings: { sound: true },
  };
}

function seasonKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.v !== SAVE_VERSION) return null;
    // Forward-compatible merge: fields added later get their defaults.
    return { ...createDefaultState(), ...data };
  } catch {
    return null;
  }
}

function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(playerState));
  } catch {
    /* private mode / quota: the session keeps working in memory */
  }
}

export const playerState = load() ?? createDefaultState();

// New season → reset pass progress.
if (playerState.pass.season !== seasonKey()) {
  playerState.pass = { crowns: 0, premium: false, claimed: { free: [], premium: [] }, season: seasonKey() };
}

const listeners = new Set();

/** subscribe((state, reason) => …) → unsubscribe() */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The only way to change state. `mutator` edits the object in place and may return a value,
 * which update() passes back. `reason` is a short string screens can use to decide what to redraw.
 */
export function update(mutator, reason = 'change') {
  const result = mutator(playerState);
  persist();
  for (const fn of listeners) fn(playerState, reason);
  return result;
}

export function resetState() {
  const fresh = createDefaultState();
  update((s) => {
    for (const key of Object.keys(s)) delete s[key];
    Object.assign(s, fresh);
  }, 'reset');
}

// Debug handle in the console: novaState.playerState, novaState.update(s => s.gems += 1000)
window.novaState = { playerState, update, resetState };
