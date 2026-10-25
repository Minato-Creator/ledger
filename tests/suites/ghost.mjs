/* The Lab → Ghost: your own trades, replayed keeping a rule you did not.

   The engine is checked on eight trades small enough to replay by hand —
   every rule's choice of trades is written out below — and the page is
   checked for showing exactly what the engine says. */
import pw from 'playwright';
import fs from 'node:fs';
import * as G from '../../src/js/ghost.js';
import { ACCT, PB, makeTrades } from '../fixtures/ghost-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

/* ===================== the engine ===================== */
console.log('engine');
/* Mon 14 Sep:  −1  −1  +3
   Tue 15 Sep:  +2  −1  +1
   Fri 18 Sep:  −1  −1       (both tagged revenge, New York, NAS100)
   You made +1R. */
const A = { startingBalance: 100000 };
const T = (id, date, time, r, x = {}) => ({ id, date, timeOpen: time, netResult: r * 1000, riskPercent: 1, status: 'closed', mode: 'live',
  sessionId: 'lon', setupId: 'fvg', pair: 'XAUUSD', tagIds: [], ...x });
const small = [
  T('a', '2026-09-14', '15:00', -1), T('b', '2026-09-14', '16:00', -1), T('c', '2026-09-14', '17:00', 3, { setupId: 'swp' }),
  T('d', '2026-09-15', '15:00', 2), T('e', '2026-09-15', '16:00', -1), T('f', '2026-09-15', '17:00', 1),
  T('g', '2026-09-18', '15:00', -1, { tagIds: ['rev'], sessionId: 'ny', pair: 'NAS100' }),
  T('h', '2026-09-18', '16:00', -1, { tagIds: ['rev'], sessionId: 'ny', pair: 'NAS100' }),
  T('open', '2026-09-18', '17:00', 0, { status: 'open', netResult: null }),
];
const { rows } = G.rowsFrom(A, small);
const run = R => G.run(rows, { ...G.blankRules(), ...R });
const flags = R => run(R).take.map(x => (x ? 1 : 0)).join('');
const net = R => run(R).ghost.net;

t('the open trade is not replayed', rows.length === 8);
t('with no rule, the ghost is you', flags({}) === '11111111' && net({}) === 1 && run({}).luck === null);
t('stop after 2 losses: Monday\'s +3 is never taken', flags({ lossesPerDay: 2 }) === '11011111' && net({ lossesPerDay: 2 }) === -2);
t('stop after 1 loss', flags({ lossesPerDay: 1 }) === '10011010' && net({ lossesPerDay: 1 }) === -1);
t('stop at −2R: the trade that gets there is still taken', flags({ dayLossR: 2 }) === '11011111');
t('stop at +2R: Tuesday ends after the +2', flags({ dayWinR: 2 }) === '11110011' && net({ dayWinR: 2 }) === 1);
t('one trade a day: the first of each', flags({ maxTrades: 1 }) === '10010010' && net({ maxTrades: 1 }) === 0);
t('skip the trade after a loss — only the next one', flags({ afterLoss: true }) === '10111010' && net({ afterLoss: true }) === 2);
t('skip Fridays', flags({ skipDays: [4] }) === '11111100' && net({ skipDays: [4] }) === 3);
t('only London', flags({ sessions: ['lon'] }) === '11111100');
t('only one setup', flags({ setups: ['swp'] }) === '00100000' && net({ setups: ['swp'] }) === 3);
t('only one instrument', flags({ pairs: ['NAS100'] }) === '00000011');
t('skip a tag', flags({ skipTags: ['rev'] }) === '11111100');
t('only a tag', flags({ onlyTags: ['rev'] }) === '00000011');
/* Filters come first: with Fridays skipped, a Friday loss does not count
   towards anything — and Monday is still stopped by its own two losses. */
t('filters apply before the day rules', flags({ skipDays: [4], lossesPerDay: 2 }) === '11011100');
/* One loss stops Monday and Friday; +2R stops Tuesday before its loss —
   which one loss alone would have taken. */
t('rules stack', flags({ lossesPerDay: 1, dayWinR: 2 }) === '10010010' && flags({ lossesPerDay: 1 }) === '10011010', flags({ lossesPerDay: 1, dayWinR: 2 }));

const s = run({ lossesPerDay: 2 });
t('the ghost\'s drawdown is its own', s.ghost.drawdown === 2 && s.real.drawdown === 2);
t('the curve runs trade by trade, flat where a trade is skipped', s.ghost.curve.join(',') === '-1,-2,-2,0,-1,0,-1,-2', s.ghost.curve.join(','));
t('win rate leaves break-evens out, as everywhere else', near(run({ skipDays: [4] }).ghost.winRate, 3 / 6));
function near(a, b) { return a != null && Math.abs(a - b) < 1e-9; }

/* Luck: of all the ways to leave out two trades at random, how many do
   worse than leaving out the two Friday losses? None do better; the ties
   are the other pairs of −1s. */
