/* The Month tab of the review: the month added up, the weeks against each
   other, and each week's notes underneath. Expected figures are worked out
   here from the trades, without the app's code. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB } from '../fixtures/ghost-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };
const rr = v => `${v > 0.0005 ? '+' : v < -0.0005 ? '−' : ''}${Math.abs(v).toFixed(1)}R`;

/* ---------- a September ---------- */
const base = { accountId: 'acc_1', riskPercent: 1, mode: 'live', sessionId: 'ses_l', setupId: 's_fvg', tagIds: [], notes: '', status: 'closed', side: 'buy', pair: 'XAUUSD', timeOpen: '15:30', timeClose: '16:30' };
let n = 0;
const T = (date, R, review) => ({ ...base, id: 'm' + (++n), date, netResult: R * 1000, ...(review ? { review } : {}) });
const TR = [
  T('2026-08-31', 5),                                                   // W36, but August: not in the month
  T('2026-09-01', 2, { what: 'target', entry: 'ontime', plan: 'yes', grade: 'A' }),
  T('2026-09-03', -1, { what: 'wrong', entry: 'early', plan: 'no', grade: 'C' }),
  T('2026-09-08', 1.5, { what: 'target', entry: 'ontime', plan: 'yes', grade: 'A' }),
  T('2026-09-09', -1, { what: 'stopped', entry: 'early', plan: 'yes', grade: 'B' }),
  T('2026-09-10', -1, { what: 'wrong', entry: 'early', plan: 'no', grade: 'C' }),
  T('2026-09-15', 3, { what: 'target', entry: 'ontime', plan: 'yes', grade: 'A' }),
  T('2026-09-16', 2),
  T('2026-09-17', -1, { what: 'stopped', entry: 'late', plan: 'partly', grade: 'B' }),
  T('2026-09-23', 0.5),
  T('2026-09-30', -2),                                                  // W40, which runs into October
  T('2026-10-01', 4),                                                   // W40, October: not in the month
];
const SEPT = TR.filter(x => x.date.startsWith('2026-09'));
const WEEKS = { '2026-W36': ['2026-08-31', '2026-09-06'], '2026-W37': ['2026-09-07', '2026-09-13'], '2026-W38': ['2026-09-14', '2026-09-20'],
  '2026-W39': ['2026-09-21', '2026-09-27'], '2026-W40': ['2026-09-28', '2026-10-04'] };
const inW = (k, list) => list.filter(x => x.date >= WEEKS[k][0] && x.date <= WEEKS[k][1]);
const R = x => x.netResult / 1000;
const EXP = Object.fromEntries(Object.keys(WEEKS).map(k => { const w = inW(k, SEPT); return [k, {
  n: w.length, taken: w.reduce((a, x) => a + R(x), 0), early: w.filter(x => x.review?.entry === 'early').length,
  reviewed: w.filter(x => x.review?.what).length }]; }));
const TOTAL = SEPT.reduce((a, x) => a + R(x), 0);
const WINS = SEPT.filter(x => R(x) > 0).length;
const NOTES = { version: 1, weeks: {
  '2026-W37': { worked: 'Waiting for London.', fix: 'Two early entries on gold.', focus: 'Wait for the close.', done: true },
  '2026-W38': { worked: 'Held the runner on Tuesday.' } } };

const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Australia/Perth' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_|net::/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(new Date('2026-09-20T12:00:00+08:00'));
await p.addInitScript(({ ACCT, TR, PB, NOTES }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: 'R', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)],
    ['data/review.json', JSON.stringify(NOTES)]]));
}, { ACCT, TR, PB, NOTES });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 300) => p.waitForTimeout(ms);
const go = async (h, ms = 600) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };
const label = () => p.evaluate(() => document.querySelector('.rv-week .val')?.textContent);

/* ---------- by hand ---------- */
const H = await p.evaluate(async () => {
  const { monthWeeks } = await import('/js/views/review.js');
  const { store } = await import('/js/store.js');
  return monthWeeks(store.activeAccount, '2026-09', store.trades.filter(x => x.date.startsWith('2026-09')))
    .map(w => ({ key: w.key, n: w.trades.length, taken: w.S.taken, early: w.early }));
});
t('the month’s weeks: W36 to W40, each only its September days', JSON.stringify(H.map(w => w.key)) === JSON.stringify(Object.keys(WEEKS)), JSON.stringify(H.map(w => w.key)));
t('…with their trades and R', H.every(w => w.n === EXP[w.key].n && Math.abs(w.taken - EXP[w.key].taken) < 1e-9 && w.early === EXP[w.key].early), JSON.stringify(H));

