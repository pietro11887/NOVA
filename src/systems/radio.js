import { clamp } from '../core/utils.js';

/**
 * Radio dell'auto: tre stazioni sintetizzate al volo (nessun file audio).
 * Ogni stazione ha una scala, un giro di accordi e una batteria propri,
 * generati con WebAudio mentre guidi.
 */
const STATIONS = [
  {
    name: 'NOVA FM · Synthwave', color: '#7dd3ff', bpm: 108,
    scale: [0, 3, 5, 7, 10], root: 55, wave: 'sawtooth',
    chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]], drums: 'four',
  },
  {
    name: 'Costa Latina', color: '#ffc46b', bpm: 96,
    scale: [0, 2, 4, 7, 9], root: 65, wave: 'triangle',
    chords: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-3, 0, 4]], drums: 'clave',
  },
  {
    name: 'Bassline 105', color: '#ff7d9c', bpm: 124,
    scale: [0, 3, 5, 6, 10], root: 49, wave: 'square',
    chords: [[0, 3, 10], [0, 3, 10], [-2, 1, 8], [-4, -1, 6]], drums: 'break',
  },
];

export class Radio {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.on = false;
    this.step = 0;
    this.next = 0;
  }

  get station() { return STATIONS[this.index]; }
  get stations() { return STATIONS; }

  setOn(on) {
    if (this.on === on) return;
    this.on = on;
    if (!on) this.game.hud.radio(null);
    else this.game.hud.radio(this.station);
  }

  change(dir = 1) {
    this.index = (this.index + dir + STATIONS.length) % STATIONS.length;
    this.step = 0;
    this.next = 0;
    this.game.audio.ui();
    if (this.on) this.game.hud.radio(this.station);
    return this.station;
  }

  update(dt) {
    if (!this.on) return;
    const a = this.game.audio;
    if (!a.ctx) return;
    const st = this.station;
    const beat = 60 / st.bpm / 2;      // ottavi
    this.next -= dt;
    if (this.next > 0) return;
    this.next += beat;
    const s = this.step++;
    const bar = (s >> 3) % st.chords.length;
    const chord = st.chords[bar];
    const vol = 0.16;

    // basso sul primo e sul quinto ottavo
    if (s % 4 === 0) a.tone(midi(st.root + chord[0]), beat * 1.6, st.wave, vol * 1.1, 900);
    // accordo tenuto a inizio battuta
    if (s % 8 === 0) for (const n of chord) a.tone(midi(st.root + 12 + n), beat * 5, 'triangle', vol * 0.42, 1800);
    // melodia
    if (s % 2 === 0 || Math.random() < 0.35) {
      const deg = st.scale[(Math.random() * st.scale.length) | 0];
      const oct = Math.random() < 0.35 ? 24 : 12;
      a.tone(midi(st.root + oct + chord[0] + deg), beat * 0.9, st.wave, vol * 0.5, 2600);
    }
    // batteria
    if (st.drums === 'four' && s % 4 === 0) a.noise(0.09, 140, 0.28, 'lowpass');
    if (st.drums === 'break' && (s % 8 === 0 || s % 8 === 6)) a.noise(0.08, 120, 0.3, 'lowpass');
    if (st.drums === 'clave' && (s % 8 === 0 || s % 8 === 3)) a.noise(0.06, 190, 0.22, 'lowpass');
    if (s % 4 === 2) a.noise(0.05, 3600, 0.1, 'highpass');
    if (s % 2 === 1) a.noise(0.02, 7000, 0.05, 'highpass');
  }
}

function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
