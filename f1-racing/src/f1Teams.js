import * as THREE from 'three';
import { MAPS, RANGE, SIZE } from './f1LiveryMaps.js?v=fd629fc2';
import { CAR_CLASS } from './vehicle.js?v=156';
import { PUBLIC, PUB_TEAMS } from './edition.js?v=f01fe25a';

// Scuderie e piloti della stagione 2026 di Formula 1, con le livree dipinte sulla RB22.
// Ogni livrea è una funzione del punto della vettura (posizione e normale): così i colori
// stanno nelle zone giuste (muso, pance, cofano motore, presa d'aria, ali) come sulle vere.
// Colori, forme e i nomi degli sponsor principali (solo testo, come scritte sulle pance e sull'ala).
//
// Coordinate del modello: x laterale (+ = sinistra), y in alto (da terra), z in avanti
// (muso a +2,9 m, coda a -2,4 m). s = 'body' (carrozzeria) oppure 'wing' (ali e alette).

const hex = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };   // lineari
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const band = (v, c, w) => Math.abs(v - c) < w;
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// zone utili
const isTop = p => p.ny > 0.5;
const sidepod = p => p.ax > 0.36 && p.z > -1.3 && p.z < 0.85 && p.y < 0.75;
const engineCover = p => p.ax < 0.42 && p.y > 0.6 && p.z < 0.15 && p.z > -1.9;
const airbox = p => p.y > 0.9 && p.ax < 0.25 && p.z > -0.5 && p.z < 0.4;
const nose = p => p.z > 1.55;
const lower = (p, h = 0.24) => p.y < h;
const frontWing = p => p.s === 'wing' && p.z > 1.9;
const rearWing = p => p.s === 'wing' && p.z < -1.6;
const endplate = p => p.ax > 0.78;

