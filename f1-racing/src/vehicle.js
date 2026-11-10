// Categoria di vettura scelta dal giocatore: GT3 oppure Formula 1.
// Si legge una volta all'avvio dalle impostazioni salvate (cambiarla ricarica la pagina),
// così fisica, modelli, linea ideale e bot usano tutti le stesse misure.

let cls = 'gt';
try {
  const s = JSON.parse(localStorage.getItem('novaf1.settings') || '{}');
  if (s && ['f1', 'r26', 'mp45'].includes(s.carClass)) cls = s.carClass;
} catch (e) { /* storage non disponibile: GT */ }

export const CAR_CLASS = cls;
// la Renault R26 (macchine speciali) è una monoposto: per telecamere, box e griglia vale come F1
// macchine speciali d'epoca: Renault R26 (2006) e McLaren MP4/5 (1989). IS_R26 vale per tutte e due
// (niente batteria né Overtake, motore aspirato che urla); IS_MP45 per quello che è solo della McLaren
export const IS_MP45 = cls === 'mp45';
export const IS_R26 = cls === 'r26' || IS_MP45;
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

export const SPEC = SPECS[cls];
