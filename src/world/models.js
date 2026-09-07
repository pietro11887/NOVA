import * as THREE from 'three';
import { GeoBuilder, pick, rand, TAU, smoothNormals } from '../core/utils.js';

/**
 * Modelli di auto e personaggi. Niente scatole impilate: le carrozzerie
 * nascono da sezioni trasversali collegate tra loro (come una barca) e gli
 * arti sono tronchi di cono, cosi' le silhouette leggono come vere.
 */

/* ------------------------------------------------------- helper geometrici */

/** Collega una serie di sezioni ottagonali lungo l'asse X. */
function clampIdx(i, n) { return i < 0 ? 0 : i >= n ? n - 1 : i; }

/**
 * Scocca dell'auto. La sezione trasversale e' una superellisse: spigoli
 * ammorbiditi come su una carrozzeria vera, invece dell'ottagono di prima.
 */
function hull(gb, sections, color, uv = 0.35, rings = 18) {
  const ringOf = (s) => {
    const { hw, yb, yt } = s;
    const h = yt - yb, cy = (yt + yb) / 2;
    const out = [];
    for (let i = 0; i < rings; i++) {
      // senso orario: con l'altro verso la scocca risulta rovesciata
      const a = -(i / rings) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const n = 3.6;   // 2 = ellisse, molto alto = rettangolo
      const k = Math.pow(Math.pow(Math.abs(ca), n) + Math.pow(Math.abs(sa), n), -1 / n);
      out.push([s.x, cy + sa * k * (h / 2), ca * k * hw]);
    }
    return out;
  };
  const cap = (ring, front) => {
    for (let i = 1; i < ring.length - 1; i++) {
      if (front) gb.quad(ring[0], ring[i], ring[i + 1], ring[i + 1], color, uv, uv);
      else gb.quad(ring[0], ring[i + 1], ring[i], ring[i], color, uv, uv);
    }
  };
  let prev = ringOf(sections[0]);
  cap(prev, true);
  for (let s = 1; s < sections.length; s++) {
    const cur = ringOf(sections[s]);
    for (let i = 0; i < rings; i++) {
      const j = (i + 1) % rings;
      gb.quad(prev[i], cur[i], cur[j], prev[j], color, uv, uv);
    }
    prev = cur;
  }
  cap(prev, false);
}

/**
 * Infittisce le sezioni con una spline: la fiancata diventa una curva
 * continua invece di una serie di scalini fra una sezione e l'altra.
 */
function refine(sections, sub = 4) {
  if (sections.length < 2) return sections;
  const at = (i) => sections[clampIdx(i, sections.length)];
  const spline = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  const out = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      out.push({
        x: spline(a.x, b.x, c.x, d.x, t),
        hw: Math.max(0.02, spline(a.hw, b.hw, c.hw, d.hw, t)),
        yb: spline(a.yb, b.yb, c.yb, d.yb, t),
        yt: spline(a.yt, b.yt, c.yt, d.yt, t),
      });
    }
  }
  out.push(sections[sections.length - 1]);
  return out;
}

function taper(gb, x, y0, y1, r0, r1, color, sides = 8, tilt = 0) {
  const ring = (y, r, off) => {
    const out = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU;
      out.push([x + Math.cos(a) * r + off, y, Math.sin(a) * r]);
    }
    return out;
  };
  const a = ring(y0, r0, 0), b = ring(y1, r1, tilt);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    gb.quad(a[i], b[i], b[j], a[j], color, 1, 1);
  }
  for (let i = 1; i < sides - 1; i++) {
    gb.quad(b[0], b[i], b[i + 1], b[i + 1], color, 1, 1);
    gb.quad(a[0], a[i + 1], a[i], a[i], color, 1, 1);
  }
}

/** Ruota completa: pneumatico con spalla, cerchio in lega e mozzo. */
/**
 * Ruota completa: pneumatico con spalle arrotondate, cerchio in lega a
 * cinque razze, disco e pinza freno. E' la parte che si guarda di piu'.
 */
function wheel(gb, x, y, z, r, w, side, spokes = 5) {
  const N = 20;
  const ringZ = (zz, rr) => {
    const out = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      out.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr, zz]);
    }
    return out;
  };
  const zi = z - side * w / 2, zo = z + side * w / 2;
  const flip = side > 0;
  const q = (a, b, c, d, col) => (flip ? gb.quad(a, b, c, d, col, 1, 1) : gb.quad(d, c, b, a, col, 1, 1));

  // pneumatico: battistrada piatto e due spalle, cosi' il profilo si vede
  const treadI = ringZ(zi + side * w * 0.18, r);
  const treadO = ringZ(zo - side * w * 0.18, r);
  const shoulderI = ringZ(zi, r * 0.90);
  const shoulderO = ringZ(zo, r * 0.90);
  const bead = ringZ(zo - side * 0.005, r * 0.66);      // bordo del cerchio
  const beadI = ringZ(zi + side * 0.005, r * 0.66);
  const dish = ringZ(zo - side * w * 0.30, r * 0.60);   // fondo del cerchio
  const hub = ringZ(zo - side * w * 0.26, r * 0.17);

  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    q(treadI[i], treadI[j], treadO[j], treadO[i], 0x1b1c20);              // battistrada
    q(shoulderI[i], shoulderI[j], treadI[j], treadI[i], 0x131417);        // spalla interna
    q(treadO[i], treadO[j], shoulderO[j], shoulderO[i], 0x131417);        // spalla esterna
    q(shoulderO[i], shoulderO[j], bead[j], bead[i], 0x0f1013);            // fianco
    q(beadI[i], beadI[j], shoulderI[j], shoulderI[i], 0x0f1013);
    q(bead[i], bead[j], dish[j], dish[i], 0xcdd4dc);                      // labbro del cerchio
    q(dish[i], dish[j], hub[j], hub[i], 0x1a1d22);                        // fondo scuro fra le razze
  }
  // razze: pale che vanno dal mozzo al labbro, con un po' di spessore
  for (let k = 0; k < spokes; k++) {
    const a0 = (k / spokes) * TAU, half = (TAU / spokes) * 0.19;
    const zf = zo - side * w * 0.24;
    const p = (ang, rr) => [x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, zf];
    const pb = (ang, rr) => [x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, zo - side * w * 0.30];
    q(p(a0 - half, r * 0.20), p(a0 - half * 1.5, r * 0.60), p(a0 + half * 1.5, r * 0.60), p(a0 + half, r * 0.20), 0xd6dde5);
    // fianchetto: da fuori le razze non sembrano adesivi
    q(pb(a0 - half, r * 0.20), pb(a0 - half * 1.5, r * 0.60), p(a0 - half * 1.5, r * 0.60), p(a0 - half, r * 0.20), 0x9aa2ab);
    q(p(a0 + half, r * 0.20), p(a0 + half * 1.5, r * 0.60), pb(a0 + half * 1.5, r * 0.60), pb(a0 + half, r * 0.20), 0x9aa2ab);
  }
  // mozzo con dado centrale
  for (let i = 1; i < N - 1; i++) q(hub[0], hub[i], hub[i + 1], hub[i + 1], 0xe4e9ee);
  // disco e pinza freno, visibili fra le razze
  const disc = ringZ(zo - side * w * 0.46, r * 0.56);
  for (let i = 1; i < N - 1; i++) q(disc[0], disc[i], disc[i + 1], disc[i + 1], 0x5d646c);
  gb.box(x - r * 0.34, y + r * 0.16, zo - side * w * 0.40, 0.07, r * 0.5, w * 0.22, 0xb8322c);
}

