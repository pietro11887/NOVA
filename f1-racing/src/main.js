import * as THREE from 'three';
import { Track, SURF } from './track.js';
import { ROAD_HALF_WIDTH, selectTrack, bakuTrack, spaTrack, TRACK } from './trackData.js';
import { Scenery, ENV } from './scenery.js';
import { BakuScenery } from './sceneryBaku.js';
import { ModelScenery, loadTrackModel } from './sceneryModel.js';
import { createCar, mergeCar, GEOM } from './carModel.js';
import { loadGT, createGT, gtReady } from './gtModel.js';
import { SafetyCar } from './safetyCar.js';
import { CarPhysics } from './physics.js';
import { Input } from './input.js';
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

const settings = Object.assign({ auto: true, tc: true, abs: true, ghost: true, cam: 0, quality: isTouch ? 'low' : 'high', tiltInvert: false, tiltSens: 22, line: 'full', steer: 'buttons', raceLaps: 5, raceBots: 9, raceStrength: 60, raceStart: 10, damage: 'sim', msgs: false, raceTyre: 'M', track: 'nova', carClass: 'gt', audio: 1, radio: true, f1Team: 'redbull', driveMode: 'sim', arcTow: 1, arcRubber: 1 }, store.get('novaf1.settings') || {});
// modalità di guida: realistica (simulazione) o arcade (driveMode.js)
const ARC = () => settings.driveMode === 'arcade';
// in arcade i danni "simulazione" diventano una barra di salute senza forature né guasti
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
const shadowSize = settings.quality === 'low' ? 1024 : 2048;
sun.shadow.mapSize.set(shadowSize, shadowSize);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
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
const sounds = new Sound();
sounds.level = settings.audio; sounds.radioOn = settings.radio;
// l'audio del browser parte solo dopo un tocco: lo si accende al primo gesto
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => sounds.init(), { capture: true, passive: true });
addEventListener('click', e => { if (e.target.closest && e.target.closest('#menu button, #pause button, #results button, .pitPanel button')) sounds.ui(); }, true);
const input = new Input();
let scenery, car, ghostCar, phys, particles, skids, debris, racingLine, pitLane;
let minimap;

