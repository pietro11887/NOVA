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

  /** Scatola centrata in (x,y,z), ruotata di rotY attorno all'asse Y. */
  box(x, y, z, sx, sy, sz, color, uvScale = 0, rotY = 0, topColor = null) {
    const s = [sx, sy, sz];
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const col = new THREE.Color(color);
    const top = topColor !== null ? new THREE.Color(topColor) : col;
    for (const f of FACES) {
      const base = this.p.length / 3;
      const cc = f.n[1] > 0 ? top : col;
      for (const vert of f.v) {
        const lx = vert[0] * sx * 0.5, ly = vert[1] * sy * 0.5, lz = vert[2] * sz * 0.5;
        this.p.push(x + lx * cos + lz * sin, y + ly, z - lx * sin + lz * cos);
        this.n.push(f.n[0] * cos + f.n[2] * sin, f.n[1], -f.n[0] * sin + f.n[2] * cos);
        if (uvScale > 0) {
          this.uv.push(((vert[f.u] + 1) / 2) * s[f.u] * uvScale, ((vert[f.w] + 1) / 2) * s[f.w] * uvScale);
        } else {
          this.uv.push((vert[f.u] + 1) / 2, (vert[f.w] + 1) / 2);
        }
        this.c.push(cc.r, cc.g, cc.b);
      }
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
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

/** Rileva un dispositivo touch/mobile per scalare la qualita'. */
export const IS_TOUCH = (typeof window !== 'undefined') &&
  (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
export const IS_MOBILE = IS_TOUCH && Math.min(screen.width, screen.height) < 900;
