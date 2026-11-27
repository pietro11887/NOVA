// Traffico dell'autostrada (guida libera): tante macchine normali intorno a te, su tutte e due le carreggiate.
// - In marcia scorrono nella loro corsia, ognuna alla sua velocità (80-150 km/h): chi è più veloce si sposta
//   a sinistra, sorpassa e rientra a destra; dietro a uno più lento (o a te) frena e si accoda.
// - Se le urti (o si urtano tra loro) diventano corpi liberi: spinta, sbandata, testacoda, si fermano
//   strisciando; dopo qualche secondo ripartono e tornano nella corsia.
// - Restano sempre intorno a te: chi finisce troppo lontano ricompare più avanti o più indietro.
import { SPECS } from './vehicle.js?v=236';
import { IZ_K } from './carModel.js?v=236';

// corsie (distanza dall'asse della carreggiata, + = sinistra): sorpasso, centrale, marcia normale
export const LANES = [4.75, 1.25, -2.25];
const KMH = 1 / 3.6;

export class Traffic {
  constructor(track, scene, makeModel, kinds, n = 90) {
    this.track = track; this.scene = scene; this.cars = [];
    const L = track.length, rnd = mulberry(11);
    const COLORS = [0xb3121b, 0x121316, 0xefefea, 0xa9aeb5, 0x1f4f9c, 0x2e5d3a, 0x80868e, 0xd9c9a6, 0x5a1f2a, 0x26303a, 0x9fb3c8, 0xf2c200];
    for (let k = 0; k < n; k++) {
      const kind = kinds[k % kinds.length], spec = SPECS[kind];
      const m = makeModel(kind, COLORS[Math.floor(rnd() * COLORS.length)]);
      scene.add(m.root);
      const c = { kind, spec, m, s: k / n * L, lane: 2, d: LANES[2], vDes: 0, v: 0, yaw: 0, x: 0, z: 0, y: 0, laneT: rnd() * 3,
        mass: spec.car.mass, Iz: spec.car.mass * 1.3, wheelR: spec.geom.wheelR, ang: 0, rnd, loose: null, yawOff: 0, idx: 0, ls: 0, ld: 0 };
      this.pickSpeed(c);
      this.cars.push(c);
    }
    // l'altra carreggiata: per ogni punto del giro, il punto più vicino che sta lontano lungo il giro
    const S = track.samples, nS = track.count, k = Math.max(1, Math.round(25 / track.step));
    this.mirror = new Float64Array(nS);
    for (let i = 0; i < nS; i += k) {
      let best = 1e18, bj = 0;
      for (let j = 0; j < nS; j += k) {
        const sep = Math.min(Math.abs(S[j].s - S[i].s), L - Math.abs(S[j].s - S[i].s));
        if (sep < 3000) continue;
        const d = (S[j].x - S[i].x) ** 2 + (S[j].z - S[i].z) ** 2;
        if (d < best) { best = d; bj = j; }
      }
      for (let q = i; q < Math.min(nS, i + k); q++) this.mirror[q] = best < 200 * 200 ? S[bj].s : -1;
    }
    this.init = false;
    this.pr = {};
    this.place(0);
  }

  // velocità desiderata (ognuno la sua) e corsia: i lenti a destra, i veloci partono già al centro o a sinistra
  pickSpeed(c) {
    const r = c.rnd();
    c.vDes = (r < 0.15 ? 78 + r * 60 : r < 0.75 ? 100 + (r - 0.15) * 45 : 128 + (r - 0.75) * 90) * KMH;
    c.v = c.vDes;
    c.lane = c.vDes > 130 * KMH ? (c.rnd() < 0.6 ? 0 : 1) : c.vDes > 112 * KMH ? (c.rnd() < 0.5 ? 1 : 2) : 2;
    c.d = LANES[c.lane];
  }

  dispose() { for (const c of this.cars) this.scene.remove(c.m.root); this.cars = []; }

  // posizione sulla pista: s (lungo il giro) e d (di lato)
  at(s, d, out) {
    const T = this.track, S = T.samples, n = T.count, st = T.step;
    const u = ((s % T.length) + T.length) % T.length / st, i = Math.floor(u) % n, f = u - Math.floor(u), a = S[i], b = S[(i + 1) % n];
    const nx = a.nx + (b.nx - a.nx) * f, nz = a.nz + (b.nz - a.nz) * f;
    out.x = a.x + (b.x - a.x) * f + nx * d; out.z = a.z + (b.z - a.z) * f + nz * d; out.y = a.y + (b.y - a.y) * f;
    out.yaw = Math.atan2(a.tz + (b.tz - a.tz) * f, a.tx + (b.tx - a.tx) * f); out.i = i;
    return out;
  }

