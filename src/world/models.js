import * as THREE from 'three';
import { GeoBuilder, pick, rand, TAU, smoothNormals } from '../core/utils.js';

/**
 * Modelli di auto e personaggi. Niente scatole impilate: le carrozzerie
 * nascono da sezioni trasversali collegate tra loro (come una barca) e gli
 * arti sono tronchi di cono, cosi' le silhouette leggono come vere.
 */

/* ------------------------------------------------------- helper geometrici */

/** Collega una serie di sezioni ottagonali lungo l'asse X. */
function hull(gb, sections, color, uv = 0.35) {
  const ringOf = (s) => {
    const { hw, yb, yt } = s;
    const bx = Math.min(hw * 0.32, 0.16), by = Math.min((yt - yb) * 0.3, 0.14);
    return [
      [s.x, yb + by, hw], [s.x, yb, hw - bx], [s.x, yb, -(hw - bx)], [s.x, yb + by, -hw],
      [s.x, yt - by, -hw], [s.x, yt, -(hw - bx)], [s.x, yt, hw - bx], [s.x, yt - by, hw],
    ];
  };
  let prev = ringOf(sections[0]);
  // tappo anteriore
  for (let i = 1; i < prev.length - 1; i++) gb.quad(prev[0], prev[i], prev[i + 1], prev[i + 1], color, uv, uv);
  for (let s = 1; s < sections.length; s++) {
    const cur = ringOf(sections[s]);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      gb.quad(prev[i], cur[i], cur[j], prev[j], color, uv, uv);
    }
    prev = cur;
  }
  for (let i = 1; i < prev.length - 1; i++) gb.quad(prev[0], prev[i + 1], prev[i], prev[i], color, uv, uv);
}

/** Cilindro/tronco di cono generico lungo l'asse Y, con tappi. */
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
function wheel(gb, x, y, z, r, w, side) {
  const N = 16;
  const ringZ = (zz, rr) => {
    const out = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      out.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr, zz]);
    }
    return out;
  };
  const zi = z - side * w / 2, zo = z + side * w / 2;
  const tread = ringZ(zi + side * w * 0.12, r);
  const treadO = ringZ(zo - side * w * 0.12, r);
  const shoulderI = ringZ(zi, r * 0.93);
  const shoulderO = ringZ(zo, r * 0.93);
  const rim = ringZ(zo + side * 0.004, r * 0.6);
  const hub = ringZ(zo + side * 0.008, r * 0.2);
  const flip = side > 0;
  const q = (a, b, c, d, col) => (flip ? gb.quad(a, b, c, d, col, 1, 1) : gb.quad(d, c, b, a, col, 1, 1));

  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    q(tread[i], tread[j], treadO[j], treadO[i], 0x18191d);                 // battistrada
    q(shoulderI[i], shoulderI[j], tread[j], tread[i], 0x131417);           // spalle
    q(treadO[i], treadO[j], shoulderO[j], shoulderO[i], 0x131417);
    q(shoulderO[i], shoulderO[j], rim[j], rim[i], 0x24262b);               // fianco interno
    q(rim[i], rim[j], hub[j], hub[i], 0xb9c0c8);                           // cerchio in lega
    // razze scure ogni tre settori: da fuori sembra un cerchio a raggi
    if (i % 3 === 0) {
      q([x + Math.cos((i / N) * TAU) * r * 0.55, y + Math.sin((i / N) * TAU) * r * 0.55, zo + side * 0.012],
        [x + Math.cos(((i + 1) / N) * TAU) * r * 0.55, y + Math.sin(((i + 1) / N) * TAU) * r * 0.55, zo + side * 0.012],
        [x + Math.cos(((i + 1) / N) * TAU) * r * 0.26, y + Math.sin(((i + 1) / N) * TAU) * r * 0.26, zo + side * 0.012],
        [x + Math.cos((i / N) * TAU) * r * 0.26, y + Math.sin((i / N) * TAU) * r * 0.26, zo + side * 0.012],
        0x2b2f36);
    }
  }
  for (let i = 1; i < N - 1; i++) {
    q(hub[0], hub[i], hub[i + 1], hub[i + 1], 0xdfe4e8);                   // mozzo
  }
}

