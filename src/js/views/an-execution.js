/* ============================================================
   Analytics · Execution — what the new questions on a trade add up to.

   How sure you were going in, how you felt coming out, how it ended, what
   went wrong, the timeframe you took it on and how cleanly price moved. Each
   is a question about edge: does it pay, and by how much against the rest.

   Everything is in R per trade, because that is where an edge lives, and
   every card says how many trades it is reading — older trades were logged
   before these questions existed, and a pattern on four trades is a rumour.
   ============================================================ */
import { el, svg, fitted } from '../ui.js';
import * as c from '../calc.js';
import { tipLayer } from './chartkit.js';
import { CONFIDENCE, EMOTION_AFTER, EXIT_REASONS, EXEC_TFS, MISTAKES, DELIVERY } from '../questions.js';

const rr = (v, d = 2) => (v == null || !isFinite(v) ? '—' : `${v > 0.0005 ? '+' : v < -0.0005 ? '−' : ''}${Math.abs(v).toFixed(d)}R`);
const tone = v => (v == null || Math.abs(v) < 1e-9 ? '' : v > 0 ? 'is-pos' : 'is-neg');
/* Below this a group is shown, but quietly, and never called the best. */
export const ENOUGH = 3;

/** One group's numbers. */
function tally(rows) {
  const n = rows.length;
  const wins = rows.filter(x => x.r > 0).length, losses = rows.filter(x => x.r < 0).length;
  const sum = rows.reduce((a, x) => a + x.r, 0);
  return { n, wins, losses, sum, avg: n ? sum / n : null, winRate: wins + losses ? wins / (wins + losses) : null };
}

/**
 * Everything the page draws, worked out once. Only closed trades with an R
 * count; a trade without an answer to a question is left out of that
 * question only.
 */
export function execStats(acct, trades) {
  const rows = [];
  for (const t of trades) {
    if (t.status === 'open') continue;
    const r = c.rMultiple(acct, t);
    if (r == null || !isFinite(r)) continue;
    rows.push({ t, r });
  }
  const by = (key, keys) => keys.map(k => ({ key: k, ...tally(rows.filter(x => x.t[key] === k)) }));
  const answered = key => rows.filter(x => x.t[key] != null).length;

  /* Mistakes: a trade logged with the mistakes question has a list, empty
     when nothing went wrong. Those empty ones are the baseline every mistake
     is measured against. */
  const asked = rows.filter(x => Array.isArray(x.t.mistakes));
  const clean = tally(asked.filter(x => x.t.mistakes.length === 0));
  const mistakes = MISTAKES.map(([k, label]) => {
    const g = tally(asked.filter(x => x.t.mistakes.includes(k)));
    /* What it cost: how much worse each trade with it did than a clean one,
       times how often it happened. */
    const cost = g.n && clean.avg != null ? (g.avg - clean.avg) * g.n : null;
    return { key: k, label, ...g, cost };
  }).sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));

  /* Before and after, as a grid: how sure you were going in, against how it
     felt coming out. */
  const grid = CONFIDENCE.map(([cv]) => EMOTION_AFTER.map(([ev]) => tally(rows.filter(x => x.t.confidence === cv && x.t.emotionAfter === ev))));

  return {
    total: rows.length,
    answered: { confidence: answered('confidence'), emotionAfter: answered('emotionAfter'), exitReason: answered('exitReason'),
      execTf: answered('execTf'), delivery: answered('delivery'), mistakes: asked.length },
    confidence: by('confidence', CONFIDENCE.map(([v]) => v)),
    emotionAfter: by('emotionAfter', EMOTION_AFTER.map(([v]) => v)),
    exitReason: by('exitReason', EXIT_REASONS.map(([v]) => v)),
    execTf: by('execTf', EXEC_TFS),
    delivery: by('delivery', DELIVERY.map(([v]) => v)),
    clean, withMistakes: tally(asked.filter(x => x.t.mistakes.length > 0)), mistakes, grid,
  };
}

const best = groups => groups.filter(g => g.n >= ENOUGH).sort((a, b) => b.avg - a.avg)[0] || null;

