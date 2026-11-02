// Procedural low-poly 3D models for all 32 cards, the towers and the spells.
// Every model faces +Z, stands on y = 0 and owns its animation:
//
//   const m = buildCardModel(cardId, teamColor)   // teamColor = null for portraits
//   m.root                                        // THREE.Group to add to the scene
//   m.animate({ t, dt, moving, attack, stunned }) // attack = 0..1 during a hit, -1 otherwise
//   m.height                                      // where to put the health bar
//
// Each body type (humanoid, mech, drone, worm, spider, serpent, blimp…) has its own walk / idle /
// attack cycle, and cards add flourishes (spinning rotors, swaying hydra heads, flapping wings…).

import * as THREE from 'three';

// ── Material & mesh helpers ────────────────────────────────────────────────
const matCache = new Map();
// Cartoon look: 3-band toon shading (shadow / mid / light) instead of realistic shading.
let toonRamp = null;
function ramp() {
  if (!toonRamp) {
    const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
    toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.needsUpdate = true;
  }
  return toonRamp;
}

export function mat(color, { opacity = 1, emissive = 0 } = {}) {
  const key = `${color}|${opacity}|${emissive}`;
  if (!matCache.has(key)) {
    const m = new THREE.MeshToonMaterial({
      color, gradientMap: ramp(),
      transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
      emissive: emissive ? color : 0x000000, emissiveIntensity: emissive,
    });
    m.userData.cached = true;
    matCache.set(key, m);
  }
  return matCache.get(key);
}

// Black "inverted hull" outlines: a slightly bigger back-face copy of each solid mesh.
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x14141f, side: THREE.BackSide });
outlineMat.userData.cached = true;
export function addOutlines(root, width = 0.035) {
  const targets = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.outline && !o.userData.noOutline && o.material && !o.material.transparent && o.geometry.type !== 'RingGeometry' && o.geometry.type !== 'CircleGeometry') targets.push(o);
  });
  for (const o of targets) {
    o.geometry.computeBoundingSphere();
    const r = Math.max(0.02, o.geometry.boundingSphere.radius);
    const hull = new THREE.Mesh(o.geometry, outlineMat);
    hull.scale.setScalar(Math.min(1.45, 1 + width / r));
    hull.userData.outline = true;
    hull.castShadow = false;
    o.add(hull);
  }
  return root;
}

function mesh(geo, m) {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = true;
  return o;
}
const box = (w, h, d, m) => mesh(new THREE.BoxGeometry(w, h, d), m);
const sphere = (r, m, ws = 16, hs = 12) => mesh(new THREE.SphereGeometry(Math.max(r, 0.001), Math.max(ws, 10), Math.max(hs, 8)), m);
const capsule = (r, len, m) => mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m);
const cyl = (rt, rb, h, m, seg = 10) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const cone = (r, h, m, seg = 8) => mesh(new THREE.ConeGeometry(r, h, seg), m);
const torus = (r, t, m, arc = Math.PI * 2) => mesh(new THREE.TorusGeometry(r, t, 6, 18, arc), m);
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const rot = (o, axis, v) => { o.rotation[axis] = v; return o; };
const group = (...children) => { const g = new THREE.Group(); children.forEach((c) => c && g.add(c)); return g; };
const darken = (c, k = 0.6) => new THREE.Color(c).multiplyScalar(k).getHex();
const SKIN_DARK = 0x111827;

/** Simple pivot: a group at (x,y,z) whose children hang from it. */
function pivot(x, y, z, ...children) { return at(group(...children), x, y, z); }

// Smooth 0→1→0 pulse for attacks.
const swing = (a) => (a < 0 ? 0 : Math.sin(a * Math.PI));

// ── Card descriptors ───────────────────────────────────────────────────────
const D = {
  // Neo-Cyber
  nc_glitch_runner:   { type: 'humanoid', build: 'slim', skin: 0x67e8f9, cloth: 0x1e1b4b, accent: 0xe879f9, visor: true, scale: 0.9, run: 1.6, trail: true },
  nc_drone_swarm:     { type: 'drone', body: 0x334155, accent: 0x22d3ee, scale: 0.6 },
  nc_holo_decoy:      { type: 'humanoid', skin: 0x67e8f9, cloth: 0x22d3ee, accent: 0xffffff, ghost: true, scale: 0.9, flicker: true },
  nc_firewall:        { type: 'pylon', body: 0x1e293b, accent: 0x22d3ee },
  nc_data_lancer:     { type: 'humanoid', skin: 0xfde68a, cloth: 0x0e7490, accent: 0xfacc15, weapon: 'lance', visor: true },
  nc_emp_pulse:       { type: 'spell', look: 'emp', color: 0x22d3ee },
  nc_mech_titan:      { type: 'mech', body: 0x475569, accent: 0x22d3ee, scale: 1.55, shield: true },
  nc_netrunner_queen: { type: 'humanoid', skin: 0xf5d0fe, cloth: 0x581c87, accent: 0xe879f9, crown: true, cape: true, weapon: 'staff', visor: true, float: true },
  // Bio-Mutant
  bm_spore_crawler:   { type: 'worm', body: 0x84cc16, accent: 0xfacc15, segments: 5, scale: 0.85 },
  bm_acid_spitter:    { type: 'quadruped', body: 0x65a30d, accent: 0xd9f99d, scale: 0.95, spit: true },
  bm_brute:           { type: 'humanoid', build: 'broad', skin: 0x4d7c0f, cloth: 0x365314, accent: 0xa3e635, scale: 1.35, horns: true, fists: true },
  bm_toxic_cloud:     { type: 'spell', look: 'cloud', color: 0x84cc16 },
  bm_hive_nest:       { type: 'mound', body: 0x854d0e, accent: 0xfacc15 },
  bm_leech:           { type: 'worm', body: 0xb91c1c, accent: 0xfca5a5, segments: 4, scale: 0.7, fangs: true },
  bm_hydra:           { type: 'serpent', body: 0x15803d, accent: 0xbef264, heads: 3, scale: 1.2 },
  bm_brood_mother:    { type: 'spider', body: 0x3f3f46, accent: 0x84cc16, scale: 1.25, sac: true },
  // Steam-Punk
  sp_cog_soldier:      { type: 'humanoid', skin: 0xfcd5b5, cloth: 0x92400e, accent: 0xfbbf24, helmet: true, weapon: 'sword', shield: true, cog: true },
  sp_rivet_gunner:     { type: 'humanoid', skin: 0xfcd5b5, cloth: 0x78350f, accent: 0xd97706, weapon: 'gun', goggles: true, recoil: true },
  sp_boiler_bomb:      { type: 'spell', look: 'bomb', color: 0x334155 },
  sp_pressure_turret:  { type: 'turret', body: 0x78350f, accent: 0xf59e0b },
  sp_sky_zeppelin:     { type: 'blimp', body: 0xb45309, accent: 0xfbbf24, scale: 1.25 },
  sp_clockwork_knight: { type: 'humanoid', skin: 0xd6d3d1, cloth: 0xa16207, accent: 0xfde047, helmet: true, weapon: 'sword', shield: true, clock: true, plume: true },
  sp_ironclad_walker:  { type: 'mech', body: 0x78350f, accent: 0xf59e0b, scale: 1.9, chimney: true },
  sp_mad_inventor:     { type: 'humanoid', skin: 0xfcd5b5, cloth: 0x3f3f46, accent: 0xf59e0b, tophat: true, goggles: true, weapon: 'wrench', backpack: true },
  // Cosmic Mythos
  cm_star_sprite:    { type: 'sprite', body: 0xfde047, accent: 0xa78bfa, scale: 0.75 },
  cm_void_wraith:    { type: 'wraith', body: 0x312e81, accent: 0xa78bfa },
  cm_moon_oracle:    { type: 'humanoid', skin: 0xe0e7ff, cloth: 0x4c1d95, accent: 0xfde047, robe: true, halo: 'moon', weapon: 'staff', float: true },
  cm_comet_strike:   { type: 'spell', look: 'comet', color: 0xf97316 },
  cm_nebula_gate:    { type: 'portal', body: 0x4c1d95, accent: 0xc084fc },
  cm_astral_serpent: { type: 'serpent', body: 0x7c3aed, accent: 0xfde047, heads: 1, wings: true, scale: 1.2 },
  cm_solar_titan:    { type: 'humanoid', build: 'broad', skin: 0xfbbf24, cloth: 0xb45309, accent: 0xfef08a, scale: 1.65, halo: 'sun', glow: true, fists: true },
  cm_singularity:    { type: 'spell', look: 'hole', color: 0x1e1b4b },
};