export const TEAMS_2026 = [
  {
    id: 'redbull', name: 'Red Bull Racing', car: 'RB22', drivers: ['VERSTAPPEN', 'HADJAR'], tier: 2,
    colors: ['#1b2a5a', '#ff8a1c', '#d6202a'], original: true, gloss: true,
  },
  {
    id: 'mclaren', name: 'McLaren', car: 'MCL40', drivers: ['NORRIS', 'PIASTRI'], tier: 3,
    colors: ['#ff8000', '#2e3033', '#33c1b0'],
    decals: [{ at: 'side', text: 'Mastercard', color: '#2b2d31', y: [0.36, 0.58] }, { at: 'wing', text: 'MASTERCARD', color: '#ff8000' }],
    paint(p) {
      const P = hex('#ff8000'), K = hex('#2b2d31'), T = hex('#2ec4b6');
      if (frontWing(p)) return endplate(p) || p.y < 0.13 ? K : P;
      if (rearWing(p)) return p.y > 0.86 && !endplate(p) ? P : K;
      const edge = 0.36 + (p.z < -0.6 ? (p.z + 0.6) * 0.1 : 0);
      if (band(p.y, edge, 0.012) && !isTop(p)) return T;              // filetto verde acqua
      if (p.y < edge && !(nose(p) && p.y > 0.2)) return K;            // parte bassa antracite
      if (airbox(p)) return K;
      return P;
    },
  },
  {
    id: 'ferrari', name: 'Ferrari', car: 'SF-26', drivers: ['LECLERC', 'HAMILTON'], tier: 3, gloss: true,
    colors: ['#e8001c', '#f4f4f2', '#111111'],
    decals: [{ at: 'side', text: 'HP', color: '#f4f4f2', y: [0.34, 0.6], font: '900' }, { at: 'wing', text: 'Scuderia Ferrari HP', color: '#f4f4f2' }],
    paint(p) {
      const R = hex('#e8001c'), W = hex('#f4f4f2'), K = hex('#141414');
      if (frontWing(p)) return p.y < 0.12 ? K : (endplate(p) ? R : R);
      if (rearWing(p)) return endplate(p) ? K : (p.y > 0.9 ? W : R);
      // bianco attorno all'abitacolo, sul cofano motore e sulla presa d'aria (312T)
      if (airbox(p)) return W;
      if (p.y > 0.64 && p.z > -1.5 && p.z < 0.95 && p.ax < 0.34 + (p.y - 0.64) * 0.6) return W;
      if (lower(p, 0.2)) return K;
      return R;
    },
  },
  {
    id: 'mercedes', name: 'Mercedes', car: 'W17', drivers: ['RUSSELL', 'ANTONELLI'], tier: 3,
    colors: ['#0b0b0d', '#c6cbd1', '#00d7b6'],
    decals: [{ at: 'side', text: 'PETRONAS', color: '#00d7b6', y: [0.38, 0.56] }, { at: 'wing', text: 'PETRONAS', color: '#c6cbd1' }],
    paint(p) {
      const K = hex('#0c0c0e'), S = hex('#c4c9cf'), T = hex('#00d2b4');
      if (frontWing(p)) return endplate(p) ? T : (p.y > 0.2 ? S : K);
      if (rearWing(p)) return band(p.y, 0.92, 0.015) ? T : K;
      // muso e parte anteriore argento che sfuma nel nero
      if (p.z > 0.9 && p.ny > 0.15 && p.y > 0.2) return mix(K, S, sstep(0.9, 1.6, p.z));
      // strisce "zebra" argento sopra le pance
      if (sidepod(p) && p.ny > 0.35) return ((Math.floor(p.z * 9 - p.ax * 3) % 2) + 2) % 2 ? S : K;
      if (band(p.z, 0.9, 0.02) && p.ny > 0.2) return T;
      if (engineCover(p) && band(p.x, 0, 0.025)) return S;
      return K;
    },
  },
  {
    id: 'aston', name: 'Aston Martin', car: 'AMR26', drivers: ['ALONSO', 'STROLL'], tier: 1,
    colors: ['#00594f', '#cedc00', '#8bc9e8'],
    decals: [{ at: 'side', text: 'aramco', color: '#ffffff', y: [0.36, 0.58] }, { at: 'wing', text: 'ARAMCO', color: '#cedc00' }],
    paint(p) {
      const G = hex('#005a4e'), L = hex('#cedc00'), D = hex('#0c2e29'), B = hex('#8bc9e8');
      if (rearWing(p)) return endplate(p) ? G : B;                   // ala posteriore azzurra
      if (frontWing(p)) return band(p.y, 0.16, 0.02) ? L : G;
      if (airbox(p) || (engineCover(p) && p.y > 0.85)) return D;     // presa d'aria più scura
      // filetto lime in diagonale sulle pance
      if (sidepod(p) && band(p.z + (p.y - 0.4) * 1.4, 0.15, 0.05)) return L;
      if (lower(p, 0.2)) return D;
      return G;
    },
  },
  {
    id: 'alpine', name: 'Alpine', car: 'A526', drivers: ['GASLY', 'COLAPINTO'], tier: 0,
    colors: ['#0078c1', '#fd4bc7', '#0e0e14'],
    decals: [{ at: 'side', text: 'BWT', color: '#ffffff', y: [0.34, 0.6], font: '900' }, { at: 'wing', text: 'BWT ALPINE', color: '#fd4bc7' }],
    paint(p) {
      const Bl = hex('#0078c1'), Pk = hex('#fd4bc7'), K = hex('#0e0e14');
      if (frontWing(p)) return endplate(p) ? Pk : (p.y < 0.12 ? K : Bl);
      if (rearWing(p)) return endplate(p) ? K : Pk;
      if (lower(p, 0.2)) return K;
      // blu davanti, rosa dietro, con un taglio obliquo sfumato
      const t = sstep(0.25, -0.35, p.z + (p.y - 0.4) * 0.8);
      return mix(Bl, Pk, t);
    },
  },
  {
    id: 'williams', name: 'Williams', car: 'FW48', drivers: ['ALBON', 'SAINZ'], tier: 1,
    colors: ['#00205b', '#00a3e0', '#ffffff'],
    decals: [{ at: 'side', text: 'ATLASSIAN', color: '#ffffff', y: [0.38, 0.56] }, { at: 'wing', text: 'ATLASSIAN', color: '#00a3e0' }],
    paint(p) {
      const N = hex('#062a6e'), Lb = hex('#00a3e0'), W = hex('#f5f7fa');
      if (p.s === 'wing') return endplate(p) ? N : W;               // ali bianche
      if (engineCover(p) || airbox(p)) return W;                     // cofano motore bianco
      if (sidepod(p) && p.y > 0.22) return Lb;                      // pance azzurre (Barclays)
      return N;
    },
  },
  {
    id: 'rb', name: 'Racing Bulls', car: 'VCARB 03', drivers: ['LAWSON', 'LINDBLAD'], tier: 1,
    colors: ['#f5f6f8', '#1d4dd8', '#e1062c'],
    decals: [{ at: 'side', text: 'VISA', color: '#1d4dd8', y: [0.36, 0.58], font: '900' }, { at: 'wing', text: 'CASH APP', color: '#1d4dd8' }],
    paint(p) {
      const W = hex('#f4f5f7'), Bl = hex('#1d4dd8'), R = hex('#e1062c');
      if (rearWing(p)) return endplate(p) ? W : Bl;
      if (frontWing(p)) return endplate(p) ? Bl : W;
      // onda blu che segue la vettura dal muso alle pance, con filetto rosso
      const curve = 0.3 + (p.z + 1) * 0.08;
      if (band(p.y, curve + 0.035, 0.012)) return R;
      if (p.y < curve || p.z > 2.4) return Bl;
      return W;
    },
  },
  {
    id: 'audi', name: 'Audi', car: 'R26', drivers: ['HULKENBERG', 'BORTOLETO'], tier: 0,
    colors: ['#c3c9cf', '#121212', '#f50537'],
    decals: [{ at: 'side', text: 'Revolut', color: '#121212', y: [0.36, 0.58] }, { at: 'wing', text: 'AUDI', color: '#f50537' }],
    paint(p) {
      const Ti = hex('#bfc5cc'), K = hex('#121212'), R = hex('#f50537');
      if (rearWing(p)) return endplate(p) ? R : K;
      if (frontWing(p)) return endplate(p) ? K : Ti;
      if (airbox(p)) return R;
      if (sidepod(p) && p.z > 0.3 && p.z < 0.8) return R;           // bocche delle pance rosse
      // titanio davanti, nero dietro, separati da un taglio geometrico
      return p.z + p.y * 0.5 > 0.1 ? Ti : K;
    },
  },
  {
    id: 'haas', name: 'Haas', car: 'VF-26', drivers: ['OCON', 'BEARMAN'], tier: 0,
    colors: ['#f7f7f7', '#e6002b', '#111111'],
    decals: [{ at: 'side', text: 'TOYOTA GAZOO RACING', color: '#e6002b', y: [0.38, 0.55] }, { at: 'wing', text: 'HAAS', color: '#e6002b' }],
    paint(p) {
      const W = hex('#f7f7f7'), R = hex('#e6002b'), K = hex('#111111');
      if (rearWing(p)) return band(p.y, 0.9, 0.02) ? R : K;
      if (frontWing(p)) return endplate(p) ? R : (p.y < 0.13 ? K : W);
      if (airbox(p) || (nose(p) && p.z > 2.5)) return R;
      if (sidepod(p) && band(p.y - p.z * 0.12, 0.42, 0.035)) return R; // freccia rossa
      if (lower(p, 0.3) || (engineCover(p) && p.z < -1.0)) return K;
      return W;
    },
  },
  {
    id: 'cadillac', name: 'Cadillac', car: 'MAC-26', drivers: ['PEREZ', 'BOTTAS'], tier: 0,
    colors: ['#e9eaec', '#0e0e10', '#b59a5b'],
    decals: [{ at: 'side', text: 'CADILLAC', color: '#0e0e10', y: [0.38, 0.56] }, { at: 'wing', text: 'CADILLAC', color: '#b59a5b' }],
    paint(p) {
      // due lati: grigio-bianco a sinistra, nero a destra, filetto oro al centro
      const W = hex('#e6e7e9'), K = hex('#0e0e10'), Au = hex('#b59a5b');
      if (band(p.x, 0, 0.018) && p.ny > 0.2) return Au;
      return p.x > 0 ? W : K;
    },
  },
];

