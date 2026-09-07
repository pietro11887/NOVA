import * as THREE from 'three';
import { GeoBuilder, clamp, rand, randInt, pick, mulberry32 } from '../core/utils.js';
import { makeCharacter, animateCharacter } from './models.js';
import { interiorTextures } from './textures.js';

const ORIGIN = { x: 0, z: 4000 };   // gli interni vivono lontano dalla citta'
const W = 18, D = 15, H = 3.5;      // stanza standard
const HALF_W = W / 2, HALF_D = D / 2;

/* --------------------------------------------------------------- cataloghi */

import { WEAPONS, WEAPON_ORDER, isGun } from '../core/weapons.js';

export const SHOP_MENUS = {
  casino: {
    title: 'CASINÒ NOVA', desc: 'Slot, roulette e blackjack. Il banco ringrazia.',
    items: [
      { id: 'chips', icon: '🎲', name: 'Vai ai tavoli', desc: 'Apri il casinò', price: 0, effect: (g) => g.openCasino('slot') },
    ],
  },
  burger: {
    title: 'BURGER SHOT', desc: 'Doppio cheese e patatine. La salute passa dallo stomaco.',
    items: [
      { id: 'burger', icon: '🍔', name: 'Doppio Cheese', desc: '+35 salute', price: 12, effect: (g) => g.player.heal(35) },
      { id: 'menu', icon: '🍟', name: 'Menu completo', desc: 'Salute al massimo', price: 28, effect: (g) => g.player.heal(100) },
      { id: 'cola', icon: '🥤', name: 'Cola gigante', desc: '+12 salute', price: 5, effect: (g) => g.player.heal(12) },
    ],
  },
  pharmacy: {
    title: 'FARMACIA 24H', desc: 'Kit medici e integratori. Aperto anche di notte.',
    items: [
      { id: 'medkit', icon: '🩹', name: 'Kit medico', desc: 'Salute al massimo', price: 60, effect: (g) => g.player.heal(100) },
      { id: 'pills', icon: '💊', name: 'Antidolorifici', desc: '+45 salute', price: 30, effect: (g) => g.player.heal(45) },
      { id: 'vest', icon: '🦺', name: 'Giubbotto leggero', desc: '+35 armatura', price: 90, effect: (g) => g.player.addArmor(35) },
    ],
  },
  store: {
    title: 'MINI MARKET', desc: 'Di tutto un po\'. La cassa è dietro il bancone…',
    items: [
      { id: 'snack', icon: '🥪', name: 'Panino', desc: '+18 salute', price: 7, effect: (g) => g.player.heal(18) },
      { id: 'coffee', icon: '☕', name: 'Caffè', desc: '+10 salute', price: 3, effect: (g) => g.player.heal(10) },
      { id: 'rob', icon: '💰', name: 'Svuota la cassa', desc: 'Guadagno rapido, polizia allertata', price: 0,
        effect: (g) => { g.player.earn(180 + Math.floor(Math.random() * 320)); g.addWanted(2, 'rapina'); g.toast('Rapina! La polizia ti cerca', 'bad'); } },
    ],
  },
  ammu: {
    title: 'AMMU NOVA', desc: 'Protezione personale, tutto regolare (quasi).',
    // le voci delle armi le costruisce buildAmmuMenu() dall'arsenale
    items: [
      { id: 'armor', icon: '🛡️', name: 'Giubbotto antiproiettile', desc: 'Armatura al massimo', price: 180,
        effect: (g) => g.player.addArmor(100) },
    ],
  },
  clothes: {
    title: 'THREADS', desc: 'Cambia look: la polizia dimentica più in fretta.',
    items: [
      { id: 'street', icon: '👕', name: 'Look street', desc: 'Nuovo outfit', price: 80, effect: (g) => g.dressPlayer(0x2f6fd0, 0x2b2f38) },
      { id: 'suit', icon: '🕴️', name: 'Completo elegante', desc: 'Nuovo outfit', price: 240, effect: (g) => g.dressPlayer(0x1a1d24, 0x101319) },
      { id: 'lay', icon: '🧢', name: 'Cambio d\'abito rapido', desc: 'Azzera il livello di sospetto', price: 300,
        effect: (g) => { g.setWanted(0); g.toast('Sei irriconoscibile', 'good'); } },
    ],
  },
  bar: {
    title: 'BAR LUNA', desc: 'Musica alta e prezzi onesti.',
    items: [
      { id: 'beer', icon: '🍺', name: 'Birra', desc: '+15 salute', price: 8, effect: (g) => g.player.heal(15) },
      { id: 'dinner', icon: '🍝', name: 'Cena', desc: '+50 salute', price: 35, effect: (g) => g.player.heal(50) },
      { id: 'job', icon: '📋', name: 'Chiedi un lavoretto', desc: 'Avvia una missione', price: 0, effect: (g) => g.missions.offerFromBar() },
    ],
  },
  garage: {
    title: 'GARAGE PIT', desc: 'Meccanica, vernice, cerchi e qualche domanda in meno.',
    items: [
      { id: 'repair', icon: '🔧', name: 'Riparazione completa', desc: 'Raddrizza la lamiera e rimette i vetri', price: 120,
        effect: (g) => { g.repairLastCar(); } },
      { id: 'paint', icon: '🎨', name: 'Riverniciatura', desc: 'Colore nuovo e la polizia ti perde', price: 220,
        effect: (g) => g.repaintCar() },
      { id: 'rims', icon: '⚙️', name: 'Cerchi nuovi', desc: 'Cromati, neri opachi o bronzo', price: 260,
        effect: (g) => g.nextRims() },
      { id: 'sport', icon: '🏎️', name: 'Coupé sportiva', desc: 'Consegnata fuori dal garage', price: 2500, effect: (g) => g.deliverCar('sport') },
      { id: 'suv', icon: '🚙', name: 'SUV', desc: 'Consegnato fuori dal garage', price: 1400, effect: (g) => g.deliverCar('suv') },
    ],
  },
  diner: {
    title: 'TAVOLA CALDA', desc: 'Colazione tutto il giorno, caffè sempre caldo.',
    items: [
      { id: 'breakfast', icon: '🥞', name: 'Colazione completa', desc: 'Salute al massimo', price: 22, effect: (g) => g.player.heal(100) },
      { id: 'steak', icon: '🥩', name: 'Bistecca e patate', desc: '+60 salute', price: 34, effect: (g) => g.player.heal(60) },
      { id: 'coffee2', icon: '☕', name: 'Caffè americano', desc: '+12 salute', price: 4, effect: (g) => g.player.heal(12) },
      { id: 'tip', icon: '🎵', name: 'Metti una moneta nel jukebox', desc: 'Cambia stazione radio', price: 2,
        effect: (g) => g.radio.change(1) },
    ],
  },
  gym: {
    title: 'IRON NOVA', desc: 'Ferro e sudore. Qui la salute te la guadagni.',
    items: [
      { id: 'workout', icon: '🏋️', name: 'Allenamento', desc: 'Salute massima +10 (fino a 150)', price: 60,
        effect: (g) => { g.player.maxHealth = Math.min(150, (g.player.maxHealth || 100) + 10); g.player.heal(100); } },
      { id: 'bag', icon: '🥊', name: 'Sacco da boxe', desc: 'Pugni piu\' forti', price: 240,
        effect: (g) => { g.player.punchBonus = Math.min(30, (g.player.punchBonus || 0) + 10); } },
      { id: 'shake', icon: '🥤', name: 'Frullato proteico', desc: '+40 salute', price: 14, effect: (g) => g.player.heal(40) },
    ],
  },
  bank: {
    title: 'BANCA DI NOVA', desc: 'Deposita i contanti: se ti stendono non li perdi.',
    items: [
      { id: 'deposit', icon: '🏦', name: 'Deposita metà dei contanti', desc: 'Al sicuro dal caveau', price: 0,
        effect: (g) => g.bankDeposit() },
      { id: 'withdraw', icon: '💵', name: 'Preleva tutto', desc: 'Torna in tasca', price: 0, effect: (g) => g.bankWithdraw() },
      { id: 'heist', icon: '💰', name: 'Svuota il caveau', desc: 'Bottino grosso, polizia peggio', price: 0,
        effect: (g) => g.bankHeist() },
    ],
  },
  club: {
    title: 'CLUB VELVET', desc: 'Musica alta, luci basse, nessuna domanda.',
    items: [
      { id: 'drink', icon: '🍸', name: 'Cocktail della casa', desc: '+30 salute', price: 18, effect: (g) => g.player.heal(30) },
      { id: 'vip', icon: '✨', name: 'Tavolo VIP', desc: 'Ti fai notare: la polizia ti dimentica', price: 400,
        effect: (g) => { g.setWanted(0); g.police.standDown(); g.toast('Sei sparito nella folla', 'good'); } },
      { id: 'dance', icon: '🕺', name: 'Balla un po\'', desc: 'Passa il tempo', price: 0,
        effect: (g) => { g.clock += 2; g.player.heal(15); } },
    ],
  },
  office: {
    title: 'NOVA CONSULTING', desc: 'Lavoro pulito, buste pesanti.',
    items: [
      { id: 'job', icon: '📁', name: 'Prendi un incarico', desc: 'Avvia una missione', price: 0, effect: (g) => g.missions.offerFromBar() },
      { id: 'wire', icon: '💳', name: 'Riscuoti una fattura', desc: 'Guadagno onesto, una volta ogni tanto', price: 0,
        effect: (g) => g.officeInvoice() },
    ],
  },
  barber: {
    title: 'BARBIERE DA VITO', desc: 'Taglio, barba e una faccia nuova.',
    items: [
      { id: 'cut', icon: '💈', name: 'Taglio e barba', desc: 'Nuovo look, la polizia fatica a riconoscerti', price: 60,
        effect: (g) => { g.dressPlayer(Math.random() * 0xffffff | 0, Math.random() * 0xffffff | 0); g.setWanted(Math.max(0, g.wanted - 1)); } },
      { id: 'shave', icon: '🪒', name: 'Solo barba', desc: '+15 salute, ti rilassa', price: 20, effect: (g) => g.player.heal(15) },
    ],
  },
  home: {
    title: 'CASA', desc: 'Il tuo appartamento. Dormi per salvare la partita.',
    items: [
      { id: 'sleep', icon: '🛏️', name: 'Dormi fino al mattino', desc: 'Salva, cura e azzera il sospetto', price: 0,
        effect: (g) => { g.player.heal(100); g.setWanted(0); g.clock = 7.5; g.save(); g.toast('Partita salvata', 'good'); } },
      { id: 'tv', icon: '📺', name: 'Guarda la TV', desc: 'Passa il tempo', price: 0, effect: (g) => { g.clock += 3; g.player.heal(10); } },
      { id: 'wardrobe', icon: '👔', name: 'Cambia vestiti', desc: 'Nuovo outfit', price: 0,
        effect: (g) => g.dressPlayer(Math.random() * 0xffffff | 0, Math.random() * 0xffffff | 0) },
    ],
  },
};

