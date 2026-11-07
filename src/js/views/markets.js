/* ============================================================
   views/markets.js — Plan → Markets: Forex & futures · Stocks · Crypto as
   bubbles (Minato, 6 Nov).

   A bubble a market: its logo, its name, how far it has moved — the further
   the move, the bigger the bubble; green up, red down, the colour deeper the
   bigger the move. Each is a lit orb, after the one he sent (7 Nov): the
   light on its upper right rim, the colour deep inside, shade to the lower
   left. They drift about slowly on their own, nothing pulling them anywhere,
   and slide off each other where they meet. Drag one and the rest make way;
   let go and it carries on, slowing to a drift. A click opens its card,
   after the reference he sent: the logo and name, the price with its small
   decimals, the move, and its line with a dot and a price under the pointer.
   The field itself is see-through, so his background shows behind them.

   The prices are markets.js's; the page shows what is kept at once and asks
   again only while it is open and the window is in view.
   ============================================================ */
import { el, svg, icon, toast } from '../ui.js';
import { isTauri } from '../fs.js';
import * as M from '../markets.js';
import { pairMark } from '../flags.js';

const TABS = [['forex', 'Forex & futures'], ['stocks', 'Stocks'], ['crypto', 'Crypto']];
const TAB_KEY = 'laminar:markets:tab';
let tab = (() => { try { const v = localStorage.getItem(TAB_KEY); return TABS.some(([k]) => k === v) ? v : 'forex'; } catch { return 'forex'; } })();
const shown = { forex: 'All', stocks: 'All', crypto: 'All' };
const UP = '#2FD07F', DOWN = '#F0544F', FLAT = '#8A8F98';
const still = () => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- the logos ---------- */
/* Forex and futures wear the app's own marks (flags.js), the same as every
   list in the app: a pair's two flags, gold's three bars, 100 on blue,
   500 on red, the dollar's $. A coin wears CoinGecko's picture of it and a
   company Elbstream's; when a picture will not load, a coin falls back to
   the app's mark and a company to its ticker on a plain chip. */
let uid = 0;
const mark = (symbol, size) => { const m = pairMark(symbol, 26); m.style.setProperty('--pm', size); return m; };
const monogram = l => { const t = l.replace('.', ''); return t.length <= 4 ? t : t.slice(0, 1); };
function logo(tabKey, it, size) {
  const box = el('span', { class: 'mk-logo', style: { width: size, height: size } });
  if (tabKey === 'forex') { box.classList.add('is-mark'); box.append(mark(it.label, size)); return box; }
  const fallback = () => {
    box.className = 'mk-logo ' + (tabKey === 'crypto' ? 'is-mark' : 'is-chip is-letters');
    /* the letters are written by CSS, so the bubble's text stays its name and move */
    box.replaceChildren(tabKey === 'crypto' ? mark(it.label + 'USD', size) : el('span', { class: 'mk-mono', 'data-l': monogram(it.label), 'data-n': monogram(it.label).length }));
  };
  const src = tabKey === 'crypto' ? it.image : M.stockLogo(it.label);
  if (!src) { fallback(); return box; }
  box.classList.add(tabKey === 'crypto' ? 'is-coin' : 'is-chip');
  const img = el('img', { src, alt: '', referrerpolicy: 'no-referrer', decoding: 'async', draggable: 'false' });
  img.addEventListener('error', fallback, { once: true });
  box.append(img);
  return box;
}

/* ---------- numbers ---------- */
const group3 = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** The price as two parts, the whole and the decimals, as the card shows them ($2,593 .16). */
export function priceParts(tabKey, it, p) {
  if (!Number.isFinite(p)) return ['—', ''];
  const dp = tabKey === 'forex' ? (it.dp ?? 5) : p >= 1 ? 2 : p >= 0.01 ? 4 : Math.min(10, 2 - Math.floor(Math.log10(p)) + 2);
  const [w, d] = p.toFixed(dp).split('.');
  return [(tabKey === 'forex' ? '' : '$') + group3(w), d ? '.' + d : ''];
}
const pctText = c => (c == null || !Number.isFinite(c) ? '—' : `${c > 0 ? '+' : c < 0 ? '−' : ''}${Math.abs(c).toFixed(2)}%`);
const tone = c => (c == null || Math.abs(c) < 0.005 ? FLAT : c > 0 ? UP : DOWN);

