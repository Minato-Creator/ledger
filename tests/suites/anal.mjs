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

const D = (n) => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };
const mk = (i, over) => ({ id:'t'+i, accountId:'acc_1', assetClass:'Futures', pair:['XAUUSD','MNQ','MGC','EURUSD'][i%4],
  side: i%3?'buy':'sell', date: D(i%9), timeOpen: String(8+(i*3)%14).padStart(2,'0')+':'+(i%2?'30':'05'),
  timeClose: String(9+(i*3)%14).padStart(2,'0')+':45', riskPercent: over?2.2:(i%5?1:0.6),
  netResult: (i%3===0?-1:1)*(220+i*130), entryPrice:4300+i, stopLoss:4290+i, exitPrice:4320+i,
  setupId: i%2?'s1':null, sessionId: i%4?'sess_asia':null,
  tagIds: i%2?['g1']:(i%3?['g2']:[]), notes:'' });
const TRADES = [...Array(14)].map((_,i)=>mk(i, i===3 || i===8));

const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1600,height:1000}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({T})=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','V');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',
      accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                 color:'#18AC65',openedAt:'2026-01-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:T})],
    ['data/playbook.json', JSON.stringify({version:3,setups:[{id:'s1',name:'Failed breakdown',rules:[]}],
      tagGroups:[{id:'g_exec',name:'Execution',tags:[{id:'g1',name:'A+ setup'},{id:'g2',name:'moved my stop'}]}],
      sessions:[{id:'sess_asia',name:'Asia',start:'09:00',end:'17:00'}],
      rules:{maxTradesPerDay:2,dailyLossCapPercent:3}, replay:{windowMins:15,csvOffsetHours:0}})],
  ]));
},{T:TRADES});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});
await p.evaluate(()=>{ location.hash='#/analytics'; }); await p.waitForTimeout(900);
await p.evaluate(()=>[...document.querySelectorAll('.head button')].find(b=>b.textContent==='All')?.click());
await p.waitForTimeout(700);

const txt = () => p.evaluate(()=>document.querySelector('.main').innerText);
const tabTo = async (name) => { await p.evaluate(n=>[...document.querySelectorAll('.head :is(.seg, .an-tabs) button')]
  .find(b=>b.textContent.trim()===n).click(), name); await p.waitForTimeout(800); };

// ---- overview
/* Tags left Overview for a page of their own: one bar each was the shallowest
   possible reading of them, and the question they answer needs a win rate, a
   sample size and an expectancy rather than a length. */
t('Overview keeps setups and instruments', /By setup/.test(await txt()) && /By instrument/.test(await txt()));
t('and tags are no longer a bar list here', !/By tag/.test(await txt()),
  ([...(await txt()).matchAll(/By [a-z]+/g)].map(m=>m[0]).join(', ')));
t('they have a tab of their own', await p.evaluate(()=>
  [...document.querySelectorAll('.head :is(.seg, .an-tabs) button')].some(b=>b.textContent.trim()==='Tags')));
await p.screenshot({path:OUT + '/an-overview.png'});

// ---- discipline
await tabTo('Discipline');
const disc = await txt();
t('By tag is gone from Discipline', !/By tag/.test(disc));
t('Risk per trade is charted', /Risk per trade/.test(disc));
t('and its header still carries the cap, average and biggest',
  /cap \d\.\d\d%/.test(disc) && /avg \d\.\d\d%/.test(disc) && /biggest \d\.\d\d%/.test(disc),
  (disc.match(/cap [^\n]*/)||[''])[0]);
