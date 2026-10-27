import { el, svg, icon, fitted } from '../ui.js';
import * as c from '../calc.js';
import { weeklyTab, weeklyControls } from './weekly.js';
import { overviewTab } from './an-overview.js';
import { timingTab } from './an-timing.js';
import { executionTab } from './an-execution.js';
import { outlookTab, takeWantedTab } from './an-outlook.js';
import { glide } from '../shell.js';

let tab = 'overview';       // overview | weekly | tags | timing | execution | discipline | outlook  (the year lives on the Calendar now)
let year = null;            // resolved on first paint to the latest year traded
let period = '30D';
const DAYS = { '7D': 7, '30D': 30, '90D': 90, 'All': null };

function withinPeriod(trades) {
  const days = DAYS[period];
  if (!days) return trades;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  return trades.filter(t => t.date >= cutoff.toISOString().slice(0, 10));
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

/** The first date in the rolling window, or null for All. */
function periodFrom() {
  const days = DAYS[period];
  if (!days) return null;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString().slice(0, 10);
}

/* ============================================================
   The year, for the Calendar page

   It used to be a tab here, which put two calendars in two places. It is
   drawn on the Calendar now, beside the month, and only lent from here so
   its arithmetic stays where the rest of the analytics' is.
   ============================================================ */
export function yearPanel(store, nav) {
  const acct = store.activeAccount;
  const all = store.tradesFor(acct.id);
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
  const stepper = el('div', { class: 'stepper' },
    el('button', { onClick: () => stepYear(-1), 'aria-label': 'Previous year' }, icon('chevleft', 12, 'var(--grey-2)', 2.4)),
    el('span', { class: 'val', style: { minWidth: '52px' } }, year),
    el('button', { onClick: () => stepYear(1), 'aria-label': 'Next year' }, icon('chevright', 12, 'var(--grey-2)', 2.4)));
  const sub = el('span', { class: 'head-meta' }, `${all.filter(t => String(t.date).startsWith(year)).length} closed in ${year}`);
  const ctx = { unit: store.displayUnit, account: acct, cur: acct.currency, nav };
  const body = all.length ? yearly(store, acct, all, ctx)
    : el('div', { class: 'card', style: { flex: '1' } },
        el('div', { class: 'empty' },
          icon('calendar', 34, 'var(--grey-6)', 1.4),
          el('h2', { style: { fontSize: '16px' } }, 'Nothing logged yet'),
          el('p', {}, 'A year fills in as you trade it.')));
  return { stepper, sub, body };
}

export function analytics(store, nav) {
  if (takeWantedTab() === 'outlook') tab = 'outlook';     // sent here from the Outlook page
  if (tab === 'year') tab = 'overview';
  const acct = store.activeAccount;
  const cur = acct.currency;
  const all = store.tradesFor(acct.id);

  /* The year reads a whole year by definition, so the rolling window has
     nothing to say on that tab and its own year control takes the slot. The
     weekly page is the same: it walks through time a period at a time, so it
     brings its own control and reads every trade itself. */
  const isYear = tab === 'year';
  const isWeekly = tab === 'weekly';
  const trades = isYear || isWeekly ? all : withinPeriod(all);
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

  /* The tabs read like the Journal's and the Lab's: words, the chosen one
     underlined, the line sliding to the next (shell.glide). */
  const tabLinks = [['overview', 'Overview'], ['weekly', 'Weekly winrate'], ['tags', 'Tags'], ['timing', 'Timing'], ['execution', 'Execution'], ['discipline', 'Discipline'], ['outlook', 'Outlook']].map(([k, label]) =>
    el('button', { class: 'sn-tab' + (k === tab ? ' is-on' : ''), role: 'tab', 'aria-selected': String(k === tab), onClick: () => { if (tab !== k) { tab = k; nav.refresh(); } } }, label));
  const tabGlide = el('span', { class: 'sn-glide', 'aria-hidden': 'true' });
  const tabBar = el('nav', { class: 'subnav an-tabs', 'aria-label': 'Analytics', role: 'tablist' }, tabGlide, ...tabLinks);
  glide(tabBar, 'sub-analytics', tabLinks.find(b => b.classList.contains('is-on')), tabGlide);
  const head = el('header', { class: 'head an-head has-subnav' },
    el('h1', { class: 'sr-only' }, 'Analytics'),
    tabBar,
    el('div', { class: 'spacer' }),
    /* The count sits by the period it counts, not beside the tabs where it
       read as one more. The weekly page brings a wider control than the
       others, so it gives the count up to make room. */
    isWeekly || tab === 'tags' ? null : el('span', { class: 'head-meta' }, isYear
      ? `${all.filter(t => String(t.date).startsWith(year)).length} closed in ${year}`
      : `${trades.length} closed trade${trades.length === 1 ? '' : 's'}`),
    tab === 'tags' ? tagMinControl(nav) : null,
    isWeekly
      ? weeklyControls(store, nav)
      : isYear
      ? el('div', { class: 'stepper' },
          el('button', { onClick: () => stepYear(-1) }, icon('chevleft', 12, 'var(--grey-2)', 2.4)),
          el('span', { class: 'val', style: { minWidth: '52px' } }, year),
          el('button', { onClick: () => stepYear(1) }, icon('chevright', 12, 'var(--grey-2)', 2.4)))
      : el('div', { class: 'seg' },
          ...Object.keys(DAYS).map(k => el('button', { class: k === period ? 'is-on' : '',
            onClick: () => { period = k; nav.refresh(); } }, k))),
  );

  if (isWeekly) return el('div', { class: 'view' }, head, weeklyTab(store, nav));

  if (!trades.length) {
    return el('div', { class: 'view' }, head,
      el('div', { class: 'card', style: { flex: '1' } },
        el('div', { class: 'empty' },
          icon('analytics', 34, 'var(--grey-6)', 1.4),
          el('h2', { style: { fontSize: '16px' } }, isYear ? 'Nothing logged yet' : 'Nothing in this window'),
          el('p', {}, isYear ? 'A year fills in as you trade it.' : 'Log some trades, or widen the period.'))));
  }

  const ctx = { unit: store.displayUnit, account: acct, cur, nav };
  const body = tab === 'overview' ? overviewTab(store, acct, trades, s, ctx)
             : tab === 'tags'     ? tagsTab(store, acct, trades, s, ctx)
             : tab === 'timing'   ? timingTab(store, acct, trades, ctx)
             : tab === 'execution' ? executionTab(store, acct, trades, ctx)
             : tab === 'year'     ? yearly(store, acct, all, ctx)
             : tab === 'outlook'  ? outlookTab(store, acct, trades, ctx, periodFrom())
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

/* ============================================================
   Tags — which kinds of trade actually pay

   The page you come to looking for an edge, so it is built to make a false
   one hard to believe:

   • Win rate alone is not an edge. A tag that wins 70% of the time on a
     payoff of 0.3 loses money, so every row carries its expectancy in R
     beside its win rate, and the two are read together.

   • A sample of one is not evidence. Anything under the threshold is dimmed
     — shown, because hiding your own data is worse, but never allowed to
     look like a finding.

   • A number needs something to be better than. Pointing at a tag sets it
     against your own win rate over the same window, in points, so "62%"
     becomes "eight points better than you usually do" or "two points worse".

   A trade carries several tags at once, so the groups do not add up to the
   account and are not meant to. That is said on the page rather than left to
   be discovered.
   ============================================================ */
let tagSort = 'edge';
/* Five is where a run of trades starts to be worth reading. It is a control
   rather than a rule — some groups fill up slowly — but the page should not
   open by calling three wins in a row an edge. */
let tagMin = 5;
/* Groups folded away, by id. Kept while the app is open. */
const tagShut = new Set();

/* The column names are the sort. Clicking the one already on does nothing. */
const TAG_COLS = [
  ['name',  'Tag',        ''],
  ['count', 'Trades',     'r'],
  ['win',   'Win',        'r'],
  ['edge',  'Per trade',  'c'],
  [null,    '',           ''],
  ['total', 'Total',      'r'],
];

/** How few trades still count, as a stepper for the page header. */
function tagMinControl(nav) {
  return el('span', { class: 'tg-min', title: 'Tags with fewer trades than this are dimmed' },
    'Dim under',
    el('div', { class: 'stepper' },
      el('button', { onClick: () => { tagMin = Math.max(1, tagMin - 1); nav.refresh(); } },
        icon('minus', 11, 'var(--grey-2)', 2.6)),
      el('span', { class: 'val' }, `${tagMin}+`),
      el('button', { onClick: () => { tagMin = Math.min(50, tagMin + 1); nav.refresh(); } },
        icon('plus', 11, 'var(--grey-2)', 2.6))));
}

function tagsTab(store, acct, trades, s, ctx) {
  const { nav } = ctx;
  const groups = store.playbook.tagGroups || [];

  if (!groups.length) {
    return el('div', { class: 'view' },
      el('div', { class: 'card', style: { flex: '1' } },
        el('div', { class: 'empty' },
          el('h2', { style: { fontSize: '16px' } }, 'No tag groups yet'),
          el('p', {}, 'Tag groups are set up in the Playbook. Once trades carry tags, this is where they are read.'))));
  }

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
    return { g, rows, gs, unused, usedIn };
  });

  /* One scale for the whole page, so a bar means the same thing in every group. */
  const reach = Math.max(1e-9, ...sections.flatMap(x => x.rows.map(r => Math.abs(r.edge ?? 0))));
  const tone = v => (v == null || Math.abs(v) < 1e-9 ? '' : v > 0 ? ' is-pos' : ' is-neg');

  const bar = e => {
    if (e == null) return el('span', { class: 'tg-bar' });
    const w = Math.abs(e) / reach * 50;
    return el('span', { class: 'tg-bar' }, el('i', { class: 'z' }),
      el('i', { class: 'f bar-fill' + tone(e), style: { left: (e >= 0 ? 50 : 50 - w) + '%', width: w + '%',
        transformOrigin: e >= 0 ? 'left center' : 'right center' } }));
  };

  const cols = el('div', { class: 'tg-cols tg-grid' },
    ...TAG_COLS.map(([k, label, al]) => k
      ? el('button', { class: (al ? al + ' ' : '') + (k === tagSort ? 'is-on' : ''), style: al === 'r' ? { justifySelf: 'end' } : al === 'c' ? { justifySelf: 'center' } : {},
          onClick: () => { if (tagSort === k) return; tagSort = k; nav.refresh(); } },
          label + (k === tagSort ? (k === 'name' ? ' ↑' : ' ↓') : ''))
      : el('span', {})));

  const row = r => el('div', { class: 'tg-row tg-grid' + (r.thin ? ' is-thin' : ''),
      title: [`${r.st.wins} won · ${r.st.losses} lost · ${r.st.breakevens} break-even`,
        r.delta == null ? null : `${r.delta >= 0 ? '+' : '−'}${Math.abs(r.delta).toFixed(0)} points against your own win rate`,
        r.thin ? `only ${r.n} trade${r.n === 1 ? '' : 's'} — too few to read anything into` : null].filter(Boolean).join('\n') },
    el('span', { class: 'tg-name' }, r.name),
    el('span', { class: 'num' }, String(r.n)),
    el('span', { class: 'num' }, r.win == null ? '—' : c.pct(r.win, 0)),
    bar(r.edge),
    el('span', { class: 'num is-edge' + tone(r.edge) }, r.edge == null ? '—' : c.rFmt(r.edge)),
    el('span', { class: 'num is-tot' }, r.total == null ? '—' : c.rFmt(r.total, 1)));

  const groupCard = ({ g, rows, gs, unused, usedIn }) => {
    const shut = tagShut.has(g.id);
    return el('section', { class: 'card tg-group' + (shut ? ' is-shut' : '') },
      el('button', { class: 'tg-group-head', title: shut ? 'Show' : 'Fold away',
          onClick: () => { shut ? tagShut.delete(g.id) : tagShut.add(g.id); nav.refresh(); } },
        el('span', { class: 'tg-chev' }, icon('chevdown', 11, 'var(--ink-4)', 2.4)),
        el('h2', {}, g.name),
        el('span', { class: 'note' },
          `${rows.length} of ${g.tags.length} tag${g.tags.length === 1 ? '' : 's'} · ${usedIn.length} trade${usedIn.length === 1 ? '' : 's'}`),
        gs ? el('span', { class: 'tg-group-tot' + tone(gs.netR),
              title: `${gs.winRate == null ? '—' : c.pct(gs.winRate, 0)} won · ${c.rFmt(gs.expectancyR)} a trade` },
              gs.netR == null ? '—' : c.rFmt(gs.netR, 1)) : null),
      shut ? null : rows.length
        ? el('div', { class: 'tg-rows' }, ...rows.map(row))
        : el('div', { class: 'tg-none' }, 'Nothing in this group was used in this window.'),
      /* Tags you set up and never reach for are worth knowing about too. */
      !shut && unused.length
        ? el('div', { class: 'tg-unused' }, el('span', { class: 't' }, 'Not used:'),
            unused.map(tag => tag.name).join(' · '))
        : null);
  };

  return el('div', { class: 'view tg-view' },
    el('div', { class: 'tg-scroll' },
      cols,
      ...sections.map(groupCard),
      el('div', { class: 'tg-foot' },
        `${tagged} of ${trades.length} trade${trades.length === 1 ? '' : 's'} in this window carry a tag. `,
        'A trade can carry several, so the groups overlap and do not add up to the account.')));
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
  /* Each figure is written to fit its own column, so two neighbours can
     never run into each other however narrow the window: the full figure
     when there is room, a short one (+$3.9k) when there is not, and none at
     all on a phone, where the list beside the chart says every figure. */
  const MONO_W = .62;                                   // a mono character, in ems
  const fits = (txt, size) => txt.length * size * MONO_W <= gap - 6;
  /* One way of writing them for the whole chart, the longest that every
     column has room for, so the twelve read alike. */
  const forms = [
    (row, v) => ({ txt: c.fig(u, acct, row.net, row.r, { decimals: 0, rDecimals: 1 }), size: 12 }),
    (row, v) => ({ txt: shortFig(u, v, acct?.currency), size: 11 }),
    (row, v) => ({ txt: shortFig(u, v, acct?.currency).replace(/[^0-9.kKmM+\u2212-]/g, ''), size: 10.5 }),
  ];
  const form = forms.find(fm => rows.every((row, i) => vals[i] == null || (() => { const o = fm(row, vals[i]); return fits(o.txt, o.size); })()));
  const label = (row, v) => (form ? form(row, v) : null);
  const tight = gap < 30;                               // J F M … rather than JAN FEB MAR

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
      const lb = label(row, v);
      if (lb) g.append(svg('text', { class: 'yr-val', x: cx, y: up ? top - 10 : top + h + 17, 'text-anchor': 'middle',
        'font-family': 'var(--mono)', 'font-size': lb.size,
        fill: v === 0 ? 'var(--grey-3)' : up ? 'var(--profit)' : 'var(--loss)' }, lb.txt));
    } else {
      /* A month with nothing in it. A short dash on the zero line says so
         without pretending to be a result. */
      g.append(svg('line', { x1: cx - 8, y1: zero, x2: cx + 8, y2: zero,
                             stroke: 'var(--grey-6)', 'stroke-width': 2, 'stroke-linecap': 'round' }));
    }

    g.append(svg('text', { x: cx, y: MONTH_Y, 'text-anchor': 'middle', 'font-family': 'var(--mono)', 'font-size': 11,
                           'letter-spacing': tight ? '0' : '.09em', fill: traded ? 'var(--grey-3)' : 'var(--grey-6)' },
                           tight ? row.label.slice(0, 1) : row.label));
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
                         'font-size': 12, fill: `var(--${tone})` },
    drawn.length ? c.fig(u, acct, yearNet(rows), yearR(rows), { decimals: 0, rDecimals: 1 }) : '—'));
  return g;
}

