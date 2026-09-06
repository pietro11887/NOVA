import * as THREE from 'three';
import { clamp, rand, randInt, pick, turnToward } from '../core/utils.js';
import { makeCharacter, animateCharacter, randomPedColors } from '../world/models.js';
import { CFG } from '../core/config.js';

const TMP = { x: 0, z: 0 };

export const CHATTER = [
  'Hai visto che traffico oggi?',
  'Il caffè qui è il migliore della città.',
  'Domani mi licenzio, giuro.',
  'Occhio, guida come un pazzo!',
  'Mi serve un passaggio…',
  'Che caldo assurdo.',
];

export class Ped {
  constructor(city, role = 'civil') {
    this.city = city;
    this.role = role;
    const colors = role === 'cop'
      ? { shirt: 0x1e2a44, pants: 0x141a28, skin: undefined }
      : randomPedColors();
    this.mesh = makeCharacter(colors);
    this.mesh.userData.ped = this;
    this.x = 0; this.z = 0; this.a = 0;
    this.speed = 0;
    this.state = 'walk';
    this.timer = 0;
    this.node = null;
    this.target = null;
    this.offset = rand(-0.9, 0.9);
    this.baseSpeed = role === 'cop' ? 5.4 : rand(1.1, 1.9);
    this.health = role === 'cop' ? 60 : 30;
    this.shootCd = rand(0.5, 2);
    this.talkT = 0;
  }

  spawnAt(node) {
    this.node = node;
    this.x = node.x + rand(-0.7, 0.7);
    this.z = node.z + rand(-0.7, 0.7);
    this._nextTarget();
    this.state = 'walk';
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.z = 0;
    this.health = this.role === 'cop' ? 60 : 30;
    return this;
  }

  spawnFree(x, z) {
    this.x = x; this.z = z;
    this.node = null; this.target = null;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.z = 0;
    return this;
  }

  _nextTarget() {
    const nodes = this.city.walkNodes;
    if (!this.node) { this.node = this.city.randomWalkNode(this.x, this.z, 0, 60); }
    const links = this.node.links;
    let idx = links[randInt(0, links.length - 1)];
    if (links.length > 1 && this.prev !== undefined && idx === this.prev && Math.random() < 0.85) {
      idx = links[(links.indexOf(idx) + 1) % links.length];
    }
    this.prev = nodes.indexOf(this.node);
    this.target = nodes[idx];
  }

  knockDown(game, from) {
    if (this.state === 'down') return;
    this.state = 'down';
    this.timer = rand(7, 12);
    this.speed = 0;
    game.audio.punch();
    if (from) game.alarm(this.x, this.z, 22);
  }

  hit(dmg, game, from) {
    this.health -= dmg;
    if (this.health <= 0) this.knockDown(game, from);
    else if (this.role !== 'cop') this.panic(game, from);
    game.alarm(this.x, this.z, 26);
  }

