import { CFG, ROAD_X, ROAD_Z, WORLD_MIN, WORLD_MAX } from '../core/config.js';
import { clamp } from '../core/utils.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: $('hud'), health: $('bar-health'), armor: $('bar-armor'), money: $('money'),
      clock: $('clock'), stars: $('stars'), speedo: $('speedo'), speed: $('speed-val'),
      gear: $('gear'), prompt: $('prompt'), toasts: $('toasts'), flash: $('flash'),
      subtitle: $('subtitle'), mission: $('mission-panel'), mTitle: $('mission-title'),
      mSub: $('mission-sub'), shop: $('shop'), shopName: $('shop-name'),
      shopDesc: $('shop-desc'), shopItems: $('shop-items'), lblAction: $('lbl-action'),
      lblAttack: $('lbl-attack'), lblJump: $('lbl-jump'), lblRun: $('lbl-run'), weapon: $('weapon'),
      evade: $('evade'), evadeBar: $('evade').firstElementChild,
      wayDist: $('waydist'), wayVal: $('way-dist'), friendLine: $('friendline'), friendVal: $('friend-dist'),
    };
    this.map = $('minimap');
    this.ctx = this.map.getContext('2d');
    this.flashT = 0;
    this.subT = 0;
    this.shopOpen = false;

    $('shop-close').addEventListener('click', () => this.hideShop());
  }

  show() { this.el.hud.classList.remove('hidden'); }

  toast(msg, kind = '') {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = msg;
    this.el.toasts.appendChild(d);
    setTimeout(() => { d.style.transition = 'opacity .4s'; d.style.opacity = '0'; }, 2200);
    setTimeout(() => d.remove(), 2700);
  }

  subtitle(text, t = 2.4) {
    this.el.subtitle.textContent = text;
    this.el.subtitle.classList.remove('hidden');
    this.subT = t;
  }

  flash() { this.flashT = 0.35; }

  prompt(text) {
    if (!text) { this.el.prompt.classList.add('hidden'); return; }
    this.el.prompt.innerHTML = text;
    this.el.prompt.classList.remove('hidden');
  }

  mission(title, sub) {
    if (!title) { this.el.mission.classList.add('hidden'); return; }
    this.el.mission.classList.remove('hidden');
    this.el.mTitle.textContent = title;
    this.el.mSub.textContent = sub || '';
  }

  /** Etichette dei pulsanti touch, dipendono dal contesto. */
  touchLabels(action, attack, jump) {
    this.el.lblAction.textContent = action;
    this.el.lblAttack.textContent = attack;
    this.el.lblJump.textContent = jump;
  }

  showShop(menu, onBuy) {
    const g = this.game;
    this.shopOpen = true;
    this.el.shop.classList.remove('hidden');
    this.el.shopName.textContent = menu.title;
    this.el.shopDesc.textContent = menu.desc;
    this.el.shopItems.innerHTML = '';
    for (const item of menu.items) {
      const can = g.player.money >= item.price;
      const row = document.createElement('div');
      row.className = `item${can ? '' : ' cant'}`;
      row.innerHTML = `<div class="ico">${item.icon}</div>
        <div class="txt"><b>${item.name}</b><small>${item.desc}</small></div>
        <div class="price">${item.price ? '$' + item.price : 'GRATIS'}</div>`;
      row.addEventListener('click', () => onBuy(item));
      this.el.shopItems.appendChild(row);
    }
  }

  refreshShop(menu, onBuy) { if (this.shopOpen) this.showShop(menu, onBuy); }

  hideShop() {
    this.shopOpen = false;
    this.el.shop.classList.add('hidden');
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.el.health.style.width = `${clamp(p.health, 0, 100)}%`;
    this.el.armor.style.width = `${clamp(p.armor, 0, 100)}%`;
    this.el.money.textContent = `$${p.money.toLocaleString('it-IT')}`;
    const hh = Math.floor(g.clock) % 24, mm = Math.floor((g.clock % 1) * 60);
    this.el.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.el.stars.textContent = '★'.repeat(g.wanted) + '☆'.repeat(Math.max(0, 5 - g.wanted));
    // barra di fuga: quando e' piena le stelle spariscono
    const chasing = g.wanted > 0;
    this.el.evade.classList.toggle('hidden', !chasing);
    this.el.stars.classList.toggle('evading', chasing && g.evading);
    if (chasing) this.el.evadeBar.style.width = `${clamp((g.wantedT / g.evadeTime) * 100, 0, 100)}%`;
    if (p.weapon === 'pistol') {
      this.el.weapon.classList.remove('hidden');
      this.el.weapon.innerHTML = `🔫 <b>${p.ammo}</b>`;
    } else this.el.weapon.classList.add('hidden');

    // distanza dalla destinazione e dall'amico
    const way = g.waypoint;
    this.el.wayDist.classList.toggle('hidden', !way);
    if (way) this.el.wayVal.textContent = `${Math.round(Math.hypot(way.x - p.x, way.z - p.z))} m`;
    const friend = g.mp && g.mp.position;
    this.el.friendLine.classList.toggle('hidden', !friend);
    if (friend) {
      this.el.friendVal.textContent = `${g.mp.name} · ${Math.round(Math.hypot(friend.x - p.x, friend.z - p.z))} m`;
    }

    if (p.inCar) {
      this.el.speedo.classList.remove('hidden');
      this.el.speed.textContent = Math.round(p.car.kmh);
      this.el.gear.textContent = p.car.speed < -0.4 ? 'R' : 'D';
    } else {
      this.el.speedo.classList.add('hidden');
    }

    if (this.flashT > 0) {
      this.flashT -= dt;
      this.el.flash.style.opacity = String(Math.max(0, this.flashT) * 0.7);
    }
    if (this.subT > 0) {
      this.subT -= dt;
      if (this.subT <= 0) this.el.subtitle.classList.add('hidden');
    }
    this.drawMap();
  }

  drawMap() {
    const g = this.game, p = g.player, ctx = this.ctx;
    const S = this.map.width, half = S / 2;
    const scale = 0.42;   // pixel per metro

    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath(); ctx.arc(half, half, half - 1, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, S, S);

    ctx.translate(half, half);
    ctx.rotate(p.a - Math.PI / 2);
    ctx.scale(scale, scale);
    ctx.translate(-p.x, -p.z);

    // isolati
    ctx.fillStyle = '#2b3546';
    ctx.fillRect(WORLD_MIN, WORLD_MIN, WORLD_MAX - WORLD_MIN, WORLD_MAX - WORLD_MIN);
    // strade
    ctx.strokeStyle = '#4a586e';
    ctx.lineWidth = CFG.ROAD * 0.8;
    ctx.beginPath();
    for (const c of ROAD_X) { ctx.moveTo(c, WORLD_MIN); ctx.lineTo(c, WORLD_MAX); }
    for (const c of ROAD_Z) { ctx.moveTo(WORLD_MIN, c); ctx.lineTo(WORLD_MAX, c); }
    ctx.stroke();

    const blip = (x, z, color, r = 5) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, z, r / scale * 0.55, 0, Math.PI * 2); ctx.fill();
    };

    for (const d of g.city.doors) {
      if (Math.abs(d.x - p.x) > 260 || Math.abs(d.z - p.z) > 260) continue;
      blip(d.x, d.z, d.type === 'home' ? '#ffe9a8' : '#3ddc84', 4);
    }
    const LANDMARK_COLOR = { police: '#4cc2ff', hospital: '#ff6b6b', gas: '#ff9d3f',
      sport: '#a8e05f', pier: '#8ad8ff', casino: '#ffd23f' };
    for (const l of g.city.landmarks) blip(l.x, l.z, LANDMARK_COLOR[l.kind] || '#ffffff', 8);
    for (const m of g.missions.markers) blip(m.x, m.z, '#ffd23f', 7);
    if (g.missions.objective) blip(g.missions.objective.x, g.missions.objective.z, '#ff9d3f', 8);
    for (const v of g.traffic.all()) {
      if (Math.abs(v.x - p.x) > 200 || Math.abs(v.z - p.z) > 200) continue;
      blip(v.x, v.z, '#98a3b5', 3);
    }
    for (const v of g.police.cars) if (v.active) blip(v.x, v.z, '#4cc2ff', 6);

    ctx.restore();

    /**
     * Segnaposto che restano visibili: se il bersaglio esce dalla
     * minimappa compare una freccia sul bordo con la sua direzione.
     */
    const edgeMarker = (wx, wz, color, label) => {
      const dx = wx - p.x, dz = wz - p.z;
      // stesse trasformazioni della mappa, ma calcolate a mano
      const rot = p.a - Math.PI / 2;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      let sx = (dx * cos - dz * sin) * scale;
      let sy = (dx * sin + dz * cos) * scale;
      const r = half - 12;
      const dist = Math.hypot(sx, sy);
      const outside = dist > r;
      if (outside) { sx = (sx / dist) * r; sy = (sy / dist) * r; }
      ctx.save();
      ctx.translate(half + sx, half + sy);
      ctx.fillStyle = color;
      if (outside) {
        ctx.rotate(Math.atan2(sy, sx) + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -9); ctx.lineTo(7, 7); ctx.lineTo(-7, 7);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#0d1119'; ctx.lineWidth = 2; ctx.stroke();
      }
      if (label) {
        ctx.rotate(0);
        ctx.fillStyle = '#0d1119cc';
        ctx.fillRect(-16, 9, 32, 12);
        ctx.fillStyle = color;
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(label, 0, 18);
      }
      ctx.restore();
    };

    if (g.waypoint) {
      const d = Math.round(Math.hypot(g.waypoint.x - p.x, g.waypoint.z - p.z));
      edgeMarker(g.waypoint.x, g.waypoint.z, '#ff9d3f', `${d}m`);
    }
    const friendPos = g.mp && g.mp.position;
    if (friendPos) {
      const d = Math.round(Math.hypot(friendPos.x - p.x, friendPos.z - p.z));
      edgeMarker(friendPos.x, friendPos.z, '#c56bff', `${d}m`);
    }

    // freccia del giocatore sempre al centro
    ctx.save();
    ctx.translate(half, half);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6, 7);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#ffffff35';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(half, half, half - 2, 0, Math.PI * 2); ctx.stroke();
  }
}
