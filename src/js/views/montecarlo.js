/* ============================================================
   The Lab · Monte Carlo — your next trades, played out four thousand times.

   One page that reads from the top down. Three settings, then the answer in
   five figures. Scroll and each figure opens up: the spread of where you
   finish, how deep the drawdowns go, how long the losing runs are, and —
   last — how much to risk a trade so the drawdown you can live with stays
   unlikely.

   The engine is mc.js. Everything is worked out in R and only scaled by the
   risk you set, so moving the risk redraws instantly without a new run.
   ============================================================ */
import { el, svg, icon, fitted } from '../ui.js';
import * as c from '../calc.js';
import * as M from '../mc.js';
import { ticks, hoverLayer, readRow, tipLayer } from './chartkit.js';

let cache = null;                       // { sig, sim } — one run per trades + horizon

const pc = (v, d = 1) => (v == null || !isFinite(v) ? '—' : `${v > 0.0005 ? '+' : v < -0.0005 ? '−' : ''}${Math.abs(v).toFixed(d)}%`);
const odds = p => (p == null ? '—' : p < 0.001 ? '< 0.1%' : p > 0.999 ? '> 99.9%' : c.pct(p, p < 0.1 ? 1 : 0));
const oneIn = p => (p > 0 && p < 0.5 ? `about 1 in ${Math.round(1 / p)}` : null);

export function mcPage(ctx) {
  const { acct, state, save, pick, nav } = ctx;
  const S = state.mc;
  const risk = Number(S.risk ?? acct.defaultRiskPercent ?? 1) || 1;
  const limit = Number(S.ddLimit) || 10;
  const H = S.horizon || 100;
  const set = async (k, v) => { S[k] = v; await save(); nav.refresh(); };

  const rs = [];
  let skipped = 0;
  for (const t of pick()) {
    if (t.status === 'open') continue;
    const r = c.rMultiple(acct, t);
    if (r == null || !isFinite(r)) { skipped++; continue; }
    rs.push(r);
  }
  const D = M.describe(rs);

  const strip = el('div', { class: 'lab-strip' }, ...[
    el('span', { class: 'i' }, el('b', {}, String(D.n)), 'trades'),
    el('span', { class: 'i' }, el('b', {}, D.mean == null ? '—' : c.rFmt(D.mean)),
      D.se != null ? el('span', { class: 'pm', title: 'Your true edge, 95% of the time, on this many trades' }, `± ${(1.96 * D.se).toFixed(2)}`) : null, 'a trade'),
    el('span', { class: 'i' }, el('b', {}, D.winRate == null ? '—' : c.pct(D.winRate, 0)), 'won'),
    el('span', { class: 'i' }, el('b', {}, D.avgWin == null ? '—' : c.rFmt(D.avgWin, 2)), 'avg win'),
    el('span', { class: 'i' }, el('b', {}, D.avgLoss == null ? '—' : c.rFmt(-D.avgLoss, 2)), 'avg loss'),
    skipped ? el('span', { class: 'i is-warn', title: 'Live trades with no risk set have no R' }, `${skipped} left out`) : null,
  ].filter(Boolean));

  /* ---------- the three settings ---------- */
  const stepper = (val, onDown, onUp, label) => el('div', { class: 'stepper mc-step', 'aria-label': label },
    el('button', { onClick: onDown, 'aria-label': 'Less' }, icon('minus', 11, 'var(--grey-2)', 2.6)),
    el('span', { class: 'val' }, val),
    el('button', { onClick: onUp, 'aria-label': 'More' }, icon('plus', 11, 'var(--grey-2)', 2.6)));
  const rStep = v => (v < 0.5 ? 0.05 : v < 2 ? 0.25 : 0.5);
  const round2 = v => Math.round(v * 100) / 100;
  const controls = el('div', { class: 'mc-controls' },
    el('label', { class: 'mc-ctl' }, el('span', {}, 'Risk a trade'),
      stepper(`${risk.toFixed(2)}%`,
        () => set('risk', Math.max(0.05, round2(risk - rStep(risk - 0.001)))),
        () => set('risk', Math.min(10, round2(risk + rStep(risk)))), 'Risk a trade')),
    el('label', { class: 'mc-ctl' }, el('span', {}, 'Trades ahead'),
      el('div', { class: 'seg' }, ...M.HORIZONS.map(h => el('button', { class: h === H ? 'is-on' : '',
        onClick: () => { if (h !== H) set('horizon', h); } }, String(h))))),
    el('label', { class: 'mc-ctl' }, el('span', {}, 'Drawdown you’d accept'),
      stepper(`${limit}%`, () => set('ddLimit', Math.max(1, limit - (limit > 10 ? 5 : 1))),
        () => set('ddLimit', Math.min(50, limit + (limit >= 10 ? 5 : 1))), 'Drawdown you would accept')));

  const head = ctx.head('mc');
  const body = el('div', { class: 'lab-body mc-body' });

  if (D.n < M.MIN_TRADES) {
    body.append(el('section', { class: 'card lab-prompt' },
      icon('lab', 28, 'var(--grey-6)', 1.4),
      el('h2', {}, 'Not enough trades yet'),
      el('p', {}, `At least ${M.MIN_TRADES} trades with a risk set — there ${D.n === 1 ? 'is' : 'are'} ${D.n}.`)));
    return el('div', { class: 'view lab-view' }, head, strip, controls, body);
  }

  const sig = JSON.stringify([acct.id, state.source, H, rs.length, rs.reduce((a, b) => a + b, 0).toFixed(6)]);
  if (!cache || cache.sig !== sig) cache = { sig, sim: M.simulate(rs, { horizon: H, samples: 24 }) };
  const sim = cache.sim;

  body.append(...answer(sim, rs, D, { risk, limit, H, acct, set }));
  /* The settings stay put above the page while it scrolls under them. */
  return el('div', { class: 'view lab-view' }, head, strip, controls, body);
}

