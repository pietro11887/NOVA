// Stackable modal sheets + confirm dialog.

import { h } from '../dom.js';

const root = () => document.getElementById('modal-root');
const stack = [];

/**
 * openModal({ title, body: Node | (close) => Node, actions: [{ label, class, onClick(close) }], className, dismissable })
 * Returns close().
 */
export function openModal({ title, body, actions = [], className = '', dismissable = true, onClose } = {}) {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 180);
    stack.splice(stack.indexOf(close), 1);
    onClose?.();
  };

  const content = typeof body === 'function' ? body(close) : body;
  const overlay = h('div', { class: 'modal-overlay', onClick: (e) => { if (dismissable && e.target === overlay) close(); } },
    h('div', { class: ['modal', className], role: 'dialog', 'aria-modal': 'true' },
      title && h('header', { class: 'modal-head' },
        h('h2', {}, title),
        dismissable && h('button', { class: 'icon-btn', 'aria-label': 'Chiudi', onClick: close }, '✕'),
      ),
      h('div', { class: 'modal-body' }, content),
      actions.length > 0 && h('footer', { class: 'modal-actions' },
        actions.map((a) => h('button', { class: ['btn', a.class || 'btn-blue'], disabled: a.disabled, onClick: () => a.onClick?.(close) }, a.label)),
      ),
    ),
  );
  root().append(overlay);
  stack.push(close);
  return close;
}

export function confirmDialog({ title, message, confirmLabel = 'Conferma', cancelLabel = 'Annulla', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (value, close) => { answered = true; resolve(value); close(); };
    openModal({
      title,
      className: 'modal-small',
      body: h('p', { class: 'confirm-text' }, message),
      actions: [
        { label: cancelLabel, class: 'btn-ghost', onClick: (close) => done(false, close) },
        { label: confirmLabel, class: danger ? 'btn-red' : 'btn-green', onClick: (close) => done(true, close) },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

export const closeTopModal = () => stack[stack.length - 1]?.();
export const hasOpenModal = () => stack.length > 0;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeTopModal();
});
