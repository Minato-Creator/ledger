/* ============================================================
   quant.js — Minato's strategy as rules, run over one-minute candles.

   The rules, as he set them (project doc "strategy-rules-draft"):

   STRUCTURE, the same on every timeframe. A swing high/low is a fractal
   (higher/lower than the K candles either side). Structure breaks only on
   a full-bodied close past the level — the body at least half the candle,
   closing in the break's direction. Anything weaker that trades past is a
   sweep (NC, "no close"). After a break up, the low that caused it is the
   protected low; a full-bodied close under it turns the structure down
   (the high that caused that is the protected high), and so on. The
   timeframes nest: what is external on the 5m is internal to the 15m.

   DIRECTION. Pro-trend only: the daily structure (the 4H when the daily
   has none yet) and the 15m must point the same way as the trade.

   TWO SETUPS, longs shown (shorts are the mirror):
     Risk entry    — at the 15m protected low, read on 15m candles.
     Continuation  — at the 5m protected low once the 5m has turned up
                     (the order-flow shift), read on 5m candles.
   Both need a double confirmation: price sweeps the level without a
   full-bodied close under it, pulls back off it, sweeps it again (still no
   close under), and then the first bullish candle closes — the rejection
   candle. The trade opens at the next candle's open.

   STOP under the lowest point of the sweeps, plus 2 pips.
   TARGET the nearest strong high above — a high that made a break of
   structure (a protected high on that timeframe or the one inside it, or
   the leg's top) — never one formed inside the double confirmation's leg.
   At least 1.5R to it or no trade.
   BREAK-EVEN once the timeframe inside makes a new break of structure in
   the trade's own leg: a swing high formed after the entry, then a
   full-bodied close above it. No partials.

   Fills on the one-minute candles, mid prices, with a spread paid on the
   entry (3 pips — $0.30 on gold — by default); a stop and a target in the
   same minute count as the stop. Nothing is opened from half an hour
   before the 5pm New York close to an hour after it, when the market
   stops and reopens.
   ============================================================ */
import { pipOf } from './pips.js';
import { aggregate, rolloverOf } from './candles.js';

export const PIP = { XAU_USD: 0.1 };   /* kept for older callers; pips.js knows every market */
/* The engine's defaults are Version 4 (quantversions.js has every version, each with all its settings
   spelled out): 15m external swings 8 either side, a double confirmation at least 12 entry candles long,
   no trade at tier 3, aim past a target under the minimum R, two more goes at a level after the first. */
export const DEFAULTS = { K: 2, KX: 8, zone: 0.3, minR: 1.5, pips: 2, full: 0.5, spread: 3, mtfEntry: 5, ltfEntry: 3,
  maxR: Infinity, pickR: true, tier3: true, dcBars: 12, div: false, stopAt: 'sweep', hours: null, capR: null, minStop: 0, divAll: false, reentry: 2, htf: false, htfLevel: false, htfK: 2, htfOfs: false, htfOnlyLevel: false, nearest: false,
  /* the day's rules: sessions as [from, to] minutes of his local day (tz hours from UTC), trades and loss allowed a day / week, a pause after a run of losses */
  sessions: null, tz: 8, maxPerDay: 0, dayLossR: 0, weekLossR: 0, pauseAfter: 0,
  /* Version 8: after the rejection, wait for a 1m internal break (within confirmMins); take profit at a fixed R instead of a structure target */
  confirm: false, confirmMins: 60, fixedR: null,
  /* Version 10/11: the 15m internal structure (and the 1H) pointing the trade's way when the rejection candle closes */
  int15Agree: false, h1Agree: false,
  /* Version 12: every timeframe but the 4H stretched — scale 4 reads the '1m/3m/5m/15m' as 4m/12m/20m/1H */
  scale: 1 };   // spread in pips, paid on the entry

const isFull = (b, f) => { const r = b[2] - b[3]; return r > 0 && Math.abs(b[4] - b[1]) / r >= f; };
/* past a level: a full-bodied close beyond it — or a candle whose whole body is beyond it (it opened there, after a gap) */
const closesAbove = (b, lvl, f) => b[4] > lvl && ((b[4] > b[1] && isFull(b, f)) || b[1] > lvl);
const closesBelow = (b, lvl, f) => b[4] < lvl && ((b[4] < b[1] && isFull(b, f)) || b[1] < lvl);

/**
 * The structure of one timeframe.
 * dir[i]     — +1 up, −1 down, 0 not yet known, as it stood once bar i closed
 * events     — every break: { i, t, kind: 'bos'|'choch', dir, level, prot: {p, i, t} }
 * strong     — the highs/lows that made a break (protected levels) and the legs' tops/bottoms:
 *              { side: 'H'|'L', p, i, t, known (time it became known), taken (time price first traded past it — its liquidity gone — or Infinity) }
 * prot[i]    — the protected level at bar i: { p, i, t } (the low in an uptrend, the high in a downtrend)
 */
