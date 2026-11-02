// The 32-card database: 4 factions x 8 cards.
// stats are LEVEL-1 values; the arena scales hp/dmg by statMultiplier(level).
//   hp, dmg       hit points / damage per hit (spells: total damage)
//   hitSpeed      seconds between attacks
//   speed         tiles per second (0 = static)
//   range         tiles (<= 1.2 is melee: cannot hit Air units)
//   count         units spawned per deploy
//   radius        spell / splash radius in tiles
//   lifetime      seconds a building lives
//   spawn         { id, every } for Spawner cards

export const FACTIONS = {
  'neo-cyber':     { id: 'neo-cyber',     name: 'Neo-Cyber',     icon: '💠', color: '#22d3ee', accent: '#e879f9', blurb: 'Hacker, droni e scudi olografici. Controllo e velocità.' },
  'bio-mutant':    { id: 'bio-mutant',    name: 'Bio-Mutant',    icon: '🧬', color: '#84cc16', accent: '#facc15', blurb: 'Carne che si divide, acidi e veleni. Logoramento costante.' },
  'steam-punk':    { id: 'steam-punk',    name: 'Steam-Punk',    icon: '⚙️', color: '#f59e0b', accent: '#b45309', blurb: 'Ingranaggi, vapore e corazze. Difese solide e colpi pesanti.' },
  'cosmic-mythos': { id: 'cosmic-mythos', name: 'Cosmic Mythos', icon: '🌌', color: '#a78bfa', accent: '#fde047', blurb: 'Creature stellari e magia del vuoto. Incantesimi devastanti.' },
};

export const RARITIES = {
  common:    { id: 'common',    name: 'Comune',      color: '#94a3b8', startLevel: 1, weight: 70,  cards: [2, 4, 10, 20, 50, 100, 200, 400, 800, 1000, 1500, 3000, 5000] },
  rare:      { id: 'rare',      name: 'Rara',        color: '#fb923c', startLevel: 3, weight: 22,  cards: [2, 4, 10, 20, 50, 100, 200, 400, 500, 750, 1250] },
  epic:      { id: 'epic',      name: 'Epica',       color: '#c084fc', startLevel: 6, weight: 7,   cards: [2, 4, 10, 20, 40, 50, 100, 200] },
  legendary: { id: 'legendary', name: 'Leggendaria', color: '#5eead4', startLevel: 9, weight: 1,   cards: [2, 4, 10, 20, 30] },
};

export const MAX_LEVEL = 14;

export const TYPES = { troop: 'Truppa', spell: 'Incantesimo', building: 'Struttura' };