export const CAR_TYPES = {
  sedan: {
    L: 4.5, W: 1.94, top: 1.36, mass: 1, speed: 1.0, wheel: 0.35, wx: 1.42,
    body: [
      { x: 2.25, hw: 0.80, yb: 0.34, yt: 0.72 }, { x: 1.75, hw: 0.90, yb: 0.28, yt: 0.80 },
      { x: 0.90, hw: 0.94, yb: 0.26, yt: 0.86 }, { x: 0.00, hw: 0.95, yb: 0.26, yt: 0.88 },
      { x: -0.90, hw: 0.94, yb: 0.26, yt: 0.88 }, { x: -1.75, hw: 0.90, yb: 0.28, yt: 0.82 },
      { x: -2.25, hw: 0.80, yb: 0.34, yt: 0.74 },
    ],
    cabin: [
      { x: 0.95, hw: 0.74, yb: 0.84, yt: 0.92 }, { x: 0.45, hw: 0.83, yb: 0.86, yt: 1.26 },
      { x: -0.55, hw: 0.85, yb: 0.86, yt: 1.30 }, { x: -1.25, hw: 0.80, yb: 0.86, yt: 1.12 },
      { x: -1.62, hw: 0.72, yb: 0.84, yt: 0.94 },
    ],
  },
  sport: {
    L: 4.4, W: 1.98, top: 1.18, mass: 0.85, speed: 1.32, wheel: 0.34, wx: 1.4,
    body: [
      { x: 2.2, hw: 0.84, yb: 0.26, yt: 0.60 }, { x: 1.6, hw: 0.94, yb: 0.22, yt: 0.68 },
      { x: 0.7, hw: 0.99, yb: 0.20, yt: 0.74 }, { x: -0.2, hw: 0.99, yb: 0.20, yt: 0.76 },
      { x: -1.2, hw: 0.96, yb: 0.22, yt: 0.76 }, { x: -2.0, hw: 0.88, yb: 0.26, yt: 0.68 },
    ],
    cabin: [
      { x: 0.75, hw: 0.76, yb: 0.72, yt: 0.80 }, { x: 0.15, hw: 0.84, yb: 0.74, yt: 1.08 },
      { x: -0.75, hw: 0.86, yb: 0.74, yt: 1.14 }, { x: -1.55, hw: 0.78, yb: 0.72, yt: 0.86 },
    ],
  },
  suv: {
    L: 4.75, W: 2.06, top: 1.85, mass: 1.3, speed: 0.92, wheel: 0.42, wx: 1.5,
    body: [
      { x: 2.35, hw: 0.86, yb: 0.44, yt: 1.02 }, { x: 1.8, hw: 0.97, yb: 0.38, yt: 1.12 },
      { x: 0.8, hw: 1.01, yb: 0.36, yt: 1.16 }, { x: -0.4, hw: 1.02, yb: 0.36, yt: 1.16 },
      { x: -1.6, hw: 0.99, yb: 0.38, yt: 1.14 }, { x: -2.35, hw: 0.88, yb: 0.44, yt: 1.06 },
    ],
    cabin: [
      { x: 1.15, hw: 0.86, yb: 1.10, yt: 1.20 }, { x: 0.7, hw: 0.94, yb: 1.12, yt: 1.66 },
      { x: -1.2, hw: 0.96, yb: 1.12, yt: 1.72 }, { x: -2.1, hw: 0.90, yb: 1.10, yt: 1.60 },
    ],
  },
  van: {
    L: 5.1, W: 2.1, top: 2.25, mass: 1.5, speed: 0.8, wheel: 0.40, wx: 1.6,
    body: [
      { x: 2.5, hw: 0.88, yb: 0.42, yt: 1.30 }, { x: 2.0, hw: 1.02, yb: 0.36, yt: 1.70 },
      { x: 0.6, hw: 1.05, yb: 0.34, yt: 2.05 }, { x: -1.2, hw: 1.05, yb: 0.34, yt: 2.10 },
      { x: -2.5, hw: 0.98, yb: 0.40, yt: 2.02 },
    ],
    cabin: [
      { x: 2.05, hw: 0.94, yb: 1.30, yt: 1.42 }, { x: 1.5, hw: 1.0, yb: 1.34, yt: 1.92 },
      { x: 0.9, hw: 1.02, yb: 1.36, yt: 2.02 },
    ],
  },
  pickup: {
    L: 5.0, W: 2.0, top: 1.62, mass: 1.2, speed: 0.9, wheel: 0.40, wx: 1.55,
    body: [
      { x: 2.45, hw: 0.84, yb: 0.42, yt: 0.92 }, { x: 1.9, hw: 0.95, yb: 0.36, yt: 1.00 },
      { x: 0.7, hw: 0.98, yb: 0.34, yt: 1.04 }, { x: -0.2, hw: 0.98, yb: 0.34, yt: 1.02 },
      { x: -1.4, hw: 0.98, yb: 0.36, yt: 1.10 }, { x: -2.45, hw: 0.92, yb: 0.40, yt: 1.10 },
    ],
    cabin: [
      { x: 1.05, hw: 0.84, yb: 1.00, yt: 1.10 }, { x: 0.55, hw: 0.92, yb: 1.02, yt: 1.52 },
      { x: -0.35, hw: 0.92, yb: 1.02, yt: 1.56 }, { x: -0.75, hw: 0.86, yb: 1.00, yt: 1.30 },
    ],
  },
};

CAR_TYPES.muscle = {
  L: 5.0, W: 2.02, top: 1.36, mass: 1.15, speed: 1.22, wheel: 0.38, wx: 1.62, spoiler: true,
  body: [
    { x: 2.5, hw: 0.88, yb: 0.3, yt: 0.78 }, { x: 1.9, hw: 0.98, yb: 0.26, yt: 0.86 },
    { x: 0.7, hw: 1.0, yb: 0.24, yt: 0.9 }, { x: -0.6, hw: 1.0, yb: 0.24, yt: 0.92 },
    { x: -1.8, hw: 0.97, yb: 0.26, yt: 0.9 }, { x: -2.5, hw: 0.9, yb: 0.3, yt: 0.84 },
  ],
  cabin: [
    { x: 0.55, hw: 0.8, yb: 0.88, yt: 0.96 }, { x: 0.0, hw: 0.88, yb: 0.9, yt: 1.3 },
    { x: -1.0, hw: 0.9, yb: 0.9, yt: 1.32 }, { x: -2.1, hw: 0.84, yb: 0.88, yt: 1.02 },
  ],
};
CAR_TYPES.sport.spoiler = true;

CAR_TYPES.bus = {
  L: 9.6, W: 2.55, top: 3.2, mass: 3.4, speed: 0.62, wheel: 0.52, wx: 3.3,
  body: [
    { x: 4.8, hw: 1.16, yb: 0.62, yt: 2.95 }, { x: 4.2, hw: 1.26, yb: 0.55, yt: 3.05 },
    { x: 0.0, hw: 1.28, yb: 0.52, yt: 3.08 }, { x: -4.2, hw: 1.26, yb: 0.55, yt: 3.05 },
    { x: -4.8, hw: 1.18, yb: 0.62, yt: 2.98 },
  ],
  cabin: [
    { x: 4.75, hw: 1.14, yb: 1.75, yt: 2.72 }, { x: 4.0, hw: 1.27, yb: 1.75, yt: 2.72 },
    { x: -4.0, hw: 1.27, yb: 1.75, yt: 2.72 }, { x: -4.75, hw: 1.16, yb: 1.75, yt: 2.7 },
  ],
};

CAR_TYPES.ambulance = {
  L: 5.6, W: 2.2, top: 2.6, mass: 1.9, speed: 0.95, wheel: 0.44, wx: 1.85,
  body: [
    { x: 2.8, hw: 0.92, yb: 0.5, yt: 1.35 }, { x: 2.2, hw: 1.05, yb: 0.44, yt: 1.75 },
    { x: 0.9, hw: 1.1, yb: 0.42, yt: 2.45 }, { x: -1.6, hw: 1.1, yb: 0.42, yt: 2.5 },
    { x: -2.8, hw: 1.04, yb: 0.48, yt: 2.45 },
  ],
  cabin: [
    { x: 2.25, hw: 0.98, yb: 1.4, yt: 1.72 }, { x: 1.5, hw: 1.06, yb: 1.42, yt: 2.05 },
    { x: 0.95, hw: 1.08, yb: 1.42, yt: 2.1 },
  ],
};

export const JACKETS = [
  0x2b3038, 0x1f2a3a, 0x3a2b24, 0x2f4a3a, 0x4a2b34, 0x1a1d22,
  0x5a4436, 0x2f3f5a, 0x6b3b2a, 0x3c3f46,
];

