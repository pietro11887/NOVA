// Monumenti veri attorno ai circuiti, nella loro posizione reale (coordinate da OpenStreetMap):
// le ruote panoramiche di Singapore, Las Vegas e Suzuka, la Sphere di Las Vegas con lo schermo
// animato, il Marina Bay Sands, la Biosfera di Montréal, la torre di Austin, il Casinò e gli yacht
// di Monaco, le Flame Towers di Baku, la copertura a LED dello Yas Hotel e il castello di Nürburg.
// Modelli semplici fatti di forme base; di notte si accendono (LED, finestre, fari).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// edifici dei dati OSM da non costruire perché li sostituisce il monumento
const SKIP = {
  singapore: [/^SkyPark$/, /^Marina Bay Sands Tower/, /^Singapore Flyer$/],
  lasvegas: [/^Sphere$/, /^Eiffel Tower$/, /^High Roller$/],
  montreal: [/^Biosphère$/],
  austin: [[311, -161, 14]],
  nordschleife: [[-816, 919, 60]],
};
export function landmarkSkip(id, b, cx, cz) {
  const L = SKIP[id];
  if (!L) return false;
  for (const r of L) {
    if (r instanceof RegExp) { if (b.n && r.test(b.n)) return true; }
    else if (Math.hypot(cx - r[0], cz - r[1]) < r[2]) return true;
  }
  return false;
}

const UP = new THREE.Vector3(0, 1, 0);
// trave cilindrica tra due punti
function beam(a, b, r, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const merged = (list, mat) => { const m = new THREE.Mesh(mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g)), mat); m.castShadow = true; m.receiveShadow = true; return m; };
const hsl = (h, s, l) => new THREE.Color().setHSL(h, s, l);

// finestre di notte (tessera condivisa)
let _winTex = null, _floorTex = null;
function winTex() {
  if (_winTex) return _winTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (r() < 0.55) {
    g.fillStyle = r() < 0.6 ? `rgba(255,${200 + r() * 40 | 0},140,1)` : 'rgba(215,235,255,1)';
    g.fillRect(i * 16 + 2, j * 16 + 4, 12, 9);
  }
  _winTex = new THREE.CanvasTexture(c); _winTex.wrapS = _winTex.wrapT = THREE.RepeatWrapping; _winTex.colorSpace = THREE.SRGBColorSpace;
  return _winTex;
}
function floorTex() {
  if (_floorTex) return _floorTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#8fa6b8'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#c9d3da'; g.fillRect(0, 0, 64, 5);
  g.fillStyle = 'rgba(40,60,80,0.35)'; for (let i = 0; i < 64; i += 16) g.fillRect(i, 5, 1, 59);
  _floorTex = new THREE.CanvasTexture(c); _floorTex.wrapS = _floorTex.wrapT = THREE.RepeatWrapping; _floorTex.colorSpace = THREE.SRGBColorSpace;
  return _floorTex;
}
// facciata di vetro di un grattacielo (piani e montanti; di notte finestre accese)
function glassMat(night, rx, ry) {
  const map = floorTex().clone(); map.repeat.set(rx, ry); map.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ map, color: 0xb8c8d4, metalness: 0.55, roughness: 0.22 });
  if (night) { const e = winTex().clone(); e.repeat.set(rx / 2, ry / 8); e.needsUpdate = true; m.emissiveMap = e; m.emissive.set(0xffffff); m.emissiveIntensity = 0.9; }
  return m;
}