// Archetype tags: shown as chips in the inspection modal. `sim` = has a real effect in the arena.
export const TAGS = {
  'Air':               { desc: 'Vola: le truppe in mischia non possono colpirla e ignora il fiume.', sim: true },
  'Area':              { desc: 'Colpisce tutto ciò che si trova nel raggio d\'azione.', sim: true },
  'Armored':           { desc: 'Riduce del 20% i danni subiti.', sim: true },
  'Aura Burn':         { desc: 'Brucia costantemente i nemici vicini.', sim: true },
  'Builder':           { desc: 'Costruisce piccole torrette quando viene schierato.' },
  'Burn DOT':          { desc: 'Lascia fiamme che infliggono danni nel tempo.', sim: true },
  'Chain Lightning':   { desc: 'L\'attacco rimbalza su un secondo bersaglio.', sim: true },
  'Death Damage':      { desc: 'Esplode quando viene distrutta.', sim: true },
  'Decoy':             { desc: 'Distrae i nemici attirandone gli attacchi.' },
  'Defensive':         { desc: 'Pensata per difendere la tua metà del campo.' },
  'DOT':               { desc: 'Damage Over Time: danni ripetuti per alcuni secondi.', sim: true },
  'Healer':            { desc: 'Cura le truppe alleate vicine.', sim: true },
  'Hijack':            { desc: 'Rallenta l\'attacco dei bersagli che colpisce.' },
  'Knockback':         { desc: 'Respinge le truppe colpite.', sim: true },
  'Lifesteal':         { desc: 'Recupera vita pari a parte dei danni inflitti.', sim: true },
  'Melee':             { desc: 'Attacca da vicino. Non può colpire le unità aeree.', sim: true },
  'Phasing':           { desc: 'Il primo colpo subito viene ignorato.', sim: true },
  'Pull':              { desc: 'Attira le truppe verso il centro dell\'effetto.', sim: true },
  'Rage on Low HP':    { desc: 'Sotto il 50% di vita attacca il 50% più veloce.', sim: true },
  'Ranged':            { desc: 'Attacca a distanza, anche le unità aeree.', sim: true },
  'Rapid Fire':        { desc: 'Colpi deboli ma frequentissimi.' },
  'Regenerate':        { desc: 'Rigenera vita lentamente.', sim: true },
  'Rewind':            { desc: 'Una volta per vita torna al 50% invece di cadere.', sim: true },
  'Shields':           { desc: 'Uno scudo assorbe i primi danni prima della vita.', sim: true },
  'Spawner':           { desc: 'Genera periodicamente piccole unità.', sim: true },
  'Splash':            { desc: 'I suoi attacchi colpiscono un\'area.', sim: true },
  'Split-on-Death':    { desc: 'Alla morte si divide in due unità più piccole.', sim: true },
  'Stun':              { desc: 'Blocca per un istante i bersagli colpiti.', sim: true },
  'Swarm':             { desc: 'Schiera molte unità deboli insieme.', sim: true },
  'Swift':             { desc: 'Movimento molto rapido.' },
  'Tank':              { desc: 'Tanta vita: assorbe i colpi per le altre truppe.' },
  'Targets Buildings': { desc: 'Ignora le truppe e punta solo strutture e torri.', sim: true },
  'Taunt':             { desc: 'Le truppe vicine sono costrette ad attaccarla.' },
  'Teleport':          { desc: 'Le unità generate compaiono vicino al ponte.' },
};

const c = (id, name, faction, rarity, type, elixir, art, tags, stats, flavor, arena = 0) =>
  ({ id, name, faction, rarity, type, elixir, art, tags, stats, flavor, arena });