export const CAR_COLORS = [
  0xa8232b, 0x1d4f8f, 0xe6e4de, 0x121418, 0x1f7a4a, 0xe0a62c, 0x6f767e,
  0x53308f, 0xd45f18, 0x0f8fa8, 0xa9b2bd, 0x4a2c18, 0xd6c9ae, 0x24354d,
  0x8f1f3f, 0x2f8f6f, 0xf0e8d8, 0x3a3f47, 0xbf5a1f, 0x146ba8,
];

const shared = {};

function buildCarGeo(t, kind) {
  const body = new GeoBuilder();    // verniciato (colore dal materiale)
  const trim = new GeoBuilder();    // paraurti, griglie, cromature
  const wheels = new GeoBuilder();  // separate: non si ammaccano
  const glass = new GeoBuilder();
  const lights = new GeoBuilder();

  const bodyS = refine(t.body, 4);
  const cabinS = refine(t.cabin, 4);
  hull(body, bodyS, 0xffffff);
  // vetri: la cabina e' vetro, con un profilo appena piu' stretto
  hull(glass, cabinS.map((s) => ({ ...s, hw: s.hw * 0.985 })), 0x2b3644, 0.35, 14);
  // montanti e tetto in tinta carrozzeria
  hull(body, cabinS.map((s) => ({ x: s.x, hw: s.hw * 0.94, yb: s.yt - 0.11, yt: s.yt })), 0xffffff, 0.35, 14);

  const fr = t.body[0], rr = t.body[t.body.length - 1];
  const mid = t.body[(t.body.length / 2) | 0];
  const HW = t.W / 2;

  // --- interno: si vede attraverso i vetri e cambia tutto.
  // Tutto proporzionato all'abitacolo, se no i sedili bucano il tetto.
  const roofY = Math.max(...t.cabin.map((c) => c.yt));
  const floorY = t.cabin[1].yb - 0.02;
  const ch = Math.max(0.3, roofY - floorY);
  const cw = t.cabin[1].hw;
  trim.box(t.cabin[1].x - 0.15, floorY + 0.03, 0, 1.9, 0.06, cw * 1.7, 0x14161a);       // pianale
  const seatRow = (sx, hw) => {
    for (const sz of [1, -1]) {
      const zz = sz * hw * 0.42;
      trim.box(sx, floorY + ch * 0.16, zz, 0.46, ch * 0.12, hw * 0.62, 0x23262c);        // seduta
      trim.box(sx - 0.2, floorY + ch * 0.42, zz, 0.1, ch * 0.42, hw * 0.62, 0x23262c);   // schienale
      trim.box(sx - 0.22, floorY + ch * 0.70, zz, 0.1, ch * 0.16, hw * 0.36, 0x1a1d22);  // poggiatesta
    }
  };
  seatRow(t.cabin[1].x - 0.1, cw);
  if (t.cabin.length > 3) seatRow(t.cabin[2].x - 0.05, t.cabin[2].hw);
  trim.box(t.cabin[0].x + 0.16, floorY + ch * 0.26, 0, 0.36, ch * 0.16, t.cabin[0].hw * 1.5, 0x1a1d22);  // cruscotto
  trim.box(t.cabin[0].x - 0.06, floorY + ch * 0.36, cw * 0.42, 0.04, ch * 0.2, ch * 0.2, 0x0f1114);      // volante

  // --- griglia anteriore a listelli + prese d'aria
  const gx = fr.x - 0.03, gW = fr.hw * 1.15;
  trim.box(gx, fr.yb + 0.32, 0, 0.1, 0.2, gW, 0x101216);
  for (let i = -2; i <= 2; i++) {
    trim.box(gx + 0.02, fr.yb + 0.32 + i * 0.045, 0, 0.07, 0.018, gW * 0.96, 0x6c747d);
  }
  for (const s of [-1, 1]) trim.box(gx, fr.yb + 0.15, s * fr.hw * 0.62, 0.08, 0.09, 0.3, 0x14161a);

  // --- paraurti con labbro, sotto scocca, minigonne
  const frW = fr.hw * 2 + 0.03, rrW = rr.hw * 2 + 0.03;
  trim.box(fr.x - 0.09, fr.yb + 0.13, 0, 0.26, 0.26, frW, 0x2b3037);
  trim.box(fr.x - 0.14, fr.yb + 0.02, 0, 0.16, 0.09, frW * 0.92, 0x1b1e23);
  trim.box(rr.x + 0.09, rr.yb + 0.13, 0, 0.26, 0.26, rrW, 0x2b3037);
  trim.box(rr.x + 0.14, rr.yb + 0.02, 0, 0.16, 0.09, rrW * 0.92, 0x1b1e23);
  for (const s of [-1, 1]) trim.box(0, mid.yb + 0.02, s * (HW - 0.06), t.L * 0.5, 0.08, 0.1, 0x1b1e23);

  // --- linee delle portiere: solchi scuri, danno la scala all'auto
  const doorX = [t.cabin[0].x + 0.15, t.cabin[1].x - 0.55];
  for (const s of [-1, 1]) {
    for (const dx of doorX) {
      trim.box(dx, mid.yb + (mid.yt - mid.yb) * 0.5, s * (mid.hw + 0.004), 0.014, (mid.yt - mid.yb) * 0.7, 0.014, 0x24282e);
    }
    // maniglia
    trim.box(t.cabin[1].x - 0.2, t.cabin[1].yb - 0.04, s * (mid.hw + 0.015), 0.2, 0.045, 0.04, 0x9aa2ab);
    // modanatura lucida lungo la fiancata
    trim.box(0, mid.yb + (mid.yt - mid.yb) * 0.30, s * (mid.hw + 0.006), t.L * 0.6, 0.022, 0.016, 0x4a5058);
  }

  // --- profilo cromato attorno ai vetri
  for (const s of [-1, 1]) {
    for (let i = 0; i < t.cabin.length - 1; i++) {
      const a = t.cabin[i], b = t.cabin[i + 1];
      trim.quad(
        [a.x, a.yt - 0.02, s * (a.hw + 0.014)], [b.x, b.yt - 0.02, s * (b.hw + 0.014)],
        [b.x, b.yb + 0.02, s * (b.hw + 0.014)], [a.x, a.yb + 0.02, s * (a.hw + 0.014)],
        0x9aa2ab, 1, 1);
    }
  }
  // --- specchietti su braccetto
  for (const s of [-1, 1]) {
    const mz = t.cabin[0].hw;
    trim.box(t.cabin[0].x + 0.1, t.cabin[0].yb + 0.02, s * (mz + 0.03), 0.09, 0.04, 0.1, 0x2f353c);
    trim.box(t.cabin[0].x + 0.14, t.cabin[0].yb + 0.06, s * (mz + 0.11), 0.15, 0.1, 0.07, 0x2f353c);
  }
  // --- tergicristalli
  for (const s of [-1, 1]) {
    trim.box(t.cabin[0].x + 0.12, t.cabin[0].yb + 0.05, s * t.W * 0.18, 0.34, 0.02, 0.025, 0x1a1d22);
  }

  // --- ruote, passaruota e parafanghi
  const wr = t.wheel, ww = 0.30;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      wheel(wheels, sx * t.wx, wr, sz * (HW - 0.05), wr, ww, sz);
      trim.box(sx * t.wx, wr + 0.05, sz * (HW - 0.26), wr * 2.2, wr * 1.55, 0.34, 0x101216);
      body.box(sx * t.wx, wr + 0.34, sz * (HW - 0.14), wr * 2.3, 0.12, 0.26, 0xffffff);
    }
  }

  // --- targhe, scarichi doppi, antenna
  trim.box(fr.x - 0.14, fr.yb + 0.10, 0, 0.05, 0.15, 0.52, 0xe8e6de);
  trim.box(rr.x + 0.14, rr.yb + 0.10, 0, 0.05, 0.15, 0.52, 0xe8e6de);
  for (const s of (t.spoiler ? [-1, 1] : [1])) {
    trim.box(rr.x + 0.08, rr.yb - 0.01, s * 0.4, 0.24, 0.1, 0.1, 0x9aa2ab);
    trim.box(rr.x + 0.16, rr.yb - 0.01, s * 0.4, 0.06, 0.12, 0.12, 0x14161a);
  }
  trim.box(t.cabin[t.cabin.length - 1].x, t.cabin[t.cabin.length - 1].yt + 0.13, HW * 0.55,
    0.02, 0.26, 0.02, 0x1a1d22);

  // --- tetto appena piu' scuro: due tinte senza costare nulla
  hull(body, cabinS.map((sec) => ({ x: sec.x, hw: sec.hw * 0.9, yb: sec.yt - 0.04, yt: sec.yt + 0.005 })),
    0xdadada, 0.35, 14);

  // --- gruppi ottici: lente chiara davanti, fanale rosso con retro dietro
  const fz = fr.hw * 0.66, rz = rr.hw * 0.66;
  for (const s of [-1, 1]) {
    trim.box(fr.x - 0.10, fr.yb + 0.44, s * fz, 0.08, 0.24, 0.5, 0x14161a);    // fondello dietro
    lights.box(fr.x - 0.02, fr.yb + 0.44, s * fz, 0.09, 0.2, 0.44, 0xfff3d6);  // lente davanti
    lights.box(fr.x - 0.04, fr.yb + 0.30, s * fz * 1.12, 0.07, 0.07, 0.18, 0xffb84a);
    trim.box(rr.x + 0.10, rr.yb + 0.46, s * rz, 0.08, 0.23, 0.48, 0x14161a);
    lights.box(rr.x - 0.03, rr.yb + 0.46, s * rz, 0.09, 0.19, 0.42, 0xd82b1e);
    lights.box(rr.x - 0.02, rr.yb + 0.46, s * rz * 0.45, 0.07, 0.1, 0.13, 0xf0e6d2);
  }

  if (kind === 'police') {
    trim.box(t.cabin[1].x, t.cabin[1].yt + 0.1, 0, 1.15, 0.14, 1.2, 0x1a1d24);
    trim.box(0, t.body[2].yt + 0.02, HW - 0.02, 2.2, 0.5, 0.06, 0xf0f2f5);
    trim.box(0, t.body[2].yt + 0.02, -(HW - 0.02), 2.2, 0.5, 0.06, 0xf0f2f5);
  }
  if (kind === 'taxi') {
    trim.box(t.cabin[1].x, t.cabin[1].yt + 0.18, 0, 0.85, 0.3, 0.42, 0xf4c920);
  }
  if (t.spoiler) {
    const rrx = rr.x + 0.35;
    for (const s of [-1, 1]) trim.box(rrx, rr.yt + 0.12, s * t.W * 0.32, 0.12, 0.24, 0.1, 0x2b2f36);
    body.box(rrx, rr.yt + 0.27, 0, 0.42, 0.07, t.W * 0.84, 0xffffff);
  }
  if (kind === 'ambulance') {
    trim.box(t.cabin[1].x, t.cabin[1].yt + 0.14, 0, 1.2, 0.16, 1.3, 0xe8ecef);
    for (const s of [-1, 1]) {
      trim.box(0, 1.5, s * (HW - 0.01), 3.2, 0.34, 0.05, 0xd0342c);
      trim.box(0.4, 2.0, s * (HW - 0.01), 0.9, 0.24, 0.06, 0xd0342c);
      trim.box(0.4, 2.0, s * (HW - 0.01), 0.24, 0.9, 0.06, 0xd0342c);
    }
  }
  if (kind === 'bus') {
    for (const s of [-1, 1]) trim.box(0, 1.15, s * (HW - 0.01), 8.6, 0.24, 0.05, 0x2f6fd0);
    trim.box(4.1, 2.85, 0, 1.2, 0.34, 1.6, 0x1b2027);
  }
  return {
    body: smoothNormals(body.build(), 0.9),
    trim: trim.build(),
    wheels: wheels.build(),
    glass: smoothNormals(glass.build(), 1.2),
    lights: lights.build(),
  };
}

