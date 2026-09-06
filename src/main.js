import * as THREE from 'three';
import { CFG } from './core/config.js';
import { clamp, lerp, IS_TOUCH, IS_MOBILE } from './core/utils.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { City } from './world/city.js';
import { SkySystem } from './world/sky.js';
import { Post } from './systems/post.js';
import { initModels, dressCharacter, animateCharacter } from './world/models.js';
import { InteriorManager, SHOP_MENUS } from './world/interiors.js';
import { Player } from './entities/player.js';
import { Vehicle } from './entities/vehicle.js';
import { PedManager } from './entities/pedestrian.js';
import { TrafficManager } from './entities/traffic.js';
import { PoliceManager } from './entities/police.js';
import { HUD } from './systems/hud.js';
import { Missions } from './systems/missions.js';
import { Casino } from './systems/casino.js';
import { Net } from './systems/net.js';
import { Multiplayer } from './systems/multiplayer.js';
import { MapView } from './systems/map.js';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

class Game {
  constructor() {
    this.canvas = $('scene');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: !IS_MOBILE, powerPreference: 'high-performance', stencil: false,
      // ?shot=1 tiene il frame nel buffer: serve solo per catturare screenshot puliti
      preserveDrawingBuffer: new URLSearchParams(location.search).has('shot'),
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.quality = {
      mode: 'auto',
      tier: IS_MOBILE ? 2 : 3,
      pixelRatio: Math.min(devicePixelRatio || 1, IS_MOBILE ? 1.6 : 2),
      peds: IS_MOBILE ? CFG.PED_MAX_MOBILE : CFG.PED_MAX_DESKTOP,
      cars: IS_MOBILE ? CFG.CAR_MAX_MOBILE : CFG.CAR_MAX_DESKTOP,
      parked: IS_MOBILE ? CFG.PARKED_MOBILE : CFG.PARKED_DESKTOP,
      shadows: true,
      shadowMap: IS_MOBILE ? 1024 : 2048,
      shadowRange: IS_MOBILE ? 46 : 74,
      bloom: !IS_MOBILE,
      grade: true,
      samples: IS_MOBILE ? 2 : 4,
    };
    const forced = new URLSearchParams(location.search).get('q');
    if (forced !== null) {
      const map = { bassa: 0, media: 2, alta: 3, low: 0, mid: 2, high: 3 };
      const t = map[forced] ?? parseInt(forced, 10);
      if (!Number.isNaN(t)) {
        this.quality.mode = 'forzata';
        this.quality.tier = clamp(t, 0, 3);
        this.quality.shadows = this.quality.tier >= 1;
        this.quality.bloom = this.quality.tier >= 3;
        if (this.quality.tier === 0) this.quality.pixelRatio = 1;
      }
    }
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(IS_MOBILE ? 66 : 60, 1, 0.4, 4200);

    this.time = 0;
    this.frame = 0;
    this.clock = 8.5;              // ora del giorno
    this.wanted = 0;
    this.wantedT = 0;
    this.evadeTime = 18;
    this.evading = false;
    this.trafficAxis = 0;
    this.trafficT = 0;
    this.paused = true;
    this.running = false;
    this.fpsAvg = 60;
    this.saveT = 0;
    this._tmp = { x: 0, z: 0 };
    this._focus = new THREE.Vector3();
    this.stats = { casinoWon: 0, casinoLost: 0 };
    this.playerName = localStorage.getItem('novacity.name') || 'Tu';
    this.lastCar = null;

    this.audio = new Audio();
    this.input = new Input(this.canvas);
    // ingressi neutri: quando un menu e' aperto il personaggio resta fermo
    this.frozenInput = {
      look: { x: 0, y: 0 }, forward: 0, strafe: 0, throttle: 0, running: false, braking: false,
      invertY: false, btn: { action: false, attack: false, jump: false, run: false },
      pressed: () => false,
    };
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ------------------------------------------------------------------- boot
  async boot() {
    const bar = $('boot-progress').firstElementChild;
    const status = $('boot-status');
    const step = async (pct, text) => {
      bar.style.width = `${pct}%`;
      status.textContent = text;
      await nextFrame();
    };

    await step(6, 'Accendo il sole…');
    this.sky = new SkySystem(this.scene, this.renderer, this.quality);
    this.sky.update(this.clock, new THREE.Vector3());

    await step(12, 'Preparo i materiali…');
    initModels(this.quality);

    await step(24, 'Costruisco strade e isolati…');
    this.city = new City(this.quality).build();
    this.worldGroup.add(this.city.group);

    await step(52, 'Apro i negozi…');
    this.interiors = new InteriorManager(this);
    this.hud = new HUD(this);

    await step(64, 'Sveglio gli abitanti…');
    this.player = new Player(this);
    // si parte in centro citta', su un marciapiede lontano dai pali
    // dell'incrocio: cosi' la camera ravvicinata non nasce dietro un palo
    let start = this.city.walkNodes[0], bd = Infinity;
    for (const n of this.city.walkNodes) {
      let near = Infinity;
      for (const r of this.city.roadNodes) {
        near = Math.min(near, Math.hypot(r.x - n.x, r.z - n.z));
        if (near < 15) break;
      }
      if (near < 15) continue;
      const d = n.x * n.x + n.z * n.z;
      if (d < bd) { bd = d; start = n; }
    }
    this.startPoint = start;
    this.player.place(start.x, start.z, 0);
    this.peds = new PedManager(this, this.quality.peds);

    await step(80, 'Metto in moto il traffico…');
    this.traffic = new TrafficManager(this, this.quality.cars);
    this.police = new PoliceManager(this);

    await step(92, 'Distribuisco i lavori…');
    this.missions = new Missions(this);
    this.post = new Post(this.renderer, this.scene, this.camera, this.quality);
    this._applyTier();
    this.casino = new Casino(this);
    this.map = new MapView(this);
    this._waypointMarker();
    this.net = new Net();
    this.mp = new Multiplayer(this, this.net);
    this._tracers();
    this._headlightBeam();
    this._effects();
    this._streetLights();
    this.load();

    await step(100, 'Pronto!');
    $('menu-main').classList.remove('hidden');
    $('boot-progress').classList.add('hidden');
    $('player-name').value = this.playerName;
    status.textContent = 'Pronto: gioca da solo o collega un amico';
    this._menus();
  }

  _tracers() {
    this.tracers = [];
    const geo = new THREE.BoxGeometry(1, 0.05, 0.05);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
  }

  /**
   * Quattro lampioni "veri" che seguono il giocatore: le pozze di luce
   * additive coprono la citta', queste danno il riflesso sull'asfalto.
   */
  _streetLights() {
    this.streetLights = [];
    const n = IS_MOBILE ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffd9a0, 0, 26, 1.6);
      l.visible = false;
      this.worldGroup.add(l);
      this.streetLights.push(l);
    }
    this._lampT = 0;
  }

  _updateStreetLights(dt) {
    if (!this.streetLights.length) return;
    const night = this.sky.night;
    if (night < 0.35 || this.interiors.current) {
      for (const l of this.streetLights) l.visible = false;
      return;
    }
    this._lampT -= dt;
    if (this._lampT > 0) return;
    this._lampT = 0.4;
    const p = this.player;
    const near = [];
    for (const l of this.city.lamps) {
      const d = (l.x - p.x) ** 2 + (l.z - p.z) ** 2;
      if (d < 3600) near.push({ l, d });
    }
    near.sort((a, b) => a.d - b.d);
    this.streetLights.forEach((light, i) => {
      const t = near[i];
      light.visible = !!t;
      if (t) {
        light.position.set(t.l.x, t.l.y, t.l.z);
        light.intensity = 26 * night;
      }
    });
  }

  /** Cono di luce dei fari: rende guidabile la citta' di notte. */
  _headlightBeam() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 100, 4, 64, 100, 90);
    g.addColorStop(0, 'rgba(255,238,190,1)');
    g.addColorStop(0.45, 'rgba(255,225,160,0.45)');
    g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(10, 18);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(-Math.PI / 2);
    this.beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: texture, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.beam.visible = false;
    this.worldGroup.add(this.beam);
  }

  /** Fumo del motore danneggiato ed esplosioni. */
  _effects() {
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.5, depthWrite: false });
    this.smoke = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), smokeMat);
      m.userData.seed = i * 1.7;
      this.smoke.add(m);
    }
    this.smoke.visible = false;
    this.worldGroup.add(this.smoke);

    this.boom = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa33a, transparent: true, opacity: 0.9, depthWrite: false })
    );
    this.boom.visible = false;
    this.boomT = 0;
    this.worldGroup.add(this.boom);
  }

  explode(x, z) {
    this.boom.position.set(x, 1.4, z);
    this.boom.visible = true;
    this.boomT = 0.6;
    this.audio.crash(20);
    this.audio.noise(0.6, 140, 0.6);
    this.hud.flash();
    this.alarm(x, z, 30);
  }

  _effectsUpdate(dt) {
    const p = this.player;
    const car = p.inCar ? p.car : null;
    const damaged = car && car.health < 42;
    this.smoke.visible = !!damaged && !this.interiors.current;
    if (damaged) {
      const k = 1 - car.health / 42;
      this.smoke.position.set(car.x + car.fx * car.spec.L * 0.42, 1.0, car.z + car.fz * car.spec.L * 0.42);
      for (const m of this.smoke.children) {
        const t = (this.time * 0.9 + m.userData.seed) % 1;
        m.position.set(Math.sin(m.userData.seed + this.time) * 0.5, t * 3.2, Math.cos(m.userData.seed * 2) * 0.5);
        m.scale.setScalar(0.4 + t * 1.6);
        m.material.opacity = 0.55 * (1 - t) * k;
      }
    }
    if (this.boomT > 0) {
      this.boomT -= dt;
      const k = 1 - this.boomT / 0.6;
      this.boom.scale.setScalar(1 + k * 7);
      this.boom.material.opacity = 0.9 * (1 - k);
      if (this.boomT <= 0) this.boom.visible = false;
    }
  }

  _menus() {
    $('btn-play').addEventListener('click', () => this.start());
    this._fullscreenMenu();
    this._onlineMenu();
    $('btn-resume').addEventListener('click', () => this.setPaused(false));
    $('btn-pause').addEventListener('click', () => this.setPaused(true));
    $('btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    $('btn-quality').addEventListener('click', () => this.cycleQuality());
    $('btn-invert').addEventListener('click', () => {
      this.input.invertY = !this.input.invertY;
      $('btn-invert').textContent = `Camera: ${this.input.invertY ? 'Invertita' : 'Normale'}`;
    });
    $('btn-reset').addEventListener('click', () => {
      localStorage.removeItem(CFG.SAVE_KEY);
      location.reload();
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { if (this.map.open) this.map.hide(); else this.setPaused(!this.paused); }
      if (e.code === 'KeyP') this.setPaused(!this.paused);
      if (e.code === 'KeyM' && this.running) this.map.toggle();
    });
    const mini = $('minimap');
    mini.style.pointerEvents = 'auto';
    mini.addEventListener('click', () => { if (this.running) this.map.toggle(); });
    addEventListener('resize', () => { if (this.map && this.map.open) { this.map.resize(); this.map.draw(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.setPaused(true); });
  }

  /**
   * Quando il gioco gira dentro un pannello (l'anteprima di Claude, un
   * iframe qualsiasi) si vede solo a meta': qui offriamo schermo intero e,
   * se il pannello lo consente, l'apertura in una scheda tutta sua.
   */
  _fullscreenMenu() {
    const embedded = window.self !== window.top;
    const expand = $('btn-expand');
    const newtab = $('btn-newtab');
    expand.addEventListener('click', () => {
      this.toggleFullscreen();
      expand.textContent = document.fullscreenElement ? '⛶ Esci da schermo intero' : '⛶ Schermo intero';
    });
    if (embedded) {
      newtab.href = location.href;
      newtab.classList.remove('hidden');
      $('boot-status').textContent = 'Consiglio: apri a schermo intero o in una scheda nuova';
    }
  }

  /** Schermata di gioco online: due codici e si e' collegati. */
  _onlineMenu() {
    const name = $('player-name');
    name.addEventListener('change', () => {
      this.playerName = (name.value || 'Tu').slice(0, 14);
      localStorage.setItem('novacity.name', this.playerName);
    });
    const status = (text, cls = '') => {
      const el = $('online-status');
      el.textContent = text;
      el.className = cls;
    };
    const show = (id) => {
      for (const k of ['online-pick', 'online-create', 'online-join']) {
        $(k).classList.toggle('hidden', k !== id);
      }
    };
    const copy = async (el) => {
      try {
        await navigator.clipboard.writeText(el.value);
        status('Codice copiato: mandalo al tuo amico', 'ok');
      } catch {
        el.select();
        status('Seleziona e copia il codice a mano');
      }
    };
    const share = async (el) => {
      if (navigator.share) {
        try { await navigator.share({ title: 'NOVA CITY', text: el.value }); return; } catch { /* annullato */ }
      }
      copy(el);
    };

    $('btn-online').addEventListener('click', () => {
      this.playerName = ($('player-name').value || 'Tu').slice(0, 14);
      localStorage.setItem('novacity.name', this.playerName);
      $('menu-main').classList.add('hidden');
      $('menu-online').classList.remove('hidden');
      show('online-pick');
      status('Uno crea la partita, l\'altro entra col codice.');
    });
    $('btn-back').addEventListener('click', () => {
      $('menu-online').classList.add('hidden');
      $('menu-main').classList.remove('hidden');
    });

    $('btn-create').addEventListener('click', async () => {
      show('online-create');
      status('Preparo il codice…');
      try {
        $('my-code').value = await this.net.host();
        status('Manda il codice al tuo amico e aspetta la sua risposta');
      } catch (e) { status(`Errore: ${e.message}`, 'err'); }
    });
    $('btn-join').addEventListener('click', () => {
      show('online-join');
      status('Incolla il codice che hai ricevuto');
    });
    $('btn-copy1').addEventListener('click', () => copy($('my-code')));
    $('btn-share1').addEventListener('click', () => share($('my-code')));
    $('btn-copy2').addEventListener('click', () => copy($('my-answer')));
    $('btn-share2').addEventListener('click', () => share($('my-answer')));

    $('btn-connect').addEventListener('click', async () => {
      status('Collegamento in corso…');
      try {
        await this.net.accept($('their-answer').value);
      } catch (e) { status(`Codice non valido: ${e.message}`, 'err'); }
    });
    $('btn-answer').addEventListener('click', async () => {
      status('Preparo la risposta…');
      try {
        $('my-answer').value = await this.net.join($('their-code').value);
        for (const k of ['answer-label', 'my-answer', 'answer-actions']) $(k).classList.remove('hidden');
        status('Rimanda questo codice al tuo amico: parte tutto da solo');
      } catch (e) { status(`Codice non valido: ${e.message}`, 'err'); }
    });

    this.net.on('open', () => {
      status('Collegato! Buon divertimento.', 'ok');
      this.playerName = ($('player-name').value || this.playerName || 'Tu').slice(0, 14);
      this.net.send({ t: 'hello', name: this.playerName });
      $('net-name').textContent = this.mp.name;
      $('netbadge').classList.remove('hidden');
      if (this.paused || !this.running) setTimeout(() => this.start(), 700);
    });
    this.net.on('close', () => {
      $('netbadge').classList.add('hidden');
      this.toast('Amico scollegato', 'bad');
    });
  }

  start() {
    $('boot').classList.add('hidden');
    this.hud.show();
    if (IS_TOUCH) $('touch').classList.remove('hidden');
    this.audio.start();
    this.paused = false;
    if (!this.running) { this.running = true; this.last = performance.now(); this.loop(); }
    this.toggleFullscreen(true);
    this.toast('Benvenuto a Nova City', 'good');
  }

  setPaused(v) {
    if (!this.running) return;
    this.paused = v;
    $('pause').classList.toggle('hidden', !v);
    if (v) {
      document.exitPointerLock?.();
      this.audio.setEngine(0, 0);
      this.audio.setSiren(false, 0);
      $('pause-stats').innerHTML =
        `Soldi: <b>$${this.player.money}</b><br>Missioni completate: <b>${this.missions.completed}</b><br>` +
        `Ora: <b>${String(Math.floor(this.clock) % 24).padStart(2, '0')}:00</b> · Ricercato: <b>${this.wanted}★</b><br>` +
        `FPS: <b>${Math.round(this.fpsAvg)}</b>`;
      this.save();
    }
  }

  toggleFullscreen(silent = false) {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {
        if (!silent) this.toast('Schermo intero non disponibile');
      });
    } else document.exitFullscreen?.();
  }

  cycleQuality() {
    const modes = ['auto', 'alta', 'media', 'bassa'];
    const i = (modes.indexOf(this.quality.mode) + 1) % modes.length;
    this.quality.mode = modes[i];
    $('btn-quality').textContent = `Qualità: ${modes[i][0].toUpperCase()}${modes[i].slice(1)}`;
    if (modes[i] === 'alta') this.setTier(3);
    if (modes[i] === 'media') this.setTier(2);
    if (modes[i] === 'bassa') this.setTier(0);
  }

  /**
   * Livelli di qualita': 3 = tutto acceso, 2 = niente bloom,
   * 1 = ombre corte, 0 = niente ombre, niente riflessi d'ambiente e
   * nessuna post-produzione (per i telefoni piu' lenti).
   */
  setTier(tier) {
    tier = clamp(tier, 0, 3);
    if (tier === this.quality.tier) return;
    this.quality.tier = tier;
    this._applyTier();
  }

  _applyTier() {
    const q = this.quality;
    const tier = q.tier;
    q.shadows = tier >= 1;
    q.bloom = tier >= 3;
    this.renderer.shadowMap.enabled = q.shadows;
    if (this.sky) {
      this.scene.environment = tier === 0 ? null : this.sky.env;
      this.sky.sun.castShadow = q.shadows;
      this.sky.quality.shadows = q.shadows;
      this.sky.clouds.visible = tier >= 1;
      if (q.shadows) {
        const range = tier >= 3 ? (IS_MOBILE ? 46 : 74) : IS_MOBILE ? 34 : 52;
        q.shadowRange = range;
        const c = this.sky.sun.shadow.camera;
        c.left = -range; c.right = range; c.top = range; c.bottom = -range;
        c.updateProjectionMatrix();
      }
    }
    if (this.post) {
      this.post.enabled = tier >= 1 && this.post.hasPasses;
      if (this.post.composer && this.post.composer.renderTarget1) {
        const n = tier >= 3 ? (IS_MOBILE ? 2 : 4) : tier >= 2 ? 2 : 0;
        for (const rt of [this.post.composer.renderTarget1, this.post.composer.renderTarget2]) {
          if (rt.samples !== n) { rt.samples = n; rt.dispose(); }
        }
      }
      if (this.post.bloom) this.post.bloom.enabled = tier >= 3;
    }
    this.setPixelRatio(tier === 0 ? 1 : Math.min(devicePixelRatio || 1, IS_MOBILE ? 1.6 : 2));
    this.renderer.shadowMap.needsUpdate = true;
  }

  setPixelRatio(r) {
    this.quality.pixelRatio = r;
    this.renderer.setPixelRatio(r);
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.setSize(w, h, false);
    if (this.post) this.post.setSize(w, h, this.quality.pixelRatio);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    $('rotate')?.classList.toggle('hidden', !(IS_MOBILE && h > w * 1.15));
  }

  // ------------------------------------------------------------------- loop
  loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.08) dt = 0.08;
    this.fpsAvg = lerp(this.fpsAvg, 1 / Math.max(dt, 0.0001), 0.05);

    if (!this.paused) {
      this.time += dt;
      this.frame++;
      this.update(dt);
      this._autoQuality(dt);
    }
    this.player.applyCamera(this.camera);
    if (this.post && this.post.enabled) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  _autoQuality(dt) {
    if (this.quality.mode !== 'auto') return;
    this._qT = (this._qT || 0) + dt;
    this._qUp = this._qUp || 0;
    if (this._qT < 2.5) return;
    this._qT = 0;
    if (this.fpsAvg < 18) this.setTier(this.quality.tier - 2);
    else if (this.fpsAvg < 30) this.setTier(this.quality.tier - 1);
    else if (this.fpsAvg > 57 && this._qUp++ > 2) { this._qUp = 0; this.setTier(this.quality.tier + 1); }
  }

  update(dt) {
    const p = this.player;

    this._dayNight(dt);
    this.trafficT += dt;
    if (this.trafficT > 13) { this.trafficT = 0; this.trafficAxis ^= 1; this.city.setTrafficAxis(this.trafficAxis); }

    this.input.setDriveMode(p.inCar && !this.interiors.current);
    if (this.input.attacking && !this.hud.shopOpen && !this.casino.open && !this.map.open) p.attack();
    p.update(dt, (this.hud.shopOpen || this.casino.open || this.map.open) ? this.frozenInput : this.input);

    if (this.interiors.current) {
      this.interiors.update(dt);
      this._interiorPrompt();
    } else {
      this.peds.update(dt);
      this.traffic.update(dt);
      this.police.update(dt);
      this._vehiclePedCollisions(dt);
      this._worldPrompt();
      this.missions.update(dt);
      this._wanted(dt);
    }

    if (this.mp) this.mp.update(dt);
    this._markers(dt);
    this._tracerUpdate(dt);
    this._effectsUpdate(dt);
    this._updateStreetLights(dt);
    this._engineSound();
    if (p.dead && p.respawnT <= 0) this.respawn();

    this.hud.update(dt);
    this.input.endFrame();

    this.saveT += dt;
    if (this.saveT > 25) { this.saveT = 0; this.save(); }
  }

  // -------------------------------------------------------------- ambiente
  _dayNight(dt) {
    this.clock = (this.clock + (dt / CFG.DAY_LENGTH) * 24) % 24;
    const p = this.player;
    this._focus.set(p.x, 0, p.z);
    this.sky.update(this.clock, this._focus);
    this.sky.follow(this.camera.position);
    const night = this.sky.night;

    this.city.setNight(night);
    this.city.animate(this.time);
    if (this.post) this.post.setNight(night);
    this.renderer.toneMappingExposure = 0.98 - this.sky.day * 0.14;

    if (this.interiors.current) {   // dentro un locale l'illuminazione e' costante
      this.sky.sun.intensity = 0.5;
      this.sky.hemi.intensity = 1.0;
      this.sky.hemi.color.setHex(0xf3f0e8);
      this.scene.fog.density = 0.0004;
    }
    const lightsOn = night > 0.42;
    if (this.beam) {
      this.beam.visible = lightsOn && this.player.inCar && !this.interiors.current;
      if (this.beam.visible) {
        const c = this.player.car;
        this.beam.position.set(c.x + c.fx * 8, 0.08, c.z + c.fz * 8);
        this.beam.rotation.y = c.a;
        this.beam.material.opacity = 0.42 * clamp(night, 0, 1);
      }
    }
    if (this._lightsOn !== lightsOn) {
      this._lightsOn = lightsOn;
      for (const v of this.traffic.all()) v.setNight(lightsOn);
      for (const v of this.police.cars) v.setNight(lightsOn);
    }
  }

  _engineSound() {
    const p = this.player;
    if (p.inCar) {
      const rpm = clamp(Math.abs(p.car.speed) / p.car.topSpeed, 0.05, 1);
      this.audio.setEngine(rpm, 1);
    } else {
      // motore dell'auto piu' vicina, per dare vita alla strada
      let best = 999, rpm = 0;
      for (const v of this.traffic.all()) {
        const d = Math.hypot(v.x - p.x, v.z - p.z);
        if (d < best && Math.abs(v.speed) > 1) { best = d; rpm = Math.abs(v.speed) / 25; }
      }
      this.audio.setEngine(rpm, best < 30 ? clamp(1 - best / 30, 0, 1) * 0.6 : 0);
    }
    this.audio.setSiren(this.wanted > 0 && this.police.activeCars.length > 0, 1 / 60);
  }

  // ------------------------------------------------------------ interazioni
  _worldPrompt() {
    const p = this.player;
    const act = this.input.pressed('action');
    if (p.dead) { this.hud.prompt(null); return; }

    if (p.inCar) {
      this.hud.prompt('<b>E</b> scendi dal veicolo');
      this.hud.touchLabels('ESCI', 'CLACSON', 'MANO');
      if (act) p.exitCar();
      else if (this.input.btn.attack && this.time - (this._hornT || -9) > 0.45) {
        this._hornT = this.time;
        this.audio.horn();
      }
      return;
    }

    const door = this.city.nearestDoor(p.x, p.z, 3.2);
    const car = this.traffic.nearestCar(p.x, p.z, 3.8);
    const dDoor = door ? Math.hypot(door.x - p.x, door.z - p.z) : 99;
    const dCar = car ? Math.hypot(car.x - p.x, car.z - p.z) : 99;

    // se sei praticamente addosso a un'auto vince l'auto: e' quello che
    // ci si aspetta quando si e' fermi accanto a una portiera
    if (door && dDoor <= dCar - 1.2) {
      this.hud.prompt(`<b>E</b> entra in ${door.name}`);
      this.hud.touchLabels('ENTRA', p.weapon === 'pistol' ? 'SPARA' : 'COLPO', 'SALTA');
      if (act) this.enterDoor(door);
    } else if (car) {
      this.hud.prompt('<b>E</b> sali sul veicolo');
      this.hud.touchLabels('SALI', p.weapon === 'pistol' ? 'SPARA' : 'COLPO', 'SALTA');
      if (act) {
        this.lastCar = car;
        p.enterCar(car);
        if (car.parked || car.driver === null) this.addWanted(car.parked ? 0 : 1, 'furto');
      }
    } else {
      this.hud.prompt(null);
      this.hud.touchLabels('AZIONE', p.weapon === 'pistol' ? 'SPARA' : 'COLPO', 'SALTA');
    }
  }

  _interiorPrompt() {
    const p = this.player;
    const act = this.input.pressed('action');
    const menu = SHOP_MENUS[this.interiors.door.type] || SHOP_MENUS.store;

    if (this.casino.open) {
      this.hud.prompt('<b>E</b> lascia il tavolo');
      this.hud.touchLabels('ESCI', '-', '-');
      if (act) this.casino.hide();
      return;
    }
    if (this.hud.shopOpen) {
      this.hud.prompt('<b>E</b> chiudi il menu');
      this.hud.touchLabels('CHIUDI', '-', '-');
      if (act) this.hud.hideShop();
      return;
    }
    const spot = this.interiors.nearestSpot(p);
    if (spot) {
      this.hud.prompt(`<b>E</b> ${spot.label}`);
      this.hud.touchLabels('GIOCA', '-', '-');
      if (act) this.openCasino(spot.kind);
      return;
    }
    if (this.interiors.atCounter(p)) {
      this.hud.prompt(`<b>E</b> parla con il commesso`);
      this.hud.touchLabels('NEGOZIO', '-', '-');
      if (act) this.hud.showShop(menu, (item) => this.buy(item, menu));
    } else if (this.interiors.atExit(p)) {
      this.hud.prompt('<b>E</b> esci in strada');
      this.hud.touchLabels('ESCI', '-', '-');
      if (act) this.interiors.exit();
    } else {
      this.hud.prompt(null);
      this.hud.touchLabels('AZIONE', '-', '-');
    }
  }

  enterDoor(door) {
    this.interiors.enter(door);
    const hint = door.type === 'casino'
      ? 'Avvicinati a slot, roulette o blackjack per giocare. Torna alla porta per uscire.'
      : 'Vai al bancone per comprare. Torna alla porta per uscire.';
    this.hud.mission(door.name, hint);
  }

  buy(item, menu) {
    const p = this.player;
    if (p.money < item.price) { this.toast('Soldi insufficienti', 'bad'); this.audio.blip(160, 0.12); return; }
    p.pay(item.price);
    item.effect(this);
    if (item.price) this.audio.cash(); else this.audio.ui();
    this.toast(`${item.name} ✔`, 'good');
    this.hud.refreshShop(menu, (i) => this.buy(i, menu));
    this.save();
  }

  _markers(dt) {
    const p = this.player;
    // la destinazione segue l'amico quando e' agganciata a lui
    const friend = this.mp && this.mp.position;
    if (this.waypoint && this.waypoint.friend && friend) {
      this.waypoint.x = friend.x; this.waypoint.z = friend.z;
    }
    if (this.waypoint) {
      this.wayBeam.position.set(this.waypoint.x, 0, this.waypoint.z);
      const d = Math.hypot(this.waypoint.x - p.x, this.waypoint.z - p.z);
      this.wayBeam.visible = d > 4;
      if (d < 6 && !this.waypoint.friend) this.setWaypoint(null);
    }
    this.friendBeam.visible = !!friend;
    if (friend) this.friendBeam.position.set(friend.x, 0, friend.z);
    if (this.map.open) this.map.draw();
  }

  /** Colonna di luce sulla destinazione e sull'amico: si vede da lontano. */
  _waypointMarker() {
    const beam = (color) => {
      const g = new THREE.CylinderGeometry(0.9, 1.4, 60, 12, 1, true);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
        depthWrite: false, depthTest: false, toneMapped: false,
      }));
      m.position.y = 30;
      m.renderOrder = 4;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.6, 2.4, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      const group = new THREE.Group();
      group.add(m, ring);
      group.visible = false;
      this.scene.add(group);
      return group;
    };
    this.wayBeam = beam(0xff9d3f);
    this.friendBeam = beam(0xc56bff);
    this.waypoint = null;
  }

  /** Mette (o toglie) la destinazione. */
  setWaypoint(w) {
    this.waypoint = w ? { x: w.x, z: w.z, friend: !!w.friend } : null;
    if (this.waypoint) {
      this.wayBeam.position.set(w.x, 0, w.z);
      this.toast('Destinazione impostata', 'good');
      this.audio.blip(760, 0.08);
    }
    this.wayBeam.visible = !!this.waypoint;
  }

  /** Apre i tavoli del casino'. */
  openCasino(kind = 'slot') {
    this.hud.hideShop();
    this.casino.show(kind);
  }

  dressPlayer(shirt, pants) {
    dressCharacter(this.player.mesh, shirt, pants);
  }

  repairLastCar() {
    if (this.lastCar) { this.lastCar.health = 100; this.toast('Veicolo riparato', 'good'); }
    else this.toast('Nessun veicolo da riparare');
  }

  deliverCar(type) {
    const door = this.interiors.door;
    const v = new Vehicle(this.city, { type });
    const a = door ? door.face : 0;
    v.place(door.x + Math.sin(a) * 4, door.z + Math.cos(a) * 4, a + Math.PI / 2);
    this.worldGroup.add(v.mesh);
    this.traffic.parked.push(v);
    this.lastCar = v;
    this.toast('Veicolo consegnato fuori dal locale', 'good');
  }

  // ------------------------------------------------------------- combattimento
  melee(from, range, dmg) {
    // se l'amico e' a tiro il colpo parte anche in rete
    const peer = this.mp && this.mp.position;
    if (peer) {
      const px = from.x + Math.cos(from.a) * 1.1, pz = from.z - Math.sin(from.a) * 1.1;
      if (Math.hypot(peer.x - px, peer.z - pz) < range) {
        this.net.send({ t: 'hit', dmg });
        this.toast('Colpito il tuo amico!', 'good');
      }
    }
    const target = this.peds.nearest(from.x + Math.cos(from.a) * 1.1, from.z - Math.sin(from.a) * 1.1, range);
    const cop = this.police.nearestCop(from.x + Math.cos(from.a) * 1.1, from.z - Math.sin(from.a) * 1.1, range);
    const hit = cop || target;
    if (!hit) return;
    hit.hit(dmg, this, from);
    this.addWanted(cop ? 2 : 1, 'aggressione');
  }

  hitScan(from, range, dmg) {
    const fx = Math.cos(from.a), fz = -Math.sin(from.a);
    let best = null, bestD = range;
    const consider = (e) => {
      const dx = e.x - from.x, dz = e.z - from.z;
      const t = dx * fx + dz * fz;
      if (t < 0.5 || t > range) return;
      const perp = Math.abs(-dx * fz + dz * fx);
      if (perp < 1.1 && t < bestD) { bestD = t; best = e; }
    };
    for (const ped of this.peds.peds) if (ped.state !== 'down') consider(ped);
    for (const c of this.police.cops) if (c.active && c.state !== 'down') consider(c);
    if (best) {
      best.hit(dmg, this, from);
      if (best.role === 'cop') this.addWanted(2, 'agente colpito');
    }
    for (const v of this.police.cars) {
      if (!v.active) continue;
      const dx = v.x - from.x, dz = v.z - from.z;
      const t = dx * fx + dz * fz;
      if (t > 0 && t < range && Math.abs(-dx * fz + dz * fx) < 1.6) v.health -= dmg * 0.6;
    }
  }

  tracer(x, y, z, a) {
    const t = this.tracers.find((k) => k.life <= 0) || this.tracers[0];
    const len = 26;
    t.mesh.visible = true;
    t.mesh.position.set(x + Math.cos(a) * len / 2, y, z - Math.sin(a) * len / 2);
    t.mesh.rotation.set(0, a, 0);
    t.mesh.scale.set(len, 1, 1);
    t.life = 0.06;
  }

  _tracerUpdate(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.mesh.visible = false; }
    }
  }

  _vehiclePedCollisions(dt) {
    const p = this.player;
    const check = (v, byPlayer) => {
      if (Math.abs(v.speed) < 2.5) return;
      const fx = v.fx, fz = v.fz;
      const px = v.x + fx * v.spec.L * 0.35, pz = v.z + fz * v.spec.L * 0.35;
      const ped = this.peds.nearest(px, pz, 1.9);
      if (ped) {
        ped.knockDown(this, v);
        this.audio.crash(6);
        v.setVelocity(v.speed * 0.75, 0);
        if (byPlayer) { this.addWanted(2, 'investimento'); this.toast('Hai investito qualcuno!', 'bad'); }
      }
      // pedoni investiti dalla polizia o dal traffico spaventano la folla
      if (!p.inCar && Math.hypot(px - p.x, pz - p.z) < 1.7) {
        p.damage(Math.abs(v.speed) * 1.9, 'investito');
        v.setVelocity(v.speed * 0.6, 0);
      }
    };
    for (const v of this.traffic.all()) check(v, v.driver === 'player');
    for (const v of this.police.cars) if (v.active) check(v, false);
    if (p.inCar) check(p.car, true);

    // urti tra veicoli
    const list = [...this.traffic.cars.map((t) => t.v)];
    if (p.inCar) list.push(p.car);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const rel = list[i].collideWith(list[j]);
        if (rel > 8 && (list[i] === p.car || list[j] === p.car)) {
          this.audio.crash(rel);
          if (rel > 14) p.damage(rel * 0.3, 'incidente');
        }
      }
      for (const v of this.traffic.parked) list[i].collideWith(v);
    }
  }

  // -------------------------------------------------------------- ricercato
  addWanted(n, reason) {
    if (n <= 0) return;
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.wantedT = 0;
    if (this.wanted > before) {
      this.audio.blip(220, 0.2, 'sawtooth', 0.25);
      this.toast(`Ricercato ${this.wanted}★ (${reason})`, 'bad');
    }
  }

  setWanted(n) { this.wanted = clamp(n, 0, 5); this.wantedT = 0; }

  /**
   * Ricercato in stile GTA: se resti abbastanza a lungo fuori dal raggio
   * d'azione delle pattuglie il livello si azzera del tutto. Finche' scappi
   * la barra si riempie e le stelle lampeggiano.
   */
  _wanted(dt) {
    if (this.wanted <= 0) { this.evading = false; this.wantedT = 0; return; }
    const p = this.player;
    let nearest = 999;
    for (const v of this.police.cars) if (v.active) nearest = Math.min(nearest, Math.hypot(v.x - p.x, v.z - p.z));
    for (const c of this.police.cops) if (c.active) nearest = Math.min(nearest, Math.hypot(c.x - p.x, c.z - p.z));
    this.copDistance = nearest;
    this.evading = nearest > 68;
    this.evadeTime = 12 + this.wanted * 6;
    if (this.evading) {
      this.wantedT += dt;
      if (this.wantedT >= this.evadeTime) {
        this.setWanted(0);
        this.police.standDown();
        this.toast('Hai seminato la polizia', 'good');
        this.audio.blip(880, 0.2, 'sine', 0.2);
      }
    } else {
      this.wantedT = Math.max(0, this.wantedT - dt * 1.6);
    }
  }

  alarm(x, z, r, source = null) { this.peds.alarm(x, z, r, source); }

  /**
   * Un passante ha visto tutto e chiama la polizia. Una sola chiamata ogni
   * tanto, altrimenti bastano due risse per avere cinque stelle.
   */
  witnessCall(ped) {
    if (this.time - (this._witnessT || -99) < 20) return false;
    if (Math.hypot(ped.x - this.player.x, ped.z - this.player.z) > 45) return false;
    this._witnessT = this.time;
    this.addWanted(1, 'testimone');
    this.toast('Un passante ha chiamato la polizia', 'bad');
    return true;
  }
  toast(m, k) { this.hud.toast(m, k); }
  subtitle(m) { this.hud.subtitle(m); }

  busted() {
    const p = this.player;
    const fine = Math.min(p.money, 150 + this.wanted * 80);
    p.pay(fine);
    this.setWanted(0);
    this.police.reset();
    if (p.inCar) p.exitCar();
    p.heal(100);
    const n = this.city.policeStation || this.city.randomWalkNode(p.x, p.z, 40, 120);
    p.place(n.x, n.z, Math.PI / 2);
    this.toast(`ARRESTATO — multa $${fine}`, 'bad');
    this.audio.blip(140, 0.5, 'square', 0.3);
    this.save();
  }

  onDeath(cause) {
    this.toast(`Sei fuori gioco (${cause})`, 'bad');
    if (this.player.inCar) this.player.exitCar(true);
  }

  respawn() {
    const p = this.player;
    p.dead = false;
    p.health = 65;
    p.armor = 0;
    p.pay(100);
    this.setWanted(0);
    this.police.reset();
    // ci si risveglia davanti all'ospedale
    let spot = this.city.hospital;
    if (!spot) {
      let bd = Infinity;
      for (const d of this.city.doors) {
        if (d.type !== 'pharmacy') continue;
        const dd = Math.hypot(d.x - p.x, d.z - p.z);
        if (dd < bd) { bd = dd; spot = d; }
      }
    }
    if (!spot) spot = this.city.randomWalkNode(p.x, p.z, 20, 90);
    p.place(spot.x, spot.z, 0);
    p.mesh.rotation.z = 0;
    this.toast('Curato in ospedale — $100', 'bad');
    this.save();
  }

  setWorldVisible(v) { this.worldGroup.visible = v; }

  /** L'auto ha qualcosa davanti entro `dist` metri? */
  blockedAhead(v, dist) {
    const fx = v.fx, fz = v.fz;
    const test = (o) => {
      if (o === v) return false;
      const dx = o.x - v.x, dz = o.z - v.z;
      const t = dx * fx + dz * fz;
      if (t < 0.5 || t > dist) return false;
      return Math.abs(-dx * fz + dz * fx) < 2.4;
    };
    for (const t of this.traffic.cars) if (test(t.v)) return true;
    for (const o of this.traffic.parked) if (test(o)) return true;
    if (this.player.inCar && test(this.player.car)) return true;
    if (!this.player.inCar && test(this.player)) return true;
    return false;
  }

  // ------------------------------------------------------------ salvataggio
  save() {
    try {
      localStorage.setItem(CFG.SAVE_KEY, JSON.stringify({
        player: this.player.serialize(), clock: this.clock, missions: this.missions.completed,
        stats: this.stats, name: this.playerName,
      }));
    } catch (e) { /* quota piena o modalita' privata: si gioca lo stesso */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(CFG.SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      this.player.restore(s.player);
      this.clock = s.clock ?? 8.5;
      this.missions.completed = s.missions ?? 0;
      this.stats = Object.assign(this.stats, s.stats || {});
      if (s.name) this.playerName = s.name;
    } catch (e) { /* salvataggio corrotto: si riparte da zero */ }
  }
}

const game = new Game();
window.game = game;
window.__anim = animateCharacter;   // usato dai test delle pose
game.boot();