  // distanza lungo il giro da a a b (avanti, 0..L)
  ahead(sa, sb) { const L = this.track.length; return ((sb - sa) % L + L) % L; }

  // rimette una macchina vicino a te: davanti o dietro sulla tua carreggiata, o di là dal guard-rail
  near(c, me, first) {
    const L = this.track.length, r = c.rnd, i = Math.floor(me.s / this.track.step) % this.track.count;
    const other = this.mirror[i] >= 0 && r() < 0.42;
    if (other) c.s = ((this.mirror[i] + (r() * 2 - 1) * 1400) % L + L) % L;
    else {
      // all'inizio anche vicine (non addosso); dopo, fuori vista: davanti lontano o dietro
      const lo = first ? 60 : 450;
      c.s = ((me.s + (r() < 0.65 ? lo + 1300 * r() : -(first ? 60 : 300) - 900 * r())) % L + L) % L;
    }
    c.loose = null; c.yawOff = 0;
    this.pickSpeed(c);
    // mai sopra un'altra macchina della stessa corsia
    for (let t = 0; t < 8; t++) {
      const hit = this.cars.some(o => o !== c && !o.loose && Math.abs(o.d - c.d) < 2.4 && Math.min(this.ahead(c.s, o.s), this.ahead(o.s, c.s)) < 22);
      if (!hit) break;
      c.s = (c.s + 37) % L;
    }
  }

  update(dt, phys) {
    const L = this.track.length, cars = this.cars;
    const me = phys ? { s: phys.prCG.s, d: phys.prCG.d, v: phys.speed * Math.sign(phys.vxl || 1), x: phys.x, z: phys.z } : null;
    if (me) {
      if (!this.init) { this.init = true; for (const c of cars) this.near(c, me, true); this.place(0); }
      else for (const c of cars) if ((c.x - me.x) ** 2 + (c.z - me.z) ** 2 > 1800 * 1800) this.near(c, me, false);
    }
    for (const c of cars) {
      if (c.loose) { this.loose(c, dt); continue; }
      // chi c'è davanti nella mia corsia: altre macchine (anche incidentate) e tu
      const lead = this.leader(c, c.d, me);
      const safe = 10 + c.v * 1.3;
      let vT = c.vDes;
      if (lead.gap < safe + 70) vT = Math.min(vT, lead.v + (lead.gap - safe) * 0.4);
      vT = Math.max(0, vT);
      const acc = vT > c.v ? (c.v < 15 ? 2.6 : 1.6) : -Math.min(9, 1 + (c.v - vT) * 1.4);
      c.v = Math.max(0, c.v + Math.sign(vT - c.v) * Math.min(Math.abs(vT - c.v), Math.abs(acc) * dt));
      // cambi di corsia
      const target = LANES[c.lane];
      if (Math.abs(c.d - target) > 0.02) c.d += Math.sign(target - c.d) * Math.min(Math.abs(target - c.d), (0.9 + c.v * 0.012) * dt);
      else if ((c.laneT -= dt) <= 0) {
        c.laneT = 1 + c.rnd() * 2;
        // sorpasso: chi ho davanti va più piano di me -> a sinistra se c'è spazio
        if (lead.gap < safe + 90 && lead.v < c.vDes - 2 && c.lane > 0 && this.free(c, c.lane - 1, me)) c.lane--;
        // rientro: a destra appena c'è spazio e chi c'è là non mi rallenta
        else if (c.lane < 2 && this.free(c, c.lane + 1, me) && this.leader(c, LANES[c.lane + 1], me).gap > safe + 120) c.lane++;
      }
      c.yawOff *= Math.max(0, 1 - dt * 2);
      c.s = (c.s + c.v * dt) % L;
    }
    this.place(dt);
    this.crashes();
    if (phys) this.collide(phys);
  }

  leader(c, d, me) {
    let gap = 1e9, v = 0;
    for (const o of this.cars) {
      if (o === c) continue;
      const od = o.loose ? o.ld : o.d, os = o.loose ? o.ls : o.s;
      if (Math.abs(od - d) > 2.3) continue;
      const g = this.ahead(c.s, os); if (g < gap && g < 600) { gap = g; v = o.loose ? 0 : o.v; }
    }
    if (me && Math.abs(me.d - d) < 2.4) { const g = this.ahead(c.s, me.s); if (g < gap && g < 600) { gap = g; v = Math.max(0, me.v); } }
    return { gap, v };
  }

