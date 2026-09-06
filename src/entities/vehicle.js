import * as THREE from 'three';
import { clamp, lerp, pick } from '../core/utils.js';
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
    if (this.kind === 'ambulance') { this.type = 'ambulance'; this.color = 0xf2f4f6; }
    if (this.kind === 'bus') { this.type = 'bus'; this.color = pick([0x2f6fd0, 0xd8dce0, 0x2b8f5f]); }

    this.spec = CAR_TYPES[this.type];
    this.mesh = makeCar(this.type, this.color, this.kind);
    this.mesh.userData.vehicle = this;

    this.x = 0; this.z = 0; this.a = 0;
    this.speed = 0;      // componente longitudinale, usata da HUD e IA
    this.vx = 0; this.vz = 0;
    this.steer = 0;
    this.slip = 0;
    this.health = 100;
    this.driver = null;         // 'player' | ped | null
    this.locked = false;

    this.topSpeed = 27 * this.spec.speed;
    this.accel = 11 / this.spec.mass;
    this.brake = 20 / this.spec.mass;
  }

  place(x, z, a) {
    this.x = x; this.z = z; this.a = a;
    this.speed = 0;
    this.vx = 0; this.vz = 0;
    this.steer = 0;
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
    const spec = this.spec;

    // --- assi del veicolo
    const fx = this.fx, fz = this.fz;      // avanti
    const rx = Math.sin(this.a), rz = Math.cos(this.a);   // destra
    let vLong = this.vx * fx + this.vz * fz;
    let vLat = this.vx * rx + this.vz * rz;

    // --- sterzo: angolo delle ruote, non rotazione diretta della scocca.
    // A velocita' alta l'angolo massimo si riduce, altrimenti basta un
    // tocco per mandare l'auto in testacoda.
    const maxSteer = lerp(0.46, 0.11, clamp(Math.abs(vLong) / 28, 0, 1));
    this.steer += (c.steer * maxSteer - this.steer) * clamp(dt * 7, 0, 1);

    // --- motore e freni
    if (c.throttle > 0) vLong += this.accel * c.throttle * dt * (vLong < -0.5 ? 2.2 : 1);
    else if (c.throttle < 0) vLong += c.throttle * (vLong > 0.5 ? this.brake : this.accel * 0.5) * dt;
    const rolling = 0.35 + (c.throttle === 0 ? 0.75 : 0) + (c.hand ? 1.5 : 0);
    vLong -= vLong * rolling * dt;
    if (Math.abs(vLong) < 0.06) vLong = 0;
    vLong = clamp(vLong, -9, this.topSpeed);

    // --- imbardata dal modello a bicicletta: la rotazione dipende da
    //     quanto si va, non solo da quanto si gira il volante
    const wheelbase = spec.L * 0.58;
    const yawRate = (vLong / wheelbase) * Math.tan(this.steer);
    this.a += yawRate * dt;

    // --- aderenza laterale: un po' di scivolamento, tanto col freno a mano
    vLat += vLong * yawRate * dt * (c.hand ? 0.85 : 0.3);
    const grip = c.hand ? 1.3 : 8.5;
    vLat -= vLat * clamp(grip * dt, 0, 1);
    this.slip = Math.abs(vLat);

    // --- integrazione
    this.vx = fx * vLong + rx * vLat;
    this.vz = fz * vLong + rz * vLat;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.speed = vLong;

    // --- collisione con la citta' (muso e coda)
    const r = spec.W * 0.5;
    let bumped = false;
    for (const off of [spec.L * 0.34, -spec.L * 0.34]) {
      const px = this.x + fx * off, pz = this.z + fz * off;
      if (this.city.resolve(px, pz, r, TMP)) {
        const dx = TMP.x - px, dz = TMP.z - pz;
        this.x += dx; this.z += dz;
        bumped = true;
      }
    }
    if (bumped) {
      const impact = Math.abs(vLong);
      if (impact > 4) {
        this.health -= impact * 0.9;
        this.lastCrash = impact;
      }
      this.setVelocity(-vLong * 0.18, vLat * 0.3);
    }
    if (!this.city.inBounds(this.x, this.z)) {
      this.setVelocity(-Math.abs(vLong) * 0.4, 0);
      this.x = clamp(this.x, -640, 640);
      this.z = clamp(this.z, -640, 700);
    }

    this.sync();
  }

  /** Imposta la velocita' in coordinate del veicolo. */
  setVelocity(long, lat) {
    const fx = this.fx, fz = this.fz;
    const rx = Math.sin(this.a), rz = Math.cos(this.a);
    this.vx = fx * long + rx * lat;
    this.vz = fz * long + rz * lat;
    this.speed = long;
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
    this.setVelocity(this.speed * 0.5, 0);
    o.setVelocity(o.speed * 0.5 + this.speed * 0.25, 0);
    if (rel > 6) { this.health -= rel * 0.5; o.health -= rel * 0.5; }
    return rel;
  }

  sync() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.a;
  }

  setNight(on) { this.mesh.userData.lights.visible = on; }

  /** Lampeggianti della polizia: i due lati si alternano. */
  updateSiren(t) {
    const d = this.mesh.userData;
    if (!d.bar) return;
    const on = Math.sin(t * 9) > 0;
    d.bar.material.color.setHex(on ? 0xff2020 : 0x2a0808);
    d.bar2.material.color.setHex(on ? 0x0a1030 : 0x2060ff);
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.userData.bodyMat.dispose();
  }
}
