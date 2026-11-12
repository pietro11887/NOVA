// Categoria di vettura scelta dal giocatore: GT3 oppure Formula 1.
// Si legge una volta all'avvio dalle impostazioni salvate (cambiarla ricarica la pagina),
// così fisica, modelli, linea ideale e bot usano tutti le stesse misure.

import { PUBLIC } from './edition.js?v=f01fe25a';
let cls = 'gt';
try {
  const s = JSON.parse(localStorage.getItem('novaf1.settings') || '{}');
  if (s && ['f1', 'r26', 'mp45', 'f2002', 'f2004', 'rb8', 'w11'].includes(s.carClass)) cls = s.carClass;
  // edizione pubblica: niente F1 storiche (sono vetture vere riconoscibili)
  if (PUBLIC && cls !== 'f1' && cls !== 'gt') cls = 'f1';
} catch (e) { /* storage non disponibile: GT */ }

export const CAR_CLASS = cls;
// la Renault R26 (macchine speciali) è una monoposto: per telecamere, box e griglia vale come F1
// macchine speciali d'epoca: Renault R26 (2006) e McLaren MP4/5 (1989). IS_R26 vale per tutte e due
// (niente batteria né Overtake, motore aspirato che urla); IS_MP45 per quello che è solo della McLaren
export const IS_MP45 = cls === 'mp45';
// Macchine speciali: motore, cambio, suono, casco, telecamera, ali staccabili e livrea di ognuna.
// gears = rapporti totali (si scelgono per avere le stesse velocità per marcia della R26 con i loro giri);
// snd.mul porta i giri del motore sui campioni del V12: frequenza di scoppio = giri × cilindri / 120.
// wings: [x minimo dell'ala anteriore, y massimo; x massimo dell'alettone, y minimo] (coordinate del gioco)
// k < 1 allunga le marce alte (la prima resta uguale): serve a dare a ogni vettura la sua velocità massima vera
// (a Monza, al limitatore in ultima marcia), con le marce intermedie che si allungano via via
const G = (n, rpm, k = 1) => (n === 6 ? [24.6, 19.0, 15.3, 12.6, 10.4, 8.25] : [24.6, 19.6, 16.2, 13.5, 11.4, 9.7, 8.25]).map((g, i, A) => g * 1.03 * Math.pow(k, i / (A.length - 1)) * rpm / 19000);
export const CLASSICS = {
  r26: { year: 2006, name: 'Renault R26', engine: 'V8 2,4 L · 19.000 giri', rpm: 19000, idle: 5500, gears: G(7, 19000, 0.803),
    snd: { bank: 'eng-v8', mul: 0.526, max: 10000 }, helmet: { x: 0.02, y: 0.33 }, cam: [-0.06, 0.4, -0.32, 0.6], livery: /^WC(CARBODY|EXTRA0|EXTRA1|WING)$/ },
  mp45: { year: 1989, name: 'McLaren MP4/5', engine: 'V10 Honda 3,5 L · 13.500 giri', rpm: 13500, idle: 4200, gears: G(6, 13500, 0.838),
    snd: { bank: 'eng-v10', mul: 0.526, max: 10000 }, helmet: { x: 0.06, y: 0.44 }, cam: [-0.02, 0.52, -0.28, 0.72], livery: /^body_mat$/ },
  f2002: { year: 2002, name: 'Ferrari F2002', engine: 'V10 3,0 L · 18.300 giri', rpm: 18300, idle: 5200, gears: G(7, 18300, 0.770),
    snd: { bank: 'eng-v10', mul: 0.526, max: 10000 }, helmet: { x: 0.0, y: 0.34 }, cam: [-0.08, 0.42, -0.34, 0.62], livery: /^car_chassis/,
    wings: [1.95, -0.12, -1.6, 0.36] },
  f2004: { year: 2004, name: 'Ferrari F2004', engine: 'V10 3,0 L · 19.000 giri', rpm: 19000, idle: 5500, gears: G(7, 19000, 0.680),
    snd: { bank: 'eng-v10', mul: 0.526, max: 10000 }, helmet: { x: 0.0, y: 0.34 }, cam: [-0.08, 0.42, -0.34, 0.62], livery: /^Meshpart16Mtl/,
    wings: [1.95, -0.12, -1.6, 0.36] },
  rb8: { year: 2012, name: 'Red Bull RB8', engine: 'V8 Renault 2,4 L · 18.000 giri + KERS', rpm: 18000, idle: 5000, gears: G(7, 18000, 0.813),
    snd: { bank: 'eng-v8', mul: 0.526, max: 10000 }, helmet: { x: 0.12, y: 0.32 }, cam: [0.04, 0.4, -0.22, 0.6], livery: /^wccarbody/,
    wings: [2.2, -0.12, -1.95, 0.38] },
  // V6 turbo ibrido: suona basso e pieno (frequenza di scoppio di un V6 a 12.500 giri = V12 a 6.250)
  w11: { year: 2020, name: 'Mercedes W11', engine: 'V6 turbo ibrido 1,6 L · ~1000 CV', rpm: 12500, idle: 4500, gears: G(7, 12500, 0.801),
    snd: { mul: 0.55, max: 8000 }, helmet: { x: 0.3, y: 0.38 }, cam: [0.22, 0.5, -0.05, 0.84], livery: /ext_44/,
    wings: [2.42, -0.12, -2.15, 0.4] },
};
export const CLASSIC = CLASSICS[cls] || null;
// IS_R26: "macchina d'epoca" (vale per tutte le speciali: niente batteria 2026 né Overtake)
export const IS_R26 = !!CLASSIC;
export const IS_F1 = cls === 'f1' || IS_R26;

