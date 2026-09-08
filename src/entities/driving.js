import { CFG, roadX, roadZ } from '../core/config.js';
import { clamp, angleDelta } from '../core/utils.js';

/**
 * Guida su corsia per traffico, taxi e polizia.
 *
 * Prima ogni veicolo puntava dritto all'incrocio successivo e correggeva lo
 * sterzo in proporzione all'errore. Con un bersaglio fisso e nessuno
 * smorzamento l'auto oscillava, tagliava le curve e finiva sul marciapiede;
 * quando poi rallentava, la manovra di sblocco partiva da sola e l'auto si
 * metteva a fare avanti e indietro sul posto.
 *
 * Qui il percorso e' una polilinea vera dentro la corsia di destra, con
 * l'arco della svolta agli incroci, e la si segue a inseguimento puro:
 * si mira a un punto piu' avanti sul tracciato, tanto piu' lontano quanto
 * si va forte. E' quello che usano i simulatori, ed e' stabile.
 */

/** Scostamento della corsia dall'asse della strada. */
export const LANE = 2.5;

/** Mezza carreggiata: oltre questa distanza dall'asse c'e' il marciapiede. */
export const HALF_ROAD = CFG.ROAD / 2 - CFG.WALK;

/** Passo del veicolo usato nella formula di sterzo. */
const WHEELBASE = 2.6;

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/**
 * Punto in corsia di destra sul tratto fra due incroci.
 * @param {number} t 0 = partenza, 1 = arrivo
 */
export function lanePoint(from, to, t, lane = LANE) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  // versore "destra" rispetto al senso di marcia: la marcia e' a destra
  const rx = dz / len, rz = -dx / len;
  return {
    x: from.x + dx * t + rx * lane,
    z: from.z + dz * t + rz * lane,
  };
}

/**
 * Tratto fra due incroci piu' il raccordo verso il successivo.
 *
 * Il raccordo e' quello che fa la differenza fra un'auto che gira e una che
 * taglia l'angolo: senza, il veicolo punta il centro dell'incrocio nuovo e
 * passa sopra il marciapiede.
 */
export function legPoints(prev, node, next, lane = LANE) {
  const out = [];
  const len = dist(prev.x, prev.z, node.x, node.z);
  // punti ogni ~6 m lungo il rettilineo, fermandosi prima dell'incrocio
  const stopAt = Math.max(0, 1 - (HALF_ROAD + 1) / Math.max(len, 1));
  const steps = Math.max(2, Math.round((len * stopAt) / 6));
  for (let k = 1; k <= steps; k++) out.push(lanePoint(prev, node, (k / steps) * stopAt, lane));

  if (!next) {
    out.push(lanePoint(prev, node, 1, lane));
    return out;
  }

  /*
   * Arco dentro l'incrocio: si parte dal punto d'ingresso in corsia, si
   * arriva al punto d'uscita sulla strada nuova, e si passa per un punto
   * di controllo vicino al centro. Una Bezier quadratica basta e resta
   * dentro la carreggiata anche nelle svolte strette.
   */
  const enter = lanePoint(prev, node, 1 - (HALF_ROAD + 1) / Math.max(len, 1), lane);
  const outLen = dist(node.x, node.z, next.x, next.z);
  const exit = lanePoint(node, next, (HALF_ROAD + 1) / Math.max(outLen, 1), lane);
  const ctrl = lanePoint(prev, node, 1 + 0.2 / Math.max(len, 1), lane);
  const arcSteps = 6;
  for (let k = 1; k <= arcSteps; k++) {
    const t = k / arcSteps;
    const u = 1 - t;
    out.push({
      x: u * u * enter.x + 2 * u * t * ctrl.x + t * t * exit.x,
      z: u * u * enter.z + 2 * u * t * ctrl.z + t * t * exit.z,
    });
  }
  return out;
}

/**
 * Percorso completo su una sequenza di incroci.
 * Insieme ai punti restituisce, per ognuno, l'incrocio verso cui si sta
 * andando e l'asse di marcia: servono per i semafori.
 */