// ------------------------------------------------------------------ MACCHINE SPECIALI: stagione 2006
// Gara "anni 2000": tutti guidano la stessa monoposto d'epoca (Renault R26) con i colori delle
// squadre del 2006 (colori semplici, senza marchi di sigarette).
const r06 = (b, top, side, wing, extra = {}) => p => {
  const B = hex(b), T = hex(top), S = hex(side), Wg = hex(wing);
  if (frontWing(p)) return endplate(p) ? S : Wg;
  if (rearWing(p)) return endplate(p) ? B : (p.y > 0.9 ? Wg : B);
  if (extra.nose && nose(p) && p.ny > 0.2) return hex(extra.nose);
  if (airbox(p)) return T;
  if (sidepod(p) && p.y > 0.24 && p.ny < 0.6) return S;
  if (engineCover(p)) return T;
  if (lower(p, 0.18)) return extra.low ? hex(extra.low) : B;
  return B;
};
export const TEAMS_2006 = [
  {
    id: 'r06_renault', name: 'Renault', car: 'R26 · 2006', drivers: ['ALONSO', 'FISICHELLA'], numbers: [1, 2], tier: 3, gloss: true,
    colors: ['#0a3a8c', '#ffd400', '#3fa9f5'],
    decals: [{ at: 'side', text: 'RENAULT', color: '#ffffff', y: [0.36, 0.58] }, { at: 'wing', text: 'RENAULT', color: '#ffd400' }],
    paint(p) {
      // blu Renault, muso e fianchi gialli, pance e cofano azzurri
      const B = hex('#0b3d91'), Y = hex('#ffd400'), Az = hex('#3fa9f5');
      if (frontWing(p)) return endplate(p) ? Y : B;
      if (rearWing(p)) return endplate(p) ? Y : (p.y > 0.9 ? B : Y);
      if (nose(p) && p.y > 0.18) return p.ny > 0.35 ? Y : B;
      if (airbox(p)) return Y;
      if (sidepod(p) && p.y > 0.24 && p.ny < 0.6) return Az;
      if (sidepod(p) && p.ny >= 0.6) return Y;
      if (engineCover(p)) return p.ax < 0.12 ? Y : Az;
      if (lower(p, 0.2)) return B;
      return B;
    },
  },
  { id: 'r06_ferrari', r26: ['#d40000', '#151515', '#f2f2f2'], name: 'Ferrari', car: '248 F1', drivers: ['SCHUMACHER', 'MASSA'], numbers: [5, 6], tier: 3, gloss: true,
    colors: ['#d40000', '#ffffff', '#111111'], decals: [{ at: 'side', text: 'FERRARI', color: '#ffffff', y: [0.36, 0.58] }],
    paint: r06('#d40000', '#d40000', '#d40000', '#d40000', { low: '#151515' }) },
  { id: 'r06_mclaren', r26: ['#c3c7cc', '#1a1a1c', '#e10600'], name: 'McLaren', car: 'MP4-21', drivers: ['RAIKKONEN', 'MONTOYA'], numbers: [3, 4], tier: 3, gloss: true,
    colors: ['#c3c7cc', '#e10600', '#151515'], decals: [{ at: 'side', text: 'McLaren', color: '#e10600', y: [0.36, 0.58] }],
    paint: r06('#c3c7cc', '#c3c7cc', '#1a1a1c', '#c3c7cc', { nose: '#c3c7cc', low: '#1a1a1c' }) },
  { id: 'r06_honda', r26: ['#f2f2f2', '#151515', '#d40000'], name: 'Honda', car: 'RA106', drivers: ['BUTTON', 'BARRICHELLO'], numbers: [12, 11], tier: 2,
    colors: ['#f2f2f2', '#d40000', '#151515'], decals: [{ at: 'side', text: 'HONDA', color: '#d40000', y: [0.36, 0.58] }],
    paint: r06('#f2f2f2', '#151515', '#f2f2f2', '#f2f2f2', { low: '#151515' }) },
  { id: 'r06_toyota', r26: ['#f2f2f2', '#cc0a1e', '#cc0a1e'], name: 'Toyota', car: 'TF106', drivers: ['R. SCHUMACHER', 'TRULLI'], numbers: [7, 8], tier: 2,
    colors: ['#f2f2f2', '#cc0a1e', '#111111'], decals: [{ at: 'side', text: 'TOYOTA', color: '#cc0a1e', y: [0.36, 0.58] }],
    paint: r06('#f2f2f2', '#cc0a1e', '#cc0a1e', '#f2f2f2', { nose: '#f2f2f2' }) },
  { id: 'r06_bmw', r26: ['#f2f2f2', '#1c4fa0', '#c8102e'], name: 'BMW Sauber', car: 'F1.06', drivers: ['HEIDFELD', 'KUBICA'], numbers: [16, 17], tier: 2,
    colors: ['#f2f2f2', '#1c4fa0', '#c8102e'], decals: [{ at: 'side', text: 'BMW', color: '#1c4fa0', y: [0.36, 0.58] }],
    paint: r06('#1c4fa0', '#f2f2f2', '#f2f2f2', '#1c4fa0', { nose: '#f2f2f2' }) },
  { id: 'r06_williams', r26: ['#f2f2f2', '#0b1f5c', '#3a8ddb'], name: 'Williams', car: 'FW28', drivers: ['WEBBER', 'ROSBERG'], numbers: [9, 10], tier: 1,
    colors: ['#0b1f5c', '#ffffff', '#3a8ddb'], decals: [{ at: 'side', text: 'WILLIAMS', color: '#0b1f5c', y: [0.36, 0.58] }],
    paint: r06('#0b1f5c', '#f2f2f2', '#f2f2f2', '#0b1f5c', { nose: '#f2f2f2' }) },
  { id: 'r06_redbull', r26: ['#1b2a6a', '#101838', '#ffcc00'], name: 'Red Bull', car: 'RB2', drivers: ['COULTHARD', 'KLIEN'], numbers: [14, 15], tier: 1,
    colors: ['#14215a', '#d6202a', '#ffcc00'], decals: [{ at: 'side', text: 'Red Bull', color: '#d6202a', y: [0.36, 0.58] }],
    paint: r06('#14215a', '#14215a', '#14215a', '#14215a', { nose: '#ffcc00' }) },
  { id: 'r06_tororosso', r26: ['#14215a', '#0d1430', '#c8102e'], name: 'Toro Rosso', car: 'STR1', drivers: ['LIUZZI', 'SPEED'], numbers: [20, 21], tier: 0,
    colors: ['#14215a', '#c8102e', '#ffcc00'], decals: [{ at: 'side', text: 'TORO ROSSO', color: '#c8102e', y: [0.36, 0.58] }],
    paint: r06('#14215a', '#c8102e', '#14215a', '#14215a') },
  { id: 'r06_midland', r26: ['#c8102e', '#1a1a1a', '#e8e8e8'], name: 'Midland', car: 'M16', drivers: ['MONTEIRO', 'ALBERS'], numbers: [18, 19], tier: 0,
    colors: ['#c8102e', '#e8e8e8', '#111111'], decals: [{ at: 'side', text: 'MIDLAND', color: '#ffffff', y: [0.36, 0.58] }],
    paint: r06('#c8102e', '#e8e8e8', '#c8102e', '#e8e8e8', { low: '#1a1a1a' }) },
  { id: 'r06_aguri', r26: ['#f2f2f2', '#c8102e', '#c8102e'], name: 'Super Aguri', car: 'SA06', drivers: ['SATO', 'IDE'], numbers: [22, 23], tier: 0,
    colors: ['#f2f2f2', '#c8102e', '#111111'], decals: [{ at: 'side', text: 'SUPER AGURI', color: '#c8102e', y: [0.36, 0.58] }],
    paint: r06('#f2f2f2', '#c8102e', '#f2f2f2', '#f2f2f2', { low: '#c8102e' }) },
];

