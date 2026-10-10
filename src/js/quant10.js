/* ============================================================
   quant10.js — every version over every year a pair has, a year at a time.

   Ten years of one-minute candles is ~3.5 million rows a pair: too much to
   hold at once beside the page. So the years are traded one by one, each
   with two months before it to build the structure up (warm-up) and one
   after it for the last trades to close; only the trades opened inside the
   year are kept. The curves grow a year at a time as the work goes.

   Pure functions: run in the quant worker (quantworker.js), or on the page
   when no worker can start.
   ============================================================ */
import { backtest } from './quant.js';
import { prepare13, run13 } from './quant13.js';

const DAY = 86400;
const monthStart = key => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, 1) / 1000;
const addMonths = (key, n) => { const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };

/**
 * The year-chunks for the months a pair has: [{ year, keepFrom, keepTo, months: [keys to read] }].
 * The first two months are warm-up only.
 */
export function planYears(monthKeys) {
  const keys = [...monthKeys].sort();
  if (keys.length < 4) return [];
  const first = monthStart(addMonths(keys[0], 2)), last = monthStart(addMonths(keys[keys.length - 1], 1));
  const out = [];
  for (let y = +keys[0].slice(0, 4); y <= +keys[keys.length - 1].slice(0, 4); y++) {
    const keepFrom = Math.max(first, Date.UTC(y, 0, 1) / 1000), keepTo = Math.min(last, Date.UTC(y + 1, 0, 1) / 1000);
    if (keepTo - keepFrom < 20 * DAY) continue;
    const a = new Date(keepFrom * 1000).toISOString().slice(0, 7);
    const want = [];
    for (let m = addMonths(a, -2); monthStart(m) < keepTo + 31 * DAY && m <= keys[keys.length - 1]; m = addMonths(m, 1)) if (keys.includes(m)) want.push(m);
    out.push({ year: y, keepFrom, keepTo, months: want });
  }
  return out;
}

/**
 * One chunk: every job's trades opened inside [keepFrom, keepTo), kept small — [openT, closeT, r, dir].
 * jobs: [{ key, engine: '13' | '12', opts }]
 */
export function runChunk(rows, inst, jobs, keepFrom, keepTo) {
  const out = {};
  let P = null;
  for (const j of jobs) {
    let trades;
    if (j.engine === '13') { P ??= prepare13(rows); trades = run13(P, inst, j.opts).trades; }
    else trades = backtest(rows, { ...j.opts, inst }).trades;
    out[j.key] = trades.filter(t => t.openT >= keepFrom && t.openT < keepTo).map(t => [t.openT, t.closeT, +t.r.toFixed(4), t.dir]);
  }
  return out;
}

/** Daily candles (17:00 New York days) from one-minute rows: [t, o, h, l, c]. */
export function dailyOf(rows, rollover) {
  const out = [];
  let cur = null;
  for (const [t, o, h, l, c] of rows) {
    const d = rollover(t);
    if (!cur || cur[0] !== d) { cur = [d, o, h, l, c]; out.push(cur); }
    else { if (h > cur[2]) cur[2] = h; if (l < cur[3]) cur[3] = l; cur[4] = c; }
  }
  return out;
}

/* ---------- reading the results ---------- */

/** R by calendar year, and the running total, from compact trades. */
export function yearly(trades) {
  const by = new Map();
  for (const [o, , r] of trades) { const y = new Date(o * 1000).getUTCFullYear(); by.set(y, (by.get(y) || 0) + r); }
  return by;
}
/** Buy and hold: the pair's change over each calendar year, in %, from its days ([t, open, …, close] — the close is last). */
export function holdYearly(daily) {
  const by = new Map();
  for (const d of daily) { const y = new Date(d[0] * 1000 + 12 * 3600 * 1000).getUTCFullYear(); const c = d[d.length - 1], v = by.get(y); if (!v) by.set(y, { a: d[1], z: c }); else v.z = c; }
  const out = new Map();
  for (const [y, v] of by) out.set(y, (v.z / v.a - 1) * 100);
  return out;
}
/** Stats of compact trades. */
export function summary(trades) {
  let tot = 0, won = 0, lost = 0, gw = 0, gl = 0, peak = 0, dd = 0;
  for (const [, , r] of trades) {
    tot += r; if (r > 1e-9) { won++; gw += r; } else if (r < -1e-9) { lost++; gl -= r; }
    peak = Math.max(peak, tot); dd = Math.max(dd, peak - tot);
  }
  return { n: trades.length, total: tot, won, lost, pf: gl > 0 ? gw / gl : gw > 0 ? Infinity : null, winRate: won + lost ? won / (won + lost) : null, maxDD: dd };
}

/* ---------- the volatility surface ---------- */
export const LOOKBACKS = [10, 20, 40, 60, 90, 120, 180];
/**
 * Realised volatility (annualised %, from daily log returns) for each lookback, at each month's last day.
 * → { dates: [t], lookbacks, z: [[vol per lookback] per date] }
 */
export function volSurface(daily, lookbacks = LOOKBACKS) {
  const t = [], ret = [];
  for (let i = 1; i < daily.length; i++) { const a = daily[i - 1][daily[i - 1].length - 1], b = daily[i][daily[i].length - 1]; if (a > 0 && b > 0) { t.push(daily[i][0]); ret.push(Math.log(b / a)); } }
  /* prefix sums for quick windows */
  const s1 = [0], s2 = [0];
  for (const r of ret) { s1.push(s1[s1.length - 1] + r); s2.push(s2[s2.length - 1] + r * r); }
  const ends = [];
  for (let i = 0; i < t.length; i++) {
    const m = new Date(t[i] * 1000 + 12 * 3600 * 1000).toISOString().slice(0, 7);
    const next = i + 1 < t.length ? new Date(t[i + 1] * 1000 + 12 * 3600 * 1000).toISOString().slice(0, 7) : null;
    if (m !== next && i + 1 >= lookbacks[lookbacks.length - 1]) ends.push(i);
  }
  const dates = [], z = [];
  for (const i of ends) {
    dates.push(t[i]);
    z.push(lookbacks.map(L => {
      const a = i + 1 - L, n = L, sum = s1[i + 1] - s1[a], sq = s2[i + 1] - s2[a];
      const v = Math.max(0, (sq - (sum * sum) / n) / (n - 1));
      return Math.sqrt(v * 260) * 100;
    }));
  }
  return { dates, lookbacks, z };
}