/* ============================================================
   The answer, from the headline down
   ============================================================ */
function answer(sim, rs, D, o) {
  const { risk, limit, H, acct } = o;
  const P = (arr, q) => M.pctile(arr, q);
  const fin = q => P(sim.finals, q) * risk;
  const dd = q => P(sim.dds, q) * risk;
  const hit = M.chanceOfLimit(sim.dds, risk, limit);
  const pProfit = sim.finals.filter(x => x > 0).length / sim.runs;
  const L50 = P(sim.longL, .5), L95 = P(sim.longL, .95);

  const tile = (k, v, s, cls = '', title = '') => el('div', { class: 'lab-tile' + cls, title },
    el('span', { class: 'k' }, k), el('span', { class: 'v' }, v), el('span', { class: 's' }, s || ' '));
  const tiles = el('div', { class: 'lab-tiles mc-tiles' },
    tile('Median result', pc(fin(.5)), `90% between ${pc(fin(.05), 0)} and ${pc(fin(.95), 0)}`,
      ' is-hero' + (fin(.5) > 0 ? ' is-pos' : fin(.5) < 0 ? ' is-neg' : ''),
      `After ${H} trades at ${risk}% a trade. Half of the runs finished above this, half below.`),
    tile('Chance of profit', c.pct(pProfit, 0), `after ${H} trades`),
    tile('Typical drawdown', pc(-dd(.5)), `1 in 20 runs: ${pc(-dd(.95))}`, '', 'The deepest fall from a high along the way, in the middle run'),
    tile(`Reach −${limit}%`, odds(hit), oneIn(hit) || `within ${H} trades`, hit <= 0.05 ? ' is-ok' : ' is-bad',
      `How many runs fall ${limit}% from a high at some point`),
    tile('Losing streak', `${L50} in a row`, `1 in 20 runs: ${L95}`, '', 'The longest run of losses in a typical run'));

  return [
    tiles,
    fanCard(sim, o),
    el('div', { class: 'lab-pair mc-pair' }, finishCard(sim, o), ddCard(sim, o)),
    streakCard(sim, o),
    riskCard(sim, rs, D, o),
    el('p', { class: 'lab-note mc-note' },
      `${sim.runs.toLocaleString('en-US')} runs, each from a resample of your ${sim.n} trades, so your edge is uncertain too · risk is a share of the starting balance, not compounded`),
  ];
}

/* ---------- the next trades, as a fan ---------- */
function fanCard(sim, o) {
  return el('section', { class: 'card lab-chart mc-fan' },
    el('div', { class: 'lab-chart-head' },
      el('h2', {}, `The next ${o.H} trades`),
      el('span', { class: 'lab-sub' }, `at ${o.risk}% a trade`),
      el('span', { class: 'lab-legend' }, el('i', { class: 'mc-k-med' }), 'median', el('i', { class: 'mc-k-50' }), 'half of runs', el('i', { class: 'mc-k-90' }), '9 in 10')),
    fitted((w, h) => drawFan(sim, o, w, h), 300));
}

