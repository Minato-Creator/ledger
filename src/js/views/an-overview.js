/* ============================================================
   Analytics · Overview — the whole account on one screen.

   Six figures across the top, each with the shape that got it there. Under
   them the equity curve with its drawdown beneath it on the same x, where
   every trade is one step; the spread of results in R beside it; and then
   what earns — setups racing each other trade by trade, and each instrument
   with its own little curve.

   Everything here is a sum, a count or an order of trades you logged.
   ============================================================ */
import { el, svg, fitted } from '../ui.js';
import * as c from '../calc.js';
import { ticks, hoverLayer, tipLayer, spark, unitKit } from './chartkit.js';

const uid = () => Math.random().toString(36).slice(2, 8);

/** Your trades in the order taken, each with what it added and the running totals. */
export function sequence(acct, trades, K) {
  let eq = 0, peak = 0;
  return c.chronological(trades).map((t, i) => {
    const v = K.valueOf(t);
    eq += v;
    if (eq > peak) peak = eq;
    return { t, i, v, r: c.rMultiple(acct, t), o: c.outcome(t), eq, dd: eq - peak };
  });
}

/** The deepest fall from a high, and the high it fell from. */
export function deepest(rows) {
  let trough = -1, low = 0;
  rows.forEach((x, i) => { if (x.dd < low - 1e-9) { low = x.dd; trough = i; } });
  if (trough < 0) return null;
  let from = -1;                                  // -1 is the start of the account
  for (let i = trough - 1; i >= 0; i--) if (Math.abs(rows[i].dd) < 1e-9) { from = i; break; }
  return { amount: low, from, to: trough };
}

/** Longest runs of wins and of losses, trade by trade, and the run you are on. */
export function streaks(rows) {
  let bestW = 0, bestL = 0, run = 0, kind = null;
  for (const x of rows) {
    if (x.o === 'breakeven') continue;
    if (x.o === kind) run++; else { kind = x.o; run = 1; }
    if (kind === 'win') bestW = Math.max(bestW, run); else bestL = Math.max(bestL, run);
  }
  return { bestW, bestL, now: run, nowKind: kind };
}

export function overviewTab(store, acct, trades, s, ctx) {
  const K = unitKit(ctx.unit, acct);
  const rows = sequence(acct, trades, K);
  const f = (d, r, o) => c.fig(ctx.unit, acct, d, r, o);
  return el('div', { class: 'an-body' },
    tiles(rows, s, K, f),
    el('div', { class: 'an-row is-main' }, equityCard(rows, K, store), distCard(acct, rows, s, K)),
    el('div', { class: 'an-row is-low' }, setupsCard(store, rows, K), pairsCard(rows, K)));
}

/* ---------- the six figures ---------- */
function tile(k, v, sub, extra, cls = '') {
  return el('div', { class: 'lab-tile an-tile ' + cls },
    el('div', { class: 'k' }, k), el('div', { class: 'v' }, v), el('div', { class: 's' }, sub),
    el('div', { class: 'an-tile-sp' }, extra));
}