  panic(game, from) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.timer = rand(4, 8);
    this.fleeX = from ? from.x : this.x + rand(-5, 5);
    this.fleeZ = from ? from.z : this.z + rand(-5, 5);
    if (Math.random() < 0.25) game.subtitle(pick(['Aiuto!', 'Chiamate la polizia!', 'È impazzito!']));
  }

  update(dt, game) {
    const p = game.player;
    switch (this.state) {
      case 'down': {
        this.timer -= dt;
        animateCharacter(this.mesh, 0, game.time, 'down');
        this.mesh.position.set(this.x, 0.35, this.z);
        return;
      }
      case 'idle': {
        this.timer -= dt;
        this.speed = clamp(this.speed - dt * 4, 0, 10);
        this.talkT -= dt;
        // ogni tanto uno dei bot fermi dice la sua, se sei abbastanza vicino
        if (this.talkT <= 0 && this.role === 'civil') {
          this.talkT = 6;
          if (Math.hypot(this.x - p.x, this.z - p.z) < 11 && Math.random() < 0.2) game.subtitle(pick(CHATTER));
        }
        if (this.timer <= 0) { this.state = 'walk'; this._nextTarget(); }
        break;
      }
      case 'flee': {
        this.timer -= dt;
        const dx = this.x - this.fleeX, dz = this.z - this.fleeZ;
        const d = Math.hypot(dx, dz) || 1;
        this.a = turnToward(this.a, Math.atan2(-dz / d, dx / d), dt * 8);
        this.speed = 5.2;
        if (this.timer <= 0) { this.state = 'walk'; this._nextTarget(); }
        break;
      }
      case 'chase': {   // solo poliziotti
        const dx = p.x - this.x, dz = p.z - this.z;
        const d = Math.hypot(dx, dz) || 1;
        this.a = turnToward(this.a, Math.atan2(-dz / d, dx / d), dt * 7);
        this.speed = d > 2.4 ? this.baseSpeed : 0;
        this.shootCd -= dt;
        if (d < 22 && this.shootCd <= 0 && !p.dead) {
          this.shootCd = rand(1.1, 2.4);
          game.audio.shot();
          game.tracer(this.x, 1.4, this.z, this.a);
          if (d < 18 && Math.random() < 0.55) p.damage(rand(4, 9), 'polizia');
        }
        if (d > 90) { this.state = 'walk'; this._nextTarget(); }
        break;
      }
      default: {        // walk
        if (!this.target) { this._nextTarget(); break; }
        const tx = this.target.x + this.offset, tz = this.target.z + this.offset;
        const dx = tx - this.x, dz = tz - this.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.1) {
          this.node = this.target;
          if (Math.random() < 0.12) { this.state = 'idle'; this.timer = rand(1.5, 5); }
          else this._nextTarget();
        } else {
          this.a = turnToward(this.a, Math.atan2(-dz / d, dx / d), dt * 5);
          this.speed = this.baseSpeed;
        }
        // scansa il giocatore a piedi
        const pdx = this.x - p.x, pdz = this.z - p.z;
        const pd = Math.hypot(pdx, pdz);
        if (pd < 1.2 && !p.inCar) { this.x += (pdx / (pd || 1)) * dt * 2; this.z += (pdz / (pd || 1)) * dt * 2; }
        break;
      }
    }

    this.x += Math.cos(this.a) * this.speed * dt;
    this.z -= Math.sin(this.a) * this.speed * dt;
    if (this.city.resolve(this.x, this.z, 0.4, TMP)) { this.x = TMP.x; this.z = TMP.z; }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.a;
    animateCharacter(this.mesh, this.speed, game.time + this.offset * 3, 'walk', 0);
  }
}

/** Gestisce la popolazione: ne tiene viva solo quella vicina al giocatore. */
export class PedManager {
  constructor(game, max) {
    this.game = game;
    this.max = max;
    this.peds = [];
    for (let i = 0; i < max; i++) {
      const ped = new Ped(game.city);
      ped.spawnAt(game.city.randomWalkNode(0, 0, 8, 130));
      game.worldGroup.add(ped.mesh);
      this.peds.push(ped);
    }
  }

  update(dt) {
    const p = this.game.player;
    for (const ped of this.peds) {
      const d = Math.hypot(ped.x - p.x, ped.z - p.z);
      if (d > CFG.STREAM_RADIUS || (ped.state === 'down' && ped.timer <= 0)) {
        ped.spawnAt(this.game.city.randomWalkNode(p.x, p.z, 32, 120));
        continue;
      }
      // i bot lontani si aggiornano a passo ridotto (risparmio CPU su mobile)
      if (d > 90 && (this.game.frame + ped.offset * 10 | 0) % 3 !== 0) continue;
      ped.update(d > 90 ? dt * 3 : dt, this.game);
    }
  }

  /** Pedone piu' vicino a un punto, escludendo quelli gia' a terra. */
  nearest(x, z, maxD = 3) {
    let best = null, bd = maxD * maxD;
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      const dd = (ped.x - x) ** 2 + (ped.z - z) ** 2;
      if (dd < bd) { bd = dd; best = ped; }
    }
    return best;
  }

  alarm(x, z, radius) {
    for (const ped of this.peds) {
      if (ped.role === 'cop' || ped.state === 'down') continue;
      if (Math.hypot(ped.x - x, ped.z - z) < radius) ped.panic(this.game, { x, z });
    }
  }
}

