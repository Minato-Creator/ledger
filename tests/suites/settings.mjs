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
  localStorage.setItem('fakeroot','SetFolder');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',accounts:[
      {id:'acc_1',name:'Main funded',currency:'USD',startingBalance:100000,defaultRiskPercent:0.75,color:'#0988F0',openedAt:'2026-06-01',archived:false,weeklyTargetPercent:2},
      {id:'acc_2',name:'Personal',currency:'AUD',startingBalance:25000,defaultRiskPercent:1,color:'#18AC65',openedAt:'2026-07-01',archived:false,weeklyTargetPercent:0},
    ],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:[
      {id:'t1',accountId:'acc_1',date:'2026-09-08',timeOpen:'16:20',timeClose:'17:00',pair:'XAUUSD',side:'buy',sessionId:null,riskPercent:0.75,netResult:1500,setupId:null,tagIds:[],notes:''},
    ]})],
  ]));
});
await page.addInitScript(FAKE_FS);
await page.goto('http://127.0.0.1:8777/index.html', { waitUntil:'domcontentloaded' });
await page.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });

let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};
const acctOnDisk = id => page.evaluate(x =>
  JSON.parse(new Map(JSON.parse(localStorage.getItem('fakefs'))).get('data/accounts.json')).accounts.find(a=>a.id===x), id);
const go = async (sub = 'accounts') => { await page.evaluate(s => { location.hash = '#/settings' + (s ? '/' + s : ''); }, sub); await page.waitForTimeout(400); };

/* Settings is a list now, the way a phone does it; each row opens a page. */
await go('');
const txt = () => page.evaluate(() => document.querySelector('.main').innerText);
const rows = await page.evaluate(() => [...document.querySelectorAll('.st-row')].map(r => r.dataset.row));
ok('one row each, grouped', rows.join(' · '), 'Profile · Accounts · Risk rules · Charts & prices · Import trades · Appearance · Vault & data · Trades as a spreadsheet');
ok('grouped under three headings', await page.evaluate(() => [...document.querySelectorAll('.st-gk')].map(n => n.textContent).join(' · ')), 'Account · Trading · App');
await page.locator('.st-search').fill('vault');
await page.waitForTimeout(200);
ok('search narrows the list', await page.evaluate(() => [...document.querySelectorAll('.st-row')].filter(r => !r.hidden).map(r => r.dataset.row).join(',')), 'Vault & data');
await go('vault');
ok('the vault is one box', (await txt()).match(/^Vault$/gm)?.length, 1);
ok('the Spreadsheet box is gone', /Spreadsheet/.test(await txt()), false);
ok('and so is the Ledger CSV import', /Choose a Ledger CSV/.test(await txt()), false);
ok('the sheet is one quiet line', (await txt()).match(/Trades as a spreadsheet/g)?.length, 1);
ok('export and import are the vault\'s', (await txt()).match(/^Export$|^Import$/gm)?.length, 2);
await go();
ok('accounts have a page of their own', /Accounts/.test(await txt()), true);
ok('both accounts are listed', await page.evaluate(() =>
  [...document.querySelectorAll('.main input')].filter(i => ['Main funded','Personal'].includes(i.value)).length), 2);
await page.screenshot({ path: OUT + '/shot-settings.png' });

console.log('  -- renaming --');
await page.evaluate(() => {
  const i = [...document.querySelectorAll('.main input')].find(x => x.value === 'Main funded');
  i.value = 'Prop 100k'; i.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(500);
ok('the rename is written', (await acctOnDisk('acc_1')).name, 'Prop 100k');
ok('and the top bar follows', await page.evaluate(() => document.querySelector('.acct-name')?.textContent), 'Prop 100k');
ok('trades are untouched by a rename', await page.evaluate(() =>
  JSON.parse(new Map(JSON.parse(localStorage.getItem('fakefs'))).get('data/trades.json')).trades.length), 1);

await go();
await page.evaluate(() => {
  const i = [...document.querySelectorAll('.main input')].find(x => x.value === 'Prop 100k');
  i.value = '   '; i.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(400);
ok('a blank name is refused', (await acctOnDisk('acc_1')).name, 'Prop 100k');

console.log('  -- the number fields take money the same way --');
const setField = async (label, value) => {
  await go();
  await page.evaluate(([lbl, v]) => {
    const wrap = [...document.querySelectorAll('.main label')].find(l => new RegExp(lbl, 'i').test(l.textContent));
    const i = wrap.querySelector('input');
    i.value = v; i.dispatchEvent(new Event('change', { bubbles: true }));
  }, [label, value]);
  await page.waitForTimeout(450);
};
await setField('Starting balance', '$250 000');
ok('"$250 000" is accepted', (await acctOnDisk('acc_1')).startingBalance, 250000);
await setField('Starting balance', 'banana');
ok('rubbish is refused, the old value stands', (await acctOnDisk('acc_1')).startingBalance, 250000);
await setField('Starting balance', '0');
ok('zero is refused — it would break every R', (await acctOnDisk('acc_1')).startingBalance, 250000);
await setField('Risk', '0.5');
ok('risk % saves', (await acctOnDisk('acc_1')).defaultRiskPercent, 0.5);
await setField('Weekly target', '3');
ok('weekly target saves', (await acctOnDisk('acc_1')).weeklyTargetPercent, 3);
ok('and the calendar picks it up', await (async () => {
  await page.evaluate(() => { location.hash = '#/calendar'; }); await page.waitForTimeout(400);
  return page.evaluate(() => /target \$7,500/.test(document.querySelector('.main').innerText));
})(), true);

console.log('  -- archiving --');
await go();
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.main input')].find(x => x.value === 'Personal').closest('div').parentElement;
  /* The archive button is a word now, beside Delete, rather than a bin. */
  [...rows.querySelectorAll('.acct-actions button')].find(b => b.textContent.trim() === 'Archive').click();
});
await page.waitForTimeout(450);
ok('archived flag is written', (await acctOnDisk('acc_2')).archived, true);
ok('and it leaves the switcher', await (async () => {
  await page.evaluate(() => document.querySelector('.tb-acct').click()); await page.waitForTimeout(300);
  const there = await page.evaluate(() => [...document.querySelectorAll('.popover .pop-n')].some(n => n.textContent === 'Personal'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  return there; })(), false);

console.log('  -- the spreadsheet line still works --');
await go('');
const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await page.evaluate(() => [...document.querySelectorAll('.main button')].find(b=>/Trades as a spreadsheet/.test(b.textContent)).click());
const file = await dl;
ok('export produces a file', !!file, true);
ok('named for today', /^quire-trades-\d{4}-\d{2}-\d{2}\.csv$/.test(file?.suggestedFilename() || ''), true);

console.log(errors.length ? '\nERRORS:\n  '+errors.join('\n  ') : '\nno console/page errors');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
