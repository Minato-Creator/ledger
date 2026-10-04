/* ============================================================
   replaytrading.js — placing and managing trades inside a Replay session.

   The trades themselves are worked out in replaytrades.js; this is how
   they look and are handled on the charts, TradingView's way:

   • Right-click → Buy at market / Sell at market: a position with no stop,
     no target and no size. The replay will not move on until a stop is
     set — a message says so. Its line carries TP and SL buttons: drag one
     off the line to set the target or the stop ("Drag to set target").
     Every stop (the first and each move) sizes the trade to the risk
     setting; a stop at or past the entry keeps the size.
   • A Long / Short position drawing, selected: a small Buy / Sell button
     at its entry. It buys or sells at market — the candle's price, not
     the drawing's entry — with the drawing's stop and target, sized so the
     risk is the setting. The drawing stays where it was drawn.
   • Lines right across the chart, dotted, no "BUY" text: the entry (grey)
     — qty · open P&L · ✕ (closes at market); the target (green) and the
     stop (red) — qty · P&L there · ✕ (removes that order). Drag a target
     or stop line, or its label, to move it. Price tags on the scale.
   • Stepping back to before a trade asks: delete the trade, or keep it.
   ============================================================ */
import { el, toast } from '../ui.js';
import * as rt from '../replaytrades.js';
import { svgIcon, roundRect, withAlpha } from '../chart/core.js';

const money = v => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rTxt = r => `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}R`;

/**
 * @param o { s, inst, dp, feed, T(), rate(T), save(), changed(), root, stage }
 */
