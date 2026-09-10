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
/**
 * Modello del guidatore intelligente (IDM).
 *
 * E' il modello che si usa nelle simulazioni di traffico vere. Invece di
 * mettere una regola per ogni situazione — "se hai qualcuno davanti a meno
 * di tot rallenta", "se e' fermo frena" — descrive come si comporta un
 * guidatore: tiene una distanza di sicurezza proporzionale alla velocita',
 * accelera verso la velocita' che vorrebbe tenere, e frena tanto piu'
 * forte quanto piu' si avvicina a qualcosa. La proprieta' che ci interessa
 * e' che con la distanza di sicurezza rispettata NON tampona: la frenata
 * comincia da sola abbastanza presto.
 *
 * Ogni ostacolo — chi hai davanti, la linea d'arresto, chi ti taglia la
 * strada — entra nella stessa formula come una coppia (distanza,
 * velocita'), e si prende l'accelerazione piu' bassa: il guidatore obbedisce
 * al vincolo piu' stringente.
 *
 * @param {number} speed  velocita' attuale
 * @param {number} v0     velocita' che si vorrebbe tenere
 * @param {Array} ostacoli  elenco di { d, speed }
 */
export function idmAccel(speed, v0, ostacoli, o = {}) {
  const a = o.a ?? 2.4;          // accelerazione comoda
  const b = o.b ?? 4.5;          // decelerazione comoda
  const T = o.T ?? 1.15;         // distanza in secondi da chi hai davanti
  const s0 = o.s0 ?? 2.2;        // spazio minimo da fermo, paraurti a paraurti
  const libero = 1 - (speed / Math.max(v0, 0.5)) ** 4;
  let acc = a * libero;
  for (const ob of ostacoli) {
    if (!ob || !(ob.d < Infinity)) continue;
    const s = Math.max(0.35, ob.d);
    const dv = speed - Math.max(0, ob.speed || 0);
    // distanza che si vorrebbe avere: quella minima, piu' quella percorsa
    // nel tempo di reazione, piu' quella che serve ad annullare il
    // dislivello di velocita'
    const sStar = s0 + Math.max(0, speed * T + (speed * dv) / (2 * Math.sqrt(a * b)));
    acc = Math.min(acc, a * (libero - (sStar / s) ** 2));
  }
  return acc;
}

/**
 * Scostamento dalla linea di corsia: positivo se il veicolo le sta a
 * sinistra.
 *
 * Si misura sul tratto piu' vicino al veicolo, non su quello che finisce nel
 * punto di mira: quello puo' essere quindici metri piu' avanti, e la
 * distanza da li' non dice niente su dove ci si trova adesso.
 */
function crossTrack(v, path, i) {
  let best = 0, bd = Infinity;
  /*
   * Finestra larga: il punto di mira puo' stare tre o quattro punti avanti
   * al veicolo, e cercando solo li' attorno il tratto su cui ci si trova
   * davvero restava fuori. La correzione allora tirava verso un pezzo di
   * strada lontano invece che verso la propria riga.
   */
  const da = Math.max(1, i - 8), a = Math.min(i + 1, path.length - 1);
  for (let k = da; k <= a; k++) {
    const A = path[k - 1], B = path[k];
    const dx = B.x - A.x, dz = B.z - A.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) continue;
    let t = ((v.x - A.x) * dx + (v.z - A.z) * dz) / len2;
    t = clamp(t, 0, 1);
    const px = A.x + dx * t, pz = A.z + dz * t;
    const d = (px - v.x) ** 2 + (pz - v.z) ** 2;
    if (d < bd) {
      bd = d;
      const len = Math.sqrt(len2);
      // sinistra rispetto al senso di marcia e' (dz, -dx): la stessa
      // convenzione con cui si costruiscono le corsie. Col segno invertito
      // la correzione spingeva fuori strada invece che dentro la corsia.
      best = (v.x - A.x) * (dz / len) + (v.z - A.z) * (-dx / len);
    }
  }
  return best;
}

/**
 * Guida lungo un tracciato.
 *
 * Sterzo: inseguimento puro verso un punto piu' avanti, piu' una correzione
 * proporzionale a quanto si e' scostati dalla linea di corsia. L'inseguimento
 * da solo taglia le curve e lascia l'auto a mezzo metro dal centro corsia;
 * la correzione la riporta sulla riga e ce la tiene.
 *
 * Gas e freno: modello del guidatore intelligente su tutti gli ostacoli che
 * il chiamante gli passa.
 *
 * @param {object} opt { cruise, maxSpeed, stopDist, lead, obstacles, sideOffset }
 */
