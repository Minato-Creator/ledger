/* ============================================================
   The Lab · Quant — Minato's own strategy, written as rules (quant.js) and
   traded by the app over every one-minute candle Replay has downloaded.

   Gold first. Versions (quantversions.js): pick one at the top; each has its
   prompt (the strategy in words, to copy into an AI) and its settings —
   read-only for the built-in ones, editable for his own (New version from…,
   saved in lab.json → quant.versions; a change runs it again).
     • tiles: total R, trades, win rate (won · lost · break-even), profit
       factor, deepest drawdown, average win
     • the equity line, the two setups and the two years
     • every version side by side on the same prices
     • on the right, the picked trade marked up the way he marks his: the
       level (PL / PH / IPL / IPH), the DC low and the sweep (x), the
       position, the target, the break-even — and the list.
   ============================================================ */
import { el, svg, fitted, icon } from '../ui.js';
import * as cd from '../candles.js';
import * as rd from '../replaydata.js';
import * as Q from '../quant.js';
import * as V from '../quantversions.js';
import { ticks, hoverLayer, readRow } from './chartkit.js';
import { createCore, CHART_TFS, TV_FONT } from '../chart/core.js';

const INST = 'XAU_USD';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = n => String(n).padStart(2, '0');
const when = T => { const d = new Date(T * 1000); return `${d.getDate()} ${MON[d.getMonth()]} ${String(d.getFullYear()).slice(2)} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const month = T => { const d = new Date(T * 1000); return `${MON[d.getMonth()]} ${d.getFullYear()}`; };
const rT = (r, dp = 2) => `${r > 1e-9 ? '+' : r < -1e-9 ? '−' : ''}${Math.abs(r).toFixed(dp)}R`;
const sign = v => (v > 1e-9 ? 'is-up' : v < -1e-9 ? 'is-down' : '');

/* kept while the app is open: the prices once per download, and one run per version's settings */
let prices = null;         // { sig, rows }
const runs = new Map();    // sig + settings → { R, S, Y }
const pick = { id: null };
const ui = { open: false };   // the prompt and settings, folded away until asked for
let STORE = null;          // the app's store, for the charts' settings
const YEAR_CUT = Date.parse('2025-10-01T00:00:00Z') / 1000;

function runOf(v) {
  const o = V.optionsOf(v), key = prices.sig + JSON.stringify(o);
  if (!runs.has(key)) {
    const R = Q.backtest(prices.rows, { inst: INST, ...o });
    runs.set(key, { R, S: Q.stats(R.trades), Y: [Q.stats(R.trades.filter(x => x.openT < YEAR_CUT)), Q.stats(R.trades.filter(x => x.openT >= YEAR_CUT))] });
  }
  return runs.get(key);
}
const ranAlready = v => !!prices && runs.has(prices.sig + JSON.stringify(V.optionsOf(v)));

export function quantPage(ctx) {
  STORE = ctx.store;
  const { state, save, nav } = ctx;
  if (!state.quant) state.quant = { versions: [], current: null };
  const all = V.allVersions(state);
  const ver = all.find(v => v.id === state.quant.current) || all.find(v => v.id === 'v10') || all[0];
  const choose = id => { state.quant.current = id; pick.id = null; save(); nav.refresh(); };
  const head = ctx.head('quant',
    el('select', { class: 'field lab-firm qt-ver', 'aria-label': 'Version', onChange: e => choose(e.target.value) },
      ...all.map(v => el('option', { value: v.id, selected: v.id === ver.id }, v.name))));
  const body = el('div', { class: 'lab-body qt-body' });
  const view = el('div', { class: 'view lab-view qt-view' }, head, body);
  const wait = text => body.replaceChildren(el('div', { class: 'lab-wait' }, el('div', { class: 'lab-progress is-busy' }, el('i')), el('span', {}, text)));

  (async () => {
    const ix = await rd.readIndex();
    const months = ix.pairs?.[INST]?.months || {};
    /* the last two years (25 months), whatever else Replay keeps — the versions were all measured on two years */
    const keys = Object.keys(months).sort().filter(k => rd.monthsWanted(Date.now() / 1000, 2).includes(k));
    if (!keys.length) {
      body.replaceChildren(el('section', { class: 'card lab-prompt' },
        icon('lab', 28, 'var(--grey-6)', 1.4), el('h2', {}, 'Gold first'),
        el('p', {}, 'Quant trades your rules over the prices Replay downloads. Download XAUUSD on Replay → Data and come back.'),
        el('button', { class: 'btn btn-primary', onClick: () => nav.go('#/replay/data') }, 'Open Replay → Data')));
      return;
    }
    const sig = keys.map(k => k + (months[k].at || '')).join('|');
    if (!prices || prices.sig !== sig) {
      wait(`Reading two years of ${INST.replace('_', '')}…`);
      const rows = await rd.candlesBetween(INST, rd.monthStart(keys[0]), rd.monthEnd(keys[keys.length - 1]));
      if (!view.isConnected) return;
      prices = { sig, rows }; runs.clear();
    }
    if (!ranAlready(ver)) {
      wait(`${ver.name}: trading ${prices.rows.length.toLocaleString('en-US')} one-minute candles by its rules…`);
      await new Promise(r => setTimeout(r, 30));
    }
    const K = { rows: prices.rows, ...runOf(ver) };
    if (view.isConnected) body.replaceChildren(...answer(K, ver, ctx, all));
  })().catch(e => body.replaceChildren(el('p', { class: 'lab-empty' }, `Could not run: ${e.message || e}`)));

  view.__quant = () => (prices ? { rows: prices.rows, ...runOf(ver), version: ver } : null);
  return view;
}

/* ============================================================ */
function answer(K, ver, ctx, all) {
  const { R, S, rows } = K;
  const T = R.trades;
  const vcard = versionCard(ver, ctx, all);
  if (!T.length) return [vcard, el('section', { class: 'card lab-prompt' }, el('h2', {}, 'No trades'), el('p', {}, 'These rules found nothing to take in these prices.'))];
  if (!T.some(x => x.id === pick.id)) pick.id = T[T.length - 1].id;
  const o = V.optionsOf(ver);

  const strip = el('div', { class: 'lab-strip' },
    el('span', { class: 'i' }, el('b', {}, 'XAUUSD'), `${month(R.from)} – ${month(R.to)}`),
    el('span', { class: 'i' }, el('b', {}, rows.length.toLocaleString('en-US')), 'one-minute candles'),
    el('span', { class: 'i' }, el('b', {}, String(R.signals)), 'setups found'),
    el('span', { class: 'i' }, el('b', {}, String(R.skipped.rr)), `under ${o.minR}R, left`),
    el('span', { class: 'i' }, `OANDA mid · $${(o.spread * Q.PIP[INST]).toFixed(2)} spread on every entry`));

  const tile = (k, v, s, cls = '') => el('div', { class: 'card rp-tile qt-tile ' + cls }, el('span', { class: 'rp-k' }, k), el('b', { class: 'rp-tv' }, v), el('span', { class: 'rp-ts' }, s));
  const tiles = el('div', { class: 'rp-tiles qt-tiles' },
    tile('Total', rT(S.total, 1), `${rT(S.avg)} a trade`, sign(S.total)),
    tile('Trades', String(S.n), `${T.filter(x => x.kind === 'mtf').length} MTF · ${T.filter(x => x.kind === 'ltf').length} LTF after OFS`),
    tile('Win rate', S.winRate == null ? '—' : `${Math.round(S.winRate * 100)}%`, `${S.won} won · ${S.lost} lost · ${S.be} BE`),
    tile('Profit factor', pfT(S.pf), 'won R ÷ lost R'),
    tile('Max drawdown', rT(-S.maxDD, 1), `${S.worstStreak} losses in a row at worst`),
    tile('Average win', S.avgWin == null ? '—' : rT(S.avgWin), 'every win runs to its target'));

  const side = el('section', { class: 'card ra-side qt-side' });
  const paintSide = () => {
    const t = T.find(x => x.id === pick.id);
    const list = el('div', { class: 'ra-list qt-list' },
      el('div', { class: 'ra-li qt-li is-head' }, el('span'), el('span', {}, 'Opened'), el('span', {}, 'Setup'), el('span', {}, 'Result')),
      ...T.slice().reverse().map(x => el('button', { class: 'ra-li qt-li' + (x.id === pick.id ? ' is-on' : ''), 'data-id': String(x.id),
          onClick: () => { pick.id = x.id; paintSide(); } },
        el('i', { class: x.dir > 0 ? 'is-long' : 'is-short' }), el('span', {}, when(x.openT)),
        el('span', {}, `${x.kind === 'mtf' ? 'MTF' : 'LTF'} · ${x.etf}m in${x.via === '4H NC' ? ' · 4H' : ''}`),
        el('span', { class: sign(x.r) }, x.why === 'be' ? 'BE' : rT(x.r)))));
    const fact = (k, v, cls = '') => el('div', { class: 'ra-fact ' + cls }, el('span', {}, k), el('b', {}, v));
    side.replaceChildren(
      el('div', { class: 'ra-side-head' }, el('h2', {}, `Trade ${t.id} · ${t.dir > 0 ? 'Long' : 'Short'}`),
        el('span', { class: 'lab-sub' }, `${t.setup} at the ${t.level.label === '4H NC' ? '' : t.tf + 'm '}${t.level.label}${t.via === '4H NC' ? ', inside a 4H NC window' : ''} · ${when(t.openT)}`)),
      quantChart(K, t),
      el('div', { class: 'ra-facts' },
        fact('Entry', t.entry.toFixed(2)), fact('Stop', t.sl.toFixed(2)), fact('Target', `${t.tp.toFixed(2)} · ${t.rr.toFixed(1)}R`),
        fact('Result', t.why === 'be' ? 'Break-even' : rT(t.r), sign(t.r)),
        fact('Closed', `${t.why === 'tp' ? 'target' : t.why === 'be' ? 'stop at entry' : 'stop'} · ${when(t.closeT)}`),
        fact('Break-even', t.be ? when(t.be.t) : 'never moved')),
      list);
    const on = list.querySelector('.is-on');
    /* the list scrolls to the picked trade by itself — never the page */
    if (on) requestAnimationFrame(() => { list.scrollTop = Math.max(0, on.offsetTop - list.clientHeight / 2); });
  };
  paintSide();

  const kinds = ['mtf', 'ltf'].map(k => ({ k, name: k === 'mtf' ? '15m protected structure' : '5m, after the OFS', s: Q.stats(T.filter(x => x.kind === k)) }));
  const split = el('section', { class: 'card lab-chart qt-split' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'The two setups'), el('span', { class: 'lab-sub' }, 'and the two years')),
    el('div', { class: 'qt-kinds' }, ...kinds.map(({ k, name, s }) => el('div', { class: 'qt-kind', 'data-kind': k },
      el('span', { class: 'qt-kn' }, name),
      el('b', { class: sign(s.total) }, rT(s.total, 1)),
      el('span', {}, `${s.n} trades · ${s.winRate == null ? '—' : Math.round(s.winRate * 100) + '%'} won · PF ${pfT(s.pf)}`))),
      ...K.Y.map((s, i) => el('div', { class: 'qt-kind', 'data-year': String(i + 1) },
        el('span', { class: 'qt-kn' }, i ? 'Oct 2025 – now' : 'Oct 2024 – Sep 2025'),
        el('b', { class: sign(s.total) }, rT(s.total, 1)),
        el('span', {}, `${s.n} trades · PF ${pfT(s.pf)} · drawdown ${rT(-s.maxDD, 1)}`)))));

  const equity = el('section', { class: 'card lab-chart ra-equity qt-equity' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Equity'), el('span', { class: 'lab-sub' }, 'R after each trade · pick a point for its trade')),
    fitted((w, h) => equityChart(T, S, w, h, id => { pick.id = id; paintSide(); }), 250));

  return [vcard, strip, tiles,
    el('div', { class: 'ra-main qt-main' }, el('div', { class: 'ra-left' }, equity, split, compareCard(ver, ctx, all)), side)];
}
const pfT = pf => (pf == null ? '—' : pf === Infinity ? '∞' : pf.toFixed(2));

/* ---------- the version: its prompt and its settings ---------- */
function versionCard(ver, ctx, all) {
  const { state, save, nav } = ctx;
  const mine = !ver.builtIn;
  const persist = () => save();
  const flash = (btn, text) => { const was = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = was; }, 1400); };
  const copyBtn = el('button', { class: 'btn btn-quiet qt-copy', onClick: async () => {
    try { await navigator.clipboard.writeText(ver.prompt); flash(copyBtn, 'Copied'); } catch { flash(copyBtn, 'Could not copy'); }
  } }, 'Copy prompt');
  const newBtn = el('button', { class: 'btn btn-quiet qt-new', onClick: () => {
    const v = V.newVersion(state, ver);
    state.quant.versions.push(v); state.quant.current = v.id; pick.id = null; ui.open = true; save(); nav.refresh();
  } }, `New version from ${ver.name}`);
  const delBtn = mine ? el('button', { class: 'btn btn-quiet qt-del', onClick: e => {
    if (e.currentTarget.dataset.sure !== '1') { e.currentTarget.dataset.sure = '1'; e.currentTarget.textContent = 'Delete it?'; return; }
    state.quant.versions = state.quant.versions.filter(v => v.id !== ver.id); state.quant.current = ver.from || 'v4'; save(); nav.refresh();
  } }, 'Delete') : null;

  const prompt = el('textarea', { class: 'field qt-prompt', readOnly: !mine, spellcheck: false, rows: 9,
    onChange: e => { ver.prompt = e.target.value; ver.edited = true; persist(); } });
  prompt.value = ver.prompt;

  /* the settings: read for a built-in version, to turn for his own (a change runs it again) */
  const knob = kb => {
    const s = { ...V.BASE, ...ver.settings };
    const val = kb.kind ? (s.kinds || []).includes(kb.k) : s[kb.k];
    let ctl;
    if (kb.bool) ctl = el('button', { class: 'qt-tog' + (val ? ' is-on' : ''), disabled: !mine, 'aria-pressed': String(!!val), onClick: () => set(!val) }, val ? 'On' : 'Off');
    else ctl = el('input', { class: 'field qt-num', type: 'number', min: kb.min, max: kb.max, step: kb.step, disabled: !mine,
      value: val == null ? '' : kb.pct ? String(Math.round(val * 100)) : String(val), placeholder: kb.empty ? '—' : '',
      onChange: e => { const raw = e.target.value.trim(); if (raw === '' && kb.empty) return set(null); const x = Number(raw); if (!isFinite(x)) return; set(kb.pct ? x / 100 : Math.min(kb.max, Math.max(kb.min, x))); } });
    function set(x) {
      if (kb.kind) { const k = new Set(ver.settings.kinds || []); x ? k.add(kb.k) : k.delete(kb.k); ver.settings.kinds = [...k]; }
      else ver.settings[kb.k] = x;
      if (!ver.edited) ver.prompt = `${ver.name} — ${ver.note}\n\n${V.rulesInWords(ver.settings)}`;
      pick.id = null; save(); nav.refresh();
    }
    return el('label', { class: 'qt-knob', 'data-k': kb.k }, el('span', {}, kb.label), ctl, kb.unit ? el('i', {}, kb.pct ? '% ' + kb.unit : kb.unit) : null);
  };

  return el('section', { class: 'card qt-version', 'data-version': ver.id },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, ver.name),
      el('span', { class: 'lab-sub' }, `${ver.builtIn ? 'built in' : 'yours'} · ${ver.date}`),
      el('div', { class: 'spacer' }), copyBtn, newBtn, delBtn),
    el('p', { class: 'qt-note' }, ver.note),
    el('details', { class: 'qt-more', open: ui.open, onToggle: e => { ui.open = e.currentTarget.open; } },
      el('summary', {}, 'Prompt and settings'),
      el('div', { class: 'qt-vbody' },
        el('div', { class: 'qt-pwrap' }, el('span', { class: 'qt-plabel' }, mine ? 'Prompt — the strategy in words, yours to edit' : 'Prompt — the strategy in words'), prompt),
        el('div', { class: 'qt-knobs' }, ...V.KNOBS.map(knob)))));
}

/* ---------- every version side by side ---------- */
function compareCard(ver, ctx, all) {
  const row = (v, r) => el('button', { class: 'qt-crow' + (v.id === ver.id ? ' is-on' : ''), 'data-id': v.id,
      onClick: () => { if (v.id !== ver.id) { ctx.state.quant.current = v.id; pick.id = null; ctx.save(); ctx.nav.refresh(); } } },
    el('span', {}, v.name),
    ...(r ? [el('span', {}, String(r.S.n)), el('span', { class: sign(r.S.total) }, rT(r.S.total, 1)), el('span', {}, pfT(r.S.pf)),
      el('span', {}, r.S.winRate == null ? '—' : `${Math.round(r.S.winRate * 100)}%`), el('span', {}, rT(-r.S.maxDD, 0)),
      el('span', { class: sign(r.Y[0].total) }, rT(r.Y[0].total, 0)), el('span', { class: sign(r.Y[1].total) }, rT(r.Y[1].total, 0))]
      : [el('span', { class: 'qt-wait' }, 'running…')]));
  const list = el('div', { class: 'qt-clist' },
    el('div', { class: 'qt-crow is-head' }, ...['Version', 'Trades', 'Total', 'PF', 'Won', 'Max DD', 'Year 1', 'Year 2'].map(h => el('span', {}, h))),
    ...all.map(v => row(v, ranAlready(v) ? runOf(v) : null)));
  /* the others run one at a time, after the page is up */
  const todo = all.filter(v => !ranAlready(v));
  const next = () => {
    const v = todo.shift();
    if (!v || !list.isConnected) return;
    const r = runOf(v);
    list.querySelector(`.qt-crow[data-id="${v.id}"]`)?.replaceWith(row(v, r));
    setTimeout(next, 20);
  };
  if (todo.length) setTimeout(next, 400);
  return el('section', { class: 'card lab-chart qt-compare' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Versions'), el('span', { class: 'lab-sub' }, 'the same two years, every version · pick one to open it')),
    list);
}

/* ---------- R after each trade ---------- */
function equityChart(T, S, W, H, onPick) {
  const wrap = el('div', { class: 'lab-svgwrap ra-eq' });
  const c = S.curve, n = c.length - 1;
  const plot = { l: 46, r: W - 12, t: 12, b: H - 22 };
  let lo = Math.min(0, ...c), hi = Math.max(0, ...c);
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const X = i => plot.l + (i / Math.max(1, n)) * (plot.r - plot.l), Y = v => plot.b - ((v - lo) / (hi - lo)) * (plot.b - plot.t);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  for (const v of ticks(lo, hi, 4)) {
    g.append(svg('line', { class: Math.abs(v) < 1e-9 ? 'lab-zero' : 'lab-grid', x1: plot.l, x2: plot.r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: plot.l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, rT(v, 0)));
  }
  for (const i of [0, Math.round(n / 2), n]) if (i > 0) g.append(svg('text', { class: 'lab-tick', x: X(i), y: H - 6, 'text-anchor': i === n ? 'end' : 'middle' }, month(T[i - 1].closeT)));
  const line = c.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  g.append(svg('path', { class: 'qt-eq-area', d: `${line}L${X(n)},${Y(0)}L${X(0)},${Y(0)}Z` }));
  g.append(svg('path', { class: 'an-line qt-eq-line line-draw', d: line, pathLength: 1 }));
  T.forEach((x, k) => g.append(svg('circle', { class: 'qt-eq-dot ' + sign(x.r), cx: X(k + 1), cy: Y(c[k + 1]), r: 2.4 })));
  hoverLayer(wrap, g, plot, px => {
    const k = Math.max(1, Math.min(n, Math.round(((px - plot.l) / (plot.r - plot.l)) * n)));
    const x = T[k - 1];
    return { x: X(k), y: Y(c[k]), rows: [
      el('div', { class: 'h' }, `Trade ${x.id} · ${when(x.openT)}`),
      readRow(x.r > 0 ? 'is-pass' : x.r < 0 ? 'is-fail' : 'is-going', x.why === 'be' ? 'BE' : rT(x.r), x.setup),
      readRow('is-going', rT(c[k], 1), 'total')] };
  });
  wrap.addEventListener('click', e => {
    const r = wrap.getBoundingClientRect(), px = e.clientX - r.left;
    const k = Math.max(1, Math.min(n, Math.round(((px - plot.l) / (plot.r - plot.l)) * n)));
    onPick(T[k - 1].id);
  });
  wrap.prepend(g);
  return wrap;
}

/* ---------- the trade, marked up ---------- */
function quantChart(K, t) {
  const box = el('div', { class: 'ra-chart qt-chart' });
  const plot = el('div', { class: 'tc-plot ra-plot qt-plot' });
  const seg = el('div', { class: 'ra-tfs' });
  box.append(seg, plot);
  const rows = K.rows;
  const from = Math.max(Math.min(t.level.t, t.s1.t, t.tpT) - 12 * 3600, t.openT - 5 * 86400);
  const to = t.closeT + Math.max(4 * 3600, (t.closeT - t.openT) * 0.6);
  let a = 0, z = rows.length;
  { let lo = 0, hi = rows.length; while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m][0] < from) lo = m + 1; else hi = m; } a = lo; }
  { let lo = a, hi = rows.length; while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m][0] < to) lo = m + 1; else hi = m; } z = lo; }
  const slice = rows.slice(a, z);
  let tf = t.etf || t.tf;
  requestAnimationFrame(() => {
    if (!box.isConnected) return;
    const core = createCore(plot, { store: STORE, inst: INST, dp: cd.decimalsOf(INST), symbol: 'XAUUSD', source: 'OANDA', bars: cd.aggregate(slice, tf), tf,
      hooks: {
        tags: () => [{ p: t.entry, label: 'Entry', bg: '#787878' }, { p: t.tp, label: 'TP', bg: core.palette().profit }, { p: t.sl, label: 'SL', bg: core.palette().loss }],
        back: (g, G, C) => {
          const xa = G.xT(t.openT), xb = Math.max(G.xT(t.closeT) + G.spacing, xa + 2), ye = G.Y(t.entry);
          g.fillStyle = `rgba(${C.prgb}, .16)`; g.fillRect(xa, Math.min(ye, G.Y(t.tp)), xb - xa, Math.abs(G.Y(t.tp) - ye));
          g.fillStyle = `rgba(${C.lrgb}, .16)`; g.fillRect(xa, Math.min(ye, G.Y(t.sl)), xb - xa, Math.abs(G.Y(t.sl) - ye));
        },
        front: (g, G, C) => {
          g.save();
          g.font = `600 10px ${TV_FONT}`; g.textBaseline = 'middle';
          const dotted = (x1, x2, y, label, colour = C.ink3) => {
            g.strokeStyle = colour; g.lineWidth = 1; g.setLineDash([1.5, 3]);
            g.beginPath(); g.moveTo(x1, Math.round(y) + 0.5); g.lineTo(x2, Math.round(y) + 0.5); g.stroke(); g.setLineDash([]);
            if (label) labels.push({ x: x2 + 5, y, label, colour: colour === C.ink3 ? C.ink : colour });
          };
          const labels = [];
          const mid = T => G.xT(T) + G.spacing / 2;
          const xr = mid(t.rej.t);
          /* the structure at the entry: protected and weak, 15m and 5m — quiet, behind the setup's own marks */
          const xo = G.xT(t.openT);
          for (const [tf, S] of [['15m', t.struct?.m15], ['5m', t.struct?.m5]]) {
            if (!S) continue;
            const up = S.dir > 0, faint = tf === '5m' ? 'rgba(128,128,128,.55)' : 'rgba(128,128,128,.8)';
            if (Math.abs(S.ps.p - t.level.p) > 1e-6) dotted(mid(S.ps.t), xo, G.Y(S.ps.p), `${tf} ${up ? 'PL' : 'PH'}`, faint);
            dotted(mid(S.weak.t), xo, G.Y(S.weak.p), `${tf} weak ${up ? 'H' : 'L'}`, faint);
          }
          dotted(mid(t.level.t), xr, G.Y(t.level.p), t.level.label);
          dotted(mid(t.s1.t), xr - 6, G.Y(t.s1.p), 'DC');
          if (t.s2) dotted(mid(t.s2.t), xr - 6, G.Y(t.s2.p), 'x');
          if (t.conf) dotted(mid(t.conf.t), xo - 4, G.Y(t.conf.p), '1m BOS', C.ink2);
          dotted(mid(t.tpT), G.xT(t.openT) - 4, G.Y(t.tp), 'target', `rgba(${C.prgb}, .9)`);
          if (t.be) { const xb = mid(t.be.t); dotted(xb - 60, xb, G.Y(t.be.lvl), 'BE', C.ink3); }
          /* the rejection candle, ringed */
          g.strokeStyle = C.ink; g.lineWidth = 1;
          const yb = G.Y(t.dir > 0 ? t.sweepX : t.sweepX) + (t.dir > 0 ? 12 : -12);
          g.beginPath(); g.arc(xr, yb, 3, 0, Math.PI * 2); g.stroke();
          /* entry to exit */
          const xa = G.xT(t.openT), xe = mid(t.closeT), ya = G.Y(t.entry), ye = G.Y(t.exit);
          g.strokeStyle = C.ink2; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(xa, ya); g.lineTo(xe, ye); g.stroke(); g.setLineDash([]);
          for (const [x, y] of [[xa, ya], [xe, ye]]) { g.fillStyle = C.card; g.beginPath(); g.arc(x, y, 3.8, 0, Math.PI * 2); g.fill(); g.fillStyle = C.ink; g.beginPath(); g.arc(x, y, 2.3, 0, Math.PI * 2); g.fill(); }
          /* the labels, pushed apart where they would sit on top of each other */
          labels.sort((a, b) => a.y - b.y);
          for (let q = 1; q < labels.length; q++) {
            for (let r = q - 1; r >= 0; r--) {
              if (Math.abs(labels[q].x - labels[r].x) < 70 && labels[q].y - labels[r].y < 12) { labels[q].y = labels[r].y + 12; break; }
            }
          }
          g.textAlign = 'left';
          for (const L of labels) { g.fillStyle = L.colour; g.fillText(L.label, L.x, L.y); }
          g.restore();
        },
      } });
    const place = () => {
      /* framed on the play itself — from a little before the first sweep to a little after the exit;
         the level and the target reach in from the left */
      const i0 = core.idxAt(t.s1.t) - 24, i1 = core.idxAt(t.closeT) + 12, w = Math.max(i1 - i0, 70);
      core.setView(i1 - w, w);
      core.fitPrices([t.entry, t.tp, t.sl, t.level.p]);
      core.setView(i1 - w, w);
      core.draw();
    };
    const paintSeg = () => seg.replaceChildren(...CHART_TFS.filter(([, m]) => m <= 60).map(([label, m]) =>
      el('button', { class: m === tf ? 'is-on' : '', 'data-tf': label, onClick: () => { tf = m; core.setBars(cd.aggregate(slice, tf), tf); place(); paintSeg(); } }, label)));
    paintSeg();
    requestAnimationFrame(place);
    box.__chart = { core, get tf() { return tf; } };
  });
  return box;
}
