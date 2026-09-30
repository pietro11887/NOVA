import { ROAD_HALF_WIDTH as H } from './trackData.js';

// Pilota automatico. La "forza" (1-110) cambia davvero il ritmo:
// aderenza sfruttata in curva, punto di frenata, potenza, riflessi e precisione.

export function skillParams(strength) {
  const t = Math.max(0, Math.min(1, (strength - 1) / 109));
  return {
    // come nei simulatori: le vetture sono uguali (stesso motore, stessa velocità sul dritto),
    // la forza cambia quanto il pilota osa in curva e in frenata
    mu: 1.18 + 0.46 * Math.pow(t, 0.8), // 1 → 1.18   60 → 1.46   100 → 1.63   110 → 1.64
    brake: 0.64 + 0.2 * t,            // frazione della frenata massima
    power: 1 + 0.015 * Math.max(0, (strength - 100) / 10), // oltre 100 un filo di potenza in più
    reaction: 0.45 - 0.35 * t,        // secondi di ritardo allo spegnimento dei semafori
    wobble: 0.9 * (1 - t),            // imprecisione sulla traiettoria (m)
  };
}

export class AIDriver {
  constructor(phys, line, strength, seed) {
    this.phys = phys;
    this.line = line;
    this.seed = seed;
    this.rand = mulberry(seed * 7919 + 13);
    // carattere del pilota: aggressività (sorpassi, difesa, contatti)
    this.aggr = 0.2 + 0.8 * this.rand();
    this.setStrength(strength);
    this.lane = 0;          // scostamento dalla linea ideale per sorpassi / difesa / errori
    this.laneTarget = 0;
    this.t = 0;
    this.launchDelay = this.skill.reaction * (0.6 + 0.8 * this.rand());
    this.stuck = 0;
    this.zone = -1;         // zona di frenata già valutata
    this.exitZone = -1;
    this.mistake = null;    // { type, until, ... }
    this.attack = null;     // tentativo di sorpasso in staccata
    this.onEvent = null;    // callback per il cronista
  }

  setStrength(strength) {
    this.strength = strength;
    this.skill = skillParams(strength);
    const t = (strength - 1) / 109;
    this.profile = this.line.speedProfile(this.skill.mu, this.skill.brake);
    // profilo "all'attacco": staccata più profonda e un filo di velocità in più in curva
    this.attackProfile = this.line.speedProfile(Math.min(1.6, this.skill.mu * 1.02), Math.min(0.86, this.skill.brake + 0.1));
    // errori per giro: tanti per i principianti, rari (ma possibili) per i campioni
    this.errPerLap = 0.07 + 1.0 * Math.pow(1 - Math.min(1, t), 2);
    // punti di corda (minimi del profilo di velocità) e, per ogni punto, la prossima corda
    const P = this.profile, n = P.length;
    const apex = [];
    for (let i = 0; i < n; i++) {
      let isMin = true;
      for (let k = -20; k <= 20 && isMin; k++) if (k && P[(i + k + n) % n] < P[i]) isMin = false;
      if (!isMin) continue;
      let mx = 0; for (let k = 20; k < 200; k++) mx = Math.max(mx, P[(i - k + n) % n]);
      if (mx - P[i] > 12 && (!apex.length || i - apex[apex.length - 1] > 20)) apex.push(i);
    }
    this.nextApex = new Int32Array(n).fill(-1);
    if (apex.length) for (let i = 0; i < n; i++) {
      let best = -1, bd = 1e9;
      for (const a of apex) { const d = (a - i + n) % n; if (d < bd) { bd = d; best = a; } }
      this.nextApex[i] = best;
    }
    this.phys.powerScale = this.skill.power;
  }

  emit(kind) { if (this.onEvent) this.onEvent(kind); }

  // prossima curva che richiede una staccata (indice della corda) entro 'range' campioni, altrimenti -1
  nextBrake(i, v, range) {
    const n = this.line.track.count, a = this.nextApex[i];
    if (a < 0) return -1;
    const d = (a - i + n) % n;
    return d > 3 && d < range && this.profile[a] < v - 10 ? a : -1;
  }

  // lato interno della curva dopo la staccata (d > 0 = sinistra)
  insideAt(j) {
    const S = this.line.track.samples, n = this.line.track.count;
    let c = 0;
    for (let k = 0; k < 40; k += 2) c += S[(j + k) % n].curv;
    return c > 0 ? -1 : 1;   // curva a destra -> interno a destra (d negativo)
  }

