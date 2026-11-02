// Battle orchestration: matchmaking overlay → VS splash → live arena → result screen → rewards.
// Every way into a battle (ladder, friendly, event, spectate) goes through playBattle().

import { h, randInt, pick, shuffle } from '../ui/dom.js';
import { runArena } from './arena.js';
import { CARDS, RARITIES } from '../data/cards.js';
import { BOT_NAMES, arenaFor, CHESTS } from '../data/catalog.js';
import { playerState } from '../state/playerState.js';
import { applyBattleResult, cardLevel } from '../state/economy.js';

const overlayRoot = () => document.getElementById('arena-root');
let inBattle = false;
export const isInBattle = () => inBattle;

/**
 * opts: {
 *   mode: 'ladder' | 'friendly' | 'event' | 'spectate',
 *   deck?: card ids (default: active deck), fixedLevel?: number (tournament standard),
 *   modifiers?: { elixirRate, suddenDeath }, opponentName?: string, arenaTheme?: number,
 *   skipSearch?: boolean, label?: string
 * }
 * Resolves to { outcome, crowns, enemyCrowns, summary } or null if cancelled.
 */
export async function playBattle(opts = {}) {
  if (inBattle) return null;
  inBattle = true;
  document.body.classList.add('in-battle');
  try {
    const mode = opts.mode ?? 'ladder';
    const deck = opts.deck ?? playerState.deck;
    const levelOf = (id) => opts.fixedLevel ?? cardLevel(id);
    const myLevels = Object.fromEntries(deck.map((id) => [id, levelOf(id)]));
    const avgLevel = Math.round(Object.values(myLevels).reduce((a, b) => a + b, 0) / deck.length);

    const opponent = opts.skipSearch
      ? { name: opts.opponentName ?? pick(BOT_NAMES), trophies: playerState.trophies }
      : await matchmaking(opts);
    if (!opponent) return null;

    const botLevels = (ids) => Object.fromEntries(ids.map((id) => {
      const c = CARDS.find((x) => x.id === id);
      return [id, opts.fixedLevel ?? Math.max(RARITIES[c.rarity].startLevel, avgLevel + randInt(-1, 0))];
    }));
    const enemyDeck = botDeck(arenaFor(playerState.trophies).id);
    const enemyLevels = botLevels(enemyDeck);
    // Spectating: the "bottom" side is the friend, also played by the bot.
    const friendDeck = mode === 'spectate' ? botDeck(arenaFor(playerState.trophies).id) : null;

    const me = mode === 'spectate' ? (opts.spectateName ?? 'Amico') : playerState.name;
    await vsSplash(me, opponent.name, opts.label);

    const result = await runArena({
      root: overlayRoot(),
      player: friendDeck ? { name: me, deck: friendDeck, levels: botLevels(friendDeck) } : { name: me, deck, levels: myLevels },
      enemy: { name: opponent.name, deck: enemyDeck, levels: enemyLevels },
      modifiers: opts.modifiers,
      spectate: mode === 'spectate',
      arenaTheme: opts.arenaTheme ?? arenaFor(playerState.trophies).id,
    });

    const summary = applyBattleResult({ ...result, mode });
    if (mode !== 'spectate' || !result.abandoned) await resultScreen(result, summary, mode, opponent.name);
    return { ...result, summary };
  } finally {
    inBattle = false;
    document.body.classList.remove('in-battle');
    overlayRoot().replaceChildren();
  }
}

/** Random but sane bot deck: 2 spells max, mostly cards from unlocked arenas. */
function botDeck(arenaId) {
  const pool = shuffle(CARDS.filter((c) => c.arena <= Math.max(1, arenaId + 1)));
  const deck = [];
  let spells = 0;
  for (const c of pool) {
    if (c.type === 'spell' && spells >= 2) continue;
    if (c.type === 'spell') spells++;
    deck.push(c.id);
    if (deck.length === 8) break;
  }
  return deck;
}