// Stagione 1989 (macchine speciali): la McLaren MP4/5 vera; le altre squadre sono i loro colori
// sulla stessa carrozzeria (mp45: [al posto del rosso, al posto del bianco]). Solo colori, niente sponsor.
const t89 = (id, name, car, drivers, numbers, tier, mp45, colors) => ({ id, name, car, drivers, numbers, tier, mp45, colors, gloss: true });
export const TEAMS_1989 = [
  { id: 'm89_mclaren', name: 'McLaren', car: 'MP4/5 · 1989', drivers: ['SENNA', 'PROST'], numbers: [1, 2], tier: 3, gloss: true, colors: ['#e10600', '#f2f2f2', '#151515'] },
  t89('m89_ferrari', 'Ferrari', '640', ['MANSELL', 'BERGER'], [27, 28], 3, ['#c80000', '#d40000'], ['#d40000', '#f2f2f2', '#151515']),
  t89('m89_williams', 'Williams', 'FW12C', ['BOUTSEN', 'PATRESE'], [5, 6], 2, ['#0b2a7a', '#f2f2f2'], ['#f2f2f2', '#0b2a7a', '#ffd200']),
  t89('m89_benetton', 'Benetton', 'B189', ['NANNINI', 'HERBERT'], [19, 20], 2, ['#00843d', '#ffd200'], ['#00843d', '#ffd200', '#1c3f94']),
  t89('m89_lotus', 'Lotus', '101', ['PIQUET', 'NAKAJIMA'], [11, 12], 1, ['#1c3f94', '#ffd200'], ['#ffd200', '#1c3f94', '#151515']),
  t89('m89_tyrrell', 'Tyrrell', '018', ['ALESI', 'PALMER'], [4, 3], 1, ['#0b1f5c', '#f2f2f2'], ['#0b1f5c', '#f2f2f2', '#3a8ddb']),
  t89('m89_arrows', 'Arrows', 'A11', ['WARWICK', 'CHEEVER'], [9, 10], 1, ['#e85d04', '#f2f2f2'], ['#f2f2f2', '#e85d04', '#151515']),
  t89('m89_leyton', 'Leyton House', 'CG891', ['CAPELLI', 'GUGELMIN'], [16, 15], 1, ['#1f9fb4', '#2ab7c9'], ['#2ab7c9', '#151515', '#f2f2f2']),
  t89('m89_brabham', 'Brabham', 'BT58', ['BRUNDLE', 'MODENA'], [7, 8], 0, ['#1c4fa0', '#f2f2f2'], ['#f2f2f2', '#1c4fa0', '#151515']),
  t89('m89_minardi', 'Minardi', 'M189', ['MARTINI', 'SALA'], [23, 24], 0, ['#151515', '#ffd200'], ['#ffd200', '#151515', '#f2f2f2']),
];

