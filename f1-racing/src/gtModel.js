import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEOM, CAR_SCALE } from './carModel.js';
import { CAR_CLASS } from './vehicle.js';

// Porsche 992 GT3 R — modello di MattDoesBlender (Sketchfab), licenza CC BY-NC-SA 4.0.
// Red Bull RB22 2026 — modello di Dave Love (Sketchfab), licenza CC BY 4.0.
// Ottimizzati per il gioco (abitacolo semplificato, poligoni ridotti, texture compresse).
// Qui viene convertito nel formato delle vetture del gioco: muso verso +X, destra verso +Z,
// terreno a y = -(cgHeight + 0.02); ruote separate che girano e sterzano; splitter e
// alettone staccabili negli urti; vernice ricolorabile per squadra.

const WHEEL_IDX = { LF: 0, RF: 1, LR: 2, RR: 3 };
// posizione del casco nella RB22 (coordinate del gioco, prima della scala)
const HELMET = { x: 0.36, y: 0.38 };   // ordine del gioco: AS, AD, PS, PD

let templates = null;

// copia di riserva su jsDelivr (versione bloccata: sempre disponibile e senza cache vecchie)
const CDN = 'https://cdn.jsdelivr.net/gh/pietro11887/NOVA@3fd4fbd/f1-racing/assets/';

// prova più fonti: file locale, copia incorporata in un modulo .js (pagine che non servono .glb), CDN
async function fetchGLB(name) {
  const tries = [
    async () => { const r = await fetch('assets/' + name); if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); },
    async () => { const m = await import(new URL('../assets/' + name + '.js', import.meta.url).href); const bin = atob(m.default); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; },
    async () => { const r = await fetch(CDN + name); if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); },
  ];
  let last;
  for (const t of tries) { try { return await t(); } catch (e) { last = e; } }
  throw last;
}

// Le immagini dentro il .glb vengono decodificate direttamente (createImageBitmap), senza
// indirizzi "blob:" temporanei: alcune pagine (es. l'anteprima su Claude) li bloccano e le
// vetture resterebbero bianche.
function inlineImages(parser) {
  return {
    name: 'NOVA_inline_images',
    beforeRoot() {
      const original = parser.loadImageSource.bind(parser);
      parser.loadImageSource = (sourceIndex, loader) => {
        const def = parser.json.images[sourceIndex];
        if (def.bufferView === undefined) return original(sourceIndex, loader);
        if (parser.sourceCache[sourceIndex]) return parser.sourceCache[sourceIndex].then(t => t.clone());
        const promise = parser.getDependency('bufferView', def.bufferView).then(buf => {
          const blob = new Blob([buf], { type: def.mimeType });
          const viaImage = () => new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = fr.result; };
            fr.onerror = rej;
            fr.readAsDataURL(blob);
          });
          const dec = typeof createImageBitmap === 'function' ? createImageBitmap(blob).catch(viaImage) : viaImage();
          return dec.then(img => { const t = new THREE.Texture(img); t.needsUpdate = true; t.userData.mimeType = def.mimeType; return t; });
        });
        parser.sourceCache[sourceIndex] = promise;
        return promise;
      };
      return null;
    },
  };
}

// file dei modelli per categoria: [dettagliato (giocatore), leggero (bot)]
const FILES = { gt: ['gt3r_hi.glb', 'gt3r_mid.glb'], f1: ['f1_rb22_hi.glb', 'f1_rb22_mid.glb'] };

export function loadGT() {
  const loader = new GLTFLoader();
  loader.register(inlineImages);
  const get = f => fetchGLB(f).then(buf => new Promise((res, rej) => loader.parse(buf, '', res, rej)));
  // in Formula 1 serve comunque una GT leggera: la safety car
  const jobs = [get(FILES[CAR_CLASS][0]), get(FILES[CAR_CLASS][1])];
  if (CAR_CLASS !== 'gt') jobs.push(get(FILES.gt[1]));
  return Promise.all(jobs).then(([hi, mid, gtMid]) => {
    templates = { hi: prepare(hi.scene, false, CAR_CLASS), mid: prepare(mid.scene, true, CAR_CLASS) };
    templates.gtMid = gtMid ? prepare(gtMid.scene, true, 'gt') : templates.mid;
    return templates;
  });
}
export const gtReady = () => !!templates;

