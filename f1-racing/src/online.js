// Gara online fino a 4 giocatori (ognuno sul suo dispositivo), collegamento diretto con WebRTC (PeerJS)
// oppure tramite il server ponte. Tutti si collegano all'host, che gira agli altri i dati di ognuno.
// - Chi crea la gara (host) riceve un codice di 4 cifre; gli altri (ospiti) lo scrivono e si collegano.
// - L'host decide circuito, categoria e regole e fa girare i bot; l'ospite li vede arrivare dai suoi dati.
// - Ognuno guida la propria vettura con la fisica sul proprio dispositivo (niente ritardo nei comandi)
//   e manda la sua posizione 20 volte al secondo; le vetture degli altri si muovono interpolate
//   con un piccolo ritardo, come nei giochi online.

export const NET_VER = 2;
export const MAX_GUESTS = 3;
const PREFIX = 'novagp-v1-';
// server per far passare il collegamento quando i due telefoni non riescono a parlarsi direttamente
// (reti diverse, iPhone sulla stessa Wi-Fi che nascondono l'indirizzo, dati mobili)
const ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];
const PEER_OPTS = { debug: 0, config: { iceServers: ICE } };
import { RelayConn, RelayHost } from './relay.js?v=24517b30';
const SEND_EVERY = 0.05;          // 20 aggiornamenti al secondo
const DELAY = 0.12;               // le vetture remote si mostrano 0,12 s indietro (movimento fluido)

let peerLoad = null;
function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!peerLoad) peerLoad = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'src/lib/peerjs.min.js';
    s.onload = () => (window.Peer ? res(window.Peer) : rej(new Error('PeerJS non caricato')));
    s.onerror = () => rej(new Error('PeerJS non caricato'));
    document.head.appendChild(s);
  });
  return peerLoad;
}

const r3 = v => Math.round(v * 1000) / 1000, r2 = v => Math.round(v * 100) / 100;

// stato di una vettura da spedire (compatto)
export function packCar(c) {
  const p = c.phys;
  return [c.slot, r2(p.x), r2(p.y), r2(p.z), r3(p.yaw), r3(p.pitch), r3(p.roll), r2(p.vx), r2(p.vz), r2(p.speed), r3(p.steer),
    p.gear, Math.round(p.rpm), r2(p.throttleOut || 0), c.crossings, c.finishT == null ? -1 : r3(c.finishT), p.inPit ? 1 : 0,
    p.compound, c.retired ? 1 : 0, c.gone ? 1 : 0, c.penalty || 0, c.penServed || 0, c.bestLap == null ? -1 : r3(c.bestLap),
    c.lastLapT == null ? -1 : r3(c.lastLapT), c.stops || 0, r2(p.yawRate || 0)];
}

// un collegamento con un altro dispositivo (per l'host: uno per ospite; per l'ospite: quello con l'host)
let LID = 0;
class Link {
  constructor(conn) { this.conn = conn; this.id = ++LID; this.connected = false; this.lastRecv = 0; this.rtt = null; this.off = null; this.lastT = null; this.offT = null; this.info = null; }
  send(m) { if (this.connected) { try { this.conn.send(m); } catch (e) { /* niente */ } } }
  get lat() { return Math.min(0.4, (this.rtt || 120) / 2000); }
}

export class Online {
  constructor() {
    this.role = null;          // 'host' | 'guest'
    this.code = null;
    this.peer = null;
    this.link = null;          // ospite: collegamento con l'host
    this.links = [];           // host: collegamenti con gli ospiti
    this.onMsg = null;         // (msg, link) => {}
    this.onStatus = null;      // (text, kind) => {}
    this.onSc = null;          // ospite: stato della safety car dall'host
    this.scState = null;       // host: () => stato della safety car da spedire
    this.buf = new Map();      // slot -> [{ t, d, src }]
    this.sendT = 0;
  }

  get connected() { return this.role === 'host' ? this.links.some(l => l.connected) : !!(this.link && this.link.connected); }
  get guests() { return this.links.filter(l => l.connected); }
  allLinks() { return this.role === 'host' ? this.links : this.link ? [this.link] : []; }
  status(text, kind = '') { if (this.onStatus) this.onStatus(text, kind); }

