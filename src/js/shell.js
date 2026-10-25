/* ============================================================
   shell.js — the frame around every page.

   A bar across the top on a wide window: the wordmark, the sections, and on
   the right the things that change what every page reads (unit, scope,
   account) and the way to you (your initials). On a narrow window the
   sections move into a floating bar at the bottom, the way a phone app
   carries them, with the rest behind More.

   Sections that are really one place — the journal's list, calendar and
   review; the outlook and the news; the Lab's tools and the firms they are
   run against — share a row of tabs instead of each taking a slot in the
   bar. Their routes are unchanged, so every link into them still works.
   ============================================================ */
import { el, icon, brandWordmark, toast } from './ui.js';
import * as c from './calc.js';
import { sheet, popover, closeSheets } from './sheet.js';
import { acctMark } from './views/acctlogo.js';

export const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', ic: 'dashboard', href: '#/', segs: [''] },
  { id: 'journal', label: 'Journal', ic: 'journal', href: '#/trades',
    segs: ['trades', 'calendar', 'review', 'trade', 'new', 'edit', 'import'],
    tabs: [['#/trades', 'Trades', 'trades'], ['#/calendar', 'Calendar', 'calendar'], ['#/review', 'Review', 'review']] },
  { id: 'plan', label: 'Plan', ic: 'plan', href: '#/outlook', segs: ['outlook', 'wire'],
    tabs: [['#/outlook', 'Outlook', 'outlook'], ['#/wire', 'News', 'wire']] },
  { id: 'analytics', label: 'Analytics', ic: 'analytics', href: '#/analytics', segs: ['analytics'] },
  { id: 'lab', label: 'Lab', ic: 'lab', href: '#/lab', segs: ['lab', 'firms'],
    tabs: [['#/lab', 'Monte Carlo', 'lab'], ['#/lab/prop', 'Prop firm', 'lab/prop'], ['#/lab/ghost', 'Ghost', 'lab/ghost'],
           ['#/lab/quant', 'Quant', 'lab/quant'], ['#/firms', 'Firms', 'firms']] },
  { id: 'replay', label: 'Replay', ic: 'replay', href: '#/replay', segs: ['replay'] },
  { id: 'playbook', label: 'Playbook', ic: 'playbook', href: '#/playbook', segs: ['playbook'] },
];
/* What the phone's bottom bar carries; the rest are behind More. */
const PHONE = ['dashboard', 'journal', 'analytics', 'plan'];

export function sectionOf(seg) {
  return SECTIONS.find(s => s.segs.includes(seg || '')) || (seg === 'settings' || seg === 'accounts' ? { id: 'settings' } : SECTIONS[0]);
}

/** Which tab of a section the hash is on, or null when it is a page inside one (a trade, the rules). */
export function tabOf(section, hash) {
  if (!section.tabs) return null;
  const [, seg = '', arg = ''] = hash.split('/');
  const key = arg && section.id === 'lab' ? `${seg}/${arg}` : seg;
  return section.tabs.find(([, , k]) => k === key) || null;
}

/* ---------- glide: an indicator that travels instead of jumping ----------
   The bar is rebuilt on every render, so the indicator remembers where it
   was drawn last (by name) and is put back there before moving on. */
const lastAt = new Map();
export function glide(container, name, active, glider) {
  if (!active) { glider.style.opacity = '0'; lastAt.delete(name); return; }
  const place = () => ({ x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight });
  requestAnimationFrame(() => {
    if (!container.isConnected) return;
    const to = place();
    const from = lastAt.get(name);
    const set = p => { glider.style.transform = `translate(${p.x}px, ${p.y}px)`; glider.style.width = p.w + 'px'; glider.style.height = p.h + 'px'; };
    glider.style.transition = 'none';
    set(from || to);
    glider.style.opacity = '1';
    void glider.offsetWidth;
    glider.style.transition = '';
    if (from) set(to);
    lastAt.set(name, to);
  });
}

