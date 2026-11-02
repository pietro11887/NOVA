// Static game content: arenas, chests, shop catalogue, events, season pass, clans, friends.

const H = 3600 * 1000;
const DAY = 24 * H;

export const ARENAS = [
  { id: 0, name: 'Hangar di Addestramento', min: 0,    icon: '🛠️', colors: ['#334155', '#0f172a'] },
  { id: 1, name: 'Cantieri Ruggine',        min: 300,  icon: '🏗️', colors: ['#9a3412', '#431407'] },
  { id: 2, name: 'Giardini delle Spore',    min: 600,  icon: '🍄', colors: ['#3f6212', '#1a2e05'] },
  { id: 3, name: 'Nucleo al Neon',          min: 1000, icon: '🌃', colors: ['#0e7490', '#2e1065'] },
  { id: 4, name: 'Cittadella d\'Ottone',    min: 1500, icon: '🏰', colors: ['#b45309', '#451a03'] },
  { id: 5, name: 'Faglia della Nebulosa',   min: 2200, icon: '🌌', colors: ['#6d28d9', '#1e1b4b'] },
  { id: 6, name: 'Trono Cosmico',           min: 3000, icon: '🪐', colors: ['#a16207', '#1e1b4b'] },
];

export function arenaFor(trophies) {
  let arena = ARENAS[0];
  for (const a of ARENAS) if (trophies >= a.min) arena = a;
  return arena;
}

// Chests. Card amounts scale with arena: cards * (1 + arena * 0.35)
export const CHESTS = {
  common: {
    id: 'common', name: 'Forziere Comune', icon: '📦', unlockMs: 3 * H, color: '#64748b',
    gold: [40, 90], cards: 10, stacks: 3, gems: [0, 0], guaranteed: {}, shopGems: 60,
  },
  rare: {
    id: 'rare', name: 'Forziere Raro', icon: '🎁', unlockMs: 8 * H, color: '#f97316',
    gold: [160, 320], cards: 30, stacks: 4, gems: [0, 6], guaranteed: { rare: 3 }, shopGems: 250,
  },
  cosmic: {
    id: 'cosmic', name: 'Forziere Cosmico', icon: '🔮', unlockMs: 24 * H, color: '#a855f7',
    gold: [900, 1600], cards: 90, stacks: 6, gems: [10, 30], guaranteed: { rare: 12, epic: 4 }, legendaryChance: 0.35, shopGems: 900,
  },
};

/** Order in which battle wins award chests (cycles forever). */
export const CHEST_CYCLE = ['common', 'common', 'rare', 'common', 'common', 'common', 'rare', 'common', 'rare', 'cosmic'];

/** Gems to finish a chest instantly: 1 gem per 6 started minutes (min 1). */
export const skipCost = (msLeft) => Math.max(1, Math.ceil(msLeft / (6 * 60 * 1000)));

export const GOLD_PACKS = [
  { id: 'gold-s', gold: 1000,  gems: 60,   icon: '💰', name: 'Sacchetto d\'Oro' },
  { id: 'gold-m', gold: 10000, gems: 500,  icon: '🪙', name: 'Forziere d\'Oro' },
  { id: 'gold-l', gold: 100000, gems: 4500, icon: '🏦', name: 'Caveau d\'Oro' },
];

export const GEM_PACKS = [
  { id: 'gems-xs', gems: 80,    price: '0,99 €',  icon: '💎', name: 'Manciata di Gemme' },
  { id: 'gems-s',  gems: 500,   price: '4,99 €',  icon: '💎', name: 'Borsa di Gemme', bonus: '+10%' },
  { id: 'gems-m',  gems: 1200,  price: '9,99 €',  icon: '💎', name: 'Scrigno di Gemme', bonus: '+20%' },
  { id: 'gems-l',  gems: 6500,  price: '49,99 €', icon: '💎', name: 'Carro di Gemme', bonus: '+30%', best: true },
];

export const DAILY_DEAL_SLOTS = 3;
export const dayIndex = (t = Date.now()) => Math.floor(t / DAY);
export const nextDayAt = (t = Date.now()) => (dayIndex(t) + 1) * DAY;

// Season pass: crowns earned in battle unlock tiers.
export const PASS = {
  name: 'Nova Pass',
  crownsPerTier: 6,
  premiumGems: 500,
  tiers: Array.from({ length: 20 }, (_, i) => {
    const t = i + 1;
    const free = t % 5 === 0 ? { chest: t === 20 ? 'cosmic' : 'rare' }
      : t % 2 === 0 ? { gold: 100 * t } : { cardsRarity: t > 10 ? 'rare' : 'common', count: 5 + t * 2 };
    const premium = t % 5 === 0 ? { gems: 25 * (t / 5) + 25 }
      : t % 2 === 0 ? { chest: t > 12 ? 'cosmic' : 'rare' } : { gold: 250 * t };
    return { tier: t, free, premium };
  }),
};

/** Season ends at the start of next month (local time). */
export function seasonEndsAt(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
}

