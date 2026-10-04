/* ============================================================
   chart/drawings.js — TradingView's drawing tools, and only these:
   Trend line, Rectangle, Callout, Long position, Short position.

   A drawing is kept by time and price, so it sits on the same candles on
   every timeframe:
     { id, type, pts: [{t, p}, {t, p}], style, text, hideOn: [minutes],
       locked, at }            + tp, sl, inputs for a position
   Drawings live where the old lines lived — data/drawings.json → lines,
   per instrument and per place — and a line from before (t1, t2, p,
   label) reads as a dotted trend line with its label above it.

   How it is used, TradingView's way:
   • the tools down the left; a tool draws once and puts itself away;
   • click–click, or press–drag–let go; Shift keeps a trend line flat;
   • soft magnet: near a candle's open, high, low or close the point
     snaps to it, otherwise it stays where you put it;
   • click a drawing: it is selected — handles, and the floating toolbar;
     drag it, or a handle; Delete removes it; Esc lets go;
   • double-click: its settings (Style, Text, Coordinates, Visibility);
   • right-click a tool on the left: add it to (or take it off) the
     favourites, a small bar you can drag anywhere on the chart.
   ============================================================ */
import { el, toast } from '../ui.js';
import { openMenu } from './menu.js';
import { swatch, closeColour } from './colour.js';
import { svgIcon, roundRect, withAlpha, inkOn } from './core.js';
import { openDrawingSettings, WIDTHS } from './drawdialog.js';

/* ---------- the tools ---------- */
export const ICONS = {
  cursor: 'M12 5v14M5 12h14',
  trend: 'M6.6 17.4L17.4 6.6M3.5 19a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M17.5 5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  rect: 'M5.5 7h13v10h-13zM4 7a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M17 17a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  callout: 'M4.5 5.5h15v9h-8l-4.5 4v-4h-2.5zM8 9h8M8 11.5h5',
  long: 'M5 4.5h14v15H5zM5 12h14M9 9l3-2.5 3 2.5',
  short: 'M5 4.5h14v15H5zM5 12h14M9 15l3 2.5 3-2.5',
  magnet: 'M7 4.5v7a5 5 0 0 0 10 0v-7M7 8.5h3.2M13.8 8.5H17M10.2 4.5v7a1.8 1.8 0 0 0 3.6 0v-7',
  eye: 'M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  eyeOff: 'M2.5 12s3.5-6 9.5-6c1.6 0 3 .4 4.2 1M21.5 12s-3.5 6-9.5 6c-1.6 0-3-.4-4.2-1M4 20L20 4',
  trash: 'M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13',
  lock: 'M7.5 11V8.5a4.5 4.5 0 0 1 9 0V11M6 11h12v9H6z',
  unlock: 'M7.5 11V8.5a4.5 4.5 0 0 1 8.7-1.6M6 11h12v9H6z',
  star: 'M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.5l-4.8 2.6.9-5.4L4.2 9.9l5.4-.8z',
  gear: 'M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM12 3l1.6 2.3 2.7-.6.6 2.7L19.2 9 18.5 12l.7 3-2.3 1.6-.6 2.7-2.7-.6L12 21l-1.6-2.3-2.7.6-.6-2.7L4.8 15l.7-3-.7-3 2.3-1.6.6-2.7 2.7.6z',
  template: 'M5 5h5.5v5.5H5zM13.5 5H19v5.5h-5.5zM5 13.5h5.5V19H5zM13.5 13.5H19V19h-5.5z',
  text: 'M6 6.5h12M12 6.5V19M9.5 19h5',
  grip: 'M9.5 6h.01M14.5 6h.01M9.5 12h.01M14.5 12h.01M9.5 18h.01M14.5 18h.01',
};
export const TOOLS = [
  ['trend', 'Trend line'], ['rect', 'Rectangle'], ['callout', 'Callout'],
  ['long', 'Long position'], ['short', 'Short position'],
];
export const toolName = type => TOOLS.find(([k]) => k === type)?.[1] || type;
const TFS = [1, 3, 5, 15, 30, 60, 240, 1440];

/* ---------- what a new drawing looks like ---------- */
const TEXT = (colour, more = {}) => ({ value: '', color: colour, size: 12, bold: false, italic: false, v: 'top', h: 'center', ...more });
export function defaultsOf(type) {
  switch (type) {
    case 'trend': return { style: { color: '#2962FF', width: 2, dash: 'solid', extL: false, extR: false, middle: false, labels: false }, text: TEXT('#2962FF') };
    case 'rect': return { style: { color: '#9C27B0', width: 1, dash: 'solid', fill: 'rgba(156, 39, 176, 0.2)', extL: false, extR: false, middle: false }, text: TEXT('#9C27B0', { v: 'top', h: 'left' }) };
    case 'callout': return { style: { color: '#2962FF', width: 1, dash: 'solid', fill: 'rgba(41, 98, 255, 0.85)' }, text: TEXT('#FFFFFF', { value: 'Text', v: 'middle', h: 'left' }) };
    case 'long':
    /* 'auto': the zones and labels take the candles' colours, the text whatever reads on them */
    case 'short': return { style: { profit: 'auto', stop: 'auto', line: '#787878', lineWidth: 1, textColor: 'auto', size: 11, always: false }, text: TEXT('#FFFFFF') };
    default: return { style: {}, text: TEXT('#FFFFFF') };
  }
}
const LEGACY_GREY = '#B4BAB8';

/** A drawing as stored → the shape this file works with. Lines from the old Line tool become dotted trend lines. */
export function normalize(raw) {
  if (!raw) return null;
  if (!raw.type) {
    const d = defaultsOf('trend');
    return { id: raw.id, type: 'trend', legacy: true, pts: [{ t: raw.t1, p: raw.p }, { t: raw.t2, p: raw.p }],
      style: { ...d.style, color: LEGACY_GREY, width: 1, dash: 'dotted' },
      text: { ...d.text, value: raw.label || '', color: LEGACY_GREY, size: 11 }, hideOn: [], locked: false, at: raw.at };
  }
  const d = defaultsOf(raw.type);
  const style = { ...d.style, ...(raw.style || {}) };
  if (raw.type === 'long' || raw.type === 'short') {
    /* the old fixed defaults become the candles' colours */
    if (style.profit === 'rgba(8, 153, 129, 0.2)') style.profit = 'auto';
    if (style.stop === 'rgba(242, 54, 69, 0.2)') style.stop = 'auto';
    if (style.textColor === '#FFFFFF') style.textColor = 'auto';
  }
  return { ...raw, style, text: { ...d.text, ...(raw.text || {}) },
    hideOn: Array.isArray(raw.hideOn) ? raw.hideOn : [], locked: !!raw.locked };
}
/** What Ctrl+C took: shared by every chart, so a drawing can be pasted on another one. */
let clip = null;
const serialize = d => { const { legacy, ...rest } = d; return structuredClone(rest); };

