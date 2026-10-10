/* ============================================================
   The Lab · Quant — ten years, every pair.

     • Ten years: each pair Replay has downloaded, the three versions'
       R after each trade, side by side (small multiples, one scale per pair).
     • Every year: one pair's years as bars — each version's % at 1% risk
       a trade against simply buying and holding the pair that year.
     • Volatility: a surface to turn with the mouse — realised volatility
       by lookback (5 days to 6 months) and date — with the pairs picked
       for comparison drawn on its back walls.

   The work (quant10.js) runs in its own worker, a pair and a year at a
   time, gold first; what is done is kept on this computer (localStorage),
   so it runs once per download. Charts animate when what they show
   changes — never on a redraw that shows the same thing.
   ============================================================ */
import { el, svg, fitted } from '../ui.js';
import * as rd from '../replaydata.js';
import { rolloverOf } from '../candles.js';
import * as V from '../quantversions.js';
import * as T10 from '../quant10.js';
import { nameOf, spreadOf, bufOf } from '../pips.js';
import { ticks } from './chartkit.js';
import { calm, ease } from './motion.js';

/* the three versions — a categorical set validated on the dark card (blue, amber, violet); buy and hold stays neutral */
export const SERIES = { q1: '#3987e5', q2: '#c98500', q3: '#9085e9' };
const HOLD = '#8b918f';
/* pairs keep their hue wherever they appear */
const PAIR_HUES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767', '#4fa34f'];
const ENG = 'q10.1';
const rT = (r, dp = 0) => `${r > 1e-9 ? '+' : r < -1e-9 ? '−' : ''}${Math.abs(r).toFixed(dp)}R`;
const pT = (v, dp = 0) => `${v > 1e-9 ? '+' : v < -1e-9 ? '−' : ''}${Math.abs(v).toFixed(dp)}%`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthOf = t => { const d = new Date(t * 1000); return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const store = {
  get(k) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked: it runs again next time */ } },
};

/* ============================================================
   The work: one controller for the app's life
   ============================================================ */
const lab = {
  sig: null, pairs: [], data: new Map(), status: null, running: false, listeners: new Set(), seq: 0,
  versions: V.BUILTIN,
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { this.seq++; for (const fn of [...this.listeners]) { try { fn(); } catch { /* a card gone */ } } },
};
const jobsFor = inst => lab.versions.map(v => {
  const o = V.optionsOf(v);
  return V.engineOf(v) === '13' ? { key: v.id, engine: '13', opts: o } : { key: v.id, engine: '12', opts: { ...o, spread: spreadOf(inst), pips: bufOf(inst) } };
});
const engSig = () => ENG + JSON.stringify(lab.versions.map(v => [v.id, V.optionsOf(v)]));

/* the worker for these runs — its own, so the page's runs never wait behind ten years */
const pool = (() => {
  let w = null, broken = false, seq = 0;
  const waiting = new Map();
  const start = () => {
    if (w || broken || typeof Worker !== 'function') return w;
    try {
      w = new Worker(new URL('js/quantworker.js', document.baseURI), { type: 'module' });
      w.onmessage = e => { const it = waiting.get(e.data?.id); if (!it) return; waiting.delete(e.data.id); e.data.error ? it.reject(new Error(e.data.error)) : it.resolve(e.data.out); };
      w.onerror = e => { e.preventDefault?.(); broken = true; try { w.terminate(); } catch { /* gone */ } w = null; for (const it of waiting.values()) it.retry(); waiting.clear(); };
    } catch { broken = true; w = null; }
    return w;
  };
  const here = (rows, inst, jobs, a, b) => new Promise((res, rej) => setTimeout(() => { try { res(T10.runChunk(rows, inst, jobs, a, b)); } catch (e) { rej(e); } }, 30));
  return {
    chunk(rows, inst, jobs, keepFrom, keepTo) {
      if (!start()) return here(rows, inst, jobs, keepFrom, keepTo);
      return new Promise((resolve, reject) => {
        const flat = new Float64Array(rows.length * 5);
        for (let i = 0, k = 0; i < rows.length; i++, k += 5) { const r = rows[i]; flat[k] = r[0]; flat[k + 1] = r[1]; flat[k + 2] = r[2]; flat[k + 3] = r[3]; flat[k + 4] = r[4]; }
        const id = ++seq;
        waiting.set(id, { resolve, reject, retry: () => here(rows, inst, jobs, keepFrom, keepTo).then(resolve, reject) });
        w.postMessage({ type: 'chunk', id, flat, inst, jobs, keepFrom, keepTo }, [flat.buffer]);
      });
    },
  };
})();

const pause = () => new Promise(r => setTimeout(r, 0));

