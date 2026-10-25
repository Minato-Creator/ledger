/* A forward test has no money in it, so the form stops asking for money.
   What it asks for instead is the R — and that R has to survive a save, a
   reload, an edit, and every page that shows a result. */
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

const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1500,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(()=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',
      accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                 color:'#18AC65',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:[]})],
  ]));
});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});

const mode = label => p.evaluate(l=>[...document.querySelectorAll('.seg button')]
  .find(x=>x.textContent.trim()===l).click(), label);

/* what the result row is asking for right now */
const row = () => p.evaluate(()=>{
  const b = document.querySelector('.main .result-band');
  return {
    labels: b ? [...b.querySelectorAll('.lbl')].map(n=>n.textContent.trim()) : [],
    hidden: b ? b.hidden : null,
    dollar: !!b && [...b.querySelectorAll('.prefix span')].some(s=>s.textContent.trim()==='$'),
    rSuffix: !!b && [...b.querySelectorAll('.suffix span')].some(s=>s.textContent.trim()==='R'),
    signs: b ? [...b.querySelectorAll('button')].map(x=>x.textContent.trim()) : [],
    /* The band IS the grid now — it used to be a wrapper round one. */
    cols: b ? getComputedStyle(b).gridTemplateColumns : '',
  };
});
const strip = () => p.evaluate(()=>[...document.querySelectorAll('.main .kpi, .strip > *')]
  .map(n=>n.innerText.replace(/\n/g,'=')).join(' | ')
  || document.querySelector('.view > :nth-child(2)').innerText.replace(/\n/g,'='));

await p.evaluate(()=>{location.hash='#/new';}); await p.waitForTimeout(700);

/* ---------- live: the form it has always been ---------- */
let r = await row();
t('live asks for Risk % and a dollar Net result', r.labels.join(',') === 'Risk %,Net result', JSON.stringify(r.labels));
t('and there is a dollar sign in front of it', r.dollar);
t('the row is two columns wide', /\s/.test(r.cols), r.cols);

/* ---------- switch to forward test ---------- */
await mode('Forward test'); await p.waitForTimeout(300);
r = await row();
t('forward test asks for one thing: the result in R', r.labels.join(',') === 'Result in R', JSON.stringify(r.labels));
t('no dollar field is offered', !r.dollar);
t('no Risk % is offered', !r.labels.includes('Risk %'));
t('the R carries an R after it', r.rSuffix);
t('the win / loss / break-even switch came with it', r.signs.join(',') === 'Profit,Loss,Break-even', r.signs.join(','));
t('the row takes the whole width', !/\s/.test(r.cols.trim()), r.cols);

let st = await strip();
t('1R in money is not claimed for a forward test — the cell is gone', !/1R/.test(st), st);
t('and the R cell is not repeated beside the result', st.split('R=').length <= 2, st);

/* ---------- typing an R ---------- */
const setR = async v => p.evaluate(x=>{
  const i=[...document.querySelectorAll('.main .band input')].find(n=>n.placeholder==='2.00');
  i.value=x; i.dispatchEvent(new Event('input',{bubbles:true}));
}, v);
await p.locator('.main input[placeholder="XAUUSD"]').first().fill('NAS100');
await setR('2.5'); await p.waitForTimeout(250);
st = await strip();
t('the top strip reads the R, not a dollar amount', /\+2\.50R/.test(st) && !/\$/.test(st), st);
t('and it says it once', (st.match(/\+2\.50R/g)||[]).length === 1, st);
t('save is offered on an instrument and an R alone', await p.evaluate(()=>
  ![...document.querySelectorAll('button')].find(x=>/Save trade/.test(x.textContent)).disabled));

await setR('x'); await p.waitForTimeout(250);
t('an unreadable R says so, in R language', /Cannot read that as an R/i.test(await p.evaluate(()=>document.querySelector('.main').innerText)));
await setR('2.5'); await p.waitForTimeout(200);

/* ---------- forward test, still open ---------- */
await p.evaluate(()=>[...document.querySelectorAll('.seg button')].find(x=>/Still open/.test(x.textContent)).click());
await p.waitForTimeout(250);
t('a running forward test is asked for nothing at all, and the band goes',
  (await row()).hidden === true, JSON.stringify(await row()));
await p.evaluate(()=>[...document.querySelectorAll('.seg button')].find(x=>/Closed/.test(x.textContent)).click());
await p.waitForTimeout(250);
t('and it comes back on closing it', (await row()).labels.join(',') === 'Result in R');

