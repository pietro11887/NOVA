import * as THREE from 'three';
import { PIT, ROAD_HALF_WIDTH as H } from './trackData.js';

// Corsia box: percorso parallelo al rettilineo, limitatore a 80 km/h, piazzole e pit stop.
// In corsia la vettura è "guidata" lungo il percorso (come fanno molti giochi di F1),
// il pilota decide solo gomme e riparazioni.

const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export class PitLane {
  constructor(track) {
    this.track = track;
    this.L = track.length;
    this.length = PIT.exit - PIT.entry;   // metri di corsia (lungo s)
  }

  // s "con segno" (negativo prima del traguardo) dalla distanza percorsa in corsia
  sAt(p) { return PIT.entry + p; }

  // scostamento laterale della corsia in funzione di s (con segno)
  laneD(ss, fromD = -H) {
    if (ss < PIT.entry + 60) return fromD + (PIT.laneD - fromD) * smooth((ss - PIT.entry) / 60);
    if (ss > PIT.exit - 70) return PIT.laneD + (-H + 1.5 - PIT.laneD) * smooth((ss - (PIT.exit - 70)) / 70);
    return PIT.laneD;
  }

  // posizione nel mondo
  pose(ss, d, out = {}) {
    const S = this.track.samples, n = this.track.count, st = this.track.step;
    const s = ((ss % this.L) + this.L) % this.L;
    const f = s / st, i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, k = f - Math.floor(f);
    const a = S[i0], b = S[i1];
    const nx = a.nx + (b.nx - a.nx) * k, nz = a.nz + (b.nz - a.nz) * k;
    out.x = a.x + (b.x - a.x) * k + nx * d;
    out.z = a.z + (b.z - a.z) * k + nz * d;
    out.y = a.y + (b.y - a.y) * k;
    out.tx = a.tx; out.tz = a.tz;
    return out;
  }

  boxS(slot) { return PIT.boxFrom + slot * PIT.boxGap; }

  build(scene) {
    const g = new THREE.Group();
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x55595f, roughness: 0.9 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.7 });
    // nastro della corsia
    const strip = (d0, d1, mat, y = 0.03, from = PIT.entry, to = PIT.exit) => {
      const pos = [], idx = [];
      let row = 0;
      for (let ss = from; ss <= to; ss += 2) {
        const d = this.laneD(ss);
        const p0 = this.pose(ss, d + d0), p1 = this.pose(ss, d + d1);
        pos.push(p0.x, p0.y + y, p0.z, p1.x, p1.y + y, p1.z);
        if (row) { const a = (row - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        row++;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.material.side = THREE.DoubleSide;
      m.receiveShadow = true;
      g.add(m);
    };
    strip(-3.2, 3.2, asphalt, 0.025);
    strip(-3.3, -3.05, white, 0.035);
    strip(3.05, 3.3, white, 0.035);
    // linee del limitatore
    for (const ss of [PIT.limitFrom, PIT.limitTo]) strip(-3.2, 3.2, yellow, 0.04, ss, ss + 1);
    // piazzole con i colori delle squadre
    for (let k = 0; k < 20; k++) {
      const ss = this.boxS(k);
      const p = this.pose(ss, PIT.laneD - 2.2);
      const box = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.8), new THREE.MeshStandardMaterial({ color: k % 2 ? 0x3a3e47 : 0x444955, roughness: 0.9 }));
      box.rotation.x = -Math.PI / 2;
      box.rotation.z = Math.atan2(-p.tz, p.tx);
      box.position.set(p.x, p.y + 0.03, p.z);
      box.receiveShadow = true;
      g.add(box);
    }
    // cartelli "PIT" e 80 all'ingresso
    const sign = (text, ss, d, bg, fg) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = bg; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill();
      x.fillStyle = fg; x.font = 'bold 54px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 64, 68);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide }));
      const p = this.pose(ss, d);
      m.position.set(p.x, p.y + 2.2, p.z);
      m.rotation.y = -Math.atan2(p.tz, p.tx) - Math.PI / 2;
      g.add(m);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2), white);
      pole.position.set(p.x, p.y + 1.1, p.z); g.add(pole);
    };
    sign('PIT', PIT.entry - 40, -H - 2.5, '#1b3a8a', '#fff');
    sign('80', PIT.limitFrom, PIT.laneD - 3.8, '#fff', '#d8231f');
    scene.add(g);
    this.group = g;
  }
}

