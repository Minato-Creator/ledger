/* ============================================================
   structure.js — market structure read Minato's way, as a hierarchy of
   degrees, built causally (nothing is used before it is known).

   degree 0: the smallest swings on 5m candles; degree d+1: a degree-d high
   above the degree-d highs either side of it (lows mirrored), so a degree
   is the structure the one below it builds. On gold, degree 1 ≈ the LTF
   ($4 swings), degree 2 ≈ his MTF ($8, ~80 minutes), degree 3 ≈ 4–5 hours.

   No CHoCH. A real break is a full-bodied close past the level, the next
   candle carrying on, no close back inside for 3 candles, and at least one
   ATR travelled; anything less is a failed break (NC+S) and the level
   stands. Used by quant13.js.
   ============================================================ */
import { aggregate } from './candles.js';

const isFull = (b, f) => { const r = b[2] - b[3]; return r > 0 && Math.abs(b[4] - b[1]) / r >= f; };
export const closesAbove = (b, lvl, f = 0.5) => b[4] > lvl && ((b[4] > b[1] && isFull(b, f)) || b[1] > lvl);
export const closesBelow = (b, lvl, f = 0.5) => b[4] < lvl && ((b[4] < b[1] && isFull(b, f)) || b[1] < lvl);

/* the alternating swing stream of one degree, from the stream below (or from bars, for degree 0) */
function upDegree(src) {
  const out = [];
  const lastOf = { H: [], L: [] };              // the last two src swings of each side
  const emit = (s, now) => {
    const last = out[out.length - 1];
    if (last && last.side === s.side) {
      /* two of a kind in a row: the extreme src swing of the other side between them goes in between */
      const other = s.side === 'H' ? 'L' : 'H';
      let pick = null;
      for (const x of src) { if (x.t <= last.t || x.t >= s.t || x.side !== other || x.known > now) continue; if (!pick || (other === 'L' ? x.p < pick.p : x.p > pick.p)) pick = x; }
      if (pick) out.push({ side: other, p: pick.p, t: pick.t, i: pick.i, known: now });
      else { if (s.side === 'H' ? s.p > last.p : s.p < last.p) { out[out.length - 1] = { ...s, known: now }; } return; }
    }
    out.push({ ...s, known: now });
  };
  for (let k = 0; k < src.length; k++) {
    const x = src[k], L = lastOf[x.side];
    if (L.length === 2) {
      const [a, b] = L;                            // a before b before x, all the same side
      const higher = x.side === 'H' ? (b.p > a.p && b.p >= x.p) : (b.p < a.p && b.p <= x.p);
      if (higher) emit(b, x.known);
    }
    L.push(x); if (L.length > 2) L.shift();
  }
  return out;
}

/* degree 0 straight from the candles */
function base(bars, size) {
  const raw = [];
  for (let j = 1; j + 1 < bars.length; j++) {
    const known = bars[j + 1][0] + size;
    if (bars[j][2] > bars[j - 1][2] && bars[j][2] >= bars[j + 1][2]) raw.push({ side: 'H', p: bars[j][2], t: bars[j][0], i: j, known });
    if (bars[j][3] < bars[j - 1][3] && bars[j][3] <= bars[j + 1][3]) raw.push({ side: 'L', p: bars[j][3], t: bars[j][0], i: j, known });
  }
  /* alternate: two highs in a row keep the lowest low between them (from the candles) */
  const out = [];
  for (const s of raw) {
    const last = out[out.length - 1];
    if (last && last.side === s.side) {
      let k = -1;
      for (let j = last.i + 1; j < s.i; j++) if (k < 0 || (s.side === 'H' ? bars[j][3] < bars[k][3] : bars[j][2] > bars[k][2])) k = j;
      if (k >= 0) out.push({ side: s.side === 'H' ? 'L' : 'H', p: s.side === 'H' ? bars[k][3] : bars[k][2], t: bars[k][0], i: k, known: s.known });
      else { if (s.side === 'H' ? s.p > last.p : s.p < last.p) out[out.length - 1] = s; continue; }
    }
    out.push(s);
  }
  return out;
}

/**
 * rows: 1m candles. baseMin: the candles degree 0 is read on. closeTf: per degree, the candle size (minutes) a break must close on.
 * returns { degrees: [{ swings, events, dirAt(t), state(t) }], bars }
 */