/* ---------- the position tool's numbers ---------- */
/**
 * How big a position the risk buys, and what it makes or loses, the OANDA way:
 * units — gold in ounces, NAS100 in $1 a point, FX in the base currency.
 * Amounts are in USD when the quote is USD (or the base is, through the
 * entry price); otherwise in the quote currency, which is said.
 */
export function positionNumbers(inst, d) {
  const entry = d.pts[0].p, long = d.type === 'long';
  const { account = 100000, risk = 1, riskMode = '%' } = d.inputs || {};
  const [base, quote] = String(inst || '').split('_');
  const toUSD = quote === 'USD' ? 1 : base === 'USD' ? 1 / entry : 1;
  const cur = quote === 'USD' || base === 'USD' ? 'USD' : quote || '';
  const riskAmt = riskMode === '$' ? risk : account * risk / 100;
  const stopDist = Math.abs(entry - d.sl), targetDist = Math.abs(d.tp - entry);
  const qty = stopDist > 0 ? riskAmt / (stopDist * toUSD) : 0;
  return { long, entry, qty, cur, riskAmt, toUSD,
    stopDist, targetDist, stopAmt: qty * stopDist * toUSD, targetAmt: qty * targetDist * toUSD,
    rr: stopDist > 0 ? targetDist / stopDist : 0,
    pnl: p => (long ? p - entry : entry - p) * qty * toUSD };
}
/**
 * What the price did inside the position's time, on the one-minute prices:
 * the first touch of the stop or the target (both in one candle → the stop),
 * or where it is at the end / at `until`.
 */
export function positionOutcome(rows, d, until = Infinity) {
  const t1 = d.pts[0].t, t2 = Math.min(d.pts[1].t, until), long = d.type === 'long';
  let last = null;
  for (const r of rows) {
    if (r[0] < t1) continue;
    if (r[0] > t2) break;
    const [t, , h, l, c] = r;
    if (long ? l <= d.sl : h >= d.sl) return { state: 'stop', t, p: d.sl };
    if (long ? h >= d.tp : l <= d.tp) return { state: 'target', t, p: d.tp };
    last = { state: 'open', t, p: c };
  }
  return last;
}

/* ============================================================
   The controller: one per chart
   ============================================================ */
/**
 * @param core   the chart (chart/core.js)
 * @param plot   its element
 * @param o      { store, dkey, inst, dp, tf(), rows(), replayT(), hideFuture (default true), account() }
 */
