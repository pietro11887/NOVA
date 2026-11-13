import * as THREE from 'three';
import { SpaScenery } from './scenerySpa.js?v=162';
import { TRACK, bankAt } from './trackData.js?v=162';
import { meadow, triplanar } from './pbr.js?v=b890b6bc';
import { buildTrees } from './trees.js?v=162';
import { ENV } from './scenery.js?v=162';
import { landmarkSkip } from './landmarks.js?v=92cc6020';

// Circuiti veri del calendario costruiti dalla "fabbrica di piste" (tools/build_track.py): stessi dati di Spa
// (tracciato, corsia box, edifici, strade, boschi, prati, acqua e terreno veri) con l'aspetto del posto:
// prati verdi, terra secca, deserto, dune, città o tropici; mare e laghi; palme dove fa caldo.

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const V = new THREE.Vector3(), Q = new THREE.Quaternion(), SC = new THREE.Vector3(), E = new THREE.Euler();
const mat4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => { E.set(0, ry, 0); Q.setFromEuler(E); return new THREE.Matrix4().compose(V.set(x, y, z), Q, SC.set(sx, sy, sz)); };
function pip(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
  }
  return c;
}
function bbox(p) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { x0, x1, z0, z1 }; }

// colori del terreno e degli edifici per clima
const DEFAULT_H = new Set([9, 7, 12, 18, 30, 20, 3.5, 3, 10, 8, 14]);

export const CLIMATES = {
  temperate: { grass: 0x5f7d46, meadow: 0x6e8a4e, forest: 0x3b4a2e, far: 0x3a4733, walls: [0xe9e6df, 0xd9d4ca, 0xc9c3b8, 0xb9b2a6, 0xece8e0, 0x9b9184], roof: 0x5b4a44, trees: 'mixed', palms: 0 },
  dry: { grass: 0x8c8a5a, meadow: 0x7f8a52, forest: 0x4d5a36, far: 0x8a7d62, walls: [0xefe6d6, 0xe3d6bf, 0xd8c7a8, 0xf2ece0, 0xcdbb9a], roof: 0x9a5a3c, trees: 'broad', palms: 0.15 },
  desert: { grass: 0xc9a774, meadow: 0x9a9a5e, forest: 0x6e7a46, far: 0xd2b688, walls: [0xf1e6d2, 0xe8d9bd, 0xdcc9a6, 0xf5efe3, 0xd6c3a0], roof: 0xcfc0a0, trees: 'none', palms: 1 },
  dunes: { grass: 0x9a9a6a, meadow: 0x8a9461, forest: 0x56643e, far: 0xb8ad86, walls: [0xe9e6df, 0xd9d4ca, 0xb94a3a, 0x9b5a44, 0xece8e0], roof: 0x4a3a36, trees: 'pine', palms: 0 },
  tropical: { grass: 0x5d8a3c, meadow: 0x6a9640, forest: 0x2f5a2a, far: 0x3d5a35, walls: [0xf4f1ea, 0xe8efe9, 0xf1e3cf, 0xdfe7ee, 0xfaf6ee], roof: 0x8c8f94, trees: 'broad', palms: 0.6 },
  urban: { grass: 0x667a4c, meadow: 0x6d8650, forest: 0x3d5a32, far: 0x8f949a, walls: [0xeae6dc, 0xdcd6ca, 0xf2efe8, 0xcfc8ba, 0xe6d2b6, 0xbfc5cc], roof: 0x6b6f75, trees: 'broad', palms: 0.3 },
};

export class RealScenery extends SpaScenery {
  constructor(scene, track, renderer, quality) {
    super(scene, track, renderer, quality);
    const meta = TRACK.meta || {};
    this.meta = meta;
    this.cl = CLIMATES[meta.climate] || CLIMATES.temperate;
    this.fanNations = meta.fans || ['ita', 'ned', 'gbr', 'esp', 'ger', 'fra', 'chk'];
    this.bannerTexts = meta.banners || ['GO GO GO!', 'P1!', 'FORZA!', 'VAMOS!', 'ALLEZ!', 'WE ❤ F1'];
    this.brand = { stand: (meta.short || TRACK.name).toUpperCase(), standBg: meta.standBg || ['#15151e', '#e10600'] };
    this.waters = (this.data.water || []).map(p => ({ p, b: bbox(p) }));
    // mare: dove il modello del terreno scende sotto lo zero (fondale) c'è acqua
    const G = this.data.grid;
    this.seaY = -this.data.base;
    this.hasSea = G.h.some(h => h < this.seaY - 1.5);
  }