const SPECS = {
  // GT3: pesante, poco carico aerodinamico, staccate lunghe e scia che conta
  gt: {
    label: 'GT3',
    geom: { axleF: 1.37, axleR: -1.25, halfTrack: 0.83, wheelR: 0.355, cgHeight: 0.4 },
    car: { mass: 1240, ClA: 1.9, CdA: 1.15, mu: 1.55, torque: 375, brake: 31000 },
    inertia: { Iz: 1780, Ipitch: 1450, Iroll: 460 },
    susp: { springK: 231000, damperC: 11000, arbK: [185000, 92000] },
    steer: 0.73,
    heat: { slide: 42000, roll: 0.075 },
    hull: [
      [2.3, -0.92, 'fwL'], [2.3, 0.92, 'fwR'], [2.45, 0, 'nose'],
      [1.3, -1.02, 'wFL'], [1.3, 1.02, 'wFR'],
      [0.0, -1.0, 'sideL'], [0.0, 1.0, 'sideR'],
      [-1.22, -1.02, 'wRL'], [-1.22, 1.02, 'wRR'],
      [-2.3, -0.85, 'rw'], [-2.3, 0.85, 'rw'],
    ],
    circles: [[1.42, 1.0], [0.0, 1.02], [-1.32, 1.0]],
    ai: { hazard: [10.5, 3, 0.0009], follow: 18, pit: 13 },
    dirtyAir: 0.06,
  },
  // Formula 1: leggera, ~1000 CV, tanto carico aerodinamico, frenate brevissime
  f1: {
    label: 'FORMULA 1',
    geom: { axleF: 1.9, axleR: -1.7, halfTrack: 0.8, wheelR: 0.33, cgHeight: 0.3 },
    car: { mass: 798, ClA: 4.6, CdA: 1.22, mu: 1.8, torque: 650, brake: 41000 },
    inertia: { Iz: 1150, Ipitch: 950, Iroll: 300 },
    susp: { springK: 150000, damperC: 7200, arbK: [120000, 60000] },
    steer: 1,
    heat: { slide: 70000, roll: 0.055 },
    hull: [
      [2.9, -0.95, 'fwL'], [2.9, 0.95, 'fwR'], [2.9, 0, 'nose'],
      [1.8, -1.03, 'wFL'], [1.8, 1.03, 'wFR'],
      [0.2, -0.85, 'sideL'], [0.2, 0.85, 'sideR'],
      [-1.67, -1.05, 'wRL'], [-1.67, 1.05, 'wRR'],
      [-2.5, -0.52, 'rw'], [-2.5, 0.52, 'rw'],
    ],
    circles: [[1.95, 0.95], [0.1, 1.0], [-1.85, 0.95]],
    ai: { hazard: [15, 5, 0.0015], follow: 30, pit: 22 },
    dirtyAir: 0.12,
  },
};

