/* Import a real broker export end to end: read it, price it, save it. */
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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.addInitScript(() => {
  localStorage.setItem('fakeroot','Imp');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',accounts:[{id:'acc_1',name:'Apex 50k',currency:'USD',startingBalance:50000,defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:[]})],
  ]));
});
await page.addInitScript(FAKE_FS);
await page.goto('http://127.0.0.1:8777/index.html', { waitUntil:'domcontentloaded' });
await page.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });

let pass=0, fail=0;
const t = (name, cond, extra='') => { cond?pass++:fail++; console.log(`  ${cond?'ok  ':'FAIL'}  ${name}${extra?' — '+extra:''}`); };

// entry point on New Trade
await page.evaluate(() => location.hash = '#/new');
await page.waitForTimeout(350);
const hasBtn = await page.evaluate(() => [...document.querySelectorAll('.head button')].some(b => /Import CSV/.test(b.textContent)));
t('New Trade has an Import CSV button', hasBtn);
await page.evaluate(() => [...document.querySelectorAll('.head button')].find(b=>/Import CSV/.test(b.textContent)).click());
await page.waitForTimeout(350);
t('lands on the import page', await page.evaluate(() => location.hash === '#/import'));
t('chooser drawn', /Bring your trades across/.test(await page.evaluate(() => document.querySelector('.main').innerText)));

// feed it the real file
await page.setInputFiles('input[type=file]', FIX + '/tradesea.csv');
await page.waitForTimeout(500);
const txt = () => page.evaluate(() => document.querySelector('.main').innerText);
const body = await txt();
t('3 trades found', /3 TRADES IN TRADESEA\.CSV/i.test(body), body.split('\n').find(l=>/trades in/.test(l)));
t('instrument listed', /MGC/.test(body));
t('point value prefilled', await page.evaluate(() => document.querySelector('.card input.field').value) === '10');
t('suggested flagged', /suggested/.test(body));
t('still-open noted', /1 position still open/.test(body), body.split('\n').filter(l=>/still open/.test(l))[0]);
t('cancels noted', /4 rows were not fills/.test(body));
t('asset class guessed', await page.evaluate(() => [...document.querySelectorAll('.chip.is-on')].map(c=>c.textContent).join()) === 'Commodities');

const rowTexts = await page.evaluate(() => [...document.querySelectorAll('.tbl-row')].map(r => r.innerText.replace(/\n/g,' | ')));
console.log(rowTexts.map(r=>'    '+r).join('\n'));
t('3 rows', rowTexts.length === 3);
t('results priced', rowTexts.every(r => !/needs a value/.test(r)));
t('losses and a win', rowTexts.filter(r=>/[-\u2212]\$/.test(r)).length === 2 && rowTexts.filter(r=>/\+\$/.test(r)).length === 1);

const label = await page.evaluate(() => document.querySelector('.head .btn-primary').textContent);
t('button says Add 3 trades', label === 'Add 3 trades', label);

// unticking one
await page.evaluate(() => document.querySelectorAll('.tick')[0].click());
await page.waitForTimeout(120);
t('untick lowers the count', await page.evaluate(() => document.querySelector('.head .btn-primary').textContent) === 'Add 2 trades');
await page.evaluate(() => document.querySelectorAll('.tick')[0].click());
await page.waitForTimeout(120);

// clearing the point value disables the save
await page.evaluate(() => { const i = document.querySelector('.card input.field'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); });
await page.waitForTimeout(150);
t('no point value disables saving', await page.evaluate(() => document.querySelector('.head .btn-primary').disabled) === true);
t('and says why', /needs? a \$ per point/.test(await txt()));
await page.evaluate(() => { const i = document.querySelector('.card input.field'); i.value='10'; i.dispatchEvent(new Event('input',{bubbles:true})); });
await page.waitForTimeout(150);

// save
await page.evaluate(() => document.querySelector('.head .btn-primary').click());
await page.waitForTimeout(700);
t('goes to trades', await page.evaluate(() => location.hash) === '#/trades');
const saved = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('fakefs')).find(([n])=>n==='data/trades.json')[1]).trades);
console.log('    saved:', saved.map(s=>`${s.date} ${s.timeOpen} ${s.pair} ${s.side} ${s.netResult} ${s.assetClass}/${s.sizeUnit} sess=${s.sessionId}`).join('\n            '));
t('3 trades on disk', saved.length === 3);
t('net results right', JSON.stringify(saved.map(s=>s.netResult)) === JSON.stringify([-73.12,-150.12,66.88]));
t('all on the right account', saved.every(s=>s.accountId==='acc_1'));
t('sessions labelled', saved.every(s=>s.sessionId !== undefined));
t('risk carried over', saved.every(s=>s.riskPercent===1));

// re-import the same file: everything should be recognised
await page.evaluate(() => location.hash = '#/import');
await page.waitForTimeout(350);
await page.setInputFiles('input[type=file]', FIX + '/tradesea.csv');
await page.waitForTimeout(500);
const again = await txt();
t('duplicates spotted', (again.match(/already in/g)||[]).length === 3);
t('nothing selected by default', await page.evaluate(() => document.querySelector('.head .btn-primary').textContent) === 'Nothing selected');
t('and the button is off', await page.evaluate(() => document.querySelector('.head .btn-primary').disabled) === true);

// a wrong file
await page.evaluate(() => { localStorage.removeItem('x'); });
fs.writeFileSync(FIX + '/junk.csv','alpha,beta\n1,2\n');
await page.setInputFiles('input[type=file]', FIX + '/junk.csv');
await page.waitForTimeout(400);
t('junk file rejected with a reason', /column|read/.test(await page.evaluate(()=>document.getElementById('toast')?.textContent||'')), await page.evaluate(()=>document.getElementById('toast')?.textContent||''));

await page.screenshot({ path: OUT + '/shot-import.png' });
await page.evaluate(() => location.hash='#/import');
await page.waitForTimeout(300);
await page.setInputFiles('input[type=file]', FIX + '/tradesea.csv');
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + '/shot-import-review.png' });

console.log(errors.length ? '\nCONSOLE ERRORS:\n' + errors.join('\n') : '\nno console errors');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
