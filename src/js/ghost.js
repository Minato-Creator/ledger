/* ============================================================
   ghost.js — your own trades, replayed with a rule.

   The ghost is you, trading exactly as you did, except that it keeps a rule
   you did not: it stops after two losses, or skips Fridays, or only takes
   one setup. Every trade it takes is a trade you really took, with the
   result you really got. Nothing is simulated or guessed; trades are only
   ever left out.

   Rules come in two kinds and are applied in that order.

   • Filters decide which trades the ghost would ever take: days of the
     week, sessions, setups, instruments, tags. A trade it would never take
     does not count towards anything that day.

   • Day rules decide when the ghost stops for the day: after so many
     losses, so much R down or up, so many trades, or the trade straight
     after a loss. They are played through each day in the order the
     trades were taken, so the trade that triggers a stop is still taken —
     it is what stops you.

   • One what-if changes results rather than leaving trades out: "leave
     trades to TP". A trade you cut short — closed by hand, early, or moved
     to break-even early — and said what it would have made if held, is
     counted at that instead. It is still your own answer, not a guess the
     app makes, and a trade with no answer keeps its real result.

   And one question keeps it honest: would leaving out that many trades at
   random have done as well? A rule that only beats a coin toss is not a
   rule, it is a coincidence with a name.
   ============================================================ */
import * as c from './calc.js';
import { rng } from './lab.js';
import { heldOf } from './questions.js';

const NEWS_SHORT = { none: 'no-news days', before: 'before news', during: 'during news', after: 'after news', between: 'in between news' };

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A ghost with no rules: identical to you. */
export const blankRules = () => ({
  lossesPerDay: null, dayLossR: null, dayWinR: null, maxTrades: null, afterLoss: false,
  skipDays: [], sessions: [], setups: [], pairs: [], skipTags: [], onlyTags: [],
  minConfidence: null, tfs: [], holdToTarget: false, skipNews: [], skipHolidays: false,
});

const dowOf = date => (new Date(date + 'T00:00:00').getDay() + 6) % 7;   // Mon = 0

/** Your trades as the ghost reads them: closed, with an R, in the order taken. */
export function rowsFrom(account, trades) {
  const rows = [];
  let skipped = 0;
  for (const t of trades) {
    if (t.status === 'open') continue;
    const r = c.rMultiple(account, t);
    if (r == null || !isFinite(r)) { skipped++; continue; }
    rows.push({ t, r, date: t.date, dow: dowOf(t.date), outcome: c.outcome(t),
      session: t.sessionId || null, setup: t.setupId || null,
      pair: (t.pair || '').toUpperCase() || null, tags: t.tagIds || [],
      confidence: t.confidence ?? null, tf: t.execTf || null, held: heldOf(t),
      news: t.news || null, holiday: Array.isArray(t.holidays) && t.holidays.length > 0 });
  }
  rows.sort((a, b) => (a.date + (a.t.timeOpen || '99:99')).localeCompare(b.date + (b.t.timeOpen || '99:99')));
  return { rows, skipped };
}

const has = (list, v) => Array.isArray(list) && list.length > 0 && list.includes(v);
const some = list => Array.isArray(list) && list.length > 0;

/** Which trades the ghost takes: an array of booleans, one per row. */
export function apply(rows, R) {
  const take = new Array(rows.length).fill(false);
  /* The filters first. */
  const allowed = rows.map(x =>
    !has(R.skipDays, x.dow)
    && (!some(R.sessions) || R.sessions.includes(x.session))
    && (!some(R.setups) || R.setups.includes(x.setup))
    && (!some(R.pairs) || R.pairs.includes(x.pair))
    && !(some(R.skipTags) && x.tags.some(id => R.skipTags.includes(id)))
    && (!some(R.onlyTags) || R.onlyTags.every(id => x.tags.includes(id)))
    /* A trade never rated, or never given a timeframe, cannot be shown to
       pass either, so a ghost keeping these rules leaves it out. */
    && (R.minConfidence == null || (x.confidence != null && x.confidence >= R.minConfidence))
    && (!some(R.tfs) || R.tfs.includes(x.tf))
    && !has(R.skipNews, x.news)
    && !(R.skipHolidays && x.holiday));

  /* Then each day, in the order it was traded. */
  let day = null, losses = 0, dayR = 0, taken = 0, lastLost = false;
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i];
    if (x.date !== day) { day = x.date; losses = 0; dayR = 0; taken = 0; lastLost = false; }
    if (!allowed[i]) continue;
    if (R.maxTrades != null && taken >= R.maxTrades) continue;
    if (R.lossesPerDay != null && losses >= R.lossesPerDay) continue;
    if (R.dayLossR != null && dayR <= -R.dayLossR + 1e-9) continue;
    if (R.dayWinR != null && dayR >= R.dayWinR - 1e-9) continue;
    if (R.afterLoss && lastLost) { lastLost = false; continue; }   // sit the next one out
    take[i] = true;
    taken++; dayR += x.r;
    if (x.outcome === 'loss') { losses++; lastLost = true; } else lastLost = false;
  }
  return take;
}

