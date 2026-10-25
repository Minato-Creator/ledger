/* The first background ever chosen brings Clear glass with it. Exactly once. */
import pw from 'playwright';
import { openLook, closeLook, setGlass, pickBackground, backgroundNames } from './lookhelp.mjs';
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
const seed = (extra={}) => JSON.stringify(Object.assign({version:2,displayUnit:'$',theme:'dark',
  accounts:[{id:'acc_1',name:'A',currency:'USD',startingBalance:100000,defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],
  activeAccountId:'acc_1'}, extra));

async function open(accounts) {
  const b=await chromium.launch({executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required']});
  const p=await b.newPage({viewport:{width:1500,height:950}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(a=>{
    if (localStorage.getItem('fakefs')) return;
    localStorage.setItem('fakeroot','BG');
    localStorage.setItem('fakefs', JSON.stringify([['data/accounts.json',a],['data/trades.json',JSON.stringify({version:1,trades:[]})]]));
  }, accounts);
  await p.addInitScript(FAKE_FS);
  await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('.topbar');
  await p.evaluate(()=>location.hash='#/settings'); await p.waitForTimeout(500);
  return { b, p, errs };
}
const pick = (p, name) => pickBackground(p, name);
const state = p => p.evaluate(()=>({bg:document.documentElement.dataset.bg||null, glass:document.documentElement.dataset.glass, kind:document.documentElement.dataset.glassKind,
  toast:(document.getElementById('toast')||{}).textContent||''}));
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

// --- a fresh journal ---
{
  const { b, p, errs } = await open(seed());
  const picks = await backgroundNames(p);
  t('seven tiles: none plus six videos', picks.length === 7, picks.join(', '));
  await closeLook(p);
  t('starts with glass off', (await state(p)).glass === 'off');

  await pick(p, 'Moon');
  let s = await state(p);
  t('first pick puts the video behind', s.bg === 'moon');
  t('and turns Clear glass on with it', s.glass === 'on' && s.kind === 'clear', JSON.stringify(s));
  t('and says so', /Clear glass turned on/.test(s.toast), s.toast);
  /* Read from the module rather than pinned to a number: the videos get
     replaced, the rule does not. */
  t('a video carries its own dim, not a guess', await p.evaluate(async ()=>{
    const { BACKGROUNDS, scrimFor } = await import('/js/backgrounds.js');
    const want = scrimFor(BACKGROUNDS.find(b => b.id === 'moon'));
    const got = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bg-scrim'));
    return Math.abs(got - want) < .001 && want > 0 && want < 1;
  }));

  // now turn it off by hand and switch videos — it must stay off
  await setGlass(p, false);
  t('glass can be turned off', (await state(p)).glass === 'off');
  await pick(p, 'Rain');
  s = await state(p);
  t('a later video does not turn it back on', s.glass === 'off', s.glass);
  t('but the video did change', s.bg === 'rain');
  t('and the next video brings its own dim', await p.evaluate(async ()=>{
    const { BACKGROUNDS, scrimFor } = await import('/js/backgrounds.js');
    const want = scrimFor(BACKGROUNDS.find(b => b.id === 'rain'));
    const got = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bg-scrim'));
    return Math.abs(got - want) < .001;
  }));
  /* The whole point of the number: a brighter video is held down harder. */
  t('and a brighter video is held down harder than a darker one', await p.evaluate(async ()=>{
    const { BACKGROUNDS, scrimFor } = await import('/js/backgrounds.js');
    return scrimFor(BACKGROUNDS.find(b => b.id === 'torii')) > scrimFor(BACKGROUNDS.find(b => b.id === 'topo'));
  }));
  await pick(p, 'Torii');
  t('nor does the one after that', (await state(p)).glass === 'off');

  // and it stays decided across a reload
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
  await p.evaluate(()=>location.hash='#/settings'); await p.waitForTimeout(500);
  await pick(p, 'Moon');
  t('still decided after a reload', (await state(p)).glass === 'off');
  t('no errors', errs.length === 0, errs.join('|'));
  await b.close();
}

// --- a journal that had one of the old pictures ---
{
  const { b, p, errs } = await open(seed({ background:'ridge', glass:true, glassNudged:true }));
  const s = await state(p);
  t('an old picture opens as no background, quietly', s.bg === null && errs.length === 0, JSON.stringify(s));
  await b.close();
}

// --- someone who already turned the glass on before ever picking a picture ---
{
  const { b, p } = await open(seed({ glass:true, glassNudged:true }));
  await pick(p, 'Moon');
  const s = await state(p);
  t('glass already on stays on, and stays Frosted', s.glass === 'on' && s.kind === 'frosted');
  t('and no announcement is made', !/glass turned on/.test(s.toast), s.toast || '(none)');
  await b.close();
}

// --- someone who deliberately turned it off, then picks their first picture ---
{
  const { b, p } = await open(seed({ glass:false, glassNudged:true }));
  await pick(p, 'Rain');
  const s = await state(p);
  t('a deliberate off is respected on the first pick too', s.glass === 'off');
  await b.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
