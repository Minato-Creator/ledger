/* Analytics · Tags — the page you come to looking for an edge, so the numbers
   on it have to be right and a false edge has to be hard to believe. */
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

/* Worked by hand so every assertion below is a number, not a shape.
   100k at 1% → 1R = $1,000.
     e_a  4 trades: +2R, +1R, −1R, break-even → 2W 1L 1BE → 67%, net +2R, +0.50R each
     e_b  2 trades: −1R, +3R                  → 1W 1L     → 50%, net +2R, +1.00R each
     m_a  1 trade:  +1R                       → 1W        → 100%, thin
   account: 6 trades, 3W 2L 1BE → 60% won, net +4R                                */
const PB = { version:3, setups:[], sessions:[], replay:{windowMins:15,csvClock:'local'},
  tagGroups: [
    { id:'g_entry', name:'Entry', tags:[{id:'e_a',name:'Limit at level'},{id:'e_b',name:'Chased it'},{id:'e_c',name:'Never used'}] },
    { id:'g_mood',  name:'Mood',  tags:[{id:'m_a',name:'Calm'}] },
    { id:'g_exit',  name:'Exit',  tags:[{id:'x_a',name:'Trail stop'}] },
  ] };
const mk = (id, net, tagIds, d) => ({ id, accountId:'acc_1', date:`2026-09-${d}`, timeOpen:'16:10', timeClose:'17:00',
  pair:'XAUUSD', side:'buy', riskPercent:1, netResult:net, setupId:null, tagIds, status:'closed', mode:'live', notes:'' });
const TRADES = [
  mk('t1',  2000, ['e_a'],        '10'),
  mk('t2',  1000, ['e_a','m_a'],  '11'),
  mk('t3', -1000, ['e_a'],        '12'),
  mk('t4',     0, ['e_a'],        '14'),
  mk('t5', -1000, ['e_b'],        '15'),
  mk('t6',  3000, ['e_b'],        '16'),
];

const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1500,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{if(m.type()==='error'&&!/TUNNEL|fonts|ERR_/.test(m.text())) errs.push(m.text());});
await p.addInitScript(({PB,TRADES})=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'R',theme:'dark',
      accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                 color:'#18AC65',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:TRADES})],
    ['data/playbook.json', JSON.stringify(PB)]]));
},{PB,TRADES});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});
await p.evaluate(()=>{location.hash='#/analytics';}); await p.waitForTimeout(700);
const period = k => p.evaluate(x=>[...document.querySelectorAll('.head .seg')][1]
  ?.querySelectorAll('button').forEach(b=>{ if(b.textContent.trim()===x) b.click(); }), k);
await period('All'); await p.waitForTimeout(400);

const tabs = () => p.evaluate(()=>[...document.querySelectorAll('.head .seg')][0]
  .querySelectorAll('button')).then(()=>p.evaluate(()=>[...document.querySelectorAll('.head .seg button')].map(b=>b.textContent.trim())));
t('Analytics offers a Tags tab', (await tabs()).includes('Tags'), JSON.stringify(await tabs()));

/* the old bar list is gone from Overview */
t('Overview no longer carries a By tag card', await p.evaluate(()=>
  !/By tag/.test(document.querySelector('.main').innerText)),
  await p.evaluate(()=>[...document.querySelectorAll('.main h2')].map(h=>h.textContent).join(', ')));

await p.evaluate(()=>[...document.querySelectorAll('.head .seg button')].find(b=>b.textContent.trim()==='Tags').click());
await p.waitForTimeout(700);