  // niente alberi, tribune o cartelloni in acqua (mare, laghi, porti)
  free(x, z, r) {
    if (!super.free(x, z, r)) return false;
    if (this.hasSea && this.demAt(x, z) < this.seaY + 0.8 && this.clearance(x, z).d > 20) return false;
    if (this.waters.length && this.inWater(x, z)) return false;
    return true;
  }

  inWater(x, z) { for (const w of this.waters) if (x > w.b.x0 && x < w.b.x1 && z > w.b.z0 && z < w.b.z1 && pip(w.p, x, z)) return true; return false; }

  // quota: nel mare e nei laghi il terreno scende sotto il pelo dell'acqua
  baseHeight(x, z) {
    let h = super.baseHeight(x, z);
    if (this.waters.length && this.clearance(x, z).d > 25 && this.inWater(x, z)) h = Math.min(h, this.waterLevel(x, z) - 2.5);
    return h;
  }
  waterLevel(x, z) {
    if (!this._wl) this._wl = new Map();
    for (const w of this.waters) if (x > w.b.x0 && x < w.b.x1 && z > w.b.z0 && z < w.b.z1 && pip(w.p, x, z)) {
      if (!this._wl.has(w)) {
        // livello del lago: la quota più bassa delle rive (la riva non va mai sott'acqua)
        let m = Infinity; for (const [px, pz] of w.p) m = Math.min(m, super.baseHeight(px, pz));
        this._wl.set(w, Math.max(this.seaY + 0.3, m - 0.6));
      }
      return this._wl.get(w);
    }
    return this.seaY + 0.3;
  }

  build() {
    // i colori del terreno arrivano dal clima del circuito
    this.colorsFor();
    this.tunnelSamples();
    super.build();
    this.tunnels();
    if ((this.meta.id || TRACK.id) === 'nordschleife') this.graffiti();
    this.cornerSigns();
  }
  colorsFor() { /* (i colori si leggono in terrain()) */ }

