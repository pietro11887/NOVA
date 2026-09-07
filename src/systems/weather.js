import * as THREE from 'three';
import { clamp, lerp } from '../core/utils.js';

/**
 * Meteo: sereno -> nuvoloso -> pioggia -> temporale e ritorno.
 * Non e' solo una particellare: bagna l'asfalto, abbassa il sole, alza la
 * foschia e fa lampeggiare il cielo. Tutto procedurale.
 */
const STATES = ['sereno', 'nuvoloso', 'pioggia', 'temporale'];
const LABEL = { sereno: '☀️ Sereno', nuvoloso: '☁️ Nuvoloso', pioggia: '🌧️ Pioggia', temporale: '⛈️ Temporale' };

export class Weather {
  constructor(game) {
    this.game = game;
    this.state = 'sereno';
    this.wet = 0;            // 0 asciutto .. 1 fradicio
    this.rain = 0;           // intensita' della pioggia
    this.target = 0;
    this.timer = 90 + Math.random() * 120;
    this.flash = 0;
    this.thunderT = 0;
    this._baseRough = new Map();
    this._buildRain();
  }

  // ------------------------------------------------------------- particelle
  _buildRain() {
    const N = this.game.quality.tier >= 3 ? 4200 : 1800;
    this.count = N;
    const pos = new Float32Array(N * 6);      // due vertici per goccia
    this.seed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.seed[i * 3] = (Math.random() - 0.5) * 34;      // x
      this.seed[i * 3 + 1] = Math.random() * 26;          // y
      this.seed[i * 3 + 2] = (Math.random() - 0.5) * 34;  // z
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xbfd4e8, transparent: true, opacity: 0, depthWrite: false, fog: true,
    });
    this.mesh = new THREE.LineSegments(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.game.scene.add(this.mesh);

    // velo di spruzzi al suolo: rende la pioggia "atterrata"
    const sg = new THREE.PlaneGeometry(70, 70, 1, 1);
    sg.rotateX(-Math.PI / 2);
    this.splash = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({
      map: splashTexture(), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.splash.visible = false;
    this.game.scene.add(this.splash);
  }

  /** Forza uno stato (usato dal menu e dai test). */
  set(state) {
    if (!STATES.includes(state)) return;
    this.state = state;
    this.timer = 120 + Math.random() * 150;
  }

  get label() { return LABEL[this.state]; }

  // ------------------------------------------------------------------ ciclo
  update(dt, camera) {
    this.timer -= dt;
    if (this.timer <= 0) {
      // catena di Markov semplice: il tempo cambia per gradi, non a scatti
      const next = {
        sereno: ['sereno', 'nuvoloso', 'nuvoloso'],
        nuvoloso: ['sereno', 'pioggia', 'pioggia', 'nuvoloso'],
        pioggia: ['nuvoloso', 'temporale', 'pioggia'],
        temporale: ['pioggia', 'pioggia', 'nuvoloso'],
      }[this.state];
      const before = this.state;
      this.state = next[(Math.random() * next.length) | 0];
      this.timer = 100 + Math.random() * 160;
      if (this.state !== before) this.game.hud?.toast?.(this.label);
    }

    this.target = this.state === 'pioggia' ? 0.75 : this.state === 'temporale' ? 1 : 0;
    this.rain += clamp((this.target - this.rain) * dt * 0.35, -dt * 0.25, dt * 0.25);
    this.rain = clamp(this.rain, 0, 1);
    // l'asfalto si bagna in fretta e asciuga piano, come nella realta'
    const dry = this.rain > 0.05 ? dt * 0.22 : -dt * 0.035;
    this.wet = clamp(this.wet + dry, 0, 1);

    this._drops(dt, camera);
    this._surfaces();
    this._sky(dt);
  }

  _drops(dt, camera) {
    const on = this.rain > 0.02 && !this.game.interiors.current;
    this.mesh.visible = on;
    this.splash.visible = on;
    if (!on) { this.game.audio.setRain?.(0); return; }

    const p = camera.position;
    this.mesh.material.opacity = 0.16 + this.rain * 0.22;
    this.splash.material.opacity = this.rain * 0.1;
    this.splash.position.set(p.x, 0.06, p.z);
    this.game.audio.setRain?.(this.rain);

    const speed = 34 + this.rain * 22;
    const wind = this.state === 'temporale' ? 6.5 : 2.4;
    const t = this.game.time;
    const arr = this.mesh.geometry.attributes.position.array;
    const len = 0.45 + this.rain * 0.45;
    const n = Math.round(this.count * (0.35 + this.rain * 0.65));
    for (let i = 0; i < this.count; i++) {
      const o = i * 6;
      if (i >= n) { arr[o] = arr[o + 1] = arr[o + 2] = arr[o + 3] = arr[o + 4] = arr[o + 5] = 0; continue; }
      const sx = this.seed[i * 3], sy = this.seed[i * 3 + 1], sz = this.seed[i * 3 + 2];
      // colonna d'aria che segue la camera, con avvolgimento su y
      const y = 26 - ((sy + t * speed) % 26);
      const x = p.x + sx + y * wind * 0.02;
      const z = p.z + sz;
      arr[o] = x; arr[o + 1] = y; arr[o + 2] = z;
      arr[o + 3] = x - wind * 0.05 * len; arr[o + 4] = y - len * 2.2; arr[o + 5] = z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  /** Bagnato: le superfici piatte diventano lisce e riflettenti. */
  _surfaces() {
    const m = this.game.city.mats;
    const k = this.wet;
    for (const [mat, base] of [[m.road, 0.86], [m.walk, 0.94], [m.paint, 0.7], [m.sand, 0.95]]) {
      if (!mat) continue;
      mat.roughness = lerp(base, 0.14, k);
      mat.metalness = lerp(0, 0.35, k);
      mat.envMapIntensity = lerp(0.25, 1.15, k);
      mat.color.setScalar(lerp(1, 0.62, k));    // l'asfalto bagnato e' piu' scuro
    }
  }

  /** Cielo, sole e foschia seguono il meteo. */
  _sky(dt) {
    const sky = this.game.sky;
    const cloud = this.state === 'sereno' ? 0 : this.state === 'nuvoloso' ? 0.5 : 1;
    this._cloud = lerp(this._cloud ?? 0, cloud, Math.min(1, dt * 0.4));
    const c = this._cloud;

    sky.sun.intensity *= 1 - c * 0.72;
    sky.hemi.intensity *= 1 - c * 0.18;
    sky.clouds.material.opacity = Math.min(0.95, sky.clouds.material.opacity + c * 0.5);
    this.game.scene.fog.density += c * 0.0016 + this.rain * 0.0012;

    // fulmini: lampo forte e tuono ritardato, come nella realta'
    if (this.state === 'temporale') {
      this.thunderT -= dt;
      if (this.thunderT <= 0) {
        this.thunderT = 6 + Math.random() * 14;
        this.flash = 1;
        const delay = 400 + Math.random() * 2200;
        setTimeout(() => this.game.audio.thunder?.(), delay);
      }
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3.4);
      const f = this.flash * this.flash;
      sky.hemi.intensity += f * 1.3;
      sky.sun.intensity += f * 1.1;
      this.game.renderer.toneMappingExposure += f * 0.18;
    }
  }
}

/** Velo di spruzzi: anelli chiari sparsi, additivo sul terreno. */
function splashTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(190,215,240,0.5)';
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const r = 2 + Math.random() * 7;
    ctx.lineWidth = 0.6 + Math.random();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
