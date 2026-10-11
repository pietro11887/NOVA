import * as THREE from 'three';
import { Track, SURF } from './track.js';
import { ROAD_HALF_WIDTH, selectTrack, bakuTrack, spaTrack, TRACK } from './trackData.js';
import { Scenery, ENV } from './scenery.js';
import { BakuScenery } from './sceneryBaku.js';
import { ModelScenery, loadTrackModel } from './sceneryModel.js';
import { createCar, mergeCar, GEOM } from './carModel.js';
import { loadGT, createGT, gtReady, loadKind, loadInterior, attachInterior, updateArms } from './gtModel.js';
import { SafetyCar } from './safetyCar.js';
import { CarPhysics } from './physics.js';
import { Input } from './input.js';
import { PadNav } from './padNav.js';
import { Post } from './post.js';
import { BakuFx } from './bakuFx.js';
import { Recorder, Replay, HZ as REPLAY_HZ, saveReplay, loadReplay } from './replay.js';
import { Sound } from './audio.js';
import { Particles, SkidMarks, Debris } from './effects.js';
import { RacingLine } from './racingLine.js';
import { Race } from './race.js';
import { PitLane } from './pit.js';
import { COMPOUNDS } from './physics.js';
import { AIDriver } from './ai.js';
import { TRACKS, outlinePath } from './tracks/catalog.js';
import { CAR_CLASS, IS_F1 } from './vehicle.js';
import { ARCADE, TOW_NAMES, RUBBER_NAMES } from './driveMode.js';
import { cartoonize } from './cartoon.js';
import { Garage } from './garage.js';
import { TEAMS, teamById, f1Grid, loadLiveryMaps } from './f1Teams.js';

// ---------------------------------------------------------------- utilità
const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* spazio esaurito o bloccato */ } },
};
const fmt = t => {
  if (t == null || !isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
};
const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };

const isTouch = ('ontouchstart' in window) || matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

const settings = Object.assign({ auto: true, tc: true, abs: true, ghost: true, cam: 0, quality: isTouch ? 'low' : 'high', tiltInvert: false, tiltSens: 22, line: 'full', steer: 'buttons', raceLaps: 5, raceBots: 9, raceStrength: 60, raceStart: 10, damage: 'sim', msgs: false, raceTyre: 'M', track: 'nova', carClass: 'gt', audio: 1, radio: true, f1Team: 'redbull', driveMode: 'sim', arcTow: 1, arcRubber: 1, gameType: 'race' }, store.get('novaf1.settings') || {});
// modalità di guida: realistica (simulazione) o arcade (driveMode.js)
const ARC = () => settings.driveMode === 'arcade';
// arcade con la GT3 salvata (non dovrebbe succedere): si passa alla Formula 1
if (settings.driveMode === 'arcade' && !IS_F1) { settings.carClass = 'f1'; store.set('novaf1.settings', settings); location.reload(); }
// in arcade i danni "simulazione" diventano una barra di salute senza forature né guasti
// arcade: solo F1 in versione cartoon (stile iRacing Arcade)
const makeCar = (o = {}) => { const c = createGT(o); return ARC() ? cartoonize(c, { ghost: o.ghost, outline: o.lod !== 'mid' || settings.quality === 'high' }) : c; };
const dmMode = () => (ARC() && settings.damage === 'sim' ? 'reduced' : settings.damage);
if (settings.quality === 'high') document.body.classList.add('hq');
const saveSettings = () => store.set('novaf1.settings', settings);

// ---------------------------------------------------------------- renderer / scena
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, settings.quality === 'low' ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(ENV.horizon, 420, 2700);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 9000);

const hemi = new THREE.HemisphereLight(0xd6e8ff, 0x5d7a3a, 1.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe7c8, 2.7);
sun.castShadow = true;
const shadowSize = settings.quality === 'low' ? 1024 : settings.quality === 'high' ? 4096 : 2048;
sun.shadow.mapSize.set(shadowSize, shadowSize);
// con grafica alta l'ombra copre molto più spazio (palazzi e alberi lontani) con la stessa nitidezza
const SHR = settings.quality === 'high' ? 140 : 70;
Object.assign(sun.shadow.camera, { left: -SHR, right: SHR, top: SHR, bottom: -SHR, near: 1, far: 800 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = settings.quality === 'high' ? 0.12 : 0.06;
scene.add(sun, sun.target);
const SUN_DIR = ENV.sunDir;

// pista scelta: i dati di Baku (OpenStreetMap) si caricano solo se servono
if (settings.track === 'baku') {
  try { const mod = await import('./tracks/bakuData.js'); selectTrack(bakuTrack(mod.default)); }
  catch (e) { console.warn('Baku non caricata', e); settings.track = 'nova'; }
} else if (settings.track === 'spa') {
  // Spa: dati della pista e modello 3D completo del circuito
  try {
    const [mod] = await Promise.all([import('./tracks/spaData.js'), loadTrackModel('spa.glb')]);
    selectTrack(spaTrack(mod.default));
  } catch (e) { console.warn('Spa non caricata', e); settings.track = 'nova'; }
}
const keyOf = id => (id && id !== 'nova' ? '.' + id : '') + (IS_F1 ? '.f1' : '');
const trackKey = keyOf(settings.track);   // record separati per circuito e categoria
const track = new Track();
// Baku: luce del tardo pomeriggio (la gara vera è al tramonto sul Caspio): sole basso e caldo,
// ombre lunghe, cielo che sfuma nell'arancio, foschia dorata in lontananza
if (track.street) {
  ENV.skyTop = 0x3a6fb8; ENV.horizon = 0xf2c28c;
  ENV.sunDir.set(0.72, 0.26, -0.64).normalize();
  sun.color.set(0xffb36b); sun.intensity = 3.1;
  hemi.color.set(0xb4c4e4); hemi.groundColor.set(0x6a5442); hemi.intensity = 0.95;
  scene.fog = new THREE.Fog(0xe9c39a, 260, 2300);
  renderer.toneMappingExposure = 1.02;
}
const sounds = new Sound();
sounds.level = settings.audio; sounds.radioOn = settings.radio;
// l'audio del browser parte solo dopo un tocco: lo si accende al primo gesto
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => sounds.init(), { capture: true, passive: true });
addEventListener('click', e => { if (e.target.closest && e.target.closest('#menu button, #pause button, #results button, .pitPanel button')) sounds.ui(); }, true);
const input = new Input();
// menu col controller: croce/stick per muoversi, A sceglie, B indietro
const padNav = new PadNav({
  garage: () => garage,
  onConnect: () => showBanner('🎮 CONTROLLER COLLEGATO', 'green', 2.5, true),
});
let scenery, car, ghostCar, phys, particles, skids, debris, racingLine, pitLane;
let minimap, post = null, glow = null, bakuFx = null;

function build() {
  track.quality = settings.quality;
  scene.add(track.build(renderer));
  scenery = new (TRACK.model ? ModelScenery : track.street ? BakuScenery : Scenery)(scene, track, renderer, settings.quality);
  scenery.build();

  // riflessi ambientali generati dal cielo
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(scenery.skyMesh.clone());
  const g = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), new THREE.MeshBasicMaterial({ color: track.street ? 0x6f6a5e : 0x3f6a33 }));
  g.rotation.x = -Math.PI / 2; g.position.y = -5; envScene.add(g);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.6;
  // Baku: nei riflessi (carrozzerie, asfalto) si vede la città vera, non solo il cielo
  if (track.street && settings.quality !== 'low') {
    try {
      const crt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
      const cc = new THREE.CubeCamera(1, 6000, crt);
      const s0 = track.samples[Math.round(track.count * 0.02)];
      cc.position.set(s0.x, s0.y + 4, s0.z);
      const envOld = scene.environment; scene.environment = null;
      scenery.skyMesh.position.copy(cc.position);
      cc.update(renderer, scene);
      scene.environment = pmrem.fromCubemap(crt.texture).texture;
      crt.dispose(); envOld.dispose();
      scene.environmentIntensity = 0.75;
    } catch (e) { console.warn('riflessi città non disponibili', e); }
  }

  // effetti da ripresa TV (bagliore, colori, sfocatura in velocità): solo con grafica alta
  if (settings.quality === 'high' && settings.post !== false) {
    try { post = new Post(renderer, scene, camera, { warm: track.street ? 1 : 0.3, bloom: track.street ? 0.38 : 0.3, rays: track.street, ao: true }); post.setSize(innerWidth, innerHeight); }
    catch (e) { console.warn('effetti non disponibili', e); post = null; }
  }
  car = gtReady() ? makeCar(playerCarOpts()) : createCar();
  scene.add(car.root);
  ghostCar = gtReady() ? makeCar({ ghost: true }) : createCar({ ghost: true });
  ghostCar.root.visible = false;
  scene.add(ghostCar.root);

  pitLane = new PitLane(track);
  pitLane.build(scene);
  racingLine = new RacingLine(track);
  // traiettoria gommata (le piste da modello 3D ce l'hanno già)
  if (!TRACK.model) scene.add(racingLine.buildRubber());
  scene.add(racingLine.build());
  if (track.street) bakuFx = new BakuFx(scene, track, racingLine, scenery, { high: settings.quality === 'high' });
  phys = new CarPhysics(track);
  phys.on('impact', onImpact);
  particles = new Particles(scene);
  // scintille e bagliori (si sommano alla luce: con gli effetti TV brillano)
  glow = new Particles(scene, settings.quality === 'high' ? 700 : 300, { additive: true });
  skids = new SkidMarks(scene);
  debris = new Debris(scene, track);
  phys.hazards = p => debris.contact(p);
  minimap = new Minimap($('minimap'), track);
  localMap = new LocalMap($('localMap'), track);

  $('trackLen').textContent = (track.length / 1000).toFixed(2).replace('.', ',') + ' KM';
  $('trackName').textContent = track.name + ' · ' + (IS_F1 ? 'FORMULA 1' : 'GT3');
}

// ---------------------------------------------------------------- stato di gioco
let mode = 'menu';           // menu | countdown | race | pause | dnf
let simTime = 0;
let countdown = null;
// record separati anche per modalità di guida (arcade e realistica non si confrontano)
const recKey = () => trackKey + (ARC() ? '.arc' : '');
let best = store.get('novaf1.best.v3' + recKey());       // { time, sectors, split, ghost }
let bestSectors = store.get('novaf1.bestSectors.v3' + recKey()) || [null, null, null];
function loadRecords() {
  best = store.get('novaf1.best.v3' + recKey());
  bestSectors = store.get('novaf1.bestSectors.v3' + recKey()) || [null, null, null];
}
let lap = null;
let lastLap = null;
let laps = [];
let camMode = settings.cam;
let camState = { yaw: 0, pos: new THREE.Vector3(), init: false, shake: 0, fov: 60 };
let dnfTimer = -1;
let lastImpactSound = 0;
let bannerTimer = 0;
let gameType = 'trial';       // trial | race
let lastFeed = -99, lastPos = 0, retiredSeen = new Set();
let race = null, coolAI = null, resultsTimer = -1, lastLapWarned = false, raceHudT = 0;
let sc = null, scPlayerIdx = -1, scPassT = -99;

function newLap(start) {
  return { active: true, start, sector: 0, sectorStart: start, sectors: [null, null, null], valid: true, rec: [], recNext: 0, split: [], splitNext: 0 };
}

function resetSession() {
  sessBest = [null, null, null]; secHold = null; rsec = null;
  debris.restore();
  particles.clear();
  if (glow) glow.clear();
  if (bakuFx) bakuFx.clear();
  skids.clear();
  phys.reset(track.count - 6, -3.4);
  phys.damageMode = dmMode();
  phys.arcade = ARC();
  racingLine.setArcade(ARC());
  arcOffT = 0;
  phys.fuel = 10; phys.mass = phys.baseMass + phys.fuel;
  lap = { active: false, sector: -1, valid: true };
  laps = [];
  lastLap = null;
  simTime = 0;
  dnfTimer = -1;
  camState.init = false;
  updateCarVisual(0);
  setSectorsHud([]);
  $('lastTime').textContent = fmt(null);
  $('invalid').classList.add('hidden');
}

function startCountdown() {
  mode = 'countdown';
  countdown = { t: 0, out: 5 + 0.4 + Math.random() * 1.4, lit: 0 };
  $('lightsHud').classList.remove('hidden');
  [...$('lightsHud').children].forEach(i => i.classList.remove('on'));
  scenery.setLights(0);
}

function clearRace() {
  if (recorder && !recorder.stopped && recorder.frames.length > HZ_MIN_FRAMES) saveReplay(recorder.pack());
  recorder = null;
  if (race) for (const c of race.cars) if (c.model) scene.remove(c.model.root);
  if (sc) { sc.dispose(); sc = null; }
  $('scBadge').classList.add('hidden'); scBadgeUntil = -1;
  race = null; coolAI = null; resultsTimer = -1; lastLapWarned = false; attract = null;
  for (const k in radioSaid) delete radioSaid[k];
  audioPos = 0;
  lastPos = 0; retiredSeen = new Set(); lastFeed = -99;
  document.body.classList.remove('race-mode');
  $('racePos').classList.add('hidden');
  $('tower').classList.add('hidden'); hudCache.tower = hudCache.flag = null;
  if (phys) { phys.inPit = false; phys.compound = 'M'; setTyreColor(car, 'M'); }
  $('pitPanel').classList.add('hidden');
  $('results').classList.add('hidden');
}

function startRaceGame() {
  gameType = 'race';
  prepareStart();
  clearRace();
  race = new Race(track, racingLine, {
    laps: settings.raceLaps, bots: settings.raceBots, strength: settings.raceStrength,
    startPos: settings.raceStart, playerPhys: phys, damageMode: dmMode(),
    arcade: ARC(), tow: settings.arcTow, rubber: settings.arcRubber,
    playerTeam: IS_F1 ? teamById(settings.f1Team) : null, grid: IS_F1 ? f1Grid(settings.f1Team, settings.raceBots) : null,
    pitLane, startCompound: settings.raceTyre,
  });
  race.onEvent = (c, kind, pit) => {
    const model = c.isPlayer ? car : c.model;
    if (kind === 'pitIn' && c.isPlayer) {
      sounds.radio('Ok, box box. Scegli le gomme.');
      const left = race.laps - race.player.crossings;
      pit.plan.compound = left >= 12 ? 'H' : left >= 5 ? 'M' : 'S';
      pit.plan.repair = phys.repairTime() > 0.5;
      pitChoice = pit.plan;
      $('pitPanel').classList.remove('hidden');
      pitUi();
    }
    if (kind === 'serviced') {
      setTyreColor(model, c.phys.compound);
      if (pit.repaired && model) debris.restoreFor(model.root);
      if (c.isPlayer) showBanner(`PIT STOP ${pit.serviceTotal.toFixed(1)} s · ${COMPOUNDS[c.phys.compound].name}${pit.repaired ? ' · RIPARATA' : ''}`, 'green', 3, true);
      else feed(`${c.name} AI BOX: ${COMPOUNDS[c.phys.compound].name}`, 'yellow');
    }
    if (kind === 'pitOut' && c.isPlayer) { $('pitPanel').classList.add('hidden'); pitUi(); }
    if (kind === 'engine') feed(`PROBLEMA AL MOTORE PER ${c.name}`, 'yellow');
    else if (kind === 'gearbox') feed(`${c.name}: PROBLEMA AL CAMBIO`, 'yellow');
    else if (kind === 'retired') { lastFeed = -99; feed(`${c.name} SI RITIRA · ${c.retireWhy}`, 'red'); }
  };
  spawnRaceModels();
  // safety car (vettura gialla con barra luci)
  const scModel = gtReady() ? makeCar({ primary: 0x16171b, accent: 0xf4f4f4, lod: 'mid', safety: true }) : createCar({ primary: 0xf4f4f4, accent: 0x16171b });
  sc = new SafetyCar({ race, track, line: racingLine, debris, scene, model: scModel });
  // registrazione per il replay
  recorder = new Recorder(race.cars, {
    track: settings.track, trackName: track.name, carClass: settings.carClass, driveMode: settings.driveMode, laps: race.laps, date: Date.now(),
    cars: race.cars.map(c => ({ name: c.name, color: c.color, accent: c.accent, teamId: c.team ? c.team.id : null, isPlayer: !!c.isPlayer })),
  });
  startRaceRest();
}
// modelli 3D dei bot della gara (anche per la gara sullo sfondo del menu)
function spawnRaceModels() {
  for (const c of race.cars) {
    if (c.isPlayer) continue;
    c.model = gtReady() ? makeCar(c.team ? { team: c.team, lod: 'mid' } : { primary: c.color, accent: c.accent, lod: 'mid' }) : mergeCar(createCar({ primary: c.color, accent: c.accent }));
    scene.add(c.model.root);
    c.phys.on('impact', e => onImpact(e, c));
    c.phys.hazards = p => debris.contact(p);
    c.skidKey = 4 + c.slot * 4;
    setTyreColor(c.model, c.phys.compound);
    updateModel(c.model, c.phys, 0);
  }
}
function startRaceRest() {
  sc.onEvent = kind => {
    if (kind === 'out') { feed('SAFETY CAR IN PISTA: RIMANETE IN FILA', 'yellow'); sounds.radio('Safety car, safety car. Rallenta e resta in fila, niente sorpassi.'); }
    if (kind === 'in') { feed('SAFETY CAR RIENTRA IN QUESTO GIRO', 'yellow'); sounds.radio('La safety car rientra in questo giro. Scalda le gomme.'); }
    if (kind === 'green') { feed('BANDIERA VERDE: SI TORNA A CORRERE', 'green'); scBadge('GO', 'green', 3); sounds.radio('Bandiera verde! Vai, vai, vai!'); sounds.cheerUp(0.5); }
  };
  scPlayerIdx = -1;
  setTyreColor(car, phys.compound);
  document.body.classList.add('race-mode');
  $('racePos').classList.remove('hidden');
  $('tower').classList.remove('hidden');
  pitUi();
  camState.init = false;
  updateCarVisual(0);
  startCountdown();
  pitUi();
}

function startGame() {
  gameType = 'trial';
  clearRace();
  prepareStart();
  startCountdown();
}

function prepareStart() {
  if (settings.steer === 'tilt') input.requestTilt();
  goLandscape();
  gameStartedAt = performance.now();
  sounds.init();
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  minimap.resize();
  $('pause').classList.add('hidden');
  $('dnf').classList.add('hidden');
  $('results').classList.add('hidden');
  resetSession();
}

