/* ============================================================
   The Lab — what a prop-firm challenge is worth to you.

   Two pages in one. The Lab itself is the answer and nothing else: a row of
   figures and three charts, filling the screen. The rules you type in live
   one step away, on Rules, so the answer is never pushed down the page by the
   form that produced it.

   Your trades are already in the journal, so there is nothing to upload. The
   answer is worked out again by itself whenever a rule changes or a trade is
   logged, and it is seeded, so a number moves only because something did.

   The rules are typed in, never supplied: firms change their terms, and a
   preset would be a wrong number that looks right. The engine is in lab.js
   and says what it assumes.
   ============================================================ */
import { el, svg, icon, toast, confirmButton, fitted } from '../ui.js';
import * as c from '../calc.js';
import * as L from '../lab.js';
import { ghostPage } from './ghost.js';
import { mcPage } from './montecarlo.js';
import { ticks, hoverLayer, readRow } from './chartkit.js';

let cache = null;          // { sig, result } — kept across repaints and pages
let running = null;        // { sig, cancel }

const SOURCES = [['live', 'Live'], ['forward', 'Forward test'], ['both', 'Both']];
const isFwd = t => t.mode === 'forward';
const plural = (n, w) => `${Number(n).toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;

/* Money, short. Four figures in full, five and up in thousands — a tile is
   read at a glance, and "$11.6k" is read faster than "$11,575". */
function k$(v, { sign = false, short = false } = {}) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  const pre = a < 0.5 ? '' : v < 0 ? '−' : sign ? '+' : '';
  const body = a >= (short ? 1000 : 10000) ? `${(a / 1000).toFixed(a >= 100000 ? 0 : 1)}k` : Math.round(a).toLocaleString('en-US');
  return `${pre}$${body}`;
}
const r2 = v => c.rFmt(v, 2);

export function lab(store, nav, sub) {
  const acct = store.activeAccount;
  const state = store.lab;
  const save = () => store.save('lab');
  const firm = () => state.firms.find(f => f.id === state.firmId) || state.firms[0] || null;
  const plan = () => ({
    riskEval: state.plan.riskEval ?? acct.defaultRiskPercent ?? 1,
    riskFunded: state.plan.riskFunded ?? acct.defaultRiskPercent ?? 1,
    months: state.plan.months ?? 6,
  });
  const pick = () => {
    const all = store.everyTradeFor(acct.id);
    return state.source === 'forward' ? all.filter(isFwd)
         : state.source === 'both' ? all : all.filter(t => !isFwd(t));
  };
  const ctx = { store, nav, acct, state, save, firm, plan, pick };
  ctx.head = (which, ...extra) => labHead(ctx, which, extra);
  return sub === 'rules' ? rulesPage(ctx) : sub === 'ghost' ? ghostPage(ctx)
       : sub === 'prop' ? answerPage(ctx) : mcPage(ctx);
}

/* The Lab's header, shared by its two tools: which tool, which trades, and
   whatever the tool itself needs at the right-hand end. */
function labHead(ctx, which, extra) {
  const { state, save, nav } = ctx;
  return el('header', { class: 'head' },
    el('h1', {}, 'The Lab'),
    el('div', { class: 'seg lab-views', role: 'tablist', 'aria-label': 'Tool' },
      ...[['mc', 'Monte Carlo', '#/lab'], ['prop', 'Prop firm', '#/lab/prop'], ['ghost', 'Ghost', '#/lab/ghost']].map(([k, label, href]) =>
        el('button', { class: which === k ? 'is-on' : '', role: 'tab', 'aria-selected': String(which === k),
          onClick: () => { if (which !== k) nav.go(href); } }, label))),
    ...extra.slice(0, 1),
    el('div', { class: 'spacer' }),
    el('div', { class: 'seg lab-source', role: 'group', 'aria-label': 'Which trades' },
      ...SOURCES.map(([v, label]) => el('button', { class: state.source === v ? 'is-on' : '',
        onClick: async () => { if (state.source === v) return; state.source = v; await save(); nav.refresh(); } }, label))),
    ...extra.slice(1));
}

/* ============================================================
   The answer
   ============================================================ */
function answerPage(ctx) {
  const { acct, state, save, firm, plan, pick, nav } = ctx;
  const body = el('div', { class: 'lab-body' });
  const strip = el('div', { class: 'lab-strip' });

  const sheet = firm();
  const head = ctx.head('prop',
    state.firms.length > 1
      ? el('select', { class: 'field lab-firm', 'aria-label': 'Firm',
          onChange: e => { state.firmId = e.target.value; save(); nav.refresh(); } },
          ...state.firms.map(f => el('option', { value: f.id, selected: f.id === sheet?.id }, f.name || 'Untitled')))
      : sheet ? el('span', { class: 'lab-firmname' }, sheet.name) : null,
    el('button', { class: 'btn btn-quiet lab-rules-btn', onClick: () => nav.go('#/lab/rules') },
      icon('pencil', 13, 'var(--ink-2)', 1.8), 'Rules'));

  const sample = L.sampleFrom(acct, pick());
  paintStrip(strip, sample);

  const show = (v) => body.replaceChildren(v);
  const p = plan();
  if (!sheet) show(prompt('No firm yet', 'Type in a firm’s rules to see what its evaluation is worth to you.', 'Set up a firm', nav));
  else {
    const need = L.missing(sheet);
    if (need.length) show(prompt('A few rules to go', `Still needed: ${need.join(', ')}.`, 'Finish the rules', nav));
    else if (sample.trades < L.MIN_TRADES || sample.dayCount < L.MIN_DAYS)
      show(prompt('Not enough trades yet', `At least ${L.MIN_TRADES} trades over ${L.MIN_DAYS} days — there ${sample.trades === 1 ? 'is' : 'are'} ${sample.trades} over ${sample.dayCount}.`));
    else if (!(p.riskEval > 0) || !(p.riskFunded > 0)) show(prompt('Risk per trade', 'Set how much you risk a trade.', 'Open rules', nav));
    else run(sample, sheet, p);
  }

  function run(sample, sheet, p) {
    const sumR = sample.days.reduce((a, d) => a + d.reduce((x, y) => x + y, 0), 0);
    const sig = JSON.stringify([state.source, acct.id, sample.trades, sample.dayCount, sumR.toFixed(6), sample.perWeek, sheet, p]);
    if (cache && cache.sig === sig) { show(answer(cache.result, sample, sheet, p)); return; }
    if (running) running.cancel();
    let cancelled = false;
    running = { sig, cancel: () => { cancelled = true; } };
    const bar = el('i');
    show(el('div', { class: 'lab-wait' }, el('div', { class: 'lab-progress' }, bar),
      el('span', {}, `${plural(10000, 'account')} from ${plural(sample.trades, 'trade')}`)));
    const it = L.analyse(sample, JSON.parse(JSON.stringify(sheet)), p);
    /* A frame at a time, so the page never freezes while it works. */
    const step = () => {
      if (cancelled) return;
      if (!body.isConnected) { requestAnimationFrame(step); return; }
      const s = it.next();
      if (s.done) {
        running = null;
        cache = { sig, result: s.value };
        show(answer(s.value, sample, sheet, p));
        return;
      }
      const v = s.value;
      bar.style.width = Math.round(100 * (v.stage === 'main' ? .05 : v.stage === 'range' ? .1 + v.done * .45
        : v.stage === 'line' ? .55 + v.done * .2 : .75 + v.done * .25)) + '%';
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }

  return el('div', { class: 'view lab-view' }, head, strip, body);
}

function prompt(title, text, action = null, nav = null) {
  return el('section', { class: 'card lab-prompt' },
    icon('lab', 28, 'var(--grey-6)', 1.4),
    el('h2', {}, title),
    el('p', {}, text),
    action ? el('button', { class: 'btn btn-primary', onClick: () => nav.go('#/lab/rules') }, action) : null);
}

/* One quiet line: what the answer is built from. */
function paintStrip(strip, s) {
  if (!s.trades) { strip.replaceChildren(el('span', {}, 'No trades with an R in this selection')); return; }
  const m = s.se != null ? 1.96 * s.se : null;
  const item = (k, v) => el('span', { class: 'i' }, el('b', {}, v), k);
  /* replaceChildren is not el(): a null here would print the word "null". */
  strip.replaceChildren(...[
    item('trades', s.trades.toLocaleString('en-US')),
    item('days', String(s.dayCount)),
    el('span', { class: 'i' }, el('b', {}, r2(s.meanR)),
      m != null ? el('span', { class: 'pm', title: 'Your true edge, 95% of the time, on this many trades' }, `± ${m.toFixed(2)}`) : null,
      'a trade'),
    item('won', s.winRate == null ? '—' : c.pct(s.winRate, 0)),
    item('days a week', s.perWeek == null ? '—' : s.perWeek.toFixed(1)),
    s.skipped ? el('span', { class: 'i is-warn', title: 'Live trades with no risk set have no R' }, `${s.skipped} left out`) : null,
  ].filter(Boolean));
}

function answer(R, sample, sheet, p) {
  const tile = (label, value, sub, cls = '', title = '') => el('div', { class: 'lab-tile' + cls, title },
    el('span', { class: 'k' }, label), el('span', { class: 'v' }, value), el('span', { class: 's' }, sub || ' '));
  const be = R.breakEven;
  const beText = be.status === 'found' ? r2(be.meanR) : be.status === 'below' ? `< ${r2(be.meanR)}` : `> ${r2(be.meanR)}`;

  const tiles = el('div', { class: 'lab-tiles' },
    tile('EV / evaluation', k$(R.ev, { sign: true }), `${k$(R.evRange[0], { sign: true, short: true })} to ${k$(R.evRange[1], { sign: true, short: true })}`,
      R.ev > 0 ? ' is-pos is-hero' : R.ev < 0 ? ' is-neg is-hero' : ' is-hero',
      'Average result of one evaluation, fee included. Underneath: where it lands on 80% of plausible versions of your history.'),
    tile('Pass rate', c.pct(R.passRate, 1), sheet.steps === 2 ? 'both steps' : ''),
    tile('Paid', c.pct(R.paidRate, 1), 'at least once'),
    tile('Median payout', R.paidPct.p50 == null ? '—' : k$(R.paidPct.p50), R.avgPayouts ? `${R.avgPayouts.toFixed(1)} payouts avg` : ''),
    tile('Break-even edge', beText, `yours ${r2(sample.meanR)}`,
      be.status === 'found' ? (sample.meanR > be.meanR ? ' is-ok' : ' is-bad') : '',
      'The edge per trade below which this evaluation stops paying for itself'));

  return el('div', { class: 'lab-answer' },
    tiles,
    el('div', { class: 'lab-main' }, pathsCard(R), outcomesCard(R)),
    el('div', { class: 'lab-pair' }, payoutCard(R), edgeCard(R, sample)),
    el('p', { class: 'lab-note', title: 'Drawdown and daily limits are checked on closed trades — a journal cannot see how far a trade went against you while it was open.' },
      `${R.runs.toLocaleString('en-US')} runs · risk ${p.riskEval}% / ${p.riskFunded}% · ${plural(R.horizonMonths, 'month')} funded`));
}

/* ---------- shared chart pieces ---------- */

/* ---------- the evaluation, account by account ----------
   Ninety accounts drawn as they went: each a line from the day you start to
   the day it ends, on the target or on the floor. The colour is how it
   ended. Hover a day for how every one of the ten thousand stood by then. */
function pathsCard(R) {
  const E = R.evalChart;
  const card = el('section', { class: 'card lab-chart lab-paths' },
    el('div', { class: 'lab-chart-head' },
      el('h2', {}, E.steps === 2 ? 'Evaluation · step 1' : 'Evaluation'),
      el('span', { class: 'lab-sub' }, `${E.paths.length} of ${R.runs.toLocaleString('en-US')} runs`),
      el('span', { class: 'lab-legend' },
        el('i', { class: 'is-pass' }), 'Passed', el('i', { class: 'is-fail' }), 'Failed',
        E.cum.open[E.cum.open.length - 1] > 0.001 ? [el('i', { class: 'is-open' }), 'Still going'] : null)));
  card.append(fitted((w, h) => drawPaths(E, w, h), 280));
  return card;
}

function drawPaths(E, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const plot = { l: 52, r: W - 70, t: 12, b: H - 24 };
  const xMax = Math.max(5, Math.ceil(E.p95Days * 1.05));
  let yMin = Math.min(E.floor, 0), yMax = Math.max(E.target, 0);
  for (const p of E.paths) for (let i = 1; i < p.pts.length; i += 2) {
    if (p.pts[i - 1] > xMax) break;
    if (p.pts[i] < yMin) yMin = p.pts[i];
    if (p.pts[i] > yMax) yMax = p.pts[i];
  }
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad; yMax += pad;
  const X = x => plot.l + (x / xMax) * (plot.r - plot.l);
  const Y = y => plot.b - ((y - yMin) / (yMax - yMin)) * (plot.b - plot.t);

  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const id = 'clip' + Math.random().toString(36).slice(2, 7);
  g.append(svg('defs', {}, svg('clipPath', { id }, svg('rect', { x: plot.l, y: plot.t - 2, width: plot.r - plot.l, height: plot.b - plot.t + 4 }))));

  for (const v of ticks(yMin, yMax, 5)) {
    g.append(svg('line', { class: v === 0 ? 'lab-zero' : 'lab-grid', x1: plot.l, x2: plot.r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: plot.l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, k$(v, { sign: v > 0 })));
  }
  for (const d of ticks(0, xMax, 6)) {
    g.append(svg('line', { class: 'lab-grid is-v', x1: X(d), x2: X(d), y1: plot.t, y2: plot.b }));
    g.append(svg('text', { class: 'lab-tick', x: X(d), y: plot.b + 16, 'text-anchor': 'middle' }, d === 0 ? 'day 0' : String(d)));
  }

  /* The lines that decide it: the target above, the floor below. */
  const level = (y, cls, label) => {
    g.append(svg('line', { class: 'lab-level ' + cls, x1: plot.l, x2: plot.r, y1: Y(y), y2: Y(y) }));
    g.append(svg('text', { class: 'lab-level-lbl', x: plot.r + 8, y: Y(y) - 3 }, label));
    g.append(svg('text', { class: 'lab-level-val', x: plot.r + 8, y: Y(y) + 9 }, k$(y, { sign: y > 0 })));
  };
  level(E.target, 'is-target', 'target');
  level(E.floor, 'is-floor', E.ddType === 'static' ? 'floor' : 'floor ↑');

  const lines = svg('g', { 'clip-path': `url(#${id})` });
  const order = { open: 0, fail: 1, pass: 2 };
  for (const p of E.paths.slice().sort((a, b) => order[a.end] - order[b.end])) {
    let d = '';
    for (let i = 0; i < p.pts.length; i += 2) d += (i ? 'L' : 'M') + X(p.pts[i]).toFixed(1) + ',' + Y(p.pts[i + 1]).toFixed(1);
    lines.append(svg('path', { class: 'lab-path is-' + p.end, d }));
    const lx = p.pts[p.pts.length - 2], ly = p.pts[p.pts.length - 1];
    if (lx <= xMax && p.end !== 'open') lines.append(svg('circle', { class: 'lab-end is-' + p.end, cx: X(lx), cy: Y(ly), r: 2.4 }));
  }
  g.append(lines);

  hoverLayer(wrap, g, plot, x => {
    const day = Math.max(1, Math.round(((x - plot.l) / (plot.r - plot.l)) * xMax));
    const at = arr => arr[Math.min(arr.length - 1, day)] ?? arr[arr.length - 1] ?? 0;
    const pass = at(E.cum.pass), fail = at(E.cum.fail);
    return { x: X(day), rows: [
      el('div', { class: 'h' }, `Day ${day}`),
      readRow('is-pass', c.pct(pass, 1), 'passed'),
      readRow('is-fail', c.pct(fail, 1), 'failed'),
      readRow('is-going', c.pct(Math.max(0, 1 - pass - fail), 1), 'still going')] };
  });
  wrap.prepend(g);
  return wrap;
}

