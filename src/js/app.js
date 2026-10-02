/* ============================================================
   app.js — boot, sidebar, routing.
   ============================================================ */
import { store, isSupported, isTauri } from './store.js';
import { fs } from './fs.js';
import { el, icon, clear, toast, brandMark } from './ui.js';
import * as c from './calc.js';
import { dashboard } from './views/dashboard.js';
import { trades } from './views/trades.js';
import { addTrade } from './views/addtrade.js';
import { accounts } from './views/accounts.js';
import { tradeDetail } from './views/tradedetail.js';
import { settings } from './views/settings.js';
import { calendar } from './views/calendar.js';
import { analytics } from './views/analytics.js';
import { playbook } from './views/playbook.js';
import { replay } from './views/replay.js';
import { wire } from './views/wire.js';
import { importTrades } from './views/import.js';
import { outlook } from './views/outlook.js';
import { lab } from './views/lab.js';
import { review } from './views/review.js';

const root = document.getElementById('app');
const embeddedHere = () => { try { return window.self !== window.top; } catch { return true; } };

const nav = {
  go(hash) { if (location.hash === hash) render(); else location.hash = hash; },
  refresh(opts = {}) {
    const active = document.activeElement;
    const id = active && active.dataset ? active.dataset.keep : null;
    render();
    if (opts.keepFocus && id) {
      const next = document.querySelector(`[data-keep="${id}"]`);
      if (next) { next.focus(); next.setSelectionRange?.(next.value.length, next.value.length); }
    }
  },
};

/* ---------- first run on the desktop app: where does the vault go? ----------

   The one question worth asking before anything else, because the answer is
   where every trade you ever log will live. It is asked once, it comes with
   an answer already filled in, and it is changeable later in Settings. */
function vaultGate(suggested) {
  const path = el('span', { class: 'm', style: { fontSize: '12px', color: 'var(--ink-2)',
    background: 'var(--grey-8)', borderRadius: 'var(--r-btn)', padding: '9px 14px',
    display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' } }, suggested || '—');

  const go = async (fn) => {
    try { if (await fn()) boot(); }
    catch (e) { if (e.name !== 'AbortError') toast(e.message, 'bad'); }
  };

  const card = el('div', { class: 'gate-card' },
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '22px' } },
      el('div', { class: 'brand-mark' }, brandMark(32, 68)),
      el('span', { class: 'brand-name', style: { fontSize: '17px' } }, 'Quire')),
    el('h1', {}, 'Where should your vault live?'),
    el('div', { class: 'fs', style: { marginTop: '18px' } },
      'Vault\\\n  vault.json\n  data\\           accounts, trades, playbook\n  screenshots\\    your charts'),
    el('div', { style: { marginTop: '18px' } }, path),
    el('div', { class: 'gate-actions', style: { marginTop: '18px' } },
      el('button', { class: 'btn btn-primary', disabled: !suggested,
        onClick: () => go(() => store.createVault(suggested)) }, 'Use this folder'),
      el('button', { class: 'btn btn-quiet', onClick: () => go(() => store.connect()) },
        icon('folder', 15, 'var(--grey-1)', 1.8), 'Choose another')),
  );
  return el('div', { class: 'gate' }, card);
}

