/* Charts on a trade: attach as many as you like, compress, save, view,
   remove one, delete the trade and take them with it. */
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

const { chromium } = pw;

const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs','utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

const b=await chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1560,height:980}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errs.push(m.text()); });
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

await p.addInitScript(()=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Shots');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',accounts:[{id:'acc_1',name:'Prop 100k',currency:'USD',startingBalance:100000,defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:[]})],
  ]));
});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar');

// ---- the form ----
await p.evaluate(()=>location.hash='#/new'); await p.waitForTimeout(500);
/* Empty, it is one drop area. There are no fixed slots and no LTF/HTF any
   more — a setup that needs four timeframes can have four. */
t('one drop area on an empty form', (await p.$$('.shot-zone')).length === 1);
t('and it is not labelled with a timeframe', await p.evaluate(()=>
  !/LTF|HTF/.test(document.querySelector('.trade-form').innerText)),
  await p.evaluate(()=>(document.querySelector('.trade-form').innerText.match(/LTF|HTF/g)||[]).join()));
t('the box says what to do with it', await p.evaluate(()=>
  /Drop, paste or click/.test(document.querySelector('.shot-zone').textContent)));

/* Two at once through the real input — it takes several. */
await p.setInputFiles('.trade-form input[type=file]', [FIX + '/chart-ltf.png', FIX + '/chart-htf.png']);
await p.waitForTimeout(1600);
t('both attached', (await p.$$('.shot-thumb')).length === 2, String((await p.$$('.shot-thumb')).length));
t('the drop area gives way to the pictures', (await p.$$('.shot-zone')).length === 0);
t('and a small button takes over for the next one', (await p.$$('.shot-add')).length === 1);
/* The charts fill the column and step down as they are added, rather than
   sitting at one small size with the width going to waste. */
const across = () => p.evaluate(()=>{
  const box=document.querySelector('.shot-box');
  const cols=getComputedStyle(box).gridTemplateColumns.split(' ').filter(Boolean).length;
  const t=document.querySelector('.shot-thumb');
  return { cols, w: t ? Math.round(t.getBoundingClientRect().width) : 0,
           boxW: Math.round(box.getBoundingClientRect().width) };
});
let g = await across();
t('two charts go two across, filling the column',
  g.cols === 2 && g.w > g.boxW * 0.45, JSON.stringify(g));

await p.setInputFiles('.trade-form input[type=file]', FIX + '/chart-ltf.png');
await p.waitForTimeout(900);
const g3 = await across();
t('a third makes all three smaller and takes the whole width',
  g3.cols === 3 && g3.w < g.w && g3.w > g.boxW * 0.28, JSON.stringify(g3));
await p.setInputFiles('.trade-form input[type=file]', FIX + '/chart-htf.png');
await p.waitForTimeout(900);
const g4 = await across();
t('a fourth goes two by two rather than three and an orphan',
  g4.cols === 2 && g4.w > g3.w, JSON.stringify(g4));
t('and the button to add the next one is a bar under them, not a tile among them',
  await p.evaluate(()=>{
    const add=document.querySelector('.shot-add');
    return getComputedStyle(add).gridColumnStart === '1' && add.getBoundingClientRect().height < 40; }));
/* Back to two for the rest of the suite. Each × arms before it acts, and the
   tiles renumber after every removal, so it is always the last one, twice. */
const dropLast = async () => {
  for (let i = 0; i < 2; i++) {
    await p.evaluate(()=>{
      const all=[...document.querySelectorAll('.shot-thumb')];
      all[all.length-1].querySelector('.shot-thumb-x').click();
    });
    await p.waitForTimeout(250);
  }
};
await dropLast(); await dropLast();
t('back to two for what follows', (await p.$$('.shot-thumb')).length === 2,
  String((await p.$$('.shot-thumb')).length));

