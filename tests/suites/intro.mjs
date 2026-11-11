/* The opening (intro.js): it plays over the journal as it loads — straight
   to the logo and LAMINAR as water (11 Nov): a ripple from the logo uncovers
   the name left to right, it sways, goes still — and snaps into the app; a
   click skips it; Short is quicker; Off, Motion Off and the test suites
   leave it out; Settings → Intro sets it. Without WebGL the name fades in. */
import pw from 'playwright';
import fs from 'node:fs';
const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const GL = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const b = await pw.chromium.launch({ executablePath: CHROME, args: GL });
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
  const o = document.querySelector('.intro');
  return { on: !!o, draws: o?.dataset.draws || null, canvases: o ? o.querySelectorAll('canvas').length : 0, other: o ? o.querySelectorAll(':not(canvas)').length : 0,
    app: document.getElementById('app').style.transform };
});
/* What is lit on the canvas right now, read in the same frame it was drawn: the brightest pixel over the logo, over the M and
   over the R, how much of the black round the name is lit, and a fingerprint of the name to tell one frame from the next. */
const lit = () => p.evaluate(() => new Promise(res => requestAnimationFrame(() => {
  const c = document.querySelector('.intro canvas'); if (!c) return res(null);
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const x = o.getContext('2d'); x.drawImage(c, 0, 0);
  const wide = Math.min(Math.max(260, innerWidth * 0.42), 620), left = (innerWidth - wide) / 2, tall = wide * 155 / 925.7, top = (innerHeight - tall) / 2;
  const max = (x0, x1) => { const d = x.getImageData(Math.round(x0), Math.round(top), Math.round(x1 - x0), Math.round(tall)).data; let m = 0; for (let i = 0; i < d.length; i += 4) m = Math.max(m, d[i + 1]); return m; };
  const word = x.getImageData(Math.round(left), Math.round(top), Math.round(wide), Math.round(tall)).data; let print = 0; for (let i = 0; i < word.length; i += 4) print += word[i + 1] * ((i / 4) % 251);
  const above = x.getImageData(0, 0, innerWidth, Math.round(top - tall)).data; let stray = 0; for (let i = 0; i < above.length; i += 4) stray = Math.max(stray, above[i + 1]);
  res({ logo: max(left, left + wide * 0.13), m: max(left + wide * 0.42, left + wide * 0.56), r: max(left + wide * 0.9, left + wide), stray, print });
})));

console.log('  -- Full --');
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
let s = await state();
t('it covers the app from the very start, as one canvas and nothing else', s.on && s.canvases === 1 && s.other === 0 && s.draws === 'water', JSON.stringify(s));
await at(0.45);
let L = await lit();
t('the ripple starts on the logo: it is lit, the far end of the name is still dark', L.logo > 150 && L.r < 10, JSON.stringify(L));
await at(1.0);
const L1 = await lit();
t('…and travels across: the M is out, the R not yet', L1.m > 150 && L1.r < 10, JSON.stringify(L1));
await p.waitForTimeout(80);
const L2 = await lit();
t('the writing is moving, like water', L1.print !== L2.print);
t('the black round it stays still: nothing lit but the writing', L1.stray < 4 && L2.stray < 4, `${L1.stray} ${L2.stray}`);
await at(2.3);
L = await lit();
t('the whole name is out', L.logo > 200 && L.m > 200 && L.r > 200, JSON.stringify(L));
t('the app has drawn underneath', await p.evaluate(() => !!document.querySelector('.topbar')));
await at(2.9);
t('…and it holds to the end of the water', (await state()).on);
await at(3.08);
s = await state();
t('the snap: the app settling from a touch smaller', /scale\(0\.9[6-9]/.test(s.app) || s.app === '', JSON.stringify(s));
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
await at(2.1);
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

console.log('  -- without WebGL --');
{
  const b2 = await pw.chromium.launch({ executablePath: CHROME, args: ['--disable-3d-apis'] });
  const p2 = await (await b2.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const e2 = []; p2.on('pageerror', e => e2.push(e.message));
  await p2.addInitScript(() => {
    localStorage.setItem('fakeroot', 'Vault');
    const A = { id: 'acc_1', name: 'Apex 50K', currency: 'USD', startingBalance: 50000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2026-06-01', archived: false };
    if (!localStorage.getItem('fakefs')) localStorage.setItem('fakefs', JSON.stringify([['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', accounts: [A], activeAccountId: 'acc_1', theme: 'dark' })]]));
    window.__intro = true;
  });
  await p2.addInitScript(FAKE_FS);
  await p2.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(1300);
  const plain = await p2.evaluate(() => { const o = document.querySelector('.intro'), c = o?.querySelector('canvas'); return { draws: o?.dataset.draws, op: c ? +getComputedStyle(c).opacity : null }; });
  t('the name fades in instead', plain.draws === 'plain' && plain.op > 0.9, JSON.stringify(plain));
  await p2.waitForTimeout(2600);
  t('…and it still snaps into the app', await p2.evaluate(() => !document.querySelector('.intro') && !!document.querySelector('.topbar')) && e2.length === 0, e2.join(' | '));
  await b2.close();
}

t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