/* ---------- gate: pick the folder ---------- */
function gate({ mode }) {
  const supported = isSupported();
  const card = el('div', { class: 'gate-card' },
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '24px' } },
      el('div', { class: 'brand-mark' }, brandMark(32, 68)),
      el('span', { class: 'brand-name', style: { fontSize: '17px' } }, 'Quire')),
    el('h1', {}, mode === 'needs-permission' ? 'Reconnect your journal' : 'Choose where your journal lives'),
  );

  if (!supported || !fs.canChooseFolder) {
    card.append(
      el('p', { class: 'warn' }, 'This page cannot open a folder.'),
      el('p', {}, embeddedHere()
        ? 'It is running inside another page, and browsers never allow a preview frame to reach your disk. Download this file and open it directly and it will work.'
        : 'Folder access needs Chrome or Edge on desktop, served from a real address rather than a double-clicked file.'),
      el('p', {}, 'The desktop app has none of this in its way — it opens straight onto your journal.'),
    );
    return el('div', { class: 'gate' }, card);
  }

  if (mode === 'needs-permission') {
    card.append(
      el('p', {}, 'You have used Quire here before. Browsers ask again each session before letting a page touch your folder — one click and everything is back.'),
      el('div', { class: 'gate-actions' },
        el('button', { class: 'btn btn-primary', onClick: async () => {
          try { if (await store.regrant()) boot(); else toast('Permission declined', 'warn'); }
          catch (e) { toast(e.message, 'bad'); }
        } }, icon('folder', 15, '#fff', 1.8), 'Reconnect'),
        el('button', { class: 'btn btn-quiet', onClick: async () => { await store.forget(); boot(); } }, 'Choose a different folder')),
    );
    return el('div', { class: 'gate' }, card);
  }

  card.append(
    el('p', {}, 'Pick an empty folder — anywhere you like. Quire writes your accounts, trades and playbook into it as plain files you can open, copy and back up yourself.'),
    el('p', {}, 'Nothing is uploaded anywhere. To move to another machine, copy the folder.'),
    el('div', { class: 'fs' },
      'Quire\\\n  accounts.json      your accounts\n  trades.json        every trade\n  playbook.json      setups, tags, sessions\n  screenshots\\\n  replay\\            your FX Replay exports'),
    el('div', { class: 'gate-actions' },
      el('button', { class: 'btn btn-primary', onClick: async () => {
        try { if (await store.connect()) boot(); }
        catch (e) { if (e.name !== 'AbortError') toast(e.message, 'bad'); }
      } }, icon('folder', 15, '#fff', 1.8), 'Choose folder'),
      el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-5)' } }, 'Chrome or Edge, desktop')),
  );
  return el('div', { class: 'gate' }, card);
}

/* ---------- sidebar ---------- */
const NAV_ITEMS = [
  ['#/', 'dashboard', 'Dashboard'],
  ['#/outlook', 'outlook', 'Outlook'],
  ['#/trades', 'trades', 'Trades'],
  ['#/calendar', 'calendar', 'Calendar'],
  ['#/review', 'review', 'Review'],
  ['#/analytics', 'analytics', 'Analytics'],
  ['#/lab', 'lab', 'The Lab'],
  ['#/replay', 'replay', 'Replay'],
  ['#/wire', 'wire', 'Newswire'],
  ['#/playbook', 'playbook', 'Playbook'],
];

let menuOpen = false;