// ---------------------------------------------------------------- urti e danni
function onImpact(c, bot = null) {
  const v = c.impact;
  if (c.part === 'puncture') {
    if (bot) feed(`FORATURA PER ${bot.name}`, 'yellow');
    else showBanner('FORATURA!', 'red', 2.5);
    return;
  }
  if (bot) {
    // urti degli avversari: scintille e suono attenuato dalla distanza
    const d = Math.hypot(c.x - phys.x, c.z - phys.z);
    if (d > 150) return;
    const n = Math.min(20, Math.floor(v * 1.2));
    for (let i = 0; i < n; i++) particles.emit(c.x, c.y + 0.3, c.z, { color: [1, 0.7, 0.25], size: 0.14, life: 0.4, vx: bot.phys.vx * 0.6 + (Math.random() - 0.5) * 8, vy: 1 + Math.random() * 4, vz: bot.phys.vz * 0.6 + (Math.random() - 0.5) * 8, grav: 9.8, drag: 1 });
    if (d < 90 && v > 2.5 && simTime - lastImpactSound > 0.2) { sounds.crash(v / 22 * Math.max(0, 1 - d / 90) ** 1.5, c.part === 'car' ? 'car' : 'wall'); lastImpactSound = simTime; }
    // cronaca: incidenti degli avversari
    if (c.part !== 'car' && v > 10) feed(`INCIDENTE PER ${bot.name}!`, 'yellow');
    return;
  }
  // scintille
  const n = Math.min(30, Math.floor(v * 1.5 + c.scrape * 0.4));
  for (let i = 0; i < n; i++) {
    particles.emit(c.x, c.y + 0.2 + Math.random() * 0.3, c.z, {
      color: [1, 0.65 + Math.random() * 0.3, 0.2], size: 0.12 + Math.random() * 0.1, life: 0.25 + Math.random() * 0.35,
      vx: phys.vx * 0.6 + (Math.random() - 0.5) * 8 + c.nx * 3, vy: 1 + Math.random() * 4, vz: phys.vz * 0.6 + (Math.random() - 0.5) * 8 + c.nz * 3, grav: 9.8, drag: 1,
    });
  }
  if (v > 4) {
    for (let i = 0; i < Math.min(12, v); i++) particles.emit(c.x, c.y + 0.4, c.z, {
      color: [0.55, 0.55, 0.55], size: 1 + Math.random(), grow: 2.5, life: 1.2, alpha: 0.35,
      vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 3, drag: 1.5,
    });
  }
  if (simTime - lastImpactSound > 0.15 && v > 1.2) {
    sounds.crash(v / 20, c.part === 'car' ? 'car' : 'wall');
    lastImpactSound = simTime;
  }
  if (c.part !== 'car' && c.scrape > 2) sounds.scrapeWall(c.scrape);
  // radio: danni seri all'ala o alle sospensioni
  if (mode === 'race' && race && race.pitLane && !radioSaid.damage && (phys.damage.fwL + phys.damage.fwR > 0.7 || Math.max(...phys.damage.susp) > 0.5)) {
    radioSaid.damage = true; setTimeout(() => sounds.radio('Abbiamo danni sulla vettura. Valuta di rientrare ai box.'), 1200);
  }
  camState.shake = Math.min(1, camState.shake + v / 18);
  if (v > 6 && mode === 'race') showBanner(v > 18 ? 'IMPATTO VIOLENTO!' : c.part === 'car' ? 'CONTATTO CON UN AVVERSARIO' : 'CONTATTO CON LE BARRIERE', 'red', 1.5);
}

function checkDetachments() {
  detachParts(car, phys, null);
  // ritiro
  if (dnfTimer < 0 && phys.isWrecked()) {
    dnfTimer = 2.2;
    const d = phys.damage;
    $('dnfReason').textContent = d.engine >= 1 ? 'Motore distrutto dopo l\'impatto.' : 'Sospensione rotta: ruota persa!';
    showBanner('BANDIERA ROSSA', 'red', 2.2, true);
  }
}

// pezzi che si staccano (anche dalle vetture avversarie)
function detachParts(car, phys, bot) {
  const d = phys.damage;
  if (phys.damageMode === 'cosmetic' && !bot) { /* anche in modalità estetica i pezzi volano */ }
  const vel = new THREE.Vector3(phys.vx, 0, phys.vz);
  const lost = [];
  car.fwHalves.forEach((half, k) => {
    const v = k === 0 ? d.fwL : d.fwR;
    const end = half.userData.endplate;
    if (v > 0.4 && !end.userData.detached) debris.detach(end, vel, new THREE.Vector3(0, 1, 0), 'end');
    if (v >= 0.85 && !half.userData.detached) { debris.detach(half, vel, new THREE.Vector3(0, 2, 0), 'splitter'); lost.push(IS_F1 ? 'L\'ALA ANTERIORE' : 'LO SPLITTER'); }
  });
  if (d.rw >= 0.85 && !car.rearWing.userData.detached) { debris.detach(car.rearWing, vel, new THREE.Vector3(0, 4, 0), 'wing'); lost.push(IS_F1 ? 'L\'ALA POSTERIORE' : 'L\'ALETTONE'); }
  car.wheels.forEach((w, i) => {
    if (d.susp[i] >= 1 && !w.pivot.userData.detached) { debris.detach(w.pivot, vel, new THREE.Vector3(0, 3, 0), 'wheel'); lost.push('UNA RUOTA'); }
  });
  if (lost.length) {
    if (bot) feed(`${bot.name} PERDE ${lost[0]}`, 'yellow');
    else showBanner(`HAI PERSO ${lost[0]}`, 'red', 2);
  }
}

function feed(text, color = 'yellow') {
  if (simTime - lastFeed < 2.5 || mode !== 'race') return;
  lastFeed = simTime;
  showBanner(text, color, 2.2);
}

// ---------------------------------------------------------------- simulazione
const DT = 1 / 240;
let acc = 0;

function physicsStep(inp) {
  const sPrev = phys.prCG.s;
  const dead = dnfTimer >= 0;
  const cmd = {
    throttle: dead ? 0 : inp.throttle, brake: dead ? 0.3 : inp.brake, steer: dead ? 0 : inp.steer,
    shiftUp: inp.shiftUp, shiftDown: inp.shiftDown, autoGear: settings.auto, tc: settings.tc, abs: settings.abs,
  };
  inp.shiftUp = inp.shiftDown = false;
  simTime += DT;
  if (gameType === 'race') {
    // dopo la bandiera a scacchi il giro di rientro lo guida il computer
    if (race.player.finishT != null && !coolAI) {
      coolAI = new AIDriver(phys, racingLine, 25, 7);
      const pos = race.standings().indexOf(race.player) + 1;
      showBanner(pos === 1 ? 'BANDIERA A SCACCHI · VITTORIA!' : `BANDIERA A SCACCHI · ${pos}° POSTO`, pos === 1 ? 'purple' : 'green', 3, true);
      sounds.cheerUp(pos <= 3 ? 1 : 0.6);
      sounds.radio(pos === 1 ? 'Sì! Hai vinto! Che gara, fantastico!' : pos <= 3 ? `P${pos}! Sul podio, grande gara!` : `Bandiera a scacchi. Finisci P${pos}. Buon lavoro.`);
      resultsTimer = 2;
    }
    const pc = coolAI ? coolAI.drive(DT, race.cars, 99) : cmd;
    race.step(DT, pc, true);
    if (!coolAI) { arcadeCut(); arcadeRescue(DT); }
    if (race.player.finishT == null) raceSectors(sPrev, phys.prCG.s);
    return;
  }
  phys.step(DT, cmd);
  timing(sPrev, phys.prCG.s);
  arcadeRescue(DT);
}

// arcade: tagliare la pista con quattro ruote costa 2 secondi (invece di cancellare il giro)
var cutOut = false;
function arcadeCut() {
  if (!ARC() || phys.inPit) return;
  const out = phys.wheels.every(w => w.sf.type === SURF.GRASS || w.sf.type === SURF.GRAVEL);
  if (out && !cutOut) {
    if (race) race.player.penalty = (race.player.penalty || 0) + ARCADE.cutPenalty;
    else if (lap.active) lap.penalty = (lap.penalty || 0) + ARCADE.cutPenalty;
    showBanner(`TAGLIO DELLA PISTA · +${ARCADE.cutPenalty} s`, 'red', 2, true);
  }
  // si riarma solo dopo essere rientrati bene in pista
  if (phys.wheels.every(w => w.sf.type !== SURF.GRASS && w.sf.type !== SURF.GRAVEL)) cutOut = false;
  else if (out) cutOut = true;
}

// arcade: fermi fuori pista o finiti lontano dalla strada → rimessi in pista da soli
var arcOffT = 0;
function arcadeRescue(dt) {
  if (!ARC() || phys.inPit || dnfTimer >= 0) { arcOffT = 0; return; }
  const pr = phys.prCG, sm = track.samples[pr.i0 ?? pr.i];
  const edge = (pr.d > 0 ? sm.hwL : sm.hwR) ?? sm.hw;
  const off = Math.abs(pr.d) - edge;
  const bad = (off > 1.5 && phys.speed < 3) || off > 14 || (phys.speed < 1 && Math.cos(phys.yaw - Math.atan2(sm.tz, sm.tx)) < -0.3);
  arcOffT = bad ? arcOffT + dt : Math.max(0, arcOffT - dt * 2);
  if (arcOffT > 2.2) { arcOffT = 0; rescue(); }
}

function timing(sPrev, sNow) {
  const L = track.length;
  const crossedFwd = sPrev > L - 80 && sNow < 80;
  const crossedBack = sPrev < 80 && sNow > L - 80;
  if (crossedBack) { if (lap.active) { lap.sector = -1; lap.valid = false; } return; }
  if (crossedFwd) {
    const f = (L - sPrev) / ((L - sPrev) + sNow);
    const tCross = simTime - DT + DT * f;
    if (lap.active && lap.sector === 2) {
      lap.sectors[2] = tCross - lap.sectorStart;
      (lap.secCls ||= [])[2] = secClass(2, lap.sectors[2], lap.valid);
      secHold = null; paintSectors(lap.sectors, lap.secCls, -1);
      secHold = { until: simTime + 3.5 };
      finishLap(tCross - lap.start + (lap.penalty || 0));
    } else if (lap.active) {
      showBanner('GIRO NON COMPLETO', 'red', 2, true);
    }
    lap = newLap(tCross);
    lap.no = laps.length + 1;
    lap.valid = true;
    $('invalid').classList.add('hidden');
    setSectorsHud(lap.sectors);
    return;
  }
  if (!lap.active) return;
  // settori
  for (let k = 1; k <= 2; k++) {
    const b = track.sectorIdx[k] * track.step;
    if (lap.sector === k - 1 && sPrev < b && sNow >= b && sNow - sPrev < 20) {
      const f = (b - sPrev) / (sNow - sPrev);
      const t = simTime - DT + DT * f;
      lap.sectors[k - 1] = t - lap.sectorStart;
      lap.sectorStart = t;
      lap.sector = k;
      (lap.secCls ||= [])[k - 1] = secClass(k - 1, lap.sectors[k - 1], lap.valid);
      setSectorsHud(lap.sectors, k);
      const tSec = lap.sectors[k - 1];
      const pb = bestSectors[k - 1];
      if (lap.valid && best && best.split) {
        const d = (t - lap.start) - best.split[Math.min(best.split.length - 1, Math.floor(b / 10))];
        showBanner(`SETTORE ${k}  ${fmt(tSec).slice(2)}  ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(3)}`, pb == null || tSec < pb ? 'purple' : 'yellow', 2.2, true);
      }
    }
  }
  // limiti della pista: tutte e quattro le ruote fuori
  if (ARC()) arcadeCut();
  else if (lap.valid && phys.wheels.every(w => w.sf.type === SURF.GRASS || w.sf.type === SURF.GRAVEL)) {
    lap.valid = false;
    $('invalid').classList.remove('hidden');
    showBanner('LIMITI DELLA PISTA · GIRO CANCELLATO', 'red', 2.5, true);
  }
  // registrazione del fantasma e dei tempi intermedi
  const t = simTime - lap.start;
  if (t >= lap.recNext) {
    lap.rec.push(+phys.x.toFixed(2), +phys.y.toFixed(3), +phys.z.toFixed(2), +phys.yaw.toFixed(4), +phys.pitch.toFixed(4), +phys.roll.toFixed(4), +phys.steer.toFixed(3));
    lap.recNext += 0.05;
  }
  const bucket = Math.floor(sNow / 10);
  while (lap.split.length <= bucket && sNow - sPrev < 20 && sNow < L - 5) lap.split.push(+t.toFixed(3));
}

function finishLap(time) {
  const valid = lap.valid;
  laps.push({ time, valid, sectors: lap.sectors.slice() });
  lastLap = time;
  $('lastTime').textContent = fmt(time);
  let isBest = false;
  if (valid) {
    lap.sectors.forEach((s, k) => { if (s != null && (bestSectors[k] == null || s < bestSectors[k])) bestSectors[k] = s; });
    store.set('novaf1.bestSectors.v3' + recKey(), bestSectors);
    if (!best || time < best.time) {
      isBest = true;
      best = { time, sectors: lap.sectors.slice(), split: lap.split, ghost: lap.rec };
      store.set('novaf1.best.v3' + recKey(), best);
    }
  }
  if (isBest) { showBanner(`NUOVO RECORD  ${fmt(time)}`, 'purple', 3.5, true); if (gameType === 'trial') sounds.radio('Nuovo record! Giro fantastico.'); }
  else showBanner(`GIRO ${laps.length}  ${fmt(time)}${valid ? '' : '  (NON VALIDO)'}`, valid ? 'yellow' : 'red', 3, true);
  sounds.beep(isBest ? 1320 : 990, 0.25, 0.2);
  $('bestTime').textContent = fmt(best && best.time);
}

// ---------------------------------------------------------------- aggiornamento grafica vettura
const tmpV = new THREE.Vector3();
function updateCarVisual(dt) { updateModel(car, phys, dt); }

function updateModel(car, phys, dt) {
  const r = car.root;
  r.position.set(phys.x, phys.y, phys.z);
  r.rotation.set(0, -phys.yaw, 0);
  // vibrazione dei cordoli (visiva)
  const vib = phys.kerbVibe * 0.006;
  // la carrozzeria è ingrandita: si rialza perché le ruote tocchino l'asfalto
  const S = car.scale || 1;
  car.body.position.y = (GEOM.cgHeight + 0.02) * S - GEOM.cgHeight + (Math.random() - 0.5) * vib;
  car.body.rotation.set(phys.roll + (Math.random() - 0.5) * vib * 0.6, 0, phys.pitch, 'YZX');
  car.wheels.forEach((w, i) => {
    const pw = phys.wheels[i];
    if (w.pivot.userData.detached) return;
    // posizione verticale della ruota segue il terreno (escursione sospensione)
    const travel = Math.max(-0.06, Math.min(0.08, pw.comp - 0.013));
    const flat = phys.damage.puncture[i];
    w.pivot.position.y = w.baseY + (travel - 0.05 * flat) / S;
    w.pivot.scale.y = 1 - 0.14 * flat;
    const dm = phys.damage.susp[i];
    w.pivot.rotation.set(w.side * dm * 0.28, -(i < 2 ? phys.steer : 0) - (i % 2 === 0 ? -1 : 1) * dm * 0.045, 0, 'YXZ');
    w.angle -= pw.spin / GEOM.wheelR * dt;
    w.spin.rotation.z = w.angle;
  });
  // flap dell'ala posteriore danneggiato
  const f = car.rearWing.userData.flap;
  if (f && !car.merged) f.rotation.z = phys.damage.rw * 0.6;
  car.fwHalves.forEach((h, k) => { if (!h.userData.detached) h.rotation.x = (k === 0 ? -1 : 1) * (k === 0 ? phys.damage.fwL : phys.damage.fwR) * 0.12; });
}

function updateGhost() {
  const show = gameType === 'trial' && settings.ghost && best && best.ghost && lap && lap.active && mode !== 'menu';
  ghostCar.root.visible = !!show;
  if (!show) return;
  const g = best.ghost, t = (simTime - lap.start) / 0.05;
  const i = Math.floor(t), f = t - i;
  const n = g.length / 7;
  if (i >= n - 1) { ghostCar.root.visible = false; return; }
  const a = i * 7, b = (i + 1) * 7;
  const L = k => g[a + k] + (g[b + k] - g[a + k]) * f;
  ghostCar.root.position.set(L(0), L(1), L(2));
  ghostCar.root.rotation.set(0, -lerpAngle(g[a + 3], g[b + 3], f), 0);
  ghostCar.body.rotation.set(L(5), 0, L(4), 'YZX');
  const steer = L(6);
  ghostCar.wheels.forEach((w, k) => { w.pivot.rotation.y = k < 2 ? -steer : 0; });
  // nascondi il fantasma quando è troppo vicino alla telecamera
  const d = camera.position.distanceTo(ghostCar.root.position);
  ghostCar.root.visible = d > 4;
}

