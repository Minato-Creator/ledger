import { el, svg, icon } from '../ui.js';
import * as c from '../calc.js';

let tab = 'overview';       // overview | timing | discipline | year
let year = null;            // resolved on first paint to the latest year traded
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

/* ---------- a diverging column chart, used for hour of day ----------

   Two things it has to get right that the obvious version gets wrong.

   The baseline is placed by the data, not fixed. A day of small wins and one
   large loss is a real shape, and pinning the zero line to the middle either
   crushes the losses into a stub or wastes half the panel. The gains and the
   losses share the panel in proportion to how big they actually are.

   And a value never lands on a label. A loss reads below its own column, an
   hour reads below the axis, and the two used to meet in the middle. The rows
   are now allotted their own space and the value is clamped out of them. */
/**
 * Net result per time bucket, above and below a shared baseline.
 *
 * Drawn at the size it is displayed at. It used to be drawn on a fixed
 * 1120-unit canvas and stretched to fit the card, which on a wide window
 * scaled everything by about half again — a 13px label came out near 19px and
 * the bars turned into slabs. One SVG unit is one CSS pixel here, so a size
 * written in this function is the size on the glass.
 */
function divergingColumns(buckets, ctx, { width = 1120, height = 236 } = {}) {
  const { unit: u, account: acct } = ctx;
  const val = b => c.figValue(u, acct, b.net, b.r) ?? 0;
  const g = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: '100%',
                         style: 'display:block' });

  const plotTop = 10, plotBottom = height - 52;  // everything below this belongs to the labels
  const HOUR_Y = height - 28, COUNT_Y = height - 11;
  const values = buckets.map(val);
  const maxUp = Math.max(0, ...values);
  const maxDown = Math.max(0, ...values.map(v => -v));
  const span = plotBottom - plotTop;

  /* Whichever side exists gets room in proportion to its size, with a floor so
     one small loss among big wins is still a visible mark rather than a line. */
  let upRoom;
  if (!maxDown) upRoom = span;
  else if (!maxUp) upRoom = 0;
  else upRoom = Math.min(span - 34, Math.max(34, span * (maxUp / (maxUp + maxDown))));
  const baseline = plotTop + upRoom;

  const x0 = 18, plotSpan = width - x0 - 12;
  const gap = plotSpan / buckets.length;
  /* Thin marks. A column is a quantity, not a panel — capped so a chart with
     three busy hours in it does not turn them into slabs. */
  const bw = Math.min(46, gap * .52);

  g.append(svg('line', { x1: x0, y1: plotTop, x2: width - 12, y2: plotTop, stroke: 'var(--grey-9)', 'stroke-width': 1 }));
  g.append(svg('line', { x1: x0, y1: baseline, x2: width - 12, y2: baseline, stroke: 'var(--grey-7)', 'stroke-width': 1 }));

  /* Every figure is written outside its column, the same rule the year chart
     follows and for the same reason: a number printed inside a bar has to fit
     inside a bar, and "−$2,390" does not fit in a 46px mark. The bands are
     shortened by a line's height so a label always has somewhere to go. */
  const LABEL = 15;
  const upBand = Math.max(4, (baseline - plotTop) - LABEL);
  const downBand = Math.max(4, (plotBottom - baseline) - LABEL);

  buckets.forEach((b, i) => {
    const v = val(b);
    const cx = x0 + gap * i + gap / 2;
    const up = v >= 0;
    const band = up ? upBand : downBand;
    const h = v === 0 ? 2 : Math.max(3, Math.abs(v) / (up ? maxUp : maxDown) * band);
    const top = up ? baseline - h : baseline;

    g.append(svg('rect', { class: 'col-fill-svg', x: cx - bw / 2, y: top, width: bw, height: h, rx: 4,
                           fill: v === 0 ? 'var(--grey-6)' : up ? 'var(--profit)' : 'var(--loss)' }));

    if (b.count) {
      const y = up ? top - 6 : top + h + 13;
      g.append(svg('text', { x: cx, y, 'text-anchor': 'middle', 'font-family': 'var(--mono)',
                             'font-size': 11, fill: v === 0 ? 'var(--grey-4)' : up ? 'var(--profit)' : 'var(--loss)' },
                   c.fig(u, acct, b.net, b.r, { decimals: 0, rDecimals: 1 })));
    }

    /* The hour always; the count only where there is one, so an empty stretch
       of the day reads as empty rather than as a row of zeroes. */
    g.append(svg('text', { x: cx, y: HOUR_Y, 'text-anchor': 'middle', 'font-family': 'var(--mono)',
                           'font-size': 10.5, fill: b.count ? 'var(--grey-4)' : 'var(--grey-6)' }, b.label));
    if (b.count) g.append(svg('text', { x: cx, y: COUNT_Y, 'text-anchor': 'middle', 'font-family': 'var(--mono)',
                           'font-size': 9.5, fill: 'var(--grey-6)' }, String(b.count)));
  });
  return g;
}

/* ============================================================
   A rule, and every time you met it or did not

   One measure against one threshold. The threshold is the point of the
   chart, so it is a line across the whole plot rather than a number in a
   caption, and a column that crosses it changes colour — the only place in
   Quire where a bar is coloured by a rule rather than by profit, because
   here the rule IS the subject.

   Bars are thin and evenly spaced whatever the count, so twelve trades and
   two hundred look like the same chart at different densities.
   ============================================================ */
