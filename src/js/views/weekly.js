/* ============================================================
   Weekly winrate — one week, or one month, at a time.

   The question it answers is "how did that week go", and it answers it for
   live trading and forward testing side by side rather than added together:
   a test is a real decision and a fake dollar, and the whole point of looking
   at them next to each other is to see whether what you rehearse is what you
   do. So this page reads both whatever the Live / Forward test / All switch
   says, and never mixes them.

   • You step through time. The arrows in the header, the arrow keys, or a
     click on any column in the strip. Switching between weeks and months
     keeps your place: Week 38 becomes September, and September goes back to
     Week 38.

   • Every figure comes from the same arithmetic as the rest of the app —
     `summarise` for the win rate and R, so a break-even is never a loss here
     and never a win anywhere else.

   • Risk is live only, and counts open trades. Risk is taken when you get in;
     a position still running on Friday has already used some of the week's.

   • Nothing is inferred. A trade with no R leaves the R totals blank rather
     than quietly understated, and a week with no trades is drawn as nothing.
   ============================================================ */
import { el, icon, ft } from '../ui.js';
import { pairMark } from '../flags.js';
import * as c from '../calc.js';
import * as P from '../periods.js';

let mode = 'week';          // week | month
let cursor = null;          // '2026-W38' | '2026-09'
let cameFrom = null;        // the week you were on before switching to months
let refocus = false;        // put the keyboard back on the strip after a step
let keys = null;            // what the arrow keys move, set on each paint
const WINDOW = 12;          // columns in the strip
const PLOT = 96;            // px — the strip's bar area

const isFwd = t => t.mode === 'forward';
const isOpen = t => t.status === 'open';
const word = () => (mode === 'week' ? 'week' : 'month');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ---------- where we are ---------- */

/* The first period anything was traded in, the latest one there can be, and
   which one is "now". A cursor left over from another account, or from the
   other mode, is pulled back inside. On first opening it lands on the current
   period if anything has been traded in it, otherwise the latest one that
   has — a review page should not open on a blank Monday morning. */
function resolve(all) {
  const dates = all.map(t => t.date).filter(Boolean).sort();
  const now = P.periodOf(c.todayISO(), mode);
  const first = P.periodOf(dates[0], mode);
  const latest = P.periodOf(dates[dates.length - 1], mode);
  const min = first < now ? first : now;
  const max = latest > now ? latest : now;
  if (!cursor || P.modeOf(cursor) !== mode) {
    cursor = all.some(t => P.periodOf(t.date, mode) === now) ? now : latest;
  }
  if (cursor < min) cursor = min;
  if (cursor > max) cursor = max;
  return { min, max, now };
}

/* Switching keeps your place. A week goes to the month it belongs to; a month
   goes back to the week you left it from, if you are still in that month,
   or else to the last week of it you traded. */
function switchMode(to, all) {
  if (to === mode) return;
  const anchor = cursor ? P.anchorOf(cursor, all) : null;
  if (to === 'month') cameFrom = cursor;
  const back = to === 'week' && cameFrom && cursor
    && P.periodOf(P.anchorOf(cameFrom, all), 'month') === cursor ? cameFrom : null;
  mode = to;
  cursor = back || (anchor ? P.periodOf(anchor, mode) : null);
}

/* The arrow keys step through periods anywhere on this page — unless you are
   typing, or a picture is open, or the page is not showing. One listener for
   the life of the app; it finds out on each press whether it has anything to
   do, so it never has to be taken down. */
let bound = false;
function bindKeys() {
  if (bound) return;
  bound = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (!keys || !document.querySelector('.wk-view')) return;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (document.querySelector('.lightbox')) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    refocus = !!(t && t.closest && t.closest('.wk-slot'));
    keys.go(e.key === 'ArrowLeft' ? -1 : 1);
  });
}

/* ---------- the header ---------- */

