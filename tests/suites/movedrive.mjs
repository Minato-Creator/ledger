/* Moving the vault to another drive, the way he would do it: open Settings,
   press Move, pick D:. Everything has to arrive — the trades and the charts —
   and the old folder has to be left alone, not quietly emptied. */
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


const src = fs.readFileSync(HERE + 'native.mjs','utf8');
const STUB = src.slice(src.indexOf('const TAURI_STUB = `')+20, src.indexOf('`;\n', src.indexOf('const TAURI_STUB = `')));
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(STUB);
await p.addInitScript(() => { window.__mk = async (shade) => {
  const c=document.createElement('canvas'); c.width=100; c.height=70;
  const x=c.getContext('2d'); x.fillStyle=shade; x.fillRect(0,0,100,70);
  return new Promise(r=>c.toBlob(r,'image/jpeg',0.9)); }; });
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(900);

// start on C:, the default
await p.evaluate(()=>[...document.querySelectorAll('button')].find(b=>/Use this folder/.test(b.textContent)).click());
await p.waitForTimeout(1100);
await p.locator('.main input').first().fill('Prop 100k');
await p.locator('.main input[inputmode="decimal"]').first().fill('100000');
await p.evaluate(()=>[...document.querySelectorAll('button')].find(b=>/Start|Create|Done/i.test(b.textContent))?.click());
await p.waitForTimeout(900);

// a trade with two charts, so there is something real to carry
await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  const id = await store.addTrade({ accountId: store.activeAccount.id, assetClass:'Futures', pair:'MGC',
    side:'buy', date:'2026-09-01', timeOpen:'09:10', timeClose:'10:00', riskPercent:1,
    netResult:912.5, entryPrice:4440, stopLoss:4430, exitPrice:4460, tagIds:[], notes:'the one that pays for the week' });
  const t = store.trades[0];
  await store.putShot(t.id, await window.__mk('#18AC65'), 'ltf');
  await store.putShot(t.id, await window.__mk('#F4624A'), 'htf');
});
await p.waitForTimeout(900);

const onC = await p.evaluate(()=>[...window.__TAURI_STUB_STATE__.files.keys()]
  .filter(k=>/Documents/.test(k)).map(k=>k.split('Ledger\\')[1]||k).sort());
console.log('    on C: ', onC.join(', '));
t('the vault is on C: to start with', onC.some(x=>/trades\.json$/.test(x)) && onC.filter(x=>/screenshots/.test(x)).length===2,
  onC.join(', '));

// --- the move ---
await p.evaluate(()=>{location.hash='#/settings/vault';});
await p.waitForTimeout(800);
const card = await p.evaluate(()=>[...document.querySelectorAll('.card')].map(c=>c.innerText).find(x=>/^Vault/.test(x)));
t('the Vault card offers Move vault, in plain sight', /Move vault/.test(card||''), (card||'').split('\n').slice(2,6).join(' · '));

await p.evaluate(()=>{ window.__PICK__ = 'D:\\\\Trading\\\\Ledger'; });
await p.evaluate(()=>[...document.querySelectorAll('.main button')]
  .find(b=>b.textContent.trim()==='Move vault').click());
await p.waitForTimeout(2200);

const said = await p.evaluate(()=>document.getElementById('toast')?.textContent || '');
t('it says where the vault is now', /Vault is now in/.test(said), said || '(nothing said)');

const onD = await p.evaluate(()=>[...window.__TAURI_STUB_STATE__.files.keys()]
  .filter(k=>k.startsWith('D:')).map(k=>k.replace(/^D:[\\/]+Trading[\\/]+Ledger[\\/]+/,'').replace(/[\\/]+/g,'/')).sort());
console.log('    on D: ', onD.join(', '));
t('the four data files landed on D:',
  ['data/accounts.json','data/trades.json','data/playbook.json','data/replay.json']
    .every(n=>onD.includes(n)), onD.join(', '));
t('and both charts came with them', onD.filter(x=>/screenshots/.test(x)).length===2, onD.join(', '));
t('the folder says what it is', onD.includes('vault.json'));

const now = await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  return { where: store.folderPath, trades: store.trades.length,
           note: store.trades[0]?.notes, net: store.trades[0]?.netResult,
           shots: store.shotNames().length };
});
t('the app is reading from D: now', /^D:/.test(now.where||''), now.where);
t('the trade is there, with its money and its note',
  now.trades===1 && now.net===912.5 && now.note==='the one that pays for the week', JSON.stringify(now));

// the charts still draw, from the new drive
await p.evaluate(async()=>{ const {store}=await import('/js/store.js');
  location.hash = '#/trade/' + store.trades[0].id; });
await p.waitForTimeout(1600);
const tiles = await p.evaluate(async () => {
  const out = [];
  for (const tile of document.querySelectorAll('.view .shot-view')) {
    const url = (getComputedStyle(tile).backgroundImage.match(/url\("?([^")]+)"?\)/)||[])[1];
    let w=0; if (url) await new Promise(r=>{const i=new Image();i.onload=()=>{w=i.naturalWidth;r();};i.onerror=r;i.src=url;});
    out.push({ w, missing: /picture missing/.test(tile.innerText) });
  }
  return out;
});
t('both charts open from the new drive', tiles.length===2 && tiles.every(x=>x.w===100 && !x.missing), JSON.stringify(tiles));

// the old folder is left alone — a move you can undo
const stillC = await p.evaluate(()=>[...window.__TAURI_STUB_STATE__.files.keys()]
  .filter(k=>/Documents.*Ledger/.test(k)).length);
t('the copy on C: is left where it was, not deleted', stillC >= 5, stillC + ' files still on C:');

// and it survives a restart
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1400);
const back = await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  return { where: store.folderPath, trades: store.trades.length, gate: !!document.querySelector('.gate-card') };
});
t('reopening the app goes straight to D:, with no questions',
  /^D:/.test(back.where||'') && back.trades===1 && !back.gate, JSON.stringify(back));

t('no errors anywhere in that', errs.length===0, errs.join(' | ')||'clean');
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