const groups = () => p.evaluate(()=>[...document.querySelectorAll('.tg-group')].map(g=>({
  name: g.querySelector('h2').textContent.trim(),
  note: g.querySelector('.note').textContent.trim(),
  tot: g.querySelector('.tg-group-tot')?.textContent.trim() || null,
  sum: g.querySelector('.tg-group-tot')?.title || null,
  shut: g.classList.contains('is-shut'),
  rows: [...g.querySelectorAll('.tg-row')].map(r=>({
    name: r.querySelector('.tg-name').textContent.trim(),
    cells: [...r.children].slice(1).map(c=>c.textContent.trim()),
    thin: r.classList.contains('is-thin'),
    title: r.title,
    bar: (() => { const f = r.querySelector('.tg-bar .f'); return f ? { left: parseFloat(f.style.left), width: parseFloat(f.style.width), cls: f.className } : null; })(),
  })),
  unused: g.querySelector('.tg-unused')?.textContent.trim() || null,
  none: g.querySelector('.tg-none')?.textContent.trim() || null,
})));
let g = await groups();
console.log('   ', JSON.stringify(g.map(x=>[x.name, x.rows.map(r=>r.name)])));

/* ---------- the shape ---------- */
t('every tag group gets a section, in playbook order',
  g.map(x=>x.name).join(',') === 'Entry,Mood,Exit', JSON.stringify(g.map(x=>x.name)));
t('a tag sits under its own group and nowhere else', (() => {
  const where = {};
  for (const grp of g) for (const r of grp.rows) (where[r.name] ||= []).push(grp.name);
  return where['Limit at level']?.join() === 'Entry' && where['Calm']?.join() === 'Mood'
      && Object.values(where).every(v => v.length === 1);
})(), JSON.stringify(g.map(x=>[x.name, x.rows.map(r=>r.name)])));
t('the header counts the group’s tags used, and its trades',
  g[0].note === '2 of 3 tags · 6 trades', g[0].note);
t('a tag that was never used is named rather than silently missing',
  g[0].unused === 'Not used:Never used', JSON.stringify(g[0].unused));
t('a group nothing touched says so', /Nothing in this group/.test(g[2].none || ''), String(g[2].none));
t('no tiles and no controls bar: the page is the list', await p.evaluate(()=>
  !document.querySelector('.tg-tile, .tg-tiles, .tg-controls, .tg-key')));

/* ---------- the numbers ---------- */
const row = (grp, name) => g.find(x=>x.name===grp).rows.find(r=>r.name===name);
/* g is re-read after every control change, so row() always reads the page as
   it is now rather than as it was when the suite started. */
let ea = row('Entry','Limit at level'), eb = row('Entry','Chased it');
console.log('    e_a', JSON.stringify(ea.cells), '  e_b', JSON.stringify(eb.cells));
t('trades counted right', ea.cells[0] === '4' && eb.cells[0] === '2', JSON.stringify([ea.cells[0], eb.cells[0]]));
t('win rate leaves break-evens out of the denominator — 2 of 3, not 2 of 4',
  ea.cells[1] === '67%', ea.cells[1]);
t('and a clean half is a half', eb.cells[1] === '50%', eb.cells[1]);
t('expectancy is R per trade, break-even included — +2R over 4 trades',
  ea.cells[3] === '+0.50R', ea.cells[3]);
t('and +2R over 2 trades is +1.00R', eb.cells[3] === '+1.00R', eb.cells[3]);
t('total R is the sum', ea.cells[4] === '+2.0R' && eb.cells[4] === '+2.0R',
  JSON.stringify([ea.cells[4], eb.cells[4]]));
t('pointing at a row gives won, lost and break-even',
  /2 won · 1 lost · 1 break-even/.test(ea.title) && /1 won · 1 lost · 0 break-even/.test(eb.title), ea.title);
t('and points against your own 60%, rounded',
  /\+7 points/.test(ea.title) && /−10 points/.test(eb.title), JSON.stringify([ea.title, eb.title]));
t('the group total reads the trades that carry any of its tags',
  g[0].tot === '+4.0R' && g[0].sum === '60% won · +0.67R a trade', JSON.stringify([g[0].tot, g[0].sum]));
t('and a group only some trades touch counts only those',
  g[1].tot === '+1.0R' && g[1].sum === '100% won · +1.00R a trade', JSON.stringify([g[1].tot, g[1].sum]));

