import { GEOM } from './carModel.js';
import { SURF, SURF_PROPS } from './track.js';

// Dinamica del veicolo: modello a 4 ruote con pneumatici "Pacejka" semplificati,
// ellisse d'attrito, sospensioni molla-smorzatore (beccheggio / rollio / scuotimento),
// trasferimento di carico, aerodinamica (carico e resistenza), motore e cambio a 8 marce.

const G = 9.81, RHO = 1.225;

const TORQUE_CURVE = [ // [rpm, frazione della coppia massima]
  [0, 0.5], [4000, 0.62], [6000, 0.78], [8000, 0.9], [9500, 0.98], [10500, 1.0], [11500, 0.97], [12500, 0.86], [13000, 0.0],
];
function torqueAt(rpm) {
  for (let i = 1; i < TORQUE_CURVE.length; i++) {
    const [r1, t1] = TORQUE_CURVE[i];
    if (rpm <= r1) {
      const [r0, t0] = TORQUE_CURVE[i - 1];
      return t0 + (t1 - t0) * (rpm - r0) / (r1 - r0);
    }
  }
  return 0;
}

// aderenza in funzione di temperatura (finestra ideale ~90–110 °C), usura e spiattellamenti
function tyreGrip(w) {
  const t = w.temp ?? 95;
  const dT = t < 90 ? 90 - t : t > 110 ? t - 110 : 0;
  const temp = Math.max(0.8, 1 - 0.00012 * dT * dT);
  return temp * (1 - 0.22 * (w.wear || 0)) * (1 - 0.06 * (w.flat || 0));
}
export { tyreGrip };

// Punti dello scafo usati per le collisioni: [x, y(destra), parte]
const HULL = [
  [3.28, -0.95, 'fwL'], [3.28, 0.95, 'fwR'], [3.3, 0, 'nose'],
  [1.9, -1.0, 'wFL'], [1.9, 1.0, 'wFR'],
  [0.2, -0.85, 'sideL'], [0.2, 0.85, 'sideR'],
  [-1.7, -1.02, 'wRL'], [-1.7, 1.02, 'wRR'],
  [-2.4, -0.52, 'rw'], [-2.4, 0.52, 'rw'],
];

export class CarPhysics {
  constructor(track) {
    this.track = track;
    this.baseMass = 798;            // vettura + pilota, senza benzina
    this.fuel = 5;                  // kg di benzina
    this.mass = this.baseMass + this.fuel;
    this.Iz = 1150;
    this.Ipitch = 950;
    this.Iroll = 300;
    this.a = GEOM.axleF;            // baricentro -> asse anteriore
    this.b = -GEOM.axleR;           // baricentro -> asse posteriore
    this.tw = GEOM.halfTrack;
    this.R = GEOM.wheelR;
    this.h = GEOM.cgHeight;
    this.gears = [17.0, 13.6, 11.2, 9.3, 7.8, 6.6, 5.5, 4.55];
    this.reverseRatio = 14;
    this.maxRpm = 12500;
    this.idleRpm = 4000;
    this.peakTorque = 650;          // Nm (~ 1000 CV con l'ibrido)
    this.powerScale = 1;
    this.gripScale = 1;
    this.gearLong = 1;              // rapporti più lunghi per chi ha più potenza             // aderenza extra dei bot più forti (livelli "sovrumani")
    this.dragMul = 1;               // scia: < 1 quando si segue da vicino un'altra vettura
    this.downMul = 1;               // aria sporca: meno carico dietro a un'altra vettura
    this.damageMode = 'sim';        // sim | reduced | cosmetic (come nei simulatori)
    this.ClA = 4.6;                 // coefficiente di portanza * area
    this.CdA = 1.22;
    this.aeroBalance = 0.43;        // quota di carico sull'anteriore
    this.mu = 1.8;                  // aderenza pneumatici slick
    this.springK = 150000;
    this.damperC = 7200;
    this.arbK = [120000, 60000];   // barre antirollio ant./post. (più rigida davanti = vettura sottosterzante al limite)
    this.rearGrip = 1.1;            // gomme posteriori più larghe
    this.maxBrakeForce = 41000;
    this.brakeBias = 0.57;
    this.wheels = [
      { x: this.a, y: -this.tw }, { x: this.a, y: this.tw },
      { x: -this.b, y: -this.tw }, { x: -this.b, y: this.tw },
    ].map(w => ({
      ...w, fz: 0, comp: 0, ground: 0, groundRaw: 0, surf: SURF.ROAD, slide: 0, spin: 0,
      lock: false, spinning: false, pr: {}, sf: {}, slipAngle: 0, onKerb: false,
    }));
    this.prCG = {};
    this.listeners = { impact: [] };
    this.reset(this.track.count - 4, 0);
  }

