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

/** Ruota completa (pneumatico + cerchio), asse lungo Z. */
function wheel(gb, x, y, z, r, w, side) {
  const N = 14;
  const ringZ = (zz, rr) => {
    const out = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      out.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr, zz]);
    }
    return out;
  };
  const inner = ringZ(z - side * w / 2, r), outer = ringZ(z + side * w / 2, r);
  const flip = side > 0;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    // battistrada: il verso dipende da quale fianco stiamo costruendo
    if (flip) gb.quad(inner[i], inner[j], outer[j], outer[i], 0x14161a, 1, 1);
    else gb.quad(inner[i], outer[i], outer[j], inner[j], 0x14161a, 1, 1);
  }
  // fianco e cerchio
  const rimO = ringZ(z + side * (w / 2 + 0.005), r * 0.62);
  const hub = [x, y, z + side * (w / 2 + 0.01)];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    if (flip) {
      gb.quad(outer[i], outer[j], rimO[j], rimO[i], 0x1c1f24, 1, 1);
      gb.quad(hub, rimO[i], rimO[j], rimO[j], 0xa8aeb6, 1, 1);
    } else {
      gb.quad(outer[j], outer[i], rimO[i], rimO[j], 0x1c1f24, 1, 1);
      gb.quad(hub, rimO[j], rimO[i], rimO[i], 0xa8aeb6, 1, 1);
    }
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
  0xb02b2b, 0x22528f, 0xe8e6e0, 0x15171c, 0x2b7a4b, 0xd9a520, 0x7d848c,
  0x5a3f8f, 0xd06a20, 0x1f8f9c, 0x9aa3ad, 0x53331f, 0xc9b8a0, 0x2f3f55,
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

  // paraurti e mascherina
  const fr = t.body[0], rr = t.body[t.body.length - 1];
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
  shared.charGeo = characterGeometries();
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
  const bodyMat = new THREE.MeshStandardMaterial({
    color, vertexColors: true, roughness: 0.34, metalness: 0.45, envMapIntensity: 1.0,
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

const SKINS = [0xf1c9a5, 0xe0ad80, 0xc98e5e, 0x9c6b45, 0x724c30, 0xffd9b5];
const SHIRTS = [0x2f6fd0, 0xc0392b, 0x2b9e5f, 0xeceff2, 0x2b2f38, 0xd9a520, 0x7d4fbf, 0xd06a2f, 0x1f8f9c, 0x8a97a8];
const PANTS = [0x2b3444, 0x3b3f4a, 0x1f2632, 0x5a4632, 0x6b7280, 0x243b55, 0x8a8271];
const HAIR = [0x241a12, 0x4b3220, 0x8a6a35, 0x101010, 0xa8a29a, 0x6b3a1f];

/** Geometrie condivise: costruite una volta, usate da tutti i bot. */
function characterGeometries() {
  const mk = (fn) => { const gb = new GeoBuilder(); fn(gb); return smoothNormals(gb.build(), 1.1); };

  // busto: spalle larghe, vita stretta, leggero spessore
  const torso = mk((gb) => {
    hull(gb, [
      { x: 0.10, hw: 0.20, yb: 0.00, yt: 0.60 },
      { x: 0.05, hw: 0.24, yb: -0.01, yt: 0.64 },
      { x: -0.05, hw: 0.24, yb: -0.01, yt: 0.64 },
      { x: -0.10, hw: 0.20, yb: 0.00, yt: 0.60 },
    ], 0xffffff);
    // collo
    taper(gb, 0, 0.58, 0.70, 0.078, 0.072, 0xe8b48c, 8);
  });
  const hips = mk((gb) => {
    hull(gb, [
      { x: 0.09, hw: 0.17, yb: 0, yt: 0.26 }, { x: -0.09, hw: 0.17, yb: 0, yt: 0.26 },
    ], 0xffffff);
  });
  // testa: sfera schiacciata, non un cubo — e' la prima cosa che si nota
  const head = new THREE.SphereGeometry(0.128, 14, 10);
  head.scale(1.02, 1.1, 0.94);
  head.translate(0, 0.12, 0);
  const headGB = new GeoBuilder();
  headGB.box(0.115, 0.115, 0, 0.05, 0.045, 0.038, 0xffffff);          // naso
  headGB.box(0.1, 0.15, 0.048, 0.03, 0.026, 0.032, 0x2a2622);         // occhi
  headGB.box(0.1, 0.15, -0.048, 0.03, 0.026, 0.032, 0x2a2622);
  headGB.box(-0.005, 0.055, 0, 0.09, 0.02, 0.05, 0xd88a7a);           // bocca
  const headFull = mergeRaw([head, headGB.build()]);

  // capelli: calotta sferica leggermente piu' grande
  const hairGeo = new THREE.SphereGeometry(0.138, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58);
  hairGeo.scale(1.02, 1.15, 0.98);
  hairGeo.translate(-0.008, 0.115, 0);
  const hair = hairGeo;
  // braccio: spalla -> mano, il pivot e' in alto (y = 0)
  const arm = mk((gb) => {
    taper(gb, 0, -0.30, 0.0, 0.068, 0.082, 0xffffff, 8);
    taper(gb, 0, -0.56, -0.30, 0.058, 0.068, 0xffffff, 8);
    taper(gb, 0, -0.66, -0.56, 0.048, 0.055, 0xf4f4f4, 8);   // mano
  });
  // gamba: anca -> piede
  const leg = mk((gb) => {
    taper(gb, 0, -0.42, 0.0, 0.084, 0.108, 0xffffff, 9);
    taper(gb, 0, -0.78, -0.42, 0.062, 0.084, 0xffffff, 9);
    // scarpa: suola bassa e punta arrotondata
    taper(gb, 0, -0.84, -0.78, 0.07, 0.065, 0x3a3a3a, 8);
    gb.box(0.035, -0.855, 0, 0.2, 0.07, 0.1, 0x333333);
    gb.box(0.09, -0.878, 0, 0.1, 0.03, 0.085, 0x2b2b2b);
  });
  return { parts: { torso, hips, head: headFull, hair }, arm, leg };
}

/** Fonde geometrie qualsiasi in una sola (senza colori). */
function mergeRaw(geos) {
  const pos = [], nor = [], uv = [], idx = [];
  let off = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
    }
    const index = g.index;
    if (index) for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

/** Unisce le parti del corpo in una geometria sola, colori nei vertici. */
function mergeBody(parts, colors) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const geo = new THREE.BufferGeometry();
  const c = new THREE.Color();
  let vOff = 0;
  for (const part of parts) {
    const p = part.geo.attributes.position, n = part.geo.attributes.normal, t = part.geo.attributes.uv;
    c.setHex(colors[part.color]);
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i) + part.y, p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
      col.push(c.r, c.g, c.b);
    }
    const index = part.geo.index;
    if (index) for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + vOff);
    else for (let i = 0; i < p.count; i++) idx.push(i + vOff);
    vOff += p.count;
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

