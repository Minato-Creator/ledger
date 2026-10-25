/* Replay, part six: analytics — one session, or a group combined.

   Sessions and their trades are written into the vault before the app
   opens, with numbers chosen so every figure can be worked out by hand:
   +2R, −1R, 0R and +1.5R across Monday to Thursday, London, New York and
   outside the Playbook's sessions. Prices come from the OANDA mock for the
   trade's own chart. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB } from '../fixtures/ghost-fixture.mjs';
import { KEY, SERIES, oandaRoute } from '../fixtures/oanda-mock.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const P = (d, hm) => Date.parse(`${d}T${hm}:00+08:00`) / 1000;
const ORIGIN = Date.UTC(2026, 8, 7) / 1000;
const px = s => +SERIES.XAU_USD[0][Math.round((s - ORIGIN) / 60)].toFixed(2);
const trade = (id, side, open, hours, r, risk = 1000) => {
  const openT = P(...open), closeT = openT + hours * 3600, entry = px(openT), dist = 3;
  const long = side === 'buy';
  const sl = +(long ? entry - dist : entry + dist).toFixed(2), tp = +(long ? entry + dist * 3 : entry - dist * 3).toFixed(2);
  const exit = +(long ? entry + r * dist : entry - r * dist).toFixed(2);
  return { id, side, from: 'manual', openT, entry, qty: risk / dist, sl, tp, initSl: sl, riskAmt: risk, closed: true, closeT, exit,
    reason: r > 0 ? 'tp' : r < 0 ? 'sl' : 'manual', pnl: r * risk, r };
};
const base = { inst: 'XAU_USD', from: P('2026-09-08', '00:00'), to: P('2026-09-18', '23:00'), layout: 1, tfs: [5, 60, 240, 15], riskMode: '%', risk: 1, created: '2026-10-01T00:00:00Z', opened: '2026-10-02T00:00:00Z', finished: false };
const SA = { ...base, id: 'sa', name: 'Week A', groupId: 'g1', balance: 100000, at: P('2026-09-18', '10:00'),
  trades: [trade('t1', 'buy', ['2026-09-14', '15:30'], 1, 2), trade('t2', 'sell', ['2026-09-15', '21:00'], 1, -1), trade('t3', 'buy', ['2026-09-16', '10:00'], 2, 0)] };
const SB = { ...base, id: 'sb', name: 'Week B', groupId: 'g1', balance: 100000, at: P('2026-09-18', '10:00'),
  trades: [trade('t4', 'buy', ['2026-09-17', '15:10'], 1, 1.5, 1000), { ...trade('t5', 'sell', ['2026-09-18', '09:00'], 1, 0), closed: false, closeT: null, exit: null, pnl: null, r: null }] };
const SC = { ...base, id: 'sc', name: 'Small', groupId: 'g2', balance: 50000, at: P('2026-09-18', '10:00'), trades: [trade('t6', 'buy', ['2026-09-14', '16:00'], 1, 1, 500)] };
const SD = { ...base, id: 'sd', name: 'Big', groupId: 'g2', balance: 100000, at: P('2026-09-18', '10:00'), trades: [trade('t7', 'sell', ['2026-09-15', '16:00'], 1, -1, 1000)] };
const SE = { ...base, id: 'se', name: 'Fresh', groupId: null, balance: 100000, at: base.from, trades: [], opened: null };
const REPLAY = { version: 1, weeks: {}, settings: { balance: 100000, risk: 1, riskMode: '%' },
  groups: [{ id: 'g1', name: 'London sweeps', collapsed: false }, { id: 'g2', name: 'Mixed', collapsed: false }], sessions: [SA, SB, SC, SD, SE] };

const NOW = new Date('2026-09-20T12:00:00+08:00');
const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 }, timezoneId: 'Australia/Perth' });
await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, oandaRoute([], { mode: 'ok' }));
const p = await ctx.newPage();
/* the figures are read straight away, so the page asks for no motion — the What if animations get their own check below */
await p.emulateMedia({ reducedMotion: 'reduce' });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_|net::|401/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(NOW);
await p.addInitScript(({ ACCT, PB, KEY, REPLAY }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('quire:setting:oandaKey', KEY);
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: [] })], ['data/playbook.json', JSON.stringify(PB)],
    ['data/replay.json', JSON.stringify(REPLAY)]]));
}, { ACCT, PB, KEY, REPLAY });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 250) => p.waitForTimeout(ms);
const go = async (h, ms = 600) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };
const shot = async name => { try { await p.screenshot({ path: `${OUT}/replayanalytics-${name}.png` }); } catch { /* fine */ } };
const tiles = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.ra-tiles .rp-tile')].map(x => [x.querySelector('.rp-k').textContent, { v: x.querySelector('.rp-tv').textContent, s: x.querySelector('.rp-ts').textContent }])));