/* A figure in as few characters as it can be said in: +$3.9k, −$850,
   +12R, +16.8%. Only for the year chart's bars, where the column is narrow. */
function shortFig(u, v, currency) {
  if (v == null || !isFinite(v)) return '—';
  const sign = v > 0 ? '+' : v < 0 ? '\u2212' : '';
  const a = Math.abs(v);
  if (u === 'R') return sign + (a >= 10 ? Math.round(a) : a.toFixed(1)) + 'R';
  if (u === '%') return sign + (a >= 100 ? Math.round(a) : a.toFixed(1)) + '%';
  const sym = currency === 'EUR' ? '\u20ac' : currency === 'GBP' ? '\u00a3' : currency === 'JPY' ? '\u00a5' : '$';
  const n = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'm'
          : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k'
          : String(Math.round(a));
  return sign + sym + n;
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
  const cell = (label, value, colour, note) => el('div', { class: 'yr-cell', style: { flex: '1', minWidth: 0, padding: '0 22px' } },
    el('div', { class: 'm', style: { fontSize: '10px', letterSpacing: '.1em', color: 'var(--grey-5)' } }, label),
    el('div', { class: 'm', style: { marginTop: '9px', fontSize: '19px', letterSpacing: '-.02em',
                                     color: colour || 'var(--ink)' } }, value),
    el('div', { class: 'm', style: { marginTop: '5px', fontSize: '10.5px', color: 'var(--grey-5)' } }, note || ''));
  const rule = () => el('div', { class: 'yr-rule', style: { width: '1px', alignSelf: 'stretch', background: 'var(--grey-7)' } });

  const strip = el('section', { class: 'card yr-strip', style: { flex: 'none', padding: '20px 4px' } },
    el('div', { class: 'yr-strip-in', style: { display: 'flex', alignItems: 'stretch' } },
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

  const listCard = el('section', { class: 'card yr-list', style: { width: '340px', flex: 'none', padding: '22px 24px 14px' } },
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
    el('div', { class: 'row yr-row', style: { flex: '1', minHeight: 0 } }, chartCard, listCard));
}

const monthName = m => ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'][m] || '';