export const isAirModel = (id) => ['drone', 'blimp', 'sprite'].includes(D[id]?.type) || id === 'cm_astral_serpent';

export function buildCardModel(cardId, team = null) {
  const d = D[cardId];
  const builder = BUILDERS[d.type];
  const m = builder(d, team);
  const s = d.scale ?? 1;
  m.root.scale.setScalar(s);
  m.height = (m.height ?? 1.3) * s;
  addOutlines(m.root, 0.03 / s);
  return m;
}

/** Team ring under a unit (blue / red). */
function teamRing(team, r = 0.45) {
  if (team == null) return null;
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r, 24), new THREE.MeshBasicMaterial({ color: team, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  return ring;
}

// ── HUMANOID ───────────────────────────────────────────────────────────────
function humanoid(d, team) {
  const broad = d.build === 'broad', slim = d.build === 'slim';
  const bw = broad ? 0.62 : slim ? 0.38 : 0.46;
  const op = d.ghost ? 0.55 : 1;
  const skinM = mat(d.skin, { opacity: op, emissive: d.glow ? 0.6 : d.ghost ? 0.4 : 0 });
  const clothM = mat(d.cloth, { opacity: op });
  const clothDark = mat(darken(d.cloth), { opacity: op });
  const accentM = mat(d.accent, { opacity: op, metal: 0.3, emissive: d.visor || d.glow ? 0.25 : 0 });
  const metalM = mat(0xcbd5e1, { metal: 0.7, rough: 0.3 });
  const teamM = team != null ? mat(team) : accentM;

  const body = group();       // bobs while walking
  const legs = [], arms = [];

  if (d.robe) {
    body.add(at(cyl(bw * 0.35, bw * 0.75, 0.9, clothM, 10), 0, 0.45, 0));
    body.add(at(cyl(bw * 0.77, bw * 0.77, 0.06, accentM, 10), 0, 0.04, 0));
  } else {
    for (const sx of [-1, 1]) {
      const leg = pivot(sx * bw * 0.27, 0.5, 0,
        at(capsule(bw * 0.16, 0.22, clothDark), 0, -0.22, 0),
        at(box(bw * 0.38, 0.12, 0.34, accentM), 0, -0.45, 0.05));
      legs.push(leg);
      body.add(leg);
    }
  }
  const torsoD = broad ? 0.42 : 0.3;
  body.add(at(box(bw, 0.5, torsoD, clothM), 0, 0.76, 0));
  body.add(at(box(bw + 0.03, 0.08, torsoD + 0.03, teamM), 0, 0.54, 0));               // belt (team colour)
  if (broad) body.add(at(box(bw * 1.25, 0.18, torsoD * 1.1, clothDark), 0, 0.98, 0));  // shoulders
  if (d.clock) body.add(rot(at(cyl(0.13, 0.13, 0.04, accentM, 12), 0, 0.8, torsoD / 2 + 0.01), 'x', Math.PI / 2));
  if (d.cog) {
    const cog = at(torus(0.1, 0.035, accentM), 0, 0.8, torsoD / 2 + 0.02);
    body.add(cog);
  }
  if (d.cape) {
    const cape = at(box(bw * 0.95, 0.75, 0.04, accentM), 0, 0.62, -torsoD / 2 - 0.04);
    cape.rotation.x = 0.12;
    body.add(cape);
    body.userData.cape = cape;
  }
  if (d.backpack) {
    body.add(at(box(0.32, 0.34, 0.18, mat(0x57534e)), 0, 0.8, -torsoD / 2 - 0.09));
    body.add(at(cyl(0.05, 0.05, 0.3, metalM), 0.1, 1.05, -torsoD / 2 - 0.1));
  }

  // Head
  const hr = broad ? 0.32 : 0.29;                       // big cartoon head
  const head = pivot(0, 1.22 + hr * 0.55, 0, sphere(hr, skinM));
  const eyeM = mat(SKIN_DARK), whiteM = mat(0xffffff);
  for (const sx of [-1, 1]) {
    const eye = at(sphere(hr * 0.24, whiteM), sx * hr * 0.36, hr * 0.08, hr * 0.8);
    eye.scale.set(0.85, 1.1, 0.6);
    eye.add(at(sphere(hr * 0.13, eyeM), 0, -hr * 0.02, hr * 0.17));
    head.add(eye);
    const brow = at(box(hr * 0.4, hr * 0.08, 0.04, mat(darken(d.skin, 0.4))), sx * hr * 0.36, hr * 0.38, hr * 0.86);
    brow.rotation.z = sx * 0.18;
    head.add(brow);
  }
  if (d.visor) head.add(at(box(hr * 1.6, 0.07, 0.06, mat(d.accent, { emissive: 0.9 })), 0, 0.03, hr * 0.85));
  if (d.goggles) for (const sx of [-1, 1]) head.add(at(torus(0.05, 0.02, metalM), sx * 0.08, 0.05, hr * 0.92));
  if (d.helmet) {
    const helm = mesh(new THREE.SphereGeometry(hr * 1.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), metalM);
    head.add(at(helm, 0, 0.02, 0));
    if (d.plume) head.add(at(box(0.05, 0.16, hr * 1.8, mat(d.accent)), 0, hr + 0.06, -0.02));
  }
  if (d.crown) {
    const crown = group(at(cyl(hr * 0.75, hr * 0.8, 0.09, mat(0xfacc15, { metal: 0.8, rough: 0.3 })), 0, 0, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      crown.add(at(cone(0.04, 0.12, mat(0xfacc15, { metal: 0.8 })), Math.sin(a) * hr * 0.7, 0.09, Math.cos(a) * hr * 0.7));
    }
    head.add(at(crown, 0, hr * 0.9, 0));
  }
  if (d.tophat) {
    head.add(at(cyl(hr * 1.3, hr * 1.3, 0.04, mat(0x1c1917)), 0, hr * 0.75, 0));
    head.add(at(cyl(hr * 0.8, hr * 0.85, 0.32, mat(0x1c1917)), 0, hr * 0.75 + 0.17, 0));
    head.add(at(cyl(hr * 0.86, hr * 0.86, 0.06, accentM), 0, hr * 0.75 + 0.06, 0));
  }
  if (d.horns) for (const sx of [-1, 1]) {
    const h = at(cone(0.06, 0.2, mat(0xfef3c7)), sx * hr * 0.75, hr * 0.6, 0);
    h.rotation.z = -sx * 0.6;
    head.add(h);
  }
  body.add(head);

  if (d.halo) {
    const haloM = mat(d.accent, { emissive: 1 });
    const halo = d.halo === 'moon' ? torus(0.26, 0.04, haloM, Math.PI * 1.4) : torus(0.32, 0.035, haloM);
    if (d.halo === 'sun') for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ray = at(cone(0.04, 0.16, haloM, 4), Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0);
      ray.rotation.z = a - Math.PI / 2;
      halo.add(ray);
    }
    at(halo, 0, 1.5, -0.25);
    body.add(halo);
    body.userData.halo = halo;
  }

  // Arms (pivot at the shoulder)
  for (const sx of [-1, 1]) {
    const thick = broad ? 0.2 : 0.13;
    const arm = pivot(sx * (bw / 2 + thick / 2 + 0.01), 0.97, 0,
      at(capsule(thick * 0.5, 0.3, clothM), 0, -0.2, 0),
      at(sphere(d.fists ? 0.15 : 0.09, skinM), 0, -0.45, 0));
    arms.push(arm);
    body.add(arm);
  }
  // Weapon in the right hand, shield on the left
  const hand = group();
  at(hand, 0, -0.45, 0);
  arms[1].add(hand);
  if (d.weapon === 'sword') {
    hand.add(rot(at(box(0.05, 0.62, 0.12, metalM), 0, 0, 0.31), 'x', Math.PI / 2));
    hand.add(at(box(0.22, 0.04, 0.05, accentM), 0, 0, 0.04));
  } else if (d.weapon === 'lance') {
    const lance = at(cyl(0.03, 0.03, 1.2, metalM, 6), 0, 0, 0.4);
    lance.rotation.x = Math.PI / 2;
    hand.add(lance);
    const tip = at(cone(0.07, 0.25, mat(d.accent, { emissive: 1 }), 6), 0, 0, 1.05);
    tip.rotation.x = Math.PI / 2;
    hand.add(tip);
  } else if (d.weapon === 'gun') {
    hand.add(at(box(0.14, 0.14, 0.32, mat(0x44403c, { metal: 0.6 })), 0, 0, 0.12));
    const barrel = at(cyl(0.05, 0.05, 0.42, metalM, 8), 0, 0.02, 0.42);
    barrel.rotation.x = Math.PI / 2;
    hand.add(barrel);
    hand.userData.muzzle = at(sphere(0.08, mat(0xfde047, { emissive: 1 })), 0, 0.02, 0.66);
    hand.userData.muzzle.visible = false;
    hand.add(hand.userData.muzzle);
  } else if (d.weapon === 'staff') {
    hand.add(at(cyl(0.025, 0.025, 1.05, mat(0x78350f), 6), 0, 0.25, 0.05));
    const orb = at(sphere(0.1, mat(d.accent, { emissive: 1 })), 0, 0.82, 0.05);
    hand.add(orb);
    hand.userData.orb = orb;
  } else if (d.weapon === 'wrench') {
    hand.add(at(box(0.05, 0.42, 0.06, metalM), 0, -0.05, 0.14));
    hand.add(at(torus(0.07, 0.025, metalM, Math.PI * 1.5), 0, 0.18, 0.14));
  }
  if (d.shield) {
    const sh = at(cyl(0.24, 0.24, 0.05, accentM, 12), 0, -0.3, 0.12);
    sh.rotation.x = Math.PI / 2;
    sh.add(at(cyl(0.08, 0.08, 0.06, metalM, 8), 0, -0.02, 0));
    arms[0].add(sh);
  }

  // Afterimage trail (Glitch Runner)
  let trail = null;
  if (d.trail) {
    trail = group(at(box(bw, 0.9, 0.05, mat(d.accent, { opacity: 0.35, emissive: 0.8 })), 0, 0.7, 0));
    trail.visible = false;
    body.add(trail);
  }

  const root = group(teamRing(team), body);
  const speed = d.run ?? 1;
  let flickerT = 0;
  return {
    root,
    height: 1.95,
    animate({ t, moving, attack, stunned }) {
      const s = stunned ? 0 : 1;
      const w = moving ? t * 9 * speed : 0;
      const legSwing = moving ? Math.sin(w) * 0.7 : 0;
      legs.forEach((l, i) => { l.rotation.x = (i ? -legSwing : legSwing) * s; });
      body.position.y = (moving ? Math.abs(Math.sin(w)) * 0.06 : Math.sin(t * 2) * 0.015) + (d.float ? 0.12 + Math.sin(t * 2.2) * 0.06 : 0);
      body.rotation.x = moving ? 0.08 * speed : 0;
      // Arms: walk swing, then a weapon-specific attack.
      const a = swing(attack);
      arms[0].rotation.x = -legSwing * 0.8 * s;
      arms[1].rotation.x = legSwing * 0.8 * s;
      if (attack >= 0) {
        if (d.weapon === 'gun') {
          arms[1].rotation.x = -Math.PI / 2;
          arms[0].rotation.x = -Math.PI / 2.4;
          body.position.z = d.recoil ? -a * 0.08 : 0;
          hand.userData.muzzle.visible = attack < 0.35;
        } else if (d.weapon === 'staff') {
          arms[1].rotation.x = -a * 2.2;
          hand.userData.orb.scale.setScalar(1 + a * 1.2);
        } else if (d.weapon === 'lance') {
          arms[1].rotation.x = -Math.PI / 2;
          hand.position.z = a * 0.35;
        } else if (d.fists) {
          // Double overhead slam
          arms[0].rotation.x = arms[1].rotation.x = -Math.PI * 0.9 * (attack < 0.5 ? attack * 2 : 1) + (attack > 0.5 ? (attack - 0.5) * 2 * Math.PI * 0.9 : 0);
          body.rotation.x = attack > 0.5 ? 0.25 : -0.1;
        } else {
          // Overhead sword / wrench chop
          arms[1].rotation.x = attack < 0.4 ? -attack / 0.4 * 2.6 : -2.6 + ((attack - 0.4) / 0.6) * 3.4;
          body.rotation.y = -a * 0.3;
        }
      } else {
        if (hand.userData.muzzle) hand.userData.muzzle.visible = false;
        if (hand.userData.orb) hand.userData.orb.scale.setScalar(1 + Math.sin(t * 4) * 0.1);
        hand.position.z = 0;
        body.position.z = 0;
        body.rotation.y = 0;
      }
      head.rotation.y = !moving && attack < 0 ? Math.sin(t * 0.8) * 0.3 : 0;
      if (body.userData.cape) body.userData.cape.rotation.x = 0.12 + (moving ? 0.35 + Math.sin(w * 2) * 0.08 : Math.sin(t * 1.5) * 0.04);
      if (body.userData.halo) body.userData.halo.rotation.z = t * (d.halo === 'sun' ? 0.8 : 0.3);
      if (trail) {
        trail.visible = moving;
        trail.position.z = -0.35 - Math.abs(Math.sin(w)) * 0.1;
      }
      if (d.flicker) {
        flickerT += 1;
        root.visible = Math.sin(t * 23) > -0.92;
      }
      if (stunned) body.rotation.z = Math.sin(t * 20) * 0.08; else body.rotation.z = 0;
    },
  };
}

// ── MECH (Mech Titan, Ironclad Walker) ─────────────────────────────────────
function mech(d, team) {
  const bodyM = mat(d.body, { metal: 0.6, rough: 0.4 });
  const darkM = mat(darken(d.body, 0.55), { metal: 0.5 });
  const glowM = mat(d.accent, { emissive: 1 });
  const legs = [];
  const hull = group();
  for (const sx of [-1, 1]) {
    const leg = pivot(sx * 0.3, 0.62, 0,
      at(box(0.22, 0.34, 0.22, darkM), 0, -0.15, 0),
      at(box(0.2, 0.3, 0.2, bodyM), 0, -0.42, 0.04),
      at(box(0.32, 0.08, 0.42, darkM), 0, -0.58, 0.06));
    legs.push(leg);
    hull.add(leg);
  }
  const torso = group(
    at(box(0.86, 0.55, 0.62, bodyM), 0, 0, 0),
    at(box(0.5, 0.18, 0.06, glowM), 0, 0.08, 0.32),                       // visor slit
    at(box(1.08, 0.18, 0.5, darkM), 0, 0.26, 0),                           // shoulders
    team != null && at(box(0.88, 0.07, 0.64, mat(team)), 0, -0.22, 0),
  );
  at(torso, 0, 0.98, 0);
  hull.add(torso);
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = pivot(sx * 0.6, 1.08, 0,
      at(box(0.24, 0.5, 0.24, darkM), 0, -0.22, 0),
      at(cyl(0.09, 0.11, 0.4, bodyM, 8), 0, -0.48, 0.12));
    arm.children[1].rotation.x = Math.PI / 2;
    arms.push(arm);
    torso.parent.add(arm);
  }
  if (d.shield) {
    const dome = mesh(new THREE.SphereGeometry(1.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(d.accent, { opacity: 0.18, emissive: 0.6 }));
    dome.castShadow = false;
    hull.add(dome);
    hull.userData.dome = dome;
  }
  const smoke = [];
  if (d.chimney) {
    for (const sx of [-0.22, 0.22]) {
      torso.add(at(cyl(0.07, 0.09, 0.45, darkM, 8), sx, 0.45, -0.18));
      const puff = at(sphere(0.1, mat(0xd6d3d1, { opacity: 0.55 })), sx, 0.75, -0.18);
      puff.castShadow = false;
      smoke.push(puff);
      torso.add(puff);
    }
  }
  const root = group(teamRing(team, 0.6), hull);
  return {
    root,
    height: 1.55,
    animate({ t, moving, attack, stunned }) {
      const w = moving && !stunned ? t * 5 : 0;
      legs[0].rotation.x = Math.sin(w) * 0.45;
      legs[1].rotation.x = -Math.sin(w) * 0.45;
      hull.position.y = moving ? Math.abs(Math.cos(w)) * 0.05 : 0;
      torso.rotation.z = moving ? Math.sin(w) * 0.05 : 0;          // heavy side sway
      torso.rotation.y = !moving ? Math.sin(t * 0.6) * 0.15 : 0;   // scanning
      const a = swing(attack);
      arms[0].rotation.x = attack >= 0 ? -1.3 - a * 0.4 : Math.sin(w) * -0.3;
      arms[1].rotation.x = attack >= 0 ? -1.3 - a * 0.4 : Math.sin(w) * 0.3;
      hull.position.z = -a * 0.1;
      if (hull.userData.dome) hull.userData.dome.material.opacity = 0.12 + Math.sin(t * 3) * 0.05;
      smoke.forEach((p, i) => {
        const k = (t * 0.9 + i * 0.5) % 1;
        p.position.y = 0.6 + k * 0.7;
        p.scale.setScalar(0.6 + k * 1.6);
        p.material.opacity = 0.55 * (1 - k);
      });
    },
  };
}

// ── DRONE (Drone Swarm) ────────────────────────────────────────────────────
function drone(d, team) {
  const bodyM = mat(d.body, { metal: 0.6, rough: 0.35 });
  const craft = group(at(cyl(0.32, 0.38, 0.16, bodyM, 12), 0, 0, 0), at(sphere(0.12, mat(d.accent, { emissive: 1 })), 0, -0.02, 0.32));
  const rotors = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    craft.add(rot(at(box(0.05, 0.04, 0.4, bodyM), Math.sin(a) * 0.35, 0.04, Math.cos(a) * 0.35), 'y', a));
    const rotor = at(group(box(0.4, 0.015, 0.06, mat(0xe2e8f0, { opacity: 0.7 })), box(0.06, 0.015, 0.4, mat(0xe2e8f0, { opacity: 0.7 }))), Math.sin(a) * 0.52, 0.1, Math.cos(a) * 0.52);
    rotors.push(rotor);
    craft.add(rotor);
  }
  if (team != null) craft.add(at(cyl(0.39, 0.39, 0.05, mat(team), 12), 0, -0.06, 0));
  at(craft, 0, 1.6, 0);
  const shadowRing = teamRing(team, 0.4);
  return {
    root: group(shadowRing, craft),
    height: 2,
    animate({ t, moving, attack }) {
      rotors.forEach((r, i) => { r.rotation.y = t * 30 + i; });
      craft.position.y = 1.6 + Math.sin(t * 3 + craft.id) * 0.1;
      craft.rotation.x = moving ? 0.25 : 0;
      craft.rotation.z = Math.sin(t * 2) * 0.08;
      if (attack >= 0) craft.rotation.x = -0.3 * swing(attack);
    },
  };
}

