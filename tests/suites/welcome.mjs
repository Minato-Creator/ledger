/* The welcome a newcomer sees: dark, the wordmark, and one question with two answers. */
import pw from 'playwright';
import fs from 'node:fs';
import { firstAccount } from '../first.mjs';
const HERE = new URL('.', import.meta.url).pathname;
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs','utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
let pass = 0, fail = 0; const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.welcome-title'); await p.waitForTimeout(500);

const first = await p.evaluate(() => { const bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number);
  return { theme: document.documentElement.dataset.theme, look: document.documentElement.dataset.look, lum: Math.round(.2126 * bg[0] + .7152 * bg[1] + .0722 * bg[2]),
    title: document.querySelector('.welcome-title').textContent, mark: !!document.querySelector('.wl-mark svg'), top: !!document.querySelector('.topbar'),
    kinds: [...document.querySelectorAll('.wl-kind')].map(k => k.dataset.kind + ':' + k.querySelector('b').textContent).join(' | '),
    inputs: document.querySelectorAll('.main input, .main select, .main textarea').length }; });
t('a newcomer opens on a dark page', first.theme === 'dark' && first.look === 'midnight' && first.lum < 40, JSON.stringify(first));
t('with the wordmark and the welcome, and no top bar yet', first.mark && first.title === 'Welcome to Laminar' && !first.top);
t('it asks one thing: a personal account, or a prop firm', first.kinds === 'live:Personal account | prop:Prop firm', first.kinds);
t('and nothing to fill in on the page itself', first.inputs === 0, String(first.inputs));
const page1 = await p.evaluate(() => { const w = document.querySelector('.wl'), pic = document.querySelector('.wl-pic'), f = document.querySelector('.wl-first').getBoundingClientRect(), k = document.querySelector('.wl-kinds').getBoundingClientRect(), h = document.querySelector('.wl-hint').getBoundingClientRect();
  return { pic: pic.complete && pic.naturalWidth > 1000, firstFills: Math.abs(f.height - w.clientHeight) < 2, cardsOnFirst: k.bottom < f.bottom, hintLast: h.top > k.bottom, more: w.scrollHeight > w.clientHeight * 1.8,
    intro: !!document.querySelector('.intro'), text: w.innerText }; });
t('the first screen is the picture, with the answers and the hint on it', page1.pic && page1.firstFills && page1.cardsOnFirst && page1.hintLast, JSON.stringify({ ...page1, text: undefined }));
t('nobody plays the opening animation at a first visit', !page1.intro);
const fit = await p.evaluate(() => { const r = document.querySelector('.wl').getBoundingClientRect(), g = getComputedStyle(document.querySelector('.wl')).backgroundColor;
  return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, bg: g }; });
t('the page fills the window edge to edge, on true black', fit.x === 0 && fit.y === 0 && fit.w === fit.vw && fit.h === fit.vh && fit.bg === 'rgb(0, 0, 0)', JSON.stringify(fit));
t('there is more to read by scrolling: how it works, where it is kept, the edge, the journal', page1.more
  && ['How Laminar works', 'Your journal stays on your computer', 'It finds your edge', 'A journal you will keep using', 'Nothing in your journal is uploaded', 'Sessions'].every(x => page1.text.includes(x)));
await p.click('.wl-hint'); await p.waitForTimeout(900);
t('the hint scrolls down to it', await p.evaluate(() => document.querySelector('.wl').scrollTop > 300));
await p.evaluate(() => document.querySelector('.wl').scrollTo(0, 0)); await p.waitForTimeout(200);
await p.screenshot({ path: OUT + '/welcome.png' });

await p.click('.wl-kind[data-kind="prop"]'); await p.waitForTimeout(600);
const prop = await p.evaluate(() => document.querySelector('.sheet')?.innerText || '');
t('Prop firm opens the set-up on its own path, past the first question', /prop firm account/i.test(prop) && /Futures or CFD/i.test(prop), prop.slice(0, 120));
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
t('closing it leaves the welcome as it was', await p.evaluate(() => !document.querySelector('.sheet') && document.querySelectorAll('.wl-kind').length === 2));

await p.click('.wl-kind[data-kind="live"]'); await p.waitForTimeout(600);
const live = await p.evaluate(() => document.querySelector('.sheet')?.innerText || '');
t('Personal account opens it at the broker', /live account/i.test(live) && /Choose your broker/i.test(live), live.slice(0, 120));
await p.keyboard.press('Escape'); await p.waitForTimeout(500);

await firstAccount(p, 'My own', '25 000');
const made = await p.evaluate(async () => { const { store } = await import('/js/store.js'); const a = store.activeAccount; return { name: a.name, kind: a.kind, bal: a.startingBalance, theme: document.documentElement.dataset.theme, welcome: !!document.querySelector('.welcome-title') }; });
t('going through it makes the account', made.name === 'My own' && made.kind === 'live' && made.bal === 25000, JSON.stringify(made));
t('the welcome is gone and the app stays dark', !made.welcome && made.theme === 'dark');

// a journal that already exists keeps the look it had
const q = await b.newPage({ viewport: { width: 1200, height: 800 } });
await q.addInitScript(() => { localStorage.setItem('fakeroot', 'Old'); localStorage.setItem('fakefs', JSON.stringify([['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', accounts: [{ id: 'a1', name: 'Old one', currency: 'USD', startingBalance: 1000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2025-01-01', archived: false }], activeAccountId: 'a1' })]])); });
await q.addInitScript(FAKE_FS);
await q.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await q.waitForSelector('.topbar'); await q.waitForTimeout(400);
t('a journal from before stays light', await q.evaluate(() => document.documentElement.dataset.theme) === 'light');
t('and having an account marks the app as met, so the opening plays from then on', await q.evaluate(() => localStorage.getItem('laminar:met')) === '1');
t('no errors', errs.length === 0, errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
