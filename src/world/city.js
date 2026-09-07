import * as THREE from 'three';
import { CFG, roadX, roadZ, blockBounds, WORLD_MIN, WORLD_MAX } from '../core/config.js';
import { GeoBuilder, mulberry32, clamp, rand, randInt, pick } from '../core/utils.js';
import * as TX from './textures.js';
import { Props } from './props.js';
import { tower, midrise, house, strip, awning, entrance } from './buildings.js';

const HALF = CFG.ROAD / 2;          // 8   bordo isolato dal centro strada
const DRIVE = HALF - CFG.WALK;      // 5   mezza carreggiata
const WALKC = HALF - CFG.WALK / 2;  // 6.5 centro marciapiede
const CURB = 0.17;                  // altezza del cordolo

const SHOP_KINDS = [
  { type: 'burger',   name: 'BURGER SHOT',  color: '#ff7a3d' },
  { type: 'pharmacy', name: 'FARMACIA 24H', color: '#3ddc84' },
  { type: 'store',    name: 'MINI MARKET',  color: '#4cc2ff' },
  { type: 'ammu',     name: 'AMMU NOVA',    color: '#ff4d5e' },
  { type: 'clothes',  name: 'THREADS',      color: '#e46bff' },
  { type: 'bar',      name: 'BAR LUNA',     color: '#ffd23f' },
  { type: 'garage',   name: 'GARAGE PIT',   color: '#ffb020' },
  { type: 'home',     name: 'CASA',         color: '#ffe9a8' },
  { type: 'diner',    name: 'TAVOLA CALDA',  color: '#ff7a3d' },
  { type: 'gym',      name: 'IRON NOVA',     color: '#3ddc84' },
  { type: 'bank',     name: 'BANCA DI NOVA', color: '#2f6fd0' },
  { type: 'club',     name: 'CLUB VELVET',   color: '#e46bff' },
  { type: 'office',   name: 'NOVA CONSULTING', color: '#8ad8ff' },
  { type: 'barber',   name: 'BARBIERE',      color: '#c02c3a' },
];

/** Luoghi fissi: la citta' ha dei punti di riferimento riconoscibili. */
const LANDMARKS = {
  '1,2': 'police',
  '6,2': 'hospital',
  '2,5': 'gas',
  '5,4': 'gas',
  '3,3': 'sport',
  '4,5': 'casino',
  '0,6': 'gas',
};

const BILLBOARDS = [
  ['NOVA COLA', 'la sete non dorme'],
  ['SUNSET MOTEL', 'camere dalle 19'],
  ['RADIO 104.7', 'solo successi'],
  ['VISITA LA COSTA', 'spiaggia est'],
];

class HashGrid {
  constructor(cell = 24) { this.cell = cell; this.map = new Map(); }
  key(cx, cz) { return cx * 8192 + cz; }
  add(box) {
    const c = this.cell;
    const x0 = Math.floor((box.x - box.hx) / c), x1 = Math.floor((box.x + box.hx) / c);
    const z0 = Math.floor((box.z - box.hz) / c), z1 = Math.floor((box.z + box.hz) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = this.key(i, j);
      let a = this.map.get(k);
      if (!a) { a = []; this.map.set(k, a); }
      a.push(box);
    }
  }
  near(x, z, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const a = this.map.get(this.key(i, j));
      if (a) for (const b of a) if (out.indexOf(b) < 0) out.push(b);
    }
    return out;
  }
}

export class City {
  constructor(quality) {
    this.quality = quality;
    this.group = new THREE.Group();
    this.grid = new HashGrid(24);
    this.doors = [];
    this.walkNodes = [];
    this.roadNodes = [];
    this.parkSpots = [];
    this.bikeSpots = [];
    this.lamps = [];
    this.landmarks = [];
    this.benches = [];
    this.limit = 620;
    this._tmp = [];
    this.rng = mulberry32(20260906);
    this.beachRow = CFG.N - 1;      // ultima fila di isolati: spiaggia
    this.shore = WORLD_MAX + 70;    // dove comincia l'acqua
  }

  build() {
    this._materials();
    this._ground();
    this._roads();
    this._blocks();
    this._graphs();
    this._markGunShops();
    return this;
  }

