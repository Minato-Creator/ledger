/* How a trade closed, and what follows from it.

   • Editing an old trade opens on the result it was saved with — a forward
     test that lost used to open as a profit.
   • Typing prices decides the result: exit at the target is a win that hit
     take profit, at the stop a loss that hit the stop, at the entry a
     break-even; anywhere else, by which way price went.
   • "Trailed" is gone as an exit.
   • News timing and bank holidays are asked on New trade, and read back on
     the trade page, the review, the Trades filter, the CSV, Analytics →
     Execution and the Ghost.
   • The weekly review asks a trade what its close makes sense to ask: a
     better exit only of take profit, heat only of a right idea, if-held
     only of a trade closed by hand — and fills in what the trade already
     says. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB, makeTrades } from '../fixtures/ghost-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
const PNG = fs.readFileSync(HERE + '../fixtures/chart-htf.png').toString('base64');

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9;

/* ---------- the trades ---------- */
const TR = makeTrades();
const W38 = TR.filter(x => x.date >= '2026-09-14' && x.date <= '2026-09-20').sort((a, b) => (a.date + a.timeOpen).localeCompare(b.date + b.timeOpen));
const winI = W38.findIndex(x => x.netResult > 0), lossI = W38.findIndex(x => x.netResult < 0);
const lossI2 = W38.findIndex((x, i) => i > lossI && x.netResult < 0);
Object.assign(W38[winI], { exitReason: 'tp', mistakes: [] });
Object.assign(W38[lossI], { exitReason: 'sl', mistakes: ['early_entry'], news: 'during', holidays: ['UK'] });
Object.assign(W38[lossI2], { exitReason: 'manual', mistakes: ['closed_early'] });
W38[winI].shots = ['screenshots/' + W38[winI].id + '-1.jpg'];
const base = { accountId: 'acc_1', assetClass: 'Forex', pair: 'XAUUSD', side: 'buy', date: '2026-09-10', timeOpen: '10:00', timeClose: '11:00', status: 'closed', tagIds: [], notes: '',
  entryPrice: 2650, stopLoss: 2645, takeProfit: 2665, sessionId: null, setupId: null };
TR.push({ ...base, id: 'FL', mode: 'forward', netResult: null, rMultiple: -1, riskPercent: null },
  { ...base, id: 'FB', mode: 'forward', netResult: null, rMultiple: 0, outcome: 'breakeven', riskPercent: null },
  { ...base, id: 'TRAIL', netResult: 1500, riskPercent: 1, exitReason: 'trailed' });
const NEWS = { version: 1, fetchedAt: '2026-09-18T00:00:00Z', events: [
  { id: 'a', title: 'Non-Farm Employment Change', country: 'USD', at: '2026-09-18T12:30:00Z', impact: 'High', forecast: '', previous: '' },
  { id: 'c', title: 'Bank Holiday', country: 'GBP', at: '2026-09-18T03:00:00Z', impact: 'Holiday', forecast: '', previous: '' }] };

const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(new Date('2026-09-18T18:00:00'));
await p.addInitScript(({ ACCT, TR, PB, NEWS }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: 'R', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)], ['data/news.json', JSON.stringify(NEWS)]]));
}, { ACCT, TR, PB, NEWS });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 300) => p.waitForTimeout(ms);
const go = async (h, ms = 500) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };
const onDisk = () => p.evaluate(() => JSON.parse(window.__files.get('data/trades.json')).trades);
const signOn = () => p.evaluate(() => [...document.querySelectorAll('.trade-form button')].filter(b => ['Profit', 'Loss', 'Break-even'].includes(b.textContent)
  && b.style.background && !b.style.background.includes('grey-7')).map(b => b.textContent));
const xrOn = () => p.evaluate(() => [...document.querySelectorAll('[aria-label="Exit reason"] .xr.is-on')].map(b => b.textContent));
const clickIn = (scope, l) => p.evaluate(([s, l]) => [...document.querySelectorAll(s + ' .xr')].find(b => b.textContent === l).click(), [scope, l]);