export function initModels(quality) {
  shared.quality = quality;
  shared.trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.55, envMapIntensity: 1.0 });
  // cerchi: stesso disegno, finiture diverse
  const rim = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, envMapIntensity: 1.2, ...o });
  shared.rimMats = {
    standard: shared.trimMat,
    cromo: rim({ roughness: 0.08, metalness: 1.0, color: 0xf2f6fa }),
    nero: rim({ roughness: 0.62, metalness: 0.35, color: 0x3a3d43 }),
    bronzo: rim({ roughness: 0.3, metalness: 0.9, color: 0xc08a3e }),
  };
  shared.glassMat = new THREE.MeshStandardMaterial({
    color: 0x10161e, roughness: 0.14, metalness: 0.08, envMapIntensity: 0.85,
    transparent: true, opacity: 0.9,
  });
  // vetro incrinato: opaco e bianchiccio, come un parabrezza andato
  shared.crackedGlassMat = new THREE.MeshStandardMaterial({
    map: crackedGlassTexture(), color: 0x9aa6b4, roughness: 0.72, metalness: 0,
    envMapIntensity: 0.3, transparent: true, opacity: 0.86,
  });
  shared.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  shared.geo = {};
  for (const k of Object.keys(CAR_TYPES)) {
    shared.geo[k] = buildCarGeo(CAR_TYPES[k], 'civil');
    shared.geo[k + ':police'] = buildCarGeo(CAR_TYPES[k], 'police');
    shared.geo[k + ':taxi'] = buildCarGeo(CAR_TYPES[k], 'taxi');
  }
  shared.bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  shared.shadowGeo = new THREE.CircleGeometry(0.5, 12);
  shared.shadowGeo.rotateX(-Math.PI / 2);
  shared.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
  return shared;
}

/**
 * Ammacca la carrozzeria attorno al punto d'impatto.
 * La geometria e' condivisa fra tutte le auto dello stesso tipo, quindi al
 * primo urto questa vettura si prende una copia tutta sua.
 */
export function dentCar(group, lx, ly, lz, strength) {
  const u = group.userData;
  if (!u.dentable) return;
  if (!u.owned) {
    for (const m of u.dentable) m.geometry = m.geometry.clone();
    u.owned = true;
    u.dents = 0;
  }
  u.dents = (u.dents || 0) + strength;

  // piu' l'auto e' gia' malmessa, meno cede: se no dopo tre urti e' un riccio
  const worn = 1 / (1 + u.dents * 0.012);
  const R = 0.85 + strength * 0.03;          // raggio dell'ammaccatura
  const depth = Math.min(0.21, 0.03 + strength * 0.012) * worn;
  for (const m of u.dentable) {
    const pos = m.geometry.attributes.position;
    const col = m.geometry.attributes.color;
    const a = pos.array;
    for (let i = 0; i < a.length; i += 3) {
      const dx = a[i] - lx, dy = a[i + 1] - ly, dz = a[i + 2] - lz;
      const d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      const k = (1 - d / R) ** 2;
      // rientra verso il punto d'urto, con un po' di piega irregolare
      const inv = d > 0.001 ? 1 / d : 0;
      a[i] -= dx * inv * depth * k;
      a[i + 1] -= dy * inv * depth * k * 0.55;
      a[i + 2] -= dz * inv * depth * k;
      const j2 = depth * k * 0.35;
      a[i] += (Math.random() - 0.5) * j2;
      a[i + 1] += (Math.random() - 0.5) * j2;
      a[i + 2] += (Math.random() - 0.5) * j2;
      // la vernice si graffia e si sporca dove ha preso
      if (col) {
        const f = 1 - k * 0.3;
        col.array[i] *= f; col.array[i + 1] *= f; col.array[i + 2] *= f;
      }
    }
    pos.needsUpdate = true;
    if (col) col.needsUpdate = true;
    m.geometry.computeVertexNormals();
    m.geometry.computeBoundingSphere();
  }

  // vetri incrinati e fari spenti quando l'auto e' messa male
  if (u.dents > 14 && u.glass && u.glass.material !== shared.crackedGlassMat) {
    u.glass.material = shared.crackedGlassMat;
  }
  if (u.dents > 22 && u.lights) { u.lightsBroken = true; u.lights.visible = false; }
}

