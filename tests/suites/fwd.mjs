/* A forward test is a real decision and a fake dollar. It has to be saved,
   kept, and left out of the account's figures until you ask for it. */
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

const LIVE = {id:'L1',accountId:'acc_1',assetClass:'Futures',pair:'MGC',side:'buy',date:'2026-09-14',
  timeOpen:'09:10',timeClose:'10:00',riskPercent:1,netResult:1000,entryPrice:4440,stopLoss:4430,
  exitPrice:4460,tagIds:[],notes:'real money'};

const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1500,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({L})=>{
  if (localStorage.getItem('fakefs')) return;      // seed once; a reload must read what the app wrote
  localStorage.setItem('fakeroot','Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',
      accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                 color:'#18AC65',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:[L]})],
  ]));
},{L:LIVE});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});

const side = () => p.evaluate(()=>document.querySelector('.topbar').innerText);
t('with no test logged, no scope switch is offered', !/Forward test/.test(await side()),
  (await side()).split('\n').slice(0,6).join(' · '));

/* --- save a forward test through the real form --- */
await p.evaluate(()=>{location.hash='#/new';}); await p.waitForTimeout(700);
const modeBefore = await p.evaluate(()=>[...document.querySelectorAll('.seg button')]
  .map(x=>x.textContent.trim()+(x.classList.contains('is-on')?'*':'')).join(' '));
t('the form offers Live and Forward test, Live picked', /Live\*/.test(modeBefore), modeBefore);

await p.locator('.main input[placeholder]').first().fill('MNQ');
await p.evaluate(()=>[...document.querySelectorAll('.seg button')]
  .find(x=>x.textContent.trim()==='Forward test').click());
await p.waitForTimeout(250);
/* A forward test is typed in R — there is no money field on it to fill. */
await p.evaluate(()=>{
  const i = [...document.querySelectorAll('.main .result-band input')].find(n=>n.placeholder==='2.00');
  i.value = '2'; i.dispatchEvent(new Event('input',{bubbles:true}));
});
await p.waitForTimeout(300);
t('the money field is gone once Forward test is picked', await p.evaluate(()=>
  ![...document.querySelectorAll('.main .result-band .lbl')].some(n=>/Net result/i.test(n.textContent))));
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/Save trade/.test(x.textContent)).click());
await p.waitForTimeout(1200);

const saved = await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  return store.trades.map(t=>({id:t.id.slice(0,2), pair:t.pair, mode:t.mode, net:t.netResult, r:t.rMultiple}));
});
console.log('   ', JSON.stringify(saved));
t('the forward test is saved, and labelled forward',
  saved.some(x=>x.pair==='MNQ' && x.mode==='forward'), JSON.stringify(saved));
t('and carries an R and no money at all',
  saved.some(x=>x.pair==='MNQ' && x.net === null && x.r === 2), JSON.stringify(saved));
t('the older trade carries no label at all, as an old trade would',
  saved.some(x=>x.pair==='MGC' && x.mode === undefined), JSON.stringify(saved));

/* a second trade, saved with Live left alone, must say so explicitly */
await p.evaluate(()=>{location.hash='#/new';}); await p.waitForTimeout(700);
await p.locator('.main input[placeholder]').first().fill('ES');
await p.evaluate(()=>{
  const net = [...document.querySelectorAll('.main .result-band input')].find(i=>i.placeholder==='0.00');
  net.value = '500'; net.dispatchEvent(new Event('input',{bubbles:true}));
});
await p.waitForTimeout(250);
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/Save trade/.test(x.textContent)).click());
await p.waitForTimeout(1100);
t('a trade saved with Live selected is written as live', await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  return store.trades.find(t=>t.pair==='ES')?.mode; }) === 'live');

/* --- and it is kept out of the figures --- */
const scoped = async () => p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  const acct = store.activeAccount;
  return { counted: store.tradesFor(acct.id).length,
           pairs: store.tradesFor(acct.id).map(t=>t.pair).join(','),
           sidebar: document.querySelector('.acct-meta').textContent,
           navCount: document.querySelector('.tb-tab .count')?.textContent };
});
let s = await scoped();
console.log('    live only:', JSON.stringify(s));
t('the scope switch appears now that there is a test to count', /Forward test/.test(await side()));
t('the forward test is left out of the figures', s.counted === 2 && !/MNQ/.test(s.pairs), JSON.stringify(s));
t('and out of the account balance', /101,500/.test(s.sidebar), s.sidebar);
t('and out of the Trades count in the nav', s.navCount === '2', s.navCount);

