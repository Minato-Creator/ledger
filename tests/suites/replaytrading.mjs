/* Replay, part five: trading inside a session.

   By hand first — the size the risk buys (OANDA units), the dollars a
   point, the stop before the target in one candle, the first stop sizing
   a trade. Then in a session: Buy at market with no stop holding the
   replay until one is dragged off the line, the target, the fills as the
   replay moves, the history and the balance, the Long position drawing's
   Buy button, moving and removing orders, closing at market, going back
   before a trade (Delete / Keep), the Trading settings. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB } from '../fixtures/ghost-fixture.mjs';
import { KEY, oandaRoute } from '../fixtures/oanda-mock.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const NOW = new Date('2026-09-20T12:00:00+08:00');
const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Australia/Perth' });
await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, oandaRoute([], { mode: 'ok' }));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_|net::|401/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(NOW);
await p.addInitScript(({ ACCT, PB, KEY }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('quire:setting:oandaKey', KEY);
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: [] })], ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, PB, KEY });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 250) => p.waitForTimeout(ms);
const go = async (h, ms = 500) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };
const shot = async name => { try { await p.screenshot({ path: `${OUT}/replaytrading-${name}.png` }); } catch { /* fine */ } };
const Z = s => Date.parse(s) / 1000;

/* ===================== by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async () => {
  const R = await import('/js/replaytrades.js');
  const s = { balance: 50000, risk: 1, riskMode: '%', trades: [{ closed: true, pnl: 1000 }] };
  const rows = [[60, 4000, 4002, 3998, 4001], [120, 4001, 4011, 4000, 4010], [180, 4010, 4012, 3990, 3995]];
  const mk = (side, sl, tp) => { const x = R.openTrade({ balance: 100000, risk: 1, riskMode: '%', trades: [] }, 'XAU_USD', { side, T: 60, price: 4000, sl, tp }); return x; };
  const a = mk('buy', 3995, 4010), bb = mk('buy', 3991, 4100), cc = mk('sell', 4005, 3990), dd = mk('buy', null, 4010);
  const closed = R.runTrades('XAU_USD', [a, bb, cc, dd], rows, 60, 180);
  const both = mk('buy', 3999, 4001.5);
  R.runTrades('XAU_USD', [both], [[120, 4000, 4002, 3998, 4000]], 60, 120);
  const late = mk('buy', 3995, 4010);
  late.openT = 120;
  R.runTrades('XAU_USD', [late], rows, 60, 120);
  const st = R.openTrade({ balance: 100000, risk: 1, riskMode: '%', trades: [] }, 'XAU_USD', { side: 'buy', T: 0, price: 4000 });
  const before = { qty: st.qty, sl: st.sl };
  R.setStop({ balance: 100000, risk: 1, riskMode: '%', trades: [] }, 'XAU_USD', st, 3997);
  const sized = { qty: st.qty, risk: st.riskAmt, initSl: st.initSl };
  R.setStop({ balance: 100000, risk: 1, riskMode: '%', trades: [] }, 'XAU_USD', st, 3990);
  /* minutes passed whole fill the same as before; inside a minute, tick by tick */
  const mkT = (side, sl, tp) => ({ id: side + sl, side, openT: 0, entry: 4000, qty: 1, sl, tp, closed: false });
  const many = [[0, 4000, 4001, 3999, 4000], [60, 4000, 4012, 3988, 4011], [120, 4011, 4020, 4005, 4015], [180, 4015, 4016, 3970, 3975]];
  const setA = [mkT('buy', 3995, 4010), mkT('sell', 4010, 3990), mkT('buy', 3980, 4018), mkT('sell', 4025, 3972)], setB = structuredClone(setA);
  R.runTrades('XAU_USD', setA, many, 0, 180); R.runMoments('XAU_USD', setB, many, 0, 180);
  const same = JSON.stringify(setA.map(x => [x.reason, x.closeT, x.exit])) === JSON.stringify(setB.map(x => [x.reason, x.closeT, x.exit]));
  const tickShort = [mkT('sell', 4010, 3990)], tickLong = [mkT('buy', 3990, 4010)];
  for (const [a, b] of [[0, 15], [15, 30], [30, 45], [45, 60]]) { R.runMoments('XAU_USD', tickShort, many, a, b); R.runMoments('XAU_USD', tickLong, many, a, b); }
  const wholeShort = [mkT('sell', 4010, 3990)]; R.runMoments('XAU_USD', wholeShort, many, 0, 60);
  const ticks = { short: [tickShort[0].reason, tickShort[0].closeT], long: [tickLong[0].reason, tickLong[0].closeT], whole: wholeShort[0].reason, path: R.tickPath(many[1]).join(), red: R.tickPath(many[3]).join() };
  const moved = { qty: st.qty, sl: st.sl, risk: st.riskAmt, initSl: st.initSl };
  /* the balance changing in between does not change the amount; a stop moved to break-even keeps the size */
  R.setStop({ balance: 50000, risk: 1, riskMode: '%', trades: [] }, 'XAU_USD', st, 3995);
  const again = { qty: st.qty, risk: st.riskAmt };
  R.setStop({ balance: 100000, risk: 1, riskMode: '%', trades: [] }, 'XAU_USD', st, 4000);
  const be = { qty: st.qty, sl: st.sl };
  R.setStop({ balance: 100000, risk: 1, riskMode: '%', trades: [] }, 'XAU_USD', st, 4002);
  const past = { qty: st.qty, sl: st.sl };
  return { moved, again, be, past, same, ticks,
    sizes: [R.sizeFor('XAU_USD', 4000, 3995, 500), R.sizeFor('XAU_USD', 4000, 3995, 499), R.sizeFor('NAS100_USD', 24000, 23950, 500), R.sizeFor('AUD_USD', 0.66, 0.659, 1000), R.sizeFor('USD_JPY', 150, 149.5, 1000), R.sizeFor('XAU_USD', 4000, 3000, 1)],
    usd: [R.usdPerPoint('XAU_USD', 4000), R.usdPerPoint('USD_JPY', 150), R.usdPerPoint('EUR_GBP', 0.85, 1.3), R.usdPerPoint('EUR_GBP', 0.85)],
    balance: R.balanceOf(s), riskPct: R.riskAmountOf(s), riskUsd: R.riskAmountOf({ ...s, riskMode: '$', risk: 250 }),
    a, bb, cc, dd, closed: closed.map(x => x.reason), both, late, before, sized, after: { qty: st.qty, sl: st.sl, risk: st.riskAmt },
    valid: [R.validLevel({ side: 'buy' }, 'sl', 3990, 4000), R.validLevel({ side: 'buy' }, 'sl', 4010, 4000), R.validLevel({ side: 'sell' }, 'tp', 3990, 4000), R.validLevel({ side: 'sell' }, 'sl', 3990, 4000)],
  };
});
t('the risk buys whole ounces of gold (rounded down), NAS100 to 0.1, FX whole units', JSON.stringify(H.sizes) === '[100,99,10,1000000,300000,0]', JSON.stringify(H.sizes));
t('dollars a point: gold 1, USDJPY through the price, a cross through its quote’s dollar price', H.usd[0] === 1 && Math.abs(H.usd[1] - 1 / 150) < 1e-12 && H.usd[2] === 1.3 && H.usd[3] === 1, JSON.stringify(H.usd));
t('the balance counts closed trades; 1% of it is the risk, or a set $250', H.balance === 51000 && H.riskPct === 510 && H.riskUsd === 250);
t('a long reaching its target: closed there, +2R', H.a.closed && H.a.reason === 'tp' && H.a.exit === 4010 && H.a.closeT === 120 && Math.abs(H.a.r - 2) < 1e-9 && H.a.pnl === 2000, JSON.stringify(H.a));
t('a long whose stop is reached later: −1R', H.bb.closed && H.bb.reason === 'sl' && H.bb.closeT === 180 && Math.abs(H.bb.r + 1) < 1e-9, JSON.stringify(H.bb));
t('a short reaching its stop first', H.cc.closed && H.cc.reason === 'sl' && H.cc.closeT === 120, JSON.stringify(H.cc));
t('a trade with no stop is not touched', !H.dd.closed && H.dd.qty === null);
t('stop and target in the same candle: the stop', H.both.closed && H.both.reason === 'sl');
t('the candle a trade opens on is not counted again', !H.late.closed);
t('minutes passed whole: filled just as before', H.same);
t('15-second ticks: a rising minute goes open → low → high → close, a falling one open → high → low → close', H.ticks.path === '4000,3988,4012,4011' && H.ticks.red === '4015,4016,3970,3975', JSON.stringify(H.ticks));
t('…tick by tick, what the price reaches first fills: the low first — a short’s target, a long’s stop, 30s before the minute', JSON.stringify(H.ticks.short) === '["tp",30]' && JSON.stringify(H.ticks.long) === '["sl",30]' && H.ticks.whole === 'sl', JSON.stringify(H.ticks));
t('the first stop sizes the trade', H.before.qty === null && H.sized.qty === 333 && Math.abs(H.sized.risk - 999) < 1e-9 && H.sized.initSl === 3997, JSON.stringify([H.before, H.sized]));
t('…moving it sizes it again to the same risk, every time', H.moved.qty === 100 && H.moved.sl === 3990 && H.moved.risk === 1000 && H.moved.initSl === 3990 && H.again.qty === 200 && H.again.risk === 1000, JSON.stringify([H.moved, H.again]));
t('…a stop at the entry or past it keeps the size', H.be.qty === 200 && H.be.sl === 4000 && H.past.qty === 200 && H.past.sl === 4002, JSON.stringify([H.be, H.past]));
t('a stop on the losing side, a target on the winning side', JSON.stringify(H.valid) === '[true,false,true,false]');

