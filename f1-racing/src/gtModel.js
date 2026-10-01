import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEOM, CAR_SCALE } from './carModel.js';

// Porsche 992 GT3 R — modello di MattDoesBlender (Sketchfab), licenza CC BY-NC-SA 4.0.
// Ottimizzato per il gioco (abitacolo rimosso, poligoni ridotti, texture compresse).
// Qui viene convertito nel formato delle vetture del gioco: muso verso +X, destra verso +Z,
// terreno a y = -(cgHeight + 0.02); ruote separate che girano e sterzano; splitter e
// alettone staccabili negli urti; vernice ricolorabile per squadra.

const WHEEL_IDX = { LF: 0, RF: 1, LR: 2, RR: 3 };   // ordine del gioco: AS, AD, PS, PD

let templates = null;

export function loadGT(base = 'assets/') {
  const loader = new GLTFLoader();
  const get = f => new Promise((res, rej) => loader.load(base + f, res, undefined, rej));
  return Promise.all([get('gt3r_hi.glb'), get('gt3r_mid.glb')]).then(([hi, mid]) => {
    templates = { hi: prepare(hi.scene, false), mid: prepare(mid.scene, true) };
    return templates;
  });
}
export const gtReady = () => !!templates;

// materiali "da gioco": vernice lucida, vetri scuri opachi (l'abitacolo non c'è), luci che brillano
function tuneMaterial(src) {
  const n = src.name || '';
  const m = new THREE.MeshStandardMaterial({ name: n, map: src.map || null, color: src.color.clone(), transparent: src.transparent, opacity: src.opacity, alphaTest: src.alphaTest, side: src.side });
  m.roughness = 0.6; m.metalness = 0.1;
  if (n === 'PAINT') { m.roughness = 0.28; m.metalness = 0.35; m.color.set(0xffffff); }
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
function partOf(cx, cy, cz) {
  if (cx < -1.98 && cy > 0.42) return 'rw';                       // alettone (sopra il cofano posteriore)
  if (cx > 2.08 && cy < -0.24) {                                   // splitter anteriore
    if (Math.abs(cz) > 0.72) return cz < 0 ? 'fwLe' : 'fwRe';
    return cz < 0 ? 'fwL' : 'fwR';
  }
  return 'body';
}

function prepare(scene, lowPoly) {
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
      const k = mat.name === 'PAINT' || /Details|Mechanics|CHASSIS/.test(mat.name) ? partOf(tmp.x, tmp.y, tmp.z) : 'body';
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
  return { parts, wheelInfo, mats };
}

// crea una vettura con la stessa interfaccia di createCar() (carModel.js)
export function createGT(opts = {}) {
  const tpl = opts.lod === 'mid' ? templates.mid : templates.hi;
  const ghost = !!opts.ghost;
  const ghostMat = ghost ? new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.28, depthWrite: false }) : null;
  const paint = tpl.mats.get([...tpl.mats.keys()].find(k => tpl.mats.get(k).name === 'PAINT'));
  const myPaint = paint ? paint.clone() : null;
  if (myPaint) myPaint.color.set(opts.primary ?? 0xff8a1c);
  const stripe = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.6 });
  const M = m => ghost ? ghostMat : (m === paint ? myPaint : m);
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
  if (ghost) root.traverse(o => { o.renderOrder = 2; });
  return { root, body, wheels, frontWing, fwHalves, rearWing, helmet: [], materials: { paint: myPaint, stripe }, scale: CAR_SCALE, gt: true };
}
