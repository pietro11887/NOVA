import * as THREE from 'three';
import { clamp, lerp, angleDelta, turnToward } from '../core/utils.js';
import { makeCharacter, animateCharacter } from '../world/models.js';

const TMP = { x: 0, z: 0 };
const V = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.city = game.city;
    this.mesh = makeCharacter({ shirt: 0x1d2b3a, pants: 0x2b2f38, skin: 0xe8bf98 });
    this.mesh.userData.player = true;
    game.scene.add(this.mesh);

    this.x = 0; this.z = 0; this.y = 0;
    this.vy = 0;
    this.a = 0;                 // direzione del corpo
    this.speed = 0;
    this.health = 100;
    this.armor = 0;
    this.money = 250;
    this.weapon = 'fists';
    this.ammo = 0;
    this.car = null;
    this.punchT = 0;
    this.shootCd = 0;
    this.stepT = 0;
    this.dead = false;
    this.respawnT = 0;

    this.camYaw = 0;
    this.camPitch = 0.22;
    this.camDist = 6.2;
    this.indoor = false;
    this.camPos = new THREE.Vector3(0, 5, 10);
    this.camLook = new THREE.Vector3();
  }

  get inCar() { return this.car !== null; }

  place(x, z, a = 0) {
    this.x = x; this.z = z; this.a = a; this.camYaw = a;
    this.mesh.position.set(x, 0, z);
    return this;
  }

  damage(n, cause) {
    if (this.dead) return;
    const toArmor = Math.min(this.armor, n * 0.65);
    this.armor -= toArmor;
    this.health -= (n - toArmor);
    this.game.hud.flash();
    this.game.audio.hurt();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.respawnT = 3.2;
      this.game.onDeath(cause);
    }
  }

  heal(n) { this.health = clamp(this.health + n, 0, 100); }
  addArmor(n) { this.armor = clamp(this.armor + n, 0, 100); }
  pay(n) { this.money = Math.max(0, this.money - n); }
  earn(n) { this.money += n; this.game.audio.cash(); }

  // ------------------------------------------------------------------ loop
  update(dt, input) {
    this.camYaw -= input.look.x;
    this.camPitch = clamp(this.camPitch + (input.invertY ? -1 : 1) * input.look.y, -0.35, 1.15);

    if (this.dead) {
      this.respawnT -= dt;
      animateCharacter(this.mesh, 0, 0, 'down');
      this._camera(dt, true);
      return;
    }

    if (this.inCar) this._driving(dt, input);
    else this._onFoot(dt, input);

    this._camera(dt, false);
    if (this.punchT > 0) this.punchT -= dt * 2.6;
    if (this.shootCd > 0) this.shootCd -= dt;
  }

  _onFoot(dt, input) {
    const fx = input.forward, sx = input.strafe;
    const mag = Math.min(1, Math.hypot(fx, sx));
    const running = input.running;
    const maxSpeed = running ? 6.1 : 2.7;

    if (mag > 0.05) {
      // direzione relativa alla camera
      const dir = Math.atan2(-(fx * -Math.sin(this.camYaw) + sx * Math.cos(this.camYaw)),
                             (fx * Math.cos(this.camYaw) + sx * Math.sin(this.camYaw)));
      this.a = turnToward(this.a, dir, dt * 11);
      this.speed = lerp(this.speed, maxSpeed * mag, clamp(dt * 8, 0, 1));
    } else {
      this.speed = lerp(this.speed, 0, clamp(dt * 12, 0, 1));
    }

    // salto
    if (input.pressed('jump') && this.y <= 0.01) { this.vy = 5.2; this.game.audio.blip(320, 0.08, 'sine', 0.15); }
    this.vy -= 16 * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0) this.vy = 0;

    const nx = this.x + Math.cos(this.a) * this.speed * dt;
    const nz = this.z - Math.sin(this.a) * this.speed * dt;
    this.x = nx; this.z = nz;
    if (this.city.resolve(this.x, this.z, 0.42, TMP)) { this.x = TMP.x; this.z = TMP.z; }
    // il limite del mondo non vale dentro gli interni (che vivono altrove)
    const L = this.city.limit ?? 620;
    this.x = clamp(this.x, -L, L); this.z = clamp(this.z, -L, L);

    // passi
    this.stepT -= dt * this.speed;
    if (this.stepT < 0 && this.y === 0 && this.speed > 0.6) { this.stepT = 1.6; this.game.audio.step(); }

    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.a;
    animateCharacter(this.mesh, this.speed, this.game.time, this.punchT > 0 ? 'walk' : 'walk', this.punchT);
    this.mesh.visible = true;
  }

  _driving(dt, input) {
    const car = this.car;
    const throttle = input.forward;
    const steer = -input.strafe;
    car.update(dt, { throttle, steer, hand: input.braking });
    this.x = car.x; this.z = car.z; this.y = 0;
    this.a = car.a;
    this.mesh.visible = false;
    if (car.lastCrash) {
      const impact = car.lastCrash;
      car.lastCrash = 0;
      this.game.audio.crash(impact);
      if (impact > 11) this.damage(impact * 0.5, 'incidente');
    }
    if (car.health <= 0) {
      this.exitCar(true);
      this.damage(28, 'esplosione');
    }
  }

  // -------------------------------------------------------------- interazioni
  enterCar(car) {
    if (!car || car.driver) return false;
    this.car = car;
    car.driver = 'player';
    car.locked = false;
    this.game.audio.door();
    this.mesh.visible = false;
    return true;
  }

  exitCar(forced = false) {
    const car = this.car;
    if (!car) return;
    car.driver = null;
    car.speed *= 0.2;
    this.car = null;
    car.doorPos(TMP);
    this.x = TMP.x; this.z = TMP.z;
    if (this.city.resolve(this.x, this.z, 0.45, TMP)) { this.x = TMP.x; this.z = TMP.z; }
    this.a = car.a + Math.PI / 2;
    this.speed = 0;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.visible = true;
    this.game.audio.door();
    if (forced) this.damage(6, 'urto');
  }

  /** Pugno o colpo d'arma, a seconda dell'equipaggiamento. */
  attack() {
    if (this.dead || this.inCar) return;
    if (this.weapon === 'pistol' && this.ammo > 0) {
      if (this.shootCd > 0) return;
      this.shootCd = 0.32;
      this.ammo--;
      this.game.audio.shot();
      this.game.tracer(this.x, 1.5, this.z, this.a);
      this.game.hitScan(this, 55, 40);
      this.game.addWanted(1, 'sparo');
    } else {
      if (this.punchT > 0) return;
      this.punchT = 1;
      this.game.audio.punch();
      this.game.melee(this, 2.0, 26);
    }
  }

  // ------------------------------------------------------------------ camera
  _camera(dt, dead) {
    const inCar = this.inCar;
    if (inCar) {
      // si riallinea dietro l'auto quando si guida in avanti
      const behind = this.car.a + Math.PI;
      const align = clamp(Math.abs(this.car.speed) / 12, 0, 1) * (this.car.speed > 0 ? 1 : 0);
      this.camYaw += angleDelta(this.camYaw, behind) * clamp(align * dt * 2.4, 0, 0.14);
    }
    // al chiuso la camera si abbassa e si avvicina, altrimenti finisce nel soffitto
    const dist = this.indoor ? 3.5 : dead ? 7 : inCar ? 8.4 + Math.abs(this.car.speed) * 0.12 : this.camDist;
    const height = this.indoor ? 0.75 : dead ? 3.2 : inCar ? 3.0 : 2.15;
    const tx = this.x, tz = this.z;
    const ty = (inCar ? 1.1 : 1.35) + this.y;

    const cp = Math.cos(this.camPitch);
    V.set(
      tx - Math.cos(this.camYaw) * dist * cp,
      ty + height + Math.sin(this.camPitch) * dist,
      tz + Math.sin(this.camYaw) * dist * cp
    );
    // la camera non entra nei muri
    if (this.city.resolve(V.x, V.z, 0.6, TMP)) { V.x = TMP.x; V.z = TMP.z; }
    V.y = clamp(V.y, 0.9, this.indoor ? 2.9 : 400);

    const k = clamp(dt * (inCar ? 7 : 11), 0, 1);
    this.camPos.lerp(V, k);
    this.camLook.lerp(new THREE.Vector3(tx, ty + 0.5, tz), clamp(dt * 14, 0, 1));
  }

  applyCamera(camera) {
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
  }

  serialize() {
    return { x: this.x, z: this.z, money: this.money, health: this.health, armor: this.armor,
             weapon: this.weapon, ammo: this.ammo };
  }
  restore(s) {
    if (!s) return;
    this.place(s.x ?? 0, s.z ?? 0);
    this.money = s.money ?? 250;
    this.health = s.health ?? 100;
    this.armor = s.armor ?? 0;
    this.weapon = s.weapon ?? 'fists';
    this.ammo = s.ammo ?? 0;
  }
}
