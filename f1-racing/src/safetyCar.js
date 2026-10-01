import * as THREE from 'three';
import { GEOM } from './carModel.js';
import { PIT } from './trackData.js';

// Safety car: entra dopo un incidente che lascia abbastanza rottami sulla carreggiata,
// raccoglie il gruppo dietro di sé, i commissari puliscono la pista, dopo almeno un giro
// rientra ai box e al traguardo si riparte. Durante la neutralizzazione non si sorpassa.

const WEIGHT = { wheel: 2, wing: 1.5, splitter: 1, end: 0.35, part: 0.5 };

export class SafetyCar {
  constructor({ race, track, line, debris, scene, model }) {
    this.race = race; this.track = track; this.line = line; this.debris = debris; this.scene = scene;
    this.model = model;           // vettura (stessa interfaccia di createCar) o null
    this.phase = 'off';           // off | out | in (rientra in questo giro) | restart (attesa traguardo)
    this.D = 0; this.v = 0; this.t = 0;
    this.checkT = 0; this.cleanT = 0;
    this.onEvent = null;
    if (model) {
      model.root.visible = false;
      scene.add(model.root);
      // barra luci arancioni sul tetto
      const mat = new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xff8a00, emissiveIntensity: 0 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 1.3), mat);
      bar.position.set(-0.45, 0.875, 0);
      model.body.add(bar);
      this.lightMat = mat;
    }
  }

  get active() { return this.phase !== 'off'; }
  L() { return this.track.length; }
  dist(c) { return c.crossings * this.L() + c.phys.prCG.s; }

  // vetture in pista, dalla prima all'ultima (fisicamente, non per giri)
  order() {
    return this.race.cars.filter(c => !c.gone && !c.retired && !c.pit && c.finishT == null).sort((a, b) => this.dist(b) - this.dist(a));
  }

  // quanta "roba" c'è sulla carreggiata
  debrisScore() {
    let sc = 0;
    const pr = this._pr || (this._pr = {});
    for (const it of this.debris.items) {
      const o = it.obj.position;
      this.track.project(o.x, o.z, it.hint >= 0 ? it.hint : -1, pr);
      if (Math.abs(pr.d) < this.track.samples[pr.i].hw + 1.5) sc += WEIGHT[it.kind] ?? 0.5;
    }
    // vetture ferme (ritirate) sulla carreggiata o appena fuori
    for (const c of this.race.cars) if (c.retired && !c.gone) {
      const d = Math.abs(c.phys.prCG.d), hw = this.track.samples[c.phys.prCG.i].hw;
      if (d < hw + 2) sc += 3; else if (d < hw + 5) sc += 1.5;
    }
    return sc;
  }

  update(dt) {
    const race = this.race;
    this.t += dt;
    if (this.phase === 'off') {
      this.checkT += dt;
      if (this.checkT < 1) return;
      this.checkT = 0;
      const lead = this.order()[0];
      if (!lead || race.laps - lead.crossings < 2 || race.t < 8) return;
      if (this.debrisScore() >= 3) this.deploy(lead);
      return;
    }
    const L = this.L(), ord = this.order(), lead = ord[0];
    if (!lead) { this.end(); return; }
    // pulizia: un pezzo alla volta, lontano dalle vetture
    this.cleanT += dt;
    if (this.cleanT > (this.t < 12 ? 99 : 2.5)) {
      this.cleanT = 0;
      const far = (x, z, self) => race.cars.every(c => c === self || c.gone || c.retired || Math.hypot(c.phys.x - x, c.phys.z - z) > 70);
      // prima le vetture ferme (carro attrezzi), poi i rottami
      const wreck = race.cars.find(c => c.retired && !c.gone && far(c.phys.x, c.phys.z, c));
      if (wreck) { wreck.gone = true; if (this.onEvent) this.onEvent('towed', wreck); }
      else {
        const it = this.debris.items.find(it => far(it.obj.position.x, it.obj.position.z, null));
        if (it) this.debris.removeItem(it);
      }
    }
    // safety car in pista
    if (this.phase === 'out' || this.phase === 'in') {
      const s = ((this.D % L) + L) % L, i = Math.floor(s / this.track.step) % this.track.count;
      const gapLead = this.D - this.dist(lead);
      // ritmo da neutralizzazione: ~130 km/h al massimo, più piano in curva
      let vT = Math.min(36, this.line.speed[i] * 0.85 + 2);
      // aspetta il gruppo: se il primo è lontano va più piano
      if (gapLead > 60) vT = Math.min(vT, 26);
      this.v += Math.max(-12 * dt, Math.min(6 * dt, vT - this.v));
      this.D += this.v * dt;
      // rientro: dopo almeno un giro e con la pista pulita
      if (this.phase === 'out' && this.t > 40 && lead.crossings > this.startLap && this.debrisScore() < 0.5) {
        this.phase = 'in'; this.inLap = lead.crossings;
        if (this.onEvent) this.onEvent('in');
      }
      // in questo giro entra in corsia box (all'imbocco sparisce)
      if (this.phase === 'in') {
        const ss = s > L / 2 ? s - L : s;
        if (lead.crossings === this.inLap && ss > PIT.entry - 15 && ss < PIT.entry + 15) { this.phase = 'restart'; if (this.model) this.model.root.visible = false; }
      }
      this.pose(dt);
    }
    // bandiera verde: si smette subito di guidare il gruppo (niente limiti rimasti ai bot)
    if (this.phase === 'restart' && lead.crossings > this.inLap) { this.end(); return; }
    if (this.lightMat) this.lightMat.emissiveIntensity = this.phase === 'out' ? (Math.sin(this.t * 12) > 0 ? 3 : 0.2) : 0;
    this.guide(ord);
  }

  deploy(lead) {
    this.phase = 'out'; this.t = 0; this.cleanT = 0;
    this.startLap = lead.crossings;
    this.D = this.dist(lead) + 220;
    this.v = 30;
    this.overtakes = 0;
    if (this.model) this.model.root.visible = true;
    this.lastOrder = this.order().map(c => c.id ?? c.slot);
    if (this.onEvent) this.onEvent('out');
  }

  end() {
    this.phase = 'off'; this.checkT = -5;
    if (this.model) this.model.root.visible = false;
    for (const c of this.race.cars) if (c.ai) c.ai.sc = null;
    if (this.onEvent) this.onEvent('green');
  }

  // velocità massima per ogni bot: in fila, a distanza costante, senza attacchi
  guide(ord) {
    if (this.phase === 'off') return;
    const scD = this.phase === 'restart' ? null : this.D;
    let prevD = scD, prevV = this.v;
    for (let k = 0; k < ord.length; k++) {
      const c = ord[k], myD = this.dist(c);
      if (c.ai) {
        let cap;
        if (prevD == null) cap = Math.max(18, c.phys.speed);       // il primo al restart detta il ritmo
        else {
          const target = k === 0 && scD != null ? 26 : 16, gap = prevD - myD;
          cap = gap > 120 ? 999 : Math.max(6, prevV + (gap - target) * 0.7);
        }
        if (this.phase === 'restart' && k === 0) cap = Math.min(cap, 32);
        c.ai.sc = { vCap: cap };
      }
      prevD = myD; prevV = c.phys.speed;
    }
  }

  pose(dt) {
    const m = this.model;
    if (!m) return;
    const L = this.L(), s = ((this.D % L) + L) % L, tr = this.track, n = tr.count;
    const f = s / tr.step, i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, k = f - Math.floor(f);
    const a = tr.samples[i0], b = tr.samples[i1];
    const off = this.line.off[i0] * (1 - k) + this.line.off[i1] * k;
    const x = a.x + (b.x - a.x) * k + a.nx * off, z = a.z + (b.z - a.z) * k + a.nz * off, y = a.y + (b.y - a.y) * k;
    const ahead = tr.samples[(i0 + 3) % n];
    const yaw = Math.atan2(ahead.z + ahead.nz * this.line.off[(i0 + 3) % n] - z, ahead.x + ahead.nx * this.line.off[(i0 + 3) % n] - x);
    m.root.position.set(x, y + GEOM.cgHeight, z);
    m.root.rotation.set(0, -yaw, 0);
    const S = m.scale || 1;
    m.body.position.y = (GEOM.cgHeight + 0.02) * S - GEOM.cgHeight;
    for (const w of m.wheels) { w.angle -= this.v / GEOM.wheelR * dt; w.spin.rotation.z = w.angle; }
  }

  // la safety car è davanti a questa distanza?
  isAhead(c) { return (this.phase === 'out' || this.phase === 'in') && this.D > this.dist(c); }

  dispose() { if (this.model) this.scene.remove(this.model.root); }
}