/* ---------- the top bar ---------- */
export function topbar(store, nav, { hash, onAccount, onYou }) {
  const [, seg = ''] = hash.split('/');
  const here = sectionOf(seg);
  const acct = store.activeAccount;

  const glider = el('span', { class: 'tb-glide', 'aria-hidden': 'true' });
  /* The journal carries its count — closed trades in the scope you are reading. */
  const count = acct ? store.tradesFor(acct.id).length : 0;
  const tabs = SECTIONS.map(s => el('a', { href: s.href, class: 'tb-tab' + (s.id === here.id ? ' is-on' : ''),
      'data-section': s.id, 'aria-current': s.id === here.id ? 'page' : null, title: s.label, 'aria-label': s.label },
    icon(s.ic, 15, 'currentColor', 1.7), el('span', {}, s.label),
    s.id === 'journal' && acct ? el('span', { class: 'count', title: `${count} trade${count === 1 ? '' : 's'}` }, String(count)) : null));
  const navEl = el('nav', { class: 'tb-nav', 'aria-label': 'Sections' }, glider, ...tabs);
  /* The pill is placed once the bar has been fitted to the window (fitTopbar),
     since folding changes where every tab sits. */
  glide(navEl, 'top', tabs.find(t => t.classList.contains('is-on')), glider);

  const stats = acct ? c.summarise(acct, store.tradesFor(acct.id)) : null;
  const mark = acct ? acctMark(store, acct, 20) : null;
  const acctBtn = acct ? el('button', { class: 'tb-acct' + (mark.classList.contains('ab-logo') ? ' has-logo' : ''), title: 'Switch account',
      onClick: e => onAccount(e.currentTarget) },
    mark,
    el('span', { class: 'acct-name tb-acct-n' }, acct.name),
    el('span', { class: 'acct-meta tb-acct-b' }, c.money(store.balanceOf(acct), { sign: false, currency: acct.currency, decimals: 0 })
      + ' · ' + (store.displayUnit === '$' ? c.pctSigned(c.asPercent(acct, stats.net)) : c.fig(store.displayUnit, acct, stats.net, stats.netR, { decimals: 0 }))),
    icon('chevdown', 12, 'currentColor', 2)) : null;

  const units = el('div', { class: 'unit-switch tb-units', role: 'group', 'aria-label': 'Show figures as' },
    ...c.UNITS.map(u => el('button', { class: store.displayUnit === u ? 'is-on' : '',
      title: u === '$' ? 'Show money' : u === '%' ? 'Show percent of starting balance' : 'Show R multiples',
      onClick: async () => { if (store.displayUnit !== u) { await store.setDisplayUnit(u); nav.refresh(); } } }, u)));

  const scope = acct && (store.testCountFor(acct.id) || store.tradeScope !== 'live')
    ? el('div', { class: 'unit-switch scope-switch tb-scope', role: 'group', 'aria-label': 'Which trades' },
        ...[['live', 'Live', 'Only the trades you took for real'],
            ['forward', 'Forward test', 'Only the forward tests'],
            ['all', 'All', 'Both, counted together']]
          .map(([v, label, why]) => el('button', { class: store.tradeScope === v ? 'is-on' : '', title: why,
            onClick: async () => { if (store.tradeScope === v) return; await store.setTradeScope(v); nav.refresh(); } }, label)))
    : null;

  return el('header', { class: 'topbar' },
    el('a', { class: 'tb-brand', href: '#/', 'aria-label': 'Laminar — dashboard' }, brandWordmark(17)),
    navEl,
    el('div', { class: 'tb-right' },
      scope, units, acctBtn,
      you(store, onYou)));
}

