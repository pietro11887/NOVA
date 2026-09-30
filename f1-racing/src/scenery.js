import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as tex from './textures.js';

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Scenery {
  constructor(scene, track, renderer, quality) {
    this.scene = scene; this.track = track; this.renderer = renderer; this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.aniso = renderer.capabilities.getMaxAnisotropy();
    this.occupied = []; // aree occupate (tribune, box) dove non mettere alberi: [x, z, r]
    this.buildIndex();
  }

  // Indice spaziale dei campioni per calcoli di distanza rapidi
  buildIndex() {
    const S = this.track.samples;
    this.cell = 40;
    this.grid = new Map();
    S.forEach((s, i) => {
      const k = `${Math.floor(s.x / this.cell)},${Math.floor(s.z / this.cell)}`;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(i);
    });
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    S.forEach(s => { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); });
    this.bounds = { minX, maxX, minZ, maxZ };
    this.coarse = S.filter((_, i) => i % 6 === 0);
  }

  nearest(x, z, maxCells = 3) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= maxCells; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const arr = this.grid.get(`${cx + i},${cz + j}`);
        if (!arr) continue;
        for (const k of arr) {
          const s = this.track.samples[k];
          const d = (s.x - x) ** 2 + (s.z - z) ** 2;
          if (d < bd) { bd = d; best = k; }
        }
      }
      if (best >= 0 && Math.sqrt(bd) < r * this.cell) break;
    }
    if (best < 0) {
      this.coarse.forEach(s => { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = Math.round(s.s / this.track.step); } });
    }
    return { i: best, d: Math.sqrt(bd) };
  }

  heightAt(x, z) {
    const S = this.track.samples;
    const nr = this.nearest(x, z);
    const s = S[nr.i];
    const wall = Math.max(s.wallL, s.wallRVis ?? s.wallR);
    // quota media pesata sulla pista (continua tra zone a quote diverse)
    let ws = 0, ys = 0;
    for (const c of this.coarse) {
      const d2 = (c.x - x) ** 2 + (c.z - z) ** 2 + 100;
      const w = 1 / (d2 * d2);
      ws += w; ys += w * c.y;
    }
    const yIdw = ys / ws;
    const near = s.y - 0.6;
    const t = smooth(wall + 6, wall + 70, nr.d);
    const hills = (Math.sin(x * 0.006) * Math.cos(z * 0.0075) * 0.5 + 0.5) * 22 + Math.sin(x * 0.017 + z * 0.011) * 5 + 6;
    const far = smooth(wall + 30, wall + 260, nr.d);
    return near * (1 - t) + (yIdw - 0.6) * t + far * hills;
  }

  build() {
    this.sky();
    this.terrain();
    this.pitBuilding();
    this.grandstands();
    this.gantry();
    this.billboards();
    this.trees();
    this.clouds();
  }

  sky() {
    const geo = new THREE.SphereGeometry(4000, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x3d8fe0) }, horizon: { value: new THREE.Color(0xcfe6f5) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = max(vP.y, 0.0); vec3 c = mix(horizon, top, pow(h, 0.55)); gl_FragColor = vec4(c, 1.0); }',
    });
    this.skyMesh = new THREE.Mesh(geo, mat);
    this.skyMesh.renderOrder = -1;
    this.scene.add(this.skyMesh);
  }

  terrain() {
    const b = this.bounds, pad = 700, step = this.quality === 'low' ? 14 : 10;
    const x0 = b.minX - pad, x1 = b.maxX + pad, z0 = b.minZ - pad, z1 = b.maxZ + pad;
    const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
    const col = new Float32Array((nx + 1) * (nz + 1) * 3);
    const c = new THREE.Color();
    const r = rand(5);
    let k = 0;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const y = this.heightAt(x, z);
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      const n = Math.sin(x * 0.05) * Math.cos(z * 0.04) * 0.5 + 0.5;
      c.setHSL(0.27 + n * 0.04, 0.45 + r() * 0.08, 0.33 + n * 0.06 + r() * 0.03);
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      k += 3;
    }
    const idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b2 = a + 1, c2 = a + nx + 1, d = c2 + 1;
      idx.push(a, c2, b2, b2, c2, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  // colloca un oggetto a lato pista: indice campione, lato (+1 sx, -1 dx), distanza extra oltre il muro
  place(obj, i, side, extra) {
    const s = this.track.samples[(i + this.track.count) % this.track.count];
    const wall = side > 0 ? s.wallL : s.wallRVis ?? s.wallR;
    const d = (wall + extra) * side;
    obj.position.set(s.x + s.nx * d, s.y, s.z + s.nz * d);
    // l'asse +Z locale dell'oggetto punta verso la pista
    const toTrack = new THREE.Vector3(-s.nx * side, 0, -s.nz * side);
    obj.rotation.y = Math.atan2(toTrack.x, toTrack.z);
    this.group.add(obj);
    this.occupied.push([obj.position.x, obj.position.z, obj.userData.radius || 40]);
    return obj;
  }

  makeStand(length, rows) {
    const g = new THREE.Group();
    const crowdT = tex.crowd(); crowdT.anisotropy = this.aniso;
    crowdT.repeat.set(length / 28, rows / 16 * 1.1);
    const depth = rows * 0.85, height = rows * 0.55;
    // gradinata inclinata con pubblico
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(length, Math.hypot(depth, height)), new THREE.MeshStandardMaterial({ map: crowdT, roughness: 0.95 }));
    slope.rotation.x = -Math.atan2(depth, height); // inclinata verso la pista (+Z)
    slope.position.set(0, 2 + height / 2, -depth / 2);
    slope.receiveShadow = true;
    g.add(slope);
    const grey = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.8 });
    // basamento
    const base = new THREE.Mesh(new THREE.BoxGeometry(length, 2, depth + 1), dark);
    base.position.set(0, 1, -depth / 2); base.castShadow = true; base.receiveShadow = true; g.add(base);
    // pareti laterali e posteriore
    const back = new THREE.Mesh(new THREE.BoxGeometry(length, height + 5, 0.6), grey);
    back.position.set(0, (height + 5) / 2, -depth - 0.3); back.castShadow = true; g.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.6, height + 4, depth + 1), grey);
      side.position.set(s * length / 2, (height + 4) / 2, -depth / 2); side.castShadow = true; g.add(side);
    }
    // tetto
    const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.5, depth + 5), new THREE.MeshStandardMaterial({ color: 0xeef0f4, roughness: 0.5, metalness: 0.2 }));
    roof.position.set(0, height + 7, -depth / 2 + 1.5); roof.rotation.x = 0.06; roof.castShadow = true; g.add(roof);
    for (let x = -length / 2 + 4; x <= length / 2 - 4; x += 16) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, height + 7), grey);
      p.position.set(x, (height + 7) / 2, -depth + 1); g.add(p);
    }
    // pannello pubblicitario sul fronte
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(length, 2), new THREE.MeshStandardMaterial({ map: tex.sponsor('NOVA GRAND PRIX', '#ffffff', ['#6a2cd8', '#2c7be0']) }));
    ad.position.set(0, 1.1, 0.51); g.add(ad);
    g.userData.radius = Math.max(length, depth) * 0.7;
    return g;
  }

  grandstands() {
    const n = this.track.count, st = this.track.step;
    // tribune lungo il rettilineo principale (lato sinistro)
    const main = [-40, 30, 100, 170].map(m => Math.round(m / st));
    main.forEach(i => this.place(this.makeStand(62, 22), i, 1, 5));
    // tribune in corrispondenza delle curve più lente, lato esterno
    const S = this.track.samples;
    const used = [];
    for (let i = 0; i < n; i += 5) {
      const c = S[i].curv;
      if (Math.abs(c) < 0.018) continue;
      if (used.some(u => Math.min(Math.abs(u - i), n - Math.abs(u - i)) < 90)) continue;
      used.push(i);
      const side = c > 0 ? 1 : -1;   // esterno curva
      this.place(this.makeStand(46, 16), i, side, 10);
    }
  }

  pitBuilding() {
    const st = this.track.step;
    const pt = tex.pitBuilding(); pt.anisotropy = this.aniso;
    const len = 300;
    pt.repeat.set(len / 40, 1);
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.7 });
    const front = new THREE.MeshStandardMaterial({ map: pt, roughness: 0.7 });
    // box: facciata verso la pista (+Z)
    const mats = [white, white, white, white, front, white];
    const b = new THREE.Mesh(new THREE.BoxGeometry(len, 9, 16), mats);
    b.position.set(0, 4.5, -8); b.castShadow = true; b.receiveShadow = true; g.add(b);
    const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 0.8, 17), new THREE.MeshStandardMaterial({ color: 0xc0262c, roughness: 0.6 }));
    roofTrim.position.set(0, 9.3, -8); g.add(roofTrim);
    // secondo piano con vetrate
    const glass = new THREE.MeshStandardMaterial({ color: 0x2a3a52, roughness: 0.15, metalness: 0.6 });
    const upper = new THREE.Mesh(new THREE.BoxGeometry(len - 20, 4, 11), [white, white, white, white, glass, white]);
    upper.position.set(0, 11.7, -10); upper.castShadow = true; g.add(upper);
    // insegna viola come nell'immagine
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 4), new THREE.MeshStandardMaterial({ map: tex.sponsor('NOVA', '#ffffff', ['#4b2fd6', '#b43adf']), emissive: 0x221144, emissiveIntensity: 0.3 }));
    sign.position.set(-60, 15.8, -4.2); g.add(sign);
    const sign2 = sign.clone(); sign2.position.x = 70; g.add(sign2);
    // muretto box con cartelli
    g.userData.radius = 140;
    // il centro dell'edificio a circa 70 m dopo il traguardo, a destra
    this.place(g, Math.round(95 / st), -1, 0.5);
  }

  gantry() {
    const s = this.track.samples[0];
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.5, metalness: 0.5 });
    const span = s.wallL + s.wallR;
    for (const d of [s.wallL, -s.wallR]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), dark);
      p.position.set(0, 4, -d); p.castShadow = true; g.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, span), dark);
    beam.position.set(0, 7.7, (s.wallR - s.wallL) / 2); beam.castShadow = true; g.add(beam);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshStandardMaterial({ map: tex.sponsor('NOVA GP', '#ffffff', ['#4b2fd6', '#b43adf']), roughness: 0.5 }));
    sign.position.set(-0.31, 8.4, 0); sign.rotation.y = -Math.PI / 2; g.add(sign);
    const sign2 = sign.clone(); sign2.position.x = 0.31; sign2.rotation.y = Math.PI / 2; g.add(sign2);
    // pannello luci
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 4.6), dark);
    panel.position.set(-0.6, 6.4, 0); g.add(panel);
    this.lights = [];
    for (let k = 0; k < 5; k++) {
      const pair = [];
      for (const dy of [0.28, -0.28]) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff0000, emissiveIntensity: 0 });
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), mat);
        l.position.set(-0.86, 6.4 + dy, -1.8 + k * 0.9);
        l.rotation.y = -Math.PI / 2;
        g.add(l); pair.push(mat);
      }
      this.lights.push(pair);
    }
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = -Math.atan2(s.tz, s.tx);
    this.group.add(g);
  }

  setLights(nOn) {
    this.lights.forEach((pair, k) => pair.forEach(m => { m.emissiveIntensity = k < nOn ? 3 : 0; }));
  }

  billboards() {
    const names = [
      ['VELOCE', '#ffffff', ['#d6202a', '#ff5b3a']], ['APEX', '#111', ['#ffd21e', '#ffb300']],
      ['TURBOX', '#ffffff', ['#1a1a1a', '#3a3a3a']], ['NOVA', '#ffffff', ['#4b2fd6', '#b43adf']],
      ['PISTA+', '#ffffff', ['#0a7d3e', '#19b35a']], ['GOMMA', '#ffffff', ['#0c3c8c', '#2a6fe0']],
    ].map(([t, f, b]) => new THREE.MeshStandardMaterial({ map: tex.sponsor(t, f, b), roughness: 0.6 }));
    const S = this.track.samples, n = this.track.count;
    const r = rand(9);
    const post = new THREE.MeshStandardMaterial({ color: 0x555a63 });
    for (let i = 20; i < n; i += 38) {
      if (Math.abs(S[i].curv) > 0.01 && r() < 0.5) continue;
      const side = r() < 0.5 ? 1 : -1;
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(12, 2.6, 0.2), billboardsMat(names, r));
      b.position.y = 4.6; b.castShadow = true; g.add(b);
      for (const x of [-5, 5]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4), post); p.position.set(x, 2, -0.1); g.add(p); }
      g.userData.radius = 8;
      this.place(g, i, side, 2.5);
    }
    function billboardsMat(list, rr) { return list[Math.floor(rr() * list.length)]; }
  }

  trees() {
    const count = this.quality === 'low' ? 1400 : 2600;
    const foliage = mergeGeometries([
      new THREE.ConeGeometry(2.6, 5, 7).translate(0, 4.5, 0),
      new THREE.ConeGeometry(2.0, 4, 7).translate(0, 7.2, 0),
      new THREE.ConeGeometry(1.3, 3, 7).translate(0, 9.4, 0),
    ]);
    const trunkG = new THREE.CylinderGeometry(0.3, 0.4, 2.5, 6).translate(0, 1.25, 0);
    const fMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const tMat = new THREE.MeshStandardMaterial({ color: 0x5b3b22, roughness: 1 });
    const F = new THREE.InstancedMesh(foliage, fMat, count);
    const T = new THREE.InstancedMesh(trunkG, tMat, count);
    const b = this.bounds, pad = 520;
    const r = rand(42);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const c = new THREE.Color();
    let k = 0, tries = 0;
    while (k < count && tries < count * 20) {
      tries++;
      const x = b.minX - pad + r() * (b.maxX - b.minX + 2 * pad);
      const z = b.minZ - pad + r() * (b.maxZ - b.minZ + 2 * pad);
      const nr = this.nearest(x, z);
      const s = this.track.samples[nr.i];
      if (nr.d < Math.max(s.wallL, s.wallRVis ?? s.wallR) + 14) continue;
      // alberi a gruppi: più densi in certe zone
      const dens = Math.sin(x * 0.013) * Math.cos(z * 0.017) * 0.5 + 0.5;
      if (r() > dens * 1.2 + 0.08) continue;
      if (this.occupied.some(([ox, oz, rad]) => (ox - x) ** 2 + (oz - z) ** 2 < rad * rad)) continue;
      const y = this.heightAt(x, z);
      const s1 = 0.7 + r() * 0.9;
      p.set(x, y - 0.2, z); sc.set(s1, s1 * (0.85 + r() * 0.4), s1);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
      m.compose(p, q, sc);
      F.setMatrixAt(k, m); T.setMatrixAt(k, m);
      c.setHSL(0.3 + r() * 0.06, 0.45 + r() * 0.2, 0.18 + r() * 0.12);
      F.setColorAt(k, c);
      k++;
    }
    F.count = T.count = k;
    F.castShadow = true; T.castShadow = true;
    F.receiveShadow = true;
    this.group.add(F, T);
  }

  clouds() {
    const r = rand(77);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, emissive: 0xaab4c4, emissiveIntensity: 0.35, fog: false });
    const geo = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 26; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(geo, mat);
        const s = 25 + r() * 35;
        m.scale.set(s * 1.6, s * 0.6, s);
        m.position.set((k - n / 2) * 35 + r() * 20, r() * 12, r() * 30);
        g.add(m);
      }
      const a = r() * Math.PI * 2, d = 1500 + r() * 1500;
      g.position.set(Math.cos(a) * d, 320 + r() * 250, Math.sin(a) * d);
      g.rotation.y = r() * 6;
      this.scene.add(g);
    }
  }
}
