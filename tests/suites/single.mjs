/* The bundled file, opened the way a friend would open it: double-clicked.
   No server, no stubs — real localStorage, real file:// origin. */
import pw from 'playwright';
import fsx from 'node:fs';
/* ---- where this suite finds things ----------------------------------
   Paths are worked out from this file rather than typed in, so the suite
   runs from wherever the repository happens to sit. The browser is
   Playwright's own unless QUIRE_CHROMIUM names another; screenshots go to
   a scratch folder outside the repository. */
const HERE = new URL('.', import.meta.url).pathname;
const ROOT = new URL('../../', import.meta.url).pathname;
const FIX  = HERE + '../fixtures';
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const APP = 'file://' + ROOT + 'Laminar.html';
fsx.mkdirSync(OUT, { recursive: true });

const { chromium } = pw;

const FILE = APP;

const errors = [];
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|TUNNEL|ERR_/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto(FILE, { waitUntil: 'domcontentloaded' });

let pass = 0, fail = 0;
const ok = (n, g, w) => { const good = String(g) === String(w); good ? pass++ : fail++;
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${n}  got=${g}${good ? '' : `  want=${w}`}`); };

console.log('  -- it opens at all --');
// First run has no sidebar by design — the welcome form is the whole window.
await page.waitForSelector('.welcome-title, .topbar', { timeout: 8000 }).catch(() => {});
ok('no CORS failure, the app booted', await page.evaluate(() =>
  !!document.querySelector('.welcome-title') || !!document.querySelector('.topbar')), true);
ok('no gate — nothing to pick', await page.evaluate(() => !document.querySelector('.gate')), true);
// The sidebar no longer names a non-place; Settings is where it says so.
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForTimeout(350);
ok('it knows it is on browser storage', await page.evaluate(() =>
  /saved inside this browser/.test(document.querySelector('.main').innerText)), true);
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForTimeout(300);
ok('the stylesheet came with it', await page.evaluate(() => {
  const n = document.querySelector('.topbar') || document.querySelector('.card');
  return n ? getComputedStyle(n).borderRadius !== '0px' : 'nothing drawn';
}), true);

console.log('  -- a real trade, end to end --');
await page.locator('.main input[placeholder="Swing account"]').fill('Mate’s account');
await page.locator('.main input[inputmode="decimal"]').first().fill('$50 000');
await page.locator('.field[inputmode="decimal"]').nth(1).fill('1');
await page.evaluate(() => [...document.querySelectorAll('.main .btn-primary')].find(b => /Create account/.test(b.textContent)).click());
await page.waitForTimeout(500);
ok('the account saved', await page.evaluate(() =>
  JSON.parse(localStorage.getItem('ledger:file:data/accounts.json')).accounts[0].startingBalance), 50000);

await page.evaluate(() => { location.hash = '#/new'; });
await page.waitForTimeout(400);
await page.locator('.main input').first().fill('XAUUSD');
await page.locator('.main input[placeholder="0.00"]').fill('1 250');
await page.waitForTimeout(250);
ok('R computes', await page.evaluate(() => document.querySelector('.main .kpi-val')?.textContent.trim()), '+$1,250.00');
await page.evaluate(() => [...document.querySelectorAll('.main button')].find(b => /Save/.test(b.textContent)).click());
await page.waitForTimeout(500);
ok('the trade is stored', await page.evaluate(() =>
  JSON.parse(localStorage.getItem('ledger:file:data/trades.json')).trades.length), 1);
ok('replay keeps its own path as a name', await page.evaluate(() =>
  localStorage.getItem('ledger:file:data/replay.json') != null), true);

console.log('  -- it survives being closed and reopened --');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });
ok('the account came back', await page.evaluate(() => document.querySelector('.acct-name')?.textContent), 'Mate’s account');
ok('and the trade', await page.evaluate(() => document.querySelector('.tb-tab .count')?.textContent), '1');

console.log('  -- every screen --');
for (const [hash, name] of [['#/', 'dashboard'], ['#/trades', 'trades'], ['#/calendar', 'calendar'],
                            ['#/analytics', 'analytics'], ['#/replay', 'replay'], ['#/playbook', 'playbook'],
                            ['#/settings', 'settings'], ['#/new', 'new trade']]) {
  const before = errors.length;
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(320);
  const txt = await page.evaluate(() => document.querySelector('.main')?.innerText.trim() || '');
  const good = errors.length === before && txt.length > 15;
  good ? pass++ : fail++;
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${name}${good ? '' : '  ' + (errors.slice(before).join(' | ') || 'BLANK')}`);
}

console.log('  -- the module scopes really are separate --');
// dashboard.js and analytics.js both define withinPeriod(); flattening them
// would make one silently win. Both pages filter by period, so both work only
// if the wrapping held.
await page.evaluate(() => { location.hash = '#/analytics'; });
await page.waitForTimeout(400);
ok('analytics has its own period filter', await page.evaluate(() =>
  [...document.querySelectorAll('.seg button')].some(b => b.textContent.trim() === '90D')), true);
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForTimeout(400);
ok('so does the dashboard', await page.evaluate(() =>
  [...document.querySelectorAll('.seg button')].some(b => b.textContent.trim() === '90D')), true);

console.log('  -- the newest pages came with it --');
{
  const before = errors.length;
  await page.evaluate(() => { location.hash = '#/analytics'; });
  await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll('.head :is(.seg, .an-tabs) button')].find(b => /Weekly winrate/.test(b.textContent)).click());
  await page.waitForTimeout(400);
  ok('Weekly winrate draws in the single file', await page.evaluate(() => !!document.querySelector('.wk-view .wk-card')), true);
  await page.evaluate(() => { location.hash = '#/lab'; });
  await page.waitForTimeout(400);
  ok('The Lab opens on its Monte Carlo in the single file', await page.evaluate(() =>
    !!document.querySelector('.lab-view .mc-controls') && document.querySelector('.head .sn-tab.is-on')?.textContent === 'Monte Carlo'), true);
  await page.evaluate(() => { location.hash = '#/lab/prop'; });
  await page.waitForTimeout(400);
  ok('and its prop firm page draws too', await page.evaluate(() =>
    /No firm yet/.test(document.querySelector('.lab-view')?.innerText || '')), true);
  await page.evaluate(() => { location.hash = '#/lab/rules'; });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.lab-new').click());
  await page.waitForTimeout(300);
  ok('and its rule sheet saves to this browser', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('ledger:file:data/lab.json') || '{}').firms?.length), 1);
  ok('without a single error', errors.length, before);
}

console.log('  -- the warning is shown, not buried --');
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForTimeout(400);
ok('settings says where the data lives', await page.evaluate(() =>
  /saved inside this browser/.test(document.querySelector('.main').innerText)), true);
await page.screenshot({ path: OUT + '/shot-single.png' });

console.log('  -- export still works, which is the way out --');
const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await page.evaluate(() => [...document.querySelectorAll('.main button')].find(b => /Trades as a spreadsheet/.test(b.textContent)).click());
const f = await dl;
ok('a CSV downloads', /\.csv$/.test(f?.suggestedFilename() || ''), true);

console.log(errors.length ? '\nERRORS:\n  ' + errors.join('\n  ') : '\nno console/page errors');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
