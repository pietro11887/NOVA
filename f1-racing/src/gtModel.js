import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEOM, CAR_SCALE } from './carModel.js';
import { CAR_CLASS } from './vehicle.js';
import { liveryTexture } from './f1Teams.js';

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
const CDN = 'https://cdn.jsdelivr.net/gh/pietro11887/NOVA@3623a4e/f1-racing/assets/';

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

// Garage: si possono vedere anche le vetture dell'altra categoria (caricate solo quando servono)
const extraJobs = {};
export function loadKind(kind) {
  if (kind === CAR_CLASS) return Promise.resolve(templates);
  if (!extraJobs[kind]) {
    const loader = new GLTFLoader();
    loader.register(inlineImages);
    extraJobs[kind] = fetchGLB(FILES[kind][0]).then(buf => new Promise((res, rej) => loader.parse(buf, '', res, rej)))
      .then(g => { templates['x_' + kind] = prepare(g.scene, false, kind); return templates; });
  }
  return extraJobs[kind];
}

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
  const tpl = opts.kind && opts.kind !== CAR_CLASS ? templates['x_' + opts.kind] : opts.safety ? templates.gtMid : opts.lod === 'mid' ? templates.mid : templates.hi;
  const ghost = !!opts.ghost;
  const ghostMat = ghost ? new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.28, depthWrite: false }) : null;
  const paint = tpl.mats.get([...tpl.mats.keys()].find(k => tpl.mats.get(k).name === 'PAINT'));
  const myPaint = paint ? paint.clone() : null;
  // livrea: quella originale (Manthey #91 / Red Bull) oppure ridipinta con i colori della squadra
  if (myPaint && opts.primary != null && myPaint.map) myPaint.map = liveryVariant(myPaint.map, opts.primary, opts.accent ?? 0xffffff);
  const swap = new Map();
  if (tpl.kind === 'f1' && opts.team && !opts.team.original) {
    // scuderia vera: carrozzeria e ali ridipinte, niente adesivi Red Bull
    const size = opts.lod === 'mid' ? 512 : 1024;
    for (const m of tpl.mats.values()) {
      if ((m.name === 'chasis' || m.name === 'chassis2') && m.map) {
        const tex = liveryTexture(opts.team, m.name, size, m.map);
        if (tex) { const c = m.clone(); c.map = tex; c.roughness = opts.team.gloss ? 0.22 : 0.42; swap.set(m, c); }
      } else if (m.name === 'decal') { const c = m.clone(); c.visible = false; swap.set(m, c); }
    }
  } else if (tpl.kind === 'f1' && opts.primary != null && !(opts.team && opts.team.original)) {
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
    const hm = ghost ? ghostMat : new THREE.MeshStandardMaterial({ color: opts.team ? opts.team.colors[1] : opts.primary != null ? opts.accent ?? 0xffffff : 0x1b2a5a, roughness: 0.25, metalness: 0.2 });
    const visor = ghost ? ghostMat : new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0.8 });
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 14), hm);
    h.scale.set(1.12, 1, 1); h.position.set(HELMET.x, HELMET.y, 0); h.castShadow = !ghost;
    const v = new THREE.Mesh(new THREE.SphereGeometry(0.137, 20, 8, Math.PI - 0.9, 1.8, 1.15, 0.5), visor);
    v.rotation.y = 0; h.add(v);
    body.add(h); helmet.push(h);
  }
  if (ghost) root.traverse(o => { o.renderOrder = 2; });
  return { root, body, wheels, frontWing, fwHalves, rearWing, helmet, materials: { paint: myPaint, stripe }, scale: CAR_SCALE, gt: true, kind: tpl.kind };
}

// ---------------------------------------------------------------- abitacolo GT (visuale interna)
// Caricato solo quando serve: volante che gira, led dei giri, display con marcia, velocità e tempi.
// GT: abitacolo chiuso della 992 GT3 R; F1: volante, led e cinture della RB22
const INT_FILES = { gt: 'gt3r_int.glb', f1: 'f1_rb22_int.glb' };
const interiorTpl = {}, interiorJob = {};
export function loadInterior(kind = CAR_CLASS) {
  if (!interiorJob[kind]) {
    const loader = new GLTFLoader();
    loader.register(inlineImages);
    interiorJob[kind] = fetchGLB(INT_FILES[kind]).then(buf => new Promise((res, rej) => loader.parse(buf, '', res, rej)))
      .then(g => { interiorTpl[kind] = prepareInterior(g.scene, kind); return interiorTpl[kind]; })
      .catch(e => { interiorJob[kind] = null; throw e; });
  }
  return interiorJob[kind];
}

