/* ============================================================
   Analytics · Timing — when you make it, and when you give it back.

   A week laid out hour by hour, each hour you traded lit by what it made;
   your sessions beside it; how long you held against what it paid; and what
   the first trade of a day is worth next to the fourth.

   The clock is the one you typed the trade in — your own.
   ============================================================ */
import { el, svg, fitted } from '../ui.js';
import * as c from '../calc.js';
import { ticks, tipLayer, spark, unitKit, nth } from './chartkit.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYNAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dowOf = date => (new Date(date + 'T00:00:00').getDay() + 6) % 7;
const hourOf = t => (t.timeOpen ? Number(String(t.timeOpen).split(':')[0]) : null);
const minsOf = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + (m || 0); };
const blank = () => ({ net: 0, count: 0, wins: 0, losses: 0 });
const add = (cell, x) => { cell.net += x.v; cell.count++; if (x.o === 'win') cell.wins++; else if (x.o === 'loss') cell.losses++; };
const rateOf = g => (g.wins + g.losses ? g.wins / (g.wins + g.losses) : null);

/** Every trade with a day of the week, an hour, and what it added. */
export function timed(acct, trades, K) {
  return c.chronological(trades).map(t => ({ t, v: K.valueOf(t), r: c.rMultiple(acct, t), o: c.outcome(t),
    dow: dowOf(t.date), hour: hourOf(t), mins: c.durationMins(t.timeOpen, t.timeClose) }));
}

/** The week as a grid: a cell for each day and hour, and the totals along both edges. */
export function grid(rows) {
  const at = rows.filter(x => x.hour != null && isFinite(x.hour));
  if (!at.length) return null;
  const hours = at.map(x => x.hour);
  const h0 = Math.min(...hours), h1 = Math.max(...hours);
  const used = new Set(at.map(x => x.dow));
  const days = [0, 1, 2, 3, 4, ...[5, 6].filter(d => used.has(d))];
  const cols = [];
  for (let h = h0; h <= h1; h++) cols.push(h);
  const cells = days.map(() => cols.map(blank));
  const byDay = days.map(blank), byHour = cols.map(blank);
  for (const x of at) {
    const di = days.indexOf(x.dow), hi = x.hour - h0;
    add(cells[di][hi], x); add(byDay[di], x); add(byHour[hi], x);
  }
  return { days, cols, cells, byDay, byHour, untimed: rows.length - at.length };
}

/** What the first, second, third and later trades of a day are worth. */
export function positions(rows) {
  const seen = new Map();
  const out = [blank(), blank(), blank(), blank()];
  for (const x of rows) {
    const k = (seen.get(x.t.date) || 0) + 1;
    seen.set(x.t.date, k);
    add(out[Math.min(k, 4) - 1], x);
  }
  return out.map((g, i) => ({ ...g, pos: i + 1, avg: g.count ? g.net / g.count : 0 })).filter(g => g.count);
}

export function timingTab(store, acct, trades, ctx) {
  const K = unitKit(ctx.unit, acct);
  const rows = timed(acct, trades, K);
  return el('div', { class: 'an-body' },
    el('div', { class: 'an-row is-main' }, heatCard(store, rows, K), sessionsCard(store, rows, K)),
    el('div', { class: 'an-row is-low' }, holdCard(rows, K), posCard(rows, K)));
}

/* ---------- the week, hour by hour ---------- */
function heatCard(store, rows, K) {
  const G = grid(rows);
  const card = el('section', { class: 'card lab-chart an-heat' });
  if (!G) {
    card.append(el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Your week, hour by hour')),
      el('p', { class: 'lab-empty' }, 'Add an open time to your trades to see this.'));
    return card;
  }
  const flat = G.cells.flat().filter(x => x.count);
  const best = flat.reduce((a, x) => (x.net > a.net ? x : a), flat[0]);
  const max = Math.max(...flat.map(x => Math.abs(x.net)), 1e-9);
  card.append(
    el('div', { class: 'lab-chart-head' },
      el('h2', {}, 'Your week, hour by hour'),
      el('span', { class: 'lab-sub' }, G.untimed ? `${G.untimed} without an open time` : 'hour opened'),
      el('span', { class: 'an-scale' },
        el('span', {}, K.axis(-max)), el('i', { class: 'an-ramp' }), el('span', {}, K.axis(max)))),
    fitted((w, h) => drawHeat(store, G, rows, K, max, best, w, h), 260));
  return card;
}