/* ===================== by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async () => {
  const { fromPricesOf } = await import('/js/views/addtrade.js');
  const Q = await import('/js/questions.js');
  const E = await import('/js/views/an-execution.js');
  const G = await import('/js/ghost.js');
  const R = await import('/js/views/review.js');
  const P = (side, x, extra = {}) => fromPricesOf({ side, entryPrice: '100', stopLoss: '95', takeProfit: '110', exitPrice: x, ...extra });
  const prices = [P('buy', '110'), P('buy', '95'), P('buy', '100'), P('buy', '104'), P('buy', '97'), P('sell', '96', { stopLoss: '105', takeProfit: '90' }),
    P('sell', '90', { stopLoss: '105', takeProfit: '90' }), P('buy', ''), P('buy', '100', { stopLoss: '100' })];
  const A = { startingBalance: 100000 };
  const T = (net, f) => ({ date: '2026-09-15', timeOpen: '10:00', netResult: net, riskPercent: 1, status: 'closed', ...f });
  const tr = [T(2000, { news: 'before', holidays: [] }), T(-1000, { news: 'during', holidays: ['US'] }), T(-1000, { news: 'during', holidays: [] }),
    T(1000, { news: 'none', holidays: ['US', 'UK'] }), T(500, {})];
  const S = E.execStats(A, tr);
  const { rows } = G.rowsFrom(A, tr);
  const keep = Rr => G.apply(rows, { ...G.blankRules(), ...Rr }).map(Number).join('');
  const cells = Q.questionCells({ status: 'closed', news: 'between', holidays: ['UK', 'US'] });
  const back = Q.readQuestions({ news: 'In between', holidays: 'United Kingdom;USD;nowhere' });
  /* the review, read from how the trade closed */
  const rv = (net, f, review) => R.reviewOf(A, T(net, { ...f, review }));
  const tp = rv(2500, { exitReason: 'tp' }, {});
  const tpLow = rv(2500, { exitReason: 'tp' }, { avail: 1 });
  const slU = rv(-1000, { exitReason: 'sl' }, {});
  const slR = rv(-1000, { exitReason: 'sl' }, { dir: 'right', avail: 3, better: 2 });
  const slW = rv(-1000, { exitReason: 'sl' }, { dir: 'wrong', heat: 1.4, avail: 3 });
  const man = rv(500, { exitReason: 'manual', mistakes: ['early_entry'] }, { heat: 0.5, better: 2 });
  const manW = rv(500, { exitReason: 'manual' }, { dir: 'wrong', heat: 0.5 });
  const byPrice = R.closedBy({ side: 'buy', entryPrice: 100, stopLoss: 95, takeProfit: 110, exitPrice: 95 });
  const sug = [R.suggestWhat(A, T(2000, { exitReason: 'tp' })), R.suggestWhat(A, T(-1000, { exitReason: 'sl' })),
    R.suggestWhat(A, T(-1000, { exitReason: 'sl', review: { dir: 'right' } })), R.suggestWhat(A, T(-1000, { exitReason: 'sl', review: { dir: 'wrong' } })),
    R.suggestWhat(A, T(0, { exitReason: 'be' })), R.suggestWhat(A, T(300, { exitReason: 'manual', mistakes: ['closed_early'] })), R.suggestWhat(A, T(300, { exitReason: 'manual' }))];
  return { prices, exits: Q.EXIT_REASONS.map(([k]) => k).join(','),
    news: S.news.map(g => [g.key, g.n, g.sum]), days: Object.fromEntries(Object.entries(S.newsDays).map(([k, g]) => [k, [g.n, g.sum]])),
    answered: [S.answered.news],
    ghost: { during: keep({ skipNews: ['during'] }), hol: keep({ skipHolidays: true }), both: keep({ skipNews: ['during', 'none'], skipHolidays: true }) },
    cells: cells.slice(-2), back,
    tp: { dir: tp.dir, avail: tp.avail, auto: [...tp.auto].sort().join(',') }, tpLow: tpLow.avail,
    slU: { heat: slU.heat, avail: slU.avail }, slR: { heat: slR.heat, avail: slR.avail, better: slR.better, auto: [...slR.auto].join(',') },
    slW: { heat: slW.heat, avail: slW.avail }, man: { entry: man.entry, heat: man.heat, better: man.better, kind: man.kind }, manW: manW.heat,
    byPrice, sug };
});
const pr = H.prices.map(x => x ? `${x.sign}/${x.reason}` : 'null');
t('exit at the target: a win, take profit', pr[0] === 'win/tp', pr[0]);
t('exit at the stop: a loss, stop loss', pr[1] === 'loss/sl', pr[1]);
t('exit at the entry: break-even', pr[2] === 'breakeven/be', pr[2]);
t('in between, by which way price went for the direction', pr[3] === 'win/null' && pr[4] === 'loss/null' && pr[5] === 'win/null', pr.slice(3, 6).join(' '));
t('a short at its target is a win', pr[6] === 'win/tp', pr[6]);
t('no exit price, nothing to read', pr[7] === 'null');
t('a stop moved to entry and hit is break-even', pr[8] === 'breakeven/be', pr[8]);
t('trailed is no longer an exit', H.exits === 'tp,sl,be,manual', H.exits);
t('news: R per timing', JSON.stringify(H.news) === JSON.stringify([['none', 1, 1], ['before', 1, 2], ['during', 2, -2], ['after', 0, 0], ['between', 0, 0]]), JSON.stringify(H.news));
t('news days, off the trade where the calendar was never read: red folder, bank holiday, neither', JSON.stringify(H.days) === JSON.stringify({ red: [3, 0], holiday: [2, 0], quiet: [1, 0.5] }), JSON.stringify(H.days));
t('only trades asked count as answered', JSON.stringify(H.answered) === '[4]', JSON.stringify(H.answered));
t('ghost: skip during news', H.ghost.during === '10011', H.ghost.during);
t('ghost: skip bank holidays', H.ghost.hol === '10101', H.ghost.hol);
t('ghost: both', H.ghost.both === '10001', H.ghost.both);
t('CSV: news and holidays in words', JSON.stringify(H.cells) === JSON.stringify(['In between', 'United Kingdom;United States']), JSON.stringify(H.cells));
t('and read back, by name or currency', H.back.news === 'between' && JSON.stringify(H.back.holidays) === '["US","UK"]', JSON.stringify(H.back));
t('review · take profit: right direction, and ran at least what was taken', H.tp.dir === 'right' && H.tp.avail === 2.5 && H.tp.auto === 'avail,dir', JSON.stringify(H.tp));
t('review · a take profit cannot have run less than it took', H.tpLow === 2.5, String(H.tpLow));
t('review · stop loss: nothing until the direction is said', H.slU.heat == null && H.slU.avail == null, JSON.stringify(H.slU));
t('review · stopped on a right idea: heat from 1R, how far it ran after, no better exit', H.slR.heat === 1 && H.slR.avail === 3 && H.slR.better == null && H.slR.auto === 'heat', JSON.stringify(H.slR));
t('review · stopped on a wrong idea: no heat, nothing ran', H.slW.heat == null && H.slW.avail == null, JSON.stringify(H.slW));
t('review · closed by hand: no better exit; early entry from the mistakes', H.man.better == null && H.man.heat === 0.5 && H.man.entry === 'early' && H.man.kind === 'manual', JSON.stringify(H.man));
t('review · any trade read the wrong way has no heat', H.manW == null);
t('review · with no exit reason, the prices say how it closed', H.byPrice === 'sl', H.byPrice);
t('review · the answer it points to', JSON.stringify(H.sug) === JSON.stringify(['target', null, 'stopped', 'wrong', 'be', 'early', null]), JSON.stringify(H.sug));

