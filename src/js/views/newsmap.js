/* ============================================================
   newsmap.js — where the news is, at the top of the News page.

   A world drawn in dots, seen from above, after the reference Minato chose,
   in black and white (4 Nov): the land in the page's ink, brightest along
   the coasts with a faint glow into the sea, a little relief lit from the
   top left, and the places the news is about brighter and fuller the more
   is said about them. The whole world, Greenland to Cape Horn, fitted to the
   card and still — no zoom, no labels, no list (his second pass, 4 Nov).
   Markers on the busiest places — ! where a red-folder event falls in the
   period, a shield where it is headlines only — and a click on one opens
   its red folders and headlines in a panel on the right, the map gliding
   aside to make room.

   What counts: every headline the wire holds (investingLive), placed by what
   it names — a currency (EUR/USD names both), a central bank, a country —
   and every high-impact event on the Forex Factory calendar, placed by its
   currency. Today, or this week (Monday on).

   It is drawn once (about a tenth of a second) and again only when the card
   changes size. The outlines are worldmap.js: projected once, ahead of time;
   they run past its frame, which is how the whole world fits.
   ============================================================ */
import { el, svg } from '../ui.js';
import { isBankHoliday } from '../questions.js';
import { localTime as ffTime, whenText } from '../news.js';
import { FRAME, COUNTRIES } from '../worldmap.js';

/* ---------- the places ----------
   codes are matched as written (US, USD, FOMC); words in any case */
const EURO = ['276', '250', '380', '724', '528', '056', '040', '372', '620', '246', '300', '703', '705', '428', '440', '233', '196', '442', '470', '191'];
export const REGIONS = [
  { key: 'US', name: 'United States', cur: 'USD', ids: ['840'], at: [-97, 38], codes: /\b(US|U\.S\.|USD|FOMC|NFP|SPX|NDX)\b/, words: /\b(fed|federal reserve|powell|treasur(y|ies)|wall street|nasdaq|s&p ?500|dow jones|non-?farm|american|washington|white house)\b/i },
  { key: 'EU', name: 'Euro area', cur: 'EUR', ids: EURO, at: [10, 49], codes: /\b(EUR|ECB|EU|DAX|CAC)\b/, words: /\b(euro(zone| area)?|lagarde|bund|germany|german|france|french|italy|italian|spain|spanish|netherlands|dutch|brussels|frankfurt)\b/i },
  { key: 'UK', name: 'United Kingdom', cur: 'GBP', ids: ['826'], at: [-1.5, 52.5], codes: /\b(UK|GBP|BoE|BOE|FTSE)\b/, words: /\b(britain|british|bank of england|gilts?|sterling|the pound|london|bailey)\b/i },
  { key: 'JP', name: 'Japan', cur: 'JPY', ids: ['392'], at: [139, 36], codes: /\b(JPY|BoJ|BOJ)\b/, words: /\b(japan|japanese|bank of japan|yen|nikkei|tokyo|ueda)\b/i },
  { key: 'CN', name: 'China', cur: 'CNY', ids: ['156'], at: [112, 31], codes: /\b(CNY|CNH|PBoC|PBOC)\b/, words: /\b(china|chinese|yuan|renminbi|beijing|shanghai|hang seng)\b/i },
  { key: 'CA', name: 'Canada', cur: 'CAD', ids: ['124'], at: [-79, 50], codes: /\b(CAD|BoC|BOC)\b/, words: /\b(canada|canadian|bank of canada|loonie|ottawa)\b/i },
  { key: 'AU', name: 'Australia', cur: 'AUD', ids: ['036'], at: [144, -31], codes: /\b(AUD|RBA|ASX)\b/, words: /\b(australia|australian|aussie|reserve bank of australia|sydney)\b/i },
  { key: 'NZ', name: 'New Zealand', cur: 'NZD', ids: ['554'], at: [174, -41], codes: /\b(NZD|RBNZ)\b/, words: /\b(new zealand|kiwi|wellington)\b/i },
  { key: 'CH', name: 'Switzerland', cur: 'CHF', ids: ['756'], at: [8, 47], codes: /\b(CHF|SNB)\b/, words: /\b(swiss|switzerland|swissie|zurich)\b/i },
  { key: 'RU', name: 'Russia', cur: 'RUB', ids: ['643'], at: [60, 58], codes: /\b(RUB)\b/, words: /\b(russia|russian|moscow|kremlin|putin)\b/i },
  { key: 'UA', name: 'Ukraine', cur: 'UAH', ids: ['804'], at: [31, 49], codes: /$^/, words: /\b(ukraine|ukrainian|kyiv)\b/i },
  { key: 'ME', name: 'Middle East', cur: 'OIL', ids: ['682', '364', '376', '368', '784', '414', '634', '760', '400', '422', '887', '512'], at: [47, 27], codes: /\b(OPEC\+?|UAE)\b/, words: /\b(saudi|iran|iranian|israel|israeli|gaza|iraq|middle east|gulf|opec|red sea|hormuz|yemen|houthi)\b/i },
  { key: 'IN', name: 'India', cur: 'INR', ids: ['356'], at: [79, 22], codes: /\b(INR|RBI)\b/, words: /\b(india|indian|rupee|mumbai|new delhi)\b/i },
  { key: 'MX', name: 'Mexico', cur: 'MXN', ids: ['484'], at: [-102, 23], codes: /\b(MXN|Banxico)\b/, words: /\b(mexico|mexican|peso)\b/i },
  { key: 'KR', name: 'South Korea', cur: 'KRW', ids: ['410'], at: [128, 36], codes: /\b(KRW|BoK|KOSPI)\b/, words: /\b(korea|korean|won|seoul)\b/i },
  { key: 'BR', name: 'Brazil', cur: 'BRL', ids: ['076'], at: [-51, -11], codes: /\b(BRL)\b/, words: /\b(brazil|brazilian|real)\b/i },
  { key: 'TR', name: 'Turkey', cur: 'TRY', ids: ['792'], at: [35, 39], codes: /\b(TRY|CBRT)\b/, words: /\b(turkey|turkish|lira|ankara)\b/i },
  { key: 'ZA', name: 'South Africa', cur: 'ZAR', ids: ['710'], at: [24, -29], codes: /\b(ZAR|SARB)\b/, words: /\b(south africa|rand|johannesburg)\b/i },
];
const BY_CUR = Object.fromEntries(REGIONS.map(r => [r.cur, r]));