// Time-limited events. They run on fixed cycles so the countdown is identical for everyone.
// `cycleDays` = total cycle length, `activeDays` = how long it stays open inside the cycle.
export const EVENTS = [
  {
    id: 'double-elixir-draft',
    name: 'Draft a Doppio Elisir',
    icon: '⚗️',
    colors: ['#db2777', '#4c1d95'],
    desc: 'Componi il mazzo scegliendo una carta tra due, per otto turni. L\'elisir scorre al doppio della velocità per tutta la partita.',
    modifiers: { elixirRate: 2, draft: true, fixedLevel: 9 },
    chips: ['Elisir x2', 'Draft 1 su 2', 'Livelli uguali (9)'],
    entry: { gems: 10, minLevel: 3 },
    maxWins: 12, maxLosses: 3,
    milestones: [
      { wins: 1, reward: { gold: 250 } },
      { wins: 3, reward: { chest: 'rare' } },
      { wins: 6, reward: { gems: 40 } },
      { wins: 9, reward: { gold: 3000 } },
      { wins: 12, reward: { chest: 'cosmic' } },
    ],
    cycleDays: 7, activeDays: 7, offsetDays: 4,   // weekly, rotates Monday 00:00 UTC
  },
  {
    id: 'sudden-death-cosmic',
    name: 'Morte Improvvisa: Arena Cosmica',
    icon: '☠️',
    colors: ['#7c3aed', '#0f172a'],
    desc: 'La prima torre distrutta decide la partita. Elisir x1,5 e una sola sconfitta concessa.',
    modifiers: { elixirRate: 1.5, suddenDeath: true, arenaTheme: 6 },
    chips: ['Prima torre vince', 'Elisir x1,5', '1 sola sconfitta'],
    entry: { gold: 1000, minTrophies: 600 },
    maxWins: 8, maxLosses: 1,
    milestones: [
      { wins: 2, reward: { gold: 1200 } },
      { wins: 4, reward: { chest: 'rare' } },
      { wins: 6, reward: { gems: 80 } },
      { wins: 8, reward: { chest: 'cosmic' } },
    ],
    cycleDays: 3, activeDays: 3, offsetDays: 1,
  },
  {
    id: 'faction-clash',
    name: 'Sfida di Fazione',
    icon: '🏳️',
    colors: ['#0891b2', '#164e63'],
    desc: 'Sfida gratuita: gioca con il tuo mazzo, punta a 5 vittorie prima di 3 sconfitte.',
    modifiers: {},
    chips: ['Ingresso gratuito', 'Il tuo mazzo'],
    entry: { minLevel: 1 },
    maxWins: 5, maxLosses: 3,
    milestones: [
      { wins: 1, reward: { gold: 100 } },
      { wins: 3, reward: { chest: 'common' } },
      { wins: 5, reward: { chest: 'rare' } },
    ],
    cycleDays: 4, activeDays: 3, offsetDays: 0,   // has an off day: shows 'Inizia tra'
  },
];

/** { active, startsAt, endsAt, cycleId } for an event at time t. */
export function eventWindow(event, t = Date.now()) {
  const cycle = event.cycleDays * DAY;
  const base = t - event.offsetDays * DAY;
  const cycleId = Math.floor(base / cycle);
  const start = cycleId * cycle + event.offsetDays * DAY;
  const end = start + event.activeDays * DAY;
  if (t < end) return { active: true, startsAt: start, endsAt: end, cycleId };
  return { active: false, startsAt: start + cycle, endsAt: start + cycle + event.activeDays * DAY, cycleId };
}

export const CLANS = [
  { id: 'clan-neon', name: 'Ordine del Neon', badge: '🔷', members: 38, required: 0, trophies: 41200, desc: 'Attivi ogni giorno, donazioni veloci. Italiani e amici!' },
  { id: 'clan-spore', name: 'Spore Ribelli', badge: '🍄', members: 44, required: 300, trophies: 52900, desc: 'Guerra tra clan ogni settimana. Minimo 300 trofei.' },
  { id: 'clan-brass', name: 'Lega dell\'Ottone', badge: '⚙️', members: 21, required: 0, trophies: 18750, desc: 'Clan tranquillo per chi inizia. Chiedete pure aiuto!' },
  { id: 'clan-void', name: 'Custodi del Vuoto', badge: '🌌', members: 49, required: 1000, trophies: 88400, desc: 'Clan competitivo. Serve esperienza nei tornei.' },
];

export const CLAN_ROLES = ['Capo', 'Co-capo', 'Anziano', 'Membro'];

export const BOT_NAMES = [
  'Luna_Byte', 'Marco88', 'SporeKing', 'Giuly ✦', 'RivetRex', 'Nebula_Fra', 'Ale Cog', 'Davide_X',
  'Sara Void', 'Teo Turbo', 'Chiara🌙', 'Pixel Pino', 'IronMatt', 'Ste_Glitch', 'Vale Mutante', 'Bea Stellare',
];

export const BOT_CHAT = [
  'Qualcuno mi dona un Sciame di Droni? 🙏', 'GG a tutti per la guerra!', 'Appena aperto un Forziere Cosmico 😍',
  'Chi ha voglia di un\'amichevole?', 'Il Titano Mech è troppo forte in questo meta', 'Buongiorno clan ☀️',
  'Ricordatevi di fare le battaglie di guerra!', 'Ho donato tutto quello che potevo 💪', 'Draft a doppio elisir: 9 vittorie!',
  'Qualcuno sa come contrastare la Singolarità?', 'Arrivato al Nucleo al Neon finalmente 🎉', 'Mi serve oro per salire di livello...',
];

export const FRIENDS = [
  { id: 'f1', name: 'Luna_Byte', level: 9,  trophies: 1620, avatar: '🦊', status: 'online' },
  { id: 'f2', name: 'Marco88',   level: 7,  trophies: 1180, avatar: '🐺', status: 'battle' },
  { id: 'f3', name: 'Giuly ✦',   level: 11, trophies: 2410, avatar: '🦄', status: 'online' },
  { id: 'f4', name: 'RivetRex',  level: 5,  trophies: 640,  avatar: '🦖', status: 'offline', lastSeen: 3 * H },
  { id: 'f5', name: 'Nebula_Fra',level: 12, trophies: 3050, avatar: '🐙', status: 'battle' },
  { id: 'f6', name: 'Teo Turbo', level: 3,  trophies: 210,  avatar: '🐸', status: 'offline', lastSeen: 2 * DAY },
];

export const TIME = { H, DAY };