export function buildLaneRoute(route, lane = LANE) {
  const path = [], marks = [];
  for (let k = 1; k < route.length; k++) {
    const pts = legPoints(route[k - 1], route[k], route[k + 1] || null, lane);
    const axis = legAxis(route[k - 1], route[k]);
    /*
     * Che svolta e' quella che aspetta all'incrocio.
     *
     * Serve per la precedenza: la svolta a sinistra taglia la corsia di chi
     * arriva di fronte, e va fatta solo quando quella e' libera. A destra
     * invece si entra nella propria corsia e non si incrocia nessuno.
     * Con l'imbardata positiva che gira verso sinistra, il segno dello
     * scarto d'angolo basta a distinguerle.
     */
    let svolta = 'dritto';
    const next = route[k + 1];
    if (next) {
      const a1 = Math.atan2(-(route[k].z - route[k - 1].z), route[k].x - route[k - 1].x);
      const a2 = Math.atan2(-(next.z - route[k].z), next.x - route[k].x);
      const d = angleDelta(a1, a2);
      if (d > 0.6) svolta = 'sinistra';
      else if (d < -0.6) svolta = 'destra';
    }
    for (const p of pts) { path.push(p); marks.push({ node: route[k], axis, svolta }); }
  }
  return { path, marks };
}

/**
 * Inseguimento puro.
 *
 * @param {object} v      veicolo
 * @param {Array} path    polilinea da seguire
 * @param {object} st     stato del guidatore ({ i })
 * @param {object} opt    { cruise, maxSpeed, stopDist, blockDist }
 * @returns {{throttle:number, steer:number, hand:boolean, done:boolean, target:object}}
 */
