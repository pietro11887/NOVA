// Player profile bar (always visible): level badge + XP, name, gold, gems. Tapping opens the profile.

import { h, mount, fmtNum } from '../dom.js';
import { playerState, update, resetState } from '../../state/playerState.js';
import { xpToNext, MAX_KING_LEVEL } from '../../state/economy.js';
import { arenaFor } from '../../data/catalog.js';
import { openModal, confirmDialog } from './modal.js';
import { toast } from './toast.js';

export function renderTopBar(el, router) {
  const s = playerState;
  const need = xpToNext(s.level);
  const pct = s.level >= MAX_KING_LEVEL ? 100 : Math.min(100, (s.xp / need) * 100);
  mount(el, 
    h('button', { class: 'profile-chip', onClick: openProfile, 'aria-label': 'Profilo' },
      h('span', { class: 'lvl-badge' }, String(s.level)),
      h('span', { class: 'profile-text' },
        h('b', { class: 'profile-name' }, s.name),
        h('span', { class: 'xp-bar' },
          h('span', { class: 'xp-fill', style: { width: pct + '%' } }),
          h('small', {}, s.level >= MAX_KING_LEVEL ? 'MAX' : `${s.xp}/${need}`),
        ),
      ),
    ),
    h('button', { class: 'cur-pill gold', onClick: () => router.navigate('shop', 'currency') },
      h('i', {}, '🪙'), h('span', { dataset: { cur: 'gold' } }, fmtNum(s.gold)), h('b', { class: 'plus' }, '+')),
    h('button', { class: 'cur-pill gems', onClick: () => router.navigate('shop', 'currency') },
      h('i', {}, '💎'), h('span', { dataset: { cur: 'gems' } }, fmtNum(s.gems)), h('b', { class: 'plus' }, '+')),
  );
}

function openProfile() {
  const s = playerState;
  const input = h('input', { class: 'text-input', value: s.name, maxlength: 16, 'aria-label': 'Nome giocatore' });
  const arena = arenaFor(s.trophies);
  const games = s.stats.wins + s.stats.losses + s.stats.draws;
  openModal({
    title: 'Profilo',
    body: h('div', { class: 'profile' },
      h('label', { class: 'field' }, h('span', {}, 'Nome'), input),
      h('p', { class: 'muted' }, `Tag giocatore ${s.tag}`),
      h('div', { class: 'stat-grid' },
        stat('🏆', 'Trofei', s.trophies),
        stat('⭐', 'Record', s.bestTrophies),
        stat('🏟️', 'Arena', arena.name),
        stat('⚔️', 'Vittorie', s.stats.wins),
        stat('💀', 'Sconfitte', s.stats.losses),
        stat('👑', 'Vittorie a 3 corone', s.stats.threeCrowns),
        stat('📈', '% vittorie', games ? Math.round((s.stats.wins / games) * 100) + '%' : '—'),
        stat('🃏', 'Carte trovate', `${Object.keys(s.cards).length}/32`),
        stat('🤝', 'Carte donate', s.stats.cardsDonated),
      ),
      h('button', {
        class: 'btn btn-ghost small danger-text',
        onClick: async () => {
          if (await confirmDialog({ title: 'Ricominciare?', message: 'Tutti i progressi salvati su questo dispositivo verranno cancellati.', confirmLabel: 'Cancella', danger: true })) {
            resetState();
            toast('Salvataggio azzerato', 'warn');
          }
        },
      }, 'Azzera salvataggio'),
    ),
    actions: [{
      label: 'Salva', class: 'btn-green',
      onClick: (close) => {
        const name = input.value.trim().slice(0, 16);
        if (name.length < 3) return toast('Il nome deve avere almeno 3 caratteri', 'error');
        update((st) => { st.name = name; }, 'profile');
        close();
      },
    }],
  });
}

const stat = (icon, label, value) => h('div', { class: 'stat' }, h('span', {}, icon), h('b', {}, String(value)), h('small', {}, label));
