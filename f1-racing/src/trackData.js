// Definizione del tracciato "Circuito Nova": tratto finale ispirato a Spa, parte centrale tortuosa.
// Punti di controllo [x, y(altezza), z] in metri, percorsi in senso di marcia.
// La linea di traguardo è vicina al secondo punto.

export const CONTROL_POINTS = [
  [-260, 0, 0],
  [0, 0, 0],
  [110, 0.3, 0],          // fine del rettilineo
  [170, 0.6, -12],
  [188, 1, -50],          // T1
  [172, 1.5, -92],
  [130, 2, -112],
  [88, 2.5, -128],
  [76, 3, -160],          // tornante
  [110, 3, -182],
  [190, 2, -178],
  [260, 0, -150],
  [330, -2, -150],
  [380, -4, -180],        // discesa
  [375, -5, -230],
  [330, -3, -260],
  [270, 0, -262],
  [230, 3, -290],         // esse in salita
  [190, 7, -285],
  [130, 8, -265],
  [70, 9, -240],
  [20, 9, -250],          // esse del bosco
  [-40, 10, -225],
  [-110, 10, -215],
  [-170, 11, -235],       // sinistra lenta
  [-190, 12, -280],
  [-170, 13, -320],       // chicane in salita
  [-200, 14, -355],
  [-210, 16, -400],
  [-250, 17, -440],
  [-300, 18, -462],       // Les Combes
  [-330, 17.5, -490],
  [-372, 17, -500],
  [-430, 15, -482],       // Bruxelles
  [-452, 13, -440],
  [-440, 11, -392],
  [-462, 9, -330],        // Pouhon
  [-520, 7, -272],
  [-560, 6, -215],        // chicane Fagnes
  [-530, 5, -180],
  [-560, 5, -140],
  [-585, 4, -105],
  [-548, 3, -62],         // Blanchimont
  [-478, 2, -24],
  [-410, 1, -10],
  [-366, 0.5, -8],        // Bus stop
  [-334, 0.3, -19],
  [-312, 0.2, -8],
];

export const KERB_WIDTH = 1.6;
export const SAMPLE_STEP = 2;       // metri tra i campioni
// Valori della pista selezionata (binding "vivi": chi li importa vede sempre quelli correnti)
export let ROAD_HALF_WIDTH = 7;     // mezza carreggiata tipica (per campione: s.hw)
export let PIT = null;              // corsia box (coordinate lungo la pista: s negativo = prima del traguardo)
export let TRACK = null;            // definizione della pista corrente

// Circuito Nova: corsia box a destra, generata lungo il rettilineo
const NOVA_PIT = {
  entry: -215, exit: 440,      // ingresso (prima della chicane) e uscita
  bypassFrom: -165, bypassTo: -40, // la corsia taglia dritta dietro la chicane
  limitFrom: -25, limitTo: 385, // tratto a 80 km/h
  laneD: -21.5,                // centro della corsia (a destra)
  halfW: 3.2,                  // mezza larghezza della corsia
  boxFrom: 30, boxGap: 14,     // piazzole: una ogni 14 m
  speed: 80 / 3.6,
  side: -1,                    // -1 = a destra della pista, +1 = a sinistra
};
export const NOVA = {
  id: 'nova', name: 'CIRCUITO NOVA', points: CONTROL_POINTS, xzScale: 1.3, hw: 7, street: false,
  pit: NOVA_PIT, grid: { pole: 205, gap: 10, lat: 3.4 },
};

