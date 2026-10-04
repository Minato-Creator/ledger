/* ============================================================
   chart/core.js — the chart itself, the way TradingView's works.

   Everything a chart is, whatever it shows: candles, the price scale and the
   time scale, the crosshair, the status line, the last price, moving and
   zooming, the right-click menu, Chart Settings and the Change interval box.
   What a particular chart adds — a trade's position, killzones, news, lines,
   a replay — comes in through `hooks`, so the trade page, the weekly review,
   the Outlook and Replay all sit on this one engine.

   TradingView's rules, kept here:
   • Time is measured in **bar spacing** — pixels a candle — and the bar at
     the right edge. Zooming changes the spacing, and the candle body grows
     and shrinks with it (TradingView's body-width curve: 3px between 2.5 and
     4px spacing, otherwise a little under the spacing, never wider). A
     wider window shows more candles; it never stretches them.
   • Drag the chart: time sideways, prices up and down (auto switches off).
     Drag the price scale: squeeze / stretch prices about the middle. Drag
     the time scale: squeeze / stretch time with the right edge still.
     Wheel: zoom time about the pointer; over the price scale, prices.
     Double-click the price scale: auto. Double-click the time scale: reset.
   • Auto fits the candles on screen inside the top and bottom margins. It
     starts off here — Minato: "make it so it doesn't move at all" — and the
     `auto` button in the corner turns it on.
   • Crosshair: the line down snaps to the candle; its price and time are
     tagged on the scales. The status line, top left, reads the candle under
     it (or the newest one): O H L C and the change.
   • The last price: a dotted line across in the candle's colour and its tag.
   • The time scale labels the round moments first — a new year, month, day,
     then the hours — and never lets two labels crowd each other.
   ============================================================ */
import { el } from '../ui.js';
import * as cd from '../candles.js';
import { chartSettings, onSettings, wall } from './settings.js';
import { openMenu, closeMenus, intervalBox, parseInterval } from './menu.js';
import { openChartSettings } from './dialog.js';

export const TV_FONT = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
export const CHART_TFS = [['1m', 1], ['3m', 3], ['5m', 5], ['15m', 15], ['30m', 30], ['1H', 60], ['4H', 240], ['D', 1440]];
export const tfLabel = m => CHART_TFS.find(([, x]) => x === m)?.[0] || `${m}m`;
const MIN_SPACING = 0.5, MAX_SPACING = 60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = n => String(n).padStart(2, '0');

/**
 * @param plot  the element the chart fills (it sets the size)
 * @param o     { store, inst, dp, symbol, source, bars, tf, hooks }
 *   hooks: limit() → last index shown · tags() → [{p, label, bg}] on the price scale ·
 *          back(g, G, C) / front(g, G, C) → paint under / over the candles ·
 *          claim(x, y, G, e) → { capture, move, up } or { click } · hover(x, y, G) → 'pointer' ·
 *          onPan() · onReset() · onTimeReset() · onInterval(m) · menu(ctx) → items · dbl(x, y, G)
 */
