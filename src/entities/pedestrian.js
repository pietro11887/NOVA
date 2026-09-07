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
  'Ti richiamo dopo, va bene?',
];

const SCARED = ['Aiuto!', 'Chiamate la polizia!', 'È impazzito!', 'Scappate!', 'Non farmi male!'];
const ANGRY = ['Adesso vediamo!', 'Ti sei rotto la testa?', 'Vieni qui!', 'Sei morto!'];
const NOSY = ['Sto filmando tutto!', 'Ho chiamato la polizia!', 'Guarda che roba…'];

/** Cosa fa un pedone fermo: sono i dettagli che rendono viva una strada. */
const ACTIVITIES = ['talk', 'phone', 'smoke', 'lean', 'wave', 'stand'];

export class Ped {
  constructor(city, role = 'civil') {
    this.city = city;
    this.role = role;
    const colors = role === 'cop'
      ? { shirt: 0x1e2a44, pants: 0x141a28 }
      : randomPedColors();
    this.mesh = makeCharacter(colors);
    this.mesh.userData.ped = this;
    this.x = 0; this.z = 0; this.a = 0;
    this.speed = 0;
    this.state = 'walk';
    this.activity = 'stand';
    this.timer = 0;
    this.actionT = 0;
    this.node = null;
    this.target = null;
    this.offset = rand(-0.9, 0.9);
    this.baseSpeed = role === 'cop' ? 5.4 : rand(1.1, 1.9);
    this.maxHealth = role === 'cop' ? 60 : 34;
    this.health = this.maxHealth;
    this.shootCd = rand(0.5, 2);
    this.punchT = 0;
    this.punchCd = 0;
    this.talkT = 0;
    this.reportT = 0;
    // carattere: decide come reagisce quando succede qualcosa
    this.mood = role === 'cop' ? 'brave' : pick(
      ['nervous', 'nervous', 'nervous', 'nosy', 'nosy', 'brave', 'calm']);
  }

  spawnAt(node) {
    this.node = node;
    this.x = node.x + rand(-0.7, 0.7);
    this.z = node.z + rand(-0.7, 0.7);
    this._nextTarget();
    this.state = 'walk';
    this.bench = null;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.z = 0;
    this.health = this.maxHealth;
    return this;
  }

  spawnFree(x, z) {
    this.x = x; this.z = z;
    this.node = null; this.target = null;
    this.bench = null;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.z = 0;
    return this;
  }

  /** Seduto su una panchina: resta li' finche' non lo si disturba. */
  sitAt(bench) {
    this.spawnFree(bench.x + Math.cos(bench.dir) * 0.1, bench.z - Math.sin(bench.dir) * 0.1);
    this.bench = bench;
    this.a = bench.dir + Math.PI;
    this.state = 'sit';
    this.timer = rand(20, 60);
    this.speed = 0;
    return this;
  }

  _nextTarget() {
    const nodes = this.city.walkNodes;
    if (!this.node) this.node = this.city.randomWalkNode(this.x, this.z, 0, 60);
    const links = this.node.links;
    let idx = links[randInt(0, links.length - 1)];
    if (links.length > 1 && this.prev !== undefined && idx === this.prev && Math.random() < 0.85) {
      idx = links[(links.indexOf(idx) + 1) % links.length];
    }
    this.prev = nodes.indexOf(this.node);
    this.target = nodes[idx];
  }

  // ------------------------------------------------------------- reazioni
  knockDown(game, from) {
    if (this.state === 'down') return;
    this.state = 'down';
    this.bench = null;
    this.timer = rand(3.5, 7);
    this.speed = 0;
    this.punchT = 0;
    game.audio.punch();
    if (from) game.alarm(this.x, this.z, 26, this);
  }

  /** Colpo ricevuto: prima il sussulto, poi la reazione secondo il carattere. */
  hit(dmg, game, from) {
    this.health -= dmg;
    this.bench = null;
    if (this.health <= 0) { this.knockDown(game, from); return; }
    this.state = 'flinch';
    this.actionT = 0;
    this.timer = 0.38;
    this.attacker = from || null;
    this.speed = 0;
    game.alarm(this.x, this.z, 26, this);
  }

  /** Decide cosa fare appena finito il sussulto. */
  _react(game) {
    const p = game.player;
    const close = Math.hypot(this.x - p.x, this.z - p.z) < 9;
    this.state = 'walk';   // esce dal sussulto, altrimenti panic() lo blocca
    if (this.role === 'cop') { this.state = 'chase'; return; }
    if (this.mood === 'brave' && close && this.health > this.maxHealth * 0.45) {
      this.state = 'fight';
      this.timer = rand(6, 12);
      if (Math.random() < 0.6) game.subtitle(pick(ANGRY));
    } else {
      this.panic(game, this.attacker || p);
    }
  }