/* ===================== by hand ===================== */
console.log('by hand');
const A = await p.evaluate(async ({ SA, SB, PB }) => {
  const M = await import('/js/views/replayanalytics.js');
  const a = M.analyse([SA, SB], PB);
  return { n: a.n, total: a.total, pct: a.totalPct, usd: a.totalUsd, won: a.won, lost: a.lost, be: a.be, wr: a.winRate, pf: a.pf, dd: a.maxDD, avg: a.avgWin, avgUsd: a.avgWinUsd,
    same: a.sameBalance, eq: a.rows.map(x => x.eq), order: a.rows.map(x => x.t.id), byDay: a.byDay.map(x => [x.label, x.r, x.n]), bySession: a.bySession.map(x => [x.label, x.r, x.n, x.won]), pairs: a.pairs };
}, { SA, SB, PB });
t('combined: four closed trades (the open one left out), in the order they closed', A.n === 4 && JSON.stringify(A.order) === '["t1","t2","t3","t4"]', JSON.stringify(A.order));
t('total +2.5R, +2.5%, +$2,500', A.total === 2.5 && Math.abs(A.pct - 2.5) < 1e-9 && A.usd === 2500 && A.same);
t('won 2, lost 1, BE 1 — 50%', A.won === 2 && A.lost === 1 && A.be === 1 && A.wr === 0.5);
t('profit factor 3.5, max drawdown −1R, average win +1.75R ($1,750)', A.pf === 3.5 && A.dd === -1 && A.avg === 1.75 && A.avgUsd === 1750);
t('equity after each trade: 2, 1, 1, 2.5', JSON.stringify(A.eq) === '[2,1,1,2.5]');
t('by day: Mon +2, Tue −1, Wed 0, Thu +1.5, Fri nothing', JSON.stringify(A.byDay) === '[["Mon",2,1],["Tue",-1,1],["Wed",0,1],["Thu",1.5,1],["Fri",0,0]]', JSON.stringify(A.byDay));
t('by session: London +3.5 (2 of 2), New York −1, outside 0', JSON.stringify(A.bySession) === '[["London",3.5,2,2],["New York",-1,1,0],["Outside",0,1,0]]', JSON.stringify(A.bySession));
t('trades by pair', JSON.stringify(A.pairs) === '{"XAU_USD":4}');

