import pw from 'playwright';
import fsx from 'node:fs';
import { firstAccount } from '../first.mjs';
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
await p.goto(APP, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });
let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};
/* The welcome has nothing to fill in any more, so the controls are read on the trade form. */
await firstAccount(p, 'Main', '100000');
await p.evaluate(() => { location.hash = '#/new'; }); await p.waitForTimeout(600);

const geo = await p.evaluate(() => {
  const date = document.querySelector('.main input[type="date"]');
  const sel  = document.querySelector('.main select.field');
  const cs   = getComputedStyle(sel);
  const dr = date.getBoundingClientRect();
  return {
    dateColorScheme: getComputedStyle(date).colorScheme,
    selAppearance: cs.appearance,
    selPadRight: cs.paddingRight,
    selArrowPos: cs.backgroundPosition,
    selHasArrow: cs.backgroundImage.includes('svg'),
    dateWidth: Math.round(dr.width),
  };
});
console.log(' ', JSON.stringify(geo));
/* A new journal opens on Midnight, so the browser's own date picker is drawn dark too. */
ok('the date control follows the look', geo.dateColorScheme, 'dark');
ok('select uses our own arrow', geo.selAppearance, 'none');
ok('with room for it', geo.selPadRight, '36px');
ok('sat in from the right edge', /14px/.test(geo.selArrowPos), true);
ok('and the arrow is actually drawn', geo.selHasArrow, true);
ok('page still fine', errs.length, 0);
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