function interiorMaterial(src) {
  const n = src.name || '';
  const m = new THREE.MeshStandardMaterial({ name: n, map: src.map || null, color: src.color.clone(), transparent: src.transparent, opacity: src.opacity, alphaTest: src.alphaTest, side: THREE.DoubleSide });
  m.roughness = 0.75; m.metalness = 0.05;
  if (src.normalMap) m.normalMap = src.normalMap;
  // nel modello originale quasi tutti i materiali dell'abitacolo non hanno texture (grigio chiaro):
  // colori da GT vera, carbonio, alcantara e plastiche nere, roll-bar e metalli
  const C = (hex, rough, metal) => { if (!m.map) m.color.set(hex); m.roughness = rough; m.metalness = metal; };
  if (/Windshield|Windows|Glass/.test(n)) { m.map = null; m.transparent = true; m.opacity = 0.08; m.color.set(0x9fb4c8); m.roughness = 0.05; m.metalness = 0.3; m.depthWrite = false; }
  else if (/Steer_Carbon|Carbon|CARBON/.test(n)) C(0x1d1f23, 0.38, 0.3);
  else if (/Occlusion/.test(n)) C(0x2a2c31, 0.6, 0.15);
  else if (/ALCANTARA/.test(n)) C(0x101113, 0.95, 0);
  else if (/FOAM/.test(n)) C(0x16171a, 0.95, 0);
  else if (/METAL_PARTS/.test(n)) C(0x7a7e86, 0.4, 0.65);
  else if (/WELDING/.test(n)) C(0xb9bcc2, 0.45, 0.5);
  else if (/BORRACHAS/.test(n)) C(0x0e0e10, 0.85, 0);
  else if (/DASH_PANEL|PLASTIC|STEER_PLASTIC/.test(n)) C(0x131417, 0.55, 0.05);
  else if (/MANG_AR/.test(n)) C(0x8f1c1c, 0.6, 0.1);
  else if (/MANGUEIRAS/.test(n)) C(0x22335c, 0.5, 0.2);
  else if (/CABLES/.test(n)) C(0x1b1b1d, 0.6, 0);
  else if (/ELECTRONICS|Racelogic|SAS/.test(n)) C(0x1c1d21, 0.5, 0.15);
  else if (/BELT|NET/.test(n)) { m.roughness = 0.95; m.metalness = 0; }
  else if (!m.map) C(0x2a2c30, 0.6, 0.1);
  if (m.map) { m.map.anisotropy = 8; }
  return m;
}