export function followPath(v, path, st, opt = {}) {
  if (!path || path.length === 0) return { throttle: 0, steer: 0, hand: true, done: true };

  const speed = Math.abs(v.speed);

  /*
   * Aggancio al tracciato.
   *
   * L'indice si riaggancia ogni giro al punto piu' vicino, cercato in
   * avanti da dove eravamo. Prima poteva solo avanzare, e solo se il
   * bersaglio era vicino o appena dietro: un veicolo spinto via dalla sua
   * traiettoria — un urto, una manovra, una partenza storta — restava
   * agganciato a un punto ormai trenta metri dietro, dove nessuna delle due
   * condizioni scattava piu'. Da li' inseguiva a vita un bersaglio
   * irraggiungibile girando su se stesso: misurato, un taxi fermo allo
   * stesso indice per tutta la corsa, sterzo a fondo corsa, quattro quinti
   * del tempo fuori strada. Riagganciandosi, il bersaglio si muove sempre
   * con la vettura e la vettura torna sempre sulla strada.
   *
   * All'indietro si guarda di pochi punti — non si annulla il progresso
   * fatto — e in avanti quanto basta a recuperare un salto, senza arrivare
   * a un tratto di strada che il percorso ripercorre piu' tardi.
   */
  const lo = Math.max(0, st.i - 4);
  const hi = Math.min(path.length - 1, st.i + 60);
  let bd = Infinity;
  for (let k = lo; k <= hi; k++) {
    const d = (path[k].x - v.x) ** 2 + (path[k].z - v.z) ** 2;
    if (d < bd) { bd = d; st.i = k; }
  }

  /*
   * Distanza di mira: si allontana con la velocita' — da fermi si guarda
   * vicino per girare stretto, in corsa lontano per non ondeggiare — e non
   * scende mai sotto quanto si e' lontani dal tracciato. Un bersaglio piu'
   * vicino del proprio raggio di sterzata non si raggiunge: gli si gira
   * attorno, ed e' l'altro modo in cui un'auto finiva a fare tondi.
   */
  const look = Math.min(30,
    Math.max(clamp(4.5 + speed * 0.75, 4.5, 18), Math.sqrt(bd) * 1.3));

  /*
   * Il punto di mira sta `look` metri piu' avanti LUNGO il tracciato, non
   * in linea d'aria: cosi' la mira segue la strada anche in curva.
   */
  let ai = st.i, resto = look;
  while (ai < path.length - 1) {
    const d = dist(path[ai].x, path[ai].z, path[ai + 1].x, path[ai + 1].z);
    if (resto <= d || d <= 0) break;
    resto -= d; ai++;
  }
  let target = path[ai];
  if (ai < path.length - 1) {
    const d = dist(path[ai].x, path[ai].z, path[ai + 1].x, path[ai + 1].z);
    const t = d > 0 ? Math.min(1, resto / d) : 0;
    target = { x: path[ai].x + (path[ai + 1].x - path[ai].x) * t,
               z: path[ai].z + (path[ai + 1].z - path[ai].z) * t };
  }
  const toEnd = dist(v.x, v.z, path[path.length - 1].x, path[path.length - 1].z);

  /*
   * Scarto laterale, per aggirare chi e' fermo in mezzo alla strada: si mira
   * di lato rispetto alla propria corsia, come si sorpassa.
   */
  let aimX = target.x, aimZ = target.z;
  const off = opt.sideOffset || 0;
  if (off) {
    const dx0 = target.x - v.x, dz0 = target.z - v.z;
    const l = Math.hypot(dx0, dz0) || 1;
    aimX += (dz0 / l) * off;
    aimZ += (-dx0 / l) * off;
  }

  const want = Math.atan2(-(aimZ - v.z), aimX - v.x);
  const alpha = angleDelta(v.a, want);
  const ld = Math.max(2, dist(v.x, v.z, aimX, aimZ));
  const curvatura = (2 * Math.sin(alpha)) / ld;
  // rientro in corsia: se si e' a sinistra della riga si sterza a destra, e
  // la correzione si ammorbidisce con la velocita' per non ondeggiare
  /*
   * Correzione di corsia: un ritocco, non una sterzata.
   *
   * Senza limite, da fermi bastava un metro e mezzo fuori riga per mandare
   * il volante a fondo corsa: la vettura attraversava la strada, sbandava
   * dall'altra parte e ricominciava. E' l'oscillazione che si vedeva agli
   * incroci, con l'auto che rimbalzava da un marciapiede all'altro finche'
   * non restava incastrata contro un palo. A tenere la traiettoria e'
   * l'inseguimento del punto di mira; questa correzione serve solo a
   * togliere l'errore che resta, quindi vale al massimo un terzo di sterzo.
   */
  const scarto = crossTrack(v, path, st.i) - off;
  const rientro = clamp(-Math.atan((opt.kCross ?? 0.85) * scarto / (speed + 2.5)),
    -0.16, 0.16);
  const steer = clamp((Math.atan(curvatura * WHEELBASE) + rientro) / 0.46, -1, 1);

  /*
   * Quanto gira il tracciato nei prossimi quattordici METRI, non nei
   * prossimi tot punti: sugli archi degli incroci i punti sono fitti e
   * contarli faceva viaggiare tutti a passo d'uomo anche in rettilineo.
   */
  /*
   * ...e quanto lontano si guarda dipende da quanto si va forte.
   *
   * Quattordici metri fissi sono un secondo scarso a diciassette metri al
   * secondo: la curva si vedeva quando c'era gia' dentro, e la frenata
   * arrivava troppo tardi. Il taxi, che viaggia piu' svelto del traffico,
   * finiva regolarmente lungo sul marciapiede — misurato: fino a un sesto
   * del tempo fuori strada e sette strisciate contro i muri per corsa,
   * mentre le auto normali stanno fuori strada per lo 0,7 per cento del
   * tempo. Si guarda avanti almeno un secondo e mezzo di strada.
   */
  const vista = Math.max(14, speed * 1.6);
  let bend = 0, span = 0;
  for (let k = Math.max(1, st.i); k < path.length - 1 && span < vista; k++) {
    const a1 = Math.atan2(path[k].z - path[k - 1].z, path[k].x - path[k - 1].x);
    const a2 = Math.atan2(path[k + 1].z - path[k].z, path[k + 1].x - path[k].x);
    bend += Math.abs(angleDelta(a1, a2));
    span += dist(path[k].x, path[k].z, path[k + 1].x, path[k + 1].z);
  }
  bend = Math.min(bend, 1.6);

  const cruise = opt.cruise ?? 0.7;
  const v0 = (opt.maxSpeed ?? 21) * cruise * clamp(1 - bend * 0.42, 0.3, 1);

  /*
   * Gli ostacoli, tutti nella stessa forma. La distanza di chi hai davanti
   * arriva da centro a centro e va portata a paraurti contro paraurti, se
   * no il modello crede di avere quattro metri in piu' di quelli che ha.
   */
  const ostacoli = [];
  const lead = opt.lead;
  if (lead && lead.d < Infinity) {
    /*
     * Chi si sta superando non e' piu' "davanti".
     *
     * Finche' restava nel modello come veicolo da seguire, la distanza di
     * sicurezza lo teneva fermo dietro: il sorpasso si scartava di tre
     * metri e poi si piantava li' di fianco, senza mai passare. Misurato:
     * un taxi in coda dietro un'auto immobile per tutta la corsa, con il
     * sorpasso che scattava e riscattava a vuoto. Durante lo scarto non
     * conta piu': a proteggere restano chi taglia la strada, chi sta fermo
     * di traverso e, all'ultimo, l'urto stesso — che ora spinge di lato
     * invece di inchiodare tutti e due sul posto.
     */
    if (!off) ostacoli.push({ d: Math.max(0.2, lead.d - 4.4), speed: lead.speed });
  }
  if (opt.stopDist !== undefined && opt.stopDist < Infinity) ostacoli.push({ d: opt.stopDist, speed: 0 });
  if (opt.obstacles) for (const o of opt.obstacles) if (o) ostacoli.push(o);
  if (opt.endStop !== false && ai >= path.length - 1) ostacoli.push({ d: Math.max(0, toEnd - 0.8), speed: 0 });

  let acc = idmAccel(speed, v0, ostacoli, opt.idm);
  /*
   * Freno con un tetto.
   *
   * Un'inchiodata al massimo si propaga all'indietro: chi segue tiene la
   * distanza calcolata su una frenata normale e non fa in tempo. Sotto i
   * quattro metri si frena come si puo' — li' e' questione di toccarsi o no
   * — ma sopra si resta entro una decelerazione che chi viene dietro puo'
   * seguire. E' il modo in cui si spengono le onde di frenata.
   */
  let piuVicino = Infinity;
  for (const ob of ostacoli) if (ob.d < piuVicino) piuVicino = ob.d;
  /*
   * Il tetto della frenata deve essere quello che il modello si aspetta da
   * chi lo precede: se io freno piu' forte di quanto tu prevedi, tu mi
   * tamponi. Quattro metri e mezzo al secondo quadrato, gli stessi con cui
   * si calcola la distanza di sicurezza.
   */
  if (piuVicino > 4) acc = Math.max(acc, -5);
  /*
   * Dall'accelerazione voluta al pedale.
   *
   * Non basta dividere per la potenza del motore: la vettura ha un attrito
   * proporzionale alla velocita' che a dieci metri al secondo vale tre
   * metri al secondo quadrato, piu' di tutta l'accelerazione che il modello
   * chiede. Senza aggiungerlo, il gas richiesto veniva mangiato
   * dall'attrito e le auto non superavano il passo d'uomo — misurato: mezzo
   * metro al secondo di media, citta' ferma.
   */
  const attrito = 0.35 * speed;
  const richiesta = acc + attrito;
  let throttle = richiesta >= 0
    ? clamp(richiesta / (v.accel || 8), 0.02, 1)
    : clamp(richiesta / (v.brake || 16), -1, 0);
  /*
   * Freno si', retromarcia no.
   *
   * Sotto il mezzo metro al secondo il veicolo interpreta un comando
   * negativo come marcia indietro, non come freno. Il modello di guida
   * chiede una decelerazione anche solo per stare fermo alla linea
   * d'arresto, e il risultato era che al semaforo le auto ARRETRAVANO —
   * addosso a chi stava dietro. Da fermi si sta fermi: pedale a zero.
   */
  if (throttle < 0 && v.speed < 0.6) throttle = 0;

  const done = st.i >= path.length - 1 && toEnd < 3;
  return { throttle, steer, hand: false, done, target, wanted: v0, toEnd, acc };
}

