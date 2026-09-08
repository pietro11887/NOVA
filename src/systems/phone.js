/**
 * Telefono: la rubrica del gioco. Si apre col tasto T o dal pulsante
 * nell'HUD, e da li' chiami chi ti serve. Ogni voce dice quanto costa
 * prima che tu la tocchi.
 */
export class Phone {
  constructor(game) {
    this.game = game;
    this.open = false;
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'phone';
    el.className = 'overlay hidden';
    el.innerHTML = `
      <div class="phone-body">
        <div class="phone-bar"><span id="phone-time">08:00</span><span>NOVA ▮▮▮</span></div>
        <h3>Rubrica</h3>
        <div id="phone-list"></div>
        <button class="btn ghost" id="phone-close">Chiudi</button>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.list = el.querySelector('#phone-list');
    this.time = el.querySelector('#phone-time');
    el.querySelector('#phone-close').addEventListener('click', () => this.hide());
    el.addEventListener('click', (e) => { if (e.target === el) this.hide(); });
  }

  /** Le voci si ricalcolano ogni volta: dipendono da dove sei e cosa hai. */
  _entries() {
    const g = this.game;
    const out = [];
    const taxi = g.taxi;
    if (taxi.state === 'waiting') {
      out.push({ icon: '🚕', name: 'Sali sul taxi', desc: 'Ti porta alla destinazione sulla mappa',
        cost: 'a tassametro', go: () => { taxi.board(); this.hide(); } });
    } else if (taxi.busy) {
      out.push({ icon: '🚕', name: 'Annulla il taxi', desc: 'Lascia perdere la corsa',
        cost: '', go: () => { taxi.drop(); this.hide(); } });
    } else {
      // si dice quale taxi arriverebbe: e' uno di quelli che vedi sulla mappa
      const near = g.traffic.freeTaxi(g.player.x, g.player.z, 260);
      const desc = near
        ? `Il più vicino è a ${Math.round(Math.hypot(near.v.x - g.player.x, near.v.z - g.player.z))} m`
        : 'Nessuno qui vicino: ne arriva uno da fuori';
      out.push({ icon: '🚕', name: 'Chiama un taxi', desc,
        cost: '$25 + $0,35/m', go: () => { taxi.call(); this.hide(); } });
    }
    out.push({ icon: '🔧', name: 'Meccanico', desc: 'Ti porta qui la tua ultima auto, riparata',
      cost: '$200', go: () => { g.phoneMechanic(); this.hide(); } });
    out.push({ icon: '🍔', name: 'Consegna a domicilio', desc: 'Un pasto caldo, salute al massimo',
      cost: '$45', go: () => { g.phoneFood(); this.hide(); } });
    if (g.mp && g.mp.position) {
      out.push({ icon: '👥', name: 'Il tuo amico', desc: 'Mette la sua posizione come destinazione',
        cost: 'gratis', go: () => { g.setWaypoint({ x: g.mp.position.x, z: g.mp.position.z, friend: true, label: 'Amico' }); this.hide(); } });
    }
    out.push({ icon: '🗺️', name: 'Apri la mappa', desc: 'Per scegliere dove andare',
      cost: '', go: () => { this.hide(); g.map.show(); } });
    return out;
  }

  show() {
    if (this.game.interiors.current) { this.game.toast('Non qui dentro'); return; }
    this.open = true;
    this.el.classList.remove('hidden');
    this.list.innerHTML = '';
    for (const e of this._entries()) {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `<div class="ico">${e.icon}</div><div class="txt"><b>${e.name}</b><small>${e.desc}</small></div>
        <div class="price">${e.cost}</div>`;
      row.addEventListener('click', () => { this.game.audio.ui(); e.go(); });
      this.list.appendChild(row);
    }
    const h = Math.floor(this.game.clock) % 24, m = Math.floor((this.game.clock % 1) * 60);
    this.time.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  hide() { this.open = false; this.el.classList.add('hidden'); }
  toggle() { this.open ? this.hide() : this.show(); }
}
