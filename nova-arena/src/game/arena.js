// Live battle arena on <canvas>: 18x32 tile field, 3 towers per side, elixir, a 4-card hand,
// troop/spell/building deployment and a simple bot opponent. Card archetype tags drive mechanics.
//
// runArena({ root, player, enemy, modifiers, spectate, arenaTheme }) → Promise<{ outcome, crowns, enemyCrowns }>
//   player/enemy: { name, deck: [ids], levels: { id: level } }
//   modifiers:    { elixirRate = 1, suddenDeath = false }

import { h, shuffle, pick, fmtDuration } from '../ui/dom.js';
import { getCard, statMultiplier, FACTIONS } from '../data/cards.js';
import { ARENAS } from '../data/catalog.js';
import { confirmDialog } from '../ui/components/modal.js';
import { Arena3D } from './arena3d.js';
import { cardPortrait } from '../ui/components/portraits.js';

const W = 18, H = 32;
const RIVER_TOP = 15, RIVER_BOT = 17, MID = 16;
const BRIDGES = [3.5, 14.5];
const MATCH_TIME = 120, DOUBLE_AT = 40, OVERTIME = 60;
const ELIXIR_PER_SEC = 1 / 2.8;
const ME = 1, FOE = -1; // side: ME is the bottom half, moving toward y = 0

const SIDE_COLOR = { [ME]: '#3b82f6', [FOE]: '#ef4444' };

let uid = 0;

export function runArena({ root, player, enemy, modifiers = {}, spectate = false, arenaTheme = 0 }) {
  return new Promise((resolve) => {
    const battle = new Battle({ root, player, enemy, modifiers, spectate, arenaTheme, onEnd: resolve });
    battle.start();
  });
}

class Battle {
  constructor({ root, player, enemy, modifiers, spectate, arenaTheme, onEnd }) {
    this.root = root;
    this.mods = { elixirRate: 1, suddenDeath: false, ...modifiers };
    this.spectate = spectate;
    this.theme = ARENAS[arenaTheme] ?? ARENAS[0];
    this.onEnd = onEnd;
    this.ents = [];
    this.fx = [];
    this.time = 0;
    this.overtime = false;
    this.over = false;
    this.selected = -1;
    this.pointer = null;
    this.sides = {
      [ME]: this.makeSide(ME, player, spectate),
      [FOE]: this.makeSide(FOE, enemy, true),
    };
    this.placeTowers();
  }

  makeSide(side, info, isBot) {
    const queue = shuffle(info.deck);
    const lvls = Object.values(info.levels);
    const towerLevel = Math.round(lvls.reduce((a, b) => a + b, 0) / lvls.length) || 1;
    return {
      side, name: info.name, levels: info.levels, isBot, towerLevel,
      elixir: 5, crowns: 0,
      hand: queue.splice(0, 4), queue,
      think: 1.5 + Math.random(),
    };
  }

  // ── setup ────────────────────────────────────────────────────────────────
  placeTowers() {
    for (const side of [ME, FOE]) {
      const m = statMultiplier(this.sides[side].towerLevel);
      const y = (v) => (side === ME ? v : H - v);
      this.addTower(side, 9, y(29), 2400 * m, true, m);
      this.addTower(side, 3.5, y(25.5), 1400 * m, false, m);
      this.addTower(side, 14.5, y(25.5), 1400 * m, false, m);
    }
  }

  addTower(side, x, y, hp, isKing, m) {
    this.ents.push({
      id: ++uid, side, kind: 'tower', isKing, active: !isKing, x, y, r: isKing ? 1.6 : 1.25,
      hp, maxHp: hp, dmg: 55 * m, hitSpeed: isKing ? 1.0 : 0.8, cd: 0, range: isKing ? 7 : 7.5,
      air: false, tags: new Set(['Ranged']), art: isKing ? '👑' : '🗼', dots: [], stun: 0, dir: null, attackAt: null,
    });
  }