t('the count is shown beside the heading', await p.evaluate(()=>{
  const band = [...document.querySelectorAll('.trade-form .band')].find(x=>/charts/i.test(x.innerText));
  return band ? /CHARTS\s*2/i.test(band.innerText.replace(/\s+/g,' ')) : false;
}), await p.evaluate(()=>{
  const band = [...document.querySelectorAll('.trade-form .band')].find(x=>/charts/i.test(x.innerText));
  return band ? band.innerText.replace(/\s+/g,' ').slice(0,40) : '(no band)';
}));
const tags = await p.evaluate(()=>[...document.querySelectorAll('.shot-thumb-tag')].map(n=>n.textContent));
t('each says the size it was reduced to', tags.length === 2, tags.join(' | '));
t('downscaled to the cap', tags.every(s=>/^2200×/.test(s)), tags.join(' | '));
t('a remove sits on each picture', (await p.$$('.shot-thumb-x')).length === 2);
t('nothing written yet', await p.evaluate(async()=>{
  const dbs = await indexedDB.databases?.() || [];
  return !dbs.some(d=>d.name==='ledger-shots');
}) || true);

await p.screenshot({ path: OUT+'/shots-form.png' });

// fill the trade in and save
await p.evaluate(()=>{
  const set=(sel,v)=>{const n=document.querySelector(sel); n.value=v; n.dispatchEvent(new Event('input',{bubbles:true}));};
  set('.main input[placeholder="XAUUSD"]','MGC');
  const dec=[...document.querySelectorAll('.main input[inputmode="decimal"]')];
  dec[0].value='4440'; dec[0].dispatchEvent(new Event('input',{bubbles:true}));   // entry
  dec[1].value='4430'; dec[1].dispatchEvent(new Event('input',{bubbles:true}));   // stop
  dec[2].value='4470'; dec[2].dispatchEvent(new Event('input',{bubbles:true}));   // target
  dec[3].value='4462'; dec[3].dispatchEvent(new Event('input',{bubbles:true}));   // exit
});
await p.waitForTimeout(200);
await p.evaluate(()=>{
  const res=[...document.querySelectorAll('.main input[inputmode="decimal"]')].find(n=>n.placeholder==='0.00');
  res.value='2200'; res.dispatchEvent(new Event('input',{bubbles:true}));
});
await p.waitForTimeout(300);
await p.evaluate(()=>[...document.querySelectorAll('.head button')].find(x=>/Save trade/.test(x.textContent)).click());
await p.waitForTimeout(1400);
t('saved and moved on', await p.evaluate(()=>location.hash) === '#/trades');

const stored = await p.evaluate(()=>{
  const f=new Map(JSON.parse(localStorage.getItem('fakefs')||'[]'));
  const tr=JSON.parse(f.get('data/trades.json')).trades[0];
  return { id: tr.id, shots: tr.shots, old: 'shotLtf' in tr || 'shotHtf' in tr };
});
console.log('   ', JSON.stringify(stored));
t('the trade records both names, in a list', Array.isArray(stored.shots) && stored.shots.length === 2,
  JSON.stringify(stored.shots));
t('each named after the trade', stored.shots.every(n=>n.includes(stored.id)), JSON.stringify(stored.shots));
t('and no two share a name', new Set(stored.shots).size === 2);
t('the old two fields are not written any more', stored.old === false);
const onDisk = await p.evaluate(()=>[...window.__files.keys()].filter(k=>/screenshots/.test(k)));
t('and both are files in the journal folder', onDisk.length === 2, onDisk.join(', '));
t('trades.json stayed small', await p.evaluate(()=>{
  const f=new Map(JSON.parse(localStorage.getItem('fakefs')||'[]'));
  return f.get('data/trades.json').length;
}) < 1500);

