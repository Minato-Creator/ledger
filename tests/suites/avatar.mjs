/* The square your initials sit on, and the dropdown that colours it. */
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
p.on('console',m=>{ if(m.type()==='error'&&!/TUNNEL|fonts|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(()=>{
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot','Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    /* No userColour saved — a journal from before this existed. */
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',userName:'Minato Kaze',
      accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                 color:'#18AC65',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades:[]})]]));
});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar',{timeout:8000});

const side = () => p.evaluate(()=>{
  const a = document.querySelector('.tb-you');
  const ink = a.querySelector('span');
  return { bg: getComputedStyle(a).backgroundColor, letters: ink ? ink.textContent.trim() : null,
           ink: ink ? getComputedStyle(ink).color : null };
});
const drop = () => p.evaluate(()=>{
  const d = document.querySelector('.drop');
  if (!d) return null;
  return { label: d.querySelector('.b .n').textContent.trim(),
           open: !d.querySelector('.drop-menu').hidden,
           options: [...d.querySelectorAll('.drop-opt')].map(o=>o.querySelector('.n').textContent.trim()),
           chips: [...d.querySelectorAll('.drop-opt .avatar')].map(a=>({
             bg: getComputedStyle(a).backgroundColor,
             letters: a.textContent.trim(),
             ink: getComputedStyle(a.querySelector('.m')).color })),
           ticked: [...d.querySelectorAll('.drop-opt.is-on')].map(o=>o.querySelector('.n').textContent.trim()) };
});
const open = () => p.evaluate(()=>document.querySelector('.drop > .b').click());
const pick = name => p.evaluate(n=>[...document.querySelectorAll('.drop-opt')]
  .find(o=>o.querySelector('.n').textContent.trim()===n).click(), name);

/* ---------- a journal from before this existed ---------- */
let s = await side();
t('the initials come from the name', s.letters === 'MK', s.letters);
t('and sit on the colour they always have', s.bg === 'rgb(244, 98, 74)', s.bg);

await p.evaluate(()=>{location.hash='#/settings/profile';}); await p.waitForTimeout(800);
let d = await drop();
t('Settings offers a profile colour', d !== null);
t('named, not just a swatch', d && d.label === 'Coral', JSON.stringify(d && d.label));
t('it is shut to begin with', d && !d.open);
t('the row is labelled', await p.evaluate(()=>/Profile colour/.test(document.querySelector('.main').innerText)));

/* ---------- the menu ---------- */
await open(); await p.waitForTimeout(300);
d = await drop();
t('opening it lists colours by name',
  d.open && d.options.length >= 10 && d.options.includes('Purple') && d.options.includes('Black'),
  JSON.stringify(d.options));
t('every option is the square itself, with your own initials on it',
  d.chips.length === d.options.length && d.chips.every(c=>c.letters === 'MK'),
  JSON.stringify(d.chips.map(c=>c.letters)));
t('no two options are the same colour',
  new Set(d.chips.map(c=>c.bg)).size === d.chips.length, JSON.stringify(d.chips.map(c=>c.bg)));
t('the one you are on is ticked', d.ticked.join() === 'Coral', JSON.stringify(d.ticked));

/* the ink is chosen for contrast, not picked once and reused */
const inks = await p.evaluate(()=>{
  const out = {};
  for (const o of document.querySelectorAll('.drop-opt')) {
    out[o.querySelector('.n').textContent.trim()] = getComputedStyle(o.querySelector('.avatar .m')).color;
  }
  return out;
});
t('white and yellow take dark initials',
  inks.White === 'rgb(20, 23, 22)' && inks.Yellow === 'rgb(20, 23, 22)', JSON.stringify([inks.White, inks.Yellow]));
t('and black takes light ones', inks.Black === 'rgb(255, 255, 255)', inks.Black);
t('so the initials are readable on every one of them',
  new Set(Object.values(inks)).size === 2, JSON.stringify(inks));

/* ---------- picking one ---------- */
await pick('Purple'); await p.waitForTimeout(700);
s = await side();
t('the top bar changes at once', s.bg === 'rgb(124, 92, 255)', s.bg);
t('the initials stay', s.letters === 'MK');
d = await drop();
t('and the dropdown says which one', d.label === 'Purple', d.label);
t('the menu closes on choosing', !d.open);

/* ---------- it is saved ---------- */
t('it is written to the vault', await p.evaluate(()=>
  JSON.parse(JSON.parse(localStorage.getItem('fakefs')).find(([k])=>k==='data/accounts.json')[1]).userColour) === '#7C5CFF');
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1100);
t('and survives a restart', (await side()).bg === 'rgb(124, 92, 255)', (await side()).bg);

/* ---------- closing it without choosing ---------- */
await p.evaluate(()=>{location.hash='#/settings/profile';}); await p.waitForTimeout(800);
await open(); await p.waitForTimeout(250);
t('open again', (await drop()).open);
await p.mouse.click(400, 700); await p.waitForTimeout(300);
t('clicking elsewhere shuts it', !(await drop()).open);
t('and changes nothing', (await side()).bg === 'rgb(124, 92, 255)');
await open(); await p.waitForTimeout(250);
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
t('Escape shuts it too', !(await drop()).open);
await open(); await p.waitForTimeout(250);
await pick('Purple'); await p.waitForTimeout(500);
t('and picking the one you already have just shuts it',
  !(await drop()).open && (await side()).bg === 'rgb(124, 92, 255)');

/* ---------- the initials follow the name ---------- */
await p.evaluate(()=>{
  const i = [...document.querySelectorAll('.main input')].find(x=>x.placeholder === 'Your name');
  i.value = 'Sora'; i.dispatchEvent(new Event('change',{bubbles:true}));
});
await p.waitForTimeout(800);
t('renaming changes the initials in the top bar', (await side()).letters === 'S', (await side()).letters);
await open(); await p.waitForTimeout(300);
t('and the options show the new ones', (await drop()).chips.every(c=>c.letters === 'S'),
  JSON.stringify((await drop()).chips.map(c=>c.letters)));
await p.keyboard.press('Escape'); await p.waitForTimeout(250);

/* ---------- with no name at all ---------- */
await p.evaluate(()=>{
  const i = [...document.querySelectorAll('.main input')].find(x=>x.placeholder === 'Your name');
  i.value = ''; i.dispatchEvent(new Event('change',{bubbles:true}));
});
await p.waitForTimeout(800);
t('with no name the row is just Settings, and nobody’s initials are invented',
  await p.evaluate(()=>{
    const a = document.querySelector('.tb-you');
    return !a.querySelector('span') && !!a.querySelector('svg'); }));
t('but the colour is still remembered underneath', await p.evaluate(async()=>{
  const { store } = await import('/js/store.js'); return store.userColour; }) === '#7C5CFF');

/* ---------- rubbish is refused ---------- */
const guarded = await p.evaluate(async()=>{
  const { store } = await import('/js/store.js');
  const out = [];
  for (const bad of ['red', '#GGG', 'javascript:alert(1)', '', null, '#7C5CFF']) {
    await store.setUserColour(bad);
    out.push(store.userColour);
  }
  return out;
});
t('a colour that is not a colour falls back rather than being written in',
  guarded.slice(0, 5).every(v => v === '#F4624A') && guarded[5] === '#7C5CFF', JSON.stringify(guarded));

t('no errors', errs.length===0, errs.join(' | ')||'clean');
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