/** Rimette a nuovo la carrozzeria (officina). */
export function undentCar(group) {
  const u = group.userData;
  if (!u.owned || !u.dentable) return;
  const g = shared.geo[u.geoKey] || shared.geo.sedan;
  const fresh = { body: g.body, trim: g.trim, glass: g.glass };
  for (const m of u.dentable) {
    m.geometry.dispose();
    m.geometry = fresh[m.userData.part];
  }
  u.owned = false;
  u.dents = 0;
  u.lightsBroken = false;
  if (u.glass) u.glass.material = shared.glassMat;
}

/** Riverniciatura in officina. */
export function paintCar(group, color) {
  const m = group.userData.bodyMat;
  if (m) m.color.setHex(color);
}

/** Cerchi: cambia il materiale delle ruote (cromo, nero opaco, bronzo). */
export function setRims(group, style) {
  const u = group.userData;
  if (!u.wheelMesh) return;
  const m = shared.rimMats[style] || shared.trimMat;
  u.wheelMesh.material = m;
  u.rims = style;
}

export const RIM_STYLES = {
  standard: { name: 'Lega chiara', price: 0 },
  cromo: { name: 'Cromati', price: 260 },
  nero: { name: 'Neri opachi', price: 220 },
  bronzo: { name: 'Bronzo', price: 340 },
};

export function makeCar(type = 'sedan', color = 0xb02b2b, kind = 'civil') {
  const key = kind === 'civil' ? type : `${type}:${kind}`;
  const g = shared.geo[key] || shared.geo.sedan;
  const group = new THREE.Group();
  // carrozzeria a due strati: base metallizzata + trasparente lucido sopra
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color, vertexColors: true, roughness: 0.38, metalness: 0.55, envMapIntensity: 1.15,
    clearcoat: 1, clearcoatRoughness: 0.06,
  });
  const body = new THREE.Mesh(g.body, bodyMat);
  const trim = new THREE.Mesh(g.trim, shared.trimMat);
  const wheels = new THREE.Mesh(g.wheels, shared.trimMat);
  const glass = new THREE.Mesh(g.glass, shared.glassMat);
  const lights = new THREE.Mesh(g.lights, shared.lightMat);
  lights.visible = false;
  if (shared.quality.shadows) {
    body.castShadow = trim.castShadow = wheels.castShadow = true;
    body.receiveShadow = true;
  }
  group.add(body, trim, wheels, glass, lights);

  if (!shared.quality.shadows) {
    const sh = new THREE.Mesh(shared.shadowGeo, shared.shadowMat);
    sh.scale.set(CAR_TYPES[type].L / 1.0, 1, CAR_TYPES[type].W / 1.0);
    sh.position.y = 0.04;
    group.add(sh);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.36),
      new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
    bar.position.set(CAR_TYPES[type].cabin[1].x - 0.3, CAR_TYPES[type].cabin[1].yt + 0.24, 0);
    const bar2 = bar.clone();
    bar2.material = new THREE.MeshBasicMaterial({ color: 0x1030ff, toneMapped: false });
    bar2.position.x += 0.6;
    group.add(bar, bar2);
    group.userData.bar = bar;
    group.userData.bar2 = bar2;
  }
  group.userData.bodyMat = bodyMat;
  group.userData.lights = lights;
  group.userData.glass = glass;
  group.userData.geoKey = key;
  body.userData.part = 'body';
  trim.userData.part = 'trim';
  glass.userData.part = 'glass';
  group.userData.dentable = [body, trim, glass];
  group.userData.wheelMesh = wheels;
  group.userData.rims = 'standard';
  return group;
}

/* ------------------------------------------------------------ personaggi */

const SKINS = [0xf3cba8, 0xe8b98c, 0xd3a074, 0xb9835a, 0x96633f, 0x74492c, 0x5a3823];
const SHIRTS = [0x2f6fd0, 0xc0392b, 0x2b9e5f, 0xeceff2, 0x2b2f38, 0xd9a520, 0x7d4fbf,
  0xd06a2f, 0x1f8f9c, 0x8a97a8, 0xf2e8d5, 0x3f4a5a, 0xbf3f6b];
const PANTS = [0x2b3444, 0x3b3f4a, 0x1f2632, 0x5a4632, 0x6b7280, 0x243b55, 0x8a8271, 0x38506b];
const HAIR = [0x241a12, 0x4b3220, 0x8a6a35, 0x101010, 0xa8a29a, 0x6b3a1f, 0xc9a86b];
const SHOES = [0x1e2126, 0x2b2f36, 0x4a3527, 0xe8e6e0];

const WAIST = 1.02;      // altezza del pivot del busto
const SHOULDER = 1.45;   // altezza delle spalle
const HIP = 0.88;        // altezza delle anche

/** Anello ellittico orizzontale. */
function ring(y, rx, rz, sides, cx = 0, cz = 0) {
  const out = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU;
    out.push([cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz]);
  }
  return out;
}

/**
 * Collega una serie di sezioni ellittiche: e' il modo piu' economico per
 * ottenere braccia, gambe e busti tondi invece che spigolosi.
 */
function loft(gb, sections, color, sides = 10, cap = true) {
  let prev = ring(sections[0].y, sections[0].rx, sections[0].rz, sides, sections[0].cx || 0, sections[0].cz || 0);
  if (cap) {
    for (let i = 1; i < sides - 1; i++) gb.quad(prev[0], prev[i + 1], prev[i], prev[i], color, 1, 1);
  }
  for (let s = 1; s < sections.length; s++) {
    const sec = sections[s];
    const cur = ring(sec.y, sec.rx, sec.rz, sides, sec.cx || 0, sec.cz || 0);
    const col = sec.color !== undefined ? sec.color : color;
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      gb.quad(prev[i], cur[i], cur[j], prev[j], col, 1, 1);
    }
    prev = cur;
  }
  if (cap) {
    const last = sections[sections.length - 1];
    const col = last.color !== undefined ? last.color : color;
    for (let i = 1; i < sides - 1; i++) gb.quad(prev[0], prev[i], prev[i + 1], prev[i + 1], col, 1, 1);
  }
}

/** Sfera schiacciabile: teste, spalle, mani, orecchie. */
function blob(gb, x, y, z, rx, ry, rz, color, sides = 12, rings = 8) {
  for (let r = 0; r < rings; r++) {
    const t0 = -Math.PI / 2 + (r / rings) * Math.PI;
    const t1 = -Math.PI / 2 + ((r + 1) / rings) * Math.PI;
    const y0 = y + Math.sin(t0) * ry, y1 = y + Math.sin(t1) * ry;
    const c0 = Math.cos(t0), c1 = Math.cos(t1);
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * TAU, a1 = ((i + 1) / sides) * TAU;
      gb.quad(
        [x + Math.cos(a0) * rx * c0, y0, z + Math.sin(a0) * rz * c0],
        [x + Math.cos(a0) * rx * c1, y1, z + Math.sin(a0) * rz * c1],
        [x + Math.cos(a1) * rx * c1, y1, z + Math.sin(a1) * rz * c1],
        [x + Math.cos(a1) * rx * c0, y0, z + Math.sin(a1) * rz * c0],
        color, 1, 1);
    }
  }
}

/**
 * Corpo, braccio e gamba vengono costruiti per ogni personaggio con i
 * colori gia' cotti nei vertici: un solo materiale condiviso, vestiti
 * diversi per tutti e nessuna draw call in piu'.
 */
function buildBody(c) {
  const gb = new GeoBuilder();
  const skin = c.skin, shirt = c.shirt, hair = c.hair;

  // --- bacino e busto: fianchi, vita stretta, torace, spalle spioventi
  loft(gb, [
    { y: 0.80, rx: 0.155, rz: 0.105, color: c.pants },
    { y: 0.88, rx: 0.175, rz: 0.115, color: c.pants },
    { y: 0.97, rx: 0.165, rz: 0.108, color: c.pants },
    { y: 1.02, rx: 0.150, rz: 0.100, color: shirt },
    { y: 1.14, rx: 0.152, rz: 0.100, color: shirt },
    { y: 1.30, rx: 0.180, rz: 0.115, color: shirt },
    { y: 1.42, rx: 0.196, rz: 0.118, color: shirt },
    { y: 1.485, rx: 0.185, rz: 0.110, color: shirt },
    { y: 1.51, rx: 0.120, rz: 0.085, color: shirt },
  ], shirt, 12);

  // --- spalle: nel colore del capo, se no la giacca lascia due palle chiare
  const shoulderCol = c.outfit === 'tee' ? shirt : c.jacket;
  const shoulderZ = c.outfit === 'tee' ? 0.175 : 0.196;
  for (const s of [-1, 1]) blob(gb, 0, 1.462, s * shoulderZ, 0.092, 0.092, 0.098, shoulderCol, 10, 6);

  // --- capo d'abbigliamento: giacca aperta, felpa col cappuccio o maglietta
  if (c.outfit === 'jacket') {
    const j = c.jacket;
    // guscio leggermente piu' largo del busto, aperto sul davanti
    loft(gb, [
      { y: 1.06, rx: 0.162, rz: 0.112, color: j },
      { y: 1.20, rx: 0.166, rz: 0.114, color: j },
      { y: 1.34, rx: 0.192, rz: 0.126, color: j },
      { y: 1.45, rx: 0.198, rz: 0.126, color: j },
      { y: 1.49, rx: 0.190, rz: 0.118, color: j },
    ], j, 12, false);
    // risvolti del bavero
    for (const s of [-1, 1]) {
      gb.box(0.098, 1.40, s * 0.055, 0.05, 0.24, 0.07, j);
      gb.box(0.086, 1.47, s * 0.085, 0.05, 0.1, 0.09, j);
    }
    // cerniera e tasche
    gb.box(0.108, 1.26, 0, 0.02, 0.34, 0.026, 0x8d949c);
    for (const s of [-1, 1]) gb.box(0.096, 1.13, s * 0.09, 0.03, 0.07, 0.09, j);
  } else if (c.outfit === 'hoodie') {
    const j = c.jacket;
    loft(gb, [
      { y: 1.04, rx: 0.168, rz: 0.116, color: j },
      { y: 1.22, rx: 0.172, rz: 0.118, color: j },
      { y: 1.36, rx: 0.198, rz: 0.130, color: j },
      { y: 1.47, rx: 0.200, rz: 0.128, color: j },
      { y: 1.50, rx: 0.188, rz: 0.116, color: j },
    ], j, 12, false);
    // cappuccio appoggiato sulle spalle
    blob(gb, -0.075, 1.52, 0, 0.105, 0.075, 0.125, j, 10, 6);
    blob(gb, -0.055, 1.46, 0, 0.115, 0.06, 0.135, j, 10, 6);
    // tasca a marsupio e cordoncino
    gb.box(0.098, 1.12, 0, 0.035, 0.13, 0.22, j);
    for (const s of [-1, 1]) gb.box(0.104, 1.33, s * 0.03, 0.014, 0.16, 0.014, 0xe8e4dc);
  }

  // --- cintura: separa il busto dai pantaloni
  loft(gb, [
    { y: 0.99, rx: 0.158, rz: 0.106, color: c.belt },
    { y: 1.04, rx: 0.156, rz: 0.104, color: c.belt },
  ], c.belt, 12, false);
  gb.box(0.108, 1.015, 0, 0.03, 0.05, 0.06, 0xc9a24a);        // fibbia

  // --- colletto
  loft(gb, [
    { y: 1.487, rx: 0.088, rz: 0.072, color: c.outfit === 'tee' ? shirt : c.jacket },
    { y: 1.535, rx: 0.080, rz: 0.066, color: c.outfit === 'tee' ? shirt : c.jacket },
  ], shirt, 10, false);

  // --- collo e testa
  loft(gb, [
    { y: 1.50, rx: 0.062, rz: 0.058, color: skin },
    { y: 1.575, rx: 0.058, rz: 0.055, color: skin },
  ], skin, 10, false);
  blob(gb, 0.004, 1.665, 0, 0.098, 0.115, 0.093, skin, 14, 10);
  blob(gb, 0.028, 1.615, 0, 0.086, 0.072, 0.082, skin, 12, 8);      // mascella
  for (const s of [-1, 1]) blob(gb, -0.01, 1.665, s * 0.092, 0.022, 0.036, 0.016, skin, 8, 5);   // orecchie
  // naso, occhi, sopracciglia, bocca
  blob(gb, 0.092, 1.657, 0, 0.028, 0.026, 0.022, skin, 8, 6);
  for (const s of [-1, 1]) {
    blob(gb, 0.072, 1.695, s * 0.038, 0.022, 0.017, 0.02, 0xf4f2ee, 8, 6);
    blob(gb, 0.083, 1.694, s * 0.041, 0.011, 0.011, 0.011, c.eyes, 6, 5);
    gb.box(0.078, 1.723, s * 0.04, 0.02, 0.012, 0.048, hair);
  }
  gb.box(0.086, 1.596, 0, 0.016, 0.011, 0.042, 0xb9705f);

  // --- capelli: tre tagli diversi
  if (c.hairStyle === 0) {                       // corti
    blob(gb, -0.004, 1.678, 0, 0.104, 0.118, 0.099, hair, 12, 8);
    gb.box(-0.06, 1.60, 0, 0.06, 0.12, 0.17, hair);
  } else if (c.hairStyle === 1) {                // lunghi
    blob(gb, -0.006, 1.676, 0, 0.106, 0.12, 0.101, hair, 12, 8);
    loft(gb, [
      { y: 1.70, rx: 0.105, rz: 0.10, cx: -0.02 },
      { y: 1.55, rx: 0.098, rz: 0.095, cx: -0.03 },
      { y: 1.42, rx: 0.082, rz: 0.078, cx: -0.035 },
    ], hair, 10, false);
  } else {                                       // cappellino
    blob(gb, -0.004, 1.676, 0, 0.104, 0.112, 0.1, c.cap, 12, 6);
    gb.box(0.105, 1.688, 0, 0.11, 0.022, 0.16, c.cap);
  }
  const geo = smoothNormals(gb.build(), 1.15);
  geo.translate(0, -WAIST, 0);   // pivot in vita: busto e testa ruotano da li'
  return geo;
}

/** Braccio: spalla -> gomito -> polso -> mano, pivot alla spalla. */
function buildArm(c) {
  const gb = new GeoBuilder();
  const sleeve = c.sleeve;
  const bulk = c.outfit === 'tee' ? 1 : 1.16;    // la giacca ingrossa la manica
  loft(gb, [
    { y: 0.02, rx: 0.062 * bulk, rz: 0.062 * bulk, color: sleeve },
    { y: -0.10, rx: 0.058 * bulk, rz: 0.058 * bulk, color: sleeve },
    { y: -0.19, rx: 0.052 * bulk, rz: 0.052 * bulk, color: c.shortSleeve ? c.skin : sleeve },
    { y: -0.30, rx: 0.047 * bulk, rz: 0.047 * bulk, color: c.shortSleeve ? c.skin : sleeve },
  ], c.skin, 9);
  blob(gb, 0, -0.30, 0, 0.048 * bulk, 0.048 * bulk, 0.048 * bulk, c.shortSleeve ? c.skin : sleeve, 8, 6);  // gomito
  return smoothNormals(gb.build(), 1.15);
}

/** Avambraccio: parte dal gomito, e' figlio del braccio e si piega. */
function buildForearm(c) {
  const gb = new GeoBuilder();
  loft(gb, [
    { y: 0.01, rx: 0.046, rz: 0.046, color: c.skin },
    { y: -0.12, rx: 0.041, rz: 0.041, color: c.skin },
    { y: -0.24, rx: 0.037, rz: 0.038, color: c.skin },
    { y: -0.31, rx: 0.035, rz: 0.036, color: c.skin },
  ], c.skin, 9);
  blob(gb, 0.012, -0.355, 0, 0.045, 0.055, 0.032, c.skin, 8, 6);     // mano
  return smoothNormals(gb.build(), 1.15);
}

function buildLeg(c) {
  const gb = new GeoBuilder();
  const short = c.shorts;
  loft(gb, [
    { y: 0.02, rx: 0.088, rz: 0.088, color: c.pants },
    { y: -0.16, rx: 0.081, rz: 0.083, color: c.pants },
    { y: -0.30, rx: 0.072, rz: 0.074, color: short ? c.skin : c.pants },
    { y: -0.42, rx: 0.066, rz: 0.068, color: short ? c.skin : c.pants },
  ], c.pants, 9);
  blob(gb, 0, -0.42, 0, 0.068, 0.062, 0.068, short ? c.skin : c.pants, 8, 6);   // ginocchio
  return smoothNormals(gb.build(), 1.15);
}

/** Polpaccio + scarpa: parte dal ginocchio ed e' figlio della coscia. */
function buildShin(c) {
  const gb = new GeoBuilder();
  const short = c.shorts;
  loft(gb, [
    { y: 0.01, rx: 0.062, rz: 0.064, color: short ? c.skin : c.pants },
    { y: -0.12, rx: 0.056, rz: 0.058, color: short ? c.skin : c.pants },
    { y: -0.26, rx: 0.047, rz: 0.049, color: short ? c.skin : c.pants },
    { y: -0.36, rx: 0.044, rz: 0.046, color: short ? c.skin : c.pants },
  ], c.pants, 9);
  // scarpa: suola, tomaia e punta arrotondata
  gb.box(0.03, -0.395, 0, 0.235, 0.055, 0.105, c.shoes);
  blob(gb, 0.10, -0.38, 0, 0.06, 0.045, 0.05, c.shoes, 8, 6);
  loft(gb, [
    { y: -0.37, rx: 0.05, rz: 0.052, color: c.shoes },
    { y: -0.28, rx: 0.048, rz: 0.05, color: c.shoes },
  ], c.shoes, 8, false);
  return smoothNormals(gb.build(), 1.15);
}

/** Ragnatela di crepe su canvas, per il parabrezza rotto. */
function crackedGlassTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c9d3de';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  for (let k = 0; k < 3; k++) {
    const cx = 40 + Math.random() * (S - 80), cy = 40 + Math.random() * (S - 80);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      let x = cx, y = cy;
      ctx.lineWidth = 1 + Math.random();
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += Math.cos(a + (Math.random() - 0.5)) * (8 + Math.random() * 16);
        y += Math.sin(a + (Math.random() - 0.5)) * (8 + Math.random() * 16);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let r = 8; r < 46; r += 12) {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeCharacter(opts = {}) {
  const skin = opts.skin ?? pick(SKINS);
  const shirt = opts.shirt ?? pick(SHIRTS);
  const pants = opts.pants ?? pick(PANTS);
  const hair = opts.hair ?? pick(HAIR);
  const c = {
    skin, shirt, pants, hair,
    shoes: opts.shoes ?? pick(SHOES),
    eyes: pick([0x3b2a1a, 0x2a3f5a, 0x2f4a2a, 0x1a1512]),
    cap: pick(SHIRTS),
    hairStyle: opts.hairStyle ?? (Math.random() < 0.55 ? 0 : Math.random() < 0.6 ? 1 : 2),
    shortSleeve: Math.random() < 0.6,
    shorts: Math.random() < 0.25,
    sleeve: shirt,
    // sopra la maglietta: niente, giacca o felpa
    outfit: opts.outfit ?? pick(['tee', 'tee', 'jacket', 'jacket', 'hoodie']),
    jacket: opts.jacket ?? pick(JACKETS),
    belt: pick([0x2b2119, 0x1a1d22, 0x3a2b1e]),
  };
  if (c.outfit !== 'tee') { c.shortSleeve = false; c.sleeve = c.jacket; }

  const group = new THREE.Group();
  const bodyGeo = buildBody(c);
  const armGeo = buildArm(c);
  const foreGeo = buildForearm(c);
  const legGeo = buildLeg(c);
  const shinGeo = buildShin(c);

  const torso = new THREE.Mesh(bodyGeo, shared.bodyMat);
  torso.position.y = WAIST;
  // le braccia sono figlie del busto: seguono torsioni e inclinazioni
  const armZ = c.outfit === 'tee' ? 0.175 : 0.196;
  const larm = new THREE.Mesh(armGeo, shared.bodyMat); larm.position.set(0, SHOULDER - WAIST, armZ);
  const rarm = new THREE.Mesh(armGeo, shared.bodyMat); rarm.position.set(0, SHOULDER - WAIST, -armZ);
  const lleg = new THREE.Mesh(legGeo, shared.bodyMat); lleg.position.set(0, HIP, 0.085);
  const rleg = new THREE.Mesh(legGeo, shared.bodyMat); rleg.position.set(0, HIP, -0.085);
  // gomiti e ginocchia: i segmenti bassi sono figli di quelli alti e si piegano
  const lfore = new THREE.Mesh(foreGeo, shared.bodyMat); lfore.position.y = -0.30;
  const rfore = new THREE.Mesh(foreGeo, shared.bodyMat); rfore.position.y = -0.30;
  const lshin = new THREE.Mesh(shinGeo, shared.bodyMat); lshin.position.y = -0.42;
  const rshin = new THREE.Mesh(shinGeo, shared.bodyMat); rshin.position.y = -0.42;
  larm.add(lfore); rarm.add(rfore);
  lleg.add(lshin); rleg.add(rshin);
  torso.add(larm, rarm);
  group.add(torso, lleg, rleg);

  if (shared.quality.shadows) {
    for (const m of [torso, larm, rarm, lleg, rleg, lfore, rfore, lshin, rshin]) {
      m.castShadow = true; m.receiveShadow = true;
    }
  } else {
    const sh = new THREE.Mesh(shared.shadowGeo, shared.shadowMat);
    sh.position.y = 0.03;
    group.add(sh);
  }

  group.userData.parts = { torso, larm, rarm, lleg, rleg, lfore, rfore, lshin, rshin };
  group.userData.colors = c;
  group.userData.geo = { bodyGeo, armGeo, foreGeo, legGeo, shinGeo };
  group.userData.phase = Math.random() * 6.28;
  return group;
}

/** Cambia i vestiti ricostruendo le geometrie con i nuovi colori. */
export function dressCharacter(group, shirtHex, pantsHex) {
  const c = group.userData.colors;
  if (!c) return;
  c.shirt = shirtHex; c.sleeve = shirtHex; c.pants = pantsHex;
  const p = group.userData.parts;
  const g = group.userData.geo;
  for (const k of ['bodyGeo', 'armGeo', 'foreGeo', 'legGeo', 'shinGeo']) g[k].dispose();
  g.bodyGeo = buildBody(c); g.armGeo = buildArm(c); g.foreGeo = buildForearm(c);
  g.legGeo = buildLeg(c); g.shinGeo = buildShin(c);
  p.torso.geometry = g.bodyGeo;
  p.larm.geometry = g.armGeo; p.rarm.geometry = g.armGeo;
  p.lfore.geometry = g.foreGeo; p.rfore.geometry = g.foreGeo;
  p.lleg.geometry = g.legGeo; p.rleg.geometry = g.legGeo;
  p.lshin.geometry = g.shinGeo; p.rshin.geometry = g.shinGeo;
}

export function randomPedColors() {
  return { skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR) };
}

/**
 * Animazione procedurale. Oltre a camminata e corsa gestisce i gesti di
 * chi sta fermo (parla, telefona, fuma, saluta, appoggiato al muro) e le
 * reazioni: sussulto, guardia, terrore, caduta e rialzata.
 * Il progresso delle azioni una tantum si legge da userData.actionT (0..1).
 */
/**
 * Piega gomiti e ginocchia in base a quanto e' avanzato il segmento alto:
 * il gomito va solo in avanti, il ginocchio solo all'indietro.
 */
function bendJoints(p) {
  const elbow = (s) => Math.min(1.55, 0.18 + Math.max(0, -s) * 0.34 + Math.max(0, s) * 0.6);
  const knee = (s) => -Math.min(2.0, 0.06 + Math.max(0, -s) * 0.85 + Math.max(0, s) * 0.82);
  p.lfore.rotation.z = elbow(p.larm.rotation.z);
  p.rfore.rotation.z = elbow(p.rarm.rotation.z);
  p.lshin.rotation.z = knee(p.lleg.rotation.z);
  p.rshin.rotation.z = knee(p.rleg.rotation.z);
}

