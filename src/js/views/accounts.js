import { el, icon, toast, brandMark } from '../ui.js';
import * as c from '../calc.js';
import { todayISO } from '../store.js';
import { accountActions } from './accountActions.js';

const COLORS = ['#0988F0', '#18AC65', '#FFB800', '#F4624A', '#9A9A9A', '#E9E9E9'];

export function accounts(store, nav, { formOnly = false } = {}) {
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

  const list = el('section', { class: 'card', style: { width: '100%', flex: 'none', padding: '26px 28px', maxHeight: '58vh' } });

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
            el('span', { class: 'm', style: { fontSize: '14px', color: 'var(--ink)' } }, a.name),
            isActive ? el('span', { class: 'm', style: { fontSize: '9.5px', color: '#fff', background: 'var(--blue)', borderRadius: 'var(--r-pill)', padding: '2px 8px' } }, 'ACTIVE') : null,
            a.archived ? el('span', { class: 'm', style: { fontSize: '9.5px', color: 'var(--grey-3)', background: 'var(--grey-7)', borderRadius: 'var(--r-pill)', padding: '2px 8px' } }, 'ARCHIVED') : null),
          el('div', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)', marginTop: '5px' } },
            `Started ${c.money(a.startingBalance, { sign: false, currency: a.currency, decimals: 0 })} · opened ${c.longDate(a.openedAt)} · ${ts.length} trade${ts.length === 1 ? '' : 's'}`)),
        el('div', { style: { marginLeft: 'auto', textAlign: 'right' } },
          el('div', { class: 'm', style: { fontSize: '16px', color: 'var(--ink)', lineHeight: 1 } },
            c.money(bal, { sign: false, currency: a.currency })),
          el('div', { class: 'm', style: { fontSize: '11px', marginTop: '5px', color: s.net > 0 ? 'var(--green)' : s.net < 0 ? 'var(--orange)' : 'var(--grey-5)' } },
            c.fig(store.displayUnit, a, s.net, s.netR)
              + (store.displayUnit === '$'
                  ? ` · ${(pctChange >= 0 ? '+' : '−')}${Math.abs(pctChange * 100).toFixed(2)}%`
                  : ` · ${c.money(s.net, { currency: a.currency, decimals: 0 })}`))),
        accountActions(store, nav, a),
      );
    });

    list.replaceChildren(
      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '12px' } },
        el('h2', {}, 'Your accounts'),
        el('span', { class: 'note' }, `${store.accounts.length} active`)),
      el('div', { style: { marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '8px',
                           overflowY: 'auto', minHeight: 0 } },
        ...rows,
        rows.length ? null : el('p', { style: { fontSize: '13px', color: 'var(--grey-3)' } }, 'No accounts yet.')),
    );
  }
  paintList();

  const lbl = t => el('span', { class: 'lbl' }, t);
  const first = !store.accounts.length;

  /* The only two answers the form actually needs. Everything else has a
     sensible default, so these are the only things that can hold it up. */
  const nameInput = el('input', { class: 'field', placeholder: 'Swing account',
    oninput: e => { draft.name = e.target.value; settle(); } });
  const balInput = el('input', { class: 'field', inputmode: 'decimal', placeholder: '50 000',
    oninput: e => { draft.startingBalance = e.target.value; echoBalance(); settle(); } });
  const missingNote = el('div', { class: 'missing-note' });
  const cta = el('button', { class: 'btn btn-primary is-waiting', style: { flex: '1', justifyContent: 'center' } }, 'Create account');

  const describe = missing => 'Needs ' + missing.map(([, what]) => what).join(' and ');

  const whatIsMissing = () => {
    const out = [];
    if (!draft.name.trim()) out.push([nameInput, 'a name']);
    const bal = c.parseNumber(draft.startingBalance);
    if (!(bal > 0)) out.push([balInput, 'a starting balance']);
    return out;
  };

  /* Called on every keystroke: the button goes live the moment the form can
     be answered, and any red already showing clears itself as you fix it. */
  function settle() {
    const missing = whatIsMissing();
    cta.classList.toggle('is-waiting', missing.length > 0);
    cta.classList.remove('is-refused');
    for (const f of [nameInput, balInput]) {
      const stillMissing = missing.some(([el]) => el === f);
      f.classList.toggle('is-missing', stillMissing && f.dataset.flagged === '1');
      if (!stillMissing) delete f.dataset.flagged;
    }
    // Once it has spoken, it keeps up: the line shrinks as you fill things in
    // rather than still asking for something you have already given it.
    if (!missing.length) missingNote.textContent = '';
    else if (missingNote.textContent) missingNote.textContent = describe(missing);
  }

  let refuseTimer;
  cta.addEventListener('click', async () => {
    const missing = whatIsMissing();
    if (missing.length) {
      for (const [f] of missing) { f.dataset.flagged = '1'; f.classList.add('is-missing'); f.setAttribute('aria-invalid', 'true'); }
      missingNote.textContent = describe(missing);
      cta.classList.remove('is-refused');
      void cta.offsetWidth;                       // replay the animation on a second press
      cta.classList.add('is-refused');
      clearTimeout(refuseTimer);
      refuseTimer = setTimeout(() => cta.classList.remove('is-refused'), 900);
      missing[0][0].focus();
      return;
    }
    const a = await store.addAccount({ ...draft,
      startingBalance: c.parseNumber(draft.startingBalance),
      defaultRiskPercent: c.parseNumber(draft.defaultRiskPercent) ?? 1 });
    toast('Created ' + a.name);
    nav.refresh();
  });
  const create = el('div', { class: 'card', style: { width: '540px', flex: 'none', gap: '16px', padding: '28px 30px' } },
    el('h2', {}, first ? 'Set up your first account' : 'New account'),
    el('div', {}, lbl('Account name'),
      nameInput),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 96px', gap: '10px' } },
      el('div', {}, lbl('Starting balance'),
        balInput,
        balanceEcho),
      el('div', {}, lbl('Currency'),
        el('select', { class: 'field', style: { cursor: 'pointer' }, onchange: e => draft.currency = e.target.value },
          ...['USD', 'EUR', 'GBP', 'AUD', 'JPY'].map(x => el('option', { value: x }, x))))),
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
    el('div', { style: { marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' } },
      el('div', { style: { display: 'flex', gap: '7px' } }, cta),
      missingNote),
  );

  /* Settings → Accounts holds the list now; it borrows just the form. */
  if (formOnly) return create;

  /* First run is one decision, so the screen shows one thing: the form,
     centred, at a size you can take in at a glance. Everything else — the
     list, the page heading — has nothing to say until an account exists. */
  if (first) {
    return el('div', { class: 'view' },
      el('div', { style: { flex: '1', display: 'flex', flexDirection: 'column',
                           alignItems: 'center', justifyContent: 'center', gap: '20px' } },
        el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' } },
          el('div', { class: 'brand-mark', style: { width: '64px', height: '64px' } }, brandMark(64)),
          el('div', { style: { textAlign: 'center' } },
            el('h1', { class: 'welcome-title' }, 'Welcome to Laminar'),
            el('p', { class: 'm', style: { margin: '9px 0 0', fontSize: '12.5px', color: 'var(--grey-5)' } },
              'Your edge, in writing.'))),
        create));
  }

  /* Afterwards: a centred column that stops at its content. The list grows
     with the accounts and only starts scrolling once it would otherwise push
     the page around. */
  const addToggle = el('button', {
    style: { border: '1px dashed var(--grey-6)', borderRadius: '26px', padding: '16px 20px',
             display: 'flex', alignItems: 'center', gap: '11px', width: '100%' },
    onClick: () => { formWrap.hidden = false; addToggle.hidden = true; formWrap.querySelector('input')?.focus(); } },
    icon('plus', 16, 'var(--grey-5)', 2),
    el('span', { class: 'm', style: { fontSize: '12.5px', color: 'var(--grey-5)' } }, 'New account'));

  const formWrap = el('div', { hidden: true, style: { display: 'flex', justifyContent: 'center' } }, create);

  return el('div', { class: 'view' }, head,
    el('div', { style: { flex: '1', minHeight: 0, display: 'flex', flexDirection: 'column',
                         alignItems: 'flex-start', gap: '10px', width: '100%', maxWidth: '860px' } },
      list, addToggle, formWrap));
}