// Stagioni 2002, 2004 e 2012 (Ferrari F2002, Ferrari F2004, Red Bull RB8). Le altre squadre sono la stessa
// carrozzeria ridipinta: recolor = { colore della livrea originale: colore nuovo } (rosso, bianco, blu, giallo)
const tc = (id, name, car, drivers, numbers, tier, recolor, colors) => ({ id, name, car, drivers, numbers, tier, recolor, colors, gloss: true });
export const TEAMS_2002 = [
  { id: 'f02_ferrari', name: 'Ferrari', car: 'F2002 · 2002', drivers: ['M. SCHUMACHER', 'BARRICHELLO'], numbers: [1, 2], tier: 3, gloss: true, colors: ['#d40000', '#f2f2f2', '#151515'] },
  tc('f02_williams', 'Williams', 'FW24', ['R. SCHUMACHER', 'MONTOYA'], [5, 6], 3, { red: '#f2f2f2', white: '#0b2a7a' }, ['#f2f2f2', '#0b2a7a', '#3a8ddb']),
  tc('f02_mclaren', 'McLaren', 'MP4-17', ['COULTHARD', 'RAIKKONEN'], [3, 4], 3, { red: '#b8bcc2', white: '#e10600' }, ['#b8bcc2', '#151515', '#e10600']),
  tc('f02_renault', 'Renault', 'R202', ['TRULLI', 'BUTTON'], [14, 15], 2, { red: '#3fa9f5', white: '#ffd400' }, ['#3fa9f5', '#ffd400', '#0b3d91']),
  tc('f02_sauber', 'Sauber', 'C21', ['HEIDFELD', 'MASSA'], [7, 8], 2, { red: '#1b3f8f', white: '#7fc9e8' }, ['#1b3f8f', '#7fc9e8', '#f2f2f2']),
  tc('f02_jordan', 'Jordan', 'EJ12', ['FISICHELLA', 'SATO'], [9, 10], 1, { red: '#ffd200', white: '#151515' }, ['#ffd200', '#151515', '#f2f2f2']),
  tc('f02_bar', 'BAR', '004', ['VILLENEUVE', 'PANIS'], [11, 12], 1, { red: '#f2f2f2', white: '#d40000' }, ['#f2f2f2', '#d40000', '#151515']),
  tc('f02_jaguar', 'Jaguar', 'R3', ['IRVINE', 'DE LA ROSA'], [16, 17], 1, { red: '#0a5c36', white: '#f2f2f2' }, ['#0a5c36', '#f2f2f2', '#151515']),
  tc('f02_toyota', 'Toyota', 'TF102', ['SALO', 'McNISH'], [24, 25], 1, { red: '#f2f2f2', white: '#cc0a1e' }, ['#f2f2f2', '#cc0a1e', '#151515']),
  tc('f02_minardi', 'Minardi', 'PS02', ['WEBBER', 'YOONG'], [23, 22], 0, { red: '#151515', white: '#f2f2f2' }, ['#151515', '#f2f2f2', '#ffd200']),
];
export const TEAMS_2004 = [
  { id: 'f04_ferrari', name: 'Ferrari', car: 'F2004 · 2004', drivers: ['M. SCHUMACHER', 'BARRICHELLO'], numbers: [1, 2], tier: 3, gloss: true, colors: ['#d40000', '#f2f2f2', '#151515'] },
  tc('f04_bar', 'BAR', '006', ['BUTTON', 'SATO'], [9, 10], 3, { red: '#f2f2f2', white: '#d40000' }, ['#f2f2f2', '#d40000', '#151515']),
  tc('f04_renault', 'Renault', 'R24', ['TRULLI', 'ALONSO'], [7, 8], 3, { red: '#0b3d91', white: '#ffd400' }, ['#0b3d91', '#ffd400', '#3fa9f5']),
  tc('f04_williams', 'Williams', 'FW26', ['R. SCHUMACHER', 'MONTOYA'], [3, 4], 2, { red: '#f2f2f2', white: '#0b2a7a' }, ['#f2f2f2', '#0b2a7a', '#3a8ddb']),
  tc('f04_mclaren', 'McLaren', 'MP4-19', ['COULTHARD', 'RAIKKONEN'], [5, 6], 2, { red: '#b8bcc2', white: '#151515' }, ['#b8bcc2', '#151515', '#e10600']),
  tc('f04_sauber', 'Sauber', 'C23', ['FISICHELLA', 'MASSA'], [11, 12], 1, { red: '#1b3f8f', white: '#7fc9e8' }, ['#1b3f8f', '#7fc9e8', '#f2f2f2']),
  tc('f04_jaguar', 'Jaguar', 'R5', ['WEBBER', 'KLIEN'], [14, 15], 1, { red: '#0a5c36', white: '#f2f2f2' }, ['#0a5c36', '#f2f2f2', '#151515']),
  tc('f04_toyota', 'Toyota', 'TF104', ['PANIS', 'DA MATTA'], [16, 17], 1, { red: '#f2f2f2', white: '#cc0a1e' }, ['#f2f2f2', '#cc0a1e', '#151515']),
  tc('f04_jordan', 'Jordan', 'EJ14', ['HEIDFELD', 'PANTANO'], [18, 19], 0, { red: '#ffd200', white: '#151515' }, ['#ffd200', '#151515', '#f2f2f2']),
  tc('f04_minardi', 'Minardi', 'PS04B', ['BAUMGARTNER', 'BRUNI'], [20, 21], 0, { red: '#151515', white: '#f2f2f2' }, ['#151515', '#f2f2f2', '#ffd200']),
];
export const TEAMS_2012 = [
  { id: 'r12_redbull', name: 'Red Bull', car: 'RB8 · 2012', drivers: ['VETTEL', 'WEBBER'], numbers: [1, 2], tier: 3, gloss: true, colors: ['#1b2448', '#d6202a', '#ffcc00'] },
  tc('r12_mclaren', 'McLaren', 'MP4-27', ['BUTTON', 'HAMILTON'], [3, 4], 3, { navy: '#9aa0a8', red: '#e10600', yellow: '#e10600' }, ['#9aa0a8', '#e10600', '#151515']),
  tc('r12_ferrari', 'Ferrari', 'F2012', ['ALONSO', 'MASSA'], [5, 6], 3, { navy: '#c80000', red: '#f2f2f2', yellow: '#ffd200' }, ['#c80000', '#f2f2f2', '#151515']),
  tc('r12_mercedes', 'Mercedes', 'W03', ['M. SCHUMACHER', 'ROSBERG'], [7, 8], 2, { navy: '#a7adb4', red: '#00a19c', yellow: '#00a19c' }, ['#a7adb4', '#00a19c', '#151515']),
  tc('r12_lotus', 'Lotus', 'E20', ['RAIKKONEN', 'GROSJEAN'], [9, 10], 2, { navy: '#111111', red: '#c9a227', yellow: '#c9a227' }, ['#111111', '#c9a227', '#c9a227']),
  tc('r12_forceindia', 'Force India', 'VJM05', ['DI RESTA', 'HULKENBERG'], [11, 12], 1, { navy: '#f2f2f2', red: '#ff7a00', yellow: '#0a7d3e' }, ['#f2f2f2', '#ff7a00', '#0a7d3e']),
  tc('r12_sauber', 'Sauber', 'C31', ['KOBAYASHI', 'PEREZ'], [14, 15], 1, { navy: '#f2f2f2', red: '#151515', yellow: '#1b3f8f' }, ['#f2f2f2', '#151515', '#1b3f8f']),
  tc('r12_williams', 'Williams', 'FW34', ['MALDONADO', 'SENNA'], [18, 19], 1, { navy: '#0b1f5c', red: '#f2f2f2', yellow: '#3a8ddb' }, ['#0b1f5c', '#f2f2f2', '#3a8ddb']),
  tc('r12_tororosso', 'Toro Rosso', 'STR7', ['RICCIARDO', 'VERGNE'], [16, 17], 0, { navy: '#14215a', red: '#c8102e', yellow: '#c0c4ca' }, ['#14215a', '#c8102e', '#c0c4ca']),
  tc('r12_caterham', 'Caterham', 'CT01', ['KOVALAINEN', 'PETROV'], [20, 21], 0, { navy: '#0a5c36', red: '#ffd200', yellow: '#ffd200' }, ['#0a5c36', '#ffd200', '#151515']),
];
export const TEAMS_2020 = [
  { id: 'm20_mercedes', name: 'Mercedes', car: 'W11 · 2020', drivers: ['HAMILTON', 'BOTTAS'], numbers: [44, 77], tier: 3, gloss: true, colors: ['#151515', '#00d2be', '#c0c4ca'] },
  tc('m20_redbull', 'Red Bull', 'RB16', ['VERSTAPPEN', 'ALBON'], [33, 23], 3, { dark: '#1b2448', teal: '#d6202a' }, ['#1b2448', '#d6202a', '#ffcc00']),
  tc('m20_mclaren', 'McLaren', 'MCL35', ['SAINZ', 'NORRIS'], [55, 4], 2, { dark: '#ff8000', teal: '#47c7fc' }, ['#ff8000', '#47c7fc', '#151515']),
  tc('m20_racingpoint', 'Racing Point', 'RP20', ['PEREZ', 'STROLL'], [11, 18], 2, { dark: '#f596c8', teal: '#2a5cd6' }, ['#f596c8', '#2a5cd6', '#f2f2f2']),
  tc('m20_renault', 'Renault', 'R.S.20', ['RICCIARDO', 'OCON'], [3, 31], 2, { dark: '#ffd400', teal: '#151515' }, ['#ffd400', '#151515', '#f2f2f2']),
  tc('m20_ferrari', 'Ferrari', 'SF1000', ['LECLERC', 'VETTEL'], [16, 5], 2, { dark: '#a6051a', teal: '#151515' }, ['#a6051a', '#151515', '#f2f2f2']),
  tc('m20_alphatauri', 'AlphaTauri', 'AT01', ['GASLY', 'KVYAT'], [10, 26], 1, { dark: '#f2f2f2', teal: '#1b2448' }, ['#f2f2f2', '#1b2448', '#151515']),
  tc('m20_alfa', 'Alfa Romeo', 'C39', ['RAIKKONEN', 'GIOVINAZZI'], [7, 99], 1, { dark: '#9b0000', teal: '#f2f2f2' }, ['#9b0000', '#f2f2f2', '#151515']),
  tc('m20_haas', 'Haas', 'VF-20', ['GROSJEAN', 'MAGNUSSEN'], [8, 20], 0, { dark: '#2a2a2e', teal: '#c8102e' }, ['#2a2a2e', '#c8102e', '#f2f2f2']),
  tc('m20_williams', 'Williams', 'FW43', ['RUSSELL', 'LATIFI'], [63, 6], 0, { dark: '#0a3e8c', teal: '#f2f2f2' }, ['#0a3e8c', '#f2f2f2', '#00a0de']),
];
// stagione di ogni macchina speciale (prima la vera, poi le altre squadre)
// edizione pubblica: nomi, piloti e sponsor inventati; la squadra "di casa" (che usava la livrea del modello,
// con i loghi veri) viene dipinta come le altre: blu notte, rosso e giallo
if (PUBLIC) for (const t of TEAMS_2026) {
  const o = PUB_TEAMS[t.id]; if (!o) continue;
  t.name = o.name; t.car = o.car; t.drivers = o.drivers.slice();
  t.decals = [{ at: 'side', text: o.sponsor, color: t.colors[1] === t.colors[0] ? '#ffffff' : t.colors[1], y: [0.36, 0.58] }, { at: 'wing', text: o.sponsor, color: '#ffffff' }];
  if (t.original) {
    t.original = false;
    t.decals[0].color = '#ffcc00';
    t.paint = p => {
      const N = hex('#16224f'), R = hex('#d6202a'), Y = hex('#ffcc00');
      if (frontWing(p)) return endplate(p) ? R : N;
      if (rearWing(p)) return endplate(p) ? R : (p.y > 0.9 ? Y : N);
      if (nose(p) && p.y > 0.25 && p.ny > 0.2) return R;
      if (sidepod(p) && band(p.y, 0.62, 0.03)) return R;
      return N;
    };
  }
}
export const SEASONS = { r26: TEAMS_2006, mp45: TEAMS_1989, f2002: TEAMS_2002, f2004: TEAMS_2004, rb8: TEAMS_2012, w11: TEAMS_2020 };
// da quale macchina speciale viene una squadra (dal prefisso dell'id)
export const kindOfTeam = id => ({ r06: 'r26', m89: 'mp45', f02: 'f2002', f04: 'f2004', r12: 'rb8', m20: 'w11' })[(id || '').slice(0, 3)] || null;