  // ── DOM / canvas ────────────────────────────────────────────────────────
  start() {
    const s = this.sides;
    this.canvas = h('canvas', { class: 'arena-canvas' });
    this.timerEl = h('div', { class: 'arena-timer' }, '2:00');
    this.badgeEl = h('div', { class: 'arena-badge', hidden: true });
    this.crownsEl = { [ME]: h('b', {}, '0'), [FOE]: h('b', {}, '0') };
    this.handEl = h('div', { class: 'arena-hand' });
    this.nextEl = h('div', { class: 'arena-next' });
    this.elixirEl = h('div', { class: 'elixir-bar' }, h('div', { class: 'elixir-fill' }), h('span', { class: 'elixir-num' }, '5'));

    this.el = h('div', { class: ['arena', this.spectate && 'spectating'] },
      h('header', { class: 'arena-top' },
        h('button', { class: 'icon-btn', 'aria-label': 'Arrenditi', onClick: () => this.surrender() }, '🏳️'),
        h('div', { class: 'arena-player foe' }, h('span', {}, s[FOE].name), h('span', { class: 'crowns' }, '👑 ', this.crownsEl[FOE])),
        this.timerEl,
        h('div', { class: 'arena-player me' }, h('span', {}, s[ME].name), h('span', { class: 'crowns' }, '👑 ', this.crownsEl[ME])),
      ),
      this.badgeEl,
      h('div', { class: 'arena-field' }, this.canvas),
      this.spectate
        ? h('footer', { class: 'arena-bottom spectate-bar' }, '👁️ Modalità spettatore')
        : h('footer', { class: 'arena-bottom' }, h('div', { class: 'hand-row' }, this.nextEl, this.handEl), this.elixirEl),
    );
    this.root.append(this.el);
    try {
      this.view = new Arena3D(this.canvas, this);
      this.canvas.classList.add('is-3d');
    } catch (err) {
      console.warn('WebGL non disponibile, uso la vista 2D', err);
      this.view = null;
      this.ctx = this.canvas.getContext('2d');
    }

    this.canvas.addEventListener('pointermove', (e) => { this.pointer = this.toField(e); });
    this.canvas.addEventListener('pointerleave', () => { this.pointer = null; });
    this.canvas.addEventListener('pointerdown', (e) => this.onFieldTap(this.toField(e)));
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.renderHand();

    this.last = performance.now();
    const loop = (t) => {
      if (this.over) return;
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.step(dt);
      if (this.view) this.view.render(dt); else this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    if (this.view) {
      this.view.resize(Math.max(1, box.width), Math.max(1, box.height));
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.tile = Math.max(8, Math.min(box.width / W, box.height / H));
    const cw = this.tile * W, ch = this.tile * H;
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  toField(e) {
    if (this.view) return this.view.pick(e.clientX, e.clientY);
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  renderHand() {
    if (this.spectate) return;
    const side = this.sides[ME];
    this.handEl.replaceChildren(...side.hand.map((id, i) => {
      const card = getCard(id);
      const f = FACTIONS[card.faction];
      return h('button', {
        class: ['hand-card', i === this.selected && 'selected', side.elixir < card.elixir && 'poor'],
        style: { '--f1': f.color, '--f2': f.accent },
        dataset: { idx: i },
        onClick: () => { this.selected = this.selected === i ? -1 : i; this.renderHand(); },
      }, portraitOrEmoji(card, 'hc-art'), h('span', { class: 'elixir' }, String(card.elixir)), h('small', {}, card.name));
    }));
    const next = getCard(side.queue[0]);
    this.nextEl.replaceChildren(h('small', {}, 'Prossima'), portraitOrEmoji(next, 'next-art'));
  }

  updateHud() {
    const remaining = this.overtime ? OVERTIME - (this.time - MATCH_TIME) : MATCH_TIME - this.time;
    const s = Math.max(0, Math.ceil(remaining));
    this.timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timerEl.classList.toggle('urgent', s <= 10);
    const label = this.overtime ? 'SUPPLEMENTARI · Elisir x2' : this.isDouble() ? 'Elisir x' + (2 * this.mods.elixirRate) : this.mods.elixirRate > 1 ? `Elisir x${this.mods.elixirRate}` : this.mods.suddenDeath ? 'Morte improvvisa' : '';
    this.badgeEl.hidden = !label;
    this.badgeEl.textContent = label;
    this.crownsEl[ME].textContent = this.sides[ME].crowns;
    this.crownsEl[FOE].textContent = this.sides[FOE].crowns;
    if (!this.spectate) {
      const e = this.sides[ME].elixir;
      this.elixirEl.firstChild.style.width = (e / 10) * 100 + '%';
      this.elixirEl.lastChild.textContent = Math.floor(e);
      // Cheap affordability refresh without rebuilding the hand.
      this.handEl.querySelectorAll('.hand-card').forEach((btn, i) => {
        btn.classList.toggle('poor', e < getCard(this.sides[ME].hand[i]).elixir);
      });
    }
  }

  // ── deployment ───────────────────────────────────────────────────────────
  canDeploy(side, card, x, y) {
    if (x < 0.5 || x > W - 0.5 || y < 0.5 || y > H - 0.5) return false;
    if (card.type === 'spell') return true;
    const own = side === ME ? y >= RIVER_BOT + 0.4 : y <= RIVER_TOP - 0.4;
    if (own) return !this.ents.some((e) => e.kind === 'tower' && e.hp > 0 && Math.hypot(e.x - x, e.y - y) < e.r + 0.4);
    // Pocket: when an enemy princess tower falls you can deploy deeper on that lane.
    const lane = x < W / 2 ? 0 : 1;
    const fallen = !this.ents.some((e) => e.kind === 'tower' && !e.isKing && e.side === -side && e.hp > 0 && (e.x < W / 2 ? 0 : 1) === lane);
    if (!fallen) return false;
    return side === ME ? y >= 10 && !(y > RIVER_TOP && y < RIVER_BOT) : y <= H - 10 && !(y > RIVER_TOP && y < RIVER_BOT);
  }

  onFieldTap(p) {
    if (!p) return;
    if (this.spectate || this.over || this.selected < 0) return;
    const side = this.sides[ME];
    const card = getCard(side.hand[this.selected]);
    if (side.elixir < card.elixir) return this.flash('Elisir insufficiente');
    if (!this.canDeploy(ME, card, p.x, p.y)) return this.flash('Non puoi schierare qui');
    this.play(ME, this.selected, p.x, p.y);
    this.selected = -1;
    this.renderHand();
  }

  flash(text) {
    this.fx.push({ type: 'text', x: W / 2, y: H * 0.62, text, t: 0, life: 1.1 });
  }

  play(sideId, handIdx, x, y) {
    const side = this.sides[sideId];
    const id = side.hand[handIdx];
    const card = getCard(id);
    side.elixir -= card.elixir;
    side.queue.push(id);
    side.hand[handIdx] = side.queue.shift();
    this.deploy(sideId, card, side.levels[id] ?? 1, x, y);
  }

  deploy(side, card, level, x, y, opts = {}) {
    const m = statMultiplier(level) * (opts.scale ?? 1);
    const st = card.stats;
    if (card.type === 'spell') return this.castSpell(side, card, m, x, y);

    const n = card.type === 'building' ? 1 : st.count ?? 1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const off = n > 1 ? 0.6 : 0;
      const hp = st.hp * m;
      this.ents.push({
        id: ++uid, side, kind: card.type === 'building' ? 'building' : 'unit', card, level,
        x: x + Math.cos(a) * off, y: y + Math.sin(a) * off,
        r: (card.type === 'building' ? 0.9 : st.hp > 1500 ? 0.75 : n > 2 ? 0.35 : 0.5) * (opts.small ? 0.7 : 1),
        hp, maxHp: hp, shield: (st.shield ?? 0) * m,
        dmg: st.dmg * m, hitSpeed: st.hitSpeed || 1, cd: 0.6, speed: st.speed, range: st.range,
        air: card.tags.includes('Air'), tags: new Set(card.tags), art: card.art,
        targetsBuildings: card.tags.includes('Targets Buildings'),
        lifetime: st.lifetime, spawnTimer: st.spawn ? st.spawn.every * 0.5 : 0,
        dots: [], stun: 0, deploy: card.type === 'building' ? 0.5 : 0.8,
        phased: card.tags.includes('Phasing'), rewound: false, noSplit: Boolean(opts.noSplit), auraT: 0,
        mini: Boolean(opts.small), moving: false, dir: { x: 0, y: -side }, attackAt: null,
      });
    }
  }

  castSpell(side, card, m, x, y) {
    const st = card.stats;
    const color = FACTIONS[card.faction].color;
    const towerFactor = 0.35;
    if (st.duration) {
      // Damage over time zone (Toxic Cloud, Singularity).
      this.fx.push({ type: 'zone', side, x, y, radius: st.radius, dps: (st.dmg * m) / st.duration, life: st.duration, t: 0, color, pull: card.tags.includes('Pull'), towerFactor, art: card.art, cardId: card.id });
      return;
    }
    this.fx.push({ type: 'blast', x, y, radius: st.radius, t: 0, life: 0.6, color, art: card.art, cardId: card.id });
    for (const e of this.enemiesOf(side)) {
      if (Math.hypot(e.x - x, e.y - y) > st.radius + e.r) continue;
      this.damage(e, st.dmg * m * (e.kind === 'tower' ? towerFactor : 1));
      if (st.stun) e.stun = Math.max(e.stun, st.stun);
      if (st.knockback && e.kind === 'unit') {
        const d = Math.hypot(e.x - x, e.y - y) || 1;
        e.x += ((e.x - x) / d) * st.knockback;
        e.y += ((e.y - y) / d) * st.knockback;
      }
    }
    if (st.burn) this.fx.push({ type: 'zone', side, x, y, radius: st.radius * 0.7, dps: st.burn * m, life: 3, t: 0, color: '#f97316', towerFactor, art: '🔥' });
  }

  // ── simulation ───────────────────────────────────────────────────────────
  isDouble() {
    return this.overtime || (!this.mods.suddenDeath && MATCH_TIME - this.time <= DOUBLE_AT);
  }

  enemiesOf(side) {
    return this.ents.filter((e) => e.side !== side && e.hp > 0);
  }

  step(dt) {
    this.time += dt;
    const rate = ELIXIR_PER_SEC * this.mods.elixirRate * (this.isDouble() ? 2 : 1);
    for (const s of Object.values(this.sides)) {
      s.elixir = Math.min(10, s.elixir + rate * dt);
      if (s.isBot) this.botThink(s, dt);
    }

    for (const e of this.ents) if (e.hp > 0) this.updateEntity(e, dt);
    this.separate();
    this.updateFx(dt);

    // Remove the dead, resolving death effects.
    const dead = this.ents.filter((e) => e.hp <= 0);
    if (dead.length) {
      this.ents = this.ents.filter((e) => e.hp > 0);
      for (const d of dead) this.onDeath(d);
    }

    this.checkEnd();
    this.updateHud();
  }

  updateEntity(e, dt) {
    e.moving = false;
    if (e.deploy > 0) { e.deploy -= dt; return; }
    for (const dot of e.dots) { this.damage(e, dot.dps * dt, true); dot.t -= dt; }
    e.dots = e.dots.filter((d) => d.t > 0);
    if (e.tags.has('Regenerate') && e.kind === 'unit') e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.015 * dt);
    if (e.kind === 'building' && e.lifetime) e.hp -= (e.maxHp / e.lifetime) * dt;
    if (e.stun > 0) { e.stun -= dt; return; }

    if (e.tags.has('Aura Burn')) {
      e.auraT -= dt;
      if (e.auraT <= 0) {
        e.auraT = 1;
        for (const o of this.enemiesOf(e.side)) if (o.kind !== 'tower' && Math.hypot(o.x - e.x, o.y - e.y) < 2.5) this.damage(o, e.card.stats.aura * statMultiplier(e.level));
      }
    }
    if (e.card?.stats.spawn) {
      e.spawnTimer -= dt;
      if (e.spawnTimer <= 0) {
        e.spawnTimer = e.card.stats.spawn.every;
        const spawnCard = getCard(e.card.stats.spawn.id);
        const teleport = e.tags.has('Teleport');
        const bx = teleport ? (e.x < W / 2 ? BRIDGES[0] : BRIDGES[1]) : e.x;
        const by = teleport ? MID + e.side * 2.2 : e.y - e.side * 1.1;
        this.deploy(e.side, spawnCard, e.level, bx, by, { scale: 0.8, small: true, noSplit: true });
      }
    }

    if (e.kind === 'tower' && !e.active) return;
    if (!e.dmg) return;

    const target = this.findTarget(e);
    e.cd -= dt;
    if (!target) {
      if (e.kind === 'unit') this.moveToward(e, this.laneGoal(e), dt);
      return;
    }
    const dist = Math.hypot(target.x - e.x, target.y - e.y) - target.r - e.r;
    if (dist <= e.range) {
      if (e.cd <= 0) {
        const rage = e.tags.has('Rage on Low HP') && e.hp < e.maxHp / 2 ? 0.67 : 1;
        e.cd = e.hitSpeed * rage;
        this.attack(e, target);
      }
    } else if (e.kind === 'unit') {
      this.moveToward(e, target, dt);
    }
  }

  canHit(attacker, target) {
    if (target.air && attacker.range <= 1.2 && !attacker.air && attacker.kind === 'unit') return false;
    if (attacker.targetsBuildings && target.kind === 'unit') return false;
    return true;
  }

  findTarget(e) {
    const sight = e.kind === 'unit' ? 5.5 : e.range + 0.5;
    let best = null, bestD = Infinity;
    for (const o of this.enemiesOf(e.side)) {
      if (!this.canHit(e, o)) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y) - o.r;
      if (e.kind !== 'unit' || o.kind === 'unit') { if (d > sight) continue; }
      if (d < bestD) { best = o; bestD = d; }
    }
    if (best || e.kind !== 'unit') return best;
    return this.nearestBuilding(e);
  }

  nearestBuilding(e) {
    let best = null, bestD = Infinity;
    for (const o of this.enemiesOf(e.side)) {
      if (o.kind === 'unit') continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d < bestD) { best = o; bestD = d; }
    }
    return best;
  }

