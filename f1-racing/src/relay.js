// Collegamento di riserva per la gara online: quando i due telefoni non riescono a parlarsi direttamente
// (reti diverse, operatori mobili che nascondono l'indirizzo), i messaggi passano da un "broker MQTT"
// pubblico e gratuito su WebSocket sicuro (niente account). Piccolo client MQTT 3.1.1 (solo QoS 0).
// Stessa interfaccia della connessione PeerJS: on('open'|'data'|'close'|'error'), send(obj), close().

export const BROKERS = globalThis.__NOVA_BROKERS || [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

const te = new TextEncoder(), td = new TextDecoder();
const str = s => { const b = te.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
function packet(type, body) {
  const len = [];
  let n = body.length;
  do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
  const out = new Uint8Array(1 + len.length + body.length);
  out[0] = type; out.set(len, 1); out.set(body, 1 + len.length);
  return out;
}

// un collegamento MQTT: si pubblica su "pub", si ricevono i messaggi di "sub"
export class Mqtt {
  constructor(url, sub, onMsg, onState) {
    this.sub = sub; this.onMsg = onMsg; this.onState = onState; this.buf = new Uint8Array(0); this.ok = false;
    const ws = this.ws = new WebSocket(url, 'mqtt');
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      const id = 'nova' + Math.random().toString(36).slice(2, 12);
      ws.send(packet(0x10, new Uint8Array([...str('MQTT'), 4, 0x02, 0, 30, ...str(id)])));
    };
    ws.onmessage = e => this.feed(new Uint8Array(e.data));
    ws.onerror = () => this.onState('error');
    ws.onclose = () => { clearInterval(this.ping); this.onState('close'); };
  }
  feed(chunk) {
    const b = new Uint8Array(this.buf.length + chunk.length); b.set(this.buf); b.set(chunk, this.buf.length);
    let p = 0;
    for (;;) {
      if (b.length - p < 2) break;
      let mul = 1, len = 0, q = p + 1, d;
      do { if (q >= b.length) { q = -1; break; } d = b[q++]; len += (d & 127) * mul; mul *= 128; } while (d & 128);
      if (q < 0 || q + len > b.length) break;
      this.handle(b[p] & 0xf0, b.subarray(q, q + len));
      p = q + len;
    }
    this.buf = b.slice(p);
  }
  handle(type, body) {
    if (type === 0x20) {                                   // CONNACK
      if (body[1] !== 0) { this.onState('error'); return; }
      this.ws.send(packet(0x82, new Uint8Array([0, 1, ...str(this.sub), 0])));
    } else if (type === 0x90) {                            // SUBACK: pronti (solo la prima volta)
      if (this.ok) return;
      this.ok = true;
      this.ping = setInterval(() => { try { this.ws.send(new Uint8Array([0xc0, 0])); } catch (e) { /* niente */ } }, 20000);
      this.onState('ready');
    } else if (type === 0x30) {                            // PUBLISH (QoS 0)
      const tl = (body[0] << 8) | body[1];
      if (body.length <= 2 + tl) return;                   // messaggio vuoto (cancella un "trattenuto")
      try { this.onMsg(JSON.parse(td.decode(body.subarray(2 + tl))), td.decode(body.subarray(2, 2 + tl))); } catch (e) { /* messaggio rovinato */ }
    }
  }
  // retain: il server tiene l'ultimo messaggio e lo dà subito a chi si iscrive dopo (stato "online" degli amici)
  publish(topic, obj, retain = false) {
    if (!this.ok || this.ws.readyState !== 1) return;
    this.ws.send(packet(retain ? 0x31 : 0x30, new Uint8Array([...str(topic), ...te.encode(JSON.stringify(obj))])));
  }
  subscribe(topic) {
    if (!this.ok || this.ws.readyState !== 1) return;
    this.pid = ((this.pid || 1) % 60000) + 1;
    this.ws.send(packet(0x82, new Uint8Array([this.pid >> 8, this.pid & 255, ...str(topic), 0])));
  }
  close() { clearInterval(this.ping); try { this.ws.send(new Uint8Array([0xe0, 0])); this.ws.close(); } catch (e) { /* niente */ } }
}

// connessione "ponte" con la stessa interfaccia della connessione PeerJS.
// Ci si collega a TUTTI i broker insieme: i due giocatori si trovano sul primo che funziona per entrambi.
export class RelayConn {
  constructor(room, role) {
    this.room = room; this.role = role; this.h = { open: [], data: [], close: [], error: [] };
    this.open = false; this.closed = false; this.m = null; this.ms = [];
    this.inTopic = `novagp-v1/${room}/${role === 'host' ? 'h' : 'g'}`;
    this.outTopic = `novagp-v1/${room}/${role === 'host' ? 'g' : 'h'}`;
  }
  on(ev, fn) { (this.h[ev] || (this.h[ev] = [])).push(fn); return this; }
  emit(ev, x) { for (const f of this.h[ev] || []) f(x); }
  get broker() { return this.m ? this.m.ws.url.replace(/^wss?:\/\/|[:/].*$/g, '') : ''; }
  // si risolve appena almeno un broker è pronto (errore se nessuno risponde)
  start() {
    return new Promise((res, rej) => {
      let left = BROKERS.length, ok = false;
      const fail = () => { if (--left <= 0 && !ok) rej(new Error('nessun server ponte raggiungibile')); };
      for (const url of BROKERS) {
        let m, settled = false;
        const t = setTimeout(() => { if (!settled) { settled = true; try { m.close(); } catch (e) { /* niente */ } fail(); } }, 8000);
        try {
          m = new Mqtt(url, this.inTopic, msg => this.recv(msg, m), st => {
            if (st === 'ready') { if (!settled) { settled = true; clearTimeout(t); } if (this.closed) { m.close(); return; } this.ms.push(m); if (!ok) { ok = true; res(this); } if (this.role === 'guest' && !this.open) m.publish(this.outTopic, { r: 'hi' }); }
            else if (st === 'error' || st === 'close') { if (!settled) { settled = true; clearTimeout(t); fail(); } this.ms = this.ms.filter(x => x !== m); if (m === this.m) this.end(); }
          });
        } catch (e) { settled = true; clearTimeout(t); fail(); }
      }
      if (this.role === 'guest') {
        // si bussa su tutti i broker finché l'host non risponde
        const knock = () => { if (this.open || this.closed) return; for (const m of this.ms) m.publish(this.outTopic, { r: 'hi' }); this.kt = setTimeout(knock, 1500); };
        this.kt = setTimeout(knock, 1500);
      }
    });
  }
  recv(msg, m) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.r === 'hi') {
      if (this.role !== 'host') return;
      if (this.m && this.m !== m) return;                 // già collegati su un altro broker
      m.publish(this.outTopic, { r: 'ok' });
      if (!this.open) { this.m = m; this.open = true; this.emit('open'); }
      return;
    }
    if (msg.r === 'ok') {
      if (this.role !== 'guest' || this.open) return;
      this.m = m; this.open = true; clearTimeout(this.kt);
      for (const o of this.ms) if (o !== m) o.close();
      this.ms = [m];
      this.emit('open');
      return;
    }
    if (m !== this.m) return;
    if (msg.r === 'bye') { this.end(); return; }
    if (this.open && msg.d !== undefined) this.emit('data', msg.d);
  }
  send(obj) { if (this.m && this.open) this.m.publish(this.outTopic, { d: obj }); }
  end() { if (this.closed) return; this.closed = true; clearTimeout(this.kt); const was = this.open; this.open = false; for (const m of this.ms) { try { m.close(); } catch (e) { /* niente */ } } this.ms = []; if (was) this.emit('close'); }
  close() { try { this.m && this.m.publish(this.outTopic, { r: 'bye' }); } catch (e) { /* niente */ } setTimeout(() => this.end(), 150); }
}
