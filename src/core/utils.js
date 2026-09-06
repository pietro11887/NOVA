import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const TAU = Math.PI * 2;

/** Differenza angolare normalizzata in [-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Interpolazione angolare con velocita' massima. */
export function turnToward(cur, target, maxStep) {
  const d = angleDelta(cur, target);
  return cur + clamp(d, -maxStep, maxStep);
}

/** PRNG deterministico: la citta' e' sempre la stessa a ogni partita. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FACES = [
  { n: [0, 0, 1],  v: [[-1,-1, 1], [ 1,-1, 1], [ 1, 1, 1], [-1, 1, 1]], u: 0, w: 1 },
  { n: [0, 0,-1],  v: [[ 1,-1,-1], [-1,-1,-1], [-1, 1,-1], [ 1, 1,-1]], u: 0, w: 1 },
  { n: [1, 0, 0],  v: [[ 1,-1, 1], [ 1,-1,-1], [ 1, 1,-1], [ 1, 1, 1]], u: 2, w: 1 },
  { n: [-1,0, 0],  v: [[-1,-1,-1], [-1,-1, 1], [-1, 1, 1], [-1, 1,-1]], u: 2, w: 1 },
  { n: [0, 1, 0],  v: [[-1, 1, 1], [ 1, 1, 1], [ 1, 1,-1], [-1, 1,-1]], u: 0, w: 2 },
  { n: [0,-1, 0],  v: [[-1,-1,-1], [ 1,-1,-1], [ 1,-1, 1], [-1,-1, 1]], u: 0, w: 2 },
];

/**
 * Accumulatore di geometria: unisce centinaia di scatole/quad in un'unica
 * BufferGeometry. Un isolato = una draw call, che e' quello che rende il
 * gioco fluido anche su telefono.
 */
