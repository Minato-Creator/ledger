/* The morning page: write it, put a chart in it, come back tomorrow, come
   back to it after the trades are in, and make sure the vault carries it. */
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

const TODAY = new Date().toISOString().slice(0,10);
/* two trades today on gold, one on the index — so the strip has something
   real to compare the plan against */
const TRADES = [
  {id:'T1',accountId:'acc_1',assetClass:'Futures',pair:'XAUUSD',side:'buy',date:TODAY,
   timeOpen:'11:30',timeClose:'14:00',riskPercent:1,netResult:2930,entryPrice:4341,stopLoss:4332,exitPrice:4380,tagIds:[],notes:''},
  {id:'T2',accountId:'acc_1',assetClass:'Futures',pair:'OANDA:XAUUSD',side:'buy',date:TODAY,
   timeOpen:'15:05',timeClose:'15:40',riskPercent:1,netResult:-1000,entryPrice:4370,stopLoss:4360,exitPrice:4360,tagIds:[],notes:''},
  {id:'T3',accountId:'acc_1',assetClass:'Indices',pair:'NAS100',side:'sell',date:TODAY,
   timeOpen:'22:10',timeClose:'22:50',riskPercent:1,netResult:1000,entryPrice:20100,stopLoss:20160,exitPrice:20040,tagIds:[],notes:''},
];

const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1500,height:980}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({T})=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'R',theme:'dark',
      accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                 color:'#18AC65',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:T})],
  ]));
},{T:TRADES});
await p.addInitScript(FAKE_FS);
await p.addInitScript(() => { window.__mk = async (shade) => {
  const c=document.createElement('canvas'); c.width=160; c.height=90;
  const x=c.getContext('2d'); x.fillStyle=shade; x.fillRect(0,0,160,90);
  return new Promise(r=>c.toBlob(r,'image/jpeg',.9)); }; });
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});

t('the Plan sits in the top bar, before the journal is read back', await p.evaluate(()=>{
  const labels=[...document.querySelectorAll('.tb-tab > span:not(.count)')].map(n=>n.textContent);
  return labels.indexOf('Plan')===2 && labels.indexOf('Journal')===1; }),
  await p.evaluate(()=>[...document.querySelectorAll('.tb-tab > span:not(.count)')].map(n=>n.textContent).join(' · ')));

await p.evaluate(()=>{ location.hash='#/outlook'; }); await p.waitForTimeout(700);
t('the page opens on today', await p.evaluate(()=>/today/.test(document.querySelector('.day-nav').innerText)),
  await p.evaluate(()=>document.querySelector('.day-nav')?.innerText.replace(/\n/g,' ')));
t('it starts with one empty block', await p.evaluate(()=>document.querySelectorAll('.outlook-block').length) === 1);
t('and says nothing is written yet', await p.evaluate(()=>/nothing written yet/.test(document.querySelector('.head').innerText)));
t('tomorrow is not reachable', await p.evaluate(()=>[...document.querySelectorAll('.day-nav button')].pop().disabled));

// ---- write the first instrument
await p.locator('.ins-field').first().fill('oanda:xauusd');
await p.locator('.ins-field').first().blur();
await p.waitForTimeout(500);
t('the instrument name is cleaned on the way in',
  await p.evaluate(()=>document.querySelector('.ins-field').value) === 'XAUUSD',
  await p.evaluate(()=>document.querySelector('.ins-field').value));

await p.evaluate(()=>[...document.querySelectorAll('.bias-long')][0].click());
await p.locator('.outlook-notes').first().fill('Weekly still up. Want a sweep of the Asia low at 4331.40, then a reclaim.');
await p.waitForTimeout(1200);
t('it saved itself without being asked',
  await p.evaluate(()=>/saved \d\d:\d\d/.test(document.querySelector('.head').innerText)),
  await p.evaluate(()=>document.querySelector('.head').innerText.replace(/\n/g,' ')));

const onDisk = () => p.evaluate(()=>{ try { return JSON.parse(window.__files.get('data/outlooks.json')); } catch { return null; } });
let d = await onDisk();
t('and it landed in its own file in the vault', !!d && !!d.days[Object.keys(d.days)[0]], JSON.stringify(d).slice(0,110));
t('with the bias and the writing', (()=>{ const i=d.days[Object.keys(d.days)[0]].instruments[0];
  return i.pair==='XAUUSD' && i.bias==='long' && /Asia low/.test(i.notes); })(),
  JSON.stringify(d.days[Object.keys(d.days)[0]].instruments[0]).slice(0,120));

