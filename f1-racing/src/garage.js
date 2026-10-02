import * as THREE from 'three';

// Garage: showroom con la vettura su una pedana che gira lentamente.
// Si trascina col dito o col mouse per girarla; si avvicina con la rotella / due dita.

export class Garage {
  constructor(renderer, envTexture) {
    this.renderer = renderer;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d12);
    scene.fog = new THREE.Fog(0x0b0d12, 14, 30);
    scene.environment = envTexture || null;
    scene.environmentIntensity = 0.55;
    // luci da studio: chiave, contro e riempimento
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1c22, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(4, 7, 3); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
    key.shadow.bias = -0.0004; scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fb6ff, 1.6); rim.position.set(-5, 3, -4); scene.add(rim);
    const warm = new THREE.PointLight(0xff8a1c, 18, 9, 1.6); warm.position.set(-3.2, 1.2, 2.8); scene.add(warm);
    this.warm = warm;
    // pedana con anello luminoso e pavimento lucido
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x0c0e13, roughness: 0.55, metalness: 0.15, envMapIntensity: 0.25 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    this.stand = new THREE.Group(); scene.add(this.stand);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.75, 0.12, 96), new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.4, metalness: 0.3, envMapIntensity: 0.3 }));
    disc.position.y = 0.06; disc.receiveShadow = true; this.stand.add(disc);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff8a1c });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.68, 0.025, 8, 128), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.11; this.stand.add(ring);
    this.ringMat = ringMat;
    // pareti con strisce di luce
    const stripMat = new THREE.MeshBasicMaterial({ color: 0x2a3550 });
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.5, 0.08), stripMat);
      s.position.set(Math.cos(a) * 11, 2.25, Math.sin(a) * 11); scene.add(s);
    }
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    this.yaw = 0.7; this.pitch = 0.2; this.dist = 11.5; this.spin = 0.18; this.car = null; this.drag = null;
    this.bindInput();
  }

  bindInput() {
    const el = this.renderer.domElement;
    const pts = new Map();
    el.addEventListener('pointerdown', e => { if (!this.active) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.drag = performance.now(); });
    addEventListener('pointerup', e => { pts.delete(e.pointerId); });
    addEventListener('pointercancel', e => { pts.delete(e.pointerId); });
    addEventListener('pointermove', e => {
      if (!this.active || !pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId);
      if (pts.size === 1) {
        this.yaw -= (e.clientX - p.x) * 0.008;
        this.pitch = Math.max(0.05, Math.min(0.75, this.pitch + (e.clientY - p.y) * 0.004));
        this.drag = performance.now();
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [c, d] = [...pts.values()];
        const after = Math.hypot(c.x - d.x, c.y - d.y);
        this.dist = Math.max(6.5, Math.min(18, this.dist * before / Math.max(1, after)));
        return;
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    el.addEventListener('wheel', e => { if (!this.active) return; this.dist = Math.max(6.5, Math.min(18, this.dist * (1 + e.deltaY * 0.001))); }, { passive: true });
  }

  // mette sulla pedana un nuovo modello (le ruote toccano la pedana)
  setCar(model, accent) {
    if (this.car) this.stand.remove(this.car.root);
    this.car = model;
    const root = model.root;
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    root.position.y = 0.12 - box.min.y;
    root.position.x = -(box.min.x + box.max.x) / 2;
    root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.stand.add(root);
    if (accent) { this.ringMat.color.set(accent); this.warm.color.set(accent); }
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  render(dt) {
    // la pedana gira da sola se non la stai toccando
    if (!this.drag || performance.now() - this.drag > 2500) this.stand.rotation.y += dt * this.spin;
    const narrow = this.camera.aspect < 1.2;
    const d = this.dist * (narrow ? 1.35 : 1);
    const c = this.camera;
    c.position.set(Math.cos(this.yaw) * Math.cos(this.pitch) * d, 0.6 + Math.sin(this.pitch) * d, Math.sin(this.yaw) * Math.cos(this.pitch) * d);
    // la vettura sta nella parte destra dello schermo (a sinistra c'è il pannello)
    const look = new THREE.Vector3(0, 0.55, 0);
    c.lookAt(look);
    if (!narrow) { c.setViewOffset(1000, 1000, -190, 30, 1000, 1000); } else c.clearViewOffset();
    this.renderer.render(this.scene, c);
  }
}
