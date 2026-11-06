/* ============================================================
   chart/threesl.js — 3SL, Minato's own TradingView indicator (his Pine
   script, 5 Nov), drawn by the app on the trade chart and in Replay.

   Session boxes: 07:00–09:00, 14:00–16:00 and 21:00–23:00 Perth time
   (ASIA, LONDON, NEW YORK), each a box from the session's first candle to
   the end of its last, as tall as the session's high and low — growing
   candle by candle while it is still going, as the script's box.new /
   box.set_top / box.set_bottom do. The name sits on the box's top right
   corner, just above it. A candle is in a session when it opens in it, the
   way Pine's time(timeframe.period, session) reads it; nothing on the daily.

   Chart info: the script's table — Layout 1 the date and "XAUUSD | 15M",
   Layout 2 the ticker, "15 Minutes" and "Thu, 05 Nov 2026" — in any of nine
   places, today's date in Perth (timenow).

   The script's inputs are its settings here, kept once for the whole app
   (data/drawings.json → tsl) as the RSI's are. Two things are the app's own:
   the boxes sit behind the candles, so the script's 0% fill colours the
   session without hiding a candle; and the chart info, whose 70%-clear black
   would vanish on a dark chart, takes the chart's own writing, faint, until
   a colour is picked for it.
   ============================================================ */
import { el } from '../ui.js';
import { swatch, closeColour } from './colour.js';
import { closeMenus } from './menu.js';
import { svgIcon, withAlpha } from './core.js';

export const TSL_DEFAULTS = Object.freeze({
  boxes: true,
  sessions: [
    { from: '07:00', to: '09:00', name: 'ASIA', color: '#5A3E85' },
    { from: '14:00', to: '16:00', name: 'LONDON', color: '#5A3E85' },
    { from: '21:00', to: '23:00', name: 'NEW YORK', color: '#5A3E85' },
  ],
  fillT: 0, borderT: 0, borderW: 1,
  names: true, nameColor: '#FFFFFF', nameSize: 'Small', nameBold: false, nameItalic: false,
  info: true, layout: 'Layout 1', position: 'Bottom Middle',
  infoColor: '', infoSize: 14, infoBold: false, infoItalic: false, infoBg: 'rgba(255, 255, 255, 0)',
});
export const SIZES = [['Tiny', 9], ['Small', 11], ['Normal', 13], ['Large', 16], ['Huge', 20]];
export const LAYOUTS = ['Layout 1', 'Layout 2'];
export const POSITIONS = ['Top Left', 'Top Middle', 'Top Right', 'Middle Left', 'Center', 'Middle Right', 'Bottom Left', 'Bottom Middle', 'Bottom Right'];

/* Perth has no daylight saving: always UTC+8, as the script's "Australia/Perth" */
const PERTH = 8 * 3600;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const clampN = (v, a, b, d) => (Number.isFinite(+v) ? Math.max(a, Math.min(b, Math.round(+v))) : d);

/** Settings, cleaned: anything missing or odd takes the script's default. */
export function tslSettings(raw) {
  const D = TSL_DEFAULTS, r = raw && typeof raw === 'object' ? raw : {};
  const pick = (k, ok) => (k in r && ok(r[k]) ? r[k] : D[k]);
  const bool = v => typeof v === 'boolean', str = v => typeof v === 'string';
  const sess = D.sessions.map((d, i) => {
    const s = Array.isArray(r.sessions) && r.sessions[i] && typeof r.sessions[i] === 'object' ? r.sessions[i] : {};
    return { from: HHMM.test(s.from) ? s.from : d.from, to: HHMM.test(s.to) ? s.to : d.to,
      name: str(s.name) ? s.name.slice(0, 24) : d.name, color: str(s.color) && s.color ? s.color : d.color };
  });
  return {
    boxes: pick('boxes', bool), sessions: sess,
    fillT: clampN(r.fillT, 0, 100, D.fillT), borderT: clampN(r.borderT, 0, 100, D.borderT), borderW: clampN(r.borderW, 0, 5, D.borderW),
    names: pick('names', bool), nameColor: pick('nameColor', v => str(v) && v), nameSize: pick('nameSize', v => SIZES.some(([k]) => k === v)),
    nameBold: pick('nameBold', bool), nameItalic: pick('nameItalic', bool),
    info: pick('info', bool), layout: pick('layout', v => LAYOUTS.includes(v)), position: pick('position', v => POSITIONS.includes(v)),
    infoColor: pick('infoColor', str), infoSize: clampN(r.infoSize, 6, 60, D.infoSize),
    infoBold: pick('infoBold', bool), infoItalic: pick('infoItalic', bool), infoBg: pick('infoBg', v => str(v) && v),
  };
}

