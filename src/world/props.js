import * as THREE from 'three';
import { rand, randInt, pick, TAU } from '../core/utils.js';

/**
 * Arredo urbano e vegetazione. Le palme sono il tratto che piu' di ogni
 * altro dice "Los Santos": tronco curvo texturizzato e foglie in alpha
 * disegnate una sola volta e ripetute con InstancedMesh.
 */

/** Prisma a sezione poligonale lungo una polilinea: tronchi e pali curvi. */
export function tube(gb, pts, radii, color, sides = 6, uvRepeat = 1) {
  const ring = (p, r, a0) => {
    const out = [];
    for (let i = 0; i < sides; i++) {
      const a = a0 + (i / sides) * TAU;
      out.push([p[0] + Math.cos(a) * r, p[1], p[2] + Math.sin(a) * r]);
    }
    return out;
  };
  let prev = ring(pts[0], radii[0], 0);
  for (let s = 1; s < pts.length; s++) {
    const cur = ring(pts[s], radii[s], 0);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      gb.quad(prev[i], cur[i], cur[j], prev[j], color, uvRepeat, uvRepeat);
    }
    prev = cur;
  }
  return prev;
}

/** Cilindro (o tronco di cono) con i tappi, asse Y. */
export function cyl(gb, x, z, y0, y1, r0, r1, color, sides = 12) {
  const ring = (y, r) => {
    const out = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU;
      out.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]);
    }
    return out;
  };
  const a = ring(y0, r0), b = ring(y1, r1);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    gb.quad(a[i], b[i], b[j], a[j], color, 1, 1);
  }
  for (let i = 1; i < sides - 1; i++) {
    gb.quad(b[0], b[i], b[i + 1], b[i + 1], color, 1, 1);
    gb.quad(a[0], a[i + 1], a[i], a[i], color, 1, 1);
  }
}

/** Calotta sferica: cupole di idranti, cestini, teste. */
export function dome(gb, x, y, z, r, color, sides = 12, rings = 4, squash = 1) {
  for (let s = 0; s < rings; s++) {
    const t0 = (s / rings) * Math.PI / 2, t1 = ((s + 1) / rings) * Math.PI / 2;
    const r0 = Math.cos(t0) * r, r1 = Math.cos(t1) * r;
    const y0 = y + Math.sin(t0) * r * squash, y1 = y + Math.sin(t1) * r * squash;
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * TAU, a1 = ((i + 1) / sides) * TAU;
      gb.quad(
        [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0],
        [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1],
        [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1],
        [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0], color, 1, 1);
    }
  }
}

