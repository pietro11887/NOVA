/**
 * Collegamento diretto tra due giocatori (WebRTC), senza alcun server:
 * chi crea la partita genera un codice, l'amico lo incolla e rimanda il
 * suo. Da li' in poi i dati viaggiano da browser a browser.
 */

const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

const b64 = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

async function pack(obj) {
  const json = JSON.stringify(obj);
  if (typeof CompressionStream === 'undefined') return `r${b64(new TextEncoder().encode(json))}`;
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  return `z${b64(buf)}`;
}

async function unpack(code) {
  const body = code.trim().replace(/\s+/g, '');
  const bytes = unb64(body.slice(1));
  if (body[0] === 'r') return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}

export class Net {
  constructor() {
    this.pc = null;
    this.ch = null;
    this.connected = false;
    this.isHost = false;
    this.lastSeen = 0;
    this.peerName = 'Amico';
    this.handlers = {};
    this.onState = null;
  }

  /** Piu' ascoltatori per evento: menu e gioco si iscrivono entrambi. */
  on(type, fn) {
    (this.handlers[type] = this.handlers[type] || []).push(fn);
  }

  _emit(type, msg) {
    const list = this.handlers[type];
    if (list) for (const fn of list) fn(msg);
  }

  _setup() {
    this.pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed' || s === 'disconnected' || s === 'closed') this._drop();
    };
  }

  _bind(ch) {
    this.ch = ch;
    ch.onopen = () => {
      this.connected = true;
      this.lastSeen = performance.now();
      this._emit('open');
    };
    ch.onclose = () => this._drop();
    ch.onmessage = (e) => {
      this.lastSeen = performance.now();
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 's') this.onState?.(msg);
      else this._emit(msg.t, msg);
    };
  }

  _drop() {
    if (!this.connected) return;
    this.connected = false;
    this._emit('close');
  }

  /** Aspetta che il browser abbia raccolto tutti i candidati ICE. */
  _gather() {
    return new Promise((resolve) => {
      if (this.pc.iceGatheringState === 'complete') return resolve();
      const done = () => {
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', done);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', done);
      setTimeout(resolve, 3000);   // rete lenta: si parte con quello che c'e'
    });
  }

  /** Chi ospita: crea il canale e restituisce il codice da mandare. */
  async host() {
    this._setup();
    this.isHost = true;
    this._bind(this.pc.createDataChannel('nova', { ordered: true }));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this._gather();
    return pack({ t: 'o', sdp: this.pc.localDescription.sdp });
  }

  /** Chi ospita incolla la risposta dell'amico. */
  async accept(code) {
    const data = await unpack(code);
    if (data.t !== 'a') throw new Error('Questo non è un codice di risposta');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
  }

  /** Chi entra: incolla il codice ricevuto e ne genera uno di ritorno. */
  async join(code) {
    const data = await unpack(code);
    if (data.t !== 'o') throw new Error('Questo non è un codice di invito');
    this._setup();
    this.isHost = false;
    this.pc.ondatachannel = (e) => this._bind(e.channel);
    await this.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this._gather();
    return pack({ t: 'a', sdp: this.pc.localDescription.sdp });
  }

  send(obj) {
    if (!this.connected || this.ch.readyState !== 'open') return false;
    try { this.ch.send(JSON.stringify(obj)); return true; } catch { return false; }
  }

  /** Nessun pacchetto da troppo tempo: la connessione e' andata. */
  tick() {
    if (this.connected && performance.now() - this.lastSeen > 9000) this._drop();
  }

  close() {
    try { this.ch?.close(); this.pc?.close(); } catch { /* gia' chiuso */ }
    this._drop();
  }
}