/** Stile di ogni locale: pavimento, pareti, luce. */
const STYLE = {
  burger:   { floor: 'checker', wall: 0xf3e2c8, trim: 0xc0392b, light: 0xfff0d0, glow: 0xff7a3d },
  pharmacy: { floor: 'tile',    wall: 0xeaf4ee, trim: 0x3ddc84, light: 0xf2ffff, glow: 0x3ddc84 },
  store:    { floor: 'tile',    wall: 0xe6ebef, trim: 0x4cc2ff, light: 0xf6fbff, glow: 0x4cc2ff },
  ammu:     { floor: 'concrete',wall: 0x6b6f76, trim: 0xff4d5e, light: 0xffe9c9, glow: 0xff4d5e },
  clothes:  { floor: 'wood',    wall: 0xf6eef4, trim: 0xe46bff, light: 0xfff4ff, glow: 0xe46bff },
  bar:      { floor: 'wood',    wall: 0x7a5b46, trim: 0xffd23f, light: 0xffd9a0, glow: 0xffd23f },
  garage:   { floor: 'concrete',wall: 0x9aa3ad, trim: 0xffb020, light: 0xf0f4ff, glow: 0xffb020 },
  home:     { floor: 'wood',    wall: 0xe8dcc6, trim: 0x8a6a44, light: 0xffe9c0, glow: 0xffd9a0 },
  casino:   { floor: 'carpet',  wall: 0x3a1830, trim: 0xffd23f, light: 0xffdca0, glow: 0xffd23f },
  diner:    { floor: 'tile',    wall: 0xf2e6d8, trim: 0xd0342c, light: 0xfff0d8, glow: 0xff7a3d },
  gym:      { floor: 'concrete',wall: 0x2f343c, trim: 0x3ddc84, light: 0xeaf6ff, glow: 0x3ddc84 },
  bank:     { floor: 'tile',    wall: 0xdfe6ec, trim: 0x2f6fd0, light: 0xf4faff, glow: 0x2f6fd0 },
  club:     { floor: 'carpet',  wall: 0x1a1024, trim: 0xe46bff, light: 0xd0a0ff, glow: 0xe46bff },
  office:   { floor: 'carpet',  wall: 0xe4e8ee, trim: 0x8a94a0, light: 0xf6f9ff, glow: 0x4cc2ff },
  barber:   { floor: 'tile',    wall: 0xeae2d4, trim: 0xc02c3a, light: 0xfff4e4, glow: 0xffd23f },
};

/* ------------------------------------------------------------- arredamento */

/** Scaffale con ripiani e merce colorata. */
function shelf(B, x, z, w, d, h, rot, rng, dense = true) {
  const wood = B.wood, prod = B.prod;
  wood.box(x, h / 2, z, w, 0.08, d, 0xb9b3a6, 0, rot);          // fianco superiore
  wood.box(x, 0.05, z, w, 0.1, d, 0x8f8a80, 0, rot);
  const shelves = Math.max(2, Math.round(h / 0.55));
  for (let i = 1; i <= shelves; i++) {
    const y = (h / (shelves + 1)) * i;
    wood.box(x, y, z, w, 0.05, d, 0xcac4b6, 0, rot);
    if (!dense) continue;
    const n = Math.max(2, Math.floor(w / 0.32));
    for (let k = 0; k < n; k++) {
      if (rng() < 0.15) continue;
      const off = (k - (n - 1) / 2) * (w / n);
      const px = x + Math.cos(rot) * off, pz = z - Math.sin(rot) * off;
      const ph = 0.16 + rng() * 0.2;
      prod.box(px, y + 0.03 + ph / 2, pz, w / n * 0.8, ph, d * 0.6, pick(
        [0xd94f4f, 0x2f8fb8, 0xe0a92c, 0x4caf50, 0xe0e0e0, 0x8a4fbf, 0xff7a3d, 0x2b2f38]), 0, rot);
    }
  }
  // montanti
  for (const s of [-1, 1]) {
    wood.box(x + Math.cos(rot) * s * w / 2, h / 2, z - Math.sin(rot) * s * w / 2, 0.06, h, d, 0x9a948a, 0, rot);
  }
  B.solid.push({ x, z, hx: Math.abs(Math.cos(rot)) * w / 2 + Math.abs(Math.sin(rot)) * d / 2 + 0.05,
                 hz: Math.abs(Math.sin(rot)) * w / 2 + Math.abs(Math.cos(rot)) * d / 2 + 0.05 });
}

/** Bancone con piano e zoccolo. */
function counter(B, x, z, w, d, color, trim) {
  B.wood.box(x, 0.52, z, w, 1.04, d, color);
  B.wood.box(x, 1.08, z, w + 0.16, 0.09, d + 0.16, 0xe8e4dc);
  B.metal.box(x, 0.06, z, w + 0.1, 0.12, d + 0.1, trim);
  B.solid.push({ x, z, hx: w / 2 + 0.12, hz: d / 2 + 0.12 });
}

function stool(B, x, z) {
  B.metal.box(x, 0.35, z, 0.09, 0.7, 0.09, 0x9aa0a6);
  B.metal.box(x, 0.03, z, 0.42, 0.06, 0.42, 0x81878d);
  B.wood.box(x, 0.74, z, 0.44, 0.09, 0.44, 0x8a4a2f);
}

function chair(B, x, z, rot, color = 0x6b4a34) {
  B.wood.box(x, 0.45, z, 0.44, 0.06, 0.44, color, 0, rot);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.wood.box(x + Math.cos(rot) * sx * 0.18 - Math.sin(rot) * sz * 0.18, 0.22,
      z - Math.sin(rot) * sx * 0.18 - Math.cos(rot) * sz * 0.18, 0.05, 0.45, 0.05, color);
  }
  B.wood.box(x - Math.cos(rot) * 0.2, 0.72, z + Math.sin(rot) * 0.2, 0.08, 0.55, 0.44, color, 0, rot);
}

function table(B, x, z, r = 0.55, color = 0x8a5a3a) {
  B.wood.box(x, 0.74, z, r * 2, 0.08, r * 2, color);
  B.metal.box(x, 0.37, z, 0.12, 0.74, 0.12, 0x81878d);
  B.metal.box(x, 0.03, z, 0.5, 0.06, 0.5, 0x81878d);
  B.solid.push({ x, z, hx: r, hz: r });
}