export function markets(store, nav) {
  let data = M.kept(tab), busy = false, error = null;
  /* Stocks keeps its sectors as chips; Forex & futures shows all of his watchlist, no chips (Minato, 7 Nov) */
  const groupsOf = tab === 'stocks' ? M.SECTORS : [];

  /* ---------- the head ---------- */
  const stamp = el('span', { class: 'head-meta mk-stamp' });
  const err = el('span', { class: 'mk-err' });
  const refresh = el('button', { class: 'btn btn-light', title: 'Ask for the prices again now', onClick: () => pull() }, icon('refresh', 13, 'var(--grey-8)', 1.9), 'Refresh');
  const seg = el('div', { class: 'seg mk-tabs', role: 'tablist' }, ...TABS.map(([k, label]) =>
    el('button', { type: 'button', role: 'tab', class: k === tab ? 'is-on' : '', 'data-tab': k, 'aria-selected': String(k === tab),
      onClick: () => { if (k === tab) return; tab = k; try { localStorage.setItem(TAB_KEY, k); } catch { /* remembered for now only */ } nav.refresh({ keepFocus: true }); } }, label)));
  function paintHead() {
    const src = data?.source || '';
    const age = data?.at ? Math.round((Date.now() - data.at) / 60000) : null;
    stamp.textContent = busy ? 'asking…' : age == null ? '' : `${src} · ${age < 1 ? 'just now' : age < 60 ? `${age}m ago` : `${Math.floor(age / 60)}h ago`}`;
    err.textContent = busy ? '' : error ? (data ? `${error} Showing the last prices.` : '') : '';
    refresh.disabled = busy;
    refresh.classList.toggle('is-spinning', busy);
  }
  const head = el('header', { class: 'head mk-head' }, el('h1', {}, 'Markets'), seg, el('div', { class: 'spacer' }), err, stamp, refresh);

  /* ---------- the groups (his watchlist's, or the sectors) ---------- */
  const chips = groupsOf.length ? el('div', { class: 'mk-chips', role: 'group', 'aria-label': 'Sectors' },
    ...['All', ...groupsOf].map(g => el('button', { type: 'button', class: 'mk-chip' + (shown[tab] === g ? ' is-on' : ''), 'data-group': g,
      onClick: e => { shown[tab] = g; chips.querySelectorAll('.mk-chip').forEach(c => c.classList.toggle('is-on', c === e.currentTarget)); bubbles.set(visible()); } }, g))) : null;
  const inGroup = it => tab !== 'stocks' || shown[tab] === 'All' || it.sector === shown[tab];
  const visible = () => (data?.items || []).filter(inGroup);

  /* ---------- the bubbles ---------- */
  const fieldEl = el('div', { class: 'mk-field', role: 'list', 'aria-label': 'Markets by how far they have moved' });
  const empty = el('div', { class: 'mk-empty', hidden: true });
  fieldEl.append(empty);
  const bubbles = field(fieldEl, { onOpen: (n, rect) => openCard(n.it, rect), tabKey: tab });

  /* ---------- the card ---------- */
  let card = null;
  function openCard(it, at) {
    const wasOpen = !!card;
    closeCard(true);
    card = makeCard(tab, it, () => closeCard());
    fieldEl.append(card.el);
    /* beside the bubble, on the side with the room, inside the field */
    const W = fieldEl.clientWidth, H = fieldEl.clientHeight, cw = card.el.offsetWidth, ch = card.el.offsetHeight;
    const right = at.x + at.r + 16, left = at.x - at.r - 16 - cw;
    const x = right + cw <= W - 12 ? right : left >= 12 ? left : Math.max(12, Math.min(W - cw - 12, at.x - cw / 2));
    const y = Math.max(12, Math.min(H - ch - 12, at.y - ch / 2));
    card.el.style.left = x + 'px'; card.el.style.top = y + 'px';
    card.el.style.transformOrigin = `${x === right ? 0 : x === left ? '100%' : '50%'} 50%`;
    if (still() || wasOpen) card.el.classList.add('is-in');
    else requestAnimationFrame(() => requestAnimationFrame(() => card?.el.classList.add('is-in')));
    bubbles.mark(it.key);
    document.addEventListener('keydown', onEsc, true);
  }
  function closeCard(now = false) {
    document.removeEventListener('keydown', onEsc, true);
    bubbles.mark(null);
    if (!card) return;
    const c = card; card = null;
    c.el.classList.remove('is-in');
    if (now || still()) c.el.remove(); else setTimeout(() => c.el.remove(), 220);
  }
  function onEsc(e) { if (!fieldEl.isConnected) return document.removeEventListener('keydown', onEsc, true); if (e.key === 'Escape') { e.stopPropagation(); closeCard(); } }
  fieldEl.addEventListener('pointerdown', e => { if (card && !e.target.closest('.mk-card, .mk-b')) closeCard(); });

  /* ---------- asking for prices ---------- */
  async function pull() {
    if (busy) return;
    busy = true; paintHead();
    try { data = await M.loaders[tab](); error = null; }
    catch (e) { error = e.message || String(e); if (e.needsKey) error = e.message; }
    busy = false;
    paintHead(); paintEmpty();
    bubbles.set(visible());
  }
  function paintEmpty() {
    const none = !data?.items?.length;
    empty.hidden = !none;
    if (!none) return;
    /* (replaceChildren writes a null out as the word "null" — so only what is there) */
    empty.replaceChildren(...[
      el('strong', {}, busy ? 'Asking for the prices…' : error ? 'No prices yet' : 'Nothing here yet'),
      el('span', {}, busy ? '' : error || ''),
      !busy && /OANDA key/.test(error || '') ? el('button', { class: 'btn btn-light', onClick: () => nav.go('#/settings/charts') }, 'Add your OANDA key')
        : !busy && /Finnhub key/.test(error || '') ? el('button', { class: 'btn btn-light', onClick: () => nav.go('#/settings/charts') }, 'Open Settings') : null,
    ].filter(Boolean));
  }
  const tick = setInterval(() => {
    /* gone (or never shown, fifteen seconds on): this page's timer stops for good */
    if (!fieldEl.isConnected) { clearInterval(tick); return; }
    paintHead();
    if (!document.hidden && !busy && (!data || Date.now() - data.at > M.EVERY[tab])) pull();
  }, 15000);

  /* the field reaches down to the bottom of the window */
  const reach = () => { if (!fieldEl.isConnected) { removeEventListener('resize', reach); return; }
    const credit = fieldEl.parentElement?.querySelector('.mk-credit');
    fieldEl.style.setProperty('--mk-top', Math.round(fieldEl.getBoundingClientRect().top + 22 + (credit ? credit.offsetHeight + 12 : 0)) + 'px'); };
  addEventListener('resize', reach);
  requestAnimationFrame(reach);

  paintHead(); paintEmpty();
  bubbles.set(visible());
  if (!data || Date.now() - data.at > M.EVERY[tab]) setTimeout(pull, 50);

  /* where the prices and pictures come from; Elbstream's free logos ask for a link back that can be read (12 pt) */
  const elbstream = el('a', { href: 'https://elbstream.com', target: '_blank', rel: 'noopener',
    onClick: e => { if (!isTauri()) return; e.preventDefault(); navigator.clipboard?.writeText('https://elbstream.com').then(() => toast('Link copied — paste it into your browser'), () => toast('https://elbstream.com')); } }, 'Elbstream');
  const credit = tab === 'crypto' ? el('p', { class: 'mk-credit' }, 'Coin prices and pictures: CoinGecko, or Binance when CoinGecko is busy.')
    : tab === 'stocks' ? el('p', { class: 'mk-credit is-logos' }, 'Logos by ', elbstream) : null;
  const view = el('div', { class: 'view mk-view' }, head, chips, fieldEl, credit);
  /* for the suites */
  view.__markets = { get tab() { return tab; }, get data() { return data; }, get error() { return error; }, pull, bubbles: () => bubbles.state(),
    open: key => { const n = bubbles.state().find(b => b.key === key); if (n) openCard(n.it, n); }, get card() { return card?.el || null; }, closeCard };
  return view;
}

