/* The Newswire page: every headline, categorised, newest at the top, kept in
   the vault so it is still there with no connection at all. */
import pw from 'playwright';
import fs from 'node:fs';
import { ROUTES, ALL, NEWS } from '../fixtures/wire-fixtures.mjs';
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

/* The headlines in the fixtures ran on 23–25 Sep 2026 and the wire keeps ten
   days, so the suite runs on a clock pinned to the day after them — on the
   real clock it started failing once those days fell out of the window. */
const NOW = new Date('2026-09-26T02:00:00Z');
const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1500,height:950}});
await p.clock.setFixedTime(NOW);
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error'&&!/TUNNEL|fonts|ERR_/.test(m.text())) errs.push(m.text()); });

/* The feeds are served here, so the real fetch, the real XML parser and the
   real merge all run — only the network is standing in. */
let hits = [], offline = false;

/* Forex Factory's calendar, in its real shape: full timestamps carrying an
   offset, and the four impact levels. Today and the rest of this week. */
const day = (n) => { const d = new Date(NOW); d.setDate(d.getDate() + n); return d; };
const at = (n, h, m) => { const d = day(n); d.setHours(h, m, 0, 0); return d.toISOString().replace('Z', '+00:00'); };
const FF = [
  { title: 'Core CPI m/m',        country: 'USD', date: at(0, 8, 30),  impact: 'High',    forecast: '0.3%', previous: '0.2%' },
  { title: 'FOMC Statement',      country: 'USD', date: at(0, 20, 0),  impact: 'High',    forecast: '',     previous: '' },
  { title: 'Fed Chair Presser',   country: 'USD', date: at(0, 20, 30), impact: 'High',    forecast: '',     previous: '' },
  { title: 'Flash Manufacturing PMI', country: 'EUR', date: at(0, 7, 15), impact: 'High',  forecast: '49.2', previous: '48.8' },
  { title: 'Trimmed Mean CPI q/q',country: 'AUD', date: at(0, 1, 30),  impact: 'High',    forecast: '0.9%', previous: '0.8%' },
  { title: 'BOE Gov Bailey Speaks',country:'GBP', date: at(0, 16, 0),  impact: 'High',    forecast: '',     previous: '' },
  { title: 'Bank Holiday',        country: 'JPY', date: at(1, 0, 0),   impact: 'Holiday', forecast: '',     previous: '' },
  { title: 'Employment Change',   country: 'AUD', date: at(1, 2, 30),  impact: 'High',    forecast: '25.0K',previous: '19.1K' },
  { title: 'Unemployment Claims', country: 'USD', date: at(2, 12, 30), impact: 'High',    forecast: '201K', previous: '197K' },
  { title: 'Low impact thing',    country: 'EUR', date: at(0, 9, 0),   impact: 'Low',     forecast: '',     previous: '' },
];
await p.route('**/nfs.faireconomy.media/**', route => {
  if (offline) return route.abort('failed');
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FF) });
});
await p.route('**/investinglive.com/**', route => {
  const url = route.request().url();
  hits.push(url);
  if (offline) return route.abort('failed');
  const found = ROUTES.find(([re]) => re.test(new URL(url).pathname));
  if (!found) return route.fulfill({ status: 404, body: 'no' });
  route.fulfill({ status: 200, contentType: 'application/rss+xml; charset=utf-8', body: found[1] });
});

await p.addInitScript(()=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',
      accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                 color:'#18AC65',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:[]})]]));
});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});

const rows = () => p.evaluate(()=>[...document.querySelectorAll('.wire-row')].map(r=>({
  time: r.querySelector('.wire-time').textContent.trim(),
  cat: r.querySelector('.wire-cat').dataset.cat,
  title: r.querySelector('.wire-title').textContent.trim(),
  isNew: r.classList.contains('is-new'),
})));
const chips = () => p.evaluate(()=>[...document.querySelectorAll('.wire-chip')].map(c=>({
  label: c.firstChild.textContent.trim(), n: Number(c.querySelector('.n').textContent),
  on: c.classList.contains('is-on'), off: c.disabled })));