/* How every account ended. Four rows that add to the whole. */
function outcomesCard(R) {
  const rows = [
    ['fail', 'Failed evaluation', R.rates.failed,
      [['drawdown', R.fail.drawdown], ['daily', R.fail.daily], ['time', R.fail.time + R.fail.stale]]],
    ['lost', 'Lost before payout', R.rates.blownUnpaid, [['drawdown', R.lost.drawdown], ['daily', R.lost.daily]]],
    ['alive', 'Funded, not paid yet', R.rates.unpaidAlive, []],
    ['paid', 'Paid', R.rates.paid, []],
  ].filter(r => r[2] > 0.0005 || r[0] === 'paid' || r[0] === 'fail');
  return el('section', { class: 'card lab-chart lab-outcomes' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Outcomes')),
    el('div', { class: 'lab-orows' }, ...rows.map(([k, label, v, why]) => {
      const parts = why.filter(([, n]) => n / R.runs >= 0.0005).map(([w, n]) => `${w} ${c.pct(n / R.runs, 1)}`);
      return el('div', { class: 'lab-orow' },
        el('div', { class: 'top' }, el('span', { class: 'l' }, label), el('b', {}, c.pct(v, 1))),
        el('div', { class: 'bar' }, el('i', { class: 'is-' + k, style: { width: Math.max(v > 0 ? 1.5 : 0, v * 100) + '%' } })),
        parts.length ? el('div', { class: 'why' }, parts.join(' · ')) : null);
    })),
    R.avgPassDays ? el('div', { class: 'lab-ofoot' }, el('b', {}, String(Math.round(R.avgPassDays))), 'trading days to pass, on average') : null);
}

/* ---------- what a paid account paid ----------
   A smoothed distribution rather than a row of bins: the shape is the
   message, and bins make the shape depend on where the edges happen to
   fall. The 10th, 50th and 90th percentiles are marked on it. */
function payoutCard(R) {
  const card = el('section', { class: 'card lab-chart lab-payout' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Payouts'),
      el('span', { class: 'lab-sub' }, `paid accounts · ${plural(R.horizonMonths, 'month')}`)));
  if (R.paid.length < 10) { card.append(el('p', { class: 'lab-empty' }, 'Too few paid accounts to draw.')); return card; }
  card.append(fitted((w, h) => drawPayout(R, w, h), 190));
  return card;
}

function drawPayout(R, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const data = R.paid;
  const n = data.length;
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(data.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
  const p0 = L.pctile(data, 0.005), p1 = L.pctile(data, 0.99);
  const bw = Math.max((p1 - p0) / 60, 1.06 * sd * n ** -0.2);
  /* Drawn a little past the data at both ends, so the curve rises out of
     the baseline and settles back onto it instead of starting in mid-air. */
  const lo = Math.max(0, p0 - 2 * bw), hi = p1 + bw;
  const N = 140, xs = [], ys = [];
  const step = Math.max(1, Math.floor(n / 4000));               // plenty for a smooth line
  for (let i = 0; i <= N; i++) {
    const x = lo + (hi - lo) * i / N;
    let s = 0;
    for (let j = 0; j < n; j += step) { const z = (x - data[j]) / bw; s += Math.exp(-0.5 * z * z); }
    xs.push(x); ys.push(s);
  }
  const yTop = Math.max(...ys) * 1.12;
  const plot = { l: 16, r: W - 16, t: 26, b: H - 24 };
  const X = x => plot.l + ((x - lo) / (hi - lo || 1)) * (plot.r - plot.l);
  const Y = y => plot.b - (y / yTop) * (plot.b - plot.t);

  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const gid = 'pg' + Math.random().toString(36).slice(2, 7);
  g.append(svg('defs', {},
    svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
      svg('stop', { offset: '0%', class: 'lab-grad-top' }), svg('stop', { offset: '100%', class: 'lab-grad-bottom' }))));
  for (const v of ticks(lo, hi, 5)) {
    g.append(svg('line', { class: 'lab-grid is-v', x1: X(v), x2: X(v), y1: plot.t, y2: plot.b }));
    g.append(svg('text', { class: 'lab-tick', x: X(v), y: plot.b + 16, 'text-anchor': 'middle' }, k$(v)));
  }
  g.append(svg('line', { class: 'lab-zero', x1: plot.l, x2: plot.r, y1: plot.b, y2: plot.b }));
  let line = '';
  xs.forEach((x, i) => { line += (i ? 'L' : 'M') + X(x).toFixed(1) + ',' + Y(ys[i]).toFixed(1); });
  g.append(svg('path', { d: `${line}L${X(hi).toFixed(1)},${plot.b}L${X(lo).toFixed(1)},${plot.b}Z`, fill: `url(#${gid})` }));
  g.append(svg('path', { class: 'lab-curve is-paid', d: line }));

  /* The three marks, labelled above the plot where nothing else is. */
  const marks = [['p10', R.paidPct.p10], ['median', R.paidPct.p50], ['p90', R.paidPct.p90]];
  const medX = X(R.paidPct.p50);
  for (const [label, v] of marks) {
    if (v == null || v < lo || v > hi) continue;
    const med = label === 'median';
    g.append(svg('line', { class: 'lab-mark' + (med ? ' is-med' : ''), x1: X(v), x2: X(v), y1: plot.t - 2, y2: plot.b }));
    /* A label that would run into the median's is left to the hover. */
    if (!med && Math.abs(X(v) - medX) < 78) continue;
    g.append(svg('text', { class: 'lab-mark-lbl' + (med ? ' is-med' : ''), x: X(v), y: plot.t - 8, 'text-anchor': 'middle' },
      `${label} ${k$(v)}`));
  }

  const sortedPaid = data;                                       // already ascending
  hoverLayer(wrap, g, plot, x => {
    const v = lo + ((x - plot.l) / (plot.r - plot.l)) * (hi - lo);
    let i = 0, j = sortedPaid.length;
    while (i < j) { const m = (i + j) >> 1; if (sortedPaid[m] < v) i = m + 1; else j = m; }
    const above = 1 - i / sortedPaid.length;
    const k = Math.round(((x - plot.l) / (plot.r - plot.l)) * N);
    return { x, y: Y(ys[Math.max(0, Math.min(N, k))]), rows: [
      el('div', { class: 'h' }, k$(v)),
      readRow('is-paid', c.pct(above, 0), 'were paid more')] };
  });
  wrap.prepend(g);
  return wrap;
}

/* ---------- what it is worth at other edges ----------
   The answer as a curve of your edge. Where it crosses zero is the
   break-even; the shaded band is where your own edge probably is, given how
   many trades it was measured on. Above zero the line is the profit colour,
   below it the loss colour. */
function edgeCard(R, sample) {
  const card = el('section', { class: 'card lab-chart lab-edge' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'EV by edge'),
      el('span', { class: 'lab-sub' }, 'R per trade')));
  card.append(fitted((w, h) => drawEdge(R, sample, w, h), 190));
  return card;
}

