/* Analytics → Weekly winrate. One week or one month at a time, live and
   forward test side by side, stepped through by arrows, keys or the strip.

   The numbers are checked against the fixture worked out by hand — see the
   comments beside each — not against whatever the page happens to print. */
import pw from 'playwright';
import fs from 'node:fs';
import * as P from '../../src/js/periods.js';
import { ACCT, TRADES, PB } from '../fixtures/weekly-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };
const near = (a, b, e = 1e-9) => a != null && b != null && Math.abs(a - b) < e;

/* =================== the arithmetic, on its own =================== */
console.log('periods');
t('a date files under its ISO week', P.periodOf('2026-09-15', 'week') === '2026-W38');
t('and under its month', P.periodOf('2026-09-15', 'month') === '2026-09');
t('a week runs Monday to Sunday', JSON.stringify(P.rangeOf('2026-W38')) === '{"start":"2026-09-14","end":"2026-09-20"}');
t('a leap February has 29 days', P.rangeOf('2024-02').end === '2024-02-29');
t('stepping back from week 1 lands in last year', P.step('2026-W01', -1) === '2025-W52');
t('a 53-week year is walked through, not skipped', P.step('2020-W52', 1) === '2020-W53' && P.step('2020-W53', 1) === '2021-W01');
t('months step across the year', P.step('2026-12', 1) === '2027-01' && P.step('2026-01', -1) === '2025-12');
t('distance counts periods between two keys', P.distance('2025-W50', '2026-W02') === 4 && P.distance('2025-11', '2026-02') === 3);
t('a week inside one month reads "14 – 20 Sep 2026"', P.labelOf('2026-W38').span === '14 – 20 Sep 2026');
t('a week across two months names both', P.labelOf('2026-W40').span === '28 Sep – 4 Oct 2026');
t('a week across two years names both years', P.labelOf('2026-W53').span.includes('2026') && P.labelOf('2026-W53').span.includes('2027'), P.labelOf('2026-W53').span);

const fx = P.inPeriod('2026-W38', TRADES);
const days = P.partsOf('2026-W38', fx).map(x => x.label);
t('a week breaks into Monday to Friday, plus a weekend day only if traded',
  days.join('|') === 'Mon 14 Sep|Tue 15 Sep|Wed 16 Sep|Thu 17 Sep|Fri 18 Sep|Sat 19 Sep', days.join('|'));
const weeks = P.partsOf('2026-08', []).map(x => x.label);
t('a month breaks into the weeks that touch it, clipped to the month',
  weeks[0] === 'W31 · 1 – 2 Aug' && weeks[weeks.length - 1] === 'W36 · 31 Aug', weeks.join('|'));

/* W38 live, by hand, in closing order:
     −1R, −1R, +2.5R, −1R (0.5% risk, −$500), +0.02R (break-even +$20), +1.8R
   wins 2, losses 3, BE 1 → 40%.  net 1.32R.  1.32 / 6 = 0.22R a trade.
   running: −1 −2 +0.5 −0.5 −0.48 +1.32 → deepest fall 2R, from the start.
   winners 4.3R over losers 3R → PF 1.433.  two losses in a row to open. */
const acct = { ...ACCT };
const liveW38 = fx.filter(x => x.mode === 'live' && x.status !== 'open');
const s = P.periodStats(acct, liveW38);
t('win rate leaves the break-even out', near(s.winRate, 0.4), s.winRate);
t('net R adds every trade', near(s.netR, 1.32, 1e-6), s.netR);
t('drawdown is measured from where the week started', near(s.drawdownR, 2), s.drawdownR);
t('profit factor is winners over losers, in R', near(s.pfR, 4.3 / 3, 1e-9), s.pfR);
t('best and worst trade', s.bestR === 2.5 && s.worstR === -1);
t('longest losing run', s.lossStreak === 2);
t('days traded', s.days === 5);

const openers = [
  { date: '2026-09-21', timeClose: '10:00', netResult: -1000, riskPercent: 1 },
  { date: '2026-09-21', timeClose: '11:00', netResult: 500, riskPercent: 1 },
  { date: '2026-09-21', timeClose: '09:00', netResult: -1000, riskPercent: 1 }];
t('the run is taken in closing order, not the order saved', near(P.periodStats(acct, openers).drawdownR, 2));
t('a trade with no R leaves the drawdown blank rather than understated',
  P.periodStats(acct, [...openers, { date: '2026-09-22', netResult: 300 }]).drawdownR === null);
