import { el, svg, icon } from '../ui.js';
import * as c from '../calc.js';

let tab = 'overview';       // overview | timing | discipline
let period = '30D';
const DAYS = { '7D': 7, '30D': 30, '90D': 90, 'All': null };

function withinPeriod(trades) {
  const days = DAYS[period];
  if (!days) return trades;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  return trades.filter(t => t.date >= cutoff.toISOString().slice(0, 10));
}

/* Group trades and total them. Every field here is a sum or a count of
   something you typed — nothing is inferred. */
function groupBy(account, trades, keyFn, labelFn) {
  const map = new Map();
  for (const t of trades) {
    const k = keyFn(t);
    const g = map.get(k) || { key: k, label: labelFn(t, k), net: 0, count: 0, wins: 0, losses: 0, breakevens: 0, r: 0, rKnown: true };
    g.net += Number(t.netResult) || 0;
    g.count += 1;
    const r = c.rMultiple(account, t);
    if (r != null && isFinite(r)) g.r += r; else g.rKnown = false;
    g[{ win: 'wins', loss: 'losses', breakeven: 'breakevens' }[c.outcome(t)]] += 1;
    map.set(k, g);
  }
  for (const g of map.values()) if (!g.rKnown) g.r = null;
  return [...map.values()].sort((a, b) => b.net - a.net);
}

function barList(groups, ctx, { showRate = false } = {}) {
  const { unit: u, account: acct } = ctx;
  const val = g => c.figValue(u, acct, g.net, g.r) ?? 0;
  const peak = Math.max(1, ...groups.map(g => Math.abs(val(g))));
  return el('div', { style: { marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '15px' } },
    ...groups.map(g => {
      const decided = g.wins + g.losses;
      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '7px' } },
        el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px' } },
          el('span', { class: 'm', style: { fontSize: '12px', color: 'var(--ink-2)' } }, g.label),
          el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } },
            showRate && decided ? `${g.count} · ${Math.round(g.wins / decided * 100)}%` : String(g.count)),
          el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12px',
            color: g.net > 0 ? 'var(--green)' : g.net < 0 ? 'var(--orange)' : 'var(--grey-2)' } },
            c.fig(u, acct, g.net, g.r, { decimals: 0, rDecimals: 1 }))),
        el('div', { style: { height: '8px', borderRadius: '4px', background: 'var(--grey-9)', overflow: 'hidden' } },
          el('div', { class: 'bar-fill', style: { width: (Math.abs(val(g)) / peak * 100) + '%', height: '100%', borderRadius: '4px',
            background: g.net >= 0 ? 'var(--green)' : 'var(--orange)' } })));
    }),
    groups.length ? null : el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-5)' } }, 'Nothing to group yet.'),
  );
}

