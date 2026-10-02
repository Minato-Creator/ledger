/* ============================================================
   Prop firms — the most trusted futures and forex firms, side by side.

   A list ranked by trust on the left; on the right, one firm in full:
   what an account costs and asks of you, the path from evaluation to
   funded, the max loss drawn the way that firm trails it, how payouts
   work, the fine print that actually ends accounts, and Quire's own take.
   Your journal is checked against the rules of whichever account you pick,
   and "Use in The Lab" writes them into a Prop firm rule sheet.

   The rules live in firms.js, dated, with their sources. Firms change them
   often — the page says when they were checked and says to confirm on the
   firm's own site before buying.
   ============================================================ */
import { el, svg, icon, toast, fitted } from '../ui.js';
import * as c from '../calc.js';
import { FIRMS, CHECKED } from '../firms.js';
import { blankSheet } from '../lab.js';

let market = 'futures';
const picked = { futures: 'topstep', forex: 'ftmo' };
const choice = {};              // firm id → { program, size }
let fineSev = 'all';
let stretch = 2;                // months (or attempts) in the cost calculator

const CHECKED_TEXT = (() => { const [y, m, d] = CHECKED.split('-').map(Number); return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`; })();

/* ---------- small pieces ---------- */
const STAR = 'M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z';
export function stars(n, big = false) {
  const wrap = el('span', { class: 'stars' + (big ? ' big' : ''), title: `${n} of 5 — Quire’s trust rating`, 'aria-label': `${n} of 5 stars` });
  for (let i = 1; i <= 5; i++) {
    const s = svg('svg', { viewBox: '0 0 20 20' });
    if (n >= i) s.append(svg('path', { class: 'f', d: STAR }));
    else if (n >= i - 0.5) {
      const id = 'h' + Math.random().toString(36).slice(2, 7);
      s.append(svg('defs', {}, svg('clipPath', { id }, svg('rect', { x: 0, y: 0, width: 10, height: 20 }))),
        svg('path', { class: 'e', d: STAR }), svg('path', { class: 'f', d: STAR, 'clip-path': `url(#${id})` }));
    } else s.append(svg('path', { class: 'e', d: STAR }));
    wrap.append(s);
  }
  return wrap;
}
const money = (cur, v) => (v == null || !isFinite(v) ? '—' : (v < 0 ? '−' : '') + cur + Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: v % 1 ? 2 : 0 }));
const kshort = n => (n >= 1000 ? `${n / 1000}K` : String(n));
/** The first percentage in a piece of text: "best day < 55% of target" → 55. */
export const pctIn = text => { const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*%/); return m ? Number(m[1]) : null; };

/** The firm, program and size on screen, healed to something that exists. */
export function pick(firm) {
  const ch = choice[firm.id] || (choice[firm.id] = {});
  const program = firm.programs.find(p => p.id === ch.program) || firm.programs[0];
  const size = program.sizes.find(s => s.label === ch.size)
    || program.sizes.find(s => s.balance === 50000) || program.sizes[Math.min(1, program.sizes.length - 1)];
  ch.program = program.id; ch.size = size.label;
  return { program, size, cur: program.currency || '$' };
}

/* ============================================================
   The page
   ============================================================ */
