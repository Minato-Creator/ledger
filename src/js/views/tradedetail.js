import { el, icon, toast } from '../ui.js';
import * as c from '../calc.js';

export function tradeDetail(store, nav, id) {
  const acct = store.activeAccount;
  const t = store.trades.find(x => x.id === id);
  if (!t) return el('div', { class: 'view' }, el('div', { class: 'card', style: { flex: 1 } },
    el('div', { class: 'empty' }, el('p', {}, 'That trade is not here any more.'),
      el('button', { class: 'btn btn-quiet', onClick: () => nav.go('#/trades') }, 'Back to trades'))));

  const account = store.allAccounts.find(a => a.id === t.accountId) || acct;
  const r = c.rMultiple(account, t);
  const o = c.outcome(t);
  const planned = c.plannedR(t);
  const oneR = c.oneR(account, t);
  const setup = store.playbook.setups.find(s => s.id === t.setupId);
  const sessionName = c.sessionLabel(store.playbook, t.sessionId);
  const allTags = store.playbook.tagGroups.flatMap(g => g.tags);
  const tags = (t.tagIds || []).map(x => allTags.find(y => y.id === x)).filter(Boolean);
  const cur = account.currency;
  const col = o === 'win' ? 'var(--green)' : o === 'loss' ? 'var(--orange)' : 'var(--grey-2)';

  const row = (k, v, vcol) => el('div', { style: { display: 'flex', alignItems: 'baseline' } },
    el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-5)' } }, k),
    el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px', color: vcol || 'var(--ink-2)' } }, v));

  const head = el('header', { class: 'head' },
    el('button', { style: { width: '32px', height: '32px', borderRadius: '12px', background: 'var(--grey-8)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
      onClick: () => nav.go('#/trades') }, icon('chevleft', 15, 'var(--grey-1)', 2)),
    el('h1', {}, t.pair),
    el('span', { class: 'sub' }, `${c.longDate(t.date)} · ${sessionName} · ${account.name}`),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-quiet', onClick: () => nav.go('#/edit/' + t.id) }, 'Edit'),
    el('button', { class: 'btn btn-ghost', onClick: async () => {
      await store.deleteTrade(t.id); toast('Trade deleted'); nav.go('#/trades');
    } }, 'Delete'),
  );

  const left = el('div', { style: { width: '780px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px' } },
    el('div', { class: 'card', style: { flex: '1' } },
      el('div', { class: 'eyebrow' }, 'Journal'),
      el('div', { style: { marginTop: '13px', fontSize: '13.5px', lineHeight: 1.62, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', flex: '1', overflowY: 'auto' } },
        t.notes || el('span', { style: { color: 'var(--grey-5)' } }, 'No notes on this one.')),
      el('div', { style: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--grey-7)', display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        ...(tags.length ? tags.map(tag => el('span', { class: 'tag' }, tag.name))
                        : [el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-5)' } }, 'No tags')]))),
  );

  const right = el('div', { style: { flex: '1', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' } },
    el('div', { class: 'card light', style: { height: '196px', flex: 'none' } },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        el('span', { class: 'm', style: { fontSize: '11.5px', borderRadius: 'var(--r-pill)', padding: '5px 11px',
          background: t.side === 'buy' ? 'rgba(24,172,101,0.20)' : 'rgba(244,98,74,0.20)',
          color: t.side === 'buy' ? '#0F6B40' : '#A33A2B' } }, t.side === 'buy' ? '▲ Long' : '▼ Short'),
        t.assetClass ? el('span', { class: 'm', style: { fontSize: '11.5px', borderRadius: 'var(--r-pill)', padding: '5px 11px', background: 'var(--grey-1_7)', color: 'var(--grey-8)' } }, t.assetClass) : null),
      el('div', { class: 'kpi-val', style: { marginTop: 'auto', fontSize: '36px' } }, c.tradeFig(store.displayUnit, account, t)),
      el('div', { style: { marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' } },
        el('span', { class: 'm', style: { fontSize: '12px', borderRadius: 'var(--r-pill)', padding: '4px 11px',
          background: o === 'win' ? 'rgba(24,172,101,0.20)' : o === 'loss' ? 'rgba(244,98,74,0.20)' : 'var(--grey-1_7)',
          color: o === 'win' ? '#0F6B40' : o === 'loss' ? '#A33A2B' : 'var(--grey-8)' } }, c.rFmt(r)),
        el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-6)' } },
          store.displayUnit === '$' && account.startingBalance
            ? `${(Math.abs(t.netResult) / account.startingBalance * 100).toFixed(2)}% of account`
            : store.displayUnit === '$' ? ''
            : c.money(t.netResult, { currency: cur })))),

    el('div', { class: 'card', style: { flex: '1', gap: '11px' } },
      el('div', { class: 'eyebrow' }, 'Execution'),
      row('Entry', `${t.entryPrice ?? '—'}${t.timeOpen ? '  ' + t.timeOpen : ''}`),
      row('Stop', t.stopLoss ?? '—'),
      row('Target', t.takeProfit ?? '—'),
      row('Exit', `${t.exitPrice ?? '—'}${t.timeClose ? '  ' + t.timeClose : ''}`),
      el('div', { style: { height: '1px', background: 'var(--grey-7)' } }),
      row('Size', t.size ? `${t.size} ${t.sizeUnit || ''}`.trim() : '—'),
      row('Risk set', `${Number(t.riskPercent).toFixed(2)}%  = ${c.money(oneR, { sign: false, currency: cur })}`),
      row('Result entered', c.money(t.netResult, { currency: cur }), col),
      row('R = result ÷ 1R', c.rFmt(r), col),
      row('Planned R:R', planned == null ? '—' : `1 : ${planned.toFixed(2)}`),
      row('Setup', setup ? setup.name : '—'),
      row('Session', sessionName + (t.sessionAuto === false ? '  (set by hand)' : '')),
      row('Time in trade', c.durationFmt(c.durationMins(t.timeOpen, t.timeClose))),
      planned != null && r != null
        ? el('div', { style: { marginTop: 'auto', background: 'var(--grey-7)', borderRadius: 'var(--r-inset)', padding: '15px 17px' } },
            el('div', { class: 'eyebrow', style: { marginBottom: '7px' } }, 'Captured versus planned'),
            el('div', { class: 'm', style: { fontSize: '19px', color: 'var(--ink)', lineHeight: 1 } },
              `${r.toFixed(2)}R of a planned ${planned.toFixed(2)}R`),
            )
        : null),
  );

  return el('div', { class: 'view' }, head, el('div', { class: 'row', style: { flex: '1' } }, left, right));
}
