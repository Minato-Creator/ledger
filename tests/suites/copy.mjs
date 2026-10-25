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
let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};
const page = () => p.evaluate(() => document.body.innerText);
ok('the "all it needs" line is gone', /all it needs/.test(await page()), false);
ok('the "just a label" line is gone', /just a label/.test(await page()), false);
// There is no sidebar on first run at all now, which settles it more firmly.
ok('no sidebar competing with the setup form', await p.evaluate(() => !!document.querySelector('.topbar')), false);
ok('"This browser" is nowhere', /This browser/.test(await page()), false);
ok('the heading survives', /Set up your first account/.test(await page()), true);
ok('the tagline survives', /Your edge, in writing/.test(await page()), true);
ok('the form still works', await p.evaluate(() => !!document.querySelector('.main input[placeholder="Swing account"]')), true);
ok('no errors', errs.length, 0);
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
