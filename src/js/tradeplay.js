/* ============================================================
   tradeplay.js — what price did with your trade, read off the candles.

   The weekly review used to ask how close a trade came to your stop, how
   far it ran, and what holding to target would have made. Minato marks and
   enters on OANDA's chart, so its prices are his prices, and those answers
   can be read straight off the one-minute candles instead.

   Everything here is pure: a trade and its candles in, numbers out. Each
   minute candle is taken whole — a stop and a target touched in the same
   minute count as the stop, because the candle cannot say which came first
   and the cautious answer is the honest one.
   ============================================================ */

const H24 = 24 * 3600;

/** The size of one pip (or point) for an OANDA instrument, and its name. */
export function pipOf(inst) {
  const [a, b] = String(inst || '').split('_');
  if (b === 'JPY') return { size: 0.01, unit: 'pips' };
  /* gold is read in points, a point a dollar (4080 → 4081), the way the
     Nasdaq is read in index points */
  if (a === 'XAU') return { size: 1, unit: 'points' };
  if (a === 'XAG') return { size: 0.01, unit: 'pips' };
  if (/^[A-Z]{3}$/.test(a) && /^[A-Z]{3}$/.test(b) && !/\d/.test(a)) {
    const fx = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'ZAR', 'MXN', 'PLN', 'TRY', 'CNH', 'CZK', 'HUF'];
    if (fx.includes(a) && fx.includes(b)) return { size: 0.0001, unit: 'pips' };
  }
  if (/^(WTICO|BCO)$/.test(a)) return { size: 0.01, unit: 'pips' };
  return { size: 1, unit: 'points' };
}

/**
 * Read a trade off its candles.
 *   rows   [[unixSec, o, h, l, c], …] one-minute, sorted
 *   w      { entry, exit } unix seconds (tradeWindow)
 *   kind   how it closed: 'tp' | 'sl' | 'be' | 'manual' | null
 * Returns null when the trade has no prices, times or stop to read.
 *
 *   heatR / heat      furthest it went against you while you were in, in R
 *                     and in price; 1R for a trade stopped out
 *   toStop            how close it came to your stop, in price (never < 0)
 *   availR            how far it ran your way from the entry — until the
 *                     original stop was touched, or a day after you got out
 *   held              for a trade not closed at target or stop: what the
 *                     original target and stop would have done from your
 *                     exit — { outcome: 'win'|'loss', r, at } — or null if
 *                     neither was reached in the prices loaded
 *   reachedTarget     price got to your target at some point after entry
 *                     (for a stop-out: within a day after the stop)
 *   pastStop          stopped out, then on to the target: how far price went
 *                     beyond your stop before it turned for the target, in
 *                     price — from the candle that took the stop to the one
 *                     before the target. null when it never reached the
 *                     target within a day
 *   covered           the prices reach a full day past the exit
 */