export function followPath(v, path, st, opt = {}) {
  if (!path || path.length === 0) return { throttle: 0, steer: 0, hand: true, done: true };

  const speed = Math.abs(v.speed);
  // il punto di mira si allontana con la velocita': da fermi si guarda
  // vicino per girare stretto, in corsa lontano per non ondeggiare
  const look = clamp(4.5 + speed * 0.75, 4.5, 18);

  /*
   * Avanza il punto di mira. Oltre al caso normale — il punto e' piu' vicino
   * della distanza di mira — bisogna scartare anche i punti che sono ormai
   * dietro: dopo un urto il veicolo puo' ritrovarsi oltre il proprio
   * bersaglio, e continuando a puntarlo resterebbe li' a girare su se stesso.
   */
  const fx = Math.cos(v.a), fz = -Math.sin(v.a);
  while (st.i < path.length - 1) {
    const dx = path[st.i].x - v.x, dz = path[st.i].z - v.z;
    const d = Math.hypot(dx, dz);
    const ahead = dx * fx + dz * fz;
    /*
     * Un punto si consuma se e' piu' vicino della distanza di mira, oppure
     * se e' ormai dietro — ma dietro E vicino.
     *
     * Senza quel secondo limite bastava trovarsi girati per il verso
     * sbagliato (dopo un urto, o appena ricalcolato il percorso) perche'
     * questo ciclo si mangiasse in un colpo solo tutto il tracciato: il
     * veicolo si ritrovava "a fine percorso" con la meta' a duecento metri
     * e ci puntava dritto in linea d'aria, attraversando gli isolati.
     * E' il motivo per cui il taxi finiva lontanissimo e non arrivava mai.
     */
    if (d < look || (ahead < 0.5 && d < look * 1.6)) st.i++;
    else break;
  }
  const target = path[st.i];
  const toEnd = dist(v.x, v.z, path[path.length - 1].x, path[path.length - 1].z);

  /*
   * Scarto laterale, per aggirare chi e' fermo in mezzo alla strada. Si mira
   * di lato rispetto alla propria corsia — a sinistra, come si sorpassa —
   * invece che al punto della corsia, che e' proprio dove sta l'ostacolo.
   */
  let aimX = target.x, aimZ = target.z;
  const off = opt.sideOffset || 0;
  if (off) {
    const dx0 = target.x - v.x, dz0 = target.z - v.z;
    const l = Math.hypot(dx0, dz0) || 1;
    // sinistra rispetto alla direzione di marcia
    aimX += (dz0 / l) * off;
    aimZ += (-dx0 / l) * off;
  }

  const want = Math.atan2(-(aimZ - v.z), aimX - v.x);
  const alpha = angleDelta(v.a, want);
  const ld = Math.max(2, dist(v.x, v.z, aimX, aimZ));
  // curvatura richiesta dall'inseguimento puro, normalizzata sullo sterzo
  const curvature = (2 * Math.sin(alpha)) / ld;
  const steer = clamp(Math.atan(curvature * WHEELBASE) / 0.46, -1, 1);

  /*
   * Velocita': si guarda quanto gira il tracciato nei prossimi punti e si
   * arriva in curva gia' rallentati, invece di frenare dentro la curva.
   */
  /*
   * Curvatura del tracciato davanti.
   *
   * Si somma quanto gira il percorso nei prossimi venti METRI, non nei
   * prossimi sette punti. E' una differenza sostanziale: sugli archi degli
   * incroci i punti sono fitti, due o tre metri l'uno dall'altro, quindi
   * sette punti coprivano mezza svolta e la somma degli angoli sfondava il
   * limite. Il fattore restava incollato al minimo e ogni veicolo
   * viaggiava a tre metri al secondo — a passo d'uomo — anche sui
   * rettilinei. E' per questo che il taxi non arrivava mai: non era
   * bloccato, andava piano.
   *
   * Si guarda anche solo la forma del percorso, non dove si trova il
   * veicolo: includendo l'angolo fra veicolo e primo punto, un'auto
   * spostata di lato dopo un urto vedeva una curva enorme proprio quando le
   * serviva spinta per rimettersi in carreggiata.
   */
  let bend = 0;
  let span = 0;
  for (let k = Math.max(1, st.i); k < path.length - 1 && span < 14; k++) {
    const a1 = Math.atan2(path[k].z - path[k - 1].z, path[k].x - path[k - 1].x);
    const a2 = Math.atan2(path[k + 1].z - path[k].z, path[k + 1].x - path[k].x);
    bend += Math.abs(angleDelta(a1, a2));
    span += dist(path[k].x, path[k].z, path[k + 1].x, path[k + 1].z);
  }
  // una svolta d'incrocio vale mezzo pi greco: oltre non ha senso rallentare
  // ancora, e sommando due archi si finiva a passo d'uomo su tutto il giro
  bend = Math.min(bend, 1.6);

  const cruise = opt.cruise ?? 0.7;
  let wanted = (opt.maxSpeed ?? 22) * cruise * clamp(1 - bend * 0.42, 0.28, 1);

  // fermata programmata: semaforo o fine corsa. Qui l'ostacolo e' fermo,
  // quindi si punta ad arrivarci a velocita' zero
  const stopDist = opt.stopDist;
  if (stopDist !== undefined && stopDist < Infinity) {
    // decelerazione dolce: v = sqrt(2 a s) con a ~ 4 m/s^2
    wanted = Math.min(wanted, Math.sqrt(Math.max(0, stopDist - 1.2) * 8));
  }

  /*
   * Accodamento. Chi sta davanti di solito si muove: si tiene una distanza
   * proporzionale alla velocita' e si copia la sua andatura, correggendo di
   * quanto la distanza reale si discosta da quella voluta. E' il modello di
   * inseguimento classico, e da' colonne che scorrono invece di auto che
   * inchiodano appena ne vedono una davanti.
   */
  const lead = opt.lead;
  if (lead && lead.d < Infinity) {
    const desired = 5.5 + speed * 1.1;
    const follow = lead.speed + (lead.d - desired) * 0.65;
    wanted = Math.min(wanted, Math.max(0, follow));
  }
  /*
   * Chi ti taglia la strada. L'accodamento non lo vede — non e' nella tua
   * corsia e non ha il tuo muso — ma fra un secondo sara' dove sei tu. Piu'
   * e' vicino nel tempo, piu' si frena: a un secondo e mezzo e' una lieve
   * levata di piede, a mezzo secondo e' il pedale a fondo.
   */
  // tetto momentaneo alla velocita': serve a passare al passo accanto a
  // qualcosa di fermo invece di centrarlo
  if (opt.maxSpeedNow !== undefined) wanted = Math.min(wanted, opt.maxSpeedNow);

  const risk = opt.risk;
  if (risk && risk.t < Infinity) {
    /*
     * Chi ti taglia la strada: piu' e' vicino nel tempo, piu' si frena. Ma
     * mai fino a fermarsi: sotto resta sempre il passo d'uomo. E' quello
     * che evita lo stallo a due — io fermo perche' aspetto te, tu ferma
     * perche' aspetti me — e allo stesso tempo fa si' che, se proprio ci si
     * tocca, ci si tocchi a due metri al secondo invece che a otto.
     */
    wanted = Math.min(wanted, Math.max(1.6, speed * clamp(risk.t / 1.6, 0, 1)));
  }

  if (opt.endStop !== false && st.i >= path.length - 1) {
    wanted = Math.min(wanted, Math.sqrt(Math.max(0, toEnd - 0.8) * 8));
  }

  const diff = wanted - speed;
  let throttle = clamp(diff * 0.5, -1, 1);
  // in curva stretta non si accelera comunque
  if (Math.abs(steer) > 0.55 && throttle > 0.5) throttle = 0.5;

  const done = st.i >= path.length - 1 && toEnd < 3;
  return { throttle, steer, hand: false, done, target, wanted, toEnd };
}