/* ===================== editing opens as saved ===================== */
console.log('edit');
const signOf = async id => { await go('#/edit/' + id, 450); return (await signOn()).join(); };
t('a forward test that lost opens on Loss', await signOf('FL') === 'Loss', await signOf('FL'));
t('a forward break-even opens on Break-even', await signOf('FB') === 'Break-even');
const aLoss = TR.find(x => x.netResult < 0 && x.id !== 'FL');
t('a live loss still opens on Loss', await signOf(aLoss.id) === 'Loss');
t('a trade saved as trailed has the exit cleared', (await onDisk()).find(x => x.id === 'TRAIL').exitReason === null);

/* ===================== prices decide ===================== */
console.log('prices');
await go('#/new', 500);
const price = async (ph, v) => { const sel = `.trade-form .band.sec:nth-of-type(1) input`; void sel; };
void price;
const fields = await p.$$('.trade-form input[inputmode="decimal"]');
/* entry, stop, target, exit are the first four decimal fields */
await fields[0].fill('2650'); await fields[1].fill('2645'); await fields[2].fill('2665'); await fields[3].fill('2665'); await settle(150);
t('exit typed at the target: Profit and Take profit', (await signOn()).join() === 'Profit' && (await xrOn()).join() === 'Take profit', `${await signOn()} ${await xrOn()}`);
await fields[3].fill('2645'); await settle(150);
t('moved to the stop: Loss and Stop loss', (await signOn()).join() === 'Loss' && (await xrOn()).join() === 'Stop loss', `${await signOn()} ${await xrOn()}`);
await fields[3].fill('2650'); await settle(150);
t('at the entry: Break-even', (await signOn()).join() === 'Break-even' && (await xrOn()).join() === 'Break-even');
await fields[3].fill('2657'); await settle(150);
t('in between, in profit: Profit, and no exit reason guessed', (await signOn()).join() === 'Profit' && (await xrOn()).length === 0, `${await signOn()} ${await xrOn()}`);
await clickIn('[aria-label="Exit reason"]', 'Closed manually'); await settle(100);
await fields[3].fill('2665'); await settle(150);
t('an exit reason you picked yourself is left alone', (await xrOn()).join() === 'Closed manually' && (await signOn()).join() === 'Profit');
await fields[3].fill('2657'); await settle(150);
await p.evaluate(() => [...document.querySelectorAll('.trade-form .dir')].find(b => /Short/.test(b.textContent)).click()); await settle(150);
t('flipping to short turns an exit above the entry into a loss', (await signOn()).join() === 'Loss');

