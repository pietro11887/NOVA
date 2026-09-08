import { Vehicle } from '../entities/vehicle.js';
import {
  LANE, buildLaneRoute, followPath, stopLineDistance,
  nearestNode, nodeAheadOf, routeBetween, kerbStop,
} from '../entities/driving.js';

const FARE_BASE = 25;        // scatto iniziale
const FARE_PER_M = 0.35;     // tariffa al metro
const KERB_LANE = LANE + 1.1;  // quanto accosta per caricare

/**
 * Taxi su chiamata.
 *
 * Arriva guidando davvero, accosta a bordo strada, aspetta, e poi ti porta
 * dove hai messo la destinazione. Si paga alla discesa.
 *
 * Guida con lo stesso inseguimento su corsia del traffico, quindi rispetta
 * i semafori e si accoda. Il punto di sosta e' calcolato sul bordo della
 * strada piu' vicina, dal lato in cui ti trovi: prima si fermava dove
 * capitava in mezzo alla carreggiata.
 *
 * Stati: 'coming' -> 'waiting' -> 'riding' -> fine.
 */
export class TaxiService {
  constructor(game) {
    this.game = game;
    this.taxi = null;
    this.state = null;
    this.path = [];
    this.marks = [];
    this.st = { i: 0 };
    this.stop = null;        // punto di sosta di destinazione
    this.dest = null;
    this.fare = 0;
    this.waitT = 0;
    this.stuck = 0;
    this.replanT = 0;
    this.age = 0;
    this.reverseT = 0;
    this.reverseSteer = 0;
    this.hired = null;       // vettura presa dal traffico
    this.spawned = null;     // vettura immessa apposta
  }

  get busy() { return !!this.taxi; }

  get _nodes() { return this.game.city.roadNodes; }

  /**
   * Tracciato dal punto in cui si trova il taxi fino a un punto di sosta a
   * bordo strada. L'ultimo tratto scavalca il nodo e finisce sull'accosto,
   * cosi' il taxi si ferma dritto lungo il marciapiede.
   */
  _pathTo(stop, fromX, fromZ, heading = null) {
    const nodes = this._nodes;
    const startIdx = heading === null
      ? nearestNode(nodes, fromX, fromZ)
      : nodeAheadOf(nodes, fromX, fromZ, heading);
    const endIdx = nodes.indexOf(stop.from);
    if (endIdx < 0) return null;
    const route = routeBetween(nodes, startIdx, endIdx);
    if (!route) return null;
    // si prosegue oltre l'incrocio finale: cosi' l'arco della svolta c'e'
    if (route[route.length - 1] !== stop.to) route.push(stop.to);

    const built = buildLaneRoute(route);
    // il tracciato si taglia dove passa piu' vicino all'accosto
    let bi = built.path.length - 1, bd = Infinity;
    for (let k = 0; k < built.path.length; k++) {
      const d = (built.path[k].x - stop.x) ** 2 + (built.path[k].z - stop.z) ** 2;
      if (d < bd) { bd = d; bi = k; }
    }
    const path = built.path.slice(0, bi + 1);
    const marks = built.marks.slice(0, bi + 1);
    path.push({ x: stop.x, z: stop.z });
    marks.push(marks[marks.length - 1] || null);
    return { path, marks };
  }

  _setRoute(built, fromX = null, fromZ = null) {
    if (!built) return false;
    this.path = built.path;
    this.marks = built.marks;
    /*
     * Si riparte dal punto del tracciato piu' vicino a dove si e' davvero.
     * Ripartendo sempre dal primo, dopo un ricalcolo il taxi puntava un
     * punto anche a cinquanta metri e ci andava in linea retta: tagliava la
     * curva, saliva sul marciapiede e li' si piantava. Le retromarce che si
     * vedevano nascevano quasi tutte da qui.
     */
    this.st.i = 0;
    if (fromX !== null) {
      let bd = Infinity;
      for (let k = 0; k < this.path.length; k++) {
        const d = (this.path[k].x - fromX) ** 2 + (this.path[k].z - fromZ) ** 2;
        if (d < bd) { bd = d; this.st.i = k; }
      }
    }
    return true;
  }