/* what if: the trades played again — by hand */
const W = await p.evaluate(async () => {
  const S = await import('/js/replaysim.js');
  /* a long from 100, stop 98 (2 away), target 106 (3R); the minutes after it opened */
  const t = { id: 'x', side: 'buy', openT: 0, entry: 100, initSl: 98, sl: 98, tp: 106, closeT: 300, exit: 106, reason: 'tp', r: 3 };
  const rows = [[0, 100, 100, 100, 100], [60, 100, 100.5, 98.6, 99], [120, 99, 103, 98.9, 102], [180, 102, 106.2, 101, 106], [240, 106, 107, 105, 106.5]];
  const path = S.pathOf(rows, t, 1e9);
  const tight = S.simTrade(t, path, { stopMul: 0.5 }), wide = S.simTrade(t, path, { stopMul: 1.5 }), asIs = S.simTrade(t, path, {});
  const two = S.simTrade(t, path, { stopMul: 1, targetR: 1 });   // target 102
  const short = S.simTrade({ ...t, side: 'sell', entry: 100, initSl: 104, sl: 104, tp: 90, reason: 'manual', closeT: 150, exit: 99.5 }, path, {});
  const runOn = S.simTrade({ ...t, tp: 200 }, path, {});
  const rnd = [1, -1, 2, -1, 0.5];
  const m1 = S.monteCarlo(rnd, { n: 20, runs: 300, seed: 7 }), m2 = S.monteCarlo(rnd, { n: 20, runs: 300, seed: 7 }), m3 = S.monteCarlo(rnd, { n: 20, runs: 300, seed: 8 });
  const ones = S.monteCarlo([1], { n: 10, runs: 50, seed: 1 });
  const sum = S.summary([2, -1, 0, 1.5]);
  const items = [{ t, path }];
  return { path: path.map(r => r[0]), tight, wide, asIs, two, short, runOn, same: JSON.stringify(m1) === JSON.stringify(m2), differ: JSON.stringify(m1.end) !== JSON.stringify(m3.end),
    order: m1.band.every(b => b.p5 <= b.p25 + 1e-9 && b.p25 <= b.p50 + 1e-9 && b.p50 <= b.p75 + 1e-9 && b.p75 <= b.p95 + 1e-9), len: m1.band.length,
    ones: [ones.end.p5, ones.end.p95, ones.belowZero, ones.dd.p50, ones.streak.p95], sum,
    sweep: S.stopSweep(items).map(x => [x.k, +x.total.toFixed(3)]), grid: [S.rrGrid(items).length, S.rrGrid(items)[0].length], asTaken: S.simAll(items, { stopMul: 1 }).total };
});
t('what if — the minutes after the trade opened, not the one it opened in', JSON.stringify(W.path) === '[60,120,180,240]', JSON.stringify(W.path));
t('…its stop half as far (99): hit in the first minute, −1R', W.tight.how === 'sl' && Math.abs(W.tight.r + 1) < 1e-9 && W.tight.exitT === 60, JSON.stringify(W.tight));
t('…half as far again (97): it lives, reaches its target — 6 over 3 = +2R', W.wide.how === 'tp' && Math.abs(W.wide.r - 2) < 1e-9 && W.wide.exitT === 180, JSON.stringify(W.wide));
t('…as it was: the target, +3R', W.asIs.how === 'tp' && Math.abs(W.asIs.r - 3) < 1e-9);
t('…the target at 1R (102): reached at 2 minutes, +1R', W.two.how === 'tp' && Math.abs(W.two.r - 1) < 1e-9 && W.two.exitT === 120, JSON.stringify(W.two));
t('…a trade closed by hand that no level reaches closes where it did', W.short.how === 'manual' && Math.abs(W.short.r - 0.5 / 4) < 1e-9, JSON.stringify(W.short));
t('…one that ran to a level, with no level reached, runs on to the end of the prices', W.runOn.how === 'end' && Math.abs(W.runOn.r - 3.25) < 1e-9, JSON.stringify(W.runOn));
t('…nothing moved: exactly the trades as they closed', W.asTaken === 3 && JSON.stringify(W.sweep.find(x => x[0] === 0)) === '[0,3]', JSON.stringify(W.sweep));
t('…stops from 50% closer to twice as far; the grid 5 stops × 7 targets', W.sweep.length === 12 && W.sweep[0][0] === -0.5 && W.sweep.at(-1)[0] === 1 && JSON.stringify(W.grid) === '[5,7]');
t('Monte Carlo: the same seed, the same runs; another seed, others', W.same && W.differ);
t('…the spread in order after every trade (5th ≤ 25th ≤ median ≤ 75th ≤ 95th), one per trade and the start', W.order && W.len === 21);
t('…all wins of +1R: every run ends +10R, never below zero, no drawdown, no losing streak', JSON.stringify(W.ones) === '[10,10,0,0,0]', JSON.stringify(W.ones));
t('the adding up: +2.5R, 2 won · 1 lost, PF 3.5, max drawdown −1R', W.sum.total === 2.5 && W.sum.won === 2 && W.sum.lost === 1 && W.sum.pf === 3.5 && W.sum.maxDD === -1, JSON.stringify(W.sum));

/* prices, for the trades' own charts */
await p.evaluate(async now => { const R = await import('/js/replaydata.js'), C = await import('/js/candles.js'); await R.downloadPair('XAU_USD', await C.getKey(), { now }); }, NOW.getTime() / 1000);

/* ===================== a group ===================== */
console.log('a group');
await go('#/replay', 500);
await p.click('.rp-group[data-group="g1"] .rp-ganalytics'); await settle(600);
t('Group analytics opens the group’s page', await p.evaluate(() => location.hash === '#/replay/group/g1'
  && document.querySelector('.head h1').textContent === 'London sweeps' && /group · 2 sessions combined/.test(document.querySelector('.head .sub').textContent)));
