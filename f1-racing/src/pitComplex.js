import * as THREE from 'three';
import { PIT } from './trackData.js?v=159';
import { TEAMS } from './f1Teams.js?v=159';
import { IS_F1 } from './vehicle.js?v=159';
import { DRIVERS, N_BOXES, GT_PLAYER_BOX } from './race.js?v=159';

// Corsia box come nei Gran Premi veri: un box per vettura (due affiancati per scuderia), con l'interno
// arredato (gomme sotto le termocoperte, carrelli degli attrezzi, monitor dei tempi, banco, ala di scorta,
// cric, luci al soffitto), insegna e striscione della squadra, piazzola dipinta in corsia, postazioni della
// squadra sul muretto, hospitality al piano di sopra e paddock dietro con motorhome, camion e bandiere.

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
const hex = c => (typeof c === 'string' ? parseInt(c.slice(1), 16) : c);
const css = c => '#' + hex(c).toString(16).padStart(6, '0');
const lum = c => { const v = hex(c); return 0.3 * ((v >> 16) & 255) + 0.59 * ((v >> 8) & 255) + 0.11 * (v & 255); };

// squadre dei 22 box
function boxTeams() {
  const out = [];
  if (IS_F1) {
    for (const t of TEAMS) for (let k = 0; k < 2; k++) out.push({ name: t.name.toUpperCase(), c1: hex(t.colors[0]), c2: hex(t.colors[1]), c3: hex(t.colors[2] || t.colors[1]), driver: t.drivers[k], key: t.id });
  } else {
    for (let k = 0; k < N_BOXES; k++) {
      if (k === GT_PLAYER_BOX) { out.push({ name: 'NOVA RACING', c1: 0xff8a1c, c2: 0x27c3ea, c3: 0x16171b, driver: 'TU', key: 'nova' }); continue; }
      if (k > GT_PLAYER_BOX) { out.push({ name: 'NOVA RACING', c1: 0x2a7bff, c2: 0xffffff, c3: 0x16171b, driver: 'OSPITE', key: 'nova2' }); continue; }
      const D = DRIVERS[k % DRIVERS.length];
      out.push({ name: D[0] + ' RACING', c1: D[1], c2: D[2], c3: 0x16171b, driver: D[0], key: 'gt' + k });
    }
  }
  while (out.length < N_BOXES) out.push({ name: 'FIA', c1: 0x1b3a8a, c2: 0xffffff, c3: 0x111111, driver: '', key: 'fia' });
  return out;
}

