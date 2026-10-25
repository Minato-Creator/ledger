/* Editing a saved trade. The form is fed from disk, where numbers are numbers
   and not the strings the inputs hand back — the gap that blanked this page. */
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
  localStorage.setItem('fakeroot','EditFolder');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',accounts:[{id:'acc_1',name:'Main funded',currency:'USD',startingBalance:100000,defaultRiskPercent:0.75,color:'#0988F0',openedAt:'2026-06-01',archived:false,weeklyTargetPercent:2}],activeAccountId:'acc_1'})],
    ['data/playbook.json', JSON.stringify({version:3,setups:[{id:'s1',name:'London sweep',color:'#0988F0',rules:[]}],
      tagGroups:[{id:'g',name:'Execution',tags:[{id:'tg',name:'a-setup'}]}],
      sessions:[{id:'ses_london',name:'London Open',start:'14:00',end:'17:00'}],
      rules:{maxTradesPerDay:3,dailyLossCapPercent:3}, replay:{windowMins:15,csvOffsetHours:8}})],
    ['data/trades.json', JSON.stringify({version:1,trades:[
      // a winner, with every numeric field populated as a real number
      {id:'t_win',accountId:'acc_1',date:'2026-09-08',timeOpen:'16:20',timeClose:'18:44',pair:'XAUUSD',assetClass:'Commodities',
       side:'buy',sessionId:'ses_london',sessionAuto:true,riskPercent:0.75,netResult:1731.60,
       entryPrice:4421.28,stopLoss:4409.28,takeProfit:4470,exitPrice:4455.9,size:0.6,sizeUnit:'lots',
       setupId:'s1',tagIds:['tg'],followedPlan:true,grade:'A',notes:'clean'},
      // a loser, so the negative path is covered too
      {id:'t_loss',accountId:'acc_1',date:'2026-09-07',timeOpen:'15:00',timeClose:'15:30',pair:'EURUSD',assetClass:'Forex',
       side:'sell',sessionId:'ses_london',sessionAuto:true,riskPercent:0.5,netResult:-500,
       entryPrice:1.0821,stopLoss:1.0841,takeProfit:null,exitPrice:1.0841,size:null,sizeUnit:'lots',
       setupId:null,tagIds:[],followedPlan:false,grade:'',notes:''},
      // and a break-even with nothing optional filled in
      {id:'t_be',accountId:'acc_1',date:'2026-09-06',timeOpen:'',timeClose:'',pair:'NAS100',
       side:'buy',sessionId:null,riskPercent:1,netResult:0,setupId:null,tagIds:[],notes:''},
    ]})],
  ]));
});
await page.addInitScript(FAKE_FS);
await page.goto('http://127.0.0.1:8777/index.html', { waitUntil:'domcontentloaded' });
await page.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });

let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};

const openEdit = async id => {
  const before = errors.length;
  await page.evaluate(x => { location.hash = '#/edit/' + x; }, id);
  await page.waitForTimeout(450);
  const txt = await page.evaluate(() => document.querySelector('.main')?.innerText.trim() || '');
  return { txt, clean: errors.length === before, newErrors: errors.slice(before) };
};

for (const [id, label] of [['t_win','a winner'], ['t_loss','a loser'], ['t_be','a break-even with blanks']]) {
  const r = await openEdit(id);
  const good = r.clean && r.txt.length > 30;
  good ? pass++ : fail++;
  console.log(`  ${good?'ok  ':'FAIL'}  edit ${label}${good ? '' : '  ' + (r.newErrors.join(' | ') || 'BLANK')}`);
}

// the form is actually populated, not just non-blank
const r = await openEdit('t_win');
const vals = await page.evaluate(() => {
  const q = s => document.querySelector(s);
  return {
    result: q('.main .kpi-val')?.textContent.trim(),
    net: [...document.querySelectorAll('.main input')].map(i => i.value).find(v => v === '1731.6'),
    entry: [...document.querySelectorAll('.main input')].some(i => i.value === '4421.28'),
    stop:  [...document.querySelectorAll('.main input')].some(i => i.value === '4409.28'),
    pair:  [...document.querySelectorAll('.main input')].some(i => i.value === 'XAUUSD'),
    notes: [...document.querySelectorAll('.main textarea')].some(t => t.value === 'clean'),
  };
});
ok('the R panel recomputes', vals.result, '+$1,731.60');
ok('net result is filled in', vals.net, '1731.6');
ok('entry price is filled in', vals.entry, true);
ok('stop is filled in', vals.stop, true);
ok('pair is filled in', vals.pair, true);
ok('notes are filled in', vals.notes, true);

// saving an edit keeps the id and writes the change
await page.evaluate(() => {
  const f = [...document.querySelectorAll('.main input')].find(i => i.value === '1731.6');
  f.value = '2 000'; f.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(250);
ok('and a spaced amount still reads', await page.evaluate(() => document.querySelector('.main .kpi-val')?.textContent.trim()), '+$2,000.00');
await page.evaluate(() => [...document.querySelectorAll('.main button')].find(b => /Save/.test(b.textContent)).click());
await page.waitForTimeout(600);
const saved = await page.evaluate(() => {
  const t = JSON.parse(new Map(JSON.parse(localStorage.getItem('fakefs'))).get('data/trades.json')).trades;
  return { n: t.length, hit: t.find(x => x.id === 't_win') };
});
ok('still three trades — an edit is not a new trade', saved.n, 3);
ok('the amount was updated', saved.hit.netResult, 2000);
ok('and the rest of the trade is intact', saved.hit.entryPrice + '|' + saved.hit.notes, '4421.28|clean');

// editing a loss keeps it a loss
await openEdit('t_loss');
await page.evaluate(() => [...document.querySelectorAll('.main button')].find(b => /Save/.test(b.textContent)).click());
await page.waitForTimeout(600);
ok('a loss saved untouched stays negative', await page.evaluate(() =>
  JSON.parse(new Map(JSON.parse(localStorage.getItem('fakefs'))).get('data/trades.json')).trades.find(x=>x.id==='t_loss').netResult), -500);

console.log(errors.length ? '\nERRORS:\n  '+errors.join('\n  ') : '\nno console/page errors');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
