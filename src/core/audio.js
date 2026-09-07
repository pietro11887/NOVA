/**
 * Audio interamente sintetizzato con WebAudio: nessun file da scaricare,
 * quindi il gioco parte istantaneamente anche in 3G.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.engine = null;
  }

  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this._buildEngine();
    this._buildSiren();
    this._buildRain();
  }

  /** Pioggia: rumore bianco filtrato, il volume segue l'intensita'. */
  _buildRain() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.4;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 420;
    this.rainGain = c.createGain();
    this.rainGain.gain.value = 0;
    src.connect(hp); hp.connect(lp); lp.connect(this.rainGain); this.rainGain.connect(this.master);
    src.start();
    this.rainFilter = lp;
  }

  setRain(k) {
    if (!this.ctx || !this.rainGain) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(Math.min(0.34, k * 0.34), t, 0.6);
    this.rainFilter.frequency.setTargetAtTime(1500 + k * 2600, t, 0.6);
  }

  /** Tuono: botto grave con coda lunga. */
  thunder() {
    if (!this.ctx) return;
    this.noise(1.4, 180, 0.5, 'lowpass');
    this.blip(46, 1.1, 'sine', 0.4);
    setTimeout(() => this.noise(0.9, 320, 0.25, 'lowpass'), 260);
  }

  _noiseBuffer() {
    if (this._nb) return this._nb;
    const len = this.ctx.sampleRate * 2;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._nb = b;
    return b;
  }

  _buildEngine() {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    const sub = c.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 30;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 700;
    const gain = c.createGain();
    gain.gain.value = 0;
    osc.connect(filt); sub.connect(filt); filt.connect(gain); gain.connect(this.master);
    osc.start(); sub.start();
    this.engine = { osc, sub, gain, filt };
  }

  _buildSiren() {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 700;
    const gain = c.createGain();
    gain.gain.value = 0;
    osc.connect(gain); gain.connect(this.master);
    osc.start();
    this.siren = { osc, gain, t: 0 };
  }

  /** rpm 0..1, load 0..1, volume in base alla distanza. */
  setEngine(rpm, volume) {
    if (!this.ctx || !this.engine) return;
    const e = this.engine, t = this.ctx.currentTime;
    e.osc.frequency.setTargetAtTime(55 + rpm * 210, t, 0.08);
    e.sub.frequency.setTargetAtTime(28 + rpm * 100, t, 0.08);
    e.filt.frequency.setTargetAtTime(400 + rpm * 1800, t, 0.1);
    e.gain.gain.setTargetAtTime(volume * 0.16, t, 0.12);
  }

  setSiren(on, dt) {
    if (!this.ctx || !this.siren) return;
    const s = this.siren, t = this.ctx.currentTime;
    s.gain.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.15);
    if (on) {
      s.t += dt;
      s.osc.frequency.setTargetAtTime(Math.sin(s.t * 4) > 0 ? 880 : 620, t, 0.02);
    }
  }

  /** Nota con inviluppo morbido e filtro: la base della radio. */
  tone(freq, dur = 0.3, type = 'sawtooth', vol = 0.18, cutoff = 2000) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  blip(freq = 440, dur = 0.12, type = 'square', vol = 0.25) {
    if (!this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(c.currentTime + dur);
  }

  noise(dur = 0.18, freq = 900, vol = 0.35, type = 'lowpass') {
    if (!this.ctx) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer();
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); src.stop(c.currentTime + dur);
  }

  punch()  { this.noise(0.14, 380, 0.5); this.blip(120, 0.1, 'sine', 0.3); }
  shot()   { this.noise(0.16, 2200, 0.55, 'highpass'); this.blip(90, 0.14, 'square', 0.35); }
  crash(v) { this.noise(0.35, 260 + v * 40, Math.min(0.7, 0.15 + v * 0.06)); }
  cash()   { this.blip(880, 0.08, 'square', 0.22); setTimeout(() => this.blip(1320, 0.12, 'square', 0.2), 70); }
  hurt()   { this.blip(160, 0.18, 'sawtooth', 0.28); }
  ui()     { this.blip(660, 0.05, 'square', 0.15); }
  door()   { this.noise(0.25, 320, 0.25); }
  horn()   { this.blip(400, 0.35, 'square', 0.2); }
  step()   { this.noise(0.06, 500, 0.12); }
}