// Baku City Circuit (dati OpenStreetMap): pista cittadina, muri a filo, box a sinistra
export function bakuTrack(data) {
  return {
    id: 'baku', name: 'BAKU CITY CIRCUIT', points: data.points, xzScale: 1, hw: 6.5, street: true, data,
    lineShift: 210,               // traguardo sul rettilineo, la griglia ci sta tutta prima della curva 1
    // vie di fuga (s dei dati originali, lato esterno): curve 1, 2, 3, 4, 15, 16
    escapes: [[150, 300, -1], [495, 610, -1], [1355, 1480, -1], [1575, 1700, 1], [3585, 3700, -1], [3940, 4060, -1]],
    pitPath: data.pit,
    pit: { halfW: 3.0, speed: 80 / 3.6, side: 1, boxGap: 12 },
    grid: { pole: 300, gap: 8, lat: 3.0 },
    // sponsor sui muri a tratti, come in TV (s dal traguardo, [da, a, sinistra, destra]):
    // il titolo Qatar Airways sul rettilineo d'arrivo, un marchio per ogni zona di curve
    sponsors: [
      [5560, 5970, 'qatar', 'qatar'], [0, 160, 'qatar', 'qatar'],
      [160, 420, 'aramco', 'heineken'], [420, 820, 'pirelli', 'pirelli'],
      [820, 1500, 'crypto', 'msc'], [1500, 1700, 'dhl', 'dhl'],
      [1700, 2200, 'lenovo', 'aws'], [2200, 2600, 'salesforce', 'amex'],
      [2600, 2950, 'lv', 'lv'], [2950, 3600, 'moet', 'tag'],
      [3600, 4300, 'aramco', 'lenovo'], [4300, 4800, 'heineken', 'heineken'],
      [4800, 5200, 'amex', 'crypto'], [5200, 5560, 'aws', 'qatar'],
    ],
    pitWallBrand: 'dhl',
  };
}

// Spa-Francorchamps: pista e dintorni dal modello 3D; tracciato, larghezze, quote, cordoli,
// vie di fuga e barriere misurati sul modello (tracks/spaData.js)
export function spaTrack(data) {
  return {
    id: 'spa', name: 'SPA-FRANCORCHAMPS', points: data.points, xzScale: 1, hw: 5.5, street: false, model: true, data,
    side: data.side, sideStep: 4, prof: data.prof, profOff: data.profOff,
    lineShift: 150,               // traguardo dopo la Bus Stop, griglia prima della Source
    pitPath: data.pit,
    pit: { halfW: 3.0, speed: 80 / 3.6, side: -1, boxGap: 12 },
    grid: { pole: 140, gap: 7, lat: 2.6 },
  };
}

// marchio sul muro a distanza s (lato +1 sinistra, -1 destra)
export function sponsorAt(s, side) {
  for (const [a, b, l, r] of TRACK.sponsors || []) if (s >= a && s < b) return side > 0 ? l : r;
  return null;
}

export function selectTrack(def) {
  TRACK = def;
  ROAD_HALF_WIDTH = def.hw;
  PIT = { ...def.pit };
}
selectTrack(NOVA);

const smooth01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// scostamento laterale "di progetto" della corsia (d<0 = destra)
export function pitLaneD(ss) {
  if (ss < PIT.entry + 55) return -ROAD_HALF_WIDTH + (PIT.laneD + ROAD_HALF_WIDTH) * smooth01((ss - PIT.entry) / 55);
  if (ss > PIT.exit - 70) return PIT.laneD + (-ROAD_HALF_WIDTH + 1.5 - PIT.laneD) * smooth01((ss - (PIT.exit - 70)) / 70);
  return PIT.laneD;
}

// Percorso della corsia box nel mondo, campionato ogni metro: { pts:[{x,y,z,nx,nz,tx,tz,ss}], length }
function buildPitPath(samples, length, step, count) {
  const at = (ss, d) => {
    const s = ((ss % length) + length) % length;
    const f = s / step, i0 = Math.floor(f) % count, i1 = (i0 + 1) % count, k = f - Math.floor(f);
    const a = samples[i0], b = samples[i1];
    const nx = a.nx + (b.nx - a.nx) * k, nz = a.nz + (b.nz - a.nz) * k;
    return [a.x + (b.x - a.x) * k + nx * d, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k + nz * d];
  };
  const A = at(PIT.bypassFrom, pitLaneD(PIT.bypassFrom)), B = at(PIT.bypassTo, pitLaneD(PIT.bypassTo));
  const raw = [];
  for (let ss = PIT.entry; ss <= PIT.exit; ss += 1) {
    const q = at(ss, pitLaneD(ss));
    // dietro la chicane: linea retta tra i due estremi, raccordata dolcemente
    const w = smooth01((ss - PIT.bypassFrom) / 22) * smooth01((PIT.bypassTo - ss) / 22);
    if (w > 0) {
      const u = (ss - PIT.bypassFrom) / (PIT.bypassTo - PIT.bypassFrom);
      const lx = A[0] + (B[0] - A[0]) * u, lz = A[2] + (B[2] - A[2]) * u;
      q[0] += (lx - q[0]) * w; q[2] += (lz - q[2]) * w;
    }
    raw.push({ x: q[0], y: q[1], z: q[2], ss });
  }
  // ricampionamento a passo costante (1 m) lungo la corsia
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z));
  const L = cum[cum.length - 1], pts = [];
  let k = 0;
  for (let p = 0; p <= L; p += 1) {
    while (k < raw.length - 2 && cum[k + 1] < p) k++;
    const f = (p - cum[k]) / (cum[k + 1] - cum[k]), a = raw[k], b = raw[k + 1];
    pts.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, ss: a.ss + (b.ss - a.ss) * f });
  }
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1;
    p.tx = tx / l; p.tz = tz / l; p.nx = p.tz; p.nz = -p.tx;
  });
  PIT.startD = pitLaneD(PIT.entry);   // la corsia parte dal bordo destro della pista
  return { pts, length: pts.length - 1 };
}

