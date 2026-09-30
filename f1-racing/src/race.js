import { CarPhysics } from './physics.js';
import { AIDriver } from './ai.js';

// Gara contro i bot: griglia, contatti tra vetture, giri, classifica e distacchi.

export const DRIVERS = [
  ['ROSSI', 0xd8231f, 0xffd21e], ['BIANCHI', 0x1b3a8a, 0xff2d55], ['VERDI', 0x0a7d3e, 0xffffff],
  ['NERI', 0x16171b, 0xff8a1c], ['GALLI', 0xffd21e, 0x1a1a1a], ['CONTI', 0x6b2fd6, 0x2ec4ea],
  ['MARINI', 0x2a6fe0, 0xffffff], ['COSTA', 0xf2f2f2, 0xd8231f], ['FERRI', 0x00a19c, 0x0e2a3a],
  ['LEONE', 0x8a1c2b, 0xc9a37a], ['MORO', 0x3a3d45, 0x9ae62e], ['SANTI', 0xff5b8a, 0x16171b],
  ['VITALE', 0x0e4d2b, 0xf5c518], ['RIVA', 0x9aa1ab, 0x1b3a8a], ['PELLE', 0xff7b1c, 0x2257b8],
  ['LOMBA', 0x14a0e0, 0x16171b], ['GRASSI', 0x6e4a33, 0xf2f2f2], ['SALA', 0xb43adf, 0xffd21e],
  ['PARISI', 0x2ee06f, 0x16171b],
];

const CIRCLES = [[2.0, 0.95], [0.1, 1.0], [-1.8, 0.95]]; // [x locale, raggio]

export class Race {
  constructor(track, line, opts) {
    this.track = track;
    this.line = line;
    this.laps = opts.laps;
    this.cars = [];
    this.t = 0;              // secondi dalla partenza
    this.started = false;
    this.finished = false;
    const total = opts.bots + 1;
    const playerSlot = Math.min(total, Math.max(1, opts.startPos)) - 1;
    let botIdx = 0;
    for (let slot = 0; slot < total; slot++) {
      const isPlayer = slot === playerSlot;
      const phys = isPlayer ? opts.playerPhys : new CarPhysics(track);
      const car = {
        phys, isPlayer, slot, retired: false,
        name: isPlayer ? 'TU' : DRIVERS[botIdx % DRIVERS.length][0],
        color: isPlayer ? 0xff8a1c : DRIVERS[botIdx % DRIVERS.length][1],
        accent: isPlayer ? 0x27c3ea : DRIVERS[botIdx % DRIVERS.length][2],
        crossings: 0, halfway: false, finishT: null, lastLapT: null, bestLap: null, lapStart: 0,
        pass: [], sPrev: 0,
      };
      phys.damageMode = opts.damageMode || 'sim';
      if (!isPlayer) { car.ai = new AIDriver(phys, line, opts.strength, botIdx + 1); botIdx++; }
      this.cars.push(car);
    }
    this.player = this.cars[playerSlot];
    this.placeGrid();
  }

  // griglia dopo il traguardo (il rettilineo prima è troppo corto): pole più avanti
  placeGrid() {
    const n = this.track.count, st = this.track.step;
    for (const c of this.cars) {
      const s = 178 - c.slot * 8;
      const i = Math.round(s / st) % n;
      c.phys.reset(i, c.slot % 2 === 0 ? 3.2 : -3.2);
      c.sPrev = c.phys.prCG.s;
      c.pass = [];
    }
  }

  progress(c) { return c.crossings * this.track.length + c.phys.prCG.s; }

  // un passo di simulazione per tutte le vetture (il giocatore riceve i propri comandi)
  // scia e aria sporca: chi segue da vicino ha meno resistenza ma anche meno carico
  slipstream() {
    const L = this.track.length;
    for (const c of this.cars) {
      const p = c.phys;
      let best = 1e9;
      for (const o of this.cars) {
        if (o === c || o.gone) continue;
        let g = o.phys.prCG.s - p.prCG.s;
        if (g < -L / 2) g += L; else if (g > L / 2) g -= L;
        if (g > 3 && g < best && Math.abs(o.phys.prCG.d - p.prCG.d) < 2.2) best = g;
      }
      const tow = best < 60 ? 1 - best / 60 : 0;
      p.dragMul = 1 - 0.38 * tow;
      p.downMul = best < 22 ? 1 - 0.12 * (1 - best / 22) : 1;
      c.tow = tow;
    }
  }

  step(dt, playerCmd, running) {
    if (running) this.t += dt;
    if (running) this.slipstream();
    for (const c of this.cars) {
      if (c.gone) continue;
      if (c.isPlayer) {
        c.phys.step(dt, playerCmd);
      } else {
        const cmd = running && !c.retired ? c.ai.drive(dt, this.cars, this.t) : { throttle: 0, brake: c.retired ? 0.6 : 1, steer: 0, autoGear: true, tc: true, abs: true };
        if (cmd.needRescue && !c.retired) { c.phys.reset(c.phys.prCG.i, 0, true); c.ai.stuck = 0; c.ai.lane = c.ai.laneTarget = 0; }
        c.phys.step(dt, cmd);
        const d = c.phys.damage;
        // guasti meccanici rari (circa 1 ogni 250 giri-vettura in modalità simulazione)
        if (running && !c.retired && !d.failure && c.phys.damageMode === 'sim' && Math.random() < dt / (55 * 250)) {
          d.failure = Math.random() < 0.6 ? 'engine' : 'gearbox';
          if (this.onEvent) this.onEvent(c, d.failure);
        }
        if (d.failure === 'gearbox' && !c.failT) c.failT = this.t;
        const limping = d.failure === 'gearbox' && this.t - c.failT > 25;
        // foratura: senza box il bot arranca per un po' e poi si ferma
        if (d.punctured.some(Boolean) && !c.punctT) c.punctT = this.t;
        const flat = c.punctT && this.t - c.punctT > 30;
        if (!c.retired && (c.phys.isWrecked() || limping || flat)) {
          c.retired = true; c.retireT = this.t;
          c.retireWhy = d.failure === 'engine' ? 'MOTORE' : d.failure === 'gearbox' ? 'CAMBIO' : flat ? 'FORATURA' : 'INCIDENTE';
          if (this.onEvent) this.onEvent(c, 'retired');
        }
        // dopo qualche secondo la vettura ritirata viene tolta dalla pista
        if (c.retired && this.t - c.retireT > 3) c.gone = true;
      }
    }
    this.collideCars();
    if (running) for (const c of this.cars) if (!c.gone) this.lapLogic(c, dt);
  }

