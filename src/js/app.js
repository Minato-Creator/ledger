/* ============================================================
   app.js — boot, sidebar, routing.
   ============================================================ */
import { store, isSupported, isTauri } from './store.js';
import { fs } from './fs.js';
import { el, icon, clear, toast, brandWordmark } from './ui.js';
import { topbar, fitTopbar, bottombar, subnav, sectionOf, tabOf, accountMenu, moreSheet, arrive, settle, segMarks, segGlide } from './shell.js';
import { closeSheets } from './sheet.js';
import { applyLastLook } from './look.js';
import { openAppearance } from './views/appearance.js';
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
import { firmsPage } from './views/firms.js';

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
      brandWordmark(24)),
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
      brandWordmark(24)),
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
      el('p', {}, 'You have used Laminar here before. Browsers ask again each session before letting a page touch your folder — one click and everything is back.'),
      el('div', { class: 'gate-actions' },
        el('button', { class: 'btn btn-primary', onClick: async () => {
          try { if (await store.regrant()) boot(); else toast('Permission declined', 'warn'); }
          catch (e) { toast(e.message, 'bad'); }
        } }, icon('folder', 15, 'currentColor', 1.8), 'Reconnect'),
        el('button', { class: 'btn btn-quiet', onClick: async () => { await store.forget(); boot(); } }, 'Choose a different folder')),
    );
    return el('div', { class: 'gate' }, card);
  }

  card.append(
    el('p', {}, 'Pick an empty folder — anywhere you like. Laminar writes your accounts, trades and playbook into it as plain files you can open, copy and back up yourself.'),
    el('p', {}, 'Nothing is uploaded anywhere. To move to another machine, copy the folder.'),
    el('div', { class: 'fs' },
      'Quire\\\n  accounts.json      your accounts\n  trades.json        every trade\n  playbook.json      setups, tags, sessions\n  screenshots\\\n  replay\\            Replay sessions and prices'),
    el('div', { class: 'gate-actions' },
      el('button', { class: 'btn btn-primary', onClick: async () => {
        try { if (await store.connect()) boot(); }
        catch (e) { if (e.name !== 'AbortError') toast(e.message, 'bad'); }
      } }, icon('folder', 15, 'currentColor', 1.8), 'Choose folder'),
      el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-5)' } }, 'Chrome or Edge, desktop')),
  );
  return el('div', { class: 'gate' }, card);
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
    /* One place for accounts: Settings. #/accounts is that page with the
       new-account form open (and the whole of first run, before any exist). */
    case 'accounts':  return store.accounts.length
      ? settings(store, nav, 'accounts', { openLook, newAccount: true }) : accounts(store, nav);
    case 'settings':  return settings(store, nav, arg, { openLook });
    case 'calendar':  return calendar(store, nav);
    case 'analytics': return analytics(store, nav);
    case 'playbook':  return playbook(store, nav);
    case 'replay':    return replay(store, nav);
    case 'wire':      return wire(store, nav);
    case 'lab':       return lab(store, nav, arg);
    case 'review':    return review(store, nav, arg);
    case 'firms':     return firmsPage(store, nav, arg);
    default:          return dashboard(store, nav);
  }
}

/* The app rebuilds its DOM on every interaction, so entrance animation has to
   be gated on something real changing — the view you are on, the trade you are
   looking at, or the unit everything is read in. A filter, a stepper or a
   month step re-renders without replaying anything. */
