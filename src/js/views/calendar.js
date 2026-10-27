import { el, icon } from '../ui.js';
import { pairMark } from '../flags.js';
import * as c from '../calc.js';
import { yearPanel } from './analytics.js';

/* Which month is on screen, and what the cells show. Module-level so it
   survives a re-render without being written to disk — it is a view
   preference, not journal data. */
let cursor = null;          // { y, m }  m is 0-11
let cellMode = 'value';     // value (in the app's unit) | count
let selected = null;        // the day whose trades are open in the rail
let span = 'month';         // month | year — one calendar, two distances

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const todayISO = () => { const n = new Date(); return iso(n.getFullYear(), n.getMonth(), n.getDate()); };

/* Monday-first weekday index. */
const dow = (y, m, d) => (new Date(y, m, d).getDay() + 6) % 7;

const spanSwitch = nav => el('div', { class: 'seg cal-span', role: 'group', 'aria-label': 'Show' },
  ...[['month', 'Month'], ['year', 'Year']].map(([k, label]) =>
    el('button', { class: span === k ? 'is-on' : '', 'data-span': k, onClick: () => { if (span !== k) { span = k; nav.refresh(); } } }, label)));

export function calendar(store, nav) {
  if (span === 'year') {
    const y = yearPanel(store, nav);
    return el('div', { class: 'view' },
      el('header', { class: 'head' }, el('h1', {}, 'Calendar'), spanSwitch(nav), y.stepper, el('div', { class: 'spacer' }), y.sub),
      y.body);
  }
  const acct = store.activeAccount;
  const all = store.tradesFor(acct.id);
  const cur = acct.currency;
  const u = store.displayUnit;
  const f = (d, r, o) => c.fig(u, acct, d, r, o);
  const target = c.weeklyTarget(acct, u);

  if (!cursor) {
    const latest = all[0]?.date;
    const n = latest ? new Date(latest + 'T00:00:00') : new Date();
    cursor = { y: n.getFullYear(), m: n.getMonth() };
  }

  const { y, m } = cursor;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  const monthTrades = all.filter(t => t.date.startsWith(prefix));
  const daily = c.dailyTotals(acct, monthTrades);
  const summary = c.summarise(acct, monthTrades);

  let weekdaysInMonth = 0;
  for (let d = 1; d <= daysInMonth; d++) { const w = new Date(y, m, d).getDay(); if (w !== 0 && w !== 6) weekdaysInMonth++; }
  const rs = monthTrades.map(t => c.rMultiple(acct, t)).filter(r => r != null && isFinite(r));
  const monthR = rs.length === monthTrades.length && rs.length ? rs.reduce((a, b) => a + b, 0) : null;

  const valueOf = v => c.figValue(u, acct, v.net, v.r) ?? 0;

  // The biggest single day in the month sets full intensity.
  const peak = Math.max(1, ...[...daily.values()].map(v => Math.abs(valueOf(v))));
  /* A cell is a tint of the profit or loss colour, and its writing is that same
     colour taken light or taken dark. Which of the two reads better is not
     something a fixed alpha threshold can answer — a pale yellow at 70% is
     already brighter than a deep red at 95% — so the tint is mixed down over
     the card it sits on and both candidates are measured against the result.
     Whichever wins, wins. That way the writing keeps working through nine
     profit colours and nine loss colours without anyone tuning a number.

     The calendar's card is dark in both themes, which is why one surface value
     serves both. */
  const readVar = name => (typeof getComputedStyle === 'function'
    ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '');
  /* The card is whatever the look makes it now — white on Light, near-black
     on Midnight — so the tint is measured over the real thing. */
  const cardHex = /^#[0-9a-f]{6}$/i.test(readVar('--card')) ? readVar('--card') : null;
  const SURFACE = cardHex ? [1, 3, 5].map(i => parseInt(cardHex.slice(i, i + 2), 16)) : [17, 19, 18];
  const triplet = (name) => {
    const n = readVar(name).split(',').map(x => Number(x.trim()));
    return n.length === 3 && n.every(Number.isFinite) ? n : [128, 128, 128];
  };
  const over = (rgb, a) => rgb.map((x, i) => x * a + SURFACE[i] * (1 - a));
  const INK = {
    up:   { tint: triplet('--profit-rgb'), light: readVar('--profit-ink'), dark: readVar('--profit-deep') },
    down: { tint: triplet('--loss-rgb'),   light: readVar('--loss-ink'),   dark: readVar('--loss-deep') },
  };

  const shade = (v) => {
    const val = valueOf(v);
    if (val === 0) return { bg: 'var(--grey-7)', ink: 'var(--grey-1)', flat: true, up: false };
    const step = Math.abs(val) / peak;
    const alpha = step > .75 ? .95 : step > .45 ? .70 : step > .18 ? .48 : .28;
    const up = val > 0;
    const set = up ? INK.up : INK.down;
    const bg = over(set.tint, alpha);
    const light = c.contrast(set.light, bg), dark = c.contrast(set.dark, bg);
    return {
      bg: `rgba(var(${up ? '--profit-rgb' : '--loss-rgb'}), ${alpha})`,
      ink: dark > light ? (up ? 'var(--profit-deep)' : 'var(--loss-deep)')
                        : (up ? 'var(--profit-ink)'  : 'var(--loss-ink)'),
      strong: dark > light,
      up,
    };
  };

  const cellText = (v) => cellMode === 'count' ? String(v.count)
                        : f(v.net, v.r, { decimals: 0, rDecimals: 1, pctDecimals: 2 });
  /* A phone's day cell is about forty pixels wide, so the figure is said
     short there: +1.1k, +2.7R, +0.9%. The full figure is on the day's rail. */
  const shortText = (v) => {
    if (cellMode === 'count') return String(v.count);
    if (u === 'R') return c.rFmt(v.r, 1);
    if (u === '%') return c.pctSigned(c.asPercent(acct, v.net), 1);
    const a = Math.abs(v.net), sign = v.net > 0 ? '+' : v.net < 0 ? '−' : '';
    return sign + (a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1) + 'k' : Math.round(a));
  };

  const step = (delta) => {
    let mm = m + delta, yy = y;
    if (mm < 0) { mm = 11; yy--; }
    if (mm > 11) { mm = 0; yy++; }
    cursor = { y: yy, m: mm };
    selected = null;
    nav.refresh();
  };

  const navBtn = (ic, fn, label) => el('button', {
    title: label,
    style: { width: '28px', height: '28px', borderRadius: '10px', background: 'var(--grey-8)',
             display: 'flex', alignItems: 'center', justifyContent: 'center' },
    onClick: fn }, icon(ic, 13, 'var(--grey-1)', 2.2));

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Calendar'),
    spanSwitch(nav),
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' } },
      navBtn('chevleft', () => step(-1), 'Previous month'),
      el('span', { class: 'm', style: { fontSize: '13px', color: 'var(--grey-8)', padding: '0 10px', minWidth: '150px', textAlign: 'center' } },
        `${MONTHS[m]} ${y}`),
      navBtn('chevright', () => step(1), 'Next month')),
    el('button', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-6)' },
      onClick: () => { const n = new Date(); cursor = { y: n.getFullYear(), m: n.getMonth() };
                       selected = null; nav.refresh(); } }, 'Today'),
    el('div', { class: 'spacer' }),
    el('div', { class: 'seg' },
      ...[['value', u === 'R' ? 'R' : u === '%' ? 'Return' : 'Net P&L'], ['count', 'Trades']].map(([k, label]) =>
        el('button', { class: k === cellMode ? 'is-on' : '', onClick: () => { cellMode = k; nav.refresh(); } }, label))),
  );

  /* Clicking the open day again closes it — the same click that opened it,
     which is what everyone tries. */
  const openDay = (date) => { selected = selected === date ? null : date; nav.refresh(); };

  /* ---------- the grid ---------- */
  const cells = [];
  const lead = dow(y, m, 1);
  for (let i = 0; i < lead; i++) cells.push(el('div', {}));

  const today = todayISO();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = iso(y, m, d);
    const v = daily.get(date);
    const past = date < today;
    const isToday = date === today;
    const ring = isToday ? '2px solid var(--blue)' : 'none';

    const isOpen = date === selected;
    /* The day you are reading sits inside a ring of its own, so the rail and
       the grid never disagree about which day is on screen. */
    const outline = isOpen ? '2px solid var(--ink)' : ring;

    if (!v) {
      cells.push(el('button', {
        class: 'cal-day',
        style: { borderRadius: '16px', padding: '9px 11px', background: past ? 'var(--cell-quiet)' : 'var(--cell)',
                 outline, outlineOffset: '1px', textAlign: 'left' },
        title: `${c.longDate(date)} · no trades`,
        onClick: () => openDay(date) },
        el('span', { class: 'm', style: { fontSize: '11px', color: isToday ? 'var(--blue-surface)' : 'var(--grey-6)' } }, String(d))));
      continue;
    }

    const sh = shade(v);
    /* The writing belongs to the day it is written on. At full strength the
       cell is nearly the colour itself, so the text goes dark to sit on it;
       everywhere else it takes the same hue lifted clear of the tint, which
       keeps a green day green and follows whatever colours are set. A flat
       day has no colour to borrow. */
    const ink = sh.ink;
    cells.push(el('button', {
      class: 'cal-day',
      style: { borderRadius: '16px', padding: '9px 11px', background: sh.bg, textAlign: 'left',
               display: 'flex', flexDirection: 'column', outline, outlineOffset: '1px' },
      title: `${c.longDate(date)} · ${v.count} trade${v.count === 1 ? '' : 's'} · ${c.money(v.net, { currency: cur })} · ${c.rFmt(v.r)} · ${c.pctSigned(c.asPercent(acct, v.net))}`,
      onClick: () => openDay(date) },
      el('div', { style: { display: 'flex', alignItems: 'baseline' } },
        el('span', { class: 'm cal-n', style: { fontSize: '11px', opacity: sh.strong ? 1 : .8, color: ink } }, String(d)),
        el('span', { class: 'm cal-c', style: { marginLeft: 'auto', fontSize: '9.5px', opacity: .6, color: ink } }, String(v.count))),
      el('span', { class: 'm cal-v', style: { marginTop: 'auto', fontSize: '13px', letterSpacing: '-.01em', color: ink } }, cellText(v)),
      el('span', { class: 'm cal-vs', style: { marginTop: 'auto', color: ink } }, shortText(v)),
    ));
  }
  while (cells.length % 7) cells.push(el('div', {}));
  const rows = cells.length / 7;

  const swatch = (bg) => el('span', { style: { width: '22px', height: '9px', borderRadius: '3px', background: bg } });

  const grid = el('section', { class: 'card', style: { flex: '1', minWidth: 0, padding: '24px 26px' } },
    el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: '6px', paddingBottom: '10px' } },
      ...['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) =>
        el('span', { class: 'eyebrow', style: { textAlign: 'center', color: i >= 5 ? 'var(--grey-6)' : 'var(--grey-3)' } }, d))),
    el('div', { class: 'cal-grid', style: { flex: '1', minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))',
                         gridTemplateRows: `repeat(${rows},minmax(0,1fr))`, gap: '6px' } }, ...cells),
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '7px', paddingTop: '14px' } },
      el('span', { class: 'm', style: { fontSize: '10px', color: 'var(--grey-5)' } }, 'loss'),
      ...[.95, .70, .48, .28].map(a => swatch(`rgba(var(--loss-rgb), ${a})`)),
      swatch('var(--grey-9)'),
      ...[.28, .48, .70, .95].map(a => swatch(`rgba(var(--profit-rgb), ${a})`)),
      el('span', { class: 'm', style: { fontSize: '10px', color: 'var(--grey-5)' } }, 'profit'),
      ),
  );

  /* ---------- right rail ---------- */
  const vals = [...daily.values()];
  const greenDays = vals.filter(v => v.net > 0).length;
  const redDays   = vals.filter(v => v.net < 0).length;
  const flatDays  = vals.filter(v => v.net === 0).length;
  const tradedDays = daily.size;

  // Weeks of this month, Monday-anchored, matching the grid rows.
  const weeks = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const wi = Math.floor((d + lead - 1) / 7);
    weeks[wi] = weeks[wi] || { net: 0, count: 0, r: 0 };
    const v = daily.get(iso(y, m, d));
    if (v) { weeks[wi].net += v.net; weeks[wi].count += v.count; weeks[wi].r += v.r; }
  }
  const weekValue = w => c.figValue(u, acct, w.net, w.r) ?? 0;
  // Without a target the bars are relative to the month's own biggest week;
  // with one, they are relative to the target, so a full bar means you hit it.
  const weekScale = target ? Math.abs(target.value || 0) || 1
                           : Math.max(1, ...weeks.map(w => Math.abs(weekValue(w))));

  const entries = [...daily.entries()];
  const best  = entries.length ? entries.reduce((a, b) => b[1].net > a[1].net ? b : a) : null;
  const worst = entries.length ? entries.reduce((a, b) => b[1].net < a[1].net ? b : a) : null;
  const avgGreen = greenDays ? entries.filter(([, v]) => v.net > 0).reduce((s, [, v]) => s + v.net, 0) / greenDays : null;
  const avgRed   = redDays   ? entries.filter(([, v]) => v.net < 0).reduce((s, [, v]) => s + v.net, 0) / redDays : null;
  const avgGreenR = greenDays ? entries.filter(([, v]) => v.net > 0).reduce((s, [, v]) => s + v.r, 0) / greenDays : null;
  const avgRedR   = redDays   ? entries.filter(([, v]) => v.net < 0).reduce((s, [, v]) => s + v.r, 0) / redDays : null;
  const streak = c.longestStreak(daily, 'green');

  /* ---------- the weekly target ----------
     Kept on the account as a percentage of its starting balance, so it means
     the same thing whatever the account is worth. You type it in whichever
     unit is switched on and it is stored converted. */
  const targetEditor = el('div', { hidden: true });
  const fmtTarget = (t) => u === 'R' ? (t.r == null ? '—' : c.rFmt(t.r, 2))
                         : u === '%' ? t.pct.toFixed(2) + '%'
                         : c.money(t.dollars, { sign: false, currency: cur, decimals: 0 });

  function editTarget() {
    if (u === 'R' && !(Number(acct.defaultRiskPercent) > 0)) {
      targetEditor.hidden = false;
      targetEditor.replaceChildren(el('div', { style: { marginTop: '12px', fontSize: '11.5px', color: 'var(--yellow)' } },
        'Set a default risk first'));
      return;
    }
    const current = target ? (u === 'R' ? target.r : u === '%' ? target.pct : target.dollars) : '';
    const input = el('input', { class: 'field', type: 'number', step: u === '$' ? '50' : '0.05', min: '0',
      value: current === '' ? '' : Number(current).toFixed(u === '$' ? 0 : 2),
      placeholder: u === '$' ? 'e.g. 2000' : u === '%' ? 'e.g. 2.00' : 'e.g. 2.67',
      style: { height: '34px', fontSize: '12px' } });

    const commit = async () => {
      const pct = c.targetToPercent(acct, u, input.value);
      await store.updateAccount(acct.id, { weeklyTargetPercent: pct });
      nav.refresh();
    };
    targetEditor.hidden = false;
    targetEditor.replaceChildren(
      el('div', { style: { marginTop: '12px', display: 'flex', alignItems: 'center', gap: '7px' } },
        input,
        el('button', { class: 'btn btn-light', style: { height: '34px' }, onClick: commit }, 'Set'),
        target ? el('button', { class: 'btn btn-quiet', style: { height: '34px' },
          onClick: async () => { await store.updateAccount(acct.id, { weeklyTargetPercent: 0 }); nav.refresh(); } }, 'Clear') : null),
      );
    input.focus(); input.select();
  }

  const dayBox = (label, val, col, date) => el('div', { style: { flex: '1', background: 'var(--grey-7)', borderRadius: '20px', padding: '13px 15px' } },
    el('div', { class: 'm', style: { fontSize: '10px', color: 'var(--grey-5)', marginBottom: '6px' } }, label),
    el('div', { class: 'm', style: { fontSize: '15px', color: col } }, val),
    el('div', { class: 'm', style: { fontSize: '10px', color: 'var(--grey-5)', marginTop: '3px' } }, date));


  /* ============================================================
     One day, opened

     The month rail answers "how did September go". This answers "what did I
     do on the 18th", which is the question you have when you click a square.
     It takes the rail's place rather than sitting beside it, because both at
     once is two summaries competing on a 320px column.
     ============================================================ */
  function dayPanel(date) {
    const dayTrades = store.tradesFor(acct.id)
      .filter(t => t.date === date)
      .sort((a, b) => (a.timeOpen || '').localeCompare(b.timeOpen || ''));
    const open = store.openFor(acct.id).filter(t => t.date === date);
    const v = daily.get(date);
    const plan = store.outlookFor(date);

    const rs = dayTrades.map(t => c.rMultiple(acct, t)).filter(r => r != null && isFinite(r));
    const dayR = rs.length === dayTrades.length && rs.length ? rs.reduce((a, b) => a + b, 0) : null;
    const wins = dayTrades.filter(t => c.outcome(t) === 'win').length;
    const losses = dayTrades.filter(t => c.outcome(t) === 'loss').length;
    const flats = dayTrades.length - wins - losses;

    const tone = !v ? 'var(--ink-2)' : v.net > 0 ? 'var(--green)' : v.net < 0 ? 'var(--orange)' : 'var(--ink-2)';

    const row = (t, isOpen) => {
      const r = c.rMultiple(acct, t);
      const o = c.outcome(t);
      const col = isOpen ? 'var(--yellow)'
        : o === 'win' ? 'var(--green)' : o === 'loss' ? 'var(--orange)' : 'var(--grey-2)';
      return el('button', { class: 'day-row', onClick: () => nav.go('#/trade/' + t.id) },
        el('span', { class: 'm t' }, t.timeOpen || '—'),
        el('span', { class: 'm p has-mark' }, pairMark(t.pair, 16), t.pair),
        el('span', { class: 'm s', style: { color: t.side === 'buy' ? 'var(--green)' : 'var(--orange)' } },
          t.side === 'buy' ? '\u25B2' : '\u25BC'),
        el('span', { class: 'm v', style: { color: col } },
          isOpen ? 'open' : u === 'R' ? (r == null ? '\u2014' : c.rFmt(r))
                 : c.fig(u, acct, t.netResult, r, { decimals: 0 })));
    };

    /* What you wrote that morning, if you wrote anything. One line — the
       Outlook page is where it is read properly. */
    const planLine = plan && plan.instruments.length
      ? el('button', { class: 'day-plan', onClick: () => nav.go('#/outlook/' + date) },
          el('span', { class: 'm k' }, 'Outlook'),
          el('span', { class: 'm w' },
            plan.instruments.filter(i => i.pair).map(i => `${i.pair} ${i.bias}`).join(' \u00b7 ') || 'written'),
          icon('chevright', 12, 'var(--grey-5)', 2))
      : null;

    return el('div', { class: 'card', style: { flex: '1', minHeight: 0, display: 'flex', flexDirection: 'column' } },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
        el('div', { class: 'eyebrow', style: { margin: 0 } }, c.longDate(date)),
        el('button', { style: { marginLeft: 'auto', width: '26px', height: '26px', borderRadius: '9px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--grey-5)' },
          title: 'Back to the month', onClick: () => openDay(date) }, icon('close', 13, 'currentColor', 2))),

      dayTrades.length || open.length
        ? el('div', {},
            el('div', { class: 'kpi-val', style: { marginTop: '14px', color: tone } },
              v ? f(v.net, v.r) : '\u2014'),
            el('div', { class: 'm', style: { marginTop: '8px', fontSize: '10.5px', color: 'var(--grey-5)' } },
              `${dayTrades.length} trade${dayTrades.length === 1 ? '' : 's'}`
              + (dayTrades.length ? ` \u00b7 ${wins} W \u00b7 ${losses} L` + (flats ? ` \u00b7 ${flats} BE` : '') : '')
              + (open.length ? ` \u00b7 ${open.length} still open` : '')
              + (u !== 'R' && dayR != null ? ` \u00b7 ${c.rFmt(dayR)}` : '')))
        : el('div', { class: 'm', style: { marginTop: '16px', fontSize: '12px', lineHeight: 1.6, color: 'var(--grey-5)' } },
            date > todayISO() ? 'Not here yet.' : 'You did not trade on this day.'),

      planLine,

      dayTrades.length || open.length
        ? el('div', { class: 'day-rows' },
            ...open.map(t => row(t, true)),
            ...dayTrades.map(t => row(t, false)))
        : null,

      el('button', { class: 'btn btn-quiet', style: { marginTop: 'auto', width: '100%', justifyContent: 'center' },
        onClick: () => nav.go('#/new') }, 'Log a trade'),
    );
  }

  const rail = el('div', { style: { width: '320px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px' } },
    el('div', { class: 'card light', style: { height: '196px', flex: 'none' } },
      el('div', { class: 'eyebrow' }, MONTHS[m] + ' net'),
      el('div', { class: 'kpi-val', style: { marginTop: 'auto' } }, f(summary.net, summary.netR)),
      el('div', { style: { marginTop: '14px', display: 'flex', gap: '3px', alignItems: 'center' } },
        el('div', { class: 'bar-fill', style: { height: '6px', borderRadius: '3px', background: 'var(--green)', width: (tradedDays ? greenDays / tradedDays * 100 : 0) + '%' } }),
        el('div', { style: { height: '6px', borderRadius: '3px', background: 'var(--grey-4)', width: (tradedDays ? flatDays / tradedDays * 100 : 0) + '%' } }),
        el('div', { style: { height: '6px', borderRadius: '3px', background: tradedDays ? 'var(--orange)' : 'var(--grey-2)', flex: '1' } })),
      el('div', { style: { marginTop: '10px', display: 'flex' } },
        el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-6)' } }, `${greenDays} green day${greenDays === 1 ? '' : 's'}`),
        el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '11px', color: 'var(--grey-6)' } },
          `${redDays} red · ${summary.count} trade${summary.count === 1 ? '' : 's'}`))),

    el('div', { class: 'card', style: { flex: 'none' } },
      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } },
        el('div', { class: 'eyebrow' }, 'By week'),
        el('button', { class: 'm', style: { marginLeft: 'auto', fontSize: '10.5px', color: target ? 'var(--blue-surface)' : 'var(--grey-5)' },
          title: target ? 'Change or clear the weekly target' : 'Set a weekly target',
          onClick: () => editTarget() },
          target ? 'target ' + fmtTarget(target) : '+ set target')),
      targetEditor,
      el('div', { style: { marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '13px' } },
        ...weeks.map((w, i) => {
          const val = weekValue(w);
          const hit = target && val >= (target.value || 0);
          return el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
            el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-5)', width: '26px' } }, 'W' + (i + 1)),
            el('div', { style: { flex: '1', height: '8px', borderRadius: '4px', background: 'var(--grey-9)', overflow: 'hidden',
                                 boxShadow: target ? 'inset 0 0 0 1px var(--grey-7)' : 'none' } },
              el('div', { class: 'bar-fill', style: { width: Math.min(100, Math.abs(val) / weekScale * 100) + '%', height: '100%', borderRadius: '4px',
                                   background: val >= 0 ? (hit ? 'var(--green)' : 'rgba(var(--profit-rgb), .62)') : 'var(--orange)' } })),
            target && w.count
              ? el('span', { class: 'm', style: { fontSize: '10px', width: '34px', textAlign: 'right',
                    color: hit ? 'var(--green)' : 'var(--grey-5)' } },
                  hit ? '✓' : Math.round(Math.max(0, val) / (target.value || 1) * 100) + '%')
              : target ? el('span', { style: { width: '34px' } }) : null,
            el('span', { class: 'm', style: { fontSize: '11.5px', width: '74px', textAlign: 'right',
                color: w.net > 0 ? 'var(--green)' : w.net < 0 ? 'var(--orange)' : 'var(--grey-5)' } },
              w.count ? f(w.net, w.r, { decimals: 0, rDecimals: 1 }) : '—'));
        })),
      el('div', { style: { marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--grey-7)', display: 'flex', alignItems: 'baseline' } },
        el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-5)' } }, 'Longest green streak'),
        el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px', color: 'var(--ink-2)' } },
          `${streak} day${streak === 1 ? '' : 's'}`))),

    el('div', { class: 'card', style: { flex: '1', minHeight: 0 } },
      el('div', { class: 'eyebrow' }, 'This month'),
      el('div', { style: { marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '11px' } },
        ...[
          ['Days traded', monthTrades.length ? `${tradedDays} of ${weekdaysInMonth}` : '—'],
          ['Trades per day', tradedDays ? (summary.count / tradedDays).toFixed(1) : '—'],
          ['Avg green day', avgGreen == null ? '—' : f(avgGreen, avgGreenR, { decimals: 0, rDecimals: 1 }), 'var(--green)'],
          ['Avg red day', avgRed == null ? '—' : f(avgRed, avgRedR, { decimals: 0, rDecimals: 1 }), 'var(--orange)'],
          [u === 'R' ? 'Month in money' : 'Month in R',
           u === 'R' ? c.money(summary.net, { currency: cur, decimals: 0 }) : (monthR == null ? '—' : c.rFmt(monthR))],
        ].map(([k, v, col]) => el('div', { style: { display: 'flex', alignItems: 'baseline' } },
          el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-5)' } }, k),
          el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12px', color: col || 'var(--ink-2)' } }, v)))),
      el('div', { style: { marginTop: 'auto', paddingTop: '18px', display: 'flex', gap: '8px' } },
        dayBox('Best day', best ? f(best[1].net, best[1].r, { decimals: 0, rDecimals: 1 }) : '—', 'var(--green)', best ? c.shortDate(best[0]) : ''),
        dayBox('Worst day', worst ? f(worst[1].net, worst[1].r, { decimals: 0, rDecimals: 1 }) : '—', 'var(--orange)', worst ? c.shortDate(worst[0]) : ''))),
  );

  const side = selected
    ? el('div', { style: { width: '320px', flex: 'none', display: 'flex', flexDirection: 'column' } }, dayPanel(selected))
    : rail;

  return el('div', { class: 'view' }, head, el('div', { class: 'row', style: { flex: '1' } }, grid, side));
}
