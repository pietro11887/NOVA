// Collegamento di riserva per la gara online: quando i due telefoni non riescono a parlarsi direttamente
// (reti diverse, operatori mobili che nascondono l'indirizzo), i messaggi passano da un "broker MQTT"
// pubblico e gratuito su WebSocket sicuro (niente account). Piccolo client MQTT 3.1.1 (solo QoS 0).
// Stessa interfaccia della connessione PeerJS: on('open'|'data'|'close'|'error'), send(obj), close().

export const BROKERS = [
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
class Mqtt {
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
    } else if (type === 0x90) {                            // SUBACK: pronti
      this.ok = true;
      this.ping = setInterval(() => { try { this.ws.send(new Uint8Array([0xc0, 0])); } catch (e) { /* niente */ } }, 20000);
      this.onState('ready');
    } else if (type === 0x30) {                            // PUBLISH (QoS 0)
      const tl = (body[0] << 8) | body[1];
      try { this.onMsg(JSON.parse(td.decode(body.subarray(2 + tl)))); } catch (e) { /* messaggio rovinato */ }
    }
  }
  publish(topic, obj) {
    if (!this.ok || this.ws.readyState !== 1) return;
    this.ws.send(packet(0x30, new Uint8Array([...str(topic), ...te.encode(JSON.stringify(obj))])));
  }
  close() { clearInterval(this.ping); try { this.ws.send(new Uint8Array([0xe0, 0])); this.ws.close(); } catch (e) { /* niente */ } }
}

// apre il collegamento al primo broker che risponde
function openMqtt(sub, onMsg, onState) {
  return new Promise((res, rej) => {
    let k = 0;
    const next = () => {
      if (k >= BROKERS.length) { rej(new Error('nessun server ponte raggiungibile')); return; }
      const url = BROKERS[k++];
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; try { m.close(); } catch (e) { /* niente */ } next(); } }, 6000);
      const m = new Mqtt(url, sub, onMsg, st => {
        if (!done && st === 'ready') { done = true; clearTimeout(t); m.onState = onState; res(m); }
        else if (!done && (st === 'error' || st === 'close')) { done = true; clearTimeout(t); next(); }
      });
    };
    next();
  });
}

// connessione "ponte" con la stessa interfaccia della connessione PeerJS
export class RelayConn {
  constructor(room, role) {
    this.room = room; this.role = role; this.h = { open: [], data: [], close: [], error: [] };
    this.open = false; this.closed = false;
    this.inTopic = `novagp-v1/${room}/${role === 'host' ? 'h' : 'g'}`;
    this.outTopic = `novagp-v1/${room}/${role === 'host' ? 'g' : 'h'}`;
  }
  on(ev, fn) { (this.h[ev] || (this.h[ev] = [])).push(fn); return this; }
  emit(ev, x) { for (const f of this.h[ev] || []) f(x); }
  async start() {
    this.m = await openMqtt(this.inTopic, msg => this.recv(msg), st => { if (st === 'close' || st === 'error') this.end(); });
    if (this.role === 'guest') {
      // si bussa finché l'host non risponde
      const knock = () => { if (!this.open && !this.closed) { this.m.publish(this.outTopic, { r: 'hi' }); this.kt = setTimeout(knock, 1500); } };
      knock();
    }
    return this;
  }
  recv(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.r === 'hi') { if (this.role === 'host') { this.m.publish(this.outTopic, { r: 'ok' }); if (!this.open) { this.open = true; this.emit('open'); } } return; }
    if (msg.r === 'ok') { if (!this.open) { this.open = true; clearTimeout(this.kt); this.emit('open'); } return; }
    if (msg.r === 'bye') { this.end(); return; }
    if (this.open && msg.d !== undefined) this.emit('data', msg.d);
  }
  send(obj) { if (this.m && this.open) this.m.publish(this.outTopic, { d: obj }); }
  end() { if (this.closed) return; this.closed = true; clearTimeout(this.kt); const was = this.open; this.open = false; try { this.m && this.m.close(); } catch (e) { /* niente */ } if (was) this.emit('close'); }
  close() { try { this.m && this.m.publish(this.outTopic, { r: 'bye' }); } catch (e) { /* niente */ } setTimeout(() => this.end(), 150); }
}
