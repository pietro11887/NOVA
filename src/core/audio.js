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
