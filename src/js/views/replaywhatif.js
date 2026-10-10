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
import { calm, ease, easeInOut, countTo } from './motion.js';

const rT = (r, dp = 2) => `${r > 1e-9 ? '+' : r < -1e-9 ? '−' : ''}${Math.abs(r).toFixed(dp)}R`;
const pctOf = k => (k === 0 ? 'As taken' : `${k > 0 ? '+' : '−'}${Math.round(Math.abs(k) * 100)}%`);
const pfT = pf => (pf == null ? '—' : pf === Infinity ? '∞' : pf.toFixed(2));
const wrT = w => (w == null ? '—' : `${Math.round(w * 100)}%`);
const signCls = v => (v > 1e-9 ? 'is-up' : v < -1e-9 ? 'is-down' : '');

/* remembered while the app is open */
const memo = { tab: 'mc', stop: null, rr: null, mcN: null, seed: 1 };

/* ---------- motion ----------
   Played when something new is worked out — the card first shown, a tab
   changed, Run again, another run length — never on a click that only picks
   a square or a step (those glide the numbers from where they were). Off for
   anyone who asks their system for less motion. The helpers are motion.js. */

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
    paint(true);
  }).catch(e => { body.replaceChildren(el('p', { class: 'rp-empty' }, 'The prices could not be read: ' + (e.message || e))); });

  const TABS = [['mc', 'Monte Carlo'], ['rr', 'Risk : reward'], ['stop', 'Stop loss']];   // Monte Carlo first (Minato)
  const SUBS = {
    stop: 'each stop closer or further — the target where it was',
    rr: 'the stop moved, the target at a number of R — find the sweet spot',
    mc: 'these trades drawn again at random, a thousand times over',
  };
  function paintTabs() {
    tabs.replaceChildren(...TABS.map(([k, label]) => el('button', { class: k === memo.tab ? 'is-on' : '', 'data-tab': k, onClick: () => { if (memo.tab !== k) { memo.tab = k; paint(true); } } }, label)));
    sub.textContent = SUBS[memo.tab];
  }
  /* play: worked out afresh — the charts draw themselves in and the figures count up */
  let play = false;
  function paint(fresh = false) {
    paintTabs();
    if (!items) return;
    play = fresh && !calm();
    card.dataset.tab = memo.tab;
    const view = memo.tab === 'stop' ? stopTab() : memo.tab === 'rr' ? rrTab() : mcTab();
    if (play) view.classList.add('ra-wi-in');
    body.replaceChildren(view);
  }
  paintTabs();

  /* the numbers under a setting, beside the trades as taken */
  function compare(S, changed) {
    /* each figure glides to its new value (counts up when the tab is new) */
    let k = 0;
    const fig = (key, label, value, fmt, was, d, cls = '') => {
      const v = el('b', { class: 'rp-tv' });
      const delay = play ? 350 + 70 * k++ : 0;
      if (value == null || !Number.isFinite(value)) v.textContent = fmt(value); else countTo(v, 'cmp:' + key, value, fmt, { delay, dur: play ? 1000 : 450, fresh: play });
      return el('div', { class: 'card rp-tile ra-wi-tile ' + cls, style: play ? { '--d': delay + 'ms' } : {} },
        el('span', { class: 'rp-k' }, label), v, el('span', { class: 'rp-ts' }, `as taken ${was}${d ? ' · ' + d : ''}`));
    };
    const dR = S.total - actual.total;
    return el('div', { class: 'rp-tiles ra-wi-tiles' },
      fig('total', 'Total', S.total, v => rT(v), rT(actual.total), Math.abs(dR) > 1e-9 ? `${dR > 0 ? '+' : '−'}${Math.abs(dR).toFixed(2)}R` : 'the same', 'ra-wi-total ' + signCls(S.total)),
      fig('win', 'Win rate', S.winRate, wrT, wrT(actual.winRate), '', 'ra-wi-win'),
      fig('pf', 'Profit factor', S.pf === Infinity ? null : S.pf, v => (S.pf === Infinity ? '∞' : pfT(v)), pfT(actual.pf), '', 'ra-wi-pf'),
      fig('dd', 'Max drawdown', S.maxDD, v => (v < -1e-9 ? rT(v) : '0R'), actual.maxDD < -1e-9 ? rT(actual.maxDD) : '0R', '', 'ra-wi-dd'),
      fig('ch', 'Trades that change', changed, v => String(Math.round(v)), `of ${S.n}`, '', 'ra-wi-changed'));
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
      fitted(once((w, h, go) => sweepChart(sweep, best, memo.stop, w, h, pick, go)), 200),
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
        const ri = grid.indexOf(row), ci = row.indexOf(x);
        return el('button', { class: 'ra-rr-cell' + (x === best ? ' is-best' : '') + (x === S ? ' is-on' : ''), 'data-k': String(x.k), 'data-tr': String(x.tr),
          style: { background: bg, '--d': `${(ri + ci) * 38}ms`, '--dd': `${(ri + ci) * 38 + 520}ms` },
          title: `stop ${pctOf(x.k).toLowerCase()}, target ${x.tr}R: ${rT(x.total)} · win rate ${wrT(x.winRate)} · max drawdown ${rT(x.maxDD)}`,
          onClick: () => { memo.rr = { k: x.k, tr: x.tr }; paint(); } }, rT(x.total, 1));
      })));
    return el('div', { class: 'ra-wi-rr' },
      el('div', { class: 'ra-rr' + (play ? ' is-play' : '') }, head, ...rows),
      compare(S, changedOf(S)),
      el('p', { class: 'ra-wi-note' }, `The sweet spot here: stop ${pctOf(best.k).toLowerCase()}, target ${best.tr}R — ${rT(best.total)}, ${wrT(best.winRate)} won. Rows move the stop; columns put the target at that many of the new R.`));
  }

  /* ---------- Monte Carlo ---------- */
  function mcTab() {
    const rs = A.rows.map(x => x.r);   // the results as they were
    const choices = [...new Set([A.n, 50, 100, 250])].sort((a, b) => a - b);
    if (!choices.includes(memo.mcN)) memo.mcN = Math.max(A.n, 50);
    const M = sim.monteCarlo(rs, { n: memo.mcN, runs: 1000, seed: memo.seed, keep: 180 });
    let k = 0;
    const tile = (label, value, fmt, small, cls = '') => {
      const v = el('b', { class: 'rp-tv' });
      const delay = play ? 1250 + 90 * k++ : 0;
      countTo(v, 'mc:' + label, value, fmt, { delay, dur: play ? 1100 : 0, fresh: true });
      return el('div', { class: 'card rp-tile ra-wi-tile ' + cls, style: play ? { '--d': delay + 'ms' } : {} }, el('span', { class: 'rp-k' }, label), v, el('span', { class: 'rp-ts' }, small));
    };
    return el('div', { class: 'ra-wi-mc' },
      el('div', { class: 'ra-mc-bar' },
        el('span', { class: 'lab-sub' }, 'Trades in each run'),
        el('div', { class: 'seg ra-mc-n' }, ...choices.map(n => el('button', { class: n === memo.mcN ? 'is-on' : '', 'data-n': String(n), onClick: () => { if (memo.mcN !== n) { memo.mcN = n; paint(true); } } }, n === A.n ? `${n} (as many as taken)` : String(n)))),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn-quiet ra-mc-again', onClick: () => { memo.seed++; paint(true); } }, 'Run again')),
      fitted(once((w, h, go) => fanChart(M, A, w, h, go)), 260),
      el('div', { class: 'rp-tiles ra-wi-tiles' },
        tile('Median end', M.end.p50, v => rT(v), `half the runs ended above this`, 'ra-mc-median ' + signCls(M.end.p50)),
        tile('Worst 5%', M.end.p5, v => rT(v), `best 5% ${rT(M.end.p95)}`, 'ra-mc-p5 ' + signCls(M.end.p5)),
        tile('Ended below zero', M.belowZero * 100, v => `${Math.round(v)}%`, `of ${M.runs} runs`, 'ra-mc-below'),
        tile('Max drawdown', M.dd.p50, v => rT(v), `typical · 1 in 20 ${rT(M.dd.p5)}`, 'ra-mc-dd'),
        tile('Losing streak', M.streak.p50, v => `${Math.round(v)}`, `typical longest · 1 in 20: ${Math.round(M.streak.p95)}`, 'ra-mc-streak')),
      el('p', { class: 'ra-wi-note' }, `${M.runs} runs of ${M.n} trades, each trade picked at random from your ${A.n}. Shaded: where the middle half and nine in ten of the runs were after each trade; the line, the median.`));
  }

  /* a chart redrawn for a new size shows itself finished; only its first drawing plays */
  function once(draw) {
    let first = play;
    return (w, h) => { const go = first; first = false; return draw(w, h, go); };
  }

  card.__whatIf = { get items() { return items; }, get sweep() { return sweep; }, get grid() { return grid; }, memo };
  return card;
}