function fridge(B, x, z, rot, rng) {
  B.metal.box(x, 1.05, z, 0.8, 2.1, 1.0, 0xd8dce0, 0, rot);
  B.glass.box(x + Math.cos(rot) * 0.36, 1.15, z - Math.sin(rot) * 0.36, 0.1, 1.6, 0.86, 0x9fd6e8, 0, rot);
  for (let i = 0; i < 4; i++) {
    const y = 0.45 + i * 0.42;
    B.prod.box(x + Math.cos(rot) * 0.1, y, z - Math.sin(rot) * 0.1, 0.4, 0.3, 0.8,
      pick([0xd94f4f, 0x2f8fb8, 0x4caf50, 0xe0a92c]), 0, rot);
  }
  B.glowB.box(x + Math.cos(rot) * 0.3, 1.15, z - Math.sin(rot) * 0.3, 0.02, 1.5, 0.8, 0x4cc2ff, 0, rot);
  B.solid.push({ x, z, hx: 0.55, hz: 0.55 });
}

function plant(B, x, z) {
  B.wood.box(x, 0.22, z, 0.45, 0.44, 0.45, 0x8a5a3a);
  B.leaf.box(x, 0.75, z, 0.7, 0.7, 0.7, 0x3f7a34);
  B.leaf.box(x, 1.15, z, 0.5, 0.6, 0.5, 0x4a8f3d);
  B.solid.push({ x, z, hx: 0.3, hz: 0.3 });
}

/* ------------------------------------------------------------------ stanza */

class Interior {
  constructor(type, mats) {
    this.type = type;
    this.mats = mats;
    this.group = new THREE.Group();
    this.boxes = [];
    this.limit = Infinity;
    const st = STYLE[type] || STYLE.store;
    const rng = mulberry32(type.length * 7717 + 11);

    const B = {};
    for (const k of ['wall', 'floor', 'wood', 'metal', 'prod', 'glass', 'leaf', 'glowB', 'trim']) B[k] = new GeoBuilder();
    B.solid = this.boxes;
    this.B = B;

    const ox = ORIGIN.x, oz = ORIGIN.z;
    this.ox = ox; this.oz = oz;

    // --- involucro
    B.floor.quadY(ox - HALF_W, oz - HALF_D, ox + HALF_W, oz + HALF_D, 0, 0xffffff, W / 4, D / 4);
    const UV = 1 / 3;   // intonaco: una piastrella ogni 3 metri
    B.wall.box(ox, H + 0.1, oz, W, 0.2, D, 0xf6f6f3, UV);                   // soffitto
    B.wall.box(ox, H / 2, oz - HALF_D, W, H, 0.3, st.wall, UV);             // fondo
    B.wall.box(ox - HALF_W, H / 2, oz, 0.3, H, D, st.wall, UV);
    B.wall.box(ox + HALF_W, H / 2, oz, 0.3, H, D, st.wall, UV);
    // parete d'ingresso con vetrina
    B.wall.box(ox - W / 4 - 1.6, H / 2, oz + HALF_D, W / 2 - 3.2, H, 0.3, st.wall, UV);
    B.wall.box(ox + W / 4 + 1.6, H / 2, oz + HALF_D, W / 2 - 3.2, H, 0.3, st.wall, UV);
    B.wall.box(ox, H - 0.45, oz + HALF_D, 6.4, 0.9, 0.3, st.wall, UV);
    // vetrina luminosa: fa entrare "la strada" senza mostrarla
    B.glowB.box(ox, 1.6, oz + HALF_D - 0.06, 6.2, 2.4, 0.06, 0xfff6e2);
    B.metal.box(ox, 1.6, oz + HALF_D - 0.02, 0.12, 2.5, 0.14, 0x6f7276);
    B.metal.box(ox, 0.2, oz + HALF_D - 0.05, 6.4, 0.4, 0.2, 0x6f7276);
    // porta (chiusa: si esce col trigger)
    B.wood.box(ox + 2.2, 1.15, oz + HALF_D - 0.16, 1.6, 2.3, 0.12, 0x5a4232);
    B.metal.box(ox + 1.6, 1.1, oz + HALF_D - 0.24, 0.1, 0.5, 0.06, 0xc9ccd2);
    // battiscopa e fascia decorativa
    B.trim.box(ox, 0.06, oz - HALF_D + 0.2, W, 0.12, 0.16, st.trim);
    B.trim.box(ox - HALF_W + 0.2, 0.06, oz, 0.16, 0.12, D, st.trim);
    B.trim.box(ox + HALF_W - 0.2, 0.06, oz, 0.16, 0.12, D, st.trim);
    B.trim.box(ox, 2.4, oz - HALF_D + 0.18, W, 0.1, 0.12, st.trim);

    // muri come collisori
    this.boxes.push({ x: ox, z: oz - HALF_D, hx: W, hz: 0.3 });
    this.boxes.push({ x: ox, z: oz + HALF_D, hx: W, hz: 0.3 });
    this.boxes.push({ x: ox - HALF_W, z: oz, hx: 0.3, hz: D });
    this.boxes.push({ x: ox + HALF_W, z: oz, hx: 0.3, hz: D });

    // --- plafoniere
    for (const dx of [-5, 0, 5]) {
      for (const dz of [-4, 2]) {
        B.metal.box(ox + dx, H - 0.06, oz + dz, 2.6, 0.12, 0.5, 0x9aa0a6);
        B.glowB.box(ox + dx, H - 0.16, oz + dz, 2.4, 0.1, 0.42, st.light);
      }
    }

    this.exit = { x: ox + 2.2, z: oz + HALF_D - 1.6 };
    this.counter = { x: ox, z: oz - 3.4 };
    this.spots = [];    // punti d'interazione: negozi ne hanno uno, il casino' tre
    this[`_${type}`] ? this[`_${type}`](B, st, rng) : this._store(B, st, rng);

    // --- meshes
    const add = (gb, mat, opts = {}) => {
      if (gb.empty) return;
      const m = new THREE.Mesh(gb.build(), mat);
      m.castShadow = !!opts.cast;
      m.receiveShadow = true;
      this.group.add(m);
    };
    add(B.floor, mats.floor[st.floor]);
    add(B.wall, mats.wall);
    add(B.wood, mats.wood, { cast: true });
    add(B.metal, mats.metal, { cast: true });
    add(B.prod, mats.prod, { cast: true });
    add(B.glass, mats.glass);
    add(B.leaf, mats.leaf, { cast: true });
    add(B.trim, mats.trim);
    add(B.glowB, mats.glow);

    // --- luci vere: plafoniere bianche, e solo un velo del colore del locale
    for (const dx of [-6, 0, 6]) {
      for (const dz of [-4, 2]) {
        const l = new THREE.PointLight(st.light, 7, 20, 1.25);
        l.position.set(ox + dx, H - 0.5, oz + dz);
        this.group.add(l);
      }
    }
    // l'accento tinge appena, prima allagava soffitto e pareti
    const accent = new THREE.Color(st.glow).lerp(new THREE.Color(0xffffff), 0.55);
    const fill = new THREE.PointLight(accent, 2.2, 14, 1.4);
    fill.position.set(ox, 1.8, oz + 4);
    this.group.add(fill);

    // --- commesso
    if (type !== 'home') {
      this.clerk = makeCharacter({});
      this.clerk.position.set(this.counter.x - 1.2, 0, this.counter.z - 1.2);
      this.clerk.rotation.y = -Math.PI / 2;
      this.group.add(this.clerk);
    }

    // --- clienti: ognuno fermo a fare qualcosa, cosi' il locale e' vivo
    this.patrons = [];
    const POSES = { diner: 'sit', gym: 'lean', bank: 'phone', club: 'wave', office: 'talk', barber: 'sit',
      bar: 'talk', casino: 'watch', store: 'phone' };
    const n = type === 'home' ? 0 : type === 'club' ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const p = makeCharacter({});
      const a = rng() * Math.PI * 2, r = 2.6 + rng() * 5.4;
      p.position.set(ox + Math.cos(a) * r, 0, oz + 1.5 + Math.sin(a) * r * 0.6);
      p.rotation.y = rng() * Math.PI * 2;
      p.userData.pose = POSES[type] || pick(['talk', 'phone', 'lean', 'watch']);
      p.userData.phase = rng() * 6.28;
      this.group.add(p);
      this.patrons.push(p);
    }