t('Combined, or each session', await p.evaluate(() => [...document.querySelectorAll('.ra-scope button')].map(x => x.textContent).join() === 'Combined,Week A,Week B'
  && document.querySelector('.ra-scope .is-on').dataset.scope === 'all'));
t('same balances: no note, and dollars as well', await p.evaluate(() => !document.querySelector('.ra-note')));
let T = await tiles();
t('the tiles: total, trades, win rate, profit factor, max drawdown, average win', Object.keys(T).join() === 'Total,Trades,Win rate,Profit factor,Max drawdown,Average win', Object.keys(T).join());
t('…+2.50R · +2.50% · +$2,500.00', T.Total.v === '+2.50R' && T.Total.s === '+2.50% · +$2,500.00', JSON.stringify(T.Total));
t('…4 trades, XAUUSD 4; 50%, 2 won · 1 lost · 1 BE', T.Trades.v === '4' && T.Trades.s === 'XAUUSD 4' && T['Win rate'].v === '50%' && T['Win rate'].s === '2 won · 1 lost · 1 BE');
t('…3.50, −1.00R, +1.75R ($1,750)', T['Profit factor'].v === '3.50' && T['Max drawdown'].v === '−1.00R' && T['Average win'].v === '+1.75R' && T['Average win'].s === '+$1,750.00', JSON.stringify([T['Profit factor'], T['Max drawdown'], T['Average win']]));
t('the equity curve is drawn, the deepest fall shaded', await p.evaluate(() => !!document.querySelector('.ra-equity svg .an-line') && !!document.querySelector('.ra-equity .ra-ddband')));
t('By day: Mon to Fri, a bar for each day with trades — green up, red down', await p.evaluate(() => {
  const cats = [...document.querySelectorAll('.ra-byday .ra-cat')].map(x => x.textContent).join();
  const bars = [...document.querySelectorAll('.ra-byday path.ra-col')].map(x => x.getAttribute('class').split(' ')[1]).join();
  return cats === 'Mon,Tue,Wed,Thu,Fri' && bars === 'is-up,is-down,is-flat,is-up';
}));
t('By session: London, New York, and outside them', await p.evaluate(() => [...document.querySelectorAll('.ra-bysession .ra-cat')].map(x => x.textContent).join() === 'London,New York,Outside'
  && [...document.querySelectorAll('.ra-bysession .ra-val')].map(x => x.textContent).join() === '+3.5R,−1.0R,0.0R'));
