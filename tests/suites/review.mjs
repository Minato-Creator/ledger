/* Weekly review: going back over the week's trades one at a time, and what
   the answers add up to. Every answer has to land on the trade it was given
   for, survive a restart, and come back out as the right number on the
   Week tab. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB, makeTrades } from '../fixtures/ghost-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const FIX  = HERE + '../fixtures';
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
const PNG = fs.readFileSync(FIX + '/chart-htf.png').toString('base64');

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const TR = makeTrades();
const key = x => x.date + (x.timeOpen || '99:99');
const W38 = TR.filter(x => x.date >= '2026-09-14' && x.date <= '2026-09-20').sort((a, b) => key(a).localeCompare(key(b)));
/* The first two of the week hit take profit, so the review asks them for a
   better exit; the rest were logged before exit reasons existed. */
W38[0].exitReason = 'tp'; W38[1].exitReason = 'tp';
/* Every trade of the week planned at 1 : 3; the last one closed by hand and
   would have gone on to its target. */
for (const x of W38) Object.assign(x, { entryPrice: 100, stopLoss: 99, takeProfit: 103 });
Object.assign(W38[W38.length - 1], { exitReason: 'manual', heldOutcome: 'win', heldR: 3 });
/* One trade arrives with a review that is not an object, to be healed away. */
const broken = TR.find(x => x.date < '2026-09-14');
broken.review = 'nonsense';

const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(new Date('2026-09-20T10:00:00'));
await p.addInitScript(({ ACCT, TR, PB }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, TR, PB });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 350) => p.waitForTimeout(ms);
const text = s => p.evaluate(x => document.querySelector(x)?.innerText.replace(/\s+/g, ' ').trim() ?? null, s);
const onDisk = () => p.evaluate(() => JSON.parse(window.__files.get('data/trades.json')).trades);
const weeksOnDisk = () => p.evaluate(() => JSON.parse(window.__files.get('data/review.json') || '{}').weeks);
const reviewOf = async id => (await onDisk()).find(x => x.id === id)?.review || null;

