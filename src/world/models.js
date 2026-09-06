import * as THREE from 'three';
import { GeoBuilder, pick, rand } from '../core/utils.js';

/* ------------------------------------------------------------------ auto */

export const CAR_TYPES = {
  sedan:  { L: 4.3, W: 1.9, H: 0.72, cabin: [2.0, 0.66, 1.66], cabinZ: -0.15, top: 1.75, mass: 1, speed: 1.0 },
  sport:  { L: 4.5, W: 1.94, H: 0.58, cabin: [1.7, 0.52, 1.6], cabinZ: -0.3, top: 1.45, mass: 0.85, speed: 1.3 },
  suv:    { L: 4.6, W: 2.05, H: 0.95, cabin: [2.4, 0.8, 1.85], cabinZ: -0.1, top: 2.05, mass: 1.25, speed: 0.92 },
  van:    { L: 5.0, W: 2.1, H: 1.25, cabin: [2.6, 0.95, 1.95], cabinZ: 0.5, top: 2.4, mass: 1.5, speed: 0.82 },
  pickup: { L: 4.9, W: 2.0, H: 0.85, cabin: [1.7, 0.75, 1.8], cabinZ: 0.6, top: 1.95, mass: 1.2, speed: 0.9 },
};

export const CAR_COLORS = [
  0xd93b3b, 0x2f6fd0, 0xf0f0f0, 0x1c1c22, 0x2fae62, 0xe0a92c,
  0x8a8f99, 0x6d3fa0, 0xe07a2f, 0x2aa8b8, 0xb0b8c4, 0x60351f,
];

const shared = {};

function buildCarGeo(t, kind) {
  const body = new GeoBuilder();     // lamiera: colorata dal materiale
  const trim = new GeoBuilder();     // vetri, paraurti, ruote
  const lights = new GeoBuilder();   // fari (emissivi di notte)
  const wheelY = 0.34, wr = 0.36, wx = t.L * 0.31, wz = t.W / 2 - 0.01;

  // scocca
  body.box(0, t.H / 2 + 0.28, 0, t.L, t.H, t.W, 0xffffff);
  body.box(t.cabinZ, t.H + 0.28 + t.cabin[1] / 2, 0, t.cabin[0], t.cabin[1], t.cabin[2], 0xffffff);
  // cofano e baule leggermente piu' bassi
  body.box(t.L / 2 - 0.35, t.H + 0.2, 0, 0.7, 0.12, t.W * 0.92, 0xffffff);

  // vetri
  const gh = t.cabin[1] * 0.62;
  trim.box(t.cabinZ, t.H + 0.34 + t.cabin[1] / 2, 0, t.cabin[0] * 0.96, gh, t.cabin[2] + 0.03, 0x141b26);
  trim.box(t.cabinZ + t.cabin[0] / 2, t.H + 0.32 + t.cabin[1] / 2, 0, 0.08, gh, t.cabin[2] * 0.9, 0x0e131c);
  // paraurti
  trim.box(t.L / 2 - 0.05, 0.55, 0, 0.22, 0.34, t.W * 0.98, 0x30343c);
  trim.box(-t.L / 2 + 0.05, 0.55, 0, 0.22, 0.34, t.W * 0.98, 0x30343c);
  // ruote
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    trim.box(sx * wx, wheelY, sz * wz, wr * 2, wr * 2, 0.34, 0x15171c);
    trim.box(sx * wx, wheelY, sz * (wz + 0.04), wr * 0.85, wr * 0.85, 0.32, 0x646a75);
  }
  // fari
  lights.box(t.L / 2 - 0.02, 0.72, t.W * 0.32, 0.14, 0.2, 0.42, 0xfff3d0);
  lights.box(t.L / 2 - 0.02, 0.72, -t.W * 0.32, 0.14, 0.2, 0.42, 0xfff3d0);
  lights.box(-t.L / 2 + 0.02, 0.75, t.W * 0.33, 0.12, 0.18, 0.4, 0xff3020);
  lights.box(-t.L / 2 + 0.02, 0.75, -t.W * 0.33, 0.12, 0.18, 0.4, 0xff3020);

  if (kind === 'police') {
    trim.box(t.cabinZ, t.top + 0.16, 0, 1.0, 0.12, 1.1, 0x1a1d24);
  }
  if (kind === 'taxi') {
    trim.box(t.cabinZ, t.top + 0.2, 0, 0.9, 0.3, 0.45, 0xffd23f);
  }
  return { body: body.build(), trim: trim.build(), lights: lights.build() };
}

