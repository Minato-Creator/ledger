/* ============================================================
   tradechart.js — the trade, on its week's chart.

   For looking only. The candles are OANDA's, which are never quite your
   broker's, so nothing here feeds a number anywhere else in the journal.

   The whole trading week is loaded — Sunday's open to Friday's close — so
   the 4H and daily candles show the week's structure, and every trade on the
   same instrument that week reads the same saved days.

   What is drawn, and nothing more: the candles; the killzones from the
   Playbook, shaded and named along the top; red-folder news for the
   instrument's currencies; the position as two boxes — entry to target,
   entry to stop — between the time you got in and the time you got out; a
   small dot where you got in and one where you got out; and the prices of
   all four on the right. Plus your own dotted lines (BOS, x, protected
   highs…), kept per instrument so a level marked on one gold trade is there
   on the next.

   Drag to move, scroll to zoom, double-click to go back to the trade.
   Replay starts just before the entry, with pause, step and speed.
   ============================================================ */
import { el, icon, toast } from '../ui.js';
import * as cd from '../candles.js';

export const CHART_TFS = [['1m', 1], ['3m', 3], ['5m', 5], ['15m', 15], ['30m', 30], ['1H', 60], ['4H', 240], ['D', 1440]];
export const SPEEDS = [['1×', 250], ['2×', 125], ['5×', 50], ['10×', 25]];
export const QUICK_LABELS = ['BOS', 'CHoCH', 'x', 'Protected high', 'Protected low', 'Liquidity'];
const TF_KEY = 'quire:chartTf', SPEED_KEY = 'quire:replaySpeed', FOLLOW_KEY = 'quire:replayFollow';
const SESS_KEY = 'quire:chartSessions', NEWS_KEY = 'quire:chartNews';
const DAY = 86400;
const FOOT = 'for viewing only · prices can differ slightly from your broker’s';

/* The plot's margins: names along the top, times along the bottom, prices
   down the right. */
const PAD_T = 24, PAD_B = 22, AXIS_W = 88;

const remember = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* fine */ } };
const recall = k => { try { return localStorage.getItem(k); } catch { return null; } };

