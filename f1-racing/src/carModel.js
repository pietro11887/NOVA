import * as THREE from 'three';
import { SPEC } from './vehicle.js';
import { carbon } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Modello low-poly di vettura GT. Muso verso +X, destra verso +Z, origine nel baricentro
// (terreno a y = -(cgHeight + 0.02) a vettura ferma).

// misure da GT3 (passo 2,6 m, carreggiata 1,66 m, ruote da 71 cm, baricentro a 40 cm)
export const GEOM = { ...SPEC.geom };   // GT3 o F1 (vehicle.js)

// Box "rastremato": sezione (w0,y0b,y0t) a x0 e (w1,y1b,y1t) a x1
function taper(x0, w0, yb0, yt0, x1, w1, yb1, yt1) {
  const v = [
    [x0, yb0, -w0 / 2], [x0, yb0, w0 / 2], [x0, yt0, w0 / 2], [x0, yt0, -w0 / 2],
    [x1, yb1, -w1 / 2], [x1, yb1, w1 / 2], [x1, yt1, w1 / 2], [x1, yt1, -w1 / 2],
  ];
  const faces = [
    [0, 1, 2, 3], [5, 4, 7, 6], // x0, x1
    [3, 2, 6, 7], [1, 0, 4, 5], // top, bottom
    [0, 3, 7, 4], [2, 1, 5, 6], // -z, +z
  ];
  const pos = [];
  for (const f of faces) {
    const [a, b, c, d] = f.map(i => v[i]);
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // se x0 > x1 l'ordine dei vertici risulta invertito: correggiamo
  if (x0 > x1) {
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
    g.computeVertexNormals();
  }
  return g;
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// Scala visiva delle monoposto (stile "cartone": vetture grandi rispetto alla pista, come nel riferimento)
export const CAR_SCALE = 1.3;

// Superficie "loft": sezioni trasversali arrotondate (superellisse) collegate tra loro.
// sections: [{ x, w, yb, yt }] ordinate lungo x; z0 = spostamento laterale del pezzo.
function loft(sections, seg = 20, z0 = 0, n = 3.2) {
  const pos = [], idx = [];
  const ring = (sc) => {
    const out = [];
    const cy = (sc.yb + sc.yt) / 2, hh = (sc.yt - sc.yb) / 2, hw = sc.w / 2;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const px = Math.sign(c) * Math.pow(Math.abs(c), 2 / n), py = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
      out.push([sc.x, cy + py * hh, z0 + px * hw]);
    }
    return out;
  };
  const rings = sections.map(ring);
  rings.forEach(r => r.forEach(p => pos.push(...p)));
  for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < seg; k++) {
    const a = j * seg + k, b = j * seg + (k + 1) % seg, c = (j + 1) * seg + k, d = (j + 1) * seg + (k + 1) % seg;
    idx.push(a, b, c, b, d, c);
  }
  // tappi alle estremità
  const capStart = pos.length / 3; const s0 = sections[0];
  pos.push(s0.x, (s0.yb + s0.yt) / 2, z0);
  for (let k = 0; k < seg; k++) idx.push(capStart, (k + 1) % seg, k);
  const capEnd = pos.length / 3; const s1 = sections[sections.length - 1], base = (rings.length - 1) * seg;
  pos.push(s1.x, (s1.yb + s1.yt) / 2, z0);
  for (let k = 0; k < seg; k++) idx.push(capEnd, base + k, base + (k + 1) % seg);
  // orientamento delle facce verso l'esterno (volume con segno positivo)
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const A = idx[t] * 3, B = idx[t + 1] * 3, C = idx[t + 2] * 3;
    vol += pos[A] * (pos[B + 1] * pos[C + 2] - pos[B + 2] * pos[C + 1]) - pos[A + 1] * (pos[B] * pos[C + 2] - pos[B + 2] * pos[C]) + pos[A + 2] * (pos[B] * pos[C + 1] - pos[B + 1] * pos[C]);
  }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// pneumatico con spalla arrotondata (tornito)
function tyreGeo(r, w) {
  const pts = [];
  const rr = Math.min(0.09, w * 0.28);
  const inner = r * 0.62;
  pts.push(new THREE.Vector2(inner, -w / 2));
  for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + (k / 6) * Math.PI / 2; pts.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, -w / 2 + rr + Math.sin(a) * rr)); }
  for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI / 2; pts.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, w / 2 - rr + Math.sin(a) * rr)); }
  pts.push(new THREE.Vector2(inner, w / 2));
  const g = new THREE.LatheGeometry(pts, 28);
  g.rotateX(Math.PI / 2);             // asse lungo z
  return g;
}