export function measure(trade, rows, w, kind) {
  const num = v => (v == null || v === '' ? NaN : Number(v));
  const entry = num(trade.entryPrice), sl = num(trade.stopLoss), tp = num(trade.takeProfit), exitP = num(trade.exitPrice);
  if (![entry, sl].every(Number.isFinite) || !rows?.length || !w || !trade.timeOpen) return null;
  const long = trade.side !== 'sell';
  const risk = Math.abs(entry - sl);
  if (!risk) return null;
  const R = d => d / risk;
  const fav = (h, l) => (long ? h - entry : entry - l);         // best for you in a candle
  const adv = (h, l) => (long ? entry - l : h - entry);         // worst for you in a candle
  const hitsStop = (h, l) => (long ? l <= sl : h >= sl);
  const hitsTarget = (h, l) => Number.isFinite(tp) && (long ? h >= tp : l <= tp);

  const inMin = Math.floor(w.entry / 60) * 60, outMin = Math.floor(w.exit / 60) * 60;
  const lastT = rows[rows.length - 1][0];
  let worst = 0, during = 0, i = 0;
  while (i < rows.length && rows[i][0] < inMin) i++;
  const first = i;
  for (; i < rows.length && rows[i][0] <= outMin; i++) {
    worst = Math.max(worst, adv(rows[i][2], rows[i][3]));
    during = Math.max(during, fav(rows[i][2], rows[i][3]));
  }
  if (first >= rows.length) return null;
  if (kind === 'sl') worst = Math.max(worst, risk);
  worst = Math.min(worst, risk);                                 // a stop is a stop

  /* how far it ran: from the entry until the original stop is touched, or a
     day after the exit, whichever comes first */
  let best = 0, stoppedAt = null, reached = false, reachedAt = null;
  const until = w.exit + H24;
  for (let k = first; k < rows.length && rows[k][0] <= until; k++) {
    const [t, , h, l] = rows[k];
    if (kind === 'sl') {
      /* stopped out: only what it did afterwards — did the idea come good? */
      if (t <= outMin) continue;
    } else if (t > outMin && hitsStop(h, l)) { stoppedAt = t; break; }
    best = Math.max(best, fav(h, l));
    if (!reached && hitsTarget(h, l)) { reached = true; reachedAt = t; }
  }
  /* What it could have made: your target if price got there — how far it
     went beyond is no business of this trade — or, if it never did, the
     best it got your way. */
  const toTarget = Number.isFinite(tp) ? Math.abs(tp - entry) : Infinity;
  const could = reached ? toTarget : Math.min(Math.max(0, best), toTarget);

  /* stopped out, and then the target: how far past the stop it went first */
  let pastStop = null;
  if (kind === 'sl' && Number.isFinite(tp)) {
    let s = -1;
    for (let k = first; k < rows.length && rows[k][0] <= until; k++) if (hitsStop(rows[k][2], rows[k][3])) { s = k; break; }
    /* OANDA's mid may not touch a stop your broker's price did: start at the exit */
    if (s < 0) { s = first; while (s < rows.length && rows[s][0] < outMin) s++; }
    let deepest = 0;
    for (let k = s; k < rows.length && rows[k][0] <= until; k++) {
      const [, , h, l] = rows[k];
      if (k > s && hitsTarget(h, l)) { pastStop = deepest; break; }
      deepest = Math.max(deepest, long ? sl - l : h - sl);
    }
    if (!reached) pastStop = null;
  }

  /* had you held: from the minute after you got out, target or stop first */
  let held = null;
  if (kind !== 'tp' && kind !== 'sl' && Number.isFinite(tp) && Number.isFinite(exitP)) {
    for (let k = first; k < rows.length; k++) {
      const [t, , h, l] = rows[k];
      if (t <= outMin) continue;
      if (hitsStop(h, l)) { held = { outcome: 'loss', r: -1, at: t }; break; }
      if (hitsTarget(h, l)) { held = { outcome: 'win', r: +R(Math.abs(tp - entry)).toFixed(2), at: t }; break; }
    }
  }

  return {
    heatR: +R(worst).toFixed(2), heat: worst,
    toStop: Math.max(0, risk - worst),
    availR: +R(Math.max(0, best)).toFixed(2),
    couldR: +R(could).toFixed(2),
    duringR: +R(Math.max(0, during)).toFixed(2),
    targetR: Number.isFinite(tp) ? +R(toTarget).toFixed(2) : null,
    held,
    reachedTarget: reached, reachedAt,
    pastStop,
    stoppedAfter: stoppedAt,
    covered: lastT >= until,
  };
}

/** A price distance as pips (or points), rounded for reading. */
export function inPips(d, inst) {
  const p = pipOf(inst);
  const n = d / p.size;
  /* whole from 100, one decimal from 10, two below — gold's $1.25 is 1.25 points */
  const a = Math.abs(n);
  return { n: a >= 100 ? Math.round(n) : a >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100, unit: p.unit };
}