function matchmaking(opts) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timeEl = h('span', {}, '0:00');
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      timeEl.textContent = `0:${String(s).padStart(2, '0')}`;
    }, 250);
    const done = (value) => {
      clearInterval(tick);
      clearTimeout(found);
      el.remove();
      resolve(value);
    };
    const el = h('div', { class: 'matchmaking' },
      h('div', { class: 'mm-spinner' }, h('span', {}, '⚔️')),
      h('h2', {}, opts.label ?? 'Ricerca avversario…'),
      h('p', { class: 'muted' }, 'Tempo di attesa ', timeEl),
      h('p', { class: 'mm-tip' }, pick([
        'Suggerimento: gli Incantesimi infliggono solo il 35% dei danni alle torri.',
        'Suggerimento: le carte con Split-on-Death punteggiano la difesa con nuove unità.',
        'Suggerimento: negli ultimi 40 secondi l\'elisir scorre al doppio.',
        'Suggerimento: la Torre del Re si sveglia quando viene colpita.',
        'Suggerimento: le truppe in mischia non colpiscono le unità aeree.',
      ])),
      h('button', { class: 'btn btn-red', onClick: () => done(null) }, 'Annulla'),
    );
    overlayRoot().append(el);
    const found = setTimeout(() => done({
      name: opts.opponentName ?? pick(BOT_NAMES),
      trophies: Math.max(0, playerState.trophies + randInt(-40, 40)),
    }), randInt(1600, 3200));
  });
}

function vsSplash(me, foe, label) {
  return new Promise((resolve) => {
    const el = h('div', { class: 'vs-splash' },
      h('div', { class: 'vs-side foe' }, foe),
      h('div', { class: 'vs-mid' }, 'VS', label && h('small', {}, label)),
      h('div', { class: 'vs-side me' }, me),
    );
    overlayRoot().append(el);
    setTimeout(() => { el.remove(); resolve(); }, 1500);
  });
}

function resultScreen(result, summary, mode, foeName) {
  return new Promise((resolve) => {
    const titles = { win: 'VITTORIA!', loss: 'SCONFITTA', draw: 'PAREGGIO' };
    const crowns = (n) => h('div', { class: 'crown-row' }, [0, 1, 2].map((i) => h('span', { class: ['crown', i < n && 'on'] }, '👑')));
    const el = h('div', { class: ['result-screen', result.outcome] },
      h('h1', {}, mode === 'spectate' ? 'Fine partita' : titles[result.outcome]),
      h('div', { class: 'result-teams' },
        h('div', {}, h('b', {}, foeName), crowns(result.enemyCrowns)),
        h('div', {}, h('b', {}, mode === 'spectate' ? 'Amico' : playerState.name), crowns(result.crowns)),
      ),
      h('div', { class: 'result-rewards' },
        mode === 'ladder' && h('div', { class: ['rr', summary.trophies > 0 ? 'up' : summary.trophies < 0 && 'down'] }, '🏆 ', summary.trophies > 0 ? `+${summary.trophies}` : String(summary.trophies)),
        summary.gold > 0 && h('div', { class: 'rr' }, '🪙 +', String(summary.gold)),
        summary.chest && h('div', { class: 'rr' }, CHESTS[summary.chest].icon, ' ', CHESTS[summary.chest].name),
        summary.chestLost && h('div', { class: 'rr muted' }, '📦 Slot forzieri pieni: nessun forziere'),
        mode !== 'friendly' && mode !== 'spectate' && result.crowns > 0 && h('div', { class: 'rr' }, `👑 +${result.crowns} corone pass`),
        mode === 'friendly' && h('div', { class: 'rr muted' }, 'Amichevole: nessun trofeo in palio'),
      ),
      h('button', { class: 'btn btn-blue wide', onClick: () => { el.remove(); resolve(); } }, 'OK'),
    );
    overlayRoot().append(el);
  });
}