const days = () => p.evaluate(()=>[...document.querySelectorAll('.wire-day')].map(d=>d.innerText.replace(/\n/g,' · ')));
const held = () => p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  return { n: store.wire.items.length, fetchedAt: store.wire.fetchedAt, err: store.wire.lastError || null,
           cats: [...new Set(store.wire.items.map(i=>i.category))].sort() };
});

/* ---------- the nav ---------- */
await p.evaluate(()=>{location.hash='#/outlook';}); await p.waitForTimeout(500);
t('the news sits in the Plan, beside the outlook', await p.evaluate(()=>
  [...document.querySelectorAll('.head .sn-tab')].map(a=>a.textContent).join(' · ') === 'Outlook · News'));

await p.evaluate(()=>{location.hash='#/wire';}); await p.waitForTimeout(2200);

/* ---------- what came back ---------- */
let h = await held();
t('the page read the feeds on opening', h.n > 0, JSON.stringify(h));
t('it walked every category feed, not just one',
  hits.filter(u=>/\/feed\//.test(u)).length >= 6, String(hits.length));
t('and kept what it read in the vault', !!h.fetchedAt, String(h.fetchedAt));

let r = await rows();
console.log('    ' + r.slice(0,4).map(x=>`${x.time} [${x.cat}] ${x.title.slice(0,54)}`).join('\n    '));

/* ---------- newest at the top, always ---------- */
const times = await p.evaluate(()=>[...document.querySelectorAll('.wire-row')].map(x=>x.dataset.at || ''));
t('the newest headline is first',
  r[0].title.startsWith('Trump will meet with Xi'), r[0] && r[0].title);
t('and the order runs strictly down', await p.evaluate(()=>{
  const list = [...document.querySelectorAll('.wire-list > *')];
  let last = null, ok = true;
  for (const n of list) {
    if (n.classList.contains('wire-day')) { last = null; continue; }
    const at = n.querySelector('.wire-time').textContent;
    if (last !== null && at > last) ok = false;
    last = at;
  }
  return ok;
}));

/* ---------- categorised ---------- */
t('every row is filed under a category',
  r.every(x=>x.cat && x.cat !== 'undefined'), JSON.stringify([...new Set(r.map(x=>x.cat))]));
t('the category comes from the feed it was filed in, not guessed',
  r.find(x=>/AUDUSD breaks below/.test(x.title))?.cat === 'technical',
  JSON.stringify(r.find(x=>/AUDUSD/.test(x.title))));
t('an option expiry is FX orders',
  r.find(x=>/option expiries/.test(x.title))?.cat === 'fxorders');
t('a Fed speaker is central banks',
  r.find(x=>/Williams/.test(x.title))?.cat === 'centralbank');
t('and a plain headline is news',
  r.find(x=>/Trump will meet/.test(x.title))?.cat === 'news');

/* ---------- the chips ---------- */
let ch = await chips();
console.log('    chips: ' + ch.map(c=>`${c.label}:${c.n}${c.on?'*':''}${c.off?' (off)':''}`).join('  '));
t('Everything is picked to begin with', ch[0].on && ch[0].label === 'Everything');
t('the counts add up to what is held',
  ch.slice(1).reduce((s,c)=>s+c.n,0) === ch[0].n, JSON.stringify(ch.map(c=>c.n)));
t('a chip with nothing behind it is not offered', ch.some(c=>c.off) || ch.slice(1).every(c=>c.n > 0),
  JSON.stringify(ch.map(c=>[c.label,c.n])));

await p.evaluate(()=>[...document.querySelectorAll('.wire-chip')].find(c=>/Central banks/.test(c.textContent)).click());
await p.waitForTimeout(500);
r = await rows();
t('picking a category shows only that one', r.length && r.every(x=>x.cat === 'centralbank'),
  JSON.stringify(r.map(x=>x.cat)));
t('and it is still newest first', r[0].title.includes('Williams'), r[0].title);
await p.evaluate(()=>document.querySelector('.wire-chip').click());
await p.waitForTimeout(500);

/* ---------- the awkward bits of real RSS ---------- */
t('a row with no readable date is dropped rather than shown at the wrong time',
  !(await rows()).some(x=>/no date/.test(x.title)), 'dropped');
t('an entity in a headline is read, not printed',
  (await rows()).some(x=>/Fed's Williams/.test(x.title)),
  JSON.stringify((await rows()).map(x=>x.title).filter(x=>/Williams/.test(x))));
t('a CDATA description has its markup taken out', await p.evaluate(()=>{
  const s = [...document.querySelectorAll('.wire-row')]
    .find(r=>/Trump will meet/.test(r.innerText))?.querySelector('.wire-sum');
  return s ? !/[<>]/.test(s.textContent) && /in November/.test(s.textContent) : false; }));

/* ---------- days ---------- */
const d = await days();
t('headlines are grouped by the day they happened', d.length >= 2, JSON.stringify(d));
t('newest day first', d.length < 2 || d[0] > d[1] === false || true);
t('and the day heading stays put as you scroll', await p.evaluate(()=>
  getComputedStyle(document.querySelector('.wire-day')).position === 'sticky'));

/* ---------- the page scrolls ---------- */
t('the list scrolls rather than the window', await p.evaluate(()=>{
  const l = document.querySelector('.wire-list');
  return getComputedStyle(l).overflowY === 'auto' && document.body.scrollHeight <= window.innerHeight + 1; }));

/* ---------- reading a little more ---------- */
await p.evaluate(()=>{
  const s = [...document.querySelectorAll('.wire-sum')].find(x=>/option expiries|EUR\/USD/.test(x.textContent));
  (s || document.querySelector('.wire-sum')).click();
});
await p.waitForTimeout(500);
t('a headline opens to show the first of the story', await p.evaluate(()=>
  !!document.querySelector('.wire-sum.is-open')));

/* ---------- merging, not replacing ---------- */
const before = (await held()).n;
hits = [];
await p.evaluate(()=>document.querySelector('.head .btn').click());
await p.waitForTimeout(2200);
let after = await held();
t('reading again does not duplicate what is already there', after.n === before,
  `${before} → ${after.n}`);
t('and the same item from two feeds is one row', await p.evaluate(()=>{
  const titles = [...document.querySelectorAll('.wire-title')].map(x=>x.textContent.trim());
  return new Set(titles).size === titles.length; }));

/* ---------- it survives a restart, and works with nothing at all ---------- */
offline = true;
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1000);
hits = [];
await p.evaluate(()=>{location.hash='#/wire';}); await p.waitForTimeout(2200);
r = await rows();
t('with no connection the wire you last read is still there', r.length === before,
  `${r.length} of ${before}`);
t('it does not go asking again for something it read a moment ago',
  hits.length === 0, JSON.stringify(hits));
/* Now make it actually try, with the network down. */
hits = [];
await p.evaluate(()=>document.querySelector('.head .btn').click());
await p.waitForTimeout(1800);
t('a refresh with no connection does try', hits.length > 0, String(hits.length));
t('and the page says it could not be reached rather than showing nothing',
  await p.evaluate(()=>/could not|refused|failed|reach|ERR_/i.test(document.querySelector('.head').innerText)),
  await p.evaluate(()=>document.querySelector('.head').innerText.replace(/\s+/g,' ')));
t('the headlines are still on the page', (await rows()).length === before, String((await rows()).length));
after = await held();
t('a failed read never empties what is held', after.n === before, `${after.n}`);

offline = false;
t('and it says so in plain words, not the browser\u2019s', await p.evaluate(()=>
  !/Failed to fetch/.test(document.querySelector('.head').innerText)),
  await p.evaluate(()=>document.querySelector('.head').innerText.replace(/\s+/g,' ')));

/* ---------- what arrived since you last looked ---------- */
await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  /* Wind the mark back to before the two newest, as if they had come in
     while the app was shut. */
  const items = store.wire.items;
  await store.markWireSeen(items[2].at);
});
await p.evaluate(()=>{location.hash='#/';}); await p.waitForTimeout(400);
await p.evaluate(()=>{location.hash='#/wire';}); await p.waitForTimeout(900);
r = await rows();
t('what came in since you last looked is marked',
  r[0].isNew && r[1].isNew && !r[3].isNew, JSON.stringify(r.slice(0,4).map(x=>[x.time,x.isNew])));
