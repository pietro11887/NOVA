import { h } from '../dom.js';

/** toast('Testo', 'ok' | 'warn' | 'error' | 'info') */
export function toast(message, type = 'info', ms = 2400) {
  const el = h('div', { class: ['toast', `toast-${type}`], role: 'status' }, message);
  document.getElementById('toast-root').append(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 300);
}
