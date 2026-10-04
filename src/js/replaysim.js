/* ============================================================
   replaysim.js — "what if" for Replay's finished trades, worked out on
   the same one-minute prices the session played. Nothing is changed:
   these are numbers about the trades, never edits to them.

   • Stop loss: each stop moved closer or further from the entry (a share
     of its own distance), the target where it was. The trade is played
     again from the minute after it opened: the stop first if both are
     touched in one minute (as Replay fills them).
   • Risk : reward: the stop moved as above, and the target set at a
     number of R — R being the new stop's distance.
   • Monte Carlo: the trades' R results drawn again at random, many times
     over, to see the spread of equity curves they could have made.

   Results are in R (the new stop's distance is the new 1R; the risk in
   money stays what it was). A trade closed by hand that neither level
   would have reached still closes where and when it did; one that ran to
   its stop or target runs on until a level is hit or the session ends —
   then it closes at the last price.
   ============================================================ */

/** The minutes a trade is played over: after the minute it opened, up to `endT`. */
export function pathOf(rows, t, endT) {
  let lo = 0, hi = rows.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m][0] <= t.openT) lo = m + 1; else hi = m; }
  let z = lo;
  while (z < rows.length && rows[z][0] <= endT) z++;
  return rows.slice(lo, z);
}

/**
 * One trade played again with its stop moved (`stopMul` × its distance) and
 * its target kept (`targetR` null) or put at `targetR` × the new distance.
 * → { r, exit, exitT, how: 'sl' | 'tp' | 'manual' | 'end' }
 */
export function simTrade(t, path, { stopMul = 1, targetR = null } = {}) {
  const long = t.side === 'buy', sign = long ? 1 : -1;
  const sl0 = t.initSl ?? t.sl;
  const dist0 = Math.abs(t.entry - sl0);
  if (!(dist0 > 0)) return { r: Number(t.r) || 0, exit: t.exit, exitT: t.closeT, how: t.reason };
  const dist = dist0 * stopMul;
  const sl = t.entry - sign * dist;
  const tp = targetR != null ? t.entry + sign * targetR * dist : t.tp;
  const manual = t.reason === 'manual';
  const R = p => (p - t.entry) * sign / dist;
  for (const [T, , h, l] of path) {
    if (manual && T > t.closeT) break;
    if (long ? l <= sl : h >= sl) return { r: R(sl), exit: sl, exitT: T, how: 'sl' };
    if (tp != null && (long ? h >= tp : l <= tp)) return { r: R(tp), exit: tp, exitT: T, how: 'tp' };
  }
  if (manual) return { r: R(t.exit), exit: t.exit, exitT: t.closeT, how: 'manual' };
  const last = path.length ? path[path.length - 1][4] : t.exit;
  return { r: R(last), exit: last, exitT: path.length ? path[path.length - 1][0] : t.closeT, how: 'end' };
}

/** What a list of R results adds up to. */
export function summary(rs) {
  let eq = 0, peak = 0, dd = 0, gw = 0, gl = 0, won = 0, lost = 0;
  for (const r of rs) {
    eq += r; if (eq > peak) peak = eq; if (eq - peak < dd) dd = eq - peak;
    if (r > 1e-9) { won++; gw += r; } else if (r < -1e-9) { lost++; gl -= r; }
  }
  return { n: rs.length, total: eq, won, lost, winRate: rs.length ? won / rs.length : null,
    pf: gl > 0 ? gw / gl : won ? Infinity : null, maxDD: dd, avg: rs.length ? eq / rs.length : null };
}

/** Every trade under one setting → its results and what they add up to. */
export function simAll(items, setting) {
  /* nothing moved: the trades exactly as they closed (their own fills, to the tick) */
  const same = (setting.stopMul ?? 1) === 1 && setting.targetR == null;
  const res = items.map(x => (same ? { r: Number(x.t.r) || 0, exit: x.t.exit, exitT: x.t.closeT, how: x.t.reason } : simTrade(x.t, x.path, setting)));
  return { res, ...summary(res.map(x => x.r)) };
}

export const STOP_STEPS = [-0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.5, 0.75, 1];
export const RR_STOPS = [-0.4, -0.2, 0, 0.2, 0.4];
export const RR_TARGETS = [1, 1.5, 2, 2.5, 3, 4, 5];

/** The stop moved by each step, the target kept. */
export const stopSweep = items => STOP_STEPS.map(k => ({ k, ...simAll(items, { stopMul: 1 + k }) }));
/** Each stop × each target. */
export const rrGrid = items => RR_STOPS.map(k => RR_TARGETS.map(tr => ({ k, tr, ...simAll(items, { stopMul: 1 + k, targetR: tr }) })));

/* ---------- Monte Carlo ---------- */
/** A small, seeded random number source, so a run can be seen again. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const q = (sorted, p) => {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
/**
 * `runs` equity curves of `n` trades each, every trade drawn at random
 * (with replacement) from `rs`. → the spread at each step (5th, 25th,
 * median, 75th, 95th percentiles), a few whole curves, and how the ends,
 * drawdowns and losing streaks came out.
 */
export function monteCarlo(rs, { n = rs.length, runs = 1000, seed = 1, keep = 12 } = {}) {
  const rand = rng(seed);
  const steps = Array.from({ length: n + 1 }, () => new Float64Array(runs));
  const ends = [], dds = [], streaks = [], curves = [];
  for (let k = 0; k < runs; k++) {
    let eq = 0, peak = 0, dd = 0, run = 0, worst = 0;
    const curve = k < keep ? [0] : null;
    for (let i = 1; i <= n; i++) {
      const r = rs[Math.floor(rand() * rs.length)];
      eq += r; if (eq > peak) peak = eq; if (eq - peak < dd) dd = eq - peak;
      if (r < -1e-9) { run++; if (run > worst) worst = run; } else run = 0;
      steps[i][k] = eq;
      if (curve) curve.push(eq);
    }
    ends.push(eq); dds.push(dd); streaks.push(worst);
    if (curve) curves.push(curve);
  }
  const band = steps.map(col => { const s = Array.from(col).sort((a, b) => a - b); return { p5: q(s, 0.05), p25: q(s, 0.25), p50: q(s, 0.5), p75: q(s, 0.75), p95: q(s, 0.95) }; });
  const sE = [...ends].sort((a, b) => a - b), sD = [...dds].sort((a, b) => a - b), sS = [...streaks].sort((a, b) => a - b);
  return { n, runs, band, curves,
    end: { p5: q(sE, 0.05), p50: q(sE, 0.5), p95: q(sE, 0.95) },
    belowZero: ends.filter(x => x < 0).length / runs,
    dd: { p50: q(sD, 0.5), p5: q(sD, 0.05) },
    streak: { p50: q(sS, 0.5), p95: q(sS, 0.95) } };
}
