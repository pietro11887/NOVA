// Gara online in due (ognuno sul suo dispositivo), collegamento diretto tra i due con WebRTC (PeerJS).
// - Chi crea la gara (host) riceve un codice di 4 cifre; l'altro (ospite) lo scrive e si collega.
// - L'host decide circuito, categoria e regole e fa girare i bot; l'ospite li vede arrivare dai suoi dati.
// - Ognuno guida la propria vettura con la fisica sul proprio dispositivo (niente ritardo nei comandi)
//   e manda la sua posizione 20 volte al secondo; le vetture degli altri si muovono interpolate
//   con un piccolo ritardo, come nei giochi online.

export const NET_VER = 1;
const PREFIX = 'novagp-v1-';
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

export class Online {
  constructor() {
    this.role = null;          // 'host' | 'guest'
    this.code = null;
    this.peer = null;
    this.conn = null;
    this.connected = false;
    this.onMsg = null;         // (msg) => {}
    this.onStatus = null;      // (text, kind) => {}
    this.buf = new Map();      // slot -> [{ t, d }]
    this.off = null;           // differenza di orologio (tempo di gara dell'altro - mio)
    this.sendT = 0;
    this.lastRecv = 0;
  }

  status(text, kind = '') { if (this.onStatus) this.onStatus(text, kind); }

  async host() {
    const Peer = await loadPeer();
    this.role = 'host';
    for (let tries = 0; tries < 6; tries++) {
      const code = String(1000 + Math.floor(Math.random() * 9000));
      try { await this.openPeer(Peer, PREFIX + code); this.code = code; break; }
      catch (e) { if (tries === 5 || !(e && e.type === 'unavailable-id')) throw e; }
    }
    this.peer.on('connection', conn => {
      if (this.conn && this.connected) { conn.on('open', () => { conn.send({ k: 'full' }); setTimeout(() => conn.close(), 500); }); return; }
      this.attach(conn);
    });
    this.status('In attesa del secondo giocatore…');
    return this.code;
  }

  async join(code) {
    const Peer = await loadPeer();
    this.role = 'guest';
    this.code = code;
    await this.openPeer(Peer);
    this.status('Collegamento alla gara ' + code + '…');
    const conn = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
    this.attach(conn);
    // se l'host non risponde
    setTimeout(() => { if (!this.connected && this.role === 'guest') this.status('Nessuna gara con il codice ' + code + '. Controlla il codice e che l\'altro abbia creato la gara.', 'err'); }, 9000);
  }

  openPeer(Peer, id) {
    return new Promise((res, rej) => {
      const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
      let done = false;
      peer.on('open', () => { done = true; this.peer = peer; res(); });
      peer.on('error', e => {
        if (!done) { done = true; try { peer.destroy(); } catch (x) { /* niente */ } rej(e); return; }
        if (e && e.type === 'peer-unavailable') this.status('Nessuna gara con questo codice.', 'err');
        else if (e && (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error')) this.status('Problema di rete: controlla la connessione.', 'err');
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (x) { /* niente */ } });
    });
  }

  attach(conn) {
    this.conn = conn;
    conn.on('open', () => {
      if (this.conn !== conn) return;
      this.connected = true;
      this.lastRecv = performance.now();
      // segnale di presenza ogni secondo (anche in sala d'attesa e durante il via, quando non si guida)
      clearInterval(this.ping);
      this.ping = setInterval(() => this.send({ k: 'ping' }), 1000);
      this.status(this.role === 'host' ? 'Giocatore collegato' : 'Collegato!', 'ok');
      if (this.onMsg) this.onMsg({ k: 'open' });
    });
    conn.on('data', m => {
      if (this.conn !== conn) return;
      this.lastRecv = performance.now();
      if (!m || typeof m !== 'object') return;
      if (m.k === 'st' || m.k === 'bots') this.store(m);
      if (this.onMsg) this.onMsg(m);
    });
    conn.on('close', () => { if (this.conn !== conn) return; clearInterval(this.ping); const was = this.connected; this.connected = false; if (was && this.onMsg) this.onMsg({ k: 'lost' }); });
    conn.on('error', () => {});
  }

  send(m) { if (this.conn && this.connected) { try { this.conn.send(m); } catch (e) { /* niente */ } } }

  close() {
    try { this.send({ k: 'bye' }); } catch (e) { /* niente */ }
    setTimeout(() => { try { this.conn && this.conn.close(); } catch (e) { /* niente */ } try { this.peer && this.peer.destroy(); } catch (e) { /* niente */ } }, 200);
    clearInterval(this.ping);
    this.connected = false; this.conn = null; this.role = null; this.buf.clear(); this.off = null;
  }

  // ---- stato in gara ----
  resetRace() { this.buf.clear(); this.off = null; this.sendT = 0; }

  store(m) {
    const list = m.k === 'st' ? [m.c] : m.cars;
    for (const d of list) {
      const slot = d[0];
      let b = this.buf.get(slot);
      if (!b) { b = []; this.buf.set(slot, b); }
      if (b.length && m.t <= b[b.length - 1].t) continue;
      b.push({ t: m.t, d });
      if (b.length > 40) b.shift();
    }
    this.lastT = m.t;
  }

  // ogni passo di simulazione: invio periodico del proprio stato (e dei bot, se host)
  tick(race, dt) {
    if (!this.connected) return;
    // stima della differenza di orologio (si prende il minimo: il ritardo di rete si somma sempre)
    if (this.lastT != null) {
      const o = this.lastT - race.t;
      this.off = this.off == null ? o : Math.min(o, this.off + dt * 0.05);
    }
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = SEND_EVERY;
    this.send({ k: 'st', t: r3(race.t), c: packCar(race.player) });
    if (this.role === 'host') this.send({ k: 'bots', t: r3(race.t), cars: race.cars.filter(c => c.ai).map(packCar) });
  }

  // vetture remote: posizione interpolata nel passato recente, più i dati di gara
  apply(race) {
    if (this.off == null) return;
    const tr = race.t + this.off - DELAY;
    for (const c of race.cars) {
      if (!c.remote) continue;
      const b = this.buf.get(c.slot);
      if (!b || !b.length) continue;
      let a = b[0], z = b[b.length - 1], k = 0;
      if (tr <= a.t) z = a;
      else if (tr >= z.t) { a = z; k = Math.min(0.25, tr - z.t); }     // dati in ritardo: breve previsione
      else for (let i = 1; i < b.length; i++) if (b[i].t >= tr) { a = b[i - 1]; z = b[i]; k = (tr - a.t) / Math.max(1e-3, z.t - a.t); break; }
      const A = a.d, Z = z.d, p = c.phys;
      const lerp = (i) => A[i] + (Z[i] - A[i]) * k;
      const lerpAng = (i) => { let d = Z[i] - A[i]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return A[i] + d * k; };
      if (a === z && k > 0) {
        // previsione: si prosegue con la velocità dell'ultimo dato
        p.x = A[1] + A[7] * k; p.z = A[3] + A[8] * k; p.y = A[2]; p.yaw = A[4] + (A[25] || 0) * k;
      } else { p.x = lerp(1); p.y = lerp(2); p.z = lerp(3); p.yaw = lerpAng(4); }
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

  // nessun dato da più di 6 s: connessione persa
  // (si conta solo il tempo in cui questo dispositivo gira davvero: un fotogramma lunghissimo o l'app in pausa non valgono)
  stale() {
    const now = performance.now(), gap = now - (this.lastCheck || now);
    this.lastCheck = now;
    if (gap > 1000) this.lastRecv += gap;
    return this.connected && now - this.lastRecv > 12000;
  }
}