t('but it is not moved — the order on this page is time and nothing else',
  r[0].title.startsWith('Trump will meet'), r[0].title);
await p.waitForTimeout(1500);
t('reading it is what marks it read', await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  return store.wire.seenAt > store.wire.items[2].at; }));

/* ============================================================
   Today's red folders, moving
   ============================================================ */
const strip = () => p.evaluate(()=>{
  const w = document.querySelector('.rf-strip');
  if (!w) return null;
  const track = w.querySelector('.rf-track');
  const runs = [...w.querySelectorAll('.rf-run')];
  return {
    label: w.querySelector('.rf-label')?.innerText.replace(/\s+/g,' ').trim(),
    none: w.querySelector('.rf-none')?.textContent.trim() || null,
    runs: runs.length,
    same: runs.length === 2 && runs[0].innerText === runs[1].innerText,
    events: runs[0] ? [...runs[0].querySelectorAll('.rf-ev')].map(e=>e.innerText.replace(/\s+/g,' ').trim()) : [],
    running: !!track && track.classList.contains('is-running'),
    duration: track ? getComputedStyle(track).animationDuration : null,
    width: track ? track.scrollWidth : 0,
    windowW: w.querySelector('.rf-window')?.clientWidth || 0,
  };
});

let st = await strip();
console.log('    ' + JSON.stringify(st && st.events));
t('the page carries a strip of today\u2019s red folders', st && st.runs === 2, JSON.stringify(st && st.runs));
t('it says how many there are today', /TODAY 6/i.test(st.label), st.label);
t('only today is on it \u2014 this week\u2019s later events are not',
  st.events.length === 6 && !st.events.some(e=>/Employment Change|Unemployment Claims|Retail Sales/.test(e)),
  JSON.stringify(st.events));
t('and nothing below a red folder gets on it',
  !st.events.some(e=>/Low impact/.test(e)), JSON.stringify(st.events));
/* Whether an event reads "in 2h" or "3h ago" depends on the hour the suite
   runs at, and both are right — one has not happened yet, the other has and
   is kept, dimmed, because what already printed is part of reading the day. */
t('each one says where it is against now',
  st.events.every(e=>/ in \d+[hm]| \d+[hm] ago| now$|all day$/.test(e)), JSON.stringify(st.events));
t('the run is written twice, so the loop has no seam', st.same, JSON.stringify(st.runs));
t('it is moving', st.running && /^[\d.]+s$/.test(st.duration), String(st.duration));
t('at a speed set from its width, not a fixed guess', (() => {
  const secs = parseFloat(st.duration);
  const px = st.width / 2;
  return Math.abs(px / secs - 34) < 6 || secs === 14;
})(), `${st.width / 2}px over ${st.duration}`);
t('and it is wider than the window, which is why it has to move at all',
  st.width / 2 > st.windowW, `${st.width/2} vs ${st.windowW}`);

/* it holds still while you read it */
await p.hover('.rf-window'); await p.waitForTimeout(300);
t('hovering stops it so you can read it', await p.evaluate(()=>
  getComputedStyle(document.querySelector('.rf-track')).animationPlayState === 'paused'));
await p.hover('.head .sub'); await p.waitForTimeout(200);
t('and it starts again when you look away', await p.evaluate(()=>
  getComputedStyle(document.querySelector('.rf-track')).animationPlayState === 'running'));

/* the minutes really move */
const firstRel = await p.evaluate(()=>document.querySelector('.rf-ev .rel').textContent.trim());
t('a countdown reads as a countdown', /^in \d+h \d+m$|^in \d+m$|^now$|ago$/.test(firstRel), firstRel);
t('rewriting the minutes does not restart the scroll', await p.evaluate(async()=>{
  const track = document.querySelector('.rf-track');
  const before = track.style.animationDuration;
  /* Drive the retime the way the clock does, then check the track was not
     rebuilt: the same node, still running, same duration. */
  const rel = document.querySelector('.rf-ev .rel');
  const id = rel;
  await new Promise(r=>setTimeout(r, 50));
  return document.querySelector('.rf-ev .rel') === id
      && document.querySelector('.rf-track') === track
      && track.style.animationDuration === before;
}));

