import * as THREE from 'three';
import { Sky } from '../../vendor/examples/objects/Sky.js';
import { clamp, lerp } from '../core/utils.js';

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
    // luce di rimbalzo dal terreno: evita che i lati in ombra diventino neri
    this.bounce = new THREE.DirectionalLight(0xffd9b0, 0.35);
    this.bounce.position.set(-80, 40, -60);
    scene.add(this.bounce);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this._envScene = new THREE.Scene();
    this._envSky = new Sky();
    this._envSky.scale.setScalar(20000);
    skyIntensity(this._envSky, 0.8);
    this._envScene.add(this._envSky);
    this._lastEnvElev = -99;
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

    u.turbidity.value = lerp(3.5, 9.5, dusk);
    u.rayleigh.value = lerp(0.6, 3.4, day) + dusk * 1.6;
    u.mieCoefficient.value = lerp(0.004, 0.011, dusk);

    // --- luce solare
    this.sun.position.copy(this.sunDir).multiplyScalar(260).add(focus);
    this.sunTarget.position.copy(focus);
    this.sunTarget.updateMatrixWorld();
    this.sun.intensity = lerp(0.04, 2.35, day) * (1 - dusk * 0.3);
    this.sun.color.setHSL(lerp(0.11, 0.055, dusk), lerp(0.25, 0.75, dusk), lerp(0.96, 0.62, dusk));
    // l'ambiente arriva soprattutto dalla env map: l'emisferica e' solo di appoggio
    this.hemi.intensity = lerp(0.18, 0.45, day);
    this.hemi.color.setHex(day > 0.5 ? 0xbcd8ff : 0x24344e);
    this.hemi.groundColor.setHex(day > 0.4 ? 0x8a7a5e : 0x171b25);
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
      .setHex(0x1a2436)
      .lerp(new THREE.Color(0xbfd6e8), day)
      .lerp(new THREE.Color(0xe8a071), dusk * 0.75);
    this.fog.color.copy(horizon);
    this.fog.density = lerp(0.0030, 0.0011, day) + dusk * 0.0005;
    this.clouds.material.opacity = lerp(0.18, 0.5, day);
    this.clouds.material.color.copy(horizon).lerp(new THREE.Color(0xffffff), day * 0.7);
    this.clouds.rotation.y += 0.00004;
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
    const old = this.env;
    this.env = this.pmrem.fromScene(this._envScene, 0.04).texture;
    this.scene.environment = this.env;
    if (old) old.dispose();
  }

  /** Il cielo segue il giocatore: la cupola non deve mai finire "dietro". */
  follow(pos) {
    this.sky.position.set(pos.x, 0, pos.z);
    this.clouds.position.set(pos.x, -140, pos.z);
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
