/* Analytics → Execution.

   The questions New trade asks (confidence going in, feeling after, how it
   ended, mistakes, timeframe, price delivery) read back as edge. The sums are
   checked by hand on seven trades short enough to add up in your head, then
   every figure on the page is worked out again here, from the trades,
   without the app's code, and the page has to agree. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB, makeTrades } from '../fixtures/ghost-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9;

/* ---------- the trades: the first thirty from before the questions ---------- */
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const MK = [['closed_early', 'Closed early'], ['early_entry', 'Early entry'], ['no_confirm', 'No confirmation entry'], ['be_early', 'Moved to BE early'],
  ['bad_sl', 'Bad stop loss'], ['tp_far', 'TP too far'], ['wrong_bias', 'Wrong bias']];
const TFS = ['1m', '3m', '5m', '15m', '30m', '1H', '4H', 'D'];
const CONF = ['Revenge', 'Forced', 'Unsure', 'Solid', 'Confident'];
const FEEL = ['Angry', 'Regret', 'Indifferent', 'Content', 'Satisfied'];
const EXITS = [['tp', 'Take profit'], ['sl', 'Stop loss'], ['be', 'Break-even'], ['manual', 'Closed manually']];
const TR = makeTrades().map((x, i) => {
  if (i < 30) return x;
  const win = x.netResult > 0, loss = x.netResult < 0;
  const conf = Math.max(1, Math.min(5, Math.round((win ? 3.6 : 2.6) + (rnd() - .5) * 2.6)));
  const after = i % 11 === 0 ? null : win ? 3 + Math.floor(rnd() * 3) : loss ? 1 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 3);
  const mist = rnd() < (loss ? .6 : .25) ? [MK[Math.floor(rnd() * (loss ? 7 : 4))][0]] : [];
  if (rnd() < .12) mist.push(MK[Math.floor(rnd() * 7)][0]);
  return { ...x, confidence: conf, emotionAfter: after, exitReason: win ? (rnd() < .75 ? 'tp' : 'manual') : loss ? (rnd() < .85 ? 'sl' : 'manual') : 'be',
    execTf: TFS[Math.floor(rnd() * 6)], mistakes: [...new Set(mist)], delivery: ['good', 'neutral', 'poor'][win ? Math.floor(rnd() * 2) : Math.floor(rnd() * 3)] };
});

/* ---------- every figure, worked out again ---------- */
const R = x => x.netResult / (ACCT.startingBalance * x.riskPercent / 100);
const rows = TR.filter(x => x.status !== 'open').map(x => ({ x, r: R(x) }));
const grp = list => { const n = list.length, w = list.filter(q => q.r > 0).length, l = list.filter(q => q.r < 0).length, sum = list.reduce((a, q) => a + q.r, 0);
  return { n, sum, avg: n ? sum / n : null, wr: w + l ? w / (w + l) : null }; };
const RR = (v, d = 2) => v == null ? '—' : `${v > 0.0005 ? '+' : v < -0.0005 ? '−' : ''}${Math.abs(v).toFixed(d)}R`;
const PC = v => v == null ? '—' : Math.round(v * 100) + '%';
const askedM = rows.filter(q => Array.isArray(q.x.mistakes));
const CLEAN = grp(askedM.filter(q => !q.x.mistakes.length)), DIRTY = grp(askedM.filter(q => q.x.mistakes.length));
const MCOST = MK.map(([k, label]) => { const g = grp(askedM.filter(q => q.x.mistakes.includes(k))); return { k, label, ...g, cost: g.n ? (g.avg - CLEAN.avg) * g.n : null }; })
  .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0)).filter(m => m.n);