/** Which places a headline is about. */
export function regionsOf(text) {
  const t = String(text || '');
  return REGIONS.filter(r => r.codes.test(t) || r.words.test(t));
}

/** The period: today, or this week from Monday, in your time. */
export function spanOf(which, now = new Date()) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (which === 'today') return { from: day.getTime(), to: day.getTime() + 864e5 - 1 };
  const mon = new Date(day); mon.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return { from: mon.getTime(), to: mon.getTime() + 7 * 864e5 - 1 };
}

/** Per place, for the period: { news, red, total, next, items (newest first), events (soonest first) }. */
export function countsFor(items, events, span, now = Date.now()) {
  const out = new Map(REGIONS.map(r => [r.key, { region: r, news: 0, red: 0, total: 0, next: null, items: [], events: [] }]));
  const inSpan = iso => { const t = Date.parse(iso); return t >= span.from && t <= span.to; };
  for (const it of items || []) {
    if (!inSpan(it.at)) continue;
    for (const r of regionsOf(`${it.title} ${it.summary || ''}`)) { const o = out.get(r.key); o.news++; o.total++; o.items.push(it); }
  }
  for (const e of events || []) {
    if (isBankHoliday(e) || !inSpan(e.at)) continue;
    const r = BY_CUR[String(e.country || '').toUpperCase()];
    if (!r) continue;
    const o = out.get(r.key); o.red++; o.total++; o.events.push(e);
    const t = Date.parse(e.at);
    if (t >= now && (!o.next || t < Date.parse(o.next.at))) o.next = e;
  }
  for (const o of out.values()) {
    o.items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    o.events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }
  return out;
}

/* ---------- the frame (worldmap.js): Mercator, 78°N to 50°S ---------- */
const rad = d => d * Math.PI / 180;
const merc = p => Math.log(Math.tan(Math.PI / 4 + rad(Math.max(-85, Math.min(85, p))) / 2));
const project = ([lon, lat]) => [FRAME.X0 + FRAME.K * rad(lon), FRAME.Y0 - FRAME.K * merc(lat)];
let PATHS = null;          // Path2D per country, made once
const paths = () => (PATHS ||= COUNTRIES.map(([id, d]) => ({ id, p: new Path2D(d) })));

/* relief: value noise in a few octaves */
const hash = (x, y) => { const q = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return q - Math.floor(q); };
const vn = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
};
const elev = (x, y) => vn(x / 38, y / 38) * 0.45 + vn(x / 16, y / 16) * 0.3 + vn(x / 7, y / 7) * 0.17 + vn(x / 3, y / 3) * 0.08;

