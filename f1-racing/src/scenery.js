import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as tex from './textures.js';

// Ambientazione attorno al circuito: cielo con nuvole e sole, montagne all'orizzonte,
// campagna a campi coltivati, lago, boschi, tribune con bandiere, paddock, paese,
// pale eoliche e mongolfiere. Tutto procedurale (nessun file esterno) e raggruppato in
// poche mesh per restare fluido anche sul telefono.

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash2 = (i, j) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };

// colori dell'ambiente (condivisi con la nebbia e le luci in main.js)
export const ENV = {
  skyTop: 0x2f7fd8, horizon: 0xd8e7f1, sunDir: new THREE.Vector3(-0.5, 0.62, 0.42).normalize(),
};

// Raccoglie geometrie statiche e le unisce per materiale (poche chiamate di disegno).
// "colored": un solo materiale a colori per vertice per tutti gli oggetti in tinta unita.
class Batch {
  constructor() { this.groups = new Map(); this.m = new THREE.Matrix4(); }
  add(geo, mat, matrix, color = null) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    const keep = mat.map ? ['position', 'normal', 'uv'] : ['position', 'normal'];
    for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
    if (mat.vertexColors) {
      const c = new THREE.Color(color ?? 0xffffff), n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    if (!this.groups.has(mat)) this.groups.set(mat, []);
    this.groups.get(mat).push(g);
  }
  flush(parent, shadows = true) {
    for (const [mat, list] of this.groups) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = shadows; m.receiveShadow = true;
      parent.add(m);
    }
    this.groups.clear();
  }
}
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), E = new THREE.Euler();
const mat4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
  E.set(rx, ry, rz, 'YXZ'); Q.setFromEuler(E);
  return new THREE.Matrix4().compose(V.set(x, y, z), Q, SC.set(sx, sy, sz));
};

export class Scenery {
  constructor(scene, track, renderer, quality) {
    this.scene = scene; this.track = track; this.renderer = renderer; this.quality = quality;
    this.low = quality === 'low';
    this.group = new THREE.Group();
    scene.add(this.group);
    this.aniso = renderer.capabilities.getMaxAnisotropy();
    this.occupied = []; // aree occupate (tribune, box, paddock...) dove non mettere alberi: [x, z, r]
    this.time = 0;
    this.animated = [];
    this.batch = new Batch();
    this.colored = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
    this.buildIndex();
    this.setupLake();
  }

