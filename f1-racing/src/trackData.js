// Definizione del tracciato "Circuito Nova" (ispirato a Spa-Francorchamps).
// Punti di controllo [x, y(altezza), z] in metri, percorsi in senso di marcia.
// La linea di traguardo è vicina al secondo punto.

export const CONTROL_POINTS = [
  [-260, 0, 0],
  [0, 0, 0],
  [240, 0.5, 0],
  [360, 1.5, 4],
  [425, 2, -22],      // La Source (tornante)
  [418, 2, -68],
  [372, 1.5, -92],
  [270, -3, -104],    // discesa
  [185, -8, -118],
  [140, -8.5, -140],  // Eau Rouge
  [118, -5, -178],
  [96, 1, -214],      // Raidillon
  [60, 8, -262],
  [0, 13, -318],
  [-120, 16, -382],   // Kemmel
  [-240, 18, -436],
  [-300, 18, -462],   // Les Combes
  [-330, 17.5, -490],
  [-372, 17, -500],
  [-430, 15, -482],   // Bruxelles
  [-452, 13, -440],
  [-440, 11, -392],
  [-462, 9, -330],    // Pouhon
  [-520, 7, -272],
  [-574, 5, -196],
  [-580, 4, -120],    // Fagnes
  [-548, 3, -62],     // Blanchimont
  [-478, 2, -24],
  [-410, 1, -10],
  [-366, 0.5, -8],    // Bus stop
  [-334, 0.3, -19],
  [-312, 0.2, -8],
];

export const ROAD_HALF_WIDTH = 7;   // carreggiata 14 m
export const KERB_WIDTH = 1.6;
export const SAMPLE_STEP = 2;       // metri tra i campioni
export const XZ_SCALE = 1.3;        // scala planimetrica del layout

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

export function buildTrack(points = CONTROL_POINTS) {
  // 1) curva densa
  points = points.map(p => [p[0] * XZ_SCALE, p[1], p[2] * XZ_SCALE]);
  const dense = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const segLen = Math.hypot(p2[0] - p1[0], p2[2] - p1[2]);
    const steps = Math.max(4, Math.ceil(segLen / 0.5));
    for (let j = 0; j < steps; j++) dense.push(catmull(p0, p1, p2, p3, j / steps));
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
  const pts = [];
  let k = 0;
  for (let i = 0; i < count; i++) {
    const s = i * step;
    while (cum[k + 1] < s) k++;
    const f = (s - cum[k]) / (cum[k + 1] - cum[k]);
    const a = dense[k], b = dense[(k + 1) % dense.length];
    pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
  }
  // 3) tangenti, normali (sinistra), curvatura
  const samples = pts.map((p, i) => {
    const a = pts[(i - 1 + count) % count], b = pts[(i + 1) % count];
    let tx = b[0] - a[0], tz = b[2] - a[2];
    const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    return { x: p[0], y: p[1], z: p[2], s: i * step, tx, tz, nx: tz, nz: -tx, curv: 0, slope: (b[1] - a[1]) / (2 * step) };
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

  // 4) cordoli: presenti dove la curva è significativa (su entrambi i lati)
  const kerbMask = samples.map(s => Math.abs(s.curv) > 0.0065);
  // estendi un po' i cordoli prima e dopo
  const ext = kerbMask.map((_, i) => {
    for (let j = -8; j <= 8; j++) if (kerbMask[(i + j + count) % count]) return true; return false;
  });
  samples.forEach((s, i) => { s.kerbL = ext[i]; s.kerbR = ext[i]; });

  // 5) distanza delle barriere: limitata dallo spazio verso altre parti di pista
  const maxRun = 26, minRun = 11;
  for (let i = 0; i < count; i++) {
    const si = samples[i];
    let clearL = 1e9, clearR = 1e9;
    for (let j = 0; j < count; j += 2) {
      let ds = Math.abs(i - j); ds = Math.min(ds, count - ds) * step;
      if (ds < 120) continue;
      const sj = samples[j];
      const dx = sj.x - si.x, dz = sj.z - si.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 200) continue;
      const side = dx * si.nx + dz * si.nz; // >0 sinistra
      const along = Math.abs(dx * si.tx + dz * si.tz);
      if (along > dist * 0.8) continue;
      if (side > 0) clearL = Math.min(clearL, dist); else clearR = Math.min(clearR, dist);
    }
    si.wallL = Math.max(minRun, Math.min(maxRun, clearL / 2 - 2));
    si.wallR = Math.max(minRun, Math.min(maxRun, clearR / 2 - 2));
  }
  // più spazio all'esterno delle curve
  for (let pass = 0; pass < 6; pass++) {
    const wl = samples.map((_, i) => (samples[(i - 1 + count) % count].wallL + samples[i].wallL + samples[(i + 1) % count].wallL) / 3);
    const wr = samples.map((_, i) => (samples[(i - 1 + count) % count].wallR + samples[i].wallR + samples[(i + 1) % count].wallR) / 3);
    samples.forEach((s, i) => { s.wallL = Math.min(s.wallL, wl[i] + 0.5); s.wallR = Math.min(s.wallR, wr[i] + 0.5); });
  }

  // il muro interno non può superare il raggio di curvatura
  samples.forEach(s => {
    const r = 1 / Math.max(1e-5, Math.abs(s.curv));
    if (s.curv > 0) s.wallR = Math.min(s.wallR, r * 0.8); else s.wallL = Math.min(s.wallL, r * 0.8);
    s.wallL = Math.max(s.wallL, ROAD_HALF_WIDTH + KERB_WIDTH + 2.5);
    s.wallR = Math.max(s.wallR, ROAD_HALF_WIDTH + KERB_WIDTH + 2.5);
  });

  // ghiaia all'esterno delle curve lente, a partire da 4 m oltre il cordolo
  const gravelBase = samples.map(s => Math.abs(s.curv) > 0.012);
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
    if (Math.abs(s.curv) > 0.022) {
      for (let j = -22; j <= 22; j++) {
        const o = samples[(i + j + count) % count];
        if (Math.abs(o.curv) > 0.015 && Math.sign(o.curv) !== Math.sign(s.curv)) { chicane = true; break; }
      }
    }
    s.sausageL = chicane && s.curv < 0;
    s.sausageR = chicane && s.curv > 0;
  });

  return { samples, length, step, count };
}