// ---------------------------------------------------------------- effetti per frame
function updateEffects(dt) {
  const cy = Math.cos(phys.yaw), sy = Math.sin(phys.yaw);
  if (!phys.inPit) phys.wheels.forEach((w, i) => {
    const wx = phys.x + cy * w.x - sy * w.y, wz = phys.z + sy * w.x + cy * w.y;
    const gy = w.ground + 0.03;
    const t = w.sf.type;
    if (w.fz <= 0) { skids.add(i, wx, gy, wz, 0); return; }
    if (t === SURF.ROAD || t === SURF.KERB) {
      skids.add(i, wx, gy, wz, w.slide);
      if (w.slide > 0.5 && Math.random() < w.slide * dt * 40) {
        particles.emit(wx, gy + 0.2, wz, { color: [0.85, 0.85, 0.87], size: 0.8, grow: 3, life: 1.4, alpha: 0.35 * w.slide, vx: phys.vx * 0.3, vy: 0.6, vz: phys.vz * 0.3, drag: 2 });
      }
      // gomma bloccata o in derapata: nuvola di fumo bianco-azzurro più densa e lunga
      if ((w.lock || w.spinning || w.slide > 0.75) && phys.speed > 6 && Math.random() < dt * 45) {
        const k = w.lock ? 1 : w.slide;
        particles.emit(wx, gy + 0.15, wz, { color: [0.9, 0.91, 0.94], size: 0.6, grow: 4.5, life: 2.4, alpha: 0.42 * k, vx: phys.vx * 0.15 + (Math.random() - 0.5) * 1.5, vy: 0.9, vz: phys.vz * 0.15 + (Math.random() - 0.5) * 1.5, drag: 1.4 });
      }
    } else {
      skids.add(i, wx, gy, wz, Math.min(1, phys.speed / 15), false);
      if (phys.speed > 5 && Math.random() < dt * 30) {
        const col = t === SURF.GRAVEL ? [0.8, 0.72, 0.52] : [0.35, 0.55, 0.25];
        particles.emit(wx, gy + 0.1, wz, { color: col, size: 0.25, life: 0.8, alpha: 0.9, vx: phys.vx * 0.4 + (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, vz: phys.vz * 0.4 + (Math.random() - 0.5) * 2, grav: 9.8, drag: 0.5 });
        if (t === SURF.GRAVEL) particles.emit(wx, gy + 0.3, wz, { color: [0.82, 0.74, 0.58], size: 1.2, grow: 3, life: 1.5, alpha: 0.3, vy: 0.5, drag: 1 });
      }
    }
  });
  // fumo dal motore danneggiato
  const eng = phys.damage.engine;
  if (eng > 0.3 && Math.random() < dt * 40 * eng) {
    const x = phys.x - cy * 2.2, z = phys.z - sy * 2.2;
    const dark = 0.25 + (1 - eng) * 0.4;
    particles.emit(x, phys.y + 0.5, z, { color: [dark, dark, dark], size: 0.8, grow: 3, life: 2, alpha: 0.45, vx: phys.vx * 0.5, vy: 1.5, vz: phys.vz * 0.5, drag: 1 });
  }
  sparks(phys, dt);
  brakeGlow();
  if (race) for (const c of race.cars) {
    if (c.isPlayer || c.gone || c.pit) continue;
    const p = c.phys;
    if (Math.abs(p.x - phys.x) > 250 || Math.abs(p.z - phys.z) > 250) continue;
    sparks(p, dt);
    const cy2 = Math.cos(p.yaw), sy2 = Math.sin(p.yaw);
    p.wheels.forEach((w, i) => {
      const wx = p.x + cy2 * w.x - sy2 * w.y, wz = p.z + sy2 * w.x + cy2 * w.y;
      const onRoad = w.sf.type <= SURF.KERB;
      skids.add(c.skidKey + i, wx, w.ground + 0.03, wz, w.fz > 0 ? (onRoad ? w.slide : Math.min(1, p.speed / 15)) : 0, onRoad);
      if (onRoad && w.slide > 0.5 && Math.random() < w.slide * dt * 25) particles.emit(wx, w.ground + 0.2, wz, { color: [0.85, 0.85, 0.87], size: 0.8, grow: 3, life: 1.2, alpha: 0.3 * w.slide, vx: p.vx * 0.3, vy: 0.6, vz: p.vz * 0.3, drag: 2 });
      if (!onRoad && p.speed > 5 && Math.random() < dt * 15) particles.emit(wx, w.ground + 0.1, wz, { color: w.sf.type === SURF.GRAVEL ? [0.8, 0.72, 0.52] : [0.35, 0.55, 0.25], size: 0.25, life: 0.8, vx: p.vx * 0.4, vy: 2 + Math.random() * 3, vz: p.vz * 0.4, grav: 9.8, drag: 0.5 });
    });
    if (p.damage.engine > 0.3 && Math.random() < dt * 30 * p.damage.engine) particles.emit(p.x - cy2 * 2.2, p.y + 0.5, p.z - sy2 * 2.2, { color: [0.3, 0.3, 0.3], size: 0.8, grow: 3, life: 2, alpha: 0.45, vx: p.vx * 0.5, vy: 1.5, vz: p.vz * 0.5, drag: 1 });
  }
  if (bakuFx) {
    const cars = [{ p: phys, f1: IS_F1, key: 'me' }];
    if (race) for (const c of race.cars) {
      if (c.isPlayer || c.gone || c.pit) continue;
      if (Math.abs(c.phys.x - phys.x) > 160 || Math.abs(c.phys.z - phys.z) > 160) continue;
      cars.push({ p: c.phys, f1: IS_F1, key: c });
    }
    camera.getWorldDirection(fxDir);
    bakuFx.update(dt, {
      cars, focus: mode === 'menu' && attract && attract.shot ? attract.shot.car.phys : phys, camDir: fxDir,
      progress: race ? race.player.crossings / Math.max(1, race.laps) : 0.4,
      countdown: mode === 'countdown', finished: !!(race && race.player.finishT != null), stands: scenery.standPos,
    });
  }
  particles.update(dt);
  glow.update(dt);
  debris.update(dt, phys.hint);
}
// F1: il fondo (pattino in titanio) tocca l'asfalto in velocità, sui dossi e sui cordoli:
// scie di scintille che restano indietro
const fxDir = new THREE.Vector3();
function sparks(p, dt) {
  if (!IS_F1 || ARC() || p.speed < 48) return;
  const rate = (p.speed - 48) / 25 * (0.35 + Math.min(2, p.kerbVibe) * 2.5) * (1 + Math.max(0, -p.pitch) * 40);
  let n = rate * dt * 60 * (Math.random() < 0.35 ? 1 : 0.15);
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  while (n > 0 && (n >= 1 || Math.random() < n)) {
    n -= 1;
    const back = -0.4 - Math.random() * 1.6, lat = (Math.random() - 0.5) * 0.6;
    const x = p.x + cy * back - sy * lat, z = p.z + sy * back + cy * lat;
    const sp = 0.78 + Math.random() * 0.15, side = (Math.random() - 0.5) * 6;
    const hot = 2.6 + Math.random() * 1.4;
    glow.emit(x, p.y - 0.28, z, { color: [hot, hot * 0.55, hot * 0.18], size: 0.05 + Math.random() * 0.05, life: 0.18 + Math.random() * 0.3, alpha: 1,
      vx: p.vx * sp - sy * side, vy: 0.3 + Math.random() * 2.2, vz: p.vz * sp + cy * side, grav: 9.8, drag: 0.6 });
  }
}
// dischi dei freni roventi: arancio in staccata (vettura del giocatore)
function brakeGlow() {
  if (!car) return;
  if (!car.discMats) {
    car.discMats = [];
    const seen = new Map();
    car.root.traverse(o => {
      if (!o.isMesh || !o.material || !/disc/i.test(o.material.name || '')) return;
      if (!seen.has(o.material)) { const m = o.material.clone(); m.emissive = new THREE.Color(0xff4a10); m.emissiveIntensity = 0; seen.set(o.material, m); car.discMats.push(m); }
      o.material = seen.get(o.material);
    });
  }
  const k = Math.max(0, Math.min(1, (phys.brakeTemp - 520) / 420));
  for (const m of car.discMats) m.emissiveIntensity = k * k * 4;
}

// regole in regime di safety car: chi sorpassa prende una penalità di tempo
function scRules() {
  if (!sc.active || !race || race.player.finishT != null) { if (simTime > scBadgeUntil) scBadge(null); scPlayerIdx = -1; return; }
  if (simTime > scBadgeUntil) scBadge(sc.phase === 'restart' ? 'SC' : 'SC', sc.phase === 'out' ? 'sc' : 'scIn');
  const p = race.player;
  if (p.pit) { scPlayerIdx = -1; return; }
  const ord = sc.order(), idx = ord.indexOf(p);
  if (scPlayerIdx >= 0 && idx >= 0 && idx < scPlayerIdx && simTime - scPassT > 2) {
    const passed = ord[idx + 1];
    if (passed && passed.phys.speed > 12) { penalize(5, 'SORPASSO IN REGIME DI SAFETY CAR'); scPassT = simTime; }
  }
  if (sc.isAhead(p) === false && (sc.phase === 'out' || sc.phase === 'in') && simTime - scPassT > 4) { penalize(10, 'HAI SUPERATO LA SAFETY CAR'); scPassT = simTime; }
  scPlayerIdx = idx;
}

// quadratino accanto a pausa/telecamera: SC (giallo lampeggiante), SC in rientro, GO, penalità
let scBadgeUntil = -1;
function scBadge(text, kind = 'sc', hold = 0) {
  const el = $('scBadge');
  if (!text) { el.classList.add('hidden'); return; }
  el.textContent = text;
  el.className = 'scBadge ' + kind;
  if (hold) scBadgeUntil = simTime + hold;
}

function penalize(sec, why) {
  race.player.penalty = (race.player.penalty || 0) + sec;
  scBadge(`+${sec}s`, 'pen', 3);
  feed(`PENALITÀ ${race.player.name}: +${sec} s (${why.toLowerCase()})`, 'red');
  sounds.radio(`Abbiamo una penalità di ${sec} secondi.`);
}

// ---------------------------------------------------------------- telecamera
const CAMS = ['TV', 'INSEGUIMENTO', 'T-CAM', 'ABITACOLO'];
const qTmp = new THREE.Quaternion(), qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
function updateCamera(dt) {
  const portrait = camera.aspect < 0.85;
  if (camMode !== 3 || (IS_F1 && ARC()) || mode === 'menu') hideCockpit();
  const cy = Math.cos(phys.yaw), sy = Math.sin(phys.yaw);
  car.helmet.forEach(h => h.visible = camMode !== 3);
  let baseFov = portrait ? 74 : 58;
  const ov = window.__camOverride;
  if (ov) { camera.position.set(...ov.pos); camera.lookAt(...ov.look); camera.fov = ov.fov || 60; camera.updateProjectionMatrix(); return; }
  if (mode === 'menu') {
    const t = performance.now() / 1000 * 0.12;
    const d = portrait ? 11 : 8.5;
    camera.position.set(phys.x + Math.cos(t) * d, phys.y + 2.2, phys.z + Math.sin(t) * d);
    camera.lookAt(phys.x, phys.y + 0.3, phys.z);
    camera.fov = baseFov; camera.updateProjectionMatrix();
    return;
  }
  if (camMode <= 1) {
    // 0 = visuale TV da dietro, alta e distante (come nei giochi arcade di F1); 1 = più bassa e vicina
    const dist = camMode === 0 ? (portrait ? 12.5 : 12) : (portrait ? 9.5 : 8);
    const h = camMode === 0 ? (portrait ? 8 : 7.2) : (portrait ? 4.4 : 3.2);
    const ahead = camMode === 0 ? 3 : 4.5, lookY = camMode === 0 ? 0 : 0.7;
    // la telecamera segue la direzione del moto quando la vettura scivola
    let target = phys.yaw;
    if (phys.speed > 5) {
      const vh = Math.atan2(phys.vz, phys.vx);
      const d = Math.abs(lerpAngle(0, vh - phys.yaw, 1));
      if (d < 1.4) target = lerpAngle(phys.yaw, vh, 0.35);
    }
    if (!camState.init) { camState.yaw = target; }
    camState.yaw = lerpAngle(camState.yaw, target, 1 - Math.exp(-dt * 6));
    const want = tmpV.set(phys.x - Math.cos(camState.yaw) * dist, phys.y + h, phys.z - Math.sin(camState.yaw) * dist);
    // non scendere sotto il terreno
    if (!camState.init) { camState.pos.copy(want); camState.init = true; }
    camState.pos.x += (want.x - camState.pos.x) * (1 - Math.exp(-dt * 18));
    camState.pos.z += (want.z - camState.pos.z) * (1 - Math.exp(-dt * 18));
    camState.pos.y += (want.y - camState.pos.y) * (1 - Math.exp(-dt * 8));
    camera.position.copy(camState.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(phys.x + cy * ahead, phys.y + lookY, phys.z + sy * ahead);
  } else if (camMode === 3 && !(IS_F1 && ARC()) && cockpitView(dt)) {
    const st = IS_F1 ? settings.seatF1 : settings.seat3;
    baseFov = window.__ckFov || (portrait ? st.fov + 22 : st.fov);
  } else {
    car.root.updateMatrixWorld(true);
    const local = IS_F1 ? (camMode === 2 ? tmpV.set(-0.42, 0.95, 0) : tmpV.set(0.05, 0.52, 0)) : (camMode === 2 ? tmpV.set(-0.6, 1.08, 0) : tmpV.set(-0.4, 0.68, -0.26));
    camera.position.copy(car.body.localToWorld(local));
    car.body.getWorldQuaternion(qTmp);
    camera.quaternion.copy(qTmp).multiply(qYaw);
    baseFov = portrait ? 80 : 66;
  }
  // tremolio: cordoli, urti, velocità
  camState.shake = Math.max(0, camState.shake - dt * 2.5);
  // dossi e avvallamenti: la visuale sobbalza con le variazioni di velocità verticale
  if (dt > 0) {
    const vy = (phys.y - (camState.lastY ?? phys.y)) / dt;
    const jolt = Math.abs(vy - (camState.lastVy ?? vy));
    camState.lastY = phys.y; camState.lastVy = vy;
    if (jolt > 0.6 && jolt < 30) camState.shake = Math.min(1, camState.shake + jolt * 0.012 * (camMode === 3 ? 1.6 : 1));
  }
  const sh = camState.shake * 0.25 + Math.min(1.5, phys.kerbVibe) * (camMode === 3 ? 0.03 : 0.018) + Math.min(1, phys.speed / 90) * (camMode === 3 ? 0.007 : 0.004);
  camera.position.x += (Math.random() - 0.5) * sh;
  camera.position.y += (Math.random() - 0.5) * sh;
  camera.position.z += (Math.random() - 0.5) * sh;
  const fov = baseFov + (camMode === 3 && !IS_F1 ? Math.min(3, phys.speed * 0.03) : Math.min(14, phys.speed * 0.11));
  camState.fov += (fov - camState.fov) * Math.min(1, dt * 3);
  camera.fov = camState.fov;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- abitacolo GT (come nei simulatori)
// Visuale dagli occhi del pilota: volante che gira, led dei giri, display con marcia e tempi,
// testa che segue le forze G e guarda un filo verso la curva.
let cockpitLoading = false;
const eyeTmp = new THREE.Vector3(), qPitch = new THREE.Quaternion(), qLook = new THREE.Quaternion(), axY = new THREE.Vector3(0, 1, 0), axZ = new THREE.Vector3(0, 0, 1);
function cockpitView(dt) {
  if (!car.cockpit) {
    if (!cockpitLoading) {
      cockpitLoading = true;
      showBanner('CARICAMENTO ABITACOLO…', 'yellow', 1.5, true);
      loadInterior().then(() => { attachInterior(car); $('banner').classList.add('hidden'); bannerTimer = 0; }).catch(() => { cockpitLoading = false; showBanner('ABITACOLO NON DISPONIBILE', 'red', 2, true); });
    }
    return false;
  }
  const ck = car.cockpit;
  ck.group.visible = true;
  document.body.classList.add('cockpitCam');
  ck.outerGlass.forEach(o => o.visible = false);
  // testa: le forze G la spostano un poco (frenata in avanti, curva verso l'esterno)
  const hs = ck.head || (ck.head = { x: 0, z: 0, yaw: 0 });
  hs.x += (-phys.gLong * 0.018 - hs.x) * Math.min(1, dt * 6);
  hs.z += (phys.gLat * 0.016 - hs.z) * Math.min(1, dt * 6);
  hs.yaw += (-phys.steer * 0.35 - hs.yaw) * Math.min(1, dt * 4);
  car.root.updateMatrixWorld(true);
  // posizione di guida (come iRacing: vicino al volante, occhi bassi, campo visivo stretto)
  // regolabile in gara: I/K su-giù, J/L indietro-avanti, U/O campo visivo
  const seat = IS_F1 ? settings.seatF1 || (settings.seatF1 = { x: 0, y: 0, fov: 62 }) : settings.seat3 || (settings.seat3 = { x: 0.24, y: -0.06, fov: 52 });
  const adj = (k, key, d, lo, hi) => { if (input.consume(key)) { seat[k] = Math.max(lo, Math.min(hi, +(seat[k] + d).toFixed(3))); saveSettings(); showBanner(`SEDILE  avanti ${(seat.x * 100).toFixed(0)} cm · altezza ${(seat.y * 100).toFixed(0)} cm · campo ${seat.fov}°`, 'yellow', 1.5, true); } };
  adj('y', 'KeyI', 0.01, -0.3, 0.2); adj('y', 'KeyK', -0.01, -0.3, 0.2);
  adj('x', 'KeyL', 0.01, -0.2, 0.4); adj('x', 'KeyJ', -0.01, -0.2, 0.4);
  adj('fov', 'KeyU', -2, 36, 90); adj('fov', 'KeyO', 2, 36, 90);
  eyeTmp.copy(ck.eye); eyeTmp.x += hs.x + seat.x; eyeTmp.y += seat.y; eyeTmp.z += hs.z;
  camera.position.copy(car.body.localToWorld(eyeTmp));
  car.body.getWorldQuaternion(qTmp);
  qPitch.setFromAxisAngle(axZ, window.__ckPitch ?? (IS_F1 ? -0.05 - seat.y * 0.4 : -0.03 + (-0.1 - seat.y) * 0.4));   // sguardo sulla pista davanti, un filo in basso          // sguardo un filo verso il basso, oltre il cofano
  qLook.setFromAxisAngle(axY, hs.yaw);
  camera.quaternion.copy(qTmp).multiply(qLook).multiply(qYaw).multiply(qPitch);
  // volante: circa 11 gradi di volante per grado di ruota
  ck.steer.quaternion.setFromAxisAngle(ck.axis, phys.steer * 11);
  // led dei giri: verdi, gialli, rossi, poi tutti blu (cambiata)
  const MR = phys.maxRpm, f = (phys.rpm - 0.62 * MR) / (0.35 * MR), on = Math.round(Math.max(0, Math.min(1, f)) * ck.leds.length);
  const flash = phys.rpm > 0.975 * MR && performance.now() % 160 < 80;
  const nL = ck.leds.length, g1 = Math.round(nL * 0.38), g2 = Math.round(nL * 0.75);
  ck.leds.forEach((m, i) => m.color.setHex(flash ? 0x2a6bff : i < on ? (i < g1 ? 0x22e05f : i < g2 ? (nL > 20 ? 0xff2a2a : 0xffd21a) : (nL > 20 ? 0x7b4dff : 0xff2a2a)) : 0x1a1a1a));
  // F1: file di led sul volante (bandiere): gialla con la safety car, rossa vicino al limitatore, blu alla cambiata
  if (ck.ledRows) ck.ledRows.forEach((m, i) => m.color.setHex(i === 0 ? (flash ? 0x2a6bff : 0x111111) : i === 1 ? (f > 0.92 ? 0xff2a2a : 0x111111) : (sc && sc.active ? 0xffd21a : 0x111111)));
  // braccia del pilota e specchietti
  updateArms(ck);
  renderMirrors(ck);
  // display: 10 volte al secondo
  ck.t -= dt;
  if (ck.display && ck.t <= 0) { ck.t = 0.1; drawCockpitDisplay(ck.display); }
  return true;
}
// specchietti: una ripresa larga all'indietro, dal tetto, senza la propria vettura
let mirrorRT = null, rearCam = null;
const qBack = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), mirTmp = new THREE.Vector3(), skyTmp = new THREE.Vector3();
function renderMirrors(ck) {
  if (!ck.mirrors || !ck.mirrors.length) return;
  if (!mirrorRT) {
    const hi = settings.quality === 'high';
    mirrorRT = new THREE.WebGLRenderTarget(hi ? 768 : 512, hi ? 192 : 128, { samples: 0 });
    mirrorRT.texture.colorSpace = THREE.SRGBColorSpace;
    rearCam = new THREE.PerspectiveCamera(19, 4, 0.3, camera.far);
  }
  if (ck.mirrorMat.map !== mirrorRT.texture) { ck.mirrorMat.map = mirrorRT.texture; ck.mirrorMat.needsUpdate = true; }
  ck.mf = (ck.mf || 0) + 1;
  virtualMirror(ck);
  if (ck.mf % 2) return;                       // metà dei fotogrammi: basta e costa poco
  rearCam.position.copy(car.body.localToWorld(mirTmp.set(ck.eye.x - 0.25, ck.eye.y + 0.1, 0)));
  car.body.getWorldQuaternion(qTmp);
  rearCam.quaternion.copy(qTmp).multiply(qBack);
  rearCam.updateMatrixWorld();
  const vis = car.root.visible, auto = renderer.shadowMap.autoUpdate;
  car.root.visible = false; renderer.shadowMap.autoUpdate = false;
  const vmv = vMirror ? vMirror.visible : false; if (vMirror) vMirror.visible = false;   // mai lo specchietto dentro sé stesso
  skyTmp.copy(scenery.skyMesh.position); scenery.skyMesh.position.copy(rearCam.position);
  renderer.setRenderTarget(mirrorRT);
  renderer.render(scene, rearCam);
  renderer.setRenderTarget(null);
  scenery.skyMesh.position.copy(skyTmp);
  car.root.visible = vis; renderer.shadowMap.autoUpdate = auto;
  if (vMirror) vMirror.visible = vmv;
}
// specchietto virtuale in alto al centro (come in iRacing): con il campo visivo stretto quelli
// veri restano fuori dallo schermo
let vMirror = null;
function virtualMirror(ck) {
  if (!vMirror) {
    const g = new THREE.PlaneGeometry(1, 0.22), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 0.8 - 0.6 * uv.getX(i));   // parte centrale, specchiata
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: mirrorRT.texture, depthTest: false, depthWrite: false, toneMapped: false }));
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(1.03, 0.25), new THREE.MeshBasicMaterial({ color: 0x08090c, depthTest: false, depthWrite: false }));
    fr.position.z = -0.001; fr.renderOrder = 998; m.renderOrder = 999;
    vMirror = new THREE.Group(); vMirror.add(fr, m);
    if (!camera.parent) scene.add(camera);
    camera.add(vMirror);
  }
  vMirror.visible = settings.vMirror !== false;
  // in alto al centro, largo un terzo dello schermo
  const d = 0.5, hh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d, hw = hh * camera.aspect;
  const w = Math.min(hw * 0.62, hh * 2.2);
  vMirror.scale.setScalar(w);
  vMirror.position.set(0, hh - w * 0.16 - hh * 0.07, -d);
}
function drawCockpitDisplay(D) {
  if (D.f1) return drawF1Display(D);
  const g = D.ctx, W = D.cv.width, H = D.cv.height;
  g.fillStyle = '#05070b'; g.fillRect(0, 0, W, H);
  const gear = phys.gear === -1 ? 'R' : phys.speed < 0.5 && phys.throttleOut < 0.05 ? 'N' : String(phys.gear);
  const kmh = Math.round(phys.speed * 3.6);
  // barra dei giri
  const rf = Math.max(0, Math.min(1, phys.rpm / phys.maxRpm));
  g.fillStyle = '#1b2230'; g.fillRect(16, 12, W - 32, 18);
  g.fillStyle = rf > 0.95 ? '#2a6bff' : rf > 0.85 ? '#ff3b30' : rf > 0.7 ? '#ffd21a' : '#2ee06f'; g.fillRect(16, 12, (W - 32) * rf, 18);
  // marcia al centro
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffffff'; g.font = '900 130px Titillium Web, Arial'; g.fillText(gear, W / 2, H / 2 + 14);
  // velocità e giri a sinistra
  g.textAlign = 'left'; g.font = '700 54px Titillium Web, Arial'; g.fillStyle = '#e9edf3'; g.fillText(String(kmh), 20, 88);
  g.font = '700 20px Titillium Web, Arial'; g.fillStyle = '#8a93a3'; g.fillText('KM/H', 22, 124);
  g.font = '700 26px Titillium Web, Arial'; g.fillStyle = '#e9edf3'; g.fillText(String(Math.round(phys.rpm / 10) * 10), 20, 168);
  g.font = '700 20px Titillium Web, Arial'; g.fillStyle = '#8a93a3'; g.fillText('RPM', 22, 196);
  // a destra: posizione, giro, tempo e delta
  g.textAlign = 'right';
  const lt = $('lbTime').textContent, pos = $('lbPos').textContent;
  g.font = '700 22px Titillium Web, Arial'; g.fillStyle = '#8a93a3'; g.fillText(race ? 'POS ' + pos : pos, W - 20, 64);
  g.font = '700 40px Titillium Web, Arial'; g.fillStyle = '#ffffff'; g.fillText(lt, W - 20, 108);
  const dl = $('lbDelta').textContent;
  if (dl) { g.font = '700 30px Titillium Web, Arial'; g.fillStyle = dl.startsWith('+') ? '#ff3b30' : '#2ee06f'; g.fillText(dl, W - 20, 150); }
  // gomme (temperatura) in basso
  g.textAlign = 'center'; g.font = '700 18px Titillium Web, Arial';
  phys.wheels.forEach((w, i) => {
    const t = Math.round(w.temp), x = W - 130 + (i % 2) * 64, y = 190 + Math.floor(i / 2) * 30;
    g.fillStyle = t < 80 ? '#3d7bff' : t < 90 ? '#2ec4ea' : t <= 110 ? '#2ee06f' : t <= 120 ? '#ffd21a' : '#ff3b30';
    g.fillRect(x - 28, y - 12, 56, 24); g.fillStyle = '#05070b'; g.fillText(t + '°', x, y + 1);
  });
  D.tex.needsUpdate = true;
}
// display del volante F1: marcia enorme al centro, velocità, delta, tempo, batteria
function drawF1Display(D) {
  const g = D.ctx, W = D.cv.width, H = D.cv.height;
  g.fillStyle = '#020305'; g.fillRect(0, 0, W, H);
  const gear = phys.gear === -1 ? 'R' : phys.speed < 0.5 && phys.throttleOut < 0.05 ? 'N' : String(phys.gear);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffffff'; g.font = '900 170px Titillium Web, Arial'; g.fillText(gear, W / 2, H / 2 + 6);
  // pannelli laterali
  const box = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  box(10, 14, 150, 120, '#0d1626'); box(W - 160, 14, 150, 120, '#0d1626');
  box(10, 148, 150, 134, '#0d1626'); box(W - 160, 148, 150, 134, '#0d1626');
  g.fillStyle = '#7f8da3'; g.font = '700 22px Titillium Web, Arial';
  g.fillText('KM/H', 85, 34); g.fillText('POS', W - 85, 34); g.fillText('GIRO', 85, 168); g.fillText('DELTA', W - 85, 168);
  g.fillStyle = '#ffffff'; g.font = '800 60px Titillium Web, Arial';
  g.fillText(String(Math.round(phys.speed * 3.6)), 85, 86);
  g.fillText(race ? $('lbPos').textContent.split('/')[0].replace(/\D/g, '') || '-' : '-', W - 85, 86);
  g.font = '800 40px Titillium Web, Arial'; g.fillText($('lbTime').textContent, 85, 222);
  const dl = $('lbDelta').textContent;
  g.fillStyle = !dl ? '#ffffff' : dl.startsWith('+') ? '#ff3b30' : '#2ee06f'; g.fillText(dl || '--', W - 85, 222);
  // batteria (ERS) sotto la marcia: si scarica in accelerazione, si ricarica in frenata
  D.ers = Math.max(0, Math.min(1, (D.ers ?? 0.8) + ((input.state.brake || 0) > 0.2 ? 0.006 : phys.throttleOut > 0.9 && phys.speed > 30 ? -0.002 : 0.0005)));
  box(W / 2 - 80, H - 34, 160, 18, '#1b2230'); box(W / 2 - 80, H - 34, 160 * D.ers, 18, '#1fd1ff');
  D.tex.needsUpdate = true;
}
function hideCockpit() {
  document.body.classList.remove('cockpitCam');
  if (vMirror) vMirror.visible = false;
  if (!car || !car.cockpit) return;
  car.cockpit.group.visible = false;
  car.cockpit.outerGlass.forEach(o => o.visible = true);
}