/** Due quad incrociati alti 1: da qualsiasi angolo il ciuffo ha volume. */
function crossedQuads() {
  const pos = [], nor = [], uv = [], idx = [];
  const planes = [
    { px: 0.5, pz: 0, nx: 0, nz: 1 },
    { px: 0, pz: 0.5, nx: 1, nz: 0 },
  ];
  planes.forEach((pl, k) => {
    const o = k * 4;
    pos.push(-pl.px, 0, -pl.pz, pl.px, 0, pl.pz, pl.px, 1, pl.pz, -pl.px, 1, -pl.pz);
    for (let i = 0; i < 4; i++) nor.push(pl.nx, 0, pl.nz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class Props {
  constructor(builders) {
    this.B = builders;
    this.fronds = [];     // matrici delle foglie di palma
    this.leaves = [];     // chiome degli alberi
    this.lampPos = [];
    this.benches = [];
    this.tufts = [];      // ciuffi d'erba e fiori
  }

  /**
   * Semina ciuffi d'erba (e qualche fiore) su un rettangolo di prato.
   * Sono piani incrociati istanziati: costano una sola draw call per tutta la citta'.
   */
  grassPatch(x0, z0, x1, z1, rng, density = 1) {
    const area = Math.max(0, (x1 - x0) * (z1 - z0));
    const n = Math.min(520, Math.round(area * 0.16 * density));
    for (let i = 0; i < n; i++) {
      const x = x0 + rng() * (x1 - x0);
      const z = z0 + rng() * (z1 - z0);
      const s = 0.34 + rng() * 0.36;
      // il colore dell'istanza e' solo una sfumatura: il verde sta gia' nella texture
      const k = 0.78 + rng() * 0.34;
      const warm = 0.92 + rng() * 0.2;
      const c = (v) => Math.min(255, Math.round(v));
      this.tufts.push({
        x, z, s, rot: rng() * TAU,
        color: (c(255 * k * warm) << 16) | (c(255 * k) << 8) | c(255 * k * 0.86),
      });
    }
  }

  /** Palma: tronco curvo + corona di foglie. */
  palm(x, z, rng) {
    const h = rand(7, 13);
    const lean = rand(0.4, 1.6) * (rng() < 0.5 ? -1 : 1);
    const dir = rand(0, TAU);
    const seg = 7;
    const pts = [], radii = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const bend = Math.pow(t, 1.8) * lean;
      pts.push([x + Math.cos(dir) * bend, t * h, z + Math.sin(dir) * bend]);
      radii.push(0.27 - t * 0.12);
    }
    tube(this.B.bark, pts, radii, 0xffffff, 6, 1);
    const top = pts[pts.length - 1];
    // base della corona
    this.B.foliage.box(top[0], top[1] + 0.2, top[2], 0.9, 0.5, 0.9, 0x5f6b39);
    const n = randInt(11, 15);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng() * 0.4;
      const pitch = rand(0.05, 0.85);
      const len = rand(2.8, 4.2);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, -pitch, 'YZX'));
      m.compose(
        new THREE.Vector3(top[0] + Math.cos(a) * len * 0.42, top[1] + 0.35 - pitch * 0.7, top[2] + Math.sin(a) * len * 0.42),
        q,
        new THREE.Vector3(len, 1, len * 0.62)
      );
      this.fronds.push(m);
    }
    // noci di cocco
    if (rng() < 0.5) {
      for (let i = 0; i < 3; i++) {
        this.B.foliage.box(top[0] + rand(-0.4, 0.4), top[1] - 0.1, top[2] + rand(-0.4, 0.4), 0.28, 0.28, 0.28, 0x4a3a24);
      }
    }
    return { x, z, r: 0.4 };
  }

  /** Albero a chioma tonda (jacaranda / ficus dei viali). */
  tree(x, z, rng) {
    const h = rand(3.6, 6);
    tube(this.B.bark, [[x, 0, z], [x, h * 0.55, z], [x + rand(-.35, .35), h, z + rand(-.35, .35)]],
      [0.22, 0.16, 0.11], 0x9c7a52, 6, 1);
    // due rami accennati verso la chioma
    for (const s of [-1, 1]) {
      tube(this.B.bark, [[x, h * 0.72, z], [x + s * 0.5, h * 0.95, z + s * 0.3]], [0.08, 0.05], 0x9c7a52, 4, 1);
    }
    const r = rand(1.7, 2.7);
    const green = pick([0x3f6b31, 0x4a7a38, 0x35602c, 0x557f3a]);
    for (let i = 0; i < 5; i++) {
      this.leaves.push({
        x: x + rand(-1.1, 1.1), y: h + rand(-0.3, 1.2), z: z + rand(-1.1, 1.1),
        r: r * rand(0.5, 0.95), color: green,
      });
    }
    return { x, z, r: 0.4 };
  }

  hedge(cx, cz, w, d, rng) {
    const h = rand(0.8, 1.2);
    this.B.foliage.box(cx, h / 2, cz, w, h, d, pick([0x3d6b31, 0x477a37, 0x35602c]), 0);
    // cimatura irregolare
    for (let i = 0; i < 3; i++) {
      this.B.foliage.box(cx + rand(-w / 3, w / 3), h, cz + rand(-d / 3, d / 3),
        w * 0.4, 0.25, d * 0.6, 0x4d8038, 0);
    }
  }

  /** Lampione a braccio ricurvo, quello dei viali californiani. */
  streetlight(x, z, dir, h = 8.2) {
    const det = this.B.detail;
    cyl(det, x, z, 0, 0.26, 0.22, 0.19, 0x6f7276, 10);
    tube(det, [[x, 0.24, z], [x, h * 0.7, z], [x, h, z]], [0.15, 0.13, 0.12], 0x8d9298, 8, 1);
    // braccio curvo verso la strada
    const nx = Math.cos(dir), nz = Math.sin(dir);
    const arm = 2.6;
    const pts = [], radii = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      pts.push([x + nx * arm * t, h + Math.sin(t * Math.PI * 0.5) * 0.9, z + nz * arm * t]);
      radii.push(0.11 - t * 0.02);
    }
    tube(det, pts, radii, 0x8d9298, 5, 1);
    const lx = x + nx * arm, lz = z + nz * arm, ly = h + 0.9;
    det.box(lx, ly - 0.12, lz, 1.1, 0.22, 0.5, 0x7d8288, 0, dir);
    this.B.lamp.box(lx, ly - 0.3, lz, 0.9, 0.1, 0.4, 0xffe6b0, 0, dir);
    // pozza di luce sull'asfalto: senza costa nulla e la notte diventa leggibile
    this.B.glow.quadY(lx - 5.5, lz - 5.5, lx + 5.5, lz + 5.5, 0.04, 0x2a1c08);
    this.lampPos.push({ x: lx, y: ly - 0.4, z: lz });
    return { x, z, r: 0.3, lamp: { x: lx, y: ly - 0.4, z: lz } };
  }

  /**
   * Semaforo con braccio sopra la carreggiata. Le lenti finiscono in due
   * gruppi (asse A / asse B) cosi' basta cambiare due materiali per far
   * scattare tutti i semafori della citta'.
   */
  trafficLight(x, z, dir, axis) {
    const det = this.B.detail;
    const nx = Math.cos(dir), nz = Math.sin(dir);
    tube(det, [[x, 0.2, z], [x, 4.4, z], [x, 6.2, z]], [0.17, 0.15, 0.13], 0x50565c, 8, 1);
    cyl(det, x, z, 0, 0.24, 0.26, 0.22, 0x50565c, 10);
    const arm = 5.2;
    det.box(x + nx * arm / 2, 6.1, z + nz * arm / 2, nx !== 0 ? arm : 0.16, 0.16, nx !== 0 ? 0.16 : arm, 0x50565c);
    for (const t of [0.55, 0.95]) {
      const hx = x + nx * arm * t, hz = z + nz * arm * t;
      det.box(hx, 5.55, hz, 0.4, 1.3, 0.42, 0x2f353b, 0, dir);
      det.box(hx, 6.24, hz, 0.46, 0.1, 0.48, 0x22272c, 0, dir);
      const face = dir + Math.PI;
      const fx = Math.cos(face), fz = Math.sin(face);
      // lenti con visierina
      for (const [y, key] of [[5.95, axis === 0 ? 'redA' : 'redB'], [5.15, axis === 0 ? 'greenA' : 'greenB']]) {
        this.B[key].box(hx + fx * 0.22, y, hz + fz * 0.22, 0.1, 0.24, 0.24, 0xffffff, 0, dir);
        det.box(hx + fx * 0.3, y + 0.16, hz + fz * 0.3, 0.16, 0.06, 0.3, 0x22272c, 0, dir);
      }
      det.box(hx + fx * 0.22, 5.55, hz + fz * 0.22, 0.09, 0.24, 0.24, 0x4a3a12, 0, dir);
      det.box(hx + fx * 0.3, 5.71, hz + fz * 0.3, 0.16, 0.06, 0.3, 0x22272c, 0, dir);
    }
    return { x, z, r: 0.28 };
  }

  bench(x, z, dir) {
    const det = this.B.detail;
    this.benches.push({ x, z, dir });
    const ax = -Math.sin(dir), az = -Math.cos(dir);      // lungo la seduta
    for (const s of [-1, 1]) {
      const lx = x + ax * s * 0.82, lz = z + az * s * 0.82;
      for (const o of [-0.22, 0.22]) {
        cyl(det, lx + Math.cos(dir) * o, lz - Math.sin(dir) * o, 0, 0.44, 0.035, 0.035, 0x4a4f55, 8);
      }
      cyl(det, lx, lz, 0.44, 0.47, 0.05, 0.05, 0x4a4f55, 8);
    }
    // doghe della seduta e dello schienale
    for (let i = 0; i < 4; i++) {
      det.box(x + Math.cos(dir) * (i * 0.16 - 0.24), 0.48, z - Math.sin(dir) * (i * 0.16 - 0.24),
        2.0, 0.06, 0.13, 0x8a6a44, 0, dir);
    }
    for (let i = 0; i < 3; i++) {
      det.box(x - Math.cos(dir) * 0.3, 0.66 + i * 0.16, z + Math.sin(dir) * 0.3,
        2.0, 0.12, 0.06, 0x8a6a44, 0, dir);
    }
    for (const s of [-1, 1]) {
      det.box(x + ax * s * 0.82 - Math.cos(dir) * 0.3, 0.62, z + az * s * 0.82 + Math.sin(dir) * 0.3,
        0.08, 0.5, 0.06, 0x4a4f55, 0, dir);
    }
  }

  bin(x, z) {
    const det = this.B.detail;
    cyl(det, x, z, 0.03, 0.92, 0.29, 0.33, 0x3f4a52, 12);
    cyl(det, x, z, 0.9, 1.0, 0.35, 0.3, 0x2a333a, 12);
    for (let i = 0; i < 3; i++) cyl(det, x, z, 0.2 + i * 0.28, 0.24 + i * 0.28, 0.335, 0.335, 0x556069, 12);
  }

  hydrant(x, z) {
    const det = this.B.detail;
    cyl(det, x, z, 0, 0.1, 0.24, 0.2, 0xa93226, 10);
    cyl(det, x, z, 0.1, 0.58, 0.16, 0.15, 0xc0392b, 10);
    dome(det, x, 0.58, z, 0.17, 0xc0392b, 10, 3, 0.9);
    cyl(det, x, z, 0.72, 0.8, 0.06, 0.05, 0xa93226, 8);
    for (const s of [-1, 1]) {
      det.box(x + s * 0.2, 0.4, z, 0.14, 0.13, 0.13, 0xa93226);
    }
    det.box(x, 0.4, z + 0.2, 0.13, 0.13, 0.14, 0xa93226);
  }

  meter(x, z) {
    const det = this.B.detail;
    cyl(det, x, z, 0, 1.05, 0.05, 0.045, 0x6b7076, 8);
    cyl(det, x, z, 1.05, 1.35, 0.11, 0.1, 0x3f4a52, 10);
    dome(det, x, 1.35, z, 0.1, 0x3f4a52, 10, 2, 0.7);
    det.box(x + 0.09, 1.22, z, 0.03, 0.14, 0.1, 0xc9ccd2);
  }

  busStop(x, z, dir) {
    const det = this.B.detail;
    const nx = Math.cos(dir), nz = Math.sin(dir);
    for (const s of [-1, 1]) {
      det.box(x + nz * s * 1.7, 1.25, z - nx * s * 1.7, 0.12, 2.5, 0.12, 0x5b6167);
    }
    det.box(x, 2.55, z, nx !== 0 ? 1.4 : 3.6, 0.12, nx !== 0 ? 3.6 : 1.4, 0x76808a);
    det.box(x - nx * 0.6, 1.3, z - nz * 0.6, nx !== 0 ? 0.08 : 3.4, 2.2, nx !== 0 ? 3.4 : 0.08, 0x9fb4c4);
    this.bench(x, z, dir);
  }

  /** Cassonetto, cassette postali, scatoloni: piccolo disordine urbano. */
  clutter(x, z, rng) {
    const det = this.B.detail;
    if (rng() < 0.5) {
      det.box(x, 0.6, z, 1.8, 1.2, 1.0, pick([0x2f6b4a, 0x3a5f8a, 0x6b5a2f]), 0, rand(0, 3));
      det.box(x, 1.24, z, 1.86, 0.12, 1.06, 0x2a2f34);
    } else {
      for (let i = 0; i < 3; i++) {
        det.box(x + rand(-0.5, 0.5), 0.25, z + rand(-0.5, 0.5), 0.6, 0.5, 0.6, 0x2b2f33, 0, rand(0, 3));
      }
    }
  }

  /** Chiude gli oggetti ripetuti in InstancedMesh e li aggiunge alla scena. */
  finish(group, mats) {
    if (this.tufts.length && mats.tuft) {
      const geo = crossedQuads();
      const mesh = new THREE.InstancedMesh(geo, mats.tuft, this.tufts.length);
      const m = new THREE.Matrix4();
      const col = new THREE.Color();
      this.tufts.forEach((t, i) => {
        m.compose(new THREE.Vector3(t.x, 0.02, t.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.rot, 0)),
          new THREE.Vector3(t.s * 1.1, t.s, t.s * 1.1));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, col.setHex(t.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (this.fronds.length) {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.translate(0.42, 0, 0);
      const mesh = new THREE.InstancedMesh(geo, mats.frond, this.fronds.length);
      this.fronds.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    if (this.leaves.length) {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const mesh = new THREE.InstancedMesh(geo, mats.leaf, this.leaves.length);
      const m = new THREE.Matrix4();
      const c = new THREE.Color();
      this.leaves.forEach((l, i) => {
        m.compose(new THREE.Vector3(l.x, l.y, l.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3))),
          new THREE.Vector3(l.r, l.r * 0.8, l.r));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.setHex(l.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      group.add(mesh);
    }
  }
}
