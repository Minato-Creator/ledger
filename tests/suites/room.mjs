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
await p.goto(APP, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });
await p.locator('.main input[placeholder="Swing account"]').fill('Main');
await p.locator('.main input[inputmode="decimal"]').first().fill('100000');
await p.evaluate(() => [...document.querySelectorAll('.main .btn-primary')].find(x=>/Create account/.test(x.textContent)).click());
await p.waitForTimeout(500);
await p.evaluate(() => { location.hash = '#/new'; });
await p.waitForTimeout(500);
let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};
const m = await p.evaluate(() => {
  const card = document.querySelector('.main .card.roomy');
  const f = card.querySelector('.field');
  const r = card.getBoundingClientRect();
  const dir = card.querySelector('.dir');
  return { fieldH: Math.round(f.getBoundingClientRect().height),
           pad: getComputedStyle(card).padding, gap: getComputedStyle(card).gap,
           w: Math.round(r.width), bottom: Math.round(r.bottom), vh: window.innerHeight,
           dirH: dir ? Math.round(dir.getBoundingClientRect().height) : 0,
           overflow: document.body.scrollWidth > window.innerWidth };
});
console.log(' ', JSON.stringify(m));
ok('fields are taller', m.fieldH, 46);
ok('direction buttons match them', m.dirH, 46);
// The form is a two-column grid now, laid out in CSS so a short screen can
// tighten it; the numbers below are the roomy (tall-screen) values.
ok('the card has more padding', await p.evaluate(() => {
  const c = document.querySelector('.card.roomy');
  return getComputedStyle(c).padding;
}), '26px 30px');
ok('and more air between rows', await p.evaluate(() => {
  const c = document.querySelector('.card.roomy');
  return getComputedStyle(c).rowGap;
}), '30px');
ok('it still fits the window', m.bottom <= m.vh, true);
ok('nothing spills sideways', m.overflow, false);
ok('no errors', errs.length, 0);
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