export function structure(bars, size, { K = 2, full = 0.5 } = {}) {
  const n = bars.length, dir = new Int8Array(n), prot = new Array(n).fill(null), tier3 = new Uint8Array(n);
  let swept = 0;                             // the leg's weak high (up) / low (down) has been run without a break
  const events = [], strong = [], open = [];   // open: strong levels not yet traded through
  let d = 0, pl = null, ph = null;          // protected low (uptrend) / high (downtrend)
  let wh = null, wl = null;                  // the leg's swing high (up) / low (down) to break next
  let lastPH = null, lastPL = null;          // the latest swing high / low of any kind
  let lastBreak = 0;
  const end = i => bars[i][0] + size;        // when bar i has closed
  const lowest = (a, b) => { let k = a; for (let j = a + 1; j <= b; j++) if (bars[j][3] < bars[k][3]) k = j; return k; };
  const highest = (a, b) => { let k = a; for (let j = a + 1; j <= b; j++) if (bars[j][2] > bars[k][2]) k = j; return k; };
  const mark = (side, k, i) => { const s = { side, p: side === 'H' ? bars[k][2] : bars[k][3], i: k, t: bars[k][0], known: end(i), taken: Infinity }; strong.push(s); open.push(s); return s; };

  for (let i = 0; i < n; i++) {
    /* a swing K bars back is now confirmed */
    const j = i - K;
    if (j >= K) {
      const isH = pivot(bars, j, K, 'H'), isL = pivot(bars, j, K, 'L');
      /* the leg's newest top (bottom) is the next thing to break — and, while it stands, a strong level:
         it is where the pullback came from */
      if (isH) { lastPH = { p: bars[j][2], i: j }; if (d >= 0 && j > lastBreak && (!wh || bars[j][2] > wh.p)) { wh = { ...lastPH }; if (d > 0) mark('H', j, i); } }
      if (isL) { lastPL = { p: bars[j][3], i: j }; if (d <= 0 && j > lastBreak && (!wl || bars[j][3] < wl.p)) { wl = { ...lastPL }; if (d < 0) mark('L', j, i); } }
    }
    const b = bars[i];
    /* price trading past a strong level takes its liquidity: it is no longer a target */
    for (let s = open.length - 1; s >= 0; s--) {
      const x = open[s];
      if (x.known > b[0]) continue;
      if (x.side === 'H' ? b[2] > x.p : b[3] < x.p) { x.taken = b[0]; open[s] = open[open.length - 1]; open.pop(); }
    }

    if (d === 0) {
      if (lastPH && i > lastPH.i && closesAbove(b, lastPH.p, full)) {
        const k = lowest(lastPH.i, i); d = 1; pl = { p: bars[k][3], i: k, t: bars[k][0] };
        mark('L', k, i); events.push({ i, t: end(i), kind: 'bos', dir: 1, level: lastPH.p, from: lastPH.i, prot: pl });
        lastBreak = i; wh = null;
      } else if (lastPL && i > lastPL.i && closesBelow(b, lastPL.p, full)) {
        const k = highest(lastPL.i, i); d = -1; ph = { p: bars[k][2], i: k, t: bars[k][0] };
        mark('H', k, i); events.push({ i, t: end(i), kind: 'bos', dir: -1, level: lastPL.p, from: lastPL.i, prot: ph });
        lastBreak = i; wl = null;
      }
    } else if (d === 1) {
      if (closesBelow(b, pl.p, full)) {                       // the protected low gives way: down
        const k = highest(pl.i, i); const was = pl;
        mark('H', k, i); d = -1; ph = { p: bars[k][2], i: k, t: bars[k][0] };
        events.push({ i, t: end(i), kind: 'choch', dir: -1, level: was.p, from: was.i, prot: ph });
        lastBreak = i; wl = null; wh = null; pl = null;
      } else if (wh && closesAbove(b, wh.p, full)) {          // the leg's high gives way: higher
        const k = lowest(wh.i, i);
        pl = { p: bars[k][3], i: k, t: bars[k][0] }; mark('L', k, i);
        events.push({ i, t: end(i), kind: 'bos', dir: 1, level: wh.p, from: wh.i, prot: pl });
        lastBreak = i; wh = null;
      }
    } else {
      if (closesAbove(b, ph.p, full)) {
        const k = lowest(ph.i, i); const was = ph;
        mark('L', k, i); d = 1; pl = { p: bars[k][3], i: k, t: bars[k][0] };
        events.push({ i, t: end(i), kind: 'choch', dir: 1, level: was.p, from: was.i, prot: pl });
        lastBreak = i; wh = null; wl = null; ph = null;
      } else if (wl && closesBelow(b, wl.p, full)) {
        const k = highest(wl.i, i);
        ph = { p: bars[k][2], i: k, t: bars[k][0] }; mark('H', k, i);
        events.push({ i, t: end(i), kind: 'bos', dir: -1, level: wl.p, from: wl.i, prot: ph });
        lastBreak = i; wl = null;
      }
    }
    if (lastBreak === i) swept = 0;
    else if (d === 1 && wh && b[2] > wh.p) swept = 1;
    else if (d === -1 && wl && b[3] < wl.p) swept = 1;
    tier3[i] = swept;
    dir[i] = d;
    prot[i] = d === 1 ? pl : d === -1 ? ph : null;
  }
  return { bars, size, dir, prot, tier3, events, strong, end };
}

