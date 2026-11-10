// Cerimonia del podio in 3D: i primi tre sui gradini con la tuta del team, il vincitore alza il
// trofeo, poi tutti stappano lo champagne e se lo spruzzano addosso tra salti, coriandoli e la folla
// che salta sotto il palco. È una scena a parte (palco, fondale con il nome del circuito, luci).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const hex = c => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// pilota: tuta del team, cappellino, braccia snodate alle spalle, un salto alle anche
function driver(color, skin) {
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.45), roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 });
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  for (const x of [-0.11, 0.11]) {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.72, 4, 8), suit); l.position.set(x, 0.46, 0); body.add(l);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.26), dark); s.position.set(x, 0.04, 0.04); body.add(s);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), suit); torso.scale.set(1.08, 1, 0.68); torso.position.y = 1.22; body.add(torso);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.29), white); stripe.position.set(0, 1.25, 0.005); body.add(stripe);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skinM); neck.position.y = 1.58; body.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), skinM); head.scale.set(1, 1.12, 1); head.position.y = 1.73; body.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.128, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), suit); cap.position.y = 1.76; body.add(cap);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 12, 1, false, -Math.PI / 2, Math.PI), dark); brim.position.set(0, 1.765, 0.07); body.add(brim);
  const arms = [];
  for (const sd of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sd * 0.27, 1.48, 0); body.add(piv);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.52, 4, 8), suit); a.position.y = -0.3; piv.add(a);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), skinM); h.position.y = -0.62; piv.add(h);
    const hand = new THREE.Object3D(); hand.position.y = -0.66; piv.add(hand);
    arms.push({ piv, hand, sd });
  }
  return { g, body, arms };
}

function bottle() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x0f3a1c, roughness: 0.15, metalness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b046, roughness: 0.3, metalness: 0.9 });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 10), glass); b.position.y = -0.02; g.add(b);
  const n = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.05, 0.12, 10), glass); n.position.y = 0.15; g.add(n);
  const f = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.07, 8), gold); f.position.y = 0.2; g.add(f);
  const tip = new THREE.Object3D(); tip.position.y = 0.25; g.add(tip);
  g.userData.tip = tip;
  return g;
}
function trophy() {
  const pts = [[0.0, 0], [0.11, 0], [0.11, 0.03], [0.04, 0.06], [0.03, 0.2], [0.05, 0.24], [0.15, 0.3], [0.17, 0.44], [0.15, 0.46]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: 0xf2c94c, metalness: 1, roughness: 0.18, side: THREE.DoubleSide }));
  const g = new THREE.Group(); m.position.y = -0.1; g.add(m);
  return g;
}

