import { el, icon, lineChart, clear } from '../ui.js';
import * as c from '../calc.js';

let period = '30D';
const DAYS = { '7D': 7, '30D': 30, '90D': 90, 'All': null };

function withinPeriod(trades) {
  const days = DAYS[period];
  if (!days) return trades;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const iso = cutoff.toISOString().slice(0, 10);
  return trades.filter(t => t.date >= iso);
}

function kpi({ label, value, unit, sub, light, valueClass }) {
  return el('div', { class: 'card' + (light ? ' light' : ''), style: { padding: '26px 26px 24px' } },
    el('div', { class: 'eyebrow' }, label),
    el('div', { class: 'kpi-val ' + (valueClass || ''), style: { marginTop: 'auto' } },
      value, unit ? el('span', { class: 'unit' }, unit) : null),
    sub ? el('div', { class: 'm', style: { marginTop: '11px', fontSize: '10.5px', color: light ? 'var(--grey-6)' : 'var(--grey-5)' } }, sub) : null,
  );
}

export function dashboard(store, nav) {
  const acct = store.activeAccount;
  const all = store.tradesFor(acct.id);
  const trades = withinPeriod(all);
  const s = c.summarise(acct, trades);
  const curve = c.equityCurve(trades, acct);
  const cur = acct.currency;
  const u = store.displayUnit;
  /* One figure, read in whichever unit is switched on. `f` takes the dollar
     amount and the R total for the same thing — R is never worked back out of
     dollars, because each trade carries its own risk. */
  const f = (d, r, o) => c.fig(u, acct, d, r, o);
  const v = (d, r) => c.figValue(u, acct, d, r);
  const dd = c.maxDrawdown(curve, u === 'R' ? 'equityR' : 'equity');

  const head = el('header', { class: 'head' },
    el('div', {},
      el('h1', {}, 'Dashboard'),
    ),
    el('span', { class: 'sub', style: { marginLeft: '12px' } },
      period === 'All' ? 'All time' : `Rolling ${DAYS[period]} days`, ' · ', acct.name),
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

  const kpis = el('section', { class: 'grid4', style: { height: '160px', flex: 'none' } },
    kpi({ label: u === 'R' ? 'Net R' : u === '%' ? 'Net return' : 'Net P&L',
          valueClass: s.net > 0 ? 'pos' : s.net < 0 ? 'neg' : 'flat',
          value: f(s.net, s.netR),
          sub: `${s.count} trade${s.count === 1 ? '' : 's'}` }),
    kpi({ label: 'Win rate', value: s.winRate == null ? '—' : c.pct(s.winRate), unit: '',
          sub: `${s.wins} W · ${s.losses} L · ${s.breakevens} BE` }),
    kpi({ label: 'Profit factor', light: true,
          value: (s.profitFactor == null || !isFinite(s.profitFactor)) ? '—' : s.profitFactor.toFixed(2),
          sub: (s.profitFactor != null && !isFinite(s.profitFactor))
            ? 'no losing trades yet — needs one to mean anything'
            : `${f(s.grossWin, s.grossWinR, { sign: false })} won / ${f(s.grossLoss, s.grossLossR, { sign: false })} lost` }),
    kpi({ label: 'Avg R', value: c.rFmt(s.avgR), valueClass: s.avgR > 0 ? 'pos' : s.avgR < 0 ? 'neg' : '',
          sub: u === 'R' ? (s.payoff == null ? 'needs a win and a loss' : `Payoff ${s.payoff.toFixed(2)} : 1`)
                         : `Expectancy ${f(s.expectancy, s.expectancyR)} / trade` }),
  );

  // win-rate bar under the second tile
  const wr = kpis.children[1];
  if (s.count) {
    const bar = el('div', { style: { marginTop: '10px', display: 'flex', gap: '3px', alignItems: 'center' } },
      el('div', { class: 'bar-fill', style: { height: '5px', borderRadius: '3px', background: 'var(--green)', width: (s.wins / s.count * 100) + '%' } }),
      el('div', { style: { height: '5px', borderRadius: '3px', background: 'var(--grey-4)', width: (s.breakevens / s.count * 100) + '%' } }),
      el('div', { style: { height: '5px', borderRadius: '3px', background: 'var(--orange)', flex: '1' } }));
    wr.insertBefore(bar, wr.lastChild);
  }

  const chartCard = el('div', { class: 'card', style: { width: '800px', flex: 'none' } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '12px' } },
      el('h2', {}, 'Equity curve'),
      el('span', { class: 'note' }, `${curve.length} session${curve.length === 1 ? '' : 's'}`),
      el('span', { class: 'spacer' }),
      el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
        el('span', { style: { width: '14px', height: '2px', borderRadius: '2px', background: 'var(--green)' } }),
        el('span', { class: 'note' }, 'Closed equity')),
      dd ? el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '10px' } },
        el('span', { style: { width: '14px', height: '9px', borderRadius: '2px', background: 'rgba(244,98,74,0.25)' } }),
        el('span', { class: 'note' }, 'Drawdown ' + (u === 'R' ? c.rFmt(-dd.amount) : f(-dd.amount, null)))) : null,
    ),
    el('div', { style: { marginTop: '10px' } },
      lineChart({
        points: curve.map(p => ({ v: v(p.equity, p.equityR) ?? 0, date: p.date })),
        drawdown: dd,
        fmtY: n => u === 'R' ? c.rFmt(n, 1) : u === '%' ? c.pctSigned(n, 1) : c.money(n, { sign: false, currency: cur, decimals: 0 }),
        fmtX: p => c.shortDate(p.date),
      })),
  );

  const best = [...curve].sort((a, b) => b.day - a.day)[0];
  const worst = [...curve].sort((a, b) => a.day - b.day)[0];
  const statRow = (k, v, cls) => el('div', { style: { display: 'flex', alignItems: 'baseline' } },
    el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-6)' } }, k),
    el('span', { class: 'm ' + (cls || ''), style: { marginLeft: 'auto', fontSize: '12.5px' } }, v));

  const sideCard = el('div', { class: 'card light', style: { flex: '1', minWidth: 0 } },
    el('h2', {}, 'This period'),
    el('div', { style: { marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' } },
      statRow('Best day', f(best.day, best.dayR)),
      statRow('Worst day', f(worst.day, worst.dayR)),
      statRow('Max drawdown', dd ? (u === 'R' ? c.rFmt(-dd.amount) : f(-dd.amount, null)) : '—'),
      statRow('Avg win', f(s.avgWin, s.avgWinR)),
      statRow('Avg loss', s.avgLoss == null ? '—' : f(-s.avgLoss, s.avgLossR == null ? null : -s.avgLossR)),
      statRow('Payoff ratio', s.payoff == null ? '—' : s.payoff.toFixed(2) + ' : 1'),
      statRow('Break even at', s.breakEvenWinRate == null ? '—' : c.pct(s.breakEvenWinRate) + ' win rate'),
    ));

  const mid = el('section', { class: 'row', style: { height: '296px', flex: 'none' } }, chartCard, sideCard);

  // recent trades
  const cols = '176px 84px 96px minmax(0,1fr) 96px 78px 132px';
  const recent = store.tradesFor(acct.id).slice(0, 6);
  const tbl = el('section', { class: 'card', style: { flex: '1', padding: '22px 26px 18px' } },
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
      el('h2', {}, 'Recent trades'),
      el('span', { class: 'note' }, `last ${recent.length} closed`),
      el('span', { class: 'spacer' }),
      el('button', { class: 'm', style: { fontSize: '11.5px', color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: '6px' },
                     onClick: () => nav.go('#/trades') }, 'View all', icon('chevright', 13, 'var(--blue)', 2))),
    el('div', { class: 'tbl', style: { marginTop: '12px' } },
      el('div', { class: 'tbl-head', style: { gridTemplateColumns: cols } },
        el('span', {}, 'Instrument'), el('span', {}, 'Side'), el('span', {}, 'Closed'), el('span', {}, 'Setup'),
        el('span', { style: { textAlign: 'right' } }, 'Size'), el('span', { style: { textAlign: 'right' } }, 'R'),
        el('span', { style: { textAlign: 'right' } }, u === 'R' ? 'Result' : u === '%' ? 'Return' : 'Net P&L')),
      el('div', { class: 'tbl-body' },
        ...recent.map(t => tradeRow(t, acct, store, cols, nav)))),
  );

  return el('div', { class: 'view' }, head, kpis, mid, tbl);
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
    el('span', { class: 'num' }, t.size ? `${t.size} ${t.sizeUnit || ''}`.trim() : '—'),
    el('span', { class: 'num', style: { color: 'var(--grey-1)' } }, c.rFmt(r)),
    el('span', { class: 'pl', style: { color: o === 'win' ? 'var(--green)' : o === 'loss' ? 'var(--orange)' : 'var(--grey-2)' } },
      c.tradeFig(store.displayUnit, acct, t)),
  );
}
