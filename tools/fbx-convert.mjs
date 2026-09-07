/**
 * Converte un FBX di veicoli nel pacchetto di mesh che carica il gioco.
 *
 *   node tools/fbx-convert.mjs <file.fbx> <uscita.bin> [--scale=0.001] [--report]
 *
 * Cosa fa, in ordine:
 *
 * 1. Ricostruisce la trasformazione di ogni nodo. Attenzione alla
 *    PreRotation: questi FBX nascono con la Z in alto e l'esportatore ci
 *    mette un -90 sull'asse X per raddrizzarli. Ignorarla significa
 *    ritrovarsi le auto lunghe in verticale.
 * 2. Rimette ogni veicolo nell'origine, con il muso sempre nella stessa
 *    direzione: nell'FBX le auto sono sparse su una griglia e ognuna ha il
 *    suo orientamento.
 * 3. Accoppia le ruote alla carrozzeria piu' vicina e le divide in
 *    anteriore/posteriore, sinistra/destra: servono separate per farle
 *    girare e sterzare.
 * 4. Salda i vertici identici (l'FBX ne elenca uno per angolo di poligono).
 * 5. Quantizza e comprime.
 *
 * Assi in uscita: +X avanti, +Y alto, +Z sinistra, cioe' la convenzione
 * gia' usata dalle auto costruite a mano.
 *
 * Formato del blob (deflate-raw, si apre con DecompressionStream):
 *   "NVM2", uint16 numeroVeicoli
 *   per veicolo: uint8 lunghezzaNome, nome, uint8 numeroParti
 *     per parte: uint8 lunghezzaRuolo, ruolo, geometria
 *   geometria: float32 x6 riquadro, float32 x4 riquadro UV,
 *              uint32 vertici, uint32 indici,
 *              uint16[] posizioni, int8[] normali, uint16[] uv, uint32[] indici
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { parseFBX, child, children } from './fbx.mjs';

const [file, out] = process.argv.slice(2);
const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const SCALE = Number(arg('scale', '0.001'));

/* ------------------------------------------------------------ matematica */

const rad = (d) => (d * Math.PI) / 180;
const mul = (a, b) => {
  const m = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    for (let k = 0; k < 3; k++) m[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  }
  return m;
};
const apply = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
// l'ordine di rotazione di default in FBX e' XYZ, che come matrice e' Rz*Ry*Rx
const euler = (r) => mul(rotZ(rad(r[2])), mul(rotY(rad(r[1])), rotX(rad(r[0]))));
const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/* ------------------------------------------------------------- lettura */

const { root } = parseFBX(fs.readFileSync(file));
const objs = child(root, 'Objects');
const conns = child(root, 'Connections');
const clean = (s) => String(s).split('\u0000')[0];

const parentOf = new Map();
for (const c of conns.nodes) {
  if (c.props[0] === 'OO') parentOf.set(c.props[1], c.props[2]);
}
const modelById = new Map();
for (const m of children(objs, 'Model')) modelById.set(m.props[0], m);

function props(model) {
  const p = child(model, 'Properties70');
  const o = { t: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1], pre: [0, 0, 0], gt: [0, 0, 0] };
  if (!p) return o;
  for (const q of p.nodes) {
    const k = clean(q.props[0]);
    const v = [q.props[4], q.props[5], q.props[6]];
    if (k === 'Lcl Translation') o.t = v;
    else if (k === 'Lcl Rotation') o.r = v;
    else if (k === 'Lcl Scaling') o.s = v;
    else if (k === 'PreRotation') o.pre = v;
    else if (k === 'GeometricTranslation') o.gt = v;
  }
  return o;
}

function layer(geo, elem, dataName, indexName) {
  const l = child(geo, elem);
  if (!l) return null;
  const data = child(l, dataName);
  if (!data) return null;
  return {
    data: data.props[0],
    index: child(l, indexName) ? child(l, indexName).props[0] : null,
    mapping: clean(child(l, 'MappingInformationType').props[0]),
    reference: clean(child(l, 'ReferenceInformationType').props[0]),
  };
}

/**
 * Estrae una mesh nello spazio "come disegnata": ruotata dalla sua Lcl
 * Rotation ma senza PreRotation ne' traslazione, piu' la posizione del nodo
 * riportata nello stesso spazio. Da li' e' facile rimettere tutto a posto.
 */
