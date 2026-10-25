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
const b = await chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.goto(APP, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });
let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};
const cta = () => p.locator('.main .btn-primary');
const cls = () => p.evaluate(() => document.querySelector('.main .btn-primary').className);
const missing = () => p.evaluate(() => document.querySelectorAll('.main .field.is-missing').length);
const note = () => p.evaluate(() => document.querySelector('.main .missing-note')?.textContent.trim());

ok('the tagline reads right', await p.evaluate(() => /Your edge, in writing\./.test(document.querySelector('.main').innerText)), true);

console.log('  -- before anything is typed --');
ok('the button is inert, not blue', (await cls()).includes('is-waiting'), true);
ok('nothing is flagged red yet', await missing(), 0);
ok('and nothing is being nagged about', await note(), '');

console.log('  -- pressing it early --');
await cta().click(); await p.waitForTimeout(120);
ok('it refuses', (await cls()).includes('is-refused'), true);
ok('both empty fields turn red', await missing(), 2);
ok('and it says what it wants', await note(), 'Needs a name and a starting balance');
ok('focus jumps to the first one', await p.evaluate(() => document.activeElement?.placeholder), 'Swing account');
await p.waitForTimeout(1000);
ok('the refusal fades on its own', (await cls()).includes('is-refused'), false);
ok('but the red fields stay until fixed', await missing(), 2);

console.log('  -- filling it in --');
await p.locator('.main input[placeholder="Swing account"]').fill('Main funded');
await p.waitForTimeout(120);
ok('the name clears its own flag', await missing(), 1);
ok('the note narrows to what is left', await note(), 'Needs a starting balance');
ok('still inert — the balance is missing', (await cls()).includes('is-waiting'), true);

await p.locator('.main input[inputmode="decimal"]').first().fill('$100 000');
await p.waitForTimeout(150);
ok('now it goes live', (await cls()).includes('is-waiting'), false);
ok('no red left', await missing(), 0);
ok('and the nagging stops', await note(), '');

console.log('  -- a balance that is not a number --');
await p.locator('.main input[inputmode="decimal"]').first().fill('abc');
await p.waitForTimeout(150);
ok('goes inert again', (await cls()).includes('is-waiting'), true);
await cta().click(); await p.waitForTimeout(120);
ok('and refuses, naming the balance', await note(), 'Needs a starting balance');

console.log('  -- and it still creates the account --');
await p.locator('.main input[inputmode="decimal"]').first().fill('$100 000');
await p.waitForTimeout(150);
await cta().click(); await p.waitForTimeout(600);
ok('the account exists', await p.evaluate(() =>
  JSON.parse(localStorage.getItem('ledger:file:data/accounts.json')).accounts[0].name), 'Main funded');
ok('with the spaced amount read correctly', await p.evaluate(() =>
  JSON.parse(localStorage.getItem('ledger:file:data/accounts.json')).accounts[0].startingBalance), 100000);

console.log(errs.length ? '\nERRORS:\n  ' + errs.join('\n  ') : '\nno page errors');
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