export function createDrawings(core, plot, o) {
  const store = o.store;
  const tools = () => {
    const d = store.data.drawings;
    if (!d.tools || typeof d.tools !== 'object') d.tools = {};
    const t = d.tools;
    if (!Array.isArray(t.favourites)) t.favourites = [];
    if (!t.last || typeof t.last !== 'object') t.last = {};
    return t;
  };
  const saveTools = () => store.save('drawings').catch(() => {});
  let tool = null, sel = null, hot = null, hidden = false, pending = null, live = null;
  const shapes = new Map();                 // id → what was painted: hit tests and handles
  const memo = new WeakMap();
  const list = () => store.drawingsFor(o.dkey).map(r => { let n = memo.get(r); if (!n) { n = normalize(r); memo.set(r, n); } return n; });
  const byId = id => (live && live.id === id ? live : list().find(d => d.id === id));
  const tick = 10 ** -o.dp;

  /* ---------- undo / redo (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z): every change, as it was before and after ---------- */
  const undos = [], redos = [];
  const stored = id => { const r = store.drawingsFor(o.dkey).find(x => x.id === id); return r ? structuredClone(r) : null; };
  function record(ops) { if (!ops.length) return; undos.push(ops); if (undos.length > 100) undos.shift(); redos.length = 0; }
  async function apply(ops, way) {
    for (const op of way === 'undo' ? [...ops].reverse() : ops) {
      const x = way === 'undo' ? op.before : op.after;
      if (x) await store.putDrawing(o.dkey, structuredClone(x)); else { await store.dropDrawing(o.dkey, op.id); if (sel === op.id) select(null); }
    }
    core.draw(); paintFtb();
  }
  async function undo() { const ops = undos.pop(); if (!ops) return false; redos.push(ops); await apply(ops, 'undo'); return true; }
  async function redo() { const ops = redos.pop(); if (!ops) return false; undos.push(ops); await apply(ops, 'redo'); return true; }

  async function save(d) {
    const after = serialize(d), before = stored(d.id);
    try { await store.putDrawing(o.dkey, after); record([{ id: d.id, before, after: structuredClone(after) }]); } catch (e) { toast('Could not save the drawing: ' + (e.message || e), 'bad'); }
    core.draw();
  }
  async function drop(id) {
    const before = stored(id);
    await store.dropDrawing(o.dkey, id);
    if (before) record([{ id, before, after: null }]);
    if (sel === id) select(null);
    core.draw();
  }
  async function dropAll() {
    const all = store.drawingsFor(o.dkey).map(r => structuredClone(r));
    for (const d of all) await store.dropDrawing(o.dkey, d.id);
    record(all.map(d => ({ id: d.id, before: d, after: null })));
    select(null); core.draw(); toast('Drawings removed');
  }
  /* ---------- copy and paste (Ctrl+C, Ctrl+V): a copy in the same place, selected ---------- */
  function copy() { const d = sel && byId(sel); if (!d) return false; clip = serialize(d); return true; }
  async function paste() {
    if (!clip) return false;
    const d = { ...structuredClone(clip), id: 'dr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), locked: false };
    await save(d);
    select(d.id);
    return true;
  }
  /** Change a drawing; the style it ends up with is what the next one of its kind starts from. */
  async function update(d, patch = {}) {
    const next = { ...d, ...patch, style: { ...d.style, ...(patch.style || {}) }, text: { ...d.text, ...(patch.text || {}) } };
    delete next.legacy;
    if (patch.style || patch.text) { tools().last[d.type] = { style: next.style, text: { ...next.text, value: '' } }; saveTools(); }
    await save(next);
    paintFtb();
    return next;
  }

  /* ---------- time and price ↔ the screen ---------- */
  const X = (t, G) => G.xT(t) + G.spacing / 2;
  const pointAt = (x, y, G, magnet = tools().magnet) => {
    const i = Math.round(G.iX(x) - 0.5);
    const t = core.timeAtIdx(i);
    let p = G.P(y);
    const bars = core.bars;
    if (magnet && i >= 0 && i < bars.length) {
      /* weak: only within 10px of the open, high, low or close; strong: always the nearest of them */
      let best = tools().magnetMode === 'strong' ? Infinity : 10;
      for (const v of bars[i].slice(1)) { const dd = Math.abs(G.Y(v) - y); if (dd < best) { best = dd; p = v; } }
    }
    return { t, p: +p.toFixed(o.dp + 2) };
  };
  const shiftT = (t, bars) => core.timeAtIdx(Math.round(core.idxAt(t)) + bars);

  /* ---------- the left toolbar ---------- */
  const bar = el('div', { class: 'tv-left' });
  const btn = (key, title, onClick, extra = {}) => el('button', { type: 'button', class: 'tv-lb', 'data-tool': key, title, onClick, ...extra }, svgIcon(ICONS[key], 22));
  function paintBar() {
    const t = tools();
    bar.replaceChildren(
      btn('cursor', 'Cross', () => setTool(null)),
      el('div', { class: 'tv-lsep' }),
      ...TOOLS.map(([k, name]) => btn(k, name, () => setTool(tool === k ? null : k),
        { onContextmenu: e => { e.preventDefault(); favMenu(k, e.clientX, e.clientY); } })),
      el('div', { class: 'tv-lsep' }),
      btn('magnet', `${t.magnetMode === 'strong' ? 'Strong' : 'Weak'} magnet — snaps to a candle’s open, high, low or close${t.magnetMode === 'strong' ? '' : ' when near'} (right-click: weak or strong)`,
        () => { t.magnet = !t.magnet; saveTools(); paintBar(); }, { onContextmenu: e => { e.preventDefault(); magnetMenu(e.clientX, e.clientY); } }),
      btn(hidden ? 'eyeOff' : 'eye', hidden ? 'Show all drawings' : 'Hide all drawings', () => setHidden(!hidden)),
      btn('trash', 'Remove drawings', e => removeAllMenu(e.currentTarget)));
    for (const b of bar.querySelectorAll('.tv-lb')) {
      const k = b.dataset.tool;
      b.classList.toggle('is-on', k === 'cursor' ? !tool : k === 'magnet' ? !!t.magnet : k === 'eyeOff' ? true : k === tool);
      if (k === 'magnet') b.classList.toggle('is-strong', t.magnetMode === 'strong');
      if (t.favourites.includes(k)) b.classList.add('is-fav');
    }
    paintFav();
  }
  function setTool(k) {
    tool = k; pending = null;
    if (k) select(null);
    plot.classList.toggle('is-drawing', !!k);
    paintBar(); core.draw();
    o.onTool?.(k);
  }
  function setHidden(on) { hidden = on; if (on) select(null); paintBar(); core.draw(); }
  function magnetMenu(x, y) {
    const t = tools();
    const pick = m => () => { t.magnet = true; t.magnetMode = m; saveTools(); paintBar(); };
    openMenu([{ label: 'Weak magnet', hint: 'when near', checked: t.magnet && t.magnetMode !== 'strong', cls: 'tv-m-weak', act: pick('weak') },
      { label: 'Strong magnet', hint: 'always', checked: t.magnet && t.magnetMode === 'strong', cls: 'tv-m-strong', act: pick('strong') }], x, y);
  }
  function favMenu(k, x, y) {
    const t = tools(), on = t.favourites.includes(k);
    openMenu([{ label: on ? 'Remove from favorites' : 'Add to favorites', icon: ICONS.star, cls: 'tv-m-fav',
      act: () => { t.favourites = on ? t.favourites.filter(f => f !== k) : [...t.favourites, k]; saveTools(); paintBar(); } }], x, y);
  }
  function removeAllMenu(anchor) {
    const n = list().length;
    const r = anchor.getBoundingClientRect();
    if (!n) return openMenu([{ head: 'No drawings on this chart' }], r.right + 6, r.top);
    openMenu([{ head: `Remove ${n === 1 ? 'the drawing' : `all ${n} drawings`} on this chart?` },
      { label: 'Remove', cls: 'tv-m-remove-yes', act: () => dropAll() },
      { label: 'Cancel', cls: 'tv-m-remove-no' }], r.right + 6, r.top);
  }

  /* ---------- the favourites bar: floats, and goes where you drag it ---------- */
  const fav = el('div', { class: 'tv-fav', hidden: true });
  plot.append(fav);
  function paintFav() {
    const t = tools();
    fav.hidden = !t.favourites.length;
    if (fav.hidden) return;
    fav.replaceChildren(grip(fav, 'favPos'), ...t.favourites.map(k => el('button', { type: 'button', class: 'tv-fb' + (k === tool ? ' is-on' : ''), 'data-tool': k, title: toolName(k),
      onClick: () => setTool(tool === k ? null : k) }, svgIcon(ICONS[k], 20))));
    place(fav, t.favPos || { x: 0.02, y: 0.14 });
  }
  /* a grip that moves its bar inside the chart; where it ends up is kept */
  function grip(box, key) {
    const g = el('span', { class: 'tv-grip', title: 'Drag to move' }, svgIcon(ICONS.grip, 16));
    g.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const r = plot.getBoundingClientRect(), b = box.getBoundingClientRect();
      const dx = e.clientX - b.left, dy = e.clientY - b.top;
      g.setPointerCapture(e.pointerId);
      const move = ev => {
        const x = Math.max(0, Math.min(r.width - b.width, ev.clientX - r.left - dx)), y = Math.max(0, Math.min(r.height - b.height, ev.clientY - r.top - dy));
        box.style.left = x + 'px'; box.style.top = y + 'px';
        tools()[key] = { x: x / Math.max(1, r.width), y: y / Math.max(1, r.height) };
      };
      const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); saveTools(); };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
    });
    return g;
  }
  function place(box, pos) {
    const W = plot.clientWidth, H = plot.clientHeight, bw = box.offsetWidth, bh = box.offsetHeight;
    box.style.left = Math.max(0, Math.min(W - bw, pos.x * W)) + 'px';
    box.style.top = Math.max(0, Math.min(H - bh, pos.y * H)) + 'px';
  }

  /* ---------- the floating toolbar, while a drawing is selected ---------- */
  const ftb = el('div', { class: 'tv-ftb', hidden: true });
  plot.append(ftb);
  function paintFtb() {
    closeColour();
    const d = sel && byId(sel);
    ftb.hidden = !d;
    if (!d) { ftb.replaceChildren(); return; }
    const pos = d.type === 'long' || d.type === 'short';
    const ib = (key, title, onClick, cls = '') => el('button', { type: 'button', class: 'tv-fbtn ' + cls, title, onClick }, svgIcon(ICONS[key], 18));
    const lineMenu = (e, what) => {
      const r = e.currentTarget.getBoundingClientRect();
      const items = what === 'width'
        ? WIDTHS.map(w => ({ label: `${w}px`, checked: d.style.width === w, act: () => update(d, { style: { width: w } }) }))
        : [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']].map(([v, n]) => ({ label: n, checked: d.style.dash === v, act: () => update(d, { style: { dash: v } }) }));
      openMenu(items, r.left, r.bottom + 4, { cls: 'tv-ftb-menu' });
    };
    ftb.replaceChildren(...[
      grip(ftb, 'ftbPos'),
      ib('template', 'Template', e => templateMenu(d, e.currentTarget), 'tv-f-tmpl'),
      pos ? null : swatch(d.style.color, v => update(byId(d.id), { style: { color: v } }), { cls: 'tv-f-color', title: 'Line colour' }),
      d.type === 'rect' || d.type === 'callout' ? swatch(d.style.fill, v => update(byId(d.id), { style: { fill: v } }), { cls: 'tv-f-fill', title: 'Background' }) : null,
      pos ? null : ib('text', 'Text', () => openSettings(d, 'text'), 'tv-f-text'),
      pos ? null : el('button', { type: 'button', class: 'tv-fbtn tv-f-width', title: 'Thickness', onClick: e => lineMenu(e, 'width') }, el('i', { class: 'tv-wline', style: { height: Math.max(1, d.style.width) + 'px', opacity: d.style.width < 1 ? 0.6 : 1 } }), `${d.style.width}px`),
      pos ? null : el('button', { type: 'button', class: 'tv-fbtn tv-f-dash', title: 'Line style', onClick: e => lineMenu(e, 'dash') }, el('i', { class: 'tv-dline is-' + d.style.dash })),
      ib('gear', 'Settings', () => openSettings(d), 'tv-f-settings'),
      ib('eye', 'Visibility on timeframes', () => openSettings(d, 'visibility'), 'tv-f-vis'),
      ib(d.locked ? 'lock' : 'unlock', d.locked ? 'Unlock' : 'Lock', () => update(d, { locked: !d.locked }).then(() => paintFtb()), 'tv-f-lock' + (d.locked ? ' is-on' : '')),
      ib('trash', 'Remove', () => drop(d.id), 'tv-f-del')].filter(Boolean));
    place(ftb, tools().ftbPos || { x: 0.3, y: 0.1 });
  }
  function templateMenu(d, anchor) {
    const r = anchor.getBoundingClientRect();
    const all = store.data.drawings.drawTemplates?.[d.type] || {};
    const names = Object.keys(all).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const m = openMenu([
      { label: 'Save Drawing Template As…', cls: 'tv-dt-save', act: () => askTemplate(d) },
      { label: 'Apply Default Drawing Template', cls: 'tv-dt-default', act: () => { const df = defaultsOf(d.type); update(d, { style: df.style, text: df.text }); } },
      names.length ? { sep: true } : null,
      ...names.map(n => ({ label: n, cls: 'tv-dt-item', act: () => update(d, { style: all[n].style, text: all[n].text, ...(all[n].inputs ? { inputs: all[n].inputs } : {}) }) })),
    ].filter(Boolean), r.left, r.bottom + 4, { cls: 'tv-dtmenu' });
    /* × on each saved one */
    [...m.querySelectorAll('.tv-dt-item')].forEach((row, k) => {
      const n = names[k];
      row.dataset.name = n;
      row.append(el('span', { class: 'tv-t-del', title: 'Remove template', onClick: async e => {
        e.stopPropagation();
        delete store.data.drawings.drawTemplates[d.type][n];
        await store.save('drawings'); templateMenu(d, anchor);
      } }, '×'));
    });
  }
  function askTemplate(d) {
    const input = el('input', { class: 'tv-field tv-dt-name', placeholder: 'Template name', maxlength: 40 });
    const card = el('div', { class: 'tv-ui tv-ask tv-dt-ask' }, el('div', { class: 'tv-ask-h' }, 'Save Drawing Template As'), input,
      el('div', { class: 'tv-ask-row' }, el('button', { class: 'tv-btn', onClick: () => card.remove() }, 'Cancel'), el('button', { class: 'tv-btn is-primary tv-dt-ok', onClick: () => go() }, 'Save')));
    const go = async () => {
      const name = input.value.trim();
      if (!name) return input.focus();
      const cur = byId(d.id) || d;
      const all = (store.data.drawings.drawTemplates ||= {});
      (all[cur.type] ||= {})[name] = { style: cur.style, text: cur.text, ...(cur.inputs ? { inputs: cur.inputs } : {}) };
      await store.save('drawings');
      card.remove();
      toast(`Template “${name}” saved`);
    };
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); if (e.key === 'Escape') card.remove(); });
    plot.append(card);
    input.focus();
  }
  function openSettings(d, tab) {
    const P = core.palette();
    openDrawingSettings(d, { tab, inst: o.inst, dp: o.dp, tz: core.settings.timezone, candles: { up: P.up, down: P.down },
      preview: draft => { live = draft; core.draw(); },
      done: async next => { live = null; if (next) await update(byId(d.id) || d, next); else core.draw(); paintFtb(); } });
  }

  function select(id) {
    if (sel === id) return;
    sel = id;
    paintFtb(); core.draw();
  }

  /* ---------- making one ---------- */
  function make(type, a, b) {
    const last = tools().last[type];
    const df = defaultsOf(type);
    const d = { id: 'dr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type,
      pts: [a, b], style: { ...df.style, ...(last?.style || {}) }, text: { ...df.text, ...(last?.text || {}), value: df.text.value },
      hideOn: [], locked: false, at: new Date().toISOString() };
    if (type === 'long' || type === 'short') {
      const G = core.geom(), dist = Math.max(tick * 10, (G.hi - G.lo) * 0.07);
      const up = type === 'long' ? 1 : -1;
      d.sl = +(a.p - up * dist).toFixed(o.dp + 1);
      d.tp = +(a.p + up * dist * 2).toFixed(o.dp + 1);
      d.pts = [a, { t: shiftT(a.t, Math.max(10, Math.round(G.count * 0.18))), p: a.p }];
      const acc = o.account?.() || {};
      d.inputs = { account: acc.balance || 100000, risk: acc.risk || 1, riskMode: '%', ...(last?.inputs || {}) };
    }
    return d;
  }
  async function finish(d) {
    pending = null;
    setTool(null);
    await save(d);
    select(d.id);
    if (d.type === 'callout') openSettings(byId(d.id) || d, 'text');
  }

  /* ---------- the pointer ---------- */
  function hitTest(x, y) {
    if (hidden) return null;
    /* handles of the selected one first, then whatever is on top */
    if (sel && shapes.has(sel)) {
      const s = shapes.get(sel);
      const h = s.handles.find(hh => Math.abs(hh.x - x) <= 6 && Math.abs(hh.y - y) <= 6);
      if (h) return { id: sel, handle: h.key };
    }
    const ids = [...shapes.keys()].reverse();
    for (const id of ids) if (shapes.get(id).hit(x, y)) return { id, handle: null };
    return null;
  }
  function claim(x, y, G, e) {
    /* the second click of click–click */
    if (pending) {
      const b = constrain(pending.type, pending.a, pointAt(x, y, G), e.shiftKey);
      const d = make(pending.type, pending.a, b);
      return { capture: true, up: () => finish(d) };
    }
    if (tool) {
      const a = pointAt(x, y, G);
      if (tool === 'long' || tool === 'short') { const d = make(tool, a, a); return { capture: true, up: () => finish(d) }; }
      pending = { type: tool, a, b: a };
      const x0 = x, y0 = y;
      return { capture: true,
        move: (mx, my, G2, e2) => { pending.b = constrain(pending.type, pending.a, pointAt(mx, my, G2), e2.shiftKey); },
        up: (mx, my) => { if (Math.hypot(mx - x0, my - y0) > 5 && pending) finish(make(pending.type, pending.a, pending.b)); },
        cancel: () => { pending = null; } };
    }
    const hit = hitTest(x, y);
    if (!hit) { if (sel) select(null); return null; }
    select(hit.id);
    const d0 = byId(hit.id);
    if (d0.locked) return { capture: true, up: () => {} };
    const i0 = G.iX(x), p0 = G.P(y);
    let moved = false;
    /* moving a drawing: the plain crosshair pointer (TradingView), the dotted crosshair lines still across */
    return { capture: true, cursor: 'crosshair',
      move: (mx, my, G2, e2) => {
        moved = true;
        live = reshape(d0, hit.handle, { i: G2.iX(mx) - i0, dp: G2.P(my) - p0 }, pointAt(mx, my, G2), e2.shiftKey);
        live.__handle = hit.handle;
      },
      up: async () => { if (moved && live) { const { __handle, ...d } = live; live = null; await update(d0, d); } live = null; core.draw(); },
      cancel: () => { live = null; } };
  }
  const constrain = (type, a, b, shift) => (shift && type === 'trend' ? { t: b.t, p: a.p } : b);
  /* a drawing moved whole, or one handle of it */
  function reshape(d, handle, delta, at, shift) {
    const n = structuredClone(d);
    const di = Math.round(delta.i);
    const move = pt => ({ t: shiftT(pt.t, di), p: pt.p + delta.dp });
    if (!handle) {
      n.pts = n.pts.map(move);
      if (n.tp != null) { n.tp += delta.dp; n.sl += delta.dp; }
      return n;
    }
    if (n.type === 'trend' || n.type === 'callout') {
      const k = handle === 'a' ? 0 : 1;
      n.pts[k] = at;
      if (handle === 'mid') { n.pts = d.pts.map(move); }
      if (shift && n.type === 'trend') n.pts[k].p = n.pts[1 - k].p;
      return n;
    }
    if (n.type === 'rect') {
      const [A, B] = n.pts;
      const lft = A.t <= B.t ? 'a' : 'b', top = A.p >= B.p ? 'a' : 'b';
      const set = (which, field, v) => { (which === 'a' ? A : B)[field] = v; };
      const L = lft, R = lft === 'a' ? 'b' : 'a', T = top, Bo = top === 'a' ? 'b' : 'a';
      if (handle.includes('l')) set(L, 't', at.t);
      if (handle.includes('r')) set(R, 't', at.t);
      if (handle.includes('t')) set(T, 'p', at.p);
      if (handle.includes('b')) set(Bo, 'p', at.p);
      return n;
    }
    /* a position: the entry (time and price), the target, the stop, the right edge */
    const long = n.type === 'long', min = tick;
    if (handle === 'entry') { n.pts[0] = { t: at.t, p: long ? Math.min(Math.max(at.p, n.sl + min), n.tp - min) : Math.max(Math.min(at.p, n.sl - min), n.tp + min) }; n.pts[1].p = n.pts[0].p; if (n.pts[1].t <= n.pts[0].t) n.pts[1].t = shiftT(n.pts[0].t, 1); }
    if (handle === 'tp') n.tp = long ? Math.max(at.p, n.pts[0].p + min) : Math.min(at.p, n.pts[0].p - min);
    if (handle === 'sl') n.sl = long ? Math.min(at.p, n.pts[0].p - min) : Math.max(at.p, n.pts[0].p + min);
    if (handle === 'end') n.pts[1] = { t: at.t > n.pts[0].t ? at.t : shiftT(n.pts[0].t, 1), p: n.pts[0].p };
    return n;
  }
  function hover(x, y, G, e) {
    if (tool || pending) {
      if (pending) pending.b = constrain(pending.type, pending.a, pointAt(x, y, G), e?.shiftKey);
      return 'crosshair';
    }
    const hit = hitTest(x, y);
    const was = hot;
    hot = hit?.id || null;
    if (was !== hot) core.draw();
    if (!hit) return null;
    if (hit.handle) return 'move';
    return byId(hit.id)?.locked ? 'pointer' : 'pointer';
  }
  function dbl(x, y) {
    const hit = hitTest(x, y);
    if (!hit) return false;
    openSettings(byId(hit.id), null);
    return true;
  }
  function menu(ctx) {
    const hit = hitTest(ctx.x, ctx.y);
    const items = [];
    if (hit) {
      const d = byId(hit.id);
      select(d.id);
      items.push({ sep: true },
        { label: `${toolName(d.type)} settings…`, icon: ICONS.gear, cls: 'tv-m-dsettings', act: () => openSettings(byId(d.id)) },
        { label: d.locked ? 'Unlock' : 'Lock', icon: ICONS.lock, cls: 'tv-m-dlock', act: () => update(byId(d.id), { locked: !d.locked }) },
        { label: 'Remove', icon: ICONS.trash, cls: 'tv-m-dremove', act: () => drop(d.id) });
    }
    const n = list().length;
    if (n) items.push({ sep: true },
      { label: hidden ? 'Show drawings' : 'Hide drawings', icon: ICONS.eye, cls: 'tc-m-hide', act: () => setHidden(!hidden) },
      { label: `Remove ${n} drawing${n === 1 ? '' : 's'}`, icon: ICONS.trash, cls: 'tc-m-remove',
        act: () => openMenu([{ head: `Remove ${n === 1 ? 'the drawing' : `all ${n} drawings`} on this chart?` },
          { label: 'Remove', cls: 'tc-m-remove-yes', act: () => dropAll() },
          { label: 'Cancel', cls: 'tc-m-remove-no' }], plot.getBoundingClientRect().left + ctx.x, plot.getBoundingClientRect().top + ctx.y) });
    return items;
  }
  /** Keys: Esc puts a tool away or lets go; Delete removes the one selected. True when used. */
  function key(e) {
    if (e.key === 'Escape') {
      if (pending || tool) { setTool(null); return true; }
      if (sel) { select(null); return true; }
      return false;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); drop(sel); return true; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return true; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return true; }
      if (k === 'c' && sel) { e.preventDefault(); copy(); return true; }
      if (k === 'v' && clip) { e.preventDefault(); paste(); return true; }
    }
    return false;
  }

  /* ---------- painting ---------- */
  function paint(g, G, C) {
    shapes.clear();
    if (hidden) return;
    const tf = o.tf(), until = o.replayT?.() ?? Infinity;
    const all = list().map(d => (live && live.id === d.id ? live : d));
    if (pending) all.push(make(pending.type, pending.a, pending.b));
    for (const d of all) {
      if (d.hideOn.includes(tf)) continue;
      /* the trade chart's replay keeps later drawings back; Replay sessions never do (a tool dragged past now stays) */
      if (o.hideFuture !== false && d !== live && d.id !== sel && Math.min(...d.pts.map(p => p.t)) > until) continue;
      const lit = d.id === sel || d.id === hot || !d.at;
      g.save();
      try {
        if (d.type === 'trend') trend(g, G, C, d, lit);
        else if (d.type === 'rect') rect(g, G, C, d, lit);
        else if (d.type === 'callout') callout(g, G, C, d, lit);
        else if (d.type === 'long' || d.type === 'short') position(g, G, C, d, lit, until);
      } finally { g.restore(); }
      if (d.id === sel) handles(g, C, shapes.get(d.id)?.handles || []);
    }
    const gd = guide(C);
    if (gd) {
      const y = Math.round(G.Y(gd.p)) + 0.5;
      g.save(); g.strokeStyle = gd.bg; g.lineWidth = 1; g.setLineDash([2, 2]);
      g.beginPath(); g.moveTo(0, y); g.lineTo(G.pw, y); g.stroke(); g.restore();
    }
  }
  /** While a position's target, stop or entry is dragged: a dotted line right across, and its price on the scale. */
  function guide(C) {
    const h = live?.__handle;
    if (!h || !(live.type === 'long' || live.type === 'short') || !['tp', 'sl', 'entry'].includes(h)) return null;
    const Z = zonesOf(live.style, C);
    const p = h === 'tp' ? live.tp : h === 'sl' ? live.sl : live.pts[0].p;
    const bg = h === 'tp' ? Z.win : h === 'sl' ? Z.lose : live.style.line;
    return { p, bg, fg: inkOn(bg), label: '' };
  }
  const dashOf = (s, w) => (s === 'dashed' ? [6 * Math.max(1, w * 0.7), 4 * Math.max(1, w * 0.7)] : s === 'dotted' ? [Math.max(1, w), Math.max(2, 1.6 * w)] : []);
  const font = (C, t) => `${t.italic ? 'italic ' : ''}${t.bold ? 600 : 400} ${t.size}px ${C.font}`;
  function handles(g, C, hs) {
    for (const h of hs) {
      g.fillStyle = C.card; g.strokeStyle = '#2962FF'; g.lineWidth = 1.5;
      if (h.square) { g.fillRect(h.x - 4, h.y - 4, 8, 8); g.strokeRect(h.x - 4, h.y - 4, 8, 8); }
      else { g.beginPath(); g.arc(h.x, h.y, 4.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
    }
  }
  const segDist = (x, y, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const k = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    return Math.hypot(x - (ax + k * dx), y - (ay + k * dy));
  };
  function trend(g, G, C, d, lit) {
    let [a, b] = d.pts.map(pt => ({ x: X(pt.t, G), y: G.Y(pt.p) }));
    const s = d.style;
    /* extended: the same slope out to the chart's edges */
    let xa = a.x, ya = a.y, xb = b.x, yb = b.y;
    const slope = b.x !== a.x ? (b.y - a.y) / (b.x - a.x) : 0;
    const left = a.x <= b.x ? 'a' : 'b';
    if (s.extL || s.extR) {
      if (a.x === b.x) { if (s.extL) ya = left === 'a' ? -G.ph : G.ph * 2; if (s.extR) yb = left === 'a' ? G.ph * 2 : -G.ph; }
      else {
        const L = left === 'a' ? [xa, ya] : [xb, yb], R = left === 'a' ? [xb, yb] : [xa, ya];
        if (s.extL) { L[1] = L[1] - slope * (L[0] + 10); L[0] = -10; }
        if (s.extR) { R[1] = R[1] + slope * (G.pw + 10 - R[0]); R[0] = G.pw + 10; }
        if (left === 'a') { [xa, ya] = L; [xb, yb] = R; } else { [xb, yb] = L; [xa, ya] = R; }
      }
    }
    /* text in the middle of the line: the line breaks around it (TradingView) — nothing painted behind it */
    const t0 = d.text;
    let gap = null;
    if (t0.value && t0.v === 'middle') {
      const [P, Q] = a.x <= b.x ? [a, b] : [b, a];
      const ang = Math.atan2(Q.y - P.y, Q.x - P.x), fx = t0.h === 'left' ? 0 : t0.h === 'right' ? 1 : 0.5;
      g.font = font(C, t0);
      const w = g.measureText(t0.value).width, pad = t0.h === 'left' ? 4 : t0.h === 'right' ? -4 : 0;
      const x0 = (t0.h === 'left' ? 0 : t0.h === 'right' ? -w : -w / 2) + pad - 4, x1 = x0 + w + 8, h2 = t0.size / 2 + 2;
      const ox = P.x + (Q.x - P.x) * fx, oy = P.y + (Q.y - P.y) * fx, c = Math.cos(ang), sn = Math.sin(ang);
      gap = [[x0, -h2], [x1, -h2], [x1, h2], [x0, h2]].map(([u, v]) => [ox + u * c - v * sn, oy + u * sn + v * c]);
    }
    g.save();
    if (gap) { g.beginPath(); g.rect(-1e4, -1e4, 3e4, 3e4); g.moveTo(...gap[0]); for (const q of gap.slice(1)) g.lineTo(...q); g.closePath(); g.clip('evenodd'); }
    g.strokeStyle = s.color; g.lineWidth = s.width + (lit ? 0.5 : 0); g.setLineDash(dashOf(s.dash, s.width)); g.lineCap = s.dash === 'solid' ? 'round' : 'butt';
    g.beginPath(); g.moveTo(xa, ya); g.lineTo(xb, yb); g.stroke(); g.setLineDash([]);
    g.restore();
    if (s.middle) { g.fillStyle = s.color; g.beginPath(); g.arc((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(2.5, s.width + 1), 0, Math.PI * 2); g.fill(); }
    if (s.labels) {
      g.font = `400 10.5px ${C.font}`;
      for (const pt of [a, b]) {
        const p = G.P(pt.y), txt = core.fmt(p), w = g.measureText(txt).width + 8;
        g.fillStyle = s.color; roundRect(g, pt.x - w / 2, pt.y + 7, w, 15, 2); g.fill();
        g.fillStyle = inkOn(s.color); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, pt.x, pt.y + 15);
      }
    }
    /* the text runs along the line, left to right */
    const t = d.text;
    if (t.value) {
      const [P, Q] = a.x <= b.x ? [a, b] : [b, a];
      const ang = Math.atan2(Q.y - P.y, Q.x - P.x);
      const fx = t.h === 'left' ? 0 : t.h === 'right' ? 1 : 0.5;
      g.save();
      g.translate(P.x + (Q.x - P.x) * fx, P.y + (Q.y - P.y) * fx); g.rotate(ang);
      g.font = font(C, t); g.fillStyle = t.color;
      g.textAlign = t.h === 'left' ? 'left' : t.h === 'right' ? 'right' : 'center';
      g.textBaseline = t.v === 'top' ? 'bottom' : t.v === 'bottom' ? 'top' : 'middle';
      const off = t.v === 'top' ? -(s.width / 2 + 3) : t.v === 'bottom' ? s.width / 2 + 3 : 0;
      const pad = t.h === 'left' ? 4 : t.h === 'right' ? -4 : 0;
      g.fillText(t.value, pad, off);
      g.restore();
    }
    shapes.set(d.id, { hit: (x, y) => segDist(x, y, xa, ya, xb, yb) <= Math.max(5, s.width + 3),
      handles: [{ key: 'a', x: a.x, y: a.y }, { key: 'b', x: b.x, y: b.y }] });
  }
  function rect(g, G, C, d, lit) {
    const [a, b] = d.pts.map(pt => ({ x: X(pt.t, G), y: G.Y(pt.p) }));
    const s = d.style;
    let x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    if (s.extL) x0 = -10; if (s.extR) x1 = G.pw + 10;
    g.fillStyle = s.fill; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = s.color; g.lineWidth = s.width + (lit ? 0.5 : 0); g.setLineDash(dashOf(s.dash, s.width));
    g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.setLineDash([]);
    if (s.middle) { g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x0, (y0 + y1) / 2); g.lineTo(x1, (y0 + y1) / 2); g.stroke(); g.setLineDash([]); }
    const t = d.text;
    if (t.value) {
      g.font = font(C, t); g.fillStyle = t.color;
      g.textAlign = t.h === 'left' ? 'left' : t.h === 'right' ? 'right' : 'center';
      g.textBaseline = t.v === 'top' ? 'top' : t.v === 'bottom' ? 'bottom' : 'middle';
      const tx = t.h === 'left' ? x0 + 6 : t.h === 'right' ? x1 - 6 : (x0 + x1) / 2;
      const ty = t.v === 'top' ? y0 + 5 : t.v === 'bottom' ? y1 - 5 : (y0 + y1) / 2;
      g.fillText(t.value, tx, ty);
    }
    const ax = Math.min(a.x, b.x), bx = Math.max(a.x, b.x), mx = (ax + bx) / 2, my = (y0 + y1) / 2;
    shapes.set(d.id, { hit: (x, y) => x >= x0 - 4 && x <= x1 + 4 && y >= y0 - 4 && y <= y1 + 4,
      handles: [{ key: 'tl', x: ax, y: y0 }, { key: 'tr', x: bx, y: y0 }, { key: 'bl', x: ax, y: y1 }, { key: 'br', x: bx, y: y1 },
        { key: 't', x: mx, y: y0 }, { key: 'b', x: mx, y: y1 }, { key: 'l', x: ax, y: my }, { key: 'r', x: bx, y: my }] });
  }
  function callout(g, G, C, d, lit) {
    const [tip, at] = d.pts.map(pt => ({ x: X(pt.t, G), y: G.Y(pt.p) }));
    const s = d.style, t = d.text;
    g.font = font(C, t);
    const lines = String(t.value || ' ').split('\n');
    const w = Math.max(...lines.map(l => g.measureText(l).width)) + 20, h = lines.length * (t.size + 4) + 12;
    const bx = at.x, by = at.y - h / 2;
    /* the tail from the bubble's nearest side to the point */
    const cx = Math.max(bx + 8, Math.min(bx + w - 8, tip.x)), cy = tip.y < by ? by : tip.y > by + h ? by + h : by + h / 2;
    const sideX = tip.x < bx ? bx : tip.x > bx + w ? bx + w : cx;
    g.fillStyle = s.fill; g.strokeStyle = s.color; g.lineWidth = s.width + (lit ? 0.5 : 0); g.setLineDash(dashOf(s.dash, s.width));
    g.beginPath();
    const baseA = sideX === cx ? { x: cx - 7, y: cy } : { x: sideX, y: by + h / 2 - 7 };
    const baseB = sideX === cx ? { x: cx + 7, y: cy } : { x: sideX, y: by + h / 2 + 7 };
    g.moveTo(baseA.x, baseA.y); g.lineTo(tip.x, tip.y); g.lineTo(baseB.x, baseB.y); g.closePath(); g.fill();
    roundRect(g, bx, by, w, h, 4); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(baseA.x, baseA.y); g.lineTo(tip.x, tip.y); g.lineTo(baseB.x, baseB.y); g.stroke(); g.setLineDash([]);
    g.fillStyle = t.color; g.textAlign = 'left'; g.textBaseline = 'top';
    lines.forEach((l, k) => g.fillText(l, bx + 10, by + 6 + k * (t.size + 4)));
    shapes.set(d.id, { hit: (x, y) => (x >= bx && x <= bx + w && y >= by && y <= by + h) || segDist(x, y, tip.x, tip.y, cx, cy) <= 5,
      handles: [{ key: 'a', x: tip.x, y: tip.y }, { key: 'b', x: bx, y: by + h / 2 }] });
  }
  /** The position's colours: its own, or (auto) the candles'. */
  const zonesOf = (s, C) => ({
    profit: s.profit === 'auto' ? withAlpha(C.up, 0.2) : s.profit, stop: s.stop === 'auto' ? withAlpha(C.down, 0.2) : s.stop,
    win: s.profit === 'auto' ? C.up : withAlpha(s.profit, 1), lose: s.stop === 'auto' ? C.down : withAlpha(s.stop, 1),
  });
  function position(g, G, C, d, lit, until) {
    const N = positionNumbers(o.inst, d);
    const x0 = X(d.pts[0].t, G), x1 = Math.max(X(d.pts[1].t, G), x0 + 4);
    const ye = G.Y(N.entry), yt = G.Y(d.tp), ys = G.Y(d.sl);
    const s = d.style, Z = zonesOf(s, C);
    g.fillStyle = Z.profit; g.fillRect(x0, Math.min(ye, yt), x1 - x0, Math.abs(yt - ye));
    g.fillStyle = Z.stop; g.fillRect(x0, Math.min(ye, ys), x1 - x0, Math.abs(ys - ye));
    /* what price did: the stretch from the entry to now (or to the stop / target) a shade deeper, a dotted line to it */
    const out = positionOutcome(o.rows(), d, until);
    if (out) {
      const xo = Math.min(x1, X(out.t, G)), yo = G.Y(out.p);
      const win = N.pnl(out.p) >= 0;
      g.fillStyle = win ? Z.profit : Z.stop;
      g.fillRect(x0, Math.min(ye, yo), xo - x0, Math.abs(yo - ye));
      g.strokeStyle = s.line; g.lineWidth = s.lineWidth; g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(x0, ye); g.lineTo(xo, yo); g.stroke(); g.setLineDash([]);
    }
    g.strokeStyle = s.line; g.lineWidth = s.lineWidth;
    g.beginPath(); g.moveTo(x0, Math.round(ye) + 0.5); g.lineTo(x1, Math.round(ye) + 0.5); g.stroke();
    /* TradingView's small labels: target above, entry in the middle, stop below */
    if (lit || s.always) {
      const pct = dist => (dist / N.entry * 100).toFixed(2);
      const ticks = dist => Math.round(dist / tick);
      const amt = v => `${Math.round(v).toLocaleString('en-US')}${N.cur && N.cur !== 'USD' ? ' ' + N.cur : ''}`;
      const qty = N.qty >= 100 ? Math.round(N.qty).toLocaleString('en-US') : N.qty.toFixed(2);
      const pnl = out ? N.pnl(out.p) : 0;
      const label = (lines, cx, y, bg, above) => {
        g.font = `400 ${s.size}px ${C.font}`;
        const w = Math.max(...lines.map(l => g.measureText(l).width)) + 12, h = lines.length * (s.size + 3) + 6;
        const lx = Math.max(2, Math.min(G.pw - w - 2, cx - w / 2)), ly = above ? y - h - 4 : y + 4;
        g.fillStyle = bg; roundRect(g, lx, ly, w, h, 3); g.fill();
        g.fillStyle = s.textColor === 'auto' ? inkOn(bg) : s.textColor; g.textAlign = 'left'; g.textBaseline = 'top';
        lines.forEach((l, k) => g.fillText(l, lx + 6, ly + 4 + k * (s.size + 3)));
      };
      const cx = (x0 + x1) / 2, up = N.long;
      label([`Target: ${core.fmt(N.targetDist)} (${pct(N.targetDist)}%) ${ticks(N.targetDist)}, Amount: ${amt(N.targetAmt)}`], cx, up ? Math.min(yt, ye) : Math.max(yt, ye), Z.win, up);
      label([`${out && out.state !== 'open' ? 'Closed' : 'Open'} P&L: ${amt(pnl)}, Qty: ${qty}`, `Risk/Reward Ratio: ${N.rr.toFixed(2)}`], cx, ye - (s.size * 2 + 12) / 2 - 4, pnl >= 0 ? Z.win : Z.lose, false);
      label([`Stop: ${core.fmt(N.stopDist)} (${pct(N.stopDist)}%) ${ticks(N.stopDist)}, Amount: ${amt(N.stopAmt)}`], cx, up ? Math.max(ys, ye) : Math.min(ys, ye), Z.lose, !up);
    }
    const top = Math.min(yt, ys), bot = Math.max(yt, ys);
    shapes.set(d.id, { hit: (x, y) => x >= x0 - 3 && x <= x1 + 3 && y >= top - 3 && y <= bot + 3,
      handles: [{ key: 'entry', x: x0, y: ye, square: true }, { key: 'tp', x: x0, y: yt, square: true }, { key: 'sl', x: x0, y: ys, square: true }, { key: 'end', x: x1, y: ye, square: true }] });
  }
  /** Price labels on the scale for trend lines that ask for them. */
  function tags() {
    if (hidden) return [];
    const out = [];
    for (const d of list()) if (d.type === 'trend' && d.style.labels && !d.hideOn.includes(o.tf())) for (const pt of d.pts) out.push({ p: pt.p, label: '', bg: d.style.color, fg: inkOn(d.style.color) });
    const gd = guide(core.palette());
    if (gd) out.push(gd);
    return out;
  }

  paintBar();
  new ResizeObserver(() => { paintFav(); if (!ftb.hidden) place(ftb, tools().ftbPos || { x: 0.3, y: 0.1 }); }).observe(plot);

  return {
    bar, paint, claim, hover, dbl, menu, key, tags, setTool, setHidden, select, list, undo, redo,
    get tool() { return tool; }, get selected() { return sel; }, get hidden() { return hidden; }, get pending() { return !!pending; },
    leave: () => { if (hot) { hot = null; core.draw(); } },
    shapes: () => [...shapes.entries()].map(([id, s]) => ({ id, handles: s.handles })),
  };
}
