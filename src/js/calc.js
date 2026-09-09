/* ============================================================
   calc.js — every number the app shows, and nothing else.
   Rule: if it cannot be derived from a stored field, it does
   not belong in here. No assumptions about what price "would
   have" done after you exited.
   ============================================================ */

/** 1R in account currency. Measured against the account's STARTING balance. */
export function oneR(account, trade) {
  const pct = Number(trade.riskPercent);
  if (!account || !isFinite(pct) || pct <= 0) return null;
  return account.startingBalance * pct / 100;
}

/** R multiple = net result / 1R. */
export function rMultiple(account, trade) {
  const r = oneR(account, trade);
  if (!r) return null;
  return Number(trade.netResult) / r;
}

/** win | loss | breakeven — from the typed result alone. */
export function outcome(trade) {
  const n = Number(trade.netResult);
  if (!isFinite(n)) return 'breakeven';
  if (n > 0) return 'win';
  if (n < 0) return 'loss';
  return 'breakeven';
}

/** Planned R:R from the prices, when all three are present. */
export function plannedR(trade) {
  const e = Number(trade.entryPrice), s = Number(trade.stopLoss), t = Number(trade.takeProfit);
  if (![e, s, t].every(isFinite)) return null;
  const risk = Math.abs(e - s);
  if (!risk) return null;
  return Math.abs(t - e) / risk;
}

/** Which session a time falls in. Windows may wrap past midnight and may overlap;
    the first match in playbook order wins. */
export function sessionFor(playbook, time) {
  if (!time) return null;
  const mins = toMinutes(time);
  for (const s of playbook.sessions) {
    const a = toMinutes(s.start), b = toMinutes(s.end);
    const inside = a <= b ? (mins >= a && mins < b) : (mins >= a || mins < b);
    if (inside) return s;
  }
  return null;
}
function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/* ============================================================
   Two clocks, and they never share a number.

   LABELLING — which killzone a trade belongs to — is exact. It is decided
   by the ENTRY time and nothing else: no tolerance, no rounding, no grace
   period. A trade opened at 11:52 is in Asia because 11:52 is inside
   08:00-12:00, full stop. Being eight minutes from the edge changes nothing.

   MATCHING — whether your live trade and a replay trade are the same trade —
   is forgiving, because two humans clicking at slightly different moments is
   the thing being measured. That tolerance compares one trade to another and
   is never allowed to move a label.

   Keeping them apart is the whole trick. The forgiving number lives in
   matchTrades(); the exact one lives in sessionFor().
   ============================================================ */

export const OUTSIDE = 'Outside killzones';

/** The session name to show for a trade. Gaps between killzones are a real
    category, not a blank — trading outside them is worth being able to see. */
export function sessionLabel(playbook, sessionId) {
  if (!sessionId) return OUTSIDE;
  return playbook.sessions.find(s => s.id === sessionId)?.name ?? OUTSIDE;
}

/** Minutes since epoch-ish, for comparing two trades across a midnight. */
function stamp(date, time) {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh || 0, mm || 0) / 60000;
}

