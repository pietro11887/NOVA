// Gara in notturna: torri di fari lungo la pista come a Singapore, in Bahrein o a Las Vegas.
// Pali alti dietro le barriere con un braccio verso la pista e una fila di proiettori accesi
// (bianchi "oltre il bianco": si accendono con il bagliore degli effetti TV).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function addNightLights(scene, track, sc) {
  const S = track.samples, n = S.length;
  if (!n) return null;
  const step = Math.max(1, Math.round(42 / (track.length / n)));   // un palo ogni ~42 m
  const poles = [];
  for (let i = 0, k = 0; i < n; i += step, k++) {
    const s = S[i];
    // dalla parte con più spazio (in curva, all'esterno), alternando sui rettilinei
    const wl = s.wallLVis ?? s.wallL, wr = s.wallRVis ?? s.wallR;
    let side = Math.abs(s.curv || 0) > 0.004 ? (s.curv > 0 ? 1 : -1) : (k % 2 ? 1 : -1);
    for (const sd of [side, -side]) {
      const w = sd > 0 ? wl : wr;
      if (!(w < 60)) continue;
      const d = w + 2.2;
      const x = s.x + s.nx * d * sd, z = s.z + s.nz * d * sd;
      if (sc.clearance && sc.clearance(x, z).d < 1.2) continue;          // un'altra parte della pista
      if (sc.inBuilding && sc.inBuilding(x, z, 1)) continue;
      const y = sc.heightAt ? Math.min(sc.heightAt(x, z), s.y + 1.5) : s.y;
      poles.push({ x, y, z, ax: -s.nx * sd, az: -s.nz * sd });
      break;
    }
  }
  if (!poles.length) return null;
  const H = 17, ARM = 3.2;
  const metal = [], heads = [], glass = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const pole = new THREE.CylinderGeometry(0.16, 0.3, H, 6).translate(0, H / 2, 0);
  const arm = new THREE.BoxGeometry(0.18, 0.18, ARM).translate(0, H - 0.4, ARM / 2);
  const frame = new THREE.BoxGeometry(2.6, 0.9, 0.35).translate(0, H - 0.7, ARM);
  const lens = new THREE.PlaneGeometry(0.7, 0.42);
  for (const p of poles) {
    q.setFromAxisAngle(up, Math.atan2(p.ax, p.az));
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(1, 1, 1));
    metal.push(pole.clone().applyMatrix4(m), arm.clone().applyMatrix4(m), frame.clone().applyMatrix4(m));
    // 2×4 proiettori inclinati verso l'asfalto
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      const g = lens.clone().rotateX(Math.PI / 2 + 0.55).translate(-0.96 + c * 0.64, H - 0.5 - r * 0.42, ARM + 0.19);
      glass.push(g.applyMatrix4(m));
    }
    heads.push(new THREE.Vector3(0, H - 0.7, ARM + 0.3).applyMatrix4(m));
  }
  const grp = new THREE.Group();
  const mm = new THREE.Mesh(mergeGeometries(metal), new THREE.MeshStandardMaterial({ color: 0x5c6066, metalness: 0.6, roughness: 0.5 }));
  mm.castShadow = false; mm.receiveShadow = false;
  grp.add(mm);
  const lamp = new THREE.Mesh(mergeGeometries(glass), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.8, 5.2), side: THREE.DoubleSide, toneMapped: false }));
  grp.add(lamp);
  // alone dei fari (sprite che si vede da lontano, anche nella foschia)
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.18, 'rgba(255,240,210,0.55)'); gr.addColorStop(0.5, 'rgba(255,225,180,0.12)'); gr.addColorStop(1, 'rgba(255,220,170,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
  const pg = new THREE.BufferGeometry().setFromPoints(heads);
  const glow = new THREE.Points(pg, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: 9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, color: 0xffffff }));
  glow.frustumCulled = false;
  grp.add(glow);
  scene.add(grp);
  return grp;
}

// Di notte la luce dei fari si ferma vicino alla pista: una mappa vista dall'alto (chiara lungo il
// tracciato, sempre più scura lontano) spegne la luce diretta di tutto ciò che è lontano dai fari.
// Si applica a tutti i materiali "fisici" della scena, una volta sola prima che vengano compilati.
export function nightShading(track) {
  const S = track.samples;
  if (!S || !S.length || typeof document === 'undefined') return;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const s of S) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); }
  const M = 450; x0 -= M; z0 -= M; x1 += M; z1 += M;
  const size = Math.max(x1 - x0, z1 - z0), N = 1024, k = N / size;
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  g.lineCap = g.lineJoin = 'round';
  const path = () => { g.beginPath(); S.forEach((s, i) => { const X = (s.x - x0) * k, Y = (s.z - z0) * k; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); };
  // fasce sempre più strette e più chiare: luce che cala allontanandosi dai fari
  for (const [w, a] of [[330, 0.12], [210, 0.16], [135, 0.22], [85, 0.3], [52, 0.42], [30, 0.6]]) {
    g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = Math.max(1.5, w * k); path(); g.stroke();
  }
  const blurred = document.createElement('canvas'); blurred.width = blurred.height = N;
  const b = blurred.getContext('2d'); b.filter = `blur(${Math.max(1, 10 * k).toFixed(1)}px)`; b.drawImage(cv, 0, 0);
  const tex = new THREE.CanvasTexture(blurred);
  tex.colorSpace = THREE.NoColorSpace; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const uni = { nightMask: { value: tex }, nightRect: { value: new THREE.Vector4(x0, z0, 1 / size, 1 / size) } };
  const C = THREE.ShaderChunk;
  C.common += '\nvarying vec2 vNightW;\n';
  C.project_vertex += `
  { vec4 nW = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
    nW = instanceMatrix * nW;
    #endif
    vNightW = ( modelMatrix * nW ).xz; }`;
  C.lights_pars_begin += '\nuniform sampler2D nightMask; uniform vec4 nightRect;\n';
  C.lights_fragment_end += `
  { float nl = texture2D( nightMask, ( vNightW - nightRect.xy ) * nightRect.zw ).r;
    nl = 0.05 + 0.95 * smoothstep( 0.0, 0.92, nl );
    reflectedLight.directDiffuse *= nl; reflectedLight.directSpecular *= nl;
    reflectedLight.indirectDiffuse *= 0.3 + 0.7 * nl; reflectedLight.indirectSpecular *= 0.35 + 0.65 * nl; }`;
  for (const k of ['standard', 'physical', 'lambert', 'phong', 'toon']) if (THREE.ShaderLib[k]) Object.assign(THREE.ShaderLib[k].uniforms, uni);
}
