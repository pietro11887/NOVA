import { clamp, rand, randInt } from '../core/utils.js';
import { Vehicle } from './vehicle.js';
import { Ped } from './pedestrian.js';
import { driveTo } from './traffic.js';

const MAX_CARS = 4;
const MAX_COPS = 5;

/**
 * Sistema di ricercato: pattuglie che inseguono, agenti a piedi che
 * scendono dall'auto, arresto e perdita delle stelle.
 */
export class PoliceManager {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.cops = [];
    this.spawnCd = 0;
    this.arrestT = 0;

    for (let i = 0; i < MAX_CARS; i++) {
      const v = new Vehicle(game.city, { kind: 'police' });
      v.mesh.visible = false;
      v.active = false;
      v.node = null; v.target = null;
      game.worldGroup.add(v.mesh);
      this.cars.push(v);
    }
    for (let i = 0; i < MAX_COPS; i++) {
      const c = new Ped(game.city, 'cop');
      c.mesh.visible = false;
      c.active = false;
      game.worldGroup.add(c.mesh);
      this.cops.push(c);
    }
  }

  get activeCars() { return this.cars.filter((c) => c.active); }

  reset() {
    for (const v of this.cars) { v.active = false; v.mesh.visible = false; v.driver = null; }
    for (const c of this.cops) { c.active = false; c.mesh.visible = false; }
    this.arrestT = 0;
  }

  _spawnCar() {
    const p = this.game.player;
    const v = this.cars.find((c) => !c.active);
    if (!v) return;
    const nodes = this.game.city.roadNodes;
    let n = null;
    for (let k = 0; k < 60; k++) {
      const c = nodes[randInt(0, nodes.length - 1)];
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 55 && d < 130) { n = c; break; }
    }
    if (!n) n = nodes[randInt(0, nodes.length - 1)];
    v.place(n.x, n.z, rand(0, Math.PI * 2));
    v.health = 100;
    v.active = true;
    v.mesh.visible = true;
    v.node = n;
    v.copsOut = false;
  }

  _spawnCop(x, z) {
    const c = this.cops.find((k) => !k.active);
    if (!c) return null;
    c.active = true;
    c.mesh.visible = true;
    c.spawnFree(x + rand(-1.5, 1.5), z + rand(-1.5, 1.5));
    c.state = 'chase';
    c.health = 60;
    return c;
  }

  update(dt) {
    const game = this.game, p = game.player;
    const wanted = game.wanted;

    // ---- popolamento pattuglie
    this.spawnCd -= dt;
    const wantCars = wanted === 0 ? 0 : clamp(wanted, 1, MAX_CARS);
    // mentre il giocatore sta seminando non arrivano rinforzi, altrimenti
    // non si riuscirebbe mai a far scendere le stelle
    if (this.activeCars.length < wantCars && this.spawnCd <= 0 && !game.evading) {
      this._spawnCar();
      this.spawnCd = 3.5 - wanted * 0.4;
    }
    if (wanted === 0) {
      for (const v of this.cars) {
        if (v.active && Math.hypot(v.x - p.x, v.z - p.z) > 120) { v.active = false; v.mesh.visible = false; }
      }
      for (const c of this.cops) {
        if (c.active && Math.hypot(c.x - p.x, c.z - p.z) > 90) { c.active = false; c.mesh.visible = false; }
      }
    }

    // ---- inseguimento in auto
    const nodes = game.city.roadNodes;
    for (const v of this.cars) {
      if (!v.active) continue;
      v.updateSiren(game.time);
      const d = Math.hypot(v.x - p.x, v.z - p.z);

      let ctrl;
      if (d < 34) {
        // vista libera: punta dritto al bersaglio
        ctrl = driveTo(v, p.x, p.z, d < 9 ? 0.45 : 0.95);
      } else {
        // navigazione greedy sul reticolo stradale
        if (!v.node) v.node = nodes[0];
        if (!v.target || Math.hypot(v.target.x - v.x, v.target.z - v.z) < 7) {
          let best = null, bd = Infinity;
          for (const k of v.node.links) {
            const n = nodes[k];
            const dd = Math.hypot(n.x - p.x, n.z - p.z);
            if (dd < bd) { bd = dd; best = n; }
          }
          v.node = v.target || v.node;
          v.target = best || v.node;
        }
        ctrl = driveTo(v, v.target.x, v.target.z, 0.95);
      }
      if (game.blockedAhead(v, 8)) ctrl.throttle = Math.min(ctrl.throttle, -0.3);
      v.update(dt, ctrl);

      // agenti a piedi quando il giocatore e' fuori dall'auto
      if (!p.inCar && !v.copsOut && d < 26 && wanted >= 1) {
        v.copsOut = true;
        const n = wanted >= 3 ? 2 : 1;
        for (let i = 0; i < n; i++) this._spawnCop(v.x, v.z);
      }
      if (p.inCar && v.copsOut && d > 60) v.copsOut = false;

      if (v.health <= 0) { v.active = false; v.mesh.visible = false; game.explode(v.x, v.z); }
    }

    // ---- agenti a piedi
    for (const c of this.cops) {
      if (!c.active) continue;
      if (c.state === 'down' && c.timer <= 0) { c.active = false; c.mesh.visible = false; continue; }
      const busy = c.state === 'down' || c.state === 'getup' || c.state === 'flinch';
      if (!busy) c.state = p.dead ? 'idle' : 'chase';
      c.update(dt, game);
      if (Math.hypot(c.x - p.x, c.z - p.z) > 160) { c.active = false; c.mesh.visible = false; }
    }

    // ---- arresto: agente addosso al giocatore a piedi
    if (wanted > 0 && !p.inCar && !p.dead) {
      const near = this.cops.some((c) => c.active && c.state === 'chase' &&
        Math.hypot(c.x - p.x, c.z - p.z) < 2.2);
      this.arrestT = near ? this.arrestT + dt : Math.max(0, this.arrestT - dt * 2);
      if (this.arrestT > 1.6) { this.arrestT = 0; game.busted(); }
    } else {
      this.arrestT = 0;
    }

    // ---- speronamento dell'auto del giocatore
    if (p.inCar) {
      for (const v of this.cars) {
        if (!v.active) continue;
        const rel = v.collideWith(p.car);
        if (rel > 7) { p.damage(rel * 0.35, 'polizia'); game.audio.crash(rel); }
      }
    }
  }

  /** Fine dell'inseguimento: le pattuglie si ritirano. */
  standDown() {
    for (const v of this.cars) { v.active = false; v.mesh.visible = false; v.copsOut = false; }
    for (const c of this.cops) { c.active = false; c.mesh.visible = false; }
    this.arrestT = 0;
  }

  /** Il poliziotto piu' vicino (per colpi del giocatore). */
  nearestCop(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const c of this.cops) {
      if (!c.active || c.state === 'down') continue;
      const dd = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (dd < bd) { bd = dd; best = c; }
    }
    return best;
  }
}
