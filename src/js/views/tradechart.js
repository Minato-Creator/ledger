/* ============================================================
   tradechart.js — the trade, on the day's chart.

   For looking only. The candles are OANDA's, which are never quite your
   broker's, so nothing here feeds a number anywhere else in the journal.

   What is drawn, and nothing more: the candles, green and red; the killzones
   from the Playbook, shaded with their names along the top; red-folder news
   for the instrument's currencies; the position as two boxes — green from
   entry to target, red from entry to stop — between the time you got in and
   the time you got out; and dotted lines for In, TP and SL. A trade closed by
   hand keeps its original target box and gets one more dotted line where you
   got out; a break-even gets one at BE.

   Drag to move, scroll to zoom, double-click to go back to the trade. The
   timeframes are all built from the same one-minute candles.
   ============================================================ */
import { el, icon } from '../ui.js';
import * as cd from '../candles.js';

export const CHART_TFS = [['1m', 1], ['5m', 5], ['15m', 15], ['1H', 60]];
const TF_KEY = 'quire:chartTf';
const DAY = 86400;

/* The plot's margins: names along the top, times along the bottom, prices
   and tags down the right. */
const PAD_T = 24, PAD_B = 22, AXIS_W = 84;

export function tradeChart(store, nav, t, now = Date.now() / 1000) {
  const inst = cd.oandaInstrument(t.pair);
  const card = el('section', { class: 'card tc', style: { flex: 'none' } });

  const title = el('h3', {}, t.pair || 'Chart', el('span', { class: 'tc-sub' }, inst ? 'OANDA · mid' : ''));
  const headOnly = (...right) => el('div', { class: 'tc-head' }, title, el('div', { class: 'spacer' }), ...right);

  const message = (text, ...actions) => {
    card.classList.add('is-quiet');
    card.replaceChildren(headOnly(), el('div', { class: 'tc-msg' }, el('span', {}, text), ...actions));
  };

  async function start() {
    if (!inst) return message(`No chart for ${t.pair || 'this trade'} — OANDA has no instrument that matches it.`);
    const cred = await cd.getKey();
    if (!cred) return message('Add your OANDA key in Settings to see this trade on the day’s chart.',
      el('button', { class: 'tc-btn', onClick: () => nav.go('#/settings') }, 'Open Settings'));
    card.classList.remove('is-quiet');
    card.replaceChildren(headOnly(), el('div', { class: 'tc-plot is-loading' }, el('span', {}, 'Getting the day’s prices…')));
    let res;
    try { res = await cd.candlesFor(store, t, cred, now); }
    catch (e) {
      return message(cd.explain(e), el('button', { class: 'tc-btn', onClick: start }, 'Try again'));
    }
    if (!res.rows.length) return message('OANDA has no prices around this trade — the market may have been closed.');
    card.classList.remove('is-quiet');
    chart(res);
  }

  /* ---------------- the chart itself ---------------- */
  function chart(res) {
    const dp = cd.decimalsOf(inst);
    const num = v => (v == null || v === '' ? NaN : Number(v));
    const entry = num(t.entryPrice), sl = num(t.stopLoss), tp = num(t.takeProfit), exitP = num(t.exitPrice);
    const closed = t.status !== 'open';
    const timed = !!t.timeOpen;
    const eps = Math.abs(entry || 1) * 1e-6;
    const same = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;
    const exitLine = exitLineOf();
    function exitLineOf() {
      if (!closed || !Number.isFinite(exitP)) return null;
      if (same(exitP, tp) || same(exitP, sl)) return null;
      const be = t.exitReason === 'be' || same(exitP, entry);
      if (be && same(exitP, entry)) return { atEntry: true };
      return { price: exitP, label: be ? 'BE' : 'Out', kind: be ? 'be' : 'out' };
    }
    const curs = cd.currenciesOf(inst);
    const news = (store.data.news?.events || [])
      .filter(ev => ev.impact === 'High' && curs.includes(ev.country))
      .map(ev => ({ at: Date.parse(ev.at) / 1000, title: ev.title }))
      .filter(ev => Number.isFinite(ev.at) && ev.at >= res.rows[0][0] - DAY && ev.at <= res.rows[res.rows.length - 1][0] + DAY);
    const sessions = store.playbook?.sessions || [];

    let tf = firstTf();
    let bars = cd.aggregate(res.rows, tf);
    const view = { start: 0, count: 60 };
    let hover = null, drag = null, upto = null, timer = null, raf = 0;

    /* where a moment sits, in bars — gaps (weekends) take no room */
    function idxAt(T) {
      const n = bars.length, step = tf * 60;
      if (!n) return 0;
      if (T <= bars[0][0]) return (T - bars[0][0]) / step;
      let lo = 0, hi = n - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m][0] <= T) lo = m; else hi = m - 1; }
      return lo + Math.min(1, (T - bars[lo][0]) / step);
    }
    function fit() {
      const a = idxAt(res.entry), z = idxAt(timed ? res.exit : res.entry + 3600);
      const span = Math.max(1, z - a), pad = Math.max(span * 0.7, 24);
      view.count = Math.min(Math.max(span + pad * 2, 40), Math.max(40, bars.length + 10));
      view.start = (a + z) / 2 - view.count / 2;
      clamp();
    }
    function clamp() {
      const maxCount = Math.max(60, bars.length * 1.3);
      view.count = Math.min(Math.max(view.count, 12), maxCount);
      view.start = Math.min(Math.max(view.start, -view.count * 0.8), bars.length - view.count * 0.2);
    }
    function setTf(m) {
      if (m === tf) return;
      const mid = timeAtIdx(view.start + view.count / 2);
      const replayT = upto != null ? bars[upto][0] : null;
      const secs = view.count * tf;
      tf = m; bars = cd.aggregate(res.rows, tf);
      view.count = secs / tf;
      view.start = idxAt(mid) - view.count / 2;
      if (replayT != null) upto = Math.max(0, Math.floor(idxAt(replayT)));
      clamp();
      try { localStorage.setItem(TF_KEY, String(tf)); } catch { /* fine */ }
      paintSeg(); draw();
    }
    function timeAtIdx(i) {
      const n = bars.length, step = tf * 60;
      if (!n) return res.entry;
      if (i < 0) return bars[0][0] + i * step;
      if (i >= n) return bars[n - 1][0] + (i - n + 1) * step;
      const k = Math.floor(i);
      return bars[k][0] + (i - k) * step;
    }

    /* ---------- the controls ---------- */
    const seg = el('div', { class: 'seg tc-seg' });
    function paintSeg() {
      seg.replaceChildren(...CHART_TFS.map(([label, m]) =>
        el('button', { class: m === tf ? 'is-on' : '', 'data-tf': label, onClick: () => setTf(m) }, label)));
    }
    paintSeg();
    const playBtn = el('button', { class: 'tc-play', onClick: () => (timer ? stopReplay() : startReplay()) });
    function paintPlay() {
      playBtn.replaceChildren(el('i', { class: timer ? 'is-stop' : '' }), timer ? 'Stop' : 'Replay');
    }
    paintPlay();
    const resetBtn = el('button', { class: 'tc-reset', title: 'Back to the trade', onClick: () => { stopReplay(true); fit(); draw(); } },
      icon('refresh', 13, 'currentColor', 1.9));
    const sub = title.querySelector('.tc-sub');

    const canvas = el('canvas', { class: 'tc-canvas' });
    const plot = el('div', { class: 'tc-plot' }, canvas);
    card.replaceChildren(
      el('div', { class: 'tc-head' }, title, el('div', { class: 'spacer' }), seg, playBtn, resetBtn),
      plot,
      el('div', { class: 'tc-foot' },
        el('span', {}, 'for viewing only · prices can differ slightly from your broker’s'),
        el('span', {}, 'drag to move · scroll to zoom')));

    /* ---------- replay ---------- */
    function startReplay() {
      const a = Math.floor(idxAt(timed ? res.entry : bars[0][0]));
      upto = Math.max(1, a - Math.round(view.count * 0.35));
      view.start = upto - view.count * 0.65; clamp();
      timer = setInterval(stepReplay, 90);
      paintPlay(); draw();
    }
    function stepReplay() {
      if (!card.isConnected) return stopReplay(true);
      upto++;
      if (upto >= bars.length - 1) return stopReplay(true);
      if (upto > view.start + view.count * 0.85) view.start = upto - view.count * 0.85;
      draw();
    }
    function stopReplay(full) {
      if (timer) clearInterval(timer);
      timer = null;
      if (full !== false) upto = null;
      paintPlay(); draw();
    }

    /* ---------- the pointer ---------- */
    const geo = () => {
      const W = plot.clientWidth, H = plot.clientHeight;
      return { W, H, pw: Math.max(10, W - AXIS_W), ph: Math.max(10, H - PAD_T - PAD_B) };
    };
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, start: view.start };
      canvas.setPointerCapture(e.pointerId);
      plot.classList.add('is-dragging');
    });
    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (drag) {
        const { pw } = geo();
        view.start = drag.start - (e.clientX - drag.x) / (pw / view.count);
        clamp();
      }
      draw();
    });
    const endDrag = () => { drag = null; plot.classList.remove('is-dragging'); };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', () => { if (!drag) { hover = null; draw(); } });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const { pw } = geo();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        view.start += e.deltaX / (pw / view.count);
      } else {
        const r = canvas.getBoundingClientRect();
        const f = Math.min(1, Math.max(0, (e.clientX - r.left) / pw));
        const anchor = view.start + f * view.count;
        view.count *= Math.exp(e.deltaY * 0.0015);
        clamp();
        view.start = anchor - f * view.count;
      }
      clamp(); draw();
    }, { passive: false });
    canvas.addEventListener('dblclick', () => { stopReplay(true); fit(); draw(); });

    /* ---------- drawing ---------- */
    function draw() {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; paint(); });
    }
    function paint() {
      const { W, H, pw, ph } = geo();
      if (!W || !H) return;
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
        ink: v('--ink'), ink3: v('--ink-3'), ink4: v('--ink-4'), ink5: v('--ink-5'),
        inset: v('--inset') || 'rgba(128,128,128,.2)', card: v('--card'),
        profit: v('--profit'), loss: v('--loss'), yellow: v('--yellow'),
        prgb: v('--profit-rgb'), lrgb: v('--loss-rgb'), yrgb: v('--yellow-rgb') || '255, 184, 0',
        mono: v('--mono') || 'monospace',
      };
      const font = px => `400 ${px}px ${C.mono}`;
      const last = upto != null ? upto : bars.length - 1;
      const bw = pw / view.count;
      const xI = i => (i - view.start + 0.5) * bw;          // a bar's middle
      const xT = T => (idxAt(T) - view.start) * bw;          // a moment
      const i0 = Math.max(0, Math.floor(view.start)), i1 = Math.min(last, Math.ceil(view.start + view.count));
      const replayT = upto != null ? bars[upto][0] + tf * 60 : Infinity;

      /* the price range: what is on screen, and the position when it is */
      let lo = Infinity, hi = -Infinity;
      for (let i = i0; i <= i1; i++) { if (bars[i][3] < lo) lo = bars[i][3]; if (bars[i][2] > hi) hi = bars[i][2]; }
      const ea = idxAt(res.entry), ez = idxAt(res.exit);
      const boxInView = timed && ez >= view.start && ea <= view.start + view.count;
      if (boxInView || lo === Infinity) {
        for (const p of [entry, sl, tp, exitLine?.price]) if (Number.isFinite(p)) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
      }
      if (lo === Infinity) { lo = 0; hi = 1; }
      if (hi - lo < 1e-9) { hi += Math.abs(hi) * 0.001 || 1; lo -= Math.abs(lo) * 0.001 || 1; }
      const padP = (hi - lo) * 0.07; lo -= padP; hi += padP;
      const Y = p => PAD_T + (hi - p) / (hi - lo) * ph;

      g.save();
      g.beginPath(); g.rect(0, 0, pw, H); g.clip();

      /* killzones */
      if (sessions.length && bars.length) {
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

      /* price grid */
      const ticks = niceTicks(lo, hi, Math.max(3, Math.round(ph / 55)));
      g.strokeStyle = withAlpha(C.ink, 0.05); g.lineWidth = 1;
      for (const p of ticks) { const y = Math.round(Y(p)) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(pw, y); g.stroke(); }

      /* the position */
      if (timed && Number.isFinite(entry)) {
        const end = Math.min(res.exit, replayT);
        const xa = xT(res.entry), xz = xT(end);
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
        const xr = Math.round(x);
        g.fillRect(xr, Y(h), 1, Math.max(1, Y(l) - Y(h)));
        const yt = Y(Math.max(o, c)), hgt = Math.max(1, Math.abs(Y(o) - Y(c)));
        g.fillRect(Math.round(x - body / 2), yt, Math.max(1, Math.round(body)), hgt);
      }

      /* red-folder news */
      g.font = font(9.5);
      for (const ev of news) {
        if (ev.at > replayT) continue;
        const x = Math.round(xT(ev.at)) + 0.5;
        if (x < 0 || x > pw) continue;
        g.strokeStyle = withAlpha(C.loss, 0.7); g.setLineDash([2, 3]);
        g.beginPath(); g.moveTo(x, PAD_T); g.lineTo(x, PAD_T + ph); g.stroke(); g.setLineDash([]);
        g.fillStyle = C.loss;
        g.fillRect(x - 4, PAD_T + 4, 8, 8);
        g.fillText(ev.title, x + 8, PAD_T + 12);
      }
      g.restore();

      /* dotted levels across, with their tags on the right */
      const levels = [];
      if (Number.isFinite(tp)) levels.push({ p: tp, label: 'TP', line: C.profit, tag: `rgba(${C.prgb}, .28)` });
      if (Number.isFinite(sl)) levels.push({ p: sl, label: 'SL', line: C.loss, tag: `rgba(${C.lrgb}, .28)` });
      if (Number.isFinite(entry)) levels.push({ p: entry, label: exitLine?.atEntry && res.exit <= replayT ? 'In · BE' : 'In', line: C.ink3, tag: C.inset });
      if (exitLine?.price != null && res.exit <= replayT) {
        levels.push(exitLine.kind === 'be'
          ? { p: exitLine.price, label: 'BE', line: C.ink3, tag: C.inset }
          : { p: exitLine.price, label: 'Out', line: C.yellow, tag: `rgba(${C.yrgb}, .28)` });
      }
      g.setLineDash([3, 4]); g.lineWidth = 1;
      for (const L of levels) {
        const y = Math.round(Y(L.p)) + 0.5;
        if (y < PAD_T || y > PAD_T + ph) continue;
        g.strokeStyle = L.line; g.beginPath(); g.moveTo(0, y); g.lineTo(pw, y); g.stroke();
      }
      g.setLineDash([]);

      /* the price axis, leaving room for the tags */
      const tagYs = spread(levels.map(L => Math.min(PAD_T + ph - 8, Math.max(PAD_T + 8, Y(L.p)))), 17, PAD_T + 8, PAD_T + ph - 8);
      g.font = font(9.5); g.textBaseline = 'middle'; g.fillStyle = C.ink5;
      for (const p of ticks) {
        const y = Y(p);
        if (y < PAD_T + 4 || y > PAD_T + ph - 4 || tagYs.some(ty => Math.abs(ty - y) < 11)) continue;
        g.fillText(fmt(p, dp), pw + 8, y);
      }
      levels.forEach((L, k) => {
        const y = tagYs[k];
        g.fillStyle = L.tag; roundRect(g, pw + 4, y - 8, AXIS_W - 8, 16, 4); g.fill();
        g.fillStyle = C.ink; g.fillText(`${L.label} ${fmt(L.p, dp)}`, pw + 9, y + 0.5, AXIS_W - 16);
      });

      /* the time axis */
      const pxMin = bw / tf;
      const step = [1, 5, 15, 30, 60, 120, 180, 240, 360, 720, 1440].find(m => m >= tf && m * pxMin >= 64) || 1440;
      g.fillStyle = C.ink5; g.textBaseline = 'alphabetic';
      for (let i = i0; i <= Math.min(bars.length - 1, Math.ceil(view.start + view.count)); i++) {
        const d = new Date(bars[i][0] * 1000), m = d.getHours() * 60 + d.getMinutes();
        if (m % step) continue;
        const x = xI(i) - bw / 2;
        if (x < 0 || x > pw - 24) continue;
        g.fillText(m === 0 ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : clock(d), x - 14, H - 6);
      }

      /* the crosshair */
      sub.textContent = 'OANDA · mid';
      if (hover && !drag && hover.x < pw && hover.y > PAD_T && hover.y < PAD_T + ph) {
        const i = Math.floor(view.start + hover.x / bw);
        if (i >= 0 && i <= last) {
          const x = Math.round(xI(i)) + 0.5, y = Math.round(hover.y) + 0.5;
          g.strokeStyle = withAlpha(C.ink, 0.28); g.setLineDash([2, 3]);
          g.beginPath(); g.moveTo(x, PAD_T); g.lineTo(x, PAD_T + ph); g.moveTo(0, y); g.lineTo(pw, y); g.stroke();
          g.setLineDash([]);
          const price = hi - (hover.y - PAD_T) / ph * (hi - lo);
          g.fillStyle = C.ink3; roundRect(g, pw + 4, y - 8, AXIS_W - 8, 16, 4); g.fill();
          g.fillStyle = C.card; g.textBaseline = 'middle'; g.fillText(fmt(price, dp), pw + 9, y + 0.5);
          const [bt, o, h, l, c] = bars[i];
          const d = new Date(bt * 1000);
          const tl = (localDay(bt) === t.date ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]} `) + clock(d);
          g.fillStyle = C.ink3; const tw = tl.length * 6 + 10;
          roundRect(g, Math.min(pw - tw, Math.max(0, x - tw / 2)), H - 18, tw, 16, 4); g.fill();
          g.fillStyle = C.card; g.fillText(tl, Math.min(pw - tw, Math.max(0, x - tw / 2)) + 5, H - 9.5);
          sub.textContent = `${tl}   O ${fmtP(o, dp)}  H ${fmtP(h, dp)}  L ${fmtP(l, dp)}  C ${fmtP(c, dp)}`;
        }
      }
    }

    new ResizeObserver(() => draw()).observe(plot);
    fit();
    draw();
    card.__chart = { get view() { return { ...view }; }, get tf() { return tf; }, get bars() { return bars.length; },
                     get replaying() { return !!timer; }, get upto() { return upto; },
                     get news() { return news.map(n => n.title); }, idxAt, levels: () => levelsNow() };
    function levelsNow() {
      const out = [];
      if (Number.isFinite(tp)) out.push('TP'); if (Number.isFinite(sl)) out.push('SL');
      if (Number.isFinite(entry)) out.push(exitLine?.atEntry ? 'In · BE' : 'In');
      if (exitLine?.price != null) out.push(exitLine.kind === 'be' ? 'BE' : 'Out');
      return out;
    }
  }

  function firstTf() {
    const own = CHART_TFS.find(([k]) => k === t.execTf);
    if (own) return own[1];
    try {
      const kept = Number(localStorage.getItem(TF_KEY));
      if (CHART_TFS.some(([, m]) => m === kept)) return kept;
    } catch { /* fine */ }
    return 5;
  }

  start();
  return card;
}

/* ---------- small pieces ---------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = n => String(n).padStart(2, '0');
const clock = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
function localDay(T) { const d = new Date(T * 1000); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
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