export function firmsPage(store, nav, sub) {
  if (sub && FIRMS.some(f => f.id === sub)) { const f = FIRMS.find(x => x.id === sub); market = f.market; picked[market] = f.id; }
  const list = FIRMS.filter(f => f.market === market).sort((a, b) => a.rank - b.rank);
  const firm = list.find(f => f.id === picked[market]) || list[0];
  const count = m => FIRMS.filter(f => f.market === m).length;

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Prop firms'),
    el('div', { class: 'seg', style: { marginLeft: '6px' } },
      ...[['futures', 'Futures'], ['forex', 'Forex']].map(([k, l]) =>
        el('button', { class: k === market ? 'is-on' : '', onClick: () => { market = k; nav.refresh(); } }, `${l} · ${count(k)}`))),
    el('span', { class: 'sub pf-sub' }, `rules checked ${CHECKED_TEXT} · confirm on the firm’s site before you buy`),
    el('div', { class: 'spacer' }));

  const rail = el('section', { class: 'card pf-rail' },
    el('div', { class: 'pf-k' }, el('span', {}, 'Most trusted first'), el('span', {}, 'from')),
    ...list.map(f => {
      const from = cheapest(f);
      return el('button', { class: 'pf-firm' + (f.id === firm.id ? ' on' : ''), onClick: () => { picked[market] = f.id; nav.refresh(); } },
        el('span', { class: 'rk' }, String(f.rank)),
        el('span', { class: 'pf-mono' }, f.mono),
        el('span', { class: 'nm' }, el('span', { class: 'n1' }, f.name), el('small', {}, stars(f.trust), el('i', {}, String(f.since)))),
        el('span', { class: 'px' }, from ? from : ''));
    }),
    el('div', { class: 'pf-k', style: { marginTop: '14px', paddingBottom: '4px' } }, 'How trust is rated'),
    el('p', { class: 'pf-note' }, 'Years running, payout record, how often rules change, and reported payout disputes — weighed against Trustpilot scores and how many reviews they rest on. Quire’s own rating, not the firm’s.'));

  const main = el('div', { class: 'pf-main' });
  paintFirm(main, store, nav, firm);
  return el('div', { class: 'view' }, head, el('div', { class: 'pf' }, rail, main));
}

/** "$49/mo" or "$145" — the cheapest way in. */
function cheapest(f) {
  let best = null;
  for (const p of f.programs) for (const s of p.sizes) {
    if (s.price == null) continue;
    if (!best || s.price < best.price) best = { price: s.price, cur: p.currency || '$', monthly: p.pricing === 'monthly' };
  }
  return best ? `${money(best.cur, best.price)}${best.monthly ? '/mo' : ''}` : null;
}

function paintFirm(main, store, nav, firm) {
  const { program, size, cur } = pick(firm);
  const repaint = () => { const keep = main.scrollTop; paintFirm(main, store, nav, firm); main.scrollTop = keep; };
  main.replaceChildren(
    hero(firm, program, size, store, nav, repaint),
    tiles(program, size, cur),
    el('div', { class: 'pf-row a' }, pathCard(program), drawdownCard(program, size, cur)),
    el('div', { class: 'pf-row b' }, journalCard(store, firm, program, size, cur),
      el('div', { class: 'pf-stack' }, payoutsCard(program), costCard(firm, size, repaint))),
    fineCard(firm, repaint),
    takeCard(firm),
    sourcesCard(firm));
}

/* ---------- who they are, and which account ---------- */
function hero(firm, program, size, store, nav, repaint) {
  const ch = choice[firm.id];
  const seg = (items, on, set) => el('div', { class: 'seg' }, ...items.map(([k, l]) =>
    el('button', { class: k === on ? 'is-on' : '', onClick: () => { set(k); repaint(); } }, l)));
  return el('section', { class: 'card pf-hero' },
    el('div', { class: 'pf-id' },
      el('span', { class: 'pf-mono' }, firm.mono),
      el('div', {},
        el('h2', {}, firm.name, stars(firm.trust, true), el('span', { class: 'pf-trust' }, el('b', {}, firm.trust.toFixed(1)), 'trust')),
        el('div', { class: 'meta' },
          el('span', {}, el('b', {}, firm.market === 'futures' ? 'Futures' : 'Forex & CFDs')),
          el('span', {}, firm.instruments),
          el('span', {}, 'since ', el('b', {}, String(firm.since))),
          el('span', {}, firm.hq),
          el('span', {}, 'Trustpilot ', el('b', {}, String(firm.trustpilot.score)), ` · ${firm.trustpilot.reviews.toLocaleString('en-US')} reviews`)),
        el('div', { class: 'pf-why' }, firm.trustWhy)),
      el('div', { class: 'pf-side' },
        el('span', { class: 'pf-checked' }, el('i', {}), `rules checked ${CHECKED_TEXT}`),
        el('button', { class: 'btn btn-primary', title: 'Write these rules into a Prop firm rule sheet in The Lab',
          onClick: () => useInLab(store, nav, firm, program, size) }, 'Use in The Lab'))),
    el('div', { class: 'pf-pick' },
      firm.programs.length > 1 ? el('span', { class: 'lbl' }, 'Account') : null,
      firm.programs.length > 1 ? seg(firm.programs.map(p => [p.id, p.name]), program.id, k => { ch.program = k; }) : el('span', { class: 'pf-prog' }, program.name),
      el('span', { class: 'lbl', style: { marginLeft: '10px' } }, 'Size'),
      seg(program.sizes.map(s => [s.label, s.label]), size.label, k => { ch.size = k; })),
    program.note ? el('div', { class: 'pf-pnote' }, program.note) : null);
}

