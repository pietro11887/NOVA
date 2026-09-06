import * as THREE from 'three';
import { CFG } from './core/config.js';
import { clamp, lerp, IS_TOUCH, IS_MOBILE } from './core/utils.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { City } from './world/city.js';
import { initModels } from './world/models.js';
import { InteriorManager, SHOP_MENUS } from './world/interiors.js';
import { Player } from './entities/player.js';
import { Vehicle } from './entities/vehicle.js';
import { PedManager } from './entities/pedestrian.js';
import { TrafficManager } from './entities/traffic.js';
import { PoliceManager } from './entities/police.js';
import { HUD } from './systems/hud.js';
import { Missions } from './systems/missions.js';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const SKY_DAY = new THREE.Color(0x86b6e8);
const SKY_DUSK = new THREE.Color(0xe98c4e);
const SKY_NIGHT = new THREE.Color(0x0a1020);

class Game {
  constructor() {
    this.canvas = $('scene');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: !IS_MOBILE, powerPreference: 'high-performance', stencil: false,
    });
    this.renderer.setClearColor(SKY_DAY);
    this.scene = new THREE.Scene();
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.quality = {
      mode: 'auto',
      pixelRatio: Math.min(devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2),
      far: IS_MOBILE ? CFG.VIEW_FAR_MOBILE : CFG.VIEW_FAR_DESKTOP,
      peds: IS_MOBILE ? CFG.PED_MAX_MOBILE : CFG.PED_MAX_DESKTOP,
      cars: IS_MOBILE ? CFG.CAR_MAX_MOBILE : CFG.CAR_MAX_DESKTOP,
      parked: IS_MOBILE ? CFG.PARKED_MOBILE : CFG.PARKED_DESKTOP,
    };

    this.camera = new THREE.PerspectiveCamera(IS_MOBILE ? 68 : 62, 1, 0.35, this.quality.far + 200);
    this.scene.fog = new THREE.Fog(SKY_DAY.getHex(), this.quality.far * 0.35, this.quality.far);

    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x4a4536, 1.0);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
    this.sun.position.set(60, 120, 40);
    this.scene.add(this.hemi, this.sun);

    this.time = 0;
    this.frame = 0;
    this.clock = 8.5;              // ora del giorno
    this.wanted = 0;
    this.wantedT = 0;
    this.trafficAxis = 0;
    this.trafficT = 0;
    this.paused = true;
    this.running = false;
    this.fpsAvg = 60;
    this.saveT = 0;
    this._tmp = { x: 0, z: 0 };
    this.lastCar = null;

    this.audio = new Audio();
    this.input = new Input(this.canvas);
    // ingressi neutri: quando un menu e' aperto il personaggio resta fermo
    this.frozenInput = {
      look: { x: 0, y: 0 }, forward: 0, strafe: 0, running: false, braking: false,
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

    await step(8, 'Preparo i materiali…');
    initModels();

    await step(22, 'Costruisco strade e isolati…');
    this.city = new City(this.quality).build();
    this.worldGroup.add(this.city.group);

    await step(52, 'Apro i negozi…');
    this.interiors = new InteriorManager(this);
    this.hud = new HUD(this);

    await step(64, 'Sveglio gli abitanti…');
    this.player = new Player(this);
    // si parte in centro citta', sul marciapiede piu' vicino all'origine
    let start = this.city.walkNodes[0], bd = Infinity;
    for (const n of this.city.walkNodes) {
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
    this._tracers();
    this._headlightBeam();
    this._effects();
    this.load();

    await step(100, 'Pronto!');
    $('btn-play').classList.remove('hidden');
    status.textContent = 'Tocca GIOCA per entrare a Nova City';
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
      if (e.code === 'Escape') this.setPaused(!this.paused);
      if (e.code === 'KeyP') this.setPaused(!this.paused);
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.setPaused(true); });
  }

  start() {
    $('boot').classList.add('hidden');
    this.hud.show();
    if (IS_TOUCH) $('touch').classList.remove('hidden');
    this.audio.start();
    this.paused = false;
    if (!this.running) { this.running = true; this.last = performance.now(); this.loop(); }
    if (IS_MOBILE) this.toggleFullscreen(true);
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
    const modes = ['auto', 'alta', 'bassa'];
    const i = (modes.indexOf(this.quality.mode) + 1) % modes.length;
    this.quality.mode = modes[i];
    $('btn-quality').textContent = `Qualità: ${modes[i][0].toUpperCase()}${modes[i].slice(1)}`;
    if (modes[i] === 'alta') this.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    if (modes[i] === 'bassa') this.setPixelRatio(1);
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
    this.renderer.render(this.scene, this.camera);
  }

  _autoQuality(dt) {
    if (this.quality.mode !== 'auto') return;
    this._qT = (this._qT || 0) + dt;
    if (this._qT < 4) return;
    this._qT = 0;
    if (this.fpsAvg < 34 && this.quality.pixelRatio > 1) this.setPixelRatio(1);
    else if (this.fpsAvg > 55 && this.quality.pixelRatio < Math.min(devicePixelRatio || 1, 2)) {
      this.setPixelRatio(Math.min(devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2));
    }
  }

  update(dt) {
    const p = this.player;

    this._dayNight(dt);
    this.trafficT += dt;
    if (this.trafficT > 13) { this.trafficT = 0; this.trafficAxis ^= 1; this.city.setTrafficAxis(this.trafficAxis); }

    if (this.input.attacking && !this.hud.shopOpen) p.attack();
    p.update(dt, this.hud.shopOpen ? this.frozenInput : this.input);

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

    this._tracerUpdate(dt);
    this._effectsUpdate(dt);
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
    const h = this.clock;
    // elevazione del sole: 0 a mezzanotte, 1 a mezzogiorno
    const elev = Math.sin(((h - 6) / 24) * Math.PI * 2);
    const day = clamp(elev * 2.2 + 0.35, 0, 1);
    const dusk = clamp(1 - Math.abs(elev) * 4, 0, 1);
    const night = 1 - day;

    const sky = new THREE.Color().copy(SKY_NIGHT).lerp(SKY_DAY, day).lerp(SKY_DUSK, dusk * 0.55);
    this.renderer.setClearColor(sky);
    this.scene.fog.color.copy(sky);
    this.scene.fog.near = this.quality.far * (0.3 + day * 0.1);
    this.scene.fog.far = this.quality.far * (0.85 + day * 0.25);

    const ang = ((h - 6) / 24) * Math.PI * 2;
    this.sun.position.set(Math.cos(ang) * 150, Math.max(12, Math.sin(ang) * 160), 60);
    this.sun.intensity = 0.25 + day * 1.35;
    this.sun.color.setHex(dusk > 0.4 ? 0xffb066 : 0xfff0d0);
    this.hemi.intensity = 0.35 + day * 0.75;
    this.hemi.color.setHex(day > 0.5 ? 0xbcd6ff : 0x2a3a5a);

    this.city.setNight(night);
    if (this.interiors.current) {   // dentro un locale l'illuminazione e' costante
      this.sun.intensity = 0.55;
      this.hemi.intensity = 1.05;
      this.hemi.color.setHex(0xf3f0e8);
      this.scene.fog.near = 60; this.scene.fog.far = 400;
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
      this.hud.touchLabels('ESCI', 'CLACSON', 'FRENO');
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

    if (this.hud.shopOpen) {
      this.hud.prompt('<b>E</b> chiudi il menu');
      this.hud.touchLabels('CHIUDI', '-', '-');
      if (act) this.hud.hideShop();
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
    this.hud.mission(door.name, 'Vai al bancone per comprare. Torna alla porta per uscire.');
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

  dressPlayer(shirt, pants) {
    const m = this.player.mesh.userData.mats;
    m.shirt.color.setHex(shirt);
    m.pants.color.setHex(pants);
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
        v.speed *= 0.75;
        if (byPlayer) { this.addWanted(2, 'investimento'); this.toast('Hai investito qualcuno!', 'bad'); }
      }
      // pedoni investiti dalla polizia o dal traffico spaventano la folla
      if (!p.inCar && Math.hypot(px - p.x, pz - p.z) < 1.7) {
        p.damage(Math.abs(v.speed) * 1.9, 'investito');
        v.speed *= 0.6;
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

  _wanted(dt) {
    if (this.wanted <= 0) return;
    const p = this.player;
    let nearest = 999;
    for (const v of this.police.cars) if (v.active) nearest = Math.min(nearest, Math.hypot(v.x - p.x, v.z - p.z));
    for (const c of this.police.cops) if (c.active) nearest = Math.min(nearest, Math.hypot(c.x - p.x, c.z - p.z));
    if (nearest > 95) {
      this.wantedT += dt;
      if (this.wantedT > CFG.WANTED_DECAY) {
        this.wantedT = 0;
        this.wanted--;
        this.toast(this.wanted ? `Ricercato ${this.wanted}★` : 'Hai seminato la polizia', 'good');
      }
    } else this.wantedT = 0;
  }

  alarm(x, z, r) { this.peds.alarm(x, z, r); }
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
    const n = this.city.randomWalkNode(p.x, p.z, 40, 120);
    p.place(n.x, n.z, 0);
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
    // rinasce davanti alla farmacia piu' vicina, se esiste
    let spot = null, bd = Infinity;
    for (const d of this.city.doors) {
      if (d.type !== 'pharmacy') continue;
      const dd = Math.hypot(d.x - p.x, d.z - p.z);
      if (dd < bd) { bd = dd; spot = d; }
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
    } catch (e) { /* salvataggio corrotto: si riparte da zero */ }
  }
}

const game = new Game();
window.game = game;
game.boot();
