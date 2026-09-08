import { clamp, angleDelta, rand, randInt, pick } from '../core/utils.js';
import { CFG } from '../core/config.js';
import { Vehicle } from './vehicle.js';
import { CAR_TYPES, CAR_COLORS } from '../world/models.js';
import {
  LANE, HALF_ROAD, legPoints, followPath, stopLineDistance, legAxis, nearestNode,
  roadDistance, rientroInCorsia,
} from './driving.js';

/**
 * Comandi di guida per raggiungere un punto libero.
 * Resta per la polizia, che insegue e non segue corsie.
 */
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
  ['sedan', 18], ['suv', 11], ['pickup', 7], ['sport', 6], ['muscle', 7],
  ['van', 7], ['compact', 9], ['hatchback', 9], ['wagon', 8], ['offroad', 5],
  ['bus', 5], ['ambulance', 3],
];
function weightedType() {
  // i tipi che arrivano dal pacchetto di modelli esistono solo se il
  // pacchetto e' stato caricato: quelli mancanti si scartano
  const list = TYPE_WEIGHTS.filter(([n]) => CAR_TYPES[n]);
  const total = list.reduce((a, t) => a + t[1], 0);
  let r = Math.random() * total;
  for (const [name, w] of list) { r -= w; if (r <= 0) return name; }
  return 'sedan';
}

/** Quanti punti del tracciato tenere dietro di se' prima di potarlo. */
const TRIM_AFTER = 30;

/**
 * Un'auto del traffico.
 *
 * Segue una corsia vera invece di puntare l'incrocio successivo: il
 * tracciato e' una polilinea dentro la corsia di destra, con l'arco della
 * svolta agli incroci, percorsa a inseguimento puro. Il tracciato si allunga
 * da solo davanti e si pota dietro, quindi l'auto non "finisce" mai il
 * percorso e non ha bisogno di essere rilanciata.
 */
class TrafficCar {
  constructor(city, kind = 'civil') {
    const type = kind === 'taxi' ? 'sedan' : weightedType();
    const forced = type === 'ambulance' ? 'ambulance' : type === 'bus' ? 'bus' : kind;
    this.v = new Vehicle(city, { type, kind: forced, color: pick(CAR_COLORS) });
    this.city = city;
    this.isTaxi = kind === 'taxi';
    // quando lo chiami, il servizio taxi prende in mano questa vettura e
    // il traffico smette di guidarla
    this.hired = false;
    this.path = [];
    this.marks = [];
    this.st = { i: 0 };
    this.chain = [];              // incroci ancora da percorrere
    this.cruise = rand(0.64, 0.96);
    this.patience = 0;
    this.hornT = 0;
    this.blockedT = 0;      // fermo senza un motivo valido
    this.attesaT = 0;       // da quanto aspetta dietro a un ostacolo fermo
    this.sorpassoT = 0;     // quanto dura ancora il sorpasso in corso
    this.fuoriT = 0;        // da quanto e' fuori dalla carreggiata
  }

  /** Rimette l'auto in circolazione a distanza giusta dal giocatore. */
  /*
   * Le auto vivono in un anello attorno al giocatore. Se l'anello e'
   * stretto, aumentarne il numero non riempie la citta': la ingorga. Piu'
   * largo vuol dire piu' strade occupate e stessa densita' sotto gli occhi.
   */
  respawn(px, pz, minD = 55, maxD = 205) {
    const nodes = this.city.roadNodes;
    let n = null;
    for (let k = 0; k < 80; k++) {
      const c = nodes[randInt(0, nodes.length - 1)];
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d > minD && d < maxD && c.links.length) { n = c; break; }
    }
    if (!n) n = nodes[nearestNode(nodes, px + 130, pz + 130)];

    const next = nodes[pick(n.links)];
    this.chain = [n, next];
    this.path = [];
    this.marks = [];
    this.st.i = 0;
    this._extend();
    this._extend();

