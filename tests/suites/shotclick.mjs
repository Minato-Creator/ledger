/* Clicking the chart box must open the file picker, and a paste must land on
   the trade without one. Playwright fires a 'filechooser' event when a real
   picker opens, so this is the actual behaviour and not a proxy for it. */
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
p.on('console',m=>{ if(m.type()==='error'&&!/TUNNEL|fonts|ERR_/.test(m.text())) errs.push(m.text()); });
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};
await p.addInitScript(()=>{
  localStorage.setItem('fakeroot','SC');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',accounts:[{id:'acc_1',name:'A',currency:'USD',startingBalance:5000,defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:[]})],
  ]));
});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar');
await p.evaluate(()=>location.hash='#/new'); await p.waitForTimeout(600);

/* ---------- the empty box ---------- */
const openPicker = async (selector) => {
  const box = await p.$(selector);
  let opened = false;
  const wait = p.waitForEvent('filechooser', { timeout: 2500 })
    .then(fc => { opened = true; return fc; }).catch(() => null);
  await box.click();                 // a real mouse click, so mousedown/focus/click all fire
  return { fc: await wait, opened };
};

let r = await openPicker('.shot-zone');
t('clicking the empty box opens the picker', r.opened);
t('and it takes more than one file at a time', await p.evaluate(()=>
  document.querySelector('.trade-form input[type=file]').multiple));
if (r.fc) {
  await r.fc.setFiles([FIX + '/chart-ltf.png', FIX + '/chart-htf.png']);
  await p.waitForTimeout(1600);
}
t('both land on the trade', (await p.$$('.shot-thumb')).length === 2,
  String((await p.$$('.shot-thumb')).length));
t('and they are real pictures, not placeholders', await p.evaluate(()=>
  [...document.querySelectorAll('.shot-thumb')].every(n=>/^url\(/.test(getComputedStyle(n).backgroundImage))));

/* ---------- the small button on the end ---------- */
r = await openPicker('.shot-add');
t('the add button opens the picker too', r.opened);
if (r.fc) { await r.fc.setFiles(FIX + '/chart-ltf.png'); await p.waitForTimeout(1000); }
t('a third chart goes on the end', (await p.$$('.shot-thumb')).length === 3,
  String((await p.$$('.shot-thumb')).length));

/* ---------- clicking a picture views it, it does not re-open the picker ---------- */
let reopened = false;
const watch = p.waitForEvent('filechooser', { timeout: 1200 }).then(()=>{ reopened = true; }).catch(()=>{});
await (await p.$('.shot-thumb')).click();
await watch; await p.waitForTimeout(500);
t('clicking a picture opens it full size rather than the picker',
  !reopened && await p.evaluate(()=>!!document.querySelector('.lightbox img')));
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

/* ---------- and the × removes rather than viewing ---------- */
await p.evaluate(()=>document.querySelectorAll('.shot-thumb')[0].querySelector('.shot-thumb-x').click());
await p.waitForTimeout(250);
t('the × on a picture arms instead of opening the viewer',
  await p.evaluate(()=>!document.querySelector('.lightbox')
    && document.querySelectorAll('.shot-thumb')[0].querySelector('.shot-thumb-x').textContent.trim() === 'delete?'));
await p.evaluate(()=>document.querySelectorAll('.shot-thumb')[0].querySelector('.shot-thumb-x').click());
await p.waitForTimeout(400);
t('and takes it off on the second click', (await p.$$('.shot-thumb')).length === 2,
  String((await p.$$('.shot-thumb')).length));

t('no errors', errs.length===0, errs.join(' | ')||'clean');
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