/* ---------- the six numbers ---------- */
function tiles(program, size, cur) {
  const b = size.balance;
  const pc = v => (v == null || !b ? '' : `${+(v / b * 100).toFixed(1)}%`);
  const tile = (k, v, s, cls = '') => el('div', { class: 'lab-tile ' + cls }, el('span', { class: 'k' }, k), el('span', { class: 'v' }, ...[].concat(v)), el('span', { class: 's' }, s));
  const monthly = program.pricing === 'monthly';
  const cost = size.price == null
    ? tile('Cost', 'See site', 'price depends on options you pick')
    : tile('Cost', [money(cur, size.price), el('small', {}, monthly ? '/ month' : 'once')],
      size.activation ? `+ ${money(cur, size.activation)} activation when you pass` : /refund/i.test(JSON.stringify(program.payouts) + program.note) && !/not refunded/i.test(program.note) ? 'no activation · fee refunded later' : 'no activation fee');
  const target = size.target == null ? tile('Profit target', 'None', 'straight to a funded account')
    : tile('Profit target', money(cur, size.target), `${pc(size.target)} of the account${program.stages.some(s => /phase 2/i.test(s.tag)) ? ' · phase 1' : ''}`);
  const maxLoss = tile('Max loss', money(cur, size.maxLoss), [size.maxLossType, size.lock].filter(Boolean).join(' · '), 'is-key');
  const daily = size.dailyLoss != null ? tile('Daily loss', money(cur, size.dailyLoss), `${pc(size.dailyLoss)} of the account`)
    : tile('Daily loss', size.dailyNote ? 'Optional' : 'None', size.dailyNote || 'no daily limit on this account');
  const sizeTile = size.maxSize
    ? (() => { const [a, ...rest] = String(size.maxSize).split('/'); return tile('Max size', a.trim(), rest.join('/').trim() || 'at any one time'); })()
    : tile('Min days', size.minDays ? String(size.minDays) : 'None', size.minDays ? 'trading days to pass' : 'pass as fast as you can');
  const cons = size.consistency
    ? tile('Best day', pctIn(size.consistency) != null ? `≤ ${pctIn(size.consistency)}%` : 'Rule', size.consistency)
    : tile('Best day', 'No rule', size.minDays ? `${size.minDays} trading days minimum` : 'no consistency rule');
  return el('div', { class: 'pf-tiles' }, cost, target, maxLoss, daily, sizeTile, cons);
}

/* ---------- the path ---------- */
function pathCard(program) {
  return el('section', { class: 'card pf-card' },
    el('h3', {}, 'The path', el('span', {}, `${program.stages.length} stages, each with its own rules`)),
    el('div', { class: 'pf-path', style: { gridTemplateColumns: `repeat(${program.stages.length}, minmax(0, 1fr))` } },
      ...program.stages.map((s, i) => el('div', { class: 'pf-step' + (i === 0 ? ' on' : '') },
        el('span', { class: 'n' }, el('i', {}, String(i + 1)), s.tag),
        el('b', {}, s.name),
        el('ul', {}, ...s.bullets.slice(0, 4).map(x => el('li', {}, el('span', {}, x))))))));
}

