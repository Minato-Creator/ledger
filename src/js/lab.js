/* ============================================================
   lab.js — what a prop-firm challenge is worth, played on your own trades.

   A Monte Carlo simulation. It takes the trades already in your journal,
   plays them in a fresh random order thousands of times against a firm's
   rules as you typed them in, and counts what happened: how often you pass,
   how often you get paid, how much, and what that makes one evaluation worth
   on average once the fees are paid.

   Four decisions shape it, and each is the honest one rather than the easy
   one.

   • It replays whole days, not single trades. A day is drawn from your own
     history with every trade you took that day, in the order they closed.
     So how many trades you take in a day, and what you do after a loss, come
     from what you actually do — nothing about your behaviour is assumed, and
     a daily loss limit meets the kind of days you really have.

   • It is seeded. The same trades and the same rules give the same answer
     every time, so a number moves only because something changed.

   • It says how sure it is. Your edge is measured on a sample, and a
     challenge's value swings hard on it. So besides the headline figure, the
     whole thing is run again on many plausible versions of your history —
     each one a resample of your own days — and the spread of those answers
     is reported. "Worth $2,500" on 60 trades and on 600 are different claims.

   • It finds the line. The edge at which the challenge stops paying for
     itself, found by shifting every trade by the same amount of R until the
     average comes to nothing. That is the number that says whether to buy.

   What it cannot see: a journal records how a trade closed, not how far it
   went against you while it was open. Drawdown and daily-loss limits are
   checked trade by trade on closed results, which is exact for a static or
   end-of-day drawdown and optimistic for one that trails open profit.
   ============================================================ */
import * as c from './calc.js';

/* ---------- random numbers ----------
   Mulberry32: small, fast and good enough for resampling, and above all
   repeatable from a seed. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEEKS_PER_MONTH = 52 / 12;

/* ---------- the sample ----------
   Closed trades with an R, grouped into the days they were taken on and put
   in closing order within each day. A trade with no R — a live trade with no
   risk set — cannot be sized, so it is left out and counted as left out. */
export function sampleFrom(account, trades) {
  const usable = [];
  let skipped = 0;
  for (const t of trades) {
    if (t.status === 'open') continue;
    const r = c.rMultiple(account, t);
    if (r == null || !isFinite(r)) { skipped++; continue; }
    usable.push({ t, r });
  }
  usable.sort((a, b) =>
    (a.t.date + (a.t.timeClose || a.t.timeOpen || '99:99')).localeCompare(b.t.date + (b.t.timeClose || b.t.timeOpen || '99:99')));

  const byDay = new Map();
  for (const { t, r } of usable) {
    if (!byDay.has(t.date)) byDay.set(t.date, []);
    byDay.get(t.date).push(r);
  }
  const dates = [...byDay.keys()].sort();
  const days = dates.map(d => byDay.get(d));
  const rs = usable.map(x => x.r);
  const n = rs.length;
  const mean = n ? rs.reduce((a, b) => a + b, 0) / n : null;
  const sd = n > 1 ? Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;

  /* How often you trade, from the calendar you actually kept: traded days
     over the weeks between your first and last. Payout schedules and the
     funded horizon are in calendar time, so this is how they become days
     drawn in the simulation. */
  let perWeek = null;
  if (dates.length) {
    const span = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 864e5 + 1;
    const weeks = Math.max(1, span / 7);
    perWeek = Math.min(5, Math.max(0.5, dates.length / weeks));
  }
  const wins = rs.filter(r => r > 0).length, losses = rs.filter(r => r < 0).length;
  return {
    days, trades: n, dayCount: days.length, skipped,
    meanR: mean, sdR: sd, se: sd != null ? sd / Math.sqrt(n) : null,
    winRate: wins + losses ? wins / (wins + losses) : null,
    bestR: n ? Math.max(...rs) : null, worstR: n ? Math.min(...rs) : null,
    perDay: days.length ? n / days.length : null,
    perWeek, from: dates[0] || null, to: dates[dates.length - 1] || null,
  };
}

/** Enough to say anything at all. Below this the page explains rather than
    printing a number that would look far more certain than it is. */
export const MIN_TRADES = 10;   // Minato: 10 is enough to start (it was 20)
export const MIN_DAYS = 5;

/* ---------- the rule sheet ---------- */

export const DD_TYPES = [
  ['static', 'Static', 'A fixed floor below the starting balance that never moves'],
  ['eod', 'Trailing · EOD', 'The floor follows your highest end-of-day balance up'],
  ['intraday', 'Trailing · intraday ≈', 'The floor follows your highest balance up, trade by trade. The real one also follows open profit, which a journal cannot see, so real results will be a little worse'],
];

