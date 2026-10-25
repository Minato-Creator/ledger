import pw from 'playwright';
import fsx from 'node:fs';
import { pickColour } from './lookhelp.mjs';
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
/* Mid-month, so the three trades a few days back all land in the month the
   calendar opens on. */
const NOW = new Date('2026-09-20T10:00:00');
await p.clock.setFixedTime(NOW);
await p.goto(APP, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });
let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};
const has=(n,g,sub)=>{const good=String(g).includes(sub); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}`);};

// account + a winning and a losing trade so every surface has something to paint
await p.locator('.main input[placeholder="Swing account"]').fill('Main');
await p.locator('.main input[inputmode="decimal"]').first().fill('100000');
await p.evaluate(() => [...document.querySelectorAll('.main .btn-primary')].find(x=>/Create account/.test(x.textContent)).click());
await p.waitForTimeout(400);
const today = NOW;
const dayBack = n => new Date(today.getTime() - n * 864e5).toISOString().slice(0, 10);
for (const [amt, sign, back] of [['2500','win',4], ['900','loss',3], ['1800','win',1]]) {
  await p.evaluate(() => { location.hash = '#/new'; }); await p.waitForTimeout(350);
  await p.locator('.main input').first().fill('XAUUSD');
  await p.locator('.main input[placeholder="0.00"]').fill(amt);
  await p.locator('.main input[type="date"]').fill(dayBack(back));
  if (sign === 'loss') await p.evaluate(() =>
    [...document.querySelectorAll('.main button')].find(x => x.textContent.trim() === 'Loss').click());
  await p.waitForTimeout(200);
  await p.evaluate(() => [...document.querySelectorAll('.main button')].find(x=>/^Save/.test(x.textContent.trim())).click());
  await p.waitForTimeout(450);
}

// -- does var() even resolve inside SVG attributes? ------------------------
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(600);
const css = n => n ? getComputedStyle(n) : null;
const before = await p.evaluate(() => {
  const g = s => { const n = document.querySelector(s); return n ? getComputedStyle(n) : null; };
  return { stroke: g('.main .line-draw')?.stroke ?? 'no line',
           stop: g('.main stop')?.stopColor ?? 'no gradient' };
});
console.log('  default:', JSON.stringify(before));
has('the equity line resolves a variable at all', before.stroke, 'rgb(');

// -- change profit to cyan, loss to amber ---------------------------------
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(450);
await pickColour(p, 'profit', 'Purple');
await pickColour(p, 'loss', 'Orange');

await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(700);
const after = await p.evaluate(() => {
  const line = document.querySelector('.main .line-draw');
  const swatches = [...document.querySelectorAll('.main .card span')].map(n => getComputedStyle(n).backgroundColor);
  return { stroke: getComputedStyle(line).stroke,
           area: getComputedStyle(document.querySelector('.main .line-area')).fill,
           stop: getComputedStyle(document.querySelector('.main stop')).stopColor,
           band: (() => { const n = document.querySelector('.main .db-meta b.is-neg'); return n ? getComputedStyle(n).color : 'no drawdown figure'; })(),
           // a loss in the last-trades strip
           ddSwatch: (() => { const n = document.querySelector('.main .db-tape .l');
             return n ? getComputedStyle(n).backgroundColor : 'not found'; })() };
});
console.log('  after   :', JSON.stringify(after));
ok('the equity line takes the new colour', after.stroke, 'rgb(124, 92, 255)');
ok('the gradient under it follows', after.stop, 'rgb(124, 92, 255)');
has('the max drawdown figure uses the loss colour', after.band, '249, 115, 22');
has('and so does a loss in the last-trades strip', after.ddSwatch, '249, 115, 22');

// -- calendar --------------------------------------------------------------
await p.evaluate(() => { location.hash = '#/calendar'; }); await p.waitForTimeout(700);
const cal = await p.evaluate(() => {
  const cells = [...document.querySelectorAll('.cal-grid button')].map(n => getComputedStyle(n).backgroundColor);
  const legend = [...document.querySelectorAll('.main span')].map(n => getComputedStyle(n).backgroundColor);
  const week = [...document.querySelectorAll('.main .bar-fill')].map(n => getComputedStyle(n).backgroundColor);
  return { green: cells.some(c => /124, 92, 255/.test(c)), red: cells.some(c => /249, 115, 22/.test(c)),
           legendGreen: legend.some(c => /124, 92, 255/.test(c)), legendRed: legend.some(c => /249, 115, 22/.test(c)),
           weekBar: week.some(c => /124, 92, 255/.test(c)) };
});
console.log('  calendar:', JSON.stringify(cal));
ok('winning days take the new profit colour', cal.green, true);
ok('losing days take the new loss colour', cal.red, true);
ok('the legend gradient follows', cal.legendGreen && cal.legendRed, true);
ok('and the by-week bars', cal.weekBar, true);

// -- new trade direction ---------------------------------------------------
await p.evaluate(() => { location.hash = '#/new'; }); await p.waitForTimeout(600);
const dir = await p.evaluate(() => {
  const btns = [...document.querySelectorAll('.main button')].filter(b => /Long|Short/.test(b.textContent));
  const longBg = getComputedStyle(btns[0]).backgroundColor;
  btns[1].click();
  return { longBg, shortBg: getComputedStyle(btns[1]).backgroundColor };
});
console.log('  direction:', JSON.stringify(dir));
has('Long uses the profit colour', dir.longBg, '124, 92, 255');
await p.waitForTimeout(200);
has('Short uses the loss colour', await p.evaluate(() =>
  getComputedStyle([...document.querySelectorAll('.main button')].find(b=>/Short/.test(b.textContent))).backgroundColor), '249, 115, 22');

ok('no errors', errs.length, 0);
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
