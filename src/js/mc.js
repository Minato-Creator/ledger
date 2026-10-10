/* ============================================================
   mc.js — a Monte Carlo of your own trading, with no firm in it.

   Your trades, as R, drawn at random thousands of times to play out the
   next fifty, hundred or five hundred trades. Each run is one future that
   your history makes possible; together they say where you are likely to
   finish, how deep the worst drawdown along the way is likely to be, and
   how long a losing run you should expect to sit through.

   Two choices make it honest rather than flattering.

   • Your edge is uncertain too. Before each run draws its trades, it first
     draws a plausible version of your history: as many trades as you have,
     picked from yours with replacement. A run is then played from that
     version. So a journal of forty trades gives a wider spread than one of
     four hundred with the same average — which is the truth about forty
     trades.

   • Everything is in R. Risk a trade only scales it: at 1% a −8R drawdown
     is −8%, at 0.5% it is −4%. So one simulation answers every risk at
     once, and "how much should I risk" becomes a matter of reading the
     drawdowns off at different scales. Risk is a share of the starting
     balance, not of whatever the balance has become — the way most traders
     and every prop firm size it — so the results add rather than compound.

   It is seeded: the same trades and settings give the same answer every
   time. What it cannot know: a journal is the past, and markets change.
   ============================================================ */
import { rng, pctile } from './lab.js';

export const HORIZONS = [50, 100, 250, 500];
export const MIN_TRADES = 10;   // Minato: 10 is enough to start (it was 20)

/**
 * Play the next `horizon` trades `runs` times.
 * rs: your R per trade. Returns everything sorted ascending where it is a
 * distribution, plus percentile bands along the way for the fan chart.
 */
export function simulate(rs, { horizon = 100, runs = 4000, seed = 11, keep = 1200, samples = 40 } = {}) {
  const n = rs.length;
  const rand = rng(seed + n * 7 + horizon);
  const finals = new Float64Array(runs);
  const dds = new Float64Array(runs);            // deepest fall, as a positive number of R
  const longL = new Int32Array(runs);            // longest run of losses
  const longW = new Int32Array(runs);
  const kept = Math.min(keep, runs);
  const paths = new Float32Array(kept * (horizon + 1));
  const hist = new Float64Array(n);

  for (let k = 0; k < runs; k++) {
    for (let i = 0; i < n; i++) hist[i] = rs[(rand() * n) | 0];
    let eq = 0, peak = 0, dd = 0, l = 0, w = 0, ml = 0, mw = 0;
    const row = k < kept ? k * (horizon + 1) : -1;
    for (let t = 0; t < horizon; t++) {
      const r = hist[(rand() * n) | 0];
      eq += r;
      if (eq > peak) peak = eq;
      if (peak - eq > dd) dd = peak - eq;
      if (r < 0) { l++; w = 0; if (l > ml) ml = l; }
      else if (r > 0) { w++; l = 0; if (w > mw) mw = w; }
      else { l = 0; w = 0; }                       // a scratch ends either run
      if (row >= 0) paths[row + t + 1] = eq;
    }
    finals[k] = eq; dds[k] = dd; longL[k] = ml; longW[k] = mw;
  }

  /* The fan: percentiles of the running total, at up to 120 points. */
  const every = Math.max(1, Math.ceil(horizon / 120));
  const col = new Float64Array(kept);
  const fan = [];
  for (let t = 0; t <= horizon; t += every) {
    for (let k = 0; k < kept; k++) col[k] = paths[k * (horizon + 1) + t];
    const s = Array.from(col).sort((a, b) => a - b);
    fan.push({ t, p5: pctile(s, .05), p25: pctile(s, .25), p50: pctile(s, .5), p75: pctile(s, .75), p95: pctile(s, .95) });
  }
  if (fan[fan.length - 1].t !== horizon) {
    for (let k = 0; k < kept; k++) col[k] = paths[k * (horizon + 1) + horizon];
    const s = Array.from(col).sort((a, b) => a - b);
    fan.push({ t: horizon, p5: pctile(s, .05), p25: pctile(s, .25), p50: pctile(s, .5), p75: pctile(s, .75), p95: pctile(s, .95) });
  }
  const few = [];
  for (let k = 0; k < Math.min(samples, kept); k++) few.push(Array.from(paths.subarray(k * (horizon + 1), (k + 1) * (horizon + 1))));

  const sort = a => Array.from(a).sort((x, y) => x - y);
  return { runs, horizon, n, finals: sort(finals), dds: sort(dds), longL: sort(longL), longW: sort(longW), fan, few };
}

