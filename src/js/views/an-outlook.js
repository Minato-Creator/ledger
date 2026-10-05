/* ============================================================
   Analytics · Outlook — the morning's bias against the day, and the
   trades against the bias (outlookedge.js does the sums).

   Four figures: how often the bias was right, and R on trades with it,
   against it, and with none. Under them, each call: the day it made, and
   what was traded on it.
   ============================================================ */
import { el } from '../ui.js';
import * as c from '../calc.js';
import * as oe from '../outlookedge.js';

const BIAS = { long: 'Long', short: 'Short', neutral: 'Neutral' };
const sign = v => (v > 1e-9 ? 'is-pos' : v < -1e-9 ? 'is-neg' : '');
const rTxt = v => (v == null ? '—' : c.rFmt(v));

function tile(k, v, sub, cls = '') {
  return el('div', { class: 'lab-tile an-tile ao-tile ' + cls }, el('div', { class: 'k' }, k), el('div', { class: 'v' }, v), el('div', { class: 's' }, sub));
}
const bucketSub = b => (b.n ? `${b.n} trade${b.n === 1 ? '' : 's'} · ${c.pct(b.winRate ?? 0, 0)} won · avg ${rTxt(b.avg)}` : 'no trades');

/** The bias-right figure, filled in once the calls are graded. */
function rightTile(G, n) {
  if (!n) return tile('Bias right', '—', 'no Long or Short calls written in this window', 'ao-right');
  if (!G) return tile('Bias right', '…', `grading ${n} call${n === 1 ? '' : 's'} on their daily candles`, 'ao-right is-wait');
  const graded = G.right + G.wrong;
  const extra = [G.waiting ? `${G.waiting} not graded` : null, G.flat ? `${G.flat} flat` : null].filter(Boolean).join(' · ');
  return tile('Bias right', G.rate == null ? '—' : c.pct(G.rate, 0),
    graded ? `${G.right} of ${graded} calls${extra ? ' · ' + extra : ''}` : extra || 'none graded yet', 'ao-right ' + (G.rate == null ? '' : G.rate >= 0.5 ? 'is-pos' : 'is-neg'));
}

/**
 * @param trades  the closed trades in the window
 * @param from    the window's first date (null: everything)
 */
