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
ok('both accounts are listed, each as a card', await page.evaluate(() =>
  [...document.querySelectorAll('.ab-card .ab-name')].filter(n => ['Main funded','Personal'].includes(n.textContent)).length), 2);
await page.screenshot({ path: OUT + '/shot-settings.png' });

/* everything about one account is in its edit sheet, saved with Save */
const edit = async (id, fill) => {
  await go();
  await page.evaluate(x => document.querySelector(`.ab-card[data-account="${x}"] .ab-edit`).click(), id);
  await page.waitForTimeout(450);
  await page.evaluate(f => {
    for (const [sel, v] of Object.entries(f)) {
      const i = sel.startsWith('label:')
        ? [...document.querySelectorAll('.sheet.is-ab label')].find(l => new RegExp(sel.slice(6), 'i').test(l.textContent)).querySelector('input')
        : document.querySelector('.sheet.is-ab ' + sel);
      i.value = v; i.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('.sheet.is-ab .ab-go').click();
  }, fill);
  await page.waitForTimeout(500);
  const left = await page.evaluate(() => document.querySelector('.sheet.is-ab .missing-note')?.textContent || '');
  if (left) { await page.keyboard.press('Escape'); await page.waitForTimeout(350); }
  return left;
};

console.log('  -- renaming --');
await edit('acc_1', { '.ab-namein': 'Prop 100k' });
ok('the rename is written', (await acctOnDisk('acc_1')).name, 'Prop 100k');
ok('and the top bar follows', await page.evaluate(() => document.querySelector('.acct-name')?.textContent), 'Prop 100k');
ok('trades are untouched by a rename', await page.evaluate(() =>
  JSON.parse(new Map(JSON.parse(localStorage.getItem('fakefs'))).get('data/trades.json')).trades.length), 1);
ok('a blank name is refused', /a name/.test(await edit('acc_1', { '.ab-namein': '   ' })) && (await acctOnDisk('acc_1')).name === 'Prop 100k', true);

console.log('  -- the number fields take money the same way --');
await edit('acc_1', { '.ab-sizein': '$250 000' });
ok('"$250 000" is accepted', (await acctOnDisk('acc_1')).startingBalance, 250000);
ok('rubbish is refused, the old value stands', /size|balance/.test(await edit('acc_1', { '.ab-sizein': 'banana' })) && (await acctOnDisk('acc_1')).startingBalance === 250000, true);
ok('zero is refused — it would break every R', /size|balance/.test(await edit('acc_1', { '.ab-sizein': '0' })) && (await acctOnDisk('acc_1')).startingBalance === 250000, true);
await edit('acc_1', { 'label:Risk': '0.5' });
ok('risk % saves', (await acctOnDisk('acc_1')).defaultRiskPercent, 0.5);
await edit('acc_1', { 'label:Weekly target': '3' });
ok('weekly target saves', (await acctOnDisk('acc_1')).weeklyTargetPercent, 3);
ok('and the calendar picks it up', await (async () => {
  await page.evaluate(() => { location.hash = '#/calendar'; }); await page.waitForTimeout(400);
  return page.evaluate(() => /target \$7,500/.test(document.querySelector('.main').innerText));
})(), true);

console.log('  -- archiving --');
await go();
await page.evaluate(() => document.querySelector('.ab-card[data-account="acc_2"] .ab-edit').click());
await page.waitForTimeout(450);
await page.evaluate(() => [...document.querySelectorAll('.sheet.is-ab .acct-actions button')].find(b => b.textContent.trim() === 'Archive').click());
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
