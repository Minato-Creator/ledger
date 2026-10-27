/* The morning outlook joined to the trades: each Long / Short call graded on
   its day's candle (New York 5pm to 5pm), and R on trades with the bias,
   against it, and with none — on Analytics → Outlook, in the strip on the
   Outlook page, and under each block of a day.

   Prices come from the OANDA mock; the grades are worked out here from the
   same rows by hand, on New York's rollover. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB } from '../fixtures/ghost-fixture.mjs';
import { KEY, oandaRoute, rowsOf } from '../fixtures/oanda-mock.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const tr = (id, date, pair, side, r, hh = '16:00') => ({ id, accountId: 'acc_1', date, timeOpen: hh, timeClose: '17:00', pair, side, netResult: r * 1000, riskPercent: 1,
  status: 'closed', mode: 'live', sessionId: 'ses_l', setupId: 's_fvg', tagIds: [], notes: '' });
const TR = [
  tr('a', '2026-09-08', 'XAUUSD', 'buy', 2), tr('b', '2026-09-08', 'XAUUSD', 'sell', -1, '18:00'),
  tr('c', '2026-09-09', 'XAUUSD', 'sell', 1),
  tr('d', '2026-09-10', 'NAS100', 'buy', -1), tr('e', '2026-09-10', 'AUDUSD', 'buy', 0.5),
];
const ob = (pair, bias) => ({ id: 'ob_' + pair + bias, pair, bias, notes: 'plan', shots: [] });
const OUTLOOKS = { version: 1, days: {
  '2026-09-08': { date: '2026-09-08', instruments: [ob('XAUUSD', 'long')], updatedAt: '2026-09-08T00:00:00Z' },
  '2026-09-09': { date: '2026-09-09', instruments: [ob('XAUUSD', 'short')], updatedAt: '2026-09-09T00:00:00Z' },
  '2026-09-10': { date: '2026-09-10', instruments: [ob('NAS100', 'neutral')], updatedAt: '2026-09-10T00:00:00Z' },
  '2026-09-14': { date: '2026-09-14', instruments: [ob('AUDUSD', 'long')], updatedAt: '2026-09-14T00:00:00Z' },
} };
/* by hand: the day's candle for a Perth date runs from 17:00 New York (21:00 UTC in September) the evening before */
const candle = (inst, date) => {
  const [y, m, d] = date.split('-').map(Number);
  const start = Date.UTC(y, m - 1, d - 1, 21) / 1000, rows = rowsOf(inst, start, start + 86400);
  return { open: rows[0][1], close: rows.at(-1)[4] };
};
const GR = [['XAU_USD', '2026-09-08', 'long'], ['XAU_USD', '2026-09-09', 'short'], ['AUD_USD', '2026-09-14', 'long']].map(([inst, date, bias]) => {
  const k = candle(inst, date); return { date, bias, ...k, right: bias === 'long' ? k.close > k.open : k.close < k.open };
});
const RIGHT = GR.filter(x => x.right).length;

const NOW = new Date('2026-09-20T12:00:00+08:00');
const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 }, timezoneId: 'Australia/Perth' });
await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, oandaRoute([], { mode: 'ok' }));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_|net::|401/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(NOW);
await p.addInitScript(({ ACCT, PB, KEY, TR, OUTLOOKS }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('quire:setting:oandaKey', KEY);
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: 'R', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)],
    ['data/outlooks.json', JSON.stringify(OUTLOOKS)]]));
}, { ACCT, PB, KEY, TR, OUTLOOKS });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 250) => p.waitForTimeout(ms);
const go = async (h, ms = 600) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };
const shot = async name => { try { await p.screenshot({ path: `${OUT}/outlookedge-${name}.png` }); } catch { /* fine */ } };

