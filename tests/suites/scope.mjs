/* Three ways to read the same journal: what you took for real, what you were
   testing, and both together. One switch, and every page follows it. */
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

const T=[
 {id:'L1',accountId:'acc_1',pair:'MGC',side:'buy',date:'2026-09-14',timeOpen:'09:10',timeClose:'10:00',
  riskPercent:1,netResult:1000,entryPrice:4440,stopLoss:4430,exitPrice:4460,tagIds:[],mode:'live',status:'closed'},
 {id:'L2',accountId:'acc_1',pair:'ES',side:'sell',date:'2026-09-15',timeOpen:'22:10',timeClose:'23:00',
  riskPercent:1,netResult:-500,entryPrice:5500,stopLoss:5510,exitPrice:5505,tagIds:[],mode:'live',status:'closed'},
 {id:'F1',accountId:'acc_1',pair:'MNQ',side:'buy',date:'2026-09-16',timeOpen:'20:00',timeClose:'21:00',
  riskPercent:null,netResult:null,rMultiple:2,entryPrice:20000,stopLoss:19950,exitPrice:20100,tagIds:[],mode:'forward',status:'closed'},
 {id:'F2',accountId:'acc_1',pair:'XAUUSD',side:'sell',date:'2026-09-17',timeOpen:'16:00',timeClose:'16:40',
  riskPercent:null,netResult:null,rMultiple:-1,entryPrice:4400,stopLoss:4410,exitPrice:4410,tagIds:[],mode:'forward',status:'closed'}];

const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1500,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({T})=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',
      accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                 color:'#18AC65',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:T})]]));
},{T});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});

const sw = () => p.evaluate(()=>{
  const s=document.querySelector('.scope-switch');
  if (!s) return null;
  return { labels:[...s.children].map(b=>b.textContent.trim()),
           on:[...s.children].find(b=>b.classList.contains('is-on'))?.textContent.trim(),
           fits: s.scrollWidth <= s.clientWidth+1 && [...s.children].every(b=>b.scrollWidth<=b.clientWidth+1),
           width: Math.round(s.getBoundingClientRect().width) };
});
const pick = label => p.evaluate(l=>[...document.querySelector('.scope-switch').children]
  .find(b=>b.textContent.trim()===l).click(), label);
const state = () => p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  const rows = store.tradesFor(store.activeAccount.id);
  return { scope: store.tradeScope, n: rows.length, pairs: rows.map(t=>t.pair).sort().join(','),
           meta: document.querySelector('.acct-meta').textContent.trim(),
           nav: document.querySelector('.tb-tab .count')?.textContent };
});

/* ---------- the switch itself ---------- */
let s = await sw();
t('three choices, spelled out', s && s.labels.join(' / ') === 'Live / Forward test / All', JSON.stringify(s && s.labels));
t('none of the words are cut off in the top bar', s && s.fits, JSON.stringify(s));
t('it stays compact beside the unit switch', s && s.width <= 260, String(s && s.width));
t('live is where a journal starts', s && s.on === 'Live', String(s && s.on));

/* ---------- live ---------- */
let v = await state();
t('live counts the real trades only', v.n === 2 && v.pairs === 'ES,MGC', JSON.stringify(v));
t('and the balance is the money those made', /100,500/.test(v.meta), v.meta);
t('the nav count agrees', v.nav === '2', v.nav);

/* ---------- forward test only ---------- */
await pick('Forward test'); await p.waitForTimeout(700);
v = await state();
t('forward test counts the tests and nothing else', v.n === 2 && v.pairs === 'MNQ,XAUUSD', JSON.stringify(v));
t('the balance is still the money in the account, and the tests add nothing to it',
  /100,500 · 0\.00%/.test(v.meta), v.meta);
t('the nav count follows', v.nav === '2', v.nav);
t('the switch shows where you are', (await sw()).on === 'Forward test');

/* the R figures are the ones that mean something here */
await p.evaluate(()=>{location.hash='#/';}); await p.waitForTimeout(700);
const rOnly = await p.evaluate(async()=>{
  const { store } = await import('/js/store.js'); const c = await import('/js/calc.js');
  const rows = store.tradesFor(store.activeAccount.id);
  return rows.map(t=>c.rMultiple(store.activeAccount,t)).reduce((a,b)=>a+b,0);
});
t('+2R and −1R add up to +1R over the tests', Math.abs(rOnly - 1) < 1e-9, String(rOnly));