/** Is bar j a swing high ('H') or low ('L') — beyond the K bars on either side (ties go to the earlier)? */
function pivot(bars, j, K, side) {
  const v = side === 'H' ? bars[j][2] : bars[j][3];
  for (let q = j - K; q <= j + K; q++) {
    if (q === j) continue;
    const w = side === 'H' ? bars[q][2] : bars[q][3];
    if (side === 'H' ? (q < j ? w > v : w >= v) : (q < j ? w < v : w <= v)) return false;
  }
  return true;
}

/** The bar of `S` that had closed by time t (index), or −1. */
function closedAt(S, t) {
  let lo = 0, hi = S.bars.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (S.bars[m][0] + S.size <= t) { k = m; lo = m + 1; } else hi = m - 1; }
  return k;
}
const dirAt = (S, t) => { const k = closedAt(S, t); return k < 0 ? 0 : S.dir[k]; };

/** First index in rows with time ≥ t. */
function rowAt(rows, t) {
  let lo = 0, hi = rows.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m][0] < t) lo = m + 1; else hi = m; }
  return lo;
}

/** Every protected level a structure made, with when it was made and when a close took it out. */
function levelsOf(S, full) {
  const out = [];
  for (const e of S.events) {
    const side = e.dir > 0 ? 'L' : 'H', p = e.prot.p;
    let broken = Infinity;
    for (let j = e.i + 1; j < S.bars.length; j++) {
      if (side === 'L' ? closesBelow(S.bars[j], p, full) : closesAbove(S.bars[j], p, full)) { broken = S.bars[j][0] + S.size; break; }
    }
    out.push({ side, p, t: e.prot.t, known: e.t, broken, ev: e });
  }
  return out;
}