function build() {
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

  car = gtReady() ? createGT(playerCarOpts()) : createCar();
  scene.add(car.root);
  ghostCar = gtReady() ? createGT({ ghost: true }) : createCar({ ghost: true });
  ghostCar.root.visible = false;
  scene.add(ghostCar.root);

  pitLane = new PitLane(track);
  pitLane.build(scene);
  racingLine = new RacingLine(track);
  scene.add(racingLine.build());
  phys = new CarPhysics(track);
  phys.on('impact', onImpact);
  particles = new Particles(scene);
  skids = new SkidMarks(scene);
  debris = new Debris(scene, track);
  phys.hazards = p => debris.contact(p);
  minimap = new Minimap($('minimap'), track);

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
  debris.restore();
  particles.clear();
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
  if (race) for (const c of race.cars) if (c.model) scene.remove(c.model.root);
  if (sc) { sc.dispose(); sc = null; }
  $('scBadge').classList.add('hidden'); scBadgeUntil = -1;
  race = null; coolAI = null; resultsTimer = -1; lastLapWarned = false;
  for (const k in radioSaid) delete radioSaid[k];
  audioPos = 0;
  lastPos = 0; retiredSeen = new Set(); lastFeed = -99;
  document.body.classList.remove('race-mode');
  $('racePos').classList.add('hidden');
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
  for (const c of race.cars) {
    if (c.isPlayer) continue;
    c.model = gtReady() ? createGT(c.team ? { team: c.team, lod: 'mid' } : { primary: c.color, accent: c.accent, lod: 'mid' }) : mergeCar(createCar({ primary: c.color, accent: c.accent }));
    scene.add(c.model.root);
    c.phys.on('impact', e => onImpact(e, c));
    c.phys.hazards = p => debris.contact(p);
    c.skidKey = 4 + c.slot * 4;
    setTyreColor(c.model, c.phys.compound);
    updateModel(c.model, c.phys, 0);
  }
  // safety car (vettura gialla con barra luci)
  const scModel = gtReady() ? createGT({ primary: 0x16171b, accent: 0xf4f4f4, lod: 'mid', safety: true }) : createCar({ primary: 0xf4f4f4, accent: 0x16171b });
  sc = new SafetyCar({ race, track, line: racingLine, debris, scene, model: scModel });
  sc.onEvent = kind => {
    if (kind === 'out') { feed('SAFETY CAR IN PISTA: RIMANETE IN FILA', 'yellow'); sounds.radio('Safety car, safety car. Rallenta e resta in fila, niente sorpassi.'); }
    if (kind === 'in') { feed('SAFETY CAR RIENTRA IN QUESTO GIRO', 'yellow'); sounds.radio('La safety car rientra in questo giro. Scalda le gomme.'); }
    if (kind === 'green') { feed('BANDIERA VERDE: SI TORNA A CORRERE', 'green'); scBadge('GO', 'green', 3); sounds.radio('Bandiera verde! Vai, vai, vai!'); sounds.cheerUp(0.5); }
  };
  scPlayerIdx = -1;
  setTyreColor(car, phys.compound);
  document.body.classList.add('race-mode');
  $('racePos').classList.remove('hidden');
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
  if (race) for (const c of race.cars) {
    if (c.isPlayer || c.gone || c.pit) continue;
    const p = c.phys;
    if (Math.abs(p.x - phys.x) > 250 || Math.abs(p.z - phys.z) > 250) continue;
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
  particles.update(dt);
  debris.update(dt, phys.hint);
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
  const sh = camState.shake * 0.25 + Math.min(1.5, phys.kerbVibe) * 0.018 + Math.min(1, phys.speed / 90) * 0.004;
  camera.position.x += (Math.random() - 0.5) * sh;
  camera.position.y += (Math.random() - 0.5) * sh;
  camera.position.z += (Math.random() - 0.5) * sh;
  const fov = baseFov + Math.min(14, phys.speed * 0.11);
  camState.fov += (fov - camState.fov) * Math.min(1, dt * 3);
  camera.fov = camState.fov;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- HUD
const ledEls = [];
for (let i = 0; i < 15; i++) { const e = document.createElement('i'); $('leds').appendChild(e); ledEls.push(e); }
let hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }

function setSectorsHud(secs, cur = 0) {
  for (let k = 0; k < 3; k++) {
    const el = $('sec' + k);
    el.className = '';
    if (secs[k] != null) el.className = (bestSectors[k] == null || secs[k] <= bestSectors[k] + 1e-6) ? 'purple' : 'yellow';
    else if (k === cur && lap && lap.active) el.className = 'cur';
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
  const hl = ARC() && phys.damageMode !== 'cosmetic' ? `SALUTE ${Math.round(100 * (1 - phys.totalDamage()))}%` : 'DANNI';
  if (hudCache.hl !== hl) { hudCache.hl = hl; document.querySelector('.damage .lbl').textContent = hl; }
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
  loadRecords();
  if (phys) { phys.arcade = ARC(); phys.damageMode = dmMode(); }
  if (racingLine) racingLine.setArcade(ARC());
  refreshSettings(); refreshDriveMode();
}
function refreshDriveMode() {
  document.querySelectorAll('#modeRow [data-mode]').forEach(b => b.classList.toggle('sel', b.dataset.mode === settings.driveMode));
  document.querySelectorAll('.arcadeOnly').forEach(e => e.classList.toggle('hidden', !ARC()));
  document.body.classList.toggle('arcade', ARC());
}
document.querySelectorAll('#modeRow [data-mode]').forEach(b => b.addEventListener('click', () => setDriveMode(b.dataset.mode)));
$('playBtn').addEventListener('click', () => openTrackPicker('trial'));
$('fsBtn').addEventListener('click', goLandscape);
$('resumeBtn').addEventListener('click', () => togglePause(false));
const restart = () => (gameType === 'race' ? startRaceGame() : startGame());
$('restartBtn').addEventListener('click', () => { togglePause(false); restart(); });
$('menuBtn').addEventListener('click', () => { goMenu(); });
$('dnfRestart').addEventListener('click', restart);
$('resAgain').addEventListener('click', startRaceGame);
$('resMenu').addEventListener('click', () => goMenu());

// --- navigazione del menu
const MENU_PAGES = ['menuHome', 'menuTrack', 'menuCar', 'menuRace', 'menuSettings', 'menuHelp', 'menuCredits'];
function showMenuPage(id) { MENU_PAGES.forEach(p => $(p).classList.toggle('hidden', p !== id)); }
$('raceMenuBtn').addEventListener('click', () => openTrackPicker('race'));
$('settingsBtn').addEventListener('click', () => showMenuPage('menuSettings'));
$('helpBtn').addEventListener('click', () => showMenuPage('menuHelp'));
$('creditsBtn').addEventListener('click', () => showMenuPage('menuCredits'));
['settingsBack', 'helpBack', 'creditsBack', 'trackBack'].forEach(id => $(id).addEventListener('click', () => showMenuPage('menuHome')));
$('raceBack').addEventListener('click', () => openCarPicker('race'));
$('carBack').addEventListener('click', () => openTrackPicker(pickMode));
$('raceStartBtn').addEventListener('click', startRaceGame);

// scelta del circuito (cambiare circuito ricarica la pagina e riprende da qui)
let pickMode = 'race';
const trackRecord = id => store.get('novaf1.best.v3' + keyOf(id) + (ARC() ? '.arc' : ''));
function openTrackPicker(m) {
  pickMode = m;
  $('tStepMode').textContent = m === 'race' ? 'GARA' : 'PROVA A TEMPO';
  $('tStepNext').classList.toggle('hidden', m !== 'race');
  const box = $('trackCards');
  box.innerHTML = '';
  for (const t of TRACKS) {
    const b = document.createElement('button');
    b.className = 'card trackCard' + (t.id === settings.track ? ' sel' : '');
    b.dataset.track = t.id;
    const { d, start } = outlinePath(t, 268, 120);
    const rec = trackRecord(t.id);
    b.innerHTML = `<span class="flag">${t.flag.map(c => `<i style="background:${c}"></i>`).join('')}</span>
      <svg viewBox="0 0 268 120" aria-hidden="true"><path d="${d}" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="7" stroke-linejoin="round"/>
      <path d="${d}" fill="none" stroke="#fff" stroke-width="3.2" stroke-linejoin="round"/><circle cx="${start[0]}" cy="${start[1]}" r="5" fill="#ff8a1c"/></svg>
      <span class="cTitle">${t.name.toUpperCase()}</span><span class="cText">${t.place} · ${t.info}</span>
      <span class="tMeta"><span><b>${t.km} km</b>LUNGHEZZA</span><span><b>${t.corners}</b>CURVE</span><span class="tRec"><b>${rec ? fmt(rec.time) : '—'}</b>RECORD</span></span>`;
    b.addEventListener('click', () => pickTrack(t.id));
    box.appendChild(b);
  }
  showMenuPage('menuTrack');
}
function pickTrack(id) {
  if (id !== settings.track) {
    settings.track = id; saveSettings();
    try { sessionStorage.setItem('novaf1.next', 'car-' + pickMode); } catch (e) { /* niente */ }
    location.reload();
    return;
  }
  openCarPicker(pickMode);
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
  car = createGT(playerCarOpts());
  scene.add(car.root);
  setTyreColor(car, phys.compound);
  updateCarVisual(0);
}
// scelta della vettura: GT3 o Formula 1 (cambiare categoria ricarica la pagina)
function openCarPicker(m) {
  pickMode = m;
  $('cStepMode').textContent = m === 'race' ? 'GARA' : 'PROVA A TEMPO';
  $('cStepNext').classList.toggle('hidden', m !== 'race');
  document.querySelectorAll('#carCards .carCard').forEach(b => b.classList.toggle('sel', b.dataset.class === CAR_CLASS));
  renderTeams();
  $('carHint').textContent = IS_F1 ? 'Scegli la scuderia: la vedi subito sulla tua vettura' : 'Tocca GT3 o FORMULA 1';
  showMenuPage('menuCar');
}
function carContinue() {
  if (pickMode === 'race') { showMenuPage('menuRace'); refreshRaceSetup(); }
  else startGame();
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
    try { sessionStorage.setItem('novaf1.next', cls === 'f1' ? 'car-' + pickMode : pickMode); } catch (e) { /* niente */ }
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
  $('raceTitle').textContent = track.name + (IS_F1 ? ' · F1' : ' · GT3');
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

// ---------------------------------------------------------------- loop principale
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const inp = input.update(dt);

  if (input.consume('KeyM')) { sounds.setMuted(!sounds.muted); }
  if (input.consume('KeyP') || input.consume('Escape')) { if (mode === 'pause') togglePause(false); else togglePause(true); }
  if (mode === 'race' || mode === 'countdown') {
    if (input.consume('KeyC')) cycleCam();
  }
  if (mode === 'race' && input.consume('KeyR') && dnfTimer < 0 && !(race && race.player.pit)) rescue();
  if (mode === 'menu' && (input.consume('Enter') || input.consume('Space'))) startGame();

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
      showBanner(gameType === 'race' ? 'VIA! BUONA GARA' : 'VIA! IL TEMPO PARTE AL TRAGUARDO', 'green', 2);
      mode = 'race';
      acc = 0;
    }
  } else if (mode === 'race') {
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 40) { physicsStep(inp); acc -= DT; steps++; }
    checkDetachments();
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

  if (mode !== 'pause') {
    updateCarVisual(mode === 'race' ? dt : 0);
    if (race) for (const c of race.cars) if (c.model) {
      c.model.root.visible = !c.gone;
      if (c.gone) continue;
      updateModel(c.model, c.phys, mode === 'race' ? dt : 0);
      if (mode === 'race') detachParts(c.model, c.phys, c);
      // ombre solo per le vetture vicine
      const near = Math.abs(c.phys.x - phys.x) + Math.abs(c.phys.z - phys.z) < 70;
      if (c.model.shadowOn !== near) { c.model.shadowOn = near; c.model.root.traverse(o => { if (o.isMesh) o.castShadow = near; }); }
    }
    if (sc && mode === 'race') { sc.update(dt); scRules(); }
    updateEffects(mode === 'race' ? dt : dt * 0.5);
    updateGhost();
    racingLine.update(phys.prCG.i, phys.speed, mode === 'menu' ? 'off' : settings.line);
    updateCamera(dt);
    updateAudio(dt);
  }
  if (mode !== 'menu') updateHud(dt);
  updateTouchSteer();

  // l'ombra segue la vettura
  sun.target.position.set(phys.x, phys.y, phys.z);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 200);
  scenery.skyMesh.position.copy(camera.position);
  scenery.update(mode === 'pause' ? 0 : dt);
  renderer.render(scene, camera);
  input.endFrame();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (particles) particles.setScale(h * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
  if (minimap) minimap.resize();
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
  if (next === 'race') { showMenuPage('menuRace'); refreshRaceSetup(); }
  else if (next === 'trial') startGame();
  else if (next === 'car-race' || next === 'car-trial') openCarPicker(next.slice(4));
  window.__game = {
    phys, track, startGame, startRaceGame, settings, scene, camera, get race() { return race; }, get calls() { return renderer.info.render.calls; },
    get mode() { return mode; }, get lap() { return lap; }, get scenery() { return scenery; }, get car() { return car; }, get debris() { return debris; }, get sc() { return sc; }, get info() { return renderer.info.render; },
    skipCountdown() { if (countdown) countdown.t = countdown.out; },
    teleport(i, lateral = 0, speed = 0) { phys.reset(i, lateral, true); const s = track.samples[i]; phys.vx = s.tx * speed; phys.vz = s.tz * speed; camState.init = false; },
  };
  requestAnimationFrame(frame);
}, 30)));
