/**
 * Lettore minimo di FBX binario (versioni 7100..7700).
 * Serve a convertire i modelli scaricati in geometrie pronte per il gioco:
 * di FBX ci interessano solo i nodi Model, le Geometry e i collegamenti.
 */
import { inflateSync } from 'node:zlib';

class Reader {
  constructor(buf) { this.b = buf; this.o = 0; }
  u8() { const v = this.b.readUInt8(this.o); this.o += 1; return v; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  i16() { const v = this.b.readInt16LE(this.o); this.o += 2; return v; }
  i32() { const v = this.b.readInt32LE(this.o); this.o += 4; return v; }
  i64() { const v = this.b.readBigInt64LE(this.o); this.o += 8; return Number(v); }
  f32() { const v = this.b.readFloatLE(this.o); this.o += 4; return v; }
  f64() { const v = this.b.readDoubleLE(this.o); this.o += 8; return v; }
  str(n) { const v = this.b.toString('binary', this.o, this.o + n); this.o += n; return v; }
}

const ARRAY_KIND = { f: [Float32Array, 4], d: [Float64Array, 8], l: [BigInt64Array, 8], i: [Int32Array, 4], b: [Uint8Array, 1] };

function readArray(r, code) {
  const [Type, width] = ARRAY_KIND[code];
  const len = r.u32(), encoding = r.u32(), size = r.u32();
  let raw = r.b.subarray(r.o, r.o + size);
  r.o += size;
  if (encoding === 1) raw = inflateSync(raw);
  // il buffer del file non e' allineato: si copia prima di reinterpretarlo
  const copy = Buffer.from(raw.subarray(0, len * width));
  const out = new Type(copy.buffer, copy.byteOffset, len);
  return code === 'l' ? Array.from(out, Number) : out;
}

function readProp(r) {
  const code = r.str(1);
  switch (code) {
    case 'Y': return r.i16();
    case 'C': return r.u8() !== 0;
    case 'I': return r.i32();
    case 'F': return r.f32();
    case 'D': return r.f64();
    case 'L': return r.i64();
    case 'S': case 'R': { const n = r.u32(); return r.str(n); }
    default: return readArray(r, code);
  }
}

function readNode(r, wide) {
  const end = wide ? r.i64() : r.u32();
  const nProps = wide ? r.i64() : r.u32();
  const propLen = wide ? r.i64() : r.u32();
  const nameLen = r.u8();
  if (end === 0) return null;              // record nullo: fine della lista
  const name = r.str(nameLen);
  const props = [];
  for (let i = 0; i < nProps; i++) props.push(readProp(r));
  const nodes = [];
  const sentinel = wide ? 25 : 13;
  while (r.o < end - sentinel) {
    const child = readNode(r, wide);
    if (!child) break;
    nodes.push(child);
  }
  r.o = end;
  return { name, props, nodes };
}

export function parseFBX(buf) {
  if (buf.toString('binary', 0, 20) !== 'Kaydara FBX Binary  ') throw new Error('non e\' un FBX binario');
  const version = buf.readUInt32LE(23);
  const wide = version >= 7500;
  const r = new Reader(buf);
  r.o = 27;
  const root = { name: '', props: [], nodes: [] };
  while (r.o < buf.length - (wide ? 25 : 13)) {
    const n = readNode(r, wide);
    if (!n) break;
    root.nodes.push(n);
  }
  return { version, root };
}

export const child = (node, name) => node.nodes.find((n) => n.name === name);
export const children = (node, name) => node.nodes.filter((n) => n.name === name);
