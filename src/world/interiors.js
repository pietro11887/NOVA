import * as THREE from 'three';
import { GeoBuilder, clamp } from '../core/utils.js';
import { makeCharacter, animateCharacter } from './models.js';

const ORIGIN = { x: 0, z: 4000 };   // gli interni vivono lontano dalla citta'
const W = 16, D = 13, H = 3.6;

/** Cataloghi dei negozi: prezzo, effetto e testo mostrato nel menu. */
export const SHOP_MENUS = {
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
    items: [
      { id: 'armor', icon: '🛡️', name: 'Giubbotto antiproiettile', desc: 'Armatura al massimo', price: 180, effect: (g) => g.player.addArmor(100) },
      { id: 'pistol', icon: '🔫', name: 'Pistola + 40 colpi', desc: 'Sblocca l\'arma', price: 420,
        effect: (g) => { g.player.weapon = 'pistol'; g.player.ammo += 40; } },
      { id: 'ammo', icon: '📦', name: '40 munizioni', desc: 'Ricarica', price: 90, effect: (g) => { g.player.ammo += 40; } },
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
    title: 'GARAGE PIT', desc: 'Meccanica, gomme e qualche domanda in meno.',
    items: [
      { id: 'repair', icon: '🔧', name: 'Riparazione completa', desc: 'Ripara il veicolo parcheggiato fuori', price: 120,
        effect: (g) => { g.repairLastCar(); } },
      { id: 'sport', icon: '🏎️', name: 'Coupé sportiva', desc: 'Consegnata fuori dal garage', price: 2500,
        effect: (g) => g.deliverCar('sport') },
      { id: 'suv', icon: '🚙', name: 'SUV', desc: 'Consegnato fuori dal garage', price: 1400, effect: (g) => g.deliverCar('suv') },
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

const PALETTE = {
  burger:   { wall: 0xf0e0c8, floor: 0xc44a2c, accent: 0xff7a3d },
  pharmacy: { wall: 0xeef6f0, floor: 0xd7e6dc, accent: 0x3ddc84 },
  store:    { wall: 0xe8eaee, floor: 0xb9bec7, accent: 0x4cc2ff },
  ammu:     { wall: 0x5a626d, floor: 0x3c434d, accent: 0xff4d5e },
  clothes:  { wall: 0xf4eef6, floor: 0xe0d4e6, accent: 0xe46bff },
  bar:      { wall: 0x6b564a, floor: 0x453b33, accent: 0xffd23f },
  garage:   { wall: 0xa7b0ba, floor: 0x6b727b, accent: 0xffb020 },
  home:     { wall: 0xe9dfcc, floor: 0x8a6440, accent: 0xffe9a8 },
};

/** Una stanza costruita al volo e riusata per tutti i locali dello stesso tipo. */
class Interior {
  constructor(type) {
    this.type = type;
    this.group = new THREE.Group();
    this.boxes = [];
    this.origin = ORIGIN;
    this.limit = Infinity;     // le stanze stanno fuori dal mondo di gioco
    const pal = PALETTE[type] || PALETTE.store;
    const gb = new GeoBuilder();
    const glow = new GeoBuilder();
    const ox = ORIGIN.x, oz = ORIGIN.z;

    // pavimento, soffitto, pareti
    gb.box(ox, -0.05, oz, W, 0.1, D, pal.floor);
    gb.box(ox, H + 0.05, oz, W, 0.1, D, 0xdfe3e8);
    gb.box(ox, H / 2, oz - D / 2, W, H, 0.3, pal.wall);
    gb.box(ox - W / 2, H / 2, oz, 0.3, H, D, pal.wall);
    gb.box(ox + W / 2, H / 2, oz, 0.3, H, D, pal.wall);
    // parete d'ingresso con vetrina e porta
    gb.box(ox - W / 4 - 1, H / 2, oz + D / 2, W / 2 - 2, H, 0.3, pal.wall);
    gb.box(ox + W / 4 + 1, H / 2, oz + D / 2, W / 2 - 2, H, 0.3, pal.wall);
    gb.box(ox, H - 0.4, oz + D / 2, 4, 0.8, 0.3, pal.wall);
    // porta chiusa: la stanza resta un ambiente sigillato, si esce col trigger
    gb.box(ox, 1.6, oz + D / 2 - 0.02, 4, 3.2, 0.22, 0x4a3324);
    gb.box(ox, 1.6, oz + D / 2 - 0.16, 0.16, 3.2, 0.06, 0x2b1d14);
    glow.box(ox, 3.05, oz + D / 2 - 0.2, 1.6, 0.22, 0.06, 0x3ddc84);
    this._wall(ox - W / 2, oz, 0.4, D);
    this._wall(ox + W / 2, oz, 0.4, D);
    this._wall(ox, oz - D / 2, W, 0.4);

    // luci a soffitto
    for (let i = -1; i <= 1; i++) glow.box(ox + i * 4.5, H - 0.12, oz, 2.6, 0.16, 0.7, 0xfff2d0);

    this.exit = { x: ox, z: oz + D / 2 - 0.6 };
    this.counter = { x: ox, z: oz - 2.6 };
    this._furnish(type, gb, glow, pal, ox, oz);

    this.group.add(new THREE.Mesh(gb.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.group.add(new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true })));

    // due plafoniere vere: le luci di una stanza nascosta non costano nulla,
    // three.js salta gli oggetti non visibili
    for (const dz of [-3.2, 3.2]) {
      const lamp = new THREE.PointLight(0xffe9c4, 11, 24, 1.0);
      lamp.position.set(ORIGIN.x, H - 0.4, ORIGIN.z + dz);
      this.group.add(lamp);
    }

    // commesso dietro al bancone
    this.clerk = makeCharacter({});
    this.clerk.position.set(ox, 0, oz - 4.1);
    this.clerk.rotation.y = -Math.PI / 2;
    this.group.add(this.clerk);

    this.group.visible = false;
  }

  _wall(x, z, sx, sz) { this.boxes.push({ x, z, hx: sx / 2, hz: sz / 2 }); }

  _furnish(type, gb, glow, pal, ox, oz) {
    // bancone comune a tutti i locali
    gb.box(ox, 0.55, oz - 2.6, 7, 1.1, 0.9, pal.accent);
    gb.box(ox, 1.15, oz - 2.6, 7.3, 0.1, 1.2, 0xf5f5f5);
    this._wall(ox, oz - 2.6, 7.3, 1.2);

    // scaffali lungo le pareti laterali
    for (const sx of [-1, 1]) {
      for (let k = -1; k <= 1; k++) {
        gb.box(ox + sx * (W / 2 - 1.1), 0.9, oz + k * 3.4, 1.4, 1.8, 2.4, 0xb9b3a6);
        gb.box(ox + sx * (W / 2 - 1.1), 1.35, oz + k * 3.4, 1.5, 0.12, 2.5, pal.accent);
        this._wall(ox + sx * (W / 2 - 1.1), oz + k * 3.4, 1.5, 2.5);
      }
    }

    switch (type) {
      case 'burger':
      case 'bar':
        // tavoli ai lati: il corridoio centrale verso il bancone resta libero
        for (const sx of [-1, 1]) {
          for (const dz of [1.4, 4.2]) {
            gb.box(ox + sx * 5.0, 0.4, oz + dz, 1.8, 0.8, 1.8, 0x8a5a3a);
            gb.box(ox + sx * 5.0, 0.75, oz + dz, 2.0, 0.12, 2.0, 0xd9c7a8);
            this._wall(ox + sx * 5.0, oz + dz, 2.0, 2.0);
          }
        }
        glow.box(ox, 2.6, oz - 3.4, 5, 1, 0.2, pal.accent);
        break;
      case 'ammu':
        gb.box(ox, 1.9, oz - 3.2, 6, 1.4, 0.3, 0x1a1d24);
        for (let i = -2; i <= 2; i++) gb.box(ox + i * 1.1, 1.9, oz - 3.05, 0.7, 0.9, 0.15, 0x6b727d);
        break;
      case 'clothes':
        for (const sx of [-1, 1]) {
          gb.box(ox + sx * 3.6, 1.6, oz + 1.6, 0.12, 0.12, 3.4, 0x9aa3ad);
          for (let k = -2; k <= 2; k++) gb.box(ox + sx * 3.6, 1.05, oz + 1.6 + k * 0.55, 0.5, 1.0, 0.16, 0x000000 | (0x333333 + k * 0x224466));
        }
        break;
      case 'garage':
        gb.box(ox - 3.5, 0.6, oz + 1.5, 4.4, 1.2, 2.2, 0x7a828c);
        gb.box(ox + 4.2, 1.0, oz - 0.5, 1.6, 2.0, 1.2, 0xffb020);
        this._wall(ox - 3.5, oz + 1.5, 4.4, 2.2);
        break;
      case 'home':
        gb.box(ox - 4, 0.35, oz - 0.5, 3.2, 0.7, 2.1, 0x3f5d7a);      // letto
        gb.box(ox - 4, 0.75, oz - 1.3, 3.2, 0.2, 0.6, 0xf2efe6);
        gb.box(ox + 4, 0.45, oz + 1.2, 2.6, 0.9, 1.1, 0x6b4a3a);      // divano
        gb.box(ox + 4, 1.3, oz - 2.2, 2.2, 1.3, 0.2, 0x14171d);       // TV
        glow.box(ox + 4, 1.3, oz - 2.05, 2.0, 1.1, 0.05, 0x5fa8ff);
        this._wall(ox - 4, oz - 0.5, 3.2, 2.1);
        this._wall(ox + 4, oz + 1.2, 2.6, 1.1);
        break;
      default:
        for (let i = -1; i <= 1; i += 2) {
          gb.box(ox + i * 2.6, 0.55, oz + 2.2, 2.2, 1.1, 1.0, 0xb9b3a6);
          this._wall(ox + i * 2.6, oz + 2.2, 2.2, 1.0);
        }
    }
  }

  /** Stessa interfaccia della citta': cosi' il giocatore non sa la differenza. */
  resolve(x, z, r, out) {
    let hit = false;
    const ox = ORIGIN.x, oz = ORIGIN.z;
    const nx = clamp(x, ox - W / 2 + r + 0.2, ox + W / 2 - r - 0.2);
    const nz = clamp(z, oz - D / 2 + r + 0.2, oz + D / 2 - r - 0.2);
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

export class InteriorManager {
  constructor(game) {
    this.game = game;
    this.cache = new Map();
    this.current = null;
    this.door = null;
    this.group = new THREE.Group();
    game.scene.add(this.group);
  }

  get(type) {
    if (!this.cache.has(type)) {
      const it = new Interior(type);
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
    p.place(ORIGIN.x, ORIGIN.z + D / 2 - 2.2, Math.PI / 2);
    p.city = it;
    p.indoor = true;
    p.camYaw = Math.PI / 2;      // la camera sta dietro le spalle, verso la porta
    p.camPitch = 0.1;
    p.camPos.set(ORIGIN.x, 2.4, ORIGIN.z + D / 2 + 1.2);
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
    // si esce sul marciapiede guardando lungo la strada: cosi' la camera
    // resta in strada invece di finire dentro la vetrina
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
    animateCharacter(this.current.clerk, 0, this.game.time, 'walk', 0);
    this.current.clerk.rotation.y = -Math.PI / 2 + Math.sin(this.game.time * 0.7) * 0.35;
  }

  /** true se il giocatore e' davanti al bancone. */
  atCounter(p) {
    if (!this.current) return false;
    return Math.hypot(p.x - this.current.counter.x, p.z - (this.current.counter.z + 1.6)) < 2.4;
  }

  atExit(p) {
    if (!this.current) return false;
    return Math.hypot(p.x - this.current.exit.x, p.z - this.current.exit.z) < 2.2;
  }
}
