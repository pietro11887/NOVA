// Boot: build the app shell, register the 5 screens with the router, wire state → UI updates,
// and run the 1-second ticker for every countdown on screen (chests, deals, events, pass).

import { createRouter } from './router.js';
import { subscribe } from './state/playerState.js';
import { upgradableCount, readyChestCount, claimablePassRewards } from './state/economy.js';
import { tickCountdowns } from './ui/dom.js';
import { renderTopBar } from './ui/components/topBar.js';
import { createBottomNav } from './ui/components/bottomNav.js';
import { shop } from './ui/screens/shop.js';
import { collection } from './ui/screens/collection.js';
import { battleHub } from './ui/screens/battleHub.js';
import { social, startSocialSimulation } from './ui/screens/social.js';
import { events, activeEventCount } from './ui/screens/events.js';
import { isInBattle } from './game/battleFlow.js';

const topBarEl = document.getElementById('top-bar');
const outlet = document.getElementById('screens');

// Order = left-to-right order in the bottom bar (and swipe order).
const SCREENS = [shop, collection, battleHub, social, events];

const router = createRouter({
  outlet,
  screens: SCREENS,
  defaultId: 'battle',
  onNavigate: (id) => nav.setActive(id),
});

const BADGES = {
  shop: () => null,
  cards: () => upgradableCount() || null,
  battle: () => (readyChestCount() + claimablePassRewards()) || null,
  social: () => null,
  events: () => activeEventCount() || null,
};

const nav = createBottomNav(SCREENS.map((s) => ({ id: s.id, label: s.label, icon: s.icon, badge: BADGES[s.id] })), router);
document.getElementById('app').append(nav.el);

// Any state change → refresh top bar, badges and the visible screen.
// (Screens are cheap DOM trees; a full re-render of the visible one keeps the code simple.)
let pending = null;
subscribe((_, reason) => {
  pending = reason;
  queueMicrotask(flush);
});
function flush() {
  if (pending == null) return;
  const reason = pending;
  pending = null;
  renderTopBar(topBarEl, router);
  nav.refreshBadges();
  if (!isInBattle()) router.refresh(reason);
}

renderTopBar(topBarEl, router);
nav.refreshBadges();
router.start();
startSocialSimulation();

// One ticker for all countdowns. When one expires (chest ready, new day, event rotation) redraw.
setInterval(() => {
  if (isInBattle()) return;
  if (tickCountdowns(document)) {
    nav.refreshBadges();
    router.refresh('timer');
  }
}, 1000);
