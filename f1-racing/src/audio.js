// Suoni sintetizzati con WebAudio: motore V6 turbo, vento, stridio gomme, cordoli, urti.

export class Sound {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);

    // rumore bianco condiviso
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const noise = () => { const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true; n.start(); return n; };

    // motore
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.Q.value = 3;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    this.oscs = [
      { type: 'sawtooth', mul: 1, gain: 0.45 },
      { type: 'square', mul: 0.5, gain: 0.3 },
      { type: 'sawtooth', mul: 2.01, gain: 0.18 },
      { type: 'triangle', mul: 3, gain: 0.12 },
    ].map(o => {
      const osc = ctx.createOscillator(); osc.type = o.type;
      const g = ctx.createGain(); g.gain.value = o.gain;
      osc.connect(g); g.connect(shaper); osc.start();
      return { osc, mul: o.mul };
    });
    shaper.connect(this.engFilter); this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    // turbo / fischio
    this.turbo = ctx.createOscillator(); this.turbo.type = 'sine';
    this.turboGain = ctx.createGain(); this.turboGain.gain.value = 0;
    this.turbo.connect(this.turboGain); this.turboGain.connect(this.master); this.turbo.start();

    // vento
    const wn = noise();
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 700; this.windF.Q.value = 0.6;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    wn.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);

    // stridio gomme
    const sn = noise();
    this.skidF = ctx.createBiquadFilter(); this.skidF.type = 'bandpass'; this.skidF.frequency.value = 1500; this.skidF.Q.value = 6;
    this.skidG = ctx.createGain(); this.skidG.gain.value = 0;
    sn.connect(this.skidF); this.skidF.connect(this.skidG); this.skidG.connect(this.master);
    this.squeal = ctx.createOscillator(); this.squeal.type = 'triangle'; this.squeal.frequency.value = 950;
    this.squealG = ctx.createGain(); this.squealG.gain.value = 0;
    this.squeal.connect(this.squealG); this.squealG.connect(this.master); this.squeal.start();

    // cordoli (rombo a bassa frequenza)
    this.kerbOsc = ctx.createOscillator(); this.kerbOsc.type = 'square'; this.kerbOsc.frequency.value = 60;
    this.kerbF = ctx.createBiquadFilter(); this.kerbF.type = 'lowpass'; this.kerbF.frequency.value = 320;
    this.kerbG = ctx.createGain(); this.kerbG.gain.value = 0;
    this.kerbOsc.connect(this.kerbF); this.kerbF.connect(this.kerbG); this.kerbG.connect(this.master); this.kerbOsc.start();

    // erba / ghiaia
    const gn = noise();
    this.offF = ctx.createBiquadFilter(); this.offF.type = 'lowpass'; this.offF.frequency.value = 500;
    this.offG = ctx.createGain(); this.offG.gain.value = 0;
    gn.connect(this.offF); this.offF.connect(this.offG); this.offG.connect(this.master);
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }

  update(car, running) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, sm = 0.03;
    const rpm = car.rpm;
    const f = rpm / 20; // V6 4 tempi: 3 scoppi per giro
    let lim = car.limiter ? (Math.sin(t * 90) > 0 ? 0.55 : 1) : 1;
    for (const o of this.oscs) o.osc.frequency.setTargetAtTime(f * o.mul, t, 0.015);
    const thr = car.throttleOut;
    const vol = running ? (0.16 + thr * 0.22) * lim : 0.1;
    this.engGain.gain.setTargetAtTime(vol, t, sm);
    this.engFilter.frequency.setTargetAtTime(600 + thr * 2600 + rpm * 0.12, t, sm);
    this.turbo.frequency.setTargetAtTime(2400 + rpm * 0.35, t, sm);
    this.turboGain.gain.setTargetAtTime(thr * 0.012 * Math.min(1, rpm / 9000), t, 0.1);

    const v = car.speed;
    this.windG.gain.setTargetAtTime(Math.min(0.25, v * v * 0.00003), t, 0.1);
    this.windF.frequency.setTargetAtTime(400 + v * 12, t, 0.1);

    let slide = 0, kerb = 0, off = 0;
    for (const w of car.wheels) {
      if (w.fz > 0) {
        slide = Math.max(slide, w.slide);
        if (w.onKerb) kerb += 0.25;
        if (w.sf.type >= 3) off += 0.25;
      }
    }
    const sv = Math.min(1, v / 20);
    this.skidG.gain.setTargetAtTime(slide * 0.07 * sv, t, 0.04);
    this.squealG.gain.setTargetAtTime(slide * 0.035 * sv, t, 0.04);
    this.squeal.frequency.setTargetAtTime(850 + slide * 250 + Math.sin(t * 17) * 30, t, 0.05);
    this.kerbG.gain.setTargetAtTime(kerb * 0.5 * Math.min(1, v / 10), t, 0.02);
    this.kerbOsc.frequency.setTargetAtTime(Math.max(25, Math.min(140, v / 0.9 * 0.9)), t, 0.03);
    this.offG.gain.setTargetAtTime(off * 0.35 * Math.min(1, v / 15), t, 0.05);
  }

  crash(strength) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = Math.min(1, strength);
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + s * 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9 * s, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + s * 0.5);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + 1.2);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.8 * s, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.5);
  }

  beep(freq = 880, dur = 0.18, vol = 0.25) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
}
