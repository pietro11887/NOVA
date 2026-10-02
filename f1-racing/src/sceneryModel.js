import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Scenery, ENV } from './scenery.js';

// Ambientazione da modello 3D completo (Spa-Francorchamps di Dave Love, Sketchfab, CC BY 4.0):
// pista, cordoli, vie di fuga, barriere, tribune, box e boschi vengono dal modello; qui si
// aggiungono cielo, colline lontane, semaforo di partenza e posizioni delle tribune (pubblico).

const CDN = 'https://cdn.jsdelivr.net/gh/pietro11887/NOVA@main/f1-racing/assets/';

const mod = async f => (await import(new URL('../assets/' + f, import.meta.url).href)).default;
function b64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }

async function fetchGLB(name) {
  const tries = [
    async () => { const r = await fetch('assets/' + name); if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); },
    async () => b64(await mod(name + '.js')),
    // file grandi divisi in parti (.0.js, .1.js, ...)
    async () => { const parts = []; for (let i = 0; ; i++) { try { parts.push(await mod(name + '.' + i + '.js')); } catch (e) { if (!i) throw e; break; } } return b64(parts.join('')); },
    async () => { const r = await fetch(CDN + name); if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); },
  ];
  let last;
  for (const t of tries) { try { return await t(); } catch (e) { last = e; } }
  throw last;
}

// immagini decodificate senza indirizzi "blob:" (bloccati in alcune pagine)
function inlineImages(parser) {
  return {
    name: 'NOVA_inline_images_track',
    beforeRoot() {
      const original = parser.loadImageSource.bind(parser);
      parser.loadImageSource = (sourceIndex, loader) => {
        const def = parser.json.images[sourceIndex];
        if (def.bufferView === undefined) return original(sourceIndex, loader);
        if (parser.sourceCache[sourceIndex]) return parser.sourceCache[sourceIndex].then(t => t.clone());
        const p = parser.getDependency('bufferView', def.bufferView).then(buf => createImageBitmap(new Blob([buf], { type: def.mimeType })))
          .then(img => { const t = new THREE.Texture(img); t.needsUpdate = true; t.userData.mimeType = def.mimeType; return t; });
        parser.sourceCache[sourceIndex] = p;
        return p;
      };
      return null;
    },
  };
}

let loaded = null;
export async function loadTrackModel(file) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.register(inlineImages);
  const buf = await fetchGLB(file);
  const gltf = await new Promise((res, rej) => loader.parse(buf, '', res, rej));
  loaded = gltf.scene;
  return loaded;
}

const GROUND = /^(top-ext|GRASS|grass|carpet|asph|groove|line|kerb|CURB|sand|road-ext|Parking|doted|asph_|sbancamento|construction_dirt|water|new_AO|diss2)/;
const TREES = /^(trees|bushes|hedge|treesline)/;
const DECAL = /^(groove|new_AO|line|doted_line|diss2|texts|asph_patch_joint|ADV|construction_dirt)/;
const CUTOUT = /^(fence|grille|grilles|transp|fence2_at|fence-special|flag)/;

export class ModelScenery extends Scenery {
  setupLake() { this.lake = null; }