function readMesh(geo, model) {
  const P = props(model);
  const preInv = transpose(euler(P.pre));
  const rot = euler(P.r);
  const origin = apply(preInv, P.t);          // traslazione nello spazio disegnato

  const V = child(geo, 'Vertices').props[0];
  const I = child(geo, 'PolygonVertexIndex').props[0];
  const nrm = layer(geo, 'LayerElementNormal', 'Normals', 'NormalsIndex');
  const uvl = layer(geo, 'LayerElementUV', 'UV', 'UVIndex');

  const pos = [], nor = [], uvs = [], idx = [];
  let poly = [];
  for (let k = 0; k < I.length; k++) {
    const raw = I[k];
    const last = raw < 0;
    poly.push({ vi: last ? ~raw : raw, corner: k });
    if (!last) continue;
    const base = pos.length / 3;
    for (const c of poly) {
      const v = apply(rot, [
        V[c.vi * 3] * P.s[0] + P.gt[0],
        V[c.vi * 3 + 1] * P.s[1] + P.gt[1],
        V[c.vi * 3 + 2] * P.s[2] + P.gt[2],
      ]);
      pos.push(v[0] + origin[0], v[1] + origin[1], v[2] + origin[2]);

      if (nrm) {
        const at = nrm.mapping === 'ByVertice' ? c.vi : c.corner;
        const j = nrm.reference === 'IndexToDirect' && nrm.index ? nrm.index[at] : at;
        const n = apply(rot, [nrm.data[j * 3], nrm.data[j * 3 + 1], nrm.data[j * 3 + 2]]);
        const len = Math.hypot(n[0], n[1], n[2]) || 1;
        nor.push(n[0] / len, n[1] / len, n[2] / len);
      } else nor.push(0, 0, 1);

      if (uvl) {
        const at = uvl.mapping === 'ByVertice' ? c.vi : c.corner;
        const j = uvl.reference === 'IndexToDirect' && uvl.index ? uvl.index[at] : at;
        uvs.push(uvl.data[j * 2], uvl.data[j * 2 + 1]);
      } else uvs.push(0, 0);
    }
    for (let t = 1; t + 1 < poly.length; t++) idx.push(base, base + t, base + t + 1);
    poly = [];
  }
  return { name: clean(model.props[1]), pos, nor, uvs, idx, origin, heading: rad(P.r[2]) };
}

const raw = [];
for (const geo of children(objs, 'Geometry')) {
  const model = modelById.get(parentOf.get(geo.props[0]));
  if (!model || !child(geo, 'Vertices') || !child(geo, 'PolygonVertexIndex')) continue;
  const m = readMesh(geo, model);
  if (m.pos.length >= 9) raw.push(m);
}

/* ---------------------------------------------- raggruppamento in veicoli */

const isWheel = (n) => /^wheel/i.test(n);
const bodies = raw.filter((m) => /body/i.test(m.name) && !isWheel(m.name));
const wheels = raw.filter((m) => isWheel(m.name));

/** Centro della mesh nello spazio disegnato. */
function centre(m) {
  let x = 0, y = 0, z = 0;
  const n = m.pos.length / 3;
  for (let i = 0; i < m.pos.length; i += 3) { x += m.pos[i]; y += m.pos[i + 1]; z += m.pos[i + 2]; }
  return [x / n, y / n, z / n];
}
for (const m of raw) m.centre = centre(m);

