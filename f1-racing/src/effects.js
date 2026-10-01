import * as THREE from 'three';

// ---------------- Particelle (fumo, scintille, erba, ghiaia) ----------------
export class Particles {
  constructor(scene, max = 900) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 0, a0: 1, drag: 0, grav: 0, s0: 1 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { scale: { value: 500 } },
      vertexShader: `
        attribute float alpha; attribute float size; varying float vA; varying vec3 vC;
        uniform float scale;
        void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying float vA; varying vec3 vC;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
          gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.15, r)); }`,
      vertexColors: true,
    });
    this.mat = mat;
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.next = 0;
  }

  setScale(h) { this.mat.uniforms.scale.value = h; }

  emit(x, y, z, o) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    const p = this.p[i];
    p.life = p.max = o.life ?? 1;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0;
    p.grow = o.grow ?? 0; p.a0 = o.alpha ?? 1; p.drag = o.drag ?? 1; p.grav = o.grav ?? 0; p.s0 = o.size ?? 0.5;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    const c = o.color;
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    this.size[i] = p.s0; this.alpha[i] = p.a0;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (p.life <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
      this.pos[i * 3] += p.vx * dt; this.pos[i * 3 + 1] += p.vy * dt; this.pos[i * 3 + 2] += p.vz * dt;
      const t = Math.max(0, p.life / p.max);
      this.alpha[i] = p.a0 * t;
      this.size[i] += p.grow * dt;
    }
    for (const n of ['position', 'color', 'alpha', 'size']) this.geo.attributes[n].needsUpdate = true;
  }

  clear() { this.p.forEach(p => p.life = 0); }
}

// ---------------- Segni degli pneumatici ----------------
export class SkidMarks {
  constructor(scene, max = 4000) {
    this.max = max;
    const pos = new Float32Array(max * 4 * 3);
    const col = new Float32Array(max * 4 * 4);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      const b = i * 4;
      idx.set([b, b + 2, b + 1, b + 1, b + 2, b + 3], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = g;
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.next = 0;
    this.last = {};
  }

  add(wheel, x, y, z, intensity, dark = true) {
    const last = this.last[wheel];
    if (intensity < 0.25) { this.last[wheel] = null; return; }
    if (!last) { this.last[wheel] = [x, y, z]; return; }
    const dx = x - last[0], dz = z - last[2], l = Math.hypot(dx, dz);
    if (l < 0.35) return;
    if (l > 3) { this.last[wheel] = [x, y, z]; return; }
    const w = 0.17, sx = -dz / l * w, sz = dx / l * w;
    const i = this.next; this.next = (this.next + 1) % this.max;
    const P = this.geo.attributes.position.array, C = this.geo.attributes.color.array;
    const v = [[last[0] + sx, last[1], last[2] + sz], [last[0] - sx, last[1], last[2] - sz], [x + sx, y, z + sz], [x - sx, y, z - sz]];
    const a = Math.min(0.6, intensity * 0.6);
    const c = dark ? [0.05, 0.05, 0.05] : [0.35, 0.25, 0.12];
    v.forEach((p, k) => {
      P.set(p, (i * 4 + k) * 3);
      C.set([c[0], c[1], c[2], a], (i * 4 + k) * 4);
    });
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.last[wheel] = [x, y, z];
  }

  cut() { this.last = {}; }
  clear() {
    this.geo.attributes.color.array.fill(0);
    this.geo.attributes.color.needsUpdate = true;
    this.cut();
  }
}

// ---------------- Pezzi staccati dalla vettura ----------------
export class Debris {
  constructor(scene, track) {
    this.scene = scene; this.track = track;
    this.items = [];
    this.parts = [];
    this.pr = {};
  }

  // obj: Object3D della vettura. Sulla pista cade una copia (che resta lì fino a fine sessione:
  // rottami da evitare); il pezzo originale sparisce dalla vettura e torna con la riparazione ai box.
  detach(obj, carVel, impulse, kind = 'part') {
    if (obj.userData.detached) return;
    obj.updateWorldMatrix(true, true);
    const ud = obj.userData; obj.userData = {};          // niente copia dei riferimenti interni
    const piece = obj.clone(true);
    obj.userData = ud;
    obj.matrixWorld.decompose(piece.position, piece.quaternion, piece.scale);
    piece.userData = { debris: true };
    this.scene.add(piece);
    obj.userData.detached = true;
    obj.visible = false;
    this.parts.push(obj);
    const v = new THREE.Vector3(carVel.x * 0.75 + (Math.random() - 0.5) * 6 + impulse.x, 2 + Math.random() * 5 + impulse.y, carVel.z * 0.75 + (Math.random() - 0.5) * 6 + impulse.z);
    const w = new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
    // ingombro e "spessore" del rottame per la fisica delle vetture che ci passano sopra
    const box = new THREE.Box3().setFromObject(piece), size = box.getSize(new THREE.Vector3());
    const r = Math.max(0.3, Math.min(1.8, Math.hypot(size.x, size.z) / 2 * 0.8));
    const h = kind === 'wheel' ? 0.32 : kind === 'wing' ? 0.1 : kind === 'end' ? 0.04 : 0.06;
    const sharp = kind !== 'wheel';
    const mass = kind === 'wheel' ? 25 : kind === 'wing' ? 8 : 4;
    this.items.push({ obj: piece, v, w, hint: -1, rest: false, r, h, sharp, mass, kick: 0, kind });
  }