/* ---------- a diverging column chart, used for hour of day ---------- */
function divergingColumns(buckets, ctx, { width = 1120, height = 250 } = {}) {
  const { unit: u, account: acct } = ctx;
  const val = b => c.figValue(u, acct, b.net, b.r) ?? 0;
  const g = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', style: 'display:block;height:auto' });
  const peak = Math.max(1, ...buckets.map(b => Math.abs(val(b))));
  const baseline = 175, top = 5, bottom = 205;
  const x0 = 30, span = width - x0 - 8;
  const bw = Math.min(90, (span / buckets.length) * .72);
  const gap = span / buckets.length;

  g.append(svg('line', { x1: x0, y1: top, x2: width - 8, y2: top, stroke: 'var(--grey-9)', 'stroke-width': 1 }));
  g.append(svg('line', { x1: x0, y1: baseline, x2: width - 8, y2: baseline, stroke: 'var(--grey-6)', 'stroke-width': 1.4 }));

  buckets.forEach((b, i) => {
    const cx = x0 + gap * i + gap / 2;
    const h = Math.max(2, Math.abs(val(b)) / peak * (baseline - top));
    const up = val(b) >= 0;
    g.append(svg('rect', { class: 'col-fill-svg', x: cx - bw / 2, y: up ? baseline - h : baseline, width: bw,
                           height: up ? h : Math.min(h, bottom - baseline), rx: 4,
                           fill: val(b) === 0 ? 'var(--grey-6)' : up ? 'var(--green)' : 'var(--orange)' }));
    if (b.count) {
      const labelY = up ? Math.max(top + 18, baseline - h + 20) : baseline + Math.min(h, 26) + 18;
      const inside = up && h > 34;
      g.append(svg('text', { x: cx, y: up ? (inside ? baseline - h + 20 : baseline - h - 8) : labelY,
                             'text-anchor': 'middle', 'font-family': 'var(--mono)', 'font-size': 13,
                             fill: inside ? '#08301D' : up ? 'var(--grey-2)' : 'var(--orange)' },
        c.fig(u, acct, b.net, b.r, { decimals: 0, rDecimals: 1 })));
    }
    g.append(svg('text', { x: cx, y: 228, 'text-anchor': 'middle', 'font-family': 'var(--mono)',
                           'font-size': 13, fill: 'var(--grey-5)' }, b.label));
    g.append(svg('text', { x: cx, y: 246, 'text-anchor': 'middle', 'font-family': 'var(--mono)',
                           'font-size': 12, fill: 'var(--grey-4)' }, b.count ? String(b.count) : ''));
  });
  return g;
}

export function analytics(store, nav) {
  const acct = store.activeAccount;
  const cur = acct.currency;
  const trades = withinPeriod(store.tradesFor(acct.id));
  const s = c.summarise(acct, trades);

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Analytics'),
    el('div', { class: 'seg', style: { marginLeft: '6px' } },
      ...[['overview', 'Overview'], ['timing', 'Timing'], ['discipline', 'Discipline']].map(([k, label]) =>
        el('button', { class: k === tab ? 'is-on' : '', onClick: () => { tab = k; nav.refresh(); } }, label))),
    el('span', { class: 'sub' }, `${trades.length} closed trade${trades.length === 1 ? '' : 's'}`),
    el('div', { class: 'spacer' }),
    el('div', { class: 'seg' },
      ...Object.keys(DAYS).map(k => el('button', { class: k === period ? 'is-on' : '',
        onClick: () => { period = k; nav.refresh(); } }, k))),
  );

  if (!trades.length) {
    return el('div', { class: 'view' }, head,
      el('div', { class: 'card', style: { flex: '1' } },
        el('div', { class: 'empty' },
          icon('analytics', 34, 'var(--grey-6)', 1.4),
          el('h2', { style: { fontSize: '16px' } }, 'Nothing in this window'),
          el('p', {}, 'Log some trades, or widen the period.'))));
  }

  const ctx = { unit: store.displayUnit, account: acct, cur };
  const body = tab === 'overview' ? overview(store, acct, trades, s, ctx)
             : tab === 'timing'   ? timing(store, acct, trades, ctx)
             :                      discipline(store, acct, trades, ctx);
  return el('div', { class: 'view' }, head, body);
}

/* ============================================================
   Overview — where your outcomes land, and what earns
   ============================================================ */
