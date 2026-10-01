// Audio del gioco, tutto sintetizzato con WebAudio (nessun file da scaricare).
//
// Motore: un ciclo completo del motore (due giri dell'albero, sei scoppi) viene "costruito"
// all'avvio in un buffer, scoppio per scoppio, con le piccole differenze tra i cilindri e tra
// un ciclo e l'altro che danno il carattere vero. Il buffer gira in loop e la velocità di
// riproduzione segue i giri: il suono è sempre agganciato al contagiri. Due versioni (in tiro e
// in rilascio) si mescolano con l'acceleratore, poi filtri fissi fanno da scarico e aspirazione.
//   F1: V6 1.6 turbo, 12.500 giri, urlo acuto, fischio del turbo, cambiate secche.
//   GT3: sei cilindri boxer aspirato 4.2, 9.400 giri, ringhio più basso, scoppiettii in rilascio.
// Intorno: gomme che stridono o si bloccano, cordoli, ghiaia ed erba, vento, urti a strati
// (botta, carbonio che si rompe, pezzi che rimbalzano), strisciate sul muro, avversari vicini
// con effetto doppler e posizione destra/sinistra, pubblico, box (limitatore, pistole delle
// gomme, cric) e radio del box con la voce.

import { IS_F1 } from './vehicle.js';