function thresholdColumns(rows, { cap, capLabel, fmt, width, height, emptyText }) {
  const g = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: '100%',
                         style: 'display:block' });
  const padL = 34, padR = 12, padT = 16, padB = 26;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const base = padT + plotH;

  g.append(svg('line', { x1: padL, y1: base, x2: width - padR, y2: base,
                         stroke: 'var(--grey-7)', 'stroke-width': 1 }));

  if (!rows.length) {
    g.append(svg('text', { x: width / 2, y: padT + plotH / 2, 'text-anchor': 'middle',
      'font-family': 'var(--mono)', 'font-size': 11.5, fill: 'var(--grey-6)' }, emptyText || 'Nothing to show yet'));
    return g;
  }

  /* The top of the chart clears both the tallest column and the line, so a
     cap nobody has gone near is still visible rather than pinned to the top
     edge, and a breach is still inside the plot. */
  const peak = Math.max(...rows.map(r => r.value), cap || 0) * 1.18 || 1;
  const y = v => base - (v / peak) * plotH;

  // a quiet grid at the halfway mark, and the numbers that name both lines
  for (const v of [peak / 2]) {
    g.append(svg('line', { x1: padL, y1: y(v), x2: width - padR, y2: y(v),
                           stroke: 'var(--grey-9)', 'stroke-width': 1 }));
    g.append(svg('text', { x: padL - 7, y: y(v) + 3.5, 'text-anchor': 'end', 'font-family': 'var(--mono)',
                           'font-size': 9.5, fill: 'var(--grey-6)' }, fmt(v)));
  }

  const step = plotW / rows.length;
  const bw = Math.max(2, Math.min(22, step * 0.58));

  rows.forEach((r, i) => {
    const cx = padL + step * i + step / 2;
    const h = Math.max(2, (r.value / peak) * plotH);
    g.append(svg('rect', { x: cx - bw / 2, y: base - h, width: bw, height: h, rx: Math.min(3, bw / 2),
                           fill: r.over ? 'var(--yellow)' : 'var(--grey-5)' }));
  });

  /* The line last, so it reads over the columns it is judging. */
  if (cap) {
    g.append(svg('line', { x1: padL, y1: y(cap), x2: width - padR, y2: y(cap),
                           stroke: 'var(--blue-surface)', 'stroke-width': 1.25, 'stroke-dasharray': '4 4' }));
    g.append(svg('text', { x: width - padR, y: y(cap) - 6, 'text-anchor': 'end', 'font-family': 'var(--mono)',
                           'font-size': 9.5, fill: 'var(--blue-surface)' }, capLabel));
  }

  /* Only the ends are labelled. A date under every column is a wall of text
     nobody reads, and the span is what you actually want to know. */
  if (rows[0].label) {
    g.append(svg('text', { x: padL, y: height - 8, 'text-anchor': 'start', 'font-family': 'var(--mono)',
                           'font-size': 9.5, fill: 'var(--grey-6)' }, rows[0].label));
    if (rows.length > 1) g.append(svg('text', { x: width - padR, y: height - 8, 'text-anchor': 'end',
                           'font-family': 'var(--mono)', 'font-size': 9.5, fill: 'var(--grey-6)' },
                           rows[rows.length - 1].label));
  }
  return g;
}

export function analytics(store, nav) {
  const acct = store.activeAccount;
  const cur = acct.currency;
  const all = store.tradesFor(acct.id);

  /* The year reads a whole year by definition, so the rolling window has
     nothing to say on that tab and its own year control takes the slot. */
  const isYear = tab === 'year';
  const trades = isYear ? all : withinPeriod(all);
  const s = c.summarise(acct, trades);

  const years = [...new Set(all.map(t => String(t.date).slice(0, 4)))].filter(Boolean).sort();
  const thisYear = String(new Date().getFullYear());
  if (year == null || (years.length && !years.includes(year) && year !== thisYear)) {
    year = years.length ? years[years.length - 1] : thisYear;
  }
  const stepYear = (delta) => {
    const n = String(Number(year) + delta);
    if (Number(n) < 2000 || Number(n) > Number(thisYear) + 1) return;
    year = n; nav.refresh();
  };

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Analytics'),
    el('div', { class: 'seg', style: { marginLeft: '6px' } },
      ...[['overview', 'Overview'], ['tags', 'Tags'], ['timing', 'Timing'], ['discipline', 'Discipline'], ['year', 'Year']].map(([k, label]) =>
        el('button', { class: k === tab ? 'is-on' : '', onClick: () => { tab = k; nav.refresh(); } }, label))),
    el('span', { class: 'sub' }, isYear
      ? `${all.filter(t => String(t.date).startsWith(year)).length} closed in ${year}`
      : `${trades.length} closed trade${trades.length === 1 ? '' : 's'}`),
    el('div', { class: 'spacer' }),
    isYear
      ? el('div', { class: 'stepper' },
          el('button', { onClick: () => stepYear(-1) }, icon('chevleft', 12, 'var(--grey-2)', 2.4)),
          el('span', { class: 'val', style: { minWidth: '52px' } }, year),
          el('button', { onClick: () => stepYear(1) }, icon('chevright', 12, 'var(--grey-2)', 2.4)))
      : el('div', { class: 'seg' },
          ...Object.keys(DAYS).map(k => el('button', { class: k === period ? 'is-on' : '',
            onClick: () => { period = k; nav.refresh(); } }, k))),
  );

  if (!trades.length) {
    return el('div', { class: 'view' }, head,
      el('div', { class: 'card', style: { flex: '1' } },
        el('div', { class: 'empty' },
          icon('analytics', 34, 'var(--grey-6)', 1.4),
          el('h2', { style: { fontSize: '16px' } }, isYear ? 'Nothing logged yet' : 'Nothing in this window'),
          el('p', {}, isYear ? 'A year fills in as you trade it.' : 'Log some trades, or widen the period.'))));
  }

  const ctx = { unit: store.displayUnit, account: acct, cur, nav };
  const body = tab === 'overview' ? overview(store, acct, trades, s, ctx)
             : tab === 'tags'     ? tagsTab(store, acct, trades, s, ctx)
             : tab === 'timing'   ? timing(store, acct, trades, ctx)
             : tab === 'year'     ? yearly(store, acct, all, ctx)
             :                      discipline(store, acct, trades, ctx);
  return el('div', { class: 'view' }, head, body);
}

/* ============================================================
   Overview — where your outcomes land, and what earns
   ============================================================ */
/* Tags, rolled up. Lives out here because the page that shows them and the
   page that counts rule-breaks both need the same numbers. */