function sidebar() {
  const acct = store.activeAccount;
  const hash = location.hash || '#/';
  const base = '#/' + (hash.split('/')[1] || '');

  const menu = el('div', { class: 'acct-menu', hidden: !menuOpen },
    ...store.accounts.map(a => {
      const s = c.summarise(a, store.tradesFor(a.id));
      return el('button', { class: 'acct-item' + (acct && a.id === acct.id ? ' is-active' : ''),
        onClick: async () => { menuOpen = false; await store.setActiveAccount(a.id); render(); } },
        el('span', { class: 'acct-dot', style: { background: a.color } }),
        el('span', { style: { minWidth: 0 } },
          el('span', { class: 'n', style: { display: 'block' } }, a.name),
          el('span', { class: 'b', style: { display: 'block' } }, c.money(a.startingBalance + s.net, { sign: false, currency: a.currency, decimals: 0 }))),
        acct && a.id === acct.id ? el('span', { style: { marginLeft: 'auto' } }, icon('check', 13, '#fff', 2.4)) : null);
    }),
    el('div', { class: 'acct-sep' }),
    el('button', { class: 'acct-item', onClick: () => { menuOpen = false; nav.go('#/accounts'); } },
      icon('plus', 14, 'var(--grey-5)', 2),
      el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-3)' } }, 'Manage accounts')),
  );

  const stats = acct ? c.summarise(acct, store.tradesFor(acct.id)) : null;

  return el('aside', { class: 'sidebar' },
    el('div', { class: 'brand' },
      el('div', { class: 'brand-mark' }, brandMark(32, 68)),
      el('span', { class: 'brand-name' }, 'Quire')),

    el('div', { class: 'acct-switch' },
      el('button', { class: 'acct-btn', onClick: e => { e.stopPropagation(); menuOpen = !menuOpen; render(); } },
        el('span', { class: 'acct-dot', style: { background: acct ? acct.color : 'var(--grey-5)' } }),
        el('span', { style: { minWidth: 0 } },
          el('span', { class: 'acct-name', style: { display: 'block' } }, acct ? acct.name : 'No account'),
          el('span', { class: 'acct-meta', style: { display: 'block' } }, acct
            ? c.money(acct.startingBalance + stats.net, { sign: false, currency: acct.currency, decimals: 0 })
              + ' · ' + (store.displayUnit === '$'
                  ? c.pctSigned(c.asPercent(acct, stats.net))
                  : c.fig(store.displayUnit, acct, stats.net, stats.netR, { decimals: 0 }))
            : 'create one to begin')),
        el('span', { style: { marginLeft: 'auto', display: 'flex' } }, icon('switch', 14, 'var(--grey-3)', 2))),
      menu),

    /* One switch, every screen. $ is the money, % is that money against the
       account's starting balance, R is the risk it was worth. */
    el('div', { class: 'unit-switch' },
      ...c.UNITS.map(u => el('button', { class: store.displayUnit === u ? 'is-on' : '',
        title: u === '$' ? 'Show money' : u === '%' ? 'Show percent of starting balance' : 'Show R multiples',
        onClick: async () => { if (store.displayUnit !== u) { await store.setDisplayUnit(u); render(); } } }, u))),

    /* ============================================================
       What the numbers are counting

       The unit switch above says what a figure is measured in. This one says
       which trades it is measured over. It only appears once there is a
       forward test to include, because a switch with nothing on the other
       side of it is furniture.
       ============================================================ */
    /* It appears once there is a forward test to count, and stays put while
       the app is reading anything other than live — otherwise a journal whose
       last test was deleted would be stuck on a view with nothing in it and
       no switch to leave by. */
    acct && (store.testCountFor(acct.id) || store.tradeScope !== 'live')
      ? el('div', { class: 'unit-switch scope-switch', style: { marginTop: '6px' } },
          ...[['live', 'Live', 'Only the trades you took for real'],
              ['forward', 'Forward test', 'Only the forward tests'],
              ['all', 'All', 'Both, counted together']]
            .map(([v, label, why]) => el('button', {
              class: store.tradeScope === v ? 'is-on' : '', title: why,
              onClick: async () => {
                if (store.tradeScope === v) return;
                await store.setTradeScope(v); render();
              } }, label)))
      : null,

    el('nav', { class: 'nav' },
      ...NAV_ITEMS.map(([href, ic, label]) =>
        el('a', { href, class: base === href || (href === '#/' && base === '#/') ? 'is-active' : '' },
          icon(ic), el('span', { class: 'label' }, label),
          href === '#/trades' && acct ? el('span', { class: 'count' }, String(store.tradesFor(acct.id).length)) : null,
          base === href ? el('span', { class: 'dot' }) : null))),

    el('div', { class: 'side-foot' },
      /* Just the folder's name. What it is, and that copying it is the backup,
         is on the tooltip rather than taking up three lines of the sidebar. */
      store.isNative || fs.kind === 'browser'
        ? el('div', { class: 'side-folder', title: 'Journal folder — copy it to back up' },
            icon('folder', 13, 'var(--grey-5)', 1.8),
            el('span', { class: 'm' }, store.folderName || '—'))
        : null,
      /* Your name if you have given one, and the row simply reads Settings if
         you have not. Nobody should have to look at a stranger's initials. */
      settingsRow(base),
    ));
}

