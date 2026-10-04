/* ============================================================
   replaywhatif.js — the "What if" card on Replay's analytics: the
   Stop loss simulator, the Risk : reward simulator and Monte Carlo
   (the numbers are replaysim.js's). Shown under the charts; it loads the
   sessions' saved one-minute prices once, then everything is instant.
   ============================================================ */
import { el, svg, fitted } from '../ui.js';
import * as rd from '../replaydata.js';
import * as sim from '../replaysim.js';
import { ticks, tipLayer } from './chartkit.js';

const rT = (r, dp = 2) => `${r > 1e-9 ? '+' : r < -1e-9 ? '−' : ''}${Math.abs(r).toFixed(dp)}R`;
const pctOf = k => (k === 0 ? 'As taken' : `${k > 0 ? '+' : '−'}${Math.round(Math.abs(k) * 100)}%`);
const pfT = pf => (pf == null ? '—' : pf === Infinity ? '∞' : pf.toFixed(2));
const wrT = w => (w == null ? '—' : `${Math.round(w * 100)}%`);
const signCls = v => (v > 1e-9 ? 'is-up' : v < -1e-9 ? 'is-down' : '');

/* remembered while the app is open */
const memo = { tab: 'stop', stop: null, rr: null, mcN: null, seed: 1 };

/**
 * @param A        analyse()'s numbers (its rows: { t, s, r } in close order)
 * @param sessions the sessions in view
 */
