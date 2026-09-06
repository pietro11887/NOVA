import * as THREE from 'three';
import { CFG, road, blockBounds, WORLD_MIN, WORLD_MAX } from '../core/config.js';
import { GeoBuilder, mulberry32, clamp } from '../core/utils.js';
import { facadeTextures, roadTexture, pavementTexture, grassTexture, signTexture } from './textures.js';

const HALF = CFG.ROAD / 2;          // 8  -> distanza dal centro strada al bordo isolato
const DRIVE = HALF - CFG.WALK;      // 5  -> mezza carreggiata asfaltata
const WALKC = HALF - CFG.WALK / 2;  // 6.5-> centro del marciapiede

const SHOP_KINDS = [
  { type: 'burger',   name: 'BURGER SHOT',  color: '#ff7a3d' },
  { type: 'pharmacy', name: 'FARMACIA 24H', color: '#3ddc84' },
  { type: 'store',    name: 'MINI MARKET',  color: '#4cc2ff' },
  { type: 'ammu',     name: 'AMMU NOVA',    color: '#ff4d5e' },
  { type: 'clothes',  name: 'THREADS',      color: '#e46bff' },
  { type: 'bar',      name: 'BAR LUNA',     color: '#ffd23f' },
  { type: 'garage',   name: 'GARAGE PIT',   color: '#9fb2c8' },
  { type: 'home',     name: 'CASA',         color: '#ffe9a8' },
];

