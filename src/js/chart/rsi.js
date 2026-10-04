/* ============================================================
   chart/rsi.js — the Relative Strength Index, the way TradingView's
   built-in one works, so the numbers match on the same candles.

   RSI = 100 − 100 / (1 + RMA(gains) / RMA(losses)) over `length` bars of
   the source's change. RMA is Wilder's average: the first value is the
   simple average of the first `length` values, then
   rma = (rma[1] × (length − 1) + x) / length. When there were no losses
   it is 100, when there were no gains 0 — TradingView's rule.

   The RSI-based moving average (TradingView's default: SMA 14) is taken
   of the RSI itself: None, SMA, SMA + Bollinger Bands, EMA, SMMA (RMA) or
   WMA. EMA and RMA start from the SMA of their first `length` values, as
   Pine's ta.ema and ta.rma do.

   It sits in its own pane under the chart: the RSI line, its average,
   the 70 / 50 / 30 bands and the fill between 70 and 30.
   ============================================================ */
import { el } from '../ui.js';
import { swatch, closeColour } from './colour.js';
import { closeMenus } from './menu.js';
import { niceTicks, svgIcon, inkOn } from './core.js';

export const RSI_DEFAULTS = Object.freeze({
  length: 14, source: 'close', maType: 'SMA', maLength: 14, bbMult: 2,
  rsi: { on: true, color: '#7E57C2', width: 1 },
  ma: { on: true, color: '#F7B924', width: 1 },
  bands: { upper: 70, middle: 50, lower: 30, color: '#787878', on: true, middleOn: true },
  fill: { on: true, color: 'rgba(126, 87, 194, 0.1)' },
  bb: { color: '#089981' },
  labels: true, values: true, hideOn: [],
  height: 0.26,            // the pane's share of the chart — drag the line above it
});
export const SOURCES = [['close', 'Close'], ['open', 'Open'], ['high', 'High'], ['low', 'Low'], ['hl2', '(H + L)/2'], ['hlc3', '(H + L + C)/3'], ['ohlc4', '(O + H + L + C)/4']];
export const MA_TYPES = ['None', 'SMA', 'SMA + Bollinger Bands', 'EMA', 'SMMA (RMA)', 'WMA'];

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export function rsiSettings(raw) {
  const out = structuredClone(RSI_DEFAULTS);
  if (!isObj(raw)) return out;
  for (const k of Object.keys(out)) {
    if (!(k in raw)) continue;
    if (isObj(out[k]) && isObj(raw[k])) { for (const j of Object.keys(out[k])) if (typeof raw[k][j] === typeof out[k][j]) out[k][j] = raw[k][j]; }
    else if (Array.isArray(out[k]) && Array.isArray(raw[k])) out[k] = raw[k].filter(Number.isFinite);
    else if (typeof raw[k] === typeof out[k]) out[k] = raw[k];
  }
  out.length = Math.max(1, Math.min(500, Math.round(out.length)));
  out.maLength = Math.max(1, Math.min(500, Math.round(out.maLength)));
  if (!MA_TYPES.includes(out.maType)) out.maType = 'SMA';
  if (!SOURCES.some(([k]) => k === out.source)) out.source = 'close';
  out.height = Math.max(0.06, Math.min(0.75, Number.isFinite(out.height) ? out.height : 0.26));
  return out;
}

/* ---------- the arithmetic ---------- */
const src = (b, s) => (s === 'open' ? b[1] : s === 'high' ? b[2] : s === 'low' ? b[3] : s === 'hl2' ? (b[2] + b[3]) / 2
  : s === 'hlc3' ? (b[2] + b[3] + b[4]) / 3 : s === 'ohlc4' ? (b[1] + b[2] + b[3] + b[4]) / 4 : b[4]);
/** Wilder's average over a series that may start with gaps (null). */
export function rma(xs, n) { return seeded(xs, n, 1 / n); }
export function ema(xs, n) { return seeded(xs, n, 2 / (n + 1)); }
function seeded(xs, n, alpha) {
  const out = new Array(xs.length).fill(null);
  let run = 0, sum = 0, prev = null;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (x == null) { run = 0; sum = 0; continue; }
    if (prev == null) {
      run++; sum += x;
      if (run === n) { prev = sum / n; out[i] = prev; }
      continue;
    }
    prev = alpha * x + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}