let lastView = null;
let wasSolo = false;
const openLook = () => openAppearance(store, nav);
function render() {
  const hash = location.hash || '#/';
  const [, seg, arg] = hash.split('/');
  const key = `${seg}/${arg || ''}/${store.data ? store.displayUnit : ''}/${store.data ? store.data.accounts.activeAccountId : ''}`;
  const entered = key !== lastView;
  lastView = key;

  /* First run is one decision. Until an account exists there is nothing for a
     bar to navigate to, so it is not drawn at all — the setup form has the
     whole window. It arrives, once, the moment the account does. */
  const solo = !store.accounts.length && seg !== 'settings';
  const arriving = wasSolo && !solo;
  wasSolo = solo;

  /* the same page drawn again (a click, a filter, a row opened): every list stays scrolled where it was */
  const scrolled = entered ? [] : scrollMarks(root);
  const segs = entered ? new Map() : segMarks(root, placeOf);
  const page = document.scrollingElement, pageY = entered ? 0 : page?.scrollTop || 0;
  clear(root);
  /* Whether this paint is a page being opened (rather than the same page
     drawn again after a click) — the simulations replay their animation
     on every visit, and only then. */
  nav.fresh = entered;
  const view = route();
  const main = el('main', { class: 'main' + (entered ? ' enter' : '') }, view);
  dressHead(view, hash);
  root.classList.toggle('is-solo', solo);
  if (solo) root.append(main);
  else {
    const bar = topbar(store, nav, { hash,
      onAccount: anchor => accountMenu(store, nav, anchor),
      onYou: () => nav.go('#/settings') });
    if (arriving) bar.classList.add('is-new');
    root.append(bar, main, ...bottombar(store, nav, { hash, onMore: () => moreSheet(store, nav, { openLook }) }).filter(Boolean));
    fitTopbar(bar);
  }

  restoreScroll(root, scrolled);
  segGlide(root, segs, placeOf);
  if (page && pageY) page.scrollTop = pageY;

  /* Take the flag off once everything has played. Left on, it would animate
     anything inserted into the view later — an inline editor, a confirm box —
     which is exactly the twitchiness this gating exists to avoid. */
  if (entered) {
    arrive(main);
    clearTimeout(enterTimer);
    /* long enough for the last card's chart to finish drawing */
    enterTimer = setTimeout(() => main.classList.remove('enter'), 2800);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => settle(main), 2800);
  }
}

/* A page inside a section that shares tabs (Journal, Plan, Lab) gets those
   tabs where its title was. The title stays in the page for anything that
   reads it, just out of sight. The Lab's own tool switch is the same row of
   tabs, so it steps aside rather than appear twice. */
function dressHead(view, hash) {
  const [, seg = ''] = hash.split('/');
  const section = sectionOf(seg);
  if (!section.tabs || !tabOf(section, hash)) return;
  const head = view.querySelector?.('.head');
  if (!head) return;
  const h1 = head.querySelector('h1');
  const tabs = subnav(section, hash, nav);
  if (h1) { h1.classList.add('sr-only'); h1.after(tabs); } else head.prepend(tabs);
  head.classList.add('has-subnav');
  head.querySelector('.lab-views')?.remove();
}
let enterTimer, settleTimer;

/** Where each scrolled box is: by its place in the page (tags and positions, and its own first class). */
const placeOf = (e, top) => {
  const parts = [];
  for (let n = e; n && n !== top; n = n.parentElement) parts.push(`${n.tagName}${n.classList[0] ? '.' + n.classList[0] : ''}:${Array.prototype.indexOf.call(n.parentElement?.children || [], n)}`);
  return parts.reverse().join('>');
};
function scrollMarks(top) {
  const out = [];
  for (const e of top.querySelectorAll('*')) if (e.scrollTop > 0 || e.scrollLeft > 0) out.push({ at: placeOf(e, top), y: e.scrollTop, x: e.scrollLeft });
  return out;
}
function restoreScroll(top, marks) {
  if (!marks.length) return;
  const byPlace = new Map(marks.map(m => [m.at, m]));
  for (const e of top.querySelectorAll('*')) {
    const m = byPlace.get(placeOf(e, top));
    if (m) { e.scrollTop = m.y; e.scrollLeft = m.x; byPlace.delete(m.at); if (!byPlace.size) break; }
  }
}

async function boot() {
  document.querySelectorAll('.gate').forEach(n => n.remove());
  if (!store.data) applyLastLook();
  /* Under automation (the test suites) nothing rises or writes itself in:
     a measurement taken mid-arrival would measure the animation. */
  if (typeof navigator !== 'undefined' && navigator.webdriver) document.documentElement.dataset.auto = 'on';
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

window.addEventListener('hashchange', () => { closeSheets(); render(); });

/* Day and night: when the look follows the clock, look at the clock. */
setInterval(() => {
  if (!store.data || !store.lookSchedule.on) return;
  const before = document.documentElement.dataset.look;
  store.applyLookNow();
  if (document.documentElement.dataset.look !== before) render();
}, 60000);
store.onChange(() => { /* views re-render explicitly; this is the hook for future live updates */ });

boot();