export class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }

  get empty() { return this.p.length === 0; }

  /**
   * Scatola centrata in (x,y,z), ruotata di rotY attorno all'asse Y.
   * uvScale: 0 = UV 0..1 per faccia; >0 = metri * uvScale;
   *          <0 = la piastrella misura |uvScale| metri e viene "stirata"
   *          per entrarci un numero intero di volte (niente piani tagliati).
   * uvScaleV: se indicato sostituisce la scala sull'asse verticale.
   */
  box(x, y, z, sx, sy, sz, color, uvScale = 0, rotY = 0, topColor = null, uvScaleV = null) {
    const s = [sx, sy, sz];
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const col = new THREE.Color(color);
    const top = topColor !== null ? new THREE.Color(topColor) : col;
    for (const f of FACES) {
      const base = this.p.length / 3;
      const cc = f.n[1] > 0 ? top : col;
      let su, sv;
      if (uvScale < 0) {
        const tile = -uvScale;
        su = Math.max(1, Math.round(s[f.u] / tile)) / s[f.u];
        sv = Math.max(1, Math.round(s[f.w] / tile)) / s[f.w];
      } else {
        su = sv = uvScale;
      }
      if (uvScaleV !== null && f.n[1] === 0) sv = uvScaleV;
      for (const vert of f.v) {
        const lx = vert[0] * sx * 0.5, ly = vert[1] * sy * 0.5, lz = vert[2] * sz * 0.5;
        this.p.push(x + lx * cos + lz * sin, y + ly, z - lx * sin + lz * cos);
        this.n.push(f.n[0] * cos + f.n[2] * sin, f.n[1], -f.n[0] * sin + f.n[2] * cos);
        if (su > 0) {
          this.uv.push(((vert[f.u] + 1) / 2) * s[f.u] * su, ((vert[f.w] + 1) / 2) * s[f.w] * sv);
        } else {
          this.uv.push((vert[f.u] + 1) / 2, (vert[f.w] + 1) / 2);
        }
        this.c.push(cc.r, cc.g, cc.b);
      }
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  /** Quad generico nello spazio: tetti a falda, tettoie, rampe. */
  quad(a, b, c, d, color, ru = 1, rv = 1) {
    const base = this.p.length / 3;
    const col = new THREE.Color(color);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const uvs = [[0, 0], [ru, 0], [ru, rv], [0, rv]];
    [a, b, c, d].forEach((p, k) => {
      this.p.push(p[0], p[1], p[2]);
      this.n.push(nx, ny, nz);
      this.uv.push(uvs[k][0], uvs[k][1]);
      this.c.push(col.r, col.g, col.b);
    });
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }

  /** Tetto a due falde lungo l'asse X (o Z se axis === 'z'). */
  gableRoof(cx, cy, cz, sx, sz, h, color, axis = 'x', overhang = 0.4) {
    const x0 = cx - sx / 2 - overhang, x1 = cx + sx / 2 + overhang;
    const z0 = cz - sz / 2 - overhang, z1 = cz + sz / 2 + overhang;
    if (axis === 'x') {
      const zm = (z0 + z1) / 2;
      this.quad([x0, cy, z0], [x1, cy, z0], [x1, cy + h, zm], [x0, cy + h, zm], color, sx / 3, sz / 3);
      this.quad([x1, cy, z1], [x0, cy, z1], [x0, cy + h, zm], [x1, cy + h, zm], color, sx / 3, sz / 3);
      // timpani
      this.quad([x0, cy, z0], [x0, cy + h, zm], [x0, cy, z1], [x0, cy, z1], color, 1, 1);
      this.quad([x1, cy, z1], [x1, cy + h, zm], [x1, cy, z0], [x1, cy, z0], color, 1, 1);
    } else {
      const xm = (x0 + x1) / 2;
      this.quad([x0, cy, z1], [x0, cy, z0], [xm, cy + h, z0], [xm, cy + h, z1], color, sz / 3, sx / 3);
      this.quad([x1, cy, z0], [x1, cy, z1], [xm, cy + h, z1], [xm, cy + h, z0], color, sz / 3, sx / 3);
      this.quad([x0, cy, z0], [xm, cy + h, z0], [x1, cy, z0], [x1, cy, z0], color, 1, 1);
      this.quad([x1, cy, z1], [xm, cy + h, z1], [x0, cy, z1], [x0, cy, z1], color, 1, 1);
    }
    return this;
  }

  /** Quad orizzontale (usato per asfalto, prati, strisce). */
  quadY(x0, z0, x1, z1, y, color, ru = 1, rv = 1) {
    const base = this.p.length / 3;
    const col = new THREE.Color(color);
    const pts = [[x0, z0, 0, 0], [x1, z0, ru, 0], [x1, z1, ru, rv], [x0, z1, 0, rv]];
    for (const [px, pz, u, v] of pts) {
      this.p.push(px, y, pz); this.n.push(0, 1, 0); this.uv.push(u, v); this.c.push(col.r, col.g, col.b);
    }
    this.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Ammorbidisce le normali di una geometria non indicizzata: le facce che
 * si incontrano con un angolo dolce condividono la normale, gli spigoli
 * netti (cofano/parabrezza) restano netti.
 */
export function smoothNormals(geo, maxAngle = 1.05) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const buckets = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 200)}_${Math.round(pos.getY(i) * 200)}_${Math.round(pos.getZ(i) * 200)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let b = buckets.get(k);
    if (!b) { b = []; buckets.set(k, b); }
    b.push(i);
  }
  const out = new Float32Array(nor.count * 3);
  const cosMax = Math.cos(maxAngle);
  for (const [, ids] of buckets) {
    for (const i of ids) {
      const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      let ax = 0, ay = 0, az = 0;
      for (const j of ids) {
        const mx = nor.getX(j), my = nor.getY(j), mz = nor.getZ(j);
        if (nx * mx + ny * my + nz * mz >= cosMax) { ax += mx; ay += my; az += mz; }
      }
      const len = Math.hypot(ax, ay, az) || 1;
      out[i * 3] = ax / len; out[i * 3 + 1] = ay / len; out[i * 3 + 2] = az / len;
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return geo;
}

/** Rileva un dispositivo touch/mobile per scalare la qualita'. */
export const IS_TOUCH = (typeof window !== 'undefined') &&
  (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
export const IS_MOBILE = IS_TOUCH && Math.min(screen.width, screen.height) < 900;
