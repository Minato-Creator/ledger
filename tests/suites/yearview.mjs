/* The year tab, and the hour chart's label clearance. */
import pw from 'playwright';
import { setTheme } from './lookhelp.mjs';
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

// A year with a shape: a strong start, a bad April, a quiet winter.
const plan = [
  ['2026-01', 6, 1800], ['2026-02', 9, -1200], ['2026-03', 12, 4100], ['2026-04', 7, -3600],
  ['2026-05', 11, 2400], ['2026-06', 4, 300],  ['2026-07', 0, 0],     ['2026-08', 8, -700],
  ['2026-09', 5, 1500],
];
const trades = [];
let n = 0;
for (const [ym, count, total] of plan) {
  for (let i = 0; i < count; i++) {
    const day = String(2 + (i % 24)).padStart(2, '0');
    const hour = String(1 + (i * 3) % 22).padStart(2, '0');
    // spread the month's total across its trades, alternating sign a little
    const base = total / count;
    const wobble = (i % 3 === 0 ? 1.6 : i % 3 === 1 ? 0.7 : -0.3);
    trades.push({ id: 't'+(++n), accountId:'acc_1', assetClass:'Futures', pair:'MGC', side: i%2?'sell':'buy',
      date: `${ym}-${day}`, timeOpen: `${hour}:15`, timeClose: `${hour}:55`, riskPercent: 1,
      netResult: Math.round(base * wobble * 100) / 100, tagIds: [], notes: '', setupId: null, sessionId: null });
  }
}
// make each month's sum exact
for (const [ym, count, total] of plan) {
  if (!count) continue;
  const mine = trades.filter(t => t.date.startsWith(ym));
  const diff = total - mine.reduce((s,t)=>s+t.netResult,0);
  mine[0].netResult = Math.round((mine[0].netResult + diff) * 100) / 100;
}
// and one older year to prove the stepper
trades.push({ id:'old1', accountId:'acc_1', assetClass:'Futures', pair:'MGC', side:'buy', date:'2025-11-04',
  timeOpen:'20:00', timeClose:'21:00', riskPercent:1, netResult: 900, tagIds:[], notes:'', setupId:null, sessionId:null });

const b = await chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1580, height: 980 } });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errs.push(m.text()); });
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

await p.addInitScript(({trades, theme}) => {
  localStorage.setItem('fakeroot','Yr');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme,accounts:[{id:'acc_1',name:'Prop 100k',currency:'USD',startingBalance:100000,defaultRiskPercent:1,color:'#0988F0',openedAt:'2025-11-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades})],
  ]));
}, {trades, theme:'dark'});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar');

// ---- the hour chart first ----
await p.evaluate(()=>location.hash='#/analytics'); await p.waitForTimeout(400);
await p.evaluate(()=>[...document.querySelectorAll('.seg button')].find(x=>x.textContent==='Timing').click());
await p.waitForTimeout(500);
await p.evaluate(()=>[...document.querySelectorAll('.seg button')].find(x=>x.textContent==='All').click());
await p.waitForTimeout(600);
const clash = await p.evaluate(() => {
  const svg = document.querySelector('.card svg');
  const texts = [...svg.querySelectorAll('text')].map(n => ({ x:+n.getAttribute('x'), y:+n.getAttribute('y'), s:n.textContent }));
  const bad = [];
  for (let i=0;i<texts.length;i++) for (let j=i+1;j<texts.length;j++) {
    const a=texts[i], bb=texts[j];
    if (Math.abs(a.x-bb.x) < 34 && Math.abs(a.y-bb.y) < 14) bad.push(`${a.s}@${a.y} vs ${bb.s}@${bb.y}`);
  }
  return bad;
});
t('no overlapping labels in the hour chart', clash.length === 0, clash.join(' | '));
const negLabels = await p.evaluate(() => {
  const svg=document.querySelector('.card svg');
  return [...svg.querySelectorAll('text')].filter(n=>/[−-]/.test(n.textContent)&&/\$|R|%/.test(n.textContent)).map(n=>+n.getAttribute('y'));
});
t('every loss label clears the hour row', negLabels.every(y => y < 220 || y > 240), negLabels.join(','));
await p.screenshot({ path: OUT+'/year-hour.png' });

// ---- the year, on the calendar now ----
await p.evaluate(()=>location.hash='#/calendar'); await p.waitForTimeout(450);
await p.evaluate(()=>document.querySelector('.cal-span [data-span="year"]').click());
await p.waitForTimeout(700);
const txt = await p.evaluate(()=>document.querySelector('.main').innerText);
t('year tab renders', /Monthly/.test(txt) && /Month by month/.test(txt));
t('year stepper is there, period seg is not', await p.evaluate(()=>
  !!document.querySelector('.head .stepper') && [...document.querySelectorAll('.head .seg button')].every(b=>b.textContent!=='30D')));
t('lands on the latest year traded', /2026/.test(await p.evaluate(()=>document.querySelector('.head .stepper .val').textContent)));
t('year total is right', /\+\$4,600/.test(txt), (txt.match(/\+\$[\d,]+/g)||[]).slice(0,3).join(' '));
t('best month named', /March/.test(txt));
t('worst month named', /April/.test(txt));
t('untraded month is not a zero', /JUL/.test(txt) && !/\+\$0/.test(txt));
t('green months counted', /5 of 8/.test(txt), (txt.match(/\d+ of \d+/)||[])[0]);
await p.screenshot({ path: OUT+'/year-dark.png' });

// step back a year
await p.evaluate(()=>document.querySelectorAll('.head .stepper button')[0].click());
await p.waitForTimeout(600);
const t25 = await p.evaluate(()=>document.querySelector('.main').innerText);
t('stepping back works', await p.evaluate(()=>document.querySelector('.head .stepper .val').textContent) === '2025');
t('and shows only that year', /\+\$900/.test(t25) && !/\+\$4,600/.test(t25));
await p.evaluate(()=>document.querySelectorAll('.head .stepper button')[1].click());
await p.waitForTimeout(500);

// units
for (const unit of ['%','R']) {
  await p.evaluate(u=>[...document.querySelectorAll('.unit-switch button')].find(b=>b.textContent.trim()===u).click(), unit);
  await p.waitForTimeout(600);
  const body = await p.evaluate(()=>document.querySelector('.main').innerText);
  t(`year tab in ${unit}`, body.length > 100 && /Monthly/.test(body), body.split('\n').filter(Boolean)[1]);
  if (unit==='%') await p.screenshot({ path: OUT+'/year-pct.png' });
}
await p.evaluate(()=>[...document.querySelectorAll('.unit-switch button')].find(b=>b.textContent.trim()==='$').click());
await p.waitForTimeout(500);

// the other theme: this journal opens on Light, so it is the dark one that is new
await setTheme(p, 'dark');
await setTheme(p, 'light');
t('theme really switched', await p.evaluate(()=>document.documentElement.dataset.theme) === 'light',
  await p.evaluate(()=>document.documentElement.dataset.theme));
await p.evaluate(()=>location.hash='#/calendar'); await p.waitForTimeout(500);
await p.evaluate(()=>document.querySelector('.cal-span [data-span="year"]')?.click());
await p.waitForTimeout(900);
t('year tab still draws in light', await p.evaluate(()=>!!document.querySelector('.card svg rect')));
await p.screenshot({ path: OUT+'/year-light.png' });

t('nothing spilled sideways', await p.evaluate(()=>document.body.scrollWidth <= window.innerWidth + 1));
console.log(errs.length?'\nERRORS:\n'+errs.join('\n'):'\nno errors');
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