// ---------------------------------------------------------------- replay
// Rivedi la gara: pausa, avanti/indietro, rallentatore, telecamere TV, inseguimento, elicottero,
// a bordo o libera (si gira col mouse/dito), e scegli quale vettura seguire.
var recorder = null, rp = null;
var HZ_MIN_FRAMES = 15 * 20;
const RP_SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4];
const RP_CAMS = ['TV', 'INSEGUIMENTO', 'ELICOTTERO', 'A BORDO', 'LIBERA'];
const fakePhys = () => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, steer: 0, speed: 0, kerbVibe: 0,
  wheels: [0, 1, 2, 3].map(() => ({ comp: 0.013, spin: 0 })), damage: { puncture: [0, 0, 0, 0], susp: [0, 0, 0, 0], rw: 0, fwL: 0, fwR: 0 } });
const fmtClock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function startReplay(rep, models, scModel, fromGarage) {
  rp = { rep, models, scModel, fromGarage, t: 0, speed: 3, playing: true, cam: 0, target: 0, shot: null,
    poses: models.map(() => ({})), fp: models.map(() => fakePhys()), scPose: {}, focus: { x: 0, y: 0, z: 0 },
    orbit: { yaw: 0.8, pitch: 0.35, dist: 9 }, cam3: new THREE.Vector3(), look: new THREE.Vector3(), init: false,
    prevMode: mode, muted: sounds.muted };
  rp.target = Math.max(0, rep.info.cars.findIndex(c => c.isPlayer));
  sounds.setMuted(true);
  mode = 'replay';
  hideCockpit();
  $('results').classList.add('hidden'); $('pause').classList.add('hidden'); $('menu').classList.add('hidden');
  $('hud').classList.add('hidden'); $('lightsHud').classList.add('hidden');
  $('replayUI').classList.remove('hidden'); $('replayUI').classList.remove('min');
  document.body.classList.add('replayMode');
  for (const m of models) if (m) m.root.visible = true;
  if (car.helmet) car.helmet.forEach(h => h.visible = true);
  racingLine.update(0, 0, 'off');          // niente linea ideale nel replay
  rpUi(true);
}
function exitReplay() {
  if (!rp) return;
  sounds.setMuted(rp.muted);
  $('replayUI').classList.add('hidden');
  document.body.classList.remove('replayMode');
  const fromGarage = rp.fromGarage, made = rp.made, fromPause = rp.fromPause;
  if (made) for (const m of made) scene.remove(m.root);
  rp = null;
  camState.init = false;
  if (fromPause) {
    // tutto com'era al momento della pausa
    for (const k of fromPause.keep) { k.m.root.position.copy(k.p); k.m.root.quaternion.copy(k.q); k.m.root.visible = k.v; }
    camera.position.copy(fromPause.camKeep.p); camera.quaternion.copy(fromPause.camKeep.q); camera.fov = fromPause.camKeep.fov; camera.updateProjectionMatrix();
    mode = 'pause';
    $('hud').classList.remove('hidden');
    $('pause').classList.remove('hidden');
    return;
  }
  if (fromGarage) { car.root.visible = true; goMenu(); return; }
  // di nuovo ai risultati della gara
  mode = 'race';
  $('hud').classList.remove('hidden');
  if (race) showResults();
}
// replay salvato (dal Garage): stessa pista e stessa categoria, altrimenti si ricarica il gioco
function startSavedReplay(packed) {
  const info = packed.info;
  if (info.track !== settings.track || info.carClass !== settings.carClass || info.driveMode !== settings.driveMode) {
    settings.track = info.track; settings.carClass = info.carClass; settings.driveMode = info.driveMode; saveSettings();
    try { sessionStorage.setItem('novaf1.next', 'replay'); } catch (e) { /* niente */ }
    location.reload();
    return;
  }
  if (garage) garage.active = false;
  clearRace();
  const made = info.cars.map(m => {
    const model = m.teamId ? makeCar({ team: teamById(m.teamId), lod: m.isPlayer ? 'hi' : 'mid' }) : makeCar(m.isPlayer ? {} : { primary: m.color, accent: m.accent, lod: 'mid' });
    scene.add(model.root); return model;
  });
  const scM = makeCar({ primary: 0x16171b, accent: 0xf4f4f4, lod: 'mid', safety: true }); scM.root.visible = false; scene.add(scM.root);
  made.push(scM);
  car.root.visible = false;
  startReplay(new Replay(packed), made.slice(0, -1), scM, true);
  rp.made = made;
}
function replayFrame(dt) {
  const R = rp.rep, dur = R.duration;
  if (rp.playing) { rp.t += dt * RP_SPEEDS[rp.speed]; if (rp.t >= dur) { rp.t = dur; rp.playing = false; rpUi(); } }
  const adt = rp.playing ? dt * RP_SPEEDS[rp.speed] : 0;
  rp.models.forEach((m, k) => {
    if (!m) return;
    const P = R.pose(k, rp.t, rp.poses[k]);
    m.root.visible = P.visible;
    if (!P.visible) return;
    const f = rp.fp[k];
    f.x = P.x; f.y = P.y; f.z = P.z; f.yaw = P.yaw; f.pitch = P.pitch; f.roll = P.roll; f.steer = P.steer; f.speed = P.speed;
    for (const w of f.wheels) w.spin = P.speed;
    updateModel(m, f, adt);
  });
  if (rp.scModel) {
    const S = R.sc(rp.t, rp.scPose);
    rp.scModel.root.visible = S.visible;
    if (S.visible) { rp.scModel.root.position.set(S.x, S.y, S.z); rp.scModel.root.rotation.set(0, S.yaw, 0); }
  }
  // vettura seguita (se è ritirata/sparita si passa alla prossima)
  let T = rp.poses[rp.target];
  if (!T || !T.visible) { const k = rp.poses.findIndex(p => p.visible); if (k >= 0) { rp.target = k; T = rp.poses[k]; } }
  if (T && T.visible) { rp.focus.x = T.x; rp.focus.y = T.y; rp.focus.z = T.z; replayCamera(dt, T); }
  rp.uiT = (rp.uiT || 0) - dt;
  if (rp.uiT <= 0) { rp.uiT = 0.2; rpUi(); }
  // scorciatoie: spazio pausa, A/D ±5 s, W/S vettura, C telecamera, H nascondi comandi
  if (input.consume('Space')) rpToggle();
  if (input.consume('KeyD')) rpSeek(5);
  if (input.consume('KeyA')) rpSeek(-5);
  if (input.consume('KeyW')) rpCar(1);
  if (input.consume('KeyS')) rpCar(-1);
  if (input.consume('KeyC')) rpCamNext();
  if (input.consume('KeyH')) $('replayUI').classList.toggle('min');
}
const rpTmp = new THREE.Vector3(), rpLook = new THREE.Vector3();
function replayCamera(dt, T) {
  const fx = Math.cos(T.yaw), fz = Math.sin(T.yaw), nx = -fz, nz = fx;
  const L = track.length, i = Math.floor((((T.prog % L) + L) % L) / track.step) % track.count;
  const cam = RP_CAMS[rp.cam];
  let fov = 50, snap = false;
  if (cam === 'TV') {
    // regia: tagli ogni 5-7 secondi (contati sul tempo del replay)
    const sh = rp.shot;
    if (!sh || rp.t > sh.until || rp.t < sh.from || sh.k !== rp.target) {
      const types = ['chase', 'tele', 'side', 'heli', 'front', 'tele', 'low'];
      const type = types[Math.floor(Math.random() * types.length)];
      const ns = { type, from: rp.t, until: rp.t + 5 + Math.random() * 2, side: Math.random() < 0.5 ? -1 : 1, k: rp.target };
      if (type === 'tele') {
        const j = (i + Math.round(110 / track.step)) % track.count, sm = track.samples[j];
        const off = ((ns.side > 0 ? sm.hwL : sm.hwR) ?? sm.hw) + 7;
        ns.pos = new THREE.Vector3(sm.x + sm.nx * off * ns.side, sm.y + 2.2, sm.z + sm.nz * off * ns.side);
      }
      rp.shot = ns; snap = true;
    }
    const S = rp.shot, k = rp.t - S.from;
    switch (S.type) {
      case 'chase': rpTmp.set(T.x - fx * 7.5, T.y + 1.9, T.z - fz * 7.5); rpLook.set(T.x + fx * 6, T.y + 0.6, T.z + fz * 6); fov = 55; break;
      case 'low': rpTmp.set(T.x - fx * 4.2 + nx * 1.8 * S.side, T.y + 0.45, T.z - fz * 4.2 + nz * 1.8 * S.side); rpLook.set(T.x + fx * 8, T.y + 0.4, T.z + fz * 8); fov = 62; break;
      case 'side': rpTmp.set(T.x + fx * (2 - k * 0.5) + nx * 4.2 * S.side, T.y + 0.9, T.z + fz * (2 - k * 0.5) + nz * 4.2 * S.side); rpLook.set(T.x, T.y + 0.4, T.z); fov = 48; break;
      case 'front': rpTmp.set(T.x + fx * 9 + nx * 1.5 * S.side, T.y + 1.1, T.z + fz * 9 + nz * 1.5 * S.side); rpLook.set(T.x, T.y + 0.5, T.z); fov = 45; break;
      case 'heli': { const a = k * 0.12 * S.side; rpTmp.set(T.x - fx * 20 * Math.cos(a) + nx * 20 * Math.sin(a), T.y + 14, T.z - fz * 20 * Math.cos(a) + nz * 20 * Math.sin(a)); rpLook.set(T.x + fx * 10, T.y, T.z + fz * 10); fov = 45; break; }
      default: { rpTmp.copy(S.pos); rpLook.set(T.x, T.y + 0.5, T.z); const d = rpTmp.distanceTo(rpLook); fov = Math.max(9, Math.min(45, 520 / Math.max(8, d))); snap = true; }
    }
  } else if (cam === 'INSEGUIMENTO') { rpTmp.set(T.x - fx * 8, T.y + 2.6, T.z - fz * 8); rpLook.set(T.x + fx * 5, T.y + 0.7, T.z + fz * 5); fov = 56; }
  else if (cam === 'ELICOTTERO') { rpTmp.set(T.x - fx * 26, T.y + 22, T.z - fz * 26); rpLook.set(T.x + fx * 12, T.y, T.z + fz * 12); fov = 42; }
  else if (cam === 'A BORDO') { rpTmp.set(T.x - fx * 0.7, T.y + 1.05, T.z - fz * 0.7); rpLook.set(T.x + fx * 12, T.y + 0.6, T.z + fz * 12); fov = 64; snap = true; }
  else {
    // libera: si gira attorno alla vettura trascinando, rotella o due dita per avvicinarsi
    const o = rp.orbit;
    rpTmp.set(T.x + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist, T.y + 0.6 + Math.sin(o.pitch) * o.dist, T.z + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist);
    rpLook.set(T.x, T.y + 0.5, T.z); fov = 50; snap = true;
  }
  if (snap || !rp.init) { rp.cam3.copy(rpTmp); rp.look.copy(rpLook); rp.init = true; }
  else { const a = 1 - Math.exp(-dt * 10); rp.cam3.lerp(rpTmp, a); rp.look.lerp(rpLook, 1 - Math.exp(-dt * 12)); }
  // mai sotto il terreno
  const g = track.samples[i].y;
  if (rp.cam3.y < g + 0.3) rp.cam3.y = g + 0.3;
  camera.position.copy(rp.cam3); camera.up.set(0, 1, 0); camera.lookAt(rp.look);
  camera.fov = fov; camera.updateProjectionMatrix();
}
function rpToggle() { if (rp.t >= rp.rep.duration - 0.05) rp.t = 0; rp.playing = !rp.playing; rpUi(); }
function rpSeek(d) { rp.t = Math.max(0, Math.min(rp.rep.duration, rp.t + d)); rp.shot = null; rp.init = false; rpUi(); }
function rpCar(d) { const n = rp.models.length; for (let s = 1; s <= n; s++) { const k = (rp.target + d * s + n * 4) % n; if (rp.poses[k] && rp.poses[k].visible) { rp.target = k; break; } } rp.shot = null; rp.init = false; rpUi(); }
function rpCamNext() { rp.cam = (rp.cam + 1) % RP_CAMS.length; rp.shot = null; rp.init = false; rpUi(); }
function rpUi(force) {
  if (!rp) return;
  const R = rp.rep, info = R.info, c = info.cars[rp.target];
  $('rpPlay').textContent = rp.playing ? '❚❚' : '▶';
  $('rpSpeed').textContent = (RP_SPEEDS[rp.speed] < 1 ? RP_SPEEDS[rp.speed].toFixed(2).replace(/0$/, '') : RP_SPEEDS[rp.speed]) + '×';
  $('rpTime').textContent = `${fmtClock(rp.t)} / ${fmtClock(R.duration)}`;
  $('rpCam').textContent = RP_CAMS[rp.cam];
  if (!rp.dragging) $('rpSlider').value = String(Math.round(rp.t / Math.max(0.001, R.duration) * 1000));
  // posizione in gara di chi segui (dal progresso registrato)
  const P = rp.poses[rp.target];
  let pos = 1;
  if (P && P.visible) rp.poses.forEach((q, k) => { if (k !== rp.target && q.visible && q.prog > P.prog) pos++; });
  const lap = P && P.visible ? Math.min(info.laps, Math.max(1, Math.floor(P.prog / track.length) + 1)) : '-';
  $('rpCar').innerHTML = `<i style="background:#${(c.color || 0xffffff).toString(16).padStart(6, '0')}"></i>${c.isPlayer ? 'TU' : c.name}`;
  $('rpInfo').textContent = `P${pos} · GIRO ${lap}/${info.laps} · ${info.trackName || ''}`;
  void force;
}
// comandi del replay
$('rpPlay').addEventListener('click', () => rpToggle());
$('rpBack10').addEventListener('click', () => rpSeek(-10));
$('rpFwd10').addEventListener('click', () => rpSeek(10));
$('rpSlow').addEventListener('click', () => { rp.speed = Math.max(0, rp.speed - 1); rpUi(); });
$('rpFast').addEventListener('click', () => { rp.speed = Math.min(RP_SPEEDS.length - 1, rp.speed + 1); rpUi(); });
$('rpPrevCar').addEventListener('click', () => rpCar(-1));
$('rpNextCar').addEventListener('click', () => rpCar(1));
$('rpCam').addEventListener('click', () => rpCamNext());
$('rpHide').addEventListener('click', () => $('replayUI').classList.add('min'));
$('rpShow').addEventListener('click', () => $('replayUI').classList.remove('min'));
$('rpExit').addEventListener('click', () => exitReplay());
$('rpSlider').addEventListener('input', e => { if (!rp) return; rp.dragging = true; rp.t = (+e.target.value / 1000) * rp.rep.duration; rp.shot = null; rp.init = false; });
$('rpSlider').addEventListener('change', () => { if (rp) rp.dragging = false; });
// telecamera libera: trascina per girare, rotella per avvicinarti
{
  let drag = null;
  canvas.addEventListener('pointerdown', e => { if (mode === 'replay' && rp && RP_CAMS[rp.cam] === 'LIBERA') drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', () => { drag = null; });
  addEventListener('pointermove', e => {
    if (!drag || !rp) return;
    rp.orbit.yaw -= (e.clientX - drag.x) * 0.008;
    rp.orbit.pitch = Math.max(0.05, Math.min(1.3, rp.orbit.pitch + (e.clientY - drag.y) * 0.005));
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('wheel', e => { if (mode === 'replay' && rp) rp.orbit.dist = Math.max(3, Math.min(60, rp.orbit.dist * (1 + e.deltaY * 0.001))); }, { passive: true });
}
// garage: rivedi l'ultimo replay salvato
$('garageReplay').addEventListener('click', async () => {
  const p = await loadReplay();
  if (!p) { $('garageReplay').textContent = 'NESSUN REPLAY SALVATO'; setTimeout(() => { $('garageReplay').textContent = '▶ ULTIMO REPLAY'; }, 2000); return; }
  startSavedReplay(p);
});

// ---------------------------------------------------------------- HUD
const ledEls = [];
for (let i = 0; i < 15; i++) { const e = document.createElement('i'); $('leds').appendChild(e); ledEls.push(e); }
let hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }

// colori dei settori come in F1: viola = record, verde = tuo miglior settore di questa sessione,
// giallo = più lento. Al traguardo i tre settori del giro restano accesi per qualche secondo
var sessBest = [null, null, null], secHold = null;
function secClass(k, t, valid = true) {
  const rec = bestSectors[k], sb = sessBest[k];
  const c = !valid ? 'yellow' : rec == null || t <= rec + 1e-6 ? 'purple' : sb == null || t <= sb + 1e-6 ? 'green' : 'yellow';
  if (sb == null || t < sb) sessBest[k] = t;
  return c;
}
function paintSectors(secs, cls, cur) {
  for (let k = 0; k < 3; k++) {
    const el = $('sec' + k);
    el.className = secs[k] != null ? (cls[k] || 'yellow') : (k === cur ? 'cur' : '');
  }
}
function setSectorsHud(secs, cur = 0) {
  if (secHold && simTime < secHold.until) return;
  secHold = null;
  const L0 = race ? rsec : lap;
  paintSectors(secs, (L0 && L0.secCls) || [], L0 && L0.active !== false ? cur : -1);
}
// settori anche in gara (la prova a tempo ha il suo cronometro completo)
var rsec = null;
function raceSectors(sPrev, sNow) {
  const L = track.length;
  if (sPrev > L - 80 && sNow < 80) {
    const f = (L - sPrev) / ((L - sPrev) + sNow), t = simTime - DT + DT * f;
    if (rsec && rsec.sector === 2) {
      rsec.sectors[2] = t - rsec.sectorStart;
      rsec.secCls[2] = secClass(2, rsec.sectors[2]);
      secHold = null; paintSectors(rsec.sectors, rsec.secCls, -1);
      secHold = { until: simTime + 3.5 };
    }
    rsec = { active: true, sector: 0, sectorStart: t, sectors: [null, null, null], secCls: [] };
    setSectorsHud(rsec.sectors, 0);
    return;
  }
  // primo giro: la griglia è dopo il traguardo, quindi si parte a cronometrare al via
  if (!rsec) {
    if (mode !== 'race') return;
    let sec = 0; for (let k = 1; k <= 2; k++) if (sNow >= track.sectorIdx[k] * track.step) sec = k;
    rsec = { active: true, sector: sec, sectorStart: simTime, sectors: [null, null, null], secCls: [], partial: true };
    setSectorsHud(rsec.sectors, sec);
    return;
  }
  for (let k = 1; k <= 2; k++) {
    const b = track.sectorIdx[k] * track.step;
    if (rsec.sector === k - 1 && sPrev < b && sNow >= b && sNow - sPrev < 20) {
      const t = simTime - DT + DT * (b - sPrev) / (sNow - sPrev);
      rsec.sectors[k - 1] = t - rsec.sectorStart;
      rsec.sectorStart = t; rsec.sector = k;
      // il primo settore del via è più corto (si parte dopo il traguardo): verde, ma non conta come tempo
      rsec.secCls[k - 1] = rsec.partial ? 'green' : secClass(k - 1, rsec.sectors[k - 1]);
      rsec.partial = false;
      setSectorsHud(rsec.sectors, k);
    }
  }
}

function showBanner(text, color = 'yellow', time = 2, essential = false) {
  // avvisi secondari (sorpassi, contatti, cronaca...) solo se richiesti nelle impostazioni
  if (!essential && !settings.msgs) return;
  $('bannerText').textContent = text;
  const b = $('banner');
  b.className = 'banner ' + color;
  void b.offsetWidth;
  bannerTimer = time;
}

const dmgColor = v => v >= 0.999 ? '#555' : v < 0.15 ? '#2ee06f' : v < 0.45 ? '#f5c518' : v < 0.75 ? '#ff8a1c' : '#ff3b30';

function updateHud(dt) {
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) $('banner').classList.add('hidden'); }
  const kmh = Math.round(phys.speed * 3.6);
  setText('speed', String(kmh));
  setText('gear', phys.gear === -1 ? 'R' : (phys.speed < 0.5 && phys.throttleOut < 0.05 ? 'N' : String(phys.gear)));
  // led dei giri motore
  const frac = (phys.rpm - 8500) / (12100 - 8500);
  const on = Math.max(0, Math.min(15, Math.round(frac * 15)));
  const flash = phys.rpm > 12000 && (performance.now() % 160 < 80);
  for (let i = 0; i < 15; i++) {
    const c = i < on ? (i < 5 ? 'g' : i < 10 ? 'r' : 'b') : '';
    if (ledEls[i].className !== c) ledEls[i].className = c;
  }
  $('leds').classList.toggle('flash', flash);
  // anello dei giri motore e numero
  const rf = Math.max(0, Math.min(1, phys.rpm / 12500));
  const rk = Math.round(rf * 60);
  if (hudCache.rpmArc !== rk) { hudCache.rpmArc = rk; $('rpmArc').style.strokeDasharray = `${(rf * 198).toFixed(1)} 264`; $('rpmArc').classList.toggle('hot', rf > 0.93); }
  setText('rpmTxt', String(Math.round(phys.rpm / 10) * 10));
  setText('fdMode', race && race.player.tow > 0.25 ? 'SCIA' : settings.auto ? 'AUTO' : 'MANUALE');
  lapBoxHud();

  if (race) raceHud(dt);
  else if (lap && lap.active) {
    const t = simTime - lap.start;
    setText('lapTime', fmt(t));
    setText('lapLabel', `GIRO ${lap.no}`);
    if (best && best.split && lap.valid) {
      const s = phys.prCG.s, bi = Math.floor(s / 10);
      if (bi < best.split.length - 1 && bi >= 0 && s < track.length - 20) {
        const bt = best.split[bi] + (best.split[bi + 1] - best.split[bi]) * (s / 10 - bi);
        const d = t - bt;
        setText('delta', `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(3)}`);
        const cls = 'delta ' + (d >= 0 ? 'plus' : 'minus');
        if ($('delta').className !== cls) $('delta').className = cls;
      }
    } else setText('delta', '');
  } else {
    setText('lapTime', fmt(0));
    setText('lapLabel', mode === 'countdown' ? 'PARTENZA' : 'GIRO DI LANCIO');
    setText('delta', '');
  }
  if (!race) setText('bestTime', fmt(best && best.time));
  // danni
  const d = phys.damage;
  const map = { fwL: d.fwL, fwR: d.fwR, rw: d.rw, wFL: d.susp[0], wFR: d.susp[1], wRL: d.susp[2], wRR: d.susp[3], body: Math.max(d.engine, d.floor * 0.6, d.radiator * 0.8, d.gearbox * 0.7) };
  for (const k in map) {
    const wi = ['wFL', 'wFR', 'wRL', 'wRR'].indexOf(k);
    const c = wi >= 0 && d.punctured[wi] ? '#b04dff' : dmgColor(map[k]);
    if (hudCache['d_' + k] !== c) { hudCache['d_' + k] = c; $('d_' + k).style.fill = c; }
  }
  $('aidTc').classList.toggle('on', settings.tc);
  $('aidAbs').classList.toggle('on', settings.abs);
  setText('aidGear', settings.auto ? 'AUTO' : 'MAN');
  // gomme: temperatura (colore) e numero
  phys.wheels.forEach((w, i) => {
    if (ARC()) {
      // arcade: solo il grip rimasto (usura)
      const g = Math.round(100 * (1 - 0.1 * w.wear - 0.6 * Math.max(0, w.wear - 0.72)));
      const col = g >= 95 ? '#2ee06f' : g >= 88 ? '#f5c518' : '#ff3b30';
      const key = 'g' + g;
      if (hudCache['ty' + i] !== key) { hudCache['ty' + i] = key; const el = $('ty' + i); el.textContent = g + '%'; el.style.background = col; }
      return;
    }
    const t = Math.round(w.temp);
    const col = t < 80 ? '#3d7bff' : t < 90 ? '#2ec4ea' : t <= 110 ? '#2ee06f' : t <= 120 ? '#f5c518' : '#ff3b30';
    if (hudCache['ty' + i] !== t) { hudCache['ty' + i] = t; const el = $('ty' + i); el.textContent = t + '°'; el.style.background = col; }
  });
  // arcade: i danni diventano una barra di salute
  // integrità: percentuale e voci principali
  const hp = Math.round(100 * (1 - phys.totalDamage()));
  if (hudCache.hp !== hp) {
    hudCache.hp = hp;
    const el = $('dmgPct'); el.textContent = hp + '%';
    el.style.color = hp > 85 ? 'var(--green)' : hp > 55 ? 'var(--yellow)' : hp > 30 ? '#ff8a1c' : 'var(--red)';
    const arc = $('hpArc'); arc.style.strokeDasharray = `${(hp / 100 * 198).toFixed(1)} 264`; arc.style.stroke = el.style.color;
  }
  const parts = [
    ['ALI', Math.max(d.fwL, d.fwR, d.rw)], ['SOSPENSIONI', Math.max(...d.susp)], ['GOMME', Math.max(...d.puncture, d.punctured.some(Boolean) ? 1 : 0)],
    ['FONDO', d.floor], ['MOTORE', Math.max(d.engine, d.radiator * 0.8)], ['CAMBIO', d.gearbox],
  ];
  const key = parts.map(x => Math.round(x[1] * 20)).join();
  if (hudCache.dmgList !== key) {
    hudCache.dmgList = key;
    $('dmgList').innerHTML = parts.map(([n, v]) => `<div><span>${n}</span><u><b style="width:${Math.round(100 * (1 - Math.min(1, v)))}%;background:${dmgColor(v)}"></b></u></div>`).join('');
  }
  const comp = phys.compound;
  if (hudCache.comp !== comp) { hudCache.comp = comp; const el = $('aidTyre'); el.textContent = comp; el.style.borderColor = '#' + COMPOUNDS[comp].color.toString(16).padStart(6, '0'); }
  if (race && race.player.pit) {
    const pit = race.player.pit;
    setText('pitInfo', pit.phase === 'service' ? `PIT STOP ${pit.service.toFixed(1)} / ${pit.serviceTotal.toFixed(1)} s` : 'LIMITATORE 80');
  }
  $('pitInfo').classList.toggle('hidden', !(race && race.player.pit));
  if (race && race.player.pit && race.player.pit.phase === 'in') {
    const pit = race.player.pit;
    setText('pitCount', `ARRIVO ALLA PIAZZOLA TRA ${Math.max(0, (pit.boxP - pit.p) / Math.max(8, pit.v)).toFixed(0)} s`);
  } else if (race && race.player.pit) setText('pitCount', race.player.pit.phase === 'service' ? 'INTERVENTI IN CORSO' : 'RIPARTENZA');
  $('warnEng').classList.toggle('hidden', ARC() || phys.engTemp < 120);
  $('warnBrk').classList.toggle('hidden', ARC() || phys.brakeTemp < 950);
  const tow = race && race.player.tow > 0.25;
  $('aidTow').classList.toggle('hidden', !tow);
  minimap.draw(phys, ghostCar.root.visible ? ghostCar.root.position : null, race ? race.cars.filter(c => !c.isPlayer && !c.gone) : null);
  localMap.draw(phys, race ? race.cars.filter(c => !c.isPlayer && !c.gone) : null);
}

function carStatusHtml() {
  const d = phys.damage, pc = v => Math.round(v * 100) + '%';
  const W = ['AS', 'AD', 'PS', 'PD'];
  const rows = [
    ['Ala anteriore sx / dx', `${pc(d.fwL)} / ${pc(d.fwR)}`],
    ['Ala posteriore', pc(d.rw)], ['Fondo', pc(d.floor)],
    ['Sospensioni ' + W.join(' '), d.susp.map(pc).join(' ')],
    ['Radiatore', pc(d.radiator)], ['Cambio', pc(d.gearbox)], ['Motore', pc(d.engine) + ` · ${Math.round(phys.engTemp)} °C`],
    ['Gomme °C', phys.wheels.map(w => Math.round(w.temp)).join(' ')],
    ['Usura gomme', phys.wheels.map(w => pc(w.wear)).join(' ')],
    ['Forature', d.punctured.some(Boolean) ? W.filter((_, i) => d.punctured[i]).join(' ') : 'nessuna'],
    ['Freni', Math.round(phys.brakeTemp) + ' °C'], ['Benzina', phys.fuel.toFixed(1) + ' kg'],
  ];
  return rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
}

// colore della fascia sulla gomma in base alla mescola (rossa, gialla, bianca)
function setTyreColor(model, compound) {
  if (model && model.materials && model.materials.stripe) model.materials.stripe.color.setHex(COMPOUNDS[compound].color);
}

// ---------------------------------------------------------------- box
let pitChoice = { compound: 'M', repair: false };
function pitUi() {
  const can = !!(race && race.pitLane) && mode !== 'menu';
  if (!can) { $('pitPanel').classList.add('hidden'); return; }
  const pit = race.player.pit;
  document.querySelectorAll('#pitPanel [data-comp]').forEach(b => b.classList.toggle('sel', b.dataset.comp === pitChoice.compound));
  const rt = phys.repairTime();
  $('pitRepair').textContent = `RIPARA: ${pitChoice.repair ? 'SÌ' : 'NO'}${rt > 0 ? ` (+${rt.toFixed(1)} s)` : ' (nessun danno)'}`;
  $('pitRepair').classList.toggle('sel', pitChoice.repair);
  const locked = pit && pit.phase !== 'in';
  $('pitPanel').classList.toggle('locked', !!locked);
}
document.querySelectorAll('#pitPanel [data-comp]').forEach(b => b.addEventListener('click', () => { if (race && race.player.pit && race.player.pit.phase !== 'in') return; pitChoice.compound = b.dataset.comp; pitUi(); }));

const fmtGap = g => g == null ? '' : (g < 60 ? g.toFixed(1) : fmt(g));

// classifica in alto a sinistra (stile F1 25): poche righe attorno a te, distacchi rispetto a te,
// gomma montata, ritirati e safety car
function towerHud(st) {
  const pl = race.player, L = race.laps;
  setText('twLap', String(Math.min(L, pl.crossings + 1)));
  setText('twLaps', String(L));
  const lead = st[0];
  let flag = '', fc = '';
  if (sc && sc.active) {
    if (sc.phase === 'out') { flag = 'SAFETY CAR'; fc = 'yellow'; }
    else if (sc.phase === 'in') { flag = 'SAFETY CAR RIENTRA'; fc = 'amber'; }
    else { flag = 'RIPARTENZA'; fc = 'amber'; }
  } else if (lead && lead.finishT != null) { flag = 'BANDIERA A SCACCHI'; fc = 'white'; }
  else if (L > 1 && lead && lead.crossings === L - 1 && mode === 'race') { flag = 'ULTIMO GIRO'; fc = 'white'; }
  if (hudCache.flag !== flag) { hudCache.flag = flag; const el = $('twFlag'); el.textContent = flag; el.className = 'twFlag ' + fc + (flag ? '' : ' hidden'); }
  // 5 righe: tu al centro (o in cima / in fondo se sei tra i primi o gli ultimi)
  const me = st.indexOf(pl), N = Math.min(5, st.length);
  const a = Math.max(0, Math.min(st.length - N, me - 2));
  let html = '';
  for (let k = a; k < a + N; k++) {
    const c = st[k];
    let g, cls = '';
    if (c.retired) { g = 'RIT'; cls = ' out'; }
    else if (c.pit) { g = 'BOX'; cls = ' pit'; }
    else if (c === pl) g = c.finishT != null ? fmt(c.finishT) : '-:--.---';
    else if (c.finishT != null && pl.finishT != null) g = (c.finishT < pl.finishT ? '-' : '+') + Math.abs(c.finishT - pl.finishT).toFixed(3);
    else {
      const ahead = race.progress(c) > race.progress(pl);
      const laps = Math.floor(Math.abs(race.progress(c) - race.progress(pl)) / track.length);
      if (laps >= 1) g = `${ahead ? '-' : '+'}${laps}G`;
      else { const gg = ahead ? race.gap(c, pl) : race.gap(pl, c); g = gg != null && race.t > 1 ? (ahead ? '-' : '+') + gg.toFixed(3) : ''; }
    }
    const col = '#' + c.color.toString(16).padStart(6, '0');
    const tc = '#' + COMPOUNDS[c.phys.compound || 'M'].color.toString(16).padStart(6, '0');
    html += `<div class="twRow${c.isPlayer ? ' me' : ''}${cls}"><span class="p">${k + 1}</span><i style="background:${col}"></i><span class="n">${c.isPlayer ? 'TU' : c.name}</span><em style="border-color:${tc}"></em><span class="g">${g}</span></div>`;
  }
  if (hudCache.tower !== html) { hudCache.tower = html; $('twRows').innerHTML = html; }
}

// riquadro in alto a destra: settori, posizione e tempo del giro in corso
function lapBoxHud() {
  if (secHold && simTime >= secHold.until) { const L0 = race ? rsec : lap; if (L0) setSectorsHud(L0.sectors, L0.sector); else secHold = null; }
  for (let k = 0; k < 3; k++) { const c = $('sec' + k).className; if (hudCache['lb' + k] !== c) { hudCache['lb' + k] = c; $('lb' + k).className = c; } }
  if (race) {
    const pl = race.player, st = race.standings();
    const pos = `<b>${st.indexOf(pl) + 1}</b>/${st.length}`;
    if (hudCache.lbPos !== pos) { hudCache.lbPos = pos; $('lbPos').innerHTML = pos; }
    setText('lbTime', fmtLap(pl.finishT != null ? pl.lastLapT : race.t - pl.lapStart));
    setText('lbDelta', '');
  } else {
    const t = lap && lap.active ? simTime - lap.start : 0;
    const pos = lap && lap.active ? `GIRO <b>${lap.no}</b>` : 'GIRO DI LANCIO';
    if (hudCache.lbPos !== pos) { hudCache.lbPos = pos; $('lbPos').innerHTML = pos; }
    setText('lbTime', fmtLap(t));
    const d = $('delta');
    setText('lbDelta', d.textContent);
    const cl = d.className.replace('delta', 'lbDelta');
    if ($('lbDelta').className !== cl) $('lbDelta').className = cl;
  }
}
// tempi come in F1: sotto il minuto solo secondi e millesimi
const fmtLap = t => t == null ? '-:--.---' : t < 60 ? Math.max(0, t).toFixed(3) : fmt(t);

function raceHud(dt) {
  const pl = race.player, L = race.laps;
  const cur = Math.min(L, pl.crossings + 1);
  setText('lapLabel', pl.finishT != null ? 'ARRIVATO' : mode === 'countdown' ? 'PARTENZA' : `GIRO ${cur}/${L}`);
  setText('lapTime', fmt(pl.finishT ?? race.t));
  setText('bestTime', fmt(pl.bestLap));
  setText('lastTime', fmt(pl.lastLapT));
  if (!lastLapWarned && L > 1 && pl.crossings === L - 1 && mode === 'race') { lastLapWarned = true; showBanner('ULTIMO GIRO', 'yellow', 2.5, true); sounds.radio('Ultimo giro! Dai tutto.'); }
  raceHudT -= dt;
  if (raceHudT > 0) return;
  raceHudT = 0.25;
  const st = race.standings(), pos = st.indexOf(pl);
  setText('rpPos', `P${pos + 1}/${st.length}`);
  towerHud(st);
  if (mode === 'race' && pl.finishT == null) {
    if (lastPos && pos + 1 < lastPos && simTime - lastFeed > 1) { lastFeed = simTime; showBanner(`SORPASSO! ORA SEI P${pos + 1}`, 'green', 1.6); }
  }
  lastPos = pos + 1;
  const ahead = st[pos - 1], behind = st[pos + 1];
  let html = '';
  if (ahead) { const g = race.gap(ahead, pl); html += `▲ <em>${ahead.name}</em> ${g != null && race.t > 1 ? '+' + fmtGap(g) : ''}`; }
  if (behind && !behind.retired) { const g = race.gap(pl, behind); html += `${html ? '<br>' : ''}▼ <em>${behind.name}</em> ${g != null && race.t > 1 ? '−' + fmtGap(g) : ''}`; }
  if (hudCache.rpGaps !== html) { hudCache.rpGaps = html; $('rpGaps').innerHTML = html; }
}

function standingsHtml(full) {
  const st = race.standings(), leader = st[0];
  return st.map((c, i) => {
    let t;
    if (c.retired) t = 'RITIRATO';
    else if (c.finishT != null) t = i === 0 ? fmt(c.finishT) : '+' + fmtGap(c.finishT - leader.finishT);
    else {
      const lapsDown = Math.floor((race.progress(leader) - race.progress(c)) / track.length);
      t = lapsDown >= 1 ? `+${lapsDown} ${lapsDown === 1 ? 'giro' : 'giri'}` : (full ? 'in pista' : '+' + fmtGap(race.gap(leader, c)));
    }
    const col = '#' + c.color.toString(16).padStart(6, '0');
    return `<div class="r${c.isPlayer ? ' me' : ''}"><span class="p">${i + 1}</span><i style="background:${col}"></i><span>${c.name}</span><span>${t}</span><span class="bl">${c.bestLap ? fmt(c.bestLap) : ''}${race.pitLane ? ` · ${c.stops} ${c.stops === 1 ? 'sosta' : 'soste'}` : ''}</span></div>`;
  }).join('');
}

function showResults() {
  const st = race.standings(), pos = st.indexOf(race.player) + 1;
  $('resTitle').textContent = pos === 1 ? 'HAI VINTO!' : `${pos}° POSTO`;
  $('resSub').textContent = `${race.laps} ${race.laps === 1 ? 'GIRO' : 'GIRI'} · ${st.length} PILOTI · FORZA BOT ${settings.raceStrength}`;
  $('resTable').innerHTML = standingsHtml(true);
  $('results').classList.remove('hidden');
}

// pezzo di pista attorno alla vettura, girato nel senso di marcia (in basso a sinistra, come in F1 25)
var localMap = null;
class LocalMap {
  constructor(cv, track) { this.cv = cv; this.track = track; this.ctx = cv.getContext('2d'); this.resize(); }
  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio);
    this.w = Math.max(30, r.width); this.h = Math.max(60, r.height); this.dpr = dpr;
    this.cv.width = this.w * dpr; this.cv.height = this.h * dpr;
  }
  draw(p, cars) {
    const g = this.ctx, dpr = this.dpr, W = this.w * dpr, H = this.h * dpr;
    g.clearRect(0, 0, W, H);
    const tr = this.track, S = tr.samples, n = tr.count, i0 = p.prCG.i;
    const ahead = 420, behind = 110, sc = H / (ahead + behind);
    const phi = -Math.PI / 2 - p.yaw, cf = Math.cos(phi), sf = Math.sin(phi);
    const ox = W / 2, oy = H * (ahead / (ahead + behind));
    const map = (x, z) => { const X = x - p.x, Y = z - p.z; return [ox + (X * cf - Y * sf) * sc, oy + (X * sf + Y * cf) * sc]; };
    const a = Math.round(behind / tr.step), b = Math.round(ahead / tr.step);
    const path = () => { g.beginPath(); for (let k = -a; k <= b; k += 2) { const s = S[(i0 + k + n) % n]; const [x, y] = map(s.x, s.z); k === -a ? g.moveTo(x, y) : g.lineTo(x, y); } };
    g.lineJoin = g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 7 * dpr; path(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3.2 * dpr; path(); g.stroke();
    g.strokeStyle = '#2ee06f'; g.lineWidth = 1.4 * dpr; path(); g.stroke();
    if (cars) for (const c of cars) {
      const [x, y] = map(c.phys.x, c.phys.z);
      if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
      g.fillStyle = '#' + c.color.toString(16).padStart(6, '0'); g.strokeStyle = '#fff'; g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.arc(x, y, 3.6 * dpr, 0, 7); g.fill(); g.stroke();
    }
    g.fillStyle = '#ff8a1c'; g.strokeStyle = '#000'; g.lineWidth = 1.5 * dpr;
    g.beginPath(); g.moveTo(ox, oy - 7 * dpr); g.lineTo(ox + 5 * dpr, oy + 5 * dpr); g.lineTo(ox - 5 * dpr, oy + 5 * dpr); g.closePath(); g.fill(); g.stroke();
    // sfumatura verso l'alto
    g.globalCompositeOperation = 'destination-out';
    const gr = g.createLinearGradient(0, 0, 0, H * 0.3); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H * 0.3);
    g.globalCompositeOperation = 'source-over';
  }
}