export function makeCharacter(opts = {}) {
  const G = shared.charGeo;
  const skinCol = opts.skin ?? pick(SKINS);
  const skin = new THREE.MeshStandardMaterial({ color: skinCol, roughness: 0.72, metalness: 0, vertexColors: true });
  const shirt = new THREE.MeshStandardMaterial({ color: opts.shirt ?? pick(SHIRTS), roughness: 0.85, metalness: 0, vertexColors: true });
  const pants = new THREE.MeshStandardMaterial({ color: opts.pants ?? pick(PANTS), roughness: 0.88, metalness: 0, vertexColors: true });
  const hairMat = new THREE.MeshStandardMaterial({ color: opts.hair ?? pick(HAIR), roughness: 0.95, metalness: 0 });

  const group = new THREE.Group();
  const colors = {
    shirt: shirt.color.getHex(), pants: pants.color.getHex(),
    skin: skinCol, hair: hairMat.color.getHex(),
  };
  // busto, bacino, testa e capelli in un'unica geometria con i colori nei
  // vertici: un bot costa cinque draw call invece di otto
  const bodyGeo = mergeBody([
    { geo: G.parts.torso, y: 0, color: 'shirt' },
    { geo: G.parts.hips, y: -0.22, color: 'pants' },
    { geo: G.parts.head, y: 0.6, color: 'skin' },
    { geo: G.parts.hair, y: 0.6, color: 'hair' },
  ], {
    shirt: shirt.color.getHex(), pants: pants.color.getHex(),
    skin: skinCol, hair: hairMat.color.getHex(),
  });
  const torso = new THREE.Mesh(bodyGeo, shared.bodyMat);
  torso.position.y = 0.98;
  const larm = new THREE.Mesh(G.arm, skin); larm.position.set(0, 1.52, 0.23);
  const rarm = new THREE.Mesh(G.arm, skin); rarm.position.set(0, 1.52, -0.23);
  const lleg = new THREE.Mesh(G.leg, pants); lleg.position.set(0, 0.86, 0.10);
  const rleg = new THREE.Mesh(G.leg, pants); rleg.position.set(0, 0.86, -0.10);
  group.add(torso, larm, rarm, lleg, rleg);

  if (shared.quality.shadows) {
    for (const m of [torso, larm, rarm, lleg, rleg]) { m.castShadow = true; m.receiveShadow = true; }
  } else {
    const sh = new THREE.Mesh(shared.shadowGeo, shared.shadowMat);
    sh.position.y = 0.03;
    group.add(sh);
  }

  group.userData.parts = { torso, larm, rarm, lleg, rleg };
  group.userData.mats = { skin, shirt, pants, hairMat };
  group.userData.colors = colors;
  group.userData.phase = Math.random() * 6.28;
  return group;
}