// materiali "da gioco": vernice lucida, vetri scuri opachi (l'abitacolo non c'è), luci che brillano
function tuneMaterial(src) {
  const n = src.name || '';
  const m = new THREE.MeshStandardMaterial({ name: n, map: src.map || null, color: src.color.clone(), transparent: src.transparent, opacity: src.opacity, alphaTest: src.alphaTest, side: src.side });
  m.roughness = 0.6; m.metalness = 0.1;
  if (n === 'PAINT') { m.roughness = 0.32; m.metalness = 0.25; m.color.set(0xffffff); }
  // Formula 1 (RB22)
  else if (n === 'chasis' || n === 'chassis2') { m.roughness = 0.3; m.metalness = 0.2; m.color.set(0xffffff); m.userData.livery = true; }
  else if (n === 'decal') { m.transparent = false; m.alphaTest = 0.45; m.roughness = 0.35; m.depthWrite = true; m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
  else if (n === 'carbon') { m.roughness = 0.45; m.metalness = 0.35; m.color.set(0x9a9a9a); }
  else if (n === 'glass') { m.map = null; m.transparent = true; m.opacity = 0.35; m.color.set(0x1a2230); m.roughness = 0.05; }
  else if (n === 'redbull_wheel_hub') { m.roughness = 0.35; m.metalness = 0.6; }
  else if (/^TIRE_/.test(n)) { m.roughness = 0.88; m.metalness = 0; }
  else if (n === 'mirrors') { m.roughness = 0.05; m.metalness = 0.9; m.color.set(0x9aa4b0); }
  else if (/^EXT_Windows/.test(n)) { m.map = null; m.transparent = false; m.color.set(0x0c1118); m.roughness = 0.06; m.metalness = 0.65; }
  else if (/^EXT_RIM/.test(n)) { m.roughness = 0.3; m.metalness = 0.75; m.color.set(0x9aa0a8); }
  else if (/^MI_Tyre/.test(n)) { m.roughness = 0.9; m.metalness = 0; }
  else if (/Mechanics|CHASSIS|RADIATOR/.test(n)) { m.color.set(0x24262b); m.roughness = 0.7; }
  else if (/EXALTS/.test(n)) { m.color.set(0x8a8d93); m.roughness = 0.35; m.metalness = 0.8; }
  else if (/CALIPER/.test(n)) { m.color.set(0xd8231f); m.roughness = 0.4; m.metalness = 0.3; }
  else if (/Emissive_Light_Rear/.test(n)) { m.emissive = new THREE.Color(0xff2a1a); m.emissiveMap = m.map; m.emissiveIntensity = 0.5; }
  else if (/Emissive_Light_Front/.test(n)) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = m.map; m.emissiveIntensity = 0.35; }
  else if (/Glass_Emissive/.test(n)) { m.roughness = 0.05; m.metalness = 0.4; }
  else if (/Disc/.test(n)) { m.metalness = 0.6; m.roughness = 0.45; }
  if (m.map) m.map.anisotropy = 4;
  return m;
}

// classifica un triangolo (coordinate del gioco) nelle parti staccabili
function partOf(cx, cy, cz, kind) {
  if (kind === 'f1') {
    // RB22: ala posteriore sopra il diffusore, ala anteriore bassa davanti alle ruote
    if (cx < -1.72 && cy > 0.2) return 'rw';
    if (cx > 2.02 && cy < 0.12) {
      if (Math.abs(cz) > 0.78) return cz < 0 ? 'fwLe' : 'fwRe';
      return cz < 0 ? 'fwL' : 'fwR';
    }
    return 'body';
  }
  if (cx < -1.98 && cy > 0.42) return 'rw';                       // alettone (sopra il cofano posteriore)
  if (cx > 2.08 && cy < -0.24) {                                   // splitter anteriore
    if (Math.abs(cz) > 0.72) return cz < 0 ? 'fwLe' : 'fwRe';
    return cz < 0 ? 'fwL' : 'fwR';
  }
  return 'body';
}

