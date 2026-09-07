import { clamp, IS_TOUCH } from './utils.js';

/**
 * Ingressi unificati: tastiera+mouse su desktop, joystick virtuale e
 * pulsanti su telefono. Il gioco legge sempre e solo questa struttura.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.move = { x: 0, y: 0 };      // y>0 = avanti
    this.move2 = { x: 0, y: 0 };     // levetta destra: sterzo quando si guida
    this.driveMode = false;
    this.look = { x: 0, y: 0 };      // delta consumato ogni frame
    this.keys = new Set();
    this.btn = { action: false, attack: false, jump: false, run: false };
    this._edge = { action: false, attack: false, jump: false };
    this.enabled = true;
    this.lookSensitivity = IS_TOUCH ? 0.0055 : 0.0025;
    this.invertY = false;

    this._keyboard();
    this._mouse();
    if (IS_TOUCH) this._touch();
  }

  _keyboard() {
    const map = {
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    };
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this._edge.action = true;
      if (e.code === 'Space') this._edge.jump = true;
      if (e.code === 'KeyQ') this._edge.swap = true;
      // 1..8 scelgono l'arma per slot
      if (/^Digit[1-8]$/.test(e.code)) this._edge.slot = +e.code.slice(5);
      if (map[e.code] || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); });
  }

  _mouse() {
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this._edge.attack = true; this.btn.attack = true; }
      if (!IS_TOUCH && document.pointerLockElement !== c) c.requestPointerLock?.();
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.btn.attack = false; });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas) {
        this.look.x += e.movementX * this.lookSensitivity;
        this.look.y += e.movementY * this.lookSensitivity;
      }
    });
  }

  _touch() {
    const zone = document.getElementById('stick-zone');
    const base = document.getElementById('stick-base');
    const knob = document.getElementById('stick-knob');
    const R = 52;
    let stickId = null, ox = 0, oy = 0;

    // --- levetta destra: solo sinistra/destra, e' lo sterzo, compare in auto
    const zoneR = document.getElementById('stick-zone-r');
    const baseR = document.getElementById('stick-base-r');
    const knobR = document.getElementById('stick-knob-r');
    const RX = 62;
    // NB: baseR e' figlio della zona, quindi left/top vanno in coordinate
    // della zona, non dello schermo: prima la levetta finiva fuori campo.
    const placeR = (clientX, clientY) => {
      const z = zoneR.getBoundingClientRect();
      baseR.style.left = `${clientX - z.left - 79}px`;
      baseR.style.top = `${clientY - z.top - 46}px`;
    };
    // posizione di riposo: sopra i pulsanti, cosi' non ci finisce sotto
    const parkR = () => {
      const z = zoneR.getBoundingClientRect();
      baseR.style.left = '8px';                       // a sinistra dei pulsanti
      baseR.style.top = `${Math.max(0, z.height - 104)}px`;
    };
    let stickR = null, oxR = 0;
    const startR = (t) => {
      stickR = t.identifier;
      oxR = t.clientX;
      placeR(t.clientX, t.clientY);
      baseR.classList.add('on');
      baseR.classList.remove('ghost');
    };
    const moveR = (t) => {
      let dx = t.clientX - oxR;
      if (dx > RX) { oxR = t.clientX - RX; dx = RX; }
      if (dx < -RX) { oxR = t.clientX + RX; dx = -RX; }
      knobR.style.transform = `translateX(${dx}px)`;
      this.move2.x = clamp(dx / RX, -1, 1);
    };
    const endR = () => {
      stickR = null;
      this.move2.x = 0;
      baseR.classList.remove('on');
      if (this.driveMode) { baseR.classList.add('ghost'); parkR(); }
      knobR.style.transform = '';
    };
    this._parkR = parkR;
    zoneR.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (stickR === null) { startR(e.changedTouches[0]); moveR(e.changedTouches[0]); }
    }, { passive: false });
    this._endR = endR;
    this._moveR = moveR;
    this._stickR = () => stickR;

    const startStick = (t) => {
      stickId = t.identifier;
      ox = t.clientX; oy = t.clientY;
      // stessa storia: base e' dentro #stick-zone, che non parte da (0,0)
      const z = zone.getBoundingClientRect();
      base.style.left = `${ox - z.left - 62}px`;
      base.style.top = `${oy - z.top - 62}px`;
      base.classList.add('on');
    };
    const moveStick = (t) => {
      let dx = t.clientX - ox, dy = t.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.move.x = clamp(dx / R, -1, 1);
      this.move.y = clamp(-dy / R, -1, 1);
    };
    const endStick = () => {
      stickId = null; this.move.x = this.move.y = 0;
      base.classList.remove('on');
      knob.style.transform = '';
    };

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (stickId === null) { startStick(e.changedTouches[0]); moveStick(e.changedTouches[0]); }
    }, { passive: false });

    const lookTouches = new Map();
    addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.target.closest('#stick-zone') || t.target.closest('#stick-zone-r') ||
            t.target.closest('.tbtn') || t.target.closest('.overlay')) continue;
        lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }, { passive: true });

    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { moveStick(t); continue; }
        if (t.identifier === this._stickR()) { this._moveR(t); continue; }
        const p = lookTouches.get(t.identifier);
        if (p) {
          this.look.x += (t.clientX - p.x) * this.lookSensitivity;
          this.look.y += (t.clientY - p.y) * this.lookSensitivity;
          p.x = t.clientX; p.y = t.clientY;
        }
      }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) endStick();
        if (t.identifier === this._stickR()) this._endR();
        lookTouches.delete(t.identifier);
      }
    };
    addEventListener('touchend', end, { passive: true });
    addEventListener('touchcancel', end, { passive: true });

    for (const el of document.querySelectorAll('.tbtn')) {
      const name = el.dataset.btn;
      const down = (e) => {
        e.preventDefault();
        this.btn[name] = true;
        if (name in this._edge) this._edge[name] = true;
        el.classList.add('pressed');
      };
      const up = (e) => { e.preventDefault(); this.btn[name] = false; el.classList.remove('pressed'); };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
    }
  }

  /** Chiamare una volta per frame, dopo aver letto gli ingressi. */
  endFrame() {
    this.look.x = 0; this.look.y = 0;
    this._edge.action = this._edge.attack = this._edge.jump = false;
    this._edge.swap = false;
    this._edge.slot = 0;
  }

  pressed(name) { return this._edge[name]; }

  /** Attiva la doppia levetta: sinistra gas e freno, destra sterzo. */
  setDriveMode(on) {
    if (this.driveMode === on) return;
    this.driveMode = on;
    const zoneR = document.getElementById('stick-zone-r');
    const baseR = document.getElementById('stick-base-r');
    if (zoneR) zoneR.classList.toggle('hidden', !on);
    if (baseR) {
      // in guida la levetta resta visibile in trasparenza: cosi' si vede
      // dov'e', ma si puo' comunque afferrare dove fa piu' comodo
      baseR.classList.toggle('ghost', on);
      if (on) { if (this._parkR) this._parkR(); }
      else if (this._endR) this._endR();
    }
  }

  /** Acceleratore: levetta sinistra su telefono, W/S da tastiera. */
  get throttle() {
    let v = this.move.y;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) v += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) v -= 1;
    return clamp(v, -1, 1);
  }

  get forward() {
    let v = this.move.y;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) v += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) v -= 1;
    return clamp(v, -1, 1);
  }
  /** Sterzo: levetta destra su telefono, A/D da tastiera. */
  get steering() {
    let v = this.driveMode ? this.move2.x : this.move.x;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) v += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) v -= 1;
    return clamp(v, -1, 1);
  }

  get strafe() {
    let v = this.move.x;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) v += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) v -= 1;
    return clamp(v, -1, 1);
  }
  get running() { return this.btn.run || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  get braking() { return this.btn.jump || this.keys.has('Space'); }
  get attacking() { return this.btn.attack || this._edge.attack; }
}