export function executionTab(store, acct, trades, ctx) {
  const S = execStats(acct, trades);
  const any = Object.values(S.answered).some(n => n > 0);
  if (!any) {
    return el('div', { class: 'an-body' }, el('section', { class: 'card lab-prompt' },
      el('h2', {}, 'Nothing to read yet'),
      el('p', {}, 'Confidence, feeling after, exit reason, mistakes, timeframe and price delivery are asked on New trade. Log a few trades with them and this fills in.')));
  }

  const bc = best(S.confidence), btf = best(S.execTf);
  const worst = S.mistakes.find(m => m.n && m.cost != null && m.cost < 0) || null;
  const tile = (k, v, s, cls = '') => el('div', { class: 'lab-tile' + cls }, el('span', { class: 'k' }, k), el('span', { class: 'v' }, v), el('span', { class: 's' }, s || ' '));
  const tiles = el('div', { class: 'an-tiles ex-tiles' },
    tile('Clean trades', rr(S.clean.avg), S.clean.n ? `a trade · ${S.clean.n} trade${S.clean.n === 1 ? '' : 's'}` : 'none logged yet', ' is-hero ' + tone(S.clean.avg)),
    tile('With a mistake', rr(S.withMistakes.avg), S.withMistakes.n ? `a trade · ${S.withMistakes.n} trade${S.withMistakes.n === 1 ? '' : 's'}` : 'none logged yet', ' ' + tone(S.withMistakes.avg)),
    tile('Costliest mistake', worst ? rr(worst.cost, 1) : '—', worst ? worst.label : 'nothing has cost you yet', worst ? ' is-neg' : ''),
    tile('Best confidence', bc ? `${bc.key} · ${CONFIDENCE[bc.key - 1][1]}` : '—', bc ? `${rr(bc.avg)} a trade` : `needs ${ENOUGH}+ trades at a level`),
    tile('Best timeframe', btf ? btf.key : '—', btf ? `${rr(btf.avg)} a trade` : `needs ${ENOUGH}+ trades on one`));

  return el('div', { class: 'an-body' },
    tiles,
    el('div', { class: 'an-row ex-row' }, levelCard('Confidence going in', S.confidence, CONFIDENCE, S.answered.confidence, S.total), gridCard(S)),
    el('div', { class: 'an-row ex-row' }, mistakesCard(S), exitCard(S)),
    el('div', { class: 'an-row ex-row is-low' }, levelCard('Execution timeframe', S.execTf, EXEC_TFS.map(v => [v, '']), S.answered.execTf, S.total, true), deliveryCard(S)));
}

const head = (title, n, total, extra = null) => el('div', { class: 'lab-chart-head' },
  el('h2', {}, title), el('span', { class: 'lab-sub' }, `${n} of ${total} trade${total === 1 ? '' : 's'} answered`), extra);

/* ---------- a level, a column: average R, with win rate and count under ---------- */
function levelCard(title, groups, scale, n, total, compact = false) {
  const card = el('section', { class: 'card lab-chart ex-levels' + (compact ? ' is-compact' : '') }, head(title, n, total));
  if (n < 2) { card.append(el('p', { class: 'lab-empty' }, 'Answer this on a few trades and it draws.')); return card; }
  card.append(fitted((w, h) => drawLevels(groups, scale, w, h), compact ? 170 : 210));
  return card;
}

function drawLevels(groups, scale, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const tip = tipLayer(wrap);
  const named = scale.some(([, l]) => l);
  const vals = groups.map(g => g.avg ?? 0);
  /* Room under the lowest bar for its figure, clear of the names. */
  const plot = { l: 8, r: W - 8, t: 22, b: H - (named ? 44 : 32) - (vals.some(v => v < 0) ? 18 : 0) };
  const up = Math.max(0.1, ...vals), dn = Math.max(0.1, ...vals.map(v => -v));
  const z = plot.t + (plot.b - plot.t) * up / (up + dn);
  const slot = (plot.r - plot.l) / groups.length, bw = Math.min(46, slot * 0.46);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  g.append(svg('line', { class: 'lab-zero', x1: plot.l, x2: plot.r, y1: z, y2: z }));
  groups.forEach((x, i) => {
    const cx = plot.l + slot * i + slot / 2;
    const thin = x.n < ENOUGH;
    if (x.n) {
      const h = Math.max(2, Math.abs(x.avg) / (up + dn) * (plot.b - plot.t));
      const y = x.avg >= 0 ? z - h : z;
      g.append(svg('rect', { class: 'col-fill-svg ex-col ' + (x.avg >= 0 ? 'is-pos' : 'is-neg') + (thin ? ' is-thin' : ''), x: cx - bw / 2, y, width: bw, height: h, rx: 4 }));
      g.append(svg('text', { class: 'ex-val' + (thin ? ' is-thin' : ''), x: cx, y: x.avg >= 0 ? y - 7 : y + h + 13, 'text-anchor': 'middle' }, rr(x.avg)));
    }
    g.append(svg('text', { class: 'ex-key', x: cx, y: H - (named ? 30 : 18), 'text-anchor': 'middle' }, named ? `${x.key} ${scale[i][1]}` : String(x.key)));
    g.append(svg('text', { class: 'lab-tick', x: cx, y: H - (named ? 14 : 4), 'text-anchor': 'middle' },
      x.n ? `${x.n} · ${x.winRate == null ? '—' : c.pct(x.winRate, 0)}` : '—'));
    const hit = svg('rect', { class: 'an-hit', x: cx - slot / 2, y: plot.t - 16, width: slot, height: H - plot.t + 16, fill: 'transparent' });
    hit.addEventListener('pointerenter', () => tip.show(cx, plot.t + 20, [
      el('div', { class: 'h' }, named ? `${x.key} · ${scale[i][1]}` : String(x.key)),
      el('div', { class: 'r' }, el('b', {}, rr(x.avg)), el('span', {}, 'a trade')),
      el('div', { class: 'r' }, el('b', {}, rr(x.sum, 1)), el('span', {}, `over ${x.n} trade${x.n === 1 ? '' : 's'}`)),
      el('div', { class: 'r' }, el('b', {}, x.winRate == null ? '—' : c.pct(x.winRate, 0)), el('span', {}, 'won')),
      thin && x.n ? el('div', { class: 'r' }, el('span', {}, `too few to read into`)) : null].filter(Boolean)));
    hit.addEventListener('pointerleave', () => tip.hide());
    g.append(hit);
  });
  wrap.prepend(g);
  return wrap;
}