export function hierarchy(rows, { baseMin = 5, levels = 6, closeTf = [5, 5, 15, 15, 60, 240, 1440], full = 0.6 } = {}) {
  const bars = aggregate(rows, baseMin), size = baseMin * 60;
  const streams = [base(bars, size)];
  for (let d = 1; d < levels; d++) streams.push(upDegree(streams[d - 1]));
  const degrees = streams.map((sw, d) => structureOf(rows, sw, closeTf[d] ?? 1440, full, d));
  return { bars, degrees };
}

/* the structure of one degree, read his way (no CHoCH):
   – the levels: in an uptrend, the protected low below and the leg's high above (the highest swing since the protected low);
     in a range, the last swing high and low
   – a real break: a full-bodied close past the level AND the next candle carrying on (same colour, still closed past it).
     A wick past it, a weak close, or a strong close the next candle rejects is a failed break: NC+S — the level stands
   – breaking the leg's high: BOS, the low it came from becomes protected; breaking the protected low: BOS down, the
     top it came from becomes protected (the direction turns — he calls that a BOS too) */
function structureOf(rows, swings, tfMin, full, d, hold = 3, disp = 1.0) {
  const cb = aggregate(rows, tfMin), size = tfMin * 60;
  /* ATR(14) of these candles: a real break has to travel at least `disp` of it past the level */
  const atr = new Float64Array(cb.length); { let a = 0; for (let i = 0; i < cb.length; i++) { const b = cb[i], pc = i ? cb[i - 1][4] : b[4]; const tr = Math.max(b[2] - b[3], Math.abs(b[2] - pc), Math.abs(b[3] - pc)); a = i < 14 ? (a * i + tr) / (i + 1) : (a * 13 + tr) / 14; atr[i] = a; } }
  const events = [];                 // { t, kind: 'bos'|'ncs', dir (the way price pushed), level, from, n (sweeps of that level so far) }
  const timeline = [];               // after each candle: [tEnd, dir, prot.p, prot.t, weak.p, weak.t]
  let si = 0, dir = 0, prot = null, legX = null, pending = null;
  /* once a push in a leg has been defended (a strong candle straight back), the rest of that leg needs a displacement candle to break */
  const legDef = { 1: false, '-1': false };
  const highs = [], lows = [];       // swings known so far
  const sweeps = new Map();          // level key → { n, out } — out: price is past it right now
  const strong = (b, up) => (up ? b[4] > b[1] : b[4] < b[1]) && Math.abs(b[4] - b[1]) >= full * (b[2] - b[3]);
  for (let i = 0; i < cb.length; i++) {
    const b = cb[i], tEnd = b[0] + size;
    while (si < swings.length && swings[si].known <= tEnd) { const s = swings[si++]; (s.side === 'H' ? highs : lows).push(s); }
    const lowestSince = t0 => { let m = null; for (let j = i; j >= 0 && cb[j][0] >= t0; j--) if (!m || cb[j][3] < m.p) m = { p: cb[j][3], t: cb[j][0] }; return m; };
    const highestSince = t0 => { let m = null; for (let j = i; j >= 0 && cb[j][0] >= t0; j--) if (!m || cb[j][2] > m.p) m = { p: cb[j][2], t: cb[j][0] }; return m; };
    /* the two levels in play */
    let up = null, dn = null;
    if (dir === 0) { up = highs[highs.length - 1] || null; dn = lows[lows.length - 1] || null; }
    else if (dir === 1) { dn = prot; for (let k = highs.length - 1; k >= 0 && highs[k].t > prot.t; k--) if (!up || highs[k].p > up.p) up = highs[k]; }
    else { up = prot; for (let k = lows.length - 1; k >= 0 && lows[k].t > prot.t; k--) if (!dn || lows[k].p < dn.p) dn = lows[k]; }
    /* a break waiting on this candle to carry on */
    if (pending) {
      const { lv, upward } = pending;
      /* the next candle has to carry on; then the close has to hold — no close back inside for `hold` candles */
      const ok = pending.seen === 0 ? (upward ? (b[4] > b[1] && b[4] > lv.p) : (b[4] < b[1] && b[4] < lv.p)) : (upward ? b[4] > lv.p : b[4] < lv.p);
      pending.seen++;
      pending.ext = Math.max(pending.ext, upward ? b[2] - lv.p : lv.p - b[3]);
      /* carried on, held, and travelled: price left the level by at least `disp` ATR */
      const carried = ok && pending.seen >= hold && pending.ext >= disp * pending.atr;
      if (ok && pending.seen >= hold && !carried && pending.seen < hold + 3) { timeline.push([tEnd, dir, prot ? prot.p : null, prot ? prot.t : null, legX ? legX.p : null, legX ? legX.t : null]); continue; }
      if (ok && !carried) { timeline.push([tEnd, dir, prot ? prot.p : null, prot ? prot.t : null, legX ? legX.p : null, legX ? legX.t : null]); continue; }
      pending = null;
      if (carried) {
        if (upward) {
          if (dir === -1) { dir = 1; prot = lowestSince(lv.t); } else { dir = 1; prot = lowestSince(lv.t); }
        } else {
          if (dir === 1) { dir = -1; prot = highestSince(lv.t); } else { dir = -1; prot = highestSince(lv.t); }
        }
        events.push({ t: tEnd, kind: 'bos', dir: upward ? 1 : -1, level: lv.p, from: lv.t, prot: { ...prot } });
        legDef[1] = false; legDef[-1] = false;
        legX = upward ? { p: highestSince(lv.t).p, t: highestSince(lv.t).t } : { p: lowestSince(lv.t).p, t: lowestSince(lv.t).t };
        timeline.push([tEnd, dir, prot.p, prot.t, legX.p, legX.t]);
        continue;
      }
      const key = lv.t + ':' + lv.p, sw = sweeps.get(key) || { n: 0, out: false };
      sw.n++; sw.out = true;
      if ((upward ? b[4] < lv.p && b[4] < b[1] : b[4] > lv.p && b[4] > b[1]) && Math.abs(b[4] - b[1]) >= atr[i]) { sw.defended = true; legDef[upward ? 1 : -1] = true; }
      sweeps.set(key, sw);
      events.push({ t: tEnd, kind: 'ncs', dir: upward ? 1 : -1, level: lv.p, from: lv.t, n: sw.n, rejected: true });
    }
    /* this candle against each level */
    for (const [lv, upward] of [[up, true], [dn, false]]) {
      if (!lv || lv.t >= b[0]) continue;
      const past = upward ? b[2] > lv.p : b[3] < lv.p;
      const key = lv.t + ':' + lv.p, sw = sweeps.get(key) || { n: 0, out: false };
      if (!past) {
        if (sw.out) { sw.out = false; sweeps.set(key, sw); }
        /* the candle after a sweep closing strongly back away from the level: the level was defended */
        if (sw.n && !sw.defended && i > 0 && (upward ? cb[i - 1][2] > lv.p : cb[i - 1][3] < lv.p) && (upward ? b[4] < b[1] : b[4] > b[1]) && Math.abs(b[4] - b[1]) >= atr[i]) { sw.defended = true; legDef[upward ? 1 : -1] = true; sweeps.set(key, sw); }
        continue;
      }
      const closedPast = upward ? b[4] > lv.p : b[4] < lv.p;
      if (closedPast && strong(b, upward) && (!(sw.defended || legDef[upward ? 1 : -1]) || Math.abs(b[4] - b[1]) >= 1.5 * atr[i])) { pending = { lv, upward, t: tEnd, seen: 0, ext: upward ? b[2] - lv.p : lv.p - b[3], atr: atr[i] }; break; }
      if (!sw.out) { sw.n++; sw.out = true; sweeps.set(key, sw); events.push({ t: tEnd, kind: 'ncs', dir: upward ? 1 : -1, level: lv.p, from: lv.t, n: sw.n }); }
      if (!closedPast) { sw.out = false; sweeps.set(key, sw); }       // back inside on the close: the next push is a new sweep
    }
    if (dir === 1 && b[2] > legX.p) legX = { p: b[2], t: b[0] };
    if (dir === -1 && b[3] < legX.p) legX = { p: b[3], t: b[0] };
    timeline.push([tEnd, dir, prot ? prot.p : null, prot ? prot.t : null, legX ? legX.p : null, legX ? legX.t : null]);
  }
  const at = t => { let lo = 0, hi = timeline.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (timeline[m][0] <= t) { k = m; lo = m + 1; } else hi = m - 1; } return k < 0 ? null : timeline[k]; };
  return { d, tfMin, swings, events, timeline, dirAt: t => at(t)?.[1] || 0, stateAt: t => { const s = at(t); return s && { dir: s[1], prot: { p: s[2], t: s[3] }, weak: { p: s[4], t: s[5] } }; } };
}