/* How strongly a cell is lit: the square root, so a small hour is still visible beside a big one. */
const lit = (v, max) => 0.16 + 0.84 * Math.sqrt(Math.min(1, Math.abs(v) / max));

function drawHeat(store, G, rows, K, max, best, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const tip = tipLayer(wrap);
  const nC = G.cols.length, nD = G.days.length;
  /* Sessions you traded, as brackets above the hours they cover. */
  const sessions = (store.playbook.sessions || []).filter(s => s.start && s.end && rows.some(x => x.t.sessionId === s.id));
  const LANE = 15;
  const l = 40, r = W - 108;
  const cw = (r - l) / nC;
  const X = h => l + (h - G.cols[0]) * cw;
  const lanes = [];
  const placed = [];
  for (const s of sessions) {
    let a = minsOf(s.start) / 60, z = minsOf(s.end) / 60;
    if (z <= a) z += 24;
    a = Math.max(a, G.cols[0]); z = Math.min(z, G.cols[nC - 1] + 1);
    if (z - a < 0.25) continue;
    const x1 = X(a), x2 = X(z);
    const need = Math.max(x2, x1 + s.name.length * 6.2 + 6);
    let lane = lanes.findIndex(end => end < x1 - 4);
    if (lane < 0) { if (lanes.length >= 2) continue; lanes.push(0); lane = lanes.length - 1; }
    lanes[lane] = need;
    placed.push({ s, x1, x2, lane });
  }
  const t = 6 + lanes.length * LANE + (lanes.length ? 4 : 0);
  const MARG = 38;                                  // the hour totals under the grid
  const b = H - 18 - MARG - 8;
  const ch = (b - t) / nD;
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });

  for (const p of placed) {
    const y = 6 + p.lane * LANE + 10;
    g.append(svg('line', { class: 'an-sess', x1: p.x1 + 1, x2: p.x2 - 1, y1: y + 2, y2: y + 2 }));
    g.append(svg('text', { class: 'an-sess-lbl', x: p.x1 + 1, y: y - 2 }, p.s.name));
  }

  G.days.forEach((d, di) => {
    const y = t + di * ch;
    g.append(svg('text', { class: 'lab-tick', x: l - 10, y: y + ch / 2 + 3.5, 'text-anchor': 'end' }, DAYS[d]));
    G.cols.forEach((h, hi) => {
      const cell = G.cells[di][hi];
      const x = X(h);
      const style = cell.count
        ? `fill:rgba(var(--${cell.net >= 0 ? 'profit' : 'loss'}-rgb), ${lit(cell.net, max).toFixed(3)})`
        : '';
      const rect = svg('rect', { class: 'an-cell' + (cell.count ? '' : ' is-empty') + (cell === best ? ' is-best' : ''),
        x: x + 1, y: y + 1, width: Math.max(1, cw - 2), height: Math.max(1, ch - 2), rx: Math.min(5, cw / 4, ch / 4), style });
      rect.addEventListener('pointerenter', () => tip.show(x + cw / 2, y + ch / 2, [
        el('div', { class: 'h' }, `${DAYNAMES[d]} · ${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`),
        ...(cell.count ? [
          el('div', { class: 'r' }, el('i', { class: cell.net >= 0 ? 'is-pass' : 'is-fail' }), el('b', {}, K.fmt(cell.net)), el('span', {}, 'net')),
          el('div', { class: 'r' }, el('b', {}, String(cell.count)), el('span', {}, `trade${cell.count === 1 ? '' : 's'} · ${rateOf(cell) == null ? '—' : c.pct(rateOf(cell), 0) + ' won'}`))]
          : [el('div', { class: 'r' }, el('span', {}, 'no trades'))])]));
      rect.addEventListener('pointerleave', () => tip.hide());
      g.append(rect);
    });
  });

  /* Down the right: each day's total, a bar from a shared zero and the figure beside it. */
  const dayMax = Math.max(1e-9, ...G.byDay.map(x => Math.abs(x.net)));
  const zx = r + 30, half = 20;
  g.append(svg('line', { class: 'lab-zero', x1: zx, x2: zx, y1: t + 4, y2: b - 4 }));
  G.byDay.forEach((dd, di) => {
    if (!dd.count) return;
    const y = t + di * ch + ch / 2;
    const w = Math.max(1.5, Math.abs(dd.net) / dayMax * (half - 2));
    const bh = Math.min(8, ch * 0.3);
    g.append(svg('rect', { class: 'an-marg ' + (dd.net >= 0 ? 'is-pos' : 'is-neg'), x: dd.net >= 0 ? zx : zx - w, y: y - bh / 2, width: w, height: bh, rx: 2 }));
    g.append(svg('text', { class: 'an-marg-lbl', x: W - 2, y: y + 3.5, 'text-anchor': 'end' }, K.fmt(dd.net, { short: true })));
  });

  /* Along the bottom: each hour's total. */
  const hMax = Math.max(1e-9, ...G.byHour.map(x => Math.abs(x.net)));
  const mz = b + 8 + MARG / 2;
  g.append(svg('line', { class: 'lab-zero', x1: l, x2: r, y1: mz, y2: mz }));
  const every = cw < 36 ? Math.ceil(36 / cw) : 1;
  G.cols.forEach((h, hi) => {
    const x = X(h) + cw / 2, hr = G.byHour[hi];
    if (hr.count) {
      const bh = Math.max(1.5, Math.abs(hr.net) / hMax * (MARG / 2 - 2));
      const bw = Math.min(14, cw * 0.4);
      g.append(svg('rect', { class: 'col-fill-svg an-marg ' + (hr.net >= 0 ? 'is-pos' : 'is-neg'),
        x: x - bw / 2, y: hr.net >= 0 ? mz - bh : mz, width: bw, height: bh, rx: 2 }));
    }
    if (hi % every === 0) g.append(svg('text', { class: 'lab-tick', x, y: H - 5, 'text-anchor': 'middle' }, String(h).padStart(2, '0')));
  });
  wrap.prepend(g);
  return wrap;
}

