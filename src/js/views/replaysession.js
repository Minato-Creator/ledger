/* ============================================================
   replaysession.js — inside a Replay session.

   Full screen, over the whole app (no sidebar), until Exit. The page around
   the charts is Quire's; the charts are TradingView's (chart/core.js, the
   drawing tools down the left).

   The replay's moment, `T`, is the time of the last one-minute candle that
   exists. Every chart shows its timeframe's candles up to and including
   the one T is in — that one only as far as T (it is still forming). The
   1m prices come from the vault (replaydata.js), a month before the period
   so the charts open with context.

   Moving: play / pause at a speed (candles a second, of the chart you are
   on), one candle forward, one candle back, Jump to a time, the next
   Playbook session's open or the next day. At the end of the period it
   stops and says so, with the way to the session's analytics.

   Layouts of 1, 2, 3 or 4 charts on the same moment, each its own
   timeframe; the one last pressed is the one the top bar and the drawing
   tools work on. Full screen hides the top bar, the tools and the panel;
   the replay bar, the favourites and a timeframe bar stay and can be moved.
   ============================================================ */
import { el, toast } from '../ui.js';
import * as cd from '../candles.js';
import * as rd from '../replaydata.js';
import * as rs from '../replaysessions.js';
import { pairName } from '../replaysessions.js';
import { createCore, CHART_TFS, svgIcon } from '../chart/core.js';
import { createDrawings } from '../chart/drawings.js';
import { createTrading } from './replaytrading.js';
import { paintSessions, paintSessionNames, newsFor, paintNews } from '../chart/overlays.js';
import { rsiFor } from '../chart/rsi.js';
import { TV_FONT } from '../chart/core.js';
import * as rt from '../replaytrades.js';
import { openMenu, closeMenus } from '../chart/menu.js';

export const RS_SPEEDS = [['0.5×', 2000], ['1×', 1000], ['2×', 500], ['3×', 333], ['5×', 200], ['10×', 100]];
const LOOKBACK = 31 * 86400;
const BAR_KEY = 'quire:rsBar', TFBAR_KEY = 'quire:rsTfBar', PANEL_KEY = 'quire:rsPanel', SPEED_KEY = 'quire:rsSpeed';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = n => String(n).padStart(2, '0');
export const whenText = T => { const d = new Date(T * 1000); return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const remember = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* fine */ } };
const recall = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const ICON = {
  back: 'M6 5v14M18 6l-9 6 9 6z', fwd: 'M18 5v14M6 6l9 6-9 6z', play: 'M8 5.5l11 6.5-11 6.5z', pause: 'M8 5.5v13M16 5.5v13',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', unfull: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  gear: 'M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM12 3l1.6 2.3 2.7-.6.6 2.7L19.2 9 18.5 12l.7 3-2.3 1.6-.6 2.7-2.7-.6L12 21l-1.6-2.3-2.7.6-.6-2.7L4.8 15l.7-3-.7-3 2.3-1.6.6-2.7 2.7.6z',
  layout: 'M4 5h16v14H4zM12 5v14', grip: 'M9.5 6h.01M14.5 6h.01M9.5 12h.01M14.5 12h.01M9.5 18h.01M14.5 18h.01',
};

/* ---------- the prices, and the candles up to a moment ---------- */
export function makeFeed(rows) {
  const full = new Map();
  const rowIdx = T => {                   // the last 1m candle at or before T (−1 if none)
    let lo = 0, hi = rows.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m][0] <= T) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  };
  const barsOf = tf => { let b = full.get(tf); if (!b) { b = cd.aggregate(rows, tf); full.set(tf, b); } return b; };
  const barIdx = (tf, T) => {
    const b = barsOf(tf);
    let lo = 0, hi = b.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (b[m][0] <= T) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  };
  /** The time of the last 1m candle inside bar k. */
  const lastRowIn = (tf, k) => {
    const b = barsOf(tf);
    const end = k + 1 < b.length ? b[k + 1][0] : Infinity;
    const i = rowIdx(end - 1);
    return i >= 0 ? rows[i][0] : null;
  };
  /** Bar k as it was at T: built from its 1m candles up to T. */
  const partial = (tf, k, T) => {
    const b = barsOf(tf)[k];
    let i = rowIdx(b[0] - 1) + 1;
    const z = rowIdx(T);
    if (i > z) return b;
    let h = -Infinity, l = Infinity;
    const o = rows[i][1];
    for (; i <= z; i++) { if (rows[i][2] > h) h = rows[i][2]; if (rows[i][3] < l) l = rows[i][3]; }
    return [b[0], o, h, l, rows[z][4]];
  };
  return { rows, rowIdx, barsOf, barIdx, lastRowIn, partial };
}