export function whatIf(A, sessions) {
  const card = el('section', { class: 'card ra-whatif' });
  const tabs = el('div', { class: 'seg ra-wi-tabs' });
  const sub = el('span', { class: 'lab-sub ra-wi-sub' });
  const body = el('div', { class: 'ra-wi-body' }, el('p', { class: 'rp-empty ra-wi-wait' }, 'Playing the trades again on their saved prices…'));
  card.append(el('div', { class: 'lab-chart-head ra-wi-head' }, el('h2', {}, 'What if'), sub, el('div', { class: 'spacer' }), tabs), body);

  const actual = sim.summary(A.rows.map(x => x.r));
  let items = null, sweep = null, grid = null;

  /* the prices each session played, once */
  Promise.all(sessions.map(s => {
    const own = A.rows.filter(x => x.s === s);
    if (!own.length) return Promise.resolve([]);
    const from = Math.min(...own.map(x => x.t.openT)) - 60;
    return rd.candlesBetween(s.inst, from, s.to + 60).then(rows => own.map(x => ({
      t: x.t, s, path: sim.pathOf(rows, x.t, x.t.reason === 'manual' ? x.t.closeT : s.to + 59) })));
  })).then(parts => {
    const byId = new Map(parts.flat().map(x => [x.t.id, x]));
    items = A.rows.map(x => byId.get(x.t.id)).filter(Boolean);
    sweep = sim.stopSweep(items);
    grid = sim.rrGrid(items);
    paint();
  }).catch(e => { body.replaceChildren(el('p', { class: 'rp-empty' }, 'The prices could not be read: ' + (e.message || e))); });

  const TABS = [['stop', 'Stop loss'], ['rr', 'Risk : reward'], ['mc', 'Monte Carlo']];
  const SUBS = {
    stop: 'each stop closer or further — the target where it was',
    rr: 'the stop moved, the target at a number of R — find the sweet spot',
    mc: 'these trades drawn again at random, a thousand times over',
  };
  function paintTabs() {
    tabs.replaceChildren(...TABS.map(([k, label]) => el('button', { class: k === memo.tab ? 'is-on' : '', 'data-tab': k, onClick: () => { memo.tab = k; paint(); } }, label)));
    sub.textContent = SUBS[memo.tab];
  }
  function paint() {
    paintTabs();
    if (!items) return;
    card.dataset.tab = memo.tab;
    body.replaceChildren(memo.tab === 'stop' ? stopTab() : memo.tab === 'rr' ? rrTab() : mcTab());
  }
  paintTabs();

  /* the numbers under a setting, beside the trades as taken */
  function compare(S, changed) {
    const fig = (k, v, was, d, cls = '') => el('div', { class: 'card rp-tile ra-wi-tile ' + cls },
      el('span', { class: 'rp-k' }, k), el('b', { class: 'rp-tv' }, v), el('span', { class: 'rp-ts' }, `as taken ${was}${d ? ' · ' + d : ''}`));
    const dR = S.total - actual.total;
    return el('div', { class: 'rp-tiles ra-wi-tiles' },
      fig('Total', rT(S.total), rT(actual.total), Math.abs(dR) > 1e-9 ? `${dR > 0 ? '+' : '−'}${Math.abs(dR).toFixed(2)}R` : 'the same', 'ra-wi-total ' + signCls(S.total)),
      fig('Win rate', wrT(S.winRate), wrT(actual.winRate), '', 'ra-wi-win'),
      fig('Profit factor', pfT(S.pf), pfT(actual.pf), '', 'ra-wi-pf'),
      fig('Max drawdown', S.maxDD < -1e-9 ? rT(S.maxDD) : '0R', actual.maxDD < -1e-9 ? rT(actual.maxDD) : '0R', '', 'ra-wi-dd'),
      fig('Trades that change', String(changed), `of ${S.n}`, '', 'ra-wi-changed'));
  }
  const changedOf = S => S.res.filter((x, i) => Math.abs(x.r - items[i].t.r) > 0.01 || x.how !== items[i].t.reason).length;

  /* ---------- Stop loss ---------- */
  function stopTab() {
    const best = sweep.reduce((a, x) => (x.total > a.total + 1e-9 ? x : a), sweep[0]);
    if (memo.stop == null || !sweep.some(x => x.k === memo.stop)) memo.stop = best.k;
    const S = sweep.find(x => x.k === memo.stop);
    const pick = k => { memo.stop = k; paint(); };
    return el('div', { class: 'ra-wi-stop' },
      el('div', { class: 'seg ra-wi-steps' }, ...sweep.map(x => el('button', { class: (x.k === memo.stop ? 'is-on ' : '') + (x === best ? 'is-best' : ''), 'data-k': String(x.k), onClick: () => pick(x.k) }, pctOf(x.k)))),
      fitted((w, h) => sweepChart(sweep, best, memo.stop, w, h, pick), 200),
      compare(S, changedOf(S)),
      el('p', { class: 'ra-wi-note' }, `Best here: ${pctOf(best.k).toLowerCase()} — ${rT(best.total)} over ${best.n} trades. A tighter stop makes each R smaller in price, so a win is more R; it is also hit more often.`));
  }

  /* ---------- Risk : reward ---------- */
  function rrTab() {
    const cells = grid.flat();
    const best = cells.reduce((a, x) => (x.total > a.total + 1e-9 ? x : a), cells[0]);
    if (!memo.rr || !cells.some(x => x.k === memo.rr.k && x.tr === memo.rr.tr)) memo.rr = { k: best.k, tr: best.tr };
    const S = cells.find(x => x.k === memo.rr.k && x.tr === memo.rr.tr);
    const top = Math.max(1e-9, ...cells.map(x => Math.abs(x.total)));
    const head = el('div', { class: 'ra-rr-row is-head' }, el('span', { class: 'ra-rr-lab' }, 'stop \\ target'), ...sim.RR_TARGETS.map(tr => el('span', {}, `${tr}R`)));
    const rows = grid.map(row => el('div', { class: 'ra-rr-row' }, el('span', { class: 'ra-rr-lab' }, pctOf(row[0].k)),
      ...row.map(x => {
        const a = 0.08 + 0.5 * Math.min(1, Math.abs(x.total) / top);
        const bg = x.total > 1e-9 ? `rgba(var(--profit-rgb), ${a.toFixed(2)})` : x.total < -1e-9 ? `rgba(var(--loss-rgb), ${a.toFixed(2)})` : 'var(--inset)';
        return el('button', { class: 'ra-rr-cell' + (x === best ? ' is-best' : '') + (x === S ? ' is-on' : ''), 'data-k': String(x.k), 'data-tr': String(x.tr), style: { background: bg },
          title: `stop ${pctOf(x.k).toLowerCase()}, target ${x.tr}R: ${rT(x.total)} · win rate ${wrT(x.winRate)} · max drawdown ${rT(x.maxDD)}`,
          onClick: () => { memo.rr = { k: x.k, tr: x.tr }; paint(); } }, rT(x.total, 1));
      })));
    return el('div', { class: 'ra-wi-rr' },
      el('div', { class: 'ra-rr' }, head, ...rows),
      compare(S, changedOf(S)),
      el('p', { class: 'ra-wi-note' }, `The sweet spot here: stop ${pctOf(best.k).toLowerCase()}, target ${best.tr}R — ${rT(best.total)}, ${wrT(best.winRate)} won. Rows move the stop; columns put the target at that many of the new R.`));
  }

  /* ---------- Monte Carlo ---------- */
  function mcTab() {
    const rs = A.rows.map(x => x.r);   // the results as they were
    const choices = [...new Set([A.n, 50, 100, 250])].sort((a, b) => a - b);
    if (!choices.includes(memo.mcN)) memo.mcN = Math.max(A.n, 50);
    const M = sim.monteCarlo(rs, { n: memo.mcN, runs: 1000, seed: memo.seed });
    const tile = (k, v, small, cls = '') => el('div', { class: 'card rp-tile ra-wi-tile ' + cls }, el('span', { class: 'rp-k' }, k), el('b', { class: 'rp-tv' }, v), el('span', { class: 'rp-ts' }, small));
    return el('div', { class: 'ra-wi-mc' },
      el('div', { class: 'ra-mc-bar' },
        el('span', { class: 'lab-sub' }, 'Trades in each run'),
        el('div', { class: 'seg ra-mc-n' }, ...choices.map(n => el('button', { class: n === memo.mcN ? 'is-on' : '', 'data-n': String(n), onClick: () => { memo.mcN = n; paint(); } }, n === A.n ? `${n} (as many as taken)` : String(n)))),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn-quiet ra-mc-again', onClick: () => { memo.seed++; paint(); } }, 'Run again')),
      fitted((w, h) => fanChart(M, A, w, h), 260),
      el('div', { class: 'rp-tiles ra-wi-tiles' },
        tile('Median end', rT(M.end.p50), `half the runs ended above this`, 'ra-mc-median ' + signCls(M.end.p50)),
        tile('Worst 5%', rT(M.end.p5), `best 5% ${rT(M.end.p95)}`, 'ra-mc-p5 ' + signCls(M.end.p5)),
        tile('Ended below zero', `${Math.round(M.belowZero * 100)}%`, `of ${M.runs} runs`, 'ra-mc-below'),
        tile('Max drawdown', rT(M.dd.p50), `typical · 1 in 20 ${rT(M.dd.p5)}`, 'ra-mc-dd'),
        tile('Losing streak', `${Math.round(M.streak.p50)}`, `typical longest · 1 in 20: ${Math.round(M.streak.p95)}`, 'ra-mc-streak')),
      el('p', { class: 'ra-wi-note' }, `${M.runs} runs of ${M.n} trades, each trade picked at random from your ${A.n}. Shaded: where the middle half and nine in ten of the runs were after each trade; the line, the median.`));
  }

  card.__whatIf = { get items() { return items; }, get sweep() { return sweep; }, get grid() { return grid; }, memo };
  return card;
}

/* ---------- total R for each stop step ---------- */
function sweepChart(sweep, best, on, W, H, pick) {
  const wrap = el('div', { class: 'lab-svgwrap ra-sweep' });
  const l = 52, r = W - 16, t = 16, b = H - 26;
  let lo = Math.min(0, ...sweep.map(x => x.total)), hi = Math.max(0, ...sweep.map(x => x.total));
  if (hi - lo < 1e-9) { hi = 1; lo = -1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const X = i => l + (i / (sweep.length - 1)) * (r - l), Y = v => b - ((v - lo) / (hi - lo)) * (b - t);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  for (const v of ticks(lo, hi, 4)) {
    g.append(svg('line', { class: Math.abs(v) < 1e-9 ? 'lab-zero' : 'lab-grid', x1: l, x2: r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, rT(v, 1)));
  }
  g.append(svg('path', { class: 'an-line ra-sweep-line', d: sweep.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x.total).toFixed(1)}`).join('') }));
  const tip = tipLayer(wrap);
  sweep.forEach((x, i) => {
    g.append(svg('text', { class: 'lab-tick', x: X(i), y: H - 8, 'text-anchor': 'middle' }, x.k === 0 ? 'taken' : pctOf(x.k)));
    g.append(svg('circle', { class: 'ra-sweep-dot ' + signCls(x.total) + (x.k === on ? ' is-on' : '') + (x === best ? ' is-best' : ''), cx: X(i), cy: Y(x.total), r: x.k === on ? 5.5 : 3.5, 'data-k': String(x.k) }));
    if (x === best) g.append(svg('text', { class: 'ra-val', x: X(i), y: Y(x.total) - 10, 'text-anchor': 'middle' }, 'best'));
    const hit = svg('rect', { class: 'ra-hit', x: X(i) - (r - l) / (sweep.length - 1) / 2, y: t, width: (r - l) / (sweep.length - 1), height: b - t, fill: 'transparent' });
    hit.addEventListener('pointermove', () => tip.show(X(i), Y(x.total), [
      el('div', { class: 'h' }, x.k === 0 ? 'Stops as taken' : `Stops ${pctOf(x.k)} ${x.k < 0 ? 'closer' : 'further'}`),
      el('div', { class: 'r' }, el('i', { class: x.total > 0 ? 'is-pass' : x.total < 0 ? 'is-fail' : 'is-going' }), el('b', {}, rT(x.total)), el('span', {}, 'total')),
      el('div', { class: 'r' }, el('b', {}, wrT(x.winRate)), el('span', {}, 'win rate')),
      el('div', { class: 'r' }, el('b', {}, rT(x.maxDD)), el('span', {}, 'max drawdown'))]));
    hit.addEventListener('pointerleave', () => tip.hide());
    hit.addEventListener('click', () => pick(x.k));
    g.append(hit);
  });
  wrap.prepend(g);
  return wrap;
}

/* ---------- Monte Carlo: the spread of the runs after each trade ---------- */
function fanChart(M, A, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap ra-fan' });
  const l = 52, r = W - 16, t = 12, b = H - 24;
  let lo = 0, hi = 0;
  for (const x of M.band) { lo = Math.min(lo, x.p5); hi = Math.max(hi, x.p95); }
  for (const x of A.rows) { lo = Math.min(lo, x.eq); hi = Math.max(hi, x.eq); }
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const X = i => l + (i / M.n) * (r - l), Y = v => b - ((v - lo) / (hi - lo)) * (b - t);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  for (const v of ticks(lo, hi, 4)) {
    g.append(svg('line', { class: Math.abs(v) < 1e-9 ? 'lab-zero' : 'lab-grid', x1: l, x2: r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, rT(v, 0)));
  }
  const area = (a, z) => `M${M.band.map((x, i) => `${X(i).toFixed(1)},${Y(x[a]).toFixed(1)}`).join('L')}L${[...M.band].map((x, i) => [i, x]).reverse().map(([i, x]) => `${X(i).toFixed(1)},${Y(x[z]).toFixed(1)}`).join('L')}Z`;
  g.append(svg('path', { class: 'ra-fan-90', d: area('p95', 'p5') }));
  g.append(svg('path', { class: 'ra-fan-50', d: area('p75', 'p25') }));
  for (const c of M.curves) g.append(svg('path', { class: 'ra-fan-run', d: c.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('') }));
  g.append(svg('path', { class: 'an-line ra-fan-median', d: M.band.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x.p50).toFixed(1)}`).join('') }));
  /* yours, as taken, for as far as it goes */
  const mine = [0, ...A.rows.map(x => x.eq)].slice(0, M.n + 1);
  g.append(svg('path', { class: 'ra-fan-mine', d: mine.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('') }));
  for (const i of [0, Math.round(M.n / 2), M.n]) g.append(svg('text', { class: 'lab-tick', x: X(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === M.n ? 'end' : 'middle' }, i === 0 ? 'start' : `trade ${i}`));
  const key = el('div', { class: 'ra-fan-key' },
    el('span', {}, el('i', { class: 'is-median' }), 'median'), el('span', {}, el('i', { class: 'is-50' }), 'middle half'),
    el('span', {}, el('i', { class: 'is-90' }), '9 in 10'), el('span', {}, el('i', { class: 'is-mine' }), 'yours'));
  wrap.prepend(g);
  wrap.append(key);
  return wrap;
}