/* ---------- sessions, one tile each ---------- */
function sessionsCard(store, rows, K) {
  const map = new Map();
  for (const x of rows) {
    const k = x.t.sessionId || '_out';
    const gr = map.get(k) || { key: k, name: c.sessionLabel(store.playbook, x.t.sessionId), ...blank(), curve: [0] };
    add(gr, x); gr.curve.push(gr.net);
    map.set(k, gr);
  }
  const groups = [...map.values()].sort((a, b) => b.net - a.net);
  return el('section', { class: 'card lab-chart an-sessions' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'By session')),
    el('div', { class: 'an-stiles' }, ...groups.map(gr => {
      const wr = rateOf(gr);
      return el('div', { class: 'an-stile' },
        el('div', { class: 'top' }, el('span', { class: 'nm' }, gr.name),
          el('b', { class: gr.net > 0 ? 'is-pos' : gr.net < 0 ? 'is-neg' : '' }, K.fmt(gr.net))),
        el('div', { class: 'mt' }, `${gr.count} trade${gr.count === 1 ? '' : 's'} · ${wr == null ? '—' : c.pct(wr, 0) + ' won'}`),
        el('div', { class: 'sp' }, spark(gr.curve, { height: 26, cls: gr.net < 0 ? 'is-neg' : 'is-pos' })));
    })));
}

