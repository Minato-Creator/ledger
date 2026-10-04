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
     qty, sl, tp, initSl, riskAmt, closed, closeT, exit, reason
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
export function setStop(s, inst, t, sl, rate = null) {
  t.sl = sl;
  if (t.qty == null && sl != null) {
    t.riskAmt = riskAmountOf(s);
    t.qty = sizeFor(inst, t.entry, sl, t.riskAmt, rate);
    t.initSl = sl;
    t.riskAmt = t.qty * Math.abs(t.entry - sl) * usdPerPoint(inst, t.entry, rate);   // what it actually risks, after rounding
  }
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
function lowerBound(rows, T) {
  let lo = 0, hi = rows.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m][0] < T) lo = m + 1; else hi = m; }
  return lo;
}
/** Trades that would not exist yet at T (opened after it). */
export const openedAfter = (trades, T) => trades.filter(t => t.openT > T);
