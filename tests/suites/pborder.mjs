/* The playbook's tags are in the order you put them in, and the risk rules
   have moved down the right-hand side under the sessions. */
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

const PB = {version:4, setups:[{id:'s_a',name:'Sweep',color:'#0988F0',rules:[]}],
  sessions:[{id:'ses_l',name:'London',start:'15:00',end:'19:00'},
            {id:'ses_n',name:'New York',start:'20:00',end:'23:00'}],
  tagGroups:[
    {id:'g_exec',   name:'Execution', tags:[{id:'tg1',name:'Waited'},{id:'tg2',name:'Early'},{id:'tg3',name:'Chased'}]},
    {id:'g_mistake',name:'Mistakes',  tags:[{id:'tg4',name:'Moved my stop'},{id:'tg5',name:'Revenge'}]},
    {id:'g_context',name:'Context',   tags:[{id:'tg6',name:'London open'}]},
    {id:'g_emotion',name:'Emotion',   tags:[]},
  ],
  rules:{maxTradesPerDay:3,dailyLossCapPercent:2}, replay:{windowMins:15,csvClock:'local'}};
const T=[{id:'T1',accountId:'acc_1',pair:'XAUUSD',side:'buy',date:'2026-09-14',timeOpen:'16:10',timeClose:'17:00',
  riskPercent:1,netResult:900,entryPrice:4440,stopLoss:4430,exitPrice:4460,tagIds:['tg4','tg6'],sessionId:'ses_l',
  setupId:'s_a',notes:'',status:'closed',mode:'live'}];

const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1600,height:980}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({PB,T})=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',
      accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                 color:'#18AC65',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:T})],
    ['data/playbook.json', JSON.stringify(PB)]]));
},{PB,T});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});

/* ---------- what the model says ---------- */
const groups = () => p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  return store.playbook.tagGroups.map(g=>g.name).join(',');
});
const tagsIn = id => p.evaluate(async gid=>{
  const { store } = await import('/js/store.js');
  return (store.playbook.tagGroups.find(g=>g.id===gid)?.tags||[]).map(x=>x.name).join(',');
}, id);
/* What is actually on disk, not just in memory. */
const filed = () => p.evaluate(()=>{
  const rows = JSON.parse(localStorage.getItem('fakefs')||'[]');
  const pb = JSON.parse((rows.find(r=>r[0]==='data/playbook.json')||[])[1]||'{}');
  return { groups:(pb.tagGroups||[]).map(g=>g.name).join(','),
           exec:((pb.tagGroups||[]).find(g=>g.id==='g_exec')?.tags||[]).map(x=>x.name).join(',') };
});
/* What the page shows, top to bottom / left to right. */
const shown = () => p.evaluate(()=>[...document.querySelectorAll('.sort-item')].map(n=>n.dataset.sortid).join(','));
const shownTags = gid => p.evaluate(g=>[...document.querySelectorAll(`.sort-item[data-sortid="${g}"] .sort-tag`)]
  .map(n=>n.innerText.replace('×','').trim()).join(','), gid);

const box = sel => p.evaluate(s=>{ const n=document.querySelector(s); if(!n) return null;
  const r=n.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right}; }, sel);
const cardBox = h2 => p.evaluate(label=>{
  const card=[...document.querySelectorAll('.card')].find(c=>c.querySelector('h2')?.textContent.trim()===label);
  if(!card) return null; const r=card.getBoundingClientRect();
  return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),b:Math.round(r.bottom),r:Math.round(r.right)};
}, h2);

/* A real drag: press, break the slop threshold, travel, let go. */
async function drag(fromSel, toSel, where) {
  const A = await box(fromSel), B = await box(toSel);
  const ax = A.x + A.w/2, ay = A.y + A.h/2;
  await p.mouse.move(ax, ay);
  await p.mouse.down();
  await p.mouse.move(ax+7, ay+7, {steps:2});
  const tx = where==='right' ? B.x + B.w*0.85 : where==='left' ? B.x + B.w*0.15 : B.x + B.w/2;
  const ty = where==='below' ? B.y + B.h*0.85 : where==='above' ? B.y + B.h*0.15 : B.y + B.h/2;
  await p.mouse.move(tx, ty, {steps:10});
  await p.mouse.up();
  await p.waitForTimeout(340);
}

await p.evaluate(()=>{location.hash='#/playbook';}); await p.waitForTimeout(900);

/* ---------- where the cards sit now ---------- */
const setups = await cardBox('Setups'), tags = await cardBox('Tags');
const sessions = await cardBox('Sessions'), rules = await cardBox('Risk rules');
t('all four cards are on the page', !!(setups&&tags&&sessions&&rules));
t('Risk rules sits in the same column as Sessions', Math.abs(rules.x - sessions.x) <= 1, `${rules.x} vs ${sessions.x}`);
t('and below it, not beside it', rules.y >= sessions.b - 1, `rules ${rules.y}, sessions bottom ${sessions.b}`);
t('Tags has the middle column to itself', tags.r <= sessions.x + 1 && tags.x >= setups.r - 1,
  `tags ${tags.x}-${tags.r}, setups right ${setups.r}, sessions ${sessions.x}`);
t('and Tags is no longer sharing its column with the rules', tags.r <= rules.x + 1, `${tags.r} vs ${rules.x}`);
t('the rules are all still there', await p.evaluate(()=>{
  const card=[...document.querySelectorAll('.card')].find(c=>c.querySelector('h2')?.textContent.trim()==='Risk rules');
  const txt=card.innerText;
  return ['Default risk per trade','Max trades per day','Daily loss cap','Weekly target'].every(k=>txt.includes(k));
}));

/* ---------- a handle per group, one you do not trip over ---------- */
t('every group has a grip', await p.evaluate(()=>document.querySelectorAll('.sort-item > .sort-head > .grip').length) === 4);
t('the grips are out of the way until the group is under the pointer',
  await p.evaluate(()=>getComputedStyle(document.querySelector('.grip')).opacity) === '0');
t('hovering a group shows its grip', await (async()=>{
  await p.hover('.sort-item[data-sortid="g_mistake"] .sort-head');
  await p.waitForTimeout(260);
  return await p.evaluate(()=>getComputedStyle(document.querySelector('.sort-item[data-sortid="g_mistake"] .grip')).opacity) === '1';
})());
t('the page says the list can be rearranged', await p.evaluate(()=>{
  const card=[...document.querySelectorAll('.card')].find(c=>c.querySelector('h2')?.textContent.trim()==='Tags');
  return /drag to reorder/i.test(card.innerText); }));

/* ---------- dragging a group ---------- */
t('the groups start in the order they were filed', await groups() === 'Execution,Mistakes,Context,Emotion', await groups());
await drag('.sort-item[data-sortid="g_context"] .grip', '.sort-item[data-sortid="g_exec"]', 'above');
t('dragging Context above Execution puts it first', await groups() === 'Context,Execution,Mistakes,Emotion', await groups());
t('the page agrees with the model', await shown() === 'g_context,g_exec,g_mistake,g_emotion', await shown());
t('and it was written to the playbook, not just moved on screen',
  (await filed()).groups === 'Context,Execution,Mistakes,Emotion', (await filed()).groups);
t('no tag went missing in the move', await tagsIn('g_exec') === 'Waited,Early,Chased', await tagsIn('g_exec'));

await drag('.sort-item[data-sortid="g_context"] .grip', '.sort-item[data-sortid="g_emotion"]', 'below');
t('dragging it past the last group puts it last', await groups() === 'Execution,Mistakes,Emotion,Context', await groups());

/* A drag that ends where it started is not a change. */
const beforeNoop = await groups();
await drag('.sort-item[data-sortid="g_mistake"] .grip', '.sort-item[data-sortid="g_mistake"]', 'middle');
t('picking a group up and putting it back changes nothing', await groups() === beforeNoop, await groups());

/* ---------- the arrow keys, for the long moves ---------- */
await p.focus('.sort-item[data-sortid="g_context"] .grip');
await p.keyboard.press('ArrowUp'); await p.waitForTimeout(300);
t('ArrowUp on the grip moves the group up one', await groups() === 'Execution,Mistakes,Context,Emotion', await groups());
t('and the keyboard stays on the handle it was holding',
  await p.evaluate(()=>document.activeElement?.closest('.sort-item')?.dataset.sortid) === 'g_context');
await p.keyboard.press('ArrowUp'); await p.waitForTimeout(300);
await p.keyboard.press('ArrowUp'); await p.waitForTimeout(300);
t('three taps puts it first', await groups() === 'Context,Execution,Mistakes,Emotion', await groups());
await p.keyboard.press('ArrowUp'); await p.waitForTimeout(300);
t('and a fourth does nothing — there is no above the top', await groups() === 'Context,Execution,Mistakes,Emotion', await groups());
t('it is on disk that way too', (await filed()).groups === 'Context,Execution,Mistakes,Emotion', (await filed()).groups);

