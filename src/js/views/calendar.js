import { el, icon } from '../ui.js';
import * as c from '../calc.js';

/* Which month is on screen, and what the cells show. Module-level so it
   survives a re-render without being written to disk — it is a view
   preference, not journal data. */
let cursor = null;          // { y, m }  m is 0-11
let cellMode = 'value';     // value (in the app's unit) | count

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const todayISO = () => { const n = new Date(); return iso(n.getFullYear(), n.getMonth(), n.getDate()); };

/* Monday-first weekday index. */
const dow = (y, m, d) => (new Date(y, m, d).getDay() + 6) % 7;

export function calendar(store, nav) {
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
  const shade = (v) => {
    const val = valueOf(v);
    if (val === 0) return { bg: 'var(--grey-7)', strong: false, up: false };
    const step = Math.abs(val) / peak;
    const alpha = step > .75 ? .95 : step > .45 ? .70 : step > .18 ? .48 : .28;
    return { bg: `rgba(${val > 0 ? '24,172,101' : '244,98,74'},${alpha})`, strong: alpha > .9, up: val > 0 };
  };

  const cellText = (v) => cellMode === 'count' ? String(v.count)
                        : f(v.net, v.r, { decimals: 0, rDecimals: 1, pctDecimals: 2 });

  const step = (delta) => {
    let mm = m + delta, yy = y;
    if (mm < 0) { mm = 11; yy--; }
    if (mm > 11) { mm = 0; yy++; }
    cursor = { y: yy, m: mm };
    nav.refresh();
  };

  const navBtn = (ic, fn, label) => el('button', {
    title: label,
    style: { width: '28px', height: '28px', borderRadius: '10px', background: 'var(--grey-8)',
             display: 'flex', alignItems: 'center', justifyContent: 'center' },
    onClick: fn }, icon(ic, 13, 'var(--grey-1)', 2.2));

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Calendar'),
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' } },
      navBtn('chevleft', () => step(-1), 'Previous month'),
      el('span', { class: 'm', style: { fontSize: '13px', color: 'var(--grey-8)', padding: '0 10px', minWidth: '150px', textAlign: 'center' } },
        `${MONTHS[m]} ${y}`),
      navBtn('chevright', () => step(1), 'Next month')),
    el('button', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-6)' },
      onClick: () => { const n = new Date(); cursor = { y: n.getFullYear(), m: n.getMonth() }; nav.refresh(); } }, 'Today'),
    el('div', { class: 'spacer' }),
    el('div', { class: 'seg' },
      ...[['value', u === 'R' ? 'R' : u === '%' ? 'Return' : 'Net P&L'], ['count', 'Trades']].map(([k, label]) =>
        el('button', { class: k === cellMode ? 'is-on' : '', onClick: () => { cellMode = k; nav.refresh(); } }, label))),
  );

  /* ---------- the grid ---------- */
  const cells = [];
  const lead = dow(y, m, 1);
  for (let i = 0; i < lead; i++) cells.push(el('div', {}));

  const today = todayISO();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = iso(y, m, d);
    const v = daily.get(date);
    const weekend = dow(y, m, d) >= 5;
    const future = date > today;
    const isToday = date === today;
    const ring = isToday ? '2px solid var(--blue)' : 'none';

    if (!v) {
      cells.push(el('div', {
        style: { borderRadius: '16px', padding: '9px 11px', background: (weekend || future) ? '#262626' : 'var(--grey-9)',
                 outline: ring, outlineOffset: '1px' } },
        el('span', { class: 'm', style: { fontSize: '11px', color: isToday ? 'var(--blue-surface)' : 'var(--grey-6)' } }, String(d))));
      continue;
    }

    const sh = shade(v);
    const ink = sh.strong ? (sh.up ? '#08301D' : '#3D1108') : '#FFFFFF';
    cells.push(el('button', {
      style: { borderRadius: '16px', padding: '9px 11px', background: sh.bg, textAlign: 'left',
               display: 'flex', flexDirection: 'column', outline: ring, outlineOffset: '1px' },
      title: `${c.longDate(date)} · ${v.count} trade${v.count === 1 ? '' : 's'} · ${c.money(v.net, { currency: cur })} · ${c.rFmt(v.r)} · ${c.pctSigned(c.asPercent(acct, v.net))}`,
      onClick: () => nav.go('#/trades') },
      el('div', { style: { display: 'flex', alignItems: 'baseline' } },
        el('span', { class: 'm', style: { fontSize: '11px', color: sh.strong ? ink : 'var(--grey-1)' } }, String(d)),
        el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '9.5px', opacity: .65, color: ink } }, String(v.count))),
      el('span', { class: 'm', style: { marginTop: 'auto', fontSize: '13px', letterSpacing: '-.01em', color: ink } }, cellText(v)),
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
      ...[.95, .70, .48, .28].map(a => swatch(`rgba(244,98,74,${a})`)),
      swatch('var(--grey-9)'),
      ...[.28, .48, .70, .95].map(a => swatch(`rgba(24,172,101,${a})`)),
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
                                   background: val >= 0 ? (hit ? 'var(--green)' : 'rgba(24,172,101,.62)') : 'var(--orange)' } })),
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

  return el('div', { class: 'view' }, head, el('div', { class: 'row', style: { flex: '1' } }, grid, rail));
}
