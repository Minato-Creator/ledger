import { el, svg, icon, ft, fitted } from '../ui.js';
import * as c from '../calc.js';
import { hoverLayer, readRow, unitKit } from './chartkit.js';
import { sequence, deepest, streaks } from './an-overview.js';

let period = '30D';
const DAYS = { '7D': 7, '30D': 30, '90D': 90, 'All': null };

function withinPeriod(trades) {
  const days = DAYS[period];
  if (!days) return trades;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const iso = cutoff.toISOString().slice(0, 10);
  return trades.filter(t => t.date >= iso);
}

/* ============================================================
   The dashboard — where you stand, in four cards.

   The result first and biggest, with the curve that got there filling its
   card. Beside it, the handful of numbers an edge is made of, each with one
   mark that makes it readable at a glance: win rate against the win rate
   you need to break even, the size of an average win against an average
   loss, the last twenty trades as a strip. Under them, where the money came
   from — setup, session, instrument — and the last few trades.

   Everything reads in whichever unit is switched on, and follows the
   7D / 30D / 90D / All window, except the recent trades, which are simply
   the last ones you closed.
   ============================================================ */
const sign = v => (v > 1e-9 ? 'is-pos' : v < -1e-9 ? 'is-neg' : '');

/* The headline in money keeps its cents — a scratch that cost $1.20 has to
   show — but smaller, so the dollars are what you read first. */
const bigFigure = (text, u) => {
  const at = u === '$' ? text.lastIndexOf('.') : -1;
  return at < 0 ? [text] : [text.slice(0, at), el('small', {}, text.slice(at))];
};

export function dashboard(store, nav) {
  const acct = store.activeAccount;
  const all = store.tradesFor(acct.id);
  const trades = withinPeriod(all);
  const s = c.summarise(acct, trades);
  const u = store.displayUnit;
  const K = unitKit(u, acct);
  const f = (d, r, o) => c.fig(u, acct, d, r, o);
  const rows = sequence(acct, trades, K);

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Dashboard'),
    el('span', { class: 'sub' }, acct.name),
    el('div', { class: 'spacer' }),
    el('div', { class: 'seg' },
      ...Object.keys(DAYS).map(k => el('button', {
        class: k === period ? 'is-on' : '',
        onClick: () => { period = k; nav.refresh(); },
      }, k))),
    el('button', { class: 'btn btn-primary', onClick: () => nav.go('#/new') }, icon('plus', 15, '#fff', 2), 'New trade'),
  );

  if (!all.length) {
    return el('div', { class: 'view' }, head,
      el('div', { class: 'card', style: { flex: '1' } },
        el('div', { class: 'empty' },
          icon('trades', 34, 'var(--grey-6)', 1.4),
          el('h2', { style: { fontSize: '16px' } }, 'No trades on ' + acct.name + ' yet'),
          el('p', {}, 'Log one and every number on this page starts working.'),
          el('button', { class: 'btn btn-primary', onClick: () => nav.go('#/new') }, icon('plus', 15, '#fff', 2), 'Log your first trade'),
        )));
  }

  return el('div', { class: 'view' }, head,
    el('div', { class: 'db-grid' },
      heroCard(rows, s, K, f, u, store),
      edgeCard(rows, s, K, f),
      sourceCard(store, rows, K),
      recentCard(store, acct, nav)));
}

/* ---------- the result, and the curve that got there ---------- */
function heroCard(rows, s, K, f, u, store) {
  const label = (u === 'R' ? 'Net R' : u === '%' ? 'Net return' : 'Net P&L') + ' · '
    + (period === 'All' ? 'all time' : `last ${DAYS[period]} days`);
  const days = new Set(rows.map(x => x.t.date)).size;
  const hi = Math.max(0, ...rows.map(x => x.eq));
  const dd = deepest(rows);
  return el('section', { class: 'card db-hero' },
    el('div', { class: 'db-k' }, label),
    el('div', { class: 'db-top' },
      el('div', { class: 'db-big ' + sign(s.net) }, ...bigFigure(f(s.net, s.netR), u)),
      el('div', { class: 'db-meta' },
        el('span', {}, el('b', {}, String(s.count)), ` trade${s.count === 1 ? '' : 's'}`),
        el('span', {}, el('b', {}, String(days)), ` day${days === 1 ? '' : 's'}`),
        rows.length ? el('span', {}, el('b', {}, K.fmt(hi)), ' high') : null,
        dd ? el('span', {}, el('b', { class: 'is-neg' }, K.fmt(dd.amount)), ' max drawdown') : null)),
    rows.length
      ? fitted((w, h) => drawHero(rows, K, store, w, h), 160)
      : el('div', { class: 'db-none' }, 'No trades in this window — widen it, or log one.'));
}

