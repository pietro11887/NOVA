import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Scenery, ENV } from './scenery.js';
import { PIT, TRACK } from './trackData.js';

// Baku City Circuit: la città vera intorno alla pista, dai dati OpenStreetMap
// (© OpenStreetMap contributors, ODbL). Edifici estrusi con le loro forme e altezze,
// strade, parchi del lungomare, il Mar Caspio, la Città Vecchia con le mura merlate e la
// Torre della Vergine, le Flame Towers sulla collina, la torre della TV, la Crystal Hall.

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3();
const mat4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
  E.set(rx, ry, rz, 'YXZ'); Q.setFromEuler(E);
  return new THREE.Matrix4().compose(V.set(x, y, z), Q, SC.set(sx, sy, sz));
};

// punto dentro il poligono [[x,z],...]
function pip(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
  }
  return c;
}
function bbox(poly) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return { x0, x1, z0, z1 };
}
function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0;
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}

// texture delle facciate: una campata (3,6 m) per un piano (3,4 m)
function facadeTexture(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  if (kind === 'stone') {
    x.fillStyle = '#f3efe6'; x.fillRect(0, 0, 128, 128);
    // conci di pietra appena accennati
    x.fillStyle = 'rgba(120,100,70,0.08)';
    for (let r = 0; r < 8; r++) x.fillRect(0, r * 16, 128, 1);
    // finestra alta con arco ribassato, cornice e davanzale
    x.fillStyle = '#e2dccf'; x.fillRect(34, 22, 60, 88);
    x.fillStyle = '#3b4553'; x.beginPath(); x.moveTo(40, 104); x.lineTo(40, 40); x.quadraticCurveTo(64, 22, 88, 40); x.lineTo(88, 104); x.fill();
    x.fillStyle = 'rgba(190,210,230,0.35)'; x.fillRect(42, 44, 20, 58);
    x.fillStyle = '#d8d1c2'; x.fillRect(62, 34, 4, 70); x.fillRect(40, 66, 48, 3);
    x.fillStyle = '#cfc6b4'; x.fillRect(30, 104, 68, 6);
    x.fillStyle = '#ddd5c5'; x.fillRect(0, 120, 128, 8);
  } else {
    // vetrata continua con montanti e marcapiano
    const g = x.createLinearGradient(0, 0, 128, 128);
    g.addColorStop(0, '#9fb6c9'); g.addColorStop(0.5, '#5f7890'); g.addColorStop(1, '#8aa3b8');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#d9dee3'; x.fillRect(0, 0, 128, 10); x.fillRect(0, 0, 6, 128); x.fillRect(62, 10, 4, 118);
    x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(10, 14, 20, 110);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// bandiera dell'Azerbaigian
function azFlagTexture() {
  const c = document.createElement('canvas'); c.width = 384; c.height = 192;
  const x = c.getContext('2d');
  x.fillStyle = '#00b5e2'; x.fillRect(0, 0, 384, 64);
  x.fillStyle = '#ef3340'; x.fillRect(0, 64, 384, 64);
  x.fillStyle = '#509e2f'; x.fillRect(0, 128, 384, 64);
  x.fillStyle = '#fff'; x.beginPath(); x.arc(184, 96, 26, 0, 7); x.fill();
  x.fillStyle = '#ef3340'; x.beginPath(); x.arc(191, 96, 21, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.beginPath();
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, r = k % 2 ? 6 : 13; x.lineTo(214 + Math.cos(a) * r, 96 + Math.sin(a) * r); }
  x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BakuScenery extends Scenery {
  constructor(scene, track, renderer, quality) {
    super(scene, track, renderer, quality);
    this.data = TRACK.data;
    this.brand = { gantry: 'BAKU', gantryBg: ['#0092bc', '#00b5e2'], stand: 'BAKU CITY CIRCUIT', standBg: ['#ef3340', '#00b5e2'] };
    this.floorY = -3;
    const b = this.bounds, pad = this.low ? 650 : 850;
    this.terrainBox = { x0: b.minX - pad, x1: b.maxX + pad, z0: b.minZ - pad, z1: b.maxZ + pad };
    this.setupCoast();
    this.setupBuildings();
  }

  setupLake() { this.lake = null; }

  // ------------------------------------------------------------------ costa
  setupCoast() {
    const [east, west] = this.data.coast;          // west: da sud-ovest al porto; east: dal porto verso est
    const chain = [...west, ...east.slice(1)];
    const a = chain[0], z = chain[chain.length - 1], F = 16000;
    // terra a sinistra della linea di costa (convenzione OSM): nord e ovest
    this.land = [...chain, [z[0] + 3000, z[1]], [z[0] + 3000, -F], [-F, -F], [-F, a[1]]];
    this.seaPoly = [...chain.slice().reverse(), [-F, a[1]], [-F, F], [z[0] + 3000, F], [z[0] + 3000, z[1]]];
    // costa: indice dei segmenti per la distanza dal mare
    this.coastSeg = [];
    for (let i = 1; i < chain.length; i++) this.coastSeg.push([chain[i - 1], chain[i]]);
    // isola della Crystal Hall e piazza della Bandiera (dall'altra parte della baia)
    const ch = this.data.landmarks.crystalHall;
    this.island = [];
    for (let k = 0; k < 40; k++) {
      const t = k / 40 * Math.PI * 2;
      this.island.push([ch[0] + 120 + Math.cos(t) * 520 * (1 + 0.08 * Math.sin(3 * t)), ch[1] + Math.sin(t) * 230]);
    }
  }
  isLand(x, z) { return pip(this.land, x, z) || pip(this.island, x, z); }

  // ------------------------------------------------------------------ edifici
  setupBuildings() {
    this.bcell = 50;
    this.bgrid = new Map();
    this.blds = [];
    const ch = this.data.landmarks;
    for (const b of this.data.buildings) {
      const bb = bbox(b.p);
      // il monumento lo costruiamo noi
      if (Math.hypot((bb.x0 + bb.x1) / 2 - ch.maidenTower[0], (bb.z0 + bb.z1) / 2 - ch.maidenTower[1]) < 14) continue;
      this.addBld({ p: b.p, h: b.h, k: b.k, bb });
    }
  }
  addBld(b) {
    const id = this.blds.length;
    this.blds.push(b);
    const c = this.bcell;
    for (let i = Math.floor(b.bb.x0 / c); i <= Math.floor(b.bb.x1 / c); i++)
      for (let j = Math.floor(b.bb.z0 / c); j <= Math.floor(b.bb.z1 / c); j++) {
        const k = i + ',' + j;
        if (!this.bgrid.has(k)) this.bgrid.set(k, []);
        this.bgrid.get(k).push(id);
      }
  }
  // c'è un edificio entro r metri?
  inBuilding(x, z, r = 0) {
    const c = this.bcell, seen = new Set();
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const arr = this.bgrid.get(i + ',' + j);
        if (!arr) continue;
        for (const id of arr) {
          if (seen.has(id)) continue; seen.add(id);
          const b = this.blds[id];
          if (b.dead || x < b.bb.x0 - r || x > b.bb.x1 + r || z < b.bb.z0 - r || z > b.bb.z1 + r) continue;
          if (pip(b.p, x, z)) return true;
          if (r > 0) for (let q = 0, w = b.p.length - 1; q < b.p.length; w = q++) if (segDist(x, z, b.p[w], b.p[q]) < r) return true;
        }
      }
    return false;
  }
  // toglie gli edifici che toccano un cerchio (box, tribune, mura)
  clearBuildings(x, z, r) {
    const c = this.bcell;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        for (const id of this.bgrid.get(i + ',' + j) || []) {
          const b = this.blds[id];
          if (b.dead || x < b.bb.x0 - r || x > b.bb.x1 + r || z < b.bb.z0 - r || z > b.bb.z1 + r) continue;
          let hit = pip(b.p, x, z);
          for (let q = 0, w = b.p.length - 1; q < b.p.length && !hit; w = q++) if (segDist(x, z, b.p[w], b.p[q]) < r) hit = true;
          if (hit) b.dead = true;
        }
      }
  }

  free(x, z, r) { return super.free(x, z, r) && !this.inBuilding(x, z, r) && this.isLand(x, z) && this.clearance(x, z).d > 0.2; }

  // ------------------------------------------------------------------ quote
  baseHeight(x, z) {
    const S = this.track.samples;
    const nr = this.nearest(x, z);
    const s = S[nr.i];
    const wall = Math.max(s.wallLVis ?? s.wallL, s.wallRVis ?? s.wallR);
    let ws = 0, ys = 0;
    for (const c of this.coarse) {
      const d2 = (c.x - x) ** 2 + (c.z - z) ** 2 + 100;
      const w = 1 / (d2 * d2);
      ws += w; ys += w * c.y;
    }
    const t = smooth(wall + 1, wall + 55, nr.d);
    let y = (s.y - 0.3) * (1 - t) + (ys / ws - 0.3) * t;
    // l'anfiteatro di Baku: la città sale verso ovest (collina delle Flame Towers) e verso nord
    const away = smooth(wall + 40, wall + 260, nr.d);
    y += away * (52 * smooth(-700, -1400, x) * smooth(1700, 900, z) + 18 * smooth(-900, -1500, z));
    // verso i bordi si raccorda con la terra lontana
    const tb = this.terrainBox;
    const edge = Math.min(x - tb.x0, tb.x1 - x, z - tb.z0, tb.z1 - z);
    return this.floorY + (y - this.floorY) * smooth(0, 220, edge);
  }

  // quota esatta della mesh del terreno (dopo terrain()), altrimenti quella teorica
  heightAt(x, z) {
    const T = this.tgrid;
    if (!T) return this.baseHeight(x, z);
    const fx = (x - T.x0) / T.step, fz = (z - T.z0) / T.step;
    if (fx < 0 || fz < 0 || fx >= T.nx || fz >= T.nz) return this.floorY;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const H = (a, b) => T.h[b * (T.nx + 1) + a];
    // stessi triangoli della mesh: (i,j)-(i,j+1)-(i+1,j) e (i+1,j)-(i,j+1)-(i+1,j+1)
    if (u + v <= 1) return H(i, j) + (H(i + 1, j) - H(i, j)) * u + (H(i, j + 1) - H(i, j)) * v;
    return H(i + 1, j + 1) + (H(i, j + 1) - H(i + 1, j + 1)) * (1 - u) + (H(i + 1, j) - H(i + 1, j + 1)) * (1 - v);
  }

  build() {
    const steps = ['sky', 'farHills', 'sea', 'terrain', 'pitGarages', 'walls', 'grandstands', 'gantry', 'screen', 'billboards',
      'buildings', 'roads', 'landmarks', 'trackside', 'brakeBoards', 'spectators', 'cityTrees', 'lamps'];
    for (const s of steps) { const t0 = performance.now(); this[s](); if (window.__perfLog) console.log('PERF', s, Math.round(performance.now() - t0)); }
    this.batch.flush(this.group);
  }

  // ------------------------------------------------------------------ orizzonte
  // colline aride dell'Absheron a nord e a ovest (sul mare niente)
  farHills() {
    const sun = ENV.sunDir, haze = new THREE.Color(0xc4cfd8);
    const sand = new THREE.Color(0xb9a37a), scrub = new THREE.Color(0x8f8a63), rock = new THREE.Color(0x8c7f6c);
    const r = rand(77), cx = this.center.x, cz = this.center.z;
    const segA = this.low ? 120 : 200, segR = 6, R0 = 3300, W = 900, y0 = this.floorY - 2;
    const ph = Array.from({ length: 6 }, () => r() * 6.28);
    const pos = [];
    for (let j = 0; j <= segR; j++) for (let i = 0; i <= segA; i++) {
      const a = i / segA * Math.PI * 2, t = j / segR, R = R0 + t * W;
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
      const land = this.isLand(cx + Math.cos(a) * (R0 - 200), cz + Math.sin(a) * (R0 - 200)) ? 1 : 0;
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1)), 0.8);
      const n = 0.5 + 0.25 * Math.sin(a * 5 + ph[0]) + 0.15 * Math.sin(a * 13 + ph[1] + t * 3) + 0.1 * Math.sin(a * 31 + ph[2]);
      const h = land ? 210 * env * Math.max(0.08, n) : -40;
      pos.push(x, y0 + h - (j === 0 || j === segR ? 25 : 0), z);
    }
    const idx = [];
    for (let j = 0; j < segR; j++) for (let i = 0; i < segA; i++) {
      const a = j * (segA + 1) + i, b = a + 1, c = a + segA + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g = g.toNonIndexed(); g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal, col = new Float32Array(P.count * 3);
    const c = new THREE.Color(), nrm = new THREE.Vector3();
    for (let v = 0; v < P.count; v += 3) {
      nrm.set(N.getX(v), N.getY(v), N.getZ(v)).normalize();
      const hy = (P.getY(v) + P.getY(v + 1) + P.getY(v + 2)) / 3 - y0;
      c.copy(1 - nrm.y > 0.4 ? rock : hy > 90 ? sand : scrub).offsetHSL(0, 0, (r() - 0.5) * 0.05);
      c.multiplyScalar(0.6 + 0.55 * Math.max(0, nrm.dot(sun))).lerp(haze, 0.45);
      for (let q = 0; q < 3; q++) col.set([c.r, c.g, c.b], (v + q) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    m.frustumCulled = false;
    this.scene.add(m);
    // terra lontana (oltre il terreno dettagliato)
    const shape = new THREE.Shape(this.land.map(([x, z]) => new THREE.Vector2(x, -z)));
    const lg = new THREE.ShapeGeometry(shape);
    lg.rotateX(-Math.PI / 2);
    const lm = new THREE.Mesh(lg, new THREE.MeshLambertMaterial({ color: 0xa89a80, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }));
    lm.position.y = this.floorY - 0.4;
    lm.receiveShadow = false;
    this.scene.add(lm);
  }

  // Mar Caspio (solo dove c'è mare: niente acqua sotto la città)
  sea() {
    const toShape = poly => new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const shape = toShape(this.seaPoly);
    shape.holes.push(new THREE.Path(this.island.slice().reverse().map(([x, z]) => new THREE.Vector2(x, -z))));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1d5f78, roughness: 0.06, metalness: 0.15, envMapIntensity: 1.0 });
    const uT = { value: 0 };
    mat.onBeforeCompile = sh => {
      sh.uniforms.uT = uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; uniform float uT;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec2 q = vW.xz * 0.12;
          float w1 = sin(q.x * 1.0 + q.y * 0.6 + uT * 1.1), w2 = sin(q.x * -0.7 + q.y * 1.3 - uT * 0.9), w3 = sin((q.x + q.y) * 2.9 + uT * 1.9);
          float w4 = sin(q.x * 6.1 - q.y * 4.3 + uT * 2.7);
          vec3 wn = normalize(vec3(w1 * 0.03 + w3 * 0.014 + w4 * 0.006, 1.0, w2 * 0.03 - w3 * 0.012));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`);
    };
    this.animated.push(t => { uT.value = t; });
    const m = new THREE.Mesh(g, mat);
    m.position.y = -1.1;
    m.receiveShadow = true;
    this.group.add(m);
    this.seaY = -1.1;
  }

  // ------------------------------------------------------------------ terreno
  terrain() {
    const tb = this.terrainBox, step = this.low ? 14 : 11;
    const nx = Math.ceil((tb.x1 - tb.x0) / step), nz = Math.ceil((tb.z1 - tb.z0) / step);
    const N = (nx + 1) * (nz + 1);
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), hh = new Float32Array(N);
    const kind = new Uint8Array(N);                 // 0 città, 1 parco, 2 mare, 3 campagna
    const vx = i => tb.x0 + i * step, vz = j => tb.z0 + j * step;
    // terra o mare
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) kind[j * (nx + 1) + i] = this.isLand(vx(i), vz(j)) ? 0 : 2;
    // parchi e giardini
    for (const p of this.data.parks) {
      const b = bbox(p);
      for (let j = Math.max(0, Math.ceil((b.z0 - tb.z0) / step)); j <= Math.min(nz, Math.floor((b.z1 - tb.z0) / step)); j++)
        for (let i = Math.max(0, Math.ceil((b.x0 - tb.x0) / step)); i <= Math.min(nx, Math.floor((b.x1 - tb.x0) / step)); i++) {
          const k = j * (nx + 1) + i;
          if (kind[k] === 0 && pip(p, vx(i), vz(j))) kind[k] = 1;
        }
    }
    // fuori dalla zona mappata: campagna arida (con qualche quartiere finto, vedi buildings())
    const db = this.dataBox();
    const r = rand(5), c = new THREE.Color(), t2 = new THREE.Color();
    const CITY = new THREE.Color(0xa59f92), PARK = new THREE.Color(0x5f8a43), SEA = new THREE.Color(0x6b6650), DRY = new THREE.Color(0xb4a27c);
    // distanza dalla riva (in celle) per il fondale: due passate di chamfer sulla griglia
    const W = nx + 1, dist = new Float32Array(N);
    for (let q = 0; q < N; q++) dist[q] = kind[q] === 2 ? 1e9 : 0;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const q = j * W + i; let d = dist[q];
      if (i > 0) d = Math.min(d, dist[q - 1] + 1);
      if (j > 0) d = Math.min(d, dist[q - W] + 1, i > 0 ? dist[q - W - 1] + 1.414 : 1e9, i < nx ? dist[q - W + 1] + 1.414 : 1e9);
      dist[q] = d;
    }
    for (let j = nz; j >= 0; j--) for (let i = nx; i >= 0; i--) {
      const q = j * W + i; let d = dist[q];
      if (i < nx) d = Math.min(d, dist[q + 1] + 1);
      if (j < nz) d = Math.min(d, dist[q + W] + 1, i < nx ? dist[q + W + 1] + 1.414 : 1e9, i > 0 ? dist[q + W - 1] + 1.414 : 1e9);
      dist[q] = d;
    }
    let k = 0;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++, k++) {
      const x = vx(i), z = vz(j);
      const kd = kind[k];
      let y = kd === 2 ? 0 : this.baseHeight(x, z);
      const n = Math.sin(x * 0.07) * Math.cos(z * 0.05) * 0.5 + 0.5;
      if (kd === 2) {
        // fondale: scende in fretta dalla banchina
        y = -1.6 - Math.min(10, dist[k] * step * 0.25);
        c.copy(SEA);
      } else if (kd === 1) {
        c.copy(PARK).offsetHSL((n - 0.5) * 0.03, 0, (r() - 0.5) * 0.05);
      } else {
        const inData = x > db.x0 && x < db.x1 && z > db.z0 && z < db.z1;
        c.copy(CITY).offsetHSL(0, 0, (n - 0.5) * 0.04 + (r() - 0.5) * 0.03);
        if (!inData) c.lerp(t2.copy(DRY), 0.35 + 0.4 * n);
      }
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; hh[k] = y;
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    // il terreno resta sempre sotto ogni tratto di pista vicino (anche tra due tratti a quote diverse)
    for (const sm of this.track.samples) {
      const R = Math.max(sm.wallLVis ?? sm.wallL, sm.wallRVis ?? sm.wallR) + step * 1.6, top = sm.y - 0.35;
      const i0 = Math.max(0, Math.floor((sm.x - R - tb.x0) / step)), i1 = Math.min(nx, Math.ceil((sm.x + R - tb.x0) / step));
      const j0 = Math.max(0, Math.floor((sm.z - R - tb.z0) / step)), j1 = Math.min(nz, Math.ceil((sm.z + R - tb.z0) / step));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const q = j * (nx + 1) + i;
        if (hh[q] > top && (vx(i) - sm.x) ** 2 + (vz(j) - sm.z) ** 2 < R * R) { hh[q] = top; pos[q * 3 + 1] = top; }
      }
    }
    // pista del box: stesso trattamento lungo la corsia
    for (const p of this.track.pit.pts) {
      const R = PIT.halfW + 2 + step * 1.6, top = p.y - 0.35;
      const i0 = Math.max(0, Math.floor((p.x - R - tb.x0) / step)), i1 = Math.min(nx, Math.ceil((p.x + R - tb.x0) / step));
      const j0 = Math.max(0, Math.floor((p.z - R - tb.z0) / step)), j1 = Math.min(nz, Math.ceil((p.z + R - tb.z0) / step));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const q = j * (nx + 1) + i;
        if (hh[q] > top) { hh[q] = top; pos[q * 3 + 1] = top; }
      }
    }
    this.tgrid = { x0: tb.x0, z0: tb.z0, step, nx, nz, h: hh };
    const idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b2 = a + 1, c2 = a + nx + 1, d = c2 + 1;
      idx.push(a, c2, b2, b2, c2, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  // rettangolo coperto dai dati OSM
  dataBox() {
    if (this._db) return this._db;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const b of this.data.buildings) for (const [x, z] of b.p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return (this._db = { x0: x0 + 30, x1: x1 - 30, z0: z0 + 30, z1: z1 - 30 });
  }

  // ------------------------------------------------------------------ box
  // garage temporanei lungo la corsia box vera (lato città)
  pitGarages() {
    const pts = this.track.pit.pts, sd = PIT.side;
    const at = ss => { let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].ss < ss) lo = m; else hi = m; } return pts[lo]; };
    const teams = [0xff8a1c, 0xd8231f, 0x2a62c9, 0x1f9a4a, 0xf5c518, 0x6a2cd8, 0x111111, 0xf2f2f2, 0x27c3ea, 0xe0457b];
    const gw = PIT.boxGap;
    for (let k = -1; k <= 20; k++) {
      const p = at(PIT.boxFrom + k * gw);
      const off = PIT.halfW + 1.2 + 7;
      const x = p.x + p.nx * sd * off, z = p.z + p.nz * sd * off;
      const ry = Math.atan2(-p.nx * sd, -p.nz * sd);   // +Z locale verso la corsia
      const fx = Math.sin(ry), fz = Math.cos(ry);
      const y = p.y;
      const team = k < 0 || k > 19 ? 0xe9eaec : teams[k % teams.length];
      this.batch.add(new THREE.BoxGeometry(gw, 7.5, 14), this.colored, mat4(x, y + 3.75, z, ry), 0xeceef1);
      this.batch.add(new THREE.BoxGeometry(gw - 2.4, 5, 0.2), this.colored, mat4(x + fx * 7.0, y + 2.5, z + fz * 7.0, ry), k < 0 || k > 19 ? 0x8a9099 : 0x22252b);
      this.batch.add(new THREE.BoxGeometry(gw, 1.1, 0.3), this.colored, mat4(x + fx * 7.05, y + 6.3, z + fz * 7.05, ry), team);
      // piano superiore (hospitality) con vetrate e terrazza
      this.batch.add(new THREE.BoxGeometry(gw, 3.6, 10), this.colored, mat4(x - fx * 2, y + 9.3, z - fz * 2, ry), 0x6f8597);
      this.batch.add(new THREE.BoxGeometry(gw, 0.5, 14.6), this.colored, mat4(x, y + 11.35, z, ry), 0xd8231f);
      this.clearBuildings(x, z, 10.5);
      this.occupied.push([x, z, 12]);
    }
    // paddock dietro i box: strada di servizio, motorhome
    const r = rand(17);
    for (let k = 0; k < 18; k++) {
      const p = at(PIT.boxFrom + k * gw * 1.1);
      const off = PIT.halfW + 1.2 + 14 + 9;
      const x = p.x + p.nx * sd * off, z = p.z + p.nz * sd * off;
      if (this.inBuilding(x, z, 4) || !this.isLand(x, z)) continue;
      const ry = Math.atan2(-p.nx * sd, -p.nz * sd) + Math.PI / 2;
      const team = teams[k % teams.length];
      this.batch.add(new THREE.BoxGeometry(13, 3.8, 2.6), this.colored, mat4(x, y0(this, x, z) + 2.2, z, ry), r() < 0.5 ? team : 0xf2f2f2);
      this.occupied.push([x, z, 8]);
    }
    function y0(self, x, z) { return self.heightAt(x, z); }
  }

  // ------------------------------------------------------------------ Città Vecchia
  // mura merlate in pietra calcarea con torri semicircolari, sul lato interno dell'anello
  walls() {
    const S = this.track.samples, n = this.track.count, C = [-536, 364];
    const stone = 0xc9ae80, stone2 = 0xbea275;
    const run = [];
    const flush = () => {
      if (run.length > 6) this.wallRun(run.slice(), stone, stone2);
      run.length = 0;
    };
    for (let i = 0; i < n; i += 2) {
      const s = S[i];
      if (s.s < 2600 || s.s > 4650) { flush(); continue; }
      const dx = C[0] - s.x, dz = C[1] - s.z;
      if (Math.hypot(dx, dz) > 410) { flush(); continue; }
      const side = Math.sign(dx * s.nx + dz * s.nz);
      const wv = side > 0 ? (s.wallLVis ?? s.wallL) : (s.wallRVis ?? s.wallR);
      const d = (wv + 2.6) * side;
      const x = s.x + s.nx * d, z = s.z + s.nz * d;
      if (this.inBuilding(x, z, 1.8) || !this.isLand(x, z) || this.clearance(x, z).d < 1.2) { flush(); continue; }
      run.push({ x, z, s, side });
    }
    flush();
  }
  wallRun(run, stone, stone2) {
    // smussa il tracciato delle mura
    const P = run.map((p, k) => {
      const a = run[Math.max(0, k - 2)], b = run[Math.min(run.length - 1, k + 2)];
      return { x: (a.x + p.x * 2 + b.x) / 4, z: (a.z + p.z * 2 + b.z) / 4 };
    });
    const H = 8.5, T = 2.4;
    const merlon = new THREE.BoxGeometry(1.1, 1.3, T * 0.5);
    let acc = 0, lastTower = -30;
    for (let k = 1; k < P.length; k++) {
      const a = P[k - 1], b = P[k];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.1) continue;
      const ry = Math.atan2(-(b.z - a.z), b.x - a.x);
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, y = this.heightAt(mx, mz);
      this.batch.add(new THREE.BoxGeometry(len + 0.3, H + 3, T), this.colored, mat4(mx, y + H / 2 - 1.5, mz, ry), k % 3 ? stone : stone2);
      // merli
      for (let q = 0; q < len; q += 2.2) {
        const f = (q + 0.6) / len;
        if (f > 1) break;
        const px = a.x + (b.x - a.x) * f, pz = a.z + (b.z - a.z) * f;
        this.batch.add(merlon, this.colored, mat4(px, y + H + 0.55, pz, ry), stone);
      }
      acc += len;
      // torri semicircolari ogni ~38 m, sporgenti verso la pista
      if (acc - lastTower > 38) {
        lastTower = acc;
        // la torre sporge verso la città, mai oltre la barriera verso la pista
        const sg = run[k].side, s = run[k].s;
        const cx = b.x + s.nx * sg * 2.0, cz = b.z + s.nz * sg * 2.0;
        const th = H + 2.5;
        this.batch.add(new THREE.CylinderGeometry(3.0, 3.3, th + 2, 14), this.colored, mat4(cx, y + th / 2 - 1, cz), stone2);
        for (let q = 0; q < 10; q++) {
          const ang = q / 10 * Math.PI * 2;
          this.batch.add(merlon, this.colored, mat4(cx + Math.cos(ang) * 2.7, y + th + 0.55, cz + Math.sin(ang) * 2.7, -ang + Math.PI / 2), stone);
        }
        this.occupied.push([cx, cz, 5]);
      }
      this.occupied.push([mx, mz, 3]);
    }
  }

  // ------------------------------------------------------------------ tribune
  grandstands() {
    const S = this.track.samples, n = this.track.count, st = this.track.step, L = this.track.length;
    const stands = [];
    const tryStand = (i, side, len, rows) => {
      const f = this.frame(i, side, 3);
      const depth = rows * 0.85 + 2;
      const cs = Math.cos(f.ry), sn = Math.sin(f.ry);
      for (const [lx, lz] of [[-len / 2, 1], [len / 2, 1], [-len / 2, -depth], [len / 2, -depth], [0, -depth / 2], [0, 1]]) {
        const x = f.x + lx * cs + lz * sn, z = f.z - lx * sn + lz * cs;
        if (this.inBuilding(x, z, 1) || !this.isLand(x, z) || !super.free(x, z, 1) || this.clearance(x, z).d < -0.5) return false;
      }
      for (let k = -Math.round(len / 2 / st); k <= Math.round(len / 2 / st); k++) if (Math.abs(S[(i + k + n) % n].curv) > 0.006) return false;
      stands.push(this.place(this.makeStand(len, rows), i, side, 3));
      return true;
    };
    // rettilineo d'arrivo, lato mare
    for (let ss = -1100; ss <= 330; ss += 70) {
      const i = Math.round((((ss % L) + L) % L) / st) % n;
      tryStand(i, -PIT.side, 60, 18) || tryStand(i, -PIT.side, 40, 14);
    }
    // curve lente: esterno curva
    let last = -999;
    for (let i = 0; i < n; i += 3) {
      if (Math.abs(S[i].curv) < 0.02 || i - last < 80) continue;
      const side = S[i].curv > 0 ? 1 : -1;
      for (const k of [-24, -14, 14, 24]) if (tryStand((i + k + n) % n, side, 36, 12)) { last = i; break; }
    }
    const pts = [];
    for (const g of stands) { g.updateMatrixWorld(true); for (const p of g.userData.flags) pts.push(p.clone().applyMatrix4(g.matrixWorld)); }
    if (pts.length) this.flags(pts);
  }

  screen() { this.bigScreenAt(-PIT.side, 120); }
  bigScreenAt(side, at) {
    const f = this.frame(Math.round(at / this.track.step), side, 6);
    if (!this.free(f.x, f.z, 6)) return;
    const c = document.createElement('canvas'); c.width = 512; c.height = 288;
    const x = c.getContext('2d');
    const grd = x.createLinearGradient(0, 0, 512, 288); grd.addColorStop(0, '#04304a'); grd.addColorStop(1, '#0a6b8f');
    x.fillStyle = grd; x.fillRect(0, 0, 512, 288);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 3; j++) { x.fillStyle = (i + j) % 2 ? '#fff' : '#111'; x.fillRect(i * 32, 236 + j * 17, 32, 17); }
    x.fillStyle = '#ffd21e'; x.font = 'italic 900 64px "Titillium Web", Arial'; x.textAlign = 'center'; x.fillText('BAKU', 256, 110);
    x.fillStyle = '#fff'; x.font = '700 34px "Titillium Web", Arial'; x.fillText('CITY CIRCUIT · LIVE', 256, 165);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.65, roughness: 0.4 }));
    scr.position.set(f.x, f.y + 10.5, f.z); scr.rotation.y = f.ry;
    this.group.add(scr);
    const ox = Math.sin(f.ry) * -0.45, oz = Math.cos(f.ry) * -0.45;
    this.batch.add(new THREE.BoxGeometry(17, 10, 0.8), this.colored, mat4(f.x + ox, f.y + 10.5, f.z + oz, f.ry), 0x23252b);
    this.batch.add(new THREE.BoxGeometry(1.2, 6, 1.2), this.colored, mat4(f.x + ox * 3, f.y + 3, f.z + oz * 3, f.ry), 0x3a3d45);
    this.occupied.push([f.x, f.z, 12]);
  }

  // ------------------------------------------------------------------ città
  buildings() {
    const stoneT = facadeTexture('stone'), glassT = facadeTexture('glass');
    stoneT.anisotropy = glassT.anisotropy = this.aniso;
    const STONE = [0xd9c7a3, 0xcfb88f, 0xe3d5b8, 0xc7ae84, 0xd4c2a0, 0xbfa57c, 0xe6dcc6].map(h => new THREE.Color(h));
    const OLD = [0xc9a978, 0xbf9f6e, 0xd1b487].map(h => new THREE.Color(h));
    const GLASS = [0x7d95aa, 0x8aa3b8, 0x6c8499, 0x9db0bf].map(h => new THREE.Color(h));
    const ROOF = new THREE.Color(0x9c9284), ROOF_OLD = new THREE.Color(0xa88f6c);
    const out = { stone: { p: [], uv: [], c: [] }, glass: { p: [], uv: [], c: [] } };
    const r = rand(99);
    const C = [-536, 364];
    const add = (poly, h, kind, seedC) => {
      // niente edifici sulla pista o sulla corsia box
      for (const [x, z] of poly) if (this.clearance(x, z).d < 0.4 || !this.isLand(x, z)) return;
      let pts = poly.slice();
      let A = 0;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; A += a[0] * b[1] - b[0] * a[1]; }
      if (A > 0) pts.reverse();
      let gmin = Infinity;
      for (const [x, z] of pts) gmin = Math.min(gmin, this.heightAt(x, z));
      const base = gmin - 1.2, top = gmin + h;
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const old = Math.hypot(cx - C[0], cz - C[1]) < 330 && h < 16;
      const glass = kind === 'glass' || h > 42;
      const o = glass ? out.glass : out.stone;
      const col = glass ? GLASS[seedC % GLASS.length] : old ? OLD[seedC % OLD.length] : STONE[seedC % STONE.length];
      const roofC = old ? ROOF_OLD : ROOF;
      let u = 0;
      const vb = -1.2 / 3.4;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const u0 = u / 3.6, u1 = (u + len) / 3.6, vt = (top - base) / 3.4 + vb;
        o.p.push(a[0], base, a[1], b[0], base, b[1], b[0], top, b[1], a[0], base, a[1], b[0], top, b[1], a[0], top, a[1]);
        o.uv.push(u0, vb, u1, vb, u1, vt, u0, vb, u1, vt, u0, vt);
        for (let q = 0; q < 6; q++) o.c.push(col.r, col.g, col.b);
        u += len;
      }
      // tetto piatto
      const tri = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const [i0, i1, i2] of tri) {
        const p0 = pts[i0], p1 = pts[i1], p2 = pts[i2];
        const ny = (p1[1] - p0[1]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[1] - p0[1]);
        const order = ny >= 0 ? [p0, p1, p2] : [p0, p2, p1];
        for (const p of order) { o.p.push(p[0], top, p[1]); o.uv.push(0.1, 0.9); o.c.push(roofC.r, roofC.g, roofC.b); }
      }
      // parapetto e qualche impianto sul tetto degli edifici alti
      if (h > 14 && r() < 0.6) {
        const s = Math.min(6, Math.sqrt(Math.abs(A) / 2) * 0.25);
        this.batch.add(new THREE.BoxGeometry(s, 2.2, s), this.colored, mat4(cx, top + 1.1, cz, r() * 3), 0x8d8a85);
      }
    };
    for (const b of this.blds) {
      if (b.dead) continue;
      add(b.p, b.h, b.k === 'glass' ? 'glass' : null, Math.floor(r() * 1000));
    }
    // quartieri fuori dalla zona mappata (solo riempitivo verso l'orizzonte)
    const db = this.dataBox(), tb = this.terrainBox;
    const ang = -0.35, ca = Math.cos(ang), sa = Math.sin(ang);
    for (let u = -2600; u < 2600; u += 70) for (let v = -2600; v < 2600; v += 55) {
      const bx = this.center.x + u * ca - v * sa, bz = this.center.z + u * sa + v * ca;
      if (bx > db.x0 - 40 && bx < db.x1 + 40 && bz > db.z0 - 40 && bz < db.z1 + 40) continue;
      if (bx < tb.x0 + 120 || bx > tb.x1 - 120 || bz < tb.z0 + 120 || bz > tb.z1 - 120) continue;
      if (!this.isLand(bx, bz) || this.clearance(bx, bz).d < 30) continue;
      const nb = 1 + Math.floor(r() * 3);
      for (let q = 0; q < nb; q++) {
        const w = 14 + r() * 22, d = 12 + r() * 18;
        const ox = (r() - 0.5) * (60 - w), oz = (r() - 0.5) * (45 - d);
        const x = bx + ox * ca - oz * sa, z = bz + ox * sa + oz * ca;
        const hw = w / 2, hd = d / 2;
        const poly = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([px, pz]) => [x + px * ca - pz * sa, z + px * sa + pz * ca]);
        const h = 9 + Math.pow(r(), 2.5) * 55;
        add(poly, h, null, Math.floor(r() * 1000));
      }
    }
    for (const [key, map] of [['stone', stoneT], ['glass', glassT]]) {
      const o = out[key];
      if (!o.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        map, vertexColors: true, roughness: key === 'glass' ? 0.25 : 0.85, metalness: key === 'glass' ? 0.35 : 0.02,
      }));
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
  }

  // strade e vie pedonali
  roads() {
    const pos = [], col = [];
    const ASPH = new THREE.Color(0x4a4d52), PED = new THREE.Color(0xc2b9a7), LINE = new THREE.Color(0xd8d8d0);
    const quad = (a, b, w, y0, y1, c) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l * w / 2, nz = dx / l * w / 2;
      // allunga un po' per chiudere i giunti
      const ex = dx / l * w * 0.2, ez = dz / l * w * 0.2;
      const A = [a[0] - ex, a[1] - ez], B = [b[0] + ex, b[1] + ez];
      pos.push(A[0] + nx, y0, A[1] + nz, B[0] + nx, y1, B[1] + nz, B[0] - nx, y1, B[1] - nz,
        A[0] + nx, y0, A[1] + nz, B[0] - nx, y1, B[1] - nz, A[0] - nx, y0, A[1] - nz);
      for (let q = 0; q < 6; q++) col.push(c.r, c.g, c.b);
    };
    const ok = (x, z) => this.clearance(x, z).d > 0.3 && this.isLand(x, z);
    for (const rd of this.data.roads) {
      const c = rd.ped ? PED : ASPH, lift = rd.ped ? 0.07 : 0.1;
      for (let k = 1; k < rd.p.length; k++) {
        const a = rd.p[k - 1], b = rd.p[k];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nSeg = Math.max(1, Math.ceil(len / 9));
        for (let q = 0; q < nSeg; q++) {
          const f0 = q / nSeg, f1 = (q + 1) / nSeg;
          const p0 = [a[0] + (b[0] - a[0]) * f0, a[1] + (b[1] - a[1]) * f0], p1 = [a[0] + (b[0] - a[0]) * f1, a[1] + (b[1] - a[1]) * f1];
          if (!ok(p0[0], p0[1]) || !ok(p1[0], p1[1])) continue;
          const y0 = this.roadY(p0[0], p0[1], rd.w) + lift, y1 = this.roadY(p1[0], p1[1], rd.w) + lift;
          quad(p0, p1, rd.w, y0, y1, c);
          if (!rd.ped && rd.w >= 10 && q % 2 === 0) quad(p0, [p0[0] + (p1[0] - p0[0]) * 0.5, p0[1] + (p1[1] - p0[1]) * 0.5], 0.18, y0 + 0.01, (y0 + y1) / 2 + 0.01, LINE);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true;
    this.group.add(m);
  }
  // la strada copre i dossi del terreno su tutta la larghezza
  roadY(x, z, w) {
    const h = w / 2;
    return Math.max(this.heightAt(x, z), this.heightAt(x + h, z), this.heightAt(x - h, z), this.heightAt(x, z + h), this.heightAt(x, z - h));
  }

  // ------------------------------------------------------------------ monumenti
  landmarks() {
    const L = this.data.landmarks;
    const stone = new THREE.MeshStandardMaterial({ color: 0xcdb48a, roughness: 0.9 });
    // Torre della Vergine (Qız qalası): 29 m, cilindro con contrafforte verso il mare
    {
      const [x, z] = L.maidenTower, y = this.heightAt(x, z) - 1;
      const g = mergeGeometries([
        new THREE.CylinderGeometry(8.0, 8.6, 30, 28).translate(0, 15, 0),
        new THREE.BoxGeometry(7, 30, 8).translate(8.5, 15, 0),
        new THREE.CylinderGeometry(8.4, 8.4, 1.2, 28).translate(0, 26.5, 0),
      ].map(q => q.index ? q.toNonIndexed() : q));
      const m = new THREE.Mesh(g, stone);
      m.position.set(x, y, z); m.rotation.y = -0.6;
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
      for (let q = 0; q < 16; q++) {
        const a = q / 16 * Math.PI * 2;
        this.batch.add(new THREE.BoxGeometry(1.4, 1.4, 0.9), this.colored, mat4(x + Math.cos(a) * 7.8, y + 30.6, z + Math.sin(a) * 7.8, -a + Math.PI / 2), 0xc4a97e);
      }
      this.occupied.push([x, z, 14]);
    }
    // Flame Towers: tre fiamme di vetro sulla collina
    {
      const [fx, fz] = L.flameTowers;
      const glassT = facadeTexture('glass');
      const mat = new THREE.MeshStandardMaterial({ map: glassT, color: 0x6f8fb3, roughness: 0.12, metalness: 0.75, envMapIntensity: 1.3, emissive: 0x0a1a33, emissiveIntensity: 0.3 });
      const towers = [[0, -38, 182, 0.2], [-36, 22, 165, 2.3], [36, 24, 161, 4.4]];
      for (const [ox, oz, H, rot] of towers) {
        const x = fx + ox, z = fz + oz, y = this.heightAt(x, z) - 2;
        const g = this.flameGeometry(H);
        const m = new THREE.Mesh(g, mat);
        m.position.set(x, y, z); m.rotation.y = rot;
        m.castShadow = true;
        this.group.add(m);
      }
      this.occupied.push([fx, fz, 80]);
    }
    // torre della TV (310 m) sulla collina più lontana
    {
      const [x, z] = L.tvTower, y = this.heightAt(x, z);
      const concrete = 0xe4e1da;
      this.batch.add(new THREE.CylinderGeometry(3.2, 9, 260, 16), this.colored, mat4(x, y + 130, z), concrete);
      this.batch.add(new THREE.CylinderGeometry(15, 11, 14, 20), this.colored, mat4(x, y + 175, z), 0xcfd3d8);
      this.batch.add(new THREE.CylinderGeometry(13, 15, 6, 20), this.colored, mat4(x, y + 185, z), 0x6d7f93);
      this.batch.add(new THREE.CylinderGeometry(0.9, 2.2, 60, 8), this.colored, mat4(x, y + 290, z), 0xd8231f);
    }
    // Crystal Hall e la piazza della Bandiera, dall'altra parte della baia
    {
      const [x, z] = L.crystalHall;
      const isl = new THREE.Shape(this.island.map(([a, b]) => new THREE.Vector2(a, -b)));
      const ig = new THREE.ShapeGeometry(isl); ig.rotateX(-Math.PI / 2);
      const im = new THREE.Mesh(ig, new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.9 }));
      im.position.y = 0.6; im.receiveShadow = true;
      this.group.add(im);
      const hall = new THREE.MeshStandardMaterial({ color: 0x9fc4e6, roughness: 0.1, metalness: 0.6, emissive: 0x1a3a66, emissiveIntensity: 0.35, flatShading: true });
      const g = new THREE.CylinderGeometry(70, 82, 28, 10, 2);
      const P = g.attributes.position;
      for (let i = 0; i < P.count; i++) P.setX(i, P.getX(i) * 1.35);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, hall);
      m.position.set(x, 14.6, z); m.castShadow = true;
      this.group.add(m);
      // asta della bandiera nazionale (162 m) con il bandierone
      const px = x + 330, pz = z - 40;
      this.batch.add(new THREE.CylinderGeometry(0.9, 2.2, 162, 10), this.colored, mat4(px, 81.6, pz), 0xdfe3e8);
      const fg = new THREE.PlaneGeometry(70, 35, 24, 4).translate(35, 0, 0);
      const fm = new THREE.MeshStandardMaterial({ map: azFlagTexture(), side: THREE.DoubleSide, roughness: 0.8 });
      const uT = { value: 0 };
      fm.onBeforeCompile = sh => {
        sh.uniforms.uT = uT;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            transformed.z += sin(position.x * 0.12 - uT * 2.2) * position.x * 0.09;
            transformed.y += sin(position.x * 0.08 - uT * 1.6) * position.x * 0.025;`);
      };
      this.animated.push(t => { uT.value = t; });
      const flag = new THREE.Mesh(fg, fm);
      flag.position.set(px, 143, pz); flag.rotation.y = 0.5;
      this.group.add(flag);
    }
  }

  // fiamma: sezione a goccia che si stringe e si piega verso la punta
  flameGeometry(H) {
    const ringN = 26, segN = 22, pos = [], uv = [], idx = [];
    for (let j = 0; j <= ringN; j++) {
      const t = j / ringN;
      const R = 34 * (1 - Math.pow(t, 1.7) * 0.94) * (1 + 0.12 * Math.sin(t * Math.PI));
      const bend = 22 * t * t;
      for (let i = 0; i <= segN; i++) {
        const a = i / segN * Math.PI * 2;
        // goccia: punta verso +x, dorso arrotondato
        const k = 1 + 0.45 * Math.cos(a) - 0.12 * Math.cos(2 * a);
        pos.push(Math.cos(a) * R * k * 0.62 + bend, t * H, Math.sin(a) * R * 0.55);
        uv.push(i / segN * 26, t * H / 3.6);
      }
    }
    for (let j = 0; j < ringN; j++) for (let i = 0; i < segN; i++) {
      const a = j * (segN + 1) + i, b = a + 1, c = a + segN + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ------------------------------------------------------------------ verde
  cityTrees() {
    const total = this.low ? 1600 : 3800;
    const r = rand(42);
    const leafG = mergeGeometries([
      new THREE.IcosahedronGeometry(2.6, 0).translate(0, 5.6, 0),
      new THREE.IcosahedronGeometry(2.0, 0).translate(1.4, 4.8, 0.5),
      new THREE.IcosahedronGeometry(1.9, 0).translate(-1.2, 5.0, -0.8),
    ]);
    const pineG = mergeGeometries([
      new THREE.IcosahedronGeometry(1, 0).scale(3.2, 1.6, 3.2).translate(0, 8.2, 0),
      new THREE.IcosahedronGeometry(1, 0).scale(2.4, 1.3, 2.4).translate(0.8, 9.6, 0.4),
    ]);
    const cypG = new THREE.IcosahedronGeometry(1, 0).scale(1.2, 5.2, 1.2).translate(0, 6.2, 0);
    const trunkG = new THREE.CylinderGeometry(0.22, 0.32, 7, 5, 1, true).translate(0, 3.5, 0);
    const species = [leafG, pineG, cypG];
    const lists = species.map(() => []), trunks = [];
    const c = new THREE.Color();
    const put = (x, z, sp) => {
      if (lists.reduce((s, l) => s + l.length, 0) >= total) return false;
      if (this.clearance(x, z).d < 1.5 || !this.isLand(x, z) || this.inBuilding(x, z, 1.5)) return false;
      if (this.occupied.some(([ox, oz, rad]) => (ox - x) ** 2 + (oz - z) ** 2 < rad * rad)) return false;
      const y = this.heightAt(x, z);
      const s1 = 0.75 + r() * 0.6;
      const m = mat4(x, y - 0.2, z, r() * 6.28, s1, s1 * (0.85 + r() * 0.3), s1);
      if (sp === 1) c.setHSL(0.3 + r() * 0.04, 0.35 + r() * 0.1, 0.17 + r() * 0.06);
      else if (sp === 2) c.setHSL(0.31 + r() * 0.03, 0.4, 0.16 + r() * 0.05);
      else c.setHSL(0.23 + r() * 0.07, 0.42 + r() * 0.18, 0.25 + r() * 0.1);
      lists[sp].push([m, c.clone()]);
      if (sp !== 2) trunks.push(m);
      return true;
    };
    const pick = () => { const q = r(); return q < 0.55 ? 0 : q < 0.8 ? 1 : 2; };
    for (const [x, z] of this.data.trees) put(x, z, pick());
    for (const row of this.data.treeRows) {
      for (let k = 1; k < row.length; k++) {
        const a = row[k - 1], b = row[k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let q = 0; q < len; q += 9) put(a[0] + (b[0] - a[0]) * q / len, a[1] + (b[1] - a[1]) * q / len, 0);
      }
    }
    // parchi: il lungomare è un unico grande giardino
    const parks = this.data.parks.map(p => ({ p, b: bbox(p) })).map(o => ({ ...o, area: (o.b.x1 - o.b.x0) * (o.b.z1 - o.b.z0) }));
    const sum = parks.reduce((s, o) => s + o.area, 0);
    const budget = total - lists.reduce((s, l) => s + l.length, 0);
    for (const o of parks) {
      const nT = Math.round(budget * o.area / sum * 1.6);
      for (let k = 0, tries = 0; k < nT && tries < nT * 4; tries++) {
        const x = o.b.x0 + r() * (o.b.x1 - o.b.x0), z = o.b.z0 + r() * (o.b.z1 - o.b.z0);
        if (!pip(o.p, x, z)) continue;
        if (put(x, z, pick())) k++;
      }
    }
    const fMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    lists.forEach((arr, sp) => {
      if (!arr.length) return;
      const im = new THREE.InstancedMesh(species[sp], fMat, arr.length);
      arr.forEach(([m, col], q) => { im.setMatrixAt(q, m); im.setColorAt(q, col); });
      im.castShadow = true; im.receiveShadow = true;
      this.group.add(im);
    });
    if (trunks.length) {
      const im = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 1 }), trunks.length);
      trunks.forEach((m, q) => im.setMatrixAt(q, m));
      this.group.add(im);
    }
  }

  // lampioni lungo la pista (i pali alti delle strade di Baku)
  lamps() {
    const S = this.track.samples, n = this.track.count, st = this.track.step;
    const pole = new THREE.CylinderGeometry(0.12, 0.18, 10, 6), arm = new THREE.BoxGeometry(2.6, 0.15, 0.15), head = new THREE.BoxGeometry(0.9, 0.25, 0.45);
    let side = 1;
    for (let i = 0; i < n; i += Math.round(36 / st)) {
      side = -side;
      const f = this.frame(i, side, 1.2);
      if (!this.free(f.x, f.z, 0.8)) continue;
      const s = S[i];
      this.batch.add(pole, this.colored, mat4(f.x, f.y + 5, f.z), 0x3b3f46);
      const ax = -s.nx * side * 1.2, az = -s.nz * side * 1.2;
      this.batch.add(arm, this.colored, mat4(f.x + ax, f.y + 9.9, f.z + az, f.ry + Math.PI / 2), 0x3b3f46);
      this.batch.add(head, this.colored, mat4(f.x + ax * 2, f.y + 9.8, f.z + az * 2, f.ry + Math.PI / 2), 0xe9e4d4);
    }
  }
}
