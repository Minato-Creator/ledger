/* ============================================================
   sheet.js — a panel that rises over the app.

   On a wide window it is a card that rises from just below centre; on a
   narrow one it slides up from the bottom edge with a handle, the way a
   phone sheet does. Either way the page behind dims, Escape or a click on
   the dim closes it, and it sinks away rather than vanishing.

   It lives on <body>, outside #app, because the app rebuilds #app on every
   click — a sheet inside it would be torn down by the first re-render.
   ============================================================ */
import { el, icon } from './ui.js';

const open = new Set();

/**
 * @param {object}   o
 * @param {string}   o.cls      extra class on the panel ('is-wide', 'is-look' …)
 * @param {Node}     o.body     what goes inside
 * @param {string}  [o.title]   a plain title row with a close button
 * @param {Function}[o.onClose] called once it has gone
 * @returns {{ panel: HTMLElement, close: Function }}
 */
export function sheet({ cls = '', body, title, onClose, label } = {}) {
  const scrim = el('div', { class: 'sheet-scrim' });
  const panel = el('div', { class: 'sheet ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-label': label || title || 'Panel' });
  const handle = el('div', { class: 'sheet-handle', 'aria-hidden': 'true' });
  let closing = false;

  const close = () => {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', onKey, true);
    scrim.classList.add('is-out');
    panel.classList.add('is-out');
    const done = () => { scrim.remove(); panel.remove(); open.delete(api); onClose?.(); };
    const quiet = document.documentElement.dataset.motion === 'off'
      || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (quiet) done(); else setTimeout(done, 260);
  };
  const onKey = e => {
    if (e.key !== 'Escape') return;
    /* Only the top sheet closes, and a field's own Escape (a menu) goes first. */
    if ([...open].pop() !== api) return;
    if (e.target.closest?.('.drop-menu:not([hidden]), .pnl-menu:not([hidden])')) return;
    e.stopPropagation(); close();
  };

  if (title) {
    panel.append(el('div', { class: 'sheet-title' },
      el('h2', {}, title),
      el('button', { class: 'sheet-x', 'aria-label': 'Close', onClick: close }, icon('close', 14, 'currentColor', 2))));
  }
  panel.prepend(handle);
  if (body) panel.append(body);

  scrim.addEventListener('pointerdown', close);
  /* Drag the handle down on a phone to let it go. */
  let y0 = null;
  handle.addEventListener('pointerdown', e => { y0 = e.clientY; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', e => {
    if (y0 == null) return;
    const dy = Math.max(0, e.clientY - y0);
    panel.style.transform = `translateY(${dy}px)`;
  });
  handle.addEventListener('pointerup', e => {
    if (y0 == null) return;
    const dy = e.clientY - y0; y0 = null;
    panel.style.transform = '';
    if (dy > 90) close();
  });

  document.addEventListener('keydown', onKey, true);
  document.body.append(scrim, panel);
  const api = { panel, close };
  open.add(api);
  return api;
}

/** Close every sheet — used when the route changes underneath them. */
export function closeSheets() { for (const s of [...open]) s.close(); }
export const sheetsOpen = () => open.size > 0;

/**
 * A small menu anchored to a button: account list, quick actions.
 * Closes on a click elsewhere or Escape. Returns the close function.
 */
export function popover(anchor, body, { cls = '', align = 'right' } = {}) {
  const r = anchor.getBoundingClientRect();
  const pop = el('div', { class: 'popover ' + cls, role: 'menu' }, body);
  pop.style.top = `${Math.round(r.bottom + 8)}px`;
  if (align === 'right') pop.style.right = `${Math.round(innerWidth - r.right)}px`;
  else pop.style.left = `${Math.round(r.left)}px`;
  document.body.append(pop);
  const away = e => {
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    if (e.type === 'pointerdown' && (pop.contains(e.target) || anchor.contains(e.target))) return;
    close();
  };
  const close = () => {
    document.removeEventListener('pointerdown', away, true);
    document.removeEventListener('keydown', away, true);
    pop.classList.add('is-out');
    setTimeout(() => pop.remove(), 160);
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', away, true);
  });
  return close;
}