  laneGoal(e) {
    return this.nearestBuilding(e) ?? { x: e.x, y: e.side === ME ? 0 : H };
  }

  moveToward(e, target, dt) {
    let tx = target.x, ty = target.y;
    if (!e.air && (e.y > MID) !== (ty > MID)) {
      const bx = Math.abs(e.x - BRIDGES[0]) < Math.abs(e.x - BRIDGES[1]) ? BRIDGES[0] : BRIDGES[1];
      tx = bx;
      if (Math.abs(e.x - bx) > 0.35 && !(e.y > RIVER_TOP && e.y < RIVER_BOT)) ty = e.y > MID ? RIVER_BOT + 0.6 : RIVER_TOP - 0.6;
      else ty = e.y > MID ? RIVER_TOP - 0.6 : RIVER_BOT + 0.6;
    }
    const dx = tx - e.x, dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    const step = Math.min(d, e.speed * dt);
    e.moving = true;
    e.dir = { x: dx, y: dy };
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
  }

  attack(e, target) {
    const ranged = e.range > 1.2;
    e.attackAt = this.time;
    e.dir = { x: target.x - e.x, y: target.y - e.y };
    this.fx.push(ranged
      ? { type: 'shot', x: e.x, y: e.y, tx: target.x, ty: target.y, t: 0, life: 0.18, color: SIDE_COLOR[e.side] }
      : { type: 'hit', x: target.x, y: target.y, t: 0, life: 0.2 });

    const radius = e.tags.has('Splash') ? e.card?.stats.radius ?? 1 : 0;
    const victims = radius
      ? this.enemiesOf(e.side).filter((o) => this.canHit(e, o) && Math.hypot(o.x - target.x, o.y - target.y) <= radius + o.r)
      : [target];
    let dealt = 0;
    for (const v of victims) dealt += this.damage(v, e.dmg);

    if (e.tags.has('Chain Lightning')) {
      const next = this.enemiesOf(e.side).find((o) => o !== target && o.kind !== 'tower' && Math.hypot(o.x - target.x, o.y - target.y) < 3);
      if (next) {
        this.damage(next, e.dmg * 0.6);
        this.fx.push({ type: 'shot', x: target.x, y: target.y, tx: next.x, ty: next.y, t: 0, life: 0.2, color: '#fde047' });
      }
    }
    if (e.tags.has('DOT') && e.card?.stats.dot) target.dots.push({ dps: e.card.stats.dot * statMultiplier(e.level), t: 3 });
    if (e.tags.has('Lifesteal')) e.hp = Math.min(e.maxHp, e.hp + dealt * 0.3);
    if (e.tags.has('Healer')) {
      for (const a of this.ents) {
        if (a.side === e.side && a.kind === 'unit' && a.hp > 0 && Math.hypot(a.x - e.x, a.y - e.y) < 3.5) {
          a.hp = Math.min(a.maxHp, a.hp + e.card.stats.heal * statMultiplier(e.level));
        }
      }
      this.fx.push({ type: 'blast', x: e.x, y: e.y, radius: 3.5, t: 0, life: 0.4, color: '#4ade80' });
    }
    if (target.kind === 'tower' && target.isKing) target.active = true;
  }