const samePair = (a, b) => String(a || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
                        === String(b || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

/**
 * Pair up live trades with replay trades for one week.
 *
 * Two trades are the same trade when the pair matches, the direction matches,
 * and the entries are within `windowMins` of each other. Closest pair wins,
 * and each trade is used once.
 *
 * The window NEVER touches the session labels: each side keeps the label its
 * own entry time earned. Where a matched pair straddles two killzones that is
 * reported as `sessionMismatch` — it means you took the right setup at the
 * wrong time, which is a finding, not an error to paper over.
 */
export function matchTrades(playbook, account, live, replay, { windowMins = 15, rEpsilon = 0.05 } = {}) {
  const L = live.map((t, i) => ({ i, t, at: stamp(t.date, t.timeOpen), r: rMultiple(account, t) }));
  const R = replay.map((t, i) => ({ i, t, at: stamp(t.date, t.timeOpen), r: t.rMultiple ?? null }));

  const candidates = [];
  for (const l of L) for (const r of R) {
    if (l.at == null || r.at == null) continue;
    if (!samePair(l.t.pair, r.t.pair)) continue;
    if (l.t.side !== r.t.side) continue;
    const gap = Math.abs(l.at - r.at);
    if (gap <= windowMins) candidates.push({ l, r, gap });
  }
  candidates.sort((a, b) => a.gap - b.gap);

  const usedL = new Set(), usedR = new Set(), pairs = [];
  for (const cand of candidates) {
    if (usedL.has(cand.l.i) || usedR.has(cand.r.i)) continue;
    usedL.add(cand.l.i); usedR.add(cand.r.i);
    const bothR = cand.l.r != null && cand.r.r != null;
    pairs.push({
      verdict: bothR && Math.abs(cand.l.r - cand.r.r) > rEpsilon ? 'diverged' : 'matched',
      live: cand.l.t, replay: cand.r.t, liveR: cand.l.r, replayR: cand.r.r,
      gapMins: cand.gap,
      sessionMismatch: cand.l.t.sessionId !== cand.r.t.sessionId,
      liveSession: sessionLabel(playbook, cand.l.t.sessionId),
      replaySession: sessionLabel(playbook, cand.r.t.sessionId),
    });
  }
  for (const l of L) if (!usedL.has(l.i)) pairs.push({
    verdict: 'extra', live: l.t, replay: null, liveR: l.r, replayR: null,
    gapMins: null, sessionMismatch: false,
    liveSession: sessionLabel(playbook, l.t.sessionId), replaySession: null });
  for (const r of R) if (!usedR.has(r.i)) pairs.push({
    verdict: 'missed', live: null, replay: r.t, liveR: null, replayR: r.r,
    gapMins: null, sessionMismatch: false,
    liveSession: null, replaySession: sessionLabel(playbook, r.t.sessionId) });

  pairs.sort((a, b) => {
    const at = stamp((a.live || a.replay).date, (a.live || a.replay).timeOpen);
    const bt = stamp((b.live || b.replay).date, (b.live || b.replay).timeOpen);
    return at - bt;
  });
  return pairs;
}

/** Duration in minutes between two HH:MM on the same (or next) day. */
export function durationMins(open, close) {
  if (!open || !close) return null;
  let d = toMinutes(close) - toMinutes(open);
  if (d < 0) d += 24 * 60;
  return d;
}

/* ============================================================
   Aggregates over a set of trades for one account
   ============================================================ */
export function summarise(account, trades) {
  const rows = trades.map(t => ({ t, r: rMultiple(account, t), o: outcome(t), n: Number(t.netResult) || 0 }));

  const wins   = rows.filter(x => x.o === 'win');
  const losses = rows.filter(x => x.o === 'loss');
  const bes    = rows.filter(x => x.o === 'breakeven');

  const grossWin  = wins.reduce((s, x) => s + x.n, 0);
  const grossLoss = Math.abs(losses.reduce((s, x) => s + x.n, 0));
  const net       = rows.reduce((s, x) => s + x.n, 0);

  const decided   = wins.length + losses.length;          // break-evens excluded
  const winRate   = decided ? wins.length / decided : null;
  const avgWin    = wins.length ? grossWin / wins.length : null;
  const avgLoss   = losses.length ? grossLoss / losses.length : null;
  const payoff    = (avgWin && avgLoss) ? avgWin / avgLoss : null;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : null);
  const expectancy   = rows.length ? net / rows.length : null;
  const rValues   = rows.map(x => x.r).filter(v => v != null && isFinite(v));
  const avgR      = rValues.length ? rValues.reduce((a, b) => a + b, 0) / rValues.length : null;
  const breakEvenWinRate = (avgWin && avgLoss) ? avgLoss / (avgWin + avgLoss) : null;

  /* The R twins of the dollar figures above. R cannot be worked back out of a
     dollar total — every trade may carry its own risk % — so it is summed
     alongside, and a set where even one trade has no risk on it has no R total
     at all rather than a misleadingly partial one. */
  const allHaveR   = rValues.length === rows.length;
  const sumR       = a => a.reduce((s, x) => s + x.r, 0);
  const netR       = allHaveR && rows.length ? sumR(rows) : null;
  const grossWinR  = wins.every(x => x.r != null) ? sumR(wins) : null;
  const grossLossR = losses.every(x => x.r != null) ? Math.abs(sumR(losses)) : null;
  const avgWinR    = wins.length && grossWinR != null ? grossWinR / wins.length : null;
  const avgLossR   = losses.length && grossLossR != null ? grossLossR / losses.length : null;
  const expectancyR = avgR;                       // net R per trade is the average R

  return {
    count: rows.length, wins: wins.length, losses: losses.length, breakevens: bes.length,
    grossWin, grossLoss, net, winRate, avgWin, avgLoss, payoff, profitFactor,
    expectancy, avgR, breakEvenWinRate,
    netR, grossWinR, grossLossR, avgWinR, avgLossR, expectancyR,
  };
}

/** Cumulative net by close date, oldest first. */
export function equityCurve(trades, account = null) {
  const byDate = new Map();
  for (const t of trades) {
    const d = t.date;
    const cur = byDate.get(d) || { n: 0, r: 0, rKnown: true };
    cur.n += Number(t.netResult) || 0;
    const r = account ? rMultiple(account, t) : null;
    if (r == null || !isFinite(r)) cur.rKnown = false; else cur.r += r;
    byDate.set(d, cur);
  }
  const dates = [...byDate.keys()].sort();
  let running = 0, runningR = 0, rKnown = true;
  return dates.map(d => {
    const cur = byDate.get(d);
    running += cur.n;
    if (!cur.rKnown) rKnown = false;
    runningR += cur.r;
    return { date: d, day: cur.n, equity: running,
             dayR: cur.rKnown ? cur.r : null, equityR: rKnown ? runningR : null };
  });
}

/** Largest peak-to-trough fall in the equity curve, with where it happened. */
export function maxDrawdown(curve, key = 'equity') {
  if (curve.some(p => p[key] == null)) return null;
  let peak = 0, peakIdx = -1, worst = 0, from = -1, to = -1, runPeak = 0, runPeakIdx = -1;
  curve.forEach((p, i) => {
    if (p[key] > runPeak) { runPeak = p[key]; runPeakIdx = i; }
    const dd = runPeak - p[key];
    if (dd > worst) { worst = dd; from = runPeakIdx; to = i; peak = runPeak; peakIdx = runPeakIdx; }
  });
  return worst > 0 ? { amount: worst, fromIndex: from, toIndex: to, peak } : null;
}

/** Daily totals keyed by ISO date — the calendar and the day views read this. */
export function dailyTotals(account, trades) {
  const map = new Map();
  for (const t of trades) {
    const cur = map.get(t.date) || { net: 0, count: 0, r: 0, wins: 0, losses: 0, breakevens: 0 };
    cur.net += Number(t.netResult) || 0;
    cur.count += 1;
    const r = account ? rMultiple(account, t) : null;
    if (r != null && isFinite(r)) cur.r += r;
    const o = outcome(t);
    cur[o === 'win' ? 'wins' : o === 'loss' ? 'losses' : 'breakevens'] += 1;
    map.set(t.date, cur);
  }
  return map;
}

/** Longest run of consecutive trading days on the same side of zero. */
export function longestStreak(daily, sign = 'green') {
  const dates = [...daily.keys()].sort();
  let best = 0, run = 0;
  for (const d of dates) {
    const net = daily.get(d).net;
    const hit = sign === 'green' ? net > 0 : net < 0;
    run = hit ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** Buckets for the R distribution. Break-evens get their own bucket at 0R. */
export function rDistribution(account, trades) {
  const edges = [
    { key: '≤−1.5R', test: r => r <= -1.25, sign: 'loss' },
    { key: '−1R',    test: r => r > -1.25 && r <= -0.75, sign: 'loss' },
    { key: '−0.5R',  test: r => r > -0.75 && r < 0, sign: 'loss' },
    { key: '0R',     test: r => r === 0, sign: 'flat' },
    { key: '+0.5R',  test: r => r > 0 && r < 0.75, sign: 'win' },
    { key: '+1R',    test: r => r >= 0.75 && r < 1.25, sign: 'win' },
    { key: '+1.5R',  test: r => r >= 1.25 && r < 1.75, sign: 'win' },
    { key: '≥+2R',   test: r => r >= 1.75, sign: 'win' },
  ];
  const counts = edges.map(e => ({ ...e, count: 0 }));
  for (const t of trades) {
    const r = rMultiple(account, t);
    if (r == null || !isFinite(r)) continue;
    const b = counts.find(e => e.test(r));
    if (b) b.count += 1;
  }
  return counts;
}

/* ============================================================
   Display units

   Every figure in the app can be read three ways: in the account's money, as
   a percentage of that account's starting balance, or in R. The switch is one
   setting shared by every screen.

   Percentages are always of the STARTING balance, never of the balance at the
   time. That is the same base 1R is worked out from, so a +2% week in January
   and a +2% week in September are the same size — and it means no figure
   quietly shrinks just because the account grew.

   R is passed in, never derived. Two trades that made the same money are not
   the same number of R if they risked different amounts, so a dollar total
   cannot be converted after the fact.
   ============================================================ */
export const UNITS = ['$', '%', 'R'];
export const UNIT_LABEL = { $: '$', '%': '%', R: 'R' };

/** A signed percentage: +2.00%, −0.75%, 0.00%. */
export function pctSigned(v, decimals = 2) {
  if (v == null || !isFinite(v)) return '—';
  const pre = v < 0 ? '−' : (v > 0 ? '+' : '');
  return `${pre}${Math.abs(v).toFixed(decimals)}%`;
}

/** The percentage a dollar amount is of this account's starting balance. */
export function asPercent(account, dollars) {
  if (dollars == null || !isFinite(dollars)) return null;
  const base = Number(account?.startingBalance);
  if (!base) return null;
  return dollars / base * 100;
}

/**
 * One figure in whichever unit is switched on.
 *   d — the dollar amount
 *   r — the R total for the very same thing, or null when there isn't one
 */
export function fig(unit, account, d, r, opts = {}) {
  if (unit === 'R') return rFmt(r, opts.rDecimals ?? 2);
  if (unit === '%') return pctSigned(asPercent(account, d), opts.pctDecimals ?? 2);
  return money(d, { currency: account?.currency, ...opts });
}

/** The same, for a single trade — it knows its own R. */
export function tradeFig(unit, account, trade, opts = {}) {
  return fig(unit, account, Number(trade.netResult) || 0, rMultiple(account, trade), opts);
}

/** Which raw number a chart axis or bar should be drawn from, in this unit. */
export function figValue(unit, account, d, r) {
  if (unit === 'R') return r;
  if (unit === '%') return asPercent(account, d);
  return d;
}

/* ============================================================
   What you do after a loss

   The single most expensive habit in trading is the trade taken because the
   last one lost. Every part of this is derived from what is already stored —
   the order trades happened in, what each risked, and what each made. Nothing
   here guesses at intent; it reports what the next trade did, and leaves the
   reading of it to you.

   Chronological order comes from date plus entry time. A trade with no entry
   time still sorts by its date, it just cannot take part in the timing
   window, which is stated rather than silently assumed.
   ============================================================ */
export function chronological(trades) {
  return trades.slice().sort((a, b) =>
    (a.date + (a.timeOpen || '99:99')).localeCompare(b.date + (b.timeOpen || '99:99')));
}

export function afterLoss(account, trades, { windowMins = 30 } = {}) {
  const rows = chronological(trades);
  const next = [];         // every trade whose predecessor was a loss
  const quick = [];        // ...and which was entered soon after it closed
  let sizedUp = 0, sizedUpOf = 0;

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1], cur = rows[i];
    if (outcome(prev) !== 'loss') continue;
    next.push(cur);

    const prevRisk = Number(prev.riskPercent), curRisk = Number(cur.riskPercent);
    if (isFinite(prevRisk) && isFinite(curRisk) && prevRisk > 0) {
      sizedUpOf += 1;
      if (curRisk > prevRisk + 1e-9) sizedUp += 1;
    }

    // Same day, and inside the window measured from when the loss closed.
    if (prev.date === cur.date && cur.timeOpen && (prev.timeClose || prev.timeOpen)) {
      const gap = durationMins(prev.timeClose || prev.timeOpen, cur.timeOpen);
      if (gap != null && gap >= 0 && gap <= windowMins) quick.push(cur);
    }
  }

  let streak = 0, worstStreak = 0;
  for (const t of rows) {
    if (outcome(t) === 'loss') { streak += 1; worstStreak = Math.max(worstStreak, streak); }
    else if (outcome(t) === 'win') streak = 0;      // a break-even neither breaks nor extends it
  }

  return {
    all: summarise(account, rows),
    next: summarise(account, next),
    quick: summarise(account, quick),
    nextTrades: next, quickTrades: quick,
    sizedUp, sizedUpOf, worstStreak, windowMins,
  };
}

/* ============================================================
   Reading a number a person typed

   People do not type 25000. They type 25 000, or $25,000, or 25,000.50, or
   they paste "-1,234.56" out of a statement, or they leave a stray space at
   the end. All of that is the same number and the app should not argue.

   The rules, in order:
     • currency symbols, spaces (ordinary, non-breaking and thin) and
       apostrophes are separators and come out
     • (1,234) means −1234, the way accounting software writes it
     • a dot is the decimal point
     • when BOTH a dot and a comma appear, whichever comes last is the
       decimal point — "$1,234.56" and "1.234,56" are both 1234.56
     • with only commas, they are thousands separators, unless there is
       exactly one with one or two digits after it, which reads as a decimal
       comma: "25,5" is 25.5, "25,500" is 25500
     • anything still not a number comes back null, never NaN and never 0
   ============================================================ */
const SEPARATORS = /[\s\u00A0\u2007\u202F\u2009']/g;
const SYMBOLS = /[$€£¥₹]|A\$|AUD|USD|EUR|GBP|JPY/gi;

export function parseNumber(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return isFinite(raw) ? raw : null;

  let t = String(raw).trim();
  if (!t) return null;

  let negative = false;
  if (/^\(.*\)$/.test(t)) { negative = true; t = t.slice(1, -1); }        // (1,234)

  t = t.replace(SYMBOLS, '').replace(SEPARATORS, '');
  t = t.replace(/^([+-])/, (m, sign) => { if (sign === '-' || sign === '−') negative = true; return ''; });
  t = t.replace(/^[−–—]/, () => { negative = true; return ''; });
  t = t.replace(/%$/, '').replace(/R$/i, '');

  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // both present: the later one is the decimal point, the other is grouping
    if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.');
    else                     t = t.replace(/,/g, '');
  } else if (lastComma !== -1) {
    // commas only: grouping, unless it looks like a lone decimal comma
    t = ((t.match(/,/g) || []).length === 1 && /,\d{1,2}$/.test(t))
      ? t.replace(',', '.')
      : t.replace(/,/g, '');
  }

  if (!/^\d*\.?\d+$|^\d+\.?\d*$/.test(t)) return null;
  const n = Number(t);
  if (!isFinite(n)) return null;
  return negative ? -n : n;
}

/** The same, but a blank field is a legitimate "not set" rather than an error. */
export function parseNumberOrNull(raw) {
  return (raw == null || String(raw).trim() === '') ? null : parseNumber(raw);
}

/* ============================================================
   Weekly target

   Stored on the account as a percentage of its starting balance, for one
   reason: a target that means the same thing on a 25k account and a 200k one
   has to scale with the account. It is then read back in whichever unit is
   switched on — and in R only when the account has a default risk, because
   "how many R is 2%" is a question you can only answer once you know what one
   R costs.
   ============================================================ */
export function weeklyTarget(account, unit = '$') {
  const pct = Number(account?.weeklyTargetPercent) || 0;
  if (!(pct > 0)) return null;
  const dollars = Number(account.startingBalance) ? account.startingBalance * pct / 100 : null;
  const risk = Number(account.defaultRiskPercent) || 0;
  const r = risk > 0 ? pct / risk : null;
  const value = unit === 'R' ? r : unit === '%' ? pct : dollars;
  return { pct, dollars, r, value };
}

/** Turn a number typed in the current unit back into a percentage to store. */
export function targetToPercent(account, unit, n) {
  const v = Number(n);
  if (!isFinite(v) || v <= 0) return 0;
  if (unit === '%') return v;
  if (unit === '$') return Number(account?.startingBalance) ? v / account.startingBalance * 100 : 0;
  const risk = Number(account?.defaultRiskPercent) || 0;
  return risk > 0 ? v * risk : 0;
}

/* ============================================================
   Formatting
   ============================================================ */
export function money(n, { sign = true, currency = 'USD', decimals = 2 } = {}) {
  if (n == null || !isFinite(n)) return '—';
  const symbol = { USD: '$', EUR: '€', GBP: '£', AUD: 'A$', JPY: '¥' }[currency] || '$';
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const pre = n < 0 ? '−' : (sign && n > 0 ? '+' : '');
  return `${pre}${symbol}${abs}`;
}
export function rFmt(r, decimals = 2) {
  if (r == null || !isFinite(r)) return '—';
  const pre = r < 0 ? '−' : (r > 0 ? '+' : '');
  return `${pre}${Math.abs(r).toFixed(decimals)}R`;
}
export function pct(v, decimals = 1) {
  if (v == null || !isFinite(v)) return '—';
  return `${(v * 100).toFixed(decimals)}%`;
}
export function num(v, decimals = 2) {
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function shortDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d).padStart(2, '0')} ${months[m - 1]}`;
}
export function longDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`;
}
export function durationFmt(mins) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