/** A new, empty sheet. Nothing is filled in on purpose: these are your
    firm's rules, and a guessed default is a wrong number that looks right. */
export function blankSheet(name = 'New firm') {
  return {
    id: 'f_' + Math.random().toString(36).slice(2, 8),
    name,
    size: null, fee: null, activation: null, refund: false,
    steps: 1, target1: null, target2: null,
    eval: { dd: null, ddType: 'static', lock: false, daily: null, dailyMode: 'fail', minDays: null, best: null, limitDays: null },
    funded: { dd: null, ddType: 'static', lock: false, daily: null, dailyMode: 'fail',
              firstDays: null, everyDays: null, minPayout: null, best: null, split: null, cap: null, buffer: null, needLock: false },
  };
}

const num = v => (v === '' || v == null || !isFinite(Number(v)) ? null : Number(v));

/** What the sheet still needs before it can be run, in words. */
export function missing(sheet) {
  const out = [];
  if (!(num(sheet.size) > 0)) out.push('account size');
  if (num(sheet.fee) == null) out.push('evaluation fee');
  if (!(num(sheet.target1) > 0)) out.push(sheet.steps === 2 ? 'step 1 target' : 'profit target');
  if (sheet.steps === 2 && !(num(sheet.target2) > 0)) out.push('step 2 target');
  if (!(num(sheet.eval?.dd) > 0)) out.push('evaluation drawdown');
  if (!(num(sheet.funded?.dd) > 0)) out.push('funded drawdown');
  if (!(num(sheet.funded?.split) > 0)) out.push('profit split');
  return out;
}

/* ---------- one account, one run ---------- */

/* Where the floor is. Static never moves. A trailing floor follows the peak
   up and never comes back down; "stops at the starting balance" means it
   follows until it reaches the balance you started with and stays there. */
const floorOf = (type, size, dd, peak, lock) => {
  if (type === 'static') return size - dd;
  const f = peak - dd;
  return lock ? Math.min(f, size) : f;
};

/**
 * One evaluation step. Days are drawn from `days` until the account passes
 * or fails. The target is checked after every trade — you stop when you have
 * passed — but only counts once the minimum days and the consistency rule are
 * both met; until then you keep trading.
 */
function playEval(days, rand, shift, P, path = null) {
  let bal = P.size, peak = P.size, floor = floorOf(P.type, P.size, P.dd, peak, P.lock);
  let d = 0, bestDay = 0;
  if (path) path.push(0, 0);
  for (;;) {
    if (d >= P.maxDays) return { passed: false, why: P.limited ? 'time' : 'stale', days: d };
    const day = days[(rand() * days.length) | 0];
    let dayPnl = 0;
    for (let i = 0; i < day.length; i++) {
      const pnl = (day[i] + shift) * P.risk;
      bal += pnl; dayPnl += pnl;
      /* The path a chart draws: one point per trade, spread across its day. */
      if (path) path.push(d + (i + 1) / day.length, bal - P.size);
      if (P.type === 'intraday' && bal > peak) { peak = bal; floor = floorOf(P.type, P.size, P.dd, peak, P.lock); }
      if (bal <= floor + 1e-9) return { passed: false, why: 'drawdown', days: d + 1 };
      if (P.daily != null && dayPnl <= -P.daily + 1e-9) {
        if (P.dailyMode === 'fail') return { passed: false, why: 'daily', days: d + 1 };
        break;                                   // done for the day
      }
      const profit = bal - P.size;
      const best = Math.max(bestDay, dayPnl);
      if (profit >= P.target - 1e-9 && d + 1 >= P.minDays && (P.best == null || best <= P.best * profit + 1e-9)) {
        return { passed: true, days: d + 1 };
      }
    }
    d++;
    if (P.type === 'eod' && bal > peak) { peak = bal; floor = floorOf(P.type, P.size, P.dd, peak, P.lock); }
    if (dayPnl > bestDay) bestDay = dayPnl;
  }
}

/**
 * The funded account, for as long as the horizon allows or until it breaks.
 *
 * A payout is taken at the end of the first day it is allowed: the schedule
 * has come round, the profit is at least the minimum, the consistency rule
 * holds over the cycle, and — if the firm asks — the trailing floor has
 * reached the starting balance. What can be taken is the profit above the
 * higher of the starting balance and the floor, less any buffer you choose to
 * leave in; you are paid your split of it. The floor never comes back down
 * after a payout, which is exactly why a buffer matters.
 */