    const a = Math.atan2(-(next.z - n.z), next.x - n.x);
    this.v.place(n.x + Math.sin(a) * LANE, n.z + Math.cos(a) * LANE, a);
    this.v.speed = rand(5, 12);
    this.v.health = 100;
    return this;
  }

  /**
   * Sceglie il prossimo incrocio e allunga il tracciato.
   * Va dritto quando puo': un traffico che svolta a caso a ogni incrocio
   * sembra un formicaio, non una citta'.
   */
  _extend() {
    const nodes = this.city.roadNodes;
    const from = this.chain[this.chain.length - 2];
    const cur = this.chain[this.chain.length - 1];
    if (!from || !cur) return;

    const dirX = Math.sign(cur.i - from.i), dirZ = Math.sign(cur.j - from.j);
    const straight = nodes.find((n) => n.i === cur.i + dirX && n.j === cur.j + dirZ);
    const opts = cur.links.map((k) => nodes[k]).filter((n) => n !== from);
    let next;
    if (straight && opts.includes(straight) && Math.random() < 0.68) next = straight;
    else next = opts.length ? pick(opts) : from;

    const pts = legPoints(from, cur, next);
    const axis = legAxis(from, cur);
    for (const p of pts) { this.path.push(p); this.marks.push({ node: cur, axis }); }
    this.chain.push(next);
    if (this.chain.length > 4) this.chain.shift();
  }

  /**
   * Riprende a circolare da dove si trova, senza teletrasporti: serve
   * quando il servizio taxi restituisce la vettura al traffico dopo una
   * corsa.
   */
  resume() {
    const nodes = this.city.roadNodes;
    const v = this.v;
    const fx = Math.cos(v.a), fz = -Math.sin(v.a);
    let ahead = null, bd = Infinity;
    for (const n of nodes) {
      if (!n.links.length) continue;
      const dx = n.x - v.x, dz = n.z - v.z;
      const d = Math.hypot(dx, dz);
      if (d > 1 && (dx * fx + dz * fz) / d < 0.2) continue;
      if (d < bd) { bd = d; ahead = n; }
    }
    if (!ahead) ahead = nodes[nearestNode(nodes, v.x, v.z)];
    // l'incrocio "da cui viene" si ricava dalla direzione di marcia
    const back = { x: ahead.x - fx * 40, z: ahead.z - fz * 40, i: ahead.i, j: ahead.j };
    this.chain = [back, ahead];
    this.path = [];
    this.marks = [];
    this.st.i = 0;
    this._extend();
    this._extend();
    this.hired = false;
    this.blockedT = 0;
    this.v.driver = null;
  }

  /** Butta via i punti gia' passati: il tracciato non deve crescere all'infinito. */
  _trim() {
    if (this.st.i < TRIM_AFTER) return;
    const cut = this.st.i - 8;
    this.path.splice(0, cut);
    this.marks.splice(0, cut);
    this.st.i -= cut;
  }

  update(dt, game) {
    const v = this.v;
    while (this.path.length - this.st.i < 16) this._extend();
    this._trim();

    const mark = this.marks[Math.min(this.st.i, this.marks.length - 1)];

    /*
     * Distanza alla quale bisogna essere fermi: vince la piu' vicina fra il
     * semaforo e la coda davanti. Il controllo di velocita' ci arriva
     * frenando per tempo, invece di inchiodare all'ultimo metro.
     */
    let stopDist = Infinity;
    if (mark) {
      stopDist = Math.min(stopDist,
        stopLineDistance(v, mark.node, mark.axis, game.trafficAxis, game.trafficAmber, game.trafficAllRed));
    }
    // si guarda piu' lontano di quanto si impieghi a fermarsi: a venti metri
    // al secondo lo spazio di frenata e' venticinque metri, e ventisei erano
    // troppo pochi per non tamponare chi inchioda al giallo
    const lead = game.leaderAhead(v, 34, true);
    const gap = lead.d;

    /*
     * Non entrare nell'incrocio se non si esce dall'altra parte: senza
     * questo, al verde le auto ci si infilano dentro e restano incastrate
     * a bloccare l'asse trasversale.
     */
    if (mark) {
      const toLine = Math.hypot(v.x - mark.node.x, v.z - mark.node.z) - (HALF_ROAD + 1.6);
      // "non entrare se non esci": la coda davanti deve avere spazio per
      // tutta la vettura, non per mezza — se no la coda si appoggia dentro
      // l'incrocio e chi ha il verde trasversale ci finisce addosso
      if (toLine > 0 && toLine < 14 && gap < 10) stopDist = Math.min(stopDist, toLine);
      // e non si entra finche' c'e' qualcuno di traverso la' dentro
      if (toLine > 0.5 && toLine < 11 && game.intersectionBusy(v, mark.node)) {
        stopDist = Math.min(stopDist, toLine);
      }
    }

    /*
     * Sorpasso.
     *
     * Chi si trova davanti un ostacolo fermo o lentissimo non resta li' in
     * eterno: esce nella corsia opposta, passa e rientra. Ma solo se
     * dall'altra parte non arriva nessuno per settanta metri, e mai a
     * ridosso di un incrocio. Se durante la manovra spunta qualcuno di
     * fronte si rientra subito: e' l'unica regola che conta davvero.
     */
    const ostacolo = lead.d < 14 && lead.speed < 1
      && stopDist > 25                      // non a ridosso di un semaforo
      && game.carsAhead(v, 30) === 1;       // uno solo davanti: non e' una coda
    if (ostacolo && Math.abs(v.speed) < 2) this.attesaT += dt;
    else this.attesaT = 0;
    if (this.attesaT > 4 && game.oncomingClear(v, 70)) {
      this.sorpassoT = 6; this.attesaT = 0;
      this.nSorpassi = (this.nSorpassi || 0) + 1;
    }
    if (this.sorpassoT > 0) {
      this.sorpassoT -= dt;
      // strada libera davanti, o qualcuno che arriva: in un caso e' finita,
      // nell'altro si rientra e basta
      if (lead.d > 16 || !game.oncomingClear(v, 45) || stopDist < 12) {
        if (lead.d <= 16) this.nSorpassiAbortiti = (this.nSorpassiAbortiti || 0) + 1;
        this.sorpassoT = 0;
        this.dopoSorpasso = 4;    // quanto ci mette a rientrare davvero
      }
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
      const daFermo = Math.abs(v.speed) < 1 ? dt : -dt;
      this.attesaSvolta = Math.max(0, (this.attesaSvolta || 0) + daFermo);
      const libero = game.oncomingClear(v, 34, 2);
      if (toLine > 0.5 && toLine < 26 && !libero) {
        stopDist = Math.min(stopDist, toLine);
      } else if (toLine < 0.5) {
        this.attesaSvolta = 0;
      } else if (libero && this.attesaSvolta > 2 && toLine < 9
                 && mark.axis === game.trafficAxis) {
        /*
         * Sgombero durante il rosso di entrambi.
         *
         * Chi aspetta di girare a sinistra trova la strada libera proprio
         * quando l'altro senso si ferma al proprio giallo — cioe' quando il
         * semaforo sta gia' chiudendo anche per lui. Se in quel momento lo
         * fermasse la linea d'arresto, non girerebbe mai e si porterebbe
         * dietro tutta la fila. E' il momento in cui l'incrocio e' vuoto:
         * si passa, ed e' esattamente quello che fanno tutti.
         */
        stopDist = Infinity;
      }
    }
    const ctrl = followPath(v, this.path, this.st, {
      cruise: this.cruise,
      // in citta' non si va a novanta all'ora: con isolati da novanta metri
      // e incroci ogni pochi secondi, meno velocita' vuol dire meno spazio
      // di frenata da recuperare e urti molto piu' rari
      maxSpeed: 21,
      stopDist,
      lead,
      risk: game.crashRisk(v),
      sideOffset: this.sorpassoT > 0 ? 3 : 0,
      maxSpeedNow: game.blockedCrosswise(v) ? 2.2 : undefined,
      endStop: false,
    });

    /*
     * Recupero.
     *
     * Un urto puo' spingere l'auto sul marciapiede o contro un palo, e da
     * li' l'inseguimento del tracciato non basta: sterza verso la corsia ma
     * il muso e' contro un ostacolo. E' cosi' che nascevano le code ferme
     * dietro a un'auto piantata.
     *
     * La retromarcia pero' non e' la risposta giusta per il traffico di
     * sfondo: chi indietreggia sbatte in chi ha dietro, quello si blocca a
     * sua volta e il problema si moltiplica (provato: le auto piantate
     * passavano dal 9 al 30 per cento). Un'auto del traffico che nessuno
     * sta guardando si rimette in circolazione da un'altra parte, e basta.
     *
     * Il conteggio parte solo se e' ferma SENZA un motivo valido: niente
     * semaforo, niente coda davanti.
     */
    const redLight = stopDist < 6;
    if (Math.abs(v.speed) < 0.4 && !redLight) this.blockedT += dt;
    else this.blockedT = 0;

    /*
     * Il conteggio non guarda se ha qualcuno davanti: se restasse fermo solo
     * quando la strada e' libera, un'auto incastrata dietro un'altra
     * incastrata non si sbloccherebbe mai, e la coda dietro nemmeno. Con il
     * semaforo rosso invece e' giusto aspettare quanto serve.
     */
    if (this.blockedT > 8) {
      this.blockedT = 0;
      const p = game.player;
      // sotto gli occhi del giocatore non si fa sparire niente: li' l'auto
      // resta dov'e' e ci pensa la fisica
      if (Math.hypot(v.x - p.x, v.z - p.z) > 40) { this.respawn(p.x, p.z); return; }
    }

    // se resta fermo dietro a qualcosa, prima o poi qualcuno suona
    if (Math.abs(v.speed) < 0.5) {
      this.patience += dt;
      if (this.patience > 4.5 && this.hornT <= 0) { game.audio.horn(); this.hornT = 7; }
    } else this.patience = 0;
    this.hornT -= dt;

    /*
     * Niente retromarce nel traffico di sfondo.
     *
     * Ci ho provato: chi si trova bloccato da chi attraversa l'incrocio
     * risulta "muso contro un ostacolo" e fa manovra, ma indietreggiando
     * blocca chi ha dietro e il guaio si moltiplica. Misurato: seicento
     * retromarce in novanta secondi, velocita' media crollata da 5,6 a 3,5
     * metri al secondo. Chi resta piantato davvero viene rimesso in
     * circolazione altrove, e solo se il giocatore non lo sta guardando.
     *
     * Il rientro in carreggiata invece resta: quello non tocca nessuno.
     */
    if (this.dopoSorpasso > 0) this.dopoSorpasso -= dt;
    const fuori = roadDistance(this.city.roadNodes, v.x, v.z) > HALF_ROAD + 0.4;
    this.fuoriT = fuori ? this.fuoriT + dt : 0;

    if (this.fuoriT > 1.2) {
      const rientro = rientroInCorsia(v, this.city.roadNodes);
      v.update(dt, rientro || ctrl);
      if (rientro) this._rientrando = true;
    } else {
      if (this._rientrando) {
        // tornati in strada: si riprende il tracciato dal punto piu' vicino
        this._rientrando = false;
        let bd = Infinity;
        for (let k = 0; k < this.path.length; k++) {
          const d = (this.path[k].x - v.x) ** 2 + (this.path[k].z - v.z) ** 2;
          if (d < bd) { bd = d; this.st.i = k; }
        }
      }
      v.update(dt, ctrl);
    }
    if (v.health <= 0) { v.health = 100; this.respawn(game.player.x, game.player.z); }
  }
}

