/* The trade form's shape: the two switches live with the fields they govern,
   tags have the right-hand side, and a running trade offers the one thing you
   opened it to do. */
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

const PB={version:3,setups:[],sessions:[],replay:{windowMins:15,csvClock:'local'},
  tagGroups:[{id:'g1',name:'Mistakes',tags:[{id:'b1',name:'Moved my stop'}]}]};
const OPEN={id:'T9',accountId:'acc_1',pair:'XAUUSD',side:'buy',date:'2026-09-26',timeOpen:'16:10',timeClose:null,
  riskPercent:1,netResult:null,rMultiple:null,entryPrice:4440,stopLoss:4430,takeProfit:4480,exitPrice:null,
  tagIds:['b1'],status:'open',mode:'live',notes:'',shots:[]};
const DONE={id:'T8',accountId:'acc_1',pair:'NAS100',side:'buy',date:'2026-09-25',timeOpen:'20:00',timeClose:'21:00',
  riskPercent:1,netResult:900,entryPrice:20000,stopLoss:19950,exitPrice:20090,tagIds:[],status:'closed',mode:'live',notes:'',shots:[]};

const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1500,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error'&&!/TUNNEL|fonts|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({PB,OPEN,DONE})=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',
      accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                 color:'#18AC65',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:[OPEN,DONE]})],
    ['data/playbook.json', JSON.stringify(PB)]]));
},{PB,OPEN,DONE});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});

const head = () => p.evaluate(()=>document.querySelector('.head').innerText.replace(/\s+/g,' ').trim());
const bandOf = word => p.evaluate(w=>{
  const band = [...document.querySelectorAll('.trade-form .band')].find(x=>new RegExp(w,'i').test(x.innerText));
  return band ? band.innerText.replace(/\s+/g,' ').trim() : null;
}, word);
const onNow = () => p.evaluate(()=>[...document.querySelectorAll('.trade-form .seg button')]
  .filter(x=>x.classList.contains('is-on')).map(x=>x.textContent.trim()));
const col = n => p.evaluate(i=>{
  const c = document.querySelectorAll('.trade-form > .col')[i];
  return c ? c.innerText.replace(/\s+/g,' ').trim() : null;
}, n);

/* ---------- a new trade ---------- */
await p.evaluate(()=>{location.hash='#/new';}); await p.waitForTimeout(800);

t('the header carries no switches any more',
  !/Still open|Forward test/.test(await head()), await head());
t('Status sits in the form, with its own label', /STATUS/i.test(await bandOf('status') || ''), await bandOf('status'));
t('and Trade type beside it', /TRADE TYPE/i.test(await bandOf('status') || ''), await bandOf('status'));
t('both in the same band as the result they decide',
  /RISK %|NET RESULT/i.test(await bandOf('status') || ''), await bandOf('status'));
t('Closed and Live are where a new trade starts',
  (await onNow()).join() === 'Closed,Live', JSON.stringify(await onNow()));

/* ---------- the columns swapped ---------- */
t('tags have the right-hand side now', /TAGS/i.test(await col(1) || ''), (await col(1) || '').slice(0, 60));
t('and the charts run across the foot of the form, under both columns', await p.evaluate(() => {
  const w = document.querySelector('.trade-form > .tf-wide');
  return !!w && /CHARTS/i.test(w.innerText) && w.getBoundingClientRect().top >= Math.max(...[...document.querySelectorAll('.trade-form > .col')].map(c => c.getBoundingClientRect().bottom)) - 1; }));
t('the left column keeps the typing', /INSTRUMENT/i.test(await col(0) || ''));
t('and tags are no longer squeezed in beside the notes',
  !/TAGS/i.test(await col(0) || ''), (await col(0) || '').slice(-60));
