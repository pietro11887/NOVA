// GT3 da Sketchfab per il gioco (versione delle monoposto speciali)
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
const LOW = mode === 'mid', INT = mode === 'int';   // int: solo l'abitacolo (visuale interna), stesse coordinate della carrozzeria
// passo vero (m); materiali di gomme, cerchi, dischi; materiali da togliere; materiale della livrea
const CFG = {
  // Ferrari 296 GT3 (Dave Love, CC BY 4.0): abitacolo tolto
  f296: { wb: 2.66, tyre: /^MI_Tyre/, rim: /^EXT_RIM/, disc: /^EXT_Disc/, paint: /^EXT_Carpaint/,
    drop: /^INT_|SEAT|BELT|STEER|SPARCO|MANGUEIRA|PHISICS_DASH|^DISPLAY|PHONE|RPMBAR|LED_RACELOGIC|WorldGrid|BORRACHA_DOORS|^INT_Windshield/, livery: /^PAINT$/, ratio: [0.35, 0.12] },
  // Mercedes SLS GT3 (Dave Love, CC BY 4.0)
  sls: { wb: 2.68, tyre: /^EXT_Tyre/, rim: /^EXT_Rim\.005/, disc: /^EXT_Brake_Disk/, paint: /^EXT_Carpaint/,
    drop: /^INT_|DAMAGE_GLASS|Rim_Blur/, livery: /^PAINT$/, ratio: [0.6, 0.25] },
  // BMW M4 GT3 (toddeppe, CC BY 4.0): muso verso +X nel file, molto dettagliata
  m4: { wb: 2.92, rotX: true, tyre: /^TIRE$/, rim: /^WHEEL$/, disc: /^NESSUNO$/, paint: /^BODY$/,
    drop: /^INSIDE$|^INTERIOR$/, livery: /^PAINT$/, ratio: [0.06, 0.022], error: [0.0012, 0.004] },
  // Aston Martin Vantage GT3 2013: abitacolo ("cab") tolto
  amv: { wb: 2.6, tyre: /mm_tyre$/, rim: /mm_wheel$/, disc: /mm_rotor$/, paint: /mm_ext$/, drop: /mm_cab$/, livery: /^PAINT$/, ratio: [0.6, 0.25] },
  // Mercedes-AMG GT3 Evo Red Bull (VTX): muso verso +X nel file, abitacolo tolto
  amg: { wb: 2.63, rotX: true, tyre: /Evo_Tyre_Inst$/, rim: /Evo_Rim_Inst$/, disc: /Brake_Disc_Inst$/, paint: /Evo_Livery$/,
    drop: /Seat|Cockpit|Interactive_Lights|^Net_Share|^stitches_Share|Console|Interior|Pedals|Steering|WorldGrid/, livery: /^PAINT$/, ratio: [0.25, 0.06], error: [0.0012, 0.005] },
  // McLaren 720S GT3 Inception Racing (VTX): abitacolo tolto
  mcl: { wb: 2.67, tyre: /^Tyre$/, rim: /^Wheel$/, disc: /^NESSUNO$/, paint: /^Body$/, drop: /^Interior$/, livery: /^PAINT$/, ratio: [0.3, 0.08], error: [0.0012, 0.005] },
  // Maserati MC20 GT3 (stessa impostazione della Ferrari 296): abitacolo tolto
  mas: { wb: 2.7, tyre: /^MI_Tyre/, rim: /^EXT_RIM/, disc: /^EXT_Disc/, paint: /^EXT_Carpaint/,
    drop: /^INT_|BELT|LIMIRANK|^LED|RPMBAR|TRANSPARENTE|^DISPLAY|SAS_DISPLAY|RACELOGIC_DISPLAY|SPARCO/, livery: /^PAINT$/, ratio: [0.3, 0.08], error: [0.0012, 0.005] },
  // Toyota GR GT3 Vasser Sullivan (VTX): muso verso -Z nel file (si gira di 180°), abitacolo tolto
  toy: { wb: 2.73, flip: true, tyre: /^Tire$/, rim: /^Wheel$/, disc: /^NESSUNO$/, paint: /^Body$/, drop: /^Cockpit$|^Interior$/, livery: /^PAINT$/, ratio: [0.3, 0.08], error: [0.0012, 0.005] },
  // Ford Mustang GT3 (VTX): materiali senza nome; muso verso +Z
  ford: { wb: 2.71, cab: [-1.0, 0.7, 0.1, 1.45, -3.3, -0.9], tyre: /^mat_568$/, rim: /^mat_750$/, disc: /^mat_571$/, paint: /^mat_607$/, drop: /^mat_804$|^mat_330$/, livery: /^PAINT$/, ratio: [0.3, 0.05], error: [0.0015, 0.006] },
  // Lamborghini Huracán GT3 (stessa impostazione della BMW M4): muso verso +X nel file, abitacolo tolto
  lam: { wb: 2.645, rotX: true, tyre: /^TIRE$/, rim: /^WHEEL$/, disc: /^NESSUNO$/, paint: /^BODY$/, drop: /^INTERIOR$/, livery: /^PAINT$/, ratio: [0.12, 0.04], error: [0.0012, 0.004] },
  // NASCAR Chevrolet Camaro 2018 (vecarz): muso verso -Z (si gira), pilota a sinistra; ombra a terra tolta
  nas: { wb: 2.79, flip: true, tyre: /^rubber/, rim: /^car_body(_0|_2|_3)?$/, disc: /^orig_19/, paint: /^car_body_1$/, kill: /^Standard_10$/,
    drop: /^Inside_frame_baked$|^Material_4096|^Material_4084|^Carbon_Fiber(_0)?$|^black_trim(_0|_B)?$|^red_tape$|^inside_frame_details$|^Side_Pipes$/, livery: /^PAINT$/, ratio: [0.35, 0.1], error: [0.001, 0.004] },
  // Subaru BRZ GT300 2021 (vecarz, CC BY 4.0): abitacolo tolto
  brz: { wb: 2.57, tyre: /^Tire_DUNROP_BRZ$/, rim: /^Wheel_BBS$/, disc: /^Brake_Disc$/, paint: /^Car_Body_WR_Blue$/,
    drop: /^Belt$|^CockPit_|^INT_NET$|^Interia_|^Lumirank$|^material$|^BackMoniter$|^InteriaLabel$|^SteeringShaft1$|^SeatBelt$|^Steering$|^Glass_In$|^Wheel_Blur1$/, livery: /^PAINT$/, ratio: [0.3, 0.08], error: [0.0012, 0.005] },
}[id];
const STEER = { nas: { m: /^black_trim$|^red_tape$/ }, f296: { m: /Steer|STEER/ }, mas: { m: /Steer/ }, amg: { m: /Steering_Wheel/ }, brz: { m: /^Steering$/ }, m4: { n: /SteeringWheel/, ratio: 0.15 }, amv: { n: /STEERING_WHEEL/ }, mcl: { n: /CarbonSteering/ }, ford: { m: /^mat_590$/ } }[id] || {};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot(), scene = root.getDefaultScene();
// (il volante può essere un nodo vuoto con la mesh in un figlio: il figlio prende il suo nome)
if (STEER.n) for (const n of root.listNodes()) if (STEER.n.test(n.getName() || '')) for (const c of n.listChildren()) if (c.getMesh()) c.setName(n.getName() + '_' + c.getName());
await doc.transform(flatten());
if (CFG.kill) for (const mesh of root.listMeshes()) for (const p of [...mesh.listPrimitives()]) if (CFG.kill.test(p.getMaterial()?.getName() || '')) p.dispose();
for (const n of root.listNodes()) if (n.getMesh()) clearNodeTransform(n);
// trasformazioni delle texture (KHR_texture_transform, es. la livrea della RB8): si applicano alle UV
for (const m of root.listMaterials()) {
  const info = m.getBaseColorTextureInfo(), tt = info && info.getExtension('KHR_texture_transform');
  if (!tt) continue;
  const [sx, sy] = tt.getScale(), [ox, oy] = tt.getOffset(), r = tt.getRotation() || 0, set = tt.getTexCoord() ?? info.getTexCoord();
  const cr = Math.cos(r), sr = Math.sin(r), done = new Set();
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
    if (p.getMaterial() !== m) continue;
    const a = p.getAttribute('TEXCOORD_' + set); if (!a || done.has(a)) continue; done.add(a);
    const v = [];
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); const x = v[0] * sx, y = v[1] * sy; a.setElement(i, [cr * x + sr * y + ox, -sr * x + cr * y + oy]); }
    if (set !== 0) p.setAttribute('TEXCOORD_0', a);
  }
  info.setExtension('KHR_texture_transform', null);
  console.log('trasformazione UV applicata a', m.getName(), sx.toFixed(3), sy.toFixed(3), ox.toFixed(3), oy.toFixed(3));
}
if (CFG.flip) for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) transformPrimitive(p, [-1,0,0,0, 0,1,0,0, 0,0,-1,0, 0,0,0,1]);
if (CFG.rotX) for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) transformPrimitive(p, [0,0,1,0, 0,1,0,0, -1,0,0,0, 0,0,0,1]);
// abitacolo: i materiali tolti dalla carrozzeria (o, se non hanno nomi utili, i pezzi dentro la scatola dell'abitacolo)
const inCab = p => { if (!CFG.cab) return false; const a = p.getAttribute('POSITION'), v = []; let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < a.getCount(); i += 7) { a.getElement(i, v); for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], v[c]); hi[c] = Math.max(hi[c], v[c]); } }
  const B = CFG.cab; return lo[0] > B[0] && hi[0] < B[1] && lo[1] > B[2] && hi[1] < B[3] && lo[2] > B[4] && hi[2] < B[5]; };
