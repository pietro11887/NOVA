import * as THREE from 'three';

// Versione "cartoon" di una vettura del gioco (modalità arcade, stile iRacing Arcade):
// più corta e alta, ruote grandi, casco del pilota grande, colori a toni pieni con contorno.
// Solo grafica: la fisica resta quella della vettura vera.

const LEN = 0.68, HGT = 1.22, WID = 1.06, WHEEL = 1.42, HEAD = 2.3;
let gradient = null;
function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([120, 120, 120, 255, 185, 185, 185, 255, 240, 240, 240, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}
const toonCache = new Map();
function toon(m) {
  if (!m || toonCache.has(m)) return toonCache.get(m) || m;
  const t = new THREE.MeshToonMaterial({ color: m.color ? m.color.clone() : 0xffffff, map: m.map || null, gradientMap: toonGradient(),
    transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, visible: m.visible });
  if (m.emissive) { t.emissive = m.emissive.clone(); t.emissiveIntensity = m.emissiveIntensity; }
  // tinte un filo più sature
  if (!m.map && t.color) { const hsl = {}; t.color.getHSL(hsl); t.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.25), Math.max(0.12, hsl.l)); }
  if (m.map) t.color.setScalar(1.25);                       // texture più luminose, da cartone animato
  toonCache.set(m, t);
  return t;
}
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x15161a, side: THREE.BackSide });
outlineMat.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * 0.018;');
};

function squash(g, lift) {
  g = g.clone();
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) * LEN, P.getY(i) * HGT + lift, P.getZ(i) * WID);
  P.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function cartoonize(car, opts = {}) {
  const ghost = !!opts.ghost, outline = opts.outline !== false && !ghost;
  const wheelR = car.wheels.length ? car.wheels[0].baseY : 0.33;
  const lift = wheelR * (WHEEL - 1) * 0.55;               // la scocca sale un po' con le ruote grandi
  const wheelSet = new Set();
  for (const w of car.wheels) w.spin.traverse(o => wheelSet.add(o));
  const helmetSet = new Set();
  for (const h of car.helmet) h.traverse(o => helmetSet.add(o));
  const outlines = [];
  car.body.traverse(o => {
    if (!o.isMesh || o.userData.outline) return;
    if (!wheelSet.has(o) && !helmetSet.has(o)) o.geometry = squash(o.geometry, lift);
    if (ghost) return;                                   // il fantasma resta trasparente
    o.material = Array.isArray(o.material) ? o.material.map(toon) : toon(o.material);
    // gomme: grigio antracite invece del nero pieno
    if (wheelSet.has(o) && o.material.map && !o.userData.tyreLit) { o.material = o.material.clone(); o.material.color.setScalar(2.4); o.userData.tyreLit = true; }
    if (outline && o.material.visible !== false && !o.material.transparent) outlines.push(o);
  });
  for (const o of outlines) {
    const ol = new THREE.Mesh(o.geometry, outlineMat);
    ol.userData.outline = true; ol.castShadow = false;
    o.add(ol);
  }
  for (const w of car.wheels) {
    w.pivot.position.x *= LEN;
    w.pivot.position.z *= WID;
    w.pivot.position.y = w.baseY * WHEEL;
    w.baseY = w.baseY * WHEEL;
    w.spin.scale.setScalar(WHEEL);
  }
  for (const h of car.helmet) {
    h.position.x *= LEN;
    h.position.y = h.position.y * HGT + lift + 0.17;
    h.scale.multiplyScalar(HEAD);
  }
  car.cartoon = true;
  return car;
}