function drawHero(rows, K, store, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const n = rows.length;
  const l = 4, r = W - 4, t = 20, b = H - 22;
  const X = i => l + ((i + 1) / n) * (r - l);
  let lo = 0, hi = 0;
  for (const x of rows) { lo = Math.min(lo, x.eq); hi = Math.max(hi, x.eq); }
  const pad = (hi - lo) * 0.1 || 1;
  const Y = v => b - ((v - lo + pad) / (hi - lo + 2 * pad)) * (b - t);
  const id = Math.random().toString(36).slice(2, 8), y0 = Y(0);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  g.append(svg('defs', {},
    svg('linearGradient', { id: 'dp' + id, gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: t, y2: y0 },
      svg('stop', { offset: 0, class: 'an-stop-pos', 'stop-opacity': .26 }), svg('stop', { offset: 1, class: 'an-stop-pos', 'stop-opacity': 0 })),
    svg('linearGradient', { id: 'dn' + id, gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: b, y2: y0 },
      svg('stop', { offset: 0, class: 'an-stop-neg', 'stop-opacity': .26 }), svg('stop', { offset: 1, class: 'an-stop-neg', 'stop-opacity': 0 })),
    svg('clipPath', { id: 'cu' + id }, svg('rect', { x: 0, y: 0, width: W, height: Math.max(0, y0) })),
    svg('clipPath', { id: 'cd' + id }, svg('rect', { x: 0, y: y0, width: W, height: Math.max(0, H - y0) }))));

  g.append(svg('line', { class: 'db-zero', x1: l, x2: r, y1: y0, y2: y0 }));
  g.append(svg('text', { class: 'lab-tick', x: r, y: y0 - 6, 'text-anchor': 'end' }, K.axis(0)));

  const line = `M${l},${y0.toFixed(1)}` + rows.map(x => `L${X(x.i).toFixed(1)},${Y(x.eq).toFixed(1)}`).join('');
  const area = line + `L${r},${y0.toFixed(1)}Z`;
  g.append(svg('path', { class: 'line-area', d: area, fill: `url(#dp${id})`, 'clip-path': `url(#cu${id})` }));
  g.append(svg('path', { class: 'line-area', d: area, fill: `url(#dn${id})`, 'clip-path': `url(#cd${id})` }));
  g.append(svg('path', { class: 'an-line is-pos line-draw', d: line, pathLength: 1, 'clip-path': `url(#cu${id})` }));
  g.append(svg('path', { class: 'an-line is-neg line-draw', d: line, pathLength: 1, 'clip-path': `url(#cd${id})` }));

  let hiI = -1;
  rows.forEach((x, i) => { if (x.eq > 1e-9 && (hiI < 0 || x.eq > rows[hiI].eq)) hiI = i; });
  if (hiI >= 0 && hiI !== n - 1) g.append(svg('circle', { class: 'an-high line-tip', cx: X(hiI), cy: Y(rows[hiI].eq), r: 3.5 }));
  const end = rows[n - 1];
  g.append(svg('circle', { class: 'an-end line-tip ' + (end.eq < 0 ? 'is-neg' : 'is-pos'), cx: X(n - 1), cy: Y(end.eq), r: 4.5 }));
  g.append(svg('text', { class: 'db-endlbl line-tip', x: X(n - 1) - 10, y: Y(end.eq) + (Y(end.eq) - t < 18 ? 16 : -12), 'text-anchor': 'end' }, K.fmt(end.eq)));

  /* Four dates along the bottom, never the same day twice. */
  let last = '';
  [0, Math.floor(n / 3), Math.floor(2 * n / 3), n - 1].forEach((i, k) => {
    const lbl = c.shortDate(rows[i].t.date);
    if (lbl === last) return;
    last = lbl;
    g.append(svg('text', { class: 'lab-tick', x: X(i), y: H - 4, 'text-anchor': k === 0 ? 'start' : k === 3 ? 'end' : 'middle' }, lbl));
  });

  const setupName = sid => store.playbook.setups.find(x => x.id === sid)?.name;
  hoverLayer(wrap, g, { l, r, t, b }, x => {
    const i = Math.max(0, Math.min(n - 1, Math.round(((x - l) / (r - l)) * n) - 1));
    const p = rows[i];
    return { x: X(i), y: Y(p.eq), rows: [
      el('div', { class: 'h' }, `${c.shortDate(p.t.date)}${p.t.timeOpen ? ' ' + p.t.timeOpen : ''} · trade ${i + 1}`),
      readRow(p.eq < 0 ? 'is-fail' : 'is-pass', K.fmt(p.eq), 'equity'),
      readRow(p.v > 0 ? 'is-pass' : p.v < 0 ? 'is-fail' : 'is-going', K.fmt(p.v),
        [p.t.pair, setupName(p.t.setupId)].filter(Boolean).join(' · ') || 'this trade')] };
  });
  wrap.prepend(g);
  return wrap;
}

