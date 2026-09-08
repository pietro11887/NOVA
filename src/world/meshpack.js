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
  if (typeof DecompressionStream === 'function') {
    try {
      const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) { /* browser vecchio o formato rifiutato: si apre a mano */ }
  }
  return inflateRawJS(new Uint8Array(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength ?? buf.length));
}

/*
 * Deflate aperto a mano (RFC 1951).
 *
 * Serve come riserva dove DecompressionStream non c'e' — i telefoni con
 * Safari precedente al 2023 — perche' senza di questo il pacchetto di
 * modelli non si apre e le auto tornano a essere quelle disegnate a mano.
 * Sono duecento righe una volta sola, contro un megabyte di libreria.
 */
function buildHuffman(lengths) {
  const MAXBITS = 15;
  // quanti codici per ogni lunghezza, e i simboli ordinati per lunghezza:
  // basta questo per riconoscere un codice canonico leggendo un bit alla volta
  const count = new Int32Array(MAXBITS + 1);
  for (const l of lengths) count[l]++;
  count[0] = 0;
  const offs = new Int32Array(MAXBITS + 2);
  for (let i = 1; i <= MAXBITS; i++) offs[i + 1] = offs[i] + count[i];
  const symbols = new Int32Array(lengths.length);
  for (let sym = 0; sym < lengths.length; sym++) {
    if (lengths[sym]) symbols[offs[lengths[sym]]++] = sym;
  }
  return { count, symbols };
}

function makeReader(src) {
  let pos = 0, bit = 0, acc = 0;
  return {
    bits(n) {
      while (bit < n) { acc |= src[pos++] << bit; bit += 8; }
      const v = acc & ((1 << n) - 1);
      acc >>>= n; bit -= n;
      return v;
    },
    align() { acc = 0; bit = 0; },
    byte() { return src[pos++]; },
    skip(n) { pos += n; },
    symbol(h) {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len <= 15; len++) {
        code |= this.bits(1);
        const n = h.count[len];
        if (code - first < n) return h.symbols[index + (code - first)];
        index += n;
        first = (first + n) << 1;
        code <<= 1;
      }
      throw new Error('codice deflate non valido');
    },
  };
}

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

export function inflateRawJS(src) {
  const r = makeReader(src);
  let out = new Uint8Array(1 << 18);
  let n = 0;
  const push = (b) => {
    if (n === out.length) { const g = new Uint8Array(out.length * 2); g.set(out); out = g; }
    out[n++] = b;
  };

  let fixedLit = null, fixedDist = null;
  for (;;) {
    const last = r.bits(1);
    const type = r.bits(2);

    if (type === 0) {                       // blocco non compresso
      r.align();
      const len = r.byte() | (r.byte() << 8);
      r.skip(2);                            // complemento, non serve
      for (let i = 0; i < len; i++) push(r.byte());
    } else {
      let lit, dist;
      if (type === 1) {                     // alfabeto fisso
        if (!fixedLit) {
          const ll = new Uint8Array(288);
          for (let i = 0; i < 288; i++) ll[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
          fixedLit = buildHuffman(ll);
          fixedDist = buildHuffman(new Uint8Array(30).fill(5));
        }
        lit = fixedLit; dist = fixedDist;
      } else {                              // alfabeto dichiarato nel blocco
        const nlit = r.bits(5) + 257, ndist = r.bits(5) + 1, nclen = r.bits(4) + 4;
        const clen = new Uint8Array(19);
        for (let i = 0; i < nclen; i++) clen[CLEN_ORDER[i]] = r.bits(3);
        const clh = buildHuffman(clen);
        const lengths = new Uint8Array(nlit + ndist);
        for (let i = 0; i < lengths.length;) {
          const sym = r.symbol(clh);
          if (sym < 16) lengths[i++] = sym;
          else if (sym === 16) { const prev = lengths[i - 1]; let c = 3 + r.bits(2); while (c--) lengths[i++] = prev; }
          else if (sym === 17) { let c = 3 + r.bits(3); while (c--) lengths[i++] = 0; }
          else { let c = 11 + r.bits(7); while (c--) lengths[i++] = 0; }
        }
        lit = buildHuffman(lengths.subarray(0, nlit));
        dist = buildHuffman(lengths.subarray(nlit));
      }

      for (;;) {
        const sym = r.symbol(lit);
        if (sym === 256) break;
        if (sym < 256) { push(sym); continue; }
        const li = sym - 257;
        const length = LEN_BASE[li] + r.bits(LEN_EXTRA[li]);
        const ds = r.symbol(dist);
        const back = DIST_BASE[ds] + r.bits(DIST_EXTRA[ds]);
        for (let i = 0; i < length; i++) push(out[n - back]);
      }
    }
    if (last) break;
  }
  return out.subarray(0, n);
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

/**
 * Byte di un data URI in base64, decodificati a mano.
 *
 * Non si usa fetch, e non e' un vezzo: nella pagina pubblicata la politica
 * di sicurezza vieta le connessioni verso i data URI, quindi la fetch
 * falliva e il gioco ripiegava sulle carrozzerie disegnate a mano. Da fuori
 * si vedeva solo che le auto erano tutte squadrate.
 */
function base64Bytes(uri) {
  const bin = atob(uri.slice(uri.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Carica il pacchetto da URL o, nel file unico, dal data URI gia' incluso. */
export async function loadMeshPack(name = 'cars.bin', base = 'assets/models/') {
  const src = (globalThis.NOVA_MESH && globalThis.NOVA_MESH[name]) || base + name;
  if (src.startsWith('data:')) return parseMeshPack(base64Bytes(src));
  const res = await fetch(src);
  if (!res.ok) throw new Error(`pacchetto mesh mancante: ${name}`);
  return parseMeshPack(await res.arrayBuffer());
}
