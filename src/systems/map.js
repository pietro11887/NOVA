import { CFG, ROAD_X, ROAD_Z, WORLD_MIN, WORLD_MAX, blockBounds } from '../core/config.js';
import { clamp } from '../core/utils.js';

const ICONS = {
  police: '🚓', hospital: '🏥', gas: '⛽', sport: '🏀', pier: '🎡', casino: '🎰', ammu: '🔫',
};
const LABELS = {
  police: 'Commissariato', hospital: 'Ospedale', gas: 'Distributore',
  sport: 'Campo', pier: 'Molo', casino: 'Casinò', ammu: 'Armeria',
};
const SHOP_ICON = {
  burger: '🍔', pharmacy: '💊', store: '🛒', ammu: '🔫',
  clothes: '👕', bar: '🍺', garage: '🔧', home: '🏠',
};

/**
 * Mappa a schermo intero: si apre dalla minimappa o col tasto M, si
 * trascina, si zooma e toccandola si pianta il waypoint.
 */
export class MapView {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.scale = 0.55;          // pixel per metro
    this.cx = 0; this.cz = 0;   // centro inquadrato (metri)
    this.follow = true;
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'bigmap';
    el.className = 'overlay hidden';
    el.innerHTML = `
      <div class="map-wrap">
        <canvas id="map-canvas"></canvas>
        <div class="map-top">
          <b>MAPPA</b>
          <span id="map-hint">Tocca un punto per mettere la destinazione</span>
        </div>
        <div class="map-tools">
          <button id="map-me" title="Centra su di me">🎯 Io</button>
          <button id="map-friend" class="hidden" title="Segui l'amico">👥 Amico</button>
          <button id="map-clear">✖ Destinazione</button>
          <button id="map-zin">＋</button>
          <button id="map-zout">－</button>
          <button id="map-close" class="close">Chiudi (M)</button>
        </div>
        <div class="map-legend">
          <span><i style="background:#ffd23f"></i>lavoro</span>
          <span><i style="background:#3ddc84"></i>negozio</span>
          <span><i style="background:#ff9d3f"></i>destinazione</span>
          <span><i style="background:#c56bff"></i>amico</span>
          <span><i style="background:#4cc2ff"></i>polizia</span>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.canvas = el.querySelector('#map-canvas');
    this.ctx = this.canvas.getContext('2d');

    el.querySelector('#map-close').addEventListener('click', () => this.hide());
    el.querySelector('#map-me').addEventListener('click', () => { this.follow = true; this.draw(); });
    el.querySelector('#map-clear').addEventListener('click', () => { this.game.setWaypoint(null); this.draw(); });
    el.querySelector('#map-zin').addEventListener('click', () => this.zoom(1.4));
    el.querySelector('#map-zout').addEventListener('click', () => this.zoom(1 / 1.4));
    this.friendBtn = el.querySelector('#map-friend');
    this.friendBtn.addEventListener('click', () => {
      const p = this.game.mp && this.game.mp.position;
      if (p) { this.game.setWaypoint({ x: p.x, z: p.z, friend: true }); this.follow = false; this.cx = p.x; this.cz = p.z; this.draw(); }
    });

    // --- trascinamento, pizzico e tocco
    let dragging = false, moved = 0, lastX = 0, lastY = 0, pinch = 0;
    const pos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    const down = (e) => {
      if (e.touches && e.touches.length === 2) {
        pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        return;
      }
      dragging = true; moved = 0;
      const p = pos(e); lastX = p.x; lastY = p.y;
    };
    const move = (e) => {
      if (e.touches && e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinch) this.zoom(d / pinch, false);
        pinch = d;
        e.preventDefault();
        return;
      }
      if (!dragging) return;
      const p = pos(e);
      const dx = p.x - lastX, dy = p.y - lastY;
      lastX = p.x; lastY = p.y;
      moved += Math.abs(dx) + Math.abs(dy);
      this.follow = false;
      this.cx -= dx / this.scale;
      this.cz -= dy / this.scale;
      this.draw();
      e.preventDefault();
    };
    const up = (e) => {
      if (dragging && moved < 8) {
        // tocco secco: destinazione
        const p = pos(e.changedTouches ? { touches: [e.changedTouches[0]] } : e);
        const w = this.screenToWorld(p.x, p.y);
        this.game.setWaypoint(w);
      }
      dragging = false; pinch = 0;
      this.draw();
    };
    this.canvas.addEventListener('mousedown', down);
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
    this.canvas.addEventListener('touchstart', down, { passive: false });
    this.canvas.addEventListener('touchmove', move, { passive: false });
    this.canvas.addEventListener('touchend', up);
    this.canvas.addEventListener('wheel', (e) => { this.zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2); e.preventDefault(); }, { passive: false });
  }

  zoom(k, redraw = true) {
    this.scale = clamp(this.scale * k, 0.12, 3.2);
    if (redraw) this.draw();
  }

  screenToWorld(px, py) {
    const w = this.canvas.width / devicePixelRatio, h = this.canvas.height / devicePixelRatio;
    return { x: this.cx + (px - w / 2) / this.scale, z: this.cz + (py - h / 2) / this.scale };
  }

  show() {
    this.open = true;
    this.el.classList.remove('hidden');
    this.follow = true;
    this.resize();
    this.draw();
  }

  hide() { this.open = false; this.el.classList.add('hidden'); }
  toggle() { this.open ? this.hide() : this.show(); }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw() {
    if (!this.open) return;
    const g = this.game, ctx = this.ctx;
    const w = this.canvas.width / Math.min(devicePixelRatio || 1, 2);
    const h = this.canvas.height / Math.min(devicePixelRatio || 1, 2);
    const p = g.player;
    if (this.follow) { this.cx = p.x; this.cz = p.z; }

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d1c26';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-this.cx, -this.cz);

    // --- terra, spiaggia, isolati, strade
    ctx.fillStyle = '#243a2a';
    ctx.fillRect(WORLD_MIN - 300, WORLD_MIN - 300, (WORLD_MAX - WORLD_MIN) + 600, (WORLD_MAX - WORLD_MIN) + 600);
    ctx.fillStyle = '#c9b98f';
    ctx.fillRect(WORLD_MIN - 300, g.city.shore - 90, (WORLD_MAX - WORLD_MIN) + 600, 200);
    ctx.fillStyle = '#14486b';
    ctx.fillRect(WORLD_MIN - 300, g.city.shore, (WORLD_MAX - WORLD_MIN) + 600, 1200);

    ctx.fillStyle = '#39404c';
    for (let i = 0; i < CFG.N; i++) {
      for (let j = 0; j < CFG.N; j++) {
        const b = blockBounds(i, j);
        ctx.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
      }
    }
    ctx.strokeStyle = '#5b6675';
    ctx.lineWidth = CFG.ROAD - 4;
    ctx.beginPath();
    for (const c of ROAD_X) { ctx.moveTo(c, WORLD_MIN); ctx.lineTo(c, WORLD_MAX); }
    for (const c of ROAD_Z) { ctx.moveTo(WORLD_MIN, c); ctx.lineTo(WORLD_MAX, c); }
    ctx.stroke();
    ctx.strokeStyle = '#8b95a3';
    ctx.lineWidth = 0.6;
    ctx.setLineDash([4, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    // --- simboli (disegnati senza scala, cosi' restano leggibili)
    const toS = (x, z) => ({
      x: w / 2 + (x - this.cx) * this.scale,
      y: h / 2 + (z - this.cz) * this.scale,
    });
    const dot = (x, z, color, r) => {
      const s = toS(x, z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    };

    if (this.scale > 0.32) {
      for (const d of g.city.doors) {
        const s = toS(d.x, d.z);
        if (s.x < -20 || s.x > w + 20 || s.y < -20 || s.y > h + 20) continue;
        ctx.font = `${Math.min(18, 9 + this.scale * 6)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText(SHOP_ICON[d.type] || '🏪', s.x, s.y + 5);
      }
    }
    for (const l of g.city.landmarks) {
      const s = toS(l.x, l.z);
      ctx.font = '20px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(ICONS[l.kind] || '📍', s.x, s.y + 6);
      if (this.scale > 0.4) {
        ctx.font = '600 11px system-ui';
        ctx.fillStyle = '#dbe4ee';
        ctx.fillText(LABELS[l.kind] || '', s.x, s.y + 22);
      }
    }
    for (const m of g.missions.markers) dot(m.x, m.z, '#ffd23f', 7);
    if (g.missions.objective) dot(g.missions.objective.x, g.missions.objective.z, '#ff9d3f', 8);
    for (const v of g.police.cars) if (v.active) dot(v.x, v.z, '#4cc2ff', 6);

    /*
     * Taxi in circolazione. Sono le stesse vetture che vedi per strada:
     * quando ne chiami uno, e' il piu' vicino di questi che arriva.
     */
    for (const t of g.traffic.taxis) {
      const s2 = toS(t.v.x, t.v.z);
      if (this.scale > 0.55) {
        ctx.font = '15px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('🚕', s2.x, s2.y + 5);
      } else {
        dot(t.v.x, t.v.z, t.hired ? '#ffffff' : '#ffd23f', 6);
      }
    }
    if (g.taxi && g.taxi.taxi) {
      const s2 = toS(g.taxi.taxi.x, g.taxi.taxi.z);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s2.x, s2.y, 10, 0, Math.PI * 2); ctx.stroke();
    }

    // --- destinazione
    if (g.waypoint) {
      const s = toS(g.waypoint.x, g.waypoint.z);
      ctx.strokeStyle = '#ff9d3f';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.x, s.y - 16); ctx.lineTo(s.x, s.y + 16);
      ctx.moveTo(s.x - 16, s.y); ctx.lineTo(s.x + 16, s.y); ctx.stroke();
    }

    // --- amico
    const friend = g.mp && g.mp.position;
    this.friendBtn.classList.toggle('hidden', !friend);
    if (friend) {
      const s = toS(friend.x, friend.z);
      dot(friend.x, friend.z, '#c56bff', 9);
      ctx.fillStyle = '#f0e2ff';
      ctx.font = '700 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(g.mp.name, s.x, s.y - 14);
      const d = Math.round(Math.hypot(friend.x - p.x, friend.z - p.z));
      ctx.fillStyle = '#c9b3e8';
      ctx.font = '11px system-ui';
      ctx.fillText(`${d} m`, s.x, s.y + 22);
    }

    // --- giocatore
    const me = toS(p.x, p.z);
    ctx.save();
    ctx.translate(me.x, me.y);
    ctx.rotate(-p.a + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#101418';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(7.5, 9); ctx.lineTo(0, 4.5); ctx.lineTo(-7.5, 9);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