export const CARDS = [
  // ── NEO-CYBER ───────────────────────────────────────────────────────────
  c('nc_glitch_runner', 'Glitch Runner', 'neo-cyber', 'common', 'troop', 2, '🏃', ['Swift', 'Melee'],
    { hp: 330, dmg: 95, hitSpeed: 1.0, speed: 1.9, range: 0.8, count: 1 },
    'Salta tra un fotogramma e l\'altro: quando lo vedi, ti ha già colpito.'),
  c('nc_drone_swarm', 'Sciame di Droni', 'neo-cyber', 'common', 'troop', 3, '🛸', ['Swarm', 'Air', 'Ranged'],
    { hp: 90, dmg: 45, hitSpeed: 1.0, speed: 1.6, range: 2.5, count: 4 },
    'Ogni drone pesa meno di un panino. Quaranta droni pesano sui nervi.'),
  c('nc_holo_decoy', 'Esca Olografica', 'neo-cyber', 'common', 'troop', 1, '👤', ['Decoy', 'Taunt', 'Melee'],
    { hp: 260, dmg: 20, hitSpeed: 1.2, speed: 1.4, range: 0.8, count: 1 },
    'Sembra un eroe. È solo luce ben educata.'),
  c('nc_firewall', 'Sentinella Firewall', 'neo-cyber', 'rare', 'building', 4, '🛡️', ['Shields', 'Defensive', 'Ranged'],
    { hp: 900, dmg: 70, hitSpeed: 0.9, speed: 0, range: 5.5, lifetime: 35, shield: 300 },
    'Accesso negato. Anche a te.', 1),
  c('nc_data_lancer', 'Lanciere di Dati', 'neo-cyber', 'rare', 'troop', 4, '⚡', ['Chain Lightning', 'Ranged'],
    { hp: 520, dmg: 120, hitSpeed: 1.4, speed: 1.1, range: 4.5, count: 1 },
    'Trasforma i pacchetti persi in fulmini molto precisi.', 1),
  c('nc_emp_pulse', 'Impulso EMP', 'neo-cyber', 'epic', 'spell', 3, '💥', ['Stun', 'Area'],
    { dmg: 180, radius: 2.8, stun: 1.5 },
    'Il silenzio dopo il ronzio è la parte più spaventosa.', 3),
  c('nc_mech_titan', 'Titano Mech', 'neo-cyber', 'epic', 'troop', 7, '🤖', ['Tank', 'Shields', 'Targets Buildings', 'Melee'],
    { hp: 2600, dmg: 210, hitSpeed: 1.6, speed: 0.8, range: 1.0, count: 1, shield: 500 },
    'Duecento tonnellate di firmware non aggiornato.', 3),
  c('nc_netrunner_queen', 'Regina Netrunner', 'neo-cyber', 'legendary', 'troop', 5, '👑', ['Hijack', 'Ranged'],
    { hp: 760, dmg: 165, hitSpeed: 1.1, speed: 1.1, range: 5.0, count: 1 },
    'Non ha mai bussato a una porta. Le porte si aprono da sole.', 4),

  // ── BIO-MUTANT ──────────────────────────────────────────────────────────
  c('bm_spore_crawler', 'Strisciaspore', 'bio-mutant', 'common', 'troop', 2, '🐛', ['Split-on-Death', 'Melee'],
    { hp: 300, dmg: 70, hitSpeed: 1.1, speed: 1.1, range: 0.8, count: 1 },
    'Tagliarlo in due è esattamente quello che vuole.'),
  c('bm_acid_spitter', 'Sputacido', 'bio-mutant', 'common', 'troop', 3, '🦎', ['DOT', 'Ranged'],
    { hp: 380, dmg: 60, hitSpeed: 1.3, speed: 1.1, range: 4.5, count: 1, dot: 15 },
    'Ha un debole per le armature lucide. Le preferisce sciolte.'),
  c('bm_brute', 'Bruto Mutante', 'bio-mutant', 'rare', 'troop', 5, '🦍', ['Tank', 'Rage on Low HP', 'Melee'],
    { hp: 1650, dmg: 160, hitSpeed: 1.5, speed: 0.9, range: 1.0, count: 1 },
    'Più lo colpisci, più ti ricorda il perché non avresti dovuto.'),
  c('bm_toxic_cloud', 'Nube Tossica', 'bio-mutant', 'rare', 'spell', 3, '☁️', ['DOT', 'Area'],
    { dmg: 300, radius: 3.0, duration: 4 },
    'Profuma di palude e di cattive decisioni.'),
  c('bm_hive_nest', 'Nido Alveare', 'bio-mutant', 'rare', 'building', 5, '🪺', ['Spawner', 'Defensive'],
    { hp: 1000, dmg: 0, hitSpeed: 0, speed: 0, range: 0, lifetime: 40, spawn: { id: 'bm_spore_crawler', every: 6 } },
    'Qualcosa dentro bussa. Molte cose, in realtà.', 2),
  c('bm_leech', 'Sanguisuga', 'bio-mutant', 'epic', 'troop', 2, '🪱', ['Lifesteal', 'Swift', 'Melee'],
    { hp: 360, dmg: 110, hitSpeed: 0.9, speed: 1.6, range: 0.8, count: 1 },
    'Restituisce sempre ciò che prende. A sé stessa.', 2),
  c('bm_hydra', 'Idra di Palude', 'bio-mutant', 'epic', 'troop', 6, '🐍', ['Split-on-Death', 'Regenerate', 'Splash', 'Melee'],
    { hp: 1700, dmg: 140, hitSpeed: 1.4, speed: 0.9, range: 1.2, radius: 1.2, count: 1 },
    'Taglia una testa e ne spuntano due, entrambe arrabbiate.', 4),
  c('bm_brood_mother', 'Madre della Covata', 'bio-mutant', 'legendary', 'troop', 6, '🕷️', ['Spawner', 'Split-on-Death', 'Ranged'],
    { hp: 1200, dmg: 90, hitSpeed: 1.2, speed: 0.9, range: 3.5, count: 1, spawn: { id: 'bm_spore_crawler', every: 7 } },
    'Una famiglia numerosa, e tutti hanno fame.', 5),

  // ── STEAM-PUNK ──────────────────────────────────────────────────────────
  c('sp_cog_soldier', 'Soldato a Ingranaggi', 'steam-punk', 'common', 'troop', 3, '⚙️', ['Armored', 'Melee'],
    { hp: 700, dmg: 105, hitSpeed: 1.2, speed: 1.0, range: 0.9, count: 1 },
    'Ricaricato a molla, ogni mattina alle sei in punto.'),
  c('sp_rivet_gunner', 'Mitragliere a Rivetti', 'steam-punk', 'common', 'troop', 3, '🔩', ['Rapid Fire', 'Ranged'],
    { hp: 340, dmg: 32, hitSpeed: 0.35, speed: 1.1, range: 5.0, count: 1 },
    'Spara rivetti più in fretta di quanto li possa costruire.'),
  c('sp_boiler_bomb', 'Bomba a Caldaia', 'steam-punk', 'common', 'spell', 2, '💣', ['Area', 'Knockback'],
    { dmg: 200, radius: 2.2, knockback: 1.2 },
    'Il manometro era nel rosso. Ora non c\'è più neanche il manometro.'),
  c('sp_pressure_turret', 'Torretta a Pressione', 'steam-punk', 'rare', 'building', 4, '🏭', ['Defensive', 'Splash', 'Ranged'],
    { hp: 850, dmg: 90, hitSpeed: 1.1, speed: 0, range: 5.5, radius: 1.0, lifetime: 35 },
    'Un fischio, una nuvola di vapore, e il silenzio.', 1),
  c('sp_sky_zeppelin', 'Zeppelin Corazzato', 'steam-punk', 'rare', 'troop', 5, '🎈', ['Air', 'Targets Buildings', 'Death Damage', 'Ranged'],
    { hp: 1250, dmg: 230, hitSpeed: 2.0, speed: 0.75, range: 1.5, count: 1, deathDmg: 260 },
    'Lento, enorme, e decisamente infiammabile.', 2),
  c('sp_clockwork_knight', 'Cavaliere a Orologeria', 'steam-punk', 'epic', 'troop', 4, '🕰️', ['Shields', 'Rewind', 'Melee'],
    { hp: 820, dmg: 135, hitSpeed: 1.2, speed: 1.1, range: 1.0, count: 1, shield: 200 },
    'Quando cade, il tempo torna indietro di qualche secondo. Solo per lui.', 3),
  c('sp_ironclad_walker', 'Camminatore Ferroblindo', 'steam-punk', 'epic', 'troop', 8, '🦾', ['Tank', 'Targets Buildings', 'Death Damage', 'Armored', 'Melee'],
    { hp: 3400, dmg: 230, hitSpeed: 2.2, speed: 0.6, range: 1.0, count: 1, deathDmg: 300 },
    'Ogni passo è un terremoto programmato.', 5),
  c('sp_mad_inventor', 'Inventore Folle', 'steam-punk', 'legendary', 'troop', 4, '🎩', ['Builder', 'Ranged', 'Splash'],
    { hp: 600, dmg: 120, hitSpeed: 1.4, speed: 1.0, range: 4.5, radius: 1.0, count: 1 },
    '"Funzionerà al primo colpo." Non ha mai funzionato al primo colpo.', 4),

  // ── COSMIC MYTHOS ───────────────────────────────────────────────────────
  c('cm_star_sprite', 'Folletto Stellare', 'cosmic-mythos', 'common', 'troop', 1, '✨', ['Air', 'Swift', 'Ranged'],
    { hp: 160, dmg: 60, hitSpeed: 1.0, speed: 1.8, range: 2.5, count: 1 },
    'Un briciolo di stella caduto apposta.'),
  c('cm_void_wraith', 'Spettro del Vuoto', 'cosmic-mythos', 'common', 'troop', 3, '👻', ['Phasing', 'Melee'],
    { hp: 520, dmg: 115, hitSpeed: 1.1, speed: 1.3, range: 0.9, count: 1 },
    'Il primo colpo lo attraversa. Il secondo, di solito, non arriva.'),
  c('cm_moon_oracle', 'Oracolo Lunare', 'cosmic-mythos', 'rare', 'troop', 4, '🌙', ['Healer', 'Ranged'],
    { hp: 560, dmg: 75, hitSpeed: 1.3, speed: 1.0, range: 4.0, count: 1, heal: 40 },
    'Ha già visto come finisce questa battaglia. Sorride, e non dice niente.', 1),
  c('cm_comet_strike', 'Colpo di Cometa', 'cosmic-mythos', 'rare', 'spell', 4, '☄️', ['Area', 'Burn DOT'],
    { dmg: 380, radius: 2.5, burn: 80 },
    'Esprimi un desiderio. Rapidamente.', 1),
  c('cm_nebula_gate', 'Portale Nebulare', 'cosmic-mythos', 'epic', 'building', 4, '🌀', ['Spawner', 'Teleport'],
    { hp: 750, dmg: 0, hitSpeed: 0, speed: 0, range: 0, lifetime: 30, spawn: { id: 'cm_star_sprite', every: 4 } },
    'Dall\'altra parte c\'è sempre qualcuno che vuole entrare.', 2),
  c('cm_astral_serpent', 'Serpente Astrale', 'cosmic-mythos', 'epic', 'troop', 6, '🐉', ['Air', 'Splash', 'Ranged'],
    { hp: 1350, dmg: 150, hitSpeed: 1.6, speed: 1.0, range: 3.0, radius: 1.3, count: 1 },
    'Si avvolge attorno alle costellazioni per dormire.', 5),
  c('cm_solar_titan', 'Titano Solare', 'cosmic-mythos', 'legendary', 'troop', 7, '🌞', ['Tank', 'Aura Burn', 'Melee'],
    { hp: 2900, dmg: 180, hitSpeed: 1.5, speed: 0.8, range: 1.0, count: 1, aura: 30 },
    'Avvicinarsi è un errore. Toccarlo è l\'ultimo.', 6),
  c('cm_singularity', 'Singolarità', 'cosmic-mythos', 'legendary', 'spell', 5, '🕳️', ['Pull', 'Area', 'DOT'],
    { dmg: 420, radius: 3.2, duration: 3 },
    'Tutto ciò che entra, resta. Anche la luce, anche le scuse.', 6),
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((card) => [card.id, card]));
export const getCard = (id) => CARD_BY_ID[id];

/** Stats grow 10% per level above 1. */
export const statMultiplier = (level) => Math.pow(1.1, level - 1);

/** Cards needed / gold needed to go from `level` to `level + 1` (null at max). */
export const GOLD_BY_LEVEL = [0, 5, 20, 50, 150, 400, 1000, 2000, 4000, 8000, 15000, 35000, 75000, 100000];

export function upgradeCost(card, level) {
  if (level >= MAX_LEVEL) return null;
  const r = RARITIES[card.rarity];
  const idx = level - r.startLevel;
  const cards = r.cards[idx];
  if (cards == null) return null;
  return { cards, gold: GOLD_BY_LEVEL[level] };
}

export const upgradeXp = (level) => 4 + level * level * 3;