const lk = run({ skipDays: [4] }).luck;
t('the luck test is a share between 0 and 1', lk > 0 && lk <= 1, lk);
t('and repeatable', run({ skipDays: [4] }).luck === lk);
t('a rule that leaves out only winners scores low', run({ setups: ['fvg'] }).luck < 0.2, run({ setups: ['fvg'] }).luck);
const fx = run({ skipDays: [4], lossesPerDay: 1 }).effects;
t('each rule is also measured on its own', fx.length === 2 && fx.find(f => f.key === 'skipDays').delta === 2
  && fx.find(f => f.key === 'lossesPerDay').delta === -2, JSON.stringify(fx.map(f => [f.key, f.delta])));

const season = G.rowsFrom(ACCT, makeTrades()).rows;
const sug = G.suggest(season, PB, { names: { tags: { tg_rev: 'Revenge trade' } } });
t('suggestions come ranked by what they add', sug.length > 0 && sug.every((x, i) => i === 0 || sug[i - 1].delta >= x.delta), sug.map(x => x.delta.toFixed(1)).join(' '));
t('and only rules that would have helped', sug.every(x => x.delta > 0));
t('each with its luck score', sug.every(x => x.luck >= 0 && x.luck <= 1));
t('the habits planted in the season are found', sug.some(x => /Stop after 2 losses|Revenge/.test(x.label)), sug.map(x => x.label).join(' | '));
t('a rule that would throw away most of your trades is never suggested', sug.every(x => season.length - x.skipped >= season.length * 0.2));

/* ===================== the page ===================== */
console.log('\npage');
const TR = makeTrades();
const br = await pw.chromium.launch({ executablePath: CHROME });
const p = await br.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({ ACCT, TR, PB }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })],
    ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, TR, PB });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });

const settle = (ms = 250) => p.waitForTimeout(ms);
const text = sel => p.evaluate(s => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() ?? null, sel);
const hash = () => p.evaluate(() => location.hash);
const filed = () => p.evaluate(() => JSON.parse(window.__files.get('data/lab.json') || 'null'));
const tile = label => p.evaluate(l => {
  const x = [...document.querySelectorAll('.gh-tile')].find(n => n.querySelector('.k').textContent.trim().toLowerCase() === l.toLowerCase());
  return x ? { v: x.querySelector('.v').textContent.trim(), s: x.querySelector('.s').textContent.trim(), d: x.querySelector('.d')?.textContent.trim() } : null;
}, label);
const toggle = label => p.evaluate(l => [...document.querySelectorAll('.gh-toggle')].find(b => b.textContent.includes(l)).click(), label);
const chip = (section, label) => p.evaluate(({ s, l }) => {
  const box = [...document.querySelectorAll('.gh-chips')].find(c => c.querySelector('.k').textContent.trim().toLowerCase() === s.toLowerCase());
  [...box.querySelectorAll('.gh-chip')].find(c => c.textContent.trim() === l).click();
}, { s: section, l: label });
const seen = sel => p.evaluate(s => {
  const n = document.querySelector(s); if (!n) return 'missing';
  const pe = n.style.pointerEvents; n.style.pointerEvents = 'auto';
  try {
    const r = n.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return 'no size';
    if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) return 'off screen';
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit && (hit === n || n.contains(hit)) ? 'ok' : 'covered';
  } finally { n.style.pointerEvents = pe; }
}, sel);
const rFmt = v => (Math.abs(v) < 0.05 ? '' : v < 0 ? '−' : '+') + Math.abs(v).toFixed(1) + 'R';

await p.evaluate(() => { location.hash = '#/lab'; }); await settle(500);
t('The Lab has Monte Carlo | Prop firm | Ghost | Quant | Firms tabs', await text('.head .subnav') === 'Monte Carlo Prop firm Ghost Quant Firms' && await text('.head .sn-tab.is-on') === 'Monte Carlo', await text('.lab-views'));
await p.evaluate(() => [...document.querySelectorAll('.head .sn-tab')].find(b => b.textContent === 'Ghost').click()); await settle(500);
t('Ghost is a page inside The Lab', await hash() === '#/lab/ghost' && await text('.tb-tab.is-on') === 'Lab');

/* ---------- before any rule ---------- */
const { rows: seasonRows } = G.rowsFrom(ACCT, TR);
const realNet = G.run(seasonRows, G.blankRules()).real.net;
let n = await tile('Net');
t('with no rule the ghost is you', n.v === rFmt(realNet) && n.s === `you ${rFmt(realNet)}` && n.d === 'same', JSON.stringify(n));
t('and the luck test waits for a rule', (await tile('Luck test'))?.s === 'no rule yet');
t('suggestions are listed, each with what it adds and its luck score',
  await p.evaluate(() => [...document.querySelectorAll('.gh-sug')].every(s => /[+]\d+\.\dR/.test(s.querySelector('b').textContent) && /\d+%/.test(s.querySelector('.gh-luck').textContent))
    && document.querySelectorAll('.gh-sug').length > 0));

