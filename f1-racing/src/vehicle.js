// Categoria di vettura scelta dal giocatore: GT3 oppure Formula 1.
// Si legge una volta all'avvio dalle impostazioni salvate (cambiarla ricarica la pagina),
// così fisica, modelli, linea ideale e bot usano tutti le stesse misure.

import { PUBLIC } from './edition.js?v=f01fe25a';
let cls = 'gt';
// stradali scaricate da Sketchfab (dati in ROAD_DB più sotto)
const ROAD_NEW = ['panda', 'punto', 'golf', 'clio', 'fiesta', 'corsa', 'e46', 'delta', 'countach', 'ae86',
  'f500', 'c2cv', 'polo', 'sandero', 'focus', 'a3', 'c63', 'r34', 'supra', 'p930',
  'tipo', 'passat', 'octavia', 'qashqai', 'tesla', 'ducato', 'stratos', 'testa', 'sl300',
  'mini', 'civic', 'corolla', 'jeep', 'megane', 'miura', 'gt40', 'f50',
  'ypsilon', 'prius', 'e30', 'evo6', 'rx7', 'zonda', 'evoque', 'duster', 'enzo', 'mcf1',
  'z432', 'bmwm1', 'camaro', 'hakosuka', 'diablo2', 'm5f90', 'm720s', 'quattro', 'm190e', 'townace', 'gt500', 'gto250', 'cobra', 'chall', 'isetta', 's22b', 'slr', 'nsx', 'p918', 'charger', 'golf1', 'beetle', 'express', 'golf2', 'e320', 'gtv6'];
try {
  const s = JSON.parse(localStorage.getItem('novaf1.settings') || '{}');
  if (s && (['f1', 'kart', 'nascar', 'hyper', 'f40', 'uno', 'mul', 'yar', 'mx5', 'r26', 'mp45', 'f2002', 'f2004', 'rb8', 'w11'].includes(s.carClass) || ROAD_NEW.includes(s.carClass))) cls = s.carClass;
  // edizione pubblica: niente F1 storiche (sono vetture vere riconoscibili)
  if (PUBLIC && cls !== 'f1' && cls !== 'gt' && cls !== 'kart' && cls !== 'nascar' && cls !== 'hyper') cls = 'f1';
} catch (e) { /* storage non disponibile: GT */ }

export const CAR_CLASS = cls;
// la Renault R26 (macchine speciali) è una monoposto: per telecamere, box e griglia vale come F1
// macchine speciali d'epoca: Renault R26 (2006) e McLaren MP4/5 (1989). IS_R26 vale per tutte e due
// (niente batteria né Overtake, motore aspirato che urla); IS_MP45 per quello che è solo della McLaren
export const IS_MP45 = cls === 'mp45';
// kart: categoria a sé (niente box F1, niente ali), con le stesse regole di gara delle GT
export const IS_KART = cls === 'kart';
export const IS_NASCAR = cls === 'nascar';
export const IS_HYPER = cls === 'hyper';
// Stradali: vetture di serie vere (Ferrari F40, Fiat Uno Turbo i.e.), ognuna con la sua fisica
export const ROAD_CLS = ['f40', 'uno', 'mul', 'yar', 'mx5', ...ROAD_NEW];
export const IS_ROAD = ROAD_CLS.includes(cls);
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
    dirtyAir: 0.09,
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
    dirtyAir: 0.17,
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

// Kart 125 cc a marce (KZ): ~48 CV a 13.500 giri, 175 kg con il pilota, niente sospensioni né carico
// aerodinamico, assale posteriore rigido, gomme slick morbide: curve velocissime, frenate brevi, ~135 km/h
SPECS.kart = {
  label: 'KART',
  geom: { axleF: 0.51, axleR: -0.51, halfTrack: 0.58, wheelR: 0.14, cgHeight: 0.17 },
  car: { mass: 175, ClA: 0.12, CdA: 0.6, mu: 1.75, torque: 26, brake: 3600 },
  inertia: { Iz: 45, Ipitch: 40, Iroll: 22 },
  susp: { springK: 52000, damperC: 2600, arbK: [9000, 30000] },
  steer: 1.15,
  heat: { slide: 3500, roll: 0.15 },
  // marce (rapporti totali), giri e inerzie di ruote e motore (piccoli e leggeri)
  gears: [12.6, 10.3, 8.7, 7.5, 6.5, 5.6], rpm: 13500, idle: 3800, wheelI: 0.035, engI: 0.0025,
  hull: [
    [0.92, -0.5, 'fwL'], [0.92, 0.5, 'fwR'], [0.95, 0, 'nose'],
    [0.51, -0.68, 'wFL'], [0.51, 0.68, 'wFR'],
    [0.0, -0.62, 'sideL'], [0.0, 0.62, 'sideR'],
    [-0.51, -0.72, 'wRL'], [-0.51, 0.72, 'wRR'],
    [-0.85, -0.55, 'rw'], [-0.85, 0.55, 'rw'],
  ],
  circles: [[0.5, 0.62], [0.0, 0.64], [-0.5, 0.66]],
  ai: { hazard: [9, 2, 0.0004], follow: 13, pit: 9 },
  dirtyAir: 0.01,
  engHeat: 0.6, fuelUse: 0.12,   // motore piccolo raffreddato bene, consuma pochissimo
  lineMu: 0.9,       // in curva rende meno di quanto dica l'aderenza (trasferimento di carico enorme)
};

// NASCAR Cup (Chevrolet Camaro 2018): V8 5,86 L aspirato ~750 CV a 9.500 giri, 1550 kg con il pilota, cambio a 4 marce,
// poco carico aerodinamico e tanta resistenza (scia fortissima), freni modesti: si guida "di gas" in scia
SPECS.nascar = {
  label: 'NASCAR',
  geom: { axleF: 1.33, axleR: -1.46, halfTrack: 0.81, wheelR: 0.355, cgHeight: 0.45 },
  car: { mass: 1550, ClA: 2.1, CdA: 0.95, mu: 1.5, torque: 640, brake: 30000 },
  inertia: { Iz: 2450, Ipitch: 2050, Iroll: 600 },
  susp: { springK: 290000, damperC: 13500, arbK: [240000, 90000] },
  steer: 1.0,
  heat: { slide: 52000, roll: 0.075 },
  gears: [9.6, 7.0, 5.25, 3.95], rpm: 9500, idle: 3500,
  hull: [
    [2.45, -0.95, 'fwL'], [2.45, 0.95, 'fwR'], [2.6, 0, 'nose'],
    [1.33, -1.02, 'wFL'], [1.33, 1.02, 'wFR'],
    [0.0, -1.0, 'sideL'], [0.0, 1.0, 'sideR'],
    [-1.46, -1.02, 'wRL'], [-1.46, 1.02, 'wRR'],
    [-2.55, -0.9, 'rw'], [-2.55, 0.9, 'rw'],
  ],
  circles: [[1.6, 1.0], [0.0, 1.02], [-1.65, 1.0]],
  ai: { hazard: [10, 3, 0.0008], follow: 18, pit: 13 },
  dirtyAir: 0.08,
};

// Hypercar (WEC, Le Mans): prototipi ibridi da ~680 CV in totale, 1030 kg + pilota, tanto carico aerodinamico,
// freni in carbonio: più veloci delle GT3, più lenti delle F1 (Ferrari 499P, Porsche 963, Cadillac V-Series.R)
SPECS.hyper = {
  label: 'HYPERCAR',
  geom: { axleF: 1.55, axleR: -1.6, halfTrack: 0.84, wheelR: 0.36, cgHeight: 0.3 },
  car: { mass: 1080, ClA: 3.3, CdA: 1.0, mu: 1.75, torque: 560, brake: 38000 },
  inertia: { Iz: 1550, Ipitch: 1300, Iroll: 400 },
  susp: { springK: 200000, damperC: 9500, arbK: [160000, 80000] },
  steer: 0.85,
  heat: { slide: 55000, roll: 0.065 },
  hull: [
    [2.45, -0.95, 'fwL'], [2.45, 0.95, 'fwR'], [2.55, 0, 'nose'],
    [1.55, -1.02, 'wFL'], [1.55, 1.02, 'wFR'],
    [0.0, -1.0, 'sideL'], [0.0, 1.0, 'sideR'],
    [-1.6, -1.02, 'wRL'], [-1.6, 1.02, 'wRR'],
    [-2.5, -0.9, 'rw'], [-2.5, 0.9, 'rw'],
  ],
  circles: [[1.7, 0.98], [0.0, 1.0], [-1.7, 0.98]],
  ai: { hazard: [13, 4, 0.0012], follow: 24, pit: 17 },
  dirtyAir: 0.13,
};

