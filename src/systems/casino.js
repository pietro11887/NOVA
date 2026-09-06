/**
 * Casino' NOVA: slot, roulette e blackjack. Tutta l'interfaccia vive in un
 * overlay HTML costruito qui dentro, cosi' il 3D resta libero e i tavoli
 * si giocano bene anche con il pollice.
 */

const SYMBOLS = [
  { s: '🍒', w: 26, pay: 4 },
  { s: '🍋', w: 22, pay: 5 },
  { s: '🔔', w: 18, pay: 8 },
  { s: '💎', w: 12, pay: 15 },
  { s: '🎰', w: 8, pay: 30 },
  { s: '7️⃣', w: 5, pay: 60 },
];

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const CARD_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

const pickSymbol = () => {
  const total = SYMBOLS.reduce((a, s) => a + s.w, 0);
  let r = Math.random() * total;
  for (const s of SYMBOLS) { r -= s.w; if (r <= 0) return s; }
  return SYMBOLS[0];
};

export class Casino {
  constructor(game) {
    this.game = game;
    this.bet = 50;
    this.open = false;
    this.tab = 'slot';
    this.busy = false;
    this._build();
  }

  // ------------------------------------------------------------------ DOM
  _build() {
    const el = document.createElement('div');
    el.id = 'casino';
    el.className = 'overlay hidden';
    el.innerHTML = `
      <div class="panel casino-panel">
        <div class="casino-head">
          <h2>CASINÒ NOVA</h2>
          <div class="casino-bank">Saldo <b id="cas-money">$0</b></div>
        </div>
        <div class="casino-tabs">
          <button data-tab="slot" class="on">🎰 Slot</button>
          <button data-tab="roulette">🎯 Roulette</button>
          <button data-tab="black">🃏 Blackjack</button>
          <button data-tab="duel" id="cas-tab-duel" class="hidden">⚔️ Sfida</button>
        </div>

        <div class="casino-body">
          <section data-view="slot">
            <div class="reels"><span id="r0">🍒</span><span id="r1">🔔</span><span id="r2">💎</span></div>
            <div class="paytable">
              7️⃣×3 = 60× · 🎰×3 = 30× · 💎×3 = 15× · 🔔×3 = 8× · 🍋×3 = 5× · 🍒×3 = 4× · due uguali = 1,5×
            </div>
            <button class="btn play" id="cas-spin">GIRA</button>
          </section>

          <section data-view="roulette" class="hidden">
            <div class="wheel"><div id="cas-ball">—</div></div>
            <div class="bets" id="cas-rbets">
              <button data-b="red">Rosso <small>2×</small></button>
              <button data-b="black">Nero <small>2×</small></button>
              <button data-b="even">Pari <small>2×</small></button>
              <button data-b="odd">Dispari <small>2×</small></button>
              <button data-b="low">1-18 <small>2×</small></button>
              <button data-b="high">19-36 <small>2×</small></button>
              <button data-b="dozen1">1-12 <small>3×</small></button>
              <button data-b="dozen2">13-24 <small>3×</small></button>
              <button data-b="dozen3">25-36 <small>3×</small></button>
            </div>
            <div class="numpick">
              <label>Numero pieno <small>36×</small></label>
              <input id="cas-num" type="number" min="0" max="36" value="7" />
              <button class="btn ghost" id="cas-num-go">Punta sul numero</button>
            </div>
          </section>

          <section data-view="black" class="hidden">
            <div class="bj-row"><span>Banco</span><div class="cards" id="bj-dealer">—</div><b id="bj-dv"></b></div>
            <div class="bj-row"><span>Tu</span><div class="cards" id="bj-player">—</div><b id="bj-pv"></b></div>
            <div class="bj-actions">
              <button class="btn" id="bj-deal">Distribuisci</button>
              <button class="btn ghost hidden" id="bj-hit">Carta</button>
              <button class="btn ghost hidden" id="bj-stand">Stai</button>
            </div>
          </section>

          <section data-view="duel" class="hidden">
            <p class="duel-info" id="duel-info">Sfida il tuo amico: vincitore prende tutto.</p>
            <button class="btn play" id="duel-go">LANCIA LA SFIDA</button>
            <div id="duel-log"></div>
          </section>
        </div>

        <div class="casino-foot">
          <div class="chips" id="cas-chips"></div>
          <div class="casino-msg" id="cas-msg">Scegli la puntata e tenta la fortuna.</div>
          <button class="btn ghost" id="cas-close">Esci (E)</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;

    const $ = (id) => el.querySelector(`#${id}`);
    this.ui = {
      money: $('cas-money'), msg: $('cas-msg'), chips: $('cas-chips'),
      reels: [$('r0'), $('r1'), $('r2')], spin: $('cas-spin'),
      ball: $('cas-ball'), num: $('cas-num'),
      dealer: $('bj-dealer'), player: $('bj-player'), dv: $('bj-dv'), pv: $('bj-pv'),
      deal: $('bj-deal'), hit: $('bj-hit'), stand: $('bj-stand'),
      duelInfo: $('duel-info'), duelGo: $('duel-go'), duelLog: $('duel-log'),
      tabDuel: $('cas-tab-duel'),
    };

    for (const b of el.querySelectorAll('.casino-tabs button')) {
      b.addEventListener('click', () => this._setTab(b.dataset.tab));
    }
    for (const amount of [10, 50, 100, 500, 2000]) {
      const c = document.createElement('button');
      c.className = 'chip';
      c.textContent = `$${amount}`;
      c.addEventListener('click', () => { this.bet = amount; this._refresh(); });
      c.dataset.amount = amount;
      this.ui.chips.appendChild(c);
    }
    $('cas-close').addEventListener('click', () => this.hide());
    this.ui.spin.addEventListener('click', () => this.spinSlot());
    for (const b of el.querySelectorAll('#cas-rbets button')) {
      b.addEventListener('click', () => this.spinRoulette(b.dataset.b));
    }
    $('cas-num-go').addEventListener('click', () => this.spinRoulette('number'));
    this.ui.deal.addEventListener('click', () => this.bjDeal());
    this.ui.hit.addEventListener('click', () => this.bjHit());
    this.ui.stand.addEventListener('click', () => this.bjStand());
    this.ui.duelGo.addEventListener('click', () => this.duel());
  }