/* ===================== the arithmetic ===================== */
console.log('arithmetic');
const S = await p.evaluate(async () => {
  const R = await import('/js/views/review.js');
  const A = { startingBalance: 100000 };
  const T = (n, review, exitReason = null) => ({ id: 'x' + Math.random(), date: '2026-09-15', netResult: n * 1000, riskPercent: 1, status: 'closed', review, exitReason });
  /* +2 hit target: ran 3, heat 0.4 · −1 stopped then right: ran 4, would have made 3 · +1 closed early: ran 2.5, heat 0.8 · −1 not reviewed */
  return R.weekStats(A, [
    T(2, { what: 'target', avail: 3, heat: 0.4, dir: 'right', plan: 'yes', entry: 'ontime', grade: 'A' }),
    T(-1, { what: 'stopped', avail: 4, heat: 1, better: 3, dir: 'right', plan: 'yes', entry: 'early', grade: 'B' }, 'sl'),
    T(1, { what: 'early', avail: 2.5, heat: 0.8, dir: 'right', plan: 'no', entry: 'early', grade: 'B' }),
    T(-1, null)]);
});
t('taken is every trade, reviewed or not: +1R', Math.abs(S.taken - 1) < 1e-9, S.taken);
t('available adds up the reviewed ones: 9.5R', Math.abs(S.available - 9.5) < 1e-9, S.available);
t('left on the table is what ran past what you took: 1 + 4 + 1.5 = 6.5R', Math.abs(S.left - 6.5) < 1e-9, S.left);
t('one stopped-but-right, worth how far it ran once it turned, 4R — a better exit is only asked of take profit', S.stopped === 1 && S.stoppedWould === 4, S.stoppedWould);
t('plan followed on 2 of 3', S.planYes === 2 && S.planned === 3 && Math.abs(S.plan - 2 / 3) < 1e-9);
t('heat on winners is the average of the winners only: 0.6R', Math.abs(S.heatOnWinners - 0.6) < 1e-9, S.heatOnWinners);
t('available on right calls averages 3.17R, taken on winners 1.5R', Math.abs(S.availRight - 9.5 / 3) < 1e-9 && Math.abs(S.takenOnWinners - 1.5) < 1e-9);
t('entries and grades are counted', S.entry.early === 2 && S.entry.ontime === 1 && S.grade.A === 1 && S.grade.B === 2);
t('3 of 4 reviewed', S.reviewed === 3 && S.trades === 4);
const LO = await p.evaluate(async () => {
  const R = await import('/js/views/review.js');
  const A = { startingBalance: 100000 };
  const P = { date: '2026-09-15', timeOpen: '10:00', timeClose: '11:00', riskPercent: 1, status: 'closed', side: 'buy', entryPrice: 100, stopLoss: 99, takeProfit: 104 };
  const key = t => [t.date, t.timeOpen, t.timeClose, t.entryPrice, t.stopLoss, t.takeProfit, t.exitPrice, t.side, t.status].join('|');
  const be = { ...P, exitPrice: 100, exitReason: 'be', netResult: 0 };
  be.review = { chart: { v: R.FACTS_V, key: key(be), reachedTarget: true } };
  const beNo = { ...P, exitPrice: 100, exitReason: 'be', netResult: 0 };
  beNo.review = { chart: { v: R.FACTS_V, key: key(beNo), reachedTarget: false } };
  return {
    manualWin: R.leftOf(A, { ...P, exitPrice: 102.5, exitReason: 'manual', netResult: 2500, heldOutcome: 'win', heldR: 4 }),
    manualLoss: R.leftOf(A, { ...P, exitPrice: 101, exitReason: 'manual', netResult: 1000, heldOutcome: 'loss', heldR: -1 }),
    tp: R.leftOf(A, { ...P, exitPrice: 104, exitReason: 'tp', netResult: 4000 }),
    sl: R.leftOf(A, { ...P, exitPrice: 99, exitReason: 'sl', netResult: -1000 }),
    be: R.leftOf(A, be), beNo: R.leftOf(A, beNo),
    week: R.weekStats(A, [{ ...P, exitPrice: 104, exitReason: 'tp', netResult: 4000 }, { ...P, exitPrice: 99, exitReason: 'sl', netResult: -1000 },
      { ...P, exitPrice: 102.5, exitReason: 'manual', netResult: 2500, heldOutcome: 'win', heldR: 4 }]),
  };
});
t('available: closed early at +2.5R, target +4R then hit — 1.5R left', Math.abs(LO.manualWin - 1.5) < 1e-9, String(LO.manualWin));
t('…nothing when holding would have lost, or a target or stop was hit', LO.manualLoss === 0 && LO.tp === 0 && LO.sl === 0, JSON.stringify(LO));
t('…a break-even whose target was then reached left the whole target; one that never got there, nothing', Math.abs(LO.be - 4) < 1e-9 && LO.beNo === 0, JSON.stringify([LO.be, LO.beNo]));
t('the week: taken 5.5R, available 1.5R, planned 12R — taken is 46% of planned',
  Math.abs(LO.week.taken - 5.5) < 1e-9 && Math.abs(LO.week.leftEarly - 1.5) < 1e-9 && Math.abs(LO.week.plannedR - 12) < 1e-9 && Math.abs(LO.week.capture - 5.5 / 12) < 1e-9, JSON.stringify([LO.week.taken, LO.week.leftEarly, LO.week.plannedR]));

/* ===================== the page ===================== */
console.log('page');
t('a review that was not an object is healed away', (await onDisk()).find(x => x.id === broken.id).review === undefined);
await p.evaluate(() => { location.hash = '#/calendar'; }); await settle(500);
const nav = await p.evaluate(() => [...document.querySelectorAll('.head .sn-tab')].map(a => a.textContent.trim()));
t('Review sits in the journal, after Calendar', nav.indexOf('Review') === nav.indexOf('Calendar') + 1, nav.join(' / '));
await p.evaluate(() => { location.hash = '#/review'; }); await settle(600);
t('it opens on this week', /14 – 20 Sep · W38/.test(await text('.rv-week .val')), await text('.rv-week .val'));
t('with every trade of the week in the list, in order', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.rv-item .p')].map(n => n.firstChild.textContent)))
  === JSON.stringify(W38.map(x => x.pair)));