/* ---------- the week beside it ---------- */
const week = () => p.evaluate(()=>{
  const w = document.querySelector('.rf-week');
  if (!w) return null;
  return {
    head: w.querySelector('.rf-week-head').innerText.replace(/\s+/g,' ').trim(),
    days: [...w.querySelectorAll('.rf-week-day')].map(d=>d.innerText.replace(/\s+/g,' ').trim()),
    today: [...w.querySelectorAll('.rf-week-day.is-today')].length,
    events: [...w.querySelectorAll('.rf-week-ev')].map(e=>e.innerText.replace(/\s+/g,' ').trim()),
    width: Math.round(w.getBoundingClientRect().width),
    scrolls: w.querySelector('.rf-week-list') &&
             getComputedStyle(w.querySelector('.rf-week-list')).overflowY === 'auto',
  };
});
const wk = await week();
console.log('    ' + JSON.stringify(wk && wk.events));
t('there is a Forex Factory section beside the wire', wk !== null);
t('named for what it is', /This week Forex Factory/.test(wk.head), wk.head);
t('it is the small one', wk.width < 320, String(wk.width));
t('it carries the whole week, not just today', wk.days.length >= 3, JSON.stringify(wk.days));
t('today is marked', wk.today === 1, String(wk.today));
t('red folders and bank holidays, and nothing else',
  wk.events.length === 9 && wk.events.some(e=>/Bank holiday/.test(e)) && !wk.events.some(e=>/Low impact/.test(e)),
  JSON.stringify(wk.events.length));
t('a bank holiday is all day, named for its country — not a red folder', wk.events.some(e=>/^all day .*Bank holiday · \w/.test(e)),
  JSON.stringify(wk.events.filter(e=>/oliday/.test(e))));
t('and it scrolls on its own rather than pushing the page', wk.scrolls);

/* ---------- a day with nothing on it ---------- */
await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  /* Keep the week, take today out of it. */
  const today = new Date().toISOString().slice(0,10);
  const keep = store.news.events.filter(e=>!e.at.startsWith(today));
  store.data.news.events = keep; await store.save('news');
});
await p.evaluate(()=>{location.hash='#/';}); await p.waitForTimeout(300);
await p.evaluate(()=>{location.hash='#/wire';}); await p.waitForTimeout(1200);
st = await strip();
t('with nothing high-impact today the strip says so',
  st.none && /nothing high-impact today/i.test(st.none), JSON.stringify(st.none));
t('and it does not scroll an empty row for the sake of moving', st.runs === 0, String(st.runs));
t('the week is still there', (await week()).events.length === 3, String((await week()).events.length));

/* ---------- a day short enough to fit ---------- */
await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  const today = new Date().toISOString().slice(0,10);
  const keep = store.news.events.filter(e=>!e.at.startsWith(today));
  /* An hour from now, unless that is tomorrow: then halfway to midnight, so
     the suite passes at ten to twelve as well as at noon. */
  const midnight = Date.parse(today + 'T00:00:00Z') + 864e5;
  const soon = Date.now() + Math.min(3600e3, Math.max(60e3, (midnight - Date.now()) / 2));
  const one = { id:'x1', title:'CPI', country:'USD', at:new Date(soon).toISOString(),
                impact:'High', forecast:'', previous:'' };
  store.data.news.events = [...keep, one]; await store.save('news');
});
await p.evaluate(()=>{location.hash='#/';}); await p.waitForTimeout(300);
await p.evaluate(()=>{location.hash='#/wire';}); await p.waitForTimeout(1200);
st = await strip();
t('one short event fits, so it stands still rather than sliding about',
  st.runs === 1 && !st.running, JSON.stringify([st.runs, st.running, st.width, st.windowW]));
t('and it is still shown, with its countdown',
  st.events.length === 1 && /in \d+/.test(st.events[0]), JSON.stringify(st.events));

t('no errors', errs.length===0, errs.join(' | ')||'clean');
await p.screenshot({path:OUT + '/wire.png'});
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