function tagRollup(store, acct, trades) {
  const counts = new Map();
  const allTags = store.playbook.tagGroups.flatMap(g => g.tags);
  for (const t of trades) for (const id of (t.tagIds || [])) {
    const g = counts.get(id) || { id, count: 0, net: 0, r: 0, rKnown: true };
    g.count += 1; g.net += Number(t.netResult) || 0;
    const tr = c.rMultiple(acct, t);
    if (tr != null && isFinite(tr)) g.r += tr; else g.rKnown = false;
    counts.set(id, g);
  }
  for (const g of counts.values()) if (!g.rKnown) g.r = null;
  return [...counts.values()]
    .map(g => ({ ...g, label: allTags.find(t => t.id === g.id)?.name || '—', wins: 0, losses: 0 }))
    .sort((a, b) => a.net - b.net);
}

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

  const bySetup = el('div', { class: 'card', style: { flex: '1', minWidth: 0 } },
    el('h2', {}, 'By setup'),
    barList(setups, ctx, { showRate: true }));

  const byPair = el('div', { class: 'card', style: { flex: '1', minWidth: 0 } },
    el('h2', {}, 'By instrument'),
    barList(pairs, ctx));

  /* Tags used to sit here beside setups and instruments. They have a page of
     their own now: one bar each was the shallowest possible reading of them,
     and the question they answer — which kinds of trade actually pay — needs
     a win rate, a sample size and an expectancy, not a length. */
  return el('div', { class: 'view' },
    el('section', { class: 'row', style: { height: '380px', flex: 'none' } }, chart, expectancy),
    el('section', { class: 'row', style: { flex: '1', alignItems: 'flex-start', minHeight: 0, overflowY: 'auto' } },
      bySetup, byPair));
}

/* ============================================================
   Tags — which kinds of trade actually pay

   The page you come to looking for an edge, so it is built to make a false
   one hard to believe:

   • Win rate alone is not an edge. A tag that wins 70% of the time on a
     payoff of 0.3 loses money, so every row carries its expectancy in R
     beside its win rate, and the two are read together.

   • A sample of one is not evidence. Anything under the threshold is dimmed
     and kept out of the tiles at the top — shown, because hiding your own
     data is worse, but never allowed to look like a finding.

   • A number needs something to be better than. Each tag is set against your
     own win rate over the same window, in points, so "62%" becomes "eight
     points better than you usually do" or "two points worse".

   A trade carries several tags at once, so the groups do not add up to the
   account and are not meant to. That is said on the page rather than left to
   be discovered.
   ============================================================ */
let tagSort = 'edge';
/* Five is where a run of trades starts to be worth reading. It is a control
   rather than a rule — some groups fill up slowly — but the page should not
   open by calling three wins in a row an edge. */
let tagMin = 5;

const TAG_SORTS = [
  ['edge',  'Expectancy'],
  ['win',   'Win rate'],
  ['count', 'Trades'],
  ['total', 'Total R'],
  ['name',  'Name'],
];

/** One horizontal bar of wins, losses and break-evens, in that order. */
function splitBar(st) {
  const total = st.wins + st.losses + st.breakevens;
  if (!total) return el('span', { class: 'tg-split' });
  const seg = (n, cls) => n
    ? el('span', { class: 'tg-seg ' + cls, style: { flex: String(n) } })
    : null;
  return el('span', { class: 'tg-split',
    title: `${st.wins} won · ${st.losses} lost · ${st.breakevens} break-even` },
    seg(st.wins, 'is-win'), seg(st.losses, 'is-loss'), seg(st.breakevens, 'is-flat'));
}