function prepareInterior(scene, kind) {
  scene.updateMatrixWorld(true);
  const T = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  T.premultiply(new THREE.Matrix4().makeTranslation(0, -(GEOM.cgHeight + 0.02) - 0.02, 0));
  const mats = new Map();
  const matFor = src => { if (!mats.has(src)) mats.set(src, interiorMaterial(src)); return mats.get(src); };
  const out = { rest: [], steer: [], leds: [], ledRows: [], display: null, hide: [], kind };
  scene.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(T, o.matrixWorld));
    const nm = o.name || (o.parent && o.parent.name) || '';
    const item = { g, mat: matFor(o.material), name: nm };
    if (kind === 'f1') {
      // il deflettore davanti all'abitacolo (texture con trasparenza) da dentro sembrava una fila di punte
      if (/^generics/.test(o.material.name || '')) return;
      // F1: tutto quello che sta sul volante gira con lui
      if (/^SLCD/.test(nm)) out.display = item;
      else if (/^LEDK_\d+/.test(nm)) out.leds[+nm.match(/\d+/)[0]] = item;
      else if (/^LEDC_/.test(nm)) out.ledRows.push(item);
      else if (/^(STEER|TAG)/.test(nm)) out.steer.push(item);
      else out.rest.push(item);
      return;
    }
    if (/^STEER/.test(nm)) out.steer.push(item);
    else if (/^LEDRPM_\d/.test(nm)) out.leds[+nm.match(/\d/)[0]] = item;
    else if (/^DISPLAY$/.test(nm)) out.display = item;
    else if (/^(SPEED|GEAR|LAPTIME|DELTA|LASTLAP|LAPCONT|BRAKEBIAS|FUEL|WATERTEMP|ABS|TLF|TRF|TLR|TRR|FAKE\d)/.test(nm)) out.hide.push(item);
    else out.rest.push(item);
  });
  // volante: centro e asse del piantone (direzione con meno estensione dei vertici = normale del volante)
  const pts = [];
  const rim = out.steer.filter(s => s.mat.name === 'INT_Steer' || /handles|carbon/.test(s.mat.name));
  for (const s of (rim.length ? rim : out.steer)) { const P = s.g.attributes.position; for (let i = 0; i < P.count; i++) pts.push(P.getX(i), P.getY(i), P.getZ(i)); }
  const N = pts.length / 3, c = new THREE.Vector3();
  for (let i = 0; i < N; i++) c.x += pts[3 * i] / N, c.y += pts[3 * i + 1] / N, c.z += pts[3 * i + 2] / N;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < N; i++) { const d = [pts[3 * i] - c.x, pts[3 * i + 1] - c.y, pts[3 * i + 2] - c.z]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b] / N; }
  // autovettore del più piccolo autovalore: iterazione inversa
  const m3 = new THREE.Matrix3().set(C[0][0] + 1e-9, C[0][1], C[0][2], C[1][0], C[1][1] + 1e-9, C[1][2], C[2][0], C[2][1], C[2][2] + 1e-9).invert();
  let ax = new THREE.Vector3(1, 0.3, 0);
  for (let k = 0; k < 30; k++) ax.applyMatrix3(m3).normalize();
  if (ax.x < 0) ax.negate();                       // verso il muso
  // il piantone va in avanti e un po' in basso: se il calcolo non torna si usa quello tipico
  if (ax.x < 0.7) ax.set(kind === 'f1' ? 0.99 : 0.94, kind === 'f1' ? -0.1 : -0.34, 0).normalize();
  out.steerCenter = c; out.steerAxis = ax;
  // occhi del pilota: GT 55 cm dietro e 24 cm sopra il volante; F1 nel casco, 32 cm dietro e 9 cm sopra
  out.eye = c.clone().add(kind === "f1" ? new THREE.Vector3(-0.4, 0.11, 0) : new THREE.Vector3(-0.55, 0.24, 0));
  return out;
}

