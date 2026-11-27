// Traffico dell'autostrada (guida libera): macchine normali che viaggiano nelle loro corsie.
// Non sono vetture da gara con la fisica completa: scorrono lungo la carreggiata alla loro velocità,
// tengono la distanza da chi hanno davanti (te compreso), ogni tanto cambiano corsia per sorpassare
// e tornano a destra. Se le urti, l'urto è vero per la tua vettura (spinta, danni, rumore).
import * as THREE from 'three';
import { SPECS } from './vehicle.js?v=227';
import { IZ_K } from './carModel.js?v=227';

// corsie (distanza dall'asse della carreggiata, + = sinistra): sorpasso, centrale, marcia normale
export const LANES = [4.75, 1.25, -2.25];
const KMH = 1 / 3.6;
// velocità desiderate per corsia (km/h): a destra si va piano, a sinistra si sorpassa
const LANE_V = [[128, 150], [108, 130], [88, 112]];

export class Traffic {
  // makeModel(kind, color) -> modello (createGT); kinds: vetture che girano
  constructor(track, scene, makeModel, kinds, n = 34) {
    this.track = track; this.scene = scene; this.cars = [];
    const L = track.length, rnd = mulberry(11);
    const COLORS = [0xb3121b, 0x121316, 0xefefea, 0xa9aeb5, 0x1f4f9c, 0x2e5d3a, 0x80868e, 0xd9c9a6, 0x5a1f2a, 0x26303a];
    for (let k = 0; k < n; k++) {
      const kind = kinds[k % kinds.length], spec = SPECS[kind];
      const lane = rnd() < 0.5 ? 2 : rnd() < 0.7 ? 1 : 0;
      const [a, b] = LANE_V[lane], vDes = (a + (b - a) * rnd()) * KMH;
      const m = makeModel(kind, COLORS[Math.floor(rnd() * COLORS.length)]);
      scene.add(m.root);
      this.cars.push({ kind, spec, m, s: (k + rnd() * 0.6) / n * L, lane, d: LANES[lane], vDes, v: vDes, yaw: 0, x: 0, z: 0, y: 0,
        laneT: 2 + rnd() * 6, home: lane, mass: spec.car.mass, wheelR: spec.geom.wheelR, ang: 0, rnd });
    }
    // l'altra carreggiata: per ogni punto del giro, il punto più vicino che sta lontano lungo il giro
    // (serve a far comparire macchine anche dall'altra parte del guard-rail, vicino a te)
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
    this.place(0);
  }

  // rimette una macchina vicino a te: davanti o dietro sulla tua carreggiata, o di là dal guard-rail
  near(c, me) {
    const L = this.track.length, r = c.rnd, i = Math.floor(me.s / this.track.step) % this.track.count;
    const other = this.mirror[i] >= 0 && r() < 0.45;
    if (other) c.s = ((this.mirror[i] + (r() * 2 - 1) * 1300) % L + L) % L;
    else c.s = ((me.s + (r() < 0.7 ? 350 + 1200 * r() : -(250 + 800 * r()))) % L + L) % L;
    c.lane = c.home; c.d = LANES[c.lane]; c.v = c.vDes;
  }

  dispose() { for (const c of this.cars) this.scene.remove(c.m.root); this.cars = []; }

  // posizione sulla pista: s (lungo il giro) e d (di lato)
  at(s, d, out) {
    const T = this.track, S = T.samples, n = T.count, st = T.step;
    const u = ((s % T.length) + T.length) % T.length / st, i = Math.floor(u) % n, f = u - Math.floor(u), a = S[i], b = S[(i + 1) % n];
    const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, y = a.y + (b.y - a.y) * f;
    const nx = a.nx + (b.nx - a.nx) * f, nz = a.nz + (b.nz - a.nz) * f;
    out.x = x + nx * d; out.z = z + nz * d; out.y = y; out.yaw = Math.atan2(a.tz + (b.tz - a.tz) * f, a.tx + (b.tx - a.tx) * f);
    return out;
  }

  // distanza lungo il giro da a a b (avanti, 0..L)
  ahead(sa, sb) { const L = this.track.length; return ((sb - sa) % L + L) % L; }