/* ---------- the field: bubbles drifting about, making room for each other ---------- */
/* Each bubble wanders on its own heading, which turns slowly back and forth,
   at a few pixels a second (the small ones a little quicker). Nothing pulls
   them anywhere: near an edge a bubble turns back in, and where two meet they
   slide off each other, each turning away. A held bubble stays put, and so
   does the one whose card is open. They are placed apart before they are
   shown, so they grow in where they will be, not in a heap.
   Where two come near, a soft cushion (CUSH px deep, nothing at its edge,
   firmer the deeper) eases them off each other before they touch, so a
   meeting is a glide, never a nudge; the edges of the field have the same.
   Each bubble is its own layer and is only ever moved — to a fraction of a
   pixel, every frame, so a slow drift is smooth rather than a pixel's step
   every few frames — and never scaled, so its text and logo stay sharp.
   Growing in and shrinking away scale what is inside it, which is drawn
   afresh each time. */
const GAP = 5, SPEED = 12, CUSH = 12;
const seeded = key => { let a = [...key].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7) >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function field(box, { onOpen, tabKey }) {
  const nodes = new Map();
  let W = 0, H = 0, raf = 0, last = 0, T = 0, marked = null;
  const fixed = n => n.held || n.key === marked;

  function targets(list) {
    const mags = list.map(it => Math.abs(it.change ?? 0)), top = Math.max(0.01, ...mags);
    const raw = mags.map(m => 0.42 + Math.sqrt(m / top));
    /* as big as the field allows (about half of it covered), but the biggest move no bigger than a fifth of the field,
       and every other in proportion to it — never several squashed to the same cap */
    const cap = Math.min(W, H) * 0.21, most = Math.max(...raw);
    const k = Math.min(Math.sqrt(W * H * 0.5 / (Math.PI * raw.reduce((s, v) => s + v * v, 0) || 1)), cap / most);
    return raw.map(v => Math.max(24, v * k));
  }
  function paintBubble(n) {
    const it = n.it, c = tone(it.change), strength = Math.min(1, 0.3 + Math.abs(it.change ?? 0) / Math.max(0.01, n.top) * 0.7);
    n.d = Math.round(n.tr * 2);
    n.el.style.width = n.el.style.height = n.d + 'px';
    n.el.style.setProperty('--d', n.d + 'px');
    n.el.style.setProperty('--c', c);
    n.el.style.setProperty('--a', strength.toFixed(2));
    n.el.classList.toggle('is-s', n.d < 66);
    n.el.classList.toggle('is-xs', n.d < 50);
    n.el.setAttribute('aria-label', `${it.label}, ${it.name}: ${pctText(it.change)}`);
    n.pct.textContent = pctText(it.change);
  }
  function make(it) {
    const pct = el('span', { class: 'mk-pct' });
    const inner = el('span', { class: 'mk-b-in' }, logo(tabKey, it, 'calc(var(--d) * .3)'), el('span', { class: 'mk-name' }, it.label), pct);
    const node = el('button', { type: 'button', class: 'mk-b', role: 'listitem', 'data-key': it.key }, inner);
    const r = seeded(it.key);
    const n = { key: it.key, it, el: node, inner, pct, x: W / 2, y: H / 2, vx: 0, vy: 0, r: 0, tr: 0, d: 0, top: 1, held: false, born: Infinity,
      th: r() * Math.PI * 2, f: 0.18 + r() * 0.22, p: r() * Math.PI * 2, sp: 0.8 + r() * 0.4, sc: null };
    grab(n);
    return n;
  }
  /** Show these, sized by their moves: new ones grow in where there is room, gone ones shrink away. */
  function set(list) {
    measure();
    const tr = W ? targets(list) : list.map(() => 30), top = Math.max(0.01, ...list.map(it => Math.abs(it.change ?? 0)));
    const keep = new Set(list.map(it => it.key));
    for (const [k, n] of nodes) if (!keep.has(k)) { n.tr = 0; n.going = true; }
    /* the biggest first, nearest the middle; the rest in a sunflower spiral round it, spread over the whole field */
    const order = list.map((it, i) => [it, tr[i]]).sort((a, b) => b[1] - a[1]), fresh = [], N = order.length;
    order.forEach(([it, r], i) => {
      let n = nodes.get(it.key);
      if (!n || n.going) {
        if (n) n.el.remove();
        n = make(it);
        nodes.set(it.key, n); box.append(n.el);
      }
      if (!n.placed && W) {
        const a = i * 2.39996, d = Math.sqrt((i + 0.5) / N);
        n.x = W / 2 + Math.cos(a) * d * (W / 2 - r); n.y = H / 2 + Math.sin(a) * d * (H / 2 - r); n.placed = true;
        n.born = T + fresh.length * 0.03;
        fresh.push(n);
      }
      n.it = it; n.tr = r; n.top = top; n.going = false;
      paintBubble(n);
    });
    if (!W) return;
    if (fresh.length) apart(fresh, 240);
    if (still()) rest(); else { render(); wake(); }
  }
  function measure() { W = box.clientWidth; H = box.clientHeight; }
  /* push these (and only these) out of everything they overlap, at their full sizes, before they are shown */
  function apart(movable, rounds) {
    const mv = new Set(movable), live = [...nodes.values()].filter(n => !n.going);
    for (let k = 0; k < rounds; k++) {
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j], ma = mv.has(a) && !fixed(a), mb = mv.has(b) && !fixed(b);
        if (!ma && !mb) continue;
        let dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
        const min = a.tr + b.tr + GAP + CUSH * 0.5;
        if (dist >= min) continue;
        if (dist < 0.01) { dx = Math.cos(i + j); dy = Math.sin(i + j); dist = 1; }
        const push = (min - dist) / dist * 0.5, sa = ma && mb ? 0.5 : ma ? 1 : 0, sb = 1 - sa;
        a.x -= dx * push * sa; a.y -= dy * push * sa; b.x += dx * push * sb; b.y += dy * push * sb;
      }
      for (const n of movable) { n.x = Math.max(n.tr + 2, Math.min(W - n.tr - 2, n.x)); n.y = Math.max(n.tr + 2, Math.min(H - n.tr - 2, n.y)); }
    }
  }
  /* with motion off: everything at its size, apart, and still */
  function rest() {
    for (const [k, n] of nodes) if (n.going) { n.el.remove(); nodes.delete(k); }
    const live = [...nodes.values()];
    for (const n of live) { n.r = n.tr; n.vx = n.vy = 0; }
    apart(live.filter(n => !fixed(n)), 400);
    render();
  }
  /* one small step of the drift, dt seconds */
  function step(dt) {
    T += dt;
    const list = [...nodes.values()], live = list.filter(n => !n.going);
    const big = Math.max(1, ...live.map(n => n.tr));
    const grow = 1 - Math.exp(-dt * 6), relax = 1 - Math.exp(-dt * 0.8), brake = 1 - Math.exp(-dt * 3);
    for (const n of list) {
      if (T >= n.born) { n.r += (n.tr - n.r) * grow; if (Math.abs(n.tr - n.r) < 0.25) n.r = n.tr; }
      if (n.held) continue;
      if (n.key === marked) { n.vx -= n.vx * brake; n.vy -= n.vy * brake; }
      else {
        /* a slow meander */
        n.th += Math.sin(T * n.f + n.p) * 0.45 * dt;
        /* near an edge, it turns back in */
        const m = n.r + 30;
        const ix = n.x < m ? 1 : n.x > W - m ? -1 : 0, iy = n.y < m ? 1 : n.y > H - m ? -1 : 0;
        if (ix || iy) { const dth = Math.atan2(Math.sin(Math.atan2(iy, ix) - n.th), Math.cos(Math.atan2(iy, ix) - n.th)); if (Math.abs(dth) > 0.9) n.th += dth * Math.min(1, dt * 1.4); }
        const s = SPEED * n.sp * (0.7 + 0.6 * (1 - n.tr / big)), wx = Math.cos(n.th) * s, wy = Math.sin(n.th) * s;
        /* thrown, it slows quickly to its own pace; otherwise it eases into it */
        const k = Math.hypot(n.vx, n.vy) > s * 2.5 ? brake : relax;
        n.vx += (wx - n.vx) * k; n.vy += (wy - n.vy) * k;
      }
      n.x += n.vx * dt; n.y += n.vy * dt;
    }
    /* where two come near: the cushion eases them apart and takes out their speed into each other (so they slide
       past, not bounce), and each turns away; only if they truly touch (a throw, a drag) are they moved apart at once */
    const away = (n, ux, uy, q) => { if (fixed(n)) return; const hx = Math.cos(n.th), hy = Math.sin(n.th); if (hx * ux + hy * uy > 0) n.th += (hx * uy - hy * ux >= 0 ? -1 : 1) * dt * 1.6 * q; };
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (!a.r || !b.r) continue;
      const dx = b.x - a.x, dy = b.y - a.y, reach = a.r + b.r + GAP + CUSH;
      if (Math.abs(dx) >= reach || Math.abs(dy) >= reach) continue;
      const dist = Math.hypot(dx, dy) || 0.01;
      if (dist >= reach) continue;
      const ia = fixed(a) ? 0 : 1 / (a.r * a.r), ib = fixed(b) ? 0 : 1 / (b.r * b.r), s = ia + ib;
      if (!s) continue;
      const nx = dx / dist, ny = dy / dist, wa = ia / s, wb = ib / s;
      const q = Math.min(1.5, (reach - dist) / CUSH), acc = 140 * q * q * dt;
      a.vx -= nx * acc * wa; a.vy -= ny * acc * wa; b.vx += nx * acc * wb; b.vy += ny * acc * wb;
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) { const f = rv * (1 - Math.exp(-dt * 7 * q)); a.vx += nx * f * wa; a.vy += ny * f * wa; b.vx -= nx * f * wb; b.vy -= ny * f * wb; }
      away(a, nx, ny, q); away(b, -nx, -ny, q);
      const touch = a.r + b.r + 1;
      if (dist < touch) { const corr = touch - dist; a.x -= nx * corr * wa; a.y -= ny * corr * wa; b.x += nx * corr * wb; b.y += ny * corr * wb; }
    }
    /* the edges: the same cushion, then a hard stop */
    const edge = (p, lo, hi, v) => {
      const qa = (lo + CUSH - p) / CUSH, qb = (p - (hi - CUSH)) / CUSH;
      if (qa > 0) { v += 140 * Math.min(1.5, qa) ** 2 * dt; if (v < 0) v *= Math.exp(-dt * 7 * Math.min(1.5, qa)); }
      if (qb > 0) { v -= 140 * Math.min(1.5, qb) ** 2 * dt; if (v > 0) v *= Math.exp(-dt * 7 * Math.min(1.5, qb)); }
      return v;
    };
    for (const n of list) {
      const lo = n.r + 2;
      if (!fixed(n)) { n.vx = edge(n.x, lo, W - lo, n.vx); n.vy = edge(n.y, lo, H - lo, n.vy); }
      if (n.x < lo) { n.x = lo; if (n.vx < 0) n.vx = 0; } else if (n.x > W - lo) { n.x = W - lo; if (n.vx > 0) n.vx = 0; }
      if (n.y < lo) { n.y = lo; if (n.vy < 0) n.vy = 0; } else if (n.y > H - lo) { n.y = H - lo; if (n.vy > 0) n.vy = 0; }
    }
  }
  function sweep() { for (const [k, n] of nodes) if (n.going && n.r < 1) { n.el.remove(); nodes.delete(k); } }
  function render() {
    for (const n of nodes.values()) {
      const h = n.d / 2, s = h ? n.r / h : 0;
      /* to a hundredth of a pixel: a slow drift is a glide, not a pixel's hop every few frames */
      const tf = `translate(${(n.x - h).toFixed(2)}px,${(n.y - h).toFixed(2)}px)`;
      if (tf !== n.tf) { n.el.style.transform = tf; n.tf = tf; }
      const sc = !n.going && Math.abs(s - 1) < 0.004 ? '' : Math.max(0, s).toFixed(3);
      if (sc !== n.sc) { n.inner.style.scale = sc; n.sc = sc; }
      const op = n.going ? Math.min(1, n.r / 20).toFixed(2) : '';
      if (op !== n.op) { n.el.style.opacity = op; n.op = op; }
    }
  }
  /* by the clock, in steps of at most 1/120 s, so it drifts at the same pace on any screen; it keeps going while the
     field is on screen and the window is in view, and stops for good once the page is left */
  function frame(now) {
    raf = 0;
    if (!box.isConnected || document.hidden) { last = 0; return; }
    if (still()) { last = 0; rest(); return; }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const k = Math.max(1, Math.ceil(dt * 120));
    for (let i = 0; i < k; i++) step(dt / k);
    sweep(); render();
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && !still() && box.isConnected) raf = requestAnimationFrame(frame); }
  const onVis = () => { if (!box.isConnected) { if (box.__seen) document.removeEventListener('visibilitychange', onVis); return; } if (!document.hidden) wake(); };
  document.addEventListener('visibilitychange', onVis);
  /* drag to move one (the rest make way); a press without a move opens its card */
  function grab(n) {
    n.el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      const r0 = box.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, ox = n.x - (sx - r0.left), oy = n.y - (sy - r0.top);
      let moved = false, lt = performance.now(), lx = sx, ly = sy, vx = 0, vy = 0;
      n.held = true; n.vx = n.vy = 0;
      n.el.setPointerCapture(e.pointerId);
      const move = ev => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        if (!moved) { moved = true; n.el.classList.add('is-held'); }
        const t = performance.now(), dts = Math.max(8, t - lt) / 1000;
        vx = vx * 0.5 + (ev.clientX - lx) / dts * 0.5; vy = vy * 0.5 + (ev.clientY - ly) / dts * 0.5;
        lt = t; lx = ev.clientX; ly = ev.clientY;
        n.x = Math.max(n.r + 2, Math.min(W - n.r - 2, ev.clientX - r0.left + ox));
        n.y = Math.max(n.r + 2, Math.min(H - n.r - 2, ev.clientY - r0.top + oy));
        if (still()) { apart([...nodes.values()].filter(o => o !== n && !o.going), 60); render(); } else wake();
      };
      const up = () => {
        n.el.removeEventListener('pointermove', move); n.el.removeEventListener('pointerup', up); n.el.removeEventListener('pointercancel', up);
        n.el.classList.remove('is-held');
        n.held = false;
        if (moved) {
          /* let go: it carries on the way it was thrown, then slows to its own drift */
          const sp = Math.hypot(vx, vy), f = sp > 700 ? 700 / sp : 1;
          n.vx = vx * f * 0.6; n.vy = vy * f * 0.6;
          if (sp > 30) n.th = Math.atan2(vy, vx);
          if (still()) rest(); else wake();
        } else onOpen(n, { x: n.x, y: n.y, r: n.tr });
      };
      n.el.addEventListener('pointermove', move); n.el.addEventListener('pointerup', up); n.el.addEventListener('pointercancel', up);
    });
    n.el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(n, { x: n.x, y: n.y, r: n.tr }); } });
  }
  const ro = new ResizeObserver(() => {
    if (!box.isConnected) { if (box.__seen) ro.disconnect(); return; }
    box.__seen = true;
    const w0 = W, h0 = H;
    measure();
    if (!W || (w0 === W && h0 === H)) return;
    set([...nodes.values()].filter(n => !n.going).map(n => n.it));
  });
  ro.observe(box);
  return {
    set,
    mark(key) { marked = key; for (const n of nodes.values()) n.el.classList.toggle('is-on', n.key === key); if (!key) wake(); },
    state: () => [...nodes.values()].filter(n => !n.going).map(n => ({ key: n.key, it: n.it, x: n.x, y: n.y, r: n.r, tr: n.tr })),
    get marked() { return marked; },
  };
}