  async host() {
    this.role = 'host';
    let Peer = null;
    try {
      Peer = await loadPeer();
      for (let tries = 0; tries < 6; tries++) {
        const code = String(1000 + Math.floor(Math.random() * 9000));
        try { await this.openPeer(Peer, PREFIX + code); this.code = code; break; }
        catch (e) { if (tries === 5 || !(e && e.type === 'unavailable-id')) throw e; }
      }
      this.listen();
    } catch (e) {
      // servizio del collegamento diretto non raggiungibile: si gioca solo tramite il ponte
      Peer = null; this.code = String(1000 + Math.floor(Math.random() * 9000));
    }
    // ponte (reti diverse): sempre in ascolto, si usa se un ospite non riesce a collegarsi direttamente
    this.startRelayHost();
    this.status('In attesa degli altri giocatori…');
    if (!Peer) return this.code;
    // sul telefono, se si esce dal gioco (per mandare il codice su WhatsApp) il collegamento al server cade
    // e il codice "sparisce": quando si torna nel gioco lo si registra di nuovo, da solo
    clearInterval(this.keep);
    this.keep = setInterval(() => this.keepHost(Peer), 2500);
    if (!this.onVis) { this.onVis = () => { if (!document.hidden && this.role === 'host') this.keepHost(Peer); }; document.addEventListener('visibilitychange', this.onVis); }
    return this.code;
  }

  // nuovo ospite: si accetta se c'è posto (e non si sta correndo)
  accept(conn) {
    if (this.guests.length >= MAX_GUESTS || this.locked) {
      const no = () => { try { conn.send({ k: 'full' }); } catch (e) { /* niente */ } setTimeout(() => { try { conn.close(); } catch (e) { /* niente */ } }, 500); };
      if (conn.isRelay) no(); else conn.on('open', no);
      return;
    }
    this.attach(conn);
  }

  startRelayHost() {
    if (this.relay) return;
    const r = this.relay = new RelayHost(this.code);
    r.on('connection', c => { if (this.role === 'host') this.accept(c); });
    r.start().then(() => { this.relayReady = true; if (!this.connected) this.status('In attesa degli altri giocatori… (anche da un\'altra rete)'); })
      .catch(() => { if (this.relay === r) this.relay = null; if (!this.connected) this.status('In attesa degli altri giocatori… (server ponte non raggiungibile: solo stessa rete)'); });
  }

  listen() { this.peer.on('connection', conn => this.accept(conn)); }

  async keepHost(Peer) {
    if (this.role !== 'host' || this.reopening || document.hidden) return;
    const pr = this.peer;
    if (pr && !pr.destroyed && !pr.disconnected && pr.open) return;
    if (pr && pr.disconnected && !pr.destroyed) { try { pr.reconnect(); } catch (e) { /* niente */ } if (pr.open) return; }
    if (this.connected) return;          // con ospiti già collegati non si butta via il collegamento
    this.reopening = true;
    try {
      try { pr && pr.destroy(); } catch (e) { /* niente */ }
      await this.openPeer(Peer, PREFIX + this.code);
      this.listen();
      this.status('In attesa degli altri giocatori… (codice ' + this.code + ')');
    } catch (e) { /* il server tiene ancora il vecchio collegamento: si riprova tra poco */ }
    this.reopening = false;
  }