/* ============================================================
   Folding the bar to the window

   Everything in the bar has a natural width, and on a narrower window the
   sum stops fitting. Rather than let the tabs slide under the switches, the
   bar folds in steps until it fits, cheapest first:
     1  the account chip drops its balance
     2  the section tabs drop their icons
     3  every tab but the one you are on shows only its icon
     4  that one too, and the account chip shows only its dot
   Measured, not guessed, so a long account name or a wide font is folded
   for exactly as much as it needs.
   ============================================================ */
const FOLDS = 4;
function overflowing(bar) {
  const cs = getComputedStyle(bar);
  const gap = parseFloat(cs.columnGap) || 0;
  const kids = [...bar.children].filter(k => getComputedStyle(k).display !== 'none');
  const need = kids.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0)
    + gap * Math.max(0, kids.length - 1) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  return need > bar.clientWidth - 12;
}
export function fitTopbar(bar = document.querySelector('.topbar')) {
  if (!bar || !bar.isConnected) return;
  let lv = 0;
  for (; lv <= FOLDS; lv++) {
    for (let k = 1; k <= FOLDS; k++) bar.classList.toggle('f' + k, k <= lv);
    if (!overflowing(bar)) break;
  }
  bar.dataset.fit = String(Math.min(lv, FOLDS));
  /* put the pill straight onto the tab, wherever folding moved it */
  const nav = bar.querySelector('.tb-nav'), on = nav?.querySelector('.tb-tab.is-on'), pill = nav?.querySelector('.tb-glide');
  if (on && pill && pill.style.opacity === '1') {
    pill.style.transition = 'none';
    pill.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    pill.style.width = on.offsetWidth + 'px'; pill.style.height = on.offsetHeight + 'px';
    void pill.offsetWidth; pill.style.transition = '';
    lastAt.set('top', { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight });
  }
}
if (typeof window !== 'undefined') {
  let raf = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fitTopbar()); });
}

/** Your picture (or video), else your initials, else a person if you have
    not said who you are. Pressing it opens Settings. */
export function you(store, onClick, size = 30) {
  const who = store.userName;
  const initials = who.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const b = el('button', { class: 'tb-you', title: who ? `${who} — settings` : 'Settings', 'aria-label': 'Settings',
      style: { width: size + 'px', height: size + 'px', background: who ? store.userColour : 'var(--inset)' },
      onClick: e => onClick(e.currentTarget) },
    who ? el('span', { style: { color: store.userInk } }, initials) : icon('user', 15, 'var(--ink-3)', 1.8));
  profileFill(store, 'avatar', b);
  return b;
}

/**
 * Put your picture or video (`which`: 'avatar' | 'banner') into `host`,
 * filling it, once it has been read from the vault — at once when it has
 * been already. Whatever `host` held stays until then. False without one.
 */
export function profileFill(store, which, host) {
  const m = store.profileMedia(which);
  if (!m) return false;
  const put = url => {
    if (!url) return;
    let node;
    if (m.kind === 'video') {
      node = el('video', { class: 'pf-media', muted: true, loop: true, playsinline: true, 'aria-hidden': 'true', ...(m.thumb ? { poster: m.thumb } : {}) });
      node.muted = true; node.src = url;
      const still = document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!still) node.play().catch(() => {});
    } else node = el('img', { class: 'pf-media', src: url, alt: '' });
    host.querySelector(':scope > .pf-media')?.remove();
    host.prepend(node);
    host.classList.add('has-media');
  };
  const now = store.profileUrlNow(which);
  if (now) put(now); else store.profileUrl(which).then(put);
  return true;
}

/* ---------- the tabs a section shares ---------- */
export function subnav(section, hash, nav) {
  const on = tabOf(section, hash);
  const glider = el('span', { class: 'sn-glide', 'aria-hidden': 'true' });
  const links = section.tabs.map(([href, label]) => el('a', { href, class: 'sn-tab' + (on && on[0] === href ? ' is-on' : ''),
    onClick: e => { e.preventDefault(); nav.go(href); } }, label));
  const bar = el('nav', { class: 'subnav', 'aria-label': section.label }, glider, ...links);
  glide(bar, 'sub-' + section.id, links.find(a => a.classList.contains('is-on')), glider);
  return bar;
}

