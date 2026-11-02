// Bottom navigation bar: 5 tabs with notification badges; the centre (Battle) tab is raised.

import { h } from '../dom.js';

/**
 * tabs: [{ id, label, icon, badge?: () => number|string|null }]
 * Returns { el, setActive(id), refreshBadges() }.
 */
export function createBottomNav(tabs, router) {
  const buttons = new Map();
  const el = h('nav', { class: 'bottom-nav', 'aria-label': 'Navigazione principale' },
    tabs.map((tab) => {
      const badge = h('span', { class: 'nav-badge', hidden: true });
      const btn = h('button', {
        class: ['nav-tab', tab.id === 'battle' && 'nav-tab-main'],
        dataset: { tab: tab.id },
        'aria-label': tab.label,
        onClick: () => router.navigate(tab.id),
      }, h('span', { class: 'nav-icon' }, tab.icon), h('span', { class: 'nav-label' }, tab.label), badge);
      buttons.set(tab.id, { btn, badge, tab });
      return btn;
    }),
  );

  return {
    el,
    setActive(id) {
      for (const [tabId, { btn }] of buttons) {
        btn.classList.toggle('active', tabId === id);
        btn.setAttribute('aria-current', tabId === id ? 'page' : 'false');
      }
    },
    refreshBadges() {
      for (const { badge, tab } of buttons.values()) {
        const value = tab.badge?.();
        badge.hidden = !value;
        badge.textContent = value === true ? '!' : value || '';
      }
    },
  };
}