export function createTrading(o) {
  const { s, inst, feed } = o;
  const trades = () => s.trades || (s.trades = []);
  const now = () => feed.priceAt(o.T());
  const qtyTxt = q => (q == null ? '—' : inst === 'NAS100_USD' ? q.toFixed(1) : Math.round(q).toLocaleString('en-US'));
  const fmt = v => Number(v).toFixed(o.dp);
  let live = null;              // a level being dragged: { id, kind, price }

  /* ---------- the banner: what the replay is waiting for ---------- */
  const banner = el('div', { class: 'rt-need', hidden: true });
  o.stage.append(banner);
  const needStop = () => trades().filter(t => !t.closed && t.sl == null);
  function paintBanner(flash) {
    const n = needStop().length;
    banner.hidden = !n;
    banner.textContent = n ? 'Set a stop loss first — drag SL off the position line. The replay waits until it is set.' : '';
    if (n && flash) { banner.classList.remove('is-flash'); void banner.offsetWidth; banner.classList.add('is-flash'); }
  }
  /** True while any open trade has no stop: the replay may not move on. */
  function blocked() { const b = needStop().length > 0; paintBanner(b); return b; }

  /* ---------- placing ---------- */
  function market(side) {
    const price = now();
    if (!Number.isFinite(price)) return;
    const t = rt.openTrade(s, inst, { side, T: o.T(), price, from: 'manual', rate: o.rate(o.T()) });
    trades().push(t);
    toast(`${side === 'buy' ? 'Bought' : 'Sold'} at ${fmt(price)} — now set the stop`);
    changed();
    return t;
  }
  function fromTool(d) {
    const price = now(), long = d.type === 'long';
    if (!Number.isFinite(price)) return null;
    if (long ? price <= d.sl : price >= d.sl) { toast('Price is already past the drawing’s stop', 'bad'); return null; }
    if (d.tp != null && (long ? price >= d.tp : price <= d.tp)) { toast('Price is already past the drawing’s target', 'bad'); return null; }
    const t = rt.openTrade(s, inst, { side: long ? 'buy' : 'sell', T: o.T(), price, sl: d.sl, tp: d.tp, from: 'tool', rate: o.rate(o.T()) });
    if (!t.qty) { toast('The risk is too small for one unit at that stop', 'bad'); return null; }
    t.drawing = d.id;
    trades().push(t);
    toast(`${long ? 'Bought' : 'Sold'} ${qtyTxt(t.qty)} at ${fmt(price)} · risk ${money(t.riskAmt)}`);
    changed();
    return t;
  }
  function setLevel(t, kind, price) {
    const p = +price.toFixed(o.dp + 1);
    if (!rt.validLevel(t, kind, p, now())) { toast(kind === 'sl' ? 'A stop has to be on the losing side of the price' : 'A target has to be on the winning side of the price', 'bad'); return false; }
    if (kind === 'sl') {
      /* every stop on the losing side sizes the trade to the risk again */
      const was = { sl: t.sl, qty: t.qty, initSl: t.initSl, riskAmt: t.riskAmt, riskTarget: t.riskTarget };
      rt.setStop(s, inst, t, p, o.rate(o.T()));
      if (!t.qty) { Object.assign(t, was); toast('The risk is too small for one unit at that stop', 'bad'); changed(); return false; }
      if (t.qty !== was.qty) toast(`Stop set · ${qtyTxt(t.qty)} units · risk ${money(t.riskAmt)}`);
    } else t.tp = p;
    changed();
    return true;
  }
  function closeAtMarket(t) {
    const price = now();
    if (t.qty == null) { const i = trades().indexOf(t); trades().splice(i, 1); toast('Cancelled — it had no size yet'); changed(); return; }
    rt.closeTrade(inst, t, o.T(), price, 'manual', o.rate(o.T()));
    toast(`Closed at ${fmt(price)} · ${signed(t.pnl)} (${rTxt(t.r)})`);
    changed();
  }
  function changed() { paintBanner(false); o.changed(); o.save(); }

  /** The replay moved forward: fill what the candles reached. */
  function advance(fromT, toT) {
    const done = rt.runMoments(inst, trades(), feed.rows, fromT, toT, o.rate);
    for (const t of done) toast(`${t.reason === 'tp' ? 'Target' : 'Stop'} hit · ${signed(t.pnl)} (${rTxt(t.r)})`, t.pnl >= 0 ? 'ok' : 'bad');
    if (done.length) { o.changed(); o.save(); }
    return done;
  }
  /** Going back to before trades were taken: ask, then go (or not). */
  function beforeBack(nextT, go) {
    const later = rt.openedAfter(trades(), nextT);
    if (!later.length) return go();
    if (o.root.querySelector('.rt-back')) return;           // already asking: one question at a time
    const n = later.length;
    const box = el('div', { class: 'rs-modal-wrap' }, el('div', { class: 'card rs-modal rt-back' },
      el('h2', {}, `Go back before ${n === 1 ? 'a trade' : `${n} trades`}?`),
      el('p', {}, `The replay is going back to before ${n === 1 ? 'a trade you took' : `${n} trades you took`}. Delete ${n === 1 ? 'it' : 'them'}, or keep ${n === 1 ? 'it' : 'them'}?`),
      el('div', { class: 'rs-modal-row' },
        el('button', { class: 'btn btn-quiet rt-back-cancel', onClick: () => box.remove() }, 'Cancel'),
        el('button', { class: 'btn btn-quiet rt-back-keep', onClick: () => { box.remove(); go(); } }, 'Keep'),
        el('button', { class: 'btn btn-light rt-back-delete', onClick: () => {
          box.remove();
          s.trades = trades().filter(t => !later.includes(t));
          changed(); go();
        } }, n === 1 ? 'Delete the trade' : 'Delete the trades'))));
    o.root.append(box);
  }

  /** An execution arrow: its tip at (x, y), pointing up (a buy, under the candle) or down (a sell, over it). */
  function arrow(g, x, y, up) {
    const k = up ? 1 : -1;
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x - 5, y + k * 6); g.lineTo(x - 1.5, y + k * 6); g.lineTo(x - 1.5, y + k * 11);
    g.lineTo(x + 1.5, y + k * 11); g.lineTo(x + 1.5, y + k * 6); g.lineTo(x + 5, y + k * 6); g.closePath(); g.fill();
  }

  /* ---------- one chart's part ---------- */
  function forChart(c) {
    const layer = el('div', { class: 'rt-layer' });
    c.plot.append(layer);
    const nodes = new Map();       // key → element
    let G = null;

    function lines() {
      const out = [];
      for (const t of trades()) {
        if (t.closed) continue;
        out.push({ key: t.id + ':e', t, kind: 'e', price: t.entry });
        const tp = live?.id === t.id && live.kind === 'tp' ? live.price : t.tp;
        const sl = live?.id === t.id && live.kind === 'sl' ? live.price : t.sl;
        if (tp != null) out.push({ key: t.id + ':tp', t, kind: 'tp', price: tp });
        if (sl != null) out.push({ key: t.id + ':sl', t, kind: 'sl', price: sl });
      }
      return out;
    }
    let marks = [];               // the execution arrows last painted (for the tests)
    function paint(g, G0, C) {
      G = G0;
      const S = c.core.settings.trading;
      /* closed trades, TradingView's way: each execution an arrow — a buy under its candle pointing up
         (green), a sell over it pointing down (red) — and a dotted line from in to out, in the trade's colour */
      marks = [];
      if (S.arrows !== false) {
        const bars = c.core.bars;
        const at = T => { const i = Math.floor(c.core.idxAt(feed.timeOf(T)) + 1e-9); return { i, b: bars[i] }; };   // a tick inside a minute belongs to that minute's candle
        for (const t of trades()) {
          if (!t.closed || t.openT > o.T()) continue;
          const A = at(t.openT), B = at(t.closeT);
          const xa = G.xI(A.i), xb = G.xI(B.i);
          if (xb < -20 || xa > G.pw + 20) continue;
          const col = t.side === 'buy' ? C.profit : C.loss;
          g.strokeStyle = col; g.lineWidth = 1; g.setLineDash([2, 2]);
          g.beginPath(); g.moveTo(xa, G.Y(t.entry)); g.lineTo(xb, G.Y(t.exit)); g.stroke(); g.setLineDash([]);
          const buyIn = t.side === 'buy';
          for (const [x, E, buy] of [[xa, A, buyIn], [xb, B, !buyIn]]) {
            if (!E.b) continue;
            g.fillStyle = buy ? C.profit : C.loss;
            const y = buy ? G.Y(E.b[3]) + 4 : G.Y(E.b[2]) - 4;
            arrow(g, x, y, buy);
            marks.push({ trade: t.id, buy, x, y, low: G.Y(E.b[3]), high: G.Y(E.b[2]), colour: g.fillStyle });
          }
        }
      }
      toolButton();
      if (!S.lines) { for (const n of nodes.values()) n.remove(); nodes.clear(); return; }
      for (const L of lines()) {
        const y = Math.round(G.Y(L.price)) + 0.5;
        g.strokeStyle = L.kind === 'e' ? C.flat : L.kind === 'tp' ? C.profit : C.loss;
        g.lineWidth = 1; g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(0, y); g.lineTo(G.pw, y); g.stroke(); g.setLineDash([]);
      }
      overlay(C, S);
    }
    /* the labels on the lines are real buttons, laid over the chart */
    function overlay(C, S) {
      const ls = lines(), keep = new Set();
      const P = now();
      for (const L of ls) {
        keep.add(L.key);
        let node = nodes.get(L.key);
        const t = L.t;
        /* while its stop is dragged, the size it would take there */
        const tv = live?.id === t.id && live.kind === 'sl' && t.qty != null ? rt.setStop(s, inst, structuredClone(t), live.price, o.rate(o.T())) : t;
        const pnl = L.kind === 'e' ? rt.pnlOf(inst, tv, P, o.rate(o.T())) : rt.pnlOf(inst, tv, L.price, o.rate(o.T()));
        const sig = [L.kind, t.qty, t.tp == null, t.sl == null, S.pnl].join('|');
        if (!node || node.__sig !== sig) {
          node?.remove();
          node = cluster(L, S);
          node.__sig = sig;
          nodes.set(L.key, node);
          layer.append(node);
        }
        const qv = node.querySelector('.rt-qty');
        if (qv && tv.qty) qv.textContent = qtyTxt(tv.qty);
        const pv = node.querySelector('.rt-pnl');
        if (pv) { pv.textContent = t.qty == null ? 'no size yet' : signed(pnl); pv.classList.toggle('is-up', pnl > 0); pv.classList.toggle('is-down', pnl < 0); }
        node.style.top = (G.Y(L.price) - 11) + 'px';
        node.style.right = (c.plot.clientWidth - G.pw + 10) + 'px';
        node.hidden = G.Y(L.price) < -10 || G.Y(L.price) > G.ph + 10;
      }
      for (const [k, n] of nodes) if (!keep.has(k)) { n.remove(); nodes.delete(k); }
    }
    function cluster(L, S) {
      const t = L.t;
      const kids = [];
      if (L.kind === 'e') {
        if (t.tp == null) kids.push(dragOff(t, 'tp', 'TP', 'Drag to set target'));
        if (t.sl == null) kids.push(dragOff(t, 'sl', 'SL', 'Drag to set stop'));
      }
      kids.push(el('span', { class: 'rt-qty is-' + L.kind, title: L.kind === 'e' ? 'Units' : L.kind === 'tp' ? 'Target — drag to move' : 'Stop — drag to move' }, qtyTxt(t.qty)));
      if (S.pnl) kids.push(el('span', { class: 'rt-pnl' }));
      kids.push(el('button', { class: 'rt-x', title: L.kind === 'e' ? 'Close at market' : L.kind === 'tp' ? 'Remove the target' : 'Remove the stop',
        onClick: e => {
          e.stopPropagation();
          if (L.kind === 'e') closeAtMarket(t);
          else { if (L.kind === 'tp') t.tp = null; else t.sl = null; changed(); }
        } }, '×'));
      const node = el('div', { class: 'rt-cl is-' + L.kind, 'data-trade': t.id, 'data-kind': L.kind }, ...kids);
      if (L.kind !== 'e') dragLevel(node, t, L.kind);
      return node;
    }
    /* drag a target or stop label (or line) up and down */
    function dragLevel(node, t, kind) {
      node.addEventListener('pointerdown', e => {
        if (e.target.closest('.rt-x') || e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        node.setPointerCapture(e.pointerId);
        follow(e, t, kind, node);
      });
    }
    /* the TP / SL buttons on the entry line: drag one off it */
    function dragOff(t, kind, label, title) {
      const b = el('span', { class: 'rt-off is-' + kind, title, role: 'button' }, label);
      b.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        b.setPointerCapture(e.pointerId);
        follow(e, t, kind, b);
      });
      return b;
    }
    function follow(e, t, kind, cap) {
      const r = c.plot.getBoundingClientRect();
      const at = ev => c.core.geom().P(ev.clientY - r.top);
      const move = ev => { live = { id: t.id, kind, price: at(ev) }; c.core.draw(); o.redrawAll(); };
      const up = ev => {
        cap.removeEventListener('pointermove', move); cap.removeEventListener('pointerup', up);
        const p = live?.price;
        live = null;
        if (Number.isFinite(p) && Math.abs(ev.clientY - e.clientY) > 3) setLevel(t, kind, p);
        o.redrawAll();
      };
      cap.addEventListener('pointermove', move); cap.addEventListener('pointerup', up);
    }
    /* the line itself, grabbed on the chart */
    function claim(x, y, G0) {
      if (!c.core.settings.trading.lines) return null;
      for (const L of lines()) {
        if (L.kind === 'e' || Math.abs(G0.Y(L.price) - y) > 4) continue;
        return { capture: true,
          move: (mx, my, G2) => { live = { id: L.t.id, kind: L.kind, price: G2.P(my) }; o.redrawAll(); },
          up: () => { const p = live?.price; live = null; if (Number.isFinite(p)) setLevel(L.t, L.kind, p); o.redrawAll(); },
          cancel: () => { live = null; } };
      }
      return null;
    }
    function hover(x, y, G0) {
      if (!c.core.settings.trading.lines) return null;
      return lines().some(L => L.kind !== 'e' && Math.abs(G0.Y(L.price) - y) <= 4) ? 'ns' : null;
    }
    /* Buy / Sell beside a selected Long / Short drawing */
    const go = el('button', { class: 'rt-go', hidden: true });
    layer.append(go);
    function toolButton() {
      const id = c.dr.selected;
      const d = id && c.dr.list().find(x => x.id === id);
      const sh = d && (d.type === 'long' || d.type === 'short') && c.dr.shapes().find(x => x.id === id);
      go.hidden = !sh;
      if (!sh) return;
      /* just past the drawing's right edge, at its entry; inside the chart when the edge is off it */
      const h = sh.handles.find(x => x.key === 'end');
      go.textContent = d.type === 'long' ? 'Buy' : 'Sell';
      go.className = 'rt-go is-' + (d.type === 'long' ? 'buy' : 'sell');
      const w = go.offsetWidth || 50;
      go.style.left = Math.max(2, Math.min(G.pw - w - 4, h.x + 10)) + 'px';
      go.style.top = (h.y - 12) + 'px';
      go.onclick = e => { e.stopPropagation(); if (fromTool(c.dr.list().find(x => x.id === id))) c.dr.select(null); };
    }
    function menu(ctx) {
      const P = now();
      if (!Number.isFinite(P)) return [];
      return [{ sep: true },
        { label: `Buy at market ${fmt(P)}`, icon: 'M12 19V6M6.5 11.5L12 6l5.5 5.5', cls: 'rt-m-buy', act: () => market('buy') },
        { label: `Sell at market ${fmt(P)}`, icon: 'M12 5v13M6.5 12.5L12 18l5.5-5.5', cls: 'rt-m-sell', act: () => market('sell') }];
    }
    function tags() {
      if (!c.core.settings.trading.lines) return [];
      const C = c.core.palette();
      return lines().map(L => ({ p: L.price, label: L.kind === 'e' ? '' : L.kind.toUpperCase(), bg: L.kind === 'e' ? C.flat : L.kind === 'tp' ? C.profit : C.loss }));
    }
    return { paint, claim, hover, menu, tags, layer, marks: () => marks.slice() };
  }

  /* ---------- the panel and the numbers at the top ---------- */
  function openPnl() { const P = now(); return trades().filter(t => !t.closed).reduce((a, t) => a + rt.pnlOf(inst, t, P, o.rate(o.T())), 0); }
  function table(kind) {
    const list = trades().filter(t => (kind === 'open' ? !t.closed : t.closed)).sort((a, b) => (kind === 'open' ? a.openT - b.openT : b.closeT - a.closeT));
    if (!list.length) return el('p', { class: 'rs-empty' }, kind === 'open' ? 'No open positions' : 'No trades yet');
    const when = T => { const d = new Date(T * 1000); return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const P = now();
    const heads = kind === 'open' ? ['Side', 'Opened', 'Entry', 'Stop', 'Target', 'Units', 'Risk', 'P&L', 'R', ''] : ['Side', 'Opened', 'Closed', 'Entry', 'Exit', 'Units', 'P&L', 'R', 'How'];
    const rows = list.map(t => {
      const pnl = kind === 'open' ? rt.pnlOf(inst, t, P, o.rate(o.T())) : t.pnl;
      const r = t.riskAmt ? pnl / t.riskAmt : 0;
      const cls = pnl > 0 ? 'is-up' : pnl < 0 ? 'is-down' : '';
      const side = el('span', { class: t.side === 'buy' ? 'is-up' : 'is-down' }, t.side === 'buy' ? 'Buy' : 'Sell');
      return el('div', { class: 'rt-row', 'data-trade': t.id }, ...(kind === 'open'
        ? [side, el('span', {}, when(t.openT)), el('span', {}, fmt(t.entry)), el('span', {}, t.sl == null ? '—' : fmt(t.sl)), el('span', {}, t.tp == null ? '—' : fmt(t.tp)),
          el('span', {}, qtyTxt(t.qty)), el('span', {}, t.riskAmt ? money(t.riskAmt) : '—'), el('span', { class: cls }, t.qty == null ? '—' : signed(pnl)), el('span', { class: cls }, t.riskAmt ? rTxt(r) : '—'),
          el('button', { class: 'rt-close', onClick: () => closeAtMarket(t) }, 'Close')]
        : [side, el('span', {}, when(t.openT)), el('span', {}, when(t.closeT)), el('span', {}, fmt(t.entry)), el('span', {}, fmt(t.exit)), el('span', {}, qtyTxt(t.qty)),
          el('span', { class: cls }, signed(pnl)), el('span', { class: cls }, rTxt(t.r || 0)), el('span', {}, t.reason === 'tp' ? 'Target' : t.reason === 'sl' ? 'Stop' : 'Closed')]));
    });
    return el('div', { class: 'rt-table is-' + kind }, el('div', { class: 'rt-row is-head' }, ...heads.map(h => el('span', {}, h))), ...rows);
  }

  paintBanner(false);
  return { market, fromTool, setLevel, closeAtMarket, advance, beforeBack, blocked, forChart, openPnl, table, trades, now, needStop };
}