function tagsTab(store, acct, trades, s, ctx) {
  const { nav } = ctx;
  const groups = store.playbook.tagGroups || [];

  /* Which trades carry each tag, walked once. */
  const held = new Map();
  for (const t of trades) {
    for (const id of (t.tagIds || [])) {
      if (!held.has(id)) held.set(id, []);
      held.get(id).push(t);
    }
  }
  const tagged = trades.filter(t => (t.tagIds || []).length).length;
  const baseline = s.winRate;

  /* Every tag that has been used, with its own numbers worked out by the same
     function the whole app reads its figures from. */
  const rowsFor = (group) => group.tags
    .map(tag => {
      const mine = held.get(tag.id) || [];
      if (!mine.length) return null;
      const st = c.summarise(acct, mine);
      return {
        id: tag.id, name: tag.name, n: mine.length, st,
        win: st.winRate, edge: st.expectancyR, total: st.netR,
        thin: mine.length < tagMin,
        delta: (st.winRate != null && baseline != null) ? (st.winRate - baseline) * 100 : null,
      };
    })
    .filter(Boolean);

  const order = (a, b) => {
    const nul = v => (v == null ? -Infinity : v);
    if (tagSort === 'name') return a.name.localeCompare(b.name);
    if (tagSort === 'count') return b.n - a.n;
    if (tagSort === 'win') return nul(b.win) - nul(a.win);
    if (tagSort === 'total') return nul(b.total) - nul(a.total);
    return nul(b.edge) - nul(a.edge);
  };

  const sections = groups.map(g => {
    const rows = rowsFor(g).sort(order);
    const usedIn = trades.filter(t => (t.tagIds || []).some(id => g.tags.some(x => x.id === id)));
    const gs = usedIn.length ? c.summarise(acct, usedIn) : null;
    const unused = g.tags.filter(tag => !held.has(tag.id));
    /* Best by win rate, of the ones with enough behind them to mean anything. */
    const best = rows.filter(r => !r.thin && r.win != null)
      .sort((a, b) => b.win - a.win || b.n - a.n)[0] || null;
    return { g, rows, gs, unused, best, usedIn };
  });

  /* ---------- the tiles ----------
     One per group: the tag that wins most often, of those with enough trades
     behind them. A group with nothing that qualifies says so rather than
     promoting its best guess. */
  const tiles = el('div', { class: 'tg-tiles' },
    ...sections.map(({ g, best, rows }) =>
      el('div', { class: 'tg-tile' + (best ? '' : ' is-quiet') },
        el('span', { class: 'lbl' }, g.name),
        best
          ? el('span', { class: 'tg-tile-body' },
              el('span', { class: 'v' }, c.pct(best.win, 0)),
              el('span', { class: 'n' }, best.name))
          : el('span', { class: 'tg-tile-body' },
              el('span', { class: 'v is-none' }, '—'),
              el('span', { class: 'n' }, rows.length ? `none with ${tagMin}+ trades` : 'not used yet')),
        best ? el('span', { class: 'c' }, `${best.n} trade${best.n === 1 ? '' : 's'}`) : null)));

  /* ---------- the controls ---------- */
  const controls = el('div', { class: 'tg-controls' },
    el('span', { class: 'm lbl' }, 'Sort'),
    el('div', { class: 'seg' },
      ...TAG_SORTS.map(([k, label]) => el('button', { class: k === tagSort ? 'is-on' : '',
        onClick: () => { if (tagSort === k) return; tagSort = k; nav.refresh(); } }, label))),
    el('span', { class: 'm lbl', style: { marginLeft: '10px' },
      title: 'Tags with fewer trades than this are dimmed and left out of the tiles above' }, 'Enough to count'),
    el('div', { class: 'stepper' },
      el('button', { onClick: () => { tagMin = Math.max(1, tagMin - 1); nav.refresh(); } },
        icon('minus', 11, 'var(--grey-2)', 2.6)),
      el('span', { class: 'val' }, `${tagMin}+`),
      el('button', { onClick: () => { tagMin = Math.min(50, tagMin + 1); nav.refresh(); } },
        icon('plus', 11, 'var(--grey-2)', 2.6))),
    el('div', { class: 'spacer', style: { flex: '1' } }),
    /* One legend for every split bar on the page, rather than one each. */
    el('span', { class: 'tg-key' },
      el('span', { class: 'k is-win' }), 'won',
      el('span', { class: 'k is-loss' }), 'lost',
      el('span', { class: 'k is-flat' }), 'break-even'));

  const COLS = 'minmax(0,1fr) 54px 92px 72px 62px 78px 78px';

  const groupCard = ({ g, rows, gs, unused, usedIn }) => el('section', { class: 'card tg-group' },
    el('div', { class: 'tg-group-head' },
      el('h2', {}, g.name),
      el('span', { class: 'note' },
        `${rows.length} of ${g.tags.length} tag${g.tags.length === 1 ? '' : 's'} used`),
      el('div', { class: 'spacer', style: { flex: '1' } }),
      gs ? el('span', { class: 'm tg-group-sum' },
            `${usedIn.length} trade${usedIn.length === 1 ? '' : 's'}`,
            gs.winRate != null ? el('span', { class: 'sep' }, '·') : null,
            gs.winRate != null ? `${c.pct(gs.winRate, 0)} won` : null,
            gs.expectancyR != null ? el('span', { class: 'sep' }, '·') : null,
            gs.expectancyR != null ? `${c.rFmt(gs.expectancyR)} a trade` : null)
        : null),

    rows.length
      ? el('div', { class: 'tbl tg-tbl' },
          el('div', { class: 'tbl-head', style: { gridTemplateColumns: COLS } },
            el('span', {}, 'Tag'),
            el('span', { style: { textAlign: 'right' } }, 'Trades'),
            el('span', {}, 'W / L / BE'),
            el('span', { style: { textAlign: 'right' } }, 'Win rate'),
            el('span', { style: { textAlign: 'right' }, title: 'Against your own win rate over the same window, in points' }, 'vs you'),
            el('span', { style: { textAlign: 'right' }, title: 'Average R per trade carrying this tag — the number an edge actually lives in' }, 'Per trade'),
            el('span', { style: { textAlign: 'right' } }, 'Total R')),
          el('div', { class: 'tbl-body' },
            ...rows.map(r => el('div', { class: 'tbl-row tg-row' + (r.thin ? ' is-thin' : ''),
              style: { gridTemplateColumns: COLS },
              title: r.thin ? `Only ${r.n} trade${r.n === 1 ? '' : 's'} — too few to read anything into` : '' },
              el('span', { class: 'tg-name' }, r.name,
                r.thin ? el('span', { class: 'tg-thin' }, 'thin') : null),
              el('span', { class: 'num' }, String(r.n)),
              splitBar(r.st),
              el('span', { class: 'num' }, r.win == null ? '—' : c.pct(r.win, 0)),
              el('span', { class: 'num', style: { color: r.delta == null ? 'var(--ink-4)'
                : r.delta > 0.5 ? 'var(--profit)' : r.delta < -0.5 ? 'var(--loss)' : 'var(--ink-4)' } },
                r.delta == null ? '—' : `${r.delta > 0 ? '+' : r.delta < 0 ? '−' : ''}${Math.abs(r.delta).toFixed(0)}`),
              el('span', { class: 'num', style: { color: r.edge == null ? 'var(--ink-4)'
                : r.edge > 0 ? 'var(--profit)' : r.edge < 0 ? 'var(--loss)' : 'var(--ink-3)' } },
                r.edge == null ? '—' : c.rFmt(r.edge)),
              el('span', { class: 'num', style: { color: r.total == null ? 'var(--ink-4)'
                : r.total > 0 ? 'var(--profit)' : r.total < 0 ? 'var(--loss)' : 'var(--ink-3)' } },
                r.total == null ? '—' : c.rFmt(r.total))))))
      : el('div', { class: 'm tg-none' }, 'Nothing in this group was used in this window.'),

    /* Tags you set up and never reach for are worth knowing about too. */
    unused.length
      ? el('div', { class: 'tg-unused' },
          el('span', { class: 'm t' }, 'Not used here'),
          ...unused.map(tag => el('span', { class: 'tg-unused-tag' }, tag.name)))
      : null);

  if (!groups.length) {
    return el('div', { class: 'view' },
      el('div', { class: 'card', style: { flex: '1' } },
        el('div', { class: 'empty' },
          el('h2', { style: { fontSize: '16px' } }, 'No tag groups yet'),
          el('p', {}, 'Tag groups are set up in the Playbook. Once trades carry tags, this is where they are read.'))));
  }

  return el('div', { class: 'view tg-view' },
    tiles,
    controls,
    el('div', { class: 'tg-scroll' },
      ...sections.map(groupCard),
      el('div', { class: 'm tg-foot' },
        `${tagged} of ${trades.length} trade${trades.length === 1 ? '' : 's'} in this window carry a tag. `,
        'A trade can carry several, so the groups overlap and do not add up to the account.')));
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
    el('div', { style: { marginTop: '10px', height: '236px', display: 'flex' } },
      fitted((w, h) => divergingColumns(shown, ctx, { width: w, height: h }), 236)),
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
          el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12px', color: g.avg >= 0 ? 'var(--grey-8)' : 'var(--neg-light)' } },
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

  const stat = (label, value, sub, tone) => el('div', { class: 'card', style: { padding: '26px 26px 24px' } },
    el('div', { class: 'eyebrow' }, label),
    el('div', { class: 'kpi-val', style: { marginTop: 'auto', color: tone || 'var(--ink)' } }, value),
    el('div', { class: 'm', style: { marginTop: '11px', fontSize: '10.5px', color: 'var(--grey-5)' } }, sub));

  const followed = trades.length - new Set([
    ...overRisk.map(t => t.id),
    ...trades.filter(t => overDays.some(([d]) => d === t.date)).map(t => t.id),
  ]).size;

  /* ---------- risk taken, against the cap ----------
     The stat above counts how many trades went over. This says by how much,
     and whether the ones that did were worth it — a cap you break for your
     best trades is a different problem from one you break on tilt. */
  const risked = trades.map(t => Number(t.riskPercent)).filter(v => v > 0);
  const avgRisk = risked.length ? risked.reduce((a, b) => a + b, 0) / risked.length : null;
  const maxRisk = risked.length ? Math.max(...risked) : null;

  /* ---------- the breaks themselves ----------
     A count tells you there were three. This tells you which three, so the
     next thing you do is open one rather than wonder. */
  const breaks = [];
  for (const t of overRisk) breaks.push({ date: t.date, id: t.id,
    what: `${Number(t.riskPercent).toFixed(2)}% on ${t.pair}`, why: 'over the risk cap',
    net: Number(t.netResult) || 0, r: c.rMultiple(acct, t) });
  for (const [date, n] of overDays) {
    const dayNet = trades.filter(t => t.date === date).reduce((a, t) => a + (Number(t.netResult) || 0), 0);
    const dayR = c.summarise(acct, trades.filter(t => t.date === date)).netR;
    breaks.push({ date, id: null, what: `${n} trades`, why: `limit is ${maxPerDay}`, net: dayNet, r: dayR });
  }
  breaks.sort((a, b) => b.date.localeCompare(a.date));

  /* Tight to its content. It used to carry flex:1 from when it sat in a
     horizontal row, where that meant "share the width"; in a vertical rail
     the same line means "take every pixel nobody else claimed", which is how
     one short sentence ended up in a box the height of the page. */
  const breaksCard = el('div', { class: 'card', style: { flex: 'none', minWidth: 0 } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } },
      el('h2', {}, 'Where the rules went'),
      el('span', { class: 'note' }, breaks.length ? `${breaks.length} break${breaks.length === 1 ? '' : 's'}` : 'clean')),
    breaks.length
      ? el('div', { class: 'risk-list', style: { marginTop: '14px' } },
          ...breaks.slice(0, 9).map(b => el(b.id ? 'button' : 'div', { class: 'break-row',
            onClick: b.id ? () => ctx.nav.go('#/trade/' + b.id) : null },
            el('span', { class: 'm top' },
              el('span', { class: 'd' }, c.shortDate(b.date).replace(/^0/, '')),
              el('span', { class: 'what' }, b.what),
              el('span', { class: 'o', style: { color: b.net > 0 ? 'var(--green)' : b.net < 0 ? 'var(--orange)' : 'var(--grey-4)' } },
                f(b.net, b.r, { decimals: 0, rDecimals: 1 }))),
            el('span', { class: 'm why' }, b.why))))
      : el('div', { style: { marginTop: '18px', display: 'flex', alignItems: 'flex-start', gap: '11px' } },
          el('span', { style: { width: '3px', alignSelf: 'stretch', minHeight: '34px', borderRadius: '2px', background: 'var(--green)' } }),
          el('span', { class: 'm', style: { fontSize: '11.5px', lineHeight: 1.7, color: 'var(--grey-4)' } },
            trades.length
              ? `Every one of these ${trades.length} trades sat inside your own limits.`
              : 'Nothing logged in this window.')));

  /* ---------- the middle: one chart per rule ---------- */
  const seq = trades.slice().sort((a, b) =>
    (a.date + (a.timeOpen || '')).localeCompare(b.date + (b.timeOpen || '')));

  const riskRows = seq.filter(t => Number(t.riskPercent) > 0).map(t => ({
    value: Number(t.riskPercent),
    over: !!(riskCap && Number(t.riskPercent) > riskCap + 1e-9),
    label: c.shortDate(t.date).replace(/^0/, ''),
  }));

  const dayRows = [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, n]) => ({
    value: n,
    over: !!(maxPerDay && n > maxPerDay),
    label: c.shortDate(date).replace(/^0/, ''),
  }));

  const chartCard = (title, note, rows, opts) => el('div', { class: 'card', style: { flex: '1', minHeight: 0,
      display: 'flex', flexDirection: 'column' } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } },
      el('h2', {}, title),
      el('span', { class: 'note' }, note)),
    el('div', { style: { flex: '1', minHeight: '150px', display: 'flex', marginTop: '10px' } },
      fitted((w, h) => thresholdColumns(rows, { ...opts, width: w, height: h }), 150)));

  const middle = el('div', { style: { flex: '1', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' } },
    chartCard('Risk per trade',
      [riskCap ? `cap ${riskCap.toFixed(2)}%` : 'no cap set',
       avgRisk != null ? `avg ${avgRisk.toFixed(2)}%` : null,
       maxRisk != null ? `biggest ${maxRisk.toFixed(2)}%` : null].filter(Boolean).join(' · '),
      riskRows, {
      cap: riskCap, capLabel: riskCap ? `cap ${riskCap.toFixed(2)}%` : '',
      fmt: v => v.toFixed(2) + '%',
      emptyText: 'No risk recorded on these trades' }),
    chartCard('Trades per day', maxPerDay ? `limit ${maxPerDay} a day` : 'no limit set', dayRows, {
      cap: maxPerDay, capLabel: maxPerDay ? `limit ${maxPerDay}` : '',
      fmt: v => String(Math.round(v)),
      emptyText: 'Nothing logged in this window' }),
  );

  const rightRail = el('div', { style: { width: '340px', flex: 'none', display: 'flex',
      flexDirection: 'column', gap: '8px', minHeight: 0, overflowY: 'auto' } },
    afterLossCard(acct, trades, ctx),
    breaksCard);

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
    /* Charts in the middle, the reading down the right. The stats along the
       top say what happened; the charts say when; the rail says what it did
       to you afterwards. */
    el('section', { class: 'row', style: { flex: '1', minHeight: 0 } }, middle, rightRail)
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
    : s.expectancy > 0 ? 'var(--pos-light)' : s.expectancy < 0 ? 'var(--neg-light)' : 'var(--grey-8)';
  const rate = s => (s.wins + s.losses) ? Math.round(s.wins / (s.wins + s.losses) * 100) + '%' : '—';

  // Only worth saying when there is enough to say it about.
  const enough = a.next.count >= 5 && a.all.count >= 10;
  const gap = enough && a.next.expectancy != null && a.all.expectancy != null
    ? a.next.expectancy - a.all.expectancy : null;

  /* Content height, like the card under it. Stretching this one to fill the
     rail only pushed its closing line to the floor and left a hand's width of
     nothing in the middle of it — space inside a card reads as a mistake,
     where space under one reads as a page with room on it. */
  return el('div', { class: 'card light', style: { flex: 'none', minWidth: 0 } },
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
             el('span', { class: 'm', style: { color: 'var(--neg-light)' } }, f(Math.abs(gap), null, { sign: false })),
             ' less than your average one.']
          : gap > 0
            ? ['You trade no worse after a loss — the next one is worth ',
               el('span', { class: 'm', style: { color: 'var(--pos-light)' } }, f(gap, null, { sign: false })),
               ' more than your average.']
            : ['A loss does not change what your next trade is worth.'])),
  );
}