/** Week | Month, the period with a step either side, and a way home. */
export function weeklyControls(store, nav) {
  const all = store.everyTradeFor(store.activeAccount.id);
  if (!all.length) return null;
  const b = resolve(all);
  const L = P.labelOf(cursor);
  const go = (delta) => {
    const n = P.step(cursor, delta);
    if (n < b.min || n > b.max) return;
    cursor = n; nav.refresh();
  };
  keys = { go };
  bindKeys();

  const prevName = mode === 'week' ? 'Previous week' : 'Previous month';
  const nextName = mode === 'week' ? 'Next week' : 'Next month';
  return el('div', { class: 'wk-controls' },
    el('div', { class: 'seg' },
      ...[['week', 'Week'], ['month', 'Month']].map(([k, label]) =>
        el('button', { class: k === mode ? 'is-on' : '',
          onClick: () => { if (k === mode) return; switchMode(k, all); nav.refresh(); } }, label))),
    el('div', { class: 'stepper wk-step' },
      el('button', { title: prevName, 'aria-label': prevName, disabled: cursor <= b.min, onClick: () => go(-1) },
        icon('chevleft', 12, 'var(--grey-2)', 2.4)),
      /* Just the dates: the strip underneath already names the week, and the
         header has to fit beside five tabs on a laptop screen. */
      el('span', { class: 'val', title: mode === 'week' ? `${L.title} · ${L.span}` : L.title }, L.short),
      el('button', { title: nextName, 'aria-label': nextName, disabled: cursor >= b.max, onClick: () => go(1) },
        icon('chevright', 12, 'var(--grey-2)', 2.4))),
    cursor !== b.now
      ? el('button', { class: 'btn btn-quiet wk-now', onClick: () => { cursor = b.now; nav.refresh(); } },
          mode === 'week' ? 'This week' : 'This month')
      : null);
}

/* ---------- the page ---------- */

export function weeklyTab(store, nav) {
  const acct = store.activeAccount;
  const all = store.everyTradeFor(acct.id);
  if (!all.length) {
    return el('div', { class: 'view' },
      el('div', { class: 'card', style: { flex: '1' } },
        el('div', { class: 'empty' },
          icon('analytics', 34, 'var(--grey-6)', 1.4),
          el('h2', { style: { fontSize: '16px' } }, 'Nothing logged yet'),
          el('p', {}, 'Every week fills in as you trade it — live and forward tests side by side.'))));
  }
  const b = resolve(all);
  const closed = all.filter(t => !isOpen(t));

  const here = P.inPeriod(cursor, all);
  const liveAll = here.filter(t => !isFwd(t));
  const live = liveAll.filter(t => !isOpen(t));
  const fwd = here.filter(t => isFwd(t) && !isOpen(t));
  const before = P.inPeriod(P.step(cursor, -1), closed);

  const ls = P.periodStats(acct, live);
  const fs = P.periodStats(acct, fwd);
  const lp = P.periodStats(acct, before.filter(t => !isFwd(t)));
  const fp = P.periodStats(acct, before.filter(isFwd));

  const view = el('div', { class: 'view wk-view' },
    strip(acct, closed, b, nav),
    el('div', { class: 'wk-scroll' },
      el('div', { class: 'wk-pair' },
        seriesCard('live', acct, ls, lp, { risk: P.riskTaken(acct, liveAll), openCount: liveAll.length - live.length }),
        seriesCard('forward', acct, fs, fp, { openCount: here.filter(t => isFwd(t) && isOpen(t)).length })),
      breakdown(acct, here.filter(t => !isOpen(t)), nav),
      here.length ? tradeList(store, acct, here, nav) : null));

  if (refocus) {
    refocus = false;
    requestAnimationFrame(() => view.querySelector('.wk-slot.is-on')?.focus());
  }
  return view;
}

/* ---------- the strip ----------
   Win rate, period by period: live and forward test as a pair of thin
   columns, a hairline at 50%, and the period you are reading picked out
   behind its pair. It is a way to move as much as a chart — every column
   is a button, and hovering or focusing one lists its numbers.

   The window follows you: it runs up to four periods past the one you are
   on, so there is always a little of what came next in view. Periods before
   your first trade are drawn empty and cannot be picked. */
