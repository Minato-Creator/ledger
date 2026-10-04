/* ============================================================
   replaytrades.js — trades inside a Replay session.

   The OANDA way, on mid prices with no spread:
   • units — gold in ounces (whole), NAS100 a dollar a point (to 0.1), FX
     in the base currency (whole);
   • a market order fills at the close of the candle the replay is on;
   • the size is what the risk buys over the stop, rounded down, so the
     risk is never more than the setting. A trade opened without a stop
     has no size until its stop is set — and the replay will not move on
     until it is;
   • as the replay moves, every one-minute candle is checked: the stop
     first (a candle that reaches both is a loss), then the target;
   • amounts in dollars: a USD quote as it is, a USD base through the
     price, anything else through the quote currency's own dollar prices
     when they are saved (`rate`), otherwise in the quote currency.

   A trade: { id, side 'buy'|'sell', from 'tool'|'manual', openT, entry,
     qty, sl, tp, initSl, riskAmt, riskTarget, closed, closeT, exit, reason
     'tp'|'sl'|'manual', pnl, r }
   ============================================================ */

export const stepOf = inst => (inst === 'NAS100_USD' ? 0.1 : 1);
const tid = () => 'rt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Dollars a unit makes for a move of 1 in price, at `price`. */
export function usdPerPoint(inst, price, rate = null) {
  const [base, quote] = String(inst).split('_');
  if (quote === 'USD') return 1;
  if (base === 'USD') return 1 / price;
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}
/** The balance now: the start plus every closed trade. */
export const balanceOf = s => s.balance + (s.trades || []).filter(t => t.closed).reduce((a, t) => a + (t.pnl || 0), 0);
/** What one trade may lose, from the session's setting. */
export const riskAmountOf = s => (s.riskMode === '$' ? s.risk : balanceOf(s) * s.risk / 100);
/** Units the risk buys over the stop, rounded down to what OANDA takes. */
export function sizeFor(inst, entry, sl, riskAmt, rate = null) {
  const dist = Math.abs(entry - sl);
  if (!(dist > 0) || !(riskAmt > 0)) return 0;
  const step = stepOf(inst);
  const raw = riskAmt / (dist * usdPerPoint(inst, entry, rate));
  return Math.floor(raw / step + 1e-9) * step;
}
export const pnlOf = (inst, t, price, rate = null) => (t.qty ? (t.side === 'buy' ? price - t.entry : t.entry - price) * t.qty * usdPerPoint(inst, price, rate) : 0);

/** Is `price` on the right side for a stop / a target of this trade, given where price is now? */
export function validLevel(t, kind, price, now) {
  const long = t.side === 'buy';
  if (kind === 'sl') return long ? price < now : price > now;
  return long ? price > now : price < now;
}

/** A market order at `price` (the close at T). With a stop it is sized at once. */
export function openTrade(s, inst, { side, T, price, sl = null, tp = null, from = 'manual', rate = null }) {
  const t = { id: tid(), side, from, openT: T, entry: price, qty: null, sl: null, tp: tp ?? null, initSl: null, riskAmt: null,
    closed: false, closeT: null, exit: null, reason: null, pnl: null, r: null };
  if (sl != null) setStop(s, inst, t, sl, rate);
  return t;
}
/** Set (or move) the stop. The first stop sizes the trade; after that the size stays. */
/**
 * Set the stop. While it is on the losing side of the entry the trade is
 * sized (again) so that it risks exactly the setting — the first stop and
 * every move after. The amount is fixed when the trade is first sized, so
 * trades closing in between do not change it. Once sized, a stop moved to
 * the entry or past it (break-even, locking in profit) keeps the size.
 */
export function setStop(s, inst, t, sl, rate = null) {
  t.sl = sl;
  if (sl == null) return t;
  const losing = t.side === 'buy' ? sl < t.entry : sl > t.entry;
  if (t.qty != null && !losing) return t;
  if (t.riskTarget == null) t.riskTarget = riskAmountOf(s);
  const qty = sizeFor(inst, t.entry, sl, t.riskTarget, rate);
  t.qty = qty;
  t.initSl = sl;
  t.riskAmt = qty * Math.abs(t.entry - sl) * usdPerPoint(inst, t.entry, rate);   // what it actually risks, after rounding
  return t;
}
export function closeTrade(inst, t, T, price, reason, rate = null) {
  t.closed = true; t.closeT = T; t.exit = price; t.reason = reason;
  t.pnl = Math.round(pnlOf(inst, t, price, rate) * 100) / 100;
  t.r = t.riskAmt ? t.pnl / t.riskAmt : 0;
  return t;
}
/**
 * Move the open trades through the one-minute candles after `fromT` up to
 * and including `toT`. Returns the trades that closed.
 */