const barBox = await p.evaluate(() => { const r = document.querySelectorAll('.ra-bysession .ra-hit')[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await p.mouse.move(barBox.x, barBox.y); await settle(120);
t('hover a bar: R, trades and win rate', /London/.test(await p.evaluate(() => document.querySelector('.ra-bysession .lab-read:not([hidden])')?.textContent || '')) && /2trades/.test(await p.evaluate(() => document.querySelector('.ra-bysession .lab-read')?.textContent || '')) && /100%win rate/.test(await p.evaluate(() => document.querySelector('.ra-bysession .lab-read')?.textContent || '')));
/* the trade on the right */
await p.waitForFunction(() => document.querySelector('.ra-chart')?.__chart, null, { timeout: 8000 }).catch(() => {});
await settle(300);
const side = () => p.evaluate(() => ({ h: document.querySelector('.ra-side h2')?.textContent, facts: Object.fromEntries([...document.querySelectorAll('.ra-fact')].map(x => [x.querySelector('span').textContent, x.querySelector('b').textContent])),
  list: [...document.querySelectorAll('.ra-li[data-trade]')].map(x => x.dataset.trade), on: document.querySelector('.ra-li.is-on')?.dataset.trade, chart: !!document.querySelector('.ra-chart')?.__chart }));
let S = await side();
t('on the right, the last trade: on its own chart, its numbers, and the list (newest first)', S.h === 'Long XAUUSD' && S.on === 't4' && S.chart && JSON.stringify(S.list) === '["t4","t3","t2","t1"]', JSON.stringify(S));
t('…entry, stop, target, exit, result, how, units, held', Object.keys(S.facts).join() === 'Entry,Stop,Target,Exit,Result,How,Held,Units' && S.facts.Result === '+1.50R · +$1,500.00' && S.facts.How === 'Target' && S.facts.Held === '1h 0m', JSON.stringify(S.facts));
await shot('group');
await p.click('.ra-li[data-trade="t2"]'); await settle(400);
S = await side();
t('pick another from the list: it takes the chart', S.h === 'Short XAUUSD' && S.on === 't2' && S.facts.Result === '−1.00R · −$1,000.00' && S.facts.How === 'Stop', JSON.stringify(S));
/* scrolled down the list (and the page), picking the last trade keeps both where they were */
await p.addStyleTag({ content: '.ra-list { max-height:70px !important; }' }); await settle(100);
const before = await p.evaluate(() => {
  const l = document.querySelector('.ra-list'), b = document.querySelector('.ra-body'), d = document.scrollingElement;
  l.scrollTop = l.scrollHeight; b.scrollTop = b.scrollHeight; d.scrollTop = d.scrollHeight;
  return { list: l.scrollTop, body: b.scrollTop, doc: d.scrollTop };
});
await p.evaluate(() => [...document.querySelectorAll('.ra-li[data-trade]')].at(-1).click()); await settle(500);
const after = await p.evaluate(() => ({ list: document.querySelector('.ra-list').scrollTop, body: document.querySelector('.ra-body').scrollTop, doc: document.scrollingElement.scrollTop, on: document.querySelector('.ra-li.is-on')?.dataset.trade }));
t('scrolled to the bottom of the list, pick the last trade: the list and the page stay where they were', before.list > 20 && Math.abs(after.list - before.list) <= 1 && Math.abs(after.body - before.body) <= 1 && Math.abs(after.doc - before.doc) <= 1 && after.on === 't1', JSON.stringify([before, after]));
await p.evaluate(() => document.querySelectorAll('style').forEach(x => { if (/max-height:70px/.test(x.textContent)) x.remove(); }));
await p.click('.ra-li[data-trade="t2"]'); await settle(400);
await p.waitForFunction(() => document.querySelector('.ra-chart')?.__chart, null, { timeout: 8000 }).catch(() => {});
const chartTf =await p.evaluate(() => document.querySelector('.ra-chart').__chart.tf);
t('…on a timeframe that suits how long it was held (1 hour → 1m)', chartTf === 1, String(chartTf));
/* click the equity curve */
await p.evaluate(() => document.querySelector('.ra-equity').scrollIntoView({ block: 'center' })); await settle(150);
const eq = await p.evaluate(() => { const r = document.querySelector('.ra-equity .lab-hit').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
await p.mouse.move(eq.x + eq.w * 0.22, eq.y + eq.h / 2); await settle(80);
t('hover the equity: the trade, its date, the equity there', /trade 1/.test(await p.evaluate(() => document.querySelector('.ra-equity .lab-read')?.textContent || '')) && /\+2\.00Requity/.test(await p.evaluate(() => document.querySelector('.ra-equity .lab-read')?.textContent || '')));
await p.mouse.click(eq.x + eq.w * 0.22, eq.y + eq.h / 2); await settle(400);
t('…click: that trade on the right', (await side()).on === 't1');
/* one session of the group */
await p.click('.ra-scope button[data-scope="sb"]'); await settle(500);
T = await tiles();
t('Week B on its own: one trade, +1.50R', T.Trades.v === '1' && T.Total.v === '+1.50R' && (await side()).on === 't4');
await p.click('.ra-scope button[data-scope="all"]'); await settle(400);
/* What if */
await p.waitForFunction(() => document.querySelector('.ra-whatif .ra-wi-tiles'), null, { timeout: 10000 }).catch(() => {});
const wi = () => p.evaluate(() => ({ tab: document.querySelector('.ra-wi-tabs .is-on')?.dataset.tab, tabs: [...document.querySelectorAll('.ra-wi-tabs button')].map(x => x.textContent),
  tiles: Object.fromEntries([...document.querySelectorAll('.ra-wi-tiles .rp-tile')].map(x => [x.querySelector('.rp-k').textContent, { v: x.querySelector('.rp-tv').textContent, s: x.querySelector('.rp-ts').textContent }])),
  steps: [...document.querySelectorAll('.ra-wi-steps button')].map(x => x.textContent), on: document.querySelector('.ra-wi-steps .is-on')?.dataset.k,
  dots: document.querySelectorAll('.ra-sweep .ra-sweep-dot').length }));
let WI = await wi();
t('What if, under the charts: Monte Carlo first, then Risk : reward, Stop loss', JSON.stringify(WI.tabs) === '["Monte Carlo","Risk : reward","Stop loss"]' && WI.tab === 'mc', JSON.stringify(WI.tabs));
await p.click('.ra-wi-tabs button[data-tab="stop"]'); await settle(200);
WI = await wi();
t('Stop loss: 50% closer to twice as far, a point for each, the best picked', WI.steps.length === 12 && WI.steps.includes('As taken') && WI.dots === 12 && WI.on != null, JSON.stringify(WI));
await p.click('.ra-wi-steps button[data-k="0"]'); await settle(150);
WI = await wi();
t('…as taken: the same as the tiles above — +2.50R, nothing changed', WI.tiles.Total.v === '+2.50R' && WI.tiles['Trades that change'].v === '0' && WI.tiles['Win rate'].v === '50%', JSON.stringify(WI.tiles));
await p.click('.ra-wi-steps button[data-k="-0.5"]'); await settle(150);
WI = await wi();
t('…50% closer: worked out on the prices, beside the trades as taken', WI.on === '-0.5' && /as taken \+2\.50R/.test(WI.tiles.Total.s) && Number(WI.tiles['Trades that change'].v) > 0, JSON.stringify(WI.tiles));
await p.locator('.ra-whatif').screenshot({ path: `${OUT}/replayanalytics-wi-stop.png` }).catch(() => {});
await p.click('.ra-wi-tabs button[data-tab="rr"]'); await settle(200);
await p.locator('.ra-whatif').screenshot({ path: `${OUT}/replayanalytics-wi-rr.png` }).catch(() => {});
const RR = await p.evaluate(() => ({ rows: document.querySelectorAll('.ra-rr-row:not(.is-head)').length, cells: document.querySelectorAll('.ra-rr-cell').length, best: document.querySelectorAll('.ra-rr-cell.is-best').length,
  head: [...document.querySelectorAll('.ra-rr-row.is-head span')].map(x => x.textContent).slice(1).join() }));
t('Risk : reward: 5 stops × 7 targets (1R to 5R), the sweet spot marked', RR.rows === 5 && RR.cells === 35 && RR.best === 1 && RR.head === '1R,1.5R,2R,2.5R,3R,4R,5R', JSON.stringify(RR));
await p.click('.ra-rr-cell[data-k="0"][data-tr="1"]'); await settle(150);
t('…pick a square: its numbers beside the trades as taken', await p.evaluate(() => document.querySelector('.ra-rr-cell.is-on')?.dataset.tr === '1' && !!document.querySelector('.ra-wi-tiles .ra-wi-total')));
await p.click('.ra-wi-tabs button[data-tab="mc"]'); await settle(250);
const MC = () => p.evaluate(() => ({ fan: !!document.querySelector('.ra-fan .ra-fan-90') && !!document.querySelector('.ra-fan .ra-fan-median') && !!document.querySelector('.ra-fan .ra-fan-mine'),
  runs: document.querySelectorAll('.ra-fan .ra-fan-run').length, n: [...document.querySelectorAll('.ra-mc-n button')].map(x => x.dataset.n), on: document.querySelector('.ra-mc-n .is-on')?.dataset.n,
  tiles: [...document.querySelectorAll('.ra-wi-tiles .rp-k')].map(x => x.textContent), median: document.querySelector('.ra-mc-median .rp-tv')?.textContent }));
let mc = await MC();
t('Monte Carlo: the spread of a thousand runs, the median, a few runs, and yours', mc.fan && mc.runs === 12 && JSON.stringify(mc.tiles) === '["Median end","Worst 5%","Ended below zero","Max drawdown","Losing streak"]', JSON.stringify(mc));
t('…runs as long as the trades taken, or 50, 100, 250', JSON.stringify(mc.n) === '["4","50","100","250"]' && mc.on === '50', JSON.stringify(mc.n));
await p.click('.ra-mc-n button[data-n="250"]'); await settle(250);
const m250 = await MC();
t('…250 trades a run: further out', m250.on === '250' && m250.median !== mc.median, JSON.stringify([mc.median, m250.median]));
await p.locator('.ra-whatif').screenshot({ path: `${OUT}/replayanalytics-wi-mc.png` }).catch(() => {});
t('with less motion asked for, nothing plays: the charts are drawn finished', await p.evaluate(() => !document.querySelector('.ra-whatif .is-play, .ra-wi-in')));
/* with motion: Run again plays — the runs stream in, a line scans across, the figures count up to their values */
await p.emulateMedia({ reducedMotion: 'no-preference' });
await p.click('.ra-mc-again'); await settle(350);
const mid = await p.evaluate(() => ({ play: !!document.querySelector('.ra-fan.is-play'), scan: !!document.querySelector('.ra-fan-scan'), cloud: !!document.querySelector('.ra-fan-cloud'),
  dash: document.querySelector('.ra-fan-median').style.strokeDashoffset, median: document.querySelector('.ra-mc-median .rp-tv').textContent }));
await settle(2600);
const fin = await p.evaluate(() => ({ done: !!document.querySelector('.ra-fan.is-done'), scan: !!document.querySelector('.ra-fan-scan'), dash: document.querySelector('.ra-fan-median').style.strokeDashoffset,
  median: document.querySelector('.ra-mc-median .rp-tv').textContent }));
t('Run again, with motion: it plays — the cloud of runs, a scanning line, the median drawing itself', mid.play && mid.scan && mid.cloud && mid.dash !== '' && mid.dash !== '0', JSON.stringify(mid));
t('…and settles: the line gone, the median whole, the figures at their values', fin.done && !fin.scan && fin.dash === '' && /^[+−]?\d+\.\d\dR$/.test(fin.median), JSON.stringify(fin));
await p.click('.ra-wi-tabs button[data-tab="rr"]'); await settle(120);
t('a new tab plays too: the squares cascade in', await p.evaluate(() => !!document.querySelector('.ra-rr.is-play') && !!document.querySelector('.ra-wi-in')));
await p.click('.ra-rr-cell[data-k="0"][data-tr="2"]'); await settle(120);
t('…picking a square does not replay it — only the figures glide', await p.evaluate(() => !document.querySelector('.ra-rr.is-play') && !document.querySelector('.ra-wi-in')));
await p.click('.ra-wi-tabs button[data-tab="mc"]'); await settle(2600);
await p.emulateMedia({ reducedMotion: 'reduce' });

/* different balances */
await go('#/replay/group/g2', 600);
T = await tiles();
t('a group whose sessions started with different balances: in R and %, said so — no dollar total', await p.evaluate(() => /In R and %/.test(document.querySelector('.ra-note')?.textContent || ''))
  && T.Total.v === '0.00R' && T.Total.s === '0.00%' && !/\$/.test(T.Total.s), JSON.stringify(T.Total));
await shot('mixed');

/* ===================== one session ===================== */
console.log('one session');
await go('#/replay', 400);
await p.click('.rp-srow[data-session="sa"] .rp-sanalytics'); await settle(600);
T = await tiles();
t('a session’s Analytics: its name, pair and period; Continue; its own three trades', await p.evaluate(() => location.hash === '#/replay/analytics/sa' && document.querySelector('.head h1').textContent === 'Week A'
  && /XAUUSD · 8 Sep – 18 Sep 2026/.test(document.querySelector('.head .sub').textContent) && !!document.querySelector('.ra-continue') && !document.querySelector('.ra-scope'))
  && T.Trades.v === '3' && T.Total.v === '+1.00R', JSON.stringify(T.Total));
await p.click('.ra-continue'); await settle(300);
await p.waitForFunction(() => !!document.querySelector('.rs')?.__session, null, { timeout: 10000 }).catch(() => {});
t('Continue opens the session', await p.evaluate(() => !!document.querySelector('.rs') && location.hash === '#/replay/session/sa'));
await p.click('.rs-top .rs-exit'); await settle(400);
await go('#/replay/analytics/se', 500);
t('a session with no trades says so, with Open', await p.evaluate(() => /No trades yet/.test(document.querySelector('.ra-empty')?.textContent || '') && !document.querySelector('.ra-tiles')));
await go('#/replay/analytics/gone', 500);
t('a deleted one says so', await p.evaluate(() => /Not here any more/.test(document.querySelector('.rp-emptycard')?.textContent || '')));

t('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
