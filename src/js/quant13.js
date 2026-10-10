/* ============================================================
   quant13.js — Minato's risk entry at MTF structure, the engine behind
   Version 1 and Version 2 (Version 3 is quant.js).

   Structure (structure.js): LTF = degree 1, MTF = degree 2, the one above
   = degree 3. Levels: the protected low/high behind every real break, on
   LTF / MTF internal / MTF external, until a real break of it (and, from
   Version 1, at most 5 days).
   Trigger at a level: a DC on 15m candles — a first reaction swing near the
   level, a later push sweeps it with no real break — then the rejection
   candle closes; in at the next open. Stop past the sweep (+ buffer).
   Risk entry (the LTF has not shifted yet): only at MTF levels, with the
   MTF, and only when the level has empty space behind it (no other level
   within 3 ATR) or the sweep shows RSI divergence on 3 of 1/3/5/15m.
   Target: the nearest weak structure; if further than the day has left in
   it, the nearest internal swing at ≥ 1.5R. Break-even on an LTF real
   break in profit. One trade at a time.
   3SL (Version 2): only from 1h before to 1h after the Tokyo, London and
   New York opens, at most one trade a session.
   ============================================================ */
import { aggregate, rolloverOf } from './candles.js';
import { hierarchy, closesAbove, closesBelow } from './structure.js';
import { pipOf, spreadOf, bufOf } from './pips.js';

export function rsiOf(bars, n = 14) {
  const out = new Float64Array(bars.length).fill(50);
  let up = 0, dn = 0;
  for (let i = 1; i < bars.length; i++) {
    const ch = bars[i][4] - bars[i - 1][4], u = Math.max(0, ch), v = Math.max(0, -ch);
    if (i <= n) { up += u / n; dn += v / n; } else { up = (up * (n - 1) + u) / n; dn = (dn * (n - 1) + v) / n; }
    if (i >= n) out[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
  }
  return out;
}

/* ---------- 3SL: the hour either side of each market open, in that market's own clock ---------- */
export const OPENS = [['Asia/Tokyo', 540, 'Tokyo'], ['Europe/London', 480, 'London'], ['America/New_York', 480, 'New York']];
const fmts = {};
function localOf(t, tz) {
  fmts[tz] ??= new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = {}; for (const x of fmts[tz].formatToParts(new Date(t * 1000))) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}
/** The 3SL window a moment falls in ('London 2026-06-01'), or null. */
export function sessionOf(t, opens = OPENS) {
  for (const [tz, open, name] of opens) { const L = localOf(t, tz); if (L.min >= open - 60 && L.min < open + 60) return name + ' ' + L.day; }
  return null;
}

const bsearch = (arr, t, key = x => x[0]) => { let lo = 0, hi = arr.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (key(arr[m]) <= t) { k = m; lo = m + 1; } else hi = m - 1; } return k; };
function atrOf(bars, n = 14) { const out = new Float64Array(bars.length); let a = 0; for (let i = 0; i < bars.length; i++) { const b = bars[i], pc = i ? bars[i - 1][4] : b[4]; const tr = Math.max(b[2] - b[3], Math.abs(b[2] - pc), Math.abs(b[3] - pc)); a = i < n ? (a * i + tr) / (i + 1) : (a * (n - 1) + tr) / n; out[i] = a; } return out; }

export function prepare13(rows, { levels = 5 } = {}) {
  const H = hierarchy(rows, { baseMin: 5, levels });
  const b1 = rows, b3 = aggregate(rows, 3), b5 = aggregate(rows, 5), b15 = aggregate(rows, 15);
  return { rows, H, b3, b5, b15, atr15: atrOf(b15), rsi: { 1: rsiOf(b1), 3: rsiOf(b3), 5: rsiOf(b5), 15: rsiOf(b15) }, tf: { 1: b1, 3: b3, 5: b5, 15: b15 } };
}

