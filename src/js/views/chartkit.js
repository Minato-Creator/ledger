/* ============================================================
   chartkit.js — the pieces The Lab's charts share: round axis steps, and a
   crosshair with a readout. Kept apart so Monte Carlo and Ghost draw with
   the same hand.
   ============================================================ */
import { el, svg } from '../ui.js';
import * as c from '../calc.js';

/* Round steps for an axis: 1, 2 or 5 of a power of ten. */
export function ticks(lo, hi, want = 5) {
  const span = hi - lo || 1;
  const raw = span / want, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => span / s <= want + 1) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/* A crosshair and a readout, driven by one transparent layer over the plot.
   The readout is HTML laid over the SVG, so its type is crisp and it can be
   kept inside the card whatever the width. */
export function hoverLayer(wrap, g, plot, onMove) {
  const line = svg('line', { class: 'lab-cross', x1: 0, x2: 0, y1: plot.t, y2: plot.b, visibility: 'hidden' });
  const dot = svg('circle', { class: 'lab-cross-dot', r: 4, visibility: 'hidden' });
  const hit = svg('rect', { x: plot.l, y: plot.t, width: plot.r - plot.l, height: plot.b - plot.t, fill: 'transparent', class: 'lab-hit' });
  const read = el('div', { class: 'lab-read', hidden: true });
  g.append(line, dot, hit);
  wrap.append(read);
  const hide = () => { line.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); read.hidden = true; };
  hit.addEventListener('pointerleave', hide);
  hit.addEventListener('pointermove', e => {
    const box = hit.getBoundingClientRect();
    const x = plot.l + (e.clientX - box.left) * ((plot.r - plot.l) / box.width);
    const o = onMove(Math.max(plot.l, Math.min(plot.r, x)));
    if (!o) return hide();
    line.setAttribute('x1', o.x); line.setAttribute('x2', o.x); line.setAttribute('visibility', 'visible');
    if (o.y != null) { dot.setAttribute('cx', o.x); dot.setAttribute('cy', o.y); dot.setAttribute('visibility', 'visible'); }
    else dot.setAttribute('visibility', 'hidden');
    read.replaceChildren(...o.rows);
    read.hidden = false;
    /* Beside the crosshair, flipping to the other side near the edge. One
       SVG unit is one pixel here, so x needs no scaling. */
    const w = wrap.clientWidth, rw = read.offsetWidth;
    const left = o.x + 12 + rw > w - 4 ? o.x - rw - 12 : o.x + 12;
    read.style.left = Math.max(4, Math.min(w - rw - 4, left)) + 'px';
  });
}
export const readRow = (cls, value, label) => el('div', { class: 'r' }, cls ? el('i', { class: cls }) : null, el('b', {}, value), el('span', {}, label));


/* A readout placed next to a point rather than a crosshair — for marks you
   point at one by one: a heat-map cell, a dot, a column. Kept inside the
   chart whatever the width. */
export function tipLayer(wrap) {
  const read = el('div', { class: 'lab-read', hidden: true });
  wrap.append(read);
  return {
    show(x, y, rows) {
      read.replaceChildren(...rows);
      read.hidden = false;
      const w = wrap.clientWidth, h = wrap.clientHeight, rw = read.offsetWidth, rh = read.offsetHeight;
      let left = x + 14; if (left + rw > w - 4) left = x - rw - 14;
      let top = y - rh / 2; top = Math.max(4, Math.min(h - rh - 4, top));
      read.style.left = Math.max(4, left) + 'px';
      read.style.top = top + 'px';
    },
    hide() { read.hidden = true; },
  };
}

/* A sparkline: the shape of a run of numbers, drawn to whatever box it is
   put in. The stroke keeps its width however far the box stretches it. The
   last point is marked in the colour of where the line ended up. */
export function spark(values, { height = 26, zero = true, cls = '' } = {}) {
  values = values.filter(v => v != null && isFinite(v));
  const n = values.length;
  const g = svg('svg', { class: 'an-spark', viewBox: `0 0 100 ${height}`, preserveAspectRatio: 'none', height, width: '100%' });
  if (n < 2) return g;
  let lo = Math.min(...values), hi = Math.max(...values);
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const span = hi - lo || 1;
  const X = i => (i / (n - 1)) * 100;
  const Y = v => height - 2 - ((v - lo) / span) * (height - 4);
  if (zero && lo < 0 && hi > 0) g.append(svg('line', { class: 'an-spark-zero', x1: 0, x2: 100, y1: Y(0), y2: Y(0), 'vector-effect': 'non-scaling-stroke' }));
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(2)},${Y(v).toFixed(2)}`).join('');
  g.append(svg('path', { class: 'an-spark-line ' + cls, d, 'vector-effect': 'non-scaling-stroke' }));
  return g;
}

/* Figures in whichever unit the app is set to: the value a trade adds, a
   result with its sign, and the shorter form an axis wants. A trade with no
   money but a stated R — a forward test — adds nothing in $ or %, the same as
   everywhere else in Analytics. */
export function unitKit(u, acct) {
  const sym = { USD: '$', EUR: '€', GBP: '£', AUD: 'A$', JPY: '¥' }[acct?.currency] || '$';
  const valueOf = t => c.figValue(u, acct, Number(t.netResult) || 0, c.rMultiple(acct, t)) ?? 0;
  const fmt = (v, { sign = true, short = false } = {}) => {
    if (v == null || !isFinite(v)) return '—';
    const neg = v < 0, a = Math.abs(v);
    let body;
    const trim = x => x.replace(/\.0$/, '');
    if (u === 'R') body = (short ? trim(a.toFixed(a < 10 ? 1 : 0)) : a.toFixed(2)) + 'R';
    else if (u === '%') body = (short ? trim(a.toFixed(a < 10 ? 1 : 0)) : a.toFixed(2)) + '%';
    else if (short && a >= 1000) body = sym + (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    else body = sym + Math.round(a).toLocaleString('en-US');
    if (Number(body.replace(/[^0-9.]/g, '')) === 0) return body;
    return (neg ? '−' : sign ? '+' : '') + body;
  };
  return { u, valueOf, fmt, axis: v => fmt(v, { sign: false, short: true }) };
}

/* Nth, for a position in a day. */
export const nth = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