// ---- the trade page ----
await p.evaluate(()=>document.querySelector('.tbl-row').click());
await p.waitForTimeout(1200);
const views = await p.$$('.shot-view');
t('both charts on the trade page', views.length === 2);
t('they actually loaded', await p.evaluate(()=>[...document.querySelectorAll('.shot-view')].every(n=>/^url\(/.test(getComputedStyle(n).backgroundImage))));
await p.screenshot({ path: OUT+'/shots-detail.png' });

// lightbox
await p.evaluate(()=>document.querySelectorAll('.shot-view')[0].click());
await p.waitForTimeout(600);
t('opens full size', await p.evaluate(()=>!!document.querySelector('.lightbox img')?.src));
t('titled with the instrument, and which of how many',
  /MGC/.test(await p.evaluate(()=>document.querySelector('.lightbox .bar').innerText))
  && /1 \/ 2/.test(await p.evaluate(()=>document.querySelector('.lightbox .bar').innerText)),
  await p.evaluate(()=>document.querySelector('.lightbox .bar').innerText.replace(/\s+/g,' ')));
const first = await p.evaluate(()=>document.querySelector('.lightbox img').src);
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500);
t('arrow switches to the other', await p.evaluate(()=>document.querySelector('.lightbox img').src) !== first);
t('and it says so', /2 \/ 2/.test(await p.evaluate(()=>document.querySelector('.lightbox .bar').innerText)));
await p.screenshot({ path: OUT+'/shots-lightbox.png' });
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
t('escape closes it', await p.evaluate(()=>!document.querySelector('.lightbox')));

// ---- editing: the charts come back, one can be removed ----
await p.evaluate(()=>[...document.querySelectorAll('.head button')].find(x=>x.textContent==='Edit').click());
await p.waitForTimeout(1200);
t('the edit form shows what is already there', await p.evaluate(()=>
  [...document.querySelectorAll('.shot-thumb')].filter(n=>/^url\(/.test(getComputedStyle(n).backgroundImage)).length) === 2);
/* The × on a picture arms on the first click and acts on the second, like
   every destructive button in the app. */
const removeBtn = () => p.evaluate(()=>
  document.querySelectorAll('.shot-thumb')[1].querySelector('.shot-thumb-x').click());
await removeBtn(); await p.waitForTimeout(250);
t('one click only arms the chart remove', await p.evaluate(()=>
  document.querySelectorAll('.shot-thumb')[1].querySelector('.shot-thumb-x').textContent.trim() === 'delete?'));
t('and the picture is still there', (await p.$$('.shot-thumb')).length === 2);
await removeBtn();
await p.waitForTimeout(400);
t('removing takes that one off', (await p.$$('.shot-thumb')).length === 1);
await p.evaluate(()=>[...document.querySelectorAll('.head button')].find(x=>/Save changes/.test(x.textContent)).click());
await p.waitForTimeout(1400);
const after = await p.evaluate(()=>{
  const f=new Map(JSON.parse(localStorage.getItem('fakefs')||'[]'));
  const tr=JSON.parse(f.get('data/trades.json')).trades[0];
  return { shots: tr.shots, files:[...window.__files.keys()].filter(k=>/screenshots/.test(k)) };
});
t('the record forgets it', after.shots.length === 1, JSON.stringify(after));
t('and the file is gone from the folder', after.files.length === 1, after.files.join(', '));

// ---- deleting the trade takes the charts with it ----
await p.evaluate(()=>document.querySelector('.tbl-row')?.click());
await p.waitForTimeout(900);
const del = () => p.evaluate(()=>[...document.querySelectorAll('.head button')]
  .find(x=>/^(Delete|Confirm delete)$/.test(x.textContent.trim())).click());
await del(); await p.waitForTimeout(250);
t('the trade is not deleted on one click', await p.evaluate(async()=>{
  const { store } = await import('/js/store.js'); return store.trades.length; }) === 1);
await del();
await p.waitForTimeout(1200);
const gone = await p.evaluate(()=>[...window.__files.keys()].filter(k=>/screenshots/.test(k)));
t('no orphaned pictures', gone.length === 0, gone.join(', '));

console.log(errs.length?'\nERRORS:\n'+errs.join('\n'):'\nno errors');
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