// ---------------------------------------------------------------- ruota panoramica
function wheel(night, { D, hub, cab, cabR = 2.4, capsule = false, speed = 0.012, led = true }) {
  const R = D / 2, w = Math.max(2, D * 0.035), grp = new THREE.Group();
  const steel = [], white = new THREE.MeshStandardMaterial({ color: 0xeef1f4, metalness: 0.5, roughness: 0.4 });
  // gambe ad A e mozzo
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) steel.push(beam(V(sx * R * 0.42, -2, sz * (w + R * 0.16)), V(0, hub, sz * w * 0.8), Math.max(0.5, D * 0.008)));
  steel.push(beam(V(0, hub, -w * 1.3), V(0, hub, w * 1.3), Math.max(0.8, D * 0.012), 10));
  grp.add(merged(steel, white));
  // parte che gira: due cerchioni, raggi, traversi
  const rot = new THREE.Group(); rot.position.y = hub; grp.add(rot);
  const rim = [], spokes = [];
  for (const sz of [-1, 1]) rim.push(new THREE.TorusGeometry(R, Math.max(0.35, D * 0.006), 6, 96).translate(0, 0, sz * w));
  const S = Math.max(16, Math.round(D / 5));
  for (let k = 0; k < S; k++) {
    const a = k / S * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (const sz of [-1, 1]) spokes.push(beam(V(0, 0, sz * w * 0.9), V(c * R, s * R, sz * w), Math.max(0.08, D * 0.0012), 3));
    spokes.push(beam(V(c * R, s * R, -w), V(c * R, s * R, w), Math.max(0.15, D * 0.002), 4));
  }
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: 0.5, roughness: 0.35, emissive: 0x000000 });
  rot.add(merged(rim, rimMat));
  rot.add(merged(spokes, white));
  // cabine: restano dritte mentre la ruota gira
  const cg = capsule ? new THREE.SphereGeometry(cabR, 10, 8).scale(1, 0.8, 1.6) : new THREE.CylinderGeometry(cabR, cabR * 0.8, cabR * 1.6, 8);
  const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.25, emissive: night ? 0x6688aa : 0x000000, emissiveIntensity: 0.5 });
  const cabs = new THREE.InstancedMesh(cg, cm, cab);
  for (let k = 0; k < cab; k++) cabs.setColorAt(k, capsule ? new THREE.Color(0xd8e8f2) : hsl(k / cab, 0.75, 0.55));
  grp.add(cabs);
  const o = new THREE.Object3D();
  let ang = 0;
  const update = (dt, t) => {
    ang += dt * speed; rot.rotation.z = ang;
    for (let k = 0; k < cab; k++) {
      const a = ang + k / cab * Math.PI * 2;
      o.position.set(Math.cos(a) * (R + cabR * 0.6), hub + Math.sin(a) * (R + cabR * 0.6) - cabR * 0.9, 0);
      o.updateMatrix(); cabs.setMatrixAt(k, o.matrix);
    }
    cabs.instanceMatrix.needsUpdate = true;
    if (night && led) rimMat.emissive.setHSL((t * 0.05) % 1, 0.9, 0.5);
  };
  update(0, 0);
  if (night && led) rimMat.emissiveIntensity = 1.6;
  return { obj: grp, update };
}