/* ============================================================
   Year — the twelve months of it, and what they added up to.

   Every figure here is a sum of what you logged. A month you did not trade is
   not a zero: it is drawn as nothing at all, and the running total simply
   carries through it. Flattening an untraded month into a break-even one would
   quietly reward taking the month off.
   ============================================================ */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function monthRows(acct, trades, yr) {
  const rows = MONTHS.map((label, m) => ({ m, label, net: 0, r: 0, rKnown: true, count: 0, wins: 0, losses: 0, days: new Set() }));
  for (const t of trades) {
    const d = String(t.date || '');
    if (!d.startsWith(yr + '-')) continue;
    const m = Number(d.slice(5, 7)) - 1;
    if (!(m >= 0 && m < 12)) continue;
    const row = rows[m];
    row.net += Number(t.netResult) || 0;
    row.count += 1;
    row.days.add(d);
    const r = c.rMultiple(acct, t);
    if (r != null && isFinite(r)) row.r += r; else row.rKnown = false;
    const o = c.outcome(t);
    if (o === 'win') row.wins += 1; else if (o === 'loss') row.losses += 1;
  }
  for (const row of rows) if (!row.rKnown) row.r = null;
  return rows;
}

/* An axis reads in whatever unit the app is set to, without the leading + that
   belongs on a result rather than on a gridline. */