function overview(store, acct, trades, s, ctx) {
  const { unit: u, cur } = ctx;
  const f = (d, r, o) => c.fig(u, acct, d, r, o);
  const dist = c.rDistribution(acct, trades);
  const peak = Math.max(1, ...dist.map(d => d.count));

  const chart = el('div', { class: 'card', style: { width: '780px', flex: 'none', padding: '24px 28px 18px' } },
    el('h2', {}, 'R-multiple distribution'),
    el('div', { style: { flex: '1', minHeight: 0, marginTop: '20px', display: 'flex', alignItems: 'flex-end', gap: '14px' } },
      ...dist.map(d => el('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '9px' } },
        el('span', { class: 'm', style: { fontSize: '11px', color: d.count ? 'var(--ink)' : 'var(--grey-5)' } }, String(d.count)),
        el('div', { class: 'col-fill', style: { width: '100%', height: Math.max(3, d.count / peak * 200) + 'px', borderRadius: '5px 5px 2px 2px',
          background: d.count === 0 ? 'var(--grey-9)' : d.sign === 'win' ? 'var(--green)' : d.sign === 'loss' ? 'var(--orange)' : 'var(--grey-4)' } })))),
    el('div', { style: { display: 'flex', gap: '14px', paddingTop: '10px', borderTop: '1px solid var(--grey-7)', marginTop: '10px' } },
      ...dist.map(d => el('span', { class: 'm', style: { flex: '1', textAlign: 'center', fontSize: '11px', color: 'var(--grey-5)' } }, d.key))),
  );

  const row = (k, v) => el('div', { style: { display: 'flex', alignItems: 'baseline' } },
    el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-6)' } }, k),
    el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px', color: 'var(--grey-8)' } }, v));

  const expectancy = el('div', { class: 'card light', style: { flex: '1', minWidth: 0 } },
    el('div', { class: 'eyebrow' }, 'Expectancy'),
    el('div', { class: 'kpi-val', style: { marginTop: '14px' } }, f(s.expectancy, s.expectancyR)),
    el('div', { class: 'm', style: { marginTop: '8px', fontSize: '11.5px', color: 'var(--grey-6)' } }, 'per trade'),
    el('div', { style: { marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' } },
      row('Average win', s.avgWin == null ? '—' : `${f(s.avgWin, s.avgWinR)}  ×${s.wins}`),
      row('Average loss', s.avgLoss == null ? '—' : `${f(-s.avgLoss, s.avgLossR == null ? null : -s.avgLossR)}  ×${s.losses}`),
      row('Break-even', String(s.breakevens)),
      row('Payoff ratio', s.payoff == null ? '—' : s.payoff.toFixed(2) + ' : 1'),
      row('Profit factor', (s.profitFactor == null || !isFinite(s.profitFactor)) ? '—' : s.profitFactor.toFixed(2)),
      row('Average R', c.rFmt(s.avgR)),
      row('Break even at', s.breakEvenWinRate == null ? '—' : c.pct(s.breakEvenWinRate) + ' win rate')),
  );

  const setups = groupBy(acct, trades, t => t.setupId || '_none',
    t => store.playbook.setups.find(x => x.id === t.setupId)?.name || 'No setup');
  const pairs = groupBy(acct, trades, t => (t.pair || '—').toUpperCase(), (t, k) => k);

  const bySetup = el('div', { class: 'card', style: { width: '588px', flex: 'none' } },
    el('h2', {}, 'By setup'),
    barList(setups, ctx, { showRate: true }));

  const byPair = el('div', { class: 'card', style: { flex: '1', minWidth: 0 } },
    el('h2', {}, 'By instrument'),
    barList(pairs, ctx));

  return el('div', { class: 'view' },
    el('section', { class: 'row', style: { height: '380px', flex: 'none' } }, chart, expectancy),
    el('section', { class: 'row', style: { flex: '1', alignItems: 'flex-start', minHeight: 0, overflowY: 'auto' } }, bySetup, byPair));
}

/* ============================================================
   Timing — when you make it
   ============================================================ */
function timing(store, acct, trades, ctx) {
  const { unit: u, cur } = ctx;
  const f = (d, r, o) => c.fig(u, acct, d, r, o);
  // two-hour buckets on the open time
  const buckets = [];
  for (let h = 0; h < 24; h += 2) buckets.push({ h, label: `${String(h).padStart(2, '0')}–${String((h + 2) % 24).padStart(2, '0')}`, net: 0, count: 0 });
  for (const t of trades) {
    if (!t.timeOpen) continue;
    const h = Number(t.timeOpen.split(':')[0]);
    const b = buckets[Math.floor(h / 2)];
    if (b) { b.net += Number(t.netResult) || 0; b.count += 1; }
  }
  const active = buckets.filter(b => b.count);
  const shown = active.length ? buckets.slice(
    Math.max(0, Math.floor(buckets.indexOf(active[0]))),
    Math.min(buckets.length, buckets.indexOf(active[active.length - 1]) + 1)) : buckets.slice(3, 12);

  const untimed = trades.filter(t => !t.timeOpen).length;

  const hourCard = el('section', { class: 'card', style: { flex: 'none', padding: '24px 26px 20px' } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '12px' } },
      el('h2', {}, 'Net P&L by hour opened'),
      el('span', { class: 'note' }, 'two-hour buckets'),
      el('span', { class: 'spacer' }),
      el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
        el('span', { style: { width: '12px', height: '9px', borderRadius: '2px', background: 'var(--green)' } }),
        el('span', { class: 'note' }, 'profit')),
      el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '12px' } },
        el('span', { style: { width: '12px', height: '9px', borderRadius: '2px', background: 'var(--orange)' } }),
        el('span', { class: 'note' }, 'loss'))),
    el('div', { style: { marginTop: '10px' } }, divergingColumns(shown, ctx)),
    untimed ? el('div', { class: 'm', style: { marginTop: '6px', fontSize: '10.5px', color: 'var(--grey-5)' } },
      `${untimed} without an open time`) : null,
  );

  const sessions = groupBy(acct, trades, t => t.sessionId || '_out',
    t => c.sessionLabel(store.playbook, t.sessionId));

  const DAYNAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const byDay = groupBy(acct, trades, t => (new Date(t.date + 'T00:00:00').getDay() + 6) % 7,
    (t, k) => DAYNAMES[k]).sort((a, b) => a.key - b.key);

  // trades per day, and what each day size is worth
  const perDay = new Map();
  for (const t of trades) {
    const cur2 = perDay.get(t.date) || { net: 0, count: 0, r: 0, rKnown: true };
    cur2.net += Number(t.netResult) || 0; cur2.count += 1;
    const r = c.rMultiple(acct, t);
    if (r != null && isFinite(r)) cur2.r += r; else cur2.rKnown = false;
    perDay.set(t.date, cur2);
  }
  const sizes = new Map();
  for (const v of perDay.values()) {
    const g = sizes.get(v.count) || { count: v.count, days: 0, net: 0, r: 0, rKnown: true };
    g.days += 1; g.net += v.net; g.r += v.r; if (!v.rKnown) g.rKnown = false;
    sizes.set(v.count, g);
  }
  const sizeRows = [...sizes.values()].sort((a, b) => a.count - b.count)
    .map(g => ({ ...g, avg: g.net / g.days, avgR: g.rKnown ? g.r / g.days : null }));
  const sizeVal = g => c.figValue(u, acct, g.avg, g.avgR) ?? 0;
  const sizePeak = Math.max(1, ...sizeRows.map(g => Math.abs(sizeVal(g))));

  const perDayCard = el('div', { class: 'card light', style: { flex: '1', minWidth: 0 } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } },
      el('h2', {}, 'Trades per day'),
      el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-6)' } }, `${perDay.size} day${perDay.size === 1 ? '' : 's'}`)),
    el('div', { style: { marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '12px' } },
      ...sizeRows.map(g => el('div', {},
        el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: '6px' } },
          el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-8)' } }, `${g.count} trade${g.count === 1 ? '' : 's'}`),
          el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-6)', marginLeft: '8px' } }, `${g.days} day${g.days === 1 ? '' : 's'}`),
          el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12px', color: g.avg >= 0 ? 'var(--grey-8)' : '#A33A2B' } },
            f(g.avg, g.avgR, { decimals: 0, rDecimals: 1 }) + ' avg')),
        el('div', { style: { height: '8px', borderRadius: '4px', background: 'var(--grey-1_7)', overflow: 'hidden' } },
          el('div', { class: 'bar-fill', style: { width: (Math.abs(sizeVal(g)) / sizePeak * 100) + '%', height: '100%', borderRadius: '4px',
            background: sizeVal(g) >= 0 ? 'var(--green)' : 'var(--orange)' } }))))),

  );

  return el('div', { class: 'view' }, hourCard,
    el('section', { class: 'row', style: { flex: '1', alignItems: 'flex-start', minHeight: 0, overflowY: 'auto' } },
      el('div', { class: 'card', style: { flex: '1', minWidth: 0 } },
        el('h2', {}, 'By session'),
        barList(sessions, ctx)),
      el('div', { class: 'card', style: { flex: '1', minWidth: 0 } },
        el('h2', {}, 'By day of week'),
        barList(byDay, ctx)),
      perDayCard));
}

