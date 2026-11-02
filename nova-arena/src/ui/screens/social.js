// SOCIAL: Clan tab (info, clan war placeholder, live chat with card requests & donations) and Friends tab
// (online/offline/in battle, Friendly Battle, Spectate, Invite). Clanmates and friends are simulated.

import { h, mount, countdown, fmtNum, pick, randInt } from '../dom.js';
import { CLANS, CLAN_ROLES, BOT_NAMES, BOT_CHAT, TIME } from '../../data/catalog.js';
import { CARDS, getCard } from '../../data/cards.js';
import { playerState, update } from '../../state/playerState.js';
import { addXp, ownsCard } from '../../state/economy.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { cardTile } from '../components/cardTile.js';
import { playBattle, isInBattle } from '../../game/battleFlow.js';

const REQUEST_COOLDOWN = 1 * TIME.H;
const REQUEST_AMOUNT = { common: 40, rare: 4 };
const CHAT_LIMIT = 60;
const ui = { tab: 'clan', draft: '', focused: false };

export const social = {
  id: 'social',
  label: 'Clan',
  icon: '🛡️',

  render(el) {
    ui.focused = document.activeElement?.classList.contains('chat-input') ?? false;
    mount(el, 
      h('div', { class: 'tabs' },
        tabBtn('clan', '🛡️ Clan', el, this),
        tabBtn('friends', '👥 Amici', el, this),
      ),
      ui.tab === 'clan' ? (playerState.clan ? clanView(el, this) : clanBrowser()) : friendsView(),
    );
    // Keep the chat pinned to the newest message and the composer usable across re-renders.
    const log = el.querySelector('.chat-log');
    if (log) log.scrollTop = log.scrollHeight;
    const input = el.querySelector('.chat-input');
    if (input && ui.focused) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  },
};

function tabBtn(id, label, el, screen) {
  return h('button', { class: ['tab', ui.tab === id && 'active'], onClick: () => { ui.tab = id; screen.render(el); } }, label);
}

// ── Clan ───────────────────────────────────────────────────────────────────
function clanBrowser() {
  return h('div', { class: 'clan-browser' },
    h('p', { class: 'muted' }, 'Non fai parte di nessun clan. Unisciti a uno per chiedere carte, chattare e partecipare alle guerre.'),
    CLANS.map((c) => {
      const tooLow = playerState.trophies < c.required;
      const full = c.members >= 50;
      return h('div', { class: 'clan-row' },
        h('span', { class: 'clan-badge' }, c.badge),
        h('div', { class: 'clan-row-info' },
          h('b', {}, c.name),
          h('small', { class: 'muted' }, `👥 ${c.members}/50 · 🏆 ${fmtNum(c.trophies)} · req. ${c.required}`),
          h('small', {}, c.desc),
        ),
        h('button', { class: 'btn btn-green small', disabled: tooLow || full, onClick: () => joinClan(c) }, tooLow ? `🔒 ${c.required}` : 'Entra'),
      );
    }),
    h('button', { class: 'btn btn-blue wide', onClick: createClan }, 'Crea un clan (🪙 1.000)'),
  );
}

function joinClan(c, role = 'Membro') {
  const members = [...BOT_NAMES].sort(() => Math.random() - 0.5).slice(0, Math.min(c.members, BOT_NAMES.length))
    .map((name, i) => ({ name, role: i === 0 ? 'Capo' : i < 3 ? 'Co-capo' : i < 7 ? 'Anziano' : 'Membro', trophies: randInt(200, 3200), online: Math.random() < 0.45 }));
  update((s) => {
    s.clan = {
      id: c.id, name: c.name, badge: c.badge, role, joinedAt: Date.now(), lastRequestAt: 0,
      memberCount: c.members + 1, trophies: c.trophies, members,
      chat: [
        { id: Date.now(), kind: 'system', text: `${s.name} è entrato nel clan`, t: Date.now() },
        { id: Date.now() + 1, kind: 'text', from: members[0]?.name ?? 'Capo', text: `Benvenuto ${s.name}! 👋`, t: Date.now() },
      ],
    };
  }, 'clan');
  toast(`Benvenuto in ${c.name}!`, 'ok');
}

