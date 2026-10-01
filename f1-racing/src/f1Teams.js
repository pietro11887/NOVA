import * as THREE from 'three';
import { MAPS, RANGE, SIZE } from './f1LiveryMaps.js';

// Scuderie e piloti della stagione 2026 di Formula 1, con le livree dipinte sulla RB22.
// Ogni livrea è una funzione del punto della vettura (posizione e normale): così i colori
// stanno nelle zone giuste (muso, pance, cofano motore, presa d'aria, ali) come sulle vere.
// Solo colori e forme: niente loghi degli sponsor.
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

export const TEAMS = [
  {
    id: 'redbull', name: 'Red Bull Racing', car: 'RB22', drivers: ['VERSTAPPEN', 'HADJAR'], tier: 2,
    colors: ['#1b2a5a', '#ff8a1c', '#d6202a'], original: true, gloss: true,
  },
  {
    id: 'mclaren', name: 'McLaren', car: 'MCL40', drivers: ['NORRIS', 'PIASTRI'], tier: 3,
    colors: ['#ff8000', '#2e3033', '#33c1b0'],
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
    paint(p) {
      // due lati: grigio-bianco a sinistra, nero a destra, filetto oro al centro
      const W = hex('#e6e7e9'), K = hex('#0e0e10'), Au = hex('#b59a5b');
      if (band(p.x, 0, 0.018) && p.ny > 0.2) return Au;
      return p.x > 0 ? W : K;
    },
  },
];

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
