/* ============================================================
   replay.js (view) — your live week against the same week backtested.

   The week picker is the insight: one thin bar per week of the year, height
   is the share of the replay's setups you actually took. A whole year fits
   in one strip, there is no dropdown, and finding a bad week is the same
   gesture as opening it.

   Every comparison is in R. The CSV's dollar columns are read but never
   compared: a replay account sized at 1% and a live account at 0.75% put
   different money on the same idea.
   ============================================================ */
import { el, icon, toast } from '../ui.js';
import * as c from '../calc.js';
import { parseReplayCSV, isoWeek, weekKey, weekRange, weeksInYear } from '../replay.js';

let cursor = null;          // '2026-W36'
let strain = null;          // year shown in the strip

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const VERDICTS = {
  matched:  { label: 'Matched',  col: 'var(--green)'  },
  diverged: { label: 'Diverged', col: 'var(--yellow)' },
  missed:   { label: 'Missed',   col: 'var(--blue)'   },
  extra:    { label: 'Extra',    col: 'var(--orange)' },
};

export function replay(store, nav) {
  const pb = store.playbook;
  const acct = store.activeAccount;
  const cfg = pb.replay || (pb.replay = { windowMins: 15, csvOffsetHours: 0 });
  const weeks = store.replayWeeks;
  const live = store.tradesFor(acct.id);

  if (!cursor) cursor = live.length ? isoWeek(live[0].date) : isoWeek(c.todayISO());
  const [cy] = cursor.split('-W').map(Number);
  if (strain == null) strain = cy;

  const range = weekRange(cursor);
  const liveWeek = live.filter(t => t.date >= range.start && t.date <= range.end)
                       .sort((a, b) => (a.date + a.timeOpen).localeCompare(b.date + b.timeOpen));
  const replayWeek = (weeks[cursor]?.trades || [])
                       .slice().sort((a, b) => (a.date + a.timeOpen).localeCompare(b.date + b.timeOpen));
  const pairs = c.matchTrades(pb, acct, liveWeek, replayWeek, { windowMins: cfg.windowMins });

  const tally = { matched: [], diverged: [], missed: [], extra: [] };
  for (const p of pairs) tally[p.verdict].push(p);

  const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) ?? 0), 0);
  const liveR   = liveWeek.map(t => c.rMultiple(acct, t)).filter(r => r != null && isFinite(r));
  const liveRSum = liveR.length === liveWeek.length ? sum(liveR, x => x) : null;
  const replayRSum = replayWeek.length ? sum(replayWeek, t => t.rMultiple) : null;
  const liveNet = sum(liveWeek, t => Number(t.netResult) || 0);

  /* ---------- import ---------- */
  const fileInput = el('input', { type: 'file', accept: '.csv,text/csv', hidden: true,
    onChange: e => { const f = e.target.files[0]; if (f) ingest(f); e.target.value = ''; } });

  async function ingest(file) {
    let text;
    try { text = await file.text(); }
    catch { return toast('Could not read that file', 'bad'); }

    const res = parseReplayCSV(text, pb, { offsetHours: cfg.csvOffsetHours });
    if (res.missing.length) {
      return toast('That CSV has no ' + res.missing.join(', ') + ' column — nothing imported', 'bad');
    }
    if (!res.trades.length) {
      // Say why, not just that. The first row's reason is almost always the reason.
      const why = res.skipped[0]?.why;
      return toast(why ? `Nothing imported — row ${res.skipped[0].row}: ${why}` : 'No readable trades in that file', 'warn');
    }

    const byWeek = new Map();
    for (const t of res.trades) {
      const k = isoWeek(t.date);
      if (!byWeek.has(k)) byWeek.set(k, []);
      byWeek.get(k).push(t);
    }
    // A week you import again is replaced, not merged — a re-export of the
    // same session is the truth about it, and merging would double it up.
    for (const [k, trades] of byWeek) {
      weeks[k] = { importedAt: new Date().toISOString(), source: file.name, trades };
    }
    await store.save('replay');
    try { await store.writeText('replay/' + file.name, text); } catch { /* the copy is a courtesy */ }

    const keys = [...byWeek.keys()].sort();
    cursor = keys[keys.length - 1];
    strain = Number(cursor.split('-W')[0]);
    nav.refresh();
    const skipped = res.skipped.length ? `, ${res.skipped.length} row${res.skipped.length === 1 ? '' : 's'} skipped` : '';
    toast(`${res.trades.length} replay trade${res.trades.length === 1 ? '' : 's'} across ${keys.length} week${keys.length === 1 ? '' : 's'}${skipped}`);
  }

  /* ---------- head ---------- */
  const stepper = (val, set, fmt) => el('div', { class: 'stepper' },
    el('button', { onClick: () => set(val - 1) }, icon('minus', 11, 'var(--grey-2)', 2.6)),
    el('span', { class: 'val' }, fmt(val)),
    el('button', { onClick: () => set(val + 1) }, icon('plus', 11, 'var(--grey-2)', 2.6)));

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Replay'),
    el('span', { class: 'sub' }, `${cursor.replace('-W', ' · week ')} · ${c.shortDate(range.start)} – ${c.shortDate(range.end)}`),
    el('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' } },
      el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } }, 'match window'),
      stepper(cfg.windowMins, async v => {
        cfg.windowMins = Math.min(120, Math.max(1, v));
        await store.save('playbook'); nav.refresh();
      }, v => '± ' + v + 'm'),
      el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)', marginLeft: '6px' } }, 'CSV clock'),
      el('div', { class: 'seg' },
        ...[[0, 'UTC'], [8, 'Perth +8']].map(([h, label]) =>
          el('button', { class: cfg.csvOffsetHours === h ? 'is-on' : '',
            onClick: async () => {
              if (cfg.csvOffsetHours === h) return;
              cfg.csvOffsetHours = h; await store.save('playbook');
              toast('Re-import your CSVs to move them onto the new clock', 'warn');
              nav.refresh();
            } }, label))),
      el('button', { class: 'btn btn-light', style: { marginLeft: '6px' },
        title: weeks[cursor]
          ? `${weeks[cursor].source} · imported ${c.shortDate(weeks[cursor].importedAt.slice(0, 10))} · importing again replaces this week`
          : 'dateStart, pair, side and avgRiskReward are what it reads; column names are matched loosely',
        onClick: () => fileInput.click() },
        icon('upload', 14, 'var(--grey-8)', 1.9), weeks[cursor] ? 'Replace CSV' : 'Import CSV'),
      fileInput),
  );

  /* ---------- the year strip ---------- */
  const total = weeksInYear(strain);
  const strip = el('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '2px', height: '74px' } });
  for (let w = 1; w <= total; w++) {
    const k = weekKey(strain, w);
    const rw = weeks[k];
    const r = weekRange(k);
    const lw = live.filter(t => t.date >= r.start && t.date <= r.end);
    const isNow = k === cursor;

    let h = 6, bg = 'transparent', border = '1px dashed var(--grey-7)', title;
    if (rw) {
      const p = c.matchTrades(pb, acct, lw, rw.trades, { windowMins: cfg.windowMins });
      const setups = p.filter(x => x.replay).length;
      const took = p.filter(x => x.replay && x.live).length;
      const share = setups ? took / setups : 0;
      h = 8 + share * 58;
      border = 'none';
      bg = share >= .8 ? 'var(--green)' : share >= .5 ? 'rgba(var(--profit-rgb), .6)' : 'var(--orange)';
      title = `${k} — you took ${took} of ${setups} replay setup${setups === 1 ? '' : 's'}`;
    } else {
      title = `${k} — no replay imported${lw.length ? ` · ${lw.length} live trade${lw.length === 1 ? '' : 's'}` : ''}`;
      if (lw.length) { border = '1px dashed var(--grey-5)'; h = 12; }
    }

    strip.append(el('button', { title,
      style: { flex: '1', minWidth: 0, height: '100%', display: 'flex', alignItems: 'flex-end', padding: 0 },
      onClick: () => { cursor = k; nav.refresh(); } },
      el('span', { class: 'col-fill', style: { width: '100%', height: h + 'px', borderRadius: '3px', background: bg, border,
                            boxShadow: isNow ? '0 0 0 1.5px var(--blue)' : 'none' } })));
  }

  const stripCard = el('section', { class: 'card', style: { flex: 'none', padding: '22px 26px 18px' } },
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
      el('button', { onClick: () => { strain--; nav.refresh(); } }, icon('chevleft', 15, 'var(--grey-3)', 2)),
      el('h2', { style: { minWidth: '52px', textAlign: 'center' },
        title: 'One bar per week. Height is the share of the replay\u2019s setups you took; dashed means nothing imported.' }, String(strain)),
      el('button', { onClick: () => { strain++; nav.refresh(); } }, icon('chevright', 15, 'var(--grey-3)', 2))),
    el('div', { style: { marginTop: '14px' } }, strip),
    el('div', { style: { marginTop: '7px', display: 'grid', gridTemplateColumns: 'repeat(12,1fr)' } },
      ...MONTHS.map(mo => el('span', { class: 'eyebrow', style: { textAlign: 'center' } }, mo))),
  );

  /* ---------- the three figures ---------- */
  const rBox = (label, value, sub, tone, light) => el('div', { class: 'card' + (light ? ' light' : ''),
      style: { flex: '1', minWidth: 0, padding: '22px 24px' } },
    el('div', { class: 'eyebrow' }, label),
    el('div', { class: 'kpi-val', style: { marginTop: '16px', color: tone } },
      value == null ? '—' : c.rFmt(value).replace(/R$/, ''),
      value == null ? null : el('span', { class: 'unit' }, 'R')),
    el('div', { class: 'm', style: { marginTop: '10px', fontSize: '10.5px', color: light ? 'var(--grey-6)' : 'var(--grey-5)' } }, sub));

  const tone = v => v == null ? 'var(--grey-2)' : v > 0 ? 'var(--green)' : v < 0 ? 'var(--orange)' : 'var(--grey-2)';
  const diff = liveRSum != null && replayRSum != null ? liveRSum - replayRSum : null;
  const biggestMiss = tally.missed.slice().sort((a, b) => (b.replayR ?? 0) - (a.replayR ?? 0))[0];

  const figures = el('div', { class: 'row', style: { flex: 'none' } },
    rBox('Live week', liveRSum, liveWeek.length
        ? `${liveWeek.length} trade${liveWeek.length === 1 ? '' : 's'}`
          + (store.displayUnit === 'R' ? '' : ' · ' + c.fig(store.displayUnit, acct, liveNet, liveRSum, { decimals: 0 }))
        : 'nothing logged this week', tone(liveRSum)),
    rBox('Replay week', replayRSum, replayWeek.length
        ? `${replayWeek.length} trade${replayWeek.length === 1 ? '' : 's'} · from avgRiskReward`
        : 'no CSV imported for this week', tone(replayRSum)),
    rBox('Difference', diff, diff == null ? 'needs both sides'
        : biggestMiss && biggestMiss.replayR > 0
          ? `one missed trade is ${c.rFmt(biggestMiss.replayR)} of it`
          : tally.missed.length ? `${tally.missed.length} setup${tally.missed.length === 1 ? '' : 's'} you did not take`
          : 'you took every setup', tone(diff), true),
  );

  /* ---------- the table ---------- */
  const COLS = '70px 108px 108px 92px 74px 1fr 72px 72px 88px';
  const sideCell = t => el('span', { class: 'm', style: { fontSize: '11.5px', color: t.side === 'buy' ? 'var(--green)' : 'var(--orange)' } },
    (t.side === 'buy' ? '▲ ' : '▼ ') + (t.side === 'buy' ? 'Long' : 'Short'));

  const rows = pairs.map(p => {
    const t = p.live || p.replay;
    const v = VERDICTS[p.verdict];
    /* Both clocks, side by side. Yours first, the replay's second — so a
       trade you held longer than the backtest did shows up as a wider pair of
       numbers rather than something you have to work out. */
    const clock = pick => `${p.live ? (pick(p.live) || '—') : '—'} · ${p.replay ? (pick(p.replay) || '—') : '—'}`;
    const entries = clock(t => t.timeOpen);
    const exits   = clock(t => t.timeClose);
    const sess = p.sessionMismatch ? `${p.liveSession} / ${p.replaySession}` : (p.liveSession || p.replaySession);
    return el('div', { class: 'tbl-row', style: { gridTemplateColumns: COLS, cursor: p.live ? 'pointer' : 'default' },
      onClick: () => p.live && nav.go('#/trade/' + p.live.id) },
      el('span', { class: 'td' }, c.shortDate(t.date).replace(/^0/, '')),
      el('span', { class: 'num', style: { textAlign: 'left' } }, entries),
      el('span', { class: 'num', style: { textAlign: 'left', color: 'var(--grey-4)' } }, exits),
      el('span', { class: 'ins' }, t.pair),
      sideCell(t),
      el('span', { class: 'td', style: { color: p.sessionMismatch ? 'var(--yellow)' : 'var(--grey-3)',
                                         overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                   title: p.sessionMismatch ? 'The two entries fall in different killzones' : '' }, sess),
      el('span', { class: 'pl', style: { color: tone(p.liveR) } }, p.liveR == null ? '—' : c.rFmt(p.liveR)),
      el('span', { class: 'pl', style: { color: tone(p.replayR) } }, p.replayR == null ? '—' : c.rFmt(p.replayR)),
      el('span', { style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '7px' } },
        el('span', { class: 'bar-mark', style: { background: v.col } }),
        el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--ink-2)' } }, v.label)));
  });

  const tableCard = el('section', { class: 'card', style: { flex: '1', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '12px' } },
      el('h2', {}, 'Live against replay'),
      el('span', { class: 'note' }, replayWeek.length && pairs.length
        ? `${pairs.length} pair${pairs.length === 1 ? '' : 's'} · yours · replay`
        : 'nothing to compare yet')),
    replayWeek.length && pairs.length
      ? el('div', { class: 'tbl', style: { marginTop: '18px', flex: '1', minHeight: 0 } },
          el('div', { class: 'tbl-head', style: { gridTemplateColumns: COLS } },
            el('span', {}, 'Day'), el('span', {}, 'Entry'), el('span', {}, 'Exit'),
            el('span', {}, 'Pair'), el('span', {}, 'Side'),
            el('span', {}, 'Session'),
            el('span', { style: { textAlign: 'right' } }, 'Live'),
            el('span', { style: { textAlign: 'right' } }, 'Replay'),
            el('span', { style: { textAlign: 'right' } }, 'Verdict')),
          el('div', { class: 'tbl-body' }, ...rows))
      : el('div', { class: 'empty' },
          el('p', {}, !replayWeek.length
            ? `Import the FX Replay CSV for this week and it lines up against the ${liveWeek.length
                ? `${liveWeek.length} trade${liveWeek.length === 1 ? '' : 's'} you took` : 'trades you took'}.`
            : 'A replay is imported for this week, but you logged nothing live.'),
          replayWeek.length ? null : el('button', { class: 'btn btn-light', onClick: () => fileInput.click() },
            icon('upload', 14, 'var(--grey-8)', 1.9), 'Import CSV')),
  );

  /* ---------- where the week went ---------- */
  const line = (key) => {
    const list = tally[key], v = VERDICTS[key];
    const r = key === 'missed' ? sum(list, x => x.replayR) : sum(list, x => x.liveR);
    const noun = key === 'missed' ? 'setup' : 'trade';
    return el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
      el('span', { class: 'bar-mark', style: { background: v.col } }),
      el('span', { class: 'm', style: { fontSize: '12px', color: 'var(--ink-2)', width: '76px' } }, v.label),
      el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } },
        `${list.length} ${noun}${list.length === 1 ? '' : 's'}`),
      el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12px', color: list.length ? tone(r) : 'var(--grey-6)' } },
        list.length ? c.rFmt(r) : '—'));
  };

  const divergedGap = tally.diverged.length
    ? sum(tally.diverged, p => (p.liveR ?? 0) - (p.replayR ?? 0)) : null;

  /* ---------- how much of the week you actually collected ----------

     One number: your R as a share of the R your own replay found. Above 100
     means you beat it, which is allowed and worth seeing.

     A percentage only means something when the replay made money. A replay
     week that lost, or scratched, has no edge to have captured a share of —
     dividing by it would print a confident figure that means nothing, so
     those weeks get a sentence instead. This is the same rule the rest of the
     app follows: say nothing rather than invent a number. */
  const capture = (liveRSum != null && replayRSum != null && replayRSum > 0.05)
    ? (liveRSum / replayRSum) * 100 : null;

  const captureCard = el('section', { class: 'card', style: { flex: 'none' } },
    el('div', { class: 'eyebrow' }, 'Similarity'),
    capture != null
      ? el('div', {},
          el('div', { class: 'kpi-val', style: { marginTop: '14px',
              color: capture >= 90 ? 'var(--green)' : capture >= 50 ? 'var(--yellow)' : 'var(--orange)' } },
            String(Math.round(capture)),
            el('span', { class: 'unit' }, '%')),
          /* A bar, clipped at 100, so a glance says "about a tenth" without
             reading the figure. Past 100 it simply fills. */
          el('div', { style: { marginTop: '14px', height: '6px', borderRadius: '3px',
                               background: 'var(--grey-7)', overflow: 'hidden' } },
            el('div', { style: { height: '100%', borderRadius: '3px',
                width: Math.max(0, Math.min(100, capture)) + '%',
                background: capture >= 90 ? 'var(--green)' : capture >= 50 ? 'var(--yellow)' : 'var(--orange)' } })),
          el('div', { class: 'm', style: { marginTop: '12px', fontSize: '11px', lineHeight: 1.6, color: 'var(--grey-4)' } },
            c.rFmt(liveRSum) + ' captured of ' + c.rFmt(replayRSum) + ' available'))
      : el('div', { class: 'm', style: { marginTop: '14px', fontSize: '11.5px', lineHeight: 1.6, color: 'var(--grey-4)' } },
          replayRSum == null ? 'Import this week\u2019s replay and it works out how much of it you collected.'
          : liveRSum == null ? 'Log this week\u2019s trades and it works out how much of the replay you collected.'
          : replayRSum <= 0.05 ? 'The replay week made nothing, so there is no edge to have captured a share of. Your week: '
                                 + c.rFmt(liveRSum) + '.'
          : '\u2014'),
  );

  const rail = el('div', { style: { width: '332px', flex: 'none', display: 'flex', flexDirection: 'column',
                                    gap: '8px', minHeight: 0, alignItems: 'stretch' } },
    el('section', { class: 'card', style: { flex: 'none' } },
      el('h2', {}, 'Where the week went'),
      el('div', { style: { marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '14px' } },
        line('matched'), line('diverged'), line('missed'), line('extra')),
      el('div', { style: { marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--grey-7)',
                           fontSize: '12px', lineHeight: 1.6, color: 'var(--grey-3)' } },
        ...(!pairs.length ? ['Nothing to read yet.']
          : biggestMiss && biggestMiss.replayR > 0
            ? ['The ', el('span', { class: 'm', style: { color: 'var(--ink-2)' } }, biggestMiss.replay.timeOpen),
               ' ', biggestMiss.replaySession, ' entry is the biggest single gap — ',
               el('span', { class: 'm', style: { color: 'var(--blue)' } }, c.rFmt(biggestMiss.replayR)),
               ' your own replay found and you did not take.']
          : divergedGap != null && Math.abs(divergedGap) > 0.05
            ? ['Nothing was missed. The gap is management: your ', String(tally.diverged.length),
               ' diverged trade', tally.diverged.length === 1 ? '' : 's', ' ',
               divergedGap < 0 ? 'gave back ' : 'gained ',
               el('span', { class: 'm', style: { color: divergedGap < 0 ? 'var(--orange)' : 'var(--green)' } }, c.rFmt(Math.abs(divergedGap))),
               ' against the replay.']
          : tally.extra.length
            ? ['Every replay setup was taken. The ', String(tally.extra.length), ' extra trade',
               tally.extra.length === 1 ? '' : 's', tally.extra.length === 1 ? ' is' : ' are',
               ' what your replay never found.']
            : ['Live and replay agree on this week.'])),
    ),
    captureCard);

  return el('div', { class: 'view' }, head, stripCard, figures,
    el('div', { class: 'row', style: { flex: '1', minHeight: 0 } }, tableCard, rail));
}