export function tradeChart(store, nav, t, opts = {}) {
  const now = opts.now ?? Date.now() / 1000;
  const height = opts.height || 340;
  const inst = cd.oandaInstrument(t.pair);
  const card = el('section', { class: 'card tc' + (opts.wide ? ' is-wide' : ''), style: { flex: 'none' } });

  const sub = el('span', { class: 'tc-sub' }, inst ? 'OANDA · mid' : '');
  const title = el('h3', {}, t.pair || 'Chart', sub);
  const headOnly = () => el('div', { class: 'tc-head' }, title, el('div', { class: 'spacer' }));

  const message = (text, ...actions) => {
    card.classList.add('is-quiet');
    card.replaceChildren(headOnly(), el('div', { class: 'tc-msg' }, el('span', {}, text), ...actions));
  };

  async function start() {
    if (!inst) return message(`No chart for ${t.pair || 'this trade'} — OANDA has no instrument that matches it.`);
    const cred = await cd.getKey();
    if (!cred) return message('Add your OANDA key in Settings to see the chart here.',
      el('button', { class: 'tc-btn', onClick: () => nav.go('#/settings') }, 'Open Settings'));
    card.classList.remove('is-quiet');
    card.replaceChildren(headOnly(), el('div', { class: 'tc-plot is-loading', style: { height: height + 'px' } },
      el('span', {}, 'Getting the prices…')));
    let res;
    try { res = await cd.candlesFor(store, t, cred, now); }
    catch (e) {
      return message(cd.explain(e), el('button', { class: 'tc-btn', onClick: start }, 'Try again'));
    }
    if (!res.rows.length) return message('OANDA has no prices for this time — the market may have been closed.');
    card.classList.remove('is-quiet');
    chart(res);
  }

  /* ---------------- the chart itself ---------------- */
  function chart(res) {
    const dp = cd.decimalsOf(inst);
    const num = v => (v == null || v === '' ? NaN : Number(v));
    const entry = num(t.entryPrice), sl = num(t.stopLoss), tp = num(t.takeProfit), exitP = num(t.exitPrice);
    const closed = t.status !== 'open';
    /* plain: a chart of the instrument alone (the Outlook), no trade on it */
    const plain = !!opts.plain;
    const timed = !!t.timeOpen && !plain;
    const eps = Math.abs(entry || 1) * 1e-6;
    const same = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;
    const hasExit = closed && Number.isFinite(exitP);
    const exitOwnTag = hasExit && !same(exitP, tp) && !same(exitP, sl) && !same(exitP, entry);

    const curs = cd.currenciesOf(inst);
    const newsFor = () => (store.data.news?.events || [])
      .filter(ev => ev.impact === 'High' && curs.includes(ev.country))
      .map(ev => ({ at: Date.parse(ev.at) / 1000, title: ev.title }))
      .filter(ev => Number.isFinite(ev.at) && ev.at >= res.rows[0][0] && ev.at <= res.rows[res.rows.length - 1][0] + 60);
    let news = newsFor();
    const sessions = store.playbook?.sessions || [];

    let tf = firstTf();
    let bars = cd.aggregate(res.rows, tf);
    const view = { start: 0, count: 60 };
    /* The price scale. On auto it fits the candles on screen, the way
       TradingView does; drag the price axis, or the chart up or down, and it
       stays where you put it until auto is switched back on. */
    const yr = { auto: false, lo: 0, hi: 1 };
    let hover = null, drag = null, raf = 0, over = false;
    /* replay: null, or where it has got to and whether it is moving */
    let replay = null, timer = null;
    let speed = Math.max(0, SPEEDS.findIndex(([k]) => k === recall(SPEED_KEY)));
    let follow = recall(FOLLOW_KEY) !== '0';
    /* drawing: off, armed, or a line being drawn; and the line picked */
    let drawMode = false, sketch = null, picked = null, hot = null;
    let lastGroups = [];
    let loadingMore = false, monthFailed = false;
    /* what is shown: the killzones and the news can each be switched off */
    let showSessions = recall(SESS_KEY) !== '0', showNews = recall(NEWS_KEY) !== '0';
    /* choosing where a replay starts, TradingView's way: a line follows the
       pointer and everything after it is dimmed; a click starts there */
    let picking = false, pickPrev = null;
    let full = false;

    /* where a moment sits, in bars — gaps (weekends) take no room */
    function idxAt(T) {
      const n = bars.length, step = tf * 60;
      if (!n) return 0;
      if (T <= bars[0][0]) return (T - bars[0][0]) / step;
      let lo = 0, hi = n - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m][0] <= T) lo = m; else hi = m - 1; }
      if (lo === n - 1) return lo + (T - bars[lo][0]) / step;
      return lo + Math.min(1, (T - bars[lo][0]) / step);
    }
    function timeAtIdx(i) {
      const n = bars.length, step = tf * 60;
      if (!n) return res.entry;
      if (i < 0) return bars[0][0] + i * step;
      if (i >= n) return bars[n - 1][0] + (i - n + 1) * step;
      const k = Math.floor(i);
      return bars[k][0] + (i - k) * step;
    }
    /* the highest high and lowest low on screen, with a little air */
    function candleRange() {
      const last = replay ? replay.upto : bars.length - 1;
      const i0 = Math.max(0, Math.floor(view.start)), i1 = Math.min(last, Math.ceil(view.start + view.count));
      let lo = Infinity, hi = -Infinity;
      for (let i = i0; i <= i1; i++) { if (bars[i][3] < lo) lo = bars[i][3]; if (bars[i][2] > hi) hi = bars[i][2]; }
      if (lo === Infinity) return null;
      return padded(lo, hi);
    }
    function padded(lo, hi) {
      if (hi - lo < 1e-9) { hi += Math.abs(hi) * 0.001 || 1; lo -= Math.abs(lo) * 0.001 || 1; }
      const p = (hi - lo) * 0.07;
      return { lo: lo - p, hi: hi + p };
    }
    /* Back to the trade: its time in the middle, and — on the small
       timeframes — the price scale opened up just enough to show the whole
       position, target and stop included. */
    /* The price scale is set when the chart is placed — here, on a new
       timeframe, or by the auto button — and then it holds still: moving
       through time never rescales it, so nothing on the chart jumps. */
    function fitY(withLevels) {
      const r = candleRange() || allRange();
      if (!r) return;
      yr.auto = false;
      const levels = withLevels && timed ? [entry, sl, tp, hasExit ? exitP : NaN].filter(Number.isFinite) : [];
      const u = levels.some(p => p < r.lo || p > r.hi) ? padded(Math.min(r.lo, ...levels), Math.max(r.hi, ...levels)) : r;
      yr.lo = u.lo; yr.hi = u.hi;
    }
    function allRange() {
      if (!bars.length) return null;
      let lo = Infinity, hi = -Infinity;
      for (const b of bars) { if (b[3] < lo) lo = b[3]; if (b[2] > hi) hi = b[2]; }
      return padded(lo, hi);
    }
    function fit() {
      if (tf >= 240) {
        view.count = Math.max(12, bars.length + 2); view.start = -1;
        clamp(); fitY(false); return;
      }
      /* a stretch of time to open on — the trade, or (opts.focus) any span,
         never past the last candle there is */
      const f0 = opts.focus?.from ?? res.entry, f1 = opts.focus?.to ?? (timed ? res.exit : res.entry + 3600);
      const a = idxAt(f0), z = Math.min(idxAt(f1), bars.length + 1);
      const span = Math.max(1, z - a), pad = opts.focus ? Math.max(span * 0.04, 4) : Math.max(span * 0.7, 24);
      view.count = Math.min(Math.max(span + pad * 2, 40), Math.max(40, bars.length + 10));
      view.start = (a + z) / 2 - view.count / 2;
      clamp();
      fitY(!plain);
    }
    function clamp() {
      const maxCount = Math.max(60, bars.length * 1.3);
      view.count = Math.min(Math.max(view.count, 8), maxCount);
      view.start = Math.min(Math.max(view.start, -view.count * 0.8), bars.length - view.count * 0.2);
    }
    function setTf(m) {
      if (m === tf) return;
      const mid = timeAtIdx(view.start + view.count / 2);
      const replayT = replay ? bars[replay.upto][0] : null;
      const secs = view.count * tf;
      tf = m; bars = cd.aggregate(res.rows, tf);
      view.count = secs / tf;
      view.start = idxAt(mid) - view.count / 2;
      if (replay) replay.upto = Math.max(0, Math.min(bars.length - 1, Math.floor(idxAt(replayT))));
      clamp();
      /* a new timeframe is placed once — then it sits still */
      if (!yr.auto) fitY(false);
      /* 4H and daily are for the structure: everything loaded, at once */
      if (tf >= 240 && !replay) fit();
      remember(TF_KEY, tf);
      paintHead(); draw();
    }
    /* More of the month arrived: the same moments stay where they were. */
    function extend(more) {
      if (!more.length) return;
      const tA = timeAtIdx(view.start), tZ = timeAtIdx(view.start + view.count);
      const replayT = replay ? bars[replay.upto][0] : null;
      const seen = new Set(res.rows.map(r => r[0]));
      res.rows = [...res.rows, ...more.filter(r => !seen.has(r[0]))].sort((a, b) => a[0] - b[0]);
      bars = cd.aggregate(res.rows, tf);
      view.start = idxAt(tA); view.count = Math.max(8, idxAt(tZ) - view.start);
      if (replay) replay.upto = Math.max(0, Math.min(bars.length - 1, Math.floor(idxAt(replayT))));
      news = newsFor();
      clamp();
      if (tf >= 240 && !replay) fit();
      draw();
    }

    /* ---------- the controls ---------- */
    const seg = el('div', { class: 'seg tc-seg' });
    const lineBtn = el('button', { class: 'tc-tool', title: 'Draw a dotted line', onClick: () => { setDraw(!drawMode); } },
      el('i', { class: 'tc-dash' }), 'Line');
    const replayBtn = el('button', { class: 'tc-play', onClick: () => { if (replay || picking) { cancelPick(true); endReplay(); draw(); } else startReplay(); } }, el('i'), 'Replay');
    const fullBtn = el('button', { class: 'tc-reset tc-full', title: 'Full screen (Esc to leave)', onClick: () => setFull(!full) },
      icon('expand', 12, 'currentColor', 1.9));
    const resetBtn = el('button', { class: 'tc-reset', title: 'Back to the trade', onClick: () => { cancelPick(true); endReplay(); fit(); paintHead(); draw(); } },
      icon('refresh', 13, 'currentColor', 1.9));
    /* Replay's controls sit under the chart while it runs, the way
       TradingView's bar does, so the header never has to make room. */
    const rbar = el('div', { class: 'tc-rbar', hidden: true });
    const rtop = el('div', { class: 'tc-rtop', hidden: true });
    function paintHead() {
      seg.replaceChildren(...CHART_TFS.map(([label, m]) =>
        el('button', { class: m === tf ? 'is-on' : '', 'data-tf': label, onClick: () => setTf(m) }, label)));
      lineBtn.classList.toggle('is-on', drawMode);
      replayBtn.classList.toggle('is-on', !!replay || picking);
      autoBtn.classList.toggle('is-on', yr.auto);
      sessBtn.classList.toggle('is-on', showSessions);
      newsBtn.classList.toggle('is-on', showNews);
      fullBtn.replaceChildren(icon(full ? 'close' : 'expand', full ? 11 : 12, 'currentColor', 1.9));
      fullBtn.title = full ? 'Leave full screen (Esc)' : 'Full screen';
      plot.classList.toggle('is-picking', picking);
      rbar.hidden = !replay && !picking;
      rtop.hidden = !replay;
      card.classList.toggle('is-replaying', !!replay);
      if (!replay) rtop.replaceChildren();
      if (picking) {
        rbar.replaceChildren(
          el('span', { class: 'tc-pickhint' }, 'Click on the chart where the replay should start'),
          el('div', { class: 'spacer' }),
          timed ? el('button', { class: 'tc-rend tc-entrypick', onClick: () => pickAt(beforeEntry()) }, 'Just before the entry') : null,
          el('button', { class: 'tc-rend tc-cancelpick', onClick: () => { cancelPick(); draw(); } }, 'Cancel'));
        return;
      }
      if (!replay) { rbar.replaceChildren(); return; }
      /* Up top, beside the timeframes: one candle back, pause, one candle
         forward, and the speed. Underneath, on the left: play and how the
         chart follows; on the right: when it is, choose again, and end. */
      const pp = cls => el('button', { class: 'tc-rb tc-pp ' + cls, title: replay.playing ? 'Pause (space)' : 'Play (space)', onClick: togglePlay },
        el('i', { class: replay.playing ? 'is-pause' : 'is-play' }));
      rtop.replaceChildren(
        el('div', { class: 'tc-steps' },
          el('button', { class: 'tc-rb tc-back', title: 'One candle back (←)', onClick: () => stepReplay(-1) }, icon('chevleft', 12, 'currentColor', 2.2)),
          pp('is-top'),
          el('button', { class: 'tc-rb tc-fwd', title: 'One candle forward (→)', onClick: () => stepReplay(1) }, icon('chevright', 12, 'currentColor', 2.2))),
        el('div', { class: 'tc-speeds' }, ...SPEEDS.map(([k], i) =>
          el('button', { class: i === speed ? 'is-on' : '', 'data-speed': k, onClick: () => setSpeed(i) }, k))));
      rbar.replaceChildren(
        el('button', { class: 'tc-rplay' + (replay.playing ? ' is-playing' : ''), onClick: togglePlay },
          el('i', { class: replay.playing ? 'is-pause' : 'is-play' }), replay.playing ? 'Pause' : 'Play'),
        el('div', { class: 'tc-speeds tc-follow' },
          el('button', { class: follow ? 'is-on' : '', 'data-follow': '1', title: 'The chart moves with the newest candle', onClick: () => setFollow(true) }, 'Follow price'),
          el('button', { class: follow ? '' : 'is-on', 'data-follow': '0', title: 'The chart stays where you put it', onClick: () => setFollow(false) }, 'Free view')),
        el('div', { class: 'spacer' }),
        el('span', { class: 'tc-rwhen' }, replayWhen()),
        el('button', { class: 'tc-rend tc-select', title: 'Choose another starting point', onClick: () => startReplay() }, 'Select bar'),
        el('button', { class: 'tc-rend tc-endr', onClick: () => { endReplay(); draw(); } }, 'End replay'));
    }
    const replayWhen = () => {
      if (!replay) return '';
      const d = new Date(bars[replay.upto][0] * 1000);
      return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${clock(d)}`;
    };

    const canvas = el('canvas', { class: 'tc-canvas' });
    const editor = el('div', { class: 'tc-edit', hidden: true });
    const autoBtn = el('button', { class: 'tc-auto' + (yr.auto ? ' is-on' : ''), title: 'Fit the price scale to the candles',
      onClick: () => { yr.auto = !yr.auto; paintHead(); draw(); } }, 'auto');
    const plot = el('div', { class: 'tc-plot', style: { height: height + 'px' } }, canvas, editor, autoBtn);
    const footL = el('span', { class: 'tc-read' }, FOOT);
    const sessBtn = el('button', { class: 'tc-tog' + (showSessions ? ' is-on' : ''), 'data-show': 'sessions',
      onClick: () => { showSessions = !showSessions; remember(SESS_KEY, showSessions ? '1' : '0'); paintHead(); draw(); } }, el('i'), 'Sessions');
    const newsBtn = el('button', { class: 'tc-tog' + (showNews ? ' is-on' : ''), 'data-show': 'news',
      onClick: () => { showNews = !showNews; remember(NEWS_KEY, showNews ? '1' : '0'); paintHead(); draw(); } }, el('i'), 'News');
    const footR = el('span', { class: 'tc-togs' }, sessBtn, newsBtn);
    card.replaceChildren(
      el('div', { class: 'tc-head' }, title, el('div', { class: 'spacer' }), seg, rtop, lineBtn, replayBtn, resetBtn, fullBtn),
      plot, rbar,
      el('div', { class: 'tc-foot' }, footL, footR));
    const hint = () => drawMode ? 'drag across to draw · Esc to stop'
      : picking ? 'click where the replay should start · Esc to cancel'
      : monthFailed ? 'the rest of the month could not be loaded' : FOOT;
    /* Full screen: the card takes the whole window, Esc gives it back. */
    /* The card is lifted out to the page itself while it is full screen, so
       nothing it sits in (a scrolling column, glass, an animation) can hold
       it back; a placeholder keeps its place for the way back. */
    let holder = null;
    function setFull(on) {
      if (on === full) return;
      full = on;
      if (on) {
        holder = document.createComment('chart');
        card.replaceWith(holder);
        document.body.append(card);
        window.addEventListener('hashchange', leaveOnNav);
      } else {
        window.removeEventListener('hashchange', leaveOnNav);
        if (holder?.isConnected) holder.replaceWith(card); else card.remove();
        holder = null;
      }
      card.classList.toggle('is-full', on);
      paintHead(); draw();
    }
    function leaveOnNav() { setFull(false); }
    const monthLabel = () => { const d = new Date((res.month.mid) * 1000); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
    const paintSub = () => { sub.textContent = `OANDA · mid · ${monthLabel()}${loadingMore ? ' · loading the month…' : ''}`; };

    /* ---------- replay ---------- */
    function startReplay() {
      endDraw();
      if (timer) clearInterval(timer);
      timer = null;
      pickPrev = replay; replay = null; picking = true;
      paintHead(); draw();
    }
    function beforeEntry() {
      const a = Math.floor(idxAt(timed ? res.entry : bars[0][0]));
      return a - Math.max(3, Math.round(view.count * 0.35));
    }
    /* the replay starts on this candle: it and everything before it shows */
    function pickAt(i) {
      const upto = Math.max(1, Math.min(bars.length - 1, Math.round(i)));
      picking = false; pickPrev = null;
      replay = { upto, playing: false };
      if (upto < view.start || upto > view.start + view.count) { view.start = upto - view.count * 0.65; clamp(); }
      paintHead(); draw();
    }
    function cancelPick(drop) {
      if (!picking) return;
      picking = false;
      replay = drop ? null : pickPrev; pickPrev = null;
      paintHead();
    }
    function run() {
      if (timer) clearInterval(timer);
      timer = replay?.playing ? setInterval(tick, SPEEDS[speed][1]) : null;
    }
    function tick() {
      if (!card.isConnected || !replay) { clearInterval(timer); timer = null; return; }
      if (replay.upto >= bars.length - 1) { replay.playing = false; run(); paintHead(); return; }
      replay.upto++;
      followNow(); paintWhen(); draw();
    }
    const paintWhen = () => { const w = rbar.querySelector('.tc-rwhen'); if (w) w.textContent = replayWhen(); };
    /* Follow price: the newest candle stays in view, sideways and — when
       the scale is not on auto — up and down. Free view leaves it to you. */
    function followNow() {
      if (!replay || !follow) return;
      if (replay.upto > view.start + view.count * 0.85) view.start = replay.upto - view.count * 0.85;
      if (replay.upto < view.start + view.count * 0.1) view.start = replay.upto - view.count * 0.5;
      clamp();
      if (!yr.auto) {
        const b = bars[replay.upto], m = (yr.hi - yr.lo) * 0.08;
        if (b[2] > yr.hi - m) { const d = b[2] - (yr.hi - m); yr.hi += d; yr.lo += d; }
        if (b[3] < yr.lo + m) { const d = (yr.lo + m) - b[3]; yr.hi -= d; yr.lo -= d; }
      }
    }
    function togglePlay() {
      if (!replay) return;
      if (!replay.playing && replay.upto >= bars.length - 1) return;
      replay.playing = !replay.playing; run(); paintHead();
    }
    function stepReplay(d) {
      if (!replay) return;
      replay.playing = false; run();
      replay.upto = Math.max(1, Math.min(bars.length - 1, replay.upto + d));
      followNow(); paintHead(); draw();
    }
    function setSpeed(i) { speed = i; remember(SPEED_KEY, SPEEDS[i][0]); run(); paintHead(); }
    function setFollow(on) {
      follow = on; remember(FOLLOW_KEY, on ? '1' : '0');
      if (on) followNow();
      paintHead(); draw();
    }
    function endReplay() {
      if (timer) clearInterval(timer);
      timer = null; replay = null; paintHead();
    }

    /* ---------- your lines ---------- */
    const lines = () => store.drawingsFor(inst);
    function setDraw(on) {
      drawMode = on; sketch = null;
      if (on) { closeEditor(); cancelPick(); if (replay && replay.playing) togglePlay(); }
      plot.classList.toggle('is-drawing', on);
      paintHead(); draw();
    }
    function endDraw() { if (drawMode) setDraw(false); }
    /* A line starts on the price you point at — or on the candle's high,
       low, open or close when you are within a few pixels of one. */
    function priceAt(x, y, G) {
      let p = G.hi - (y - PAD_T) / G.ph * (G.hi - G.lo);
      const i = Math.floor(view.start + x / G.bw);
      if (i >= 0 && i < bars.length) {
        let best = 8;
        for (const v of bars[i].slice(1)) { const d = Math.abs(G.Y(v) - y); if (d < best) { best = d; p = v; } }
      }
      return p;
    }
    function lineAt(x, y, G) {
      for (const L of lines()) {
        const xa = G.xT(L.t1), xz = G.xT(L.t2), ly = G.Y(L.p);
        if (x >= xa - 5 && x <= xz + 5 && Math.abs(y - ly) <= 5) return L;
      }
      return null;
    }
    async function saveLine(L) {
      try { await store.putDrawing(inst, L); } catch (e) { toast('Could not save the line: ' + (e.message || e), 'bad'); }
    }
    function openEditor(L) {
      picked = L.id;
      const G = geom();
      const x = Math.min(Math.max(8, (G.xT(L.t1) + G.xT(L.t2)) / 2 - 130), G.pw - 270);
      const y = G.Y(L.p) > PAD_T + 120 ? G.Y(L.p) - 96 : G.Y(L.p) + 14;
      const input = el('input', { class: 'tc-lab', value: L.label || '', placeholder: 'Label — BOS, x, protected high…', maxlength: 40,
        onKeydown: e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(input.value); }
          if (e.key === 'Escape') { e.preventDefault(); closeEditor(); }
          e.stopPropagation();
        } });
      const commit = async v => {
        const label = String(v || '').trim();
        const cur = lines().find(x => x.id === L.id);
        if (cur && cur.label !== label) await saveLine({ ...cur, label });
        closeEditor();
      };
      editor.replaceChildren(
        input,
        el('div', { class: 'tc-chips' }, ...QUICK_LABELS.map(q => el('button', { onClick: () => commit(q) }, q))),
        el('div', { class: 'tc-editrow' },
          el('button', { class: 'tc-del', onClick: async () => { await store.dropDrawing(inst, L.id); closeEditor(); } }, 'Delete line'),
          el('button', { class: 'tc-ok', onClick: () => commit(input.value) }, 'Done')));
      editor.style.left = x + 'px'; editor.style.top = Math.max(4, y) + 'px';
      editor.hidden = false;
      draw();
      setTimeout(() => input.focus(), 0);
    }
    function closeEditor() { editor.hidden = true; editor.replaceChildren(); picked = null; draw(); }

    /* ---------- the pointer, the way TradingView takes it ----------
       In the chart: drag to move through time and up and down.
       On the price scale: drag up or down to squeeze or stretch the prices.
       On the time scale: drag left or right to squeeze or stretch time.
       Wheel: zoom time around the pointer (prices, over the price scale).
       Double-click: the chart goes back to the trade; the price scale goes
       back to auto; the time scale goes back to the trade's time. */
    const zoneOf = (x, y, G) => (x >= G.pw && y < PAD_T + G.ph ? 'price' : y >= PAD_T + G.ph && x < G.pw ? 'time' : x < G.pw ? 'pane' : 'corner');
    const fixScale = G => { if (yr.auto) { yr.auto = false; yr.lo = G.lo; yr.hi = G.hi; paintHead(); } };
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const G = geom();
      const zone = zoneOf(x, y, G);
      if (drawMode && zone === 'pane' && y > PAD_T) {
        sketch = { p: priceAt(x, y, G), t1: timeAtIdx(view.start + x / G.bw), t2: null, x0: x };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (!editor.hidden) closeEditor();
      drag = { zone, x: e.clientX, y: e.clientY, start: view.start, count: view.count, lo: G.lo, hi: G.hi, ph: G.ph, pw: G.pw,
               moved: false, vertical: false, line: zone === 'pane' && !picking ? lineAt(x, y, G) : null };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      const G = geom();
      if (sketch) {
        sketch.t2 = timeAtIdx(view.start + Math.min(G.pw, Math.max(0, hover.x)) / G.bw);
      } else if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
        if (drag.moved) {
          plot.classList.add('is-dragging');
          if (drag.zone === 'pane') {
            view.start = drag.start - dx / (drag.pw / drag.count); clamp();
            if (Math.abs(dx) > 3 && replay && follow) setFollow(false);
            if (Math.abs(dy) > 6 || drag.vertical) {
              if (!drag.vertical) { drag.vertical = true; fixScale(G); drag.lo = yr.lo; drag.hi = yr.hi; drag.y = e.clientY; }
              const shift = (e.clientY - drag.y) / drag.ph * (drag.hi - drag.lo);
              yr.lo = drag.lo + shift; yr.hi = drag.hi + shift;
            }
          } else if (drag.zone === 'price') {
            fixScale(G);
            const k = Math.exp(dy * 0.006), mid = (drag.lo + drag.hi) / 2, half = (drag.hi - drag.lo) / 2 * k;
            yr.lo = mid - half; yr.hi = mid + half;
          } else if (drag.zone === 'time') {
            const right = drag.start + drag.count;
            view.count = drag.count * Math.exp(-dx * 0.006);
            clamp();
            view.start = right - view.count; clamp();
          }
        }
      } else {
        const zone = zoneOf(hover.x, hover.y, G);
        plot.classList.toggle('on-price', zone === 'price');
        plot.classList.toggle('on-time', zone === 'time');
        hot = drawMode || zone !== 'pane' ? null : lineAt(hover.x, hover.y, G)?.id || null;
        plot.classList.toggle('is-hot', !!hot);
      }
      draw();
    });
    const up = async e => {
      if (sketch) {
        const s = sketch; sketch = null;
        const r = canvas.getBoundingClientRect();
        if (s.t2 != null && Math.abs((e.clientX - r.left) - s.x0) >= 6) {
          const L = { id: 'ln_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            t1: Math.min(s.t1, s.t2), t2: Math.max(s.t1, s.t2), p: +s.p.toFixed(dp + 1), label: '', at: new Date().toISOString() };
          await saveLine(L);
          setDraw(false);
          openEditor(L);
        } else draw();
        return;
      }
      if (picking && drag && !drag.moved && drag.zone === 'pane') {
        const r = canvas.getBoundingClientRect(), G = geom();
        pickAt(Math.floor(view.start + (e.clientX - r.left) / G.bw));
      } else if (drag && !drag.moved && drag.line) openEditor(drag.line);
      drag = null; plot.classList.remove('is-dragging');
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', () => { sketch = null; drag = null; plot.classList.remove('is-dragging'); draw(); });
    canvas.addEventListener('pointerenter', () => { over = true; });
    canvas.addEventListener('pointerleave', () => {
      over = false;
      if (!drag && !sketch) { hover = null; hot = null; plot.classList.remove('on-price', 'on-time'); draw(); }
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const G = geom();
      if (zoneOf(x, y, G) === 'price') {
        fixScale(G);
        const k = Math.exp(e.deltaY * 0.0015), p = G.hi - (y - PAD_T) / G.ph * (G.hi - G.lo);
        yr.lo = p - (p - G.lo) * k; yr.hi = p + (G.hi - p) * k;
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        view.start += e.deltaX / (G.pw / view.count);
        if (replay && follow) setFollow(false);
      } else {
        const f = Math.min(1, Math.max(0, x / G.pw));
        const anchor = view.start + f * view.count;
        view.count *= Math.exp(e.deltaY * 0.0015);
        clamp();
        view.start = anchor - f * view.count;
      }
      clamp(); draw();
    }, { passive: false });
    canvas.addEventListener('dblclick', e => {
      if (drawMode) return;
      const r = canvas.getBoundingClientRect(), G = geom();
      const zone = zoneOf(e.clientX - r.left, e.clientY - r.top, G);
      if (zone === 'price') { yr.auto = true; paintHead(); draw(); return; }
      if (zone === 'time') { const keep = { ...yr }; endReplay(); fit(); Object.assign(yr, keep); paintHead(); draw(); return; }
      cancelPick(true); endReplay(); fit(); paintHead(); draw();
    });
    const onKey = e => {
      if (!card.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (e.target.closest?.('input, textarea')) return;
      if (e.key === 'Escape' && drawMode) { setDraw(false); return; }
      if (e.key === 'Escape' && picking) { cancelPick(); draw(); return; }
      if (e.key === 'Escape' && full) { setFull(false); return; }
      if (!over || !replay) return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepReplay(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepReplay(-1); }
    };
    document.addEventListener('keydown', onKey);

    /* ---------- drawing ---------- */
    function draw() {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; paint(); });
    }
    /* Everything that turns a time or a price into a place, for this frame. */
    function geom() {
      const W = plot.clientWidth, H = plot.clientHeight;
      const pw = Math.max(10, W - AXIS_W), ph = Math.max(10, H - PAD_T - PAD_B);
      const last = replay ? replay.upto : bars.length - 1;
      const bw = pw / view.count;
      const i0 = Math.max(0, Math.floor(view.start)), i1 = Math.min(last, Math.ceil(view.start + view.count));
      const replayT = replay ? bars[replay.upto][0] + tf * 60 : Infinity;
      if (yr.auto) { const r = candleRange(); if (r) { yr.lo = r.lo; yr.hi = r.hi; } }
      const lo = yr.lo, hi = yr.hi;
      const xT0 = T => (idxAt(T) - view.start) * bw;
      return { W, H, pw, ph, last, bw, i0, i1, replayT, lo, hi,
        xI: i => (i - view.start + 0.5) * bw, xT: xT0, Y: p => PAD_T + (hi - p) / (hi - lo) * ph };
    }
    function paint() {
      const G = geom();
      const { W, H, pw, ph, last, bw, i0, i1, replayT, lo, hi, xI, xT, Y } = G;
      if (!plot.clientWidth || !plot.clientHeight) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      }
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const cs = getComputedStyle(card);
      const v = name => cs.getPropertyValue(name).trim();
      const C = {
        ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), ink4: v('--ink-4'), ink5: v('--ink-5'),
        inset: v('--inset') || 'rgba(128,128,128,.2)', card: v('--card') || '#111',
        profit: v('--profit'), loss: v('--loss'), yellow: v('--yellow'),
        prgb: v('--profit-rgb'), lrgb: v('--loss-rgb'), yrgb: v('--yellow-rgb') || '255, 184, 0',
        mono: v('--mono') || 'monospace',
      };
      const font = px => `400 ${px}px ${C.mono}`;
      /* text that stays readable over candles */
      const say = (text, x, y, colour, align = 'left') => {
        g.textAlign = align; g.lineJoin = 'round';
        g.strokeStyle = C.card; g.lineWidth = 3; g.strokeText(text, x, y);
        g.fillStyle = colour; g.fillText(text, x, y);
        g.textAlign = 'left';
      };

      /* killzones — their names in the band along the top */
      g.save();
      g.beginPath(); g.rect(0, 0, pw, PAD_T + ph); g.clip();
      if (showSessions && sessions.length && bars.length && tf < 1440) {
        const tA = timeAtIdx(view.start) - DAY, tZ = timeAtIdx(view.start + view.count) + DAY;
        g.font = font(9.5); g.textBaseline = 'alphabetic';
        for (let d = tA; d <= tZ + DAY; d += DAY) {
          const day = localDay(d);
          for (const s of sessions) {
            if (!s.start || !s.end) continue;
            const a = cd.localStamp(day, s.start);
            let z = cd.localStamp(day, s.end);
            if (z <= a) z += DAY;
            const xa = Math.max(0, xT(a)), xz = Math.min(pw, xT(z));
            if (xz - xa < 2) continue;
            g.fillStyle = withAlpha(C.ink, 0.035);
            g.fillRect(xa, 0, xz - xa, PAD_T + ph);
            if (xz - xa > 46) {
              g.fillStyle = C.ink4;
              g.fillText(String(s.name || '').toUpperCase(), xa + 6, 15, xz - xa - 10);
            }
          }
        }
      }

      g.restore();

      /* everything else stays inside the plot: dragged up or down, candles
         never run over the times along the bottom or the names on top */
      g.save();
      g.beginPath(); g.rect(0, PAD_T, pw, ph); g.clip();
      const ticks = niceTicks(lo, hi, Math.max(3, Math.round(ph / 55)));

      /* the position */
      if (timed && Number.isFinite(entry)) {
        const end = Math.min(res.exit, replayT);
        const xa = xT(res.entry), xz = Math.max(xT(end), xa + 2);
        if (end > res.entry && xz > 0 && xa < pw) {
          if (Number.isFinite(tp)) {
            g.fillStyle = `rgba(${C.prgb}, .18)`;
            g.fillRect(xa, Math.min(Y(tp), Y(entry)), xz - xa, Math.abs(Y(tp) - Y(entry)));
          }
          if (Number.isFinite(sl)) {
            g.fillStyle = `rgba(${C.lrgb}, .18)`;
            g.fillRect(xa, Math.min(Y(sl), Y(entry)), xz - xa, Math.abs(Y(sl) - Y(entry)));
          }
        }
      }

      /* candles */
      const body = Math.max(1, Math.min(bw * 0.68, 14));
      for (let i = i0; i <= i1; i++) {
        const [, o, h, l, c] = bars[i];
        const x = xI(i);
        g.fillStyle = c >= o ? C.profit : C.loss;
        g.fillRect(Math.round(x), Y(h), 1, Math.max(1, Y(l) - Y(h)));
        g.fillRect(Math.round(x - body / 2), Y(Math.max(o, c)), Math.max(1, Math.round(body)), Math.max(1, Math.abs(Y(o) - Y(c))));
      }

      /* red-folder news — releases at the same moment share one marker,
         their names stacked under it, turned to the left near the edge */
      g.font = font(9.5); g.textBaseline = 'alphabetic';
      const groups = [];
      for (const ev of showNews ? news : []) {
        if (ev.at > replayT) continue;
        const x = Math.round(xT(ev.at)) + 0.5;
        if (x < 0 || x > pw) continue;
        const gp = groups.find(q => Math.abs(q.x - x) < 8);
        if (gp) { if (!gp.titles.includes(ev.title)) gp.titles.push(ev.title); } else groups.push({ x, titles: [ev.title] });
      }
      lastGroups = groups.map(q => ({ x: q.x, titles: q.titles.slice(), left: q.x > pw - 170 }));
      /* names never sit on each other: a block that would overlap one
         already placed drops below it */
      const placed = [];
      for (const { x, titles } of groups) {
        g.strokeStyle = withAlpha(C.loss, 0.7); g.lineWidth = 1; g.setLineDash([2, 3]);
        g.beginPath(); g.moveTo(x, PAD_T); g.lineTo(x, PAD_T + ph); g.stroke(); g.setLineDash([]);
        g.fillStyle = C.loss; g.fillRect(x - 3.5, PAD_T + 4, 7, 7);
        const shown = titles.length > 3 ? [...titles.slice(0, 2), `+${titles.length - 2} more`] : titles;
        const left = x > pw - 170;
        const w = Math.max(...shown.map(s => g.measureText(s).width));
        const x0 = left ? x - 8 - w : x + 8, x1 = x0 + w;
        let row = 0;
        const hits = r => placed.some(b => b.x0 < x1 + 6 && x0 < b.x1 + 6 && b.r0 < r + shown.length && r < b.r1);
        while (hits(row) && row < 12) row++;
        placed.push({ x0, x1, r0: row, r1: row + shown.length });
        shown.forEach((s, k) => say(s, left ? x - 8 : x + 8, PAD_T + 11 + (row + k) * 12, C.loss, left ? 'right' : 'left'));
      }

      /* your lines */
      g.font = font(9.5);
      const drawn = [...lines()];
      if (sketch && sketch.t2 != null) drawn.push({ id: '_sketch', t1: Math.min(sketch.t1, sketch.t2), t2: Math.max(sketch.t1, sketch.t2), p: sketch.p, label: '' });
      for (const L of drawn) {
        if (L.t1 > replayT) continue;
        const xa = xT(L.t1), xz = Math.min(xT(L.t2), xT(replayT)), y = Math.round(Y(L.p)) + 0.5;
        if (xz < 0 || xa > pw || y < PAD_T || y > PAD_T + ph) continue;
        const lit = L.id === picked || L.id === hot || L.id === '_sketch';
        g.strokeStyle = lit ? C.ink : C.ink2; g.lineWidth = lit ? 1.5 : 1; g.setLineDash([2, 3]);
        g.beginPath(); g.moveTo(xa, y); g.lineTo(xz, y); g.stroke(); g.setLineDash([]);
        if (lit) { g.fillStyle = C.ink; for (const ex of [xa, xz]) { g.beginPath(); g.arc(ex, y, 2.5, 0, Math.PI * 2); g.fill(); } }
        if (L.label) say(L.label, (xa + xz) / 2, y - 5, lit ? C.ink : C.ink2, 'center');
      }

      /* where you got in and out */
      g.font = font(9);
      const dot = (x, y, label, side) => {
        g.fillStyle = C.card; g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill();
        g.fillStyle = C.ink; g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill();
        say(label, side === 'left' ? x - 7 : x + 7, y - 5, C.ink2, side === 'left' ? 'right' : 'left');
      };
      if (timed && Number.isFinite(entry) && res.entry <= replayT) dot(xT(res.entry), Y(entry), 'Entry', 'left');
      if (timed && hasExit && res.exit <= replayT) dot(xT(res.exit), Y(exitP), 'Exit', 'right');

      /* choosing the replay's start: what would be hidden is dimmed */
      if (picking && hover && hover.x < pw) {
        const i = Math.max(0, Math.min(bars.length - 1, Math.floor(view.start + hover.x / bw)));
        const x = Math.round(xI(i) + bw / 2) + 0.5;
        g.fillStyle = withAlpha(C.card, 0.72);
        g.fillRect(x, PAD_T, pw - x, ph);
        g.strokeStyle = C.ink2; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, PAD_T); g.lineTo(x, PAD_T + ph); g.stroke();
      }
      g.restore();

      /* prices on the right: the axis, and a tag for each level */
      const tags = [];
      if (Number.isFinite(tp)) tags.push({ p: tp, label: 'TP', bg: `rgba(${C.prgb}, .28)` });
      if (Number.isFinite(sl)) tags.push({ p: sl, label: 'SL', bg: `rgba(${C.lrgb}, .28)` });
      if (Number.isFinite(entry)) tags.push({ p: entry, label: 'Entry', bg: C.inset });
      if (exitOwnTag && res.exit <= replayT) tags.push({ p: exitP, label: 'Exit', bg: `rgba(${C.yrgb}, .28)` });
      const tagYs = spread(tags.map(L => Math.min(PAD_T + ph - 8, Math.max(PAD_T + 8, Y(L.p)))), 17, PAD_T + 8, PAD_T + ph - 8);
      g.font = font(9.5); g.textBaseline = 'middle'; g.fillStyle = C.ink5;
      for (const p of ticks) {
        const y = Y(p);
        if (y < PAD_T + 4 || y > PAD_T + ph - 4 || tagYs.some(ty => Math.abs(ty - y) < 11)) continue;
        g.textAlign = 'right'; g.fillText(fmt(p, dp), W - 6, y); g.textAlign = 'left';
      }
      tags.forEach((L, k) => {
        const y = tagYs[k];
        g.fillStyle = L.bg; roundRect(g, pw + 4, y - 8, AXIS_W - 8, 16, 4); g.fill();
        g.fillStyle = C.ink; g.fillText(L.label, pw + 9, y + 0.5);
        g.textAlign = 'right'; g.fillText(fmt(L.p, dp), W - 9, y + 0.5, AXIS_W - 16 - g.measureText(L.label + ' ').width); g.textAlign = 'left';
      });

      /* the time axis */
      g.fillStyle = C.ink5; g.textBaseline = 'alphabetic'; g.font = font(9.5);
      const pxMin = bw / tf;
      const step = [1, 5, 15, 30, 60, 120, 180, 240, 360, 720].find(m => m >= tf && m * pxMin >= 64);
      let lastX = -1e9, prevDay = null;
      const iEnd = Math.min(bars.length - 1, Math.ceil(view.start + view.count));
      for (let i = Math.max(0, i0 - 1); i <= iEnd; i++) {
        const bt = bars[i][0], d = new Date(bt * 1000);
        const day = tf >= 1440 ? cd.tradingDayOf(bt) : localDay(bt);
        const newDay = prevDay !== null && day !== prevDay;
        prevDay = day;
        if (i < i0) continue;
        const m = d.getHours() * 60 + d.getMinutes();
        let text = null;
        if (tf >= 1440) text = dayLabel(day);
        else if (step && tf < 240 && m % step === 0) text = m === 0 ? dayLabel(day) : clock(d);
        else if ((!step || tf >= 240) && newDay) text = dayLabel(day);
        if (!text) continue;
        const x = xI(i) - (tf >= 1440 ? 0 : bw / 2);
        if (x < 0 || x > pw - 24 || x - lastX < 56) continue;
        g.fillText(text, x - 14, H - 6);
        lastX = x;
      }

      /* the crosshair, and the candle under it read out underneath */
      footL.textContent = hint();
      if (hover && !drag && hover.x < pw && hover.y > PAD_T && hover.y < PAD_T + ph) {
        const i = Math.floor(view.start + hover.x / bw);
        if (i >= 0 && i <= last) {
          const x = Math.round(xI(i)) + 0.5, y = Math.round(hover.y) + 0.5;
          g.strokeStyle = withAlpha(C.ink, 0.28); g.lineWidth = 1; g.setLineDash([2, 3]);
          g.beginPath(); g.moveTo(x, PAD_T); g.lineTo(x, PAD_T + ph); g.moveTo(0, y); g.lineTo(pw, y); g.stroke();
          g.setLineDash([]);
          const price = hi - (hover.y - PAD_T) / ph * (hi - lo);
          g.fillStyle = C.ink3; roundRect(g, pw + 4, y - 8, AXIS_W - 8, 16, 4); g.fill();
          g.fillStyle = C.card; g.textBaseline = 'middle'; g.textAlign = 'right'; g.fillText(fmt(price, dp), W - 9, y + 0.5); g.textAlign = 'left';
          const [bt, o, h, l, c] = bars[i];
          const d = new Date(bt * 1000);
          const tl = tf >= 1440 ? dayLabel(cd.tradingDayOf(bt)) : `${WEEKDAYS[d.getDay()]} ${clock(d)}`;
          const tw = tl.length * 6 + 10, tx = Math.min(pw - tw, Math.max(0, x - tw / 2));
          g.fillStyle = C.ink3; roundRect(g, tx, H - 18, tw, 16, 4); g.fill();
          g.fillStyle = C.card; g.fillText(tl, tx + 5, H - 9.5);
          const when = tf >= 1440 ? dayLabel(cd.tradingDayOf(bt)) : `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${clock(d)}`;
          footL.textContent = `${when}   O ${fmtP(o, dp)}  H ${fmtP(h, dp)}  L ${fmtP(l, dp)}  C ${fmtP(c, dp)}`;
        }
      }
    }

    new ResizeObserver(() => draw()).observe(plot);
    paintHead();
    fit();
    paintHead();
    draw();
    /* The trade's week is on screen; the rest of its month follows. */
    if (res.rest?.length) {
      loadingMore = true; paintSub();
      cd.getKey().then(cred => cd.loadDays(store, inst, res.rest, cred, now))
        .then(more => { loadingMore = false; paintSub(); extend(more); card.dispatchEvent(new Event('tc-month')); })
        .catch(() => { loadingMore = false; monthFailed = true; paintSub(); draw(); });
    } else paintSub();
    card.__chart = {
      get view() { return { ...view }; }, get tf() { return tf; }, get bars() { return bars.length; },
      get replaying() { return !!replay?.playing; }, get upto() { return replay ? replay.upto : null; },
      get speed() { return SPEEDS[speed][0]; }, get drawing() { return drawMode; },
      get news() { return news.map(n => n.title); }, get days() { return res.days.slice(); }, get loadingMore() { return loadingMore; },
      get auto() { return yr.auto; }, get picking() { return picking; }, get full() { return full; },
      get shows() { return { sessions: showSessions, news: showNews }; }, get yRange() { return { lo: yr.lo, hi: yr.hi }; }, get follow() { return follow; },
      firstBar: () => res.rows[0][0], lastBar: () => res.rows[res.rows.length - 1][0],
      barTimes: () => bars.map(b => b[0]), barAt: i => bars[i], groups: () => lastGroups, lineCount: () => lines().length, idxAt, tags: () => tagsNow(), dots: () => dotsNow(),
      xy: (T, p) => { const G = geom(); return { x: G.xT(T), y: G.Y(p) }; },
    };
    function tagsNow() {
      const out = [];
      if (Number.isFinite(tp)) out.push('TP'); if (Number.isFinite(sl)) out.push('SL');
      if (Number.isFinite(entry)) out.push('Entry'); if (exitOwnTag) out.push('Exit');
      return out;
    }
    function dotsNow() {
      const out = [];
      if (timed && Number.isFinite(entry)) out.push('Entry');
      if (timed && hasExit) out.push('Exit');
      return out;
    }
  }

  function firstTf() {
    const own = CHART_TFS.find(([k]) => k === t.execTf);
    if (own) return own[1];
    const kept = Number(recall(TF_KEY));
    if (CHART_TFS.some(([, m]) => m === kept)) return kept;
    return 5;
  }

  start();
  return card;
}

/* ---------- small pieces ---------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = n => String(n).padStart(2, '0');
const clock = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
function localDay(T) { const d = new Date(T * 1000); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function dayLabel(iso) { const d = new Date(iso + 'T12:00:00Z'); return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`; }
const fmt = (v, dp) => Number(v).toLocaleString('en-US', { minimumFractionDigits: Math.min(dp, 5), maximumFractionDigits: Math.min(dp, 5) });
const fmtP = (v, dp) => Number(v).toFixed(dp);

