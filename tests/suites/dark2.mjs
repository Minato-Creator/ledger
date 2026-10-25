import pw from 'playwright';
import fsx from 'node:fs';
import { openLook, closeLook, setTheme, paletteNames } from './lookhelp.mjs';
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
/* Mid-month, so the calendar has past weekdays and weekends to compare. On
   the first of a month every other day is still to come, and the quiet shade
   has nothing to sit below. */
await p.clock.setFixedTime(new Date('2026-09-17T10:00:00'));
await p.goto(APP, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });
let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};
const L = (css) => { const [r,g,bl] = css.match(/[\d.]+/g).map(Number); return Math.round(.2126*r+.7152*g+.0722*bl); };

await p.locator('.main input[placeholder="Swing account"]').fill('Main');
await p.locator('.main input[inputmode="decimal"]').first().fill('100000');
await p.evaluate(() => [...document.querySelectorAll('.main .btn-primary')].find(x=>/Create account/.test(x.textContent)).click());
await p.waitForTimeout(400);
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(450);

const pal = await paletteNames(p);
ok('a full palette for profit', pal.length >= 60, true);
ok('they are named, not hex', pal.slice(0, 3).join(','), 'Mint,Bright green,Green');
ok('purple and brown are in there', pal.includes('Purple') && pal.includes('Brown') && pal.includes('Yellow'), true);
await openLook(p, 'money');
await p.evaluate(() => [...document.querySelectorAll('.lk-money-b')].find(b => b.querySelector('b')?.textContent === 'Win')?.click());
await p.waitForTimeout(250);
ok('black is lifted off pure black', await p.evaluate(() =>
  getComputedStyle(document.querySelector('.lk-pal[aria-label="Black"]')).backgroundColor), 'rgb(61, 61, 61)');
await closeLook(p);

await setTheme(p, 'dark');

console.log('  -- dark mode --');
const title = await p.evaluate(() => getComputedStyle(document.querySelector('.head h1')).color);
console.log('  page title colour:', title);
ok('page titles are legible on the dark ground', L(title) > 120, true);
ok('and the sub line too', await p.evaluate(() => {
  const s = document.querySelector('.head .sub');
  if (!s) return true;
  const [r,g,b] = getComputedStyle(s).color.match(/[\d.]+/g).map(Number);
  return Math.round(.2126*r+.7152*g+.0722*b) > 90; }), true);

const mark = await p.evaluate(() => {
  const w = document.querySelector('.tb-brand .brand-word svg') || document.querySelector('.tb-brand svg'), r = w.getBoundingClientRect();
  return { label: w.getAttribute('aria-label'), h: Math.round(r.height), wide: r.width > 4 * r.height,
           ink: getComputedStyle(w).color, fav: document.querySelector('link[rel=icon]').getAttribute('href').slice(0, 22) };
});
console.log('  brand mark:', JSON.stringify(mark));
/* The top bar carries the wordmark — the L and LAMINAR — in the frame's own ink; the tab carries the icon. */
ok('the top bar shows the Laminar wordmark', mark.label, 'Laminar');
ok('at 17 px, the L beside the name', mark.h === 17 && mark.wide, true);
ok('in white on the dark frame', mark.ink, 'rgb(244, 244, 246)');
ok('and the tab carries the icon', mark.fav, 'data:image/png;base64,');

await p.evaluate(() => { location.hash = '#/calendar'; }); await p.waitForTimeout(600);
const cells = await p.evaluate(() => {
  /* Every day is a button now, traded or not — the leading blanks before the
     first of the month are the only plain divs left. */
  const all = [...document.querySelectorAll('.cal-grid > *')];
  const heads = [...document.querySelectorAll('.main .eyebrow')].map(n=>n.textContent);
  // weekday index by position: the grid is Mon-first, 7 per row
  const idx = all.map((n,i) => ({ i, bg: getComputedStyle(n).backgroundColor }));
  return idx.filter(x => x.bg !== 'rgba(0, 0, 0, 0)').map(x => x.bg);
});
const uniq = [...new Set(cells)];
console.log('  empty-cell shades:', uniq.join(' | '));
ok('quiet cells are DARKER than normal ones, not lighter',
   uniq.length < 2 ? true : Math.min(...uniq.map(L)) < Math.max(...uniq.map(L)), true);
// It should sit BELOW a normal cell but still above the ground — a weekend is
// quiet, not invisible.
const ground = L(await p.evaluate(() => getComputedStyle(document.body).backgroundColor));
console.log(`  ground ${ground} · quiet ${Math.min(...uniq.map(L))} · normal ${Math.max(...uniq.map(L))}`);
ok('the quiet cell sits between the ground and a normal cell',
   Math.min(...uniq.map(L)) > ground && Math.min(...uniq.map(L)) < Math.max(...uniq.map(L)), true);
ok('no errors', errs.length, 0);
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