export function sma(xs, n) {
  const out = new Array(xs.length).fill(null);
  let sum = 0, run = 0;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] == null) { sum = 0; run = 0; continue; }
    sum += xs[i]; run++;
    if (run > n) sum -= xs[i - n];
    if (run >= n) out[i] = sum / n;
  }
  return out;
}
export function wma(xs, n) {
  const out = new Array(xs.length).fill(null), den = n * (n + 1) / 2;
  for (let i = n - 1; i < xs.length; i++) {
    let s = 0, ok = true;
    for (let k = 0; k < n; k++) { const v = xs[i - k]; if (v == null) { ok = false; break; } s += v * (n - k); }
    if (ok) out[i] = s / den;
  }
  return out;
}
function stdev(xs, n, means) {
  const out = new Array(xs.length).fill(null);
  for (let i = 0; i < xs.length; i++) {
    if (means[i] == null) continue;
    let s = 0;
    for (let k = 0; k < n; k++) s += (xs[i - k] - means[i]) ** 2;
    out[i] = Math.sqrt(s / n);                      // population, as Pine's ta.stdev
  }
  return out;
}
/** RSI (and its average) for bars[0..upto]. */
export function computeRsi(bars, upto, S) {
  const n = Math.min(bars.length, upto + 1);
  const gains = new Array(n).fill(null), losses = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const ch = src(bars[i], S.source) - src(bars[i - 1], S.source);
    gains[i] = Math.max(ch, 0); losses[i] = Math.max(-ch, 0);
  }
  const up = rma(gains, S.length), dn = rma(losses, S.length);
  const rsi = up.map((u, i) => (u == null || dn[i] == null ? null : dn[i] === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / dn[i])));
  let ma = null, upper = null, lower = null;
  const t = S.maType;
  if (t === 'SMA' || t === 'SMA + Bollinger Bands') ma = sma(rsi, S.maLength);
  else if (t === 'EMA') ma = ema(rsi, S.maLength);
  else if (t === 'SMMA (RMA)') ma = rma(rsi, S.maLength);
  else if (t === 'WMA') ma = wma(rsi, S.maLength);
  if (t === 'SMA + Bollinger Bands') {
    const sd = stdev(rsi, S.maLength, ma);
    upper = ma.map((m, i) => (m == null ? null : m + sd[i] * S.bbMult));
    lower = ma.map((m, i) => (m == null ? null : m - sd[i] * S.bbMult));
  }
  return { rsi, ma, upper, lower };
}

/* ---------- the pane ---------- */
/**
 * @param core       the chart
 * @param o          { settings(), save(s), remove(), tf() }
 */