const isInt = p => { const n = p.getMaterial()?.getName() || ''; return CFG.cab ? inCab(p) && !CFG.tyre.test(n) && !CFG.paint.test(n) && !/Window|Glass/i.test(n) : CFG.drop.test(n); };
for (const mesh of root.listMeshes()) for (const p of [...mesh.listPrimitives()]) if (INT ? !(isInt(p) || CFG.tyre.test(p.getMaterial()?.getName() || '')) : CFG.drop.test(p.getMaterial()?.getName() || '')) p.dispose();
for (const m of root.listMaterials()) if (CFG.paint.test(m.getName())) m.setName('PAINT');
for (const m of root.listMaterials()) {
  for (const e of m.listExtensions()) m.setExtension(e.extensionName, null);
  m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setEmissiveTexture(null);
}
for (const e of root.listExtensionsUsed()) if (e.extensionName !== 'KHR_mesh_quantization') e.dispose();
const matOf = p => p.getMaterial()?.getName() || '';
// via le primitive delle ruote mosse finte
if (!INT) for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) if (CFG.drop.test(matOf(p))) p.dispose();
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
if (INT) {
  // via le gomme (servivano solo per la scala); il volante in nodi suoi ("STEER_n") per farlo girare
  for (const mesh of root.listMeshes()) for (const p of [...mesh.listPrimitives()]) if (CFG.tyre.test(matOf(p))) p.dispose();
  let k = 0;
  for (const n of [...root.listNodes()]) {
    const mesh = n.getMesh(); if (!mesh) continue;
    for (const p of [...mesh.listPrimitives()]) {
      if (!((STEER.m && STEER.m.test(matOf(p))) || (STEER.n && STEER.n.test(n.getName() || '')))) continue;
      const sn = doc.createNode('STEER_' + k++).setMesh(doc.createMesh('STEER')); scene.addChild(sn);
      mesh.removePrimitive(p); sn.getMesh().addPrimitive(p);
    }
  }
  console.log('volante: primitive', k);
  await doc.transform(dedup(), prune(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: (STEER.ratio || 0.35) * 0.6, error: 0.0015 }), prune());
  for (const t of root.listTextures()) {
    const meta = await sharp(Buffer.from(t.getImage())).metadata(), sc = Math.min(1, 384 / Math.max(meta.width, meta.height));
    const pipe = sharp(Buffer.from(t.getImage())).resize(Math.max(1, Math.round(meta.width * sc)), Math.max(1, Math.round(meta.height * sc)));
    t.setImage(meta.hasAlpha ? await pipe.png({ compressionLevel: 9 }).toBuffer() : await pipe.jpeg({ quality: 80 }).toBuffer()).setMimeType(meta.hasAlpha ? 'image/png' : 'image/jpeg');
  }
  let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
  console.log('abitacolo triangoli', tris);
  await io.write(out, doc);
  process.exit(0);
}
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
