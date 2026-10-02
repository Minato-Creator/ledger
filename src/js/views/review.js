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
import * as c from '../calc.js';
import * as P from '../periods.js';
import { tradeShotsOf, reviewShotsOf } from '../store.js';
import { prepare, imageOnClipboard, imageOnDrop } from '../shots.js';
import { tipLayer } from './chartkit.js';
import { CONFIDENCE, EMOTION_AFTER, EXIT_REASONS, MISTAKES, DELIVERY, NEWS, holidayName, heldOf, heldText } from '../questions.js';
import { heldEditor } from './held.js';
import { fromPricesOf } from './addtrade.js';

let week = null;           // '2026-W38'
let picked = null;         // the trade being reviewed

export const WHAT = [
  ['target', 'Hit target'],
  ['stopped', 'Stopped, then went my way'],
  ['early', 'Closed too early'],
  ['gaveback', 'Gave back profit'],
  ['be', 'BE, then it ran'],
  ['wrong', 'Wrong read'],
  ['other', 'Something else'],
];
const ENTRY = [['early', 'Early'], ['ontime', 'On time'], ['late', 'Late']];
const PLAN = [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']];
const GRADE = [['A', 'A'], ['B', 'B'], ['C', 'C']];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const isReviewed = t => !!t?.review?.what;

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
  if (kind === 'sl') return v.dir === 'right' ? 'stopped' : v.dir === 'wrong' ? 'wrong' : null;
  if (kind === 'be') return v.dir === 'wrong' ? 'wrong' : 'be';
  if (kind === 'manual') return m.includes('closed_early') || (t.heldOutcome === 'win') ? 'early' : null;
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
  out.capture = out.available > 0 ? out.capturedTaken / out.available : null;
  return out;
}

export function review(store, nav, sub) {
  const acct = store.activeAccount;
  const all = c.chronological(store.tradesFor(acct.id));
  const tab = sub === 'week' ? 'week' : 'trades';

  if (week == null) {
    const now = P.periodOf(c.todayISO(), 'week');
    week = all.some(t => P.periodOf(t.date, 'week') === now) || !all.length
      ? now : P.periodOf(all[all.length - 1].date, 'week');
  }
  const { start, end } = P.rangeOf(week);
  const trades = all.filter(t => t.date >= start && t.date <= end);
  if (!trades.some(t => t.id === picked)) picked = (trades.find(t => !isReviewed(t)) || trades[0])?.id || null;
  const L = P.labelOf(week);
  /* How far through the week you are. Repainted as each trade is answered. */
  const prog = el('div', { class: 'rv-progress', title: 'Trades reviewed this week' });
  const paintProg = () => {
    const done = trades.filter(isReviewed).length;
    prog.replaceChildren(el('div', { class: 'bar' }, el('i', { style: { width: (done / (trades.length || 1) * 100) + '%' } })),
      `${done} of ${trades.length} reviewed`);
  };
  paintProg();

  const go = delta => { week = P.step(week, delta); picked = null; nav.refresh(); };
  const head = el('header', { class: 'head' },
    el('h1', {}, 'Weekly review'),
    el('div', { class: 'seg', role: 'tablist' },
      ...[['trades', 'Trades', '#/review'], ['week', 'Week', '#/review/week']].map(([k, label, href]) =>
        el('button', { class: k === tab ? 'is-on' : '', role: 'tab', onClick: () => { if (k !== tab) nav.go(href); } }, label))),
    el('div', { class: 'stepper rv-week' },
      el('button', { onClick: () => go(-1), 'aria-label': 'Previous week' }, icon('chevleft', 12, 'var(--grey-2)', 2.4)),
      el('span', { class: 'val' }, `${L.short} · ${L.tick}`),
      el('button', { onClick: () => go(1), 'aria-label': 'Next week' }, icon('chevright', 12, 'var(--grey-2)', 2.4))),
    trades.length ? prog : null,
    el('div', { class: 'spacer' }));

  if (!trades.length) {
    return el('div', { class: 'view' }, head,
      el('div', { class: 'card', style: { flex: '1' } },
        el('div', { class: 'empty' },
          icon('review', 34, 'var(--grey-6)', 1.4),
          el('h2', { style: { fontSize: '16px' } }, 'No trades this week'),
          el('p', {}, 'Step back a week, or come back once the week is traded.'))));
  }

  const body = tab === 'week' ? weekTab(store, acct, trades, nav, all) : tradesTab(store, acct, trades, nav, paintProg);
  return el('div', { class: 'view rv-view' }, head, body);
}

