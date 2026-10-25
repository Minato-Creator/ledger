/* A break-even that is not exactly zero: the label stays break-even, the
   amount still counts towards the account. */
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


const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs','utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1500,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errs.push(m.text()); });
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

// one clean win to start, so the totals are easy to read
const trades=[{id:'w1',accountId:'acc_1',assetClass:'Futures',pair:'MGC',side:'buy',date:'2026-09-01',
  timeOpen:'09:10',timeClose:'10:00',riskPercent:1,netResult:1000,entryPrice:4440,stopLoss:4430,exitPrice:4460,
  tagIds:[],notes:'',setupId:null,sessionId:null}];
await p.addInitScript(({trades})=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','BE');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',accounts:[{id:'acc_1',name:'A',currency:'USD',startingBalance:100000,defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades})],
  ]));
},{trades});
await p.addInitScript(FAKE_FS);
/* A fixed day, so the September win stays inside the dashboard's window. */
await p.clock.setFixedTime(new Date('2026-09-20T10:00:00'));
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar');

// log a scratch that cost a dollar
await p.evaluate(()=>location.hash='#/new'); await p.waitForTimeout(550);
await p.evaluate(()=>{
  const n=document.querySelector('.main input[placeholder="XAUUSD"]'); n.value='MNQ'; n.dispatchEvent(new Event('input',{bubbles:true}));
});
await p.evaluate(()=>[...document.querySelectorAll('.main button')].find(x=>x.textContent==='Break-even').click());
await p.waitForTimeout(250);
await p.evaluate(()=>{
  const r=document.querySelector('.main input[placeholder="0.00"]'); r.value='-1.20'; r.dispatchEvent(new Event('input',{bubbles:true}));
});
await p.waitForTimeout(350);
const strip = await p.evaluate(()=>document.querySelector('.trade-strip').innerText.replace(/\n/g,' | '));
console.log('   ', strip);
t('the real amount is shown', /−\$1\.20/.test(strip), strip.split(' | ')[1]);
t('and not coloured as a loss', await p.evaluate(()=>{
  const v=document.querySelector('.trade-strip .kpi-val');
  return !v.classList.contains('neg') && !v.classList.contains('pos');
}));
t('save is armed', !(await p.evaluate(()=>document.querySelector('.head .btn-primary').disabled)));
await p.evaluate(()=>document.querySelector('.head .btn-primary').click());
await p.waitForTimeout(900);

const saved = await p.evaluate(()=>{
  const f=new Map(JSON.parse(localStorage.getItem('fakefs')||'[]'));
  return JSON.parse(f.get('data/trades.json')).trades.find(x=>x.pair==='MNQ');
});
console.log('   ', JSON.stringify({net:saved.netResult, outcome:saved.outcome}));
t('the amount is kept, not zeroed', saved.netResult === -1.2);
t('and the trade is labelled break-even', saved.outcome === 'breakeven');

// the account总 has to include it
await p.evaluate(()=>location.hash='#/'); await p.waitForTimeout(550);
const dash = await p.evaluate(()=>document.querySelector('.main').innerText.replace(/\n/g,' | '));
t('account net includes the scratch', /\+\$998\.80/.test(dash), (dash.match(/[+−]\$[\d,.]+/)||[])[0]);
t('it counts as neither a win nor a loss', /1 W · 0 L · 1 BE/.test(dash), (dash.match(/\d W · \d L · \d BE/)||[])[0]);
t('win rate stays 100%', /100\.0%/.test(dash), (dash.match(/\d+\.\d% */)||[])[0]);

// the trades page agrees
await p.evaluate(()=>location.hash='#/trades'); await p.waitForTimeout(500);
t('the log shows the real figure', /−\$1\.20/.test(await p.evaluate(()=>document.querySelector('.main').innerText)));
t('and the break-even filter finds it', await p.evaluate(async () => {
  const sel=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.textContent==='Break-even'));
  sel.value=[...sel.options].find(o=>o.textContent==='Break-even').value;
  sel.dispatchEvent(new Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,400));
  return [...document.querySelectorAll('.tbl-row')].filter(r=>/MNQ/.test(r.innerText)).length;
}) === 1);

// reopening it keeps both the label and the amount
await p.evaluate(()=>location.hash='#/trades'); await p.waitForTimeout(400);
await p.evaluate(()=>[...document.querySelectorAll('.tbl-row')].find(r=>/MNQ/.test(r.innerText)).click());
await p.waitForTimeout(600);
await p.evaluate(()=>[...document.querySelectorAll('.head button')].find(b=>b.textContent==='Edit').click());
await p.waitForTimeout(800);
t('it reopens as a break-even', await p.evaluate(()=>{
  const b=[...document.querySelectorAll('.main button')].find(x=>x.textContent==='Break-even');
  return getComputedStyle(b).backgroundColor !== 'rgb(54, 54, 54)';
}));
t('with the sign still in the box', await p.evaluate(()=>document.querySelector('.main input[placeholder="0.00"]').value) === '-1.2');
await p.evaluate(()=>document.querySelector('.head .btn-primary').click());
await p.waitForTimeout(800);
const again = await p.evaluate(()=>{
  const f=new Map(JSON.parse(localStorage.getItem('fakefs')||'[]'));
  return JSON.parse(f.get('data/trades.json')).trades.find(x=>x.pair==='MNQ');
});
t('and saving again does not change it', again.netResult === -1.2 && again.outcome === 'breakeven', JSON.stringify({n:again.netResult,o:again.outcome}));

// a plain zero break-even still behaves
const zero = await p.evaluate(async () => {
  const { outcome } = await import('/js/calc.js');
  return [outcome({ netResult: 0 }), outcome({ netResult: 2, outcome: 'breakeven' }),
          outcome({ netResult: 2 }), outcome({ netResult: -2 })];
});
t('a zero is still break-even, and an unlabelled trade reads from its sign',
  JSON.stringify(zero) === JSON.stringify(['breakeven','breakeven','win','loss']), zero.join(','));

// and it survives the backup round trip
const round = await p.evaluate(async () => {
  const { toCSV, parseCSV } = await import('/js/csv.js');
  const { parseBrokerCSV } = await import('/js/broker.js');
  const { store } = await import('/js/store.js');
  const csv = toCSV(store);
  const rows = parseCSV(csv);
  const be = rows.find(r => r.pair === 'MNQ');
  return { outcome: be.outcome, net: be.netResult, reread: parseBrokerCSV(csv).trades.length };
});
t('the spreadsheet records the label', round.outcome === 'breakeven', JSON.stringify(round));
t('and the amount', round.net === '-1.2');

console.log(errs.length?'\nERRORS:\n'+errs.join('\n'):'\nno errors');
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
