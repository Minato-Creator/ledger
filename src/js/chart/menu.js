/* ============================================================
   chart/menu.js — TradingView's small floating pieces: the right-click
   menu, and the Change interval box that typing a number opens.
   ============================================================ */
import { el } from '../ui.js';

const icon = d => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', 18); s.setAttribute('height', 18);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  if (d) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p); }
  return s;
};

/* ---------- the menu ---------- */
let open = null;
export function closeMenus() {
  if (!open) return;
  open.remove(); open = null;
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', esc, true);
  window.removeEventListener('blur', closeMenus);
  window.removeEventListener('resize', closeMenus);
}
const outside = e => { if (open && !open.contains(e.target)) closeMenus(); };
const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeMenus(); } };

/**
 * items: [{ label, hint, icon (path), act, disabled, checked, cls } | { sep: true } | { head: 'text' }]
 * Opened at the pointer and kept inside the window.
 */
export function openMenu(items, x, y, { cls = '' } = {}) {
  closeMenus();
  const rows = [];
  items.forEach((it, k) => {
    if (it.sep) { if (rows.length && !rows.at(-1).classList.contains('tv-sep') && k < items.length - 1) rows.push(el('div', { class: 'tv-sep' })); return; }
    if (it.head) { rows.push(el('div', { class: 'tv-mhead' }, it.head)); return; }
    rows.push(el('button', { class: 'tv-mi ' + (it.cls || '') + (it.checked ? ' is-checked' : ''), disabled: !!it.disabled, role: 'menuitem',
      onClick: e => { e.stopPropagation(); if (!it.keep) closeMenus(); it.act?.(); } },
      el('span', { class: 'tv-mic' }, it.checked != null ? icon(it.checked ? 'M5 12.5l4.5 4.5L19 7' : '') : icon(it.icon || '')),
      el('span', { class: 'tv-mlabel' }, it.label),
      it.hint ? el('span', { class: 'tv-mhint' }, it.hint) : null));
  });
  if (rows.at(-1)?.classList.contains('tv-sep')) rows.pop();
  const m = el('div', { class: 'tv-ui tv-menu ' + cls, role: 'menu' }, ...rows);
  m.addEventListener('contextmenu', e => e.preventDefault());
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
  m.style.top = Math.max(4, y + r.height > innerHeight - 4 ? y - r.height : y) + 'px';
  open = m;
  setTimeout(() => {
    if (open !== m) return;
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('blur', closeMenus);
    window.addEventListener('resize', closeMenus);
  }, 0);
  return m;
}
export const menuOpen = () => !!open;

/* ---------- Change interval ---------- */
const NAMES = { 1: '1 minute', 60: '1 hour', 1440: '1 day' };
const describe = m => NAMES[m] || (m % 60 === 0 && m < 1440 ? `${m / 60} hours` : `${m} minutes`);
const short = m => (m >= 1440 ? 'D' : m % 60 === 0 ? `${m / 60}h` : `${m}m`);

/** What was typed → minutes, or null. "1" one minute, "15" fifteen, "1h", "4h", "D" / "1D" a day. */
export function parseInterval(text) {
  const s = String(text || '').trim().toLowerCase().replace(/\s+/g, '');
  if (s === 'd' || s === '1d') return 1440;
  const m = s.match(/^(\d{1,4})(m|min|h|hr)?$/);
  if (!m) return null;
  const n = +m[1];
  if (!n) return null;
  return m[2] && m[2][0] === 'h' ? n * 60 : n;
}

let box = null;
/** TradingView's box in the middle of the chart: type, read what it means, Enter switches. */
export function intervalBox(plot, first, onPick, allowed) {
  if (box) { box.remove(); box = null; }
  const input = el('input', { class: 'tv-int-in', value: first || '', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Interval' });
  const hint = el('div', { class: 'tv-int-hint' });
  const card = el('div', { class: 'tv-ui tv-int', role: 'dialog' },
    el('div', { class: 'tv-int-h' }, 'Change interval'), input, hint);
  const done = () => { if (box === card) { card.remove(); box = null; } };
  const read = () => {
    const m = parseInterval(input.value);
    const ok = m != null && allowed.includes(m);
    hint.textContent = !input.value.trim() ? '' : m == null ? 'Not an interval' : ok ? describe(m)
      : `${describe(m)} isn’t on this chart — ${allowed.map(short).join(' · ')}`;
    hint.classList.toggle('is-bad', !!input.value.trim() && !ok);
    card.classList.toggle('is-bad', !!input.value.trim() && !ok);
    return ok ? m : null;
  };
  input.addEventListener('input', read);
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); done(); }
    if (e.key === 'Enter') { e.preventDefault(); const m = read(); if (m != null) { done(); onPick(m); } }
  });
  input.addEventListener('blur', () => setTimeout(done, 0));
  plot.append(card);
  box = card;
  read();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  return card;
}
