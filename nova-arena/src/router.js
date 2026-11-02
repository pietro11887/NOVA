// Lightweight hash router for the menu hub.
// Each screen is a module { id, label, icon, mount(el), render(el, ctx), onShow?(el), onHide?(el) }.
// Screens are mounted lazily into their own <section>, then only toggled (never rebuilt on navigation),
// so switching tabs is instant and keeps each screen's scroll position.

export function createRouter({ outlet, screens, defaultId, onNavigate }) {
  const order = screens.map((s) => s.id);
  const byId = Object.fromEntries(screens.map((s) => [s.id, s]));
  const sections = new Map();
  let currentId = null;

  function sectionFor(id) {
    if (!sections.has(id)) {
      const el = document.createElement('section');
      el.className = 'screen';
      el.id = `screen-${id}`;
      el.dataset.screen = id;
      el.hidden = true;
      outlet.append(el);
      byId[id].mount?.(el, api);
      sections.set(id, el);
    }
    return sections.get(id);
  }

  function parseHash() {
    const [id, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
    return { id: byId[id] ? id : defaultId, params: rest };
  }

  function show(id, params = []) {
    const screen = byId[id];
    const el = sectionFor(id);
    if (id !== currentId) {
      const prevIdx = order.indexOf(currentId);
      const prev = currentId && sections.get(currentId);
      if (prev) {
        prev.hidden = true;
        byId[currentId].onHide?.(prev);
      }
      el.hidden = false;
      // Slide in from the side of the tab we came from.
      el.classList.remove('enter-left', 'enter-right');
      if (prevIdx >= 0) {
        void el.offsetWidth;
        el.classList.add(order.indexOf(id) > prevIdx ? 'enter-right' : 'enter-left');
      }
      currentId = id;
    }
    screen.render(el, { params, router: api });
    screen.onShow?.(el, { params });
    onNavigate?.(id);
  }

  const api = {
    get current() { return currentId; },
    order,
    navigate(id, ...params) {
      const hash = `#/${[id, ...params].join('/')}`;
      if (location.hash === hash) show(id, params);
      else location.hash = hash;
    },
    /** Re-render the visible screen (called on every state change). */
    refresh(reason) {
      if (!currentId) return;
      const screen = byId[currentId];
      if (screen.shouldRefresh && !screen.shouldRefresh(reason)) return;
      const el = sections.get(currentId);
      const scroll = el.scrollTop; // full re-render must not jump the page
      screen.render(el, { params: [], router: api, reason });
      el.scrollTop = scroll;
    },
    step(delta) {
      const idx = order.indexOf(currentId) + delta;
      if (idx >= 0 && idx < order.length) api.navigate(order[idx]);
    },
  };

  window.addEventListener('hashchange', () => {
    const { id, params } = parseHash();
    show(id, params);
  });

  enableSwipe(outlet, api);

  api.start = () => {
    const { id, params } = parseHash();
    show(id, params);
  };
  return api;
}

/** Horizontal swipe on the screen area switches tab (ignores swipes inside horizontal scrollers). */
function enableSwipe(outlet, api) {
  let start = null;
  outlet.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest('.h-scroll, input, textarea, .no-swipe')) { start = null; return; }
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  outlet.addEventListener('touchend', (e) => {
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    const fast = Date.now() - start.t < 450;
    if (fast && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) api.step(dx < 0 ? 1 : -1);
    start = null;
  }, { passive: true });
}