function playFunded(days, rand, shift, F) {
  let bal = F.size, peak = F.size, floor = floorOf(F.type, F.size, F.dd, peak, F.lock);
  let d = 0, paid = 0, payouts = 0, next = F.first, cycleProfit = 0, cycleBest = 0;
  while (d < F.horizon) {
    const day = days[(rand() * days.length) | 0];
    let dayPnl = 0;
    for (let i = 0; i < day.length; i++) {
      const pnl = (day[i] + shift) * F.risk;
      bal += pnl; dayPnl += pnl;
      if (F.type === 'intraday' && bal > peak) { peak = bal; floor = floorOf(F.type, F.size, F.dd, peak, F.lock); }
      if (bal <= floor + 1e-9) return { paid, payouts, blown: true, why: 'drawdown', days: d + 1 };
      if (F.daily != null && dayPnl <= -F.daily + 1e-9) {
        if (F.dailyMode === 'fail') return { paid, payouts, blown: true, why: 'daily', days: d + 1 };
        break;
      }
    }
    d++;
    if (F.type === 'eod' && bal > peak) { peak = bal; floor = floorOf(F.type, F.size, F.dd, peak, F.lock); }
    cycleProfit += dayPnl;
    if (dayPnl > cycleBest) cycleBest = dayPnl;

    if (d >= next) {
      let amount = bal - Math.max(F.size, floor) - F.buffer;
      const lockOk = !F.needLock || floor >= F.size - 1e-9;
      const bestOk = F.best == null || (cycleProfit > 0 && cycleBest <= F.best * cycleProfit + 1e-9);
      if (amount > 1e-9 && amount >= F.minPayout && lockOk && bestOk) {
        if (F.cap != null) amount = Math.min(amount, F.cap);
        bal -= amount;
        paid += amount * F.split;
        payouts++;
        next = d + F.every;
        cycleProfit = 0; cycleBest = 0;
      }
    }
  }
  return { paid, payouts, blown: false, days: d };
}

/* Calendar days become days drawn from your history at the rate you trade. */
const toDrawn = (calendarDays, perWeek) => Math.max(1, Math.ceil(calendarDays / 7 * perWeek));

/** The sheet and the plan, turned into the numbers the loops use. */
export function prepare(sheet, plan, sample) {
  const size = num(sheet.size);
  const pw = sample.perWeek || 5;
  const pct = v => (num(v) == null ? null : num(v) / 100 * size);
  const e = sheet.eval || {}, f = sheet.funded || {};
  const limited = num(e.limitDays) > 0;
  const E = {
    size, risk: (num(plan.riskEval) || 0) / 100 * size,
    dd: pct(e.dd), type: e.ddType || 'static', lock: !!e.lock,
    daily: pct(e.daily), dailyMode: e.dailyMode === 'stop' ? 'stop' : 'fail',
    minDays: num(e.minDays) || 0, best: num(e.best) != null ? num(e.best) / 100 : null,
    limited, maxDays: limited ? toDrawn(num(e.limitDays), pw) : Math.round(52 * pw),
  };
  const trailing = (f.ddType || 'static') !== 'static';
  const F = {
    size, risk: (num(plan.riskFunded) || 0) / 100 * size,
    dd: pct(f.dd), type: f.ddType || 'static', lock: !!f.lock,
    daily: pct(f.daily), dailyMode: f.dailyMode === 'stop' ? 'stop' : 'fail',
    first: toDrawn(num(f.firstDays) || 0, pw), every: toDrawn(num(f.everyDays) || num(f.firstDays) || 14, pw),
    minPayout: num(f.minPayout) || 0, best: num(f.best) != null ? num(f.best) / 100 : null,
    split: (num(f.split) || 0) / 100, cap: num(f.cap) > 0 ? num(f.cap) : null, buffer: num(f.buffer) || 0,
    needLock: !!f.needLock && trailing && !!f.lock,
    horizon: Math.max(1, Math.round((num(plan.months) || 6) * WEEKS_PER_MONTH * pw)),
  };
  if (!(num(f.firstDays) > 0)) F.first = 1;
  const targets = [pct(sheet.target1)];
  if (sheet.steps === 2) targets.push(pct(sheet.target2));
  return {
    E, F, targets,
    fee: num(sheet.fee) || 0, activation: num(sheet.activation) || 0, refund: !!sheet.refund,
    perWeek: pw,
  };
}

/**
 * `runs` accounts from buying the evaluation to the end of the horizon.
 * Returns every figure the page shows about them. `collect: false` keeps
 * only the mean and its spread, for the many quick runs behind the margin of
 * error and the break-even search.
 */
