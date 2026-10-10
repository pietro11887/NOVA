// Replay: durante la gara si registra la posizione di ogni vettura (15 volte al secondo),
// poi si può rivedere tutto: pausa, avanti e indietro, al rallentatore, da varie telecamere.
// L'ultimo replay viene salvato nel browser (IndexedDB) e si rivede dal Garage.

export const HZ = 15;
export const K = 9;                       // x, y, z, yaw, pitch, roll, sterzo, velocità, progresso
const SC_K = 5;                           // safety car: x, y, z, yaw, visibile

export class Recorder {
  constructor(cars, info) {
    this.cars = cars;                     // vetture della gara (in ordine fisso)
    this.info = info;                     // pista, categoria, giri, nomi e colori
    this.frames = [];
    this.next = 0;
    this.stopped = false;
  }
  // t: tempo di gara; prog: funzione progresso (giri * lunghezza + metri)
  tick(t, prog, sc) {
    if (this.stopped || t < this.next) return;
    this.next = t + 1 / HZ;
    const n = this.cars.length, f = new Float32Array(n * K + SC_K + 1);
    f[0] = t;
    this.cars.forEach((c, k) => {
      const p = c.phys, o = 1 + k * K;
      if (c.gone) { f[o] = NaN; return; }
      f[o] = p.x; f[o + 1] = p.y; f[o + 2] = p.z; f[o + 3] = p.yaw; f[o + 4] = p.pitch; f[o + 5] = p.roll;
      f[o + 6] = p.steer; f[o + 7] = p.speed; f[o + 8] = prog(c);
    });
    const o = 1 + n * K;
    const m = sc && sc.model && sc.model.root;
    if (m && m.visible) { f[o] = m.position.x; f[o + 1] = m.position.y; f[o + 2] = m.position.z; f[o + 3] = m.rotation.y; f[o + 4] = 1; }
    this.frames.push(f);
  }
  // dati compatti da salvare
  pack() {
    const n = this.cars.length, stride = n * K + SC_K + 1, buf = new Float32Array(this.frames.length * stride);
    this.frames.forEach((f, i) => buf.set(f, i * stride));
    return { info: this.info, n, stride, count: this.frames.length, data: buf.buffer };
  }
}

// replay pronto da riprodurre (da una gara appena finita o caricato dal browser)
export class Replay {
  constructor(packed) {
    this.info = packed.info; this.n = packed.n; this.stride = packed.stride; this.count = packed.count;
    this.data = new Float32Array(packed.data);
    this.t0 = this.data[0];
    this.duration = this.count > 1 ? this.data[(this.count - 1) * this.stride] - this.t0 : 0;
  }
  // posa interpolata della vettura k al tempo t (secondi dall'inizio del replay)
  pose(k, t, out) {
    const { data, stride, count } = this;
    const u = Math.max(0, Math.min(count - 1.001, t * HZ));
    const i = Math.floor(u), f = u - i;
    const a = i * stride + 1 + k * K, b = (i + 1) * stride + 1 + k * K;
    if (Number.isNaN(data[a]) || Number.isNaN(data[b])) { out.visible = false; return out; }
    out.visible = true;
    const L = (q) => data[a + q] + (data[b + q] - data[a + q]) * f;
    out.x = L(0); out.y = L(1); out.z = L(2);
    let dy = data[b + 3] - data[a + 3]; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    out.yaw = data[a + 3] + dy * f;
    out.pitch = L(4); out.roll = L(5); out.steer = L(6); out.speed = L(7); out.prog = L(8);
    return out;
  }
  sc(t, out) {
    const { data, stride, count, n } = this;
    const i = Math.max(0, Math.min(count - 1, Math.round(t * HZ))), o = i * stride + 1 + n * K;
    out.visible = data[o + 4] > 0.5;
    out.x = data[o]; out.y = data[o + 1]; out.z = data[o + 2]; out.yaw = data[o + 3];
    return out;
  }
}

// salvataggio nel browser: solo l'ultimo replay (può essere qualche MB)
const DB = 'novaf1-replays', STORE = 'replays';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function saveReplay(packed) {
  try {
    const d = await db();
    await new Promise((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(packed, 'last'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    return true;
  } catch (e) { return false; }
}
export async function loadReplay() {
  try {
    const d = await db();
    return await new Promise((res, rej) => { const tx = d.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).get('last'); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); });
  } catch (e) { return null; }
}
