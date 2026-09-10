import * as THREE from 'three';
import { CFG } from './core/config.js';
import { clamp, lerp, pick, IS_TOUCH, IS_MOBILE } from './core/utils.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { City } from './world/city.js';
import { loadPBRSets, loadCarTextures } from './world/assets.js';
import { loadMeshPack } from './world/meshpack.js';
import { SkySystem } from './world/sky.js';
import { Post } from './systems/post.js';
import { initModels, useCarPack, dressCharacter, animateCharacter, CAR_COLORS, RIM_STYLES } from './world/models.js';
import { InteriorManager, SHOP_MENUS, buildAmmuMenu } from './world/interiors.js';
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
import { Weather } from './systems/weather.js';
import { Radio } from './systems/radio.js';
import { Smoke } from './systems/smoke.js';
import { RandomEvents } from './systems/events.js';
import { TaxiService } from './systems/taxi.js';
import { Phone } from './systems/phone.js';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** Carrozzerie e cerchi presenti nel pacchetto di modelli. */
const CAR_PACK_BODIES = ['compact', 'coupe', 'hatchback', 'minivan', 'offroad',
  'pickup', 'sedan', 'sport', 'suv', 'wagon'];
const CAR_PACK_RIMS = ['wheel_a', 'wheel_b', 'wheel_c', 'wheel_d', 'wheel_e',
  'wheel_1', 'wheel_g', 'wheel_h'];

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
      shadowMap: IS_MOBILE ? 1024 : 3072,
      shadowRange: IS_MOBILE ? 46 : 96,
      bloom: !IS_MOBILE,
      grade: true,
      // occlusione ambientale: una seconda passata sulla geometria, solo
      // dove c'e' margine
      ssao: !IS_MOBILE,
      ssaoScale: 0.5,
      // parallax sulle superfici stradali: costa, quindi solo sul massimo
      parallax: !IS_MOBILE,
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
        this.quality.parallax = this.quality.tier >= 3;
        this.quality.ssao = this.quality.tier >= 3;
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
    this.trafficAmber = false;      // giallo sull'asse che ha il verde
    this.trafficAllRed = false;     // rosso su entrambi, fra una fase e l'altra
    this.paused = true;
    this.running = false;
    this.fpsAvg = 60;
    this.saveT = 0;
    this._tmp = { x: 0, z: 0 };
    this._focus = new THREE.Vector3();
    this.stats = { casinoWon: 0, casinoLost: 0 };
    this.playerName = localStorage.getItem('novacity.name') || 'Tu';
    this.lastCar = null;
    this.safeMode = false;
    this.bank = 0;
    this.heistCd = 0;
    this.invoiceCd = 0;

    this.audio = new Audio();
    this.input = new Input(this.canvas);
    // ingressi neutri: quando un menu e' aperto il personaggio resta fermo
    this.frozenInput = {
      look: { x: 0, y: 0 }, forward: 0, strafe: 0, steering: 0, throttle: 0, running: false, braking: false,
      invertY: false, btn: { action: false, attack: false, jump: false, run: false },
      pressed: () => false,
    };
    /*
     * Da passeggero in taxi non si comanda l'auto, ma la testa si gira
     * eccome: si guarda fuori dal finestrino. Prima in corsa passavano gli
     * ingressi congelati e la visuale restava inchiodata dietro alla
     * vettura, che e' la cosa piu' fastidiosa di tutto il viaggio.
     */
    const vero = this.input;
    this.rideInput = {
      ...this.frozenInput,
      look: vero.look,
      get invertY() { return vero.invertY; },
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


    await step(14, 'Scarico i materiali della strada…');
    const aniso = Math.min(this.renderer.capabilities.getMaxAnisotropy(), IS_MOBILE ? 4 : 16);
    this.pbr = await loadPBRSets(aniso);

    await step(20, 'Porto dentro i veicoli…');
    // il pacchetto di modelli va agganciato prima di initModels: le misure
    // della fisica si prendono dalle mesh vere
    const [pack, carTex] = await Promise.all([
      // se il pacchetto non si apre il gioco parte lo stesso con le
      // carrozzerie disegnate a mano, ma il motivo va detto: e' cosi' che
      // per giorni le auto sono state tutte squadrate senza che si sapesse
      loadMeshPack().catch((e) => { console.warn('NOVA: modelli auto non caricati —', e); return null; }),
      loadCarTextures(CAR_PACK_BODIES, CAR_PACK_RIMS, aniso),
    ]);
    this.carPack = useCarPack(pack, carTex, this.quality);

    await step(24, 'Preparo i materiali…');
    initModels(this.quality);

    await step(28, 'Costruisco strade e isolati…');
    this.city = new City(this.quality, this.pbr).build();
    this._sharpenTextures();
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
    // il cielo non partecipa all'occlusione ambientale: nella passata delle
    // normali sarebbe una cupola solida davanti a tutto
    if (this.post.ssao) {
      this.post.ssao.skip = [this.sky.sky, this.sky.clouds, this.sky.stars, this.sky.moon];
    }
    // preferenza salvata, oppure ?safe=1 nell'indirizzo
    const params = new URLSearchParams(location.search);
    let safe = false;
    try { safe = localStorage.getItem('nova-safe') === '1'; } catch (e) { /* niente */ }
    if (params.has('safe')) safe = params.get('safe') !== '0';
    if (safe) this.toggleSafeMode(true);
    this._applyTier();
    this.casino = new Casino(this);
    this.map = new MapView(this);
    this.weather = new Weather(this);
    this.radio = new Radio(this);
    this.smoke = new Smoke(this);
    this.events = new RandomEvents(this);
    this.taxi = new TaxiService(this);
    this.phone = new Phone(this);
    this._waypointMarker();
    this.net = new Net();
    this.mp = new Multiplayer(this, this.net);
    this._tracers();
    this._headlightBeam();
    this._headlightSpots();
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
  /**
   * Filtro anisotropico su tutte le texture: senza, asfalto e marciapiedi
   * diventano una poltiglia sfocata appena li guardi di sbieco.
   */
  _sharpenTextures() {
    const maxA = this.renderer.capabilities.getMaxAnisotropy();
    const aniso = Math.min(maxA, IS_MOBILE ? 4 : 16);
    const seen = new Set();
    const bump = (t) => {
      if (!t || !t.isTexture || seen.has(t)) return;
      seen.add(t);
      if (t.anisotropy !== aniso) { t.anisotropy = aniso; t.needsUpdate = true; }
    };
    const keys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'];
    this.scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) for (const k of keys) bump(m[k]);
    });
  }

  _streetLights() {
    this.streetLights = [];
    const n = IS_MOBILE ? 5 : 12;
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffd7a2, 0, 40, 1.5);
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
      if (d < 9000) near.push({ l, d });
    }
    near.sort((a, b) => a.d - b.d);
    this.streetLights.forEach((light, i) => {
      const t = near[i];
      light.visible = !!t;
      if (t) {
        light.position.set(t.l.x, t.l.y, t.l.z);
        light.intensity = 90 * night;
      }
    });
  }

  /** Due faretti attaccati all'auto del giocatore: illuminano davvero la strada. */
  _headlightSpots() {
    this.headlights = [];
    for (let i = 0; i < 2; i++) {
      const sp = new THREE.SpotLight(0xfff0cf, 0, 62, 0.62, 0.45, 1.1);
      sp.visible = false;
      sp.castShadow = false;
      sp.target = new THREE.Object3D();
      this.worldGroup.add(sp, sp.target);
      this.headlights.push(sp);
    }
  }

  _updateHeadlights(lightsOn) {
    if (!this.headlights) return;
    const on = lightsOn && this.player.inCar && !this.interiors.current;
    const c = this.player.car;
    this.headlights.forEach((sp, i) => {
      sp.visible = on;
      if (!on || !c) return;
      const side = i === 0 ? -0.72 : 0.72;
      const rx = -c.fz, rz = c.fx;              // versore destro dell'auto
      sp.position.set(c.x + c.fx * 1.9 + rx * side, 0.75, c.z + c.fz * 1.9 + rz * side);
      sp.target.position.set(c.x + c.fx * 26 + rx * side * 3, -0.4, c.z + c.fz * 26 + rz * side * 3);
      sp.target.updateMatrixWorld();
      sp.intensity = 160;
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

  /** Esplosioni. Il fumo lo fa il sistema a particelle (systems/smoke.js). */
  _effects() {
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
    this.smoke.burst(x, z, 1.4);
    this.alarm(x, z, 30);
  }

  _effectsUpdate(dt) {
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
    $('btn-safe').addEventListener('click', () => this.toggleSafeMode());
    $('btn-phone').addEventListener('click', () => this.phone.toggle());
    $('btn-invert').addEventListener('click', () => {
      this.input.invertY = !this.input.invertY;
      $('btn-invert').textContent = `Camera: ${this.input.invertY ? 'Invertita' : 'Normale'}`;
    });
    $('btn-reset').addEventListener('click', () => {
      localStorage.removeItem(CFG.SAVE_KEY);
      location.reload();
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyT' && this.running && !this.paused) this.phone.toggle();
      if (e.code === 'Escape') {
        if (this.phone.open) this.phone.hide();
        else if (this.map.open) this.map.hide();
        else this.setPaused(!this.paused);
      }
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

  /**
   * Grafica sicura: spegne tutta la post-produzione (antialiasing del
   * composer, bloom, correzione colore). Serve sulle schede video che
   * rendono male il render target multicampione: mezzo schermo nero.
   * La scelta resta salvata perche' chi ne ha bisogno ne ha bisogno sempre.
   */
  toggleSafeMode(force) {
    const on = force !== undefined ? force : !this.safeMode;
    this.safeMode = on;
    try { localStorage.setItem('nova-safe', on ? '1' : '0'); } catch (e) { /* niente */ }
    if (this.post) this.post.enabled = !on && this.quality.tier >= 1 && this.post.hasPasses;
    const b = $('btn-safe');
    if (b) b.textContent = `Grafica sicura: ${on ? 'ON' : 'OFF'}`;
    // all'avvio la applichiamo in silenzio: l'avviso serve solo se la premi tu
    if (force === undefined) this.toast(on ? 'Grafica sicura attiva' : 'Grafica sicura disattivata', 'good');
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
        const range = tier >= 3 ? (IS_MOBILE ? 46 : 96) : IS_MOBILE ? 34 : 52;
        q.shadowRange = range;
        const c = this.sky.sun.shadow.camera;
        c.left = -range; c.right = range; c.top = range; c.bottom = -range;
        c.updateProjectionMatrix();
      }
    }
    if (this.post) {
      this.post.enabled = tier >= 1 && this.post.hasPasses && !this.safeMode;
      this.post.setBloom(tier >= 3);
      q.ssao = tier >= 3;
      this.post.setSSAO(q.ssao ? 1 : 0);
    }
    // il parallax sull'asfalto segue lo stesso livello
    q.parallax = tier >= 3;
    /*
     * Anche il traffico segue il livello: su un telefono che arranca meno
     * auto in giro vuol dire meno da disegnare e meno da far guidare, ed e'
     * la leva che si sente di piu'. Al massimo restano tutte.
     */
    if (this.traffic) {
      const base = IS_MOBILE ? CFG.CAR_MAX_MOBILE : CFG.CAR_MAX_DESKTOP;
      const fattore = [0.4, 0.65, 0.85, 1][clamp(tier, 0, 3)];
      this.traffic.setMax(Math.max(6, Math.round(base * fattore)));
    }
    if (this.city) {
      for (const name of ['road', 'walk']) {
        const m = this.city.mats[name];
        if (m && m.userData.nova) {
          m.userData.nova.novaPomScale.value = q.parallax ? (name === 'road' ? 0.028 : 0.018) : 0;
        }
      }
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
    if (this.post && this.post.enabled) this.post.render(dt, this.scene, this.camera);
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

    // chi guida si guarda intorno di continuo: l'elenco dei vicini si
    // prepara una volta sola, prima che qualcuno lo consulti
    this._rebuildVehicleIndex();
    // dove guarda la camera: serve a sapere cosa il giocatore vede davvero
    const dirCam = this._camDir || (this._camDir = new THREE.Vector3());
    this.camera.getWorldDirection(dirCam);
    this._camFx = dirCam.x; this._camFz = dirCam.z;

    this._dayNight(dt);
    // il meteo va dopo il ciclo giorno/notte: ne corregge sole, foschia e cielo
    this.weather.update(dt, this.camera);
    this.hud.weather(this.weather.label);
    this.radio.setOn(this.player.inCar && !this.interiors.current);
    this.radio.update(dt);
    // fumo e fiamme dai mezzi malridotti (il giocatore incluso)
    this._smokeCars = this._smokeCars || [];
    this._smokeCars.length = 0;
    for (const v of this.traffic.all()) this._smokeCars.push(v);
    for (const v of this.police.cars) this._smokeCars.push(v);
    if (this.player.car) this._smokeCars.push(this.player.car);
    this.smoke.update(dt, this._smokeCars);
    this.events.update(dt);
    this.taxi.update(dt);
    if (this.heistCd > 0) this.heistCd -= dt;
    if (this.invoiceCd > 0) this.invoiceCd -= dt;
    /*
     * Semafori. Verde lungo, poi giallo, poi un attimo di rosso su entrambi
     * gli assi prima di dare il verde all'altro: senza quella pausa chi
     * entra col giallo si scontra con chi parte col verde.
     */
    this.trafficT += dt;
    // il rosso su entrambi gli assi dura quanto serve a sgomberare
    // l'incrocio a chi e' entrato col giallo: sedici metri di carreggiata a
    // passo d'uomo sono due secondi buoni
    /*
     * Verde piu' lungo. Con dieci secondi si smaltiva mezza coda e il resto
     * ripartiva da fermo al giro dopo; con una citta' piu' trafficata il
     * verde corto era il primo collo di bottiglia. Quattordici secondi sono
     * ancora sotto quelli di un incrocio vero, ma il traffico scorre.
     */
    /*
     * Ciclo semaforico corto.
     *
     * Con quattordici secondi di verde per parte il ciclo intero durava
     * trentasette secondi, e chi arrivava col rosso appena scattato ne
     * aspettava diciotto. Su una corsa che attraversa sei incroci era piu'
     * di un minuto fermi: il taxi non "ci metteva tanto", stava fermo ai
     * semafori per meta' del viaggio. In un gioco la fila al rosso non e'
     * realismo, e' tempo perso a guardare. Il ciclo intero scende a
     * ventiquattro secondi.
     *
     * Il tutto-rosso invece resta di due secondi: e' il tempo che serve a
     * chi e' entrato sul giallo per sgombrare l'incrocio prima che parta
     * l'altro senso. Accorciarlo per guadagnare un altro secondo vuol dire
     * comprarselo con gli incidenti in mezzo all'incrocio.
     */
    const GREEN = 8, AMBER = 2.0, ALL_RED = 2.0;
    const wasAmber = this.trafficAmber;
    this.trafficAmber = this.trafficT > GREEN;
    this.trafficAllRed = this.trafficT > GREEN + AMBER;
    if (this.trafficAmber !== wasAmber || this._lightsDirty) {
      this._lightsDirty = false;
      this.city.setTrafficAxis(this.trafficAxis, this.trafficAmber, this.trafficAllRed);
    }
    if (this.trafficT > GREEN + AMBER + ALL_RED) {
      this.trafficT = 0;
      this.trafficAxis ^= 1;
      this.trafficAmber = false;
      this.trafficAllRed = false;
      this.city.setTrafficAxis(this.trafficAxis, false, false);
    } else if (this.trafficAllRed) {
      this.city.setTrafficAxis(this.trafficAxis, true, true);
    }

    // cambio arma: Q, rotellina, tasti 1-8, o lo scudetto nell'HUD
    const swap = this.input._edge.swap;
    if (swap) p.cycleWeapon(swap > 0 ? 1 : -1);
    const slot = this.input._edge.slot;
    if (slot) p.selectSlot(slot);
    this.input.setDriveMode(p.inCar && !this.interiors.current);
    const busy = this.hud.shopOpen || this.casino.open || this.map.open || this.phone.open;
    if (this.input.attacking && !busy) p.attack(this.input.pressed('attack'));
    // tasto destro: pugno anche se hai un'arma addosso (in auto suona il clacson)
    if (this.input.punching && !busy) p.punch();
    /*
     * In taxi il personaggio non comanda niente, ma la visuale resta sua:
     * ingressi da passeggero, non ingressi congelati.
     */
    p.update(dt, busy ? this.frozenInput
      : this.taxi.state === 'riding' ? this.rideInput : this.input);

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
    this._rocketsUpdate(dt);
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
    // in pieno giorno si chiude il diaframma: le alte luci non devono
    // bruciare e le ombre devono restare leggibili
    this.renderer.toneMappingExposure = 0.95 - this.sky.day * 0.27;

    if (this.interiors.current) {   // dentro un locale l'illuminazione e' costante
      this.sky.sun.intensity = 0.5;
      this.sky.hemi.intensity = 1.0;
      this.sky.hemi.color.setHex(0xf3f0e8);
      this.sky.moonLight.visible = false;
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
    this._updateHeadlights(lightsOn);
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
    // l'armeria ha un listino dinamico: dipende da cosa hai gia' in tasca
    const type = this.interiors.door.type;
    const menu = type === 'ammu' ? buildAmmuMenu(this) : (SHOP_MENUS[type] || SHOP_MENUS.store);

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
    // il listino dell'armeria cambia mentre compri: va ricostruito
    const fresh = this.interiors.door && this.interiors.door.type === 'ammu' ? buildAmmuMenu(this) : menu;
    this.hud.refreshShop(fresh, (i) => this.buy(i, fresh));
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
    if (this.lastCar) { this.lastCar.repair(); this.toast('Veicolo riparato e raddrizzato', 'good'); }
    else this.toast('Nessun veicolo da riparare');
  }

  // ------------------------------------------------------------- banca e uffici
  /** Deposita meta' dei contanti: al sicuro se ti stendono. */
  bankDeposit() {
    const p = this.player;
    const n = Math.floor(p.money / 2);
    if (n < 1) { this.toast('Non hai niente da depositare'); return; }
    p.pay(n);
    this.bank = (this.bank || 0) + n;
    this.toast(`Depositati $${n} · in banca $${this.bank}`, 'good');
    this.save();
  }

  bankWithdraw() {
    if (!this.bank) { this.toast('Il conto e vuoto'); return; }
    const n = this.bank;
    this.bank = 0;
    this.player.earn(n);
    this.toast(`Prelevati $${n}`, 'good');
    this.save();
  }

  /** Rapina al caveau: bottino grosso e mezza citta' addosso. */
  bankHeist() {
    if (this.heistCd > 0) { this.toast('Troppo presto, hanno raddoppiato la vigilanza'); return; }
    const loot = 1800 + ((Math.random() * 2600) | 0);
    this.heistCd = 300;
    this.player.earn(loot);
    this.setWanted(4);
    this.toast(`Caveau svuotato: +$${loot}`, 'bad');
    this.audio.noise(0.7, 900, 0.5, 'highpass');
    this.alarm(this.player.x, this.player.z, 60);
    this.hud.flash();
  }

  /** Una fattura ogni tanto: soldi puliti, con attesa. */
  officeInvoice() {
    if (this.invoiceCd > 0) {
      this.toast(`Nessuna fattura pronta, torna fra ${Math.ceil(this.invoiceCd / 60)} min`);
      return;
    }
    const n = 220 + ((Math.random() * 380) | 0);
    this.invoiceCd = 240;
    this.player.earn(n);
    this.toast(`Fattura riscossa: +$${n}`, 'good');
    this.save();
  }

  /** Pay'n'Spray: colore nuovo, lamiera dritta e la polizia ti perde. */
  repaintCar() {
    const car = this.lastCar;
    if (!car) { this.toast('Nessun veicolo qui fuori'); return; }
    let c = pick(CAR_COLORS);
    for (let i = 0; i < 6 && c === car.color; i++) c = pick(CAR_COLORS);
    car.paint(c);
    car.repair();
    if (this.wanted > 0) {
      this.setWanted(0);
      this.police.standDown();
      this.toast('Verniciata. La polizia ti ha perso', 'good');
    } else this.toast('Verniciata a nuovo', 'good');
    this.audio.ui();
  }

  nextRims() {
    const car = this.lastCar;
    if (!car) { this.toast('Nessun veicolo qui fuori'); return; }
    const keys = Object.keys(RIM_STYLES);
    const i = keys.indexOf(car.mesh.userData.rims || 'standard');
    const next = keys[(i + 1) % keys.length];
    car.rims(next);
    this.toast(`Cerchi: ${RIM_STYLES[next].name}`, 'good');
    this.audio.ui();
  }

  /** Il meccanico ti riporta l'ultima auto, riparata, davanti a te. */
  phoneMechanic() {
    const p = this.player;
    if (p.money < 200) { this.toast('Servono $200', 'bad'); return; }
    if (!this.lastCar) { this.toast('Non hai un\'auto da farti portare'); return; }
    p.pay(200);
    const car = this.lastCar;
    car.repair();
    const a = p.a;
    car.place(p.x + Math.cos(a) * 5, p.z - Math.sin(a) * 5, a);
    if (!car.mesh.parent) this.worldGroup.add(car.mesh);
    this.toast('🔧 Il meccanico te l\'ha portata', 'good');
    this.audio.cash();
  }

  /** Consegna a domicilio: mangi senza cercare un locale. */
  phoneFood() {
    const p = this.player;
    if (p.money < 45) { this.toast('Servono $45', 'bad'); return; }
    p.pay(45);
    p.heal(999);
    this.toast('🍔 Consegna arrivata', 'good');
    this.audio.cash();
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
  melee(from, range, dmg, wanted = 1) {
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
    this.smoke.hit(hit.x, 1.25, hit.z, 0xc0392b, 4, 0.8);
    this.addWanted(cop ? Math.max(2, wanted) : wanted, 'aggressione');
  }

  hitScan(from, range, dmg, angle) {
    const a = angle === undefined ? from.a : angle;
    const fx = Math.cos(a), fz = -Math.sin(a);
    // lampo alla bocca dell'arma
    this.smoke.hit(from.x + fx * 0.9, 1.45, from.z + fz * 0.9, 0xffd08a, 3, 0.5);
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
      this.smoke.hit(best.x, 1.2, best.z, 0xc0392b, 6, 1.1);      // sangue
      if (best.role === 'cop') this.addWanted(2, 'agente colpito');
    } else {
      // niente bersaglio: scintille dove finisce il colpo
      const d = Math.min(range, 30);
      this.smoke.hit(from.x + fx * d, 1.2, from.z + fz * d, 0xbfc6cf, 3, 0.9);
    }
    for (const v of this.police.cars) {
      if (!v.active) continue;
      const dx = v.x - from.x, dz = v.z - from.z;
      const t = dx * fx + dz * fz;
      if (t > 0 && t < range && Math.abs(-dx * fz + dz * fx) < 1.6) v.health -= dmg * 0.6;
    }
  }

  /** Razzo del lanciarazzi: vola dritto e scoppia contro il primo ostacolo. */
  launchRocket(from, w) {
    this.rockets = this.rockets || [];
    if (!this._rocketGeo) {
      this._rocketGeo = new THREE.CapsuleGeometry(0.11, 0.5, 4, 8);
      this._rocketGeo.rotateZ(Math.PI / 2);
      this._rocketMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, emissive: 0x552200, roughness: 0.6 });
    }
    const mesh = new THREE.Mesh(this._rocketGeo, this._rocketMat);
    mesh.position.set(from.x, 1.4, from.z);
    this.worldGroup.add(mesh);
    this.rockets.push({
      mesh, x: from.x, z: from.z, a: from.a, life: w.range / 42, w,
      fx: Math.cos(from.a), fz: -Math.sin(from.a),
    });
  }

  _rocketsUpdate(dt) {
    if (!this.rockets || !this.rockets.length) return;
    const SPEED = 42;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      r.x += r.fx * SPEED * dt;
      r.z += r.fz * SPEED * dt;
      r.mesh.position.set(r.x, 1.4, r.z);
      r.mesh.rotation.y = r.a;
      this.smoke.puff(r.x, 1.4, r.z, 0, 0.3);
      const hitWall = this.city.resolve(r.x, r.z, 0.6, this._tmpVec || (this._tmpVec = new THREE.Vector3()));
      const hitPed = this.peds.nearest(r.x, r.z, 1.4);
      if (r.life <= 0 || hitWall || hitPed) {
        this.blast(r.x, r.z, r.w.blast || 6, r.w.dmg);
        this.worldGroup.remove(r.mesh);
        this.rockets.splice(i, 1);
      }
    }
  }

  /** Esplosione con raggio: danneggia bot, agenti, veicoli e te se sei vicino. */
  blast(x, z, radius, dmg) {
    this.explode(x, z);
    for (const ped of this.peds.peds) {
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) ped.hit(dmg * (1 - d / radius), this, this.player);
    }
    for (const cop of this.police.cops) {
      if (!cop.active) continue;
      const d = Math.hypot(cop.x - x, cop.z - z);
      if (d < radius) cop.hit(dmg * (1 - d / radius), this, this.player);
    }
    const cars = [...this.traffic.all(), ...this.police.cars];
    if (this.player.car) cars.push(this.player.car);
    for (const v of cars) {
      const d = Math.hypot(v.x - x, v.z - z);
      if (d >= radius) continue;
      const k = 1 - d / radius;
      v.health -= dmg * k * 0.7;
      v.dentAt(x, z, 16 * k);
    }
    const dp = Math.hypot(this.player.x - x, this.player.z - z);
    if (dp < radius) this.player.damage(dmg * (1 - dp / radius) * 0.5, 'esplosione');
    this.addWanted(3, 'esplosione');
  }

  tracer(x, y, z, a, range = 26) {
    const t = this.tracers.find((k) => k.life <= 0) || this.tracers[0];
    const len = Math.min(range, 60);
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
      /*
       * Pedoni investiti dalla polizia o dal traffico.
       *
       * Da passeggero in taxi non sei un pedone: sei dentro l'abitacolo, e
       * il muso della vettura ti passa sopra la testa per definizione. Senza
       * questa esclusione il taxi investiva il proprio cliente a ogni
       * fotogramma, si tagliava la velocita' del quaranta per cento ogni
       * volta e la corsa moriva li' — misurato: media 1,6 m/s, muso contro i
       * muri e vettura distrutta.
       */
      if (!p.inCar && !p.inTaxi && Math.hypot(px - p.x, pz - p.z) < 1.7) {
        p.damage(Math.abs(v.speed) * 1.9, 'investito');
        v.setVelocity(v.speed * 0.6, 0);
      }
    };
    for (const v of this.traffic.all()) check(v, v.driver === 'player');
    for (const v of this.police.cars) if (v.active) check(v, false);
    if (p.inCar) check(p.car, true);

    /*
     * Urti tra veicoli.
     *
     * Prima si provavano tutte le coppie possibili, comprese quelle a
     * duecento metri di distanza: con cento auto e centotrenta parcheggiate
     * facevano diciassettemila controlli per fotogramma, ed era il conto
     * piu' salato di tutto il gioco. Ora ogni vettura guarda solo chi ha
     * entro sei metri, e ogni coppia si esamina una volta sola grazie al
     * numero d'ordine assegnato dall'indice.
     */
    const list = [...this.traffic.cars.map((t) => t.v)];
    if (p.inCar) list.push(p.car);
    // il taxi immesso apposta non sta nel traffico: senza questo attraversava
    // le altre auto come un fantasma
    if (this.taxi && this.taxi.taxi && this.taxi.spawned) list.push(this.taxi.taxi);
    for (const a of list) {
      // raggio abbondante: un autobus e' lungo undici metri e con sei
      // metri e mezzo due mezzi lunghi si attraversavano senza toccarsi
      for (const b of this.nearVehicles(a.x, a.z, 9)) {
        if (b === a) continue;
        // ogni coppia una volta sola; le parcheggiate non sono nell'elenco
        // di chi cerca, quindi con loro il confronto si fa comunque
        if (!b.parked && b._gid < a._gid) continue;
        const rel = a.collideWith(b);
        if (rel > 8 && (a === p.car || b === p.car)) {
          this.audio.crash(rel);
          if (rel > 14) p.damage(rel * 0.3, 'incidente');
        }
      }
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
  blockedAhead(v, dist, skipParked = false) {
    return this.gapAhead(v, dist, skipParked) < Infinity;
  }

  /**
   * Distanza dal primo ostacolo davanti al veicolo, o Infinity se la strada
   * e' libera. Serve al traffico per accodarsi frenando invece di fermarsi
   * di colpo quando l'ostacolo entra nel raggio.
   */
  gapAhead(v, dist, skipParked = false) {
    return this.leaderAhead(v, dist, skipParked).d;
  }

  /**
   * Primo veicolo davanti: distanza e sua velocita'.
   *
   * La velocita' serve per accodarsi come si fa davvero. Considerando chi
   * sta davanti come un muro fermo, un'auto a venti metri costringeva a
   * scendere sotto i 45 all'ora anche se stava viaggiando: il traffico
   * strisciava.
   */
  leaderAhead(v, dist, skipParked = false) {
    const fx = v.fx, fz = v.fz;
    let best = Infinity;
    let lead = 0;
    const test = (o) => {
      if (o === v) return;
      const dx = o.x - v.x, dz = o.z - v.z;
      const t = dx * fx + dz * fz;
      if (t < 0.4 || t > dist || t >= best) return;
      /*
       * Corridoio piu' stretto lontano, cosi' non ci si ferma per un'auto
       * che sta girando in un'altra corsia. Ma chi e' fermo si guarda largo:
       * dopo un urto una vettura resta un po' storta e usciva dal corridoio
       * stretto, diventando invisibile fino al tamponamento.
       */
      const fermo = o.speed !== undefined && Math.abs(o.speed) < 0.6;
      const half = fermo ? 2.9 : (t < 8 ? 2.3 : 1.9);
      if (Math.abs(-dx * fz + dz * fx) >= half) return;
      /*
       * Chi attraversa non conta come coda, se non e' proprio addosso: al
       * semaforo due file perpendicolari si vedevano a vicenda "davanti" e
       * si bloccavano l'un l'altra per sempre. A chi ha il diritto di
       * passare ci pensa il semaforo.
       */
      if (o.a !== undefined && t > 6) {
        let d = Math.abs(o.a - v.a) % (Math.PI * 2);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d > 1.1) return;
      }
      best = t;
      lead = o.speed !== undefined ? Math.max(0, o.speed) : 0;
    };
    for (const o of this.nearVehicles(v.x, v.z, dist + 4)) {
      if (skipParked && o.parked) continue;
      test(o);
    }
    // il giocatore a piedi non e' un veicolo e non sta nell'indice
    if (!this.player.inCar && !this.player.inTaxi) test(this.player);
    return { d: best, speed: best < Infinity ? lead : 0 };
  }

  /**
   * Chi ho davanti, cercato lungo il MIO tracciato.
   *
   * Il corridoio dritto davanti al muso funziona in rettilineo e sbaglia in
   * curva: dentro un arco d'incrocio l'auto che precede sta di lato rispetto
   * al muso, esce dal corridoio e diventa invisibile — e li' si tampona.
   * Qui si misura, per me e per ogni vettura vicina, a che punto della
   * stessa riga ci si trova: chi e' piu' avanti di me sulla riga, e vicino
   * a essa, e' chi ho davanti. Vale in curva come in rettilineo.
   *
   * @returns {{d:number, speed:number}} distanza lungo il tracciato
   */
  leaderOnPath(v, path, idx, maxDist = 34) {
    const best = { d: Infinity, speed: 0 };
    if (!path || path.length < 2) return best;
    // finestra di tracciato attorno al veicolo, con le distanze cumulate
    const da = Math.max(1, idx - 6);
    const seg = this._segScratch || (this._segScratch = []);
    seg.length = 0;
    let acc = 0;
    for (let k = da; k < path.length; k++) {
      const A = path[k - 1], B = path[k];
      const dx = B.x - A.x, dz = B.z - A.z;
      const l = Math.hypot(dx, dz);
      if (l < 1e-4) continue;
      seg.push({ ax: A.x, az: A.z, dx, dz, l, s0: acc });
      acc += l;
      if (acc > maxDist + 30) break;
    }
    if (!seg.length) return best;

    // posizione lungo la riga: si proietta sul tratto piu' vicino
    const posizione = (x, z) => {
      let bd = Infinity, s = 0, lato = Infinity;
      for (const g of seg) {
        let t = ((x - g.ax) * g.dx + (z - g.az) * g.dz) / (g.l * g.l);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = g.ax + g.dx * t, qz = g.az + g.dz * t;
        const d = Math.hypot(qx - x, qz - z);
        if (d < bd) { bd = d; s = g.s0 + g.l * t; lato = d; }
      }
      return { s, lato: bd };
    };

    const mio = posizione(v.x, v.z);
    for (const o of this.nearVehicles(v.x, v.z, maxDist + 6)) {
      if (o === v) continue;
      const suo = posizione(o.x, o.z);
      const avanti = suo.s - mio.s;
      /*
       * Larghezza di ricerca generosa: una vettura che dopo un contatto sta
       * mezzo metro fuori riga non smette di essere quella che ho davanti.
       * Con la soglia stretta spariva dallo sguardo, chi seguiva
       * riaccelerava e la tamponava — e da li' restavano incastrate.
       */
      if (suo.lato < 2.6 && avanti > 0.5 && avanti < maxDist && avanti < best.d) {
        best.d = avanti;
        best.speed = Math.max(0, o.speed || 0);
      }
    }
    return best;
  }

  /** Punto sul tracciato a una certa distanza davanti al veicolo. */
  _avanti(path, i, x, z, dist) {
    let px = x, pz = z, rimasto = dist;
    for (let k = Math.min(i, path.length - 1); k < path.length; k++) {
      const dx = path[k].x - px, dz = path[k].z - pz;
      const l = Math.hypot(dx, dz);
      if (l < 0.001) continue;
      if (l >= rimasto) return { x: px + (dx / l) * rimasto, z: pz + (dz / l) * rimasto, s: dist };
      rimasto -= l;
      px = path[k].x; pz = path[k].z;
    }
    return { x: px, z: pz, s: dist - rimasto };
  }

  /**
   * Conflitto di traiettoria.
   *
   * Non si guarda la retta del muso — che in un incrocio e' sbagliata,
   * perche' chi svolta segue un arco — ma dove saranno davvero le due
   * vetture seguendo i rispettivi tracciati. Si campionano i prossimi due
   * secondi e mezzo: se in un qualsiasi istante si trovano piu' vicine di
   * tre metri e mezzo, quella che arriverebbe dopo cede, e cede fermandosi
   * prima del punto d'incontro. La regola e' asimmetrica — cede sempre e
   * solo una delle due — quindi non puo' succedere che si aspettino a
   * vicenda.
   *
   * @returns {{d:number, speed:number}|null}
   */
  conflictObstacle(v, path, idx) {
    if (!path || path.length < 2) return null;
    const mia = Math.abs(v.speed);
    const passi = [0.5, 1.0, 1.5, 2.0, 2.5];
    const miei = passi.map((t) => this._avanti(path, idx, v.x, v.z, Math.max(mia, 2.2) * t));
    let best = null;
    for (const o of this.nearVehicles(v.x, v.z, 30)) {
      if (o === v || o.parked) continue;
      const b = o.brain;
      if (!b || !b.path || b.path.length < 2) continue;
      const sua = Math.abs(o.speed);
      if (sua < 0.6 && mia < 0.6) continue;
      /*
       * Chi va nella mia stessa direzione non e' un conflitto: davanti e'
       * una coda — e la distanza la tiene gia' l'accodamento — dietro sono
       * fatti suoi. Cedere il passo a chi ti segue significa inchiodargli
       * davanti: misurato, cinquantaquattro tamponamenti in tre minuti.
       */
      const cos = o.fx * v.fx + o.fz * v.fz;
      if (cos > 0.75) continue;
      for (let k = 0; k < passi.length; k++) {
        const suo = this._avanti(b.path, b.st.i, o.x, o.z, Math.max(sua, 1.5) * passi[k]);
        if (Math.hypot(miei[k].x - suo.x, miei[k].z - suo.z) > 3.4) continue;
        if (miei[k].s < 2) break;            // l'incontro e' gia' addosso: frenare non aiuta
        const mioT = miei[k].s / Math.max(mia, 0.8);
        const suoT = suo.s / Math.max(sua, 0.8);
        const cedo = suoT < mioT - 0.2
          || (Math.abs(suoT - mioT) <= 0.2 && (o._gid || 0) < (v._gid || 0));
        if (cedo) {
          const d = Math.max(0.3, miei[k].s - 4.5);
          if (!best || d < best.d) best = { d, speed: 0 };
        }
        break;
      }
    }
    return best;
  }

  /**
   * Qualcosa di fermo messo di traverso sulla propria traiettoria.
   *
   * L'accodamento guarda solo chi ha il tuo stesso muso — al semaforo serve
   * cosi', se no due file perpendicolari si bloccherebbero a vicenda — e
   * quindi un'auto ferma di traverso appena fuori dall'incrocio risultava
   * invisibile: ci si andava addosso a cinque metri al secondo. Restituita
   * come ostacolo, il modello di guida ci si ferma davanti come farebbe con
   * chiunque altro.
   *
   * @returns {{d:number, speed:number}|null}
   */
  crosswiseObstacle(v, dist = 20) {
    const fx = v.fx, fz = v.fz;
    let best = null;
    for (const o of this.nearVehicles(v.x, v.z, dist + 4)) {
      if (o === v || o.speed === undefined) continue;
      if (Math.abs(o.speed) > 1) continue;             // se si muove sta sgombrando
      const dx = o.x - v.x, dz = o.z - v.z;
      const t = dx * fx + dz * fz;
      if (t < 0.5 || t > dist) continue;
      if (Math.abs(-dx * fz + dz * fx) > 2.6) continue;
      const cos = o.fx * fx + o.fz * fz;
      if (Math.abs(cos) > 0.7) continue;               // in coda, non di traverso
      const d = Math.max(0.3, t - 4.2);
      if (!best || d < best.d) best = { d, speed: 0 };
    }
    return best;
  }

  /**
   * Indice dei veicoli per zona, rifatto una volta per fotogramma.
   *
   * Ogni auto, per guidare, si guarda intorno sei volte: chi ha davanti,
   * chi le taglia la strada, chi arriva di fronte, chi occupa l'incrocio.
   * Scorrere ogni volta tutte le vetture significa un costo che cresce col
   * quadrato del traffico: raddoppiare le auto lo quadruplica. Con una
   * griglia a caselle da venticinque metri si guardano solo le vicine, e il
   * costo torna a crescere in proporzione — che e' quello che serve per
   * riempire una citta' grande.
   */
  _rebuildVehicleIndex() {
    const CELL = 25;
    if (!this._vgrid) { this._vgrid = new Map(); this._vscratch = []; }
    const grid = this._vgrid;
    for (const a of grid.values()) a.length = 0;
    let gid = 0;
    const add = (o) => {
      if (!o) return;
      // numero d'ordine del fotogramma: serve a testare ogni coppia una
      // volta sola quando si cercano gli urti
      o._gid = gid++;
      const k = ((o.x / CELL) | 0) * 10007 + ((o.z / CELL) | 0);
      let a = grid.get(k);
      if (!a) { a = []; grid.set(k, a); }
      a.push(o);
    };
    for (const t of this.traffic.cars) add(t.v);
    for (const o of this.traffic.parked) add(o);
    if (this.taxi && this.taxi.taxi) add(this.taxi.taxi);
    if (this.police) for (const c of this.police.cars) { if (c.active) add(c); }
    if (this.player.car) add(this.player.car);
    this._vcell = CELL;
  }

  /** I veicoli entro un raggio. L'elenco e' riusato: va consumato subito. */
  nearVehicles(x, z, r) {
    const out = this._vscratch;
    out.length = 0;
    if (!this._vgrid) return out;
    const CELL = this._vcell;
    const i0 = ((x - r) / CELL) | 0, i1 = ((x + r) / CELL) | 0;
    const j0 = ((z - r) / CELL) | 0, j1 = ((z + r) / CELL) | 0;
    const r2 = r * r;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const a = this._vgrid.get(i * 10007 + j);
        if (!a) continue;
        for (const o of a) {
          const dx = o.x - x, dz = o.z - z;
          if (dx * dx + dz * dz <= r2) out.push(o);
        }
      }
    }
    return out;
  }

  /**
   * Quante vetture ci sono in fila davanti, dentro il proprio corridoio.
   *
   * Serve a distinguere un ostacolo isolato — un'auto piantata, che si
   * aggira — da una coda al semaforo, che si aspetta e basta. Sorpassare
   * una coda e' esattamente il modo di trasformarla in un ingorgo.
   */
  carsAhead(v, dist = 30) {
    const fx = v.fx, fz = v.fz;
    let n = 0;
    const test = (o) => {
      if (o === v) return;
      const dx = o.x - v.x, dz = o.z - v.z;
      const t = dx * fx + dz * fz;
      if (t < 0.4 || t > dist) return;
      if (Math.abs(-dx * fz + dz * fx) > 2.4) return;
      if (o.a !== undefined) {
        let d = Math.abs(o.a - v.a) % (Math.PI * 2);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d > 1.1) return;      // chi attraversa non e' in coda con te
      }
      n++;
    };
    for (const o of this.nearVehicles(v.x, v.z, dist + 4)) {
      if (!o.parked) test(o);
    }
    return n;
  }

  /**
   * La corsia opposta e' libera abbastanza per sorpassare?
   *
   * Un sorpasso vero si fa solo se dall'altra parte non arriva nessuno per
   * un bel pezzo: a quindici metri al secondo per parte, sessanta metri se
   * ne mangiano in due secondi. Si guarda in un corridoio stretto davanti a
   * se', e basta una vettura che viene incontro per dire di no.
   */
  oncomingClear(v, dist = 70, minSpeed = 0) {
    const fx = v.fx, fz = v.fz;
    let libera = true;
    const test = (o) => {
      if (!libera || o === v || o.speed === undefined) return;
      // chi e' fermo non arriva addosso a nessuno: se aspetta al suo rosso,
      // la svolta si puo' fare. Senza questo il primo della fila non
      // girerebbe mai a sinistra e bloccherebbe tutti quelli dietro.
      if (Math.abs(o.speed) < minSpeed) return;
      const dx = o.x - v.x, dz = o.z - v.z;
      const avanti = dx * fx + dz * fz;
      if (avanti < -8 || avanti > dist) return;
      // fuori dalla propria strada: non riguarda
      if (Math.abs(-dx * fz + dz * fx) > 7) return;
      // muso opposto al nostro: e' chi arriva in senso contrario
      if (o.fx * fx + o.fz * fz < -0.4) libera = false;
    };
    for (const o of this.nearVehicles(v.x, v.z, dist + 8)) {
      if (!o.parked) test(o);
    }
    return libera;
  }

  // ------------------------------------------------------------ salvataggio
  save() {
    try {
      localStorage.setItem(CFG.SAVE_KEY, JSON.stringify({
        player: this.player.serialize(), clock: this.clock, missions: this.missions.completed,
        stats: this.stats, name: this.playerName, bank: this.bank,
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
      this.bank = s.bank ?? 0;
      if (s.name) this.playerName = s.name;
    } catch (e) { /* salvataggio corrotto: si riparte da zero */ }
  }
}

const game = new Game();
window.game = game;
window.__anim = animateCharacter;   // usato dai test delle pose
game.boot();
