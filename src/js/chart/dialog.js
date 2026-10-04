/* ============================================================
   chart/dialog.js — Chart Settings, laid out like TradingView's: the
   tabs down the left (Symbol, Status line, Scales and lines, Canvas), the
   choices on the right, Template ▾ and Cancel / Ok along the bottom.

   Every change shows on the charts at once (a preview); Cancel, × or Esc
   puts back what was saved, Ok keeps it.
   ============================================================ */
import { el, toast } from '../ui.js';
import { DEFAULTS, TIMEZONES, TEXT_SIZES, chartSettings, preview, dropPreview, saveSettings, merge,
  templateNames, templateOf, saveTemplate, dropTemplate, tzLabel } from './settings.js';
import { swatch, closeColour } from './colour.js';
import { closeMenus } from './menu.js';

const TABS = [
  ['symbol', 'Symbol', 'M4 18V9M4 9h2v6H4M10 20V5M10 5h2v11h-2M16 17V8M16 8h2v6h-2'],
  ['status', 'Status line', 'M4 6h16M4 10h10M4 14h16M4 18h7'],
  ['scales', 'Scales and lines', 'M19 4v16M15 7h4M17 11h2M15 15h4M17 19h2M4 20h11'],
  ['canvas', 'Canvas', 'M4.5 4.5h15v15h-15zM4.5 15l4-4 4 4 3-3 4 4'],
  ['trading', 'Trading', 'M4 17l5-5 4 4 7-8M15 8h5v5'],
];
const icon = d => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', 20); s.setAttribute('height', 20);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p);
  return s;
};
let tabNow = 'symbol';