/**
 * Distanza dalla linea d'arresto dell'incrocio verso cui si sta andando.
 * Restituisce Infinity se il semaforo e' verde o se l'incrocio e' lontano.
 */
export function stopLineDistance(v, node, axis, greenAxis, amber, allRed = false) {
  if (!node) return Infinity;
  const d = dist(v.x, v.z, node.x, node.z) - (HALF_ROAD + 1.6);
  if (d > 34 || d < -2) return Infinity;
  if (axis === greenAxis && !amber) return Infinity;
  /*
   * Col giallo ci si ferma solo se c'e' lo spazio per farlo. Ma quando
   * scatta il rosso su entrambi gli assi l'eccezione finisce: prima
   * restava valida anche li', e chi arrivava lanciato entrava nell'incrocio
   * quattro secondi dopo la fine del verde — proprio mentre l'altro asse
   * partiva. Dodici attraversamenti su centoventi avvenivano cosi'.
   * Chi e' gia' oltre la linea non e' toccato: quello sgombera e basta.
   */
  if (amber && !allRed && axis === greenAxis) {
    const need = (v.speed * v.speed) / 8;
    if (d < need + 1.5) return Infinity;
  }
  return Math.max(0, d);
}

/** Asse di marcia (0 = est-ovest, 1 = nord-sud) fra due incroci. */
export const legAxis = (from, to) =>
  (Math.abs(to.x - from.x) > Math.abs(to.z - from.z) ? 0 : 1);