/* ---------- going in, against coming out ---------- */
function gridCard(S) {
  const n = S.grid.flat().reduce((a, x) => a + x.n, 0);
  const card = el('section', { class: 'card lab-chart ex-grid' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Before & after'), el('span', { class: 'lab-sub' }, `${n} trade${n === 1 ? '' : 's'} with both`)));
  if (n < 2) { card.append(el('p', { class: 'lab-empty' }, 'Needs confidence and feeling after on a few trades.')); return card; }
  card.append(fitted((w, h) => drawGrid(S.grid, w, h), 220));
  return card;
}

function drawGrid(grid, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const tip = tipLayer(wrap);
  const l = 78, t = 6, r = W - 6, b = H - 34;
  const cw = (r - l) / 5, ch = (b - t) / 5;
  const reach = Math.max(0.25, ...grid.flat().filter(x => x.n).map(x => Math.abs(x.avg)));
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  /* Confident at the top, revenge at the bottom; angry on the left, satisfied on the right. */
  for (let ci = 4; ci >= 0; ci--) {
    const y = t + (4 - ci) * ch;
    g.append(svg('text', { class: 'lab-tick', x: l - 8, y: y + ch / 2 + 3.5, 'text-anchor': 'end' }, `${ci + 1} ${CONFIDENCE[ci][1]}`));
    for (let ei = 0; ei < 5; ei++) {
      const x = l + ei * cw, cell = grid[ci][ei];
      const a = cell.n ? 0.18 + 0.82 * Math.sqrt(Math.min(1, Math.abs(cell.avg) / reach)) : 0;
      const rect = svg('rect', { class: 'ex-cell' + (cell.n ? '' : ' is-empty'), x: x + 1.5, y: y + 1.5, width: cw - 3, height: ch - 3, rx: 6,
        style: cell.n ? `fill:rgba(var(--${cell.avg >= 0 ? 'profit' : 'loss'}-rgb), ${a.toFixed(3)})` : '' });
      g.append(rect);
      if (cell.n) g.append(svg('text', { class: 'ex-cell-n', x: x + cw / 2, y: y + ch / 2 + 4, 'text-anchor': 'middle' }, String(cell.n)));
      rect.addEventListener('pointerenter', () => tip.show(x + cw / 2, y + ch / 2, [
        el('div', { class: 'h' }, `${CONFIDENCE[ci][1]} going in · ${EMOTION_AFTER[ei][1]} after`),
        el('div', { class: 'r' }, el('b', {}, cell.n ? rr(cell.avg) : '—'), el('span', {}, 'a trade')),
        el('div', { class: 'r' }, el('b', {}, String(cell.n)), el('span', {}, `trade${cell.n === 1 ? '' : 's'}`))]));
      rect.addEventListener('pointerleave', () => tip.hide());
    }
  }
  for (let ei = 0; ei < 5; ei++) g.append(svg('text', { class: 'lab-tick', x: l + ei * cw + cw / 2, y: H - 18, 'text-anchor': 'middle' }, EMOTION_AFTER[ei][1]));
  g.append(svg('text', { class: 'ex-axis', x: l + (r - l) / 2, y: H - 3, 'text-anchor': 'middle' }, 'feeling after →'));
  wrap.prepend(g);
  return wrap;
}

/* ---------- what each mistake cost, against a clean trade ---------- */
function mistakesCard(S) {
  const seen = S.mistakes.filter(m => m.n);
  const card = el('section', { class: 'card lab-chart ex-mistakes' },
    el('div', { class: 'lab-chart-head' }, el('h2', {}, 'What mistakes cost'),
      el('span', { class: 'lab-sub' }, S.clean.n ? `against a clean trade at ${rr(S.clean.avg)}` : 'no clean trades to compare yet')));
  if (!seen.length) { card.append(el('p', { class: 'lab-empty' }, S.answered.mistakes ? 'No mistakes logged — that is the good kind of empty.' : 'Tick mistakes on a few trades and this fills in.')); return card; }
  const reach = Math.max(0.5, ...seen.map(m => Math.abs(m.cost ?? 0)));
  card.append(el('div', { class: 'ex-bars' }, ...seen.map(m => {
    const w = m.cost == null ? 0 : Math.abs(m.cost) / reach * 50;
    return el('div', { class: 'ex-bar' + (m.n < ENOUGH ? ' is-thin' : ''), title: `${m.n} trade${m.n === 1 ? '' : 's'} · ${rr(m.avg)} a trade · ${m.winRate == null ? '—' : c.pct(m.winRate, 0)} won` },
      el('span', { class: 'nm' }, m.label),
      el('span', { class: 'track' }, el('i', { class: 'z' }),
        m.cost != null ? el('i', { class: 'f bar-fill ' + (m.cost < 0 ? 'is-neg' : 'is-pos'), style: { left: (m.cost < 0 ? 50 - w : 50) + '%', width: w + '%',
          transformOrigin: m.cost < 0 ? 'right center' : 'left center' } }) : null),
      el('b', { class: tone(m.cost) }, m.cost == null ? '—' : rr(m.cost, 1)),
      el('small', {}, `${m.n} · ${rr(m.avg)}`));
  })));
  return card;
}

/* ---------- how it ended ---------- */
const EXIT_TONE = { tp: 'var(--profit)', sl: 'var(--loss)', be: 'var(--grey-4)', manual: 'var(--blue)', trailed: '#A78BFA' };
function exitCard(S) {
  const groups = S.exitReason.map((g, i) => ({ ...g, label: EXIT_REASONS[i][1] })).filter(g => g.n);
  const n = S.answered.exitReason;
  const card = el('section', { class: 'card lab-chart ex-exits' }, head('How trades ended', n, S.total));
  if (!groups.length) { card.append(el('p', { class: 'lab-empty' }, 'Pick an exit reason on a few trades and this fills in.')); return card; }
  const total = groups.reduce((a, g) => a + g.n, 0);
  card.append(
    el('div', { class: 'ex-stack', title: 'Share of trades' }, ...groups.map(g => el('i', { style: { flex: String(g.n), background: EXIT_TONE[g.key] } }))),
    el('div', { class: 'ex-exitrows' }, ...groups.map(g => el('div', { class: 'ex-exit' + (g.n < ENOUGH ? ' is-thin' : '') },
      el('i', { style: { background: EXIT_TONE[g.key] } }),
      el('span', { class: 'nm' }, g.label),
      el('span', { class: 'sh' }, c.pct(g.n / total, 0)),
      el('b', { class: tone(g.avg) }, rr(g.avg)),
      el('small', {}, `${g.n} · ${rr(g.sum, 1)}`)))));
  return card;
}

/* ---------- how cleanly price moved ---------- */
function deliveryCard(S) {
  const n = S.answered.delivery;
  const card = el('section', { class: 'card lab-chart ex-delivery' }, head('Price delivery', n, S.total));
  if (n < 2) { card.append(el('p', { class: 'lab-empty' }, 'Rate price delivery on a few trades and this fills in.')); return card; }
  const reach = Math.max(0.25, ...S.delivery.filter(g => g.n).map(g => Math.abs(g.avg)));
  card.append(el('div', { class: 'ex-dl' }, ...S.delivery.map((g, i) => el('div', { class: 'ex-dlc is-' + g.key + (g.n && g.n < ENOUGH ? ' is-thin' : '') + (g.n ? '' : ' is-empty') },
    el('span', { class: 'k' }, DELIVERY[i][1]),
    el('b', { class: tone(g.avg) }, g.n ? rr(g.avg) : '—'),
    el('span', { class: 'per' }, 'a trade'),
    el('div', { class: 'ex-dlf' },
      el('span', {}, 'Won', el('b', {}, g.winRate == null ? '—' : c.pct(g.winRate, 0))),
      el('span', {}, 'Total', el('b', { class: tone(g.sum) }, g.n ? rr(g.sum, 1) : '—'))),
    el('div', { class: 'tr' }, g.n ? el('i', { class: 'bar-fill ' + (g.avg >= 0 ? 'is-pos' : 'is-neg'), style: { width: (Math.abs(g.avg) / reach * 100) + '%' } }) : null),
    el('small', {}, g.n ? `${g.n} trade${g.n === 1 ? '' : 's'}` : 'none yet')))));
  return card;
}