  // cartelli con il nome delle curve (dalle mappe), a destra prima di ogni curva, rivolti a chi arriva
  cornerSigns() {
    const N = this.data.names || [];
    if (!N.length) return;
    const RH = 64, cv = document.createElement('canvas'); cv.width = 1024; cv.height = Math.min(4096, RH * N.length);
    const g = cv.getContext('2d');
    N.forEach(([, nm], k) => {
      const y = k * RH;
      g.fillStyle = '#f4f4f0'; g.fillRect(0, y, 1024, RH);
      g.fillStyle = '#1a6b3a'; g.fillRect(0, y, 1024, 7); g.fillRect(0, y + RH - 7, 1024, 7);
      g.fillStyle = '#111'; g.font = `900 40px 'Titillium Web', Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(nm.toUpperCase(), 512, y + RH / 2 + 1, 980);
    });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const S = this.track.samples, n = S.length, DL = this.data.points.length * 4;
    const pos = [], uv = [], idx = [], posts = [];
    N.forEach(([so, nm], k) => {
      // campione della pista più vicino al punto dei dati, 40 m prima della curva
      let bi = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { let d = Math.abs(S[i].fo * DL - (so - 40)); d = Math.min(d, DL - d); if (d < bd) { bd = d; bi = i; } }
      const s = S[bi], off = -((s.wallRVis ?? s.wallR) + 1.6);
      const cx = s.x + s.nx * off, cz = s.z + s.nz * off, y0 = s.y + bankAt(s, -99);
      const W = Math.min(7, 2.2 + nm.length * 0.32), H = 0.85, y1 = y0 + 2.1;
      // la faccia guarda indietro (verso chi arriva): larghezza lungo la normale
      const ax = -s.nx, az = -s.nz;                    // da sinistra a destra per chi guarda il cartello
      const base = pos.length / 3, v0 = 1 - (k + 1) * RH / cv.height, v1 = 1 - k * RH / cv.height;
      for (const [u, v, dy] of [[0, v0, 0], [1, v0, 0], [1, v1, H], [0, v1, H]]) {
        pos.push(cx + ax * (u - 0.5) * W - s.tx * 0.05, y1 + dy, cz + az * (u - 0.5) * W - s.tz * 0.05); uv.push(u, v);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      posts.push([cx + ax * W * 0.4, cz + az * W * 0.4, y0], [cx - ax * W * 0.4, cz - az * W * 0.4, y0]);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
    m.castShadow = true; this.group.add(m);
    const pg = new THREE.CylinderGeometry(0.06, 0.06, 3, 6), pm = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 });
    const im = new THREE.InstancedMesh(pg, pm, posts.length), o = new THREE.Object3D();
    posts.forEach(([x, z, y], k) => { o.position.set(x, y + 1.5, z); o.updateMatrix(); im.setMatrixAt(k, o.matrix); });
    this.group.add(im);
  }

  // scritte dei tifosi sull'asfalto (Nordschleife): vernice spray bianca e gialla, consumata dalle gomme
  graffiti() {
    const TXT = ['VOLLGAS', 'GRÜNE HÖLLE', 'GREEN HELL', 'FLAT OUT', 'GO GO GO', 'NOVA', 'FORZA!', 'ALLEZ', 'VAMOS', 'EIFEL',
      '24H', 'NO LIFT', 'SEND IT', 'BRAKE? NO', 'KEEP LEFT', '>>>', '<3', ':)', '#1', 'TOP!', 'PIETRO', 'HOLA', 'DANKE', 'WOW',
      'RING', 'HERO', 'GAS!', 'P1', 'LUCKY 7', 'OLÉ', 'MAX', 'HIER!'];
    const C = 256, COLS = 8, ROWS = 4, cv = document.createElement('canvas');
    cv.width = C * COLS; cv.height = C * ROWS;
    const g = cv.getContext('2d');
    const rnd = rand(20832);
    const cells = [];
    for (let k = 0; k < COLS * ROWS; k++) {
      const cx = (k % COLS) * C, cy = Math.floor(k / COLS) * C, t = TXT[k % TXT.length];
      g.save(); g.translate(cx + C / 2, cy + C / 2); g.rotate((rnd() - 0.5) * 0.25);
      const col = rnd() < 0.62 ? '255,255,255' : rnd() < 0.7 ? '255,214,40' : rnd() < 0.5 ? '255,90,60' : '90,200,255';
      const fs = Math.min(150, (C * 0.92) / Math.max(1.6, t.length * 0.62));
      g.font = `900 ${fs}px Impact, 'Arial Black', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = `rgba(${col},0.9)`; g.shadowBlur = 7;                      // alone dello spray
      g.fillStyle = `rgba(${col},0.95)`; g.fillText(t, 0, 0);
      g.shadowBlur = 0;
      // colature e schizzi
      for (let q = 0; q < 40; q++) { g.globalAlpha = 0.25 + rnd() * 0.5; g.fillRect((rnd() - 0.5) * C * 0.9, (rnd() - 0.5) * C * 0.5, 1 + rnd() * 3, 1 + rnd() * 3); }
      if (rnd() < 0.5) { g.globalAlpha = 0.9; g.lineWidth = 6; g.strokeStyle = `rgba(${col},0.9)`; g.beginPath(); g.moveTo(-C * 0.4, fs * 0.62); g.lineTo(C * 0.4, fs * 0.62); g.stroke(); }
      g.restore();
      // consumo: le gomme tolgono la vernice a strisce
      g.save(); g.globalCompositeOperation = 'destination-out';
      for (let q = 0; q < 90; q++) { g.globalAlpha = 0.15 + rnd() * 0.5; g.fillRect(cx + rnd() * C, cy, 2 + rnd() * 10, C); }
      for (let q = 0; q < 300; q++) { g.globalAlpha = rnd(); g.fillRect(cx + rnd() * C, cy + rnd() * C, 2, 2); }
      g.restore();
      cells.push([cx / cv.width, 1 - (cy + C) / cv.height, C / cv.width, C / cv.height, t.length]);     // (la texture è capovolta in verticale)
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const S = this.track.samples, n = S.length, L = this.track.length, step = L / n;
    const at = (ss, d) => {
      ss = ((ss % L) + L) % L; const f = ss / step, i = Math.floor(f) % n, k = f - Math.floor(f), a = S[i], b = S[(i + 1) % n];
      const nx = a.nx + (b.nx - a.nx) * k, nz = a.nz + (b.nz - a.nz) * k;
      return [a.x + (b.x - a.x) * k + nx * d, a.y + (b.y - a.y) * k + 0.03 + bankAt(a, d), a.z + (b.z - a.z) * k + nz * d];
    };
    const pos = [], uv = [], idx = [];
    let ss = 90;
    while (ss < L - 60) {
      const s0 = S[Math.floor(ss / step) % n], hwL = s0.hwL ?? s0.hw, hwR = s0.hwR ?? s0.hw;
      const [u0, v0, du, dv, len] = cells[Math.floor(rnd() * cells.length)];
      const long = 2.6 + Math.min(4.5, len * 0.55) + rnd() * 1.2, wide = Math.min(hwL + hwR - 1.5, long * 0.7);
      // la scritta si legge andando avanti: la base verso chi arriva, larga di traverso
      const dc = -hwR + 0.8 + wide / 2 + rnd() * Math.max(0, hwL + hwR - 1.6 - wide);
      const segs = 4, base = pos.length / 3;
      for (let a = 0; a <= segs; a++) for (let b = 0; b <= 1; b++) {
        const sa = ss - long / 2 + long * a / segs, d = dc + (b ? 1 : -1) * wide / 2;
        pos.push(...at(sa, d));
        // u lungo la larghezza del testo (destra -> sinistra della pista), v dal basso (chi arriva) verso l'alto
        uv.push(u0 + du * (b ? 0 : 1), v0 + dv * (a / segs));
      }
      for (let a = 0; a < segs; a++) { const q = base + a * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      ss += 28 + rnd() * 70;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.88, roughness: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.renderOrder = 2;
    this.group.add(m);
  }

  // campioni della pista in galleria (servono anche ai palazzi che ci stanno sopra)
  tunnelSamples() {
    const T = this.data.tunnels || [], L = this.data.points.length * 4, S = this.track.samples;
    for (const [a, b] of T) {
      if (b - a < 30) continue;
      this.tunnelSet = this.tunnelSet || new Set();
      S.forEach((s, i) => { const f = s.fo * L; if (f >= a - 2 && f <= b + 2) this.tunnelSet.add(i); });
    }
  }

  // gallerie vere (Monaco: il tunnel sotto l'hotel): pareti, soffitto con le luci e la massa sopra
  tunnels() {
    const T = this.data.tunnels || [];
    if (!T.length) return;
    const L = this.data.points.length * 4, S = this.track.samples, n = S.length;
    const wall = new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.85 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x55524d, roughness: 0.95 });
    const top = new THREE.MeshStandardMaterial({ color: 0xd8cbb4, roughness: 0.9 });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
    if (!this.low) { triplanar(wall, 'concrete', { scale: 2.5, strength: 0.6, normal: 0.9 }); triplanar(top, 'concrete', { scale: 3, strength: 0.5 }); }
    const H = 6.2;
    for (const [a, b] of T) {
      if (b - a < 30) continue;                         // passaggi brevi (ponti pedonali): niente
      const idx = [];
      for (let i = 0; i < n; i++) { const f = S[i].fo * L; if (f >= a - 2 && f <= b + 2) idx.push(i); }
      if (idx.length < 3) continue;
      // in ordine lungo il giro (il tratto può attraversare la fine del giro)
      idx.sort((p, q) => ((S[p].fo * L - a + L) % L) - ((S[q].fo * L - a + L) % L));
      const pos = { w: [], r: [], t: [] };
      const row = (arr, pts) => arr.push(pts);
      for (const i of idx) {
        const s = S[i], wl = (s.wallLVis ?? s.wallL) + 0.4, wr = (s.wallRVis ?? s.wallR) + 0.4;
        const P = (d, y) => [s.x + s.nx * d, s.y + y, s.z + s.nz * d];
        row(pos.w, [P(wl, -0.5), P(wl, H), P(-wr, -0.5), P(-wr, H)]);
        row(pos.r, [P(wl, H), P(-wr, H)]);
        row(pos.t, [P(wl + 3, H + 0.6), P(wl + 3, H + 14), P(-wr - 3, H + 0.6), P(-wr - 3, H + 14), P(wl + 3, H + 14), P(-wr - 3, H + 14)]);
      }
      const strip = (rows, pairs, mat, flip) => {
        const v = [], id = [];
        rows.forEach((r, k) => { r.forEach(p => v.push(...p)); });
        const m = rows[0].length;
        for (let k = 0; k + 1 < rows.length; k++) for (const [u, w] of pairs) {
          const a0 = k * m + u, a1 = k * m + w, b0 = (k + 1) * m + u, b1 = (k + 1) * m + w;
          if (flip) id.push(a0, a1, b0, a1, b1, b0); else id.push(a0, b0, a1, a1, b0, b1);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(id); g.computeVertexNormals();
        const me = new THREE.Mesh(g, mat); me.castShadow = true; me.receiveShadow = true; me.material.side = THREE.DoubleSide; this.group.add(me);
      };
      strip(pos.w, [[0, 1], [2, 3]], wall, false);
      strip(pos.r, [[0, 1]], roof, false);
      strip(pos.t, [[0, 1], [2, 3], [4, 5]], top, false);
      // file di luci sul soffitto
      const lg = new THREE.BoxGeometry(1.2, 0.08, 0.25), lamps = [];
      for (let k = 0; k < idx.length; k += 2) {
        const s = S[idx[k]];
        for (const d of [(s.hw) * 0.55, -(s.hw) * 0.55]) lamps.push([s.x + s.nx * d, s.y + H - 0.1, s.z + s.nz * d, Math.atan2(s.tx, s.tz)]);
      }
      const im = new THREE.InstancedMesh(lg, lamp, lamps.length), o = new THREE.Object3D();
      lamps.forEach(([x, y, z, r], k) => { o.position.set(x, y, z); o.rotation.set(0, r + Math.PI / 2, 0); o.updateMatrix(); im.setMatrixAt(k, o.matrix); });
      this.group.add(im);
      // dentro è buio: il sole non entra (l'ombra la fa il soffitto) e la luce ambiente cala
      this.tunnelDark = this.tunnelDark || new Set();
      for (const i of idx) if (S[i].fo * L >= a + 8 && S[i].fo * L <= b - 8) this.tunnelDark.add(i);
    }
  }

  terrain() {
    // come Spa, con i colori del posto e acqua: si riusa il terreno di Spa e si ricolorano i vertici
    super.terrain();
    const mesh = this.group.children[this.group.children.length - 1];
    if (!mesh || !mesh.geometry || !mesh.geometry.attributes.color) return;
    const pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color, c = new THREE.Color(), r = rand(5);
    const C = { grass: new THREE.Color(this.cl.grass), meadow: new THREE.Color(this.cl.meadow), forest: new THREE.Color(this.cl.forest), far: new THREE.Color(this.cl.far) };
    const sand = new THREE.Color(0xd8c49a), urban = new THREE.Color(0x9a9a96), tb = this.terrainBox;
    const street = !!this.track.street;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const inside = x >= tb.x0 && x <= tb.x1 && z >= tb.z0 && z <= tb.z1;
      if (!inside) c.copy(C.far);
      else if (this.inForest(x, z)) c.copy(C.forest);
      else if (this.inMeadow(x, z)) c.copy(C.meadow);
      else c.copy(street && this.meta.climate !== 'temperate' ? urban : C.grass);
      // vicino al mare: spiaggia
      if (this.hasSea && inside && pos.getY(k) < this.seaY + 1.2) c.lerp(sand, 0.8);
      const n = Math.sin(x * 0.05) * Math.cos(z * 0.04) * 0.5 + 0.5;
      c.offsetHSL((n - 0.5) * 0.03, 0, (r() - 0.5) * 0.05);
      col.setXYZ(k, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    if (this.meta.climate === 'desert' || this.meta.climate === 'dry' || street) {
      // deserto, terra secca e città: niente erba fotografica dappertutto, ghiaia e sabbia fini
      const m2 = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
      if (!this.low) triplanar(m2, 'gravel', { scale: 6, strength: 0.3, normal: 0.7 });
      mesh.material = m2;
    }
    this.water();
  }

  // laghi, porti e mare: piani d'acqua lucidi che riflettono il cielo
  water() {
    const mat = new THREE.MeshStandardMaterial({ color: this.meta.climate === 'tropical' || this.meta.climate === 'desert' ? 0x1f6f86 : 0x2d5d73, roughness: 0.08, metalness: 0.15, envMapIntensity: 1.2 });
    const add = geo => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.userData.noAO = true; this.group.add(m); };
    for (const w of this.waters) {
      if (w.p.length < 3) continue;
      const lvl = this.waterLevel((w.b.x0 + w.b.x1) / 2, (w.b.z0 + w.b.z1) / 2);
      const shape = new THREE.Shape(w.p.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); g.translate(0, lvl, 0);
      add(g);
    }
    if (this.hasSea) {
      const g = new THREE.PlaneGeometry(30000, 30000); g.rotateX(-Math.PI / 2); g.translate((this.terrainBox.x0 + this.terrainBox.x1) / 2, this.seaY + 0.2, (this.terrainBox.z0 + this.terrainBox.z1) / 2);
      add(g);
    }
  }

  // alberi del posto: boschi come a Spa dove ci sono (latifoglie o pini secondo il clima), palme dove fa caldo
  forestTrees() {
    if (this.cl.trees !== 'none') super.forestTrees();
    this.palms();
  }

  palms() {
    const share = this.cl.palms;
    if (!share) return;
    const r = rand(321), tb = this.terrainBox, list = [];
    const max = this.low ? 500 : this.ultra ? 2600 : 1500;
    // alberi singoli mappati (viali, giardini) e una fascia sparsa intorno al circuito
    for (const [x, z] of this.data.trees || []) if (list.length < max && r() < share && this.free(x, z, 2)) list.push([x, z]);
    for (let t = 0; t < 6000 && list.length < max; t++) {
      const x = tb.x0 + r() * (tb.x1 - tb.x0), z = tb.z0 + r() * (tb.z1 - tb.z0);
      const cl = this.clearance(x, z).d;
      if (cl < 14 || cl > 420 || this.inWater(x, z) || !this.free(x, z, 2.5) || r() > share * 0.35) continue;
      if (this.meta.climate === 'desert' && cl > 120 && r() < 0.8) continue;
      list.push([x, z]);
    }
    if (!list.length) return;
    // tronco: cilindro snello leggermente curvo; chioma: foglie a ventaglio che ricadono
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, 1, 7, 6, true); trunk.translate(0, 0.5, 0);
    { const p = trunk.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + 0.35 * y * y); } trunk.computeVertexNormals(); }
    const fr = [];
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2 + (k % 2) * 0.2, L = 3.2 + (k % 3) * 0.4;
      const seg = 6, w = 0.55;
      for (let j = 0; j < seg; j++) {
        const t0 = j / seg, t1 = (j + 1) / seg;
        const P = t => { const d = L * t, y = 0.9 * t - 1.9 * t * t; return [Math.cos(a) * d, y, Math.sin(a) * d]; };
        const p0 = P(t0), p1 = P(t1), wa = w * Math.sin(Math.PI * Math.min(0.95, t0 + 0.08)), wb = w * Math.sin(Math.PI * Math.min(0.95, t1 + 0.08));
        const sx = -Math.sin(a), sz = Math.cos(a);
        fr.push(p0[0] + sx * wa, p0[1], p0[2] + sz * wa, p1[0] + sx * wb, p1[1], p1[2] + sz * wb, p1[0] - sx * wb, p1[1], p1[2] - sz * wb,
          p0[0] + sx * wa, p0[1], p0[2] + sz * wa, p1[0] - sx * wb, p1[1], p1[2] - sz * wb, p0[0] - sx * wa, p0[1], p0[2] - sz * wa);
      }
    }
    const crown = new THREE.BufferGeometry(); crown.setAttribute('position', new THREE.Float32BufferAttribute(fr, 3)); crown.computeVertexNormals();
    const tm = new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.9 });
    const cm = new THREE.MeshStandardMaterial({ color: 0x4f7a2e, roughness: 0.75, side: THREE.DoubleSide });
    const ti = new THREE.InstancedMesh(trunk, tm, list.length), ci = new THREE.InstancedMesh(crown, cm, list.length);
    const col = new THREE.Color();
    list.forEach(([x, z], q) => {
      const h = 7 + r() * 7, ry = r() * 6.28, y = this.heightAt(x, z) - 0.2;
      ti.setMatrixAt(q, mat4(x, y, z, ry, 1, h, 1));
      ci.setMatrixAt(q, mat4(x + Math.cos(-ry) * 0.35 * h * 0.0 + 0.35 * Math.cos(ry), y + h, z + 0.35 * Math.sin(ry), r() * 6.28, 0.9 + r() * 0.3, 0.9 + r() * 0.3, 0.9 + r() * 0.3));
      col.setHSL(0.24 + r() * 0.06, 0.45, 0.28 + r() * 0.1); ci.setColorAt(q, col);
    });
    for (const m of [ti, ci]) { m.castShadow = !this.low; m.receiveShadow = true; m.userData.noAO = true; this.group.add(m); }
    void buildTrees; void meadow; void smooth;
  }

  // case e palazzi veri con i colori del posto: case basse con tetto a falde, palazzi e grattacieli con le file
  // di finestre a ogni piano (vetri scuri che riflettono il cielo), capannoni e tribune con il tetto piatto
  houses() {
    const r = rand(77), cl = this.cl;
    const WALLS = cl.walls.map(h => new THREE.Color(h)), ROOF = new THREE.Color(cl.roof), FLAT = new THREE.Color(0x8d9096);
    const GLASS = [new THREE.Color(0x2c3e52), new THREE.Color(0x34495e), new THREE.Color(0x3d5566), new THREE.Color(0x2b3440)];
    const pos = [], col = [];
    // di notte: finestre accese (luce calda o fredda d'ufficio) sui vetri dei palazzi
    const night = !!ENV.night, wpos = [], wuv = [];
    const win = (a, c, y0, y1, u0) => {
      if (!night) return;
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]), u1 = u0 + L / 2.6 / 8, v0 = y0 / 3.4 / 8, v1 = y1 / 3.4 / 8;
      wpos.push(a[0], y0, a[1], c[0], y0, c[1], c[0], y1, c[1], a[0], y0, a[1], c[0], y1, c[1], a[0], y1, a[1]);
      wuv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    };
    const tri = (a, b, c, cc) => { pos.push(...a, ...b, ...c); for (let q = 0; q < 3; q++) col.push(cc.r, cc.g, cc.b); };
    const quad = (a, c, y0, y1, cc) => { tri([a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], cc); tri([a[0], y0, a[1]], [c[0], y1, c[1]], [a[0], y1, a[1]], cc); };
    let n = 0;
    const maxB = this.low ? 900 : this.ultra ? 4000 : 2600;
    for (const b of this.data.buildings) {
      if (n >= maxB) break;
      const p = b.p;
      if (landmarkSkip(TRACK.id, b, p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length)) continue;
      let ok = true;
      // in città i palazzi stanno a filo del marciapiede: si scartano solo quelli che entrano in pista
      const lim = this.track.street ? 0.6 : 2.5;
      for (let i = 0; i < p.length && ok; i++) {
        const [x, z] = p[i], q = p[(i + 1) % p.length];
        if (this.clearance(x, z).d < lim || this.clearance((x + q[0]) / 2, (z + q[1]) / 2).d < lim) ok = false;
      }
      // palazzi che scavalcano la strada (sopra il tunnel, passaggi coperti): sopra la galleria
      // partono dal suo tetto, altrove non si costruiscono (sarebbero muri in mezzo alla pista)
      let over = null;
      if (ok) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        const S = this.track.samples;
        for (let i = 0; i < S.length && ok; i++) {
          const t = S[i]; if (t.x < x0 - 20 || t.x > x1 + 20 || t.z < z0 - 20 || t.z > z1 + 20) continue;
          for (let d = -(t.wallR + 0.6); d <= t.wallL + 0.6; d += 0.8) {
            const x = t.x + t.nx * d, z = t.z + t.nz * d;
            if (x < x0 || x > x1 || z < z0 || z > z1 || !pip(p, x, z)) continue;
            if (this.tunnelSet && this.tunnelSet.has(i)) over = Math.max(over ?? -Infinity, t.y + 7.2);
            else ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      n++;
      let gmin = Infinity; for (const [x, z] of p) gmin = Math.min(gmin, this.heightAt(x, z));
      if (over != null) gmin = Math.max(gmin, over);
      const stand = b.k === 'grandstand';
      // altezza non segnata nei dati (valori predefiniti della fabbrica di piste): in città si stima dalla
      // grandezza dell'edificio (i palazzi grandi sono più alti), in campagna resta bassa
      let hh = b.h;
      if (DEFAULT_H.has(hh) && (this.track.street || this.meta.climate === 'urban') && !stand) {
        let A2 = 0; for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length]; A2 += a[0] * c[1] - c[0] * a[1]; }
        const area = Math.abs(A2) / 2;
        hh = 8 + r() * 10 + Math.min(1, area / 2500) * (14 + r() * 30);
      }
      const h = Math.min(hh, 180), base = gmin - 1.5, top = gmin + h;
      const tower = h > 16 && !stand;
      const big = stand || ['commercial', 'industrial', 'retail', 'warehouse', 'hangar', 'office', 'hotel', 'apartments', 'stadium', 'public', 'civic'].includes(b.k) || tower;
      const wc = stand ? new THREE.Color(0xd9dde2) : WALLS[Math.floor(r() * WALLS.length)];
      const gc = GLASS[Math.floor(r() * GLASS.length)];
      let A = 0; for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length]; A += a[0] * c[1] - c[0] * a[1]; }
      const pts = A > 0 ? p.slice().reverse() : p;
      const glassy = tower && r() < 0.45;              // grattacielo a specchio
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length];
        const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const u0 = Math.floor(Math.abs(Math.sin(a[0] * 12.9898 + a[1] * 78.233)) * 64) / 8;
        if (glassy) { quad(a, c, base, top, gc); win(a, c, gmin + 3, top - 1, u0); continue; }
        if (big && h > 7 && L > 4 && !stand) {
          // piani: fascia di muro + fila di finestre (3,4 m per piano)
          quad(a, c, base, gmin + 1.2, wc);
          for (let y = gmin + 1.2; y < top - 0.6; y += 3.4) {
            const y1 = Math.min(top, y + 1.1);
            quad(a, c, y, y1, wc);
            if (y1 < top) { quad(a, c, y1, Math.min(top, y + 3.4), gc); win(a, c, y1, Math.min(top, y + 3.4), u0); }
          }
        } else quad(a, c, base, top, wc);
      }
      // tetto: a due falde per le case basse quasi rettangolari, piatto per il resto
      if (!big && h < 12 && pts.length >= 4 && pts.length <= 6) {
        let best = 0, ax = 0, az = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l > best) { best = l; ax = (c[0] - a[0]) / l; az = (c[1] - a[1]) / l; } }
        const cx = pts.reduce((s2, q) => s2 + q[0], 0) / pts.length, cz = pts.reduce((s2, q) => s2 + q[1], 0) / pts.length;
        let wmax = 0; for (const q of pts) wmax = Math.max(wmax, Math.abs((q[0] - cx) * -az + (q[1] - cz) * ax));
        const ridgeH = top + Math.min(4, wmax * 0.6);
        const ridge = q => { const t = (q[0] - cx) * ax + (q[1] - cz) * az; return [cx + ax * t, ridgeH, cz + az * t]; };
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], c = pts[(i + 1) % pts.length], ra = ridge(a), rc = ridge(c);
          tri([a[0], top, a[1]], [c[0], top, c[1]], rc, ROOF); tri([a[0], top, a[1]], rc, ra, ROOF);
        }
      } else {
        let tr;
        try { tr = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []); } catch (e) { tr = []; }
        const rc = stand ? new THREE.Color(0xf2f2f2) : FLAT;
        for (const [i0, i1, i2] of tr) {
          const p0 = pts[i0], p1 = pts[i1], p2 = pts[i2];
          const ny = (p1[1] - p0[1]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[1] - p0[1]);
          const o = ny >= 0 ? [p0, p1, p2] : [p0, p2, p1];
          tri([o[0][0], top, o[0][1]], [o[1][0], top, o[1][1]], [o[2][0], top, o[2][1]], rc);
        }
      }
      const cx = p.reduce((s2, q) => s2 + q[0], 0) / p.length, cz = p.reduce((s2, q) => s2 + q[1], 0) / p.length;
      this.occupied.push([cx, cz, Math.sqrt(Math.abs(A) / 2) * 0.6 + 2]);
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.colored); m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    if (wpos.length) {
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
      wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
      const wm = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ map: windowsTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide, fog: true }));
      this.group.add(wm);
    }
  }
}

// finestre di notte: una tessera con 8×8 finestre, alcune accese (giallo caldo o bianco d'ufficio), le altre buie
let _win = null;
function windowsTex() {
  if (_win) return _win;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), r = rand(311);
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  const cw = N / 8, ch = N / 8;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const v = r();
    if (v > 0.42) continue;
    const warm = r() < 0.65, k = 0.55 + r() * 0.45;
    g.fillStyle = warm ? `rgba(255,${190 + r() * 40 | 0},${110 + r() * 50 | 0},${k})` : `rgba(${200 + r() * 40 | 0},${225 + r() * 25 | 0},255,${k * 0.85})`;
    g.fillRect(i * cw + cw * 0.15, j * ch + ch * 0.2, cw * 0.7, ch * 0.6);
  }
  _win = new THREE.CanvasTexture(c);
  _win.wrapS = _win.wrapT = THREE.RepeatWrapping; _win.colorSpace = THREE.SRGBColorSpace;
  _win.anisotropy = 4;
  return _win;
}
