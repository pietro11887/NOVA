// Three.js view of the battle. It reads the simulation state from arena.js every frame
// (entities, effects, time) and keeps a 3D object per entity: models, health bars, towers,
// spell effects and particles. Field coordinates (x 0..18, y 0..32) map to world (x-9, 0, y-16).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildCardModel, buildTower, buildRubble, mat } from './models3d.js';
import { getCard } from '../data/cards.js';

const W = 18, H = 32;
const TEAM = { 1: 0x3b82f6, '-1': 0xef4444 };
const UNIT_SCALE = 1.8; // characters are drawn chunkier than their collision radius
const toWorld = (x, y) => [x - W / 2, y - H / 2];

export class Arena3D {
  constructor(canvas, battle) {
    this.canvas = canvas;
    this.battle = battle;
    this.visuals = new Map();
    this.fxVis = new Map();
    this.labels = new Map();
    this.rubble = [];
    this.time = 0;

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.9;

    const [c1, c2] = battle.theme.colors;
    const sky = new THREE.Color(c2).lerp(new THREE.Color(0x87ceeb), 0.55);
    this.scene = new THREE.Scene();
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 45, 95);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 300);
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(r), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xdbeafe, new THREE.Color(0x3f6212).lerp(new THREE.Color(c1), 0.3), 0.5));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
    sun.position.set(-10, 26, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 4;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 22, bottom: -22, near: 1, far: 70 });
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Threshold above 1 in linear HDR: only emissive parts (orbs, visors, flames) glow, not the lit grass.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.3, 2.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.blobTex = makeBlobTexture();
    this.buildField(c1);
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // DOM layer for floating texts.
    this.overlay = document.createElement('div');
    this.overlay.className = 'arena-labels';
    canvas.parentElement.append(this.overlay);
  }

  // ── static scenery ──────────────────────────────────────────────────────
  buildField(themeColor) {
    const s = this.scene;
    // Checkerboard grass, one texel per tile.
    const PX = 64;                                  // texture pixels per tile
    const cv = document.createElement('canvas');
    cv.width = W * PX; cv.height = H * PX;
    const g = cv.getContext('2d');
    let gseed = 3;
    const grnd = () => ((gseed = (gseed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const light = (x + y) % 2 === 0;
      const j = (grnd() - 0.5) * 10;               // per-tile tone jitter
      const base = light ? [138 + j, 205 + j, 98 + j] : [118 + j, 190 + j, 84 + j];
      const X = x * PX, Y = y * PX;
      const grad = g.createLinearGradient(X, Y, X + PX, Y + PX);
      grad.addColorStop(0, `rgb(${base[0] + 14},${base[1] + 12},${base[2] + 8})`);
      grad.addColorStop(1, `rgb(${base[0] - 10},${base[1] - 12},${base[2] - 8})`);
      g.fillStyle = grad;
      g.fillRect(X, Y, PX, PX);
      for (let k = 0; k < 40; k++) {               // grass blades
        const bx = X + 3 + grnd() * (PX - 6), by = Y + 5 + grnd() * (PX - 8);
        g.strokeStyle = grnd() < 0.5 ? 'rgba(255,255,230,0.16)' : 'rgba(20,70,10,0.16)';
        g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + (grnd() - 0.5) * 3, by - 3 - grnd() * 4); g.stroke();
      }
      // bevel: light top/left edge, dark bottom/right edge
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(X, Y, PX, 3); g.fillRect(X, Y, 3, PX);
      g.fillStyle = 'rgba(20,60,10,0.28)';
      g.fillRect(X, Y + PX - 3, PX, 3); g.fillRect(X + PX - 3, Y, 3, PX);
    }
    // Worn dirt lanes from the bridges toward the side towers
    for (const bx of [3.5, 14.5]) for (const [y0, y1] of [[7, 15], [17, 25]]) {
      for (let k = 0; k < 900; k++) {
        const px = (bx - 0.9 + grnd() * 1.8) * PX, py = (y0 + grnd() * (y1 - y0)) * PX;
        g.fillStyle = `rgba(${150 + grnd() * 30},${110 + grnd() * 20},${60 + grnd() * 20},0.22)`;
        g.beginPath(); g.arc(px, py, 2 + grnd() * 4, 0, Math.PI * 2); g.fill();
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    const field = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = true;
    s.add(field);

    // Outer meadow
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: new THREE.Color(0x3f7d34).lerp(new THREE.Color(themeColor), 0.15), roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    outer.receiveShadow = true;
    s.add(outer);

    // Stone curb: individual rounded blocks with colour variation (instanced)
    {
      const blocks = [];
      for (let x = -W / 2 - 0.5; x <= W / 2 + 0.5; x += 1) blocks.push([x, -H / 2 - 0.45], [x, H / 2 + 0.45]);
      for (let z = -H / 2 + 0.5; z < H / 2; z += 1) if (Math.abs(z) > 1.2) blocks.push([-W / 2 - 0.45, z], [W / 2 + 0.45, z]);
      const geo = new RoundedBoxGeometry(0.96, 0.5, 0.86, 3, 0.12);
      const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), blocks.length);
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      blocks.forEach(([x, z], i) => {
        const vertical = Math.abs(x) > W / 2;
        m4.makeRotationY(vertical ? Math.PI / 2 + (Math.random() - 0.5) * 0.06 : (Math.random() - 0.5) * 0.06);
        m4.setPosition(x, 0.2 + Math.random() * 0.05, z);
        inst.setMatrixAt(i, m4);
        inst.setColorAt(i, col.setHSL(0.1, 0.06, 0.6 + Math.random() * 0.12));
      });
      inst.castShadow = inst.receiveShadow = true;
      s.add(inst);
    }

    // Grass tufts and flowers around the arena (instanced)
    {
      const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.45, 5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), 1400);
      const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), 260);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
      const outside = () => {
        for (;;) {
          const x = (Math.random() - 0.5) * 60, z = (Math.random() - 0.5) * 75;
          if ((Math.abs(x) > W / 2 + 1 || Math.abs(z) > H / 2 + 1) && Math.abs(z) > 1.3) return [x, z];
        }
      };
      for (let i = 0; i < 1400; i++) {
        const [x, z] = outside();
        e.set((Math.random() - 0.5) * 0.5, Math.random() * 6, (Math.random() - 0.5) * 0.5);
        m4.compose(new THREE.Vector3(x, 0.2, z), q.setFromEuler(e), new THREE.Vector3(1, 0.6 + Math.random() * 0.8, 1));
        tufts.setMatrixAt(i, m4);
        tufts.setColorAt(i, col.setHSL(0.26 + Math.random() * 0.06, 0.55, 0.32 + Math.random() * 0.12));
      }
      const petals = [0xfef08a, 0xf9a8d4, 0xffffff, 0xc4b5fd, 0xfca5a5];
      for (let i = 0; i < 260; i++) {
        const [x, z] = outside();
        m4.makeTranslation(x, 0.12, z);
        flowers.setMatrixAt(i, m4);
        flowers.setColorAt(i, col.setHex(petals[i % petals.length]));
      }
      tufts.receiveShadow = flowers.castShadow = true;
      s.add(tufts, flowers);
    }

    // River with scrolling stripes
    const wc = document.createElement('canvas');
    wc.width = 64; wc.height = 64;
    const wg = wc.getContext('2d');
    wg.fillStyle = '#2aa7e8'; wg.fillRect(0, 0, 64, 64);
    wg.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 6; i++) wg.fillRect((i * 23) % 64, 10 + i * 9, 18, 3);
    this.waterTex = new THREE.CanvasTexture(wc);
    this.waterTex.wrapS = this.waterTex.wrapT = THREE.RepeatWrapping;
    this.waterTex.repeat.set(10, 1);
    this.waterTex.colorSpace = THREE.SRGBColorSpace;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W + 30, 2), new THREE.MeshPhysicalMaterial({ map: this.waterTex, color: 0x9fe3ff, roughness: 0.08, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.92 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.03;
    water.receiveShadow = true;
    s.add(water);
    for (const sz of [-1.08, 1.08]) {
      const bank = new THREE.Mesh(new RoundedBoxGeometry(W + 30, 0.22, 0.26, 2, 0.08), mat(0x8b8378, { rough: 0.95 }));
      bank.position.set(0, 0.1, sz);
      bank.receiveShadow = bank.castShadow = true;
      s.add(bank);
      const foam = new THREE.Mesh(new THREE.PlaneGeometry(W + 30, 0.14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(0, 0.045, sz * 0.86);
      s.add(foam);
      (this.foams ??= []).push(foam);
    }

    // Bridges
    const wood = mat(0xa16207), woodDark = mat(0x713f12);
    for (const bx of [3.5, 14.5]) {
      const [x] = toWorld(bx, 0);
      const bridge = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.34), i % 2 ? wood : woodDark);
        plank.position.set(0, 0.16, -1.2 + i * 0.4);
        plank.castShadow = plank.receiveShadow = true;
        bridge.add(plank);
      }
      for (const sx of [-1.12, 1.12]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.8), woodDark);
        rail.position.set(sx, 0.55, 0);
        rail.castShadow = true;
        bridge.add(rail);
        for (const pz of [-1.3, 0, 1.3]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), woodDark);
          post.position.set(sx, 0.35, pz);
          post.castShadow = true;
          bridge.add(post);
        }
      }
      bridge.position.x = x;
      s.add(bridge);
    }

    // Trees and rocks around the arena
    const leaf = [mat(0x3f9142, { rough: 0.8 }), mat(0x4ea64a, { rough: 0.8 }), mat(0x2f7a3a, { rough: 0.8 })];
    const trunk = mat(0x6b4226);
    const rock = mat(0x8b8f99, { rough: 1 });
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      const x = (rnd() - 0.5) * 70, z = (rnd() - 0.5) * 80;
      if (Math.abs(x) < W / 2 + 1.5 && Math.abs(z) < H / 2 + 1.5) continue;
      if (Math.abs(z) < 1.5) continue; // keep the river clear
      const tree = new THREE.Group();
      const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.8, 6), trunk);
      t1.position.y = 0.4;
      const h = 1.6 + rnd() * 1.4;
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.9 + rnd() * 0.4, 12, 9), leaf[i % 3]);
      c.position.y = 0.8 + h * 0.45;
      const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), leaf[(i + 1) % 3]);
      c2.position.set(0.4, 0.8 + h * 0.75, 0.2);
      t1.castShadow = c.castShadow = c2.castShadow = true;
      tree.add(t1, c, c2);
      tree.position.set(x, 0, z);
      s.add(tree);
      if (i % 3 === 0) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + rnd() * 0.4, 0), rock);
        r.position.set(x + 1.5, 0.2, z - 1);
        r.castShadow = true;
        s.add(r);
      }
    }

    // Deploy zone highlight (enemy half, shown while a troop card is selected)
    this.forbidden = new THREE.Mesh(new THREE.PlaneGeometry(W, 17.4), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.22, depthWrite: false }));
    this.forbidden.rotation.x = -Math.PI / 2;
    this.forbidden.position.set(0, 0.06, -H / 2 + 17.4 / 2);
    this.forbidden.visible = false;
    s.add(this.forbidden);

    // Placement ghost
    this.ghost = new THREE.Group();
    this.ghostRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    this.ghostDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
    for (const m of [this.ghostRing, this.ghostDisc]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.08; this.ghost.add(m); }
    this.ghost.visible = false;
    s.add(this.ghost);
    this.ghostModel = null;
    this.ghostCard = null;
  }

  // ── camera ──────────────────────────────────────────────────────────────
  resize(w, h) {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
  }

  /**
   * Tries a few pitches; for each finds the closest distance where the field fits the width and the
   * height span, then pans the image (view offset) so the field is centred. Keeps the biggest result.
   */
  fitCamera() {
    const cam = this.camera;
    const corners = [];
    for (const x of [-W / 2 - 0.6, W / 2 + 0.6]) for (const z of [-H / 2 - 0.6, H / 2 + 0.6]) corners.push(new THREE.Vector3(x, 0, z));
    const tops = [new THREE.Vector3(0, 4.6, -H / 2 + 3.2)];
    const pts = [...corners, ...tops];
    const target = new THREE.Vector3(0, 0, 0.8);
    cam.clearViewOffset();

    const place = (pitch, dist) => {
      const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
    };
    const project = () => pts.map((p) => p.clone().project(cam));
    const fits = () => {
      const v = project();
      if (v.some((p) => p.z >= 1 || Math.abs(p.x) > 0.985)) return false;
      const ys = v.map((p) => p.y);
      return Math.max(...ys) - Math.min(...ys) <= 1.95;
    };
    const area = () => {
      const v = corners.map((p) => p.clone().project(cam));
      const [a, b, c, d] = [v[0], v[1], v[3], v[2]];
      const poly = [a, b, c, d];
      let s = 0;
      for (let i = 0; i < 4; i++) { const p = poly[i], q = poly[(i + 1) % 4]; s += p.x * q.y - q.x * p.y; }
      return Math.abs(s) / 2;
    };

    let best = null;
    for (let deg = 62; deg <= 74; deg += 3) {
      const pitch = THREE.MathUtils.degToRad(deg);
      let lo = 8, hi = 160;
      for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2;
        place(pitch, mid);
        if (fits()) hi = mid; else lo = mid;
      }
      place(pitch, hi);
      const a = area();
      if (!best || a > best.a) best = { pitch, dist: hi, a };
    }
    place(best.pitch, best.dist);
    const ys = project().map((p) => p.y);
    const centre = (Math.max(...ys) + Math.min(...ys)) / 2;
    cam.setViewOffset(this.width, this.height, 0, -centre * this.height / 2, this.width, this.height);
    cam.updateProjectionMatrix();
    // Fog only on the far scenery, never on the field.
    const d = cam.position.distanceTo(target);
    this.scene.fog.near = d + 12;
    this.scene.fog.far = d + 70;
    this.camDist = d;
  }

  /** Screen point → field coordinates, or null if off the ground. */
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return { x: hit.x + W / 2, y: hit.z + H / 2 };
  }

  // ── per-frame sync ──────────────────────────────────────────────────────
  render(dt) {
    this.time += dt;
    const b = this.battle;
    this.waterTex.offset.x += dt * 0.08;
    this.foams?.forEach((f, i) => { f.material.opacity = 0.4 + Math.sin(this.time * 2 + i * 2) * 0.15; });

    const alive = new Set();
    for (const e of b.ents) {
      alive.add(e.id);
      let v = this.visuals.get(e.id);
      if (!v) v = this.createVisual(e);
      this.updateVisual(v, e, dt);
    }
    for (const [id, v] of this.visuals) {
      if (alive.has(id)) continue;
      if (v.kind === 'tower') {
        const r = buildRubble();
        r.position.copy(v.model.root.position);
        r.scale.setScalar(v.isKing ? 1.6 : 1.1);
        this.scene.add(r);
      }
      this.removeVisual(v);
      this.visuals.delete(id);
    }

    this.syncFx(dt);
    this.updateGhost();
    this.composer.render(dt);
  }

  createVisual(e) {
    const team = TEAM[e.side];
    let model, kind = e.kind;
    if (e.kind === 'tower') {
      model = buildTower(e.isKing, team);
      model.height = e.isKing ? 4.3 : 3.6;
    } else {
      model = buildCardModel(e.card.id, team);
      const k = (e.kind === 'building' ? 1.25 : UNIT_SCALE) * (e.mini ? 0.65 : 1);
      model.root.scale.multiplyScalar(k);
      model.height *= k;
    }
    const [x, z] = toWorld(e.x, e.y);
    model.root.position.set(x, 0, z);
    model.root.rotation.y = e.side === 1 ? Math.PI : 0;
    model.root.traverse((o) => { if (o.isMesh) o.castShadow = o.castShadow !== false; });
    if (e.kind !== 'tower') {
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false, opacity: 0.55 }));
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.025;
      blob.renderOrder = 1;
      model.root.add(blob);
    }
    this.scene.add(model.root);

    const bar = this.makeBar(e.kind === 'tower' ? 2.4 : Math.max(0.9, e.r * 2.2), e.kind === 'tower' ? 0.3 : 0.14, team);
    this.scene.add(bar.group);
    const v = { id: e.id, kind, model, bar, angle: model.root.rotation.y, isKing: e.isKing, side: e.side, spawnT: 0 };
    if (e.kind === 'tower') {
      v.label = this.makeTextSprite();
      this.scene.add(v.label.sprite);
      if (model.aim) model.aim.rotation.y = e.side === 1 ? Math.PI : 0;
    }
    this.visuals.set(e.id, v);
    return v;
  }

  updateVisual(v, e, dt) {
    const root = v.model.root;
    const [x, z] = toWorld(e.x, e.y);
    root.position.x += (x - root.position.x) * Math.min(1, dt * 20);
    root.position.z += (z - root.position.z) * Math.min(1, dt * 20);

    // Facing: toward movement/target direction, smoothly.
    if (e.dir && (e.dir.x || e.dir.y)) {
      const want = Math.atan2(e.dir.x, e.dir.y);
      const obj = v.kind === 'tower' ? v.model.aim : root;
      if (obj) {
        let diff = want - obj.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        obj.rotation.y += diff * Math.min(1, dt * (v.kind === 'tower' ? 8 : 10));
      }
    }

    const dur = Math.min(0.5, Math.max(0.25, (e.hitSpeed ?? 1) * 0.6));
    const since = e.attackAt != null ? (this.battle.time - e.attackAt) / dur : 2;
    const attack = since >= 0 && since < 1 ? since : -1;
    v.model.animate({ t: this.time + v.id * 0.37, dt, moving: Boolean(e.moving), attack, stunned: e.stun > 0 });

    // Deploy: drop in and pop.
    if (e.deploy > 0 && v.kind !== 'tower') {
      const k = 1 - Math.min(1, e.deploy / 0.8);
      root.position.y = (1 - k) * 2.2;
      root.scale.setScalar((e.mini ? 0.65 : 1) * (v.baseScale ??= root.scale.x / (e.mini ? 0.65 : 1)) * (0.6 + k * 0.4));
    } else if (v.kind !== 'tower') {
      root.position.y = 0;
      if (v.baseScale) root.scale.setScalar(v.baseScale * (e.mini ? 0.65 : 1));
    }

    // Stun stars
    if (e.stun > 0) {
      if (!v.stunFx) {
        v.stunFx = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 12), mat(0xfde047, { emissive: 1 }));
        v.stunFx.rotation.x = Math.PI / 2;
        this.scene.add(v.stunFx);
      }
      v.stunFx.visible = true;
      v.stunFx.position.set(root.position.x, v.model.height + 0.1, root.position.z);
      v.stunFx.rotation.z += dt * 8;
    } else if (v.stunFx) v.stunFx.visible = false;

    // Tower: sleep marker for an inactive king
    if (v.model.sleep) {
      v.model.sleep.visible = !e.active;
      if (!e.active && !v.zzz) {
        v.zzz = this.makeTextSprite('💤', 64);
        v.zzz.sprite.scale.set(0.9, 0.9, 1);
        v.model.sleep.add(v.zzz.sprite);
      }
      if (v.zzz) v.zzz.sprite.position.y = Math.sin(this.time * 2) * 0.2;
    }

    // Health bar (always for towers, only when hurt for troops)
    const ratio = Math.max(0, e.hp / e.maxHp);
    const showBar = v.kind === 'tower' || ratio < 0.999 || e.shield > 0;
    v.bar.group.visible = showBar;
    if (showBar) {
      v.bar.group.position.set(root.position.x, root.position.y + v.model.height + 0.25, root.position.z);
      v.bar.group.quaternion.copy(this.camera.quaternion);
      v.bar.fill.scale.x = Math.max(0.0001, ratio);
      v.bar.shield.visible = e.shield > 0;
    }
    if (v.label) {
      const hp = Math.ceil(e.hp);
      if (v.label.value !== hp) v.label.set(String(hp));
      v.label.sprite.position.set(root.position.x, v.model.height + 0.62, root.position.z);
    }
  }

  removeVisual(v) {
    this.scene.remove(v.model.root);
    this.scene.remove(v.bar.group);
    if (v.label) this.scene.remove(v.label.sprite);
    if (v.stunFx) this.scene.remove(v.stunFx);
    disposeTree(v.model.root);
    disposeTree(v.bar.group);
  }

  makeBar(w, h, team) {
    const group = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.08, h + 0.08), new THREE.MeshBasicMaterial({ color: 0x0f172a, depthTest: false, transparent: true, opacity: 0.85 }));
    const fillGeo = new THREE.PlaneGeometry(w, h);
    fillGeo.translate(w / 2, 0, 0);
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: team === TEAM[1] ? 0x60a5fa : 0xf87171, depthTest: false, transparent: true }));
    fill.position.x = -w / 2;
    const shield = new THREE.Mesh(new THREE.PlaneGeometry(w, h * 0.35), new THREE.MeshBasicMaterial({ color: 0xe0f2fe, depthTest: false, transparent: true }));
    shield.position.y = h * 0.7;
    for (const m of [bg, fill, shield]) m.renderOrder = 10;
    fill.renderOrder = 11;
    group.add(bg, fill, shield);
    return { group, fill, shield };
  }

  makeTextSprite(initial = '', size = 48) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 64;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.renderOrder = 12;
    sprite.scale.set(1.6, 0.8, 1);
    const api = {
      sprite, value: null,
      set(text) {
        api.value = Number(text) || text;
        ctx.clearRect(0, 0, 128, 64);
        ctx.font = `900 ${size * 0.8}px Nunito, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#0f172a';
        ctx.strokeText(text, 64, 34);
        ctx.fillStyle = '#fff';
        ctx.fillText(text, 64, 34);
        tex.needsUpdate = true;
      },
    };
    if (initial) api.set(initial);
    return api;
  }

  // ── effects ─────────────────────────────────────────────────────────────
  syncFx(dt) {
    const live = new Set(this.battle.fx);
    for (const f of this.battle.fx) {
      let v = this.fxVis.get(f);
      if (!v) { v = this.createFx(f); this.fxVis.set(f, v); }
      if (v) this.updateFx(v, f, dt);
    }
    for (const [f, v] of this.fxVis) {
      if (live.has(f)) continue;
      if (v) {
        if (v.obj) { this.scene.remove(v.obj); disposeTree(v.obj); }
        v.el?.remove();
      }
      this.fxVis.delete(f);
    }
  }

  createFx(f) {
    const add = (o) => { this.scene.add(o); return o; };
    const [x, z] = toWorld(f.x, f.y);
    switch (f.type) {
      case 'shot': {
        const o = add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: f.color })));
        return { obj: o };
      }
      case 'hit': {
        const o = add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })));
        o.position.set(x, 0.7, z);
        return { obj: o };
      }
      case 'blast': {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: f.color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.1;
        const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0.35, depthWrite: false }));
        g.add(ring, dome);
        let model = null;
        if (f.cardId) {
          model = buildCardModel(f.cardId);
          g.add(model.root);
        }
        g.position.set(x, 0, z);
        return { obj: add(g), ring, dome, model };
      }
      case 'zone': {
        const g = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CircleGeometry(f.radius, 40), new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0.3, depthWrite: false }));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.08;
        g.add(disc);
        let model = null;
        if (f.cardId) {
          model = buildCardModel(f.cardId);
          model.root.scale.setScalar(f.radius * 0.7);
          g.add(model.root);
        } else {
          // Burning ground: a few flickering flames
          model = { root: new THREE.Group(), animate: ({ t }) => model.root.children.forEach((c, i) => { c.scale.y = 0.8 + Math.sin(t * 14 + i * 2) * 0.35; }) };
          for (let i = 0; i < 6; i++) {
            const a = i * 1.05;
            const fl = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 6), mat(0xf97316, { emissive: 1 }));
            fl.position.set(Math.cos(a) * f.radius * 0.5, 0.3, Math.sin(a) * f.radius * 0.5);
            model.root.add(fl);
          }
          g.add(model.root);
        }
        g.position.set(x, 0, z);
        return { obj: add(g), disc, model };
      }
      case 'poof': {
        const g = new THREE.Group();
        const big = f.art === '💥';
        for (let i = 0; i < (big ? 12 : 6); i++) {
          const p = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.45 : 0.22, 7, 5), new THREE.MeshBasicMaterial({ color: big ? (i % 2 ? 0xf97316 : 0x78716c) : 0xe5e7eb, transparent: true }));
          const a = (i / (big ? 12 : 6)) * Math.PI * 2;
          p.userData.v = new THREE.Vector3(Math.cos(a), 1 + Math.random(), Math.sin(a)).multiplyScalar(big ? 2.5 : 1.4);
          p.position.y = big ? 1.5 : 0.5;
          g.add(p);
        }
        g.position.set(x, 0, z);
        return { obj: add(g) };
      }
      case 'text': {
        const el = document.createElement('div');
        el.className = 'arena-float' + (f.small ? ' small' : '');
        el.textContent = f.text;
        this.overlay.append(el);
        return { el };
      }
      default:
        return null;
    }
  }

  updateFx(v, f, dt) {
    const k = Math.min(1, f.t / f.life);
    switch (f.type) {
      case 'shot': {
        const [x0, z0] = toWorld(f.x, f.y), [x1, z1] = toWorld(f.tx, f.ty);
        v.obj.position.set(x0 + (x1 - x0) * k, 1.0 + Math.sin(k * Math.PI) * 0.9, z0 + (z1 - z0) * k);
        break;
      }
      case 'hit':
        v.obj.scale.setScalar(0.5 + k * 1.5);
        v.obj.material.opacity = 1 - k;
        break;
      case 'blast': {
        const r = f.radius * (0.3 + k * 0.7);
        v.ring.scale.setScalar(r);
        v.ring.material.opacity = 1 - k;
        v.dome.scale.set(r, r * 0.6, r);
        v.dome.material.opacity = 0.4 * (1 - k);
        if (v.model) {
          v.model.root.position.y = Math.max(0, 3 - k * 9);
          v.model.root.scale.setScalar(Math.max(0.01, 1.2 * (1 - k)));
          v.model.animate({ t: this.time, dt });
        }
        break;
      }
      case 'zone':
        v.disc.material.opacity = 0.22 + Math.sin(f.t * 6) * 0.08;
        if (f.pull) v.disc.rotation.z += dt * 3;
        v.model?.animate({ t: this.time, dt });
        if (v.model && f.cardId) v.model.root.position.y = 0.6 + Math.sin(f.t * 3) * 0.15;
        v.obj.scale.setScalar(k > 0.85 ? Math.max(0.01, (1 - k) / 0.15) : 1);
        break;
      case 'poof':
        v.obj.children.forEach((p) => {
          p.position.addScaledVector(p.userData.v, dt);
          p.userData.v.y -= dt * 3;
          p.material.opacity = 1 - k;
          p.scale.setScalar(1 + k);
        });
        break;
      case 'text': {
        const p = new THREE.Vector3(...[toWorld(f.x, f.y)].flatMap(([x, z]) => [x, 1.5 + k * 1.5, z])).project(this.camera);
        v.el.style.left = ((p.x + 1) / 2) * 100 + '%';
        v.el.style.top = ((1 - p.y) / 2) * 100 + '%';
        v.el.style.opacity = String(1 - k * k);
        break;
      }
    }
  }

  // ── placement preview ───────────────────────────────────────────────────
  updateGhost() {
    const b = this.battle;
    const selected = !b.spectate && b.selected >= 0 ? getCard(b.sides[1].hand[b.selected]) : null;
    this.forbidden.visible = Boolean(selected && selected.type !== 'spell');
    if (!selected || !b.pointer) {
      this.ghost.visible = false;
      return;
    }
    const ok = b.canDeploy(1, selected, b.pointer.x, b.pointer.y);
    const [x, z] = toWorld(b.pointer.x, b.pointer.y);
    const r = selected.type === 'spell' ? selected.stats.radius : selected.type === 'building' ? 1 : 0.7;
    this.ghost.visible = true;
    this.ghost.position.set(x, 0, z);
    this.ghostRing.scale.setScalar(r);
    this.ghostDisc.scale.setScalar(r);
    const col = ok ? 0xffffff : 0xef4444;
    this.ghostRing.material.color.setHex(col);
    this.ghostDisc.material.color.setHex(col);

    if (this.ghostCard !== selected.id) {
      if (this.ghostModel) { this.ghost.remove(this.ghostModel.root); disposeTree(this.ghostModel.root); }
      this.ghostModel = buildCardModel(selected.id, TEAM[1]);
      this.ghostModel.root.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.5;
          o.material.depthWrite = false;
          o.castShadow = false;
        }
      });
      this.ghostModel.root.rotation.y = Math.PI;
      this.ghostModel.root.scale.multiplyScalar(selected.type === 'building' ? 1.25 : UNIT_SCALE);
      this.ghost.add(this.ghostModel.root);
      this.ghostCard = selected.id;
    }
    this.ghostModel.animate({ t: this.time, dt: 0, moving: false, attack: -1 });
  }

  dispose() {
    this.overlay.remove();
    this.composer.dispose?.();
    disposeTree(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

/** Frees geometries (materials are shared through the cache in models3d, except non-cached ones). */
function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !o.material.__cached && o.material.isMeshBasicMaterial) o.material.dispose();
    if (o.material?.map && o.isSprite) o.material.map.dispose();
  });
}

/** Radial soft shadow used under units (contact shadow). */
function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