  free(c, ln, me) {
    const d = LANES[ln], L = this.track.length;
    for (const o of this.cars) {
      if (o === c) continue;
      const od = o.loose ? o.ld : o.d, os = o.loose ? o.ls : o.s;
      if (Math.abs(od - d) > 2.5) continue;
      const g = this.ahead(c.s, os);
      if (g < 35 + Math.max(0, c.v - o.v) * 2 || L - g < 18 + Math.max(0, o.v - c.v) * 2.5) return false;
    }
    if (me && Math.abs(me.d - d) < 2.8) { const g = this.ahead(c.s, me.s); if (g < 40 || L - g < 25 + Math.max(0, me.v - c.v) * 3) return false; }
    return true;
  }

  // macchina urtata: corpo libero che scivola e gira, frenata dall'attrito delle gomme, poi si ferma
  loose(c, dt) {
    const l = c.loose;
    const sp = Math.hypot(l.vx, l.vz);
    const dec = Math.min(sp, (l.t < 0.6 ? 4 : 7.5) * dt);           // subito dopo l'urto scivola, poi le gomme frenano
    if (sp > 1e-4) { l.vx -= l.vx / sp * dec; l.vz -= l.vz / sp * dec; }
    l.w *= Math.max(0, 1 - dt * 1.2);
    c.x += l.vx * dt; c.z += l.vz * dt; c.yaw += l.w * dt; l.t += dt;
    // guard-rail: si resta sulla carreggiata, rimbalzo morbido
    const pr = this.track.project(c.x, c.z, c.idx, this.pr);
    c.idx = pr.i; const sm = this.track.samples[pr.i];
    const lim = (pr.d > 0 ? sm.wallL : sm.wallR) - 0.9;
    if (Math.abs(pr.d) > lim) {
      const sg = Math.sign(pr.d), push = Math.abs(pr.d) - lim, vn = l.vx * sm.nx + l.vz * sm.nz;
      c.x -= sm.nx * push * sg; c.z -= sm.nz * push * sg;
      if (vn * sg > 0) { l.vx -= sm.nx * vn * 1.4; l.vz -= sm.nz * vn * 1.4; l.w += vn * sg * 0.15; }
    }
    c.y = sm.y; c.ls = pr.s; c.ld = pr.d;
    // ferma da un po': si riparte (nel verso giusto, dalla corsia più vicina)
    if (sp < 0.6 && Math.abs(l.w) < 0.2) l.still += dt; else l.still = 0;
    if (l.still > 4) {
      const fwd = Math.atan2(sm.tz, sm.tx);
      c.s = pr.s; c.d = Math.max(LANES[2], Math.min(LANES[0], pr.d));
      c.lane = c.d > 3 ? 0 : c.d > -0.5 ? 1 : 2;
      c.yawOff = ((c.yaw - fwd + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      c.v = 0; c.loose = null;
    }
  }

  place(dt) {
    const p = {};
    for (const c of this.cars) {
      if (!c.loose) { this.at(c.s, c.d, p); c.x = p.x; c.z = p.z; c.y = p.y; c.yaw = p.yaw + c.yawOff; c.idx = p.i; }
      const r = c.m.root;
      r.position.set(c.x, c.y + c.spec.geom.cgHeight + 0.02, c.z);
      r.rotation.set(0, -c.yaw, 0);
      const v = c.loose ? Math.hypot(c.loose.vx, c.loose.vz) * Math.cos(Math.atan2(c.loose.vz, c.loose.vx) - c.yaw) : c.v;
      c.ang -= v / c.wheelR * dt;
      for (const w of c.m.wheels) if (w.spin) w.spin.rotation.z = c.ang;
    }
  }

  // la velocità di una macchina come vettore (in marcia: lungo la corsia)
  vel(c) { return c.loose ? [c.loose.vx, c.loose.vz] : [Math.cos(c.yaw) * c.v, Math.sin(c.yaw) * c.v]; }
  // da marcia a corpo libero (con la velocità che aveva)
  toLoose(c) { if (!c.loose) { const [vx, vz] = this.vel(c); c.loose = { vx, vz, w: 0, t: 0, still: 0 }; c.ls = c.s; c.ld = c.d; } return c.loose; }

  // incidenti a catena: chi è libero urta le altre (un cerchio per macchina, leggero)
  crashes() {
    const cars = this.cars, R = 3.4;
    for (const a of cars) {
      if (!a.loose) continue;
      for (const b of cars) {
        if (b === a) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 > R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        const [avx, avz] = this.vel(a), [bvx, bvz] = this.vel(b);
        const vn = (bvx - avx) * nx + (bvz - avz) * nz;
        if (vn >= -0.3 && d > R * 0.8) continue;           // si sfiorano appena: niente
        const pen = R - d;
        const lb = this.toLoose(b);
        a.x -= nx * pen / 2; a.z -= nz * pen / 2; b.x += nx * pen / 2; b.z += nz * pen / 2;
        if (vn >= 0) continue;
        const j = -1.15 * vn / (1 / a.mass + 1 / b.mass);
        a.loose.vx -= j * nx / a.mass; a.loose.vz -= j * nz / a.mass;
        lb.vx += j * nx / b.mass; lb.vz += j * nz / b.mass;
        const tw = (nx * Math.sin(b.yaw) - nz * Math.cos(b.yaw)) * j / b.Iz * 1.2;
        lb.w += tw; a.loose.w -= tw * 0.5;
      }
    }
  }

  // urti con la tua vettura: cerchi come tra due vetture da gara; la macchina urtata diventa libera
  collide(A) {
    for (const c of this.cars) {
      const dx = c.x - A.x, dz = c.z - A.z;
      if (dx * dx + dz * dz > 64 || Math.abs(A.y - c.y) > 2.5) continue;
      let best = null;
      for (const [ax, ar] of A.spec.circles) for (const [bx, br] of c.spec.circles) {
        const pax = A.x + Math.cos(A.yaw) * ax, paz = A.z + Math.sin(A.yaw) * ax;
        const pbx = c.x + Math.cos(c.yaw) * bx, pbz = c.z + Math.sin(c.yaw) * bx;
        const nx = pbx - pax, nz = pbz - paz, dist = Math.hypot(nx, nz), pen = ar + br - dist;
        if (pen <= 0 || dist < 1e-4) continue;
        if (!best || pen > best.pen) best = { ax, ar, pax, paz, nx: nx / dist, nz: nz / dist, pen };
      }
      if (!best) continue;
      const { ax, ar, pax, paz, nx, nz, pen } = best;
      const corr = Math.min(pen, 0.03 + pen * 0.5);
      const l = this.toLoose(c);
      A.x -= nx * corr * 0.6; A.z -= nz * corr * 0.6; c.x += nx * corr * 0.4; c.z += nz * corr * 0.4;
      const cx = pax + nx * ar, cz = paz + nz * ar, rax = cx - A.x, raz = cz - A.z, rbx = cx - c.x, rbz = cz - c.z;
      const vax = A.vx - A.yawRate * raz, vaz = A.vz + A.yawRate * rax;
      const vbx = l.vx - l.w * rbz, vbz = l.vz + l.w * rbx;
      const vn = (vbx - vax) * nx + (vbz - vaz) * nz;
      if (vn >= 0) continue;
      const impact = -vn, soft = Math.min(1, Math.max(0.25, (impact - 1.5) / 6)), IzA = A.Iz * IZ_K / soft;
      const ran = rax * nz - raz * nx, rbn = rbx * nz - rbz * nx, e = impact < 3 ? 0.08 : 0.2;
      const j = -(1 + e) * vn / (1 / A.mass + 1 / c.mass + ran * ran / IzA + rbn * rbn / c.Iz);
      A.vx -= j * nx / A.mass; A.vz -= j * nz / A.mass; A.yawRate -= j * ran / IzA;
      l.vx += j * nx / c.mass; l.vz += j * nz / c.mass; l.w += j * rbn / c.Iz;
      const side = -(cx - A.x) * Math.sin(A.yaw) + (cz - A.z) * Math.cos(A.yaw);
      const part = ax > 1 ? (side > 0.3 ? 'fwR' : side < -0.3 ? 'fwL' : 'nose') : ax < -1 ? (side > 0.3 ? 'wRR' : side < -0.3 ? 'wRL' : 'rw') : side > 0 ? 'sideR' : 'sideL';
      A.applyContactDamage(part, impact);
      const info = { impact, part: 'car', x: cx, z: cz, y: A.y - 0.2, nx: -nx, nz: -nz, scrape: 0 };
      for (const fn of A.listeners.impact) fn(info);
    }
  }

  // le macchine lontane non si disegnano (nebbia e prestazioni)
  cull(cx, cz, far) {
    for (const c of this.cars) c.m.root.visible = (c.x - cx) ** 2 + (c.z - cz) ** 2 < far * far;
  }
}

function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