export function initModels() {
  shared.trimMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  shared.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  shared.geo = {};
  for (const k of Object.keys(CAR_TYPES)) {
    shared.geo[k] = buildCarGeo(CAR_TYPES[k], 'civil');
    shared.geo[k + ':police'] = buildCarGeo(CAR_TYPES[k], 'police');
    shared.geo[k + ':taxi'] = buildCarGeo(CAR_TYPES[k], 'taxi');
  }
  // parti del personaggio (geometrie condivise da tutti i bot)
  // il personaggio guarda verso +X: la larghezza delle spalle sta su Z
  shared.charGeo = {
    torso: new THREE.BoxGeometry(0.3, 0.62, 0.54),
    hips: new THREE.BoxGeometry(0.3, 0.26, 0.48),
    head: new THREE.BoxGeometry(0.27, 0.3, 0.28),
    hair: new THREE.BoxGeometry(0.29, 0.11, 0.3),
    arm: new THREE.BoxGeometry(0.17, 0.58, 0.15),
    leg: new THREE.BoxGeometry(0.21, 0.78, 0.19),
  };
  shared.charGeo.arm.translate(0, -0.29, 0);
  shared.charGeo.leg.translate(0, -0.39, 0);
  shared.shadowGeo = new THREE.CircleGeometry(0.55, 12);
  shared.shadowGeo.rotateX(-Math.PI / 2);
  shared.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  shared.carShadowGeo = new THREE.PlaneGeometry(4.6, 2.2);
  shared.carShadowGeo.rotateX(-Math.PI / 2);
  return shared;
}

export function makeCar(type = 'sedan', color = 0xd93b3b, kind = 'civil') {
  const key = kind === 'civil' ? type : `${type}:${kind}`;
  const g = shared.geo[key] || shared.geo.sedan;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color, vertexColors: true });
  const body = new THREE.Mesh(g.body, bodyMat);
  const trim = new THREE.Mesh(g.trim, shared.trimMat);
  const lights = new THREE.Mesh(g.lights, shared.lightMat);
  lights.visible = false;
  group.add(body, trim, lights);

  const shadow = new THREE.Mesh(shared.carShadowGeo, shared.shadowMat);
  shadow.position.y = 0.04;
  shadow.scale.set(CAR_TYPES[type].L / 4.6, 1, CAR_TYPES[type].W / 2.2);
  group.add(shadow);

  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    bar.position.set(CAR_TYPES[type].cabinZ, CAR_TYPES[type].top + 0.3, 0);
    group.add(bar);
    group.userData.bar = bar;
  }
  group.userData.bodyMat = bodyMat;
  group.userData.lights = lights;
  return group;
}

/* -------------------------------------------------------------- personaggi */

const SKINS = [0xf2c9a4, 0xe0ae82, 0xc78e5f, 0x9c6b45, 0x6f4a2f, 0xffdcb8];
const SHIRTS = [0x2f6fd0, 0xd93b3b, 0x2fae62, 0xf0f0f0, 0x2b2f38, 0xe0a92c, 0x8a4fbf, 0xe0722f, 0x27b3b8];
const PANTS = [0x2b3444, 0x3b3f4a, 0x1f2632, 0x5a4632, 0x6b7280, 0x243b55];