/* ---------- the max loss, drawn the way this firm trails it ---------- */
const DD_WORDS = {
  static: 'A fixed floor below where you started. It never moves, however much you make.',
  'EOD trailing': 'The floor rises with each new high close and stops at your starting balance. It moves at the close but is watched every tick.',
  'intraday trailing': 'The floor chases your highest balance, open profit included. Give back a running winner and the floor is already higher.',
};
function drawdownCard(program, size, cur) {
  const type = size.maxLossType in DD_WORDS ? size.maxLossType : 'static';
  return el('section', { class: 'card pf-card pf-dd' },
    el('h3', {}, 'Max loss, drawn', el('span', {}, type === 'static' ? 'a fixed floor' : 'where most accounts are lost')),
    fitted((w, h) => drawFloor(type, size, cur, w, h), 190),
    el('div', { class: 'pf-legend' }, el('span', {}, el('i', {}), 'balance'), el('span', {}, el('i', { class: 'm' }), `max loss — ${money(cur, size.maxLoss)}${type === 'static' ? ' under the start' : ' under your high'}`)),
    el('div', { class: 'pf-verdict' }, el('span', { style: { color: 'var(--loss)' } }, '● '), DD_WORDS[type]));
}

/** A made-up but typical path: up, up, a pullback, a new high, a dip to the floor. */
export function floorPath(type, start, dd) {
  const u = dd;
  /* each day: [intraday high, close] relative to start */
  const days = [[0.35, 0.3], [0.7, 0.55], [0.6, 0.35], [1.05, 0.9], [1.25, 1.1], [1.2, 0.75], [1.3, 1.2], [1.45, 1.3]];
  const pts = [{ x: 0, bal: start, floor: start - dd }];
  let peakClose = start, peakAny = start;
  days.forEach(([hi, cl], i) => {
    const hiB = start + hi * u, clB = start + cl * u;
    peakAny = Math.max(peakAny, hiB);
    const f = type === 'static' ? start - dd
      : type === 'intraday trailing' ? Math.min(start, peakAny - dd)
      : Math.min(start, peakClose - dd);
    pts.push({ x: i + 0.5, bal: hiB, floor: type === 'intraday trailing' ? f : pts[pts.length - 1].floor });
    if (type !== 'intraday trailing') peakClose = Math.max(peakClose, clB);
    const f2 = type === 'static' ? start - dd : type === 'intraday trailing' ? f : Math.min(start, peakClose - dd);
    pts.push({ x: i + 1, bal: clB, floor: f2 });
  });
  return pts;
}