/* ---------- dragging a tag inside its group ---------- */
t('the tags start as filed', await tagsIn('g_exec') === 'Waited,Early,Chased', await tagsIn('g_exec'));
await drag('.sort-tag[data-sortid="tg3"]', '.sort-tag[data-sortid="tg1"]', 'left');
t('dragging Chased to the front of its group reorders the group', await tagsIn('g_exec') === 'Chased,Waited,Early', await tagsIn('g_exec'));
t('the chips are painted in that order', await shownTags('g_exec') === 'Chased,Waited,Early', await shownTags('g_exec'));
t('and it is filed that way', (await filed()).exec === 'Chased,Waited,Early', (await filed()).exec);
t('the other groups were not touched', await tagsIn('g_mistake') === 'Moved my stop,Revenge', await tagsIn('g_mistake'));
t('and the groups themselves did not move', await groups() === 'Context,Execution,Mistakes,Emotion', await groups());

await drag('.sort-tag[data-sortid="tg3"]', '.sort-tag[data-sortid="tg2"]', 'right');
t('dragging it to the end puts it last', await tagsIn('g_exec') === 'Waited,Early,Chased', await tagsIn('g_exec'));

/* Arrow keys on a chip too. */
await p.focus('.sort-tag[data-sortid="tg3"]');
await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(300);
t('ArrowLeft on a tag moves it one to the left', await tagsIn('g_exec') === 'Waited,Chased,Early', await tagsIn('g_exec'));
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
t('ArrowRight puts it back', await tagsIn('g_exec') === 'Waited,Early,Chased', await tagsIn('g_exec'));

/* ---------- the things that must not become draggable ---------- */
t('the + that adds a tag stays at the end of the row', await p.evaluate(()=>{
  const row = document.querySelector('.sort-item[data-sortid="g_exec"] .sort-tag').parentElement;
  return row.lastElementChild.classList.contains('tag-add');
}));
t('and it is not something you can pick up', await p.evaluate(()=>
  !document.querySelector('.sort-item[data-sortid="g_exec"] .tag-add').hasAttribute('data-sortid')));
t('nor is "+ new group" part of the order', await p.evaluate(()=>{
  const card=[...document.querySelectorAll('.card')].find(c=>c.querySelector('h2')?.textContent.trim()==='Tags');
  const add=[...card.querySelectorAll('.tag-add')].find(x=>/new group/.test(x.textContent));
  return !!add && !add.hasAttribute('data-sortid') && !add.closest('.sort-item'); }));

/* The × inside a chip still deletes, and picking it up does not count as a drag. */
const armed = async () => p.evaluate(()=>
  document.querySelector('.sort-tag[data-sortid="tg5"]').innerText.replace(/\s+/g,' ').trim());
await p.click('.sort-tag[data-sortid="tg5"] button'); await p.waitForTimeout(260);
t('the × on a tag still arms rather than dragging', /delete/i.test(await armed()), await armed());
t('and nothing was reordered by touching it', await tagsIn('g_mistake') === 'Moved my stop,Revenge', await tagsIn('g_mistake'));
await p.click('.sort-tag[data-sortid="tg5"] button'); await p.waitForTimeout(400);
t('a second click deletes the tag', await tagsIn('g_mistake') === 'Moved my stop', await tagsIn('g_mistake'));

/* A plain click on a chip is not a drag. */
const beforeClick = await tagsIn('g_exec');
await p.click('.sort-tag[data-sortid="tg2"]', {position:{x:6,y:8}}); await p.waitForTimeout(260);
t('clicking a tag leaves the order alone', await tagsIn('g_exec') === beforeClick, await tagsIn('g_exec'));

/* Renaming still works with a grip in the row. */
await p.fill('.sort-item[data-sortid="g_emotion"] input', 'State of mind');
await p.keyboard.press('Tab'); await p.waitForTimeout(420);
t('a group can still be renamed', await groups() === 'Context,Execution,Mistakes,State of mind', await groups());

/* ---------- it survives a reload, and the rest of the app reads it ---------- */
await p.reload({waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});
await p.waitForTimeout(700);
t('the order comes back after a restart', await groups() === 'Context,Execution,Mistakes,State of mind', await groups());
t('so does the tag order', await tagsIn('g_exec') === 'Waited,Early,Chased', await tagsIn('g_exec'));

await p.evaluate(()=>{location.hash='#/new';}); await p.waitForTimeout(900);
t('the new-trade dropdowns follow the order you set',
  await p.evaluate(()=>[...document.querySelectorAll('.tag-drop > .b')].map(x=>x.innerText.replace(/[▾\s]+/g,' ').trim()).join(' | '))
    === 'CONTEXT | EXECUTION | MISTAKES | STATE OF MIND',
  await p.evaluate(()=>[...document.querySelectorAll('.tag-drop > .b')].map(x=>x.innerText.replace(/[▾\s]+/g,' ').trim()).join(' | ')));

t('no console or page errors', errs.length === 0, errs.slice(0,3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