export class TrafficManager {
  constructor(game, max) {
    this.game = game;
    this.cars = [];
    this.parked = [];
    for (let i = 0; i < max; i++) {
      const t = new TrafficCar(game.city, Math.random() < 0.2 ? 'taxi' : 'civil');
      t.respawn(0, 0, 30, 200);
      game.worldGroup.add(t.v.mesh);
      this.cars.push(t);
    }
    this._spawnParked(game.quality.parked);
    this._spawnBikes(game.quality.parked < 20 ? 8 : 20);
  }

  /**
   * Cambia quante auto circolano, senza ricostruire il mondo.
   *
   * Serve alla qualita' automatica: su un telefono che arranca il traffico
   * si dirada, su una macchina che regge si riempie. Le nuove entrano
   * lontano dal giocatore, quelle di troppo si tolgono da dietro le spalle.
   */
  setMax(n) {
    const p = this.game.player;
    while (this.cars.length < n) {
      const t = new TrafficCar(this.game.city, Math.random() < 0.2 ? 'taxi' : 'civil');
      t.respawn(p.x, p.z, 90, 200);
      this.game.worldGroup.add(t.v.mesh);
      this.cars.push(t);
    }
    while (this.cars.length > n) {
      // si toglie la piu' lontana, e mai quella che il giocatore sta usando
      let peggio = -1, pd = -1;
      for (let i = 0; i < this.cars.length; i++) {
        const c = this.cars[i];
        if (c.v.driver === 'player' || c.hired) continue;
        const d = Math.hypot(c.v.x - p.x, c.v.z - p.z);
        if (d > pd) { pd = d; peggio = i; }
      }
      if (peggio < 0) break;
      const via = this.cars.splice(peggio, 1)[0];
      this.game.worldGroup.remove(via.v.mesh);
    }
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

  /** Bici parcheggiate alle rastrelliere: si prendono come le auto. */
  _spawnBikes(n) {
    const spots = (this.game.city.bikeSpots || []).slice();
    for (let i = 0; i < n && spots.length; i++) {
      const s = spots.splice((Math.random() * spots.length) | 0, 1)[0];
      const v = new Vehicle(this.game.city, { type: 'bike' });
      v.place(s.x, s.z, s.rot);
      v.parked = true;
      this.game.worldGroup.add(v.mesh);
      this.parked.push(v);
    }
  }

  /** I taxi che circolano, per la mappa e per le chiamate. */
  get taxis() { return this.cars.filter((t) => t.isTaxi); }

  /**
   * Il taxi libero piu' vicino a un punto, entro un raggio.
   * Si scartano quelli gia' impegnati e quelli guidati dal giocatore.
   */
  freeTaxi(x, z, maxD = 220) {
    let best = null, bd = maxD * maxD;
    for (const t of this.cars) {
      if (!t.isTaxi || t.hired || t.v.driver) continue;
      const d = (t.v.x - x) ** 2 + (t.v.z - z) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
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
      if (t.hired) continue;                    // la guida il servizio taxi
      const d = Math.hypot(t.v.x - p.x, t.v.z - p.z);
      if (d > CFG.STREAM_RADIUS + 70) { t.respawn(p.x, p.z); continue; }
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