export function makeCharacter(opts = {}) {
  const G = shared.charGeo;
  const skin = new THREE.MeshLambertMaterial({ color: opts.skin ?? pick(SKINS) });
  const shirt = new THREE.MeshLambertMaterial({ color: opts.shirt ?? pick(SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: opts.pants ?? pick(PANTS) });
  const hairMat = new THREE.MeshLambertMaterial({ color: opts.hair ?? pick([0x241a12, 0x4b3220, 0x8a6a35, 0x101010, 0x9b9b9b]) });

  const group = new THREE.Group();
  const torso = new THREE.Mesh(G.torso, shirt); torso.position.y = 1.22;
  const hips = new THREE.Mesh(G.hips, pants); hips.position.y = 0.88;
  const head = new THREE.Mesh(G.head, skin); head.position.y = 1.68;
  const hair = new THREE.Mesh(G.hair, hairMat); hair.position.y = 1.85;
  const larm = new THREE.Mesh(G.arm, shirt); larm.position.set(0, 1.48, 0.34);
  const rarm = new THREE.Mesh(G.arm, shirt); rarm.position.set(0, 1.48, -0.34);
  const lleg = new THREE.Mesh(G.leg, pants); lleg.position.set(0, 0.8, 0.13);
  const rleg = new THREE.Mesh(G.leg, pants); rleg.position.set(0, 0.8, -0.13);
  const face = new THREE.Mesh(G.hair, skin);
  face.scale.set(0.25, 0.6, 0.5);
  face.position.set(0.16, 1.66, 0);
  const shadow = new THREE.Mesh(shared.shadowGeo, shared.shadowMat);
  shadow.position.y = 0.03;
  group.add(torso, hips, head, hair, face, larm, rarm, lleg, rleg, shadow);

  group.userData.parts = { torso, hips, head, hair, face, larm, rarm, lleg, rleg };
  group.userData.mats = { skin, shirt, pants, hairMat };
  return group;
}

/** Animazione procedurale: camminata, corsa, pugno, caduta. */
export function animateCharacter(group, speed, t, state = 'walk', punchT = 0) {
  const p = group.userData.parts;
  if (!p) return;
  if (state === 'down') {
    group.rotation.z = -Math.PI / 2.1;
    group.position.y = 0.35;
    p.larm.rotation.x = 0.6; p.rarm.rotation.x = -0.6;
    p.lleg.rotation.x = 0.3; p.rleg.rotation.x = -0.2;
    return;
  }
  group.rotation.z = 0;
  const f = Math.min(speed, 7) * 2.2;
  const sw = Math.sin(t * f) * Math.min(0.35 + speed * 0.09, 0.95);
  p.lleg.rotation.x = sw;
  p.rleg.rotation.x = -sw;
  p.larm.rotation.x = -sw * 0.85;
  p.rarm.rotation.x = sw * 0.85;
  p.torso.rotation.x = Math.min(speed * 0.018, 0.14);
  const bob = Math.abs(Math.sin(t * f)) * Math.min(speed * 0.012, 0.05);
  p.torso.position.y = 1.22 + bob;
  p.head.position.y = 1.68 + bob;
  p.hair.position.y = 1.85 + bob;
  p.face.position.y = 1.66 + bob;

  if (punchT > 0) {
    const k = Math.sin(Math.min(punchT, 1) * Math.PI);
    p.rarm.rotation.x = -1.6 * k;
    p.rarm.rotation.z = 0.3 * k;
  } else {
    p.rarm.rotation.z = 0;
  }
  if (state === 'aim') {
    p.rarm.rotation.x = -1.5; p.rarm.rotation.z = 0;
    p.larm.rotation.x = -1.2;
  }
  if (state === 'sit') {
    p.lleg.rotation.x = -1.35; p.rleg.rotation.x = -1.35;
    p.larm.rotation.x = -1.0; p.rarm.rotation.x = -1.0;
  }
}

export function randomPedColors() {
  return { skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS) };
}

export { shared };