/* ============================================================
   Trades — one at a time
   ============================================================ */
function tradesTab(store, acct, trades, nav, paintProg) {
  const rail = el('section', { class: 'card rv-rail' });
  const main = el('div', { class: 'rv-main' });
  const pb = store.playbook;
  const trade = () => trades.find(t => t.id === picked);

  function paintRail() {
    rail.replaceChildren(
      el('div', { class: 'rv-k' }, 'This week'),
      el('div', { class: 'rv-list' }, ...trades.map(t => {
        const r = rOf(acct, t);
        return el('button', { class: 'rv-item' + (t.id === picked ? ' is-on' : ''), onClick: () => { picked = t.id; paintRail(); paintMain(); } },
          el('span', { class: 'dot ' + (r > 0 ? 'is-pos' : r < 0 ? 'is-neg' : '') }),
          el('span', { class: 'p' }, t.pair || '—', el('small', {}, `${dayOf(t.date)} ${Number(t.date.slice(8))} · ${t.timeOpen || '—'}`)),
          el('span', { class: 'res ' + (r > 0 ? 'is-pos' : r < 0 ? 'is-neg' : '') }, rr(r, 2)),
          el('span', { class: 'ok' + (isReviewed(t) ? ' is-done' : '') }, isReviewed(t) ? icon('check', 11, 'currentColor', 2.6) : null));
      })));
  }

  function paintMain() {
    const t = trade();
    if (!t) { main.replaceChildren(); return; }
    const keep = main.scrollTop;
    main.replaceChildren(reviewCard(store, acct, t, pb, {
      changed: () => { paintRail(); paintProg(); },
      repaint: () => paintMain(),
      next: () => {
        const i = trades.indexOf(t);
        const after = [...trades.slice(i + 1), ...trades.slice(0, i)].find(x => !isReviewed(x));
        const to = after || trades[(i + 1) % trades.length];
        if (!after) toast('Every trade this week is reviewed — the Week tab has what it adds up to');
        picked = to.id; paintRail(); paintMain(); main.scrollTop = 0;
      },
      prev: () => { const i = trades.indexOf(t); picked = trades[(i - 1 + trades.length) % trades.length].id; paintRail(); paintMain(); },
    }));
    main.scrollTop = keep;
  }

  /* A screenshot of what price did after goes onto the trade being reviewed,
     wherever focus is — the same as on New trade. */
  const wrap = el('div', { class: 'rv-trades' }, rail, main);
  const onPaste = async e => {
    if (!wrap.isConnected) { document.removeEventListener('paste', onPaste); return; }
    const file = imageOnClipboard(e);
    if (!file || !trade()) return;
    e.preventDefault();
    await addAfter(store, trade(), file);
    paintMain();
  };
  document.addEventListener('paste', onPaste);
  paintRail(); paintMain();
  return wrap;
}

