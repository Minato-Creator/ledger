/* Nothing in Quire deletes on one click. Every destructive button arms first,
   says what it is about to do, and lets go if you look away. */
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

const PB = {version:3, sessions:[{id:'ses_l',name:'London',start:'15:00',end:'19:00'},
                                 {id:'ses_n',name:'New York',start:'20:00',end:'23:00'}],
  setups:[{id:'s_a',name:'Sweep',color:'#0988F0',rules:[]}],
  tagGroups:[{id:'g1',name:'Mistakes',tags:[{id:'tg1',name:'Moved my stop'},{id:'tg2',name:'Unused tag'}]},
             {id:'g_empty',name:'Emotion',tags:[]}],
  replay:{windowMins:15,csvOffsetHours:0}};
const T=[{id:'T1',accountId:'acc_1',pair:'XAUUSD',side:'buy',date:'2026-09-14',timeOpen:'16:10',timeClose:'17:00',
  riskPercent:1,netResult:900,entryPrice:4440,stopLoss:4430,exitPrice:4460,tagIds:['tg1'],sessionId:'ses_l',
  setupId:'s_a',notes:'',status:'closed',mode:'live'},
 {id:'T2',accountId:'acc_1',pair:'NAS100',side:'sell',date:'2026-09-15',timeOpen:'21:00',timeClose:'21:40',
  riskPercent:1,netResult:-400,entryPrice:20000,stopLoss:20050,exitPrice:20020,tagIds:['tg1'],sessionId:'ses_n',
  setupId:'s_a',notes:'',status:'closed',mode:'live'}];

const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1500,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({PB,T})=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',
      accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                 color:'#18AC65',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:T})],
    ['data/playbook.json', JSON.stringify(PB)]]));
},{PB,T});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});

const find = label => p.evaluateHandle(l=>[...document.querySelectorAll('button')]
  .find(b=>b.textContent.trim() === l), label);
const textOf = async h => (await h.evaluate(n=>n && n.textContent.trim()));
const clickH = async h => { await h.evaluate(n=>n.click()); await p.waitForTimeout(220); };
const counts = () => p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  return { trades: store.trades.length,
           tags: store.playbook.tagGroups.flatMap(g=>g.tags).map(t=>t.name).join(','),
           groups: store.playbook.tagGroups.map(g=>g.name).join(','),
           sessions: store.playbook.sessions.map(s=>s.name).join(','),
           tagged: store.trades.filter(t=>(t.tagIds||[]).length).length };
});

/* ---------- deleting a trade ---------- */
await p.evaluate(()=>{location.hash='#/trade/T1';}); await p.waitForTimeout(800);
let btn = await find('Delete');
t('the trade page still offers Delete', await textOf(btn) === 'Delete');
await clickH(btn);
t('one click only arms it', await textOf(btn) === 'Confirm delete', await textOf(btn));
t('and it is marked as armed', await btn.evaluate(n=>n.classList.contains('is-armed')));
t('nothing has been deleted yet', (await counts()).trades === 2, JSON.stringify(await counts()));

/* clicking away lets go */
await p.mouse.click(700, 500); await p.waitForTimeout(250);
t('clicking elsewhere puts it back', await textOf(btn) === 'Delete', await textOf(btn));
t('and still nothing is deleted', (await counts()).trades === 2);

/* Escape lets go too */
await clickH(btn);
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
t('Escape puts it back as well', await textOf(btn) === 'Delete', await textOf(btn));

/* it lets go on its own */
await clickH(btn);
t('armed again', await textOf(btn) === 'Confirm delete');
await p.waitForTimeout(4400);
t('and it disarms itself after a few seconds', await textOf(btn) === 'Delete', await textOf(btn));
t('with the trade still there', (await counts()).trades === 2);

/* the second click does it */
await clickH(btn);
await clickH(btn);
await p.waitForTimeout(900);
t('two clicks delete the trade', (await counts()).trades === 1, JSON.stringify(await counts()));
t('and it takes you back to the list', await p.evaluate(()=>location.hash) === '#/trades',
  await p.evaluate(()=>location.hash));