/* ============================================================
   Discipline — did you follow your own rules
   ============================================================ */
function discipline(store, acct, trades, ctx) {
  const { unit: u, cur } = ctx;
  const f = (d, r, o) => c.fig(u, acct, d, r, o);
  const rules = store.playbook.rules || {};
  const maxPerDay = Number(rules.maxTradesPerDay) || null;
  const riskCap = Number(acct.defaultRiskPercent) || null;

  const perDay = new Map();
  for (const t of trades) perDay.set(t.date, (perDay.get(t.date) || 0) + 1);
  const overDays = [...perDay.entries()].filter(([, n]) => maxPerDay && n > maxPerDay);

  const overRisk = trades.filter(t => riskCap && Number(t.riskPercent) > riskCap + 1e-9);
  const overRiskNet = overRisk.reduce((s, t) => s + (Number(t.netResult) || 0), 0);
  const overRiskR = c.summarise(acct, overRisk).netR;

  const outside = trades.filter(t => !t.sessionId);
  const outsideNet = outside.reduce((s, t) => s + (Number(t.netResult) || 0), 0);
  const outsideR = c.summarise(acct, outside).netR;

  const tagCounts = new Map();
  const allTags = store.playbook.tagGroups.flatMap(g => g.tags);
  for (const t of trades) for (const id of (t.tagIds || [])) {
    const g = tagCounts.get(id) || { id, count: 0, net: 0, r: 0, rKnown: true };
    g.count += 1; g.net += Number(t.netResult) || 0;
    const tr = c.rMultiple(acct, t);
    if (tr != null && isFinite(tr)) g.r += tr; else g.rKnown = false;
    tagCounts.set(id, g);
  }
  for (const g of tagCounts.values()) if (!g.rKnown) g.r = null;
  const tagRows = [...tagCounts.values()]
    .map(g => ({ ...g, label: allTags.find(t => t.id === g.id)?.name || '—' }))
    .sort((a, b) => a.net - b.net);

  const stat = (label, value, sub, tone) => el('div', { class: 'card', style: { padding: '26px 26px 24px' } },
    el('div', { class: 'eyebrow' }, label),
    el('div', { class: 'kpi-val', style: { marginTop: 'auto', color: tone || 'var(--ink)' } }, value),
    el('div', { class: 'm', style: { marginTop: '11px', fontSize: '10.5px', color: 'var(--grey-5)' } }, sub));

  const followed = trades.length - new Set([
    ...overRisk.map(t => t.id),
    ...trades.filter(t => overDays.some(([d]) => d === t.date)).map(t => t.id),
  ]).size;

  return el('div', { class: 'view' },
    el('section', { class: 'grid4', style: { height: '160px', flex: 'none' } },
      stat('Rules followed', `${followed} / ${trades.length}`, 'risk cap and trades per day'),
      stat('Over your risk cap', String(overRisk.length),
        riskCap ? `cap is ${riskCap.toFixed(2)}% · those trades netted ${f(overRiskNet, overRiskR, { decimals: 0, rDecimals: 1 })}` : 'no cap set',
        overRisk.length ? 'var(--yellow)' : 'var(--ink)'),
      stat('Days over the limit', String(overDays.length),
        maxPerDay ? `your limit is ${maxPerDay} a day` : 'no limit set',
        overDays.length ? 'var(--yellow)' : 'var(--ink)'),
      stat('Outside killzones', String(outside.length),
        `those trades netted ${f(outsideNet, outsideR, { decimals: 0, rDecimals: 1 })}`,
        outside.length ? 'var(--blue-surface)' : 'var(--ink)'),
    ),
    el('section', { class: 'row', style: { flex: '1', minHeight: 0 } },
      el('div', { class: 'card', style: { flex: '1', minWidth: 0 } },
        el('h2', {}, 'By tag'),
        barList(tagRows.map(t => ({ ...t, wins: 0, losses: 0 })), ctx)),
      afterLossCard(acct, trades, ctx))
  );
}