// ── WORM (Spore Crawler, Blood Leech) ──────────────────────────────────────
function worm(d, team) {
  const segs = [];
  const bodyM = mat(d.body), spotM = mat(d.accent, { emissive: 0.2 });
  const root = group(teamRing(team));
  for (let i = 0; i < d.segments; i++) {
    const r = 0.26 - i * 0.03;
    const seg = at(sphere(r, bodyM, 10, 8), 0, r, -i * 0.3);
    if (i % 2 === 0) seg.add(at(sphere(r * 0.35, spotM, 6, 5), 0, r * 0.8, 0));
    segs.push(seg);
    root.add(seg);
  }
  const head = segs[0];
  for (const sx of [-1, 1]) {
    head.add(at(sphere(0.05, mat(SKIN_DARK), 6, 5), sx * 0.1, 0.1, 0.2));
    const mandible = at(cone(0.04, d.fangs ? 0.22 : 0.14, mat(0xfef3c7), 5), sx * 0.09, -0.05, 0.25);
    mandible.rotation.x = Math.PI / 2;
    head.add(mandible);
    head.userData[sx] = mandible;
  }
  // Pull back so the model is centred on its origin.
  segs.forEach((s) => { s.position.z += (d.segments - 1) * 0.15; });
  return {
    root,
    height: 0.9,
    animate({ t, moving, attack }) {
      const k = moving ? 10 : 2.5;
      segs.forEach((s, i) => {
        s.position.x = Math.sin(t * k - i * 0.9) * (moving ? 0.09 : 0.03);
        s.position.y = (0.26 - i * 0.03) + Math.max(0, Math.sin(t * k - i * 0.9)) * (moving ? 0.08 : 0.02);
      });
      const a = swing(attack);
      head.position.z = (d.segments - 1) * 0.15 + a * 0.25;
      head.rotation.x = -a * 0.5;
      head.userData[-1].rotation.y = 0.4 * a + Math.sin(t * 8) * 0.1;
      head.userData[1].rotation.y = -0.4 * a - Math.sin(t * 8) * 0.1;
    },
  };
}