// squadre della categoria scelta (F1 2026, oppure con una macchina speciale la sua stagione)
export const TEAMS = SEASONS[CAR_CLASS] || TEAMS_2026;
export const teamById = id => TEAMS.find(t => t.id === id) || TEAMS[0];

// ------------------------------------------------------------------ pittura
let decoded = null;
async function decodeMaps() {
  if (decoded) return decoded;
  const out = {};
  for (const [k, b64] of Object.entries(MAPS)) {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([u], { type: 'image/png' }));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    out[k] = g.getImageData(0, 0, c.width, c.height).data;
  }
  return (decoded = out);
}
export const loadLiveryMaps = () => decodeMaps();

// scritte: maschere di testo proiettate sulla vettura (fianchi delle pance, ala posteriore)
function textMask(d) {
  const W = 512, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let fs = 96;
  const font = () => `${d.font || '800'} ${fs}px "Titillium Web", Arial, sans-serif`;
  g.font = font();
  while (g.measureText(d.text).width > W * 0.92 && fs > 12) { fs -= 4; g.font = font(); }
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(d.text, W / 2, H / 2 + fs * 0.05);
  const a = g.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = a[i * 4 + 3];
  return { m, W, H, col: hex(d.color), colR: d.colorR ? hex(d.colorR) : null, d };
}
function decalAt(dec, p) {
  for (const D of dec) {
    let u, v;
    if (D.d.at === 'side' && p.s === 'body') {
      if (Math.abs(p.nx) < 0.55 || p.ax < 0.45) continue;
      const [y0, y1] = D.d.y || [0.3, 0.6], z0 = -0.95, z1 = 0.45;
      if (p.y < y0 || p.y > y1 || p.z < z0 || p.z > z1) continue;
      u = p.x > 0 ? (z1 - p.z) / (z1 - z0) : (p.z - z0) / (z1 - z0);
      v = (y1 - p.y) / (y1 - y0);
    } else if (D.d.at === 'wing' && p.s === 'wing') {
      if (p.z > -1.6 || p.ny < 0.4 || p.ax > 0.56 || p.y < 0.82) continue;
      const x0 = -0.52, x1 = 0.52, z0 = -2.2, z1 = -1.9;
      u = (x1 - p.x) / (x1 - x0); v = (z1 - p.z) / (z1 - z0);
      if (v < 0 || v > 1) continue;
    } else continue;
    const a = D.m[Math.min(D.H - 1, Math.floor(v * D.H)) * D.W + Math.min(D.W - 1, Math.floor(u * D.W))];
    if (a > 0) return { col: p.x < 0 && D.colR ? D.colR : D.col, a: a / 255 };
  }
  return null;
}