  // Indice spaziale dei campioni per calcoli di distanza rapidi
  buildIndex() {
    const S = this.track.samples;
    this.cell = 40;
    this.grid = new Map();
    S.forEach((s, i) => {
      const k = `${Math.floor(s.x / this.cell)},${Math.floor(s.z / this.cell)}`;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(i);
    });
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, minY = 1e9;
    S.forEach(s => { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); minY = Math.min(minY, s.y); });
    this.bounds = { minX, maxX, minZ, maxZ };
    this.center = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.floorY = minY - 14;          // quota della pianura lontana
    this.coarse = S.filter((_, i) => i % 6 === 0);
    const pad = 700;
    this.terrainBox = { x0: minX - pad, x1: maxX + pad, z0: minZ - pad, z1: maxZ + pad };
  }

  // il punto è dentro l'anello della pista?
  insideTrack(x, z) {
    const S = this.track.samples, n = S.length;
    let c = false;
    for (let i = 0, j = n - 3; i < n; j = i, i += 3) {
      const a = S[i], q = S[j];
      if (((a.z > z) !== (q.z > z)) && (x < (q.x - a.x) * (z - a.z) / (q.z - a.z) + a.x)) c = !c;
    }
    return c;
  }

  // il punto dell'interno più lontano dalla pista ospita un lago
  setupLake() {
    const b = this.bounds;
    const inside = (x, z) => this.insideTrack(x, z);
    let best = null;
    for (let x = b.minX; x < b.maxX; x += 20) for (let z = b.minZ; z < b.maxZ; z += 20) {
      const d = this.nearest(x, z, 8).d;
      if ((!best || d > best.d) && inside(x, z)) best = { x, z, d };
    }
    const R = Math.min(140, best.d - 95);
    this.lake = { x: best.x, z: best.z, R };
    this.lake.water = this.baseHeight(best.x, best.z) - 1.2;
  }
  lakeR(a) { return this.lake.R * (1 + 0.14 * Math.sin(3 * a + 1) + 0.08 * Math.sin(5 * a + 2) + 0.05 * Math.sin(7 * a)); }

  nearest(x, z, maxCells = 3) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= maxCells; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const arr = this.grid.get(`${cx + i},${cz + j}`);
        if (!arr) continue;
        for (const k of arr) {
          const s = this.track.samples[k];
          const d = (s.x - x) ** 2 + (s.z - z) ** 2;
          if (d < bd) { bd = d; best = k; }
        }
      }
      if (best >= 0 && Math.sqrt(bd) < r * this.cell) break;
    }
    if (best < 0) {
      this.coarse.forEach(s => { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = Math.round(s.s / this.track.step); } });
    }
    return { i: best, d: Math.sqrt(bd) };
  }

  // distanza dal muro più vicino (negativa = dentro la pista)
  clearance(x, z) {
    const nr = this.nearest(x, z);
    const s = this.track.samples[nr.i];
    return { d: nr.d - Math.max(s.wallLVis ?? s.wallL, s.wallRVis ?? s.wallR), nr, s };
  }

  baseHeight(x, z) {
    const S = this.track.samples;
    const nr = this.nearest(x, z);
    const s = S[nr.i];
    const wall = Math.max(s.wallLVis ?? s.wallL, s.wallRVis ?? s.wallR);
    // quota media pesata sulla pista (continua tra zone a quote diverse)
    let ws = 0, ys = 0;
    for (const c of this.coarse) {
      const d2 = (c.x - x) ** 2 + (c.z - z) ** 2 + 100;
      const w = 1 / (d2 * d2);
      ws += w; ys += w * c.y;
    }
    const yIdw = ys / ws;
    const near = s.y - 0.6;
    const t = smooth(wall + 6, wall + 70, nr.d);
    const hills = (Math.sin(x * 0.006) * Math.cos(z * 0.0075) * 0.5 + 0.5) * 26 + Math.sin(x * 0.017 + z * 0.011) * 6 + 6
      + (Math.sin(x * 0.0021 + 1.3) * Math.cos(z * 0.0027) * 0.5 + 0.5) * 40 * smooth(300, 700, nr.d);
    const far = smooth(wall + 30, wall + 260, nr.d);
    let y = near * (1 - t) + (yIdw - 0.6) * t + far * hills;
    // ai bordi la campagna scende verso la pianura lontana (niente "scalino" all'orizzonte)
    const tb = this.terrainBox;
    const edge = Math.min(x - tb.x0, tb.x1 - x, z - tb.z0, tb.z1 - z);
    const e = smooth(0, 260, edge);
    return this.floorY + 1 + (y - this.floorY - 1) * e;
  }

  heightAt(x, z) {
    let y = this.baseHeight(x, z);
    const L = this.lake;
    if (L && L.water != null) {
      const dx = x - L.x, dz = z - L.z, rr = Math.hypot(dx, dz);
      const Rl = this.lakeR(Math.atan2(dz, dx));
      if (rr < Rl + 40) {
        if (rr < Rl) y = L.water - 0.4 - 5 * smooth(Rl, Rl - 50, rr);
        else y = L.water + 0.25 + (y - L.water - 0.25) * smooth(Rl, Rl + 40, rr);
      }
    }
    return y;
  }

  build() {
    const steps = ['sky', 'mountains', 'terrain', 'water', 'pitBuilding', 'grandstands', 'gantry', 'billboards', 'bigScreen',
      'bridge', 'paddock', 'trackside', 'brakeBoards', 'spectators', 'campsite', 'village', 'windFarm', 'balloons', 'trees', 'bushes'];
    for (const s of steps) { const t0 = performance.now(); this[s](); if (window.__perfLog) console.log('PERF', s, Math.round(performance.now() - t0)); }
    this.batch.flush(this.group);
  }

  // ------------------------------------------------------------------ cielo
  sky() {
    const geo = new THREE.SphereGeometry(4000, 48, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(ENV.skyTop) }, horizon: { value: new THREE.Color(ENV.horizon) },
        sunDir: { value: ENV.sunDir.clone() }, time: { value: 0 },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform float time; varying vec3 vP;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
        void main(){
          vec3 d = normalize(vP);
          float h = d.y;
          vec3 col = mix(horizon, top, pow(max(h, 0.0), 0.5));
          col = mix(col, horizon * 0.92, smoothstep(0.0, -0.15, h));
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          // nuvole: strato proiettato sulla volta, più rade vicino all'orizzonte
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.35) * 2.2 + vec2(time * 0.006, time * 0.002);
            float n = fbm(uv) * 0.8 + fbm(uv * 3.1 + 7.0) * 0.2;
            float cov = smoothstep(0.52, 0.7, n) * smoothstep(0.04, 0.3, h);
            float shade = smoothstep(0.5, 0.85, fbm(uv * 2.3 + 3.0));
            vec3 cloud = mix(vec3(1.0, 0.995, 0.98), vec3(0.66, 0.71, 0.8), shade * 0.75);
            cloud += vec3(1.0, 0.86, 0.62) * pow(sd, 8.0) * 0.35;
            col = mix(col, cloud, cov * 0.95);
          }
          // sole: disco, alone e luce diffusa
          col += vec3(1.0, 0.93, 0.78) * (pow(sd, 1400.0) * 6.0 + pow(sd, 60.0) * 0.35 + pow(sd, 6.0) * 0.12);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.skyMesh = new THREE.Mesh(geo, mat);
    this.skyMesh.renderOrder = -1;
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);
  }

  // montagne lontane in due catene: rilievi veri (boschi, roccia, neve sulle cime),
  // illuminati dal sole e velati d'azzurro dalla distanza (prospettiva aerea)
  mountains() {
    const sun = ENV.sunDir;
    const haze = new THREE.Color(0xa8c2db);
    const forest = new THREE.Color(0x3d6a3e), meadow = new THREE.Color(0x6f9a52), rock = new THREE.Color(0x7c8189), snow = new THREE.Color(0xf6f8fb);
    const band = (R0, width, hMax, hazeK, seed, segA, segR, snowLine) => {
      const r = rand(seed);
      const ph = Array.from({ length: 8 }, () => r() * 6.28);
      const H = (a, t) => {
        const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.7);
        const n = 0.55 + 0.22 * Math.sin(a * 4 + ph[0]) + 0.14 * Math.sin(a * 9 + ph[1] + t * 2) + 0.09 * Math.sin(a * 21 + ph[2] - t * 3)
          + 0.06 * Math.sin(a * 47 + ph[3] + t * 5) + 0.05 * Math.sin(t * 9 + a * 13 + ph[4]);
        return hMax * env * Math.max(0.05, n) * (0.75 + 0.25 * Math.sin(a * 2 + ph[5]));
      };
      const cx = this.center.x, cz = this.center.z, y0 = this.floorY - 20;
      const pos = [], idx = [];
      for (let j = 0; j <= segR; j++) for (let i = 0; i <= segA; i++) {
        const a = i / segA * Math.PI * 2, t = j / segR, R = R0 + t * width;
        const jit = (j > 0 && j < segR) ? (r() - 0.5) * width / segR * 0.5 : 0;
        pos.push(cx + Math.cos(a) * (R + jit), y0 + H(a, t) + (j === 0 || j === segR ? -30 : 0), cz + Math.sin(a) * (R + jit));
      }
      for (let j = 0; j < segR; j++) for (let i = 0; i < segA; i++) {
        const a = j * (segA + 1) + i, b = a + 1, c = a + segA + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      let g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g = g.toNonIndexed();
      g.computeVertexNormals();
      const P = g.attributes.position, N = g.attributes.normal, col = new Float32Array(P.count * 3);
      const c = new THREE.Color(), nrm = new THREE.Vector3();
      for (let v = 0; v < P.count; v += 3) {
        // colore per faccia (stile low-poly): quota media e pendenza
        const hy = (P.getY(v) + P.getY(v + 1) + P.getY(v + 2)) / 3 - y0;
        nrm.set(N.getX(v), N.getY(v), N.getZ(v)).normalize();
        const slope = 1 - nrm.y, f = hy / hMax;
        if (f > snowLine + (r() - 0.5) * 0.06 && slope < 0.75) c.copy(snow);
        else if (f > 0.42 || slope > 0.55) c.copy(rock).offsetHSL(0, 0, (r() - 0.5) * 0.05);
        else if (f > 0.18) c.copy(forest).offsetHSL(0, 0, (r() - 0.5) * 0.04);
        else c.copy(meadow);
        const light = 0.55 + 0.6 * Math.max(0, nrm.dot(sun));
        c.multiplyScalar(light).lerp(haze, hazeK);
        for (let q = 0; q < 3; q++) col.set([c.r, c.g, c.b], (v + q) * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
      m.frustumCulled = false;
      this.scene.add(m);
    };
    band(3000, 700, 760, 0.5, 3, this.low ? 120 : 180, 7, 0.68);
    band(2200, 420, 260, 0.3, 8, this.low ? 100 : 150, 5, 2);
    // pianura lontana sotto l'orizzonte (la nebbia la fonde col cielo)
    const disk = new THREE.Mesh(new THREE.CircleGeometry(4200, 48), new THREE.MeshLambertMaterial({ color: 0x5f8a4a }));
    disk.rotation.x = -Math.PI / 2;
    disk.position.set(this.center.x, this.floorY, this.center.z);
    this.scene.add(disk);
  }

  // ------------------------------------------------------------------ terreno
  // tipo di appezzamento: 0 prato, 1 grano, 2 bosco, 3 arato, 4 erba medica, 5 girasoli/colza
  field(x, z) {
    const a = 0.38, u = x * Math.cos(a) + z * Math.sin(a), v = -x * Math.sin(a) + z * Math.cos(a);
    const i = Math.floor(u / 115), j = Math.floor(v / 78);
    const h = hash2(i, j);
    const type = h < 0.2 ? 0 : h < 0.36 ? 1 : h < 0.62 ? 2 : h < 0.72 ? 3 : h < 0.9 ? 4 : 5;
    const eu = Math.min(u - i * 115, (i + 1) * 115 - u), ev = Math.min(v - j * 78, (j + 1) * 78 - v);
    return { type, edge: Math.min(eu, ev), h };
  }

  terrain() {
    const tb = this.terrainBox, step = this.low ? 14 : 10;
    const nx = Math.ceil((tb.x1 - tb.x0) / step), nz = Math.ceil((tb.z1 - tb.z0) / step);
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
    const col = new Float32Array((nx + 1) * (nz + 1) * 3);
    const c = new THREE.Color(), t2 = new THREE.Color();
    const r = rand(5);
    const FIELD = [0x6aa34a, 0xd8b85a, 0x3f7a3a, 0x8a6a48, 0x7fb24e, 0xe0cc48].map(h => new THREE.Color(h));
    const L = this.lake;
    let k = 0;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = tb.x0 + i * step, z = tb.z0 + j * step;
      const y = this.heightAt(x, z);
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      const cl = this.clearance(x, z).d;
      const n = Math.sin(x * 0.05) * Math.cos(z * 0.04) * 0.5 + 0.5;
      // prato curato vicino alla pista
      c.setHSL(0.27 + n * 0.035, 0.48 + r() * 0.06, 0.34 + n * 0.05 + r() * 0.025);
      // campi coltivati più lontano
      const f = this.field(x, z);
      t2.copy(FIELD[f.type]).offsetHSL((f.h - 0.5) * 0.03, 0, (r() - 0.5) * 0.04);
      c.lerp(t2, smooth(70, 150, cl) * (f.edge < 5 ? 0.4 : 1));
      // sponde sabbiose e fondale del lago
      const rr = Math.hypot(x - L.x, z - L.z);
      if (rr < L.R * 1.4) {
        const Rl = this.lakeR(Math.atan2(z - L.z, x - L.x));
        if (rr < Rl + 14) c.lerp(t2.setHex(0xcdb88a), smooth(Rl + 14, Rl + 4, rr));
        if (rr < Rl) c.lerp(t2.setHex(0x55604a), smooth(Rl, Rl - 30, rr));
      }
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      k += 3;
    }
    const idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b2 = a + 1, c2 = a + nx + 1, d = c2 + 1;
      idx.push(a, c2, b2, b2, c2, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  water() {
    const L = this.lake, seg = 72, pos = [L.x, L.water, L.z], idx = [];
    for (let k = 0; k <= seg; k++) {
      const a = k / seg * Math.PI * 2, R = this.lakeR(a) + 6;
      pos.push(L.x + Math.cos(a) * R, L.water, L.z + Math.sin(a) * R);
      if (k) idx.push(0, k + 1, k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1f5f7e, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.92, envMapIntensity: 0.95 });
    // increspature: la normale ondeggia nel tempo
    const uT = { value: 0 };
    mat.onBeforeCompile = sh => {
      sh.uniforms.uT = uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; uniform float uT;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec2 q = vW.xz * 0.21;
          float w1 = sin(q.x * 1.0 + q.y * 0.6 + uT * 1.3), w2 = sin(q.x * -0.7 + q.y * 1.3 - uT * 1.1), w3 = sin((q.x + q.y) * 2.7 + uT * 2.1);
          vec3 wn = normalize(vec3(w1 * 0.025 + w3 * 0.012, 1.0, w2 * 0.025 - w3 * 0.01));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`);
    };
    this.animated.push(t => { uT.value = t; });
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    this.group.add(m);
    this.occupied.push([L.x, L.z, L.R * 1.25 + 12]);
    // pontile e barche
    const wood = 0x8a6a48, s = rand(31);
    const a0 = 2.2, R0 = this.lakeR(a0);
    const px = L.x + Math.cos(a0) * (R0 - 10), pz = L.z + Math.sin(a0) * (R0 - 10);
    this.batch.add(new THREE.BoxGeometry(26, 0.4, 3), this.colored, mat4(px, L.water + 0.6, pz, -a0), wood);
    for (let k = 0; k < 3; k++) {
      const a = a0 + 0.4 + k * 0.5, R = this.lakeR(a) * (0.45 + s() * 0.3);
      const bx = L.x + Math.cos(a) * R, bz = L.z + Math.sin(a) * R, ry = s() * 6;
      this.batch.add(new THREE.BoxGeometry(4.5, 0.7, 1.7), this.colored, mat4(bx, L.water + 0.3, bz, ry), [0xf2f2f2, 0xd8352a, 0x2a62c9][k]);
      if (k === 1) {
        this.batch.add(new THREE.CylinderGeometry(0.06, 0.06, 6), this.colored, mat4(bx, L.water + 3.5, bz, ry), 0xdddddd);
        this.batch.add(new THREE.ConeGeometry(1.4, 5, 3), this.colored, mat4(bx + 0.4, L.water + 3.6, bz, ry, 0.15, 1, 1), 0xffffff);
      }
    }
  }

  // colloca un oggetto a lato pista: indice campione, lato (+1 sx, -1 dx), distanza extra oltre il muro
  place(obj, i, side, extra) {
    const s = this.track.samples[(i + this.track.count) % this.track.count];
    const wall = side > 0 ? (s.wallLVis ?? s.wallL) : (s.wallRVis ?? s.wallR);
    const d = (wall + extra) * side;
    obj.position.set(s.x + s.nx * d, s.y, s.z + s.nz * d);
    // l'asse +Z locale dell'oggetto punta verso la pista
    const toTrack = new THREE.Vector3(-s.nx * side, 0, -s.nz * side);
    obj.rotation.y = Math.atan2(toTrack.x, toTrack.z);
    this.group.add(obj);
    this.occupied.push([obj.position.x, obj.position.z, obj.userData.radius || 40]);
    return obj;
  }

  // posa a lato pista: { x, y, z, ry } con +Z locale verso la pista
  frame(i, side, extra, along = 0) {
    const n = this.track.count, s = this.track.samples[((i % n) + n) % n];
    const wall = side > 0 ? (s.wallLVis ?? s.wallL) : (s.wallRVis ?? s.wallR);
    const d = (wall + extra) * side;
    const x = s.x + s.nx * d + s.tx * along, z = s.z + s.nz * d + s.tz * along;
    return { x, z, y: this.heightAt(x, z), ry: Math.atan2(-s.nx * side, -s.nz * side), s };
  }

  free(x, z, r) { return !this.occupied.some(([ox, oz, rad]) => (ox - x) ** 2 + (oz - z) ** 2 < (rad + r) ** 2); }

  // ------------------------------------------------------------------ tribune
  standMats() {
    if (this._sm) return this._sm;
    const crowdT = tex.crowd(); crowdT.anisotropy = this.aniso;
    const roofT = tex.sponsor(this.brand?.stand || 'NOVA GRAND PRIX', '#ffffff', this.brand?.standBg || ['#6a2cd8', '#2c7be0']);
    this._sm = {
      crowdT,
      grey: new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.8 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.8 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xeef0f4, roughness: 0.45, metalness: 0.3 }),
      ad: new THREE.MeshStandardMaterial({ map: roofT }),
    };
    return this._sm;
  }

  makeStand(length, rows) {
    const M = this.standMats();
    const g = new THREE.Group();
    const crowdT = M.crowdT.clone(); crowdT.needsUpdate = true;
    crowdT.repeat.set(length / 28, rows / 16 * 1.1);
    const depth = rows * 0.85, height = rows * 0.55;
    // gradinata inclinata con pubblico
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(length, Math.hypot(depth, height)), new THREE.MeshStandardMaterial({ map: crowdT, roughness: 0.95 }));
    slope.rotation.x = -Math.atan2(depth, height); // inclinata verso la pista (+Z)
    slope.position.set(0, 2 + height / 2, -depth / 2);
    slope.receiveShadow = true;
    g.add(slope);
    // basamento, pareti, tetto a sbalzo con travi e bandiere
    const base = new THREE.Mesh(new THREE.BoxGeometry(length, 2, depth + 1), M.dark);
    base.position.set(0, 1, -depth / 2); base.castShadow = true; base.receiveShadow = true; g.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(length, height + 5, 0.6), M.grey);
    back.position.set(0, (height + 5) / 2, -depth - 0.3); back.castShadow = true; g.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.6, height + 4, depth + 1), M.grey);
      side.position.set(s * length / 2, (height + 4) / 2, -depth / 2); side.castShadow = true; g.add(side);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.5, depth + 5), M.roof);
    roof.position.set(0, height + 7, -depth / 2 + 1.5); roof.rotation.x = 0.08; roof.castShadow = true; g.add(roof);
    for (let x = -length / 2 + 4; x <= length / 2 - 4; x += 16) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, height + 7), M.grey);
      p.position.set(x, (height + 7) / 2, -depth + 1); g.add(p);
    }
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(length, 2), M.ad);
    ad.position.set(0, 1.1, 0.51); g.add(ad);
    // bandiere sul tetto
    g.userData.flags = [];
    for (let x = -length / 2 + 3; x <= length / 2 - 2; x += Math.max(8, length / 6)) g.userData.flags.push(new THREE.Vector3(x, height + 7.3, -depth - 0.5));
    g.userData.radius = Math.max(length, depth) * 0.7;
    return g;
  }

  grandstands() {
    const n = this.track.count, st = this.track.step;
    const stands = [];
    // tribune lungo il rettilineo principale (lato sinistro)
    const main = [-40, 30, 100, 170].map(m => Math.round(m / st));
    main.forEach(i => stands.push(this.place(this.makeStand(62, 22), i, 1, 5)));
    // tribune in corrispondenza delle curve più lente, lato esterno
    const S = this.track.samples;
    const used = [];
    for (let i = 0; i < n; i += 5) {
      const c = S[i].curv;
      if (Math.abs(c) < 0.018) continue;
      if (used.some(u => Math.min(Math.abs(u - i), n - Math.abs(u - i)) < 90)) continue;
      used.push(i);
      const side = c > 0 ? 1 : -1;   // esterno curva
      stands.push(this.place(this.makeStand(46, 16), i, side, 10));
    }
    // bandiere (istanze con animazione del vento)
    const pts = [];
    for (const g of stands) { g.updateMatrixWorld(true); for (const p of g.userData.flags) pts.push(p.clone().applyMatrix4(g.matrixWorld)); }
    this.flags(pts);
  }

  flags(points) {
    const geo = new THREE.PlaneGeometry(2.6, 1.6, 10, 1).translate(1.3, 0, 0);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
    const uT = { value: 0 };
    mat.onBeforeCompile = sh => {
      sh.uniforms.uT = uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3][0] * 0.3 + instanceMatrix[3][2] * 0.2;
          transformed.z += sin(position.x * 2.2 - uT * 7.0 + ph) * position.x * 0.12;
          transformed.y += sin(position.x * 1.6 - uT * 5.0 + ph) * position.x * 0.03;`);
    };
    this.animated.push(t => { uT.value = t; });
    const cols = [0xd8231f, 0xffffff, 0x1f9a4a, 0x2a62c9, 0xf5c518, 0x6a2cd8, 0xff7b1c];
    const inst = new THREE.InstancedMesh(geo, mat, points.length);
    const pole = new THREE.CylinderGeometry(0.06, 0.06, 4.5, 5);
    const wind = 0.6;
    points.forEach((p, k) => {
      inst.setMatrixAt(k, mat4(p.x, p.y + 3.6, p.z, wind));
      inst.setColorAt(k, new THREE.Color(cols[k % cols.length]));
      this.batch.add(pole, this.colored, mat4(p.x, p.y + 2.25, p.z), 0xcfd3da);
    });
    inst.castShadow = true;
    this.group.add(inst);
  }

  pitBuilding() {
    const st = this.track.step;
    const pt = tex.pitBuilding(); pt.anisotropy = this.aniso;
    const len = 300;
    pt.repeat.set(len / 40, 1);
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.7 });
    const front = new THREE.MeshStandardMaterial({ map: pt, roughness: 0.7 });
    // box: facciata verso la pista (+Z)
    const mats = [white, white, white, white, front, white];
    const b = new THREE.Mesh(new THREE.BoxGeometry(len, 9, 16), mats);
    b.position.set(0, 4.5, -8); b.castShadow = true; b.receiveShadow = true; g.add(b);
    const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 0.8, 17), new THREE.MeshStandardMaterial({ color: 0xc0262c, roughness: 0.6 }));
    roofTrim.position.set(0, 9.3, -8); g.add(roofTrim);
    // secondo piano con vetrate e terrazza
    const glass = new THREE.MeshStandardMaterial({ color: 0x2a3a52, roughness: 0.08, metalness: 0.7 });
    const upper = new THREE.Mesh(new THREE.BoxGeometry(len - 20, 4, 11), [white, white, white, white, glass, white]);
    upper.position.set(0, 11.7, -10); upper.castShadow = true; g.add(upper);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 12), [white, white, white, white, glass, white]);
    tower.position.set(-110, 19.7, -10); tower.castShadow = true; g.add(tower);
    const towerTop = new THREE.Mesh(new THREE.BoxGeometry(16, 0.8, 14), roofTrim.material);
    towerTop.position.set(-110, 26.1, -10); g.add(towerTop);
    // insegne
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 4), new THREE.MeshStandardMaterial({ map: tex.sponsor('NOVA', '#ffffff', ['#4b2fd6', '#b43adf']), emissive: 0x221144, emissiveIntensity: 0.3 }));
    sign.position.set(-60, 15.8, -4.2); g.add(sign);
    const sign2 = sign.clone(); sign2.position.x = 70; g.add(sign2);
    const sign3 = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshStandardMaterial({ map: tex.sponsor('RACE CONTROL', '#ffffff', ['#1a1a1a', '#3a3a3a']) }));
    sign3.position.set(-110, 23.5, -3.95); g.add(sign3);
    g.userData.radius = 150;
    // il centro dell'edificio a circa 95 m dopo il traguardo, a destra
    this.place(g, Math.round(95 / st), -1, 0.5);
  }

  gantry() {
    const s = this.track.samples[0];
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.5, metalness: 0.5 });
    const span = s.wallL + s.wallR;
    for (const d of [s.wallL, -s.wallR]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), dark);
      p.position.set(0, 4, -d); p.castShadow = true; g.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, span), dark);
    beam.position.set(0, 7.7, (s.wallR - s.wallL) / 2); beam.castShadow = true; g.add(beam);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshStandardMaterial({ map: tex.sponsor(this.brand?.gantry || 'NOVA GP', '#ffffff', this.brand?.gantryBg || ['#4b2fd6', '#b43adf']), roughness: 0.5 }));
    sign.position.set(-0.31, 8.4, 0); sign.rotation.y = -Math.PI / 2; g.add(sign);
    const sign2 = sign.clone(); sign2.position.x = 0.31; sign2.rotation.y = Math.PI / 2; g.add(sign2);
    // pannello luci
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 4.6), dark);
    panel.position.set(-0.6, 6.4, 0); g.add(panel);
    this.lights = [];
    for (let k = 0; k < 5; k++) {
      const pair = [];
      for (const dy of [0.28, -0.28]) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff0000, emissiveIntensity: 0 });
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), mat);
        l.position.set(-0.86, 6.4 + dy, -1.8 + k * 0.9);
        l.rotation.y = -Math.PI / 2;
        g.add(l); pair.push(mat);
      }
      this.lights.push(pair);
    }
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = -Math.atan2(s.tz, s.tx);
    this.group.add(g);
  }

  setLights(nOn) {
    this.lights.forEach((pair, k) => pair.forEach(m => { m.emissiveIntensity = k < nOn ? 3 : 0; }));
  }

  billboards() {
    const names = [
      ['VELOCE', '#ffffff', ['#d6202a', '#ff5b3a']], ['APEX', '#111', ['#ffd21e', '#ffb300']],
      ['TURBOX', '#ffffff', ['#1a1a1a', '#3a3a3a']], ['NOVA', '#ffffff', ['#4b2fd6', '#b43adf']],
      ['PISTA+', '#ffffff', ['#0a7d3e', '#19b35a']], ['GOMMA', '#ffffff', ['#0c3c8c', '#2a6fe0']],
    ].map(([t, f, b]) => new THREE.MeshStandardMaterial({ map: tex.sponsor(t, f, b), roughness: 0.6 }));
    const S = this.track.samples, n = this.track.count;
    const r = rand(9);
    const boardG = new THREE.BoxGeometry(12, 2.6, 0.2), postG = new THREE.CylinderGeometry(0.12, 0.12, 4);
    for (let i = 20; i < n; i += 38) {
      if (Math.abs(S[i].curv) > 0.01 && r() < 0.5) continue;
      const side = r() < 0.5 ? 1 : -1;
      const f = this.frame(i, side, 2.5);
      if (!this.free(f.x, f.z, 4)) continue;
      const base = f.y;
      this.batch.add(boardG, names[Math.floor(r() * names.length)], mat4(f.x, base + 4.6, f.z, f.ry));
      for (const dx of [-5, 5]) {
        const ox = Math.cos(f.ry) * dx, oz = -Math.sin(f.ry) * dx;
        this.batch.add(postG, this.colored, mat4(f.x + ox, base + 2, f.z + oz), 0x555a63);
      }
      this.occupied.push([f.x, f.z, 8]);
    }
  }

  // maxischermo sul rettilineo dei box
  bigScreen() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 288;
    const x = c.getContext('2d');
    const grd = x.createLinearGradient(0, 0, 512, 288); grd.addColorStop(0, '#120a2e'); grd.addColorStop(1, '#3b1a7a');
    x.fillStyle = grd; x.fillRect(0, 0, 512, 288);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 3; j++) { x.fillStyle = (i + j) % 2 ? '#fff' : '#111'; x.fillRect(i * 32, 236 + j * 17, 32, 17); }
    x.fillStyle = '#ffd21e'; x.font = 'italic 900 64px "Titillium Web", Arial'; x.textAlign = 'center'; x.fillText('NOVA GT', 256, 110);
    x.fillStyle = '#fff'; x.font = '700 34px "Titillium Web", Arial'; x.fillText('GRAND PRIX · LIVE', 256, 165);
    x.fillStyle = '#e8322b'; x.beginPath(); x.arc(84, 152, 9, 0, 7); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const f = this.frame(Math.round(235 / this.track.step), 1, 8);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.65, roughness: 0.4 }));
    scr.position.set(f.x, f.y + 10.5, f.z); scr.rotation.y = f.ry;
    // la faccia della pianta guarda +Z: lo schermo guarda la pista
    this.group.add(scr);
    const back = new THREE.BoxGeometry(17, 10, 0.8);
    const ox = Math.sin(f.ry) * -0.45, oz = Math.cos(f.ry) * -0.45;
    this.batch.add(back, this.colored, mat4(f.x + ox, f.y + 10.5, f.z + oz, f.ry), 0x23252b);
    this.batch.add(new THREE.BoxGeometry(1.2, 6, 1.2), this.colored, mat4(f.x + ox * 3, f.y + 3, f.z + oz * 3, f.ry), 0x3a3d45);
    this.occupied.push([f.x, f.z, 12]);
  }

  // ponte pedonale sopra la pista, con striscione
  bridge() {
    const S = this.track.samples, n = this.track.count, L = this.track.length;
    let best = -1;
    for (let i = Math.round(1100 / this.track.step); i < n - 300 && best < 0; i += 3) {
      let ok = true;
      for (let k = -20; k <= 20 && ok; k++) { const s = S[(i + k) % n]; if (Math.abs(s.curv) > 0.006 || s.wallL > 26.5 || s.wallR > 26.5 || s.pitWall) ok = false; }
      if (ok) best = i;
    }
    if (best < 0) return;
    void L;
    const s = S[best];
    this.bridgeS = s.s;
    const span = s.wallL + s.wallR + 8, mid = (s.wallL - s.wallR) / 2;
    const cx = s.x + s.nx * mid, cz = s.z + s.nz * mid, ry = Math.atan2(-s.tz, s.tx) + Math.PI / 2;
    const deckY = s.y + 12;
    this.batch.add(new THREE.BoxGeometry(span, 1.3, 4), this.colored, mat4(cx, deckY, cz, ry), 0xeceff3);
    this.batch.add(new THREE.BoxGeometry(span, 1.2, 0.15), this.colored, mat4(cx + s.tx * 1.95, deckY + 1.25, cz + s.tz * 1.95, ry), 0x9aa3ae);
    this.batch.add(new THREE.BoxGeometry(span, 1.2, 0.15), this.colored, mat4(cx - s.tx * 1.95, deckY + 1.25, cz - s.tz * 1.95, ry), 0x9aa3ae);
    for (const sd of [1, -1]) {
      const d = sd > 0 ? s.wallL + 3 : -(s.wallR + 3);
      const tx = s.x + s.nx * d, tz = s.z + s.nz * d, gy = this.heightAt(tx, tz);
      const h = deckY - gy + 0.6;
      this.batch.add(new THREE.BoxGeometry(5, h, 5), this.colored, mat4(tx, gy + h / 2, tz, ry), 0xd9dde3);
      this.batch.add(new THREE.BoxGeometry(5.6, 0.6, 5.6), this.colored, mat4(tx, deckY + 0.9, tz, ry), 0xc0262c);
      this.occupied.push([tx, tz, 6]);
    }
    // striscioni sui due lati
    const c = document.createElement('canvas'); c.width = 1024; c.height = 96;
    const x = c.getContext('2d'), grd = x.createLinearGradient(0, 0, 1024, 0);
    grd.addColorStop(0, '#c0262c'); grd.addColorStop(1, '#e8572a'); x.fillStyle = grd; x.fillRect(0, 0, 1024, 96);
    x.fillStyle = '#fff'; x.font = 'italic 900 64px "Titillium Web", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('NOVA GT CHALLENGE', 512, 52);
    const bt = new THREE.CanvasTexture(c); bt.colorSpace = THREE.SRGBColorSpace; bt.anisotropy = this.aniso;
    const ban = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6 });
    for (const sd of [1, -1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(span - 10, 2.4), ban);
      p.position.set(cx + s.tx * 2.06 * sd, deckY - 0.3, cz + s.tz * 2.06 * sd);
      p.rotation.y = Math.atan2(s.tx * sd, s.tz * sd);
      this.group.add(p);
    }
  }

  // paddock dietro ai box: camion delle squadre, hospitality, parcheggio
  paddock() {
    const st = this.track.step, r = rand(17);
    const teams = [0xff8a1c, 0xd8231f, 0x2a62c9, 0x1f9a4a, 0xf5c518, 0x6a2cd8, 0x111111, 0xf2f2f2, 0x27c3ea, 0xe0457b];
    const trailer = new THREE.BoxGeometry(13, 3.8, 2.6), cab = new THREE.BoxGeometry(2.6, 3.2, 2.5);
    const tent = new THREE.ConeGeometry(5.5, 4, 4), tentBase = new THREE.BoxGeometry(7.6, 2.6, 7.6);
    for (let k = 0; k < 14; k++) {
      const ss = -30 + k * 19;
      const f = this.frame(Math.round(ss / st), -1, 26);
      const team = teams[k % teams.length];
      const dx = Math.sin(f.ry), dz = Math.cos(f.ry);   // verso la pista
      // camion parallelo alla pista, rivolto verso il box
      const tx = Math.cos(f.ry), tz = -Math.sin(f.ry);
      this.batch.add(trailer, this.colored, mat4(f.x, f.y + 2.2, f.z, f.ry), team);
      this.batch.add(cab, this.colored, mat4(f.x + tx * 7.8, f.y + 1.9, f.z + tz * 7.8, f.ry), team === 0xf2f2f2 ? 0x2b2d33 : 0xf2f2f2);
      this.batch.add(new THREE.BoxGeometry(12.8, 0.25, 2.2), this.colored, mat4(f.x + dx * 2.4, f.y + 3.3, f.z + dz * 2.4, f.ry), 0xf2f2f2);
      // tende hospitality dietro
      const hx = f.x - dx * 14, hz = f.z - dz * 14;
      this.batch.add(tentBase, this.colored, mat4(hx, f.y + 1.3, hz, f.ry), 0xf4f4f2);
      this.batch.add(tent, this.colored, mat4(hx, f.y + 4.6, hz, f.ry + Math.PI / 4), k % 3 ? 0xf8f8f8 : team);
    }
    // parcheggio del pubblico
    const nCars = this.low ? 120 : 260;
    const body = new THREE.BoxGeometry(4.2, 1.0, 1.8), roof = new THREE.BoxGeometry(2.2, 0.7, 1.6);
    const carCols = [0xf2f2f2, 0x1d1f24, 0x8a8f99, 0xc0262c, 0x2a62c9, 0xd9dde3, 0x34495e, 0xe2b13c];
    let placed = 0;
    for (let row = 0; row < 8 && placed < nCars; row++) for (let k = 0; k < 40 && placed < nCars; k++) {
      if (r() < 0.25) continue;
      const ss = -300 + k * 7;
      const f = this.frame(Math.round(ss / st), -1, 84 + row * 9);
      const col = carCols[Math.floor(r() * carCols.length)];
      this.batch.add(body, this.colored, mat4(f.x, f.y + 0.75, f.z, f.ry), col);
      this.batch.add(roof, this.colored, mat4(f.x, f.y + 1.6, f.z, f.ry), col);
      placed++;
    }
    const a = this.frame(Math.round(95 / st), -1, 60);
    this.occupied.push([a.x, a.z, 175]);
    const b = this.frame(Math.round(-160 / st), -1, 115);
    this.occupied.push([b.x, b.z, 130]);
  }

  // postazioni dei commissari, torri TV e mucchi di gomme lungo la pista
  trackside() {
    const n = this.track.count, st = this.track.step, S = this.track.samples, r = rand(23);
    const hut = new THREE.BoxGeometry(2.4, 2.6, 2.2), hutRoof = new THREE.BoxGeometry(2.9, 0.25, 2.7);
    let side = 1;
    for (let i = 0; i < n; i += Math.round(190 / st)) {
      side = -side;
      if (S[i].pitWall && side < 0) side = 1;
      const f = this.frame(i, side, 1.8);
      if (!this.free(f.x, f.z, 2)) continue;
      this.batch.add(hut, this.colored, mat4(f.x, f.y + 1.3, f.z, f.ry), 0xff7b1c);
      this.batch.add(hutRoof, this.colored, mat4(f.x, f.y + 2.7, f.z, f.ry), 0xf2f2f2);
      this.batch.add(new THREE.BoxGeometry(0.9, 0.6, 0.05), this.colored, mat4(f.x + Math.sin(f.ry) * 1.12, f.y + 1.7, f.z + Math.cos(f.ry) * 1.12, f.ry), 0xf5c518);
      this.occupied.push([f.x, f.z, 4]);
    }
    // torri delle telecamere TV nelle curve lente
    const leg = new THREE.CylinderGeometry(0.1, 0.1, 9, 5), plat = new THREE.BoxGeometry(3, 0.3, 3), cam = new THREE.BoxGeometry(1.2, 0.8, 0.7);
    let last = -999;
    for (let i = 0; i < n; i += 4) {
      if (Math.abs(S[i].curv) < 0.02 || i - last < 120) continue;
      last = i;
      const sd = S[i].curv > 0 ? -1 : 1;   // all'interno della curva
      const f = this.frame(i, sd, 6);
      if (!this.free(f.x, f.z, 3)) continue;
      for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.batch.add(leg, this.colored, mat4(f.x + ax * 1.2, f.y + 4.5, f.z + az * 1.2), 0x9aa3ae);
      this.batch.add(plat, this.colored, mat4(f.x, f.y + 9, f.z, f.ry), 0x5d636d);
      this.batch.add(cam, this.colored, mat4(f.x, f.y + 9.6, f.z, f.ry), 0x1d1f24);
      this.batch.add(new THREE.ConeGeometry(1.6, 1, 4), this.colored, mat4(f.x, f.y + 11.2, f.z, f.ry + Math.PI / 4), 0xf2f2f2);
      this.batch.add(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4), this.colored, mat4(f.x, f.y + 10.2, f.z), 0x9aa3ae);
      this.occupied.push([f.x, f.z, 4]);
    }
    void r;
  }

  // cartelli 150 / 100 / 50 m prima delle staccate principali
  brakeBoards() {
    const S = this.track.samples, n = this.track.count, st = this.track.step;
    const mats = [150, 100, 50].map(v => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 96;
      const x = c.getContext('2d');
      x.fillStyle = '#f4f6f8'; x.fillRect(0, 0, 64, 96);
      x.fillStyle = '#1d4fb8'; x.fillRect(4, 4, 56, 88);
      x.fillStyle = '#fff'; x.font = '900 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(v), 32, 50);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
    });
    const board = new THREE.BoxGeometry(0.15, 1.8, 1.2), post = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 5);
    // inizio delle curve vere: la curvatura sale oltre la soglia dopo un tratto quasi dritto
    let lastCorner = -999;
    for (let i = 0; i < n; i++) {
      const c = Math.abs(S[i].curv), cPrev = Math.abs(S[(i - 1 + n) % n].curv);
      if (!(c > 0.012 && cPrev <= 0.012) || i - lastCorner < 60) continue;
      let straight = 0;
      for (let k = 1; k < 120; k++) { if (Math.abs(S[(i - k + n) % n].curv) < 0.006) straight++; }
      if (straight < 70) continue;
      lastCorner = i;
      const side = S[i].curv > 0 ? 1 : -1;   // lato esterno della curva (dove si arriva in staccata)
      [150, 100, 50].forEach((dist, q) => {
        const j = (i - Math.round((dist + 20) / st) + n) % n, s = S[j];
        const d = (s.hw + 1.6 + 2.2) * side;
        const x = s.x + s.nx * d, z = s.z + s.nz * d, ry = Math.atan2(-s.tz, s.tx);
        this.batch.add(board, mats[q], mat4(x, s.y + 1.9, z, ry + Math.PI));
        this.batch.add(post, this.colored, mat4(x, s.y + 0.6, z), 0x9aa3ae);
      });
    }
  }

  // spettatori dietro le reti nelle curve lente (saltano ed esultano)
  spectators() {
    const S = this.track.samples, n = this.track.count, r = rand(29);
    const body = mergeGeometries([
      new THREE.CylinderGeometry(0.24, 0.28, 1.15, 5, 1, true).translate(0, 0.58, 0),
      new THREE.IcosahedronGeometry(0.17, 0).translate(0, 1.32, 0),
    ].map(g => { const q = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal') q.deleteAttribute(k); return q; }));
    const pts = [];
    const target = this.low ? 1600 : 3200;
    let lastI = -999;
    for (let i = 0; i < n && pts.length < target; i += 3) {
      if (Math.abs(S[i].curv) < 0.01 || i - lastI < 35) continue;
      lastI = i;
      const side = S[i].curv > 0 ? 1 : -1;   // esterno curva
      const crowd = 70 + Math.floor(r() * 110);
      for (let k = 0; k < crowd; k++) {
        const f = this.frame(i + Math.round((r() - 0.5) * 36), side, 1.3 + Math.pow(r(), 1.5) * 5, (r() - 0.5) * 3);
        if (!this.free(f.x, f.z, 0.3)) continue;
        pts.push([f.x, f.y, f.z, r()]);
      }
    }
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const uT = { value: 0 };
    mat.onBeforeCompile = sh => {
      sh.uniforms.uT = uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = fract(sin(instanceMatrix[3][0] * 12.9 + instanceMatrix[3][2] * 78.2) * 43758.5);
          transformed.y += max(0.0, sin(uT * (5.0 + ph * 3.0) + ph * 40.0)) * 0.22 * step(0.55, ph);`);
    };
    this.animated.push(t => { uT.value = t; });
    const shirts = [0xe8463a, 0xf08a2a, 0xf6d24a, 0x2f6fd6, 0xffffff, 0x1f1f1f, 0xd94b8c, 0x3aa35a, 0xff7b1c, 0xc0262c, 0x6a2cd8];
    const im = new THREE.InstancedMesh(body, mat, pts.length);
    pts.forEach(([x, y, z, rr], q) => {
      im.setMatrixAt(q, mat4(x, y, z, rr * 6, 1.35, 1.35 * (0.85 + rr * 0.3), 1.35));
      im.setColorAt(q, new THREE.Color(shirts[Math.floor(rr * 97) % shirts.length]));
    });
    im.receiveShadow = true;
    this.group.add(im);
  }

  // campeggio dei tifosi nell'interno: tende, camper e falò
  campsite() {
    const r = rand(41), b = this.bounds;
    const inside = (x, z) => this.insideTrack(x, z);
    // zona più ampia lontana dal lago
    let best = null;
    for (let x = b.minX; x < b.maxX; x += 25) for (let z = b.minZ; z < b.maxZ; z += 25) {
      const d = this.clearance(x, z).d, dl = Math.hypot(x - this.lake.x, z - this.lake.z) - this.lake.R * 1.3;
      const sc = Math.min(d, dl);
      if (sc > 50 && (!best || sc > best.sc) && inside(x, z)) best = { x, z, sc };
    }
    if (!best) return;
    const tentG = new THREE.ConeGeometry(1.8, 1.9, 4), van = new THREE.BoxGeometry(5.5, 2.6, 2.2);
    const cols = [0xd8352a, 0x2a62c9, 0xf5c518, 0x1f9a4a, 0xff7b1c, 0x6a2cd8, 0xf2f2f2];
    const R = Math.min(70, best.sc - 15), count = this.low ? 60 : 110;
    for (let k = 0; k < count; k++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * R;
      const x = best.x + Math.cos(a) * d, z = best.z + Math.sin(a) * d, y = this.heightAt(x, z);
      if (r() < 0.75) this.batch.add(tentG, this.colored, mat4(x, y + 0.9, z, r() * 3, 1, 1, 1.3), cols[Math.floor(r() * cols.length)]);
      else this.batch.add(van, this.colored, mat4(x, y + 1.4, z, r() * 3), r() < 0.5 ? 0xf2f2f2 : 0xe8e2d0);
    }
    this.occupied.push([best.x, best.z, R + 6]);
  }

  // paese sulla collina: case con tetti rossi e campanile
  village() {
    const r = rand(55), tb = this.terrainBox;
    // punto lontano dalla pista sul lato sud (fuori dall'interno)
    let best = null;
    for (let k = 0; k < 400; k++) {
      const x = tb.x0 + 350 + r() * (tb.x1 - tb.x0 - 700), z = tb.z0 + 300 + r() * (tb.z1 - tb.z0 - 600);
      const d = this.clearance(x, z).d;
      if (d < 330 || d > 520 || !this.free(x, z, 120)) continue;
      const sc = this.heightAt(x, z) - d * 0.02;
      if (!best || sc > best.sc) best = { x, z, sc };
    }
    if (!best) return;
    const walls = [0xf1e6d0, 0xe9d6b4, 0xf6f1e7, 0xe8c9a3, 0xd9c2a0];
    const roofs = [0xb2482c, 0xa33e26, 0xc25a35];
    const box = new THREE.BoxGeometry(1, 1, 1), roofG = new THREE.CylinderGeometry(0.71, 0.71, 1, 3).rotateZ(Math.PI / 2).rotateX(Math.PI / 6);
    const houses = this.low ? 40 : 70;
    const pts = [];
    for (let k = 0; k < houses * 3 && pts.length < houses; k++) {
      const a = r() * 6.28, d = 12 + Math.sqrt(r()) * 120;
      const x = best.x + Math.cos(a) * d, z = best.z + Math.sin(a) * d;
      if (pts.some(p => Math.hypot(p[0] - x, p[1] - z) < 14)) continue;
      pts.push([x, z]);
      const y = this.heightAt(x, z), w = 7 + r() * 5, l = 9 + r() * 7, h = 5 + r() * 4, ry = Math.round(r() * 4) * Math.PI / 2 + (r() - 0.5) * 0.3;
      this.batch.add(box, this.colored, mat4(x, y + h / 2 - 1, z, ry, l, h + 2, w), walls[Math.floor(r() * walls.length)]);
      this.batch.add(roofG, this.colored, mat4(x, y + h + 1, z, ry, l + 0.8, w * 0.42, w * 0.82), roofs[Math.floor(r() * roofs.length)]);
    }
    // chiesa con campanile
    const y = this.heightAt(best.x, best.z);
    this.batch.add(box, this.colored, mat4(best.x, y + 5, best.z, 0.3, 22, 12, 11), 0xf3ead8);
    this.batch.add(roofG, this.colored, mat4(best.x, y + 12.5, best.z, 0.3, 23, 4.6, 9.2), 0xa33e26);
    this.batch.add(box, this.colored, mat4(best.x + 12, y + 14, best.z - 4, 0.3, 5, 30, 5), 0xece0c8);
    this.batch.add(new THREE.ConeGeometry(3.8, 9, 4), this.colored, mat4(best.x + 12, y + 33.5, best.z - 4, 0.3 + Math.PI / 4), 0x7a3a26);
    this.occupied.push([best.x, best.z, 140]);
  }

  // pale eoliche sulle colline lontane (rotori animati)
  windFarm() {
    const tb = this.terrainBox, r = rand(61);
    const spots = [];
    for (let k = 0; k < 600 && spots.length < 9; k++) {
      const edge = r() < 0.5;
      const x = edge ? tb.x0 + 280 + r() * (tb.x1 - tb.x0 - 560) : (r() < 0.5 ? tb.x0 + 280 + r() * 200 : tb.x1 - 480 + r() * 200);
      const z = edge ? (r() < 0.6 ? tb.z0 + 280 + r() * 160 : tb.z1 - 440 + r() * 160) : tb.z0 + 300 + r() * (tb.z1 - tb.z0 - 600);
      if (this.clearance(x, z).d < 420 || !this.free(x, z, 60) || spots.some(s => Math.hypot(s.x - x, s.z - z) < 160)) continue;
      spots.push({ x, z, y: this.heightAt(x, z) });
    }
    const tower = new THREE.CylinderGeometry(1.1, 2.2, 78, 10), nac = new THREE.BoxGeometry(7, 3, 3);
    const blade = new THREE.BoxGeometry(1.6, 34, 0.5).translate(0, 17, 0);
    const bladeSet = mergeGeometries([0, 1, 2].map(k => blade.clone().rotateZ(k * Math.PI * 2 / 3)));
    const rotors = new THREE.InstancedMesh(bladeSet, new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.5 }), spots.length);
    const face = Math.atan2(ENV.sunDir.x, ENV.sunDir.z);
    spots.forEach(s => {
      this.batch.add(tower, this.colored, mat4(s.x, s.y + 39, s.z), 0xf1f3f6);
      this.batch.add(nac, this.colored, mat4(s.x, s.y + 79, s.z, face), 0xe6e9ee);
      this.occupied.push([s.x, s.z, 20]);
    });
    this.group.add(rotors);
    const off = spots.map(() => r() * 6);
    this.animated.push(t => {
      spots.forEach((s, k) => {
        const hx = Math.sin(face) * 3.8, hz = Math.cos(face) * 3.8;
        rotors.setMatrixAt(k, mat4(s.x + hx, s.y + 79, s.z + hz, face, 1, 1, 1, 0, t * 1.1 + off[k]));
      });
      rotors.instanceMatrix.needsUpdate = true;
    });
  }

  // mongolfiere che si spostano lentamente
  balloons() {
    const r = rand(71);
    const prof = [];
    for (let k = 0; k <= 12; k++) { const a = -Math.PI / 2 + k / 12 * Math.PI; prof.push(new THREE.Vector2(Math.max(0.6, Math.cos(a) * 9 * (a < 0 ? 0.75 + 0.25 * (1 + Math.sin(a)) : 1)), Math.sin(a) * 10 + 10)); }
    const env = new THREE.LatheGeometry(prof, 12);
    const cols = [[0xd8231f, 0xf5c518], [0x2a62c9, 0xf2f2f2], [0x1f9a4a, 0xff7b1c]];
    this.balloonList = [];
    for (let k = 0; k < 3; k++) {
      const g = env.clone().toNonIndexed();
      const pos = g.attributes.position, colArr = new Float32Array(pos.count * 3), c1 = new THREE.Color(cols[k][0]), c2 = new THREE.Color(cols[k][1]);
      for (let v = 0; v < pos.count; v++) {
        const a = Math.atan2(pos.getZ(v), pos.getX(v)), c = Math.floor((a + Math.PI) / (Math.PI * 2) * 12) % 2 ? c1 : c2;
        colArr.set([c.r, c.g, c.b], v * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
      g.computeVertexNormals();
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true })));
      const basket = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 2), new THREE.MeshStandardMaterial({ color: 0x7a5a36 }));
      basket.position.y = -3.5; grp.add(basket);
      const a = r() * 6.28, d = 500 + r() * 500;
      const b = { grp, x: this.center.x + Math.cos(a) * d, z: this.center.z + Math.sin(a) * d, y: 140 + r() * 120, vx: 1.5 + r() * 1.5, vz: 0.5 + r(), ph: r() * 6 };
      grp.position.set(b.x, b.y, b.z);
      this.scene.add(grp);
      this.balloonList.push(b);
    }
    this.animated.push((t, dt) => {
      for (const b of this.balloonList) {
        b.x += b.vx * dt; b.z += b.vz * dt;
        const dx = b.x - this.center.x, dz = b.z - this.center.z;
        if (Math.hypot(dx, dz) > 1400) { b.x = this.center.x - dx * 0.7; b.z = this.center.z - dz * 0.7; }
        b.grp.position.set(b.x, b.y + Math.sin(t * 0.3 + b.ph) * 4, b.z);
      }
    });
  }

  // ------------------------------------------------------------------ vegetazione
  trees() {
    const total = this.low ? 1800 : 4200;
    const conG = mergeGeometries([
      new THREE.ConeGeometry(2.6, 5, 7).translate(0, 4.5, 0),
      new THREE.ConeGeometry(2.0, 4, 7).translate(0, 7.2, 0),
      new THREE.ConeGeometry(1.3, 3, 7).translate(0, 9.4, 0),
    ]);
    const leafG = mergeGeometries([
      new THREE.IcosahedronGeometry(3.0, 0).translate(0, 6.2, 0),
      new THREE.IcosahedronGeometry(2.3, 0).translate(1.6, 5.2, 0.6),
      new THREE.IcosahedronGeometry(2.2, 0).translate(-1.3, 5.6, -0.9),
      ...(this.low ? [] : [new THREE.IcosahedronGeometry(1.9, 0).translate(0.2, 8.2, 0.3)]),
    ]);
    const popG = new THREE.IcosahedronGeometry(1, 0).scale(1.7, 6.2, 1.7).translate(0, 8.5, 0);
    const trunkG = new THREE.CylinderGeometry(0.28, 0.4, 3.2, 5, 1, true).translate(0, 1.6, 0);
    const species = [conG, leafG, popG];
    const fMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const tMat = new THREE.MeshStandardMaterial({ color: 0x5b3b22, roughness: 1 });
    // per specie: [vicini (con ombra), lontani]
    const lists = species.map(() => [[], []]), trunks = [[], []];
    const tb = this.terrainBox;
    const r = rand(42);
    const L = this.lake;
    const c = new THREE.Color();
    let k = 0, tries = 0;
    while (k < total && tries < total * 40) {
      tries++;
      const x = tb.x0 + 80 + r() * (tb.x1 - tb.x0 - 160);
      const z = tb.z0 + 80 + r() * (tb.z1 - tb.z0 - 160);
      const cl = this.clearance(x, z).d;
      if (cl < 14) continue;
      const rl = Math.hypot(x - L.x, z - L.z);
      if (rl < this.lakeR(Math.atan2(z - L.z, x - L.x)) + 14) continue;
      const f = this.field(x, z);
      const forestNoise = Math.sin(x * 0.013) * Math.cos(z * 0.017) * 0.5 + 0.5;
      let p, sp;
      if (cl < 110) { p = 0.18 + 0.55 * forestNoise; sp = r() < 0.55 ? 1 : 0; }
      else if (f.type === 2) { p = 0.95; sp = this.heightAt(x, z) > 25 || forestNoise > 0.6 ? 0 : (r() < 0.6 ? 1 : 0); }
      else if (f.edge < 5) { p = 0.6; sp = r() < 0.4 ? 2 : 1; }
      else continue;
      if (r() > p) continue;
      if (this.occupied.some(([ox, oz, rad]) => (ox - x) ** 2 + (oz - z) ** 2 < rad * rad)) continue;
      const y = this.heightAt(x, z);
      const s1 = 0.75 + r() * 0.85;
      const m = mat4(x, y - 0.2, z, r() * 6.28, s1, s1 * (0.85 + r() * 0.35), s1);
      if (sp === 0) c.setHSL(0.36 + r() * 0.05, 0.42 + r() * 0.15, 0.16 + r() * 0.08);
      else if (sp === 1) c.setHSL(0.24 + r() * 0.08, 0.5 + r() * 0.2, 0.26 + r() * 0.12);
      else c.setHSL(0.27 + r() * 0.04, 0.45 + r() * 0.1, 0.27 + r() * 0.06);
      const near = cl < 70 ? 0 : 1;
      lists[sp][near].push([m, c.clone()]);
      trunks[near].push(m);
      k++;
    }
    lists.forEach((pair, sp) => pair.forEach((arr, near) => {
      if (!arr.length) return;
      const im = new THREE.InstancedMesh(species[sp], fMat, arr.length);
      arr.forEach(([m, col], q) => { im.setMatrixAt(q, m); im.setColorAt(q, col); });
      im.castShadow = near === 0; im.receiveShadow = true;
      this.group.add(im);
    }));
    trunks.forEach((arr, near) => {
      if (!arr.length) return;
      const im = new THREE.InstancedMesh(trunkG, tMat, arr.length);
      arr.forEach((m, q) => im.setMatrixAt(q, m));
      im.castShadow = near === 0;
      this.group.add(im);
    });
  }

  // cespugli lungo le recinzioni
  bushes() {
    const n = this.track.count, r = rand(13);
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mats = [];
    const count = this.low ? 500 : 1100;
    for (let k = 0; k < count * 3 && mats.length < count; k++) {
      const i = Math.floor(r() * n), side = r() < 0.5 ? 1 : -1;
      const f = this.frame(i, side, 2 + r() * 6, (r() - 0.5) * 4);
      if (!this.free(f.x, f.z, 1.5)) continue;
      const s = 0.9 + r() * 1.4;
      mats.push([mat4(f.x, f.y + s * 0.4, f.z, r() * 6, s * 1.3, s * 0.8, s), new THREE.Color().setHSL(0.25 + r() * 0.07, 0.45 + r() * 0.2, 0.22 + r() * 0.1)]);
    }
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), mats.length);
    mats.forEach(([m, c], q) => { im.setMatrixAt(q, m); im.setColorAt(q, c); });
    im.receiveShadow = true;
    this.group.add(im);
  }

  update(dt) {
    this.time += dt;
    this.skyMesh.material.uniforms.time.value = this.time;
    for (const fn of this.animated) fn(this.time, dt);
  }
}
