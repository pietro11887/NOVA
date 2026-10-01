import * as THREE from 'three';
import { PIT, TRACK } from './trackData.js';

// Corsia box: percorso parallelo al rettilineo, limitatore a 80 km/h, piazzole e pit stop.
// In corsia la vettura è "guidata" lungo il percorso (come fanno molti giochi di F1),
// il pilota decide solo gomme e riparazioni.

const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export class PitLane {
  constructor(track) {
    this.track = track;
    this.pts = track.pit.pts;              // un punto ogni metro lungo la corsia
    this.length = track.pit.length;
  }

  // s "con segno" (negativo prima del traguardo) alla distanza p percorsa in corsia
  ssAt(p) {
    const P = this.pts, f = Math.max(0, Math.min(P.length - 1.001, p)), i = Math.floor(f), k = f - i;
    return P[i].ss + (P[i + 1].ss - P[i].ss) * k;
  }

  // distanza lungo la corsia corrispondente a un certo s
  pAtSs(ss) {
    const P = this.pts;
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].ss < ss) lo = m; else hi = m; }
    const a = P[lo], b = P[hi];
    return lo + Math.max(0, Math.min(1, (ss - a.ss) / ((b.ss - a.ss) || 1)));
  }

  // posizione nel mondo a distanza p, con scostamento laterale d (d<0 = destra)
  poseP(p, d = 0, out = {}) {
    const P = this.pts, f = Math.max(0, Math.min(P.length - 1.001, p)), i = Math.floor(f), k = f - i;
    const a = P[i], b = P[i + 1];
    const nx = a.nx + (b.nx - a.nx) * k, nz = a.nz + (b.nz - a.nz) * k;
    out.x = a.x + (b.x - a.x) * k + nx * d;
    out.z = a.z + (b.z - a.z) * k + nz * d;
    out.y = a.y + (b.y - a.y) * k;
    out.tx = a.tx; out.tz = a.tz;
    return out;
  }

  // posizione relativa alla pista (non alla corsia)
  trackPose(ss, d, out = {}) {
    const S = this.track.samples, n = this.track.count, st = this.track.step, L = this.track.length;
    const s = ((ss % L) + L) % L;
    const f = s / st, i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, k = f - Math.floor(f);
    const a = S[i0], b = S[i1];
    out.x = a.x + (b.x - a.x) * k + a.nx * d; out.z = a.z + (b.z - a.z) * k + a.nz * d;
    out.y = a.y + (b.y - a.y) * k; out.tx = a.tx; out.tz = a.tz;
    return out;
  }

  // compat: posizione a partire da s
  pose(ss, d = 0, out = {}) { return this.poseP(this.pAtSs(ss), d, out); }

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
      const p0s = this.pAtSs(from), p1s = this.pAtSs(to);
      for (let q = p0s; q <= p1s + 1e-6; q += Math.min(1, p1s - p0s || 1)) {
        const p0 = this.poseP(q, d0), p1 = this.poseP(q, d1);
        pos.push(p0.x, p0.y + y, p0.z, p1.x, p1.y + y, p1.z);
        if (row) { const a = (row - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        row++;
        if (p1s - p0s <= 0) break;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.material.side = THREE.DoubleSide;
      m.receiveShadow = true;
      g.add(m);
    };
    strip(-PIT.halfW, PIT.halfW, asphalt, 0.025);
    const sd = PIT.side;
    strip(-PIT.halfW - 0.1, -PIT.halfW + 0.15, white, 0.035);
    strip(PIT.halfW - 0.15, PIT.halfW + 0.1, white, 0.035);
    // linee del limitatore
    for (const ss of [PIT.limitFrom, PIT.limitTo]) strip(-3.2, 3.2, yellow, 0.04, ss, ss + 1);
    // piazzole con i colori delle squadre
    for (let k = 0; k < 20; k++) {
      const ss = this.boxS(k);
      const p = this.pose(ss, sd * 2.2);
      const box = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.8), new THREE.MeshStandardMaterial({ color: k % 2 ? 0x3a3e47 : 0x444955, roughness: 0.9 }));
      box.rotation.x = -Math.PI / 2;
      box.rotation.z = Math.atan2(-p.tz, p.tx);
      box.position.set(p.x, p.y + 0.03, p.z);
      box.receiveShadow = true;
      g.add(box);
    }
    // cartelli "PIT" e 80 all'ingresso
    const sign = (text, ss, d, bg, fg, onTrack = false) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = bg; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill();
      x.fillStyle = fg; x.font = 'bold 54px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 64, 68);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide }));
      const p = onTrack ? this.trackPose(ss, d) : this.pose(ss, d);
      m.position.set(p.x, p.y + 2.2, p.z);
      m.rotation.y = -Math.atan2(p.tz, p.tx) - Math.PI / 2;
      g.add(m);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2), white);
      pole.position.set(p.x, p.y + 1.1, p.z); g.add(pole);
    };
    const hwAt = ss => { const S = this.track.samples, L = this.track.length; return S[Math.floor((((ss % L) + L) % L) / this.track.step) % this.track.count].hw; };
    sign('PIT', PIT.entry - 70, sd * (hwAt(PIT.entry - 70) + 2.5), '#1b3a8a', '#fff', true);
    if (!TRACK.pitPath) sign('PIT', PIT.entry + 38, sd * (hwAt(PIT.entry + 38) + 2.2), '#1b3a8a', '#fff', true);   // sull'isola tra pista e corsia
    sign(String(Math.round(PIT.speed * 3.6)), PIT.limitFrom, sd * 3.8, '#fff', '#d8231f');
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
    const hw = p.track.samples[p.prCG.i].hw;
    this.fromD = Math.max(-hw - 2, Math.min(hw + 2, p.prCG.d));
    this.box = lane.boxS(car.slot % 20);
    this.boxP = lane.pAtSs(this.box);
    this.phase = 'in';              // in -> service -> out -> done
    this.service = 0;
    this.serviceTotal = 0;
    this.pose = {};
    p.inPit = true;
  }

  get ss() { return this.lane.ssAt(this.p); }

  // avanza di dt; restituisce true quando la vettura è rientrata in pista
  step(dt) {
    const ss = this.ss, limit = PIT.speed;
    let vt = 60;
    if (this.phase === 'in') {
      // frenata fino al limitatore, poi 80 km/h fino alla piazzola
      const dLim = PIT.limitFrom - ss;
      vt = dLim > 0 ? Math.min(120 / 3.6, Math.sqrt(limit * limit + 2 * 14 * dLim)) : limit;
      const dBox = this.boxP - this.p;
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
      vt = ss < PIT.limitTo ? limit : Math.max(limit, 30);   // uscita: si accelera, ma senza esagerare
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
    // vicino alla propria piazzola la vettura entra nel box (a lato della corsia);
    // all'imbocco parte dalla posizione in cui si trovava in pista
    const off = q => {
      const k = 1 - Math.abs(q - this.boxP) / 16;
      const box = k > 0 ? PIT.side * 2.4 * k * k * (3 - 2 * k) : 0;
      const t = Math.max(0, Math.min(1, q / 50)), e = 1 - t * t * (3 - 2 * t);
      return box + (this.fromD - PIT.startD) * e;
    };
    // direzione: un metro avanti (in fondo alla corsia, un metro indietro)
    const p0 = Math.min(this.p, lane.length - 1);
    const a = lane.poseP(this.p, off(this.p), this.pose);
    const a0 = lane.poseP(p0, off(p0), {});
    const b = lane.poseP(p0 + 1, off(p0 + 1), {});
    const yaw = Math.atan2(b.z - a0.z, b.x - a0.x);
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
