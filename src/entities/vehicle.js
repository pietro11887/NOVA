import * as THREE from 'three';
import { clamp, lerp, pick } from '../core/utils.js';
import { makeCar, dentCar, undentCar, paintCar, setRims, CAR_TYPES, CAR_COLORS, TRAFFIC_TYPES } from '../world/models.js';
import { spinPackWheels } from '../world/carpack.js';

const TMP = { x: 0, z: 0 };

/**
 * Fisica arcade: nessun motore fisico, solo velocita' scalare lungo l'asse
 * dell'auto piu' un po' di sbandata col freno a mano. E' quello che serve
 * per un'auto che risponde bene anche con un joystick virtuale.
 */
export class Vehicle {
  constructor(city, opts = {}) {
    this.city = city;
    this.type = opts.type || pick(TRAFFIC_TYPES);
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

    this.roll = 0;              // angolo delle ruote, cumulato
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
    const off = this.spec.bike ? 0.7 : this.spec.W / 2 + 0.75;
    out.x = this.x + sx * off;
    out.z = this.z + sz * off;
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
    /*
     * Zona morta: sotto i sei centimetri al secondo ci si ferma davvero,
     * altrimenti le auto strisciano all'infinito. Ma vale solo a gas
     * staccato: con un filo di gas l'incremento di un fotogramma e' piu'
     * piccolo della soglia, e azzerarlo lo stesso vuol dire non partire
     * mai. E' cosi' che un guidatore che accelera dolcemente restava
     * inchiodato sul posto a motore acceso.
     */
    if (Math.abs(vLong) < 0.06 && c.throttle === 0) vLong = 0;
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
    let hitOff = 0, hitNx = 0, hitNz = 0;
    for (const off of [spec.L * 0.34, -spec.L * 0.34]) {
      const px = this.x + fx * off, pz = this.z + fz * off;
      if (this.city.resolve(px, pz, r, TMP)) {
        const dx = TMP.x - px, dz = TMP.z - pz;
        this.x += dx; this.z += dz;
        bumped = true;
        hitOff = off; hitNx = dx; hitNz = dz;
      }
    }
    if (bumped) {
      const impact = Math.abs(vLong);
      if (impact > 4) {
        this.health -= impact * 0.9;
        this.lastCrash = impact;
        // il muro respinge: l'ammaccatura sta dalla parte opposta alla spinta
        const nl = Math.hypot(hitNx, hitNz) || 1;
        this.dentAt(this.x + fx * hitOff - (hitNx / nl) * 0.4,
                    this.z + fz * hitOff - (hitNz / nl) * 0.4, impact);
      }
      this.setVelocity(-vLong * 0.18, vLat * 0.3);
    }
    if (!this.city.inBounds(this.x, this.z)) {
      this.setVelocity(-Math.abs(vLong) * 0.4, 0);
      this.x = clamp(this.x, -640, 640);
      this.z = clamp(this.z, -640, 700);
    }

    this.roll += (this.speed * dt) / Math.max(0.12, this.spec.wheel || 0.34);
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

  /**
   * Ammacca la carrozzeria nel punto d'urto (in coordinate mondo).
   * Converte nel sistema locale dell'auto e delega al modello.
   */
  dentAt(wx, wz, strength) {
    if (!this.mesh || strength < 4) return;
    const ox = wx - this.x, oz = wz - this.z;
    const fx = this.fx, fz = this.fz;
    const rx = Math.sin(this.a), rz = Math.cos(this.a);
    dentCar(this.mesh, ox * fx + oz * fz, this.spec.top * 0.45, ox * rx + oz * rz,
      Math.min(18, strength));
  }

  /**
   * Urto tra veicoli.
   *
   * Prima l'auto era un cerchio di raggio (La+Lb)*0.36: per due berline sono
   * 3,2 m attorno al centro, cioe' piu' della distanza fra due corsie, e ti
   * risultava un tamponamento ogni volta che sorpassavi qualcuno.
   * Ora ogni auto e' due cerchi lungo il suo asse, larghi quanto la vettura:
   * si toccano solo quando le lamiere si toccano davvero.
   */
  collideWith(o) {
    const ra = this.spec.W * 0.5, rb = o.spec.W * 0.5;
    const sum = ra + rb;
    // scarto rapido: se sono lontani non serve controllare i quattro casi
    const gx = o.x - this.x, gz = o.z - this.z;
    const reach = (this.spec.L + o.spec.L) * 0.5 + sum;
    if (gx * gx + gz * gz > reach * reach) return 0;

    const la = this.spec.L * 0.26, lb = o.spec.L * 0.26;
    const af = { x: this.fx, z: this.fz }, bf = { x: o.fx, z: o.fz };
    let best = null, bestOver = 0;
    for (const sa of [-1, 1]) {
      const ax = this.x + af.x * la * sa, az = this.z + af.z * la * sa;
      for (const sb of [-1, 1]) {
        const bx = o.x + bf.x * lb * sb, bz = o.z + bf.z * lb * sb;
        const dx = bx - ax, dz = bz - az;
        const d = Math.hypot(dx, dz);
        const over = sum - d;
        if (d > 0 && over > bestOver) {
          bestOver = over;
          best = { nx: dx / d, nz: dz / d, cx: (ax + bx) / 2, cz: (az + bz) / 2 };
        }
      }
    }
    if (!best) return 0;

    const push = bestOver / 2;
    const { nx, nz } = best;
    this.x -= nx * push; this.z -= nz * push;
    o.x += nx * push; o.z += nz * push;

    // conta come botta solo l'urto frontale: strisciare di fianco non e' un
    // tamponamento, e prima anche una carezza toglieva vita a entrambi
    const closing = Math.abs((this.vx - o.vx) * nx + (this.vz - o.vz) * nz);
    this.setVelocity(this.speed * 0.5, 0);
    o.setVelocity(o.speed * 0.5 + this.speed * 0.25, 0);
    if (closing > 6) {
      this.health -= closing * 0.5; o.health -= closing * 0.5;
      this.dentAt(best.cx, best.cz, closing * 0.8);
      o.dentAt(best.cx, best.cz, closing * 0.8);
      this.lastCrash = Math.max(this.lastCrash || 0, closing);
    }
    return closing;
  }

  sync() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.a;
    // ruote: rotolano in proporzione allo spazio percorso e sterzano davanti.
    // Il segno e' negativo perche' una rotazione positiva attorno a +Z porta
    // la sommita' della ruota all'indietro.
    if (this.mesh.userData.wheels) {
      spinPackWheels(this.mesh, -this.roll, this.steer);
    }
  }

  setNight(on) {
    const u = this.mesh.userData;
    u.lights.visible = on && !u.lightsBroken;   // i fari rotti restano spenti
  }

  /** Riparazione in officina: raddrizza la lamiera e rimette i vetri. */
  repair() {
    this.health = 100;
    undentCar(this.mesh);
  }

  paint(color) { this.color = color; paintCar(this.mesh, color); }
  rims(style) { setRims(this.mesh, style); }

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