t('and none reviewed yet', /0 of 11 reviewed/.test(await text('.rv-progress')));
t('the first trade is open', await p.evaluate(() => document.querySelector('.rv-item.is-on') === document.querySelector('.rv-item')));

/* Answer the questions for the first trade. */
const first = W38[0].id;
const fill = async (label, v) => { const s = `.rv-num[aria-label="${label}"]`; await p.fill(s, v); await p.press(s, 'Tab'); await settle(250); };
await fill('Could have made', '3.5');
await fill('Drawdown', '-0.6');
await fill('Better exit', '3');
t('numbers save as you leave the field', JSON.stringify(await reviewOf(first)).includes('"avail":3.5') && (await reviewOf(first)).heat === 0.6 && (await reviewOf(first)).better === 3,
  JSON.stringify(await reviewOf(first)));
t('heat is kept as a size, whichever sign you type', (await reviewOf(first)).heat === 0.6 && await p.$eval('.rv-num[aria-label="Drawdown"]', i => i.value) === '-0.6');
t('the ruler follows: your result, how far it ran, a better exit', await p.evaluate(() =>
  !!document.querySelector('.rv-rl .you') && !!document.querySelector('.rv-rl .avail') && !!document.querySelector('.rv-rl .bx') && /could have made \+3\.5R/.test(document.querySelector(".rv-rl .key").innerText)));
const click = async (scope, label) => { await p.evaluate(([s, l]) => [...document.querySelectorAll(s + ' button')].find(b => b.textContent.trim() === l).click(), [scope, label]); await settle(250); };
await click('.rv-card', 'On time');
await click('.rv-card', 'Yes');
await click('.rv-card', 'A');
t('not reviewed until you say what happened', !(await p.evaluate(() => document.querySelector('.rv-item .ok').classList.contains('is-done'))));
await click('.rv-chips', 'Hit target');
let r1 = await reviewOf(first);
t('every answer is on the trade', r1.entry === 'ontime' && r1.plan === 'yes' && r1.grade === 'A' && r1.what === 'target', JSON.stringify(r1));
t('and now it counts as reviewed', await p.evaluate(() => document.querySelector('.rv-item .ok').classList.contains('is-done')) && /1 of 11 reviewed/.test(await text('.rv-progress')));
await p.fill('.rv-lesson', 'Took it at the open, as planned.'); await p.click('.rv-card .rv-top'); await settle(700);
t('the lesson saves too', (await reviewOf(first)).lesson === 'Took it at the open, as planned.');
await click('.rv-chips', 'Hit target');
t('clicking the chosen chip again clears it', (await reviewOf(first)).what == null && /0 of 11/.test(await text('.rv-progress')));
await click('.rv-chips', 'Hit target');

/* scrolled down the page, picking another trade: the page stays where it is (no jump to the top) */
await p.addStyleTag({ content: '.rv-trades { max-height:420px !important; } .rv-trades > * { flex-shrink:0 !important; }' }); await p.waitForTimeout(150);
const sc = await p.evaluate(() => { const w = document.querySelector('.rv-trades'); w.scrollTop = Math.min(400, w.scrollHeight - w.clientHeight); return w.scrollTop; });
await p.evaluate(() => document.querySelectorAll('.rv-item')[2].click()); await p.waitForTimeout(300);
const sc2 = await p.evaluate(() => document.querySelector('.rv-trades').scrollTop);
t('scrolled down, click another trade: the page stays where it was', sc > 100 && Math.abs(sc2 - sc) <= 2, JSON.stringify([sc, sc2]));
await p.evaluate(() => { document.querySelectorAll('.rv-item')[0].click(); document.querySelector('.rv-trades').scrollTop = 0; document.querySelectorAll('style').forEach(x => { if (/max-height:420px/.test(x.textContent)) x.remove(); }); }); await p.waitForTimeout(300);
/* Next goes to the next trade still to do. */
await click('.rv-actions', 'Next to review');
t('Next to review moves on to the next one not done', await p.evaluate(() => [...document.querySelectorAll('.rv-item')].indexOf(document.querySelector('.rv-item.is-on'))) === 1);
const second = W38[1].id;
await click('.rv-chips', 'Stopped, then went my way');
await fill('Could have made', '4'); await fill('Better exit', '3');
await click('.rv-actions', 'Previous');
t('Previous goes back', await p.evaluate(() => [...document.querySelectorAll('.rv-item')].indexOf(document.querySelector('.rv-item.is-on'))) === 0);
t('and the answers are still there', await p.$eval('.rv-num[aria-label="Could have made"]', i => i.value) === '3.5' && /is-on/.test(await p.evaluate(() =>
  [...document.querySelectorAll('.rv-chips button')].find(b => b.textContent === 'Hit target').className)));

