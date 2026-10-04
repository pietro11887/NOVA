// Menu col controller (e con le frecce della tastiera).
// Croce o stick sinistro: ci si sposta tra i pulsanti visibili, verso quello più vicino in quella direzione.
// A (o Invio): sceglie. B (o Esc/Backspace): indietro. LB/RB: pagina precedente/successiva dove ha senso
// (vetture del garage, gara/prova a tempo). Stick destro nel garage: gira la vettura.

const PAD_A = 0, PAD_B = 1, PAD_LB = 4, PAD_RB = 5, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;

// finestre in primo piano, dalla più importante: quella visibile comanda la navigazione
const OVERLAYS = ['dnf', 'pause', 'results', 'pitPanel'];
// pulsante "indietro" di ogni pagina
const BACK = {
  menuMode: 'modeBack', menuCar: 'carBack', menuRace: 'raceBack', menuGarage: 'garageBack',
  menuSettings: 'settingsBack', menuHelp: 'helpBack', menuCredits: 'creditsBack', pause: 'resumeBtn',
};
// LB / RB
const PAGES = {
  menuGarage: ['gPrev', 'gNext'],
};

const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

export class PadNav {
  constructor(opts = {}) {
    this.opts = opts;           // { garage: () => Garage|null, onConnect(name) }
    this.prev = [];
    this.focus = null;
    this.root = null;
    this.repeatDir = null; this.repeatT = 0;
    this.show = false;          // l'anello di selezione si vede solo usando controller o frecce
    this.keyQueue = [];
    addEventListener('keydown', e => {
      if (!this.root || this.root.id === 'pitPanel') return;   // in pista le frecce guidano
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', NumpadEnter: 'ok', Escape: 'back', Backspace: 'back' };
      const a = map[e.code];
      if (!a) return;
      // gli slider e le caselle di testo usano le frecce da soli
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '') && a !== 'back') return;
      e.preventDefault(); e.stopPropagation();
      this.keyQueue.push(a);
    }, true);
    addEventListener('mousemove', () => { if (this.show) { this.show = false; this.paint(); } });
    addEventListener('gamepadconnected', e => opts.onConnect && opts.onConnect(e.gamepad.id));
  }

  // la parte di interfaccia attiva in questo momento (null in pista: lì il controller guida)
  findRoot() {
    for (const id of OVERLAYS) { const el = document.getElementById(id); if (el && !el.classList.contains('hidden') && visible(el)) return el; }
    for (const el of document.querySelectorAll('.menuPage')) if (!el.classList.contains('hidden') && visible(el)) return el;
    return null;
  }

  candidates() {
    return [...this.root.querySelectorAll('button')].filter(b => !b.disabled && visible(b) && !b.closest('.hidden'));
  }

  pickDefault(list) {
    const has = c => b => b.classList.contains(c);
    if (this.root.id === 'menuRace' || this.root.id === 'menuGarage') return list.find(has('go')) || list[0];
    return list.find(has('primary')) || list.find(b => b.classList.contains('sel') && !b.closest('.seg')) || list.find(has('go')) || list[0];
  }

  // movimento "spaziale": il pulsante più vicino nella direzione scelta
  move(dir) {
    const list = this.candidates();
    if (!list.length) return;
    if (!this.focus || !list.includes(this.focus)) { this.setFocus(this.pickDefault(list)); return; }
    const r = this.focus.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bs = Infinity;
    for (const b of list) {
      if (b === this.focus) continue;
      const q = b.getBoundingClientRect();
      const qx = q.left + q.width / 2, qy = q.top + q.height / 2;
      const dx = qx - cx, dy = qy - cy;
      let main, side;
      if (dir === 'up') { if (q.bottom > r.top + 4 && dy > -4) continue; main = -dy; side = Math.abs(dx); }
      else if (dir === 'down') { if (q.top < r.bottom - 4 && dy < 4) continue; main = dy; side = Math.abs(dx); }
      else if (dir === 'left') { if (q.right > r.left + 4 && dx > -4) continue; main = -dx; side = Math.abs(dy); }
      else { if (q.left < r.right - 4 && dx < 4) continue; main = dx; side = Math.abs(dy); }
      if (main <= 0) continue;
      // chi è allineato vince su chi è più vicino ma di traverso
      const overlap = dir === 'up' || dir === 'down' ? Math.min(r.right, q.right) - Math.max(r.left, q.left) : Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
      const s = overlap > 0 ? main + side * 0.3 : 1e5 + main + side * 2.2;   // prima chi è sulla stessa riga/colonna
      if (s < bs) { bs = s; best = b; }
    }
    if (best) this.setFocus(best);
  }

  setFocus(b) {
    if (this.focus && this.focus !== b) this.focus.classList.remove('padFocus');
    this.focus = b || null;
    this.paint();
    if (b) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  paint() { if (this.focus) this.focus.classList.toggle('padFocus', this.show); }

  press(id) { const b = document.getElementById(id); if (b && visible(b)) { b.click(); return true; } return false; }

  act(a) {
    this.show = true;
    if (!this.focus || !this.root.contains(this.focus) || !visible(this.focus)) {
      const list = this.candidates();
      this.setFocus(this.pickDefault(list));
      if (a !== 'ok' && a !== 'back') return;   // prima pressione: si vede dove si è
    }
    if (a === 'ok') { if (this.focus) { const f = this.focus; f.click(); this.refocusSoon(f); } }
    else if (a === 'back') { const id = BACK[this.root.id]; if (id) this.press(id); }
    else if (a === 'lb' || a === 'rb') {
      const pg = PAGES[this.root.id];
      if (pg) this.press(pg[a === 'lb' ? 0 : 1]);
      else if (this.root.id === 'menuRace') { const seg = this.root.querySelectorAll('#typeSeg button'); seg[a === 'lb' ? 0 : 1]?.click(); }
    }
    else this.move(a);
    this.paint();
  }

  // dopo un clic la pagina può ridisegnare i pulsanti (elenco piste, scuderie): si ritrova lo stesso
  refocusSoon(f) {
    const key = f.id || f.dataset.set || f.dataset.step || f.dataset.type || f.dataset.mode || f.dataset.class || f.dataset.cat || f.textContent;
    requestAnimationFrame(() => {
      if (this.focus && document.contains(this.focus) && visible(this.focus)) return;
      const root = this.findRoot(); if (!root) return;
      this.root = root;
      const again = [...root.querySelectorAll('button')].find(b => (b.id || b.dataset.set || b.dataset.step || b.dataset.type || b.dataset.mode || b.dataset.class || b.dataset.cat || b.textContent) === key);
      this.setFocus(again && visible(again) ? again : this.pickDefault(this.candidates()));
    });
  }

  update(dt) {
    const root = this.findRoot();
    if (root !== this.root) {
      this.root = root;
      if (this.focus) this.focus.classList.remove('padFocus');
      this.focus = null;
      if (root) { const list = this.candidates(); if (list.length) this.setFocus(this.pickDefault(list)); }
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...pads].find(Boolean);
    const acts = this.keyQueue.splice(0);
    if (p) {
      const btn = i => !!(p.buttons[i] && p.buttons[i].pressed);
      const edge = i => btn(i) && !this.prev[i];
      if (this.root) {
        if (edge(PAD_A)) acts.push('ok');
        if (edge(PAD_B)) acts.push('back');
        if (edge(PAD_LB)) acts.push('lb');
        if (edge(PAD_RB)) acts.push('rb');
        // croce o stick, con ripetizione tenendo premuto
        // ai box si sta ancora guidando: lì solo la croce (lo stick sterza)
        const stick = this.root.id !== 'pitPanel';
        const ax = stick ? p.axes[0] || 0 : 0, ay = stick ? p.axes[1] || 0 : 0;
        const dir = btn(UP) || ay < -0.6 ? 'up' : btn(DOWN) || ay > 0.6 ? 'down' : btn(LEFT) || ax < -0.6 ? 'left' : btn(RIGHT) || ax > 0.6 ? 'right' : null;
        if (dir !== this.repeatDir) { this.repeatDir = dir; this.repeatT = 0.38; if (dir) acts.push(dir); }
        else if (dir) { this.repeatT -= dt; if (this.repeatT <= 0) { this.repeatT = 0.11; acts.push(dir); } }
        // garage: stick destro per girare la vettura, grilletti per avvicinarsi
        const g = this.opts.garage && this.opts.garage();
        if (g && g.active) {
          const rx = p.axes[2] || 0, ry = p.axes[3] || 0;
          if (Math.abs(rx) > 0.12 || Math.abs(ry) > 0.12) {
            g.yaw -= rx * dt * 2.2;
            g.pitch = Math.max(0.05, Math.min(0.75, g.pitch + ry * dt * 1.2));
            g.drag = performance.now();
          }
          const zoom = (p.buttons[6]?.value || 0) - (p.buttons[7]?.value || 0);
          if (Math.abs(zoom) > 0.05) g.dist = Math.max(6.5, Math.min(18, g.dist * (1 + zoom * dt * 1.5)));
        }
      } else this.repeatDir = null;
      this.prev = p.buttons.map(b => b.pressed);
    }
    if (this.root) for (const a of acts) this.act(a);
    return !!this.root;
  }
}
