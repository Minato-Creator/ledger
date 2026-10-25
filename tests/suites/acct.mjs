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
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.goto(APP, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });
let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};

// first run
ok('first run shows the welcome', await p.evaluate(() => /Welcome to Laminar/.test(document.querySelector('.main').innerText)), true);
ok('and no account list', await p.evaluate(() => /Your accounts/.test(document.querySelector('.main').innerText)), false);
const box = await p.evaluate(() => { const c = document.querySelector('.main .card').getBoundingClientRect();
  return { w: Math.round(c.width), h: Math.round(c.height), centred: Math.abs((c.left + c.right)/2 - window.innerWidth/2 - 120) < 40 }; });
console.log('  form card:', JSON.stringify(box));
ok('the form is a contained box, not the page', box.w, 540);
ok('and does not run the full height', box.h < 620, true);

// create one
await p.locator('.main input[placeholder="Swing account"]').fill('Main funded');
await p.locator('.main input[inputmode="decimal"]').first().fill('$100 000');
await p.evaluate(() => [...document.querySelectorAll('.main .btn-primary')].find(x=>/Create account/.test(x.textContent)).click());
await p.waitForTimeout(500);
await p.evaluate(() => { location.hash = '#/settings/accounts'; });
await p.waitForTimeout(450);

/* Accounts live in one place now: Settings → Accounts. */
const listed = () => p.evaluate(() => [...document.querySelectorAll('.main .card input')].some(i => i.value === 'Main funded'));
ok('now the list shows', await listed(), true);
ok('the form is tucked away behind a button', await p.evaluate(() =>
  [...document.querySelectorAll('.main button')].some(x => /New account/.test(x.textContent))
  && !document.querySelector('.main input[placeholder="Swing account"]')), true);
const listBox = await p.evaluate(() => { const r = document.querySelector('.main .card').getBoundingClientRect();
  return { h: Math.round(r.height), bottom: Math.round(r.bottom), viewport: window.innerHeight }; });
console.log('  list card:', JSON.stringify(listBox));
ok('the list hugs one account instead of filling the screen', listBox.h < 330, true);
ok('so it stops well short of the bottom', listBox.bottom < listBox.viewport - 300, true);

// it opens on demand
await p.evaluate(() => [...document.querySelectorAll('.main button')].find(x=>/New account/.test(x.textContent)).click());
await p.waitForTimeout(300);
ok('clicking New account reveals the form', await p.evaluate(() =>
  !!document.querySelector('.main input[placeholder="Swing account"]')), true);
await p.evaluate(() => { location.hash = '#/accounts'; }); await p.waitForTimeout(450);
ok('and #/accounts is the same page with the form already open', await p.evaluate(() =>
  !!document.querySelector('.main input[placeholder="Swing account"]')) && await listed(), true);

// many accounts should scroll, not stretch
await p.evaluate(async () => {
  const { store } = window.__ledger || {};
});
console.log(errs.length ? '\nERRORS:\n  ' + errs.join('\n  ') : '\nno page errors');
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