/* No "after" pictures: the chart at the top shows what price did after. */
t('no "after" picture to add — the chart shows it', !(await p.$('.rv-shotgroup.is-after')) && !(await p.$('.rv-shot.is-add')));
t('the trade’s own charts are untouched', JSON.stringify((await onDisk()).find(x => x.id === first).shots || []) === JSON.stringify(W38[0].shots || []));

/* ---------- the week ---------- */
await p.evaluate(() => [...document.querySelectorAll('.head .seg button')].find(b => b.textContent === 'Week').click()); await settle(600);
t('the Week tab is its own page', await p.evaluate(() => location.hash) === '#/review/week' && !!(await p.$('.rv-stats')) && !(await p.$('.rv-card')));
const tiles = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.rv-stat')].map(n => [n.querySelector('.k').textContent, n.querySelector('.v').textContent])));
const taken = W38.reduce((a, x) => a + x.netResult / 1000, 0);
const R = v => `${v > 0.0005 ? '+' : v < -0.0005 ? '−' : ''}${Math.abs(v).toFixed(1)}R`;
t('Taken is the week’s R', tiles.Taken === R(taken), `${tiles.Taken} vs ${R(taken)}`);
const planned = W38.length * 3;
const lastR = W38[W38.length - 1].netResult / 1000;
const left = Math.max(0, 3 - lastR);
const cap = await text('.rv-cap-row');
t('the card: what you took, losses and all', cap.includes(`${R(taken)} taken`), cap);
t('…what closing early left behind, on the trade that went on to its target', cap.includes(`${R(left)} available`), cap + ' want ' + R(left));
t('…and every trade’s planned R:R added up', cap.includes(`${R(planned)} planned`), cap + ' want ' + R(planned));
t('the gauge is taken out of planned', await text('.rv-gauge-c b') === `${Math.round(taken / planned * 100)}%`, `${await text('.rv-gauge-c b')} vs ${Math.round(taken / planned * 100)}%`);
t('Left on the table is the same early-exit figure', tiles['Left on the table'] === R(left), `${tiles['Left on the table']} vs ${R(left)}`);
t('Stopped, but right: one, worth +3R', tiles['Stopped, but right'] === '1' && /would have made \+3\.0R/.test(await text('.rv-stats')));
t('Every trade has a column', await p.evaluate(() => document.querySelectorAll('.rv-chart .an-hit').length) === W38.length);
t('with its exit drawn as a dot, and a better exit as a ring', await p.evaluate(() => document.querySelectorAll('.rv-chart .rv-exit').length) === W38.length
  && await p.evaluate(() => document.querySelectorAll('.rv-chart .rv-ring').length) === 2);
t('Stop & target needs drawdown and room on two trades before it draws', /Fill in drawdown and could have made/.test(await text('.rv-scatter')));
t('the breakdown counts what happened', /Hit target 1/.test(await text('.rv-mix .rv-legend')) && /Stopped, then went my way 1/.test(await text('.rv-mix .rv-legend')));
t('and the donut is cut in those two parts', await p.evaluate(() => document.querySelectorAll('.rv-donut-seg').length) === 2);
t('the last eight weeks end on this one', await p.evaluate(() => [...document.querySelectorAll('.rv-trend .rv-tr')].length) === 3
  && /W38/.test(await text('.rv-trend')));

