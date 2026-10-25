/* The dashboard, redrawn as four cards. Every figure on it is worked out
   again here from the trades, and the page has to agree. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB, makeTrades } from '../fixtures/ghost-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

/* The fixture runs June to mid-September; the clock is held at the end of
   September, so 30D is 31 Aug onward and All is everything. */
const ALL = makeTrades();
const key = x => x.date + (x.timeOpen || '99:99');
const inWin = ALL.filter(x => x.date >= '2026-08-31').sort((a, b) => key(a).localeCompare(key(b)));
const N = inWin.length;
const $ = (v, d = 0) => { const a = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); return (Number(a.replace(/,/g, '')) === 0 ? '' : v < 0 ? '−' : '+') + '$' + a; };
const o = x => (x.netResult > 0 ? 'win' : x.netResult < 0 ? 'loss' : 'be');
const net = inWin.reduce((a, x) => a + x.netResult, 0);
const W = inWin.filter(x => o(x) === 'win'), L = inWin.filter(x => o(x) === 'loss');
const avgW = W.reduce((a, x) => a + x.netResult, 0) / W.length, avgL = -L.reduce((a, x) => a + x.netResult, 0) / L.length;
const be = avgL / (avgW + avgL);
let eq = 0, peak = 0, worst = 0;
const cum = inWin.map(x => { eq += x.netResult; peak = Math.max(peak, eq); worst = Math.min(worst, eq - peak); return eq; });

const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(new Date('2026-09-30T10:00:00'));
await p.addInitScript(({ ACCT, ALL, PB }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: ALL })], ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, ALL, PB });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(800);
const txt = s => p.evaluate(sel => document.querySelector(sel)?.innerText.replace(/\s+/g, ' ').trim() ?? null, s);

/* ---------- the result ---------- */
console.log('the result');
t('four cards, in a grid that fills the window', await p.evaluate(() =>
  document.querySelectorAll('.db-grid > .card').length === 4 && document.querySelector('.db-grid').getBoundingClientRect().bottom <= innerHeight));
t('it says which window it is reading', /Net P&L · last 30 days/i.test(await txt('.db-hero .db-k')));
t('the big number is every trade in the window, cents and all', (await txt('.db-big')) === $(net, 2), `${await txt('.db-big')} vs ${$(net, 2)}`);
const meta = await txt('.db-meta');
t('then trades, days, the high and the deepest fall', meta.includes(`${N} trades`) && meta.includes(`${new Set(inWin.map(x => x.date)).size} days`)
  && meta.includes(`${$(Math.max(...cum))} high`) && meta.includes(`${$(worst)} max drawdown`), meta);
t('the curve draws itself in', await p.evaluate(() => [...document.querySelectorAll('.db-hero .line-draw')].every(n => n.getAttribute('pathLength') === '1')
  && document.querySelectorAll('.db-hero .line-draw').length === 2));
const hit = await p.evaluate(() => { const r = document.querySelector('.db-hero .lab-hit').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
for (const k of [0, Math.floor(N / 2), N - 1]) {
  await p.mouse.move(hit.x + ((k + 1) / N) * hit.w - 0.5, hit.y + hit.h / 2); await p.waitForTimeout(60);
  const r = await p.evaluate(() => [...document.querySelectorAll('.lab-read')].find(x => !x.hidden)?.innerText.replace(/\n/g, ' | '));
  t(`pointing at trade ${k + 1} reads its equity and its result`, r && r.includes(`trade ${k + 1}`) && r.includes($(cum[k])) && r.includes($(inWin[k].netResult)), r);
}
await p.mouse.move(5, 5);

/* ---------- the edge ---------- */
console.log('the edge');
const stats = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.db-stat')].map(n =>
  [n.querySelector('.k2').textContent, { v: n.querySelector('.v').innerText.replace(/\s+/g, ' ').trim(), note: n.querySelector('.db-note')?.innerText.trim() }])));
t('win rate', stats['Win rate']?.v === (W.length / (W.length + L.length) * 100).toFixed(1) + '%', JSON.stringify(stats['Win rate']));
t('set against the win rate needed to break even', stats['Win rate']?.note.startsWith(`${Math.abs((W.length / (W.length + L.length) - be) * 100).toFixed(1)} pts above break-even`), stats['Win rate']?.note);
t('the break-even mark sits at that rate on the bar', Math.abs(await p.evaluate(() => parseFloat(document.querySelector('.db-track .be').style.left)) - be * 100) < 0.01);
t('and the bar fills to your own', Math.abs(await p.evaluate(() => parseFloat(document.querySelector('.db-track .bar-fill').style.width)) - W.length / (W.length + L.length) * 100) < 0.01);
t('expectancy is net over trades', stats.Expectancy?.v === $(net / N), JSON.stringify(stats.Expectancy));
t('payoff is the average win over the average loss', stats.Payoff?.v.startsWith((avgW / avgL).toFixed(2)), JSON.stringify(stats.Payoff));
const pay = await p.evaluate(() => [...document.querySelectorAll('.db-pay i')].map(n => Number(n.style.flexGrow || n.style.flex.split(' ')[0])));
t('its bar splits in that same proportion', Math.abs(pay[0] / pay[1] - avgW / avgL) < 1e-3, JSON.stringify(pay));
t('profit factor', stats['Profit factor']?.v === (W.reduce((a, x) => a + x.netResult, 0) / (avgL * L.length)).toFixed(2), JSON.stringify(stats['Profit factor']));
const tape = await p.evaluate(() => [...document.querySelectorAll('.db-tape i')].map(n => n.className).join(''));
t('the strip is the last twenty, oldest first', tape === inWin.slice(-20).map(x => (o(x) === 'win' ? 'w' : 'l')).join(''), tape);
let run = 0, kind = null; for (const x of inWin) { if (o(x) === kind) run++; else { kind = o(x); run = 1; } }
t('and names the run you are on', stats[`Last 20 trades`]?.v === `${run}${kind === 'win' ? 'W' : 'L'} in a row`, JSON.stringify(stats['Last 20 trades']));