/* ---------- a rule ---------- */
await toggle('Stop after'); await settle();
let expect = G.run(seasonRows, { ...G.blankRules(), lossesPerDay: 2 });
n = await tile('Net');
t('stop after 2 losses: the ghost\'s result is the engine\'s', n.v === rFmt(expect.ghost.net), `${n.v} vs ${rFmt(expect.ghost.net)}`);
t('with the difference from you beside it', n.d === rFmt(expect.ghost.net - realNet), `${n.d} vs ${rFmt(expect.ghost.net - realNet)}`);
t('trades taken and skipped', (await tile('Trades')).v === String(expect.ghost.trades) && (await tile('Trades')).d === `${expect.ghost.skipped} skipped`);
t('the luck test scores it', (await tile('Luck test')).v === `${Math.round(expect.luck * 100)}%`);
t('the rule is saved as it is set', (await filed())?.ghost?.lossesPerDay === 2);
await p.evaluate(() => document.querySelector('.gh-step button[aria-label="More"]').click()); await settle();
t('the stepper moves it to 3', (await filed()).ghost.lossesPerDay === 3 && /Stop after 3 losses/.test(await text('.gh-rail') || ''));
expect = G.run(seasonRows, { ...G.blankRules(), lossesPerDay: 3 });
t('and the answer follows', (await tile('Net')).v === rFmt(expect.ghost.net));

/* ---------- a filter, far down the list ---------- */
await p.evaluate(() => { document.querySelector('.gh-scroll').scrollTop = 9999; });
const scrolled = await p.evaluate(() => document.querySelector('.gh-scroll').scrollTop);
await chip('Skip tags', 'Revenge trade'); await settle();
t('ticking a tag far down leaves the list where it was', Math.abs(await p.evaluate(() => document.querySelector('.gh-scroll').scrollTop) - scrolled) < 2);
expect = G.run(seasonRows, { ...G.blankRules(), lossesPerDay: 3, skipTags: ['tg_rev'] });
t('rules stack', (await tile('Net')).v === rFmt(expect.ghost.net));
const fxRows = await p.evaluate(() => [...document.querySelectorAll('.gh-fxrow .l')].map(x => x.textContent));
t('each rule is shown on its own as well', fxRows.join(' | ') === 'Stop after 3 losses | Skip chosen tags', fxRows.join(' | '));

/* ---------- the chart ---------- */
t('your line and the ghost\'s are both drawn', await p.evaluate(() =>
  !!document.querySelector('.gh-chart path.gh-line.is-real') && !!document.querySelector('.gh-chart path.gh-line.is-ghost')));
t('with the gap between them filled both ways', await p.evaluate(() =>
  document.querySelectorAll('.gh-chart path.gh-fill').length === 2));
const hb = await p.$eval('.gh-chart .lab-hit', n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await p.mouse.move(hb.x + hb.w * 0.6, hb.y + hb.h / 2); await settle(150);
const read = await text('.gh-chart .lab-read');
t('pointing at a trade reads out both lines and the gap', /^\d\d \w{3} · trade \d+( · skipped)? [+−]?\d+\.\dR ghost [+−]?\d+\.\dR you [+−]\d+\.\dR difference$/.test(read || ''), read);
t('the readout is on screen', await seen('.gh-chart .lab-read') === 'ok');
await p.mouse.move(5, 5);

/* ---------- suggestions, clear, restart ---------- */
await p.evaluate(() => [...document.querySelectorAll('.gh-reset')][0].click()); await settle();
t('Clear takes every rule off', (await tile('Net')).d === 'same' && (await filed()).ghost.lossesPerDay === null && (await filed()).ghost.skipTags.length === 0);
const firstSug = await p.evaluate(() => document.querySelector('.gh-sug .t').textContent);
await p.evaluate(() => document.querySelector('.gh-sug').click()); await settle();
t('a suggestion applies with one click', (await tile('Net')).d !== 'same', firstSug);
const before = await tile('Net');
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('.topbar');
await p.evaluate(() => { location.hash = '#/lab/ghost'; }); await settle(500);
t('the rules survive a restart', JSON.stringify(await tile('Net')) === JSON.stringify(before));

/* ---------- which trades ---------- */
await p.evaluate(() => [...document.querySelectorAll('.lab-source button')].find(b => b.textContent === 'Forward test').click()); await settle(400);
t('with fewer than ten trades it says so', /Not enough trades yet/.test(await text('.lab-view') || ''));
await p.evaluate(() => [...document.querySelectorAll('.lab-source button')].find(b => b.textContent === 'Live').click()); await settle(400);
await p.evaluate(() => [...document.querySelectorAll('.head .sn-tab')].find(b => b.textContent === 'Monte Carlo').click()); await settle(300);
t('Monte Carlo takes you back', await hash() === '#/lab');

await p.screenshot({ path: OUT + '/ghost.png' });
t('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await br.close();