/**
 * Your trades with every one you cut short counted at what you said it
 * would have made if held. Those with no answer are as they were.
 */
export function heldRows(rows) {
  return rows.map(x => !x.held ? x : { ...x, r: x.held.r, real: x.r, changed: true,
    outcome: x.held.outcome === 'win' ? 'win' : x.held.outcome === 'loss' ? 'loss' : 'breakeven' });
}

/** Totals for the trades a set of flags keeps. */
export function summary(rows, take) {
  let net = 0, n = 0, wins = 0, lossN = 0, peak = 0, dd = 0;
  const curve = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    if (take[i]) {
      const x = rows[i];
      net += x.r; n++;
      if (x.outcome === 'win') wins++; else if (x.outcome === 'loss') lossN++;
      if (net > peak) peak = net;
      if (peak - net > dd) dd = peak - net;
    }
    curve[i] = net;
  }
  return {
    net, trades: n, skipped: rows.length - n,
    winRate: wins + lossN ? wins / (wins + lossN) : null,
    perTrade: n ? net / n : null,
    drawdown: dd, curve,
  };
}

/**
 * How the ghost's result compares with leaving out the same number of trades
 * at random: the share of random skips it beats. Near 50% is what a coin
 * would do; it takes something like 95% before a rule looks like more than
 * luck — and less than that if you went looking through many rules to find it.
 */
export function luck(rows, ghostNet, skipped, { iters = 2000, seed = 7 } = {}) {
  if (!skipped || skipped >= rows.length) return null;
  const rand = rng(seed + skipped * 31);
  const rs = rows.map(x => x.r);
  const total = rs.reduce((a, b) => a + b, 0);
  const idx = rs.map((_, i) => i);
  let below = 0, ties = 0;
  for (let k = 0; k < iters; k++) {
    /* A partial shuffle picks `skipped` trades to leave out. */
    let out = 0;
    for (let j = 0; j < skipped; j++) {
      const pick = j + ((rand() * (idx.length - j)) | 0);
      [idx[j], idx[pick]] = [idx[pick], idx[j]];
      out += rs[idx[j]];
    }
    const net = total - out;
    if (net < ghostNet - 1e-9) below++; else if (Math.abs(net - ghostNet) <= 1e-9) ties++;
  }
  return (below + ties / 2) / iters;
}

/** What each rule does on its own, measured against your real result. */
export function effects(rows, R, real) {
  const one = [];
  const tryRule = (key, patch, label, on = rows) => {
    const take = apply(on, { ...blankRules(), ...patch });
    const s = summary(on, take);
    one.push({ key, label, delta: s.net - real.net, skipped: s.skipped });
  };
  if (R.holdToTarget) {
    tryRule('holdToTarget', {}, 'Leave trades to TP', heldRows(rows));
    const n = rows.filter(x => x.held).length;
    one[one.length - 1].note = `${n} held`;
  }
  if (R.minConfidence != null) tryRule('minConfidence', { minConfidence: R.minConfidence }, `Only confidence ${R.minConfidence}+`);
  if (some(R.tfs)) tryRule('tfs', { tfs: R.tfs }, `Only ${R.tfs.join(', ')}`);
  if (some(R.skipNews)) tryRule('skipNews', { skipNews: R.skipNews }, `Skip ${R.skipNews.map(k => NEWS_SHORT[k] || k).join(', ')}`);
  if (R.skipHolidays) tryRule('skipHolidays', { skipHolidays: true }, 'Skip bank holidays');
  if (R.lossesPerDay != null) tryRule('lossesPerDay', { lossesPerDay: R.lossesPerDay }, `Stop after ${R.lossesPerDay} loss${R.lossesPerDay === 1 ? '' : 'es'}`);
  if (R.dayLossR != null) tryRule('dayLossR', { dayLossR: R.dayLossR }, `Stop at −${R.dayLossR}R on the day`);
  if (R.dayWinR != null) tryRule('dayWinR', { dayWinR: R.dayWinR }, `Stop at +${R.dayWinR}R on the day`);
  if (R.maxTrades != null) tryRule('maxTrades', { maxTrades: R.maxTrades }, `Max ${R.maxTrades} trade${R.maxTrades === 1 ? '' : 's'} a day`);
  if (R.afterLoss) tryRule('afterLoss', { afterLoss: true }, 'Skip the trade after a loss');
  if (some(R.skipDays)) tryRule('skipDays', { skipDays: R.skipDays }, `Skip ${R.skipDays.map(d => DAYS[d]).join(', ')}`);
  if (some(R.sessions)) tryRule('sessions', { sessions: R.sessions }, 'Only chosen sessions');
  if (some(R.setups)) tryRule('setups', { setups: R.setups }, 'Only chosen setups');
  if (some(R.pairs)) tryRule('pairs', { pairs: R.pairs }, `Only ${R.pairs.join(', ')}`);
  if (some(R.skipTags)) tryRule('skipTags', { skipTags: R.skipTags }, 'Skip chosen tags');
  if (some(R.onlyTags)) tryRule('onlyTags', { onlyTags: R.onlyTags }, 'Only chosen tags');
  return one;
}

