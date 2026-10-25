/* The question: if I export a vault and import it, is everything back —
   every field of every trade, and both photos, showing, without me doing
   anything else?  Asked twice: once on browser storage, where the pictures
   live in IndexedDB, and once in a real folder, where they are files. */
import pw from 'playwright';
import fsn from 'node:fs';
import crypto from 'node:crypto';
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


const FAKE_FS = fsn.readFileSync(HERE + 'e2e.mjs','utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass=0, fail=0;
const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

/* Three trades that between them use nearly every field there is, so a
   round trip that loses one is a round trip that fails. */
const TRADES = [
  {id:'t1',accountId:'acc_1',assetClass:'Futures',pair:'MGC',side:'buy',date:'2026-09-01',
   timeOpen:'09:10',timeClose:'10:00',riskPercent:1.25,netResult:912.5,rMultiple:1.83,
   entryPrice:4440.7,stopLoss:4430.2,takeProfit:4470,exitPrice:4460.4,size:2,commission:4.4,
   setupId:'s1',sessionId:'sess_london',tagIds:['g1','g2'],grade:'A',
   notes:'held it through the pullback, exit at target minus a tick',
   shotLtf:'screenshots/t1-ltf.jpg',shotHtf:'screenshots/t1-htf.jpg'},
  {id:'t2',accountId:'acc_1',assetClass:'Indices',pair:'MNQ',side:'sell',date:'2026-09-02',
   timeOpen:'22:10',timeClose:'23:05',riskPercent:0.75,netResult:-1.2,outcome:'breakeven',
   entryPrice:20100,stopLoss:20160,exitPrice:20101,tagIds:['g2'],notes:'scratch',
   setupId:null,sessionId:null,shotLtf:'screenshots/t2-ltf.jpg'},
  {id:'t3',accountId:'acc_1',assetClass:'Forex',pair:'EURUSD',side:'buy',date:'2026-09-11',
   timeOpen:'16:40',timeClose:null,riskPercent:1,netResult:null,status:'open',
   entryPrice:1.0912,stopLoss:1.0888,takeProfit:1.0975,tagIds:[],notes:'runner',
   setupId:'s1',sessionId:null},
];
const ACCOUNTS = {version:2,displayUnit:'$',theme:'dark',background:'rain',glass:true,
  userName:'Minato',colours:{profit:'#00C48C',loss:'#FB7185'},
  accounts:[{id:'acc_1',name:'Prop 100k',currency:'USD',startingBalance:100000,
             defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-09-01',archived:false,
             weeklyTargetPercent:2}],activeAccountId:'acc_1'};
const PLAYBOOK = {version:3,setups:[{id:'s1',name:'Failed breakdown',rules:['sweep the low','reclaim','retest']}],
  tagGroups:[{id:'g_exec',name:'Execution',tags:[{id:'g1',name:'A+ setup'}]},
             {id:'g_mistake',name:'Mistakes',tags:[{id:'g2',name:'moved my stop'}]}],
  sessions:[{id:'sess_london',name:'London',start:'15:00',end:'23:00'}],
  rules:{maxTradesPerDay:3,dailyLossCapPercent:3},
  replay:{windowMins:15,csvOffsetHours:8}};

/* Distinct pictures, so "the photo came back" cannot pass by accident. */
const PAINT = `
window.__bytes = async (name) => {
  const { store } = await import('/js/store.js');
  const url = await store.shotUrl(name);
  if (!url) return null;
  const r = await fetch(url);
  return [...new Uint8Array(await r.arrayBuffer())];
};
window.__mk = async (shade, n) => {
  const c = document.createElement('canvas'); c.width = 120; c.height = 80;
  const x = c.getContext('2d');
  x.fillStyle = shade; x.fillRect(0,0,120,80);
  x.fillStyle = '#000'; x.font = '40px monospace'; x.fillText(String(n), 12, 55);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
};`;

const sha = buf => crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex').slice(0,16);

async function run(label, { folder }) {
  console.log(`\n======== ${label} ========`);
  const b = await pw.chromium.launch({ executablePath: CHROME });
  const ctx = await b.newContext({ viewport:{width:1500,height:950}, acceptDownloads:true });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message+' @@ '+(e.stack||'').split('\n').slice(1,3).join(' | ')));
  p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });

  await p.addInitScript(PAINT);
  if (folder) {
    await p.addInitScript(({A,T,P})=>{
      if (localStorage.getItem('fakefs')) return;
      localStorage.setItem('fakeroot','Ledger');
      localStorage.setItem('fakefs', JSON.stringify([
        ['data/accounts.json', JSON.stringify(A)],
        ['data/trades.json', JSON.stringify({version:1,trades:T})],
        ['data/playbook.json', JSON.stringify(P)],
      ]));
    },{A:ACCOUNTS,T:TRADES,P:PLAYBOOK});
    await p.addInitScript(FAKE_FS);
  } else {
    // no folder anywhere: browser storage, pictures in IndexedDB
    await p.addInitScript(({A,T,P})=>{
      delete window.showDirectoryPicker;
      if (localStorage.getItem('ledger:file:data/trades.json')) return;
      localStorage.setItem('ledger:file:data/accounts.json', JSON.stringify(A));
      localStorage.setItem('ledger:file:data/trades.json', JSON.stringify({version:1,trades:T}));
      localStorage.setItem('ledger:file:data/playbook.json', JSON.stringify(P));
    },{A:ACCOUNTS,T:TRADES,P:PLAYBOOK});
  }

  await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('.topbar',{timeout:8000});

  /* ---- put three real pictures in ---- */
  await p.evaluate(async () => {
    const { store } = await import('/js/store.js');
    await store.putShot('t1', await window.__mk('#18AC65',1), 'ltf');
    await store.putShot('t1', await window.__mk('#F4624A',2), 'htf');
    await store.putShot('t2', await window.__mk('#0988F0',3), 'ltf');
  });
  await p.waitForTimeout(600);

  /* ---- snapshot of the truth, before ---- */
  const before = await p.evaluate(async () => {
    const { store } = await import('/js/store.js');
    const shots = {};
    for (const n of new Set(store.shotNames())) shots[n] = await window.__bytes(n);
    return { trades: store.data.trades, accounts: store.data.accounts,
             playbook: store.data.playbook, replay: store.data.replay, shots,
             backend: store.isLocal ? 'browser storage' : store.folderName };
  });
  const beforeShots = Object.fromEntries(Object.entries(before.shots).map(([k,v])=>[k, v&&sha(v)]));
  console.log('    backend:', before.backend, '· pictures:', Object.keys(beforeShots).join(', '));
  t('three pictures are stored', Object.values(beforeShots).every(Boolean) && Object.keys(beforeShots).length===3,
    JSON.stringify(beforeShots));

  /* ---- export, by clicking the button he would click ---- */
  await p.evaluate(()=>{location.hash='#/settings/vault';}); await p.waitForTimeout(500);
  const dlP = p.waitForEvent('download',{timeout:8000}).catch(()=>null);
  await p.evaluate(()=>[...document.querySelectorAll('.main button')]
    .find(x=>x.textContent.trim()==='Export').click());
  const dl = await dlP;
  t('Export gives a file', !!dl, dl ? await dl.suggestedFilename() : 'no download');
  if (!dl) { await b.close(); return; }
  const zipPath = OUT + '/round-' + (folder?'folder':'browser') + '.zip';
  await dl.saveAs(zipPath);
  const bytes = fsn.readFileSync(zipPath);
  t('it is a real zip, not empty', bytes[0]===0x50 && bytes[1]===0x4b && bytes.length>1500,
    (bytes.length/1024).toFixed(1)+' KB');

  /* ---- a brand new machine: nothing left at all ---- */
  await p.evaluate(async () => {
    localStorage.clear();
    if (typeof indexedDB?.deleteDatabase === 'function') {
      const dbs = indexedDB.databases ? await indexedDB.databases() : [{ name: 'ledger-shots' }];
      for (const d of dbs) await new Promise(r => {
        const q = indexedDB.deleteDatabase(d.name); q.onsuccess=q.onerror=q.onblocked=r; });
    }
  });
  // A second page, with no seeding behind it — this is a machine that has
  // never seen the journal, only the zip.
  const q = await ctx.newPage();
  q.on('pageerror',e=>errs.push('after wipe: '+e.message+' @@ '+(e.stack||'').split('\n').slice(1,3).join(' | ')));
  q.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
  await q.addInitScript(PAINT);
  if (folder) {
    await q.addInitScript(() => { localStorage.setItem('fakeroot','Ledger'); localStorage.setItem('fakefs','[]'); });
    await q.addInitScript(FAKE_FS);
  }
  await p.close();
  await q.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
  await q.waitForTimeout(900);
  const wiped = await q.evaluate(async () => {
    const { store } = await import('/js/store.js');
    return { trades: store.trades.length, accounts: store.allAccounts.length };
  });
  t('the journal really is gone', wiped.trades===0, JSON.stringify(wiped));

  /* ---- import, by clicking the button he would click ---- */
  await q.evaluate(()=>{location.hash='#/settings/vault';}); await q.waitForTimeout(600);
  const hasCard = await q.evaluate(()=>/Vault/.test(document.querySelector('.main')?.innerText||''));
  t('Settings is reachable on a fresh journal', hasCard);
  await q.setInputFiles('.main input[type=file][accept*=zip]', zipPath);
  await q.waitForTimeout(700);
  const asked = await q.evaluate(()=>document.querySelector('.main')?.innerText||'');
  t('it says what it found before touching anything', /3 trades · 1 accounts · 3 charts/.test(asked),
    (asked.match(/\d+ trades · \d+ accounts · \d+ charts/)||['(not shown)'])[0]);
  await q.evaluate(()=>[...document.querySelectorAll('.main button')]
    .find(x=>x.textContent.trim()==='Replace').click());
  await q.waitForTimeout(1200);

  /* ---- and now: is everything back? ---- */
  const after = await q.evaluate(async () => {
    const { store } = await import('/js/store.js');
    const shots = {};
    for (const n of new Set(store.shotNames())) shots[n] = await window.__bytes(n);
    return { trades: store.data.trades, accounts: store.data.accounts,
             playbook: store.data.playbook, replay: store.data.replay, shots };
  });
  const afterShots = Object.fromEntries(Object.entries(after.shots).map(([k,v])=>[k, v&&sha(v)]));

  const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
  t('every trade is back, field for field', same(before.trades, after.trades),
    same(before.trades, after.trades) ? `${after.trades.trades.length} trades` : 'DIFFERS');
  if (!same(before.trades, after.trades)) {
    for (let i=0;i<TRADES.length;i++) {
      const x=before.trades.trades[i], y=after.trades.trades[i];
      if (!same(x,y)) console.log('        trade', i, '\n          was:', JSON.stringify(x), '\n          now:', JSON.stringify(y));
    }
  }
  t('the account, balance, target and colours are back', same(before.accounts, after.accounts));
  t('setups, tags and sessions are back', same(before.playbook, after.playbook));
  t('the replay weeks are back', same(before.replay, after.replay));
  t('all three pictures came back byte for byte', same(beforeShots, afterShots),
    JSON.stringify(afterShots));

  /* ---- and they SHOW, with no further clicking ---- */
  await q.evaluate(()=>{location.hash='#/trade/t1';});
  await q.waitForTimeout(1400);
  const shown = await q.evaluate(async () => {
    const tiles = [...document.querySelectorAll('.view .shot-view')];
    const out = [];
    for (const tile of tiles) {
      const bg = getComputedStyle(tile).backgroundImage;
      const url = (bg.match(/url\("?([^")]+)"?\)/) || [])[1] || null;
      let w = 0, h = 0;
      if (url) await new Promise(r => { const i = new Image();
        i.onload = () => { w = i.naturalWidth; h = i.naturalHeight; r(); }; i.onerror = r; i.src = url; });
      out.push({ hasPicture: !!url, w, h, missing: /picture missing/.test(tile.innerText),
                 waiting: tile.classList.contains('is-waiting'), label: tile.title });
    }
    return out;
  });
  t('both of t1’s chart tiles are on the page', shown.length===2,
    shown.length + ' tiles: ' + shown.map(x=>x.label).join(', '));
  t('neither says the picture is missing', shown.length===2 && shown.every(x=>!x.missing && !x.waiting),
    JSON.stringify(shown));
  t('and both are real pixels — 120x80, the size that went in',
    shown.length===2 && shown.every(x=>x.w===120 && x.h===80), JSON.stringify(shown.map(x=>x.w+'x'+x.h)));

  // clicking one opens it full size, which is the other place the bytes have to work
  await q.evaluate(()=>document.querySelector('.view .shot-view').click());
  await q.waitForTimeout(900);
  const big = await q.evaluate(()=>{ const i=document.querySelector('img:not(.brand-img)');
    return i ? { w:i.naturalWidth, h:i.naturalHeight } : null; });
  t('it opens full size', big && big.w===120 && big.h===80, JSON.stringify(big));
  await q.keyboard.press('Escape'); await q.waitForTimeout(400);

  await q.evaluate(()=>{location.hash='#/trade/t2';});
  await q.waitForTimeout(1400);
  const two = await q.evaluate(()=>[...document.querySelectorAll('.view .shot-view')]
    .map(x=>({ bg: /url\(/.test(getComputedStyle(x).backgroundImage), missing: /picture missing/.test(x.innerText) })));
  t('t2’s single chart is there too', two.length===1 && two[0].bg && !two[0].missing, JSON.stringify(two))

  /* ---- the settings that are not trades ---- */
  const look = await q.evaluate(async () => {
    const { store } = await import('/js/store.js');
    return { name: store.userName, bg: store.background, glass: store.glass,
             profit: store.colours.profit, target: store.allAccounts[0].weeklyTargetPercent };
  });
  t('the name, background, glass, colours and target came back',
    look.name==='Minato' && look.bg==='rain' && look.glass===true
    && look.profit==='#00C48C' && look.target===2, JSON.stringify(look));

  t('no errors anywhere in that', errs.length===0, errs.join(' | ')||'clean');
  await b.close();
}

await run('browser storage — pictures in IndexedDB', { folder:false });
await run('a real folder — pictures are files',       { folder:true  });
console.log(`\n${pass} passed, ${fail} failed`);