/* ---------- the card ---------- */
function makeCard(tabKey, it, close) {
  const ranges = M.RANGES[tabKey].map(r => r[0]);
  let range = ranges[0], hoverX = null, pts = null;
  const [whole, dec] = priceParts(tabKey, it, it.price);
  const c = tone(it.change);
  const chart = el('div', { class: 'mk-c-chart is-loading' });
  const tip = el('div', { class: 'mk-tip', hidden: true });
  const rangeBar = el('div', { class: 'mk-ranges' }, ...ranges.map(r => el('button', { type: 'button', class: r === range ? 'is-on' : '', 'data-range': r,
    onClick: () => { if (r === range) return; range = r; rangeBar.querySelectorAll('button').forEach(b => b.classList.toggle('is-on', b.dataset.range === r)); load(); } }, r)));
  const node = el('div', { class: 'mk-card', role: 'dialog', 'aria-label': `${it.name}: ${pctText(it.change)}` },
    el('div', { class: 'mk-c-top' },
      el('span', { class: 'mk-c-logo' }, logo(tabKey, it, '26px')),
      el('div', { class: 'mk-c-names' }, el('strong', {}, it.name), el('span', {}, it.label)),
      el('div', { class: 'spacer' }), rangeBar,
      el('button', { type: 'button', class: 'mk-c-x', 'aria-label': 'Close', onClick: close }, '×')),
    el('div', { class: 'mk-c-price' }, whole, el('small', {}, dec)),
    el('div', { class: 'mk-c-chg', style: { color: c } },
      el('i', { class: 'mk-tri' + ((it.change ?? 0) < 0 ? ' is-down' : '') }), pctText(it.change).replace(/^[+−]/, ''),
      el('span', { class: 'mk-c-when' }, tabKey === 'crypto' ? 'last 24 hours' : 'today' + (it.sinceOpen ? ' (since the open)' : ''))),
    chart, tip);

  async function load() {
    chart.classList.add('is-loading'); chart.replaceChildren(); tip.hidden = true;
    const want = range;
    try {
      const got = await M.lineFor(tabKey, it, want);
      if (want !== range) return;
      pts = got.filter(p => Number.isFinite(p[1]));
      chart.classList.remove('is-loading');
      if (pts.length < 2) { chart.replaceChildren(el('span', { class: 'mk-c-none' }, 'No line for this one just now.')); return; }
      hoverX = null; draw();
    } catch {
      if (want !== range) return;
      chart.classList.remove('is-loading');
      chart.replaceChildren(el('span', { class: 'mk-c-none' }, 'Its line could not be read just now.'));
    }
  }
  const CW = 340, CH = 132;
  function draw() {
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    let lo = Infinity, hi = -Infinity; for (const [, p] of pts) { if (p < lo) lo = p; if (p > hi) hi = p; }
    const pad = (hi - lo) * 0.12 || hi * 0.001 || 1;
    lo -= pad; hi += pad;
    const X = t => (t - t0) / Math.max(1, t1 - t0) * CW, Y = p => CH - (p - lo) / (hi - lo) * CH;
    const d = pts.map(([t, p], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(p).toFixed(1)}`).join('');
    const at = hoverX == null ? pts.length - 1 : nearest(hoverX, X);
    const [ht, hp] = pts[at], hx = X(ht), hy = Y(hp);
    const id = 'mkl' + (++uid);
    const s = svg('svg', { viewBox: `0 0 ${CW} ${CH}`, preserveAspectRatio: 'none', class: 'mk-line' },
      svg('defs', {},
        svg('linearGradient', { id: id + 's', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: CW, y2: 0 },
          ...[[Math.max(0, hx - 90), 0.32], [hx, 1], [Math.min(CW, hx + 90), 0.32]].map(([x, o]) => svg('stop', { offset: (x / CW).toFixed(4), 'stop-color': '#fff', 'stop-opacity': o }))),
        svg('linearGradient', { id: id + 'f', x1: 0, y1: 0, x2: 0, y2: 1 },
          svg('stop', { offset: 0, 'stop-color': '#9FB4D6', 'stop-opacity': 0.12 }), svg('stop', { offset: 1, 'stop-color': '#9FB4D6', 'stop-opacity': 0 }))),
      svg('path', { d: `${d}L${CW} ${CH}L0 ${CH}Z`, fill: `url(#${id}f)` }),
      svg('path', { d, fill: 'none', stroke: `url(#${id}s)`, 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));
    const dot = el('i', { class: 'mk-dot', style: { left: (hx / CW * 100) + '%', top: (hy / CH * 100) + '%' } });
    chart.replaceChildren(s, dot);
    const [pw, pdec] = priceParts(tabKey, it, hp);
    tip.replaceChildren(el('b', {}, pw + pdec), el('span', {}, when(ht, range)));
    tip.hidden = false;
    /* over the dot, kept inside the card */
    const cr = chart.getBoundingClientRect(), nr = node.getBoundingClientRect();
    const left = cr.left - nr.left + hx / CW * cr.width, top = cr.top - nr.top + hy / CH * cr.height;
    tip.style.left = Math.max(56, Math.min(nr.width - 56, left)) + 'px';
    tip.style.top = Math.max(8, top - 52) + 'px';
  }
  function nearest(x, X) { let best = 0, bd = Infinity; pts.forEach(([t], i) => { const dd = Math.abs(X(t) - x); if (dd < bd) { bd = dd; best = i; } }); return best; }
  chart.addEventListener('pointermove', e => { if (!pts || pts.length < 2) return; const r = chart.getBoundingClientRect(); hoverX = (e.clientX - r.left) / r.width * CW; draw(); });
  chart.addEventListener('pointerleave', () => { if (!pts || pts.length < 2) return; hoverX = null; draw(); });
  requestAnimationFrame(load);
  return { el: node };
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function when(t, range) {
  const d = new Date(t * 1000), day = `${d.getDate()} ${MON[d.getMonth()]}`;
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return range === '1D' ? `${day}, ${hm}` : range === '1W' ? `${day}, ${hm}` : `${day}, ${d.getFullYear()}`;
}