  /**
   * Chiamata dal telefono.
   *
   * Non fa comparire un taxi dal nulla: prende quello libero piu' vicino
   * fra quelli che stanno gia' girando per la citta' — gli stessi che vedi
   * sulla mappa — e gli dice di venire da te. Solo se non ce n'e' nessuno
   * nel raggio ne immette uno nuovo, e in quel caso lo fa entrare da un
   * incrocio lontano dalla tua vista.
   */
  call() {
    const g = this.game;
    if (this.taxi) { g.toast('Il taxi sta già arrivando'); return false; }
    if (g.player.inCar) { g.toast('Scendi prima di chiamare un taxi'); return false; }

    const stop = kerbStop(this._nodes, g.player.x, g.player.z, KERB_LANE);
    if (!stop) { g.toast('Nessun taxi disponibile qui'); return false; }

    const hired = g.traffic.freeTaxi(g.player.x, g.player.z, 260);
    let v, built;

    if (hired) {
      built = this._pathTo(stop, hired.v.x, hired.v.z, hired.v.a);
      if (!built || built.path.length < 2) { g.toast('Nessun taxi disponibile qui'); return false; }
      v = hired.v;
      hired.hired = true;
      v.driver = 'taxi';
      this.hired = hired;
      const d = Math.round(Math.hypot(v.x - g.player.x, v.z - g.player.z));
      g.toast(`🚕 Taxi in arrivo · ${d} m`, 'good');
    } else {
      // riserva: nessun taxi in giro, se ne immette uno
      const nodes = this._nodes;
      let from = null, bd = -1;
      for (let k = 0; k < 80; k++) {
        const c = nodes[(Math.random() * nodes.length) | 0];
        const dd = Math.hypot(c.x - g.player.x, c.z - g.player.z);
        if (dd > 60 && dd < 130 && dd > bd && c.links.length) { bd = dd; from = c; }
      }
      if (!from) from = nodes[nearestNode(nodes, g.player.x + 60, g.player.z + 60)];
      built = this._pathTo(stop, from.x, from.z);
      if (!built || built.path.length < 3) { g.toast('Nessun taxi disponibile qui'); return false; }

      v = new Vehicle(g.city, { kind: 'taxi' });
      // punto di partenza libero: nascere addosso a un'altra auto vuol dire
      // restare incastrati e non arrivare mai
      let at = 0;
      for (let k = 0; k < Math.min(12, built.path.length - 2); k++) {
        const q = built.path[k];
        let free = true;
        for (const o of g.traffic.all()) {
          if ((o.x - q.x) ** 2 + (o.z - q.z) ** 2 < 49) { free = false; break; }
        }
        if (free) { at = k; break; }
      }
      const p0 = built.path[at], p1 = built.path[at + 1];
      v.place(p0.x, p0.z, Math.atan2(-(p1.z - p0.z), p1.x - p0.x));
      v.driver = 'taxi';
      g.worldGroup.add(v.mesh);
      this.hired = null;
      this.spawned = v;
      g.toast('🚕 Taxi in arrivo', 'good');
    }

    this.taxi = v;
    this._setRoute(built, v.x, v.z);
    this.stop = stop;
    this.state = 'coming';
    this.fare = 0;
    this.age = 0;
    this.stuck = 0;
    this.reverseT = 0;
    this.recoveries = 0;
    this.replanT = 4;
    return true;
  }