/** Nodo stradale piu' vicino a un punto. */
export function nearestNode(nodes, x, z) {
  let best = 0, bd = Infinity;
  for (let k = 0; k < nodes.length; k++) {
    if (!nodes[k].links.length) continue;
    const d = (nodes[k].x - x) ** 2 + (nodes[k].z - z) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/**
 * Incrocio da cui ripartire quando si ricalcola un percorso in corsa.
 *
 * Prendere il piu' vicino e basta puo' dare quello appena superato, e il
 * percorso nuovo comincia con un'inversione a U in mezzo alla strada. Qui
 * si preferisce un incrocio che stia davanti al muso.
 */
export function nodeAheadOf(nodes, x, z, heading) {
  const fx = Math.cos(heading), fz = -Math.sin(heading);
  let best = -1, bd = Infinity;
  for (let k = 0; k < nodes.length; k++) {
    const n = nodes[k];
    if (!n.links.length) continue;
    const dx = n.x - x, dz = n.z - z;
    const d = Math.hypot(dx, dz);
    if (d > 1 && (dx * fx + dz * fz) / d < -0.25) continue;   // e' dietro
    if (d < bd) { bd = d; best = k; }
  }
  return best >= 0 ? best : nearestNode(nodes, x, z);
}

/** Percorso minimo fra due incroci (ricerca in ampiezza sul grafo). */
export function routeBetween(nodes, fromIdx, toIdx) {
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

/**
 * Punto di sosta a bordo strada piu' vicino a un obiettivo: serve al taxi
 * per accostare invece di fermarsi in mezzo alla carreggiata.
 *
 * Si cerca il tratto di strada piu' vicino, si proietta il punto sull'asse
 * e si sposta in corsia. Il risultato porta anche la direzione di marcia,
 * cosi' il taxi resta orientato come il traffico.
 */
/**
 * Distanza dall'asse stradale piu' vicino.
 *
 * Serve a capire se un veicolo e' ancora in carreggiata o se e' finito sul
 * marciapiede: oltre meta' strada, li' non ci si deve fermare.
 */
export function roadDistance(nodes, x, z) {
  let best = Infinity;
  for (const n of nodes) {
    for (const k of n.links) {
      const m = nodes[k];
      const dx = m.x - n.x, dz = m.z - n.z;
      const len2 = dx * dx + dz * dz;
      if (!len2) continue;
      let t = ((x - n.x) * dx + (z - n.z) * dz) / len2;
      t = clamp(t, 0, 1);
      const d = Math.hypot(n.x + dx * t - x, n.z + dz * t - z);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Comandi per rientrare in carreggiata.
 *
 * Quando un veicolo finisce sul marciapiede, inseguire il tracciato non
 * serve: il punto di mira sta molti metri piu' avanti e in mezzo c'e' un
 * palazzo. Ci va contro, rimbalza, ci riprova — e resta li'. Qui si punta
 * il pezzo di corsia piu' vicino, di fianco, e appena si e' di nuovo in
 * strada si riprende il percorso.
 *
 * @returns {object|null} comandi da passare a Vehicle.update
 */
export function rientroInCorsia(v, nodes) {
  /*
   * La corsia giusta la decide il MUSO, non la posizione.
   *
   * Prima si prendeva la corsia dal lato in cui il veicolo si trovava: se
   * un urto lo spingeva oltre la mezzeria, il rientro lo rimetteva in
   * strada nella corsia opposta, e da li' andava incontro al traffico. I
   * frontali in mezzo al rettilineo nascevano quasi tutti cosi'.
   */
  let seg = null, bd = Infinity;
  for (const n of nodes) {
    for (const k of n.links) {
      const m = nodes[k];
      const dx = m.x - n.x, dz = m.z - n.z;
      const len2 = dx * dx + dz * dz;
      if (!len2) continue;
      let t = ((v.x - n.x) * dx + (v.z - n.z) * dz) / len2;
      t = clamp(t, 0, 1);
      const px = n.x + dx * t, pz = n.z + dz * t;
      const d = (px - v.x) ** 2 + (pz - v.z) ** 2;
      if (d < bd) { bd = d; seg = { n, m, t, len: Math.sqrt(len2), dx, dz }; }
    }
  }
  if (!seg) return null;
  const ux = seg.dx / seg.len, uz = seg.dz / seg.len;
  // si torna nel senso in cui si sta gia' guardando
  const avanti = (v.fx * ux + v.fz * uz) >= 0;
  const from = avanti ? seg.n : seg.m;
  const to = avanti ? seg.m : seg.n;
  const t = avanti ? seg.t : 1 - seg.t;
  const p = lanePoint(from, to, clamp(t, 0.02, 0.98), LANE);
  p.a = Math.atan2(-(to.z - from.z), to.x - from.x);
  // un filo avanti lungo la corsia: mirando al fianco si gira in tondo
  const ax = p.x + Math.cos(p.a) * 5, az = p.z - Math.sin(p.a) * 5;
  const err = angleDelta(v.a, Math.atan2(-(az - v.z), ax - v.x));
  // se la strada e' dietro le spalle si va indietro, e a marcia indietro il
  // muso gira al contrario
  if (Math.abs(err) > 1.9) {
    return { throttle: -0.7, steer: clamp(-err * 1.2, -1, 1), hand: false, done: false,
             target: { x: ax, z: az }, rientro: true };
  }
  return { throttle: clamp((5.5 - Math.abs(v.speed)) * 0.4, -1, 1),
           steer: clamp(err * 1.8, -1, 1), hand: false, done: false,
           target: { x: ax, z: az }, rientro: true };
}

export function kerbStop(nodes, x, z, lane = LANE + 0.6) {
  let best = null, bd = Infinity;
  for (const n of nodes) {
    for (const k of n.links) {
      const m = nodes[k];
      // ogni tratto si guarda una volta sola
      if (m.i * 1000 + m.j < n.i * 1000 + n.j) continue;
      const dx = m.x - n.x, dz = m.z - n.z;
      const len2 = dx * dx + dz * dz;
      let t = ((x - n.x) * dx + (z - n.z) * dz) / len2;
      t = clamp(t, 0.08, 0.92);
      const px = n.x + dx * t, pz = n.z + dz * t;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) { bd = d; best = { from: n, to: m, t, px, pz }; }
    }
  }
  if (!best) return null;

  // il lato giusto e' quello dalla parte del bersaglio: cosi' si scende
  // sul marciapiede vicino, non attraversando la strada
  const dx = best.to.x - best.from.x, dz = best.to.z - best.from.z;
  const len = Math.hypot(dx, dz) || 1;
  const rx = dz / len, rz = -dx / len;
  const side = ((x - best.px) * rx + (z - best.pz) * rz) >= 0 ? 1 : -1;
  const from = side > 0 ? best.from : best.to;
  const to = side > 0 ? best.to : best.from;
  const t = side > 0 ? best.t : 1 - best.t;
  const p = lanePoint(from, to, t, lane);
  return {
    x: p.x, z: p.z,
    a: Math.atan2(-(to.z - from.z), to.x - from.x),
    from, to,
  };
}

export { roadX, roadZ };