/* ===================== by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async () => {
  const O = await import('/js/outlookedge.js'), S = window.__store || null;
  return {
    side: [O.sideOf('long', 'buy'), O.sideOf('long', 'sell'), O.sideOf('short', 'sell'), O.sideOf('short', 'buy'), O.sideOf('neutral', 'buy'), O.sideOf(null, 'sell')],
    graded: [O.graded('long', { open: 1, close: 2, move: 1 }), O.graded('long', { open: 2, close: 1, move: -1 }), O.graded('short', { open: 2, close: 1, move: -1 }), O.graded('short', { open: 1, close: 1, move: 0 }), O.graded('long', null)],
    candle: O.dayCandle([[0, 10, 11, 9, 10.5], [60, 10.5, 12, 10, 11.5], [200, 11.5, 12, 11, 12]], 0, 120),
    span: (() => { const s = O.dayCandleSpan('2026-09-08'); return [new Date(s.start * 1000).toISOString(), s.end - s.start]; })(),
  };
});
t('a trade beside the bias: Long → bought is Same, sold is Different; Neutral or nothing written is None', JSON.stringify(H.side) === '["same","diff","same","diff","none","none"]', JSON.stringify(H.side));
t('a call against its candle: up for Long, down for Short; flat or no prices not graded', JSON.stringify(H.graded) === '[true,false,true,null,null]', JSON.stringify(H.graded));
t('the day’s candle: the first open and the last close inside it', JSON.stringify(H.candle) === '{"open":10,"close":11.5,"move":1.5}', JSON.stringify(H.candle));
t('Tue 8 Sep (Perth) trades in the candle from 17:00 New York on the 7th — 21:00 UTC, a day long', JSON.stringify(H.span) === '["2026-09-07T21:00:00.000Z",86400]', JSON.stringify(H.span));

/* ===================== Analytics → Outlook ===================== */
console.log('analytics');
await go('#/analytics', 500);
await p.click('.head .an-tabs button:has-text("Outlook")'); await settle(200);
await p.click('.head .seg button:has-text("All")'); await settle(300);
await p.waitForFunction(() => !document.querySelector('.ao-right.is-wait'), null, { timeout: 15000 }).catch(() => {});
await settle(200);
const A = await p.evaluate(() => ({
  tiles: Object.fromEntries([...document.querySelectorAll('.ao-tiles .an-tile')].map(x => [x.querySelector('.k').textContent, { v: x.querySelector('.v').textContent, s: x.querySelector('.s').textContent }])),
  rows: [...document.querySelectorAll('.ao-row[data-date]')].map(r => [...r.children].slice(0, 7).map(c => c.textContent)),
}));
t('Analytics has an Outlook tab: bias right, with your bias, against it, no bias', Object.keys(A.tiles).join() === 'Bias right,With your bias,Against your bias,No bias', Object.keys(A.tiles).join());
t(`bias right: ${RIGHT} of 3 calls, graded on the daily candles`, A.tiles['Bias right'].v === `${Math.round(RIGHT / 3 * 100)}%` && A.tiles['Bias right'].s.startsWith(`${RIGHT} of 3 calls`), JSON.stringify([A.tiles['Bias right'], GR]));
t('with your bias: +3.00R over 2 trades, both won', A.tiles['With your bias'].v === '+3.00R' && /^2 trades · 100% won · avg \+1\.50R/.test(A.tiles['With your bias'].s), JSON.stringify(A.tiles['With your bias']));
t('against it: −1.00R, one trade', A.tiles['Against your bias'].v === '−1.00R' && /^1 trade · 0% won/.test(A.tiles['Against your bias'].s), JSON.stringify(A.tiles['Against your bias']));
t('no bias: −0.50R — one Neutral, one with nothing written', A.tiles['No bias'].v === '−0.50R' && A.tiles['No bias'].s === '2 trades · 1 neutral, 1 nothing written', JSON.stringify(A.tiles['No bias']));
const want = GR.slice().reverse().map(g => ({ date: g.date, bias: g.bias === 'long' ? 'Long' : 'Short', grade: g.right ? 'Right' : 'Wrong', dir: g.close > g.open ? '▲' : '▼' }));
t('each call, newest first: the day it made, right or wrong, and what was traded on it', A.rows.length === 3 && A.rows.every((r, i) => r[2] === want[i].bias && r[4] === want[i].grade && r[3].startsWith(want[i].dir))
  && A.rows[2][5] === '2 trades · 1 with, 1 against' && A.rows[2][6] === '+1.00R' && A.rows[1][5] === '1 trade · with it' && A.rows[0][5] === 'no trades', JSON.stringify([A.rows, want]));
await shot('analytics');

/* ===================== the Outlook page ===================== */
console.log('outlook page');
await go('#/outlook/2026-09-08', 800);
await p.waitForFunction(() => document.querySelector('.ob-grade.is-right, .ob-grade.is-wrong'), null, { timeout: 15000 }).catch(() => {});
await settle(200);
const O = await p.evaluate(() => ({ strip: document.querySelector('.ao-strip')?.textContent || '', grade: document.querySelector('.ob-grade')?.className || '', gtxt: document.querySelector('.ob-grade')?.textContent || '',
  verdict: document.querySelector('.ob-verdict')?.textContent || '' }));
t('no 30-day strip at the top any more — those figures live on Analytics → Outlook', O.strip === '', O.strip);
t('under the block, the call graded on the day’s candle', GR[0].right ? /is-right/.test(O.grade) && /your Long was right/.test(O.gtxt) : /is-wrong/.test(O.grade) && /your Long was wrong/.test(O.gtxt), JSON.stringify(O));
t('…beside what was traded (one long, one short: neither all with it nor all against)', /You said long/.test(O.verdict) && !/With your bias|Against what you wrote/.test(O.verdict), O.verdict);
await shot('outlook');
await go('#/outlook/2026-09-09', 800);
await p.waitForFunction(() => document.querySelector('.ob-grade.is-right, .ob-grade.is-wrong'), null, { timeout: 15000 }).catch(() => {});
t('a day traded only the way you called it says so: With your bias', /With your bias/.test(await p.evaluate(() => document.querySelector('.ob-verdict')?.textContent || '')));
await go('#/outlook/2026-09-20', 800);
await p.fill('.ins-field', 'XAUUSD'); await p.press('.ins-field', 'Tab'); await settle(400);
await p.click('.ob-head .seg .bias-long'); await settle(300);
t('today’s call waits for its candle to close', /Graded once today/.test(await p.evaluate(() => document.querySelector('.ob-grade')?.textContent || '')), await p.evaluate(() => document.querySelector('.ob-grade')?.textContent || 'none'));

t('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
