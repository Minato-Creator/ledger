/* A video behind everything, and glass in front of it: Frosted or Clear. */
import pw from 'playwright';
import { openLook, closeLook, setTheme, setGlass, pickBackground, backgroundNames } from './lookhelp.mjs';
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
fsx.mkdirSync(OUT, { recursive: true });

const { chromium } = pw;

const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs','utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
const mk=(i,d,net,h)=>({id:'t'+i,accountId:'acc_1',assetClass:'Futures',pair:'MGC',side:i%2?'sell':'buy',date:d,
  timeOpen:h+':10',timeClose:h+':50',riskPercent:1,netResult:net,tagIds:[],notes:'',setupId:null,sessionId:null});
const trades=[mk(1,'2026-09-01',900,'09'),mk(2,'2026-09-02',-1400,'14'),mk(3,'2026-09-03',180,'17'),
  mk(4,'2026-09-04',-260,'21'),mk(5,'2026-09-07',2400,'09'),mk(6,'2026-09-08',-600,'14'),mk(7,'2026-09-09',430,'22')];

const b=await chromium.launch({executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage({viewport:{width:1500,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errs.push(m.text()); });
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

await p.addInitScript(({trades})=>{
  // seed once — a reload has to find what the last run saved, not this again
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Glass');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',accounts:[{id:'acc_1',name:'Prop 100k',currency:'USD',startingBalance:100000,defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades})],
  ]));
},{trades});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar');
const layer = () => p.evaluate(() => {
  const L = document.querySelector('.bg-layer'), v = L?.querySelector('video');
  return { there: !!L && !L.hidden, src: v?.getAttribute('src') || '', poster: v?.getAttribute('poster') || '', paused: v ? v.paused : null,
           muted: v ? v.muted : null, loop: v ? v.loop : null, ready: v ? v.readyState : 0 };
});
const root = () => p.evaluate(() => ({ bg: document.documentElement.dataset.bg || null, glass: document.documentElement.dataset.glass,
  kind: document.documentElement.dataset.glassKind, scrim: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bg-scrim')) }));
const cardGlass = () => p.evaluate(() => {
  const s = getComputedStyle(document.querySelector('.card'));
  const a = (s.backgroundColor.match(/rgba?\(([^)]+)\)/) || [])[1]?.split(',').map(Number) || [];
  return { alpha: a.length === 4 ? a[3] : 1, filter: s.backdropFilter || s.webkitBackdropFilter || '' };
});
const blurOf = f => +((f.match(/blur\(([\d.]+)px\)/) || [])[1] || 0);

// default: nothing on
t('starts with no background', (await root()).bg === null && !(await layer()).there);
t('and glass off', (await root()).glass !== 'on');

await p.evaluate(()=>location.hash='#/settings'); await p.waitForTimeout(500);
const picks = await backgroundNames(p);
t('the pictures are gone: None plus seven videos', picks.length === 8 && !picks.some(n => /Lounge|Ridge|Canopy/.test(n)), picks.join(', '));
await openLook(p, 'custom');
t('None is selected', await p.evaluate(()=>document.querySelector('.lk-bg.is-none').classList.contains('is-on')));
t('every video tile shows its still', await p.evaluate(()=>[...document.querySelectorAll('.lk-bg:not(.is-none):not(.is-add)')].every(n=>/url\(/.test(getComputedStyle(n).backgroundImage))));
t('three kinds of glass to choose from', await p.evaluate(()=>[...document.querySelectorAll('.lk-seg button')].map(x=>x.textContent).join(',').includes('Solid,Frosted,Clear')));
await closeLook(p);

/* ---------- a video ---------- */
await pickBackground(p, 'Torii');
await p.waitForTimeout(900);
let r = await root(), L = await layer();
t('the video plays behind the app', r.bg === 'torii' && L.there && /media\/backgrounds\/torii\.mp4$/.test(L.src) && L.paused === false, JSON.stringify(L));
t('muted and on a loop, with its still as the poster', L.muted === true && L.loop === true && /torii\.jpg$/.test(L.poster));
t('the first video brings Clear glass, so it can be seen', r.glass === 'on' && r.kind === 'clear', JSON.stringify(r));
t('a bright video is held down hard', r.scrim >= .5 && r.scrim <= .75, String(r.scrim));
t('the app sits above it', await p.evaluate(()=>getComputedStyle(document.getElementById('app')).zIndex === '1'
  && getComputedStyle(document.querySelector('.bg-layer')).position === 'fixed'));

/* ---------- Clear against Frosted ---------- */
const clear = await cardGlass();
await setGlass(p, true);
r = await root();
const frosted = await cardGlass();
t('Frosted', r.kind === 'frosted' && r.glass === 'on');
t('Clear is far more see-through than Frosted', clear.alpha < .3 && frosted.alpha > .4 && blurOf(clear.filter) < blurOf(frosted.filter),
  JSON.stringify({ clear, frosted }));
t('no double blur on a nested card', await p.evaluate(()=>{
  const inner = document.querySelector('.card .card');
  return !inner || !/blur/.test(getComputedStyle(inner).backdropFilter || '');
}));
await setGlass(p, 'clear');
t('back to Clear', (await root()).kind === 'clear');

/* ---------- Dim ---------- */
await openLook(p, 'custom');
await p.evaluate(()=>{ const r = document.querySelector('.lk-range'); r.value = '0.2'; r.dispatchEvent(new Event('input',{bubbles:true})); r.dispatchEvent(new Event('change',{bubbles:true})); });
await p.waitForTimeout(400);
await closeLook(p);
t('Dim sets how dark the video sits', Math.abs((await root()).scrim - .2) < .001);
t('and it is kept', await p.evaluate(()=>JSON.parse(window.__files.get('data/accounts.json')).bgDim === 0.2));

// it survives every page, and a reload
for (const [hash,name] of [['#/','dashboard'],['#/trades','trades'],['#/calendar','calendar'],['#/analytics','analytics'],['#/replay','replay'],['#/playbook','playbook'],['#/new','new trade']]) {
  const before = errs.length;
  await p.evaluate(h=>location.hash=h, hash); await p.waitForTimeout(360);
  const ok = await p.evaluate(()=>document.documentElement.dataset.bg === 'torii'
    && document.documentElement.dataset.glass === 'on'
    && document.querySelectorAll('.bg-layer').length === 1
    && /rgba\(/.test(getComputedStyle(document.querySelector('.card')).backgroundColor));
  t(`it holds on ${name}`, ok && errs.length === before);
}
t('the clip was not restarted by changing page', await p.evaluate(()=>document.querySelector('.bg-layer video').currentTime > .5));
await p.evaluate(()=>location.hash='#/'); await p.waitForTimeout(500);
await p.screenshot({ path: OUT+'/glass-dash.png' });

/* Motion: Off keeps the first frame, as a picture */
await openLook(p, 'custom');
await p.evaluate(()=>[...document.querySelectorAll('.lk-seg button')].find(b=>b.textContent==='Off')?.click());
await p.waitForTimeout(400);
t('Motion: Off holds the video still', (await layer()).paused === true);
await p.evaluate(()=>[...document.querySelectorAll('.lk-seg button')].find(b=>b.textContent==='Full')?.click());
await p.waitForTimeout(500);
t('and Full plays it again', (await layer()).paused === false);
await closeLook(p);

await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1200);
r = await root();
t('everything survives a reload', r.bg === 'torii' && r.kind === 'clear' && Math.abs(r.scrim - .2) < .001 && (await layer()).there, JSON.stringify(r));

// light theme with the video
await setTheme(p, 'light');
t('the dim does not change with the theme', Math.abs((await root()).scrim - .2) < .001);
t('the paper looks hold it down with light, not dark', await p.evaluate(()=>/236, 238, 242/.test(getComputedStyle(document.querySelector('.bg-scrim')).backgroundColor)));
await p.evaluate(()=>location.hash='#/'); await p.waitForTimeout(600);
await p.screenshot({ path: OUT+'/glass-light.png' });

/* ---------- a video of your own ---------- */
await p.evaluate(()=>location.hash='#/settings'); await p.waitForTimeout(400);
await openLook(p, 'custom');
await p.setInputFiles('.lk input[type=file][accept="video/*"]', FIX + '/share-clip.mp4');
await p.waitForFunction(() => (JSON.parse(window.__files.get('data/accounts.json')).bgVideos || []).length === 1, null, { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(800);
const A = await p.evaluate(()=>JSON.parse(window.__files.get('data/accounts.json')));
const mine = A.bgVideos?.[0];
t('a video of your own is kept in the vault', !!mine && /^screenshots\/bgvideo-[a-z0-9]+\.mp4$/.test(mine.file) && await p.evaluate(f => window.__files.get(f) instanceof Blob, mine.file), JSON.stringify(mine && { ...mine, thumb: !!mine.thumb }));
t('…named from its file, with a still', mine?.name === 'Share Clip' && /^data:image\/jpeg/.test(mine?.thumb || ''));
t('…and it is what plays now', A.background === 'yours:' + mine?.id && /^blob:/.test((await layer()).src));
t('a backup carries it', await p.evaluate(async f => (await import('/js/store.js')).store.shotNames().includes(f), mine?.file));
t('its tile is in the list', await p.locator(`.lk-bg[data-bgid="yours:${mine?.id}"]`).count() === 1);
await p.hover(`.lk-bg[data-bgid="yours:${mine?.id}"]`);
await p.click(`.lk-bg[data-bgid="yours:${mine?.id}"] .lk-bg-x`); await p.waitForTimeout(150);
await p.click(`.lk-bg[data-bgid="yours:${mine?.id}"] .lk-bg-x`); await p.waitForTimeout(600);
const A2 = await p.evaluate(()=>JSON.parse(window.__files.get('data/accounts.json')));
t('removing it takes it out of the list and the folder', (A2.bgVideos || []).length === 0 && await p.evaluate(f => !window.__files.has(f), mine?.file));
t('…and nothing plays in its place', !A2.background && !(await layer()).there);
await closeLook(p);

// turning the video off leaves glass alone
t('no background now', (await root()).bg === null);
t('glass still on', (await root()).glass === 'on');
t('headings back to dark on the light ground', await p.evaluate(()=>{
  const v = getComputedStyle(document.documentElement).getPropertyValue('--ink-on-light').trim();
  const [r,g,b] = [1,3,5].map(i=>parseInt(v.slice(i,i+2),16));
  return .2126*r+.7152*g+.0722*b < 60;
}));

console.log(errs.length?'\nERRORS:\n'+errs.join('\n'):'\nno errors');
t('no console or page errors', errs.length === 0);
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