  panic(game, from) {
    if (this.state === 'down' || this.state === 'flinch') return;
    this.foe = null;
    this.state = 'flee';
    this.bench = null;
    this.timer = rand(4, 9);
    this.fleeX = from ? from.x : this.x + rand(-5, 5);
    this.fleeZ = from ? from.z : this.z + rand(-5, 5);
    if (Math.random() < 0.25) game.subtitle(pick(SCARED));
  }

  /** Il curioso si ferma a guardare (e magari chiama la polizia). */
  watch(game, x, z) {
    if (this.state === 'down' || this.state === 'flinch' || this.state === 'fight') return;
    this.state = 'watch';
    this.bench = null;
    this.timer = rand(4, 8);
    this.reportT = rand(2.5, 5);
    this.watchX = x; this.watchZ = z;
    this.speed = 0;
  }

  // ------------------------------------------------------------------ loop
  update(dt, game) {
    const p = game.player;
    if (this.punchT > 0) this.punchT -= dt * 2.4;
    if (this.punchCd > 0) this.punchCd -= dt;
    let anim = 'walk';

    switch (this.state) {
      case 'down': {
        this.timer -= dt;
        // chi non e' stato ridotto male si rialza e scappa
        if (this.timer <= 0 && this.health > -12) { this.state = 'getup'; this.actionT = 0; }
        anim = 'down';
        break;
      }
      case 'getup': {
        this.actionT += dt * 1.1;
        anim = 'getup';
        if (this.actionT >= 1) {
          this.health = Math.max(this.health, this.maxHealth * 0.5);
          this.panic(game, p);
        }
        break;
      }
      case 'flinch': {
        this.timer -= dt;
        this.actionT = 1 - clamp(this.timer / 0.38, 0, 1);
        anim = 'flinch';
        if (this.timer <= 0) this._react(game);
        break;
      }
      case 'fight': {
        // di solito se la prende col giocatore, ma puo' avere un altro bersaglio
        const foe = (this.foe && this.foe.state !== 'down' && this.foe.health > -5) ? this.foe : p;
        const dx = foe.x - this.x, dz = foe.z - this.z;
        const d = Math.hypot(dx, dz) || 1;
        this.a = turnToward(this.a, Math.atan2(-dz / d, dx / d), dt * 8);
        this.speed = d > 1.9 ? 3.4 : 0;
        this.timer -= dt;
        if (d < 2.2 && this.punchCd <= 0 && !foe.dead) {
          this.punchCd = rand(0.9, 1.5);
          this.punchT = 1;
          game.audio.punch();
          if (foe === p) p.damage(rand(5, 9), 'rissa');
          else foe.hit(rand(4, 8), game, this);
        }
        if (this.timer <= 0 || this.health < this.maxHealth * 0.4 || d > 28) { this.foe = null; this.panic(game, foe); }
        anim = 'fight';
        break;
      }
      case 'watch': {
        this.timer -= dt;
        this.reportT -= dt;
        const dx = this.watchX - this.x, dz = this.watchZ - this.z;
        const d = Math.hypot(dx, dz) || 1;
        this.a = turnToward(this.a, Math.atan2(-dz / d, dx / d), dt * 5);
        this.speed = 0;
        if (this.reportT <= 0 && this.mood === 'nosy') {
          this.reportT = 999;
          if (game.witnessCall(this)) game.subtitle(pick(NOSY));
        }
        if (this.timer <= 0) { this.state = 'walk'; this._nextTarget(); }
        anim = 'watch';
        break;
      }
      case 'sit': {
        this.timer -= dt;
        this.speed = 0;
        if (this.timer <= 0) { this.state = 'walk'; this.bench = null; this._nextTarget(); }
        anim = 'sit';
        break;
      }
      case 'idle': {
        this.timer -= dt;
        this.speed = clamp(this.speed - dt * 4, 0, 10);
        this.talkT -= dt;
        if (this.talkT <= 0 && this.role === 'civil' && this.activity === 'talk') {
          this.talkT = 5;
          if (Math.hypot(this.x - p.x, this.z - p.z) < 12 && Math.random() < 0.35) {
            game.subtitle(pick(CHATTER));
          }
        }
        if (this.timer <= 0) { this.state = 'walk'; this._nextTarget(); }
        anim = this.activity === 'stand' ? 'walk' : this.activity;
        break;
      }
      case 'flee': {
        this.timer -= dt;
        const dx = this.x - this.fleeX, dz = this.z - this.fleeZ;
        const d = Math.hypot(dx, dz) || 1;
        this.a = turnToward(this.a, Math.atan2(-dz / d, dx / d), dt * 8);
        this.speed = 5.4;
        if (this.timer <= 0) { this.state = 'walk'; this._nextTarget(); }
        anim = 'panic';
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
        anim = d < 24 ? 'aim' : 'walk';
        if (anim === 'aim' && this.speed > 0.5) anim = 'walk';
        break;
      }
      default: {        // walk
        if (!this.target) { this._nextTarget(); break; }
        const tx = this.target.x + this.offset, tz = this.target.z + this.offset;
        const dx = tx - this.x, dz = tz - this.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.1) {
          this.node = this.target;
          if (Math.random() < 0.16) {
            // sosta con un'attivita': chi telefona, chi fuma, chi chiacchiera
            this.state = 'idle';
            this.timer = rand(2.5, 7);
            this.activity = pick(ACTIVITIES);
            const near = game.peds.nearest(this.x, this.z, 3.2, this);
            if (near && near.state === 'idle') { this.activity = 'talk'; near.activity = 'talk'; }
          } else this._nextTarget();
        } else {
          this.a = turnToward(this.a, Math.atan2(-dz / d, dx / d), dt * 5);
          this.speed = this.baseSpeed;
        }
        const pdx = this.x - p.x, pdz = this.z - p.z;
        const pd = Math.hypot(pdx, pdz);
        if (pd < 1.2 && !p.inCar) { this.x += (pdx / (pd || 1)) * dt * 2; this.z += (pdz / (pd || 1)) * dt * 2; }
        break;
      }
    }

