/* The Lab → Monte Carlo: your next trades, played out thousands of times,
   and how much to risk. The engine is checked on trade lists simple enough
   to know the answer of, and the page against the engine. */
import pw from 'playwright';
import fs from 'node:fs';
import * as M from '../../src/js/mc.js';
import { ACCT, PB, makeTrades } from '../fixtures/ghost-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;

/* ===================== the engine ===================== */
console.log('engine');
const lose = Array(30).fill(-1);
const L = M.simulate(lose, { horizon: 50, runs: 300 });
t('thirty losses: every run ends 50R down', L.finals.every(v => v === -50));
t('   falls 50R from its high', L.dds.every(v => v === 50));
t('   and loses 50 in a row', L.longL.every(v => v === 50) && L.longW.every(v => v === 0));
t('   there is no edge for Kelly to size', M.kelly(lose) === 0);
t('   and the risk that keeps a 10% limit at 1 in 20 is 10% over 50R: 0.2%', near(M.riskFor(L.dds, 10, 0.05), 0.2, 1e-9));
const win = Array(30).fill(2);
const Wn = M.simulate(win, { horizon: 50, runs: 300 });
t('never a loss: never a drawdown, and nothing to size against', Wn.dds.every(v => v === 0) && M.riskFor(Wn.dds, 10, .05) === null && M.kelly(win) === null);

/* Wins 60% at +1, losses 40% at −1: Kelly is 0.6 − 0.4 = 20%. */
const coin = [...Array(60).fill(1), ...Array(40).fill(-1)];
t('Kelly on a 60/40 even-money edge is 20%', near(M.kelly(coin), 20, 0.05), M.kelly(coin)?.toFixed(3));
const A = M.simulate(coin, { horizon: 100, runs: 2000 });
const B = M.simulate(coin, { horizon: 100, runs: 2000 });
t('seeded: the same trades give the same answer', A.finals.join() === B.finals.join() && A.dds.join() === B.dds.join());
t('the median lands near the edge times the trades (+20R)', near(M.pctile(A.finals, .5), 20, 4), M.pctile(A.finals, .5));
t('and the spread is wider than a coin with a known edge, because the edge itself is resampled',
  M.pctile(A.finals, .95) - M.pctile(A.finals, .05) > 2 * 1.645 * Math.sqrt(100 * 0.96));
t('drawdowns scale with risk: the chance of −10% at 1% is the chance of −5% at 0.5%',
  M.chanceOfLimit(A.dds, 1, 10) === M.chanceOfLimit(A.dds, 0.5, 5));
const grid = [0.25, 0.5, 1, 2, 4].map(r => M.chanceOfLimit(A.dds, r, 10));
t('more risk never makes the limit less likely', grid.every((p, i) => !i || p >= grid[i - 1]), grid.map(p => p.toFixed(3)).join(' '));
const sug = M.riskFor(A.dds, 10, 0.05);
t('at the suggested risk no more than 1 run in 20 reaches the limit — and a little more risk crosses it', M.chanceOfLimit(A.dds, sug, 10) <= 0.05 && M.chanceOfLimit(A.dds, sug * 1.15, 10) > 0.05,
  `${sug.toFixed(3)}% → ${M.chanceOfLimit(A.dds, sug, 10)}`);
t('shareAtLeast counts ties in', M.shareAtLeast([1, 2, 2, 3], 2) === 0.75 && M.shareAtLeast([1, 2, 2, 3], 4) === 0);
const odds = M.streakOdds(A.longL);
t('streak odds start at certainty and only fall', odds[0].k === 1 && odds[0].p === 1 && odds.every((x, i) => !i || x.p <= odds[i - 1].p));
t('the fan starts at zero and ends on the finals', A.fan[0].t === 0 && A.fan[0].p50 === 0 && A.fan[A.fan.length - 1].t === 100);

/* ===================== the page ===================== */
console.log('page');
const TR = makeTrades();
const rs = TR.map(x => x.netResult / 1000);
const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.emulateMedia({ reducedMotion: 'reduce' });   // figures read at once; the motion is checked on its own
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({ ACCT, TR, PB }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, TR, PB });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 400) => p.waitForTimeout(ms);
const text = s => p.evaluate(x => document.querySelector(x)?.innerText.replace(/\s+/g, ' ').trim() ?? null, s);
const disk = () => p.evaluate(() => JSON.parse(window.__files.get('data/lab.json') || '{}').mc);