/* ---------- the phone's bar ---------- */
export function bottombar(store, nav, { hash, onMore }) {
  const [, seg = ''] = hash.split('/');
  const here = sectionOf(seg);
  const glider = el('span', { class: 'bb-glide', 'aria-hidden': 'true' });
  const inMore = !PHONE.includes(here.id);
  const items = [
    ...PHONE.map(id => SECTIONS.find(s => s.id === id)).map(s => el('a', { href: s.href, class: 'bb-tab' + (s.id === here.id ? ' is-on' : '') },
      icon(s.ic, 19, 'currentColor', 1.6), el('span', {}, s.label))),
    el('button', { class: 'bb-tab' + (inMore ? ' is-on' : ''), onClick: onMore },
      icon('more', 19, 'currentColor', 1.6), el('span', {}, 'More')),
  ];
  const bar = el('nav', { class: 'bottombar', 'aria-label': 'Sections' }, glider, ...items);
  glide(bar, 'bottom', items.find(i => i.classList.contains('is-on')), glider);
  /* Pages that already carry New trade in their header do not need a second one. */
  const fab = store.activeAccount && !['', 'trades', 'new', 'edit'].includes(seg)
    ? el('button', { class: 'fab', 'aria-label': 'New trade', onClick: () => nav.go('#/new') }, icon('plus', 22, 'currentColor', 2.2))
    : null;
  return [bar, fab];
}

/* ---------- menus ---------- */
export function accountMenu(store, nav, anchor) {
  const acct = store.activeAccount;
  let close;
  const body = el('div', { class: 'pop-list' },
    el('div', { class: 'pop-k' }, 'Accounts'),
    ...store.accounts.map(a => {
      const s = c.summarise(a, store.tradesFor(a.id));
      const isOn = acct && a.id === acct.id;
      return el('button', { class: 'pop-item' + (isOn ? ' is-on' : ''), role: 'menuitem',
          onClick: async () => { close(); if (!isOn) { await store.setActiveAccount(a.id); nav.refresh(); toast('Switched to ' + a.name); } } },
        acctMark(store, a, 18),
        el('span', { class: 'pop-n' }, a.name),
        el('span', { class: 'pop-b' }, c.money(store.balanceOf(a), { sign: false, currency: a.currency, decimals: 0 })),
        isOn ? icon('check', 13, 'currentColor', 2.4) : el('span', { style: { width: '13px' } }));
    }),
    el('div', { class: 'pop-sep' }),
    el('button', { class: 'pop-item', role: 'menuitem', onClick: () => { close(); nav.go('#/settings/accounts'); } },
      icon('gear', 14, 'currentColor', 1.7), el('span', { class: 'pop-n' }, 'Manage accounts')),
    el('button', { class: 'pop-item', role: 'menuitem', onClick: () => { close(); nav.go('#/accounts'); } },
      icon('plus', 14, 'currentColor', 2), el('span', { class: 'pop-n' }, 'New account')));
  close = popover(anchor, body, { cls: 'pop-accounts' });
}

