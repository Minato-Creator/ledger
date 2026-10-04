/* ============================================================
   chart/drawdialog.js — a drawing's settings (double-click it), laid out
   like TradingView's: Style, Text, Coordinates, Visibility — and Inputs
   for a Long / Short position. Changes show on the chart as you make
   them; Cancel / × / Esc put it back, Ok keeps it.
   ============================================================ */
import { el } from '../ui.js';
import { swatch, closeColour } from './colour.js';
import { closeMenus } from './menu.js';
import { offsetOf, wall } from './settings.js';

const TFS = [[1, '1m'], [3, '3m'], [5, '5m'], [15, '15m'], [30, '30m'], [60, '1H'], [240, '4H'], [1440, 'D']];
const NAMES = { trend: 'Trend line', rect: 'Rectangle', callout: 'Callout', long: 'Long position', short: 'Short position' };
let lastTab = {};

/** datetime-local value in the chart's timezone, and back. */
const pad = n => String(n).padStart(2, '0');
export function toLocalInput(tz, T) { const d = wall(tz, T); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; }
export function fromLocalInput(tz, v) {
  const m = String(v).match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/);
  if (!m) return NaN;
  const asUTC = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 1000;
  return asUTC - offsetOf(tz, asUTC - offsetOf(tz, asUTC));
}