// ---- the strip
const strip = await p.evaluate(()=>document.querySelector('.ob-verdict')?.innerText.replace(/\n/g,' ') || '(none)');
console.log('    strip:', strip);
t('the strip shows what you actually did', /You said long/.test(strip) && /2 trades/.test(strip), strip);
t('it matched the broker-prefixed trade too', /2 trades/.test(strip), strip);
t('and totals the R', /\+1\.93R|\+1\.9/.test(strip), strip);

// ---- the chart: the instrument's live chart, not a screenshot
t('the block has the instrument’s chart, not a picture to add', await p.evaluate(()=>
  !!document.querySelector('.outlook-block .ob-chart .tc') && !document.querySelector('.outlook-block input[type=file]')
  && !document.querySelector('.outlook-shot, .ob-shot-add')));
t('without an OANDA key it says where to add one', await p.evaluate(()=>/Add your OANDA key/.test(document.querySelector('.ob-chart .tc-msg')?.innerText || '')));
t('writing and chart are half and half', await p.evaluate(()=>{
  const a=document.querySelector('.ob-text').getBoundingClientRect(), c=document.querySelector('.ob-chart').getBoundingClientRect();
  return Math.abs(a.width - c.width) < 4; }), await p.evaluate(()=>[document.querySelector('.ob-text').getBoundingClientRect().width, document.querySelector('.ob-chart').getBoundingClientRect().width].join(' / ')));
t('the outlooks file is in the vault too', await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  const { unzip } = await import('/js/vault.js');
  const out = await store.exportVault();
  return (await unzip(out.file)).some(f => /data\/outlooks\.json$/.test(f.name)); }));

// ---- a second instrument
await p.evaluate(()=>document.querySelector('.outlook-add').click());
await p.waitForTimeout(350);
t('a second block is added', await p.evaluate(()=>document.querySelectorAll('.outlook-block').length) === 2);
await p.locator('.ins-field').nth(1).fill('NAS100');
await p.locator('.ins-field').nth(1).blur();
await p.evaluate(()=>[...document.querySelectorAll('.bias-long')][1].click());
await p.locator('.outlook-notes').nth(1).fill('Wanted longs above the overnight high.');
await p.waitForTimeout(1200);

const strips = await p.evaluate(()=>[...document.querySelectorAll('.ob-verdict')].map(n=>n.innerText.replace(/\n/g,' ')));
console.log('    NAS strip:', strips[1]);
t('the second instrument gets its own strip', strips.length === 2, String(strips.length));
t('and it calls out trading against the plan', /Against what you wrote/.test(strips[1] || ''), strips[1]);

// ---- yesterday, and back
await p.evaluate(()=>document.querySelector('.day-nav button').click());
await p.waitForTimeout(800);
t('yesterday is a blank page', await p.evaluate(()=>
  document.querySelectorAll('.outlook-block').length === 1
  && !document.querySelector('.outlook-notes').value
  && /nothing written yet/.test(document.querySelector('.head').innerText)));
await p.evaluate(()=>[...document.querySelectorAll('.day-nav button')].pop().click());
await p.waitForTimeout(800);
t('and today comes back with both instruments',
  await p.evaluate(()=>document.querySelectorAll('.outlook-block').length) === 2,
  await p.evaluate(()=>[...document.querySelectorAll('.ins-field')].map(i=>i.value).join(',')));

// ---- an empty day is not written at all
d = await onDisk();
t('a day you only looked at is not stored', Object.keys(d.days).length === 1, Object.keys(d.days).join(','));

// ---- survives a restart
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(900);
await p.evaluate(()=>{ location.hash='#/outlook'; }); await p.waitForTimeout(900);
t('it is all still there after a restart', await p.evaluate(()=>
  [...document.querySelectorAll('.ins-field')].map(i=>i.value).join(',')) === 'XAUUSD,NAS100',
  await p.evaluate(()=>[...document.querySelectorAll('.ins-field')].map(i=>i.value).join(',')));
t('including what you wrote', await p.evaluate(()=>
  /Asia low/.test(document.querySelector('.outlook-notes').value)));

// ---- removing a block
/* It arms first, like every delete in the app. */
await p.evaluate(()=>document.querySelector('.ob-x').click());
await p.waitForTimeout(250);
t('removing an instrument asks first', await p.evaluate(()=>document.querySelectorAll('.outlook-block').length) === 2
  && await p.evaluate(()=>document.querySelector('.ob-x').textContent.trim()) === 'Delete?');
await p.evaluate(()=>document.querySelector('.ob-x').click());
await p.waitForTimeout(1000);
t('removing an instrument removes it', await p.evaluate(()=>document.querySelectorAll('.outlook-block').length) === 1);

t('no errors', errs.length===0, errs.join(' | ')||'clean');
await p.evaluate(()=>{ location.hash='#/outlook'; }); await p.waitForTimeout(700);
await p.screenshot({path:OUT + '/outlook-page.png'});
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
