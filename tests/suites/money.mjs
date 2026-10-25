/* Typing money the way people actually type it, through the real forms. */
import pw from 'playwright';
import fs from 'node:fs';
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

const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
const errors = [];
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.addInitScript(FAKE_FS);
await page.goto('http://127.0.0.1:8777/index.html', { waitUntil:'domcontentloaded' });
// A newcomer is no longer stopped by a folder gate — the app opens on the
// welcome form and saves into this browser until a folder is chosen.
await page.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });

let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};

const balanceField = '.main input[inputmode="decimal"]';
const typeBalance = async v => {
  await page.evaluate(() => { location.hash = '#/accounts'; });
  await page.waitForTimeout(300);
  await page.fill(balanceField, v);
  await page.waitForTimeout(180);
  return page.evaluate(() => {
    const f = document.querySelector('.main input[inputmode="decimal"]');
    return f.parentElement.querySelector('.m')?.textContent.trim() || '';
  });
};

console.log('  -- the balance field echoes what it read --');
for (const [typed, want] of [['25000','$25,000'], ['25 000','$25,000'], ['$25000','$25,000'],
                             ['$25 000','$25,000'], ['25,000','$25,000'], ['  25 000  ','$25,000'],
                             ['50,000.50','$50,001'], ['banana','Not a number yet']]) {
  const echo = await typeBalance(typed);
  const good = echo.startsWith(want);
  good ? pass++ : fail++;
  console.log(`  ${good?'ok  ':'FAIL'}  "${typed}" -> ${echo || '(blank)'}${good?'':'   want '+want}`);
}

// and it really creates the account with that number
await page.evaluate(() => { location.hash = '#/accounts'; });
await page.waitForTimeout(300);
await page.fill('.main input[placeholder="Swing account"]', 'Spaced funded');
await page.fill(balanceField, '$25 000');
await page.evaluate(() => [...document.querySelectorAll('.main .btn-primary')].find(b=>/Create account/.test(b.textContent)).click());
await page.waitForTimeout(600);
const acct = await page.evaluate(() => {
  // With no folder chosen the journal lives in this browser, not in the fake
  // filesystem; read whichever one is actually holding it.
  const raw = localStorage.getItem('ledger:file:data/accounts.json')
    || new Map(JSON.parse(localStorage.getItem('fakefs') || '[]')).get('data/accounts.json');
  const a = JSON.parse(raw);
  const x = a.accounts.find(y => y.name === 'Spaced funded');
  return x ? { bal: x.startingBalance, type: typeof x.startingBalance, risk: x.defaultRiskPercent } : null;
});
ok('"$25 000" creates a 25000 account', acct && acct.bal, 25000);
ok('stored as a real number, not a string', acct && acct.type, 'number');
ok('and the risk % came through', acct && acct.risk, 1);

// the trade form takes the same liberties
await page.evaluate(() => { location.hash = '#/new'; });
await page.waitForTimeout(400);
await page.fill('.main input[placeholder="XAUUSD"]', 'XAUUSD').catch(async () => {
  await page.evaluate(() => { const i = document.querySelector('.main input'); i.value = 'XAUUSD'; i.dispatchEvent(new Event('input', {bubbles:true})); });
});
const resultField = () => page.$('.main input[placeholder="0.00"]');
const setResult = async v => { const f = await resultField(); await f.fill(v); await page.waitForTimeout(200);
  return page.evaluate(() => document.querySelector('.main .kpi-val')?.textContent.trim()); };
console.log('  -- the trade result field --');
ok('"1 731.60" reads as money', await setResult('1 731.60'), '+$1,731.60');
ok('"$1,731.60" too', await setResult('$1,731.60'), '+$1,731.60');
ok('"(750)" is read as 750', await setResult('(750)'), '+$750.00');
await setResult('zzz');
ok('and rubbish says so rather than going quiet', await page.evaluate(() =>
  /Cannot read that as an amount/.test(document.querySelector('.main').innerText)), true);
ok('with save disabled', await page.evaluate(() =>
  [...document.querySelectorAll('.main button')].some(b => /Save/.test(b.textContent) && b.disabled)), true);
await setResult('1 500');
ok('and it recovers when the number is readable', await page.evaluate(() =>
  [...document.querySelectorAll('.main button')].some(b => /Save/.test(b.textContent) && !b.disabled)), true);

console.log(errors.length ? '\nERRORS:\n  '+errors.join('\n  ') : '\nno console/page errors');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