/* ---------- how long you held, against what it paid ---------- */
function holdCard(rows, K) {
  const pts = rows.filter(x => x.mins != null && isFinite(x.mins));
  const med = arr => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mw = med(pts.filter(x => x.o === 'win').map(x => x.mins));
  const ml = med(pts.filter(x => x.o === 'loss').map(x => x.mins));
  const card = el('section', { class: 'card lab-chart an-hold' },
    el('div', { class: 'lab-chart-head' },
      el('h2', {}, 'Time in trade'),
      el('span', { class: 'lab-sub' }, `${pts.length} with a close time`),
      pts.length >= 3 ? el('span', { class: 'an-marks is-right' },
        el('span', {}, el('i', { class: 'is-win' }), 'median win ', el('b', {}, c.durationFmt(mw == null ? null : Math.round(mw)))),
        el('span', {}, el('i', { class: 'is-loss' }), 'median loss ', el('b', {}, c.durationFmt(ml == null ? null : Math.round(ml))))) : null));
  if (pts.length < 3) { card.append(el('p', { class: 'lab-empty' }, 'Needs an open and a close time on at least three trades.')); return card; }
  card.append(fitted((w, h) => drawHold(pts, mw, ml, K, w, h), 190));
  return card;
}

const DUR_TICKS = [1, 5, 15, 30, 60, 120, 240, 480, 960, 1440];
const durLbl = m => (m < 60 ? `${m}m` : `${m / 60}h`);

