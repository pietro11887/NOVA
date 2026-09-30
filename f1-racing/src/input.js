// Tastiera, gamepad e comandi touch -> { throttle, brake, steer, shiftUp, shiftDown }

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false };
    this.state = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
    this.pressed = new Set();   // tasti premuti in questo frame (eventi singoli)
    this.usingPad = false;
    this.padPrev = [];
    addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  bindTouch(el, name) {
    const on = e => { e.preventDefault(); this.touch[name] = true; el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch (_) {} };
    const off = e => { e.preventDefault(); this.touch[name] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  // eventi "una tantum" (R, C, M, P...) consumati dal gioco
  consume(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }
  endFrame() { this.pressed.clear(); }

  update(dt) {
    const k = this.keys, st = this.state;
    let tThr = (k.has('ArrowUp') || k.has('KeyW') || this.touch.gas) ? 1 : 0;
    let tBrk = (k.has('ArrowDown') || k.has('KeyS') || this.touch.brake) ? 1 : 0;
    let tSteer = ((k.has('ArrowRight') || k.has('KeyD') || this.touch.right) ? 1 : 0) - ((k.has('ArrowLeft') || k.has('KeyA') || this.touch.left) ? 1 : 0);
    st.shiftUp = this.consume('KeyE') || this.consume('ShiftRight');
    st.shiftDown = this.consume('KeyQ') || this.consume('ControlRight');

    // gamepad (mappatura standard)
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let analog = false;
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      const rt = p.buttons[7] ? p.buttons[7].value : 0;
      const lt = p.buttons[6] ? p.buttons[6].value : 0;
      const dz = Math.abs(ax) > 0.08 ? (ax - Math.sign(ax) * 0.08) / 0.92 : 0;
      if (Math.abs(dz) > 0 || rt > 0.02 || lt > 0.02) { analog = true; this.usingPad = true; }
      if (this.usingPad) {
        if (Math.abs(dz) > Math.abs(tSteer)) tSteer = Math.sign(dz) * Math.pow(Math.abs(dz), 1.4);
        tThr = Math.max(tThr, rt);
        tBrk = Math.max(tBrk, lt);
      }
      const btn = i => p.buttons[i] && p.buttons[i].pressed;
      const edge = i => btn(i) && !this.padPrev[i];
      if (edge(0) || edge(5)) st.shiftUp = true;
      if (edge(2) || edge(4)) st.shiftDown = true;
      if (edge(3)) this.pressed.add('KeyR');
      if (edge(1)) this.pressed.add('KeyC');
      if (edge(9)) this.pressed.add('Escape');
      this.padPrev = p.buttons.map(b => b.pressed);
      break;
    }

    if (analog) {
      st.steer += (tSteer - st.steer) * Math.min(1, dt * 20);
      st.throttle = tThr; st.brake = tBrk;
    } else {
      // rampa per i comandi digitali: sterzo progressivo, ritorno più rapido
      const rate = (tSteer === 0 || Math.sign(tSteer) !== Math.sign(st.steer)) ? 7 : 3.2;
      const d = tSteer - st.steer;
      st.steer += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
      st.throttle += Math.sign(tThr - st.throttle) * Math.min(Math.abs(tThr - st.throttle), 7 * dt);
      st.brake += Math.sign(tBrk - st.brake) * Math.min(Math.abs(tBrk - st.brake), 9 * dt);
    }
    return st;
  }
}