  lapLogic(c, dt) {
    const L = this.track.length, s = c.phys.prCG.s, sp = c.sPrev;
    if (s > L * 0.4 && s < L * 0.6) c.halfway = true;
    if (sp > L - 80 && s < 80 && c.halfway && c.finishT == null) {
      const f = (L - sp) / ((L - sp) + s);
      const tc = this.t - dt + dt * f;
      if (c.crossings > 0) {
        const lap = tc - c.lapStart;
        c.lastLapT = lap;
        if (c.bestLap == null || lap < c.bestLap) c.bestLap = lap;
      }
      c.lapStart = tc;
      c.crossings++;
      c.halfway = false;
      if (c.crossings >= this.laps) c.finishT = tc;
    }
    // tempi di passaggio ogni 10 m (per i distacchi)
    if (c.finishT == null) {
      const b = Math.floor((c.crossings * L + s) / 10);
      if (b >= 0) while (c.pass.length <= b) c.pass.push(this.t);
    }
    c.sPrev = s;
  }

  collideCars() {
    const cars = this.cars;
    for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
      if (cars[a].gone || cars[b].gone) continue;
      const A = cars[a].phys, B = cars[b].phys;
      const dx = B.x - A.x, dz = B.z - A.z;
      if (dx * dx + dz * dz > 49 || Math.abs(A.y - B.y) > 2) continue;
      for (const [ax, ar] of CIRCLES) for (const [bx, br] of CIRCLES) {
        const pax = A.x + Math.cos(A.yaw) * ax, paz = A.z + Math.sin(A.yaw) * ax;
        const pbx = B.x + Math.cos(B.yaw) * bx, pbz = B.z + Math.sin(B.yaw) * bx;
        let nx = pbx - pax, nz = pbz - paz;
        const dist = Math.hypot(nx, nz), pen = ar + br - dist;
        if (pen <= 0 || dist < 1e-4) continue;
        nx /= dist; nz /= dist;
        // punto di contatto e bracci
        const cx = pax + nx * ar, cz = paz + nz * ar;
        const rax = cx - A.x, raz = cz - A.z, rbx = cx - B.x, rbz = cz - B.z;
        const vax = A.vx - A.yawRate * raz, vaz = A.vz + A.yawRate * rax;
        const vbx = B.vx - B.yawRate * rbz, vbz = B.vz + B.yawRate * rbx;
        const vn = (vbx - vax) * nx + (vbz - vaz) * nz;
        // separazione
        A.x -= nx * pen / 2; A.z -= nz * pen / 2; B.x += nx * pen / 2; B.z += nz * pen / 2;
        if (vn >= 0) continue;
        const ran = rax * nz - raz * nx, rbn = rbx * nz - rbz * nx;
        const e = 0.25;
        const j = -(1 + e) * vn / (1 / A.mass + 1 / B.mass + ran * ran / A.Iz + rbn * rbn / B.Iz);
        A.vx -= j * nx / A.mass; A.vz -= j * nz / A.mass; A.yawRate -= j * ran / A.Iz;
        B.vx += j * nx / B.mass; B.vz += j * nz / B.mass; B.yawRate += j * rbn / B.Iz;
        const impact = -vn;
        const partOf = (P, lx, cxw, czw) => {
          const side = -(cxw - P.x) * Math.sin(P.yaw) + (czw - P.z) * Math.cos(P.yaw); // >0 destra
          if (lx > 1) return side > 0.3 ? 'fwR' : side < -0.3 ? 'fwL' : 'nose';
          if (lx < -1) return side > 0.3 ? 'wRR' : side < -0.3 ? 'wRL' : 'rw';
          return side > 0 ? 'sideR' : 'sideL';
        };
        A.applyContactDamage(partOf(A, ax, cx, cz), impact);
        B.applyContactDamage(partOf(B, bx, cx, cz), impact);
        const info = { impact, part: 'car', x: cx, z: cz, y: (A.y + B.y) / 2 - 0.2, nx, nz, scrape: 0 };
        for (const fn of A.listeners.impact) fn({ ...info, nx: -nx, nz: -nz });
        for (const fn of B.listeners.impact) fn(info);
      }
    }
  }

  // classifica: arrivati per tempo, poi per distanza percorsa
  standings() {
    return this.cars.slice().sort((a, b) => {
      if (a.finishT != null && b.finishT != null) return a.finishT - b.finishT;
      if (a.finishT != null) return -1;
      if (b.finishT != null) return 1;
      if (a.retired !== b.retired) return a.retired ? 1 : -1;
      return this.progress(b) - this.progress(a);
    });
  }

  // distacco (s) di "behind" da "ahead", misurato al punto in cui si trova ora "behind"
  gap(ahead, behind) {
    const b = Math.floor(this.progress(behind) / 10);
    const t = ahead.pass[b];
    if (t == null) return null;
    return (behind.finishT ?? this.t) - t;
  }
}