/* ---------- the boxes ---------- */
const minutesOf = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const perthMinute = T => Math.floor((((T + PERTH) % 86400) + 86400) % 86400 / 60);
const inSession = (m, a, z) => (a <= z ? m >= a && m < z : m >= a || m < z);

/**
 * The session boxes over candles `i0`…`i1` (each [t, o, h, l, c]), nothing past
 * `last` (a replay's present): [{ k, name, color, t0, t1, hi, lo, live }].
 * A box opens on the first candle in its session after one that was not, and
 * takes in each one after it that is.
 */
export function sessionBoxes(S, bars, tf, i0, i1, last = bars.length - 1) {
  if (!S.boxes || !bars.length || tf >= 1440) return [];
  const spans = S.sessions.map(s => [minutesOf(s.from), minutesOf(s.to)]);
  /* start a day back, so a session that began off the left edge is whole */
  const from = Math.max(0, i0 - Math.ceil(1440 / tf) - 1), to = Math.min(last, i1, bars.length - 1);
  const open = [], out = [];
  for (let i = from; i <= to; i++) {
    const b = bars[i], m = perthMinute(b[0]);
    spans.forEach(([a, z], k) => {
      if (!inSession(m, a, z)) return;
      const cur = open[k];
      if (cur && cur.lastI === i - 1) { cur.hi = Math.max(cur.hi, b[2]); cur.lo = Math.min(cur.lo, b[3]); cur.t1 = b[0] + tf * 60; cur.lastI = i; }
      else { open[k] = { k, name: S.sessions[k].name, color: S.sessions[k].color, t0: b[0], t1: b[0] + tf * 60, hi: b[2], lo: b[3], lastI: i }; out.push(open[k]); }
    });
  }
  for (const B of out) B.live = B.lastI === last && inSession(perthMinute(B.t1), ...spans[B.k]);
  return out;
}

/** The boxes, behind the candles. */
export function paintTslBack(g, G, S, bars, tf) {
  const boxes = sessionBoxes(S, bars, tf, G.i0, G.i1, G.last);
  for (const B of boxes) {
    const xa = G.xT(B.t0), xz = G.xT(B.t1);
    if (xz < 0 || xa > G.pw) continue;
    const ya = G.Y(B.hi), yz = G.Y(B.lo);
    if (S.fillT < 100) { g.fillStyle = withAlpha(B.color, 1 - S.fillT / 100); g.fillRect(xa, ya, xz - xa, yz - ya); }
    if (S.borderW > 0 && S.borderT < 100) {
      g.strokeStyle = withAlpha(B.color, 1 - S.borderT / 100); g.lineWidth = S.borderW;
      const o = S.borderW % 2 ? 0.5 : 0;
      g.strokeRect(Math.round(xa) + o, Math.round(ya) + o, Math.round(xz - xa), Math.round(yz - ya));
    }
  }
  return boxes;
}

