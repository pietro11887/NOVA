import { clamp } from '../core/utils.js';
import { driveTo } from '../entities/traffic.js';
import { Vehicle } from '../entities/vehicle.js';

const LANE = 2.4;
const FARE_BASE = 25;        // scatto iniziale
const FARE_PER_M = 0.35;     // tariffa al metro

/**
 * Taxi su chiamata. Arriva da te guidando davvero per le strade, aspetta,
 * e poi ti porta dove hai messo la destinazione. Si paga alla discesa.
 *
 * Stati: 'coming' -> 'waiting' -> 'riding' -> fine.
 */
export class TaxiService {
  constructor(game) {
    this.game = game;
    this.taxi = null;
    this.state = null;
    this.route = [];
    this.step = 0;
    this.dest = null;
    this.fare = 0;
    this.waitT = 0;
    this.stuck = 0;
    this.replanT = 0;
    this.age = 0;
  }

  get busy() { return !!this.taxi; }

  /** Percorso fra due nodi stradali, in ampiezza sul grafo delle strade. */
  _route(fromIdx, toIdx) {
    const nodes = this.game.city.roadNodes;
    if (fromIdx === toIdx) return [nodes[toIdx]];
    const prev = new Map([[fromIdx, -1]]);
    const queue = [fromIdx];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      if (cur === toIdx) break;
      for (const nx of nodes[cur].links) {
        if (prev.has(nx)) continue;
        prev.set(nx, cur);
        queue.push(nx);
      }
    }
    if (!prev.has(toIdx)) return null;
    const out = [];
    for (let k = toIdx; k !== -1; k = prev.get(k)) out.push(nodes[k]);
    return out.reverse();
  }

  _nearestNode(x, z) {
    const nodes = this.game.city.roadNodes;
    let best = 0, bd = Infinity;
    for (let k = 0; k < nodes.length; k++) {
      const d = (nodes[k].x - x) ** 2 + (nodes[k].z - z) ** 2;
      if (d < bd && nodes[k].links.length) { bd = d; best = k; }
    }
    return best;
  }

  /** Chiamata dal telefono: fa partire un taxi verso di te. */
  call() {
    const g = this.game;
    if (this.taxi) { g.toast('Il taxi sta già arrivando'); return false; }
    if (g.player.inCar) { g.toast('Scendi prima di chiamare un taxi'); return false; }
    const nodes = g.city.roadNodes;
    const meIdx = this._nearestNode(g.player.x, g.player.z);

    // parte da un incrocio a media distanza: deve vedersi arrivare
    let fromIdx = meIdx, bd = -1;
    for (let k = 0; k < 60; k++) {
      const c = (Math.random() * nodes.length) | 0;
      const d = Math.hypot(nodes[c].x - g.player.x, nodes[c].z - g.player.z);
      if (d > 60 && d < 190 && d > bd && nodes[c].links.length) { bd = d; fromIdx = c; }
    }
    const route = this._route(fromIdx, meIdx);
    if (!route) { g.toast('Nessun taxi disponibile qui'); return false; }

    const v = new Vehicle(g.city, { kind: 'taxi' });
    const n0 = route[0], n1 = route[1] || route[0];
    const a = Math.atan2(-(n1.z - n0.z), n1.x - n0.x);
    v.place(n0.x + Math.sin(a) * LANE, n0.z + Math.cos(a) * LANE, a);
    v.driver = 'taxi';
    g.worldGroup.add(v.mesh);

    this.taxi = v;
    this.route = route;
    this.step = 1;
    this.state = 'coming';
    this.fare = 0;
    g.toast('🚕 Taxi in arrivo', 'good');
    return true;
  }

  /** Sali a bordo: da qui in poi guida lui. */
  board() {
    const g = this.game;
    if (this.state !== 'waiting') return false;
    const dest = g.waypoint;
    if (!dest) { g.toast('Metti prima una destinazione sulla mappa'); return false; }
    const meIdx = this._nearestNode(this.taxi.x, this.taxi.z);
    const toIdx = this._nearestNode(dest.x, dest.z);
    const route = this._route(meIdx, toIdx);
    if (!route) { g.toast('Non ci arrivo da qui'); return false; }
    this.route = route;
    this.step = 1;
    this.state = 'riding';
    this.age = 0;
    this.replanT = 0;
    this.dest = { x: dest.x, z: dest.z };
    this.fare = FARE_BASE;
    g.player.mesh.visible = false;
    g.player.inTaxi = true;
    g.toast('In viaggio…', 'good');
    return true;
  }

  /** Scendi dove sei: si paga il tratto fatto. */
  drop(reason = '') {
    const g = this.game;
    if (!this.taxi) return;
    if (this.state === 'riding') {
      const cost = Math.round(this.fare);
      g.player.pay(cost);
      g.toast(`🚕 Corsa: $${cost}${reason ? ' · ' + reason : ''}`, cost > g.player.money ? 'bad' : '');
      g.player.x = this.taxi.x + Math.sin(this.taxi.a) * 2.2;
      g.player.z = this.taxi.z + Math.cos(this.taxi.a) * 2.2;
      g.player.a = this.taxi.a;
      g.player.mesh.visible = true;
      g.player.inTaxi = false;
      g.setWaypoint(null);
    }
    g.worldGroup.remove(this.taxi.mesh);
    this.taxi = null;
    this.state = null;
    this.route = [];
  }

  update(dt) {
    const g = this.game, v = this.taxi;
    if (!v) return;
    this.age += dt;

    // Ricalcolo periodico del percorso dal punto in cui si trova davvero.
    // Senza, appena sbagliava una curva puntava dritto al bersaglio e finiva
    // contro un palazzo, restandoci.
    this.replanT -= dt;
    if (this.replanT <= 0 && (this.state === 'coming' || this.state === 'riding')) {
      this.replanT = 2.5;
      const from = this._nearestNode(v.x, v.z);
      const target = this.state === 'coming'
        ? this._nearestNode(g.player.x, g.player.z)
        : this._nearestNode(this.dest.x, this.dest.z);
      const r = this._route(from, target);
      if (r && r.length) { this.route = r; this.step = Math.min(1, r.length - 1); }
    }

    // rete di sicurezza: se dopo un minuto e mezzo non ti ha ancora raccolto,
    // arriva comunque. Meglio un taxi che spunta che un servizio che non funziona.
    if (this.state === 'coming' && this.age > 90) {
      const a = g.player.a;
      v.place(g.player.x + Math.cos(a) * 6, g.player.z - Math.sin(a) * 6, a + Math.PI);
      v.speed = 0;
      this.state = 'waiting';
      this.waitT = 45;
      g.audio.horn();
      g.toast('🚕 Il taxi ti aspetta', 'good');
      return;
    }

    const node = this.route[this.step] || this.route[this.route.length - 1];
    const prev = this.route[this.step - 1] || node;
    const a = Math.atan2(-(node.z - prev.z), node.x - prev.x);
    const tx = node.x + Math.sin(a) * LANE, tz = node.z + Math.cos(a) * LANE;

    if (this.state === 'coming') {
      const dPlayer = Math.hypot(v.x - g.player.x, v.z - g.player.z);
      // ultimo tratto: punta te, non l'incrocio. Prima girava attorno al nodo
      // e non ti raggiungeva mai perche' tu stavi a meta' isolato.
      const last = this.step >= this.route.length - 1;
      // negli ultimi metri non lo frena il pedone che deve caricare: sei tu
      // in linea d'aria solo da vicino: da lontano si va per strade
      if (last && dPlayer > 10) {
        const straight = dPlayer < 26;
        this._drive(dt, straight ? g.player.x : tx, straight ? g.player.z : tz, 0.55, straight);
        return;
      }
      if (dPlayer <= 10) {
        v.update(dt, { throttle: -1, steer: 0, hand: true });
        if (Math.abs(v.speed) < 1.2) {
          this.state = 'waiting';
          this.waitT = 45;
          g.audio.horn();
          g.toast('🚕 Il taxi ti aspetta', 'good');
        }
        return;
      }
      this._drive(dt, tx, tz, 0.72);
      return;
    }

    if (this.state === 'waiting') {
      v.update(dt, { throttle: 0, steer: 0, hand: true });
      this.waitT -= dt;
      if (this.waitT <= 0) { g.toast('Il taxi se n\'è andato'); this.drop(); }
      return;
    }

    if (this.state === 'riding') {
      // il passeggero viaggia col taxi
      const moved = Math.hypot(v.x - g.player.x, v.z - g.player.z);
      this.fare += Math.abs(v.speed) * dt * FARE_PER_M;
      g.player.x = v.x; g.player.z = v.z; g.player.a = v.a;
      void moved;
      const dDest = Math.hypot(v.x - this.dest.x, v.z - this.dest.z);
      // stessa storia all'arrivo: gli ultimi metri li fa verso la destinazione
      if (this.step >= this.route.length - 1 && dDest > 12) {
        const straight = dDest < 30;
        this._drive(dt, straight ? this.dest.x : tx, straight ? this.dest.z : tz, 0.7);
        return;
      }
      if (dDest < 12) {
        v.update(dt, { throttle: -1, steer: 0, hand: true });
        if (Math.abs(v.speed) < 1.5) { this.drop('arrivato'); }
        return;
      }
      this._drive(dt, tx, tz, 0.85);
    }
  }

  /**
   * Guida verso il prossimo nodo. Se resta imbottigliato prima insiste, poi
   * scarta di lato: un taxi che si pianta per sempre rende inutile il
   * servizio, ed e' esattamente quello che succedeva.
   */
  _drive(dt, tx, tz, cruise, ignoreBlock = false) {
    const g = this.game, v = this.taxi;
    const ctrl = driveTo(v, tx, tz, cruise);
    // le auto in sosta fiancheggiano tutta la strada: se le considera
    // ostacoli il taxi si pianta e non riparte piu'
    const blocked = !ignoreBlock && g.blockedAhead(v, 7, true);
    const slow = Math.abs(v.speed) < 1.2;

    if (blocked || slow) this.stuck += dt; else this.stuck = 0;

    // manovra di sblocco a gradini: aspetta, poi indietreggia sterzando,
    // poi forza in avanti. Senza, restava incastrato contro un muro per sempre.
    if (this.stuck > 6) {
      this.stuck = 0;
      const n = this.route[Math.min(this.step + 1, this.route.length - 1)];
      const p = this.route[Math.max(0, this.step)];
      const a = Math.atan2(-(n.z - p.z), n.x - p.x);
      v.place(n.x + Math.sin(a) * LANE, n.z + Math.cos(a) * LANE, a);
      v.speed = 6;
      if (this.step < this.route.length - 1) this.step++;
      return;
    }
    if (this.stuck > 3) {
      ctrl.throttle = 0.6;
      ctrl.steer = clamp(ctrl.steer + (this.stuck % 2 < 1 ? 0.7 : -0.7), -1, 1);
    } else if (this.stuck > 1.4) {
      ctrl.throttle = -0.75;                       // retromarcia
      ctrl.steer = clamp(-ctrl.steer, -1, 1);
    } else if (blocked) {
      ctrl.throttle = -0.4;
    }

    v.update(dt, ctrl);
    if (Math.hypot(v.x - tx, v.z - tz) < 7 && this.step < this.route.length - 1) this.step++;
  }
}