export function openDrawingSettings(d, o) {
  closeMenus();
  document.querySelector('.tv-dialog-wrap')?.remove();
  let draft = structuredClone(d);
  delete draft.legacy;
  const pos = d.type === 'long' || d.type === 'short';
  const TABS = [...(pos ? [['inputs', 'Inputs']] : []), ['style', 'Style'], ...(pos ? [] : [['text', 'Text']]), ['coords', 'Coordinates'], ['visibility', 'Visibility']];
  let tab = o.tab === 'text' && pos ? 'style' : o.tab && TABS.some(([k]) => k === o.tab) ? o.tab : lastTab[d.type] || TABS[0][0];
  const body = el('div', { class: 'tv-dbody' });
  const nav = el('div', { class: 'tv-dnav tv-dnav-top' });
  const send = () => o.preview(structuredClone(draft));
  const change = (fn, repaint = true) => { fn(draft); send(); if (repaint) paint(); };

  const section = text => el('div', { class: 'tv-dsec' }, text);
  const row = (label, ...right) => el('div', { class: 'tv-drow' }, el('span', { class: 'tv-dlab' }, label), el('div', { class: 'tv-dctl' }, ...right));
  const check = (label, on, set, cls = '') => el('label', { class: 'tv-check ' + cls },
    el('input', { type: 'checkbox', checked: !!on, onChange: e => change(dd => set(dd, e.target.checked)) }), el('i'), el('span', {}, label));
  const select = (opts, value, set, cls = '') => el('div', { class: 'tv-selwrap' }, el('select', { class: 'tv-select ' + cls, onChange: e => change(dd => set(dd, e.target.value)) },
    ...opts.map(([v, text]) => el('option', { value: String(v), selected: String(v) === String(value) }, text))));
  const sw = (value, set, cls) => swatch(value, v => change(dd => set(dd, v), false), { cls });
  const num = (value, set, cls, step = 'any', w = 140) => el('input', { type: 'number', class: 'tv-num ' + cls, value: Number.isFinite(value) ? +(+value).toFixed(o.dp + 2) : '', step, style: { width: w + 'px' },
    onChange: e => { const n = +e.target.value; if (Number.isFinite(n) && e.target.value !== '') change(dd => set(dd, n)); } });
  const time = (T, set, cls) => el('input', { type: 'datetime-local', class: 'tv-field tv-time ' + cls, value: toLocalInput(o.tz, T),
    onChange: e => { const t = fromLocalInput(o.tz, e.target.value); if (Number.isFinite(t)) change(dd => set(dd, t)); } });
  const toggle = (label, on, set, cls) => el('button', { type: 'button', class: 'tv-tog ' + cls + (on ? ' is-on' : ''), onClick: () => change(dd => set(dd, !on)) }, label);

  const pages = {
    inputs() {
      const i = draft.inputs || (draft.inputs = { account: 100000, risk: 1, riskMode: '%' });
      return [
        row('Account size', num(i.account, (dd, v) => { dd.inputs.account = v; }, 'tv-in-account', 'any')),
        row('Risk', num(i.risk, (dd, v) => { dd.inputs.risk = v; }, 'tv-in-risk', 'any', 100),
          el('div', { class: 'tv-seg tv-in-mode' }, ...[['%', '%'], ['$', '$']].map(([v, t]) =>
            el('button', { type: 'button', class: i.riskMode === v ? 'is-on' : '', 'data-v': v, onClick: () => change(dd => { dd.inputs.riskMode = v; }) }, t)))),
        el('p', { class: 'tv-note' }, 'The size is worked out from the risk and the stop, in OANDA units — gold in ounces, NAS100 a dollar a point.'),
      ];
    },
    style() {
      const s = draft.style;
      if (pos) return [
        row('Profit zone', sw(s.profit, (dd, v) => { dd.style.profit = v; }, 'tv-s-profit')),
        row('Stop zone', sw(s.stop, (dd, v) => { dd.style.stop = v; }, 'tv-s-stop')),
        row('Lines', sw(s.line, (dd, v) => { dd.style.line = v; }, 'tv-s-line')),
        row('Text', sw(s.textColor, (dd, v) => { dd.style.textColor = v; }, 'tv-s-text'),
          select([10, 11, 12, 13, 14].map(n => [n, String(n)]), s.size, (dd, v) => { dd.style.size = +v; }, 'tv-s-size')),
        row(check('Always show stats', s.always, (dd, v) => { dd.style.always = v; }, 'tv-s-always')),
      ];
      const line = [sw(s.color, (dd, v) => { dd.style.color = v; }, 'tv-s-color'),
        select([1, 2, 3, 4].map(n => [n, `${n}px`]), s.width, (dd, v) => { dd.style.width = +v; }, 'tv-s-width'),
        select([['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], s.dash, (dd, v) => { dd.style.dash = v; }, 'tv-s-dash')];
      return [
        row(d.type === 'trend' ? 'Line' : 'Border', ...line),
        d.type === 'trend' ? null : row('Background', sw(s.fill, (dd, v) => { dd.style.fill = v; }, 'tv-s-fill')),
        d.type === 'callout' ? null : row('Extend', check('Left', s.extL, (dd, v) => { dd.style.extL = v; }, 'tv-s-extl'), check('Right', s.extR, (dd, v) => { dd.style.extR = v; }, 'tv-s-extr')),
        d.type === 'callout' ? null : row(check(d.type === 'trend' ? 'Middle point' : 'Middle line', s.middle, (dd, v) => { dd.style.middle = v; }, 'tv-s-middle')),
        d.type === 'trend' ? row(check('Price labels', s.labels, (dd, v) => { dd.style.labels = v; }, 'tv-s-labels')) : null,
      ];
    },
    text() {
      const t = draft.text;
      const area = el('textarea', { class: 'tv-field tv-textarea tv-t-value', rows: 3, placeholder: 'Add text', onInput: e => change(dd => { dd.text.value = e.target.value; }, false) });
      area.value = t.value || '';
      area.addEventListener('keydown', e => e.stopPropagation());
      setTimeout(() => { if (area.isConnected && o.tab === 'text') { area.focus(); area.select(); } }, 0);
      return [
        el('div', { class: 'tv-drow tv-textrow' }, sw(t.color, (dd, v) => { dd.text.color = v; }, 'tv-t-color'),
          select([10, 11, 12, 14, 16, 20, 24, 28].map(n => [n, String(n)]), t.size, (dd, v) => { dd.text.size = +v; }, 'tv-t-size'),
          toggle('B', t.bold, (dd, v) => { dd.text.bold = v; }, 'tv-t-bold'), toggle('I', t.italic, (dd, v) => { dd.text.italic = v; }, 'tv-t-italic')),
        area,
        d.type === 'callout' ? null : row('Text alignment',
          select([['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], t.v, (dd, v) => { dd.text.v = v; }, 'tv-t-v'),
          select([['left', 'Left'], ['center', 'Center'], ['right', 'Right']], t.h, (dd, v) => { dd.text.h = v; }, 'tv-t-h')),
      ];
    },
    coords() {
      if (pos) return [
        row('Entry price', num(draft.pts[0].p, (dd, v) => { dd.pts[0].p = v; dd.pts[1].p = v; }, 'tv-c-entry')),
        row('Profit level', num(draft.tp, (dd, v) => { dd.tp = v; }, 'tv-c-tp')),
        row('Stop level', num(draft.sl, (dd, v) => { dd.sl = v; }, 'tv-c-sl')),
        row('From', time(draft.pts[0].t, (dd, v) => { dd.pts[0].t = v; }, 'tv-c-t1')),
        row('To', time(draft.pts[1].t, (dd, v) => { dd.pts[1].t = v; }, 'tv-c-t2')),
      ];
      return draft.pts.flatMap((pt, k) => [
        row(`#${k + 1} price`, num(pt.p, (dd, v) => { dd.pts[k].p = v; }, `tv-c-p${k + 1}`)),
        row(`#${k + 1} time`, time(pt.t, (dd, v) => { dd.pts[k].t = v; }, `tv-c-t${k + 1}`)),
      ]);
    },
    visibility() {
      const hide = new Set(draft.hideOn || []);
      return [
        el('p', { class: 'tv-note' }, 'Show this drawing on these timeframes.'),
        el('div', { class: 'tv-vis' }, ...TFS.map(([m, label]) => check(label, !hide.has(m),
          (dd, v) => { const h = new Set(dd.hideOn || []); if (v) h.delete(m); else h.add(m); dd.hideOn = [...h].sort((a, b) => a - b); }, 'tv-v-' + label))),
      ];
    },
  };
  function paint() {
    nav.replaceChildren(...TABS.map(([k, text]) => el('button', { type: 'button', class: 'tv-dtab' + (k === tab ? ' is-on' : ''), 'data-tab': k,
      onClick: () => { tab = k; lastTab[d.type] = k; closeColour(); paint(); } }, el('span', {}, text))));
    const keep = body.scrollTop;
    body.replaceChildren(...pages[tab]().filter(Boolean));
    body.scrollTop = keep;
  }
  const close = keep => {
    closeColour();
    document.removeEventListener('keydown', onKey, true);
    wrap.remove();
    o.done(keep ? structuredClone(draft) : null);
  };
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
    else if (e.key === 'Enter' && !e.target.closest?.('input, select, textarea, button')) { e.preventDefault(); close(true); }
  };
  const dlg = el('div', { class: 'tv-ui tv-dialog tv-ddialog', role: 'dialog', 'aria-label': NAMES[d.type] },
    el('div', { class: 'tv-dhead' }, el('span', {}, NAMES[d.type]),
      el('button', { type: 'button', class: 'tv-x', title: 'Close', onClick: () => close(false) }, '×')),
    nav, body,
    el('div', { class: 'tv-dfoot' }, el('div', { class: 'spacer' }),
      el('button', { type: 'button', class: 'tv-btn tv-cancel', onClick: () => close(false) }, 'Cancel'),
      el('button', { type: 'button', class: 'tv-btn is-primary tv-ok', onClick: () => close(true) }, 'Ok')));
  const wrap = el('div', { class: 'tv-dialog-wrap is-clear', onPointerdown: e => { if (e.target === wrap) close(false); } }, dlg);
  document.addEventListener('keydown', onKey, true);
  document.body.append(wrap);
  paint();
  return dlg;
}