/* ---------- all ---------- */
await pick('All'); await p.waitForTimeout(700);
v = await state();
t('all counts every one of them', v.n === 4 && v.pairs === 'ES,MGC,MNQ,XAUUSD', JSON.stringify(v));
t('the balance still only has the real money in it', /100,500/.test(v.meta), v.meta);
t('the nav count is four', v.nav === '4', v.nav);

/* ---------- every page follows it ---------- */
const counts = {};
for (const [hash,name] of [['#/trades','trades'],['#/calendar','calendar'],['#/analytics','analytics']]) {
  await p.evaluate(h=>{location.hash=h;},hash); await p.waitForTimeout(500);
  counts[name] = await p.evaluate(()=>document.querySelector('.main').innerText.replace(/\s+/g,' ').slice(0,90));
}
await pick('Live'); await p.waitForTimeout(600);
await p.evaluate(()=>{location.hash='#/trades';}); await p.waitForTimeout(600);
const liveTrades = await p.evaluate(()=>document.querySelector('.main').innerText);
t('the Trades page drops the tests when you go back to live',
  !/MNQ/.test(liveTrades) && /MGC/.test(liveTrades), liveTrades.replace(/\s+/g,' ').slice(0,80));
await pick('Forward test'); await p.waitForTimeout(600);
const fwdTrades = await p.evaluate(()=>document.querySelector('.main').innerText);
t('and shows only the tests on forward test',
  /MNQ/.test(fwdTrades) && !/MGC/.test(fwdTrades), fwdTrades.replace(/\s+/g,' ').slice(0,80));

/* ---------- it is remembered ---------- */
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1100);
t('the choice survives a restart', (await state()).scope === 'forward', (await state()).scope);
t('and the switch comes back on it', (await sw()).on === 'Forward test');

/* ---------- what is written to the vault ---------- */
const onDisk = await p.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('fakefs')).find(([k])=>k==='data/accounts.json')[1]));
t('the vault records which of the three it is', onDisk.tradeScope === 'forward', JSON.stringify(onDisk.tradeScope));

await pick('All'); await p.waitForTimeout(600);
const onDisk2 = await p.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('fakefs')).find(([k])=>k==='data/accounts.json')[1]));
t('an older copy of the app reading this vault still sees tests counted',
  onDisk2.includeTests === true, JSON.stringify(onDisk2.includeTests));
await pick('Forward test'); await p.waitForTimeout(600);
const onDisk3 = await p.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('fakefs')).find(([k])=>k==='data/accounts.json')[1]));
t('and sees them not counted on the two scopes that are not all',
  onDisk3.includeTests === false, JSON.stringify(onDisk3.includeTests));

/* ---------- a journal written before any of this existed ---------- */
const old = await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  delete store.data.accounts.tradeScope;
  store.data.accounts.includeTests = true;
  const a = store.tradeScope;
  store.data.accounts.includeTests = false;
  const b = store.tradeScope;
  delete store.data.accounts.includeTests;
  return [a, b, store.tradeScope];
});
t('a vault that said "count the tests" reads as all', old[0] === 'all', JSON.stringify(old));
t('one that said not to reads as live', old[1] === 'live', JSON.stringify(old));
t('and one that never said anything reads as live', old[2] === 'live', JSON.stringify(old));

/* ---------- the switch does not strand you ---------- */
await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  await store.setTradeScope('forward');
});
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1000);
await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  for (const id of ['F1','F2']) await store.deleteTrade(id);
});
await p.waitForTimeout(700);
t('with every test deleted the switch stays, so you can get back to live',
  (await sw()) !== null, JSON.stringify(await sw()));
await pick('Live'); await p.waitForTimeout(700);
t('and going back to live shows the real trades again', (await state()).n === 2);
t('now it is out of the way again', (await sw()) === null);

t('no errors', errs.length===0, errs.join(' | ')||'clean');
await p.screenshot({path:OUT + '/scope-final.png'});
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