export function rsiPane(core, o) {
  let cache = { key: '', v: null };
  const data = () => {
    const S = o.settings(), bars = core.bars, k = core.limit();
    const b = bars[k];
    const key = [bars.length, k, b?.[0], b?.[4], core.tf, JSON.stringify(S)].join('|');
    if (cache.key !== key) cache = { key, v: computeRsi(bars, k, S) };
    return cache.v;
  };
  const f2 = v => (v == null ? '—' : v.toFixed(2));
  const legend = el('div', { class: 'tv-plegend rsi-legend' });
  return {
    key: 'rsi', min: 36,
    get ratio() { return o.settings().height; },
    /* dragging the line above it: shown as it goes, kept when let go */
    resize(r, keep) { if (r == null) { o.preview(null); return; } const d = { ...o.settings(), height: r }; if (keep) o.save(d); else o.preview(d); },
    hidden: () => o.settings().hideOn.includes(o.tf()),
    range(i0, i1) {
      const S = o.settings(), D = data();
      let lo = Infinity, hi = -Infinity;
      for (let i = i0; i <= i1; i++) for (const s of [D.rsi, S.ma.on ? D.ma : null, D.upper, D.lower]) { const v = s?.[i]; if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; } }
      if (S.bands.on) { lo = Math.min(lo, S.bands.lower); hi = Math.max(hi, S.bands.upper); }
      if (!Number.isFinite(lo)) { lo = 0; hi = 100; }
      const pad = (hi - lo) * 0.08 || 5;
      return { lo: lo - pad, hi: hi + pad };
    },
    ticks(A) { const S = o.settings(); return S.bands.on ? [S.bands.upper, ...(S.bands.middleOn ? [S.bands.middle] : []), S.bands.lower] : niceTicks(A.lo, A.hi, 3); },
    fmt: v => v.toFixed(2),
    paint(g, G, A, C) {
      const S = o.settings(), D = data();
      const { i0, i1, xI } = G;
      if (S.fill.on && S.bands.on) { g.fillStyle = S.fill.color; const ya = A.Y(S.bands.upper), yb = A.Y(S.bands.lower); g.fillRect(0, Math.min(ya, yb), G.pw, Math.abs(yb - ya)); }
      if (S.bands.on) {
        g.strokeStyle = S.bands.color; g.lineWidth = 1; g.setLineDash([4, 4]);
        g.beginPath();
        for (const v of [S.bands.upper, S.bands.lower, ...(S.bands.middleOn ? [S.bands.middle] : [])]) { const y = Math.round(A.Y(v)) + 0.5; g.moveTo(0, y); g.lineTo(G.pw, y); }
        g.stroke(); g.setLineDash([]);
      }
      const line = (series, colour, width) => {
        if (!series) return;
        g.strokeStyle = colour; g.lineWidth = width; g.lineJoin = 'round';
        g.beginPath();
        let pen = false;
        for (let i = Math.max(0, i0 - 1); i <= Math.min(i1 + 1, series.length - 1); i++) {
          const v = series[i];
          if (v == null) { pen = false; continue; }
          const x = xI(i), y = A.Y(v);
          if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
        }
        g.stroke();
      };
      if (S.maType === 'SMA + Bollinger Bands') { line(D.upper, S.bb.color, 1); line(D.lower, S.bb.color, 1); }
      if (S.ma.on && D.ma) line(D.ma, S.ma.color, S.ma.width);
      if (S.rsi.on) line(D.rsi, S.rsi.color, S.rsi.width);
    },
    tags(A) {
      const S = o.settings(), D = data(), k = core.limit();
      if (!S.labels || k < 0) return [];
      const out = [];
      if (S.rsi.on && D.rsi[k] != null) out.push({ p: D.rsi[k], bg: S.rsi.color, fg: inkOn(S.rsi.color) });
      if (S.ma.on && D.ma?.[k] != null) out.push({ p: D.ma[k], bg: S.ma.color, fg: inkOn(S.ma.color) });
      return out;
    },
    legend(i) {
      const S = o.settings(), D = data();
      const k = i ?? core.limit();
      const key = [k, D.rsi[k], D.ma?.[k], JSON.stringify(S)].join('|');
      if (legend.__key === key) return legend;
      legend.__key = key;
      const vals = S.values ? [el('b', { style: { color: S.rsi.color } }, f2(D.rsi[k])), S.ma.on && D.ma ? el('b', { style: { color: S.ma.color } }, f2(D.ma[k])) : null] : [];
      legend.replaceChildren(
        el('span', { class: 'tv-pname' }, `RSI ${S.length} ${S.source}${S.maType !== 'None' ? ` ${S.maType === 'SMA + Bollinger Bands' ? 'SMA' : S.maType.split(' ')[0]} ${S.maLength}` : ''}`),
        ...vals,
        el('span', { class: 'tv-pbtns' },
          el('button', { class: 'tv-pbtn rsi-settings', title: 'Settings', onClick: e => { e.stopPropagation(); openRsiSettings(o); } }, svgIcon('M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM12 3l1.6 2.3 2.7-.6.6 2.7L19.2 9 18.5 12l.7 3-2.3 1.6-.6 2.7-2.7-.6L12 21l-1.6-2.3-2.7.6-.6-2.7L4.8 15l.7-3-.7-3 2.3-1.6.6-2.7 2.7.6z', 14)),
          el('button', { class: 'tv-pbtn rsi-remove', title: 'Remove', onClick: e => { e.stopPropagation(); o.remove(); } }, '×')));
      return legend;
    },
    values: () => { const D = data(), k = core.limit(); return { rsi: D.rsi[k], ma: D.ma?.[k] ?? null, upper: D.upper?.[k] ?? null, lower: D.lower?.[k] ?? null }; },
    series: () => data(),
  };
}