function drawEdge(R, sample, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const pts = R.curve;
  const x0 = pts[0].edge, x1 = pts[pts.length - 1].edge;
  let yMin = Math.min(0, ...pts.map(p => p.ev)), yMax = Math.max(0, ...pts.map(p => p.ev));
  const pad = (yMax - yMin) * 0.1 || 1;
  yMin -= pad; yMax += pad;
  const plot = { l: 52, r: W - 16, t: 14, b: H - 24 };
  const X = x => plot.l + ((x - x0) / (x1 - x0 || 1)) * (plot.r - plot.l);
  const Y = y => plot.b - ((y - yMin) / (yMax - yMin)) * (plot.b - plot.t);

  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const gid = 'eg' + Math.random().toString(36).slice(2, 7);
  const zeroAt = (Y(0) - plot.t) / (plot.b - plot.t);
  g.append(svg('defs', {},
    svg('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: 0, y1: plot.t, x2: 0, y2: plot.b },
      svg('stop', { offset: Math.max(0, Math.min(1, zeroAt)), class: 'lab-stop-pos' }),
      svg('stop', { offset: Math.max(0, Math.min(1, zeroAt)), class: 'lab-stop-neg' }))));

  /* Where your edge probably is. */
  const m = sample.se != null ? 1.96 * sample.se : 0;
  const bl = Math.max(x0, sample.meanR - m), br = Math.min(x1, sample.meanR + m);
  if (br > bl) g.append(svg('rect', { class: 'lab-band', x: X(bl), y: plot.t, width: X(br) - X(bl), height: plot.b - plot.t }));

  for (const v of ticks(yMin, yMax, 4)) {
    g.append(svg('line', { class: v === 0 ? 'lab-zero' : 'lab-grid', x1: plot.l, x2: plot.r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: plot.l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, k$(v, { sign: v > 0 })));
  }
  for (const v of ticks(x0, x1, 5)) {
    g.append(svg('text', { class: 'lab-tick', x: X(v), y: plot.b + 16, 'text-anchor': 'middle' }, r2(v)));
  }
  let d = '';
  pts.forEach((p, i) => { d += (i ? 'L' : 'M') + X(p.edge).toFixed(1) + ',' + Y(p.ev).toFixed(1); });
  g.append(svg('path', { class: 'lab-curve', d, stroke: `url(#${gid})` }));

  const evAt = x => {
    for (let i = 1; i < pts.length; i++) if (x <= pts[i].edge) {
      const a = pts[i - 1], b = pts[i], t = (x - a.edge) / (b.edge - a.edge || 1);
      return a.ev + (b.ev - a.ev) * t;
    }
    return pts[pts.length - 1].ev;
  };
  const be = R.breakEven;
  if (be.status === 'found' && be.meanR >= x0 && be.meanR <= x1) {
    g.append(svg('circle', { class: 'lab-be', cx: X(be.meanR), cy: Y(0), r: 4.5 }));
    /* Up and to the left of the point: the curve comes from below zero on
       the left and climbs away to the right, so that corner is empty. */
    g.append(svg('text', { class: 'lab-mark-lbl', x: X(be.meanR) - 9, y: Y(0) - 9, 'text-anchor': 'end' }, `break-even ${r2(be.meanR)}`));
  }
  g.append(svg('line', { class: 'lab-mark is-med', x1: X(sample.meanR), x2: X(sample.meanR), y1: plot.t, y2: plot.b }));
  g.append(svg('circle', { class: 'lab-you', cx: X(sample.meanR), cy: Y(evAt(sample.meanR)), r: 4.5 }));
  g.append(svg('text', { class: 'lab-mark-lbl is-med', x: X(sample.meanR) + 8, y: plot.t + 10 }, `you ${r2(sample.meanR)}`));

  hoverLayer(wrap, g, plot, x => {
    const edge = x0 + ((x - plot.l) / (plot.r - plot.l)) * (x1 - x0);
    const ev = evAt(edge);
    return { x, y: Y(ev), rows: [
      el('div', { class: 'h' }, `${r2(edge)} a trade`),
      readRow(ev >= 0 ? 'is-paid' : 'is-fail', k$(ev, { sign: true }), 'per evaluation')] };
  });
  wrap.prepend(g);
  return wrap;
}

/* ============================================================
   Rules — the page inside the page
   ============================================================ */
function rulesPage(ctx) {
  const { acct, state, save, firm, nav } = ctx;
  const bodyEl = el('div', { class: 'lab-rules' });
  const status = el('span', { class: 'lab-status' });

  const head = el('header', { class: 'head' },
    el('button', { class: 'lab-back', title: 'Back to The Lab', 'aria-label': 'Back to The Lab', onClick: () => nav.go('#/lab/prop') },
      icon('chevleft', 15, 'var(--grey-1)', 2)),
    el('h1', {}, 'Rules'),
    status,
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-primary', onClick: () => nav.go('#/lab/prop') }, 'Done'));

  function paintStatus() {
    const f = firm();
    const need = f ? L.missing(f) : ['a firm'];
    status.className = 'lab-status' + (need.length ? ' is-need' : ' is-ready');
    status.textContent = need.length ? `${need.length} to fill in` : 'ready';
    status.title = need.length ? `Still needed: ${need.join(', ')}` : '';
    for (const box of bodyEl.querySelectorAll('.lab-f.is-req')) {
      const v = box.querySelector('input')?.value.trim();
      box.classList.toggle('is-empty', !v);
    }
  }

  function paint() {
    const sheet = firm();
    const p = state.plan;
    const pct$ = v => {
      const size = Number(sheet?.size);
      return v != null && v !== '' && size > 0 ? k$(size * Number(v) / 100) : '';
    };
    /* A field commits on change and saves — the page is not rebuilt, so the
       cursor stays where you put it. */
    const field = (label, get, set, { unit = '', hint = null, placeholder = '', required = false } = {}) => {
      const hintEl = el('span', { class: 'lab-hint' }, hint ? hint(get()) : '');
      const input = el('input', { class: 'lab-in', value: get() ?? '', placeholder, inputmode: 'decimal', 'aria-label': label,
        onChange: e => {
          const raw = e.target.value.trim();
          const n = raw === '' ? null : c.parseNumber(raw);
          if (raw !== '' && (n == null || n < 0)) { e.target.value = get() ?? ''; toast('Not a number', 'warn'); return; }
          set(n); save();
          if (hint) hintEl.textContent = hint(n);
          paintStatus();
        },
        onKeydown: e => { if (e.key === 'Enter') e.target.blur(); } });
      return el('label', { class: 'lab-f' + (required ? ' is-req' : ''), dataset: { need: label.toLowerCase() } },
        el('span', { class: 'k' }, label),
        el('span', { class: 'lab-box' }, input, unit ? el('span', { class: 'u' }, unit) : null),
        hintEl);
    };
    const toggle = (label, get, set) => el('button', { type: 'button', class: 'lab-toggle', 'aria-pressed': String(!!get()),
      onClick: () => { set(!get()); save(); paint(); } },
      el('span', { class: 'tick' + (get() ? ' is-on' : '') }, get() ? icon('check', 11, '#fff', 3) : null), el('span', {}, label));
    const seg = (label, options, get, set) => el('div', { class: 'lab-f' }, el('span', { class: 'k' }, label),
      el('div', { class: 'seg lab-seg' }, ...options.map(([v, text]) => el('button', { type: 'button', class: get() === v ? 'is-on' : '',
        onClick: () => { if (get() === v) return; set(v); save(); paint(); } }, text))));
    const ddType = part => el('label', { class: 'lab-f' },
      el('span', { class: 'k' }, 'Drawdown type'),
      el('select', { class: 'field lab-select', 'aria-label': 'Drawdown type',
        onChange: e => { part.ddType = e.target.value; save(); paint(); } },
        ...L.DD_TYPES.map(([v, label, why]) => el('option', { value: v, selected: part.ddType === v, title: why }, label))));
    const card = (title, ...kids) => el('section', { class: 'card lab-rcard' }, el('h2', {}, title),
      el('div', { class: 'lab-grid' }, ...kids.flat().filter(Boolean)));

    const picker = el('div', { class: 'lab-firms' },
      state.firms.length
        ? el('select', { class: 'field lab-select', 'aria-label': 'Firm',
            onChange: e => { state.firmId = e.target.value; save(); paint(); } },
            ...state.firms.map(f => el('option', { value: f.id, selected: f.id === sheet?.id }, f.name || 'Untitled')))
        : null,
      el('button', { type: 'button', class: 'btn btn-quiet lab-new', onClick: () => {
        const f = L.blankSheet(`Firm ${state.firms.length + 1}`);
        state.firms.push(f); state.firmId = f.id; save(); paint();
        requestAnimationFrame(() => bodyEl.querySelector('.lab-name')?.select());
      } }, icon('plus', 12, 'var(--ink-2)', 2.2), state.firms.length ? 'New firm' : 'Add a firm'),
      sheet ? confirmButton({
        label: 'Delete', armedLabel: 'Confirm delete',
        className: 'btn btn-quiet lab-del', armedClassName: 'btn btn-quiet lab-del is-armed',
        onConfirm: () => {
          state.firms = state.firms.filter(f => f.id !== sheet.id);
          state.firmId = state.firms[0]?.id || null;
          save(); paint(); toast(`Deleted ${sheet.name}`);
        } }) : null);

    if (!sheet) {
      bodyEl.replaceChildren(el('section', { class: 'card lab-rcard lab-first' },
        el('h2', {}, 'Your first firm'),
        el('p', { class: 'lab-quiet' }, 'Every rule is typed in by you. Nothing is filled in: firms change their terms, and a guessed number looks just as right as a real one.'),
        picker));
      paintStatus();
      return;
    }
    const e = sheet.eval, f = sheet.funded;
    const trailing = t => t !== 'static';

    bodyEl.replaceChildren(
      el('div', { class: 'lab-rtop' }, picker,
        el('label', { class: 'lab-f lab-namef' }, el('span', { class: 'k' }, 'Name'),
          el('input', { class: 'lab-in lab-name', value: sheet.name || '', 'aria-label': 'Firm name',
            onChange: ev => { sheet.name = ev.target.value.trim() || 'Untitled'; save(); paint(); },
            onKeydown: ev => { if (ev.key === 'Enter') ev.target.blur(); } }))),
      /* Three columns, grouped by what they are about: the account and your
         own plan, then the evaluation, then everything after it. */
      el('div', { class: 'lab-rgrid' },
        el('div', { class: 'lab-rcol' },
        card('Account',
          field('Account size', () => sheet.size, v => { sheet.size = v; }, { unit: '$', required: true, placeholder: '100,000', hint: v => (v ? k$(v) : '') }),
          field('Evaluation fee', () => sheet.fee, v => { sheet.fee = v; }, { unit: '$', required: true, placeholder: '0 if free' }),
          field('Activation fee', () => sheet.activation, v => { sheet.activation = v; }, { unit: '$', placeholder: 'none' }),
          el('div', { class: 'lab-f lab-tg' }, toggle('Fee refunded with first payout', () => sheet.refund, v => { sheet.refund = v; }))),
        card('Your plan',
          field('Risk · evaluation', () => p.riskEval, v => { p.riskEval = v; }, { unit: '%', placeholder: String(acct.defaultRiskPercent ?? 1), hint: pct$ }),
          field('Risk · funded', () => p.riskFunded, v => { p.riskFunded = v; }, { unit: '%', placeholder: String(acct.defaultRiskPercent ?? 1), hint: pct$ }),
          field('Funded for', () => p.months, v => { p.months = v; }, { unit: 'months', placeholder: '6' }))),
        el('div', { class: 'lab-rcol' },
        card('Evaluation',
          seg('Steps', [[1, '1-step'], [2, '2-step']], () => sheet.steps, v => { sheet.steps = v; }),
          field(sheet.steps === 2 ? 'Step 1 target' : 'Profit target', () => sheet.target1, v => { sheet.target1 = v; }, { unit: '%', required: true, hint: pct$ }),
          sheet.steps === 2 ? field('Step 2 target', () => sheet.target2, v => { sheet.target2 = v; }, { unit: '%', required: true, hint: pct$ }) : null,
          field('Max drawdown', () => e.dd, v => { e.dd = v; }, { unit: '%', required: true, hint: pct$ }),
          ddType(e),
          trailing(e.ddType) ? el('div', { class: 'lab-f lab-tg' }, toggle('Trailing stops at starting balance', () => e.lock, v => { e.lock = v; })) : null,
          field('Daily loss limit', () => e.daily, v => { e.daily = v; }, { unit: '%', placeholder: 'none', hint: pct$ }),
          e.daily != null ? seg('When hit', [['fail', 'Fails'], ['stop', 'Ends day']], () => e.dailyMode, v => { e.dailyMode = v; }) : null,
          field('Min trading days', () => e.minDays, v => { e.minDays = v; }, { placeholder: 'none' }),
          field('Best day ≤', () => e.best, v => { e.best = v; }, { unit: '% of profit', placeholder: 'no rule' }),
          field('Time limit', () => e.limitDays, v => { e.limitDays = v; }, { unit: 'days', placeholder: 'none' }))),
        el('div', { class: 'lab-rcol' },
        card('Funded',
          field('Max drawdown', () => f.dd, v => { f.dd = v; }, { unit: '%', required: true, hint: pct$ }),
          ddType(f),
          trailing(f.ddType) ? el('div', { class: 'lab-f lab-tg' }, toggle('Trailing stops at starting balance', () => f.lock, v => { f.lock = v; })) : null,
          field('Daily loss limit', () => f.daily, v => { f.daily = v; }, { unit: '%', placeholder: 'none', hint: pct$ }),
          f.daily != null ? seg('When hit', [['fail', 'Fails'], ['stop', 'Ends day']], () => f.dailyMode, v => { f.dailyMode = v; }) : null),
        card('Payouts',
          field('Profit split', () => f.split, v => { f.split = v; }, { unit: '%', required: true, placeholder: '80' }),
          field('First payout after', () => f.firstDays, v => { f.firstDays = v; }, { unit: 'days', placeholder: 'any day' }),
          field('Then every', () => f.everyDays, v => { f.everyDays = v; }, { unit: 'days', placeholder: '14' }),
          field('Minimum payout', () => f.minPayout, v => { f.minPayout = v; }, { unit: '$', placeholder: 'none' }),
          field('Payout cap', () => f.cap, v => { f.cap = v; }, { unit: '$', placeholder: 'none' }),
          field('Best day ≤', () => f.best, v => { f.best = v; }, { unit: '% of cycle', placeholder: 'no rule' }),
          field('Leave in account', () => f.buffer, v => { f.buffer = v; }, { unit: '$', placeholder: '0' }),
          trailing(f.ddType) && f.lock
            ? el('div', { class: 'lab-f lab-tg' }, toggle('Pay only once the floor reaches the start', () => f.needLock, v => { f.needLock = v; }))
            : null))));
    paintStatus();
  }

  paint();
  return el('div', { class: 'view lab-view' }, head, el('div', { class: 'lab-rscroll' }, bodyEl));
}
