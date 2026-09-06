import * as THREE from 'three';
import { rand, randInt, pick } from '../core/utils.js';

const MARKER_COLOR = 0xffd23f;
const OBJ_COLOR = 0xff9d3f;

function marker(color, radius = 2.4) {
  const g = new THREE.CylinderGeometry(radius, radius, 7, 14, 1, true);
  const m = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = 3.5;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

const JOBS = [
  { type: 'taxi',     title: 'TAXI', desc: 'Carica il cliente e portalo a destinazione.' },
  { type: 'delivery', title: 'CONSEGNA', desc: 'Ritira il pacco e consegnalo in tempo.' },
  { type: 'race',     title: 'GARA DI STRADA', desc: 'Passa per tutti i checkpoint prima dello scadere.' },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.markers = [];
    this.active = null;
    this.objective = null;
    this.objMesh = marker(OBJ_COLOR, 3.2);
    this.objMesh.visible = false;
    game.worldGroup.add(this.objMesh);
    this.completed = 0;
    this._placeJobs();
  }

  _randomRoadPoint(minD = 120, fromX = 0, fromZ = 0) {
    const nodes = this.game.city.roadNodes;
    for (let k = 0; k < 80; k++) {
      const n = nodes[randInt(0, nodes.length - 1)];
      if (Math.hypot(n.x - fromX, n.z - fromZ) > minD) {
        return { x: n.x + rand(-4, 4), z: n.z + rand(-4, 4) };
      }
    }
    const n = nodes[randInt(0, nodes.length - 1)];
    return { x: n.x, z: n.z };
  }

  _placeJobs() {
    for (const job of JOBS) {
      const p = this._randomRoadPoint(60, 0, 0);
      const mesh = marker(MARKER_COLOR);
      mesh.position.set(p.x, 0, p.z);
      this.game.worldGroup.add(mesh);
      this.markers.push({ ...p, job, mesh });
    }
  }

  offerFromBar() {
    if (this.active) { this.game.toast('Hai già un lavoro in corso'); return; }
    this.start(pick(JOBS));
    this.game.hud.hideShop();
    if (this.game.interiors.current) this.game.interiors.exit();
  }

  start(job) {
    const p = this.game.player;
    const stages = [];
    if (job.type === 'taxi') {
      const a = this._randomRoadPoint(40, p.x, p.z);
      const b = this._randomRoadPoint(150, a.x, a.z);
      stages.push({ ...a, r: 6, text: 'Raggiungi il cliente', car: true });
      stages.push({ ...b, r: 7, text: 'Portalo a destinazione', car: true });
      this.reward = 320 + Math.floor(Math.hypot(b.x - a.x, b.z - a.z));
      this.timer = 150;
    } else if (job.type === 'delivery') {
      const a = this._randomRoadPoint(30, p.x, p.z);
      const b = this._randomRoadPoint(170, a.x, a.z);
      stages.push({ ...a, r: 5, text: 'Ritira il pacco' });
      stages.push({ ...b, r: 6, text: 'Consegna il pacco' });
      this.reward = 260 + Math.floor(Math.hypot(b.x - a.x, b.z - a.z) * 1.4);
      this.timer = 170;
    } else {
      let cur = { x: p.x, z: p.z };
      for (let i = 0; i < 5; i++) {
        cur = this._randomRoadPoint(90, cur.x, cur.z);
        stages.push({ ...cur, r: 8, text: `Checkpoint ${i + 1}/5`, car: true });
      }
      this.reward = 900;
      this.timer = 145;
    }
    this.active = { job, stages, stage: 0 };
    this._setObjective();
    this.game.toast(`${job.title}: iniziata!`, 'good');
    this.game.audio.blip(660, 0.12);
  }

  _setObjective() {
    const a = this.active;
    if (!a) { this.objective = null; this.objMesh.visible = false; return; }
    const s = a.stages[a.stage];
    this.objective = s;
    this.objMesh.position.set(s.x, 0, s.z);
    this.objMesh.visible = true;
  }

  fail(reason) {
    if (!this.active) return;
    this.game.toast(`Missione fallita: ${reason}`, 'bad');
    this.active = null;
    this.objective = null;
    this.objMesh.visible = false;
    this.game.hud.mission(null);
  }

  complete() {
    const r = this.reward + Math.floor(this.timer) * 2;
    this.game.player.earn(r);
    this.game.toast(`Missione completata: +$${r}`, 'good');
    this.completed++;
    this.active = null;
    this.objective = null;
    this.objMesh.visible = false;
    this.game.hud.mission(null);
    this.game.save();
  }

  update(dt) {
    const g = this.game, p = g.player;
    const t = g.time;
    this.objMesh.rotation.y = t * 0.8;
    for (const m of this.markers) m.mesh.rotation.y = -t * 0.6;

    if (g.interiors.current) return;

    if (!this.active) {
      g.hud.mission('LAVORI DISPONIBILI',
        'Cerchi gialli = lavori. Insegne verdi = negozi in cui entrare.');
      for (const m of this.markers) {
        if (Math.hypot(m.x - p.x, m.z - p.z) < 4) { this.start(m.job); break; }
      }
      return;
    }

    this.timer -= dt;
    if (this.timer <= 0) { this.fail('tempo scaduto'); return; }

    const s = this.objective;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    const need = s.car && !p.inCar;
    g.hud.mission(this.active.job.title,
      `${s.text} — ${Math.round(d)} m · ${Math.floor(this.timer)}s${need ? ' · serve un veicolo' : ''}`);

    if (d < s.r && !need) {
      this.active.stage++;
      g.audio.blip(880, 0.1);
      if (this.active.stage >= this.active.stages.length) this.complete();
      else {
        this._setObjective();
        g.toast(this.active.job.type === 'race' ? 'Checkpoint!' : 'Fatto, prossima tappa');
      }
    }
  }
}