/** Wilder's RSI on the closes (14), one value per bar. */
export function rsiOf(bars, n = 14) {
  const out = new Float64Array(bars.length).fill(50);
  let up = 0, dn = 0;
  for (let i = 1; i < bars.length; i++) {
    const ch = bars[i][4] - bars[i - 1][4], u = Math.max(0, ch), v = Math.max(0, -ch);
    if (i <= n) { up += u / n; dn += v / n; } else { up = (up * (n - 1) + u) / n; dn = (dn * (n - 1) + v) / n; }
    if (i >= n) out[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
  }
  return out;
}

/**
 * Version 8's confirmation, on the one-minute candles. From the sweep: the extreme so far, and the last 1m swing
 * high (low for shorts) before it — known only once its K candles after have closed. A full-bodied close past
 * that swing is the 1m internal break. If it came between the extreme and the rejection candle's close, the trade
 * opens at once (k0); otherwise the next `mins` minutes are watched: a new extreme starts it again, a full close
 * through the protected level ends it. Returns { k: the row the trade opens on, x: the extreme, t, p: the swing broken }.
 */
function confirmed(rows, s, long, k0, mins, K, full) {
  const kA = rowAt(rows, s.s1.t), kS = rowAt(rows, s.s2.t);
  let kx = kS;
  for (let k = kS; k < k0; k++) if (long ? rows[k][3] <= rows[kx][3] : rows[k][2] >= rows[kx][2]) kx = k;
  const swingBefore = (kk, now) => { for (let j = Math.min(kk - 1, now - K); j >= Math.max(kA, kk - 400); j--) if (j >= K && pivot(rows, j, K, long ? 'H' : 'L')) return { p: long ? rows[j][2] : rows[j][3], t: rows[j][0] }; return null; };
  const past = (b, w) => w && (long ? closesAbove(b, w.p, full) : closesBelow(b, w.p, full));
  const x = () => long ? rows[kx][3] : rows[kx][2];
  for (let k = kx + 1; k < k0; k++) { const w = swingBefore(kx, k - 1); if (past(rows[k], w)) return { k: k0, x: x(), t: w.t, p: w.p }; }
  const end = s.t + mins * 60;
  for (let k = k0; k < rows.length && rows[k][0] < end; k++) {
    const b = rows[k];
    if (long ? closesBelow(b, s.lv.p, full) : closesAbove(b, s.lv.p, full)) return null;
    if (long ? b[3] < rows[kx][3] : b[2] > rows[kx][2]) { kx = k; continue; }
    const w = swingBefore(kx, k - 1);
    if (past(b, w)) return { k: k + 1, x: x(), t: w.t, p: w.p };
  }
  return null;
}

/** Is bar j of `bars` a swing (K either side) — read once bar j+K has closed. */
const swingAt = (bars, j, K, side) => j >= K && j + K < bars.length && pivot(bars, j, K, side);

/**
 * Run the strategy (version 2, after studying his own trades).
 *
 *   MTF structure (15m) sets the direction — its external swings (KX candles
 *   either side), so only a real 15m break turns it. No HTF filter.
 *   Protected levels to trade from:
 *     MTF — the 15m protected low/high and every internal one (IPL/IPH) still
 *           standing inside the current 15m leg; entries read on 5m candles.
 *     LTF — once the 5m has shifted with the 15m (the OFS), the 5m protected
 *           lows/highs; entries read on 3m candles.
 *   NC+S with a double confirmation: price comes to the level and makes a
 *   first reaction low near it (the "DC" low — at most 30% of the way up the
 *   leg from the level, or below it); after the bounce a second push sweeps
 *   that low, with no full close beyond the protected level; the first
 *   opposite candle closes; in at the next open.
 *   Stop beyond the lowest point since the reaction low, plus 2 pips; target
 *   the nearest strong high made before the reaction low; ≥ 1.5R.
 *   Break-even on 5m structure of the trade's own leg: a 5m swing formed
 *   after the entry, then a full close past it.
 *
 * @param rows  one-minute candles [[t, o, h, l, c], …], in order
 */
export function backtest(rows, { inst = 'XAU_USD', K = DEFAULTS.K, KX = DEFAULTS.KX, zone = DEFAULTS.zone, minR = DEFAULTS.minR, pips = DEFAULTS.pips,
  full = DEFAULTS.full, spread = DEFAULTS.spread, breakEven = true, kinds = ['mtf', 'ltf'], mtfEntry = DEFAULTS.mtfEntry, ltfEntry = DEFAULTS.ltfEntry,
  maxR = DEFAULTS.maxR, pickR = DEFAULTS.pickR, tier3 = DEFAULTS.tier3, dcBars = DEFAULTS.dcBars, div = DEFAULTS.div, stopAt = DEFAULTS.stopAt, hours = DEFAULTS.hours, capR = DEFAULTS.capR, minStop = DEFAULTS.minStop, divAll = DEFAULTS.divAll, reentry = DEFAULTS.reentry, htf = DEFAULTS.htf, htfLevel = DEFAULTS.htfLevel, htfK = DEFAULTS.htfK, htfOfs = DEFAULTS.htfOfs, htfOnlyLevel = DEFAULTS.htfOnlyLevel, nearest = DEFAULTS.nearest, sessions = DEFAULTS.sessions, tz = DEFAULTS.tz, maxPerDay = DEFAULTS.maxPerDay, dayLossR = DEFAULTS.dayLossR,
  weekLossR = DEFAULTS.weekLossR, pauseAfter = DEFAULTS.pauseAfter, confirm = DEFAULTS.confirm, confirmMins = DEFAULTS.confirmMins, fixedR = DEFAULTS.fixedR, int15Agree = DEFAULTS.int15Agree, h1Agree = DEFAULTS.h1Agree, scale = DEFAULTS.scale, onProgress } = {}) {
  const pip = pipOf(inst), buf = pips * pip, cost = spread * pip;
  const nearClose = t => { const a = rolloverOf(t); return t - a < 3600 || a + 86400 - t < 1800; };
  const agg = {}; for (const m of [1, 3, 5, 15]) agg[m] = aggregate(rows, m * scale); agg[240] = aggregate(rows, 240);
  const SZ = { 1: 60 * scale, 3: 180 * scale, 5: 300 * scale, 15: 900 * scale };
  const frames = {
    ext15: structure(agg[15], SZ[15], { K: KX, full }),       // MTF external: the direction
    int15: structure(agg[15], SZ[15], { K, full }),           // MTF internal: IPL / IPH
    s5: structure(agg[5], SZ[5], { K, full }),               // LTF: the OFS, its protected levels, break-even
    s3: { bars: agg[3], size: SZ[3] },
    s1: structure(agg[1], SZ[1], { K, full }),
  };
  frames[15] = frames.ext15; frames[5] = frames.s5; frames[1] = frames.s1;   // the charts' names
  const H1 = h1Agree ? structure(aggregate(rows, 60), 3600, { K, full }) : null;
  const ext = frames.ext15;

  /* HTF windows: a 4H candle runs a 4H swing low (high) without a full close past it — an NC+S. From
     its close, setups that way are allowed on any timeframe, whatever the 15m says, for that leg: until
     a 4H full close past the sweep's extreme, until price reaches the nearest 4H swing on the other side
     (the protected structure it is heading for), or until a window the other way opens. */
  const H4 = { bars: agg[240] || aggregate(rows, 240), size: 14400 };
  const windows = [];
  if (htf) {
    const hb = H4.bars, open = { L: [], H: [] };
    let cur = null;
    for (let i = 0; i < hb.length; i++) {
      const b = hb[i], tEnd = b[0] + H4.size;
      const j = i - htfK;                               // 4H swings, confirmed htfK candles later
      if (j >= htfK && pivot(hb, j, htfK, 'L')) open.L.push({ p: hb[j][3], t: hb[j][0] });
      if (j >= htfK && pivot(hb, j, htfK, 'H')) open.H.push({ p: hb[j][2], t: hb[j][0] });
      /* the open window ends? */
      if (cur) {
        const gone = cur.d > 0 ? closesBelow(b, cur.x, full) : closesAbove(b, cur.x, full);
        const there = cur.goal != null && (cur.d > 0 ? b[2] >= cur.goal : b[3] <= cur.goal);
        if (gone || there) { cur.to = tEnd; cur.why = gone ? 'broken' : 'reached'; cur = null; }
      }
      for (const side of ['L', 'H']) {
        const lows = side === 'L';
        for (let q = open[side].length - 1; q >= 0; q--) {
          const sw = open[side][q];
          if (sw.t >= b[0]) continue;
          if (!(lows ? b[3] < sw.p : b[2] > sw.p)) continue;
          open[side].splice(q, 1);                      // its liquidity is taken either way
          if (lows ? closesBelow(b, sw.p, full) : closesAbove(b, sw.p, full)) continue;   // a break, not an NC
          const d = lows ? 1 : -1, x = lows ? b[3] : b[2];
          const other = open[lows ? 'H' : 'L'].filter(o => (lows ? o.p > b[4] : o.p < b[4]));
          const goal = other.length ? (lows ? Math.min(...other.map(o => o.p)) : Math.max(...other.map(o => o.p))) : null;
          if (cur) { cur.to = tEnd; cur.why = 'turned'; }
          cur = { d, from: tEnd, to: Infinity, x, xt: b[0], swept: sw, goal };
          windows.push(cur);
        }
      }
    }
  }
  const windowAt = t => { for (let q = windows.length - 1; q >= 0; q--) { const w = windows[q]; if (w.from <= t) return t < w.to ? w.d : 0; } return 0; };
  /* the way a trade may go at time t: with the 15m, or with an open HTF window */
  const allowed = (d, t) => dirAt(ext, t) === d || (htf && windowAt(t) === d && (!htfOfs || dirAt(frames.s5, t) === d));

  const SETUPS = [
    { kind: 'mtf', name: 'MTF structure', src: [frames.ext15, frames.int15], entry: agg[mtfEntry], esz: SZ[mtfEntry], tf: 15 * scale, etf: mtfEntry * scale,
      label: (lv, d) => (lv.htf ? '4H NC' : lv.fromExt ? (d > 0 ? 'PL' : 'PH') : (d > 0 ? 'IPL' : 'IPH')), ltf: false, tierOf: 'ext15' },
    { kind: 'ltf', name: 'LTF after OFS', src: [frames.s5], entry: agg[ltfEntry], esz: SZ[ltfEntry], tf: 5 * scale, etf: ltfEntry * scale,
      label: (lv, d) => (d > 0 ? 'IPL' : 'IPH'), ltf: true, tierOf: 's5' },
  ].filter(x => kinds.includes(x.kind));
  const signals = [], skipped = { rr: 0, noTarget: 0, busy: 0, close: 0, far: 0, tier3: 0, dc: 0, div: 0 };

  for (const su of SETUPS) {
    /* the levels, in the order they became known */
    const levels = [];
    su.src.forEach((S, n) => { for (const lv of levelsOf(S, full)) levels.push({ ...lv, fromExt: n === 0 && su.kind === 'mtf' }); });
    /* the HTF NC's own extreme is a level too, for a 15m double confirmation risk entry at it */
    if (htf && htfLevel && su.kind === 'mtf') for (const w of windows) levels.push({ side: w.d > 0 ? 'L' : 'H', p: w.x, t: w.xt, known: w.from, broken: w.why === 'broken' ? w.to : Infinity, htf: true });
    levels.sort((a, b) => a.known - b.known);
    const bars = su.entry, sz = su.esz;
    const rsi = div ? rsiOf(bars) : null;
    let li = 0;
    const live = [];                                    // { lv, st }
    const seen = new Set();
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i], tEnd = b[0] + sz;
      while (li < levels.length && levels[li].known <= b[0]) {
        const lv = levels[li++], key = lv.side + lv.p + '|' + lv.t;
        if (!seen.has(key)) { seen.add(key); live.push({ lv, st: { phase: 0, hi: null } }); }
      }
      const dX = dirAt(ext, b[0]);                      // the 15m direction, as it stood
      for (let q = live.length - 1; q >= 0; q--) {
        const { lv, st } = live[q];
        const long = lv.side === 'L', d = long ? 1 : -1, L = lv.p;
        if (lv.broken <= b[0] || st.phase === 9) { live.splice(q, 1); continue; }
        if (dX !== d && !(htf && windowAt(b[0]) === d && (!htfOnlyLevel || lv.htf))) continue;   // with the 15m, or inside an HTF window
        if (su.ltf && dirAt(frames.s5, b[0]) !== d) continue;   // LTF levels only once the 5m has shifted
        if (long ? closesBelow(b, L, full) : closesAbove(b, L, full)) { live.splice(q, 1); continue; }
        /* the leg's far end since the level was made: how near "near the level" is */
        st.hi = st.hi == null ? (long ? b[2] : b[3]) : long ? Math.max(st.hi, b[2]) : Math.min(st.hi, b[3]);
        const reach = Math.abs(st.hi - L) * zone;
        /* a swing on the entry candles, confirmed K bars later */
        const j = i - K;
        if (st.phase === 0 && j > (st.after ?? 0) && bars[j][0] >= lv.known && swingAt(bars, j, K, long ? 'L' : 'H')) {
          const a = long ? bars[j][3] : bars[j][2];
          /* nearest: the protected structure the pullback actually reached — no other standing level of this kind between it and the DC low */
          const nearer = nearest && live.some(o => o !== live[q] && o.lv.side === lv.side && o.lv.broken > b[0] && (long ? o.lv.p > L && o.lv.p <= a : o.lv.p < L && o.lv.p >= a));
          if (!nearer && (long ? a <= L + reach : a >= L - reach)) { st.phase = 1; st.a = { i: j, t: bars[j][0], p: a }; st.x = a; }
        }
        if (st.phase === 1) {
          if (i > st.a.i && (long ? b[3] < st.a.p : b[2] > st.a.p)) { st.phase = 2; st.s2 = { i, t: b[0], p: long ? b[3] : b[2] }; st.xi = i; st.x = long ? b[3] : b[2]; }
        }
        if (st.phase === 2) {
          if (long ? b[3] < st.x : b[2] > st.x) { st.x = long ? b[3] : b[2]; st.xi = i; }
          if (long ? b[4] > b[1] : b[4] < b[1]) {      // the rejection candle has closed
            /* the 15m (and for LTF levels the 5m) still pointing the trade's way as it opens */
            if (!(dirAt(ext, tEnd) === d || (allowed(d, tEnd) && (!htfOnlyLevel || lv.htf))) || (su.ltf && dirAt(frames.s5, tEnd) !== d)) { st.phase = 9; continue; }
            /* the filters being tried */
            if (dcBars && st.s2.i - st.a.i < dcBars) { st.phase = 9; skipped.dc++; continue; }
            if (tier3 && dirAt(ext, tEnd) === d) { const F = frames[su.tierOf], k = closedAt(F, tEnd); if (k >= 0 && F.tier3[k]) { st.phase = 9; skipped.tier3++; continue; } }
            if (div && !(long ? rsi[st.xi] > rsi[st.a.i] : rsi[st.xi] < rsi[st.a.i])) { st.phase = 9; skipped.div++; continue; }
            signals.push({ su, d, lv, label: su.label(lv, d), s1: st.a, s2: st.s2, rej: { i, t: b[0] }, x: st.x, t: tEnd, via: dirAt(ext, tEnd) === d ? '15m' : '4H NC' });
            /* another go at the same level, from a fresh DC low after this one, up to `reentry` times */
            st.tries = (st.tries || 0) + 1;
            if (st.tries <= reentry) { st.phase = 0; st.after = i; } else st.phase = 9;
          }
        }
      }
    }
  }
  signals.sort((a, b) => a.t - b.t);

  /* divergence on every one of 1m/3m/5m/15m: at the sweep's extreme the price went past the DC low, the RSI did not */
  const RS = divAll ? Object.fromEntries([1, 3, 5, 15].map(m => [m, { bars: agg[m], sz: SZ[m], rsi: rsiOf(agg[m]) }])) : null;
  const barOf = (F, t) => { let lo = 0, hi = F.bars.length - 1, k = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (F.bars[m][0] <= t) { k = m; lo = m + 1; } else hi = m - 1; } return k; };
  function divEverywhere(s, long) {
    let n = 0;
    for (const m of [1, 3, 5, 15]) {
      const F = RS[m];
      const ka = barOf(F, s.s1.t), kz = barOf(F, s.rej.t);
      let kx = ka + 1;                                   // the extreme of the second push on this timeframe
      for (let k = ka + 1; k <= kz; k++) if (long ? F.bars[k][3] < F.bars[kx][3] : F.bars[k][2] > F.bars[kx][2]) kx = k;
      if (kx <= ka) continue;
      /* the DC low's own bar on this timeframe: the extreme around s1 */
      let k0 = ka; for (let k = Math.max(0, ka - 2); k <= ka + 2 && k < kx; k++) if (long ? F.bars[k][3] < F.bars[k0][3] : F.bars[k][2] > F.bars[k0][2]) k0 = k;
      if (long ? F.rsi[kx] > F.rsi[k0] : F.rsi[kx] < F.rsi[k0]) n++;
    }
    return n >= (divAll === true ? 4 : divAll);
  }

  /* take them in time order, one trade at a time, on the one-minute candles */
  const trades = [];
  let freeAt = 0;
  /* his day, his week (local time), and what has happened in them */
  const local = t => t + tz * 3600;
  const dayOf = t => Math.floor(local(t) / 86400);
  const weekOf = t => Math.floor((local(t) / 86400 + 3) / 7);           // Monday-based
  const inSession = t => { if (!sessions) return true; const m = Math.floor((local(t) % 86400) / 60); return sessions.some(([a, b]) => m >= a && m < b); };
  const book = { day: null, dayN: 0, dayR: 0, week: null, weekR: 0, run: 0, pausedDay: null };
  const S5 = frames.s5;
  for (const s of signals) {
    if (s.t < freeAt) { skipped.busy++; continue; }
    if (!inSession(s.t)) { skipped.session = (skipped.session || 0) + 1; continue; }
    {
      const dd = dayOf(s.t), ww = weekOf(s.t);
      if (book.day !== dd) { book.day = dd; book.dayN = 0; book.dayR = 0; }
      if (book.week !== ww) { book.week = ww; book.weekR = 0; }
      const stop = (maxPerDay && book.dayN >= maxPerDay) || (dayLossR && book.dayR <= -dayLossR) || (weekLossR && book.weekR <= -weekLossR) || book.pausedDay === dd;
      if (stop) { skipped.rules = (skipped.rules || 0) + 1; continue; }
    }
    if (nearClose(s.t)) { skipped.close++; continue; }
    if ((int15Agree && dirAt(frames.int15, s.t) !== s.d) || (h1Agree && dirAt(H1, s.t) !== s.d)) { skipped.align = (skipped.align || 0) + 1; continue; }
    let k0 = rowAt(rows, s.t);
    if (k0 >= rows.length) break;
    const long = s.d > 0;
    let conf = null;
    if (confirm) {
      /* the confirmation: a full close past the last 1m swing high (low) made before the sweep's extreme — an internal
         break on the 1m. Already there when the rejection candle closed: in at once. Otherwise wait for it, up to
         confirmMins; a new extreme on the way moves the stop with it; a full close through the level ends it. */
      conf = confirmed(rows, s, long, k0, confirmMins, K, full);
      if (!conf) { skipped.conf = (skipped.conf || 0) + 1; continue; }
      k0 = conf.k; if (k0 >= rows.length) break;
      if (rows[k0][0] < freeAt) { skipped.busy++; continue; }
      if (nearClose(rows[k0][0])) { skipped.close++; continue; }
    }
    const E = rows[k0][1] + (long ? cost : -cost);   // the spread, paid on the way in
    if (hours && !(hours[0] <= new Date(s.t * 1000).getUTCHours() && new Date(s.t * 1000).getUTCHours() < hours[1])) continue;
    const sx = conf ? conf.x : s.x;
    const xs = stopAt === 'level' ? (long ? Math.min(sx, s.lv.p) : Math.max(sx, s.lv.p)) : sx;
    const SL = long ? xs - buf : xs + buf, R = Math.abs(E - SL);
    if (!(R > 0) || (long ? E <= SL : E >= SL)) continue;
    if (R < minStop) { skipped.small = (skipped.small || 0) + 1; continue; }
    if (divAll && !divEverywhere(s, long)) { skipped.div++; continue; }
    /* the target: the nearest strong level beyond the entry, made before the reaction low, its liquidity still there */
    const want = long ? 'H' : 'L';
    let tp = null;
    if (fixedR) tp = { p: long ? E + fixedR * R : E - fixedR * R, t: s.rej.t, fixed: true };
    else for (const F of [frames.int15, frames.ext15, frames.s5]) {
      for (const x of F.strong) {
        if (x.side !== want || x.known > s.t || x.t >= s.s1.t || x.taken < s.t) continue;
        if (long ? x.p <= E : x.p >= E) continue;
        if (pickR && Math.abs(x.p - E) / R < minR) continue;     // the nearest one far enough
        if (!tp || (long ? x.p < tp.p : x.p > tp.p)) tp = x;
      }
    }
    if (!tp) { skipped.noTarget++; continue; }
    const rr = tp.fixed ? fixedR : Math.abs(tp.p - E) / R;
    if (!tp.fixed && rr < minR) { skipped.rr++; continue; }
    if (rr > maxR) { skipped.far++; continue; }
    /* a target further than capR is brought in to capR */
    if (capR && rr > capR) tp = { ...tp, p: long ? E + capR * R : E - capR * R, capped: true };
    const plan = Math.abs(tp.p - E) / R;

    /* walk it; break-even on the 5m structure of this leg */
    let sl = SL, be = null, exit = null;
    let ib = closedAt(S5, s.t) + 1, beLvl = null;
    for (let k = k0; k < rows.length; k++) {
      const [t, o, h, l] = rows[k];
      /* a stop fills at the stop — or at the open, when the market opened past it (a gap: the weekend, news) */
      if (long ? l <= sl : h >= sl) { const gap = long ? o < sl : o > sl; exit = { t, p: gap ? o : sl, why: be ? 'be' : 'sl', k, gap }; break; }
      if (long ? h >= tp.p : l <= tp.p) { exit = { t, p: tp.p, why: 'tp', k }; break; }
      while (breakEven && !be && ib < S5.bars.length && S5.bars[ib][0] + S5.size <= t + 60) {
        const ibar = S5.bars[ib], j = ib - K;
        if (j >= K && S5.bars[j - K][0] >= (conf ? rows[k0][0] : s.t) && pivot(S5.bars, j, K, long ? 'H' : 'L')) beLvl = long ? S5.bars[j][2] : S5.bars[j][3];
        /* only once that close is in profit: a stop cannot go to the entry while the price is still below it */
        if (beLvl != null && (long ? closesAbove(ibar, beLvl, full) && ibar[4] > E : closesBelow(ibar, beLvl, full) && ibar[4] < E)) { be = { t: ibar[0] + S5.size, lvl: beLvl }; sl = E; }
        ib++;
      }
    }
    if (!exit) continue;                             // still open at the end of the data
    const r = (long ? exit.p - E : E - exit.p) / R;
    /* the structure as it stood at the entry, on the 15m and the 5m: its direction, its protected level and its weak end */
    const structAt = F => {
      const k = closedAt(F, rows[k0][0]); if (k < 0 || !F.dir[k] || !F.prot[k]) return null;
      const dd = F.dir[k], ps = F.prot[k];
      let w = ps.i;
      for (let q = ps.i; q <= k; q++) if (dd > 0 ? F.bars[q][2] > F.bars[w][2] : F.bars[q][3] < F.bars[w][3]) w = q;
      return { dir: dd, ps: { p: ps.p, t: ps.t }, weak: { p: dd > 0 ? F.bars[w][2] : F.bars[w][3], t: F.bars[w][0] } };
    };
    const struct = { m15: structAt(frames.ext15), m5: structAt(frames.s5) };
    trades.push({ struct,
      id: trades.length + 1, dir: s.d, kind: s.su.kind, via: s.via, setup: s.su.name, tf: s.su.tf, etf: s.su.etf,
      level: { p: s.lv.p, t: s.lv.t, label: s.label },
      s1: s.s1, s2: s.s2, rej: s.rej, sweepX: sx, conf: conf ? { t: conf.t, p: conf.p } : null,
      openT: rows[k0][0], entry: E, sl: SL, tp: tp.p, tpT: tp.t, rr: plan, capped: !!tp.capped, fixed: !!tp.fixed, be, closeT: exit.t, exit: exit.p, why: exit.why, gap: !!exit.gap, r,
    });
    freeAt = exit.t + 60;
    book.dayN++; book.dayR += r; book.weekR += r;
    book.run = r < -1e-9 ? book.run + 1 : r > 1e-9 ? 0 : book.run;
    if (pauseAfter && book.run >= pauseAfter) { book.pausedDay = dayOf(exit.t); book.run = 0; }
    onProgress?.(trades.length);
  }
  return { trades, skipped, signals: signals.length, frames, windows, from: rows[0]?.[0], to: rows[rows.length - 1]?.[0] };
}

/** The figures for a list of trades. */
export function stats(trades) {
  const n = trades.length;
  const rs = trades.map(x => x.r);
  const won = rs.filter(r => r > 1e-9).length, lost = rs.filter(r => r < -1e-9).length, be = n - won - lost;
  const sum = rs.reduce((a, b) => a + b, 0);
  const gw = rs.filter(r => r > 0).reduce((a, b) => a + b, 0), gl = -rs.filter(r => r < 0).reduce((a, b) => a + b, 0);
  let eq = 0, peak = 0, dd = 0, streak = 0, worst = 0;
  const curve = [0];
  for (const r of rs) {
    eq += r; curve.push(eq); if (eq > peak) peak = eq; dd = Math.max(dd, peak - eq);
    if (r < -1e-9) { streak++; worst = Math.max(worst, streak); } else if (r > 1e-9) streak = 0;
  }
  return { n, won, lost, be, total: sum, avg: n ? sum / n : null, winRate: won + lost ? won / (won + lost) : null,
    pf: gl > 0 ? gw / gl : gw > 0 ? Infinity : null, maxDD: dd, worstStreak: worst, curve,
    avgWin: won ? gw / won : null };
}
