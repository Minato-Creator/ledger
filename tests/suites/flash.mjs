/* Measure the flash directly: sample what colour is actually painted where a
   card sits, at several points during the entrance. On this app the ground is
   #9A9A9A and the cards are #202020, so if a card is mid-fade the pixel goes
   bright. Nothing should get near the ground's brightness. */
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
const gen = new Function('return (' + seed.slice(seed.indexOf('const SESSIONS'), seed.indexOf('const errors = [];')).replace(/^/, '() => { ') + ' return { trades, PB }; })')();
const { trades, PB } = gen();

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(({ trades, PB }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','FlashFolder');
  localStorage.setItem('fakefs', JSON.stringify([
    /* Graphite: the one look with a bright ground under dark cards, which is
       the case a fade-in would flash. */
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',look:{theme:'graphite'},accounts:[{id:'acc_1',name:'Main funded',currency:'USD',startingBalance:100000,defaultRiskPercent:0.75,color:'#0988F0',openedAt:'2026-06-01',archived:false,weeklyTargetPercent:2}],activeAccountId:'acc_1'})],
    ['data/playbook.json', JSON.stringify(PB)], ['data/trades.json', JSON.stringify({version:1,trades})],
  ]));
}, { trades, PB });
await page.addInitScript(FAKE_FS);
await page.goto('http://127.0.0.1:8777/index.html', { waitUntil:'domcontentloaded' });
await page.waitForSelector('.welcome-title, .topbar');
await page.waitForTimeout(900);

// Average luminance of the card region, ignoring the sidebar.
async function lumaAt(ms, hash) {
  await page.evaluate(() => { location.hash = '#/playbook'; });
  await page.waitForTimeout(500);
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(30);
  await page.evaluate(t => document.getAnimations().forEach(a => { a.pause(); a.currentTime = t; }), ms);
  await page.waitForTimeout(60);
  // Read the pixels in the page itself — html2canvas is overkill, so instead
  // sample the computed backgrounds the browser is actually compositing.
  const l = await page.evaluate(() => {
    const px = [];
    for (const card of document.querySelectorAll('.main .card')) {
      const cs = getComputedStyle(card);
      const m = cs.backgroundColor.match(/[\d.]+/g).map(Number);
      const a = m.length > 3 ? m[3] : 1;
      const eff = cs.opacity === '' ? 1 : Number(cs.opacity);
      // what the eye sees: the card composited over the #9A9A9A ground
      const mix = c => c * a * eff + 154 * (1 - a * eff);
      px.push(0.2126*mix(m[0]) + 0.7152*mix(m[1]) + 0.0722*mix(m[2]));
    }
    return px.length ? px.reduce((s,x)=>s+x,0) / px.length : 154;
  });
  await page.evaluate(() => document.getAnimations().forEach(a => a.play()));
  return l;
}

let pass=0, fail=0;
const settled = await lumaAt(3000, '#/');
console.log(`  settled luminance of the card area: ${settled.toFixed(1)}  (ground is 154)`);
const GROUND = 154, budget = settled + (GROUND - settled) * 0.25;   // a quarter of the way to the ground
for (const ms of [0, 40, 90, 150, 240]) {
  const l = await lumaAt(ms, '#/');
  const ok = l <= budget;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  at ${String(ms).padStart(3)}ms luminance ${l.toFixed(1)}  (budget ${budget.toFixed(1)})`);
}
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
