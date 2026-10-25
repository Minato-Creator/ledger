/* A trade you are still in: saved without a result, kept out of every
   statistic, and finished later. */
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

const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs','utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
const closed = (i,d,net)=>({id:'c'+i,accountId:'acc_1',assetClass:'Futures',pair:'MGC',side:'buy',date:d,
  timeOpen:'09:10',timeClose:'10:00',riskPercent:1,netResult:net,entryPrice:4440,stopLoss:4430,exitPrice:4460,
  tagIds:[],notes:'',setupId:null,sessionId:null});
const trades=[closed(1,'2026-09-01',900), closed(2,'2026-09-02',-500)];

const b=await chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1500,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errs.push(m.text()); });
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

await p.addInitScript(({trades})=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Open');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',accounts:[{id:'acc_1',name:'Prop 100k',currency:'USD',startingBalance:100000,defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades})],
  ]));
},{trades});
/* A fixed day, so the two September trades stay inside the dashboard's window. */
await p.clock.setFixedTime(new Date('2026-09-20T10:00:00'));
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar');

const dash = async () => { await p.evaluate(()=>location.hash='#/'); await p.waitForTimeout(450);
  return p.evaluate(()=>document.querySelector('.main').innerText.replace(/\n/g,' | ')); };
const before = await dash();
t('two closed trades to begin with', /2 trades/.test(before), (before.match(/\d+ trades/)||[])[0]);

/* ---- where things sit ----
   Tags took the right-hand side from the charts: they are the part of a trade
   you read back for years, and they were being typed into a strip at the
   bottom of a column while two big empty chart boxes had half the card. */
await p.evaluate(()=>location.hash='#/new'); await p.waitForTimeout(500);
const side = await p.evaluate(()=>{
  const cols=[...document.querySelector('.trade-form').children];
  return cols.map(c=>c.innerText.replace(/\n/g,' '));
});
t('tags own the right column', /TAGS/i.test(side[1]) && !/TAGS/i.test(side[0]), side[1].slice(0,50));
t('charts and notes run across the foot of the form, side by side', /CHARTS/i.test(side[2] || '') && /NOTES/i.test(side[2] || '')
  && !/NOTES|CHARTS/i.test(side[0] + side[1]), (side[2] || '').slice(0, 60));
t('and the charts carry no timeframe label any more', !/LTF|HTF/.test(side[2] || ''), (side[2] || '').slice(0,60));
t('the open switch is in the form, not the head',
  /STATUS/i.test(side[0]) && !/Still open/.test(await p.evaluate(()=>document.querySelector('.head').innerText)),
  await p.evaluate(()=>document.querySelector('.head').innerText.replace(/\s+/g,' ')));

// ---- save one as open ----
await p.evaluate(()=>{
  const set=(sel,v)=>{const n=document.querySelector(sel); n.value=v; n.dispatchEvent(new Event('input',{bubbles:true}));};
  set('.main input[placeholder="XAUUSD"]','MNQ');
  const dec=[...document.querySelectorAll('.main input[inputmode="decimal"]')];
  dec[0].value='20100'; dec[0].dispatchEvent(new Event('input',{bubbles:true}));
  dec[1].value='20050'; dec[1].dispatchEvent(new Event('input',{bubbles:true}));
  dec[2].value='20250'; dec[2].dispatchEvent(new Event('input',{bubbles:true}));
});
await p.waitForTimeout(250);
t('save is off without a result', await p.evaluate(()=>document.querySelector('.head .btn-primary').disabled));
await p.evaluate(()=>[...document.querySelectorAll('.seg button')].find(b=>b.textContent==='Still open').click());
await p.waitForTimeout(400);
t('switching to open arms the save', !(await p.evaluate(()=>document.querySelector('.head .btn-primary').disabled)));
t('and the button says so', await p.evaluate(()=>document.querySelector('.head .btn-primary').textContent) === 'Save as open');
const strip = await p.evaluate(()=>document.querySelector('.trade-strip').innerText.replace(/\n/g,' | '));
t('the strip says Open, not a number', /RESULT \| Open/.test(strip), strip.slice(0,60));
t('1R is still worked out', /\$1,000\.00/.test(strip));
t('there is no result field to misread', !/net result/i.test(await p.evaluate(()=>document.querySelector('.trade-form').innerText)));
t('exit and closing time are greyed', await p.evaluate(()=>{
  const ins=[...document.querySelectorAll('.main input')];
  return ins.filter(i=>i.disabled).length >= 2;
}));
await p.screenshot({ path: OUT+'/open-form.png' });
await p.evaluate(()=>document.querySelector('.head .btn-primary').click());
await p.waitForTimeout(900);