/* ---------- the names and the chart info, over everything ---------- */
const fontOf = (px, bold, italic, family) => `${italic ? 'italic ' : ''}${bold ? 700 : 400} ${px}px ${family}`;
const pad = n => String(n).padStart(2, '0');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The script's two timeframe spellings: 15M / 1H / 1D, and 15 Minutes / 1 Hour / 1 Day. */
export function tfShort(tf) { return tf >= 1440 ? `${Math.round(tf / 1440)}D` : tf % 60 === 0 ? `${tf / 60}H` : `${tf}M`; }
export function tfLong(tf) {
  const [n, u] = tf >= 1440 ? [Math.round(tf / 1440), 'Day'] : tf % 60 === 0 ? [tf / 60, 'Hour'] : [tf, 'Minute'];
  return `${n} ${u}${n === 1 ? '' : 's'}`;
}
/** Its lines, as the table's cells: today in Perth, the ticker, the timeframe. */
export function infoLines(S, ticker, tf, now = Date.now()) {
  const d = new Date(now + PERTH * 1000);
  const [day, mon, yr] = [d.getUTCDate(), d.getUTCMonth(), d.getUTCFullYear()];
  return S.layout === 'Layout 2'
    ? [ticker, tfLong(tf), `${DAYS[d.getUTCDay()]}, ${pad(day)} ${MONS[mon]} ${yr}`]
    : [`${pad(day)}/${pad(mon + 1)}/${yr}`, `${ticker} | ${tfShort(tf)}`];
}
export function paintTslFront(g, G, C, S, { bars, tf, ticker, boxes = null }) {
  const family = C.font || 'sans-serif';
  if (S.names && S.boxes) {
    const px = (SIZES.find(([k]) => k === S.nameSize) || SIZES[1])[1];
    g.font = fontOf(px, S.nameBold, S.nameItalic, family);
    g.fillStyle = S.nameColor; g.textAlign = 'right'; g.textBaseline = 'bottom';
    for (const B of boxes || sessionBoxes(S, bars, tf, G.i0, G.i1, G.last)) {
      const w = g.measureText(B.name).width, xa = G.xT(B.t0), xz = G.xT(B.t1), y = G.Y(B.hi) - 2;
      if (xz < 0 || xa > G.pw) continue;
      /* on the box's top right corner — kept on the chart when the box runs off its right edge */
      g.fillText(B.name, Math.max(Math.min(xz, G.pw - 4), Math.min(xa + w, G.pw - 4)), y);
    }
  }
  if (S.info) {
    const lines = infoLines(S, ticker, tf);
    const px = S.infoSize, lh = Math.round(px * 1.3), m = 12;
    g.font = fontOf(px, S.infoBold, S.infoItalic, family);
    const w = Math.max(...lines.map(s => g.measureText(s).width)), h = lh * lines.length;
    const P = S.position;
    const left = /Left/.test(P), right = /Right/.test(P), top = /^Top/.test(P), bottom = /^Bottom/.test(P);
    const x = left ? m : right ? G.pw - m - w : (G.pw - w) / 2;
    const y = top ? m + 26 : bottom ? G.ph - m - h : (G.ph - h) / 2;   // the top keeps clear of the status line
    const bgA = (String(S.infoBg).match(/rgba\([^)]*,\s*([\d.]+)\)$/) || [])[1];
    if (bgA == null || +bgA > 0) { g.fillStyle = S.infoBg; g.fillRect(x - 6, y - 4, w + 12, h + 8); }
    g.fillStyle = S.infoColor || withAlpha(C.ink, 0.3);
    g.textBaseline = 'top';
    g.textAlign = left ? 'left' : right ? 'right' : 'center';
    const ax = left ? x : right ? x + w : x + w / 2;
    lines.forEach((s, i) => g.fillText(s, ax, y + i * lh + (lh - px) / 2));
  }
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
}

/* ---------- its name on the chart, under the instrument's: settings and remove ---------- */
export function tslLegend(plot, { open, remove }) {
  const gear = 'M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM12 3l1.6 2.3 2.7-.6.6 2.7L19.2 9 18.5 12l.7 3-2.3 1.6-.6 2.7-2.7-.6L12 21l-1.6-2.3-2.7.6-.6-2.7L4.8 15l.7-3-.7-3 2.3-1.6.6-2.7 2.7.6z';
  const node = el('div', { class: 'tv-olegend tsl-legend', hidden: true, onDblclick: e => { e.stopPropagation(); open(); } },
    el('span', { class: 'tv-pname' }, '3SL'),
    el('span', { class: 'tv-pbtns' },
      el('button', { class: 'tv-pbtn tsl-settings', title: 'Settings', onClick: e => { e.stopPropagation(); open(); } }, svgIcon(gear, 14)),
      el('button', { class: 'tv-pbtn tsl-remove', title: 'Remove', onClick: e => { e.stopPropagation(); remove(); } }, '×')));
  plot.append(node);
  return {
    node,
    /** shown or not, just under the status line (or at the top, where there is none) */
    place(on) {
      node.hidden = !on;
      if (!on) return;
      const st = plot.querySelector(':scope > .tv-status');
      const top = st && !st.hidden && st.offsetHeight ? st.offsetTop + st.offsetHeight + 4 : 6;
      if (node.__top !== top) { node.__top = top; node.style.top = top + 'px'; }
    },
  };
}

