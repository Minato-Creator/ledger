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
import { sheet, popover } from './sheet.js';
import { slidePill } from './glide.js';
import { acctMark } from './views/acctlogo.js';

export const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', ic: 'dashboard', href: '#/', segs: [''] },
  { id: 'journal', label: 'Journal', ic: 'journal', href: '#/trades',
    segs: ['trades', 'calendar', 'review', 'trade', 'new', 'edit', 'import'],
    tabs: [['#/trades', 'Trades', 'trades'], ['#/calendar', 'Calendar', 'calendar'], ['#/review', 'Review', 'review']] },
  /* News first, and Plan opens on it (Minato, 4 Nov); Outlook second; Markets, the bubbles (6 Nov) */
  { id: 'plan', label: 'Plan', ic: 'plan', href: '#/wire', segs: ['wire', 'outlook', 'markets'],
    tabs: [['#/wire', 'News', 'wire'], ['#/outlook', 'Outlook', 'outlook'], ['#/markets', 'Markets', 'markets']] },
  { id: 'analytics', label: 'Analytics', ic: 'analytics', href: '#/analytics', segs: ['analytics'] },
  { id: 'lab', label: 'Lab', ic: 'lab', href: '#/lab', segs: ['lab', 'firms'],
    tabs: [['#/lab', 'Monte Carlo', 'lab'], ['#/lab/prop', 'Prop firm', 'lab/prop'], ['#/lab/ghost', 'Ghost', 'lab/ghost'],
           ['#/lab/quant', 'Quant', 'lab/quant'], ['#/firms', 'Firms', 'firms']] },
  { id: 'replay', label: 'Replay', ic: 'replay', href: '#/replay', segs: ['replay'] },
  /* the Playbook lives in Settings → Trading now (Minato), not up here */
];
/* What the phone's bottom bar carries; the rest are behind More. */
const PHONE = ['dashboard', 'journal', 'analytics', 'plan'];

export function sectionOf(seg) {
  return SECTIONS.find(s => s.segs.includes(seg || '')) || (['settings', 'accounts', 'playbook'].includes(seg) ? { id: 'settings' } : SECTIONS[0]);
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
const flights = new Map();     // name -> the liquid run in progress: { anim, sample, t0, dur }
export function glide(container, name, active, glider, { liquid = false } = {}) {
  if (!active) { glider.style.opacity = '0'; lastAt.delete(name); return; }
  const place = () => ({ x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight });
  requestAnimationFrame(() => {
    if (!container.isConnected) return;
    const to = place();
    /* mid-pour, a page drawn again starts from where the drop is now */
    const f = flights.get(name), age = f ? performance.now() - f.t0 : 0;
    const from = f && age < f.dur ? f.sample(age) : lastAt.get(name);
    if (f) { f.anim.cancel(); flights.delete(name); }
    const set = p => { glider.style.transform = `translate(${p.x}px, ${p.y}px)`; glider.style.width = p.w + 'px'; glider.style.height = p.h + 'px'; };
    glider.style.transition = 'none';
    set(from || to);
    glider.style.opacity = '1';
    void glider.offsetWidth;
    const still = document.documentElement.dataset.motion === 'off'
      || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (liquid && from && !still && glider.animate && (Math.abs(from.x - to.x) > 1 || Math.abs(from.w - to.w) > 1)) return pour(name, glider, from, to, set);
    glider.style.transition = '';
    if (from) set(to);
    lastAt.set(name, to);
  });
}

/* The dock's highlight moves like a drop: both edges ease out, the one on
   the side it is going a little quicker, so it draws out gently, then the
   other catches up and it settles — no hold, no snap. How far it may stretch
   eases into a small cap (tanh), so a long move stays a drop, not a band.
   The whole path is worked out first and handed to the compositor as one
   animation of transform alone, so a page busy drawing itself cannot make
   it stutter. */
function pour(name, glider, from, to, set) {
  const right = to.x + to.w / 2 >= from.x + from.w / 2;
  const L0 = from.x, R0 = from.x + from.w, L1 = to.x, R1 = to.x + to.w;
  const span = Math.max(1, Math.abs((to.x + to.w / 2) - (from.x + from.w / 2)));
  const ease = t => 1 - Math.pow(1 - t, 3);
  const LEAD = 440, TRAIL = 620, MAX = Math.min(24, span * 0.14);
  const sample = e => {
    const a = ease(Math.min(1, e / LEAD)), b = ease(Math.min(1, e / TRAIL));
    const base = from.w + (to.w - from.w) * b;
    let L = right ? L0 + (L1 - L0) * b : L0 + (L1 - L0) * a;
    let R = right ? R0 + (R1 - R0) * a : R0 + (R1 - R0) * b;
    const extra = Math.max(0, (R - L) - base), soft = MAX * Math.tanh(extra / Math.max(1, MAX));
    if (right) L = R - (base + soft); else R = L + base + soft;
    const h = (from.h + (to.h - from.h) * b) * (1 - 0.04 * (soft / Math.max(1, MAX)));   // stretched, it thins a touch
    return { x: L, y: from.y + (to.y - from.y) * b + ((from.h + (to.h - from.h) * b) - h) / 2, w: Math.max(4, R - L), h };
  };
  /* drawn at its final size and scaled from its corner, so only transform moves */
  set({ ...to, x: to.x, y: to.y });
  glider.style.transformOrigin = '0 0';
  const N = Math.ceil(TRAIL / 12), frames = [];
  for (let i = 0; i <= N; i++) {
    const p = sample(TRAIL * i / N);
    frames.push({ offset: i / N, transform: `translate(${p.x}px, ${p.y}px) scale(${p.w / to.w}, ${p.h / to.h})` });
  }
  const anim = glider.animate(frames, { duration: TRAIL, easing: 'linear', fill: 'forwards' });
  const run = { anim, sample, t0: performance.now(), dur: TRAIL };
  flights.set(name, run);
  lastAt.set(name, to);
  anim.finished.then(() => {
    if (flights.get(name) !== run) return;
    flights.delete(name);
    set(to); anim.cancel();
    requestAnimationFrame(() => { glider.style.transition = ''; });
  }).catch(() => {});
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
  glide(navEl, 'top', tabs.find(t => t.classList.contains('is-on')), glider, { liquid: true });

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
    flights.get('top')?.anim.cancel(); flights.delete('top');
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
  /* No picture and no colour of your own: a frosted disc, like the glass */
  const frost = !store.data.accounts.userColour;
  const b = el('button', { class: 'tb-you' + (frost ? ' is-frost' : ''), title: who ? `${who} — settings` : 'Settings', 'aria-label': 'Settings',
      style: { width: size + 'px', height: size + 'px', ...(frost ? {} : { background: who ? store.userColour : 'var(--inset)' }) },
      onClick: e => onClick(e.currentTarget) },
    who ? el('span', { style: frost ? {} : { color: store.userInk } }, initials) : icon('user', 15, 'currentColor', 1.8));
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
    /* m is where the old choice sat inside its bar (offset box); as a viewport rect: */
    const gr = s.getBoundingClientRect();
    const op = on.offsetParent === s ? { x: gr.left + s.clientLeft, y: gr.top + s.clientTop }
      : (() => { const r = on.getBoundingClientRect(); return { x: r.left - on.offsetLeft, y: r.top - on.offsetTop }; })();
    slidePill(s, on, { left: op.x + m.x, top: op.y + m.y, width: m.w, height: m.h });
  }
}
