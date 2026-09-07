import { rand, pick } from '../core/utils.js';
import { Vehicle } from '../entities/vehicle.js';

/**
 * Eventi casuali: la citta' ogni tanto fa succedere qualcosa vicino a te.
 * Riusano i bot e i veicoli che ci sono gia', non creano sistemi nuovi.
 * Ognuno ha un titolo, una durata e un esito che puoi cambiare.
 */
export class RandomEvents {
  constructor(game) {
    this.game = game;
    this.timer = 35 + Math.random() * 40;
    this.active = null;
    this.cooldown = 0;
    this.done = 0;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.active) { this._run(dt); return; }
    if (this.game.interiors.current || this.game.wanted > 0 || this.game.missions.active) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 55 + Math.random() * 70;
    this._start();
  }

  // ------------------------------------------------------------------ avvio
  _start() {
    const g = this.game;
    const kinds = ['scippo', 'rissa', 'incidente', 'autostop'];
    const kind = pick(kinds);
    const spot = this._spotAhead(kind === 'incidente' || kind === 'autostop' ? 'road' : 'walk');
    if (!spot) return;
    if (kind === 'scippo') this._mugging(spot);
    else if (kind === 'rissa') this._brawl(spot);
    else if (kind === 'incidente') this._crash(spot);
    else this._hitchhiker(spot);
  }

  /** Un punto davanti al giocatore, abbastanza vicino da vederlo arrivare. */
  _spotAhead(kind) {
    const g = this.game, p = g.player;
    // gli incroci sono radi: se non ne trovo uno buono ripiego sul marciapiede
    const node = kind === 'road'
      ? (g.city.randomRoadNode(p.x, p.z, 30, 150) || g.city.randomWalkNode(p.x, p.z, 26, 90))
      : g.city.randomWalkNode(p.x, p.z, 26, 70);
    return node || null;
  }

  /** Prende due bot liberi e li piazza sul posto. */
  _grab(n, x, z) {
    const out = [];
    for (const ped of this.game.peds.peds) {
      if (out.length >= n) break;
      if (ped.state === 'down' || ped.event) continue;
      out.push(ped);
    }
    for (const ped of out) {
      ped.spawnFree(x + rand(-1.2, 1.2), z + rand(-1.2, 1.2));
      ped.event = true;
    }
    return out.length === n ? out : (out.forEach((p) => { p.event = false; }), null);
  }

  // ------------------------------------------------------------- gli eventi
  _mugging(spot) {
    const two = this._grab(2, spot.x, spot.z);
    if (!two) return;
    const [thief, victim] = two;
    thief.mood = 'brave';
    victim.knockDown(this.game, thief);
    thief.state = 'flee';
    thief.timer = 30;
    thief.fleeX = victim.x; thief.fleeZ = victim.z;
    thief.baseSpeed = 4.6;
    this.active = {
      kind: 'scippo', t: 26, thief, victim,
      title: 'SCIPPO', sub: 'Fermalo e ti tieni il malloppo.',
      loot: 120 + ((Math.random() * 220) | 0),
    };
    this._announce('Scippo in corso!', 'bad');
  }

  _brawl(spot) {
    const two = this._grab(2, spot.x, spot.z);
    if (!two) return;
    for (const p of two) { p.state = 'fight'; p.timer = 24; p.mood = 'brave'; }
    two[0].foe = two[1];
    two[1].foe = two[0];
    this.active = { kind: 'rissa', t: 22, peds: two, title: 'RISSA', sub: 'Due tizi se le danno di santa ragione.' };
    this._announce('Rissa per strada', '');
  }

  _crash(spot) {
    const g = this.game;
    const cars = [];
    for (let i = 0; i < 2; i++) {
      const v = new Vehicle(g.city, { type: pick(['sedan', 'suv', 'muscle']) });
      v.x = spot.x + (i ? 2.6 : -1.2) + rand(-0.6, 0.6);
      v.z = spot.z + (i ? 1.1 : -0.8) + rand(-0.6, 0.6);
      v.a = rand(0, 6.28);
      v.speed = 0;
      v.driver = 'wreck';
      v.health = 22 + Math.random() * 14;
      g.worldGroup.add(v.mesh);
      v.sync();
      // gia' ammaccate: si sono appena tamponate
      for (let k = 0; k < 3; k++) {
        v.dentAt(v.x + v.fx * v.spec.L * 0.4 + rand(-0.6, 0.6), v.z + v.fz * v.spec.L * 0.4 + rand(-0.6, 0.6), 13);
      }
      cars.push(v);
    }
    const watchers = this._grab(2, spot.x + 3, spot.z + 3);
    if (watchers) for (const w of watchers) w.watch(g, spot.x, spot.z);
    this.active = {
      kind: 'incidente', t: 40, cars, peds: watchers || [],
      title: 'INCIDENTE', sub: 'Tamponamento. Le auto sono ancora guidabili.',
    };
    this._announce('Incidente poco più avanti', '');
  }

  _hitchhiker(spot) {
    const one = this._grab(1, spot.x, spot.z);
    if (!one) return;
    const ped = one[0];
    ped.state = 'wave';
    ped.timer = 60;
    ped.speed = 0;
    const dest = this.game.city.randomWalkNode(spot.x, spot.z, 120, 300) || spot;
    this.active = {
      kind: 'autostop', t: 55, ped, dest, picked: false,
      title: 'AUTOSTOP', sub: 'Fermati in auto accanto a lui.',
      fee: 90 + ((Math.random() * 160) | 0),
    };
    this._announce('Qualcuno chiede un passaggio', '');
  }

  // ------------------------------------------------------------ svolgimento
  _run(dt) {
    const g = this.game, a = this.active;
    a.t -= dt;
    // il pannello e' delle missioni: lo usiamo solo se e' libero
    if (!g.missions.active) g.hud.mission(a.title, a.sub);

    if (a.kind === 'scippo') {
      const t = a.thief;
      if (t.state === 'down' || t.health < t.maxHealth * 0.55) {
        g.player.earn(a.loot);
        g.toast(`Ladro fermato: +$${a.loot}`, 'good');
        this.done++;
        return this._end();
      }
      if (a.t <= 0) { g.toast('Il ladro è scappato', 'bad'); return this._end(); }
      return;
    }

    if (a.kind === 'rissa') {
      if (a.t <= 0 || a.peds.every((p) => p.state === 'down')) return this._end();
      return;
    }

    if (a.kind === 'incidente') {
      if (a.t <= 0) {
        for (const c of a.cars) {
          if (c.driver === 'player') continue;         // se l'hai presa, e' tua
          g.worldGroup.remove(c.mesh);
        }
        return this._end();
      }
      return;
    }

    if (a.kind === 'autostop') {
      const p = g.player;
      if (!a.picked) {
        const d = Math.hypot(a.ped.x - p.x, a.ped.z - p.z);
        if (p.inCar && d < 4.5 && Math.abs(p.car.speed) < 2) {
          a.picked = true;
          a.ped.mesh.visible = false;
          a.sub = 'Portalo a destinazione.';
          g.setWaypoint({ x: a.dest.x, z: a.dest.z, label: 'Passeggero' });
          g.toast('È salito. Portalo dove ti indica', 'good');
        } else if (a.t <= 0) { g.toast('Se ne è andato a piedi', ''); return this._end(); }
        return;
      }
      const dd = Math.hypot(a.dest.x - p.x, a.dest.z - p.z);
      if (dd < 9 && p.inCar && Math.abs(p.car.speed) < 3) {
        a.ped.mesh.visible = true;
        a.ped.spawnFree(p.x + 2, p.z + 2);
        a.ped.state = 'walk';
        g.player.earn(a.fee);
        g.toast(`Passaggio pagato: +$${a.fee}`, 'good');
        this.done++;
        g.setWaypoint(null);
        return this._end();
      }
      if (a.t <= -90) { a.ped.mesh.visible = true; g.setWaypoint(null); return this._end(); }
      return;
    }
  }

  _announce(msg, kind) {
    this.game.toast(msg, kind);
    this.game.audio.blip(520, 0.08, 'sine', 0.16);
  }

  _end() {
    const a = this.active;
    if (a) {
      for (const p of [a.thief, a.victim, a.ped, ...(a.peds || [])]) {
        if (!p) continue;
        p.event = false;
        p.foe = null;
        if (p.baseSpeed > 3) p.baseSpeed = rand(1.1, 1.9);
      }
    }
    this.active = null;
    if (!this.game.missions.active) this.game.hud.mission(null);
    this.cooldown = 20;
  }
}