async function ensure() {
  if (lab.running) return;
  const ix = await rd.readIndex();
  const pairs = Object.entries(ix.pairs || {}).map(([inst, p]) => ({ inst, months: Object.keys(p.months || {}).sort(), meta: p.months || {} }))
    .filter(p => p.months.length >= 6)
    .sort((a, b) => (a.inst === 'XAU_USD' ? -1 : b.inst === 'XAU_USD' ? 1 : a.inst.localeCompare(b.inst)));
  for (const p of pairs) p.sig = p.months.map(k => k + (p.meta[k].at || '')).join('|');
  const sig = pairs.map(p => p.inst + ':' + p.sig).join(';') + engSig();
  if (sig === lab.sig && lab.data.size && [...lab.data.values()].every(d => d.done)) return;
  lab.sig = sig; lab.pairs = pairs;
  const eng = engSig();
  for (const p of pairs) {
    const plan = T10.planYears(p.months);
    const c = store.get('quire.q10.' + p.inst);
    const fresh = c && c.sig === p.sig;
    const d = { inst: p.inst, plan, daily: fresh && c.daily ? c.daily : null, years: fresh && c.eng === eng && c.years ? c.years : {}, done: false, hue: PAIR_HUES[pairs.indexOf(p) % PAIR_HUES.length] };
    d.done = plan.every(y => d.years[y.year]);
    lab.data.set(p.inst, d);
  }
  for (const inst of [...lab.data.keys()]) if (!pairs.some(p => p.inst === inst)) lab.data.delete(inst);
  lab.emit();
  lab.running = true;
  const save = (p, d) => store.set('quire.q10.' + p.inst, { sig: p.sig, eng, daily: d.daily, years: d.years });
  try {
    /* first every pair's days (quick: the volatility surface and buy-and-hold need only these) */
    for (const p of pairs) {
      const d = lab.data.get(p.inst);
      if (d.daily) continue;
      lab.status = { inst: p.inst, what: 'days', k: 0, n: p.months.length }; lab.emit();
      const days = [];
      for (let i = 0; i < p.months.length; i++) {
        const rows = await rd.readMonth(p.inst, p.months[i]);
        if (rows) for (const x of T10.dailyOf(rows, rolloverOf)) {
          const last = days[days.length - 1];
          if (last && last[0] === x[0]) { last[2] = x[4]; } else days.push([x[0], x[1], x[4]]);
        }
        if (i % 6 === 5) { lab.status = { inst: p.inst, what: 'days', k: i + 1, n: p.months.length }; lab.emit(); await pause(); }
      }
      d.daily = days.map(x => [x[0], +x[1].toPrecision(7), +x[2].toPrecision(7)]);
      save(p, d); lab.emit();
    }
    /* then every version over every year, pair by pair */
    const totalYears = pairs.reduce((a, p) => a + lab.data.get(p.inst).plan.length, 0);
    let doneYears = pairs.reduce((a, p) => a + Object.keys(lab.data.get(p.inst).years).length, 0);
    for (const p of pairs) {
      const d = lab.data.get(p.inst);
      const jobs = jobsFor(p.inst);
      for (const y of d.plan) {
        if (d.years[y.year]) continue;
        lab.status = { inst: p.inst, what: 'year', year: y.year, k: doneYears, n: totalYears }; lab.emit();
        const rows = await rd.candlesBetween(p.inst, rd.monthStart(y.months[0]), rd.monthEnd(y.months[y.months.length - 1]));
        d.years[y.year] = rows.length ? await pool.chunk(rows, p.inst, jobs, y.keepFrom, y.keepTo) : Object.fromEntries(jobs.map(j => [j.key, []]));
        doneYears++;
        save(p, d); lab.emit();
      }
      d.done = true; lab.emit();
    }
  } catch (e) {
    lab.status = { error: String(e.message || e) };
  } finally {
    lab.running = false;
    if (!lab.status?.error) lab.status = null;
    lab.emit();
  }
}
/** A pair's trades for one version, in time order (compact: [openT, closeT, r, dir]). */
const tradesOf = (d, key) => { const out = []; for (const y of d.plan) { const r = d.years[y.year]; if (r?.[key]) out.push(...r[key]); } return out.sort((a, b) => a[0] - b[0]); };

/* the cards listen while they are on the page */
function listen(node, paint) {
  const off = lab.on(() => { if (!node.isConnected) { off(); return; } paint(); });
}

/* ============================================================
   Ten years — small multiples
   ============================================================ */
const drawn = new Map();   // inst + version → how many trades its line showed last time (a growing line draws on from there)