// Catmull-Rom centripeta chiusa
function catmull(p0, p1, p2, p3, t) {
  const alpha = 0.5;
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), alpha) || 1e-4;
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const A1 = (t1 - tt) / (t1 - t0) * p0[k] + (tt - t0) / (t1 - t0) * p1[k];
    const A2 = (t2 - tt) / (t2 - t1) * p1[k] + (tt - t1) / (t2 - t1) * p2[k];
    const A3 = (t3 - tt) / (t3 - t2) * p2[k] + (tt - t2) / (t3 - t2) * p3[k];
    const B1 = (t2 - tt) / (t2 - t0) * A1 + (tt - t0) / (t2 - t0) * A2;
    const B2 = (t3 - tt) / (t3 - t1) * A2 + (tt - t1) / (t3 - t1) * A3;
    out[k] = (t2 - tt) / (t2 - t1) * B1 + (tt - t1) / (t2 - t1) * B2;
  }
  return out;
}

// Catmull-Rom su x, y, z; la mezza larghezza (4ª componente) varia linearmente tra i punti
function catmull4(p0, p1, p2, p3, t) {
  const out = catmull(p0, p1, p2, p3, t);
  out[3] = p1[3] + (p2[3] - p1[3]) * t;
  return out;
}

// edifici reali: distanza massima del muro prima di entrare in un edificio
function buildingProbe(buildings) {
  if (!buildings || !buildings.length) return null;
  const cell = 25, grid = new Map();
  const polys = buildings.map(b => b.p);
  polys.forEach((poly, k) => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
      const key = i + ',' + j; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(k);
    }
  });
  const inside = (x, z) => {
    const list = grid.get(Math.floor(x / cell) + ',' + Math.floor(z / cell));
    if (!list) return false;
    for (const k of list) {
      const poly = polys[k]; let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
      }
      if (c) return true;
    }
    return false;
  };
  // primo edificio lungo la normale (lato +1 sinistra, -1 destra), fino a maxD metri
  return (s, side, from, maxD) => {
    for (let d = from; d <= maxD; d += 0.75) if (inside(s.x + s.nx * d * side, s.z + s.nz * d * side)) return d;
    return Infinity;
  };
}

function separate(pts, step) {
  const n = pts.length, skip = Math.round(120 / step);
  for (let iter = 0; iter < 4; iter++) {
    const push = pts.map(() => [0, 0]);
    let any = false;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      let best = -1, bd = Infinity;
      for (let j = 0; j < n; j++) {
        let ds = Math.abs(i - j); ds = Math.min(ds, n - ds);
        if (ds < skip) continue;
        const b = pts[j], dx = b[0] - a[0], dz = b[2] - a[2];
        if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
        const d = Math.hypot(dx, dz);
        if (d < bd) { bd = d; best = j; }
      }
      if (best < 0) continue;
      const b = pts[best], want = a[3] + b[3] + 1.4;
      if (bd >= want) continue;
      const k = (want - bd) / 2 / bd;
      push[i][0] = (a[0] - b[0]) * k; push[i][1] = (a[2] - b[2]) * k;
      any = true;
    }
    if (!any) break;
    // spostamento graduale lungo il tracciato
    const W = 25;
    const sm = push.map((_, i) => {
      let x = 0, z = 0, w = 0;
      for (let j = -W; j <= W; j++) { const q = push[(i + j + n) % n], f = 1 - Math.abs(j) / (W + 1); x += q[0] * f; z += q[1] * f; w += f; }
      return [x / w * 1.6, z / w * 1.6];
    });
    pts.forEach((p, i) => { p[0] += sm[i][0]; p[2] += sm[i][1]; });
  }
}