await p.evaluate(() => { location.hash = '#/lab'; }); await settle(800);
t('The Lab opens on Monte Carlo', await text('.head .sn-tab.is-on') === 'Monte Carlo' && !!(await p.$('.mc-controls')));
t('the prop firm simulation is still there, under its own name', await text('.head .subnav') === 'Monte Carlo Prop firm Ghost Quant Firms');
t('the strip counts every live trade with an R', (await text('.lab-strip')).startsWith(`${rs.length} trades`), await text('.lab-strip'));
t('it starts at the account’s own risk, 100 trades and a 10% limit', await text('.mc-ctl:nth-child(1) .val') === '1.00%'
  && await text('.mc-ctl:nth-child(2) .is-on') === '100' && await text('.mc-ctl:nth-child(3) .val') === '10%');

/* The figures, against the engine run in the page on the same trades. */
const truth = async () => p.evaluate(async rs => {
  const M = await import('/js/mc.js');
  const { store } = await import('/js/store.js');
  const S = store.lab.mc, risk = S.risk ?? 1, H = S.horizon, lim = S.ddLimit;
  const sim = M.simulate(rs, { horizon: H, samples: 24 });
  const pc = v => `${v > 0.0005 ? '+' : v < -0.0005 ? '−' : ''}${Math.abs(v).toFixed(1)}%`;
  return { risk, H, lim, median: pc(M.pctile(sim.finals, .5) * risk), dd: pc(-M.pctile(sim.dds, .5) * risk),
    hit: M.chanceOfLimit(sim.dds, risk, lim), L50: M.pctile(sim.longL, .5), sug: Math.floor(M.riskFor(sim.dds, lim, .05) * 100 + 1e-9) / 100,
    profit: sim.finals.filter(x => x > 0).length / sim.runs };
}, rs);
const tiles = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mc-tiles .lab-tile')].map(n => [n.querySelector('.k').textContent, n.querySelector('.v').textContent])));
let T0 = await truth(), ti = await tiles();
t('Median result is the middle run, at your risk', ti['Median result'] === T0.median, `${ti['Median result']} vs ${T0.median}`);
t('Chance of profit', ti['Chance of profit'] === `${(T0.profit * 100).toFixed(0)}%`, ti['Chance of profit']);
t('Typical drawdown', ti['Typical drawdown'] === T0.dd, `${ti['Typical drawdown']} vs ${T0.dd}`);
t('the chance of reaching your limit', ti['Reach −10%'] === `${(T0.hit * 100).toFixed(T0.hit < .1 ? 1 : 0)}%`, `${ti['Reach −10%']} vs ${T0.hit}`);
t('the typical longest losing run', ti['Losing streak'] === `${T0.L50} in a row`, ti['Losing streak']);

/* The settings. */
await p.evaluate(() => document.querySelector('.mc-ctl:nth-child(1) .stepper button:last-child').click()); await settle();
t('risk steps up by a quarter', await text('.mc-ctl:nth-child(1) .val') === '1.25%' && (await disk()).risk === 1.25);
const T1 = await truth(); ti = await tiles();
t('and every figure follows', ti['Median result'] === T1.median && ti['Typical drawdown'] === T1.dd, `${ti['Median result']} ${ti['Typical drawdown']}`);
await p.evaluate(() => [...document.querySelectorAll('.mc-ctl:nth-child(2) button')].find(b => b.textContent === '250').click()); await settle(600);
t('250 trades ahead runs it again', (await disk()).horizon === 250 && /The next 250 trades/.test(await text('.mc-fan')));
await p.evaluate(() => document.querySelector('.mc-ctl:nth-child(3) .stepper button:last-child').click()); await settle();
t('the drawdown limit steps by five above ten', await text('.mc-ctl:nth-child(3) .val') === '15%' && (await disk()).ddLimit === 15);
const T2 = await truth(); ti = await tiles();
t('and the limit tile follows', ti['Reach −15%'] === `${(T2.hit * 100).toFixed(T2.hit < .1 ? 1 : 0)}%` || (T2.hit < .001 && ti['Reach −15%'] === '< 0.1%'), JSON.stringify(ti));