/* The foot of the sidebar. Two lines with a name, one line without. */
function settingsRow(base) {
  const who = store.userName;
  const initials = who.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return el('button', { class: 'acct-item', style: { background: base === '#/settings' ? 'var(--inset)' : 'transparent' },
    onClick: () => nav.go('#/settings') },
    el('span', { class: 'avatar', style: { background: who ? store.userColour : 'var(--inset-2, var(--grey-8))' } },
      who ? el('span', { class: 'm', style: { fontSize: '11px', color: store.userInk } }, initials)
          : icon('user', 15, 'var(--grey-4)', 1.7)),
    who
      ? el('span', { style: { minWidth: 0 } },
          el('span', { style: { display: 'block', fontSize: '12px', color: '#fff', lineHeight: 1.2,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, who),
          el('span', { class: 'm', style: { display: 'block', fontSize: '10px', color: 'var(--grey-3)' } }, 'Settings'))
      : el('span', { style: { fontSize: '12px', color: '#fff' } }, 'Settings'));
}

/* ---------- router ---------- */
function route() {
  const hash = location.hash || '#/';
  const [, seg, arg] = hash.split('/');
  if (!store.accounts.length && seg !== 'accounts' && seg !== 'settings') return accounts(store, nav);
  switch (seg) {
    case '':          return dashboard(store, nav);
    case 'outlook':   return outlook(store, nav, arg);
    case 'trades':    return trades(store, nav);
    case 'new':       return addTrade(store, nav);
    case 'edit':      return addTrade(store, nav, arg);
    case 'import':    return importTrades(store, nav);
    case 'trade':     return tradeDetail(store, nav, arg);
    case 'accounts':  return accounts(store, nav);
    case 'settings':  return settings(store, nav);
    case 'calendar':  return calendar(store, nav);
    case 'analytics': return analytics(store, nav);
    case 'playbook':  return playbook(store, nav);
    case 'replay':    return replay(store, nav);
    case 'wire':      return wire(store, nav);
    case 'lab':       return lab(store, nav, arg);
    case 'review':    return review(store, nav, arg);
    default:          return dashboard(store, nav);
  }
}

/* The app rebuilds its DOM on every interaction, so entrance animation has to
   be gated on something real changing — the view you are on, the trade you are
   looking at, or the unit everything is read in. A filter, a stepper or a
   month step re-renders without replaying anything. */
let lastView = null;
let wasSolo = false;
function render() {
  const hash = location.hash || '#/';
  const [, seg, arg] = hash.split('/');
  const key = `${seg}/${arg || ''}/${store.data ? store.displayUnit : ''}/${store.data ? store.data.accounts.activeAccountId : ''}`;
  const entered = key !== lastView;
  lastView = key;

  /* First run is one decision. Until an account exists there is nothing for a
     sidebar to navigate to, so it is not drawn at all — the setup form has the
     whole window. It arrives, once, the moment the account does. */
  const solo = !store.accounts.length && seg !== 'settings';
  const arriving = wasSolo && !solo;
  wasSolo = solo;

  clear(root);
  const main = el('div', { class: 'main' + (entered ? ' enter' : '') }, route());
  root.classList.toggle('is-solo', solo);
  if (solo) root.append(main);
  else {
    const side = sidebar();
    if (arriving) side.classList.add('is-new');
    root.append(side, main);
  }

  /* Take the flag off once everything has played. Left on, it would animate
     anything inserted into the view later — an inline editor, a confirm box —
     which is exactly the twitchiness this gating exists to avoid. */
  if (entered) {
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => main.classList.remove('enter'), 900);
  }
}
let enterTimer;

async function boot() {
  document.querySelectorAll('.gate').forEach(n => n.remove());
  let state = 'none';
  try { state = await store.tryRestore(); }
  catch (e) { console.warn(e); state = 'none'; }
  /* Native has nothing to gate: the folder exists, it is ours, and no browser
     is standing in the way. The gate is a browser problem and only appears
     there. */
  if (state !== 'connected') {
    /* The desktop app has a folder to suggest and no permission to ask for,
       so it gets the vault question rather than the browser's gate. */
    if (isTauri() && state === 'none') {
      let suggested = null;
      try { suggested = await store.suggestedVault(); } catch { /* offer the picker alone */ }
      document.body.append(vaultGate(suggested));
      return;
    }
    document.body.append(gate({ mode: state }));
    return;
  }
  render();
}

window.addEventListener('hashchange', () => { menuOpen = false; render(); });
document.addEventListener('click', e => {
  if (menuOpen && !e.target.closest('.acct-switch')) { menuOpen = false; render(); }
});
store.onChange(() => { /* views re-render explicitly; this is the hook for future live updates */ });

boot();
