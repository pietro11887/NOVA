// McLaren MP4/5 (1989): modello di dark_igorek (Sketchfab), CC BY 4.0.
// Scala vera (passo 2,9 m), ruote separate (WHEEL_xx_TIRE), poligoni e texture ridotti,
// scritte dello sponsor di sigarette tolte dalla livrea (restano rosso e bianco).
// Uso: node tools/build_mp45.mjs <sorgente.glb> <uscita.glb> [mid]
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, clearNodeTransform, dedup, prune, weld, simplify, transformPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [src, out, mode] = process.argv.slice(2);
const LOW = mode === 'mid';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot(), scene = root.getDefaultScene();
await doc.transform(flatten());
for (const n of root.listNodes()) if (n.getMesh()) clearNodeTransform(n);
// solo il colore (il gioco aggiunge i suoi riflessi); via estensioni e mappe non usate
for (const m of root.listMaterials()) {
  for (const e of m.listExtensions()) m.setExtension(e.extensionName, null);
  m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setEmissiveTexture(null);
}
for (const e of root.listExtensionsUsed()) if (e.extensionName !== 'KHR_mesh_quantization') e.dispose();
// livrea: le scritte scure dentro le zone bianche dello sponsor diventano bianche
const body = root.listMaterials().find(m => m.getName() === 'body_mat');
{
  const tex = body.getBaseColorTexture();
  const img = sharp(Buffer.from(tex.getImage()));
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, sc = W / 1024, ch = info.channels;
  const L = (x, y) => { const o = (y * W + x) * ch; return (data[o] + data[o + 1] + data[o + 2]) / 3; };
  const light = (x, y) => x >= 0 && y >= 0 && x < W && y < H && L(x, y) > 185;
  const BOX = [[383, 12, 438, 156], [490, 8, 537, 156], [333, 337, 364, 421], [543, 343, 578, 424], [36, 425, 64, 506], [833, 590, 873, 704]];
  let n = 0;
  for (const [a, b, c, d] of BOX) {
    const x0 = Math.round(a * sc), y0 = Math.round(b * sc), x1 = Math.round(c * sc), y1 = Math.round(d * sc), R = Math.round(16 * sc);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (L(x, y) > 185) continue;
      // dentro la fascia bianca: bianco da entrambi i lati, in orizzontale e in verticale
      let l = 0, r = 0, u = 0, dn = 0;
      for (let k = 1; k <= R; k++) { if (!l && light(x - k, y)) l = 1; if (!r && light(x + k, y)) r = 1; if (!u && light(x, y - k)) u = 1; if (!dn && light(x, y + k)) dn = 1; }
      if (l + r + u + dn < 3) continue;
      const o = (y * W + x) * ch; data[o] = 232; data[o + 1] = 232; data[o + 2] = 230; n++;
    }
  }
  console.log('pixel della scritta coperti', n);
  tex.setImage(await sharp(data, { raw: { width: W, height: H, channels: ch } }).jpeg({ quality: 92 }).toBuffer()).setMimeType('image/jpeg');
}
// scala e posizione: terra a y=0, centro tra gli assi a z=0, passo 2,896 m
const nodeBy = name => root.listNodes().find(n => n.getName() === name);
const FW = nodeBy('Object_27'), RW = nodeBy('Object_10');
const bF = getBounds(FW), bR = getBounds(RW);
const zF = (bF.min[2] + bF.max[2]) / 2, zR = (bR.min[2] + bR.max[2]) / 2, ymin = Math.min(bF.min[1], bR.min[1]);
const S = 2.896 / (zF - zR), zMid = (zF + zR) / 2;
console.log('scala', S.toFixed(4), 'assi', zF.toFixed(3), zR.toFixed(3));
const M = [S,0,0,0, 0,S,0,0, 0,0,S,0, 0,-ymin * S,-zMid * S,1];
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) transformPrimitive(p, M);
// ruote: ogni mesh ha la coppia destra/sinistra -> quattro nodi
function splitPrim(p, keyOf) {
  const pos = p.getAttribute('POSITION'), idx = p.getIndices();
  const n = idx ? idx.getCount() : pos.getCount(), get = i => idx ? idx.getScalar(i) : i;
  const groups = {}, v = [0, 0, 0];
  for (let t = 0; t < n; t += 3) {
    let cx = 0, cz = 0;
    for (let q = 0; q < 3; q++) { pos.getElement(get(t + q), v); cx += v[0] / 3; cz += v[2] / 3; }
    const k = keyOf(cx, cz); (groups[k] || (groups[k] = [])).push(get(t), get(t + 1), get(t + 2));
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
for (const [node, front] of [[FW, true], [RW, false]]) {
  for (const p of node.getMesh().listPrimitives()) {
    // (nella mesh delle ruote posteriori ci sono anche i semiassi: restano sulla vettura)
    const parts = splitPrim(p, x => (Math.abs(x) < 0.62 ? 'BODY' : front ? (x > 0 ? 'LF' : 'RF') : (x > 0 ? 'LR' : 'RR')));
    for (const [w, np] of Object.entries(parts)) {
      const name = w === 'BODY' ? 'AXLES' : `WHEEL_${w}_TIRE`;
      let wn = root.listNodes().find(n => n.getName() === name);
      if (!wn) { wn = doc.createNode(name).setMesh(doc.createMesh(name)); scene.addChild(wn); }
      wn.getMesh().addPrimitive(np);
    }
  }
  node.getMesh().dispose(); node.dispose();
}
for (const w of ['LF', 'RF', 'LR', 'RR']) { const b = getBounds(root.listNodes().find(n => n.getName() === `WHEEL_${w}_TIRE`)); console.log(w, b.min.map(v => v.toFixed(2)).join(','), b.max.map(v => v.toFixed(2)).join(',')); }
await doc.transform(dedup(), prune(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: LOW ? 0.2 : 0.45, error: LOW ? 0.002 : 0.0008 }), prune());
// texture: livrea 1024 (mid 512), il resto più piccolo
for (const t of root.listTextures()) {
  const users = t.listParents().filter(p => p.getName && p.getName()).map(p => p.getName()).join(' ');
  const big = /body_mat/.test(users);
  const max = big ? (LOW ? 512 : 1024) : (LOW ? 256 : 512);
  const meta = await sharp(Buffer.from(t.getImage())).metadata();
  const s = Math.min(1, max / Math.max(meta.width, meta.height));
  const pipe = sharp(Buffer.from(t.getImage())).resize(Math.max(1, Math.round(meta.width * s)), Math.max(1, Math.round(meta.height * s)));
  if (meta.hasAlpha && /glass/.test(users)) t.setImage(await pipe.png({ compressionLevel: 9 }).toBuffer()).setMimeType('image/png');
  else { t.setImage(await pipe.removeAlpha().jpeg({ quality: big ? 88 : 80 }).toBuffer()).setMimeType('image/jpeg'); if (t.getURI()) t.setURI(t.getURI().replace(/\.png$/, '.jpg')); }
}
let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
console.log('triangoli', tris);
await io.write(out, doc);