export function animateCharacter(group, speed, t, state = 'walk', punchT = 0) {
  poseCharacter(group, speed, t, state, punchT);
  if (group.userData.parts && group.userData.parts.lfore) bendJoints(group.userData.parts);
}

function poseCharacter(group, speed, t, state = 'walk', punchT = 0) {
  const p = group.userData.parts;
  if (!p) return;
  const at = group.userData.actionT || 0;
  const ph = group.userData.phase || 0;   // sfasamento per non muoversi tutti uguali

  const reset = () => {
    group.rotation.z = 0;
    p.torso.rotation.set(0, 0, 0);
    p.larm.rotation.set(-(0.12), 0, 0);
    p.rarm.rotation.set(-(-0.12), 0, 0);
    p.lleg.rotation.set(-(0.02), 0, 0);
    p.rleg.rotation.set(-(-0.02), 0, 0);
  };

  // ---- a terra e rialzata
  if (state === 'down' || state === 'getup') {
    const k = state === 'down' ? 1 : 1 - Math.min(at, 1);
    group.rotation.z = -Math.PI / 2.05 * k;
    group.position.y = 0.32 * k;
    p.larm.rotation.set(-(0.4 * k), 0, -(0.5 * k));
    p.rarm.rotation.set(-(-0.3 * k), 0, -(-0.7 * k));
    p.lleg.rotation.set(0, 0, -(0.35 * k));
    p.rleg.rotation.set(-(0.2 * k), 0, -(-0.15 * k));
    p.torso.rotation.set(0, 0, -(0.3 * k));
    return;
  }
  group.position.y = 0;

  // ---- reazioni brevi
  if (state === 'flinch') {
    const k = Math.sin(Math.min(at, 1) * Math.PI);
    reset();
    p.torso.rotation.z = -(-0.5 * k);
    p.torso.rotation.y = 0.25 * k;
    p.larm.rotation.set(-(0.5 * k), 0, -(-1.5 * k));
    p.rarm.rotation.set(-(-0.6 * k), 0, -(-1.3 * k));
    p.lleg.rotation.z = -(0.2 * k);
    p.rleg.rotation.z = -(-0.25 * k);
    return;
  }
  if (state === 'cower') {
    const b = Math.sin(t * 7 + ph) * 0.04;
    reset();
    p.torso.rotation.z = -(0.55 + b);
    p.larm.rotation.set(-(0.7), 0, -(-2.5));
    p.rarm.rotation.set(-(-0.7), 0, -(-2.5));
    p.lleg.rotation.z = -(0.45);
    p.rleg.rotation.z = -(0.45);
    return;
  }
  if (state === 'fight') {
    const b = Math.sin(t * 6 + ph);
    reset();
    p.torso.rotation.y = -0.3;
    p.larm.rotation.set(-(0.55), 0, -(-1.25 + b * 0.12));
    p.rarm.rotation.set(-(-0.5), 0, -(-1.15 - b * 0.12));
    p.lleg.rotation.z = -(0.22);
    p.rleg.rotation.z = -(-0.22);
    if (punchT > 0) {
      const k = Math.sin(Math.min(punchT, 1) * Math.PI);
      p.rarm.rotation.set(-(-0.15 - 0.3 * k), 0, -(-1.75 * k - 0.3));
      p.torso.rotation.y = -0.3 - 0.35 * k;
    }
    return;
  }

  // ---- gesti di chi sta fermo
  const idleBob = Math.sin(t * 1.5 + ph) * 0.02;
  if (state === 'talk' || state === 'phone' || state === 'smoke' || state === 'wave' ||
      state === 'lean' || state === 'watch' || state === 'sit' || state === 'aim') {
    reset();
    p.torso.position.y = 1.02 + idleBob;

    if (state === 'talk') {
      const g1 = Math.sin(t * 3.4 + ph), g2 = Math.sin(t * 2.1 + ph * 2);
      p.rarm.rotation.set(-(-0.45 - g1 * 0.2), 0, -(-0.75 - g1 * 0.45));
      p.larm.rotation.set(-(0.35), 0, -(-0.35 - g2 * 0.3));
      p.torso.rotation.y = g2 * 0.1;
    } else if (state === 'phone') {
      p.rarm.rotation.set(-(-0.55), 0, -(-2.35));
      p.larm.rotation.set(-(0.2), 0, -(-0.25));
      p.torso.rotation.y = -0.12 + Math.sin(t * 1.2 + ph) * 0.06;
      p.torso.rotation.x = -(0.05);
    } else if (state === 'smoke') {
      const cycle = (Math.sin(t * 0.7 + ph) + 1) / 2;
      const up = Math.pow(cycle, 4);
      p.rarm.rotation.set(-(-0.3 - up * 0.35), 0, -(-0.4 - up * 1.9));
      p.larm.rotation.set(-(0.18), 0, -(-0.1));
      p.torso.rotation.y = 0.08;
    } else if (state === 'wave') {
      p.rarm.rotation.set(-(-0.4 + Math.sin(t * 7 + ph) * 0.5), 0, -(-2.5));
      p.larm.rotation.set(-(0.2), 0, -(-0.15));
    } else if (state === 'lean') {
      p.torso.rotation.z = -(-0.14);
      p.larm.rotation.set(-(0.9), 0, -(-1.15));
      p.rarm.rotation.set(-(-0.9), 0, -(-1.15));
      p.lleg.rotation.z = -(-0.12);
      p.rleg.rotation.set(-(-0.35), 0, -(0.1));
    } else if (state === 'watch') {
      p.rarm.rotation.set(-(-0.35), 0, -(-1.9));     // telefono alzato a filmare
      p.larm.rotation.set(-(0.4), 0, -(-1.6));
      p.torso.rotation.z = -(-0.06);
    } else if (state === 'sit') {
      p.lleg.rotation.set(-(0.12), 0, -(-1.4));
      p.rleg.rotation.set(-(-0.12), 0, -(-1.4));
      p.larm.rotation.set(-(0.25), 0, -(-0.85));
      p.rarm.rotation.set(-(-0.25), 0, -(-0.85));
      p.torso.rotation.z = -(0.12);
    } else if (state === 'aim') {
      p.rarm.rotation.set(-(-0.05), 0, -(-1.55));
      p.larm.rotation.set(-(0.25), 0, -(-1.35));
      p.torso.rotation.y = -0.25;
    }
    return;
  }

  // ---- camminata / corsa
  const run = speed > 3.6;
  const panic = state === 'panic';
  const f = Math.min(speed, 7) * (run ? 1.9 : 2.6) + 1.2;
  const amp = Math.min(0.28 + speed * 0.11, 1.05);
  const sw = Math.sin(t * f + ph) * amp;

  p.lleg.rotation.z = -(sw);
  p.rleg.rotation.z = -(-sw);
  p.lleg.rotation.x = -(0.02);
  p.rleg.rotation.x = -(-0.02);
  if (panic) {
    // braccia alzate: la corsa spaventata si riconosce da lontano
    const flail = Math.sin(t * 11 + ph) * 0.35;
    p.larm.rotation.set(-(0.5), 0, -(-2.6 + flail));
    p.rarm.rotation.set(-(-0.5), 0, -(-2.6 - flail));
  } else {
    p.larm.rotation.z = -(-sw * 0.8);
    p.rarm.rotation.z = -(sw * 0.8);
    p.larm.rotation.x = -(0.12 + Math.abs(sw) * 0.05);
    p.rarm.rotation.x = -(-0.12 - Math.abs(sw) * 0.05);
  }
  p.torso.rotation.z = -(Math.min(speed * 0.024, 0.2) + (panic ? 0.12 : 0));
  p.torso.rotation.y = -sw * 0.12;

  const bob = Math.abs(Math.sin(t * f + ph)) * Math.min(speed * 0.014, 0.06) + idleBob;
  p.torso.position.y = 1.02 + bob;

  if (punchT > 0) {
    const k = Math.sin(Math.min(punchT, 1) * Math.PI);
    p.rarm.rotation.z = -(-1.75 * k);
    p.rarm.rotation.x = -(-0.12 - 0.35 * k);
    p.torso.rotation.y = -0.35 * k;
  }
}

export { shared, hull, taper };