/** The share of a sorted list at or above a value. */
export function shareAtLeast(sorted, v) {
  let i = 0, j = sorted.length;
  while (i < j) { const m = (i + j) >> 1; if (sorted[m] < v - 1e-12) i = m + 1; else j = m; }
  return (sorted.length - i) / sorted.length;
}

/** The chance a drawdown reaches `limitPct` at `riskPct` a trade. */
export const chanceOfLimit = (dds, riskPct, limitPct) => shareAtLeast(dds, limitPct / riskPct);

/**
 * The most you can risk and still keep the chance of reaching the limit to
 * `chance` or less. Drawdowns in R come in ties — a run of even-money trades
 * falls a whole number of R — so this is not just the percentile: it is the
 * drawdown below which no more than `chance` of runs lie beyond, nudged up
 * by a hair so the tied runs at it fall short of the limit, not on it.
 */
export function riskFor(dds, limitPct, chance) {
  const n = dds.length;
  if (!n) return null;
  const v = dds[Math.max(0, Math.ceil(n * (1 - chance)) - 1)];
  return v > 0 ? limitPct / (v * (1 + 1e-9)) : null;
}

/** The chance of a run of at least k losses somewhere in the next trades, for k = 1…. */
export function streakOdds(longL) {
  const top = longL[longL.length - 1] || 0;
  const out = [];
  for (let k = 1; k <= top; k++) out.push({ k, p: shareAtLeast(longL, k) });
  return out;
}

/**
 * Kelly: the share of the account a trade would risk if growth were all that
 * mattered — the f that makes the average of log(1 + f·r) largest. As a
 * percentage. It assumes your edge is exactly what the journal says and
 * that you compound, so it is a ceiling, not a target; most traders who use
 * it at all use a quarter to a half.
 */
export function kelly(rs) {
  const n = rs.length;
  if (!n) return null;
  const mean = rs.reduce((a, b) => a + b, 0) / n;
  if (!(mean > 0)) return 0;
  const worst = Math.min(...rs);
  if (worst >= 0) return null;                   // never lost: no ceiling to find
  const cap = 0.999 / -worst;                    // past this one trade could take everything
  const g = f => rs.reduce((a, r) => a + Math.log(1 + f * r), 0) / n;
  let lo = 0, hi = cap;
  for (let i = 0; i < 80; i++) {                 // golden-section on a concave curve
    const a = lo + (hi - lo) * 0.382, b = lo + (hi - lo) * 0.618;
    if (g(a) < g(b)) lo = a; else hi = b;
  }
  return ((lo + hi) / 2) * 100;
}

/** What your trades look like, summed up. */
export function describe(rs) {
  const n = rs.length;
  const wins = rs.filter(r => r > 0), losses = rs.filter(r => r < 0);
  const mean = n ? rs.reduce((a, b) => a + b, 0) / n : null;
  const sd = n > 1 ? Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  return {
    n, mean, sd, se: sd != null ? sd / Math.sqrt(n) : null,
    winRate: wins.length + losses.length ? wins.length / (wins.length + losses.length) : null,
    avgWin: wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null,
    avgLoss: losses.length ? -losses.reduce((a, b) => a + b, 0) / losses.length : null,
  };
}

export { pctile };