/* ---------- its settings: Inputs, Style, Visibility ---------- */
const TFS = [[1, '1m'], [3, '3m'], [5, '5m'], [15, '15m'], [30, '30m'], [60, '1H'], [240, '4H'], [1440, 'D']];
let lastTab = 'inputs';
export function openRsiSettings(o) {
  closeMenus();
  document.querySelector('.tv-dialog-wrap')?.remove();
  const saved = structuredClone(o.settings());
  let draft = structuredClone(saved);
  let tab = lastTab;
  const body = el('div', { class: 'tv-dbody' }), nav = el('div', { class: 'tv-dnav tv-dnav-top' });
  const change = (fn, repaint = true) => { fn(draft); draft = rsiSettings(draft); o.preview(draft); if (repaint) paint(); };
  const row = (label, ...right) => el('div', { class: 'tv-drow' }, el('span', { class: 'tv-dlab' }, label), el('div', { class: 'tv-dctl' }, ...right));
  const check = (label, on, set, cls = '') => el('label', { class: 'tv-check ' + cls }, el('input', { type: 'checkbox', checked: !!on, onChange: e => change(d => set(d, e.target.checked)) }), el('i'), el('span', {}, label));
  const select = (opts, value, set, cls = '') => el('div', { class: 'tv-selwrap' }, el('select', { class: 'tv-select ' + cls, onChange: e => change(d => set(d, e.target.value)) },
    ...opts.map(([v, t]) => el('option', { value: String(v), selected: String(v) === String(value) }, t))));
  const num = (value, set, cls, step = 1, w = 100) => el('input', { type: 'number', class: 'tv-num ' + cls, value, step, style: { width: w + 'px' },
    onChange: e => { const n = +e.target.value; if (Number.isFinite(n) && e.target.value !== '') change(d => set(d, n)); } });
  const sw = (value, set, cls) => swatch(value, v => change(d => set(d, v), false), { cls });
  const width = (value, set, cls) => select([1, 2, 3, 4].map(n => [n, `${n}px`]), value, (d, v) => set(d, +v), cls);
  const pages = {
    inputs: () => [
      row('RSI Length', num(draft.length, (d, v) => { d.length = v; }, 'rsi-length')),
      row('Source', select(SOURCES, draft.source, (d, v) => { d.source = v; }, 'rsi-source')),
      el('div', { class: 'tv-dsec' }, 'Smoothing'),
      row('Type', select(MA_TYPES.map(m => [m, m]), draft.maType, (d, v) => { d.maType = v; }, 'rsi-matype')),
      draft.maType === 'None' ? null : row('Length', num(draft.maLength, (d, v) => { d.maLength = v; }, 'rsi-malength')),
      draft.maType === 'SMA + Bollinger Bands' ? row('BB StdDev', num(draft.bbMult, (d, v) => { d.bbMult = v; }, 'rsi-bb', 0.1)) : null,
    ],
    style: () => [
      row(check('RSI', draft.rsi.on, (d, v) => { d.rsi.on = v; }, 'rsi-s-rsi'), sw(draft.rsi.color, (d, v) => { d.rsi.color = v; }, 'rsi-c-rsi'), width(draft.rsi.width, (d, v) => { d.rsi.width = v; }, 'rsi-w-rsi')),
      row(check('RSI-based MA', draft.ma.on, (d, v) => { d.ma.on = v; }, 'rsi-s-ma'), sw(draft.ma.color, (d, v) => { d.ma.color = v; }, 'rsi-c-ma'), width(draft.ma.width, (d, v) => { d.ma.width = v; }, 'rsi-w-ma')),
      row(check('Upper and lower bands', draft.bands.on, (d, v) => { d.bands.on = v; }, 'rsi-s-bands'), sw(draft.bands.color, (d, v) => { d.bands.color = v; }, 'rsi-c-bands'),
        num(draft.bands.upper, (d, v) => { d.bands.upper = v; }, 'rsi-upper', 1, 70), num(draft.bands.lower, (d, v) => { d.bands.lower = v; }, 'rsi-lower', 1, 70)),
      row(check('Middle band', draft.bands.middleOn, (d, v) => { d.bands.middleOn = v; }, 'rsi-s-middle'), num(draft.bands.middle, (d, v) => { d.bands.middle = v; }, 'rsi-middle', 1, 70)),
      row(check('Background', draft.fill.on, (d, v) => { d.fill.on = v; }, 'rsi-s-fill'), sw(draft.fill.color, (d, v) => { d.fill.color = v; }, 'rsi-c-fill')),
      el('div', { class: 'tv-dsec' }, 'Outputs'),
      row(check('Labels on price scale', draft.labels, (d, v) => { d.labels = v; }, 'rsi-s-labels')),
      row(check('Values in status line', draft.values, (d, v) => { d.values = v; }, 'rsi-s-values')),
    ],
    visibility: () => {
      const hide = new Set(draft.hideOn);
      return [el('p', { class: 'tv-note' }, 'Show the RSI on these timeframes.'),
        el('div', { class: 'tv-vis' }, ...TFS.map(([m, label]) => check(label, !hide.has(m), (d, v) => { const h = new Set(d.hideOn); if (v) h.delete(m); else h.add(m); d.hideOn = [...h].sort((a, b) => a - b); }, 'rsi-v-' + label)))];
    },
  };
  function paint() {
    nav.replaceChildren(...[['inputs', 'Inputs'], ['style', 'Style'], ['visibility', 'Visibility']].map(([k, t]) =>
      el('button', { type: 'button', class: 'tv-dtab' + (k === tab ? ' is-on' : ''), 'data-tab': k, onClick: () => { tab = lastTab = k; closeColour(); paint(); } }, el('span', {}, t))));
    body.replaceChildren(...pages[tab]().filter(Boolean));
  }
  const close = keep => {
    closeColour(); document.removeEventListener('keydown', onKey, true); wrap.remove();
    if (keep) o.save(draft); else o.preview(null);
  };
  const defaults = () => { draft = structuredClone(RSI_DEFAULTS); o.preview(draft); paint(); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } };
  const dlg = el('div', { class: 'tv-ui tv-dialog tv-ddialog rsi-dialog', role: 'dialog', 'aria-label': 'RSI settings' },
    el('div', { class: 'tv-dhead' }, el('span', {}, 'RSI'), el('button', { type: 'button', class: 'tv-x', title: 'Close', onClick: () => close(false) }, '×')),
    nav, body,
    el('div', { class: 'tv-dfoot' },
      el('button', { type: 'button', class: 'tv-btn rsi-defaults', onClick: defaults }, 'Defaults'),
      el('div', { class: 'spacer' }),
      el('button', { type: 'button', class: 'tv-btn tv-cancel', onClick: () => close(false) }, 'Cancel'),
      el('button', { type: 'button', class: 'tv-btn is-primary tv-ok', onClick: () => close(true) }, 'Ok')));
  const wrap = el('div', { class: 'tv-dialog-wrap is-clear', onPointerdown: e => { if (e.target === wrap) close(false); } }, dlg);
  document.addEventListener('keydown', onKey, true);
  document.body.append(wrap);
  paint();
  return dlg;
}

/* ---------- one set of RSI settings for the whole app, in the vault (data/drawings.json → rsi) ---------- */
let previewS = null;
const subs = new Set();
const tell = () => { for (const fn of [...subs]) { try { fn(); } catch { /* a chart that went away */ } } };
export const rsiOf = store => previewS || rsiSettings(store?.data?.drawings?.rsi);
export function onRsi(fn) { subs.add(fn); return () => subs.delete(fn); }
export function previewRsi(d) { previewS = d ? rsiSettings(d) : null; tell(); }
export async function saveRsi(store, d) {
  store.data.drawings.rsi = rsiSettings(d);
  previewS = null;
  await store.save('drawings');
  tell();
}
/** The RSI pane for a chart, with its settings kept app-wide. `remove` takes it off this chart. */
export function rsiFor(store, core, { tf, remove, plot }) {
  const pane = rsiPane(core, { settings: () => rsiOf(store), save: d => saveRsi(store, d), preview: d => previewRsi(d), remove, tf });
  const off = onRsi(() => { if (plot && !plot.isConnected && plot.__seen) { off(); return; } if (plot) plot.__seen = true; core.draw(); });
  return pane;
}
