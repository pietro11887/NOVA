import * as THREE from 'three';
import { clamp, pick } from '../core/utils.js';
import { makeCar, CAR_TYPES, CAR_COLORS } from '../world/models.js';

const TMP = { x: 0, z: 0 };

/**
 * Fisica arcade: nessun motore fisico, solo velocita' scalare lungo l'asse
 * dell'auto piu' un po' di sbandata col freno a mano. E' quello che serve
 * per un'auto che risponde bene anche con un joystick virtuale.
 */
export class Vehicle {
  constructor(city, opts = {}) {
    this.city = city;
    this.type = opts.type || pick(Object.keys(CAR_TYPES));
    this.kind = opts.kind || 'civil';
    this.color = opts.color ?? pick(CAR_COLORS);
    if (this.kind === 'police') { this.type = 'suv'; this.color = 0x1c2740; }
    if (this.kind === 'taxi') { this.type = 'sedan'; this.color = 0xf2c832; }

    this.spec = CAR_TYPES[this.type];
    this.mesh = makeCar(this.type, this.color, this.kind);
    this.mesh.userData.vehicle = this;

    this.x = 0; this.z = 0; this.a = 0;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.driver = null;         // 'player' | ped | null
    this.locked = false;

    this.topSpeed = 27 * this.spec.speed;
    this.accel = 11 / this.spec.mass;
  }

  place(x, z, a) {
    this.x = x; this.z = z; this.a = a;
    this.speed = 0;
    this.sync();
    return this;
  }

  get fx() { return Math.cos(this.a); }
  get fz() { return -Math.sin(this.a); }
  get kmh() { return Math.abs(this.speed) * 3.6; }

  /** Punto d'ingresso: fianco sinistro dell'auto. */
  doorPos(out) {
    const sx = -Math.sin(this.a), sz = -Math.cos(this.a);
    out.x = this.x + sx * (this.spec.W / 2 + 0.75);
    out.z = this.z + sz * (this.spec.W / 2 + 0.75);
    return out;
  }

  update(dt, ctrl) {
    const c = ctrl || { throttle: 0, steer: 0, hand: false };
    const sp = this.speed;

    // --- motore / freni
    if (c.throttle > 0) {
      this.speed += c.throttle * this.accel * dt * (sp < 0 ? 2.2 : 1);
    } else if (c.throttle < 0) {
      this.speed += c.throttle * this.accel * dt * (sp > 0 ? 2.0 : 0.55);
    }
    // resistenza
    const drag = 0.5 + (c.throttle === 0 ? 1.4 : 0) + (c.hand ? 5.5 : 0);
    this.speed -= this.speed * drag * dt;
    if (Math.abs(this.speed) < 0.05) this.speed = 0;
    this.speed = clamp(this.speed, -9, this.topSpeed);

    // --- sterzo: piu' stretto a bassa velocita', piu' dolce in corsa
    const grip = clamp(1.15 - Math.abs(this.speed) / 46, 0.34, 1);
    const target = c.steer * 2.35 * grip;
    this.steer += (target - this.steer) * clamp(dt * 9, 0, 1);
    const dir = this.speed >= 0 ? 1 : -1;
    const turnAmount = this.steer * clamp(Math.abs(this.speed) / 4.5, 0, 1) * dir;
    this.a += turnAmount * dt * (c.hand ? 1.7 : 1);

    // --- integrazione
    const nx = this.x + this.fx * this.speed * dt;
    const nz = this.z + this.fz * this.speed * dt;
    this.x = nx; this.z = nz;

    // --- collisione con la citta' (muso e coda)
    const r = this.spec.W * 0.55;
    let bumped = false;
    for (const off of [this.spec.L * 0.34, -this.spec.L * 0.34]) {
      const px = this.x + this.fx * off, pz = this.z + this.fz * off;
      if (this.city.resolve(px, pz, r, TMP)) {
        const dx = TMP.x - px, dz = TMP.z - pz;
        this.x += dx; this.z += dz;
        bumped = true;
      }
    }
    if (bumped) {
      const impact = Math.abs(this.speed);
      if (impact > 4) {
        this.health -= impact * 0.9;
        this.lastCrash = impact;
      }
      this.speed *= -0.22;
    }
    if (!this.city.inBounds(this.x, this.z)) {
      this.speed *= -0.4;
      this.x = clamp(this.x, -600, 600);
      this.z = clamp(this.z, -600, 600);
    }

    this.sync();
  }

  /** Urto tra veicoli: separazione elastica semplificata. */
  collideWith(o) {
    const dx = o.x - this.x, dz = o.z - this.z;
    const d = Math.hypot(dx, dz);
    const rr = (this.spec.L + o.spec.L) * 0.36;
    if (d > rr || d === 0) return 0;
    const push = (rr - d) / 2;
    const nx = dx / d, nz = dz / d;
    this.x -= nx * push; this.z -= nz * push;
    o.x += nx * push; o.z += nz * push;
    const rel = Math.abs(this.speed - o.speed);
    this.speed *= 0.55; o.speed = o.speed * 0.55 + this.speed * 0.25;
    if (rel > 6) { this.health -= rel * 0.5; o.health -= rel * 0.5; }
    return rel;
  }

  sync() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.a;
  }

  setNight(on) { this.mesh.userData.lights.visible = on; }

  /** Lampeggianti della polizia. */
  updateSiren(t) {
    const bar = this.mesh.userData.bar;
    if (bar) bar.material.color.setHex(Math.sin(t * 9) > 0 ? 0xff2020 : 0x2060ff);
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.userData.bodyMat.dispose();
  }
}