export function createCar(opts = {}) {
  const ghost = !!opts.ghost;
  const primary = opts.primary ?? 0xff8a1c;
  const accent = opts.accent ?? 0x27c3ea;
  const rimCol = opts.rim ?? 0x4a4fd8;

  const mk = (params) => {
    if (ghost) return new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.28, depthWrite: false });
    return new THREE.MeshStandardMaterial(params);
  };
  const carbonTex = ghost ? null : carbon();
  if (carbonTex) carbonTex.repeat.set(4, 4);
  const M = {
    paint: mk({ color: primary, roughness: 0.22, metalness: 0.15 }),
    accent: mk({ color: accent, roughness: 0.25, metalness: 0.1 }),
    carbon: mk({ color: 0x1d1e22, map: carbonTex, roughness: 0.4, metalness: 0.3 }),
    black: mk({ color: 0x111113, roughness: 0.55 }),
    tyre: mk({ color: 0x1c1c1f, roughness: 0.85 }),
    rim: mk({ color: rimCol, roughness: 0.3, metalness: 0.6 }),
    stripe: mk({ color: 0xf2f2f2, roughness: 0.6 }),
    white: mk({ color: 0xf2f2f2, roughness: 0.35 }),
    helmet: mk({ color: 0xffd21e, roughness: 0.2, metalness: 0.3 }),
    light: ghost ? mk({}) : new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: 0.5 }),
  };

  const root = new THREE.Group();     // posizione/orientamento sul piano
  const body = new THREE.Group();     // beccheggio e rollio (scalato)
  body.rotation.order = 'YZX';
  body.scale.setScalar(CAR_SCALE);
  root.add(body);
  const add = (m, parent = body) => { m.castShadow = !ghost; m.receiveShadow = !ghost; parent.add(m); return m; };
  const mesh = (g, mat) => new THREE.Mesh(g, mat);

  // ---- vettura GT3: lunga 4,65 m, larga 2,0 m, alta 1,25 m (terreno a y = -0.42) ----
  const glass = mk({ color: 0x1a2330, roughness: 0.08, metalness: 0.6 });
  const head = ghost ? mk({}) : new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.6, roughness: 0.2 });
  // fondo
  add(mesh(new THREE.BoxGeometry(4.0, 0.04, 1.6), M.carbon)).position.set(0, -0.35, 0);
  // scocca centrale (tra le ruote)
  add(mesh(loft([
    { x: 2.33, w: 1.15, yb: -0.33, yt: -0.08 },
    { x: 2.1, w: 1.25, yb: -0.35, yt: 0.18 },
    { x: 1.6, w: 1.3, yb: -0.35, yt: 0.33 },
    { x: 0.9, w: 1.3, yb: -0.35, yt: 0.42 },
    { x: -1.0, w: 1.3, yb: -0.35, yt: 0.45 },
    { x: -2.0, w: 1.3, yb: -0.33, yt: 0.5 },
    { x: -2.32, w: 1.2, yb: -0.25, yt: 0.48 },
  ], 24, 0, 4), M.paint));
  // paraurti anteriore (fino ai passaruota) con presa d'aria
  add(mesh(loft([
    { x: 2.36, w: 1.7, yb: -0.34, yt: -0.1 },
    { x: 2.15, w: 1.96, yb: -0.35, yt: 0.1 },
    { x: 1.7, w: 2.0, yb: -0.35, yt: 0.2 },
  ], 22, 0, 4), M.paint));
  add(mesh(loft([{ x: 2.36, w: 1.1, yb: -0.3, yt: -0.16 }, { x: 2.3, w: 1.1, yb: -0.3, yt: -0.16 }], 12, 0, 6), M.black));
  // fari
  for (const s of [-1, 1]) add(mesh(loft([{ x: 2.29, w: 0.36, yb: -0.06, yt: 0.02 }, { x: 2.05, w: 0.4, yb: 0.08, yt: 0.17 }], 10, s * 0.64, 4), head));
  for (const s of [-1, 1]) {
    // passaruota anteriori e posteriori (bombati sopra le gomme)
    add(mesh(loft([
      { x: 1.75, w: 0.4, yb: 0.0, yt: 0.2 },
      { x: 1.55, w: 0.42, yb: 0.2, yt: 0.37 },
      { x: 1.3, w: 0.42, yb: 0.27, yt: 0.41 },
      { x: 1.05, w: 0.42, yb: 0.2, yt: 0.39 },
      { x: 0.85, w: 0.4, yb: 0.0, yt: 0.38 },
    ], 16, s * 0.82), M.paint));
    add(mesh(loft([
      { x: -0.8, w: 0.42, yb: 0.0, yt: 0.44 },
      { x: -1.0, w: 0.44, yb: 0.24, yt: 0.47 },
      { x: -1.225, w: 0.44, yb: 0.3, yt: 0.49 },
      { x: -1.45, w: 0.44, yb: 0.24, yt: 0.48 },
      { x: -1.66, w: 0.42, yb: 0.0, yt: 0.47 },
    ], 16, s * 0.82), M.paint));
    // fiancata (porte e minigonna) tra le ruote
    add(mesh(loft([
      { x: 0.92, w: 0.44, yb: -0.35, yt: 0.38 },
      { x: 0.0, w: 0.46, yb: -0.35, yt: 0.43 },
      { x: -0.85, w: 0.46, yb: -0.35, yt: 0.44 },
    ], 14, s * 0.77, 4), M.paint));
    // banda colorata, minigonna nera, specchietti
    add(mesh(loft([{ x: 0.9, w: 0.48, yb: 0.12, yt: 0.22 }, { x: -0.83, w: 0.5, yb: 0.15, yt: 0.25 }], 10, s * 0.775, 6), M.accent));
    add(mesh(loft([{ x: 0.9, w: 0.5, yb: -0.37, yt: -0.28 }, { x: -0.83, w: 0.5, yb: -0.37, yt: -0.28 }], 10, s * 0.775, 6), M.black));
    add(mesh(loft([{ x: 0.62, w: 0.1, yb: 0.47, yt: 0.55 }, { x: 0.5, w: 0.12, yb: 0.46, yt: 0.56 }], 10, s * 0.8, 4), M.paint));
  }
  // paraurti posteriore con coda alta e luci
  add(mesh(loft([
    { x: -1.62, w: 2.0, yb: -0.35, yt: 0.47 },
    { x: -2.05, w: 1.98, yb: -0.33, yt: 0.5 },
    { x: -2.32, w: 1.82, yb: -0.24, yt: 0.51 },
  ], 22, 0, 4), M.paint));
  add(mesh(loft([{ x: -2.31, w: 1.5, yb: 0.3, yt: 0.38 }, { x: -2.34, w: 1.5, yb: 0.3, yt: 0.38 }], 12, 0, 8), M.light));
  // diffusore
  add(mesh(taper(-1.7, 1.4, -0.37, -0.33, -2.38, 1.4, -0.3, -0.14), M.carbon));
  // abitacolo: vetri scuri e tetto in tinta (lunotto spiovente)
  add(mesh(loft([
    { x: 0.78, w: 1.3, yb: 0.4, yt: 0.44 },
    { x: 0.15, w: 1.38, yb: 0.42, yt: 0.8 },
    { x: -0.5, w: 1.38, yb: 0.43, yt: 0.83 },
    { x: -1.1, w: 1.3, yb: 0.45, yt: 0.7 },
    { x: -1.75, w: 1.2, yb: 0.46, yt: 0.51 },
  ], 22, 0, 4), glass));
  add(mesh(loft([
    { x: 0.1, w: 1.24, yb: 0.795, yt: 0.82 },
    { x: -0.5, w: 1.3, yb: 0.83, yt: 0.855 },
    { x: -1.05, w: 1.2, yb: 0.715, yt: 0.74 },
  ], 18, 0, 5), M.paint));
  // strisce sul cofano e sul tetto, sfogo d'aria sul cofano
  add(mesh(loft([{ x: 2.2, w: 0.24, yb: 0.06, yt: 0.09 }, { x: 1.6, w: 0.26, yb: 0.33, yt: 0.345 }, { x: 0.85, w: 0.26, yb: 0.42, yt: 0.435 }], 10, 0, 6), M.accent));
  add(mesh(loft([{ x: 0.08, w: 0.26, yb: 0.817, yt: 0.828 }, { x: -0.5, w: 0.26, yb: 0.852, yt: 0.863 }, { x: -1.03, w: 0.24, yb: 0.737, yt: 0.748 }], 10, 0, 6), M.accent));
  add(mesh(loft([{ x: 1.95, w: 0.62, yb: 0.2, yt: 0.24 }, { x: 1.5, w: 0.64, yb: 0.33, yt: 0.36 }], 10, 0, 6), M.black));
  // pilota (dentro l'abitacolo)
  const helmet = add(mesh(new THREE.SphereGeometry(0.13, 14, 10), M.helmet));
  helmet.position.set(-0.4, 0.6, -0.26);
  const visor = add(mesh(new THREE.SphereGeometry(0.132, 14, 6, -0.9, 1.8, 1.25, 0.45), M.black));
  visor.position.copy(helmet.position);

  // Splitter anteriore: due metà staccabili, con i "canard" laterali (si rompono per primi)
  const frontWing = new THREE.Group(); body.add(frontWing);
  const fwHalves = [];
  for (const s of [-1, 1]) {
    const half = new THREE.Group();
    add(mesh(loft([{ x: 2.15, w: 0.96, yb: -0.385, yt: -0.355 }, { x: 2.47, w: 0.96, yb: -0.385, yt: -0.36 }], 10, s * 0.5, 8), M.carbon), half);
    const end = add(mesh(loft([{ x: 2.12, w: 0.22, yb: -0.16, yt: -0.135 }, { x: 2.32, w: 0.16, yb: -0.17, yt: -0.15 }], 8, s * 0.96, 6), M.carbon), half);
    half.userData.endplate = end;
    frontWing.add(half);
    fwHalves.push(half);
  }

  // Alettone posteriore GT: largo, all'altezza del tetto, su supporti "a collo di cigno"
  const rearWing = new THREE.Group(); body.add(rearWing);
  add(mesh(loft([{ x: -2.55, w: 1.86, yb: 0.86, yt: 0.9 }, { x: -2.2, w: 1.86, yb: 0.89, yt: 0.93 }], 10, 0, 8), M.carbon), rearWing);
  const flap = add(mesh(loft([{ x: -2.6, w: 1.84, yb: 0.94, yt: 0.97 }, { x: -2.45, w: 1.84, yb: 0.94, yt: 0.97 }], 10, 0, 8), M.accent), rearWing);
  for (const s of [-1, 1]) {
    add(mesh(loft([{ x: -2.64, w: 0.035, yb: 0.8, yt: 1.02 }, { x: -2.15, w: 0.035, yb: 0.83, yt: 0.96 }], 8, s * 0.94, 6), M.paint), rearWing);
    const st = add(box(0.06, 0.44, 0.05, M.carbon, -2.22, 0.69, s * 0.4), rearWing); st.rotation.z = 0.3;
  }
  rearWing.userData.flap = flap;

  // Ruote da 18" con gomme da GT (71 cm): 0=AS 1=AD 2=PS 3=PD
  const wheels = [];
  const wheelPos = [[GEOM.axleF * 0.95, -1], [GEOM.axleF * 0.95, 1], [GEOM.axleR * 0.98, -1], [GEOM.axleR * 0.98, 1]];
  for (const [x, s] of wheelPos) {
    const front = x > 0;
    const R = GEOM.wheelR, width = front ? 0.3 : 0.33;
    const pivot = new THREE.Group();
    const baseY = R - GEOM.cgHeight - 0.02;
    pivot.position.set(x, baseY, s * GEOM.halfTrack);
    const spin = new THREE.Group();
    pivot.add(spin);
    add(mesh(tyreGeo(R, width), M.tyre), spin);
    const rim = add(mesh(new THREE.CylinderGeometry(R * 0.66, R * 0.66, width * 0.9, 20), M.rim), spin);
    rim.rotation.x = Math.PI / 2;
    const hub = add(mesh(new THREE.CylinderGeometry(0.06, 0.06, width + 0.02, 10), M.black), spin);
    hub.rotation.x = Math.PI / 2;
    for (let k = 0; k < 5; k++) {
      const spoke = box(R * 1.2, 0.045, 0.02, M.black, 0, 0, s * (width / 2 + 0.005));
      spoke.rotation.z = k * Math.PI / 5; add(spoke, spin);
    }
    const band = add(mesh(new THREE.TorusGeometry(R * 0.8, 0.011, 4, 28), M.stripe), spin);
    band.position.z = s * (width / 2 + 0.002);
    body.add(pivot);
    wheels.push({ pivot, spin, baseY, x, side: s, arms: [], angle: 0 });
  }

  if (ghost) root.traverse(o => { o.renderOrder = 2; });

  return { root, body, wheels, frontWing, fwHalves, rearWing, helmet: [helmet, visor], materials: M, scale: CAR_SCALE };
}