function axisText(u, acct, v) {
  if (u === 'R') return `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) < 1 ? 1 : 0)}R`;
  if (u === '%') return `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) < 1 ? 2 : 1)}%`;
  return c.money(v, { currency: acct?.currency, decimals: 0, sign: false });
}

/* A gridline step a person would have chosen: 1, 2, 2.5 or 5 times a power
   of ten, whichever gives two or three lines rather than seven. */
function niceStep(peak) {
  if (!(peak > 0)) return 1;
  const raw = peak / 2.2;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n >= 5 ? 5 : n >= 2.5 ? 2.5 : n >= 2 ? 2 : 1) * mag;
}

let yearChartSeq = 0;

/* Draw to the space you actually have.

   An SVG with a fixed viewBox stretched to the card's width is scaled, which
   shrinks its type along with everything else and leaves whatever height it
   does not want as dead space. Measuring first and drawing in real pixels
   means the chart fills the card and 11px stays 11px. */
function fitted(draw, minHeight = 240) {
  const box = el('div', { style: { flex: '1', minHeight: minHeight + 'px', minWidth: 0 } });
  let last = '';
  const paint = () => {
    const w = Math.round(box.clientWidth), h = Math.round(box.clientHeight);
    if (!w || !h) return;
    const key = w + 'x' + h;
    if (key === last) return;
    last = key;
    box.replaceChildren(draw(w, h));
  };
  requestAnimationFrame(paint);
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => { box.isConnected ? paint() : ro.disconnect(); });
    ro.observe(box);
  }
  return box;
}

/**
 * Twelve columns and, beneath them, the line they add up to.
 *
 * Two panels on one x axis rather than two scales on one panel: a month's
 * result and the year's running total are different quantities, and laying
 * them over each other would invite reading a crossing that means nothing.
 *
 * Every value is written outside its column. A figure printed inside a bar has
 * to fit inside a bar, and "-$3,600" does not fit in a twelfth of a chart.
 */