t('a break-even ends a losing run',
  P.periodStats(acct, [
    { date: '2026-09-21', timeClose: '09:00', netResult: -1000, riskPercent: 1 },
    { date: '2026-09-21', timeClose: '10:00', netResult: 0, riskPercent: 1, outcome: 'breakeven' },
    { date: '2026-09-21', timeClose: '11:00', netResult: -1000, riskPercent: 1 }]).lossStreak === 1);
t('no losers is an infinite profit factor, not a crash',
  P.periodStats(acct, [{ date: '2026-09-21', netResult: 500, riskPercent: 1 }]).pfR === Infinity);

const r = P.riskTaken(acct, fx.filter(x => x.mode === 'live'));
t('risk taken sums each trade\'s own risk', near(r.totalPct, 5.5), r.totalPct);
t('and puts a dollar figure on it', near(r.totalMoney, 5500), r.totalMoney);
const withOpen = P.riskTaken(acct, [...fx.filter(x => x.mode === 'live'),
  { date: '2026-09-19', status: 'open', riskPercent: 1.25 }, { date: '2026-09-19', riskPercent: null }]);
t('an open trade has already used its risk', near(withOpen.totalPct, 6.75) && withOpen.open === 1, JSON.stringify(withOpen));
t('a trade with no risk set is counted as missing, not as zero', withOpen.withRisk === withOpen.trades - 1);

/* =================== the page =================== */
console.log('\npage');
const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Australia/Perth' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
/* Tuesday 29 September 2026 in Perth — Week 40, with one live trade open. */
await p.clock.setFixedTime(new Date('2026-09-29T10:00:00+08:00'));
await p.addInitScript(({ ACCT, TRADES, PB }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', tradeScope: 'live',
      accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TRADES })],
    ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, TRADES, PB });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });

const settle = (ms = 260) => p.waitForTimeout(ms);
const text = sel => p.evaluate(s => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() ?? null, sel);
const header = () => text('.wk-step .val');
const card = kind => p.evaluate(k => {
  const c = document.querySelector('.wk-card.wk-' + k); if (!c) return null;
  const stat = name => [...c.querySelectorAll('.wk-stat')].find(x => x.querySelector('.k')?.textContent.trim() === name)
    ?.querySelector('.v')?.innerText.replace(/\s+/g, ' ').trim() ?? null;
  return { hero: c.querySelector('.wk-hero .v')?.textContent.trim() ?? null,
           delta: c.querySelector('.wk-delta')?.textContent.trim() ?? null,
           none: c.querySelector('.wk-none')?.textContent.trim() ?? null,
           open: c.querySelector('.wk-open')?.textContent.trim() ?? null,
           target: c.querySelector('.wk-target .t')?.textContent.trim() ?? null,
           risk: c.querySelector('.wk-risk') ? [...c.querySelectorAll('.wk-risk .wk-stat .v')].map(v => v.innerText.replace(/\s+/g, ' ').trim()).join(' | ') : null,
           stat };
}, kind);
const stat = (kind, name) => p.evaluate(({ k, n }) => {
  const c = document.querySelector('.wk-card.wk-' + k);
  return [...(c?.querySelectorAll('.wk-stat') || [])].find(x => x.querySelector('.k')?.textContent.trim() === n)
    ?.querySelector('.v')?.innerText.replace(/\s+/g, ' ').trim() ?? null;
}, { k: kind, n: name });
const slotOn = () => p.evaluate(() => document.querySelector('.wk-slot.is-on .wk-tick')?.textContent.trim());
/* Hit-testing, not reading the DOM: what is painted at the middle of it must
   be it, and nothing it sits inside may be cutting it off. */
const seen = sel => p.evaluate(s => {
  const n = document.querySelector(s); if (!n) return 'missing';
  /* A tooltip takes no pointer events, so the pointer never lands on it and
     hit-testing looks straight through. It is let back in for the moment of
     the test — that changes what can be clicked, not what is painted. */
  const pe = n.style.pointerEvents; n.style.pointerEvents = 'auto';
  try { return check(n); } finally { n.style.pointerEvents = pe; }
  function check(n) {
  const r = n.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return 'no size';
  if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) return 'off screen';
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!hit || !(hit === n || n.contains(hit))) return 'covered by ' + (hit?.className || hit?.tagName);
  for (let a = n.parentElement; a && a !== document.body; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const bx = a.getBoundingClientRect();
    if (r.top < bx.top - 1 || r.bottom > bx.bottom + 1 || r.left < bx.left - 1 || r.right > bx.right + 1) return 'clipped by ' + a.className;
  }
  return 'ok';
  }
}, sel);

