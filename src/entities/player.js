import * as THREE from 'three';
import { clamp, lerp, angleDelta, turnToward } from '../core/utils.js';
import { makeCharacter, animateCharacter } from '../world/models.js';
import { WEAPONS, WEAPON_ORDER, isGun } from '../core/weapons.js';

/** Contanti d'inizio partita: abbastanza per provare subito il garage. */
const START_MONEY = 3000;

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
    this.maxHealth = 100;    // la palestra la alza
    this.punchBonus = 0;    // il sacco da boxe rende i pugni piu' pesanti
    this.armor = 0;
    this.money = START_MONEY;
    this.weapon = 'fists';
    this.owned = { fists: true };     // armi in tasca
    this.ammoOf = {};                 // munizioni per arma
    this.car = null;
    this.punchT = 0;
    this.hitT = 0;
    this.shootCd = 0;
    this.stepT = 0;
    this.dead = false;
    this.respawnT = 0;

    this.camYaw = 0;
    this.lookHoldT = 0;
    this.camPitch = 0.22;
    this.camDist = 3.5;
    this.indoor = false;
    this.camPos = new THREE.Vector3(0, 5, 10);
    this.camLook = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
  }

  get inCar() { return this.car !== null; }

  place(x, z, a = 0) {
    this.x = x; this.z = z; this.a = a; this.camYaw = a;
    this.mesh.position.set(x, 0, z);
    return this;
  }

  damage(n, cause) {
    if (this.dead) return;
    this.hitT = 0.42;
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

  heal(n) { this.health = clamp(this.health + n, 0, this.maxHealth); }
  addArmor(n) { this.armor = clamp(this.armor + n, 0, 100); }
  pay(n) { this.money = Math.max(0, this.money - n); }
  earn(n) { this.money += n; this.game.audio.cash(); }

  // ------------------------------------------------------------------ loop
  update(dt, input) {
    // toccando lo schermo per guardarsi intorno, la camera smette di inseguire
    // l'auto per un attimo: se no si combatte col dito
    if (Math.abs(input.look.x) > 0.0005) this.lookHoldT = 1.1;
    this.camYaw -= input.look.x;
    this.camPitch = clamp(this.camPitch + (input.invertY ? -1 : 1) * input.look.y, -0.35, 1.15);

    if (this.dead) {
      this.respawnT -= dt;
      animateCharacter(this.mesh, 0, 0, 'down');
      this._camera(dt, true);
      return;
    }

    /*
     * In taxi si e' passeggeri: la posizione la decide il taxi. Se qui
     * girasse la logica a piedi, il personaggio camminerebbe dentro
     * l'abitacolo e la collisione lo spingerebbe fuori portandosi dietro
     * l'auto — era cosi' che il taxi finiva sul marciapiede durante la corsa.
     */
    if (this.inTaxi) {
      this.speed = 0;
      this.mesh.position.set(this.x, this.y, this.z);
      this.mesh.rotation.y = this.a;
      this._camera(dt, false);
      return;
    }

    if (this.inCar) this._driving(dt, input);
    else this._onFoot(dt, input);

    this._camera(dt, false);
    if (this.punchT > 0) this.punchT -= dt * 2.6;
    if (this.hitT > 0) this.hitT -= dt;
    if (this.shootCd > 0) this.shootCd -= dt;
    if (this.dryT > 0) this.dryT -= dt;
    if (!input.attacking) this._heldSince = false;
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
    let anim = 'walk';
    if (this.hitT > 0 && this.punchT <= 0) {
      anim = 'flinch';
      this.mesh.userData.actionT = 1 - clamp(this.hitT / 0.42, 0, 1);
    } else if (this.weapon === 'pistol' && this.shootCd > 0.05) {
      anim = 'aim';
    }
    animateCharacter(this.mesh, this.speed, this.game.time, this.forceAnim || anim, this.punchT);
    this.mesh.visible = true;
  }

  _driving(dt, input) {
    const car = this.car;
    const throttle = input.throttle !== undefined ? input.throttle : input.forward;
    const steer = -(input.steering !== undefined ? input.steering : input.strafe);
    car.update(dt, { throttle, steer, hand: input.braking });
    this.x = car.x; this.z = car.z; this.y = 0;
    this.a = car.a;
    // in bici si resta in sella e si vede: e' meta' del bello
    const onBike = !!car.spec.bike;
    this.mesh.visible = onBike;
    if (onBike) {
      this.mesh.position.set(car.x - car.fx * 0.16, 0.42, car.z - car.fz * 0.16);
      this.mesh.rotation.y = car.a;
      animateCharacter(this.mesh, Math.abs(car.speed), this.game.time, 'bike', 0);
    }
    if (car.lastCrash) {
      const impact = car.lastCrash;
      car.lastCrash = 0;
      this.game.audio.crash(impact);
      if (impact > 11) this.damage(impact * 0.5, 'incidente');
    }
    if (car.health <= 0) {
      const cx = car.x, cz = car.z;
      this.exitCar(true);
      this.game.explode(cx, cz);
      this.damage(28, 'esplosione');
    }
  }

  // -------------------------------------------------------------- interazioni
  enterCar(car) {
    if (!car || car.driver) return false;
    this.car = car;
    car.driver = 'player';
    car.locked = false;
    // la camera si mette subito dietro l'auto, senza la giravolta iniziale
    this.camYaw = car.a;
    this.lookHoldT = 0;
    this.game.audio.door();
    this.mesh.visible = false;
    return true;
  }

  exitCar(forced = false) {
    const car = this.car;
    if (!car) return;
    car.driver = null;
    car.setVelocity(car.speed * 0.2, 0);
    this.car = null;
    car.doorPos(TMP);
    this.x = TMP.x; this.z = TMP.z;
    if (this.city.resolve(this.x, this.z, 0.45, TMP)) { this.x = TMP.x; this.z = TMP.z; }
    // si scende guardando nella stessa direzione dell'auto: la camera resta
    // dietro le spalle invece di finire dentro la carrozzeria
    this.a = car.a;
    this.speed = 0;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.visible = true;
    this.game.audio.door();
    if (forced) this.damage(6, 'urto');
  }

  // ------------------------------------------------------------------ armi
  get spec() { return WEAPONS[this.weapon] || WEAPONS.fists; }
  get ammo() { return this.ammoOf[this.weapon] ?? 0; }
  set ammo(v) { this.ammoOf[this.weapon] = Math.max(0, v | 0); }

  /** Aggiunge un'arma (e le munizioni di dotazione) e la equipaggia. */
  giveWeapon(id, ammo) {
    const w = WEAPONS[id];
    if (!w) return;
    this.owned[id] = true;
    if (isGun(id)) {
      this.ammoOf[id] = Math.min(w.ammoMax, (this.ammoOf[id] || 0) + (ammo ?? w.free ?? 0));
    }
    this.weapon = id;
  }

  addAmmo(id, n) {
    const w = WEAPONS[id];
    if (!w || !isGun(id)) return 0;
    const before = this.ammoOf[id] || 0;
    this.ammoOf[id] = Math.min(w.ammoMax, before + n);
    return this.ammoOf[id] - before;
  }

  /** Scorre le armi che hai davvero addosso (con munizioni se sono da fuoco). */
  cycleWeapon(dir = 1) {
    const list = WEAPON_ORDER.filter((id) => this.owned[id] && (!isGun(id) || this.ammoOf[id] > 0));
    if (list.length < 2) return this.weapon;
    let i = list.indexOf(this.weapon);
    if (i < 0) i = 0;
    this.weapon = list[(i + dir + list.length) % list.length];
    this.game.audio.ui();
    return this.weapon;
  }

  /** Sceglie l'arma dello slot (tasti 1..8): se non ce l'hai non succede nulla. */
  selectSlot(slot) {
    const id = WEAPON_ORDER.find((k) => WEAPONS[k].slot === slot - 1 && this.owned[k]);
    if (!id || id === this.weapon) return;
    if (isGun(id) && !this.ammoOf[id]) { this.game.toast('Senza munizioni'); return; }
    this.weapon = id;
    this.game.audio.ui();
  }

  /** Pugno secco, qualunque cosa tu abbia in mano (tasto destro). */
  punch() {
    if (this.dead) return;
    if (this.inCar) { this.game.audio.horn(); return; }
    if (this.punchT > 0 || this.shootCd > 0) return;
    if (this.speed < 1.2) this.a = this.camYaw;
    const f = WEAPONS.fists;
    this.punchT = 1;
    this.shootCd = f.rate;
    this.game.audio.punch();
    this.game.melee(this, f.range, f.dmg + this.punchBonus, f.wanted);
  }

  /** Pugno o colpo d'arma, a seconda dell'equipaggiamento. */
  attack(fresh = true) {
    if (this.dead || this.inCar) return;
    // da fermi si mira dove guarda la camera: sparare "di lato" e' frustrante
    if (this.speed < 1.2) this.a = this.camYaw;
    const w = this.spec;

    if (w.kind === 'melee') {
      if (this.punchT > 0 || this.shootCd > 0) return;
      this.punchT = 1;
      this.shootCd = w.rate;
      this.game.audio.punch();
      this.game.melee(this, w.range, w.dmg + this.punchBonus, w.wanted);
      return;
    }

    // le armi semiautomatiche sparano un colpo per pressione
    if (!w.auto && !fresh && this._heldSince) return;
    this._heldSince = true;
    if (this.shootCd > 0) return;
    if (this.ammo <= 0) {
      // clic a vuoto: si sente che sei a secco
      if (this.dryT === undefined || this.dryT <= 0) {
        this.dryT = 0.5;
        this.game.audio.blip(150, 0.04, 'square', 0.12);
        this.game.toast('Senza munizioni');
      }
      return;
    }
    this.shootCd = w.rate;
    this.ammo = this.ammo - 1;

    if (w.kind === 'launcher') {
      this.game.audio.noise(0.5, 220, 0.55);
      this.game.launchRocket(this, w);
      this.game.addWanted(w.wanted, 'lanciarazzi');
      return;
    }

    this.game.audio.shot();
    const shots = w.pellets || 1;
    for (let i = 0; i < shots; i++) {
      const a = this.a + (Math.random() - 0.5) * (w.spread || 0) * (shots > 1 ? 2 : 1);
      this.game.tracer(this.x, 1.5, this.z, a, w.range);
      this.game.hitScan(this, w.range, w.dmg, a);
    }
    this.game.addWanted(w.wanted, 'sparo');
  }

  // ------------------------------------------------------------------ camera
  _camera(dt, dead) {
    const inCar = this.inCar;
    if (inCar) {
      // La camera guarda dove punta l'auto: camYaw e' la direzione di vista e
      // l'auto avanza verso (cos a, -sin a), quindi il bersaglio e' esattamente
      // car.a. (Prima era car.a + PI: appena partivi la vista girava all'indietro.)
      if (this.lookHoldT > 0) this.lookHoldT -= dt;
      else {
        const sp = Math.abs(this.car.speed);
        // ferma non insegue, cosi' puoi guardarti intorno; in movimento segue subito
        const align = clamp((sp - 0.6) / 5, 0, 1);
        this.camYaw += angleDelta(this.camYaw, this.car.a) * clamp(align * dt * 6.5, 0, 0.3);
      }
    }
    // al chiuso la camera si abbassa e si avvicina, altrimenti finisce nel soffitto
    const bike = inCar && this.car.spec.bike;
    const dist = this.indoor ? 3.4 : dead ? 5.0
      : bike ? 4.0 + Math.abs(this.car.speed) * 0.06
      : inCar ? 5.7 + Math.abs(this.car.speed) * 0.08 : this.camDist;
    const height = this.indoor ? 0.8 : dead ? 2.4 : bike ? 1.6 : inCar ? 1.95 : 1.5;
    const tx = this.x, tz = this.z;
    const ty = (inCar ? 1.0 : 1.25) + this.y;

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
    // guidando si guarda avanti all'auto, non il tetto
    const ahead = inCar ? 3.5 + Math.abs(this.car.speed) * 0.25 : 0;
    this._lookTarget.set(tx + Math.cos(this.camYaw) * ahead, ty + (inCar ? 0.9 : 0.5),
                         tz - Math.sin(this.camYaw) * ahead);
    this.camLook.lerp(this._lookTarget, clamp(dt * 14, 0, 1));
  }

  applyCamera(camera) {
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
  }

  serialize() {
    return { x: this.x, z: this.z, money: this.money, health: this.health, armor: this.armor,
             maxHealth: this.maxHealth, punchBonus: this.punchBonus,
             weapon: this.weapon, owned: this.owned, ammoOf: this.ammoOf };
  }
  restore(s) {
    if (!s) return;
    this.place(s.x ?? 0, s.z ?? 0);
    this.money = s.money ?? START_MONEY;
    this.maxHealth = s.maxHealth ?? 100;
    this.punchBonus = s.punchBonus ?? 0;
    this.health = s.health ?? 100;
    this.armor = s.armor ?? 0;
    this.weapon = s.weapon ?? 'fists';
    this.owned = s.owned ?? { fists: true, ...(s.weapon === 'pistol' ? { pistol: true } : {}) };
    this.ammoOf = s.ammoOf ?? (s.ammo ? { pistol: s.ammo } : {});
    if (!WEAPONS[this.weapon]) this.weapon = 'fists';
    this.ammo = s.ammo ?? 0;
  }
}