function strip(acct, closed, b, nav) {
  let end = P.step(cursor, 4);
  if (end > b.max) end = b.max;
  const keysIn = [];
  for (let i = WINDOW - 1; i >= 0; i--) keysIn.push(P.step(end, -i));

  const tip = el('div', { class: 'wk-tip', role: 'status', hidden: true });
  const plot = el('div', { class: 'wk-plot', style: { '--plot': PLOT + 'px' } },
    el('span', { class: 'wk-guide', 'aria-hidden': 'true' }),
    el('span', { class: 'wk-guide-lbl', 'aria-hidden': 'true' }, '50%'),
    el('span', { class: 'wk-base', 'aria-hidden': 'true' }));

  const show = (slot, k, ls, fs) => {
    const L = P.labelOf(k);
    const line = (kind, st) => el('div', { class: 'wk-tip-row' },
      el('span', { class: 'wk-line is-' + kind }),
      el('span', { class: 'v' }, st.winRate == null ? '—' : c.pct(st.winRate, 0)),
      el('span', { class: 'n' }, kind === 'live' ? 'Live' : 'Forward test'),
      el('span', { class: 'd' }, st.count
        ? `${st.wins}W ${st.losses}L${st.breakevens ? ` ${st.breakevens}BE` : ''}${st.netR == null ? '' : ' · ' + c.rFmt(st.netR)}`
        : 'no trades'));
    tip.replaceChildren(
      el('div', { class: 'wk-tip-head' }, mode === 'week' ? `${L.title} · ${L.span}` : L.title),
      line('live', ls), line('forward', fs));
    tip.hidden = false;
    /* Beside the column rather than over it, so the pair you are pointing at
       stays in view; it flips to the left near the right-hand edge. */
    const pw = plot.clientWidth, tw = tip.offsetWidth;
    let left = slot.offsetLeft + slot.offsetWidth + 6;
    if (left + tw > pw) left = slot.offsetLeft - tw - 6;
    tip.style.left = Math.max(0, left) + 'px';
  };
  const hide = () => { tip.hidden = true; };

  const bar = (st, kind) => st.winRate == null
    ? el('span', { class: 'wk-bar is-none' })
    : el('span', { class: 'wk-bar is-' + kind,
        /* A week you lost every trade of is still a week with a result, so it
           gets a stub on the baseline rather than nothing. */
        style: { height: Math.max(2, Math.round(st.winRate * PLOT)) + 'px' } });

  const slots = el('div', { class: 'wk-slots' },
    ...keysIn.map(k => {
      const trades = P.inPeriod(k, closed);
      const ls = P.periodStats(acct, trades.filter(t => !isFwd(t)));
      const fs = P.periodStats(acct, trades.filter(isFwd));
      const L = P.labelOf(k);
      const out = k < b.min || k > b.max;
      const say = (st, n) => `${n} ${st.winRate == null ? 'no result' : c.pct(st.winRate, 0)}`;
      const slot = el('button', {
        class: 'wk-slot' + (k === cursor ? ' is-on' : '') + (k === b.now ? ' is-now' : '') + (trades.length ? '' : ' is-empty'),
        type: 'button', disabled: out,
        'aria-label': `${L.title}: ${say(ls, 'live')}, ${say(fs, 'forward test')}`,
        'aria-current': k === cursor ? 'true' : null,
        onClick: () => { if (k === cursor) return; cursor = k; nav.refresh(); },
        /* Before your first trade there is nothing to say, so nothing is. */
        onPointerenter: out ? null : () => show(slot, k, ls, fs), onPointerleave: hide,
        onFocus: out ? null : () => show(slot, k, ls, fs), onBlur: hide },
        el('span', { class: 'wk-bars' }, bar(ls, 'live'), bar(fs, 'forward')),
        el('span', { class: 'wk-tick' }, L.tick));
      return slot;
    }));
  plot.append(slots, tip);

  return el('section', { class: 'card wk-strip' },
    el('div', { class: 'wk-strip-head' },
      el('h2', {}, `Win rate by ${word()}`),
      el('span', { class: 'wk-legend' },
        el('span', { class: 'wk-key is-live' }), 'Live',
        el('span', { class: 'wk-key is-forward' }), 'Forward test'),
      el('span', { class: 'note wk-hint' }, '← → to step')),
    plot);
}

/* ---------- one side: live, or forward test ---------- */

