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
const sh = s => p.evaluate(x => { const n = document.querySelector(x); return n ? getComputedStyle(n).boxShadow : 'MISSING'; }, s);

const card = await sh('.main .card');
const field = await sh('.main .field');
console.log('  card :', card.slice(0,110));
console.log('  field:', field.slice(0,110));
/* Laminar 3: soft, short shadows and hairline edges rather than a lit top
   edge — the page sits close to the card's own colour now. */
ok('cards cast a soft shadow outward', /0px 6px 22px -10px/.test(card), true);
ok('and carry a hairline edge', /inset/.test(card), true);
ok('fields are drawn in, not lifted', /inset/.test(field) && !/0px 6px/.test(field), true);
// A waiting button is deliberately flat — it is not offering to be pressed.
ok('a button that cannot act yet stays flat', await sh('.main .btn-primary'), 'none');

await p.locator('.main input[placeholder="Swing account"]').fill('Main');
await p.locator('.main input[inputmode="decimal"]').first().fill('100000');
await p.waitForTimeout(400);   // box-shadow transitions; read it after
ok('once live it lifts, a little', /0px 1px 2px/.test(await sh('.main .btn-primary')), true);

// depth must not cost legibility. box-shadow is transitioned, so the value
// has to be read after the transition, not on the same tick as the focus.
await p.evaluate(() => document.querySelector('.main input').focus());
await p.waitForTimeout(300);
const focus = await p.evaluate(() => getComputedStyle(document.querySelector('.main input')).boxShadow);
ok('focus rings in the accent, over the edge', /14, 15, 17/.test(focus), true);
ok('nothing spills sideways', await p.evaluate(() => document.body.scrollWidth > window.innerWidth), false);
ok('no errors', errs.length, 0);
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