function drawFloor(type, size, cur, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const start = size.balance, dd = size.maxLoss || start * 0.05;
  const pts = floorPath(type, start, dd);
  const l = 54, r = W - 10, t = 14, b = H - 22;
  const lo = start - dd * 1.25, hi = start + dd * 1.6;
  const X = x => l + (x / pts[pts.length - 1].x) * (r - l), Y = v => b - (v - lo) / (hi - lo) * (b - t);
  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  for (const v of [start - dd, start, start + dd]) {
    g.append(svg('line', { x1: l, x2: r, y1: Y(v), y2: Y(v), stroke: 'var(--grey-8)' }),
      svg('text', { class: 'lab-tick', x: l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, `${cur}${kshort(Math.round(v))}`));
  }
  const floorD = pts.map((p, i) => (i ? `L${X(p.x).toFixed(1)},${Y(pts[i - 1].floor).toFixed(1)}L${X(p.x).toFixed(1)},${Y(p.floor).toFixed(1)}` : `M${X(p.x).toFixed(1)},${Y(p.floor).toFixed(1)}`)).join('');
  g.append(svg('path', { class: 'room', d: `${floorD}L${X(pts[pts.length - 1].x)},${b}L${X(0)},${b}Z` }));
  if (type !== 'static') g.append(svg('line', { class: 'lock', x1: l, x2: r, y1: Y(start), y2: Y(start) }));
  g.append(svg('path', { class: 'mll', d: floorD }));
  g.append(svg('path', { class: 'bal', d: pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.bal).toFixed(1)}`).join('') }));
  /* The dip: on day six a trade sinks to the floor and comes back. */
  const di = pts.findIndex(p => p.x === 6);
  const dip = { x: 5.75, v: pts[di].floor };
  g.append(svg('path', { d: `M${X(pts[di - 1].x)},${Y(pts[di - 1].bal)}L${X(dip.x)},${Y(dip.v)}L${X(pts[di].x)},${Y(pts[di].bal)}`, fill: 'none', stroke: 'var(--loss)', 'stroke-width': 1.5, 'stroke-dasharray': '1 3' }));
  g.append(svg('circle', { class: 'hit', cx: X(dip.x), cy: Y(dip.v), r: 5 }));
  g.append(svg('text', { class: 'lbl-r', x: X(dip.x), y: Y(dip.v) + 18, 'text-anchor': 'middle' }, 'touched — account over'));
  if (type !== 'static') g.append(svg('text', { x: l + 6, y: Y(start) + 14 }, size.lock ? 'stops trailing near the start' : 'keeps trailing your high'));
  else g.append(svg('text', { x: r, y: Y(start - dd) - 6, 'text-anchor': 'end' }, 'never moves'));
  wrap.prepend(g);
  return wrap;
}

/* ---------- your journal, on these rules ---------- */
/**
 * Your closed trades, read at the risk you use, against an account of this
 * size: how many losses in a row the max loss survives, your worst day, your
 * best day against the consistency rule, and trades taken during news.
 */
export function journalChecks(acct, trades, size, rules) {
  const closed = c.chronological(trades.filter(t => t.status !== 'open'))
    .map(t => ({ t, r: c.rMultiple(acct, t) })).filter(x => x.r != null && isFinite(x.r));
  if (!closed.length) return null;
  const riskPct = Number(acct.defaultRiskPercent) || 1;
  const risk = size.balance * riskPct / 100;
  let run = 0, longest = 0;
  for (const x of closed) { if (x.r < 0) { run++; longest = Math.max(longest, run); } else if (x.r > 0) run = 0; }
  const survive = size.maxLoss ? Math.floor((size.maxLoss - 1e-9) / risk) : null;
  const days = new Map();
  for (const x of closed) days.set(x.t.date, (days.get(x.t.date) || 0) + x.r);
  const dayVals = [...days.values()];
  const worst = Math.min(0, ...dayVals) * risk, best = Math.max(0, ...dayVals) * risk;
  const total = closed.reduce((a, x) => a + x.r, 0) * risk;
  const limit = pctIn(size.consistency);
  const ofTarget = /target/i.test(size.consistency || '');
  const share = ofTarget ? (size.target ? best / size.target : null) : (total > 0 ? best / total : null);
  const newsRule = rules.some(r => /news/i.test(r.title + ' ' + r.why) && r.sev !== 'info');
  const duringNews = closed.filter(x => x.t.news === 'during').length;
  return { n: closed.length, riskPct, risk, longest, survive, worst, best, total, limit, ofTarget, share, newsRule, duringNews,
    dailyLoss: size.dailyLoss };
}

function journalCard(store, firm, program, size, cur) {
  const acct = store.activeAccount;
  const J = acct ? journalChecks(acct, store.tradesFor(acct.id), size, firm.rules) : null;
  const card = el('section', { class: 'card pf-card' },
    el('h3', {}, 'Against your journal', el('span', {}, J ? `${J.n} trades at ${J.riskPct}% risk on a ${size.label}` : 'your trades, on these rules')));
  if (!J) { card.append(el('p', { class: 'lab-empty' }, 'Log a few trades and they are checked against this firm’s rules here.')); return card; }
  const chk = (tone, ic, title, sub, val) => el('div', { class: 'pf-chk ' + tone }, el('span', { class: 'ic' }, ic),
    el('span', { class: 't' }, title, el('small', {}, sub)), el('b', {}, val));
  const rows = [];
  if (J.survive != null) {
    const ok = J.longest < J.survive;
    rows.push(chk(ok ? 'ok' : 'bad', ok ? '✓' : '!', `${money(cur, Math.round(J.risk))} a trade · the max loss takes ${J.survive} in a row`,
      `your longest losing run is ${J.longest}${ok ? '' : ' — that would have ended the account'}`, `${J.longest} / ${J.survive}`));
  }
  const dayCap = J.dailyLoss || size.maxLoss;
  if (dayCap) {
    const ok = -J.worst < dayCap;
    rows.push(chk(ok ? (-J.worst > dayCap * 0.7 ? 'mid' : 'ok') : 'bad', ok ? '✓' : '!', `Your worst day, sized for this account`,
      J.dailyLoss ? `daily loss limit is ${money(cur, J.dailyLoss)}` : `no daily limit — against the ${money(cur, size.maxLoss)} max loss`, money(cur, Math.round(J.worst))));
  }
  if (J.limit != null && J.share != null) {
    const ok = J.share * 100 <= J.limit;
    rows.push(chk(ok ? 'ok' : 'mid', ok ? '✓' : '~', `Your best day as a share of the ${J.ofTarget ? 'target' : 'profit'}`,
      `the rule is ${size.consistency}`, `${Math.round(J.share * 100)}%`));
  }
  if (J.newsRule) {
    rows.push(chk(J.duringNews ? 'mid' : 'ok', J.duringNews ? '~' : '✓', 'Trades you logged as during news',
      'this firm restricts trading around news — check its rule below', String(J.duringNews)));
  }
  card.append(el('div', { class: 'pf-you' }, ...rows));
  return card;
}

/* ---------- getting paid ---------- */
function payoutsCard(program) {
  return el('section', { class: 'card pf-card' },
    el('h3', {}, 'Getting paid', el('span', {}, program.payouts.length > 1 ? `${program.payouts.length} ways` : 'once funded')),
    el('div', { class: 'pf-pay' }, ...program.payouts.map(p => el('div', { class: 'pf-pp' },
      el('div', { class: 't' }, p.name, el('small', {}, p.sub || '')),
      el('div', { class: 'big' }, p.split ? p.split.split('/')[0].trim() + '%' : '—', el('small', {}, 'your split')),
      el('div', { class: 'pf-kv' }, el('span', {}, 'Needs'), el('b', {}, p.needs || '—')),
      el('div', { class: 'pf-kv' }, el('span', {}, 'Cap'), el('b', {}, p.cap || 'none stated')),
      el('div', { class: 'pf-kv' }, el('span', {}, 'Max'), el('b', {}, p.max || '—'))))));
}

/* ---------- what it costs to get funded ---------- */
/** Every program at this size: what it costs over `n` months (monthly) or `n` attempts (one-time). */
export function costs(firm, label, n) {
  return firm.programs.map(p => {
    const s = p.sizes.find(x => x.label === label);
    if (!s || s.price == null) return null;
    return { name: p.name, cur: p.currency || '$', fee: s.price * n, activation: s.activation || 0, total: s.price * n + (s.activation || 0), monthly: p.pricing === 'monthly' };
  }).filter(Boolean);
}

function costCard(firm, size, repaint) {
  const anyMonthly = firm.programs.some(p => p.pricing === 'monthly');
  const unit = anyMonthly ? 'month' : 'attempt';
  const rows = costs(firm, size.label, stretch);
  const card = el('section', { class: 'card pf-card pf-cost' },
    el('h3', {}, 'What it costs to get funded', el('span', {}, anyMonthly ? 'if it takes you…' : 'if it takes you…')));
  const range = el('input', { type: 'range', min: 1, max: 6, step: 1, value: stretch, class: 'pf-range', 'aria-label': anyMonthly ? 'Months to pass' : 'Attempts to pass',
    onInput: e => { stretch = Number(e.target.value); repaint(); } });
  card.append(el('div', { class: 'pf-rangewrap' }, range,
    el('div', { class: 'ticks' }, ...[1, 2, 3, 4, 5, 6].map(i => el('span', { class: i === stretch ? 'on' : '' }, i === 1 ? `1 ${unit}` : String(i))))));
  if (!rows.length) { card.append(el('p', { class: 'lab-empty' }, 'Prices for this size depend on the options you choose — see the firm’s site.')); return card; }
  const reach = Math.max(...rows.map(r => r.total));
  const low = Math.min(...rows.map(r => r.total));
  card.append(el('div', { class: 'pf-bars' }, ...rows.map(r => el('div', { class: 'pf-bar' + (rows.length > 1 && r.total === low ? ' best' : '') },
    el('span', { class: 'nm' }, r.name),
    el('span', { class: 'tk' }, el('i', { style: { width: (r.fee / reach * 100) + '%' } }), r.activation ? el('i', { class: 'fee', style: { width: (r.activation / reach * 100) + '%' } }) : null),
    el('b', {}, money(r.cur, r.total))))));
  const best = rows.find(r => r.total === low);
  card.append(el('div', { class: 'pf-verdict' }, rows.length > 1
    ? [`Over ${stretch} ${unit}${stretch === 1 ? '' : 's'}, `, el('em', {}, best.name), ' is cheapest at this size.', rows.some(r => r.activation) ? [' ', el('span', { style: { color: 'var(--yellow)' } }, '■'), ' activation fee'] : null]
    : [`${stretch} ${unit}${stretch === 1 ? '' : 's'} at this size costs `, el('em', {}, money(best.cur, best.total)), best.activation ? ', activation included.' : '.']));
  return card;
}

/* ---------- the fine print ---------- */
const SEV = [['all', 'All'], ['danger', 'Ends the account'], ['caution', 'Costs you'], ['info', 'Good to know']];
function fineCard(firm, repaint) {
  const n = k => (k === 'all' ? firm.rules.length : firm.rules.filter(r => r.sev === k).length);
  const shown = firm.rules.filter(r => fineSev === 'all' || r.sev === fineSev);
  return el('section', { class: 'card pf-fine' },
    el('div', { class: 'head2' }, el('h3', {}, 'The fine print', el('span', {}, 'what actually ends accounts and denies payouts')),
      el('div', { class: 'filters' }, ...SEV.map(([k, l]) => el('button', { class: k === fineSev ? 'on' : '', onClick: () => { fineSev = k; repaint(); } },
        k === 'all' ? null : el('i', { class: 'is-' + k }), `${l} ${n(k)}`)))),
    ...shown.map(r => {
      const why = el('div', { class: 'why' });
      /* The research marks one key phrase per rule; anything else is text. */
      String(r.why).split(/(<em>.*?<\/em>)/).forEach(part => {
        const m = part.match(/^<em>(.*)<\/em>$/);
        why.append(m ? el('em', {}, m[1]) : document.createTextNode(part));
      });
      return el('div', { class: 'pf-rule ' + r.sev },
        el('span', { class: 'sev' }, r.sev === 'danger' ? '!' : r.sev === 'caution' ? '~' : 'i'),
        el('div', { class: 'tt' }, r.title, el('small', {}, r.sub || '')),
        why,
        el('span', { class: 'src ' + (r.src === 'Official' ? 'off' : 'fp'), title: r.src === 'Official' ? 'From the firm’s own help centre or rules' : 'From independent guides — not confirmed on the firm’s own pages' }, r.src));
    }));
}

/* ---------- Quire's take ---------- */
function takeCard(firm) {
  return el('section', { class: 'card pf-take' },
    el('h3', {}, 'Quire’s take', el('span', {}, 'an opinion from the rules above — not advice')),
    el('div', { class: 'pf-takecols' },
      el('div', { class: 'pf-takecol is-pro' }, el('span', { class: 'pf-k' }, 'Going for it'),
        ...firm.take.pros.map(x => el('div', { class: 'pf-ti' }, el('i', {}, '+'), x))),
      el('div', { class: 'pf-takecol is-watch' }, el('span', { class: 'pf-k' }, 'Watch out for'),
        ...firm.take.watch.map(x => el('div', { class: 'pf-ti' }, el('i', {}, '!'), x)))),
    el('div', { class: 'pf-verdictline' }, el('b', {}, 'In short'), firm.take.verdict));
}

/* ---------- where it came from ---------- */
function openLink(url) {
  if (typeof window !== 'undefined' && window.__TAURI__) {
    navigator.clipboard?.writeText(url).then(() => toast('Link copied — paste it into your browser'), () => toast(url));
  } else window.open(url, '_blank', 'noopener');
}
function sourcesCard(firm) {
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  const own = firm.sources.filter(u => host(u).includes(host(firm.rulesUrl).split('.').slice(-2)[0]));
  const rest = firm.sources.filter(u => !own.includes(u));
  return el('section', { class: 'card pf-src' },
    el('div', { class: 'pf-k' }, `Sources · checked ${CHECKED_TEXT}`),
    el('div', { class: 'pf-links' },
      el('button', { class: 'pf-link is-main', onClick: () => openLink(firm.rulesUrl) }, `${firm.name}’s rules ↗`),
      el('span', { class: 'pf-srcn' }, `${own.length} pages from ${firm.name} · ${rest.length} independent guides`),
      ...rest.slice(0, 4).map(u => el('button', { class: 'pf-link', onClick: () => openLink(u) }, host(u)))));
}

/* ---------- into The Lab ---------- */
/** A Prop firm rule sheet with this account's numbers in it. */
export function sheetFor(firm, program, size) {
  /* "FTMO · FTMO Challenge: 2-Step" says the firm twice. */
  const prog = program.name.startsWith(firm.name) ? program.name.slice(firm.name.length).replace(/^[\s:·-]+/, '') : program.name;
  const sh = blankSheet(`${firm.name} · ${prog} · ${size.label}`);
  const b = size.balance, pc = v => (v == null ? null : +(v / b * 100).toFixed(2));
  const two = program.stages.filter(s => /phase|evaluation|step/i.test(s.tag)).length >= 2 && program.stages.some(s => /phase 2/i.test(s.tag));
  const ddType = size.maxLossType === 'static' ? 'static' : size.maxLossType === 'intraday trailing' ? 'intraday' : 'eod';
  const split = (() => { const p = program.payouts.find(x => x.split); return p ? Number(p.split.split('/')[0]) : null; })();
  Object.assign(sh, {
    size: b, fee: size.price, activation: size.activation || null,
    refund: /refunded with (your )?first/i.test(JSON.stringify(program.payouts) + JSON.stringify(program.stages) + program.note) && !/not refunded/i.test(program.note),
    steps: two ? 2 : 1, target1: pc(size.target), target2: two ? 5 : null,
  });
  Object.assign(sh.eval, { dd: pc(size.maxLoss), ddType, lock: ddType !== 'static' && !!size.lock, daily: pc(size.dailyLoss), dailyMode: 'fail',
    minDays: size.minDays || null, best: pctIn(size.consistency) });
  Object.assign(sh.funded, { dd: pc(size.maxLoss), ddType, lock: ddType !== 'static' && !!size.lock, daily: pc(size.dailyLoss), dailyMode: 'fail', split });
  return sh;
}

async function useInLab(store, nav, firm, program, size) {
  const lab = store.data.lab;
  const sh = sheetFor(firm, program, size);
  const same = lab.firms.find(f => f.name === sh.name);
  if (same) Object.assign(same, { ...sh, id: same.id }); else lab.firms.push(sh);
  lab.firmId = (same || sh).id;
  await store.save('lab');
  toast(`${sh.name} is in The Lab — check the numbers, then run it`);
  nav.go('#/lab/rules');
}