/**
 * Animazione procedurale. Oltre a camminata e corsa gestisce i gesti di
 * chi sta fermo (parla, telefona, fuma, saluta, appoggiato al muro) e le
 * reazioni: sussulto, guardia, terrore, caduta e rialzata.
 * Il progresso delle azioni una tantum si legge da userData.actionT (0..1).
 */
export function animateCharacter(group, speed, t, state = 'walk', punchT = 0) {
  const p = group.userData.parts;
  if (!p) return;
  const at = group.userData.actionT || 0;
  const ph = group.userData.phase || 0;   // sfasamento per non muoversi tutti uguali

  const reset = () => {
    group.rotation.z = 0;
    p.torso.rotation.set(0, 0, 0);
    p.larm.rotation.set(0, 0, 0.12);
    p.rarm.rotation.set(0, 0, -0.12);
    p.lleg.rotation.set(0, 0, 0.02);
    p.rleg.rotation.set(0, 0, -0.02);
  };

  // ---- a terra e rialzata
  if (state === 'down' || state === 'getup') {
    const k = state === 'down' ? 1 : 1 - Math.min(at, 1);
    group.rotation.z = -Math.PI / 2.05 * k;
    group.position.y = 0.32 * k;
    p.larm.rotation.set(0.5 * k, 0, 0.4 * k);
    p.rarm.rotation.set(-0.7 * k, 0, -0.3 * k);
    p.lleg.rotation.set(0.35 * k, 0, 0);
    p.rleg.rotation.set(-0.15 * k, 0, 0.2 * k);
    p.torso.rotation.set(0.3 * k, 0, 0);
    return;
  }
  group.position.y = 0;

  // ---- reazioni brevi
  if (state === 'flinch') {
    const k = Math.sin(Math.min(at, 1) * Math.PI);
    reset();
    p.torso.rotation.x = -0.5 * k;
    p.torso.rotation.y = 0.25 * k;
    p.larm.rotation.set(-1.5 * k, 0, 0.5 * k);
    p.rarm.rotation.set(-1.3 * k, 0, -0.6 * k);
    p.lleg.rotation.x = 0.2 * k;
    p.rleg.rotation.x = -0.25 * k;
    return;
  }
  if (state === 'cower') {
    const b = Math.sin(t * 7 + ph) * 0.04;
    reset();
    p.torso.rotation.x = 0.55 + b;
    p.larm.rotation.set(-2.5, 0, 0.7);
    p.rarm.rotation.set(-2.5, 0, -0.7);
    p.lleg.rotation.x = 0.45;
    p.rleg.rotation.x = 0.45;
    return;
  }
  if (state === 'fight') {
    const b = Math.sin(t * 6 + ph);
    reset();
    p.torso.rotation.y = -0.3;
    p.larm.rotation.set(-1.25 + b * 0.12, 0, 0.55);
    p.rarm.rotation.set(-1.15 - b * 0.12, 0, -0.5);
    p.lleg.rotation.x = 0.22;
    p.rleg.rotation.x = -0.22;
    if (punchT > 0) {
      const k = Math.sin(Math.min(punchT, 1) * Math.PI);
      p.rarm.rotation.set(-1.75 * k - 0.3, 0, -0.15 - 0.3 * k);
      p.torso.rotation.y = -0.3 - 0.35 * k;
    }
    return;
  }

  // ---- gesti di chi sta fermo
  const idleBob = Math.sin(t * 1.5 + ph) * 0.02;
  if (state === 'talk' || state === 'phone' || state === 'smoke' || state === 'wave' ||
      state === 'lean' || state === 'watch' || state === 'sit' || state === 'aim') {
    reset();
    p.torso.position.y = 0.98 + idleBob;
    p.larm.position.y = 1.52 + idleBob;
    p.rarm.position.y = 1.52 + idleBob;

    if (state === 'talk') {
      const g1 = Math.sin(t * 3.4 + ph), g2 = Math.sin(t * 2.1 + ph * 2);
      p.rarm.rotation.set(-0.75 - g1 * 0.45, 0, -0.45 - g1 * 0.2);
      p.larm.rotation.set(-0.35 - g2 * 0.3, 0, 0.35);
      p.torso.rotation.y = g2 * 0.1;
    } else if (state === 'phone') {
      p.rarm.rotation.set(-2.35, 0, -0.55);
      p.larm.rotation.set(-0.25, 0, 0.2);
      p.torso.rotation.y = -0.12 + Math.sin(t * 1.2 + ph) * 0.06;
      p.torso.rotation.z = 0.05;
    } else if (state === 'smoke') {
      const cycle = (Math.sin(t * 0.7 + ph) + 1) / 2;
      const up = Math.pow(cycle, 4);
      p.rarm.rotation.set(-0.4 - up * 1.9, 0, -0.3 - up * 0.35);
      p.larm.rotation.set(-0.1, 0, 0.18);
      p.torso.rotation.y = 0.08;
    } else if (state === 'wave') {
      p.rarm.rotation.set(-2.5, 0, -0.4 + Math.sin(t * 7 + ph) * 0.5);
      p.larm.rotation.set(-0.15, 0, 0.2);
    } else if (state === 'lean') {
      p.torso.rotation.x = -0.14;
      p.larm.rotation.set(-1.15, 0, 0.9);
      p.rarm.rotation.set(-1.15, 0, -0.9);
      p.lleg.rotation.x = -0.12;
      p.rleg.rotation.set(0.1, 0, -0.35);
    } else if (state === 'watch') {
      p.rarm.rotation.set(-1.9, 0, -0.35);     // telefono alzato a filmare
      p.larm.rotation.set(-1.6, 0, 0.4);
      p.torso.rotation.x = -0.06;
    } else if (state === 'sit') {
      p.lleg.rotation.set(-1.4, 0, 0.12);
      p.rleg.rotation.set(-1.4, 0, -0.12);
      p.larm.rotation.set(-0.85, 0, 0.25);
      p.rarm.rotation.set(-0.85, 0, -0.25);
      p.torso.rotation.x = 0.12;
    } else if (state === 'aim') {
      p.rarm.rotation.set(-1.55, 0, -0.05);
      p.larm.rotation.set(-1.35, 0, 0.25);
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

  p.lleg.rotation.x = sw;
  p.rleg.rotation.x = -sw;
  p.lleg.rotation.z = 0.02;
  p.rleg.rotation.z = -0.02;
  if (panic) {
    // braccia alzate: la corsa spaventata si riconosce da lontano
    const flail = Math.sin(t * 11 + ph) * 0.35;
    p.larm.rotation.set(-2.6 + flail, 0, 0.5);
    p.rarm.rotation.set(-2.6 - flail, 0, -0.5);
  } else {
    p.larm.rotation.x = -sw * 0.8;
    p.rarm.rotation.x = sw * 0.8;
    p.larm.rotation.z = 0.12 + Math.abs(sw) * 0.05;
    p.rarm.rotation.z = -0.12 - Math.abs(sw) * 0.05;
  }
  p.torso.rotation.x = Math.min(speed * 0.024, 0.2) + (panic ? 0.12 : 0);
  p.torso.rotation.y = -sw * 0.12;

  const bob = Math.abs(Math.sin(t * f + ph)) * Math.min(speed * 0.014, 0.06) + idleBob;
  p.torso.position.y = 0.98 + bob;
  p.larm.position.y = 1.52 + bob;
  p.rarm.position.y = 1.52 + bob;

  if (punchT > 0) {
    const k = Math.sin(Math.min(punchT, 1) * Math.PI);
    p.rarm.rotation.x = -1.75 * k;
    p.rarm.rotation.z = -0.12 - 0.35 * k;
    p.torso.rotation.y = -0.35 * k;
  }
}

/** Cambia i vestiti: ricostruisce i colori nei vertici del corpo. */
export function dressCharacter(group, shirtHex, pantsHex) {
  const colors = group.userData.colors;
  if (!colors) return;
  colors.shirt = shirtHex;
  colors.pants = pantsHex;
  const G = shared.charGeo;
  const mesh = group.userData.parts.torso;
  mesh.geometry.dispose();
  mesh.geometry = mergeBody([
    { geo: G.parts.torso, y: 0, color: 'shirt' },
    { geo: G.parts.hips, y: -0.22, color: 'pants' },
    { geo: G.parts.head, y: 0.6, color: 'skin' },
    { geo: G.parts.hair, y: 0.6, color: 'hair' },
  ], colors);
  group.userData.mats.shirt.color.setHex(shirtHex);
  group.userData.mats.pants.color.setHex(pantsHex);
}

export function randomPedColors() {
  return { skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR) };
}

export { shared, hull, taper };
