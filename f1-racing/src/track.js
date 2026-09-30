import * as THREE from 'three';
import { buildTrack, ROAD_HALF_WIDTH as H, KERB_WIDTH as K } from './trackData.js';
import * as tex from './textures.js';

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
    // raffinamento sul segmento
    const a = S[best];
    let along = (x - a.x) * a.tx + (z - a.z) * a.tz;
    let i0 = best, f = 0;
    if (along < 0) { i0 = (best - 1 + n) % n; }
    const p = S[i0], q = S[(i0 + 1) % n];
    const sx = q.x - p.x, sz = q.z - p.z, sl2 = sx * sx + sz * sz;
    f = Math.max(0, Math.min(1, ((x - p.x) * sx + (z - p.z) * sz) / sl2));
    const cx = p.x + sx * f, cz = p.z + sz * f;
    const nx = p.nx + (q.nx - p.nx) * f, nz = p.nz + (q.nz - p.nz) * f;
    const nl = Math.hypot(nx, nz);
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
  surface(pr, out = {}) {
    const s = this.samples[pr.i];
    const d = pr.d, ad = Math.abs(d);
    const left = d > 0;
    out.h = 0; out.type = SURF.ROAD;
    out.wall = left ? s.wallL : s.wallR;
    const hasKerb = left ? s.kerbL : s.kerbR;
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
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const S = this.samples, n = this.count;
    const g = this.group;

    // Asfalto
    const asphalt = tex.asphalt(); asphalt.anisotropy = aniso;
    g.add(this.ribbon([[-H - 0.6, 0.0], [H + 0.6, 0.0]], null, new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, metalness: 0 }), 10, true));
    // linee bianche di bordo pista
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.7 });
    g.add(this.ribbon([[H - 0.55, 0.012], [H - 0.05, 0.012]], null, white));
    g.add(this.ribbon([[-H + 0.05, 0.012], [-H + 0.55, 0.012]], null, white));
    // fascia d'erba più scura lungo il bordo pista (come nelle riprese TV)
    const darkGrass = new THREE.MeshStandardMaterial({ color: 0x3f8a36, roughness: 1 });
    g.add(this.ribbon([[H + 0.6, 0.0], [H + 4.5, -0.03]], i => !S[i].kerbL && !S[i].gravelL, darkGrass, 4));
    g.add(this.ribbon([[-H - 4.5, -0.03], [-H - 0.6, 0.0]], i => !S[i].kerbR && !S[i].gravelR, darkGrass, 4));

    // Cordoli
    const kt = tex.kerb(); kt.anisotropy = aniso;
    const kerbMat = new THREE.MeshStandardMaterial({ map: kt, roughness: 0.6 });
    const prof = [[0, 0.006], [0.35, 0.05], [K, 0.07]];
    g.add(this.ribbon(prof.map(([u, h]) => [H + u, h]), i => S[i].kerbL, kerbMat, 3.6));
    g.add(this.ribbon(prof.map(([u, h]) => [-H - K + (K - u), h]).reverse(), i => S[i].kerbR, kerbMat, 3.6));
    // cordoli a salsiccia (gialli)
    const sausMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });
    const sp = []; for (let k = 0; k <= 6; k++) sp.push([H + K + 0.7 * k / 6, 0.11 * Math.sin(Math.PI * k / 6)]);
    g.add(this.ribbon(sp, i => S[i].sausageL, sausMat));
    g.add(this.ribbon(sp.map(([d, h]) => [-d, h]).reverse(), i => S[i].sausageR, sausMat));

    // Erba vicino alla pista e ghiaia
    const grassT = tex.grass(); grassT.anisotropy = aniso;
    const grassMat = new THREE.MeshStandardMaterial({ map: grassT, roughness: 1 });
    const gravT = tex.gravel(); gravT.anisotropy = aniso;
    const gravMat = new THREE.MeshStandardMaterial({ map: gravT, roughness: 1 });
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
        const [d, h] = prof[k];
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
        const wall = side > 0 ? s.wallL : (isGravel ? s.wallR : s.wallRVis ?? s.wallR);
        const kerb = side > 0 ? s.kerbL : s.kerbR;
        const edge = H + (kerb ? K : 0.6);
        const gStart = H + K + 4;
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
    const make = (h0, h1, mat, vs, mask, extrude = 0, pitWall = false) => {
      const pos = [], uv = [], idx = [];
      let prev = -1;
      for (let ii = 0; ii <= n; ii++) {
        const i = ii % n, s = S[i];
        if (mask && !mask(s)) { prev = -1; continue; }
        const w = (side > 0 ? s.wallL : pitWall ? s.wallR : s.wallRVis ?? s.wallR) + extrude;
        const x = s.x + s.nx * w * side, z = s.z + s.nz * w * side;
        const row = pos.length / 6;
        pos.push(x, s.y + h0, z, x, s.y + h1, z);
        uv.push(s.s / vs, 0, s.s / vs, 1);
        if (prev >= 0) {
          const a = prev * 2, b = a + 1, c = row * 2, d = c + 1;
          if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
        }
        prev = row;
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
    const isTyre = s => (side > 0 ? s.gravelL : s.gravelR);
    const barrierMat = new THREE.MeshStandardMaterial({ map: barrierT, roughness: 0.7, side: THREE.DoubleSide });
    const tyreMat = new THREE.MeshStandardMaterial({ map: tyreT, roughness: 0.9, side: THREE.DoubleSide });
    grp.add(make(-1.5, 1.05, barrierMat, 4, s => !isTyre(s)));
    grp.add(make(-1.5, 1.1, tyreMat, 2.2, isTyre));
    const fenceMat = new THREE.MeshStandardMaterial({ map: fenceT, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 });
    grp.add(make(1.05, 4.2, fenceMat, 3, null, 0.6));
    // muretto box tra pista e corsia box (lato destro)
    if (side < 0) {
      const pitWallMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.8, side: THREE.DoubleSide });
      grp.add(make(-1.5, 1.0, pitWallMat, 4, s => s.pitWall, 0, true));
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
    const line = new THREE.Mesh(new THREE.PlaneGeometry(2.4, H * 2), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.7 }));
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
          const d = (H + 3.2) * outer;
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