// Stradali. Ferrari F40 (1987): V8 2,9 L biturbo, 478 CV a 7000 giri, 577 Nm, 1100 kg + pilota, 5 marce,
// gomme stradali (poca aderenza rispetto alle slick), niente ABS, quasi niente carico aerodinamico
SPECS.f40 = {
  label: 'FERRARI F40',
  geom: { axleF: 1.225, axleR: -1.225, halfTrack: 0.8, wheelR: 0.33, cgHeight: 0.42 },
  car: { mass: 1180, ClA: 0.55, CdA: 0.62, mu: 1.2, torque: 577, brake: 21000 },
  inertia: { Iz: 1500, Ipitch: 1250, Iroll: 420 },
  susp: { springK: 140000, damperC: 7500, arbK: [120000, 35000] },
  steer: 0.85,
  heat: { slide: 38000, roll: 0.07 },
  gears: [9.94, 6.18, 4.4, 3.45, 2.75], rpm: 7750, idle: 1100,
  hull: [
    [2.1, -0.85, 'fwL'], [2.1, 0.85, 'fwR'], [2.16, 0, 'nose'],
    [1.225, -0.95, 'wFL'], [1.225, 0.95, 'wFR'],
    [0.0, -0.97, 'sideL'], [0.0, 0.97, 'sideR'],
    [-1.225, -0.95, 'wRL'], [-1.225, 0.95, 'wRR'],
    [-2.05, -0.85, 'rw'], [-2.05, 0.85, 'rw'],
  ],
  circles: [[1.35, 0.95], [0.0, 0.97], [-1.3, 0.95]],
  ai: { hazard: [10, 3, 0.0009], follow: 18, pit: 13 },
  dirtyAir: 0.03,
};
// Fiat Uno Turbo i.e. (1995): 4 cilindri 1,4 L turbo, 118 CV, 172 Nm, ~975 kg + pilota, trazione anteriore,
// gomme 175/60 R13, differenziale aperto: in uscita di curva la ruota interna pattina
SPECS.uno = {
  label: 'FIAT UNO TURBO',
  geom: { axleF: 1.181, axleR: -1.181, halfTrack: 0.68, wheelR: 0.28, cgHeight: 0.52 },
  car: { mass: 1050, ClA: 0.05, CdA: 0.62, mu: 1.0, torque: 172, brake: 13000 },
  inertia: { Iz: 1150, Ipitch: 980, Iroll: 340 },
  susp: { springK: 90000, damperC: 5200, arbK: [60000, 25000] },
  steer: 0.9,
  heat: { slide: 30000, roll: 0.07 },
  gears: [14.1, 7.8, 5.35, 4.05, 3.26], rpm: 6500, idle: 900,
  fwd: true, lsd: 0.25,
  hull: [
    [1.85, -0.72, 'fwL'], [1.85, 0.72, 'fwR'], [1.92, 0, 'nose'],
    [1.181, -0.8, 'wFL'], [1.181, 0.8, 'wFR'],
    [0.0, -0.8, 'sideL'], [0.0, 0.8, 'sideR'],
    [-1.181, -0.8, 'wRL'], [-1.181, 0.8, 'wRR'],
    [-1.7, -0.7, 'rw'], [-1.7, 0.7, 'rw'],
  ],
  circles: [[1.1, 0.8], [0.0, 0.8], [-1.1, 0.8]],
  ai: { hazard: [9, 3, 0.0008], follow: 16, pit: 12 },
  dirtyAir: 0.02,
};
// Fiat Multipla 1998: 1,6 L 16V benzina, 103 CV, 145 Nm, ~1300 kg + pilota, alta e larga (baricentro alto),
// trazione anteriore, 0-100 in ~12,6 s, 170 km/h
SPECS.mul = {
  label: 'FIAT MULTIPLA',
  geom: { axleF: 1.333, axleR: -1.333, halfTrack: 0.75, wheelR: 0.3, cgHeight: 0.62 },
  car: { mass: 1375, ClA: 0.0, CdA: 0.84, mu: 1.0, torque: 132, brake: 14000 },
  inertia: { Iz: 1700, Ipitch: 1500, Iroll: 520 },
  susp: { springK: 80000, damperC: 5500, arbK: [55000, 20000] },
  steer: 0.85,
  heat: { slide: 30000, roll: 0.07 },
  gears: [17.3, 9.56, 6.56, 4.97, 4.0], rpm: 6300, idle: 850,
  fwd: true, lsd: 0.25,
  hull: [
    [2.05, -0.85, 'fwL'], [2.05, 0.85, 'fwR'], [2.12, 0, 'nose'],
    [1.333, -0.93, 'wFL'], [1.333, 0.93, 'wFR'],
    [0.0, -0.93, 'sideL'], [0.0, 0.93, 'sideR'],
    [-1.333, -0.93, 'wRL'], [-1.333, 0.93, 'wRR'],
    [-1.85, -0.85, 'rw'], [-1.85, 0.85, 'rw'],
  ],
  circles: [[1.25, 0.93], [0.0, 0.93], [-1.2, 0.93]],
  ai: { hazard: [9, 3, 0.0008], follow: 16, pit: 12 },
  dirtyAir: 0.02,
};
// Toyota Yaris 2001: 1,0 L VVT-i, 68 CV, 90 Nm, 830 kg + pilota, trazione anteriore, 0-100 in ~13,6 s, 155 km/h
SPECS.yar = {
  label: 'TOYOTA YARIS',
  geom: { axleF: 1.185, axleR: -1.185, halfTrack: 0.71, wheelR: 0.285, cgHeight: 0.55 },
  car: { mass: 905, ClA: 0.0, CdA: 0.6, mu: 1.0, torque: 79, brake: 11000 },
  inertia: { Iz: 1000, Ipitch: 860, Iroll: 300 },
  susp: { springK: 75000, damperC: 4500, arbK: [50000, 20000] },
  steer: 0.9,
  heat: { slide: 28000, roll: 0.07 },
  gears: [18.0, 9.95, 6.82, 5.17, 4.16], rpm: 6500, idle: 800,
  fwd: true, lsd: 0.25,
  hull: [
    [1.85, -0.75, 'fwL'], [1.85, 0.75, 'fwR'], [1.92, 0, 'nose'],
    [1.185, -0.84, 'wFL'], [1.185, 0.84, 'wFR'],
    [0.0, -0.84, 'sideL'], [0.0, 0.84, 'sideR'],
    [-1.185, -0.84, 'wRL'], [-1.185, 0.84, 'wRR'],
    [-1.68, -0.75, 'rw'], [-1.68, 0.75, 'rw'],
  ],
  circles: [[1.1, 0.84], [0.0, 0.84], [-1.1, 0.84]],
  ai: { hazard: [9, 3, 0.0008], follow: 16, pit: 12 },
  dirtyAir: 0.02,
};
// Mazda MX-5 NA 1.6 (1989): 4 cilindri 1,6 L 116 CV, 136 Nm, 940 kg + pilota, trazione posteriore,
// 50/50, leggera e bilanciata; 0-100 in ~8,8 s, 194 km/h; fari a scomparsa
SPECS.mx5 = {
  label: 'MAZDA MX-5',
  geom: { axleF: 1.1325, axleR: -1.1325, halfTrack: 0.7, wheelR: 0.29, cgHeight: 0.46 },
  car: { mass: 1015, ClA: 0.05, CdA: 0.65, mu: 1.05, torque: 136, brake: 13000 },
  inertia: { Iz: 1100, Ipitch: 950, Iroll: 330 },
  susp: { springK: 80000, damperC: 5000, arbK: [55000, 25000] },
  steer: 0.9,
  heat: { slide: 30000, roll: 0.07 },
  gears: [13.48, 8.12, 5.72, 4.3, 3.5], rpm: 7200, idle: 850,
  lsd: 0.6,
  hull: [
    [1.9, -0.78, 'fwL'], [1.9, 0.78, 'fwR'], [1.94, 0, 'nose'],
    [1.1325, -0.86, 'wFL'], [1.1325, 0.86, 'wFR'],
    [0.0, -0.86, 'sideL'], [0.0, 0.86, 'sideR'],
    [-1.1325, -0.86, 'wRL'], [-1.1325, 0.86, 'wRR'],
    [-1.95, -0.78, 'rw'], [-1.95, 0.78, 'rw'],
  ],
  circles: [[1.15, 0.86], [0.0, 0.86], [-1.15, 0.86]],
  ai: { hazard: [9, 3, 0.0008], follow: 16, pit: 12 },
  dirtyAir: 0.02,
};

