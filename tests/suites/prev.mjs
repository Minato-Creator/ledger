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
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};
const open = async f => { await p.goto('file://' + ROOT + f, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('.welcome-title, .topbar', { timeout: 8000 }); };

// Fill the REAL build first, so there is saved data sitting in localStorage.
await open('Laminar.html');
await p.locator('.main input[placeholder="Swing account"]').fill('Real account');
await p.locator('.main input[inputmode="decimal"]').first().fill('100000');
await p.evaluate(() => [...document.querySelectorAll('.main .btn-primary')].find(x=>/Create account/.test(x.textContent)).click());
await p.waitForTimeout(500);
ok('the real build saved an account', await p.evaluate(() => !!localStorage.getItem('ledger:file:data/accounts.json')), true);

// The preview shares the same file:// origin, so this is the real test.
await open('Laminar-preview.html');
ok('preview opens on the welcome screen anyway', await p.evaluate(() => /Set up your first account/.test(document.querySelector('.main').innerText)), true);
ok('it does not see the saved account', await p.evaluate(() => /Real account/.test(document.body.innerText)), false);
ok('and it says it is a preview', await p.evaluate(() => document.title), 'Laminar — preview');

await p.locator('.main input[placeholder="Swing account"]').fill('Throwaway');
await p.locator('.main input[inputmode="decimal"]').first().fill('5000');
await p.evaluate(() => [...document.querySelectorAll('.main .btn-primary')].find(x=>/Create account/.test(x.textContent)).click());
await p.waitForTimeout(500);
ok('you can still use it', await p.evaluate(() => document.querySelector('.acct-name')?.textContent), 'Throwaway');
ok('but it writes nothing to storage', await p.evaluate(() =>
  Object.keys(localStorage).some(k => k.startsWith('ledger:') && localStorage.getItem(k).includes('Throwaway'))), false);
await p.evaluate(() => { location.hash = '#/settings'; });
await p.waitForTimeout(350);
ok('settings says so', await p.evaluate(() => /preview copy/.test(document.querySelector('.main').innerText)), true);

await open('Laminar-preview.html');
ok('reopening is fresh again', await p.evaluate(() => /Set up your first account/.test(document.querySelector('.main').innerText)), true);

await open('Laminar.html');
ok('and the real build still has its account', await p.evaluate(() => document.querySelector('.acct-name')?.textContent), 'Real account');
ok('no errors', errs.length, 0);
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