t('the chart box is a fraction of the card, not half of it', await p.evaluate(()=>{
  const form = document.querySelector('.trade-form').getBoundingClientRect();
  const zone = document.querySelector('.shot-zone')?.getBoundingClientRect();
  return zone ? zone.height / form.height < 0.16 : false;
}), await p.evaluate(()=>{
  const form = document.querySelector('.trade-form').getBoundingClientRect();
  const zone = document.querySelector('.shot-zone')?.getBoundingClientRect();
  return zone ? Math.round(zone.height) + ' of ' + Math.round(form.height) : '(none)';
}));

/* a new trade has nothing to close */
t('a new trade is not offered a way to close itself',
  await p.evaluate(()=>!document.querySelector('.btn-close-now')));

/* ---------- a trade that is already closed ---------- */
await p.evaluate(()=>{location.hash='#/edit/T8';}); await p.waitForTimeout(800);
t('nor is one that is already finished',
  await p.evaluate(()=>!document.querySelector('.btn-close-now')), await head());

/* ---------- a running trade ---------- */
await p.evaluate(()=>{location.hash='#/edit/T9';}); await p.waitForTimeout(800);
t('a running trade opens on Still open', (await onNow()).includes('Still open'), JSON.stringify(await onNow()));
t('and offers to close it, up where your eye already is',
  await p.evaluate(()=>!!document.querySelector('.btn-close-now')), await head());
t('the exit and closing time are greyed until then', await p.evaluate(()=>{
  const dis = [...document.querySelectorAll('.trade-form input')].filter(i=>i.disabled).length;
  return dis === 2; }), String(await p.evaluate(()=>[...document.querySelectorAll('.trade-form input')].filter(i=>i.disabled).length)));
t('and there is no result to fill in yet',
  !/NET RESULT/i.test(await bandOf('status') || ''), await bandOf('status'));

/* one click and it is closed, ready to fill in */
await p.evaluate(()=>document.querySelector('.btn-close-now').click());
await p.waitForTimeout(500);
t('one click switches it to Closed', (await onNow()).includes('Closed'), JSON.stringify(await onNow()));
t('the result field it needs appears', /NET RESULT/i.test(await bandOf('status') || ''), await bandOf('status'));
t('exit and closing time come alive',
  await p.evaluate(()=>[...document.querySelectorAll('.trade-form input')].filter(i=>i.disabled).length) === 0);
t('the cursor is already in the first box it turned on', await p.evaluate(()=>{
  const a = document.activeElement;
  const lbl = a?.closest('div')?.querySelector('.lbl')?.textContent?.trim();
  return lbl; }) === 'Exit', await p.evaluate(()=>document.activeElement?.closest('div')?.querySelector('.lbl')?.textContent));
t('and the button goes, because there is nothing left for it to do',
  await p.evaluate(()=>!document.querySelector('.btn-close-now')));
t('the top strip stops saying Open', !/Open/.test(await p.evaluate(()=>
  document.querySelector('.trade-strip').innerText)), await p.evaluate(()=>
  document.querySelector('.trade-strip').innerText.replace(/\s+/g,' ').slice(0,50)));

/* fill it in and save */
await p.evaluate(()=>{
  const set=(n,v)=>{ n.value=v; n.dispatchEvent(new Event('input',{bubbles:true})); };
  set([...document.querySelectorAll('.trade-form input')].find(i=>i.closest('div')?.querySelector('.lbl')?.textContent?.trim()==='Exit'), '4475');
  set([...document.querySelectorAll('.result-band input')].find(i=>i.placeholder==='0.00'), '1400');
});
await p.waitForTimeout(350);
await p.evaluate(()=>[...document.querySelectorAll('.head button')].find(x=>/Save changes/.test(x.textContent)).click());
await p.waitForTimeout(1300);
const saved = await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  const t = store.trades.find(x=>x.id==='T9');
  return { status: t.status, net: t.netResult, exit: t.exitPrice };
});
t('and it saves as a finished trade', saved.status === 'closed' && saved.net === 1400 && saved.exit === 4475,
  JSON.stringify(saved));

t('no errors', errs.length===0, errs.join(' | ')||'clean');
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