class Minimap {
  constructor(cv, track) {
    this.cv = cv; this.track = track;
    this.ctx = cv.getContext('2d');
    this.off = document.createElement('canvas');
    this.resize();
  }
  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio);
    this.w = Math.max(50, r.width); this.h = Math.max(40, r.height);
    this.cv.width = this.off.width = this.w * dpr; this.cv.height = this.off.height = this.h * dpr;
    this.dpr = dpr;
    const S = this.track.samples;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    S.forEach(s => { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); });
    const pad = 12;
    const sc = Math.min((this.w - pad * 2) / (maxX - minX), (this.h - pad * 2) / (maxZ - minZ));
    this.map = (x, z) => [(pad + (x - minX) * sc + ((this.w - pad * 2) - (maxX - minX) * sc) / 2) * dpr, (pad + (z - minZ) * sc + ((this.h - pad * 2) - (maxZ - minZ) * sc) / 2) * dpr];
    const g = this.off.getContext('2d');
    g.clearRect(0, 0, this.off.width, this.off.height);
    g.lineJoin = 'round';
    const path = () => { g.beginPath(); S.forEach((s, i) => { const [x, y] = this.map(s.x, s.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 6 * dpr; path(); g.stroke();
    g.strokeStyle = '#e9ecf1'; g.lineWidth = 3 * dpr; path(); g.stroke();
    // settori
    const cols = ['#ff5a5a', '#4aa3ff', '#f5c518'];
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = cols[k]; g.lineWidth = 1.5 * dpr; g.beginPath();
      const a = this.track.sectorIdx[k], b = k < 2 ? this.track.sectorIdx[k + 1] : this.track.count;
      for (let i = a; i <= b; i++) { const s = S[i % S.length]; const [x, y] = this.map(s.x, s.z); i === a ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
    const [sx, sy] = this.map(S[0].x, S[0].z);
    g.fillStyle = '#fff'; g.fillRect(sx - 2 * dpr, sy - 5 * dpr, 4 * dpr, 10 * dpr);
  }
  draw(p, ghost, bots) {
    const g = this.ctx;
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.drawImage(this.off, 0, 0);
    if (bots) for (const c of bots) {
      const [bx, by] = this.map(c.phys.x, c.phys.z);
      g.fillStyle = '#' + c.color.toString(16).padStart(6, '0');
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1 * this.dpr;
      g.beginPath(); g.arc(bx, by, 3.5 * this.dpr, 0, 7); g.fill(); g.stroke();
    }
    if (ghost) {
      const [gx, gy] = this.map(ghost.x, ghost.z);
      g.fillStyle = '#7fd8ff'; g.beginPath(); g.arc(gx, gy, 3.5 * this.dpr, 0, 7); g.fill();
    }
    const [x, y] = this.map(p.x, p.z);
    g.fillStyle = '#ff8a1c'; g.strokeStyle = '#000'; g.lineWidth = 1.5 * this.dpr;
    g.beginPath(); g.arc(x, y, 5 * this.dpr, 0, 7); g.fill(); g.stroke();
  }
}

// ---------------------------------------------------------------- menu e pulsanti
const SET_LABELS = {
  auto: v => `Cambio: ${v ? 'Automatico' : 'Manuale'}`,
  tc: v => `Controllo trazione: ${v ? 'ON' : 'OFF'}`,
  abs: v => `ABS: ${v ? 'ON' : 'OFF'}`,
  ghost: v => `Fantasma record: ${v ? 'ON' : 'OFF'}`,
  post: v => `Effetti TV: ${v !== false ? 'ON' : 'OFF'}`,
  cam: v => `Telecamera: ${CAMS[v]}`,
  quality: v => `Grafica: ${v === 'high' ? 'Alta' : 'Leggera'}`,
  track: v => `Circuito: ${v === 'baku' ? 'Baku (Azerbaijan)' : 'Nova'}`,
  raceTyre: v => `Gomme di partenza: ${COMPOUNDS[v].name}`,
  msgs: v => `Avvisi a schermo: ${v ? 'Tutti' : 'Essenziali'}`,
  damage: v => (ARC() ? `Salute: ${v === 'sim' ? 'Normale' : v === 'reduced' ? 'Resistente' : 'Solo estetica'}` : `Danni: ${v === 'sim' ? 'Simulazione' : v === 'reduced' ? 'Ridotti' : 'Solo estetici'}`),
  steer: v => `Sterzo: ${v === 'tilt' ? 'Inclinazione' : 'Frecce'}`,
  line: v => `Linea ideale: ${v === 'full' ? 'Completa' : v === 'brake' ? 'Solo frenate' : 'OFF'}`,
  tiltInvert: v => `Sterzo inclinazione: ${v ? 'Invertito' : 'Normale'}`,
  tiltSens: v => `Sensibilità sterzo: ${v <= 15 ? 'Alta' : v <= 22 ? 'Media' : 'Bassa'}`,
  audio: v => `Volume: ${v >= 1 ? 'Alto' : v >= 0.6 ? 'Medio' : v > 0 ? 'Basso' : 'Spento'}`,
  radio: v => `Radio del box: ${v ? 'Sì' : 'No'}`,
  driveMode: v => `Guida: ${v === 'arcade' ? 'Arcade' : 'Realistica'}`,
  arcTow: v => `Scia: ${TOW_NAMES[v]}`,
  arcRubber: v => `Elastico: ${RUBBER_NAMES[v]}`,
};
function refreshSettings() {
  document.querySelectorAll('[data-set]').forEach(b => { const k = b.dataset.set; b.textContent = SET_LABELS[k](settings[k]); });
  $('menuBest').textContent = best ? fmt(best.time) : '—';
}
document.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.set;
  if (k === 'cam') { settings.cam = (settings.cam + 1) % CAMS.length; camMode = settings.cam; }
  else if (k === 'audio') { settings.audio = settings.audio >= 1 ? 0.6 : settings.audio >= 0.6 ? 0.3 : settings.audio > 0 ? 0 : 1; sounds.setLevel(settings.audio); }
  else if (k === 'radio') { settings.radio = !settings.radio; sounds.radioOn = settings.radio; if (settings.radio) sounds.radio('Radio controllo.'); }
  else if (k === 'track') { settings.track = settings.track === 'baku' ? 'nova' : 'baku'; saveSettings(); location.reload(); return; }
  else if (k === 'post') { settings.post = settings.post === false; saveSettings(); location.reload(); return; }
  else if (k === 'quality') { settings.quality = settings.quality === 'high' ? 'low' : 'high'; saveSettings(); location.reload(); return; }
  else if (k === 'raceTyre') { settings.raceTyre = settings.raceTyre === 'M' ? 'H' : settings.raceTyre === 'H' ? 'S' : 'M'; }
  else if (k === 'damage') { settings.damage = settings.damage === 'sim' ? 'reduced' : settings.damage === 'reduced' ? 'cosmetic' : 'sim'; phys.damageMode = dmMode(); }
  else if (k === 'steer') { settings.steer = settings.steer === 'tilt' ? 'buttons' : 'tilt'; }
  else if (k === 'line') { settings.line = settings.line === 'full' ? 'brake' : settings.line === 'brake' ? 'off' : 'full'; }
  else if (k === 'driveMode') { setDriveMode(settings.driveMode === 'arcade' ? 'sim' : 'arcade'); return; }
  else if (k === 'arcTow') { settings.arcTow = (settings.arcTow + 1) % 3; }
  else if (k === 'arcRubber') { settings.arcRubber = (settings.arcRubber + 1) % 3; }
  else if (k === 'tiltSens') { settings.tiltSens = settings.tiltSens <= 15 ? 22 : settings.tiltSens <= 22 ? 30 : 15; }
  else settings[k] = !settings[k];
  applyTilt();
  saveSettings(); refreshSettings();
}));
// cambio della modalità di guida (non serve ricaricare: vale dalla prossima partenza)
function setDriveMode(m) {
  settings.driveMode = m; saveSettings();
  // in arcade ci sono solo le F1 cartoon: dalla GT3 si ricarica in Formula 1
  if (m === 'arcade' && !IS_F1) {
    settings.carClass = 'f1'; saveSettings();
    const inPlay = !$('menuCar').classList.contains('hidden') || !$('menuMode').classList.contains('hidden');
    try { sessionStorage.setItem('novaf1.next', inPlay ? 'car' : 'menu'); } catch (e) { /* niente */ }
    location.reload();
    return;
  }
  rebuildPlayerModels();
  loadRecords();
  if (phys) { phys.arcade = ARC(); phys.damageMode = dmMode(); }
  if (racingLine) racingLine.setArcade(ARC());
  refreshSettings(); refreshDriveMode();
}
// modelli della tua vettura e del fantasma (cartoon in arcade, veri in realistica)
function rebuildPlayerModels() {
  if (!gtReady() || !car) return;
  scene.remove(car.root);
  car = makeCar(playerCarOpts());
  scene.add(car.root);
  setTyreColor(car, phys.compound);
  const vis = ghostCar.root.visible;
  scene.remove(ghostCar.root);
  ghostCar = makeCar({ ghost: true });
  ghostCar.root.visible = vis;
  scene.add(ghostCar.root);
  updateCarVisual(0);
}
function refreshDriveMode() {
  document.querySelectorAll('#modeRow [data-mode]').forEach(b => b.classList.toggle('sel', b.dataset.mode === settings.driveMode));
  document.querySelectorAll('.arcadeOnly').forEach(e => e.classList.toggle('hidden', !ARC()));
  document.body.classList.toggle('arcade', ARC());
  // in arcade si guidano solo le F1 cartoon: la GT3 sparisce dalla scelta
  const gtCard = document.querySelector('#carCards [data-class="gt"]');
  if (gtCard) gtCard.classList.toggle('hidden', ARC());
  const f1Card = document.querySelector('#carCards [data-class="f1"] .cTitle');
  if (f1Card) f1Card.textContent = ARC() ? 'FORMULA 1 CARTOON' : 'FORMULA 1';
}
// GIOCA · 1: modalità (realistica / arcade), poi la vettura
document.querySelectorAll('#modeRow [data-mode]').forEach(b => b.addEventListener('click', () => {
  sounds.ui && sounds.ui();
  setDriveMode(b.dataset.mode);
  if (!$('menuMode').classList.contains('hidden')) openCarPicker();
}));
$('playBtn').addEventListener('click', () => { refreshDriveMode(); showMenuPage('menuMode'); });
$('fsBtn').addEventListener('click', goLandscape);
$('resumeBtn').addEventListener('click', () => togglePause(false));
const restart = () => (gameType === 'race' ? startRaceGame() : startGame());
$('restartBtn').addEventListener('click', () => { togglePause(false); restart(); });
$('menuBtn').addEventListener('click', () => { goMenu(); });
$('dnfRestart').addEventListener('click', restart);
$('resAgain').addEventListener('click', startRaceGame);
$('resReplay').addEventListener('click', () => {
  if (!recorder) return;
  if (!recorder.stopped) { recorder.stopped = true; saveReplay(recorder.pack()); }
  startReplay(new Replay(recorder.pack()), race.cars.map(c => (c.isPlayer ? car : c.model)), sc && sc.model, false);
});
$('resMenu').addEventListener('click', () => goMenu());
// replay dalla pausa: si rivede quello che è successo finora (con tutte le telecamere e i comandi),
// poi si torna alla pausa esattamente dove si era
const HZ_MIN = 30;
$('pauseReplay').addEventListener('click', () => {
  if (!recorder || !race || mode !== 'pause') return;
  const models = race.cars.map(c => (c.isPlayer ? car : c.model));
  const keep = [...models, sc && sc.model].filter(Boolean).map(m => ({ m, p: m.root.position.clone(), q: m.root.quaternion.clone(), v: m.root.visible }));
  const camKeep = { p: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov };
  const rep = new Replay(recorder.pack());
  startReplay(rep, models, sc && sc.model, false);
  rp.fromPause = { keep, camKeep };
  rp.t = Math.max(0, rep.duration - 20);       // si parte dagli ultimi 20 secondi (la barra permette di tornare indietro)
  rpUi();
});