/**
 * Distanza dalla linea d'arresto dell'incrocio verso cui si sta andando.
 * Restituisce Infinity se il semaforo e' verde o se l'incrocio e' lontano.
 */
export function stopLineDistance(v, node, axis, greenAxis, amber, allRed = false) {
  if (!node) return Infinity;
  /*
   * L'incrocio deve stare DAVANTI.
   *
   * Qui si misurava la distanza secca, senza segno: un incrocio gia'
   * superato risultava identico a uno che deve ancora arrivare, e il
   * veicolo si fermava ad aspettare il verde di un semaforo che aveva
   * dietro le spalle. Ripartiva al cambio di fase, faceva pochi metri e si
   * rifermava al successivo fantasma: e' cosi' che il taxi non arrivava
   * mai a destinazione, avanzando dieci metri al minuto.
   */
  const avanti = (node.x - v.x) * v.fx + (node.z - v.z) * v.fz;
  if (avanti < -3) return Infinity;
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
export function routeBetween(nodes, fromIdx, toIdx, evita = null) {
  if (fromIdx === toIdx) return [nodes[toIdx]];
  /*
   * `evita` sono gli incroci dove ci si e' gia' impantanati: si cerca prima
   * una strada che non ci passi. Se non esiste, si riprova senza vincoli —
   * meglio la strada bloccata che nessuna strada.
   */
  const cerca = (schiva) => {
    const prev = new Map([[fromIdx, -1]]);
    const queue = [fromIdx];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      if (cur === toIdx) break;
      for (const nx of nodes[cur].links) {
        if (prev.has(nx)) continue;
        if (schiva && schiva.has(nx) && nx !== toIdx) continue;
        prev.set(nx, cur);
        queue.push(nx);
      }
    }
    return prev.has(toIdx) ? prev : null;
  };
  const prev = (evita && evita.size ? cerca(evita) : null) || cerca(null);
  if (!prev) return null;
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