/* ---------- save ---------- */
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/Save trade/.test(x.textContent)).click());
await p.waitForTimeout(1200);
const rec = () => p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  const t = store.trades.find(x=>x.pair==='NAS100');
  return t && { mode:t.mode, net:t.netResult, r:t.rMultiple, risk:t.riskPercent, id:t.id };
});
let saved = await rec();
console.log('   ', JSON.stringify(saved));
t('no money is recorded, because none was at stake', saved && saved.net === null, JSON.stringify(saved));
t('the R is stored as typed', saved && saved.r === 2.5, JSON.stringify(saved));
t('no risk percentage either', saved && saved.risk === null, JSON.stringify(saved));

/* ---------- what it reads as ---------- */
const judged = await p.evaluate(async()=>{
  const c = await import('/js/calc.js'); const { store } = await import('/js/store.js');
  const t = store.trades.find(x=>x.pair==='NAS100'); const a = store.activeAccount;
  return { out: c.outcome(t), r: c.rMultiple(a,t), money: c.tradeFig('$',a,t), rf: c.tradeFig('R',a,t) };
});
t('a +2.5R forward test is a win', judged.out === 'win', JSON.stringify(judged));
t('and reads as +2.50R even in the money column, never $0.00',
  /\+2\.50R/.test(judged.money), JSON.stringify(judged));

/* ---------- a losing one ---------- */
await p.evaluate(()=>{location.hash='#/new';}); await p.waitForTimeout(700);
await mode('Forward test'); await p.waitForTimeout(250);
await p.locator('.main input[placeholder="XAUUSD"]').first().fill('AUDUSD');
await setR('1');
await p.evaluate(()=>[...document.querySelectorAll('.main .result-band button')].find(x=>x.textContent.trim()==='Loss').click());
await p.waitForTimeout(250);
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/Save trade/.test(x.textContent)).click());
await p.waitForTimeout(1200);
const loss = await p.evaluate(async()=>{
  const c = await import('/js/calc.js'); const { store } = await import('/js/store.js');
  const t = store.trades.find(x=>x.pair==='AUDUSD');
  return t && { r:t.rMultiple, out:c.outcome(t) };
});
t('a loss typed unsigned is stored negative', loss && loss.r === -1, JSON.stringify(loss));
t('and reads as a loss', loss && loss.out === 'loss', JSON.stringify(loss));

/* ---------- the account is untouched by either ---------- */
t('neither moved the balance by a cent', await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  await store.setIncludeTests(true);
  const c = await import('/js/calc.js');
  return c.equityNow ? true : true;
}) && /100,000/.test(await p.evaluate(()=>document.querySelector('.acct-meta').textContent)),
  await p.evaluate(()=>document.querySelector('.acct-meta').textContent));

/* ---------- editing one back ---------- */
const id = saved.id;
await p.evaluate(i=>{location.hash='#/edit/'+i;}, id); await p.waitForTimeout(800);
const back = await p.evaluate(()=>{
  const i=[...document.querySelectorAll('.main .band input')].find(n=>n.placeholder==='2.00');
  const on=[...document.querySelectorAll('.seg button')].filter(x=>x.classList.contains('is-on')).map(x=>x.textContent.trim());
  const sign=[...document.querySelectorAll('.main .result-band button')]
    .find(x=>x.style.background && x.style.background !== 'var(--grey-7)')?.textContent.trim();
  return { val:i?i.value:null, on, sign, labels:[...document.querySelectorAll('.main .band .lbl')].map(n=>n.textContent.trim()) };
});
console.log('   ', JSON.stringify(back));
t('opening it again lands on Forward test', back.on.includes('Forward test'), JSON.stringify(back.on));
t('with the R back in the box', back.val === '2.5', String(back.val));
t('and Profit still chosen', back.sign === 'Profit', String(back.sign));
t('and no money field anywhere on it', !back.labels.includes('Net result'), JSON.stringify(back.labels));

/* ---------- switching an existing one back to Live ---------- */
await mode('Live'); await p.waitForTimeout(300);
r = await row();
t('switching back to Live restores the money form', r.labels.join(',') === 'Risk %,Net result', JSON.stringify(r.labels));
t('and there is exactly one sign switch on the page, not two',
  (await p.evaluate(()=>[...document.querySelectorAll('.main button')].filter(x=>x.textContent.trim()==='Profit').length)) === 1);

/* ---------- it survives a reload ---------- */
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1200);
saved = await rec();
t('the forward test is still there after a restart, R and all',
  saved && saved.net === null && saved.r === 2.5, JSON.stringify(saved));

t('no errors', errs.length===0, errs.join(' | ')||'clean');
await p.screenshot({path:OUT + '/fwdr.png'});
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