await p.evaluate(() => { location.hash = '#/analytics'; }); await settle(500);
const tabs = await p.evaluate(() => [...document.querySelectorAll('.head .seg button')].map(b => b.textContent.trim()));
t('Analytics has a Weekly winrate tab, second along', tabs[1] === 'Weekly winrate', tabs.join(', '));
await p.evaluate(() => [...document.querySelectorAll('.head .seg button')].find(b => b.textContent.trim() === 'Weekly winrate').click());
await settle(500);

/* ---------- where it opens ---------- */
t('it opens on the current week, because a trade is open in it', await header() === '28 Sep – 4 Oct', await header());
t('the strip picks out the same week', await slotOn() === 'W40', await slotOn());
t('there is no next week yet', await p.evaluate(() => document.querySelector('.wk-step button:last-child').disabled));
t('and no "This week" button, since this is it', await p.evaluate(() => !document.querySelector('.wk-now')));
let L = await card('live');
t('the live side says nothing has closed yet', L.none === 'No live trades closed this week.', L.none);
t('but flags the trade still open', L.open === '1 still open', L.open);
t('and counts its risk as already taken', (L.risk || '').startsWith('1.25% $1,250'), L.risk);

/* ---------- stepping back ---------- */
await p.keyboard.press('ArrowLeft'); await settle();
await p.keyboard.press('ArrowLeft'); await settle();
t('the left arrow key steps back a week at a time', await header() === '14 – 20 Sep', await header());
t('and the strip follows', await slotOn() === 'W38', await slotOn());
t('a "This week" button appears once you have left it', await text('.wk-now') === 'This week');

L = await card('live');
const F = await card('forward');
t('live won 40% — two of five decided, the break-even left out', L.hero === '40%', L.hero);
t('forward tests won 75%', F.hero === '75%', F.hero);
t('live net R', await stat('live', 'Net R') === '+1.32R', await stat('live', 'Net R'));
t('live R per trade', await stat('live', 'Per trade') === '+0.22R', await stat('live', 'Per trade'));
t('weekly drawdown in R — two losses to open the week', await stat('live', 'Max drawdown') === '−2.00R', await stat('live', 'Max drawdown'));
t('live profit factor', await stat('live', 'Profit factor') === '1.43', await stat('live', 'Profit factor'));
t('losses in a row', await stat('live', 'Losses in a row') === '2');
t('days traded', await stat('live', 'Days traded') === '5');
t('live result in money and percent', await stat('live', 'Result') === '+$1,820.00 +1.82%', await stat('live', 'Result'));
t('against the weekly target', L.target === '+1.82% of +2.00%', L.target);
t('risk taken this week — total, per trade, largest', L.risk === '5.50% $5,500 | 0.92% | 1.00%', L.risk);
t('the week before had no live trades, and it says so rather than comparing', L.delta === 'nothing last week', L.delta);
/* W37 forward tests: 1 won, 2 lost = 33.3%. 75 − 33.3 = +41.7 → +42. */
t('forward tests compared with the week before, in points', F.delta === '+42 pts vs last week', F.delta);
t('forward tests have no risk block — nothing was at stake', F.risk === null);
t('forward test drawdown', await stat('forward', 'Max drawdown') === '−1.00R', await stat('forward', 'Max drawdown'));

/* ---------- the switch does not decide what this page shows ---------- */
const scopeTo = async name => {
  await p.evaluate(n => [...document.querySelectorAll('.scope-switch button, .scope-switch [role=radio]')]
    .find(b => b.textContent.trim().toLowerCase() === n)?.click(), name);
  await settle(400);
};
const before = JSON.stringify([await card('live').then(c => c.hero), await card('forward').then(c => c.hero)]);
await scopeTo('forward test');
const scopeNow = await p.evaluate(async () => (await import('/js/store.js')).store.tradeScope);
t('(the switch really did move to forward tests)', scopeNow === 'forward', scopeNow);
t('with the switch on Forward test, live is still shown, unchanged',
  JSON.stringify([await card('live').then(c => c.hero), await card('forward').then(c => c.hero)]) === before);
await scopeTo('all');
t('and on All the two are still kept apart, not added together',
  JSON.stringify([await card('live').then(c => c.hero), await card('forward').then(c => c.hero)]) === before);
await scopeTo('live');