    this.group.visible = false;
  }

  /* ---------------------------------------------------------- allestimenti */

  _store(B, st, rng) {
    counter(B, this.counter.x, this.counter.z, 6, 1.1, 0xcfc8ba, st.trim);
    B.metal.box(this.counter.x + 2, 1.35, this.counter.z, 0.6, 0.45, 0.5, 0x40474e);   // registratore
    B.glowB.box(this.counter.x + 2, 1.5, this.counter.z + 0.1, 0.4, 0.14, 0.02, 0x7fffa0);
    // corsie centrali
    for (const dz of [-0.6, 2.2]) {
      shelf(B, this.ox - 3.4, this.oz + dz, 7, 1.0, 1.7, 0, rng);
    }
    // frigoriferi sulla parete sinistra
    for (let i = 0; i < 3; i++) fridge(B, this.ox - HALF_W + 0.9, this.oz - 3 + i * 1.6, 0, rng);
    // scaffali a parete destra
    shelf(B, this.ox + HALF_W - 0.9, this.oz - 1, 8, 1.0, 2.0, Math.PI / 2, rng);
    shelf(B, this.ox + 3.2, this.oz + 1.2, 6, 1.0, 1.7, Math.PI / 2, rng);
    B.glowB.box(this.ox, 3.0, this.oz - HALF_D + 0.2, 7, 0.5, 0.06, st.glow);
    plant(B, this.ox + 5.5, this.oz + 4.5);
  }

  _burger(B, st, rng) {
    counter(B, this.counter.x, this.counter.z, 7, 1.2, 0xc0392b, 0xe8b93d);
    // menu board illuminato
    B.metal.box(this.ox, 2.5, this.oz - HALF_D + 0.25, 8, 1.4, 0.16, 0x2b2f38);
    B.glowB.box(this.ox, 2.5, this.oz - HALF_D + 0.34, 7.6, 1.2, 0.04, 0xffd9a0);
    // cucina dietro il bancone
    B.metal.box(this.ox + 3.5, 0.55, this.oz - 5.2, 3.2, 1.1, 1.2, 0xb8bcc2);
    B.metal.box(this.ox - 3.5, 0.55, this.oz - 5.2, 3.2, 1.1, 1.2, 0xb8bcc2);
    B.glowB.box(this.ox + 3.5, 1.16, this.oz - 5.2, 2.6, 0.06, 0.9, 0xff9a3d);
    // distributore bibite
    B.metal.box(this.ox + 2.6, 1.4, this.oz - 4.4, 1.2, 0.9, 0.6, 0x8f959c);
    // tavolini
    for (const dx of [-6.2, -3.4, 3.4, 6.2]) {
      for (const dz of [0.4, 3.4]) {
        table(B, this.ox + dx, this.oz + dz, 0.6, 0xa8462f);
        chair(B, this.ox + dx - 1.1, this.oz + dz, 0, 0x7a3122);
        chair(B, this.ox + dx + 1.1, this.oz + dz, Math.PI, 0x7a3122);
      }
    }
    B.prod.box(this.counter.x - 2.2, 1.2, this.counter.z, 0.5, 0.2, 0.4, 0xe8b93d);   // vassoi
  }

  _pharmacy(B, st, rng) {
    counter(B, this.counter.x, this.counter.z, 6.5, 1.2, 0xeef6f0, st.trim);
    // croce verde
    B.glowB.box(this.ox, 2.7, this.oz - HALF_D + 0.24, 1.4, 0.42, 0.06, 0x3ddc84);
    B.glowB.box(this.ox, 2.7, this.oz - HALF_D + 0.24, 0.42, 1.4, 0.06, 0x3ddc84);
    // armadi farmaci dietro
    shelf(B, this.ox, this.oz - 5.6, 12, 0.9, 2.4, 0, rng);
    // gondole basse
    for (const dz of [0.4, 3.2]) shelf(B, this.ox - 2, this.oz + dz, 8, 0.9, 1.3, 0, rng);
    shelf(B, this.ox + HALF_W - 0.8, this.oz + 1, 7, 0.9, 2.0, Math.PI / 2, rng);
    plant(B, this.ox - HALF_W + 1.2, this.oz + 5);
  }

  _ammu(B, st, rng) {
    counter(B, this.counter.x, this.counter.z, 7, 1.3, 0x3a4048, st.trim);
    // vetrina con le pistole
    B.glass.box(this.counter.x, 1.15, this.counter.z, 6.6, 0.2, 1.1, 0x9fd6e8);
    for (let i = 0; i < 6; i++) {
      B.metal.box(this.counter.x - 2.6 + i * 1.05, 1.02, this.counter.z, 0.4, 0.1, 0.2, 0x2b2f36);
    }
    // rastrelliere a parete
    for (const dz of [-5.4, -5.4]) {
      B.wood.box(this.ox, 2.2, this.oz + dz + 0.4, 12, 1.6, 0.2, 0x3f454c);
      for (let i = 0; i < 9; i++) {
        B.metal.box(this.ox - 5 + i * 1.25, 2.2, this.oz + dz + 0.55, 0.16, 1.1, 0.1, 0x6f767e);
        B.metal.box(this.ox - 5 + i * 1.25, 1.9, this.oz + dz + 0.6, 0.5, 0.12, 0.1, 0x4a5058);
      }
    }
    // bersagli e casse
    B.prod.box(this.ox - HALF_W + 1.2, 1.0, this.oz + 2, 0.1, 2.0, 1.2, 0xe8e2d0);
    for (let i = 0; i < 5; i++) {
      B.wood.box(this.ox + HALF_W - 1.4, 0.35 + i % 2, this.oz + 1 + (i % 3) * 1.4, 1.1, 0.7, 1.1, 0x5a4a32);
    }
    B.glowB.box(this.ox, 3.0, this.oz - HALF_D + 0.2, 6, 0.4, 0.05, st.glow);
  }

  _clothes(B, st, rng) {
    counter(B, this.counter.x + 4.5, this.counter.z + 1, 3.2, 1.0, 0xf0e6f2, st.trim);
    this.counter = { x: this.ox + 4.5, z: this.oz - 2.4 };
    // stender con i vestiti
    for (const dx of [-5.5, -1.5, 2.5]) {
      B.metal.box(this.ox + dx, 1.75, this.oz + 1, 0.08, 0.08, 5, 0x9aa0a6);
      for (const s of [-1, 1]) {
        B.metal.box(this.ox + dx, 0.9, this.oz + 1 + s * 2.4, 0.06, 1.7, 0.06, 0x9aa0a6);
        B.metal.box(this.ox + dx, 0.04, this.oz + 1 + s * 2.4, 0.7, 0.08, 0.7, 0x81878d);
      }
      for (let i = 0; i < 12; i++) {
        B.prod.box(this.ox + dx, 1.25, this.oz - 1.2 + i * 0.4, 0.34, 0.9, 0.1,
          pick([0x2f6fd0, 0xc0392b, 0x2b9e5f, 0xeceff2, 0xd9a520, 0x7d4fbf, 0x2b2f38]));
      }
      B.solid.push({ x: this.ox + dx, z: this.oz + 1, hx: 0.5, hz: 2.6 });
    }
    // camerini e specchi
    for (let i = 0; i < 3; i++) {
      const x = this.ox - HALF_W + 1.6 + i * 2.4;
      B.wood.box(x, 1.3, this.oz - HALF_D + 1.2, 2.1, 2.6, 0.12, 0xd8cfe0);
      B.glass.box(x, 1.2, this.oz - HALF_D + 1.35, 1.4, 2.0, 0.06, 0xcfe6f2);
    }
    // manichini
    for (const dx of [5.5, 7.2]) {
      B.prod.box(this.ox + dx, 0.95, this.oz + 4.5, 0.4, 1.9, 0.28, 0xe8e2d8);
      B.prod.box(this.ox + dx, 1.55, this.oz + 4.5, 0.5, 0.7, 0.34, pick([0xc0392b, 0x2f6fd0, 0x2b9e5f]));
    }
    B.glowB.box(this.ox, 3.0, this.oz - HALF_D + 0.2, 5, 0.4, 0.05, st.glow);
  }

  _bar(B, st, rng) {
    counter(B, this.counter.x, this.counter.z, 9, 1.1, 0x5a3a24, st.trim);
    for (let i = -4; i <= 4; i += 1.6) stool(B, this.counter.x + i, this.counter.z + 1.3);
    // retrobanco con bottiglie
    B.wood.box(this.ox, 1.5, this.oz - HALF_D + 0.5, 12, 3.0, 0.4, 0x4a3020);
    for (let s = 0; s < 3; s++) {
      const y = 1.1 + s * 0.55;
      B.wood.box(this.ox, y, this.oz - HALF_D + 0.85, 11, 0.06, 0.4, 0x6b4a30);
      for (let i = 0; i < 26; i++) {
        B.prod.box(this.ox - 5.2 + i * 0.42, y + 0.2, this.oz - HALF_D + 0.85, 0.16, 0.34, 0.16,
          pick([0x8fbf6b, 0xd9a520, 0xb0522f, 0x2f8fb8, 0xe8e2d0, 0x7a3f2f]));
      }
    }
    B.glowB.box(this.ox, 2.55, this.oz - HALF_D + 0.72, 10, 0.06, 0.3, 0xffd9a0);
    // tavolini e jukebox
    for (const dx of [-6, -2.4, 2.4, 6]) {
      table(B, this.ox + dx, this.oz + 3.6, 0.6, 0x5a3a24);
      chair(B, this.ox + dx - 1.1, this.oz + 3.6, 0);
      chair(B, this.ox + dx + 1.1, this.oz + 3.6, Math.PI);
    }
    B.wood.box(this.ox - HALF_W + 1.2, 0.8, this.oz + 0.5, 1.2, 1.6, 0.8, 0x7a3f2f);
    B.glowB.box(this.ox - HALF_W + 1.75, 1.1, this.oz + 0.5, 0.06, 0.8, 0.6, 0xff8a3d);
    // biliardo
    B.wood.box(this.ox + 5.5, 0.4, this.oz + 0.2, 3.2, 0.8, 1.8, 0x2f6b45);
    B.prod.box(this.ox + 5.5, 0.82, this.oz + 0.2, 3.0, 0.04, 1.6, 0x2f8f55);
    B.solid.push({ x: this.ox + 5.5, z: this.oz + 0.2, hx: 1.7, hz: 1.0 });
  }

  _garage(B, st, rng) {
    counter(B, this.ox + 6.2, this.oz - 4.2, 3.4, 1.0, 0x8a9098, st.trim);
    this.counter = { x: this.ox + 6.2, z: this.oz - 4.2 };
    // ponte sollevatore con auto
    B.metal.box(this.ox - 3, 0.12, this.oz - 1, 5.4, 0.24, 2.6, 0x6f767e);
    for (const s of [-1, 1]) B.metal.box(this.ox - 3 + s * 2, 0.6, this.oz - 1, 0.4, 1.2, 0.4, 0xffb020);
    B.metal.box(this.ox - 3, 1.25, this.oz - 1, 5.0, 0.2, 2.2, 0x9aa0a6);
    // banco lavoro e attrezzi
    B.wood.box(this.ox, 0.5, this.oz - HALF_D + 0.9, 9, 1.0, 0.8, 0x6b7076);
    B.metal.box(this.ox, 2.1, this.oz - HALF_D + 0.5, 9, 1.8, 0.14, 0x7a8088);
    for (let i = 0; i < 14; i++) {
      B.metal.box(this.ox - 4 + i * 0.62, 2.1 + (i % 2) * 0.4, this.oz - HALF_D + 0.62,
        0.1, 0.5, 0.08, pick([0xc9ccd2, 0xffb020, 0x4a5058]));
    }
    // pneumatici e fusti
    for (let i = 0; i < 6; i++) {
      B.prod.box(this.ox + HALF_W - 1.3, 0.2 + (i % 3) * 0.34, this.oz + 1.5 + Math.floor(i / 3) * 1.2,
        1.0, 0.32, 1.0, 0x1c1f24);
    }
    for (let i = 0; i < 3; i++) {
      B.metal.box(this.ox - HALF_W + 1.2, 0.45, this.oz + 2 + i * 0.9, 0.66, 0.9, 0.66, pick([0xd94f4f, 0x3d7a3d, 0x2f6fa8]));
    }
    B.solid.push({ x: this.ox - 3, z: this.oz - 1, hx: 2.8, hz: 1.5 });
  }

  _home(B, st, rng) {
    this.counter = { x: this.ox - 4.5, z: this.oz - 2.6 };
    // letto
    B.wood.box(this.ox - 5.2, 0.24, this.oz - 4.2, 2.2, 0.48, 3.0, 0x8a6a44);
    B.prod.box(this.ox - 5.2, 0.58, this.oz - 4.2, 2.05, 0.28, 2.9, 0xe8e2d6);
    B.prod.box(this.ox - 5.2, 0.74, this.oz - 3.6, 2.05, 0.06, 1.7, 0x3f6b8a);
    B.prod.box(this.ox - 5.2, 0.75, this.oz - 5.3, 1.6, 0.16, 0.6, 0xf2efe6);
    B.solid.push({ x: this.ox - 5.2, z: this.oz - 4.2, hx: 1.2, hz: 1.6 });
    // comodino e lampada
    B.wood.box(this.ox - 3.6, 0.3, this.oz - 5.4, 0.6, 0.6, 0.6, 0x6b4a34);
    B.glowB.box(this.ox - 3.6, 0.85, this.oz - 5.4, 0.3, 0.4, 0.3, 0xffd9a0);
    // divano e tavolino
    B.prod.box(this.ox + 3.4, 0.32, this.oz + 1.2, 2.6, 0.5, 1.0, 0x4a6b7a);
    B.prod.box(this.ox + 3.4, 0.62, this.oz + 1.2, 2.4, 0.22, 0.9, 0x5d8092);
    B.prod.box(this.ox + 3.4, 0.72, this.oz + 1.68, 2.6, 0.8, 0.24, 0x4a6b7a);
    for (const s of [-1, 1]) B.prod.box(this.ox + 3.4 + s * 1.35, 0.55, this.oz + 1.2, 0.24, 0.7, 1.0, 0x41606e);
    B.solid.push({ x: this.ox + 3.4, z: this.oz + 1.4, hx: 1.6, hz: 0.8 });
    table(B, this.ox + 3.4, this.oz - 0.6, 0.7, 0x8a6a44);
    // TV a muro
    B.metal.box(this.ox + 3.4, 1.5, this.oz - 2.9, 2.4, 1.4, 0.12, 0x14171d);
    B.glowB.box(this.ox + 3.4, 1.5, this.oz - 2.78, 2.2, 1.2, 0.03, 0x5fa8ff);
    // cucina
    B.wood.box(this.ox - 1.5, 0.45, this.oz + 5.2, 5.5, 0.9, 0.7, 0xd8cfc0);
    B.metal.box(this.ox - 1.5, 0.92, this.oz + 5.2, 5.6, 0.06, 0.75, 0xb0b6bd);
    B.wood.box(this.ox - 1.5, 2.2, this.oz + 5.4, 5.5, 0.8, 0.4, 0xc9c0b0);
    B.metal.box(this.ox - 4.6, 1.05, this.oz + 5.2, 0.9, 2.1, 0.8, 0xdadfe4);   // frigo
    B.solid.push({ x: this.ox - 1.5, z: this.oz + 5.3, hx: 2.9, hz: 0.5 });
    // tappeto e pianta
    B.prod.box(this.ox + 3.4, 0.02, this.oz + 0.2, 4.2, 0.04, 3.2, 0x8a4a3a);
    plant(B, this.ox + HALF_W - 1.3, this.oz - 4.5);
    // quadri
    for (const dx of [-2, 0.4]) {
      B.wood.box(this.ox + dx, 2.2, this.oz - HALF_D + 0.2, 1.2, 0.9, 0.08, 0x6b4a34);
      B.prod.box(this.ox + dx, 2.2, this.oz - HALF_D + 0.26, 1.0, 0.7, 0.03, pick([0x3f6b8a, 0x8a6a44, 0x6b8a5a]));
    }
  }

  /** Tavola calda: box con divanetti, bancone lungo, cucina a vista. */
  _diner(B, st, rng) {
    const ox = this.ox, oz = this.oz;
    counter(B, this.counter.x, this.counter.z, 9, 1.0, 0xc9b79a, st.trim);
    for (let i = -3; i <= 3; i++) stool(B, this.counter.x + i * 1.2, this.counter.z + 1.3);
    // cucina dietro il bancone: piastra, cappa, mensole
    B.metal.box(ox, 0.5, oz - 5.4, 5.2, 1.0, 0.9, 0xb9c0c8);
    B.metal.box(ox, 2.3, oz - 5.4, 5.4, 0.5, 1.1, 0x8d949c);
    B.glowB.box(ox, 2.02, oz - 5.4, 5.0, 0.06, 0.9, 0xfff0c0);
    for (const dx of [-1.6, 0, 1.6]) B.metal.box(ox + dx, 1.06, oz - 5.4, 1.2, 0.06, 0.7, 0x3a3f47);
    B.wood.box(ox, 2.9, oz - 5.9, 5.2, 0.08, 0.4, 0xb9b3a6);
    for (let k = 0; k < 8; k++) {
      B.prod.box(ox - 2.2 + k * 0.6, 3.05, oz - 5.9, 0.28, 0.24, 0.28,
        pick([0xd94f4f, 0xe0a92c, 0xe0e0e0, 0x4caf50]));
    }
    // box con tavolo e panche lungo le pareti
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const x = ox + sx * 5.6, z = oz - 1.4 + i * 3.0;
        B.wood.box(x, 0.72, z, 1.7, 0.08, 1.0, 0x9a6a44);
        B.metal.box(x, 0.36, z, 0.1, 0.72, 0.1, 0x81878d);
        for (const sz of [-1, 1]) {
          B.wood.box(x, 0.45, z + sz * 0.95, 1.8, 0.12, 0.55, 0xc0392b);
          B.wood.box(x, 0.9, z + sz * 1.2, 1.8, 0.9, 0.12, 0xc0392b);
        }
        B.solid.push({ x, z, hx: 0.95, hz: 1.4 });
      }
    }
    // insegna al neon e jukebox
    B.glowB.box(ox, 3.2, oz - 6.1, 3.4, 0.5, 0.06, 0xff5a3d);
    B.metal.box(ox - 7.4, 0.9, oz + 3.0, 1.0, 1.8, 0.6, 0x4a2f24);
    B.glowB.box(ox - 7.4, 1.4, oz + 3.32, 0.8, 0.6, 0.04, 0xffb84a);
    B.solid.push({ x: ox - 7.4, z: oz + 3.0, hx: 0.6, hz: 0.4 });
  }

  /** Palestra: rastrelliera pesi, panche, tapis roulant, specchiera. */
  _gym(B, st, rng) {
    const ox = this.ox, oz = this.oz;
    counter(B, this.counter.x, this.counter.z, 4.5, 1.0, 0x3a4048, st.trim);
    // specchiera sulla parete di fondo
    B.glass.box(ox + 3.5, 1.7, oz - HALF_D + 0.2, 8.0, 2.6, 0.08, 0xbfd8e8);
    // rastrelliera con manubri
    B.metal.box(ox - 6.0, 0.5, oz - 4.6, 3.4, 0.12, 0.7, 0x53585f);
    B.metal.box(ox - 6.0, 1.0, oz - 4.6, 3.4, 0.12, 0.7, 0x53585f);
    for (let i = 0; i < 6; i++) {
      const x = ox - 7.4 + i * 0.56;
      for (const y of [0.62, 1.12]) {
        B.metal.box(x, y, oz - 4.6, 0.12, 0.12, 0.5, 0x2b2f36);
        for (const sz of [-1, 1]) B.metal.box(x, y, oz - 4.6 + sz * 0.24, 0.26, 0.26, 0.1, 0x1a1d22);
      }
    }
    // panche piane con bilanciere
    for (const dz of [-1.2, 2.2]) {
      const x = ox - 4.2, z = oz + dz;
      B.wood.box(x, 0.48, z, 1.6, 0.16, 0.5, 0x2b2f36);
      for (const sx of [-1, 1]) B.metal.box(x + sx * 0.7, 0.2, z, 0.1, 0.4, 0.4, 0x53585f);
      for (const sx of [-1, 1]) B.metal.box(x + sx * 0.9, 1.1, z, 0.12, 1.0, 0.12, 0x81878d);
      B.metal.box(x, 1.55, z, 0.08, 0.08, 2.4, 0x9aa0a6);
      for (const sz of [-1, 1]) B.metal.box(x, 1.55, z + sz * 1.0, 0.42, 0.42, 0.12, 0x1a1d22);
      B.solid.push({ x, z, hx: 0.9, hz: 0.8 });
    }
    // tapis roulant
    for (let i = 0; i < 3; i++) {
      const x = ox + 3.2 + i * 2.2, z = oz + 2.4;
      B.metal.box(x, 0.18, z, 0.9, 0.36, 2.0, 0x3a3f47);
      B.metal.box(x, 0.4, z - 0.9, 0.86, 0.1, 0.5, 0x1a1d22);
      for (const sx of [-1, 1]) B.metal.box(x + sx * 0.42, 0.8, z + 0.85, 0.08, 1.2, 0.08, 0x81878d);
      B.metal.box(x, 1.35, z + 0.85, 0.9, 0.34, 0.12, 0x53585f);
      B.glowB.box(x, 1.35, z + 0.78, 0.6, 0.22, 0.02, 0x6fe0a0);
      B.solid.push({ x, z, hx: 0.55, hz: 1.1 });
    }
    // sacco da boxe
    B.metal.box(ox + 6.5, 2.85, oz - 2.0, 0.5, 0.1, 0.5, 0x53585f);
    B.wood.box(ox + 6.5, 1.55, oz - 2.0, 0.46, 1.5, 0.46, 0x2b2019);
    B.solid.push({ x: ox + 6.5, z: oz - 2.0, hx: 0.35, hz: 0.35 });
  }

  /** Banca: sportelli con vetri, corda separatrice, caveau in fondo. */
  _bank(B, st, rng) {
    const ox = this.ox, oz = this.oz;
    // fila di sportelli
    counter(B, ox, oz - 4.4, 12, 1.1, 0xc8ccd2, st.trim);
    for (let i = -2; i <= 2; i++) {
      const x = ox + i * 2.4;
      B.glass.box(x, 1.9, oz - 4.4, 2.1, 1.5, 0.06, 0xcfe4f2);
      B.metal.box(x, 1.15, oz - 4.4, 2.2, 0.1, 0.5, 0x9aa0a6);
      B.metal.box(x - 1.1, 1.9, oz - 4.4, 0.08, 1.5, 0.1, 0x8a9098);
      B.glowB.box(x, 2.62, oz - 4.4, 0.7, 0.12, 0.03, 0x6fd0ff);
    }
    // caveau
    B.metal.box(ox - 6.6, 1.6, oz - HALF_D + 0.5, 3.2, 3.2, 0.5, 0x6f7680);
    B.metal.box(ox - 6.6, 1.6, oz - HALF_D + 0.8, 2.6, 2.6, 0.2, 0x8d949c);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      B.metal.box(ox - 6.6 + Math.cos(a) * 0.95, 1.6 + Math.sin(a) * 0.95, oz - HALF_D + 0.95,
        0.16, 0.16, 0.12, 0xc9ccd2);
    }
    B.metal.box(ox - 6.6, 1.6, oz - HALF_D + 1.0, 0.24, 0.24, 0.3, 0xe0e4e8);
    // cordone con paletti
    for (let i = 0; i < 5; i++) {
      const x = ox - 4 + i * 2.0;
      B.metal.box(x, 0.5, oz + 0.6, 0.09, 1.0, 0.09, 0x9aa0a6);
      B.metal.box(x, 0.04, oz + 0.6, 0.34, 0.08, 0.34, 0x81878d);
      if (i < 4) B.trim.box(x + 1.0, 0.95, oz + 0.6, 2.0, 0.05, 0.05, 0x8a1f2b);
    }
    plant(B, ox + 7.0, oz + 2.6);
    plant(B, ox - 7.0, oz + 2.6);
  }

  /** Discoteca: pista illuminata, consolle, divanetti e bancone. */
  _club(B, st, rng) {
    const ox = this.ox, oz = this.oz;
    counter(B, ox + 6.0, oz - 1.0, 5.5, 1.0, 0x2a1c36, st.trim);
    this.counter = { x: ox + 6.0, z: oz - 1.0 };
    for (let i = -2; i <= 2; i++) stool(B, ox + 6.0 + i * 1.1, oz + 0.3);
    // bottiglie illuminate dietro il bancone
    B.wood.box(ox + 6.0, 1.5, oz - 2.1, 5.5, 0.08, 0.4, 0x3a2a44);
    B.wood.box(ox + 6.0, 2.1, oz - 2.1, 5.5, 0.08, 0.4, 0x3a2a44);
    for (let k = 0; k < 14; k++) {
      const x = ox + 3.5 + k * 0.38;
      B.glowB.box(x, 1.66 + (k % 2) * 0.6, oz - 2.1, 0.14, 0.3, 0.14,
        pick([0x6fe0ff, 0xe46bff, 0xffd23f, 0x6fffa0]));
    }
    // pista a scacchiera luminosa
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if ((i + j) % 2) continue;
        B.glowB.quadY(ox - 7.4 + i * 1.5, oz - 1.6 + j * 1.5,
          ox - 6.1 + i * 1.5, oz - 0.3 + j * 1.5, 0.03,
          pick([0xe46bff, 0x6fd0ff, 0xffd23f]));
      }
    }
    // consolle del DJ
    B.wood.box(ox - 4.6, 0.55, oz - 5.2, 3.0, 1.1, 1.0, 0x241a30);
    B.metal.box(ox - 4.6, 1.14, oz - 5.2, 3.1, 0.08, 1.1, 0x4a3a58);
    for (const dx of [-0.8, 0.8]) B.metal.box(ox - 4.6 + dx, 1.22, oz - 5.2, 0.5, 0.08, 0.5, 0x1a1420);
    B.glowB.box(ox - 4.6, 1.24, oz - 5.2, 0.5, 0.04, 0.3, 0x6fffa0);
    B.solid.push({ x: ox - 4.6, z: oz - 5.2, hx: 1.6, hz: 0.6 });
    // casse
    for (const sx of [-1, 1]) {
      B.wood.box(ox - 4.6 + sx * 2.6, 1.1, oz - 5.2, 0.8, 2.2, 0.8, 0x1a1420);
      B.solid.push({ x: ox - 4.6 + sx * 2.6, z: oz - 5.2, hx: 0.45, hz: 0.45 });
    }
    // divanetti
    for (const sx of [-1, 1]) {
      const x = ox + sx * 7.2, z = oz + 3.4;
      B.wood.box(x, 0.35, z, 2.6, 0.7, 0.9, 0x3a2a44);
      B.wood.box(x, 0.9, z - 0.5, 2.6, 1.1, 0.2, 0x4a3558);
      B.solid.push({ x, z, hx: 1.35, hz: 0.6 });
    }
    // luci appese
    for (let i = 0; i < 6; i++) {
      const x = ox - 6 + i * 2.4;
      B.metal.box(x, H - 0.3, oz - 0.5, 0.18, 0.5, 0.18, 0x2b2f36);
      B.glowB.box(x, H - 0.62, oz - 0.5, 0.3, 0.14, 0.3, pick([0xe46bff, 0x6fd0ff, 0xffd23f]));
    }
  }

  /** Ufficio: scrivanie, computer, sedie girevoli, lavagna. */
  _office(B, st, rng) {
    const ox = this.ox, oz = this.oz;
    counter(B, this.counter.x, this.counter.z, 4.0, 1.0, 0xd8dce2, st.trim);
    const desk = (x, z, rot) => {
      B.wood.box(x, 0.73, z, 1.9, 0.07, 0.95, 0xd8cdb8, 0, rot);
      for (const sx of [-1, 1]) {
        B.metal.box(x + Math.cos(rot) * sx * 0.85, 0.36, z - Math.sin(rot) * sx * 0.85, 0.08, 0.72, 0.85, 0x8a9098);
      }
      // schermo, tastiera, tazza
      B.metal.box(x, 0.86, z - 0.28, 0.5, 0.2, 0.16, 0x2b2f36, 0, rot);
      B.metal.box(x, 1.2, z - 0.3, 1.0, 0.6, 0.06, 0x1a1d22, 0, rot);
      B.glowB.box(x, 1.2, z - 0.26, 0.92, 0.52, 0.02, 0x9fd6ff, 0, rot);
      B.metal.box(x, 0.79, z + 0.12, 0.7, 0.03, 0.24, 0x3a3f47, 0, rot);
      B.prod.box(x + 0.6, 0.82, z + 0.05, 0.14, 0.16, 0.14, 0xd94f4f, 0, rot);
      // sedia girevole
      B.metal.box(x, 0.26, z + 0.95, 0.5, 0.08, 0.5, 0x2b2f36);
      B.metal.box(x, 0.14, z + 0.95, 0.1, 0.28, 0.1, 0x53585f);
      B.wood.box(x, 0.7, z + 1.2, 0.5, 0.7, 0.1, 0x3a4048);
      B.solid.push({ x, z, hx: 1.0, hz: 0.9 });
    };
    for (let i = 0; i < 3; i++) {
      desk(ox - 5.4 + i * 3.6, oz - 3.6, 0);
      desk(ox - 5.4 + i * 3.6, oz + 1.4, 0);
    }
    // lavagna e archivio
    B.wood.box(ox + 7.6, 1.8, oz - HALF_D + 0.25, 4.0, 2.2, 0.1, 0xf2f4f6);
    B.trim.box(ox + 7.6, 1.8, oz - HALF_D + 0.31, 4.2, 2.4, 0.06, 0x6f7680);
    for (let i = 0; i < 3; i++) {
      B.metal.box(ox - 8.0, 1.0, oz - 1.0 + i * 1.2, 0.6, 2.0, 1.0, 0x9aa0a6);
      B.solid.push({ x: ox - 8.0, z: oz - 1.0 + i * 1.2, hx: 0.35, hz: 0.55 });
    }
    plant(B, ox + 7.4, oz + 3.4);
  }

  /** Barbiere: poltrone, specchi, lavabi, palo tricolore. */
  _barber(B, st, rng) {
    const ox = this.ox, oz = this.oz;
    counter(B, this.counter.x, this.counter.z, 3.6, 1.0, 0x8a5a3a, st.trim);
    for (let i = 0; i < 4; i++) {
      const x = ox - 6.0 + i * 3.2, z = oz + 1.0;
      // specchio con cornice e mensola
      B.glass.box(x, 1.9, oz - HALF_D + 0.22, 1.5, 2.0, 0.06, 0xd8e8f2);
      B.trim.box(x, 1.9, oz - HALF_D + 0.28, 1.66, 2.16, 0.05, 0x6b4a34);
      B.wood.box(x, 0.85, oz - HALF_D + 0.4, 1.6, 0.08, 0.5, 0x6b4a34);
      for (let k = 0; k < 3; k++) {
        B.prod.box(x - 0.5 + k * 0.5, 0.98, oz - HALF_D + 0.4, 0.12, 0.2, 0.12,
          pick([0x4cc2ff, 0xffd23f, 0x3ddc84]));
      }
      // poltrona
      B.metal.box(x, 0.14, z, 0.7, 0.28, 0.7, 0xb9c0c8);
      B.metal.box(x, 0.4, z, 0.16, 0.4, 0.16, 0x8d949c);
      B.wood.box(x, 0.62, z, 0.66, 0.16, 0.7, 0x2b2f36);
      B.wood.box(x, 1.1, z - 0.3, 0.66, 0.9, 0.14, 0x2b2f36);
      for (const sx of [-1, 1]) B.wood.box(x + sx * 0.4, 0.82, z, 0.1, 0.1, 0.6, 0x3a3f47);
      B.solid.push({ x, z, hx: 0.45, hz: 0.45 });
    }
    // palo del barbiere e attesa
    B.glowB.box(ox + 7.6, 1.5, oz + 4.4, 0.24, 1.2, 0.24, 0xf4f4f4);
    B.trim.box(ox + 7.6, 2.2, oz + 4.4, 0.3, 0.2, 0.3, 0xc9ccd2);
    for (let i = 0; i < 3; i++) chair(B, ox + 6.4 + i * 0.9, oz + 3.0, Math.PI);
  }

  _casino(B, st, rng) {
    const ox = this.ox, oz = this.oz;
    this.counter = { x: ox - 5.5, z: oz - 5.2 };

    // --- slot machine lungo la parete sinistra
    for (let i = 0; i < 4; i++) {
      const x = ox - HALF_W + 1.5, z = oz - 4 + i * 2.4;
      B.wood.box(x, 0.55, z, 1.1, 1.1, 1.5, 0x6b1626);
      B.metal.box(x, 1.35, z, 1.2, 0.6, 1.6, 0xd6af5a);
      B.glowB.box(x + 0.62, 1.35, z, 0.06, 0.5, 1.2, 0xffd23f);
      B.metal.box(x + 0.6, 0.95, z + 0.55, 0.16, 0.16, 0.5, 0xc9ccd2);   // leva
      B.prod.box(x + 0.66, 0.78, z + 0.55, 0.12, 0.2, 0.12, 0xd93b3b);
      B.solid.push({ x, z, hx: 0.8, hz: 0.9 });
    }
    this.spots.push({ x: ox - HALF_W + 3.2, z: oz - 1.2, r: 3.2, kind: 'slot', label: 'gioca alle slot' });

    // --- tavolo della roulette
    const rx = ox + 3.6, rz = oz - 3.2;
    B.wood.box(rx, 0.45, rz, 4.6, 0.9, 2.6, 0x3a1f14);
    B.prod.box(rx, 0.93, rz, 4.4, 0.08, 2.4, 0x1f6b3f);
    B.metal.box(rx - 1.5, 1.0, rz, 1.5, 0.2, 1.5, 0xd6af5a);
    B.prod.box(rx - 1.5, 1.12, rz, 1.2, 0.06, 1.2, 0x2b1810);
    B.glowB.box(rx + 0.8, 1.0, rz, 2.2, 0.02, 1.6, 0xffe08a);
    B.solid.push({ x: rx, z: rz, hx: 2.5, hz: 1.5 });
    this.spots.push({ x: rx, z: rz + 2.4, r: 2.8, kind: 'roulette', label: 'gioca alla roulette' });

    // --- tavolo del blackjack
    const bx = ox + 3.2, bz = oz + 3.4;
    B.wood.box(bx, 0.45, bz, 3.8, 0.9, 2.2, 0x3a1f14);
    B.prod.box(bx, 0.93, bz, 3.6, 0.08, 2.0, 0x1f6b3f);
    B.prod.box(bx, 0.98, bz - 0.6, 2.6, 0.02, 0.5, 0xd6af5a);
    for (const dx of [-1.1, 0, 1.1]) stool(B, bx + dx, bz + 1.7);
    B.solid.push({ x: bx, z: bz, hx: 2, hz: 1.3 });
    this.spots.push({ x: bx, z: bz + 2.2, r: 2.6, kind: 'black', label: 'gioca a blackjack' });

    // --- cassa con la cambiavalute
    counter(B, this.counter.x, this.counter.z, 5, 1.1, 0x3a1f14, st.trim);
    B.glowB.box(this.counter.x, 2.9, oz - HALF_D + 0.25, 6, 0.7, 0.06, 0xffd23f);
    // lampadari
    for (const dx of [-4, 4]) {
      for (const dz of [-3, 3]) {
        B.metal.box(ox + dx, H - 0.5, oz + dz, 0.9, 0.1, 0.9, 0xd6af5a);
        B.glowB.box(ox + dx, H - 0.62, oz + dz, 0.8, 0.16, 0.8, 0xffe0a0);
      }
    }
    plant(B, ox + HALF_W - 1.3, oz - 5.6);
    plant(B, ox + HALF_W - 1.3, oz + 5.6);
  }

  /* -------------------------------------------------------------- servizi */

  resolve(x, z, r, out) {
    let hit = false;
    const nx = clamp(x, this.ox - HALF_W + r + 0.35, this.ox + HALF_W - r - 0.35);
    const nz = clamp(z, this.oz - HALF_D + r + 0.35, this.oz + HALF_D - r - 0.35);
    if (nx !== x || nz !== z) hit = true;
    x = nx; z = nz;
    for (const b of this.boxes) {
      const dx = x - b.x, dz = z - b.z;
      const px = b.hx + r - Math.abs(dx), pz = b.hz + r - Math.abs(dz);
      if (px > 0 && pz > 0) {
        hit = true;
        if (px < pz) x += Math.sign(dx || 1) * px; else z += Math.sign(dz || 1) * pz;
      }
    }
    out.x = x; out.z = z;
    return hit;
  }

  inBounds() { return true; }
}

