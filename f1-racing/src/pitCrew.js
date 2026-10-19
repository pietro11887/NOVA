import * as THREE from 'three';
import { PIT } from './trackData.js';
import { IS_F1 } from './vehicle.js';

// Meccanici al box (come nei giochi di F1): aspettano in corsia quando la vettura arriva,
// pistole alle ruote e cric davanti e dietro durante il cambio, semaforo sopra il muso,
// poi si allargano per lasciarla ripartire. Poche squadre alla volta: le soste più vicine.

const POOL = 3;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// figura: tuta nel colore della squadra, casco, pistola o cric. Busto e gambe separati per inginocchiarsi.
const LEG = new THREE.CapsuleGeometry(0.075, 0.62, 3, 6), TORSO = new THREE.CapsuleGeometry(0.17, 0.42, 3, 8);
const ARM = new THREE.CapsuleGeometry(0.06, 0.48, 3, 6), HEAD = new THREE.SphereGeometry(0.135, 12, 10);
function figure(suit, helmet, tool) {
  const g = new THREE.Group(), up = new THREE.Group();
  const legs = [];
  for (const z of [-0.1, 0.1]) { const l = new THREE.Mesh(LEG, suit); l.position.set(0, 0.42, z); l.castShadow = true; g.add(l); legs.push(l); }
  const torso = new THREE.Mesh(TORSO, suit); torso.position.y = 1.08; torso.castShadow = true;
  const head = new THREE.Mesh(HEAD, helmet); head.position.y = 1.56; head.castShadow = true;
  up.add(torso, head);
  // braccia in avanti verso l'attrezzo
  for (const z of [-0.2, 0.2]) { const a = new THREE.Mesh(ARM, suit); a.position.set(0.16, 1.1, z); a.rotation.z = -1.1; up.add(a); }
  if (tool) { const t = new THREE.Mesh(tool, toolMat); t.position.set(0.42, 0.92, 0); up.add(t); }
  g.add(up);
  g.userData.up = up; g.userData.legs = legs;
  return g;
}
const toolMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.6 });
const GUN = new THREE.BoxGeometry(0.34, 0.12, 0.12);
const JACK = new THREE.BoxGeometry(0.9, 0.1, 0.18);

export class PitCrew {
  constructor(scene) {
    this.crews = [];
    for (let k = 0; k < POOL; k++) this.crews.push(this.makeCrew(scene));
  }