/* ---------- the session, opened ---------- */
let open = null;
/** Called by the Replay view on every render: opens the session the address names, closes it otherwise. */
export function syncSession(store, nav) {
  const m = (location.hash || '').match(/^#\/replay\/session\/([^/]+)/);
  if (!m) { open?.close(false); return; }
  if (open?.sid === m[1]) return;
  open?.close(false);
  open = openSession(store, nav, m[1]);
}
window.addEventListener('hashchange', () => { if (open && !(location.hash || '').startsWith('#/replay/session/' + open.sid)) open.close(false); });

function openSession(store, nav, sid) {
  const s = rs.sessionById(store, sid);
  const root = el('div', { class: 'rs', role: 'dialog', 'aria-label': 'Replay session' });
  document.body.append(root);
  document.documentElement.classList.add('rs-open');
  let closed = false, cleanup = () => {};
  const handle = { sid, close: async keep => {
    if (closed) return;
    closed = true;
    cleanup();
    root.remove();
    document.documentElement.classList.remove('rs-open');
    if (open === handle) open = null;
    if (keep !== false && location.hash.startsWith('#/replay/session/')) nav.go('#/replay');
  } };
  const exitBtn = () => el('button', { class: 'btn btn-quiet rs-exit', onClick: () => handle.close(true) }, 'Exit');
  if (!s) {
    root.append(el('div', { class: 'rs-msg' }, el('span', {}, 'This session is not there any more.'), exitBtn()));
    return handle;
  }
  root.append(el('div', { class: 'rs-msg' }, el('span', {}, `Opening ${pairName(s.inst)}…`)));
  rd.candlesBetween(s.inst, s.from - LOOKBACK, s.to + 60).then(rows => {
    if (closed) return;
    const inPeriod = rows.filter(r => r[0] >= s.from && r[0] <= s.to);
    if (!inPeriod.length) {
      root.replaceChildren(el('div', { class: 'rs-msg' },
        el('span', {}, `No ${pairName(s.inst)} prices saved for this period. Download them on Replay → Data.`),
        el('button', { class: 'btn btn-quiet', onClick: () => { handle.close(false); nav.go('#/replay/data'); } }, 'Open Data'), exitBtn()));
      return;
    }
    cleanup = build(store, nav, s, makeFeed(rows), root, handle);
  }).catch(e => {
    if (closed) return;
    root.replaceChildren(el('div', { class: 'rs-msg' }, el('span', {}, 'Could not read the prices: ' + (e.message || e)), exitBtn()));
  });
  return handle;
}

function build(store, nav, s, feed, root, handle) {
  const dp = cd.decimalsOf(s.inst);
  const first = feed.rows[feed.rowIdx(s.from - 1) + 1]?.[0] ?? s.from;
  const lastInPeriod = feed.rows[feed.rowIdx(s.to)]?.[0] ?? s.to;
  /* the moment: never before the first candle of the period, never after its last */
  let T = Math.min(Math.max(feed.rows[feed.rowIdx(s.at)]?.[0] ?? first, first), lastInPeriod);
  let playing = false, timer = null, speed = Math.max(0, RS_SPEEDS.findIndex(([k]) => k === recall(SPEED_KEY, '1×')));
  let active = 0, bare = false, saveTimer = null, finishedShown = false;
  const charts = [];
  const group = s.groupId ? rs.groupsOf(store).find(g => g.id === s.groupId) : null;

  /* ---------- the frame ---------- */
  const tfSeg = el('div', { class: 'rs-tfs' });
  const layoutBtn = el('button', { class: 'rs-tb rs-layout', title: 'Layout', onClick: e => layoutMenu(e.currentTarget) }, svgIcon(ICON.layout, 18), el('span', {}, 'Layout'));
  /* indicators: Sessions, News (red folders) and the RSI — kept with the session */
  if (!s.ind || typeof s.ind !== 'object') s.ind = { sessions: true, news: true, rsi: false };
  const pbSessions = store.playbook?.sessions || [];
  const news = newsFor(store, s.inst, s.from - LOOKBACK, s.to + 60);
  const indBtn = el('button', { class: 'rs-tb rs-ind', title: 'Indicators', onClick: e => indMenu(e.currentTarget) }, svgIcon('M4 19l5-7 4 3 7-10', 18), el('span', {}, 'Indicators'));
  function indMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const item = (k, label) => ({ label, checked: !!s.ind[k], cls: 'rs-ind-' + k, act: () => setInd(k, !s.ind[k]) });
    openMenu([{ head: 'Indicators' }, item('rsi', 'Relative Strength Index'), item('sessions', 'Sessions'), item('news', 'News · red folders')], r.left, r.bottom + 4);
  }
  function setInd(k, on) { s.ind = { ...s.ind, [k]: on }; queueSave(); redrawAll(); }
  const stat = (k, cls) => el('div', { class: 'rs-stat ' + cls }, el('span', {}, k), el('b', {}));
  const stBal = stat('Balance', 'rs-bal'), stPnl = stat('Open P&L', 'rs-pnl'), stRisk = stat('Risk', 'rs-risk');
  const fullBtn = el('button', { class: 'rs-tb rs-full', title: 'Full screen (Esc to leave)', onClick: () => setBare(!bare) }, svgIcon(ICON.full, 18));
  const gearBtn = el('button', { class: 'rs-tb rs-gear', title: 'Chart settings', onClick: () => charts[active]?.core.openSettings() }, svgIcon(ICON.gear, 18));
  const top = el('header', { class: 'rs-top' },
    el('div', { class: 'rs-name' }, el('b', {}, s.name), el('span', {}, group ? group.name : 'Replay session')),
    el('span', { class: 'rs-pair' }, el('i'), pairName(s.inst)),
    tfSeg, layoutBtn, indBtn, el('div', { class: 'spacer' }), stBal, stPnl, stRisk, fullBtn, gearBtn,
    el('button', { class: 'btn btn-light rs-exit', onClick: () => handle.close(true) }, 'Exit'));
  const left = el('div', { class: 'rs-left' });
  const grid = el('div', { class: 'rs-grid' });
  const stage = el('div', { class: 'rs-stage' }, grid);
  const panel = el('div', { class: 'rs-panel' });
  const body = el('div', { class: 'rs-body' }, left, el('div', { class: 'rs-main' }, stage, panel));
  root.replaceChildren(top, body);

  /* ---------- trading ---------- */
  /* a pair with no dollar in it is counted in dollars through its quote
     currency's own prices, when they are saved */
  const [base, quote] = s.inst.split('_');
  let conv = null;
  if (quote !== 'USD' && base !== 'USD') {
    const direct = `${quote}_USD`, inverse = `USD_${quote}`;
    rd.candlesBetween(direct, s.from - LOOKBACK, s.to + 60).then(r => r.length ? { rows: r, inv: false } : rd.candlesBetween(inverse, s.from - LOOKBACK, s.to + 60).then(q => q.length ? { rows: q, inv: true } : null))
      .then(x => { conv = x ? { feed: makeFeed(x.rows), inv: x.inv } : null; if (!conv) toast(`Amounts are in ${quote} — download ${quote}USD to see them in dollars`); })
      .catch(() => {});
  }
  const rateAt = T => { if (!conv) return null; const i = conv.feed.rowIdx(T); if (i < 0) return null; const c = conv.feed.rows[i][4]; return conv.inv ? 1 / c : c; };
  const redrawAll = () => { for (const c of charts) c.core.draw(); };
  const trading = createTrading({ s, inst: s.inst, dp, feed, T: () => T, rate: rateAt, root, stage,
    save: () => saveNow(), changed: () => { paintTop(); paintPanel(); redrawAll(); }, redrawAll });

  /* ---------- the charts ---------- */
  function makeChart(slot, tf) {
    const pane = el('div', { class: 'rs-pane', 'data-slot': slot });
    const plot = el('div', { class: 'tc-plot rs-plot' });
    pane.append(plot);
    const c = { slot, tf, pane, plot, shown: null, k: -1 };
    c.shown = feed.barsOf(tf).slice();
    c.core = createCore(plot, {
      store, inst: s.inst, dp, symbol: pairName(s.inst), source: 'OANDA', bars: c.shown, tf, trading: true,
      hooks: {
        limit: () => c.k,
        tags: () => (c.dr ? [...c.dr.tags(), ...c.tr.tags()] : []),
        back: (g, G, C) => { if (s.ind.sessions) paintSessions(g, G, C, pbSessions, c.tf); },
        front: (g, G, C) => {
          const font = px => `400 ${px}px ${C.font || TV_FONT}`;
          if (s.ind.sessions) paintSessionNames(g, G, C, pbSessions, c.tf, font);
          c.groups = s.ind.news ? paintNews(g, G, C, news, font) : [];
          c.dr.paint(g, G, C); c.tr.paint(g, G, C);
        },
        panes: () => (s.ind.rsi && c.rsi ? [c.rsi] : []),
        claim: (x, y, G, e) => c.tr.claim(x, y, G, e) || c.dr.claim(x, y, G, e),
        hover: (x, y, G, e) => c.tr.hover(x, y, G, e) || c.dr.hover(x, y, G, e), dbl: (x, y) => c.dr.dbl(x, y), leave: () => c.dr.leave(),
        menu: ctx => [...c.tr.menu(ctx), ...c.dr.menu(ctx)],
        onInterval: m => setTf(c, m),
        onReset: () => { show(c, true); },
      },
    });
    c.dr = createDrawings(c.core, plot, { store, dkey: rs.drawKey(s.id), inst: s.inst, dp, tf: () => c.tf, rows: () => feed.rows,
      replayT: () => T + 59, account: () => ({ balance: s.balance, risk: s.riskMode === '%' ? s.risk : (s.risk / s.balance * 100) }) });
    c.tr = trading.forChart(c);
    c.rsi = rsiFor(store, c.core, { tf: () => c.tf, plot, remove: () => setInd('rsi', false) });
    c.core.setAuto(true);
    pane.addEventListener('pointerdown', () => setActive(slot), true);
    return c;
  }
  /** Bring chart c's candles to the moment; keep the newest in view if it was. */
  function sync(c) {
    const b = feed.barsOf(c.tf);
    const k = feed.barIdx(c.tf, T);
    const G = c.core.geom();
    const wasInView = c.k < 0 || G.xI(c.k) <= G.pw + G.spacing;
    if (c.k >= 0 && c.k !== k && c.k < b.length) c.shown[c.k] = b[c.k];
    c.k = k;
    if (k >= 0) c.shown[k] = feed.partial(c.tf, k, T);
    const G2 = c.core.geom();
    if (wasInView && k >= 0 && G2.xI(k) > G2.pw - G2.spacing * 2) c.core.toLatest();
    c.core.draw();
  }
  /** Place the view on the moment: about 120 candles, the newest near the right. */
  function show(c, fit) {
    c.core.setView(c.k + 11 - 120, 120);
    if (fit) c.core.setAuto(true);
    c.core.draw();
  }
  function setTf(c, m) {
    if (m === c.tf) return;
    c.tf = m;
    c.shown = feed.barsOf(m).slice();
    c.k = -1;
    c.core.setBars(c.shown, m);
    sync(c);
    const G = c.core.geom();
    if (c.k < 0 || G.xI(c.k) < 0 || G.xI(c.k) > G.pw) show(c, false);
    s.tfs[c.slot] = m;
    queueSave();
    paintTop();
  }
  function setActive(i) {
    if (active === i) return;
    active = i;
    for (const c of charts) c.pane.classList.toggle('is-active', c.slot === active && charts.length > 1);
    left.replaceChildren(charts[active].dr.bar);
    paintTop();
  }
  function setLayout(n) {
    while (charts.length > n) { const c = charts.pop(); c.pane.remove(); }
    while (charts.length < n) {
      const c = makeChart(charts.length, s.tfs[charts.length] || 5);
      charts.push(c);
      grid.append(c.pane);
      sync(c);
      requestAnimationFrame(() => show(c, true));
    }
    grid.dataset.n = n;
    if (active >= n) active = 0;
    for (const c of charts) c.pane.classList.toggle('is-active', c.slot === active && n > 1);
    left.replaceChildren(charts[active].dr.bar);
    if (s.layout !== n) { s.layout = n; queueSave(); }
    paintTop();
  }
  function layoutMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    openMenu([{ head: 'Layout' }, ...[[1, '1 chart'], [2, '2 charts'], [3, '3 charts'], [4, '4 charts']].map(([n, label]) =>
      ({ label, checked: charts.length === n, cls: 'rs-l' + n, act: () => setLayout(n) }))], r.left, r.bottom + 4);
  }

  /* ---------- moving through time ---------- */
  const tfNow = () => charts[active]?.tf || 5;
  function moveTo(next, why) {
    next = Math.min(Math.max(next, first), lastInPeriod);
    if (next === T && why !== 'force') return false;
    /* forward only once every open trade has its stop; fills on the way */
    if (next > T) { if (trading.blocked()) return false; trading.advance(T, next); }
    T = next;
    queuePanel();
    for (const c of charts) sync(c);
    const w = bar.querySelector('.rs-when'); if (w) w.textContent = whenText(T);
    queueSave();
    if (T >= lastInPeriod) finish();
    return true;
  }
  function stepForward() {
    const tf = tfNow(), k = feed.barIdx(tf, T);
    const endK = feed.lastRowIn(tf, k);
    if (endK != null && T < endK) return moveTo(endK);
    const nk = feed.lastRowIn(tf, k + 1);
    return nk == null ? (finish(), false) : moveTo(nk);
  }
  function stepBack() {
    const tf = tfNow(), k = feed.barIdx(tf, T);
    if (k <= 0) return false;
    const pk = feed.lastRowIn(tf, k - 1);
    if (pk == null) return false;
    trading.beforeBack(pk, () => moveTo(pk));
    return true;
  }
  function setPlaying(on) {
    if (on && T >= lastInPeriod) { finish(); return; }
    if (on && trading.blocked()) return;
    playing = on;
    clearInterval(timer); timer = null;
    if (on) timer = setInterval(() => { if (!root.isConnected) { clearInterval(timer); return; } if (!stepForward()) setPlaying(false); }, RS_SPEEDS[speed][1]);
    else saveNow();
    paintBar();
  }
  function setSpeed(i) { speed = i; remember(SPEED_KEY, RS_SPEEDS[i][0]); if (playing) setPlaying(true); paintBar(); }
  function finish() {
    if (playing) { playing = false; clearInterval(timer); timer = null; }
    paintBar();
    if (!s.finished) { s.finished = true; saveNow(); }
    if (finishedShown) return;
    finishedShown = true;
    const box = el('div', { class: 'rs-modal-wrap' }, el('div', { class: 'card rs-modal rs-finished' },
      el('h2', {}, 'Session finished'),
      el('p', {}, `${s.name} has reached the end of its period — ${whenText(lastInPeriod)}.`),
      el('div', { class: 'rs-modal-row' },
        el('button', { class: 'btn btn-quiet rs-stay', onClick: () => box.remove() }, 'Stay here'),
        el('button', { class: 'btn btn-light rs-to-analytics', onClick: () => { box.remove(); handle.close(false); nav.go('#/replay/analytics/' + s.id); } }, 'Go to analytics'))));
    root.append(box);
  }
  function jumpMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const pbs = store.playbook?.sessions || [];
    const opens = [...new Set(pbs.map(x => x.name))].map(name => {
      const n = rs.nextSessionOpen(pbs, T, [name]);
      return n && { label: `Next ${name} open`, hint: whenText(n.t).split(' · ')[1], cls: 'rs-j-session', act: () => jumpTo(n.t - 60) };
    }).filter(Boolean);
    openMenu([{ head: 'Jump to' },
      { label: 'Date and time…', cls: 'rs-j-date', act: () => askDate() },
      ...opens,
      { label: 'Next day', hint: '17:00 New York', cls: 'rs-j-day', act: () => jumpTo(rs.nextDay(T) - 60) }], r.left, r.top - 8 - 40 * (opens.length + 3));
  }
  function jumpTo(t) {
    const i = feed.rowIdx(t);
    if (i < 0) return;
    setPlaying(false);
    const go = () => { moveTo(feed.rows[i][0]); for (const c of charts) { const G = c.core.geom(); if (G.xI(c.k) > G.pw || G.xI(c.k) < 0) show(c, false); } };
    if (feed.rows[i][0] < T) trading.beforeBack(feed.rows[i][0], go); else go();
  }
  function askDate() {
    const input = el('input', { type: 'datetime-local', class: 'field rs-date-in', value: localInput(T), min: localInput(first), max: localInput(lastInPeriod) });
    const box = el('div', { class: 'rs-modal-wrap' }, el('div', { class: 'card rs-modal' },
      el('h2', {}, 'Jump to'), el('p', {}, `Anywhere from ${whenText(first)} to ${whenText(lastInPeriod)}.`), input,
      el('div', { class: 'rs-modal-row' },
        el('button', { class: 'btn btn-quiet', onClick: () => box.remove() }, 'Cancel'),
        el('button', { class: 'btn btn-light rs-date-go', onClick: () => { const v = fromLocal(input.value); if (Number.isFinite(v)) { box.remove(); jumpTo(v); } } }, 'Go'))));
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') box.remove(); if (e.key === 'Enter') box.querySelector('.rs-date-go').click(); });
    root.append(box);
    input.focus();
  }

  /* ---------- the floating replay bar ---------- */
  const bar = el('div', { class: 'rs-bar' });
  stage.append(bar);
  function paintBar() {
    const sp = RS_SPEEDS[speed][0];
    bar.replaceChildren(
      grip(bar, BAR_KEY),
      el('button', { class: 'rs-rb rs-back', title: 'One candle back (←)', onClick: () => { setPlaying(false); stepBack(); } }, svgIcon(ICON.back, 16)),
      el('button', { class: 'rs-rb rs-pp' + (playing ? ' is-playing' : ''), title: playing ? 'Pause (space)' : 'Play (space)', onClick: () => setPlaying(!playing) }, svgIcon(playing ? ICON.pause : ICON.play, 16)),
      el('button', { class: 'rs-rb rs-fwd', title: 'One candle forward (→)', onClick: () => { setPlaying(false); stepForward(); } }, svgIcon(ICON.fwd, 16)),
      el('span', { class: 'rs-sep' }),
      el('button', { class: 'rs-rt rs-speed', title: 'Speed — candles a second', onClick: e => {
        const r = e.currentTarget.getBoundingClientRect();
        openMenu([{ head: 'Candles a second' }, ...RS_SPEEDS.map(([k], i) => ({ label: k, checked: i === speed, act: () => setSpeed(i) }))], r.left, r.top - 8 - 36 * (RS_SPEEDS.length + 1));
      } }, sp),
      el('button', { class: 'rs-rt rs-jump', onClick: e => jumpMenu(e.currentTarget) }, 'Jump to', el('i', { class: 'rs-caret' })),
      el('span', { class: 'rs-sep' }),
      el('span', { class: 'rs-when' }, whenText(T)));
    place(bar, recall(BAR_KEY, { x: 0.5, y: 0.86 }), true);
  }
  /* a grip that moves its bar over the charts; where it ends up is kept on this computer */
  function grip(box, key) {
    const g = el('span', { class: 'tv-grip', title: 'Drag to move' }, svgIcon(ICON.grip, 16));
    g.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const r = stage.getBoundingClientRect(), b = box.getBoundingClientRect();
      const dx = e.clientX - b.left, dy = e.clientY - b.top;
      g.setPointerCapture(e.pointerId);
      const move = ev => {
        const x = Math.max(0, Math.min(r.width - b.width, ev.clientX - r.left - dx)), y = Math.max(0, Math.min(r.height - b.height, ev.clientY - r.top - dy));
        box.style.left = x + 'px'; box.style.top = y + 'px'; box.style.transform = 'none';
        remember(key, { x: (x + b.width / 2) / Math.max(1, r.width), y: y / Math.max(1, r.height) });
      };
      const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
    });
    return g;
  }
  function place(box, pos) {
    const W = stage.clientWidth, H = stage.clientHeight, bw = box.offsetWidth, bh = box.offsetHeight;
    box.style.transform = 'none';
    box.style.left = Math.max(0, Math.min(W - bw, pos.x * W - bw / 2)) + 'px';
    box.style.top = Math.max(0, Math.min(H - bh, pos.y * H)) + 'px';
  }

  /* ---------- the timeframe bar (full screen only) ---------- */
  const tfBar = el('div', { class: 'rs-tfbar', hidden: true });
  stage.append(tfBar);
  function paintTop() {
    const c = charts[active];
    const tfs = () => CHART_TFS.map(([label, m]) => el('button', { class: c && m === c.tf ? 'is-on' : '', 'data-tf': label, onClick: () => c && setTf(c, m) }, label));
    tfSeg.replaceChildren(...tfs());
    tfBar.replaceChildren(grip(tfBar, TFBAR_KEY), ...tfs(), el('span', { class: 'rs-sep' }),
      el('button', { class: 'rs-unbare', title: 'Leave full screen (Esc)', onClick: () => setBare(false) }, svgIcon(ICON.unfull, 16)));
    tfBar.hidden = !bare;
    if (bare) place(tfBar, recall(TFBAR_KEY, { x: 0.5, y: 0.02 }));
    const fmt = v => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    stBal.querySelector('b').textContent = fmt(rt.balanceOf(s));
    const op = trading.openPnl();
    stPnl.querySelector('b').textContent = `${op > 0 ? '+' : op < 0 ? '−' : ''}${fmt(Math.abs(op))}`;
    stPnl.classList.toggle('is-up', op > 0); stPnl.classList.toggle('is-down', op < 0);
    stRisk.querySelector('b').textContent = s.riskMode === '$' ? fmt(s.risk) : `${s.risk}%`;
    fullBtn.replaceChildren(svgIcon(bare ? ICON.unfull : ICON.full, 18));
  }
  function setBare(on) {
    bare = on;
    root.classList.toggle('is-bare', on);
    paintTop();
    requestAnimationFrame(() => { paintBar(); for (const c of charts) c.core.draw(); });
  }

  /* ---------- the bottom panel ---------- */
  let tab = 'positions';
  let panelH = recall(PANEL_KEY, 180);
  const handleEl = el('div', { class: 'rs-handle', title: 'Drag to resize' }, el('i'));
  const panelBody = el('div', { class: 'rs-pbody' });
  const tabs = el('div', { class: 'rs-ptabs' });
  panel.append(handleEl, tabs, panelBody);
  function paintPanel() {
    const open = (s.trades || []).filter(x => !x.closed), done = (s.trades || []).filter(x => x.closed);
    tabs.replaceChildren(...[['positions', `Positions · ${open.length}`], ['history', `History · ${done.length}`], ['stats', 'Session stats']].map(([k, label]) =>
      el('button', { class: 'rs-ptab' + (k === tab ? ' is-on' : ''), 'data-tab': k, onClick: () => { tab = k; if (panelH < 60) setPanelH(180); paintPanel(); } }, label)));
    const st = rs.statsOf([s]);
    const wins = (s.trades || []).filter(x => x.closed && x.pnl > 0), losses = (s.trades || []).filter(x => x.closed && x.pnl < 0);
    const gw = wins.reduce((a, x) => a + x.pnl, 0), gl = -losses.reduce((a, x) => a + x.pnl, 0);
    const usd = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    panelBody.replaceChildren(
      tab === 'positions' ? trading.table('open') :
      tab === 'history' ? trading.table('closed') :
      el('div', { class: 'rs-pstats' }, ...[['Trades', String(st.trades)], ['Win rate', st.winRate == null ? '—' : `${Math.round(st.winRate * 100)}%`],
        ['Total', `${st.r >= 0 ? '+' : '−'}${Math.abs(st.r).toFixed(2)}R`], ['P&L', usd(st.usd)], ['Balance', usd(rt.balanceOf(s)).replace('+', '')],
        ['Profit factor', gl > 0 ? (gw / gl).toFixed(2) : wins.length ? '∞' : '—'], ['Average win', wins.length ? usd(gw / wins.length) : '—'],
        ['Period', `${whenText(s.from).split(' · ')[0]} – ${whenText(s.to).split(' · ')[0]}`]]
        .map(([k, v]) => el('div', {}, el('span', {}, k), el('b', {}, v)))));
    paintTop();
  }
  let panelTimer = null;
  function queuePanel() { if (panelTimer) return; panelTimer = setTimeout(() => { panelTimer = null; if (root.isConnected) paintPanel(); }, 250); }
  function setPanelH(h) {
    panelH = Math.max(0, Math.min(Math.round(body.clientHeight * 0.6), h));
    panel.style.height = (panelH + 40) + 'px';
    panel.classList.toggle('is-shut', panelH < 30);
    remember(PANEL_KEY, panelH);
    for (const c of charts) c.core.draw();
  }
  handleEl.addEventListener('pointerdown', e => {
    e.preventDefault();
    const y0 = e.clientY, h0 = panelH;
    handleEl.setPointerCapture(e.pointerId);
    const move = ev => setPanelH(h0 - (ev.clientY - y0));
    const up = () => { handleEl.removeEventListener('pointermove', move); handleEl.removeEventListener('pointerup', up); paintBar(); };
    handleEl.addEventListener('pointermove', move); handleEl.addEventListener('pointerup', up);
  });

  /* ---------- keys ---------- */
  const onKey = e => {
    if (!root.isConnected) return;
    if (e.target.closest?.('input, textarea, select') || document.querySelector('.tv-dialog, .rs-modal-wrap')) return;
    if (e.key === 'Escape') {
      if (charts.some(c => c.dr.key(e))) return;
      if (bare) { setBare(false); return; }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && charts[active]?.dr.key(e)) return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setPlaying(false); stepForward(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); stepBack(); }
  };
  document.addEventListener('keydown', onKey);

  /* ---------- keeping where you are ---------- */
  function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, playing ? 4000 : 600); }
  function saveNow() {
    clearTimeout(saveTimer); saveTimer = null;
    s.at = T;
    s.layout = charts.length || s.layout;
    rs.updateSession(store, s.id, {}).catch(e => toast('Could not save the session: ' + (e.message || e), 'bad'));
  }

  s.opened = new Date().toISOString();
  setLayout(s.layout || 1);
  setPanelH(panelH);
  paintPanel();
  paintBar();
  paintTop();
  saveNow();
  const ro = new ResizeObserver(() => { paintBar(); if (bare) place(tfBar, recall(TFBAR_KEY, { x: 0.5, y: 0.02 })); });
  ro.observe(stage);

  root.__session = {
    get T() { return T; }, get playing() { return playing; }, get speed() { return RS_SPEEDS[speed][0]; }, get charts() { return charts.map(c => ({ tf: c.tf, k: c.k, bars: c.shown.length, last: c.shown[c.k], groups: c.groups || [], rsi: c.rsi.values(), areas: c.core.areas() })); }, get ind() { return { ...s.ind }; },
    get active() { return active; }, trading, trades: () => structuredClone(s.trades || []), get bare() { return bare; }, get panel() { return panelH; }, feed, first, last: lastInPeriod,
    core: i => charts[i ?? active].core, dr: i => charts[i ?? active].dr,
    stepForward, stepBack, setPlaying, moveTo, jumpTo, setTf: (m, i) => setTf(charts[i ?? active], m), setLayout,
  };
  return () => {
    clearInterval(timer); ro.disconnect(); closeMenus();
    document.removeEventListener('keydown', onKey);
    s.at = T;
    rs.updateSession(store, s.id, {}).catch(() => {});
  };
}

/* datetime-local in this computer's time */
function localInput(T) { const d = new Date(T * 1000); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function fromLocal(v) { const t = Date.parse(v); return Number.isFinite(t) ? Math.floor(t / 60000) * 60 : NaN; }