/* Losing streaks and risk. */
t('it says how many losses in a row take you to the limit', new RegExp(`^${Math.floor(15 / 1.25)} losses in a row take you to −15% at 1.25% a trade`).test(
  await p.evaluate(() => document.querySelector('.mc-facts .mc-fact').innerText.replace(/\n/g, ' '))), await p.evaluate(() => document.querySelector('.mc-facts .mc-fact').innerText));
const sugRow = await p.evaluate(() => { const r = document.querySelector('.mc-row.is-sug'); return r ? [...r.children].map(c => c.textContent) : null; });
t('a suggested risk is marked in the table', !!sugRow && parseFloat(sugRow[0]) === T2.sug, JSON.stringify(sugRow));
t('and at it, no more than 1 in 20 runs reach the limit', !!sugRow && parseFloat(sugRow[4]) <= 5, sugRow?.[4]);
t('the sentence says the same', new RegExp(`Risk ${T2.sug.toFixed(2)}% a trade`).test(await text('.mc-say')), await text('.mc-say'));
await p.evaluate(() => document.querySelector('.mc-row.is-sug').click()); await settle();
t('clicking a row makes it your risk', await text('.mc-ctl:nth-child(1) .val') === `${T2.sug.toFixed(2)}%` && !!(await p.$('.mc-row.is-sug.is-you')));

/* It scrolls, and the settings stay put. */
const sc = await p.evaluate(async () => {
  const b = document.querySelector('.mc-body'); b.scrollTop = b.scrollHeight;
  await new Promise(r => setTimeout(r, 200));
  const c = document.querySelector('.mc-controls').getBoundingClientRect();
  return { scrolls: b.scrollHeight > b.clientHeight + 50, moved: b.scrollTop > 100, controls: c.top >= 0 && c.bottom <= innerHeight,
    last: document.querySelector('.mc-risk').getBoundingClientRect().bottom <= innerHeight + 1 };
});
t('the page scrolls down into the detail', sc.scrolls && sc.moved && sc.last, JSON.stringify(sc));
t('with the settings still in view above it', sc.controls);

