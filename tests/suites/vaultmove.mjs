/* An old vault — four loose files at the top — is tidied into data/ on open,
   without losing anything on the way. */
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
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[]; p.on('pageerror',e=>{errs.push(e.message); console.log('PAGEERROR', e.message);});
p.on('console', m=>{ if(m.type()==='error') console.log('CONSOLE', m.text()); });
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

// a vault written by the previous release
await p.addInitScript(()=>{
  localStorage.setItem('fakeroot','OldVault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['accounts.json', JSON.stringify({version:2,displayUnit:'$',accounts:[{id:'acc_1',name:'Old vault',currency:'USD',startingBalance:75000,defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-01-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['trades.json', JSON.stringify({version:1,trades:[
      {id:'t1',accountId:'acc_1',pair:'MGC',side:'buy',date:'2026-02-02',timeOpen:'09:00',timeClose:'10:00',riskPercent:1,netResult:750,entryPrice:4400,stopLoss:4390,exitPrice:4410,tagIds:[],notes:'kept'},
    ]})],
    ['playbook.json', JSON.stringify({version:3,setups:[{id:'s1',name:'Sweep',color:'#0988F0',rules:[]}],tagGroups:[{id:'g_exec',name:'Execution',tags:[]}],sessions:[],rules:{},replay:{windowMins:15,csvOffsetHours:8}})],
    ['replay/weeks.json', JSON.stringify({version:1,weeks:{'2026-W06':{importedAt:'x',source:'y',trades:[]}}})],
  ]));
});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar, .gate-card, .welcome-title', { timeout: 8000 });
await p.waitForTimeout(800);
console.log('   state:', await p.evaluate(()=>document.body.innerText.slice(0,120).replace(/\n/g,' | ')));

const after = await p.evaluate(()=>[...window.__files.keys()].sort());
console.log('   ', after.join('\n    '));
t('the four files moved into data/', ['data/accounts.json','data/trades.json','data/playbook.json','data/replay.json'].every(n=>after.includes(n)), after.join(','));
t('and the old copies are gone', !after.includes('trades.json') && !after.includes('accounts.json') && !after.includes('replay/weeks.json'));
t('the folder now says what it is', after.includes('vault.json'));
t('the account survived', await p.evaluate(()=>document.querySelector('.topbar').innerText).then(x=>/Old vault/.test(x)));
t('the trade survived', await p.evaluate(async()=>{const {store}=await import('/js/store.js');return store.trades.length;}) === 1);
t('with its note', await p.evaluate(async()=>{const {store}=await import('/js/store.js');return store.trades[0].notes;}) === 'kept');
t('the playbook survived', await p.evaluate(async()=>{const {store}=await import('/js/store.js');return store.playbook.setups[0]?.name;}) === 'Sweep');
t('and the replay weeks', await p.evaluate(async()=>{const {store}=await import('/js/store.js');return Object.keys(store.data.replay.weeks).length;}) === 1);
t('the manifest is readable JSON', await p.evaluate(()=>{ try { return !!JSON.parse(window.__files.get('vault.json')).kind; } catch { return false; } }));

// opening it a second time must not undo anything
await p.reload({waitUntil:'domcontentloaded'});
await p.waitForTimeout(900);
t('a second open changes nothing', await p.evaluate(async()=>{const {store}=await import('/js/store.js');return store.trades.length;}) === 1);
console.log(errs.length?'\nERRORS:\n'+errs.join('\n'):'\nno errors');
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