const cache = new Map();
// texture della livrea per una scuderia e una delle due texture del modello (chasis / chassis2)
export function liveryTexture(team, which, size, base) {
  const key = team.id + which + size;
  if (cache.has(key)) return cache.get(key);
  if (!decoded) return null;
  const M = decoded[which], S = SIZE;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  // fondo: la texture originale (per i punti non coperti dalla mappa)
  if (base && base.image) g.drawImage(base.image, 0, 0, size, size);
  const img = g.getImageData(0, 0, size, size), d = img.data;
  const toS = v => Math.round(Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2) * 255);
  const p = { s: which === 'chassis2' ? 'wing' : 'body' };
  const rx = RANGE.x, ry = RANGE.y, rz = RANGE.z;
  const dec = (team.decals || []).map(textMask);
  const samp = (o, fx, fy) => {
    // interpolazione bilineare della mappa (posizioni continue: bordi delle zone puliti)
    const x0 = Math.max(0, Math.min(S - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(S - 1, Math.floor(fy)));
    const x1 = Math.min(S - 1, x0 + 1), y1 = Math.min(S - 1, y0 + 1), tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const at = (x, y, ch) => M[((y + o) * S + x) * 4 + ch];
    const r = [];
    for (let ch = 0; ch < 4; ch++) r.push((at(x0, y0, ch) * (1 - tx) + at(x1, y0, ch) * tx) * (1 - ty) + (at(x0, y1, ch) * (1 - tx) + at(x1, y1, ch) * tx) * ty);
    return r;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x + 0.5) / size * S - 0.5, fy = (y + 0.5) / size * S - 0.5;
    const P = samp(0, fx, fy);
    if (P[3] < 128) continue;
    const N = samp(S, fx, fy);
    p.x = rx[0] + P[0] / 255 * (rx[1] - rx[0]); p.y = ry[0] + P[1] / 255 * (ry[1] - ry[0]); p.z = rz[0] + P[2] / 255 * (rz[1] - rz[0]);
    p.nx = N[0] / 127.5 - 1; p.ny = N[1] / 127.5 - 1; p.nz = N[2] / 127.5 - 1; p.ax = Math.abs(p.x);
    let col = team.paint(p);
    const dc = dec.length ? decalAt(dec, p) : null;
    if (dc) col = mix(col, dc.col, dc.a);
    const o = (y * size + x) * 4;
    d[o] = toS(col[0]); d[o + 1] = toS(col[1]); d[o + 2] = toS(col[2]); d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (base) t.channel = base.channel;
  cache.set(key, t);
  return t;
}

// griglia 2026: il giocatore guida per una scuderia, gli altri piloti la completano
// (prima il compagno di squadra, poi le altre scuderie in ordine)
export function f1Grid(playerTeam, bots) {
  const me = teamById(playerTeam);
  const list = [{ team: me, name: me.drivers[1] }];
  for (const t of TEAMS) if (t !== me) for (const d of t.drivers) list.push({ team: t, name: d });
  // con meno avversari si tengono scuderie intere, scelte a caso
  const mate = list.shift(), rest = [];
  const teams = TEAMS.filter(t => t !== me).sort(() => Math.random() - 0.5);
  for (const t of teams) for (const d of t.drivers) rest.push({ team: t, name: d });
  return [mate, ...rest].slice(0, bots);
}
