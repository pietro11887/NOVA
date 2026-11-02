// COLLECTION & DECK: 8-card battle deck with average elixir, the 24 other cards, faction filters,
// swap flow (pick a card → tap a deck slot) and the inspection modal.

import { h, mount } from '../dom.js';
import { CARDS, FACTIONS, RARITIES, getCard } from '../../data/cards.js';
import { playerState } from '../../state/playerState.js';
import { averageElixir, setDeckCard, upgradableCount } from '../../state/economy.js';
import { cardTile } from '../components/cardTile.js';
import { openCardModal } from '../components/cardModal.js';
import { toast } from '../components/toast.js';

const RARITY_ORDER = Object.keys(RARITIES);
const view = { faction: 'all', sort: 'elixir', swapping: null };

export const collection = {
  id: 'cards',
  label: 'Carte',
  icon: '🃏',

  onHide() { view.swapping = null; },

  render(el) {
    const s = playerState;
    const avg = averageElixir();
    const cycle = [...s.deck].map((id) => getCard(id).elixir).sort((a, b) => a - b).slice(0, 4).reduce((a, b) => a + b, 0);
    const swapping = view.swapping && getCard(view.swapping);

    let rest = CARDS.filter((c) => !s.deck.includes(c.id));
    if (view.faction !== 'all') rest = rest.filter((c) => c.faction === view.faction);
    rest.sort(sorter(view.sort));
    const ownedRest = rest.filter((c) => s.cards[c.id]);
    const lockedRest = rest.filter((c) => !s.cards[c.id]);
    const found = Object.keys(s.cards).length;

    mount(el, 
      h('div', { class: 'section-head' },
        h('h2', {}, 'Mazzo da battaglia'),
        h('div', { class: 'deck-stats' },
          h('span', { class: 'stat-pill' }, '💧 Media ', h('b', {}, avg.toFixed(1))),
          h('span', { class: 'stat-pill' }, '🔄 Ciclo 4 ', h('b', {}, String(cycle))),
        ),
      ),
      swapping && h('div', { class: 'swap-banner' },
        h('span', {}, swapping.art),
        h('span', {}, `Scegli la carta da sostituire con ${swapping.name}`),
        h('button', { class: 'btn btn-ghost small', onClick: () => { view.swapping = null; this.render(el); } }, 'Annulla'),
      ),
      h('div', { class: ['deck-grid', swapping && 'swap-mode'] },
        s.deck.map((id, slot) => cardTile(getCard(id), {
          extraClass: swapping && 'wiggle',
          onClick: (card) => {
            if (view.swapping) {
              setDeckCard(slot, view.swapping);
              toast(`${getCard(view.swapping).name} aggiunta al mazzo`, 'ok');
              view.swapping = null;
              this.render(el);
            } else {
              openCardModal(card);
            }
          },
        })),
      ),

      h('div', { class: 'section-head' },
        h('h2', {}, 'Collezione'),
        h('small', { class: 'muted' }, `Trovate ${found}/${CARDS.length}`),
      ),
      h('div', { class: 'chip-row h-scroll' },
        filterChip('all', 'Tutte', '🗂️', el, this),
        Object.values(FACTIONS).map((f) => filterChip(f.id, f.name, f.icon, el, this)),
      ),
      h('div', { class: 'sort-row' },
        h('small', { class: 'muted' }, 'Ordina:'),
        [['elixir', 'Elisir'], ['rarity', 'Rarità'], ['level', 'Livello']].map(([id, label]) =>
          h('button', { class: ['link-btn', view.sort === id && 'active'], onClick: () => { view.sort = id; this.render(el); } }, label)),
      ),
      view.faction !== 'all' && h('p', { class: 'faction-blurb' }, FACTIONS[view.faction].icon, ' ', FACTIONS[view.faction].blurb),
      h('div', { class: 'card-grid' },
        ownedRest.map((card) => cardTile(card, {
          highlight: view.swapping === card.id,
          onClick: () => openCardModal(card, { onUse: (c) => { view.swapping = c.id; this.render(el); el.scrollTo({ top: 0, behavior: 'smooth' }); } }),
        })),
      ),
      lockedRest.length > 0 && h('h3', { class: 'sub-head' }, `Da trovare (${lockedRest.length})`),
      h('div', { class: 'card-grid' }, lockedRest.map((card) => cardTile(card, { onClick: () => openCardModal(card) }))),
      upgradableCount() > 0 && h('p', { class: 'hint center' }, `▲ ${upgradableCount()} carte pronte per il miglioramento`),
    );
  },
};

function filterChip(id, label, icon, el, screen) {
  return h('button', {
    class: ['chip', view.faction === id && 'active'],
    style: id !== 'all' ? { '--chip': FACTIONS[id].color } : null,
    onClick: () => { view.faction = id; screen.render(el); },
  }, icon, ' ', label);
}

function sorter(mode) {
  const lvl = (c) => playerState.cards[c.id]?.level ?? 0;
  if (mode === 'rarity') return (a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.elixir - b.elixir;
  if (mode === 'level') return (a, b) => lvl(b) - lvl(a) || a.elixir - b.elixir;
  return (a, b) => a.elixir - b.elixir || a.name.localeCompare(b.name);
}
