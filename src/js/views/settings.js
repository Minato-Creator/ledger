/* ============================================================
   settings.js — the account settings, and one backup box.

   Backup used to take the whole page. It is a thing you touch twice a year;
   the accounts are the thing you actually come here to change.
   ============================================================ */
import { el, icon, toast } from '../ui.js';
import * as c from '../calc.js';
import { toCSV, parseCSV, planImport, applyImport } from '../csv.js';

let pending = null;              // { fileName, size, records, plan }
const COLOURS = ['#0988F0', '#18AC65', '#FFB800', '#F4624A', '#9A9A9A', '#E9E9E9'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'JPY'];

export function settings(store, nav) {
  const scopeAll = { value: true };

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Settings'),
    el('div', { class: 'spacer' }),
    /* Native can move the journal; the browser cannot re-point a granted
       folder handle without going through its own picker, so there it stays
       a label. */
    store.isNative
      ? el('button', { class: 'm', title: (store.folderPath || '') + ' — click to move your journal somewhere else',
          style: { fontSize: '11.5px', color: 'var(--grey-8)', background: 'var(--grey-2)',
                   borderRadius: 'var(--r-pill)', padding: '5px 12px', display: 'inline-flex',
                   alignItems: 'center', gap: '7px' },
          onClick: async () => {
            try {
              if (await store.connect()) { toast('Journal moved to ' + store.folderName); nav.refresh(); }
            } catch (e) { toast(e.message, 'bad'); }
          } },
          icon('folder', 12, 'var(--grey-8)', 1.8), store.folderName || 'Choose a folder')
      : el('span', { class: 'm', title: 'Your journal folder — copy it to back up',
          style: { fontSize: '11.5px', color: 'var(--grey-8)', background: 'var(--grey-2)',
                   borderRadius: 'var(--r-pill)', padding: '5px 12px' } },
          store.folderName ? 'Folder · ' + store.folderName : 'No folder'),
  );

  /* ============================================================
     Accounts
     ============================================================ */
  const list = el('div', { style: { marginTop: '18px', display: 'flex', flexDirection: 'column',
                                    gap: '8px', overflowY: 'auto', minHeight: 0 } });

  /* A small labelled field that commits on blur or Enter, and only when the
     value actually reads as a number — a half-typed balance must never be
     written, because every R on the account is measured against it. */
  const numField = (label, value, suffix, onCommit, opts = {}) => {
    const input = el('input', { class: 'm', value,
      style: { width: opts.width || '96px', background: 'var(--grey-7)', borderRadius: '10px',
               padding: '6px 9px', fontSize: '11.5px', color: '#fff' },
      onChange: e => {
        const n = c.parseNumber(e.target.value);
        if (n == null || n < 0 || (opts.positive && n <= 0)) { e.target.value = value; return toast('Not a number', 'warn'); }
        onCommit(n);
      },
      onKeydown: e => { if (e.key === 'Enter') e.target.blur(); } });
    return el('label', { style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
      el('span', { class: 'm', style: { fontSize: '9.5px', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--grey-5)' } }, label),
      el('span', { style: { display: 'flex', alignItems: 'center', gap: '5px' } },
        input, suffix ? el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-5)' } }, suffix) : null));
  };

  function accountRow(a) {
    const isActive = store.activeAccount && a.id === store.activeAccount.id;
    const ts = store.tradesFor(a.id);
    const s = c.summarise(a, ts);
    const oneR = a.startingBalance * (Number(a.defaultRiskPercent) || 0) / 100;

    const save = async patch => { await store.updateAccount(a.id, patch); nav.refresh(); };

    return el('div', { style: {
        background: 'var(--grey-9)', borderRadius: '24px', padding: '15px 18px',
        display: 'flex', flexDirection: 'column', gap: '13px',
        boxShadow: isActive ? 'inset 0 0 0 1px var(--blue)' : 'none', opacity: a.archived ? .55 : 1 } },

      el('div', { style: { display: 'flex', alignItems: 'center', gap: '11px' } },
        el('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: a.color, flex: 'none' } }),
        el('input', { class: 'm', value: a.name, title: 'Rename this account',
          style: { flex: '1', minWidth: 0, fontSize: '14px', color: '#fff', background: 'transparent' },
          onChange: e => {
            const v = e.target.value.trim();
            if (!v) { e.target.value = a.name; return; }
            save({ name: v });
          } }),
        isActive ? el('span', { class: 'm', style: { fontSize: '9.5px', color: '#fff', background: 'var(--blue)',
          borderRadius: 'var(--r-pill)', padding: '2px 8px', flex: 'none' } }, 'ACTIVE') : null,
        a.archived ? el('span', { class: 'm', style: { fontSize: '9.5px', color: 'var(--grey-3)', background: 'var(--grey-7)',
          borderRadius: 'var(--r-pill)', padding: '2px 8px', flex: 'none' } }, 'ARCHIVED') : null,
        el('button', { title: a.archived ? 'Restore' : 'Archive — it stays in the folder, it just leaves the switcher',
          style: { width: '26px', height: '26px', borderRadius: '9px', background: 'var(--grey-7)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' },
          onClick: () => save({ archived: !a.archived }) },
          icon(a.archived ? 'check' : 'trash', 12, 'var(--grey-3)', 1.8))),

      el('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' } },
        numField('Starting balance', a.startingBalance, null,
          n => save({ startingBalance: n }), { positive: true, width: '104px' }),
        numField('Risk', a.defaultRiskPercent, '%', n => save({ defaultRiskPercent: n }), { width: '62px' }),
        numField('Weekly target', a.weeklyTargetPercent || 0, '%', n => save({ weeklyTargetPercent: n }), { width: '62px' }),
        el('label', { style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
          el('span', { class: 'm', style: { fontSize: '9.5px', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--grey-5)' } }, 'Currency'),
          el('select', { class: 'm', style: { background: 'var(--grey-7)', borderRadius: '10px', padding: '6px 9px',
              fontSize: '11.5px', color: '#fff', cursor: 'pointer' },
            onChange: e => save({ currency: e.target.value }) },
            ...CURRENCIES.map(x => el('option', { value: x, selected: x === a.currency, style: { background: '#363636' } }, x)))),
        el('div', { style: { display: 'flex', gap: '5px', marginLeft: 'auto', paddingBottom: '6px' } },
          ...COLOURS.map(col => el('button', { title: 'Recolour',
            style: { width: '15px', height: '15px', borderRadius: '5px', background: col,
                     boxShadow: a.color === col ? '0 0 0 2px var(--grey-9), 0 0 0 3px #fff' : 'none' },
            onClick: () => save({ color: col }) })))),

      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '14px', paddingTop: '2px' } },
        el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } },
          `1R = ${c.money(oneR, { sign: false, currency: a.currency })}`),
        el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } },
          `${ts.length} trade${ts.length === 1 ? '' : 's'}`),
        el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12px',
            color: s.net > 0 ? 'var(--green)' : s.net < 0 ? 'var(--orange)' : 'var(--grey-5)' } },
          c.money(a.startingBalance + s.net, { sign: false, currency: a.currency, decimals: 0 })
          + '  ' + c.pctSigned(c.asPercent(a, s.net)))),
    );
  }

  list.replaceChildren(
    ...store.allAccounts.map(accountRow),
    el('button', { style: { border: '1px dashed var(--grey-6)', borderRadius: '24px', padding: '15px 18px',
                            display: 'flex', alignItems: 'center', gap: '11px', width: '100%' },
      onClick: () => nav.go('#/accounts') },
      icon('plus', 16, 'var(--grey-5)', 2),
      el('span', { class: 'm', style: { fontSize: '12.5px', color: 'var(--grey-5)' } }, 'New account')),
  );

  const accountsCard = el('section', { class: 'card', style: { flex: '1', minWidth: 0, display: 'flex',
                                                               flexDirection: 'column', minHeight: 0,
                                                               alignSelf: 'flex-start', maxHeight: '100%' } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } },
      el('h2', {}, 'Accounts'),
      el('span', { class: 'note', title: 'Changing a starting balance re-measures every R and every % on that account' },
        'name, balance, risk and target')),
    list);

  /* ============================================================
     Backup — export and import, one box
     ============================================================ */
  const countEl = el('span', { class: 'm', style: { fontSize: '20px', color: '#fff' } });
  const metaEl = el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } });

  function refreshCounts() {
    const ids = scopeAll.value ? null : [store.activeAccount?.id];
    const rows = store.trades.filter(t => !ids || ids.includes(t.accountId));
    const bytes = new Blob([toCSV(store, ids)]).size;
    countEl.textContent = `${rows.length} trade${rows.length === 1 ? '' : 's'}`;
    const kb = bytes / 1024;
    metaEl.textContent = `${scopeAll.value ? store.allAccounts.length + ' accounts' : store.activeAccount?.name || '—'}`
      + ` · ${kb < 1 ? '<1' : kb.toFixed(0)} KB`;
  }

  async function doExport() {
    const ids = scopeAll.value ? null : [store.activeAccount.id];
    const text = toCSV(store, ids);
    const name = `ledger-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    // Into the journal folder so it lands somewhere findable, and as a
    // download so it can go on a stick. Either way you have it.
    try { await store.writeText(name, text); } catch { /* the folder copy is best-effort */ }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Exported ${name}`);
  }

  const scopeChips = el('span', { style: { display: 'flex', gap: '5px' } });
  function paintScope() {
    scopeChips.replaceChildren(
      ...[[true, 'All'], [false, 'This account']].map(([v, label]) =>
        el('button', { class: 'chip' + (scopeAll.value === v ? ' is-on' : ''),
          style: { padding: '6px 11px', fontSize: '11px' },
          onClick: () => { scopeAll.value = v; paintScope(); refreshCounts(); } }, label)));
  }
  paintScope();

  const importBody = el('div', {});
  function paintImport() {
    if (!pending) {
      importBody.replaceChildren(
        el('label', { style: {
            display: 'flex', alignItems: 'center', gap: '11px', cursor: 'pointer',
            border: '1px dashed var(--grey-6)', borderRadius: 'var(--r-inset)',
            background: 'var(--grey-9)', padding: '15px 16px' } },
          icon('folder', 18, 'var(--grey-5)', 1.6),
          el('span', { class: 'm', style: { fontSize: '12px', color: 'var(--grey-3)' } }, 'Choose a Ledger CSV'),
          el('input', { type: 'file', accept: '.csv,text/csv', style: { display: 'none' },
            onChange: async e => {
              const file = e.target.files[0]; if (!file) return;
              const records = parseCSV(await file.text());
              pending = { fileName: file.name, size: file.size, records, plan: planImport(store, records) };
              paintImport();
            } })));
      return;
    }

    const p = pending.plan;
    const row = (k, v, col) => el('div', { style: { display: 'flex', alignItems: 'baseline' } },
      el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-5)' } }, k),
      el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12px', color: col || 'var(--ink-2)' } }, v));

    importBody.replaceChildren(
      el('div', { style: { background: 'var(--grey-9)', borderRadius: 'var(--r-inset)', padding: '13px 15px',
                           display: 'flex', alignItems: 'center', gap: '10px', boxShadow: 'inset 0 0 0 1px var(--blue)' } },
        icon('folder', 16, 'var(--blue-surface)', 1.7),
        el('div', { style: { minWidth: 0 } },
          el('div', { class: 'm', style: { fontSize: '11.5px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, pending.fileName),
          el('div', { class: 'm', style: { marginTop: '2px', fontSize: '10px', color: 'var(--grey-5)' } },
            `${pending.records.length} rows read`)),
        el('button', { class: 'm', style: { marginLeft: 'auto', fontSize: '15px', color: 'var(--grey-5)' },
          onClick: () => { pending = null; paintImport(); } }, '×')),
      el('div', { style: { marginTop: '13px', display: 'flex', flexDirection: 'column', gap: '9px' } },
        row('Trades added', String(p.add), 'var(--green)'),
        row('Already here, skipped', String(p.skip)),
        row('Accounts created', String(p.newAccounts.length)),
        row('Setups and tags created', String(p.newSetups.length + p.newTags.length)),
        p.problems.length ? row('Rows with a problem', String(p.problems.length), 'var(--yellow)') : null),
      el('button', { class: 'btn btn-primary', style: { marginTop: '14px', width: '100%', justifyContent: 'center' },
        onClick: async () => {
          const res = await applyImport(store, pending.records);
          pending = null;
          toast(`Imported ${res.added} trade${res.added === 1 ? '' : 's'}`);
          nav.refresh();
        } }, `Import ${p.add} trade${p.add === 1 ? '' : 's'}`),
      el('div', { class: 'm', style: { marginTop: '10px', fontSize: '10.5px', lineHeight: 1.5, color: 'var(--grey-5)' } },
        'A row already here is skipped. Nothing is ever deleted.'),
    );
  }
  paintImport();

  const backupCard = el('section', { class: 'card', style: { width: '380px', flex: 'none', alignSelf: 'flex-start' } },
    el('h2', {}, 'Backup'),
    el('div', { style: { marginTop: '18px', display: 'flex', alignItems: 'baseline', gap: '10px' } },
      countEl, metaEl),
    el('div', { style: { marginTop: '13px', display: 'flex', alignItems: 'center', gap: '8px' } },
      scopeChips,
      el('button', { class: 'btn btn-primary', style: { marginLeft: 'auto' }, onClick: doExport },
        icon('upload', 14, '#fff', 1.9), 'Export')),
    el('div', { style: { height: '1px', background: 'var(--grey-7)', margin: '18px 0' } }),
    importBody,
  );

  refreshCounts();
  return el('div', { class: 'view' }, head,
    el('div', { class: 'row', style: { flex: '1', minHeight: 0 } }, accountsCard, backupCard));
}