// --- navigazione del menu
const MENU_PAGES = ['menuHome', 'menuMode', 'menuCar', 'menuRace', 'menuGarage', 'menuSettings', 'menuHelp', 'menuCredits'];
function showMenuPage(id) {
  MENU_PAGES.forEach(p => $(p).classList.toggle('hidden', p !== id));
  if (garage) garage.active = id === 'menuGarage';
}
$('settingsBtn').addEventListener('click', () => showMenuPage('menuSettings'));
$('helpBtn').addEventListener('click', () => showMenuPage('menuHelp'));
$('creditsBtn').addEventListener('click', () => showMenuPage('menuCredits'));
['settingsBack', 'helpBack', 'creditsBack', 'modeBack'].forEach(id => $(id).addEventListener('click', () => showMenuPage('menuHome')));
$('raceBack').addEventListener('click', () => openCarPicker());
$('carBack').addEventListener('click', () => { refreshDriveMode(); showMenuPage('menuMode'); });
$('raceStartBtn').addEventListener('click', () => (settings.gameType === 'trial' ? startGame() : startRaceGame()));
$('garageBtn').addEventListener('click', openGarage);
$('garageBack').addEventListener('click', () => showMenuPage('menuHome'));
document.querySelectorAll('#typeSeg [data-type]').forEach(b => b.addEventListener('click', () => { settings.gameType = b.dataset.type; saveSettings(); refreshRaceSetup(); }));