const saved = await p.evaluate(()=>{
  const f=new Map(JSON.parse(localStorage.getItem('fakefs')||'[]'));
  return JSON.parse(f.get('data/trades.json')).trades.find(x=>x.pair==='MNQ');
});
console.log('   ', JSON.stringify({status:saved.status, net:saved.netResult, exit:saved.exitPrice, close:saved.timeClose}));
t('stored as open', saved.status === 'open');
t('with no result, not a zero', saved.netResult === null);
t('and no exit or closing time', saved.exitPrice === null && saved.timeClose === null);

// ---- it must not touch a single statistic ----
const after = await dash();
t('the dashboard still counts two', /2 trades/.test(after), (after.match(/\d+ trades/)||[])[0]);
t('net P&L unchanged', after.includes(before.split(' | ')[3] || ''), '');
for (const [hash,name] of [['#/calendar','calendar'],['#/analytics','analytics'],['#/playbook','playbook']]) {
  const n = errs.length;
  await p.evaluate(h=>location.hash=h, hash); await p.waitForTimeout(420);
  t(`${name} unaffected and clean`, errs.length === n);
}
t('the journal count is closed trades only',
  await p.evaluate(()=>document.querySelector('.tb-tab .count')?.textContent) === '2');

// ---- it shows on the trades page ----
await p.evaluate(()=>location.hash='#/trades'); await p.waitForTimeout(500);
const page = await p.evaluate(()=>document.querySelector('.main').innerText.replace(/\n/g,' | '));
t('the header flags it', /1 still open/.test(page));
t('a Still open section exists', /STILL OPEN/i.test(page));
t('the open trade is listed', /MNQ/.test(page));
t('with a way to finish it', /Close it/.test(page));
t('and the closed log still shows two', await p.evaluate(()=>document.querySelectorAll('.card:last-child .tbl-body .tbl-row').length) === 2);
await p.screenshot({ path: OUT+'/open-trades.png' });

// ---- the trade page for an open trade ----
await p.evaluate(()=>[...document.querySelectorAll('.tbl-row')].find(r=>/MNQ/.test(r.innerText)).click());
await p.waitForTimeout(700);
const detail = await p.evaluate(()=>document.querySelector('.main').innerText.replace(/\n/g,' | '));
t('the trade page says Open', /Still open/.test(detail) && /Open/.test(detail));
t('no result invented', /not yet/.test(detail) && /still in it/.test(detail));
t('and a Close it button', await p.evaluate(()=>[...document.querySelectorAll('.head button')].some(b=>b.textContent==='Close it')));
await p.screenshot({ path: OUT+'/open-detail.png' });

// ---- finishing it ----
await p.evaluate(()=>[...document.querySelectorAll('.head button')].find(b=>b.textContent==='Close it').click());
await p.waitForTimeout(800);
t('the edit form opens in the open state', await p.evaluate(()=>
  [...document.querySelectorAll('.seg button')].find(b=>b.classList.contains('is-on')).textContent) === 'Still open');
t('it remembered the entry', await p.evaluate(()=>[...document.querySelectorAll('.main input')].some(i=>i.value==='20100')));
await p.evaluate(()=>[...document.querySelectorAll('.seg button')].find(b=>b.textContent==='Closed').click());
await p.waitForTimeout(400);
t('switching back asks for the result again', /net result/i.test(await p.evaluate(()=>document.querySelector('.trade-form').innerText)));
t('and disarms the save until it is given', await p.evaluate(()=>document.querySelector('.head .btn-primary').disabled));
await p.evaluate(()=>{
  const ins=[...document.querySelectorAll('.main input')];
  const exit=ins.filter(i=>!i.disabled && i.inputMode==='decimal')[3];
  exit.value='20220'; exit.dispatchEvent(new Event('input',{bubbles:true}));
  const res=ins.find(i=>i.placeholder==='0.00'); res.value='1400'; res.dispatchEvent(new Event('input',{bubbles:true}));
});
await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('.head .btn-primary').click());
await p.waitForTimeout(900);
const done = await p.evaluate(()=>{
  const f=new Map(JSON.parse(localStorage.getItem('fakefs')||'[]'));
  return JSON.parse(f.get('data/trades.json')).trades.find(x=>x.pair==='MNQ');
});
t('now closed', done.status === 'closed' && done.netResult === 1400, JSON.stringify({s:done.status,n:done.netResult}));
const end = await dash();
t('and it joins the statistics', /3 trades/.test(end), (end.match(/\d+ trades/)||[])[0]);
await p.evaluate(()=>location.hash='#/trades'); await p.waitForTimeout(450);
t('the Still open section is gone', !/STILL OPEN/i.test(await p.evaluate(()=>document.querySelector('.main').innerText)));

console.log(errs.length?'\nERRORS:\n'+errs.join('\n'):'\nno errors');
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