export class PodiumStage {
  // cars: [primo, secondo, terzo] con { color, name, isPlayer }
  constructor(cars, trackName, night) {
    const S = this.scene = new THREE.Scene();
    S.background = new THREE.Color(night ? 0x05070d : 0x8fb4d8);
    S.fog = new THREE.Fog(S.background, 25, 80);
    this.cam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
    S.add(new THREE.HemisphereLight(night ? 0x6a7aa0 : 0xdfeaff, 0x3a3530, night ? 0.9 : 1.4));
    const key = new THREE.DirectionalLight(night ? 0xfff2dd : 0xfff4e6, night ? 2.2 : 2.6); key.position.set(4, 9, 8); S.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.0); rim.position.set(-6, 5, -6); S.add(rim);
    // palco: gradini con il numero, pedana, fondale
    const stepMat = (n) => new THREE.MeshStandardMaterial({ roughness: 0.5, map: canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#16181f'; g.fillRect(0, 0, w, h);
      g.fillStyle = n === 1 ? '#f2c94c' : n === 2 ? '#cfd6de' : '#d9965b'; g.fillRect(0, 0, w, 10);
      g.font = '900 italic 92px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), w / 2, h / 2 + 8);
    }) });
    const plain = new THREE.MeshStandardMaterial({ color: 0x16181f, roughness: 0.5 });
    this.slots = [];
    for (const [n, x, h] of [[1, 0, 1.25], [2, -2.25, 0.85], [3, 2.25, 0.55]]) {
      const geo = new THREE.BoxGeometry(2.1, h, 1.7);
      const m = new THREE.Mesh(geo, [plain, plain, plain, plain, stepMat(n), plain]); m.position.set(x, h / 2, 0); S.add(m);
      this.slots.push({ x, y: h });
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 4.2), new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.7 })); deck.position.set(0, -0.15, -0.6); S.add(deck);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 6.5), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0xffffff, emissiveIntensity: night ? 0.16 : 0.06, map: canvasTex(1400, 650, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0d0f16'); gr.addColorStop(1, '#1b1f2c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e10600'; g.fillRect(0, 0, w, 16); g.fillRect(0, h - 16, w, 16);
      g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '900 italic 120px Arial'; g.fillText(trackName, w / 2, 210);
      g.font = '800 46px Arial'; g.fillStyle = '#e10600'; g.fillText('NOVA GRAND PRIX', w / 2, 290);
      g.globalAlpha = 0.18; g.font = '900 italic 40px Arial'; g.fillStyle = '#fff';
      for (let y = 380; y < h - 20; y += 70) for (let x = (y / 70 % 2) * 110; x < w; x += 220) g.fillText('NOVA GP', x, y);
    }) }));
    back.position.set(0, 3.0, -2.7); S.add(back);
    // la folla sotto il palco: teste e braccia che saltano
    const N = 260, cg = mergeGeometries([new THREE.CapsuleGeometry(0.2, 0.7, 3, 6).translate(0, 0.55, 0), new THREE.SphereGeometry(0.13, 8, 6).translate(0, 1.2, 0)]);
    this.crowd = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
    this.crowdP = [];
    const cols = [0xe10600, 0xffffff, 0x1e41ff, 0xff8000, 0x00d2be, 0xffd12b, 0x2b2b2b, 0x3fae49];
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 18, z = 2.6 + Math.random() * 9;
      this.crowdP.push({ x, z, ph: Math.random() * 6.28, f: 5 + Math.random() * 4 });
      this.crowd.setColorAt(i, new THREE.Color(cols[i % cols.length]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.15));
    }
    S.add(this.crowd);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshStandardMaterial({ color: night ? 0x15171c : 0x4a4d52, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; S.add(floor);
    // piloti (pelle varia) con bottiglia e trofeo
    const skins = [0xe0b394, 0xc68e67, 0xf1c9a5, 0x8d5a3b];
    this.drivers = cars.map((c, k) => {
      if (!c) return null;
      const d = driver(c.color, skins[(c.name || '').length % skins.length]);
      const sl = this.slots[k]; d.g.position.set(sl.x, sl.y, 0.05);
      d.g.rotation.y = k === 1 ? 0.25 : k === 2 ? -0.25 : 0;
      S.add(d.g);
      const b = bottle(); b.visible = false; d.arms[1].hand.add(b); b.rotation.x = Math.PI; d.bottle = b;
      d.ph = k * 1.3;
      return d;
    });
    if (this.drivers[0]) { this.cup = trophy(); this.cup.visible = false; S.add(this.cup); }
    // champagne: spruzzi di goccioline dorate che cadono
    const P = this.pN = 1500;
    this.pPos = new Float32Array(P * 3); this.pVel = new Float32Array(P * 3); this.pLife = new Float32Array(P); this.pNext = 0;
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    const dot = canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,250,225,1)'); r.addColorStop(1, 'rgba(255,240,190,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
    this.spray = new THREE.Points(pg, new THREE.PointsMaterial({ map: dot, size: 0.16, transparent: true, depthWrite: false, color: 0xfff6dc }));
    this.spray.frustumCulled = false; S.add(this.spray);
    for (let i = 0; i < P; i++) this.pPos[i * 3 + 1] = -99;
    // coriandoli
    const C = this.cN = 700;
    this.conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.09), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 }), C);
    this.cP = [];
    const cc = [0xffd700, 0xe10600, 0xffffff, 0x1e90ff, 0x32cd32, 0xff69b4, 0xc0c0c0];
    for (let i = 0; i < C; i++) { this.conf.setColorAt(i, new THREE.Color(cc[i % cc.length])); this.cP.push({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: Math.random() * 6, w: 2 + Math.random() * 6 }); }
    this.conf.frustumCulled = false; S.add(this.conf);
    this.t = 0; this.burst = false;
    this._o = new THREE.Object3D(); this._v = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }

  emit(d, aimX, n) {
    const tip = d.bottle.userData.tip, p = tip.getWorldPosition(this._v);
    for (let k = 0; k < n; k++) {
      const i = this.pNext; this.pNext = (this.pNext + 1) % this.pN;
      this.pPos[i * 3] = p.x; this.pPos[i * 3 + 1] = p.y; this.pPos[i * 3 + 2] = p.z;
      const dx = aimX - p.x, sp = 5.5 + Math.random() * 3.5;
      const dir = new THREE.Vector3(dx * 0.35 + (Math.random() - 0.5) * 0.9, 1.0 + Math.random() * 0.6, 0.55 + (Math.random() - 0.5) * 0.7).normalize();
      this.pVel[i * 3] = dir.x * sp; this.pVel[i * 3 + 1] = dir.y * sp; this.pVel[i * 3 + 2] = dir.z * sp;
      this.pLife[i] = 1.4 + Math.random() * 0.6;
    }
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const t = this.t += dt;
    this.cam.aspect = innerWidth / innerHeight;
    // inquadratura: si avvicina piano e ondeggia davanti al palco
    const a = Math.sin(t * 0.22) * 0.35, R = 10.5 - Math.min(2.5, t * 0.25) + (this.cam.aspect < 1.2 ? 3 : 0);
    this.cam.position.set(Math.sin(a) * R, 2.4 + Math.sin(t * 0.3) * 0.25, Math.cos(a) * R);
    this.cam.lookAt(0, 1.25, 0);
    this.cam.fov = this.cam.aspect < 1.2 ? 55 : 42; this.cam.updateProjectionMatrix();
    const sprayOn = t > 6;
    this.drivers.forEach((d, k) => {
      if (!d) return;
      const L = d.arms[0], Rr = d.arms[1], tl = t - d.ph * 0.15;
      let jump = 0;
      if (t < 1.6) {                                      // salutano la folla
        L.piv.rotation.set(0, 0, -2.5 - Math.sin(tl * 7) * 0.3); Rr.piv.rotation.set(0, 0, 0.15);
      } else if (t < 6) {
        if (k === 0) {                                    // il vincitore alza il trofeo
          const up = Math.min(1, (t - 1.6) / 0.6);
          L.piv.rotation.set(0, 0, -up * 2.75); Rr.piv.rotation.set(0, 0, up * 2.75);
          jump = t > 2.4 && t < 4.6 ? Math.abs(Math.sin((t - 2.4) * 6)) * 0.28 : 0;
        } else {                                          // gli altri applaudono
          const c = Math.sin(t * 16) * 0.18;
          L.piv.rotation.set(-1.1, 0, 0.5 + c); Rr.piv.rotation.set(-1.1, 0, -0.5 - c);
        }
      } else {
        // champagne: scuotono la bottiglia, poi spruzzano mirando agli altri e in aria
        d.bottle.visible = true;
        const shake = t < 7.2;
        const sw = Math.sin(t * 1.3 + k * 2) * 0.5;
        Rr.piv.rotation.set(shake ? -1.4 + Math.sin(t * 22) * 0.35 : -2.0 + sw * 0.4, 0, 0.25 + (shake ? 0 : sw * 0.6));
        L.piv.rotation.set(-0.9, 0, -0.5 - Math.sin(t * 3 + k) * 0.25);
        jump = !shake && Math.sin(t * 1.7 + k * 2.1) > 0.55 ? Math.abs(Math.sin(t * 7 + k)) * 0.3 : 0;
        if (!shake && sprayOn) {
          const others = this.drivers.filter((o, j) => o && j !== k);
          const target = others.length ? others[Math.floor(t * 0.6 + k) % others.length].g.position.x : 0;
          this.emit(d, target, Math.max(4, Math.round(dt * 420)));
        }
      }
      d.body.position.y = jump;
      d.body.rotation.y = Math.sin(t * 0.8 + k) * 0.12;
    });
    // trofeo in mano al vincitore, poi appoggiato sul gradino
    if (this.cup) {
      const d = this.drivers[0];
      if (t > 1.6 && t < 6) { this.cup.visible = true; const l = d.arms[0].hand.getWorldPosition(this._v), r = d.arms[1].hand.getWorldPosition(new THREE.Vector3()); this.cup.position.copy(l).add(r).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.08, 0)); }
      else if (t >= 6) { this.cup.visible = true; this.cup.position.set(d.g.position.x + 0.7, d.g.position.y + 0.1, 0.45); }
    }
    // goccioline
    for (let i = 0; i < this.pN; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) { this.pPos[i * 3 + 1] = -99; continue; }
      this.pVel[i * 3 + 1] -= 9.8 * dt;
      for (let q = 0; q < 3; q++) this.pPos[i * 3 + q] += this.pVel[i * 3 + q] * dt;
    }
    this.spray.geometry.attributes.position.needsUpdate = true;
    // coriandoli: cannoni ai lati quando si alza il trofeo, poi pioggia continua
    if (!this.burst && t > 1.8) {
      this.burst = true;
      this.cP.forEach((c, i) => { const sd = i % 2 ? 1 : -1; c.x = sd * 5.5; c.y = 0.5; c.z = -1.5 + Math.random(); c.vx = -sd * (2 + Math.random() * 4); c.vy = 7 + Math.random() * 6; c.vz = Math.random() * 2.5; });
    }
    const o = this._o;
    this.cP.forEach((c, i) => {
      if (this.burst) {
        c.vy = Math.max(c.vy - 9.8 * dt, -1.1); c.vx *= 1 - dt * 1.4; c.vz *= 1 - dt * 1.4;
        c.x += (c.vx + Math.sin(t * 2 + c.r) * 0.4) * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        if (c.y < -1.5) { c.x = (Math.random() - 0.5) * 12; c.y = 7 + Math.random() * 2; c.z = -2 + Math.random() * 6; c.vx = c.vz = 0; c.vy = -1; }
      }
      o.position.set(c.x, c.y, c.z); o.rotation.set(t * c.w + c.r, t * c.w * 0.7, c.r); o.updateMatrix();
      this.conf.setMatrixAt(i, o.matrix);
    });
    this.conf.instanceMatrix.needsUpdate = true;
    // folla che salta
    this.crowdP.forEach((c, i) => {
      o.position.set(c.x, -1.6 + Math.max(0, Math.sin(t * c.f + c.ph)) * 0.25, c.z); o.rotation.set(0, Math.PI, 0); o.scale.setScalar(1); o.updateMatrix();
      this.crowd.setMatrixAt(i, o.matrix);
    });
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  render(renderer) { renderer.render(this.scene, this.cam); }

  dispose() {
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { if (x.map) x.map.dispose(); x.dispose(); }); });
  }
}