/* With heat on two trades the stop-and-target chart draws them. */
await p.evaluate(async id => { const { store } = await import('/js/store.js'); await store.setTradeReview(id, { heat: 0.9 }); }, W38[1].id);
await p.evaluate(() => { location.hash = '#/review'; }); await settle(200);
await p.evaluate(() => { location.hash = '#/review/week'; }); await settle(600);
t('Stop & target puts each trade at its heat and its room to run', await p.evaluate(() => document.querySelectorAll('.rv-scatter .rv-pt').length) === 2);
t('the stopped-but-right trade stands out', await p.evaluate(() => document.querySelectorAll('.rv-scatter .rv-pt.is-stopped').length) === 1);
t('with your stop and your usual take drawn across it', !!(await p.$('.rv-scatter .rv-stopv')) && /you take/i.test(await text('.rv-scatter')));

/* No column held back for the notes: the charts take the full width and the
   notes run across the foot of the page, three side by side. */
const lay = await p.evaluate(() => {
  const body = document.querySelector('.rv-body').getBoundingClientRect();
  const main = document.querySelector('.rv-wleft').getBoundingClientRect();
  const notes = document.querySelector('.rv-notes').getBoundingClientRect();
  const boxes = [...document.querySelectorAll('.rv-notes .rv-txt')].map(n => n.getBoundingClientRect().top);
  return { full: main.width >= body.width - 12, below: notes.top >= main.bottom, wide: Math.abs(notes.width - main.width) < 2,
    row: boxes.length === 3 && Math.max(...boxes) - Math.min(...boxes) < 2 };
});
t('the week uses the whole width', lay.full, JSON.stringify(lay));
t('and the notes run across the bottom, side by side', lay.below && lay.wide && lay.row, JSON.stringify(lay));

/* Notes, and last week's focus. */
await p.fill('.rv-txt[aria-label="One focus for next week"]', 'Hold runners to the next level.');
await p.fill('.rv-txt[aria-label="What worked"]', 'London sweeps on gold.');
await p.click('.rv-stats'); await settle(700);
let wk = await weeksOnDisk();
t('notes are kept for the week', wk['2026-W38']?.worked === 'London sweeps on gold.' && wk['2026-W38']?.focus === 'Hold runners to the next level.', JSON.stringify(wk));
await click('.rv-notes', 'Mark week done');
t('the week can be marked done', (await weeksOnDisk())['2026-W38'].done === true && /Week done/.test(await text('.rv-done')));
await p.evaluate(() => document.querySelector('.rv-week button:last-child').click()); await settle(500);
t('the next week has no trades and says so', /No trades this week/.test(await text('.main')));
await p.evaluate(() => { location.hash = '#/review/week'; }); await settle(300);
await p.evaluate(() => document.querySelector('.rv-week button:first-child').click()); await settle(400);
await p.evaluate(() => document.querySelector('.rv-week button:first-child').click()); await settle(400);
t('a week earlier, W37', /W37/.test(await text('.rv-week .val')));
await p.evaluate(() => document.querySelector('.rv-week button:last-child').click()); await settle(400);
t('and back on W38 the notes are still there', await p.$eval('.rv-txt[aria-label="What worked"]', n => n.value) === 'London sweeps on gold.');

/* Last week's focus shows on the following week — seeded straight on W39's predecessor. */
await p.evaluate(async () => { const { store } = await import('/js/store.js'); await store.setWeekNote('2026-W37', { focus: 'Wait for the close.' }); });
await p.evaluate(() => { location.hash = '#/'; }); await settle(200);
await p.evaluate(() => { location.hash = '#/review/week'; }); await settle(500);
t('the week before’s focus is shown, to hold this week against', /Last week’s focus Wait for the close\./i.test(await text('.rv-notes')), await text('.rv-last'));

/* ---------- it survives, and it cleans up ---------- */
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('.topbar'); await settle(400);
await p.evaluate(() => { location.hash = '#/review'; }); await settle(500);
t('after a restart, the answers are still on the trades', /2 of 11 reviewed/.test(await text('.rv-progress')), await text('.rv-progress'));
await p.screenshot({ path: OUT + '/review.png' });
t('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