/* ---------- the bar ---------- */
t('the best per-trade figure on the page fills its half',
  eb.bar && Math.abs(eb.bar.left - 50) < 0.01 && Math.abs(eb.bar.width - 50) < 0.01, JSON.stringify(eb.bar));
t('and half as much fills half as far', ea.bar && Math.abs(ea.bar.width - 25) < 0.01 && /is-pos/.test(ea.bar.cls), JSON.stringify(ea.bar));
t('one scale for the whole page: Calm’s +1.00R is as long as Chased it’s',
  Math.abs(row('Mood','Calm').bar.width - eb.bar.width) < 0.01, JSON.stringify(row('Mood','Calm').bar));

/* ---------- how much is enough ---------- */
t('on a thin journal every row is marked thin rather than hidden',
  g.every(x=>x.rows.every(r=>r.thin)) && g[0].rows.length === 2,
  JSON.stringify(g.map(x=>x.rows.map(r=>[r.name, r.thin]))));
const step = dir => p.evaluate(d=>{
  const s = [...document.querySelectorAll('.head .tg-min .stepper button')];
  s[d === -1 ? 0 : 1].click();
}, dir);
const minVal = () => p.evaluate(()=>document.querySelector('.head .tg-min .stepper .val').textContent.trim());
const atMin = async n => {
  let now = Number((await minVal()).replace('+',''));
  while (now > n) { await step(-1); await p.waitForTimeout(160); now--; }
  while (now < n) { await step(1); await p.waitForTimeout(160); now++; }
};
t('the threshold sits in the page header', (await minVal()) === '5+');
await atMin(3);
t('the threshold is yours to set', (await minVal()) === '3+');
g = await groups();
t('at three, the four-trade tag counts', row('Entry','Limit at level').thin === false);
t('and the two-trade one still does not', row('Entry','Chased it').thin === true);
t('a thin row is still shown, because hiding your own data is worse',
  row('Mood','Calm').cells[0] === '1');
await atMin(1);
g = await groups();
t('at one, nothing is marked thin any more', g.every(x=>x.rows.every(r=>!r.thin)));
await atMin(5);
t('and it goes back', (await minVal()) === '5+');

/* ---------- sorting, from the column names ---------- */
const sortBy = label => p.evaluate(l=>[...document.querySelectorAll('.tg-cols button')]
  .find(b=>b.textContent.replace(/[↑↓]/g,'').trim()===l).click(), label);
const entryOrder = async () => (await groups()).find(x=>x.name==='Entry').rows.map(r=>r.name);
const onCol = () => p.evaluate(()=>document.querySelector('.tg-cols button.is-on')?.textContent.trim());
t('per trade is how it opens, best first',
  (await entryOrder()).join() === 'Chased it,Limit at level' && (await onCol()) === 'Per trade ↓', (await entryOrder()).join() + ' / ' + (await onCol()));
await sortBy('Win'); await p.waitForTimeout(350);
t('win rate puts the 67% above the 50%', (await entryOrder()).join() === 'Limit at level,Chased it', (await entryOrder()).join());
t('and the column says it is the one sorting', (await onCol()) === 'Win ↓', await onCol());
await sortBy('Trades'); await p.waitForTimeout(350);
t('trades puts the 4 above the 2', (await entryOrder()).join() === 'Limit at level,Chased it', (await entryOrder()).join());
await sortBy('Tag'); await p.waitForTimeout(350);
t('the tag name sorts alphabetically', (await entryOrder()).join() === 'Chased it,Limit at level' && (await onCol()) === 'Tag ↑', (await entryOrder()).join());
await sortBy('Per trade'); await p.waitForTimeout(350);