/* ---------------------------------------------------------------- manager */

export class InteriorManager {
  constructor(game) {
    this.game = game;
    this.cache = new Map();
    this.current = null;
    this.door = null;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.mats = interiorMaterials();
  }

  get(type) {
    if (!this.cache.has(type)) {
      const it = new Interior(type, this.mats);
      this.group.add(it.group);
      this.cache.set(type, it);
    }
    return this.cache.get(type);
  }

  enter(door) {
    const it = this.get(door.type);
    this.current = it;
    this.door = door;
    it.group.visible = true;
    const p = this.game.player;
    this.returnPos = { x: door.x, z: door.z, a: door.face };
    p.place(ORIGIN.x + 2.2, ORIGIN.z + HALF_D - 2.6, Math.PI / 2);
    p.city = it;
    p.indoor = true;
    p.camYaw = Math.PI / 2;
    p.camPitch = 0.1;
    p.camPos.set(ORIGIN.x + 2.2, 2.4, ORIGIN.z + HALF_D + 0.8);
    p.camLook.set(ORIGIN.x + 2.2, 1.5, ORIGIN.z + HALF_D - 3);
    this.game.setWorldVisible(false);
    this.game.audio.door();
    return it;
  }

  exit() {
    if (!this.current) return;
    this.current.group.visible = false;
    const p = this.game.player;
    p.city = this.game.city;
    p.indoor = false;
    const out = this.returnPos.a;
    const walk = out + Math.PI / 2;
    const x = this.returnPos.x + Math.cos(out) * 0.8;
    const z = this.returnPos.z - Math.sin(out) * 0.8;
    p.place(x, z, walk);
    p.camYaw = walk;
    p.camPitch = 0.3;
    p.camPos.set(x - Math.cos(walk) * 5.5, 3.4, z + Math.sin(walk) * 5.5);
    p.camLook.set(x, 1.6, z);
    this.game.setWorldVisible(true);
    this.game.audio.door();
    this.current = null;
    this.door = null;
  }