  // i commissari portano via un rottame
  removeItem(it) {
    this.scene.remove(it.obj);
    this.items = this.items.filter(x => x !== it);
  }

  // contatto ruote-rottami per una vettura (chiamato dalla fisica a ogni passo)
  contact(p) {
    const W = p.wheels;
    for (const w of W) { w.debrisH = 0; w.debrisGrip = 0; }
    if (!this.items.length || p.inPit) return;
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    for (const it of this.items) {
      const o = it.obj.position;
      const dx0 = o.x - p.x, dz0 = o.z - p.z;
      if (dx0 * dx0 + dz0 * dz0 > 49 || Math.abs(o.y - p.y) > 2.5) continue;
      for (let i = 0; i < 4; i++) {
        const w = W[i];
        const wx = p.x + cy * w.x - sy * w.y, wz = p.z + sy * w.x + cy * w.y;
        const dist = Math.hypot(o.x - wx, o.z - wz), reach = it.r + 0.22;
        if (dist >= reach) continue;
        const f = 1 - dist / reach;
        // la ruota sale sul pezzo (profilo morbido) e ha poca presa su carbonio e plastica
        w.debrisH = Math.max(w.debrisH, it.h * Math.min(1, f * 2.2));
        w.debrisGrip = Math.max(w.debrisGrip, (it.sharp ? 0.5 : 0.35) * Math.min(1, f * 2));
        // il pezzo viene calciato via (una volta per passaggio)
        if (p.speed > 3 && this.time - it.kick > 0.25) {
          it.kick = this.time;
          const k = Math.min(1, 30 / it.mass) * (0.35 + Math.random() * 0.3);
          it.v.set(p.vx * k + (Math.random() - 0.5) * 3, 1 + p.speed * 0.05 * Math.random() * (20 / it.mass), p.vz * k + (Math.random() - 0.5) * 3);
          it.w.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
          it.rest = false;
          // carbonio tagliente: a velocità alta può forare
          if (it.sharp && p.speed > 18) p.maybePuncture(i, 6 + p.speed * 0.08, 0.1);
          // una ruota piena è un ostacolo vero: colpo alla sospensione
          if (!it.sharp && p.speed > 12) p.damage.susp[i] = Math.min(1, p.damage.susp[i] + (p.speed - 12) / 400 * p.dmgScale);
        }
      }
    }
  }

  update(dt, hint) {
    this.time = (this.time || 0) + dt;
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const it of this.items) {
      if (it.rest) continue;
      it.v.y -= 9.81 * dt;
      it.obj.position.addScaledVector(it.v, dt);
      e.set(it.w.x * dt, it.w.y * dt, it.w.z * dt);
      q.setFromEuler(e);
      it.obj.quaternion.multiply(q);
      const pr = this.track.project(it.obj.position.x, it.obj.position.z, it.hint < 0 ? hint : it.hint, this.pr);
      it.hint = pr.i;
      const s = this.track.samples[pr.i];
      const wall = pr.d > 0 ? s.wallL : s.wallR;
      if (Math.abs(pr.d) > wall - 0.2) {
        const sg = Math.sign(pr.d), nx = -sg * pr.nx, nz = -sg * pr.nz;
        const vn = it.v.x * nx + it.v.z * nz;
        if (vn < 0) { it.v.x -= 1.5 * vn * nx; it.v.z -= 1.5 * vn * nz; }
        it.obj.position.x += nx * (Math.abs(pr.d) - wall + 0.2);
        it.obj.position.z += nz * (Math.abs(pr.d) - wall + 0.2);
      }
      const ground = pr.y + 0.08;
      if (it.obj.position.y < ground) {
        it.obj.position.y = ground;
        if (it.v.y < 0) it.v.y = -it.v.y * 0.3;
        it.v.x *= 0.7; it.v.z *= 0.7; it.w.multiplyScalar(0.6);
        if (it.v.lengthSq() < 0.3) it.rest = true;
      }
    }
  }

  // riparazione ai box: la vettura ha di nuovo i suoi pezzi (i rottami restano in pista)
  restoreFor(root) {
    this.parts = this.parts.filter(o => {
      let p = o.parent, mine = false;
      while (p) { if (p === root) { mine = true; break; } p = p.parent; }
      if (!mine) return true;
      o.visible = true; o.userData.detached = false;
      return false;
    });
  }

  // nuova sessione: pista pulita e vetture integre
  restore() {
    for (const it of this.items) this.scene.remove(it.obj);
    for (const o of this.parts) { o.visible = true; o.userData.detached = false; }
    this.items = [];
    this.parts = [];
  }
}