export function createCore(plot, o) {
  const store = o.store, hooks = o.hooks || {};
  let bars = o.bars || [], tf = o.tf || 5;
  const dpInst = o.dp ?? 2;
  let S = chartSettings(store);
  /* the app's own font (Minato: the chart in the same font as the app) */
  let FONT = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || TV_FONT;

  const canvas = el('canvas', { class: 'tc-canvas' });
  const status = el('div', { class: 'tv-status' });
  const autoBtn = el('button', { class: 'tc-auto', title: 'Auto (fits the prices to the screen)', onClick: () => { setAuto(!yr.auto); } }, 'auto');
  plot.classList.add('tv-plot');
  plot.append(canvas, status, autoBtn);

  /* time: spacing in px a bar, and the bar index at the right edge */
  const view = { spacing: 6, right: 0 };
  let pending = null;            // a view asked for before the chart had a size
  const yr = { auto: false, lo: 0, hi: 1 };
  let hover = null, drag = null, grab = null, raf = 0, over = false, focused = false, seen = false;
  let lastStatus = '', lastMarks = [], lastAreas = [];

  const unlisten = onSettings(s => {
    if (seen && !plot.isConnected) { unlisten(); return; }
    S = s || chartSettings(store); draw();
  });

  /* ---------- where things are ---------- */
  const limit = () => Math.min(bars.length - 1, hooks.limit ? hooks.limit() ?? bars.length - 1 : bars.length - 1);
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
    if (!n) return 0;
    if (i < 0) return bars[0][0] + i * step;
    if (i >= n) return bars[n - 1][0] + (i - n + 1) * step;
    const k = Math.floor(i);
    return bars[k][0] + (i - k) * step;
  }
  const dp = () => (S.precision === 'default' ? dpInst : S.precision);
  const fmt = v => (Number.isFinite(v) ? Number(v).toFixed(dp()) : '');

  /* the candles on screen, high to low, inside the top and bottom margins */
  function candleRange(start, count) {
    const last = limit();
    const i0 = Math.max(0, Math.floor(start)), i1 = Math.min(last, Math.ceil(start + count));
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i <= i1; i++) { if (bars[i][3] < lo) lo = bars[i][3]; if (bars[i][2] > hi) hi = bars[i][2]; }
    if (lo === Infinity) return null;
    return margined(lo, hi);
  }
  function margined(lo, hi) {
    if (hi - lo < 1e-9) { hi += Math.abs(hi) * 0.001 || 1; lo -= Math.abs(lo) * 0.001 || 1; }
    const t = S.canvas.margins.top / 100, b = S.canvas.margins.bottom / 100;
    const span = (hi - lo) / Math.max(0.2, 1 - t - b);
    return { lo: lo - span * b, hi: hi + span * t };
  }

  /* the price scale is as wide as its widest label */
  const meter = document.createElement('canvas').getContext('2d');
  function axisWidth(lo, hi) {
    meter.font = `400 ${S.scales.textSize}px ${FONT}`;
    const texts = [fmt(hi), fmt(lo), fmt((hi + lo) / 2)];
    for (const tg of hooks.tags?.() || []) texts.push(fmt(tg.p));   // tags are colour and price only — no "TP" / "Entry" words widening the scale (Minato)
    const w = Math.max(...texts.map(s => meter.measureText(s).width));
    return Math.max(52, Math.ceil(w + 18));
  }

  function size() { return { W: plot.clientWidth, H: plot.clientHeight }; }
  function geom() {
    const { W, H } = size();
    const fs = S.scales.textSize, tH = Math.round(fs + 14);
    if (yr.auto && bars.length) {
      const aw0 = axisWidth(yr.lo, yr.hi), pw0 = Math.max(10, W - aw0);
      const r = candleRange(view.right - pw0 / view.spacing, pw0 / view.spacing);
      if (r) { yr.lo = r.lo; yr.hi = r.hi; }
    }
    const aw = axisWidth(yr.lo, yr.hi);
    const pw = Math.max(10, W - aw), bot = Math.max(10, H - tH);
    /* indicator panes (the RSI…) under the candles, above the time scale */
    const subs = (hooks.panes?.() || []).filter(q => !q.hidden?.());
    let ph = bot;
    const panes = [];
    if (subs.length) {
      const hs = subs.map(q => Math.max(q.min || 60, Math.round(bot * (q.ratio || 0.25))));
      const total = hs.reduce((a, h) => a + h + 1, 0);
      ph = Math.max(40, bot - total);
      let y = ph + 1;
      subs.forEach((q, k) => { panes.push({ q, top: y, h: hs[k] - (k === subs.length - 1 ? Math.max(0, y + hs[k] - bot) : 0) }); y += hs[k] + 1; });
    }
    const spacing = view.spacing, count = pw / spacing, start = view.right - count;
    const last = limit();
    const i0 = Math.max(0, Math.floor(start)), i1 = Math.min(last, Math.ceil(start + count));
    const lo = yr.lo, hi = yr.hi;
    return { W, H, pw, ph, bot, panes, aw, tH, fs, spacing, bw: spacing, count, start, last, i0, i1, lo, hi,
      replayT: last >= 0 && last < bars.length - 1 ? bars[last][0] + tf * 60 : Infinity,
      xI: i => (i - start + 0.5) * spacing, xT: T => (idxAt(T) - start) * spacing,
      iX: x => start + x / spacing, tX: x => timeAtIdx(start + x / spacing),
      Y: p => (hi - p) / (hi - lo) * ph, P: y => hi - y / ph * (hi - lo) };
  }
  /* the line above an indicator pane: drag it to make the pane taller or shorter */
  let divider = null;
  const dividerAt = (x, y, G) => G.panes.findIndex(P => P.q.resize && Math.abs(y - (P.top - 0.5)) <= 4);
  const paneShare = (dv, clientY) => Math.max(0.06, Math.min(0.75, (dv.h - (clientY - dv.y)) / Math.max(1, dv.bot)));
  const zoneOf = (x, y, G) => (y >= G.bot ? (x < G.pw ? 'time' : 'corner') : y >= G.ph ? (x < G.pw ? 'sub' : 'subscale') : x >= G.pw ? 'price' : 'pane');

  /* ---------- moving ---------- */
  function clamp(pw = geom().pw) {
    const n = Math.max(1, bars.length);
    const minS = Math.max(MIN_SPACING, pw / Math.max(60, n * 1.3)), maxS = Math.min(MAX_SPACING, pw / 8);
    view.spacing = Math.min(Math.max(view.spacing, minS), Math.max(minS, maxS));
    const count = pw / view.spacing;
    const start = Math.min(Math.max(view.right - count, -count * 0.8), n - count * 0.2);
    view.right = start + count;
  }
  /** Show bars `start` … `start + count` across the chart. */
  function setView(start, count) {
    if (!plot.clientWidth) { pending = { start, count }; return; }
    pending = null;
    const pw = geom().pw;
    view.spacing = pw / Math.max(1e-6, count);
    view.right = start + count;
    clamp(pw);
  }
  function getView() {
    if (pending) return { start: pending.start, count: pending.count, spacing: NaN };
    const G = geom();
    return { start: G.start, count: G.count, spacing: G.spacing };
  }
  /** The newest candle near the right edge, TradingView's right margin of empty bars after it. */
  function toLatest() {
    const G = geom();
    view.right = limit() + 1 + S.canvas.margins.right;
    clamp(G.pw);
  }
  function setAuto(on) { yr.auto = on; paintCorner(); draw(); }
  const fixScale = G => { if (yr.auto) { yr.auto = false; yr.lo = G.lo; yr.hi = G.hi; paintCorner(); } };
  function fitPrices(levels = []) {
    const G = geom();
    const r = candleRange(G.start, G.count) || allRange();
    if (!r) return;
    yr.auto = false;
    const ls = levels.filter(Number.isFinite);
    const u = ls.some(p => p < r.lo || p > r.hi) ? margined(Math.min(r.lo, ...ls), Math.max(r.hi, ...ls)) : r;
    yr.lo = u.lo; yr.hi = u.hi;
    paintCorner();
  }
  function allRange() {
    if (!bars.length) return null;
    let lo = Infinity, hi = -Infinity;
    for (const b of bars) { if (b[3] < lo) lo = b[3]; if (b[2] > hi) hi = b[2]; }
    return margined(lo, hi);
  }
  /** New candles (another timeframe, or more of the month): the same moments stay where they were. */
  function setBars(next, newTf = tf) {
    const G = geom();
    const tA = timeAtIdx(G.start), tZ = timeAtIdx(G.start + G.count);
    bars = next; tf = newTf;
    if (bars.length) {
      const a = idxAt(tA), z = idxAt(tZ);
      view.spacing = G.pw / Math.max(1, z - a);
      view.right = z;
      clamp(G.pw);
    }
    paintStatus(true); draw();
  }

  /* ---------- the pointer ---------- */
  const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', e => {
    focused = true;
    if (e.button !== 0) return;
    closeMenus();
    const { x, y } = local(e), G = geom(), zone = zoneOf(x, y, G);
    const dk = dividerAt(x, y, G);
    if (dk >= 0) { divider = { k: dk, y: e.clientY, h: G.panes[dk].h, bot: G.bot, q: G.panes[dk].q }; canvas.setPointerCapture(e.pointerId); return; }
    const claim = zone === 'pane' ? hooks.claim?.(x, y, G, e) || null : null;
    if (claim?.capture) {
      grab = claim; canvas.setPointerCapture(e.pointerId);
      if (claim.cursor) { plot.dataset.cursor = claim.cursor; plot.classList.remove('is-hot'); }
      return;
    }
    drag = { zone, x: e.clientX, y: e.clientY, lx: x, right: view.right, spacing: view.spacing, lo: G.lo, hi: G.hi, ph: G.ph, pw: G.pw,
      moved: false, vertical: false, claim };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    const { x, y } = local(e);
    hover = { x, y, shift: e.shiftKey };
    const G = geom();
    if (grab) { grab.move?.(x, y, G, e); draw(); return; }
    if (divider) { divider.r = paneShare(divider, e.clientY); divider.q.resize?.(divider.r, false); draw(); return; }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) {
        plot.classList.add('is-panning');
        if (drag.zone === 'pane' || drag.zone === 'sub') {
          view.right = drag.right - dx / drag.spacing; clamp(G.pw);
          if (Math.abs(dx) > 3) hooks.onPan?.();
          if (drag.zone === 'pane' && (Math.abs(dy) > 6 || drag.vertical)) {
            if (!drag.vertical) { drag.vertical = true; fixScale(G); drag.lo = yr.lo; drag.hi = yr.hi; drag.y = e.clientY; }
            const shift = (e.clientY - drag.y) / drag.ph * (drag.hi - drag.lo);
            yr.lo = drag.lo + shift; yr.hi = drag.hi + shift;
          }
        } else if (drag.zone === 'price') {
          fixScale(G);
          const k = Math.exp(dy * 0.006), mid = (drag.lo + drag.hi) / 2, half = (drag.hi - drag.lo) / 2 * k;
          yr.lo = mid - half; yr.hi = mid + half;
        } else if (drag.zone === 'time') {
          /* TradingView's way: the right edge stays, and the time you grabbed follows the pointer —
             to the left spreads the candles out, to the right squeezes them in */
          const d0 = Math.max(1, drag.pw - drag.lx), d1 = Math.max(1, Math.min(drag.pw, drag.pw - drag.lx - dx));
          view.spacing = drag.spacing * d1 / d0;
          view.right = drag.right; clamp(G.pw);
          view.right = drag.right;
        }
      }
    } else {
      const zone = zoneOf(x, y, G);
      plot.classList.toggle('on-price', zone === 'price');
      plot.classList.toggle('on-time', zone === 'time');
      plot.classList.toggle('on-divider', dividerAt(x, y, G) >= 0);
      const cur = zone === 'pane' ? hooks.hover?.(x, y, G, e) : null;
      plot.classList.toggle('is-hot', cur === 'pointer');
      plot.dataset.cursor = cur || '';
    }
    draw();
  });
  const up = e => {
    const { x, y } = local(e);
    if (divider) { const dv = divider; divider = null; if (dv.r != null) dv.q.resize?.(dv.r, true); draw(); return; }
    if (grab) { const g = grab; grab = null; g.up?.(x, y, geom(), e); draw(); return; }
    if (drag && !drag.moved && drag.claim?.click) drag.claim.click(x, y, geom(), e);
    drag = null; plot.classList.remove('is-panning');
    draw();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => { if (divider) { divider.q.resize?.(null, false); divider = null; } grab?.cancel?.(); grab = null; drag = null; plot.classList.remove('is-panning'); draw(); });
  canvas.addEventListener('pointerenter', () => { over = true; });
  canvas.addEventListener('pointerleave', () => {
    over = false;
    if (!drag && !grab && !divider) { hover = null; plot.classList.remove('on-price', 'on-time', 'on-divider', 'is-hot'); plot.dataset.cursor = ''; hooks.leave?.(); draw(); }
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const { x, y } = local(e), G = geom();
    if (zoneOf(x, y, G) === 'price') {
      fixScale(G);
      const k = Math.exp(e.deltaY * 0.0015), p = G.P(y);
      yr.lo = p - (p - G.lo) * k; yr.hi = p + (G.hi - p) * k;
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
      view.right += (e.deltaX || e.deltaY) / view.spacing;
      hooks.onPan?.();
      clamp(G.pw);
    } else {
      const f = Math.min(G.pw, Math.max(0, x));
      const anchor = G.start + f / view.spacing;
      view.spacing *= Math.exp(-e.deltaY * 0.0015);
      clamp(G.pw);
      view.right = anchor - f / view.spacing + G.pw / view.spacing;
      clamp(G.pw);
    }
    draw();
  }, { passive: false });
  canvas.addEventListener('dblclick', e => {
    const { x, y } = local(e), G = geom(), zone = zoneOf(x, y, G);
    if (zone === 'price') { setAuto(true); return; }
    if (zone === 'time') { (hooks.onTimeReset || reset)(); draw(); return; }
    if (zone === 'pane') hooks.dbl?.(x, y, G, e);
  });
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    focused = true;
    const { x, y } = local(e), G = geom();
    const price = y < G.ph ? G.P(y) : NaN;
    const items = [
      { label: 'Reset chart view', hint: 'Alt + R', icon: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5', act: reset, cls: 'tv-m-reset' },
      Number.isFinite(price) ? { label: `Copy price ${fmt(price)}`, icon: 'M8 8h11v11H8zM5 16V5h11', act: () => navigator.clipboard?.writeText(fmt(price)).catch(() => {}), cls: 'tv-m-copy' } : null,
      ...(hooks.menu?.({ x, y, price, time: G.tX(x), G }) || []),
      { sep: true },
      { label: 'Settings…', icon: 'M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM12 3l1.6 2.3 2.7-.6.6 2.7L19.2 9 18.5 12l.7 3-2.3 1.6-.6 2.7-2.7-.6L12 21l-1.6-2.3-2.7.6-.6-2.7L4.8 15l.7-3-.7-3 2.3-1.6.6-2.7 2.7.6z', act: settings, cls: 'tv-m-settings' },
    ];
    openMenu(items.filter(Boolean), e.clientX, e.clientY);
  });
  const offPress = e => { if (!plot.isConnected && seen) { document.removeEventListener('pointerdown', offPress, true); return; } focused = plot.contains(e.target); };
  document.addEventListener('pointerdown', offPress, true);

  function reset() { if (hooks.onReset) hooks.onReset(); else { toLatest(); fitPrices(); } draw(); }
  function settings() { openChartSettings(store, { inst: o.inst, trading: !!o.trading }); }

  /* ---------- the keyboard: Change interval, Alt+R ---------- */
  const onKey = e => {
    if (!plot.isConnected) { if (seen) document.removeEventListener('keydown', onKey); return; }
    if (!(over || focused)) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || document.querySelector('.tv-dialog')) return;
    if (e.altKey && (e.code === 'KeyR' || e.key === 'r' || e.key === 'R')) { e.preventDefault(); reset(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (hooks.onInterval && /^[0-9dD]$/.test(e.key)) {
      e.preventDefault();
      focused = true;                 // the box opens under the pointer: keep listening after it closes
      intervalBox(plot, e.key, m => hooks.onInterval(m), CHART_TFS.map(([, m]) => m));
    }
  };
  document.addEventListener('keydown', onKey);

  /* ---------- painting ---------- */
  function draw() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; paint(); });
  }
  function palette() {
    const cs = getComputedStyle(plot), v = n => cs.getPropertyValue(n).trim();
    const C = {
      ink: v('--ink') || '#ddd', ink2: v('--ink-2'), ink3: v('--ink-3') || '#999', ink4: v('--ink-4'), ink5: v('--ink-5'),
      card: v('--card') || '#111', profit: v('--profit') || '#18AC65', loss: v('--loss') || '#F4624A', yellow: v('--yellow') || '#FFB800',
      prgb: v('--profit-rgb'), lrgb: v('--loss-rgb'), yrgb: v('--yellow-rgb') || '255, 184, 0',
      mono: v('--mono') || 'monospace', font: FONT = (v('--mono') || TV_FONT),
      line: withAlpha(v('--ink') || '#888', 0.1), label: solid(v('--inset-2')) || '#2B2F2E', labelInk: v('--ink') || '#FFFFFF',
      flat: v('--flat') || '#787878',
    };
    const k = S.candles;
    const pick = part => (k.mode === 'custom' ? k[part] : { on: true, up: C.profit, down: C.loss });
    C.body = pick('body'); C.border = pick('border'); C.wick = pick('wick');
    C.up = k.mode === 'custom' ? (k.body.on ? k.body.up : k.border.up) : C.profit;
    C.down = k.mode === 'custom' ? (k.body.on ? k.body.down : k.border.down) : C.loss;
    return C;
  }
  function paint() {
    if (pending && plot.clientWidth) { const p = pending; setView(p.start, p.count); }
    const G = geom();
    const { W, H, pw, ph, aw, tH, fs, last, i0, i1, lo, hi, xI, Y } = G;
    if (!W || !H) return;
    seen = true;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const C = palette();
    const font = (px = fs, wt = 400) => `${wt} ${px}px ${FONT}`;

    /* the canvas: Quire's own (the card shows through), or a colour */
    if (S.canvas.bg === 'solid') { g.fillStyle = S.canvas.bgColor; g.fillRect(0, 0, W, H); }
    else if (S.canvas.bg === 'gradient') {
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, S.canvas.bgColor); gr.addColorStop(1, S.canvas.bgColor2);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }

    const ticks = niceTicks(lo, hi, Math.max(2, Math.round(ph / (fs * 3.4))));
    const marks = timeMarks(G, C);
    lastMarks = marks;

    g.save();
    g.beginPath(); g.rect(0, 0, pw, ph); g.clip();
    /* grid */
    const gd = S.canvas.grid;
    if (gd.vert || gd.horz) {
      g.strokeStyle = gd.color; g.lineWidth = 1;
      g.beginPath();
      if (gd.horz) for (const p of ticks) { const y = Math.round(Y(p)) + 0.5; g.moveTo(0, y); g.lineTo(pw, y); }
      if (gd.vert) for (const m of marks) { const x = Math.round(m.x) + 0.5; g.moveTo(x, 0); g.lineTo(x, ph); }
      g.stroke();
    }
    hooks.back?.(g, G, C);
    candles(g, G, C, dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* the last price */
    const lastBar = last >= 0 ? bars[last] : null;
    const lastCol = lastBar ? (lastBar[4] >= lastBar[1] ? C.up : C.down) : C.ink;
    if (lastBar && S.scales.lastLine) {
      const y = Math.round(Y(lastBar[4])) + 0.5;
      g.strokeStyle = lastCol; g.lineWidth = 1; g.setLineDash([1, 2]);
      g.beginPath(); g.moveTo(0, y); g.lineTo(pw, y); g.stroke(); g.setLineDash([]);
    }
    hooks.front?.(g, G, C);
    g.restore();

    /* the scales' edges */
    g.fillStyle = C.line;
    g.fillRect(Math.round(pw), 0, 1, H);
    g.fillRect(0, Math.round(G.bot), W, 1);
    for (const P of G.panes) g.fillRect(0, Math.round(P.top) - 1, W, 1);
    const areas = paintPanes(g, G, C, font);

    /* prices down the right: round steps, then the tags over them */
    const tags = (hooks.tags?.() || []).map(t => ({ ...t, fg: t.fg || C.labelInk }));
    if (lastBar && S.scales.lastLabel) tags.push({ p: lastBar[4], label: '', bg: lastCol, fg: inkOn(lastCol), last: true });
    const tagH = fs + 7;
    const tagYs = spread(tags.map(t => Math.min(ph - tagH / 2, Math.max(tagH / 2, Y(t.p)))), tagH + 1, tagH / 2, ph - tagH / 2);
    g.font = font(); g.textBaseline = 'middle';
    g.fillStyle = C.ink3;
    for (const p of ticks) {
      const y = Y(p);
      if (y < fs / 2 + 2 || y > ph - fs / 2 - 2 || tagYs.some(ty => Math.abs(ty - y) < tagH)) continue;
      g.textAlign = 'left'; g.fillText(fmt(p), pw + 9, y);
    }
    g.textAlign = 'left';
    tags.forEach((t, k) => {
      const y = tagYs[k];
      g.fillStyle = t.bg; roundRect(g, pw + 1, y - tagH / 2, aw - 2, tagH, 2); g.fill();
      g.fillStyle = t.fg;
      g.font = font();
      g.fillText(fmt(t.p), pw + 9, y + 0.5);
    });

    /* the time scale */
    g.textBaseline = 'middle'; g.textAlign = 'center';
    for (const m of marks) {
      g.font = font(fs, m.bold ? 600 : 400);
      g.fillStyle = m.bold ? C.ink2 || C.ink : C.ink3;
      g.fillText(m.text, m.x, G.bot + tH / 2 + 0.5);
    }
    g.textAlign = 'left';

    /* the crosshair */
    let hoverBar = null;
    if (hover && !grab && !(drag && drag.moved) && hover.x < pw && hover.y < G.bot && hover.x >= 0 && hover.y >= 0) {
      const i = Math.floor(G.iX(hover.x));
      const x = Math.round(xI(i)) + 0.5, y = Math.round(hover.y) + 0.5;
      const ch = S.canvas.cross;
      /* the line down crosses every pane; the line across, and its value, only the pane it is in */
      const inSub = areas.find(A => hover.y >= A.top && hover.y < A.top + A.h);
      g.save();
      g.beginPath(); g.rect(0, 0, pw, G.bot); g.clip();
      g.strokeStyle = ch.color; g.lineWidth = ch.width;
      g.setLineDash(ch.style === 'dotted' ? [1, 3] : ch.style === 'dashed' ? [5, 4] : []);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, G.bot); g.moveTo(0, y); g.lineTo(pw, y); g.stroke();
      g.restore();
      g.setLineDash([]);
      g.font = font(); g.textBaseline = 'middle';
      if (hover.y < ph || inSub) {
        g.fillStyle = C.label; roundRect(g, pw + 1, y - tagH / 2, aw - 2, tagH, 2); g.fill();
        g.fillStyle = C.labelInk; g.fillText(inSub ? (inSub.q.fmt || fmt)(inSub.P(hover.y)) : fmt(G.P(hover.y)), pw + 9, y + 0.5);
      }
      const T = timeAtIdx(i);
      const tl = crossTime(T);
      const tw = g.measureText(tl).width + 16, tx = Math.min(pw - tw, Math.max(0, x - tw / 2));
      g.fillStyle = C.label; roundRect(g, tx, G.bot + 2, tw, tH - 4, 2); g.fill();
      g.fillStyle = C.labelInk; g.textAlign = 'center'; g.fillText(tl, tx + tw / 2, G.bot + tH / 2 + 0.5); g.textAlign = 'left';
      if (i >= 0 && i <= last) hoverBar = i;
    }
    const shownLegends = new Set();
    for (const A of areas) {
      const lg = A.q.legend?.(hoverBar);
      if (lg) { if (lg.parentNode !== plot) plot.append(lg); lg.style.top = (A.top + 4) + 'px'; lg.hidden = false; shownLegends.add(lg); }
    }
    for (const lg of plot.querySelectorAll(':scope > .tv-plegend')) if (!shownLegends.has(lg)) lg.hidden = true;
    paintStatus(false, hoverBar ?? last, C);

    /* the corner: auto */
    autoBtn.style.width = aw + 'px'; autoBtn.style.height = tH + 'px';
  }

  /* each indicator pane: its own scale on the right, clipped to its strip */
  function paintPanes(g, G, C, font) {
    const out = [];
    const fs = S.scales.textSize, tagH = fs + 7;
    for (const { q, top, h } of G.panes) {
      if (h < 10) continue;
      const r = q.range(G.i0, Math.max(G.i0, G.i1));
      const A = { q, top, h, lo: r.lo, hi: r.hi, Y: v => top + (r.hi - v) / (r.hi - r.lo) * h, P: y => r.hi - (y - top) / h * (r.hi - r.lo) };
      g.save();
      g.beginPath(); g.rect(0, top, G.pw, h); g.clip();
      q.paint(g, G, A, C);
      g.restore();
      const f = q.fmt || fmt;
      const tags = (q.tags?.(A) || []).map(t => ({ ...t, y: Math.min(top + h - tagH / 2, Math.max(top + tagH / 2, A.Y(t.p))) }));
      const ys = spread(tags.map(t => t.y), tagH + 1, top + tagH / 2, top + h - tagH / 2);
      g.font = font(); g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = C.ink3;
      for (const v of q.ticks?.(A) || niceTicks(r.lo, r.hi, 3)) {
        const y = A.Y(v);
        if (y < top + fs / 2 + 2 || y > top + h - fs / 2 - 2 || ys.some(ty => Math.abs(ty - y) < tagH)) continue;
        g.fillText(f(v), G.pw + 9, y);
      }
      tags.forEach((t, k) => {
        g.fillStyle = t.bg; roundRect(g, G.pw + 1, ys[k] - tagH / 2, G.aw - 2, tagH, 2); g.fill();
        g.fillStyle = t.fg || '#FFFFFF'; g.fillText(f(t.p), G.pw + 9, ys[k] + 0.5);
      });
      out.push(A);
    }
    lastAreas = out;
    return out;
  }

  function candles(g, G, C, k) {
    const { i0, i1, xI, Y } = G;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const wickW = Math.max(1, Math.floor(k));
    let bodyW = bodyWidth(G.spacing, k);
    if (bodyW > wickW && (bodyW - wickW) % 2) bodyW -= 1;
    const border = C.border.on && bodyW > 2 * wickW + 1 ? Math.max(1, Math.floor(k)) : 0;
    for (let i = i0; i <= i1; i++) {
      const [, o, h, l, c] = bars[i];
      const up = c >= o, side = up ? 'up' : 'down';
      const cx = Math.round(xI(i) * k);
      const yH = Math.round(Y(h) * k), yL = Math.round(Y(l) * k);
      const yO = Math.round(Y(o) * k), yC = Math.round(Y(c) * k);
      const top = Math.min(yO, yC), hgt = Math.max(1, Math.abs(yO - yC));
      if (C.wick.on) {
        g.fillStyle = C.wick[side];
        const wx = cx - Math.floor(wickW / 2);
        if (border && !C.body.on && hgt > 2 * border) { g.fillRect(wx, yH, wickW, Math.max(0, top - yH)); g.fillRect(wx, top + hgt, wickW, Math.max(0, yL - top - hgt)); }
        else g.fillRect(wx, yH, wickW, Math.max(1, yL - yH));
      }
      const left = cx - Math.floor(bodyW / 2);
      if (border) {
        g.fillStyle = C.border[side];
        if (!C.body.on && hgt > 2 * border) {
          /* hollow: just the four sides, so the background stays behind it (no hole punched through) */
          g.fillRect(left, top, bodyW, border); g.fillRect(left, top + hgt - border, bodyW, border);
          g.fillRect(left, top, border, hgt); g.fillRect(left + bodyW - border, top, border, hgt);
        } else g.fillRect(left, top, bodyW, hgt);
        if (C.body.on && hgt > 2 * border) { g.fillStyle = C.body[side]; g.fillRect(left + border, top + border, bodyW - 2 * border, hgt - 2 * border); }
      } else if (C.body.on || C.border.on) {
        g.fillStyle = (C.body.on ? C.body : C.border)[side]; g.fillRect(left, top, bodyW, hgt);
      }
    }
  }

  /* the time scale's labels: the roundest moments first, none crowding another */
  function timeMarks(G) {
    const { i0, xI, pw, fs } = G;
    const tz = S.timezone;
    const iEnd = Math.min(bars.length - 1, Math.ceil(G.start + G.count));
    const cands = [];
    let prev = null;
    for (let i = Math.max(0, i0 - 1); i <= iEnd; i++) {
      const T = bars[i][0];
      const d = tf >= 1440 ? new Date(Date.parse(cd.tradingDayOf(T) + 'T00:00:00Z')) : wall(tz, T);
      if (prev && i >= i0) {
        let w = 0, text = '';
        if (d.getUTCFullYear() !== prev.getUTCFullYear()) { w = 70; text = String(d.getUTCFullYear()); }
        else if (d.getUTCMonth() !== prev.getUTCMonth()) { w = 60; text = MONTHS[d.getUTCMonth()]; }
        else if (d.getUTCDate() !== prev.getUTCDate()) { w = 50; text = String(d.getUTCDate()); }
        else if (tf < 1440) {
          const h = d.getUTCHours(), m = d.getUTCMinutes();
          if (h !== prev.getUTCHours()) w = 30 + (h % 12 === 0 ? 4 : h % 6 === 0 ? 3 : h % 3 === 0 ? 2 : 1);
          else w = m % 30 === 0 ? 23 : m % 15 === 0 ? 22 : m % 5 === 0 ? 21 : 20;
          text = `${pad2(h)}:${pad2(m)}`;
        }
        if (w) { const x = xI(i) - (tf >= 1440 ? 0 : G.spacing / 2); if (x >= 0 && x <= pw) cands.push({ x, w, text, bold: w >= 50 }); }
      }
      prev = d;
    }
    meter.font = `600 ${fs}px ${FONT}`;
    const gap = meter.measureText('00:00').width + Math.max(18, fs * 1.8);
    /* the finest kind of label there is room for, evenly: below it, none at all —
       so a stray 20:51 never squeezes in at an edge */
    let minW = 0;
    for (const w of [...new Set(cands.map(c => c.w))].sort((a, b) => a - b)) {
      const n = cands.filter(c => c.w >= w).length;
      if (n <= 1 || pw / n >= gap) { minW = w; break; }
      minW = w;
    }
    cands.sort((a, b) => b.w - a.w || a.x - b.x);
    const kept = [];
    for (const c of cands) {
      if (c.w < minW && c.w < 50) continue;
      if (c.x < gap / 3 || c.x > pw - gap / 3) continue;
      if (kept.some(k => Math.abs(k.x - c.x) < gap)) continue;
      kept.push(c);
    }
    return kept.sort((a, b) => a.x - b.x);
  }
  function crossTime(T) {
    if (tf >= 1440) { const d = new Date(Date.parse(cd.tradingDayOf(T) + 'T12:00:00Z')); return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`; }
    const d = wall(S.timezone, T);
    return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}  ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  }

  /* ---------- the status line ---------- */
  function paintStatus(force, i = limit(), C = null) {
    const st = S.status;
    const b = i >= 0 ? bars[i] : null, p = i > 0 ? bars[i - 1] : null;
    const key = [i, b?.[4], st.symbol, st.ohlc, st.change, tf, dp(), S.candles.mode].join('|');
    if (!force && key === lastStatus) return;
    lastStatus = key;
    C = C || palette();
    const parts = [];
    if (st.symbol) parts.push(el('span', { class: 'tv-sym' }, [o.symbol, tfLabel(tf), o.source].filter(Boolean).join(' · ')));
    if (b && (st.ohlc || st.change)) {
      const col = b[4] >= b[1] ? C.up : C.down;
      const vals = el('span', { class: 'tv-ohlc', style: { '--c': col } });
      if (st.ohlc) for (const [k, v] of [['O', b[1]], ['H', b[2]], ['L', b[3]], ['C', b[4]]]) vals.append(el('i', {}, k), el('b', {}, fmt(v)));
      if (st.change && p) {
        const ch = b[4] - p[4], pc = p[4] ? ch / p[4] * 100 : 0;
        vals.append(el('b', { class: 'tv-chg' }, `${ch >= 0 ? '+' : '−'}${fmt(Math.abs(ch))} (${ch >= 0 ? '+' : '−'}${Math.abs(pc).toFixed(2)}%)`));
      }
      parts.push(vals);
    }
    status.replaceChildren(...parts);
    status.style.fontSize = S.scales.textSize + 'px';
  }
  function paintCorner() { autoBtn.classList.toggle('is-on', yr.auto); }

  new ResizeObserver(() => draw()).observe(plot);
  paintCorner();

  return {
    canvas, status, autoBtn, geom, draw, idxAt, timeAtIdx, fmt, dp, setView, getView, toLatest, fitPrices, setAuto, setBars, clamp, reset,
    openSettings: settings, zoneOf, yr, palette,
    get bars() { return bars; }, get tf() { return tf; }, get hover() { return hover; }, get dragging() { return !!(drag?.moved || grab); },
    get over() { return over; }, get focused() { return focused; }, get settings() { return S; }, limit, statusText: () => status.textContent,
    marks: () => lastMarks.map(m => m.text), crossTime, areas: () => lastAreas.map(A => ({ key: A.q.key, top: A.top, h: A.h, lo: A.lo, hi: A.hi })),
  };
}

/* ---------- small pieces, shared with what draws on the chart ---------- */
/** TradingView's candle body: 3px between 2.5 and 4px spacing, a little under the spacing otherwise. */
export function bodyWidth(spacing, k = 1) {
  if (spacing >= 2.5 && spacing <= 4) return Math.floor(3 * k);
  const coeff = 1 - 0.2 * Math.atan(Math.max(4, spacing) - 4) / (Math.PI * 0.5);
  return Math.max(Math.floor(k), Math.min(Math.floor(spacing * coeff * k), Math.floor(spacing * k)));
}

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

/** A colour only if it is opaque — glass themes make the insets see-through. */
const solid = c => (/^#[0-9a-f]{6}$/i.test(c) ? c : null);

/** Text that reads on a background: dark on light colours (a white candle), white on the rest. */
export function inkOn(colour) {
  const c = String(colour || '').trim();
  let r, g, b, m;
  if ((m = c.match(/^#([0-9a-f]{6})/i))) { const n = parseInt(m[1], 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
  else if ((m = c.match(/^#([0-9a-f]{3})$/i))) [r, g, b] = m[1].split('').map(h => parseInt(h + h, 16));
  else if ((m = c.match(/^rgba?\(([^)]+)\)$/))) [r, g, b] = m[1].split(',').map(Number);
  else return '#FFFFFF';
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.4 ? '#131722' : '#FFFFFF';
}

export function withAlpha(colour, a) {
  const c = String(colour).trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; }
  m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) { const [r, g, b] = m[1].split('').map(h => parseInt(h + h, 16)); return `rgba(${r}, ${g}, ${b}, ${a})`; }
  m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) { const [r, g, b] = m[1].split(',').map(s => s.trim()); return `rgba(${r}, ${g}, ${b}, ${a})`; }
  return c;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

/** A thin TradingView-style outline icon from one path. */
export function svgIcon(d, size = 18) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.3');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d);
  s.append(p);
  return s;
}
export { parseInterval };