/* ---------- where it comes from ---------- */
console.log('where it comes from');
const src = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.db-col')].map(col =>
  [col.querySelector('.db-k').textContent, [...col.querySelectorAll('.db-srcrow')].map(r => ({
    name: r.querySelector('.nm').textContent, v: r.querySelector('.nv').textContent, mt: r.querySelector('.mt').textContent,
    w: parseFloat(r.querySelector('.f').style.width) }))])));
const by = (keyOf, nameOf) => { const m = new Map(); for (const x of inWin) { const k = keyOf(x); const g = m.get(k) || { name: nameOf(k), net: 0, n: 0 }; g.net += x.netResult; g.n++; m.set(k, g); } return [...m.values()].sort((a, b) => b.net - a.net); };
const want = {
  Setup: by(x => x.setupId, k => PB.setups.find(s => s.id === k).name),
  Session: by(x => x.sessionId, k => PB.sessions.find(s => s.id === k).name),
  Instrument: by(x => x.pair, k => k),
};
for (const [col, gs] of Object.entries(want)) {
  t(`${col}: every one, best first, with its net and count`, JSON.stringify(src[col]?.map(r => [r.name, r.v, r.mt.split(' ')[0]])) ===
    JSON.stringify(gs.map(g => [g.name, $(g.net), String(g.n)])), JSON.stringify(src[col]));
}
const reach = Math.max(...Object.values(want).flat().map(g => Math.abs(g.net)));
t('one scale across all three columns', Object.entries(want).every(([col, gs]) => gs.every((g, i) => Math.abs(src[col][i].w - Math.abs(g.net) / reach * 50) < 0.01)));

/* ---------- recent ---------- */
console.log('recent');
const recent = await p.evaluate(() => [...document.querySelectorAll('.db-tr')].map(r => ({ p: r.querySelector('.p').firstChild.textContent, n: r.querySelector('.n').textContent, r: r.querySelector('.r').textContent })));
const last6 = ALL.slice().sort((a, b) => (b.date + b.timeClose).localeCompare(a.date + a.timeClose)).slice(0, 6);
t('the six trades closed last, newest first', JSON.stringify(recent.map(x => [x.p, x.n])) === JSON.stringify(last6.map(x => [x.pair, $(x.netResult)])), JSON.stringify(recent));
await p.evaluate(() => document.querySelector('.db-tr').click()); await p.waitForTimeout(400);
t('and one opens its trade', await p.evaluate(() => location.hash) === '#/trade/' + last6[0].id, await p.evaluate(() => location.hash));

/* ---------- other windows and units ---------- */
console.log('windows and units');
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(500);
await p.evaluate(() => [...document.querySelectorAll('.head .seg button')].find(x => x.textContent === '7D').click()); await p.waitForTimeout(500);
t('a window with nothing in it says so rather than drawing an empty chart', /No trades in this window/.test(await txt('.db-hero')) && /Nothing in this window/.test(await txt('.db-src')));
t('a recent trade leads with its instrument — no win/loss bar before the logo', await p.evaluate(() => [...document.querySelectorAll('.db-tr')].every(r => !r.querySelector('.dot') && r.firstElementChild.classList.contains('pmark'))));
t('   while the recent trades are still there', await p.evaluate(() => document.querySelectorAll('.db-tr').length) === 6);
await p.evaluate(() => [...document.querySelectorAll('.head .seg button')].find(x => x.textContent === 'All').click()); await p.waitForTimeout(500);
t('All reads every trade', (await txt('.db-big')) === $(ALL.reduce((a, x) => a + x.netResult, 0), 2) && /all time/i.test(await txt('.db-hero .db-k')));
await p.evaluate(() => [...document.querySelectorAll('.unit-switch button')].find(b => b.textContent.trim() === 'R').click()); await p.waitForTimeout(600);
const totR = ALL.reduce((a, x) => a + x.netResult / 1000, 0);
t('in R the headline is R, with no cents split off', (await txt('.db-big')) === (totR >= 0 ? '+' : '−') + Math.abs(totR).toFixed(2) + 'R' && !(await p.evaluate(() => document.querySelector('.db-big small'))), await txt('.db-big'));
t('   and so is every source line', await p.evaluate(() => [...document.querySelectorAll('.db-srcrow .nv')].every(n => /R$/.test(n.textContent))));
await p.screenshot({ path: OUT + '/dash.png' });

/* ---------- a narrow window ---------- */
await p.setViewportSize({ width: 1280, height: 800 }); await p.waitForTimeout(500);
const clipped = await p.evaluate(() => [...document.querySelectorAll('.db-edge .db-stat')].filter(n => n.getBoundingClientRect().bottom > n.closest('.card').getBoundingClientRect().bottom + 1).length);
t('at 1280 × 800 the edge card still holds all five figures', clipped === 0, String(clipped));
t('and nothing spills sideways', await p.evaluate(() => document.querySelector('.main').scrollWidth <= document.querySelector('.main').clientWidth + 1));

t('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