/* ------------------------------------------------------------------ auto */

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

export const CAR_COLORS = [
  0xa8232b, 0x1d4f8f, 0xe6e4de, 0x121418, 0x1f7a4a, 0xe0a62c, 0x6f767e,
  0x53308f, 0xd45f18, 0x0f8fa8, 0xa9b2bd, 0x4a2c18, 0xd6c9ae, 0x24354d,
  0x8f1f3f, 0x2f8f6f, 0xf0e8d8, 0x3a3f47, 0xbf5a1f, 0x146ba8,
];

const shared = {};

function buildCarGeo(t, kind) {
  const body = new GeoBuilder();    // verniciato (colore dal materiale)
  const trim = new GeoBuilder();    // paraurti, ruote, griglie
  const glass = new GeoBuilder();
  const lights = new GeoBuilder();

  hull(body, t.body, 0xffffff);
  // vetri: la cabina e' vetro, con un profilo leggermente piu' stretto
  hull(glass, t.cabin.map((s) => ({ ...s, hw: s.hw * 0.99 })), 0x2b3644);
  // montanti e tetto in tinta carrozzeria
  const roof = t.cabin.map((s) => ({ x: s.x, hw: s.hw * 0.93, yb: s.yt - 0.1, yt: s.yt }));
  hull(body, roof, 0xffffff);

  // paraurti, mascherina, cromature
  const fr = t.body[0], rr = t.body[t.body.length - 1];
  // profilo cromato attorno ai vetri
  for (const s of [-1, 1]) {
    for (let i = 0; i < t.cabin.length - 1; i++) {
      const a = t.cabin[i], b = t.cabin[i + 1];
      trim.quad(
        [a.x, a.yt - 0.02, s * (a.hw + 0.012)], [b.x, b.yt - 0.02, s * (b.hw + 0.012)],
        [b.x, b.yb + 0.02, s * (b.hw + 0.012)], [a.x, a.yb + 0.02, s * (a.hw + 0.012)],
        0x9aa2ab, 1, 1);
    }
  }
  trim.box(fr.x - 0.06, fr.yb + 0.16, 0, 0.28, 0.3, t.W * 0.9, 0x2b3037);
  trim.box(rr.x + 0.06, rr.yb + 0.16, 0, 0.28, 0.3, t.W * 0.9, 0x2b3037);
  trim.box(fr.x - 0.1, fr.yb + 0.42, 0, 0.16, 0.22, t.W * 0.62, 0x353b43);
  // specchietti
  for (const s of [-1, 1]) {
    trim.box(t.cabin[0].x + 0.1, t.cabin[0].yb + 0.14, s * (t.W / 2 + 0.02), 0.24, 0.14, 0.3, 0x2f353c);
  }
  // ruote
  const wr = t.wheel, ww = 0.28;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      wheel(trim, sx * t.wx, wr, sz * (t.W / 2 + 0.01), wr, ww, sz);
      // passaruota scuro + parafango in tinta
      trim.box(sx * t.wx, wr + 0.05, sz * (t.W / 2 - 0.18), wr * 2.2, wr * 1.6, 0.34, 0x14161a);
      body.box(sx * t.wx, wr + 0.42, sz * (t.W / 2 - 0.1), wr * 2.4, 0.26, 0.32, 0xffffff);
    }
  }
  // targhe
  trim.box(fr.x - 0.12, fr.yb + 0.12, 0, 0.06, 0.16, 0.55, 0xe8e6de);
  trim.box(rr.x + 0.12, rr.yb + 0.12, 0, 0.06, 0.16, 0.55, 0xe8e6de);
  // scarico
  trim.box(rr.x + 0.06, rr.yb - 0.02, 0.42, 0.28, 0.11, 0.11, 0x8d949c);
  // tetto leggermente piu' scuro: due tinte senza costare nulla
  const roofTop = t.cabin.map((sec) => ({ x: sec.x, hw: sec.hw * 0.9, yb: sec.yt - 0.04, yt: sec.yt + 0.005 }));
  hull(body, roofTop, 0xd8d8d8);

  // fari e stop
  lights.box(fr.x - 0.02, fr.yb + 0.42, t.W * 0.3, 0.1, 0.22, 0.5, 0xfff0cc);
  lights.box(fr.x - 0.02, fr.yb + 0.42, -t.W * 0.3, 0.1, 0.22, 0.5, 0xfff0cc);
  lights.box(rr.x + 0.02, rr.yb + 0.44, t.W * 0.31, 0.09, 0.2, 0.46, 0xd82b1e);
  lights.box(rr.x + 0.02, rr.yb + 0.44, -t.W * 0.31, 0.09, 0.2, 0.46, 0xd82b1e);

  if (kind === 'police') {
    trim.box(t.cabin[1].x, t.cabin[1].yt + 0.1, 0, 1.15, 0.14, 1.2, 0x1a1d24);
    trim.box(0, t.body[2].yt + 0.02, t.W / 2 - 0.02, 2.2, 0.5, 0.06, 0xf0f2f5);   // fascia laterale
    trim.box(0, t.body[2].yt + 0.02, -(t.W / 2 - 0.02), 2.2, 0.5, 0.06, 0xf0f2f5);
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
      trim.box(0, 1.5, s * (t.W / 2 - 0.01), 3.2, 0.34, 0.05, 0xd0342c);       // fascia rossa
      trim.box(0.4, 2.0, s * (t.W / 2 - 0.01), 0.9, 0.24, 0.06, 0xd0342c);     // croce
      trim.box(0.4, 2.0, s * (t.W / 2 - 0.01), 0.24, 0.9, 0.06, 0xd0342c);
    }
  }
  if (kind === 'bus') {
    for (const s of [-1, 1]) {
      trim.box(0, 1.15, s * (t.W / 2 - 0.01), 8.6, 0.24, 0.05, 0x2f6fd0);
    }
    trim.box(4.1, 2.85, 0, 1.2, 0.34, 1.6, 0x1b2027);      // display di linea
  }
  return {
    body: smoothNormals(body.build(), 0.95),
    trim: trim.build(),
    glass: smoothNormals(glass.build(), 1.2),
    lights: lights.build(),
  };
}

export function initModels(quality) {
  shared.quality = quality;
  shared.trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.55, envMapIntensity: 1.0 });
  shared.glassMat = new THREE.MeshStandardMaterial({
    color: 0x10161e, roughness: 0.14, metalness: 0.08, envMapIntensity: 0.85,
    transparent: true, opacity: 0.9,
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
  const glass = new THREE.Mesh(g.glass, shared.glassMat);
  const lights = new THREE.Mesh(g.lights, shared.lightMat);
  lights.visible = false;
  if (shared.quality.shadows) {
    body.castShadow = trim.castShadow = true;
    body.receiveShadow = true;
  }
  group.add(body, trim, glass, lights);

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

  // --- spalle arrotondate
  for (const s of [-1, 1]) blob(gb, 0, 1.465, s * 0.175, 0.085, 0.085, 0.09, shirt, 10, 6);

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
  loft(gb, [
    { y: 0.02, rx: 0.062, rz: 0.062, color: sleeve },
    { y: -0.10, rx: 0.058, rz: 0.058, color: sleeve },
    { y: -0.19, rx: 0.052, rz: 0.052, color: c.shortSleeve ? c.skin : sleeve },
    { y: -0.30, rx: 0.047, rz: 0.047, color: c.shortSleeve ? c.skin : sleeve },
  ], c.skin, 9);
  blob(gb, 0, -0.30, 0, 0.048, 0.048, 0.048, c.shortSleeve ? c.skin : sleeve, 8, 6);  // gomito
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
  };

  const group = new THREE.Group();
  const bodyGeo = buildBody(c);
  const armGeo = buildArm(c);
  const foreGeo = buildForearm(c);
  const legGeo = buildLeg(c);
  const shinGeo = buildShin(c);

  const torso = new THREE.Mesh(bodyGeo, shared.bodyMat);
  torso.position.y = WAIST;
  // le braccia sono figlie del busto: seguono torsioni e inclinazioni
  const larm = new THREE.Mesh(armGeo, shared.bodyMat); larm.position.set(0, SHOULDER - WAIST, 0.175);
  const rarm = new THREE.Mesh(armGeo, shared.bodyMat); rarm.position.set(0, SHOULDER - WAIST, -0.175);
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