/* kept between visits, and across the page's own redraws (a feed coming in, Today / This week) */
let period = 'week';
let openKey = null;
/* the whole world in the frame's units, Greenland's north coast to South Georgia, Alaska to Chukotka */
const BOX = { x0: 34, x1: 892, y0: -86, y1: 467 };
/* the dot spacing (CSS px), and how many shades of the ink the land and the sea are drawn in */
const S = 2.5, LAND = 20, SEA = 8, Q = 3;
/* the open place's panel, and the room it keeps from the map's right edge */
const POP_W = 300, GAP = 18;

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const still = () => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function newsMap(store, nav) {
  const span = spanOf(period === 'today' ? 'today' : 'week');
  const counts = countsFor(store.wire?.items || [], store.news?.events || [], span);
  const ranked = [...counts.values()].filter(o => o.total > 0).sort((a, b) => b.total - a.total);
  const top = ranked[0]?.total || 0;
  /* the heat each country takes: its place's share of the busiest, square-rooted so the quiet ones still show */
  const heatOf = new Map();
  for (const o of ranked) for (const id of o.region.ids) heatOf.set(id, Math.sqrt(o.total / top));

  const seg = el('span', { class: 'nm-seg', role: 'group', 'aria-label': 'Which period' },
    ...[['today', 'Today'], ['week', 'This week']].map(([k, label]) =>
      el('button', { type: 'button', class: period === k ? 'is-on' : '', onClick: () => { if (period !== k) { period = k; nav.refresh({ keepFocus: true }); } } }, label)));

  const cv = el('canvas', { class: 'nm-canvas', 'aria-hidden': 'true' });
  const marks = el('div', { class: 'nm-marks' });
  /* the map and its markers move together when the open place needs the room */
  const stage = el('div', { class: 'nm-stage' }, cv, marks);
  const body = el('div', { class: 'nm-body' }, stage);
  const card = el('section', { class: 'card nm-card', 'aria-label': 'Where the news is' }, body, seg);

  /* ---------- the markers: ! for a red folder, a shield for headlines; a click opens what is there ---------- */
  const pins = ranked.slice(0, 8).map(o => {
    const [x, y] = project(o.region.at);
    const red = o.red > 0;
    const pin = el('button', { type: 'button', class: 'nm-mk ' + (red ? 'is-red' : 'is-news'), 'aria-label': `${o.region.name}: ${plural(o.red, 'red folder')}, ${plural(o.news, 'headline')}`,
      'aria-expanded': 'false', dataset: { key: o.region.key }, onClick: () => (openKey === o.region.key ? closePop() : openPop(o)) },
      el('i', {}, red ? '!' : svg('svg', { width: 8, height: 8, viewBox: '0 0 24 24', fill: 'currentColor' }, svg('path', { d: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z' }))));
    marks.append(pin);
    return { x, y, el: pin, o };
  });

  /* ---------- what is there: the place's red folders and headlines for the period, in a panel on the right ---------- */
  const when = iso => (period === 'today' ? '' : new Date(iso).toLocaleDateString('en-AU', { weekday: 'short' }) + ' ') + ffTime(iso);
  function inner(o) {
    let n = 0;
    /* the rows come in one after another, a beat apart */
    const row = (cls, ...kids) => el('div', { class: 'nm-pop-row' + cls, style: { '--i': Math.min(n++, 9) } }, ...kids);
    const sec = (title, rows) => (rows.length ? el('div', { class: 'nm-pop-sec' }, el('h4', {}, title), ...rows) : null);
    return el('div', { class: 'nm-pop-in' },
      el('div', { class: 'nm-pop-head' },
        el('span', { class: 'nm-cur' }, o.region.cur),
        el('strong', {}, o.region.name),
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'nm-pop-x', 'aria-label': 'Close', onClick: () => closePop() }, '×')),
      el('div', { class: 'nm-pop-note' }, `${period === 'today' ? 'Today' : 'This week'} · ${plural(o.red, 'red folder')} · ${plural(o.news, 'headline')}`),
      el('div', { class: 'nm-pop-scroll' },
        sec('Red folders', o.events.map(e => row(' is-red',
          el('span', { class: 'nm-pop-t' }, when(e.at)),
          el('span', { class: 'nm-pop-what' }, e.title,
            (e.forecast || e.previous) ? el('small', {}, [e.forecast && `Forecast ${e.forecast}`, e.previous && `Previous ${e.previous}`].filter(Boolean).join(' · ')) : null),
          el('span', { class: 'nm-pop-due' }, whenText(e.at))))),
        sec('Headlines', o.items.map(it => row('',
          el('span', { class: 'nm-pop-t' }, when(it.at)),
          el('span', { class: 'nm-pop-what' }, it.title))))));
  }
  let pop = null;
  function openPop(o, { instant = false } = {}) {
    openKey = o.region.key;
    pins.forEach(p => { const on = p.o === o; p.el.classList.toggle('is-on', on); p.el.setAttribute('aria-expanded', String(on)); });
    if (pop && !pop.leaving) {
      /* already open: the new place's news in its place, the panel easing to its new height */
      const h0 = pop.el.offsetHeight;
      pop.el.querySelector('.nm-pop-in').replaceWith(inner(o));
      pop.o = o;
      if (!still()) {
        pop.el.style.height = 'auto';
        const h1 = pop.el.offsetHeight;
        pop.el.style.height = h0 + 'px'; void pop.el.offsetHeight;
        pop.el.style.height = h1 + 'px';
        clearTimeout(pop.unsize); pop.unsize = setTimeout(() => { if (pop) pop.el.style.height = ''; }, 320);
      }
      return;
    }
    if (pop) pop.el.remove();
    const node = el('div', { class: 'nm-pop' + (instant || still() ? ' is-in is-still' : ''), role: 'dialog', 'aria-label': `${o.region.name}: the news` }, inner(o));
    pop = { o, el: node };
    body.append(node);
    if (!node.classList.contains('is-in')) requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('is-in')));
    document.addEventListener('keydown', onEsc, true);
    room();
  }
  function closePop() {
    openKey = null;
    pins.forEach(p => { p.el.classList.remove('is-on'); p.el.setAttribute('aria-expanded', 'false'); });
    document.removeEventListener('keydown', onEsc, true);
    if (!pop || pop.leaving) return;
    const p = pop; p.leaving = true;
    p.el.classList.remove('is-in');
    setTimeout(() => { p.el.remove(); if (pop === p) pop = null; }, still() ? 0 : 260);
    room();
  }
  function onEsc(e) {
    if (!card.isConnected) return document.removeEventListener('keydown', onEsc, true);
    if (e.key === 'Escape') { e.stopPropagation(); closePop(); }
  }
  /* with a place open the map glides left just far enough to clear the panel (no further than its own left margin) */
  function room() {
    const open = pop && !pop.leaving;
    const right = view.ox + BOX.x1 * view.s, left = view.ox + BOX.x0 * view.s;
    const shift = open ? Math.max(0, Math.min(left - 8, right + GAP + POP_W + 10 - W)) : 0;
    stage.style.transform = shift ? `translateX(${-Math.round(shift)}px)` : '';
  }

  /* ---------- drawing: the whole world, fitted to the card and centred ---------- */
  const view = { s: 1, ox: 0, oy: 0 };
  let W = 0, H = 0, dpr = 1, drawn = null, idle = 0;
  const fit = () => {
    W = body.clientWidth; H = body.clientHeight; dpr = Math.min(2, devicePixelRatio || 1);
    if (!W || !H) return false;
    const bw = BOX.x1 - BOX.x0, bh = BOX.y1 - BOX.y0, pad = 14;
    view.s = Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh);
    view.ox = (W - bw * view.s) / 2 - BOX.x0 * view.s;
    view.oy = (H - bh * view.s) / 2 - BOX.y0 * view.s;
    return true;
  };
  /* the map rasterised: land (grey = heat), the heat's spread and the coast halo — the blurs at a third of the
     size, being soft (a filter on every country's fill would blur 240 times) */
  function layers() {
    const w = Math.round(W), h = Math.round(H), s = view.s;
    const flat = document.createElement('canvas'); flat.width = w; flat.height = h;
    const fg = flat.getContext('2d', { willReadFrequently: true });
    fg.setTransform(s, 0, 0, s, view.ox, view.oy);
    for (const { id, p } of paths()) {
      const v = Math.round(12 + 243 * (heatOf.get(id) || 0));
      fg.fillStyle = `rgb(${v},${v},${v})`; fg.fill(p);
    }
    const ws = Math.ceil(w / Q), hs = Math.ceil(h / Q);
    const blurred = px => {
      const c = document.createElement('canvas'); c.width = ws; c.height = hs;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.filter = `blur(${px / Q}px)`; g.drawImage(flat, 0, 0, ws, hs);
      return g.getImageData(0, 0, ws, hs).data;
    };
    return { w, h, ws, hs, land: fg.getImageData(0, 0, w, h).data, heat: blurred(10 * Math.sqrt(s / 0.88)), halo: blurred(5) };
  }
  /* the dots: the card's own ink made a true grey (white on the dark looks, near-black on paper), in a few
     shades of it — each shade one path, filled once, not a fill per dot */
  const ink = () => {
    const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(getComputedStyle(card).color || '');
    const v = m ? Math.round(0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) : 245;
    return `rgb(${v},${v},${v})`;
  };
  function draw() {
    clearTimeout(idle);
    if (!cv.isConnected || (!W && !fit())) return;
    const L = layers(), { w, h } = L;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = view.s, ax = view.ox, ay = view.oy;
    const land = Array.from({ length: LAND }, () => new Path2D()), sea = Array.from({ length: SEA }, () => new Path2D());
    const x0 = ((ax % S) + S) % S, y0 = ((ay % S) + S) % S;
    for (let y = y0; y < h; y += S) {
      const row = Math.min(h - 1, Math.round(y)) * w, rowS = Math.min(L.hs - 1, Math.round(y / Q)) * L.ws, gy = Math.round((y - ay) / S);
      for (let x = x0; x < w; x += S) {
        const k = (row + Math.min(w - 1, Math.round(x))) * 4, ks = (rowS + Math.min(L.ws - 1, Math.round(x / Q))) * 4;
        const halo = L.halo[ks + 3] / 255;
        if (L.land[k + 3] <= 120) {
          /* the sea: a faint grid, a little brighter where it meets a coast */
          const glow = Math.pow(halo, 0.8);
          if (glow < 0.04 && ((Math.round((x - ax) / S) + gy) & 1)) continue;
          const r = 0.45 + glow * 0.55;
          sea[Math.min(SEA - 1, Math.round(glow * (SEA - 1)))].rect(x - r, y - r, r * 2, r * 2);
          continue;
        }
        const hv = L.heat[ks + 3] ? L.heat[ks] / 255 : L.land[k] / 255;
        const heat = Math.max(0, (hv - 0.045) / 0.955);
        /* relief belongs to the land, so it is read in the map's own units */
        const mx = (x - ax) / s * 2, my = (y - ay) / s * 2;
        const e = elev(mx, my), lit = elev(mx - 1.2, my - 1.2) - elev(mx + 1.2, my + 1.2);
        const coast = 1 - Math.min(1, Math.abs(halo - 0.55) / 0.45);
        const v = Math.min(1, Math.max(0.08, 0.24 + heat * 0.68 + (e - 0.5) * 0.22 + coast * 0.22 + lit * 1.1));
        const r = 0.5 + 0.45 * e + heat * 0.5 + coast * 0.12;
        const p = land[Math.min(LAND - 1, Math.round(v * (LAND - 1)))];
        p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    g.fillStyle = ink();
    sea.forEach((p, i) => { g.globalAlpha = 0.1 + 0.4 * i / (SEA - 1); g.fill(p); });
    land.forEach((p, i) => { g.globalAlpha = Math.max(0.06, i / (LAND - 1)); g.fill(p); });
    g.globalAlpha = 1;
    drawn = { ...view };
    show();
  }
  /* the markers where the map is; while a resize settles, what is drawn is scaled to fit until it is drawn again */
  function show() {
    if (drawn) {
      const r = view.s / drawn.s, tx = view.ox - drawn.ox * r, ty = view.oy - drawn.oy * r;
      cv.style.transform = Math.abs(r - 1) < 1e-6 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01 ? '' : `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${r.toFixed(5)})`;
    }
    for (const o of pins) o.el.style.transform = `translate(${(o.x * view.s + view.ox).toFixed(1)}px,${(o.y * view.s + view.oy).toFixed(1)}px)`;
    room();
  }

  /* a click on the map itself puts the open place away */
  body.addEventListener('click', e => { if (!e.target.closest('.nm-pop, .nm-mk')) closePop(); });

  const ro = new ResizeObserver(() => {
    if (!card.isConnected) { ro.disconnect(); return; }
    if (!fit()) return;
    if (!drawn) return draw();
    show(); clearTimeout(idle); idle = setTimeout(draw, 120);
  });
  ro.observe(body);
  /* open again what was open before the page redrew, without the entrance */
  const again = openKey && pins.find(p => p.o.region.key === openKey);
  if (again) openPop(again.o, { instant: true }); else openKey = null;
  /* for the suites: what is drawn and where */
  card.__map = { view, counts, ranked, draw, drawn: () => drawn, box: BOX,
    pins: () => pins.map(o => ({ t: o.el.style.transform, key: o.o.region.key })) };
  return card;
}
