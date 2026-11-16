/* ============================================================
   chart/colour.js — the colour picker, working the way TradingView's does:
   a swatch that opens a palette (greys, ten hues and their shades), the
   colours you have added, a + for any colour (its code, Add, a square for
   strength and brightness, the hues down the side), and the opacity
   underneath. Used by Chart Settings, the drawings, and the background's fade
   (appearance.js). The system's own colour box is not used anywhere.
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

/* ---- any colour: hue, then how strong and how bright ---- */
export function toHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s: mx ? d / mx : 0, v: mx };
}
export function fromHsv({ h, s, v }) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}
/* colours you have added yourself: kept on this computer, newest last, a row of ten at most two deep */
const KEY = 'laminar:colours';
export function yourColours() {
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(x => /^#[0-9A-F]{6}$/.test(x)).slice(-19) : []; } catch { return []; }
}
function keepColour(hex) {
  const a = yourColours().filter(x => x !== hex); a.push(hex);
  try { localStorage.setItem(KEY, JSON.stringify(a.slice(-19))); } catch { /* not kept; still picked */ }
}
function dropColour(hex) {
  try { localStorage.setItem(KEY, JSON.stringify(yourColours().filter(x => x !== hex))); } catch { /* fine */ }
}

let pop = null;
export function closeColour() {
  if (!pop) return;
  pop.remove(); pop = null;
  document.removeEventListener('pointerdown', away, true);
}
const away = e => { if (pop && !pop.contains(e.target) && !pop.__anchor?.contains?.(e.target)) closeColour(); };

/** A swatch button; picking a colour calls onChange(css). */
export function swatch(value, onChange, { cls = '', title = 'Colour', opacity = true } = {}) {
  const chip = el('i', { style: { background: value } });
  const b = el('button', { class: 'tv-swatch ' + cls, type: 'button', title, onClick: e => { e.stopPropagation(); openPicker(b, value, v => { value = v; chip.style.background = v; onChange(v); }, { opacity }); } }, chip);
  return b;
}

/** The palette under `anchor`. `live: false` holds a dragged colour back until the pointer is let go
    (for a change that is slow to apply, like the background's fade). */
export function openPicker(anchor, value, onChange, { opacity = true, live = true } = {}) {
  const was = pop?.__anchor === anchor;
  closeColour();
  if (was) return null;
  let cur = parseColour(value);
  const sameRGB = h => { const p = parseColour(h); return p.r === Math.round(cur.r) && p.g === Math.round(cur.g) && p.b === Math.round(cur.b); };
  const cell = h => el('button', { type: 'button', class: 'tv-pal-c' + (sameRGB(h) ? ' is-on' : ''), title: h, 'data-c': h, style: { background: h },
    onClick: () => { const p = parseColour(h); cur = { ...p, a: cur.a }; send(); } });
  const grid = el('div', { class: 'tv-pal' });
  const paintGrid = () => grid.replaceChildren(...ROWS.map((row, k) => el('div', { class: 'tv-pal-row' + (k === 1 ? ' is-gap' : '') }, ...row.map(cell))));
  /* your own colours, then + for another */
  const foot = el('div', { class: 'tv-pal-foot' });
  const paintFoot = () => foot.replaceChildren(
    ...yourColours().map(h => { const b = cell(h); b.classList.add('is-yours'); b.title = h + ' (right-click to remove)';
      b.addEventListener('contextmenu', e => { e.preventDefault(); dropColour(h); paintFoot(); }); return b; }),
    el('button', { type: 'button', class: 'tv-pal-plus', title: 'Any colour', 'aria-label': 'Any colour', onClick: () => custom() }, '+'));
  const range = el('input', { type: 'range', min: 0, max: 100, value: Math.round(cur.a * 100), class: 'tv-op-range',
    onInput: e => { cur.a = +e.target.value / 100; send(false); } });
  const pct = el('span', { class: 'tv-op-val' }, Math.round(cur.a * 100) + '%');
  function send(regrid = true) {
    const css = toCss(cur);
    pct.textContent = Math.round(cur.a * 100) + '%';
    range.style.setProperty('--c', toHex(cur));
    if (regrid) { paintGrid(); paintFoot(); }
    onChange(css);
  }
  const palette = el('div', { class: 'tv-pal-view' }, grid, foot,
    opacity ? el('div', { class: 'tv-op' }, el('span', { class: 'tv-op-h' }, 'Opacity'), el('div', { class: 'tv-op-row' }, range, pct)) : null);

  /* ---- any colour: its code and Add on top, a square to pick how strong and how bright, the hues down the side ---- */
  function custom() {
    let hsv = toHsv(cur);
    const chip = el('i', { class: 'tv-cc-chip' });
    const hex = el('input', { class: 'tv-cc-hex', type: 'text', spellcheck: 'false', maxLength: 7, 'aria-label': 'Colour code',
      onInput: () => { const m = hex.value.trim().match(/^#?([0-9a-f]{6})$/i); if (!m) return; cur = { ...parseColour('#' + m[1]), a: cur.a }; hsv = toHsv(cur); paint(false); tell(true); },
      onKeydown: e => { if (e.key === 'Enter') { e.preventDefault(); add.click(); } } });
    const add = el('button', { type: 'button', class: 'tv-cc-add', onClick: () => { keepColour(toHex(cur)); onChange(toCss(cur)); view(palette); send(); } }, 'Add');
    const dot = el('i', { class: 'tv-cc-dot' }), sv = el('div', { class: 'tv-cc-sv', role: 'slider', 'aria-label': 'Strength and brightness', tabindex: '0' }, dot);
    const mark = el('i', { class: 'tv-cc-mark' }), hue = el('div', { class: 'tv-cc-hue', role: 'slider', 'aria-label': 'Hue', tabindex: '0' }, mark);
    const tell = done => { if (live || done) onChange(toCss(cur)); };
    function paint(writeHex = true) {
      const h = toHex(cur);
      chip.style.background = h;
      if (writeHex) hex.value = h;
      sv.style.setProperty('--hue', `hsl(${Math.round(hsv.h)}, 100%, 50%)`);
      dot.style.left = hsv.s * 100 + '%'; dot.style.top = (1 - hsv.v) * 100 + '%'; dot.style.background = h;
      mark.style.top = hsv.h / 360 * 100 + '%';
    }
    const drag = (node, set) => node.addEventListener('pointerdown', e => {
      e.preventDefault(); node.setPointerCapture(e.pointerId);
      const at = ev => { const r = node.getBoundingClientRect(); set(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)));
        cur = { ...fromHsv(hsv), a: cur.a }; paint(); };
      at(e); tell(false);
      const mv = ev => { at(ev); tell(false); };
      const up = () => { node.removeEventListener('pointermove', mv); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up); tell(true); };
      node.addEventListener('pointermove', mv); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
    });
    drag(sv, (x, y) => { hsv.s = x; hsv.v = 1 - y; });
    drag(hue, (x, y) => { hsv.h = Math.min(359.9, y * 360); });
    paint();
    view(el('div', { class: 'tv-cc' },
      el('div', { class: 'tv-cc-top' }, chip, hex, add),
      el('div', { class: 'tv-cc-body' }, sv, hue)));
    hex.select();
  }
  function view(node) { pop.replaceChildren(node); place(); }
  function place() {
    const r = anchor.getBoundingClientRect(), pr = pop.getBoundingClientRect();
    pop.style.left = Math.max(4, Math.min(r.left, innerWidth - pr.width - 4)) + 'px';
    pop.style.top = (r.bottom + 6 + pr.height > innerHeight ? Math.max(4, r.top - pr.height - 6) : r.bottom + 6) + 'px';
  }

  paintGrid(); paintFoot();
  range.style.setProperty('--c', toHex(cur));
  pop = el('div', { class: 'tv-ui tv-colour' }, palette);
  pop.__anchor = anchor;
  pop.addEventListener('pointerdown', e => e.stopPropagation());
  document.body.append(pop);
  place();
  setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
  return pop;
}