export function tenYearCard() {
  const legend = el('div', { class: 'q10-legend' }, ...lab.versions.map(v => el('span', {}, el('i', { style: { background: SERIES[v.id] } }), `${v.name} · ${v.tag}`)));
  const prog = el('div', { class: 'q10-prog' });
  const grid = el('div', { class: 'q10-grid' });
  const empty = el('p', { class: 'lab-empty', hidden: true }, 'Download pairs on Replay → Data (10 years) and they show here.');
  const card = el('section', { class: 'card lab-chart q10' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Ten years'), el('span', { class: 'lab-sub' }, 'every pair downloaded · R after each trade · spread paid on every entry')),
    legend, prog, empty, grid);
  const panels = new Map();
  const paint = () => {
    paintProgress(prog);
    for (const [inst, d] of lab.data) {
      const key = lab.versions.map(v => tradesOf(d, v.id).length).join(',') + (d.done ? 'd' : '');
      const had = panels.get(inst);
      if (had && had.key === key) continue;
      const node = el('div', { class: 'q10-panel', 'data-inst': inst },
        el('div', { class: 'q10-ph' }, el('b', {}, nameOf(inst)), el('span', { class: 'lab-sub' }, d.done ? `${d.plan.length} years` : Object.keys(d.years).length ? `${Object.keys(d.years).length} of ${d.plan.length} years` : 'waiting')),
        fitted((w, h) => tenChart(d, w, h), 190));
      if (had) had.node.replaceWith(node); else grid.append(node);
      panels.set(inst, { key, node });
    }
    for (const [inst, p] of panels) if (!lab.data.has(inst)) { p.node.remove(); panels.delete(inst); }
    empty.hidden = !!lab.data.size || lab.running;
  };
  paint();
  listen(card, paint);
  ensure();
  return card;
}

function paintProgress(prog) {
  const s = lab.status;
  if (!s) { prog.replaceChildren(); prog.hidden = true; return; }
  prog.hidden = false;
  if (s.error) { prog.replaceChildren(el('span', { class: 'lab-sub' }, `Stopped: ${s.error}`)); return; }
  const share = s.n ? s.k / s.n : 0;
  const bar = el('div', { class: 'lab-progress' }, el('i', { style: { width: Math.round(share * 100) + '%' } }));
  prog.replaceChildren(bar, el('span', { class: 'lab-sub' }, s.what === 'days' ? `${nameOf(s.inst)} · reading ${s.k} of ${s.n} months` : `${nameOf(s.inst)} · trading ${s.year} · ${s.k} of ${s.n} years done`));
}

function tenChart(d, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap q10-chart' });
  const plot = { l: 40, r: W - 46, t: 10, b: H - 20 };
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const x0 = d.plan[0]?.keepFrom ?? 0, x1 = d.plan[d.plan.length - 1]?.keepTo ?? 1;
  const lines = lab.versions.map(v => {
    const T = tradesOf(d, v.id);
    const pts = [[x0, 0]]; let c = 0;
    for (const t of T) { c += t[2]; pts.push([t[1], c]); }
    return { v, T, pts, total: c };
  });
  let lo = 0, hi = 0;
  for (const L of lines) for (const [, y] of L.pts) { if (y < lo) lo = y; if (y > hi) hi = y; }
  const pad = (hi - lo) * 0.08 || 4; lo -= pad; hi += pad;
  const X = t => plot.l + ((t - x0) / (x1 - x0 || 1)) * (plot.r - plot.l), Y = v => plot.b - ((v - lo) / (hi - lo)) * (plot.b - plot.t);
  for (const v of ticks(lo, hi, 4)) {
    g.append(svg('line', { class: Math.abs(v) < 1e-9 ? 'lab-zero' : 'lab-grid', x1: plot.l, x2: plot.r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: plot.l - 6, y: Y(v) + 3.5, 'text-anchor': 'end' }, rT(v)));
  }
  const y0 = new Date(x0 * 1000).getUTCFullYear(), y1 = new Date(x1 * 1000).getUTCFullYear();
  const every = W < 420 ? 4 : 2;
  for (let y = y0 + 1; y <= y1; y++) if ((y - y0) % every === 0 || y === y1) { const t = Date.UTC(y, 0, 1) / 1000; if (t > x0 && t < x1) g.append(svg('text', { class: 'lab-tick', x: X(t), y: H - 5, 'text-anchor': 'middle' }, String(y))); }
  /* the lines, drawn on from where each stood last time */
  const ends = [];
  for (const L of lines) {
    if (L.pts.length < 2) continue;
    const dpath = L.pts.map(([t, v], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    const path = svg('path', { class: 'q10-line', d: dpath, stroke: SERIES[L.v.id], pathLength: 1 });
    g.append(path);
    const k = d.inst + L.v.id, before = drawn.get(k) ?? 0, now = L.T.length;
    drawn.set(k, now);
    if (!calm() && now > before) {
      const from = 1 - before / now;
      path.style.strokeDasharray = '1';
      path.animate([{ strokeDashoffset: from }, { strokeDashoffset: 0 }], { duration: before ? 700 : 1300, easing: 'cubic-bezier(.5,1,.89,1)', fill: 'backwards' });
    }
    const [te, ve] = L.pts[L.pts.length - 1];
    ends.push({ x: X(te), y: Y(ve), total: L.total, id: L.v.id });
  }
  /* direct labels at the line ends, pushed apart */
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
  for (const e of ends) {
    g.append(svg('circle', { cx: e.x, cy: e.y, r: 2.6, fill: SERIES[e.id], class: 'q10-end' }));
    g.append(svg('text', { class: 'q10-endlab', x: plot.r + 6, y: e.y + 3.5 }, rT(e.total)));
  }
  /* hover: every version's total at that moment */
  const cross = svg('line', { class: 'lab-cross', y1: plot.t, y2: plot.b, visibility: 'hidden' });
  const hit = svg('rect', { x: plot.l, y: plot.t, width: Math.max(0, plot.r - plot.l), height: Math.max(0, plot.b - plot.t), fill: 'transparent' });
  const read = el('div', { class: 'lab-read', hidden: true });
  g.append(cross, hit);
  const totalAt = (L, t) => { let lo2 = 0, hi2 = L.pts.length - 1, k = 0; while (lo2 <= hi2) { const m = (lo2 + hi2) >> 1; if (L.pts[m][0] <= t) { k = m; lo2 = m + 1; } else hi2 = m - 1; } return L.pts[k][1]; };
  hit.addEventListener('pointermove', e => {
    const box = hit.getBoundingClientRect(), px = plot.l + (e.clientX - box.left) * ((plot.r - plot.l) / box.width);
    const t = x0 + ((px - plot.l) / (plot.r - plot.l)) * (x1 - x0);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
    read.replaceChildren(el('div', { class: 'h' }, monthOf(t)), ...lines.map(L => el('div', { class: 'r' }, el('i', { style: { background: SERIES[L.v.id] } }), el('b', {}, rT(totalAt(L, t), 1)), el('span', {}, L.v.name))));
    read.hidden = false;
    const w = wrap.clientWidth, rw = read.offsetWidth;
    read.style.left = Math.max(4, Math.min(w - rw - 4, px + 12 + rw > w - 4 ? px - rw - 12 : px + 12)) + 'px';
  });
  hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); read.hidden = true; });
  wrap.append(g, read);
  return wrap;
}