  /** Sali a bordo: da qui in poi guida lui. */
  board() {
    const g = this.game;
    if (this.state !== 'waiting') return false;
    const dest = g.waypoint;
    if (!dest) { g.toast('Metti prima una destinazione sulla mappa'); return false; }

    const stop = kerbStop(this._nodes, dest.x, dest.z, KERB_LANE);
    if (!stop) { g.toast('Non ci arrivo da qui'); return false; }
    const built = this._pathTo(stop, this.taxi.x, this.taxi.z, this.taxi.a);
    if (!built) { g.toast('Non ci arrivo da qui'); return false; }

    this._setRoute(built, this.taxi.x, this.taxi.z);
    this.stop = stop;
    this.state = 'riding';
    this.age = 0;
    this.stuck = 0;
    this.replanT = 4;
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
      // si scende dal lato del marciapiede, non in mezzo alla strada
      g.player.x = this.taxi.x + Math.sin(this.taxi.a) * 2.4;
      g.player.z = this.taxi.z + Math.cos(this.taxi.a) * 2.4;
      g.player.a = this.taxi.a;
      g.player.mesh.visible = true;
      g.player.inTaxi = false;
      g.setWaypoint(null);
    }
    /*
     * Fine corsa. Se la vettura veniva dal traffico torna a circolare da
     * dov'e', e la ritrovi sulla mappa: e' la stessa auto, non sparisce
     * davanti a te. Solo quella immessa apposta si toglie.
     */
    if (this.hired) {
      this.hired.resume();
      this.hired = null;
    } else {
      g.worldGroup.remove(this.taxi.mesh);
    }
    this.spawned = null;
    this.taxi = null;
    this.state = null;
    this.path = [];
    this.marks = [];
    this.stop = null;
  }

  /** Ricalcola il tracciato dal punto in cui si trova davvero. */
  _replan() {
    if (!this.stop) return;
    const built = this._pathTo(this.stop, this.taxi.x, this.taxi.z, this.taxi.a);
    if (built && built.path.length >= 2) this._setRoute(built, this.taxi.x, this.taxi.z);
  }

  update(dt) {
    const g = this.game, v = this.taxi;
    if (!v) return;
    this.age += dt;

    if (this.state === 'waiting') {
      v.update(dt, { throttle: 0, steer: 0, hand: true });
      this.waitT -= dt;
      if (this.waitT <= 0) { g.toast('Il taxi se n\'è andato'); this.drop(); }
      return;
    }

    if (this.state === 'riding') {
      // il passeggero viaggia col taxi
      this.fare += Math.abs(v.speed) * dt * FARE_PER_M;
      g.player.x = v.x; g.player.z = v.z; g.player.a = v.a;
    }

    // --- semaforo e coda davanti
    const mark = this.marks[Math.min(this.st.i, this.marks.length - 1)];
    let stopDist = Infinity;
    if (mark) {
      stopDist = Math.min(stopDist,
        stopLineDistance(v, mark.node, mark.axis, g.trafficAxis, g.trafficAmber));
    }
    const lead = g.leaderAhead(v, 24, true);

    const ctrl = followPath(v, this.path, this.st, {
      cruise: 0.82,
      maxSpeed: 24,
      stopDist,
      lead,
    });
    // stato utile a capire perche' si e' fermato, letto dai collaudi
    this.dbg = {
      stopDist: stopDist === Infinity ? null : +stopDist.toFixed(1),
      leadD: lead.d === Infinity ? null : +lead.d.toFixed(1),
      markAxis: mark ? mark.axis : null,
      verde: g.trafficAxis,
      giallo: g.trafficAmber,
      throttle: +ctrl.throttle.toFixed(2),
      steer: +ctrl.steer.toFixed(2),
      wanted: +(ctrl.wanted || 0).toFixed(1),
      i: this.st.i,
      n: this.path.length,
    };

    /*
     * Bloccato davvero significa: sto dando gas e non mi muovo. Prima
     * bastava andare piano — cioe' anche solo rallentare in curva o al
     * semaforo — e partiva la manovra di sblocco: il taxi si metteva a fare
     * avanti e indietro sul posto. Ora se resta fermo si ricalcola il
     * percorso, e solo dopo molto tempo rinuncia.
     */
    /*
     * Bloccato o no: si guarda quanta strada ha fatto davvero negli ultimi
     * secondi, non la velocita' istantanea.
     *
     * Un'auto premuta contro il cordolo o contro un palo rimbalza di
     * continuo, quindi la velocita' oscilla e non risulta mai ferma: il
     * conteggio non partiva e il taxi restava li' a spingere. Lo
     * spostamento invece non mente.
     *
     * Al semaforo rosso si aspetta e basta: quello non e' un blocco.
     */
    const redLight = stopDist < 6;
    if (!this._probe) this._probe = { x: v.x, z: v.z, t: 0 };
    this._probe.t += dt;
    if (this._probe.t > 2.5) {
      const moved = Math.hypot(v.x - this._probe.x, v.z - this._probe.z);
      if (moved < 2 && !redLight) this.stuck += this._probe.t;
      else this.stuck = 0;
      this._probe = { x: v.x, z: v.z, t: 0 };
    }

    /*
     * Recupero, in due tempi.
     *
     * Prima si prova a uscirne indietreggiando. Se dopo qualche tentativo e'
     * ancora piantato — capita quando un urto lo spinge sul marciapiede e il
     * muso resta contro un palo — si rimette sul proprio tracciato piu'
     * avanti, ma solo mentre sta venendo a prenderti e solo se sei lontano:
     * cosi' non lo vedi comparire. Con te a bordo un salto sarebbe evidente,
     * e li' l'unica cosa onesta e' interrompere la corsa.
     */
    /*
     * La retromarcia serve solo quando davanti non c'e' nessuno: vuol dire
     * che e' finito addosso a qualcosa di fermo, un cordolo o un palo. In
     * coda invece si aspetta, altrimenti si indietreggia addosso a chi sta
     * dietro — ed e' proprio la manovra continua che si vedeva.
     */
    const incoda = lead.d < 8;
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      // indietro dritto: sterzando si striscia lungo il cordolo invece di
      // staccarsene
      v.update(dt, { throttle: -0.9, steer: 0, hand: false });
    } else if (this.stuck > 6 && !incoda) {
      this.reverseT = 1.4;
      this.stuck = 0;
      this.recoveries = (this.recoveries || 0) + 1;
      v.update(dt, { throttle: -0.9, steer: 0, hand: false });
    } else {
      v.update(dt, ctrl);
      if (Math.abs(v.speed) > 3) { this.recoveries = 0; this.stuck = 0; }
    }

    // fermo da mezzo minuto comunque, coda o non coda: e' un ingorgo vero
    if (this.stuck > 30) { this.stuck = 0; this.recoveries = (this.recoveries || 0) + 2; }

    if ((this.recoveries || 0) >= 2) {
      this.recoveries = 0;
      const lontano = Math.hypot(v.x - g.player.x, v.z - g.player.z) > 60;
      if (this.state === 'coming' && lontano && this.path.length > 3) {
        const k = Math.min(this.path.length - 2, this.st.i + 8);
        const a0 = this.path[k], a1 = this.path[k + 1];
        v.place(a0.x, a0.z, Math.atan2(-(a1.z - a0.z), a1.x - a0.x));
        v.speed = 6;
        this.st.i = k;
      } else if (this.state === 'riding') {
        this.drop('traffico impossibile');
        return;
      }
    }

    /*
     * Il percorso si rifa' solo quando serve davvero: se e' bloccato, o se
     * si e' allontanato troppo dal tracciato. Rifarlo a orologeria era un
     * guaio: ogni ricalcolo ripartiva da un incrocio diverso e vicino alla
     * meta' il taxi finiva a girare attorno all'isolato senza mai fermarsi.
     */
    const toStopNow = Math.hypot(v.x - this.stop.x, v.z - this.stop.z);
    const offPath = ctrl.target
      ? Math.hypot(v.x - ctrl.target.x, v.z - ctrl.target.z) : 0;
    this.replanT -= dt;
    if (toStopNow > 45 && (this.stuck > 3.5 || (offPath > 26 && this.replanT <= 0))) {
      this.replanT = 8;
      this.stuck = 0;
      this._replan();
    }

    // rinuncia: meglio dirlo che restare in giro all'infinito
    const tooLong = this.state === 'coming' ? 150 : 420;
    if (this.age > tooLong) {
      if (this.state === 'riding') this.drop('traffico impossibile');
      else { g.toast('🚕 Il taxi non riesce ad arrivare'); this.drop(); }
      return;
    }

    // --- arrivo
    const toStop = toStopNow;
    if (this.state === 'coming') {
      const near = Math.hypot(v.x - g.player.x, v.z - g.player.z);
      if ((ctrl.done || toStop < 3.5) && Math.abs(v.speed) < 1.4) {
        this.state = 'waiting';
        this.waitT = 45;
        g.audio.horn();
        g.toast('🚕 Il taxi ti aspetta', 'good');
      } else if (near < 4 && Math.abs(v.speed) < 1.4) {
        // ti ha raggiunto prima del punto di sosta: va bene lo stesso
        this.state = 'waiting';
        this.waitT = 45;
        g.audio.horn();
        g.toast('🚕 Il taxi ti aspetta', 'good');
      }
      return;
    }

    if (this.state === 'riding' && (ctrl.done || toStop < 3) && Math.abs(v.speed) < 1.4) {
      this.drop('arrivato');
    }
  }
}