const BYC = [1, 2, 3, 4, 5].map(v => grp(rows.filter(q => q.x.confidence === v)));
const BYTF = TFS.map(v => grp(rows.filter(q => q.x.execTf === v)));
const best = (gs, keys) => { const i = gs.map((g, j) => j).filter(j => gs[j].n >= 3).sort((a, b) => gs[b].avg - gs[a].avg)[0]; return i == null ? null : { key: keys[i], ...gs[i] }; };
const BC = best(BYC, [1, 2, 3, 4, 5]), BTF = best(BYTF, TFS);
const answered = k => rows.filter(q => q.x[k] != null).length;
const EX = EXITS.map(([k, label]) => ({ k, label, ...grp(rows.filter(q => q.x.exitReason === k)) })).filter(g => g.n);
const EXN = EX.reduce((a, g) => a + g.n, 0);
const DL = ['good', 'neutral', 'poor'].map(k => grp(rows.filter(q => q.x.delivery === k)));
/* The grid as drawn: confident at the top, angry on the left. */
const GRID = [];
for (let cv = 5; cv >= 1; cv--) for (let ev = 1; ev <= 5; ev++) { const n = rows.filter(q => q.x.confidence === cv && q.x.emotionAfter === ev).length; if (n) GRID.push(String(n)); }
const BOTH = rows.filter(q => q.x.confidence != null && q.x.emotionAfter != null).length;

const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({ ACCT, TR, PB }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: 'R', theme: 'dark', accounts: [ACCT, { ...ACCT, id: 'acc_2', name: 'Old' }], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: [...TR, ...TR.slice(0, 20).map(x => ({ ...x, id: x.id + 'b', accountId: 'acc_2' }))] })],
    ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, TR, PB });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });

/* ===================== the sums, by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async () => {
  const E = await import('/js/views/an-execution.js');
  const A = { startingBalance: 100000 };
  const T = (net, f) => ({ date: '2026-09-14', netResult: net, riskPercent: 1, status: 'closed', ...f });
  const tr = [
    T(2000,  { confidence: 5, emotionAfter: 5, exitReason: 'tp', execTf: '5m', mistakes: [], delivery: 'good' }),
    T(1000,  { confidence: 5, emotionAfter: 4, exitReason: 'tp', execTf: '5m', mistakes: [], delivery: 'good' }),
    T(-1000, { confidence: 1, emotionAfter: 1, exitReason: 'sl', execTf: '1m', mistakes: ['early_entry'], delivery: 'poor' }),
    T(-500,  { confidence: 1, emotionAfter: 2, exitReason: 'manual', execTf: '1m', mistakes: ['early_entry', 'wrong_bias'], delivery: 'poor' }),
    T(0,     { confidence: 3, exitReason: 'be', execTf: '15m', mistakes: ['closed_early'], delivery: 'neutral' }),
    { ...T(0, { confidence: 4, mistakes: ['bad_sl'] }), status: 'open' },
    T(3000,  {}),
  ];
  const S = E.execStats(A, tr);
  /* Two trades at a level is not enough to call it the best. */
  const page = E.executionTab(null, A, tr, {});
  const tl = [...page.querySelectorAll('.lab-tile')].map(x => x.querySelector('.v').textContent);
  const thin = [...page.querySelectorAll('.ex-bar')].map(x => x.classList.contains('is-thin'));
  const g = o => ({ n: o.n, avg: o.avg, sum: o.sum, wr: o.winRate });
  return { total: S.total, answered: S.answered, clean: g(S.clean), dirty: g(S.withMistakes), enough: E.ENOUGH,
    mist: S.mistakes.map(m => [m.key, m.n, m.avg, m.cost]),
    conf: S.confidence.map(g), tf: S.execTf.map(x => [x.key, x.n, x.avg]), exit: S.exitReason.map(x => [x.key, x.n, x.sum]),
    dl: S.delivery.map(x => [x.key, x.n, x.avg]), g55: g(S.grid[4][4]), g12: g(S.grid[0][1]), g31: g(S.grid[2][0]),
    gridN: S.grid.flat().reduce((a, x) => a + x.n, 0), tl, thin };
});
t('the open trade is left out, the old one counted', H.total === 6, String(H.total));
t('the old one answers nothing', H.answered.confidence === 5 && H.answered.emotionAfter === 4 && H.answered.mistakes === 5 && H.answered.delivery === 5, JSON.stringify(H.answered));
t('clean trades: two, at +1.5R', H.clean.n === 2 && near(H.clean.avg, 1.5), JSON.stringify(H.clean));
t('with a mistake: three, at −0.5R', H.dirty.n === 3 && near(H.dirty.avg, -0.5), JSON.stringify(H.dirty));
t('early entry cost (−0.75 − 1.5) × 2 = −4.5R', H.mist[0][0] === 'early_entry' && H.mist[0][1] === 2 && near(H.mist[0][3], -4.5), JSON.stringify(H.mist[0]));
t('wrong bias next, −2R; closed early, −1.5R', H.mist[1][0] === 'wrong_bias' && near(H.mist[1][3], -2) && H.mist[2][0] === 'closed_early' && near(H.mist[2][3], -1.5), JSON.stringify(H.mist.slice(1, 3)));
t('the open trade’s mistake is not counted', H.mist.find(m => m[0] === 'bad_sl')[1] === 0 && H.mist.find(m => m[0] === 'bad_sl')[3] === null);
t('confident: two trades, +1.5R, all won', H.conf[4].n === 2 && near(H.conf[4].avg, 1.5) && H.conf[4].wr === 1, JSON.stringify(H.conf[4]));
t('revenge: two trades, −0.75R, none won', H.conf[0].n === 2 && near(H.conf[0].avg, -0.75) && H.conf[0].wr === 0, JSON.stringify(H.conf[0]));
t('a break-even is no win rate at all', H.conf[2].n === 1 && H.conf[2].avg === 0 && H.conf[2].wr === null, JSON.stringify(H.conf[2]));
t('nothing at solid (the open one does not count)', H.conf[3].n === 0 && H.conf[3].avg === null);
t('5m: two at +1.5R; 1m: two at −0.75R', JSON.stringify(H.tf.slice(0, 3)) === JSON.stringify([['1m', 2, -0.75], ['3m', 0, null], ['5m', 2, 1.5]]), JSON.stringify(H.tf.slice(0, 3)));
t('exits: tp twice for +3R, one each of the rest', JSON.stringify(H.exit) === JSON.stringify([['tp', 2, 3], ['sl', 1, -1], ['be', 1, 0], ['manual', 1, -0.5]]), JSON.stringify(H.exit));
t('delivery: good +1.5R, neutral 0, poor −0.75R', JSON.stringify(H.dl) === JSON.stringify([['good', 2, 1.5], ['neutral', 1, 0], ['poor', 2, -0.75]]), JSON.stringify(H.dl));
t('grid: confident and satisfied is the +2R trade', H.g55.n === 1 && H.g55.avg === 2);
t('grid: revenge and regret is the −0.5R trade', H.g12.n === 1 && H.g12.avg === -0.5);
t('two trades at a level are not called the best', H.tl[3] === '—' && H.tl[4] === '—', JSON.stringify(H.tl));
t('a mistake made twice sits back', H.thin.length === 3 && H.thin.every(Boolean), JSON.stringify(H.thin));
t('grid: a trade with no feeling after is in no cell', H.gridN === 4 && H.g31.n === 0, String(H.gridN));

/* ===================== the page ===================== */
console.log('the page');
await p.evaluate(() => { location.hash = '#/analytics'; });
await p.waitForSelector('.head .seg');
const click = label => p.evaluate(l => [...document.querySelectorAll('.head :is(.seg, .an-tabs) button')].find(b => b.textContent.trim() === l)?.click(), label);
await click('All'); await p.waitForTimeout(200);
t('there is an Execution tab, after Timing', await p.evaluate(() => [...document.querySelectorAll('.head .an-tabs .sn-tab')].map(b => b.textContent.trim()).join(',')) === 'Overview,Weekly winrate,Tags,Timing,Execution,Discipline,Outlook');
await click('Execution'); await p.waitForTimeout(500);
t('it is the one lit', await p.evaluate(() => document.querySelector('.head .an-tabs .is-on')?.textContent.trim()) === 'Execution');

