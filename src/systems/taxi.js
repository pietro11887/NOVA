import { Vehicle } from '../entities/vehicle.js';
import { clamp, angleDelta } from '../core/utils.js';
import {
  LANE, buildLaneRoute, followPath, stopLineDistance,
  nearestNode, nodeAheadOf, routeBetween, kerbStop, roadDistance, HALF_ROAD,
  rientroInCorsia,
} from '../entities/driving.js';

const FARE_BASE = 25;        // scatto iniziale
const FARE_PER_M = 0.35;     // tariffa al metro
// Quanto accosta per caricare. Piu' vicino al cordolo e' piu' bello ma
// basta un filo di troppo in curva e ci si sale sopra: un metro tondo di
// scarto dalla corsia e' il compromesso che regge.
const KERB_LANE = LANE + 0.7;

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

    /*
     * Primo tratto: si aggiunge un incrocio fittizio dietro al veicolo,
     * lungo la direzione in cui sta gia' andando.
     *
     * Senza, il percorso comincia all'incrocio davanti e il primo tratto
     * puo' essere quello del senso opposto: la corsia sta cinque metri
     * dall'altra parte della strada, il veicolo ci punta, taglia la
     * carreggiata e sale sul marciapiede opposto. Da li' non si schioda
     * piu'. Con il nodo fittizio la prima corsia e' quella in cui si trova
     * gia'.
     */
    if (heading !== null && route.length) {
      const a = route[0];
      const fx = Math.cos(heading), fz = -Math.sin(heading);
      route.unshift({ x: a.x - fx * 45, z: a.z - fz * 45, i: a.i, j: a.j, links: [] });
    }

    const built = buildLaneRoute(route);

    /*
     * Il tracciato finisce sull'accosto, quindi va tagliato dove gli passa
     * piu' vicino — ma solo lungo l'ULTIMO tratto, quello che porta a
     * stop.to.
     *
     * Cercando il punto piu' vicino su tutto il percorso si prendeva a
     * volte il primo punto, perche' in linea d'aria l'accosto era li'
     * accanto anche se su strada bisognava fare il giro dell'isolato. Il
     * tracciato si riduceva a due punti e il taxi partiva in linea retta
     * attraverso gli isolati, per poi piantarsi sul marciapiede. E' questa
     * la ragione per cui non arrivava.
     */
    let legStart = 0;
    for (let k = 0; k < built.marks.length; k++) {
      if (built.marks[k] && built.marks[k].node === stop.to) { legStart = k; break; }
    }
    let bi = built.path.length - 1, bd = Infinity;
    for (let k = legStart; k < built.path.length; k++) {
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

    /*
     * Raggio contenuto: un taxi a duecento metri deve attraversare mezza
     * citta' e ogni incrocio in piu' e' un'occasione di restare
     * imbottigliato. Misurato: le chiamate da oltre cento metri sono quelle
     * che non arrivavano. Se non ce n'e' uno vicino se ne immette uno.
     */
    const scelta = this._dispatch(stop);
    if (!scelta) { g.toast('Nessun taxi disponibile qui'); return false; }
    const { v, built } = scelta;

    this.taxi = v;
    this._setRoute(built, v.x, v.z);
    {
      const d = Math.round(Math.hypot(v.x - g.player.x, v.z - g.player.z));
      g.toast(`🚕 Taxi in arrivo · ${d} m`, 'good');
    }
    this.stop = stop;
    this.state = 'coming';
    v.brain = this;              // cosi' gli altri vedono dove sta andando
    this.fare = 0;
    this.age = 0;
    this._scartati = new Set();
    this._swaps = 0;
    this._probe = null;
    this.partenza = Math.hypot(v.x - g.player.x, v.z - g.player.z);
    this.stuck = 0;
    this.reverseT = 0;
    this.recoveries = 0;
    this.replanT = 4;
    this.bloccoT = 0;
    this.sorpassoT = 0;
    return true;
  }


  /**
   * Sceglie chi viene a prenderti e prepara il suo percorso.
   *
   * Si guarda il PERCORSO piu' corto, non la distanza in linea d'aria: sono
   * due cose diverse. Un taxi a cinquanta metri ma dall'altra parte
   * dell'isolato, col muso girato dalla parte sbagliata, deve fare il giro e
   * attraversare tre incroci; uno a novanta metri sulla stessa strada arriva
   * dritto. Ogni incrocio in piu' e' un'occasione di restare imbottigliato.
   *
   * @param {Set} escludi vetture gia' provate e rimaste bloccate
   */
  _dispatch(stop, escludi = null) {
    const g = this.game;
    const MAX_PUNTI = 40;          // circa tre incroci
    let hired = null, built = null;

    const candidati = g.traffic.cars
      .filter((t) => t.isTaxi && !t.hired && !t.v.driver && !(escludi && escludi.has(t)))
      .map((t) => ({ t, d: Math.hypot(t.v.x - g.player.x, t.v.z - g.player.z) }))
      .filter((c) => c.d < 200)
      .sort((a, b) => a.d - b.d)
      .slice(0, 8);

    for (const c of candidati) {
      const path = this._pathTo(stop, c.t.v.x, c.t.v.z, c.t.v.a);
      if (!path || path.path.length < 2) continue;
      if (!built || path.path.length < built.path.length) { built = path; hired = c.t; }
      if (built.path.length <= 14) break;      // gia' vicinissimo, basta cosi'
    }
    if (built && built.path.length > MAX_PUNTI) { built = null; hired = null; }

    if (hired) {
      hired.hired = true;
      hired.v.driver = 'taxi';
      this.hired = hired;
      this.spawned = null;
      return { v: hired.v, built };
    }

    /*
     * Nessuno con un percorso breve: se ne immette uno a un paio di incroci
     * di distanza, fuori dalla tua visuale.
     */
    const nodes = this._nodes;
    let from = null, bd = Infinity;
    for (const n of nodes) {
      if (!n.links.length) continue;
      const dd = Math.hypot(n.x - g.player.x, n.z - g.player.z);
      if (dd > 55 && dd < bd) { bd = dd; from = n; }
    }
    if (!from) from = nodes[nearestNode(nodes, g.player.x + 60, g.player.z + 60)];
    built = this._pathTo(stop, from.x, from.z);
    if (!built || built.path.length < 3) return null;

    const v = new Vehicle(g.city, { kind: 'taxi' });
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
    return { v, built };
  }

  /**
   * Cambio vettura. Se quella in arrivo e' impantanata da troppo tempo, la
   * si lascia al traffico e si manda la prossima: e' quello che farebbe una
   * centrale vera, ed e' molto meglio che farti aspettare un taxi che non
   * arrivera' mai.
   */
  _swap() {
    const g = this.game;
    if (!this.stop) return false;
    if (!this._scartati) this._scartati = new Set();
    if (this.hired) { this._scartati.add(this.hired); this.hired.resume(); this.hired = null; }
    else if (this.spawned) { g.worldGroup.remove(this.spawned.mesh); this.spawned = null; }
    this.taxi = null;

    const scelta = this._dispatch(this.stop, this._scartati);
    if (!scelta) { g.toast('Nessun taxi riesce ad arrivare'); this.state = null; return false; }
    this.taxi = scelta.v;
    this._setRoute(scelta.built, scelta.v.x, scelta.v.z);
    this.age = 0;
    this.stuck = 0;
    this.reverseT = 0;
    this.recoveries = 0;
    this._probe = null;
    this._swaps = (this._swaps || 0) + 1;
    const d = Math.round(Math.hypot(scelta.v.x - g.player.x, scelta.v.z - g.player.z));
    this.partenza = d;
    g.toast(`🚕 Quello era bloccato, ne arriva un altro · ${d} m`, 'good');
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
    this.bloccoT = 0;
    this.sorpassoT = 0;
    this.dest = { x: dest.x, z: dest.z };
    this.fare = FARE_BASE;
    g.player.mesh.visible = false;
    g.player.inTaxi = true;
    g.player.rideCar = this.taxi;   // serve alla camera per inquadrare come in auto
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
      g.player.rideCar = null;
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
    /*
     * Se e' fermo, la direzione del muso non dice piu' dove sta andando:
     * puo' essere girato contro un muro. In quel caso si riparte
     * dall'incrocio piu' vicino invece che da quello "davanti".
     */
    const heading = Math.abs(this.taxi.speed) > 1 ? this.taxi.a : null;
    const built = this._pathTo(this.stop, this.taxi.x, this.taxi.z, heading);
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
        stopLineDistance(v, mark.node, mark.axis, g.trafficAxis, g.trafficAmber, g.trafficAllRed));
    }
    const lead = g.leaderOnPath(v, this.path, this.st.i, 30);

    /*
     * Avvicinamento finale. La frenata di fine percorso da sola e' troppo
     * dolce: a sette metri dall'accosto il taxi viaggiava ancora a sette
     * metri al secondo, superava il punto e si metteva a girargli attorno
     * senza fermarsi mai. Sotto i quindici metri si punta a fermarsi
     * esattamente li'.
     */
    const toGoal = Math.hypot(v.x - this.stop.x, v.z - this.stop.z);
    if (toGoal < 15) stopDist = Math.min(stopDist, toGoal);
    // negli ultimi metri si tira il freno: arrivare e non riuscire a
    // fermarsi e' il modo piu' stupido di fallire una corsa
    // il freno a mano si tira proprio sotto: fermarsi a otto metri e
    // considerarsi non arrivato e' il modo migliore per restare li' per
    // sempre, ed e' quello che succedeva
    // si frena entro la stessa soglia in cui l'arrivo viene riconosciuto:
    // fermarsi appena fuori da quella soglia significava restare li' per
    // sempre a un metro dal traguardo
    // vale anche a fine corsa: senza, arrivato a destinazione continuava a
    // girarci attorno senza mai scendere sotto i due metri al secondo
    const frena = toGoal < 9;

    /*
     * Aggirare chi non riparte.
     *
     * Un'auto ferma in mezzo alla corsia — un tamponamento, uno che si e'
     * piantato — fermava il taxi per sempre: l'accodamento gli dice di
     * stare dietro e basta, e li' restava. Dopo qualche secondo di attesa
     * inutile si scarta di tre metri verso la mezzeria e si passa, come
     * farebbe chiunque. Non si sorpassa mai al semaforo ne' in vista
     * dell'accosto, e comunque chi arriva di fronte fa scattare la frenata
     * d'emergenza.
     */
    const ostacoloFermo = lead.d < 10 && lead.speed < 0.6;
    if (ostacoloFermo && stopDist > 14 && toGoal > 18 && Math.abs(v.speed) < 1.2) {
      this.bloccoT = (this.bloccoT || 0) + dt;
    } else {
      this.bloccoT = 0;
    }
    if ((this.bloccoT || 0) > 3.5) { this.sorpassoT = 7; this.bloccoT = 0; }
    if (this.sorpassoT > 0) {
      this.sorpassoT -= dt;
      if (lead.d > 16) this.sorpassoT = 0;      // passato: si rientra
    }


    /*
     * Precedenza a chi arriva di fronte, prima di girare a sinistra.
     *
     * La svolta a sinistra taglia la corsia opposta: senza questa regola
     * due auto che arrivano l'una contro l'altra si incontravano dentro
     * l'incrocio. Misurato: trentacinque urti su quaranta avvenivano agli
     * incroci, quattordici erano frontali. Chi e' fermo al proprio rosso non
     * conta come "in arrivo", se no il primo della fila non girerebbe mai.
     */
    if (mark && mark.svolta === 'sinistra') {
      const toLine = Math.hypot(v.x - mark.node.x, v.z - mark.node.z) - (HALF_ROAD + 1.6);
      if (toLine > 0.5 && toLine < 26 && !g.oncomingClear(v, 34, 2)) {
        stopDist = Math.min(stopDist, toLine);
      }
    }
    const ctrl = followPath(v, this.path, this.st, {
      cruise: 0.82,
      maxSpeed: 21,
      stopDist,
      lead,
      sideOffset: this.sorpassoT > 0 ? 3 : 0,
      // chi taglia la strada e chi sta fermo di traverso entrano nel
      // modello come ostacoli, con la loro distanza: ci si ferma prima
      obstacles: [g.conflictObstacle(v, this.path, this.st.i), g.crosswiseObstacle(v)],
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
      stuck: +this.stuck.toFixed(1),
      recoveries: this.recoveries || 0,
      reverseT: +this.reverseT.toFixed(1),
      nRetro: this._nRetro || 0,
      nSalti: this._nSalti || 0,
      nRicalcoli: this._nRicalcoli || 0,
      sorpasso: +(this.sorpassoT || 0).toFixed(1),
      blocco: +(this.bloccoT || 0).toFixed(1),
      fuori: +(this.fuoriT || 0).toFixed(1),
      // dove sono i prossimi punti del tracciato, visti dal posto di guida:
      // avanti/indietro e destra/sinistra in metri
      mira: (() => {
        const out = [];
        const fx = Math.cos(v.a), fz = -Math.sin(v.a);
        const rx = Math.sin(v.a), rz = Math.cos(v.a);
        for (let k = this.st.i; k < Math.min(this.st.i + 3, this.path.length); k++) {
          const dx = this.path[k].x - v.x, dz = this.path[k].z - v.z;
          out.push([+(dx * fx + dz * fz).toFixed(1), +(dx * rx + dz * rz).toFixed(1)]);
        }
        return out;
      })(),
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
    /*
     * Muso contro qualcosa.
     *
     * Il conteggio dello spostamento non bastava: un'auto premuta contro un
     * muro viene respinta e ogni tanto striscia di due metri, quindi il
     * conteggio si azzerava e la manovra di sblocco non partiva mai.
     * Misurato: mezzo minuto di gas a tavoletta con la strada libera davanti
     * e velocita' zero, il taxi appoggiato al marciapiede. Gas dato e
     * velocita' nulla e' un incastro, e si vede in un secondo.
     */
    if (ctrl.throttle > 0.45 && Math.abs(v.speed) < 0.5) this.pinnedT = (this.pinnedT || 0) + dt;
    else this.pinnedT = 0;

    // fuori dalla carreggiata: un tocco di cordolo non conta, restarci si'
    const fuori = roadDistance(this._nodes, v.x, v.z) > HALF_ROAD + 0.4;
    this.fuoriT = fuori ? (this.fuoriT || 0) + dt : 0;
    const rientro = (this.fuoriT > 1.2) ? rientroInCorsia(v, this._nodes) : null;
    if (!fuori && this._rientrando) {
      // tornati in strada: si riprende il tracciato dal punto piu' vicino
      this._rientrando = false;
      let bd = Infinity;
      for (let k = 0; k < this.path.length; k++) {
        const d = (this.path[k].x - v.x) ** 2 + (this.path[k].z - v.z) ** 2;
        if (d < bd) { bd = d; this.st.i = k; }
      }
    }

    const redLight = stopDist < 6;
    if (!this._probe) this._probe = { x: v.x, z: v.z, t: 0 };
    this._probe.t += dt;
    if (this._probe.t > 2.5) {
      const moved = Math.hypot(v.x - this._probe.x, v.z - this._probe.z);
      // al rosso non si accumula, ma non si azzera nemmeno: se prima del
      // semaforo era gia' incastrato, quel conteggio serve ancora
      if (moved < 2 && !redLight) this.stuck += this._probe.t;
      else if (moved >= 2) this.stuck = 0;
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
    /*
     * "In coda" vale solo se chi sta davanti si sta muovendo. Restare
     * appiccicati a un'auto ferma non e' una coda, e' un incastro: con il
     * muso a un metro e mezzo dal paraurti di una vettura che non parte, il
     * taxi aspettava all'infinito perche' la manovra era vietata in coda.
     */
    /*
     * Non si indietreggia se davanti c'e' qualcuno, punto: in coda non
     * serve, e con un'auto ferma davanti la manovra giusta e' aggirarla,
     * non tornare indietro addosso a chi sta dietro. La retromarcia resta
     * per quello per cui serve: il muso contro un muro, con la strada
     * dietro libera.
     */
    const incoda = lead.d < 6;
    /*
     * Indietro sterzando dalla parte giusta.
     *
     * A marcia indietro il muso gira al contrario, quindi per riportarlo
     * verso il proprio punto di mira bisogna girare il volante dall'altra
     * parte. Prima si tornava indietro dritti: se il muso era incastrato
     * contro un palo, si arretrava di due metri e ci si tornava dentro.
     */
    const mira = rientro ? rientro.target : this.path[Math.min(this.st.i, this.path.length - 1)];
    const versoMira = mira
      ? -clamp(angleDelta(v.a, Math.atan2(-(mira.z - v.z), mira.x - v.x)) * 2, -1, 1) : 0;
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      v.update(dt, { throttle: -0.9, steer: versoMira, hand: false });
    } else if ((this.stuck > 6 || (this.pinnedT || 0) > 1.2) && !incoda) {
      this.reverseT = 1.4;
      this.stuck = 0;
      this.pinnedT = 0;
      this._nRetro = (this._nRetro || 0) + 1;
      this.recoveries = (this.recoveries || 0) + 1;
      v.update(dt, { throttle: -0.9, steer: versoMira, hand: false });
    } else if (rientro) {
      this._rientrando = true;
      v.update(dt, rientro);
    } else {
      if (frena) { ctrl.throttle = Math.min(ctrl.throttle, -0.5); ctrl.hand = true; }
      v.update(dt, ctrl);
      if (Math.abs(v.speed) > 3) { this.recoveries = 0; this.stuck = 0; }
    }

    // fermo da mezzo minuto comunque, coda o non coda: e' un ingorgo vero
    if (this.stuck > 30) { this.stuck = 0; this.recoveries = (this.recoveries || 0) + 2; }

    /*
     * Con il cliente a bordo si insiste di piu' prima di arrendersi:
     * scaricarlo a meta' strada e' peggio di qualche manovra in piu'.
     */
    if ((this.recoveries || 0) >= (this.state === 'riding' ? 5 : 2)) {
      this.recoveries = 0;
      const lontano = Math.hypot(v.x - g.player.x, v.z - g.player.z) > 60;
      if (this.state === 'coming' && lontano && this.path.length > 3) {
        const k = Math.min(this.path.length - 2, this.st.i + 8);
        const a0 = this.path[k], a1 = this.path[k + 1];
        v.place(a0.x, a0.z, Math.atan2(-(a1.z - a0.z), a1.x - a0.x));
        v.speed = 6;
        this.st.i = k;
        this._nSalti = (this._nSalti || 0) + 1;
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
    /*
     * Il percorso si rifa' SOLO se il taxi e' davvero fermo.
     *
     * Prima bastava che si fosse allontanato dal tracciato, e li' nasceva un
     * circolo vizioso: ogni ricalcolo ripartiva da un incrocio diverso, il
     * taxi si ritrovava di nuovo lontano dal nuovo tracciato, e si
     * ricalcolava ancora. Misurato: fino a diciassette ricalcoli in novanta
     * secondi, con l'indice del percorso sempre fermo a zero — cioe' non
     * avanzava di un metro. Meglio un percorso imperfetto ma seguito fino in
     * fondo che uno perfetto rifatto ogni sei secondi.
     */
    this.replanT -= dt;
    if (toStopNow > 45 && this.stuck > 6 && this.replanT <= 0) {
      this.replanT = 12;
      this.stuck = 0;
      this._nRicalcoli = (this._nRicalcoli || 0) + 1;
      this._replan();
    }

    // rinuncia: meglio dirlo che restare in giro all'infinito
    /*
     * Se dopo mezzo minuto non ha fatto strada, non aspetta all'infinito:
     * quella vettura torna al traffico e ne parte un'altra. Al massimo due
     * cambi, poi si rinuncia dicendolo.
     */
    if (this.state === 'coming' && this.age > 32) {
      const fatto = this.partenza - Math.hypot(v.x - g.player.x, v.z - g.player.z);
      if (fatto < this.partenza * 0.45) {
        if ((this._swaps || 0) < 2 && this._swap()) return;
        g.toast('🚕 Il taxi non riesce ad arrivare');
        this.drop();
        return;
      }
      this.age = 12;   // sta avanzando: gli si da' altro tempo
    }
    if (this.state === 'riding' && this.age > 420) { this.drop('traffico impossibile'); return; }

    // --- arrivo
    const toStop = toStopNow;
    if (this.state === 'coming') {
      const near = Math.hypot(v.x - g.player.x, v.z - g.player.z);
      /*
       * Non si "arriva" da sopra un marciapiede.
       *
       * Bastava trovarsi a otto metri dal cliente per considerare finita la
       * corsa, e un taxi spinto sul marciapiede col muso contro un muro
       * risultava arrivato: si saliva su una vettura gia' incastrata e la
       * corsa non partiva piu'. Era il modo piu' comune di rovinare il
       * viaggio, e da fuori sembrava solo un taxi fermo in un posto assurdo.
       */
      if (roadDistance(this._nodes, v.x, v.z) > HALF_ROAD + 0.8) return;
      // sette metri dall'accosto vanno benissimo: sei comunque sul
      // marciapiede accanto, e pretendere il centimetro voleva dire non
      // fermarsi mai
      if ((ctrl.done || toStop < 9) && Math.abs(v.speed) < 2) {
        this.state = 'waiting';
        this.waitT = 45;
        g.audio.horn();
        g.toast('🚕 Il taxi ti aspetta', 'good');
      } else if (near < 8 && Math.abs(v.speed) < 2) {
        // ti ha raggiunto prima del punto di sosta: va bene lo stesso
        this.state = 'waiting';
        this.waitT = 45;
        g.audio.horn();
        g.toast('🚕 Il taxi ti aspetta', 'good');
      }
      return;
    }

    if (this.state === 'riding' && (ctrl.done || toStop < 8) && Math.abs(v.speed) < 2) {
      this.drop('arrivato');
    }
  }
}
