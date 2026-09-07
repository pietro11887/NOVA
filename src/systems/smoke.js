import * as THREE from 'three';

/**
 * Fumo e fiamme delle auto malridotte. Un solo pool di quad istanziati per
 * tutta la citta': le particelle vengono riciclate, non se ne creano mai.
 */
const MAX = 90;

export class Smoke {
  constructor(game) {
    this.game = game;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
      map: puffTexture(), transparent: true, depthWrite: false, opacity: 1,
      toneMapped: false,
    }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 3;
    game.scene.add(this.mesh);
    this.p = [];
    for (let i = 0; i < MAX; i++) this.p.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, hot: 0 });
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._c = new THREE.Color();
    this.emitT = 0;
  }

  /** Sbuffo singolo: usato anche dalle esplosioni. */
  puff(x, y, z, hot = 0, spread = 0.5) {
    const p = this.p.find((q) => q.life <= 0);
    if (!p) return;
    p.life = p.max = hot ? 0.55 + Math.random() * 0.4 : 1.4 + Math.random() * 1.2;
    p.x = x + (Math.random() - 0.5) * spread;
    p.y = y + (Math.random() - 0.5) * spread * 0.4;
    p.z = z + (Math.random() - 0.5) * spread;
    p.vx = (Math.random() - 0.5) * 0.5;
    p.vy = hot ? 1.8 + Math.random() : 0.9 + Math.random() * 0.7;
    p.vz = (Math.random() - 0.5) * 0.5;
    p.s = hot ? 0.5 + Math.random() * 0.4 : 0.7 + Math.random() * 0.6;
    p.hot = hot;
  }

  update(dt, cars) {
    // emissione: solo i mezzi malmessi e vicini, se no e' tutto fumo
    this.emitT -= dt;
    if (this.emitT <= 0) {
      this.emitT = 0.07;
      const pl = this.game.player;
      for (const c of cars) {
        if (c.health > 42) continue;
        if (Math.abs(c.x - pl.x) > 70 || Math.abs(c.z - pl.z) > 70) continue;
        const burning = c.health < 16;
        const nose = c.spec.L * 0.36;
        this.puff(c.x + c.fx * nose, 0.9, c.z + c.fz * nose, burning && Math.random() < 0.6 ? 1 : 0, 0.4);
      }
    }

    let n = 0;
    const cam = this.game.camera;
    for (const p of this.p) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy *= 1 - dt * 0.5;
      p.vx *= 1 - dt * 0.8; p.vz *= 1 - dt * 0.8;
      const t = 1 - p.life / p.max;
      const size = p.s * (p.hot ? 1 + t * 0.8 : 1 + t * 2.4);
      this._v.set(p.x, p.y, p.z);
      this._q.copy(cam.quaternion);                    // sempre di fronte alla camera
      this._m.compose(this._v, this._q, new THREE.Vector3(size, size, size));
      this.mesh.setMatrixAt(n, this._m);
      // il fumo schiarisce e svanisce, la fiamma passa da giallo a rosso
      const fade = Math.sin(Math.min(1, t * 1.15) * Math.PI) * (p.hot ? 1 : 0.5);
      if (p.hot) this._c.setRGB(1.6 * fade, (0.9 - t * 0.7) * fade, 0.15 * fade);
      else {
        const g = (0.22 + t * 0.3) * fade;
        this._c.setRGB(g, g, g * 1.02);
      }
      this.mesh.setColorAt(n, this._c);
      n++;
      if (n >= MAX) break;
    }
    this.mesh.count = n;
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Nuvola grossa: esplosioni. */
  burst(x, z, big = 1) {
    for (let i = 0; i < 14 * big; i++) this.puff(x, 0.7 + Math.random() * 1.4, z, i < 8 * big ? 1 : 0, 2.2);
  }
}

/** Sbuffo morbido su canvas: gradiente radiale con bordi sfrangiati. */
function puffTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 7; i++) {
    const cx = S / 2 + (Math.random() - 0.5) * 34, cy = S / 2 + (Math.random() - 0.5) * 34;
    const r = 22 + Math.random() * 24;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
