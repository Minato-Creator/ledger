/* ============================================================
   tradechart.js — the trade, on its week's chart.

   For looking only. The candles are OANDA's, which are never quite your
   broker's, so nothing here feeds a number anywhere else in the journal.

   The chart is TradingView's (chart/core.js: spacing, scales, crosshair,
   status line, right-click menu, Chart Settings, Change interval). What this
   file adds is the trade:

   The whole trading week is loaded — Sunday's open to Friday's close — so
   the 4H and daily candles show the week's structure, and every trade on the
   same instrument that week reads the same saved days; the rest of the
   month follows.

   Drawn on top of the candles: the killzones from the Playbook, shaded and
   named along the bottom; red-folder news for the instrument's currencies;
   the position as two boxes — entry to target, entry to stop — between the
   time you got in and the time you got out; a small dot where you got in
   and one where you got out; the prices of all four as tags on the right.
   Plus your own dotted lines (BOS, x, protected highs…), kept per
   instrument so a level marked on one gold trade is there on the next.

   Replay starts where you click, with pause, step and speed.
   ============================================================ */
import { el, icon, toast } from '../ui.js';
import * as cd from '../candles.js';
import { createCore, CHART_TFS, TV_FONT, withAlpha, svgIcon, niceTicks, spread } from '../chart/core.js';
import { openMenu } from '../chart/menu.js';
import { createDrawings } from '../chart/drawings.js';
import { paintSessions, paintSessionNames, newsFor as newsOf, paintNews } from '../chart/overlays.js';
import { rsiFor } from '../chart/rsi.js';

