// Monoposto speciali da Sketchfab: Ferrari F2002, Ferrari F2004, Red Bull RB8 (Dave Love, CC BY 4.0),
// Mercedes W11 (OUTPISTON, CC BY-NC-SA 4.0).
// Scala vera dal passo, terra a y=0, centro tra gli assi a z=0, ruote in quattro nodi (WHEEL_xx_TIRE/RIM/DISC),
// via le ruote "mosse" finte e le mappe che il gioco non usa, poligoni e texture ridotti.
// Uso: node tools/build_classic.mjs <id> <scene.gltf> <uscita.glb> [mid]
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, clearNodeTransform, dedup, prune, weld, simplify, transformPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [id, src, out, mode] = process.argv.slice(2);
const LOW = mode === 'mid';
// passo vero (m); materiali di gomme, cerchi, dischi; materiali da togliere; materiale della livrea
const CFG = {
  f2002: { wb: 3.05, tyre: /^Tyre/, rim: /^Rim_/, disc: /^Disc|^Caliper/, drop: /BLUR|blur/, livery: /^material$|car_chassis/ },
  f2004: { wb: 3.05, tyre: /^Tread|^Side/, rim: /^Rim/, disc: /^Disc/, drop: /BLUR|blur/, livery: /^Meshpart(1|16|70)Mtl/, ratio: [0.4, 0.2], error: [0.001, 0.003], small: 256, newTyres: true },
  w11: { wb: 3.73, tyre: /^car_tyre_tread/, rim: /w11_wheel/, disc: /^NESSUNO$/, drop: /BLUR/, livery: /ext_44|misc/ },
  rb8: { wb: 3.5, tyre: /generic_tyre|generic_tread/, rim: /^lr2_wheel$/, disc: /^Disc/, drop: /BLUR/, livery: /^wccarbody/ },
}[id];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot(), scene = root.getDefaultScene();
await doc.transform(flatten());
for (const n of root.listNodes()) if (n.getMesh()) clearNodeTransform(n);
for (const m of root.listMaterials()) {
  for (const e of m.listExtensions()) m.setExtension(e.extensionName, null);
  m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setEmissiveTexture(null);
}
for (const e of root.listExtensionsUsed()) if (e.extensionName !== 'KHR_mesh_quantization') e.dispose();
const matOf = p => p.getMaterial()?.getName() || '';
// via le primitive delle ruote mosse finte
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) if (CFG.drop.test(matOf(p))) p.dispose();
// assi dalle gomme
let pts = [];
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) if (CFG.tyre.test(matOf(p))) {
  const a = p.getAttribute('POSITION'), v = [];
  for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); pts.push([...v]); }
}
let zmin = 1e9, zmax = -1e9, ymin = 1e9;
for (const v of pts) { zmin = Math.min(zmin, v[2]); zmax = Math.max(zmax, v[2]); ymin = Math.min(ymin, v[1]); }
const zc = (zmin + zmax) / 2;
const zF = (() => { let a = 1e9, b = -1e9; for (const v of pts) if (v[2] > zc) { a = Math.min(a, v[2]); b = Math.max(b, v[2]); } return (a + b) / 2; })();
const zR = (() => { let a = 1e9, b = -1e9; for (const v of pts) if (v[2] < zc) { a = Math.min(a, v[2]); b = Math.max(b, v[2]); } return (a + b) / 2; })();
let xs = 0; for (const v of pts) xs = Math.max(xs, Math.abs(v[0]));
const S = CFG.wb / (zF - zR), zMid = (zF + zR) / 2;
let xc = 0; { let a = 1e9, b = -1e9; for (const v of pts) { a = Math.min(a, v[0]); b = Math.max(b, v[0]); } xc = (a + b) / 2; }
console.log(id, 'scala', S.toFixed(4), 'assi', zF.toFixed(2), zR.toFixed(2), 'centro x', xc.toFixed(2));
const M = [S,0,0,0, 0,S,0,0, 0,0,S,0, -xc * S,-ymin * S,-zMid * S,1];
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) transformPrimitive(p, M);
// ruote in quattro (per triangolo, dal quadrante del baricentro)
function splitPrim(p, keyOf) {
  const pos = p.getAttribute('POSITION'), idx = p.getIndices();
  const n = idx ? idx.getCount() : pos.getCount(), get = i => idx ? idx.getScalar(i) : i;
  const groups = {}, v = [0, 0, 0];
  for (let t = 0; t < n; t += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let q = 0; q < 3; q++) { pos.getElement(get(t + q), v); cx += v[0] / 3; cy += v[1] / 3; cz += v[2] / 3; }
    const k = keyOf(cx, cy, cz); (groups[k] || (groups[k] = [])).push(get(t), get(t + 1), get(t + 2));
  }
  const res = {};
  for (const [k, list] of Object.entries(groups)) {
    const remap = new Map(), order = [], ni = new Uint32Array(list.length);
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
// limiti delle gomme (dopo la scala): solo le parti dentro la ruota diventano ruota
const tyreBox = { LF: null, RF: null, LR: null, RR: null };
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) if (CFG.tyre.test(matOf(p))) {
  const a = p.getAttribute('POSITION'), v = [];
  for (let i = 0; i < a.getCount(); i++) {
    a.getElement(i, v); const k = (v[2] > 0 ? 'F' : 'R'), w = (v[0] > 0 ? 'L' : 'R') + k;
    const b = tyreBox[w] || (tyreBox[w] = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9]);
    b[0] = Math.min(b[0], v[0]); b[1] = Math.max(b[1], v[0]); b[2] = Math.min(b[2], v[1]); b[3] = Math.max(b[3], v[1]); b[4] = Math.min(b[4], v[2]); b[5] = Math.max(b[5], v[2]);
  }
}
const inWheel = (x, y, z) => { for (const [w, b] of Object.entries(tyreBox)) if (b && x > b[0] - 0.02 && x < b[1] + 0.02 && y > b[2] - 0.02 && y < b[3] + 0.02 && z > b[4] - 0.02 && z < b[5] + 0.02) return w; return null; };
const wheelNodes = {};
for (const n of [...root.listNodes()]) {
  const mesh = n.getMesh(); if (!mesh) continue;
  for (const p of [...mesh.listPrimitives()]) {
    const mn = matOf(p), kind = CFG.tyre.test(mn) ? 'TIRE' : CFG.rim.test(mn) ? 'RIM' : CFG.disc.test(mn) ? 'DISC' : null;
    if (!kind) continue;
    const parts = splitPrim(p, (x, y, z) => inWheel(x, y, z) || 'BODY');
    for (const [w, np] of Object.entries(parts)) {
      const name = w === 'BODY' ? 'BODY_' + kind : `WHEEL_${w}_${kind}`;
      if (!wheelNodes[name]) { const node = doc.createNode(name).setMesh(doc.createMesh(name)); scene.addChild(node); wheelNodes[name] = node; }
      wheelNodes[name].getMesh().addPrimitive(np);
    }
    p.dispose();
  }
}
for (const w of ['LF', 'RF', 'LR', 'RR']) { const b = tyreBox[w]; console.log(w, b.map(v => v.toFixed(2)).join(' ')); }
// gomme rifatte leggere (le originali hanno decine di migliaia di triangoli l'una)
if (CFG.newTyres) {
  const tyreMat = doc.createMaterial('TIRE_GEN').setBaseColorFactor([0.045, 0.045, 0.05, 1]).setRoughnessFactor(0.9).setMetallicFactor(0).setDoubleSided(true);
  const buf = root.listBuffers()[0];
  for (const w of ['LF', 'RF', 'LR', 'RR']) {
    const node = wheelNodes[`WHEEL_${w}_TIRE`], b = tyreBox[w];
    const cx = (b[0] + b[1]) / 2, cy = (b[2] + b[3]) / 2, cz = (b[4] + b[5]) / 2;
    const R = (b[3] - b[2]) / 2, hw = (b[1] - b[0]) / 2, r0 = R * 0.62, sh = 0.035;
    const prof = [[r0, -hw * 0.94], [R - sh * 1.6, -hw], [R - sh * 0.45, -hw + sh * 0.25], [R - sh * 0.1, -hw + sh * 0.7], [R, -hw + sh * 1.4], [R, hw - sh * 1.4], [R - sh * 0.1, hw - sh * 0.7], [R - sh * 0.45, hw - sh * 0.25], [R - sh * 1.6, hw], [r0, hw * 0.94]];
    const SEG = LOW ? 32 : 56, P = [], N = [], I = [];
    for (let i = 0; i <= SEG; i++) {
      const a = i / SEG * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      prof.forEach(([r, ax], j) => {
        P.push(cx + ax, cy + r * ca, cz + r * sa);
        const pr = prof[Math.max(0, j - 1)], nx = prof[Math.min(prof.length - 1, j + 1)];
        const dr = nx[0] - pr[0], da = nx[1] - pr[1], l = Math.hypot(dr, da) || 1;
        N.push(-dr / l, (da / l) * ca, (da / l) * sa);
      });
    }
    const K = prof.length;
    for (let i = 0; i < SEG; i++) for (let j = 0; j < K - 1; j++) { const a = i * K + j, c = a + K; I.push(a, c, a + 1, a + 1, c, c + 1); }
    const prim = doc.createPrimitive().setMaterial(tyreMat)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(buf));
    const mesh = node.getMesh(); for (const q of mesh.listPrimitives()) q.dispose(); mesh.addPrimitive(prim);
  }
}
await doc.transform(dedup(), prune(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: CFG.ratio ? CFG.ratio[LOW ? 1 : 0] : LOW ? 0.22 : 0.5, error: CFG.error ? CFG.error[LOW ? 1 : 0] : LOW ? 0.002 : 0.0008 }), prune());
for (const t of root.listTextures()) {
  const users = t.listParents().filter(p => p.getName && p.getName()).map(p => p.getName()).join(' ');
  const big = CFG.livery.test(users);
  const max = big ? (LOW ? 512 : 1024) : (LOW ? 256 : CFG.small || 512);
  const meta = await sharp(Buffer.from(t.getImage())).metadata();
  const s = Math.min(1, max / Math.max(meta.width, meta.height));
  const pipe = sharp(Buffer.from(t.getImage())).resize(Math.max(1, Math.round(meta.width * s)), Math.max(1, Math.round(meta.height * s)));
  if (meta.hasAlpha) {
    const st = await sharp(Buffer.from(t.getImage())).stats();
    if (st.channels[3] && st.channels[3].min < 250) { t.setImage(await pipe.png({ compressionLevel: 9 }).toBuffer()).setMimeType('image/png'); continue; }
  }
  t.setImage(await pipe.removeAlpha().jpeg({ quality: big ? 88 : 80 }).toBuffer()).setMimeType('image/jpeg');
  if (t.getURI()) t.setURI(t.getURI().replace(/\.png$/i, '.jpg'));
}
const all = getBounds(scene);
let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
console.log('ingombro', all.min.map(v => v.toFixed(2)).join(' '), '|', all.max.map(v => v.toFixed(2)).join(' '), 'triangoli', tris, 'materiali', root.listMaterials().map(m => m.getName()).join(','));
await io.write(out, doc);