function tiles(rows, s, K, f) {
  const n = rows.length;
  const last = rows[n - 1];
  const days = new Set(rows.map(x => x.t.date)).size;
  const sign = v => v > 0 ? 'is-pos' : v < 0 ? 'is-neg' : '';

  /* Win rate over the last stretch of trades, so a change in form shows. */
  const w = Math.max(5, Math.min(20, Math.round(n / 5)));
  const rolling = [];
  for (let i = w - 1; i < n; i++) {
    let wins = 0, dec = 0;
    for (let j = i - w + 1; j <= i; j++) { if (rows[j].o === 'win') { wins++; dec++; } else if (rows[j].o === 'loss') dec++; }
    rolling.push(dec ? wins / dec : null);
  }
  const avgSoFar = rows.map(x => x.eq / (x.i + 1));
  let gw = 0, gl = 0;
  const pfSoFar = rows.map(x => { if (x.v > 0) gw += x.v; else gl -= x.v; return gl > 0 ? Math.min(6, gw / gl) : null; });
  const dd = deepest(rows);
  const st = streaks(rows);
  const pf = s.profitFactor;

  return el('div', { class: 'an-tiles' },
    tile('Net', f(s.net, s.netR, { decimals: 0 }), `${n} trade${n === 1 ? '' : 's'} · ${days} day${days === 1 ? '' : 's'}`,
      spark(rows.map(x => x.eq), { height: 28, cls: last && last.eq < 0 ? 'is-neg' : 'is-pos' }), 'is-hero ' + sign(s.net)),
    tile('Win rate', c.pct(s.winRate, 1), `${s.wins}W · ${s.losses}L${s.breakevens ? ` · ${s.breakevens}BE` : ''}`,
      n >= 8 ? spark(rolling, { height: 28, zero: false }) : null),
    tile('Expectancy', f(s.expectancy, s.expectancyR, { decimals: 0 }), 'per trade',
      spark(avgSoFar, { height: 28 }), sign(s.expectancy)),
    tile('Profit factor', pf == null ? '—' : isFinite(pf) ? pf.toFixed(2) : '∞',
      s.payoff == null ? 'payoff —' : `payoff ${s.payoff.toFixed(2)} : 1`,
      spark(pfSoFar, { height: 28, zero: false })),
    tile('Max drawdown', dd ? K.fmt(dd.amount) : K.fmt(0), last && last.dd < -1e-9 ? `now ${K.fmt(last.dd)}` : 'at a high',
      spark(rows.map(x => x.dd), { height: 28, cls: 'is-neg' }), dd ? 'is-neg' : ''),
    tile('Streaks', el('span', {}, el('span', { class: 'an-w' }, `${st.bestW}W`), el('span', { class: 'an-slash' }, ' / '),
        el('span', { class: 'an-l' }, `${st.bestL}L`)),
      st.nowKind ? `on ${st.now}${st.nowKind === 'win' ? 'W' : 'L'} now` : '—', tape(rows.slice(-40))));
}

/* The last forty trades as a strip: up for a win, down for a loss. */
function tape(rows) {
  const H = 28, n = rows.length;
  const g = svg('svg', { class: 'an-tape', viewBox: `0 0 ${Math.max(n, 1) * 4} ${H}`, preserveAspectRatio: 'none', width: '100%', height: H });
  rows.forEach((x, i) => {
    const up = x.o === 'win', be = x.o === 'breakeven';
    g.append(svg('rect', { class: be ? 'is-be' : up ? 'is-w' : 'is-l', x: i * 4 + 0.5, width: 3,
      y: be ? H / 2 - 1 : up ? 2 : H / 2 + 1, height: be ? 2 : H / 2 - 3 }));
  });
  return g;
}

/* ---------- equity, with the drawdown under it ---------- */
function equityCard(rows, K, store) {
  const hi = Math.max(0, ...rows.map(x => x.eq));
  const dd = deepest(rows);
  return el('section', { class: 'card lab-chart an-equity' },
    el('div', { class: 'lab-chart-head' },
      el('h2', {}, 'Equity'),
      el('span', { class: 'lab-sub' }, rows.length ? `${c.shortDate(rows[0].t.date)} → ${c.shortDate(rows[rows.length - 1].t.date)}` : ''),
      el('span', { class: 'an-head-figs' },
        el('span', {}, 'high ', el('b', {}, K.fmt(hi))),
        el('span', {}, 'max DD ', el('b', { class: dd ? 'is-neg' : '' }, dd ? K.fmt(dd.amount) : '—')))),
    fitted((w, h) => drawEquity(rows, K, store, w, h), 280));
}