export function outlookTab(store, acct, trades, ctx, from = null) {
  const B = oe.biasBuckets(store, acct, trades);
  const calls = oe.callsBetween(store, from, c.todayISO());
  const tilesRow = el('div', { class: 'ao-tiles' });
  const listCard = el('section', { class: 'card ao-calls' });
  let G = null;

  const paintTiles = () => tilesRow.replaceChildren(
    rightTile(G, calls.length),
    tile('With your bias', rTxt(B.same.r), bucketSub(B.same), 'ao-same ' + sign(B.same.r)),
    tile('Against your bias', rTxt(B.diff.r), bucketSub(B.diff), 'ao-diff ' + sign(B.diff.r)),
    tile('No bias', rTxt(B.none.r), B.none.n ? `${B.none.n} trade${B.none.n === 1 ? '' : 's'} · ${B.neutral} neutral, ${B.noOutlook} nothing written` : 'no trades', 'ao-none ' + sign(B.none.r)));

  /* each call, newest first: the day it made, the trades on it */
  const paintList = () => {
    const graded = new Map((G?.list || []).map(x => [`${x.date}|${x.pair}`, x]));
    const rows = calls.slice().reverse().map(call => {
      const g = graded.get(`${call.date}|${call.pair}`);
      const on = trades.filter(t => t.date === call.date && c.cleanSymbol(t.pair) === call.pair && t.status !== 'open');
      const rs = on.map(t => c.rMultiple(acct, t)).filter(r => r != null && isFinite(r));
      const net = rs.length ? rs.reduce((a, b) => a + b, 0) : null;
      const same = on.filter(t => oe.sideOf(call.bias, t.side) === 'same').length;
      const move = g?.candle ? g.candle.move / g.candle.open * 100 : null;
      return el('div', { class: 'ao-row', 'data-date': call.date, 'data-pair': call.pair },
        el('span', { class: 'ao-date' }, niceDate(call.date)),
        el('span', {}, call.pair),
        el('span', { class: 'ao-bias is-' + call.bias }, BIAS[call.bias]),
        el('span', { class: 'ao-move ' + sign(move ?? 0) }, move == null ? (g?.state === 'today' ? 'today' : g ? '—' : '…') : `${move > 0 ? '▲' : move < 0 ? '▼' : ''} ${Math.abs(move).toFixed(2)}%`),
        el('span', { class: 'ao-grade ' + (g?.right === true ? 'is-right' : g?.right === false ? 'is-wrong' : '') }, g?.right === true ? 'Right' : g?.right === false ? 'Wrong' : '—'),
        el('span', { class: 'ao-trades' }, on.length ? `${on.length} trade${on.length === 1 ? '' : 's'} · ${same === on.length ? 'with it' : same === 0 ? 'against it' : `${same} with, ${on.length - same} against`}` : 'no trades'),
        el('span', { class: 'ao-r ' + sign(net ?? 0) }, rTxt(net)),
        el('button', { class: 'ao-open', title: 'Open that morning’s outlook', onClick: () => ctx.nav.go('#/outlook/' + call.date) }, '›'));
    });
    listCard.replaceChildren(
      el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Calls'),
        el('span', { class: 'lab-sub' }, 'right when the day’s candle (New York 5pm to 5pm) closed the way you called it'),
        G?.why ? el('span', { class: 'lab-sub ao-why' }, `Some not graded — ${G.why}.`) : null),
      el('div', { class: 'ao-row is-head' }, ...['Day', 'Pair', 'Bias', 'The day', '', 'Traded', 'R', ''].map(h => el('span', {}, h))),
      ...(rows.length ? rows : [el('p', { class: 'ao-empty' }, 'No Long or Short calls in this window. Write a bias on the Outlook page and it is graded here once the day is done.')]));
  };

  paintTiles(); paintList();
  if (calls.length) oe.gradeCalls(store, calls).then(res => { G = res; paintTiles(); paintList(); }).catch(() => {});
  const body = el('div', { class: 'an-body ao-body' }, tilesRow, listCard);
  body.__outlook = { buckets: B, calls, get graded() { return G; } };
  return body;
}

/** The last 30 days in one line, for the top of the Outlook page. */
export function outlookStrip(store, acct, nav) {
  const from = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();
  const trades = store.tradesFor(acct.id).filter(t => t.date >= from);
  const B = oe.biasBuckets(store, acct, trades);
  const calls = oe.callsBetween(store, from, c.todayISO());
  const strip = el('button', { class: 'ao-strip', title: 'Analytics → Outlook', onClick: () => { setOutlookTab(); nav.go('#/analytics'); } });
  const fig = (k, v, cls = '') => el('span', { class: 'ao-sf ' + cls }, el('i', {}, k), el('b', {}, v));
  const paint = G => strip.replaceChildren(
    el('span', { class: 'ao-sk' }, 'Last 30 days'),
    fig('bias right', !calls.length ? '—' : !G ? '…' : G.rate == null ? '—' : c.pct(G.rate, 0), G && G.rate != null ? (G.rate >= 0.5 ? 'is-pos' : 'is-neg') : ''),
    fig('with it', `${rTxt(B.same.r)} (${B.same.n})`, sign(B.same.r)),
    fig('against it', `${rTxt(B.diff.r)} (${B.diff.n})`, sign(B.diff.r)),
    fig('no bias', `${rTxt(B.none.r)} (${B.none.n})`, sign(B.none.r)),
    el('span', { class: 'ao-sgo' }, '›'));
  paint(null);
  if (calls.length) oe.gradeCalls(store, calls).then(paint).catch(() => {});
  return strip;
}
let wantTab = null;
const setOutlookTab = () => { wantTab = 'outlook'; };
/** Analytics asks once whether it was sent here for its Outlook tab. */
export const takeWantedTab = () => { const t = wantTab; wantTab = null; return t; };

function niceDate(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
}