// ---------------------------------------------------------------- Sphere (Las Vegas): schermo LED sferico
function sphere(night, front) {
  const R = 78;
  const mat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, front: { value: front.clone().normalize() }, k: { value: night ? 1.25 : 0.95 } },
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float t; uniform vec3 front; uniform float k; varying vec3 vN;
      vec3 hsv(float h, float s, float v){ vec3 p = abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0); return v * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), s); }
      void main(){
        vec3 n = normalize(vN);
        float u = atan(n.z, n.x) / 6.2832 + 0.5, v = asin(clamp(n.y, -1.0, 1.0)) / 3.1416 + 0.5;
        float mode = mod(floor(t / 14.0), 4.0);
        vec3 c;
        if (mode < 1.0) {
          // l'occhio gigante che si guarda intorno
          vec3 look = normalize(front + vec3(sin(t * 0.45) * 0.35, 0.15 + sin(t * 0.31) * 0.12, cos(t * 0.37) * 0.3));
          float d = acos(clamp(dot(n, look), -1.0, 1.0));
          float blink = 1.0 - smoothstep(0.46, 0.49, abs(fract(t / 5.0) - 0.5));
          c = vec3(0.95, 0.92, 0.88) * (1.0 - 0.25 * smoothstep(0.6, 1.4, d));
          float ang = atan(dot(cross(look, n), vec3(0.0, 1.0, 0.0)), n.y);
          vec3 iris = mix(vec3(0.05, 0.35, 0.6), vec3(0.3, 0.75, 0.9), smoothstep(0.17, 0.45, d)) * (1.2 - d * 1.2);
          c = mix(c, iris, smoothstep(0.47, 0.44, d));
          c = mix(c, vec3(0.01), smoothstep(0.2, 0.17, d));
          c += vec3(1.0) * smoothstep(0.07, 0.04, distance(n, normalize(look + vec3(-0.12, 0.14, 0.0))));
          c = mix(vec3(0.05, 0.02, 0.01), c, blink);
        } else if (mode < 2.0) {
          // bandiera a scacchi che sventola
          float w = sin(u * 25.0 - t * 3.0) * 0.03;
          float ch = mod(floor(u * 48.0) + floor((v + w) * 20.0), 2.0);
          c = vec3(ch) * (0.75 + 0.25 * sin(u * 25.0 - t * 3.0));
        } else if (mode < 3.0) {
          // arcobaleno che scorre
          c = hsv(fract(u * 2.0 + v * 0.7 - t * 0.08), 0.85, 1.0);
        } else {
          // pallone da basket / pianeta: fasce e crateri arancio
          float b = smoothstep(0.02, 0.0, abs(n.y)) + smoothstep(0.02, 0.0, abs(sin((u + t * 0.02) * 6.2832 * 2.0)) * 0.5);
          c = mix(vec3(0.95, 0.42, 0.08), vec3(0.08), clamp(b, 0.0, 1.0));
        }
        // matrice di LED
        vec2 q = vec2(u * 900.0, v * 420.0), g = fract(q) - 0.5;
        float aa = clamp(1.6 - max(fwidth(q.x), fwidth(q.y)) * 2.0, 0.0, 1.0);
        c *= mix(0.78, 0.55 + 0.45 * smoothstep(0.5, 0.2, length(g)), aa);
        gl_FragColor = vec4(c * k, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  mat.toneMapped = false;
  const m = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), mat);
  m.position.y = 112 - R;
  const grp = new THREE.Group(); grp.add(m);
  return { obj: grp, update: (dt, t) => { mat.uniforms.t.value = t; } };
}

// ---------------------------------------------------------------- Marina Bay Sands
function mbs(night) {
  const grp = new THREE.Group(), H = 194;
  const glass = glassMat(night, 8, 50);
  const parts = [];
  for (const cx of [-112, 0, 112]) {
    // due lame per torre: una dritta, l'altra appoggiata che si curva verso di lei
    parts.push(new THREE.BoxGeometry(34, H, 20).translate(cx, H / 2, -18));
    const b = new THREE.BoxGeometry(34, H, 20, 1, 12, 1).translate(0, H / 2, 0);
    const P = b.attributes.position;
    for (let i = 0; i < P.count; i++) { const y = P.getY(i), f = y / H; P.setZ(i, P.getZ(i) + 26 - 22 * Math.sin(f * Math.PI / 2)); P.setX(i, P.getX(i) + cx); }
    b.computeVertexNormals(); parts.push(b);
  }
  grp.add(merged(parts, glass));
  // SkyPark: la "nave" sopra le torri, con lo sbalzo a nord
  const sp = [new THREE.BoxGeometry(330, 7, 40).translate(25, H + 3.5, -6), new THREE.BoxGeometry(320, 1.5, 34).translate(25, H + 7.8, -6)];
  const deck = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, metalness: 0.3, roughness: 0.5 });
  grp.add(merged(sp, deck));
  const pool = new THREE.Mesh(new THREE.BoxGeometry(140, 0.6, 9), new THREE.MeshStandardMaterial({ color: 0x3fb7d8, roughness: 0.05, metalness: 0.1, emissive: night ? 0x1a7fa0 : 0x000000 }));
  pool.position.set(60, H + 8.6, 6); grp.add(pool);
  // palme sul tetto
  const tr = [];
  for (let i = 0; i < 26; i++) tr.push(new THREE.SphereGeometry(2.2, 6, 4).translate(-110 + i * 11, H + 11, -18));
  grp.add(merged(tr, new THREE.MeshStandardMaterial({ color: 0x3f6f3a, roughness: 0.9 })));
  return { obj: grp };
}

