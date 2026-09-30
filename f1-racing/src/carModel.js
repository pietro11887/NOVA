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

export function createCar(opts = {}) {
  const ghost = !!opts.ghost;
  const primary = opts.primary ?? 0xff8a1c;
  const accent = opts.accent ?? 0x27c3ea;

  const mk = (params) => {
    if (ghost) return new THREE.MeshBasicMaterial({ color: params.color ?? 0xffffff, transparent: true, opacity: 0.28, depthWrite: false });
    return new THREE.MeshStandardMaterial(params);
  };
  const carbonTex = ghost ? null : carbon();
  if (carbonTex) carbonTex.repeat.set(4, 4);
  const M = {
    paint: mk({ color: ghost ? 0x7fd8ff : primary, roughness: 0.28, metalness: 0.25 }),
    accent: mk({ color: ghost ? 0x7fd8ff : accent, roughness: 0.3, metalness: 0.2 }),
    carbon: mk({ color: ghost ? 0x7fd8ff : 0x222326, map: carbonTex, roughness: 0.45, metalness: 0.3 }),
    black: mk({ color: ghost ? 0x7fd8ff : 0x121214, roughness: 0.6 }),
    tyre: mk({ color: ghost ? 0x7fd8ff : 0x1a1a1c, roughness: 0.92 }),
    rim: mk({ color: ghost ? 0x7fd8ff : 0x2c2d31, roughness: 0.35, metalness: 0.8 }),
    stripe: mk({ color: ghost ? 0x7fd8ff : 0xe8322b, roughness: 0.6 }),
    white: mk({ color: ghost ? 0x7fd8ff : 0xf2f2f2, roughness: 0.4 }),
    helmet: mk({ color: ghost ? 0x7fd8ff : 0xffd21e, roughness: 0.25, metalness: 0.3 }),
    light: ghost ? mk({ color: 0x7fd8ff }) : new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: 0.4 }),
  };

  const root = new THREE.Group();     // posizione/orientamento sul piano
  const body = new THREE.Group();     // beccheggio e rollio
  body.rotation.order = 'YZX';
  root.add(body);
  const add = (m, parent = body) => { m.castShadow = !ghost; m.receiveShadow = !ghost; parent.add(m); return m; };

  // Fondo
  add(new THREE.Mesh(taper(-1.95, 1.2, -0.27, -0.23, 1.25, 1.45, -0.27, -0.23), M.carbon));
  // Monoscocca
  add(new THREE.Mesh(taper(-0.45, 0.8, -0.26, 0.22, 1.3, 0.62, -0.24, 0.12), M.paint));
  // Muso
  add(new THREE.Mesh(taper(1.3, 0.6, -0.22, 0.12, 3.0, 0.22, -0.2, -0.08), M.paint));
  add(new THREE.Mesh(taper(1.8, 0.3, 0.02, 0.1, 2.95, 0.12, -0.08, -0.04), M.accent)); // striscia sul muso
  // Pance laterali
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(taper(0.9, 0.48, -0.25, 0.2, -1.2, 0.3, -0.25, -0.02), M.paint);
    pod.position.z = s * 0.56; add(pod);
    const inlet = box(0.04, 0.2, 0.36, M.black, 0.92, 0.02, s * 0.56); add(inlet);
    const stripe = new THREE.Mesh(taper(0.7, 0.5, 0.12, 0.2, -0.6, 0.34, 0.02, 0.09), M.accent);
    stripe.position.z = s * 0.56; stripe.scale.z = 1.02; add(stripe);
  }
  // Cofano motore e airbox
  add(new THREE.Mesh(taper(-0.35, 0.58, -0.2, 0.6, -1.85, 0.2, -0.2, 0.08), M.paint));
  add(new THREE.Mesh(taper(-0.3, 0.26, 0.4, 0.62, -0.45, 0.22, 0.4, 0.6), M.black)); // presa d'aria
  add(new THREE.Mesh(taper(-0.6, 0.03, 0.55, 0.62, -1.8, 0.03, 0.08, 0.5), M.accent)); // pinna
  // Abitacolo
  add(box(0.7, 0.06, 0.5, M.black, 0.35, 0.2, 0));
  const helmet = add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), M.helmet));
  helmet.position.set(0.12, 0.3, 0);
  const visor = add(new THREE.Mesh(new THREE.SphereGeometry(0.142, 16, 6, -0.9, 1.8, 1.2, 0.5), M.black));
  visor.position.copy(helmet.position);
  // Halo
  const halo = add(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.028, 6, 24, Math.PI * 1.1), M.carbon));
  halo.position.set(0.05, 0.43, 0);
  halo.rotation.set(-Math.PI / 2, 0, -0.55 * Math.PI);
  const pillar = add(box(0.04, 0.24, 0.05, M.carbon, 0.44, 0.31, 0)); pillar.rotation.z = -0.35;
  // Specchietti
  for (const s of [-1, 1]) { add(box(0.1, 0.06, 0.16, M.paint, 0.55, 0.3, s * 0.48)); add(box(0.02, 0.1, 0.02, M.black, 0.55, 0.22, s * 0.42)); }

  // Ala anteriore (due metà staccabili)
  const frontWing = new THREE.Group(); body.add(frontWing);
  const fwHalves = [];
  for (const s of [-1, 1]) {
    const half = new THREE.Group();
    add(box(0.5, 0.03, 0.9, M.carbon, 3.05, -0.22, s * 0.5), half);
    add(box(0.28, 0.025, 0.85, M.accent, 2.92, -0.16, s * 0.52), half);
    add(box(0.18, 0.02, 0.8, M.paint, 2.82, -0.11, s * 0.55), half);
    const end = add(box(0.55, 0.2, 0.025, M.paint, 3.0, -0.15, s * 0.96), half);
    half.userData.endplate = end;
    frontWing.add(half);
    fwHalves.push(half);
  }
  add(box(0.3, 0.12, 0.08, M.carbon, 2.8, -0.14, 0), frontWing);

  // Ala posteriore
  const rearWing = new THREE.Group(); body.add(rearWing);
  add(box(0.38, 0.03, 1.0, M.carbon, -2.2, 0.55, 0), rearWing);
  const flap = add(box(0.2, 0.025, 1.0, M.paint, -2.36, 0.66, 0), rearWing);
  for (const s of [-1, 1]) {
    add(box(0.62, 0.72, 0.03, M.carbon, -2.2, 0.36, s * 0.51), rearWing);
    add(box(0.62, 0.1, 0.035, M.paint, -2.2, 0.68, s * 0.51), rearWing);
  }
  add(box(0.3, 0.02, 0.9, M.carbon, -2.1, 0.12, 0), rearWing); // beam wing
  add(box(0.08, 0.5, 0.05, M.carbon, -2.12, 0.3, 0), rearWing);
  rearWing.userData.flap = flap;
  // Diffusore e luce posteriore
  add(new THREE.Mesh(taper(-1.7, 1.0, -0.27, -0.2, -2.25, 1.0, -0.2, -0.02), M.carbon));
  add(box(0.03, 0.06, 0.1, M.light, -2.26, -0.06, 0));

  // Ruote: 0=AS 1=AD 2=PS 3=PD  (S = sinistra = -Z)
  const wheels = [];
  const wheelPos = [[GEOM.axleF, -1], [GEOM.axleF, 1], [GEOM.axleR, -1], [GEOM.axleR, 1]];
  for (const [x, s] of wheelPos) {
    const front = x > 0;
    const width = front ? 0.34 : 0.4;
    const pivot = new THREE.Group();    // sterzo
    pivot.position.set(x, GEOM.wheelR - GEOM.cgHeight, s * GEOM.halfTrack);
    const spin = new THREE.Group();     // rotazione
    pivot.add(spin);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(GEOM.wheelR, GEOM.wheelR, width, 24, 1), M.tyre);
    tyre.rotation.x = Math.PI / 2;
    add(tyre, spin);
    for (const side of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.012, 4, 24), M.stripe);
      band.position.z = side * (width / 2 + 0.001);
      add(band, spin);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), M.rim);
      rim.rotation.x = Math.PI / 2; rim.position.z = side * (width / 2 - 0.005);
      add(rim, spin);
    }
    for (let k = 0; k < 5; k++) {
      const spoke = box(0.36, 0.04, 0.02, M.black, 0, 0, s * (width / 2 + 0.005));
      spoke.rotation.z = k * Math.PI / 5; add(spoke, spin);
    }
    body.add(pivot);
    // bracci sospensione (restano sul corpo)
    const arms = [];
    for (const [dy, dx] of [[0.1, 0.18], [-0.08, -0.18]]) {
      const len = GEOM.halfTrack - 0.35;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 5), M.black);
      arm.rotation.x = Math.PI / 2;
      arm.rotation.y = s * dx;
      arm.position.set(x, GEOM.wheelR - GEOM.cgHeight + dy, s * (0.35 + len / 2));
      add(arm); arms.push(arm);
    }
    wheels.push({ pivot, spin, baseY: pivot.position.y, x, side: s, arms, angle: 0 });
  }

  if (ghost) root.traverse(o => { o.renderOrder = 2; });

  return { root, body, wheels, frontWing, fwHalves, rearWing, helmet: [helmet, visor], materials: M };
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