/* ===================== a session ===================== */
await p.evaluate(async now => { const R = await import('/js/replaydata.js'), C = await import('/js/candles.js'); await R.downloadPair('XAU_USD', await C.getKey(), { now }); }, NOW.getTime() / 1000);
await go('#/replay', 500);
const SID = await p.evaluate(async () => {
  const S = await import('/js/replaysessions.js'), { store } = await import('/js/store.js');
  const s = await S.createSession(store, { name: 'Gold practice', inst: 'XAU_USD', from: Date.parse('2026-09-08T00:00:00+08:00') / 1000, to: Date.parse('2026-09-17T23:59:00+08:00') / 1000, balance: 50000, risk: 1, riskMode: '%' });
  return s.id;
});
await go('#/replay/session/' + SID, 300);
await p.waitForFunction(() => !!document.querySelector('.rs')?.__session, null, { timeout: 10000 });
await settle(400);
const S = () => p.evaluate(() => { const s = document.querySelector('.rs').__session; return { T: s.T, trades: s.trades(), now: s.trading.now(), playing: s.playing }; });
const file = async () => (await p.evaluate(() => JSON.parse(window.__files.get('data/replay.json')))).sessions[0];
/* go a little way in, so there is history to look at */
await p.evaluate(() => { const s = document.querySelector('.rs').__session; s.moveTo(Date.parse('2026-09-09T15:00:00+08:00') / 1000); });
await settle(300);
let box = await p.evaluate(() => { const r = document.querySelector('.rs-pane .tc-canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const nowY = async () => p.evaluate(() => { const s = document.querySelector('.rs').__session, c = s.core(); return c.geom().Y(s.trading.now()); });

console.log('buy at market');
await p.mouse.click(box.x + 400, box.y + 200, { button: 'right' }); await settle(120);
const items = await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mlabel')].map(x => x.textContent));
let st = await S();
t('right-click: Buy at market and Sell at market, at the candle’s price', items.includes(`Buy at market ${st.now.toFixed(2)}`) && items.includes(`Sell at market ${st.now.toFixed(2)}`), items.join(' | '));
await p.click('.tv-menu .rt-m-buy'); await settle(200);
st = await S();
const T1 = st.trades[0];
t('Buy at market: open at the close of the candle, no stop, no target, no size yet', st.trades.length === 1 && T1.side === 'buy' && T1.entry === st.now && T1.openT === st.T && T1.qty === null && T1.sl === null && T1.tp === null, JSON.stringify(T1));
t('…the replay waits: a message says to set the stop first', await p.evaluate(() => !document.querySelector('.rt-need').hidden && /Set a stop loss first/.test(document.querySelector('.rt-need').textContent)));
const Tw = st.T;
await p.click('.rs-bar .rs-fwd'); await settle(150);
await p.click('.rs-bar .rs-pp'); await settle(400);
st = await S();
t('…a step forward, or play, does nothing until it is', st.T === Tw && !st.playing);
t('the entry line: TP and SL to drag off it, the units, the P&L, ✕', await p.evaluate(() => {
  const c = document.querySelector('.rt-cl.is-e'); if (!c) return false;
  return !!c.querySelector('.rt-off.is-tp') && c.querySelector('.rt-off.is-tp').title === 'Drag to set target' && !!c.querySelector('.rt-off.is-sl') && c.querySelector('.rt-qty').textContent === '—' && /no size yet/.test(c.querySelector('.rt-pnl').textContent) && !!c.querySelector('.rt-x');
}));
t('…no BUY written anywhere on it', await p.evaluate(() => !/BUY|Buy/.test(document.querySelector('.rt-cl.is-e').textContent)));
t('Positions · 1 in the panel', await p.evaluate(() => /Positions · 1/.test(document.querySelector('.rs-ptabs').textContent) && document.querySelectorAll('.rt-table.is-open .rt-row[data-trade]').length === 1));
await shot('no-stop');
/* drag SL off the line, down */
const dragFrom = async (sel, dy) => { const r = await p.evaluate(s => { const e = document.querySelector(s).getBoundingClientRect(); return { x: e.left + e.width / 2, y: e.top + e.height / 2 }; }, sel);
  await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.move(r.x, r.y + dy, { steps: 6 }); await p.mouse.up(); await settle(200); };
await dragFrom('.rt-cl.is-e .rt-off.is-tp', 60);
st = await S();
t('a target dragged to the losing side is refused', st.trades[0].tp === null);
await dragFrom('.rt-cl.is-e .rt-off.is-sl', 60);
st = await S();
const T2 = st.trades[0];
const expectQty = Math.floor(500 / (T2.entry - T2.sl) + 1e-9);
t('SL dragged off the line: the stop is set below, and the trade sized — 1% of $50,000', T2.sl < T2.entry && T2.qty === expectQty && Math.abs(T2.riskAmt - expectQty * (T2.entry - T2.sl)) < 1e-6 && T2.riskAmt <= 500, JSON.stringify(T2));
t('…the message goes, and a red stop line with its units', await p.evaluate(() => document.querySelector('.rt-need').hidden && !!document.querySelector('.rt-cl.is-sl .rt-qty.is-sl')) && await p.evaluate(q => document.querySelector('.rt-cl.is-sl .rt-qty').textContent === String(q), T2.qty));
await dragFrom('.rt-cl.is-e .rt-off.is-tp', -90);
st = await S();
const T3 = st.trades[0];
t('TP dragged up: the target', T3.tp > T3.entry && await p.evaluate(() => !!document.querySelector('.rt-cl.is-tp') && !document.querySelector('.rt-cl.is-e .rt-off')));
t('prices tagged on the scale: entry, TP, SL', await p.evaluate(() => { const s = document.querySelector('.rs').__session; return s.core().geom().aw > 0; }));
await shot('position');
/* move the stop by dragging its line on the chart */
const slY = await p.evaluate(sl => document.querySelector('.rs').__session.core().geom().Y(sl), T3.sl);
await p.mouse.move(box.x + 200, box.y + slY); await p.mouse.down(); await p.mouse.move(box.x + 200, box.y + slY + 25, { steps: 5 }); await p.mouse.up(); await settle(200);
const T4 = (await S()).trades[0];
t('drag the stop line on the chart: it moves, and the trade is sized to the risk again', T4.sl < T3.sl && T4.qty < T3.qty && T4.qty === Math.floor(500 / (T4.entry - T4.sl) + 1e-9) && T4.riskAmt <= 500 && T4.riskAmt > 500 - (T4.entry - T4.sl) && T4.initSl === T4.sl, JSON.stringify([T3, T4]));
/* and again, closer: bigger, still the same risk */
const slY2 = await p.evaluate(sl => document.querySelector('.rs').__session.core().geom().Y(sl), T4.sl);
await p.mouse.move(box.x + 200, box.y + slY2); await p.mouse.down(); await p.mouse.move(box.x + 200, box.y + slY2 - 15, { steps: 5 }); await p.mouse.up(); await settle(200);
const T5 = (await S()).trades[0];
t('…every time: moved closer, more units, the same risk', T5.sl > T4.sl && T5.qty > T4.qty && T5.qty === Math.floor(500 / (T5.entry - T5.sl) + 1e-9) && T5.riskTarget === 500, JSON.stringify(T5));
const pnlBox = await p.evaluate(() => {
  const probe = v => { const i = document.createElement('i'); i.style.color = `var(${v})`; document.querySelector('.rs').append(i); const c = getComputedStyle(i).color; i.remove(); return c; };
  const bg = k => { const e = document.querySelector(`.rt-cl.is-${k} .rt-pnl`); return e && [getComputedStyle(e).backgroundColor, e.className]; };
  return { tp: bg('tp'), sl: bg('sl'), profit: probe('--profit'), loss: probe('--loss') };
});
t('P&L in a box: green when up (the target), red when down (the stop)', pnlBox.tp?.[0] === pnlBox.profit && pnlBox.sl?.[0] === pnlBox.loss, JSON.stringify(pnlBox));
/* let the replay run until it closes */
const expect = await p.evaluate(async T => {
  const R = await import('/js/replaytrades.js'), s = document.querySelector('.rs').__session;
  const copy = structuredClone(s.trades()[0]);
  R.runTrades('XAU_USD', [copy], s.feed.rows, T, s.last);
  return copy;
}, (await S()).T);
await p.evaluate(() => { const s = document.querySelector('.rs').__session; s.moveTo(s.last - 3600); }); await settle(300);
st = await S();
const done = st.trades[0];
t('the replay moving on fills it on the one-minute prices — where the candles say', done.closed && done.reason === expect.reason && done.closeT === expect.closeT && done.exit === expect.exit && Math.abs(done.pnl - expect.pnl) < 0.01, JSON.stringify([done, expect]));
t('…its R: what it made over what it risked', Math.abs(done.r - done.pnl / done.riskAmt) < 1e-9 && (done.reason === 'sl' ? done.r < 0 : done.r > 0));
await p.click('.rs-ptab[data-tab="history"]'); await settle(200);
/* its execution arrows: the buy under its candle pointing up, the sell over its candle pointing down */
await p.evaluate(T => { const c = document.querySelector('.rs').__session.core(); const i = c.idxAt(T); c.setView(i - 30, 90); c.draw(); }, done.openT); await settle(150);
const mk = await p.evaluate(() => { const s = document.querySelector('.rs').__session; return { marks: s.marks(), C: s.core().palette() }; });
const mIn = mk.marks.find(m => m.trade === done.id && m.buy), mOut = mk.marks.find(m => m.trade === done.id && !m.buy);
t('execution arrows, TradingView’s way: the buy under its candle (green), the sell over its candle (red)', mIn && mOut && mIn.y > mIn.low && mOut.y < mOut.high
  && mIn.colour.toLowerCase() === mk.C.profit.toLowerCase() && mOut.colour.toLowerCase() === mk.C.loss.toLowerCase(), JSON.stringify(mk.marks));
await p.click('.rs-top .rs-gear'); await settle(150); await p.click('.tv-dtab[data-tab="trading"]'); await settle(60);
await p.click('.tv-tr-arrows'); await p.click('.tv-ok'); await settle(200);
t('…switched off in Chart Settings → Trading', (await p.evaluate(() => document.querySelector('.rs').__session.marks())).length === 0);
await p.click('.rs-top .rs-gear'); await settle(150); await p.click('.tv-dtab[data-tab="trading"]'); await settle(60);
await p.click('.tv-tr-arrows'); await p.click('.tv-ok'); await settle(200);
t('History · 1: the trade, how it ended', await p.evaluate(() => /History · 1/.test(document.querySelector('.rs-ptabs').textContent) && document.querySelectorAll('.rt-table.is-closed .rt-row[data-trade]').length === 1));
const bal = await p.evaluate(() => document.querySelector('.rs-bal b').textContent);
const want = `$${(50000 + done.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
t('Balance: $50,000 and the trade', bal === want, `${bal} vs ${want}`);
t('saved with the session', (await file()).trades.length === 1 && (await file()).trades[0].closed);
await shot('history');

/* the Long position drawing's Buy button */
console.log('from the position tool');
await p.evaluate(() => { const s = document.querySelector('.rs').__session; s.jumpTo(Date.parse('2026-09-15T10:00:00+08:00') / 1000); }); await settle(300);
box = await p.evaluate(() => { const r = document.querySelector('.rs-pane .tc-canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
/* a Long position just under the price, a little to the left */
const ny = await nowY();
await p.click('.rs-left .tv-left [data-tool="long"]');
const gx = await p.evaluate(() => { const s = document.querySelector('.rs').__session, g = s.core().geom(); return g.xI(s.charts[0].k) - 420; });
await p.mouse.click(box.x + gx, box.y + ny + 4); await settle(250);
const D = await p.evaluate(() => { const s = document.querySelector('.rs').__session; const d = s.dr().list().at(-1); return d && { id: d.id, type: d.type, entry: d.pts[0].p, tp: d.tp, sl: d.sl }; });
t('a Long position drawn: selected, a green Buy button to its right, at its entry', D?.type === 'long' && await p.evaluate(id => {
  const g = document.querySelector('.rt-go'), s = document.querySelector('.rs').__session;
  const sh = s.dr().shapes().find(x => x.id === id), end = sh.handles.find(h => h.key === 'end');
  return g && !g.hidden && g.textContent === 'Buy' && g.classList.contains('is-buy') && g.offsetLeft > end.x && Math.abs(g.offsetTop + 12 - end.y) < 2 && getComputedStyle(g).backgroundColor !== 'rgba(0, 0, 0, 0)';
}, D.id), await p.evaluate(id => { const g = document.querySelector('.rt-go'), s = document.querySelector('.rs').__session; const sh = s.dr().shapes().find(x => x.id === id); return JSON.stringify([g.hidden, g.offsetLeft, g.offsetTop, g.style.left, sh?.handles]); }, D.id));
/* dragged whole to the right, past now: it stays on the chart */
const dragTool = await p.evaluate(id => { const s = document.querySelector('.rs').__session, sh = s.dr().shapes().find(x => x.id === id); const h = sh.handles; const e = h.find(x => x.key === 'entry'), en = h.find(x => x.key === 'end'); return { x: (e.x + en.x) / 2, y: e.y + 8 }; }, D.id);
await p.mouse.move(box.x + dragTool.x, box.y + dragTool.y); await p.mouse.down();
await p.mouse.move(box.x + dragTool.x + 500, box.y + dragTool.y, { steps: 8 }); await settle(80);
const midDrag = await p.evaluate(id => document.querySelector('.rs').__session.dr().shapes().some(x => x.id === id), D.id);
await p.mouse.up(); await settle(200);
const afterDrag = await p.evaluate(id => { const s = document.querySelector('.rs').__session; const d = s.dr().list().find(x => x.id === id); return { shown: s.dr().shapes().some(x => x.id === id), t0: d.pts[0].t, T: s.T }; }, D.id);
t('a position dragged past now stays on the chart — while dragging and after', midDrag && afterDrag.shown && afterDrag.t0 > afterDrag.T, JSON.stringify(afterDrag));
t('…its Buy button with it', await p.evaluate(() => !document.querySelector('.rt-go').hidden));
await p.evaluate(() => document.querySelector('.rs').__session.dr().select(null)); await settle(150);
t('…and still there once it is let go of', await p.evaluate(id => document.querySelector('.rs').__session.dr().shapes().some(x => x.id === id), D.id));
await p.evaluate(id => document.querySelector('.rs').__session.dr().select(id), D.id); await settle(150);
/* put it back where it was for the rest */
await p.mouse.move(box.x + dragTool.x + 500, box.y + dragTool.y); await p.mouse.down(); await p.mouse.move(box.x + dragTool.x, box.y + dragTool.y, { steps: 8 }); await p.mouse.up(); await settle(200);
await shot('tool');
const nPrice = (await S()).now;
await p.click('.rt-go'); await settle(250);
st = await S();
const TT = st.trades.at(-1);
t('Buy: at market — the candle’s price, not the drawing’s entry — with its stop and target', TT.from === 'tool' && TT.entry === nPrice && TT.entry !== D.entry && TT.sl === D.sl && TT.tp === D.tp, JSON.stringify([TT, D]));
t('…sized so the risk is the setting (1% of the balance now)', TT.qty === Math.floor((50000 + done.pnl) * 0.01 / (TT.entry - TT.sl) + 1e-9) && TT.riskAmt <= (50000 + done.pnl) * 0.01, JSON.stringify(TT));
t('…the drawing stays where it was drawn', await p.evaluate(D => { const d = document.querySelector('.rs').__session.dr().list().find(x => x.id === D.id); return d.pts[0].p === D.entry && d.sl === D.sl && d.tp === D.tp; }, D));
/* ✕ on the target, then close at market */
await p.click('.rt-cl.is-tp .rt-x'); await settle(200);
t('✕ on the target line removes the target', (await S()).trades.at(-1).tp === null && await p.evaluate(() => !document.querySelector('.rt-cl.is-tp') && !!document.querySelector('.rt-cl.is-e .rt-off.is-tp')));
const closeAt = (await S()).now;
await p.click('.rt-cl.is-e .rt-x'); await settle(200);
const TC = (await S()).trades.at(-1);
t('✕ on the entry closes it at market', TC.closed && TC.reason === 'manual' && TC.exit === closeAt, JSON.stringify(TC));
/* a market order closed before it has a size simply goes */
await p.mouse.click(box.x + 300, box.y + 200, { button: 'right' }); await p.click('.tv-menu .rt-m-sell'); await settle(200);
const nBefore = (await S()).trades.length;
await p.click('.rt-cl.is-e .rt-x'); await settle(200);
t('a sell with no stop yet, ✕: cancelled, gone', (await S()).trades.length === nBefore - 1 && await p.evaluate(() => document.querySelector('.rt-need').hidden));

/* going back before a trade */
console.log('going back');
await p.mouse.click(box.x + 300, box.y + 200, { button: 'right' }); await p.click('.tv-menu .rt-m-sell'); await settle(200);
await dragFrom('.rt-cl.is-e .rt-off.is-sl', -70);
st = await S();
const SELL = st.trades.at(-1);
t('a sell with its stop above', SELL.side === 'sell' && SELL.sl > SELL.entry && SELL.qty > 0, JSON.stringify(SELL));
await p.click('.rs-bar .rs-back'); await settle(200);
await p.evaluate(() => document.querySelector('.rs-bar .rs-back').click()); await settle(200);
const asks = await p.evaluate(() => { const b = document.querySelectorAll('.rt-back'); const r = b[0]?.getBoundingClientRect(); return { n: b.length, cx: r ? r.left + r.width / 2 : 0, cy: r ? r.top + r.height / 2 : 0, W: innerWidth, H: innerHeight }; });
t('…pressed again: still one question, in the middle of the page', asks.n === 1 && Math.abs(asks.cx - asks.W / 2) < 4 && Math.abs(asks.cy - asks.H / 2) < 4, JSON.stringify(asks));
t('one candle back, before it: asked — delete the trade, or keep it', await p.evaluate(() => /Go back before (a trade|2 trades)\?/.test(document.querySelector('.rt-back h2')?.textContent || '') && !!document.querySelector('.rt-back .rt-back-keep') && !!document.querySelector('.rt-back .rt-back-delete')));
await p.click('.rt-back .rt-back-cancel'); await settle(150);
t('…Cancel: nothing moves', (await S()).T === st.T && (await S()).trades.length === st.trades.length);
await p.click('.rs-bar .rs-back'); await p.click('.rt-back .rt-back-keep'); await settle(200);
t('…Keep: back a candle, the trade kept', (await S()).T < st.T && (await S()).trades.some(x => x.id === SELL.id));
await p.click('.rs-bar .rs-back'); await settle(150);
t('further back, before it still: asked again', await p.evaluate(() => !!document.querySelector('.rt-back')));
await p.click('.rt-back .rt-back-delete'); await settle(200);
t('…Delete the trade: gone', !(await S()).trades.some(x => x.id === SELL.id));

/* the Trading settings */
await p.click('.rs-top .rs-gear'); await settle(150);
t('Chart Settings in a session has a Trading tab', await p.evaluate(() => [...document.querySelectorAll('.tv-dtab')].map(x => x.textContent).includes('Trading')));
await p.click('.tv-dtab[data-tab="trading"]'); await settle(60);
await p.click('.tv-tr-pnl'); await settle(120);
await p.click('.tv-ok'); await settle(200);
await p.mouse.click(box.x + 300, box.y + 200, { button: 'right' }); await p.click('.tv-menu .rt-m-buy'); await settle(200);
t('…P&L off the lines', await p.evaluate(() => !document.querySelector('.rt-cl.is-e .rt-pnl')));
await p.click('.rs-top .rs-gear'); await settle(150); await p.click('.tv-dtab[data-tab="trading"]');
await p.click('.tv-tr-lines'); await p.click('.tv-ok'); await settle(200);
t('…and the lines off altogether', await p.evaluate(() => !document.querySelector('.rt-cl')));
await p.evaluate(() => { const s = document.querySelector('.rs').__session; const d = s.dr().list().find(x => x.type === 'long'); s.dr().select(null); s.dr().select(d.id); }); await settle(150);
t('…a position tool still has its Buy button', await p.evaluate(() => { const g = document.querySelector('.rt-go'); return !!g && !g.hidden; }));
await p.evaluate(() => document.querySelector('.rs').__session.dr().select(null)); await settle(100);
await p.click('.rs-top .rs-gear'); await settle(150); await p.click('.tv-dtab[data-tab="trading"]');
await p.click('.tv-tr-lines'); await p.click('.tv-tr-pnl'); await p.click('.tv-ok'); await settle(200);
await p.click('.rt-cl.is-e .rt-x'); await settle(150);

/* the drawing keys work in a session too */
const nD = await p.evaluate(() => document.querySelector('.rs').__session.dr().list().length);
await p.evaluate(() => { const s = document.querySelector('.rs').__session; s.dr().select(s.dr().list()[0].id); }); await settle(80);
await p.keyboard.press('Control+c'); await p.keyboard.press('Control+v'); await settle(200);
const nD2 = await p.evaluate(() => document.querySelector('.rs').__session.dr().list().length);
await p.keyboard.press('Control+z'); await settle(200);
const nD3 = await p.evaluate(() => document.querySelector('.rs').__session.dr().list().length);
t('in a session: Ctrl+C, Ctrl+V copies a drawing; Ctrl+Z takes it back', nD2 === nD + 1 && nD3 === nD, `${nD} ${nD2} ${nD3}`);
await p.keyboard.press('Escape');
/* the home page counts them */
await p.click('.rs-top .rs-exit'); await settle(400);
const row = await p.evaluate(id => [...document.querySelectorAll(`.rp-srow[data-session="${id}"] > span`)].map(x => x.textContent), SID);
const closedN = (await file()).trades.filter(x => x.closed).length;
t('back home: the session’s trades, win rate and total', row[2] === String(closedN) && /%$/.test(row[3]) && /R$/.test(row[4]), JSON.stringify(row));
t('…and the tiles', await p.evaluate(n => document.querySelector('.rp-t-trades .rp-tv').textContent === String(n), closedN));

t('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