// ---------------------------------------------------------------- torre Eiffel (Paris Las Vegas, scala 1:2)
function latticeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.strokeRect(1, 1, 62, 62);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function eiffel(night) {
  const H = 165, wOf = y => 30 * Math.exp(-y / 38) + 1.6 + 2 * (1 - y / H);
  const pos = [], uv = [], idx = [];
  const N = 48, yA = 0.13 * H, legF = 0.3;
  const quad = (a, b, c, d) => { const o = pos.length / 3; for (const p of [a, b, c, d]) { pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); } idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  for (let f = 0; f < 4; f++) {
    const ang = f * Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (y, s) => { const w = wOf(y), x = s * w, z = w; return [x * ca - z * sa, y, x * sa + z * ca, (s * w) / 6, y / 6]; };
    for (let k = 0; k < N; k++) {
      const y0 = H * k / N, y1 = H * (k + 1) / N;
      if (y1 <= yA * 1.05) {
        // in basso solo le quattro gambe, con l'arco in mezzo
        for (const sd of [-1, 1]) quad(P(y0, sd), P(y0, sd * (1 - legF)), P(y1, sd * (1 - legF)), P(y1, sd));
        // arco
        const a0 = Math.sqrt(Math.max(0, 1 - (y0 / yA) ** 2)) * (1 - legF), a1 = Math.sqrt(Math.max(0, 1 - (y1 / yA) ** 2)) * (1 - legF);
        if (y0 > yA * 0.55) quad(P(y0, -(1 - legF)), P(y0, -a0), P(y1, -a1), P(y1, -(1 - legF))), quad(P(y0, a0), P(y0, 1 - legF), P(y1, 1 - legF), P(y1, a1));
      } else quad(P(y0, -1), P(y0, 1), P(y1, 1), P(y1, -1));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const lt = latticeTex();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, map: lt, alphaMap: lt, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.6 });
  if (night) { mat.emissive.set(0xffb347); mat.emissiveMap = lt; mat.emissiveIntensity = 1.4; }
  const grp = new THREE.Group();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; grp.add(m);
  const plat = [];
  for (const y of [yA, 0.38 * H, 0.86 * H]) { const w = wOf(y) * 2 + 3; plat.push(new THREE.BoxGeometry(w, 2.4, w).translate(0, y, 0)); }
  plat.push(new THREE.CylinderGeometry(0.4, 1.2, 12, 6).translate(0, H + 6, 0));
  grp.add(merged(plat, new THREE.MeshStandardMaterial({ color: 0x7a4e33, roughness: 0.7, emissive: night ? 0x664422 : 0x000000 })));
  if (night) { const b = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4, 3), toneMapped: false })); b.position.y = H + 12; grp.add(b); }
  return { obj: grp };
}

// ---------------------------------------------------------------- Biosfera (Montréal)
function biosphere(night) {
  const R = 38, grp = new THREE.Group();
  const ico = new THREE.IcosahedronGeometry(R, 5);
  const e = new THREE.EdgesGeometry(ico, 1);
  const P = e.attributes.position, keep = [];
  for (let i = 0; i < P.count; i += 2) if (P.getY(i) > -R * 0.62 || P.getY(i + 1) > -R * 0.62) keep.push(P.getX(i), P.getY(i), P.getZ(i), P.getX(i + 1), P.getY(i + 1), P.getZ(i + 1));
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: night ? 0x9fd3ff : 0xd5dadf, transparent: true, opacity: 0.9 }));
  lines.position.y = R * 0.62; grp.add(lines);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R * 0.99, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.81),
    new THREE.MeshStandardMaterial({ color: 0x9fb4c4, transparent: true, opacity: 0.2, metalness: 0.6, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide, emissive: night ? 0x1b4466 : 0x000000 }));
  shell.position.y = R * 0.62; grp.add(shell);
  return { obj: grp };
}