// Stradali scaricate da Sketchfab: dati veri di ognuna (peso con il pilota, coppia, giri, rapporti totali,
// trazione); la fisica completa si ricava da qui (roadSpec). wb/tw: passo e carreggiata, len/wid: ingombro.
// paint: colore di serie (null = quello del modello). snd: banco del motore e moltiplicatore dei giri.
export const ROAD_DB = {
  panda: { label: 'FIAT PANDA', year: 1984, short: 'PANDA', engine: '4 cilindri 1,0 L FIRE · 4 marce', hp: 45, kg: 750, vmax: 140,
    mass: 825, torque: 80, rpm: 6000, idle: 850, gears: [16.2, 8.6, 5.6, 4.0], wheelR: 0.27, wb: 2.16, tw: 0.63, len: 3.42, wid: 1.6, cg: 0.55, CdA: 0.74, mu: 0.95, brake: 9000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.3] },
  punto: { label: 'FIAT PUNTO GT', year: 1995, short: 'PUNTO GT', engine: '4 cilindri 1,4 L turbo · 5 marce', hp: 133, kg: 1080, vmax: 200,
    mass: 1155, torque: 191, rpm: 6500, idle: 850, gears: [14.2, 7.85, 5.39, 4.08, 3.28], wheelR: 0.29, wb: 2.45, tw: 0.71, len: 3.79, wid: 1.92, cg: 0.52, CdA: 0.64, mu: 1.0, brake: 13000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.25] },
  golf: { label: 'VOLKSWAGEN GOLF GTI', year: 1992, short: 'GOLF GTI', engine: '4 cilindri 1,8 L 16V · 5 marce', hp: 136, kg: 960, vmax: 208,
    mass: 1035, torque: 168, rpm: 7000, idle: 850, gears: [14.6, 8.4, 5.7, 4.4, 3.41], wheelR: 0.29, wb: 2.475, tw: 0.71, len: 4.0, wid: 1.78, cg: 0.52, CdA: 0.65, mu: 1.0, brake: 13000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.2] },
  clio: { label: 'RENAULT CLIO WILLIAMS', year: 1993, short: 'CLIO', engine: '4 cilindri 2,0 L · 5 marce', hp: 150, kg: 990, vmax: 215,
    mass: 1065, torque: 175, rpm: 6900, idle: 850, gears: [12.6, 7.5, 5.3, 4.1, 3.3], wheelR: 0.29, wb: 2.47, tw: 0.7, len: 3.7, wid: 1.84, cg: 0.5, CdA: 0.67, mu: 1.05, brake: 14000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.2] },
  fiesta: { label: 'FORD FIESTA', year: 2009, short: 'FIESTA', engine: '4 cilindri 1,6 L · 5 marce', hp: 120, kg: 1100, vmax: 195,
    mass: 1175, torque: 152, rpm: 6800, idle: 800, gears: [14.5, 8.0, 5.4, 4.3, 3.53], wheelR: 0.3, wb: 2.49, tw: 0.74, len: 3.97, wid: 1.98, cg: 0.52, CdA: 0.66, mu: 1.0, brake: 13500, drive: 'fwd', paint: null, snd: ['eng-gt', 1.2] },
  corsa: { label: 'OPEL CORSA', year: 1998, short: 'CORSA', engine: '4 cilindri 1,4 L 16V · 5 marce', hp: 90, kg: 950, vmax: 180,
    mass: 1025, torque: 125, rpm: 6500, idle: 800, gears: [15.0, 8.3, 5.6, 4.3, 3.52], wheelR: 0.28, wb: 2.443, tw: 0.7, len: 3.72, wid: 1.78, cg: 0.53, CdA: 0.66, mu: 0.98, brake: 12000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.25] },
  e46: { label: 'BMW M3 E46', year: 2001, short: 'M3 E46', engine: '6 cilindri in linea 3,2 L · 6 marce', hp: 343, kg: 1570, vmax: 250,
    mass: 1645, torque: 365, rpm: 8000, idle: 900, gears: [15.3, 9.16, 6.05, 4.45, 3.62, 3.0], wheelR: 0.33, wb: 2.73, tw: 0.76, len: 4.46, wid: 1.96, cg: 0.48, CdA: 0.67, mu: 1.15, brake: 22000, drive: 'rwd', lsd: 1, paint: null, snd: ['eng-gt', 0.95] },
  delta: { label: 'LANCIA DELTA HF INTEGRALE', year: 1993, short: 'DELTA', engine: '4 cilindri 2,0 L turbo · 5 marce · trazione integrale', hp: 215, kg: 1340, vmax: 220,
    mass: 1415, torque: 314, rpm: 6800, idle: 900, gears: [12.5, 7.8, 5.4, 4.1, 3.46], wheelR: 0.31, wb: 2.48, tw: 0.74, len: 3.93, wid: 1.72, cg: 0.5, CdA: 0.75, mu: 1.1, brake: 17000, drive: 'awd', paint: null, snd: ['eng-gt', 1.15] },
  countach: { label: 'LAMBORGHINI COUNTACH', year: 1985, short: 'COUNTACH', engine: 'V12 5,2 L · 5 marce', hp: 455, kg: 1490, vmax: 295,
    mass: 1565, torque: 500, rpm: 7800, idle: 1000, gears: [10.5, 6.6, 4.8, 3.8, 3.16], wheelR: 0.33, wb: 2.45, tw: 0.8, len: 4.12, wid: 2.06, cg: 0.45, CdA: 0.76, mu: 1.2, brake: 20000, drive: 'rwd', lsd: 1, paint: 0xc0101a, snd: ['eng-v8', 0.62] },
  ae86: { label: 'TOYOTA AE86 TRUENO', year: 1985, short: 'AE86', engine: '4 cilindri 1,6 L 4A-GE · 5 marce', hp: 130, kg: 940, vmax: 200,
    mass: 1015, torque: 149, rpm: 7600, idle: 850, gears: [13.6, 8.3, 5.6, 4.3, 3.83], wheelR: 0.29, wb: 2.4, tw: 0.68, len: 4.2, wid: 1.84, cg: 0.5, CdA: 0.66, mu: 1.0, brake: 13000, drive: 'rwd', lsd: 0.6, paint: null, snd: ['eng-gt', 1.1] },
  // --- giro 2 ---
  f500: { label: 'FIAT 500', year: 1965, short: '500', engine: '2 cilindri 0,5 L · motore dietro · 4 marce', hp: 18, kg: 500, vmax: 95,
    mass: 575, torque: 31, rpm: 4600, idle: 800, gears: [18.96, 10.6, 6.66, 4.48], wheelR: 0.27, wb: 1.84, tw: 0.58, len: 2.97, wid: 1.38, cg: 0.5, CdA: 0.61, mu: 0.9, brake: 6000, drive: 'rwd', lsd: 0.2, paint: null, snd: ['eng-gt', 1.6] },
  c2cv: { label: 'CITROËN 2CV CHARLESTON', year: 1986, short: '2CV', engine: '2 cilindri boxer 0,6 L · 4 marce', hp: 29, kg: 590, vmax: 115,
    mass: 665, torque: 40, rpm: 5750, idle: 800, gears: [21.6, 10.9, 7.1, 5.45], wheelR: 0.29, wb: 2.4, tw: 0.63, len: 3.82, wid: 1.64, cg: 0.6, CdA: 0.87, mu: 0.85, brake: 6000, drive: 'fwd', paint: null, fixed: true, snd: ['eng-gt', 1.5] },
  polo: { label: 'VOLKSWAGEN POLO', year: 2016, short: 'POLO', engine: '4 cilindri 1,2 L TSI · 5 marce', hp: 90, kg: 1100, vmax: 182,
    mass: 1175, torque: 160, rpm: 6000, idle: 800, gears: [17.3, 9.3, 6.1, 4.6, 3.73], wheelR: 0.3, wb: 2.56, tw: 0.73, len: 3.97, wid: 1.9, cg: 0.53, CdA: 0.67, mu: 1.0, brake: 13000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.25] },
  sandero: { label: 'DACIA SANDERO', year: 2008, short: 'SANDERO', engine: '4 cilindri 1,4 L · 5 marce', hp: 75, kg: 1000, vmax: 165,
    mass: 1075, torque: 112, rpm: 6000, idle: 800, gears: [16.0, 8.6, 5.9, 4.4, 3.65], wheelR: 0.29, wb: 2.59, tw: 0.73, len: 3.84, wid: 1.86, cg: 0.55, CdA: 0.7, mu: 0.97, brake: 11500, drive: 'fwd', paint: null, snd: ['eng-gt', 1.25] },
  focus: { label: 'FORD FOCUS ST', year: 2006, short: 'FOCUS ST', engine: '5 cilindri 2,5 L turbo · 6 marce', hp: 225, kg: 1392, vmax: 241,
    mass: 1467, torque: 320, rpm: 6800, idle: 850, gears: [17.2, 9.4, 6.7, 4.8, 3.86, 3.15], wheelR: 0.31, wb: 2.64, tw: 0.76, len: 4.34, wid: 1.96, cg: 0.52, CdA: 0.7, mu: 1.05, brake: 17000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.1] },
  a3: { label: 'AUDI A3 3.2 QUATTRO', year: 2004, short: 'A3', engine: 'V6 3,2 L · 6 marce · trazione integrale', hp: 250, kg: 1495, vmax: 250,
    mass: 1570, torque: 320, rpm: 6800, idle: 850, gears: [16.1, 8.85, 6.28, 4.52, 3.62, 2.95], wheelR: 0.31, wb: 2.58, tw: 0.76, len: 4.2, wid: 1.96, cg: 0.52, CdA: 0.68, mu: 1.08, brake: 17000, drive: 'awd', paint: null, snd: ['eng-gt', 1.05] },
  c63: { label: 'MERCEDES-AMG C 63', year: 2008, short: 'C 63', engine: 'V8 6,2 L · 7 marce', hp: 457, kg: 1730, vmax: 250,
    mass: 1805, torque: 600, rpm: 7200, idle: 800, gears: [12.35, 8.07, 5.41, 3.86, 2.82, 2.31], wheelR: 0.33, wb: 2.76, tw: 0.78, len: 4.7, wid: 1.98, cg: 0.5, CdA: 0.66, mu: 1.12, brake: 22000, drive: 'rwd', lsd: 0.8, paint: null, snd: ['eng-v8', 0.66] },
  r34: { label: 'NISSAN SKYLINE GT-R R34', year: 1999, short: 'R34', engine: '6 cilindri in linea 2,6 L biturbo · 6 marce · integrale', hp: 280, kg: 1560, vmax: 250,
    mass: 1635, torque: 392, rpm: 8000, idle: 900, gears: [13.6, 8.38, 6.0, 4.65, 3.55, 2.8], wheelR: 0.33, wb: 2.665, tw: 0.76, len: 4.6, wid: 1.9, cg: 0.5, CdA: 0.7, mu: 1.12, brake: 20000, drive: 'awd', paint: null, snd: ['eng-gt', 0.95] },
  supra: { label: 'TOYOTA SUPRA MK4', year: 1997, short: 'SUPRA', engine: '6 cilindri in linea 3,0 L biturbo · 6 marce', hp: 330, kg: 1570, vmax: 250,
    mass: 1645, torque: 451, rpm: 6800, idle: 850, gears: [12.5, 7.7, 5.5, 4.3, 3.27, 2.58], wheelR: 0.33, wb: 2.55, tw: 0.77, len: 4.56, wid: 2.02, cg: 0.48, CdA: 0.65, mu: 1.12, brake: 20000, drive: 'rwd', lsd: 0.8, paint: null, snd: ['eng-gt', 1.0] },
  p930: { label: 'PORSCHE 911 TURBO (930)', year: 1975, short: '911 TURBO', engine: '6 cilindri boxer 3,0 L turbo · motore dietro · 4 marce', hp: 260, kg: 1140, vmax: 250,
    mass: 1215, torque: 343, rpm: 6800, idle: 900, gears: [9.0, 5.2, 3.56, 2.5], wheelR: 0.32, wb: 2.272, tw: 0.75, len: 4.28, wid: 1.76, cg: 0.46, CdA: 0.7, mu: 1.1, brake: 17000, drive: 'rwd', lsd: 0.4, paint: null, snd: ['eng-gt', 1.0] },
  // --- giro 3 ---
  tipo: { label: 'FIAT TIPO', year: 2016, short: 'TIPO', engine: '4 cilindri 1,4 L · 6 marce', hp: 95, kg: 1200, vmax: 185,
    mass: 1275, torque: 150, rpm: 6300, idle: 800, gears: [16.1, 8.9, 6.1, 4.6, 3.79], wheelR: 0.31, wb: 2.54, tw: 0.77, len: 4.38, wid: 1.86, cg: 0.54, CdA: 0.7, mu: 1.0, brake: 13000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.25] },
  passat: { label: 'VOLKSWAGEN PASSAT', year: 2021, short: 'PASSAT', engine: '4 cilindri 2,0 L TSI · 7 marce', hp: 186, kg: 1550, vmax: 230,
    mass: 1625, torque: 320, rpm: 6500, idle: 800, gears: [17.2, 9.4, 6.7, 4.8, 3.86, 3.15], wheelR: 0.32, wb: 2.79, tw: 0.79, len: 4.82, wid: 2.06, cg: 0.53, CdA: 0.66, mu: 1.03, brake: 17000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.15] },
  octavia: { label: 'ŠKODA OCTAVIA', year: 2000, short: 'OCTAVIA', engine: '4 cilindri 1,6 L · 5 marce', hp: 102, kg: 1200, vmax: 190,
    mass: 1275, torque: 148, rpm: 6200, idle: 800, gears: [15.6, 8.6, 5.9, 4.4, 3.56], wheelR: 0.31, wb: 2.51, tw: 0.75, len: 4.52, wid: 1.9, cg: 0.54, CdA: 0.68, mu: 1.0, brake: 13000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.25] },
  qashqai: { label: 'NISSAN QASHQAI', year: 2018, short: 'QASHQAI', engine: '4 cilindri 1,3 L turbo · 6 marce · SUV', hp: 140, kg: 1370, vmax: 193,
    mass: 1445, torque: 200, rpm: 6000, idle: 800, gears: [17.8, 9.8, 6.9, 5.0, 4.0, 3.3], wheelR: 0.34, wb: 2.646, tw: 0.79, len: 4.39, wid: 2.1, cg: 0.65, CdA: 0.83, mu: 1.0, brake: 15000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.2] },
  tesla: { label: 'TESLA MODEL 3', year: 2021, short: 'MODEL 3', engine: 'Elettrica · motore posteriore · una marcia', hp: 283, kg: 1611, vmax: 225,
    mass: 1686, torque: 435, rpm: 16000, idle: 100, gears: [9.0], wheelR: 0.34, wb: 2.875, tw: 0.79, len: 4.69, wid: 2.05, cg: 0.45, CdA: 0.52, mu: 1.05, brake: 19000, drive: 'rwd', lsd: 0.6, ev: 7000, paint: null, snd: ['eng-gt', 0.45] },
  ducato: { label: 'FIAT DUCATO', year: 2014, short: 'DUCATO', engine: '4 cilindri 2,3 L Multijet diesel · 6 marce · furgone', hp: 130, kg: 1950, vmax: 160,
    mass: 2025, torque: 255, rpm: 4500, idle: 800, gears: [16.5, 9.0, 5.6, 4.0, 3.2, 2.7], wheelR: 0.35, wb: 3.45, tw: 0.86, len: 5.75, wid: 2.05, cg: 0.85, CdA: 1.45, mu: 0.95, brake: 19000, drive: 'fwd', paint: null, snd: ['eng-v8', 0.9] },
  stratos: { label: 'LANCIA STRATOS HF (rally)', year: 1977, short: 'STRATOS', engine: 'V6 Ferrari 2,4 L · motore centrale · 5 marce', hp: 275, kg: 980, vmax: 230,
    mass: 1055, torque: 270, rpm: 8200, idle: 1000, gears: [12.4, 8.3, 6.1, 4.8, 3.93], wheelR: 0.3, wb: 2.18, tw: 0.75, len: 3.71, wid: 1.86, cg: 0.45, CdA: 0.7, mu: 1.12, brake: 16000, drive: 'rwd', lsd: 1, paint: null, fixed: true, snd: ['eng-v8', 0.6] },
  testa: { label: 'FERRARI TESTAROSSA', year: 1988, short: 'TESTAROSSA', engine: '12 cilindri boxer 4,9 L · motore centrale · 5 marce', hp: 390, kg: 1506, vmax: 290,
    mass: 1581, torque: 490, rpm: 7000, idle: 900, gears: [10.6, 6.6, 4.7, 3.6, 2.83], wheelR: 0.32, wb: 2.55, tw: 0.8, len: 4.49, wid: 2.08, cg: 0.45, CdA: 0.66, mu: 1.15, brake: 20000, drive: 'rwd', lsd: 0.8, paint: null, snd: ['eng-v8', 0.6] },
  sl300: { label: 'MERCEDES-BENZ 300 SL "ALI DI GABBIANO"', year: 1955, short: '300 SL', engine: '6 cilindri in linea 3,0 L · 4 marce', hp: 215, kg: 1295, vmax: 250,
    mass: 1370, torque: 228, rpm: 6400, idle: 850, gears: [11.3, 6.9, 4.6, 3.24], wheelR: 0.33, wb: 2.4, tw: 0.7, len: 4.52, wid: 1.79, cg: 0.5, CdA: 0.63, mu: 0.92, brake: 11000, drive: 'rwd', lsd: 0.3, paint: null, snd: ['eng-gt', 1.0] },
  // --- giro 4 ---
  mini: { label: 'MINI COOPER S', year: 2007, short: 'MINI', engine: '4 cilindri 1,6 L turbo · 6 marce', hp: 175, kg: 1150, vmax: 225,
    mass: 1225, torque: 240, rpm: 6800, idle: 850, gears: [17.2, 9.4, 6.7, 4.8, 3.86, 3.15], wheelR: 0.29, wb: 2.467, tw: 0.74, len: 3.7, wid: 1.88, cg: 0.5, CdA: 0.66, mu: 1.05, brake: 15000, drive: 'fwd', paint: null, fixed: true, snd: ['eng-gt', 1.15] },
  civic: { label: 'HONDA CIVIC TYPE R (EK9)', year: 2000, short: 'CIVIC R', engine: '4 cilindri 1,6 L VTEC · 5 marce · 9.000 giri', hp: 185, kg: 1050, vmax: 225,
    mass: 1125, torque: 178, rpm: 9000, idle: 900, gears: [14.0, 8.8, 6.2, 4.9, 4.13], wheelR: 0.29, wb: 2.62, tw: 0.74, len: 4.16, wid: 1.96, cg: 0.5, CdA: 0.64, mu: 1.06, brake: 15000, drive: 'fwd', paint: null, snd: ['eng-gt', 0.95] },
  corolla: { label: 'TOYOTA COROLLA', year: 2014, short: 'COROLLA', engine: '4 cilindri 1,3 L · 6 marce', hp: 99, kg: 1200, vmax: 175,
    mass: 1275, torque: 148, rpm: 6200, idle: 800, gears: [16.0, 8.7, 5.9, 4.5, 3.7, 3.1], wheelR: 0.31, wb: 2.6, tw: 0.76, len: 4.44, wid: 2.08, cg: 0.54, CdA: 0.66, mu: 1.0, brake: 13000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.25] },
  jeep: { label: 'JEEP WRANGLER RUBICON', year: 2007, short: 'WRANGLER', engine: 'V6 3,8 L · 6 marce · 4x4', hp: 202, kg: 1900, vmax: 175,
    mass: 1975, torque: 321, rpm: 5800, idle: 750, gears: [16.5, 9.5, 6.2, 4.6, 3.6, 2.9], wheelR: 0.38, wb: 2.42, tw: 0.8, len: 4.23, wid: 1.94, cg: 0.8, CdA: 1.3, mu: 0.95, brake: 18000, drive: 'awd', paint: null, snd: ['eng-v8', 0.75] },
  megane: { label: 'RENAULT MÉGANE R.S. 250', year: 2010, short: 'MÉGANE RS', engine: '4 cilindri 2,0 L turbo · 6 marce', hp: 250, kg: 1387, vmax: 250,
    mass: 1462, torque: 340, rpm: 6800, idle: 850, gears: [16.0, 9.2, 6.4, 4.8, 3.8, 3.05], wheelR: 0.32, wb: 2.64, tw: 0.78, len: 4.31, wid: 2.08, cg: 0.5, CdA: 0.68, mu: 1.1, brake: 18000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.1] },
  miura: { label: 'LAMBORGHINI MIURA P400', year: 1968, short: 'MIURA', engine: 'V12 3,9 L · motore centrale · 5 marce', hp: 350, kg: 1125, vmax: 280,
    mass: 1200, torque: 245, rpm: 7700, idle: 900, gears: [11.4, 7.4, 5.4, 4.2, 3.2], wheelR: 0.31, wb: 2.5, tw: 0.72, len: 4.36, wid: 1.76, cg: 0.45, CdA: 0.7, mu: 1.05, brake: 15000, drive: 'rwd', lsd: 0.6, paint: null, snd: ['eng-v8', 0.6] },
  gt40: { label: 'FORD GT40 MK II', year: 1966, short: 'GT40', engine: 'V8 7,0 L · motore centrale · 4 marce · Le Mans', hp: 485, kg: 1150, vmax: 330,
    mass: 1225, torque: 640, rpm: 6800, idle: 900, gears: [7.2, 4.6, 3.3, 2.45], wheelR: 0.33, wb: 2.42, tw: 0.76, len: 4.31, wid: 1.86, cg: 0.42, CdA: 0.6, mu: 1.25, brake: 19000, drive: 'rwd', lsd: 1, paint: null, snd: ['eng-v8', 0.68] },
  f50: { label: 'FERRARI F50', year: 1995, short: 'F50', engine: 'V12 4,7 L · motore centrale · 6 marce', hp: 520, kg: 1230, vmax: 325,
    mass: 1305, torque: 471, rpm: 8800, idle: 1000, gears: [12.0, 8.1, 6.1, 4.8, 3.9, 3.25], wheelR: 0.33, wb: 2.58, tw: 0.8, len: 4.48, wid: 1.99, cg: 0.42, CdA: 0.7, mu: 1.22, brake: 17500, drive: 'rwd', lsd: 0.5, paint: 0xc8070d, snd: ['eng-v8', 0.55] },
  // --- giro 5 ---
  ypsilon: { label: 'LANCIA Y', year: 2000, short: 'Y', engine: '4 cilindri 1,2 L 16V · 5 marce', hp: 86, kg: 930, vmax: 180,
    mass: 1005, torque: 113, rpm: 6500, idle: 800, gears: [15.58, 8.61, 5.9, 4.46, 3.67], wheelR: 0.28, wb: 2.38, tw: 0.72, len: 3.74, wid: 1.85, cg: 0.52, CdA: 0.62, mu: 1.0, brake: 12500, drive: 'fwd', paint: null, fixed: true, snd: ['eng-gt', 1.3] },
  prius: { label: 'TOYOTA PRIUS', year: 2012, short: 'PRIUS', engine: 'Ibrida 1,8 L + motore elettrico · cambio e-CVT', hp: 136, kg: 1380, vmax: 180,
    mass: 1455, torque: 300, rpm: 12000, idle: 800, gears: [7.49], wheelR: 0.31, wb: 2.7, tw: 0.76, len: 4.48, wid: 2.0, cg: 0.5, CdA: 0.55, mu: 0.98, brake: 18000, drive: 'fwd', ev: 4500, paint: null, snd: ['eng-gt', 0.5] },
  e30: { label: 'BMW M3 (E30)', year: 1987, short: 'M3 E30', engine: '4 cilindri 2,3 L 16V · 5 marce', hp: 200, kg: 1200, vmax: 235,
    mass: 1275, torque: 240, rpm: 7250, idle: 900, gears: [12.48, 8.05, 5.94, 4.23, 3.35], wheelR: 0.3, wb: 2.562, tw: 0.72, len: 4.36, wid: 1.85, cg: 0.48, CdA: 0.62, mu: 1.1, brake: 16000, drive: 'rwd', lsd: 0.75, paint: null, snd: ['eng-gt', 1.05] },
  evo6: { label: 'MITSUBISHI LANCER EVOLUTION VI', year: 1999, short: 'EVO VI', engine: '4 cilindri 2,0 L turbo · 5 marce · integrale', hp: 280, kg: 1360, vmax: 250,
    mass: 1435, torque: 373, rpm: 7000, idle: 850, gears: [11.51, 8.06, 5.82, 4.26, 3.15], wheelR: 0.31, wb: 2.51, tw: 0.75, len: 4.35, wid: 1.95, cg: 0.5, CdA: 0.66, mu: 1.15, brake: 18000, drive: 'awd', paint: null, fixed: true, snd: ['eng-gt', 1.0] },
  rx7: { label: 'MAZDA RX-7 (FD)', year: 1992, short: 'RX-7', engine: 'Rotativo biturbo 1,3 L · 5 marce', hp: 255, kg: 1260, vmax: 250,
    mass: 1335, torque: 294, rpm: 7500, idle: 900, gears: [16.29, 9.46, 6.51, 4.68, 3.37], wheelR: 0.31, wb: 2.425, tw: 0.74, len: 4.28, wid: 1.94, cg: 0.46, CdA: 0.6, mu: 1.12, brake: 16500, drive: 'rwd', lsd: 0.7, paint: null, snd: ['eng-gt', 0.9] },
  zonda: { label: 'PAGANI ZONDA F', year: 2005, short: 'ZONDA F', engine: 'V12 AMG 7,3 L · motore centrale · 6 marce', hp: 602, kg: 1230, vmax: 345,
    mass: 1305, torque: 760, rpm: 7500, idle: 950, gears: [9.48, 6.37, 4.84, 3.86, 3.17, 2.68], wheelR: 0.34, wb: 2.73, tw: 0.81, len: 4.43, wid: 2.05, cg: 0.42, CdA: 0.68, mu: 1.25, brake: 16500, drive: 'rwd', lsd: 0.6, paint: null, fixed: true, snd: ['eng-v8', 0.55] },
  evoque: { label: 'RANGE ROVER EVOQUE', year: 2012, short: 'EVOQUE', engine: '4 cilindri 2,0 L turbo · 6 marce · 4x4 · SUV', hp: 240, kg: 1640, vmax: 217,
    mass: 1715, torque: 340, rpm: 6200, idle: 800, gears: [22.42, 12.81, 8.43, 6.27, 4.65, 3.73], wheelR: 0.36, wb: 2.66, tw: 0.8, len: 4.36, wid: 2.1, cg: 0.62, CdA: 0.8, mu: 1.0, brake: 21500, drive: 'awd', paint: null, fixed: true, snd: ['eng-gt', 1.15] },
  duster: { label: 'DACIA DUSTER', year: 2011, short: 'DUSTER', engine: '4 cilindri 1,6 L · 5 marce · SUV', hp: 105, kg: 1180, vmax: 167,
    mass: 1255, torque: 148, rpm: 6000, idle: 800, gears: [21.73, 11.94, 7.69, 5.65, 4.43], wheelR: 0.34, wb: 2.67, tw: 0.78, len: 4.31, wid: 2.0, cg: 0.62, CdA: 0.85, mu: 0.98, brake: 15500, drive: 'fwd', paint: null, snd: ['eng-gt', 1.25] },
  enzo: { label: 'FERRARI ENZO', year: 2002, short: 'ENZO', engine: 'V12 6,0 L · motore centrale · 6 marce', hp: 660, kg: 1365, vmax: 350,
    mass: 1440, torque: 657, rpm: 8200, idle: 1000, gears: [10.58, 7.32, 5.47, 4.3, 3.46, 2.89], wheelR: 0.34, wb: 2.65, tw: 0.82, len: 4.7, wid: 2.04, cg: 0.42, CdA: 0.68, mu: 1.25, brake: 18000, drive: 'rwd', lsd: 0.3, paint: null, fixed: true, snd: ['eng-v8', 0.5] },
  mcf1: { label: 'McLAREN F1', year: 1993, short: 'F1', engine: 'V12 BMW 6,1 L · motore centrale · 6 marce · guida centrale', hp: 627, kg: 1140, vmax: 386,
    mass: 1215, torque: 650, rpm: 7500, idle: 950, gears: [8.07, 5.47, 4.27, 3.47, 2.9, 2.32], wheelR: 0.33, wb: 2.718, tw: 0.78, len: 4.29, wid: 2.0, cg: 0.42, CdA: 0.6, mu: 1.2, brake: 15000, drive: 'rwd', lsd: 0.3, paint: null, snd: ['eng-v8', 0.55] },
  // --- giro 6 ---
  z432: { label: 'NISSAN FAIRLADY Z 432', year: 1969, short: 'Z 432', engine: '6 cilindri 2,0 L 24V · 5 marce', hp: 160, kg: 1040, vmax: 210,
    mass: 1115, torque: 177, rpm: 7600, idle: 900, gears: [13.24, 8.66, 5.96, 4.56, 3.94], wheelR: 0.3, wb: 2.305, tw: 0.68, len: 4.12, wid: 1.8, cg: 0.48, CdA: 0.62, mu: 1.0, brake: 14000, drive: 'rwd', lsd: 0.6, paint: null, fixed: true, snd: ['eng-gt', 0.95] },
  bmwm1: { label: 'BMW M1', year: 1980, short: 'M1', engine: '6 cilindri 3,5 L 24V · motore centrale · 5 marce', hp: 277, kg: 1300, vmax: 262,
    mass: 1375, torque: 330, rpm: 6900, idle: 900, gears: [10.17, 6.77, 4.79, 3.56, 2.96], wheelR: 0.31, wb: 2.56, tw: 0.78, len: 4.36, wid: 2.0, cg: 0.44, CdA: 0.62, mu: 1.1, brake: 17000, drive: 'rwd', lsd: 0.4, paint: null, fixed: true, snd: ['eng-gt', 0.95] },
  camaro: { label: 'CHEVROLET CAMARO SS', year: 1967, short: 'CAMARO', engine: 'V8 5,7 L · 4 marce', hp: 295, kg: 1550, vmax: 200,
    mass: 1625, torque: 515, rpm: 5200, idle: 750, gears: [7.84, 5.85, 4.54, 3.11], wheelR: 0.33, wb: 2.74, tw: 0.76, len: 4.72, wid: 2.0, cg: 0.52, CdA: 0.75, mu: 0.95, brake: 20500, drive: 'rwd', lsd: 0.3, paint: null, fixed: true, snd: ['eng-v8', 0.7] },
  hakosuka: { label: 'NISSAN SKYLINE 2000 GT-R', year: 1971, short: 'GT-R C10', engine: '6 cilindri 2,0 L 24V · 5 marce', hp: 160, kg: 1100, vmax: 200,
    mass: 1175, torque: 177, rpm: 7600, idle: 900, gears: [14.34, 9.01, 6.36, 4.85, 4.13], wheelR: 0.3, wb: 2.57, tw: 0.7, len: 4.4, wid: 1.85, cg: 0.5, CdA: 0.66, mu: 1.0, brake: 14500, drive: 'rwd', lsd: 0.6, paint: null, fixed: true, snd: ['eng-gt', 0.95] },
  diablo2: { label: 'LAMBORGHINI DIABLO SV', year: 1995, short: 'DIABLO', engine: 'V12 5,7 L · motore centrale · 5 marce', hp: 510, kg: 1530, vmax: 320,
    mass: 1605, torque: 580, rpm: 7100, idle: 900, gears: [8.64, 5.68, 4.19, 3.29, 2.65], wheelR: 0.33, wb: 2.65, tw: 0.8, len: 4.47, wid: 2.04, cg: 0.42, CdA: 0.68, mu: 1.2, brake: 20000, drive: 'rwd', lsd: 0.3, paint: null, fixed: true, snd: ['eng-v8', 0.55] },
  m5f90: { label: 'BMW M5 (F90)', year: 2018, short: 'M5', engine: 'V8 4,4 L biturbo · 8 marce · integrale', hp: 600, kg: 1855, vmax: 305,
    mass: 1930, torque: 750, rpm: 7000, idle: 900, gears: [22.75, 14.56, 9.74, 7.83, 5.96, 4.55, 3.73, 2.91], wheelR: 0.35, wb: 2.982, tw: 0.8, len: 4.97, wid: 2.1, cg: 0.48, CdA: 0.7, mu: 1.2, brake: 24000, drive: 'awd', paint: null, fixed: true, snd: ['eng-v8', 0.62] },
  m720s: { label: 'McLAREN 720S', year: 2017, short: '720S', engine: 'V8 4,0 L biturbo · motore centrale · 7 marce', hp: 720, kg: 1283, vmax: 341,
    mass: 1358, torque: 770, rpm: 8000, idle: 900, gears: [16.68, 10.94, 8.0, 6.2, 4.86, 3.81, 2.89], wheelR: 0.34, wb: 2.67, tw: 0.83, len: 4.54, wid: 2.16, cg: 0.4, CdA: 0.66, mu: 1.42, brake: 17000, drive: 'rwd', lsd: 0.1, paint: null, fixed: true, snd: ['eng-v8', 0.62] },
  quattro: { label: 'AUDI QUATTRO', year: 1982, short: 'QUATTRO', engine: '5 cilindri 2,1 L turbo · 5 marce · integrale', hp: 200, kg: 1290, vmax: 222,
    mass: 1365, torque: 285, rpm: 6500, idle: 900, gears: [15.19, 8.98, 6.16, 4.51, 3.29], wheelR: 0.31, wb: 2.524, tw: 0.74, len: 4.4, wid: 1.9, cg: 0.5, CdA: 0.68, mu: 1.05, brake: 17000, drive: 'awd', paint: null, fixed: true, snd: ['eng-gt', 1.05] },
  m190e: { label: 'MERCEDES 190 E 2.5-16 EVOLUTION II', year: 1990, short: '190E EVO II', engine: '4 cilindri 2,5 L 16V · 5 marce', hp: 235, kg: 1340, vmax: 250,
    mass: 1415, torque: 245, rpm: 7700, idle: 900, gears: [16.7, 9.43, 5.97, 4.33, 3.46], wheelR: 0.31, wb: 2.665, tw: 0.74, len: 4.49, wid: 1.9, cg: 0.48, CdA: 0.62, mu: 1.12, brake: 17500, drive: 'rwd', lsd: 0.5, paint: null, fixed: true, snd: ['eng-gt', 1.05] },
  townace: { label: 'TOYOTA TOWNACE GL', year: 2005, short: 'TOWNACE', engine: '4 cilindri 1,8 L · 5 marce · furgone', hp: 85, kg: 1250, vmax: 150,
    mass: 1325, torque: 147, rpm: 5200, idle: 750, gears: [19.34, 10.46, 6.46, 4.49, 3.77], wheelR: 0.3, wb: 2.65, tw: 0.72, len: 4.2, wid: 1.85, cg: 0.7, CdA: 1.15, mu: 0.92, brake: 16500, drive: 'rwd', paint: null, fixed: true, snd: ['eng-gt', 1.2] },
  gt500: { label: 'SHELBY GT500', year: 1967, short: 'GT500', engine: 'V8 7,0 L · 4 marce', hp: 355, kg: 1500, vmax: 220,
    mass: 1575, torque: 570, rpm: 5400, idle: 750, gears: [6.81, 4.96, 3.79, 2.94], wheelR: 0.33, wb: 2.74, tw: 0.76, len: 4.72, wid: 1.95, cg: 0.52, CdA: 0.72, mu: 0.98, brake: 19500, drive: 'rwd', lsd: 0.4, paint: null, fixed: true, snd: ['eng-v8', 0.7] },
  gto250: { label: 'FERRARI 250 GTO', year: 1962, short: '250 GTO', engine: 'V12 3,0 L · 5 marce', hp: 300, kg: 880, vmax: 280,
    mass: 955, torque: 294, rpm: 7500, idle: 900, gears: [8.7, 6.15, 4.6, 3.64, 3.11], wheelR: 0.32, wb: 2.4, tw: 0.7, len: 4.32, wid: 1.8, cg: 0.45, CdA: 0.6, mu: 1.0, brake: 12000, drive: 'rwd', lsd: 0.5, paint: null, fixed: true, snd: ['eng-v8', 0.55] },
  cobra: { label: 'SHELBY COBRA 427', year: 1966, short: 'COBRA', engine: 'V8 7,0 L · 4 marce', hp: 425, kg: 1068, vmax: 260,
    mass: 1143, torque: 651, rpm: 6000, idle: 900, gears: [6.21, 4.52, 3.45, 2.68], wheelR: 0.32, wb: 2.29, tw: 0.74, len: 3.96, wid: 1.85, cg: 0.45, CdA: 0.7, mu: 1.0, brake: 14500, drive: 'rwd', lsd: 0.3, paint: null, fixed: true, snd: ['eng-v8', 0.7] },
  chall: { label: 'DODGE CHALLENGER R/T', year: 1971, short: 'CHALLENGER', engine: 'V8 6,3 L · 4 marce', hp: 300, kg: 1600, vmax: 210,
    mass: 1675, torque: 556, rpm: 5200, idle: 750, gears: [7.54, 5.4, 4.09, 3.05], wheelR: 0.34, wb: 2.79, tw: 0.78, len: 4.86, wid: 2.05, cg: 0.52, CdA: 0.76, mu: 0.95, brake: 21000, drive: 'rwd', lsd: 0.3, paint: null, fixed: true, snd: ['eng-v8', 0.7] },
  isetta: { label: 'BMW ISETTA 300', year: 1956, short: 'ISETTA', engine: '1 cilindro 0,3 L · 4 marce', hp: 13, kg: 360, vmax: 85,
    mass: 435, torque: 18, rpm: 5200, idle: 750, gears: [24.39, 13.86, 8.87, 5.54], wheelR: 0.25, wb: 1.5, tw: 0.6, len: 2.29, wid: 1.45, cg: 0.55, CdA: 0.6, mu: 0.85, brake: 5500, drive: 'rwd', paint: null, fixed: true, snd: ['eng-gt', 1.45] },
  s22b: { label: 'SUBARU IMPREZA 22B STI', year: 1998, short: '22B', engine: 'Boxer 4 cilindri 2,2 L turbo · 5 marce · integrale', hp: 280, kg: 1270, vmax: 248,
    mass: 1345, torque: 363, rpm: 7000, idle: 900, gears: [11.85, 7.93, 5.94, 4.43, 3.17], wheelR: 0.31, wb: 2.52, tw: 0.76, len: 4.37, wid: 1.95, cg: 0.48, CdA: 0.66, mu: 1.15, brake: 17000, drive: 'awd', paint: null, snd: ['eng-gt', 1.05] },
  slr: { label: 'MERCEDES SLR McLAREN 722', year: 2006, short: 'SLR 722', engine: 'V8 5,4 L compressore · 5 marce', hp: 650, kg: 1724, vmax: 337,
    mass: 1799, torque: 820, rpm: 6500, idle: 900, gears: [10.28, 6.27, 4.04, 2.86, 2.38], wheelR: 0.34, wb: 2.7, tw: 0.82, len: 4.66, wid: 2.1, cg: 0.42, CdA: 0.7, mu: 1.2, brake: 22500, drive: 'rwd', lsd: 0.1, paint: null, fixed: true, snd: ['eng-v8', 0.62] },
  nsx: { label: 'HONDA NSX-R', year: 2002, short: 'NSX-R', engine: 'V6 3,2 L VTEC · motore centrale · 6 marce', hp: 280, kg: 1270, vmax: 270,
    mass: 1345, torque: 304, rpm: 8000, idle: 900, gears: [13.03, 8.32, 6.07, 4.92, 4.12, 3.44], wheelR: 0.32, wb: 2.53, tw: 0.76, len: 4.43, wid: 1.95, cg: 0.42, CdA: 0.62, mu: 1.15, brake: 17000, drive: 'rwd', lsd: 0.5, paint: null, fixed: true, snd: ['eng-gt', 0.95] },
  p918: { label: 'PORSCHE 918 SPYDER', year: 2015, short: '918', engine: 'V8 4,6 L ibrida · motore centrale · 7 marce · integrale', hp: 887, kg: 1674, vmax: 345,
    mass: 1749, torque: 1280, rpm: 9000, idle: 900, gears: [18.23, 10.95, 7.78, 6.01, 4.89, 4.1, 3.31], wheelR: 0.35, wb: 2.73, tw: 0.84, len: 4.64, wid: 2.15, cg: 0.4, CdA: 0.68, mu: 1.3, brake: 22000, drive: 'awd', paint: null, fixed: true, snd: ['eng-v8', 0.62] },
  charger: { label: 'DODGE CHARGER R/T', year: 1969, short: 'CHARGER', engine: 'V8 7,2 L · 4 marce', hp: 375, kg: 1700, vmax: 220,
    mass: 1775, torque: 597, rpm: 5000, idle: 750, gears: [6.16, 4.59, 3.59, 2.8], wheelR: 0.34, wb: 2.97, tw: 0.78, len: 5.28, wid: 2.05, cg: 0.52, CdA: 0.8, mu: 0.95, brake: 22000, drive: 'rwd', lsd: 0.3, paint: null, fixed: true, snd: ['eng-v8', 0.7] },
  golf1: { label: 'VOLKSWAGEN GOLF GTI MK1', year: 1976, short: 'GOLF MK1', engine: '4 cilindri 1,6 L · 4 marce', hp: 110, kg: 810, vmax: 182,
    mass: 885, torque: 137, rpm: 6100, idle: 900, gears: [11.39, 7.0, 4.76, 3.4], wheelR: 0.28, wb: 2.4, tw: 0.7, len: 3.71, wid: 1.75, cg: 0.5, CdA: 0.6, mu: 1.0, brake: 11000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.2] },
  beetle: { label: 'VOLKSWAGEN MAGGIOLINO', year: 1968, short: 'MAGGIOLINO', engine: 'Boxer 4 cilindri 1,5 L · motore posteriore · 4 marce', hp: 53, kg: 840, vmax: 125,
    mass: 915, torque: 106, rpm: 4200, idle: 750, gears: [14.93, 8.09, 4.95, 3.65], wheelR: 0.3, wb: 2.4, tw: 0.66, len: 4.08, wid: 1.7, cg: 0.52, CdA: 0.72, mu: 0.92, brake: 11500, drive: 'rwd', paint: null, snd: ['eng-gt', 1.2] },
  express: { label: 'CHEVROLET EXPRESS VAN', year: 2003, short: 'EXPRESS', engine: 'V8 5,3 L · 4 marce · furgone', hp: 285, kg: 2500, vmax: 170,
    mass: 2575, torque: 441, rpm: 5200, idle: 750, gears: [18.42, 9.81, 6.02, 4.21], wheelR: 0.38, wb: 3.43, tw: 0.86, len: 5.69, wid: 2.1, cg: 0.85, CdA: 1.6, mu: 0.92, brake: 32000, drive: 'rwd', paint: null, snd: ['eng-v8', 0.7] },
  golf2: { label: 'VOLKSWAGEN GOLF GTI MK2', year: 1987, short: 'GOLF MK2', engine: '4 cilindri 1,8 L 16V · 5 marce', hp: 139, kg: 960, vmax: 208,
    mass: 1035, torque: 168, rpm: 6500, idle: 900, gears: [12.45, 7.65, 5.2, 4.08, 3.29], wheelR: 0.29, wb: 2.475, tw: 0.72, len: 3.99, wid: 1.85, cg: 0.5, CdA: 0.64, mu: 1.02, brake: 13000, drive: 'fwd', paint: null, snd: ['eng-gt', 1.2] },
  e320: { label: 'MERCEDES E 320 4MATIC (W210)', year: 2001, short: 'E 320', engine: 'V6 3,2 L · 5 marce · integrale', hp: 224, kg: 1650, vmax: 235,
    mass: 1725, torque: 315, rpm: 6000, idle: 900, gears: [12.81, 7.81, 5.03, 3.57, 2.96], wheelR: 0.32, wb: 2.833, tw: 0.76, len: 4.82, wid: 2.0, cg: 0.52, CdA: 0.65, mu: 1.0, brake: 21500, drive: 'awd', paint: null, snd: ['eng-gt', 0.95] },
  gtv6: { label: 'ALFA ROMEO GTV6', year: 1986, short: 'GTV6', engine: 'V6 2,5 L Busso · 5 marce', hp: 160, kg: 1210, vmax: 205,
    mass: 1285, torque: 213, rpm: 6300, idle: 900, gears: [14.09, 7.89, 5.48, 4.15, 3.34], wheelR: 0.3, wb: 2.4, tw: 0.7, len: 4.26, wid: 1.85, cg: 0.5, CdA: 0.66, mu: 1.02, brake: 16000, drive: 'rwd', lsd: 0.4, paint: null, snd: ['eng-gt', 0.95] },
};
// fisica completa di una stradale dai suoi dati
function roadSpec(d) {
  const a = d.wb / 2, hw = d.wid / 2 - 0.08, L2 = d.len / 2, m = d.mass;
  return {
    label: d.label,
    geom: { axleF: a, axleR: -a, halfTrack: d.tw, wheelR: d.wheelR, cgHeight: d.cg },
    car: { mass: m, ClA: 0.05, CdA: d.CdA, mu: d.mu, torque: d.torque * 0.86, brake: d.brake },     // (coppia al banco: alle ruote arriva meno, cambi di marcia compresi)
    inertia: { Iz: m * (d.len * d.len + d.wid * d.wid) / 12 * 1.15, Ipitch: m * d.len * d.len / 14, Iroll: m * 0.33 },
    susp: { springK: 60 * m + 15000, damperC: 3.8 * m + 1000, arbK: [45 * m + 5000, 20 * m] },
    steer: 0.88,
    heat: { slide: 30000, roll: 0.07 },
    // auto di serie: radiatore fatto per andare piano a lungo (il calcolo del gioco è da auto da corsa)
    engHeat: 0.3,
    gears: d.gears, rpm: d.rpm, idle: d.idle, ...(d.ev ? { ev: d.ev } : {}),
    ...(d.drive === 'fwd' ? { fwd: true, lsd: 0.25 } : d.drive === 'awd' ? { awd: true, lsd: 0.8 } : { lsd: d.lsd ?? 0.4 }),
    hull: [
      [L2 - 0.06, -hw + 0.08, 'fwL'], [L2 - 0.06, hw - 0.08, 'fwR'], [L2, 0, 'nose'],
      [a, -hw, 'wFL'], [a, hw, 'wFR'], [0, -hw, 'sideL'], [0, hw, 'sideR'], [-a, -hw, 'wRL'], [-a, hw, 'wRR'],
      [-L2 + 0.05, -hw + 0.08, 'rw'], [-L2 + 0.05, hw - 0.08, 'rw'],
    ],
    circles: [[Math.min(a, L2 - hw), hw], [0, hw], [-Math.min(a, L2 - hw), hw]],
    ai: { hazard: [9, 3, 0.0008], follow: 16, pit: 12 },
    dirtyAir: 0.02,
  };
}
for (const k of ROAD_NEW) SPECS[k] = roadSpec(ROAD_DB[k]);

export const SPEC = SPECS[cls];
// tutte le categorie (gara WEC: Hypercar e GT3 nella stessa gara, ognuna con la sua fisica)
export { SPECS };
