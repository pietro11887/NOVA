// Card portraits: each card's 3D model rendered once (transparent background) into a PNG data URL,
// used as card art everywhere in the menus. Falls back to the emoji when WebGL is not available.

import * as THREE from 'three';
import { buildCardModel } from '../../game/models3d.js';

const cache = new Map();
let ctx = null;          // { renderer, scene, camera }
let failed = false;
const SIZE = 256;

function init() {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = Math.round(SIZE * 1.2);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, Math.round(SIZE * 1.2), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd7ff, 1.2);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, 1 / 1.2, 0.1, 100);
  ctx = { renderer, scene, camera };
}

/** Returns a data URL (cached) or null if 3D rendering is unavailable. */
export function cardPortrait(cardId) {
  if (cache.has(cardId)) return cache.get(cardId);
  if (failed) return null;
  try {
    if (!ctx) init();
    const { renderer, scene, camera } = ctx;
    const model = buildCardModel(cardId);
    model.animate({ t: 0.6, dt: 0, moving: false, attack: -1 });
    model.root.rotation.y = -0.45;           // three-quarter view
    scene.add(model.root);
    model.root.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(model.root);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.92;
    const dir = new THREE.Vector3(0, 0.38, 1).normalize();
    camera.position.copy(sphere.center).addScaledVector(dir, dist);
    camera.lookAt(sphere.center);

    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(model.root);
    model.root.traverse((o) => o.geometry?.dispose());
    cache.set(cardId, url);
    return url;
  } catch (err) {
    console.warn('Ritratti 3D non disponibili', err);
    failed = true;
    return null;
  }
}
