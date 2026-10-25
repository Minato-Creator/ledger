/* ============================================================
   Weekly review — the week's trades, looked at again once it is over.

   Two tabs, so neither is crowded.

   • Trades: one trade at a time. Its charts, a picture of what price did
     after, and a handful of questions you can only answer in hindsight: how
     far did it run, how far against you, was the direction right, what
     actually happened, what would a better exit have made. Everything saves
     as you go.

   • Week: what those answers add up to. How much was on the table and how
     much you took, how often you were stopped on a right idea, whether your
     winners ever came near the stop — and three short notes to yourself.

   Every figure is in R, because a review is about the trade, not the size.
   What you say about a trade is kept on the trade, so it travels with it.
   ============================================================ */
import { el, svg, icon, toast, lightbox, fitted } from '../ui.js';
import { pairMark } from '../flags.js';
import * as c from '../calc.js';
import * as P from '../periods.js';
import { tradeShotsOf } from '../store.js';
import { tipLayer } from './chartkit.js';
import { CONFIDENCE, EMOTION_AFTER, EXIT_REASONS, MISTAKES, DELIVERY, NEWS, holidayName, heldOf, heldText } from '../questions.js';
import { newsText, holidayText } from '../newsday.js';
import { heldEditor } from './held.js';
import { fromPricesOf } from './addtrade.js';
import { tradeChart } from './tradechart.js';
import * as cd from '../candles.js';
import { measure, inPips } from '../tradeplay.js';

let week = null;           // '2026-W38'
let month = null;          // '2026-09', for the Month tab
let picked = null;         // the trade being reviewed

