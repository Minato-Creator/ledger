/* Clicking a square on the calendar has to answer the question you asked by
   clicking it: what did I do that day. */
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
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

/* Two trades on the 18th, one on the 17th, one still open on the 18th. */
const TRADES = [
  {id:'a1',accountId:'acc_1',assetClass:'Futures',pair:'XAUUSD',side:'buy',date:'2026-09-18',
   timeOpen:'11:30',timeClose:'14:00',riskPercent:1,netResult:2930,entryPrice:4341,stopLoss:4332,exitPrice:4380,tagIds:[],notes:''},
  {id:'a2',accountId:'acc_1',assetClass:'Futures',pair:'MNQ',side:'sell',date:'2026-09-18',
   timeOpen:'22:05',timeClose:'22:20',riskPercent:1,netResult:-1000,entryPrice:20100,stopLoss:20160,exitPrice:20160,tagIds:[],notes:''},
  {id:'a3',accountId:'acc_1',assetClass:'Forex',pair:'EURUSD',side:'buy',date:'2026-09-17',
   timeOpen:'16:40',timeClose:'17:20',riskPercent:1,netResult:500,entryPrice:1.09,stopLoss:1.088,exitPrice:1.092,tagIds:[],notes:''},
  {id:'a4',accountId:'acc_1',assetClass:'Futures',pair:'MGC',side:'buy',date:'2026-09-18',status:'open',
   timeOpen:'23:40',timeClose:null,riskPercent:1,netResult:null,entryPrice:4390,stopLoss:4380,tagIds:[],notes:'runner'},
];
const OUTLOOK = { version:1, days: { '2026-09-18': { date:'2026-09-18', updatedAt:'2026-09-18T07:12:00Z',
  instruments:[{id:'ob_1',pair:'XAUUSD',bias:'long',notes:'Sweep then reclaim.',shot:null}] } } };

const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1500,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({T,O})=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','V');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',
      accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                 color:'#18AC65',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:T})],
    ['data/outlooks.json', JSON.stringify(O)],
  ]));
},{T:TRADES,O:OUTLOOK});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});
await p.evaluate(()=>{ location.hash='#/calendar'; }); await p.waitForTimeout(900);

const rail = () => p.evaluate(()=>{
  const cards=[...document.querySelectorAll('.row > div:last-child .card')];
  return cards.map(c=>c.innerText.replace(/\n/g,' | ')).join('  ||  ');
});
t('the month rail is showing to begin with', /net/i.test(await rail()), (await rail()).slice(0,60));

const clickDay = (n) => p.evaluate(d=>{
  const btn=[...document.querySelectorAll('.cal-grid .cal-day')]
    .find(b=>b.querySelector('span')?.textContent.trim()===String(d));
  if (!btn) throw new Error('no cell for day '+d);
  btn.click();
}, n);

await clickDay(18); await p.waitForTimeout(700);
const day = await rail();
console.log('    18th:', day);
t('clicking the 18th opens that day', /18 sep/i.test(day), day.slice(0,40));
t('it shows the day’s money', /\+\$1,930/.test(day), day);
t('and the trade count with wins and losses', /3 trades · 1 W · 1 L/.test(day) || /2 trades · 1 W · 1 L/.test(day), day);
t('it says one is still open', /1 still open/.test(day), day);

const rows = await p.evaluate(()=>[...document.querySelectorAll('.day-row')].map(r=>r.innerText.replace(/\n/g,' ')));
console.log('    rows:', JSON.stringify(rows));
t('every trade on that day is listed', rows.length === 3, String(rows.length));
t('the open one is first and marked', /open/.test(rows[0]), rows[0]);
t('the closed ones carry their time and figure',
  rows.some(r=>/11:30/.test(r) && /XAUUSD/.test(r)) && rows.some(r=>/22:05/.test(r) && /MNQ/.test(r)), JSON.stringify(rows));
t('nothing from another day leaked in', !rows.some(r=>/EURUSD/.test(r)), JSON.stringify(rows));

t('the morning’s outlook is offered', /outlook/i.test(day) && /XAUUSD long/i.test(day), day);

// clicking a trade opens it
await p.evaluate(()=>document.querySelectorAll('.day-row')[1].click());
await p.waitForTimeout(800);
t('clicking a trade opens that trade', /#\/trade\//.test(await p.evaluate(()=>location.hash)),
  await p.evaluate(()=>location.hash));

await p.evaluate(()=>{ location.hash='#/calendar'; }); await p.waitForTimeout(800);
t('coming back, the day is still open', /18 sep/i.test(await rail()), (await rail()).slice(0,30));

// a day with nothing on it
await clickDay(2); await p.waitForTimeout(600);
const quiet = await rail();
t('a day you did not trade says so', /did not trade/.test(quiet), quiet.slice(0,70));

// closing
await clickDay(2); await p.waitForTimeout(600);
t('clicking the same day again closes it', /net/i.test(await rail()) && !/did not trade/.test(await rail()));

// changing month closes it too
await clickDay(18); await p.waitForTimeout(500);
await p.evaluate(()=>[...document.querySelectorAll('.head button')].find(b=>b.title==='Previous month').click());
await p.waitForTimeout(700);
t('changing month closes the day', !/18 sep/i.test(await rail()), (await rail()).slice(0,50));

t('no errors', errs.length===0, errs.join(' | ')||'clean');
/* back to September before the picture, so it shows a day with trades in it */
await p.evaluate(()=>[...document.querySelectorAll('.head button')].find(b=>b.title==='Next month').click());
await p.waitForTimeout(600);
await p.evaluate(()=>{
  const btn=[...document.querySelectorAll('.cal-grid .cal-day')].find(b=>b.querySelector('span')?.textContent.trim()==='18');
  btn?.click();
});
await p.waitForTimeout(700);
await p.screenshot({path:OUT + '/calday.png'});
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
