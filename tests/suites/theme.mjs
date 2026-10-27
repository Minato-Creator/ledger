import pw from 'playwright';
import fsx from 'node:fs';
import { openLook, closeLook, setTheme } from './lookhelp.mjs';
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
let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};

// seed a trade so the analytics light cards have real content to check
await p.locator('.main input[placeholder="Swing account"]').fill('Main');
await p.locator('.main input[inputmode="decimal"]').first().fill('100000');
await p.evaluate(() => [...document.querySelectorAll('.main .btn-primary')].find(x=>/Create account/.test(x.textContent)).click());
await p.waitForTimeout(400);
await p.evaluate(() => { location.hash = '#/new'; }); await p.waitForTimeout(400);
await p.locator('.main input').first().fill('XAUUSD');
await p.locator('.main input[placeholder="0.00"]').fill('1500');
await p.evaluate(() => [...document.querySelectorAll('.main button')].find(x=>/Save/.test(x.textContent)).click());
await p.waitForTimeout(500);

const lum = sel => p.evaluate(s => {
  const n = document.querySelector(s); if (!n) return null;
  const [r,g,bl] = getComputedStyle(n).backgroundColor.match(/[\d.]+/g).map(Number);
  return Math.round(0.2126*r + 0.7152*g + 0.0722*bl);
}, sel);
const ink = sel => p.evaluate(s => {
  const n = document.querySelector(s); if (!n) return null;
  const [r,g,bl] = getComputedStyle(n).color.match(/[\d.]+/g).map(Number);
  return Math.round(0.2126*r + 0.7152*g + 0.0722*bl);
}, sel);

await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(400);
await openLook(p, 'themes');
ok('the themes are there', await p.evaluate(() => document.querySelectorAll('.lk-theme').length), 5);
ok('light is on by default', await p.evaluate(() => document.querySelector('.lk-theme.is-on')?.dataset.themeId), 'light');
await closeLook(p);
const groundLight = await lum('body');
console.log('  light ground luminance:', groundLight);

await setTheme(p, 'dark');
ok('the attribute flips', await p.evaluate(() => document.documentElement.dataset.theme), 'dark');
const groundDark = await lum('body');
console.log('  dark ground luminance:', groundDark);
ok('the ground actually goes dark', groundDark < 30, true);
ok('and it is darker than the cards, so cards still read as raised',
   groundDark < await lum('.main .card'), true);

// the pale cards are the risky ones — dark text on a now-dark panel
await p.evaluate(() => { location.hash = '#/analytics'; }); await p.waitForTimeout(500);
/* Overview is all dark chart cards now; Discipline still carries a pale one. */
await p.evaluate(() => [...document.querySelectorAll('.head :is(.seg, .an-tabs) button')].find(b => b.textContent.trim() === 'Discipline')?.click());
await p.waitForTimeout(500);
const lightCardBg = await lum('.main .card.light');
const lightCardInk = await p.evaluate(() => {
  const c = document.querySelector('.main .card.light');
  const n = [...c.querySelectorAll('*')].find(x => x.textContent.trim() && x.children.length === 0);
  const [r,g,b] = getComputedStyle(n).color.match(/[\d.]+/g).map(Number);
  return Math.round(0.2126*r + 0.7152*g + 0.0722*b);
});
console.log(`  pale card in dark: bg ${lightCardBg}, ink ${lightCardInk}`);
ok('the pale card went dark too', lightCardBg < 60, true);
ok('and its text turned pale, so it is still readable', lightCardInk > 120, true);
ok('with real contrast between them', lightCardInk - lightCardBg > 80, true);

// green and red must survive the flip
const posInk = await p.evaluate(() => {
  const n = [...document.querySelectorAll('.main .card.light .pos, .main .card.light [style*="pos-light"]')][0];
  return n ? getComputedStyle(n).color : 'none';
});
console.log('  positive on pale card:', posInk);

await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(400);
ok('the dashboard survives', await p.evaluate(() => /net p&l/i.test(document.querySelector('.main').innerText)), true);
ok('body ink is pale now', await ink('body') > 120, true);

// it must stick
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });
ok('dark survives a reload', await p.evaluate(() => document.documentElement.dataset.theme), 'dark');
ok('and is written to disk', await p.evaluate(() =>
  JSON.parse(localStorage.getItem('ledger:file:data/accounts.json')).theme), 'dark');

// and back
await setTheme(p, 'light');
ok('back to light', await p.evaluate(() => document.documentElement.dataset.theme), 'light');
ok('and the ground is the light frame again', await lum('body'), groundLight);
ok('no errors', errs.length, 0);
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