/**
 * Rules worth trying: every simple rule, one at a time, on your own trades,
 * ranked by what it would have added. Each comes with its luck score — a
 * list like this is exactly where coincidences hide, so a suggestion is a
 * thing to test on the trades you take next, not a finding.
 */
export function suggest(rows, playbook, { top = 4, names = {} } = {}) {
  if (rows.length < 10) return [];
  const real = summary(rows, rows.map(() => true));
  const out = [];
  const count = (pred) => rows.filter(pred).length;
  const cand = (patch, label) => {
    const take = apply(rows, { ...blankRules(), ...patch });
    const s = summary(rows, take);
    if (!s.skipped || s.trades < Math.max(5, rows.length * 0.2)) return;
    const delta = s.net - real.net;
    if (delta <= 1e-9) return;
    out.push({ patch, label, delta, skipped: s.skipped, luck: luck(rows, s.net, s.skipped, { iters: 1000 }) });
  };
  for (const n of [1, 2, 3]) cand({ lossesPerDay: n }, `Stop after ${n} loss${n === 1 ? '' : 'es'} a day`);
  for (const n of [1, 2, 3]) cand({ dayLossR: n }, `Stop at −${n}R on the day`);
  for (const n of [2, 3, 4]) cand({ dayWinR: n }, `Stop at +${n}R on the day`);
  for (const n of [1, 2, 3]) cand({ maxTrades: n }, `Max ${n} trade${n === 1 ? '' : 's'} a day`);
  cand({ afterLoss: true }, 'Skip the trade after a loss');
  for (let d = 0; d < 7; d++) if (count(x => x.dow === d) >= 3) cand({ skipDays: [d] }, `Skip ${DAYS[d]}`);
  const distinct = key => [...new Set(rows.map(x => x[key]).filter(Boolean))];
  for (const s of distinct('session')) if (count(x => x.session === s) >= 5) cand({ sessions: [s] }, `Only ${names.sessions?.[s] || 'this session'}`);
  for (const s of distinct('setup')) if (count(x => x.setup === s) >= 5) cand({ setups: [s] }, `Only ${names.setups?.[s] || 'this setup'}`);
  for (const p of distinct('pair')) if (count(x => x.pair === p) >= 5) cand({ pairs: [p] }, `Only ${p}`);
  for (const n of [3, 4, 5]) if (count(x => x.confidence != null && x.confidence >= n) >= 5) cand({ minConfidence: n }, `Only confidence ${n}+`);
  for (const f of distinct('tf')) if (count(x => x.tf === f) >= 5) cand({ tfs: [f] }, `Only ${f} entries`);
  for (const k of ['during', 'before', 'after', 'between']) if (count(x => x.news === k) >= 3) cand({ skipNews: [k] }, `Skip trades ${NEWS_SHORT[k]}`);
  if (count(x => x.holiday) >= 3) cand({ skipHolidays: true }, 'Skip bank holidays');
  const tags = [...new Set(rows.flatMap(x => x.tags))];
  for (const id of tags) if (count(x => x.tags.includes(id)) >= 3) cand({ skipTags: [id] }, `Skip "${names.tags?.[id] || 'tag'}"`);
  out.sort((a, b) => b.delta - a.delta);
  return out.slice(0, top);
}

/** Everything the page shows, in one call. */
export function run(rows, R) {
  const all = rows.map(() => true);
  const real = summary(rows, all);
  /* Holding changes what the trades made, so the ghost plays the held
     version; leaving trades out is then measured against that. */
  const mine = R.holdToTarget ? heldRows(rows) : rows;
  const take = apply(mine, R);
  const ghost = summary(mine, take);
  ghost.held = R.holdToTarget ? mine.filter((x, i) => x.changed && take[i]).length : 0;
  return {
    real, ghost, take,
    luck: luck(mine, ghost.net, ghost.skipped),
    effects: effects(rows, R, real),
  };
}