  _setTab(tab) {
    this.tab = tab;
    for (const b of this.el.querySelectorAll('.casino-tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
    for (const s of this.el.querySelectorAll('.casino-body section')) s.classList.toggle('hidden', s.dataset.view !== tab);
  }

  _refresh() {
    const p = this.game.player;
    this.ui.money.textContent = `$${p.money.toLocaleString('it-IT')}`;
    for (const c of this.ui.chips.children) {
      c.classList.toggle('on', +c.dataset.amount === this.bet);
      c.classList.toggle('cant', +c.dataset.amount > p.money);
    }
    const online = this.game.net && this.game.net.connected;
    this.ui.tabDuel.classList.toggle('hidden', !online);
    if (!online && this.tab === 'duel') this._setTab('slot');
  }

  msg(text, kind = '') {
    this.ui.msg.textContent = text;
    this.ui.msg.className = `casino-msg ${kind}`;
  }

  show(spot = 'slot') {
    this.open = true;
    this.el.classList.remove('hidden');
    this._setTab(spot === 'roulette' || spot === 'black' ? spot : 'slot');
    this._refresh();
    this.msg('Scegli la puntata e tenta la fortuna.');
  }

  hide() {
    this.open = false;
    this.el.classList.add('hidden');
  }

  /** Toglie la puntata dal saldo; false se non bastano i soldi. */
  _stake() {
    const p = this.game.player;
    if (this.busy) return false;
    if (p.money < this.bet) { this.msg('Saldo insufficiente per questa puntata', 'bad'); this.game.audio.blip(160, 0.12); return false; }
    p.pay(this.bet);
    this._refresh();
    return true;
  }

  _win(amount, text) {
    const p = this.game.player;
    if (amount > 0) {
      p.earn(amount);
      this.game.stats.casinoWon = (this.game.stats.casinoWon || 0) + amount;
      this.msg(`${text} +$${amount}`, 'good');
    } else {
      this.game.stats.casinoLost = (this.game.stats.casinoLost || 0) + this.bet;
      this.msg(text, 'bad');
      this.game.audio.blip(150, 0.18, 'sawtooth', 0.2);
    }
    this._refresh();
    this.game.save();
  }

  // ------------------------------------------------------------------ slot
  spinSlot() {
    if (!this._stake()) return;
    this.busy = true;
    this.ui.spin.disabled = true;
    const result = [pickSymbol(), pickSymbol(), pickSymbol()];
    let ticks = 0;
    const roll = () => {
      ticks++;
      for (let i = 0; i < 3; i++) {
        if (ticks > 8 + i * 5) this.ui.reels[i].textContent = result[i].s;
        else this.ui.reels[i].textContent = pickSymbol().s;
      }
      this.game.audio.blip(420 + (ticks % 3) * 90, 0.03, 'square', 0.08);
      if (ticks < 24) {
        setTimeout(roll, 55 + ticks * 4);
      } else {
        this.busy = false;
        this.ui.spin.disabled = false;
        const [a, b, c] = result;
        if (a.s === b.s && b.s === c.s) {
          this._win(this.bet * a.pay, `Tris di ${a.s}!`);
          this.game.audio.cash();
        } else if (a.s === b.s || b.s === c.s || a.s === c.s) {
          this._win(Math.round(this.bet * 1.5), 'Due uguali:');
        } else {
          this._win(0, 'Niente. Riprova.');
        }
      }
    };
    roll();
  }

  // -------------------------------------------------------------- roulette
  spinRoulette(kind) {
    if (!this._stake()) return;
    this.busy = true;
    const n = Math.floor(Math.random() * 37);
    const target = kind === 'number' ? clamp0(this.ui.num.value) : null;
    let ticks = 0;
    const roll = () => {
      ticks++;
      this.ui.ball.textContent = ticks < 22 ? String(Math.floor(Math.random() * 37)) : String(n);
      this.ui.ball.className = ticks < 22 ? '' : (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
      this.game.audio.blip(700 - ticks * 12, 0.03, 'square', 0.07);
      if (ticks < 22) return setTimeout(roll, 60 + ticks * 6);

      this.busy = false;
      const color = n === 0 ? 'verde' : RED.has(n) ? 'rosso' : 'nero';
      let mult = 0;
      if (kind === 'red' && RED.has(n)) mult = 2;
      else if (kind === 'black' && n !== 0 && !RED.has(n)) mult = 2;
      else if (kind === 'even' && n !== 0 && n % 2 === 0) mult = 2;
      else if (kind === 'odd' && n % 2 === 1) mult = 2;
      else if (kind === 'low' && n >= 1 && n <= 18) mult = 2;
      else if (kind === 'high' && n >= 19) mult = 2;
      else if (kind === 'dozen1' && n >= 1 && n <= 12) mult = 3;
      else if (kind === 'dozen2' && n >= 13 && n <= 24) mult = 3;
      else if (kind === 'dozen3' && n >= 25) mult = 3;
      else if (kind === 'number' && n === target) mult = 36;
      if (mult) { this._win(this.bet * mult, `Esce ${n} ${color}:`); this.game.audio.cash(); }
      else this._win(0, `Esce ${n} ${color}. Puntata persa.`);
    };
    roll();
  }

  // ------------------------------------------------------------- blackjack
  _card() {
    const v = CARD_NAMES[Math.floor(Math.random() * CARD_NAMES.length)];
    return { v, s: SUITS[Math.floor(Math.random() * 4)] };
  }

  _score(cards) {
    let total = 0, aces = 0;
    for (const c of cards) {
      if (c.v === 'A') { total += 11; aces++; }
      else if (['J', 'Q', 'K', '10'].includes(c.v)) total += 10;
      else total += +c.v;
    }
    while (total > 21 && aces) { total -= 10; aces--; }
    return total;
  }

  _renderBJ(hideDealer) {
    const fmt = (c) => `<i class="${c.s === '♥' || c.s === '♦' ? 'r' : ''}">${c.v}${c.s}</i>`;
    this.ui.player.innerHTML = this.hand.map(fmt).join('');
    this.ui.dealer.innerHTML = hideDealer
      ? fmt(this.dealer[0]) + '<i class="back">?</i>'
      : this.dealer.map(fmt).join('');
    this.ui.pv.textContent = this._score(this.hand);
    this.ui.dv.textContent = hideDealer ? '' : this._score(this.dealer);
  }

  bjDeal() {
    if (!this._stake()) return;
    this.hand = [this._card(), this._card()];
    this.dealer = [this._card(), this._card()];
    this.busy = true;
    this.ui.deal.classList.add('hidden');
    this.ui.hit.classList.remove('hidden');
    this.ui.stand.classList.remove('hidden');
    this._renderBJ(true);
    this.game.audio.blip(520, 0.05, 'square', 0.1);
    if (this._score(this.hand) === 21) this.bjStand();
    else this.msg('Carta o stai?');
  }

  bjHit() {
    if (!this.hand) return;
    this.hand.push(this._card());
    this.game.audio.blip(480, 0.05, 'square', 0.1);
    this._renderBJ(true);
    if (this._score(this.hand) > 21) this._bjEnd('Sballato!');
  }

  bjStand() {
    if (!this.hand || !this.dealer) return;
    while (this._score(this.dealer) < 17) this.dealer.push(this._card());
    this._bjEnd();
  }

  _bjEnd(forced) {
    this.busy = false;
    this.ui.deal.classList.remove('hidden');
    this.ui.hit.classList.add('hidden');
    this.ui.stand.classList.add('hidden');
    this._renderBJ(false);
    const me = this._score(this.hand), him = this._score(this.dealer);
    if (forced || me > 21) this._win(0, forced || 'Sballato!');
    else if (me === 21 && this.hand.length === 2) { this._win(Math.round(this.bet * 2.5), 'Blackjack!'); this.game.audio.cash(); }
    else if (him > 21) { this._win(this.bet * 2, 'Il banco sballa:'); this.game.audio.cash(); }
    else if (me > him) { this._win(this.bet * 2, `${me} contro ${him}:`); this.game.audio.cash(); }
    else if (me === him) { this._win(this.bet, 'Pareggio, puntata resa.'); }
    else this._win(0, `${me} contro ${him}. Vince il banco.`);
  }

  // ------------------------------------------------------------ sfida P2P
  duel() {
    const net = this.game.net;
    if (!net || !net.connected) { this.msg('Nessun amico collegato', 'bad'); return; }
    if (!this._stake()) return;
    this.pendingDuel = { bet: this.bet, mine: Math.floor(Math.random() * 100) + 1 };
    this.ui.duelGo.disabled = true;
    this._logDuel(`Hai puntato $${this.bet} e tirato ${this.pendingDuel.mine}. Aspetto l'amico…`);
    net.send({ t: 'duel', bet: this.bet, roll: this.pendingDuel.mine });
  }

  /** L'amico non ha accettato: la puntata torna indietro. */
  onDuelRefused() {
    if (!this.pendingDuel) return;
    this.game.player.earn(this.pendingDuel.bet);
    this._logDuel('Il tuo amico non ha accettato la sfida: puntata restituita.');
    this.pendingDuel = null;
    this.ui.duelGo.disabled = false;
    this._refresh();
  }

  /** Arriva il tiro dell'amico: chi fa il numero piu' alto prende il piatto. */
  onDuel(msg) {
    const p = this.game.player;
    if (!this.pendingDuel) {
      // sfida ricevuta senza averne una in corso: si accetta al volo
      if (p.money < msg.bet) { this.game.net.send({ t: 'duelNo' }); return; }
      p.pay(msg.bet);
      this.pendingDuel = { bet: msg.bet, mine: Math.floor(Math.random() * 100) + 1 };
      this.game.net.send({ t: 'duel', bet: msg.bet, roll: this.pendingDuel.mine });
      this.game.toast(`Sfida al casinò: $${msg.bet}`, 'good');
    }
    const mine = this.pendingDuel.mine, his = msg.roll, pot = this.pendingDuel.bet * 2;
    let text;
    if (mine > his) { p.earn(pot); text = `${mine} contro ${his}: vinci $${pot}!`; this.game.audio.cash(); }
    else if (mine < his) { text = `${mine} contro ${his}: vince il tuo amico.`; }
    else { p.earn(this.pendingDuel.bet); text = `Pareggio a ${mine}, puntata resa.`; }
    this._logDuel(text);
    this.game.toast(text, mine > his ? 'good' : '');
    this.pendingDuel = null;
    this.ui.duelGo.disabled = false;
    this._refresh();
    this.game.save();
  }

  _logDuel(text) {
    const d = document.createElement('div');
    d.textContent = text;
    this.ui.duelLog.prepend(d);
    while (this.ui.duelLog.children.length > 6) this.ui.duelLog.lastChild.remove();
  }
}

function clamp0(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(36, Math.max(0, n)) : 0;
}