function seriesCard(kind, acct, st, prev, { risk = null, openCount = 0 } = {}) {
  const name = kind === 'live' ? 'Live' : 'Forward test';
  const w = word();
  const head = el('div', { class: 'wk-card-head' },
    el('span', { class: 'wk-key is-' + kind }),
    el('h2', {}, name),
    el('span', { class: 'note' }, st.count ? plural(st.count, 'trade') : ''),
    openCount ? el('span', { class: 'wk-open' }, `${openCount} still open`) : null);

  if (!st.count) {
    return el('section', { class: 'card wk-card is-empty wk-' + kind },
      head,
      el('p', { class: 'wk-none' }, kind === 'live'
        ? `No live trades closed this ${w}.`
        : `No forward tests this ${w}.`),
      kind === 'live' && risk && risk.totalPct != null ? riskBlock(acct, risk) : null);
  }

  /* Against the period before, in points. Only when both have a win rate —
     "up 100 points on a week with nothing in it" is not a comparison. */
  let delta = null;
  if (st.winRate != null && prev.winRate != null) {
    const pts = Math.round((st.winRate - prev.winRate) * 100);
    delta = el('span', { class: 'wk-delta ' + (pts > 0 ? 'is-up' : pts < 0 ? 'is-down' : 'is-flat') },
      pts === 0 ? `level with last ${w}` : `${pts > 0 ? '+' : '−'}${Math.abs(pts)} pts vs last ${w}`);
  } else if (!prev.count) {
    delta = el('span', { class: 'wk-delta is-flat' }, `nothing last ${w}`);
  }

  const tone = v => (v == null || !isFinite(v) || Math.abs(v) < 1e-9 ? '' : v > 0 ? ' is-pos' : ' is-neg');
  const stat = (label, value, cls = '', title = '') => el('div', { class: 'wk-stat', title },
    el('span', { class: 'k' }, label),
    el('span', { class: 'v' + cls }, value));

  const pf = st.pfR == null ? '—' : !isFinite(st.pfR) ? '∞' : st.pfR.toFixed(2);

  return el('section', { class: 'card wk-card wk-' + kind },
    head,
    el('div', { class: 'wk-hero' },
      el('span', { class: 'v' }, st.winRate == null ? '—' : c.pct(st.winRate, 0)),
      el('span', { class: 'u' }, 'won'),
      delta),
    el('div', { class: 'wk-split-row' },
      splitBar(st),
      el('span', { class: 'wk-split-txt' },
        `${st.wins} won · ${st.losses} lost${st.breakevens ? ` · ${st.breakevens} break-even` : ''}`)),
    el('div', { class: 'wk-stats' },
      stat('Net R', c.rFmt(st.netR), tone(st.netR)),
      stat('Per trade', c.rFmt(st.expectancyR), tone(st.expectancyR), 'Average R per trade'),
      stat('Max drawdown', st.drawdownR == null ? '—' : c.rFmt(-st.drawdownR), '',
        `The deepest fall from the best point of the ${w}, trade by trade, in R`),
      stat('Profit factor', pf, '', 'R won on winners over R lost on losers'),
      stat('Best', c.rFmt(st.bestR)),
      stat('Worst', c.rFmt(st.worstR)),
      stat('Losses in a row', String(st.lossStreak), '', `The longest run of losses this ${w}`),
      stat('Days traded', String(st.days))),
    kind === 'live' ? moneyRow(acct, st) : null,
    kind === 'live' && risk ? riskBlock(acct, risk) : null,
    st.netR == null && st.count
      ? el('p', { class: 'wk-foot' }, 'Some trades here have no risk set, so they have no R — the R totals are left blank rather than understated.')
      : null);
}