    if (this.state !== 'sit' && this.state !== 'down') {
      this.x += Math.cos(this.a) * this.speed * dt;
      this.z -= Math.sin(this.a) * this.speed * dt;
      if (this.city.resolve(this.x, this.z, 0.4, TMP)) { this.x = TMP.x; this.z = TMP.z; }
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.a;
    this.mesh.userData.actionT = this.actionT;
    animateCharacter(this.mesh, this.speed, game.time + this.offset * 3, anim, this.punchT);
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

  /** Ricolloca un bot: a volte lo fa nascere seduto su una panchina libera. */
  _recycle(ped, px, pz) {
    const benches = this.game.city.benches;
    if (benches && benches.length && Math.random() < 0.22) {
      for (let k = 0; k < 12; k++) {
        const b = benches[(Math.random() * benches.length) | 0];
        const d = Math.hypot(b.x - px, b.z - pz);
        if (d > 25 && d < 120 && !this.peds.some((o) => o.bench === b)) { ped.sitAt(b); return; }
      }
    }
    ped.spawnAt(this.game.city.randomWalkNode(px, pz, 32, 120));
  }

  update(dt) {
    const p = this.game.player;
    for (const ped of this.peds) {
      const d = Math.hypot(ped.x - p.x, ped.z - p.z);
      const spent = ped.state === 'down' && ped.timer <= 0 && ped.health <= -12;
      // i bot impegnati in un evento non vengono riciclati sotto il naso
      if (!ped.event && (d > CFG.STREAM_RADIUS || spent)) { this._recycle(ped, p.x, p.z); continue; }
      if (d > 90 && (this.game.frame + ped.offset * 10 | 0) % 3 !== 0) continue;
      ped.update(d > 90 ? dt * 3 : dt, this.game);
    }
  }

  /** Pedone piu' vicino a un punto, escludendo quelli gia' a terra. */
  nearest(x, z, maxD = 3, exclude = null) {
    let best = null, bd = maxD * maxD;
    for (const ped of this.peds) {
      if (ped.state === 'down' || ped === exclude) continue;
      const dd = (ped.x - x) ** 2 + (ped.z - z) ** 2;
      if (dd < bd) { bd = dd; best = ped; }
    }
    return best;
  }

  /**
   * Qualcosa e' successo: chi e' vicino reagisce secondo il carattere.
   * Chi scappa, chi resta a guardare col telefono, chi si accuccia.
   */
  alarm(x, z, radius, source = null) {
    for (const ped of this.peds) {
      if (ped.role === 'cop' || ped === source) continue;
      if (ped.state === 'down' || ped.state === 'getup' || ped.state === 'fight') continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d > radius) continue;
      if (d < radius * 0.45 || ped.mood === 'nervous') ped.panic(this.game, { x, z });
      else if (ped.mood === 'nosy') ped.watch(this.game, x, z);
      else if (ped.mood === 'brave' && d < 12) {
        ped.state = 'fight';
        ped.timer = rand(5, 10);
      } else ped.watch(this.game, x, z);
    }
  }
}