  update(dt) {
    if (!this.current) return;
    const t = this.game.time;
    if (this.current.clerk) {
      animateCharacter(this.current.clerk, 0, t, 'talk', 0);
      this.current.clerk.rotation.y = -Math.PI / 2 + Math.sin(t * 0.7) * 0.3;
    }
    for (const p of this.current.patrons || []) {
      animateCharacter(p, 0, t + p.userData.phase, p.userData.pose, 0);
    }
  }

  atCounter(p) {
    if (!this.current) return false;
    const c = this.current.counter;
    return Math.hypot(p.x - c.x, p.z - (c.z + 1.7)) < 2.6;
  }

  /** Punto d'interazione piu' vicino (tavoli del casino', banconi…). */
  nearestSpot(p) {
    if (!this.current || !this.current.spots.length) return null;
    let best = null, bd = Infinity;
    for (const s of this.current.spots) {
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < (s.r || 2.6) && d < bd) { bd = d; best = s; }
    }
    return best;
  }

  atExit(p) {
    if (!this.current) return false;
    return Math.hypot(p.x - this.current.exit.x, p.z - this.current.exit.z) < 2.4;
  }
}

/** Materiali condivisi da tutti gli interni. */
function interiorMaterials() {
  const tx = interiorTextures();
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  return {
    floor: {
      tile: std({ map: tx.tile.map, normalMap: tx.tile.normal, roughness: 0.5, metalness: 0.04, envMapIntensity: 0.15 }),
      checker: std({ map: tx.checker.map, normalMap: tx.checker.normal, roughness: 0.46, metalness: 0.04, envMapIntensity: 0.15 }),
      wood: std({ map: tx.wood.map, normalMap: tx.wood.normal, roughness: 0.55, metalness: 0, envMapIntensity: 0.15 }),
      carpet: std({ map: tx.carpet.map, normalMap: tx.carpet.normal, roughness: 0.96, metalness: 0, envMapIntensity: 0.06 }),
      concrete: std({ map: tx.concrete.map, normalMap: tx.concrete.normal, roughness: 0.92, metalness: 0, envMapIntensity: 0.1 }),
    },
    wall: std({ map: tx.plaster.map, normalMap: tx.plaster.normal, roughness: 0.95, metalness: 0, envMapIntensity: 0.06 }),
    wood: std({ map: tx.wood.map, roughness: 0.68, metalness: 0.02, envMapIntensity: 0.12 }),
    metal: std({ roughness: 0.42, metalness: 0.6, envMapIntensity: 0.35 }),
    prod: std({ roughness: 0.7, metalness: 0.05, envMapIntensity: 0.15 }),
    trim: std({ roughness: 0.5, metalness: 0.15, envMapIntensity: 0.2 }),
    leaf: std({ roughness: 0.9, metalness: 0 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xbfe0ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, envMapIntensity: 0.6,
    }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
}


/**
 * Il listino dell'armeria si costruisce dall'arsenale: se compri gia' l'arma
 * la voce diventa "munizioni", e le armi che non hai ancora costano di piu'.
 */
export function buildAmmuMenu(game) {
  const p = game.player;
  const items = [{
    id: 'armor', icon: '🛡️', name: 'Giubbotto antiproiettile',
    desc: 'Armatura al massimo', price: 180, effect: (g) => g.player.addArmor(100),
  }];
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    if (!w.price) continue;                       // i pugni non si vendono
    if (!p.owned[id]) {
      items.push({
        id, icon: w.icon, name: w.name, price: w.price,
        desc: isGun(id) ? `${w.desc} · ${w.free} colpi inclusi` : w.desc,
        effect: (g) => { g.player.giveWeapon(id); g.toast(`${w.name} equipaggiata`, 'good'); },
      });
    } else if (isGun(id)) {
      const full = (p.ammoOf[id] || 0) >= w.ammoMax;
      items.push({
        id: `${id}-ammo`, icon: '📦', name: `Munizioni ${w.name}`,
        desc: full ? 'Sei al massimo' : `+${w.ammoQty} colpi (max ${w.ammoMax})`,
        price: full ? 0 : w.ammoPrice,
        effect: (g) => {
          const got = g.player.addAmmo(id, w.ammoQty);
          g.toast(got ? `+${got} munizioni` : 'Già al massimo', got ? 'good' : '');
        },
      });
    }
  }
  return { title: 'AMMU NOVA', desc: 'Protezione personale, tutto regolare (quasi).', items };
}