async function addAfter(store, t, file) {
  try {
    const out = await prepare(file);
    await store.putReviewShot(t.id, out.blob);
    toast('Added what price did after');
  } catch (e) { toast(e.message, 'bad'); }
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
  const entry = tradeShotsOf(t), after = reviewShotsOf(t);
  const items = [...entry.map(n => ({ label: 'Entry', name: n })), ...after.map(n => ({ label: 'After', name: n }))];
  const shot = (name, label, i) => {
    const tile = el('button', { class: 'rv-shot is-loading', title: 'View full size',
      onClick: () => lightbox({ items, urlFor: n => store.shotUrl(n), at: i }) },
      el('span', { class: 'tag' }, label),
      label === 'After' ? el('span', { class: 'x', title: 'Remove', role: 'button',
        onClick: async e => { e.stopPropagation(); await store.dropReviewShot(t, name); on.repaint(); } }, icon('close', 10, '#fff', 2.4)) : null);
    store.shotUrl(name).then(url => { tile.classList.remove('is-loading'); if (url) tile.style.backgroundImage = `url("${url}")`; });
    return tile;
  };
  const picker = el('input', { type: 'file', accept: 'image/*', hidden: true,
    onChange: async e => { const f = e.target.files[0]; e.target.value = ''; if (f) { await addAfter(store, t, f); on.repaint(); } } });
  /* Two rows: the charts you logged the trade with, and what price did
     after — kept apart so the before and the after read as such. */
  const shots = el('div', { class: 'rv-shotgroups' },
    el('div', { class: 'rv-shotgroup' },
      el('span', { class: 'rv-sk' }, 'When you took it', el('small', {}, entry.length ? String(entry.length) : '')),
      el('div', { class: 'rv-shots' }, ...(entry.length ? entry.map((n, i) => shot(n, 'Entry', i))
        : [el('div', { class: 'rv-shot is-none' }, el('small', {}, 'no charts logged with the trade'))]))),
    el('div', { class: 'rv-shotgroup is-after' },
      el('span', { class: 'rv-sk' }, 'After', el('small', {}, after.length ? String(after.length) : '')),
      el('div', { class: 'rv-shots' },
        ...after.map((n, i) => shot(n, 'After', entry.length + i)),
        el('button', { class: 'rv-shot is-add', onClick: () => picker.click(),
          onDragOver: e => e.preventDefault(),
          onDrop: async e => { e.preventDefault(); const f = imageOnDrop(e); if (f) { await addAfter(store, t, f); on.repaint(); } } },
          icon('image', 18, 'var(--ink-4)', 1.6), el('span', {}, 'Paste or drop'), el('small', {}, 'what price did after')),
        picker)));

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
  const sug = suggestWhat(acct, t);
  const lessonBox = el('textarea', { class: 'rv-lesson', rows: 2, placeholder: 'One line you want to remember', 'aria-label': 'Lesson' }, v.lesson || '');
  let timer = null;
  lessonBox.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => store.setTradeReview(t.id, { lesson: lessonBox.value.trim() || null }), 500); });
  lessonBox.addEventListener('change', () => { clearTimeout(timer); store.setTradeReview(t.id, { lesson: lessonBox.value.trim() || null }); });

  return el('section', { class: 'card rv-card' },
    el('div', { class: 'rv-top' },
      el('span', { class: 'dot ' + (r > 0 ? 'is-pos' : r < 0 ? 'is-neg' : '') }),
      el('div', { class: 'p' }, el('b', {}, t.pair || '—'),
        el('span', {}, [`${dayOf(t.date)} ${c.shortDate(t.date)}`, t.timeOpen, setup, t.side === 'sell' ? 'short' : 'long', session].filter(Boolean).join(' · '))),
      el('span', { class: 'res ' + (r > 0 ? 'is-pos' : r < 0 ? 'is-neg' : '') }, rr(r, 2))),
    shots,
    fromTheTrade(t, on),
    ruler,
    el('div', { class: 'rv-form' },
      el('div', { class: 'rv-col' },
        el('div', { class: 'rv-f' }, el('span', { class: 'k' }, 'Direction'),
          seg('dir', [['right', 'Right'], ['wrong', 'Wrong']], { right: 'is-good', wrong: 'is-bad' }, k => (k === 'wrong' ? { heat: null } : {})),
          autoNote('dir', 'hit TP'), kind === 'sl' && !v.dir ? el('span', { class: 'hint rv-ask' }, 'answer this first') : null),
        ...questionsFor(kind, v, num)),
      el('div', { class: 'rv-col' },
        el('div', { class: 'rv-f' }, el('span', { class: 'k' }, 'Entry'), seg('entry', ENTRY), autoNote('entry', 'from your mistakes')),
        el('div', { class: 'rv-f' }, el('span', { class: 'k' }, 'Plan followed'), seg('plan', PLAN, { yes: 'is-good' })),
        el('div', { class: 'rv-f' }, el('span', { class: 'k' }, 'Grade'), seg('grade', GRADE)))),
    kind === 'manual' ? heldBox(store, t) : null,
    el('div', { class: 'rv-f is-top' }, el('span', { class: 'k' }, 'What happened'),
      el('div', { class: 'rv-chips' }, ...WHAT.map(([k, label]) => el('button', {
        class: (v.what === k ? 'is-on' : '') + (!v.what && sug === k ? ' is-sug' : ''),
        title: !v.what && sug === k ? 'Suggested from how the trade closed — click to confirm' : null,
        onClick: () => set({ what: v.what === k ? null : k }) }, label)))),
    el('div', { class: 'rv-f is-top' }, el('span', { class: 'k' }, 'Lesson'), lessonBox),
    el('div', { class: 'rv-actions' },
      el('span', { class: 'rv-saved' }, isReviewed(t) ? 'Reviewed · saved as you go' : 'Pick what happened to mark it reviewed'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-quiet', onClick: on.prev }, icon('chevleft', 12, 'currentColor', 2.2), 'Previous'),
      el('button', { class: 'btn btn-primary', onClick: on.next }, 'Next to review', icon('chevright', 12, '#fff', 2.2))));
}