export const WHAT = [
  ['target', 'Hit target'],
  ['stopped', 'Stopped, then went my way'],
  ['early', 'Closed too early'],
  ['gaveback', 'Gave back profit'],
  ['be', 'BE, then it ran'],
  ['wrong', 'Wrong read'],
  ['tpfar', 'TP too far'],
  ['other', 'Something else'],
];
const ENTRY = [['early', 'Early'], ['ontime', 'On time'], ['late', 'Late']];
const PLAN = [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']];
const GRADE = [['A', 'A'], ['B', 'B'], ['C', 'C']];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const isReviewed = t => !!t?.review?.what;

/* ============================================================
   Read off the chart

   The candles answer what the review used to ask: how close the trade came
   to your stop, how far it ran, and — closed by hand — what holding to the
   target would have made. Read once, kept on the trade's review as
   `review.chart`, and read again only if the trade changes or the prices
   did not yet reach a day past the exit.
   ============================================================ */
export const factsKey = t => [t.date, t.timeOpen, t.timeClose, t.entryPrice, t.stopLoss, t.takeProfit, t.exitPrice, t.side, t.status].join('|');
export const FACTS_V = 3;
/** A stop-out or break-even that had run this far your way first is the
    trap of aiming at a level that never goes: up and given back. */
export const RAN_ENOUGH = 1;
/** Ended at a loss or break-even — the trades "ran before stopped out" is
    asked of. */
export const gaveBack = (kind, r, t) => kind === 'sl' || kind === 'be' || (t?.status !== 'open' && r != null && r <= 0);
/** A stop taken by this much or less (pips, or points) before price went on to
    the target is a stop that was only just too tight. Further is not counted. */
export const NEAR_STOP = 5;
export const factsOf = t => (t?.review?.chart && t.review.chart.v === FACTS_V && t.review.chart.key === factsKey(t) ? t.review.chart : null);
const busy = new Map(), trouble = new Map();
/** Resolves true when there is something new to show. */
export function ensureFacts(store, t) {
  if (!t || t.status === 'open' || !t.timeOpen || !cd.oandaInstrument(t.pair)) return Promise.resolve(false);
  const have = factsOf(t);
  if (have && have.covered) return Promise.resolve(false);
  if (busy.has(t.id)) return busy.get(t.id);
  const job = (async () => {
    try {
      const cred = await cd.getKey();
      if (!cred) { const was = trouble.get(t.id); trouble.set(t.id, 'nokey'); return was !== 'nokey'; }
      const inst = cd.oandaInstrument(t.pair);
      const res = await cd.candlesFor(store, t, cred);
      const kind = closedBy(t);
      const m = measure(t, res.rows, cd.tradeWindow(t), kind);
      if (!m) { trouble.set(t.id, 'none'); return !!have; }
      trouble.delete(t.id);
      const pips = inPips(m.toStop, inst);
      const chart = { v: FACTS_V, key: factsKey(t), heatR: m.heatR, toStop: pips.n, unit: pips.unit, availR: m.availR,
        couldR: m.couldR, duringR: m.duringR, targetR: m.targetR, pastStop: m.pastStop == null ? null : inPips(m.pastStop, inst).n,
        held: m.held, reachedTarget: m.reachedTarget, reachedAt: m.reachedAt, covered: m.covered };
      const same = have && JSON.stringify({ ...have, at: 0 }) === JSON.stringify({ ...chart, at: 0 });
      if (!same) await store.setTradeReview(t.id, { chart: { ...chart, at: new Date().toISOString() } });
      /* Closed by hand: what holding would have made goes on the trade itself,
         where Ghost and the analytics read it — unless you answered it. */
      let held = false;
      if (kind === 'manual' && m.held && (t.heldOutcome == null || t.heldAuto)
          && (t.heldOutcome !== m.held.outcome || t.heldR !== m.held.r)) {
        await store.updateTrade(t.id, { heldOutcome: m.held.outcome, heldR: m.held.r, heldAuto: true });
        held = true;
      }
      return !same || held;
    } catch (e) {
      trouble.set(t.id, cd.explain(e));
      return true;
    } finally { busy.delete(t.id); }
  })();
  busy.set(t.id, job);
  return job;
}
/** Ticked open with "Edit" — which trades show their numbers as boxes. */
const editingFacts = new Set();

/**
 * How a trade ended, for the review: the exit reason you logged, or what
 * the prices say when you did not log one. 'tp' | 'sl' | 'be' | 'manual' | null.
 */
export function closedBy(t) {
  if (['tp', 'sl', 'be', 'manual'].includes(t?.exitReason)) return t.exitReason;
  return fromPricesOf({ ...t, entryPrice: t?.entryPrice, exitPrice: t?.exitPrice })?.reason || null;
}

/**
 * The review's answers as they count: what you gave, and where you gave
 * nothing, what the trade itself already says.
 *   • a trade that hit take profit was the right direction, and ran at
 *     least as far as you took;
 *   • a trade stopped out on the right idea went at least 1R against you —
 *     that is what a stop is;
 *   • "Early entry" ticked on New trade is an early entry.
 * And some answers stop counting when they no longer apply: heat on a
 * trade read the wrong way, a better exit on anything but take profit.
 * `auto` lists the keys that came from the trade rather than from you.
 */
export function reviewOf(acct, t) {
  const v = { ...(t?.review || {}) };
  const auto = new Set();
  const kind = closedBy(t);
  const r = rOf(acct, t);
  const fill = (k, val) => { if (v[k] == null && val != null) { v[k] = val; auto.add(k); } };
  /* What the candles said, when they have been read (see ensureFacts). */
  const ch = factsOf(t);
  if (ch) {
    /* "could have made" is your target if price got there, never more */
    if (kind === 'sl') { if (ch.reachedTarget) fill('dir', 'right'); fill('avail', ch.couldR); }
    else { fill('heat', ch.heatR); fill('avail', ch.couldR); }
    /* up, then given back: the best it got your way while you were in */
    if (gaveBack(kind, r, t) && ch.duringR != null) fill('ran', ch.duringR);
  }
  if (r != null && r > 0) fill('dir', 'right');
  if (kind === 'tp') { fill('dir', 'right'); if (r != null && r > 0) fill('avail', +r.toFixed(2)); }
  if (Array.isArray(t?.mistakes) && t.mistakes.includes('early_entry')) fill('entry', 'early');
  if (kind === 'sl' && v.dir === 'right') fill('heat', 1);
  if (v.dir === 'wrong') { v.heat = null; auto.delete('heat'); }
  if (kind === 'sl' && v.dir !== 'right') { v.heat = null; v.avail = null; }
  if (kind !== 'tp') v.better = null;
  if (kind === 'tp' && v.avail != null && r != null && v.avail < r) v.avail = +r.toFixed(2);
  v.auto = auto;
  v.kind = kind;
  return v;
}

/** The answer to "what happened" the trade points to, before you pick one. */
export function suggestWhat(acct, t) {
  const v = reviewOf(acct, t), kind = v.kind;
  const m = Array.isArray(t?.mistakes) ? t.mistakes : [];
  if (kind === 'tp') return 'target';
  const ch = factsOf(t);
  /* went well your way while you were in, but turned before the target */
  const far = !!ch && ch.targetR != null && ch.duringR >= 1 && ch.duringR >= ch.targetR * 0.6;
  if (kind === 'sl') return v.dir === 'right' ? 'stopped' : far ? 'tpfar' : v.dir === 'wrong' ? 'wrong' : null;
  if (kind === 'be') return v.dir === 'wrong' ? 'wrong' : ch && !ch.reachedTarget ? (far ? 'tpfar' : null) : 'be';
  if (kind === 'manual') return m.includes('closed_early') || (t.heldOutcome === 'win') ? 'early' : far && t.heldOutcome === 'loss' ? 'tpfar' : null;
  return null;
}
const rOf = (acct, t) => { const r = c.rMultiple(acct, t); return r != null && isFinite(r) ? r : null; };
const rr = (v, d = 1) => (v == null || !isFinite(v) ? '—' : `${v > 0.0005 ? '+' : v < -0.0005 ? '−' : ''}${Math.abs(v).toFixed(d)}R`);
const dayOf = iso => DAYS[new Date(iso + 'T00:00:00Z').getUTCDay()];
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/**
 * What a week's answers add up to. Exported so it can be checked on its own.
 *   taken      every trade's R, reviewed or not
 *   available  how far the reviewed trades ran your way, added up
 *   left       of that, what you did not take
 */
export function weekStats(acct, trades) {
  const rows = trades.map(t => ({ t, r: rOf(acct, t), v: reviewOf(acct, t) }));
  const rev = rows.filter(x => isReviewed(x.t));
  const withAvail = rev.filter(x => x.v.avail != null);
  const winners = rev.filter(x => x.r != null && x.r > 0);
  const stopped = rev.filter(x => x.v.what === 'stopped');
  const planned = rev.filter(x => x.v.plan);
  const called = rev.filter(x => x.v.dir);
  const count = (list, key) => Object.fromEntries(list.map(([k]) => [k, rev.filter(x => x.v[key] === k).length]));
  const out = {
    trades: rows.length, reviewed: rev.length,
    taken: rows.reduce((a, x) => a + (x.r ?? 0), 0),
    available: withAvail.reduce((a, x) => a + x.v.avail, 0),
    /* Of what the reviewed trades offered, what you actually banked. */
    capturedTaken: withAvail.reduce((a, x) => a + Math.max(0, Math.min(x.r ?? 0, x.v.avail)), 0),
    left: withAvail.reduce((a, x) => a + Math.max(0, x.v.avail - Math.max(0, x.r ?? 0)), 0),
    stopped: stopped.length,
    stoppedWould: stopped.reduce((a, x) => a + (x.v.better ?? x.v.avail ?? 0), 0),
    plan: planned.length ? planned.filter(x => x.v.plan === 'yes').length / planned.length : null,
    planYes: planned.filter(x => x.v.plan === 'yes').length, planned: planned.length,
    heatOnWinners: avg(winners.filter(x => x.v.heat != null).map(x => x.v.heat)),
    availRight: avg(rev.filter(x => x.v.dir === 'right' && x.v.avail != null).map(x => x.v.avail)),
    takenOnWinners: avg(winners.map(x => x.r)),
    right: called.filter(x => x.v.dir === 'right').length, called: called.length,
    what: count(WHAT, 'what'), entry: count(ENTRY, 'entry'), grade: count(GRADE, 'grade'),
  };
  /* The plan, the result, and what closing early left behind:
     plannedR   every closed trade's planned R:R added up — what you would
                have made had every one of them hit its target;
     taken      what you made (above, losses and all);
     leftEarly  only for trades you got out of early whose target was then
                reached: the rest of the way to the target. */
  const closed = rows.filter(x => x.t.status !== 'open' && x.r != null);
  out.plannedR = closed.reduce((a, x) => a + (c.plannedR(x.t) ?? 0), 0);
  out.plannedN = closed.filter(x => c.plannedR(x.t) != null).length;
  out.leftEarly = closed.reduce((a, x) => a + leftOf(acct, x.t), 0);
  out.leftEarlyN = closed.filter(x => leftOf(acct, x.t) > 0).length;
  out.capture = out.plannedR > 0 ? out.taken / out.plannedR : null;
  /* Stopped out, then on to the target: how far past the stop each went
     first, and the ones within NEAR_STOP — a stop only just too tight. */
  out.pastStops = rows.filter(x => closedBy(x.t) === 'sl' && factsOf(x.t)?.pastStop != null)
    .map(x => ({ id: x.t.id, pair: x.t.pair, n: factsOf(x.t).pastStop, unit: factsOf(x.t).unit }));
  out.nearStop = out.pastStops.filter(p => p.n <= NEAR_STOP);
  /* Up, then given back: trades that ended at a loss or break-even after
     running RAN_ENOUGH or more your way. */
  out.ranBack = rows.filter(x => gaveBack(x.v.kind, x.r, x.t) && x.v.ran != null && x.v.ran >= RAN_ENOUGH)
    .map(x => ({ id: x.t.id, pair: x.t.pair, ran: x.v.ran, r: x.r })).sort((a, b) => b.ran - a.ran);
  out.ranBackR = out.ranBack.reduce((a, x) => a + x.ran, 0);
  return out;
}

/**
 * What getting out early left on the table: the rest of the way to your
 * target — only when price went on to reach it. Nothing for a trade that hit
 * its target or its stop, or one whose target was never reached.
 */
export function leftOf(acct, t) {
  const r = rOf(acct, t), target = c.plannedR(t);
  if (r == null || target == null) return 0;
  const kind = closedBy(t);
  if (kind === 'tp' || kind === 'sl') return 0;
  const held = heldOf(t);
  if (held) return held.outcome === 'win' ? Math.max(0, held.r - r) : 0;
  const ch = factsOf(t);
  if (ch && ch.reachedTarget && kind !== 'manual') return Math.max(0, target - r);
  return 0;
}

export function review(store, nav, sub) {
  const acct = store.activeAccount;
  const all = c.chronological(store.tradesFor(acct.id));
  const tab = sub === 'week' ? 'week' : sub === 'month' ? 'month' : 'trades';

  if (week == null) {
    const now = P.periodOf(c.todayISO(), 'week');
    week = all.some(t => P.periodOf(t.date, 'week') === now) || !all.length
      ? now : P.periodOf(all[all.length - 1].date, 'week');
  }
  /* The month follows the week until it is stepped on its own — a week
     belongs to the month its Thursday is in, the way ISO counts it. */
  if (month == null) month = P.periodOf(shiftDay(P.rangeOf(week).start, 3), 'month');
  const { start, end } = P.rangeOf(tab === 'month' ? month : week);
  const trades = all.filter(t => t.date >= start && t.date <= end);
  if (!trades.some(t => t.id === picked)) picked = (trades.find(t => !isReviewed(t)) || trades[0])?.id || null;
  const L = tab === 'month' ? (() => { const m = P.labelOf(month); return { short: m.title, tick: '' }; })() : P.labelOf(week);
  /* How far through the week you are. Repainted as each trade is answered. */
  const prog = el('div', { class: 'rv-progress', title: 'Trades reviewed this week' });
  const paintProg = () => {
    const done = trades.filter(isReviewed).length;
    prog.replaceChildren(el('div', { class: 'bar' }, el('i', { style: { width: (done / (trades.length || 1) * 100) + '%' } })),
      `${done} of ${trades.length} reviewed`);
  };
  paintProg();

  const go = delta => {
    if (tab === 'month') {
      month = P.step(month, delta);
      /* the week goes with it: the last week of the month with a trade */
      week = P.periodOf(P.anchorOf(month, all), 'week');
    } else {
      week = P.step(week, delta);
      month = P.periodOf(shiftDay(P.rangeOf(week).start, 3), 'month');
    }
    picked = null; nav.refresh();
  };
  const head = el('header', { class: 'head' },
    el('h1', {}, 'Weekly review'),
    el('div', { class: 'seg', role: 'tablist' },
      ...[['trades', 'Trades', '#/review'], ['week', 'Week', '#/review/week'], ['month', 'Month', '#/review/month']].map(([k, label, href]) =>
        el('button', { class: k === tab ? 'is-on' : '', role: 'tab', onClick: () => { if (k !== tab) nav.go(href); } }, label))),
    el('div', { class: 'stepper rv-week' },
      el('button', { onClick: () => go(-1), 'aria-label': 'Previous week' }, icon('chevleft', 12, 'var(--grey-2)', 2.4)),
      el('span', { class: 'val' }, L.tick ? `${L.short} · ${L.tick}` : L.short),
      el('button', { onClick: () => go(1), 'aria-label': 'Next week' }, icon('chevright', 12, 'var(--grey-2)', 2.4))),
    trades.length ? prog : null,
    el('div', { class: 'spacer' }));

  if (!trades.length) {
    if (tab === 'month') return el('div', { class: 'view rv-view' }, head,
      el('div', { class: 'card', style: { flex: '1' } },
        el('div', { class: 'empty' }, icon('review', 34, 'var(--grey-6)', 1.4),
          el('h2', { style: { fontSize: '16px' } }, 'No trades this month'),
          el('p', {}, 'Step back a month, or come back once it is traded.'))));
    return el('div', { class: 'view' }, head,
      el('div', { class: 'card', style: { flex: '1' } },
        el('div', { class: 'empty' },
          icon('review', 34, 'var(--grey-6)', 1.4),
          el('h2', { style: { fontSize: '16px' } }, 'No trades this week'),
          el('p', {}, 'Step back a week, or come back once the week is traded.'))));
  }

  const body = tab === 'week' ? weekTab(store, acct, trades, nav, all)
    : tab === 'month' ? monthTab(store, acct, trades, nav)
    : tradesTab(store, acct, trades, nav, paintProg);
  return el('div', { class: 'view rv-view' }, head, body);
}

/* ============================================================
   Trades — one at a time
   ============================================================ */
function tradesTab(store, acct, trades, nav, paintProg) {
  const rail = el('section', { class: 'card rv-rail' });
  const main = el('div', { class: 'rv-main' });
  /* The week's chart for the trade being reviewed, across the whole page —
     built when the trade changes, not every time an answer is saved. */
  const chartSlot = el('div', { class: 'rv-tchart' });
  let charted = null;
  function paintChart() {
    const t = trade();
    if (!t || charted === t.id) return;
    charted = t.id;
    /* the trade's chart, swapped in once it is drawn — the old one stays until then, so nothing
       jumps (a short message, then a tall empty box, then the chart) */
    const next = tradeChart(store, nav, t, { height: 440, wide: true });
    const old = chartSlot.querySelector('.tc:not(.rv-incoming)');
    chartSlot.querySelectorAll('.rv-incoming').forEach(n => n.remove());
    if (!old) { chartSlot.replaceChildren(next); return; }
    next.classList.add('rv-incoming');
    chartSlot.append(next);
    Promise.race([next.__ready, new Promise(r => setTimeout(r, 4000))]).then(() => {
      if (!next.isConnected) return;
      next.classList.remove('rv-incoming');
      for (const n of [...chartSlot.children]) if (n !== next) n.remove();
    });
  }
  const pb = store.playbook;
  const trade = () => trades.find(t => t.id === picked);

  function paintRail() {
    const kept = rail.querySelector('.rv-list')?.scrollTop || 0;   // the list stays where it was scrolled to
    rail.replaceChildren(
      el('div', { class: 'rv-k' }, 'This week'),
      el('div', { class: 'rv-list' }, ...trades.map(t => {
        const r = rOf(acct, t);
        return el('button', { class: 'rv-item' + (t.id === picked ? ' is-on' : ''), onClick: () => { picked = t.id; paintRail(); paintMain(); } },   // the page stays where it is scrolled (Minato)
          el('span', { class: 'dot ' + (r > 0 ? 'is-pos' : r < 0 ? 'is-neg' : '') }),
          pairMark(t.pair, 22),
          el('span', { class: 'p' }, t.pair || '—', el('small', {}, `${dayOf(t.date)} ${Number(t.date.slice(8))} · ${t.timeOpen || '—'}`)),
          el('span', { class: 'res ' + (r > 0 ? 'is-pos' : r < 0 ? 'is-neg' : '') }, rr(r, 2)),
          el('span', { class: 'ok' + (isReviewed(t) ? ' is-done' : '') }, isReviewed(t) ? icon('check', 11, 'currentColor', 2.6) : null));
      })));
    const list = rail.querySelector('.rv-list');
    if (list && kept) list.scrollTop = kept;
  }

  function paintMain() {
    const t = trade();
    if (!t) { main.replaceChildren(); return; }
    const keep = wrap.scrollTop;
    paintChart();
    main.replaceChildren(reviewCard(store, acct, t, pb, {
      changed: () => { paintRail(); paintProg(); },
      repaint: () => paintMain(),
      next: () => {
        const i = trades.indexOf(t);
        const after = [...trades.slice(i + 1), ...trades.slice(0, i)].find(x => !isReviewed(x));
        const to = after || trades[(i + 1) % trades.length];
        if (!after) toast('Every trade this week is reviewed — the Week tab has what it adds up to');
        picked = to.id; paintRail(); paintMain();
      },
      prev: () => { const i = trades.indexOf(t); picked = trades[(i - 1 + trades.length) % trades.length].id; paintRail(); paintMain(); },
    }));
    wrap.scrollTop = keep;
  }

  const wrap = el('div', { class: 'rv-trades' }, chartSlot, el('div', { class: 'rv-row' }, rail, main));
  paintRail(); paintMain();
  return wrap;
}

/* The trade, at the size of a page. */
function reviewCard(store, acct, t, pb, on) {
  const v = reviewOf(acct, t);
  const kind = v.kind;
  const r = rOf(acct, t);
  const set = async (patch, repaint = true) => { await store.setTradeReview(t.id, patch); on.changed(); if (repaint) on.repaint(); else paintRuler(); };
  const setup = pb.setups.find(s => s.id === t.setupId)?.name;
  const session = t.sessionId ? c.sessionLabel(pb, t.sessionId) : null;

  /* ---------- the pictures ---------- */
  /* Only the pictures you took the trade with. What price did afterwards
     is on the chart at the top, so there is no "after" picture to add. */
  const entry = tradeShotsOf(t);
  const items = entry.map(n => ({ label: 'Entry', name: n }));
  const shot = (name, i) => {
    const tile = el('button', { class: 'rv-shot is-loading', title: 'View full size',
      onClick: () => lightbox({ items, urlFor: n => store.shotUrl(n), at: i }) });
    store.shotUrl(name).then(url => { tile.classList.remove('is-loading'); if (url) tile.style.backgroundImage = `url("${url}")`; });
    return tile;
  };
  const shots = entry.length ? el('div', { class: 'rv-shotgroups' },
    el('div', { class: 'rv-shotgroup' },
      el('span', { class: 'rv-sk' }, 'Screenshots', el('small', {}, String(entry.length))),
      el('div', { class: 'rv-shots' }, ...entry.map((n, i) => shot(n, i))))) : null;

  /* ---------- the ruler: your stop, your result, how far it ran ---------- */
  const ruler = el('div', { class: 'rv-ruler' });
  function paintRuler() {
    ruler.replaceChildren(rulerOf(r, reviewOf(acct, t), true));
  }
  paintRuler();

  /* ---------- the questions ---------- */
  const num = (key, label, hint, { neg = false } = {}) => {
    const shown = v[key] == null ? '' : (neg ? -v[key] : v[key]).toFixed(1).replace(/\.0$/, '');
    const input = el('input', { class: 'rv-num' + (neg ? ' is-neg' : ' is-pos') + (v.auto.has(key) ? ' is-auto' : ''), inputmode: 'decimal', value: shown, placeholder: '—',
      'aria-label': label,
      onChange: e => {
        const raw = c.parseNumberOrNull(e.target.value);
        const val = raw == null ? null : neg ? Math.abs(raw) : raw;
        if (raw != null && !isFinite(raw)) { e.target.value = shown; return; }
        e.target.value = val == null ? '' : (neg ? -val : val).toFixed(1).replace(/\.0$/, '');
        e.target.classList.remove('is-auto');
        set({ [key]: val }, false);
      } });
    return el('label', { class: 'rv-f' }, el('span', { class: 'k' }, label),
      el('span', { class: 'rv-numwrap' }, input, el('i', {}, 'R')), el('span', { class: 'hint' }, hint));
  };
  const seg = (key, opts, tone = {}, extra = () => ({})) => el('div', { class: 'rv-seg' + (v.auto.has(key) ? ' is-auto' : ''), role: 'group' },
    ...opts.map(([k, label]) => el('button', { class: (v[key] === k ? 'is-on ' + (tone[k] || '') : ''),
      onClick: () => set({ [key]: v[key] === k && !v.auto.has(key) ? null : k, ...extra(k) }) }, label)));
  const autoNote = (key, text) => v.auto.has(key) ? el('span', { class: 'hint rv-autonote' }, text) : null;
  /* Right or wrong is a question about a loss: a winner was right. */
  const loser = kind === 'sl' || (r != null && r < 0);

  /* ---------- read off the chart ----------
     Shown as information, not questions. One Edit at the right of the box
     turns every number in it into a box you can type in; typed numbers win
     over the chart's, and "Use the chart" gives them back. */
  const ch = factsOf(t);
  if (!ch && t.status !== 'open' && (!trouble.has(t.id) || trouble.get(t.id) === 'nokey'))
    ensureFacts(store, t).then(changed => { if (changed && document.body.contains(ruler)) on.repaint(); });
  const why = trouble.get(t.id);
  const pending = !ch && busy.has(t.id) && why !== 'nokey';
  const noChart = !ch && !pending;
  const editing = editingFacts.has(t.id) || noChart;
  function factsBox() {
    const unit = ch?.unit || 'pips';
    const typed = k => t.review && t.review[k] != null;
    const fact = (k, label, value, tone = '', note = '') => el('div', { class: 'rv-fact ' + tone, 'data-fact': k },
      el('span', { class: 'k' }, label), el('b', {}, value), note ? el('small', {}, note) : null);
    const when = s => { const d = new Date(s * 1000); return `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const facts = [];
    if (kind === 'sl') {
      /* a stop is a loss, said plainly — not "−1R of heat" */
      facts.push(fact('heat', 'Drawdown', 'Trade lost', 'is-neg'));
      facts.push(fact('avail', 'Could have made', v.avail != null ? rr(v.avail) : '—', v.avail > 0 ? 'is-pos' : '',
        typed('avail') ? 'typed by you' : ch ? (ch.reachedTarget ? `price reached your target after the stop · ${when(ch.reachedAt)}` : 'the best it got after the stop — it never reached your target') : ''));
      /* the idea was right and price went on to the target: how far past
         your stop it went first. A few pips is a stop only just too tight. */
      if (v.dir === 'right' && ch && ch.pastStop != null) {
        const near = ch.pastStop <= NEAR_STOP;
        facts.push(fact('paststop', 'Past your stop', `${ch.pastStop} ${unit}`, near ? 'is-warn' : '',
          near ? `then on to your target · within ${NEAR_STOP} ${unit}` : `more than ${NEAR_STOP} ${unit} — not counted`));
      }
    } else {
      const heatTxt = v.heat == null ? '—' : v.heat < 0.005 ? 'never against you' : rr(-v.heat);
      facts.push(fact('heat', 'Drawdown', heatTxt, v.heat >= 0.8 ? 'is-neg' : '',
        typed('heat') ? 'typed by you' : ch && v.heat >= 0.005 ? `came within ${ch.toStop} ${unit} of your stop` : ''));
      /* what it could have made — your target if price got there, never
         more: how far it ran past the target is not this trade's business.
         A target hit already made it; a manual close says it as "held". */
      if (kind !== 'tp' && kind !== 'manual')
        facts.push(fact('avail', 'Could have made', v.avail != null ? rr(v.avail) : '—', v.avail > 0 ? 'is-pos' : '',
          typed('avail') ? 'typed by you' : ch ? (ch.reachedTarget ? 'your target was reached' : 'the best it got — it never reached your target') : ''));
      if (kind === 'manual') {
        const held = heldOf(t);
        facts.push(fact('held', 'Held to target', held ? heldText(held) : ch && !ch.held ? 'neither yet' : '—',
          held ? (held.outcome === 'win' ? 'is-pos' : held.outcome === 'loss' ? 'is-neg' : '') : '',
          held && t.heldAuto && ch?.held ? `${ch.held.outcome === 'win' ? 'target' : 'stop'} hit ${when(ch.held.at)}`
            : held ? 'your answer' : ch && !ch.held ? 'target and stop both untouched in the prices so far' : ''));
      }
      if (kind === 'be' && ch) facts.push(fact('after', 'After break-even', ch.reachedTarget ? 'went on to your target' : 'never reached your target',
        ch.reachedTarget ? 'is-pos' : ''));
    }
    /* how far it ran your way before it came back to break-even or the stop */
    if (gaveBack(kind, r, t)) {
      const up = v.ran;
      facts.push(fact('ran', 'Ran before stopped out', up == null ? '—' : up < 0.05 ? 'never your way' : rr(up), up >= RAN_ENOUGH ? 'is-warn' : '',
        typed('ran') ? 'typed by you' : up >= 0.05 ? `while you were in, then ${kind === 'be' ? 'back to break-even' : kind === 'sl' ? 'stopped out' : 'closed at a loss'}` : ''));
    }
    const head = el('div', { class: 'rv-facts-h' },
      el('span', { class: 'k' }, 'From the chart'),
      el('span', { class: 'rv-facts-src' }, pending ? 'reading the prices…'
        : why === 'nokey' ? 'add your OANDA key in Settings and these fill themselves'
        : why === 'none' ? 'no prices for this trade — fill these in by hand'
        : why ? why : ch ? 'OANDA prices' : ''),
      why && why !== 'nokey' && why !== 'none' ? el('button', { class: 'rv-facts-reset', onClick: () => { trouble.delete(t.id); on.repaint(); } }, 'Try again') : null,
      el('div', { class: 'spacer' }),
      editing && ch
        ? el('button', { class: 'rv-facts-reset', onClick: () => set({ heat: null, avail: null, ran: null }) }, 'Use the chart') : null,
      noChart ? null : el('button', { class: 'rv-facts-edit' + (editing ? ' is-on' : ''),
        onClick: () => { editing ? editingFacts.delete(t.id) : editingFacts.add(t.id); on.repaint(); } }, editing ? 'Done' : 'Edit'));
    if (!editing) return el('div', { class: 'rv-facts' }, head, el('div', { class: 'rv-facts-row' }, ...facts));
    /* typing them in: the old questions, filled with what the chart said */
    const boxes = [];
    const could = () => num('avail', 'Could have made', 'your target if price got there — never more than that');
    if (kind === 'sl') { if (v.dir === 'right') boxes.push(could()); }
    else {
      boxes.push(could());
      if (v.dir !== 'wrong') boxes.push(num('heat', 'Drawdown', 'how close it came to your stop', { neg: true }));
    }
    if (gaveBack(kind, r, t)) boxes.push(num('ran', 'Ran before stopped out', 'how far it went your way while you were in'));
    return el('div', { class: 'rv-facts is-editing' }, head,
      el('div', { class: 'rv-facts-edit-row' }, ...boxes),
      kind === 'manual' ? heldBox(store, t) : null);
  }
  const sug = suggestWhat(acct, t);
  const lessonBox = el('textarea', { class: 'rv-lesson', rows: 2, placeholder: 'One line you want to remember', 'aria-label': 'Lesson' }, v.lesson || '');
  let timer = null;
  lessonBox.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => store.setTradeReview(t.id, { lesson: lessonBox.value.trim() || null }), 500); });
  lessonBox.addEventListener('change', () => { clearTimeout(timer); store.setTradeReview(t.id, { lesson: lessonBox.value.trim() || null }); });

  return el('section', { class: 'card rv-card' },
    el('div', { class: 'rv-top' },
      el('span', { class: 'dot ' + (r > 0 ? 'is-pos' : r < 0 ? 'is-neg' : '') }),
      pairMark(t.pair, 32),
      el('div', { class: 'p' }, el('b', {}, t.pair || '—'),
        el('span', {}, [`${dayOf(t.date)} ${c.shortDate(t.date)}`, t.timeOpen, setup, t.side === 'sell' ? 'short' : 'long', session].filter(Boolean).join(' · '))),
      el('span', { class: 'res ' + (r > 0 ? 'is-pos' : r < 0 ? 'is-neg' : '') }, rr(r, 2))),
    fromTheTrade(t, on, store.data.news),
    ruler,
    factsBox(),
    /* What a reviewer decides. The rest is read off the chart, above. */
    el('div', { class: 'rv-form' },
      el('div', { class: 'rv-col' },
        loser ? el('div', { class: 'rv-f' }, el('span', { class: 'k' }, 'Direction'),
          seg('dir', [['right', 'Right'], ['wrong', 'Wrong']], { right: 'is-good', wrong: 'is-bad' }, k => (k === 'wrong' ? { heat: null } : {})),
          autoNote('dir', 'it reached your target after the stop'), kind === 'sl' && !v.dir ? el('span', { class: 'hint rv-ask' }, 'was the idea right?') : null) : null,
        kind === 'tp' ? num('better', 'Better exit', 'what a better exit would have made') : null,
        el('div', { class: 'rv-f' }, el('span', { class: 'k' }, 'Entry'), seg('entry', ENTRY), autoNote('entry', 'from your mistakes'))),
      el('div', { class: 'rv-col' },
        el('div', { class: 'rv-f' }, el('span', { class: 'k' }, 'Plan followed'), seg('plan', PLAN, { yes: 'is-good' })),
        el('div', { class: 'rv-f' }, el('span', { class: 'k' }, 'Grade'), seg('grade', GRADE)))),
    el('div', { class: 'rv-f is-top' }, el('span', { class: 'k' }, 'What happened'),
      el('div', { class: 'rv-chips' }, ...WHAT.map(([k, label]) => el('button', {
        class: (v.what === k ? 'is-on' : '') + (!v.what && sug === k ? ' is-sug' : ''),
        title: !v.what && sug === k ? 'Suggested from how the trade closed — click to confirm' : null,
        onClick: () => set({ what: v.what === k ? null : k }) }, label)))),
    el('div', { class: 'rv-f is-top' }, el('span', { class: 'k' }, 'Lesson'), lessonBox),
    /* the pictures last: the chart above already shows the trade, so the
       answers come first and the screenshots sit underneath them */
    shots,
    el('div', { class: 'rv-actions' },
      el('span', { class: 'rv-saved' }, isReviewed(t) ? 'Reviewed · saved as you go' : 'Pick what happened to mark it reviewed'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-quiet', onClick: on.prev }, icon('chevleft', 12, 'currentColor', 2.2), 'Previous'),
      el('button', { class: 'btn btn-primary', onClick: on.next }, 'Next to review', icon('chevright', 12, 'currentColor', 2.2))));
}

/* What you said about the trade when you logged it, read back so the review
   starts from it: confidence, feeling after, how it ended, the timeframe,
   price delivery and any mistakes. Changing them is the trade's own page. */
function fromTheTrade(t, on, news = null) {
  const name = (list, k) => (list.find(([v]) => v === k) || [])[1];
  const m = Array.isArray(t.mistakes) ? t.mistakes : null;
  const bits = [
    t.confidence != null ? ['In', `${t.confidence} · ${name(CONFIDENCE, t.confidence)}`, t.confidence <= 2 ? 'is-bad' : t.confidence >= 4 ? 'is-good' : ''] : null,
    t.emotionAfter != null ? ['After', `${t.emotionAfter} · ${name(EMOTION_AFTER, t.emotionAfter)}`, t.emotionAfter <= 2 ? 'is-bad' : t.emotionAfter >= 4 ? 'is-good' : ''] : null,
    t.exitReason ? ['Exit', name(EXIT_REASONS, t.exitReason), t.exitReason === 'tp' ? 'is-good' : t.exitReason === 'sl' ? 'is-bad' : ''] : null,
    t.execTf ? ['TF', t.execTf, ''] : null,
    t.delivery ? ['Price', name(DELIVERY, t.delivery), t.delivery === 'good' ? 'is-good' : t.delivery === 'poor' ? 'is-bad' : ''] : null,
    t.news ? ['News', name(NEWS, t.news), t.news === 'none' ? '' : 'is-news'] : null,
    /* the calendar's answer where it was read for that day, else as saved */
    ['Red folder', newsText(t, news) ?? 'N/A', newsText(t, news) ? 'is-rf' : 'is-na'],
    ['Bank holiday', holidayText(t, news) ?? 'N/A', holidayText(t, news) ? 'is-hol' : 'is-na'],
  ].filter(Boolean);
  if (!bits.length && !m) return null;
  return el('div', { class: 'rv-from' },
    el('span', { class: 'k' }, 'When logged'),
    el('div', { class: 'rv-from-row' },
      ...bits.map(([k, v, tone]) => el('span', { class: 'rv-pill ' + tone }, el('i', {}, k), v)),
      m == null ? null : m.length
        ? MISTAKES.filter(([k]) => m.includes(k)).map(([, n]) => el('span', { class: 'rv-pill is-mistake' }, n))
        : el('span', { class: 'rv-pill is-good' }, 'No mistakes')));
}

/* "If held to target", for a trade you closed by hand — the only kind
   where what holding would have made is a real question. The answer is
   kept on the trade itself, the same field New trade writes. */
function heldBox(store, t) {
  const held = heldOf(t);
  let timer = null;
  const note = el('span', { class: 'hint' }, held ? `saved · ${heldText(held)}` : 'what it would have made had you left it alone');
  return el('div', { class: 'rv-f rv-held' },
    el('span', { class: 'k' }, 'If held'),
    heldEditor(held, val => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const whole = val && val.r != null;
        await store.updateTrade(t.id, { heldOutcome: whole ? val.outcome : null, heldR: whole ? val.r : null, heldAuto: false });
        note.textContent = whole ? `saved · ${heldText(heldOf(t))}` : val ? 'how many R?' : 'what it would have made had you left it alone';
      }, 350);
    }),
    note);
}

/* One trade on a line of R: the stop at −1R, heat in red, how far it ran in
   pale green, what you took in green, your result as a dot and a better
   exit as a ring. */
function rulerOf(r, v, big) {
  const lo = Math.min(-1.25, -(v.heat ?? 0) - 0.25, (r ?? 0) - 0.25);
  const hi = Math.max(3, (v.avail ?? 0) + 0.5, (r ?? 0) + 0.5, (v.better ?? 0) + 0.5);
  const X = x => ((x - lo) / (hi - lo)) * 100;
  const span = (cls, a, b) => el('span', { class: cls, style: { left: X(Math.min(a, b)) + '%', width: Math.abs(X(b) - X(a)) + '%' } });
  const marks = [];
  for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) marks.push(k);
  return el('div', { class: 'rv-rl' + (big ? ' is-big' : '') },
    el('div', { class: 'track' },
      v.heat ? span('heat', 0, -v.heat) : null,
      v.avail ? span('avail', 0, v.avail) : null,
      r > 0 ? span('took', 0, r) : null,
      el('span', { class: 'sl', style: { left: X(-1) + '%' }, title: 'Your stop, at −1R' }),
      el('span', { class: 'z', style: { left: X(0) + '%' } }),
      v.better != null ? el('span', { class: 'bx', style: { left: X(v.better) + '%' }, title: `Better exit ${rr(v.better)}` }) : null,
      r != null ? el('span', { class: 'you', style: { left: X(r) + '%' }, title: `You took ${rr(r, 2)}` }) : null),
    big ? el('div', { class: 'lbls' }, ...marks.map(k => el('span', { style: { left: X(k) + '%' } }, k === 0 ? '0' : rr(k, 0)))) : null,
    big ? el('div', { class: 'key' },
      el('span', {}, el('i', { class: 'heat' }), v.kind === 'sl' ? 'trade lost' : `drawdown ${v.heat != null ? rr(-v.heat) : '—'}`),
      el('span', {}, el('i', { class: 'avail' }), `could have made ${rr(v.avail)}`),
      el('span', {}, el('i', { class: 'you' }), `you ${rr(r, 2)}`),
      v.better != null ? el('span', {}, el('i', { class: 'bx' }), `better exit ${rr(v.better)}`) : null) : null);
}

/* ============================================================
   Week — what it adds up to
   ============================================================ */
function weekTab(store, acct, trades, nav, all) {
  const S = weekStats(acct, trades);
  if (!S.reviewed) {
    return el('div', { class: 'rv-body' },
      el('section', { class: 'card lab-prompt' },
        icon('review', 28, 'var(--grey-6)', 1.4),
        el('h2', {}, 'Nothing reviewed yet'),
        el('p', {}, 'Go through the week’s trades first — this adds them up.'),
        el('button', { class: 'btn btn-primary', onClick: () => nav.go('#/review') }, 'Review the trades')),
      notesCard(store, nav));
  }
  const stat = (k, v, s, cls = '') => el('div', { class: 'rv-stat' + cls },
    el('span', { class: 'k' }, k), el('span', { class: 'v' }, v), el('span', { class: 's' }, s || ' '));
  const stats = el('div', { class: 'rv-stats' },
    stat('Taken', rr(S.taken), `${S.trades} trade${S.trades === 1 ? '' : 's'} this week`, S.taken > 0 ? ' is-pos' : S.taken < 0 ? ' is-neg' : ''),
    stat('Left on the table', rr(S.leftEarly), S.leftEarlyN ? `closed early on ${S.leftEarlyN}, target then hit` : 'nothing closed early that went on'),
    stat('Stopped, but right', String(S.stopped), S.stopped ? `would have made ${rr(S.stoppedWould)}` : 'none this week'),
    stat('Plan followed', S.plan == null ? '—' : c.pct(S.plan, 0), S.planned ? `${S.planYes} of ${S.planned} trades` : 'not answered yet'),
    nearStopStat(S, stat),
    ranBackStat(S, stat));

  const main = el('div', { class: 'rv-wleft' },
    el('div', { class: 'rv-hero' }, captureCard(S), stats),
    tradesCard(acct, trades),
    habitsCard(acct, trades),
    el('div', { class: 'rv-wpair' }, scatterCard(acct, trades, S), mixCard(acct, trades, S)),
    trendCard(acct, all));
  return el('div', { class: 'rv-body' }, main, notesCard(store, nav));
}

/* How often a stop was taken by a hair: price went at most NEAR_STOP past
   it and then on to the target. */
function nearStopStat(S, stat, cls = '') {
  const near = S.nearStop, all = S.pastStops;
  const list = near.slice(0, 4).map(p => `${p.pair} ${p.n} ${p.unit}`).join(' · ') + (near.length > 4 ? ' …' : '');
  return stat('Just past your stop', String(near.length),
    near.length ? `of ${all.length} stop${all.length === 1 ? '' : 's'} that went on to target · ${list}`
      : all.length ? `${all.length} stopped then hit target — each more than ${NEAR_STOP} past` : 'no stop went on to your target',
    (near.length ? ' is-warn' : '') + cls);
}

/* Up and given back: how many trades ran RAN_ENOUGH or more your way, then
   ended at break-even or a loss — the level aimed at that never went. */
function ranBackStat(S, stat) {
  const n = S.ranBack.length, top = S.ranBack[0];
  return stat('Ran before stopped out', String(n),
    n ? `${n === 1 ? 'was' : 'were'} up ${rr(S.ranBackR)} between them, then BE or a loss · most ${rr(top.ran)} ${top.pair}`
      : `no trade was up ${RAN_ENOUGH}R or more before a BE or a loss`, n ? ' is-warn' : '');
}

/* ---------- what you logged, added up ----------
   The answers given on New trade, for this week only: how many trades were
   clean, which mistakes came up and what they cost, how sure you were going
   in and how it felt after, and — for the trades that stopped short — what
   holding them would have made instead. */
export function weekHabits(acct, trades) {
  const rows = trades.filter(t => t.status !== 'open').map(t => ({ t, r: rOf(acct, t) })).filter(x => x.r != null);
  const asked = rows.filter(x => Array.isArray(x.t.mistakes));
  const clean = asked.filter(x => !x.t.mistakes.length);
  const mistakes = MISTAKES.map(([k, label]) => {
    const hit = asked.filter(x => x.t.mistakes.includes(k));
    return { key: k, label, n: hit.length, sum: hit.reduce((a, x) => a + x.r, 0) };
  }).filter(m => m.n).sort((a, b) => b.n - a.n || a.sum - b.sum);
  const conf = rows.filter(x => x.t.confidence != null).map(x => x.t.confidence);
  const feel = rows.filter(x => x.t.emotionAfter != null).map(x => x.t.emotionAfter);
  const held = rows.map(x => ({ ...x, h: heldOf(x.t) })).filter(x => x.h);
  return {
    asked: asked.length, clean: clean.length, cleanR: clean.reduce((a, x) => a + x.r, 0),
    mistakes, made: asked.length - clean.length,
    conf: avg(conf), confN: conf.length, feel: avg(feel), feelN: feel.length,
    held: held.length, heldTook: held.reduce((a, x) => a + x.r, 0), heldWould: held.reduce((a, x) => a + x.h.r, 0),
  };
}

function habitsCard(acct, trades) {
  const H = weekHabits(acct, trades);
  if (!H.asked && !H.confN && !H.feelN && !H.held) return null;
  const word = (list, v) => v == null ? '' : list[Math.min(4, Math.max(0, Math.round(v) - 1))][1];
  const meter = v => el('span', { class: 'rv-meter' }, ...[1, 2, 3, 4, 5].map(i => el('i', { class: v != null && i <= Math.round(v) ? 'on' : '' })));
  const diff = H.heldWould - H.heldTook;
  const block = (k, v, s, extra = null, cls = '') => el('div', { class: 'rv-hb' + cls }, el('span', { class: 'k' }, k), el('span', { class: 'v' }, v), extra, el('span', { class: 's' }, s));
  return el('section', { class: 'card rv-habits' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'How you traded it'), el('span', { class: 'lab-sub' }, 'from what you logged on each trade'),
      H.held ? el('span', { class: 'lab-sub', style: { marginLeft: 'auto' } }, `if held: ${H.held} trade${H.held === 1 ? '' : 's'} cut short`) : null),
    el('div', { class: 'rv-hgrid' },
      block('Clean trades', H.asked ? `${H.clean} of ${H.asked}` : '—', H.clean ? `${rr(H.cleanR)} between them` : H.asked ? 'every one had a mistake' : 'mistakes not logged',
        H.asked ? el('span', { class: 'rv-cleanbar' }, el('i', { style: { flex: String(H.clean) } }), el('b', { style: { flex: String(H.asked - H.clean) } })) : null,
        H.asked && H.clean === H.asked ? ' is-pos' : ''),
      el('div', { class: 'rv-hb is-mist' }, el('span', { class: 'k' }, 'Mistakes'),
        H.mistakes.length
          ? el('div', { class: 'rv-mlist' }, ...H.mistakes.slice(0, 5).map(m => el('span', {}, el('b', {}, `${m.n}×`), m.label)))
          : el('span', { class: 'v' }, H.asked ? 'None' : '—'),
        H.mistakes.length > 5 ? el('span', { class: 's' }, `and ${H.mistakes.length - 5} more`) : null),
      block('Going in', H.conf == null ? '—' : H.conf.toFixed(1), H.conf == null ? 'not rated' : `${word(CONFIDENCE, H.conf)} on average · ${H.confN} rated`, meter(H.conf)),
      block('Feeling after', H.feel == null ? '—' : H.feel.toFixed(1), H.feel == null ? 'not rated' : `${word(EMOTION_AFTER, H.feel)} on average · ${H.feelN} rated`, meter(H.feel)),
      block('If held', H.held ? `${diff > 0.0005 ? '+' : diff < -0.0005 ? '−' : ''}${Math.abs(diff).toFixed(1)}R` : '—',
        H.held ? `${rr(H.heldWould)} held · ${rr(H.heldTook)} taken` : 'no trade cut short',
        null, H.held ? (diff > 0.0005 ? ' is-pos' : diff < -0.0005 ? ' is-neg' : '') : '')));
}

/* ---------- how much of the move you took ----------
   One arc: the part you took, solid, and the part you left, pale. */
/* ---------- what you took, against what you planned ----------
   Taken: what the trades made, losses and all. Available: what getting out
   early left behind, on trades whose target was then reached. Planned:
   every trade's planned R:R added up — had each one hit its target. The arc
   is taken out of planned. */
function captureCard(S) {
  const p = S.capture == null ? 0 : Math.max(0, Math.min(1, S.capture));
  const say = S.capture == null ? 'Log a stop and a target on your trades to see this'
    : S.leftEarly > 0.05 ? `Getting out early left ${rr(S.leftEarly)} on ${S.leftEarlyN} trade${S.leftEarlyN === 1 ? '' : 's'} that went on to the target`
    : S.capture < 0 ? 'Down against what the plans aimed for'
    : S.capture < 0.35 ? 'A small share of what your plans aimed for'
    : S.capture > 0.7 ? 'Most of what your plans aimed for' : 'A fair share of what your plans aimed for';
  return el('section', { class: 'card rv-capture' },
    el('div', { class: 'rv-k' }, 'Of the plan'),
    el('div', { class: 'rv-gauge' }, fitted((w, h) => drawGauge(p, w, h), 150),
      el('div', { class: 'rv-gauge-c' },
        el('b', {}, S.capture == null ? '—' : c.pct(S.capture, 0)), el('span', {}, 'of planned'))),
    el('div', { class: 'rv-cap-row' },
      el('span', { title: 'What your trades made, losses included' }, el('i', { class: 'took' }), el('b', {}, rr(S.taken)), 'taken'),
      el('span', { title: 'Left by getting out early, on trades that then reached the target' }, el('i', { class: 'left' }), el('b', {}, rr(S.leftEarly)), 'available'),
      el('span', { title: 'Every trade’s planned R:R added up — had each hit its target' }, el('b', {}, rr(S.plannedR)), 'planned')),
    el('p', { class: 'rv-say' }, say));
}

function drawGauge(p, W, H) {
  const cx = W / 2, r = Math.min(W / 2 - 10, H - 14), cy = r + 8;
  const a0 = Math.PI, a1 = 2 * Math.PI;                      // a half circle, left to right
  const pt = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const arc = (from, to, cls) => {
    const [x0, y0] = pt(from), [x1, y1] = pt(to);
    return svg('path', { class: cls, d: `M${x0.toFixed(1)},${y0.toFixed(1)}A${r},${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}` });
  };
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  g.append(arc(a0, a1, 'rv-arc-bg'));
  if (p > 0.001) g.append(arc(a0, a0 + (a1 - a0) * p, 'rv-arc line-draw'));
  const [tx, ty] = pt(a0 + (a1 - a0) * p);
  if (p > 0.001) g.append(svg('circle', { class: 'rv-arc-tip line-tip', cx: tx, cy: ty, r: 5 }));
  return g;
}

/* ---------- every trade: how far against, how far for, and where you got out ---------- */
function tradesCard(acct, trades) {
  return el('section', { class: 'card lab-chart rv-chart' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Every trade'),
      el('span', { class: 'lab-sub' }, 'the range it moved, and where you got out'),
      el('span', { class: 'lab-legend' }, el('i', { class: 'rv-k-range' }), 'range', el('i', { class: 'rv-k-dot' }), 'your exit',
        el('i', { class: 'rv-k-ring' }), 'better exit')),
    fitted((w, h) => drawTrades(acct, trades, w, h), 230));
}

function drawTrades(acct, trades, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const tip = tipLayer(wrap);
  const rows = trades.map(t => ({ t, r: rOf(acct, t), v: reviewOf(acct, t) }));
  let hi = 1, lo = -1;
  for (const x of rows) { hi = Math.max(hi, x.v.avail ?? 0, x.r ?? 0, x.v.better ?? 0); lo = Math.min(lo, -(x.v.heat ?? 0), x.r ?? 0); }
  hi += 0.5; lo -= 0.35;
  const plot = { l: 36, r: W - 8, t: 12, b: H - 34 };
  const Y = v => plot.b - ((v - lo) / (hi - lo)) * (plot.b - plot.t);
  const slot = (plot.r - plot.l) / rows.length;
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) {
    g.append(svg('line', { class: k === 0 ? 'lab-zero' : 'lab-grid', x1: plot.l, x2: plot.r, y1: Y(k), y2: Y(k) }));
    g.append(svg('text', { class: 'lab-tick', x: plot.l - 7, y: Y(k) + 3.5, 'text-anchor': 'end' }, k === 0 ? '0' : rr(k, 0)));
  }
  g.append(svg('line', { class: 'rv-stopline', x1: plot.l, x2: plot.r, y1: Y(-1), y2: Y(-1) }));
  g.append(svg('text', { class: 'rv-stoplbl', x: plot.r, y: Y(-1) - 5, 'text-anchor': 'end' }, 'stop'));
  rows.forEach((x, i) => {
    const cx = plot.l + slot * i + slot / 2;
    const top = x.v.avail ?? Math.max(0, x.r ?? 0), bot = -(x.v.heat ?? Math.max(0, -(x.r ?? 0)));
    const done = isReviewed(x.t);
    /* The range it moved: pale green above zero, pale red below. */
    if (top > 0) g.append(svg('rect', { class: 'rv-rng-up' + (done ? '' : ' is-todo'), x: cx - 3, y: Y(top), width: 6, height: Math.max(1, Y(0) - Y(top)), rx: 3 }));
    if (bot < 0) g.append(svg('rect', { class: 'rv-rng-dn' + (done ? '' : ' is-todo'), x: cx - 3, y: Y(0), width: 6, height: Math.max(1, Y(bot) - Y(0)), rx: 3 }));
    if (x.v.better != null) g.append(svg('circle', { class: 'rv-ring', cx, cy: Y(x.v.better), r: 5 }));
    if (x.r != null) g.append(svg('circle', { class: 'rv-exit line-tip ' + (x.r > 0 ? 'is-pos' : x.r < 0 ? 'is-neg' : ''), cx, cy: Y(x.r), r: 6 }));
    g.append(svg('text', { class: 'lab-tick', x: cx, y: plot.b + 14, 'text-anchor': 'middle' }, `${dayOf(x.t.date)} ${Number(x.t.date.slice(8))}`));
    g.append(svg('text', { class: 'lab-tick rv-pair', x: cx, y: plot.b + 27, 'text-anchor': 'middle' }, x.t.pair || ''));
    const hit = svg('rect', { class: 'an-hit', x: cx - slot / 2, y: plot.t, width: slot, height: plot.b - plot.t, fill: 'transparent' });
    hit.addEventListener('pointerenter', () => tip.show(cx, plot.t + 30, [
      el('div', { class: 'h' }, `${x.t.pair || ''} · ${dayOf(x.t.date)} ${c.shortDate(x.t.date)} ${x.t.timeOpen || ''}`),
      el('div', { class: 'r' }, el('i', { class: x.r > 0 ? 'is-pass' : 'is-fail' }), el('b', {}, rr(x.r, 2)), el('span', {}, 'taken')),
      el('div', { class: 'r' }, el('b', {}, rr(x.v.avail)), el('span', {}, 'available')),
      el('div', { class: 'r' }, el('b', {}, x.v.heat != null ? rr(-x.v.heat) : '—'), el('span', {}, 'drawdown')),
      el('div', { class: 'r' }, el('span', {}, x.v.what ? WHAT.find(w => w[0] === x.v.what)?.[1] : 'not reviewed yet'))]));
    hit.addEventListener('pointerleave', () => tip.hide());
    g.append(hit);
  });
  wrap.prepend(g);
  return wrap;
}

/* ---------- stop and target, read off your own trades ----------
   Each reviewed trade at how far it went against you (across) and how far it
   ran for you (up). Right of the stop line, it took your stop; above the
   take line, it ran further than you usually take. The top-right corner is
   the trades your stop cost you. */
function scatterCard(acct, trades, S) {
  const pts = trades.filter(t => isReviewed(t) && reviewOf(acct, t).heat != null && reviewOf(acct, t).avail != null);
  const say = S.heatOnWinners == null ? null
    : S.heatOnWinners < 0.5 ? `Winners drew down only ${rr(-S.heatOnWinners)} — your stop has room`
    : S.heatOnWinners > 0.8 ? `Winners drew down ${rr(-S.heatOnWinners)} — your stop may be tight`
    : `Winners used about half your stop`;
  const card = el('section', { class: 'card lab-chart rv-scatter' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Stop & target'), el('span', { class: 'lab-sub' }, 'drawdown across, room to run up')));
  if (pts.length < 2) { card.append(el('p', { class: 'lab-empty' }, 'Fill in drawdown and could have made on a few trades to see this.')); return card; }
  card.append(fitted((w, h) => drawScatter(acct, pts, S, w, h), 230), say ? el('p', { class: 'rv-say' }, say) : null);
  return card;
}

function drawScatter(acct, pts, S, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const tip = tipLayer(wrap);
  const rows = pts.map(t => ({ t, r: rOf(acct, t), v: reviewOf(acct, t) }));
  const xMax = Math.max(1.4, ...rows.map(x => x.v.heat)) * 1.1;
  const yMax = Math.max(2, ...rows.map(x => x.v.avail)) * 1.1;
  const plot = { l: 36, r: W - 12, t: 14, b: H - 26 };
  const X = v => plot.l + (v / xMax) * (plot.r - plot.l);
  const Y = v => plot.b - (v / yMax) * (plot.b - plot.t);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  /* The corner your stop cost you: beyond the stop, and it still ran. */
  const take = S.takenOnWinners;
  if (take != null) g.append(svg('rect', { class: 'rv-zone', x: X(1), y: plot.t, width: plot.r - X(1), height: Y(take) - plot.t }));
  for (let k = 0; k <= Math.floor(yMax); k++) {
    g.append(svg('line', { class: k ? 'lab-grid' : 'lab-zero', x1: plot.l, x2: plot.r, y1: Y(k), y2: Y(k) }));
    g.append(svg('text', { class: 'lab-tick', x: plot.l - 7, y: Y(k) + 3.5, 'text-anchor': 'end' }, k ? rr(k, 0) : '0'));
  }
  for (let k = 0; k <= xMax + 1e-9; k += 0.5) g.append(svg('text', { class: 'lab-tick', x: X(k), y: plot.b + 16, 'text-anchor': 'middle' }, k ? `−${k}R` : '0'));
  g.append(svg('line', { class: 'rv-stopv', x1: X(1), x2: X(1), y1: plot.t, y2: plot.b }));
  g.append(svg('text', { class: 'rv-stoplbl', x: X(1) + 6, y: plot.b - 6 }, 'your stop'));
  if (take != null) {
    g.append(svg('line', { class: 'rv-takeh', x1: plot.l, x2: plot.r, y1: Y(take), y2: Y(take) }));
    g.append(svg('text', { class: 'rv-takelbl', x: plot.l + 6, y: Y(take) - 6 }, `you take ${rr(take)}`));
  }
  for (const x of rows) {
    const cls = x.v.what === 'stopped' ? 'is-stopped' : x.r > 0 ? 'is-pos' : x.r < 0 ? 'is-neg' : 'is-flat';
    const dot = svg('circle', { class: 'rv-pt ' + cls, cx: X(x.v.heat), cy: Y(x.v.avail), r: 6.5 });
    dot.addEventListener('pointerenter', () => tip.show(X(x.v.heat), Y(x.v.avail), [
      el('div', { class: 'h' }, `${x.t.pair || ''} · ${dayOf(x.t.date)} ${c.shortDate(x.t.date)}`),
      el('div', { class: 'r' }, el('b', {}, rr(-x.v.heat)), el('span', {}, 'drawdown')),
      el('div', { class: 'r' }, el('b', {}, rr(x.v.avail)), el('span', {}, 'available')),
      el('div', { class: 'r' }, el('b', {}, rr(x.r, 2)), el('span', {}, 'taken'))]));
    dot.addEventListener('pointerleave', () => tip.hide());
    g.append(dot);
  }
  wrap.prepend(g);
  return wrap;
}

/* ---------- what happened, how you got in, whether the read was right ---------- */
const WHAT_TONE = { target: 'var(--profit)', stopped: 'var(--yellow)', early: 'var(--blue)', gaveback: '#A78BFA', be: 'var(--grey-4)', tpfar: '#F59E0B', wrong: 'var(--loss)', other: 'var(--grey-6)' };
function mixCard(acct, trades, S) {
  const parts = WHAT.filter(([k]) => S.what[k]).map(([k, label]) => ({ k, label, n: S.what[k] }));
  const total = parts.reduce((a, x) => a + x.n, 0);
  const rev = trades.filter(isReviewed);
  const entryR = k => { const xs = rev.filter(t => reviewOf(acct, t).entry === k).map(t => rOf(acct, t)).filter(v => v != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const eMax = Math.max(0.5, ...ENTRY.map(([k]) => Math.abs(entryR(k) ?? 0)));
  return el('section', { class: 'card rv-mix' },
    el('div', { class: 'rv-k' }, 'What happened'),
    el('div', { class: 'rv-donut' },
      fitted((w, h) => drawDonut(parts, total, w, h), 140),
      el('div', { class: 'rv-legend' }, ...parts.map(x => el('div', { class: 'row' },
        el('i', { style: { background: WHAT_TONE[x.k] } }), el('span', {}, x.label), el('b', {}, String(x.n)))))),
    el('div', { class: 'rv-k', style: { marginTop: '6px' } }, 'Entry · average R'),
    el('div', { class: 'rv-entries' }, ...ENTRY.map(([k, label]) => {
      const v = entryR(k), n = S.entry[k];
      return el('div', { class: 'rv-entry' + (n ? '' : ' is-empty') },
        el('div', { class: 'bar' }, v != null ? el('i', { class: 'bar-fill ' + (v >= 0 ? 'is-pos' : 'is-neg'), style: { width: (Math.abs(v) / eMax * 100) + '%' } }) : null),
        el('div', { class: 't' }, el('span', {}, label), el('b', { class: v > 0 ? 'is-pos' : v < 0 ? 'is-neg' : '' }, n ? rr(v, 2) : '—')),
        el('small', {}, `${n} trade${n === 1 ? '' : 's'}`));
    })),
    el('div', { class: 'rv-read' },
      el('span', {}, 'Right direction'), el('b', {}, S.called ? `${S.right} of ${S.called}` : '—'),
      el('div', { class: 'pips' }, ...rev.filter(t => reviewOf(acct, t).dir).map(t => el('i', { class: reviewOf(acct, t).dir === 'right' ? 'is-r' : 'is-w' })))),
    el('div', { class: 'rv-grades' }, ...GRADE.map(([k]) => el('span', {}, el('b', {}, String(S.grade[k])), k))));
}

function drawDonut(parts, total, W, H) {
  const s = Math.min(W, H), r = s / 2 - 8, cx = W / 2, cy = H / 2, gap = parts.length > 1 ? 0.04 : 0;
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  let a = -Math.PI / 2;
  for (const x of parts) {
    const span = (x.n / total) * Math.PI * 2;
    const a0 = a + gap / 2, a1 = a + span - gap / 2;
    const p = t => [cx + r * Math.cos(t), cy + r * Math.sin(t)];
    const [x0, y0] = p(a0), [x1, y1] = p(Math.max(a0 + 0.001, a1));
    g.append(svg('path', { class: 'rv-donut-seg', style: `stroke:${WHAT_TONE[x.k]}`,
      d: span >= Math.PI * 2 - 1e-6 ? `M${cx},${cy - r}A${r},${r} 0 1 1 ${cx - 0.01},${cy - r}` : `M${x0},${y0}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1},${y1}` }));
    a += span;
  }
  g.append(svg('text', { class: 'rv-donut-n', x: cx, y: cy + 2, 'text-anchor': 'middle' }, String(total)));
  g.append(svg('text', { class: 'rv-donut-l', x: cx, y: cy + 17, 'text-anchor': 'middle' }, 'reviewed'));
  return g;
}

/* ---------- the last eight weeks ---------- */
function trendCard(acct, all) {
  const weeks = [];
  for (let k = 7; k >= 0; k--) {
    const key = P.step(week, -k);
    const { start, end } = P.rangeOf(key);
    const tr = all.filter(t => t.date >= start && t.date <= end);
    weeks.push({ key, S: tr.length ? weekStats(acct, tr) : null });
  }
  const lines = [
    ['R taken', w => w.S?.taken ?? null, v => rr(v)],
    ['Of planned', w => w.S?.capture ?? null, v => c.pct(v, 0)],
    ['Plan followed', w => w.S?.plan ?? null, v => c.pct(v, 0)],
  ];
  return el('section', { class: 'card rv-trend' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Last 8 weeks'), el('span', { class: 'lab-sub' }, 'this week on the right')),
    el('div', { class: 'rv-trends' }, ...lines.map(([label, get, fmt]) => {
      const vals = weeks.map(get);
      const now = vals[vals.length - 1];
      return el('div', { class: 'rv-tr' },
        el('div', { class: 't' }, el('span', {}, label), el('b', {}, now == null ? '—' : fmt(now))),
        fitted((w, h) => drawTrend(weeks, vals, fmt, w, h), 64));
    })));
}

function drawTrend(weeks, vals, fmt, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const tip = tipLayer(wrap);
  const known = vals.filter(v => v != null);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const plot = { l: 6, r: W - 6, t: 8, b: H - 16 };
  const X = i => plot.l + (i / (weeks.length - 1)) * (plot.r - plot.l);
  let lo = Math.min(0, ...known), hi = Math.max(0, ...known);
  if (hi - lo < 1e-9) hi = lo + 1;
  const Y = v => plot.b - ((v - lo) / (hi - lo)) * (plot.b - plot.t);
  if (lo < 0 && hi > 0) g.append(svg('line', { class: 'lab-zero', x1: plot.l, x2: plot.r, y1: Y(0), y2: Y(0) }));
  let d = '', on = false;
  vals.forEach((v, i) => { if (v == null) { on = false; return; } d += (on ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1); on = true; });
  g.append(svg('path', { class: 'rv-trend-line line-draw', pathLength: 1, d }));
  vals.forEach((v, i) => {
    if (v != null) g.append(svg('circle', { class: 'rv-trend-dot' + (i === vals.length - 1 ? ' is-now' : ''), cx: X(i), cy: Y(v), r: i === vals.length - 1 ? 4.5 : 3 }));
    /* Every week's name when there is room, every other one (ending on this week) when there is not. */
    const every = (plot.r - plot.l) / (weeks.length - 1) < 36 ? 2 : 1;
    if ((weeks.length - 1 - i) % every === 0) g.append(svg('text', { class: 'lab-tick', x: X(i), y: H - 3,
      'text-anchor': i === 0 ? 'start' : i === vals.length - 1 ? 'end' : 'middle' }, P.labelOf(weeks[i].key).tick));
    const hit = svg('rect', { class: 'an-hit', x: X(i) - (plot.r - plot.l) / 14, y: 0, width: (plot.r - plot.l) / 7, height: H, fill: 'transparent' });
    hit.addEventListener('pointerenter', () => tip.show(X(i), 10, [el('div', { class: 'h' }, P.labelOf(weeks[i].key).short), el('div', { class: 'r' }, el('b', {}, v == null ? '—' : fmt(v)))]));
    hit.addEventListener('pointerleave', () => tip.hide());
    g.append(hit);
  });
  wrap.prepend(g);
  return wrap;
}

/* Three notes to yourself, and last week's focus to hold it against. */
const shiftDay = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* ============================================================
   Month — the weeks side by side

   The whole month added up first, then the weeks against each other — which
   were good, where the early entries and the unplanned trades bunched up —
   then, scrolling down, each week with what you wrote about it. A week
   that runs over the month's edge counts only its days inside the month.
   ============================================================ */
/** The weeks of a month, each with its trades inside the month. Exported so
    it can be checked on its own. */
export function monthWeeks(acct, monthKey, trades) {
  const { start, end } = P.rangeOf(monthKey);
  const out = [];
  for (let k = P.periodOf(start, 'week'); P.rangeOf(k).start <= end; k = P.step(k, 1)) {
    const r = P.rangeOf(k);
    const inside = trades.filter(t => t.date >= r.start && t.date <= r.end && t.date >= start && t.date <= end);
    const S = weekStats(acct, inside);
    const closed = inside.map(t => rOf(acct, t)).filter(v => v != null);
    out.push({ key: k, trades: inside, S,
      wins: closed.filter(v => v > 0).length, closed: closed.length,
      winRate: closed.length ? closed.filter(v => v > 0).length / closed.length : null,
      early: S.entry.early, late: S.entry.late });
  }
  return out;
}

function monthTab(store, acct, trades, nav) {
  const S = weekStats(acct, trades);
  const W = monthWeeks(acct, month, trades);
  const traded = W.filter(w => w.trades.length);
  const best = traded.length > 1 ? traded.reduce((a, b) => (b.S.taken > a.S.taken ? b : a)) : null;
  const worst = traded.length > 1 ? traded.reduce((a, b) => (b.S.taken < a.S.taken ? b : a)) : null;
  const closed = trades.map(t => rOf(acct, t)).filter(v => v != null);
  const wins = closed.filter(v => v > 0).length;
  const stat = (k, v, s, cls = '') => el('div', { class: 'rv-stat' + cls },
    el('span', { class: 'k' }, k), el('span', { class: 'v' }, v), el('span', { class: 's' }, s || ' '));
  const stats = el('div', { class: 'rv-stats rv-mstats' },
    stat('Taken', rr(S.taken), `${S.trades} trade${S.trades === 1 ? '' : 's'} this month`, S.taken > 0 ? ' is-pos' : S.taken < 0 ? ' is-neg' : ''),
    stat('Win rate', closed.length ? c.pct(wins / closed.length, 0) : '—', closed.length ? `${wins} of ${closed.length}` : 'nothing closed'),
    stat('Plan followed', S.plan == null ? '—' : c.pct(S.plan, 0), S.planned ? `${S.planYes} of ${S.planned} trades` : 'not answered yet'),
    stat('Early entries', String(S.entry.early), S.reviewed ? `of ${S.reviewed} reviewed` : 'none reviewed yet', S.entry.early ? ' is-warn' : ''),
    stat('Left on the table', rr(S.leftEarly), S.leftEarlyN ? `closed early on ${S.leftEarlyN}, target then hit` : 'nothing closed early that went on'),
    stat('Stopped, but right', String(S.stopped), S.stopped ? `would have made ${rr(S.stoppedWould)}` : 'none this month'),
    nearStopStat(S, stat),
    ranBackStat(S, stat),
    stat('Reviewed', `${S.reviewed} / ${S.trades}`, S.reviewed === S.trades ? 'every trade' : `${S.trades - S.reviewed} to go`));

  /* ---------- the weeks against each other ---------- */
  const maxR = Math.max(0.5, ...W.map(w => Math.abs(w.S.taken)));
  const bar = v => el('span', { class: 'rv-mbar' },
    el('i', { class: v >= 0 ? 'is-pos' : 'is-neg', style: { width: (Math.abs(v) / maxR * 50) + '%', [v >= 0 ? 'left' : 'right']: '50%' } }));
  const grades = S => ['A', 'B', 'C'].map(g => S.grade[g] ? `${S.grade[g]}${g}` : null).filter(Boolean).join(' ') || '—';
  const openWeek = key => { week = key; picked = null; nav.go('#/review/week'); };
  const table = el('section', { class: 'card rv-mweeks' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Week by week'),
      el('span', { class: 'lab-sub' }, best ? `best ${P.labelOf(best.key).tick} ${rr(best.S.taken)} · hardest ${P.labelOf(worst.key).tick} ${rr(worst.S.taken)}` : 'which weeks went well, and where the habits bunched up')),
    el('div', { class: 'rv-mrow is-head' },
      ...['Week', 'R taken', 'Trades', 'Win rate', 'Plan', 'Early', 'Grades', 'Reviewed'].map(h => el('span', {}, h))),
    ...W.map(w => {
      const L = P.labelOf(w.key), notes = store.reviewWeeks[w.key] || {};
      const tag = w === best ? el('em', { class: 'is-best' }, 'best') : w === worst ? el('em', { class: 'is-worst' }, 'hardest') : null;
      return el('button', { class: 'rv-mrow' + (w.trades.length ? '' : ' is-empty'), 'data-week': w.key, onClick: () => openWeek(w.key),
        title: `Open ${L.title}` },
        el('span', { class: 'wk' }, el('b', {}, L.tick), el('small', {}, L.short), tag),
        el('span', { class: 'r ' + (w.S.taken > 0 ? 'is-pos' : w.S.taken < 0 ? 'is-neg' : '') }, bar(w.S.taken), el('b', {}, w.trades.length ? rr(w.S.taken) : '—')),
        el('span', {}, String(w.trades.length || '—')),
        el('span', {}, w.winRate == null ? '—' : c.pct(w.winRate, 0)),
        el('span', {}, w.S.plan == null ? '—' : c.pct(w.S.plan, 0)),
        el('span', { class: w.early ? 'is-warn' : '' }, w.trades.length ? String(w.early) : '—'),
        el('span', {}, grades(w.S)),
        el('span', { class: notes.done ? 'is-done' : '' }, w.trades.length ? `${w.S.reviewed}/${w.S.trades}${notes.done ? ' ✓' : ''}` : '—'));
    }));

  /* ---------- each week, with what you wrote ---------- */
  const weekCards = W.filter(w => w.trades.length || store.reviewWeeks[w.key]).map(w => {
    const L = P.labelOf(w.key), n = store.reviewWeeks[w.key] || {};
    const note = (k, label) => el('div', { class: 'rv-mnote' }, el('span', { class: 'rv-k' }, label),
      n[k] ? el('p', {}, n[k]) : el('p', { class: 'is-none' }, 'nothing written'));
    return el('section', { class: 'card rv-mweek', 'data-week': w.key },
      el('div', { class: 'rv-mweek-h' },
        el('h2', {}, L.title), el('span', { class: 'lab-sub' }, L.span),
        n.done ? el('span', { class: 'rv-mdone' }, icon('check', 11, 'currentColor', 2.4), 'done') : null,
        el('div', { class: 'spacer' }),
        el('span', { class: 'rv-mline' },
          el('b', { class: w.S.taken > 0 ? 'is-pos' : w.S.taken < 0 ? 'is-neg' : '' }, rr(w.S.taken)),
          ` · ${w.trades.length} trade${w.trades.length === 1 ? '' : 's'}`,
          w.winRate != null ? ` · ${c.pct(w.winRate, 0)} won` : '',
          w.S.plan != null ? ` · plan ${c.pct(w.S.plan, 0)}` : '',
          w.early ? ` · ${w.early} early` : ''),
        el('button', { class: 'btn btn-quiet rv-mopen', onClick: () => openWeek(w.key) }, 'Open week')),
      el('div', { class: 'rv-mnotes' },
        note('worked', 'What worked'), note('fix', 'What to fix'), note('focus', 'Focus for the next week')));
  });

  return el('div', { class: 'rv-body rv-month' },
    el('div', { class: 'rv-hero' }, captureCard(S), stats),
    table,
    habitsCard(acct, trades),
    S.reviewed ? (trades.filter(t => isReviewed(t) && reviewOf(acct, t).heat != null && reviewOf(acct, t).avail != null).length >= 2
      ? el('div', { class: 'rv-wpair' }, scatterCard(acct, trades, S), mixCard(acct, trades, S))
      : mixCard(acct, trades, S)) : null,
    el('div', { class: 'rv-msec' }, el('span', { class: 'rv-k' }, 'The weeks'), el('span', { class: 'lab-sub' }, 'what you wrote at the end of each')),
    ...weekCards);
}

function notesCard(store, nav) {
  const notes = store.reviewWeeks[week] || {};
  const last = store.reviewWeeks[P.step(week, -1)]?.focus;
  const box = (key, label, ph) => {
    const ta = el('textarea', { class: 'rv-txt', rows: 3, placeholder: ph, 'aria-label': label }, notes[key] || '');
    let timer = null;
    const save = () => store.setWeekNote(week, { [key]: ta.value.trim() || null });
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(save, 500); });
    ta.addEventListener('change', () => { clearTimeout(timer); save(); });
    return el('label', { class: 'rv-note' }, el('span', { class: 'rv-k' }, label), ta);
  };
  /* Landscape: the three notes side by side under one heading, so the page
     keeps its full width and the writing still has room to grow. */
  return el('section', { class: 'card rv-notes' },
    el('div', { class: 'rv-notes-head' },
      el('h2', {}, 'Notes for the week'),
      last ? el('div', { class: 'rv-last' }, el('span', { class: 'rv-k' }, 'Last week’s focus'), el('p', {}, last)) : null,
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn ' + (notes.done ? 'btn-quiet' : 'btn-primary') + ' rv-done',
        onClick: async () => { await store.setWeekNote(week, { done: !notes.done }); toast(notes.done ? 'Week reopened' : 'Week marked done'); nav.refresh(); } },
        notes.done ? [icon('check', 12, 'currentColor', 2.4), 'Week done'] : 'Mark week done')),
    el('div', { class: 'rv-notes-row' },
      box('worked', 'What worked', 'What you want more of'),
      box('fix', 'What to fix', 'What cost you this week'),
      box('focus', 'One focus for next week', 'One thing — it shows here next week')));
}