/* The fan reads out. */
await p.evaluate(() => { document.querySelector('.mc-body').scrollTop = 0; }); await settle(200);
const hit = await p.evaluate(() => { const r = document.querySelector('.mc-fan .lab-hit').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
await p.mouse.move(hit.x + hit.w * 0.5, hit.y + hit.h / 2); await settle(80);
const read = await p.evaluate(() => [...document.querySelectorAll('.lab-read')].find(x => !x.hidden)?.innerText.replace(/\n/g, ' | '));
t('pointing at the fan reads the spread at that trade', /^After \d+ trades \| .*best 1 in 20 \| .*median \| .*worst 1 in 20$/.test(read || ''), read);
await p.mouse.move(5, 5);
await p.screenshot({ path: OUT + '/mc.png' });

/* The motion: a new chart plays (cloud, scan, median, counting figures) — the first time and after a setting changes it; the same chart drawn again does not. */
await p.emulateMedia({ reducedMotion: 'no-preference' });
await p.evaluate(() => { location.hash = '#/analytics'; }); await settle(500);
await p.evaluate(() => { location.hash = '#/lab'; }); await settle(250);
const mo0 = await p.evaluate(() => ({ play: !!document.querySelector('.mc-fanwrap.mo-play'), scan: !!document.querySelector('.mc-fan .mc-scan'),
  cloud: !!document.querySelector('.mc-fan canvas.mc-cloud'), dash: document.querySelector('.mc-fan .mc-median')?.style.strokeDashoffset,
  med: document.querySelector('.mc-tiles .lab-tile .v')?.textContent, held: !!document.querySelector('.mc-hist.mo-wait'),
  tilesPlay: !!document.querySelector('.mc-tiles.mo-play') }));
t('opened fresh, the fan plays: the cloud, the scanning line and the median drawing', mo0.play && mo0.scan && mo0.cloud && mo0.dash !== '' && Number(mo0.dash) > 0, JSON.stringify(mo0));
const Tp = await truth();
t('   the figures rise in and count up', mo0.tilesPlay && mo0.med !== Tp.median, mo0.med);
t('   and the charts below wait until they are scrolled to', mo0.held);
await settle(2600);
const mo1 = await p.evaluate(() => ({ done: !!document.querySelector('.mc-fanwrap.is-done'), scan: !!document.querySelector('.mc-fan .mc-scan'),
  dash: document.querySelector('.mc-fan .mc-median')?.style.strokeDasharray, med: document.querySelector('.mc-tiles .lab-tile .v')?.textContent }));
t('then it settles: the scan gone, the median whole, the figure exact', mo1.done && !mo1.scan && mo1.dash === '' && mo1.med === Tp.median, JSON.stringify(mo1));
await p.evaluate(() => { const b = document.querySelector('.mc-body'); b.scrollTop = b.scrollHeight; }); await settle(400);
t('scrolled to, the charts below play', await p.evaluate(() => !document.querySelector('.mc-hist.mo-wait') && !!document.querySelector('.mc-hist.mo-play')));
await p.evaluate(() => { document.querySelector('.mc-body').scrollTop = 0; }); await settle(100);
await p.click('.mc-ctl:nth-child(1) .stepper button[aria-label="More"]'); await settle(150);
const mo2 = await p.evaluate(() => ({ play: !!document.querySelector('.mc-fanwrap.mo-play'), tiles: !!document.querySelector('.mc-tiles.mo-play') }));
t('a new risk is a new chart: it plays again', mo2.play && mo2.tiles, JSON.stringify(mo2));
await settle(2600);
const Tm = await truth();
t('   its figures count to the new answer', (await tiles())['Median result'] === Tm.median, `${(await tiles())["Median result"]} vs ${Tm.median}`);
await p.click('.mc-ctl:nth-child(1) .stepper button[aria-label="Less"]'); await settle(700);
/* Laminar 3.1: it plays every time the page is opened (Minato asked for it),
   but a redraw of the page you are already on, with nothing changed, does not. */
await p.evaluate(() => { location.hash = '#/analytics'; }); await settle(400);
await p.evaluate(() => { location.hash = '#/lab'; }); await settle(250);
const mo3 = await p.evaluate(() => ({ play: !!document.querySelector('.mc-fanwrap.mo-play'), tiles: !!document.querySelector('.mc-tiles.mo-play'), scan: !!document.querySelector('.mc-fan .mc-scan') }));
t('coming back to the page plays it again', mo3.play && mo3.tiles, JSON.stringify(mo3));
await settle(2600);
await p.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange'))); await settle(250);
t('   but the page being drawn again with nothing changed does not', await p.evaluate(() => !document.querySelector('.mc-fanwrap.mo-play') && !document.querySelector('.mc-tiles.mo-play')));
await p.evaluate(() => [...document.querySelectorAll('.mc-ctl .seg button')].find(b => !b.classList.contains('is-on')).click()); await settle(250);
t('another number of trades ahead is a new chart: it plays', await p.evaluate(() => !!document.querySelector('.mc-fanwrap.mo-play') && !!document.querySelector('.mc-tiles.mo-play')));
await p.click('.mc-ctl:nth-child(3) .stepper button[aria-label="More"]'); await settle(250);
t('   and so does another drawdown you would accept', await p.evaluate(() => !!document.querySelector('.mc-tiles.mo-play')));
await p.click('.mc-ctl:nth-child(3) .stepper button[aria-label="Less"]'); await settle(250);
await p.evaluate(() => [...document.querySelectorAll('.mc-ctl .seg button')].find(b => b.textContent === '100')?.click()); await settle(250);
await p.emulateMedia({ reducedMotion: 'reduce' });

/* Too few trades. */
await p.evaluate(() => [...document.querySelectorAll('.lab-source button')].find(b => b.textContent === 'Forward test').click()); await settle(500);
t('with too few trades it says so instead of guessing', /Not enough trades yet/.test(await text('.lab-view')) && !!(await p.$('.mc-controls')));
await p.evaluate(() => [...document.querySelectorAll('.lab-source button')].find(b => b.textContent === 'Live').click()); await settle(400);

/* The other page is a click away. */
await p.evaluate(() => [...document.querySelectorAll('.head .sn-tab')].find(b => b.textContent === 'Prop firm').click()); await settle(400);
t('Prop firm opens the firm simulation', await p.evaluate(() => location.hash) === '#/lab/prop' && /No firm yet/.test(await text('.lab-view')));

await p.evaluate(() => [...document.querySelectorAll('.head .sn-tab')].find(b => b.textContent === 'Quant').click()); await settle(400);
await settle(400);
t('Quant has its own page, and asks for gold prices when there are none', await p.evaluate(() => location.hash) === '#/lab/quant' && /Download XAUUSD on Replay/.test(await text('.lab-view')) && !(await p.$('.lab-source')));
t('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