/* ---------- folding a group away ---------- */
await p.evaluate(()=>[...document.querySelectorAll('.tg-group')].find(x=>x.querySelector('h2').textContent==='Entry').querySelector('.tg-group-head').click());
await p.waitForTimeout(300);
g = await groups();
t('a group folds to its header', g[0].shut && g[0].rows.length === 0 && g[0].tot === '+4.0R', JSON.stringify(g[0]));
t('and the others stay open', !g[1].shut && g[1].rows.length === 1);
await p.evaluate(()=>[...document.querySelectorAll('.tg-group')].find(x=>x.querySelector('h2').textContent==='Entry').querySelector('.tg-group-head').click());
await p.waitForTimeout(300);
g = await groups();
t('and opens again', !g[0].shut && g[0].rows.length === 2);

/* ---------- the honest footnotes ---------- */
t('the page says how many trades carry a tag at all', await p.evaluate(()=>
  /6 of 6 trades in this window carry a tag/.test(document.querySelector('.tg-foot').innerText)),
  await p.evaluate(()=>document.querySelector('.tg-foot').innerText.replace(/\s+/g,' ')));
t('and that the groups overlap rather than adding up', await p.evaluate(()=>
  /do not add up to the account/.test(document.querySelector('.tg-foot').innerText)));

/* ---------- it scrolls ---------- */
t('the groups scroll rather than the window', await p.evaluate(()=>
  getComputedStyle(document.querySelector('.tg-scroll')).overflowY === 'auto'
  && document.body.scrollHeight <= window.innerHeight + 1));
t('and the column names stay put while they do', await p.evaluate(()=>
  getComputedStyle(document.querySelector('.tg-cols')).position === 'sticky'));

/* ---------- the window applies ---------- */
await period('7D'); await p.waitForTimeout(600);
const narrowed = await p.evaluate(()=>document.querySelector('.tg-foot')?.innerText || '(gone)');
t('the period control narrows this page too', !/6 of 6/.test(narrowed), narrowed.replace(/\s+/g,' ').slice(0,70));
await period('All'); await p.waitForTimeout(500);

/* ---------- one scale, whatever the page holds ----------
   A +3R trade on Calm makes it +2.00R a trade, the longest on the page, so
   the +1.00R that filled its half a moment ago now fills half of that. */
await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  await store.addTrade({ id:'t7', accountId:'acc_1', date:'2026-09-17', timeOpen:'16:10', timeClose:'17:00', pair:'XAUUSD', side:'buy',
    riskPercent:1, netResult:3000, setupId:null, tagIds:['m_a'], status:'closed', mode:'live', notes:'' });
});
await p.evaluate(()=>{location.hash='#/';}); await p.waitForTimeout(300);
await p.evaluate(()=>{location.hash='#/analytics';}); await p.waitForTimeout(600);
g = await groups();
t('the longest bar on the page is now Calm, filling its half',
  Math.abs(row('Mood','Calm').bar.width - 50) < 0.01 && row('Mood','Calm').cells[3] === '+2.00R', JSON.stringify(row('Mood','Calm')));
t('and Chased it, still +1.00R, is drawn half as long',
  Math.abs(row('Entry','Chased it').bar.width - 25) < 0.01, JSON.stringify(row('Entry','Chased it').bar));

/* ---------- no groups at all ---------- */
await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  store.playbook.tagGroups = [];
  await store.save('playbook');
});
await p.evaluate(()=>{location.hash='#/';}); await p.waitForTimeout(300);
await p.evaluate(()=>{location.hash='#/analytics';}); await p.waitForTimeout(600);
await p.evaluate(()=>[...document.querySelectorAll('.head .seg button')].find(b=>b.textContent.trim()==='Tags').click());
await p.waitForTimeout(500);
t('with no groups set up it points at the Playbook rather than showing a blank',
  await p.evaluate(()=>/No tag groups yet/.test(document.querySelector('.main').innerText)),
  await p.evaluate(()=>document.querySelector('.main').innerText.replace(/\s+/g,' ').slice(0,90)));

t('no errors', errs.length===0, errs.join(' | ')||'clean');
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