// ── QUADRUPED (Acid Spitter) ───────────────────────────────────────────────
function quadruped(d, team) {
  const bodyM = mat(d.body), bellyM = mat(d.accent), darkM = mat(darken(d.body));
  const torso = group(at(sphere(0.32, bodyM), 0, 0, 0), at(sphere(0.24, bellyM), 0, -0.08, 0.05));
  torso.children[0].scale.set(0.9, 0.7, 1.5);
  torso.children[1].scale.set(0.8, 0.5, 1.4);
  for (let i = 0; i < 4; i++) torso.add(at(cone(0.06, 0.16, bellyM, 4), 0, 0.22, -0.3 + i * 0.18));
  at(torso, 0, 0.42, 0);
  const legs = [];
  for (const [x, z] of [[-0.24, 0.3], [0.24, 0.3], [-0.24, -0.3], [0.24, -0.3]]) {
    const leg = pivot(x, 0.38, z, at(box(0.1, 0.36, 0.1, darkM), 0, -0.17, 0), at(box(0.16, 0.05, 0.2, darkM), 0, -0.36, 0.05));
    legs.push(leg);
  }
  const head = pivot(0, 0.5, 0.48, sphere(0.2, bodyM));
  head.children[0].scale.set(1, 0.8, 1.3);
  const jaw = pivot(0, -0.06, 0.05, at(box(0.24, 0.06, 0.3, bellyM), 0, 0, 0.1));
  head.add(jaw);
  for (const sx of [-1, 1]) head.add(at(sphere(0.05, mat(0xfde047, { emissive: 0.6 }), 6, 5), sx * 0.13, 0.08, 0.12));
  const tail = pivot(0, 0.45, -0.5, at(cone(0.12, 0.6, bodyM, 6), 0, 0, -0.28));
  tail.children[0].rotation.x = -Math.PI / 2;
  const drip = at(sphere(0.06, mat(0xa3e635, { emissive: 0.8 }), 6, 5), 0, -0.12, 0.3);
  head.add(drip);
  return {
    root: group(teamRing(team, 0.5), torso, head, tail, ...legs),
    height: 1,
    animate({ t, moving, attack }) {
      const w = moving ? t * 10 : 0;
      legs.forEach((l, i) => { l.rotation.x = Math.sin(w + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6; });
      tail.rotation.y = Math.sin(t * (moving ? 10 : 3)) * 0.45;
      torso.rotation.z = moving ? Math.sin(w) * 0.06 : 0;
      const a = swing(attack);
      head.rotation.x = -a * 0.5;
      jaw.rotation.x = a * 0.7 + (attack < 0 ? Math.max(0, Math.sin(t * 1.3)) * 0.15 : 0);
      drip.position.y = -0.12 - ((t * 0.8) % 1) * 0.25;
      drip.visible = attack < 0;
    },
  };
}

// ── SPIDER (Brood Mother) ──────────────────────────────────────────────────
function spider(d, team) {
  const bodyM = mat(d.body), accM = mat(d.accent, { emissive: 0.5 });
  const abdomen = at(sphere(0.42, bodyM), 0, 0.55, -0.35);
  abdomen.scale.set(1, 0.85, 1.15);
  if (d.sac) for (let i = 0; i < 5; i++) abdomen.add(at(sphere(0.09, accM, 6, 5), Math.sin(i * 1.3) * 0.25, 0.3 + (i % 2) * 0.05, Math.cos(i * 1.3) * 0.25));
  const thorax = at(sphere(0.26, bodyM), 0, 0.5, 0.18);
  for (let i = 0; i < 4; i++) thorax.add(at(sphere(0.045, mat(0xef4444, { emissive: 1 }), 6, 5), (i - 1.5) * 0.08, 0.1 + (i % 2) * 0.05, 0.22));
  const legs = [];
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    const leg = pivot(sx * 0.18, 0.5, 0.3 - i * 0.16);
    const upper = at(box(0.5, 0.05, 0.05, bodyM), sx * 0.25, 0.12, 0);
    upper.rotation.z = sx * 0.5;
    const lower = at(box(0.05, 0.55, 0.05, bodyM), sx * 0.48, -0.15, 0);
    lower.rotation.z = -sx * 0.25;
    leg.add(upper, lower);
    leg.rotation.y = sx * (i - 1.5) * -0.35;
    leg.userData.base = leg.rotation.y;
    legs.push(leg);
  }
  const fangs = [-1, 1].map((sx) => {
    const f = at(cone(0.04, 0.16, mat(0xfef3c7), 5), sx * 0.07, 0.38, 0.38);
    f.rotation.x = Math.PI;
    return f;
  });
  return {
    root: group(teamRing(team, 0.65), abdomen, thorax, ...legs, ...fangs),
    height: 1.3,
    animate({ t, moving, attack }) {
      const w = moving ? t * 12 : t * 1.5;
      legs.forEach((l, i) => {
        l.rotation.y = l.userData.base + Math.sin(w + i * 1.7) * (moving ? 0.25 : 0.04);
        l.position.y = 0.5 + Math.max(0, Math.sin(w + i * 1.7)) * (moving ? 0.08 : 0);
      });
      abdomen.scale.y = 0.85 + Math.sin(t * 2) * 0.04;      // breathing
      const a = swing(attack);
      thorax.position.z = 0.18 + a * 0.15;
      fangs.forEach((f, i) => { f.rotation.z = (i ? -1 : 1) * a * 0.6; f.position.z = 0.38 + a * 0.15; });
    },
  };
}

