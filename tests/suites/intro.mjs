/* The opening (intro.js): it plays over the journal as it loads — the L, the
   name sliding out, a moment's hold, no dots (Minato, 7 Nov) — and snaps
   into the app; a
   click skips it; Short is quicker; Off, Motion Off and the test suites
   leave it out; Settings → Intro sets it. */
import pw from 'playwright';
import fs from 'node:fs';
const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Australia/Perth' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => {
  if (!localStorage.getItem('fakefs')) {
    localStorage.setItem('fakeroot', 'Vault');
    const A = { id: 'acc_1', name: 'Apex 50K', currency: 'USD', startingBalance: 50000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2026-06-01', archived: false };
    localStorage.setItem('fakefs', JSON.stringify([
      ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', accounts: [A], activeAccountId: 'acc_1', theme: 'dark' })],
      ['data/trades.json', JSON.stringify({ version: 1, trades: [] })]]));
  }
  /* this suite watches it; every other one runs without it */
  if (sessionStorage.getItem('watch') !== 'no') window.__intro = true;
  /* the intro's own clock, read from the frames it draws */
  const raf = window.requestAnimationFrame.bind(window); let first = null;
  window.requestAnimationFrame = cb => raf(ts => { if (first == null) first = ts; window.__t = (ts - first) / 1000; cb(ts); });
});
await p.addInitScript(FAKE_FS);
const at = x => p.waitForFunction(v => (window.__t || 0) >= v, x, { timeout: 15000 });
const state = () => p.evaluate(() => {
  const o = document.querySelector('.intro'), w = o?.querySelector('.intro-word'), m = o?.querySelector('.intro-mark');
  return { on: !!o, word: w ? +getComputedStyle(w).opacity : null, mark: m ? +getComputedStyle(m).opacity : null, app: document.getElementById('app').style.transform,
    dots: o ? o.querySelectorAll('canvas').length : 0 };
});

console.log('  -- Full --');
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
t('it covers the app from the very start', (await state()).on);
await at(0.8);
let s = await state();
t('the L has popped up; the name is not out yet', s.mark > 0.9 && s.word < 0.05, JSON.stringify(s));
await at(2.1);
s = await state();
t('the name has slid out, on plain black: no field of dots', s.word > 0.99 && s.dots === 0, JSON.stringify(s));
await at(2.3);
s = await state();
t('…and it holds a moment, nothing else drawn', s.on && s.word > 0.99 && s.dots === 0, JSON.stringify(s));
t('the app has drawn underneath', await p.evaluate(() => !!document.querySelector('.topbar')));
await at(2.68);
s = await state();
t('the snap: the app settling from a touch smaller', /scale\(0\.9[6-9]/.test(s.app) || s.app === '' , JSON.stringify(s));
await p.waitForTimeout(500);
s = await state();
t('…and it is gone, the app as it was', !s.on && s.app === '', JSON.stringify(s));

console.log('  -- a click skips it --');
await p.reload({ waitUntil: 'domcontentloaded' });
await at(0.7);
await p.mouse.click(700, 450);
await p.waitForTimeout(450);
t('gone within half a second of the click', !(await state()).on);

console.log('  -- Short --');
await p.evaluate(() => localStorage.setItem('laminar:intro', 'short'));
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(150);
t('it plays', (await state()).on);
await at(1.9);
await p.waitForTimeout(150);
t('…and is gone in about two seconds', !(await state()).on);

console.log('  -- Off --');
await p.evaluate(() => localStorage.setItem('laminar:intro', 'off'));
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(250);
t('set to Off, the journal opens straight away', !(await state()).on && await p.evaluate(() => !!document.querySelector('.topbar')));
await p.evaluate(() => { localStorage.removeItem('laminar:intro'); sessionStorage.setItem('watch', 'no'); });
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(250);
t('under automation (every other suite) it stays out of the way', !(await state()).on);

console.log('  -- the setting --');
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(500);
const sec = await p.evaluate(() => { const r = document.querySelector('.st-row[data-row="Intro"]'); return r ? [...r.querySelectorAll('button')].map(b2 => b2.textContent + (b2.classList.contains('is-on') ? '*' : '')).join(' ') : null; });
t('Settings → Intro: Full · Short · Off, Full to begin with', sec === 'Full* Short Off', String(sec));
t('…and it is no longer in Appearance → Custom', await p.evaluate(async () => {
  document.querySelector('.st-row[data-row="Appearance"]').click(); await new Promise(r => setTimeout(r, 600));
  document.querySelector('.lk-tabs [data-tab="custom"]').click(); await new Promise(r => setTimeout(r, 400));
  const heads = [...document.querySelectorAll('.lk-sec h3')].map(h => h.textContent);
  document.querySelector('.lk-close').click(); await new Promise(r => setTimeout(r, 500));
  return heads.length > 0 && !heads.some(h => /^(Intro|Motion|Setup colours)$/.test(h)); }));
await p.evaluate(() => [...document.querySelector('.st-row[data-row="Intro"]').querySelectorAll('button')].find(b2 => b2.textContent === 'Short').click());
await p.waitForTimeout(350);
t('…picking Short keeps it on this computer', await p.evaluate(() => localStorage.getItem('laminar:intro')) === 'short'
  && await p.evaluate(() => document.querySelector('.st-row[data-row="Intro"] button.is-on')?.textContent) === 'Short');

t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