export function openChartSettings(store, { tab, trading = false } = {}) {
  closeMenus();
  document.querySelector('.tv-dialog-wrap')?.remove();
  let draft = structuredClone(chartSettings(store));
  if (tab) tabNow = tab;

  const body = el('div', { class: 'tv-dbody' });
  const nav = el('div', { class: 'tv-dnav' });
  const change = fn => { fn(draft); preview(structuredClone(draft)); paint(); };

  /* ---------- the pieces each row is made of ---------- */
  const section = text => el('div', { class: 'tv-dsec' }, text);
  const row = (label, ...right) => el('div', { class: 'tv-drow' }, el('span', { class: 'tv-dlab' }, label), el('div', { class: 'tv-dctl' }, ...right));
  const seg = (opts, value, set, cls = '') => el('div', { class: 'tv-seg ' + cls },
    ...opts.map(([v, text]) => el('button', { type: 'button', class: v === value ? 'is-on' : '', 'data-v': String(v), onClick: () => change(d => set(d, v)) }, text)));
  const check = (label, on, set, cls = '') => el('label', { class: 'tv-check ' + cls },
    el('input', { type: 'checkbox', checked: !!on, onChange: e => change(d => set(d, e.target.checked)) }), el('i'), el('span', {}, label));
  const select = (opts, value, set, cls = '') => {
    const s = el('select', { class: 'tv-select ' + cls, onChange: e => change(d => set(d, e.target.value)) },
      ...opts.map(([v, text]) => el('option', { value: String(v), selected: String(v) === String(value) }, text)));
    return el('div', { class: 'tv-selwrap' }, s);
  };
  const number = (value, min, max, set, cls = '', unit = '') => el('div', { class: 'tv-numwrap' },
    el('input', { type: 'number', class: 'tv-num ' + cls, value, min, max, step: 1,
      onChange: e => { const n = Math.round(+e.target.value); if (Number.isFinite(n)) change(d => set(d, Math.max(min, Math.min(max, n)))); } }),
    unit ? el('span', { class: 'tv-unit' }, unit) : null);
  const sw = (value, set, cls = '') => swatch(value, v => { draft = structuredClone(draft); set(draft, v); preview(structuredClone(draft)); }, { cls });

  const pages = {
    symbol() {
      const k = draft.candles, quire = k.mode === 'quire';
      const part = (name, key) => row(
        check(name, quire || k[key].on, (d, v) => { d.candles.mode = 'custom'; d.candles[key].on = v; }, 'tv-c-' + key),
        quire ? el('span', { class: 'tv-follows' }, el('i', { style: { background: 'var(--profit)' } }), el('i', { style: { background: 'var(--loss)' } }))
          : el('span', { class: 'tv-pair' }, sw(k[key].up, (d, v) => { d.candles[key].up = v; }, 'tv-up-' + key), sw(k[key].down, (d, v) => { d.candles[key].down = v; }, 'tv-down-' + key)));
      return [
        section('Candles'),
        row('Colours', seg([['quire', 'Quire’s profit / loss'], ['custom', 'Custom']], k.mode, (d, v) => { d.candles.mode = v; }, 'tv-cmode')),
        part('Body', 'body'), part('Borders', 'border'), part('Wick', 'wick'),
        el('p', { class: 'tv-note' }, quire ? 'Following Settings → Appearance in Quire. Choose Custom to set your own.' : 'Your own colours, on every chart.'),
        section('Data modification'),
        row('Precision', select([['default', 'Default'], ...[0, 1, 2, 3, 4, 5, 6].map(n => [n, n ? `1/${10 ** n}` : '1'])], draft.precision,
          (d, v) => { d.precision = v === 'default' ? 'default' : +v; }, 'tv-prec')),
        row('Timezone', select(TIMEZONES.map(([z]) => [z, tzLabel(z)]), draft.timezone, (d, v) => { d.timezone = v; }, 'tv-tz')),
      ];
    },
    status() {
      const s = draft.status;
      return [
        section('Symbol'),
        row(check('Title', s.symbol, (d, v) => { d.status.symbol = v; }, 'tv-st-symbol')),
        row(check('Open, high, low and close', s.ohlc, (d, v) => { d.status.ohlc = v; }, 'tv-st-ohlc')),
        row(check('Bar change values', s.change, (d, v) => { d.status.change = v; }, 'tv-st-change')),
      ];
    },
    scales() {
      const s = draft.scales;
      return [
        section('Price scale'),
        row(check('Last price line', s.lastLine, (d, v) => { d.scales.lastLine = v; }, 'tv-last-line')),
        row(check('Last price label', s.lastLabel, (d, v) => { d.scales.lastLabel = v; }, 'tv-last-label')),
        section('Text'),
        row('Price and time scale', select(TEXT_SIZES.map(n => [n, String(n)]), s.textSize, (d, v) => { d.scales.textSize = +v; }, 'tv-text')),
      ];
    },
    trading() {
      const t = draft.trading;
      return [
        section('Positions and orders'),
        row(check('Show the lines on the chart', t.lines, (d, v) => { d.trading.lines = v; }, 'tv-tr-lines')),
        row(check('Profit and loss on the lines', t.pnl, (d, v) => { d.trading.pnl = v; }, 'tv-tr-pnl')),
        el('p', { class: 'tv-note' }, 'Replay only — mid prices, no spread; a candle that reaches the stop and the target is a loss.'),
      ];
    },
    canvas() {
      const c = draft.canvas;
      return [
        section('Chart basic styles'),
        row('Background', seg([['quire', 'Quire’s'], ['solid', 'Solid'], ['gradient', 'Gradient']], c.bg, (d, v) => { d.canvas.bg = v; }, 'tv-bg'),
          c.bg === 'quire' ? null : sw(c.bgColor, (d, v) => { d.canvas.bgColor = v; }, 'tv-bg1'),
          c.bg === 'gradient' ? sw(c.bgColor2, (d, v) => { d.canvas.bgColor2 = v; }, 'tv-bg2') : null),
        row('Grid lines',
          check('Vert', c.grid.vert, (d, v) => { d.canvas.grid.vert = v; }, 'tv-grid-v'),
          check('Horz', c.grid.horz, (d, v) => { d.canvas.grid.horz = v; }, 'tv-grid-h'),
          sw(c.grid.color, (d, v) => { d.canvas.grid.color = v; }, 'tv-grid-c')),
        row('Crosshair',
          sw(c.cross.color, (d, v) => { d.canvas.cross.color = v; }, 'tv-cross-c'),
          select([1, 2, 3, 4].map(n => [n, `${n}px`]), c.cross.width, (d, v) => { d.canvas.cross.width = +v; }, 'tv-cross-w'),
          select([['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], c.cross.style, (d, v) => { d.canvas.cross.style = v; }, 'tv-cross-s')),
        section('Margins'),
        row('Top', number(c.margins.top, 0, 40, (d, v) => { d.canvas.margins.top = v; }, 'tv-m-top', '%')),
        row('Bottom', number(c.margins.bottom, 0, 40, (d, v) => { d.canvas.margins.bottom = v; }, 'tv-m-bottom', '%')),
        row('Right', number(c.margins.right, 0, 200, (d, v) => { d.canvas.margins.right = v; }, 'tv-m-right', 'bars')),
      ];
    },
  };
  function paint() {
    if (tabNow === 'trading' && !trading) tabNow = 'symbol';
    nav.replaceChildren(...TABS.filter(([k]) => trading || k !== 'trading').map(([k, text, d]) => el('button', { type: 'button', class: 'tv-dtab' + (k === tabNow ? ' is-on' : ''), 'data-tab': k,
      onClick: () => { tabNow = k; closeColour(); paint(); } }, icon(d), el('span', {}, text))));
    const keep = body.scrollTop;
    body.replaceChildren(...pages[tabNow]().filter(Boolean));
    body.scrollTop = keep;
  }

  /* ---------- Template ▾ ---------- */
  let tmenu = null;
  const closeT = () => { tmenu?.remove(); tmenu = null; };
  const templateBtn = el('button', { type: 'button', class: 'tv-btn tv-tmpl', onClick: e => { e.stopPropagation(); tmenu ? closeT() : openT(); } }, 'Template', el('span', { class: 'tv-caret' }));
  function openT() {
    closeColour();
    const names = templateNames(store);
    tmenu = el('div', { class: 'tv-ui tv-menu tv-tmenu' },
      el('button', { class: 'tv-mi tv-t-save', onClick: () => { closeT(); askName(); } }, el('span', { class: 'tv-mlabel' }, 'Save as…')),
      el('button', { class: 'tv-mi tv-t-default', onClick: () => { closeT(); draft = structuredClone(merge(DEFAULTS, {})); preview(structuredClone(draft)); paint(); } }, el('span', { class: 'tv-mlabel' }, 'Apply default')),
      names.length ? el('div', { class: 'tv-sep' }) : null,
      ...names.map(n => el('div', { class: 'tv-mi tv-t-item', 'data-name': n, onClick: () => { closeT(); draft = structuredClone(templateOf(store, n)); preview(structuredClone(draft)); paint(); } },
        el('span', { class: 'tv-mlabel' }, n),
        el('button', { class: 'tv-t-del', title: 'Remove template', onClick: async e => { e.stopPropagation(); await dropTemplate(store, n); closeT(); openT(); } }, '×'))));
    foot.append(tmenu);
  }
  function askName() {
    const input = el('input', { class: 'tv-field tv-t-name', placeholder: 'Template name', maxlength: 40 });
    const save = async () => {
      const name = input.value.trim();
      if (!name) return input.focus();
      await saveTemplate(store, name, draft);
      ask.remove();
      toast(`Template “${name}” saved`);
    };
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') ask.remove(); });
    const ask = el('div', { class: 'tv-ui tv-ask' }, el('div', { class: 'tv-ask-h' }, 'Save chart template'), input,
      el('div', { class: 'tv-ask-row' }, el('button', { class: 'tv-btn', onClick: () => ask.remove() }, 'Cancel'), el('button', { class: 'tv-btn is-primary tv-t-ok', onClick: save }, 'Save')));
    dlg.append(ask);
    input.focus();
  }

  /* ---------- the dialog ---------- */
  const close = keep => {
    closeColour(); closeT();
    document.removeEventListener('keydown', onKey, true);
    wrap.remove();
    if (!keep) dropPreview();
  };
  const ok = async () => {
    const s = structuredClone(draft);
    close(true);
    try { await saveSettings(store, s); } catch (e) { dropPreview(); toast('Could not save the chart settings: ' + (e.message || e), 'bad'); }
  };
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (tmenu) closeT(); else close(false); }
    else if (e.key === 'Enter' && !e.target.closest?.('input, select, textarea, button')) { e.preventDefault(); ok(); }
  };
  const foot = el('div', { class: 'tv-dfoot' }, templateBtn, el('div', { class: 'spacer' }),
    el('button', { type: 'button', class: 'tv-btn tv-cancel', onClick: () => close(false) }, 'Cancel'),
    el('button', { type: 'button', class: 'tv-btn is-primary tv-ok', onClick: ok }, 'Ok'));
  const dlg = el('div', { class: 'tv-ui tv-dialog', role: 'dialog', 'aria-label': 'Chart settings' },
    el('div', { class: 'tv-dhead' }, el('span', {}, 'Settings'),
      el('button', { type: 'button', class: 'tv-x', title: 'Close', onClick: () => close(false) }, icon('M6 6l12 12M18 6L6 18'))),
    el('div', { class: 'tv-dmain' }, nav, body), foot);
  const wrap = el('div', { class: 'tv-dialog-wrap', onPointerdown: e => { if (e.target === wrap) close(false); } }, dlg);
  dlg.addEventListener('pointerdown', e => { if (tmenu && !tmenu.contains(e.target) && e.target !== templateBtn && !templateBtn.contains(e.target)) closeT(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(wrap);
  paint();
  return dlg;
}
