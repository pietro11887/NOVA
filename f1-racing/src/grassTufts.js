import * as THREE from 'three';
import { KERB_WIDTH } from './trackData.js?v=156';

// Erba vera ai bordi della pista (grafica ultra): migliaia di ciuffi di fili d'erba in 3D sul prato
// tra il bordo pista e il muro, mossi leggermente dal vento. Un solo oggetto (instancing): pesa poco
// sul processore, ma tanto sulla scheda video.

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ciuffo: 10 fili corti e sottili (prato tagliato come nei circuiti), scuri alla base e chiari in punta
function tuftGeometry() {
  const pos = [], col = [], r = rand(7);
  const base = new THREE.Color(0x34512a), tip = new THREE.Color(0x8fa45f);
  for (let k = 0; k < 10; k++) {
    const a = r() * Math.PI * 2, ox = (r() - 0.5) * 0.22, oz = (r() - 0.5) * 0.22;
    const h = 0.07 + r() * 0.07, w = 0.008 + r() * 0.006, lean = 0.01 + r() * 0.04;
    const ca = Math.cos(a), sa = Math.sin(a);
    // due segmenti per filo (piegato)
    const P = [[-w, 0, 0], [w, 0, 0], [-w * 0.6, h * 0.55, lean * 0.4], [w * 0.6, h * 0.55, lean * 0.4], [0, h, lean]];
    const T = [[0, 1, 2], [1, 3, 2], [2, 3, 4]];
    const tr = ([x, y, z]) => [ox + x * ca - z * sa, y, oz + x * sa + z * ca];
    for (const t of T) for (const i of t) {
      const p = tr(P[i]); pos.push(...p);
      const c = base.clone().lerp(tip, P[i][1] / h);
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // normali verso l'alto: l'erba prende la luce del cielo come il prato (niente fili neri controluce)
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, nrm.getX(i) * 0.3, 0.95, nrm.getZ(i) * 0.3);
  return g;
}

export function buildGrassTufts(track, count = 150000) {
  if (track.street) return null;
  const S = track.samples, n = track.count, r = rand(1234);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  // vento: le punte dei fili ondeggiano piano
  const uT = { value: 0 };
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.27) * 0.5 + sin(uTime * 3.1 + wp.x * 0.9) * 0.2;
          transformed.xz += sway * 0.25 * transformed.y; }`);
  };
  mat.customProgramCacheKey = () => 'tufts';
  const mesh = new THREE.InstancedMesh(tuftGeometry(), mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let k = 0, tries = 0;
  while (k < count && tries < count * 4) {
    tries++;
    const i = Math.floor(r() * n), s = S[i], side = r() < 0.5 ? 1 : -1;
    const gravel = side > 0 ? s.gravelL : s.gravelR, kerb = side > 0 ? s.kerbL : s.kerbR;
    const wall = side > 0 ? (s.wallLVis ?? s.wallL) : (s.wallRVis ?? s.wallR);
    if (side > 0 ? s.openL : s.openR) continue;
    const edge = s.hw + (kerb ? KERB_WIDTH : 0.6);
    const far = Math.min(gravel ? s.hw + KERB_WIDTH + 4 : wall - 0.8, edge + 7);
    if (far <= edge + 0.4) continue;
    // più fitta vicino alla pista (dove la telecamera la vede da vicino)
    const u = Math.pow(r(), 1.5), d = edge + 0.25 + u * (far - edge - 0.25);
    const h = -Math.min(0.08, (d - edge) * 0.03) + 0.02;
    const j = r() * 2 - 1;      // un po' sparsa anche lungo la pista
    p.set(s.x + s.nx * d * side + s.tx * j, s.y + h - 0.01, s.z + s.nz * d * side + s.tz * j);
    e.set(0, r() * Math.PI * 2, 0); q.setFromEuler(e);
    const size = 0.8 + r() * 0.5; sc.set(size, size * (0.7 + r() * 0.6), size);
    m.compose(p, q, sc);
    mesh.setMatrixAt(k++, m);
  }
  mesh.count = k;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.userData.noAO = true;
  mesh.userData.update = dt => { uT.value += dt; };
  return mesh;
}