const texCache = new Map();
function canvasTex(key, w, h, draw, aniso = 8) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  texCache.set(key, t); return t;
}
const FONT = '"Titillium Web", Arial';
// insegna sopra l'apertura del box: nome della squadra
function signTex(T) {
  return canvasTex('sign' + T.key, 1024, 160, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, css(T.c1)); gr.addColorStop(0.7, css(T.c1)); gr.addColorStop(1, css(T.c3));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = css(T.c2); g.fillRect(0, h - 16, w, 16);
    g.save(); g.transform(1, 0, -0.25, 1, 0, 0); g.fillStyle = css(T.c2); g.fillRect(w * 0.82, 0, 40, h); g.fillRect(w * 0.82 + 60, 0, 18, h); g.restore();
    g.fillStyle = lum(T.c1) > 150 ? '#111' : '#fff';
    g.font = `italic 900 ${T.name.length > 16 ? 70 : 92}px ${FONT}`; g.textBaseline = 'middle';
    g.fillText(T.name, 40, h / 2 - 4);
  });
}
// striscione sulla parete di fondo
function wallTex(T) {
  return canvasTex('wall' + T.key, 1024, 320, (g, w, h) => {
    g.fillStyle = css(T.c1); g.fillRect(0, 0, w, h);
    for (let k = 0; k < 7; k++) { g.fillStyle = k % 2 ? css(T.c2) : css(T.c3); g.globalAlpha = 0.85; g.beginPath(); g.moveTo(w * 0.55 + k * 46, 0); g.lineTo(w * 0.55 + k * 46 + 30, 0); g.lineTo(w * 0.45 + k * 46 + 30, h); g.lineTo(w * 0.45 + k * 46, h); g.fill(); }
    g.globalAlpha = 1;
    g.fillStyle = lum(T.c1) > 150 ? '#111' : '#fff';
    g.font = `italic 900 ${T.name.length > 16 ? 82 : 110}px ${FONT}`; g.textBaseline = 'middle';
    g.fillText(T.name, 50, h * 0.42);
    g.font = `700 40px ${FONT}`; g.fillStyle = lum(T.c1) > 150 ? '#333' : 'rgba(255,255,255,0.8)';
    g.fillText(IS_F1 ? 'FORMULA 1 TEAM' : 'GT3 · NOVA SERIES', 54, h * 0.72);
  });
}
// targhetta sulla piazzola: nome del pilota
function plateTex(T) {
  return canvasTex('plate' + T.key + T.driver, 512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.font = `italic 900 84px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(T.driver || '', w / 2, h / 2 + 4);
  });
}
// schermo dei tempi (monitor nel box e sul muretto)
function screenTex(T) {
  return canvasTex('scr' + T.key, 256, 160, (g, w, h) => {
    g.fillStyle = '#05070c'; g.fillRect(0, 0, w, h);
    g.fillStyle = css(T.c1); g.fillRect(0, 0, w, 18);
    g.font = `700 12px ${FONT}`; g.fillStyle = '#fff'; g.fillText('LIVE TIMING', 8, 13);
    const r = mulberry(T.key.length * 97 + 5);
    for (let k = 0; k < 8; k++) {
      const y = 30 + k * 16;
      g.fillStyle = k % 2 ? '#0d121c' : '#111827'; g.fillRect(4, y - 11, w - 8, 15);
      g.fillStyle = ['#c48bff', '#2ee06f', '#ffd21e', '#ffffff'][Math.floor(r() * 4)];
      g.font = `600 11px monospace`; g.fillText(`${k + 1}  ${(80 + r() * 4).toFixed(3)}  S${1 + (k % 3)}`, 10, y);
      g.fillStyle = '#2a6fe0'; g.fillRect(170, y - 8, 20 + r() * 60, 8);
    }
  });
}

// geometrie unite per colore (pochissimi oggetti da disegnare)
class Merge {
  constructor() { this.list = new Map(); this.m = new THREE.Matrix4(); }
  add(geo, mat, x, y, z, ry, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, color = 0xffffff) {
    E.set(rx, ry, rz, 'YXZ'); Q.setFromEuler(E);
    this.m.compose(V.set(x, y, z), Q, S1.set(sx, sy, sz));
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(this.m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (!this.list.has(mat)) this.list.set(mat, []);
    this.list.get(mat).push(g);
  }
  flush(parent, mergeFn, shadows = true) {
    for (const [mat, arr] of this.list) {
      const mesh = new THREE.Mesh(mergeFn(arr), mat);
      mesh.castShadow = shadows && !mat.emissive?.getHex?.(); mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.list.clear();
  }
}

/**
 * sc: lo scenario (group, occupied, heightAt, free/inBuilding/clearBuildings/isLand)
 * opts: { mergeFn, low, paddock: true }
 */
export function buildPitComplex(sc, track, opts) {
  const pts = track.pit && track.pit.pts;
  if (!pts || !pts.length) return;
  const sd = PIT.side, gap = PIT.boxGap, hw = PIT.halfW, low = !!opts.low;
  const at = ss => { let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].ss < ss) lo = m; else hi = m; } const a = pts[lo], b = pts[hi], k = Math.max(0, Math.min(1, (ss - a.ss) / ((b.ss - a.ss) || 1)));
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, nx: a.nx, nz: a.nz, tx: a.tx, tz: a.tz }; };
  const teams = boxTeams();
  const M = new Merge();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });
  const glossy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1 });
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.8 });
  const glow = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.4 });
  const B = new THREE.BoxGeometry(1, 1, 1), CY = new THREE.CylinderGeometry(1, 1, 1, low ? 10 : 18), PL = new THREE.PlaneGeometry(1, 1);
  const TOR = new THREE.TorusGeometry(0.36, 0.07, 6, low ? 12 : 20);
  const D = 15, H = 6.2, W = gap - 0.35;
  const g = new THREE.Group();
  const texMeshes = [];       // insegne e striscioni (una mesh per squadra/texture)
  const plane = (tex, w, h, x, y, z, ry, rx = 0, transparent = false, emissive = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, transparent, depthWrite: !transparent,
      emissive: emissive ? 0xffffff : 0x000000, emissiveMap: emissive ? tex : null, emissiveIntensity: emissive }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); m.receiveShadow = !emissive;
    if (transparent) { m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; m.renderOrder = 1; }
    texMeshes.push(m);
  };
  // niente costruzioni sopra la pista (Monaco: la corsia box corre a pochi metri dal tracciato)
  const onTrack = (x, z, r) => sc.clearance && sc.clearance(x, z).d < r;
  const r = mulberry(31337);
  for (let k = -1; k <= N_BOXES; k++) {
    const T = k >= 0 && k < N_BOXES ? teams[k] : null;
    const p = at(PIT.boxFrom + k * gap);
    const ry = Math.atan2(-p.nx * sd, -p.nz * sd);           // +Z locale verso la corsia
    const fx = Math.sin(ry), fz = Math.cos(ry), lx = Math.cos(ry), lz = -Math.sin(ry);
    const ox = p.x + p.nx * sd * (hw + 0.9), oz = p.z + p.nz * sd * (hw + 0.9), y = p.y;
    // punto locale (x lungo la corsia, z verso la corsia) -> mondo
    const P = (x, z) => [ox + lx * x + fx * z, oz + lz * x + fz * z];
    const add = (geo, m, x, yy, z, sx, sy, sz, color, rx = 0, rz = 0, dry = 0) => { const [wx, wz] = P(x, z); M.add(geo, m, wx, y + yy, wz, ry + dry, sx, sy, sz, rx, rz, color); };
    if ([P(-W / 2, -D), P(W / 2, -D), P(0, -D / 2), P(-W / 2, -D / 2), P(W / 2, -D / 2)].some(([x, z]) => onTrack(x, z, 0.5))) continue;
    if (sc.clearBuildings) sc.clearBuildings(...P(0, -D / 2), Math.max(gap, D) * 0.75);
    const c1 = T ? T.c1 : 0x9aa1ab, c2 = T ? T.c2 : 0xffffff, c3 = T ? T.c3 : 0x333333;
    // ---- guscio del box
    add(B, glossy, 0, 0.06, -D / 2, W, 0.12, D, 0xd5d8de);                               // pavimento in resina
    add(B, mat, 0, 0.025, 0.6, gap + 0.05, 0.05, 1.3, 0x55595f);                       // asfalto tra corsia e box
    add(B, mat, 0, 0.13, -1.6, W * 0.92, 0.02, 0.45, c1);                                // fascia colorata a terra
    add(B, mat, 0, 0.13, -D + 2.2, W * 0.92, 0.02, 0.3, c1);
    for (const s of [-1, 1]) {
      add(B, mat, s * W / 2, H / 2, -D / 2, 0.3, H, D, 0xeef0f3);                         // pareti divisorie
      add(B, mat, s * (W / 2 - 0.17), 1.7, -D / 2 - 1, 0.04, 2.4, D * 0.72, c1);           // pannelli con i colori
      add(B, mat, s * (W / 2 - 0.17), 3.05, -D / 2 - 1, 0.045, 0.18, D * 0.72, c2);
      add(B, mat, s * (W / 2 + 0.1), H / 2, 0.15, 0.55, H, 0.5, 0x2a2d35);               // montanti della facciata
    }
    add(B, mat, 0, H / 2, -D, W, H, 0.3, 0xeef0f3);                                        // parete di fondo
    add(B, mat, 0, H + 0.15, -D / 2, W + 0.6, 0.3, D + 0.6, 0x2a2d35);                     // soffitto
    add(B, mat, 0, H - 0.7, 0.2, W, 1.3, 0.45, c1);                                        // fascia sopra l'apertura
    if (!low) for (const z of [-3, -7, -11]) add(B, glow, 0, H - 0.18, z, W * 0.78, 0.06, 0.32, 0xfff6e6);   // luci al soffitto
    // ---- hospitality al piano di sopra: vetrate, terrazza, bandiere
    add(B, mat, 0, H + 2.1, -D / 2 - 1.5, W + 0.6, 3.6, D - 3, 0xe9ecf1);
    add(B, glass, 0, H + 2.2, -1.2, W + 0.2, 2.6, 0.08, 0x3a4c63);
    add(B, mat, 0, H + 0.95, 0.1, W + 0.6, 0.12, 2.6, 0xd9dce2);                          // terrazza
    add(B, glass, 0, H + 1.5, 1.35, W + 0.4, 1.0, 0.05, 0x8fb3cc);                         // parapetto in vetro
    add(B, mat, 0, H + 4.0, -D / 2 - 1, W + 0.8, 0.25, D - 1, 0x2a2d35);
    if (T && k % 2 === 0) {
      add(CY, mat, -W / 2 + 0.5, H + 6, -D + 2, 0.05, 4.2, 0.05, 0xcfd3da);
      add(B, mat, -W / 2 + 1.3, H + 7.5, -D + 2, 1.6, 1.0, 0.03, c1);
    }
    if (!T) continue;
    // ---- insegne e striscioni (due box per squadra: insegna larga sopra i due)
    const [sx, sz] = P(0, 0.44);
    plane(signTex(T), W * 0.94, W * 0.94 * 160 / 1024 * 1.4, sx, y + H - 0.7, sz, ry);
    const [bx, bz] = P(0, -D + 0.17);
    plane(wallTex(T), W * 0.86, W * 0.86 * 320 / 1024, bx, y + 3.4, bz, ry);
    // ---- arredo del box
    // gomme sotto le termocoperte (pile da 4) e qualche treno pronto con i colori della mescola
    const blanket = lum(c1) < 60 ? 0x2b2f3a : c1;
    for (let s = 0; s < (low ? 2 : 4); s++) {
      const x = -W / 2 + 1.0 + s * 0.85, z = -D + 1.3;
      add(CY, mat, x, 0.75, z, 0.38, 1.3, 0.38, blanket);
      add(CY, mat, x, 1.41, z, 0.3, 0.03, 0.3, 0x16171b);
      add(B, mat, x, 1.1, z + 0.39, 0.25, 0.08, 0.01, c2);
    }
    for (let s = 0; s < (low ? 2 : 4); s++) {
      const x = W / 2 - 1.0 - (s % 2) * 0.85, z = -D + 1.4 + Math.floor(s / 2) * 0.9;
      add(CY, mat, x, 0.36, z, 0.34, 0.6, 0.34, 0x101114);
      add(TOR, mat, x, 0.66, z, 0.82, 0.82, 0.82, [0xe8322b, 0xf5c518, 0xf2f2f2, 0xe8322b][s], Math.PI / 2);
    }
    // carrelli degli attrezzi lungo la parete
    for (let s = 0; s < (low ? 1 : 3); s++) {
      const z = -D + 4 + s * 1.9;
      add(B, glossy, -W / 2 + 0.55, 0.55, z, 0.75, 1.0, 1.6, c3 === 0x16171b ? 0x23262e : c3);
      add(B, mat, -W / 2 + 0.94, 0.55, z, 0.02, 0.85, 1.4, c1);
      for (let d = 0; d < 4; d++) add(B, mat, -W / 2 + 0.95, 0.25 + d * 0.2, z, 0.025, 0.02, 1.2, 0x9aa0ad);
    }
    // banco da lavoro e ala anteriore di scorta sul cavalletto
    add(B, mat, W / 2 - 0.6, 0.9, -D + 5.4, 0.9, 0.08, 2.6, 0x8a9099);
    add(B, mat, W / 2 - 0.6, 0.45, -D + 5.4, 0.8, 0.9, 2.4, 0x3a3d45);
    if (!low) {
      add(B, mat, W / 2 - 0.5, 1.45, -D + 8.5, 0.08, 0.08, 1.9, 0x2a2d35);
      add(B, glossy, W / 2 - 0.5, 1.5, -D + 8.5, 0.5, 0.06, 1.9, IS_F1 ? c1 : c3, 0.35);
      add(B, glossy, W / 2 - 0.5, 1.6, -D + 8.5, 0.3, 0.05, 1.9, c2, 0.35);
      for (const zz of [-0.8, 0.8]) add(CY, mat, W / 2 - 0.5, 0.75, -D + 8.5 + zz, 0.03, 1.5, 0.03, 0x555a63);
      // cric anteriore e posteriore appoggiati
      add(B, mat, -W / 2 + 0.7, 0.12, -D + 10.5, 0.25, 0.12, 1.6, c1);
      add(B, mat, -W / 2 + 1.2, 0.12, -D + 10.5, 0.25, 0.12, 1.4, c2);
    }
    // monitor dei tempi su un'asta
    add(CY, mat, 0, 1.0, -D + 1.2, 0.04, 2.0, 0.04, 0x2a2d35);
    add(B, mat, 0, 1.95, -D + 1.24, 1.9, 0.66, 0.06, 0x111111);
    const [mx, mz] = P(0, -D + 1.28);
    plane(screenTex(T), 1.8, 0.58, mx, y + 1.95, mz, ry, 0, false, 0.9);
    // ---- piazzola dipinta in corsia: riquadro con i colori, linea di arresto e nome del pilota
    const cz = hw + 0.9 - 2.4;          // centro della vettura ferma rispetto alla facciata
    const stopZ = -cz;
    for (const s of [-1, 1]) add(B, mat, s * 3.4, 0.035, stopZ, 0.18, 0.02, 2.8, c1);
    for (const s of [-1, 1]) add(B, mat, 0, 0.035, stopZ + s * 1.4, 6.8, 0.02, 0.18, c1);
    add(B, mat, 2.6, 0.04, stopZ, 0.12, 0.022, 2.0, 0xf2f2f2);               // dove si ferma il muso
    const [px, pz] = P(-1.2, stopZ);
    plane(plateTex(T), 3.2, 0.8, px, y + 0.045, pz, ry + Math.PI / 2, -Math.PI / 2, true);
    // ---- postazione della squadra sul muretto box (una ogni due box), se c'è spazio tra corsia e pista
    if (k % 2 === 0 && !low) {
      const wz = (hw + 0.9) + hw + 1.05;       // dal fronte box: attraverso la corsia fino al muretto
      const [wx, wwz] = P(gap / 2, wz);
      const pr = {}; track.project(wx, wwz, undefined, pr);
      const S0 = track.samples[pr.i];
      if (S0 && Math.abs(pr.d) > S0.hw + 2.6) {
        add(B, mat, gap / 2, 0.55, wz, 5.6, 1.1, 1.5, 0x2a2d35);                // bancone
        add(B, mat, gap / 2, 1.14, wz, 5.8, 0.08, 1.7, c1);
        for (let q = 0; q < 4; q++) {
          add(B, mat, gap / 2 - 2.1 + q * 1.4, 1.5, wz + 0.4, 1.0, 0.6, 0.05, 0x111111);
          const [qx, qz] = P(gap / 2 - 2.1 + q * 1.4, wz + 0.43);
          plane(screenTex(T), 0.95, 0.55, qx, y + 1.5, qz, ry, 0, false, 0.8);
        }
        for (const s of [-2.6, 2.6]) add(CY, mat, gap / 2 + s, 1.6, wz - 0.6, 0.05, 3.2, 0.05, 0x8a9099);
        add(B, mat, gap / 2, 3.25, wz - 0.1, 6.2, 0.12, 2.4, c1);               // tettoia
        add(B, mat, gap / 2, 3.33, wz - 0.1, 6.2, 0.05, 2.2, c2);
        for (let q = 0; q < 4; q++) add(B, mat, gap / 2 - 2.1 + q * 1.4, 0.7, wz - 0.5, 0.45, 0.6, 0.45, 0x16171b);   // sgabelli
      }
    }
    if (sc.occupied) sc.occupied.push([...P(0, -D / 2), Math.max(gap, D) * 0.7]);
  }
  // ---- direzione gara (torre di controllo) prima del primo box
  if (opts.tower !== false) {
    const p = at(PIT.boxFrom - 2.6 * gap);
    const ry = Math.atan2(-p.nx * sd, -p.nz * sd), fx = Math.sin(ry), fz = Math.cos(ry);
    const cx = p.x + p.nx * sd * (hw + 0.9 + 7), cz = p.z + p.nz * sd * (hw + 0.9 + 7);
    if (!(sc.inBuilding && sc.inBuilding(cx, cz, 6)) && !onTrack(cx, cz, gap * 0.9 + 2)) {
      M.add(B, mat, cx, p.y + 7, cz, ry, gap * 1.6, 14, 14, 0, 0, 0xf2f3f5);
      M.add(B, glass, cx + fx * 7.05, p.y + 10, cz + fz * 7.05, ry, gap * 1.5, 3.2, 0.1, 0, 0, 0x2e3e52);
      M.add(B, mat, cx, p.y + 14.2, cz, ry, gap * 1.7, 0.5, 15, 0, 0, 0xd8231f);
      const t = canvasTex('racecontrol', 1024, 160, (gg, w, h) => { gg.fillStyle = '#16171b'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#fff'; gg.font = `italic 900 96px ${FONT}`; gg.textBaseline = 'middle'; gg.fillText('RACE CONTROL', 40, h / 2); });
      plane(t, gap * 1.3, gap * 1.3 * 0.16, cx + fx * 7.12, p.y + 6.6, cz + fz * 7.12, ry);
      if (sc.occupied) sc.occupied.push([cx, cz, gap * 1.2]);
    }
  }
  // ---- paddock dietro i box: motorhome delle squadre, camion, bandiere
  if (opts.paddock !== false) {
    const done = new Set();
    for (let k = 0; k < N_BOXES; k += 2) {
      const T = teams[k];
      if (done.has(T.key) && IS_F1) continue; done.add(T.key);
      const p = at(PIT.boxFrom + (k + 0.5) * gap);
      const ry = Math.atan2(-p.nx * sd, -p.nz * sd), fx = Math.sin(ry), fz = Math.cos(ry), lx = Math.cos(ry), lz = -Math.sin(ry);
      // centro del motorhome: dietro il box, oltre la strada del paddock
      const base = hw + 0.9 + D + 9;
      const cx = p.x + p.nx * sd * base, cz = p.z + p.nz * sd * base;
      const yy = sc.heightAt ? sc.heightAt(cx, cz) : p.y;
      if (sc.isLand && !sc.isLand(cx, cz)) continue;
      if (sc.inBuilding && sc.inBuilding(cx, cz, 6)) continue;
      if (onTrack(cx, cz, gap + 6)) continue;
      const P = (x, z) => [cx + lx * x - fx * z, cz + lz * x - fz * z];
      const add = (geo, m, x, h, z, sx, sy, sz, color, dry = 0) => { const [wx, wz] = P(x, z); M.add(geo, m, wx, yy + h, wz, ry + dry, sx, sy, sz, 0, 0, color); };
      const L = gap * 2 - 3;
      add(B, mat, 0, 2.2, 0, L, 4.4, 9, 0xf3f4f6);                       // motorhome a due piani
      add(B, glass, 0, 5.6, 0.4, L - 1, 2.4, 8.2, 0x2e3e52);
      add(B, mat, 0, 1.2, -4.53, L, 1.1, 0.05, T.c1);                    // fascia con i colori
      add(B, mat, 0, 4.45, -4.53, L, 0.25, 0.05, T.c2);
      add(B, mat, 0, 6.95, 0, L + 0.4, 0.3, 9.4, T.c1);
      const [sx2, sz2] = P(0, -4.6);
      plane(signTex(T), L * 0.6, L * 0.6 * 0.22, sx2, yy + 2.9, sz2, ry);   // rivolta verso i box
      // camion della squadra di fianco
      if (!low) {
        add(B, glossy, L / 2 + 2.5, 2.1, 1.5, 2.6, 3.8, 13, T.c1);
        add(B, glossy, L / 2 + 2.5, 1.7, -6.3, 2.5, 3.0, 2.6, T.c3 === 0x16171b ? 0xf2f2f2 : T.c3);
        for (const zz of [-6.3, -1.5, 4.5]) for (const s of [-1, 1]) add(CY, mat, L / 2 + 2.5 + s * 1.2, 0.5, zz, 0.5, 0.35, 0.5, 0x111111, 0, Math.PI / 2);
      }
      // bandiere della squadra
      for (const s of [-1, 1]) {
        add(CY, mat, s * (L / 2 + 0.6), 3.5, -5.6, 0.06, 7, 0.06, 0xd8dbe0);
        add(B, mat, s * (L / 2 + 0.6) + 0.75, 6.4, -5.6, 1.4, 0.9, 0.03, s < 0 ? T.c1 : T.c2);
      }
      if (sc.occupied) sc.occupied.push([cx, cz, L * 0.75]);
    }
  }
  M.flush(g, opts.mergeFn);
  for (const m of texMeshes) g.add(m);
  sc.group.add(g);
}
