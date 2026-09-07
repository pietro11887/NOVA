import * as THREE from 'three';
import { Sky } from '../../vendor/examples/objects/Sky.js';
import { IS_MOBILE, clamp, lerp } from '../core/utils.js';

/**
 * Cielo atmosferico (modello di Preetham), sole direzionale con ombre,
 * nuvole e mappa d'ambiente per i riflessi. E' il pezzo che decide se la
 * scena sembra un rendering o un gioco di scatole.
 */
export class SkySystem {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;

    // --- cupola atmosferica
    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    skyIntensity(this.sky, 0.5);   // il modello di Preetham e' tarato su esposizioni basse
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6.5;
    u.rayleigh.value = 2.2;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.82;
    scene.add(this.sky);

    // --- nuvole alte, appena accennate (foschia californiana)
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(2400, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
      new THREE.MeshBasicMaterial({
        map: cloudTexture(), transparent: true, opacity: 0.55,
        depthWrite: false, side: THREE.BackSide, fog: false,
      })
    );
    this.clouds.position.y = -140;
    scene.add(this.clouds);

    // --- luci
    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
    this.sun.position.set(120, 220, 80);
    this.sun.castShadow = quality.shadows;
    if (quality.shadows) {
      const s = this.sun.shadow;
      s.mapSize.set(quality.shadowMap, quality.shadowMap);
      s.camera.near = 1;
      s.camera.far = 420;
      s.camera.left = -quality.shadowRange;
      s.camera.right = quality.shadowRange;
      s.camera.top = quality.shadowRange;
      s.camera.bottom = -quality.shadowRange;
      s.bias = -0.0006;
      s.normalBias = 0.5;
    }
    this.sunTarget = new THREE.Object3D();
    this.sun.target = this.sunTarget;
    scene.add(this.sun, this.sunTarget);

    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x6b5a44, 0.28);
    scene.add(this.hemi);

    // luce lunare: di notte il sole si spegne e senza questa non si vede nulla
    this.moonLight = new THREE.DirectionalLight(0x9fc0ff, 0);
    // ombre lunari solo dove c'e' margine: sono una seconda passata di shadow map
    this.moonLight.castShadow = !!quality.shadows && !IS_MOBILE && quality.tier >= 3;
    if (this.moonLight.castShadow) {
      const s = this.moonLight.shadow;
      s.mapSize.set(1024, 1024);
      s.camera.near = 1; s.camera.far = 420;
      s.camera.left = -60; s.camera.right = 60;
      s.camera.top = 60; s.camera.bottom = -60;
      s.bias = -0.0016;
      s.normalBias = 0.05;
    }
    this.moonTarget = new THREE.Object3D();
    this.moonLight.target = this.moonTarget;
    scene.add(this.moonLight, this.moonTarget);
    // luce di rimbalzo dal terreno: evita che i lati in ombra diventino neri
    this.bounce = new THREE.DirectionalLight(0xffd9b0, 0.35);
    this.bounce.position.set(-80, 40, -60);
    scene.add(this.bounce);

    // --- stelle e luna, accese solo di notte
    this.stars = new THREE.Mesh(
      new THREE.SphereGeometry(2600, 24, 12),
      new THREE.MeshBasicMaterial({
        map: starTexture(), side: THREE.BackSide, transparent: true,
        opacity: 0, depthWrite: false, fog: false, toneMapped: false,
      })
    );
    scene.add(this.stars);
    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshBasicMaterial({ map: moonTexture(), transparent: true, opacity: 0,
        depthWrite: false, fog: false, toneMapped: false })
    );
    scene.add(this.moon);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this._envScene = new THREE.Scene();
    this._envSky = new Sky();
    this._envSky.scale.setScalar(20000);
    skyIntensity(this._envSky, 0.8);
    this._envScene.add(this._envSky);
    this._lastEnvElev = -99;
    this._envRT = null;
    this.sunDir = new THREE.Vector3();

    this.fog = new THREE.FogExp2(0xbfd4e4, 0.0032);
    scene.fog = this.fog;
  }

  /**
   * @param {number} hour  ora del giorno 0..24
   * @param {THREE.Vector3} focus  posizione del giocatore (segue le ombre)
   */
  update(hour, focus) {
    // elevazione: -90 (notte fonda) .. +72 (mezzogiorno)
    const t = (hour - 6) / 24 * Math.PI * 2;
    const elev = Math.sin(t) * 72;
    const azim = 40 + hour * 12;
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const theta = THREE.MathUtils.degToRad(azim);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    this.elevation = elev;

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    const day = clamp((elev + 9) / 20, 0, 1);            // 0 = notte, 1 = giorno pieno
    const dusk = clamp(1 - Math.abs(elev + 2) / 16, 0, 1); // massimo all'alba/tramonto
    this.day = day; this.dusk = dusk; this.night = 1 - day;

    u.turbidity.value = lerp(2.2, 9.5, dusk);
    u.rayleigh.value = lerp(0.6, 2.5, day) + dusk * 1.6;
    u.mieCoefficient.value = lerp(0.004, 0.011, dusk);

    // --- luce solare
    this.sun.position.copy(this.sunDir).multiplyScalar(260).add(focus);
    this.sunTarget.position.copy(focus);
    this.sunTarget.updateMatrixWorld();
    this.sun.intensity = lerp(0.04, 3.15, day) * (1 - dusk * 0.3);
    this.sun.color.setHSL(lerp(0.11, 0.055, dusk), lerp(0.25, 0.75, dusk), lerp(0.96, 0.62, dusk));
    // l'ambiente arriva soprattutto dalla env map: l'emisferica e' solo di appoggio
    // di notte l'emisferica non scende quasi: senza, la citta' e' un muro nero
    this.hemi.intensity = lerp(0.62, 0.55, day);
    this.hemi.color.setHex(day > 0.5 ? 0xbcd8ff : 0x4a5f8c);
    this.hemi.groundColor.setHex(day > 0.4 ? 0x8a7a5e : 0x2b3242);

    const nightK = clamp((0.4 - day) / 0.4, 0, 1);
    this.moonLight.intensity = nightK * 0.95;
    this.moonLight.visible = nightK > 0.02;
    if (this.moonLight.visible) {
      this.moonLight.position.copy(this.sunDir).multiplyScalar(-190).add(focus);
      this.moonLight.position.y = Math.abs(this.moonLight.position.y) + 90;
      this.moonTarget.position.copy(focus);
      this.moonTarget.updateMatrixWorld();
    }
    this.bounce.intensity = lerp(0.03, 0.22, day);
    this.bounce.position.copy(focus).add(new THREE.Vector3(-70, 45, -55));

    // ombre agganciate al giocatore, allineate ai texel per non sfarfallare
    if (this.quality.shadows) {
      const c = this.sun.shadow.camera;
      const texel = (this.quality.shadowRange * 2) / this.quality.shadowMap;
      this.sun.position.x = Math.round(this.sun.position.x / texel) * texel;
      this.sun.position.z = Math.round(this.sun.position.z / texel) * texel;
      c.updateProjectionMatrix();
    }

    // --- foschia: prende il colore dell'orizzonte
    const horizon = new THREE.Color()
      .setHex(0x27354e)
      .lerp(new THREE.Color(0xbfd6e8), day)
      .lerp(new THREE.Color(0xe8a071), dusk * 0.75);
    this.fog.color.copy(horizon);
    this.fog.density = lerp(0.0018, 0.00062, day) + dusk * 0.0005;
    this.clouds.material.opacity = lerp(0.18, 0.5, day);
    this.clouds.material.color.copy(horizon).lerp(new THREE.Color(0xffffff), day * 0.7);
    this.clouds.rotation.y += 0.00004;
    // stelle e luna: compaiono col buio, la luna sta all'opposto del sole
    const starK = clamp((0.35 - day) / 0.35, 0, 1);
    this.stars.material.opacity = starK * 0.9;
    this.stars.rotation.y += 0.000012;
    this.moon.material.opacity = starK * 0.95;
    this.moon.position.copy(this.sunDir).multiplyScalar(-2100);
    this.moon.position.y = Math.abs(this.moon.position.y) * 0.75 + 300;
    this.moon.lookAt(0, 0, 0);
    this.horizonColor = horizon;

    // --- mappa d'ambiente: si rigenera solo quando il sole si e' mosso
    if (Math.abs(elev - this._lastEnvElev) > 3.5) {
      this._lastEnvElev = elev;
      this.refreshEnv();
    }
  }

  refreshEnv() {
    const eu = this._envSky.material.uniforms;
    const u = this.sky.material.uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) eu[k].value = u[k].value;
    eu.sunPosition.value.copy(this.sunDir);
    /*
     * fromScene restituisce un render target, non una texture sciolta.
     * Buttare via solo `.texture` lasciava in piedi il target a cui era
     * ancora agganciata: three cancellava la texture GL sotto un framebuffer
     * vivo e la mappa d'ambiente tornava piena di NaN. Ogni materiale la
     * campiona, quindi il NaN finiva ovunque, il bloom lo sfocava e mezzo
     * schermo diventava nero. Si dispone il target intero, e solo dopo aver
     * costruito quello nuovo.
     */
    const fresh = this.pmrem.fromScene(this._envScene, 0.04);
    const old = this._envRT;
    this._envRT = fresh;
    this.env = fresh.texture;
    this.scene.environment = this.env;
    if (old) old.dispose();
  }

  /** Il cielo segue il giocatore: la cupola non deve mai finire "dietro". */
  follow(pos) {
    this.sky.position.set(pos.x, 0, pos.z);
    this.clouds.position.set(pos.x, -140, pos.z);
    this.stars.position.set(pos.x, 0, pos.z);
    this.moon.position.x += pos.x;
    this.moon.position.z += pos.z;
  }
}