// ── SERPENT (Swamp Hydra, Astral Serpent) ──────────────────────────────────
function serpent(d, team) {
  const bodyM = mat(d.body), bellyM = mat(d.accent, { emissive: d.wings ? 0.4 : 0 });
  const coil = group();
  for (let i = 0; i < 6; i++) {
    const s = at(sphere(0.3 - i * 0.03, bodyM, 10, 8), Math.sin(i * 1.1) * 0.25, 0.25, -i * 0.22);
    coil.add(s);
  }
  const necks = [];
  for (let h = 0; h < d.heads; h++) {
    const off = d.heads === 1 ? 0 : (h - (d.heads - 1) / 2) * 0.38;
    const neck = pivot(off, 0.35, 0.15);
    for (let k = 0; k < 4; k++) neck.add(at(sphere(0.15 - k * 0.012, bodyM, 8, 6), 0, k * 0.2, k * 0.06));
    const head = pivot(0, 0.86, 0.3, sphere(0.19, bodyM));
    head.children[0].scale.set(0.9, 0.75, 1.4);
    const jaw = pivot(0, -0.06, 0.05, at(box(0.2, 0.05, 0.3, bellyM), 0, 0, 0.12));
    head.add(jaw);
    for (const sx of [-1, 1]) head.add(at(sphere(0.04, mat(0xfde047, { emissive: 1 }), 6, 5), sx * 0.1, 0.08, 0.14));
    if (d.wings) for (const sx of [-1, 1]) head.add(rot(at(cone(0.04, 0.2, bellyM, 4), sx * 0.08, 0.16, -0.08), 'x', -0.6));
    neck.add(head);
    neck.userData = { head, jaw, phase: h * 1.3 };
    necks.push(neck);
  }
  const wings = [];
  if (d.wings) for (const sx of [-1, 1]) {
    const wing = pivot(sx * 0.2, 0.5, -0.1);
    const membrane = at(box(0.9, 0.03, 0.5, mat(d.accent, { opacity: 0.75, emissive: 0.5 })), sx * 0.45, 0, 0);
    wing.add(membrane, at(box(0.95, 0.06, 0.06, bodyM), sx * 0.47, 0.02, 0.24));
    wings.push(wing);
  }
  const body = group(coil, ...necks, ...wings);
  if (d.wings) at(body, 0, 1.3, 0);
  return {
    root: group(teamRing(team, 0.6), body),
    height: d.wings ? 2.5 : 1.4,
    animate({ t, moving, attack }) {
      coil.children.forEach((s, i) => { s.position.x = Math.sin(i * 1.1 + t * (moving ? 6 : 1.5)) * 0.25; });
      necks.forEach((n) => {
        const p = n.userData.phase;
        n.rotation.z = Math.sin(t * 1.6 + p) * 0.18;
        n.rotation.x = Math.sin(t * 1.2 + p) * 0.08;
        const a = attack >= 0 ? swing((attack + p * 0.15) % 1) : 0;
        n.rotation.x += a * 0.6;
        n.userData.jaw.rotation.x = a * 0.8 + Math.max(0, Math.sin(t * 0.9 + p)) * 0.12;
      });
      wings.forEach((wg, i) => { wg.rotation.z = (i ? -1 : 1) * Math.sin(t * 5) * 0.5; });
      if (d.wings) body.position.y = 1.3 + Math.sin(t * 2.5) * 0.12;
    },
  };
}