// Renault R26 2006 (macchine speciali): V8 2,4 L da 19.000 giri, ~750 CV, 605 kg, niente ibrido.
// Più spinta delle F1 2026 (scarica la batteria) ma gomme scanalate, meno carico e meno
// aderenza meccanica: staccate più lunghe e retrotreno più nervoso in uscita di curva.
SPECS.r26 = {
  ...SPECS.f1,
  label: 'RENAULT R26 · 2006',
  // misure del modello R26: passo 3,1 m, carreggiata 1,44 m, ruote da 0,335 m
  geom: { axleF: 1.55, axleR: -1.545, halfTrack: 0.72, wheelR: 0.335, cgHeight: 0.3 },
  hull: [
    [2.45, -0.7, 'fwL'], [2.45, 0.7, 'fwR'], [2.5, 0, 'nose'],
    [1.55, -0.92, 'wFL'], [1.55, 0.92, 'wFR'],
    [0.0, -0.75, 'sideL'], [0.0, 0.75, 'sideR'],
    [-1.545, -0.92, 'wRL'], [-1.545, 0.92, 'wRR'],
    [-2.13, -0.45, 'rw'], [-2.13, 0.45, 'rw'],
  ],
  circles: [[1.6, 0.92], [0.0, 0.92], [-1.6, 0.92]],
  car: { mass: 605, ClA: 3.5, CdA: 1.12, mu: 1.6, torque: 440, brake: 30500 },
  inertia: { Iz: 900, Ipitch: 760, Iroll: 240 },
  susp: { springK: 120000, damperC: 6000, arbK: [100000, 48000] },
  heat: { slide: 60000, roll: 0.06 },
  dirtyAir: 0.09,
};

// McLaren MP4/5 (1989): V10 Honda 3,5 L aspirato, ~685 CV a 13.500 giri, ~540 kg con il pilota,
// cambio manuale a 6 marce; poco carico aerodinamico, gomme slick larghe, freni in carbonio.
SPECS.mp45 = {
  ...SPECS.r26,
  label: 'McLAREN MP4/5 · 1989',
  // misure del modello: passo 2,9 m, carreggiata 1,73 m davanti e 1,70 dietro, ruote da 0,32-0,345 m
  geom: { axleF: 1.448, axleR: -1.448, halfTrack: 0.86, wheelR: 0.335, cgHeight: 0.28 },
  hull: [
    [2.4, -0.62, 'fwL'], [2.4, 0.62, 'fwR'], [2.42, 0, 'nose'],
    [1.448, -1.04, 'wFL'], [1.448, 1.04, 'wFR'],
    [-0.1, -0.74, 'sideL'], [-0.1, 0.74, 'sideR'],
    [-1.448, -1.08, 'wRL'], [-1.448, 1.08, 'wRR'],
    [-2.0, -0.45, 'rw'], [-2.0, 0.45, 'rw'],
  ],
  circles: [[1.5, 0.95], [0.0, 0.9], [-1.5, 0.98]],
  car: { mass: 545, ClA: 2.7, CdA: 1.02, mu: 1.56, torque: 565, brake: 27500 },
  inertia: { Iz: 820, Ipitch: 700, Iroll: 230 },
  susp: { springK: 105000, damperC: 5600, arbK: [90000, 42000] },
  heat: { slide: 60000, roll: 0.06 },
  dirtyAir: 0.07,
};