const REF_RPM = 6000;                 // giri a cui è costruito il buffer del motore
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// carattere del motore per categoria
const ENGINE = IS_F1 ? {
  rpmMul: 1,                // giri del gioco -> giri del suono
  bank: 0.06,               // differenza tra le due bancate (ringhio a metà frequenza)
  ring: 3.1,                // risonanza dello scoppio (multipli della frequenza di scoppio)
  tauOn: 0.2, tauOff: 0.34, // durata dello scoppio (frazione dell'intervallo)
  rough: 0.12,              // ruvidità della combustione
  lp: [1800, 5200, 0.28],   // filtro: base, + acceleratore, + giri
  peaks: [[3100, 5, 1.2], [850, 3, 0.9], [160, 2, 0.7]],
  vol: 0.95, turbo: true, pops: 0.25, cut: 0.03,
} : {
  rpmMul: 0.75,
  bank: 0.16,
  ring: 2.2,
  tauOn: 0.26, tauOff: 0.42,
  rough: 0.16,
  lp: [900, 3400, 0.22],
  peaks: [[170, 6, 0.8], [1150, 4, 1.1], [2600, 2, 1.4]],
  vol: 1.05, turbo: false, pops: 1, cut: 0.07,
};

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.level = 1; this.radioOn = true; this.view = 'out'; }

  // ------------------------------------------------------------------ avvio
  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.sr = ctx.sampleRate;
    // mix: motore, effetti, ambiente e radio su canali separati, poi un compressore leggero
    this.out = ctx.createGain(); this.out.gain.value = this.muted ? 0 : 0.72 * this.level;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    // limitatore finale: niente distorsioni negli urti forti
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    this.out.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    this.bus = {};
    for (const [k, v] of [['eng', 0.9], ['sfx', 0.9], ['amb', 0.6], ['radio', 0.9]]) { const g = ctx.createGain(); g.gain.value = v; g.connect(this.out); this.bus[k] = g; }

    this.noiseBuf = this.makeNoise(2, false);
    this.pinkBuf = this.makeNoise(3, true);
    this.engOn = this.makeEngine(true, 11);
    this.engOff = this.makeEngine(false, 23);
    this.crowdBuf = this.makeCrowd();
    this.gravelBuf = this.makeGravel();
    this.kerbBuf = this.makeKerb();

    this.buildEngine();
    this.buildTyres();
    this.buildSurfaces();
    this.buildWind();
    this.buildCrowd();
    this.buildScrape();
    this.voices = [0, 1, 2].map(() => this.makeVoice());
    this.prev = { gear: 1, thr: 0, rpm: 0, popsUntil: 0, lastPop: 0, pitBeep: 0 };
  }

  // ------------------------------------------------------------------ buffer
  makeNoise(sec, pink) {
    const b = this.ctx.createBuffer(1, Math.floor(this.sr * sec), this.sr), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (!pink) { d[i] = w; continue; }
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    return b;
  }

  // il ciclo del motore: 24 cicli da 6 scoppi, ognuno un po' diverso
  makeEngine(onLoad, seed) {
    const r = rand(seed), sr = this.sr, E = ENGINE;
    const cyc = Math.round(sr * 120 / REF_RPM), N = 24, len = cyc * N;
    const b = this.ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    const sp = cyc / 6;                                   // campioni tra due scoppi
    const ringF = E.ring * (REF_RPM / 60 * 3) / sr * Math.PI * 2;
    const tau = sp * (onLoad ? E.tauOn : E.tauOff);
    const cylMul = Array.from({ length: 6 }, (_, c) => (1 + (c % 2 ? E.bank : -E.bank)) * (0.94 + r() * 0.12));
    for (let k = 0; k < N; k++) {
      const cycMul = 0.93 + r() * 0.14;
      for (let c = 0; c < 6; c++) {
        const t0 = k * cyc + c * sp + (r() - 0.5) * sp * (onLoad ? 0.03 : 0.09);
        // in rilascio qualche scoppio salta o è debole (il borbottio)
        const miss = !onLoad && r() < 0.12 ? 0.25 : 1;
        const A = cylMul[c] * cycMul * miss * (onLoad ? 1 : 0.5);
        const L = Math.floor(sp * 1.6);
        for (let i = 0; i < L; i++) {
          const t = i, env = Math.exp(-t / tau);
          // fronte d'onda dello scarico: picco, rimbalzo e risonanza smorzata
          const v = A * env * (Math.sin(ringF * t) * 0.7 + (t < sp * 0.06 ? 1.2 : -0.25)) + A * (r() - 0.5) * E.rough * env * (onLoad ? 1.6 : 1);
          const idx = (Math.floor(t0) + i + len) % len;
          d[idx] += v;
        }
      }
    }
    // niente componente continua, poi normalizzazione
    let mean = 0; for (let i = 0; i < len; i++) mean += d[i]; mean /= len;
    let pk = 0; for (let i = 0; i < len; i++) { d[i] -= mean; pk = Math.max(pk, Math.abs(d[i])); }
    for (let i = 0; i < len; i++) d[i] *= 0.9 / pk;
    return b;
  }

  // pubblico: tante voci (rumore filtrato a "vocali" diverse) che salgono e scendono
  makeCrowd() {
    const sr = this.sr, len = sr * 6, b = this.ctx.createBuffer(2, len, sr);
    const r = rand(5);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let v = 0; v < 40; v++) {
        const f = 250 + r() * 900, q = 0.06 + r() * 0.05, start = Math.floor(r() * len), dur = Math.floor(sr * (0.4 + r() * 1.6));
        // risonatore a due poli eccitato da rumore = una voce indistinta
        const w = 2 * Math.PI * f / sr, rr = 1 - q * w, c1 = 2 * rr * Math.cos(w), c2 = -rr * rr;
        let y1 = 0, y2 = 0;
        const amp = 0.02 + r() * 0.03;
        for (let i = 0; i < dur; i++) {
          const env = Math.sin(Math.PI * i / dur) ** 2;
          const y = (Math.random() * 2 - 1) * amp * env + c1 * y1 + c2 * y2;
          y2 = y1; y1 = y;
          d[(start + i) % len] += y * 0.06;
        }
      }
      // brusio di fondo
      const p = this.pinkBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] += p[(i * 3 + ch * 999) % p.length] * 0.25;
    }
    return b;
  }

  // ghiaia: granelli (clic brevi) a caso
  makeGravel() {
    const sr = this.sr, len = Math.floor(sr * 1.5), b = this.ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    const r = rand(77);
    for (let g = 0; g < 900; g++) {
      const s = Math.floor(r() * len), L = Math.floor(sr * (0.002 + r() * 0.006)), a = 0.2 + r() * 0.8, f = 2 * Math.PI * (900 + r() * 3500) / sr;
      for (let i = 0; i < L; i++) d[(s + i) % len] += a * Math.exp(-i / (L * 0.3)) * Math.sin(f * i);
    }
    let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
    for (let i = 0; i < len; i++) d[i] /= pk;
    return b;
  }

  // cordolo: un colpo sordo ogni striscia (riferimento: 10 strisce al secondo)
  makeKerb() {
    const sr = this.sr, len = Math.floor(sr * 0.4), b = this.ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    for (let k = 0; k < 4; k++) {
      const s = Math.floor(k * len / 4);
      for (let i = 0; i < len / 4; i++) {
        const t = i / sr;
        d[s + i] = Math.exp(-t * 55) * (Math.sin(2 * Math.PI * 70 * t) * 0.8 + Math.sin(2 * Math.PI * 190 * t) * 0.3) * (k % 2 ? 0.8 : 1);
      }
    }
    return b;
  }

  loop(buf, rate = 1) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * buf.duration); return s; }
  filt(type, f, q = 0.7, gain = 0) { const n = this.ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = gain; return n; }
  gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }

  // ------------------------------------------------------------------ motore del giocatore
  buildEngine() {
    const ctx = this.ctx, E = ENGINE;
    this.eOn = this.loop(this.engOn); this.eOff = this.loop(this.engOff);
    this.gOn = this.gain(0); this.gOff = this.gain(0);
    const sum = this.gain(1);
    this.eOn.connect(this.gOn); this.gOn.connect(sum); this.eOff.connect(this.gOff); this.gOff.connect(sum);
    // saturazione morbida (più "grossa" in tiro)
    const sh = ctx.createWaveShaper(), curve = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) { const x = i / 1024 - 1; curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
    sh.curve = curve; sh.oversample = '2x';
    this.eLP = this.filt('lowpass', 2000, 0.9);
    const hp = this.filt('highpass', 45, 0.7);
    const peaks = E.peaks.map(([f, g, q]) => this.filt('peaking', f, q, g));
    // interruzione dell'accensione (cambiata, limitatore)
    this.eCut = this.gain(1);
    this.eVol = this.gain(0);
    this.chain(sum, sh, hp, ...peaks, this.eLP, this.eCut, this.eVol, this.bus.eng);
    // aspirazione: soffio filtrato che segue i giri (si sente di più dall'abitacolo)
    this.intake = this.loop(this.noiseBuf);
    this.inBP = this.filt('bandpass', 1200, 2.5);
    this.inG = this.gain(0);
    this.chain(this.intake, this.inBP, this.inG, this.eCut);
    // limitatore: il gas viene tagliato a scatti
    this.limLFO = ctx.createOscillator(); this.limLFO.type = 'square'; this.limLFO.frequency.value = 24;
    this.limDepth = this.gain(0);
    this.limLFO.connect(this.limDepth); this.limDepth.connect(this.eCut.gain); this.limLFO.start();
    // turbo (F1): fischio che sale con la pressione
    if (E.turbo) {
      this.tOsc = ctx.createOscillator(); this.tOsc.type = 'sine';
      this.tOsc2 = ctx.createOscillator(); this.tOsc2.type = 'sine';
      this.tG = this.gain(0);
      const tn = this.loop(this.noiseBuf), tbp = this.filt('bandpass', 6000, 8), tng = this.gain(0.25);
      this.chain(tn, tbp, tng, this.tG);
      this.tBP = tbp;
      this.tOsc.connect(this.tG); this.tOsc2.connect(this.tG); this.tG.connect(this.bus.eng);
      this.tOsc.start(); this.tOsc2.start();
    }
    // trasmissione: ronzio degli ingranaggi a velocità alta
    this.gearW = ctx.createOscillator(); this.gearW.type = 'triangle';
    this.gearG = this.gain(0);
    this.chain(this.gearW, this.filt('bandpass', 1500, 1), this.gearG, this.bus.eng);
    this.gearW.start();
    this.boost = 0;
  }

  // ------------------------------------------------------------------ gomme
  buildTyres() {
    // stridio: due risonanze che oscillano un po' (non è mai un fischio pulito)
    const n = this.loop(this.noiseBuf);
    this.sqA = this.filt('bandpass', 900, 14); this.sqB = this.filt('bandpass', 1420, 16);
    this.sqG = this.gain(0);
    n.connect(this.sqA); n.connect(this.sqB);
    const a = this.gain(1), b2 = this.gain(0.7);
    this.sqA.connect(a); this.sqB.connect(b2); a.connect(this.sqG); b2.connect(this.sqG);
    this.sqG.connect(this.bus.sfx);
    // bloccaggio: più basso e ruvido
    const n2 = this.loop(this.noiseBuf);
    this.lockF = this.filt('bandpass', 520, 5);
    this.lockG = this.gain(0);
    this.chain(n2, this.lockF, this.lockG, this.bus.sfx);
    // rotolamento sull'asfalto
    const n3 = this.loop(this.pinkBuf);
    this.rollF = this.filt('lowpass', 300, 0.7);
    this.rollG = this.gain(0);
    this.chain(n3, this.rollF, this.rollG, this.bus.sfx);
  }

  buildSurfaces() {
    this.kerbS = this.loop(this.kerbBuf); this.kerbG = this.gain(0);
    this.chain(this.kerbS, this.filt('lowpass', 900), this.kerbG, this.bus.sfx);
    this.gravS = this.loop(this.gravelBuf); this.gravG = this.gain(0);
    this.chain(this.gravS, this.filt('highpass', 500), this.gravG, this.bus.sfx);
    const gn = this.loop(this.pinkBuf); this.grassF = this.filt('lowpass', 700); this.grassG = this.gain(0);
    this.chain(gn, this.grassF, this.grassG, this.bus.sfx);
  }

  buildWind() {
    const n = this.loop(this.pinkBuf);
    this.windF = this.filt('bandpass', 500, 0.5); this.windLP = this.filt('lowpass', 2500);
    this.windG = this.gain(0);
    this.chain(n, this.windF, this.windLP, this.windG, this.bus.amb);
  }

  buildCrowd() {
    this.crowd = this.loop(this.crowdBuf);
    this.crowdF = this.filt('lowpass', 1800, 0.6);
    this.crowdG = this.gain(0);
    this.chain(this.crowd, this.crowdF, this.crowdG, this.bus.amb);
    this.cheer = 0; this.crowdLevel = 0;
  }

  buildScrape() {
    const n = this.loop(this.noiseBuf);
    this.scrF = this.filt('bandpass', 2600, 3);
    this.scrAM = this.gain(1);
    this.scrG = this.gain(0);
    this.chain(n, this.scrF, this.scrAM, this.scrG, this.bus.sfx);
    const lfo = this.ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 37;
    const d = this.gain(0.6); lfo.connect(d); d.connect(this.scrAM.gain); lfo.start();
    this.scrape = 0;
  }

  // avversario: stesso motore, con distanza, doppler e lato
  makeVoice() {
    const s = this.loop(this.engOn);
    const f = this.filt('lowpass', 2000, 0.8);
    const pk = this.filt('peaking', ENGINE.peaks[0][0], 1, 4);
    const g = this.gain(0);
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    this.chain(s, pk, f, g);
    if (pan) { g.connect(pan); pan.connect(this.bus.eng); } else g.connect(this.bus.eng);
    return { s, f, g, pan, id: null };
  }

  // ------------------------------------------------------------------ impostazioni
  setMuted(m) { this.muted = m; this.applyLevel(); }
  setLevel(l) { this.level = l; this.applyLevel(); }
  applyLevel() { if (this.out) this.out.gain.setTargetAtTime(this.muted ? 0 : 0.72 * this.level, this.ctx.currentTime, 0.05); }
  setView(inCar) { this.view = inCar ? 'in' : 'out'; }

  // ------------------------------------------------------------------ aggiornamento (ogni fotogramma)
  update(car, running, dt = 1 / 60) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, E = ENGINE, P = this.prev, inCar = this.view === 'in';
    const rpm = clamp(car.rpm * E.rpmMul, 1500, 13500);
    const thr = clamp(car.throttleOut || 0, 0, 1);
    const rate = rpm / REF_RPM;
    const rn = clamp((car.rpm - 4000) / 8500, 0, 1);
    this.eOn.playbackRate.setTargetAtTime(rate, t, 0.012);
    this.eOff.playbackRate.setTargetAtTime(rate * 0.998, t, 0.012);
    // in tiro / in rilascio
    const load = running ? thr : thr * 0.5;
    this.gOn.gain.setTargetAtTime(0.15 + 0.85 * Math.pow(load, 0.7), t, 0.03);
    this.gOff.gain.setTargetAtTime(0.75 * (1 - load * 0.85), t, 0.03);
    const vol = E.vol * (0.32 + 0.48 * load + 0.2 * rn) * (inCar ? 0.85 : 1);
    this.eVol.gain.setTargetAtTime(running || thr > 0 ? vol : vol * 0.7, t, 0.04);
    const lp = (E.lp[0] + E.lp[1] * load + E.lp[2] * car.rpm) * (inCar ? 0.6 : 1);
    this.eLP.frequency.setTargetAtTime(clamp(lp, 300, 16000), t, 0.03);
    this.inBP.frequency.setTargetAtTime(400 + rpm * 0.18, t, 0.03);
    this.inG.gain.setTargetAtTime(load * (inCar ? 0.06 : 0.025) * (0.4 + rn), t, 0.04);
    // limitatore
    this.limDepth.gain.setTargetAtTime(car.limiter ? 0.45 : 0, t, 0.01);
    // cambiata: un attimo di accensione tagliata, poi la "botta" della marcia nuova
    if (car.gear !== P.gear) {
      const up = car.gear > P.gear && P.gear > 0;
      const cut = up ? E.cut : E.cut * 0.6;
      this.eCut.gain.cancelScheduledValues(t);
      this.eCut.gain.setValueAtTime(this.eCut.gain.value, t);
      this.eCut.gain.linearRampToValueAtTime(up ? 0.25 : 0.6, t + 0.008);
      this.eCut.gain.setValueAtTime(up ? 0.25 : 0.6, t + cut);
      this.eCut.gain.linearRampToValueAtTime(1, t + cut + 0.03);
      if (up && thr > 0.5) this.bark(IS_F1 ? 0.35 : 0.55);
      if (!IS_F1) this.clunk(up ? 0.25 : 0.18);
      if (!up && car.gear > 0) this.pops(IS_F1 ? 1 : 3, 0.5);
      P.gear = car.gear;
    }
    // scoppiettii in rilascio dagli alti giri (soprattutto la GT)
    if (P.thr > 0.6 && thr < 0.15 && car.rpm > 7000 && running) P.popsUntil = t + 0.4 + 0.5 * E.pops;
    if (t < P.popsUntil && thr < 0.2 && t - P.lastPop > 0.05 + Math.random() * 0.12) { P.lastPop = t; if (Math.random() < 0.35 + 0.4 * E.pops) this.pops(1, 0.35 + Math.random() * 0.4); }
    // turbo F1
    if (E.turbo) {
      this.boost += ((thr * rn) - this.boost) * Math.min(1, dt * (thr > 0.3 ? 2.2 : 6));
      this.tOsc.frequency.setTargetAtTime(3200 + this.boost * 6500, t, 0.05);
      this.tOsc2.frequency.setTargetAtTime(4900 + this.boost * 7400, t, 0.05);
      this.tBP.frequency.setTargetAtTime(5000 + this.boost * 5000, t, 0.05);
      this.tG.gain.setTargetAtTime(this.boost * this.boost * (inCar ? 0.018 : 0.01), t, 0.06);
    }
    const v = car.speed;
    this.gearW.frequency.setTargetAtTime(200 + v * 22, t, 0.05);
    this.gearG.gain.setTargetAtTime(inCar ? Math.min(0.02, v * 0.0002) * (0.4 + thr) : 0, t, 0.08);
    P.thr = thr; P.rpm = car.rpm;

    // gomme e superfici
    let slide = 0, lock = 0, kerb = 0, gravel = 0, grass = 0, n = 0;
    for (const w of car.wheels) {
      if (!(w.fz > 0)) continue;
      n++;
      slide = Math.max(slide, w.slide || 0);
      if (w.lock) lock = Math.max(lock, 1);
      if (w.onKerb) kerb += 0.25;
      const ty = w.sf && w.sf.type;
      if (ty === 4) gravel += 0.25; else if (ty === 3) grass += 0.25;
    }
    const sv = clamp(v / 18, 0, 1);
    const sq = clamp((slide - 0.12) * 1.6, 0, 1) * sv * (1 - grass - gravel);
    this.sqA.frequency.setTargetAtTime(860 + slide * 220 + Math.sin(t * 13) * 40 + Math.random() * 30, t, 0.04);
    this.sqB.frequency.setTargetAtTime(1380 + slide * 260 + Math.sin(t * 7.3) * 60, t, 0.04);
    this.sqG.gain.setTargetAtTime(sq * 0.5, t, 0.035);
    this.lockF.frequency.setTargetAtTime(380 + v * 6, t, 0.05);
    this.lockG.gain.setTargetAtTime(lock * sv * 0.35, t, 0.03);
    this.rollF.frequency.setTargetAtTime(160 + v * 7, t, 0.1);
    this.rollG.gain.setTargetAtTime(n ? Math.min(0.22, v * 0.004) * (1 - grass - gravel) : 0, t, 0.1);
    this.kerbS.playbackRate.setTargetAtTime(clamp(v / 12, 0.1, 6), t, 0.03);
    this.kerbG.gain.setTargetAtTime(kerb * 0.9 * Math.min(1, v / 8), t, 0.02);
    this.gravS.playbackRate.setTargetAtTime(clamp(0.5 + v / 25, 0.5, 2.5), t, 0.05);
    this.gravG.gain.setTargetAtTime(gravel * 0.75 * Math.min(1, v / 6), t, 0.05);
    this.grassF.frequency.setTargetAtTime(300 + v * 20, t, 0.1);
    this.grassG.gain.setTargetAtTime(grass * 0.5 * Math.min(1, v / 8), t, 0.06);
    // vento (abitacolo aperto della F1: si sente di più)
    const wind = Math.min(0.42, v * v * (IS_F1 ? 0.000045 : 0.00003) * (inCar ? 1.5 : 1));
    this.windG.gain.setTargetAtTime(wind, t, 0.15);
    this.windF.frequency.setTargetAtTime(300 + v * 9, t, 0.15);
    // strisciata contro il muro: decade in fretta se non ci sono nuovi contatti
    this.scrape *= Math.exp(-dt * 9);
    this.scrG.gain.setTargetAtTime(Math.min(0.6, this.scrape), t, 0.03);
    this.scrF.frequency.setTargetAtTime(1800 + v * 40, t, 0.05);
    // pubblico
    this.cheer *= Math.exp(-dt * 0.45);
    const crowd = Math.min(1, this.crowdLevel + this.cheer);
    this.crowdG.gain.setTargetAtTime(0.03 + crowd * 0.5, t, 0.3);
    this.crowdF.frequency.setTargetAtTime(1200 + crowd * 2200, t, 0.3);
    // limitatore della corsia box: bip regolari
    if (car.inPit && running && t - P.pitBeep > 0.55) { P.pitBeep = t; this.beep(1760, 0.07, 0.05); }
  }

  // ------------------------------------------------------------------ avversari
  // cars: [{ id, x, z, vx, vz, rpm, thr }], listener: { x, z, fx, fz, vx, vz }
  others(cars, L) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, E = ENGINE;
    const near = cars.map(c => ({ c, d: Math.hypot(c.x - L.x, c.z - L.z) })).filter(o => o.d < 160).sort((a, b) => a.d - b.d).slice(0, this.voices.length);
    // le voci tengono la stessa vettura finché resta tra le più vicine
    const free = this.voices.filter(v => !near.some(o => o.c.id === v.id));
    for (const o of near) { if (!this.voices.some(v => v.id === o.c.id)) { const v = free.shift(); if (v) v.id = o.c.id; } }
    for (const v of this.voices) {
      const o = near.find(q => q.c.id === v.id);
      if (!o) { v.g.gain.setTargetAtTime(0, t, 0.08); v.id = null; continue; }
      const c = o.c, d = Math.max(1, o.d);
      // doppler: velocità relativa lungo la congiungente
      const ux = (c.x - L.x) / d, uz = (c.z - L.z) / d;
      const vr = (c.vx - L.vx) * ux + (c.vz - L.vz) * uz;          // >0 si allontana
      const dop = clamp(343 / (343 + vr), 0.75, 1.3);
      v.s.playbackRate.setTargetAtTime(clamp(c.rpm * E.rpmMul, 1500, 13500) / REF_RPM * dop, t, 0.03);
      const k = 1 / (1 + (d / 14) ** 2);
      v.g.gain.setTargetAtTime(k * (0.35 + 0.65 * c.thr) * 0.9, t, 0.05);
      v.f.frequency.setTargetAtTime(700 + 9000 * Math.exp(-d / 45), t, 0.05);
      if (v.pan) {
        const side = ux * -L.fz + uz * L.fx;                         // >0 a destra
        v.pan.pan.setTargetAtTime(clamp(side * 0.8, -0.85, 0.85), t, 0.05);
      }
    }
  }
  // compatibilità con la vecchia interfaccia
  bots() {}

  // ------------------------------------------------------------------ effetti brevi
  burst(dur, type, f, q, vol, at = 0, bus = this.bus.sfx, decay = 0.25) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = this.filt(type, f, q), g = this.gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.004, dur * decay);
    this.chain(s, fl, g, bus);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.1);
  }
  thump(f0, f1, dur, vol, at = 0, bus = this.bus.sfx) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.gain(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  bark(v) { if (!this.ctx) return; this.burst(0.07, 'bandpass', IS_F1 ? 2200 : 900, 1.2, v * 0.5, 0, this.bus.eng); this.thump(IS_F1 ? 180 : 110, 60, 0.08, v * 0.5, 0, this.bus.eng); }
  clunk(v) { if (!this.ctx) return; this.thump(140, 70, 0.06, v * 0.35); this.burst(0.03, 'bandpass', 3000, 3, v * 0.15); }
  pops(n, v) {
    if (!this.ctx) return;
    for (let i = 0; i < n; i++) {
      const at = i * (0.04 + Math.random() * 0.07);
      this.burst(0.06, 'lowpass', 900 + Math.random() * 1600, 0.8, v * (0.6 + Math.random() * 0.5), at, this.bus.eng, 0.2);
      this.thump(90 + Math.random() * 60, 45, 0.07, v * 0.6, at, this.bus.eng);
    }
  }

  // urto: botta sorda, carbonio che si rompe, pezzi che rimbalzano (più strati se è forte)
  crash(strength, kind = 'wall') {
    if (!this.ctx) return;
    const s = clamp(strength, 0, 1.5);
    if (s < 0.04) return;
    const car = kind === 'car';
    this.thump(car ? 160 : 110, 38, 0.2 + s * 0.3, Math.min(1, 0.4 + s * 0.7));
    this.burst(0.25 + s * 0.4, 'lowpass', 900 + s * 3000, 0.7, Math.min(0.9, 0.25 + s * 0.6));
    const shards = Math.round(2 + s * (car ? 6 : 12));
    for (let i = 0; i < shards; i++) this.burst(0.04 + Math.random() * 0.05, 'bandpass', 2000 + Math.random() * 5000, 6 + Math.random() * 8, (0.15 + Math.random() * 0.25) * s, Math.random() * (0.05 + s * 0.2));
    if (s > 0.45) for (let i = 0; i < 6; i++) this.burst(0.05, 'bandpass', 1200 + Math.random() * 2500, 5, 0.12 * s * (1 - i / 7), 0.15 + i * (0.07 + Math.random() * 0.08));
  }
  scrapeWall(v) { this.scrape = Math.max(this.scrape, clamp(v / 18, 0, 0.6)); }

  // pit stop: cric su, pistole sulle quattro ruote, (riparazione), pistole, cric giù
  pitService(total) {
    if (!this.ctx) return;
    const gun = at => {
      for (let k = 0; k < 2; k++) {
        const t0 = at + k * 0.11;
        this.burst(0.13, 'bandpass', 1700, 4, 0.18, t0, this.bus.sfx, 0.6);
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        const t = this.ctx.currentTime + t0;
        o.frequency.setValueAtTime(260, t); o.frequency.linearRampToValueAtTime(420, t + 0.12);
        const g = this.gain(0); g.gain.setValueAtTime(0.07, t); g.gain.setTargetAtTime(0, t + 0.1, 0.02);
        this.chain(o, this.filt('bandpass', 900, 2), g, this.bus.sfx); o.start(t); o.stop(t + 0.2);
      }
    };
    this.thump(120, 55, 0.12, 0.5, 0.05);
    [0.25, 0.32, 0.4, 0.47].forEach(a => gun(a));
    const end = Math.max(1.4, total);
    [end - 0.75, end - 0.68, end - 0.6, end - 0.52].forEach(a => gun(a));
    this.thump(100, 45, 0.15, 0.6, end - 0.08);
  }

  // pubblico: vicinanza alle tribune (0-1) ed esultanza
  setCrowd(level) { this.crowdLevel = clamp(level, 0, 1); }
  cheerUp(v = 0.6) { this.cheer = Math.min(1, this.cheer + v); }

  // bip (semaforo, record, limitatore)
  beep(freq = 880, dur = 0.18, vol = 0.25) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
    const g = this.gain(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.25);
    const g2 = this.gain(0.15);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.bus.sfx);
    o.start(t); o2.start(t); o.stop(t + dur + 0.2); o2.stop(t + dur + 0.2);
  }
  ui() { if (!this.ctx) return; this.burst(0.02, 'bandpass', 3200, 4, 0.06); this.thump(600, 300, 0.04, 0.05); }

  // ------------------------------------------------------------------ radio del box
  // fruscio di apertura, voce (sintesi vocale del dispositivo, in italiano), fruscio di chiusura
  radio(text) {
    if (!this.ctx || !this.radioOn || this.muted) return;
    const now = performance.now();
    if (this.radioBusy && now < this.radioBusy) { this.radioQueue = text; return; }
    const squelch = at => { this.burst(0.12, 'bandpass', 2500, 1.5, 0.12, at, this.bus.radio, 0.4); this.beep(1500, 0.05, 0.05); };
    squelch(0);
    const synth = window.speechSynthesis;
    let dur = 0.4 + text.length * 0.065;
    if (synth && typeof SpeechSynthesisUtterance !== 'undefined') {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'it-IT'; u.rate = 1.12; u.pitch = 0.9; u.volume = Math.min(1, 0.9 * this.level);
        const it = synth.getVoices().find(v => /^it/i.test(v.lang));
        if (it) u.voice = it;
        u.onend = () => { squelch(0); this.radioBusy = 0; if (this.radioQueue) { const q = this.radioQueue; this.radioQueue = null; this.radio(q); } };
        setTimeout(() => synth.speak(u), 180);
      } catch (e) { setTimeout(() => squelch(0), dur * 1000); }
    } else setTimeout(() => squelch(0), dur * 1000);
    this.radioBusy = now + dur * 1000 + 600;
  }
}