const tiles = await p.evaluate(() => [...document.querySelectorAll('.ex-tiles .lab-tile')].map(x => [x.querySelector('.k').textContent, x.querySelector('.v').textContent, x.querySelector('.s').textContent]));
t('five tiles', tiles.length === 5, String(tiles.length));
t('clean trades, a trade', tiles[0][1] === RR(CLEAN.avg) && tiles[0][2].includes(`${CLEAN.n} trades`), JSON.stringify(tiles[0]) + ' want ' + RR(CLEAN.avg));
t('with a mistake, a trade', tiles[1][1] === RR(DIRTY.avg) && tiles[1][2].includes(`${DIRTY.n} trades`), JSON.stringify(tiles[1]) + ' want ' + RR(DIRTY.avg));
t('the costliest mistake, and what it cost', tiles[2][1] === RR(MCOST[0].cost, 1) && tiles[2][2] === MCOST[0].label, JSON.stringify(tiles[2]) + ` want ${RR(MCOST[0].cost, 1)} ${MCOST[0].label}`);
t('the best confidence, with three or more', BC && tiles[3][1] === `${BC.key} · ${CONF[BC.key - 1]}` && tiles[3][2].startsWith(RR(BC.avg)), JSON.stringify(tiles[3]));
t('the best timeframe, with three or more', BTF && tiles[4][1] === BTF.key && tiles[4][2].startsWith(RR(BTF.avg)), JSON.stringify(tiles[4]));
t('a clean trade outearns one with a mistake here', CLEAN.avg > DIRTY.avg);

/* Confidence: a column per level. */
const lv = await p.evaluate(() => { const c = document.querySelectorAll('.ex-levels')[0];
  return { sub: c.querySelector('.lab-sub').textContent, vals: [...c.querySelectorAll('.ex-val')].map(x => x.textContent), keys: [...c.querySelectorAll('.ex-key')].map(x => x.textContent),
    ticks: [...c.querySelectorAll('.lab-tick')].map(x => x.textContent), cols: [...c.querySelectorAll('.ex-col')].map(x => x.getAttribute('class')) }; });
t('confidence says how many answered', lv.sub === `${answered('confidence')} of ${rows.length} trades answered`, lv.sub);
t('every level named, revenge to confident', lv.keys.join('|') === CONF.map((n, i) => `${i + 1} ${n}`).join('|'), lv.keys.join('|'));
t('each column is its level’s R a trade', lv.vals.join(' ') === BYC.filter(g => g.n).map(g => RR(g.avg)).join(' '), lv.vals.join(' ') + ' want ' + BYC.filter(g => g.n).map(g => RR(g.avg)).join(' '));
t('with its count and win rate under', lv.ticks.join('|') === BYC.map(g => g.n ? `${g.n} · ${PC(g.wr)}` : '—').join('|'), lv.ticks.join('|'));
t('a level under three trades sits back', lv.cols.every((cls, i) => cls.includes('is-thin') === (BYC.filter(g => g.n)[i].n < 3)), lv.cols.join('|'));
t('losing levels hang below the line, winning ones stand on it', lv.cols.every((cls, i) => cls.includes(BYC.filter(g => g.n)[i].avg >= 0 ? 'is-pos' : 'is-neg')));

/* Hover a column. */
const hit = await p.$$('.ex-levels .an-hit');
const ci = BYC.findIndex(g => g.n >= 3);
await hit[ci].hover(); await p.waitForTimeout(150);
const tip = await p.evaluate(() => document.querySelector('.ex-levels .lab-read:not([hidden])')?.innerText || '');
t('hovering a level reads it back', tip.includes(RR(BYC[ci].avg)) && tip.includes(RR(BYC[ci].sum, 1)) && tip.includes(`over ${BYC[ci].n} trades`), tip.replace(/\n/g, ' / '));