/* ---------- the numbers an edge is made of ---------- */
function edgeCard(rows, s, K, f) {
  const stat = (k, v, cls, ...more) => el('div', { class: 'db-stat' },
    el('div', { class: 'db-srow' }, el('span', { class: 'k2' }, k), el('span', { class: 'v ' + (cls || '') }, v)), ...more);
  const be = s.breakEvenWinRate;
  const wr = s.winRate;
  const pf = s.profitFactor;
  const st = streaks(rows);
  const tail = rows.slice(-20);
  return el('section', { class: 'card db-edge' },
    el('div', { class: 'db-k' }, 'Your edge'),
    stat('Win rate', wr == null ? '—' : c.pct(wr, 1), '',
      el('div', { class: 'db-track' },
        el('span', { class: 'bar-fill', style: { width: ((wr || 0) * 100) + '%' } }),
        be != null ? el('span', { class: 'be', style: { left: (be * 100) + '%' }, 'data-l': `break-even ${c.pct(be, 0)}` }) : null),
      el('div', { class: 'db-note' },
        wr != null && be != null
          ? [el('b', {}, `${Math.abs((wr - be) * 100).toFixed(1)} pts`), ` ${wr >= be ? 'above' : 'below'} break-even · `]
          : null,
        `${s.wins} W · ${s.losses} L · ${s.breakevens} BE`)),
    stat('Expectancy', s.count ? f(s.expectancy, s.expectancyR, { decimals: 0 }) : '—', sign(s.expectancy),
      el('div', { class: 'db-note' }, el('b', {}, c.rFmt(s.avgR)), ' per trade')),
    stat('Payoff', s.payoff == null ? '—' : [s.payoff.toFixed(2), el('small', {}, ' : 1')], '',
      s.avgWin && s.avgLoss ? el('div', { class: 'db-pay' },
        el('i', { class: 'w', style: { flex: String(s.avgWin) } }), el('i', { class: 'l', style: { flex: String(s.avgLoss) } })) : null,
      el('div', { class: 'db-note' }, 'avg win ', el('b', {}, s.avgWin == null ? '—' : f(s.avgWin, s.avgWinR, { decimals: 0 })),
        ' · avg loss ', el('b', {}, s.avgLoss == null ? '—' : f(-s.avgLoss, s.avgLossR == null ? null : -s.avgLossR, { decimals: 0 })))),
    stat('Profit factor', pf == null ? '—' : isFinite(pf) ? pf.toFixed(2) : '∞', '',
      el('div', { class: 'db-note' },
        pf != null && !isFinite(pf) ? 'no losing trade yet — needs one to mean anything'
          : [el('b', {}, f(s.grossWin, s.grossWinR, { decimals: 0 })), ' won · ', el('b', {}, f(-s.grossLoss, s.grossLossR == null ? null : -s.grossLossR, { decimals: 0 })), ' lost'])),
    stat(`Last ${tail.length} trade${tail.length === 1 ? '' : 's'}`,
      st.nowKind ? [el('span', { class: st.nowKind === 'win' ? 'is-pos' : 'is-neg' }, `${st.now}${st.nowKind === 'win' ? 'W' : 'L'}`), el('small', {}, ' in a row')] : '—', 'is-run',
      el('div', { class: 'db-tape', title: 'Oldest on the left, latest on the right' },
        ...tail.map(x => el('i', { class: x.o === 'win' ? 'w' : x.o === 'loss' ? 'l' : 'b' })))));
}