  async join(code) {
    this.role = 'guest';
    this.code = code;
    this.status('Collegamento alla gara ' + code + '…');
    // ponte: parte dopo qualche secondo se il collegamento diretto non è riuscito (subito se manca del tutto)
    const relayGo = () => {
      if (this.connected || this.role !== 'guest' || this.code !== code || this.relay) return;
      const r = this.relay = new RelayConn(code);
      r.on('open', () => { if (!this.connected && this.code === code) { clearTimeout(this.retry); const old = this.link; try { old && old.conn.close(); } catch (e) { /* niente */ } this.attach(r); } });
      this.status('Provo il server ponte…');
      r.start().then(() => { if (!this.connected) this.status('Server ponte collegato: cerco la gara ' + code + '… (l\'host deve essere nella sala d\'attesa)'); })
        .catch(() => { if (this.relay === r) this.relay = null; if (!this.connected) this.status('Server ponte non raggiungibile da questa rete. Provate tutti sulla stessa Wi-Fi.', 'err'); });
    };
    let Peer = null;
    try { Peer = await loadPeer(); await this.openPeer(Peer); } catch (e) { Peer = null; }
    if (!Peer) { relayGo(); return; }
    clearTimeout(this.relayT);
    this.relayT = setTimeout(relayGo, 4000);
    // si riprova per un po': chi ha creato la gara potrebbe essere appena tornato nel gioco
    const t0 = performance.now();
    const tryConn = () => {
      if (this.connected || this.role !== 'guest' || this.code !== code) return;
      if (performance.now() - t0 > 45000 && !this.relay) {
        if (this.sawUnavail) this.status('Nessuna gara con il codice ' + code + '. Controlla il codice e che l\'host abbia il gioco APERTO sulla schermata della gara.', 'err');
        else this.status('La gara ' + code + ' c\'è, ma i telefoni non riescono a collegarsi. Provate tutti con i dati mobili (o tutti la stessa Wi-Fi) e riprovate.', 'err');
        return;
      }
      if (!this.sawUnavail && !this.relay && performance.now() - t0 > 5000) this.status('Gara ' + code + ' trovata, collegamento in corso…');
      this.sawUnavail = false;
      if (this.link) { try { this.link.conn.close(); } catch (e) { /* niente */ } }
      this.attach(this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json' }));
      clearTimeout(this.retry);
      this.retry = setTimeout(tryConn, 6000);
    };
    this.tryConn = tryConn;
    tryConn();
  }

  openPeer(Peer, id) {
    return new Promise((res, rej) => {
      const peer = id ? new Peer(id, PEER_OPTS) : new Peer(PEER_OPTS);
      let done = false;
      peer.on('open', () => { done = true; this.peer = peer; res(); });
      peer.on('error', e => {
        if (!done) { done = true; try { peer.destroy(); } catch (x) { /* niente */ } rej(e); return; }
        if (e && e.type === 'peer-unavailable') {
          this.sawUnavail = true;
          if (this.role === 'guest' && this.tryConn) { if (!this.relay) this.status('Cerco la gara ' + this.code + '… (l\'host deve tenere il gioco aperto)'); clearTimeout(this.retry); this.retry = setTimeout(this.tryConn, 2500); }
          else this.status('Nessuna gara con questo codice.', 'err');
        }
        else if (e && (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error')) this.status('Problema di rete: controlla la connessione.', 'err');
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (x) { /* niente */ } });
    });
  }

  attach(conn) {
    const L = new Link(conn);
    if (this.role === 'host') this.links.push(L); else this.link = L;
    const alive = () => (this.role === 'host' ? this.links.includes(L) : this.link === L);
    const onOpen = () => {
      if (!alive() || L.connected) return;
      L.connected = true;
      L.lastRecv = performance.now();
      // segnale di presenza ogni secondo (anche in sala d'attesa e durante il via, quando non si guida)
      L.ping = setInterval(() => L.send({ k: 'ping', s: performance.now() }), 1000);
      this.status(this.role === 'host' ? 'Giocatore collegato' : 'Collegato!', 'ok');
      if (this.onMsg) this.onMsg({ k: 'open' }, L);
    };
    if (conn.isRelay && conn.open) onOpen(); else conn.on('open', onOpen);
    conn.on('data', m => {
      if (!alive()) return;
      L.lastRecv = performance.now();
      if (!m || typeof m !== 'object') return;
      if (m.k === 'ping' && m.s != null) { L.send({ k: 'pong', s: m.s }); return; }
      if (m.k === 'pong') { const rtt = performance.now() - m.s; if (rtt > 0 && rtt < 5000) L.rtt = L.rtt == null ? rtt : L.rtt * 0.8 + rtt * 0.2; return; }
      if (m.k === 'st' || m.k === 'bots') this.store(m, L);
      if (m.k === 'bots' && m.sc && this.onSc) this.onSc(m.sc, L);
      // host: la posizione di un ospite si gira agli altri, con l'orario già portato su quello dell'host
      if (this.role === 'host' && m.k === 'st' && L.off != null) {
        const f = { k: 'st', t: r3(m.t - L.off - L.lat), c: m.c, fw: 1 };
        for (const o of this.links) if (o !== L) o.send(f);
      }
      if (this.onMsg) this.onMsg(m, L);
    });
    conn.on('close', () => this.drop(L));
    conn.on('error', () => {});
    return L;
  }

  // collegamento chiuso o muto
  drop(L) {
    clearInterval(L.ping);
    const was = L.connected;
    L.connected = false;
    if (this.role === 'host') this.links = this.links.filter(x => x !== L);
    else if (this.link !== L) return;
    if (was && this.onMsg) this.onMsg({ k: 'lost' }, L);
  }

  // a tutti (host) o all'host (ospite)
  send(m) { for (const L of this.allLinks()) L.send(m); }

  close() {
    try { this.send({ k: 'bye' }); } catch (e) { /* niente */ }
    const ls = this.allLinks().slice(), peer = this.peer, relay = this.relay;
    setTimeout(() => {
      for (const L of ls) { try { L.conn.close(); } catch (e) { /* niente */ } }
      try { peer && peer.destroy(); } catch (e) { /* niente */ } try { relay && relay.close(); } catch (e) { /* niente */ }
    }, 200);
    for (const L of ls) { clearInterval(L.ping); L.connected = false; }
    clearInterval(this.keep); clearTimeout(this.retry); clearTimeout(this.relayT); this.tryConn = null; this.relay = null;
    this.link = null; this.links = []; this.role = null; this.buf.clear();
  }

  // ---- stato in gara ----
  resetRace() { this.buf.clear(); this.sendT = 0; for (const L of this.allLinks()) { L.off = null; L.lastT = null; L.offT = null; } }

  store(m, L) {
    const list = m.k === 'st' ? [m.c] : m.cars;
    if (!Array.isArray(list)) return;
    for (const d of list) {
      if (!Array.isArray(d)) continue;
      const slot = d[0];
      let b = this.buf.get(slot);
      if (!b) { b = []; this.buf.set(slot, b); }
      if (b.length && m.t <= b[b.length - 1].t) continue;
      b.push({ t: m.t, d, src: L });
      if (b.length > 40) b.shift();
    }
    // per l'orologio contano solo i dati arrivati direttamente da chi li ha mandati
    if (!m.fw) L.lastT = m.t;
  }

  // ogni passo di simulazione: invio periodico del proprio stato (e dei bot, se host)
  tick(race, dt) {
    if (!this.connected) return;
    // differenza di orologio con ognuno (media dei pacchetti: insieme a metà del ritardo di andata
    // e ritorno dà l'orario dell'altro "adesso")
    for (const L of this.allLinks()) if (L.lastT != null && L.offT !== L.lastT) {
      L.offT = L.lastT; const o = L.lastT - race.t;
      L.off = L.off == null ? o : L.off * 0.93 + o * 0.07;
    }
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = this.allLinks().some(L => L.conn.isRelay) ? SEND_EVERY * 1.4 : SEND_EVERY;   // dal ponte: 14 al secondo
    if (race.player) this.send({ k: 'st', t: r3(race.t), c: packCar(race.player) });
    if (this.role === 'host') {
      const m = { k: 'bots', t: r3(race.t), cars: race.cars.filter(c => c.ai).map(packCar) };
      if (this.scState) m.sc = this.scState();
      this.send(m);
    }
  }

  // vetture remote: dove sono ADESSO, cioè ultimo dato + previsione con velocità e rotazione
  // per il tempo di viaggio sulla rete
  apply(race) {
    const fdt = Math.max(0, Math.min(0.1, race.t - (this.lastApply ?? race.t))); this.lastApply = race.t;
    for (const c of race.cars) {
      if (!c.remote) continue;
      const b = this.buf.get(c.slot);
      if (!b || !b.length) continue;
      const src = b[b.length - 1].src;
      if (!src || src.off == null) continue;
      const tr = race.t + src.off + src.lat;
      let a = b[0], z = b[b.length - 1], k = 0;
      if (tr <= a.t) z = a;
      else if (tr >= z.t) { a = z; k = Math.min(0.6, tr - z.t); }      // previsione fino a 0,6 s
      else for (let i = 1; i < b.length; i++) if (b[i].t >= tr) { a = b[i - 1]; z = b[i]; k = (tr - a.t) / Math.max(1e-3, z.t - a.t); break; }
      const A = a.d, Z = z.d, p = c.phys;
      const lerp = (i) => A[i] + (Z[i] - A[i]) * k;
      const lerpAng = (i) => { let d = Z[i] - A[i]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return A[i] + d * k; };
      let tx, tz, tyaw;
      if (a === z && k > 0) {
        // previsione: si prosegue con la velocità dell'ultimo dato, curvando come stava curvando
        const w = A[25] || 0, th = w * k, cw = Math.cos(th), sw = Math.sin(th);
        const vx = A[7] * cw - A[8] * sw, vz = A[7] * sw + A[8] * cw;
        tx = A[1] + (A[7] + vx) / 2 * k; tz = A[3] + (A[8] + vz) / 2 * k; tyaw = A[4] + w * k;
        p.y = A[2];
      } else { tx = lerp(1); p.y = lerp(2); tz = lerp(3); tyaw = lerpAng(4); }
      // quando arriva un dato nuovo la posa salta un po': il salto si assorbe in pochi decimi di secondo
      const N = c.net || (c.net = { x: tx, z: tz, yaw: tyaw, ex: 0, ez: 0, ey: 0, px: tx, pz: tz, pyaw: tyaw });
      const vxp = lerp(7), vzp = lerp(8);
      const jx = tx - (N.px + vxp * fdt), jz = tz - (N.pz + vzp * fdt);
      let jy = tyaw - N.pyaw; while (jy > Math.PI) jy -= 2 * Math.PI; while (jy < -Math.PI) jy += 2 * Math.PI; jy -= (A[25] || 0) * fdt;
      if (Math.hypot(jx, jz) < 12) { N.ex -= jx; N.ez -= jz; N.ey -= jy; } else { N.ex = N.ez = N.ey = 0; }   // salti enormi (box, ripartenza): subito
      const dec = Math.exp(-fdt * 7);
      N.ex *= dec; N.ez *= dec; N.ey *= dec;
      N.px = tx; N.pz = tz; N.pyaw = tyaw;
      p.x = tx + N.ex; p.z = tz + N.ez; p.yaw = tyaw + N.ey;
      p.pitch = A[5]; p.roll = A[6]; p.vx = lerp(7); p.vz = lerp(8); p.speed = lerp(9); p.steer = lerp(10);
      p.gear = Z[11]; p.rpm = lerp(12); p.throttleOut = Z[13]; p.yawRate = Z[25] || 0;
      p.vxl = p.speed; p.vyl = 0;
      for (const w of p.wheels) { w.spin = p.speed; w.slide = 0; w.comp = 0.013; }
      p.projectAll();
      for (const w of p.wheels) w.ground = w.pr.y;
      // dati di gara (dall'ultimo pacchetto)
      const L = z.d;
      c.crossings = L[14]; c.finishT = L[15] < 0 ? null : L[15];
      p.inPit = !!L[16];
      if (p.compound !== L[17]) { p.compound = L[17]; c.compoundChanged = true; }
      if (L[18] && !c.retired) { c.retired = true; c.retireT = race.t; c.retireWhy = c.retireWhy || 'RITIRATO'; }
      c.gone = !!L[19];
      c.penalty = L[20]; c.penServed = L[21];
      c.bestLap = L[22] < 0 ? null : L[22]; c.lastLapT = L[23] < 0 ? null : L[23]; c.stops = L[24];
    }
  }

  // nessun dato da più di 12 s da qualcuno: connessione persa (restituisce quel collegamento)
  // (si conta solo il tempo in cui questo dispositivo gira davvero: un fotogramma lunghissimo o l'app in pausa non valgono)
  stale() {
    const now = performance.now(), gap = now - (this.lastCheck || now);
    this.lastCheck = now;
    for (const L of this.allLinks()) {
      if (gap > 1000) L.lastRecv += gap;
      if (L.connected && now - L.lastRecv > 12000) return L;
    }
    return null;
  }
}