// ---------------------------------------------------------------- torre di osservazione del COTA
function cotaTower(night) {
  const grp = new THREE.Group(), H = 77;
  const white = new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.5 });
  grp.add(merged([new THREE.CylinderGeometry(1.8, 2.6, 70, 12).translate(0, 35, 0), new THREE.CylinderGeometry(9, 7, 3.5, 20).translate(0, 69, 0), new THREE.CylinderGeometry(3, 3, 6, 12).translate(0, 73.5, 0)], white));
  const red = [];
  for (let k = 0; k < 34; k++) {
    const a = k / 34 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const cv = new THREE.QuadraticBezierCurve3(V(c * 3.2, H, s * 3.2), V(c * 15, H * 0.42, s * 15), V(c * 19, 0, s * 19));
    red.push(new THREE.TubeGeometry(cv, 18, 0.22, 4));
  }
  grp.add(merged(red, new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.5, emissive: night ? 0xc8102e : 0x000000, emissiveIntensity: 0.9 })));
  return { obj: grp };
}

// ---------------------------------------------------------------- Casinò di Monte-Carlo
function casino(night) {
  const grp = new THREE.Group();
  const cream = new THREE.MeshStandardMaterial({ color: 0xeadcbe, roughness: 0.75, emissive: night ? 0x7a5a2a : 0x000000, emissiveIntensity: 0.55 });
  const slate = new THREE.MeshStandardMaterial({ color: 0x5f7a72, roughness: 0.6, metalness: 0.3 });
  const body = [new THREE.BoxGeometry(62, 18, 34).translate(0, 9, 0), new THREE.BoxGeometry(20, 22, 6).translate(0, 11, -18.5)];
  for (const sx of [-1, 1]) body.push(new THREE.BoxGeometry(8, 30, 8).translate(sx * 22, 15, -15));
  // colonne del portico
  for (let i = 0; i < 8; i++) body.push(new THREE.CylinderGeometry(0.45, 0.45, 9, 8).translate(-8 + i * 16 / 7, 4.5, -22));
  body.push(new THREE.BoxGeometry(20, 1.4, 4).translate(0, 9.5, -22));
  grp.add(merged(body, cream));
  const roof = [new THREE.BoxGeometry(58, 5, 30).translate(0, 20.5, 0)];
  for (const sx of [-1, 1]) roof.push(new THREE.ConeGeometry(6.3, 9, 4).rotateY(Math.PI / 4).translate(sx * 22, 34.5, -15));
  roof.push(new THREE.SphereGeometry(6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 23, -15));
  grp.add(merged(roof, slate));
  // orologio sopra l'ingresso, e finestre ad arco
  const clock = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: night ? 0xfff2cc : 0xf4f0e6 }));
  clock.position.set(0, 18.5, -21.6); clock.rotation.y = Math.PI; grp.add(clock);
  const wins = [];
  for (let i = 0; i < 9; i++) for (const y of [4, 12]) if (Math.abs(-26 + i * 6.5) > 11) wins.push(new THREE.PlaneGeometry(2.6, 4.5).rotateY(Math.PI).translate(-26 + i * 6.5, y, -17.05));
  grp.add(merged(wins, new THREE.MeshStandardMaterial({ color: night ? 0xffd98a : 0x2c3238, emissive: night ? 0xffc060 : 0x000000, emissiveIntensity: 1.2, roughness: 0.2 })));
  return { obj: grp };
}

