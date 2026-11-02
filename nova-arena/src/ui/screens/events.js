// EVENTS & TOURNAMENTS: time-limited challenges with entry requirements, modifiers,
// win/loss trackers and milestone rewards. Draft events build their deck through a 1-of-2 pick modal.

import { h, mount, countdown, shuffle } from '../dom.js';
import { EVENTS, eventWindow } from '../../data/catalog.js';
import { CARDS, getCard } from '../../data/cards.js';
import { playerState, update } from '../../state/playerState.js';
import { spend, resolveReward, applyRewards, averageElixir } from '../../state/economy.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { openRewardReveal } from '../components/rewardReveal.js';
import { rewardLabel } from '../components/passModal.js';
import { cardTile } from '../components/cardTile.js';
import { playBattle } from '../../game/battleFlow.js';

/** Progress for the current cycle of an event (auto-reset when a new cycle starts). */
export function eventProgress(event) {
  const { cycleId } = eventWindow(event);
  const p = playerState.events[event.id];
  if (p && p.cycleId === cycleId) return p;
  return { cycleId, entered: false, finished: false, wins: 0, losses: 0, rewarded: [], deck: null };
}

const saveProgress = (event, patch) => update((s) => {
  s.events[event.id] = { ...eventProgress(event), ...patch };
}, 'events');

function lockReason(event) {
  const e = event.entry;
  if (e.minLevel && playerState.level < e.minLevel) return `Richiede livello ${e.minLevel}`;
  if (e.minTrophies && playerState.trophies < e.minTrophies) return `Richiede ${e.minTrophies} 🏆`;
  return null;
}

const entryCost = (event) => ({ gold: event.entry.gold ?? 0, gems: event.entry.gems ?? 0 });
const entryLabel = (event) => event.entry.gems ? `💎 ${event.entry.gems}` : event.entry.gold ? `🪙 ${event.entry.gold}` : 'Gratis';

export const activeEventCount = () => EVENTS.filter((e) => eventWindow(e).active && !lockReason(e) && !eventProgress(e).entered).length;

export const events = {
  id: 'events',
  label: 'Eventi',
  icon: '🏆',

  render(el) {
    const list = EVENTS.map((e) => ({ e, w: eventWindow(e) })).sort((a, b) => b.w.active - a.w.active);
    mount(el, 
      h('div', { class: 'section-head' }, h('h2', {}, 'Sfide speciali'), h('small', { class: 'muted' }, 'A tempo limitato')),
      list.map(({ e, w }) => eventCard(e, w)),
    );
  },
};

function eventCard(event, win) {
  const p = eventProgress(event);
  const locked = lockReason(event);
  const done = p.finished;

  let action;
  if (!win.active) action = h('button', { class: 'btn btn-ghost', disabled: true }, 'Inizia tra ', countdown(win.startsAt, { done: 'ora' }));
  else if (locked) action = h('button', { class: 'btn btn-ghost', disabled: true }, '🔒 ', locked);
  else if (!p.entered || done) action = h('button', { class: 'btn btn-gold', onClick: () => enter(event) }, done ? 'Rientra · ' : 'Partecipa · ', entryLabel(event));
  else action = h('button', { class: 'btn btn-green', onClick: () => play(event) }, event.modifiers.draft && !p.deck ? '🃏 Draft del mazzo' : '⚔️ Gioca');

  return h('article', { class: ['event-card', !win.active && 'upcoming'], style: { '--e1': event.colors[0], '--e2': event.colors[1] } },
    h('header', { class: 'event-banner' },
      h('span', { class: 'event-ico' }, event.icon),
      h('div', {},
        h('h3', {}, event.name),
        h('small', {}, win.active ? ['⏳ Termina tra ', countdown(win.endsAt, { done: 'terminato' })] : 'Prossimamente'),
      ),
    ),
    h('p', { class: 'event-desc' }, event.desc),
    h('div', { class: 'chip-row' }, event.chips.map((c) => h('span', { class: 'chip static' }, c))),
    h('div', { class: 'event-req' },
      h('small', {}, 'Ingresso: ', h('b', {}, entryLabel(event))),
      event.entry.minLevel > 1 && h('small', {}, ' · Livello ', h('b', {}, String(event.entry.minLevel))),
      event.entry.minTrophies && h('small', {}, ' · ', h('b', {}, `${event.entry.minTrophies} 🏆`)),
    ),

    // Reward tracker
    h('div', { class: 'tracker' },
      h('div', { class: 'tracker-row' },
        h('span', { class: 'tracker-label' }, `Vittorie ${p.wins}/${event.maxWins}`),
        h('span', { class: 'losses' }, Array.from({ length: event.maxLosses }, (_, i) => h('span', { class: ['heart', i < p.losses && 'lost'] }, i < p.losses ? '🖤' : '❤️'))),
      ),
      h('div', { class: 'milestones' },
        h('div', { class: 'ms-line' }, h('div', { class: 'ms-fill', style: { width: (p.wins / event.maxWins) * 100 + '%' } })),
        event.milestones.map((m) => {
          const { icon, text } = rewardLabel(m.reward);
          return h('div', { class: ['ms', p.wins >= m.wins && 'got'], style: { left: (m.wins / event.maxWins) * 100 + '%' }, title: text },
            h('span', {}, p.wins >= m.wins ? '✔' : icon), h('small', {}, String(m.wins)));
        }),
      ),
    ),
    p.deck && h('div', { class: 'event-deck' }, p.deck.map((id) => h('span', {}, getCard(id).art)), h('small', {}, `💧 ${averageElixir(p.deck).toFixed(1)}`)),
    done && h('p', { class: 'hint center' }, p.wins >= event.maxWins ? '🏆 Sfida completata!' : `Sfida conclusa con ${p.wins} vittorie`),
    h('div', { class: 'event-actions' }, action),
  );
}