export function buildTrack(points) {
  const def = TRACK;
  const scale = points ? 1.3 : def.xzScale;
  points = (points || def.points).map(p => [p[0] * scale, p[1], p[2] * scale, p[3] ?? def.hw]);
  // 1) curva densa
  const dense = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const segLen = Math.hypot(p2[0] - p1[0], p2[2] - p1[2]);
    const steps = Math.max(4, Math.ceil(segLen / 0.5));
    for (let j = 0; j < steps; j++) dense.push(catmull4(p0, p1, p2, p3, j / steps));
  }
  // 2) ricampionamento ad ascissa curvilinea costante
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  const length = cum[cum.length - 1];
  const count = Math.round(length / SAMPLE_STEP);
  const step = length / count;
  let pts = [];
  let k = 0;
  for (let i = 0; i < count; i++) {
    const s = i * step;
    while (cum[k + 1] < s) k++;
    const f = (s - cum[k]) / (cum[k + 1] - cum[k]);
    const a = dense[k], b = dense[(k + 1) % dense.length];
    pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f]);
  }
  // in città: due tratti affiancati (le carreggiate opposte dello stesso viale) vengono
  // allontanati quanto basta per la loro larghezza più il muro in mezzo
  if (def.street) separate(pts, step);
  // traguardo spostato indietro lungo il rettilineo (s = 0 sulla linea)
  const shift = Math.round((def.lineShift || 0) / step);
  if (shift) pts = pts.slice(count - shift).concat(pts.slice(0, count - shift));
  const sOrig = i => ((i - shift + count) % count) * step;     // s nei dati originali
  // 3) tangenti, normali (sinistra), curvatura
  const samples = pts.map((p, i) => {
    const a = pts[(i - 1 + count) % count], b = pts[(i + 1) % count];
    let tx = b[0] - a[0], tz = b[2] - a[2];
    const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    return { x: p[0], y: p[1], z: p[2], hw: p[3], s: i * step, tx, tz, nx: tz, nz: -tx, curv: 0, slope: (b[1] - a[1]) / (2 * step) };
  });
  for (let i = 0; i < count; i++) {
    const a = samples[(i - 3 + count) % count], b = samples[(i + 3) % count];
    const ha = Math.atan2(a.tz, a.tx), hb = Math.atan2(b.tz, b.tx);
    let dh = hb - ha; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    samples[i].curv = dh / (6 * step); // >0 = svolta verso destra nel piano x/z (z verso il basso)
  }
  // curvatura lisciata
  const sm = samples.map((_, i) => {
    let acc = 0; for (let j = -5; j <= 5; j++) acc += samples[(i + j + count) % count].curv; return acc / 11;
  });
  sm.forEach((c, i) => samples[i].curv = c);

  // 3b) spazio verso le altre parti di pista (a sinistra e a destra), con il campione più vicino.
  // In città due tratti possono correre affiancati (le due carreggiate di un viale):
  // la larghezza si riduce perché le due piste non si sovrappongano e in mezzo resta un solo muro.
  const street = !!def.street;
  for (let i = 0; i < count; i++) {
    const si = samples[i];
    si.clearL = si.clearR = 1e9; si.nearL = si.nearR = -1;
    for (let j = 0; j < count; j++) {
      let ds = Math.abs(i - j); ds = Math.min(ds, count - ds) * step;
      if (ds < 120) continue;
      const sj = samples[j];
      const dx = sj.x - si.x, dz = sj.z - si.z;
      if (Math.abs(dx) > 200 || Math.abs(dz) > 200) continue;
      const dist = Math.hypot(dx, dz);
      const along = Math.abs(dx * si.tx + dz * si.tz);
      if (along > dist * 0.8) continue;
      if (dx * si.nx + dz * si.nz > 0) { if (dist < si.clearL) { si.clearL = dist; si.nearL = j; } }
      else if (dist < si.clearR) { si.clearR = dist; si.nearR = j; }
    }
  }
  if (street) {
    const target = samples.map(s => Math.min(s.hw, Math.min(s.clearL, s.clearR) / 2 - 0.7));
    const lo = target.map((_, i) => { let m = Infinity; for (let j = -10; j <= 10; j++) m = Math.min(m, target[(i + j + count) % count]); return m; });
    samples.forEach((s, i) => {
      let acc = 0; for (let j = -6; j <= 6; j++) acc += lo[(i + j + count) % count];
      s.hw = Math.max(3.2, Math.min(s.hw, acc / 13, target[i]));
    });
  }

  // 4) cordoli: presenti dove la curva è significativa (su entrambi i lati)
  // (in città solo nelle curve vere: le strade hanno piccole pieghe che non sono curve)
  const kerbMask = samples.map(s => Math.abs(s.curv) > (def.street ? 0.012 : 0.0065));
  // estendi un po' i cordoli prima e dopo
  const kx = def.street ? 6 : 8;
  const ext = kerbMask.map((_, i) => {
    for (let j = -kx; j <= kx; j++) if (kerbMask[(i + j + count) % count]) return true; return false;
  });
  samples.forEach((s, i) => {
    s.kerbL = ext[i]; s.kerbR = ext[i];
    // in città niente cordolo sul lato di un tratto affiancato (c'è solo il muro in mezzo)
    if (street) { if (s.clearL < 2 * s.hw + 6) s.kerbL = false; if (s.clearR < 2 * s.hw + 6) s.kerbR = false; }
  });

  // 5) distanza delle barriere: limitata dallo spazio verso altre parti di pista
  const maxRun = street ? 24 : 26, minRun = street ? 0 : 11;
  for (let i = 0; i < count; i++) {
    const si = samples[i];
    const clearL = si.clearL, clearR = si.clearR;
    if (street) {
      // città: muri di cemento subito dopo il bordo (o il cordolo); tra due tratti affiancati
      // un solo muro a metà strada
      const base = si.hw + 1.1;
      si.wallL = Math.min(base + (si.kerbL ? KERB_WIDTH : 0), clearL / 2);
      si.wallR = Math.min(base + (si.kerbR ? KERB_WIDTH : 0), clearR / 2);
    } else {
      si.wallL = Math.max(minRun, Math.min(maxRun, clearL / 2 - 2));
      si.wallR = Math.max(minRun, Math.min(maxRun, clearR / 2 - 2));
    }
  }
  if (street) {
    // vie di fuga nelle curve dove ci sono davvero, senza entrare negli edifici
    const probe = buildingProbe(def.data && def.data.buildings);
    samples.forEach((s, i) => {
      const so = sOrig(i);
      for (const [a, b, side] of def.escapes || []) {
        if (so < a || so > b) continue;
        const t = Math.min((so - a) / 25, (b - so) / 25, 1);
        const want = s.hw + 3 + (maxRun - s.hw - 3) * Math.max(0, t);
        const clear = side > 0 ? s.clearL : s.clearR;
        const lim = Math.min(want, clear / 2);
        if (side > 0) s.wallL = Math.max(s.wallL, lim); else s.wallR = Math.max(s.wallR, lim);
        // in fondo alla via di fuga barriere ad assorbimento invece del cemento
        if (lim > s.hw + 4) { if (side > 0) s.escL = true; else s.escR = true; }
      }
      if (probe) {
        for (const side of [1, -1]) {
          const w = side > 0 ? s.wallL : s.wallR;
          const hit = probe(s, side, s.hw + 0.5, w + 2.5);
          if (hit < Infinity) { const lim = Math.max(s.hw + 0.8, hit - 1.5); if (side > 0) s.wallL = Math.min(s.wallL, lim); else s.wallR = Math.min(s.wallR, lim); }
        }
      }
    });
  }
  // più spazio all'esterno delle curve
  for (let pass = 0; pass < (street ? 2 : 6); pass++) {
    const wl = samples.map((_, i) => (samples[(i - 1 + count) % count].wallL + samples[i].wallL + samples[(i + 1) % count].wallL) / 3);
    const wr = samples.map((_, i) => (samples[(i - 1 + count) % count].wallR + samples[i].wallR + samples[(i + 1) % count].wallR) / 3);
    samples.forEach((s, i) => { s.wallL = Math.min(s.wallL, wl[i] + 0.5); s.wallR = Math.min(s.wallR, wr[i] + 0.5); });
  }

  // il muro interno non può superare il raggio di curvatura
  samples.forEach(s => {
    const r = 1 / Math.max(1e-5, Math.abs(s.curv));
    if (s.curv > 0) s.wallR = Math.min(s.wallR, r * 0.8); else s.wallL = Math.min(s.wallL, r * 0.8);
    const minW = street ? s.hw + 0.8 : ROAD_HALF_WIDTH + KERB_WIDTH + 2.5;
    s.wallL = Math.max(s.wallL, minW + (street && s.kerbL ? KERB_WIDTH : 0));
    s.wallR = Math.max(s.wallR, minW + (street && s.kerbR ? KERB_WIDTH : 0));
    if (street) {
      // mai oltre la metà dello spazio verso l'altro tratto
      s.wallL = Math.max(s.hw + 0.4, Math.min(s.wallL, s.clearL / 2));
      s.wallR = Math.max(s.hw + 0.4, Math.min(s.wallR, s.clearR / 2));
    }
  });
  // muro condiviso tra due tratti affiancati: lo disegna uno solo dei due
  samples.forEach((s, i) => {
    s.sharedL = street && s.nearL >= 0 && s.wallL >= s.clearL / 2 - 0.05 && i > s.nearL;
    s.sharedR = street && s.nearR >= 0 && s.wallR >= s.clearR / 2 - 0.05 && i > s.nearR;
  });

  // ghiaia all'esterno delle curve lente, a partire da 4 m oltre il cordolo (non in città)
  const gravelBase = samples.map(s => !street && Math.abs(s.curv) > 0.012);
  samples.forEach((s, i) => {
    let g = false, side = 0;
    for (let j = -4; j <= 30; j++) {           // la ghiaia prosegue dopo la curva
      const o = samples[(i - j + count) % count];
      if (gravelBase[(i - j + count) % count]) { g = true; side = Math.sign(o.curv); break; }
    }
    // curva a destra -> esterno a sinistra
    s.gravelL = g && side > 0;
    s.gravelR = g && side < 0;
    // cordoli "salsiccia" all'interno delle chicane strette (curve di segno opposto ravvicinate)
    let chicane = false;
    if (!street && Math.abs(s.curv) > 0.022) {
      for (let j = -22; j <= 22; j++) {
        const o = samples[(i + j + count) % count];
        if (Math.abs(o.curv) > 0.015 && Math.sign(o.curv) !== Math.sign(s.curv)) { chicane = true; break; }
      }
    }
    s.sausageL = chicane && s.curv < 0;
    s.sausageR = chicane && s.curv > 0;
  });
  // pista da modello 3D: cordoli, ghiaia, vie di fuga in asfalto e barriere come nel modello
  if (def.side) {
    const D = def.side, nD = D.length;
    samples.forEach((s, i) => {
      const jf = sOrig(i) / length * nD;                 // in proporzione: i dati sono ogni ~4 m
      const j = Math.round(jf) % nD, d = D[j];
      // profilo trasversale della superficie del modello (cm rispetto al centro), interpolato lungo la pista
      if (def.prof) {
        const u = jf, j0 = Math.floor(u) % nD, j1 = (j0 + 1) % nD, f = u - Math.floor(u);
        const A = def.prof[j0], B = def.prof[j1];
        s.prof = A.map((a, q) => (a + (B[q] - a) * f) / 100);
      }
      s.kerbL = d[0] > 0.4; s.kerbR = d[1] > 0.4;
      s.gravelL = d[2] === 2; s.gravelR = d[3] === 2;
      s.pavedL = d[2] === 3; s.pavedR = d[3] === 3;
      s.sausageL = s.sausageR = false;
      // curve strette: la carreggiata non si richiude su sé stessa e la barriera interna oltre
      // il centro della curva non esiste per la pista (taglierebbe la traiettoria)
      const R = 1 / Math.max(1e-4, Math.abs(s.curv));
      s.hw = Math.min(s.hw, Math.max(5, 0.6 * R));
      let wL = d[4], wR = d[5];
      if (s.curv < 0 && wL > 0.75 * R) wL = 32;
      if (s.curv > 0 && wR > 0.75 * R) wR = 32;
      s.wallL = Math.max(s.hw + 3, Math.min(32, wL)); s.wallR = Math.max(s.hw + 3, Math.min(32, wR));
    });
    for (let pass = 0; pass < 3; pass++) {
      const wl = samples.map((_, i) => Math.min(...[-2, -1, 0, 1, 2].map(k => samples[(i + k + count) % count].wallL)));
      const wr = samples.map((_, i) => Math.min(...[-2, -1, 0, 1, 2].map(k => samples[(i + k + count) % count].wallR)));
      samples.forEach((s, i) => { s.wallL = wl[i]; s.wallR = wr[i]; });
    }
  }

  // corsia box: il muretto box separa la pista dalla corsia, la barriera esterna (solo grafica)
  // sta oltre la corsia
  samples.forEach(s => { s.wallRVis = s.wallR; s.wallLVis = s.wallL; s.pitWall = false; });
  const pit = def.pitPath ? pitFromPath(def.pitPath, samples, length, step, count) : buildPitPath(samples, length, step, count);
  const side = PIT.side;
  samples.forEach(s => {
    const ss = s.s > length / 2 ? s.s - length : s.s;
    if (ss < PIT.entry - 5 || ss > PIT.exit + 5) return;
    // distanza laterale della corsia su questo campione (dal lato dei box)
    let dl = null;
    for (const p of pit.pts) {
      if (Math.abs(p.ss - ss) > 60) continue;
      const dx = p.x - s.x, dz = p.z - s.z;
      if (Math.abs(dx * s.tx + dz * s.tz) > 0.8) continue;
      const d = side * (dx * s.nx + dz * s.nz);
      if (d > 0 && (dl == null || d < dl)) dl = d;
    }
    if (dl == null) return;
    const edge = dl + PIT.halfW;
    const minWall = street ? s.hw + 0.8 : ROAD_HALF_WIDTH + KERB_WIDTH + 2.5;
    const W = side > 0 ? 'wallL' : 'wallR', WV = side > 0 ? 'wallLVis' : 'wallRVis';
    s[WV] = Math.max(s[WV], edge + 1.2);
    if (dl - PIT.halfW - 1 >= minWall) {
      s[W] = Math.min(s[W], dl - PIT.halfW - 1);
      s.pitWall = true;
      if (side > 0) s.gravelL = false; else s.gravelR = false;
    } else if (edge > s[W] - 0.5) {
      // la corsia si sta staccando: niente muro fisico in mezzo
      s[W] = Math.max(s[W], edge + 1.2);
    }
  });

  return { samples, length, step, count, pit };
}