export function simulate(days, prep, { runs = 10000, seed = 1, shift = 0, collect = true, tracks = 0 } = {}) {
  const rand = rng(seed);
  const { E, F, targets, fee, activation, refund } = prep;
  let sum = 0, sumSq = 0;
  const nets = collect ? new Float64Array(runs) : null;
  const paidOut = collect ? [] : null;
  const tally = { passed: 0, paid: 0, blown: 0, survived: 0,
                  fail: { drawdown: 0, daily: 0, time: 0, stale: 0 }, lost: { drawdown: 0, daily: 0 },
                  passDays: 0, payouts: 0, failedStep2: 0, unpaidAlive: 0 };
  /* For the chart of the evaluation: a handful of whole paths to draw, and
     for every account the day its first step ended and how. */
  const paths = collect && tracks ? [] : null;
  const ends = collect ? { pass: [], fail: [], open: [] } : null;
  const bump = (arr, i) => { arr[i] = (arr[i] || 0) + 1; };

  for (let k = 0; k < runs; k++) {
    let cost = fee, net;
    let passed = true, used = 0;
    for (let s = 0; s < targets.length; s++) {
      const path = paths && s === 0 && k < tracks ? [] : null;
      const r = playEval(days, rand, shift, { ...E, target: targets[s] }, path);
      used += r.days;
      if (s === 0 && ends) {
        const how = r.passed ? 'pass' : r.why === 'stale' ? 'open' : 'fail';
        bump(ends[how], r.days);
        if (path) paths.push({ pts: Float32Array.from(path), end: how });
      }
      if (!r.passed) { passed = false; if (collect) { tally.fail[r.why]++; if (s === 1) tally.failedStep2++; } break; }
    }
    if (!passed) {
      net = -cost;
    } else {
      cost += activation;
      const f = playFunded(days, rand, shift, F);
      let got = f.paid;
      if (refund && f.payouts > 0) got += fee;
      net = got - cost;
      if (collect) {
        tally.passed++; tally.passDays += used;
        if (f.payouts > 0) { tally.paid++; tally.payouts += f.payouts; paidOut.push(got); }
        if (f.blown) { tally.blown++; if (f.payouts === 0) tally.lost[f.why]++; }
        else { tally.survived++; if (f.payouts === 0) tally.unpaidAlive++; }
      }
    }
    sum += net; sumSq += net * net;
    if (collect) nets[k] = net;
  }
  const mean = sum / runs;
  const variance = runs > 1 ? Math.max(0, (sumSq - runs * mean * mean) / (runs - 1)) : 0;
  return { runs, mean, variance, nets, paidOut, tally, paths, ends };
}

/** A different history you could as easily have had: your days, drawn again
    with replacement, as many as you really traded. */
export function resample(days, rand) {
  const out = new Array(days.length);
  for (let i = 0; i < days.length; i++) out[i] = days[(rand() * days.length) | 0];
  return out;
}

export const pctile = (sorted, q) => {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
};

/**
 * The whole analysis, as steps a page can spread over several frames.
 * Drain it with `run()` when there is nothing to keep responsive.
 *
 *   main       `runs` accounts on your history as it is — the headline.
 *   range      the same on `histories` resampled histories; the spread of
 *              their averages, less the part that is only simulation noise,
 *              is how far the headline could reasonably be off.
 *   breakEven  the shift in R, applied to every trade, at which the average
 *              comes to zero — searched on common random numbers so the
 *              curve it bisects is smooth.
 */
/* A generator, and exported under a plain name: the single-file bundler
   reads `export function` and `export const`, not `export function*`. */