// circuito (cambiarlo ricarica la pagina e riprende dal pregara)
let pickMode = 'race';
const trackRecord = id => store.get('novaf1.best.v3' + keyOf(id) + (ARC() ? '.arc' : ''));
function renderTrackList() {
  const box = $('trackCards');
  box.innerHTML = '';
  for (const t of TRACKS) {
    const b = document.createElement('button');
    b.className = 'trackItem' + (t.id === settings.track ? ' sel' : '');
    b.dataset.track = t.id;
    const { d, start } = outlinePath(t, 268, 120);
    const rec = trackRecord(t.id);
    b.innerHTML = `<svg viewBox="-10 -10 288 140" aria-hidden="true"><path d="${d}" fill="none" stroke="rgba(0,0,0,0.6)" stroke-width="12" stroke-linejoin="round"/>
      <path d="${d}" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/><circle cx="${start[0]}" cy="${start[1]}" r="9" fill="#ff8a1c"/></svg>
      <span><b><span class="flagMini">${t.flag.map(c => `<i style="background:${c}"></i>`).join('')}</span>${t.name.toUpperCase()}</b>
      <small>${t.place} · ${t.km} km · ${t.corners} curve · record ${rec ? fmt(rec.time) : '—'}</small></span>`;
    b.addEventListener('click', () => pickTrack(t.id));
    box.appendChild(b);
  }
}
function openTrackPicker() { openSetup(); }
function pickTrack(id) {
  if (id !== settings.track) {
    settings.track = id; saveSettings();
    try { sessionStorage.setItem('novaf1.next', 'setup'); } catch (e) { /* niente */ }
    location.reload();
    return;
  }
  renderTrackList();
}
// opzioni del modello del giocatore: in F1 la livrea della scuderia scelta
function playerCarOpts(extra = {}) { return IS_F1 ? { team: teamById(settings.f1Team), ...extra } : extra; }
// scuderie (solo Formula 1): la vettura del giocatore cambia livrea subito
function renderTeams() {
  const box = $('teamRow');
  box.classList.toggle('hidden', !IS_F1);
  if (!IS_F1) return;
  box.innerHTML = '<span class="teamLbl">LA TUA SCUDERIA</span>' + TEAMS.map(t => `<button class="teamChip${t.id === settings.f1Team ? ' sel' : ''}" data-team="${t.id}">
    <i style="background:linear-gradient(135deg, ${t.colors[0]} 0 55%, ${t.colors[1]} 55% 80%, ${t.colors[2]} 80%)"></i><b>${t.name}</b><small>${t.car}</small></button>`).join('');
  box.querySelectorAll('.teamChip').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    settings.f1Team = b.dataset.team; saveSettings();
    setPlayerTeam();
    renderTeams();
    refreshRaceSetup();
  }));
}
function setPlayerTeam() {
  if (!IS_F1 || !gtReady() || !car) return;
  scene.remove(car.root);
  car = makeCar(playerCarOpts());
  scene.add(car.root);
  setTyreColor(car, phys.compound);
  updateCarVisual(0);
}
// scelta della vettura: GT3 o Formula 1 (cambiare categoria ricarica la pagina)
function openCarPicker() {
  refreshDriveMode();
  document.querySelectorAll('#carCards .carCard').forEach(b => b.classList.toggle('sel', b.dataset.class === CAR_CLASS));
  renderTeams();
  $('carHint').textContent = IS_F1 ? 'Scegli la scuderia: la vedi subito sulla tua vettura' : 'Tocca GT3 o FORMULA 1';
  showMenuPage('menuCar');
}
function carContinue() { openSetup(); }
// GIOCA · 3: pregara (tipo di sessione, circuito e opzioni)
function openSetup() {
  renderTrackList();
  refreshDriveMode();
  refreshRaceSetup();
  showMenuPage('menuRace');
}
$('carNext').addEventListener('click', carContinue);
const cycleTeam = d => {
  const i = TEAMS.findIndex(t => t.id === settings.f1Team);
  settings.f1Team = TEAMS[(i + d + TEAMS.length) % TEAMS.length].id; saveSettings();
  setPlayerTeam(); refreshRaceSetup();
};
$('teamPrev').addEventListener('click', () => cycleTeam(-1));
$('teamNext').addEventListener('click', () => cycleTeam(1));
document.querySelectorAll('#carCards .carCard').forEach(b => b.addEventListener('click', () => {
  const cls = b.dataset.class;
  if (cls !== CAR_CLASS) {
    settings.carClass = cls; saveSettings();
    try { sessionStorage.setItem('novaf1.next', 'car'); } catch (e) { /* niente */ }
    location.reload();
    return;
  }
  // stessa categoria: si va avanti (la scuderia si sceglie qui sotto o nella griglia)
  carContinue();
}));
document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
  const [k, dv] = b.dataset.step.split(':');
  const lim = { raceBots: [1, 19], raceLaps: [1, 30], raceStrength: [1, 110], raceStart: [1, settings.raceBots + 1] }[k];
  settings[k] = Math.max(lim[0], Math.min(lim[1], settings[k] + +dv));
  refreshRaceSetup(); saveSettings();
}));
$('pitRepair').addEventListener('click', () => { if (race && race.player.pit && race.player.pit.phase !== 'in') return; pitChoice.repair = !pitChoice.repair; pitUi(); });

const tier = v => v <= 20 ? 'VELOCE' : v <= 45 ? 'ESPERTO' : v <= 70 ? 'PRO' : v <= 90 ? 'CAMPIONE' : v <= 100 ? 'LEGGENDA' : 'ALIENO';
function refreshRaceSetup() {
  const S = settings;
  S.raceStart = Math.min(S.raceStart, S.raceBots + 1);
  $('rsLaps').value = S.raceLaps; $('rsBots').value = S.raceBots; $('rsStrength').value = S.raceStrength;
  $('rsStart').max = S.raceBots + 1; $('rsStart').value = S.raceStart;
  const km = (S.raceLaps * track.length / 1000).toFixed(1).replace('.', ',');
  $('rsLapsV').innerHTML = `${S.raceLaps} ${S.raceLaps === 1 ? 'giro' : 'giri'}<small>${km} KM${S.raceLaps >= 8 ? ' · BOX' : ''}</small>`;
  $('rsBotsV').innerHTML = `${S.raceBots}<small>${S.raceBots + 1} VETTURE</small>`;
  const trial = S.gameType === 'trial';
  document.body.classList.toggle('trialSetup', trial);
  document.querySelectorAll('#typeSeg [data-type]').forEach(b => b.classList.toggle('sel', b.dataset.type === S.gameType));
  $('raceTitle').textContent = (trial ? 'PROVA A TEMPO' : 'GARA') + ' · ' + (ARC() ? 'ARCADE' : IS_F1 ? 'F1' : 'GT3');
  $('setupHint').textContent = track.name + (trial ? ' · da solo contro il tuo fantasma' : ` · ${S.raceLaps} ${S.raceLaps === 1 ? 'giro' : 'giri'} contro ${S.raceBots} avversari`);
  $('teamCard').classList.toggle('hidden', !IS_F1);
  if (IS_F1) {
    const tm = teamById(settings.f1Team);
    $('rsTeamV').textContent = tm.name;
    $('rsTeamCar').textContent = `${tm.car} · con ${tm.drivers[1]}`;
    $('rsTeamSw').style.background = `linear-gradient(135deg, ${tm.colors[0]} 0 55%, ${tm.colors[1]} 55% 80%, ${tm.colors[2]} 80%)`;
  }
  $('gpCount').textContent = S.raceBots + 1;
  $('gpCars').innerHTML = Array.from({ length: S.raceBots + 1 }, (_, k) => `<i class="${k + 1 === S.raceStart ? 'me' : ''}" data-n="${k + 1 === S.raceStart ? 'TU' : k + 1}"></i>`).join('');
  $('rsStrengthV').innerHTML = `${S.raceStrength}<small>${tier(S.raceStrength)}</small>`;
  $('rsStartV').innerHTML = `${S.raceStart}°<small>${S.raceStart === 1 ? 'POLE' : S.raceStart === S.raceBots + 1 ? 'ULTIMO' : 'DI ' + (S.raceBots + 1)}</small>`;
}
[['rsLaps', 'raceLaps'], ['rsBots', 'raceBots'], ['rsStrength', 'raceStrength'], ['rsStart', 'raceStart']].forEach(([id, k]) => {
  $(id).addEventListener('input', () => { settings[k] = +$(id).value; refreshRaceSetup(); saveSettings(); });
});
$('pauseBtn').addEventListener('click', () => togglePause(mode !== 'pause'));
$('camBtn').addEventListener('click', cycleCam);
input.bindTouch($('tLeft'), 'left');
input.bindTouch($('tRight'), 'right');
input.bindTouch($('zGas'), 'gas');
input.bindTouch($('zBrake'), 'brake');
input.bindTouch($('pGas'), 'gas');
input.bindTouch($('pBrake'), 'brake');
input.touchMode = isTouch;
const applyTilt = () => {
  input.tilt.invert = settings.tiltInvert; input.tilt.sens = settings.tiltSens;
  input.tiltEnabled = settings.steer === 'tilt';
  document.body.classList.toggle('steer-buttons', settings.steer !== 'tilt');
  document.body.classList.toggle('steer-tilt', settings.steer === 'tilt');
};
applyTilt();

// telefono: si gioca in orizzontale
const isPortrait = () => isTouch && innerHeight > innerWidth;
function checkOrientation() {
  const p = isPortrait();
  $('rotate').classList.toggle('hidden', !p);
  if (p && (mode === 'race' || mode === 'countdown')) togglePause(true);
}
addEventListener('orientationchange', () => setTimeout(checkOrientation, 200));
function goLandscape() {
  if (!isTouch) return;
  try {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const p = req ? req.call(el) : null;
    const lock = () => { try { const r = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (r && r.catch) r.catch(() => {}); } catch (_) {} };
    if (p && p.then) p.then(lock).catch(lock); else lock();
  } catch (_) { /* non supportato */ }
}
function updateTouchSteer() {
  if (!isTouch || settings.steer !== 'tilt') return;
  const tilt = input.tiltSteer() !== null;
  $('tiltBar').classList.toggle('hidden', !tilt);
  if (tilt) $('tiltBar').firstElementChild.style.left = (50 + input.state.steer * 50) + '%';
  // sensore assente: si torna alle frecce
  if (!tilt && mode !== 'menu' && performance.now() - gameStartedAt > 1500) {
    settings.steer = 'buttons'; saveSettings(); applyTilt(); refreshSettings();
    showBanner('SENSORE NON DISPONIBILE: STERZA CON ◀ ▶', 'yellow', 3, true);
  }
}
let gameStartedAt = 0;

let pausedFrom = 'race';
function togglePause(on) {
  if (on && (mode === 'race' || mode === 'countdown')) {
    pausedFrom = mode; mode = 'pause';
    $('pause').classList.remove('hidden');
    $('carStatus').innerHTML = carStatusHtml();
    $('pauseReplay').classList.toggle('hidden', !(race && recorder && recorder.frames.length > HZ_MIN));
    if (race) $('lapList').innerHTML = `<div class="resTable">${standingsHtml(false)}</div>`;
    else $('lapList').innerHTML = laps.length ? laps.map((l, i) => `<div class="${l.valid ? (best && l.time === best.time ? 'best' : '') : 'inv'}"><span>Giro ${i + 1}</span><span>${fmt(l.time)}</span></div>`).join('') : '<div><span>Nessun giro completato</span></div>';
    if (sounds.ctx) sounds.ctx.suspend();
  } else if (!on && mode === 'pause') {
    mode = pausedFrom;
    $('pause').classList.add('hidden');
    if (sounds.ctx) sounds.ctx.resume();
  }
}
function goMenu() {
  mode = 'menu';
  $('pause').classList.add('hidden'); $('dnf').classList.add('hidden'); $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
  showMenuPage('menuHome');
  $('lightsHud').classList.add('hidden');
  if (sounds.ctx) sounds.ctx.resume();
  clearRace();
  gameType = 'trial';
  resetSession();
  refreshSettings();
  startAttract();
}
function cycleCam() {
  camMode = (camMode + 1) % CAMS.length; settings.cam = camMode; saveSettings();
  camState.init = false;
  showBanner(`TELECAMERA: ${CAMS[camMode]}`, 'yellow', 1.2);
}

function rescue() {
  // rimette la vettura in pista nel punto più vicino
  const i = phys.prCG.i;
  phys.reset(i, 0, true);
  skids.cut();
  camState.init = false;
  if (lap.active && !ARC()) { lap.valid = false; $('invalid').classList.remove('hidden'); }
  showBanner(ARC() ? 'RIMESSO IN PISTA' : 'VETTURA RIPOSIZIONATA', 'yellow', 1.5);
}

// ---------------------------------------------------------------- audio
var radioSaid = {};   // messaggi radio già detti in questa gara
var audioPitPhase = null, audioPos = 0;
function updateAudio(dt) {
  if (!sounds.ctx) return;
  sounds.setView(camMode >= 2);
  sounds.update(phys, mode === 'race' || mode === 'countdown', dt);
  // ascoltatore: la telecamera
  camera.getWorldDirection(tmpAudio);
  const fl = Math.hypot(tmpAudio.x, tmpAudio.z) || 1;
  const L = { x: camera.position.x, z: camera.position.z, fx: tmpAudio.x / fl, fz: tmpAudio.z / fl, vx: phys.vx, vz: phys.vz };
  const list = [];
  if (race) for (const c of race.cars) if (!c.isPlayer && !c.gone && !c.phys.inPit) list.push({ id: c.slot, x: c.phys.x, z: c.phys.z, vx: c.phys.vx, vz: c.phys.vz, rpm: c.phys.rpm, thr: c.phys.throttleOut || 0 });
  if (sc && sc.active && sc.model && sc.model.root.visible) { const p = sc.model.root.position; list.push({ id: 'sc', x: p.x, z: p.z, vx: 0, vz: 0, rpm: 5000 + sc.v * 90, thr: 0.4 }); }
  sounds.others(list, L);
  // pubblico: vicino alle tribune
  let dmin = 1e9;
  for (const p of scenery.standPos || []) dmin = Math.min(dmin, Math.hypot(p.x - camera.position.x, p.z - camera.position.z));
  sounds.setCrowd(Math.max(0, 1 - dmin / 160) * 0.8);
  // pit stop: rumori del box quando la vettura si ferma
  const pit = race && race.player.pit;
  const ph = pit ? pit.phase : null;
  if (ph === 'service' && audioPitPhase !== 'service') sounds.pitService(pit.serviceTotal);
  audioPitPhase = ph;
  // sorpassi davanti al pubblico
  if (race && mode === 'race') {
    const pos = race.standings().indexOf(race.player) + 1;
    if (audioPos && pos < audioPos && dmin < 140) sounds.cheerUp(0.35);
    audioPos = pos;
  }
}
const tmpAudio = new THREE.Vector3();