function drawFan(sim, o, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const k = o.risk;
  const F = sim.fan;
  const plot = { l: 52, r: W - 14, t: 12, b: H - 24 };
  let lo = 0, hi = 0;
  for (const f of F) { lo = Math.min(lo, f.p5 * k); hi = Math.max(hi, f.p95 * k); }
  for (const p of sim.few) for (const v of p) { lo = Math.min(lo, v * k); hi = Math.max(hi, v * k); }
  const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const X = t => plot.l + (t / sim.horizon) * (plot.r - plot.l);
  const Y = v => plot.b - ((v - lo) / (hi - lo)) * (plot.b - plot.t);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  for (const v of ticks(lo, hi, 5)) {
    g.append(svg('line', { class: Math.abs(v) < 1e-9 ? 'lab-zero' : 'lab-grid', x1: plot.l, x2: plot.r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: plot.l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, pc(v, Math.abs(v) < 10 && v % 1 ? 1 : 0)));
  }
  for (const t of ticks(0, sim.horizon, 6)) g.append(svg('text', { class: 'lab-tick', x: X(t), y: plot.b + 16, 'text-anchor': 'middle' }, t === 0 ? 'now' : String(t)));
  /* Forty single futures behind the bands, faint — what one run actually looks like. */
  const step = Math.max(1, Math.ceil(sim.horizon / 160));
  for (const p of sim.few) {
    let d = '';
    for (let t = 0; t < p.length; t += step) d += (t ? 'L' : 'M') + X(t).toFixed(1) + ',' + Y(p[t] * k).toFixed(1);
    g.append(svg('path', { class: 'mc-path', d }));
  }
  const band = (a, b, cls) => {
    const top = F.map(f => `${X(f.t).toFixed(1)},${Y(f[b] * k).toFixed(1)}`);
    const bot = F.map(f => `${X(f.t).toFixed(1)},${Y(f[a] * k).toFixed(1)}`).reverse();
    g.append(svg('path', { class: cls + ' line-area', d: 'M' + top.join('L') + 'L' + bot.join('L') + 'Z' }));
  };
  band('p5', 'p95', 'mc-band90');
  band('p25', 'p75', 'mc-band50');
  g.append(svg('path', { class: 'mc-median line-draw', pathLength: 1, d: 'M' + F.map(f => `${X(f.t).toFixed(1)},${Y(f.p50 * k).toFixed(1)}`).join('L') }));
  const end = F[F.length - 1];
  g.append(svg('circle', { class: 'mc-end line-tip', cx: X(end.t), cy: Y(end.p50 * k), r: 4 }));

  hoverLayer(wrap, g, plot, x => {
    const t = Math.round(((x - plot.l) / (plot.r - plot.l)) * sim.horizon);
    let f = F[0];
    for (const q of F) if (Math.abs(q.t - t) < Math.abs(f.t - t)) f = q;
    return { x: X(f.t), y: Y(f.p50 * k), rows: [
      el('div', { class: 'h' }, f.t === 0 ? 'Now' : `After ${f.t} trades`),
      readRow('mc-k-90', pc(f.p95 * k), 'best 1 in 20'),
      readRow('mc-k-med', pc(f.p50 * k), 'median'),
      readRow('mc-k-90', pc(f.p5 * k), 'worst 1 in 20')] };
  });
  wrap.prepend(g);
  return wrap;
}

/* ---------- a histogram of a sorted list, scaled by risk ---------- */
function histogram(sorted, scale, { W, H, marks = [], limit = null, signNeg = false, tone }) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const tip = tipLayer(wrap);
  /* Ascending, in % of the account. A drawdown is drawn as the negative it is. */
  const vals = signNeg ? sorted.map(v => -v * scale).reverse() : sorted.map(v => v * scale);
  const lo0 = M.pctile(vals, .002), hi0 = M.pctile(vals, .998);
  let lo = Math.min(lo0, limit ?? lo0), hi = signNeg ? 0 : hi0;
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const N = 36, bw = (hi - lo) / N;
  const bins = new Array(N).fill(0);
  for (const v of vals) { const i = Math.min(N - 1, Math.max(0, Math.floor((v - lo) / bw))); bins[i]++; }
  const plot = { l: 10, r: W - 10, t: 26, b: H - 22 };
  const X = v => plot.l + ((v - lo) / (hi - lo)) * (plot.r - plot.l);
  const top = Math.max(...bins);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  g.append(svg('line', { class: 'lab-zero', x1: plot.l, x2: plot.r, y1: plot.b, y2: plot.b }));
  for (const v of ticks(lo, hi, 5)) g.append(svg('text', { class: 'lab-tick', x: X(v), y: plot.b + 16, 'text-anchor': 'middle' }, pc(v, 0)));
  const slot = (plot.r - plot.l) / N;
  bins.forEach((n, i) => {
    const a = lo + i * bw, b = a + bw, mid = (a + b) / 2;
    const h = n ? Math.max(1.5, (n / top) * (plot.b - plot.t)) : 0;
    const cls = tone(mid);
    if (h) g.append(svg('rect', { class: 'col-fill-svg mc-bin ' + cls, x: plot.l + i * slot + 1, y: plot.b - h, width: Math.max(1, slot - 2), height: h, rx: 1.5 }));
    const hit = svg('rect', { class: 'an-hit', x: plot.l + i * slot, y: plot.t, width: slot, height: plot.b - plot.t, fill: 'transparent' });
    hit.addEventListener('pointerenter', () => tip.show(plot.l + i * slot + slot / 2, plot.t + 30, [
      el('div', { class: 'h' }, `${pc(a)} to ${pc(b)}`),
      el('div', { class: 'r' }, el('b', {}, c.pct(n / vals.length, 1)), el('span', {}, 'of runs'))]));
    hit.addEventListener('pointerleave', () => tip.hide());
    g.append(hit);
  });
  for (const [label, v, cls] of marks) {
    if (v == null || v < lo || v > hi) continue;
    g.append(svg('line', { class: 'lab-mark ' + (cls || ''), x1: X(v), x2: X(v), y1: plot.t - 4, y2: plot.b }));
    g.append(svg('text', { class: 'lab-mark-lbl ' + (cls || ''), x: X(v), y: plot.t - 9, 'text-anchor': 'middle' }, label));
  }
  if (limit != null && limit >= lo) {
    g.append(svg('line', { class: 'mc-limit', x1: X(limit), x2: X(limit), y1: plot.t - 4, y2: plot.b }));
  }
  wrap.prepend(g);
  return wrap;
}