function prepare(scene, lowPoly, kind = 'gt') {
  scene.updateMatrixWorld(true);
  // modello: Y in alto, muso verso +Z, sinistra verso +X  ->  gioco: muso +X, destra +Z
  const T = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  T.premultiply(new THREE.Matrix4().makeTranslation(0, -(GEOM.cgHeight + 0.02) - 0.02, 0));
  const mats = new Map();
  const matFor = src => { if (!mats.has(src)) mats.set(src, tuneMaterial(src)); return mats.get(src); };
  const parts = { body: [], rw: [], fwL: [], fwR: [], fwLe: [], fwRe: [] };
  const wheels = [[], [], [], []];
  const tmp = new THREE.Vector3();
  scene.traverse(o => {
    if (!o.isMesh) return;
    let g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(T, o.matrixWorld));
    if (lowPoly) g = toCreasedNormals(g, 0.6);
    const mat = matFor(o.material);
    const w = (o.name || '').match(/WHEEL_(LF|RF|LR|RR)_(RIM|TIRE|DISC)/) || (o.parent && (o.parent.name || '').match(/WHEEL_(LF|RF|LR|RR)_(RIM|TIRE|DISC)/));
    if (w) { wheels[WHEEL_IDX[w[1]]].push({ g, mat, kind: w[2] }); return; }
    // carrozzeria: i triangoli vanno nelle parti staccabili in base alla posizione
    if (g.index) g = g.toNonIndexed();
    const P = g.attributes.position, n = P.count;
    const buckets = {};
    for (let v = 0; v < n; v += 3) {
      tmp.set(0, 0, 0);
      for (let q = 0; q < 3; q++) tmp.x += P.getX(v + q) / 3, tmp.y += P.getY(v + q) / 3, tmp.z += P.getZ(v + q) / 3;
      const k = kind === 'f1' ? partOf(tmp.x, tmp.y, tmp.z, 'f1') : mat.name === 'PAINT' || /Details|Mechanics|CHASSIS/.test(mat.name) ? partOf(tmp.x, tmp.y, tmp.z) : 'body';
      (buckets[k] || (buckets[k] = [])).push(v);
    }
    for (const [k, list] of Object.entries(buckets)) {
      const sub = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(g.attributes)) {
        const isz = attr.itemSize, arr = new attr.array.constructor(list.length * 3 * isz);
        list.forEach((v, t) => { for (let q = 0; q < 3; q++) for (let c = 0; c < isz; c++) arr[(t * 3 + q) * isz + c] = attr.array[(v + q) * isz + c]; });
        sub.setAttribute(name, new THREE.BufferAttribute(arr, isz, attr.normalized));
      }
      parts[k].push({ g: sub, mat });
    }
  });
  // centri delle ruote dalle gomme
  const wheelInfo = wheels.map(list => {
    const tyre = list.find(p => p.kind === 'TIRE') || list[0];
    tyre.g.computeBoundingBox();
    const c = tyre.g.boundingBox.getCenter(new THREE.Vector3()), s = tyre.g.boundingBox.getSize(new THREE.Vector3());
    return { center: c, radius: s.y / 2, width: s.z, list: list.map(p => ({ g: p.g.clone().translate(-c.x, -c.y, -c.z), mat: p.mat, kind: p.kind })) };
  });
  return { parts, wheelInfo, mats, kind };
}