export function run13(P, inst, o = {}) {
  const { spread = spreadOf(inst), pips = bufOf(inst), zone = 0.3, dcBars = 2, maxAgeDays = null, isoAtr = 3, divMin = 3, minR = 1.5, adrDays = 20,
    reentry = 1, kinds = ['risk'], breakEven = true, targetMode = 'rule', ltfDeg = 1, mtfDeg = 2, htfDeg = 3, episodesForCounter = 2, dcTf = 15, dcK = 1, beMode = 'ltf',
    sessions = null, perSession = 1 } = o;
  const pip = pipOf(inst), cost = spread * pip, buf = pips * pip;
  const { rows, H, b5, b15, atr15 } = P;
  const D1 = H.degrees[ltfDeg], D2 = H.degrees[mtfDeg], D3 = H.degrees[htfDeg];   // LTF, MTF, the one above
  const nearClose = t => { const a = rolloverOf(t); return t - a < 3600 || a + 86400 - t < 1800; };
  const rowAt = t => { let lo = 0, hi = rows.length; while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m][0] < t) lo = m + 1; else hi = m; } return lo; };

  /* ---------- levels ---------- */
  const rank = { LTF: 1, IPL: 2, PL: 3 };
  const map = new Map();
  for (const [D, src] of [[D1, 'LTF'], [D2, 'IPL'], [D3, 'PL']]) for (const e of D.events) {
    if (e.kind !== 'bos' || !e.prot || e.prot.p == null) continue;
    const side = e.dir > 0 ? 'L' : 'H', key = side + e.prot.p + '|' + e.prot.t, had = map.get(key);
    if (!had) map.set(key, { side, p: e.prot.p, t: e.prot.t, known: e.t, src });
    else { if (rank[src] > rank[had.src]) had.src = src; had.known = Math.min(had.known, e.t); }
  }
  const levels = [...map.values()];
  /* counter-trend levels: once the MTF has failed to break its leg's extreme in `episodesForCounter` separate attempts
     (a new level swept, or the same one an hour or more later) since its last real break, that extreme is a level to sell (buy) from */
  if (kinds.includes('counter')) {
    let ep = { 1: [], '-1': [] };
    for (const e of D2.events) {
      if (e.kind === 'bos') { ep = { 1: [], '-1': [] }; continue; }
      if (e.kind !== 'ncs' || D2.dirAt(e.t - 1) !== e.dir) continue;
      const list = ep[e.dir], last = list[list.length - 1];
      if (last && last.level === e.level && e.t - last.t < 3600) { last.t = e.t; continue; }
      list.push({ level: e.level, t: e.t });
      if (list.length >= episodesForCounter) {
        const st = D2.stateAt(e.t - 1); if (!st?.weak || st.weak.p == null) continue;
        levels.push({ side: e.dir > 0 ? 'H' : 'L', p: st.weak.p, t: st.weak.t, known: e.t, src: 'counter', episodes: list.length });
      }
    }
  }
  /* a level is gone when the structure that made it really breaks through it (his break: full body, carries on, holds,
     travels; a defended leg needs a displacement candle) — a counter level is gone on any real MTF break its way */
  const degOf = { LTF: D1, IPL: D2, PL: D3, counter: D2 };
  for (const L of levels) {
    L.broken = Infinity;
    const D = degOf[L.src], against = L.side === 'L' ? -1 : 1;
    for (const e of D.events) {
      if (e.kind !== 'bos' || e.t <= L.known || e.dir !== against) continue;
      if (L.src === 'counter' || (L.side === 'L' ? e.level <= L.p + 1e-9 : e.level >= L.p - 1e-9)) { L.broken = e.t; break; }
    }
  }
  /* a level is also let go after maxAgeDays: an old level is a stale one (Version 1) */
  if (maxAgeDays != null) for (const L of levels) L.broken = Math.min(L.broken, L.known + maxAgeDays * 86400);
  levels.sort((a, b) => a.known - b.known);
  const isolated = (L, t) => {           // the next unbroken level behind it, in ATRs of the 15m
    let next = null;
    const k = bsearch(b15, t - 900), a = k >= 0 ? atr15[k] : 0;
    for (const M of levels) { if (M === L || M.side !== L.side || M.src === 'LTF' || M.known > t || M.broken <= t) continue; if (Math.abs(M.p - L.p) < a) continue;
      if (L.side === 'L' ? M.p < L.p && (!next || M.p > next.p) : M.p > L.p && (!next || M.p < next.p)) next = M; }
    return { iso: !next || Math.abs(L.p - next.p) >= isoAtr * a, gap: next ? Math.abs(L.p - next.p) / (a || 1) : Infinity };
  };

  /* ---------- divergence at the sweep: RSI higher (lower) at the push's extreme than at the DC low, on 1/3/5/15m ---------- */
  const divCount = (aT, rejT, long) => {
    let n = 0;
    for (const m of [1, 3, 5, 15]) {
      const B = P.tf[m], R = P.rsi[m], ka = Math.max(0, bsearch(B, aT)), kz = bsearch(B, rejT);
      let kx = ka + 1; if (kx > kz) continue;
      for (let k = ka + 1; k <= kz; k++) if (long ? B[k][3] < B[kx][3] : B[k][2] > B[kx][2]) kx = k;
      let k0 = ka; for (let k = Math.max(0, ka - 2); k <= ka + 2 && k < kx; k++) if (long ? B[k][3] < B[k0][3] : B[k][2] > B[k0][2]) k0 = k;
      if (long ? R[kx] > R[k0] : R[kx] < R[k0]) n++;
    }
    return n;
  };

  /* ---------- the MTF failing to break: its last NC+S of the leg's extreme, per direction pushed ---------- */
  const fails = { 1: [], '-1': [] };
  for (const e of D2.events) if (e.kind === 'ncs') fails[e.dir].push(e);
  const lastFail = (dirPushed, t) => { const a = fails[dirPushed]; const k = bsearch(a, t, x => x.t); return k >= 0 ? a[k] : null; };
    const bos3 = D2.events.filter(e => e.kind === 'bos');
  const bosBefore = t => { const k = bsearch(bos3, t, x => x.t); return k >= 0 ? bos3[k] : null; };
  /* failed the other way since the last real MTF break: lets a continuation go against the MTF */
  /* the MTF has failed to break its own way in two separate attempts since its last real break: no more trades its way */
  const failedTwice = (d, t) => { const b = bosBefore(t), a = fails[d], k = bsearch(a, t, x => x.t); let n = 0, last = null;
    for (let q = k; q >= 0 && (!b || a[q].t > b.t); q--) { if (!last || last.level !== a[q].level || last.t - a[q].t >= 3600) n++; last = a[q]; }
    return n >= 2; };
  const failedAgainst = (d, t) => { const a = fails[-d], b = bosBefore(t); let k = bsearch(a, t, x => x.t); if (k < 0 || (b && a[k].t <= b.t)) return null;
    while (k > 0 && (!b || a[k - 1].t > b.t)) k--; return a[k]; };     // the first failure since the last real break: its swing is where the failed leg was aiming

  /* ---------- signals ---------- */
  const signals = [];
  /* DC at levels, read on the MTF chart's candles (15m), swings one candle either side */
  {
    const K = dcK, live = [], bars = P.tf[dcTf] || aggregate(rows, dcTf), SZ = dcTf * 60;
    let li = 0;
    const swingAt = (j, side) => { if (j < K || j + K >= bars.length) return false; const v = side === 'L' ? bars[j][3] : bars[j][2]; for (let q = j - K; q <= j + K; q++) { if (q === j) continue; const w = side === 'L' ? bars[q][3] : bars[q][2]; if (side === 'L' ? (q < j ? w < v : w <= v) : (q < j ? w > v : w >= v)) return false; } return true; };
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i], tEnd = b[0] + SZ;
      while (li < levels.length && levels[li].known <= b[0]) live.push({ lv: levels[li++], st: { phase: 0, hi: null, tries: 0, after: 0 } });
      for (let q = live.length - 1; q >= 0; q--) {
        const { lv, st } = live[q], long = lv.side === 'L', d = long ? 1 : -1, L = lv.p;
        if (lv.broken <= b[0] || st.phase === 9) { live.splice(q, 1); continue; }
        st.hi = st.hi == null ? (long ? b[2] : b[3]) : long ? Math.max(st.hi, b[2]) : Math.min(st.hi, b[3]);
        const reach = Math.abs(st.hi - L) * zone, j = i - K;
        if (st.phase === 0 && j > st.after && bars[j][0] >= lv.known && swingAt(j, long ? 'L' : 'H')) {
          const a = long ? bars[j][3] : bars[j][2];
          if (long ? a <= L + reach : a >= L - reach) { st.phase = 1; st.a = { i: j, t: bars[j][0], p: a }; }
        }
        if (st.phase === 1 && i > st.a.i && (long ? b[3] < st.a.p : b[2] > st.a.p)) { st.phase = 2; st.s2 = { i, t: b[0] }; st.x = long ? b[3] : b[2]; st.firstSweep = !st.levelSwept && (long ? st.x < L : st.x > L); }
        if (st.phase === 2) {
          if (long ? b[3] < st.x : b[2] > st.x) st.x = long ? b[3] : b[2];
          if (long ? b[4] > b[1] : b[4] < b[1]) {           // the rejection candle has closed
            /* the push that sweeps the level for the first time is the level's own sweep (IPL+S), not the trade: the next DC is */
            const firstSweep = !st.levelSwept && (long ? st.x < L : st.x > L);
            if (long ? st.x < L : st.x > L) st.levelSwept = true;
            if (firstSweep) { st.phase = 0; st.after = i - K; continue; }
            const ok = st.s2.i - st.a.i >= dcBars;
            if (ok) signals.push({ type: 'dc', d, lv, a: st.a, s2: st.s2, x: st.x, rejT: b[0], t: tEnd, swept: long ? st.x < L : st.x > L });
            st.tries++; st.phase = st.tries > reentry ? 9 : 0; st.after = i;
          }
        }
      }
    }
  }
  signals.sort((a, b) => a.t - b.t);

  /* ---------- the day's range left: the last adrDays days' average range, less what today has done ---------- */
  const days = []; { let cur = null; for (const r of rows) { const a = rolloverOf(r[0]); if (!cur || cur.a !== a) { cur = { a, hi: r[2], lo: r[3] }; days.push(cur); } else { if (r[2] > cur.hi) cur.hi = r[2]; if (r[3] < cur.lo) cur.lo = r[3]; } } }
  const rangeLeft = (t, k0) => {
    const a = rolloverOf(t), di = bsearch(days, a, x => x.a); if (di < adrDays) return Infinity;
    let s = 0; for (let k = di - adrDays; k < di; k++) s += days[k].hi - days[k].lo;
    let hi = -Infinity, lo = Infinity; for (let k = rowAt(a); k < k0; k++) { if (rows[k][2] > hi) hi = rows[k][2]; if (rows[k][3] < lo) lo = rows[k][3]; }
    return Math.max(0, s / adrDays - (hi > lo ? hi - lo : 0));
  };
  /* internal swings still standing (not traded through) — candidate internal targets */
  const internalTarget = (d, E, R, t, aT) => {
    let best = null;
    for (const D of [D1, D2]) {
      const sw = D.swings, kz = bsearch(sw, t, s => s.known);
      for (let k = kz; k >= 0 && k > kz - 400; k--) {
        const s = sw[k]; if (s.side !== (d > 0 ? 'H' : 'L')) continue;
        if (d > 0 ? s.p <= E + minR * R : s.p >= E - minR * R) continue;
        /* still standing: price has not traded past it since it formed */
        if (t - s.t > 5 * 86400) break;
        const k1 = bsearch(b5, s.t) + 1, k2 = bsearch(b5, t - 300);
        let taken = false; for (let r = k1; r <= k2; r++) { if (d > 0 ? b5[r][2] > s.p : b5[r][3] < s.p) { taken = true; break; } }
        if (taken) continue;
        if (!best || (d > 0 ? s.p < best.p : s.p > best.p)) best = { p: s.p, t: s.t, src: D === D1 ? 'LTF swing' : 'MTF internal swing' };
      }
    }
    return best;
  };

  /* ---------- take them, one at a time ---------- */
  const trades = [], skipped = {};
  const bosL = D1.events.filter(e => e.kind === 'bos');
  let cur = null;
  const skip = w => { skipped[w] = (skipped[w] || 0) + 1; if (cur) cur.skip = w; };
  let freeAt = 0;
  const usedSession = new Map();
  for (const s of signals) {
    cur = s;
    if (s.t < freeAt) { skip('busy'); continue; }
    if (nearClose(s.t)) { skip('close'); continue; }
    const sess = sessions ? sessionOf(s.t, sessions) : null;
    if (sessions && !sess) { skip('outside 3SL'); continue; }
    if (sess && (usedSession.get(sess) || 0) >= perSession) { skip('session used'); continue; }
    const d = s.d, long = d > 0, ltf = D1.dirAt(s.t - 1), mtf = D2.dirAt(s.t - 1);
    let kind = null, why = '';
    if (s.lv.src === 'counter') {
      if (mtf !== -d) { skip('counter not against MTF'); continue; }
      kind = 'counter'; why = `MTF failed ${s.lv.episodes}×`;
    } else {
      const fa = failedAgainst(d, s.t);
      if (mtf === d && failedTwice(d, s.t)) { skip('MTF failed twice its way'); continue; }
      if (ltf === d && (mtf === d || fa)) { kind = 'cont'; why = mtf === d ? 'with MTF' : 'after MTF failed'; }
      else if (ltf !== d && mtf === d && s.lv.src !== 'LTF') {
        const iso = isolated(s.lv, s.t), dv = divCount(s.a.t, s.rejT, long);
        if (iso.iso || dv >= divMin) { kind = 'risk'; why = iso.iso ? `empty space ${iso.gap === Infinity ? '∞' : iso.gap.toFixed(1)} ATR` : `divergence ${dv}/4`; }
        else { skip('risk without space or divergence'); continue; }
      } else { skip('no direction'); continue; }
    }
    if (!kinds.includes(kind)) { skip('kind off'); continue; }
    const k0 = rowAt(s.t); if (k0 >= rows.length) break;
    const E = rows[k0][1] + (long ? cost : -cost), SL = long ? s.x - buf : s.x + buf, R = Math.abs(E - SL);
    if (!(R > 0) || (long ? E <= SL : E >= SL)) { skip('bad stop'); continue; }
    /* the weak structure */
    let weak = null;
    if (kind === 'counter') { const f = failedAgainst(d, s.t); if (f) { let m = null; for (let k = rowAt(f.from); k < k0; k++) if (m == null || (long ? rows[k][2] > m : rows[k][3] < m)) m = long ? rows[k][2] : rows[k][3]; if (m != null && (long ? m > E : m < E)) weak = { p: m, t: s.t, src: 'weak (failed leg)' }; } }
    else if (mtf === d) { const st = D2.stateAt(s.t - 1); if (st?.weak?.p != null && (long ? st.weak.p > E : st.weak.p < E)) weak = { p: st.weak.p, t: st.weak.t, src: 'weak (MTF leg)' }; }
    else { const f = failedAgainst(d, s.t); if (f) { let m = null, mt = null; for (let k = rowAt(f.from); k < k0; k++) if (!m || (long ? rows[k][2] > m : rows[k][3] < m)) { m = long ? rows[k][2] : rows[k][3]; mt = rows[k][0]; } if (m != null && (long ? m > E : m < E)) weak = { p: m, t: mt, src: 'weak (failed leg)' }; } }
    if (!weak) { const st = D3.stateAt(s.t - 1); if (st?.dir === d && st.weak?.p != null && (long ? st.weak.p > E : st.weak.p < E)) weak = { p: st.weak.p, t: st.weak.t, src: 'weak (HTF leg)' }; }
    let tp = null;
    const left = rangeLeft(s.t, k0);
    const inside = internalTarget(d, E, R, s.t);
    if (targetMode === 'weak') tp = weak;
    else if (weak && Math.abs(weak.p - E) <= left) tp = weak;
    else tp = inside || weak;
    if (!tp) { skip('no target'); continue; }
    const rr = Math.abs(tp.p - E) / R;
    if (rr < minR) { s.dbg = { E, SL, tp: tp.p, src: tp.src, weak: weak?.p, left, inside: inside?.p }; skip('under 1.5R'); continue; }
    /* walk it: break-even on a 5m swing formed after the entry, broken by a full close while in profit */
    let sl = SL, be = null, exit = null, ib = bsearch(b5, rows[k0][0]) + 1, beLvl = null, bi = Math.max(0, bsearch(bosL, rows[k0][0], x => x.t) + 1);
    for (let k = k0; k < rows.length; k++) {
      const [t, op, h, l] = rows[k];
      if (long ? l <= sl : h >= sl) { const p = long ? Math.min(sl, op) : Math.max(sl, op); exit = { t, p, why: be ? 'be' : 'sl', gap: long ? op < sl : op > sl }; break; }   /* a gap past the stop fills at the open */
      if (long ? h >= tp.p : l <= tp.p) { exit = { t, p: tp.p, why: 'tp' }; break; }
      if (beMode === 'ltf') { while (bi < bosL.length && bosL[bi].t <= t + 60) { const e = bosL[bi++]; if (!be && e.dir === d && e.from >= rows[k0][0] && (long ? e.level > E : e.level < E)) { be = { t: e.t, lvl: e.level }; sl = E; } } }
      else while (breakEven && !be && ib < b5.length && b5[ib][0] + 300 <= t + 60) {
        const bb = b5[ib], j = ib - 2;
        if (j >= 2 && b5[j - 2][0] >= rows[k0][0]) { let piv = true; const v = long ? b5[j][2] : b5[j][3]; for (let q = j - 2; q <= j + 2; q++) { if (q === j) continue; const w = long ? b5[q][2] : b5[q][3]; if (long ? (q < j ? w > v : w >= v) : (q < j ? w < v : w <= v)) { piv = false; break; } } if (piv) beLvl = v; }
        if (beLvl != null && (long ? closesAbove(bb, beLvl, 0.5) && bb[4] > E : closesBelow(bb, beLvl, 0.5) && bb[4] < E)) { be = { t: bb[0] + 300, lvl: beLvl }; sl = E; }
        ib++;
      }
    }
    if (!exit) continue;
    const r = (long ? exit.p - E : E - exit.p) / R;
    /* in the shape the Quant page reads (the same as quant.js's trades) */
    const side = s.lv.side, lab = s.lv.src === 'counter' ? (side === 'H' ? 'weak H' : 'weak L') : s.lv.src === 'PL' ? (side === 'L' ? 'PL' : 'PH') : s.lv.src === 'IPL' ? (side === 'L' ? 'IPL' : 'IPH') : (side === 'L' ? 'LTF PL' : 'LTF PH');
    trades.push({ id: trades.length + 1, kind, setup: kind === 'risk' ? 'Risk entry' : kind === 'cont' ? 'Continuation' : 'Counter', because: why, session: sess,
      dir: d, tf: dcTf, etf: dcTf, level: { p: s.lv.p, t: s.lv.t, label: lab, src: s.lv.src }, s1: { t: s.a.t, p: s.a.p }, s2: { t: s.s2.t, p: s.x }, sweepX: s.x,
      rej: { t: s.rejT }, openT: rows[k0][0], entry: E, sl: SL, tp: tp.p, tpT: tp.t ?? s.lv.t, target: tp.src, rr, be, closeT: exit.t, exit: exit.p, why: exit.why, gap: !!exit.gap, r });
    freeAt = exit.t + 60;
    if (sess) usedSession.set(sess, (usedSession.get(sess) || 0) + 1);
  }
  return { trades, skipped, signals: signals.length, from: rows.length ? rows[0][0] : 0, to: rows.length ? rows[rows.length - 1][0] : 0 };
}