/** The phone's More: every section the bottom bar has no room for. */
export function moreSheet(store, nav, { openLook }) {
  let s;
  const go = href => { s.close(); nav.go(href); };
  const rest = SECTIONS.filter(x => !PHONE.includes(x.id));
  const body = el('div', { class: 'ys' },
    el('div', { class: 'ys-group' },
      ...rest.map(x => el('button', { class: 'ys-row', onClick: () => go(x.href) },
        el('span', { class: 'ys-ic' }, icon(x.ic, 16, 'currentColor', 1.7)),
        el('span', { class: 'ys-t' }, el('span', { class: 'ys-n' }, x.label)),
        icon('chevright', 13, 'var(--ink-4)', 2)))),
    el('div', { class: 'ys-group' },
      el('button', { class: 'ys-row', onClick: () => { s.close(); openLook(); } },
        el('span', { class: 'ys-ic' }, icon('palette', 16, 'currentColor', 1.7)),
        el('span', { class: 'ys-t' }, el('span', { class: 'ys-n' }, 'Appearance')), icon('chevright', 13, 'var(--ink-4)', 2)),
      el('button', { class: 'ys-row', onClick: () => go('#/settings') },
        el('span', { class: 'ys-ic' }, icon('gear', 16, 'currentColor', 1.7)),
        el('span', { class: 'ys-t' }, el('span', { class: 'ys-n' }, 'Settings')), icon('chevright', 13, 'var(--ink-4)', 2))));
  s = sheet({ cls: 'is-more', title: 'More', body });
}

/* ============================================================
   Motion on arrival

   Only when the page is new (app.js decides that): the cards rise into
   place one after another, and the big figures write themselves in a
   glyph at a time. Nothing moves on a re-render.
   ============================================================ */
export function arrive(main) {
  const mode = document.documentElement.dataset.motion;
  if (mode === 'off' || document.documentElement.dataset.auto === 'on'
      || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = [...main.querySelectorAll('.card')].filter(cd => !cd.parentElement.closest('.card')).slice(0, 14);
  cards.forEach((cd, i) => { cd.style.setProperty('--i', String(i)); cd.classList.add('arrive'); });
  if (mode === 'calm') return;
  const figures = [...main.querySelectorAll('.kpi-val, .db-big, .lj-big, [data-glyphs]')].slice(0, 10);
  let n = 0;
  for (const f of figures) {
    const walker = document.createTreeWalker(f, NodeFilter.SHOW_TEXT);
    const texts = [];
    for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.nodeValue.trim()) texts.push(t);
    for (const t of texts) {
      const frag = document.createDocumentFragment();
      for (const ch of t.nodeValue) {
        const sp = document.createElement('span');
        sp.className = 'gl';
        sp.textContent = ch;
        sp.style.animationDelay = `${120 + Math.min(n++, 40) * 22}ms`;
        frag.append(sp);
      }
      t.replaceWith(frag);
    }
  }
}
export function settle(main) {
  for (const cd of main.querySelectorAll('.card.arrive')) cd.classList.remove('arrive');
}

/* ---------- segmented controls that slide ----------
   A view redraws its controls from scratch, so a segment cannot simply
   transition. Before the redraw each control's chosen button is measured;
   after it, a pill is put where the old one was and moved to the new one. */
const SEG = '.seg:not(.tc-seg):not(.tv-seg):not(.rv-seg), .unit-switch, .theme-switch, .ok-switch';
export function segMarks(root, placeOf) {
  const out = new Map();
  for (const s of root.querySelectorAll(SEG)) {
    const on = s.querySelector(':scope > .is-on');
    if (on) out.set(placeOf(s, root), { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight, i: [...s.children].indexOf(on) });
  }
  return out;
}
export function segGlide(root, marks, placeOf) {
  if (!marks.size || document.documentElement.dataset.motion === 'off') return;
  for (const s of root.querySelectorAll(SEG)) {
    const m = marks.get(placeOf(s, root));
    const on = s.querySelector(':scope > .is-on');
    if (!m || !on || [...s.children].indexOf(on) === m.i) continue;
    const pill = document.createElement('span');
    pill.className = 'seg-pill';
    const to = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    const put = p => { pill.style.transform = `translate(${p.x}px, ${p.y}px)`; pill.style.width = p.w + 'px'; pill.style.height = p.h + 'px'; };
    put(m);
    s.classList.add('is-gliding');
    s.prepend(pill);
    void pill.offsetWidth;
    pill.classList.add('go');
    put(to);
    setTimeout(() => { pill.remove(); s.classList.remove('is-gliding'); }, 300);
  }
}