function yearChart(rows, ctx, width, height) {
  const { unit: u, account: acct } = ctx;
  const g = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: '100%',
                         style: 'display:block' });

  /* Laid out from the bottom up, so every row is guaranteed its own space and
     a label can never land on the row beneath it. The columns take whatever is
     left, which on a tall card is most of it. */
  const padL = 62, padR = 18;
  const runH = Math.max(58, Math.min(150, Math.round(height * .2)));
  const runBottom = height - 14;
  const runTop = runBottom - runH;
  const RUN_LABEL_Y = runTop - 12;
  const COUNT_Y = runTop - 34;
  const MONTH_Y = COUNT_Y - 15;
  const barsBottom = MONTH_Y - 34;       // room for a loss to write its figure
  const barsTop = 26;                    // and for a win to write its own

  const plotSpan = width - padL - padR;
  const gap = plotSpan / 12;
  const bw = Math.min(72, gap * .5);
  const cxOf = i => padL + gap * i + gap / 2;

  const vals = rows.map(r => (r.count ? (c.figValue(u, acct, r.net, r.r) ?? 0) : null));
  const live = vals.filter(v => v != null);
  const maxUp = Math.max(0, ...live);
  const maxDown = Math.max(0, ...live.map(v => -v));
  const span = barsBottom - barsTop;
  let upRoom;
  if (!maxDown) upRoom = span;
  else if (!maxUp) upRoom = 0;
  else upRoom = Math.min(span - 46, Math.max(46, span * (maxUp / (maxUp + maxDown))));
  const zero = barsTop + upRoom;
  const yUp = v => zero - (maxUp ? v / maxUp * (zero - barsTop) : 0);
  const yDown = v => zero + (maxDown ? -v / maxDown * (barsBottom - zero) : 0);

  /* ---- gridlines, quiet enough to read past ---- */
  const step = niceStep(Math.max(maxUp, maxDown));
  const grid = (v, y) => {
    g.append(svg('line', { x1: padL, y1: y, x2: width - padR, y2: y, stroke: 'var(--grey-9)', 'stroke-width': 1 }));
    g.append(svg('text', { x: padL - 12, y: y + 4, 'text-anchor': 'end', 'font-family': 'var(--mono)',
                           'font-size': 10.5, fill: 'var(--grey-5)' }, axisText(u, acct, v)));
  };
  for (let k = 1; k * step <= maxUp * 1.02; k++) { const y = yUp(k * step); if (y < barsTop + 6) break; grid(k * step, y); }
  for (let k = 1; k * step <= maxDown * 1.02; k++) { const y = yDown(-k * step); if (y > barsBottom - 6) break; grid(-k * step, y); }
  g.append(svg('line', { x1: padL, y1: zero, x2: width - padR, y2: zero, stroke: 'var(--grey-6)', 'stroke-width': 1.2 }));
  g.append(svg('text', { x: padL - 12, y: zero + 4, 'text-anchor': 'end', 'font-family': 'var(--mono)',
                         'font-size': 10.5, fill: 'var(--grey-4)' }, '0'));

  /* ---- the months ---- */
  rows.forEach((row, i) => {
    const v = vals[i];
    const cx = cxOf(i);
    const traded = v != null;

    if (traded) {
      const up = v >= 0;
      const tip = up ? yUp(v) : yDown(v);
      const h = Math.max(3, Math.abs(tip - zero));
      const top = up ? zero - h : zero;
      g.append(svg('rect', { class: 'col-fill-svg', x: cx - bw / 2, y: top, width: bw, height: h, rx: 5,
                             fill: v === 0 ? 'var(--grey-6)' : up ? 'var(--profit)' : 'var(--loss)' }));
      g.append(svg('text', { x: cx, y: up ? top - 10 : top + h + 17, 'text-anchor': 'middle',
        'font-family': 'var(--mono)', 'font-size': 12,
        fill: v === 0 ? 'var(--grey-3)' : up ? 'var(--profit-ink)' : 'var(--loss-ink)' },
        c.fig(u, acct, row.net, row.r, { decimals: 0, rDecimals: 1 })));
    } else {
      /* A month with nothing in it. A short dash on the zero line says so
         without pretending to be a result. */
      g.append(svg('line', { x1: cx - 8, y1: zero, x2: cx + 8, y2: zero,
                             stroke: 'var(--grey-6)', 'stroke-width': 2, 'stroke-linecap': 'round' }));
    }

    g.append(svg('text', { x: cx, y: MONTH_Y, 'text-anchor': 'middle', 'font-family': 'var(--mono)', 'font-size': 11,
                           'letter-spacing': '.09em', fill: traded ? 'var(--grey-3)' : 'var(--grey-6)' }, row.label));
    if (traded) g.append(svg('text', { x: cx, y: COUNT_Y, 'text-anchor': 'middle', 'font-family': 'var(--mono)',
                                       'font-size': 10, fill: 'var(--grey-5)' }, String(row.count)));
  });

  /* ---- the running total, on the same twelve positions ---- */
  const running = [];
  let acc = 0, seen = false;
  rows.forEach((row) => {
    if (row.count) { acc += (c.figValue(u, acct, row.net, row.r) ?? 0); seen = true; }
    running.push(seen ? acc : null);
  });
  const drawn = running.filter(v => v != null);
  const anyUp = drawn.some(v => v > 0), anyDown = drawn.some(v => v < 0);
  const rPeak = Math.max(1e-9, ...drawn.map(Math.abs));
  const rZero = anyUp && anyDown ? (runTop + runBottom) / 2 : (anyDown ? runTop : runBottom);
  const rHalf = anyUp && anyDown ? (runBottom - runTop) / 2 : (runBottom - runTop);
  const yRun = v => rZero - (v / rPeak) * rHalf;

  const endValue = drawn.length ? drawn[drawn.length - 1] : 0;
  const tone = endValue < 0 ? 'loss' : 'profit';
  const id = 'yr-run-' + (++yearChartSeq);
  const defs = svg('defs');
  const lg = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
  lg.append(svg('stop', { offset: '0%', 'stop-color': `var(--${tone})`, 'stop-opacity': .26 }));
  lg.append(svg('stop', { offset: '100%', 'stop-color': `var(--${tone})`, 'stop-opacity': .02 }));
  defs.append(lg); g.append(defs);

  g.append(svg('line', { x1: padL, y1: rZero, x2: width - padR, y2: rZero, stroke: 'var(--grey-8)', 'stroke-width': 1 }));

  const pts = running.map((v, i) => (v == null ? null : [cxOf(i), yRun(v)])).filter(Boolean);
  if (pts.length) {
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    g.append(svg('path', { class: 'line-area', fill: `url(#${id})`,
      d: `${line} L${pts[pts.length - 1][0].toFixed(1)} ${rZero} L${pts[0][0].toFixed(1)} ${rZero} Z` }));
    g.append(svg('path', { class: 'line-draw', d: line, fill: 'none', stroke: `var(--${tone})`,
                           'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', pathLength: 1 }));
    const [ex, ey] = pts[pts.length - 1];
    g.append(svg('circle', { class: 'line-tip', cx: ex, cy: ey, r: 3.4, fill: `var(--${tone})` }));
  }
  g.append(svg('text', { x: padL, y: RUN_LABEL_Y, 'font-family': 'var(--mono)', 'font-size': 10,
                         'letter-spacing': '.11em', fill: 'var(--grey-5)' }, 'RUNNING TOTAL'));
  g.append(svg('text', { x: width - padR, y: RUN_LABEL_Y, 'text-anchor': 'end', 'font-family': 'var(--mono)',
                         'font-size': 12, fill: `var(--${tone}-ink)` },
    drawn.length ? c.fig(u, acct, yearNet(rows), yearR(rows), { decimals: 0, rDecimals: 1 }) : '—'));
  return g;
}

const yearNet = rows => rows.reduce((sum, r) => sum + r.net, 0);
const yearR = rows => (rows.every(r => r.r != null) ? rows.reduce((sum, r) => sum + r.r, 0) : null);

