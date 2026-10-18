import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Dettagli della pista "vissuta" (grafica alta): come nelle riprese vere l'asfalto non è mai uniforme.
// - gomma sporca (marbles) fuori traiettoria vicino ai bordi
// - segni neri di frenata nelle staccate, lungo la traiettoria
// - terra e polvere sull'erba subito fuori dal bordo (di più all'esterno delle uscite di curva)
// - in città: sporco e polvere ai lati della carreggiata, contro i muri

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// trame in scala di grigi usate come trasparenza (u = attraverso, v = lungo la pista)
function maskTex(kind) {
  const W = 64, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H), r = rand(kind.length * 97);
  const a = new Float32Array(W * H);
  if (kind === 'marbles') {
    // granelli di gomma: puntini fitti verso il bordo esterno (u = 1)
    for (let k = 0; k < 2600; k++) {
      const u = Math.pow(r(), 0.55), x = Math.floor(u * (W - 1)), y = Math.floor(r() * H), s = r() < 0.2 ? 2 : 1;
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) a[((y + dy) % H) * W + Math.min(W - 1, x + dx)] = 0.55 + 0.45 * r();
    }
    for (let i = 0; i < W * H; i++) { const u = (i % W) / (W - 1); a[i] = Math.max(a[i], 0.18 * u * u); }
  } else if (kind === 'dust') {
    // polvere e terra: nuvole morbide, piene vicino alla pista (u = 0) e sfumate verso l'esterno
    const blob = [];
    for (let k = 0; k < 90; k++) blob.push([r() * W, r() * H, 6 + r() * 22, 0.3 + 0.7 * r()]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0;
      for (const [bx, by, br, bs] of blob) { let dy = Math.abs(y - by); dy = Math.min(dy, H - dy); const d = Math.hypot(x - bx, dy); if (d < br) v = Math.max(v, bs * (1 - d / br)); }
      const u = x / (W - 1);
      a[y * W + x] = Math.min(1, (0.35 + 0.65 * v) * Math.pow(1 - u, 1.4) + 0.08 * r());
    }
  } else {
    // segno di frenata: riga scura con bordi morbidi e intensità che varia lungo la pista
    for (let y = 0; y < H; y++) {
      const along = 0.65 + 0.35 * Math.sin(y * 0.11) * Math.sin(y * 0.037 + 1.3);
      for (let x = 0; x < W; x++) { const u = x / (W - 1); a[y * W + x] = Math.pow(Math.sin(Math.PI * u), 0.8) * along * (0.85 + 0.15 * r()); }
    }
  }
  for (let i = 0; i < W * H; i++) { const o = i * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(Math.max(0, Math.min(1, a[i])) * 255); }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// materiale per strati appoggiati: colore fisso (con luce), trasparenza = trama × alfa del vertice
function decalMat(color, tex, rough = 1) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, transparent: true, depthWrite: false, vertexColors: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = sh => {
    sh.uniforms.tMask = { value: tex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vMaskUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMaskUv = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tMask; varying vec2 vMaskUv;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = diffuse; diffuseColor.a = opacity * vColor.a * texture2D(tMask, vMaskUv).a;');
  };
  m.customProgramCacheKey = () => 'decal';
  return m;
}