// ---------------------------------------------------------------- menu: gara sullo sfondo
// Mentre sei nel menu i bot corrono davvero sul circuito e la regia li riprende come in TV:
// inquadrature da dietro, di lato, da bordo pista con il teleobiettivo, dall'elicottero.
var attract = null;
function startAttract() {
  if (!gtReady() || mode !== 'menu') return;
  clearRace();
  resetSession();
  const bots = settings.quality === 'high' ? 9 : 5;
  race = new Race(track, racingLine, {
    laps: 999, bots, strength: 80, startPos: 1, playerPhys: phys, damageMode: 'cosmetic', arcade: ARC(), rubber: 0,
    playerTeam: IS_F1 ? teamById(settings.f1Team) : null, grid: IS_F1 ? f1Grid(settings.f1Team, bots) : null,
  });
  // in gruppo, già lanciati, a metà giro
  const n = track.count, st = track.step, s0 = track.length * 0.35;
  race.cars.forEach((c, k) => {
    const i = Math.round((s0 - k * 28) / st + n) % n;
    c.phys.reset(i, (k % 2 ? 1.4 : -1.4));
    const smp = track.samples[i], v = Math.min(55, racingLine.speed[i] * 0.9);
    c.phys.vx = smp.tx * v; c.phys.vz = smp.tz * v;
    c.phys.gear = 5;
    c.sPrev = c.phys.prCG.s;
  });
  spawnRaceModels();
  attract = { ai: new AIDriver(phys, racingLine, 80, 5), shot: null, t: 0, acc: 0 };
  attract.ai.launchDelay = 0;
  for (const c of race.cars) if (c.ai) c.ai.launchDelay = 0;
}
const SHOTS = ['chase', 'tele', 'side', 'heli', 'front', 'tele', 'chase', 'low'];
function newShot() {
  const A = attract, cars = race.cars.filter(c => !c.gone);
  const prev = A.shot;
  const car = cars[Math.floor(Math.random() * cars.length)];
  const type = SHOTS[(prev ? SHOTS.indexOf(prev.type) + 1 + Math.floor(Math.random() * 3) : 0) % SHOTS.length];
  const shot = { type, car, t0: A.t, until: A.t + (type === 'tele' ? 6 : 5) + Math.random() * 2, side: Math.random() < 0.5 ? -1 : 1, pos: null };
  if (type === 'tele') {
    // telecamera fissa a bordo pista, un po' più avanti della vettura
    const i = (car.phys.prCG.i + Math.round(110 / track.step)) % track.count, sm = track.samples[i];
    const off = ((shot.side > 0 ? sm.hwL : sm.hwR) ?? sm.hw) + 7;
    shot.pos = new THREE.Vector3(sm.x + sm.nx * off * shot.side, sm.y + 2.2, sm.z + sm.nz * off * shot.side);
  }
  A.shot = shot;
  const fade = $('menuFade'); fade.classList.add('on'); setTimeout(() => fade.classList.remove('on'), 160);
  const who = car.team ? `${car.name} · ${car.team.name}` : car.isPlayer ? (IS_F1 ? 'FORMULA 1' : 'GT3') : car.name;
  $('liveText').textContent = `${track.name} · ${who}`;
}
function attractStep(dt) {
  const A = attract;
  A.acc += dt;
  let steps = 0;
  while (A.acc >= DT && steps < 30) { race.step(DT, A.ai.drive(DT, race.cars, race.t), true); A.acc -= DT; steps++; }
  if (A.acc > DT * 4) A.acc = 0;
  // una vettura ferma o fuori pista torna in gioco
  for (const c of race.cars) if (c.phys.speed < 3 && race.t > 3) { c.stuckT = (c.stuckT || 0) + dt; if (c.stuckT > 3) { c.phys.reset(c.phys.prCG.i, 0, true); c.stuckT = 0; } } else c.stuckT = 0;
}
const camTmp = new THREE.Vector3(), camLook = new THREE.Vector3();
function attractCamera(dt) {
  const A = attract;
  // i tagli seguono l'orologio vero, anche se il dispositivo è lento
  const now = performance.now() / 1000;
  A.t += Math.min(2, Math.max(dt, now - (A.wall || now))); A.wall = now;
  if (!A.shot || A.t > A.shot.until || A.shot.car.gone) newShot();
  const sh = A.shot, p = sh.car.phys;
  const fx = Math.cos(p.yaw), fz = Math.sin(p.yaw), nx = -fz, nz = fx;
  const k = (A.t - sh.t0);
  let fov = 50;
  switch (sh.type) {
    case 'chase': camTmp.set(p.x - fx * 7.5, p.y + 1.9, p.z - fz * 7.5); camLook.set(p.x + fx * 6, p.y + 0.6, p.z + fz * 6); fov = 55; break;
    case 'low': camTmp.set(p.x - fx * 4.2 + nx * 1.8 * sh.side, p.y + 0.45, p.z - fz * 4.2 + nz * 1.8 * sh.side); camLook.set(p.x + fx * 8, p.y + 0.4, p.z + fz * 8); fov = 62; break;
    case 'side': camTmp.set(p.x + fx * (2 - k * 0.5) + nx * 4.2 * sh.side, p.y + 0.9, p.z + fz * (2 - k * 0.5) + nz * 4.2 * sh.side); camLook.set(p.x, p.y + 0.4, p.z); fov = 48; break;
    case 'front': camTmp.set(p.x + fx * 9 + nx * 1.5 * sh.side, p.y + 1.1, p.z + fz * 9 + nz * 1.5 * sh.side); camLook.set(p.x, p.y + 0.5, p.z); fov = 45; break;
    case 'heli': { const a = k * 0.12 * sh.side; camTmp.set(p.x - fx * 20 * Math.cos(a) + nx * 20 * Math.sin(a), p.y + 14, p.z - fz * 20 * Math.cos(a) + nz * 20 * Math.sin(a)); camLook.set(p.x + fx * 10, p.y, p.z + fz * 10); fov = 45; break; }
    case 'tele': { camTmp.copy(sh.pos); camLook.set(p.x, p.y + 0.5, p.z); const d = camTmp.distanceTo(camLook); fov = Math.max(9, Math.min(45, 520 / Math.max(8, d))); break; }
  }
  // movimento morbido (le telecamere che seguono non tremano)
  if (sh.type === 'tele' || !A.camInit || A.lastShot !== sh) { camera.position.copy(camTmp); A.camInit = true; A.lastShot = sh; A.look = camLook.clone(); }
  else { camera.position.lerp(camTmp, 1 - Math.exp(-dt * 10)); }
  A.look.lerp(camLook, 1 - Math.exp(-dt * 12));
  // mai sotto il terreno
  const g = track.samples[p.prCG.i].y;
  if (camera.position.y < g + 0.3) camera.position.y = g + 0.3;
  camera.up.set(0, 1, 0);
  camera.lookAt(A.look);
  camera.fov += (fov - camera.fov) * (A.lastFovShot === sh ? Math.min(1, dt * 4) : 1); A.lastFovShot = sh;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- garage
var garage = null;
const gState = { cat: 'f1', idx: 0 };
const GT_LIVERIES = [
  { name: 'MANTHEY #91', team: 'PORSCHE 992 GT3 R', primary: null, accent: '#ffd21e' },
  { name: 'NOVA ARANCIO', team: 'PORSCHE 992 GT3 R', primary: 0xff8a1c, accent: '#ff8a1c', acc2: 0x16171b },
  { name: 'BLU NOTTE', team: 'PORSCHE 992 GT3 R', primary: 0x1b3a8a, accent: '#2a6fe0', acc2: 0xffd21e },
  { name: 'VERDE CORSA', team: 'PORSCHE 992 GT3 R', primary: 0x0a7d3e, accent: '#2ee06f', acc2: 0xffffff },
  { name: 'ROSSO FUOCO', team: 'PORSCHE 992 GT3 R', primary: 0xd8231f, accent: '#ff3b30', acc2: 0xffffff },
];
const gList = () => (gState.cat === 'gt' ? GT_LIVERIES : TEAMS);
function openGarage() {
  if (!gtReady()) return;
  if (!garage) { garage = new Garage(renderer, scene.environment); }
  garage.resize(innerWidth, innerHeight);
  gState.cat = ARC() ? 'toon' : IS_F1 ? 'f1' : 'gt';
  gState.idx = gState.cat === 'gt' ? 0 : Math.max(0, TEAMS.findIndex(t => t.id === settings.f1Team));
  showMenuPage('menuGarage');
  showGarageCar();
}
let gToken = 0;
async function showGarageCar() {
  const cat = gState.cat, kind = cat === 'gt' ? 'gt' : 'f1', tok = ++gToken;
  document.querySelectorAll('#gTabs [data-cat]').forEach(b => b.classList.toggle('sel', b.dataset.cat === cat));
  const list = gList(), e = list[gState.idx];
  $('gCount').textContent = `${gState.idx + 1} / ${list.length}`;
  $('gLoading').classList.remove('hidden');
  try { await loadKind(kind); if (kind === 'f1') await loadLiveryMaps(); } catch (err) { $('gLoading').textContent = 'VETTURA NON DISPONIBILE'; return; }
  if (tok !== gToken) return;
  $('gLoading').classList.add('hidden');
  let m = kind === 'f1' ? createGT({ kind, team: e }) : createGT({ kind, ...(e.primary != null ? { primary: e.primary, accent: e.acc2 } : {}) });
  if (cat === 'toon') m = cartoonize(m);
  garage.setCar(m, kind === 'f1' ? e.colors[1] : e.accent);
  // schede
  if (kind === 'f1') {
    $('gTeam').textContent = cat === 'toon' ? `${e.name} · CARTOON` : e.name;
    $('gName').textContent = e.car;
    $('gDrivers').textContent = e.drivers.join(' · ');
  } else {
    $('gTeam').textContent = e.team; $('gName').textContent = e.name; $('gDrivers').textContent = 'GT3 · 4,2 L boxer · 6 cilindri';
  }
  const st = cat === 'gt'
    ? [['POTENZA', 0.56, '~560 CV'], ['PESO', 0.62, '1240 kg'], ['VELOCITÀ', 0.78, '~280 km/h'], ['CARICO', 0.35, 'BASSO'], ['FRENATA', 0.6, '31 kN']]
    : [['POTENZA', 1, '~1000 CV'], ['PESO', 0.4, '798 kg'], ['VELOCITÀ', 0.97, '~340 km/h'], ['CARICO', 0.95, 'ALTO'], ['FRENATA', 0.95, '41 kN']];
  if (cat === 'toon') st.push(['GUIDA', 1, 'ARCADE']);
  else if (kind === 'f1') st.push(['SQUADRA', Math.min(1, 0.45 + e.tier * 0.18), ['', 'MEDIA', 'BUONA', 'TOP', 'TOP'][e.tier] || '']);
  $('gStats').innerHTML = st.map(([l, v, t]) => `<div class="gStat"><span>${l}</span><span class="bar"><i style="width:${Math.round(v * 100)}%"></i></span><b>${t}</b></div>`).join('');
}
document.querySelectorAll('#gTabs [data-cat]').forEach(b => b.addEventListener('click', () => {
  gState.cat = b.dataset.cat;
  gState.idx = gState.cat === 'gt' ? 0 : Math.max(0, TEAMS.findIndex(t => t.id === settings.f1Team));
  showGarageCar();
}));
$('gPrev').addEventListener('click', () => { const L = gList().length; gState.idx = (gState.idx - 1 + L) % L; showGarageCar(); });
$('gNext').addEventListener('click', () => { const L = gList().length; gState.idx = (gState.idx + 1) % L; showGarageCar(); });
// "Guidala": modalità, categoria e scuderia della vettura che stai guardando, poi il pregara
$('garageUse').addEventListener('click', () => {
  const cat = gState.cat, e = gList()[gState.idx];
  const cls = cat === 'gt' ? 'gt' : 'f1';
  if (cls === 'f1') settings.f1Team = e.id;
  settings.driveMode = cat === 'toon' ? 'arcade' : 'sim';
  if (cls !== CAR_CLASS) {
    settings.carClass = cls; saveSettings();
    try { sessionStorage.setItem('novaf1.next', 'setup'); } catch (err) { /* niente */ }
    location.reload();
    return;
  }
  saveSettings();
  setDriveMode(settings.driveMode);
  openSetup();
});

// ---------------------------------------------------------------- loop principale
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const inp = input.update(dt);
  padNav.update(dt);
  // garage: si disegna solo lo showroom
  if (garage && garage.active) { garage.render(dt); input.endFrame(); return; }

  if (input.consume('KeyM')) { sounds.setMuted(!sounds.muted); }
  if (input.consume('KeyP') || input.consume('Escape')) { if (mode === 'pause') togglePause(false); else togglePause(true); }
  if (mode === 'race' || mode === 'countdown') {
    if (input.consume('KeyC')) cycleCam();
  }
  if (mode === 'race' && input.consume('KeyR') && dnfTimer < 0 && !(race && race.player.pit)) rescue();
  if (mode === 'menu' && attract && race) attractStep(dt);

  if (mode === 'countdown') {
    countdown.t += dt;
    const lit = Math.min(5, Math.floor(countdown.t));
    if (lit !== countdown.lit) {
      countdown.lit = lit;
      scenery.setLights(lit);
      [...$('lightsHud').children].forEach((e, k) => e.classList.toggle('on', k < lit));
      if (lit > 0) sounds.beep(660, 0.12, 0.1);
    }
    // da fermi si può dare gas: il motore sale di giri
    phys.rpm += ((phys.idleRpm + inp.throttle * 7500) - phys.rpm) * Math.min(1, dt * 6);
    phys.throttleOut = inp.throttle;
    if (countdown.t >= countdown.out) {
      scenery.setLights(0);
      [...$('lightsHud').children].forEach(e => e.classList.remove('on'));
      setTimeout(() => $('lightsHud').classList.add('hidden'), 600);
      sounds.cheerUp(0.8);
      if (bakuFx) bakuFx.start();
      showBanner(gameType === 'race' ? 'VIA! BUONA GARA' : 'VIA! IL TEMPO PARTE AL TRAGUARDO', 'green', 2);
      mode = 'race';
      acc = 0;
    }
  } else if (mode === 'race') {
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 40) { physicsStep(inp); acc -= DT; steps++; }
    checkDetachments();
    if (recorder && race && !recorder.stopped) {
      recorder.tick(race.t, c => race.progress(c), sc);
      // fine registrazione poco dopo il tuo arrivo: si salva per rivederla dal Garage
      const pf = race.player.finishT;
      if (pf != null && race.t > pf + 8) { recorder.stopped = true; saveReplay(recorder.pack()); }
    }
    if (race) {
      if (resultsTimer > 0) { resultsTimer -= dt; if (resultsTimer <= 0) showResults(); }
      else if (!$('results').classList.contains('hidden') && Math.random() < dt * 3) $('resTable').innerHTML = standingsHtml(true);
    }
    if (dnfTimer >= 0) {
      dnfTimer -= dt;
      if (dnfTimer < 0) { mode = 'dnf'; $('dnf').classList.remove('hidden'); dnfTimer = 99; }
    }
    if (phys.gear === -1 && phys.speed < 1 && inp.brake > 0.5 && phys.vxl > -0.1 && Math.random() < 0.003) showBanner('RETROMARCIA', 'yellow', 1);
  }

  if (mode === 'replay') replayFrame(dt);
  else if (mode !== 'pause') {
    const live = mode === 'race' || !!attract;
    updateCarVisual(live ? dt : 0);
    if (race) for (const c of race.cars) if (c.model) {
      c.model.root.visible = !c.gone;
      if (c.gone) continue;
      updateModel(c.model, c.phys, live ? dt : 0);
      if (mode === 'race') detachParts(c.model, c.phys, c);
      // ombre solo per le vetture vicine
      const near = attract ? Math.abs(c.phys.x - camera.position.x) + Math.abs(c.phys.z - camera.position.z) < 90 : Math.abs(c.phys.x - phys.x) + Math.abs(c.phys.z - phys.z) < 70;
      if (c.model.shadowOn !== near) { c.model.shadowOn = near; c.model.root.traverse(o => { if (o.isMesh) o.castShadow = near; }); }
    }
    if (sc && mode === 'race') { sc.update(dt); scRules(); }
    updateEffects(mode === 'race' ? dt : dt * 0.5);
    updateGhost();
    racingLine.update(phys.prCG.i, phys.speed, mode === 'menu' ? 'off' : settings.line);
    if (attract && mode === 'menu') attractCamera(dt); else updateCamera(dt);
    updateAudio(dt);
  }
  if (mode !== 'menu' && mode !== 'replay') updateHud(dt);
  updateTouchSteer();

  // l'ombra segue la vettura (nel menu: quella inquadrata)
  const fp = mode === 'replay' && rp ? rp.focus : attract && attract.shot ? attract.shot.car.phys : phys;
  sun.target.position.set(fp.x, fp.y, fp.z);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 350);
  scenery.skyMesh.position.copy(camera.position);
  scenery.update(mode === 'pause' ? 0 : dt);
  if (post) {
    // sfocatura radiale solo in gara e oltre i 150 km/h circa (più forte dall'abitacolo)
    const sp = (mode === 'race' || mode === 'countdown') ? Math.max(0, Math.min(1, (phys.speed - 42) / 45)) * (camMode === 3 ? 1 : 0.55) : 0;
    post.draw(dt, camera, sp, postFx());
  } else renderer.render(scene, camera);
  input.endFrame();
}

// effetti dell'immagine: raggi di sole, obiettivo TV, aria calda dagli scarichi
const hazeList = [];
function postFx() {
  const tv = (mode === 'replay' && rp && (RP_CAMS[rp.cam] === 'TV' || RP_CAMS[rp.cam] === 'ELICOTTERO')) || (mode === 'menu' && !!attract);
  hazeList.length = 0;
  if (track.street) {
    const ex = (p, k) => {
      const b = IS_F1 ? -2.45 : -2.3, cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
      hazeList.push([p.x + cy * b, p.y + 0.55, p.z + sy * b, k]);
    };
    if (mode === 'race' || mode === 'countdown') {
      if (camMode !== 3) ex(phys, 0.6 + 0.4 * (phys.throttleOut || 0));
      if (race) {
        // le due vetture più vicine davanti
        const fx = Math.cos(phys.yaw), fz = Math.sin(phys.yaw);
        const near = [];
        for (const c of race.cars) {
          if (c.isPlayer || c.gone) continue;
          const dx = c.phys.x - phys.x, dz = c.phys.z - phys.z, d = Math.hypot(dx, dz);
          if (d < 45 && dx * fx + dz * fz > 0) near.push([d, c]);
        }
        near.sort((a, b) => a[0] - b[0]);
        for (const [, c] of near.slice(0, 2)) ex(c.phys, 0.9);
      }
    }
  }
  return { sunDir: SUN_DIR, lens: tv ? 1 : 0, haze: hazeList };
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (particles) particles.setScale(h * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
  if (glow) glow.setScale(h * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
  if (bakuFx) bakuFx.setScale(h * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
  if (minimap) minimap.resize();
  if (post) post.setSize(w, h);
  if (localMap) localMap.resize();
  if (garage) garage.resize(w, h);
}
addEventListener('resize', () => { resize(); checkOrientation(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && (mode === 'race' || mode === 'countdown')) togglePause(true); });

// ---------------------------------------------------------------- avvio
const fontsReady = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 1500))]);
// niente zoom del browser: doppio tocco rapido (pedali premuti di fila), pizzico, doppio clic
{
  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    const now = performance.now();
    if (now - lastTouchEnd < 350 && !e.target.closest('input, select, textarea, a')) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
}

// il modello 3D delle GT si carica insieme ai font (se non arriva si usa quello procedurale)
const gtLoad = Promise.race([Promise.all([loadGT(), IS_F1 ? loadLiveryMaps() : null]).catch(e => console.warn('modello non caricato', e)), new Promise(r => setTimeout(r, 20000))]);
Promise.all([fontsReady, gtLoad]).then(() => requestAnimationFrame(() => setTimeout(() => {
  build();
  resize();
  resetSession();
  refreshSettings();
  refreshDriveMode();
  checkOrientation();
  $('loading').classList.add('hidden');
  // dopo il cambio di circuito si riprende dal punto del menu in cui si era
  let next = null;
  try { next = sessionStorage.getItem('novaf1.next'); sessionStorage.removeItem('novaf1.next'); } catch (e) { /* niente */ }
  if (next === 'replay') loadReplay().then(p => { if (p) startSavedReplay(p); else startAttract(); });
  else if (next === 'setup' || next === 'race') openSetup();
  else if (next === 'trial') startGame();
  else if (next === 'car' || next === 'car-race' || next === 'car-trial') openCarPicker();
  else if (next === 'garage') openGarage();
  if (next !== 'trial' && next !== 'replay') startAttract();
  window.__game = {
    phys, track, startGame, startRaceGame, settings, scene, camera, get race() { return race; }, get calls() { return renderer.info.render.calls; },
    get mode() { return mode; }, get lap() { return lap; }, get scenery() { return scenery; }, get car() { return car; }, get debris() { return debris; }, get sc() { return sc; }, get info() { return renderer.info.render; },
    skipCountdown() { if (countdown) countdown.t = countdown.out; },
    replayNow() { $('resReplay').click(); }, get rp() { return rp; },
    teleport(i, lateral = 0, speed = 0) { phys.reset(i, lateral, true); const s = track.samples[i]; phys.vx = s.tx * speed; phys.vz = s.tz * speed; camState.init = false; },
  };
  requestAnimationFrame(frame);
}, 30)));