function yearly(store, acct, all, ctx) {
  const { unit: u, cur } = ctx;
  const rows = monthRows(acct, all, year);
  const traded = rows.filter(r => r.count);
  const f = (d, r, o) => c.fig(u, acct, d, r, { decimals: 0, rDecimals: 1, ...o });

  const net = yearNet(rows), netR = yearR(rows);
  const count = traded.reduce((s, r) => s + r.count, 0);
  const green = traded.filter(r => r.net > 0).length;
  const byValue = [...traded].sort((a, b) => b.net - a.net);
  const best = byValue[0] || null;
  const worst = byValue.length > 1 ? byValue[byValue.length - 1] : null;
  const wins = traded.reduce((s, r) => s + r.wins, 0);
  const losses = traded.reduce((s, r) => s + r.losses, 0);
  const rate = wins + losses ? wins / (wins + losses) : null;

  /* ---------- the strip along the top ---------- */
  const cell = (label, value, colour, note) => el('div', { style: { flex: '1', minWidth: 0, padding: '0 22px' } },
    el('div', { class: 'm', style: { fontSize: '10px', letterSpacing: '.1em', color: 'var(--grey-5)' } }, label),
    el('div', { class: 'm', style: { marginTop: '9px', fontSize: '19px', letterSpacing: '-.02em',
                                     color: colour || 'var(--ink)' } }, value),
    el('div', { class: 'm', style: { marginTop: '5px', fontSize: '10.5px', color: 'var(--grey-5)' } }, note || ''));
  const rule = () => el('div', { style: { width: '1px', alignSelf: 'stretch', background: 'var(--grey-7)' } });

  const strip = el('section', { class: 'card', style: { flex: 'none', padding: '20px 4px' } },
    el('div', { style: { display: 'flex', alignItems: 'stretch' } },
      cell(year, traded.length ? f(net, netR) : '—',
        net > 0 ? 'var(--profit)' : net < 0 ? 'var(--loss)' : 'var(--ink)',
        `${count} trade${count === 1 ? '' : 's'} · ${traded.length} month${traded.length === 1 ? '' : 's'} traded`),
      rule(),
      cell('BEST MONTH', best ? f(best.net, best.r) : '—', best && best.net > 0 ? 'var(--profit)' : 'var(--ink)',
        best ? monthName(best.m) + ' · ' + best.count + ' trades' : 'nothing yet'),
      rule(),
      cell('WORST MONTH', worst ? f(worst.net, worst.r) : '—', worst && worst.net < 0 ? 'var(--loss)' : 'var(--ink)',
        worst ? monthName(worst.m) + ' · ' + worst.count + ' trades' : 'nothing yet'),
      rule(),
      cell('GREEN MONTHS', traded.length ? `${green} of ${traded.length}` : '—', 'var(--ink)',
        traded.length ? 'months you traded' : 'nothing yet'),
      rule(),
      cell('WIN RATE', rate == null ? '—' : c.pct(rate), 'var(--ink)',
        rate == null ? 'nothing decided' : `${wins} W · ${losses} L`),
    ));

  /* ---------- the chart ---------- */
  const chartCard = el('section', { class: 'card', style: { flex: '1', minHeight: '360px', padding: '22px 24px 14px', gap: '12px' } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px', flex: 'none' } },
      el('h2', {}, 'Monthly'),
      el('span', { class: 'note' }, u === '$' ? 'net, in ' + cur : u === '%' ? 'of starting balance' : 'in R')),
    fitted((w, h) => yearChart(rows, ctx, w, h), 300));

  /* ---------- the twelve, in a column ---------- */
  const peak = Math.max(1, ...traded.map(r => Math.abs(c.figValue(u, acct, r.net, r.r) ?? 0)));
  const monthRow = (r) => {
    const v = c.figValue(u, acct, r.net, r.r) ?? 0;
    const decided = r.wins + r.losses;
    const on = r.count > 0;
    return el('div', { style: { display: 'flex', alignItems: 'center', gap: '11px', padding: '9px 0',
                                borderBottom: '1px solid var(--grey-9)', opacity: on ? 1 : .38 } },
      el('span', { class: 'm', style: { width: '34px', fontSize: '10.5px', letterSpacing: '.07em', color: 'var(--grey-5)' } }, r.label),
      el('div', { style: { flex: '1', minWidth: 0, height: '6px', borderRadius: '3px', background: 'var(--grey-9)',
                           display: 'flex', justifyContent: r.net < 0 ? 'flex-start' : 'flex-start' } },
        on ? el('div', { class: 'bar-fill', style: { width: Math.max(3, Math.abs(v) / peak * 100) + '%', height: '100%',
              borderRadius: '3px', background: r.net > 0 ? 'var(--profit)' : r.net < 0 ? 'var(--loss)' : 'var(--grey-6)' } }) : null),
      el('span', { class: 'm', style: { width: '46px', textAlign: 'right', fontSize: '10.5px', color: 'var(--grey-5)' } },
        on ? (decided ? Math.round(r.wins / decided * 100) + '%' : '—') : ''),
      el('span', { class: 'm', style: { width: '86px', textAlign: 'right', fontSize: '11.5px',
        color: r.net > 0 ? 'var(--profit)' : r.net < 0 ? 'var(--loss)' : 'var(--grey-4)' } },
        on ? f(r.net, r.r) : '—'));
  };

  /* Two figures the twelve rows do not say on their own. Both are over the
     months you actually traded — dividing by twelve would quietly punish a
     year you started in September. */
  const avg = traded.length ? net / traded.length : null;
  const avgR = traded.length && rows.every(r => r.r != null) ? (netR ?? 0) / traded.length : null;
  const days = new Set(traded.flatMap(r => [...r.days])).size;
  const foot = (label, value, colour) => el('div', { style: { display: 'flex', alignItems: 'baseline', padding: '9px 0' } },
    el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-5)' } }, label),
    el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12px', color: colour || 'var(--ink-2)' } }, value));

  const listCard = el('section', { class: 'card', style: { width: '340px', flex: 'none', padding: '22px 24px 14px' } },
    el('div', { style: { display: 'flex', alignItems: 'baseline' } },
      el('h2', {}, 'Month by month'),
      el('span', { class: 'note', style: { marginLeft: 'auto' } }, 'win rate · net')),
    el('div', { style: { marginTop: '10px', overflowY: 'auto', minHeight: 0 } }, ...rows.map(monthRow)),
    el('div', { style: { marginTop: 'auto', paddingTop: '10px' } },
      foot('Average month traded', traded.length ? f(avg, avgR) : '—',
        avg > 0 ? 'var(--profit)' : avg < 0 ? 'var(--loss)' : 'var(--ink-2)'),
      el('div', { style: { height: '1px', background: 'var(--grey-9)' } }),
      foot('Days traded', days ? String(days) : '—'),
      el('div', { style: { height: '1px', background: 'var(--grey-9)' } }),
      foot('Trades per traded month', traded.length ? (count / traded.length).toFixed(1) : '—')));

  return el('div', { style: { flex: '1', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--s-8)' } },
    strip,
    el('div', { class: 'row', style: { flex: '1', minHeight: 0 } }, chartCard, listCard));
}

const monthName = m => ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'][m] || '';