/** Round price steps, about n of them across the range. */
export function niceTicks(lo, hi, n = 5) {
  const raw = (hi - lo) / n;
  if (!(raw > 0)) return [];
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= raw) || 10 * mag;
  const out = [];
  for (let p = Math.ceil(lo / step) * step; p <= hi + step * 1e-9; p += step) out.push(+p.toFixed(10));
  return out;
}

/** Labels pushed apart so none overlap, keeping their order and their bounds. */
export function spread(ys, gap, top, bottom) {
  const order = ys.map((y, i) => [y, i]).sort((a, b) => a[0] - b[0]);
  const out = order.map(([y]) => y);
  for (let k = 1; k < out.length; k++) if (out[k] - out[k - 1] < gap) out[k] = out[k - 1] + gap;
  if (out.length && out[out.length - 1] > bottom) {
    out[out.length - 1] = bottom;
    for (let k = out.length - 2; k >= 0; k--) if (out[k + 1] - out[k] < gap) out[k] = out[k + 1] - gap;
  }
  if (out.length && out[0] < top) { out[0] = top; for (let k = 1; k < out.length; k++) if (out[k] - out[k - 1] < gap) out[k] = out[k - 1] + gap; }
  const back = new Array(ys.length);
  order.forEach(([, i], k) => { back[i] = out[k]; });
  return back;
}

function withAlpha(colour, a) {
  const c = String(colour).trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; }
  m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) { const [r, g, b] = m[1].split('').map(h => parseInt(h + h, 16)); return `rgba(${r}, ${g}, ${b}, ${a})`; }
  m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) { const [r, g, b] = m[1].split(',').map(s => s.trim()); return `rgba(${r}, ${g}, ${b}, ${a})`; }
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