// ── BLIMP (Sky Zeppelin) ───────────────────────────────────────────────────
function blimp(d, team) {
  const envelopeM = mat(d.body), accM = mat(d.accent, { metal: 0.5 });
  const env = sphere(0.55, envelopeM, 14, 10);
  env.scale.set(0.9, 0.85, 1.8);
  const craft = group(env);
  for (let i = -1; i <= 1; i++) craft.add(rot(at(torus(0.5, 0.025, accM), 0, 0, i * 0.45), 'y', 0));
  for (const [rx, rz] of [[0, 0], [0, Math.PI / 2]]) {
    const fin = at(box(0.04, 0.5, 0.35, accM), 0, 0, -0.95);
    fin.rotation.z = rz;
    craft.add(fin);
  }
  craft.add(at(box(0.3, 0.2, 0.55, mat(0x44403c)), 0, -0.55, 0.05));
  if (team != null) craft.add(at(box(0.32, 0.06, 0.57, mat(team)), 0, -0.47, 0.05));
  const bomb = at(sphere(0.1, mat(0x1c1917), 8, 6), 0, -0.7, 0.05);
  craft.add(bomb);
  const prop = at(group(box(0.5, 0.06, 0.03, mat(0xe7e5e4)), box(0.06, 0.5, 0.03, mat(0xe7e5e4))), 0, 0, -1.08);
  craft.add(prop);
  at(craft, 0, 1.9, 0);
  return {
    root: group(teamRing(team, 0.6), craft),
    height: 2.6,
    animate({ t, attack }) {
      prop.rotation.z = t * 25;
      craft.position.y = 1.9 + Math.sin(t * 1.4) * 0.1;
      craft.rotation.z = Math.sin(t * 0.9) * 0.05;
      if (attack >= 0) { bomb.position.y = -0.7 - attack * 1.6; bomb.visible = attack < 0.95; } else { bomb.position.y = -0.7; bomb.visible = true; }
    },
  };
}

// ── SPRITE (Star Sprite) ───────────────────────────────────────────────────
function sprite(d, team) {
  const coreM = mat(d.body, { emissive: 1 });
  const core = mesh(new THREE.OctahedronGeometry(0.28, 0), coreM);
  const wings = [-1, 1].map((sx) => {
    const w = pivot(sx * 0.08, 0, -0.05, at(box(0.45, 0.02, 0.28, mat(d.accent, { opacity: 0.7, emissive: 0.6 })), sx * 0.25, 0, 0));
    return w;
  });
  const sparkles = [0, 1, 2].map(() => sphere(0.04, mat(0xffffff, { emissive: 1 }), 5, 4));
  const fly = at(group(core, ...wings, ...sparkles), 0, 1.5, 0);
  for (const sx of [-1, 1]) core.add(at(sphere(0.04, mat(SKIN_DARK), 5, 4), sx * 0.08, 0.04, 0.2));
  return {
    root: group(teamRing(team, 0.35), fly),
    height: 2,
    animate({ t, attack }) {
      wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(t * 22) * 0.7; });
      core.rotation.y = t * 2;
      fly.position.y = 1.5 + Math.sin(t * 4) * 0.12;
      sparkles.forEach((s, i) => {
        const a = t * 3 + i * 2.1;
        s.position.set(Math.cos(a) * 0.45, Math.sin(a * 1.3) * 0.2, Math.sin(a) * 0.45);
      });
      core.scale.setScalar(1 + swing(attack) * 0.5);
    },
  };
}

// ── WRAITH (Void Wraith) ───────────────────────────────────────────────────
function wraith(d, team) {
  const robeM = mat(d.body, { opacity: 0.85 }), glowM = mat(d.accent, { emissive: 1 });
  const robe = at(cone(0.38, 1.0, robeM, 10), 0, 0.6, 0);
  robe.rotation.x = Math.PI;
  const hood = at(sphere(0.24, robeM), 0, 1.2, 0);
  const face = at(sphere(0.17, mat(0x020617)), 0, 1.18, 0.1);
  for (const sx of [-1, 1]) face.add(at(sphere(0.035, glowM, 6, 5), sx * 0.06, 0.02, 0.14));
  const arms = [-1, 1].map((sx) => pivot(sx * 0.3, 0.98, 0, at(cone(0.08, 0.55, robeM, 6), 0, -0.25, 0), at(cone(0.03, 0.18, glowM, 4), 0, -0.55, 0.05)));
  arms.forEach((a) => { a.children[0].rotation.x = Math.PI; a.children[1].rotation.x = Math.PI; });
  const tatters = [0, 1, 2, 3].map((i) => at(cone(0.08, 0.3, robeM, 4), Math.sin(i * 1.6) * 0.3, 0.12, Math.cos(i * 1.6) * 0.3));
  tatters.forEach((x) => { x.rotation.x = Math.PI; });
  const ghost = group(robe, hood, face, ...arms, ...tatters);
  return {
    root: group(teamRing(team), ghost),
    height: 1.6,
    animate({ t, moving, attack }) {
      ghost.position.y = 0.15 + Math.sin(t * 2.5) * 0.08;
      ghost.rotation.x = moving ? 0.25 : 0;
      tatters.forEach((x, i) => { x.rotation.z = Math.sin(t * 6 + i) * 0.3; });
      const a = swing(attack);
      arms[0].rotation.x = -a * 1.8 - (moving ? 0.6 : 0.2);
      arms[1].rotation.x = -a * 1.8 - (moving ? 0.6 : 0.2);
      robeM.opacity = 0.6 + Math.sin(t * 3) * 0.2;
    },
  };
}