// aggiunge l'abitacolo a una GT già creata (vettura del giocatore)
export function attachInterior(model) {
  const kind = model.kind || CAR_CLASS;
  if (!interiorTpl[kind] || model.cockpit) return model.cockpit;
  const tpl = interiorTpl[kind], group = new THREE.Group();
  const F1 = kind === 'f1';
  const mk = (it, parent) => { const mesh = new THREE.Mesh(it.g, it.mat); mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  for (const it of tpl.rest) mk(it, group);
  // volante su un perno lungo il piantone
  const pivot = new THREE.Group(); pivot.position.copy(tpl.steerCenter);
  const spin = new THREE.Group(); pivot.add(spin);
  for (const it of tpl.steer) { const m = mk({ ...it, g: it.g.clone().translate(-tpl.steerCenter.x, -tpl.steerCenter.y, -tpl.steerCenter.z) }, spin); void m; }
  group.add(pivot);
  // led dei giri (F1: sul volante, girano con lui)
  const onWheel = g => F1 ? g.clone().translate(-tpl.steerCenter.x, -tpl.steerCenter.y, -tpl.steerCenter.z) : g;
  const leds = tpl.leds.filter(Boolean).map(it => { const mat = new THREE.MeshBasicMaterial({ color: 0x222222 }); const mesh = new THREE.Mesh(onWheel(it.g), mat); (F1 ? spin : group).add(mesh); return mat; });
  const ledRows = tpl.ledRows.map(it => { const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a }); spin.add(new THREE.Mesh(onWheel(it.g), mat)); return mat; });
  // display del cruscotto: disegnato su una tela
  let display = null;
  if (tpl.display) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = F1 ? 296 : 256;
    const tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if (F1) {
      // display del volante: u 0,045-0,955 (da sinistra), v 0,234-0,766 (dall'alto)
      tex.repeat.set(1 / 0.91, 1 / 0.532); tex.offset.set(-0.045 / 0.91, -0.234 / 0.532);
    } else {
      // le coordinate del quadro vanno da v = 1,12 a 1,89: la tela le riempie tutte
      tex.repeat.set(1, -1 / 0.77); tex.offset.set(0, 1.89 / 0.77);   // il quadro ha le coordinate capovolte
    }
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    (F1 ? spin : group).add(new THREE.Mesh(onWheel(tpl.display.g), mat));
    display = { cv, ctx: cv.getContext('2d'), tex, f1: F1 };
  }
  // ---- specchietti: superfici su cui il gioco disegna la vista posteriore (una sola ripresa
  // larga dietro la vettura: il centrale ne usa la parte centrale, i laterali i bordi, specchiati)
  const yS = -(GEOM.cgHeight + 0.02) - 0.02;
  const mirrors = [];
  const mirrorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.6 });
  const MIR = F1 ? [] : [
    // centro (x, y, z), larghezza, altezza, zona della ripresa [u0, u1] (già specchiata)
    { c: [0.232, 1.05 + yS, 0.052], w: 0.31, h: 0.05, u: [0.75, 0.25], frame: true },
    { c: [0.292, 0.875 + yS, -0.92], w: 0.15, h: 0.1, u: [1.0, 0.64] },
    { c: [0.278, 0.875 + yS, 0.917], w: 0.13, h: 0.1, u: [0.36, 0.0] },
  ];
  if (F1) {
    // F1: gli specchietti sono quelli del modello (materiale "mirrors"), a destra e a sinistra
    const pts = { L: [], R: [] };
    model.body.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.body.matrixWorld).invert(), v = new THREE.Vector3();
    model.body.traverse(o => {
      if (!o.isMesh || !o.material || o.material.name !== 'mirrors') return;
      const P = o.geometry.attributes.position, M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); (v.z < 0 ? pts.L : pts.R).push(v.clone()); }
    });
    for (const [side, list] of Object.entries(pts)) {
      if (!list.length) continue;
      const b = new THREE.Box3().setFromPoints(list), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
      MIR.push({ c: [c.x, c.y, c.z], w: Math.max(0.08, Math.hypot(sz.z, sz.x) * 0.95), h: Math.max(0.04, sz.y * 0.9), u: side === 'L' ? [1.0, 0.62] : [0.38, 0.0] });
    }
  }
  for (const M of MIR) {
    const g = new THREE.PlaneGeometry(M.w, M.h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, M.u[0] + (M.u[1] - M.u[0]) * uv.getX(i));
    const mesh = new THREE.Mesh(g, mirrorMat);
    mesh.position.set(...M.c);
    const d = tpl.eye.clone().sub(mesh.position).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    mesh.position.addScaledVector(d, 0.006);
    group.add(mesh); mirrors.push(mesh);
    if (M.frame) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(M.w + 0.025, M.h + 0.02, 0.02), frameMat);
      f.quaternion.copy(mesh.quaternion); f.position.copy(mesh.position).addScaledVector(d, -0.012);
      group.add(f);
    }
  }
  // ---- braccia e guanti del pilota: le mani stanno sul volante (girano con lui), le braccia
  // vanno dalle spalle alle mani (gomito calcolato ogni volta)
  const suit = new THREE.MeshStandardMaterial({ color: 0x1e2330, roughness: 0.85 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7 });
  const cuff = new THREE.MeshStandardMaterial({ color: 0xc8201e, roughness: 0.6 });
  // larghezza del volante lungo il lato (asse Z del gioco)
  let half = 0.13;
  { let mx = 0; for (const it of tpl.steer) { const P = it.g.attributes.position; for (let i = 0; i < P.count; i++) mx = Math.max(mx, Math.abs(P.getZ(i) - tpl.steerCenter.z)); } if (mx > 0.08 && mx < 0.25) half = mx - 0.025; }
  const ax = tpl.steerAxis.clone(), lat = new THREE.Vector3(0, 0, 1), upW = new THREE.Vector3().crossVectors(ax, lat).normalize().negate();
  if (upW.y < 0) upW.negate();
  const gloveW = new THREE.MeshStandardMaterial({ color: 0xe9e9ea, roughness: 0.8 });
  const hands = [-1, 1].map(sd => {
    const h = new THREE.Group();
    // dorso della mano (bianco) e dita chiuse sull'impugnatura
    const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.045, 4, 10), gloveW);
    back.scale.set(1.25, 1, 0.75); back.position.set(-0.012, 0, 0); h.add(back);
    for (let f = 0; f < 4; f++) {
      const fin = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.022, 3, 6), glove);
      fin.position.set(0.012, 0.03 - f * 0.019, sd * 0.012); fin.rotation.z = Math.PI / 2; h.add(fin);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.026, 3, 6), glove);
    thumb.position.set(0.004, 0.035, -sd * 0.018); thumb.rotation.x = sd * 0.7; h.add(thumb);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.03, 12), cuff);
    c.position.set(-0.01, -0.045, 0); h.add(c);
    // posizione sul volante (riferimento del perno): ai lati, nella parte alta delle impugnature
    if (F1) {
      // F1: mani a metà delle impugnature laterali, guanti più piccoli
      h.position.copy(lat).multiplyScalar(sd * (half + 0.012)).addScaledVector(ax, -0.025).addScaledVector(upW, -0.01);
      h.scale.setScalar(0.82);
    } else h.position.copy(lat).multiplyScalar(sd * half).addScaledVector(ax, -0.02).addScaledVector(upW, 0.045);
    // asse lungo della mano lungo l'impugnatura, dita verso il muso
    h.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ax, upW, lat));
    spin.add(h);
    return h;
  });
  const limb = (r) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, 1, 4, 10), suit); group.add(m); return m; };
  const arms = [-1, 1].map(sd => ({ sd, upper: limb(0.042), fore: limb(0.034),
    shoulder: tpl.eye.clone().add(F1 ? new THREE.Vector3(-0.08, -0.22, sd * 0.19) : new THREE.Vector3(-0.1, -0.26, sd * 0.2)) }));
  group.visible = false;
  model.body.add(group);
  // dall'interno i vetri esterni scuri non devono coprire la vista
  const outerGlass = [];
  model.body.traverse(o => { if (o.isMesh && o.material && /^EXT_Windows|Glass_Emissive|^glass$/.test(o.material.name || '')) outerGlass.push(o); });   // F1: il deflettore davanti ("glass") da dentro sembrava una fila di punte
  model.cockpit = { group, steer: spin, axis: tpl.steerAxis.clone(), leds, ledRows, display, eye: tpl.eye.clone(), outerGlass, t: 0, mirrors, mirrorMat, hands, arms, kind };
  return model.cockpit;
}