/* ---------- its settings: Inputs, Style, Chart info ---------- */
let lastTab = 'inputs';
export function openTslSettings(store) {
  closeMenus();
  document.querySelector('.tv-dialog-wrap')?.remove();
  let draft = structuredClone(tslOf(store));
  let tab = lastTab;
  const body = el('div', { class: 'tv-dbody' }), nav = el('div', { class: 'tv-dnav tv-dnav-top' });
  const change = (fn, repaint = true) => { fn(draft); draft = tslSettings(draft); previewTsl(draft); if (repaint) paint(); };
  const row = (label, ...right) => el('div', { class: 'tv-drow' }, el('span', { class: 'tv-dlab' }, label), el('div', { class: 'tv-dctl' }, ...right));
  const check = (label, on, set, cls = '') => el('label', { class: 'tv-check ' + cls }, el('input', { type: 'checkbox', checked: !!on, onChange: e => change(d => set(d, e.target.checked)) }), el('i'), el('span', {}, label));
  const select = (opts, value, set, cls = '') => el('div', { class: 'tv-selwrap' }, el('select', { class: 'tv-select ' + cls, onChange: e => change(d => set(d, e.target.value)) },
    ...opts.map(v => el('option', { value: String(v), selected: String(v) === String(value) }, String(v)))));
  const num = (value, set, cls, min, max, w = 84) => el('input', { type: 'number', class: 'tv-num ' + cls, value, min, max, step: 1, style: { width: w + 'px' },
    onChange: e => { if (e.target.value !== '') change(d => set(d, +e.target.value)); } });
  const text = (value, set, cls, w = 140) => el('input', { type: 'text', class: 'tv-num ' + cls, value, maxLength: 24, style: { width: w + 'px' },
    onChange: e => change(d => set(d, e.target.value), false) });
  const time = (value, set, cls) => el('input', { type: 'time', class: 'tv-num ' + cls, value, style: { width: '104px' },
    onChange: e => { if (HHMM.test(e.target.value)) change(d => set(d, e.target.value), false); } });
  const sw = (value, set, cls) => swatch(value, v => change(d => set(d, v), false), { cls });
  const pages = {
    inputs: () => [
      el('div', { class: 'tv-dsec' }, 'Sessions (Perth time)'),
      ...draft.sessions.map((s, i) => row(`Session ${i + 1}`,
        time(s.from, (d, v) => { d.sessions[i].from = v; }, `tsl-from-${i}`), el('span', { class: 'tv-dash' }, '–'),
        time(s.to, (d, v) => { d.sessions[i].to = v; }, `tsl-to-${i}`),
        text(s.name, (d, v) => { d.sessions[i].name = v; }, `tsl-name-${i}`, 116),
        sw(s.color, (d, v) => { d.sessions[i].color = v; }, `tsl-c-${i}`))),
    ],
    style: () => [
      el('div', { class: 'tv-dsec' }, 'Session boxes'),
      row(check('Show session boxes', draft.boxes, (d, v) => { d.boxes = v; }, 'tsl-s-boxes')),
      row('Fill transparency (%)', num(draft.fillT, (d, v) => { d.fillT = v; }, 'tsl-fill', 0, 100)),
      row('Border transparency (%)', num(draft.borderT, (d, v) => { d.borderT = v; }, 'tsl-border', 0, 100)),
      row('Border width', num(draft.borderW, (d, v) => { d.borderW = v; }, 'tsl-bw', 0, 5)),
      el('div', { class: 'tv-dsec' }, 'Session names'),
      row(check('Show session names', draft.names, (d, v) => { d.names = v; }, 'tsl-s-names'), sw(draft.nameColor, (d, v) => { d.nameColor = v; }, 'tsl-c-name')),
      row('Text size', select(SIZES.map(([k]) => k), draft.nameSize, (d, v) => { d.nameSize = v; }, 'tsl-nsize')),
      row(check('Bold', draft.nameBold, (d, v) => { d.nameBold = v; }, 'tsl-nbold'), check('Italic', draft.nameItalic, (d, v) => { d.nameItalic = v; }, 'tsl-nital')),
    ],
    info: () => [
      row(check('Show chart info', draft.info, (d, v) => { d.info = v; }, 'tsl-s-info')),
      row('Layout', select(LAYOUTS, draft.layout, (d, v) => { d.layout = v; }, 'tsl-layout')),
      row('Position', select(POSITIONS, draft.position, (d, v) => { d.position = v; }, 'tsl-pos')),
      el('div', { class: 'tv-dsec' }, 'Text'),
      row('Text colour', sw(draft.infoColor || 'rgba(128, 128, 128, 0.3)', (d, v) => { d.infoColor = v; }, 'tsl-c-info'),
        draft.infoColor ? el('button', { type: 'button', class: 'tv-btn tsl-info-auto', onClick: () => change(d => { d.infoColor = ''; }) }, 'Match the chart') : el('span', { class: 'tv-note' }, 'the chart’s own, faint')),
      row('Text size', num(draft.infoSize, (d, v) => { d.infoSize = v; }, 'tsl-isize', 6, 60)),
      row(check('Bold', draft.infoBold, (d, v) => { d.infoBold = v; }, 'tsl-ibold'), check('Italic', draft.infoItalic, (d, v) => { d.infoItalic = v; }, 'tsl-iital')),
      row('Background', sw(draft.infoBg, (d, v) => { d.infoBg = v; }, 'tsl-c-bg')),
    ],
  };
  function paint() {
    nav.replaceChildren(...[['inputs', 'Inputs'], ['style', 'Style'], ['info', 'Chart info']].map(([k, t]) =>
      el('button', { type: 'button', class: 'tv-dtab' + (k === tab ? ' is-on' : ''), 'data-tab': k, onClick: () => { tab = lastTab = k; closeColour(); paint(); } }, el('span', {}, t))));
    body.replaceChildren(...pages[tab]().filter(Boolean));
  }
  const close = keep => {
    closeColour(); document.removeEventListener('keydown', onKey, true); wrap.remove();
    if (keep) saveTsl(store, draft); else previewTsl(null);
  };
  const defaults = () => { draft = structuredClone(TSL_DEFAULTS); previewTsl(draft); paint(); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } };
  const dlg = el('div', { class: 'tv-ui tv-dialog tv-ddialog tsl-dialog', role: 'dialog', 'aria-label': '3SL settings' },
    el('div', { class: 'tv-dhead' }, el('span', {}, '3SL'), el('button', { type: 'button', class: 'tv-x', title: 'Close', onClick: () => close(false) }, '×')),
    nav, body,
    el('div', { class: 'tv-dfoot' },
      el('button', { type: 'button', class: 'tv-btn tsl-defaults', onClick: defaults }, 'Defaults'),
      el('div', { class: 'spacer' }),
      el('button', { type: 'button', class: 'tv-btn tv-cancel', onClick: () => close(false) }, 'Cancel'),
      el('button', { type: 'button', class: 'tv-btn is-primary tv-ok', onClick: () => close(true) }, 'Ok')));
  const wrap = el('div', { class: 'tv-dialog-wrap is-clear', onPointerdown: e => { if (e.target === wrap) close(false); } }, dlg);
  document.addEventListener('keydown', onKey, true);
  document.body.append(wrap);
  paint();
  return dlg;
}

/* ---------- one set of settings for the whole app, in the vault (data/drawings.json → tsl) ---------- */
let previewS = null;
const subs = new Set();
const tell = () => { for (const fn of [...subs]) { try { fn(); } catch { /* a chart that went away */ } } };
export const tslOf = store => previewS || tslSettings(store?.data?.drawings?.tsl);
export function previewTsl(d) { previewS = d ? tslSettings(d) : null; tell(); }
export async function saveTsl(store, d) {
  if (!store.data.drawings || typeof store.data.drawings !== 'object') store.data.drawings = {};
  store.data.drawings.tsl = tslSettings(d);
  previewS = null;
  await store.save('drawings');
  tell();
}
/** Redraw a chart when the settings change, for as long as its plot is on the page. */
export function onTsl(plot, redraw) {
  const fn = () => { if (!plot.isConnected && plot.__tslSeen) { subs.delete(fn); return; } if (plot.isConnected) plot.__tslSeen = true; redraw(); };
  subs.add(fn);
  return () => subs.delete(fn);
}