// Stato di una vettura in corsia box
export class PitStop {
  constructor(lane, car, plan) {
    this.lane = lane;
    this.car = car;                 // oggetto vettura della gara ({ phys, ... })
    this.plan = plan;               // { compound, repair }
    const p = car.phys;
    this.p = 0;                     // metri percorsi in corsia
    this.v = Math.max(p.speed, 10);
    this.fromD = Math.max(-H - 2, Math.min(H, p.prCG.d));
    this.box = lane.boxS(car.slot % 20);
    this.phase = 'in';              // in -> service -> out -> done
    this.service = 0;
    this.serviceTotal = 0;
    this.pose = {};
    p.inPit = true;
  }

  get ss() { return this.lane.sAt(this.p); }

  // avanza di dt; restituisce true quando la vettura è rientrata in pista
  step(dt) {
    const ss = this.ss, limit = PIT.speed;
    let vt = 60;
    if (this.phase === 'in') {
      // frenata fino al limitatore, poi 80 km/h fino alla piazzola
      const dLim = PIT.limitFrom - ss;
      vt = dLim > 0 ? Math.sqrt(limit * limit + 2 * 14 * dLim) : limit;
      const dBox = this.box - ss;
      vt = Math.min(vt, Math.sqrt(Math.max(0, 2 * 9 * dBox)));
      if (dBox < 0.3 && this.v < 1.5) {
        this.phase = 'service'; this.v = 0;
        const phys = this.car.phys;
        this.serviceTotal = 2.2 + Math.random() * 0.6 + (this.plan.repair ? phys.repairTime() : 0);
        this.service = 0;
      }
    } else if (this.phase === 'service') {
      this.service += dt;
      if (this.service >= this.serviceTotal) {
        const phys = this.car.phys;
        if (this.plan.compound) phys.fitTyres(this.plan.compound);
        if (this.plan.repair) { phys.repair(); this.repaired = true; }
        this.phase = 'out';
      }
      vt = 0;
    } else {
      vt = ss < PIT.limitTo ? limit : 70;
    }
    const acc = vt > this.v ? 9 : 16;
    this.v += Math.max(-acc * dt, Math.min(acc * dt, vt - this.v));
    if (this.phase === 'service') this.v = 0;
    this.p += this.v * dt;
    this.apply(dt);
    if (this.p >= this.lane.length) { this.finish(); return true; }
    return false;
  }

  apply(dt) {
    const phys = this.car.phys, lane = this.lane;
    const ss = this.ss;
    // vicino alla propria piazzola la vettura entra nel box (a lato della corsia)
    const intoBox = s0 => { const k = 1 - Math.abs(s0 - this.box) / 16; return k > 0 ? -2.4 * k * k * (3 - 2 * k) : 0; };
    const d = lane.laneD(ss, this.fromD) + intoBox(ss);
    const a = lane.pose(ss, d, this.pose);
    const b = lane.pose(ss + 1, lane.laneD(ss + 1, this.fromD) + intoBox(ss + 1), {});
    const yaw = Math.atan2(b.z - a.z, b.x - a.x);
    phys.x = a.x; phys.z = a.z; phys.y = a.y + phys.h;
    phys.yaw = yaw; phys.yawRate = 0;
    phys.vx = Math.cos(yaw) * this.v; phys.vz = Math.sin(yaw) * this.v; phys.vy = 0;
    phys.pitch = 0; phys.roll = 0; phys.pitchRate = 0; phys.rollRate = 0; phys.steer = 0;
    phys.speed = this.v; phys.vxl = this.v; phys.vyl = 0;
    phys.gear = this.v < 12 ? 1 : 2;
    phys.rpm = 4200 + this.v * 260;
    phys.throttleOut = this.phase === 'service' ? 0 : 0.3;
    phys.kerbVibe = 0;
    for (const w of phys.wheels) { w.spin = this.v; w.slide = 0; w.lock = false; w.spinning = false; }
    phys.projectAll();
    for (const w of phys.wheels) { w.ground = w.pr.y; w.comp = 0.013; }
  }

  finish() {
    const phys = this.car.phys;
    phys.inPit = false;
    // riprende la fisica: stato coerente con la posizione in uscita
    for (const w of phys.wheels) { w.ground = w.pr.y + w.sf.h; w.comp = w.ground + phys.h + 0.013 - phys.y; }
  }
}