// Livree alternative: la grafica originale viene ridipinta. Le parti gialle prendono il colore
// della squadra (mantenendo ombre e motivi), loghi e scritte restano; le vetture con colore
// scuro hanno le parti nere nel colore secondario.
const liveryCache = new Map();
function liveryVariant(base, primary, accent, size = 512) {
  const key = primary + '_' + accent;
  if (liveryCache.has(key)) return liveryCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(base.image, 0, 0, size, size);
  const img = g.getImageData(0, 0, size, size), d = img.data;
  const P = new THREE.Color(primary), A = new THREE.Color(accent);
  const toS = v => Math.round(Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2) * 255);
  const pr = Math.pow(P.r, 1), lumP = 0.3 * P.r + 0.59 * P.g + 0.11 * P.b;
  const darkTeam = lumP < 0.06;
  void pr;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, ch = mx - mn;
    const s = ch === 0 ? 0 : ch / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (ch > 0) h = mx === r ? ((gg - b) / ch) % 6 : mx === gg ? (b - r) / ch + 2 : (r - gg) / ch + 4;
    h *= 60; if (h < 0) h += 360;
    // giallo/oro della livrea -> colore squadra (la luminosità relativa conserva i motivi)
    const yellow = h > 28 && h < 68 && s > 0.35 && l > 0.12;
    if (yellow) {
      const k = Math.min(1.25, l / 0.5);
      d[i] = toS(P.r * k); d[i + 1] = toS(P.g * k); d[i + 2] = toS(P.b * k);
    } else if (darkTeam && l < 0.13 && s < 0.35) {
      const k = 0.55 + l * 3;
      d[i] = toS(A.r * k); d[i + 1] = toS(A.g * k); d[i + 2] = toS(A.b * k);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.channel = base.channel; t.anisotropy = 4;
  liveryCache.set(key, t);
  return t;
}

// Livrea F1: il nero/blu notte della carrozzeria prende il colore della squadra, l'arancio dei
// cerchi il colore secondario, il rosso diventa bianco; scritte e loghi bianchi restano.
function liveryF1(base, primary, accent, size = 1024) {
  const key = 'f1_' + base.uuid + '_' + primary + '_' + accent;
  if (liveryCache.has(key)) return liveryCache.get(key);
  const sz = Math.min(size, base.image.width || size);
  const c = document.createElement('canvas'); c.width = c.height = sz;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(base.image, 0, 0, sz, sz);
  const img = g.getImageData(0, 0, sz, sz), d = img.data;
  const P = new THREE.Color(primary), A = new THREE.Color(accent);
  const toS = v => Math.round(Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2) * 255);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, ch = mx - mn;
    const sat = ch === 0 ? 0 : ch / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (ch > 0) h = mx === r ? ((gg - b) / ch) % 6 : mx === gg ? (b - r) / ch + 2 : (r - gg) / ch + 4;
    h *= 60; if (h < 0) h += 360;
    if (l < 0.16 && (sat < 0.5 || mx < 0.12)) {                    // base scura -> colore squadra
      const k = 0.78 + l * 1.6;
      d[i] = toS(P.r * k); d[i + 1] = toS(P.g * k); d[i + 2] = toS(P.b * k);
    } else if (sat > 0.45 && h > 18 && h < 50 && l > 0.2) {       // arancio -> secondario
      const k = Math.min(1.2, l / 0.48);
      d[i] = toS(A.r * k); d[i + 1] = toS(A.g * k); d[i + 2] = toS(A.b * k);
    } else if (sat > 0.45 && (h < 18 || h > 335) && l > 0.15) {    // rosso (toro, filetti) -> bianco
      const k = Math.min(1, 0.55 + l);
      d[i] = d[i + 1] = d[i + 2] = toS(0.92 * k);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = base.wrapS; t.wrapT = base.wrapT; t.channel = base.channel; t.anisotropy = 4;
  liveryCache.set(key, t);
  return t;
}

