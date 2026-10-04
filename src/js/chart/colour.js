/* ============================================================
   chart/colour.js — TradingView's colour picker: a swatch that opens a
   palette (greys, ten hues and their shades), a + for any colour, and the
   opacity underneath. Used by Chart Settings now, and the drawings later.
   ============================================================ */
import { el } from '../ui.js';

const GREYS = ['#FFFFFF', '#EBEBEB', '#D6D6D6', '#BFBFBF', '#A8A8A8', '#8F8F8F', '#757575', '#5C5C5C', '#434343', '#000000'];
const HUES = ['#F23645', '#FF9800', '#FFEB3B', '#4CAF50', '#089981', '#00BCD4', '#2962FF', '#673AB7', '#9C27B0', '#E91E63'];

export function parseColour(c) {
  const s = String(c || '').trim();
  let m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) { const n = parseInt(m[1], 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 }; }
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) { const [r, g, b] = m[1].split('').map(h => parseInt(h + h, 16)); return { r, g, b, a: 1 }; }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) { const [r, g, b, a] = m[1].split(',').map(x => parseFloat(x)); return { r, g, b, a: Number.isFinite(a) ? a : 1 }; }
  return { r: 128, g: 128, b: 128, a: 1 };
}
const hex2 = n => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0').toUpperCase();
export const toHex = ({ r, g, b }) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
export function toCss({ r, g, b, a }) {
  return a >= 0.999 ? toHex({ r, g, b }) : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+a.toFixed(2)})`;
}
const mix = (c, w, k) => { const x = parseColour(c), y = parseColour(w); return toHex({ r: x.r + (y.r - x.r) * k, g: x.g + (y.g - x.g) * k, b: x.b + (y.b - x.b) * k }); };
const ROWS = [GREYS, HUES,
  ...[0.8, 0.6, 0.4, 0.2].map(k => HUES.map(h => mix(h, '#FFFFFF', k))),
  ...[0.25, 0.5].map(k => HUES.map(h => mix(h, '#000000', k)))];

let pop = null;
export function closeColour() {
  if (!pop) return;
  pop.remove(); pop = null;
  document.removeEventListener('pointerdown', away, true);
}
const away = e => { if (pop && !pop.contains(e.target) && !e.target.closest?.('.tv-swatch')) closeColour(); };

/** A swatch button; picking a colour calls onChange(css). */
export function swatch(value, onChange, { cls = '', title = 'Colour', opacity = true } = {}) {
  const chip = el('i', { style: { background: value } });
  const b = el('button', { class: 'tv-swatch ' + cls, type: 'button', title, onClick: e => { e.stopPropagation(); openPicker(b, value, v => { value = v; chip.style.background = v; onChange(v); }, { opacity }); } }, chip);
  return b;
}

export function openPicker(anchor, value, onChange, { opacity = true } = {}) {
  const was = pop?.__anchor === anchor;
  closeColour();
  if (was) return null;
  let cur = parseColour(value);
  const sameRGB = h => { const p = parseColour(h); return p.r === Math.round(cur.r) && p.g === Math.round(cur.g) && p.b === Math.round(cur.b); };
  const grid = el('div', { class: 'tv-pal' });
  const paintGrid = () => grid.replaceChildren(...ROWS.map((row, k) => el('div', { class: 'tv-pal-row' + (k === 1 ? ' is-gap' : '') },
    ...row.map(h => el('button', { type: 'button', class: 'tv-pal-c' + (sameRGB(h) ? ' is-on' : ''), title: h, 'data-c': h, style: { background: h },
      onClick: () => { const p = parseColour(h); cur = { ...p, a: cur.a }; send(); } })))));
  const native = el('input', { type: 'color', class: 'tv-pal-native', value: toHex(cur), onInput: e => { const p = parseColour(e.target.value); cur = { ...p, a: cur.a }; send(); } });
  const plus = el('label', { class: 'tv-pal-plus', title: 'Custom colour' }, '+', native);
  const range = el('input', { type: 'range', min: 0, max: 100, value: Math.round(cur.a * 100), class: 'tv-op-range',
    onInput: e => { cur.a = +e.target.value / 100; send(false); } });
  const pct = el('span', { class: 'tv-op-val' }, Math.round(cur.a * 100) + '%');
  function send(regrid = true) {
    const css = toCss(cur);
    pct.textContent = Math.round(cur.a * 100) + '%';
    range.style.setProperty('--c', toHex(cur));
    if (regrid) paintGrid();
    onChange(css);
  }
  paintGrid();
  range.style.setProperty('--c', toHex(cur));
  pop = el('div', { class: 'tv-ui tv-colour' }, grid,
    el('div', { class: 'tv-pal-foot' }, plus),
    opacity ? el('div', { class: 'tv-op' }, el('span', { class: 'tv-op-h' }, 'Opacity'), el('div', { class: 'tv-op-row' }, range, pct)) : null);
  pop.__anchor = anchor;
  pop.addEventListener('pointerdown', e => e.stopPropagation());
  document.body.append(pop);
  const r = anchor.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  pop.style.left = Math.max(4, Math.min(r.left, innerWidth - pr.width - 4)) + 'px';
  pop.style.top = (r.bottom + 6 + pr.height > innerHeight ? Math.max(4, r.top - pr.height - 6) : r.bottom + 6) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
  return pop;
}