// braccia: dalla spalla alla mano (sul volante), gomito verso l'esterno e in basso
const _v = { h: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3(), b: new THREE.Vector3(), y: new THREE.Vector3(0, 1, 0), m: new THREE.Matrix4() };
export function updateArms(ck, body) {
  const A = 0.31, B = 0.29;
  ck.group.updateMatrixWorld(true);
  _v.m.copy(ck.group.matrixWorld).invert();
  ck.arms.forEach((arm, k) => {
    const hand = ck.hands[k];
    // polso: un po' sotto il centro del guanto
    _v.h.set(-0.01, -0.05, 0); hand.localToWorld(_v.h); _v.h.applyMatrix4(_v.m);
    const S = arm.shoulder;
    _v.d.subVectors(_v.h, S);
    let d = _v.d.length(); const dir = _v.d.clone().divideScalar(d);
    d = Math.min(d, A + B - 0.01);
    const x = (A * A - B * B + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, A * A - x * x));
    // direzione del gomito: in fuori (lato del braccio) e in basso, perpendicolare al braccio
    _v.b.set(0, -0.6, arm.sd * 1).normalize();
    _v.b.addScaledVector(dir, -_v.b.dot(dir)).normalize();
    _v.e.copy(S).addScaledVector(dir, x).addScaledVector(_v.b, hh);
    const place = (mesh, P, Q, r) => {
      const v = Q.clone().sub(P), L = v.length();
      mesh.position.copy(P).add(Q).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(_v.y, v.divideScalar(L));
      mesh.scale.set(1, L / (1 + 2 * r), 1);
    };
    place(arm.upper, S, _v.e, 0.042);
    place(arm.fore, _v.e, _v.h, 0.034);
  });
  void body;
}
