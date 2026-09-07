import * as THREE from 'three';

/**
 * Lettore del pacchetto di mesh prodotto da tools/fbx-convert.mjs.
 *
 * Il file e' un blob compresso con deflate-raw, lo stesso schema dei codici
 * di collegamento in multigiocatore: si apre con DecompressionStream, senza
 * librerie da caricare.
 *
 * Posizioni e UV arrivano quantizzate a 16 bit dentro il riquadro della
 * mesh, le normali a 8 bit. Su una carrozzeria da 5000 vertici la perdita
 * non si vede e il pacchetto pesa un terzo.
 */

const MAGIC = 'NVM2';

async function inflateRaw(buf) {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

class Cursor {
  constructor(bytes) {
    this.b = bytes;
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.o = 0;
  }
  u8() { return this.v.getUint8(this.o++); }
  u16() { const x = this.v.getUint16(this.o, true); this.o += 2; return x; }
  u32() { const x = this.v.getUint32(this.o, true); this.o += 4; return x; }
  f32() { const x = this.v.getFloat32(this.o, true); this.o += 4; return x; }
  str(n) { const s = new TextDecoder().decode(this.b.subarray(this.o, this.o + n)); this.o += n; return s; }
  take(n) { const s = this.b.subarray(this.o, this.o + n); this.o += n; return s; }
}

function readGeometry(c) {
  const minX = c.f32(), minY = c.f32(), minZ = c.f32();
  const maxX = c.f32(), maxY = c.f32(), maxZ = c.f32();
  const minU = c.f32(), minV = c.f32(), maxU = c.f32(), maxV = c.f32();
  const n = c.u32(), ni = c.u32();

  // le viste tipizzate vogliono l'allineamento giusto: si copia
  const posRaw = new Uint16Array(c.take(n * 6).slice().buffer);
  const norRaw = new Int8Array(c.take(n * 3).slice().buffer);
  const uvRaw = new Uint16Array(c.take(n * 4).slice().buffer);
  const idxRaw = new Uint32Array(c.take(ni * 4).slice().buffer);

  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const sx = (maxX - minX) / 65535, sy = (maxY - minY) / 65535, sz = (maxZ - minZ) / 65535;
  const su = (maxU - minU) / 65535, sv = (maxV - minV) / 65535;
  for (let i = 0; i < n; i++) {
    pos[i * 3] = minX + posRaw[i * 3] * sx;
    pos[i * 3 + 1] = minY + posRaw[i * 3 + 1] * sy;
    pos[i * 3 + 2] = minZ + posRaw[i * 3 + 2] * sz;
    let a = norRaw[i * 3] / 127, b = norRaw[i * 3 + 1] / 127, d = norRaw[i * 3 + 2] / 127;
    const len = Math.hypot(a, b, d) || 1;
    nor[i * 3] = a / len; nor[i * 3 + 1] = b / len; nor[i * 3 + 2] = d / len;
    uv[i * 2] = minU + uvRaw[i * 2] * su;
    uv[i * 2 + 1] = minV + uvRaw[i * 2 + 1] * sv;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idxRaw, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/**
 * @returns {Promise<Object<string, Object<string, THREE.BufferGeometry>>>}
 *   nome veicolo -> ruolo ('body', 'wheel_fl', …) -> geometria
 */
export async function parseMeshPack(buffer) {
  const bytes = await inflateRaw(buffer);
  const c = new Cursor(bytes);
  if (c.str(4) !== MAGIC) throw new Error('pacchetto mesh non riconosciuto');
  const count = c.u16();
  const out = {};
  for (let i = 0; i < count; i++) {
    const name = c.str(c.u8());
    const parts = c.u8();
    const car = {};
    for (let k = 0; k < parts; k++) {
      const role = c.str(c.u8());
      car[role] = readGeometry(c);
    }
    out[name.replace(/_body$/, '')] = car;
  }
  return out;
}

/** Carica il pacchetto da URL o, nel file unico, dal data URI gia' incluso. */
export async function loadMeshPack(name = 'cars.bin', base = 'assets/models/') {
  const src = (globalThis.NOVA_MESH && globalThis.NOVA_MESH[name]) || base + name;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`pacchetto mesh mancante: ${name}`);
  return parseMeshPack(await res.arrayBuffer());
}