function createClan() {
  const input = h('input', { class: 'text-input', placeholder: 'Nome del clan', maxlength: 20 });
  const badges = ['🔷', '🔥', '🐉', '⚙️', '🌙', '🧬', '💠', '🦅'];
  let badge = badges[0];
  const picker = h('div', { class: 'badge-picker' }, badges.map((b) => h('button', {
    class: ['badge-opt', b === badge && 'active'],
    onClick: (e) => { badge = b; picker.querySelectorAll('.badge-opt').forEach((x) => x.classList.remove('active')); e.currentTarget.classList.add('active'); },
  }, b)));
  openModal({
    title: 'Crea clan',
    className: 'modal-small',
    body: h('div', {}, h('label', { class: 'field' }, h('span', {}, 'Nome'), input), h('p', { class: 'muted' }, 'Stemma'), picker),
    actions: [{
      label: 'Crea (🪙 1.000)', class: 'btn-green',
      onClick: (close) => {
        const name = input.value.trim();
        if (name.length < 3) return toast('Nome troppo corto', 'error');
        if (playerState.gold < 1000) return toast('Oro insufficiente', 'error');
        update((s) => { s.gold -= 1000; }, 'spend');
        joinClan({ id: 'clan-own-' + Date.now(), name, badge, members: 0, trophies: playerState.trophies }, 'Capo');
        update((s) => { s.clan.members = []; s.clan.memberCount = 1; }, 'clan');
        close();
      },
    }],
  });
}

function clanView(el, screen) {
  const clan = playerState.clan;
  const cooldownEnds = clan.lastRequestAt + REQUEST_COOLDOWN;
  const canRequest = Date.now() >= cooldownEnds;
  const online = clan.members.filter((m) => m.online).length;

  const input = h('input', {
    class: 'chat-input', placeholder: 'Scrivi un messaggio…', maxlength: 140, value: ui.draft,
    onInput: (e) => { ui.draft = e.target.value; },
    onKeydown: (e) => { if (e.key === 'Enter') send(); },
  });
  const send = () => {
    const text = ui.draft.trim();
    if (!text) return;
    ui.draft = '';
    pushChat({ kind: 'text', from: playerState.name, mine: true, text });
  };

  return h('div', { class: 'clan-view' },
    h('div', { class: 'clan-header' },
      h('span', { class: 'clan-badge big' }, clan.badge),
      h('div', {},
        h('h2', {}, clan.name),
        h('small', { class: 'muted' }, `👥 ${clan.memberCount}/50 · 🟢 ${online} online · 🏆 ${fmtNum(clan.trophies)}`),
        h('small', {}, `Ruolo: ${clan.role}`),
      ),
      h('button', { class: 'icon-btn', 'aria-label': 'Membri', onClick: () => membersModal(clan) }, '👥'),
    ),

    h('div', { class: 'war-card' },
      h('div', { class: 'war-ico' }, '⚔️'),
      h('div', {},
        h('b', {}, 'Guerra tra clan'),
        h('small', {}, 'Giorno di preparazione · inizia tra ', countdown(nextWarStart())),
        h('div', { class: 'war-stats' }, h('span', {}, '🏅 Battaglie 0/4'), h('span', {}, '🏰 Lega Bronzo'), h('span', { class: 'soon' }, 'In arrivo')),
      ),
    ),

    h('div', { class: 'chat no-swipe' },
      h('div', { class: 'chat-log' }, clan.chat.map((m) => chatMessage(m))),
      h('div', { class: 'chat-compose' },
        h('button', {
          class: 'btn btn-gold small req-btn', disabled: !canRequest,
          onClick: () => requestCardsModal(),
        }, canRequest ? '🃏 Richiedi' : countdown(cooldownEnds, { done: '🃏 Richiedi' })),
        input,
        h('button', { class: 'btn btn-blue small', onClick: send, 'aria-label': 'Invia' }, '➤'),
      ),
    ),
    h('button', {
      class: 'btn btn-ghost small danger-text',
      onClick: async () => {
        if (await confirmDialog({ title: 'Lasciare il clan?', message: `Vuoi davvero uscire da ${clan.name}?`, confirmLabel: 'Esci', danger: true })) {
          update((s) => { s.clan = null; }, 'clan');
          screen.render(el);
        }
      },
    }, 'Lascia il clan'),
  );
}

function nextWarStart() {
  // Wars start every Thursday 10:00 local time.
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  let add = (4 - d.getDay() + 7) % 7;
  if (add === 0 && Date.now() >= d.getTime()) add = 7;
  d.setDate(d.getDate() + add);
  return d.getTime();
}