// corsia box da un percorso reale (coordinate del mondo, nel verso di marcia)
function pitFromPath(path, samples, length, step, count) {
  const proj = (x, z) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < count; i++) { const s = samples[i], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    const s = samples[best];
    const along = (x - s.x) * s.tx + (z - s.z) * s.tz;
    let ss = s.s + along; if (ss > length / 2) ss -= length;
    return { ss, d: (x - s.x) * s.nx + (z - s.z) * s.nz, y: s.y };
  };
  // ricampionamento a 1 m
  const raw = path.map(([x, z]) => ({ x, z }));
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z));
  const L = cum[cum.length - 1], pts = [];
  let k = 0;
  for (let p = 0; p <= L; p += 1) {
    while (k < raw.length - 2 && cum[k + 1] < p) k++;
    const f = (p - cum[k]) / (cum[k + 1] - cum[k] || 1), a = raw[k], b = raw[k + 1];
    const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, pr = proj(x, z);
    pts.push({ x, y: pr.y, z, ss: pr.ss, d: pr.d });
  }
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1;
    p.tx = tx / l; p.tz = tz / l; p.nx = p.tz; p.nz = -p.tx;
  });
  // ss monotono lungo la corsia
  for (let i = 1; i < pts.length; i++) if (pts[i].ss < pts[i - 1].ss) pts[i].ss = pts[i - 1].ss + 0.01;
  const len = pts.length - 1;
  Object.assign(PIT, {
    entry: pts[0].ss, exit: pts[len].ss,
    limitFrom: pts[Math.min(len, 70)].ss, limitTo: pts[Math.max(0, len - 70)].ss,
    startD: pts[0].d, endD: pts[len].d,
  });
  // piazzole lungo il tratto centrale
  const nBox = 20, gap = PIT.boxGap || 12;
  const mid = (PIT.limitFrom + PIT.limitTo) / 2;
  PIT.boxFrom = mid - (nBox - 1) * gap / 2;
  PIT.boxGap = gap;
  return { pts, length: len };
}