/* ---------- the strip ---------- */
const slots = await p.evaluate(() => [...document.querySelectorAll('.wk-slot')].map(s => ({
  tick: s.querySelector('.wk-tick').textContent.trim(), off: s.disabled,
  live: s.querySelector('.wk-bar.is-live')?.style.height || null,
  fwd: s.querySelector('.wk-bar.is-forward')?.style.height || null })));
t('the strip shows twelve weeks', slots.length === 12, slots.length);
t('ending a few weeks past the one you are on', slots[slots.length - 1].tick === 'W40', slots.map(x => x.tick).join(' '));
t('weeks before the first trade cannot be picked', slots.filter(x => x.off).map(x => x.tick).join(' ') === 'W29 W30 W31 W32',
  slots.filter(x => x.off).map(x => x.tick).join(' '));
const w38 = slots.find(x => x.tick === 'W38');
/* 96px of plot: 40% → 38px, 75% → 72px. */
t('column heights are the win rates', w38.live === '38px' && w38.fwd === '72px', JSON.stringify(w38));
const w37 = slots.find(x => x.tick === 'W37');
t('a week with no live trades draws no live column', w37.live === null && w37.fwd !== null, JSON.stringify(w37));
const w39 = slots.find(x => x.tick === 'W39');
t('a week of all losses still draws a stub, not nothing', w39.fwd === '2px', JSON.stringify(w39));

await p.hover('.wk-slot:nth-child(8)'); await settle(200);   // W36
const tip = await text('.wk-tip');
t('hovering a column lists both series', /Week 36/.test(tip || '') && /Live/.test(tip) && /Forward test/.test(tip), tip);
t('and the tooltip is actually on screen', await seen('.wk-tip') === 'ok', await seen('.wk-tip'));
await p.hover('.wk-slot:nth-child(1)'); await settle(200);   // W29, before the first trade
t('a week before the first trade has nothing to say', await p.evaluate(() => document.querySelector('.wk-tip').hidden));
await p.mouse.move(5, 5);

await p.click('.wk-slot:nth-child(8)'); await settle();
t('clicking a column goes to that week', await header() === '31 Aug – 6 Sep', await header());
await p.click('.wk-slot:nth-child(1)', { force: true }); await settle();
t('clicking a week before the first trade goes nowhere', await header() === '31 Aug – 6 Sep', await header());

/* ---------- the edges ---------- */
await p.click('.wk-now'); await settle();
t('"This week" comes home', await header() === '28 Sep – 4 Oct', await header());
await p.keyboard.press('ArrowRight'); await settle();
t('the right arrow at the latest week does nothing', await header() === '28 Sep – 4 Oct', await header());
for (let i = 0; i < 12; i++) { await p.keyboard.press('ArrowLeft'); await settle(120); }
t('and going back stops at the first week traded', await header() === '10 – 16 Aug', await header());
t('with the back button switched off there', await p.evaluate(() => document.querySelector('.wk-step button:first-child').disabled));

/* The arrow keys are for stepping — not while you are typing. */
await p.evaluate(() => { const i = document.createElement('input'); i.id = 'probe'; document.querySelector('.wk-view').append(i); });
await p.focus('#probe');
await p.keyboard.press('ArrowRight'); await settle();
t('arrow keys inside a text field are left to the field', await header() === '10 – 16 Aug', await header());

/* ---------- weeks and months ---------- */
for (let i = 0; i < 5; i++) { await p.click('.wk-step button:last-child'); await settle(160); }
t('the header arrows step forward too', await header() === '14 – 20 Sep', await header());
await p.evaluate(() => [...document.querySelectorAll('.wk-controls .seg button')].find(b => b.textContent === 'Month').click());
await settle(400);
t('Month shows the month the week was in', await header() === 'Sep 2026', await header());
t('the strip turns into months', await text('.wk-strip h2') === 'Win rate by month' && await slotOn() === 'Sep');
L = await card('live');
const Fm = await card('forward');
/* Sep live: 1500 W, W38 2W 3L 1BE, 900 W → 4W 3L = 57%. Aug live: 4W 3L = 57% → level.
   Sep FT: 5W 4L = 55.6%. Aug FT: 2W 1L = 66.7% → −11 pts. */
t('September live win rate', L.hero === '57%', L.hero);
t('level with August', L.delta === 'level with last month', L.delta);
t('September forward tests, eleven points down on August', Fm.hero === '56%' && Fm.delta === '−11 pts vs last month', `${Fm.hero} ${Fm.delta}`);
t('no weekly target on a month', L.target === null, L.target);
const rows = await p.evaluate(() => [...document.querySelectorAll('.wk-break .wk-part')].map(x => x.textContent.trim()));
t('the month breaks into its weeks', rows.join('|') === 'W36 · 1 – 6 Sep|W37 · 7 – 13 Sep|W38 · 14 – 20 Sep|W39 · 21 – 27 Sep|W40 · 28 – 30 Sep', rows.join('|'));