  // ------------------------------------------------------------- materiali
  _materials() {
    const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
    const facade = (style) => {
      const s = TX.facadeSet(style);
      return std({
        map: s.map, normalMap: s.normal, roughnessMap: s.roughness, emissiveMap: s.emissive,
        emissive: 0x000000, roughness: 1, metalness: style === 'office' ? 0.22 : 0.02,
        envMapIntensity: style === 'office' ? 0.55 : 0.3,
        normalScale: new THREE.Vector2(0.6, 0.6),
      });
    };
    const store = TX.storefrontTexture();
    const asphalt = TX.asphaltSet();
    const walk = TX.sidewalkSet();
    const sand = TX.sandTexture();
    const bark = TX.palmBarkTexture();
    const roof = TX.roofTexture();

    this.mats = {
      office: facade('office'),
      stucco: facade('stucco'),
      brick: facade('brick'),
      concrete: facade('concrete'),
      store: std({
        map: store.map, normalMap: store.normal, emissiveMap: store.emissive, emissive: 0x000000,
        roughness: 0.6, metalness: 0.15, envMapIntensity: 0.5,
      }),
      detail: std({ roughness: 0.84, metalness: 0.06, envMapIntensity: 0.35 }),
      roof: std({ map: roof.map, normalMap: roof.normal, roughness: 0.96, metalness: 0, envMapIntensity: 0.25 }),
      road: std({
        map: asphalt.map, normalMap: asphalt.normal, roughnessMap: asphalt.roughness,
        roughness: 1, metalness: 0.0, envMapIntensity: 0.2,
        normalScale: new THREE.Vector2(0.55, 0.55),
      }),
      paint: std({ roughness: 0.7, metalness: 0, envMapIntensity: 0.25 }),
      walk: std({
        map: walk.map, normalMap: walk.normal, roughness: 0.94, metalness: 0,
        envMapIntensity: 0.22, normalScale: new THREE.Vector2(0.4, 0.4),
      }),
      grass: std({ map: TX.grassTexture(), roughness: 0.98, envMapIntensity: 0.3 }),
      sand: std({ map: sand.map, normalMap: sand.normal, roughness: 0.95, envMapIntensity: 0.4 }),
      foliage: std({ roughness: 0.95, metalness: 0, envMapIntensity: 0.4 }),
      bark: std({ map: bark.map, normalMap: bark.normal, roughness: 0.92, envMapIntensity: 0.3 }),
      frond: new THREE.MeshStandardMaterial({
        map: TX.palmFrondTexture(), alphaTest: 0.42, side: THREE.DoubleSide,
        roughness: 0.85, metalness: 0, envMapIntensity: 0.5,
      }),
      leaf: new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true, envMapIntensity: 0.35 }),
      tuft: new THREE.MeshStandardMaterial({
        map: TX.grassTuftTexture(), alphaTest: 0.5, side: THREE.DoubleSide,
        roughness: 0.95, metalness: 0, envMapIntensity: 0.35,
      }),
      water: new THREE.MeshStandardMaterial({
        color: 0x14607f, roughness: 0.22, metalness: 0.25, envMapIntensity: 0.7,
        normalMap: TX.waterNormal(), normalScale: new THREE.Vector2(0.55, 0.55),
      }),
      neon: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      lamp: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      glow: new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
      }),
      redA: new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }),
      redB: new THREE.MeshBasicMaterial({ color: 0x3a0d0d, toneMapped: false }),
      greenA: new THREE.MeshBasicMaterial({ color: 0x0d2a14, toneMapped: false }),
      greenB: new THREE.MeshBasicMaterial({ color: 0x24d05a, toneMapped: false }),
    };
    this.mats.water.normalMap.repeat.set(24, 24);
    this.facades = ['office', 'stucco', 'brick', 'concrete'];
  }

  _mesh(geoBuilder, mat, { cast = true, receive = true } = {}) {
    if (geoBuilder.empty) return null;
    const m = new THREE.Mesh(geoBuilder.build(), mat);
    m.castShadow = cast && this.quality.shadows;
    m.receiveShadow = receive && this.quality.shadows;
    this.group.add(m);
    return m;
  }

  // --------------------------------------------------------------- terreno
  _ground() {
    // il terreno arriva fino alla battigia e non oltre, altrimenti coprirebbe
    // il mare (che sta piu' in basso)
    const gx0 = WORLD_MIN - 400, gx1 = WORLD_MAX + 400;
    const gz0 = WORLD_MIN - 400, gz1 = this.shore - 34;
    const g = new THREE.PlaneGeometry(gx1 - gx0, gz1 - gz0, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate((gx0 + gx1) / 2, 0, (gz0 + gz1) / 2);
    const span = Math.max(gx1 - gx0, gz1 - gz0);
    // materiale dedicato: quello dell'erba usa i vertex color, che questo
    // piano non ha (e senza attributo il terreno veniva nero)
    this.mats.ground = new THREE.MeshStandardMaterial({
      map: this.mats.grass.map, roughness: 0.98, metalness: 0, envMapIntensity: 0.3,
    });
    const dirt = new THREE.Mesh(g, this.mats.ground);
    dirt.position.set(0, -0.14, 0);
    dirt.receiveShadow = this.quality.shadows;
    this.mats.grass.map.repeat.set(span / 8, span / 8);
    this.group.add(dirt);

    // oceano: un piano enorme oltre la citta', con normal map animata
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), this.mats.water);
    sea.rotateX(-Math.PI / 2);
    sea.position.set(0, -1.1, this.shore + 3500 - 12);
    this.group.add(sea);
    this.sea = sea;

    // spiaggia con battigia: sabbia piana, poi la scarpata fino all'acqua
    const sandGB = new GeoBuilder();
    const beachStart = roadZ(this.beachRow) - CFG.ROAD;
    const x0 = WORLD_MIN - 300, x1 = WORLD_MAX + 300;
    const flatEnd = this.shore - 26;
    const wet = this.shore + 6;
    sandGB.quadY(x0, beachStart, x1, flatEnd, -0.05, 0xffffff, (x1 - x0) / 10, (flatEnd - beachStart) / 10);
    sandGB.quad([x0, -0.05, flatEnd], [x1, -0.05, flatEnd], [x1, -1.25, wet], [x0, -1.25, wet],
      0xf0e2c4, (x1 - x0) / 10, 3);
    const beach = new THREE.Mesh(sandGB.build(), this.mats.sand);
    beach.receiveShadow = this.quality.shadows;
    this.group.add(beach);

    // schiuma sulla battigia
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0, 9),
      new THREE.MeshBasicMaterial({ color: 0xf2f8fb, transparent: true, opacity: 0.55, depthWrite: false })
    );
    foam.rotateX(-Math.PI / 2);
    foam.position.set((x0 + x1) / 2, -1.02, this.shore + 2);
    this.group.add(foam);
    this.foam = foam;
  }

  // ---------------------------------------------------------------- strade
  _roads() {
    const rgb = new GeoBuilder();
    const paint = new GeoBuilder();
    const wgb = new GeoBuilder();
    const det = new GeoBuilder();
    const N = CFG.N;
    const T = 1 / 8;   // texture asfalto ogni 8 m

    for (let i = 0; i <= N; i++) {
      const x = roadX(i);
      rgb.quadY(x - DRIVE, WORLD_MIN, x + DRIVE, WORLD_MAX, 0.0,
        0xffffff, DRIVE * 2 * T, (WORLD_MAX - WORLD_MIN) * T);
    }
    for (let j = 0; j <= N; j++) {
      const z = roadZ(j);
      rgb.quadY(WORLD_MIN, z - DRIVE, WORLD_MAX, z + DRIVE, 0.005,
        0xffffff, (WORLD_MAX - WORLD_MIN) * T, DRIVE * 2 * T);
    }

    // --- segnaletica orizzontale
    const dash = (x0, z0, x1, z1) => paint.quadY(x0, z0, x1, z1, 0.02, 0xe8e2c8);
    const line = (x0, z0, x1, z1) => paint.quadY(x0, z0, x1, z1, 0.02, 0xe9e6dc);
    for (let i = 0; i <= N; i++) {
      const c = roadX(i);
      for (let j = 0; j < N; j++) {
        const a = roadZ(j) + DRIVE + 2.4, b = roadZ(j + 1) - DRIVE - 2.4;
        for (let t = a; t < b; t += 6) dash(c - 0.16, t, c + 0.16, Math.min(t + 3, b));
        for (const sgn of [-1, 1]) {
          line(c + sgn * (DRIVE - 0.42) - 0.1, a, c + sgn * (DRIVE - 0.42) + 0.1, b);
        }
      }
    }
    for (let j = 0; j <= N; j++) {
      const c = roadZ(j);
      for (let i = 0; i < N; i++) {
        const a = roadX(i) + DRIVE + 2.4, b = roadX(i + 1) - DRIVE - 2.4;
        for (let t = a; t < b; t += 6) dash(t, c - 0.16, Math.min(t + 3, b), c + 0.16);
        for (const sgn of [-1, 1]) {
          line(a, c + sgn * (DRIVE - 0.42) - 0.1, b, c + sgn * (DRIVE - 0.42) + 0.1);
        }
      }
    }

    // --- incroci: strisce pedonali e linee d'arresto
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const x = roadX(i), z = roadZ(j);
        for (const s of [-1, 1]) {
          for (let k = 0; k < 8; k++) {
            const o = (k - 3.5) * 1.15;
            paint.quadY(x + o - 0.34, z + s * (DRIVE + 0.9) - 1.5, x + o + 0.34, z + s * (DRIVE + 0.9) + 1.5, 0.02, 0xf0ece0);
            paint.quadY(x + s * (DRIVE + 0.9) - 1.5, z + o - 0.34, x + s * (DRIVE + 0.9) + 1.5, z + o + 0.34, 0.02, 0xf0ece0);
          }
          // linea di arresto sulla corsia di destra
          paint.quadY(x + (s > 0 ? 0.4 : -DRIVE + 0.5), z + s * (DRIVE + 2.6) - 0.25,
            x + (s > 0 ? DRIVE - 0.5 : -0.4), z + s * (DRIVE + 2.6) + 0.25, 0.02, 0xf0ece0);
          paint.quadY(x + s * (DRIVE + 2.6) - 0.25, z + (s > 0 ? -DRIVE + 0.5 : 0.4),
            x + s * (DRIVE + 2.6) + 0.25, z + (s > 0 ? -0.4 : DRIVE - 0.5), 0.02, 0xf0ece0);
        }
        // tombino
        det.box(x + 3.6, 0.015, z - 3.6, 0.8, 0.06, 0.8, 0x4a4a4a);
        // frecce di corsia in avvicinamento all'incrocio
        for (const s2 of [-1, 1]) {
          const az = z + s2 * (DRIVE + 9);
          const ax = x + s2 * 2.4;
          paint.quadY(ax - 0.22, az - 1.5, ax + 0.22, az + 1.5, 0.021, 0xe9e6dc);
          paint.quadY(ax - 0.62, az + s2 * 1.1, ax + 0.62, az + s2 * 1.5, 0.021, 0xe9e6dc);
          const bx = x + s2 * (DRIVE + 9), bz = z - s2 * 2.4;
          paint.quadY(bx - 1.5, bz - 0.22, bx + 1.5, bz + 0.22, 0.021, 0xe9e6dc);
          paint.quadY(bx + s2 * 1.1, bz - 0.62, bx + s2 * 1.5, bz + 0.62, 0.021, 0xe9e6dc);
        }
      }
    }

    // --- marciapiedi con cordolo
    for (let i = 0; i < CFG.N; i++) {
      for (let j = 0; j < CFG.N; j++) {
        const b = blockBounds(i, j);
        const o = CFG.WALK;
        const strips = [
          [(b.x0 + b.x1) / 2, b.z0 - o / 2, (b.x1 - b.x0) + o * 2, o],
          [(b.x0 + b.x1) / 2, b.z1 + o / 2, (b.x1 - b.x0) + o * 2, o],
          [b.x0 - o / 2, (b.z0 + b.z1) / 2, o, (b.z1 - b.z0)],
          [b.x1 + o / 2, (b.z0 + b.z1) / 2, o, (b.z1 - b.z0)],
        ];
        for (const [cx, cz, sx, sz] of strips) {
          wgb.box(cx, CURB / 2, cz, sx, CURB, sz, 0xffffff, 0.5);
          // bordo del cordolo, leggermente piu' scuro e sporgente
          const ex = sx > sz ? sx : 0.16, ez = sx > sz ? 0.16 : sz;
          const dx = sx > sz ? 0 : (cx > b.cx ? -sx / 2 : sx / 2);
          const dz = sx > sz ? (cz > b.cz ? -sz / 2 : sz / 2) : 0;
          det.box(cx - dx, CURB / 2 + 0.005, cz - dz, ex, CURB + 0.01, ez, 0xcac4b6);
          // tratti di divieto dipinti sul cordolo: rosso o giallo, a spezzoni
          const along = sx > sz ? sx : sz;
          const paintRng = mulberry32((i * 131 + j * 17 + (sx > sz ? 1 : 2) + (dx + dz) * 7) | 0);
          for (let k = 0; k < 3; k++) {
            if (paintRng() > 0.34) continue;
            const t = (paintRng() - 0.5) * 0.62;
            const len = along * (0.14 + paintRng() * 0.18);
            const col = paintRng() < 0.7 ? 0xb4342c : 0xd8a520;
            det.box(
              cx - dx + (sx > sz ? along * t : 0), CURB / 2 + 0.012, cz - dz + (sx > sz ? 0 : along * t),
              sx > sz ? len : 0.175, CURB - 0.02, sx > sz ? 0.175 : len, col
            );
          }
        }
      }
    }

    const r = this._mesh(rgb, this.mats.road, { cast: false });
    if (r) r.frustumCulled = false;
    this._mesh(paint, this.mats.paint, { cast: false });
    this._mesh(wgb, this.mats.walk, { cast: false });
    this._mesh(det, this.mats.detail, { cast: false });
  }

  // -------------------------------------------------------------- isolati
  _blocks() {
    const rng = this.rng;
    const N = CFG.N, c = (N - 1) / 2;
    const shopQueue = [];
    for (let k = 0; k < 60; k++) shopQueue.push(SHOP_KINDS[k % SHOP_KINDS.length]);

    // builder globali per elementi sparsi su tutta la citta'
    const G = this._newBuilders();
    G.props = new Props(G);
    const billboards = [];

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const b = blockBounds(i, j);
        const ring = Math.max(Math.abs(i - c), Math.abs(j - c));
        const B = this._newBuilders();
        B.props = new Props(B);

        let kind = LANDMARKS[`${i},${j}`];
        if (!kind) {
          if (j === this.beachRow) kind = 'beach';
          else if (ring <= 1.2) kind = 'downtown';
          else if (ring <= 2.6) kind = rng() < 0.12 ? 'park' : 'commercial';
          else kind = rng() < 0.16 ? 'park' : rng() < 0.12 ? 'parking' : 'suburb';
        }

        if (kind === 'beach') this._beachBlock(b, B, rng, i === 3);
        else if (kind === 'park') this._park(b, B, rng);
        else if (kind === 'parking') this._parking(b, B, rng);
        else if (kind === 'gas') this._gasStation(b, B, rng);
        else if (kind === 'police') this._policeStation(b, B, rng);
        else if (kind === 'hospital') this._hospital(b, B, rng);
        else if (kind === 'sport') this._sportsBlock(b, B, rng);
        else if (kind === 'casino') this._casinoBlock(b, B, rng);
        else this._builtBlock(b, kind, B, rng, shopQueue, billboards);

        this._streetProps(b, i, j, B, rng);
        B.props.finish(this.group, this.mats);
        for (const bench of B.props.benches) this.benches.push(bench);
        this._flush(B);
      }
    }

    // semafori e lampioni agli incroci
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) this._intersection(roadX(i), roadZ(j), G.props);
    }
    for (const bb of billboards) this._billboard(bb.x, bb.y, bb.z, bb.rot);
    G.props.finish(this.group, this.mats);
    this._flush(G);
  }

  _newBuilders() {
    const B = {};
    for (const k of ['office', 'stucco', 'brick', 'concrete', 'store', 'detail', 'paint',
                     'neon', 'lamp', 'glow', 'foliage', 'bark', 'grass', 'sand', 'water', 'roof',
                     'redA', 'redB', 'greenA', 'greenB']) B[k] = new GeoBuilder();
    return B;
  }

  _flush(B) {
    for (const k of ['office', 'stucco', 'brick', 'concrete', 'store']) {
      this._mesh(B[k], this.mats[k]);
    }
    this._mesh(B.detail, this.mats.detail);
    this._mesh(B.roof, this.mats.roof, { cast: false });
    if (B.walk) this._mesh(B.walk, this.mats.walk, { cast: false });
    if (B.road) this._mesh(B.road, this.mats.road, { cast: false });
    this._mesh(B.paint, this.mats.paint, { cast: false });
    this._mesh(B.foliage, this.mats.foliage);
    this._mesh(B.bark, this.mats.bark);
    this._mesh(B.grass, this.mats.grass, { cast: false });
    this._mesh(B.sand, this.mats.sand, { cast: false });
    this._mesh(B.water, this.mats.water, { cast: false });
    for (const k of ['redA', 'redB', 'greenA', 'greenB']) {
      const m = this._mesh(B[k], this.mats[k], { cast: false, receive: false });
      if (m) m.frustumCulled = true;
    }
    const neon = this._mesh(B.neon, this.mats.neon, { cast: false, receive: false });
    if (neon) { this.neonMeshes = this.neonMeshes || []; this.neonMeshes.push(neon); }
    for (const key of ['lamp', 'glow']) {
      const m = this._mesh(B[key], this.mats[key], { cast: false, receive: false });
      if (m) {
        m.visible = false;
        m.renderOrder = key === 'glow' ? 2 : 0;
        this.lampMeshes = this.lampMeshes || [];
        this.lampMeshes.push(m);
      }
    }
  }

  // --------------------------------------------------------- tipi di isolato
  _builtBlock(b, kind, B, rng, shopQueue, billboards) {
    // pavimentazione dell'intero isolato: senza, tra edificio e marciapiede
    // spuntava una striscia di prato
    B.walk = B.walk || new GeoBuilder();
    B.walk.quadY(b.x0 - 0.2, b.z0 - 0.2, b.x1 + 0.2, b.z1 + 0.2, 0.015, 0xe8e4da,
      (b.x1 - b.x0) / 2, (b.z1 - b.z0) / 2);
    const lots = this._splitLot(b.x0, b.z0, b.x1, b.z1, kind, rng);
    for (const lot of lots) {
      const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0;
      if (w < 7 || d < 7) continue;
      const faces = this._streetFaces(lot, b);
      const face = faces.length ? pick(faces) : null;
      const ctx = {
        rng, face,
        collider: (x, z, hx, hz) => this.grid.add({ x, z, hx, hz }),
      };

      let info, style = 'stucco';
      if (kind === 'downtown') {
        if (rng() < 0.62 && w > 22 && d > 22) info = tower(B, lot, ctx);
        else { style = pick(['concrete', 'office', 'brick']); info = midrise(B, lot, ctx, style); }
      } else if (kind === 'commercial') {
        if (rng() < 0.22) info = strip(B, lot, ctx);
        else { style = pick(['stucco', 'brick', 'stucco', 'concrete']); info = midrise(B, lot, ctx, style); }
      } else {
        if (rng() < 0.12 && faces.length) info = strip(B, lot, ctx);
        else info = house(B, lot, ctx);
      }

      if (kind === 'suburb') {
        B.grass.quadY(lot.x0 + 0.4, lot.z0 + 0.4, lot.x1 - 0.4, lot.z1 - 0.4, 0.02, 0xffffff,
          (lot.x1 - lot.x0) / 5, (lot.z1 - lot.z0) / 5);
        B.props.grassPatch(lot.x0 + 0.6, lot.z0 + 0.6, lot.x1 - 0.6, lot.z1 - 0.6, rng, 0.8);
      }
      // vialetto d'accesso per le villette
      if (kind === 'suburb' && face) {
        const px = info.cx + face.nx * (d / 2 + 2), pz = info.cz + face.nz * (w / 2 + 2);
        B.paint.quadY(
          Math.min(info.cx + face.nx * info.w / 2, info.cx + face.nx * (lot.x1 - lot.x0) / 2) - (face.nx ? 0 : 1.8),
          Math.min(info.cz + face.nz * info.d / 2, info.cz + face.nz * (lot.z1 - lot.z0) / 2) - (face.nz ? 0 : 1.8),
          Math.max(info.cx + face.nx * info.w / 2, info.cx + face.nx * (lot.x1 - lot.x0) / 2) + (face.nx ? 0 : 1.8),
          Math.max(info.cz + face.nz * info.d / 2, info.cz + face.nz * (lot.z1 - lot.z0) / 2) + (face.nz ? 0 : 1.8),
          0.03, 0xb9b3a6, 2, 2);
      }

      // negozio con insegna e tettoia
      const wantShop = face && shopQueue.length &&
        rng() < (kind === 'downtown' ? 0.4 : kind === 'commercial' ? 0.72 : 0.34);
      if (wantShop) {
        const isHome = kind === 'suburb' && rng() < 0.5;
        const kindShop = isHome ? SHOP_KINDS[SHOP_KINDS.length - 1]
          : shopQueue.splice(randInt(0, shopQueue.length - 1), 1)[0];
        this._shopFront(B, info, face, kindShop, kind === 'suburb');
      }

      // cartellone pubblicitario sui tetti bassi
      if (info.height < 22 && face && rng() < 0.16 && billboards.length < 8) {
        billboards.push({
          x: info.cx + face.nx * info.w * 0.2, y: info.height + 1.6,
          z: info.cz + face.nz * info.d * 0.2,
          rot: Math.atan2(face.nx, face.nz),
        });
      }
    }
  }

  _shopFront(B, info, f, shop, small) {
    const along = Math.min((f.nx !== 0 ? info.d : info.w) * 0.7, 7.5);
    const ex = info.cx + f.nx * (info.w / 2), ez = info.cz + f.nz * (info.d / 2);
    const doorH = small ? 2.4 : 3.0;
    entrance(B, ex, ez, f.nx, f.nz, Math.min(along * 0.45, 2.6), doorH, 0x2f353c);
    if (!small) awning(B, ex, ez, f.nx, f.nz, along, 3.4, new THREE.Color(shop.color).getHex());

    // insegna luminosa
    const signH = small ? 0.9 : 1.5;
    const signY = (small ? 3.1 : 4.6);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(along, signH),
      new THREE.MeshBasicMaterial({ map: TX.signTexture(shop.name, shop.color), toneMapped: false })
    );
    sign.position.set(ex + f.nx * 0.58, signY, ez + f.nz * 0.58);
    sign.rotation.y = Math.atan2(f.nx, f.nz);
    this.group.add(sign);
    B.detail.box(ex + f.nx * 0.3, signY, ez + f.nz * 0.3,
      f.nx !== 0 ? 0.25 : along + 0.4, signH + 0.35, f.nx !== 0 ? along + 0.4 : 0.25, 0x1a1d23);

    this.doors.push({
      type: shop.type, name: shop.name, color: shop.color,
      x: ex + f.nx * 2.1, z: ez + f.nz * 2.1,
      face: Math.atan2(-f.nz, f.nx),
    });
  }

  _billboard(x, y, z, rot) {
    const [a, b] = pick(BILLBOARDS);
    const w = 9, h = 3.4;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: TX.plateTexture([a, b], '#12233a', '#ffe9a8'), roughness: 0.7, side: THREE.DoubleSide })
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.rotation.y = rot;
    mesh.castShadow = this.quality.shadows;
    this.group.add(mesh);
    const gb = new GeoBuilder();
    const nx = Math.sin(rot), nz = Math.cos(rot);
    for (const s of [-1, 1]) {
      gb.box(x + nz * s * w * 0.4, y / 2 + h / 4, z - nx * s * w * 0.4, 0.24, y + h / 2, 0.24, 0x5b6167);
    }
    gb.box(x - nx * 0.2, y + h / 2, z - nz * 0.2, nx !== 0 ? 0.2 : w, 0.2, nx !== 0 ? w : 0.2, 0x5b6167);
    this._mesh(gb, this.mats.detail);
  }

  _park(b, B, rng) {
    B.grass.quadY(b.x0, b.z0, b.x1, b.z1, 0.02, 0xffffff, (b.x1 - b.x0) / 6, (b.z1 - b.z0) / 6);
    // vialetti
    B.paint.quadY(b.x0, b.cz - 1.6, b.x1, b.cz + 1.6, 0.05, 0xcfc7b6, (b.x1 - b.x0) / 4, 1);
    B.paint.quadY(b.cx - 1.6, b.z0, b.cx + 1.6, b.z1, 0.055, 0xcfc7b6, 1, (b.z1 - b.z0) / 4);
    // fontana
    B.detail.box(b.cx, 0.3, b.cz, 7, 0.6, 7, 0xc4bdae);
    B.detail.box(b.cx, 0.66, b.cz, 6.2, 0.16, 6.2, 0xb2aa9c);
    B.water.box(b.cx, 0.62, b.cz, 6.0, 0.2, 6.0, 0x2f8fb8);
    B.detail.box(b.cx, 1.5, b.cz, 0.9, 2.2, 0.9, 0xd2cbbd);
    B.detail.box(b.cx, 2.5, b.cz, 2.2, 0.3, 2.2, 0xd2cbbd);
    this.grid.add({ x: b.cx, z: b.cz, hx: 3.6, hz: 3.6 });

    for (let k = 0; k < 9; k++) {
      const x = b.x0 + 4 + rng() * (b.x1 - b.x0 - 8);
      const z = b.z0 + 4 + rng() * (b.z1 - b.z0 - 8);
      if (Math.abs(x - b.cx) < 7 && Math.abs(z - b.cz) < 7) continue;
      const p = rng() < 0.55 ? B.props.palm(x, z, rng) : B.props.tree(x, z, rng);
      this.grid.add({ x: p.x, z: p.z, hx: p.r, hz: p.r });
    }
    for (let k = 0; k < 4; k++) {
      B.props.bench(b.cx + (k < 2 ? -6 : 6), b.cz + (k % 2 ? -6 : 6), k < 2 ? 0 : Math.PI);
    }
    B.props.grassPatch(b.x0 + 1.5, b.z0 + 1.5, b.x1 - 1.5, b.z1 - 1.5, rng, 0.9);
    B.props.bin(b.cx + 8, b.cz + 8);
    for (const [sx, sz] of [[-1, -1], [1, 1]]) {
      B.props.streetlight(b.cx + sx * (b.x1 - b.x0) * 0.28, b.cz + sz * (b.z1 - b.z0) * 0.28, 0, 5.4);
    }
    // siepi a tratti lungo il perimetro, con i varchi per entrare
    const segs = [-0.34, 0.34];
    for (const s of [-1, 1]) {
      for (const t of segs) {
        B.props.hedge(b.cx + (b.x1 - b.x0) * t, b.cz + s * (b.z1 - b.z0) / 2, (b.x1 - b.x0) * 0.26, 1.0, rng);
        B.props.hedge(b.cx + s * (b.x1 - b.x0) / 2, b.cz + (b.z1 - b.z0) * t, 1.0, (b.z1 - b.z0) * 0.26, rng);
      }
    }
  }

  _parking(b, B, rng) {
    // asfalto vero anche nei parcheggi: il grigio piatto sembrava un buco
    B.road = B.road || new GeoBuilder();
    B.road.quadY(b.x0, b.z0, b.x1, b.z1, 0.03, 0xffffff, (b.x1 - b.x0) / 8, (b.z1 - b.z0) / 8);
    for (let x = b.x0 + 3; x < b.x1 - 2; x += 3) {
      B.paint.quadY(x - 0.08, b.z0 + 2, x + 0.08, b.z0 + 7.5, 0.05, 0xd8d2be);
      B.paint.quadY(x - 0.08, b.z1 - 7.5, x + 0.08, b.z1 - 2, 0.05, 0xd8d2be);
      if (rng() < 0.45) this.parkSpots.push({ x: x + 1.5, z: b.z0 + 4.7, rot: -Math.PI / 2 });
      if (rng() < 0.45) this.parkSpots.push({ x: x + 1.5, z: b.z1 - 4.7, rot: Math.PI / 2 });
    }
    for (const s of [-1, 1]) {
      B.props.streetlight(b.cx + s * (b.x1 - b.x0) * 0.3, b.cz, s > 0 ? Math.PI : 0, 7);
    }
    B.props.clutter(b.x0 + 4, b.cz, rng);
  }

  _beachBlock(b, B, rng, pier = false) {
    B.sand.quadY(b.x0 - CFG.WALK, b.z0 - CFG.WALK, b.x1 + CFG.WALK, b.z1 + 60, 0.04,
      0xffffff, (b.x1 - b.x0) / 10, (b.z1 - b.z0 + 60) / 10);
    // passeggiata in legno
    for (let x = b.x0; x < b.x1; x += 2) {
      B.detail.box(x + 1, 0.14, b.z0 + 3, 1.9, 0.28, 6, rng() < 0.5 ? 0xb08b5e : 0xa8845a);
    }
    const n = 5 + (rng() * 4) | 0;
    for (let k = 0; k < n; k++) {
      const p = B.props.palm(b.x0 + 4 + rng() * (b.x1 - b.x0 - 8), b.z0 + 9 + rng() * 26, rng);
      this.grid.add({ x: p.x, z: p.z, hx: p.r, hz: p.r });
    }
    // ombrelloni e torretta del bagnino
    for (let k = 0; k < 6; k++) {
      const x = b.x0 + 6 + rng() * (b.x1 - b.x0 - 12), z = b.z0 + 16 + rng() * 22;
      B.detail.box(x, 1.1, z, 0.1, 2.2, 0.1, 0xb0a898);
      B.detail.box(x, 2.2, z, 3.2, 0.16, 3.2, pick([0xd94f4f, 0x2f8fb8, 0xe0a92c]));
    }
    const tx = b.cx + rand(-12, 12), tz = b.z0 + 24;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      B.detail.box(tx + sx * 1.2, 1.4, tz + sz * 1.2, 0.18, 2.8, 0.18, 0xc9b28a);
    }
    B.detail.box(tx, 2.9, tz, 3.2, 0.2, 3.2, 0xe0d0b0);
    B.detail.box(tx, 3.6, tz, 2.6, 1.4, 2.6, 0xefe2c6);
    B.detail.gableRoof(tx, 4.3, tz, 3.2, 3.2, 0.9, 0xc0392b, 'x', 0.3);
    this.grid.add({ x: tx, z: tz, hx: 1.6, hz: 1.6 });
    B.props.streetlight(b.x0 + 6, b.z0 + 1, Math.PI / 2, 7);
    B.props.streetlight(b.x1 - 6, b.z0 + 1, Math.PI / 2, 7);
    if (pier) { this.landmarks.push({ kind: 'pier', x: b.cx, z: b.z1 + 40 }); this._pier(b, B, rng); }
  }

  /** Molo in legno sull'acqua, con chiosco, lampioni e barche ormeggiate. */
  _pier(b, B, rng) {
    const px = b.cx;
    const z0 = b.z1 + 6, z1 = this.shore + 46;
    const w = 11;
    // impalcato
    for (let z = z0; z < z1; z += 2) {
      B.detail.box(px, 0.62, z + 1, w, 0.18, 1.9, rng() < 0.5 ? 0xb08b5e : 0xa8845a);
    }
    // pali e parapetti
    for (let z = z0; z < z1; z += 4) {
      for (const s of [-1, 1]) {
        B.detail.box(px + s * (w / 2 - 0.3), -0.35, z, 0.34, 2.2, 0.34, 0x6b573f);
        B.detail.box(px + s * (w / 2 - 0.3), 1.15, z, 0.14, 0.9, 0.14, 0x8a6f4f);
      }
    }
    for (const s of [-1, 1]) {
      B.detail.box(px + s * (w / 2 - 0.3), 1.5, (z0 + z1) / 2, 0.1, 0.12, z1 - z0, 0x8a6f4f);
      B.detail.box(px + s * (w / 2 - 0.3), 1.15, (z0 + z1) / 2, 0.1, 0.12, z1 - z0, 0x8a6f4f);
    }
    this.grid.add({ x: px - w / 2, z: (z0 + z1) / 2, hx: 0.3, hz: (z1 - z0) / 2 });
    this.grid.add({ x: px + w / 2, z: (z0 + z1) / 2, hx: 0.3, hz: (z1 - z0) / 2 });
    // chiosco in fondo al molo
    const kz = z1 - 8;
    B.store.box(px, 2.2, kz, 7, 4.4, 6, 0xffffff, 1 / 9, 0, null, 1 / 4.4);
    B.detail.gableRoof(px, 4.4, kz, 7, 6, 1.5, 0xc0392b, 'x', 0.6);
    this.grid.add({ x: px, z: kz, hx: 3.5, hz: 3 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.3),
      new THREE.MeshBasicMaterial({ map: TX.signTexture('PIER 44', '#4cc2ff'), toneMapped: false }));
    sign.position.set(px, 4.9, kz - 3.2);
    sign.rotation.y = Math.PI;
    this.group.add(sign);
    for (let z = z0 + 8; z < z1 - 10; z += 16) {
      B.props.streetlight(px + (rng() < 0.5 ? -1 : 1) * (w / 2 - 0.8), z, 0, 4.6);
    }
    // barche ormeggiate
    for (const s of [-1, 1]) {
      const bx = px + s * (w / 2 + 3.4), bz = z1 - 22 + s * 6;
      B.detail.box(bx, 0.3, bz, 2.4, 0.7, 6, 0xf0efe8);
      B.detail.box(bx, 0.75, bz - 1, 1.6, 0.7, 2.4, 0xe8e2d4);
      B.detail.box(bx, 2.2, bz - 1, 0.12, 3.2, 0.12, 0xd8d4cc);
    }
  }

  /** Distributore: pensilina illuminata, pompe, minimarket e totem prezzi. */
  _gasStation(b, B, rng) {
    const P = B.props;
    this.landmarks.push({ kind: 'gas', x: b.cx, z: b.cz });
    B.road = B.road || new GeoBuilder();
    B.road.quadY(b.x0, b.z0, b.x1, b.z1, 0.02, 0xffffff, (b.x1 - b.x0) / 8, (b.z1 - b.z0) / 8);

    // negozio sul fondo
    const sw = Math.min(b.x1 - b.x0 - 8, 22), sd = 10;
    const sx = b.cx, sz = b.z0 + sd / 2 + 1;
    B.store.box(sx, 2.2, sz, sw, 4.4, sd, 0xffffff, 1 / 9, 0, null, 1 / 4.4);
    B.detail.box(sx, 4.75, sz, sw + 1, 1.1, sd + 1, 0xe8e2d4);
    B.roof.quadY(sx - sw / 2, sz - sd / 2, sx + sw / 2, sz + sd / 2, 4.6, 0xffffff, sw / 6, sd / 6);
    this.grid.add({ x: sx, z: sz, hx: sw / 2, hz: sd / 2 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(sw * 0.7, 9), 1.6),
      new THREE.MeshBasicMaterial({ map: TX.signTexture('NOVA GAS', '#ff5a2a'), toneMapped: false }));
    sign.position.set(sx, 4.75, sz + sd / 2 + 0.6);
    this.group.add(sign);

    // pensilina
    const cx = b.cx, cz = b.cz + 6;
    const cw = Math.min(b.x1 - b.x0 - 10, 26), cd = 13;
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
      const px = cx + dx * (cw / 2 - 1.2), pz = cz + dz * (cd / 2 - 1.2);
      B.detail.box(px, 2.6, pz, 0.7, 5.2, 0.7, 0xe8e6e2);
      this.grid.add({ x: px, z: pz, hx: 0.45, hz: 0.45 });
    }
    B.detail.box(cx, 5.5, cz, cw, 0.9, cd, 0xf2f0ec);
    B.detail.box(cx, 5.9, cz, cw + 0.6, 0.5, cd + 0.6, 0xff5a2a);
    B.glow.quadY(cx - cw / 2, cz - cd / 2, cx + cw / 2, cz + cd / 2, 4.98, 0xfff2d8);

    // pompe di benzina
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        const px = cx + dx * 4.5, pz = cz + dz * 3.4;
        B.detail.box(px, 0.12, pz, 3.4, 0.24, 1.6, 0xd8d4cc);
        B.detail.box(px, 0.95, pz, 0.9, 1.6, 0.7, 0xf0f2f4);
        B.detail.box(px, 1.45, pz + dz * 0.36, 0.6, 0.5, 0.06, 0x1b2027);
        B.neon.box(px, 1.45, pz + dz * 0.38, 0.5, 0.36, 0.02, 0x6fd0ff);
        B.detail.box(px + 0.55, 0.9, pz, 0.2, 0.6, 0.14, 0x2b3038);
        this.grid.add({ x: px, z: pz, hx: 1.7, hz: 0.8 });
      }
    }
    // totem prezzi
    const tx = b.x1 - 5, tz = b.z1 - 5;
    B.detail.box(tx, 3, tz, 0.5, 6, 0.5, 0xd8d4cc);
    B.detail.box(tx, 6.4, tz, 3.2, 2.2, 0.4, 0xff5a2a);
    B.neon.box(tx, 6.4, tz + 0.24, 2.6, 1.6, 0.04, 0xfff0d0);
    this.grid.add({ x: tx, z: tz, hx: 0.4, hz: 0.4 });

    P.streetlight(b.x0 + 4, b.z1 - 4, 0, 7);
    for (const dx of [-1, 1]) this.parkSpots.push({ x: cx + dx * 4.5, z: cz + 6.5, rot: Math.PI / 2 });
  }

  /** Commissariato: si riconosce da lontano, e' dove finisci se ti arrestano. */
  _policeStation(b, B, rng) {
    this.landmarks.push({ kind: 'police', x: b.cx, z: b.cz });
    const w = Math.min(b.x1 - b.x0 - 10, 34), d = Math.min(b.z1 - b.z0 - 12, 22);
    const cx = b.cx, cz = b.cz - 2;
    B.walk = B.walk || new GeoBuilder();
    B.walk.quadY(b.x0, b.z0, b.x1, b.z1, 0.015, 0xdedad2, (b.x1 - b.x0) / 2, (b.z1 - b.z0) / 2);
    B.concrete.box(cx, 4.2, cz, w, 8.4, d, 0xdfe3e6, -12);
    B.detail.box(cx, 8.7, cz, w + 1.2, 0.8, d + 1.2, 0xc9ccd0);
    B.roof.quadY(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 9.1, 0xffffff, w / 6, d / 6);
    // fascia blu e scalinata
    B.detail.box(cx, 5.6, cz + d / 2 + 0.1, w, 0.9, 0.3, 0x1e3a6b);
    for (let i = 0; i < 3; i++) {
      B.detail.box(cx, 0.12 + i * 0.18, cz + d / 2 + 2.2 - i * 0.7, 12, 0.22, 1.6 - i * 0.1, 0xd2cec6);
    }
    for (const dx of [-1, 1]) {
      B.detail.box(cx + dx * 4, 2.4, cz + d / 2 + 0.9, 0.7, 4.8, 0.7, 0xeceae4);
    }
    B.detail.box(cx, 5.1, cz + d / 2 + 0.9, 10, 0.7, 1.6, 0xeceae4);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.7),
      new THREE.MeshBasicMaterial({ map: TX.signTexture('POLIZIA', '#4cc2ff'), toneMapped: false }));
    sign.position.set(cx, 6.6, cz + d / 2 + 0.35);
    this.group.add(sign);
    // pennone
    B.detail.box(cx - w / 2 - 3, 4, cz + 4, 0.16, 8, 0.16, 0xd8dade);
    this.grid.add({ x: cx, z: cz, hx: w / 2, hz: d / 2 });
    // parcheggio delle volanti
    for (let k = -2; k <= 2; k++) {
      B.paint.quadY(cx + k * 3 - 0.08, b.z1 - 12, cx + k * 3 + 0.08, b.z1 - 3, 0.03, 0xd8d2be);
      if (k < 2) this.parkSpots.push({ x: cx + k * 3 + 1.5, z: b.z1 - 7.5, rot: Math.PI / 2, police: true });
    }
    // verde, alberi e recinzione perimetrale: il piazzale nudo sembrava finto
    for (const sx of [-1, 1]) {
      B.grass.quadY(sx > 0 ? cx + w / 2 + 1 : b.x0 + 1, b.z0 + 1,
        sx > 0 ? b.x1 - 1 : cx - w / 2 - 1, b.z1 - 1, 0.02, 0xffffff, 3, 4);
      for (let k = 0; k < 3; k++) {
        const p = B.props.palm(sx > 0 ? b.x1 - 5 : b.x0 + 5, b.z0 + 8 + k * 12, rng);
        this.grid.add({ x: p.x, z: p.z, hx: p.r, hz: p.r });
      }
    }
    for (let x = b.x0 + 2; x < b.x1 - 2; x += 3) {
      B.detail.box(x, 0.7, b.z1 - 1.2, 0.12, 1.4, 0.12, 0x6f7680);
    }
    B.detail.box(b.cx, 1.3, b.z1 - 1.2, b.x1 - b.x0 - 4, 0.1, 0.08, 0x6f7680);
    B.props.streetlight(b.x0 + 4, b.z1 - 4, 0, 7);
    B.props.streetlight(b.x1 - 4, b.z1 - 4, Math.PI, 7);
    this.policeStation = { x: cx, z: cz + d / 2 + 6 };
  }

  /** Ospedale: e' qui che ti risvegli dopo un brutto incontro. */
  _hospital(b, B, rng) {
    this.landmarks.push({ kind: 'hospital', x: b.cx, z: b.cz });
    const w = Math.min(b.x1 - b.x0 - 8, 36), d = Math.min(b.z1 - b.z0 - 14, 24);
    const cx = b.cx, cz = b.cz - 3;
    B.walk = B.walk || new GeoBuilder();
    B.walk.quadY(b.x0, b.z0, b.x1, b.z1, 0.015, 0xe2e6e8, (b.x1 - b.x0) / 2, (b.z1 - b.z0) / 2);
    B.concrete.box(cx, 7, cz, w, 14, d, 0xf2f4f6, -12);
    B.detail.box(cx, 14.3, cz, w + 1, 0.7, d + 1, 0xd8dcdf);
    B.roof.quadY(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 14.7, 0xffffff, w / 6, d / 6);
    // piazzola dell'elicottero
    B.paint.quadY(cx - 5, cz - 5, cx + 5, cz + 5, 14.72, 0x2b2f36, 1, 1);
    B.paint.quadY(cx - 3.4, cz - 0.6, cx + 3.4, cz + 0.6, 14.74, 0xf0ece0, 1, 1);
    B.paint.quadY(cx - 3.4, cz - 3.4, cx - 2.2, cz + 3.4, 14.74, 0xf0ece0, 1, 1);
    B.paint.quadY(cx + 2.2, cz - 3.4, cx + 3.4, cz + 3.4, 14.74, 0xf0ece0, 1, 1);
    // pensilina delle ambulanze
    B.detail.box(cx, 4.4, cz + d / 2 + 3, w * 0.6, 0.5, 6, 0xeef2f4);
    for (const dx of [-1, 1]) {
      B.detail.box(cx + dx * (w * 0.3 - 0.6), 2.2, cz + d / 2 + 5.6, 0.5, 4.4, 0.5, 0xdfe3e6);
    }
    // croce rossa
    B.neon.box(cx, 9.5, cz + d / 2 + 0.2, 3, 0.9, 0.12, 0xff3b3b);
    B.neon.box(cx, 9.5, cz + d / 2 + 0.2, 0.9, 3, 0.12, 0xff3b3b);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.7),
      new THREE.MeshBasicMaterial({ map: TX.signTexture('OSPEDALE', '#ff6b6b'), toneMapped: false }));
    sign.position.set(cx, 6.2, cz + d / 2 + 0.3);
    this.group.add(sign);
    this.grid.add({ x: cx, z: cz, hx: w / 2, hz: d / 2 });
    this.hospital = { x: cx, z: cz + d / 2 + 8 };
    B.props.streetlight(b.x1 - 4, b.z1 - 4, Math.PI, 7);
  }

  /** Il casino': insegna al neon, colonnato e fontana. Si vede da lontano. */
  _casinoBlock(b, B, rng) {
    this.landmarks.push({ kind: 'casino', x: b.cx, z: b.cz });
    B.walk = B.walk || new GeoBuilder();
    B.walk.quadY(b.x0, b.z0, b.x1, b.z1, 0.015, 0xe0d8c8, (b.x1 - b.x0) / 2, (b.z1 - b.z0) / 2);

    const w = Math.min(b.x1 - b.x0 - 12, 40), d = Math.min(b.z1 - b.z0 - 18, 26);
    const cx = b.cx, cz = b.cz - 4;
    // corpo principale con due torri laterali
    B.concrete.box(cx, 7, cz, w, 14, d, 0xf0e2c8, -12);
    B.detail.box(cx, 14.4, cz, w + 1.4, 0.9, d + 1.4, 0xd6af5a);
    B.roof.quadY(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 14.9, 0xffffff, w / 6, d / 6);
    for (const s of [-1, 1]) {
      B.concrete.box(cx + s * (w / 2 - 3), 10, cz, 6, 20, 8, 0xf6ead2, -12);
      B.detail.box(cx + s * (w / 2 - 3), 20.5, cz, 7, 1, 9, 0xd6af5a);
      B.neon.box(cx + s * (w / 2 - 3), 21.4, cz, 1.2, 1.2, 1.2, 0xffd23f);
    }
    this.grid.add({ x: cx, z: cz, hx: w / 2, hz: d / 2 });

    // pensilina d'ingresso con colonne
    const fz = cz + d / 2;
    B.detail.box(cx, 6.2, fz + 4, 16, 0.7, 8, 0xf2e6cc);
    B.detail.box(cx, 6.7, fz + 4, 17, 0.5, 9, 0xd6af5a);
    for (const dx of [-6.5, -2.2, 2.2, 6.5]) {
      for (const dz of [1.2, 7.2]) {
        B.detail.box(cx + dx, 3.1, fz + dz, 0.9, 6.2, 0.9, 0xf6ead2);
        this.grid.add({ x: cx + dx, z: fz + dz, hx: 0.6, hz: 0.6 });
      }
    }
    // tappeto rosso e fontana
    B.paint.quadY(cx - 3, fz + 1, cx + 3, b.z1 - 1, 0.03, 0x8f2030, 1, 4);
    const fx = cx, fzz = b.z1 - 8;
    B.detail.box(fx, 0.4, fzz, 7, 0.8, 7, 0xe0d6c2);
    B.water.box(fx, 0.75, fzz, 6.2, 0.2, 6.2, 0x2f8fb8);
    B.detail.box(fx, 1.6, fzz, 1, 2.4, 1, 0xe8dfcc);
    B.glow.box(fx, 2.9, fzz, 1.6, 0.5, 1.6, 0x6fd0ff);
    this.grid.add({ x: fx, z: fzz, hx: 3.6, hz: 3.6 });

    // insegna gigante
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(w * 0.8, 26), 4.2),
      new THREE.MeshBasicMaterial({ map: TX.signTexture('CASINO NOVA', '#ffd23f'), toneMapped: false })
    );
    sign.position.set(cx, 11.5, fz + 0.4);
    this.group.add(sign);
    B.neon.box(cx, 11.5, fz + 0.2, Math.min(w * 0.82, 27), 4.6, 0.2, 0xffd23f);
    // luci lungo la facciata
    for (let i = -5; i <= 5; i++) {
      B.neon.box(cx + i * (w / 12), 7.2, fz + 0.2, 0.5, 0.5, 0.2, i % 2 ? 0xff5aa0 : 0x6fd0ff);
    }
    for (const s of [-1, 1]) {
      const p = B.props.palm(cx + s * (w / 2 + 4), fz + 6, rng);
      this.grid.add({ x: p.x, z: p.z, hx: p.r, hz: p.r });
    }
    B.props.streetlight(b.x0 + 4, b.z1 - 4, 0, 7);
    B.props.streetlight(b.x1 - 4, b.z1 - 4, Math.PI, 7);
    for (const dx of [-12, 12]) this.parkSpots.push({ x: cx + dx, z: b.z1 - 4, rot: Math.PI });

    this.doors.push({
      type: 'casino', name: 'CASINÒ NOVA', color: '#ffd23f',
      x: cx, z: fz + 2.4, face: -Math.PI / 2,
    });
  }

  /** Campo da basket e pista: un isolato sportivo. */
  _sportsBlock(b, B, rng) {
    this.landmarks.push({ kind: 'sport', x: b.cx, z: b.cz });
    B.grass.quadY(b.x0, b.z0, b.x1, b.z1, 0.02, 0xffffff, (b.x1 - b.x0) / 6, (b.z1 - b.z0) / 6);
    B.props.grassPatch(b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z1 - 1, rng, 0.55);
    const cw = Math.min(b.x1 - b.x0 - 10, 28), cd = Math.min(b.z1 - b.z0 - 10, 16);
    const cx = b.cx, cz = b.cz;
    B.road = B.road || new GeoBuilder();
    B.road.quadY(cx - cw / 2, cz - cd / 2, cx + cw / 2, cz + cd / 2, 0.03, 0xffffff, cw / 8, cd / 8);
    // linee del campo
    const line = (x0, z0, x1, z1) => B.paint.quadY(x0, z0, x1, z1, 0.05, 0xf0ece0);
    line(cx - cw / 2 + 1, cz - cd / 2 + 1, cx + cw / 2 - 1, cz - cd / 2 + 1.16);
    line(cx - cw / 2 + 1, cz + cd / 2 - 1.16, cx + cw / 2 - 1, cz + cd / 2 - 1);
    line(cx - cw / 2 + 1, cz - cd / 2 + 1, cx - cw / 2 + 1.16, cz + cd / 2 - 1);
    line(cx + cw / 2 - 1.16, cz - cd / 2 + 1, cx + cw / 2 - 1, cz + cd / 2 - 1);
    line(cx - 0.08, cz - cd / 2 + 1, cx + 0.08, cz + cd / 2 - 1);
    // canestri
    for (const s of [-1, 1]) {
      const px = cx + s * (cw / 2 - 2);
      B.detail.box(px, 1.7, cz, 0.18, 3.4, 0.18, 0x9aa0a6);
      B.detail.box(px - s * 0.5, 3.3, cz, 1.0, 0.12, 0.18, 0x9aa0a6);
      B.detail.box(px - s * 1.0, 3.05, cz, 0.12, 0.9, 1.4, 0xf0ece0);
      B.neon.box(px - s * 1.2, 2.75, cz, 0.06, 0.06, 0.9, 0xff7a3d);
      this.grid.add({ x: px, z: cz, hx: 0.2, hz: 0.2 });
    }
    // recinzione a rete
    for (const s of [-1, 1]) {
      B.detail.box(cx, 1.6, cz + s * (cd / 2 + 0.6), cw + 2, 3.2, 0.1, 0x8a9098);
      B.detail.box(cx + s * (cw / 2 + 1), 1.6, cz, 0.1, 3.2, cd + 2, 0x8a9098);
    }
    for (let k = 0; k < 4; k++) {
      const p = B.props.palm(b.x0 + 4 + rng() * 4, b.z0 + 5 + k * ((b.z1 - b.z0 - 10) / 3), rng);
      this.grid.add({ x: p.x, z: p.z, hx: p.r, hz: p.r });
    }
    B.props.bench(cx - cw / 2 - 3, cz, Math.PI / 2);
    B.props.bench(cx + cw / 2 + 3, cz, -Math.PI / 2);
  }

  // --------------------------------------------------------------- utility
  _splitLot(x0, z0, x1, z1, kind, rng, depth = 0) {
    const w = x1 - x0, d = z1 - z0;
    const min = kind === 'suburb' ? 15 : kind === 'commercial' ? 20 : 26;
    if (depth > 2 || (w < min * 2 && d < min * 2) || (depth > 0 && rng() < 0.22)) {
      return [{ x0, z0, x1, z1 }];
    }
    if (w >= d) {
      const cut = x0 + w * (0.36 + rng() * 0.28);
      return [...this._splitLot(x0, z0, cut - 0.5, z1, kind, rng, depth + 1),
              ...this._splitLot(cut + 0.5, z0, x1, z1, kind, rng, depth + 1)];
    }
    const cut = z0 + d * (0.36 + rng() * 0.28);
    return [...this._splitLot(x0, z0, x1, cut - 0.5, kind, rng, depth + 1),
            ...this._splitLot(x0, cut + 0.5, x1, z1, kind, rng, depth + 1)];
  }

  _streetFaces(lot, b) {
    const faces = [];
    const eps = 1.6;
    if (Math.abs(lot.z0 - b.z0) < eps) faces.push({ nx: 0, nz: -1 });
    if (Math.abs(lot.z1 - b.z1) < eps) faces.push({ nx: 0, nz: 1 });
    if (Math.abs(lot.x0 - b.x0) < eps) faces.push({ nx: -1, nz: 0 });
    if (Math.abs(lot.x1 - b.x1) < eps) faces.push({ nx: 1, nz: 0 });
    return faces;
  }

  _streetProps(b, i, j, B, rng) {
    const P = B.props;
    const edges = [
      // il centro del marciapiede sta a mezza larghezza DAL BORDO dell'isolato:
      // misurarlo dall'asse strada metteva pali e palme in mezzo alla carreggiata
      { x: b.cx, z: b.z0 - CFG.WALK / 2, dir: -Math.PI / 2, along: 'x' },
      { x: b.cx, z: b.z1 + CFG.WALK / 2, dir: Math.PI / 2, along: 'x' },
      { x: b.x0 - CFG.WALK / 2, z: b.cz, dir: Math.PI, along: 'z' },
      { x: b.x1 + CFG.WALK / 2, z: b.cz, dir: 0, along: 'z' },
    ];
    for (const e of edges) {
      const horiz = e.along === 'x';
      const len = horiz ? (b.x1 - b.x0) : (b.z1 - b.z0);
      // punto sul bordo, misurato in frazione della lunghezza dell'isolato
      const at = (t) => (horiz ? { x: b.cx + len * t, z: e.z } : { x: e.x, z: b.cz + len * t });
      for (const t of [-0.3, 0.3]) {
        const x = horiz ? b.cx + len * t : e.x;
        const z = horiz ? e.z : b.cz + len * t;
        const p = P.streetlight(x, z, e.dir);
        this.grid.add({ x: p.x, z: p.z, hx: 0.3, hz: 0.3 });
        this.lamps.push(p.lamp);
      }
      // alberi/palme di allineamento
      for (const t of [-0.12, 0.12]) {
        if (rng() < 0.55) {
          const x = horiz ? b.cx + len * t : e.x;
          const z = horiz ? e.z : b.cz + len * t;
          const p = rng() < 0.6 ? P.palm(x, z, rng) : P.tree(x, z, rng);
          this.grid.add({ x: p.x, z: p.z, hx: 0.35, hz: 0.35 });
        }
      }
      if (rng() < 0.45) P.bin(horiz ? b.cx + len * 0.42 : e.x, horiz ? e.z : b.cz + len * 0.42);
      if (rng() < 0.4) P.hydrant(horiz ? b.cx - len * 0.42 : e.x, horiz ? e.z : b.cz - len * 0.42);
      if (rng() < 0.35) P.bench(horiz ? b.cx : e.x, horiz ? e.z : b.cz, e.dir);
      if (rng() < 0.22) P.busStop(horiz ? b.cx + len * 0.2 : e.x, horiz ? e.z : b.cz + len * 0.2, e.dir);
      // fila di parchimetri lungo il bordo: nei viali ce n'e' uno ogni posto auto
      if (rng() < 0.62) {
        const n = 5 + ((rng() * 4) | 0);
        const start = -0.34 + rng() * 0.12;
        for (let k = 0; k < n; k++) {
          const t = start + k * 0.11;
          if (t > 0.42) break;
          const q = at(t);
          P.meter(q.x, q.z);
        }
      }
      if (rng() < 0.3) P.clutter(horiz ? b.cx - len * 0.25 : e.x, horiz ? e.z : b.cz - len * 0.25, rng);
      if (rng() < 0.4) { const q = at(-0.36); P.newsbox(q.x, q.z, e.dir); }
      if (rng() < 0.18) { const q = at(0.36); P.phoneBooth(q.x, q.z, e.dir); this.grid.add({ x: q.x, z: q.z, hx: 0.55, hz: 0.55 }); }
      // le rastrelliere diventano punti dove trovi una bici vera da prendere
      if (rng() < 0.3) { const q = at(-0.06); this.bikeSpots.push({ x: q.x, z: q.z, rot: e.dir + Math.PI / 2 }); }
      if (rng() < 0.16) { const q = at(0.12); P.roadwork(q.x, q.z, rng); }
      if (rng() < 0.22) { const q = at(0.28); P.dumpster(q.x, q.z, e.dir); this.grid.add({ x: q.x, z: q.z, hx: 1.0, hz: 0.6 }); }
    }

    // posti auto lungo il bordo
    const bays = [
      { x: b.cx - 9, z: b.z0 - HALF + 1.6, rot: 0 }, { x: b.cx + 9, z: b.z0 - HALF + 1.6, rot: 0 },
      { x: b.cx - 9, z: b.z1 + HALF - 1.6, rot: Math.PI }, { x: b.cx + 9, z: b.z1 + HALF - 1.6, rot: Math.PI },
      { x: b.x0 - HALF + 1.6, z: b.cz - 9, rot: -Math.PI / 2 }, { x: b.x1 + HALF - 1.6, z: b.cz + 9, rot: Math.PI / 2 },
    ];
    for (const bay of bays) if (rng() < 0.5) this.parkSpots.push(bay);
  }

  _intersection(x, z, props) {
    // due semafori per incrocio, uno per direzione di marcia
    props.trafficLight(x - DRIVE - 1.3, z - DRIVE - 1.3, 0, 0);
    props.trafficLight(x + DRIVE + 1.3, z + DRIVE + 1.3, Math.PI, 0);
    props.trafficLight(x + DRIVE + 1.3, z - DRIVE - 1.3, Math.PI / 2, 1);
    props.trafficLight(x - DRIVE - 1.3, z + DRIVE + 1.3, -Math.PI / 2, 1);
    for (const [sx, sz] of [[-1, -1], [1, 1]]) {
      this.grid.add({ x: x + sx * (DRIVE + 1.3), z: z + sz * (DRIVE + 1.3), hx: 0.3, hz: 0.3 });
    }
  }

  // ----------------------------------------------------------- collisioni
  resolve(x, z, r, out) {
    const boxes = this.grid.near(x, z, r + 2, this._tmp);
    let hit = false;
    for (const b of boxes) {
      const dx = x - b.x, dz = z - b.z;
      const px = b.hx + r - Math.abs(dx);
      const pz = b.hz + r - Math.abs(dz);
      if (px > 0 && pz > 0) {
        hit = true;
        if (px < pz) x += Math.sign(dx || 1) * px;
        else z += Math.sign(dz || 1) * pz;
      }
    }
    out.x = x; out.z = z;
    return hit;
  }

  inBounds(x, z) {
    return x > WORLD_MIN - 60 && x < WORLD_MAX + 60 && z > WORLD_MIN - 60 && z < WORLD_MAX + 90;
  }

  nearestDoor(x, z, maxD = 3.0) {
    let best = null, bd = maxD * maxD;
    for (const d of this.doors) {
      const dd = (d.x - x) ** 2 + (d.z - z) ** 2;
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  // ---------------------------------------------------------------- grafi
  _graphs() {
    const N = CFG.N;
    this.roadIndex = (i, j) => i * (N + 1) + j;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) this.roadNodes.push({ i, j, x: roadX(i), z: roadZ(j), links: [] });
    }
    for (const n of this.roadNodes) {
      const { i, j } = n;
      if (i > 0) n.links.push(this.roadIndex(i - 1, j));
      if (i < N) n.links.push(this.roadIndex(i + 1, j));
      if (j > 0) n.links.push(this.roadIndex(i, j - 1));
      if (j < N) n.links.push(this.roadIndex(i, j + 1));
    }

    const idxOf = new Map();
    const add = (x, z) => {
      const key = `${x.toFixed(1)}_${z.toFixed(1)}`;
      if (idxOf.has(key)) return idxOf.get(key);
      const id = this.walkNodes.length;
      this.walkNodes.push({ x, z, links: [] });
      idxOf.set(key, id);
      return id;
    };
    const link = (a, b) => {
      if (a === b) return;
      if (this.walkNodes[a].links.indexOf(b) < 0) this.walkNodes[a].links.push(b);
      if (this.walkNodes[b].links.indexOf(a) < 0) this.walkNodes[b].links.push(a);
    };
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const b = blockBounds(i, j);
        const x0 = b.x0 - CFG.WALK / 2, x1 = b.x1 + CFG.WALK / 2;
        const z0 = b.z0 - CFG.WALK / 2, z1 = b.z1 + CFG.WALK / 2;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        const c = [add(x0, z0), add(mx, z0), add(x1, z0), add(x1, mz),
                   add(x1, z1), add(mx, z1), add(x0, z1), add(x0, mz)];
        for (let k = 0; k < c.length; k++) link(c[k], c[(k + 1) % c.length]);
      }
    }
    const cross = 2 * WALKC + 0.2;
    for (let a = 0; a < this.walkNodes.length; a++) {
      const na = this.walkNodes[a];
      for (let b = a + 1; b < this.walkNodes.length; b++) {
        const nb = this.walkNodes[b];
        const dx = Math.abs(na.x - nb.x), dz = Math.abs(na.z - nb.z);
        if ((dx < 0.2 && Math.abs(dz - cross) < 1.2) || (dz < 0.2 && Math.abs(dx - cross) < 1.2)) link(a, b);
      }
    }
    for (const n of this.walkNodes) if (!n.links.length) n.links.push(0);
  }

  randomWalkNode(nearX, nearZ, minD, maxD) {
    for (let k = 0; k < 40; k++) {
      const n = this.walkNodes[(Math.random() * this.walkNodes.length) | 0];
      const d = Math.hypot(n.x - nearX, n.z - nearZ);
      if (d > minD && d < maxD) return n;
    }
    return this.walkNodes[(Math.random() * this.walkNodes.length) | 0];
  }

  /**
   * Segna due armerie come punti di riferimento: sono negozi normali, ma
   * cosi' si trovano sulla mappa invece di doverle cercare a caso.
   */
  _markGunShops() {
    const ammu = this.doors.filter((d) => d.type === 'ammu');
    if (!ammu.length) return;
    // le due piu' lontane fra loro: coprono la citta' invece di stare vicine
    let best = [ammu[0], ammu[ammu.length - 1]], bd = -1;
    for (const a of ammu) {
      for (const b of ammu) {
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > bd) { bd = d; best = [a, b]; }
      }
    }
    for (const d of best) this.landmarks.push({ kind: 'ammu', x: d.x, z: d.z });
  }

  /** Come randomWalkNode ma sulla carreggiata: serve agli eventi in strada. */
  randomRoadNode(nearX, nearZ, minD, maxD) {
    for (let k = 0; k < 40; k++) {
      const n = this.roadNodes[(Math.random() * this.roadNodes.length) | 0];
      const d = Math.hypot(n.x - nearX, n.z - nearZ);
      if (d > minD && d < maxD) return n;
    }
    return null;
  }

  // ------------------------------------------------------------- dinamica
  setTrafficAxis(axis) {
    const m = this.mats;
    m.redA.color.setHex(axis === 0 ? 0x3a0d0d : 0xff2a2a);
    m.greenA.color.setHex(axis === 0 ? 0x24d05a : 0x0d2a14);
    m.redB.color.setHex(axis === 1 ? 0x3a0d0d : 0xff2a2a);
    m.greenB.color.setHex(axis === 1 ? 0x24d05a : 0x0d2a14);
  }

  setNight(k) {
    const e = clamp(k, 0, 1);
    for (const key of ['office', 'stucco', 'brick', 'concrete', 'store']) {
      this.mats[key].emissive.setScalar(e * 0.95);
    }
    if (this.lampMeshes) for (const m of this.lampMeshes) m.visible = e > 0.25;
  }

  /** Onde: fa scorrere la normal map dell'acqua. */
  animate(t) {
    const n = this.mats.water.normalMap;
    n.offset.set(t * 0.008, t * 0.011);
    if (this.foam) {
      this.foam.position.z = this.shore + 2 + Math.sin(t * 0.4) * 2.5;
      this.foam.material.opacity = 0.42 + Math.sin(t * 0.4) * 0.16;
    }
  }
}