function* analyseSteps(sample, sheet, plan, {
  runs = 10000, histories = 40, perHistory = 400, searchRuns = 3000, seed = 20260929,
} = {}) {
  const prep = prepare(sheet, plan, sample);
  const days = sample.days;

  yield { stage: 'main', done: 0 };
  const main = simulate(days, prep, { runs, seed, collect: true, tracks: 90 });

  const master = rng(seed ^ 0x9E3779B9);
  const evs = [], within = [];
  for (let k = 0; k < histories; k++) {
    const h = resample(days, master);
    const r = simulate(h, prep, { runs: perHistory, seed: seed + 1 + k, collect: false });
    evs.push(r.mean); within.push(r.variance);
    if (k % 5 === 4) yield { stage: 'range', done: (k + 1) / histories };
  }
  const evMean = evs.reduce((a, b) => a + b, 0) / evs.length;
  const between = evs.reduce((a, b) => a + (b - evMean) ** 2, 0) / Math.max(1, evs.length - 1);
  const noise = within.reduce((a, b) => a + b, 0) / within.length / perHistory;
  const spread = Math.sqrt(Math.max(0, between - noise));
  const Z80 = 1.2816;

  /* The line. EV rises with the edge; bisect on the shift. */
  const at = shift => simulate(days, prep, { runs: searchRuns, seed: seed + 7777, shift, collect: false }).mean;
  let lo = -1, hi = 1, fLo = at(lo), fHi = at(hi);
  let breakEven;
  if (fHi < 0) breakEven = { status: 'above', meanR: sample.meanR + hi };
  else if (fLo > 0) breakEven = { status: 'below', meanR: sample.meanR + lo };
  else {
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2, fm = at(mid);
      if (fm >= 0) { hi = mid; fHi = fm; } else { lo = mid; fLo = fm; }
      if (i % 3 === 2) yield { stage: 'line', done: (i + 1) / 12 };
    }
    const shift = (lo + hi) / 2;
    breakEven = { status: 'found', shift, meanR: sample.meanR + shift };
  }

  /* What the evaluation is worth across a range of edges around yours, on
     common random numbers so the curve is smooth rather than noisy. It is
     drawn wide enough to show the uncertainty in your own edge, and wider
     still if that is what it takes to reach the break-even point. */
  const margin = sample.se != null ? 1.96 * sample.se : 0.15;
  let span = Math.min(0.6, Math.max(0.15, margin * 1.4));
  if (breakEven.status === 'found' && Math.abs(breakEven.shift) > span * 0.9) span = Math.min(1, Math.abs(breakEven.shift) * 1.25);
  const curve = [];
  const STEPS = 16;
  for (let i = 0; i <= STEPS; i++) {
    const sh = -span + (2 * span * i) / STEPS;
    curve.push({ edge: sample.meanR + sh, ev: at(sh) });
    if (i % 4 === 3) yield { stage: 'curve', done: (i + 1) / (STEPS + 1) };
  }

  /* The first step's endings, day by day, as running shares of every run. */
  const lastDay = Math.max(main.ends.pass.length, main.ends.fail.length, main.ends.open.length);
  const cum = { pass: [], fail: [], open: [] };
  for (const k of ['pass', 'fail', 'open']) {
    let run = 0;
    for (let d = 0; d < lastDay; d++) { run += main.ends[k][d] || 0; cum[k].push(run / runs); }
  }
  const lengths = [];
  for (const k of ['pass', 'fail', 'open']) main.ends[k].forEach((n, d) => { for (let i = 0; i < (n || 0); i++) lengths.push(d); });
  lengths.sort((a, b) => a - b);

  const sorted = Array.from(main.nets).sort((a, b) => a - b);
  const paid = main.paidOut.slice().sort((a, b) => a - b);
  const T = main.tally;
  return {
    runs, perWeek: prep.perWeek, horizonMonths: num(plan.months) || 6,
    ev: main.mean,
    evRange: [main.mean - Z80 * spread, main.mean + Z80 * spread],
    passRate: T.passed / runs,
    paidRate: T.paid / runs,
    /* Every account ends one of four ways. The last is rare with a sensible
       horizon, but it is not a failure and is not counted as one. */
    rates: {
      failed: (runs - T.passed) / runs,
      blownUnpaid: (T.passed - T.paid - T.unpaidAlive) / runs,
      unpaidAlive: T.unpaidAlive / runs,
      paid: T.paid / runs,
    },
    fail: T.fail, lost: T.lost, failedStep2: T.failedStep2,
    survivedRate: T.passed ? T.survived / T.passed : null,
    avgPassDays: T.passed ? T.passDays / T.passed : null,
    avgPayouts: T.paid ? T.payouts / T.paid : null,
    netPct: { p10: pctile(sorted, .1), p25: pctile(sorted, .25), p50: pctile(sorted, .5), p75: pctile(sorted, .75), p90: pctile(sorted, .9) },
    paidPct: { p10: pctile(paid, .1), p25: pctile(paid, .25), p50: pctile(paid, .5), p75: pctile(paid, .75), p90: pctile(paid, .9) },
    paid, fee: prep.fee, activation: prep.activation,
    breakEven, curve,
    evalChart: {
      paths: main.paths, cum, days: lastDay,
      p95Days: pctile(lengths, 0.95) || 1,
      target: prep.targets[0], floor: -prep.E.dd, ddType: prep.E.type,
      steps: prep.targets.length,
    },
  };
}

export const analyse = analyseSteps;

/** Drain the analysis in one go. */
export function run(sample, sheet, plan, opts) {
  const it = analyse(sample, sheet, plan, opts);
  for (;;) { const s = it.next(); if (s.done) return s.value; }
}
