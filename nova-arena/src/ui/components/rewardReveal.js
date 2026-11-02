// Chest opening / reward reveal: chest shakes, bursts, then rewards pop in one by one.

import { h, fmtNum } from '../dom.js';
import { openModal } from './modal.js';
import { cardTile } from './cardTile.js';
import { CHESTS } from '../../data/catalog.js';
import { getCard } from '../../data/cards.js';

export function openRewardReveal(bundle, { title } = {}) {
  return new Promise((resolve) => {
    const chest = bundle.chestType ? CHESTS[bundle.chestType] : null;
    const stage = h('div', { class: 'reveal' });

    const items = [];
    if (bundle.gold) items.push(h('div', { class: 'reveal-item cur-item' }, h('span', { class: 'big-ico' }, '🪙'), h('b', {}, `+${fmtNum(bundle.gold)}`), h('small', {}, 'Oro')));
    if (bundle.gems) items.push(h('div', { class: 'reveal-item cur-item' }, h('span', { class: 'big-ico' }, '💎'), h('b', {}, `+${fmtNum(bundle.gems)}`), h('small', {}, 'Gemme')));
    for (const { id, count, isNew } of bundle.cards ?? []) {
      items.push(h('div', { class: 'reveal-item' },
        isNew && h('span', { class: 'new-badge' }, 'NUOVA!'),
        cardTile(getCard(id), { compact: true, showProgress: false, countBadge: count }),
      ));
    }

    const showItems = () => {
      stage.replaceChildren(
        h('div', { class: 'reveal-grid' }, items.map((el, i) => { el.style.animationDelay = `${i * 140}ms`; return el; })),
      );
    };

    if (chest) {
      const chestEl = h('button', { class: 'reveal-chest', style: { '--cc': chest.color }, 'aria-label': 'Apri' },
        h('span', {}, chest.icon), h('small', {}, 'Tocca per aprire'));
      chestEl.addEventListener('click', () => {
        chestEl.classList.add('burst');
        setTimeout(showItems, 420);
      }, { once: true });
      stage.append(chestEl);
    } else {
      showItems();
    }

    openModal({
      title: title ?? bundle.source ?? 'Ricompense',
      className: 'modal-reveal',
      body: stage,
      actions: [{ label: 'Fantastico!', class: 'btn-gold', onClick: (close) => close() }],
      onClose: resolve,
    });
  });
}