// ogni ruota va alla carrozzeria piu' vicina in pianta (X,Y: qui la Z e' l'alto)
for (const w of wheels) {
  let best = null, bd = Infinity;
  for (const b of bodies) {
    const d = (w.centre[0] - b.centre[0]) ** 2 + (w.centre[1] - b.centre[1]) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  w.owner = best;
  w.dist = Math.sqrt(bd);
}

/**
 * Porta la mesh nello spazio del veicolo: origine sulla carrozzeria, muso
 * lungo +X, alto lungo +Y. Nell'FBX la Z e' l'alto e la lunghezza sta sulla
 * Y, quindi (x,y,z) -> (y,z,x) — permutazione destrorsa, non specchia nulla.
 */
function canonical(m, body, extraYaw = 0) {
  const h = -body.heading + extraYaw;
  const c = Math.cos(h), s = Math.sin(h);
  const pos = new Float64Array(m.pos.length);
  const nor = new Float64Array(m.nor.length);
  for (let i = 0; i < m.pos.length; i += 3) {
    const dx = m.pos[i] - body.centre[0];
    const dy = m.pos[i + 1] - body.centre[1];
    const dz = m.pos[i + 2];
    const x = dx * c - dy * s;
    const y = dx * s + dy * c;
    pos[i] = y * SCALE; pos[i + 1] = dz * SCALE; pos[i + 2] = x * SCALE;
    const nx = m.nor[i], ny = m.nor[i + 1], nz = m.nor[i + 2];
    const rx = nx * c - ny * s;
    const ry = nx * s + ny * c;
    nor[i] = ry; nor[i + 1] = nz; nor[i + 2] = rx;
  }
  return { pos, nor, uvs: m.uvs, idx: m.idx };
}

/** Salda i vertici identici: l'FBX ne elenca uno per angolo di poligono. */
function weld(g) {
  const map = new Map();
  const pos = [], nor = [], uvs = [], idx = [];
  const key = (i) => (
    `${Math.round(g.pos[i * 3] * 4096)},${Math.round(g.pos[i * 3 + 1] * 4096)},${Math.round(g.pos[i * 3 + 2] * 4096)},` +
    `${Math.round(g.nor[i * 3] * 64)},${Math.round(g.nor[i * 3 + 1] * 64)},${Math.round(g.nor[i * 3 + 2] * 64)},` +
    `${Math.round(g.uvs[i * 2] * 4096)},${Math.round(g.uvs[i * 2 + 1] * 4096)}`
  );
  for (const i of g.idx) {
    const k = key(i);
    let at = map.get(k);
    if (at === undefined) {
      at = pos.length / 3;
      map.set(k, at);
      pos.push(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]);
      nor.push(g.nor[i * 3], g.nor[i * 3 + 1], g.nor[i * 3 + 2]);
      uvs.push(g.uvs[i * 2], g.uvs[i * 2 + 1]);
    }
    idx.push(at);
  }
  return { pos, nor, uvs, idx };
}

const cars = [];
for (const b of bodies) {
  const mine = wheels.filter((w) => w.owner === b).sort((x, y) => x.dist - y.dist).slice(0, 4);
  if (mine.length < 4) console.warn(`attenzione: ${b.name} ha ${mine.length} ruote`);

  /*
   * Non tutte le carrozzerie sono disegnate con lo stesso orientamento: una
   * ha il muso a 90 gradi dalle altre. Un'auto e' sempre piu' lunga che
   * larga, quindi se dopo il raddrizzamento la larghezza supera la
   * lunghezza si aggiunge un quarto di giro.
   */
  const probe = canonical(b, b);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < probe.pos.length; i += 3) {
    x0 = Math.min(x0, probe.pos[i]); x1 = Math.max(x1, probe.pos[i]);
    z0 = Math.min(z0, probe.pos[i + 2]); z1 = Math.max(z1, probe.pos[i + 2]);
  }
  const yaw = (z1 - z0) > (x1 - x0) ? Math.PI / 2 : 0;

  const parts = [['body', weld(canonical(b, b, yaw))]];
  const placed = mine.map((w) => ({ w, g: weld(canonical(w, b, yaw)) }));
  // avanti/dietro dalla X, sinistra/destra dalla Z, nello spazio del veicolo
  for (const p of placed) {
    let x = 0, z = 0;
    for (let i = 0; i < p.g.pos.length; i += 3) { x += p.g.pos[i]; z += p.g.pos[i + 2]; }
    p.x = x / (p.g.pos.length / 3);
    p.z = z / (p.g.pos.length / 3);
  }
  const front = placed.slice().sort((a, c) => c.x - a.x).slice(0, 2);
  for (const p of placed) {
    const f = front.includes(p) ? 'f' : 'r';
    const side = p.z > 0 ? 'l' : 'r';
    parts.push([`wheel_${f}${side}`, p.g, p]);
  }
  // il nome della ruota serve poi a scegliere la texture del cerchio
  const rim = mine.length ? mine[0].name : '';
  cars.push({ name: b.name.replace(/\s+/g, '_').toLowerCase(), parts, rim });
}
cars.sort((a, b) => a.name.localeCompare(b.name));

/* ------------------------------------------------------------ scrittura */