// striscia lungo la pista: per ogni campione d0(i), d1(i) (distanza dal centro), alfa(i), quota(i, u)
function strip(track, from, to, d0, d1, alpha, lift, vScale, mat) {
  const S = track.samples, n = track.count;
  const pos = [], uv = [], col = [], idx = [];
  let row = 0, run = false;
  for (let k = from; k <= to; k++) {
    const i = ((k % n) + n) % n, s = S[i], A = alpha(i, k);
    if (A <= 0.005) { run = false; continue; }
    const a = d0(i, k), b = d1(i, k);
    for (const [d, u] of [[a, 0], [b, 1]]) {
      pos.push(s.x + s.nx * d, s.y + 0.02 + lift(i, u), s.z + s.nz * d);
      uv.push(u, (k * track.step) / vScale);
      col.push(1, 1, 1, A);
    }
    if (run) { const q = (row - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    run = true; row++;
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true; m.renderOrder = 1;
  return m;
}

export function buildTrackDetail(track, line, kerbW) {
  const g = new THREE.Group();
  const S = track.samples, n = track.count, st = track.step, street = !!track.street;
  const off = line.off, V = line.speed;
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // 1) gomma sporca fuori traiettoria: dove la traiettoria passa lontano da quel bordo
  const marbles = decalMat(0x17181a, maskTex('marbles'), 0.95);
  for (const side of [1, -1]) {
    const m = strip(track, 0, n,
      i => side * (S[i].hw - (street ? 1.0 : 1.7)), i => side * (S[i].hw - 0.15),
      i => { const far = Math.abs(side * S[i].hw - off[i]); return (street ? 0.6 : 0.8) * smooth(2.5, 6, far); },
      () => 0.004, 14, marbles);
    if (m) g.add(m);
  }

  // 2) segni di frenata: nelle staccate vere, lungo la traiettoria (coppie di righe nere, tante passate)
  const skidMat = decalMat(0x0b0b0c, maskTex('skid'), 0.9);
  const r = rand(77);
  const look = Math.round(60 / st);
  for (let i = 0; i < n; i++) {
    const drop = V[i] - V[(i + look) % n], dropPrev = V[(i - 1 + n) % n] - V[(i - 1 + look) % n];
    if (!(drop > 9 && dropPrev <= 9)) continue;                     // inizio di una staccata
    let end = i; while (end < i + Math.round(260 / st) && V[(end + 1) % n] <= V[end % n] + 0.05) end++;
    const len = end - i;
    if (len * st < 25) continue;
    const passes = 4 + Math.floor(r() * 4);
    for (let p = 0; p < passes; p++) {
      const a = i + Math.floor(r() * len * 0.4), b = Math.min(end, a + Math.floor((0.35 + 0.55 * r()) * len));
      const jit = (r() - 0.5) * 1.6, drift = (r() - 0.5) * 0.8, strength = 0.4 + 0.45 * r();
      for (const w of [-0.78, 0.78]) {
        const m = strip(track, a, b,
          (k, kk) => off[k] + jit + drift * (kk - a) / Math.max(1, b - a) + w - 0.13,
          (k, kk) => off[k] + jit + drift * (kk - a) / Math.max(1, b - a) + w + 0.13,
          (k, kk) => strength * smooth(a, a + 6, kk) * (1 - smooth(b - 10, b, kk)),
          () => 0.006, 9, skidMat);
        if (m) g.add(m);
      }
    }
  }

  // 3) bordi: terra e polvere sull'erba subito fuori dalla pista (non in città, dove ci sono i muri);
  //    di più all'esterno delle curve, dove si allarga in uscita
  if (!street) {
    const dust = decalMat(0x8a7a5c, maskTex('dust'), 1);
    for (const side of [1, -1]) {
      const exitF = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        // curva verso l'altro lato nei 40 m prima: qui si esce larghi
        let c = 0; for (let k = 0; k < Math.round(40 / st); k += 2) c += S[(i - k + n) % n].curv;
        exitF[i] = Math.max(0, Math.min(1, -side * c * 40));
      }
      const kerbOf = i => (side > 0 ? S[i].kerbL : S[i].kerbR) ? kerbW : 0;
      const m = strip(track, 0, n,
        i => side * (S[i].hw + 0.55 + kerbOf(i)), i => side * (S[i].hw + 3.6 + kerbOf(i) + 2.5 * exitF[i]),
        i => ((side > 0 ? S[i].gravelL : S[i].gravelR) ? 0 : 0.6 + 0.4 * exitF[i]),
        (i, u) => -0.03 * u + 0.012, 11, dust);
      if (m) g.add(m);
    }
  } else {
    // città: polvere chiara accumulata ai lati, contro i muri
    const grime = decalMat(0x9a958a, maskTex('dust'), 1);
    for (const side of [1, -1]) {
      const m = strip(track, 0, n,
        i => side * (S[i].hw + 0.6), i => side * (S[i].hw - 0.6),
        () => 0.55, () => 0.008, 11, grime);
      if (m) g.add(m);
    }
  }
  // un solo oggetto per materiale (pochi disegni anche sul telefono)
  const out = new THREE.Group(), by = new Map();
  for (const m of g.children) { if (!by.has(m.material)) by.set(m.material, []); by.get(m.material).push(m.geometry); }
  for (const [mat, geos] of by) {
    const mesh = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], mat);
    mesh.receiveShadow = true; mesh.renderOrder = 1; out.add(mesh);
  }
  return out;
}