function chatMessage(m) {
  const time = new Date(m.t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (m.kind === 'system') return h('div', { class: 'msg system' }, m.text);
  if (m.kind === 'request') {
    const card = getCard(m.cardId);
    const full = m.got >= m.need;
    const canDonate = !m.mine && !full && (playerState.cards[m.cardId]?.count ?? 0) > 0;
    return h('div', { class: ['msg', 'request', m.mine && 'mine'] },
      h('div', { class: 'msg-head' }, h('b', {}, m.from), h('small', {}, time)),
      h('div', { class: 'request-body' },
        h('span', { class: 'req-art' }, card.art),
        h('div', { class: 'req-info' },
          h('small', {}, `Richiede ${card.name}`),
          h('div', { class: ['card-progress', full && 'full'] },
            h('div', { class: 'bar', style: { width: (m.got / m.need) * 100 + '%' } }),
            h('span', {}, `${m.got}/${m.need}`)),
        ),
        !m.mine && h('button', { class: 'btn btn-green small', disabled: !canDonate, onClick: () => donate(m.id) }, full ? '✔' : 'Dona'),
      ),
    );
  }
  return h('div', { class: ['msg', m.mine && 'mine'] },
    h('div', { class: 'msg-head' }, h('b', {}, m.from), h('small', {}, time)),
    h('p', {}, m.text),
  );
}

function pushChat(msg) {
  update((s) => {
    if (!s.clan) return;
    s.clan.chat.push({ id: Date.now() + Math.random(), t: Date.now(), ...msg });
    if (s.clan.chat.length > CHAT_LIMIT) s.clan.chat.splice(0, s.clan.chat.length - CHAT_LIMIT);
  }, 'chat');
}

function requestCardsModal() {
  const options = CARDS.filter((c) => ownsCard(c.id) && REQUEST_AMOUNT[c.rarity]);
  const close = openModal({
    title: 'Richiedi carte',
    body: h('div', {},
      h('p', { class: 'muted' }, 'I compagni di clan possono donarti fino a 40 carte comuni o 4 rare.'),
      h('div', { class: 'card-grid' }, options.map((card) => cardTile(card, {
        onClick: () => {
          update((s) => { s.clan.lastRequestAt = Date.now(); }, 'clan');
          pushChat({ kind: 'request', from: playerState.name, mine: true, cardId: card.id, got: 0, need: REQUEST_AMOUNT[card.rarity] });
          toast(`Richiesta di ${card.name} inviata`, 'ok');
          close();
        },
      }))),
    ),
  });
}

function donate(msgId) {
  const msg = playerState.clan?.chat.find((m) => m.id === msgId);
  if (!msg || msg.got >= msg.need || !(playerState.cards[msg.cardId]?.count > 0)) return;
  const reward = getCard(msg.cardId).rarity === 'rare' ? 50 : 5;
  update((s) => {
    s.cards[msg.cardId].count -= 1;
    s.stats.cardsDonated += 1;
    s.gold += reward;
    msg.got += 1;
  }, 'chat');
  addXp(1);
  toast(`+${reward} 🪙 per la donazione`, 'ok', 1200);
}

function membersModal(clan) {
  const me = { name: playerState.name, role: clan.role, trophies: playerState.trophies, online: true, me: true };
  const list = [...clan.members, me].sort((a, b) => CLAN_ROLES.indexOf(a.role) - CLAN_ROLES.indexOf(b.role) || b.trophies - a.trophies);
  openModal({
    title: `Membri (${list.length})`,
    body: h('ol', { class: 'member-list' }, list.map((m) => h('li', { class: m.me && 'me' },
      h('span', { class: ['dot', m.online ? 'online' : 'offline'] }),
      h('b', {}, m.name), h('small', { class: 'muted' }, m.role), h('span', { class: 'right' }, `🏆 ${m.trophies}`),
    ))),
  });
}

// ── Friends ────────────────────────────────────────────────────────────────
const STATUS = { online: ['online', 'Online'], battle: ['battle', 'In battaglia'], offline: ['offline', 'Offline'] };

function friendsView() {
  const friends = [...playerState.friends].sort((a, b) => order(a) - order(b));
  const input = h('input', { class: 'text-input', placeholder: 'Nome o tag amico', maxlength: 16 });
  return h('div', { class: 'friends' },
    h('div', { class: 'add-friend' },
      input,
      h('button', {
        class: 'btn btn-blue small', onClick: () => {
          const name = input.value.trim();
          if (name.length < 3) return toast('Inserisci almeno 3 caratteri', 'error');
          if (playerState.friends.some((f) => f.name.toLowerCase() === name.toLowerCase())) return toast('Già nella lista amici', 'warn');
          update((s) => {
            s.friends.push({ id: 'f' + Date.now(), name, level: randInt(1, 10), trophies: randInt(0, 2000), avatar: pick(['🐱', '🐼', '🦁', '🐧', '🐯', '🦉']), status: 'offline', lastSeen: 0 });
          }, 'friends');
          toast(`${name} aggiunto agli amici`, 'ok');
        },
      }, '+ Aggiungi'),
    ),
    h('small', { class: 'muted' }, `${friends.filter((f) => f.status !== 'offline').length} online su ${friends.length}`),
    h('ul', { class: 'friend-list' }, friends.map(friendRow)),
  );
}

const order = (f) => ({ online: 0, battle: 1, offline: 2 })[f.status];

function friendRow(f) {
  const [cls, label] = STATUS[f.status];
  return h('li', { class: 'friend' },
    h('span', { class: 'avatar' }, f.avatar, h('i', { class: ['dot', cls] })),
    h('div', { class: 'friend-info' },
      h('b', {}, f.name),
      h('small', { class: 'muted' }, `Liv. ${f.level} · 🏆 ${f.trophies} · `, h('span', { class: `st-${cls}` }, label)),
    ),
    h('div', { class: 'friend-actions' },
      h('button', { class: 'btn btn-blue xs', disabled: f.status !== 'online', onClick: () => friendlyBattle(f) }, '⚔️ Amichevole'),
      h('button', { class: 'btn btn-ghost xs', disabled: f.status !== 'battle', onClick: () => spectate(f) }, '👁️ Guarda'),
      h('button', { class: 'btn btn-gold xs', disabled: f.invited, onClick: () => invite(f) }, f.invited ? '✔ Invitato' : '✉️ Invita'),
    ),
  );
}

function friendlyBattle(f) {
  if (isInBattle()) return;
  toast(`Sfida inviata a ${f.name}…`, 'info', 1300);
  setTimeout(() => playBattle({ mode: 'friendly', skipSearch: true, opponentName: f.name, label: 'Amichevole' }), 1300);
}

function spectate(f) {
  if (isInBattle()) return;
  playBattle({ mode: 'spectate', skipSearch: true, spectateName: f.name, opponentName: pick(BOT_NAMES), label: `Stai guardando ${f.name}` });
}

function invite(f) {
  update((s) => { const x = s.friends.find((y) => y.id === f.id); if (x) x.invited = true; }, 'friends');
  toast(playerState.clan ? `${f.name} invitato in ${playerState.clan.name}` : `Invito a giocare inviato a ${f.name}`, 'ok');
}

// ── Simulation of the social world (clanmates chatting/donating, friends changing status) ──
export function startSocialSimulation() {
  setInterval(() => {
    if (isInBattle()) return;
    const clan = playerState.clan;
    if (clan && clan.members.length) {
      // Donations to my open request
      const req = clan.chat.slice().reverse().find((m) => m.kind === 'request' && m.mine && m.got < m.need);
      if (req && Math.random() < 0.7) {
        const donor = pick(clan.members).name;
        const n = Math.min(req.need - req.got, getCard(req.cardId).rarity === 'rare' ? 1 : randInt(1, 4));
        update((s) => {
          const m = s.clan.chat.find((x) => x.id === req.id);
          m.got += n;
          s.cards[req.cardId].count += n;
        }, 'chat');
        toast(`${donor} ti ha donato ${n}× ${getCard(req.cardId).name}`, 'ok', 1600);
      } else if (Math.random() < 0.25) {
        pushChat({ kind: 'text', from: pick(clan.members).name, text: pick(BOT_CHAT) });
      } else if (Math.random() < 0.12) {
        const card = pick(CARDS.filter((c) => REQUEST_AMOUNT[c.rarity]));
        pushChat({ kind: 'request', from: pick(clan.members).name, cardId: card.id, got: randInt(0, 2), need: REQUEST_AMOUNT[card.rarity] });
      }
    }
    if (Math.random() < 0.2) {
      update((s) => {
        const f = pick(s.friends);
        f.status = f.status === 'offline' ? 'online' : pick(['online', 'battle', 'offline']);
      }, 'friends');
    }
  }, 9000);
}

