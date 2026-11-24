// Amici: ognuno ha un codice amico (6 lettere) salvato sul dispositivo. Si aggiunge un amico col suo codice;
// lo stato (online, in sala d'attesa con il codice della gara, in gara) e gli inviti passano dai server ponte
// pubblici (MQTT), gli stessi della gara online: niente account, niente server nostri.
import { Mqtt, BROKERS } from './relay.js?v=6123c3ca';

const ROOT = 'novagp-v1/u/';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* niente */ } };

export function myId() {
  let id = get('novaf1.myid', null);
  if (!id || !/^[A-Z0-9]{6}$/.test(id)) { id = Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join(''); put('novaf1.myid', id); }
  return id;
}
export const cleanId = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

export class Friends {
  constructor(getName) {
    this.getName = getName;             // () => il tuo nome
    this.id = myId();
    this.list = get('novaf1.friends', []);   // [{ id, name }]
    this.seen = new Map();              // id -> { n, t, st, code, track, cls }
    this.ms = [];
    this.state = { st: 'menu' };
    this.onChange = null;               // () => {}
    this.onInbox = null;                // (msg) => {}
    this.got = new Set();
  }
  save() { put('novaf1.friends', this.list); }
  start() {
    if (this.started) return; this.started = true;
    for (const url of BROKERS) {
      let m;
      try {
        m = new Mqtt(url, ROOT + this.id + '/in', (msg, topic) => this.recv(msg, topic), st => {
          if (st === 'ready') { this.ms.push(m); for (const f of this.list) m.subscribe(ROOT + f.id + '/p'); this.beat(); }
          else if (st === 'close' || st === 'error') this.ms = this.ms.filter(x => x !== m);
        });
      } catch (e) { /* server non raggiungibile */ }
    }
    clearInterval(this.hb); this.hb = setInterval(() => this.beat(), 20000);
    clearInterval(this.ref); this.ref = setInterval(() => this.onChange && this.onChange(), 10000);
    // chiudendo il gioco: subito "offline"
    addEventListener('pagehide', () => this.pub(ROOT + this.id + '/p', { n: this.getName(), t: 0 }, true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.beat(); });
  }
  pub(topic, obj, retain) { for (const m of this.ms) m.publish(topic, obj, retain); }
  // il tuo stato: 'menu' | 'lobby' (con codice della gara) | 'race'
  set(st) { this.state = st; this.beat(); }
  beat() { this.pub(ROOT + this.id + '/p', { n: this.getName(), t: Date.now(), ...this.state }, true); }
  recv(msg, topic) {
    if (!msg || typeof msg !== 'object') return;
    const p = topic.split('/');
    if (p[3] === 'p') {
      const prev = this.seen.get(p[2]);
      if (prev && prev.t > msg.t) return;
      this.seen.set(p[2], msg);
      const f = this.list.find(x => x.id === p[2]);
      if (f && msg.n && f.name !== msg.n) { f.name = msg.n; this.save(); }
      if (this.onChange) this.onChange();
    } else if (p[3] === 'in') {
      if (!msg.u || this.got.has(msg.u)) return;           // stesso messaggio da più server
      this.got.add(msg.u);
      if (msg.k === 'req' && msg.from && !this.list.find(x => x.id === msg.from)) msg.unknown = true;
      if (this.onInbox) this.onInbox(msg);
    }
  }
  send(to, obj) { this.pub(ROOT + to + '/in', { ...obj, from: this.id, n: this.getName(), u: Math.random().toString(36).slice(2) }, false); }
  add(id, name, notify = true) {
    id = cleanId(id);
    if (id.length !== 6 || id === this.id) return false;
    if (!this.list.find(x => x.id === id)) { this.list.push({ id, name: name || id }); this.save(); for (const m of this.ms) m.subscribe(ROOT + id + '/p'); }
    if (notify) this.send(id, { k: 'req' });
    if (this.onChange) this.onChange();
    return true;
  }
  remove(id) { this.list = this.list.filter(x => x.id !== id); this.save(); if (this.onChange) this.onChange(); }
  invite(id, info) { this.send(id, { k: 'inv', ...info }); }
  // stato di un amico: online se si è fatto sentire nell'ultimo minuto
  status(id) {
    const s = this.seen.get(id);
    if (!s || !s.t || Date.now() - s.t > 65000) return { on: false };
    return { on: true, st: s.st || 'menu', code: s.code || null, track: s.track || '', cls: s.cls || '' };
  }
  get connected() { return this.ms.length > 0; }
}