t('Trades per day is charted too', /Trades per day/.test(disc));
t('Where the rules went is there', /Where the rules went/.test(disc));
t('and it names the breaks', /over the risk cap|limit is/.test(disc), (disc.match(/limit is \d/)||disc.match(/2\.20%/)||[''])[0]);
t('After a loss is still there', /After a loss/.test(disc));
const shape = await p.evaluate(()=>{
  const row = document.querySelector('.view > section:last-child');
  const kids = [...row.children];
  const charts = [...row.querySelectorAll('svg')];
  return { cols: kids.length,
           middleW: Math.round(kids[0].getBoundingClientRect().width),
           railW: Math.round(kids[1].getBoundingClientRect().width),
           charts: charts.length,
           scales: charts.map(s=>+(s.getBoundingClientRect().width/ (+s.getAttribute('viewBox').split(' ')[2])).toFixed(2)) };
});
console.log('    layout:', JSON.stringify(shape));
t('charts sit in the middle, text down the right', shape.cols === 2 && shape.middleW > shape.railW, JSON.stringify(shape));
t('two charts, both drawn at real size', shape.charts === 2 && shape.scales.every(x=>Math.abs(x-1)<0.02), JSON.stringify(shape.scales));
t('the cap line is drawn, not just captioned', await p.evaluate(()=>
  [...document.querySelectorAll('.view svg line')].some(l=>l.getAttribute('stroke-dasharray'))));

/* The rail: the card with the reading takes the height, the short one stays
   the size of what it says. */
const rail = await p.evaluate(()=>{
  const cards=[...document.querySelectorAll('.view > section:last-child > div:last-child > .card')];
  return cards.map(n=>({ t:(n.querySelector('h2')?.textContent)||'?',
                         h:Math.round(n.getBoundingClientRect().height),
                         txt:Math.round(n.scrollHeight) }));
});
console.log('    rail cards:', JSON.stringify(rail));
const breaks = rail.find(c=>/rules went/i.test(c.t));
const loss   = rail.find(c=>/After a loss/i.test(c.t));
t('the breaks card is tight to its text', breaks && breaks.h <= breaks.txt + 4, JSON.stringify(breaks));
t('and no taller than the card with the reading in it', breaks && loss && breaks.h < loss.h,
  `${breaks?.h} vs ${loss?.h}`);
t('neither card is padded out with empty space', loss && loss.h <= loss.txt + 4, JSON.stringify(loss));
await p.screenshot({path:OUT + '/an-discipline.png'});

// ---- timing
await tabTo('Timing');
const svgBox = await p.evaluate(()=>{
  const s=document.querySelector('.view svg'); const r=s.getBoundingClientRect();
  const vb=s.getAttribute('viewBox').split(' ').map(Number);
  return { cssW: Math.round(r.width), cssH: Math.round(r.height), vbW: vb[2], vbH: vb[3],
           scale: +(r.width/vb[2]).toFixed(3),
           fonts: [...new Set([...s.querySelectorAll('text')].map(x=>x.getAttribute('font-size')))],
           barW: Math.round(Math.max(...[...document.querySelectorAll('.view .col-fill-svg')].map(x=>+x.getAttribute('width')||0))) };
});
console.log('    week grid:', JSON.stringify(svgBox));
t('the chart is drawn at its real size, not scaled up', Math.abs(svgBox.scale - 1) < 0.02, 'scale ' + svgBox.scale);
t('so a 10.5px label really is 10.5px', svgBox.fonts.every(f=>Number(f) <= 11.5), svgBox.fonts.join(','));
t('and the columns are marks, not slabs', svgBox.barW <= 46, svgBox.barW + 'px');
await p.screenshot({path:OUT + '/an-timing.png'});

/* Nothing in the rail may spill out of it — that rail is narrower than the
   cards were originally built for. */
await tabTo('Discipline');
const spill = await p.evaluate(()=>{
  const rail = document.querySelector('.view > section:last-child > div:last-child');
  const r = rail.getBoundingClientRect();
  const out = [];
  for (const n of rail.querySelectorAll('*')) {
    const b = n.getBoundingClientRect();
    if (b.width && (b.right > r.right + 1 || b.left < r.left - 1)) out.push((n.className||n.tagName)+'');
  }
  return [...new Set(out)].slice(0,4);
});
t('nothing in the right rail overflows it', spill.length===0, spill.join(' | '));
const clipped = await p.evaluate(()=>[...document.querySelectorAll('.view > section:last-child .card *')]
  /* HTML only: scrollWidth on an SVG <text> is not a clipping measure. */
  .filter(n=>!(n instanceof SVGElement) && n.children.length===0 && n.scrollWidth > n.clientWidth + 1)
  .map(n=>n.textContent.trim().slice(0,24)));
t('and no line is cut off mid-word', clipped.length===0, clipped.join(' | '));

t('no errors', errs.length===0, errs.join(' | ')||'clean');
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
