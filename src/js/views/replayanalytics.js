/* ============================================================
   replayanalytics.js — Replay's analytics: one session, or a group's
   sessions combined. Quire's own design, the same charts as Analytics.

   Only Replay's trades are here — nothing from the journal.

   In R always; in % beside it; and in $ too when every session in view
   started with the same balance (otherwise a dollar total would add up
   unlike things, and a note says so).

   • Tiles: total, trades (by pair), win rate (won · lost · BE), profit
     factor, max drawdown, average win.
   • Equity: R after each trade, with the deepest fall shaded.
   • By day and By session (the Playbook's): R, trades and win rate.
   • On the right, the trade you pick — on its own chart with its position,
     entry, exit and the session's drawings; its numbers; and the list.
   • What if (replaywhatif.js): the Stop loss and Risk : reward
     simulators and Monte Carlo, on the session's saved prices.
   ============================================================ */
import { el, svg, fitted } from '../ui.js';
import * as cd from '../candles.js';
import * as rd from '../replaydata.js';
import * as rs from '../replaysessions.js';
import { pairName } from '../replaysessions.js';
import { sessionFor } from '../calc.js';
import { ticks, hoverLayer, tipLayer } from './chartkit.js';
import { createCore, CHART_TFS } from '../chart/core.js';
import { createDrawings } from '../chart/drawings.js';
import { whatIf } from './replaywhatif.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = n => String(n).padStart(2, '0');
const day = T => { const d = new Date(T * 1000); return `${d.getDate()} ${MON[d.getMonth()]}`; };
const when = T => { const d = new Date(T * 1000); return `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const clock = T => { const d = new Date(T * 1000); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const rT = (r, short) => `${r > 1e-9 ? '+' : r < -1e-9 ? '−' : ''}${Math.abs(r).toFixed(short && Math.abs(r) >= 10 ? 0 : short ? 1 : 2)}R`;
const pctT = p => `${p > 1e-9 ? '+' : p < -1e-9 ? '−' : ''}${Math.abs(p).toFixed(2)}%`;
const usdT = v => `${v > 1e-9 ? '+' : v < -1e-9 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
let uidN = 0;
const uid = () => 'ra' + (++uidN);

/* remembered while the app is open: which session of a group is shown, and the trade picked */
const pick = { scope: {}, trade: {} };

/** All the numbers, from the closed trades of these sessions, in the order they closed. */
export function analyse(sessions, playbook) {
  const rows = [];
  for (const s of sessions) for (const t of s.trades || []) if (t.closed) rows.push({ t, s, r: Number(t.r) || 0, pnl: Number(t.pnl) || 0, pct: (Number(t.pnl) || 0) / (s.balance || 1) * 100 });
  rows.sort((a, b) => a.t.closeT - b.t.closeT || a.t.openT - b.t.openT);
  let eq = 0, peak = 0, worst = 0, worstAt = null, peakAt = -1, eqP = 0, peakP = 0, worstP = 0;
  rows.forEach((x, i) => {
    eq += x.r; eqP += x.pct;
    if (eq > peak) { peak = eq; peakAt = i; }
    if (eqP > peakP) peakP = eqP;
    x.eq = eq; x.dd = eq - peak; x.i = i;
    if (eq - peak < worst) { worst = eq - peak; worstAt = { from: peakAt, to: i }; }
    if (eqP - peakP < worstP) worstP = eqP - peakP;
  });
  const won = rows.filter(x => x.pnl > 0), lost = rows.filter(x => x.pnl < 0);
  const gw = won.reduce((a, x) => a + x.r, 0), gl = -lost.reduce((a, x) => a + x.r, 0);
  const pairs = {};
  for (const x of rows) pairs[x.s.inst] = (pairs[x.s.inst] || 0) + 1;
  const sameBalance = new Set(sessions.map(s => s.balance)).size <= 1;
  const group = keyOf => {
    const m = new Map();
    for (const x of rows) { const k = keyOf(x); const g = m.get(k) || { key: k, r: 0, n: 0, won: 0 }; g.r += x.r; g.n++; if (x.pnl > 0) g.won++; m.set(k, g); }
    return m;
  };
  const byDayMap = group(x => new Date(x.t.openT * 1000).getDay());
  const byDay = [1, 2, 3, 4, 5].map(d => ({ label: WD[d], ...(byDayMap.get(d) || { r: 0, n: 0, won: 0 }) }));
  const sessionNames = (playbook?.sessions || []).map(s => s.name);
  const bySesMap = group(x => sessionFor(playbook || { sessions: [] }, clock(x.t.openT))?.name || 'Outside');
  const bySession = [...sessionNames, 'Outside'].map(name => ({ label: name, ...(bySesMap.get(name) || { r: 0, n: 0, won: 0 }) })).filter(g => g.label !== 'Outside' || g.n);
  return {
    rows, n: rows.length, total: eq, totalPct: eqP, totalUsd: rows.reduce((a, x) => a + x.pnl, 0), sameBalance,
    won: won.length, lost: lost.length, be: rows.length - won.length - lost.length, winRate: rows.length ? won.length / rows.length : null,
    pf: gl > 0 ? gw / gl : won.length ? Infinity : null, maxDD: worst, maxDDPct: worstP, ddSpan: worstAt,
    avgWin: won.length ? gw / won.length : null, avgWinUsd: won.length ? won.reduce((a, x) => a + x.pnl, 0) / won.length : null,
    pairs, byDay, bySession,
  };
}

export function replayAnalytics(store, nav, kind, id) {
  const view = el('div', { class: 'view rp ra' });
  const group = kind === 'group' ? rs.groupsOf(store).find(g => g.id === id) : null;
  const single = kind === 'analytics' ? rs.sessionById(store, id) : null;
  const back = el('button', { class: 'btn btn-quiet rp-back', onClick: () => nav.go('#/replay') }, '‹ Replay');
  if (!group && !single) {
    view.append(el('header', { class: 'head' }, back, el('h1', {}, 'Analytics')),
      el('div', { class: 'rp-body' }, el('section', { class: 'card rp-emptycard' }, el('h2', {}, 'Not here any more'), el('p', { class: 'rp-empty' }, 'That session or group has been deleted.'))));
    return view;
  }
  const members = group ? rs.sessionsOf(store).filter(s => s.groupId === group.id) : [single];
  const scopeKey = group ? 'g:' + group.id : 's:' + single.id;
  let scope = pick.scope[scopeKey] && members.some(s => s.id === pick.scope[scopeKey]) ? pick.scope[scopeKey] : 'all';
  const inView = scope === 'all' ? members : members.filter(s => s.id === scope);
  const A = analyse(inView, store.playbook);
  const first = Math.min(...inView.map(s => s.from)), last = Math.max(...inView.map(s => s.to));
  const sub = group ? `${members.length} session${members.length === 1 ? '' : 's'} combined` : `${pairName(single.inst)} · ${day(single.from)} – ${day(single.to)} ${new Date(single.to * 1000).getFullYear()}`;
  view.append(el('header', { class: 'head' }, back,
    el('h1', {}, group ? group.name : single.name),
    el('span', { class: 'sub' }, group ? `group · ${sub}` : sub),
    el('div', { class: 'spacer' }),
    single ? el('button', { class: 'btn btn-light ra-continue', onClick: () => nav.go('#/replay/session/' + single.id) }, single.finished ? 'Open' : '▶ Continue') : null));

  const body = el('div', { class: 'rp-body ra-body' });
  view.append(body);
  /* Combined, or one session of the group */
  if (group && members.length) {
    body.append(el('div', { class: 'ra-bar' },
      el('div', { class: 'seg ra-scope' }, ...[['all', 'Combined'], ...members.map(s => [s.id, s.name])].map(([k, label]) =>
        el('button', { class: k === scope ? 'is-on' : '', 'data-scope': k, onClick: () => { pick.scope[scopeKey] = k; nav.refresh(); } }, label))),
      !A.sameBalance ? el('span', { class: 'ra-note' }, 'In R and % — the sessions started with different balances.') : null));
  }
  if (!A.n) {
    body.append(el('section', { class: 'card rp-emptycard ra-empty' },
      el('h2', {}, 'No trades yet'),
      el('p', { class: 'rp-empty' }, group && !members.length ? 'There are no sessions in this group.' : 'Take a trade in the session and it shows here — equity, win rate, the days and sessions it worked in.'),
      single ? el('button', { class: 'btn btn-light', onClick: () => nav.go('#/replay/session/' + single.id) }, single.finished ? 'Open' : '▶ Continue') : null));
    return view;
  }

  /* the tiles */
  const tile = (k, v, small, cls = '') => el('div', { class: 'card rp-tile ' + cls }, el('span', { class: 'rp-k' }, k), el('b', { class: 'rp-tv' }, v), el('span', { class: 'rp-ts' }, small || ''));
  const pairsTxt = Object.entries(A.pairs).map(([k, n]) => `${pairName(k)} ${n}`).join(' · ');
  body.append(el('div', { class: 'rp-tiles ra-tiles' },
    tile('Total', rT(A.total), [pctT(A.totalPct), A.sameBalance ? usdT(A.totalUsd) : null].filter(Boolean).join(' · '), 'ra-t-total ' + (A.total > 0 ? 'is-up' : A.total < 0 ? 'is-down' : '')),
    tile('Trades', String(A.n), pairsTxt, 'ra-t-trades'),
    tile('Win rate', `${Math.round(A.winRate * 100)}%`, `${A.won} won · ${A.lost} lost · ${A.be} BE`, 'ra-t-win'),
    tile('Profit factor', A.pf == null ? '—' : A.pf === Infinity ? '∞' : A.pf.toFixed(2), 'won R ÷ lost R', 'ra-t-pf'),
    tile('Max drawdown', A.maxDD < -1e-9 ? rT(A.maxDD) : '0R', A.maxDD < -1e-9 ? pctT(A.maxDDPct) : 'never below a high', 'ra-t-dd'),
    tile('Average win', A.avgWin == null ? '—' : rT(A.avgWin), A.avgWinUsd != null && A.sameBalance ? usdT(A.avgWinUsd) : '', 'ra-t-avg')));

  /* charts on the left, the trade on the right */
  const tradeKey = scopeKey + ':' + scope;
  let chosen = A.rows.find(x => x.t.id === pick.trade[tradeKey]) || A.rows[A.rows.length - 1];
  const right = el('aside', { class: 'card ra-side' });
  const choose = x => { chosen = x; pick.trade[tradeKey] = x.t.id; paintSide(); };
  const left = el('div', { class: 'ra-left' },
    el('section', { class: 'card lab-chart ra-equity' },
      el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Equity'),
        el('span', { class: 'lab-sub' }, `R after each trade · ${day(first)} → ${day(last)}`),
        el('span', { class: 'an-head-figs' }, el('span', {}, 'max DD ', el('b', { class: A.maxDD < 0 ? 'is-neg' : '' }, A.maxDD < -1e-9 ? rT(A.maxDD) : '—')))),
      fitted((w, h) => drawEquity(A, w, h, choose), 250)),
    el('div', { class: 'ra-two' },
      el('section', { class: 'card lab-chart ra-byday' }, el('div', { class: 'lab-chart-head' }, el('h2', {}, 'By day'), el('span', { class: 'lab-sub' }, 'the day it was opened')),
        fitted((w, h) => drawBars(A.byDay, w, h), 190)),
      el('section', { class: 'card lab-chart ra-bysession' }, el('div', { class: 'lab-chart-head' }, el('h2', {}, 'By session'), el('span', { class: 'lab-sub' }, 'the Playbook’s, when it was opened')),
        fitted((w, h) => drawBars(A.bySession, w, h), 190))));
  body.append(el('div', { class: 'ra-main' }, left, right));
  /* What if: the stop moved, the target moved, and Monte Carlo */
  body.append(whatIf(A, inView));

  function paintSide() {
    const x = chosen, t = x.t, s = x.s;
    const held = t.closeT - t.openT;
    const heldTxt = held >= 86400 ? `${Math.floor(held / 86400)}d ${Math.floor(held % 86400 / 3600)}h` : held >= 3600 ? `${Math.floor(held / 3600)}h ${Math.round(held % 3600 / 60)}m` : `${Math.round(held / 60)}m`;
    const dp = cd.decimalsOf(s.inst), f = v => (v == null ? '—' : Number(v).toFixed(dp));
    const units = t.qty == null ? '—' : s.inst === 'NAS100_USD' ? t.qty.toFixed(1) : Math.round(t.qty).toLocaleString('en-US');
    const fact = (k, v, cls = '') => el('div', { class: 'ra-fact ' + cls }, el('span', {}, k), el('b', {}, v));
    right.replaceChildren(
      el('div', { class: 'ra-side-head' },
        el('h2', {}, `${t.side === 'buy' ? 'Long' : 'Short'} ${pairName(s.inst)}`),
        el('span', { class: 'lab-sub' }, `${when(t.openT)}${group && scope === 'all' ? ' · ' + s.name : ''}`)),
      tradeChart(store, s, t),
      el('div', { class: 'ra-facts' },
        fact('Entry', f(t.entry)), fact('Stop', f(t.initSl ?? t.sl)), fact('Target', f(t.tp)), fact('Exit', f(t.exit)),
        fact('Result', `${rT(t.r || 0)} · ${usdT(t.pnl || 0)}`, (t.pnl || 0) > 0 ? 'is-up' : (t.pnl || 0) < 0 ? 'is-down' : ''),
        fact('How', t.reason === 'tp' ? 'Target' : t.reason === 'sl' ? 'Stop' : 'Closed by hand'), fact('Held', heldTxt), fact('Units', units)),
      el('div', { class: 'ra-list' }, el('div', { class: 'ra-li is-head' }, ...['', 'Opened', 'Pair', 'R'].map(h => el('span', {}, h))),
        ...[...A.rows].reverse().map(y => el('button', { class: 'ra-li' + (y === chosen ? ' is-on' : ''), 'data-trade': y.t.id, onClick: () => choose(y) },
          el('i', { class: y.t.side === 'buy' ? 'is-long' : 'is-short' }), el('span', {}, when(y.t.openT)), el('span', {}, pairName(y.s.inst)),
          el('span', { class: y.r > 0 ? 'is-up' : y.r < 0 ? 'is-down' : '' }, rT(y.r))))));
  }
  paintSide();
  return view;
}

/* ---------- equity: R after each trade ---------- */
function drawEquity(A, W, H, onPick) {
  const wrap = el('div', { class: 'lab-svgwrap ra-eq' });
  const rows = A.rows, n = rows.length;
  const l = 52, r = W - 14, t = 10, b = H - 24;
  const X = i => l + ((i + 1) / n) * (r - l);
  let lo = 0, hi = 0;
  for (const x of rows) { lo = Math.min(lo, x.eq); hi = Math.max(hi, x.eq); }
  const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
  const Y = v => b - ((v - lo) / (hi - lo)) * (b - t);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const id = uid(), y0 = Y(0);
  g.append(svg('defs', {},
    svg('linearGradient', { id: 'gp' + id, gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: t, y2: y0 },
      svg('stop', { offset: 0, class: 'an-stop-pos', 'stop-opacity': .26 }), svg('stop', { offset: 1, class: 'an-stop-pos', 'stop-opacity': .02 })),
    svg('linearGradient', { id: 'gn' + id, gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: b, y2: y0 },
      svg('stop', { offset: 0, class: 'an-stop-neg', 'stop-opacity': .26 }), svg('stop', { offset: 1, class: 'an-stop-neg', 'stop-opacity': .02 })),
    svg('clipPath', { id: 'up' + id }, svg('rect', { x: l - 4, y: t - 6, width: r - l + 8, height: Math.max(0, y0 - t + 6) })),
    svg('clipPath', { id: 'dn' + id }, svg('rect', { x: l - 4, y: y0, width: r - l + 8, height: Math.max(0, b - y0 + 6) }))));
  for (const v of ticks(lo, hi, 4)) {
    g.append(svg('line', { class: Math.abs(v) < 1e-9 ? 'lab-zero' : 'lab-grid', x1: l, x2: r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, rT(v, true)));
  }
  if (A.ddSpan) {
    const x1 = A.ddSpan.from < 0 ? l : X(A.ddSpan.from), x2 = X(A.ddSpan.to);
    g.append(svg('rect', { class: 'an-ddband ra-ddband', x: x1, y: t, width: Math.max(2, x2 - x1), height: b - t }));
  }
  const want = Math.max(2, Math.min(6, Math.floor((r - l) / 110)));
  let lastLbl = '';
  for (let k = 0; k < want && n > 1; k++) {
    const i = Math.round((k / (want - 1)) * (n - 1)), lbl = day(rows[i].t.closeT);
    if (lbl === lastLbl) continue;
    lastLbl = lbl;
    g.append(svg('text', { class: 'lab-tick', x: X(i), y: H - 6, 'text-anchor': k === 0 ? 'start' : k === want - 1 ? 'end' : 'middle' }, lbl));
  }
  const line = `M${l},${y0.toFixed(1)}` + rows.map(x => `L${X(x.i).toFixed(1)},${Y(x.eq).toFixed(1)}`).join('');
  const area = line + `L${r},${y0.toFixed(1)}Z`;
  g.append(svg('path', { class: 'line-area', d: area, fill: `url(#gp${id})`, 'clip-path': `url(#up${id})` }));
  g.append(svg('path', { class: 'line-area', d: area, fill: `url(#gn${id})`, 'clip-path': `url(#dn${id})` }));
  g.append(svg('path', { class: 'an-line is-pos', d: line, 'clip-path': `url(#up${id})` }));
  g.append(svg('path', { class: 'an-line is-neg', d: line, 'clip-path': `url(#dn${id})` }));
  const end = rows[n - 1];
  g.append(svg('circle', { class: 'an-end ' + (end.eq < 0 ? 'is-neg' : 'is-pos'), cx: X(n - 1), cy: Y(end.eq), r: 4 }));
  let at = -1;
  hoverLayer(wrap, g, { l, r, t, b }, x => {
    const i = Math.max(0, Math.min(n - 1, Math.round(((x - l) / (r - l)) * n) - 1));
    at = i;
    const p = rows[i];
    return { x: X(i), y: Y(p.eq), rows: [
      el('div', { class: 'h' }, `${when(p.t.closeT)} · trade ${i + 1}`),
      el('div', { class: 'r' }, el('i', { class: p.eq < 0 ? 'is-fail' : 'is-pass' }), el('b', {}, rT(p.eq)), el('span', {}, 'equity')),
      el('div', { class: 'r' }, el('i', { class: p.r > 0 ? 'is-pass' : p.r < 0 ? 'is-fail' : 'is-going' }), el('b', {}, rT(p.r)), el('span', {}, `${p.t.side === 'buy' ? 'long' : 'short'} ${pairName(p.s.inst)}`)),
      el('div', { class: 'r' }, el('span', {}, 'click to see it'))] };
  });
  g.querySelector('.lab-hit')?.addEventListener('click', () => { if (at >= 0) onPick(rows[at]); });
  wrap.prepend(g);
  return wrap;
}

/* ---------- R by a category: bars from zero, the sign in the colour ---------- */
function drawBars(groups, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap ra-bars' });
  const l = 44, r = W - 10, t = 18, b = H - 24;
  let lo = Math.min(0, ...groups.map(x => x.r)), hi = Math.max(0, ...groups.map(x => x.r));
  if (hi - lo < 1e-9) { hi = 1; lo = -1; }
  const pad = (hi - lo) * 0.12; lo = lo < 0 ? lo - pad : 0; hi += pad;
  const Y = v => b - ((v - lo) / (hi - lo)) * (b - t);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  for (const v of ticks(lo, hi, 3)) {
    g.append(svg('line', { class: Math.abs(v) < 1e-9 ? 'lab-zero' : 'lab-grid', x1: l, x2: r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, rT(v, true)));
  }
  const tip = tipLayer(wrap);
  const slot = (r - l) / groups.length, bw = Math.min(46, slot * 0.56);
  groups.forEach((gr, i) => {
    const cx = l + slot * (i + 0.5), y0 = Y(0), y1 = Y(gr.r);
    const top = Math.min(y0, y1), h = Math.max(gr.n ? 2 : 0, Math.abs(y1 - y0));
    const rad = Math.min(4, h / 2, bw / 2);
    /* rounded at the data end, square on the zero line */
    const up = gr.r >= 0, x0 = cx - bw / 2, x1 = cx + bw / 2;
    const d = up
      ? `M${x0},${y0}V${top + rad}Q${x0},${top} ${x0 + rad},${top}H${x1 - rad}Q${x1},${top} ${x1},${top + rad}V${y0}Z`
      : `M${x0},${y0}V${top + h - rad}Q${x0},${top + h} ${x0 + rad},${top + h}H${x1 - rad}Q${x1},${top + h} ${x1},${top + h - rad}V${y0}Z`;
    if (gr.n) g.append(svg('path', { class: 'ra-col ' + (gr.r > 1e-9 ? 'is-up' : gr.r < -1e-9 ? 'is-down' : 'is-flat'), d, 'data-label': gr.label }));
    g.append(svg('text', { class: 'lab-tick ra-cat', x: cx, y: H - 6, 'text-anchor': 'middle' }, gr.label));
    if (gr.n) g.append(svg('text', { class: 'ra-val', x: cx, y: up ? top - 5 : top + h + 12, 'text-anchor': 'middle' }, rT(gr.r, true)));
    const hit = svg('rect', { class: 'ra-hit', x: cx - slot / 2, y: t, width: slot, height: b - t, fill: 'transparent' });
    hit.addEventListener('pointermove', () => tip.show(cx, Math.min(y0, y1), [
      el('div', { class: 'h' }, gr.label),
      el('div', { class: 'r' }, el('i', { class: gr.r > 0 ? 'is-pass' : gr.r < 0 ? 'is-fail' : 'is-going' }), el('b', {}, gr.n ? rT(gr.r) : '—'), el('span', {}, 'total')),
      el('div', { class: 'r' }, el('b', {}, String(gr.n)), el('span', {}, gr.n === 1 ? 'trade' : 'trades')),
      el('div', { class: 'r' }, el('b', {}, gr.n ? `${Math.round(gr.won / gr.n * 100)}%` : '—'), el('span', {}, 'win rate'))]));
    hit.addEventListener('pointerleave', () => tip.hide());
    g.append(hit);
  });
  wrap.prepend(g);
  return wrap;
}

/* ---------- the trade on its own chart ---------- */
function tradeChart(store, s, t) {
  const box = el('div', { class: 'ra-chart' });
  const plot = el('div', { class: 'tc-plot ra-plot' });
  const seg = el('div', { class: 'ra-tfs' });
  box.append(seg, plot);
  const inst = s.inst, dp = cd.decimalsOf(inst);
  const span = Math.max(3600, t.closeT - t.openT);
  rd.candlesBetween(inst, t.openT - Math.max(span * 3, 6 * 3600), Math.min(s.to + 60, t.closeT + Math.max(span * 2, 4 * 3600))).then(rows => {
    if (!box.isConnected) return;
    if (!rows.length) { box.replaceChildren(el('p', { class: 'rp-empty' }, 'Its prices are not saved any more — download the pair on Replay → Data.')); return; }
    let tf = span <= 3 * 3600 ? 1 : span <= 12 * 3600 ? 5 : 15;
    const core = createCore(plot, { store, inst, dp, symbol: pairName(inst), source: 'OANDA', bars: cd.aggregate(rows, tf), tf,
      hooks: {
        tags: () => [{ p: t.entry, label: 'Entry', bg: '#787878' }, ...(t.tp != null ? [{ p: t.tp, label: 'TP', bg: core.palette().profit }] : []),
          ...(t.initSl ?? t.sl) != null ? [{ p: t.initSl ?? t.sl, label: 'SL', bg: core.palette().loss }] : []],
        back: (g, G, C) => {
          const xa = G.xT(t.openT) + G.spacing / 2, xb = Math.max(G.xT(t.closeT) + G.spacing / 2, xa + 2), ye = G.Y(t.entry);
          if (t.tp != null) { g.fillStyle = `rgba(${C.prgb}, .16)`; g.fillRect(xa, Math.min(ye, G.Y(t.tp)), xb - xa, Math.abs(G.Y(t.tp) - ye)); }
          const sl = t.initSl ?? t.sl;
          if (sl != null) { g.fillStyle = `rgba(${C.lrgb}, .16)`; g.fillRect(xa, Math.min(ye, G.Y(sl)), xb - xa, Math.abs(G.Y(sl) - ye)); }
        },
        front: (g, G, C) => {
          dr.paint(g, G, C);
          const xa = G.xT(t.openT) + G.spacing / 2, xb = G.xT(t.closeT) + G.spacing / 2, ya = G.Y(t.entry), yb = G.Y(t.exit);
          g.strokeStyle = C.ink2; g.lineWidth = 1; g.setLineDash([2, 3]);
          g.beginPath(); g.moveTo(xa, ya); g.lineTo(xb, yb); g.stroke(); g.setLineDash([]);
          for (const [x, y] of [[xa, ya], [xb, yb]]) { g.fillStyle = C.card; g.beginPath(); g.arc(x, y, 3.8, 0, Math.PI * 2); g.fill(); g.fillStyle = C.ink; g.beginPath(); g.arc(x, y, 2.3, 0, Math.PI * 2); g.fill(); }
        },
      } });
    /* the session's drawings, to look at */
    const dr = createDrawings(core, plot, { store, dkey: rs.drawKey(s.id), inst, dp, tf: () => tf, rows: () => rows, replayT: () => Infinity, account: () => ({}) });
    const place = () => {
      const a = core.idxAt(t.openT), z = core.idxAt(t.closeT), w = Math.max(z - a, 10);
      core.setView(a - w * 0.9, w * 2.8);
      core.fitPrices([t.entry, t.tp, t.initSl ?? t.sl, t.exit].filter(v => v != null));
      core.setView(a - w * 0.9, w * 2.8);
      core.draw();
    };
    const paintSeg = () => seg.replaceChildren(...CHART_TFS.filter(([, m]) => m <= 240).map(([label, m]) =>
      el('button', { class: m === tf ? 'is-on' : '', 'data-tf': label, onClick: () => { tf = m; core.setBars(cd.aggregate(rows, tf), tf); place(); paintSeg(); } }, label)));
    paintSeg();
    requestAnimationFrame(place);
    box.__chart = { core, get tf() { return tf; } };
  });
  return box;
}
