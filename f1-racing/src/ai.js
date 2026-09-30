import { ROAD_HALF_WIDTH as H } from './trackData.js';

// Pilota automatico. La "forza" (1-110) cambia davvero il ritmo:
// aderenza sfruttata in curva, punto di frenata, potenza, riflessi e precisione.

export function skillParams(strength) {
  const t = Math.max(0, Math.min(1, (strength - 1) / 109));
  return {
    mu: 0.72 + 0.93 * t,              // 1 → 0.72   100 → 1.57   110 → 1.65
    brake: 0.5 + 0.34 * t,            // frazione della frenata massima
    power: 0.84 + 0.2 * t,            // 110 → poco più potente della tua vettura
    reaction: 0.55 - 0.45 * t,        // secondi di ritardo allo spegnimento dei semafori
    wobble: 0.9 * (1 - t),            // imprecisione sulla traiettoria (m)
  };
}

export class AIDriver {
  constructor(phys, line, strength, seed) {
    this.phys = phys;
    this.line = line;
    this.setStrength(strength);
    this.lane = 0;          // scostamento dalla linea ideale per sorpassi / difesa
    this.laneTarget = 0;
    this.seed = seed;
    this.t = 0;
    this.launchDelay = this.skill.reaction * (0.6 + 0.8 * rnd(seed));
    this.stuck = 0;
  }

  setStrength(strength) {
    this.strength = strength;
    this.skill = skillParams(strength);
    this.profile = this.line.speedProfile(this.skill.mu, this.skill.brake);
    this.phys.powerScale = this.skill.power;
  }

  // cars: tutte le vetture in gara (per il traffico); raceT: secondi dalla partenza
  drive(dt, cars, raceT) {
    const p = this.phys, tr = this.line.track, n = tr.count;
    const i = p.prCG.i;
    this.t += dt;
    const v = p.speed;

    // --- traffico: vettura davanti sulla stessa traiettoria ---
    let vCap = Infinity;
    const myS = p.prCG.s, myD = p.prCG.d;
    let blocker = null, bestGap = 45;
    for (const c of cars) {
      if (c.phys === p || c.retired) continue;
      let gap = c.phys.prCG.s - myS;
      if (gap < -tr.length / 2) gap += tr.length; else if (gap > tr.length / 2) gap -= tr.length;
      if (gap <= 0 || gap > bestGap) continue;
      const lat = Math.abs(c.phys.prCG.d - myD);
      if (lat < 2.6) { bestGap = gap; blocker = c; }
    }
    if (blocker) {
      const ov = blocker.phys.speed;
      const closing = v - ov;
      // tratto veloce davanti? allora si prova il sorpasso, altrimenti si accoda
      const straight = this.profile[(i + 40) % n] > v + 5 || this.profile[(i + 25) % n] > 70;
      if (straight && closing > -1) {
        const od = blocker.phys.prCG.d;
        const side = od > 0 ? -1 : 1;           // si passa dall'altra metà della pista
        const wanted = od + side * 3.4;
        this.laneTarget = Math.max(-(H - 1.2), Math.min(H - 1.2, wanted)) - this.line.off[i];
      }
      if (bestGap < 14) vCap = ov + (bestGap - 7) * 0.8;
    } else {
      this.laneTarget *= Math.max(0, 1 - dt * 0.4);
    }
    this.lane += Math.max(-dt * 2.2, Math.min(dt * 2.2, this.laneTarget - this.lane));

    // --- sterzo: inseguimento di un punto sulla traiettoria ---
    const la = Math.round((6 + v * 0.3) / tr.step);
    const j = (i + la) % n, s = tr.samples[j];
    const wob = this.skill.wobble * Math.sin(this.t * 0.7 + this.seed * 3.1);
    let off = this.line.off[j] + this.lane + wob;
    off = Math.max(-(H - 1.0), Math.min(H - 1.0, off));
    const tx = s.x + s.nx * off, tz = s.z + s.nz * off;
    let ang = Math.atan2(tz - p.z, tx - p.x) - p.yaw;
    while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
    const steer = Math.max(-1, Math.min(1, ang / p.maxSteer(v)));

    // --- velocità ---
    let vT = Math.min(this.profile[(i + 2) % n], vCap);
    let throttle = 0, brake = 0;
    if (v < vT - 1) throttle = 1;
    else if (v < vT) throttle = 0.4;
    else if (v > vT + 1.5) brake = Math.min(1, (v - vT) / 4);
    // partenza: tempo di reazione
    if (raceT < this.launchDelay) { throttle = 0; brake = 0; }

    // bloccato (in testacoda, contro un muro): si riparte
    if (raceT > 3 && v < 1.5) this.stuck += dt; else this.stuck = 0;
    const needRescue = this.stuck > 3 || Math.abs(p.prCG.d) > H + 12;

    return { throttle, brake, steer, shiftUp: false, shiftDown: false, autoGear: true, tc: true, abs: true, needRescue };
  }
}

function rnd(seed) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }
