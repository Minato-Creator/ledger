/* Tags on the trade form are one dropdown per group now. The group is the
   question, its tags are the answers, and several answers are allowed. */
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


const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs','utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

const PB = {version:1, setups:[{id:'s_a',name:'FVG continuation',color:'#0988F0',rules:[]}],
  sessions:[{id:'ss_1',name:'London',start:'15:00',end:'19:00'}], tagGroups:[
    {id:'g_exec',name:'Execution',tags:[{id:'t1',name:'Waited for confirmation'},{id:'t2',name:'Early entry'}]},
    {id:'g_mistake',name:'Mistakes',tags:[{id:'t4',name:'Moved my stop'},{id:'t5',name:'Revenge trade'},{id:'t6',name:'Oversized'}]},
    {id:'g_context',name:'Context',tags:[{id:'t8',name:'London open'},{id:'t9',name:'Red folder news'}]},
    {id:'g_empty',name:'Emotion',tags:[]},
  ]};
const TRADE = {id:'T1',accountId:'acc_1',assetClass:'Forex',pair:'XAUUSD',side:'buy',date:'2026-09-14',
  timeOpen:'16:10',timeClose:'17:00',riskPercent:1,netResult:900,entryPrice:4440,stopLoss:4430,exitPrice:4460,
  tagIds:['t4','t9'],notes:'',status:'closed',mode:'live'};

const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1500,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({PB,TRADE})=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',
      accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                 color:'#18AC65',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:[TRADE]})],
    ['data/playbook.json', JSON.stringify(PB)]]));
},{PB,TRADE});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});

const drops = () => p.evaluate(()=>[...document.querySelectorAll('.tag-drop > .b')].map(x=>x.innerText.replace(/\s+/g,' ').trim()));
const openMenu = () => p.evaluate(()=>{
  const m=[...document.querySelectorAll('.tag-menu')].filter(x=>!x.hidden);
  return m.length !== 1 ? null : [...m[0].querySelectorAll('.tag-opt')].map(o=>
    (o.querySelector('.tick')?.classList.contains('is-on') ? '[x] ' : o.classList.contains('is-add') ? '' : '[ ] ')
    + o.innerText.replace(/[＋\s]+/g,' ').trim());
});
const chips = () => p.evaluate(()=>[...document.querySelectorAll('.tag-chip')].map(x=>x.innerText.replace('×','').trim()));
const clickDrop = name => p.evaluate(n=>[...document.querySelectorAll('.tag-drop > .b')]
  .find(x=>x.innerText.trim().toUpperCase().startsWith(n.toUpperCase())).click(), name);
const clickOpt = label => p.evaluate(l=>[...document.querySelectorAll('.tag-menu:not([hidden]) .tag-opt')]
  .find(x=>x.innerText.replace(/[＋\s]+/g,' ').trim()===l).click(), label);

await p.evaluate(()=>{location.hash='#/new';}); await p.waitForTimeout(800);

/* ---------- the shape of it ---------- */
let d = await drops();
t('one dropdown per group, named after the group', d.join(' | ') === 'EXECUTION ▾ | MISTAKES ▾ | CONTEXT ▾ | EMOTION ▾', d.join(' | '));
t('and no loose tag buttons left over', await p.evaluate(()=>document.querySelectorAll('.trade-form .tag').length) === 0);
t('nothing is open to begin with', await p.evaluate(()=>[...document.querySelectorAll('.tag-menu')].every(x=>x.hidden)));
t('and nothing is on the trade yet', (await chips()).length === 0);
t('the dropdowns wrap rather than overflow', await p.evaluate(()=>{
  const g=document.querySelector('.tag-groups'); return getComputedStyle(g).flexWrap === 'wrap' && g.scrollWidth <= g.clientWidth + 1; }));

/* ---------- opening one ---------- */
await clickDrop('Mistakes'); await p.waitForTimeout(250);
let m = await openMenu();
t('opening Mistakes shows that group’s tags and no others',
  m && m.join(' / ') === '[ ] Moved my stop / [ ] Revenge trade / [ ] Oversized / new tag', JSON.stringify(m));
t('exactly one menu is open', m !== null);

/* ---------- several from one group ---------- */
await clickOpt('Moved my stop'); await p.waitForTimeout(200);
await clickOpt('Revenge trade'); await p.waitForTimeout(200);
m = await openMenu();
t('the panel stays open while you tick', m !== null);
t('both are ticked — a group is not a single choice',
  m && m[0].startsWith('[x]') && m[1].startsWith('[x]') && m[2].startsWith('[ ]'), JSON.stringify(m));
d = await drops();
t('the group button counts them', /MISTAKES 2/.test(d[1]), d[1]);
t('and the other groups stay at zero', !/\d/.test(d[0]+d[2]+d[3]), d.join(' | '));
t('what is on the trade is listed underneath',
  (await chips()).join(',') === 'Moved my stop,Revenge trade', (await chips()).join(','));

