import * as THREE from 'three';
import { makeCharacter, animateCharacter, makeCar, CAR_TYPES } from '../world/models.js';
import { lerp, clamp } from '../core/utils.js';

const SEND_HZ = 14;

/** Etichetta col nome che galleggia sopra l'amico. */
function nameTag(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(10,13,20,0.72)';
  ctx.roundRect(4, 10, 248, 44, 12);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 14), 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(2.2, 0.55, 1);
  sprite.position.y = 2.5;
  sprite.renderOrder = 5;
  return sprite;
}

/**
 * Sincronizza il secondo giocatore: posizione, animazione e veicolo
 * viaggiano a 14 pacchetti al secondo e vengono interpolati, cosi' anche
 * con qualche millisecondo di ritardo l'amico si muove fluido.
 */
export class Multiplayer {
  constructor(game, net) {
    this.game = game;
    this.net = net;
    this.avatar = null;
    this.car = null;
    this.carKey = '';
    this.target = { x: 0, z: 0, a: 0, sp: 0, st: 'walk', inCar: false };
    this.view = { x: 0, z: 0, a: 0 };
    this.acc = 0;
    this.name = 'Amico';

    net.onState = (m) => this._onState(m);
    net.on('hello', (m) => {
      this.name = m.name || 'Amico';
      this._retag();
      const badge = document.getElementById('net-name');
      if (badge) badge.textContent = this.name;
    });
    net.on('hit', (m) => {
      const p = game.player;
      p.damage(m.dmg || 8, 'il tuo amico');
      game.toast(`${this.name} ti ha colpito!`, 'bad');
    });
    net.on('chat', (m) => game.subtitle(`${this.name}: ${m.m}`));
    net.on('duel', (m) => game.casino.onDuel(m));
    net.on('duelNo', () => { game.casino.onDuelRefused(); game.toast('Il tuo amico ha rifiutato la sfida'); });
    net.on('close', () => this._hide());
    net.on('open', () => {
      net.send({ t: 'hello', name: this.game.playerName });
      game.toast('Amico collegato!', 'good');
    });
  }

  _ensureAvatar() {
    if (this.avatar) return;
    this.avatar = makeCharacter({ shirt: 0x9b2fbf, pants: 0x1f2632 });
    this.tag = nameTag(this.name);
    this.avatar.add(this.tag);
    this.game.worldGroup.add(this.avatar);
  }

  _retag() {
    if (!this.avatar) return;
    this.avatar.remove(this.tag);
    this.tag = nameTag(this.name);
    this.avatar.add(this.tag);
  }

  _ensureCar(type, color) {
    const key = `${type}_${color}`;
    if (this.carKey === key && this.car) return;
    if (this.car) this.game.worldGroup.remove(this.car);
    this.car = makeCar(CAR_TYPES[type] ? type : 'sedan', color, 'civil');
    this.carKey = key;
    this.game.worldGroup.add(this.car);
  }

  _hide() {
    if (this.avatar) this.avatar.visible = false;
    if (this.car) this.car.visible = false;
  }

  _onState(m) {
    this.target = m;
    if (!this.seen) {
      this.seen = true;
      this.view.x = m.x; this.view.z = m.z; this.view.a = m.a;
    }
  }

  update(dt) {
    const net = this.net;
    net.tick();
    const p = this.game.player;

    // --- invio del proprio stato
    this.acc += dt;
    if (net.connected && this.acc > 1 / SEND_HZ) {
      this.acc = 0;
      net.send({
        t: 's', x: +p.x.toFixed(2), z: +p.z.toFixed(2), a: +p.a.toFixed(2),
        sp: +p.speed.toFixed(1), st: p.dead ? 'down' : 'walk',
        inCar: !!p.car,
        ct: p.car ? p.car.type : null,
        cc: p.car ? p.car.color : 0,
        hp: Math.round(p.health),
      });
    }

    if (!net.connected || !this.seen) { this._hide(); return; }

    // --- interpolazione morbida; se e' troppo lontano (teleport o lag) si
    //     riallinea di colpo invece di attraversare mezza citta'
    if (Math.hypot(this.target.x - this.view.x, this.target.z - this.view.z) > 25) {
      this.view.x = this.target.x; this.view.z = this.target.z; this.view.a = this.target.a;
    }
    const k = clamp(dt * 9, 0, 1);
    this.view.x = lerp(this.view.x, this.target.x, k);
    this.view.z = lerp(this.view.z, this.target.z, k);
    let da = this.target.a - this.view.a;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    this.view.a += da * k;

    const inCar = this.target.inCar;
    this._ensureAvatar();
    if (inCar) {
      this._ensureCar(this.target.ct || 'sedan', this.target.cc || 0xb02b2b);
      this.car.visible = true;
      this.car.position.set(this.view.x, 0, this.view.z);
      this.car.rotation.y = this.view.a;
      this.avatar.visible = false;
      this.tag.position.set(0, 0, 0);
    } else {
      if (this.car) this.car.visible = false;
      this.avatar.visible = true;
      this.avatar.position.set(this.view.x, 0, this.view.z);
      this.avatar.rotation.y = this.view.a;
      animateCharacter(this.avatar, Math.abs(this.target.sp || 0), this.game.time,
        this.target.st === 'down' ? 'down' : 'walk', 0);
      this.tag.position.set(0, 2.5, 0);
    }
    // l'etichetta segue anche l'auto
    if (inCar && this.car) {
      this.tag.position.set(0, 0, 0);
      this.avatar.position.set(this.view.x, 1.9, this.view.z);
      this.avatar.visible = false;
      this.car.add(this.tag);
      this.tag.position.set(0, 2.6, 0);
    } else if (this.tag.parent === this.car && this.avatar) {
      this.avatar.add(this.tag);
      this.tag.position.set(0, 2.5, 0);
    }
  }

  /** Distanza dall'amico, per il pugno e per la minimappa. */
  get position() { return this.seen ? this.view : null; }
}