  build() {
    this.sky();
    this.farHills();
    const m = loaded;
    this.standPos = [];
    this.startLights = [];
    if (m) {
      const stands = new Map();
      m.traverse(o => {
        if (!o.isMesh) return;
        const name = (o.material && o.material.name) || '';
        const ground = GROUND.test(name);
        o.receiveShadow = true;
        o.castShadow = !ground && !this.low;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mt of mats) {
          if (!mt) continue;
          if (mt.map) mt.map.anisotropy = Math.min(8, this.aniso);
          if (TREES.test(name)) { mt.alphaTest = Math.max(mt.alphaTest || 0, 0.45); mt.transparent = false; mt.side = THREE.DoubleSide; }
          if (/start-lights/.test(name)) { mt.emissive = new THREE.Color(0xff1a10); mt.emissiveIntensity = 0; this.startLights.push(mt); }
          // erba del modello: texture chiara pensata per essere colorata
          if (/^GRASS/.test(name)) mt.color.setRGB(0.36, 0.52, 0.22);
          if (/^(asph|groove|road-ext)/.test(name)) { mt.roughness = 0.92; mt.metalness = 0; }
          // riflessi: nel modello alcuni valori sono esagerati (asfalto bianco)
          if (mt.specularColor) mt.specularColor.setRGB(1, 1, 1);
          if (mt.specularIntensity !== undefined) mt.specularIntensity = Math.min(mt.specularIntensity, 0.35);
          // pellicole sopra l'asfalto (gomma sulla traiettoria, ombre, righe, scritte): trasparenti e sopra la strada
          if (DECAL.test(name)) {
            mt.transparent = true; mt.depthWrite = false; mt.alphaTest = 0.02;
            mt.polygonOffset = true; mt.polygonOffsetFactor = -2; mt.polygonOffsetUnits = -4;
            o.renderOrder = 1; o.castShadow = false;
          }
          // reti, grate, vetri: con trasparenza
          if (CUTOUT.test(name)) { mt.alphaTest = 0.4; mt.transparent = false; mt.side = THREE.DoubleSide; o.castShadow = false; }
          if (/^Glass/.test(name)) { mt.transparent = true; mt.opacity = Math.min(mt.opacity, 0.45); mt.depthWrite = false; }
        }
        if (/gstand|grandstand|seat1/.test(name)) {
          o.geometry.computeBoundingBox();
          const c = o.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld);
          stands.set(o.uuid, c);
        }
      });
      // le tribune sono grandi: punti lungo la loro estensione per il rumore del pubblico
      m.updateMatrixWorld(true);
      m.traverse(o => {
        if (!o.isMesh || !/gstand|grandstand|seat1/.test((o.material && o.material.name) || '')) return;
        const P = o.geometry.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < P.count; i += Math.max(1, Math.floor(P.count / 40))) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); this.standPos.push(v.clone()); }
      });
      this.group.add(m);
    }
    this.batch.flush(this.group);
  }

  // colline delle Ardenne attorno al circuito (boschi verdi, niente neve)
  farHills() {
    const sun = ENV.sunDir, haze = new THREE.Color(0xa9c0d2);
    const forest = new THREE.Color(0x2f5a33), field = new THREE.Color(0x6d9150);
    const cx = this.center.x, cz = this.center.z, segA = this.low ? 120 : 200, segR = 6, R0 = 3600, W = 1100;
    const y0 = this.bounds ? Math.min(...this.track.samples.map(s => s.y)) - 60 : -80;
    const pos = [];
    for (let j = 0; j <= segR; j++) for (let i = 0; i <= segA; i++) {
      const a = i / segA * Math.PI * 2, t = j / segR, R = R0 + t * W;
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1)), 0.8);
      const n = 0.55 + 0.22 * Math.sin(a * 5 + 1.3) + 0.14 * Math.sin(a * 11 + t * 3) + 0.09 * Math.sin(a * 23 + 2);
      pos.push(cx + Math.cos(a) * R, y0 + 260 * env * n - (j === 0 || j === segR ? 30 : 0), cz + Math.sin(a) * R);
    }
    const idx = [];
    for (let j = 0; j < segR; j++) for (let i = 0; i < segA; i++) { const a = j * (segA + 1) + i, b = a + 1, c = a + segA + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g = g.toNonIndexed(); g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal, col = new Float32Array(P.count * 3), c = new THREE.Color(), nrm = new THREE.Vector3();
    for (let v = 0; v < P.count; v += 3) {
      nrm.set(N.getX(v), N.getY(v), N.getZ(v)).normalize();
      c.copy(Math.sin(P.getX(v) * 0.004) * Math.cos(P.getZ(v) * 0.005) > 0.3 ? field : forest).offsetHSL(0, 0, (Math.random() - 0.5) * 0.04);
      c.multiplyScalar(0.6 + 0.55 * Math.max(0, nrm.dot(sun))).lerp(haze, 0.4);
      for (let q = 0; q < 3; q++) col.set([c.r, c.g, c.b], (v + q) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    // terreno lontano sotto l'orizzonte
    const disk = new THREE.Mesh(new THREE.CircleGeometry(5200, 48), new THREE.MeshLambertMaterial({ color: 0x3d6337 }));
    disk.rotation.x = -Math.PI / 2; disk.position.set(cx, y0 + 4, cz);
    this.scene.add(disk);
  }

  // semaforo di partenza del modello
  setLights(nOn) { for (const m of this.startLights || []) m.emissiveIntensity = nOn > 0 ? 2.5 : 0; }
}