/** Scala l'uscita del cielo per adattarlo all'esposizione della scena. */
function skyIntensity(sky, value) {
  const m = sky.material;
  m.uniforms.skyIntensity = { value };
  m.fragmentShader = m.fragmentShader
    .replace('varying vec3 vSunDirection;', 'varying vec3 vSunDirection;\nuniform float skyIntensity;')
    .replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * skyIntensity, 1.0 );');
  m.needsUpdate = true;
}

/** Cielo stellato: puntini di dimensione e luminosita' diverse. */
function starTexture() {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * W;
    const y = Math.pow(Math.random(), 1.4) * H * 0.62;   // piu' fitte in alto
    const r = Math.random() < 0.92 ? Math.random() * 1.3 + 0.3 : Math.random() * 2.4 + 1;
    const a = 0.35 + Math.random() * 0.65;
    const tint = Math.random();
    ctx.fillStyle = tint < 0.75 ? `rgba(255,255,255,${a})`
      : tint < 0.9 ? `rgba(190,215,255,${a})` : `rgba(255,225,190,${a})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // via lattea appena accennata
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * W;
    const y = H * 0.22 + Math.sin(x / W * 6) * 90 + (Math.random() - 0.5) * 120;
    ctx.fillStyle = '#cfe0ff';
    ctx.beginPath(); ctx.arc(x, y, 8 + Math.random() * 22, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Luna con crateri e alone. */
function moonTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const glow = ctx.createRadialGradient(S / 2, S / 2, S * 0.16, S / 2, S / 2, S * 0.5);
  glow.addColorStop(0, 'rgba(232,238,255,0.55)');
  glow.addColorStop(0.5, 'rgba(200,215,255,0.12)');
  glow.addColorStop(1, 'rgba(200,215,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#eef1f6';
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(180,188,200,0.55)';
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * S * 0.13;
    ctx.beginPath();
    ctx.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 2 + Math.random() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Nuvole procedurali: fbm su canvas, niente asset da scaricare. */
function cloudTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S; c.height = S / 2;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S / 2);

  // banchi di nuvole disegnati come nuvole di cerchi sfumati
  for (let band = 0; band < 26; band++) {
    const cx = Math.random() * S;
    const cy = 40 + Math.random() * (S / 2 - 120);
    const puffs = 12 + (Math.random() * 18) | 0;
    const w = 90 + Math.random() * 240;
    ctx.globalAlpha = 0.05 + Math.random() * 0.07;
    for (let i = 0; i < puffs; i++) {
      const x = cx + (Math.random() - 0.5) * w;
      const y = cy + (Math.random() - 0.5) * w * 0.28;
      const r = 18 + Math.random() * 52;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
