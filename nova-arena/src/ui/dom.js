// Tiny DOM helpers: hyperscript-style element factory + formatting utilities.

/**
 * h('div', { class: 'x', onClick: fn, dataset: { id: 1 }, style: {...} }, child, [children], 'text')
 * Falsy children (null/false/undefined) are skipped, arrays are flattened.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') {
      // CSS custom properties (--x) only work through setProperty.
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    }
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Replaces el's content with children (same rules as h(): falsy skipped, arrays flattened). */
export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

/** 1234 -> "1.234", 1250000 -> "1,25 M" */
export function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' M';
  return Math.floor(n).toLocaleString('it-IT');
}

/** Milliseconds -> "2h 05m" / "4m 09s" / "12s" / "1g 3h" */
export function fmtDuration(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600);
  const mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (v) => String(v).padStart(2, '0');
  if (d > 0) return `${d}g ${hh}h`;
  if (hh > 0) return `${hh}h ${p(mm)}m`;
  if (mm > 0) return `${mm}m ${p(ss)}s`;
  return `${ss}s`;
}

/** Deterministic PRNG (mulberry32) — used for daily shop rotation. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (min, max, rnd = Math.random) => Math.floor(rnd() * (max - min + 1)) + min;
export const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];
export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Elements carrying data-ends-at="<epoch ms>" are refreshed every second by main.js. */
export function countdown(endsAt, { prefix = '', done = 'Pronto!', className = '' } = {}) {
  const el = h('span', { class: ['countdown', className], dataset: { endsAt: String(endsAt), prefix, done } });
  el.textContent = prefix + fmtDuration(endsAt - Date.now());
  return el;
}

export function tickCountdowns(root = document) {
  const now = Date.now();
  let expired = false;
  root.querySelectorAll('[data-ends-at]').forEach((el) => {
    const left = Number(el.dataset.endsAt) - now;
    if (left <= 0) {
      if (el.textContent !== el.dataset.done) expired = true;
      el.textContent = el.dataset.done;
    } else {
      el.textContent = (el.dataset.prefix || '') + fmtDuration(left);
    }
  });
  return expired;
}