async function enter(event) {
  const cost = entryCost(event);
  if (cost.gold || cost.gems) {
    if (!await confirmDialog({ title: event.name, message: `Pagare ${entryLabel(event)} per partecipare?`, confirmLabel: 'Partecipa' })) return;
    if (!spend(cost, 'events')) return toast(cost.gems ? 'Gemme insufficienti' : 'Oro insufficiente', 'error');
  }
  saveProgress(event, { entered: true, finished: false, wins: 0, losses: 0, rewarded: [], deck: null });
  toast(`Sei iscritto a ${event.name}!`, 'ok');
}

async function play(event) {
  let p = eventProgress(event);
  if (event.modifiers.draft && !p.deck) {
    const deck = await draftModal();
    if (!deck) return;
    saveProgress(event, { deck });
    return;
  }
  const res = await playBattle({
    mode: 'event',
    deck: p.deck ?? playerState.deck,
    fixedLevel: event.modifiers.fixedLevel,
    modifiers: event.modifiers,
    arenaTheme: event.modifiers.arenaTheme,
    label: event.name,
  });
  if (!res) return;

  p = eventProgress(event);
  const wins = p.wins + (res.outcome === 'win' ? 1 : 0);
  const losses = p.losses + (res.outcome === 'loss' ? 1 : 0);
  const finished = wins >= event.maxWins || losses >= event.maxLosses;
  const newMilestones = event.milestones.filter((m) => wins >= m.wins && !p.rewarded.includes(m.wins));
  saveProgress(event, { wins, losses, finished, rewarded: [...p.rewarded, ...newMilestones.map((m) => m.wins)] });

  for (const m of newMilestones) {
    const bundle = resolveReward(m.reward);
    applyRewards(bundle);
    await openRewardReveal(bundle, { title: `${m.wins} vittorie!` });
  }
  if (finished) toast(wins >= event.maxWins ? 'Sfida completata! 🏆' : 'Sfida terminata', wins >= event.maxWins ? 'ok' : 'warn');
}

/** 8 rounds: pick 1 of 2 random cards. Resolves to the deck or null if closed. */
function draftModal() {
  return new Promise((resolve) => {
    const picks = [];
    let pool = shuffle(CARDS);
    let finished = false;
    const body = h('div', { class: 'draft' });

    const draw = () => {
      if (picks.length === 8) {
        finished = true;
        close();
        toast('Mazzo del draft pronto!', 'ok');
        return resolve(picks);
      }
      const options = pool.splice(0, 2);
      body.replaceChildren(
        h('p', { class: 'center' }, h('b', {}, `Scelta ${picks.length + 1} di 8`), ' — tieni una carta, l\'altra va all\'avversario'),
        h('div', { class: 'draft-options' }, options.map((card) => cardTile(card, {
          showProgress: false,
          levelOverride: 9,
          extraClass: 'draft-pick',
          onClick: () => { picks.push(card.id); draw(); },
        }))),
        h('div', { class: 'draft-picked' }, Array.from({ length: 8 }, (_, i) => h('span', { class: ['slot', picks[i] && 'filled'] }, picks[i] ? getCard(picks[i]).art : ''))),
      );
    };

    const close = openModal({ title: 'Draft', body, className: 'modal-draft', onClose: () => { if (!finished) resolve(null); } });
    draw();
  });
}