export { CHART_TFS, niceTicks, spread };
export const SPEEDS = [['1×', 250], ['2×', 125], ['5×', 50], ['10×', 25]];
const TF_KEY = 'quire:chartTf', SPEED_KEY = 'quire:replaySpeed', FOLLOW_KEY = 'quire:replayFollow';
const SESS_KEY = 'quire:chartSessions', NEWS_KEY = 'quire:chartNews', RSI_KEY = 'quire:chartRsi';
const DAY = 86400;
const FOOT = 'for viewing only · prices can differ slightly from your broker’s';

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

  /* ready: once it shows what it is going to show — a message, or the chart drawn */
  let ready;
  card.__ready = new Promise(r => { ready = r; });
  const message = (text, ...actions) => {
    card.classList.add('is-quiet');
    card.replaceChildren(headOnly(), el('div', { class: 'tc-msg' }, el('span', {}, text), ...actions));
    ready();
  };

  async function start() {
    if (!inst) return message(`No chart for ${t.pair || 'this trade'} — OANDA has no instrument that matches it.`);
    const cred = await cd.getKey();
    if (!cred) return message('Add your OANDA key in Settings to see the chart here.',
      el('button', { class: 'tc-btn', onClick: () => nav.go('#/settings') }, 'Open Settings'));
    card.classList.remove('is-quiet');
    /* "Getting the prices…" only if it takes a while — prices from the vault come at once, and a flash of it is the glitch */
    const wait = el('div', { class: 'tc-plot is-loading is-wait', style: { height: height + 'px' } }, el('span', {}, 'Getting the prices…'));
    card.replaceChildren(headOnly(), wait);
    setTimeout(() => wait.classList.remove('is-wait'), 400);
    let res;
    try { res = await cd.candlesFor(store, t, cred, now); }
    catch (e) {
      return message(cd.explain(e), el('button', { class: 'tc-btn', onClick: start }, 'Try again'));
    }
    if (!res.rows.length) return message('OANDA has no prices for this time — the market may have been closed.');
    card.classList.remove('is-quiet');
    chart(res);
    requestAnimationFrame(() => requestAnimationFrame(ready));
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

    const newsFor = () => newsOf(store, inst, res.rows[0][0], res.rows[res.rows.length - 1][0] + 60);
    let news = newsFor();
    const sessions = store.playbook?.sessions || [];

    let tf = firstTf();
    /* replay: null, or where it has got to and whether it is moving */
    let replay = null, timer = null;
    let speed = Math.max(0, SPEEDS.findIndex(([k]) => k === recall(SPEED_KEY)));
    let follow = recall(FOLLOW_KEY) !== '0';
    let lastGroups = [];
    let loadingMore = false, monthFailed = false;
    /* what is shown: the killzones and the news can each be switched off */
    let showSessions = recall(SESS_KEY) !== '0', showNews = recall(NEWS_KEY) !== '0', showRsi = recall(RSI_KEY) === '1';
    /* choosing where a replay starts, TradingView's way: a line follows the
       pointer and everything after it is dimmed; a click starts there */
    let picking = false, pickPrev = null;
    let full = false;

    const plot = el('div', { class: 'tc-plot', style: { height: height + 'px' } });
    const core = createCore(plot, {
      store, inst, dp, symbol: inst.replace('_', '').replace('NAS100USD', 'NAS100'), source: 'OANDA',
      bars: cd.aggregate(res.rows, tf), tf,
      hooks: {
        limit: () => (replay ? replay.upto : null),
        tags: () => [...tagList(), ...(dr ? dr.tags() : [])],
        back: paintBack, front: paintFront,
        claim, hover: (x, y, G, e) => dr.hover(x, y, G, e), dbl: (x, y, G) => dr.dbl(x, y, G), leave: () => dr.leave(),
        onPan: () => { if (replay && follow) setFollow(false); },
        onReset: () => { cancelPick(true); endReplay(); fit(); paintHead(); },
        onTimeReset: () => { const keep = { ...core.yr }; endReplay(); fit(); Object.assign(core.yr, keep); paintHead(); },
        onInterval: m => setTf(m),
        menu: ctx => dr.menu(ctx),
        panes: () => (showRsi ? [rsi] : []),
      },
    });
    const rsi = rsiFor(store, core, { tf: () => tf, plot, remove: () => setShow('rsi', false) });
    const bars = () => core.bars;
    /* the drawings: kept per instrument and per place — the trade page and
       the weekly review share one set (the execution's markings), the
       Outlook keeps its own (opts.lines = 'outlook') */
    const dkey = opts.lines ? `${opts.lines}:${inst}` : inst;
    const acct = store.activeAccount;
    const dr = createDrawings(core, plot, { store, dkey, inst, dp, tf: () => tf, rows: () => res.rows,
      replayT: () => (replay ? bars()[replay.upto][0] + tf * 60 : Infinity),
      account: () => ({ balance: acct?.startingBalance, risk: acct?.defaultRiskPercent }),
      onTool: k => { if (k) { cancelPick(); if (replay && replay.playing) togglePlay(); } paintFoot(); } });

    const idxAt = T => core.idxAt(T);
    function fit() {
      const n = bars().length;
      if (tf >= 240) {
        core.setView(-1, Math.max(12, n + 2));
        core.fitPrices();
        core.setView(-1, Math.max(12, n + 2));
        return;
      }
      /* a stretch of time to open on — the trade, or (opts.focus) any span,
         never past the last candle there is */
      const f0 = opts.focus?.from ?? res.entry, f1 = opts.focus?.to ?? (timed ? res.exit : res.entry + 3600);
      const a = idxAt(f0), z = Math.min(idxAt(f1), n + 1);
      const span = Math.max(1, z - a), pad = opts.focus ? Math.max(span * 0.04, 4) : Math.max(span * 0.7, 24);
      const count = Math.min(Math.max(span + pad * 2, 40), Math.max(40, n + 10));
      const start = (a + z) / 2 - count / 2;
      core.setView(start, count);
      core.fitPrices(!plain && timed ? [entry, sl, tp, hasExit ? exitP : NaN] : []);
      core.setView(start, count);
    }
    function setTf(m) {
      if (m === tf) return;
      const replayT = replay ? bars()[replay.upto][0] : null;
      tf = m;
      core.setBars(cd.aggregate(res.rows, tf), tf);
      if (replay) replay.upto = Math.max(0, Math.min(bars().length - 1, Math.floor(idxAt(replayT))));
      /* a new timeframe is placed once — then it sits still */
      if (!core.yr.auto) core.fitPrices();
      /* 4H and daily are for the structure: everything loaded, at once */
      if (tf >= 240 && !replay) fit();
      remember(TF_KEY, tf);
      paintHead(); core.draw();
    }
    /* More of the month arrived: the same moments stay where they were. */
    function extend(more) {
      if (!more.length) return;
      const replayT = replay ? bars()[replay.upto][0] : null;
      const seen = new Set(res.rows.map(r => r[0]));
      res.rows = [...res.rows, ...more.filter(r => !seen.has(r[0]))].sort((a, b) => a[0] - b[0]);
      core.setBars(cd.aggregate(res.rows, tf), tf);
      if (replay) replay.upto = Math.max(0, Math.min(bars().length - 1, Math.floor(idxAt(replayT))));
      news = newsFor();
      if (tf >= 240 && !replay) fit();
      core.draw();
    }

    /* ---------- the controls: TradingView's top bar ---------- */
    const seg = el('div', { class: 'seg tc-seg' });
    const indBtn = el('button', { class: 'tc-tool tc-ind', title: 'Indicators', onClick: () => indicators() },
      svgIcon('M4 19l5-7 4 3 7-10', 16), el('span', { class: 'tc-tlabel' }, 'Indicators'));
    const replayBtn = el('button', { class: 'tc-play', onClick: () => { if (replay || picking) { cancelPick(true); endReplay(); core.draw(); } else startReplay(); } }, el('i'), 'Replay');
    const gearBtn = el('button', { class: 'tc-reset tc-gear', title: 'Settings', onClick: () => core.openSettings() },
      svgIcon('M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM12 3l1.6 2.3 2.7-.6.6 2.7L19.2 9 18.5 12l.7 3-2.3 1.6-.6 2.7-2.7-.6L12 21l-1.6-2.3-2.7.6-.6-2.7L4.8 15l.7-3-.7-3 2.3-1.6.6-2.7 2.7.6z', 16));
    const fullBtn = el('button', { class: 'tc-reset tc-full', title: 'Full screen (Esc to leave)', onClick: () => setFull(!full) },
      icon('expand', 12, 'currentColor', 1.9));
    const resetBtn = el('button', { class: 'tc-reset tc-back2', title: 'Back to the trade (Alt + R)', onClick: () => { core.reset(); } },
      icon('refresh', 13, 'currentColor', 1.9));
    /* Replay's controls sit under the chart while it runs, the way
       TradingView's bar does, so the header never has to make room. */
    const rbar = el('div', { class: 'tc-rbar', hidden: true });
    const rtop = el('div', { class: 'tc-rtop', hidden: true });
    function indicators() {
      const r = indBtn.getBoundingClientRect();
      openMenu([
        { head: 'Indicators' },
        { label: 'Relative Strength Index', checked: showRsi, cls: 'tc-ind-rsi', act: () => setShow('rsi', !showRsi) },
        { label: 'Sessions', checked: showSessions, cls: 'tc-ind-sessions', act: () => setShow('sessions', !showSessions) },
        { label: 'News · red folders', checked: showNews, cls: 'tc-ind-news', act: () => setShow('news', !showNews) },
      ], r.left, r.bottom + 4, { cls: 'tc-indmenu' });
    }
    function setShow(which, on) {
      if (which === 'sessions') { showSessions = on; remember(SESS_KEY, on ? '1' : '0'); }
      else if (which === 'rsi') { showRsi = on; remember(RSI_KEY, on ? '1' : '0'); }
      else { showNews = on; remember(NEWS_KEY, on ? '1' : '0'); }
      core.draw();
    }
    function paintHead() {
      seg.replaceChildren(...CHART_TFS.map(([label, m]) =>
        el('button', { class: m === tf ? 'is-on' : '', 'data-tf': label, onClick: () => setTf(m) }, label)));
      replayBtn.classList.toggle('is-on', !!replay || picking);
      fullBtn.replaceChildren(icon(full ? 'close' : 'expand', full ? 11 : 12, 'currentColor', 1.9));
      fullBtn.title = full ? 'Leave full screen (Esc)' : 'Full screen';
      plot.classList.toggle('is-picking', picking);
      rbar.hidden = !replay && !picking;
      rtop.hidden = !replay;
      card.classList.toggle('is-replaying', !!replay);
      if (!replay) rtop.replaceChildren();
      if (picking) {
        rbar.replaceChildren(...[
          el('span', { class: 'tc-pickhint' }, 'Click on the chart where the replay should start'),
          el('div', { class: 'spacer' }),
          timed ? el('button', { class: 'tc-rend tc-entrypick', onClick: () => pickAt(beforeEntry()) }, 'Just before the entry') : null,
          el('button', { class: 'tc-rend tc-cancelpick', onClick: () => { cancelPick(); core.draw(); } }, 'Cancel')].filter(Boolean));
        return;
      }
      if (!replay) { rbar.replaceChildren(); return; }
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
        el('button', { class: 'tc-rend tc-endr', onClick: () => { endReplay(); core.draw(); } }, 'End replay'));
    }
    const replayWhen = () => {
      if (!replay) return '';
      const d = new Date(bars()[replay.upto][0] * 1000);
      return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${clock(d)}`;
    };

    const footL = el('span', { class: 'tc-read' }, FOOT);
    card.replaceChildren(
      el('div', { class: 'tc-head' }, title, el('div', { class: 'spacer' }), seg, rtop, indBtn, replayBtn, resetBtn, gearBtn, fullBtn),
      el('div', { class: 'tc-body' }, dr.bar, plot), rbar,
      el('div', { class: 'tc-foot' }, footL));
    const hint = () => dr?.tool ? 'click, or drag, to draw · Shift keeps a line flat · Esc to stop'
      : picking ? 'click where the replay should start · Esc to cancel'
      : monthFailed ? 'the rest of the month could not be loaded' : FOOT;
    const paintFoot = () => { const h = hint(); if (footL.textContent !== h) footL.textContent = h; };
    /* Full screen: the card takes the whole window, Esc gives it back.
       The card is lifted out to the page itself while it is full screen, so
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
      paintHead(); core.draw();
    }
    function leaveOnNav() { setFull(false); }
    const monthLabel = () => { const d = new Date((res.month.mid) * 1000); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
    const paintSub = () => { sub.textContent = `${monthLabel()}${loadingMore ? ' · loading the month…' : ''}`; };

    /* ---------- replay ---------- */
    function startReplay() {
      dr.setTool(null);
      if (timer) clearInterval(timer);
      timer = null;
      pickPrev = replay; replay = null; picking = true;
      paintHead(); core.draw();
    }
    function beforeEntry() {
      const a = Math.floor(idxAt(timed ? res.entry : bars()[0][0]));
      return a - Math.max(3, Math.round(core.getView().count * 0.35));
    }
    /* the replay starts on this candle: it and everything before it shows */
    function pickAt(i) {
      const upto = Math.max(1, Math.min(bars().length - 1, Math.round(i)));
      picking = false; pickPrev = null;
      replay = { upto, playing: false };
      const v = core.getView();
      if (upto < v.start || upto > v.start + v.count) core.setView(upto - v.count * 0.65, v.count);
      paintHead(); core.draw();
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
      if (replay.upto >= bars().length - 1) { replay.playing = false; run(); paintHead(); return; }
      replay.upto++;
      followNow(); paintWhen(); core.draw();
    }
    const paintWhen = () => { const w = rbar.querySelector('.tc-rwhen'); if (w) w.textContent = replayWhen(); };
    /* Follow price: the newest candle stays in view, sideways and — when
       the scale is not on auto — up and down. Free view leaves it to you. */
    function followNow() {
      if (!replay || !follow) return;
      const v = core.getView();
      if (replay.upto > v.start + v.count * 0.85) core.setView(replay.upto - v.count * 0.85, v.count);
      else if (replay.upto < v.start + v.count * 0.1) core.setView(replay.upto - v.count * 0.5, v.count);
      const yr = core.yr;
      if (!yr.auto) {
        const b = bars()[replay.upto], m = (yr.hi - yr.lo) * 0.08;
        if (b[2] > yr.hi - m) { const d = b[2] - (yr.hi - m); yr.hi += d; yr.lo += d; }
        if (b[3] < yr.lo + m) { const d = (yr.lo + m) - b[3]; yr.hi -= d; yr.lo -= d; }
      }
    }
    function togglePlay() {
      if (!replay) return;
      if (!replay.playing && replay.upto >= bars().length - 1) return;
      replay.playing = !replay.playing; run(); paintHead();
    }
    function stepReplay(d) {
      if (!replay) return;
      replay.playing = false; run();
      replay.upto = Math.max(1, Math.min(bars().length - 1, replay.upto + d));
      followNow(); paintHead(); core.draw();
    }
    function setSpeed(i) { speed = i; remember(SPEED_KEY, SPEEDS[i][0]); run(); paintHead(); }
    function setFollow(on) {
      follow = on; remember(FOLLOW_KEY, on ? '1' : '0');
      if (on) followNow();
      paintHead(); core.draw();
    }
    function endReplay() {
      if (timer) clearInterval(timer);
      timer = null; replay = null; paintHead();
    }

    /* what a press on the chart does before it becomes a drag: choosing
       the replay's start, or the drawings */
    function claim(x, y, G, e) {
      if (picking) return { click: (cx, cy, G2) => pickAt(Math.floor(G2.iX(cx))) };
      return dr.claim(x, y, G, e);
    }

    /* ---------- keys: Esc, and replay's space / ← → ---------- */
    const onKey = e => {
      if (!card.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (e.target.closest?.('input, textarea, select') || document.querySelector('.tv-dialog')) return;
      if ((core.over || core.focused) && dr.key(e)) return;
      if (e.key === 'Escape' && picking) { cancelPick(); core.draw(); return; }
      if (e.key === 'Escape' && full) { setFull(false); return; }
      if (!core.over || !replay) return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepReplay(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepReplay(-1); }
    };
    document.addEventListener('keydown', onKey);

    /* ---------- painting what the trade adds ---------- */
    let FF = TV_FONT;
    const f = px => `400 ${px}px ${FF}`;
    /* text that stays readable over candles */
    const sayOn = (g, C) => (text, x, y, colour, align = 'left') => {
      g.textAlign = align; g.lineJoin = 'round';
      g.strokeStyle = C.card; g.lineWidth = 3; g.strokeText(text, x, y);
      g.fillStyle = colour; g.fillText(text, x, y);
      g.textAlign = 'left';
    };
    function tagList() {
      const replayT = replay ? bars()[replay.upto][0] + tf * 60 : Infinity;
      const C = tagColours();
      const out = [];
      if (Number.isFinite(tp)) out.push({ p: tp, label: 'TP', bg: C.profit });
      if (Number.isFinite(sl)) out.push({ p: sl, label: 'SL', bg: C.loss });
      if (Number.isFinite(entry)) out.push({ p: entry, label: 'Entry', bg: C.flat });
      if (exitOwnTag && res.exit <= replayT) out.push({ p: exitP, label: 'Exit', bg: C.yellow, fg: '#131722' });
      return out;
    }
    let tagC = null;
    const tagColours = () => {
      if (!tagC) { const cs = getComputedStyle(plot); tagC = { flat: cs.getPropertyValue('--flat').trim() || '#787878', profit: cs.getPropertyValue('--profit').trim() || '#18AC65', loss: cs.getPropertyValue('--loss').trim() || '#F4624A', yellow: cs.getPropertyValue('--yellow').trim() || '#FFB800' }; }
      return tagC;
    };
    function paintBack(g, G, C) {
      tagC = null; FF = C.font;
      const { pw, ph, xT, Y, replayT } = G;
      /* killzones */
      if (showSessions) paintSessions(g, G, C, sessions, tf);
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
    }
    function paintFront(g, G, C) {
      const { pw, ph, xT, Y, replayT, spacing } = G;
      const say = sayOn(g, C);
      g.textBaseline = 'alphabetic';
      /* killzone names along the bottom; red-folder news */
      if (showSessions) paintSessionNames(g, G, C, sessions, tf, f);
      lastGroups = showNews ? paintNews(g, G, C, news, f) : [];
      /* the drawings */
      dr.paint(g, G, C);
      g.textBaseline = 'alphabetic';
      /* where you got in and out */
      g.font = f(10);
      const dot = (x, y, label, side) => {
        g.fillStyle = C.card; g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill();
        g.fillStyle = C.ink; g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill();
        say(label, side === 'left' ? x - 7 : x + 7, y - 5, C.ink2, side === 'left' ? 'right' : 'left');
      };
      if (timed && Number.isFinite(entry) && res.entry <= replayT) dot(xT(res.entry), Y(entry), 'Entry', 'left');
      if (timed && hasExit && res.exit <= replayT) dot(xT(res.exit), Y(exitP), 'Exit', 'right');
      /* choosing the replay's start: what would be hidden is dimmed */
      const hv = core.hover;
      if (picking && hv && hv.x < pw) {
        const i = Math.max(0, Math.min(bars().length - 1, Math.floor(G.iX(hv.x))));
        const x = Math.round(G.xI(i) + spacing / 2) + 0.5;
        g.fillStyle = withAlpha(C.card, 0.72);
        g.fillRect(x, 0, pw - x, ph);
        g.strokeStyle = C.ink2; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, ph); g.stroke();
      }
      paintFoot();
    }

    paintHead();
    fit();
    paintHead();
    core.draw();
    /* The trade's week is on screen; the rest of its month follows. */
    if (res.rest?.length) {
      loadingMore = true; paintSub();
      cd.getKey().then(cred => cd.loadDays(store, inst, res.rest, cred, now))
        .then(more => { loadingMore = false; paintSub(); extend(more); card.dispatchEvent(new Event('tc-month')); })
        .catch(() => { loadingMore = false; monthFailed = true; paintSub(); core.draw(); });
    } else paintSub();
    const round = x => Math.round(x * 1e9) / 1e9;
    card.__chart = {
      get view() { const v = core.getView(); return { start: round(v.start), count: round(v.count), spacing: v.spacing }; },
      get tf() { return tf; }, get bars() { return bars().length; },
      get replaying() { return !!replay?.playing; }, get upto() { return replay ? replay.upto : null; },
      get speed() { return SPEEDS[speed][0]; }, get drawing() { return dr.tool; }, dr,
      get news() { return news.map(n => n.title); }, get days() { return res.days.slice(); }, get loadingMore() { return loadingMore; },
      get auto() { return core.yr.auto; }, get picking() { return picking; }, get full() { return full; },
      get shows() { return { sessions: showSessions, news: showNews, rsi: showRsi }; }, rsi, get yRange() { return { lo: core.yr.lo, hi: core.yr.hi }; }, get follow() { return follow; },
      get pw() { return core.geom().pw; }, get ph() { return core.geom().ph; }, get hidden() { return dr.hidden; }, core,
      firstBar: () => res.rows[0][0], lastBar: () => res.rows[res.rows.length - 1][0],
      barTimes: () => bars().map(b => b[0]), barAt: i => bars()[i], groups: () => lastGroups, lineCount: () => dr.list().length, idxAt, tags: () => tagsNow(), dots: () => dotsNow(),
      xy: (T, p) => { const G = core.geom(); return { x: G.xT(T), y: G.Y(p) }; },
      status: () => core.statusText(),
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