/* ============================================================
   After a loss

   What the next trade did. The comparison against your own baseline is the
   whole point: a −0.2R average after a loss only means something next to what
   an average trade is worth to you.
   ============================================================ */
function afterLossCard(acct, trades, ctx) {
  const { unit: u, cur } = ctx;
  const f = (d, r, o) => c.fig(u, acct, d, r, o);
  const a = c.afterLoss(acct, trades);

  const row = (k, v, tone, note) => el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } },
    el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-6)' } }, k),
    note ? el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } }, note) : null,
    el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px', color: tone || 'var(--grey-8)' } }, v));

  const per = s => s.count ? f(s.expectancy, s.expectancyR, { rDecimals: 2 }) : '—';
  const tone = s => !s.count ? 'var(--grey-6)'
    : s.expectancy > 0 ? '#0F6B40' : s.expectancy < 0 ? '#A33A2B' : 'var(--grey-8)';
  const rate = s => (s.wins + s.losses) ? Math.round(s.wins / (s.wins + s.losses) * 100) + '%' : '—';

  // Only worth saying when there is enough to say it about.
  const enough = a.next.count >= 5 && a.all.count >= 10;
  const gap = enough && a.next.expectancy != null && a.all.expectancy != null
    ? a.next.expectancy - a.all.expectancy : null;

  return el('div', { class: 'card light', style: { width: '408px', flex: 'none' } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } },
      el('h2', {}, 'After a loss'),
      el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-6)' } },
        `${a.next.count} trade${a.next.count === 1 ? '' : 's'}`)),

    el('div', { class: 'kpi-val', style: { marginTop: '16px', color: tone(a.next) } }, per(a.next)),
    el('div', { class: 'm', style: { marginTop: '8px', fontSize: '11.5px', color: 'var(--grey-6)' } },
      a.next.count ? `each · your average trade is ${per(a.all)}` : 'nothing has followed a loss yet'),

    el('div', { style: { marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' } },
      row('Win rate after a loss', rate(a.next), null, `${rate(a.all)} overall`),
      row(`Re-entered inside ${a.windowMins}m`, String(a.quick.count),
        a.quick.count ? tone(a.quick) : null,
        a.quick.count ? f(a.quick.net, a.quick.netR, { decimals: 0, rDecimals: 1 }) : null),
      row('Sized up after a loss', a.sizedUpOf ? `${a.sizedUp} / ${a.sizedUpOf}` : '—',
        a.sizedUp ? 'var(--orange)' : null),
      row('Longest losing run', a.worstStreak ? `${a.worstStreak} trade${a.worstStreak === 1 ? '' : 's'}` : '—'),
    ),

    el('div', { style: { marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--grey-2)',
                         fontSize: '12px', lineHeight: 1.55, color: 'var(--grey-6)' } },
      ...(!enough
        ? [`Needs a few more trades after a loss before the comparison means anything — ${a.next.count} so far.`]
        : gap < 0
          ? ['Your next trade after a loss is worth ',
             el('span', { class: 'm', style: { color: '#A33A2B' } }, f(Math.abs(gap), null, { sign: false })),
             ' less than your average one.']
          : gap > 0
            ? ['You trade no worse after a loss — the next one is worth ',
               el('span', { class: 'm', style: { color: '#0F6B40' } }, f(gap, null, { sign: false })),
               ' more than your average.']
            : ['A loss does not change what your next trade is worth.'])),
  );
}