/* --- flip it on --- */
await p.evaluate(()=>[...document.querySelectorAll('.topbar .scope-switch button')]
  .find(x=>x.textContent.trim()==='All').click());
await p.waitForTimeout(900);
s = await scoped();
console.log('    live + tests:', JSON.stringify(s));
t('with tests on, all three are counted', s.counted === 3 && /MNQ/.test(s.pairs), JSON.stringify(s));
/* A forward test risked nothing, so including it cannot move the balance by a
   cent. What changes is how many trades are counted, not how much was made. */
t('the balance does not move, because no money was ever at stake', /101,500/.test(s.sidebar), s.sidebar);
t('nav count follows too', s.navCount === '3', s.navCount);

/* --- it survives a restart --- */
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1100);
s = await scoped();
t('the choice is remembered across a restart', s.counted === 3, JSON.stringify(s));

/* --- and an old trade with no label reads as live --- */
const legacy = await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  delete store.trades.find(t=>t.pair==='MGC').mode;
  await store.setIncludeTests(false);
  return store.tradesFor(store.activeAccount.id).map(t=>t.pair);
});
t('a trade saved before this existed still counts as live', legacy.sort().join(',') === 'ES,MGC', legacy.join(','));

/* ---------- how a test reads in the tables ----------
   No size, because nothing was bought; no money, because none was at stake.
   A dash in those columns would read as "not filled in", so they say FT —
   and the R the test made is in the R column beside them, untouched. */
await p.evaluate(async()=>{ const { store } = await import('/js/store.js'); await store.setTradeScope('all'); });
await p.evaluate(()=>{location.hash='#/trades';}); await p.waitForTimeout(800);
const cells = () => p.evaluate(()=>[...document.querySelectorAll('.tbl-row')]
  .map(r=>[...r.children].map(c=>c.innerText.trim())));
let rows = await cells();
const fwdRow = rows.find(r=>r[0]==='MNQ'), liveRow = rows.find(r=>r[0]==='MGC');
console.log('   ', JSON.stringify(fwdRow), JSON.stringify(liveRow));
t('a forward test says FT where its size would be', fwdRow && fwdRow[4] === 'FT', JSON.stringify(fwdRow));
t('and FT where the money would be', fwdRow && fwdRow[8] === 'FT', JSON.stringify(fwdRow));
t('but keeps the R it actually made', fwdRow && fwdRow[7] === '+2.00', JSON.stringify(fwdRow));
t('a live trade is untouched', liveRow && liveRow[8] === '+$1,000.00' && liveRow[4] !== 'FT', JSON.stringify(liveRow));
t('the FT is a label, not a figure', await p.evaluate(()=>
  document.querySelectorAll('.ft-mark').length === 2), String(await p.evaluate(()=>document.querySelectorAll('.ft-mark').length)));

/* the same list on the dashboard reads the same way */
await p.evaluate(()=>{location.hash='#/';}); await p.waitForTimeout(800);
const dashRow = () => p.evaluate(()=>[...document.querySelectorAll('.db-tr')]
  .map(r=>({ pair: r.querySelector('.p').firstChild.textContent.trim(), r: r.querySelector('.r').innerText.trim(), n: r.querySelector('.n').innerText.trim() }))
  .find(r=>r.pair==='MNQ'));
const dash = await dashRow();
t('the dashboard list says FT too, rather than a different thing', dash && dash.n === 'FT', JSON.stringify(dash));
t('with the R still beside it', dash && dash.r === '+2.0R', JSON.stringify(dash));

/* and in every unit — there is no unit in which a test has money */
for (const u of ['%','R']) {
  await p.evaluate(x=>[...document.querySelectorAll('.unit-switch button')]
    .find(b=>b.textContent.trim()===x).click(), u);
  await p.waitForTimeout(500);
  const d = await dashRow();
  t(`still FT when the app is reading in ${u}`, d && d.n === 'FT', JSON.stringify(d));
}

t('no errors', errs.length===0, errs.join(' | ')||'clean');
await p.screenshot({path:OUT + '/fwd.png'});
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