/* ---------- untick ---------- */
await clickOpt('Moved my stop'); await p.waitForTimeout(200);
t('unticking takes it off again', (await chips()).join(',') === 'Revenge trade', (await chips()).join(','));
t('and the count follows', /MISTAKES 1/.test((await drops())[1]), (await drops())[1]);

/* ---------- a second group at the same time ---------- */
await clickDrop('Context'); await p.waitForTimeout(250);
t('opening another closes the first', (await openMenu()) !== null);
await clickOpt('Red folder news'); await p.waitForTimeout(200);
t('tags from two groups sit together',
  (await chips()).sort().join(',') === 'Red folder news,Revenge trade', (await chips()).join(','));

/* ---------- putting it away ---------- */
await p.mouse.click(1200, 700); await p.waitForTimeout(250);
t('clicking elsewhere puts the panel away', await p.evaluate(()=>[...document.querySelectorAll('.tag-menu')].every(x=>x.hidden)));
t('and the choices survive it', (await chips()).length === 2);
await clickDrop('Context'); await p.waitForTimeout(200);
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
t('Escape closes it too', await p.evaluate(()=>[...document.querySelectorAll('.tag-menu')].every(x=>x.hidden)));

/* ---------- an empty group ---------- */
await clickDrop('Emotion'); await p.waitForTimeout(250);
m = await openMenu();
t('a group with no tags still opens, offering to make one', m && m.join('/') === 'new tag', JSON.stringify(m));

/* ---------- a new tag joins the group it was made in ---------- */
await clickOpt('new tag'); await p.waitForTimeout(300);
await p.keyboard.type('Impatient'); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
const grouped = await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  return store.playbook.tagGroups.map(g=>g.name+':'+g.tags.map(t=>t.name).join('+')).join(' | ');
});
t('the new tag lands in the group it was made in, not the first one',
  /Emotion:Impatient/.test(grouped), grouped);
t('and it is put on the trade', (await chips()).includes('Impatient'), (await chips()).join(','));
t('its group now counts one', /EMOTION 1/.test((await drops())[3]), (await drops())[3]);

/* ---------- saving ---------- */
await p.locator('.main input[placeholder="XAUUSD"]').first().fill('NAS100');
await p.evaluate(()=>{const i=[...document.querySelectorAll('.result-band input')].find(n=>n.placeholder==='0.00');
  i.value='300'; i.dispatchEvent(new Event('input',{bubbles:true}));});
await p.waitForTimeout(250);
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/Save trade/.test(x.textContent)).click());
await p.waitForTimeout(1200);
const savedIds = await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  const t = store.trades.find(x=>x.pair==='NAS100');
  const names = id => store.playbook.tagGroups.flatMap(g=>g.tags).find(x=>x.id===id)?.name;
  return t && t.tagIds.map(names).sort();
});
t('every tag ticked is saved on the trade, across groups',
  savedIds && savedIds.join(',') === 'Impatient,Red folder news,Revenge trade', JSON.stringify(savedIds));

/* ---------- editing an older trade ---------- */
await p.evaluate(()=>{location.hash='#/edit/T1';}); await p.waitForTimeout(900);
t('an existing trade opens with its tags already listed',
  (await chips()).sort().join(',') === 'Moved my stop,Red folder news', (await chips()).join(','));
d = await drops();
t('and the counts are spread over the right groups',
  /MISTAKES 1/.test(d[1]) && /CONTEXT 1/.test(d[2]) && !/\d/.test(d[0]), d.join(' | '));
await clickDrop('Mistakes'); await p.waitForTimeout(250);
m = await openMenu();
t('its tag is ticked when the group is opened', m && m[0].startsWith('[x]'), JSON.stringify(m));

/* a chip is a way to take one off */
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
await p.evaluate(()=>[...document.querySelectorAll('.tag-chip')].find(x=>/Moved my stop/.test(x.innerText)).click());
await p.waitForTimeout(250);
t('clicking a chip takes that tag off', (await chips()).join(',') === 'Red folder news', (await chips()).join(','));
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/Save changes/.test(x.textContent)).click());
await p.waitForTimeout(1100);
t('and the removal is saved', await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  return store.trades.find(x=>x.id==='T1').tagIds.join(','); }) === 't9');

/* ---------- it survives a restart ---------- */
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1100);
await p.evaluate(()=>{location.hash='#/edit/T1';}); await p.waitForTimeout(900);
t('all of it is still true after a restart', (await chips()).join(',') === 'Red folder news', (await chips()).join(','));

