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

// Two clean weeks of September 2026 on a 100k / 0.75% account. 1R = $750.
// W1 (Tue 01 – Fri 04): +1,500 −750 +2,250  = +$3,000  = +3.00% = +4.00R
// W2 (Mon 07 – Tue 08): +750                = +$750    = +0.75% = +1.00R
const T = (date, net) => ({ id: 't' + date + net, accountId:'acc_1', date, timeOpen:'16:00', timeClose:'16:30',
  pair:'XAUUSD', side:'buy', sessionId:'ses_london', riskPercent:0.75, netResult:net,
  setupId:null, tagIds:[], followedPlan:true, notes:'' });
const LIVE = [T('2026-09-01', 1500), T('2026-09-02', -750), T('2026-09-04', 2250), T('2026-09-07', 750)];

const errors = [];
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.addInitScript(trades => {
  if (localStorage.getItem('fakefs')) return;   // seed once; a reload must see the folder as it now is
  localStorage.setItem('fakeroot','TgtFolder');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:1,accounts:[{id:'acc_1',name:'Main funded',currency:'USD',startingBalance:100000,defaultRiskPercent:0.75,color:'#0988F0',openedAt:'2026-06-01',archived:false}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades})],
  ]));
}, LIVE);
await page.addInitScript(FAKE_FS);
await page.goto('http://127.0.0.1:8777/index.html', { waitUntil:'domcontentloaded' });
await page.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });

let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};
const setUnit = async u => { await page.evaluate(x => [...document.querySelectorAll('.unit-switch button')].find(b=>b.textContent.trim()===x).click(), u); await page.waitForTimeout(350); };
const weekLine = () => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.main section.card, .main .card')];
  const byWeek = cards.find(c => /By week/i.test(c.innerText));
  return byWeek ? byWeek.innerText.replace(/\n+/g, ' | ') : '(no by-week card)';
});

await page.evaluate(() => { location.hash = '#/calendar'; });
await page.waitForTimeout(500);
ok('migrated accounts.json to v2', await page.evaluate(() =>
  JSON.parse(new Map(JSON.parse(localStorage.getItem('fakefs'))).get('data/accounts.json')).version), 2);
ok('no target to begin with', /set target/.test(await weekLine()), true);
await page.screenshot({ path: OUT + '/shot-target-none.png' });

// set $2,000 a week
await page.evaluate(() => [...document.querySelectorAll('.main button')].find(b=>/set target/.test(b.textContent)).click());
await page.waitForTimeout(300);
await page.fill('.main input[type=number]', '2000');
await page.evaluate(() => [...document.querySelectorAll('.main button')].find(b=>b.textContent.trim()==='Set').click());
await page.waitForTimeout(500);

ok('stored as 2% of the starting balance', await page.evaluate(() =>
  JSON.parse(new Map(JSON.parse(localStorage.getItem('fakefs'))).get('data/accounts.json')).accounts[0].weeklyTargetPercent), 2);
const w$ = await weekLine();
console.log('  by week ($): ' + w$);
ok('target shown in $', /target \$2,000/.test(w$), true);
ok('W1 cleared it', /W1 \| ✓ \| \+\$3,000/.test(w$), true);
ok('W2 is at 38%', /W2 \| 38% \| \+\$750/.test(w$), true);
await page.screenshot({ path: OUT + '/shot-target-dollar.png' });

// the same target, read as a percentage
await setUnit('%');
const wPct = await weekLine();
console.log('  by week (%): ' + wPct);
ok('target reads 2.00%', /target 2\.00%/.test(wPct), true);
ok('W1 is +3.00%', /W1 \| ✓ \| \+3\.00%/.test(wPct), true);

// ...and in R: 2% at 0.75% risk is 2.67R
await setUnit('R');
const wR = await weekLine();
console.log('  by week (R): ' + wR);
ok('target reads +2.67R', /target \+2\.67R/.test(wR), true);
ok('W1 is +4.0R and clears it', /W1 \| ✓ \| \+4\.0R/.test(wR), true);
ok('W2 is +1.0R, 38% of the way', /W2 \| 38% \| \+1\.0R/.test(wR), true);
await page.screenshot({ path: OUT + '/shot-target-r.png' });

// the playbook shows and edits the same number
await page.evaluate(() => { location.hash = '#/playbook'; });
await page.waitForTimeout(500);
ok('playbook shows the target', await page.evaluate(() =>
  /Weekly target[\s\S]{0,40}2\.00%/.test(document.querySelector('.main').innerText)), true);
ok('and the stepper edits the same number', await page.evaluate(() =>
  /Weekly target[\s\S]{0,40}2\.00%/.test(document.querySelector('.main').innerText)), true);

// clearing it puts the bars back on their own scale
await page.evaluate(() => { location.hash = '#/calendar'; });
await page.waitForTimeout(450);
await setUnit('$');
await page.evaluate(() => [...document.querySelectorAll('.main button')].find(b=>/target \$/.test(b.textContent)).click());
await page.waitForTimeout(300);
await page.evaluate(() => [...document.querySelectorAll('.main button')].find(b=>b.textContent.trim()==='Clear').click());
await page.waitForTimeout(500);
ok('target cleared', await page.evaluate(() =>
  JSON.parse(new Map(JSON.parse(localStorage.getItem('fakefs'))).get('data/accounts.json')).accounts[0].weeklyTargetPercent), 0);
ok('and the button offers to set one again', /set target/.test(await weekLine()), true);

// a target in R needs a risk to convert through
await page.evaluate(() => {
  const f = new Map(JSON.parse(localStorage.getItem('fakefs')));
  const a = JSON.parse(f.get('data/accounts.json')); a.accounts[0].defaultRiskPercent = 0;
  f.set('data/accounts.json', JSON.stringify(a)); localStorage.setItem('fakefs', JSON.stringify([...f]));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.welcome-title, .topbar');
await page.evaluate(() => { location.hash = '#/calendar'; });
await page.waitForTimeout(500);
await setUnit('R');
await page.evaluate(() => [...document.querySelectorAll('.main button')].find(b=>/set target/.test(b.textContent)).click());
await page.waitForTimeout(300);
ok('an R target with no risk set explains itself, it does not guess',
   await page.evaluate(() => /Set a default risk first/.test(document.querySelector('.main').innerText)), true);

console.log(errors.length ? '\nERRORS:\n  '+errors.join('\n  ') : '\nno console/page errors');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
