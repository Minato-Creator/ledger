/* ============================================================
   periods.js — weeks and months, and what happened in each.

   The arithmetic behind the Weekly winrate page, kept apart from the page so
   it can be checked on its own. Nothing in here touches the DOM or the store.

   A week is an ISO week: Monday to Sunday, numbered the way the Replay page
   already numbers them, so "W38" means the same week everywhere in the app.
   A month is a calendar month. Both are keyed as strings that sort the way
   time does — '2026-W38', '2026-09' — so the order of two periods is just
   the order of their keys.

   Everything counts on the trade's own date, the same date every other
   screen files a trade under.
   ============================================================ */
import { isoWeek, weekRange } from './replay.js';
import * as c from './calc.js';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (s, n) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

export const isWeekKey = key => /^\d{4}-W\d{2}$/.test(String(key));
export const modeOf = key => (isWeekKey(key) ? 'week' : 'month');

/** The period a date falls in. */
export function periodOf(date, mode) {
  return mode === 'month' ? String(date).slice(0, 7) : isoWeek(String(date).slice(0, 10));
}

/** First and last day of a period, inclusive, as YYYY-MM-DD. */
export function rangeOf(key) {
  if (isWeekKey(key)) return weekRange(key);
  const [y, m] = key.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
}

/** The period `delta` steps away. Weeks step by seven days, so a year with
    a 53rd week is walked through rather than skipped. */
export function step(key, delta) {
  if (isWeekKey(key)) return isoWeek(addDays(weekRange(key).start, 7 * delta));
  const [y, m] = key.split('-').map(Number);
  const n = y * 12 + (m - 1) + delta;
  return `${Math.floor(n / 12)}-${pad((n % 12) + 1)}`;
}

/** How many steps from a to b — positive when b is later. */
export function distance(a, b) {
  if (isWeekKey(a)) return Math.round((utc(weekRange(b).start) - utc(weekRange(a).start)) / (7 * 864e5));
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma);
}

/** What a period is called. `tick` is the few characters under a column;
    `title` names it; `span` is the dates it covers. */
export function labelOf(key) {
  const { start, end } = rangeOf(key);
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  if (isWeekKey(key)) {
    const w = Number(key.split('-W')[1]);
    /* "28 Sep – 4 Oct 2026" crosses a month; "14 – 20 Sep 2026" does not. */
    const span = sm === em
      ? `${sd} – ${ed} ${MONTHS_SHORT[em - 1]} ${ey}`
      : sy === ey
        ? `${sd} ${MONTHS_SHORT[sm - 1]} – ${ed} ${MONTHS_SHORT[em - 1]} ${ey}`
        : `${sd} ${MONTHS_SHORT[sm - 1]} ${sy} – ${ed} ${MONTHS_SHORT[em - 1]} ${ey}`;
    const short = sm === em
      ? `${sd} – ${ed} ${MONTHS_SHORT[em - 1]}`
      : `${sd} ${MONTHS_SHORT[sm - 1]} – ${ed} ${MONTHS_SHORT[em - 1]}`;
    return { tick: `W${w}`, title: `Week ${w}`, span, short };
  }
  return { tick: MONTHS_SHORT[sm - 1], title: `${MONTHS_LONG[sm - 1]} ${sy}`,
           span: `1 – ${ed} ${MONTHS_SHORT[sm - 1]} ${sy}`, short: `${MONTHS_SHORT[sm - 1]} ${sy}` };
}

export const inPeriod = (key, trades) => {
  const { start, end } = rangeOf(key);
  return trades.filter(t => t.date >= start && t.date <= end);
};

/** A day to hold on to when switching between weeks and months: the last day
    anything was traded in the period, or failing that its first day. Going
    from Week 38 to months lands on September; going back lands on the last
    week of September that had a trade in it. */
export function anchorOf(key, trades) {
  const inside = inPeriod(key, trades).map(t => t.date).sort();
  return inside.length ? inside[inside.length - 1] : rangeOf(key).start;
}

/* ---------- the numbers ---------- */

/* Results land when a trade closes, so a run through the period is taken in
   closing order. A trade with no closing time falls back to its entry time,
   and one with neither sorts to the end of its day. */
const byClose = (a, b) =>
  (a.date + (a.timeClose || a.timeOpen || '99:99')).localeCompare(b.date + (b.timeClose || b.timeOpen || '99:99'));