// ---------------------------------------------------------------- yacht nel porto
function yacht(L, r, night) {
  const B = L * 0.2, grp = new THREE.Group();
  const sh = new THREE.Shape([V(-L / 2, -B / 2, 0), V(L * 0.22, -B / 2, 0), V(L / 2, 0, 0), V(L * 0.22, B / 2, 0), V(-L / 2, B / 2, 0)].map(p => new THREE.Vector2(p.x, p.y)));
  const hull = new THREE.ExtrudeGeometry(sh, { depth: L * 0.07, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const hc = r() < 0.3 ? 0x1b2a44 : 0xf6f7f8;
  grp.add(merged([hull], new THREE.MeshStandardMaterial({ color: hc, roughness: 0.3, metalness: 0.2 })));
  const sup = [];
  let w = B * 0.8, l = L * 0.55, y = L * 0.07, x = -L * 0.08;
  for (let k = 0; k < (L > 45 ? 3 : 2); k++) { sup.push(new THREE.BoxGeometry(l, L * 0.04, w).translate(x, y + L * 0.02, 0)); y += L * 0.04; l *= 0.72; w *= 0.88; x -= L * 0.04; }
  grp.add(merged(sup, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 })));
  const glass = new THREE.BoxGeometry(L * 0.5, L * 0.012, B * 0.82).translate(-L * 0.08, L * 0.085, 0);
  grp.add(merged([glass], new THREE.MeshStandardMaterial({ color: 0x1d2630, roughness: 0.1, metalness: 0.5, emissive: night ? 0xffcf80 : 0x000000, emissiveIntensity: 1.5 })));
  return grp;
}