/* ---------- light theme ---------- */
await setTheme(p, 'light');
await p.evaluate(()=>{location.hash='#/edit/T1';}); await p.waitForTimeout(900);
t('the theme really did switch', await p.evaluate(()=>document.documentElement.dataset.theme) === 'light');
await clickDrop('Mistakes'); await p.waitForTimeout(300);
const light = await p.evaluate(()=>{
  const m=document.querySelector('.tag-menu:not([hidden])'); const o=m.querySelector('.tag-opt');
  const bg=getComputedStyle(m).backgroundColor, fg=getComputedStyle(o).color;
  const num = s => s.match(/\d+/g).slice(0,3).map(Number);
  const lum = c => .2126*c[0]+.7152*c[1]+.0722*c[2];
  return { bg, fg, gap: Math.abs(lum(num(bg))-lum(num(fg))) };
});
t('the panel is readable in the light theme too', light.gap > 60, JSON.stringify(light));

/* ---------- how much room it costs ----------
   The trade form is built to fit without scrolling, and it has almost no
   slack. One row of dropdowns costs less than the flat row of every tag in
   the journal did; the line of chosen tags underneath is what costs. This
   records the real numbers rather than leaving them to be discovered. */
await p.setViewportSize({width:1440, height:900});
await p.evaluate(()=>{location.hash='#/edit/T1';}); await p.waitForTimeout(800);
const fit = async () => p.evaluate(()=>{const f=document.querySelector('.trade-form');
  return { over: f.scrollHeight - f.clientHeight, groups: Math.round(document.querySelector('.tag-groups').getBoundingClientRect().height) };});
let room = await fit();
t('the tags make only the form scroll, never the page', await p.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1), JSON.stringify(room));
t('and the dropdowns are one line at that width', room.groups < 40, JSON.stringify(room));

/* ---------- and you can actually see it ----------
   The menu had all the right tags in it and could not be seen: it was drawn
   inside a box 25 pixels tall that scrolled, and a box that scrolls clips.
   Reading the text out of the DOM never noticed. Hit-testing does — the
   point on screen where the menu is has to belong to the menu. */
const canSee = sel => p.evaluate(s=>{
  const n = document.querySelector(s);
  if (!n) return 'missing';
  const r = n.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return `no size (${Math.round(r.width)}x${Math.round(r.height)})`;
  if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) return 'off screen';
  /* Whatever is painted in the middle of it has to be it. */
  const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
  if (!hit || !(hit === n || n.contains(hit))) return `covered by ${hit ? (hit.className||hit.tagName) : 'nothing'}`;
  /* And no box it sits inside may be cutting a piece off it. */
  for (let a = n.parentElement; a && a !== document.body; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const b = a.getBoundingClientRect();
    if (r.top < b.top - 1 || r.bottom > b.bottom + 1 || r.left < b.left - 1 || r.right > b.right + 1)
      return `clipped by ${a.className||a.tagName} (${Math.round(b.top)}-${Math.round(b.bottom)} vs ${Math.round(r.top)}-${Math.round(r.bottom)})`;
  }
  return 'ok';
}, sel);
const seen = async sel => (await canSee(sel)) === 'ok';

await p.setViewportSize({width:1600, height:980});
await p.evaluate(()=>{location.hash='#/new';}); await p.waitForTimeout(900);
await clickDrop('Mistakes'); await p.waitForTimeout(320);
t('the open menu is on screen and nothing covers it', await seen('.tag-menu:not([hidden])'), await canSee('.tag-menu:not([hidden])'));
t('and so is the first tag inside it', await seen('.tag-menu:not([hidden]) .tag-opt'), await canSee('.tag-menu:not([hidden]) .tag-opt'));
/* The form scrolls inside its card on a shorter page; bring the row into view as a person would. */
await p.evaluate(() => document.querySelector('.tag-drop > .b').scrollIntoView({ block: 'nearest' })); await p.waitForTimeout(150);
t('the group buttons themselves are not cut off either', await seen('.tag-drop > .b'), await canSee('.tag-drop > .b'));
t('clicking a tag in it still ticks the tag', await (async()=>{
  await clickOpt('Oversized'); await p.waitForTimeout(280);
  return (await chips()).includes('Oversized'); })());

/* A short window is where a menu runs out of room below the button. */
await p.setViewportSize({width:1500, height:620}); await p.waitForTimeout(400);
/* Off the page and back, so the form is built fresh at this size and
   nothing is left open from the block above. */
await p.evaluate(()=>{location.hash='#/trades';}); await p.waitForTimeout(400);
await p.evaluate(()=>{location.hash='#/new';}); await p.waitForTimeout(800);
await clickDrop('Mistakes'); await p.waitForTimeout(340);
t('on a short window the menu still lands somewhere you can see it',
  await seen('.tag-menu:not([hidden])'), await canSee('.tag-menu:not([hidden])'));
await p.setViewportSize({width:1500, height:950});

t('no errors', errs.length===0, errs.join(' | ')||'clean');
await p.screenshot({path:OUT + '/tags-light.png'});
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