export function runTrades(inst, trades, rows, fromT, toT, rate = () => null) {
  const done = [];
  const open = trades.filter(t => !t.closed && t.qty && t.sl != null);
  if (!open.length) return done;
  let i = lowerBound(rows, fromT + 1);
  for (; i < rows.length && rows[i][0] <= toT; i++) {
    const [T, , h, l] = rows[i];
    for (const t of open) {
      if (t.closed || T <= t.openT) continue;
      const long = t.side === 'buy';
      if (long ? l <= t.sl : h >= t.sl) { closeTrade(inst, t, T, t.sl, 'sl', rate(T)); done.push(t); continue; }
      if (t.tp != null && (long ? h >= t.tp : l <= t.tp)) { closeTrade(inst, t, T, t.tp, 'tp', rate(T)); done.push(t); }
    }
  }
  return done;
}
/**
 * The 15-second ticks inside a one-minute candle — simulated, since only
 * the minute is saved: open → low → high → close on a rising candle,
 * open → high → low → close on a falling one (the usual way of filling a
 * candle in). A minute's ticks are seen at r0−45, r0−30, r0−15 (the open,
 * then each extreme) and at r0 the minute is whole, with its close.
 */
export const tickPath = r => (r[4] >= r[1] ? [r[1], r[3], r[2], r[4]] : [r[1], r[2], r[3], r[4]]);
export const TICK_OFFSETS = [-45, -30, -15, 0];
/**
 * Move the open trades from moment M1 to M2 (either can be inside a
 * minute, on a tick). A minute passed whole is filled as runTrades does
 * (both in one candle → the stop); a minute passed only in part, tick by
 * tick — each tick a straight move from the price before, which can reach
 * the stop or the target, not both.
 */
export function runMoments(inst, trades, rows, M1, M2, rate = () => null) {
  const done = [];
  const open = trades.filter(t => !t.closed && t.qty && t.sl != null);
  if (!open.length || !(M2 > M1)) return done;
  const close = (t, m, p, why) => { closeTrade(inst, t, m, p, why, rate(m)); done.push(t); };
  for (let i = lowerBound(rows, M1 + 1); i < rows.length && rows[i][0] - 45 <= M2; i++) {
    const r = rows[i], r0 = r[0];
    const ticks = TICK_OFFSETS.map(d => r0 + d), inside = ticks.map(m => m > M1 && m <= M2);
    if (inside.every(Boolean)) {
      const [, , h, l] = r;
      for (const t of open) {
        if (t.closed || r0 <= t.openT) continue;
        const long = t.side === 'buy';
        if (long ? l <= t.sl : h >= t.sl) { close(t, r0, t.sl, 'sl'); continue; }
        if (t.tp != null && (long ? h >= t.tp : l <= t.tp)) close(t, r0, t.tp, 'tp');
      }
      continue;
    }
    const path = tickPath(r);
    for (let k = 0; k < 4; k++) {
      if (!inside[k]) continue;
      const m = ticks[k], a = k ? path[k - 1] : (i > 0 ? rows[i - 1][4] : r[1]), b = path[k];
      const lo = Math.min(a, b), hi = Math.max(a, b);
      for (const t of open) {
        if (t.closed || m <= t.openT) continue;
        const long = t.side === 'buy';
        const stop = long ? lo <= t.sl : hi >= t.sl, target = t.tp != null && (long ? hi >= t.tp : lo <= t.tp);
        /* a straight move from inside the trade can only reach one of them */
        if (stop) close(t, m, t.sl, 'sl');
        else if (target) close(t, m, t.tp, 'tp');
      }
    }
  }
  return done;
}
function lowerBound(rows, T) {
  let lo = 0, hi = rows.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m][0] < T) lo = m + 1; else hi = m; }
  return lo;
}
/** Trades that would not exist yet at T (opened after it). */
export const openedAfter = (trades, T) => trades.filter(t => t.openT > T);
