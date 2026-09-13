/* ============================================================
   settings.js — the accounts, the vault, and how the place looks.

   The vault is the backup. It carries the trades and the charts together, so
   there is one thing to export and one thing to import, and no second
   half-backup made of text to confuse it with.
   ============================================================ */
import { el, icon, toast } from '../ui.js';
import * as c from '../calc.js';
import { toCSV } from '../csv.js';
import { BACKGROUNDS } from '../backgrounds.js';

const COLOURS = ['#0988F0', '#18AC65', '#FFB800', '#F4624A', '#9A9A9A', '#E9E9E9'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'JPY'];

export function settings(store, nav) {
  const head = el('header', { class: 'head' },
    el('h1', {}, 'Settings'),
    el('div', { class: 'spacer' }),
    /* Wherever a folder can be chosen, this is the button that chooses it —
       on the desktop app, and in any browser that will open one. Where it
       cannot, the same pill just says where things are. */
    folderPill(store, nav),
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
     The vault

     Three things you can do to the folder your journal lives in: find it,
     put it in one file, or put one file back. Import replaces — a vault is a
     whole journal, not a pile to merge — so it says what it found before it
     touches anything.

     Underneath, one line for the one job a vault cannot do: hand the trades
     to a spreadsheet. It is not a backup and does not pretend to be one.
     ============================================================ */
  const vaultFile = el('input', { type: 'file', accept: '.zip,application/zip', hidden: true,
    onChange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) offerImport(f); } });
  const vaultNote = el('div', { class: 'm', style: { marginTop: '12px', fontSize: '11px', color: 'var(--grey-5)',
    lineHeight: 1.5, wordBreak: 'break-all' } }, store.folderPath || store.folderName || '—');
  const vaultAsk = el('div', { hidden: true, style: { marginTop: '12px' } });

  async function doVaultExport() {
    try {
      const { file, name, missing } = await store.exportVault();
      const url = URL.createObjectURL(file);
      const a = el('a', { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(missing ? `Vault exported — ${missing} chart${missing === 1 ? '' : 's'} could not be found`
                    : 'Vault exported', missing ? 'warn' : 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }

  /* A spreadsheet, not a backup — no charts, no accounts, no settings.
     It goes into the vault folder as well as down as a file, so it is
     findable either way. */
  async function doCsvExport() {
    const text = toCSV(store, null);
    const name = `ledger-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    try { await store.writeText(name, text); } catch { /* the folder copy is best-effort */ }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Exported ${name}`);
  }

  async function offerImport(file) {
    let found;
    try { found = await store.inspectVault(file); }
    catch (e) { return toast(e.message, 'bad'); }

    vaultAsk.hidden = false;
    vaultAsk.replaceChildren(
      el('div', { style: { background: 'var(--grey-9)', borderRadius: 'var(--r-inset)', padding: '13px 15px' } },
        el('div', { class: 'm', style: { fontSize: '11.5px', color: 'var(--ink-2)' } },
          `${found.trades} trades · ${found.accounts} accounts · ${found.shots} charts`),
        el('div', { class: 'm', style: { marginTop: '7px', fontSize: '10.5px', color: 'var(--yellow)' } },
          'This replaces everything in the vault you have open.'),
        el('div', { style: { marginTop: '12px', display: 'flex', gap: '7px' } },
          el('button', { class: 'btn btn-primary', style: { padding: '7px 14px', fontSize: '11.5px' },
            onClick: async () => {
              vaultAsk.hidden = true;
              try {
                const done = await store.importVault(file);
                toast(done.damaged
                  ? `${done.trades} trades restored — ${done.damaged} file${done.damaged === 1 ? '' : 's'} in that vault could not be read`
                  : `${done.trades} trades restored`, done.damaged ? 'warn' : 'ok');
                nav.go('#/');
              } catch (e) { toast(e.message, 'bad'); }
            } }, 'Replace'),
          el('button', { class: 'btn btn-ghost', style: { padding: '7px 14px', fontSize: '11.5px' },
            onClick: () => { vaultAsk.hidden = true; } }, 'Cancel'))));
  }

  const vaultButton = (label, ic, onClick) => el('button', { class: 'btn btn-quiet',
    style: { flex: '1', justifyContent: 'center', padding: '9px 10px', fontSize: '11.5px' }, onClick },
    icon(ic, 13, 'var(--grey-1)', 1.8), label);

  const vaultCard = el('section', { class: 'card', style: { flex: 'none' } },
    el('h2', {}, 'Vault'),
    vaultNote,
    el('div', { style: { marginTop: '14px', display: 'flex', gap: '7px' } },
      store.isNative ? vaultButton('Locate', 'folder', async () => {
        if (!(await store.revealVault())) toast('Could not open that folder', 'warn');
      }) : null,
      vaultButton('Export', 'download', doVaultExport),
      vaultButton('Import', 'upload', () => vaultFile.click())),
    vaultAsk, vaultFile,

    /* Where the journal lives inside a browser, it can be wiped by clearing
       browsing data. That is worth one sentence, and a way out of it. */
    store.isLocal || store.isPreview
      ? el('div', { style: { marginTop: '14px', background: 'var(--grey-9)', borderRadius: 'var(--r-inset)',
                             padding: '12px 14px', fontSize: '11.5px', lineHeight: 1.5, color: 'var(--yellow)' } },
          store.isPreview
            ? 'This is a preview copy. Nothing is saved — close the tab and it is gone.'
            : 'Your journal is saved inside this browser. Clearing browsing data erases it, so export a vault now and then.',
          store.isLocal && store.canChooseFolder
            ? el('button', { class: 'm', style: { marginTop: '11px', display: 'inline-flex', alignItems: 'center',
                  gap: '7px', fontSize: '11px', color: 'var(--grey-8)', background: 'var(--grey-1)',
                  borderRadius: 'var(--r-pill)', padding: '5px 11px' },
                onClick: async () => {
                  try {
                    if (await store.connect()) { toast('Journal is now in ' + store.folderName); nav.refresh(); }
                  } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'bad'); }
                } },
                icon('folder', 12, 'var(--grey-8)', 1.8), 'Keep it in a folder instead')
            : null)
      : null,

    el('div', { style: { height: '1px', background: 'var(--grey-7)', margin: '16px 0 0' } }),
    el('button', { class: 'm', style: { marginTop: '14px', display: 'inline-flex', alignItems: 'center',
        gap: '7px', fontSize: '11px', color: 'var(--grey-5)' }, onClick: doCsvExport },
      icon('download', 12, 'var(--grey-5)', 1.8), 'Trades as a spreadsheet'),
  );

  /* ============================================================
     Appearance
     ============================================================ */
  /* Named colours people actually reach for, one row each, ending in a
     neutral pair for anyone who wants the numbers to carry no colour at all. */
  const PROFIT_COLOURS = [
    ['#18AC65', 'Green'], ['#22C55E', 'Bright green'], ['#00C48C', 'Emerald'],
    ['#0EA5A5', 'Teal'],  ['#0988F0', 'Blue'],        ['#7C5CFF', 'Purple'],
    ['#FFB800', 'Yellow'], ['#E9E9E9', 'White'],      ['#3D3D3D', 'Black'],
  ];
  const LOSS_COLOURS = [
    ['#F4624A', 'Coral'],  ['#E5342B', 'Red'],        ['#B3261E', 'Deep red'],
    ['#FB7185', 'Pink'],   ['#F97316', 'Orange'],     ['#8C5A3C', 'Brown'],
    ['#A855F7', 'Violet'], ['#E9E9E9', 'White'],      ['#3D3D3D', 'Black'],
  ];

  const swatches = (which, options, current) =>
    el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '7px' } },
      ...options.map(([hex, name]) => el('button', {
        title: name,
        style: { width: '24px', height: '24px', borderRadius: '8px', background: hex,
                 boxShadow: current.toLowerCase() === hex.toLowerCase()
                   ? '0 0 0 2px var(--card), 0 0 0 3.5px var(--ink)'
                   : 'inset 0 0 0 1px rgba(128,128,128,.35)' },
        onClick: async () => { await store.setColour(which, hex); nav.refresh(); } })));

  const swatchRow = (label, sample, node, example = '+1.00R') =>
    el('div', {},
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px' } },
        el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-5)' } }, label),
        el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px', color: sample } }, example)),
      node);

  /* Whose journal this is. Saved as you leave the field rather than on every
     keystroke, so the sidebar does not redraw itself letter by letter. */
  const nameField = el('input', { class: 'm', value: store.userName, placeholder: 'Your name', maxLength: 32,
    style: { width: '150px', background: 'var(--grey-7)', borderRadius: '10px',
             padding: '6px 9px', fontSize: '11.5px', color: '#fff', textAlign: 'right' },
    onChange: async e => { await store.setUserName(e.target.value); nav.refresh(); } });

  const appearanceCard = el('section', { class: 'card', style: { flex: 'none' } },
    el('h2', {}, 'Appearance'),
    el('div', { style: { marginTop: '18px', display: 'flex', alignItems: 'center', gap: '10px' } },
      el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-5)' } }, 'Name'),
      el('div', { style: { marginLeft: 'auto' } }, nameField)),
    el('div', { style: { height: '1px', background: 'var(--grey-7)', margin: '18px 0' } }),
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
      el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-5)' } }, 'Theme'),
      el('div', { class: 'theme-switch', style: { marginLeft: 'auto' } },
        ...[['light', 'Light'], ['dark', 'Dark']].map(([v, label]) =>
          el('button', { class: store.theme === v ? 'is-on' : '',
            onClick: async () => { if (store.theme !== v) { await store.setTheme(v); nav.refresh(); } } }, label)))),
    el('div', { style: { height: '1px', background: 'var(--grey-7)', margin: '18px 0' } }),

    /* Glass and the picture behind it are one idea, so they sit together. */
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
      el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-5)' } }, 'Liquid glass'),
      el('div', { class: 'theme-switch', style: { marginLeft: 'auto' } },
        ...[[false, 'Off'], [true, 'On']].map(([v, label]) =>
          el('button', { class: store.glass === v ? 'is-on' : '',
            onClick: async () => { if (store.glass !== v) { await store.setGlass(v); nav.refresh(); } } }, label)))),
    el('div', { style: { marginTop: '18px' } },
      el('span', { class: 'm', style: { display: 'block', marginBottom: '10px',
                                        fontSize: '11.5px', color: 'var(--grey-5)' } }, 'Background'),
      el('div', { class: 'bg-picks' },
        el('button', { class: 'bg-pick none' + (store.background ? '' : ' is-on'), title: 'No picture',
          onClick: async () => { if (store.background) { await store.setBackground(''); nav.refresh(); } } },
          el('span', {}, 'None')),
        ...BACKGROUNDS.map(b => el('button', {
          class: 'bg-pick' + (store.background === b.id ? ' is-on' : ''), title: b.name,
          style: { backgroundImage: `url("${b.url}")` },
          onClick: async () => {
            if (store.background === b.id) return;
            const introduced = await store.setBackground(b.id);
            nav.refresh();
            if (introduced) toast('Liquid glass turned on to show it through — switch it off any time');
          } },
          el('span', { class: 'name' }, b.name))))),

    el('div', { style: { height: '1px', background: 'var(--grey-7)', margin: '18px 0' } }),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } },
      swatchRow('Profit', 'var(--profit)', swatches('profit', PROFIT_COLOURS, store.colours.profit)),
      swatchRow('Loss', 'var(--loss)', swatches('loss', LOSS_COLOURS, store.colours.loss), '\u22121.00R')),
  );

  return el('div', { class: 'view' }, head,
    el('div', { class: 'row', style: { flex: '1', minHeight: 0 } },
      accountsCard,
      el('div', { style: { width: '380px', flex: 'none', display: 'flex', flexDirection: 'column',
                           gap: '8px', alignSelf: 'flex-start', maxHeight: '100%', overflowY: 'auto' } },
        vaultCard, appearanceCard)));
}

/* Where the journal lives, and — when that is a choice — the way to change it. */
function folderPill(store, nav) {
  const pill = { fontSize: '11.5px', color: 'var(--grey-8)', background: 'var(--grey-2)',
                 borderRadius: 'var(--r-pill)', padding: '5px 12px',
                 display: 'inline-flex', alignItems: 'center', gap: '7px' };
  if (!store.canChooseFolder) {
    return el('span', { class: 'm', title: 'Your journal folder — copy it to back up', style: pill },
      store.folderName ? 'Folder · ' + store.folderName : 'No folder');
  }
  const onFolder = store.isNative || !store.isLocal;
  return el('button', { class: 'm', style: pill,
    title: onFolder ? (store.folderPath || '') + ' — click to move your journal somewhere else'
                    : 'Click to keep your journal in a folder on your computer instead',
    onClick: async () => {
      try {
        if (await store.connect()) { toast('Journal is now in ' + store.folderName); nav.refresh(); }
      } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'bad'); }
    } },
    icon('folder', 12, 'var(--grey-8)', 1.8),
    onFolder
      ? (store.isNative ? (store.folderName || 'Choose a folder') : 'Folder · ' + store.folderName)
      : 'Use a folder');
}