/* ---------- where it comes from ---------- */
function sourceCard(store, rows, K) {
  const pb = store.playbook;
  const cols = [
    ['Setup', x => x.t.setupId || '_none', k => pb.setups.find(sp => sp.id === k)?.name || 'No setup'],
    ['Session', x => x.t.sessionId || '_out', k => c.sessionLabel(pb, k === '_out' ? null : k)],
    ['Instrument', x => (x.t.pair || '—').toUpperCase(), k => k],
  ].map(([title, keyOf, nameOf]) => {
    const m = new Map();
    for (const x of rows) {
      const k = keyOf(x);
      const gr = m.get(k) || { key: k, name: nameOf(k), net: 0, n: 0, w: 0, l: 0 };
      gr.net += x.v; gr.n++;
      if (x.o === 'win') gr.w++; else if (x.o === 'loss') gr.l++;
      m.set(k, gr);
    }
    return { title, groups: [...m.values()].sort((a, b) => b.net - a.net) };
  });
  const reach = Math.max(1e-9, ...cols.flatMap(col => col.groups.map(gr => Math.abs(gr.net))));
  return el('section', { class: 'card db-src' },
    el('div', { class: 'db-head' }, el('h2', {}, 'Where it comes from'),
      el('span', { class: 's' }, 'net by setup, session and instrument')),
    rows.length
      ? el('div', { class: 'db-cols' }, ...cols.map(col => el('div', { class: 'db-col' },
          el('div', { class: 'db-k' }, col.title),
          el('div', { class: 'db-colrows' }, ...col.groups.map(gr => {
            const w = Math.abs(gr.net) / reach * 50;
            return el('div', { class: 'db-srcrow' },
              el('div', { class: 'top' }, el('span', { class: 'nm', title: gr.name }, gr.name),
                el('span', { class: 'nv ' + sign(gr.net) }, K.fmt(gr.net))),
              el('div', { class: 'db-dbar' }, el('i', { class: 'z' }),
                el('i', { class: 'f bar-fill ' + (gr.net >= 0 ? 'is-pos' : 'is-neg'),
                  style: { left: (gr.net >= 0 ? 50 : 50 - w) + '%', width: w + '%', transformOrigin: gr.net >= 0 ? 'left center' : 'right center' } })),
              el('div', { class: 'mt' }, `${gr.n} trade${gr.n === 1 ? '' : 's'} · ${gr.w + gr.l ? Math.round(gr.w / (gr.w + gr.l) * 100) + '% won' : 'no result'}`));
          })))))
      : el('div', { class: 'db-none' }, 'Nothing in this window.'));
}

/* ---------- the last trades you closed ---------- */
function recentCard(store, acct, nav) {
  const recent = store.tradesFor(acct.id).slice(0, 6);
  const u = store.displayUnit;
  return el('section', { class: 'card db-recent' },
    el('div', { class: 'db-head' }, el('h2', {}, 'Recent trades'),
      el('button', { class: 'db-all', onClick: () => nav.go('#/trades') }, 'View all', icon('chevright', 12, 'currentColor', 2))),
    el('div', { class: 'db-list' }, ...recent.map(t => {
      const o = c.outcome(t), r = c.rMultiple(acct, t);
      const setup = store.playbook.setups.find(x => x.id === t.setupId);
      const tone = o === 'win' ? 'is-pos' : o === 'loss' ? 'is-neg' : '';
      return el('button', { class: 'db-tr', onClick: () => nav.go('#/trade/' + t.id) },
        el('span', { class: 'dot ' + (tone || 'is-flat') }),
        el('span', { class: 'p' }, t.pair || '—',
          el('i', { class: t.side === 'buy' ? 'up' : 'dn', title: t.side === 'buy' ? 'Long' : 'Short' }, t.side === 'buy' ? '↑' : '↓'),
          el('small', {}, [setup ? setup.name : 'No setup', c.shortDate(t.date) + (t.timeOpen ? ' ' + t.timeOpen : '')].join(' · '))),
        el('span', { class: 'r ' + tone }, r == null || !isFinite(r) ? '—' : c.rFmt(r, 1)),
        el('span', { class: 'n' }, c.isForward(t) ? ft() : c.tradeFig(u, acct, t, { decimals: 0 })));
    })));
}

export function tradeRow(t, acct, store, cols, nav) {
  const o = c.outcome(t);
  const r = c.rMultiple(acct, t);
  const setup = store.playbook.setups.find(s => s.id === t.setupId);
  const mark = o === 'win' ? 'var(--green)' : o === 'loss' ? 'var(--orange)' : 'var(--grey-4)';
  const long = t.side === 'buy';
  return el('div', { class: 'tbl-row', style: { gridTemplateColumns: cols, cursor: 'pointer' },
                     onClick: () => nav.go('#/trade/' + t.id) },
    el('span', { style: { display: 'flex', alignItems: 'center', gap: '9px' } },
      el('span', { class: 'bar-mark', style: { background: mark } }),
      el('span', { class: 'ins' }, t.pair)),
    el('span', { class: 'td', style: { color: long ? 'var(--green)' : 'var(--orange)' } }, long ? '▲ Long' : '▼ Short'),
    el('span', { class: 'td' }, c.shortDate(t.date)),
    el('span', { style: { fontSize: '12px', color: 'var(--grey-3)' } }, setup ? setup.name : '—'),
    el('span', { class: 'num' }, c.isForward(t) ? ft() : (t.size ? `${t.size} ${t.sizeUnit || ''}`.trim() : '—')),
    el('span', { class: 'num', style: { color: 'var(--grey-1)' } }, c.rFmt(r)),
    c.isForward(t)
      ? el('span', { class: 'pl' }, ft())
      : el('span', { class: 'pl', style: { color: o === 'win' ? 'var(--green)' : o === 'loss' ? 'var(--orange)' : 'var(--grey-2)' } },
          c.tradeFig(store.displayUnit, acct, t)),
  );
}
