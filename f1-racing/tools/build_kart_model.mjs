// Kart (go-kart da Sketchfab, OBJ in centimetri, Z in alto) -> assets/kart_hi.glb e kart_mid.glb per il gioco.
// Stesse regole delle GT: Y in alto, muso verso +Z, sinistra verso +X, terra a y=0, centro tra gli assi a z=0,
// ruote in quattro nodi WHEEL_xx_TIRE. Carrozzeria con il materiale "PAINT" (si ridipinge con i colori delle squadre).
// Uso: node tools/build_kart_model.mjs <file.obj> <cartella texture> <uscita.glb> [mid]
import fs from 'fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { dedup, prune, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [src, texDir, out, mode] = process.argv.slice(2);
const LOW = mode === 'mid';
const V = [], VT = [], VN = [], groups = {};
let g = 'default';
for (const line of fs.readFileSync(src, 'utf8').split('\n')) {
  const t = line.trim().split(/\s+/);
  if (t[0] === 'v') V.push([+t[1], +t[2], +t[3]]);
  else if (t[0] === 'vt') VT.push([+t[1], +t[2]]);
  else if (t[0] === 'vn') VN.push([+t[1], +t[2], +t[3]]);
  else if (t[0] === 'g') g = t[1];
  else if (t[0] === 'f') {
    const f = t.slice(1).map(s => s.split('/').map(x => (x ? +x - 1 : -1)));
    const list = groups[g] || (groups[g] = []);
    for (let i = 1; i < f.length - 1; i++) list.push(f[0], f[i], f[i + 1]);
  }
}
// muso: le ruote anteriori sono le più piccole
const wv = [...new Set(groups.wheels_msh.map(c => c[0]))].map(i => V[i]);
const yMid = (Math.min(...wv.map(p => p[1])) + Math.max(...wv.map(p => p[1]))) / 2;
const zTop = sel => Math.max(...wv.filter(sel).map(p => p[2]));
const noseY = zTop(p => p[1] > yMid) < zTop(p => p[1] < yMid) ? 1 : -1;
// (x, y, z) del file -> gioco: sinistra = -x (se il muso è verso +y), alto = z, avanti = y
const toGame = p => (noseY > 0 ? [-p[0], p[2], p[1]] : [p[0], p[2], -p[1]]).map(v => v * 0.01);
const W = wv.map(toGame);
const zF = (() => { const f = W.filter(p => p[2] > yMid * 0.01 * noseY); return (Math.min(...f.map(p => p[2])) + Math.max(...f.map(p => p[2]))) / 2; })();
const zR = (() => { const f = W.filter(p => p[2] <= yMid * 0.01 * noseY); return (Math.min(...f.map(p => p[2])) + Math.max(...f.map(p => p[2]))) / 2; })();
const y0 = Math.min(...W.map(p => p[1])), zc = (zF + zR) / 2;
console.log('muso', noseY > 0 ? '+y' : '-y', 'passo', (zF - zR).toFixed(3), 'm');
const doc = new Document(), buf = doc.createBuffer(), scene = doc.createScene();
async function tex(name, size) {
  const img = await sharp(`${texDir}/${name}`).resize(size, size).jpeg({ quality: 85 }).toBuffer();
  return doc.createTexture(name).setImage(img).setMimeType('image/jpeg');
}
const paint = doc.createMaterial('PAINT').setBaseColorTexture(await tex('body_msh_albedo.jpg', LOW ? 512 : 1024)).setRoughnessFactor(0.5).setMetallicFactor(0.1);
const wmat = doc.createMaterial('KART_WHEEL').setBaseColorTexture(await tex('wheels_msh_albedo.jpg', LOW ? 256 : 512)).setRoughnessFactor(0.8).setMetallicFactor(0.2);
function prim(corners, mat) {
  const key = new Map(), P = [], N = [], T = [], I = [];
  for (const [vi, ti, ni] of corners) {
    const k = vi + '/' + ti + '/' + ni;
    let id = key.get(k);
    if (id == null) {
      id = P.length / 3; key.set(k, id);
      const p = toGame(V[vi]); P.push(p[0], p[1] - y0, p[2] - zc);
      const n = ni >= 0 ? VN[ni] : [0, 0, 1], nn = noseY > 0 ? [-n[0], n[2], n[1]] : [n[0], n[2], -n[1]]; N.push(...nn);
      const t = ti >= 0 ? VT[ti] : [0, 0]; T.push(t[0], 1 - t[1]);
    }
    I.push(id);
  }
  return doc.createPrimitive().setMaterial(mat)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(T)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(buf));
}
scene.addChild(doc.createNode('BODY').setMesh(doc.createMesh('BODY').addPrimitive(prim(groups.body_msh, paint))));
// ruote: ogni triangolo va nella ruota del suo quadrante
const quad = {};
const wc = groups.wheels_msh;
for (let i = 0; i < wc.length; i += 3) {
  const c = [0, 1, 2].map(q => toGame(V[wc[i + q][0]]));
  const x = (c[0][0] + c[1][0] + c[2][0]) / 3, z = (c[0][2] + c[1][2] + c[2][2]) / 3 - zc;
  const k = (x > 0 ? 'L' : 'R') + (z > 0 ? 'F' : 'R');
  (quad[k] || (quad[k] = [])).push(wc[i], wc[i + 1], wc[i + 2]);
}
for (const [k, list] of Object.entries(quad)) scene.addChild(doc.createNode(`WHEEL_${k}_TIRE`).setMesh(doc.createMesh(k).addPrimitive(prim(list, wmat))));
await doc.transform(dedup(), weld(), ...(LOW ? [simplify({ simplifier: MeshoptSimplifier, ratio: 0.45, error: 0.002 })] : []), prune());
let tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
console.log('ruote', Object.keys(quad).join(','), 'triangoli', tris);
await new NodeIO().write(out, doc);