// crea una vettura con la stessa interfaccia di createCar() (carModel.js)
export function createGT(opts = {}) {
  const tpl = opts.safety ? templates.gtMid : opts.lod === 'mid' ? templates.mid : templates.hi;
  const ghost = !!opts.ghost;
  const ghostMat = ghost ? new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.28, depthWrite: false }) : null;
  const paint = tpl.mats.get([...tpl.mats.keys()].find(k => tpl.mats.get(k).name === 'PAINT'));
  const myPaint = paint ? paint.clone() : null;
  // livrea: quella originale (Manthey #91 / Red Bull) oppure ridipinta con i colori della squadra
  if (myPaint && opts.primary != null && myPaint.map) myPaint.map = liveryVariant(myPaint.map, opts.primary, opts.accent ?? 0xffffff);
  const swap = new Map();
  if (tpl.kind === 'f1' && opts.primary != null) {
    for (const m of tpl.mats.values()) if (m.userData.livery && m.map) {
      const c = m.clone(); c.map = liveryF1(m.map, opts.primary, opts.accent ?? 0xffffff, opts.lod === 'mid' ? 512 : 1024); swap.set(m, c);
    }
  }
  const stripe = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.6 });
  const M = m => ghost ? ghostMat : (m === paint ? myPaint : swap.get(m) || m);
  const root = new THREE.Group(), body = new THREE.Group();
  body.rotation.order = 'YZX';
  body.scale.setScalar(CAR_SCALE);
  root.add(body);
  const mk = (g, m, parent) => { const mesh = new THREE.Mesh(g, M(m)); mesh.castShadow = !ghost; mesh.receiveShadow = !ghost; parent.add(mesh); return mesh; };
  for (const p of tpl.parts.body) mk(p.g, p.mat, body);
  // splitter (due metà con le alette laterali) e alettone: gruppi staccabili
  const frontWing = new THREE.Group(); body.add(frontWing);
  const fwHalves = ['L', 'R'].map(sd => {
    const half = new THREE.Group();
    for (const p of tpl.parts['fw' + sd]) mk(p.g, p.mat, half);
    const end = new THREE.Group();
    for (const p of tpl.parts['fw' + sd + 'e']) mk(p.g, p.mat, end);
    half.add(end);
    half.userData.endplate = end;
    frontWing.add(half);
    return half;
  });
  const rearWing = new THREE.Group(); body.add(rearWing);
  for (const p of tpl.parts.rw) mk(p.g, p.mat, rearWing);
  rearWing.userData.flap = null;
  // ruote: perno (sterzo, campanatura) -> rotazione
  const wheels = tpl.wheelInfo.map((wi, i) => {
    const pivot = new THREE.Group(), spin = new THREE.Group();
    pivot.position.copy(wi.center);
    pivot.add(spin);
    for (const p of wi.list) mk(p.g, p.mat, spin);
    // fascia colorata della mescola sul fianco esterno
    const side = i % 2 === 0 ? -1 : 1;
    if (!ghost) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(wi.radius * 0.84, 0.012, 4, 32), stripe);
      band.position.z = side * (wi.width / 2 + 0.003);
      spin.add(band);
    }
    body.add(pivot);
    return { pivot, spin, baseY: wi.center.y, x: wi.center.x, side, arms: [], angle: 0 };
  });
  // Formula 1: il pilota (casco nell'abitacolo aperto)
  const helmet = [];
  if (tpl.kind === 'f1') {
    const hm = ghost ? ghostMat : new THREE.MeshStandardMaterial({ color: opts.primary != null ? opts.accent ?? 0xffffff : 0x1b2a5a, roughness: 0.25, metalness: 0.2 });
    const visor = ghost ? ghostMat : new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0.8 });
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 14), hm);
    h.scale.set(1.12, 1, 1); h.position.set(HELMET.x, HELMET.y, 0); h.castShadow = !ghost;
    const v = new THREE.Mesh(new THREE.SphereGeometry(0.137, 20, 8, Math.PI - 0.9, 1.8, 1.15, 0.5), visor);
    v.rotation.y = 0; h.add(v);
    body.add(h); helmet.push(h);
  }
  if (ghost) root.traverse(o => { o.renderOrder = 2; });
  return { root, body, wheels, frontWing, fwHalves, rearWing, helmet, materials: { paint: myPaint, stripe }, scale: CAR_SCALE, gt: true };
}
