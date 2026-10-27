import pw from 'playwright';
import fs from 'node:fs';
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

const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
const seed = fs.readFileSync(HERE + 'views.mjs', 'utf8');

const errors = [];
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
/* the seeded trades run June–September 2026; on the real clock the dashboard's window
   moved past them in October and the equity line stopped being drawn */
await page.clock.setFixedTime(new Date('2026-09-25T12:00:00+08:00'));
page.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

// reuse the seeded folder from views.mjs by running its generator inline
const gen = new Function('return (' + seed.slice(seed.indexOf('const SESSIONS'), seed.indexOf('const errors = [];')) .replace(/^/, '() => { ') + ' return { trades, PB }; })')();
const { trades, PB } = gen();
await page.addInitScript(({ trades, PB }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','MotionFolder');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',accounts:[{id:'acc_1',name:'Main funded',currency:'USD',startingBalance:100000,defaultRiskPercent:0.75,color:'#0988F0',openedAt:'2026-06-01',archived:false,weeklyTargetPercent:2}],activeAccountId:'acc_1'})],
    ['data/playbook.json', JSON.stringify(PB)],
    ['data/trades.json', JSON.stringify({version:1,trades})],
  ]));
}, { trades, PB });
await page.addInitScript(FAKE_FS);
await page.goto('http://127.0.0.1:8777/index.html', { waitUntil:'domcontentloaded' });
await page.waitForSelector('.welcome-title, .topbar');

let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};
const entered = () => page.evaluate(() => document.querySelector('.main')?.classList.contains('enter'));
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(300); };

// ---- when it should play -------------------------------------------------
ok('the first paint plays', await entered(), true);   // straight off boot, before any navigation
await go('#/calendar');    ok('changing view plays', await entered(), true);
await go('#/analytics');   ok('and again', await entered(), true);

// ---- when it must NOT -----------------------------------------------------
await page.evaluate(() => [...document.querySelectorAll(':is(.seg, .an-tabs) button')].find(b=>b.textContent.trim()==='Timing').click());
await page.waitForTimeout(250);
ok('switching analytics tab does not replay', await entered(), false);
await page.evaluate(() => [...document.querySelectorAll('.seg button')].find(b=>b.textContent.trim()==='90D').click());
await page.waitForTimeout(250);
ok('changing the period does not replay', await entered(), false);

await go('#/calendar');
await page.evaluate(() => [...document.querySelectorAll('.head button')].find(b=>b.querySelector('svg'))?.click());
await page.waitForTimeout(250);
ok('stepping the month does not replay', await entered(), false);

await go('#/trades');
await page.fill('.card input[placeholder="Search notes & pairs"]', 'xau');
await page.waitForTimeout(450);
ok('typing in the filter does not replay', await entered(), false);

// ---- unit change is a redraw, so it should ------------------------------
await go('#/');
await page.evaluate(() => [...document.querySelectorAll('.unit-switch button')].find(b=>b.textContent.trim()==='R').click());
await page.waitForTimeout(250);
ok('switching unit replays', await entered(), true);
await page.waitForTimeout(2700);    // .enter stays 2.8 s, until the slowest chart has drawn (Laminar 3.1)
ok('and the flag is cleared once it has played', await entered(), false);
await page.evaluate(() => [...document.querySelectorAll('.unit-switch button')].find(b=>b.textContent.trim()==='R').click());
await page.waitForTimeout(250);
ok('clicking the unit already on does nothing', await entered(), false);

// ---- the pieces are actually wired -------------------------------------
await go('#/');
const wired = await page.evaluate(() => ({
  line: !!document.querySelector('.main .line-draw'),
  pathLen: document.querySelector('.main .line-draw')?.getAttribute('pathLength'),
  tip:  !!document.querySelector('.main .line-tip'),
  bars: document.querySelectorAll('.main .bar-fill').length,
}));
ok('the equity line is tagged', wired.line, true);
ok('with a normalised path length', wired.pathLen, '1');
ok('and a tip', wired.tip, true);
ok('the win-rate bar is tagged', wired.bars >= 1, true);
await go('#/analytics');
await page.evaluate(() => [...document.querySelectorAll(':is(.seg, .an-tabs) button')].find(b=>b.textContent.trim()==='Overview').click());
await page.waitForTimeout(300);
ok('overview has bars and columns', await page.evaluate(() =>
  document.querySelectorAll('.main .bar-fill').length > 3 && document.querySelectorAll('.main .col-fill-svg').length > 3), true);
ok('and its equity line draws itself in', await page.evaluate(() =>
  [...document.querySelectorAll('.main .line-draw')].every(n => n.getAttribute('pathLength') === '1') && !!document.querySelector('.main .line-draw')), true);
await page.evaluate(() => [...document.querySelectorAll(':is(.seg, .an-tabs) button')].find(b=>b.textContent.trim()==='Timing').click());
await page.waitForTimeout(300);
ok('timing has svg columns', await page.evaluate(() => document.querySelectorAll('.main .col-fill-svg').length > 3), true);

// ---- the animation actually finishes (nothing left stuck invisible) ------
await go('#/');
await page.waitForTimeout(2700);    // charts wait for their card, then draw over 1.1–1.5 s
const settled = await page.evaluate(() => {
  const bad = [];
  for (const sel of ['.view > *', '.bar-fill', '.line-draw', '.line-tip', '.cal-grid']) {
    for (const n of document.querySelectorAll('.main ' + sel)) {
      const cs = getComputedStyle(n);
      if (Number(cs.opacity) < 0.99) bad.push(sel + ' opacity ' + cs.opacity);
      if (cs.transform !== 'none' && /matrix\(0/.test(cs.transform)) bad.push(sel + ' collapsed ' + cs.transform);
    }
  }
  return bad;
});
ok('everything settles fully visible', settled.length ? settled.join(' | ') : 'clean', 'clean');

// ---- press states are declared, not just hover ---------------------------
const press = await page.evaluate(() => {
  const rules = [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch { return []; } });
  const t = s => rules.some(r => r.selectorText === s);
  return { btn: t('.btn:active'), seg: t('.seg button:active'), unit: t('.unit-switch button:active'),
           row: t('.tbl-row:active'), focus: t(':focus-visible') };
});
ok('buttons have a press state', press.btn, true);
ok('segmented controls too', press.seg, true);
ok('the unit switch too', press.unit, true);
ok('table rows too', press.row, true);
ok('keyboard focus is visible', press.focus, true);

// ---- reduced motion is honoured -----------------------------------------
const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const p2 = await rm.newPage();
await p2.clock.setFixedTime(new Date('2026-09-25T12:00:00+08:00'));
await p2.addInitScript(FAKE_FS);
await p2.goto('http://127.0.0.1:8777/index.html', { waitUntil:'domcontentloaded' });
await p2.waitForSelector('.welcome-title, .topbar', { timeout: 8000 }).catch(()=>{});
const still = await p2.evaluate(() => {
  const n = document.querySelector('.gate-card') || document.querySelector('.main > *') || document.body;
  return getComputedStyle(n).animationDuration;
});
ok('reduced motion collapses durations', /0\.001s|1ms|0s/.test(still), true);

console.log(errors.length ? '\nERRORS:\n  '+errors.join('\n  ') : '\nno console/page errors');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
