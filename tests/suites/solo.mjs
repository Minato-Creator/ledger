/* First run has no sidebar; making the account brings it in. */
import pw from 'playwright';
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
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

await page.goto(APP, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(700);
t('no top bar on first run', await page.evaluate(() => !document.querySelector('.topbar')));
t('welcome is on screen', /Welcome to Laminar/.test(await page.evaluate(()=>document.body.innerText)));
const w = await page.evaluate(() => document.querySelector('.main').getBoundingClientRect().width);
t('form has the whole window', w > 1400, Math.round(w)+'px');
await page.screenshot({ path: OUT + '/shot-welcome-solo.png' });

await page.evaluate(() => {
  const ins = [...document.querySelectorAll('input')];
  ins[0].value = 'Apex 50k'; ins[0].dispatchEvent(new Event('input', { bubbles: true }));
  ins[1].value = '$50 000';  ins[1].dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(200);
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Create/.test(b.textContent))?.click());
await page.waitForTimeout(120);
const mid = await page.evaluate(() => { const s=document.querySelector('.topbar'); return s ? { cls: s.className, anim: getComputedStyle(s).animationName } : null; });
console.log('    mid-animation:', JSON.stringify(mid));
t('the top bar arrives, once', !!mid && /is-new/.test(mid.cls) && mid.anim === 'bar-in', JSON.stringify(mid));
await page.waitForTimeout(800);
const end = await page.evaluate(() => { const s=document.querySelector('.topbar'); return { op: getComputedStyle(s).opacity, w: s.getBoundingClientRect().width, top: s.getBoundingClientRect().top }; });
t('and settles in place across the top', end.op === '1' && Math.round(end.top) === 0 && end.w > 1400, JSON.stringify(end));

// whose journal it is: initials in the top bar once there is a name
const you = () => page.evaluate(() => { const a = document.querySelector('.tb-you'); return { text: a.innerText.trim(), title: a.title, svg: !!a.querySelector('svg') }; });
let y = await you();
t('no name, no invented initials', y.svg && !y.text && !/Minato/.test(await page.evaluate(()=>document.body.innerText)), JSON.stringify(y));
await page.evaluate(() => location.hash='#/settings/profile');
await page.waitForTimeout(400);
await page.evaluate(() => { const i=[...document.querySelectorAll('input')].find(x=>x.placeholder==='Your name'); i.value='Kenji Watanabe'; i.dispatchEvent(new Event('change',{bubbles:true})); });
await page.waitForTimeout(500);
y = await you();
t('the name shows in the top bar', /Kenji Watanabe/.test(y.title), JSON.stringify(y));
t('initials on the avatar', y.text === 'KW', y.text);
// and it survives a reload
await page.reload({ waitUntil:'domcontentloaded' });
await page.waitForTimeout(700);
t('name persists', /Kenji Watanabe/.test((await you()).title));
t('no arrival on a normal load', await page.evaluate(()=>!document.querySelector('.topbar.is-new')));
await page.screenshot({ path: OUT + '/shot-named.png' });
console.log(errors.length ? '\nERRORS:\n'+errors.join('\n') : '\nno errors');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