/** Indice spaziale per le collisioni statiche. */
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
    this.doors = [];          // ingressi dei locali
    this.walkNodes = [];      // grafo marciapiedi (pedoni)
    this.roadNodes = [];      // grafo stradale (veicoli)
    this.parkSpots = [];      // posti auto in sosta
    this._tmp = [];
    this.limit = 620;          // confine invalicabile del mondo
    this.rng = mulberry32(1987);
  }

  build() {
    const fac = facadeTextures();
    this.facadeMat = new THREE.MeshLambertMaterial({
      map: fac.day, emissiveMap: fac.night, emissive: 0x000000, vertexColors: true,
    });
    this.detailMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.roadMat = new THREE.MeshLambertMaterial({ map: roadTexture(), vertexColors: true });
    this.walkMat = new THREE.MeshLambertMaterial({ map: pavementTexture(), vertexColors: true });
    this.grassMat = new THREE.MeshLambertMaterial({ map: grassTexture(), vertexColors: true });
    this.glowMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    this._buildGround();
    this._buildRoads();
    this._buildBlocks();
    this._buildGraphs();
    return this;
  }

  // ---------------------------------------------------------------- terreno
  _buildGround() {
    const size = (WORLD_MAX - WORLD_MIN) + 900;
    const g = new THREE.PlaneGeometry(size, size);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshLambertMaterial({ color: 0x38452f });
    const ground = new THREE.Mesh(g, m);
    ground.position.y = -0.12;
    ground.renderOrder = -1;
    this.group.add(ground);

    // mare all'orizzonte per chiudere la scena
    const sea = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(WORLD_MAX, -WORLD_MIN) + 340, 3000, 48),
      new THREE.MeshLambertMaterial({ color: 0x16384f })
    );
    sea.rotateX(-Math.PI / 2);
    sea.position.y = -0.4;
    this.group.add(sea);
  }

  // ----------------------------------------------------------------- strade
  _buildRoads() {
    const rgb = new GeoBuilder();      // asfalto
    const wgb = new GeoBuilder();      // marciapiedi
    const N = CFG.N;

    for (let i = 0; i <= N; i++) {
      const x = road(i);
      // carreggiate lungo Z e lungo X (una striscia per l'intera lunghezza)
      rgb.quadY(x - DRIVE, WORLD_MIN, x + DRIVE, WORLD_MAX, 0.02, 0xffffff, 1, (WORLD_MAX - WORLD_MIN) / 12);
      const z = road(i);
      rgb.quadY(WORLD_MIN, z - DRIVE, WORLD_MAX, z + DRIVE, 0.021, 0xffffff, (WORLD_MAX - WORLD_MIN) / 12, 1);
    }

    // marciapiedi: un anello rialzato attorno a ogni isolato
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const b = blockBounds(i, j);
        const o = CFG.WALK;
        wgb.box((b.x0 + b.x1) / 2, 0.07, b.z0 - o / 2, (b.x1 - b.x0) + o * 2, 0.14, o, 0xf0efe9, 0.25);
        wgb.box((b.x0 + b.x1) / 2, 0.07, b.z1 + o / 2, (b.x1 - b.x0) + o * 2, 0.14, o, 0xf0efe9, 0.25);
        wgb.box(b.x0 - o / 2, 0.07, (b.z0 + b.z1) / 2, o, 0.14, (b.z1 - b.z0), 0xf0efe9, 0.25);
        wgb.box(b.x1 + o / 2, 0.07, (b.z0 + b.z1) / 2, o, 0.14, (b.z1 - b.z0), 0xf0efe9, 0.25);
      }
    }

    // strisce pedonali agli incroci
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const x = road(i), z = road(j);
        for (let s = -1; s <= 1; s += 2) {
          for (let k = -4; k <= 4; k++) {
            if (k === 0) continue;
            rgb.quadY(x + k * 1.0 - 0.32, z + s * (DRIVE + 0.6) - 1.6,
                      x + k * 1.0 + 0.32, z + s * (DRIVE + 0.6) + 1.6, 0.05, 0xdedbcd, 1, 1);
            rgb.quadY(x + s * (DRIVE + 0.6) - 1.6, z + k * 1.0 - 0.32,
                      x + s * (DRIVE + 0.6) + 1.6, z + k * 1.0 + 0.32, 0.05, 0xdedbcd, 1, 1);
          }
        }
      }
    }

    const roadMesh = new THREE.Mesh(rgb.build(), this.roadMat);
    roadMesh.frustumCulled = false;
    this.group.add(roadMesh);
    this.group.add(new THREE.Mesh(wgb.build(), this.walkMat));
  }

  // ---------------------------------------------------------------- isolati
  _buildBlocks() {
    const rng = this.rng;
    const props = new GeoBuilder();
    const glow = new GeoBuilder();
    const grass = new GeoBuilder();
    const N = CFG.N, c = (N - 1) / 2;
    const shopQueue = [];
    for (let k = 0; k < 40; k++) shopQueue.push(SHOP_KINDS[k % SHOP_KINDS.length]);

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const b = blockBounds(i, j);
        const ring = Math.max(Math.abs(i - c), Math.abs(j - c));
        const isPark = rng() < 0.10 && ring > 1;
        const fgb = new GeoBuilder();
        const dgb = new GeoBuilder();

        if (isPark) {
          this._park(b, grass, props, glow, rng);
        } else {
          const district = ring <= 1.2 ? 'downtown' : ring <= 2.6 ? 'commercial' : 'suburb';
          const lots = this._splitLot(b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z1 - 1, district, rng);
          for (const lot of lots) this._building(lot, district, fgb, dgb, glow, b, rng, shopQueue);
        }

        if (!fgb.empty) {
          const m = new THREE.Mesh(fgb.build(), this.facadeMat);
          this.group.add(m);
        }
        if (!dgb.empty) this.group.add(new THREE.Mesh(dgb.build(), this.detailMat));

        this._streetProps(i, j, b, props, glow, rng);
      }
    }

    // lampioni e semafori agli incroci esterni
    const bulbA = new GeoBuilder(), bulbB = new GeoBuilder();
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) this._intersection(road(i), road(j), props, bulbA, bulbB);
    }
    this.matA = new THREE.MeshBasicMaterial({ color: 0x24d05a });
    this.matB = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    this.group.add(new THREE.Mesh(bulbA.build(), this.matA));
    this.group.add(new THREE.Mesh(bulbB.build(), this.matB));

    this.group.add(new THREE.Mesh(props.build(), this.detailMat));
    if (!grass.empty) this.group.add(new THREE.Mesh(grass.build(), this.grassMat));
    this.glowMesh = new THREE.Mesh(glow.build(), this.glowMat);
    this.glowMesh.frustumCulled = false;
    this.glowMesh.visible = false;
    this.group.add(this.glowMesh);
  }

  /** Suddivide l'isolato in lotti edificabili. */
  _splitLot(x0, z0, x1, z1, district, rng, depth = 0) {
    const w = x1 - x0, d = z1 - z0;
    const min = district === 'suburb' ? 17 : district === 'commercial' ? 22 : 30;
    if (depth > 2 || (w < min * 2 && d < min * 2) || (depth > 0 && rng() < 0.25)) {
      return [{ x0, z0, x1, z1 }];
    }
    if (w >= d) {
      const cut = x0 + w * (0.35 + rng() * 0.3);
      return [...this._splitLot(x0, z0, cut - 0.6, z1, district, rng, depth + 1),
              ...this._splitLot(cut + 0.6, z0, x1, z1, district, rng, depth + 1)];
    }
    const cut = z0 + d * (0.35 + rng() * 0.3);
    return [...this._splitLot(x0, z0, x1, cut - 0.6, district, rng, depth + 1),
            ...this._splitLot(x0, cut + 0.6, x1, z1, district, rng, depth + 1)];
  }

  _building(lot, district, fgb, dgb, glow, block, rng, shopQueue) {
    const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0;
    if (w < 6 || d < 6) return;
    const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;

    let h, tint, roofTint;
    if (district === 'downtown') {
      h = 24 + rng() * 46;
      tint = [0x8fa8c0, 0x9aa7b3, 0x7f93a8, 0xa8b5b0][(rng() * 4) | 0];
      roofTint = 0x4a5560;
    } else if (district === 'commercial') {
      h = 9 + rng() * 14;
      tint = [0xc9a68a, 0xb98d78, 0xd8cbb4, 0xa9b3a0, 0xcfc0a8][(rng() * 5) | 0];
      roofTint = 0x5d564d;
    } else {
      h = 4.5 + rng() * 4;
      tint = [0xe4d7bd, 0xd8b9a0, 0xc9d3c0, 0xefe2cf, 0xd6c3b0][(rng() * 5) | 0];
      roofTint = 0x8a4b3a;
    }

    const bw = w - 1.2, bd = d - 1.2;
    fgb.box(cx, h / 2, cz, bw, h, bd, tint, 1 / 12, 0, roofTint);
    this._collider(cx, cz, bw / 2, bd / 2);

    // cornicione + dettagli sul tetto
    dgb.box(cx, h + 0.25, cz, bw + 0.5, 0.5, bd + 0.5, roofTint);
    if (district === 'downtown') {
      dgb.box(cx + (rng() - 0.5) * bw * 0.3, h + 1.6, cz + (rng() - 0.5) * bd * 0.3,
              Math.min(bw * 0.34, 6), 3, Math.min(bd * 0.34, 6), 0x6b7480);
      if (rng() < 0.5) {
        dgb.box(cx, h + 5.5, cz, 0.35, 8, 0.35, 0xb0b6bd);
        glow.box(cx, h + 9.6, cz, 0.9, 0.9, 0.9, 0xff3b3b);
      }
    } else if (district === 'suburb') {
      // tetto a falda semplificato
      dgb.box(cx, h + 0.9, cz, bw + 0.9, 1.3, bd + 0.9, roofTint);
      dgb.box(cx + bw * 0.3, h + 2.2, cz + bd * 0.25, 0.8, 2, 0.8, 0x6b5a50);
    }

    // A quale strada affaccia questo lotto?
    const faces = [];
    if (Math.abs(lot.z0 - (block.z0 + 1)) < 1.5) faces.push({ dir: -Math.PI / 2, nx: 0, nz: -1 });
    if (Math.abs(lot.z1 - (block.z1 - 1)) < 1.5) faces.push({ dir: Math.PI / 2, nx: 0, nz: 1 });
    if (Math.abs(lot.x0 - (block.x0 + 1)) < 1.5) faces.push({ dir: Math.PI, nx: -1, nz: 0 });
    if (Math.abs(lot.x1 - (block.x1 - 1)) < 1.5) faces.push({ dir: 0, nx: 1, nz: 0 });
    if (!faces.length) return;
    const f = faces[(rng() * faces.length) | 0];

    const shopChance = district === 'downtown' ? 0.35 : district === 'commercial' ? 0.55 : 0.3;
    const canShop = shopQueue.length > 0 && rng() < shopChance;
    if (!canShop) return;

    const kind = district === 'suburb' && rng() < 0.55
      ? SHOP_KINDS[SHOP_KINDS.length - 1]                 // casa
      : shopQueue.splice((rng() * shopQueue.length) | 0, 1)[0];

    const ex = cx + f.nx * (bw / 2), ez = cz + f.nz * (bd / 2);
    const along = f.nx !== 0 ? bd : bw;

    // vetrina + porta + tenda
    dgb.box(ex + f.nx * 0.14, 1.6, ez + f.nz * 0.14, f.nx !== 0 ? 0.3 : along * 0.8, 3.2,
            f.nx !== 0 ? along * 0.8 : 0.3, 0x1b2430);
    dgb.box(ex + f.nx * 0.3, 1.15, ez + f.nz * 0.3, f.nx !== 0 ? 0.35 : 1.5, 2.3,
            f.nx !== 0 ? 1.5 : 0.35, 0x2b1d14);
    dgb.box(ex + f.nx * 0.85, 3.5, ez + f.nz * 0.85, f.nx !== 0 ? 1.6 : along * 0.85, 0.28,
            f.nx !== 0 ? along * 0.85 : 1.6, kind.color);

    // insegna al neon
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(along * 0.8, 6.5), 1.7),
      new THREE.MeshBasicMaterial({ map: signTexture(kind.name, kind.color), transparent: false })
    );
    sign.position.set(ex + f.nx * 0.55, 4.7, ez + f.nz * 0.55);
    sign.rotation.y = f.nx !== 0 ? (f.nx > 0 ? Math.PI / 2 : -Math.PI / 2) : (f.nz > 0 ? 0 : Math.PI);
    this.group.add(sign);
    glow.box(ex + f.nx * 0.5, 4.7, ez + f.nz * 0.5, f.nx !== 0 ? 0.2 : 5, 1.9, f.nx !== 0 ? 5 : 0.2, kind.color);

    this.doors.push({
      type: kind.type, name: kind.name, color: kind.color,
      x: ex + f.nx * 2.0, z: ez + f.nz * 2.0,
      // angolo con cui si guarda la strada (convenzione: avanti = cos a, -sin a)
      face: Math.atan2(-f.nz, f.nx),
    });
  }

  _park(b, grass, props, glow, rng) {
    grass.quadY(b.x0, b.z0, b.x1, b.z1, 0.05, 0x5f8a45, (b.x1 - b.x0) / 6, (b.z1 - b.z0) / 6);
    // vialetto a croce
    props.box(b.cx, 0.08, b.cz, b.x1 - b.x0, 0.06, 3, 0xbdb4a2);
    props.box(b.cx, 0.09, b.cz, 3, 0.06, b.z1 - b.z0, 0xbdb4a2);
    // fontana
    props.box(b.cx, 0.35, b.cz, 6, 0.7, 6, 0xb9b2a4);
    props.box(b.cx, 0.75, b.cz, 5, 0.3, 5, 0x2f6f8f);
    props.box(b.cx, 1.6, b.cz, 0.8, 2.4, 0.8, 0xcfc8ba);
    this._collider(b.cx, b.cz, 3, 3);

    const n = 6 + ((rng() * 5) | 0);
    for (let k = 0; k < n; k++) {
      const x = b.x0 + 4 + rng() * (b.x1 - b.x0 - 8);
      const z = b.z0 + 4 + rng() * (b.z1 - b.z0 - 8);
      if (Math.abs(x - b.cx) < 6 && Math.abs(z - b.cz) < 6) continue;
      this._tree(x, z, props, rng);
    }
    for (let k = 0; k < 4; k++) {
      const bx = b.cx + (k < 2 ? -1 : 1) * 7, bz = b.cz + (k % 2 ? -1 : 1) * 7;
      props.box(bx, 0.45, bz, 2.2, 0.15, 0.7, 0x8a6a44);
      props.box(bx, 0.72, bz + 0.3, 2.2, 0.6, 0.12, 0x8a6a44);
    }
    for (let k = 0; k < 3; k++) {
      const lx = b.cx + (rng() - 0.5) * (b.x1 - b.x0 - 10);
      const lz = b.cz + (rng() - 0.5) * (b.z1 - b.z0 - 10);
      this._lamp(lx, lz, props, glow, 3.4);
    }
  }

  _tree(x, z, props, rng) {
    const h = 3.2 + rng() * 2.6;
    props.box(x, h / 2, z, 0.5, h, 0.5, 0x5a4632);
    const s = 2.6 + rng() * 1.6;
    props.box(x, h + s * 0.35, z, s, s * 0.9, s, 0x2f6b34);
    props.box(x, h + s * 0.85, z, s * 0.6, s * 0.5, s * 0.6, 0x387a3c);
    this._collider(x, z, 0.45, 0.45);
  }

  _lamp(x, z, props, glow, h = 4.6, arm = 0) {
    props.box(x, h / 2, z, 0.22, h, 0.22, 0x4d5460);
    props.box(x + arm, h, z, Math.abs(arm) * 2 + 0.3, 0.18, 0.18, 0x4d5460);
    glow.box(x + arm * 2, h - 0.15, z, 0.7, 0.25, 0.7, 0xffcc70);
    glow.quadY(x + arm * 2 - 4, z - 4, x + arm * 2 + 4, z + 4, 0.06, 0x3a2a10);
    this._collider(x, z, 0.2, 0.2);
  }

  _streetProps(i, j, b, props, glow, rng) {
    // lampioni lungo i bordi dell'isolato + posti auto
    for (let s = 0; s < 4; s++) {
      const horiz = s < 2;
      const px = horiz ? b.x0 + (b.x1 - b.x0) * (0.3 + 0.4 * (s % 2)) : (s === 2 ? b.x0 - CFG.WALK / 2 : b.x1 + CFG.WALK / 2);
      const pz = horiz ? (s === 0 ? b.z0 - CFG.WALK / 2 : b.z1 + CFG.WALK / 2) : b.z0 + (b.z1 - b.z0) * (0.3 + 0.4 * (s % 2));
      this._lamp(px, pz, props, glow, 4.8, horiz ? 0 : 0);
      if (rng() < 0.5) {
        props.box(px + (horiz ? 3 : 0), 0.45, pz + (horiz ? 0 : 3), 0.5, 0.9, 0.5, 0xcc3a2a); // idrante
      }
      if (rng() < 0.45) {
        const tx = horiz ? px + 6 : px, tz = horiz ? pz : pz + 6;
        props.box(tx, 0.7, tz, 0.8, 1.4, 0.8, 0x3a4450); // cestino
      }
    }
    // sosta: due posti per lato
    const bays = [
      { x: b.cx - 8, z: b.z0 - HALF + 1.3, rot: 0 }, { x: b.cx + 8, z: b.z0 - HALF + 1.3, rot: 0 },
      { x: b.cx - 8, z: b.z1 + HALF - 1.3, rot: Math.PI }, { x: b.cx + 8, z: b.z1 + HALF - 1.3, rot: Math.PI },
      { x: b.x0 - HALF + 1.3, z: b.cz - 8, rot: -Math.PI / 2 }, { x: b.x1 + HALF - 1.3, z: b.cz + 8, rot: Math.PI / 2 },
    ];
    for (const bay of bays) if (rng() < 0.55) this.parkSpots.push(bay);
  }

  _intersection(x, z, props, bulbA, bulbB) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = x + sx * (DRIVE + 1.2), pz = z + sz * (DRIVE + 1.2);
      props.box(px, 2.2, pz, 0.2, 4.4, 0.2, 0x39404b);
      props.box(px, 4.4, pz, 0.5, 1.5, 0.5, 0x22272f);
      // le lanterne di due angoli opposti servono la stessa direzione di marcia
      const b = sx === sz ? bulbA : bulbB;
      b.box(px, 4.7, pz, 0.64, 0.36, 0.64, 0xffffff);
    }
  }

  // ------------------------------------------------------------- collisioni
  _collider(x, z, hx, hz) { this.grid.add({ x, z, hx, hz }); }

  /**
   * Spinge un cerchio fuori dagli ostacoli statici.
   * Ritorna true se c'e' stato contatto; scrive la posizione corretta in out.
   */
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

  /** true se il punto e' dentro il perimetro della citta'. */
  inBounds(x, z) { return x > WORLD_MIN - 40 && x < WORLD_MAX + 40 && z > WORLD_MIN - 40 && z < WORLD_MAX + 40; }

  nearestDoor(x, z, maxD = 3.0) {
    let best = null, bd = maxD * maxD;
    for (const d of this.doors) {
      const dd = (d.x - x) ** 2 + (d.z - z) ** 2;
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  // ------------------------------------------------------------------ grafi
  _buildGraphs() {
    const N = CFG.N;
    // --- nodi stradali agli incroci
    this.roadIndex = (i, j) => i * (N + 1) + j;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        this.roadNodes.push({ i, j, x: road(i), z: road(j), links: [] });
      }
    }
    for (const n of this.roadNodes) {
      const { i, j } = n;
      if (i > 0) n.links.push(this.roadIndex(i - 1, j));
      if (i < N) n.links.push(this.roadIndex(i + 1, j));
      if (j > 0) n.links.push(this.roadIndex(i, j - 1));
      if (j < N) n.links.push(this.roadIndex(i, j + 1));
    }

    // --- nodi marciapiede: quattro angoli per isolato, collegati ad anello
    //     e attraversamenti verso gli isolati adiacenti.
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
        // angoli + punti medi (i medi servono per attraversare a meta' via)
        const c = [add(x0, z0), add(mx, z0), add(x1, z0), add(x1, mz),
                   add(x1, z1), add(mx, z1), add(x0, z1), add(x0, mz)];
        for (let k = 0; k < c.length; k++) link(c[k], c[(k + 1) % c.length]);
      }
    }
    // attraversamenti: collega i nodi affacciati sulla stessa strada
    const cross = 2 * WALKC + 0.2;
    for (let a = 0; a < this.walkNodes.length; a++) {
      const na = this.walkNodes[a];
      for (let b = a + 1; b < this.walkNodes.length; b++) {
        const nb = this.walkNodes[b];
        const dx = Math.abs(na.x - nb.x), dz = Math.abs(na.z - nb.z);
        if ((dx < 0.2 && Math.abs(dz - cross) < 1.2) || (dz < 0.2 && Math.abs(dx - cross) < 1.2)) {
          link(a, b);
          this.walkNodes[a].cross = true;
        }
      }
    }
    for (const n of this.walkNodes) if (!n.links.length) n.links.push(0);
  }

  /** Nodo pedonale piu' vicino a un punto (per far apparire i bot). */
  randomWalkNode(nearX, nearZ, minD, maxD) {
    for (let k = 0; k < 40; k++) {
      const n = this.walkNodes[(Math.random() * this.walkNodes.length) | 0];
      const d = Math.hypot(n.x - nearX, n.z - nearZ);
      if (d > minD && d < maxD) return n;
    }
    return this.walkNodes[(Math.random() * this.walkNodes.length) | 0];
  }

  /** Verde per l'asse indicato (0 = est-ovest, 1 = nord-sud). */
  setTrafficAxis(axis) {
    if (!this.matA) return;
    this.matA.color.setHex(axis === 0 ? 0x24d05a : 0xff2a2a);
    this.matB.color.setHex(axis === 0 ? 0xff2a2a : 0x24d05a);
  }

  /** Aggiorna luci/vetrine in base all'ora del giorno. */
  setNight(k) {
    this.facadeMat.emissive.setScalar(clamp(k, 0, 1) * 0.85);
    if (this.glowMesh) {
      this.glowMesh.visible = k > 0.05;
      this.glowMat.opacity = clamp(k, 0, 1) * 0.95;
    }
  }
}