// ── BUILDINGS ──────────────────────────────────────────────────────────────
function pylon(d, team) {
  const baseM = mat(d.body, { metal: 0.5 }), glowM = mat(d.accent, { emissive: 1 });
  const ring = at(torus(0.42, 0.05, glowM), 0, 0.9, 0);
  ring.rotation.x = Math.PI / 2;
  const emitter = at(sphere(0.16, glowM), 0, 1.45, 0);
  const dome = mesh(new THREE.SphereGeometry(0.85, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(d.accent, { opacity: 0.2, emissive: 0.6 }));
  dome.castShadow = false;
  const root = group(teamRing(team, 0.85),
    at(box(1.1, 0.3, 1.1, baseM), 0, 0.15, 0),
    team != null && at(box(1.12, 0.06, 1.12, mat(team)), 0, 0.3, 0),
    at(cyl(0.16, 0.28, 1.2, baseM, 8), 0, 0.85, 0), ring, emitter, dome);
  return {
    root,
    height: 1.9,
    animate({ t, attack }) {
      ring.position.y = 0.6 + ((t * 0.6) % 1) * 0.8;
      ring.scale.setScalar(1 - ((t * 0.6) % 1) * 0.3);
      emitter.scale.setScalar(1 + swing(attack) * 0.7);
      dome.material.opacity = 0.15 + Math.sin(t * 2) * 0.06;
    },
  };
}

function mound(d, team) {
  const dirtM = mat(d.body), glowM = mat(d.accent, { emissive: 0.7 });
  const hill = mesh(new THREE.SphereGeometry(0.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dirtM);
  hill.scale.y = 1.15;
  const holes = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.25;
    const hole = at(sphere(0.13, mat(0x1c1917), 8, 6), Math.sin(a) * 0.6, 0.35 + (i % 2) * 0.3, Math.cos(a) * 0.6);
    holes.push(hole);
    hill.add(hole);
  }
  const eggs = [0, 1, 2].map((i) => at(sphere(0.12, glowM, 8, 6), (i - 1) * 0.22, 0.95, 0.1));
  const root = group(teamRing(team, 0.85), hill, ...eggs);
  return {
    root,
    height: 1.4,
    animate({ t }) {
      hill.scale.set(1 + Math.sin(t * 1.8) * 0.03, 1.15 + Math.sin(t * 1.8) * 0.05, 1 + Math.sin(t * 1.8) * 0.03);   // pulsing
      eggs.forEach((e, i) => e.scale.setScalar(0.9 + Math.sin(t * 3 + i) * 0.2));
    },
  };
}

function turret(d, team) {
  const baseM = mat(d.body, { metal: 0.4 }), brassM = mat(d.accent, { metal: 0.8, rough: 0.3 });
  const head = group(at(box(0.7, 0.45, 0.7, baseM), 0, 0, 0));
  const barrel = at(cyl(0.12, 0.16, 0.8, brassM, 10), 0, 0.02, 0.5);
  barrel.rotation.x = Math.PI / 2;
  head.add(barrel);
  const chimney = at(cyl(0.07, 0.09, 0.45, brassM, 8), -0.2, 0.4, -0.2);
  head.add(chimney);
  const puff = at(sphere(0.12, mat(0xe7e5e4, { opacity: 0.6 })), -0.2, 0.7, -0.2);
  puff.castShadow = false;
  head.add(puff);
  const flash = at(sphere(0.15, mat(0xfde047, { emissive: 1 })), 0, 0.02, 0.95);
  head.add(flash);
  at(head, 0, 0.75, 0);
  const root = group(teamRing(team, 0.85),
    at(cyl(0.55, 0.65, 0.5, mat(0x57534e), 10), 0, 0.25, 0),
    team != null && at(cyl(0.57, 0.57, 0.08, mat(team), 10), 0, 0.5, 0), head);
  return {
    root,
    height: 1.4,
    head,
    animate({ t, attack }) {
      const a = swing(attack);
      barrel.position.z = 0.5 - a * 0.15;
      flash.visible = attack >= 0 && attack < 0.3;
      const k = (t * 0.7) % 1;
      puff.position.y = 0.6 + k * 0.6;
      puff.scale.setScalar(0.5 + k * 1.5);
      puff.material.opacity = 0.6 * (1 - k);
    },
  };
}

function portal(d, team) {
  const stoneM = mat(0x44403c), glowM = mat(d.accent, { emissive: 1 });
  const ring = at(torus(0.62, 0.1, mat(d.body, { metal: 0.4 })), 0, 0.9, 0);
  const swirl = at(mesh(new THREE.CircleGeometry(0.55, 20), mat(d.accent, { opacity: 0.6, emissive: 0.8 })), 0, 0.9, 0);
  swirl.material.side = THREE.DoubleSide;
  const stars = [0, 1, 2, 3].map(() => sphere(0.05, glowM, 5, 4));
  const root = group(teamRing(team, 0.85),
    at(box(1.3, 0.2, 0.5, stoneM), 0, 0.1, 0),
    team != null && at(box(1.32, 0.06, 0.52, mat(team)), 0, 0.2, 0),
    at(box(0.18, 1.6, 0.25, stoneM), -0.72, 0.85, 0), at(box(0.18, 1.6, 0.25, stoneM), 0.72, 0.85, 0),
    ring, swirl, ...stars);
  return {
    root,
    height: 1.9,
    animate({ t }) {
      swirl.rotation.z = t * 2;
      swirl.scale.setScalar(0.9 + Math.sin(t * 3) * 0.08);
      stars.forEach((s, i) => {
        const a = t * 2.5 + i * 1.6;
        s.position.set(Math.cos(a) * 0.45, 0.9 + Math.sin(a) * 0.45, 0.05);
      });
    },
  };
}

// ── SPELLS (shown in portraits and when cast) ──────────────────────────────
function spell(d) {
  const c = d.color;
  const g = group();
  const spin = [];
  if (d.look === 'bomb') {
    g.add(at(sphere(0.45, mat(0x27272a, { metal: 0.6, rough: 0.3 }), 14, 10), 0, 0.5, 0));
    g.add(rot(at(torus(0.45, 0.04, mat(0xb45309, { metal: 0.8 })), 0, 0.5, 0), 'x', Math.PI / 2));
    g.add(at(cyl(0.12, 0.14, 0.15, mat(0xb45309, { metal: 0.8 })), 0, 0.98, 0));
    const fuse = at(sphere(0.09, mat(0xfde047, { emissive: 1 })), 0, 1.12, 0);
    g.add(fuse);
    spin.push(fuse);
  } else if (d.look === 'emp') {
    g.add(at(sphere(0.32, mat(c, { emissive: 1 })), 0, 0.6, 0));
    for (let i = 0; i < 3; i++) {
      const r = at(torus(0.5 + i * 0.12, 0.03, mat(c, { emissive: 0.9, opacity: 0.8 })), 0, 0.6, 0);
      r.rotation.set(i * 0.9, i * 0.6, 0);
      spin.push(r);
      g.add(r);
    }
  } else if (d.look === 'cloud') {
    for (let i = 0; i < 7; i++) {
      const p = at(sphere(0.25 + (i % 3) * 0.06, mat(c, { opacity: 0.75, emissive: 0.25 })), Math.sin(i * 2.4) * 0.4, 0.5 + (i % 2) * 0.2, Math.cos(i * 2.4) * 0.3);
      spin.push(p);
      g.add(p);
    }
    g.add(at(sphere(0.06, mat(0x14532d), 6, 5), -0.12, 0.62, 0.42), at(sphere(0.06, mat(0x14532d), 6, 5), 0.12, 0.62, 0.42));
  } else if (d.look === 'comet') {
    const head = at(sphere(0.32, mat(0xfdba74, { emissive: 1 })), 0.2, 0.75, 0.2);
    const tail = at(cone(0.32, 1.2, mat(c, { emissive: 0.8, opacity: 0.75 }), 10), -0.25, 1.2, -0.25);
    tail.rotation.set(-0.6, 0, 0.6);
    g.add(head, tail);
    spin.push(head);
  } else if (d.look === 'hole') {
    g.add(at(sphere(0.33, mat(0x020617)), 0, 0.6, 0));
    const disk = at(torus(0.55, 0.12, mat(0xc084fc, { emissive: 0.9 })), 0, 0.6, 0);
    disk.rotation.x = Math.PI / 2.4;
    spin.push(disk);
    g.add(disk);
  }
  return {
    root: g,
    height: 1.2,
    animate({ t }) {
      spin.forEach((s, i) => {
        if (d.look === 'emp' || d.look === 'hole') s.rotation.z = t * (2 + i);
        else if (d.look === 'cloud') s.position.y = 0.5 + (i % 2) * 0.2 + Math.sin(t * 2 + i) * 0.05;
        else s.scale.setScalar(1 + Math.sin(t * 12) * 0.2);
      });
    },
  };
}

const BUILDERS = { humanoid, mech, drone, worm, quadruped, spider, serpent, blimp, sprite, wraith, pylon, mound, turret, portal, spell };

// ── TOWERS ─────────────────────────────────────────────────────────────────
/** Princess-style side tower or the bigger central keep. Returns { root, aim(group), animate } */
export function buildTower(isKing, team) {
  const stoneM = mat(0x9ca3af, { rough: 0.85 });
  const stoneDark = mat(0x6b7280, { rough: 0.9 });
  const teamM = mat(team);
  const woodM = mat(0x92400e);
  const root = group();
  let aim, flag, sleep;

  const tileA = mat(0xc8c2b4), tileB = mat(0xb5ae9f);
  const plat = (n) => {
    const g = group();
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const tile = box(0.94, 0.3, 0.94, (i + j) % 2 ? tileA : tileB);
      tile.position.set(i - (n - 1) / 2, 0.15, j - (n - 1) / 2);
      tile.receiveShadow = true;
      g.add(tile);
    }
    return g;
  };
  if (!isKing) {
    root.add(plat(3));
    root.add(at(cyl(1.0, 1.15, 1.9, stoneM, 12), 0, 0.95, 0));
    for (let i = 0; i < 3; i++) root.add(at(cyl(1.02 + i * 0.02, 1.02 + i * 0.02, 0.08, stoneDark, 12), 0, 0.4 + i * 0.6, 0));
    root.add(at(cyl(1.2, 1.05, 0.25, stoneDark, 12), 0, 2.0, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      root.add(at(box(0.3, 0.3, 0.3, stoneM), Math.sin(a) * 1.05, 2.27, Math.cos(a) * 1.05));
    }
    root.add(at(cyl(1.08, 1.08, 0.12, teamM, 12), 0, 1.75, 0));
    // Crossbow turret with a gunner
    aim = at(group(
      at(box(0.3, 0.25, 0.7, woodM), 0, 0, 0),
      at(box(1.0, 0.06, 0.08, woodM), 0, 0.05, 0.3),
      at(cyl(0.14, 0.16, 0.5, teamM, 8), 0, 0.3, -0.35),
      at(sphere(0.15, mat(0xfcd5b5)), 0, 0.65, -0.35),
      at(cone(0.17, 0.25, teamM, 8), 0, 0.82, -0.35),
    ), 0, 2.35, 0);
    root.add(aim);
    flag = at(box(0.5, 0.32, 0.03, teamM), 0.28, 3.1, 0);
    root.add(at(cyl(0.03, 0.03, 1.1, woodM, 5), 0.9, 2.6, -0.6));
    flag.position.set(1.15, 2.95, -0.6);
    root.add(flag);
  } else {
    root.add(plat(4));
    root.add(at(box(2.8, 2.0, 2.8, stoneM), 0, 1.0, 0));
    root.add(at(box(2.9, 0.1, 2.9, stoneDark), 0, 0.5, 0));
    root.add(at(box(3.0, 0.3, 3.0, stoneDark), 0, 2.1, 0));
    for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
      root.add(at(cyl(0.45, 0.5, 2.7, stoneM, 8), x, 1.35, z));
      root.add(at(cone(0.6, 0.8, teamM, 8), x, 3.1, z));
    }
    root.add(at(box(1.0, 1.0, 0.1, teamM), 0, 1.2, 1.42));                     // banner over the gate
    root.add(at(box(0.7, 0.9, 0.12, mat(0x451a03)), 0, 0.45, 1.42));
    const crown = group(at(cyl(0.35, 0.4, 0.2, mat(0xfacc15, { metal: 0.8, rough: 0.3 }), 10), 0, 0, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      crown.add(at(cone(0.08, 0.25, mat(0xfacc15, { metal: 0.8 }), 5), Math.sin(a) * 0.3, 0.2, Math.cos(a) * 0.3));
    }
    // Cannon on top, the crown on the keeper
    aim = at(group(
      at(box(0.9, 0.35, 0.9, woodM), 0, 0, 0),
      at(cyl(0.2, 0.26, 1.2, mat(0x27272a, { metal: 0.7 }), 10), 0, 0.25, 0.5),
      at(box(0.6, 0.6, 0.45, teamM), 0, 0.5, -0.35),
      at(sphere(0.25, mat(0xfcd5b5)), 0, 1.0, -0.35),
      at(crown, 0, 1.25, -0.35),
    ), 0, 2.45, 0);
    aim.children[1].rotation.x = Math.PI / 2;
    root.add(aim);
    sleep = at(group(), 0, 4.2, 0);
    root.add(sleep);
  }
  addOutlines(root, 0.05);
  return {
    root,
    aim,
    sleep,
    animate({ t, attack }) {
      if (flag) flag.rotation.y = Math.sin(t * 3) * 0.3;
      if (aim) aim.position.y = (isKing ? 2.45 : 2.35) + (attack >= 0 ? -swing(attack) * 0.08 : 0);
    },
  };
}

export function buildRubble() {
  const m = mat(0x78716c, { rough: 0.95 });
  const g = group();
  for (let i = 0; i < 9; i++) {
    const b = at(box(0.3 + Math.random() * 0.4, 0.2 + Math.random() * 0.3, 0.3 + Math.random() * 0.4, m), (Math.random() - 0.5) * 1.8, 0.12, (Math.random() - 0.5) * 1.8);
    b.rotation.set(Math.random(), Math.random(), Math.random());
    g.add(b);
  }
  return g;
}