function drawEquity(rows, K, store, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap an-eq' });
  const n = rows.length;
  const l = 56, r = W - 14, t = 10, b2 = H - 22;
  const split = Math.round(t + (b2 - t) * 0.72);
  const b = split - 10, t2 = split + 12;
  const X = i => l + ((i + 1) / n) * (r - l);          // index −1 is the start, at zero

  let lo = 0, hi = 0;
  for (const x of rows) { lo = Math.min(lo, x.eq); hi = Math.max(hi, x.eq); }
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const Y = v => b - ((v - lo) / (hi - lo)) * (b - t);
  const ddLo = Math.min(-1e-9, ...rows.map(x => x.dd)) * 1.12;
  const Y2 = v => t2 + (v / ddLo) * (b2 - t2);

  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const id = uid(), y0 = Y(0);
  g.append(svg('defs', {},
    svg('linearGradient', { id: 'gp' + id, gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: t, y2: y0 },
      svg('stop', { offset: 0, class: 'an-stop-pos', 'stop-opacity': .28 }), svg('stop', { offset: 1, class: 'an-stop-pos', 'stop-opacity': .02 })),
    svg('linearGradient', { id: 'gn' + id, gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: b, y2: y0 },
      svg('stop', { offset: 0, class: 'an-stop-neg', 'stop-opacity': .28 }), svg('stop', { offset: 1, class: 'an-stop-neg', 'stop-opacity': .02 })),
    svg('clipPath', { id: 'up' + id }, svg('rect', { x: l - 4, y: t - 6, width: r - l + 8, height: Math.max(0, y0 - t + 6) })),
    svg('clipPath', { id: 'dn' + id }, svg('rect', { x: l - 4, y: y0, width: r - l + 8, height: Math.max(0, b - y0 + 6) }))));

  for (const v of ticks(lo, hi, 4)) {
    g.append(svg('line', { class: Math.abs(v) < 1e-9 ? 'lab-zero' : 'lab-grid', x1: l, x2: r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, K.axis(v)));
  }

  /* The deepest fall, as a band behind the curve. */
  const dd = deepest(rows);
  if (dd) {
    const x1 = dd.from < 0 ? l : X(dd.from), x2 = X(dd.to);
    g.append(svg('rect', { class: 'an-ddband', x: x1, y: t, width: Math.max(2, x2 - x1), height: b2 - t }));
  }

  /* Dates: the first trade of a few evenly spaced points, never the same day twice. */
  const want = Math.max(2, Math.min(7, Math.floor((r - l) / 110)));
  let lastLbl = '';
  for (let k = 0; k < want; k++) {
    const i = Math.round((k / (want - 1)) * (n - 1));
    const lbl = c.shortDate(rows[i].t.date);
    if (lbl === lastLbl) continue;
    lastLbl = lbl;
    g.append(svg('text', { class: 'lab-tick', x: X(i), y: H - 6, 'text-anchor': k === 0 ? 'start' : k === want - 1 ? 'end' : 'middle' }, lbl));
  }

  const pts = rows.map(x => `L${X(x.i).toFixed(1)},${Y(x.eq).toFixed(1)}`).join('');
  const line = `M${l},${y0.toFixed(1)}` + pts;
  const area = line + `L${r},${y0.toFixed(1)}Z`;
  g.append(svg('path', { class: 'line-area', d: area, fill: `url(#gp${id})`, 'clip-path': `url(#up${id})` }));
  g.append(svg('path', { class: 'line-area', d: area, fill: `url(#gn${id})`, 'clip-path': `url(#dn${id})` }));
  g.append(svg('path', { class: 'an-line is-pos line-draw', d: line, pathLength: 1, 'clip-path': `url(#up${id})` }));
  g.append(svg('path', { class: 'an-line is-neg line-draw', d: line, pathLength: 1, 'clip-path': `url(#dn${id})` }));

  /* The high, marked where it was made. */
  let hiI = -1;
  rows.forEach((x, i) => { if (x.eq > 1e-9 && (hiI < 0 || x.eq > rows[hiI].eq)) hiI = i; });
  if (hiI >= 0) g.append(svg('circle', { class: 'an-high line-tip', cx: X(hiI), cy: Y(rows[hiI].eq), r: 3.5 }));
  const end = rows[n - 1];
  g.append(svg('circle', { class: 'an-end line-tip ' + (end.eq < 0 ? 'is-neg' : 'is-pos'), cx: X(n - 1), cy: Y(end.eq), r: 4 }));

  /* Underwater: how far below the last high, every trade. */
  g.append(svg('line', { class: 'lab-zero', x1: l, x2: r, y1: t2, y2: t2 }));
  if (ddLo < -1e-6 && dd) {
    g.append(svg('line', { class: 'lab-grid', x1: l, x2: r, y1: Y2(dd.amount), y2: Y2(dd.amount) }));
    g.append(svg('text', { class: 'lab-tick', x: l - 8, y: Y2(dd.amount) + 3.5, 'text-anchor': 'end' }, K.axis(dd.amount)));
  }
  g.append(svg('text', { class: 'lab-level-lbl', x: r, y: t2 - 5, 'text-anchor': 'end' }, 'drawdown'));
  const under = `M${l},${t2}` + rows.map(x => `L${X(x.i).toFixed(1)},${Y2(x.dd).toFixed(1)}`).join('') + `L${r},${t2}Z`;
  g.append(svg('path', { class: 'an-under line-area', d: under }));

  const setupName = id => store.playbook.setups.find(x => x.id === id)?.name;
  hoverLayer(wrap, g, { l, r, t, b: b2 }, x => {
    const i = Math.max(0, Math.min(n - 1, Math.round(((x - l) / (r - l)) * n) - 1));
    const p = rows[i];
    const what = [p.t.pair, setupName(p.t.setupId)].filter(Boolean).join(' · ') || 'this trade';
    return { x: X(i), y: Y(p.eq), rows: [
      el('div', { class: 'h' }, `${c.shortDate(p.t.date)}${p.t.timeOpen ? ' ' + p.t.timeOpen : ''} · trade ${i + 1}`),
      el('div', { class: 'r' }, el('i', { class: p.eq < 0 ? 'is-fail' : 'is-pass' }), el('b', {}, K.fmt(p.eq)), el('span', {}, 'equity')),
      el('div', { class: 'r' }, el('i', { class: 'is-fail' }), el('b', {}, p.dd < -1e-9 ? K.fmt(p.dd) : 'at high'), el('span', {}, 'drawdown')),
      el('div', { class: 'r' }, el('i', { class: p.v > 0 ? 'is-pass' : p.v < 0 ? 'is-fail' : 'is-going' }), el('b', {}, K.fmt(p.v)), el('span', {}, what))] };
  });
  wrap.prepend(g);
  return wrap;
}

/* ---------- the spread of results, in R ---------- */
export function rBins(rs) {
  if (!rs.length) return null;
  const mn = Math.min(...rs), mx = Math.max(...rs);
  const span = mx - mn;
  const w = span <= 4 ? 0.25 : span <= 8 ? 0.5 : 1;
  const kLo = Math.round(Math.max(mn, -5) / w), kHi = Math.round(Math.min(mx, 10) / w);
  const bins = [];
  for (let k = kLo; k <= kHi; k++) bins.push({ k, mid: k * w, count: 0, sum: 0 });
  return { w, bins, place: r => bins[Math.max(0, Math.min(bins.length - 1, Math.round(r / w) - kLo))] };
}

function distCard(acct, rows, s, K) {
  const withR = rows.filter(x => x.r != null && isFinite(x.r));
  const card = el('section', { class: 'card lab-chart an-dist' },
    el('div', { class: 'lab-chart-head' },
      el('h2', {}, 'R distribution'),
      el('span', { class: 'lab-sub' }, `${withR.length} trade${withR.length === 1 ? '' : 's'}`)),
    withR.length >= 3 ? el('div', { class: 'an-marks' },
      el('span', {}, el('i', { class: 'is-avg' }), 'avg loss ', el('b', {}, s.avgLossR == null ? '—' : c.rFmt(-s.avgLossR, 1))),
      el('span', {}, el('i', { class: 'is-exp' }), 'expectancy ', el('b', {}, c.rFmt(s.avgR, 2))),
      el('span', {}, el('i', { class: 'is-avg' }), 'avg win ', el('b', {}, s.avgWinR == null ? '—' : c.rFmt(s.avgWinR, 1)))) : null);
  if (withR.length < 3) {
    card.append(el('p', { class: 'lab-empty' }, 'Needs a risk % on at least three trades.'));
    return card;
  }
  card.append(fitted((w, h) => drawDist(withR, s, K, w, h), 200));
  return card;
}

function drawDist(rows, s, K, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const B = rBins(rows.map(x => x.r));
  for (const x of rows) { const bin = B.place(x.r); bin.count++; bin.sum += x.v; }
  const nb = B.bins.length;
  const l = 30, r = W - 10, t = 8, b = H - 22;
  const slot = (r - l) / nb;
  const bw = Math.max(2, Math.min(30, slot - 2));
  const X = v => l + ((v - B.bins[0].mid) / B.w + 0.5) * slot;
  const peak = Math.max(1, ...B.bins.map(x => x.count));
  const Y = v => b - (v / peak) * (b - t);

  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  for (const v of ticks(0, peak, 3)) {
    if (v !== Math.round(v)) continue;
    g.append(svg('line', { class: v === 0 ? 'lab-zero' : 'lab-grid', x1: l, x2: r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: l - 7, y: Y(v) + 3.5, 'text-anchor': 'end' }, String(v)));
  }
  /* A label on each whole R, thinned until they cannot touch. */
  const every = Math.max(1, Math.ceil(34 / (slot / B.w)));
  for (let v = Math.ceil(B.bins[0].mid); v <= B.bins[nb - 1].mid + 1e-9; v++) {
    if (v % every) continue;
    g.append(svg('text', { class: 'lab-tick', x: X(v), y: H - 6, 'text-anchor': 'middle' }, v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v)}R`));
  }

  const tip = tipLayer(wrap);
  for (const bin of B.bins) {
    const cx = X(bin.mid);
    const h = bin.count ? Math.max(2, b - Y(bin.count)) : 0;
    if (h) g.append(svg('rect', { class: 'col-fill-svg an-bin ' + (bin.mid > 1e-9 ? 'is-pos' : bin.mid < -1e-9 ? 'is-neg' : 'is-flat'),
      x: cx - bw / 2, y: b - h, width: bw, height: h, rx: Math.min(3, bw / 2) }));
    const hit = svg('rect', { class: 'an-hit', x: cx - slot / 2, y: t, width: slot, height: b - t, fill: 'transparent' });
    const lo = bin.mid - B.w / 2, hiE = bin.mid + B.w / 2;
    const rr = v => `${v > 1e-9 ? '+' : v < -1e-9 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
    hit.addEventListener('pointerenter', () => tip.show(cx, t + (b - t) / 2, [
      el('div', { class: 'h' }, `${rr(lo)} to ${rr(hiE)}R`),
      el('div', { class: 'r' }, el('b', {}, String(bin.count)), el('span', {}, `trade${bin.count === 1 ? '' : 's'} · ${c.pct(bin.count / rows.length, 0)}`)),
      bin.count ? el('div', { class: 'r' }, el('b', {}, K.fmt(bin.sum)), el('span', {}, 'between them')) : null].filter(Boolean)));
    hit.addEventListener('pointerleave', () => tip.hide());
    g.append(hit);
  }

  /* Where the averages fall, over the bars. */
  const mark = (v, cls) => {
    if (v == null || !isFinite(v)) return;
    const x = Math.max(l, Math.min(r, X(v)));
    g.append(svg('line', { class: 'an-mark ' + cls, x1: x, x2: x, y1: t - 4, y2: b }));
  };
  mark(s.avgLossR == null ? null : -s.avgLossR, 'is-avg');
  mark(s.avgWinR, 'is-avg');
  mark(s.avgR, 'is-exp');
  wrap.prepend(g);
  return wrap;
}

/* ---------- setups, racing ---------- */
function groupsBy(rows, keyFn) {
  const map = new Map();
  for (const x of rows) {
    const k = keyFn(x);
    const gr = map.get(k) || { key: k, rows: [], net: 0, wins: 0, losses: 0 };
    gr.rows.push(x); gr.net += x.v;
    if (x.o === 'win') gr.wins++; else if (x.o === 'loss') gr.losses++;
    map.set(k, gr);
  }
  return [...map.values()];
}
const rate = gr => (gr.wins + gr.losses ? gr.wins / (gr.wins + gr.losses) : null);

function setupsCard(store, rows, K) {
  const pb = store.playbook;
  let groups = groupsBy(rows, x => x.t.setupId || '_none').map(gr => {
    const sp = pb.setups.find(x => x.id === gr.key);
    return { ...gr, name: sp?.name || 'No setup', color: sp?.color || 'var(--grey-4)' };
  }).sort((a, b) => b.net - a.net);
  /* Eight lines is as many as an eye can follow. Past that the smallest fold together. */
  if (groups.length > 8) {
    const keep = groups.slice().sort((a, b) => b.rows.length - a.rows.length).slice(0, 7);
    const rest = groups.filter(gr => !keep.includes(gr));
    const other = { key: '_other', name: `${rest.length} others`, color: 'var(--grey-5)', rows: rest.flatMap(gr => gr.rows).sort((a, b) => a.i - b.i),
      net: rest.reduce((a, gr) => a + gr.net, 0), wins: rest.reduce((a, gr) => a + gr.wins, 0), losses: rest.reduce((a, gr) => a + gr.losses, 0) };
    groups = [...keep, other].sort((a, b) => b.net - a.net);
  }
  return el('section', { class: 'card lab-chart an-setups' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'By setup'), el('span', { class: 'lab-sub' }, 'running total, trade by trade')),
    el('div', { class: 'an-split' },
      fitted((w, h) => drawRace(rows, groups, K, w, h), 170),
      board(groups, K)));
}

function board(groups, K) {
  return el('div', { class: 'an-board' }, ...groups.map(gr => {
    const wr = rate(gr);
    return el('div', { class: 'an-brow' },
      el('i', { class: 'an-sw', style: { background: gr.color } }),
      el('div', { class: 'n' }, el('span', { class: 'nm' }, gr.name),
        el('span', { class: 'mt' }, `${gr.rows.length} · ${wr == null ? '—' : c.pct(wr, 0)}`)),
      el('b', { class: gr.net > 0 ? 'is-pos' : gr.net < 0 ? 'is-neg' : '' }, K.fmt(gr.net, { short: true })),
      el('div', { class: 'an-wr' }, el('div', { class: 'bar-fill', style: { width: ((wr || 0) * 100) + '%' } })));
  }));
}

function drawRace(rows, groups, K, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const n = rows.length;
  const l = 48, r = W - 10, t = 8, b = H - 20;
  const X = i => l + ((i + 1) / n) * (r - l);
  /* Each setup's running total at every trade, so the crosshair can read them all at once. */
  const at = groups.map(gr => {
    const arr = new Array(n); let cum = 0, j = 0;
    for (let i = 0; i < n; i++) { if (gr.rows[j] && gr.rows[j].i === i) { cum += gr.rows[j].v; j++; } arr[i] = cum; }
    return arr;
  });
  let lo = 0, hi = 0;
  for (const a of at) for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const Y = v => b - ((v - lo) / (hi - lo)) * (b - t);

  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  for (const v of ticks(lo, hi, 3)) {
    g.append(svg('line', { class: Math.abs(v) < 1e-9 ? 'lab-zero' : 'lab-grid', x1: l, x2: r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, K.axis(v)));
  }
  g.append(svg('text', { class: 'lab-tick', x: l, y: H - 4, 'text-anchor': 'start' }, c.shortDate(rows[0].t.date)));
  g.append(svg('text', { class: 'lab-tick', x: r, y: H - 4, 'text-anchor': 'end' }, c.shortDate(rows[n - 1].t.date)));

  /* Drawn worst first, so the leader is on top. */
  groups.map((gr, k) => [gr, k]).reverse().forEach(([gr, k]) => {
    let d = `M${l},${Y(0).toFixed(1)}`, prev = 0;
    for (const x of gr.rows) {
      const cx = X(x.i).toFixed(1);
      d += `L${cx},${Y(prev).toFixed(1)}L${cx},${Y(at[k][x.i]).toFixed(1)}`;
      prev = at[k][x.i];
    }
    d += `L${r},${Y(prev).toFixed(1)}`;
    g.append(svg('path', { class: 'an-race line-draw', d, pathLength: 1, style: `stroke:${gr.color}` }));
    g.append(svg('circle', { class: 'an-race-end line-tip', cx: r, cy: Y(prev), r: 3, style: `fill:${gr.color}` }));
  });

  hoverLayer(wrap, g, { l, r, t, b }, x => {
    const i = Math.max(0, Math.min(n - 1, Math.round(((x - l) / (r - l)) * n) - 1));
    const order = groups.map((gr, k) => [gr, at[k][i]]).sort((a, b) => b[1] - a[1]);
    return { x: X(i), rows: [
      el('div', { class: 'h' }, `${c.shortDate(rows[i].t.date)} · trade ${i + 1}`),
      ...order.map(([gr, v]) => el('div', { class: 'r' }, el('i', { style: { background: gr.color } }), el('b', {}, K.fmt(v)), el('span', {}, gr.name)))] };
  });
  wrap.prepend(g);
  return wrap;
}

/* ---------- instruments, each with its own curve ---------- */
function pairsCard(rows, K) {
  const groups = groupsBy(rows, x => (x.t.pair || '—').toUpperCase()).sort((a, b) => b.net - a.net);
  return el('section', { class: 'card lab-chart an-pairs' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'By instrument'),
      el('span', { class: 'lab-sub' }, `${groups.length} traded`)),
    el('div', { class: 'an-inst' },
      el('div', { class: 'an-irow is-head' }, el('span', {}, ''), el('span', {}, 'curve'), el('span', {}, 'win'),
        el('span', {}, 'per trade'), el('span', {}, 'net')),
      ...groups.map(gr => {
        const wr = rate(gr);
        let cum = 0;
        const curve = [0, ...gr.rows.map(x => (cum += x.v))];
        const withR = gr.rows.filter(x => x.r != null && isFinite(x.r));
        const perR = withR.length ? withR.reduce((a, x) => a + x.r, 0) / withR.length : null;
        return el('div', { class: 'an-irow' },
          el('div', { class: 'n' }, el('span', { class: 'nm' }, gr.key), el('span', { class: 'mt' }, `${gr.rows.length} trade${gr.rows.length === 1 ? '' : 's'}`)),
          el('div', { class: 'an-ispark' }, spark(curve, { height: 30, cls: gr.net < 0 ? 'is-neg' : 'is-pos' })),
          el('div', { class: 'an-iwin' }, el('span', {}, wr == null ? '—' : c.pct(wr, 0)),
            el('div', { class: 'an-wr' }, el('div', { class: 'bar-fill', style: { width: ((wr || 0) * 100) + '%' } }))),
          el('span', { class: 'an-inum' }, c.rFmt(perR, 2)),
          el('b', { class: 'an-inum ' + (gr.net > 0 ? 'is-pos' : gr.net < 0 ? 'is-neg' : '') }, K.fmt(gr.net)));
      })));
}