  on(ev, fn) { this.listeners[ev].push(fn); }

  reset(index, lateral = 0, keepDamage = false) {
    const s = this.track.samples[(index + this.track.count) % this.track.count];
    this.x = s.x + s.nx * lateral; this.z = s.z + s.nz * lateral;
    this.yaw = Math.atan2(s.tz, s.tx);
    this.vx = 0; this.vz = 0; this.yawRate = 0;
    this.y = s.y + this.h; this.vy = 0;
    this.pitch = 0; this.pitchRate = 0; this.roll = 0; this.rollRate = 0;
    this.steer = 0;
    this.gear = 1; this.rpm = this.idleRpm; this.shiftTimer = 0; this.revTimer = 0;
    this.limiter = false;
    this.hint = index;
    this.speed = 0; this.vxl = 0; this.vyl = 0;
    this.gLat = 0; this.gLong = 0;
    this.kerbVibe = 0;
    this.throttleOut = 0;
    this.wheelSpinAngle = 0;
    for (const w of this.wheels) {
      w.comp = 0.013; w.fz = this.mass * G / 4; w.ground = s.y; w.groundInit = true; w.spin = 0;
      if (!keepDamage) { w.temp = 82; w.wear = 0; w.flat = 0; }   // gomme già scaldate dalle termocoperte
    }
    if (!keepDamage) { this.engTemp = 95; this.brakeTemp = 400; }
    if (!keepDamage) this.damage = { fwL: 0, fwR: 0, rw: 0, susp: [0, 0, 0, 0], engine: 0, floor: 0, radiator: 0, gearbox: 0, puncture: [0, 0, 0, 0], punctured: [false, false, false, false], failure: null };
    this.projectAll();
    let avg = 0;
    for (const w of this.wheels) { w.ground = w.pr.y + w.sf.h; avg += w.ground / 4; }
    this.y = avg + this.h;
    for (const w of this.wheels) w.comp = w.ground + this.h + 0.013 - this.y;
  }

  // effetto dei danni sulla guida: 0 con danni solo estetici
  get fx() { return this.damageMode === 'cosmetic' ? 0 : 1; }

  totalDamage() {
    const d = this.damage;
    return Math.min(1, (d.fwL + d.fwR) * 0.15 + d.rw * 0.2 + d.susp.reduce((a, b) => a + b, 0) * 0.15 + d.engine * 0.4);
  }

  projectAll() {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    this.track.project(this.x, this.z, this.hint, this.prCG);
    this.hint = this.prCG.i;
    for (const w of this.wheels) {
      const wx = this.x + cy * w.x - sy * w.y;
      const wz = this.z + sy * w.x + cy * w.y;
      this.track.project(wx, wz, this.hint, w.pr, 6);
      this.track.surface(w.pr, w.sf);
    }
  }

  maxSteer(v) { return 0.33 / (1 + v / 18.5) + 0.014; }

  step(dt, inp) {
    // la benzina si consuma: la vettura si alleggerisce durante la gara
    this.fuel = Math.max(0, this.fuel - dt * (0.004 + 0.05 * Math.max(0, inp.throttle)) * (this.rpm / 12000));
    this.mass = this.baseMass + this.fuel;
    const m = this.mass, dmg = this.damage;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    // velocità nel riferimento vettura
    const vxl = this.vx * cy + this.vz * sy;
    const vyl = -this.vx * sy + this.vz * cy;
    const r = this.yawRate;
    const speed = Math.hypot(this.vx, this.vz);
    this.vxl = vxl; this.vyl = vyl; this.speed = speed;

    // --- comandi ---
    let throttle = inp.throttle, brake = inp.brake;
    if (this.gear === -1) { const t = throttle; throttle = brake; brake = t; }
    // retromarcia automatica: freno tenuto a vettura ferma
    if (this.gear === 1 && speed < 0.8 && inp.brake > 0.5 && inp.throttle < 0.05) {
      this.revTimer += dt; if (this.revTimer > 0.5) { this.gear = -1; this.revTimer = 0; }
    } else if (this.gear === -1 && speed < 0.8 && inp.throttle > 0.3) {
      this.gear = 1;
    } else this.revTimer = 0;

    const targetSteer = inp.steer * this.maxSteer(speed);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 14);

