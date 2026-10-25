/* Export a vault, wipe the journal, import it back, and check that every
   trade and every chart came home. */
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

const trades=[
  {id:'t1',accountId:'acc_1',assetClass:'Futures',pair:'MGC',side:'buy',date:'2026-09-01',timeOpen:'09:10',timeClose:'10:00',riskPercent:1,netResult:900,entryPrice:4440,stopLoss:4430,exitPrice:4460,tagIds:[],notes:'first',setupId:null,sessionId:null},
  {id:'t2',accountId:'acc_1',assetClass:'Indices',pair:'MNQ',side:'sell',date:'2026-09-02',timeOpen:'22:10',timeClose:'23:00',riskPercent:1,netResult:-400,entryPrice:20100,stopLoss:20160,exitPrice:20140,tagIds:[],notes:'second',setupId:null,sessionId:null},
];
await p.addInitScript(({trades})=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',accounts:[{id:'acc_1',name:'Prop 100k',currency:'USD',startingBalance:100000,defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades})],
  ]));
},{trades});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar');

// give one trade two charts, so the export has pictures to carry
await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  const draw = async (shade) => {
    const c = document.createElement('canvas'); c.width = c.height = 40;
    const x = c.getContext('2d'); x.fillStyle = shade; x.fillRect(0,0,40,40);
    return new Promise(r => c.toBlob(r, 'image/jpeg'));
  };
  await store.putShot('t1', await draw('#18AC65'), 'ltf');
  await store.putShot('t1', await draw('#F4624A'), 'htf');
});
await p.waitForTimeout(500);
t('the charts are in the vault', await p.evaluate(()=>[...window.__files.keys()].filter(k=>/screenshots\//.test(k)).length) === 2);

// export
const out = await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  const { file, name, entries, missing } = await store.exportVault();
  window.__VAULT__ = file;
  return { name, entries, missing, size: file.size, type: file.type };
});
console.log('   ', JSON.stringify(out));
t('it produces a zip', out.type === 'application/zip' && out.size > 500);
t('named for the day', /^quire-vault-\d{4}-\d{2}-\d{2}\.zip$/.test(out.name), out.name);
/* Eight data files now: the cached calendar, the newswire and The Lab's rule
   sheets are part of the folder, so they are part of the vault. A vault is
   the folder as it stood, not a curated subset of it — and a stale feed
   costs nothing, since both refresh on open. */
t('with the manifest, ten data files (drawings too) and both charts', out.entries === 13, String(out.entries));
t('and nothing missing', out.missing === 0);

// what a real unzip sees
const names = await p.evaluate(async () => {
  const { unzip } = await import('/js/vault.js');
  return (await unzip(window.__VAULT__)).map(e => e.name).sort();
});
console.log('   ', names.join('  '));
t('the folder shape is inside it', names.includes('vault.json') && names.includes('data/trades.json')
  && names.filter(n=>n.startsWith('screenshots/')).length === 2, names.join(','));

// inspect before replacing
const found = await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  const { trades, accounts, shots } = await store.inspectVault(window.__VAULT__);
  return { trades, accounts, shots };
});
t('inspecting says what is in it without writing', JSON.stringify(found) === JSON.stringify({trades:2,accounts:1,shots:2}), JSON.stringify(found));

// now wreck the journal, then restore
await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  for (const t of [...store.trades]) await store.deleteTrade(t.id);
});
await p.waitForTimeout(400);
t('the journal is empty now', await p.evaluate(async()=>{const {store}=await import('/js/store.js');return store.trades.length;}) === 0);
t('and its charts are gone', await p.evaluate(()=>[...window.__files.keys()].filter(k=>/screenshots\//.test(k)).length) === 0);

const restored = await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  return store.importVault(window.__VAULT__);
});
await p.waitForTimeout(500);
console.log('   ', JSON.stringify(restored));
t('both trades are back', restored.trades === 2);
t('with their notes', await p.evaluate(async()=>{const {store}=await import('/js/store.js');
  return store.trades.map(t=>t.notes).sort().join(',');}) === 'first,second');
t('the account came back', restored.accounts === 1);
t('and both charts are real files again', await p.evaluate(()=>[...window.__files.keys()].filter(k=>/screenshots\//.test(k)).length) === 2);
t('the pictures actually open', await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  const { tradeShotsOf } = await import('/js/store.js');
  const t1 = store.trades.find(t => t.id === 't1');
  const url = await store.shotUrl(tradeShotsOf(t1)[0]);
  if (!url) return false;
  return new Promise(res => { const i = new Image(); i.onload = () => res(i.width === 40); i.onerror = () => res(false); i.src = url; });
}));

// a file that is not a vault
t('junk is refused with a reason', await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  try { await store.inspectVault(new Blob(['hello'])); return 'no error'; }
  catch (e) { return e.message; }
}) !== 'no error');

// and the buttons exist on the settings page
await p.evaluate(()=>location.hash='#/settings/vault'); await p.waitForTimeout(600);
const card = await p.evaluate(()=>[...document.querySelectorAll('.card')].find(c=>/^VAULT/i.test(c.innerText))?.innerText.replace(/\n/g,' | '));
console.log('   ', card);
t('the vault card is there', /Export/.test(card||'') && /Import/.test(card||''), card||'(missing)');
await p.screenshot({ path: OUT+'/vault-settings.png' });

console.log(errs.length?'\nERRORS:\n'+errs.join('\n'):'\nno errors');
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
