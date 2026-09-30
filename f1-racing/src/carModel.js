import * as THREE from 'three';
import { carbon } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Modello low-poly di monoposto. Muso verso +X, destra verso +Z, origine nel baricentro
// (terreno a y = -0.30 a vettura ferma).

export const GEOM = {
  axleF: 1.9, axleR: -1.7, halfTrack: 0.8, wheelR: 0.33, cgHeight: 0.3,
};

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

  // Fondo piatto
  add(mesh(new THREE.BoxGeometry(3.3, 0.04, 1.5), M.carbon)).position.set(-0.3, -0.25, 0);
  // Scocca: muso, abitacolo e cofano motore in un unico corpo arrotondato
  add(mesh(loft([
    { x: -2.15, w: 0.26, yb: -0.12, yt: 0.12 },
    { x: -1.75, w: 0.42, yb: -0.2, yt: 0.3 },
    { x: -1.0, w: 0.6, yb: -0.24, yt: 0.56 },
    { x: -0.45, w: 0.74, yb: -0.25, yt: 0.6 },
    { x: -0.1, w: 0.82, yb: -0.25, yt: 0.34 },
    { x: 0.6, w: 0.72, yb: -0.24, yt: 0.28 },
    { x: 1.25, w: 0.5, yb: -0.2, yt: 0.2 },
    { x: 2.0, w: 0.3, yb: -0.17, yt: 0.06 },
    { x: 2.55, w: 0.18, yb: -0.16, yt: -0.04 },
  ], 24), M.paint));
  // striscia sul muso e sul cofano
  add(mesh(loft([
    { x: 0.7, w: 0.2, yb: 0.2, yt: 0.29 }, { x: 1.3, w: 0.16, yb: 0.14, yt: 0.21 }, { x: 2.05, w: 0.1, yb: 0.01, yt: 0.075 }, { x: 2.5, w: 0.06, yb: -0.07, yt: -0.02 },
  ], 12), M.accent));
  add(mesh(loft([
    { x: -0.5, w: 0.06, yb: 0.3, yt: 0.64 }, { x: -1.0, w: 0.05, yb: 0.3, yt: 0.6 }, { x: -1.7, w: 0.04, yb: 0.1, yt: 0.33 },
  ], 10), M.accent));
  // presa d'aria sopra la testa
  add(mesh(loft([{ x: -0.36, w: 0.26, yb: 0.42, yt: 0.62 }, { x: -0.3, w: 0.24, yb: 0.44, yt: 0.6 }], 12), M.black));
  // pance laterali
  for (const s of [-1, 1]) {
    add(mesh(loft([
      { x: 0.85, w: 0.34, yb: -0.22, yt: 0.14 },
      { x: 0.55, w: 0.5, yb: -0.24, yt: 0.22 },
      { x: -0.3, w: 0.5, yb: -0.25, yt: 0.2 },
      { x: -1.1, w: 0.36, yb: -0.25, yt: 0.04 },
      { x: -1.6, w: 0.18, yb: -0.24, yt: -0.1 },
    ], 16, s * 0.6), M.paint));
    add(mesh(loft([{ x: 0.86, w: 0.3, yb: -0.16, yt: 0.1 }, { x: 0.8, w: 0.3, yb: -0.16, yt: 0.1 }], 12, s * 0.6), M.black));
    // fascia colorata sopra la pancia
    add(mesh(loft([{ x: 0.6, w: 0.34, yb: 0.17, yt: 0.235 }, { x: -0.3, w: 0.36, yb: 0.15, yt: 0.215 }, { x: -1.0, w: 0.22, yb: 0.0, yt: 0.07 }], 12, s * 0.6), M.accent));
  }
  // abitacolo
  add(mesh(loft([{ x: -0.25, w: 0.48, yb: 0.24, yt: 0.36 }, { x: 0.15, w: 0.5, yb: 0.22, yt: 0.33 }, { x: 0.55, w: 0.36, yb: 0.2, yt: 0.29 }], 14), M.black));
  const helmet = add(mesh(new THREE.SphereGeometry(0.15, 18, 14), M.helmet));
  helmet.position.set(0.02, 0.38, 0);
  const visor = add(mesh(new THREE.SphereGeometry(0.152, 18, 6, -0.9, 1.8, 1.25, 0.45), M.black));
  visor.position.copy(helmet.position);
  // halo
  const halo = add(mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 28, Math.PI * 1.1), M.carbon));
  halo.position.set(-0.02, 0.5, 0);
  halo.rotation.set(-Math.PI / 2, 0, -0.55 * Math.PI);
  const pillar = add(box(0.04, 0.26, 0.05, M.carbon, 0.36, 0.4, 0)); pillar.rotation.z = -0.35;
  // specchietti
  for (const s of [-1, 1]) { add(mesh(loft([{ x: 0.48, w: 0.14, yb: 0.34, yt: 0.4 }, { x: 0.58, w: 0.14, yb: 0.34, yt: 0.4 }], 10, s * 0.46), M.paint)); }

  // Ala anteriore: due metà staccabili, ognuna con piano, flap colorato e paratia
  const frontWing = new THREE.Group(); body.add(frontWing);
  const fwHalves = [];
  for (const s of [-1, 1]) {
    const half = new THREE.Group();
    add(mesh(loft([{ x: 2.4, w: 0.9, yb: -0.25, yt: -0.21 }, { x: 2.7, w: 0.9, yb: -0.255, yt: -0.215 }, { x: 2.9, w: 0.88, yb: -0.25, yt: -0.225 }], 10, s * 0.5, 6), M.carbon), half);
    add(mesh(loft([{ x: 2.35, w: 0.86, yb: -0.19, yt: -0.16 }, { x: 2.6, w: 0.86, yb: -0.2, yt: -0.17 }], 10, s * 0.52, 6), M.accent), half);
    add(mesh(loft([{ x: 2.25, w: 0.8, yb: -0.13, yt: -0.105 }, { x: 2.45, w: 0.8, yb: -0.14, yt: -0.115 }], 10, s * 0.55, 6), M.paint), half);
    const end = add(mesh(loft([{ x: 2.25, w: 0.035, yb: -0.26, yt: -0.08 }, { x: 2.93, w: 0.035, yb: -0.26, yt: -0.14 }], 8, s * 0.97, 6), M.paint), half);
    half.userData.endplate = end;
    frontWing.add(half);
    fwHalves.push(half);
  }
  add(box(0.3, 0.14, 0.08, M.carbon, 2.35, -0.14, 0), frontWing);

  // Ala posteriore alta con paratie
  const rearWing = new THREE.Group(); body.add(rearWing);
  add(mesh(loft([{ x: -2.35, w: 1.0, yb: 0.52, yt: 0.57 }, { x: -2.05, w: 1.0, yb: 0.55, yt: 0.6 }], 10, 0, 6), M.carbon), rearWing);
  const flap = add(mesh(loft([{ x: -2.5, w: 1.0, yb: 0.66, yt: 0.7 }, { x: -2.3, w: 1.0, yb: 0.66, yt: 0.7 }], 10, 0, 6), M.paint), rearWing);
  for (const s of [-1, 1]) {
    add(mesh(loft([{ x: -2.55, w: 0.04, yb: 0.1, yt: 0.78 }, { x: -1.95, w: 0.04, yb: 0.12, yt: 0.66 }], 8, s * 0.52, 6), M.accent), rearWing);
  }
  add(box(0.28, 0.02, 0.9, M.carbon, -2.05, 0.1, 0), rearWing);
  add(box(0.1, 0.46, 0.06, M.carbon, -2.12, 0.32, 0), rearWing);
  rearWing.userData.flap = flap;
  // diffusore e luce
  add(mesh(taper(-1.6, 1.0, -0.27, -0.22, -2.2, 1.0, -0.2, -0.03), M.carbon));
  add(box(0.03, 0.07, 0.12, M.light, -2.2, -0.04, 0));

  // Ruote grandi (posteriori più larghe) con cerchi colorati: 0=AS 1=AD 2=PS 3=PD
  const wheels = [];
  const wheelPos = [[GEOM.axleF * 0.95, -1], [GEOM.axleF * 0.95, 1], [GEOM.axleR * 0.98, -1], [GEOM.axleR * 0.98, 1]];
  for (const [x, s] of wheelPos) {
    const front = x > 0;
    const R = front ? 0.36 : 0.38, width = front ? 0.44 : 0.56;
    const pivot = new THREE.Group();
    const baseY = R - GEOM.cgHeight - 0.02;
    pivot.position.set(x, baseY, s * (front ? 0.8 : 0.78));
    const spin = new THREE.Group();
    pivot.add(spin);
    add(mesh(tyreGeo(R, width), M.tyre), spin);
    // cerchio
    const rim = add(mesh(new THREE.CylinderGeometry(R * 0.62, R * 0.62, width * 0.92, 20), M.rim), spin);
    rim.rotation.x = Math.PI / 2;
    // mozzo e razze (per vedere la rotazione)
    const hub = add(mesh(new THREE.CylinderGeometry(0.07, 0.07, width + 0.02, 10), M.black), spin);
    hub.rotation.x = Math.PI / 2;
    for (let k = 0; k < 3; k++) {
      const spoke = box(R * 1.1, 0.05, 0.02, M.black, 0, 0, s * (width / 2 + 0.005));
      spoke.rotation.z = k * Math.PI / 3; add(spoke, spin);
    }
    // scritta laterale della gomma
    const band = add(mesh(new THREE.TorusGeometry(R * 0.8, 0.012, 4, 28), M.stripe), spin);
    band.position.z = s * (width / 2 + 0.002);
    body.add(pivot);
    const arms = [];
    for (const [dy, dx] of [[0.1, 0.18], [-0.08, -0.18]]) {
      const len = 0.42;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 5), M.black);
      arm.rotation.x = Math.PI / 2;
      arm.rotation.y = s * dx;
      arm.position.set(x, baseY + dy, s * (0.36 + len / 2));
      add(arm); arms.push(arm);
    }
    wheels.push({ pivot, spin, baseY, x, side: s, arms, angle: 0 });
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