  makeCrew(scene) {
    const root = new THREE.Group(); root.visible = false;
    const suit = new THREE.MeshStandardMaterial({ color: 0x1b2a5a, roughness: 0.8 });
    const helmet = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.3, metalness: 0.2 });
    const fr = IS_F1 ? 1.75 : 1.35, rr = IS_F1 ? -1.85 : -1.3, side = 1.35;
    const men = [];
    // [x avanti, z lato, ruolo]
    for (const x of [fr, rr]) for (const z of [-side, side]) {
      men.push({ o: figure(suit, helmet, GUN), x, z, role: 'gun' });
      men.push({ o: figure(suit, helmet, null), x: x + (x > 0 ? 0.65 : -0.65), z: z * 1.45, role: 'tyre' });
    }
    men.push({ o: figure(suit, helmet, JACK), x: fr + 1.55, z: 0, role: 'jack' });
    men.push({ o: figure(suit, helmet, JACK), x: rr - 1.35, z: 0, role: 'jack' });
    for (const m of men) root.add(m.o);
    // semaforo sopra il muso (rosso durante il cambio, verde per ripartire)
    const lightMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a1a, emissiveIntensity: 2.2 });
    const gantry = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.2), toolMat); bar.position.y = 2.6;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.5), lightMat); lamp.position.y = 2.38;
    gantry.add(bar, lamp); gantry.position.x = fr + 0.6;
    root.add(gantry);
    scene.add(root);
    return { root, suit, men, lightMat, car: null };
  }

  // auto: vettura del giocatore (fase del rilascio per il semaforo)
  update(race, camera, dt) {
    const want = [];
    if (race && race.pitLane) {
      for (const c of race.cars) {
        const p = c.pit;
        if (!p || c.gone) continue;
        const toBox = p.boxP - p.p;
        // si vedono quando la vettura è a 120 m dal box e fino a 30 m dopo
        if (toBox > 120 || toBox < -30) continue;
        const d = Math.hypot(c.phys.x - camera.position.x, c.phys.z - camera.position.z);
        if (d > 220) continue;
        want.push([c.isPlayer ? -1 : d, c]);
      }
    }
    want.sort((a, b) => a[0] - b[0]);
    const cars = want.slice(0, POOL).map(w => w[1]);
    // le squadre già assegnate restano alla stessa vettura
    for (const cr of this.crews) if (cr.car && !cars.includes(cr.car)) { cr.car = null; cr.root.visible = false; }
    for (const c of cars) {
      let cr = this.crews.find(x => x.car === c);
      if (!cr) { cr = this.crews.find(x => !x.car); if (!cr) continue; cr.car = c; cr.suit.color.set(c.color ?? 0x1b2a5a); cr.root.visible = true; }
      this.place(cr, c);
    }
  }

  place(cr, c) {
    const p = c.pit, lane = p.lane;
    // posizione del box (fissa): lì aspettano i meccanici
    const box = lane.poseP(p.boxP, PIT.side * 2.4, {});
    const b2 = lane.poseP(p.boxP + 1, PIT.side * 2.4, {});
    const yaw = Math.atan2(b2.z - box.z, b2.x - box.x);
    cr.root.position.set(box.x, box.y, box.z);
    cr.root.rotation.y = -yaw;
    // lato dei garage nel riferimento della squadra (z locale): lì si spostano i cric per far ripartire la vettura
    const P = lane.pts[Math.max(0, Math.min(lane.pts.length - 1, Math.round(p.boxP)))];
    const gz = (-Math.sin(yaw) * P.nx + Math.cos(yaw) * P.nz) * PIT.side > 0 ? 1 : -1;
    // 0 = in attesa / allargati, 1 = al lavoro sulla vettura
    let work = 0;
    if (p.phase === 'service') work = 1;
    else if (p.phase === 'in') work = smooth(1 - (p.boxP - p.p) / 6) * 0.25;
    const t = p.phase === 'service' ? p.service : 0, T = p.serviceTotal || 1;
    for (const m of cr.men) {
      const spread = 1 + (1 - work) * 0.9;          // fuori dalla traiettoria quando la vettura si muove
      if (m.role === 'jack') m.o.position.set(m.x * (1 + (1 - work) * 0.25), 0, gz * 2.3 * (1 - work));
      else m.o.position.set(m.x, 0, m.z * spread);
      m.o.rotation.y = m.role === 'jack' ? (m.x > 0 ? Math.PI : 0) : (m.z > 0 ? Math.PI / 2 : -Math.PI / 2);   // attrezzo verso la vettura
      // chi ha la pistola si inginocchia alla ruota; chi porta le gomme si avvicina a metà sosta
      let kneel = 0;
      if (m.role === 'gun') kneel = work;
      if (m.role === 'tyre') { const k = work * smooth((t / T - 0.15) * 4) * (1 - smooth((t / T - 0.8) * 5)); m.o.position.z = m.z * (spread - 0.35 * k); }
      // in ginocchio: busto più basso e in avanti, gambe piegate
      m.o.userData.up.position.set(0.12 * kneel, -0.42 * kneel, 0);
      for (const l of m.o.userData.legs) { l.scale.y = 1 - 0.5 * kneel; l.position.y = 0.42 - 0.2 * kneel; }
    }
    // semaforo: rosso fino alla fine del cambio, verde quando si può ripartire
    const green = p.phase === 'release' || p.phase === 'out';
    cr.lightMat.emissive.setHex(green ? 0x18ff4a : 0xff1a1a);
  }
}