/* ===================== news on New trade ===================== */
console.log('news');
await go('#/new', 500);
t('five news timings', (await p.evaluate(() => [...document.querySelectorAll('.xr.is-news')].map(b => b.textContent).join('|'))) === 'No news|Before news|During news|After news|In between');
t('no bank holiday chips to tick — the calendar says', !(await p.$('.xr.is-hol')));
await p.fill('.trade-form input[type=date]', '2026-09-10'); await settle(150);
t('a day the calendar was never read for: you say', await p.evaluate(() => document.querySelector('.news-pick')?.dataset.from) === 'hand'
  && !!(await p.$('.news-pick select.news-sel')));
await clickIn('[aria-label="News"]', 'Before news'); await clickIn('[aria-label="News"]', 'During news'); await settle(80);
t('one timing at a time, explained', (await p.evaluate(() => [...document.querySelectorAll('.xr.is-news.is-on')].map(b => b.textContent))).join() === 'During news'
  && /hit while you were in/.test(await p.evaluate(() => document.querySelector('.news-hint').textContent)));
await p.selectOption('.news-pick select.news-sel', 'UK'); await settle(80);
await p.fill('.main input[placeholder="XAUUSD"]', 'NEWS1');
await p.fill('.main input[placeholder="0.00"]', '700'); await settle(150);
await p.evaluate(() => [...document.querySelectorAll('.head button')].find(b => /^Save/.test(b.textContent.trim())).click()); await settle(700);
let mine = (await onDisk()).find(x => x.pair === 'NEWS1');
t('saved with its news and holiday', mine?.news === 'during' && JSON.stringify(mine?.holidays) === '["UK"]' && mine?.newsEvent === null, JSON.stringify(mine && [mine.news, mine.holidays, mine.newsEvent]));
await go('#/edit/' + mine.id, 500);
t('and back on edit', (await p.evaluate(() => [...document.querySelectorAll('.xr.is-news.is-on')].map(b => b.textContent))).join() === 'During news'
  && await p.$eval('.news-pick select.news-sel', s => s.value) === 'UK');