function finishCard(sim, o) {
  const k = o.risk;
  const q = p => M.pctile(sim.finals, p) * k;
  return el('section', { class: 'card lab-chart' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Where you finish'), el('span', { class: 'lab-sub' }, `after ${o.H} trades`)),
    fitted((w, h) => histogram(sim.finals, k, { W: w, H: h, tone: v => (v >= 0 ? 'is-pos' : 'is-neg'),
      marks: [[`5% ${pc(q(.05), 0)}`, q(.05)], [`median ${pc(q(.5), 1)}`, q(.5), 'is-med'], [`95% ${pc(q(.95), 0)}`, q(.95)]]
        .filter((m, i, all) => i === 1 || Math.abs(m[1] - all[1][1]) > (q(.95) - q(.05)) * 0.22) }), 200));
}

function ddCard(sim, o) {
  const k = o.risk;
  const q = p => -M.pctile(sim.dds, p) * k;
  const beyond = M.chanceOfLimit(sim.dds, k, o.limit);
  return el('section', { class: 'card lab-chart' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Deepest drawdown'),
      el('span', { class: 'lab-sub' }, 'in each run'),
      el('span', { class: 'lab-legend' }, el('i', { class: 'mc-k-limit' }), `your −${o.limit}% · ${odds(beyond)} of runs reach it`)),
    fitted((w, h) => histogram(sim.dds, k, { W: w, H: h, signNeg: true, limit: -o.limit,
      tone: v => (v <= -o.limit ? 'is-neg' : 'is-dim'),
      marks: [[`median ${pc(q(.5), 1)}`, q(.5), 'is-med'], [`1 in 20 ${pc(q(.95), 1)}`, q(.95)]] }), 200));
}

/* ---------- losing runs ---------- */
function streakCard(sim, o) {
  const k = o.risk;
  const rows = M.streakOdds(sim.longL).filter(x => x.k >= 2 && x.p >= 0.005).slice(0, 16);
  const toLimit = Math.floor(o.limit / k + 1e-9);
  const pLimit = M.shareAtLeast(sim.longL, toLimit);
  const card = el('section', { class: 'card lab-chart mc-streaks' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Losing streaks'),
      el('span', { class: 'lab-sub' }, `chance of at least this many losses in a row, in ${o.H} trades`),
      el('span', { class: 'lab-legend' }, el('i', { class: 'mc-k-limit' }), `takes you past −${o.limit}%`)));
  const facts = el('div', { class: 'mc-facts' },
    fact(`${toLimit}`, `losses in a row take you to −${o.limit}% at ${k}% a trade`),
    fact(odds(pLimit), `chance of a run that long in the next ${o.H} trades`),
    fact(`${M.pctile(sim.longL, .5)} – ${M.pctile(sim.longL, .95)}`, 'longest losing run: typical, and 1 in 20'),
    fact(`${M.pctile(sim.longW, .5)}`, 'longest winning run, typical'));
  card.append(el('div', { class: 'mc-split' }, fitted((w, h) => drawStreaks(rows, k, toLimit, w, h), 190), facts));
  return card;
}
const fact = (v, k) => el('div', { class: 'mc-fact' }, el('b', {}, v), el('span', {}, k));

function drawStreaks(rows, k, toLimit, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const tip = tipLayer(wrap);
  const plot = { l: 6, r: W - 6, t: 22, b: H - 36 };
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const slot = (plot.r - plot.l) / Math.max(1, rows.length);
  const bw = Math.min(30, slot * 0.6);
  g.append(svg('line', { class: 'lab-zero', x1: plot.l, x2: plot.r, y1: plot.b, y2: plot.b }));
  rows.forEach((x, i) => {
    const cx = plot.l + slot * i + slot / 2;
    const h = Math.max(1.5, x.p * (plot.b - plot.t));
    const over = x.k >= toLimit;
    g.append(svg('rect', { class: 'col-fill-svg mc-bin ' + (over ? 'is-neg' : 'is-dim'), x: cx - bw / 2, y: plot.b - h, width: bw, height: h, rx: 3 }));
    if (slot >= 30 || i % 2 === 0) g.append(svg('text', { class: 'mc-val', x: cx, y: plot.b - h - 6, 'text-anchor': 'middle' }, c.pct(x.p, 0)));
    g.append(svg('text', { class: 'mc-k', x: cx, y: plot.b + 15, 'text-anchor': 'middle' }, String(x.k)));
    if (slot >= 34 || i % 2 === 0) g.append(svg('text', { class: 'lab-tick', x: cx, y: plot.b + 29, 'text-anchor': 'middle' }, pc(-x.k * k, x.k * k < 10 ? 1 : 0)));
    const hit = svg('rect', { class: 'an-hit', x: cx - slot / 2, y: plot.t - 16, width: slot, height: plot.b - plot.t + 46, fill: 'transparent' });
    hit.addEventListener('pointerenter', () => tip.show(cx, plot.t + 20, [
      el('div', { class: 'h' }, `${x.k} losses in a row`),
      el('div', { class: 'r' }, el('b', {}, odds(x.p)), el('span', {}, 'of runs see one')),
      el('div', { class: 'r' }, el('b', {}, pc(-x.k * k)), el('span', {}, 'if it happens'))]));
    hit.addEventListener('pointerleave', () => tip.hide());
    g.append(hit);
  });
  wrap.prepend(g);
  return wrap;
}

/* ---------- how much to risk ---------- */
function riskCard(sim, rs, D, o) {
  const { limit, risk, H, set } = o;
  /* Rounded down, never up: a suggestion shown as 0.40% must not be a hair over the line. */
  const down = v => (v == null ? null : Math.floor(v * 100 + 1e-9) / 100);
  const safe = down(M.riskFor(sim.dds, limit, 0.01));
  const sug = down(M.riskFor(sim.dds, limit, 0.05));
  const kel = M.kelly(rs);
  const r2 = v => Math.round(v * 100) / 100;
  const grid = [...new Set([0.25, 0.5, 0.75, 1, 1.5, 2, 3, r2(risk), sug ? r2(sug) : null].filter(v => v != null && v > 0))].sort((a, b) => a - b);
  const row = r => {
    const p = M.chanceOfLimit(sim.dds, r, limit);
    const isSug = sug && r === r2(sug), isYou = r === r2(risk);
    return el('button', { class: 'mc-row' + (isSug ? ' is-sug' : '') + (isYou ? ' is-you' : ''), title: 'Use this risk',
        onClick: () => { if (!isYou) set('risk', r); } },
      el('span', { class: 'rk' }, `${r.toFixed(2)}%`, isSug ? el('i', {}, 'suggested') : isYou ? el('i', { class: 'you' }, 'yours') : null),
      el('span', { class: 'n ' + (M.pctile(sim.finals, .5) >= 0 ? 'is-pos' : 'is-neg') }, pc(M.pctile(sim.finals, .5) * r)),
      el('span', { class: 'n' }, pc(-M.pctile(sim.dds, .5) * r)),
      el('span', { class: 'n' }, pc(-M.pctile(sim.dds, .95) * r)),
      el('span', { class: 'n ' + (p <= 0.05 ? 'is-ok' : 'is-bad') }, odds(p)),
      el('span', { class: 'n' }, String(Math.floor(limit / r + 1e-9))));
  };
  const said = sug == null ? 'Your trades never drew down in any run — there is nothing to size against.'
    : `Risk ${sug.toFixed(2)}% a trade and a −${limit}% drawdown happens in about 1 run in 20 over the next ${H} trades.`;
  return el('section', { class: 'card lab-chart mc-risk' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'How much to risk'),
      el('span', { class: 'lab-sub' }, `to keep a −${limit}% drawdown unlikely`)),
    el('div', { class: 'mc-say' }, said),
    el('div', { class: 'mc-split is-wide' },
      el('div', { class: 'mc-riskl' },
        el('div', { class: 'mc-facts is-row' },
          fact(sug == null ? '—' : `${sug.toFixed(2)}%`, 'suggested · 1 in 20 reach the limit'),
          fact(safe == null ? '—' : `${safe.toFixed(2)}%`, 'careful · 1 in 100'),
          fact(kel == null ? '—' : kel === 0 ? '0%' : `${kel.toFixed(1)}%`, kel ? `Kelly ceiling · half is ${(kel / 2).toFixed(1)}%` : 'Kelly · no edge to size')),
        fitted((w, h) => drawRiskCurve(sim, o, sug, safe, w, h), 170)),
      el('div', { class: 'mc-table' },
        el('div', { class: 'mc-row is-head' }, el('span', {}, 'Risk'), el('span', {}, 'Median'), el('span', {}, 'Typical DD'),
          el('span', {}, '1 in 20 DD'), el('span', {}, `Reach −${limit}%`), el('span', {}, 'To limit')),
        ...grid.map(row))));
}