/* The numbers a trade is asked for, by how it ended.
   • Take profit: how far it ran (at least what you took), how close it came
     to your stop, and whether a better exit was there.
   • Stop loss: nothing until you say whether the idea was right. Right —
     how far it went against you (from 1R, your stop) and how far it ran
     after. Wrong — nothing more to measure.
   • Break-even: how far it ran after, and how far against you.
   • Closed by hand, or not logged: how far it ran and how far against you.
   Heat is never asked of a trade read the wrong way. */
function questionsFor(kind, v, num) {
  const wrong = v.dir === 'wrong';
  const heat = hint => wrong ? null : num('heat', 'Heat', hint, { neg: true });
  if (kind === 'tp') return [
    num('avail', 'Available', v.auto.has('avail') ? 'at least what you took — more if it kept going' : 'how far it ran your way'),
    heat('how close it came to your stop'),
    num('better', 'Better exit', 'what a better exit would have made')].filter(Boolean);
  if (kind === 'sl') return v.dir === 'right' ? [
    num('heat', 'Heat', 'how far it went against you — 1R is your stop', { neg: true }),
    num('avail', 'Ran after', 'how far it went your way once it turned')] : [];
  if (kind === 'be') return [num('avail', 'Ran after BE', 'how far it went after break-even'), heat('how far it went against you')].filter(Boolean);
  return [num('avail', 'Available', 'how far it ran your way'), heat('how far it went against you')].filter(Boolean);
}

/* What you said about the trade when you logged it, read back so the review
   starts from it: confidence, feeling after, how it ended, the timeframe,
   price delivery and any mistakes. Changing them is the trade's own page. */