await p.evaluate(() => [...document.querySelectorAll('.wk-controls .seg button')].find(b => b.textContent === 'Week').click());
await settle(400);
t('switching back to weeks returns to the week you left', await header() === '14 – 20 Sep', await header());

await p.evaluate(() => [...document.querySelectorAll('.wk-controls .seg button')].find(b => b.textContent === 'Month').click());
await settle(300);
await p.evaluate(() => [...document.querySelectorAll('.wk-break .wk-row')].find(r => r.textContent.includes('W37')).click());
await settle(400);
t('a week in the month opens that week', await header() === '7 – 13 Sep' && await text('.wk-controls .seg .is-on') === 'Week', await header());
L = await card('live');
t('a week of forward tests only says so on the live side', L.none === 'No live trades closed this week.', L.none);
t('and still reads the tests', (await card('forward')).hero === '33%', (await card('forward')).hero);

/* ---------- the week inside ---------- */
await p.keyboard.press('ArrowRight'); await settle();
const dayRows = await p.evaluate(() => [...document.querySelectorAll('.wk-break .wk-part')].map(x => x.textContent.trim()));
t('a week breaks into its days, the Saturday only because a test was taken on it',
  dayRows.join('|') === 'Mon 14 Sep|Tue 15 Sep|Wed 16 Sep|Thu 17 Sep|Fri 18 Sep|Sat 19 Sep', dayRows.join('|'));
const monday = await p.evaluate(() => [...document.querySelectorAll('.wk-break .wk-row')][0].innerText.replace(/\s+/g, ' ').trim());
t('Monday: two live losses, one forward test won', monday === 'Mon 14 Sep 2 0% −2.00R 1 100% +2.00R', monday);
const list = await p.evaluate(() => [...document.querySelectorAll('.wk-trades .wk-row')].map(r => r.innerText.replace(/\s+/g, ' ').trim()));
t('every trade of the week is listed', list.length === 10, list.length);
t('in the order they were taken', list[0].startsWith('14 Sep 15:00') && list[list.length - 1].startsWith('19 Sep 10:00'), list[0] + ' … ' + list[list.length - 1]);
t('a forward test says FT where the money would be', list.filter(r => r.endsWith('FT')).length === 4, list.filter(r => r.endsWith('FT')).length);
t('the cards are on screen and uncovered', await seen('.wk-card.wk-live .wk-hero .v') === 'ok' && await seen('.wk-card.wk-forward .wk-hero .v') === 'ok',
  await seen('.wk-card.wk-live .wk-hero .v'));
await p.evaluate(() => document.querySelectorAll('.wk-trades .wk-row')[2].click()); await settle(500);
t('clicking a trade opens it', /^#\/trade\//.test(await p.evaluate(() => location.hash)), await p.evaluate(() => location.hash));
await p.goBack(); await settle(500);

/* ---------- a trade with no risk set ---------- */
await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  store.trades.push({ id: 'NR', accountId: 'acc_1', date: '2026-09-16', timeOpen: '20:00', timeClose: '20:30', pair: 'XAUUSD',
    side: 'buy', netResult: 400, riskPercent: null, status: 'closed', mode: 'live', tagIds: [] });
  location.hash = '#/dashboard';
});
await settle(300);
await p.evaluate(() => { location.hash = '#/analytics'; }); await settle(500);
t('(still on week 38)', await header() === '14 – 20 Sep', await header());
t('a live trade with no risk leaves net R blank rather than short', await stat('live', 'Net R') === '—', await stat('live', 'Net R'));
t('and says why', /no risk set/.test(await text('.wk-card.wk-live') || ''));
t('the risk total says one trade is not in it', /1 trade with no risk set is not in it/.test(await text('.wk-risk') || ''), await text('.wk-risk .wk-foot'));

/* ---------- an account with nothing ---------- */
await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  for (const x of store.trades) x.accountId = 'elsewhere';
  location.hash = '#/dashboard';
});
await settle(300);
await p.evaluate(() => { location.hash = '#/analytics'; }); await settle(500);
t('an account with no trades says so, with no controls to step through', /Nothing logged yet/.test(await text('.view .empty') || '')
  && await p.evaluate(() => !document.querySelector('.wk-controls')));

await p.screenshot({ path: OUT + '/weekly.png' });
t('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