/* ---------- total R for each stop step ---------- */
function sweepChart(sweep, best, on, W, H, pick, go) {
  const wrap = el('div', { class: 'lab-svgwrap ra-sweep' + (go ? ' is-play' : '') });
  const l = 52, r = W - 16, t = 16, b = H - 26;
  let lo = Math.min(0, ...sweep.map(x => x.total)), hi = Math.max(0, ...sweep.map(x => x.total));
  if (hi - lo < 1e-9) { hi = 1; lo = -1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const X = i => l + (i / (sweep.length - 1)) * (r - l), Y = v => b - ((v - lo) / (hi - lo)) * (b - t);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const id = 'sw' + Math.random().toString(36).slice(2, 7);
  g.append(svg('defs', {}, svg('linearGradient', { id, x1: 0, x2: 0, y1: 0, y2: 1 },
    svg('stop', { offset: 0, 'stop-color': 'rgb(var(--profit-rgb))', 'stop-opacity': 0.22 }), svg('stop', { offset: 1, 'stop-color': 'rgb(var(--profit-rgb))', 'stop-opacity': 0 }))));
  for (const v of ticks(lo, hi, 4)) {
    g.append(svg('line', { class: Math.abs(v) < 1e-9 ? 'lab-zero' : 'lab-grid', x1: l, x2: r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, rT(v, 1)));
  }
  const line = sweep.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x.total).toFixed(1)}`).join('');
  g.append(svg('path', { class: 'ra-sweep-area', d: `${line}L${X(sweep.length - 1).toFixed(1)},${b}L${l},${b}Z`, fill: `url(#${id})` }));
  g.append(svg('path', { class: 'an-line ra-sweep-line', d: line, pathLength: 1 }));
  const tip = tipLayer(wrap);
  sweep.forEach((x, i) => {
    g.append(svg('text', { class: 'lab-tick', x: X(i), y: H - 8, 'text-anchor': 'middle' }, x.k === 0 ? 'taken' : pctOf(x.k)));
    g.append(svg('circle', { class: 'ra-sweep-dot ' + signCls(x.total) + (x.k === on ? ' is-on' : '') + (x === best ? ' is-best' : ''), cx: X(i), cy: Y(x.total), r: x.k === on ? 5.5 : 3.5, 'data-k': String(x.k),
      style: `--d:${180 + i * 55}ms; transform-origin:${X(i).toFixed(1)}px ${Y(x.total).toFixed(1)}px` }));
    if (x === best) {
      g.append(svg('circle', { class: 'ra-sweep-halo', cx: X(i), cy: Y(x.total), r: 9 }));
      g.append(svg('text', { class: 'ra-val ra-sweep-best', x: X(i), y: Y(x.total) - 14, 'text-anchor': 'middle' }, 'best'));
    }
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

/* ---------- Monte Carlo: the spread of the runs after each trade ----------
   Under the bands, a cloud: 180 of the runs drawn faintly on a canvas, light
   adding up where they cross, so the likely paths glow brightest. Played,
   the runs stream in left to right behind a scanning line, the bands open
   behind it, and the median draws itself with a light at its tip. */
function fanChart(M, A, W, H, go) {
  const wrap = el('div', { class: 'lab-svgwrap ra-fan' + (go ? ' is-play' : '') });
  const l = 52, r = W - 16, t = 12, b = H - 24;
  let lo = 0, hi = 0;
  for (const x of M.band) { lo = Math.min(lo, x.p5); hi = Math.max(hi, x.p95); }
  for (const x of A.rows) { lo = Math.min(lo, x.eq); hi = Math.max(hi, x.eq); }
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const X = i => l + (i / M.n) * (r - l), Y = v => b - ((v - lo) / (hi - lo)) * (b - t);

  /* the cloud */
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = el('canvas', { class: 'ra-fan-cloud', width: Math.round(W * dpr), height: Math.round(H * dpr), style: { width: W + 'px', height: H + 'px' } });
  const cx = cv.getContext('2d');
  const tint = getComputedStyle(document.documentElement).getPropertyValue('--profit-rgb').trim() || '24, 172, 101';
  const cloud = (p, at = q => 1) => {               // p: how far along (0–1); at(i): how much of run i is out
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, W, H);
    cx.save(); cx.beginPath(); cx.rect(l, t - 2, r - l, b - t + 4); cx.clip();
    cx.globalCompositeOperation = 'lighter';
    cx.lineWidth = 1; cx.strokeStyle = `rgba(${tint}, 0.075)`;
    M.curves.forEach((c, i) => {
      const upto = Math.floor(Math.min(1, at(i)) * M.n);
      if (upto < 1) return;
      cx.beginPath();
      for (let j = 0; j <= upto; j++) { const x = X(j), y = Y(c[j]); j ? cx.lineTo(x, y) : cx.moveTo(x, y); }
      cx.stroke();
    });
    cx.restore();
  };

  const g = svg('svg', { class: 'lab-svg ra-fan-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const id = 'fan' + Math.random().toString(36).slice(2, 7);
  const reveal = svg('rect', { x: l - 2, y: 0, width: go ? 0 : r - l + 4, height: H });
  g.append(svg('defs', {}, svg('clipPath', { id }, reveal),
    svg('filter', { id: id + 'g', x: '-50%', y: '-50%', width: '200%', height: '200%' }, svg('feGaussianBlur', { stdDeviation: 3.2 }))));
  for (const v of ticks(lo, hi, 4)) {
    g.append(svg('line', { class: Math.abs(v) < 1e-9 ? 'lab-zero' : 'lab-grid', x1: l, x2: r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, rT(v, 0)));
  }
  const area = (a, z) => `M${M.band.map((x, i) => `${X(i).toFixed(1)},${Y(x[a]).toFixed(1)}`).join('L')}L${[...M.band].map((x, i) => [i, x]).reverse().map(([i, x]) => `${X(i).toFixed(1)},${Y(x[z]).toFixed(1)}`).join('L')}Z`;
  const bands = svg('g', { 'clip-path': `url(#${id})` },
    svg('path', { class: 'ra-fan-90', d: area('p95', 'p5') }), svg('path', { class: 'ra-fan-50', d: area('p75', 'p25') }));
  g.append(bands);
  for (const c of M.curves.slice(0, 12)) g.append(svg('path', { class: 'ra-fan-run', d: c.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('') }));
  const med = M.band.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x.p50).toFixed(1)}`).join('');
  const medGlow = svg('path', { class: 'ra-fan-median-glow', d: med, filter: `url(#${id}g)`, pathLength: 1 });
  const medLine = svg('path', { class: 'an-line ra-fan-median', d: med, pathLength: 1 });
  if (go) for (const m of [medGlow, medLine]) { m.style.strokeDasharray = '1'; m.style.strokeDashoffset = '1'; }
  g.append(medGlow, medLine);
  /* yours, as taken, for as far as it goes */
  const mine = [0, ...A.rows.map(x => x.eq)].slice(0, M.n + 1);
  g.append(svg('path', { class: 'ra-fan-mine', d: mine.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('') }));
  const end = M.band[M.n];
  const headGlow = svg('circle', { class: 'ra-fan-head-glow', cx: X(M.n), cy: Y(end.p50), r: 9 });
  const head = svg('circle', { class: 'ra-fan-head', cx: X(M.n), cy: Y(end.p50), r: 3.4 });
  g.append(headGlow, head);
  const scan = svg('line', { class: 'ra-fan-scan', x1: l, x2: l, y1: t, y2: b });
  if (go) g.append(scan);
  for (const i of [0, Math.round(M.n / 2), M.n]) g.append(svg('text', { class: 'lab-tick', x: X(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === M.n ? 'end' : 'middle' }, i === 0 ? 'start' : `trade ${i}`));
  const key = el('div', { class: 'ra-fan-key' },
    el('span', {}, el('i', { class: 'is-median' }), 'median'), el('span', {}, el('i', { class: 'is-50' }), 'middle half'),
    el('span', {}, el('i', { class: 'is-90' }), '9 in 10'), el('span', {}, el('i', { class: 'is-mine' }), 'yours'));
  wrap.prepend(cv, g);
  wrap.append(key);

  if (!go) { cloud(1); return wrap; }
  /* the play: one clock for the canvas, the scanning line, the opening bands and the median's light */
  const N = M.curves.length, T_CLOUD = 1250, T_MED0 = 650, T_MED = 900;
  const at = (ms, i) => (ms - (i / N) * 520) / 520;                // each run streams out over half a second, staggered
  /* the median's light rides the line's own length, so it sits on the tip as the line draws */
  const pts = M.band.map((x, i) => [X(i), Y(x.p50)]), cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1] || 1;
  const medAt = p => {
    const want = p * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < want) i++;
    const seg = cum[i] - cum[i - 1] || 1, k = Math.max(0, Math.min(1, (want - cum[i - 1]) / seg));
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
  };
  requestAnimationFrame(() => {
    const t0 = performance.now();
    const frame = now => {
      if (!wrap.isConnected) return;
      const ms = now - t0;
      cloud(1, i => easeInOut(at(ms, i)));
      const sweep = easeInOut(ms / T_CLOUD), sx = l + (r - l) * sweep;
      scan.setAttribute('x1', sx); scan.setAttribute('x2', sx);
      scan.style.opacity = String(ms < T_CLOUD ? 0.9 : Math.max(0, 0.9 - (ms - T_CLOUD) / 300));
      reveal.setAttribute('width', Math.max(0, sx - l + 2));          // the bands open behind the scanning line
      const mp = ease((ms - T_MED0) / T_MED);
      for (const m of [medGlow, medLine]) m.style.strokeDashoffset = String(1 - mp);
      const [hx, hy] = medAt(mp);
      for (const c of [head, headGlow]) { c.setAttribute('cx', hx); c.setAttribute('cy', hy); }
      if (ms < Math.max(T_CLOUD + 320, T_MED0 + T_MED + 40)) requestAnimationFrame(frame);
      else { cloud(1); scan.remove(); reveal.setAttribute('width', r - l + 4); for (const m of [medGlow, medLine]) { m.style.strokeDasharray = ''; m.style.strokeDashoffset = ''; } wrap.classList.add('is-done'); }
    };
    requestAnimationFrame(frame);
  });
  return wrap;
}
