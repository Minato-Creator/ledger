/* Every screen, on an account with nothing in it.
   This is the state a new user is in for their first hour, and the state that
   hid a crash on the Replay page: `live[0]` does not exist, so the fallback
   path ran for the first time. */
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

const errors = [];
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.addInitScript(() => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','EmptyFolder');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',accounts:[{id:'acc_1',name:'Brand new',currency:'USD',startingBalance:50000,defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:[]})],
  ]));
});
await page.addInitScript(FAKE_FS);
await page.goto('http://127.0.0.1:8777/index.html', { waitUntil:'domcontentloaded' });
await page.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });

let pass=0, fail=0;
const VIEWS = [['#/','dashboard'],['#/trades','trades'],['#/calendar','calendar'],['#/analytics','analytics'],
               ['#/replay','replay'],['#/playbook','playbook'],['#/accounts','accounts'],['#/settings','settings'],['#/new','new trade']];
for (const [hash, name] of VIEWS) {
  const before = errors.length;
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(420);
  const txt = await page.evaluate(() => document.querySelector('.main')?.innerText.trim() || '');
  const clean = errors.length === before;
  const drawn = txt.length > 15;
  const good = clean && drawn;
  good ? pass++ : fail++;
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${name.padEnd(10)} ${drawn ? `[${txt.split('\n').filter(Boolean).slice(0,2).join(' / ')}]` : 'BLANK'}`);
  if (!clean) console.log('     ' + errors.slice(before).join(' | '));
}
// and again in each unit — an empty account has no R at all, which is its own edge
for (const u of ['%','R']) {
  await page.evaluate(x => [...document.querySelectorAll('.unit-switch button')].find(b=>b.textContent.trim()===x).click(), u);
  await page.waitForTimeout(250);
  for (const [hash, name] of VIEWS) {
    const before = errors.length;
    await page.evaluate(h => { location.hash = h; }, hash);
    await page.waitForTimeout(300);
    const txt = await page.evaluate(() => document.querySelector('.main')?.innerText.trim() || '');
    const good = errors.length === before && txt.length > 15;
    good ? pass++ : fail++;
    if (!good) console.log(`  FAIL  ${u} · ${name}  ${errors.slice(before).join(' | ') || 'BLANK'}`);
  }
  console.log(`  ok    all nine views in ${u}`);
}
console.log(errors.length ? '\nERRORS:\n  '+errors.join('\n  ') : '\nno console/page errors');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