/* ---------- the tab ---------- */
await go('#/review', 600);
t('a Month tab beside Trades and Week', await p.evaluate(() => [...document.querySelectorAll('.head .seg button')].map(b => b.textContent).join()) === 'Trades,Week,Month');
await p.evaluate(() => [...document.querySelectorAll('.head .seg button')].find(b => b.textContent === 'Month').click()); await settle(600);
t('it opens on the month the week is in', await p.evaluate(() => location.hash) === '#/review/month' && await label() === 'September 2026', await label());
const stats = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.rv-mstats .rv-stat')].map(n => [n.querySelector('.k').textContent, [n.querySelector('.v').textContent, n.querySelector('.s').textContent]])));
t('the month added up: R taken over every September trade', stats['Taken']?.[0] === rr(TOTAL) && /10 trades this month/.test(stats['Taken'][1]), JSON.stringify(stats['Taken']) + ' want ' + rr(TOTAL));
t('win rate', stats['Win rate']?.[0] === Math.round(WINS / SEPT.length * 100) + '%' && stats['Win rate'][1] === `${WINS} of ${SEPT.length}`, JSON.stringify(stats['Win rate']));
t('early entries across the month', stats['Early entries']?.[0] === '3', JSON.stringify(stats['Early entries']));
t('plan followed: 4 of 7 answered', stats['Plan followed']?.[0] === '57%' && /4 of 7/.test(stats['Plan followed'][1]), JSON.stringify(stats['Plan followed']));
t('reviewed: 7 of 10', stats['Reviewed']?.[0] === '7 / 10', JSON.stringify(stats['Reviewed']));

const rows = await p.evaluate(() => [...document.querySelectorAll('button.rv-mrow')].map(r => ({ key: r.dataset.week,
  cells: [...r.children].map(c => c.innerText.replace(/\n/g, ' ').trim()) })));
t('week by week: a row for each week', JSON.stringify(rows.map(r => r.key)) === JSON.stringify(Object.keys(WEEKS)), JSON.stringify(rows.map(r => r.key)));
t('…with its R, trades and early entries', rows.every(r => { const e = EXP[r.key];
  return r.cells[1].endsWith(e.n ? rr(e.taken) : '—') && r.cells[2] === String(e.n || '—') && r.cells[5] === (e.n ? String(e.early) : '—'); }), JSON.stringify(rows.map(r => r.cells)));
const bestK = Object.keys(WEEKS).filter(k => EXP[k].n).reduce((a, k) => (EXP[k].taken > EXP[a].taken ? k : a));
const worstK = Object.keys(WEEKS).filter(k => EXP[k].n).reduce((a, k) => (EXP[k].taken < EXP[a].taken ? k : a));
t('the best week and the hardest are marked', /best/.test(rows.find(r => r.key === bestK).cells[0]) && /hardest/.test(rows.find(r => r.key === worstK).cells[0]),
  `${bestK} ${worstK} ${JSON.stringify(rows.map(r => r.cells[0]))}`);
t('a week marked done says so', /✓/.test(rows.find(r => r.key === '2026-W37').cells[7]));
t('the habits and the what-happened mix are there for the month', !!(await p.$('.rv-month .rv-mix')));

const cards = await p.evaluate(() => [...document.querySelectorAll('.rv-mweek')].map(c => ({ key: c.dataset.week, text: c.innerText })));
t('scrolling down: each week with what you wrote', cards.map(c => c.key).join() === Object.keys(WEEKS).join(), cards.map(c => c.key).join());
const w37 = cards.find(c => c.key === '2026-W37')?.text || '';
t('…what worked, what to fix, the focus', /Waiting for London\./.test(w37) && /Two early entries on gold\./.test(w37) && /Wait for the close\./.test(w37), w37.slice(0, 200));
t('…and says so when nothing was written', /nothing written/.test(cards.find(c => c.key === '2026-W39')?.text || ''));
await p.screenshot({ path: OUT + '/review-month.png', fullPage: false });
await p.evaluate(() => document.querySelector('.rv-mweek[data-week="2026-W37"]').scrollIntoView());
await settle(150);
await p.screenshot({ path: OUT + '/review-month-weeks.png' });

/* ---------- moving about ---------- */
await p.click('button.rv-mrow[data-week="2026-W37"]'); await settle(600);
t('a week’s row opens that week', await p.evaluate(() => location.hash) === '#/review/week' && /W37/.test(await label()), await label());
await p.evaluate(() => [...document.querySelectorAll('.head .seg button')].find(b => b.textContent === 'Month').click()); await settle(500);
t('…and Month comes back to September', await label() === 'September 2026', await label());
await p.click('.rv-week button[aria-label="Previous month"], .rv-week button'); await settle(600);
t('the arrows step a month at a time', await label() === 'August 2026', await label());
t('a month with one trade still adds up', /1 trade this month/.test(await p.evaluate(() => document.querySelector('.rv-mstats')?.innerText || '')));
await p.evaluate(() => [...document.querySelectorAll('.rv-week button')].pop().click()); await settle(400);
await p.evaluate(() => [...document.querySelectorAll('.rv-week button')].pop().click()); await settle(400);
await p.evaluate(() => [...document.querySelectorAll('.rv-week button')].pop().click()); await settle(500);
t('a month with nothing says so', await label() === 'November 2026' && /No trades this month/.test(await p.evaluate(() => document.querySelector('.view').innerText)), await label());

t('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
