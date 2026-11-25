// Amici: ognuno ha un codice amico (6 lettere) salvato sul dispositivo. Si aggiunge un amico col suo codice;
// lo stato (online, in sala d'attesa con il codice della gara, in gara) e gli inviti passano dai server ponte
// pubblici (MQTT), gli stessi della gara online: niente account, niente server nostri.
import { Mqtt, BROKERS } from './relay.js?v=24517b30';

const ROOT = 'novagp-v1/u/', NAMES = 'novagp-v1/n/';
export const cleanName = s => String(s || '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10);
export const userName = () => get('novaf1.user', null);
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
    this.recs = new Map(); this.recKey = null; this.onRecords = null;
    this.names = new Map();             // NOME -> { id } (dal server)
    this.waiting = new Map();           // NOME -> [risolvi]
  }
  save() { put('novaf1.friends', this.list); }
  start() {
    if (this.started) return; this.started = true;
    for (const url of BROKERS) {
      let m;
      try {
        m = new Mqtt(url, ROOT + this.id + '/in', (msg, topic) => this.recv(msg, topic), st => {
          if (st === 'ready') { this.ms.push(m); for (const f of this.list) m.subscribe(ROOT + f.id + '/p'); this.beat(); if (!this.reclaimed && userName()) { this.reclaimed = true; this.claim(userName()).catch(() => {}); } }
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
    if (p[1] === 'n') {                                   // nome utente -> codice di chi lo usa
      const id = msg.id && !msg.free ? msg.id : null;       // (un nome lasciato libero vale come mai preso)
      if (id) this.names.set(p[2], msg); else this.names.delete(p[2]);
      for (const r of this.waiting.get(p[2]) || []) r(id);
      this.waiting.delete(p[2]);
      return;
    }
    if (p[3] === 'r') {                                   // record di un amico su una pista
      const key = p.slice(4).join('/');
      if (key === this.recKey && msg.time) { this.recs.set(p[2], msg); if (this.onRecords) this.onRecords(); }
      return;
    }
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
  // ---- record degli amici (con il fantasma del giro) per pista e categoria
  pubRecord(key, rec) { this.pub(ROOT + this.id + '/r/' + key, rec, true); }
  watchRecords(key) {
    if (this.recKey !== key) { this.recKey = key; this.recs = new Map(); }
    for (const f of this.list) for (const m of this.ms) m.subscribe(ROOT + f.id + '/r/' + key);
  }
  // aspetta che almeno un server ponte sia collegato (fino a ms millisecondi)
  ready(ms = 6000) {
    return new Promise(res => { const t0 = Date.now(); const k = () => (this.ms.length ? res(true) : Date.now() - t0 > ms ? res(false) : setTimeout(k, 150)); k(); });
  }
  // a chi appartiene un nome utente? (null = libero). Il server dà subito il messaggio "trattenuto", se c'è.
  async lookup(name) {
    name = cleanName(name);
    if (!name) return null;
    this.start();
    if (!(await this.ready())) throw new Error('offline');
    if (this.names.has(name)) return this.names.get(name).id;
    return new Promise(res => {
      const list = this.waiting.get(name) || []; list.push(res); this.waiting.set(name, list);
      for (const m of this.ms) m.subscribe(NAMES + name);
      setTimeout(() => { if (this.waiting.has(name)) { this.waiting.delete(name); res(this.names.has(name) ? this.names.get(name).id : null); } }, 2500);
    });
  }
  // prende il nome (se è libero o è già tuo); 'taken' se lo usa qualcun altro, 'offline' senza collegamento
  async claim(name) {
    name = cleanName(name);
    let owner;
    try { owner = await this.lookup(name); } catch (e) { return 'offline'; }
    if (owner && owner !== this.id) return 'taken';
    const old = get('novaf1.user', null);
    if (old && old !== name) this.pub(NAMES + old, { id: this.id, t: Date.now(), free: 1 }, true);   // il vecchio nome non è più tuo
    this.pub(NAMES + name, { id: this.id, t: Date.now() }, true);
    this.names.set(name, { id: this.id });
    put('novaf1.user', name);
    this.beat();
    return 'ok';
  }
  // aggiunge un amico dal nome utente (o dal codice amico di 6 caratteri)
  async addByName(text) {
    const name = cleanName(text);
    let id = null;
    try { id = await this.lookup(name); } catch (e) { return 'offline'; }
    if (id) { if (id === this.id) return 'self'; this.add(id, name); return 'ok'; }
    if (/^[A-Z0-9]{6}$/.test(name) && name !== this.id) { this.add(name, name); return 'ok'; }
    return 'notfound';
  }
}