  update(dt, phys) {
    const L = this.track.length, cars = this.cars;
    // tu sulla carreggiata: posizione lungo il giro e di lato, velocità
    const me = phys ? { s: phys.prCG.s, d: phys.prCG.d, v: phys.speed, x: phys.x, z: phys.z } : null;
    if (me) {
      // all'inizio tutte vicino a te; poi chi resta troppo lontano ricompare più avanti o più indietro
      if (!this.init) { this.init = true; for (const c of cars) this.near(c, me); this.place(0); }
      else for (const c of cars) if ((c.x - me.x) ** 2 + (c.z - me.z) ** 2 > 1900 * 1900) this.near(c, me);
    }
    for (const c of cars) {
      // chi c'è davanti nella mia corsia (anche tu, se sei lì)
      let gap = 1e9, vLead = 0;
      const inLane = d => Math.abs(d - c.d) < 2.2;
      for (const o of cars) if (o !== c && inLane(o.d)) { const g = this.ahead(c.s, o.s); if (g < gap) { gap = g; vLead = o.v; } }
      if (me && inLane(me.d)) { const g = this.ahead(c.s, me.s); if (g < gap && g < 400) { gap = g; vLead = me.v; } }
      // velocità: quella desiderata, ma dietro a uno più lento si accoda (distanza di sicurezza ~1,5 s)
      const safe = 12 + c.v * 1.4;
      let vT = c.vDes;
      if (gap < safe + 60) vT = Math.min(vT, vLead + (gap - safe) * 0.35);
      vT = Math.max(0, vT);
      const acc = vT > c.v ? 1.8 : -Math.min(8, 1 + (c.v - vT) * 1.2);
      c.v = Math.max(0, c.v + Math.sign(vT - c.v) * Math.min(Math.abs(vT - c.v), Math.abs(acc) * dt));
      // cambi di corsia: a sinistra per sorpassare chi va piano, poi si torna a destra
      c.laneT -= dt;
      const target = LANES[c.lane];
      if (Math.abs(c.d - target) > 0.01) c.d += Math.sign(target - c.d) * Math.min(Math.abs(target - c.d), 1.1 * dt);
      else if (c.laneT <= 0) {
        c.laneT = 3 + c.rnd() * 5;
        const free = ln => {
          const d = LANES[ln];
          for (const o of cars) if (o !== c && Math.abs(o.d - d) < 2.4) { const g = this.ahead(c.s, o.s); if (g < 45 || L - g < 30) return false; }
          if (me && Math.abs(me.d - d) < 2.6) { const g = this.ahead(c.s, me.s); if (g < 45 || L - g < 40) return false; }
          return true;
        };
        if (gap < safe + 40 && vLead < c.vDes - 3 && c.lane > 0 && free(c.lane - 1)) c.lane--;
        else if (c.lane < c.home && free(c.lane + 1)) c.lane++;
      }
      c.s = (c.s + c.v * dt) % L;
    }
    this.place(dt);
    if (phys) this.collide(phys);
  }

  place(dt) {
    const p = {};
    for (const c of this.cars) {
      this.at(c.s, c.d, p);
      c.x = p.x; c.z = p.z; c.y = p.y; c.yaw = p.yaw;
      const r = c.m.root;
      r.position.set(p.x, p.y + c.spec.geom.cgHeight + 0.02, p.z);
      r.rotation.set(0, -p.yaw, 0);
      c.ang -= c.v / c.wheelR * dt;
      for (const w of c.m.wheels) if (w.spin) w.spin.rotation.z = c.ang;
    }
  }

  // urti con la tua vettura: come tra due vetture (cerchi), il traffico pesa come una macchina vera
  // ma resta nella sua corsia (perde solo un po' di velocità)
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
      A.x -= nx * Math.min(pen, 0.03 + pen * 0.6); A.z -= nz * Math.min(pen, 0.03 + pen * 0.6);
      const cx = pax + nx * ar, cz = paz + nz * ar, rax = cx - A.x, raz = cz - A.z;
      const vbx = Math.cos(c.yaw) * c.v, vbz = Math.sin(c.yaw) * c.v;
      const vax = A.vx - A.yawRate * raz, vaz = A.vz + A.yawRate * rax;
      const vn = (vbx - vax) * nx + (vbz - vaz) * nz;
      if (vn >= 0) continue;
      const impact = -vn, soft = Math.min(1, Math.max(0.25, (impact - 1.5) / 6)), IzA = A.Iz * IZ_K / soft;
      const ran = rax * nz - raz * nx, e = impact < 3 ? 0.05 : 0.15;
      const j = -(1 + e) * vn / (1 / A.mass + 1 / c.mass + ran * ran / IzA);
      A.vx -= j * nx / A.mass; A.vz -= j * nz / A.mass; A.yawRate -= j * ran / IzA;
      // il traffico rallenta (o accelera) lungo la sua corsia
      const dvb = j / c.mass * (nx * Math.cos(c.yaw) + nz * Math.sin(c.yaw));
      c.v = Math.max(0, c.v + dvb);
      const side = -(cx - A.x) * Math.sin(A.yaw) + (cz - A.z) * Math.cos(A.yaw);
      const part = ax > 1 ? (side > 0.3 ? 'fwR' : side < -0.3 ? 'fwL' : 'nose') : ax < -1 ? (side > 0.3 ? 'wRR' : side < -0.3 ? 'wRL' : 'rw') : side > 0 ? 'sideR' : 'sideL';
      A.applyContactDamage(part, impact);
      const info = { impact, part: 'car', x: cx, z: cz, y: A.y - 0.2, nx: -nx, nz: -nz, scrape: 0 };
      for (const fn of A.listeners.impact) fn(info);
    }
  }
}

function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
void THREE;