/* What it came to in money, and — on a week — against the weekly target. */
function moneyRow(acct, st) {
  const pct = c.asPercent(acct, st.net);
  const target = mode === 'week' ? c.weeklyTarget(acct, '%') : null;
  let meter = null;
  if (target && pct != null) {
    const share = Math.max(0, Math.min(1, pct / target.pct));
    const hit = pct >= target.pct;
    meter = el('div', { class: 'wk-target', title: `Weekly target ${c.pctSigned(target.pct)}` },
      el('span', { class: 'k' }, 'Weekly target'),
      el('span', { class: 'wk-meter' },
        el('span', { class: 'f' + (hit ? ' is-hit' : ''), style: { width: (share * 100).toFixed(1) + '%' } })),
      el('span', { class: 't' }, hit ? `reached · ${c.pctSigned(target.pct)}` : `${c.pctSigned(pct)} of ${c.pctSigned(target.pct)}`));
  }
  return el('div', { class: 'wk-money' },
    el('div', { class: 'wk-stat' },
      el('span', { class: 'k' }, 'Result'),
      el('span', { class: 'v' + (st.net > 0 ? ' is-pos' : st.net < 0 ? ' is-neg' : '') },
        c.money(st.net, { currency: acct.currency }),
        pct != null ? el('span', { class: 'sub' }, c.pctSigned(pct)) : null)),
    meter);
}

/* The risk you put on. Every live trade entered in the period counts, open
   ones too; each one's own risk %, summed. */
function riskBlock(acct, r) {
  const w = word();
  return el('div', { class: 'wk-risk' },
    el('span', { class: 'lbl' }, `Risk taken this ${w}`),
    el('div', { class: 'wk-stats is-three' },
      el('div', { class: 'wk-stat' },
        el('span', { class: 'k' }, 'Total'),
        el('span', { class: 'v' }, r.totalPct == null ? '—' : r.totalPct.toFixed(2) + '%',
          r.totalMoney != null ? el('span', { class: 'sub' }, c.money(r.totalMoney, { sign: false, currency: acct.currency, decimals: 0 })) : null)),
      el('div', { class: 'wk-stat' },
        el('span', { class: 'k' }, 'Per trade'),
        el('span', { class: 'v' }, r.avgPct == null ? '—' : r.avgPct.toFixed(2) + '%')),
      el('div', { class: 'wk-stat' },
        el('span', { class: 'k' }, 'Largest'),
        el('span', { class: 'v' }, r.maxPct == null ? '—' : r.maxPct.toFixed(2) + '%'))),
    (r.open || r.withRisk < r.trades)
      ? el('p', { class: 'wk-foot' },
          [r.open ? `Includes ${plural(r.open, 'open trade')}.` : '',
           r.withRisk < r.trades ? `${plural(r.trades - r.withRisk, 'trade')} with no risk set ${r.trades - r.withRisk === 1 ? 'is' : 'are'} not in it.` : '']
            .filter(Boolean).join(' '))
      : null);
}

/** Won, lost, break-even — the same bar the Tags page draws. */
function splitBar(st) {
  const seg = (n, cls) => (n ? el('span', { class: 'tg-seg ' + cls, style: { flex: String(n) } }) : null);
  return el('span', { class: 'tg-split wk-split',
    title: `${st.wins} won · ${st.losses} lost · ${st.breakevens} break-even` },
    seg(st.wins, 'is-win'), seg(st.losses, 'is-loss'), seg(st.breakevens, 'is-flat'));
}

/* ---------- inside the period ----------
   Its days, for a week — Monday to Friday always, so a day you did not trade
   shows as one — or its weeks, for a month. A week row opens that week. */
const COLS = '150px 58px minmax(70px,1fr) 64px 76px 70px minmax(70px,1fr) 64px 76px';

