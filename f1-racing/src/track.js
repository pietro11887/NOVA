import * as THREE from 'three';
import { buildTrack, KERB_WIDTH as K, TRACK, sponsorAt } from './trackData.js';
import * as tex from './textures.js';
import { texSet, triplanar } from './pbr.js';

// ammaccature delle barriere morbide: [x, z, profondità, raggio] e [direzione verso l'esterno x, z, quota dell'urto]
export const DENTS = { a: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) }, d: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) }, next: 0 };

export const SURF = { ROAD: 0, KERB: 1, SAUSAGE: 2, GRASS: 3, GRAVEL: 4 };
// aderenza e resistenza al rotolamento (in g) per superficie
export const SURF_PROPS = [
  { grip: 1.0, roll: 0.012 },
  { grip: 0.92, roll: 0.02 },
  { grip: 0.7, roll: 0.05 },
  { grip: 0.55, roll: 0.09 },
  { grip: 0.42, roll: 0.45 },
];

export class Track {
  constructor() {
    const t = buildTrack();
    this.samples = t.samples;
    this.length = t.length;
    this.pit = t.pit;
    this.step = t.step;
    this.count = t.count;
    this.sectorIdx = [0, Math.round(this.count / 3), Math.round(2 * this.count / 3)];
    this.street = !!TRACK.street;
    this.name = TRACK.name;
    this.group = new THREE.Group();
  }

  // ---------- query ----------