    // --- cambio ---
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    if (this.gear > 0) {
      const gb = dmg.gearbox * this.fx;
      if (inp.shiftUp && this.gear < 8) { this.gear++; this.shiftTimer = 0.05 + gb * 0.25; }
      if (inp.shiftDown && this.gear > 1) {
        const nr = Math.abs(vxl) / this.R * this.gears[this.gear - 2] / this.gearLong * 60 / (2 * Math.PI);
        if (nr < this.maxRpm + 300) { this.gear--; this.shiftTimer = 0.04; }
      }
      if (inp.autoGear) {
        if (this.gear < 8 && this.shiftTimer <= 0 && ((this.rpm > 11850 && throttle > 0.2) || this.rpm > 12400)) { this.gear++; this.shiftTimer = 0.05 + gb * 0.25; }
        else if (this.gear > 1 && this.shiftTimer <= 0) {
          const nr = Math.abs(vxl) / this.R * this.gears[this.gear - 2] / this.gearLong * 60 / (2 * Math.PI);
          const low = throttle > 0.5 ? 7200 : 8600;
          if (this.rpm < low && nr < 11300) { this.gear--; this.shiftTimer = 0.04; }
        }
      }
    }

    // --- motore ---
    const ratio = this.gear === -1 ? -this.reverseRatio : this.gears[this.gear - 1] / this.gearLong;
    const rearV = (Math.abs(vxl) + Math.abs(this.wheels[2].spin) + Math.abs(this.wheels[3].spin)) / 1;
    let rpmWheel = Math.abs(vxl) / this.R * Math.abs(ratio) * 60 / (2 * Math.PI);
    let rpmTarget = rpmWheel;
    const clutchSlip = this.gear === 1 || this.gear === -1;
    if (clutchSlip) rpmTarget = Math.max(rpmWheel, this.idleRpm + throttle * 5500);
    const spinning = this.wheels[2].spinning || this.wheels[3].spinning;
    if (spinning) rpmTarget = Math.max(rpmWheel, Math.min(this.maxRpm, this.rpm + throttle * 12000 * dt * 4));
    rpmTarget = Math.max(this.idleRpm, rpmTarget);
    this.rpm += (Math.min(this.maxRpm + 400, rpmTarget) - this.rpm) * Math.min(1, dt * 20);
    this.limiter = this.rpm >= this.maxRpm - 50;
    const dfx = this.fx;
    let torque = torqueAt(this.rpm) * this.peakTorque * this.powerScale * throttle * (1 - dmg.engine * 0.6 * dfx);
    if (dmg.failure && dfx) torque *= dmg.failure === 'engine' ? 0 : 0.35;   // guasto meccanico
    if (this.rpm >= this.maxRpm) torque = 0;
    if (throttle < 0.05 && this.gear > 0) torque = -(35 + this.rpm * 0.0045);
    if (this.shiftTimer > 0) torque *= 0.1;
    // temperatura motore: sale col carico, il radiatore danneggiato raffredda meno
    const heat = 6 * throttle * (this.rpm / 12000);
    const cool = (this.engTemp - 60) * (0.02 + 0.0012 * speed) * (1 - 0.75 * dmg.radiator * dfx);
    this.engTemp += (heat - cool) * dt;
    if (this.engTemp > 128 && dfx) dmg.engine = Math.min(1, dmg.engine + (this.engTemp - 128) * 0.0006 * dt);
    let driveForce = torque * ratio * 0.92 / this.R;
    if (this.gear === -1) driveForce = Math.max(driveForce, -2500);
    if (Math.abs(vxl) < 0.5 && throttle < 0.05) driveForce = 0;
    this.throttleOut = throttle;

