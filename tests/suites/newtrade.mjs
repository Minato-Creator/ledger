/* The New Trade page: the data gets the room, and nothing scrolls. */
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
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

for (const [w,h] of [[1500,950],[1440,900],[1366,768],[1920,1080]]) {
  const p=await b.newPage({viewport:{width:w,height:h}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(()=>{
    localStorage.setItem('fakeroot','NT');
    localStorage.setItem('fakefs', JSON.stringify([
      ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',accounts:[{id:'acc_1',name:'test',currency:'USD',startingBalance:5000,defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
      ['data/trades.json', JSON.stringify({version:1,trades:[]})],
    ]));
  });
  await p.addInitScript(FAKE_FS);
  await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('.topbar');
  await p.evaluate(()=>location.hash='#/new'); await p.waitForTimeout(600);

  const geo = await p.evaluate(() => {
    const form = document.querySelector('.card.roomy');
    const strip = document.querySelectorAll('.view > .card')[0];
    const main = document.querySelector('.main');
    const cols = [...form.querySelectorAll(':scope > .col')];
    return {
      formW: Math.round(form.getBoundingClientRect().width),
      /* the page's own width, inside the padding the new page sheet has */
      mainW: Math.round(main.clientWidth - parseFloat(getComputedStyle(main).paddingLeft) - parseFloat(getComputedStyle(main).paddingRight)),
      stripH: Math.round(strip.getBoundingClientRect().height),
      colW: cols.map(c => Math.round(c.getBoundingClientRect().width)),
      scrolls: form.scrollHeight > form.clientHeight + 1,
      over: form.scrollHeight - form.clientHeight,
      bottom: Math.round(form.getBoundingClientRect().bottom),
      vh: window.innerHeight,
    };
  });
  console.log(`  ${w}x${h}`, JSON.stringify(geo));
  t(`${w}x${h}: the form is the whole width`, geo.formW > geo.mainW - 4);
  t(`${w}x${h}: two columns`, geo.colW.length === 2 && geo.colW.every(x => x > 300));
  t(`${w}x${h}: the strip is one line`, geo.stripH < 110, geo.stripH + 'px');
  /* It is taller than the window now — charts and notes run across the foot
     — so the form scrolls inside its card while the header, with Save in it,
     stays where it is. */
  const after = await p.evaluate(async () => {
    const form = document.querySelector('.card.roomy');
    form.scrollTop = form.scrollHeight; await new Promise(r => setTimeout(r, 120));
    const save = [...document.querySelectorAll('.head button')].find(b => /^Save/.test(b.textContent.trim())).getBoundingClientRect();
    const notes = document.querySelector('.tf-wide textarea').getBoundingClientRect();
    const out = { saveSeen: save.top >= 0 && save.bottom <= innerHeight, notesSeen: notes.bottom <= innerHeight + 1 && notes.top < innerHeight,
      pageStill: document.scrollingElement.scrollHeight <= innerHeight + 1 };
    form.scrollTop = 0; return out;
  });
  t(`${w}x${h}: the form scrolls in its card, Save stays in view`, after.saveSeen && after.notesSeen && after.pageStill, JSON.stringify({ over: geo.over, ...after }));
  t(`${w}x${h}: sits inside the window`, geo.bottom <= geo.vh);

  if (w === 1500) {
    const strip = await p.evaluate(()=>document.querySelectorAll('.view > .card')[0].innerText.replace(/\n/g,' | '));
    console.log('   strip:', strip);
    t('the strip names the five figures', /RESULT/.test(strip) && /\bR\b/.test(strip) && /1R/.test(strip) && /PLANNED/.test(strip) && /TIME/.test(strip));
    t('and carries no captions', !/result ÷ 1R|as your broker|open to close|from entry, stop/.test(strip), strip);
    t('the old explanation panel is gone', !/How R is worked out/.test(await p.evaluate(()=>document.querySelector('.main').innerText)));
    // and it still computes
    await p.evaluate(()=>{
      const set=(sel,v)=>{const n=document.querySelector(sel); n.value=v; n.dispatchEvent(new Event('input',{bubbles:true}));};
      set('.main input[placeholder="XAUUSD"]','MGC');
      const dec=[...document.querySelectorAll('.main input[inputmode="decimal"]')];
      dec[0].value='4440'; dec[0].dispatchEvent(new Event('input',{bubbles:true}));
      dec[1].value='4430'; dec[1].dispatchEvent(new Event('input',{bubbles:true}));
      dec[2].value='4470'; dec[2].dispatchEvent(new Event('input',{bubbles:true}));
      const res=dec.find(n=>n.placeholder==='0.00'); res.value='110'; res.dispatchEvent(new Event('input',{bubbles:true}));
    });
    await p.waitForTimeout(400);
    const live = await p.evaluate(()=>document.querySelectorAll('.view > .card')[0].innerText.replace(/\n/g,' | '));
    console.log('   live: ', live);
    t('result shown', /\+\$110\.00/.test(live));
    t('R computed against 1R of $50', /\+2\.20R/.test(live));
    t('1R shown', /\$50\.00/.test(live));
    // the captions are gone on purpose — the label and the figure are the design
    t('no explanatory copy left on the page', await p.evaluate(() => {
      const txt = document.querySelector('.main').innerText;
      const banned = ['as your broker', 'result ÷ 1R', 'from entry, stop', 'open to close',
        'click to override', 'what it was inside of', 'everything else follows',
        'Commission and swap', 'of this account', 'You type these', 'This trade is',
        'from your open time', 'not counted anywhere'];
      return banned.filter(b => txt.includes(b));
    }).then(l => l.length === 0), '');
    t('planned R:R shown', /1 : 3\.00/.test(live));
    t('save is armed', await p.evaluate(()=>!document.querySelector('.head .btn-primary').disabled));
    await p.screenshot({ path: OUT+'/newtrade.png' });
  }
  t(`${w}x${h}: no errors`, errs.length === 0, errs.join('|'));
  await p.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
