// Categoria di vettura scelta dal giocatore: GT3 oppure Formula 1.
// Si legge una volta all'avvio dalle impostazioni salvate (cambiarla ricarica la pagina),
// così fisica, modelli, linea ideale e bot usano tutti le stesse misure.

let cls = 'gt';
try {
  const s = JSON.parse(localStorage.getItem('novaf1.settings') || '{}');
  if (s && s.carClass === 'f1') cls = 'f1';
} catch (e) { /* storage non disponibile: GT */ }

export const CAR_CLASS = cls;
export const IS_F1 = cls === 'f1';

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

export const SPEC = SPECS[cls];