// ---------------------------------------------------------------- Flame Towers (Baku)
function flameTowers(night, toTrack) {
  const grp = new THREE.Group();
  const day = new THREE.MeshStandardMaterial({ color: 0x5f7f9c, metalness: 0.75, roughness: 0.15 });
  const fire = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 } },
    vertexShader: 'varying vec3 vW; varying float vH; attribute float h; void main(){ vH = h; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float t; varying vec3 vW; varying float vH;
      float hs(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float ns(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1, 0)), f.x), mix(hs(i + vec2(0, 1)), hs(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float a = atan(vW.z, vW.x) * 4.0 + vW.x * 0.05;
        float n = ns(vec2(a * 2.0, vH * 9.0 - t * 1.6)) * 0.6 + ns(vec2(a * 5.0, vH * 22.0 - t * 3.1)) * 0.4;
        float f = smoothstep(0.15, 0.85, n + 0.55 - vH * 0.7);
        vec3 c = mix(vec3(0.35, 0.02, 0.0), vec3(1.0, 0.45, 0.05), f);
        c = mix(c, vec3(1.0, 0.85, 0.35), smoothstep(0.75, 1.0, f));
        vec2 q = vec2(a * 30.0, vH * 160.0), g = fract(q) - 0.5;
        float aa = clamp(1.6 - max(fwidth(q.x), fwidth(q.y)) * 2.0, 0.0, 1.0);
        c *= mix(0.8, 0.6 + 0.4 * smoothstep(0.5, 0.25, length(g)), aa);
        gl_FragColor = vec4(c * 1.6, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  fire.toneMapped = false;
  const towers = [[0, 0, 190], [-62, 48, 160], [58, 52, 150]];
  for (const [ox, oz, H] of towers) {
    // pianta a goccia rivolta all'esterno, si stringe salendo fino alla punta della fiamma
    const out = Math.atan2(oz - 30, ox) + (ox === 0 && oz === 0 ? Math.PI : 0);
    const K = 30, A = 28, pos = [], hh = [], idx = [];
    for (let k = 0; k <= K; k++) {
      const f = k / K, y = f * H;
      const rr = 22 * (1 + 0.25 * Math.sin(f * Math.PI * 0.9)) * Math.pow(1 - f, 0.75) + 0.3;
      const shift = 10 * Math.sin(f * Math.PI * 0.8);
      for (let i = 0; i <= A; i++) {
        const a = i / A * Math.PI * 2, tear = 1 + 0.4 * Math.cos(a);
        const lx = Math.cos(a) * rr * tear - shift, lz = Math.sin(a) * rr * 0.8;
        pos.push(ox + lx * Math.cos(out) - lz * Math.sin(out), y, oz + lx * Math.sin(out) + lz * Math.cos(out)); hh.push(f);
      }
    }
    for (let k = 0; k < K; k++) for (let i = 0; i < A; i++) { const a = k * (A + 1) + i, b = a + A + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('h', new THREE.Float32BufferAttribute(hh, 1)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, night ? fire : day); m.castShadow = !night; grp.add(m);
  }
  grp.rotation.y = toTrack;
  return { obj: grp, update: (dt, t) => { fire.uniforms.t.value = t; } };
}

// ---------------------------------------------------------------- copertura a LED dello Yas Hotel
function yasCanopy(night, a, b, yb) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { t: { value: 0 }, night: { value: night ? 1 : 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float t; uniform float night; varying vec3 vW;
      vec3 hsv(float h, float s, float v){ vec3 p = abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0); return v * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), s); }
      void main(){
        vec2 p = vec2(vW.x + vW.z, vW.x - vW.z) / 7.0;
        vec2 g = abs(fract(p) - 0.5);
        float line = smoothstep(0.43, 0.49, max(g.x, g.y));
        float node = smoothstep(0.38, 0.5, min(g.x, g.y) + 0.12) * smoothstep(0.42, 0.5, max(g.x, g.y));
        vec3 day = mix(vec3(0.75, 0.82, 0.88), vec3(0.97), line);
        vec3 led = hsv(fract(vW.x * 0.004 - t * 0.06 + sin(vW.z * 0.03 + t * 0.4) * 0.1), 0.8, 1.0) * (0.35 + 1.4 * node + 0.4 * line);
        vec3 c = mix(day, led * 1.5, night);
        float al = mix(mix(0.22, 0.9, line), mix(0.18, 0.95, max(line, node)), night);
        gl_FragColor = vec4(c, al);
        #include <colorspace_fragment>
      }`,
  });
  mat.toneMapped = false;
  const N = 36, M = 64, pos = [], idx = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) {
    const r = i / N, th = j / M * Math.PI * 2;
    pos.push(a * r * Math.cos(th), yb + 18 + 24 * Math.sqrt(Math.max(0, 1 - r * r)), b * r * Math.sin(th));
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const p = i * (M + 1) + j, q = p + M + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, mat); m.renderOrder = 2;
  const grp = new THREE.Group(); grp.add(m);
  return { obj: grp, update: (dt, t) => { mat.uniforms.t.value = t; } };
}

// ---------------------------------------------------------------- castello di Nürburg
function castle(sc, cx, cz) {
  const grp = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x8b8274, roughness: 0.95 });
  const y0 = sc.heightAt(cx, cz);
  const parts = [new THREE.CylinderGeometry(6, 6.6, 24, 16).translate(cx, y0 + 10, cz)];
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; parts.push(new THREE.BoxGeometry(1.6, 1.8, 1.2).rotateY(-a).translate(cx + Math.cos(a) * 5.8, y0 + 22.9, cz + Math.sin(a) * 5.8)); }
  // cinta muraria su per la collina, con una torre più bassa
  const W = 16;
  for (let k = 0; k < W; k++) {
    if (k === 5) continue;                                  // la porta
    const a0 = k / W * Math.PI * 2, a1 = (k + 1) / W * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * 34, cz + Math.sin(a0) * 24], p1 = [cx + Math.cos(a1) * 34, cz + Math.sin(a1) * 24];
    const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2, L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), y = sc.heightAt(mx, mz);
    parts.push(new THREE.BoxGeometry(L + 0.4, 9, 1.8).rotateY(-Math.atan2(p1[1] - p0[1], p1[0] - p0[0])).translate(mx, y + 2.5, mz));
  }
  const t2 = [cx + 30, cz - 14]; parts.push(new THREE.CylinderGeometry(3.6, 4, 14, 12).translate(t2[0], sc.heightAt(t2[0], t2[1]) + 5, t2[1]));
  grp.add(merged(parts, stone));
  return { obj: grp };
}

// ------------------------------------------------------------------------------------------------
export function addLandmarks(scene, id, sc, track, night) {
  const S = track.samples;
  const nearestS = (x, z) => { let b = 0, bd = Infinity; for (let i = 0; i < S.length; i += 3) { const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2; if (d < bd) { bd = d; b = i; } } return S[b]; };
  const yawTo = (x, z) => { const s = nearestS(x, z); return Math.atan2(s.x - x, s.z - z); };
  const gy = (x, z) => sc.heightAt ? sc.heightAt(x, z) : 0;
  const list = [];
  const put = (L, x, z, yaw = 0, y = null) => { L.obj.position.set(x, y ?? gy(x, z), z); if (yaw) L.obj.rotation.y = yaw; scene.add(L.obj); list.push(L); return L; };
  // la ruota guarda la pista (l'asse dei mozzi punta verso il tracciato)
  const wheelAt = (x, z, o, yaw) => put(wheel(night, o), x, z, yaw ?? yawTo(x, z));

  if (id === 'singapore') {
    wheelAt(-104, 226, { D: 150, hub: 88, cab: 28, cabR: 4.5, capsule: true, speed: 0.006 });
    put(mbs(night), -368, 870, Math.atan2(107, 33));
  } else if (id === 'lasvegas') {
    const f = nearestS(532, -726);
    put(sphere(night, new THREE.Vector3(f.x - 532, 0, f.z + 726)), 532, -726);
    wheelAt(-15, -316, { D: 158, hub: 88, cab: 28, cabR: 5.2, capsule: true, speed: 0.005 }, Math.PI / 2);
    put(eiffel(night), -374, 253, Math.PI / 4);
  } else if (id === 'suzuka') {
    wheelAt(-195, -322, { D: 46, hub: 27, cab: 36, cabR: 1.6, speed: 0.03 });
  } else if (id === 'montreal') {
    put(biosphere(night), -394, -1515);
  } else if (id === 'austin') {
    put(cotaTower(night), 311, -161);
  } else if (id === 'monaco') {
    // il Casinò: facciata verso la piazza (e la pista che ci gira davanti)
    put(casino(night), 300, -196, Math.atan2(255 - 300, -280 + 196) + Math.PI);
    // yacht ormeggiati a Port Hercule e a Fontvieille (i bacini del porto nei dati OSM)
    if (sc.inWater) {
      const r = (() => { let s = 99; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
      const wet = (x, z) => sc.inWater(x, z);
      const placed = [];
      for (const [x0, x1, z0, z1, n] of [[-210, 588, -3, 528, 30], [-561, -53, 729, 1110, 12]]) {
        let got = 0;
        for (let k = 0; k < 1500 && got < n; k++) {
          const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0), L = 18 + r() * r() * 60, yaw = r() < 0.6 ? 0 : Math.PI / 2;
          const ax = Math.cos(yaw) * L * 0.55, az = -Math.sin(yaw) * L * 0.55, bx = Math.sin(yaw) * L * 0.15, bz = Math.cos(yaw) * L * 0.15;
          if (![[0, 0], [ax, az], [-ax, -az], [bx, bz], [-bx, -bz]].every(([dx, dz]) => wet(x + dx, z + dz))) continue;
          if (sc.clearance(x, z).d < L * 0.6 + 4 || placed.some(p => Math.hypot(p[0] - x, p[1] - z) < (p[2] + L) * 0.5)) continue;
          placed.push([x, z, L]); got++;
          const yt = yacht(L, r, night); yt.position.set(x, (sc.waterLevel ? sc.waterLevel(x, z) : sc.seaY) - L * 0.02, z); yt.rotation.y = yaw + (r() < 0.5 ? Math.PI : 0) + (r() - 0.5) * 0.08;
          scene.add(yt);
        }
      }
      if (window.__lmDebug) console.log('monumenti yacht', placed.length);
    }
  } else if (id === 'baku') {
    // Flame Towers (40.3594 N, 49.8263 E) sulla collina sopra il lungomare
    const x = -1222, z = 1102;
    const L = flameTowers(night, 0); put(L, x, z);
  } else if (id === 'yasmarina') {
    put(yasCanopy(night, 145, 62, 0), 262, -22, 0, gy(262, -22));
  } else if (id === 'nordschleife') {
    const L = castle(sc, -816, 919); scene.add(L.obj); list.push(L);
  }
  if (!list.length) return null;
  let t = 0;
  return { update(dt) { t += dt; for (const L of list) if (L.update) L.update(dt, t); } };
}