function fromTheTrade(t, on) {
  const name = (list, k) => (list.find(([v]) => v === k) || [])[1];
  const m = Array.isArray(t.mistakes) ? t.mistakes : null;
  const bits = [
    t.confidence != null ? ['In', `${t.confidence} · ${name(CONFIDENCE, t.confidence)}`, t.confidence <= 2 ? 'is-bad' : t.confidence >= 4 ? 'is-good' : ''] : null,
    t.emotionAfter != null ? ['After', `${t.emotionAfter} · ${name(EMOTION_AFTER, t.emotionAfter)}`, t.emotionAfter <= 2 ? 'is-bad' : t.emotionAfter >= 4 ? 'is-good' : ''] : null,
    t.exitReason ? ['Exit', name(EXIT_REASONS, t.exitReason), t.exitReason === 'tp' ? 'is-good' : t.exitReason === 'sl' ? 'is-bad' : ''] : null,
    t.execTf ? ['TF', t.execTf, ''] : null,
    t.delivery ? ['Price', name(DELIVERY, t.delivery), t.delivery === 'good' ? 'is-good' : t.delivery === 'poor' ? 'is-bad' : ''] : null,
    t.news ? ['News', name(NEWS, t.news), t.news === 'none' ? '' : 'is-news'] : null,
    Array.isArray(t.holidays) && t.holidays.length ? ['Holiday', t.holidays.map(holidayName).join(', '), 'is-hol'] : null,
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
        await store.updateTrade(t.id, { heldOutcome: whole ? val.outcome : null, heldR: whole ? val.r : null });
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
      el('span', {}, el('i', { class: 'heat' }), `heat ${v.heat != null ? rr(-v.heat) : '—'}`),
      el('span', {}, el('i', { class: 'avail' }), `available ${rr(v.avail)}`),
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
    stat('Left on the table', rr(S.left), 'available, not taken'),
    stat('Stopped, but right', String(S.stopped), S.stopped ? `would have made ${rr(S.stoppedWould)}` : 'none this week'),
    stat('Plan followed', S.plan == null ? '—' : c.pct(S.plan, 0), S.planned ? `${S.planYes} of ${S.planned} trades` : 'not answered yet'));

  const main = el('div', { class: 'rv-wleft' },
    el('div', { class: 'rv-hero' }, captureCard(S), stats),
    tradesCard(acct, trades),
    habitsCard(acct, trades),
    el('div', { class: 'rv-wpair' }, scatterCard(acct, trades, S), mixCard(acct, trades, S)),
    trendCard(acct, all));
  return el('div', { class: 'rv-body' }, main, notesCard(store, nav));
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
function captureCard(S) {
  const p = S.capture == null ? 0 : Math.max(0, Math.min(1, S.capture));
  const say = S.capture == null ? 'Add how far trades ran to see this'
    : S.capture < 0.45 ? 'Trades ran well past your exits — targets may be close'
    : S.capture > 0.75 ? 'You are taking most of the move' : 'You took a fair share of what was there';
  return el('section', { class: 'card rv-capture' },
    el('div', { class: 'rv-k' }, 'Of the move'),
    el('div', { class: 'rv-gauge' }, fitted((w, h) => drawGauge(p, w, h), 150),
      el('div', { class: 'rv-gauge-c' },
        el('b', {}, S.capture == null ? '—' : c.pct(S.capture, 0)), el('span', {}, 'captured'))),
    el('div', { class: 'rv-cap-row' },
      el('span', {}, el('i', { class: 'took' }), el('b', {}, rr(S.capturedTaken)), 'taken'),
      el('span', {}, el('i', { class: 'left' }), el('b', {}, rr(S.available - S.capturedTaken)), 'left'),
      el('span', {}, el('b', {}, rr(S.available)), 'available')),
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
      el('div', { class: 'r' }, el('b', {}, x.v.heat != null ? rr(-x.v.heat) : '—'), el('span', {}, 'heat')),
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
    : S.heatOnWinners < 0.5 ? `Winners took only ${rr(-S.heatOnWinners)} of heat — your stop has room`
    : S.heatOnWinners > 0.8 ? `Winners took ${rr(-S.heatOnWinners)} of heat — your stop may be tight`
    : `Winners used about half your stop`;
  const card = el('section', { class: 'card lab-chart rv-scatter' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Stop & target'), el('span', { class: 'lab-sub' }, 'heat across, room to run up')));
  if (pts.length < 2) { card.append(el('p', { class: 'lab-empty' }, 'Fill in heat and available on a few trades to see this.')); return card; }
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
      el('div', { class: 'r' }, el('b', {}, rr(-x.v.heat)), el('span', {}, 'heat')),
      el('div', { class: 'r' }, el('b', {}, rr(x.v.avail)), el('span', {}, 'available')),
      el('div', { class: 'r' }, el('b', {}, rr(x.r, 2)), el('span', {}, 'taken'))]));
    dot.addEventListener('pointerleave', () => tip.hide());
    g.append(dot);
  }
  wrap.prepend(g);
  return wrap;
}

/* ---------- what happened, how you got in, whether the read was right ---------- */
const WHAT_TONE = { target: 'var(--profit)', stopped: 'var(--yellow)', early: 'var(--blue)', gaveback: '#A78BFA', be: 'var(--grey-4)', wrong: 'var(--loss)', other: 'var(--grey-6)' };
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
    ['Captured', w => w.S?.capture ?? null, v => c.pct(v, 0)],
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
