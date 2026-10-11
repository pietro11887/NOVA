import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texSet, addWorldPos } from './pbr.js';
import { ENV } from './scenery.js';

// Alberi realistici: tronco e rami con corteccia fotografica, chioma fatta di tanti "ciuffi" di foglie vere
// (foto CC0 di Poly Haven) con luce morbida come una chioma vera, vento e foglie che brillano in controluce.
// kind: 'broad' (platano/olmo dei viali), 'pine' (pino d'Eldar, tipico di Baku), 'cypress' (cipresso)

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const SPEC = {
  broad: { trunkH: 3.4, trunkR: 0.26, center: [0, 6.3, 0], rad: [3.3, 2.7, 3.3], cards: 64, size: [1.9, 2.8], limbs: 5 },
  pine: { trunkH: 7.0, trunkR: 0.24, center: [0, 8.6, 0], rad: [2.5, 3.0, 2.5], cards: 52, size: [1.7, 2.4], limbs: 6, cone: true },
  cypress: { trunkH: 1.6, trunkR: 0.2, center: [0, 5.4, 0], rad: [1.15, 4.3, 1.15], cards: 46, size: [1.2, 1.7], limbs: 0 },
};

function crown(kind, seed) {
  const S = SPEC[kind], r = rand(seed);
  const pos = [], nrm = [], uv = [], idx = [];
  const [cx, cy, cz] = S.center, [rx, ry, rz] = S.rad;
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();
  for (let k = 0; k < S.cards; k++) {
    // punto nella chioma, più fitto verso l'esterno
    let px, py, pz;
    do { px = r() * 2 - 1; py = r() * 2 - 1; pz = r() * 2 - 1; } while (px * px + py * py + pz * pz > 1);
    const m = Math.sqrt(px * px + py * py + pz * pz) || 1, out = 0.45 + 0.55 * Math.pow(m, 0.35);
    px = px / m * out; py = py / m * out; pz = pz / m * out;
    let sx = rx;
    if (S.cone) sx = rx * (0.95 - 0.55 * (py * 0.5 + 0.5));     // pino: più stretto in alto
    c.set(cx + px * sx, cy + py * ry, cz + pz * (S.cone ? sx : rz));
    // orientamento del ciuffo: inclinato verso l'esterno, con un po' di caso
    n.set(px, py * 0.6 + 0.35, pz).normalize().add(v.set(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(1.2)).normalize();
    a.set(0, 1, 0).cross(n); if (a.lengthSq() < 1e-4) a.set(1, 0, 0); a.normalize();
    b.copy(n).cross(a).normalize();
    const rot = r() * Math.PI * 2, ca = Math.cos(rot), sa = Math.sin(rot);
    const A = a.clone().multiplyScalar(ca).addScaledVector(b, sa), B = b.clone().multiplyScalar(ca).addScaledVector(a, -sa);
    const s = (S.size[0] + r() * (S.size[1] - S.size[0])) / 2;
    const u0 = r() < 0.5 ? 0 : 0.5;
    // normale "sferica" (dal centro della chioma): luce morbida e volumetrica
    const ln = v.set(c.x - cx, (c.y - cy) * 0.8 + ry * 0.25, c.z - cz).normalize();
    const base = pos.length / 3;
    for (const [qa, qb, uu, vv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      pos.push(c.x + (A.x * qa + B.x * qb) * s, c.y + (A.y * qa + B.y * qb) * s, c.z + (A.z * qa + B.z * qb) * s);
      nrm.push(ln.x, ln.y, ln.z);
      uv.push(u0 + uu * 0.5, vv);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function trunk(kind, seed) {
  const S = SPEC[kind], r = rand(seed + 7);
  const parts = [];
  const tg = new THREE.CylinderGeometry(S.trunkR * 0.7, S.trunkR, S.trunkH + 0.6, 8, 3).translate(0, (S.trunkH + 0.6) / 2 - 0.3, 0);
  // tronco leggermente storto
  const P = tg.attributes.position;
  for (let i = 0; i < P.count; i++) { const y = P.getY(i); P.setX(i, P.getX(i) + Math.sin(y * 0.9 + seed) * 0.08); }
  parts.push(tg);
  for (let k = 0; k < S.limbs; k++) {
    const len = 1.8 + r() * 1.6, ang = k / S.limbs * Math.PI * 2 + r() * 0.6, tilt = 0.55 + r() * 0.35;
    const lg = new THREE.CylinderGeometry(S.trunkR * 0.25, S.trunkR * 0.55, len, 5).translate(0, len / 2, 0);
    lg.rotateZ(-tilt); lg.rotateY(ang);
    lg.translate(0, S.trunkH - 0.4 - (S.cone ? r() * 2.5 : 0), 0);
    parts.push(lg);
  }
  const g = mergeGeometries(parts.map(p => { const q = p.index ? p.toNonIndexed() : p; return q; }));
  // corteccia: u attorno al tronco, v in altezza (metri)
  return g;
}

let mats = null;
function materials() {
  if (mats) return mats;
  const L = new THREE.TextureLoader();
  const atlas = name => { const t = L.load(`assets/tex/${name}.webp`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const leaves = atlas('leaves'), needles = atlas('needles');
  const uT = { value: 0 }, sun = { value: ENV.sunDir.clone() };
  const foliage = map => {
    const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.78, metalness: 0 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uT = uT; sh.uniforms.uSun = sun;
      addWorldPos(sh);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3][0] * 0.13 + instanceMatrix[3][2] * 0.17;
          float wk = max(0.0, position.y - 2.0) * 0.022;
          transformed.x += (sin(uT * 1.3 + ph) * 0.6 + sin(uT * 3.7 + ph * 3.0 + position.y) * 0.25) * wk;
          transformed.z += (cos(uT * 1.1 + ph) * 0.5 + sin(uT * 4.1 + ph * 2.0 + position.x) * 0.2) * wk;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSun;')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // controluce: le foglie lasciano passare la luce del sole
          vec3 vd = normalize(vWP - cameraPosition);
          float back = pow(max(dot(vd, uSun), 0.0), 3.0);
          totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.9, 0.55) * (0.1 + back * 0.9);`);
    };
    m.customProgramCacheKey = () => 'foliage';
    return m;
  };
  const depth = map => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.42, side: THREE.DoubleSide });
  const B = texSet('bark');
  for (const t of [B.c, B.n]) t.repeat.set(2, 3);
  const bark = new THREE.MeshStandardMaterial({ map: B.c, normalMap: B.n, roughness: 0.95, color: 0xb8aa98 });
  mats = { leaves: foliage(leaves), needles: foliage(needles), leavesD: depth(leaves), needlesD: depth(needles), bark, uT };
  return mats;
}

// crea gli alberi: list[kind] = [[matrix4, color], ...]
export function buildTrees(group, list, opts = {}) {
  const M = materials();
  const out = [];
  const VARIANTS = 3;
  for (const kind of Object.keys(list)) {
    const arr = list[kind];
    if (!arr.length) continue;
    // tre varianti per specie, per non vedere alberi tutti uguali
    for (let vr = 0; vr < VARIANTS; vr++) {
      const sub = arr.filter((_, q) => q % VARIANTS === vr);
      if (!sub.length) continue;
      const cg = crown(kind, 11 + vr * 31 + kind.length * 7);
      const needles = kind !== 'broad';
      const ci = new THREE.InstancedMesh(cg, needles ? M.needles : M.leaves, sub.length);
      ci.customDepthMaterial = needles ? M.needlesD : M.leavesD;
      sub.forEach(([m, col], q) => { ci.setMatrixAt(q, m); ci.setColorAt(q, col); });
      ci.castShadow = opts.shadows !== false; ci.receiveShadow = true;
      ci.userData.noAO = true;
      group.add(ci); out.push(ci);
      if (opts.noTrunk) continue;
      const tg = trunk(kind, 3 + vr * 17);
      const ti = new THREE.InstancedMesh(tg, M.bark, sub.length);
      sub.forEach(([m], q) => ti.setMatrixAt(q, m));
      ti.castShadow = opts.shadows !== false; ti.receiveShadow = true;
      group.add(ti); out.push(ti);
    }
  }
  return { meshes: out, update: t => { M.uT.value = t; } };
}
