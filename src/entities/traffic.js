import { clamp, angleDelta, rand, randInt, pick } from '../core/utils.js';
import { CFG } from '../core/config.js';
import { Vehicle } from './vehicle.js';
import { CAR_TYPES, CAR_COLORS } from '../world/models.js';

const LANE = 2.4;

/** Comandi di guida per raggiungere un punto: usato da traffico e polizia. */
export function driveTo(v, tx, tz, cruise = 0.6) {
  const dx = tx - v.x, dz = tz - v.z;
  const want = Math.atan2(-dz, dx);
  const err = angleDelta(v.a, want);
  const steer = clamp(err * 1.45, -1, 1);
  // in curva si alza il piede
  const throttle = cruise * clamp(1.15 - Math.abs(err) * 0.9, 0.18, 1);
  return { throttle, steer, hand: false, err, dist: Math.hypot(dx, dz) };
}

// il traffico non e' fatto solo di berline: ogni tipo ha il suo peso
const TYPE_WEIGHTS = [
  ['sedan', 30], ['suv', 18], ['pickup', 12], ['sport', 10],
  ['van', 10], ['bus', 6], ['ambulance', 4],
];
function weightedType() {
  const total = TYPE_WEIGHTS.reduce((a, t) => a + t[1], 0);
  let r = Math.random() * total;
  for (const [name, w] of TYPE_WEIGHTS) { r -= w; if (r <= 0) return name; }
  return 'sedan';
}

class TrafficCar {
  constructor(city, kind = 'civil') {
    const type = kind === 'taxi' ? 'sedan' : weightedType();
    const forced = type === 'ambulance' ? 'ambulance' : type === 'bus' ? 'bus' : kind;
    this.v = new Vehicle(city, { type, kind: forced, color: pick(CAR_COLORS) });
    this.city = city;
    this.node = null;
    this.target = null;
    this.cruise = rand(0.42, 0.72);
    this.patience = 0;
  }

  respawn(px, pz, minD = 45, maxD = 145) {
    const nodes = this.city.roadNodes;
    let n = null;
    for (let k = 0; k < 60; k++) {
      const c = nodes[randInt(0, nodes.length - 1)];
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d > minD && d < maxD && c.links.length) { n = c; break; }
    }
    if (!n) n = nodes[randInt(0, nodes.length - 1)];
    this.node = n;
    this.target = nodes[pick(n.links)];
    const a = Math.atan2(-(this.target.z - n.z), this.target.x - n.x);
    // posizionato in corsia di destra rispetto al senso di marcia
    this.v.place(n.x + this._rx(a) * LANE, n.z + this._rz(a) * LANE, a);
    this.v.speed = rand(4, 11);
    this.v.health = 100;
    return this;
  }

  _rx(a) { return Math.sin(a); }     // componente x del vettore "destra"
  _rz(a) { return Math.cos(a); }     // componente z del vettore "destra"

  /** Sceglie il prossimo incrocio: dritto quando puo', altrimenti svolta. */
  _advance() {
    const nodes = this.city.roadNodes;
    const cur = this.target;
    const from = this.node;
    const dirX = Math.sign(cur.i - from.i), dirZ = Math.sign(cur.j - from.j);
    const straight = nodes.find((n) => n.i === cur.i + dirX && n.j === cur.j + dirZ);
    const opts = cur.links.map((k) => nodes[k]).filter((n) => n !== from);
    let next;
    if (straight && Math.random() < 0.62) next = straight;
    else next = opts.length ? pick(opts) : from;
    this.node = cur;
    this.target = next;
  }

  update(dt, game) {
    const v = this.v;
    if (!this.target) this.respawn(game.player.x, game.player.z);

    const a = Math.atan2(-(this.target.z - this.node.z), this.target.x - this.node.x);
    const tx = this.target.x + this._rx(a) * LANE;
    const tz = this.target.z + this._rz(a) * LANE;
    const ctrl = driveTo(v, tx, tz, this.cruise);

    // semaforo: ci si ferma prima dell'incrocio se la propria corsia e' rossa
    const axis = Math.abs(this.target.x - this.node.x) > Math.abs(this.target.z - this.node.z) ? 0 : 1;
    const dist = Math.hypot(this.target.x - v.x, this.target.z - v.z);
    let stop = false;
    if (game.trafficAxis !== axis && dist < 13 && dist > 5.5) stop = true;

    // ostacolo davanti (auto o giocatore)
    const ahead = game.blockedAhead(v, 10);
    if (ahead) stop = true;

    if (stop) {
      ctrl.throttle = -0.55;
      this.patience += dt;
      if (this.patience > 6 && ahead) { ctrl.throttle = 0.3; }   // sposta l'auto bloccata
      if (this.patience > 3.5 && this.patience < 3.7) game.audio.horn();
    } else {
      this.patience = 0;
    }

    v.update(dt, ctrl);
    if (dist < 6.5) this._advance();
    if (v.health <= 0) { v.health = 100; this.respawn(game.player.x, game.player.z); }
  }
}

export class TrafficManager {
  constructor(game, max) {
    this.game = game;
    this.cars = [];
    this.parked = [];
    for (let i = 0; i < max; i++) {
      const t = new TrafficCar(game.city, Math.random() < 0.12 ? 'taxi' : 'civil');
      t.respawn(0, 0, 25, 150);
      game.worldGroup.add(t.v.mesh);
      this.cars.push(t);
    }
    this._spawnParked(game.quality.parked);
  }

  _spawnParked(n) {
    const spots = this.game.city.parkSpots.slice();
    for (let i = 0; i < n && spots.length; i++) {
      const s = spots.splice((Math.random() * spots.length) | 0, 1)[0];
      const v = new Vehicle(this.game.city, {});
      v.place(s.x, s.z, s.rot);
      v.parked = true;
      this.game.worldGroup.add(v.mesh);
      this.parked.push(v);
    }
  }

  /** Tutti i veicoli guidabili/urtabili presenti nel mondo. */
  *all() {
    for (const t of this.cars) yield t.v;
    for (const v of this.parked) yield v;
  }

  update(dt) {
    const p = this.game.player;
    for (const t of this.cars) {
      if (t.v.driver === 'player') continue;    // il giocatore l'ha rubata
      const d = Math.hypot(t.v.x - p.x, t.v.z - p.z);
      if (d > CFG.STREAM_RADIUS + 60) { t.respawn(p.x, p.z); continue; }
      t.update(dt, this.game);
    }
    // le auto parcheggiate lontane vengono ricollocate vicino al giocatore
    for (const v of this.parked) {
      if (v.driver === 'player') continue;
      if (Math.hypot(v.x - p.x, v.z - p.z) > CFG.STREAM_RADIUS + 90) {
        const spots = this.game.city.parkSpots;
        for (let k = 0; k < 25; k++) {
          const s = spots[(Math.random() * spots.length) | 0];
          const d = Math.hypot(s.x - p.x, s.z - p.z);
          if (d > 40 && d < 130) { v.place(s.x, s.z, s.rot); break; }
        }
      }
    }
  }

  /** L'auto libera piu' vicina, per entrarci. */
  nearestCar(x, z, maxD = 3.6) {
    let best = null, bd = maxD * maxD;
    for (const v of this.all()) {
      if (v.driver) continue;
      const dd = (v.x - x) ** 2 + (v.z - z) ** 2;
      if (dd < bd) { bd = dd; best = v; }
    }
    return best;
  }
}