function breakdown(acct, trades, nav) {
  const parts = P.partsOf(cursor, trades);
  const cells = (st) => {
    if (!st.count) return [el('span', { class: 'num q' }, '—'), el('span', {}), el('span', { class: 'num q' }, '—'), el('span', { class: 'num q' }, '—')];
    return [
      el('span', { class: 'num' }, String(st.count)),
      splitBar(st),
      el('span', { class: 'num' }, st.winRate == null ? '—' : c.pct(st.winRate, 0)),
      el('span', { class: 'num' + (st.netR > 0 ? ' is-pos' : st.netR < 0 ? ' is-neg' : '') }, c.rFmt(st.netR)),
    ];
  };

  return el('section', { class: 'card wk-break' },
    el('h2', {}, mode === 'week' ? 'Day by day' : 'Week by week'),
    el('div', { class: 'tbl wk-tbl' },
      el('div', { class: 'tbl-head wk-groups', style: { gridTemplateColumns: COLS } },
        el('span', {}),
        el('span', { class: 'g', style: { gridColumn: 'span 4' } }, el('span', { class: 'wk-key is-live' }), 'Live'),
        el('span', { class: 'g is-second', style: { gridColumn: 'span 4' } }, el('span', { class: 'wk-key is-forward' }), 'Forward test')),
      el('div', { class: 'tbl-head', style: { gridTemplateColumns: COLS } },
        el('span', {}, mode === 'week' ? 'Day' : 'Week'),
        el('span', { class: 'r' }, 'Trades'), el('span', {}, 'W / L / BE'),
        el('span', { class: 'r' }, 'Win rate'), el('span', { class: 'r' }, 'Net R'),
        el('span', { class: 'r is-second' }, 'Trades'), el('span', {}, 'W / L / BE'),
        el('span', { class: 'r' }, 'Win rate'), el('span', { class: 'r' }, 'Net R')),
      el('div', { class: 'tbl-body' },
        ...parts.map(part => {
          const ls = P.periodStats(acct, part.trades.filter(t => !isFwd(t)));
          const fs = P.periodStats(acct, part.trades.filter(isFwd));
          const go = part.link && part.trades.length;
          const c2 = cells(fs);
          c2[0].classList.add('is-second');
          return el('div', {
            class: 'tbl-row wk-row' + (part.trades.length ? '' : ' is-quiet') + (go ? ' is-link' : ''),
            style: { gridTemplateColumns: COLS },
            title: go ? `Open ${part.label.split(' · ')[0]}` : '',
            onClick: go ? () => { mode = 'week'; cursor = part.link; nav.refresh(); } : null },
            el('span', { class: 'wk-part' }, part.label),
            ...cells(ls), ...c2);
        }))));
}

/* ---------- the trades themselves ---------- */
const TCOLS = '92px 50px minmax(80px,1fr) 58px minmax(80px,1.2fr) 70px 104px';

function tradeList(store, acct, trades, nav) {
  const rows = trades.slice().sort((a, b) =>
    (a.date + (a.timeOpen || '99:99')).localeCompare(b.date + (b.timeOpen || '99:99')));
  const setupName = id => store.playbook.setups.find(s => s.id === id)?.name || '—';
  return el('section', { class: 'card wk-trades' },
    el('div', { class: 'wk-card-head' },
      el('h2', {}, 'Trades'),
      el('span', { class: 'note' }, plural(rows.length, 'trade'))),
    el('div', { class: 'tbl wk-tbl' },
      el('div', { class: 'tbl-head', style: { gridTemplateColumns: TCOLS } },
        el('span', {}, 'Date'), el('span', {}, 'Time'), el('span', {}, 'Instrument'), el('span', {}, 'Side'),
        el('span', {}, 'Setup'), el('span', { class: 'r' }, 'R'), el('span', { class: 'r' }, 'Result')),
      el('div', { class: 'tbl-body' },
        ...rows.map(t => {
          const open = isOpen(t), f = isFwd(t);
          const r = open ? null : c.rMultiple(acct, t);
          return el('div', { class: 'tbl-row wk-row is-link', style: { gridTemplateColumns: TCOLS },
            onClick: () => nav.go('#/trade/' + t.id) },
            el('span', { class: 'td' }, c.shortDate(t.date)),
            el('span', { class: 'td q' }, t.timeOpen || '—'),
            el('span', { class: 'ins has-mark' }, pairMark(t.pair, 18), t.pair || '—'),
            el('span', { class: 'td' }, t.side === 'sell' ? 'Short' : 'Long'),
            el('span', { class: 'td wk-setup' }, setupName(t.setupId)),
            open ? el('span', { class: 'num wk-open-cell' }, 'open')
                 : el('span', { class: 'num' + (r > 0 ? ' is-pos' : r < 0 ? ' is-neg' : '') }, c.rFmt(r)),
            /* A forward test has no money in it, so its result column says
               what it is — the same FT the Trades page prints. */
            f ? el('span', { class: 'num' }, ft())
              : el('span', { class: 'num' + (!open && t.netResult > 0 ? ' is-pos' : !open && t.netResult < 0 ? ' is-neg' : '') },
                  open ? '—' : c.money(Number(t.netResult) || 0, { currency: acct.currency })));
        }))));
}
