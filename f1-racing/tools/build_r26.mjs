// R26: ruote separate, pivot a terra, texture ridotte, poligoni ridotti
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, clearNodeTransform, dedup, prune, weld, simplify, textureCompress, transformPrimitive, join } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [src, out, mode] = process.argv.slice(2);
const LOW = mode === 'mid';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot(), scene = root.getDefaultScene();
await doc.transform(flatten());
for (const n of root.listNodes()) if (n.getMesh()) clearNodeTransform(n);
// via le estensioni e le mappe non usate dal gioco (solo baseColor)
for (const m of root.listMaterials()) {
  for (const e of m.listExtensions()) m.setExtension(e.extensionName, null);
  m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setEmissiveTexture(null);
}
for (const e of root.listExtensionsUsed()) if (e.extensionName !== 'KHR_mesh_quantization') e.dispose();
const matName = n => n.getMesh().listPrimitives()[0].getMaterial()?.getName() || '';
// via le ruote "mosse" finte (il gioco ha le sue)
for (const n of root.listNodes()) if (n.getMesh() && /^blur/.test(matName(n))) { n.getMesh().dispose(); n.dispose(); }
// posizione: terra a y=0, centro tra gli assi a z=0
const WHEEL = { 'side.017': 'TIRE', 'tread.017': 'TIRE', 'RENRIM.003': 'RIM', 'RENSPOKES.003': 'RIM', 'RENHUB.003': 'RIM', 'disk.011': 'DISC' };
let zmin = 1e9, zmax = -1e9, ymin = 1e9;
for (const n of root.listNodes()) if (n.getMesh() && /tread/.test(matName(n))) { const b = getBounds(n); zmin = Math.min(zmin, b.min[2]); zmax = Math.max(zmax, b.max[2]); ymin = Math.min(ymin, b.min[1]); }
// assi: centri delle gomme (gomma anteriore e posteriore, diametro ~0.68)
const D = 0.68, zF = zmax - D / 2, zR = zmin + D / 2, zMid = (zF + zR) / 2;
console.log('assi', zF.toFixed(3), zR.toFixed(3), 'passo', (zF - zR).toFixed(3), 'terra', ymin.toFixed(3));
const M = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,-ymin,-zMid,1];
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) transformPrimitive(p, M);
// divide le primitive delle ruote nei 4 quadranti
function splitPrim(p, keyOf) {
  const pos = p.getAttribute('POSITION'), idx = p.getIndices();
  const n = idx ? idx.getCount() : pos.getCount();
  const get = i => idx ? idx.getScalar(i) : i;
  const groups = {}; const v = [0,0,0];
  for (let t = 0; t < n; t += 3) {
    let cx = 0, cz = 0;
    for (let q = 0; q < 3; q++) { pos.getElement(get(t + q), v); cx += v[0] / 3; cz += v[2] / 3; }
    const k = keyOf(cx, cz);
    (groups[k] || (groups[k] = [])).push(get(t), get(t + 1), get(t + 2));
  }
  const res = {};
  for (const [k, list] of Object.entries(groups)) {
    const remap = new Map(), order = [];
    const ni = new Uint32Array(list.length);
    list.forEach((vi, i) => { if (!remap.has(vi)) { remap.set(vi, order.length); order.push(vi); } ni[i] = remap.get(vi); });
    const np = doc.createPrimitive().setMaterial(p.getMaterial()).setMode(p.getMode());
    for (const sem of p.listSemantics()) {
      const a = p.getAttribute(sem), sz = a.getElementSize(), arr = new (a.getArray().constructor)(order.length * sz), el = [];
      order.forEach((vi, i) => { a.getElement(vi, el); for (let c = 0; c < sz; c++) arr[i * sz + c] = el[c]; });
      np.setAttribute(sem, doc.createAccessor().setType(a.getType()).setArray(arr).setNormalized(a.getNormalized()).setBuffer(a.getBuffer()));
    }
    np.setIndices(doc.createAccessor().setType('SCALAR').setArray(ni).setBuffer(pos.getBuffer()));
    res[k] = np;
  }
  return res;
}
const wheelNodes = {};
for (const n of [...root.listNodes()]) {
  if (!n.getMesh()) continue;
  const kind = WHEEL[matName(n)]; if (!kind) continue;
  for (const p of n.getMesh().listPrimitives()) {
    const parts = splitPrim(p, (x, z) => (z > 0 ? (x > 0 ? 'LF' : 'RF') : (x > 0 ? 'LR' : 'RR')));
    for (const [w, np] of Object.entries(parts)) {
      const name = `WHEEL_${w}_${kind}`;
      if (!wheelNodes[name]) { const mesh = doc.createMesh(name); const node = doc.createNode(name).setMesh(mesh); scene.addChild(node); wheelNodes[name] = node; }
      wheelNodes[name].getMesh().addPrimitive(np);
    }
  }
  n.getMesh().dispose(); n.dispose();
}
// gomme: rifatte leggere (le originali hanno ~20k triangoli l'una)
const tyreMat = doc.createMaterial('TIRE_R26').setBaseColorFactor([0.045, 0.045, 0.05, 1]).setRoughnessFactor(0.9).setMetallicFactor(0).setDoubleSided(true);
for (const w of ['LF', 'RF', 'LR', 'RR']) {
  const node = wheelNodes[`WHEEL_${w}_TIRE`], b = getBounds(node);
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const R = (b.max[1] - b.min[1]) / 2, hw = (b.max[0] - b.min[0]) / 2, r0 = 0.2, sh = 0.035;
  // profilo (raggio, asse): fianco interno, spalla, battistrada, spalla, fianco esterno
  const prof = [[r0, -hw * 0.94], [R - sh * 1.6, -hw], [R - sh * 0.45, -hw + sh * 0.25], [R - sh * 0.1, -hw + sh * 0.7], [R, -hw + sh * 1.4], [R, hw - sh * 1.4], [R - sh * 0.1, hw - sh * 0.7], [R - sh * 0.45, hw - sh * 0.25], [R - sh * 1.6, hw], [r0, hw * 0.94]];
  const SEG = LOW ? 32 : 56, P = [], N = [], I = [];
  for (let i = 0; i <= SEG; i++) {
    const a = i / SEG * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    prof.forEach(([r, ax], j) => {
      P.push(cx + ax, cy + r * ca, cz + r * sa);
      const pr = prof[Math.max(0, j - 1)], nx = prof[Math.min(prof.length - 1, j + 1)];
      const dr = nx[0] - pr[0], da = nx[1] - pr[1];   // tangente; normale = (-dr in asse, da in raggio)
      const l = Math.hypot(dr, da) || 1; const nr = da / l, na = -dr / l;
      N.push(na, nr * ca, nr * sa);
    });
  }
  const K = prof.length;
  for (let i = 0; i < SEG; i++) for (let j = 0; j < K - 1; j++) { const a = i * K + j, c = a + K; I.push(a, c, a + 1, a + 1, c, c + 1); }
  const buf = root.listBuffers()[0];
  const prim = doc.createPrimitive().setMaterial(tyreMat)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(buf));
  const mesh = node.getMesh(); for (const p of mesh.listPrimitives()) p.dispose(); mesh.addPrimitive(prim);
}
for (const n of Object.values(wheelNodes)) { const b = getBounds(n); console.log(n.getName(), b.min.map(v => v.toFixed(2)).join(','), b.max.map(v => v.toFixed(2)).join(',')); }
// nomi puliti dei materiali
for (const m of root.listMaterials()) m.setName(m.getName().replace(/\.\d+$/, ''));
await doc.transform(dedup(), prune(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: LOW ? 0.18 : 0.42, error: LOW ? 0.0025 : 0.0009 }), prune());
// texture: livrea 1024 (mid 512), resto piccolo; jpg dove non c'è trasparenza
const BIG = /CARBODY|EXTRA0|WCWING/;
for (const t of root.listTextures()) {
  const users = t.listParents().filter(p => p.getName && p.getName()).map(p => p.getName()).join(' ');
  const big = BIG.test(users);
  const max = big ? (LOW ? 512 : 1024) : /COCKPIT/.test(users) ? (LOW ? 256 : 512) : 256;
  const img = sharp(Buffer.from(t.getImage()));
  const meta = await img.metadata();
  const s = Math.min(1, max / Math.max(meta.width, meta.height));
  let pipe = sharp(Buffer.from(t.getImage())).resize(Math.max(1, Math.round(meta.width * s)), Math.max(1, Math.round(meta.height * s)));
  if (meta.hasAlpha) { t.setImage(await pipe.png({ compressionLevel: 9 }).toBuffer()).setMimeType('image/png'); }
  else { t.setImage(await pipe.jpeg({ quality: big ? 88 : 82 }).toBuffer()).setMimeType('image/jpeg'); t.setURI(t.getURI().replace(/\.png$/, '.jpg')); }
}
let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
console.log('triangoli', tris);
await io.write(out, doc);