/* ============================================================
   Every year — the versions against buying and holding
   ============================================================ */
const yearsUi = { inst: 'XAU_USD' };
const playedYears = new Set();

export function yearsCard() {
  const chips = el('div', { class: 'q10-chips' });
  const legend = el('div', { class: 'q10-legend' }, ...lab.versions.map(v => el('span', {}, el('i', { style: { background: SERIES[v.id] } }), v.name)), el('span', {}, el('i', { style: { background: HOLD } }), 'Buy & hold'));
  const body = el('div', { class: 'q10-years' });
  const card = el('section', { class: 'card lab-chart q10' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Every year'), el('span', { class: 'lab-sub' }, '% a year at 1% risk a trade · against buying and holding the pair')),
    chips, legend, body);
  let shownKey = null;
  const paint = () => {
    const ready = [...lab.data.values()].filter(d => d.daily && Object.keys(d.years).length);
    if (!ready.some(d => d.inst === yearsUi.inst) && ready.length) yearsUi.inst = ready[0].inst;
    chips.replaceChildren(...ready.map(d => el('button', { class: 'chip' + (d.inst === yearsUi.inst ? ' is-on' : ''), onClick: () => { yearsUi.inst = d.inst; paint(); } }, nameOf(d.inst))));
    const d = lab.data.get(yearsUi.inst);
    if (!d || !d.daily || !Object.keys(d.years).length) { body.replaceChildren(el('p', { class: 'lab-empty' }, 'Working through the years…')); shownKey = null; return; }
    const key = d.inst + ':' + Object.keys(d.years).length;
    if (key === shownKey) return;
    shownKey = key;
    const play = !calm() && !playedYears.has(key);
    playedYears.add(key);
    body.replaceChildren(fitted((w, h) => yearBars(d, w, h, play), 230));
  };
  paint();
  listen(card, paint);
  return card;
}

function yearBars(d, W, H, play) {
  const wrap = el('div', { class: 'lab-svgwrap q10-chart' });
  const hold = T10.holdYearly(d.daily);
  const per = lab.versions.map(v => T10.yearly(tradesOf(d, v.id)));
  const years = d.plan.map(y => y.year).filter(y => d.years[y]);
  const rows = years.map(y => ({ y, vals: [...per.map(m => m.get(y) || 0), hold.get(y) ?? 0] }));
  const plot = { l: 40, r: W - 8, t: 10, b: H - 22 };
  let lo = 0, hi = 0;
  for (const r of rows) for (const v of r.vals) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const pad = (hi - lo) * 0.08 || 2; lo -= pad; hi += pad;
  const Y = v => plot.b - ((v - lo) / (hi - lo)) * (plot.b - plot.t);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  for (const v of ticks(lo, hi, 4)) {
    g.append(svg('line', { class: Math.abs(v) < 1e-9 ? 'lab-zero' : 'lab-grid', x1: plot.l, x2: plot.r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: plot.l - 6, y: Y(v) + 3.5, 'text-anchor': 'end' }, pT(v)));
  }
  const n = rows.length || 1, slot = (plot.r - plot.l) / n, inner = slot * 0.74, gap = 2, bw = Math.max(2, (inner - gap * 3) / 4);
  const colours = [...lab.versions.map(v => SERIES[v.id]), HOLD];
  const y0 = Y(0);
  rows.forEach((r, i) => {
    const xs = plot.l + i * slot + (slot - inner) / 2;
    g.append(svg('text', { class: 'lab-tick', x: plot.l + i * slot + slot / 2, y: H - 6, 'text-anchor': 'middle' }, n > 8 && W < 520 ? `'${String(r.y).slice(2)}` : String(r.y)));
    r.vals.forEach((v, k) => {
      const x = xs + k * (bw + gap), yv = Y(v), top = Math.min(yv, y0), h = Math.max(1, Math.abs(yv - y0));
      const rad = Math.min(4, bw / 2, h);
      /* rounded at the data end only, square on the baseline */
      const p = v >= 0
        ? `M${x},${y0}V${top + rad}Q${x},${top} ${x + rad},${top}H${x + bw - rad}Q${x + bw},${top} ${x + bw},${top + rad}V${y0}Z`
        : `M${x},${y0}V${top + h - rad}Q${x},${top + h} ${x + rad},${top + h}H${x + bw - rad}Q${x + bw},${top + h} ${x + bw},${top + h - rad}V${y0}Z`;
      const bar = svg('path', { d: p, fill: colours[k], class: 'q10-bar' });
      if (play) {
        bar.style.transformOrigin = `0 ${y0}px`;
        bar.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 650, delay: 60 + i * 55 + k * 30, easing: 'cubic-bezier(.5,1,.89,1)', fill: 'backwards' });
      }
      g.append(bar);
    });
  });
  /* hover a year: the four numbers */
  const read = el('div', { class: 'lab-read', hidden: true });
  const band = svg('rect', { class: 'q10-band', y: plot.t, height: Math.max(0, plot.b - plot.t), width: slot, visibility: 'hidden' });
  g.prepend(band);
  const hit = svg('rect', { x: plot.l, y: plot.t, width: Math.max(0, plot.r - plot.l), height: Math.max(0, plot.b - plot.t), fill: 'transparent' });
  g.append(hit);
  hit.addEventListener('pointermove', e => {
    const box = hit.getBoundingClientRect(), px = plot.l + (e.clientX - box.left) * ((plot.r - plot.l) / box.width);
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - plot.l) / slot))), r = rows[i];
    if (!r) return;
    band.setAttribute('x', plot.l + i * slot); band.setAttribute('visibility', 'visible');
    read.replaceChildren(el('div', { class: 'h' }, `${nameOf(d.inst)} · ${r.y}`),
      ...r.vals.map((v, k) => el('div', { class: 'r' }, el('i', { style: { background: colours[k] } }), el('b', {}, pT(v, 1)), el('span', {}, k < lab.versions.length ? lab.versions[k].name : 'Buy & hold'))));
    read.hidden = false;
    const w = wrap.clientWidth, rw = read.offsetWidth, cx = plot.l + i * slot + slot / 2;
    read.style.left = Math.max(4, Math.min(w - rw - 4, cx + slot / 2 + rw > w - 4 ? cx - slot / 2 - rw - 6 : cx + slot / 2 + 6)) + 'px';
  });
  hit.addEventListener('pointerleave', () => { band.setAttribute('visibility', 'hidden'); read.hidden = true; });
  wrap.append(g, read);
  return wrap;
}

