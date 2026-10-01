import { CarPhysics } from './physics.js';
import { AIDriver } from './ai.js';
import { CAR_SCALE } from './carModel.js';
import { SPEC } from './vehicle.js';
import { PitStop } from './pit.js';
import { PIT, TRACK } from './trackData.js';

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

const CIRCLES = SPEC.circles.map(([x, rad]) => [x * CAR_SCALE, rad * CAR_SCALE]); // [x locale, raggio]

export class Race {
  constructor(track, line, opts) {
    this.track = track;
    this.line = line;
    this.laps = opts.laps;
    // box solo nelle gare lunghe (da 8 giri)
    this.pitLane = opts.laps >= 8 ? opts.pitLane : null;
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
        team: isPlayer ? opts.playerTeam || null : null,
        crossings: 0, halfway: false, finishT: null, lastLapT: null, bestLap: null, lapStart: 0,
        pass: [], sPrev: 0,
        pit: null, pitRequest: null, stops: 0, plan: [],
      };
      phys.damageMode = opts.damageMode || 'sim';
      // Formula 1: piloti e scuderie veri; le scuderie di testa sono un filo più veloci
      let strength = opts.strength;
      if (!isPlayer && opts.grid && opts.grid[botIdx]) {
        const e = opts.grid[botIdx];
        car.name = e.name; car.team = e.team;
        car.color = parseInt(e.team.colors[0].slice(1), 16); car.accent = parseInt(e.team.colors[1].slice(1), 16);
        strength = Math.max(1, Math.min(110, strength + (e.team.tier - 1.5) * 4));
      }
      if (isPlayer && opts.playerTeam) car.color = parseInt(opts.playerTeam.colors[0].slice(1), 16);
      if (!isPlayer) { car.ai = new AIDriver(phys, line, strength, botIdx + 1); botIdx++; }
      this.cars.push(car);
    }
    this.player = this.cars[playerSlot];
    this.placeGrid();
    // benzina per tutta la gara (circa 1,9 kg al giro) più un margine
    for (const c of this.cars) { c.phys.fuel = Math.min(110, this.laps * 1.9 + 2); c.phys.mass = c.phys.baseMass + c.phys.fuel; }
    // gomme di partenza e strategia dei bot (una sosta, due nelle gare lunghe)
    for (const c of this.cars) {
      c.phys.fitTyres(c.isPlayer ? (opts.startCompound || 'M') : 'M');
      c.phys.inPit = false;
      if (!c.isPlayer && this.pitLane) {
        const stops = this.laps >= 20 ? 2 : 1;
        for (let k = 1; k <= stops; k++) {
          const lap = Math.round(this.laps * k / (stops + 1) + (Math.random() - 0.5) * this.laps * 0.2);
          c.plan.push(Math.max(2, Math.min(this.laps - 1, lap)));
        }
      }
    }
  }

  // griglia dopo il traguardo (il rettilineo prima è troppo corto): pole più avanti
  placeGrid() {
    const n = this.track.count, st = this.track.step;
    for (const c of this.cars) {
      const G = TRACK.grid;
      const s = G.pole - c.slot * G.gap;   // piazzole in fila (vetture grandi)
      const i = Math.round(s / st) % n;
      c.phys.reset(i, c.slot % 2 === 0 ? G.lat : -G.lat);
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
        if (o === c || o.gone || o.pit) continue;
        let g = o.phys.prCG.s - p.prCG.s;
        if (g < -L / 2) g += L; else if (g > L / 2) g -= L;
        if (g > 3 && g < best && Math.abs(o.phys.prCG.d - p.prCG.d) < 2.8) best = g;
      }
      const tow = best < 60 ? 1 - best / 60 : 0;
      p.dragMul = 1 - 0.38 * tow;
      p.downMul = best < 22 ? 1 - SPEC.dirtyAir * (1 - best / 22) : 1;   // poco carico: l'aria sporca conta poco
      c.tow = tow;
    }
  }

  step(dt, playerCmd, running) {
    if (running) this.t += dt;
    if (running) this.slipstream();
    for (const c of this.cars) {
      if (c.gone) continue;
      // in corsia box la vettura segue il percorso (niente fisica)
      if (c.pit) {
        if (!running) continue;
        const wasService = c.pit.phase === 'service';
        const out = c.pit.step(dt);
        if (wasService && c.pit.phase === 'out' && this.onEvent) this.onEvent(c, 'serviced', c.pit);
        if (out) { c.stops++; if (this.onEvent) this.onEvent(c, 'pitOut', c.pit); c.pit = null; }
        continue;
      }
      if (running && this.pitLane) this.pitLogic(c);
      if (c.pit) continue;
      if (c.isPlayer) {
        c.phys.step(dt, playerCmd);
      } else {
        const cmd = running && !c.retired ? c.ai.drive(dt, this.cars, this.t) : { throttle: 0, brake: c.retired ? 0.6 : 1, steer: 0, autoGear: true, tc: true, abs: true };
        if (cmd.needRescue && !c.retired) { c.phys.reset(c.phys.prCG.i, 0, true); c.ai.stuck = 0; c.ai.lane = c.ai.laneTarget = 0; }
        c.phys.step(dt, cmd);
        const d = c.phys.damage;
        // guasti meccanici rari (circa 1 ogni 400 giri-vettura in modalità simulazione)
        if (running && !c.retired && !d.failure && c.phys.damageMode === 'sim' && Math.random() < dt / (55 * 400)) {
          d.failure = Math.random() < 0.6 ? 'engine' : 'gearbox';
          if (this.onEvent) this.onEvent(c, d.failure);
        }
        if (d.failure === 'gearbox' && !c.failT) c.failT = this.t;
        const limping = d.failure === 'gearbox' && this.t - c.failT > 25;
        // foratura: senza box il bot arranca per un po' e poi si ferma
        if (d.punctured.some(Boolean) && !c.punctT) c.punctT = this.t;
        // (con i box il bot rientra piano a cambiare la gomma)
        const flat = !this.pitLane && c.punctT && this.t - c.punctT > 30;
        if (!c.retired && c.finishT == null && (c.phys.isWrecked() || limping || flat)) {
          c.retired = true; c.retireT = this.t;
          c.retireWhy = d.failure === 'engine' ? 'MOTORE' : d.failure === 'gearbox' ? 'CAMBIO' : flat ? 'FORATURA' : 'INCIDENTE';
          if (this.onEvent) this.onEvent(c, 'retired');
        }
        // la vettura ritirata resta dov'è: fuori pista la portano via dopo un po', sulla
        // carreggiata è un ostacolo (arriva la safety car e la rimuovono i commissari)
        if (c.retired && !c.gone) {
          const offTrack = Math.abs(c.phys.prCG.d) > 10;
          if ((offTrack && this.t - c.retireT > 20) || this.t - c.retireT > 60) c.gone = true;
        }
      }
    }
    this.collideCars();
    if (running) for (const c of this.cars) if (!c.gone) this.lapLogic(c, dt);
  }

  // decide e gestisce l'ingresso ai box
  pitLogic(c) {
    const L = this.track.length, s = c.phys.prCG.s, ss = s > L / 2 ? s - L : s;
    const sp = c.pitPrev ?? ss;
    c.pitPrev = ss;
    const lapNow = c.crossings + 1, left = this.laps - c.crossings;
    if (!c.isPlayer && !c.retired && !c.pitRequest && c.finishT == null && left >= 1) {
      const d = c.phys.damage;
      const flat = d.punctured.some(Boolean);
      // si rientra per i danni solo se mancano abbastanza giri per recuperare il tempo perso
      const hurt = flat || (left >= 3 && (d.fwL + d.fwR > 0.8 || d.rw > 0.5 || Math.max(...d.susp) > 0.5));
      const planned = left >= 2 && c.plan.length && lapNow >= c.plan[0];
      const worn = left >= 3 && c.phys.wheels.some(w => w.wear > 0.8);
      if (planned || hurt || worn) {
        const rem = this.laps - lapNow;
        c.pitRequest = { compound: rem >= 12 ? 'H' : rem >= 5 ? 'M' : 'S', repair: hurt || d.fwL + d.fwR > 0.2 };
        if (planned) c.plan.shift();
      }
    }
    if (c.ai) c.ai.pitting = !!c.pitRequest;
    // si entra passando dall'imbocco della corsia (lato destro della pista)
    const crossing = sp < PIT.entry && ss >= PIT.entry && ss - sp < 20;
    // il giocatore entra quando vuole: basta passare dall'imbocco tenendo la destra.
    // Gomme e riparazione le sceglie mentre la vettura va da sola verso la piazzola.
    const hwHere = this.track.samples[c.phys.prCG.i].hw, dSide = c.phys.prCG.d * PIT.side;   // >0 = verso i box
    if (c.isPlayer && crossing && !c.retired && c.finishT == null && dSide > hwHere * 0.45) {
      c.pitRequest = { compound: c.phys.compound, repair: false };
    }
    if (c.pitRequest && !c.retired && c.finishT == null && crossing && dSide > -hwHere * 0.2) {
      c.pit = new PitStop(this.pitLane, c, c.pitRequest);
      c.pitRequest = null;
      if (c.ai) c.ai.pitting = false;
      if (this.onEvent) this.onEvent(c, 'pitIn', c.pit);
    }
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
      if (c.crossings >= this.laps) c.finishT = tc + (c.penalty || 0);   // penalità in secondi
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
      if (cars[a].gone || cars[b].gone || cars[a].pit || cars[b].pit) continue;
      const A = cars[a].phys, B = cars[b].phys;
      const dx = B.x - A.x, dz = B.z - A.z;
      if (dx * dx + dz * dz > 81 || Math.abs(A.y - B.y) > 2) continue;
      // un solo contatto per coppia: la coppia di cerchi più compenetrata
      // (prima ogni coppia applicava il suo urto e un tocco valeva 2-3 urti)
      let best = null;
      for (const [ax, ar] of CIRCLES) for (const [bx, br] of CIRCLES) {
        const pax = A.x + Math.cos(A.yaw) * ax, paz = A.z + Math.sin(A.yaw) * ax;
        const pbx = B.x + Math.cos(B.yaw) * bx, pbz = B.z + Math.sin(B.yaw) * bx;
        const nx = pbx - pax, nz = pbz - paz;
        const dist = Math.hypot(nx, nz), pen = ar + br - dist;
        if (pen <= 0 || dist < 1e-4) continue;
        if (!best || pen > best.pen) best = { ax, ar, bx, pax, paz, nx: nx / dist, nz: nz / dist, pen };
      }
      if (!best) continue;
      const { ax, ar, bx, pax, paz, nx, nz, pen } = best;
      // punto di contatto e bracci
      const cx = pax + nx * ar, cz = paz + nz * ar;
      const rax = cx - A.x, raz = cz - A.z, rbx = cx - B.x, rbz = cz - B.z;
      const vax = A.vx - A.yawRate * raz, vaz = A.vz + A.yawRate * rax;
      const vbx = B.vx - B.yawRate * rbz, vbz = B.vz + B.yawRate * rbx;
      const vn = (vbx - vax) * nx + (vbz - vaz) * nz;
      // separazione morbida (niente "scatti" di posizione)
      const corr = Math.min(pen, 0.02 + pen * 0.4) / 2;
      A.x -= nx * corr; A.z -= nz * corr; B.x += nx * corr; B.z += nz * corr;
      if (vn >= 0) continue;
      const impact = -vn;
      // inerzia d'imbardata coerente con le dimensioni (scalate) della vettura;
      // nei tocchi leggeri pneumatici e sospensioni assorbono quasi tutta la rotazione
      const soft = Math.min(1, Math.max(0.25, (impact - 1.5) / 6));
      const IzA = A.Iz * CAR_SCALE * CAR_SCALE / soft, IzB = B.Iz * CAR_SCALE * CAR_SCALE / soft;
      const ran = rax * nz - raz * nx, rbn = rbx * nz - rbz * nx;
      const e = impact < 3 ? 0.05 : 0.15;
      const j = -(1 + e) * vn / (1 / A.mass + 1 / B.mass + ran * ran / IzA + rbn * rbn / IzB);
      A.vx -= j * nx / A.mass; A.vz -= j * nz / A.mass; A.yawRate -= j * ran / IzA;
      B.vx += j * nx / B.mass; B.vz += j * nz / B.mass; B.yawRate += j * rbn / IzB;
      // sfregamento tra le carrozzerie (attrito limitato)
      const tx = -nz, tz = nx;
      const vt = ((B.vx - B.yawRate * rbz) - (A.vx - A.yawRate * raz)) * tx + ((B.vz + B.yawRate * rbx) - (A.vz + A.yawRate * rax)) * tz;
      const rat = rax * tz - raz * tx, rbt = rbx * tz - rbz * tx;
      let jt = -vt / (1 / A.mass + 1 / B.mass + rat * rat / IzA + rbt * rbt / IzB);
      const maxJt = 0.15 * j;
      jt = Math.max(-maxJt, Math.min(maxJt, jt));
      A.vx -= jt * tx / A.mass; A.vz -= jt * tz / A.mass; A.yawRate -= jt * rat / IzA;
      B.vx += jt * tx / B.mass; B.vz += jt * tz / B.mass; B.yawRate += jt * rbt / IzB;
      const partOf = (P, lx, cxw, czw) => {
        const side = -(cxw - P.x) * Math.sin(P.yaw) + (czw - P.z) * Math.cos(P.yaw); // >0 destra
        if (lx > 1) return side > 0.3 ? 'fwR' : side < -0.3 ? 'fwL' : 'nose';
        if (lx < -1) return side > 0.3 ? 'wRR' : side < -0.3 ? 'wRL' : 'rw';
        return side > 0 ? 'sideR' : 'sideL';
      };
      A.applyContactDamage(partOf(A, ax, cx, cz), impact);
      B.applyContactDamage(partOf(B, bx, cx, cz), impact);
      const info = { impact, part: 'car', x: cx, z: cz, y: (A.y + B.y) / 2 - 0.2, nx, nz, scrape: Math.abs(vt) };
      for (const fn of A.listeners.impact) fn({ ...info, nx: -nx, nz: -nz });
      for (const fn of B.listeners.impact) fn(info);
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