/* Before and after. */
const gr = await p.evaluate(() => { const c = document.querySelector('.ex-grid');
  return { sub: c.querySelector('.lab-sub').textContent, ns: [...c.querySelectorAll('.ex-cell-n')].map(x => x.textContent), cells: c.querySelectorAll('.ex-cell').length,
    empty: c.querySelectorAll('.ex-cell.is-empty').length, rowsL: [...c.querySelectorAll('.lab-tick')].slice(0, 5).map(x => x.textContent) }; });
t('before & after counts trades with both', gr.sub === `${BOTH} trades with both`, gr.sub);
t('twenty-five cells', gr.cells === 25);
t('each cell’s count, confident at the top', gr.ns.join(',') === GRID.join(','), gr.ns.join(',') + ' want ' + GRID.join(','));
t('and the empty ones say so', gr.empty === 25 - GRID.length, String(gr.empty));
t('confident on top, revenge at the bottom', gr.rowsL[0] === '5 Confident' && gr.rowsL[4] === '1 Revenge', gr.rowsL.join('|'));
const cellFill = await p.evaluate(() => [...document.querySelectorAll('.ex-grid .ex-cell:not(.is-empty)')].map(x => x.getAttribute('style')));
const gridAvg = []; for (let cv = 5; cv >= 1; cv--) for (let ev = 1; ev <= 5; ev++) { const g = grp(rows.filter(q => q.x.confidence === cv && q.x.emotionAfter === ev)); if (g.n) gridAvg.push(g.avg); }
t('a cell is green when it paid, red when it cost', cellFill.every((s, i) => s.includes(gridAvg[i] >= 0 ? '--profit-rgb' : '--loss-rgb')), cellFill.length + ' cells');

/* What mistakes cost. */
const ms = await p.evaluate(() => [...document.querySelectorAll('.ex-bar')].map(x => ({ nm: x.querySelector('.nm').textContent, b: x.querySelector('b').textContent, s: x.querySelector('small').textContent,
  thin: x.classList.contains('is-thin'), side: x.querySelector('.f')?.classList.contains('is-neg') ? 'neg' : 'pos', w: parseFloat(x.querySelector('.f')?.style.width) })));
t('every mistake made, costliest first', ms.map(m => m.nm).join('|') === MCOST.map(m => m.label).join('|'), ms.map(m => m.nm).join('|'));
t('each with what it cost against a clean trade', ms.map(m => m.b).join(' ') === MCOST.map(m => RR(m.cost, 1)).join(' '), ms.map(m => m.b).join(' '));
t('and how often, at what a trade', ms.map(m => m.s).join('|') === MCOST.map(m => `${m.n} · ${RR(m.avg)}`).join('|'), ms.map(m => m.s).join('|'));
t('a mistake that cost reaches left', ms.every((m, i) => m.side === (MCOST[i].cost < 0 ? 'neg' : 'pos')));
const reach = Math.max(0.5, ...MCOST.map(m => Math.abs(m.cost)));
t('bars on one scale', ms.every((m, i) => Math.abs(m.w - Math.abs(MCOST[i].cost) / reach * 50) < 0.01), ms.map(m => m.w.toFixed(1)).join(','));
t('a mistake made once or twice sits back', ms.every((m, i) => m.thin === (MCOST[i].n < 3)));
const msSub = await p.evaluate(() => document.querySelector('.ex-mistakes .lab-sub').textContent);
t('it says what a clean trade makes', msSub === `against a clean trade at ${RR(CLEAN.avg)}`, msSub);

/* How trades ended. */
const ex = await p.evaluate(() => ({ rows: [...document.querySelectorAll('.ex-exit')].map(x => [x.querySelector('.nm').textContent, x.querySelector('.sh').textContent, x.querySelector('b').textContent, x.querySelector('small').textContent]),
  stack: [...document.querySelectorAll('.ex-stack i')].map(x => x.style.flexGrow || x.style.flex) }));