/* ============================================================
   Volatility — a surface to turn
   ============================================================ */
const volUi = { picked: ['XAU_USD'], yaw: -0.75, pitch: 0.52, zoom: 1, played: null };

export function volCard() {
  const chips = el('div', { class: 'q10-chips' });
  const stage = el('div', { class: 'q10-stage' });
  const card = el('section', { class: 'card lab-chart q10 q10-vol' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Volatility'), el('span', { class: 'lab-sub' }, 'drag to turn · scroll to zoom · double-click to reset')),
    chips, stage);
  let surf = null, shownKey = null;
  const paint = () => {
    const ready = [...lab.data.values()].filter(d => d.daily && d.daily.length > 140);
    volUi.picked = volUi.picked.filter(i => ready.some(d => d.inst === i));
    if (!volUi.picked.length && ready.length) volUi.picked = [ready[0].inst];
    chips.replaceChildren(...ready.map(d => {
      const on = volUi.picked.includes(d.inst), main = volUi.picked[0] === d.inst;
      return el('button', { class: 'chip q10-pchip' + (on ? ' is-on' : '') + (main ? ' is-main' : ''), onClick: () => {
        if (main && volUi.picked.length > 1) volUi.picked.shift();
        else if (on) volUi.picked = [d.inst, ...volUi.picked.filter(i => i !== d.inst)];
        else volUi.picked = [d.inst, ...volUi.picked].slice(0, 3);
        paint();
      } }, el('i', { style: { background: d.hue } }), nameOf(d.inst));
    }));
    if (!volUi.picked.length) { stage.replaceChildren(el('p', { class: 'lab-empty' }, lab.running ? 'Reading the days…' : 'Download pairs on Replay → Data and they show here.')); surf = null; shownKey = null; return; }
    const sets = volUi.picked.map(i => { const d = lab.data.get(i); return { inst: i, hue: d.hue, S: (d.vol ??= T10.volSurface(d.daily)) }; });
    const key = volUi.picked.join(',');
    if (key === shownKey) return;
    shownKey = key;
    if (!surf) { surf = surface3d(); stage.replaceChildren(surf.node); }
    surf.set(sets, volUi.played !== sets[0].inst);
    volUi.played = sets[0].inst;
  };
  paint();
  listen(card, paint);
  return card;
}

/* blue, dark → light, for the height (a single-hue sequential ramp) */
const RAMP = [[16, 66, 129], [28, 92, 171], [57, 135, 229], [109, 167, 236], [158, 197, 244], [205, 226, 251]];
const rampAt = u => { u = Math.max(0, Math.min(1, u)) * (RAMP.length - 1); const i = Math.min(RAMP.length - 2, Math.floor(u)), f = u - i, a = RAMP[i], b = RAMP[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; };

function surface3d() {
  const node = el('div', { class: 'q10-3d', tabIndex: 0, 'aria-label': 'Volatility surface — drag or use the arrow keys to turn' });
  const cv = el('canvas', { class: 'q10-cv' });
  const read = el('div', { class: 'lab-read', hidden: true });
  node.append(cv, read);
  let sets = [], zMax = 1, grow = 1, raf = 0, W = 0, H = 0, dpr = 1, hover = null;
  const BX = 1.05, BY = 1.6, BZ = 1.05;           // half-width (lookback), half-depth (date), height
  /* world (x lookback, y date, z height) → screen */
  const proj = (x, y, z) => {
    const cy = Math.cos(volUi.yaw), sy = Math.sin(volUi.yaw), cp = Math.cos(volUi.pitch), sp = Math.sin(volUi.pitch);
    const zc = z - BZ / 2;
    const x1 = x * cy - y * sy, y1 = x * sy + y * cy;            // turn about the vertical
    const y2 = y1 * cp - zc * sp, z2 = y1 * sp + zc * cp;        // tip toward the eye
    const dist = 9, f = Math.min(W / 4.2, H / 3.5) * dist * volUi.zoom, s = f / (dist - y2);   /* a mild perspective; the box fits turned any way */
    return [W / 2 + x1 * s, H / 2 - z2 * s + H * 0.02, y2];
  };
  const colours = () => {
    const cs = getComputedStyle(node);
    return { ink: cs.getPropertyValue('--ink-3').trim() || '#9a9a9a', ink2: cs.getPropertyValue('--ink-4').trim() || '#6c6c6c', font: cs.getPropertyValue('--mono').trim() || 'monospace' };
  };
  function draw() {
    raf = 0;
    if (!W || !H || !sets.length) return;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const C = colours();
    const S = sets[0].S, nd = S.dates.length, nl = S.lookbacks.length;
    /* colour: high and low for this pair (the height keeps one scale for every pair compared) */
    let cLo = Infinity, cHi = -Infinity; for (const r of S.z) for (const v of r) { if (v < cLo) cLo = v; if (v > cHi) cHi = v; }
    const tone = v => rampAt(Math.pow((v - cLo) / ((cHi - cLo) || 1), 0.8));
    const xOf = li => -BX + (2 * BX * li) / (nl - 1), yOf = di => -BY + (2 * BY * di) / Math.max(1, nd - 1), zOf = v => (v / zMax) * BZ * grow;
    /* the box's back panes: floor and the walls whose outside faces away from the eye */
    const faces = [
      { n: [0, 0, -1], c: [[-BX, -BY, 0], [BX, -BY, 0], [BX, BY, 0], [-BX, BY, 0]], kind: 'floor' },
      { n: [-1, 0, 0], c: [[-BX, -BY, 0], [-BX, BY, 0], [-BX, BY, BZ], [-BX, -BY, BZ]], kind: 'x', at: -BX },
      { n: [1, 0, 0], c: [[BX, -BY, 0], [BX, BY, 0], [BX, BY, BZ], [BX, -BY, BZ]], kind: 'x', at: BX },
      { n: [0, -1, 0], c: [[-BX, -BY, 0], [BX, -BY, 0], [BX, -BY, BZ], [-BX, -BY, BZ]], kind: 'y', at: -BY },
      { n: [0, 1, 0], c: [[-BX, BY, 0], [BX, BY, 0], [BX, BY, BZ], [-BX, BY, BZ]], kind: 'y', at: BY },
    ];
    const eyeDot = n => { const p0 = proj(0, 0, BZ / 2), p1 = proj(n[0] * 0.5, n[1] * 0.5, BZ / 2 + n[2] * 0.5); return p1[2] - p0[2]; };
    const back = faces.filter(f => eyeDot(f.n) < 0);
    g.lineWidth = 1;
    for (const f of back) {
      const P = f.c.map(p => proj(...p));
      g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      g.fillStyle = 'rgba(128,128,128,0.055)'; g.fill();
      g.strokeStyle = 'rgba(128,128,128,0.22)'; g.stroke();
      /* a few grid lines on each pane */
      g.strokeStyle = 'rgba(128,128,128,0.10)';
      for (let k = 1; k < 4; k++) {
        const u = k / 4;
        const seg = f.kind === 'floor' ? [[-BX + 2 * BX * u, -BY, 0], [-BX + 2 * BX * u, BY, 0]] : [[f.c[0][0], f.c[0][1], BZ * u], [f.c[1][0], f.c[1][1], BZ * u]];
        const a = proj(...seg[0]), b = proj(...seg[1]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
    }
    /* the comparison on the back walls: on a date wall the latest term structure, on a lookback wall the 20-day volatility through time */
    const li20 = Math.max(0, S.lookbacks.indexOf(20));
    for (const f of back) {
      if (f.kind === 'floor') continue;
      for (const st of sets) {
        const s = st.S; if (!s.dates.length) continue;
        g.strokeStyle = st.hue; g.lineWidth = st === sets[0] ? 1.6 : 1.3; g.globalAlpha = 0.9;
        g.beginPath();
        if (f.kind === 'y') {
          const row = s.z[s.z.length - 1];
          row.forEach((v, li) => { const [x, y] = proj(xOf(li), f.at, zOf(v)); li ? g.lineTo(x, y) : g.moveTo(x, y); });
        } else {
          /* placed on the same calendar as the surface */
          const t0 = S.dates[0], t1 = S.dates[nd - 1];
          let started = false;
          s.dates.forEach((t, di) => { if (t < t0 || t > t1) return; const yy = -BY + (2 * BY * (t - t0)) / Math.max(1, t1 - t0); const [x, y] = proj(f.at, yy, zOf(s.z[di][li20])); started ? g.lineTo(x, y) : g.moveTo(x, y); started = true; });
        }
        g.stroke(); g.globalAlpha = 1;
      }
    }
    /* the surface: quads far to near */
    const quads = [];
    for (let di = 0; di < nd - 1; di++) for (let li = 0; li < nl - 1; li++) {
      const c = [[li, di], [li + 1, di], [li + 1, di + 1], [li, di + 1]].map(([a, b]) => [xOf(a), yOf(b), zOf(S.z[b][a])]);
      const P = c.map(p => proj(...p));
      const depth = (P[0][2] + P[1][2] + P[2][2] + P[3][2]) / 4;
      /* light from above and a little in front: a normal from the quad's two diagonals */
      const ux = c[2][0] - c[0][0], uy = c[2][1] - c[0][1], uz = c[2][2] - c[0][2], vx = c[3][0] - c[1][0], vy = c[3][1] - c[1][1], vz = c[3][2] - c[1][2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nn = Math.hypot(nx, ny, nz) || 1; nx /= nn; ny /= nn; nz /= nn;
      const lit = 0.72 + 0.28 * Math.abs(nx * -0.35 + ny * -0.45 + nz * 0.82);
      const v = (S.z[di][li] + S.z[di][li + 1] + S.z[di + 1][li + 1] + S.z[di + 1][li]) / 4;
      quads.push({ P, depth, rgb: tone(v), lit });
    }
    quads.sort((a, b) => a.depth - b.depth);
    for (const q of quads) {
      g.beginPath(); q.P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      g.fillStyle = `rgb(${Math.round(q.rgb[0] * q.lit)},${Math.round(q.rgb[1] * q.lit)},${Math.round(q.rgb[2] * q.lit)})`;
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 0.6; g.stroke();
    }
    /* the axes: labels along the edges nearest the eye */
    g.font = `400 10px ${C.font}`; g.fillStyle = C.ink;
    const frontY = eyeDot([0, -1, 0]) > 0 ? -BY : BY, frontX = eyeDot([-1, 0, 0]) > 0 ? -BX : BX;
    const label = (x, y, z, text, dx = 0, dy = 0, align = 'center') => { const [px, py] = proj(x, y, z); g.textAlign = align; g.fillText(text, px + dx, py + dy); };
    S.lookbacks.forEach((L, li) => label(xOf(li), frontY + Math.sign(frontY) * 0.18, 0, L >= 60 ? `${Math.round(L / 21)}m` : `${L}d`, 0, 4));
    const ys = S.dates.map(t => new Date(t * 1000).getUTCFullYear());
    let lastY = null;
    S.dates.forEach((t, di) => { const y = ys[di]; if (y !== lastY && di > 0 && (y % 2 === 0 || nd < 60)) label(frontX + Math.sign(frontX) * 0.2, yOf(di), 0, String(y), 0, 4); lastY = y; });
    /* the height on the side corner, away from the other two scales */
    const sideX = -frontX, sx = proj(sideX, frontY, 0)[0] > W / 2 ? 1 : -1;
    for (const v of ticks(0, zMax * grow, 4)) if (v > 0) label(sideX, frontY, (v / zMax) * BZ, `${v}%`, sx * 8, 3, sx > 0 ? 'left' : 'right');
    g.fillStyle = C.ink2;
    label(0, frontY + Math.sign(frontY) * 0.42, 0, 'lookback', 0, 4);
    label(sideX, frontY, BZ * 1.1, 'volatility', 0, 0);
    /* the hovered point */
    if (hover) {
      const [x, y] = proj(xOf(hover.li), yOf(hover.di), zOf(S.z[hover.di][hover.li]));
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1; g.stroke();
    }
  }
  const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
  const size = () => {
    const r = node.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
    W = Math.round(r.width); H = Math.round(r.height);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    draw();
  };
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => { node.isConnected ? size() : ro.disconnect(); }); ro.observe(node); }
  requestAnimationFrame(size);

  /* turning it: drag (any way, all the way round), a little glide after, the wheel or a pinch to zoom, arrows, double-click to reset */
  const pts = new Map(); let vx = 0, vy = 0, glide = 0, lastT = 0, pinch = null;
  const spin = () => {
    vx *= 0.94; vy *= 0.94;
    volUi.yaw += vx; volUi.pitch += vy; draw();
    glide = Math.abs(vx) + Math.abs(vy) > 0.0004 ? requestAnimationFrame(spin) : 0;
  };
  node.addEventListener('pointerdown', e => {
    node.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    cancelAnimationFrame(glide); glide = 0; vx = vy = 0; lastT = performance.now();
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: volUi.zoom }; }
    node.classList.add('is-turning');
  });
  node.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) {
      const [px, py] = pts.get(e.pointerId), dx = e.clientX - px, dy = e.clientY - py;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; volUi.zoom = Math.max(0.55, Math.min(2.4, pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / (pinch.d || 1))); redraw(); return; }
      const now = performance.now(), dt = Math.max(8, now - lastT); lastT = now;
      volUi.yaw += dx * 0.009; volUi.pitch += dy * 0.009;
      vx = (dx * 0.009) * (16 / dt); vy = (dy * 0.009) * (16 / dt);
      hover = null; read.hidden = true; redraw();
      return;
    }
    hoverAt(e);
  });
  const up = e => {
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
    if (!pts.size) { node.classList.remove('is-turning'); if (!calm() && Math.abs(vx) + Math.abs(vy) > 0.002) glide = requestAnimationFrame(spin); }
  };
  node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
  node.addEventListener('pointerleave', () => { if (!pts.size) { hover = null; read.hidden = true; redraw(); } });
  node.addEventListener('wheel', e => { e.preventDefault(); volUi.zoom = Math.max(0.55, Math.min(2.4, volUi.zoom * Math.exp(-e.deltaY * 0.0015))); redraw(); }, { passive: false });
  node.addEventListener('dblclick', () => tween({ yaw: -0.75, pitch: 0.52, zoom: 1 }, 700));
  node.addEventListener('keydown', e => {
    const k = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }[e.key];
    if (!k) return; e.preventDefault(); volUi.yaw += k[0]; volUi.pitch += k[1]; redraw();
  });
  function hoverAt(e) {
    if (!sets.length) return;
    const r = node.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const S = sets[0].S, nd = S.dates.length, nl = S.lookbacks.length;
    let best = null, bd = 196;
    for (let di = 0; di < nd; di++) for (let li = 0; li < nl; li++) {
      const [x, y] = proj(-BX + (2 * BX * li) / (nl - 1), -BY + (2 * BY * di) / Math.max(1, nd - 1), (S.z[di][li] / zMax) * BZ * grow);
      const dd = (x - mx) ** 2 + (y - my) ** 2; if (dd < bd) { bd = dd; best = { di, li, x, y }; }
    }
    if (!best) { if (hover) { hover = null; read.hidden = true; redraw(); } return; }
    hover = best; redraw();
    const L = S.lookbacks[best.li];
    read.replaceChildren(el('div', { class: 'h' }, `${nameOf(sets[0].inst)} · ${monthOf(S.dates[best.di])}`),
      el('div', { class: 'r' }, el('i', { style: { background: sets[0].hue } }), el('b', {}, `${S.z[best.di][best.li].toFixed(1)}%`), el('span', {}, `${L}-day volatility`)),
      ...sets.slice(1).map(st => { const k = st.S.dates.findIndex(t => t >= S.dates[best.di]); const v = k >= 0 ? st.S.z[k][best.li] : null; return v == null ? null : el('div', { class: 'r' }, el('i', { style: { background: st.hue } }), el('b', {}, `${v.toFixed(1)}%`), el('span', {}, nameOf(st.inst))); }));
    read.hidden = false;
    const rw = read.offsetWidth, rh = read.offsetHeight;
    read.style.left = Math.max(4, Math.min(W - rw - 4, best.x + 14 + rw > W - 4 ? best.x - rw - 14 : best.x + 14)) + 'px';
    read.style.top = Math.max(4, Math.min(H - rh - 4, best.y - rh / 2)) + 'px';
  }
  function tween(to, dur) {
    if (calm()) { Object.assign(volUi, to); redraw(); return; }
    const from = { yaw: volUi.yaw, pitch: volUi.pitch, zoom: volUi.zoom }, t0 = performance.now();
    /* the short way round */
    const tau = Math.PI * 2;
    to = { ...to, yaw: from.yaw + ((((to.yaw - from.yaw) % tau) + tau + Math.PI) % tau) - Math.PI, pitch: from.pitch + ((((to.pitch - from.pitch) % tau) + tau + Math.PI) % tau) - Math.PI };
    const step = now => { const k = ease((now - t0) / dur); for (const key of ['yaw', 'pitch', 'zoom']) volUi[key] = from[key] + (to[key] - from[key]) * k; draw(); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  return {
    node,
    set(next, play) {
      sets = next;
      zMax = 0; for (const st of sets) for (const r of st.S.z) for (const v of r) zMax = Math.max(zMax, v);
      zMax = Math.max(1, Math.ceil(zMax / 5) * 5);
      if (!play || calm()) { grow = 1; redraw(); return; }
      /* the surface rises from the floor while the view swings round to where it was */
      const t0 = performance.now(), yaw = volUi.yaw, dur = 1300;
      const step = now => {
        const k = Math.min(1, (now - t0) / dur);
        grow = ease(k); volUi.yaw = yaw - 0.7 * (1 - ease(k));
        draw();
        if (k < 1 && node.isConnected) requestAnimationFrame(step); else { grow = 1; volUi.yaw = yaw; }
      };
      requestAnimationFrame(step);
    },
  };
}
