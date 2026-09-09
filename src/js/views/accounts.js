import { el, icon, toast } from '../ui.js';
import * as c from '../calc.js';
import { todayISO } from '../store.js';

const COLORS = ['#0988F0', '#18AC65', '#FFB800', '#F4624A', '#9A9A9A', '#E9E9E9'];

export function accounts(store, nav) {
  const draft = { name: '', startingBalance: '', currency: 'USD', defaultRiskPercent: '1.00', color: COLORS[1] };

  /* The balance field takes 25000, 25 000, $25,000 — whatever you type. Since
     it is forgiving, it has to show what it read back, so a guess is never
     silent. It also shows what 1R will cost, which is the reason the number
     matters at all. */
  const balanceEcho = el('div', { class: 'm', style: { marginTop: '7px', fontSize: '10.5px', color: 'var(--grey-5)' } });
  function echoBalance() {
    const n = c.parseNumber(draft.startingBalance);
    const risk = c.parseNumber(draft.defaultRiskPercent);
    if (draft.startingBalance.trim() === '') { balanceEcho.textContent = ''; return; }
    if (n == null || n <= 0) {
      balanceEcho.textContent = 'Not a number yet';
      balanceEcho.style.color = 'var(--yellow)';
      return;
    }
    balanceEcho.style.color = 'var(--grey-5)';
    const oneR = risk > 0 ? n * risk / 100 : null;
    balanceEcho.textContent = c.money(n, { sign: false, currency: draft.currency, decimals: 0 })
      + (oneR ? `  ·  1R = ${c.money(oneR, { sign: false, currency: draft.currency })}` : '');
  }

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Accounts'),
    el('span', { class: 'sub' }, 'Each keeps its own trades and stats'),
  );

  const list = el('section', { class: 'card', style: { width: '700px', flex: 'none', padding: '26px 28px' } });

  function paintList() {
    const rows = store.allAccounts.map(a => {
      const ts = store.tradesFor(a.id);
      const s = c.summarise(a, ts);
      const bal = a.startingBalance + s.net;
      const pctChange = a.startingBalance ? s.net / a.startingBalance : 0;
      const isActive = store.activeAccount && store.activeAccount.id === a.id;
      return el('div', {
        style: {
          background: isActive ? 'var(--grey-7)' : 'var(--grey-9)', borderRadius: '26px', padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer',
          boxShadow: isActive ? 'inset 0 0 0 1px var(--blue)' : 'none', opacity: a.archived ? .55 : 1,
        },
        onClick: async () => { await store.setActiveAccount(a.id); toast('Switched to ' + a.name); nav.refresh(); },
      },
        el('span', { style: { width: '11px', height: '11px', borderRadius: '3px', background: a.color, flex: 'none' } }),
        el('div', { style: { minWidth: 0 } },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px' } },
            el('span', { class: 'm', style: { fontSize: '14px', color: '#fff' } }, a.name),
            isActive ? el('span', { class: 'm', style: { fontSize: '9.5px', color: '#fff', background: 'var(--blue)', borderRadius: 'var(--r-pill)', padding: '2px 8px' } }, 'ACTIVE') : null,
            a.archived ? el('span', { class: 'm', style: { fontSize: '9.5px', color: 'var(--grey-3)', background: 'var(--grey-7)', borderRadius: 'var(--r-pill)', padding: '2px 8px' } }, 'ARCHIVED') : null),
          el('div', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)', marginTop: '5px' } },
            `Started ${c.money(a.startingBalance, { sign: false, currency: a.currency, decimals: 0 })} · opened ${c.longDate(a.openedAt)} · ${ts.length} trade${ts.length === 1 ? '' : 's'}`)),
        el('div', { style: { marginLeft: 'auto', textAlign: 'right' } },
          el('div', { class: 'm', style: { fontSize: '16px', color: '#fff', lineHeight: 1 } },
            c.money(bal, { sign: false, currency: a.currency })),
          el('div', { class: 'm', style: { fontSize: '11px', marginTop: '5px', color: s.net > 0 ? 'var(--green)' : s.net < 0 ? 'var(--orange)' : 'var(--grey-5)' } },
            c.fig(store.displayUnit, a, s.net, s.netR)
              + (store.displayUnit === '$'
                  ? ` · ${(pctChange >= 0 ? '+' : '−')}${Math.abs(pctChange * 100).toFixed(2)}%`
                  : ` · ${c.money(s.net, { currency: a.currency, decimals: 0 })}`))),
        el('button', { title: a.archived ? 'Restore' : 'Archive',
          style: { width: '28px', height: '28px', borderRadius: '10px', background: 'var(--grey-7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' },
          onClick: async e => { e.stopPropagation(); await store.updateAccount(a.id, { archived: !a.archived }); nav.refresh(); } },
          icon(a.archived ? 'check' : 'trash', 13, 'var(--grey-3)', 1.8)),
      );
    });

    list.replaceChildren(
      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '12px' } },
        el('h2', {}, 'Your accounts'),
        el('span', { class: 'note' }, `${store.accounts.length} active`)),
      el('div', { style: { marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' } },
        ...rows,
        rows.length ? null : el('p', { style: { fontSize: '13px', color: 'var(--grey-3)' } }, 'No accounts yet.')),
    );
  }
  paintList();

  const lbl = t => el('span', { class: 'lbl' }, t);
  const create = el('div', { class: 'card', style: { flex: '1', minWidth: 0, gap: '16px', padding: '26px 28px' } },
    el('div', {}, el('h2', {}, 'New account'),
      el('div', { class: 'm', style: { marginTop: '6px', fontSize: '11px', color: 'var(--grey-5)' } }, 'Two fields are required — the rest have defaults.')),
    el('div', {}, lbl('Account name'),
      el('input', { class: 'field', placeholder: 'Swing account', oninput: e => draft.name = e.target.value }),
      el('div', { class: 'm', style: { marginTop: '7px', fontSize: '10.5px', color: 'var(--grey-5)' } }, 'Anything you like — it is just a label.')),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 96px', gap: '10px' } },
      el('div', {}, lbl('Starting balance'),
        el('input', { class: 'field', inputmode: 'decimal', placeholder: '50 000',
          oninput: e => { draft.startingBalance = e.target.value; echoBalance(); } }),
        balanceEcho),
      el('div', {}, lbl('Currency'),
        el('select', { class: 'field', style: { cursor: 'pointer' }, onchange: e => draft.currency = e.target.value },
          ...['USD', 'EUR', 'GBP', 'AUD', 'JPY'].map(x => el('option', { value: x, style: { background: '#363636' } }, x))))),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
      el('div', {}, lbl('Default risk %'),
        el('input', { class: 'field', inputmode: 'decimal', value: '1.00',
          oninput: e => { draft.defaultRiskPercent = e.target.value; echoBalance(); } })),
      el('div', {}, lbl('Opened'),
        el('input', { class: 'field', type: 'date', value: todayISO(), oninput: e => draft.openedAt = e.target.value }))),
    el('div', {}, lbl('Colour'),
      el('div', { style: { display: 'flex', gap: '7px' } },
        ...COLORS.map((col, i) => el('button', {
          style: { width: '26px', height: '26px', borderRadius: '8px', background: col,
                   boxShadow: i === 1 ? '0 0 0 2px var(--grey-8), 0 0 0 3.5px #fff' : 'none' },
          onClick: e => { draft.color = col;
            [...e.target.parentNode.children].forEach(x => x.style.boxShadow = 'none');
            e.target.style.boxShadow = '0 0 0 2px var(--grey-8), 0 0 0 3.5px #fff'; } })))),
    el('div', { style: { marginTop: 'auto', display: 'flex', gap: '7px' } },
      el('button', { class: 'btn btn-primary', style: { flex: '1', justifyContent: 'center' },
        onClick: async () => {
          if (!draft.name.trim()) return toast('Give the account a name', 'warn');
          const bal = c.parseNumber(draft.startingBalance);
          if (!bal || bal <= 0) return toast('A starting balance is needed — it is what risk % is measured against', 'warn');
          const a = await store.addAccount({ ...draft, startingBalance: bal,
            defaultRiskPercent: c.parseNumber(draft.defaultRiskPercent) ?? 1 });
          toast('Created ' + a.name);
          nav.refresh();
        } }, 'Create account')),
  );

  return el('div', { class: 'view' }, head, el('div', { class: 'row', style: { flex: '1' } }, list, create));
}