    // --- aerodinamica ---
    const q = 0.5 * RHO * vxl * vxl;
    const fwD = (dmg.fwL + dmg.fwR) / 2 * dfx;
    const floorL = 1 - 0.3 * dmg.floor * dfx;
    // ala anteriore asimmetrica: il lato rotto perde carico e la vettura tira da una parte
    const fBase = q * this.ClA * this.aeroBalance * this.downMul * floorL * 0.5;
    const downFL = fBase * (1 - 0.7 * dmg.fwL * dfx), downFR = fBase * (1 - 0.7 * dmg.fwR * dfx);
    const downF = downFL + downFR;
    const downR = q * this.ClA * (1 - this.aeroBalance) * (1 - 0.7 * dmg.rw * dfx) * this.downMul * floorL;
    const drag = q * (this.CdA - 0.2 * dmg.rw * dfx + 0.1 * fwD) * this.dragMul;
    // la gomma forata si sgonfia in pochi secondi
    for (let k = 0; k < 4; k++) if (dmg.punctured[k] && dmg.puncture[k] < 1) dmg.puncture[k] = Math.min(1, dmg.puncture[k] + dt / 4);

    // --- sospensioni: altezza del terreno sotto ogni ruota ---
    this.projectAll();
    let sumFz = 0, pitchM = 0, rollM = 0;
    let vibe = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const raw = w.pr.y + w.sf.h;
      // il pneumatico "filtra" le asperità più piccole (le nervature del cordolo)
      w.ground += (raw - w.ground) * Math.min(1, dt * 45);
      w.onKerb = w.sf.type === SURF.KERB || w.sf.type === SURF.SAUSAGE;
      if (w.onKerb) vibe += Math.min(1, speed / 25) * (w.sf.type === SURF.SAUSAGE ? 1.8 : 1);
      else if (w.sf.type === SURF.GRASS || w.sf.type === SURF.GRAVEL) vibe += Math.min(1, speed / 30) * 0.5;
      const cornerY = this.y + w.x * this.pitch - w.y * this.roll;
      const comp = w.ground + this.h + 0.013 - cornerY;
      const compRate = (comp - w.comp) / dt;
      w.comp = comp;
      w.compRate = compRate;
    }
    for (const w of this.wheels) vibe += w.flat * Math.min(1, speed / 30) * 0.8;
    this.kerbVibe = vibe;
    for (let axle = 0; axle < 2; axle++) {
      const L = this.wheels[axle * 2], Rw = this.wheels[axle * 2 + 1];
      const arb = this.arbK[axle] * (L.comp - Rw.comp);
      for (const [w, sgn] of [[L, 1], [Rw, -1]]) {
        // smorzatore digressivo (valvole di sfogo): limita i picchi sui cordoli
        const cr = Math.max(-0.9, Math.min(0.9, w.compRate));
        let f = this.springK * w.comp + this.damperC * cr + sgn * arb;
        if (w.comp > 0.075) f += this.springK * 8 * (w.comp - 0.075);      // tampone di fine corsa
        if (w.comp <= 0) f = 0;                                               // ruota sollevata
        w.fz = Math.max(0, f);
      }
    }
    for (const w of this.wheels) {
      sumFz += w.fz;
      pitchM += w.x * w.fz;
      rollM += -w.y * w.fz;
    }
    pitchM += -downF * this.a + downR * this.b;
    rollM += 0.6 * (downFR - downFL);

    // --- pneumatici ---
    let Fxb = 0, Fyb = 0, Mz = 0;
    // freni: si scaldano frenando, raffreddano con l'aria; oltre ~950 °C perdono efficacia
    const brakeFade = this.brakeTemp > 950 ? Math.max(0.7, 1 - (this.brakeTemp - 950) / 1000) : 1;
    const brakeF = brake * this.maxBrakeForce * brakeFade;
    this.brakeTemp += (brake * speed * 1.4 - (this.brakeTemp - 200) * (0.004 + 0.0006 * speed)) * dt * 4;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const front = i < 2;
      const toe = (i % 2 === 0 ? -1 : 1) * dmg.susp[i] * 0.045 * dfx;
      const delta = (front ? this.steer : 0) + toe;
      const cd = Math.cos(delta), sd = Math.sin(delta);
      const wvx = vxl - r * w.y, wvy = vyl + r * w.x;
      const vlong = wvx * cd + wvy * sd;
      const vlat = -wvx * sd + wvy * cd;
      const props = SURF_PROPS[w.sf.type];
      const load = w.fz;
      const loadSens = Math.max(0.62, 1 - 0.07 * (load / 2000 - 1));
      const mu = this.mu * this.gripScale * (front ? 1 : this.rearGrip) * props.grip * loadSens * (1 - 0.35 * dmg.susp[i] * dfx) * (1 - 0.7 * dmg.puncture[i] * dfx) * tyreGrip(w);
      const Fmax = mu * load;

      // longitudinale
      let fx = 0;
      if (!front) fx += driveForce / 2;
      const bf = brakeF * (front ? this.brakeBias : 1 - this.brakeBias) / 2;
      const roll = (props.roll + 0.08 * dmg.puncture[i] * dfx) * load + (w.sf.type === SURF.GRAVEL ? 0.004 * load * Math.abs(vlong) : 0);
      const resist = bf + roll;
      // a bassa velocità le forze resistive non devono invertire il moto
      const stopCap = Math.abs(vlong) * m / 4 / dt * 0.5;
      fx -= Math.sign(vlong) * Math.min(resist, stopCap);
      w.lock = false; w.spinning = false;
      let latScale = 1;
      // laterale (formula "magica" semplificata)
      const alpha = Math.atan2(vlat, Math.max(Math.abs(vlong), 3));
      w.slipAngle = alpha;
      let fy = -Fmax * Math.sin(1.65 * Math.atan(12 * alpha));
      // gli aiuti elettronici lasciano sempre margine per la tenuta laterale
      const fxAid = Math.sqrt(Math.max(0, Fmax * Fmax - fy * fy)) * 0.92 + Fmax * 0.06;
      const isDrive = !front && Math.sign(fx) === Math.sign(driveForce) && Math.abs(driveForce) > 0 && throttle > 0.05;
      w.tcActive = false;
      if (isDrive && inp.tc && Math.abs(fx) > fxAid) { fx = Math.sign(fx) * fxAid; w.tcActive = true; }
      else if (!isDrive && inp.abs && Math.abs(vlong) > 1.5 && Math.abs(fx) > fxAid) fx = Math.sign(fx) * fxAid;
      if (Math.abs(fx) > Fmax && load > 0) {
        if (isDrive) { fx = Math.sign(fx) * Fmax * 0.8; w.spinning = true; latScale = 0.45; }
        else if (Math.abs(vlong) > 1.5) w.lock = true;
        else fx = Math.sign(fx) * Fmax;
      }
      let fxOut = fx, fyOut;
      if (w.lock) {
        // ruota bloccata: scivola nella direzione del moto
        const vs = Math.hypot(vlong, vlat) || 1;
        fxOut = -0.82 * Fmax * vlong / vs;
        fyOut = -0.82 * Fmax * vlat / vs;
      } else {
        const fyCap = Math.sqrt(Math.max(0, Fmax * Fmax - fx * fx)) * latScale;
        fyOut = Math.max(-fyCap, Math.min(fyCap, fy));
      }
      // intensità di slittamento (per suoni, fumo e segni sull'asfalto)
      const over = Math.max(0, Math.abs(alpha) - 0.1) * 5;
      w.slide = Math.min(1, (w.lock ? 1 : 0) + (w.spinning ? 0.9 : 0) + over) * Math.min(1, speed / 6);
      if (load <= 0) w.slide = 0;
      // rotazione visiva della ruota
      w.spin = w.lock ? 0 : (w.spinning ? vlong + 15 * throttle : vlong);
      // temperatura e usura: il calore viene dallo strisciamento
      const slipV = Math.abs(vlat) + (w.lock || w.spinning ? Math.abs(vlong) * 0.6 : Math.abs(vlong) * 0.03 * Math.abs(fxOut) / Math.max(1, Fmax));
      const power = (Math.abs(fyOut) + Math.abs(fxOut)) * slipV;
      // calore = strisciamento + isteresi della gomma che rotola sotto carico; si raffredda con l'aria
      w.temp += (power / 70000 + 0.055 * speed * Math.pow(Math.max(0, load) / 3000, 0.25) - (w.temp - 28) * (0.02 + 0.0006 * speed)) * dt;
      w.wear = Math.min(1, w.wear + power * dt * 9e-9 * (w.temp > 115 ? 2 : 1));
      if (w.lock && speed > 12) w.flat = Math.min(1, w.flat + dt * 0.12);   // spiattellamento

      const bx = fxOut * cd - fyOut * sd;
      const by = fxOut * sd + fyOut * cd;
      Fxb += bx; Fyb += by;
      Mz += w.x * by - w.y * bx;
    }

    // --- momenti di beccheggio / rollio dovuti alle forze al suolo ---
    pitchM += this.h * Fxb;
    rollM += -this.h * Fyb;

    // aerodinamica sul piano
    Fxb -= Math.sign(vxl) * drag;
    Fyb -= vyl * 0.5 * RHO * Math.abs(vyl) * 1.2; // resistenza laterale

    this.gLong = Fxb / m / G;
    this.gLat = Fyb / m / G;

    // --- integrazione ---
    const pr = this.prCG;
    let fxw = cy * Fxb - sy * Fyb;
    let fzw = sy * Fxb + cy * Fyb;
    // componente della gravità lungo la pendenza
    fxw -= m * G * pr.slope * pr.tx;
    fzw -= m * G * pr.slope * pr.tz;
    this.vx += fxw / m * dt;
    this.vz += fzw / m * dt;
    this.yawRate += Mz / this.Iz * dt;
    // smorzamento a bassa velocità (evita tremolii da fermi)
    if (speed < 0.4 && throttle < 0.05) { this.vx *= 0.9; this.vz *= 0.9; this.yawRate *= 0.9; }
    this.yaw += this.yawRate * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    const ay = (sumFz - m * G - downF - downR) / m;
    this.vy += ay * dt;
    this.y += this.vy * dt;
    this.pitchRate += pitchM / this.Ipitch * dt;
    this.rollRate += rollM / this.Iroll * dt;
    this.pitch += this.pitchRate * dt;
    this.roll += this.rollRate * dt;
    // limiti di sicurezza (la vettura non si ribalta in questo modello)
    this.pitch = Math.max(-0.35, Math.min(0.35, this.pitch));
    this.roll = Math.max(-0.35, Math.min(0.35, this.roll));
    // non si può affondare nel terreno
    const minY = Math.min(this.wheels[0].ground, this.wheels[1].ground, this.wheels[2].ground, this.wheels[3].ground) + 0.02;
    if (this.y < minY) { this.y = minY; if (this.vy < 0) this.vy = 0; }

    this.collide(dt);
    this.wheelSpinAngle += 0; // gestito dalla grafica
  }

  collide(dt) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const pr = this._pr || (this._pr = {}), sf = this._sf || (this._sf = {});
    let deepest = null;
    // lontano dai muri non serve controllare lo scafo
    const sc = this.track.samples[this.prCG.i];
    if (Math.abs(this.prCG.d) + 4 < Math.min(sc.wallL, sc.wallR)) return;
    for (const [hx, hy, part] of HULL) {
      const px = this.x + cy * hx - sy * hy;
      const pz = this.z + sy * hx + cy * hy;
      this.track.project(px, pz, this.hint, pr, 6);
      const wall = pr.d > 0 ? this.track.samples[pr.i].wallL : this.track.samples[pr.i].wallR;
      const pen = Math.abs(pr.d) - wall;
      if (pen <= 0) continue;
      const sgn = pr.d > 0 ? 1 : -1;
      const nx = -sgn * pr.nx, nz = -sgn * pr.nz; // verso la pista
      const rx = px - this.x, rz = pz - this.z;
      // velocità del punto di contatto
      const vpx = this.vx - this.yawRate * rz;
      const vpz = this.vz + this.yawRate * rx;
      const vn = vpx * nx + vpz * nz;
      // correzione di posizione
      this.x += nx * pen; this.z += nz * pen;
      if (vn >= 0) continue;
      const rn = rx * nz - rz * nx;
      const e = 0.28;
      const j = -(1 + e) * vn / (1 / this.mass + rn * rn / this.Iz);
      this.vx += j * nx / this.mass; this.vz += j * nz / this.mass;
      this.yawRate += j * rn / this.Iz;
      // attrito sul muro
      const tx = -nz, tz = nx;
      const vt = (this.vx - this.yawRate * rz) * tx + (this.vz + this.yawRate * rx) * tz;
      const rt = rx * tz - rz * tx;
      let jt = -vt / (1 / this.mass + rt * rt / this.Iz);
      const maxJt = 0.45 * j;
      jt = Math.max(-maxJt, Math.min(maxJt, jt));
      this.vx += jt * tx / this.mass; this.vz += jt * tz / this.mass;
      this.yawRate += jt * rt / this.Iz;
      const impact = -vn;
      if (!deepest || impact > deepest.impact) deepest = { impact, part, x: px, z: pz, y: pr.y, nx, nz, scrape: Math.abs(vt) };
    }
    if (deepest) {
      this.applyDamage(deepest.part, deepest.impact);
      for (const fn of this.listeners.impact) fn(deepest);
    }
  }

  // scala dell'accumulo: danni ridotti = metà
  get dmgScale() { return this.damageMode === 'reduced' ? 0.5 : 1; }

  // urto contro barriere
  applyDamage(part, impact) {
    const d = this.damage;
    const amt = Math.max(0, impact - 2.5) / 22 * this.dmgScale;
    if (amt <= 0) return;
    const add = (k, v) => { d[k] = Math.min(1, d[k] + v); };
    const susp = (i, v) => { d.susp[i] = Math.min(1, d.susp[i] + v); };
    switch (part) {
      case 'fwL': add('fwL', amt * 1.8); susp(0, amt * 0.3); break;
      case 'fwR': add('fwR', amt * 1.8); susp(1, amt * 0.3); break;
      case 'nose': add('fwL', amt * 1.5); add('fwR', amt * 1.5); break;
      case 'wFL': susp(0, amt * 1.1); add('fwL', amt * 0.5); this.maybePuncture(0, impact, 0.04); break;
      case 'wFR': susp(1, amt * 1.1); add('fwR', amt * 0.5); this.maybePuncture(1, impact, 0.04); break;
      case 'sideL': susp(0, amt * 0.4); susp(2, amt * 0.4); add('floor', amt * 0.8); add('radiator', amt * 1.2); break;
      case 'sideR': susp(1, amt * 0.4); susp(3, amt * 0.4); add('floor', amt * 0.8); add('radiator', amt * 1.2); break;
      case 'wRL': susp(2, amt * 1.1); this.maybePuncture(2, impact, 0.04); break;
      case 'wRR': susp(3, amt * 1.1); this.maybePuncture(3, impact, 0.04); break;
      case 'rw': add('rw', amt * 1.5); add('engine', amt * 0.3); add('floor', amt * 0.5); add('gearbox', amt * 1.0); break;
    }
    if (impact > 16) add('engine', (impact - 16) / 40 * this.dmgScale);
  }

  // contatto tra vetture: le ali sono fragili, le ruote possono forarsi o piegare la sospensione
  applyContactDamage(part, impact) {
    const d = this.damage, k = this.dmgScale;
    const add = (key, v) => { if (v > 0) d[key] = Math.min(1, d[key] + v * k); };
    const susp = (i, v) => { if (v > 0) d.susp[i] = Math.min(1, d.susp[i] + v * k); };
    switch (part) {
      case 'fwL': add('fwL', (impact - 3) / 9); break;
      case 'fwR': add('fwR', (impact - 3) / 9); break;
      case 'nose': add('fwL', (impact - 3) / 10); add('fwR', (impact - 3) / 10); break;
      case 'rw': add('rw', (impact - 3) / 10); add('floor', (impact - 3) / 15); add('gearbox', (impact - 4) / 18); break;
      case 'sideL': case 'sideR': add('floor', (impact - 3) / 14); add('radiator', (impact - 3) / 10); break;
      case 'wFL': case 'wFR': case 'wRL': case 'wRR': {
        const i = { wFL: 0, wFR: 1, wRL: 2, wRR: 3 }[part];
        susp(i, (impact - 3) / 12);
        this.maybePuncture(i, impact, 0.05);
        break;
      }
    }
  }

  maybePuncture(i, impact, p) {
    const d = this.damage;
    if (this.damageMode !== 'sim' || d.punctured[i] || impact < 4) return;
    if (Math.random() < p * Math.min(1, (impact - 3) / 6)) {
      d.punctured[i] = true;
      for (const fn of this.listeners.impact) fn({ impact: 0, part: 'puncture', wheel: i, x: this.x, y: this.y, z: this.z, nx: 0, nz: 0, scrape: 0 });
    }
  }

  // la vettura deve ritirarsi?
  isWrecked() {
    const d = this.damage;
    if (this.damageMode === 'cosmetic') return false;
    const lim = this.damageMode === 'reduced' ? 1.5 : 1;   // con danni ridotti non ci si arriva quasi mai
    return d.engine >= lim || d.susp.some(x => x >= lim) || d.failure === 'engine';
  }
}