// Versione alleggerita per gli avversari: unisce le mesh per materiale
// (da ~100 a ~20 chiamate di disegno per vettura). Ali e ruote restano animabili.
export function mergeCar(car) {
  const mergeUnder = (root, skip) => {
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    const groups = new Map();
    const meshes = [];
    root.traverse(o => {
      if (!o.isMesh || o === root) return;
      for (let p = o.parent; p && p !== root; p = p.parent) if (skip.includes(p)) return;
      if (skip.includes(o)) return;
      meshes.push(o);
    });
    for (const o of meshes) {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      g.applyMatrix4(inv.clone().multiply(o.matrixWorld));
      if (!groups.has(o.material)) groups.set(o.material, []);
      groups.get(o.material).push(g);
      o.parent.remove(o);
    }
    for (const [mat, list] of groups) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = true; m.receiveShadow = true;
      root.add(m);
    }
  };
  const pivots = car.wheels.map(w => w.pivot);
  // ali separate: nei contatti si possono staccare anche sulle vetture avversarie
  mergeUnder(car.body, [...pivots, ...car.fwHalves, car.rearWing]);
  for (const h of car.fwHalves) mergeUnder(h, [h.userData.endplate]);
  mergeUnder(car.rearWing, []);
  for (const w of car.wheels) mergeUnder(w.spin, []);
  car.helmet = [];
  car.merged = true;
  return car;
}