  // Proiezione di un punto sul tracciato. hint = indice di partenza per la ricerca locale.
  project(x, z, hint = -1, out = {}, win = 40) {
    const S = this.samples, n = this.count;
    let best = -1, bestD = Infinity;
    if (hint < 0) {
      for (let i = 0; i < n; i++) {
        const dx = S[i].x - x, dz = S[i].z - z, d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    } else {
      for (let j = -win; j <= win; j++) {
        const i = (hint + j + n) % n;
        const dx = S[i].x - x, dz = S[i].z - z, d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    // raffinamento sul segmento: la normale viene interpolata lungo il segmento, così ascissa,
    // quota e distanza dal centro sono continue anche in curva (niente scalini tra un campione e
    // l'altro sotto le ruote)
    const a = S[best];
    let along = (x - a.x) * a.tx + (z - a.z) * a.tz;
    let i0 = along < 0 ? (best - 1 + n) % n : best, f = 0, p, q, sx, sz, sl2, nx, nz, nl;
    for (let pass = 0; pass < 3; pass++) {
      p = S[i0]; q = S[(i0 + 1) % n];
      sx = q.x - p.x; sz = q.z - p.z; sl2 = sx * sx + sz * sz;
      f = ((x - p.x) * sx + (z - p.z) * sz) / sl2;
      for (let it = 0; it < 3; it++) {
        const ff = Math.max(-0.5, Math.min(1.5, f));
        nx = p.nx + (q.nx - p.nx) * ff; nz = p.nz + (q.nz - p.nz) * ff; nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
        const d = (x - p.x - sx * ff) * nx + (z - p.z - sz * ff) * nz;
        f = ((x - d * nx - p.x) * sx + (z - d * nz - p.z) * sz) / sl2;
      }
      if (f > 1 && pass < 2) i0 = (i0 + 1) % n;
      else if (f < 0 && pass < 2) i0 = (i0 - 1 + n) % n;
      else break;
    }
    f = Math.max(0, Math.min(1, f));
    p = S[i0]; q = S[(i0 + 1) % n]; sx = q.x - p.x; sz = q.z - p.z;
    const cx = p.x + sx * f, cz = p.z + sz * f;
    nx = p.nx + (q.nx - p.nx) * f; nz = p.nz + (q.nz - p.nz) * f;
    nl = Math.hypot(nx, nz);
    out.i = best;
    out.i0 = i0;
    out.f = f;
    out.s = (i0 + f) * this.step;
    out.d = ((x - cx) * nx + (z - cz) * nz) / nl;  // >0 = sinistra
    out.y = p.y + (q.y - p.y) * f;
    out.nx = nx / nl; out.nz = nz / nl;
    out.tx = p.tx; out.tz = p.tz;
    out.slope = p.slope;
    return out;
  }

  // Altezza e tipo di superficie a distanza laterale d al campione i.
  // Piste da modello 3D: l'altezza viene dal profilo trasversale vero della superficie.
  surface(pr, out = {}) {
    this.surfaceType(pr, out);
    const S = this.samples, p = S[pr.i0 ?? pr.i];
    if (p.prof) {
      const q = S[((pr.i0 ?? pr.i) + 1) % S.length], f = pr.f || 0;
      const [o0, st] = TRACK.profOff, m = p.prof.length - 1;
      // il profilo vale sulla carreggiata; oltre il bordo prosegue dal valore del bordo, a cui si
      // sommano i dislivelli di cordoli, erba e ghiaia del gioco (niente rampe sugli argini)
      const dd = Math.max(-((p.hwR ?? p.hw) - 0.3), Math.min((p.hwL ?? p.hw) - 0.3, pr.d));
      const u = Math.max(0, Math.min(m, (dd - o0) / st)), k = Math.min(m - 1, Math.floor(u)), t = u - k;
      const hp = p.prof[k] + (p.prof[k + 1] - p.prof[k]) * t, hq = q.prof[k] + (q.prof[k + 1] - q.prof[k]) * t;
      out.h += hp + (hq - hp) * f;
      // fuori dalla pista: il terreno vero del modello (prato in salita o in discesa, vie di fuga),
      // raccordato al bordo in 3 m così non ci sono scalini
      if (p.gnd) {
        const ad = Math.abs(pr.d), H = (pr.d > 0 ? p.hwL : p.hwR) ?? p.hw;
        const edge = H + ((pr.d > 0 ? p.kerbL : p.kerbR) ? K : 0) + 0.6;
        if (ad > edge) {
          const [g0, gs] = TRACK.gndOff, gm = p.gnd.length - 1;
          // all'interno di una curva stretta i dati laterali di campioni vicini si incrociano:
          // oltre ~0.8 R si tiene il valore lì
          const inner = p.curv * pr.d < 0, R = 1 / Math.max(1e-4, Math.abs(p.curv));
          const dg = inner ? Math.sign(pr.d) * Math.min(ad, Math.max(edge, 0.8 * R)) : pr.d;
          const ug = Math.max(0, Math.min(gm, (dg - g0) / gs)), kg = Math.min(gm - 1, Math.floor(ug)), tg = ug - kg;
          const ga = p.gnd[kg] + (p.gnd[kg + 1] - p.gnd[kg]) * tg, gb = q.gnd[kg] + (q.gnd[kg + 1] - q.gnd[kg]) * tg;
          let gh = ga + (gb - ga) * f + (out.type === SURF.GRAVEL ? -0.04 : 0);
          // mai pendenze brusche rispetto al bordo pista (niente trampolini)
          const lim = 0.1 + 0.22 * (ad - edge);
          gh = Math.max(out.h - lim, Math.min(out.h + lim, gh));
          const t = Math.min(1, (ad - edge) / 3), w = t * t * (3 - 2 * t);
          out.h += (gh - out.h) * w;
        }
      }
    }
    return out;
  }

  surfaceType(pr, out = {}) {
    const s = this.samples[pr.i];
    const d = pr.d, ad = Math.abs(d);
    const left = d > 0;
    out.h = 0; out.type = SURF.ROAD;
    out.wall = left ? s.wallL : s.wallR;
    const hasKerb = left ? s.kerbL : s.kerbR;
    const H = (left ? s.hwL : s.hwR) ?? s.hw;          // piste da modello: bordi diversi per lato
    if (ad <= H + (hasKerb ? 0 : 0.6)) return out;
    if (hasKerb && ad <= H + K) {
      const u = (ad - H) / K;
      // profilo liscio: le nervature del cordolo sono rese come vibrazione (grafica, audio)
      out.h = 0.045 * Math.min(1, u * 1.6);
      out.type = SURF.KERB;
      return out;
    }
    const saus = left ? s.sausageL : s.sausageR;
    if (saus && ad > H + K && ad < H + K + 0.7) {
      const u = (ad - H - K) / 0.7;
      out.h = 0.11 * Math.sin(u * Math.PI);
      out.type = SURF.SAUSAGE;
      return out;
    }
    // in città oltre il bordo c'è asfalto (vie di fuga, marciapiede ribassato); così anche le vie
    // di fuga asfaltate delle piste moderne
    if (this.street || (left ? s.pavedL : s.pavedR)) { out.h = -0.01; return out; }
    const gravel = left ? s.gravelL : s.gravelR;
    const edge = H + (hasKerb ? K : 0);
    out.h = -Math.min(0.08, (ad - edge) * 0.03);
    if (gravel && ad > H + K + 4) { out.type = SURF.GRAVEL; out.h -= 0.04; return out; }
    out.type = SURF.GRASS;
    out.h += 0.02 * Math.sin(pr.s * 0.45);
    return out;
  }

  // ---------- mesh ----------

  build(renderer) {
    // pista da modello 3D: asfalto, cordoli, muri e dintorni sono già nel modello (sceneryModel.js)
    if (TRACK.model) return this.group;
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const S = this.samples, n = this.count;
    const g = this.group;

    // Asfalto
    const asphalt = tex.asphalt(); asphalt.anisotropy = aniso;
    const E = (sd, off) => s => sd * s.hw + off;      // distanza dal centro relativa al bordo
    // asfalto a grana fine in coordinate del mondo (niente ripetizioni visibili), con macchie larghe
    // e un filo di lucentezza: col sole basso l'asfalto brilla controluce come in TV
    const fine = tex.trackAsphalt(); fine.anisotropy = aniso;
    const asphMat = new THREE.MeshStandardMaterial({ map: fine, roughness: 0.74, metalness: 0, color: this.street ? 0xd9d3cb : 0xffffff });
    // materiali fotografici: Baku e le piste disegnate (le piste da modello 3D hanno già i loro)
    this.hq = this.quality !== 'low' && !TRACK.model;
    const photo = this.hq ? texSet('asphalt') : null;
    asphMat.onBeforeCompile = sh => {
      if (photo) Object.assign(sh.uniforms, { pAc: { value: photo.c }, pAn: { value: photo.n }, pAr: { value: photo.r }, pAavg: { value: photo.avg } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;' + (photo ? '\nuniform sampler2D pAc, pAn, pAr; uniform vec3 pAavg;' : ''))
        .replace('#include <map_fragment>', `
          vec4 aTex = texture2D(map, vWPos.xz * 0.11);
          float big = texture2D(map, vWPos.xz * 0.013 + 0.37).r;
          diffuseColor *= aTex * (0.82 + 0.55 * big);` + (photo ? `
          // foto dell'asfalto da gara: grana, inerti, toppe
          vec2 pq = vWPos.xz * 0.25;
          diffuseColor.rgb *= clamp(mix(vec3(1.0), texture2D(pAc, pq).rgb / pAavg, 0.6), 0.0, 2.0);` : ''))
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + (photo ? `
          { vec3 t = texture2D(pAn, pq).xyz * 2.0 - 1.0; t.xy *= 1.4;
            vec3 wn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
            vec3 T = normalize(cross(wn, vec3(0.0, 0.0, 1.0))), B = cross(T, wn);
            normal = normalize((viewMatrix * vec4(normalize(T * t.x + B * t.y + wn * t.z), 0.0)).xyz); }` : ''))
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + (texture2D(map, vWPos.xz * 0.031 + 0.71).r - 0.33) * 0.6, ${this.street && this.tod === 'sunset' ? '0.3, 0.85' : '0.5, 0.95'});` + (photo ? `
          roughnessFactor = clamp(roughnessFactor * (0.6 + 0.6 * texture2D(pAr, pq).g), 0.25, 0.95);` : ''));
    };
    // Baku: asfalto cittadino più liscio e lucido, riflette sole e palazzi controluce
    if (this.street) { asphMat.roughness = 0.6; asphMat.envMapIntensity = 1.6; }
    // asfalto come in F1 25: grigio chiaro e opaco (di giorno non deve sembrare blu né bagnato)
    if (this.hq && this.tod !== 'sunset') { asphMat.color.setRGB(1.5, 1.47, 1.42); asphMat.roughness = 0.85; asphMat.envMapIntensity = 0.55; }
    void asphalt;
    g.add(this.ribbon([[E(-1, -0.6), 0.0], [E(1, 0.6), 0.0]], null, asphMat, 10, true));
    // linee bianche di bordo pista
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.7 });
    g.add(this.ribbon([[E(1, -0.55), 0.012], [E(1, -0.05), 0.012]], null, white));
    g.add(this.ribbon([[E(-1, 0.05), 0.012], [E(-1, 0.55), 0.012]], null, white));
    // fascia d'erba più scura lungo il bordo pista (come nelle riprese TV)
    if (!this.street) {
      const darkGrass = new THREE.MeshStandardMaterial({ color: 0x3f8a36, roughness: 1 });
      if (this.hq) { darkGrass.color.set(0x3a7433); triplanar(darkGrass, 'grass', { scale: 3, strength: 0.75, normal: 0.8 }); }
      g.add(this.ribbon([[E(1, 0.6), 0.0], [E(1, 4.5), -0.03]], i => !S[i].kerbL && !S[i].gravelL, darkGrass, 4));
      g.add(this.ribbon([[E(-1, -4.5), -0.03], [E(-1, -0.6), 0.0]], i => !S[i].kerbR && !S[i].gravelR, darkGrass, 4));
    }

    // Cordoli
    const kt = tex.kerb(); kt.anisotropy = aniso;
    const kerbMat = new THREE.MeshStandardMaterial({ map: kt, roughness: 0.6 });
    const prof = [[0, 0.006], [0.35, 0.05], [K, 0.07]];
    g.add(this.ribbon(prof.map(([u, h]) => [E(1, u), h]), i => S[i].kerbL, kerbMat, 3.6));
    g.add(this.ribbon(prof.map(([u, h]) => [E(-1, -u), h]).reverse(), i => S[i].kerbR, kerbMat, 3.6));
    // cordoli a salsiccia (gialli)
    const sausMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });
    const sp = []; for (let k = 0; k <= 6; k++) sp.push([K + 0.7 * k / 6, 0.11 * Math.sin(Math.PI * k / 6)]);
    g.add(this.ribbon(sp.map(([u, h]) => [E(1, u), h]), i => S[i].sausageL, sausMat));
    g.add(this.ribbon(sp.map(([u, h]) => [E(-1, -u), h]).reverse(), i => S[i].sausageR, sausMat));

    // Erba vicino alla pista e ghiaia
    const grassT = tex.grass(); grassT.anisotropy = aniso;
    const grassMat = this.street
      ? new THREE.MeshStandardMaterial({ map: asphalt, color: 0x9a9da3, roughness: 0.95 })    // città: asfalto delle vie di fuga
      : new THREE.MeshStandardMaterial({ map: grassT, roughness: 1 });
    const gravT = tex.gravel(); gravT.anisotropy = aniso;
    const gravMat = new THREE.MeshStandardMaterial({ map: gravT, roughness: 1 });
    // erba e ghiaia fotografiche
    if (this.hq && !this.street) { grassMat.color.set(0xb4bfa4); triplanar(grassMat, 'grass', { scale: 3, strength: 0.75, normal: 0.8 }); triplanar(gravMat, 'gravel', { scale: 1.6, strength: 0.85, normal: 1.2 }); }
    // lato sinistro: da bordo pista al muro
    g.add(this.sideRibbon(1, grassMat, gravMat));
    g.add(this.sideRibbon(-1, grassMat, gravMat));

    // Muri + recinzioni
    g.add(this.walls(1, aniso));
    g.add(this.walls(-1, aniso));

    // Linea di partenza a scacchi, griglia e scritte settori
    this.decorations(aniso);
    return g;
  }

  // Nastro lungo il tracciato. prof = [[d, h], ...] da destra a sinistra (d crescente).
  ribbon(prof, mask, mat, vScale = 4, receive = true) {
    const S = this.samples, n = this.count;
    const pos = [], uv = [], idx = [];
    const m = prof.length;
    let runStart = -1;
    const addRow = (i) => {
      const s = S[i];
      for (let k = 0; k < m; k++) {
        const [d0, h] = prof[k];
        const d = typeof d0 === 'function' ? d0(s) : d0;
        pos.push(s.x + s.nx * d, s.y + h + 0.02, s.z + s.nz * d);
        uv.push(k / (m - 1), s.s / vScale);
      }
    };
    let rows = 0;
    const closeRun = () => { rows = 0; };
    // costruiamo per righe consecutive, spezzando dove la maschera è falsa
    let prevRowIdx = -1;
    for (let ii = 0; ii <= n; ii++) {
      const i = ii % n;
      const on = !mask || mask(i);
      if (!on) { prevRowIdx = -1; continue; }
      const rowIdx = pos.length / 3 / m;
      addRow(i);
      if (ii === n) { uv.splice(uv.length - 2 * m, 2 * m); for (let k = 0; k < m; k++) uv.push(k / (m - 1), this.length / vScale); }
      if (prevRowIdx >= 0) {
        for (let k = 0; k < m - 1; k++) {
          const a = prevRowIdx * m + k, b = a + 1, c = rowIdx * m + k, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
      prevRowIdx = rowIdx;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = receive;
    return mesh;
  }

  // fascia laterale: erba (o ghiaia) dal bordo pista al muro
  sideRibbon(side, grassMat, gravMat) {
    const S = this.samples, n = this.count;
    const grp = new THREE.Group();
    const build = (isGravel) => {
      const pos = [], uv = [], idx = [];
      let prev = -1;
      for (let ii = 0; ii <= n; ii++) {
        const i = ii % n, s = S[i];
        const gravel = side > 0 ? s.gravelL : s.gravelR;
        const wall = isGravel ? (side > 0 ? s.wallL : s.wallR) : (side > 0 ? s.wallLVis ?? s.wallL : s.wallRVis ?? s.wallR);
        const kerb = side > 0 ? s.kerbL : s.kerbR;
        const edge = s.hw + (kerb ? K : 0.6);
        const gStart = s.hw + K + 4;
        let d0, d1;
        if (isGravel) { if (!gravel) { prev = -1; continue; } d0 = gStart; d1 = wall; }
        else { d0 = edge; d1 = gravel ? gStart : wall; }
        const steps = 4;
        const row = pos.length / 3 / (steps + 1);
        for (let k = 0; k <= steps; k++) {
          const d = d0 + (d1 - d0) * k / steps;
          const h = -Math.min(0.08, (d - edge) * 0.03) - (isGravel ? 0.04 : 0);
          pos.push(s.x + s.nx * d * side, s.y + h + 0.02, s.z + s.nz * d * side);
          uv.push(d / 6, s.s / 6);
        }
        if (prev >= 0) for (let k = 0; k < steps; k++) {
          const a = prev * (steps + 1) + k, b = a + 1, c = row * (steps + 1) + k, e = c + 1;
          if (side > 0) idx.push(a, c, b, b, c, e); else idx.push(a, b, c, b, e, c);
        }
        prev = row;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, isGravel ? gravMat : grassMat);
      m.receiveShadow = true;
      return m;
    };
    grp.add(build(false));
    grp.add(build(true));
    return grp;
  }

  walls(side, aniso) {
    const S = this.samples, n = this.count;
    const grp = new THREE.Group();
    const barrierT = tex.barrier(); barrierT.anisotropy = aniso;
    const tyreT = tex.tyreWall(); tyreT.anisotropy = aniso;
    const fenceT = tex.fence(); fenceT.anisotropy = aniso;
    // sub: suddivisioni tra due campioni, hr: righe in altezza (le barriere morbide ne hanno tante per potersi ammaccare)
    const make = (h0, h1, mat, vs, mask, extrude = 0, pitWall = false, flip = 1, sub = 1, hr = 1) => {
      const pos = [], uv = [], idx = [];
      let prev = -1, last = null;
      const W = hr + 1;
      const put = (x, y, z, ss) => {
        const row = pos.length / (3 * W);
        for (let r = 0; r <= hr; r++) { const t = r / hr; pos.push(x, y + h0 + (h1 - h0) * t, z); uv.push(flip * ss / vs, t); }
        if (prev >= 0) for (let r = 0; r < hr; r++) {
          const a = prev * W + r, b = a + 1, c = row * W + r, d = c + 1;
          if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
        }
        prev = row;
      };
      for (let ii = 0; ii <= n; ii++) {
        const i = ii % n, s = S[i];
        if (mask && !mask(s)) { prev = -1; last = null; continue; }
        const w = (pitWall ? (side > 0 ? s.wallL : s.wallR) : (side > 0 ? s.wallLVis ?? s.wallL : s.wallRVis ?? s.wallR)) + extrude;
        const x = s.x + s.nx * w * side, z = s.z + s.nz * w * side;
        // ss: distanza continua anche a cavallo del traguardo
        const ss = ii === n ? s.s + this.length : s.s;
        if (last && sub > 1) for (let k = 1; k < sub; k++) { const t = k / sub; put(last[0] + (x - last[0]) * t, last[1] + (s.y - last[1]) * t, last[2] + (z - last[2]) * t, last[3] + (ss - last[3]) * t); }
        put(x, s.y, z, ss);
        last = [x, s.y, z, ss];
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      return m;
    };
    const isTyre = s => (side > 0 ? s.gravelL || s.escL : s.gravelR || s.escR);
    const shared = s => (side > 0 ? s.sharedL : s.sharedR);
    const barrierMat = new THREE.MeshStandardMaterial({ map: barrierT, roughness: 0.7, side: THREE.DoubleSide });
    const tyreMat = new THREE.MeshStandardMaterial({ map: this.street ? tecPro() : tyreT, roughness: this.street ? 0.55 : 0.9, side: THREE.DoubleSide });
    // barriere morbide: si ammaccano dove le colpisci (e restano così)
    tyreMat.onBeforeCompile = sh => {
      sh.uniforms.uDentA = DENTS.a; sh.uniforms.uDentD = DENTS.d;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 uDentA[12]; uniform vec4 uDentD[12]; varying float vDent;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vDent = 0.0;
          { vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
            for (int k = 0; k < 12; k++) {
              vec4 A = uDentA[k];
              if (A.z <= 0.0) continue;
              vec2 dd = wp.xz - A.xy;
              float f = exp(-dot(dd, dd) / (A.w * A.w));
              // più ammaccata all'altezza dell'urto, quasi ferma alla base
              float ry = wp.y - uDentD[k].z;
              float hy = smoothstep(-1.4, 0.1, ry) * (1.0 - 0.35 * smoothstep(0.4, 1.1, ry));
              vec2 push = uDentD[k].xy * A.z * f * hy;
              transformed.x += push.x; transformed.z += push.y;
              transformed.y -= A.z * f * 0.12 * hy;
              // blocchi schiacciati e spostati: pieghe irregolari
              transformed.xz += uDentD[k].xy * A.z * f * hy * 0.35 * sin(wp.x * 3.1 + wp.z * 2.7);
              vDent = max(vDent, A.z * f * hy);
            } }`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDent;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 1.0 - min(0.5, vDent * 0.8);');
    };
    const hiQ = this.hq;
    // muri in cemento veri: grana, rilievo e sporco (anche sotto gli sponsor)
    if (hiQ) triplanar(barrierMat, 'concrete', { scale: 2, strength: 0.55, normal: 0.8 });
    if (this.street) {
      // città: muri rivestiti con gli sponsor (pannelli da 6 m), leggibili dalla pista;
      // lo spartitraffico tra due carreggiate resta bianco (si vede da entrambi i lati)
      const median = s => (side > 0 ? s.clearL : s.clearR) < 2 * s.hw + 8;
      const keys = new Set(S.map(q => sponsorAt(q.s, side)).filter(Boolean));
      for (const key of keys) {
        const spT = tex.sponsorWall(key); spT.anisotropy = aniso;
        const spMat = new THREE.MeshStandardMaterial({ map: spT, roughness: 0.6, side: THREE.DoubleSide });
        if (hiQ) triplanar(spMat, 'concrete', { scale: 2, strength: 0.25, normal: 0.5 });
        grp.add(make(-1.5, 1.05, spMat, 6, s => sponsorAt(s.s, side) === key && !isTyre(s) && !shared(s) && !median(s), 0, false, side > 0 ? 1 : -1));
      }
      grp.add(make(-1.5, 1.05, barrierMat, 4, s => !sponsorAt(s.s, side) && !isTyre(s) && !shared(s) && !median(s)));
      grp.add(make(-1.5, 1.05, barrierMat, 4, s => !isTyre(s) && !shared(s) && median(s)));
    } else grp.add(make(-1.5, 1.05, barrierMat, 4, s => !isTyre(s) && !shared(s)));
    grp.add(make(-1.5, 1.1, tyreMat, 2.2, s => isTyre(s) && !shared(s), 0, false, 1, 4, 8));
    const fenceMat = new THREE.MeshStandardMaterial({ map: fenceT, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 });
    grp.add(make(1.05, 4.2, fenceMat, 3, s => !shared(s), 0.6));
    // muretto box tra pista e corsia box (dal lato dei box)
    if (side === (TRACK.pit.side || -1)) {
      const pwT = TRACK.pitWallBrand ? tex.sponsorWall(TRACK.pitWallBrand) : null;
      const pitWallMat = pwT ? new THREE.MeshStandardMaterial({ map: pwT, roughness: 0.6, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.8, side: THREE.DoubleSide });
      grp.add(make(-1.5, 1.0, pitWallMat, pwT ? 6 : 4, s => s.pitWall, 0, true));
      grp.add(make(1.0, 2.6, fenceMat, 3, s => s.pitWall, 0, true));
    }
    return grp;
  }

  decorations(aniso) {
    const S = this.samples, n = this.count;
    const g = this.group;
    // Linea del traguardo
    const chk = tex.checker(); chk.anisotropy = aniso;
    const s0 = S[0];
    const line = new THREE.Mesh(new THREE.PlaneGeometry(2.4, s0.hw * 2), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.7 }));
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = Math.atan2(-s0.tz, s0.tx);
    line.position.set(s0.x, s0.y + 0.035, s0.z);
    line.receiveShadow = true;
    g.add(line);

    // Piazzole della griglia
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 });
    for (let k = 0; k < 10; k++) {
      const back = 10 + k * 8;
      const i = (n - Math.round(back / this.step)) % n;
      const s = S[i];
      const lat = (k % 2 === 0 ? 1 : -1) * 3.4;
      const grp = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 2.6), white);
      bar.rotation.x = -Math.PI / 2; grp.add(bar);
      for (const off of [-1.2, 1.2]) {
        const leg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.25), white);
        leg.rotation.x = -Math.PI / 2; leg.position.set(-0.55, 0, off); grp.add(leg);
      }
      grp.position.set(s.x + s.nx * lat, s.y + 0.03, s.z + s.nz * lat);
      grp.rotation.y = -Math.atan2(s.tz, s.tx);
      grp.traverse(o => { o.receiveShadow = true; });
      g.add(grp);
    }

    // Scritte "SECTOR" sull'asfalto
    [1, 2, 3].forEach((num, k) => {
      const i = (this.sectorIdx[k] + 8) % n, s = S[i];
      const t = tex.text(`SECTOR ${num}`, '#e0322d', 512, 96, 'bold 70px "Titillium Web", Arial, sans-serif');
      t.anisotropy = aniso;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.7), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, depthWrite: false }));
      m.rotation.order = 'YXZ';
      m.rotation.y = -Math.atan2(s.tz, s.tx) + Math.PI / 2;
      m.rotation.x = -Math.PI / 2;
      m.position.set(s.x, s.y + 0.035, s.z);
      m.receiveShadow = true;
      g.add(m);
    });

    // Cartelli di frenata 300/200/100 prima delle curve lente
    const boardMat = {};
    for (let i = 0; i < n; i++) {
      const a = Math.abs(S[i].curv), prevA = Math.abs(S[(i - 1 + n) % n].curv);
      if (a > 0.012 && prevA <= 0.012) {
        // controlla che ci sia un rettilineo prima
        let straight = true;
        for (let j = 60; j < 160; j++) if (Math.abs(S[(i - j + n) % n].curv) > 0.006) { straight = false; break; }
        if (!straight) continue;
        const outer = S[i].curv > 0 ? 1 : -1; // curva a destra: cartelli a sinistra
        for (const dist of [100, 200, 300]) {
          const j = (i - Math.round((dist - 40) / this.step) + n) % n, s = S[j];
          if (!boardMat[dist]) boardMat[dist] = new THREE.MeshStandardMaterial({ map: tex.text(String(dist), '#111', 128, 128, 'bold 64px Arial', '#fff'), roughness: 0.6 });
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.9), boardMat[dist]);
          const d = (s.hw + 3.2) * outer;
          if (Math.abs(d) > (outer > 0 ? s.wallL : s.wallR) - 0.4) continue;   // in città non c'è spazio
          b.position.set(s.x + s.nx * d, s.y + 0.9, s.z + s.nz * d);
          b.rotation.y = -Math.atan2(s.tz, s.tx);
          b.castShadow = true;
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5), white);
          pole.position.set(0, -0.6, 0); b.add(pole);
          g.add(b);
        }
      }
    }
  }
}

// barriere TecPro (blocchi di schiuma nelle vie di fuga dei circuiti cittadini): blocchi rossi e bianchi con cinghie
function tecPro() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 4; i++) {
    const x = i * 64;
    const grd = g.createLinearGradient(0, 0, 0, 128);
    const red = i % 2 === 0;
    grd.addColorStop(0, red ? '#d11f26' : '#f2f2f0'); grd.addColorStop(1, red ? '#a3161b' : '#cfcfcc');
    g.fillStyle = grd; g.fillRect(x, 0, 64, 128);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 2, 128); g.fillRect(x + 62, 0, 2, 128);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 3, 4, 58, 6);
    // cinghie orizzontali
    g.fillStyle = '#222'; g.fillRect(x, 30, 64, 7); g.fillRect(x, 92, 64, 7);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, 120, 64, 8);
  }
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 22px Arial'; g.textAlign = 'center';
  g.fillText('TECPRO', 32, 72); g.fillStyle = 'rgba(200,20,30,0.9)'; g.fillText('TECPRO', 96, 72);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