t('every way out that happened', ex.rows.map(r => r[0]).join('|') === EX.map(g => g.label).join('|'), ex.rows.map(r => r[0]).join('|'));
t('its share of trades', ex.rows.map(r => r[1]).join(' ') === EX.map(g => PC(g.n / EXN)).join(' '), ex.rows.map(r => r[1]).join(' '));
t('its R a trade, and in all', ex.rows.map(r => r[2] + ' ' + r[3]).join('|') === EX.map(g => `${RR(g.avg)} ${g.n} · ${RR(g.sum, 1)}`).join('|'), ex.rows.map(r => r[2] + ' ' + r[3]).join('|'));
t('the bar is split by count', ex.stack.map(s => parseFloat(s)).join(',') === EX.map(g => g.n).join(','), ex.stack.join(','));

/* Price delivery. */
const dl = await p.evaluate(() => [...document.querySelectorAll('.ex-dlc')].map(x => ({ k: x.querySelector('.k').textContent, b: x.querySelector('b').textContent,
  f: [...x.querySelectorAll('.ex-dlf b')].map(y => y.textContent), s: x.querySelector('small').textContent })));
t('good, neutral, poor', dl.map(d => d.k).join('|') === 'Good|Neutral|Poor');
t('each one’s R a trade', dl.map(d => d.b).join(' ') === DL.map(g => RR(g.avg)).join(' '), dl.map(d => d.b).join(' '));
t('how often it won, and in all', dl.map(d => d.f.join(' ')).join('|') === DL.map(g => `${PC(g.wr)} ${RR(g.sum, 1)}`).join('|'), dl.map(d => d.f.join(' ')).join('|'));
t('and on how many', dl.map(d => d.s).join('|') === DL.map(g => `${g.n} trades`).join('|'), dl.map(d => d.s).join('|'));

/* Timeframe. */
const tf = await p.evaluate(() => { const c = document.querySelectorAll('.ex-levels')[1]; return { keys: [...c.querySelectorAll('.ex-key')].map(x => x.textContent), vals: [...c.querySelectorAll('.ex-val')].map(x => x.textContent) }; });
t('every timeframe on offer', tf.keys.join(',') === TFS.join(','), tf.keys.join(','));
t('each one’s R a trade', tf.vals.join(' ') === BYTF.filter(g => g.n).map(g => RR(g.avg)).join(' '), tf.vals.join(' '));

/* Fits at 1280: names whole, nothing out of the card. */
await p.setViewportSize({ width: 1280, height: 800 }); await p.waitForTimeout(400);
const fit = await p.evaluate(() => ({
  head: document.querySelector('.head').scrollWidth <= document.querySelector('.head').clientWidth + 1,
  cut: [...document.querySelectorAll('.ex-bar .nm, .ex-exit .nm')].filter(x => x.scrollWidth > x.clientWidth + 1).map(x => x.textContent),
  over: [...document.querySelectorAll('.an-body .card')].filter(c => c.scrollWidth > c.clientWidth + 1).map(c => c.className) }));
t('the header fits at 1280', fit.head);
t('no name cut short at 1280', fit.cut.length === 0, fit.cut.join('|'));
t('no card spills sideways at 1280', fit.over.length === 0, fit.over.join('|'));
await p.setViewportSize({ width: 1600, height: 1000 });

/* A period with only old trades has nothing to read, and says why. */
await p.evaluate(async () => { const { store } = await import('/js/store.js'); store.setActiveAccount ? store.setActiveAccount('acc_2') : (store.data.accounts.activeAccountId = 'acc_2'); });
await p.evaluate(() => { location.hash = '#/dashboard'; }); await p.waitForTimeout(200);
await p.evaluate(() => { location.hash = '#/analytics'; }); await p.waitForTimeout(400);
const empty = await p.evaluate(() => ({ h: document.querySelector('.an-body .lab-prompt h2')?.textContent, charts: document.querySelectorAll('.ex-levels, .ex-grid').length,
  acct: document.querySelector('.topbar')?.textContent.includes('Old') }));
t('an account logged before the questions gets a prompt, not empty charts', empty.h === 'Nothing to read yet' && empty.charts === 0, JSON.stringify(empty));

t('no page errors', errs.length === 0, errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