function drawHold(pts, mw, ml, K, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const tip = tipLayer(wrap);
  const l = 52, r = W - 12, t = 10, b = H - 22;
  const maxM = Math.max(5, ...pts.map(x => x.mins));
  /* A square-root clock: a scalp and a swing both get room. */
  const X = m => l + Math.sqrt(Math.max(0, m) / maxM) * (r - l);
  let lo = Math.min(0, ...pts.map(x => x.v)), hi = Math.max(0, ...pts.map(x => x.v));
  const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
  const Y = v => b - ((v - lo) / (hi - lo)) * (b - t);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  for (const v of ticks(lo, hi, 4)) {
    g.append(svg('line', { class: Math.abs(v) < 1e-9 ? 'lab-zero' : 'lab-grid', x1: l, x2: r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, K.axis(v)));
  }
  let lastX = -99;
  for (const m of DUR_TICKS.filter(m => m <= maxM * 1.001)) {
    const x = X(m);
    if (x - lastX < 34) continue;
    lastX = x;
    g.append(svg('line', { class: 'lab-grid is-v', x1: x, x2: x, y1: t, y2: b }));
    g.append(svg('text', { class: 'lab-tick', x, y: H - 5, 'text-anchor': 'middle' }, durLbl(m)));
  }
  if (mw != null) g.append(svg('line', { class: 'an-med is-win', x1: X(mw), x2: X(mw), y1: t, y2: b }));
  if (ml != null) g.append(svg('line', { class: 'an-med is-loss', x1: X(ml), x2: X(ml), y1: t, y2: b }));

  const xy = pts.map(x => [X(x.mins), Y(x.v)]);
  pts.forEach((x, i) => g.append(svg('circle', { class: 'an-dot ' + (x.o === 'win' ? 'is-pos' : x.o === 'loss' ? 'is-neg' : 'is-flat'),
    cx: xy[i][0], cy: xy[i][1], r: 3.5 })));
  const ring = svg('circle', { class: 'an-ring', r: 6.5, visibility: 'hidden' });
  const hit = svg('rect', { class: 'lab-hit', x: l, y: t, width: r - l, height: b - t, fill: 'transparent' });
  g.append(ring, hit);
  hit.addEventListener('pointermove', e => {
    const box = hit.getBoundingClientRect();
    const px = l + (e.clientX - box.left), py = t + (e.clientY - box.top);
    let best = -1, bd = 26 * 26;
    xy.forEach(([x, y], i) => { const d = (x - px) ** 2 + (y - py) ** 2; if (d < bd) { bd = d; best = i; } });
    if (best < 0) { ring.setAttribute('visibility', 'hidden'); return tip.hide(); }
    const p = pts[best];
    ring.setAttribute('cx', xy[best][0]); ring.setAttribute('cy', xy[best][1]); ring.setAttribute('visibility', 'visible');
    tip.show(xy[best][0], xy[best][1], [
      el('div', { class: 'h' }, `${c.shortDate(p.t.date)} ${p.t.timeOpen || ''} · ${p.t.pair || ''}`),
      el('div', { class: 'r' }, el('i', { class: p.v > 0 ? 'is-pass' : p.v < 0 ? 'is-fail' : 'is-going' }), el('b', {}, K.fmt(p.v)), el('span', {}, 'result')),
      el('div', { class: 'r' }, el('b', {}, c.durationFmt(p.mins)), el('span', {}, 'held'))]);
  });
  hit.addEventListener('pointerleave', () => { ring.setAttribute('visibility', 'hidden'); tip.hide(); });
  wrap.prepend(g);
  return wrap;
}

/* ---------- the first trade of the day, and the fourth ---------- */
function posCard(rows, K) {
  const P = positions(rows);
  return el('section', { class: 'card lab-chart an-pos' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Trade of the day'), el('span', { class: 'lab-sub' }, 'average per trade')),
    fitted((w, h) => drawPos(P, K, w, h), 190));
}

function drawPos(P, K, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const tip = tipLayer(wrap);
  const l = 10, r = W - 10, t = 22, b = H - 58;
  const up = Math.max(0, ...P.map(p => p.avg)), dn = Math.max(0, ...P.map(p => -p.avg));
  const span = up + dn || 1;
  const zero = t + (b - t) * (up / span);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  g.append(svg('line', { class: 'lab-zero', x1: l, x2: r, y1: zero, y2: zero }));
  const slot = (r - l) / Math.max(1, P.length);
  const bw = Math.min(40, slot * 0.42);
  P.forEach((p, i) => {
    const cx = l + slot * i + slot / 2;
    const h = Math.max(2, (Math.abs(p.avg) / span) * (b - t));
    const y = p.avg >= 0 ? zero - h : zero;
    g.append(svg('rect', { class: 'col-fill-svg an-bin ' + (p.avg >= 0 ? 'is-pos' : 'is-neg'), x: cx - bw / 2, y, width: bw, height: h, rx: 3 }));
    g.append(svg('text', { class: 'an-val', x: cx, y: p.avg >= 0 ? y - 6 : y + h + 13, 'text-anchor': 'middle' }, K.fmt(p.avg, { short: true })));
    g.append(svg('text', { class: 'an-pos-lbl', x: cx, y: H - 20, 'text-anchor': 'middle' }, p.pos === 4 ? '4th +' : nth(p.pos)));
    const wr = rateOf(p);
    g.append(svg('text', { class: 'lab-tick', x: cx, y: H - 5, 'text-anchor': 'middle' }, `${p.count} · ${wr == null ? '—' : c.pct(wr, 0)}`));
    const hit = svg('rect', { class: 'an-hit', x: cx - slot / 2, y: t - 16, width: slot, height: b - t + 16, fill: 'transparent' });
    hit.addEventListener('pointerenter', () => tip.show(cx, (t + b) / 2, [
      el('div', { class: 'h' }, p.pos === 4 ? 'Fourth trade of a day, or later' : `${nth(p.pos)} trade of the day`),
      el('div', { class: 'r' }, el('b', {}, K.fmt(p.avg)), el('span', {}, 'on average')),
      el('div', { class: 'r' }, el('b', {}, K.fmt(p.net)), el('span', {}, `across ${p.count}`)),
      el('div', { class: 'r' }, el('b', {}, wr == null ? '—' : c.pct(wr, 0)), el('span', {}, 'won'))]));
    hit.addEventListener('pointerleave', () => tip.hide());
    g.append(hit);
  });
  wrap.prepend(g);
  return wrap;
}