  drive(dt, cars, raceT) {
    const p = this.phys, tr = this.line.track, n = tr.count, L = tr.length;
    const i = p.prCG.i;
    this.t += dt;
    const v = p.speed;
    const lim = H - 1.2;
    const myS = p.prCG.s, myD = p.prCG.d;
    const gapTo = c => { let g = c.phys.prCG.s - myS; if (g < -L / 2) g += L; else if (g > L / 2) g -= L; return g; };

    // --- scadenza di errori e attacchi ---
    if (this.mistake && this.t > this.mistake.until) this.mistake = null;
    if (this.attack && this.t > this.attack.until) this.attack = null;

    // --- traffico ---
    let vCap = Infinity, blocker = null, bestGap = 45 + v * 1.2, chaser = null, chaserGap = -14;
    let push = 0;
    for (const c of cars) {
      if (c.phys === p || c.retired || c.gone) continue;
      const g = gapTo(c), dd = c.phys.prCG.d - myD, lat = Math.abs(dd);
      if (g > 0 && g < bestGap && lat < 2.6) { bestGap = g; blocker = c; }
      if (g < 0 && g > chaserGap && lat < 3.5) { chaserGap = g; chaser = c; }
      // ruota a ruota: ci si allarga per non toccarsi (i più aggressivi tengono la linea)
      if (Math.abs(g) < 5.5 && lat < 2.4) push += -Math.sign(dd || 1) * (2.4 - lat) * (1.2 - this.aggr);
    }

    const brakeIdx = this.nextBrake(i, v, 90);
    if (blocker) {
      const ov = blocker.phys.speed, closing = v - ov;
      const od = blocker.phys.prCG.d;
      // 1) sorpasso in staccata: interno della curva e frenata ritardata
      if (!this.attack && brakeIdx >= 0 && bestGap < 28 && closing > -3 && closing < 10 && this.zone !== brakeIdx) {
        this.zone = brakeIdx;
        if (this.rand() < 0.25 + 0.6 * this.aggr) {
          const inside = this.insideAt(brakeIdx);
          this.attack = { until: this.t + 5, side: inside };
          this.emit('attack');
        }
      }
      // 2) sul dritto: scia e poi fuori
      const straight = this.profile[(i + 40) % n] > v + 5 || this.profile[(i + 25) % n] > 70;
      if (!this.attack && straight && brakeIdx < 0 && closing > -1) {
        const side = od > 0 ? -1 : 1;
        this.laneTarget = Math.max(-lim, Math.min(lim, od + side * 3.4)) - this.line.off[i];
      }
      // accodarsi a distanza di sicurezza (i più aggressivi stanno più vicini: a volte si tocca).
      // Anche in attacco finché non si è affiancati.
      const lat = Math.abs(od - myD);
      const want = 5 + v * 0.22 * (1 - 0.45 * this.aggr);
      // velocità con cui si riesce ancora a fermarsi dietro, anche se frena di colpo
      const room = Math.max(0, bestGap - 3.5 - 1.5 * (1 - this.aggr));
      const vSafe = Math.sqrt(ov * ov + 2 * 26 * room);
      if (!this.attack || lat < 2) vCap = Math.min(vSafe, bestGap < want + 12 ? ov + (bestGap - want) * 0.7 : Infinity);
      // vettura lenta o ferma davanti (testacoda, guasto): si scarta
      if (ov < v - 15 && bestGap < 80) {
        const side = od > 0 ? -1 : 1;
        this.laneTarget = Math.max(-lim, Math.min(lim, od + side * 3.6)) - this.line.off[i];
      }
    }
    // senza traffico, o prima di una staccata, si torna sulla traiettoria ideale
    if (!this.attack && (!blocker || brakeIdx >= 0)) this.laneTarget *= Math.max(0, 1 - dt * (brakeIdx >= 0 ? 2.5 : 0.4));
    if (this.attack) this.laneTarget = this.attack.side * (lim - 0.3) - this.line.off[i];

    // 3) difesa: chi è dietro e vicino prima di una staccata -> si copre l'interno
    if (!this.attack && !this.mistake && chaser && brakeIdx >= 0 && this.defZone !== brakeIdx && chaserGap > -12) {
      this.defZone = brakeIdx;
      if (this.rand() < this.aggr * 0.7) { this.mistake = { type: 'defend', until: this.t + 3.5, side: this.insideAt(brakeIdx) }; }
    }

    // --- errori umani ---
    const lapTime = 55;
    if (!this.mistake && brakeIdx >= 0 && this.lastZoneRoll !== brakeIdx && raceT > 4) {
      this.lastZoneRoll = brakeIdx;
      if (this.rand() < this.errPerLap / 5) {
        const r = this.rand(), sev = 0.4 + 0.6 * this.rand();
        if (r < 0.5) { this.mistake = { type: 'late', until: this.t + 4, meters: 12 + 45 * sev }; }
        else if (r < 0.72) { this.mistake = { type: 'lock', until: this.t + 2.5 }; }
        else { this.mistake = { type: 'wide', until: this.t + 3.5, side: -this.insideAt(brakeIdx), amount: 2.5 + 5 * sev }; }
        this.emit(this.mistake.type);
      }
    }
    // uscita di curva: troppo gas
    const exiting = this.profile[(i + 20) % n] > v + 8 && v < 55 && Math.abs(tr.samples[i].curv) > 0.008;
    if (!this.mistake && exiting && this.exitZone !== (i >> 5) && raceT > 4) {
      this.exitZone = i >> 5;
      if (this.rand() < this.errPerLap / 25) { this.mistake = { type: 'power', until: this.t + 1.4 }; this.emit('power'); }
    }
    void lapTime;

    let laneT = this.laneTarget + Math.max(-1.8, Math.min(1.8, push));
    const m = this.mistake;
    if (m && m.type === 'wide') laneT += m.side * m.amount;
    if (m && m.type === 'defend') laneT = m.side * (lim - 0.5) - this.line.off[i];
    this.lane += Math.max(-dt * 2.6, Math.min(dt * 2.6, laneT - this.lane));

    // --- sterzo: inseguimento di un punto sulla traiettoria ---
    const la = Math.round((6 + v * 0.3) / tr.step);
    const j = (i + la) % n, s = tr.samples[j];
    const wob = this.skill.wobble * Math.sin(this.t * 0.7 + this.seed * 3.1);
    let off = this.line.off[j] + this.lane + wob;
    const offLim = m && m.type === 'wide' ? H + 3 : H - 1.3;   // l'errore può portare fuori pista
    off = Math.max(-offLim, Math.min(offLim, off));
    const tx = s.x + s.nx * off, tz = s.z + s.nz * off;
    let ang = Math.atan2(tz - p.z, tx - p.x) - p.yaw;
    while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
    const steer = Math.max(-1, Math.min(1, ang / p.maxSteer(v)));

    // --- velocità ---
    const prof = this.attack ? this.attackProfile : this.profile;
    let look = 2;
    if (m && m.type === 'late') look += Math.round(m.meters / tr.step);   // frena come se la curva fosse più in là
    let vT = prof[(i + look) % n];
    // fuori dalla traiettoria ideale in curva c'è meno aderenza: si rallenta un po'
    const offLine = Math.abs(this.lane);
    if (offLine > 1 && vT < 75) vT *= 1 - Math.min(0.14, 0.028 * offLine);
    // con la vettura danneggiata (meno carico, sospensioni storte) si va più piano
    const dm = p.damage;
    const hurt = (0.45 * (dm.fwL + dm.fwR) / 2 + 0.45 * dm.rw + 0.3 * Math.max(...dm.susp) + 0.25 * dm.floor) * p.fx;
    let bend = 0;
    for (let k = 0; k < 60; k += 6) bend = Math.max(bend, Math.abs(tr.samples[(i + k) % n].curv));
    if (bend > 0.002) vT *= 1 - Math.min(0.4, hurt);
    if (dm.punctured.some(Boolean)) vT = Math.min(vT, 30);   // gomma a terra: si rientra piano
    vT = Math.min(vT, vCap);
    let throttle = 0, brake = 0, tc = true, abs = true;
    // gas e freno dosati (niente strappi a metà curva, che farebbero perdere il posteriore)
    const err = vT - v;
    if (err > 1) throttle = 1;
    else if (err > -2) throttle = Math.max(0.15, Math.min(1, 0.45 + 0.3 * err));
    else brake = Math.min(1, (-err - 1) / 4);
    if (m && m.type === 'lock' && brake > 0) { brake = 1; abs = false; }
    if (m && m.type === 'power') { throttle = 1; brake = 0; tc = false; }
    // partenza: tempo di reazione
    if (raceT < this.launchDelay) { throttle = 0; brake = 0; }

    // bloccato (in testacoda, contro un muro): si riparte
    if (raceT > 3 && v < 1.5) this.stuck += dt; else this.stuck = 0;
    const needRescue = this.stuck > 3.5;
    if (needRescue) { this.stuck = 0; this.mistake = null; this.attack = null; this.lane = this.laneTarget = 0; }

    return { throttle, brake, steer, shiftUp: false, shiftDown: false, autoGear: true, tc, abs, needRescue };
  }
}

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function rnd(seed) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }
