/* ============================================================
   settings.js — the accounts, the vault, and how the place looks.

   The vault is the backup. It carries the trades and the charts together, so
   there is one thing to export and one thing to import, and no second
   half-backup made of text to confuse it with.
   ============================================================ */
import { el, icon, toast } from '../ui.js';
import * as c from '../calc.js';
import { toCSV } from '../csv.js';
import { describeLook } from '../look.js';
import { accountBoard } from './acctboard.js';
import { oandaKeyCard } from './oandakey.js';
import { profileFill } from '../shell.js';
import { probeVideo, probeImage } from '../clip.js';
import { prepare as prepareImage } from '../shots.js';



export function settings(store, nav, page = '', { openLook, newAccount = false } = {}) {
  /* The folder used to be named in a pill up here as well as in the Vault
     card below, and only the pill could move it — which is why nobody found
     it. One box owns the vault now: where it is, and everything you can do
     to it. */
  const head = el('header', { class: 'head' },
    el('h1', {}, 'Settings'),
    el('div', { class: 'spacer' }),
  );

  /* Accounts have a page of their own now: views/acctboard.js. */

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
    const name = `quire-trades-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const vaultButton = (label, ic, onClick, why) => el('button',
    { class: 'btn btn-quiet' + (why ? ' is-off' : ''), disabled: !!why, title: why || '',
      style: { flex: '1', justifyContent: 'center', padding: '9px 10px', fontSize: '11.5px' },
      onClick: why ? () => toast(why, 'warn') : onClick },
    icon(ic, 13, why ? 'var(--grey-5)' : 'var(--grey-1)', 1.8), label);

  /* Why the folder cannot be chosen here, in the words of the thing stopping
     it. An absent button is a mystery; a button that says what is in its way
     is an answer. */
  const noPicker =
    store.isPreview ? 'This is a preview copy — it has nowhere to move a vault to.'
    : !store.canChooseFolder
      ? (typeof window !== 'undefined' && window.self !== window.top
          ? 'A page inside a frame cannot open a folder picker. Open Laminar in its own window.'
          : typeof location !== 'undefined' && location.protocol === 'file:'
            ? 'A file opened straight from disk cannot open a folder picker. Use the desktop app.'
            : 'This browser cannot open a folder picker. Chrome or Edge can, and so can the desktop app.')
      : null;

  const vaultCard = el('section', { class: 'card', style: { flex: 'none' } },
    el('h2', {}, 'Vault'),
    vaultNote,
    /* Two rows, because they are two different questions. Where it lives,
       then how to carry it. Moving used to be hidden behind the folder name
       in the corner, which is nowhere. */
    el('div', { style: { marginTop: '14px', display: 'flex', gap: '7px' } },
      store.isNative ? vaultButton('Locate', 'folder', async () => {
        if (!(await store.revealVault())) toast('Could not open that folder', 'warn');
      }) : null,
      vaultButton('Move vault', 'folder', async () => {
        try {
          if (await store.connect()) { toast('Vault is now in ' + store.folderName); nav.refresh(); }
        } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'bad'); }
      }, noPicker)),
    el('div', { style: { marginTop: '7px', display: 'flex', gap: '7px' } },
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

  /* Whose journal this is. Saved as you leave the field rather than on every
     keystroke, so the sidebar does not redraw itself letter by letter. */
  const nameField = el('input', { class: 'm', value: store.userName, placeholder: 'Your name', maxLength: 32,
    style: { width: '150px', background: 'var(--grey-7)', borderRadius: '10px',
             padding: '6px 9px', fontSize: '11.5px', color: 'var(--ink)', textAlign: 'right' },
    onChange: async e => { await store.setUserName(e.target.value); nav.refresh(); } });

  /* ---------- the colour behind your initials ----------
     A dropdown rather than a row of swatches, because the thing being chosen
     has a name and the name is worth reading. Each option is the square
     itself with your own initials on it, so you are picking the thing rather
     than a sample of it. */
  const USER_COLOURS = [
    ['#F4624A', 'Coral'],  ['#E5342B', 'Red'],    ['#F97316', 'Orange'],
    ['#FFB800', 'Yellow'], ['#18AC65', 'Green'],  ['#0EA5A5', 'Teal'],
    ['#0988F0', 'Blue'],   ['#7C5CFF', 'Purple'], ['#FB7185', 'Pink'],
    ['#8C5A3C', 'Brown'],  ['#9A9A9A', 'Grey'],   ['#E9E9E9', 'White'],
    ['#3D3D3D', 'Black'],
  ];

  const colourWrap = el('div', { class: 'drop' });
  let colourOpen = false;

  function awayFromColours(e) {
    if (!colourWrap.isConnected) return closeColours();
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    if (e.type === 'pointerdown' && colourWrap.contains(e.target)) return;
    colourOpen = false; paintColours();
  }
  function closeColours() {
    document.removeEventListener('pointerdown', awayFromColours, true);
    document.removeEventListener('keydown', awayFromColours, true);
  }

  const initialsOf = () => (store.userName || 'You').split(' ').filter(Boolean)
    .map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const chip = (hex, size) => el('span', { class: 'avatar', style: {
      background: hex, width: size + 'px', height: size + 'px',
      borderRadius: Math.round(size / 2.8) + 'px',
      boxShadow: 'inset 0 0 0 1px rgba(128,128,128,.28)' } },
    el('span', { class: 'm', style: { fontSize: Math.round(size * 0.4) + 'px', color: c.inkOn(hex) } }, initialsOf()));

  function paintColours() {
    const current = store.userColour;
    const named = USER_COLOURS.find(([hex]) => hex.toLowerCase() === current.toLowerCase());
    colourWrap.replaceChildren(
      el('button', { type: 'button', class: 'b' + (colourOpen ? ' is-open' : ''),
        onClick: () => { colourOpen = !colourOpen; paintColours(); } },
        chip(current, 22),
        el('span', { class: 'n' }, named ? named[1] : current.toUpperCase()),
        el('span', { class: 'c' }, '▾')),
      el('div', { class: 'drop-menu', hidden: !colourOpen },
        ...USER_COLOURS.map(([hex, name]) => el('button', { type: 'button',
          class: 'drop-opt' + (hex.toLowerCase() === current.toLowerCase() ? ' is-on' : ''),
          onClick: async () => {
            colourOpen = false;
            if (hex.toLowerCase() === current.toLowerCase()) return paintColours();
            await store.setUserColour(hex);
            nav.refresh();
          } },
          chip(hex, 20), el('span', { class: 'n' }, name),
          hex.toLowerCase() === current.toLowerCase()
            ? el('span', { class: 'k' }, icon('check', 11, 'var(--ink)', 2.4)) : null))));
    closeColours();
    if (colourOpen) {
      document.addEventListener('pointerdown', awayFromColours, true);
      document.addEventListener('keydown', awayFromColours, true);
    }
  }
  paintColours();

  /* ---------- your picture and your banner: a picture or a video ---------- */
  const LIMIT = { avatar: 50, banner: 100 };   // MB, for a video
  const picker = which => {
    const input = el('input', { type: 'file', accept: 'image/*,video/*', hidden: true,
      onChange: async e => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        const kind = /^video\//.test(f.type) ? 'video' : /^image\//.test(f.type) ? 'image' : null;
        if (!kind) return toast(`${f.name} is not a picture or a video`, 'warn');
        if (kind === 'video' && f.size > LIMIT[which] * 1024 * 1024) return toast(`${f.name} is over ${LIMIT[which]} MB — trim it first`, 'warn');
        try {
          let blob = f, type = f.type, ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase();
          if (kind === 'image' && type !== 'image/gif') { const p = await prepareImage(f); blob = p.blob; type = 'image/jpeg'; ext = 'jpg'; }
          const info = kind === 'video' ? await probeVideo(blob) : await probeImage(blob);
          if (!info) return toast(`${f.name} could not be ${kind === 'video' ? 'played' : 'read'} here`, 'warn');
          await store.setProfileMedia(which, blob, { kind, type, ext, thumb: info.thumb });
          toast(which === 'banner' ? 'Banner changed' : 'Picture changed');
          nav.refresh();
        } catch (err) { toast(err.message || 'That could not be used', 'bad'); }
      } });
    document.body.append(input);
    input.click();
    setTimeout(() => input.remove(), 60000);
  };
  const dropMedia = async which => { await store.removeProfileMedia(which); toast('Removed'); nav.refresh(); };
  const mediaRow = (which, title, note) => {
    const has = !!store.profileMedia(which);
    const thumb = el('span', { class: 'st-pf-thumb' + (which === 'banner' ? ' is-banner' : '') });
    profileFill(store, which, thumb);
    return el('div', { class: 'st-field st-pf' },
      el('span', { class: 'st-k' }, title, el('span', { class: 'st-kd' }, note)),
      el('div', { class: 'st-pf-ctl' },
        has ? thumb : null,
        el('button', { class: 'btn btn-quiet', 'data-pick': which, onClick: () => picker(which) }, has ? 'Change' : 'Choose…'),
        has ? el('button', { class: 'btn btn-quiet', 'data-drop': which, onClick: () => dropMedia(which) }, 'Remove') : null));
  };

  const profileCard = el('section', { class: 'card st-card' },
    el('h2', {}, 'Profile'),
    el('div', { class: 'st-field' },
      el('span', { class: 'st-k' }, 'Name'),
      el('div', { style: { marginLeft: 'auto' } }, nameField)),
    el('div', { class: 'st-field' },
      el('span', { class: 'st-k' }, 'Profile colour'),
      el('div', { style: { marginLeft: 'auto' } }, colourWrap)),
    mediaRow('avatar', 'Picture', 'A picture or a video — in place of your initials'),
    mediaRow('banner', 'Banner', 'A picture or a video across the top of Settings'),
    el('p', { class: 'st-help' }, 'Without a picture your initials wear this colour in the top bar. Pictures and videos are kept in your journal folder. Nothing here leaves this computer.'));

  /* ============================================================
     The list — every setting, one row each, the way a phone does it.
     ============================================================ */
  const look = store.look;
  const row = (ic, title, note, onClick, end) => el('button', { class: 'st-row', 'data-row': title, onClick },
    el('span', { class: 'st-ic' }, icon(ic, 16, 'currentColor', 1.7)),
    el('span', { class: 'st-t' }, el('span', { class: 'st-n' }, title), note ? el('span', { class: 'st-d' }, note) : null),
    end || icon('chevright', 13, 'var(--ink-4)', 2));
  const group = (label, ...rows) => el('div', { class: 'st-group', 'data-group': label },
    el('div', { class: 'st-gk' }, label), el('div', { class: 'st-list' }, ...rows));

  const who = store.userName;
  const initials = initialsOf();
  const cover = el('div', { class: 'st-cover', style: { '--uc': store.userColour } },
    el('button', { class: 'st-cover-b', 'data-pick': 'banner', title: 'A picture or a video for your banner', onClick: () => picker('banner') },
      icon('image', 13, 'currentColor', 1.9), store.profileMedia('banner') ? 'Change banner' : 'Add banner'));
  profileFill(store, 'banner', cover);
  const frost = !store.data.accounts.userColour;
  const avatar = el('span', { class: 'st-avatar' + (frost ? ' is-frost' : ''), style: frost ? {} : { background: who ? store.userColour : 'var(--inset)', color: store.userInk } },
    who ? initials : icon('user', 22, 'currentColor', 1.7));
  profileFill(store, 'avatar', avatar);
  const hero = el('section', { class: 'card st-hero' },
    cover,
    el('div', { class: 'st-hero-row' },
      el('span', { class: 'st-avatar-w' }, avatar,
        el('button', { class: 'st-avatar-b', 'data-pick': 'avatar', title: 'A picture or a video of your own', 'aria-label': 'Change your picture',
          onClick: () => picker('avatar') }, icon('camera', 13, 'currentColor', 2))),
      el('div', { class: 'st-hero-t' },
        el('div', { class: 'st-hero-n' }, who || 'Your journal'),
        el('div', { class: 'st-hero-d' }, store.folderName ? `${store.folderName} · ${store.accounts.length} account${store.accounts.length === 1 ? '' : 's'}` : `${store.accounts.length} accounts`)),
      el('button', { class: 'btn btn-primary', onClick: () => nav.go('#/settings/profile') }, icon('pencil', 13, 'currentColor', 1.9), 'Edit')));

  const search = el('input', { class: 'field st-search', placeholder: 'Search settings', 'aria-label': 'Search settings',
    onInput: e => {
      const q = e.target.value.trim().toLowerCase();
      for (const g of listEl.querySelectorAll('.st-group')) {
        let any = false;
        for (const r of g.querySelectorAll('.st-row')) {
          const hit = !q || r.textContent.toLowerCase().includes(q);
          r.hidden = !hit; any = any || hit;
        }
        g.hidden = !any;
      }
    } });

  const listEl = el('div', { class: 'st-groups' },
    group('Account',
      row('user', 'Profile', 'Your name, picture, colour and banner', () => nav.go('#/settings/profile')),
      row('firms', 'Accounts', `${store.accounts.length} active · evals, funded and live, payouts`, () => nav.go('#/settings/accounts'))),
    group('Trading',
      row('shield', 'Risk rules', 'Daily loss cap, trades a day, default risk', () => nav.go('#/playbook')),
      row('chart', 'Charts & prices', 'Your OANDA key for the trade chart', () => nav.go('#/settings/charts')),
      row('upload', 'Import trades', 'From a broker or FX Replay CSV', () => nav.go('#/import'))),
    group('App',
      row('palette', 'Appearance', describeLook(look), () => openLook?.()),
      row('vault', 'Vault & data',
        store.isPreview ? 'A preview copy — nothing here is saved'
        : store.isLocal ? 'Your journal is saved inside this browser — export it now and then'
        : (store.folderName || 'Where your journal lives'), () => nav.go('#/settings/vault')),
      row('download', 'Trades as a spreadsheet', 'A CSV of every trade — not a backup', doCsvExport)));

  const back = el('button', { class: 'st-back', onClick: () => nav.go('#/settings') }, icon('chevleft', 13, 'currentColor', 2.2), 'Settings');
  const sub = (title, note, ...cards) => el('div', { class: 'view st-view' },
    el('header', { class: 'head st-subhead' }, back, el('h1', {}, title), note ? el('span', { class: 'sub' }, note) : null),
    el('div', { class: 'st-col' }, ...cards));

  if (page === 'profile') return sub('Profile', 'Your name, picture and banner', profileCard);
  if (page === 'accounts') return accountBoard(store, nav, { openNew: newAccount });
  if (page === 'vault') return sub('Vault & data', 'Where your journal lives', vaultCard);
  if (page === 'charts') return sub('Charts & prices', 'OANDA', oandaKeyCard());

  return el('div', { class: 'view st-view' }, head,
    el('div', { class: 'st-col' }, hero, search, listEl));
}

/* Where the journal lives, and — when that is a choice — the way to change it. */