await go('#/trade/' + mine.id, 500);
const cells = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.td-cell')].map(c => [c.querySelector('.k').textContent, c.querySelector('b').textContent])));
t('the trade page shows all three', cells['News timing'] === 'During news' && cells.News === 'N/A' && cells['Bank holiday'] === 'United Kingdom', JSON.stringify(cells));
await go('#/trades', 500);
const sel = async v => { await p.evaluate(v => { const s = [...document.querySelectorAll('.tr-bar select')].find(x => x.options[0].text === 'News · all'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, v); await settle(250); };
const rowsN = () => p.evaluate(() => document.querySelectorAll('.tbl-body > *').length);
const disk = await onDisk();
await sel('during');
t('Trades filters by news timing', await rowsN() === disk.filter(x => x.status !== 'open' && x.news === 'during').length && await rowsN() === 2, String(await rowsN()));
await sel('holiday');
/* a bank holiday day: the calendar's for the week it was read (the UK on the 18th), what was ticked for any other */
const holDays = disk.filter(x => x.status !== 'open' && (x.date >= '2026-09-14' && x.date <= '2026-09-20' ? x.date === '2026-09-18' : (x.holidays || []).length > 0)).length;
t('and by bank holiday — the calendar’s where it was read', await rowsN() === holDays && holDays > 0, `${await rowsN()} vs ${holDays}`);
await sel('any');
t('and by any news', await rowsN() === 2);
await sel('all');
await p.evaluate(async id => { const { store } = await import('/js/store.js'); await store.deleteTrade(id); }, mine.id);

/* ===================== the weekly review ===================== */
console.log('review');
await go('#/review', 700);
const pick = async i => { await p.evaluate(i => document.querySelectorAll('.rv-item')[i].click(), i); await settle(300); };
const labels = () => p.evaluate(() => [...document.querySelectorAll('.rv-card .rv-num')].map(i => i.getAttribute('aria-label')));
const val = l => p.$eval(`.rv-num[aria-label="${l}"]`, i => i.value).catch(() => null);
const segOn = () => p.evaluate(() => [...document.querySelectorAll('.rv-form .rv-seg')].map(s => s.querySelector('.is-on')?.textContent || ''));
await pick(winI);
t('take profit: available, heat and better exit', (await labels()).join() === 'Could have made,Drawdown,Better exit', (await labels()).join());
const rWin = W38[winI].netResult / 1000;
t('available starts at what you took', await val('Could have made') === rWin.toFixed(1).replace(/\.0$/, ''), await val('Could have made'));
t('a winner is not asked right or wrong — it was right', !(await p.evaluate(() => [...document.querySelectorAll('.rv-form .rv-f .k')].some(k => k.textContent === 'Direction'))));
t('hit target is suggested', await p.evaluate(() => [...document.querySelectorAll('.rv-chips .is-sug')].map(b => b.textContent).join()) === 'Hit target');
t('no if-held for a trade that hit target', !(await p.$('.rv-held')));
const groups = await p.evaluate(() => [...document.querySelectorAll('.rv-shotgroup')].map(g => [g.querySelector('.rv-sk').firstChild.textContent, g.querySelectorAll('.rv-shot').length]));
t('the screenshots you took it with, and no "after" row', JSON.stringify(groups) === '[["Screenshots",1]]', JSON.stringify(groups));
await p.evaluate(() => [...document.querySelectorAll('.rv-chips button')].find(b => b.textContent === 'Hit target').click()); await settle(300);
const wRev = (await onDisk()).find(x => x.id === W38[winI].id).review;
t('confirming the suggestion marks it reviewed', wRev.what === 'target');

await pick(lossI);
t('stop loss: only how far it ran before the stop until the direction is said', (await labels()).join() === 'Ran before stopped out' && /was the idea right/.test(await p.evaluate(() => document.querySelector('.rv-ask')?.textContent)));
t('entry is already early — it was ticked as a mistake', (await segOn())[1] === 'Early');
/* the calendar was read for this week: the bank holiday is the calendar's
   (the UK, on the 18th only), whatever was ticked when it was logged */
const lossHol = W38[lossI].date === '2026-09-18' ? 'United Kingdom' : 'N/A';
const pills = await p.evaluate(() => [...document.querySelectorAll('.rv-pill')].map(x => x.textContent));
t('the review shows the news timing logged, and the calendar’s bank holiday', pills.includes('NewsDuring news') && pills.includes('Bank holiday' + lossHol), JSON.stringify([pills, W38[lossI].date]));
await p.evaluate(() => [...document.querySelectorAll('.rv-form .rv-seg button')].find(b => b.textContent === 'Right').click()); await settle(300);
t('right: how far it ran after — no drawdown box, a stop is a loss', (await labels()).join() === 'Could have made,Ran before stopped out', `${await labels()}`);
t('no better exit on a stop', !(await labels()).includes('Better exit'));
t('and "stopped, then went my way" is suggested', await p.evaluate(() => [...document.querySelectorAll('.rv-chips .is-sug')].map(b => b.textContent).join()) === 'Stopped, then went my way');
await p.evaluate(() => [...document.querySelectorAll('.rv-form .rv-seg button')].find(b => b.textContent === 'Wrong').click()); await settle(300);
t('wrong: ran-after goes', (await labels()).join() === 'Ran before stopped out', (await labels()).join());

await pick(lossI2);
t('closed by hand at a loss: could have made, drawdown and ran before, no better exit', (await labels()).join() === 'Could have made,Drawdown,Ran before stopped out', (await labels()).join());
t('and the if-held question', !!(await p.$('.rv-held')));
await p.evaluate(() => [...document.querySelectorAll('.rv-form .rv-seg button')].find(b => b.textContent === 'Wrong').click()); await settle(300);
t('read the wrong way, drawdown goes', (await labels()).join() === 'Could have made,Ran before stopped out');

const untouched = W38.findIndex((x, i) => ![winI, lossI, lossI2].includes(i));
await pick(untouched);
t('a trade logged without an exit reason or prices: available and heat, no better exit, no if-held', (await labels()).join() === 'Could have made,Drawdown' && !(await p.$('.rv-held')));

/* the week tab still adds up, with the defaults counted */
await go('#/review/week', 700);
t('the week tab draws', !!(await p.$('.rv-stats')));

await p.setViewportSize({ width: 1280, height: 800 }); await go('#/review', 600); await pick(winI);
t('at 1280 the screenshots fit the card', await p.evaluate(() => { const g = document.querySelector('.rv-shotgroup')?.getBoundingClientRect(), c = document.querySelector('.rv-card').getBoundingClientRect(); return !!g && g.right <= c.right + 1; }));

t('no page errors', errs.length === 0, errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