function drawRiskCurve(sim, o, sug, safe, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const xMax = Math.max(3, (sug || 1) * 2, o.risk * 1.3);
  const N = 90;
  const pts = [];
  for (let i = 1; i <= N; i++) { const r = (i / N) * xMax; pts.push([r, M.chanceOfLimit(sim.dds, r, o.limit)]); }
  const plot = { l: 40, r: W - 10, t: 12, b: H - 22 };
  const X = r => plot.l + (r / xMax) * (plot.r - plot.l);
  const Y = p => plot.b - p * (plot.b - plot.t);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  for (const p of [0, .25, .5, .75, 1]) {
    g.append(svg('line', { class: p === 0 ? 'lab-zero' : 'lab-grid', x1: plot.l, x2: plot.r, y1: Y(p), y2: Y(p) }));
    g.append(svg('text', { class: 'lab-tick', x: plot.l - 7, y: Y(p) + 3.5, 'text-anchor': 'end' }, `${p * 100}%`));
  }
  for (const r of ticks(0, xMax, 6)) g.append(svg('text', { class: 'lab-tick', x: X(r), y: plot.b + 16, 'text-anchor': 'middle' }, `${r}%`));
  g.append(svg('line', { class: 'mc-five', x1: plot.l, x2: plot.r, y1: Y(.05), y2: Y(.05) }));
  g.append(svg('path', { class: 'mc-curve line-draw', pathLength: 1, d: `M${X(0)},${Y(0)}` + pts.map(([r, p]) => `L${X(r).toFixed(1)},${Y(p).toFixed(1)}`).join('') }));
  const dot = (r, cls) => { if (r != null && r <= xMax) g.append(svg('circle', { class: 'mc-dot line-tip ' + cls, cx: X(r), cy: Y(M.chanceOfLimit(sim.dds, r, o.limit)), r: 4.5 })); };
  dot(safe, 'is-safe'); dot(sug, 'is-sug'); dot(o.risk, 'is-you');
  hoverLayer(wrap, g, plot, x => {
    const r = Math.max(0.01, ((x - plot.l) / (plot.r - plot.l)) * xMax);
    const p = M.chanceOfLimit(sim.dds, r, o.limit);
    return { x: X(r), y: Y(p), rows: [el('div', { class: 'h' }, `${r.toFixed(2)}% a trade`),
      readRow('mc-k-limit', odds(p), `reach −${o.limit}%`)] };
  });
  wrap.prepend(g);
  return wrap;
}