  damage(e, amount, silent = false) {
    if (e.hp <= 0) return 0;
    if (e.phased && !silent) { e.phased = false; this.fx.push({ type: 'text', x: e.x, y: e.y - 0.8, text: 'fase!', t: 0, life: 0.7, small: true }); return 0; }
    if (e.tags.has('Armored')) amount *= 0.8;
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, amount);
      e.shield -= absorbed;
      amount -= absorbed;
    }
    e.hp -= amount;
    if (e.kind === 'tower' && e.isKing) e.active = true;
    if (e.hp <= 0 && e.tags.has('Rewind') && !e.rewound) {
      e.rewound = true;
      e.hp = e.maxHp * 0.5;
      this.fx.push({ type: 'text', x: e.x, y: e.y - 0.8, text: '⏪', t: 0, life: 0.8 });
    }
    return amount;
  }

  onDeath(d) {
    this.fx.push({ type: 'poof', x: d.x, y: d.y, t: 0, life: 0.45, art: d.kind === 'tower' ? '💥' : '💨' });
    if (d.kind === 'tower') {
      const attacker = this.sides[-d.side];
      attacker.crowns = d.isKing ? 3 : Math.min(3, attacker.crowns + 1);
      for (const t of this.ents) if (t.side === d.side && t.isKing) t.active = true;
      return;
    }
    if (d.card?.stats.deathDmg) {
      this.fx.push({ type: 'blast', x: d.x, y: d.y, radius: 2, t: 0, life: 0.45, color: '#f97316' });
      for (const o of this.enemiesOf(d.side)) if (Math.hypot(o.x - d.x, o.y - d.y) < 2 + o.r) this.damage(o, d.card.stats.deathDmg * statMultiplier(d.level));
    }
    if (d.tags.has('Split-on-Death') && !d.noSplit) {
      for (const dx of [-0.4, 0.4]) this.deploy(d.side, d.card, d.level, d.x + dx, d.y, { scale: 0.35, small: true, noSplit: true });
    }
  }

  separate() {
    const units = this.ents.filter((e) => e.kind === 'unit' && e.hp > 0);
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i], b = units[j];
        if (a.air !== b.air) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const overlap = a.r + b.r - d;
        if (overlap > 0) {
          const px = (dx / d) * overlap * 0.5, py = (dy / d) * overlap * 0.5;
          a.x -= px; a.y -= py; b.x += px; b.y += py;
        }
      }
    }
    for (const u of units) {
      u.x = Math.max(0.4, Math.min(W - 0.4, u.x));
      u.y = Math.max(0.4, Math.min(H - 0.4, u.y));
      // Keep ground units out of the water except on the bridges.
      if (!u.air && u.y > RIVER_TOP && u.y < RIVER_BOT) {
        const bx = Math.abs(u.x - BRIDGES[0]) < Math.abs(u.x - BRIDGES[1]) ? BRIDGES[0] : BRIDGES[1];
        if (Math.abs(u.x - bx) > 1) u.x += Math.sign(bx - u.x) * Math.min(Math.abs(u.x - bx) - 1, 0.2);
      }
    }
  }

  updateFx(dt) {
    for (const f of this.fx) {
      f.t += dt;
      if (f.type === 'zone') {
        for (const e of this.enemiesOf(f.side)) {
          const d = Math.hypot(e.x - f.x, e.y - f.y);
          if (d > f.radius + e.r) continue;
          this.damage(e, f.dps * dt * (e.kind === 'tower' ? f.towerFactor : 1), true);
          if (f.pull && e.kind === 'unit' && d > 0.2) { e.x += ((f.x - e.x) / d) * 1.2 * dt; e.y += ((f.y - e.y) / d) * 1.2 * dt; }
        }
      }
    }
    this.fx = this.fx.filter((f) => f.t < f.life);
  }

  // ── bot ──────────────────────────────────────────────────────────────────
  botThink(s, dt) {
    s.think -= dt;
    if (s.think > 0) return;
    s.think = 0.6 + Math.random() * 0.9;
    const side = s.side;
    const ownHalf = (y) => (side === ME ? y > MID : y < MID);
    const threats = this.enemiesOf(side).filter((e) => e.kind === 'unit' && ownHalf(e.y));
    const playable = s.hand.map((id, i) => ({ card: getCard(id), i })).filter(({ card }) => card.elixir <= s.elixir);
    if (!playable.length) return;

    if (threats.length) {
      // Spell a cluster, otherwise drop a defender between the threat and our towers.
      const cluster = threats.find((t) => threats.filter((o) => Math.hypot(o.x - t.x, o.y - t.y) < 2.5).length >= 3);
      const spell = playable.find(({ card }) => card.type === 'spell');
      if (cluster && spell) return this.play(side, spell.i, cluster.x, cluster.y);
      const defender = playable.find(({ card }) => card.type !== 'spell');
      if (!defender) return;
      const t = threats.reduce((a, b) => (side === ME ? (b.y > a.y ? b : a) : (b.y < a.y ? b : a)));
      const y = side === ME ? Math.max(RIVER_BOT + 1, Math.min(H - 1.5, t.y + 2.5)) : Math.min(RIVER_TOP - 1, Math.max(1.5, t.y - 2.5));
      const x = Math.max(1, Math.min(W - 1, t.x + (Math.random() - 0.5) * 2));
      if (this.canDeploy(side, defender.card, x, y)) this.play(side, defender.i, x, y);
      return;
    }

    // Attack once we have a good amount of elixir, targeting the weaker enemy lane.
    if (s.elixir < 6.5 + Math.random() * 2.5) return;
    const choice = pick(playable.filter(({ card }) => card.type === 'troop').length ? playable.filter(({ card }) => card.type === 'troop') : playable);
    if (choice.card.type === 'spell') {
      const enemyUnits = this.enemiesOf(side).filter((e) => e.kind !== 'tower');
      if (!enemyUnits.length) return;
      const t = pick(enemyUnits);
      return this.play(side, choice.i, t.x, t.y);
    }
    const lanes = BRIDGES.map((bx) => {
      const tower = this.enemiesOf(side).find((e) => e.kind === 'tower' && !e.isKing && Math.abs(e.x - bx) < 1);
      return { bx, hp: tower ? tower.hp : 0 };
    });
    const lane = lanes.sort((a, b) => a.hp - b.hp)[Math.random() < 0.75 ? 0 : 1];
    const tank = choice.card.stats.hp > 1500;
    const y = side === ME ? (tank ? H - 3.5 : RIVER_BOT + 2) : (tank ? 3.5 : RIVER_TOP - 2);
    const x = tank ? W / 2 + (lane.bx < W / 2 ? -2 : 2) : lane.bx;
    if (this.canDeploy(side, choice.card, x, y)) this.play(side, choice.i, x, y);
  }

  // ── end conditions ───────────────────────────────────────────────────────
  checkEnd() {
    const me = this.sides[ME], foe = this.sides[FOE];
    if (me.crowns >= 3 || foe.crowns >= 3) return this.finish();
    if ((this.mods.suddenDeath || this.overtime) && me.crowns !== foe.crowns) return this.finish();
    if (!this.overtime && this.time >= MATCH_TIME) {
      if (me.crowns !== foe.crowns) return this.finish();
      this.overtime = true;
      this.flash('SUPPLEMENTARI!');
    }
    if (this.overtime && this.time >= MATCH_TIME + OVERTIME) this.finish();
  }

  async surrender() {
    if (this.over) return;
    if (this.spectate) return this.finish(true);
    if (await confirmDialog({ title: 'Arrendersi?', message: 'La partita verrà persa con 3 corone per l\'avversario.', confirmLabel: 'Arrenditi', danger: true })) {
      this.sides[FOE].crowns = 3;
      this.finish();
    }
  }

  finish(abandon = false) {
    if (this.over) return;
    this.over = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.view?.dispose();
    const me = this.sides[ME].crowns, foe = this.sides[FOE].crowns;
    let outcome = me > foe ? 'win' : me < foe ? 'loss' : 'draw';
    if (outcome === 'draw' && !abandon) {
      // Tie-break on lowest tower health, like a real decider.
      const lowest = (side) => Math.min(...this.ents.filter((e) => e.kind === 'tower' && e.side === side).map((e) => e.hp / e.maxHp));
      const a = lowest(ME), b = lowest(FOE);
      if (Math.abs(a - b) > 0.02) outcome = a > b ? 'win' : 'loss';
    }
    setTimeout(() => {
      this.el.remove();
      this.onEnd({ outcome, crowns: me, enemyCrowns: foe, duration: fmtDuration(this.time * 1000), abandoned: abandon });
    }, abandon ? 0 : 900);
  }

  // ── rendering ────────────────────────────────────────────────────────────
  draw() {
    const { ctx, tile: T } = this;
    const [c1, c2] = this.theme.colors;
    ctx.clearRect(0, 0, W * T, H * T);

    // Field checkerboard
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#3f8f4a' : '#45994f';
        ctx.fillRect(x * T, y * T, T + 0.5, T + 0.5);
      }
    }
    // Arena theme tint
    const g = ctx.createLinearGradient(0, 0, 0, H * T);
    g.addColorStop(0, c1 + '55'); g.addColorStop(1, c2 + '55');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W * T, H * T);

    // Deploy zone while a card is selected
    if (this.selected >= 0 && !this.spectate) {
      const card = getCard(this.sides[ME].hand[this.selected]);
      if (card.type !== 'spell') {
        ctx.fillStyle = 'rgba(239,68,68,0.18)';
        ctx.fillRect(0, 0, W * T, RIVER_BOT * T);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, (RIVER_BOT + 0.4) * T, W * T, (H - RIVER_BOT) * T);
      }
    }

    // River & bridges
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, RIVER_TOP * T, W * T, (RIVER_BOT - RIVER_TOP) * T);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let x = 0; x < W; x += 1.5) ctx.fillRect((x + (this.time * 0.6) % 1.5) * T, (MID - 0.05) * T, T * 0.6, T * 0.1);
    ctx.fillStyle = '#92400e';
    for (const bx of BRIDGES) {
      ctx.fillRect((bx - 1) * T, (RIVER_TOP - 0.2) * T, 2 * T, (RIVER_BOT - RIVER_TOP + 0.4) * T);
      ctx.fillStyle = '#b45309';
      for (let i = 0; i < 4; i++) ctx.fillRect((bx - 1) * T, (RIVER_TOP + i * 0.55) * T, 2 * T, T * 0.08);
      ctx.fillStyle = '#92400e';
    }

    // Zones (under units)
    for (const f of this.fx) {
      if (f.type !== 'zone') continue;
      ctx.globalAlpha = 0.28 + 0.1 * Math.sin(f.t * 8);
      ctx.fillStyle = f.color;
      circle(ctx, f.x * T, f.y * T, f.radius * T);
      ctx.globalAlpha = 1;
      emoji(ctx, f.art, f.x * T, f.y * T, T * 1.1);
    }

    // Entities: ground first, then air
    const sorted = [...this.ents].sort((a, b) => (a.air - b.air) || a.y - b.y);
    for (const e of sorted) this.drawEntity(e);

    // Effects
    for (const f of this.fx) {
      const k = f.t / f.life;
      if (f.type === 'shot') {
        const px = f.x + (f.tx - f.x) * k, py = f.y + (f.ty - f.y) * k;
        ctx.fillStyle = f.color;
        circle(ctx, px * T, py * T, T * 0.16);
      } else if (f.type === 'blast') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = T * 0.25;
        ctx.beginPath(); ctx.arc(f.x * T, f.y * T, f.radius * T * (0.4 + k * 0.6), 0, Math.PI * 2); ctx.stroke();
        if (f.art && k < 0.5) emoji(ctx, f.art, f.x * T, f.y * T, T * 1.6);
        ctx.globalAlpha = 1;
      } else if (f.type === 'hit') {
        ctx.globalAlpha = 1 - k;
        emoji(ctx, '💢', f.x * T, f.y * T, T * 0.7);
        ctx.globalAlpha = 1;
      } else if (f.type === 'poof') {
        ctx.globalAlpha = 1 - k;
        emoji(ctx, f.art, f.x * T, (f.y - k) * T, T * (1 + k));
        ctx.globalAlpha = 1;
      } else if (f.type === 'text') {
        ctx.globalAlpha = 1 - k * k;
        ctx.font = `900 ${T * (f.small ? 0.55 : 0.9)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = T * 0.15;
        ctx.strokeStyle = '#0f172a';
        ctx.strokeText(f.text, f.x * T, (f.y - k) * T);
        ctx.fillStyle = '#fff';
        ctx.fillText(f.text, f.x * T, (f.y - k) * T);
        ctx.globalAlpha = 1;
      }
    }

    // Placement ghost
    if (this.selected >= 0 && this.pointer && !this.spectate) {
      const card = getCard(this.sides[ME].hand[this.selected]);
      const ok = this.canDeploy(ME, card, this.pointer.x, this.pointer.y);
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = ok ? '#fff' : '#ef4444';
      ctx.lineWidth = 2;
      const r = card.type === 'spell' ? card.stats.radius : 0.7;
      ctx.beginPath(); ctx.arc(this.pointer.x * T, this.pointer.y * T, r * T, 0, Math.PI * 2); ctx.stroke();
      emoji(ctx, card.art, this.pointer.x * T, this.pointer.y * T, T);
      ctx.globalAlpha = 1;
    }
  }

  drawEntity(e) {
    const { ctx, tile: T } = this;
    const x = e.x * T, y = e.y * T, r = e.r * T;
    const color = SIDE_COLOR[e.side];
    if (e.kind === 'tower') {
      const size = r * 2;
      ctx.fillStyle = '#475569';
      roundRect(ctx, x - r, y - r, size, size, T * 0.3); ctx.fill();
      ctx.fillStyle = color;
      roundRect(ctx, x - r * 0.8, y - r * 0.8, size * 0.8, size * 0.8, T * 0.25); ctx.fill();
      emoji(ctx, e.art, x, y, T * (e.isKing ? 1.4 : 1.1));
      if (e.isKing && !e.active) emoji(ctx, '💤', x + r * 0.8, y - r * 0.8, T * 0.6);
      this.hpBar(e, x, y - r - T * 0.35, r * 2.2, true);
      return;
    }
    const lift = e.air ? T * 0.5 : 0;
    if (e.air) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; circle(ctx, x, y + T * 0.15, r * 0.9); }
    ctx.globalAlpha = e.deploy > 0 ? 0.5 : 1;
    ctx.fillStyle = e.kind === 'building' ? '#1e293b' : '#0f172a';
    circle(ctx, x, y - lift, r + T * 0.08);
    ctx.fillStyle = color;
    circle(ctx, x, y - lift, r);
    if (e.shield > 0) { ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = T * 0.1; ctx.beginPath(); ctx.arc(x, y - lift, r + T * 0.12, 0, Math.PI * 2); ctx.stroke(); }
    emoji(ctx, e.art, x, y - lift, r * 1.5);
    if (e.stun > 0) emoji(ctx, '⚡', x + r, y - lift - r, T * 0.45);
    if (e.dots.length) emoji(ctx, '🟢', x - r, y - lift - r, T * 0.3);
    ctx.globalAlpha = 1;
    if (e.hp < e.maxHp || e.shield > 0) this.hpBar(e, x, y - lift - r - T * 0.25, Math.max(r * 2, T * 0.9));
  }

  hpBar(e, x, y, w, showNumber = false) {
    const { ctx, tile: T } = this;
    const hgt = showNumber ? T * 0.32 : T * 0.16;
    ctx.fillStyle = 'rgba(15,23,42,0.8)';
    ctx.fillRect(x - w / 2, y - hgt / 2, w, hgt);
    ctx.fillStyle = e.side === ME ? '#60a5fa' : '#f87171';
    ctx.fillRect(x - w / 2, y - hgt / 2, w * Math.max(0, e.hp / e.maxHp), hgt);
    if (showNumber) {
      ctx.font = `800 ${T * 0.3}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(String(Math.ceil(e.hp)), x, y + 1);
    }
  }
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  ctx.fill();
}

function emoji(ctx, ch, x, y, size) {
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y + size * 0.05);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 3D portrait of the card when available, emoji otherwise. */
function portraitOrEmoji(card, cls) {
  const url = cardPortrait(card.id);
  return url ? h('img', { class: cls, src: url, alt: '', draggable: 'false' }) : h('span', { class: cls }, card.art);
}