/**
 * One set of trades — live, or forward tests — for one period.
 *
 * Built on `summarise`, so a win rate here is the win rate everywhere else:
 * break-evens are left out of it, and an R total exists only when every trade
 * has an R. On top of that, the things only a run through time can tell you.
 *
 *   drawdownR   the deepest fall, in R, from the best point reached so far —
 *               measured from where the period started, trade by trade. Two
 *               losses to open the week is a 2R drawdown even with no win
 *               before them. Null when any trade has no R, because a partial
 *               run would understate it.
 *   lossStreak  the most losses in a row. Anything that is not a loss ends it.
 *   pfR         profit factor in R: what the winners made over what the
 *               losers lost. Infinite with no losers, null with no trades.
 */
export function periodStats(account, trades) {
  const s = c.summarise(account, trades);
  const run = trades.slice().sort(byClose);
  const rs = run.map(t => c.rMultiple(account, t));
  const known = rs.filter(r => r != null && isFinite(r));
  const allR = rs.length > 0 && known.length === rs.length;

  let drawdownR = null;
  if (allR) {
    let level = 0, peak = 0, worst = 0;
    for (const r of rs) {
      level += r;
      if (level > peak) peak = level;
      if (peak - level > worst) worst = peak - level;
    }
    drawdownR = worst;
  }

  let lossStreak = 0, cur = 0;
  for (const t of run) {
    if (c.outcome(t) === 'loss') { cur += 1; if (cur > lossStreak) lossStreak = cur; }
    else cur = 0;
  }

  const pfR = s.grossWinR == null || s.grossLossR == null || !trades.length ? null
    : s.grossLossR > 0 ? s.grossWinR / s.grossLossR
    : s.grossWinR > 0 ? Infinity : null;

  return {
    ...s,
    drawdownR,
    bestR: known.length ? Math.max(...known) : null,
    worstR: known.length ? Math.min(...known) : null,
    lossStreak,
    pfR,
    days: new Set(trades.map(t => t.date)).size,
  };
}

/**
 * The risk you put on in a period, live trades only.
 *
 * Counts every trade entered in the period, open ones included — risk is
 * taken when you get in, not when you get out, so a position still running
 * on Friday has already used some of the week's. A forward test risks
 * nothing and is never counted here.
 */
export function riskTaken(account, trades) {
  const risks = trades.map(t => Number(t.riskPercent)).filter(v => isFinite(v) && v > 0);
  const total = risks.reduce((a, b) => a + b, 0);
  const base = Number(account?.startingBalance) || 0;
  return {
    trades: trades.length,
    open: trades.filter(t => t.status === 'open').length,
    withRisk: risks.length,
    totalPct: risks.length ? total : null,
    avgPct: risks.length ? total / risks.length : null,
    maxPct: risks.length ? Math.max(...risks) : null,
    totalMoney: risks.length && base ? base * total / 100 : null,
  };
}

/** The rows under a period: its days for a week — Monday to Friday always,
    the weekend only if it was traded — or its weeks for a month. A week that
    straddles two months only counts the days that fall inside this one. */
export function partsOf(key, trades) {
  const { start, end } = rangeOf(key);
  if (isWeekKey(key)) {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i);
      const mine = trades.filter(t => t.date === day);
      if (i >= 5 && !mine.length) continue;
      const [, m, d] = day.split('-').map(Number);
      out.push({ key: day, label: `${DAYS_SHORT[i]} ${d} ${MONTHS_SHORT[m - 1]}`, trades: mine, link: null });
    }
    return out;
  }
  const out = [];
  let wk = isoWeek(start);
  while (weekRange(wk).start <= end) {
    const r = weekRange(wk);
    const from = r.start < start ? start : r.start;
    const to = r.end > end ? end : r.end;
    const mine = trades.filter(t => t.date >= from && t.date <= to);
    const [, , fd] = from.split('-').map(Number);
    const [, tm, td] = to.split('-').map(Number);
    const days = from === to ? `${td} ${MONTHS_SHORT[tm - 1]}` : `${fd} – ${td} ${MONTHS_SHORT[tm - 1]}`;
    out.push({ key: wk, label: `W${Number(wk.split('-W')[1])} · ${days}`, trades: mine, link: wk });
    wk = step(wk, 1);
  }
  return out;
}