/* ---------- the playbook ---------- */
await p.evaluate(()=>{location.hash='#/playbook';}); await p.waitForTimeout(900);

/* a tag, which comes off every trade that carried it */
const tagX = await p.evaluateHandle(()=>[...document.querySelectorAll('.tag button')]
  .find(b=>b.parentElement.textContent.trim().startsWith('Moved my stop')));
t('a tag offers a bare ×', await textOf(tagX) === '×', await textOf(tagX));
await clickH(tagX);
t('armed, it says how many trades it would touch', /delete · 1 trade/.test(await textOf(tagX)), await textOf(tagX));
t('the tag is still there', /Moved my stop/.test((await counts()).tags), (await counts()).tags);
await p.mouse.click(1200, 820); await p.waitForTimeout(250);
t('and clicking away puts the × back', await textOf(tagX) === '×', await textOf(tagX));
await clickH(tagX); await clickH(tagX); await p.waitForTimeout(700);
let v = await counts();
t('twice deletes the tag', !/Moved my stop/.test(v.tags), v.tags);
t('and takes it off the trade that used it', v.tagged === 0, JSON.stringify(v));

/* a tag group */
const grpBtn = await p.evaluateHandle(()=>[...document.querySelectorAll('button')]
  .filter(b=>b.textContent.trim()==='remove group')[1]);
await clickH(grpBtn);
t('a group arms too', await textOf(grpBtn) === 'confirm remove', await textOf(grpBtn));
t('and has not gone yet', /Emotion/.test((await counts()).groups), (await counts()).groups);
await clickH(grpBtn); await p.waitForTimeout(700);
t('twice removes the empty group', !/Emotion/.test((await counts()).groups), (await counts()).groups);

/* a session, which unlabels the trades that were in it */
const sesX = await p.evaluateHandle(()=>{
  const rows=[...document.querySelectorAll('input')].filter(i=>i.value==='New York');
  return rows[0].parentElement.querySelector('button:last-of-type');
});
await clickH(sesX);
t('a session arms and counts its trades', /delete/.test(await textOf(sesX)), await textOf(sesX));
t('and is still there', /New York/.test((await counts()).sessions), (await counts()).sessions);
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
t('Escape leaves the session alone', /New York/.test((await counts()).sessions));
await clickH(sesX); await clickH(sesX); await p.waitForTimeout(700);
t('twice removes it', !/New York/.test((await counts()).sessions), (await counts()).sessions);

/* the setup delete already asked, and still does */
await p.evaluate(()=>[...document.querySelectorAll('button')]
  .find(b=>b.querySelector('svg') && b.closest('.card')?.textContent.startsWith('Setups'))?.click());
await p.waitForTimeout(400);
t('deleting a setup still asks, in its own words',
  await p.evaluate(()=>/Delete “Sweep”\?/.test(document.body.innerText)),
  await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,120)));
await p.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Cancel')?.click());
await p.waitForTimeout(400);

/* ---------- the outlook page ---------- */
await p.evaluate(()=>{location.hash='#/outlook';}); await p.waitForTimeout(900);
await p.evaluate(()=>document.querySelector('.outlook-add')?.click()); await p.waitForTimeout(500);
const blocks = () => p.evaluate(()=>document.querySelectorAll('.outlook-block').length);
t('two instruments on the page', await blocks() === 2, String(await blocks()));
const trash = await p.evaluateHandle(()=>document.querySelector('.outlook-block .ob-x'));
await clickH(trash);
t('removing an instrument arms first', await textOf(trash) === 'Delete?', await textOf(trash));
t('and both are still there', await blocks() === 2, String(await blocks()));
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
t('Escape keeps them', await blocks() === 2);
await clickH(trash); await clickH(trash); await p.waitForTimeout(800);
t('twice removes one', await blocks() === 1, String(await blocks()));

/* ---------- nothing was lost to a stray click anywhere ---------- */
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1100);
v = await counts();
t('all of it held after a restart',
  v.trades === 1 && !/Moved my stop/.test(v.tags) && /Unused tag/.test(v.tags), JSON.stringify(v));

t('no errors', errs.length===0, errs.join(' | ')||'clean');
await p.screenshot({path:OUT + '/confirm.png'});
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
