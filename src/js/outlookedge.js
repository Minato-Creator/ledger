/* ============================================================
   outlookedge.js — the morning outlook joined to what was traded.

   Two numbers (Minato):

   • Bias right — each Long / Short call graded on that day's daily candle
     (New York's 17:00 rollover to the next, the candle TradingView and
     OANDA draw): a Long is right when the day closed above where it
     opened, a Short when it closed below. Neutral is not a call, so it is
     not graded. Prices are the saved OANDA ones (read from the vault, or
     fetched once and kept); without a key, calls wait ungraded.

   • R with your bias, against it, or with none — every trade sorted by the
     outlook written that morning for its instrument: Same (Long → bought,
     Short → sold), Different (the other way), None (Neutral, or nothing
     written for it that day).
   ============================================================ */
import * as cd from './candles.js';
import * as c from './calc.js';

const DAY = 86400;

/** The bias written that morning for this instrument, or null. */
export function biasFor(store, date, pair) {
  const want = c.cleanSymbol(pair || '');
  if (!want) return null;
  const day = store.outlookFor(date);
  const hit = (day?.instruments || []).find(i => i.pair && c.cleanSymbol(i.pair) === want);
  return hit ? hit.bias || 'neutral' : null;
}

/** Same, Different or None: a trade beside the morning's bias. */
export function sideOf(bias, side) {
  if (bias !== 'long' && bias !== 'short') return 'none';
  return (bias === 'long') === (side === 'buy') ? 'same' : 'diff';
}

/** Closed trades in three piles, each with its count, total R, wins and average. */
export function biasBuckets(store, acct, trades) {
  const out = { same: [], diff: [], none: [] };
  for (const t of trades) {
    if (t.status === 'open') continue;
    const bias = biasFor(store, t.date, t.pair);
    out[sideOf(bias, t.side)].push({ t, bias, r: c.rMultiple(acct, t) });
  }
  const sum = list => {
    const rs = list.map(x => x.r).filter(r => r != null && isFinite(r));
    const r = rs.reduce((a, b) => a + b, 0);
    return { n: list.length, r, won: rs.filter(x => x > 0).length, avg: rs.length ? r / rs.length : null,
      winRate: rs.length ? rs.filter(x => x > 0).length / rs.length : null, list };
  };
  return { same: sum(out.same), diff: sum(out.diff), none: sum(out.none),
    noOutlook: out.none.filter(x => x.bias == null).length, neutral: out.none.filter(x => x.bias === 'neutral').length };
}

/** Every Long / Short call written between two dates (inclusive), oldest first. */
export function callsBetween(store, from, to) {
  const out = [];
  for (const [date, day] of Object.entries(store.data.outlooks?.days || {})) {
    if ((from && date < from) || (to && date > to)) continue;
    for (const i of day.instruments || []) {
      if (!i.pair || (i.bias !== 'long' && i.bias !== 'short')) continue;
      out.push({ date, pair: c.cleanSymbol(i.pair), bias: i.bias });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.pair.localeCompare(b.pair));
}

/** The daily candle a calendar date trades in: from the rollover before its midday. */
export function dayCandleSpan(date) {
  const start = cd.rolloverOf(cd.localStamp(date, '12:00'));
  return { start, end: start + DAY };
}
/** That candle from 1-minute rows: { open, close, move } or null when the market did not trade. */
export function dayCandle(rows, start, end) {
  let open = null, close = null;
  for (const r of rows) {
    if (r[0] < start) continue;
    if (r[0] >= end) break;
    if (open == null) open = r[1];
    close = r[4];
  }
  return open == null ? null : { open, close, move: close - open };
}
/** A call against its candle: true (right), false (wrong), null (flat — not graded). */
export function graded(bias, candle) {
  if (!candle || Math.abs(candle.move) <= Math.abs(candle.open) * 1e-7) return null;
  return bias === 'long' ? candle.move > 0 : candle.move < 0;
}

/* grades already worked out this session */
const memo = new Map();
export function forgetGrades() { memo.clear(); }

/**
 * Grade calls on their daily candles. → { list: [{ ...call, candle, right }],
 * right, wrong, flat, waiting, why } — `waiting` counts calls whose day is
 * not over, has no prices, or could not be read. `onStep(done, total)` reports progress.
 */
export async function gradeCalls(store, calls, { now = Date.now() / 1000, onStep } = {}) {
  const cred = await cd.getKey();
  const list = [];
  let done = 0, why = null;
  const one = async call => {
    const inst = cd.oandaInstrument(call.pair);
    const { start, end } = dayCandleSpan(call.date);
    let candle = null, state = 'waiting';
    if (!inst) why ||= 'some instruments have no OANDA prices';
    else if (end > now) state = 'today';
    else if (!cred) why ||= 'add your OANDA key in Settings to grade them';
    else {
      const key = `${inst}/${call.date}`;
      try {
        if (!memo.has(key)) {
          const days = [...new Set([cd.dayOf(start), cd.dayOf(end - 1)])];
          memo.set(key, dayCandle(await cd.loadDays(store, inst, days, cred, now), start, end));
        }
        candle = memo.get(key);
        state = candle ? 'graded' : 'closed';
      } catch (e) { why ||= cd.explain(e); }
    }
    const right = state === 'graded' ? graded(call.bias, candle) : null;
    list.push({ ...call, candle, state, right });
    onStep?.(++done, calls.length);
  };
  /* three at a time, like the charts */
  let next = 0;
  await Promise.all([0, 1, 2].map(async () => { while (next < calls.length) await one(calls[next++]); }));
  list.sort((a, b) => a.date.localeCompare(b.date) || a.pair.localeCompare(b.pair));
  const right = list.filter(x => x.right === true).length, wrong = list.filter(x => x.right === false).length;
  return { list, right, wrong, flat: list.filter(x => x.state === 'graded' && x.right == null).length,
    waiting: list.filter(x => x.state !== 'graded').length, rate: right + wrong ? right / (right + wrong) : null, why };
}