// Ferrari F2002: V10 3,0 L ~835 CV a 18.300 giri, 600 kg, gomme scanalate Bridgestone; tanto carico per l'epoca
SPECS.f2002 = {
  ...SPECS.r26, label: 'FERRARI F2002',
  geom: { axleF: 1.525, axleR: -1.525, halfTrack: 0.73, wheelR: 0.335, cgHeight: 0.3 },
  hull: [[2.42, -0.7, 'fwL'], [2.42, 0.7, 'fwR'], [2.45, 0, 'nose'], [1.525, -0.92, 'wFL'], [1.525, 0.92, 'wFR'], [0.0, -0.74, 'sideL'], [0.0, 0.74, 'sideR'], [-1.525, -0.92, 'wRL'], [-1.525, 0.92, 'wRR'], [-1.98, -0.45, 'rw'], [-1.98, 0.45, 'rw']],
  circles: [[1.55, 0.92], [0.0, 0.9], [-1.55, 0.92]],
  car: { mass: 600, ClA: 3.4, CdA: 1.1, mu: 1.58, torque: 505, brake: 30000 },
};
// Ferrari F2004: V10 ~865 CV a 19.000 giri, 605 kg: la più veloce dell'era V10 (record sul giro durati 15 anni)
SPECS.f2004 = {
  ...SPECS.f2002, label: 'FERRARI F2004',
  geom: { axleF: 1.525, axleR: -1.525, halfTrack: 0.68, wheelR: 0.3, cgHeight: 0.3 },
  car: { mass: 605, ClA: 3.75, CdA: 1.12, mu: 1.62, torque: 505, brake: 31000 },
};
// Red Bull RB8 (2012): V8 2,4 L ~750 CV a 18.000 giri + KERS, 640 kg, slick Pirelli e scarichi soffiati: tanto carico
SPECS.rb8 = {
  ...SPECS.r26, label: 'RED BULL RB8',
  geom: { axleF: 1.75, axleR: -1.75, halfTrack: 0.74, wheelR: 0.33, cgHeight: 0.3 },
  hull: [[2.78, -0.82, 'fwL'], [2.78, 0.82, 'fwR'], [2.8, 0, 'nose'], [1.75, -0.92, 'wFL'], [1.75, 0.92, 'wFR'], [0.0, -0.74, 'sideL'], [0.0, 0.74, 'sideR'], [-1.75, -0.92, 'wRL'], [-1.75, 0.92, 'wRR'], [-2.38, -0.45, 'rw'], [-2.38, 0.45, 'rw']],
  circles: [[1.8, 0.92], [0.0, 0.9], [-1.8, 0.92]],
  car: { mass: 640, ClA: 4.1, CdA: 1.15, mu: 1.68, torque: 462, brake: 33000 },
  inertia: { Iz: 980, Ipitch: 820, Iroll: 260 },
};

// Mercedes W11 (2020): la F1 più veloce di sempre in curva. ~1000 CV ibridi, 746 kg, carico enorme
SPECS.w11 = {
  ...SPECS.f1, label: 'MERCEDES W11',
  geom: { axleF: 1.865, axleR: -1.865, halfTrack: 0.8, wheelR: 0.33, cgHeight: 0.3 },
  hull: [[3.05, -0.95, 'fwL'], [3.05, 0.95, 'fwR'], [3.08, 0, 'nose'], [1.865, -1.0, 'wFL'], [1.865, 1.0, 'wFR'], [0.1, -0.85, 'sideL'], [0.1, 0.85, 'sideR'], [-1.865, -1.0, 'wRL'], [-1.865, 1.0, 'wRR'], [-2.6, -0.52, 'rw'], [-2.6, 0.52, 'rw']],
  circles: [[1.95, 0.98], [0.1, 1.0], [-1.95, 0.98]],
  car: { mass: 746, ClA: 5.0, CdA: 1.25, mu: 1.82, torque: 690, brake: 42000 },
};

export const SPEC = SPECS[cls];