function packGeo(g) {
  const n = g.pos.length / 3;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < g.pos.length; i += 3) {
    minX = Math.min(minX, g.pos[i]); maxX = Math.max(maxX, g.pos[i]);
    minY = Math.min(minY, g.pos[i + 1]); maxY = Math.max(maxY, g.pos[i + 1]);
    minZ = Math.min(minZ, g.pos[i + 2]); maxZ = Math.max(maxZ, g.pos[i + 2]);
  }
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
  for (let i = 0; i < g.uvs.length; i += 2) {
    minU = Math.min(minU, g.uvs[i]); maxU = Math.max(maxU, g.uvs[i]);
    minV = Math.min(minV, g.uvs[i + 1]); maxV = Math.max(maxV, g.uvs[i + 1]);
  }
  const head = Buffer.alloc(10 * 4 + 8);
  let o = 0;
  for (const v of [minX, minY, minZ, maxX, maxY, maxZ, minU, minV, maxU, maxV]) { head.writeFloatLE(v, o); o += 4; }
  head.writeUInt32LE(n, o); o += 4;
  head.writeUInt32LE(g.idx.length, o);

  const q = (v, lo, hi) => Math.max(0, Math.min(65535, Math.round((hi > lo ? (v - lo) / (hi - lo) : 0) * 65535)));
  const pos = Buffer.alloc(n * 6), nor = Buffer.alloc(n * 3), uv = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    pos.writeUInt16LE(q(g.pos[i * 3], minX, maxX), i * 6);
    pos.writeUInt16LE(q(g.pos[i * 3 + 1], minY, maxY), i * 6 + 2);
    pos.writeUInt16LE(q(g.pos[i * 3 + 2], minZ, maxZ), i * 6 + 4);
    for (let k = 0; k < 3; k++) nor.writeInt8(Math.max(-127, Math.min(127, Math.round(g.nor[i * 3 + k] * 127))), i * 3 + k);
    uv.writeUInt16LE(q(g.uvs[i * 2], minU, maxU), i * 4);
    uv.writeUInt16LE(q(g.uvs[i * 2 + 1], minV, maxV), i * 4 + 2);
  }
  const idx = Buffer.alloc(g.idx.length * 4);
  for (let i = 0; i < g.idx.length; i++) idx.writeUInt32LE(g.idx[i], i * 4);
  return { buf: Buffer.concat([head, pos, nor, uv, idx]), n, tris: g.idx.length / 3, box: [maxX - minX, maxY - minY, maxZ - minZ] };
}

const chunks = [];
const header = Buffer.alloc(6);
header.write('NVM2', 0, 'ascii');
header.writeUInt16LE(cars.length, 4);
chunks.push(header);

const report = [];
for (const car of cars) {
  const nameBuf = Buffer.from(car.name, 'utf8');
  const h = Buffer.alloc(2 + nameBuf.length);
  h.writeUInt8(nameBuf.length, 0);
  nameBuf.copy(h, 1);
  h.writeUInt8(car.parts.length, 1 + nameBuf.length);
  chunks.push(h);
  const info = { nome: car.name, parti: [] };
  for (const [role, g] of car.parts) {
    const rb = Buffer.from(role, 'utf8');
    const rh = Buffer.alloc(1 + rb.length);
    rh.writeUInt8(rb.length, 0);
    rb.copy(rh, 1);
    const packed = packGeo(g);
    chunks.push(rh, packed.buf);
    info.parti.push({ ruolo: role, vert: packed.n, tri: packed.tris, dim: packed.box.map((v) => Number(v.toFixed(2))) });
  }
  info.cerchio = car.rim;
  report.push(info);
}

const blob = Buffer.concat(chunks);
const zipped = zlib.deflateRawSync(blob, { level: 9 });
fs.writeFileSync(out, zipped);
console.log(`${cars.length} veicoli — grezzo ${(blob.length / 1024).toFixed(0)} KB, compresso ${(zipped.length / 1024).toFixed(0)} KB`);
const manifestPath = arg('manifest', '');
if (manifestPath) {
  fs.writeFileSync(manifestPath, JSON.stringify(report.map((c) => ({
    nome: c.nome, cerchio: c.cerchio,
    triangoli: c.parti.reduce((a, p) => a + p.tri, 0),
  })), null, 1));
}
if (process.argv.includes('--report')) {
  for (const c of report) {
    const b = c.parti[0];
    console.log(`  ${c.nome.padEnd(16)} corpo ${String(b.vert).padStart(5)}v ${String(b.tri).padStart(5)}t  ` +
      `dim ${b.dim.join(' x ')}  ruote ${c.parti.slice(1).map((p) => p.ruolo.slice(6)).join(',')}`);
  }
}
