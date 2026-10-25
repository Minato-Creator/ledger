import pw from 'playwright';
import fsx from 'node:fs';
import { setTheme, pickColour, paletteNames } from './lookhelp.mjs';
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
const lum = async sel => p.evaluate(s => { const n=document.querySelector(s); if(!n) return null;
  const [r,g,bl]=getComputedStyle(n).backgroundColor.match(/[\d.]+/g).map(Number); return Math.round(.2126*r+.7152*g+.0722*bl); }, sel);
const cssVar = v => p.evaluate(x => getComputedStyle(document.documentElement).getPropertyValue(x).trim(), v);

await p.locator('.main input[placeholder="Swing account"]').fill('Main');
await p.locator('.main input[inputmode="decimal"]').first().fill('100000');
await p.evaluate(() => [...document.querySelectorAll('.main .btn-primary')].find(x=>/Create account/.test(x.textContent)).click());
await p.waitForTimeout(400);
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(450);

ok('Appearance is a row in Settings', await p.evaluate(() => !!document.querySelector('.st-row[data-row="Appearance"]')), true);
ok('and nothing about the look is left on the page itself', await p.evaluate(() => !document.querySelector('.main .theme-switch, .main .pnl-drop')), true);
/* One palette, offered for every money colour. */
const names = await paletteNames(p);
ok('the money palette is the full one', names.length >= 60, true);

console.log('  -- darker dark --');
await setTheme(p, 'dark');
await p.evaluate(() => { location.hash = '#/accounts'; }); await p.waitForTimeout(450);
const g = await lum('body'), card = await lum('.main .card'), field = await lum('.main .field') ?? 0;
console.log(`  ground ${g} · card ${card} · field ${field}`);
ok('ground is near black', g <= 8, true);
ok('cards sit just above it', card > g && card < 25, true);
ok('and the wells are darker than before', field < 25, true);

console.log('  -- choosing colours --');
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(400);
await pickColour(p, 'profit', 'Purple');
ok('profit becomes the picked colour', await cssVar('--profit'), '#7C5CFF');
ok('and --green follows, so every inline use changes too', await cssVar('--green'), '#7C5CFF');
await pickColour(p, 'loss', 'Orange');
ok('loss too', await cssVar('--loss'), '#F97316');

console.log('  -- white and black stay readable --');
await pickColour(p, 'profit', 'White');
ok('white profit on a dark card stays white', (await cssVar('--pos-light')).toLowerCase(), '#e9e9e9');
/* The pale cards are only pale on Graphite now — the original Laminar. */
await setTheme(p, 'graphite');
const w = await cssVar('--pos-light');
console.log('  white profit, Graphite, pale-card variant:', w);
ok('white is pulled dark enough to read on a pale card', w.toLowerCase() !== '#e9e9e9', true);
await pickColour(p, 'profit', 'Black');
ok('black profit stays dark on a pale card', (await cssVar('--pos-light')).toLowerCase(), '#3d3d3d');
await setTheme(p, 'dark');
ok('and is lifted to grey on a dark one', (await cssVar('--pos-light')).toLowerCase() !== '#3D3D3D', true);

console.log('  -- it sticks --');
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });
ok('theme survived', await p.evaluate(() => document.documentElement.dataset.theme), 'dark');
ok('colours survived', await cssVar('--loss'), '#F97316');
ok('written to disk', await p.evaluate(() => JSON.parse(localStorage.getItem('ledger:file:data/accounts.json')).colours.loss), '#F97316');
ok('no errors', errs.length, 0);
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
