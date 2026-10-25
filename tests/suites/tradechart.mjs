/* The trade on the day's chart, and the OANDA key behind it.

   OANDA is faked: every request to its two hosts is answered here with
   one-minute candles made from a seeded random walk, so the same prices come
   back every time and the requests themselves can be checked — the key in
   the header, the right host for a demo or a live key, a day asked for once
   and read from the vault after.

   The small pieces (instrument names, parsing, timeframes, the trade's
   window in time) are checked by hand first; then the Settings card; then
   the chart on the trade page — its lines, its timeframes, dragging,
   zooming, replay, and every way it can come up empty. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB } from '../fixtures/ghost-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

/* ---------- fake OANDA ---------- */
const KEY = 'demo-0123456789abcdef-0123456789abcdef';
const LIVE_KEY = 'live-fedcba9876543210';
const ORIGIN = Date.UTC(2026, 8, 7) / 1000;             // Mon 7 Sep 2026, 00:00 UTC
const MINS = 16 * 1440;
function walk(seed, base, vol) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const out = new Float64Array(MINS + 1); out[0] = base;
  for (let i = 1; i <= MINS; i++) out[i] = out[i - 1] + (rnd() - 0.5) * vol;
  return out;
}
const SERIES = { XAU_USD: [walk(7, 4080, 0.9), 2], NAS100_USD: [walk(11, 24100, 9), 1], AUD_USD: [walk(13, 0.6612, 0.00012), 5] };
const closedAt = s => { const d = new Date(s * 1000), dow = d.getUTCDay(), h = d.getUTCHours();
  return dow === 6 || (dow === 0 && h < 22) || (dow === 5 && h >= 21); };
const priceAt = (inst, s) => { const [w] = SERIES[inst]; return w[Math.max(0, Math.min(MINS, Math.round((s - ORIGIN) / 60)))]; };
function candles(inst, from, to) {
  const [w, dp] = SERIES[inst];
  const out = [];
  for (let s = Math.ceil(from / 60) * 60; s < to; s += 60) {
    if (closedAt(s)) continue;
    const i = (s - ORIGIN) / 60;
    if (i < 0 || i >= MINS) continue;
    const o = w[i], c = w[i + 1], span = Math.abs(c - o) * 0.6 + (SERIES[inst][0][0] * 0.00004);
    const r = v => v.toFixed(dp);
    out.push({ complete: true, volume: 10, time: `${s}.000000000`, mid: { o: r(o), h: r(Math.max(o, c) + span), l: r(Math.min(o, c) - span), c: r(c) } });
  }
  return out;
}
const SEEN = [];
let MODE = 'ok';
async function oanda(route) {
  const req = route.request(), u = new URL(req.url());
  const auth = req.headers()['authorization'] || '';
  SEEN.push({ host: u.host, path: u.pathname, q: Object.fromEntries(u.searchParams), auth, dt: req.headers()['accept-datetime-format'] });
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  if (MODE === 'down') return route.abort('internetdisconnected');
  const live = u.host === 'api-fxtrade.oanda.com';
  if (auth !== `Bearer ${live ? LIVE_KEY : KEY}`) return json(401, { errorMessage: 'Insufficient authorization to perform request.' });
  const m = u.pathname.match(/^\/v3\/instruments\/([A-Z0-9_]+)\/candles$/);
  if (!m || !SERIES[m[1]]) return json(400, { errorMessage: 'Invalid value specified for \'instrument\'' });
  const inst = m[1];
  if (u.searchParams.get('count')) {
    const end = Date.UTC(2026, 8, 18, 4) / 1000;
    return json(200, { instrument: inst, granularity: 'M1', candles: candles(inst, end - 5 * 60, end) });
  }
  return json(200, { instrument: inst, granularity: 'M1', candles: candles(inst, +u.searchParams.get('from'), +u.searchParams.get('to')) });
}

/* ---------- the trades, placed on the fake prices ---------- */
/* Perth is UTC+8 all year, so a Perth clock time is UTC − 8h. */
const perth = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+08:00`) / 1000;
const near5 = (inst, v) => +v.toFixed(SERIES[inst][1]);
const G_IN = near5('XAU_USD', priceAt('XAU_USD', perth('2026-09-15', '15:35')));
const N_IN = near5('NAS100_USD', priceAt('NAS100_USD', perth('2026-09-16', '21:40')));
const A_IN = near5('AUD_USD', priceAt('AUD_USD', perth('2026-09-17', '09:10')));
const base = { accountId: 'acc_1', riskPercent: 1, mode: 'live', sessionId: 'ses_l', setupId: 's_fvg', tagIds: [], notes: '' };
const TR = [
  { ...base, id: 'g1', pair: 'XAUUSD', side: 'buy', date: '2026-09-15', timeOpen: '15:35', timeClose: '18:50', status: 'closed',
    entryPrice: G_IN, stopLoss: +(G_IN - 4.5).toFixed(2), takeProfit: +(G_IN + 13.5).toFixed(2), exitPrice: +(G_IN + 13.5).toFixed(2),
    exitReason: 'tp', netResult: 3000, execTf: '5m', shots: ['screenshots/g1-a.jpg'] },
  { ...base, id: 'n1', pair: 'NAS100', side: 'sell', date: '2026-09-16', timeOpen: '21:40', timeClose: '22:55', status: 'closed', sessionId: 'ses_n',
    entryPrice: N_IN, stopLoss: +(N_IN + 25).toFixed(1), takeProfit: +(N_IN - 75).toFixed(1), exitPrice: +(N_IN - 20).toFixed(1),
    exitReason: 'manual', netResult: 800, execTf: '1m' },
  { ...base, id: 'a1', pair: 'AUDUSD', side: 'buy', date: '2026-09-17', timeOpen: '09:10', timeClose: '10:00', status: 'closed',
    entryPrice: A_IN, stopLoss: +(A_IN - 0.0012).toFixed(5), takeProfit: +(A_IN + 0.0036).toFixed(5), exitPrice: A_IN, exitReason: 'be', netResult: 0 },
  { ...base, id: 'a2', pair: 'AUD/USD', side: 'buy', date: '2026-09-17', timeOpen: '09:12', timeClose: '10:05', status: 'closed',
    entryPrice: A_IN, stopLoss: +(A_IN - 0.0012).toFixed(5), takeProfit: +(A_IN + 0.0036).toFixed(5), exitPrice: +(A_IN + 0.0001).toFixed(5), exitReason: 'be', netResult: 20 },
  { ...base, id: 'g2', pair: 'GOLD', side: 'sell', date: '2026-09-16', timeOpen: '23:30', timeClose: '00:40', status: 'closed',
    entryPrice: 4080, stopLoss: 4085, takeProfit: 4065, exitPrice: 4085, exitReason: 'sl', netResult: -1000, execTf: '4H' },
  { ...base, id: 'o1', pair: 'XAUUSD', side: 'buy', date: '2026-09-18', timeOpen: '09:00', status: 'open',
    entryPrice: 4080, stopLoss: 4075, takeProfit: 4095, netResult: 0 },
  { ...base, id: 'c1', pair: 'CORN', side: 'buy', date: '2026-09-15', timeOpen: '10:00', timeClose: '11:00', status: 'closed',
    entryPrice: 4, stopLoss: 3, takeProfit: 6, exitPrice: 6, netResult: 2000 },
];
const NEWS = { version: 1, fetchedAt: '2026-09-18T03:55:00.000Z', events: [
  { id: 'cpi', title: 'CPI m/m', country: 'USD', at: new Date(perth('2026-09-16', '20:30') * 1000).toISOString(), impact: 'High', forecast: '', previous: '' },
  { id: 'ecb', title: 'ECB Press Conference', country: 'EUR', at: new Date(perth('2026-09-16', '20:45') * 1000).toISOString(), impact: 'High', forecast: '', previous: '' },
  { id: 'nfp', title: 'Non-Farm Employment Change', country: 'USD', at: new Date(perth('2026-09-17', '20:30') * 1000).toISOString(), impact: 'High', forecast: '', previous: '' },
  { id: 'ur', title: 'Unemployment Rate', country: 'USD', at: new Date(perth('2026-09-17', '20:30') * 1000).toISOString(), impact: 'High', forecast: '', previous: '' },
  { id: 'ahe', title: 'Average Hourly Earnings m/m', country: 'USD', at: new Date(perth('2026-09-17', '20:30') * 1000).toISOString(), impact: 'High', forecast: '', previous: '' },
  { id: 'later', title: 'Retail Sales m/m', country: 'USD', at: new Date(perth('2026-09-18', '20:30') * 1000).toISOString(), impact: 'High', forecast: '', previous: '' },
  { id: 'hol', title: 'Bank Holiday', country: 'USD', at: new Date(perth('2026-09-16', '12:00') * 1000).toISOString(), impact: 'Holiday', forecast: '', previous: '' },
] };

const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Australia/Perth' });
await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, oanda);
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_|401|net::/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(new Date('2026-09-18T12:00:00+08:00'));
await p.addInitScript(({ ACCT, TR, PB, NEWS }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)],
    ['data/news.json', JSON.stringify(NEWS)]]));
}, { ACCT, TR, PB, NEWS });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 300) => p.waitForTimeout(ms);
const go = async (h, ms = 500) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };
const chartReady = async () => { await p.waitForFunction(() => { const c = document.querySelector('.tc'); return c && ((c.__chart && !c.__chart.loadingMore) || c.querySelector('.tc-msg')); }, null, { timeout: 8000 }).catch(() => {}); await settle(250); };
const ch = () => p.evaluate(() => { const c = document.querySelector('.tc')?.__chart; return c ? { view: c.view, tf: c.tf, bars: c.bars, replaying: c.replaying, upto: c.upto, tags: c.tags(), dots: c.dots(), news: c.news, days: c.days, speed: c.speed, drawing: c.drawing, auto: c.auto, y: c.yRange, follow: c.follow, picking: c.picking, full: c.full, shows: c.shows, pw: c.pw, ph: c.ph, status: c.status() } : null; });
const forget = () => p.evaluate(async () => (await import('/js/candles.js')).forgetCandles());
const msg = () => p.evaluate(() => document.querySelector('.tc .tc-msg')?.innerText || '');
const shot = async name => { try { await p.screenshot({ path: `${OUT}/tradechart-${name}.png` }); } catch { /* fine */ } };

/* ===================== by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async () => {
  const C = await import('/js/candles.js');
  const V = await import('/js/views/tradechart.js');
  const names = ['XAUUSD', 'xau/usd', 'GOLD', 'MGC', 'NAS100', 'US100', 'MNQ', 'AUDUSD', 'AUD/USD', 'eurjpy', 'GER40', 'CORN', '', 'ABCDEF'].map(C.oandaInstrument);
  const rows = C.parseCandles(JSON.stringify({ candles: [
    { time: '1757894460.000000000', mid: { o: '2', h: '3', l: '1', c: '2.5' } },
    { time: '1757894400.000000000', mid: { o: '1', h: '2', l: '0.5', c: '2' } },
    { time: '2025-09-15T00:02:00.000000000Z', bid: { o: '2.5', h: '2.6', l: '2.4', c: '2.4' } },
    { time: '1757894580', mid: { o: 'x', h: '1', l: '1', c: '1' } },
    { time: '1757894640' } ] }));
  const minute = [];
  for (let i = 0; i < 12; i++) minute.push([1757894400 + i * 60, 10 + i, 10.5 + i, 9.5 + i, 10.2 + i]);
  const five = C.aggregate(minute, 5);
  const late = C.tradeWindow({ date: '2026-09-16', timeOpen: '23:30', timeClose: '00:40', status: 'closed' }, 1e10);
  const open = C.tradeWindow({ date: '2026-09-18', timeOpen: '09:00', status: 'open' }, Date.parse('2026-09-18T04:00:00Z') / 1000);
  const noClose = C.tradeWindow({ date: '2026-09-15', timeOpen: '15:35', status: 'closed' }, 1e10);
  const wk = C.weekWindow({ date: '2026-09-15', timeOpen: '15:35', timeClose: '18:50', status: 'closed' }, 1e10);
  const wkMon = C.weekWindow({ date: '2026-09-14', timeOpen: '06:30', timeClose: '07:10', status: 'closed' }, 1e10);
  const mo = C.monthWindow({ date: '2026-09-15', timeOpen: '15:35', timeClose: '18:50', status: 'closed' }, 1e10);
  const wkOpen = C.weekWindow({ date: '2026-09-18', timeOpen: '09:00', status: 'open' }, Date.parse('2026-09-18T04:00:00Z') / 1000);
  const Z = s => Date.parse(s) / 1000;
  const roll = [C.rolloverOf(Z('2026-09-15T10:00:00Z')), C.rolloverOf(Z('2026-09-15T21:30:00Z')), C.rolloverOf(Z('2026-01-15T10:00:00Z'))].map(x => new Date(x * 1000).toISOString().slice(0, 16));
  const tday = [C.tradingDayOf(Z('2026-09-14T21:00:00Z')), C.tradingDayOf(Z('2026-09-15T20:59:00Z'))];
  const hours = [];
  for (let s = Z('2026-09-14T20:00:00Z'); s < Z('2026-09-15T01:30:00Z'); s += 60) hours.push([s, 1, 2, 0, 1]);
  const h4 = C.aggregate(hours, 240).map(r => new Date(r[0] * 1000).toISOString().slice(0, 16));
  const d1 = C.aggregate(hours, 1440).map(r => new Date(r[0] * 1000).toISOString().slice(0, 16));
  const words = [C.explain(new Error('OANDA said 401: no')), C.explain(new Error('OANDA said 404: x')), C.explain(new TypeError('Failed to fetch')), C.explain(new Error('odd'))];
  return { names, rows, five, late, open, noClose, words, mo, wk, wkMon, wkOpen, roll, tday, h4, d1,
    cur: [C.currenciesOf('XAU_USD'), C.currenciesOf('NAS100_USD'), C.currenciesOf('EUR_JPY'), C.currenciesOf('DE30_EUR')],
    dp: [C.decimalsOf('XAU_USD'), C.decimalsOf('NAS100_USD'), C.decimalsOf('AUD_USD'), C.decimalsOf('USD_JPY')],
    stamp: C.localStamp('2026-09-15', '15:35'), day: C.dayOf(1757894400),
    ticks: V.niceTicks(4081.3, 4099.2, 5), spread: V.spread([100, 104, 50, 108], 17, 10, 200), spreadEdge: V.spread([195, 199], 17, 10, 200) };
});
t('names as you log them, to OANDA’s', JSON.stringify(H.names) === JSON.stringify(['XAU_USD', 'XAU_USD', 'XAU_USD', 'XAU_USD', 'NAS100_USD', 'NAS100_USD', 'NAS100_USD', 'AUD_USD', 'AUD_USD', 'EUR_JPY', 'DE30_EUR', null, null, null]), JSON.stringify(H.names));
t('the currencies whose news counts', JSON.stringify(H.cur) === '[["USD"],["USD"],["EUR","JPY"],["EUR"]]', JSON.stringify(H.cur));
t('decimals: gold 2, index 1, FX 5, yen 3', H.dp.join() === '2,1,5,3', H.dp.join());
t('parsed, sorted, UNIX or RFC time, bid when there is no mid, junk dropped', JSON.stringify(H.rows) === JSON.stringify([[1757894400, 1, 2, 0.5, 2], [1757894460, 2, 3, 1, 2.5], [1757894520, 2.5, 2.6, 2.4, 2.4]]), JSON.stringify(H.rows));
t('5m from 1m: on the clock, first open, last close, highest high, lowest low',
  H.five.length === 3 && JSON.stringify(H.five[0]) === JSON.stringify([1757894400, 10, 14.5, 9.5, 14.2]) && JSON.stringify(H.five[2]) === JSON.stringify([1757895000, 20, 21.5, 19.5, 21.2]), JSON.stringify(H.five));
t('a local time read on this computer’s clock (Perth)', H.stamp === Date.parse('2026-09-15T07:35:00Z') / 1000, String(H.stamp));
t('closed after midnight: the exit is the next morning', H.late.exit - H.late.entry === 70 * 60, String(H.late.exit - H.late.entry));
t('…and the window is 8 hours either side, in whole UTC days', H.late.from === H.late.entry - 8 * 3600 && JSON.stringify(H.late.days) === '["2026-09-16","2026-09-17"]', JSON.stringify(H.late.days));
t('a running trade: the exit is now, and nothing after now is asked for', H.open.exit === Date.parse('2026-09-18T04:00:00Z') / 1000 && H.open.to === H.open.exit && JSON.stringify(H.open.days) === '["2026-09-17","2026-09-18"]', JSON.stringify(H.open));
t('no close time: an hour is assumed', H.noClose.exit - H.noClose.entry === 3600);
t('the whole week: Sunday’s open to Friday’s close, in UTC days', JSON.stringify(H.wk.days) === JSON.stringify(['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']), JSON.stringify(H.wk.days));
t('a Monday-morning Perth trade is still in that week (Sunday in UTC)', JSON.stringify(H.wkMon.days) === JSON.stringify(H.wk.days), JSON.stringify(H.wkMon.days));
t('a month: whole trading weeks from the week of the 1st to the week of the 30th', H.mo.days[0] === '2026-08-30' && H.mo.days.at(-1) === '2026-10-02' && H.mo.days.length === 30 && !H.mo.days.includes('2026-09-05'), JSON.stringify([H.mo.days[0], H.mo.days.at(-1), H.mo.days.length]));
t('a running trade: the week so far, up to now', H.wkOpen.to === Date.parse('2026-09-18T04:00:00Z') / 1000 && H.wkOpen.days.at(-1) === '2026-09-18' && H.wkOpen.days[0] === '2026-09-13', JSON.stringify(H.wkOpen.days));
t('the trading day rolls over at 17:00 New York — 21:00 UTC in summer, 22:00 in winter', JSON.stringify(H.roll) === JSON.stringify(['2026-09-14T21:00', '2026-09-15T21:00', '2026-01-14T22:00']), JSON.stringify(H.roll));
t('a daily candle is named for the day it trades', JSON.stringify(H.tday) === '["2026-09-15","2026-09-15"]', JSON.stringify(H.tday));
t('4H candles start at the rollover and every 4 hours after', JSON.stringify(H.h4) === JSON.stringify(['2026-09-14T17:00', '2026-09-14T21:00', '2026-09-15T01:00']), JSON.stringify(H.h4));
t('daily candles split at the rollover', JSON.stringify(H.d1) === JSON.stringify(['2026-09-13T21:00', '2026-09-14T21:00']), JSON.stringify(H.d1));
t('errors in plain words', /did not accept/.test(H.words[0]) && /no prices for this instrument/.test(H.words[1]) && /internet/.test(H.words[2]) && H.words[3] === 'odd', H.words.join(' | '));
t('round price steps', JSON.stringify(H.ticks) === '[4085,4090,4095]' || JSON.stringify(H.ticks) === '[4082.5,4085,4087.5,4090,4092.5,4095,4097.5]', JSON.stringify(H.ticks));
t('tags pushed apart, in order, inside the plot', JSON.stringify(H.spread) === '[100,117,50,134]' && JSON.stringify(H.spreadEdge) === '[183,200]', JSON.stringify([H.spread, H.spreadEdge]));

/* the desktop app asks its own shell, never fetch */
const TAU = await p.evaluate(async () => {
  const C = await import('/js/candles.js');
  const calls = [];
  window.__TAURI__ = { core: { invoke: async (cmd, args) => { calls.push([cmd, args]);
    return JSON.stringify({ candles: [{ time: '1757894400.000000000', mid: { o: '1', h: '2', l: '0.5', c: '1.5' } }] }); } } };
  try { return { ok: await C.testKey({ key: 'k1', live: true }), calls }; } finally { delete window.__TAURI__; }
});
t('in the desktop app the key goes to the shell’s fetch_oanda', TAU.ok && TAU.calls.length === 1 && TAU.calls[0][0] === 'fetch_oanda'
  && TAU.calls[0][1].token === 'k1' && TAU.calls[0][1].live === true && TAU.calls[0][1].path.startsWith('/v3/instruments/XAU_USD/candles?'), JSON.stringify(TAU.calls));

/* ===================== no key yet ===================== */
console.log('no key');
await go('#/trade/g1', 400); await chartReady();
t('the chart sits first on the left', await p.evaluate(() => document.querySelector('.td-left')?.firstElementChild?.classList.contains('tc')));
t('without a key it says where to add one', /Add your OANDA key in Settings/.test(await msg()), await msg());
t('…and nothing was asked of OANDA', SEEN.length === 0, String(SEEN.length));
t('screenshots are at the bottom of the column', await p.evaluate(() => {
  const last = document.querySelector('.td-left').lastElementChild;
  return /Screenshots/.test(last.querySelector('.eyebrow')?.textContent || '');
}));
await p.click('.tc .tc-btn'); await settle(500);
t('Open Settings goes to the Charts page in Settings', await p.evaluate(() => location.hash) === '#/settings/charts');

/* ===================== the key in Settings ===================== */
console.log('settings');
const status = () => p.evaluate(() => document.querySelector('.ok-status')?.innerText || '');
const dis = sel => p.evaluate(s => document.querySelector(s).disabled, sel);
t('a Charts card, saying there is no key', /Charts/.test(await p.evaluate(() => document.querySelector('.ok-card h2')?.textContent)) && /No key yet/.test(await status()), await status());
t('Save, Test and Remove are off with nothing typed', (await dis('.ok-save')) && (await dis('.ok-test')) && (await dis('.ok-remove')));
t('the key is hidden as you type it', await p.evaluate(() => document.querySelector('.ok-field input').type) === 'password');
await p.fill('.ok-field input', 'nonsense');
await p.click('.ok-test'); await p.waitForFunction(() => !/Asking/.test(document.querySelector('.ok-status').innerText));
t('a wrong key, tested: OANDA did not accept it', /did not accept/.test(await status()), await status());
t('…sent as a bearer token to the demo host', SEEN.at(-1)?.host === 'api-fxpractice.oanda.com' && SEEN.at(-1)?.auth === 'Bearer nonsense' && SEEN.at(-1)?.dt === 'UNIX', JSON.stringify(SEEN.at(-1)));
await p.fill('.ok-field input', KEY);
await p.click('.ok-test'); await p.waitForFunction(() => !/Asking/.test(document.querySelector('.ok-status').innerText));
t('the right key, tested: working, and not saved yet', /Working/.test(await status()) && /not saved yet/.test(await status()), await status());
t('nothing is stored by testing', await p.evaluate(() => localStorage.getItem('quire:setting:oandaKey')) === null);
await p.click('.ok-field button');
t('Show shows it', await p.evaluate(() => document.querySelector('.ok-field input').type) === 'text');
await p.click('.ok-save'); await settle(300);
t('saved: a demo key', /Saved · demo key/.test(await status()), await status());
t('kept on this computer', await p.evaluate(() => localStorage.getItem('quire:setting:oandaKey')) === KEY);
t('…and nowhere in the vault', await p.evaluate(k => [...window.__files.values()].every(v => typeof v !== 'string' || !v.includes(k)), KEY));
t('Save is off again until something changes', await dis('.ok-save'));
await go('#/dashboard', 300); await go('#/settings/charts', 500);
t('back in Settings, the key is still there', await p.evaluate(() => document.querySelector('.ok-field input').value) === KEY && /Saved · demo/.test(await status()));

/* a live key goes to the live host */
await p.click('.ok-card .ok-switch button[data-live="1"]');
await p.fill('.ok-field input', LIVE_KEY);
await p.click('.ok-test'); await p.waitForFunction(() => !/Asking/.test(document.querySelector('.ok-status').innerText));
t('a live key is tested against the live host', SEEN.at(-1)?.host === 'api-fxtrade.oanda.com' && /Working/.test(await status()), SEEN.at(-1)?.host);
await p.click('.ok-save'); await settle(300);
t('saved as live', /Saved · live key/.test(await status()) && await p.evaluate(() => localStorage.getItem('quire:setting:oandaLive')) === '1');
await p.click('.ok-remove'); await settle(300);
t('Remove takes the key away', /No key yet/.test(await status()) && await p.evaluate(() => localStorage.getItem('quire:setting:oandaKey') === null && localStorage.getItem('quire:setting:oandaLive') === null));
t('…and empties the box, back to demo', await p.evaluate(() => document.querySelector('.ok-field input').value === '' && document.querySelector('.ok-card .ok-switch .is-on')?.dataset.live === '0'));
await p.fill('.ok-field input', KEY); await p.click('.ok-save'); await settle(300);
await shot('settings');

/* ===================== the chart ===================== */
console.log('the chart');
SEEN.length = 0;
await go('#/trade/g1', 300); await chartReady();
let C = await ch();
t('a chart, on the trade’s own timeframe (5m), the whole month of it', C && C.tf === 5 && C.bars > 2400, JSON.stringify(C && { tf: C.tf, bars: C.bars }));
const NOW = Date.parse('2026-09-18T04:00:00Z') / 1000;
const days = SEEN.map(s => [new Date(+s.q.from * 1000).toISOString().slice(0, 10), Math.round((+s.q.to - +s.q.from) / 3600), s.q.granularity, s.q.price]);
const firstSix = days.slice(0, 6).map(d => d[0]).sort();
t('the trade’s week first, so the chart is up quickly', JSON.stringify(firstSix) === JSON.stringify(['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']), JSON.stringify(firstSix));
t('then the rest of the month, a UTC day at a time, Saturdays skipped, Friday only up to now', days.length === 18 && days.every(d => d[2] === 'M1' && d[3] === 'M') && days.find(d => d[0] === '2026-09-18')[1] === 4
  && days.find(d => d[0] === '2026-08-30') && !days.find(d => d[0] === '2026-09-05'), JSON.stringify(days.map(d => d[0]).sort()));
t('with the saved key', SEEN.every(s => s.auth === 'Bearer ' + KEY && s.host === 'api-fxpractice.oanda.com' && s.path === '/v3/instruments/XAU_USD/candles'));
t('nothing after now is asked for', SEEN.every(s => +s.q.to <= NOW));
const kept = await p.evaluate(() => window.__files.get('candles/XAU_USD/2026-09-15.json'));
let keptJ = null; try { keptJ = JSON.parse(kept); } catch { /* */ }
t('each finished day kept in the vault as plain JSON', keptJ && keptJ.instrument === 'XAU_USD' && keptJ.day === '2026-09-15' && keptJ.source === 'OANDA mid' && keptJ.candles.length === 1440, keptJ ? keptJ.candles.length : 'missing');
t('…one candle to a line, not squashed', kept && kept.split('\n').length > 1440, kept && kept.split('\n').length);
t('…but not today, which is not over', await p.evaluate(() => !window.__files.has('candles/XAU_USD/2026-09-18.json') && window.__files.has('candles/XAU_USD/2026-09-17.json')));
t('no level lines: the prices are tags on the right — TP, SL, Entry', JSON.stringify(C.tags) === '["TP","SL","Entry"]', JSON.stringify(C.tags));
t('a dot where you got in, and one where you got out', JSON.stringify(C.dots) === '["Entry","Exit"]', JSON.stringify(C.dots));
t('the trade sits in the middle of the view', C.view.count >= 40 && C.view.start > 0, JSON.stringify(C.view));
t('the header says which month', /Sep 2026/.test(await p.evaluate(() => document.querySelector('.tc-sub').textContent)), await p.evaluate(() => document.querySelector('.tc-sub').textContent));
const entryPx = await p.evaluate(G => {
  const c = document.querySelector('.tc-canvas'), k = window.devicePixelRatio || 1, ch = document.querySelector('.tc').__chart;
  const { x, y } = ch.xy(Date.parse('2026-09-15T07:35:00Z') / 1000, G);
  const d = c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
  return [...d];
}, TR[0].entryPrice);
t('the entry dot is drawn where you got in', entryPx[0] > 200 && entryPx[1] > 200 && entryPx[2] > 200, JSON.stringify(entryPx));
const FIT = C.view;
await shot('gold');

/* timeframes */
await p.click('.tc-seg button[data-tf="1H"]'); await settle(200);
C = await ch();
t('1H: the month in hours', C.tf === 60 && C.bars >= 215 && C.bars <= 222, String(C.bars));
t('the choice is remembered', await p.evaluate(() => localStorage.getItem('quire:chartTf')) === '60');
await p.click('.tc-seg button[data-tf="4H"]'); await settle(200);
C = await ch();
t('4H: six to a trading day', C.tf === 240 && C.bars >= 54 && C.bars <= 58, String(C.bars));
await p.click('.tc-seg button[data-tf="D"]'); await settle(200);
C = await ch();
t('Daily: one candle a trading day, Monday to Friday — two weeks of the mock’s prices', C.tf === 1440 && C.bars === 10, String(C.bars));
const dTimes = await p.evaluate(() => document.querySelector('.tc').__chart.barTimes());
t('…each starting at the 17:00 New York rollover', dTimes.every(x => new Date(x * 1000).toISOString().slice(11, 16) === '21:00'), dTimes.map(x => new Date(x * 1000).toISOString()).join());
await shot('gold-daily');
await p.click('.tc-seg button[data-tf="15m"]'); await settle(200);
C = await ch();
t('15m: four to the hour', C.tf === 15 && C.bars >= 870 && C.bars <= 880, String(C.bars));
t('switching does not ask OANDA again', SEEN.length === 18, String(SEEN.length));

/* drag, zoom, back to the trade */
await p.click('.tc-seg button[data-tf="5m"]'); await settle(200);
const fitted = FIT, pre = (await ch()).view;
const box = await p.evaluate(() => { const r = document.querySelector('.tc-canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
await p.mouse.move(box.x + 300, box.y + 150); await p.mouse.down(); await p.mouse.move(box.x + 450, box.y + 160, { steps: 5 });
const still = await p.evaluate(() => { const q = s => getComputedStyle(document.querySelector(s));
  return ['.tc', '.tc-plot'].map(s => [q(s).boxShadow, q(s).transform, q(s).opacity]); });
await p.mouse.up(); await settle(150);
t('mid-drag the card sits still: no shadow, no lift, no fade', JSON.stringify(still) === JSON.stringify([[await p.evaluate(() => getComputedStyle(document.querySelector('.tc')).boxShadow), 'none', '1'], ['none', 'none', '1']]), JSON.stringify(still));
let v = (await ch()).view;
t('dragging right moves back in time', v.start < pre.start - 3 && Math.abs(v.count - pre.count) < 1e-6, `${pre.start.toFixed(1)} → ${v.start.toFixed(1)}`);
t('…by as many candles as the pointer moved', Math.abs((pre.start - v.start) - 150 / pre.spacing) < 0.05, `${(pre.start - v.start).toFixed(2)} vs ${(150 / pre.spacing).toFixed(2)}`);
t('…the candles keep their width while moving', Math.abs(v.spacing - pre.spacing) < 1e-9);
await p.mouse.move(box.x + 200, box.y + 150); await p.mouse.wheel(0, -400); await settle(150);
const zin = (await ch()).view;
t('scrolling up zooms in — wider candles, fewer of them', zin.count < v.count * 0.8 && zin.spacing > v.spacing * 1.2, `${v.count.toFixed(1)} → ${zin.count.toFixed(1)}`);
const anchorBefore = v.start + 200 / v.spacing, anchorAfter = zin.start + 200 / zin.spacing;
t('…around the pointer', Math.abs(anchorBefore - anchorAfter) < 0.6, `${anchorBefore.toFixed(2)} vs ${anchorAfter.toFixed(2)}`);
await p.mouse.wheel(0, 3000); await settle(150);
const zo = await ch();
t('zooming out stops at TradingView’s narrowest spacing (half a pixel) or the whole month', zo.view.spacing >= 0.5 - 1e-9 && zo.view.count <= zo.bars * 1.3 + 1e-6, JSON.stringify(zo.view));
await p.mouse.dblclick(box.x + 300, box.y + 150); await settle(150);
t('double-click on empty chart does nothing (as on TradingView)', Math.abs((await ch()).view.count - zo.view.count) < 1e-6);
await p.keyboard.press('Alt+r'); await settle(150);
v = (await ch()).view;
t('Alt + R resets the chart view — back to the trade', Math.abs(v.start - fitted.start) < 1e-6 && Math.abs(v.count - fitted.count) < 1e-6, JSON.stringify([fitted, v]));
await p.mouse.move(box.x + 300, box.y + 160); await settle(150);
const read = (await ch()).status;
const under = await p.evaluate(() => { const c = document.querySelector('.tc').__chart, v = c.view; return c.barAt(Math.floor(v.start + 300 / v.spacing)); });
const fx2 = x => x.toFixed(2);
t('the status line reads the candle under the crosshair: symbol, timeframe, O H L C, change',
  read.startsWith('XAUUSD · 5m · OANDA') && read.includes(`O${fx2(under[1])}H${fx2(under[2])}L${fx2(under[3])}C${fx2(under[4])}`) && /[+−]\d+\.\d\d \([+−]\d+\.\d\d%\)$/.test(read), read + ' vs ' + JSON.stringify(under));
await shot('gold-hover');
await p.mouse.move(box.x + 300, box.y - 60); await settle(150);
const lastBar = await p.evaluate(() => { const c = document.querySelector('.tc').__chart; return c.barAt(c.bars - 1); });
t('…and the newest candle when the pointer leaves', (await ch()).status.includes(`C${fx2(lastBar[4])}`), (await ch()).status);
t('the footer only says what the chart is for', /for viewing only/.test(await p.evaluate(() => document.querySelector('.tc-read').textContent)));

/* replay */
console.log('replay');
const entryIdx = await p.evaluate(() => document.querySelector('.tc').__chart.idxAt(Date.parse('2026-09-15T07:35:00Z') / 1000));
await p.click('.tc-play'); await settle(80);
let rp = await ch();
t('Replay first asks where to start — a line follows the pointer', rp.picking && rp.upto === null && await p.evaluate(() => /Click on the chart where the replay should start/.test(document.querySelector('.tc-rbar').innerText)));
await p.mouse.move(box.x + 250, box.y + 150); await settle(80);
const dim = await p.evaluate(({ x }) => {
  const c = document.querySelector('.tc-canvas'), k = window.devicePixelRatio || 1, g = c.getContext('2d');
  /* the same pixel row, just left and well right of the line: right is dimmed */
  const px = xx => [...g.getImageData(Math.round(xx * k), Math.round(60 * k), 1, 1).data];
  return { left: px(x - 40), right: px(x + 120) };
}, { x: 250 });
t('…everything after it dimmed', dim.right[3] > dim.left[3] || dim.right.slice(0, 3).join() !== dim.left.slice(0, 3).join(), JSON.stringify(dim));
await p.keyboard.press('Escape'); await settle(60);
t('Esc cancels choosing', !(await ch()).picking && (await ch()).upto === null);
await p.click('.tc-play'); await settle(60);
const pickIdx = await p.evaluate(() => { const c = document.querySelector('.tc').__chart, v = c.view; return Math.floor(v.start + 250 / v.spacing); });
await p.mouse.click(box.x + 250, box.y + 150); await settle(120);
rp = await ch();
t('a click starts it there: that candle is the last one showing, paused', !rp.picking && rp.upto === pickIdx && !rp.replaying, `${rp.upto} vs ${pickIdx}`);
await shot('gold-picked');
await p.click('.tc-select'); await settle(60);
t('Select bar picks again', (await ch()).picking);
await p.click('.tc-entrypick'); await settle(80);
const r0a = await ch();
t('or start just before the entry', !r0a.picking && r0a.upto < entryIdx && r0a.upto > entryIdx - 60, `${r0a.upto} vs ${entryIdx}`);
await p.click('.tc-pp'); await settle(80);
const r0 = await ch();
t('play starts it', r0.replaying);
t('back, pause, forward and speed sit up top beside the timeframes — pause in the middle', await p.evaluate(() => {
  const top = document.querySelector('.tc-head .tc-rtop'); if (!top || top.hidden) return false;
  const steps = [...top.querySelector('.tc-steps').children].map(b => b.classList.contains('tc-back') ? 'back' : b.classList.contains('tc-pp') ? 'pause' : b.classList.contains('tc-fwd') ? 'fwd' : '?');
  return steps.join() === 'back,pause,fwd' && !!top.querySelector('.tc-speeds [data-speed]') && document.querySelector('.tc-head .tc-seg').nextElementSibling === top;
}));
t('…and play with follow / free view on the bottom left', await p.evaluate(() => {
  const bar = document.querySelector('.tc-rbar');
  return !bar.hidden && bar.firstElementChild.classList.contains('tc-rplay') && bar.children[1].classList.contains('tc-follow') && !!bar.querySelector('.tc-endr');
}));
await settle(700);
const r1 = await ch();
t('at 1×, about four candles a second', r1.upto - r0.upto >= 2 && r1.upto - r0.upto <= 4, `${r0.upto} → ${r1.upto}`);
t('the entry dot waits until the replay gets there', JSON.stringify(r1.dots) === '["Entry","Exit"]' && r1.upto < entryIdx);
await p.click('.tc-pp'); await settle(100);
const r2 = await ch();
await settle(600);
const r3 = await ch();
t('Pause holds it still', !r2.replaying && r3.upto === r2.upto, `${r2.upto} → ${r3.upto}`);
await p.click('.tc-fwd'); await settle(80);
await p.click('.tc-fwd'); await settle(80);
await p.click('.tc-back'); await settle(80);
t('one candle forward, and back', (await ch()).upto === r2.upto + 1);
await p.mouse.move(box.x + 300, box.y + 150);
await p.keyboard.press('ArrowRight'); await settle(60);
t('→ steps forward too', (await ch()).upto === r2.upto + 2);
await shot('gold-replay');
await p.click('.tc-speeds button[data-speed="10×"]'); await settle(50);
t('speed: 10×, remembered', (await ch()).speed === '10×' && await p.evaluate(() => localStorage.getItem('quire:replaySpeed')) === '10×');
await p.mouse.move(box.x + 300, box.y + 150); await p.keyboard.press(' '); await settle(500);
const r4 = await ch();
t('space plays — at 10× it races', r4.replaying && r4.upto - (r2.upto + 2) >= 10, `${r2.upto + 2} → ${r4.upto}`);
await p.click('.tc-endr'); await settle(120);
C = await ch();
t('End replay shows everything again', !C.replaying && C.upto === null && await p.evaluate(() => document.querySelector('.tc-rbar').hidden && !document.querySelector('.tc-play').classList.contains('is-on')));
await p.click('.tc-play'); await settle(60); await p.click('.tc-entrypick'); await settle(100);
await p.click('.tc-reset'); await settle(150);
C = await ch();
t('the reset button ends a replay and goes back to the trade', !C.replaying && C.upto === null && Math.abs(C.view.start - fitted.start) < 1e-6);
await p.click('.tc-speeds button[data-speed="1×"]').catch(() => {});
await p.evaluate(() => localStorage.setItem('quire:replaySpeed', '1×'));

/* follow price, or free view */
console.log('follow or free');
await p.click('.tc-play'); await settle(60); await p.click('.tc-entrypick'); await p.click('.tc-pp'); await settle(100);
t('Follow price is on to start with', (await ch()).follow && await p.evaluate(() => document.querySelector('.tc-follow [data-follow="1"]').classList.contains('is-on')));
await p.click('.tc-speeds button[data-speed="10×"]');
const f0 = await ch(); await settle(900); const f1 = await ch();
t('following: the chart moves along with the new candles', f1.upto > f0.upto + 15 && f1.view.start > f0.view.start + 5, `${f0.view.start.toFixed(1)} → ${f1.view.start.toFixed(1)}`);
await p.click('.tc-follow [data-follow="0"]'); await settle(50);
const f2 = await ch(); await settle(700); const f3 = await ch();
t('free view: candles keep coming, the chart stays where it is', f3.upto > f2.upto + 10 && Math.abs(f3.view.start - f2.view.start) < 1e-6 && !f3.follow, `${f2.view.start} → ${f3.view.start}`);
t('…remembered', await p.evaluate(() => localStorage.getItem('quire:replayFollow')) === '0');
await p.click('.tc-follow [data-follow="1"]'); await settle(50);
const f4 = await ch();
t('back to follow: it jumps to the newest candle', f4.follow && f4.upto <= f4.view.start + f4.view.count * 0.86 && f4.upto >= f4.view.start, JSON.stringify([f4.upto, f4.view]));
await p.mouse.move(box.x + 300, box.y + 150); await p.mouse.down(); await p.mouse.move(box.x + 420, box.y + 150, { steps: 4 }); await p.mouse.up(); await settle(80);
t('dragging the chart while following lets go of it — free view', !(await ch()).follow);
await p.click('.tc-follow [data-follow="1"]');
await p.click('.tc-speeds button[data-speed="1×"]');
await p.click('.tc-endr'); await settle(100);

/* moving it like TradingView */
console.log('price and time scales');
await p.click('.tc-reset'); await settle(120);
await p.click('.tc-seg button[data-tf="15m"]'); await settle(150);
const pw0 = (await ch()).pw, phH = box.h;
let m0 = await ch();
t('the price scale starts fixed — placed once, not re-fitted as you move', !m0.auto && !(await p.evaluate(() => document.querySelector('.tc-auto').classList.contains('is-on'))));
await p.mouse.move(box.x + 300, box.y + 150); await p.mouse.down(); await p.mouse.move(box.x + 200, box.y + 150, { steps: 4 }); await p.mouse.up(); await settle(80);
let m1 = await ch();
t('a sideways drag moves time and the prices sit still', m1.view.start > m0.view.start && Math.abs(m1.y.lo - m0.y.lo) < 1e-9 && Math.abs(m1.y.hi - m0.y.hi) < 1e-9, JSON.stringify([m0, m1].map(m => [m.view.start, m.y])));
await p.mouse.move(box.x + 300, box.y + 150); await p.mouse.down(); await p.mouse.move(box.x + 50, box.y + 150, { steps: 10 }); await p.mouse.up(); await settle(80);
const m1b = await ch();
t('…however far you go', Math.abs(m1b.y.lo - m0.y.lo) < 1e-9 && Math.abs(m1b.y.hi - m0.y.hi) < 1e-9);
const yBefore = m1.y;
await p.mouse.move(box.x + 300, box.y + 150); await p.mouse.wheel(0, -300); await settle(80);
m1 = await ch();
await p.mouse.move(box.x + pw0 + 30, box.y + 150); await p.mouse.down(); await p.mouse.move(box.x + pw0 + 30, box.y + 210, { steps: 5 }); await p.mouse.up(); await settle(80);
let m2 = await ch();
t('dragging the price scale down squeezes the prices', !m2.auto && (m2.y.hi - m2.y.lo) > (m1.y.hi - m1.y.lo) * 1.3, JSON.stringify([m1.y, m2.y]));
await p.mouse.move(box.x + pw0 + 30, box.y + 210); await p.mouse.down(); await p.mouse.move(box.x + pw0 + 30, box.y + 100, { steps: 5 }); await p.mouse.up(); await settle(80);
let m3 = await ch();
t('…and up stretches them', (m3.y.hi - m3.y.lo) < (m2.y.hi - m2.y.lo) * 0.6);
const yHeld = m3.y;
await p.mouse.move(box.x + 300, box.y + 150); await p.mouse.wheel(0, 400); await settle(80);
await p.mouse.move(box.x + 300, box.y + 150); await p.mouse.down(); await p.mouse.move(box.x + 150, box.y + 150, { steps: 4 }); await p.mouse.up(); await settle(80);
let m4 = await ch();
t('with auto off, zooming and moving through time never stretches the prices', Math.abs(m4.y.lo - yHeld.lo) < 1e-9 && Math.abs(m4.y.hi - yHeld.hi) < 1e-9, JSON.stringify([yHeld, m4.y]));
await p.mouse.move(box.x + 300, box.y + 150); await p.mouse.down(); await p.mouse.move(box.x + 300, box.y + 230, { steps: 6 }); await p.mouse.up(); await settle(80);
let m5 = await ch();
t('dragging the chart down moves the prices with it', m5.y.lo > m4.y.lo && Math.abs((m5.y.hi - m5.y.lo) - (m4.y.hi - m4.y.lo)) < 1e-9, JSON.stringify([m4.y, m5.y]));
const span0 = m5.view.count, right0 = m5.view.start + m5.view.count;
const iAt = x => p.evaluate(x => document.querySelector('.tc').__chart.core.geom().iX(x), x);
const grabbed = await iAt(300);
await p.mouse.move(box.x + 300, box.y + phH - 10); await p.mouse.down(); await p.mouse.move(box.x + 200, box.y + phH - 10, { steps: 5 }); await p.mouse.up(); await settle(80);
let m6 = await ch();
const followed = await iAt(200);
t('dragging the time scale left spreads the candles out, TradingView’s way: the time grabbed follows the pointer, the right edge stays', m6.view.count < span0 * 0.85 && Math.abs(followed - grabbed) < 0.05 && Math.abs((m6.view.start + m6.view.count) - right0) < 0.01, JSON.stringify([span0, m6.view.count, grabbed, followed]));
await p.mouse.move(box.x + 300, box.y + phH - 10); await p.mouse.down(); await p.mouse.move(box.x + 450, box.y + phH - 10, { steps: 5 }); await p.mouse.up(); await settle(80);
t('…and right squeezes them in', (await ch()).view.count > m6.view.count * 1.2);
t('the scales show which way they drag', await p.evaluate(() => getComputedStyle(document.querySelector('.tc-canvas')).cursor) !== '' );
await p.mouse.move(box.x + pw0 + 30, box.y + 150); await settle(60);
t('…up-down on the price scale', await p.evaluate(() => document.querySelector('.tc-plot').classList.contains('on-price')));
await p.mouse.move(box.x + 300, box.y + phH - 10); await settle(60);
t('…sideways on the time scale', await p.evaluate(() => document.querySelector('.tc-plot').classList.contains('on-time')));
await p.mouse.dblclick(box.x + pw0 + 30, box.y + 150); await settle(80);
t('double-click the price scale: back on auto', (await ch()).auto);
await p.click('.tc-auto'); await settle(50);
t('the auto button turns it off…', !(await ch()).auto);
await p.click('.tc-auto'); await settle(50);
t('…and on', (await ch()).auto);
await p.click('.tc-seg button[data-tf="5m"]'); await settle(100);
await p.click('.tc-reset'); await settle(100);

/* ===================== TradingView's chart ===================== */
console.log('tradingview');
const TV = await p.evaluate(async () => {
  const K = await import('/js/chart/core.js'), M = await import('/js/chart/menu.js'), S = await import('/js/chart/settings.js');
  return {
    body: [1, 2, 3, 4, 6, 10, 20, 40].map(s => K.bodyWidth(s, 1)), body2: K.bodyWidth(6, 2),
    iv: ['1', '15', '1h', '4H', 'd', '1D', '240', 'x', '0', '2 h'].map(M.parseInterval),
    perth: S.offsetOf('Australia/Perth', 1757894400), nyW: S.offsetOf('America/New_York', Date.UTC(2026, 0, 15) / 1000), nyS: S.offsetOf('America/New_York', Date.UTC(2026, 6, 15) / 1000),
    merged: S.merge(S.DEFAULTS, { precision: 3, candles: { mode: 'custom', body: { up: '#fff' } }, junk: 1, scales: { textSize: 'big' } }),
    label: S.tzLabel('Australia/Perth'),
  };
});
t('candle bodies the TradingView way: 3px between 2.5 and 4px spacing, a little under the spacing above', JSON.stringify(TV.body) === '[1,2,3,3,5,8,16,32]' && TV.body2 === 10, JSON.stringify([TV.body, TV.body2]));
t('Change interval reads 1, 15, 1h, 4H, d, 1D, 240 — and not x or 0', JSON.stringify(TV.iv) === '[1,15,60,240,1440,1440,240,null,null,120]', JSON.stringify(TV.iv));
t('timezones: Perth +8, New York −5 in winter and −4 in summer', TV.perth === 28800 && TV.nyW === -18000 && TV.nyS === -14400 && TV.label === '(UTC+8) Perth', JSON.stringify([TV.perth, TV.nyW, TV.nyS, TV.label]));
t('saved settings laid over the defaults; junk and the wrong kind ignored', TV.merged.precision === 3 && TV.merged.candles.mode === 'custom' && TV.merged.candles.body.up === '#fff'
  && TV.merged.candles.body.down === '#F23645' && !('junk' in TV.merged) && TV.merged.scales.textSize === 12 && TV.merged.canvas.grid.horz === false);

await p.click('.tc-seg button[data-tf="5m"]'); await settle(100);
await p.keyboard.press('Alt+r'); await settle(120);
/* a narrower window shows fewer candles; they keep their width */
const sp0 = (await ch()).view;
await p.evaluate(() => { document.querySelector('.tc .tc-body').style.width = '460px'; }); await settle(300);
const sp1 = (await ch()).view;
t('a narrower window shows fewer candles — each keeps its width', Math.abs(sp1.spacing - sp0.spacing) < 1e-9 && sp1.count < sp0.count - 5, JSON.stringify([sp0, sp1]));
await p.evaluate(() => { document.querySelector('.tc .tc-body').style.width = ''; }); await settle(300);
const pixel = (x, y) => p.evaluate(({ x, y }) => { const c = document.querySelector('.tc-canvas'), k = window.devicePixelRatio || 1; return [...c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data]; }, { x, y });
const near = (a, b, tol = 14) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
const count = (rgb, tol = 14) => p.evaluate(({ rgb, tol }) => {
  const c = document.querySelector('.tc-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && Math.abs(d[i] - rgb[0]) <= tol && Math.abs(d[i + 1] - rgb[1]) <= tol && Math.abs(d[i + 2] - rgb[2]) <= tol) n++;
  return n;
}, { rgb, tol });

/* the crosshair: the line down on the candle, its price and time tagged on the scales */
await p.mouse.move(box.x + 300, box.y + 150); await settle(120);
let K0 = await ch();
const LABEL = await p.evaluate(() => { const h = document.querySelector('.tc').__chart.core.palette().label.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); });
const lab = await pixel(K0.pw + 6, 150);
t('the crosshair’s price is tagged on the price scale, in Quire’s grey', near(lab, LABEL, 6) && LABEL.join() !== '54,58,69', JSON.stringify([lab, LABEL]));
const tlab = await pixel(300, K0.ph + 3);
t('…and its time on the time scale', near(tlab, LABEL, 6), JSON.stringify(tlab));
/* The app's font is a choice now (Appearance → Colours → Font); the chart follows it. */
t('the chart is in the app’s own font', await p.evaluate(() => {
  const app = getComputedStyle(document.documentElement).getPropertyValue('--mono').split(',')[0].trim();
  return getComputedStyle(document.querySelector('.tv-status')).fontFamily.includes(app.replace(/['"]/g, ''))
    && document.querySelector('.tc').__chart.core.palette().font.includes(app.replace(/['"]/g, '')); }));
t('the timeframe chosen is not boxed — only its text is brighter', await p.evaluate(() => {
  const on = getComputedStyle(document.querySelector('.tc-seg button.is-on')), off = getComputedStyle(document.querySelector('.tc-seg button:not(.is-on)'));
  return on.backgroundColor === 'rgba(0, 0, 0, 0)' && on.boxShadow === 'none' && on.color !== off.color;
}));

/* the last price: a dotted line in the candle's colour, and its tag */
t('no » button on the chart (Minato did not want it)', await p.evaluate(() => !document.querySelector('.tc .tv-latest') && !document.querySelector('.tc .tc-plot button:not(.tc-auto)')));
await p.click('.tc-auto'); await settle(60);
await p.evaluate(() => { const c = document.querySelector('.tc').__chart.core; c.toLatest(); c.draw(); }); await settle(120);
const lv = await ch();
await p.mouse.move(box.x + 300, box.y - 60); await settle(120);
const lastY = await p.evaluate(() => { const c = document.querySelector('.tc').__chart, b = c.barAt(c.bars - 1); return { y: c.xy(b[0], b[4]).y, up: b[4] >= b[1] }; });
const lastRow = await p.evaluate(({ y, pw }) => {
  const c = document.querySelector('.tc-canvas'), k = window.devicePixelRatio || 1, g = c.getContext('2d');
  const d = g.getImageData(0, Math.round((Math.round(y) + 0.5) * k - 0.5), Math.round(pw * 0.5 * k), 1).data;
  let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 120) lit++;
  return lit;
}, { y: lastY.y, pw: lv.pw });
t('the last price: no dotted line across the chart by default', lastRow < lv.pw * 0.04, String(lastRow));
const lastTag = await pixel(lv.pw + 4, Math.round(lastY.y));
t('…and its price tagged in the candle’s colour', lastY.up ? lastTag[1] > 140 && lastTag[0] < 80 : lastTag[0] > 200 && lastTag[1] < 130, JSON.stringify(lastTag));
await p.click('.tc-gear'); await settle(150);
await p.click('.tv-dtab[data-tab="scales"]'); await settle(60);
await p.click('.tv-last-line'); await settle(120);
const lastRow2 = await p.evaluate(({ y, pw }) => {
  const c = document.querySelector('.tc-canvas'), k = window.devicePixelRatio || 1, g = c.getContext('2d');
  const d = g.getImageData(0, Math.round((Math.round(y) + 0.5) * k - 0.5), Math.round(pw * 0.5 * k), 1).data;
  let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 120) lit++;
  return lit;
}, { y: lastY.y, pw: lv.pw });
t('…Settings → Scales and lines can turn one on', lastRow2 > lv.pw * 0.12, String(lastRow2));
await p.click('.tv-cancel'); await settle(120);
await p.mouse.click(box.x + 300, box.y + 150); await p.keyboard.press('Alt+r'); await settle(120);
t('back at the trade (Alt + R right after a click on the chart)', Math.abs((await ch()).view.start - FIT.start) < 1e-6);

/* Change interval */
await p.mouse.move(box.x + 300, box.y + 150);
await p.keyboard.press('1'); await settle(80);
const ivBox = () => p.evaluate(() => { const b = document.querySelector('.tc .tv-int'); return b && { v: b.querySelector('input').value, hint: b.querySelector('.tv-int-hint').textContent, focus: document.activeElement === b.querySelector('input'), bad: b.classList.contains('is-bad') }; });
let IV = await ivBox();
t('typing a number over the chart opens Change interval in the middle of it, the number typed in', IV && IV.v === '1' && IV.hint === '1 minute' && IV.focus, JSON.stringify(IV));
await p.keyboard.type('5'); IV = await ivBox();
await shot('interval');
t('…saying what it means as you type: 15 minutes', IV.v === '15' && IV.hint === '15 minutes', JSON.stringify(IV));
await p.keyboard.press('Enter'); await settle(120);
t('Enter switches to it', (await ch()).tf === 15 && !(await ivBox()) && await p.evaluate(() => document.querySelector('.tc-seg .is-on').dataset.tf) === '15m');
await p.keyboard.press('4'); await p.keyboard.type('h'); IV = await ivBox();
t('4h — 4 hours', IV.hint === '4 hours', JSON.stringify(IV));
await p.keyboard.press('Enter'); await settle(150);
t('…and Enter', (await ch()).tf === 240);
await p.keyboard.press('7'); IV = await ivBox();
t('one the chart does not have says so, with the ones it does', IV.bad && /isn’t on this chart/.test(IV.hint) && /1m · 3m · 5m · 15m · 30m · 1h · 4h · D/.test(IV.hint), IV.hint);
await p.keyboard.press('Enter'); await settle(80);
t('…Enter does nothing with it', (await ch()).tf === 240 && !!(await ivBox()));
await p.keyboard.press('Escape'); await settle(80);
t('Esc closes it, the timeframe untouched', !(await ivBox()) && (await ch()).tf === 240);
await p.keyboard.press('d'); IV = await ivBox();
t('D — 1 day', IV && IV.hint === '1 day');
await p.keyboard.press('Enter'); await settle(150);
t('…daily', (await ch()).tf === 1440);
await p.mouse.move(box.x + 300, box.y - 90); await p.mouse.click(box.x + 300, box.y - 90); await settle(60);
await p.keyboard.press('5'); await settle(60);
t('away from the chart, typing a number does nothing', !(await ivBox()));
await p.click('.tc-seg button[data-tf="5m"]'); await settle(100);

/* the right-click menu */
await p.mouse.move(box.x + 300, box.y + 150); await p.mouse.down(); await p.mouse.move(box.x + 500, box.y + 150, { steps: 4 }); await p.mouse.up(); await settle(80);
await p.mouse.click(box.x + 300, box.y + 150, { button: 'right' }); await settle(120);
const MI = await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mi')].map(b => b.querySelector('.tv-mlabel').textContent + '|' + (b.querySelector('.tv-mhint')?.textContent || '')));
t('right-click: TradingView’s menu — Reset chart view (Alt + R), Copy price, Settings…', MI[0] === 'Reset chart view|Alt + R' && /^Copy price \d+\.\d\d\|$/.test(MI[1]) && MI.at(-1) === 'Settings…|' && MI.length === 3, JSON.stringify(MI));
await shot('menu');
const menuBox = await p.evaluate(() => { const r = document.querySelector('.tv-menu').getBoundingClientRect(); return { x: r.left, y: r.top }; });
t('…opening at the pointer', Math.abs(menuBox.x - (box.x + 300)) < 2 && Math.abs(menuBox.y - (box.y + 150)) < 2, JSON.stringify(menuBox));
await p.click('.tv-menu .tv-m-reset'); await settle(120);
let rv = (await ch()).view;
t('Reset chart view: back to the trade, menu gone', Math.abs(rv.start - FIT.start) < 1e-6 && Math.abs(rv.count - FIT.count) < 1e-6 && await p.evaluate(() => !document.querySelector('.tv-menu')), JSON.stringify([FIT, rv]));
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8777' });
await p.mouse.click(box.x + 300, box.y + 150, { button: 'right' }); await settle(100);
const copyLabel = await p.evaluate(() => document.querySelector('.tv-m-copy .tv-mlabel').textContent);
await p.click('.tv-menu .tv-m-copy'); await settle(100);
const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => 'x'));
t('Copy price copies the price where you clicked', copyLabel === `Copy price ${clip}`, `${copyLabel} / ${clip}`);
await p.mouse.click(box.x + 300, box.y + 150, { button: 'right' }); await settle(100);
await p.keyboard.press('Escape'); await settle(60);
t('Esc closes the menu', await p.evaluate(() => !document.querySelector('.tv-menu')));

/* Chart Settings */
console.log('chart settings');
const settingsFile = () => p.evaluate(() => { try { return JSON.parse(window.__files.get('data/drawings.json')).settings || null; } catch { return null; } });
await p.mouse.click(box.x + 300, box.y + 150, { button: 'right' }); await settle(100);
await p.click('.tv-menu .tv-m-settings'); await settle(150);
t('Settings… opens TradingView’s Chart Settings: Symbol, Status line, Scales and lines, Canvas', await p.evaluate(() =>
  [...document.querySelectorAll('.tv-dialog .tv-dtab')].map(b => b.textContent).join() === 'Symbol,Status line,Scales and lines,Canvas'
  && /Settings/.test(document.querySelector('.tv-dhead').textContent) && !!document.querySelector('.tv-dialog .tv-ok') && !!document.querySelector('.tv-dialog .tv-cancel') && !!document.querySelector('.tv-dialog .tv-tmpl')));
await p.click('.tv-dtab[data-tab="symbol"]'); await settle(60);
t('Symbol: candles follow Quire’s profit / loss to start with', await p.evaluate(() => document.querySelector('.tv-cmode .is-on').dataset.v === 'quire' && !document.querySelector('.tv-up-body')));
/* the crosshair, Canvas tab: purple, to find it */
await p.click('.tv-dtab[data-tab="canvas"]'); await settle(60);
await p.click('.tv-cross-c'); await settle(80);
t('a colour opens TradingView’s palette: greys, ten hues and their shades, +, opacity', await p.evaluate(() => {
  const c = document.querySelector('.tv-colour'); if (!c) return false;
  return c.querySelectorAll('.tv-pal-row').length === 8 && c.querySelectorAll('.tv-pal-c').length === 80 && !!c.querySelector('.tv-pal-plus input[type=color]') && !!c.querySelector('.tv-op-range');
}));
await shot('palette');
await p.click('.tv-pal-c[data-c="#9C27B0"]'); await settle(60);
await p.click('.tv-dhead'); await settle(60);
await p.selectOption('.tv-cross-s', 'solid'); await p.selectOption('.tv-cross-w', '2'); await settle(60);
await p.click('.tv-ok'); await settle(200);
await p.mouse.move(box.x + 300, box.y + 150); await settle(120);
const purple = await count([156, 39, 176], 10);
t('the crosshair in the colour, width and style chosen', purple > 300, String(purple));
let SF = await settingsFile();
t('…kept in the vault (data/drawings.json → settings)', SF?.canvas?.cross?.color === '#9C27B0' && SF.canvas.cross.width === 2 && SF.canvas.cross.style === 'solid', JSON.stringify(SF?.canvas?.cross));

/* custom candle colours: previewed, Cancel puts them back, Ok keeps them */
await p.mouse.move(box.x + 300, box.y - 60); await settle(80);
await p.click('.tc-gear'); await settle(150);
await p.click('.tv-dtab[data-tab="symbol"]'); await settle(60);
await p.click('.tv-cmode [data-v="custom"]'); await settle(60);
t('Custom: up and down swatches for body, borders and wick', await p.evaluate(() => ['body', 'border', 'wick'].every(k => document.querySelector(`.tv-up-${k}`) && document.querySelector(`.tv-down-${k}`))));
await p.click('.tv-up-body'); await settle(60);
await p.click('.tv-pal-c[data-c="#2962FF"]'); await settle(150);
const blueLive = await count([41, 98, 255], 8);
await shot('custom');
t('…the chart shows it at once, behind the dialog', blueLive > 60, String(blueLive));
await p.click('.tv-cancel'); await settle(150);
t('Cancel puts the saved colours back', (await count([41, 98, 255], 8)) === 0 && (await settingsFile())?.candles?.mode !== 'custom' && await p.evaluate(() => !document.querySelector('.tv-dialog')));
await p.click('.tc-gear'); await settle(150);
await p.click('.tv-cmode [data-v="custom"]'); await settle(60);
await p.click('.tv-up-body'); await settle(60); await p.click('.tv-pal-c[data-c="#2962FF"]'); await settle(60);
await p.click('.tv-dhead'); await settle(60);
await p.click('.tv-ok'); await settle(200);
SF = await settingsFile();
t('Ok keeps them — candles in your own colours', SF?.candles?.mode === 'custom' && SF.candles.body.up === '#2962FF' && (await count([41, 98, 255], 8)) > 60, JSON.stringify(SF?.candles));
await p.click('.tc-gear'); await settle(150);
await p.keyboard.press('Escape'); await settle(100);
t('Esc closes it too', await p.evaluate(() => !document.querySelector('.tv-dialog')));

/* status line */
await p.click('.tc-gear'); await settle(150);
await p.click('.tv-dtab[data-tab="status"]'); await settle(60);
await p.click('.tv-st-ohlc'); await settle(80);
let stx = (await ch()).status;
t('Status line: OHLC off — symbol and change only', stx.startsWith('XAUUSD · 5m · OANDA') && !/[OHLC]\d/.test(stx) && /%\)$/.test(stx), stx);
await p.click('.tv-st-symbol'); await p.click('.tv-st-change'); await settle(80);
t('…title and change off — nothing', (await ch()).status === '', (await ch()).status);
await p.click('.tv-x'); await settle(120);
t('× closes, nothing kept', (await ch()).status.startsWith('XAUUSD'));

/* precision, timezone, text size */
const pwStart = (await ch()).pw;
await p.click('.tc-gear'); await settle(150);
await p.click('.tv-dtab[data-tab="symbol"]'); await settle(60);
await p.selectOption('.tv-prec', '3'); await settle(80);
t('Precision 1/1000: prices to three places', /C\d+\.\d{3}\b/.test((await ch()).status), (await ch()).status);
const ENTRY_T = Date.parse('2026-09-15T07:35:00Z') / 1000;
const crossAt = () => p.evaluate(T => document.querySelector('.tc').__chart.core.crossTime(T), ENTRY_T);
const perthTime = await crossAt();
const perthMarks = await p.evaluate(() => document.querySelector('.tc').__chart.core.marks());
await p.selectOption('.tv-tz', 'UTC'); await settle(120);
t('Timezone: this computer (Perth) to UTC — the crosshair’s time moves 8 hours', perthTime === 'Tue 15 Sep \'26  15:35' && (await crossAt()) === 'Tue 15 Sep \'26  07:35', `${perthTime} → ${await crossAt()}`);
t('…and so does the time scale', JSON.stringify(await p.evaluate(() => document.querySelector('.tc').__chart.core.marks())) !== JSON.stringify(perthMarks));
await p.click('.tv-dtab[data-tab="scales"]'); await settle(60);
const before16 = await ch();
await p.selectOption('.tv-text', '16'); await settle(120);
const after16 = await ch();
t('Text size 16: a wider price scale and a taller time scale', after16.pw < before16.pw - 5 && after16.ph < before16.ph, JSON.stringify([before16.pw, after16.pw, before16.ph, after16.ph]));
/* templates */
await p.click('.tv-tmpl'); await settle(60);
await p.click('.tv-t-save'); await settle(60);
await p.fill('.tv-t-name', 'Big text'); await p.click('.tv-t-ok'); await settle(150);
t('Template ▸ Save as… keeps these settings by name', await p.evaluate(() => JSON.parse(window.__files.get('data/drawings.json')).settingTemplates?.['Big text']?.scales?.textSize === 16));
await p.click('.tv-tmpl'); await settle(60);
await p.click('.tv-t-default'); await settle(120);
t('Apply default: back to the defaults', await p.evaluate(() => document.querySelector('.tv-text').value) === '12' && (await ch()).pw > after16.pw);
await p.click('.tv-tmpl'); await settle(60);
t('…the saved one is listed', await p.evaluate(() => [...document.querySelectorAll('.tv-t-item')].map(x => x.dataset.name).join()) === 'Big text');
await p.click('.tv-t-item[data-name="Big text"]'); await settle(120);
t('applying it brings its settings back', await p.evaluate(() => document.querySelector('.tv-text').value) === '16');
await p.click('.tv-tmpl'); await settle(60);
await p.hover('.tv-t-item[data-name="Big text"]'); await p.click('.tv-t-item[data-name="Big text"] .tv-t-del'); await settle(120);
t('× on a template removes it', await p.evaluate(() => !Object.keys(JSON.parse(window.__files.get('data/drawings.json')).settingTemplates || {}).length));
await p.click('.tv-dhead'); await settle(60);
await p.click('.tv-cancel'); await settle(150);
t('Cancel after all that: precision, timezone and text as they were', (await ch()).pw === pwStart && (await crossAt()) === perthTime);

/* margins with auto on, grid lines, background */
await p.click('.tc-auto'); await settle(80);
await p.click('.tc-gear'); await settle(150);
await p.click('.tv-dtab[data-tab="canvas"]'); await settle(60);
await p.fill('.tv-m-top', '20'); await p.press('.tv-m-top', 'Tab');
await p.fill('.tv-m-bottom', '20'); await p.press('.tv-m-bottom', 'Tab'); await settle(120);
const mg = await p.evaluate(() => {
  const c = document.querySelector('.tc').__chart, v = c.view, y = c.yRange;
  let hi = -Infinity, lo = Infinity;
  for (let i = Math.max(0, Math.floor(v.start)); i <= Math.min(c.bars - 1, Math.ceil(v.start + v.count)); i++) { const b = c.barAt(i); hi = Math.max(hi, b[2]); lo = Math.min(lo, b[3]); }
  return { top: (y.hi - hi) / (y.hi - y.lo), bottom: (lo - y.lo) / (y.hi - y.lo) };
});
await shot('canvas-tab');
t('Margins: with auto on, 20% empty above the highest candle and below the lowest', Math.abs(mg.top - 0.2) < 0.01 && Math.abs(mg.bottom - 0.2) < 0.01, JSON.stringify(mg));
const lit = () => p.evaluate(() => { const c = document.querySelector('.tc-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
const noGrid = await lit();
await p.click('.tv-grid-v'); await p.click('.tv-grid-h'); await settle(120);
t('Grid lines, up and across', (await lit()) > noGrid + 1000, `${noGrid} → ${await lit()}`);
await p.click('.tv-bg [data-v="solid"]'); await settle(120);
const W0 = await p.evaluate(() => document.querySelector('.tc-canvas').clientWidth), H0 = await p.evaluate(() => document.querySelector('.tc-canvas').clientHeight);
t('Background: a solid colour of your own', near(await pixel(W0 - 3, H0 - 3), [17, 19, 18], 3), JSON.stringify(await pixel(W0 - 3, H0 - 3)));
await p.click('.tv-cancel'); await settle(150);
t('…all of it dropped by Cancel', (await pixel(W0 - 3, H0 - 3))[3] === 0);
await p.click('.tc-auto'); await settle(80);

/* the same settings everywhere, and after a restart */
await p.reload(); await p.waitForSelector('.topbar', { timeout: 8000 }); await settle(300);
await chartReady();
t('after a restart the chart keeps them — your colours, your crosshair', (await count([41, 98, 255], 8)) > 60 && (await settingsFile())?.canvas?.cross?.color === '#9C27B0');
await p.click('.tc-gear'); await settle(150);
await p.click('.tv-tmpl'); await settle(60); await p.click('.tv-t-default'); await settle(80);
await p.click('.tv-ok'); await settle(200);
t('Template ▸ Apply default, Ok: Quire’s colours again', (await settingsFile())?.candles?.mode === 'quire' && (await count([41, 98, 255], 8)) === 0);

/* timeframes 3m and 30m */
await p.click('.tc-seg button[data-tf="3m"]'); await settle(120);
t('3m: twenty to the hour', (await ch()).tf === 3 && (await ch()).bars > 4000, String((await ch()).bars));
await p.click('.tc-seg button[data-tf="30m"]'); await settle(120);
t('30m: two to the hour', (await ch()).tf === 30 && (await ch()).bars >= 430 && (await ch()).bars <= 445, String((await ch()).bars));
await p.click('.tc-seg button[data-tf="5m"]'); await settle(100);
await p.click('.tc-reset'); await settle(100);

/* candles stay inside the plot */
console.log('inside the plot · switches · full screen');
await p.mouse.move(box.x + 300, box.y + 150); await p.mouse.down(); await p.mouse.move(box.x + 300, box.y + 400, { steps: 8 }); await p.mouse.up(); await settle(100);
await p.evaluate(() => { const c = document.querySelector('.tc-canvas'); c.__pw = document.querySelector('.tc').__chart.pw; });
const band = await p.evaluate(() => {
  const c = document.querySelector('.tc-canvas'), k = window.devicePixelRatio || 1, g = c.getContext('2d');
  const W = c.width / k, H = c.height / k;
  /* the time band along the bottom, left of the price scale: no candle colour */
  const d = g.getImageData(0, Math.round((H - 20) * k), Math.round(c.__pw * k), Math.round(18 * k)).data;
  let coloured = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && ((d[i + 1] > 150 && d[i] < 60) || (d[i] > 220 && d[i + 1] < 120))) coloured++;
  return coloured;
});
t('dragged down, candles never run over the times along the bottom', band === 0, String(band));
await p.click('.tc-reset'); await settle(100);
t('sessions and news are on to start with, the RSI off', JSON.stringify((await ch()).shows) === '{"sessions":true,"news":true,"rsi":false}');
const tog = async which => { await p.click('.tc-ind'); await settle(60); await p.click(`.tv-menu .tc-ind-${which}`); await settle(60); };
await p.click('.tc-ind'); await settle(60);
t('Indicators opens a menu with Sessions and News, both ticked', await p.evaluate(() => {
  const m = document.querySelector('.tv-menu'); if (!m) return false;
  return /Sessions/.test(m.innerText) && /News · red folders/.test(m.innerText) && m.querySelectorAll('.is-checked').length === 2;
}));
await p.keyboard.press('Escape'); await settle(60);
t('…Esc closes it', await p.evaluate(() => !document.querySelector('.tv-menu')));
await tog('news');
await p.click('.tc-seg button[data-tf="D"]'); await settle(120);
t('news switched off: no markers', (await p.evaluate(() => document.querySelector('.tc').__chart.groups())).length === 0 && !(await ch()).shows.news);
await tog('news');
t('…and back on', (await p.evaluate(() => document.querySelector('.tc').__chart.groups())).length === 2);
await tog('sessions');
t('sessions switched off, and remembered', !(await ch()).shows.sessions && await p.evaluate(() => localStorage.getItem('quire:chartSessions')) === '0');
await shot('no-sessions');
await tog('news');
await p.click('.tc-seg button[data-tf="5m"]'); await settle(100);
/* a setting turned on and back off is saved in the vault */
await p.click('.tc-gear'); await settle(150);
await p.click('.tv-dtab[data-tab="scales"]'); await settle(60);
await p.click('.tv-last-line'); await p.click('.tv-ok'); await settle(200);
const on1 = await p.evaluate(() => JSON.parse(window.__files.get('data/drawings.json')).settings?.scales?.lastLine);
await p.click('.tc-gear'); await settle(150);
await p.click('.tv-last-line'); await p.click('.tv-ok'); await settle(200);
t('Settings → Scales and lines: Ok saves to the vault', on1 === true && await p.evaluate(() => JSON.parse(window.__files.get('data/drawings.json')).settings?.scales?.lastLine === false));
await p.mouse.move(box.x + 300, box.y + 120); await p.mouse.down(); await p.mouse.move(box.x + 300, box.y + 380, { steps: 8 }); await p.mouse.up();
await p.mouse.move(box.x + 300, box.y - 80); await settle(120);
const empty = await p.evaluate(() => {
  const c = document.querySelector('.tc-canvas'), k = window.devicePixelRatio || 1, g = c.getContext('2d');
  const pw = document.querySelector('.tc').__chart.pw;
  const d = g.getImageData(0, Math.round(26 * k), Math.round((pw - 2) * k), Math.round(70 * k)).data;
  let lit = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++;
  return lit;
});
t('no grid, no lines across the chart — empty space is empty', empty === 0, String(empty));
await tog('news');
await tog('sessions');
await p.click('.tc-seg button[data-tf="5m"]'); await settle(100);
await p.click('.tc-full'); await settle(200);
const fs1 = await p.evaluate(() => { const c = document.querySelector('.tc'); const r = c.getBoundingClientRect(); return { inBody: c.parentElement === document.body, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, plot: c.querySelector('.tc-plot').getBoundingClientRect().height }; });
t('full screen: the chart fills the window', (await ch()).full && fs1.inBody && fs1.w > fs1.vw - 30 && fs1.h > fs1.vh - 30 && fs1.plot > 600, JSON.stringify(fs1));
await shot('fullscreen');
await p.keyboard.press('Escape'); await settle(150);
t('Esc puts it back where it was', await p.evaluate(() => { const c = document.querySelector('.tc'); return !c.__chart.full && c.closest('.td-left') && c.parentElement.firstElementChild === c; }));
await p.click('.tc-full'); await settle(100);
await go('#/trades', 300);
t('leaving the page leaves full screen too', await p.evaluate(() => !document.querySelector('body > .tc')));
await go('#/trade/g1', 300); await chartReady();

/* your drawings (the full set of tools is in drawings.mjs) */
console.log('drawings');
const lineFile = () => p.evaluate(() => { try { return JSON.parse(window.__files.get('data/drawings.json')).lines; } catch { return null; } });
t('the drawing tools sit down the left of the chart', await p.evaluate(() => {
  const bar = document.querySelector('.tc .tc-body > .tv-left'), plot = document.querySelector('.tc .tc-body > .tc-plot');
  return bar && plot && bar.getBoundingClientRect().right <= plot.getBoundingClientRect().left + 1
    && [...bar.querySelectorAll('.tv-lb')].map(b => b.dataset.tool).join() === 'cursor,trend,rect,callout,long,short,magnet,eye,trash';
}));
const box2 = await p.evaluate(() => { const r = document.querySelector('.tc-canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; });
await p.click('.tv-left [data-tool="trend"]'); await settle(80);
t('Trend line arms the tool', (await ch()).drawing === 'trend' && await p.evaluate(() => document.querySelector('.tc-plot').classList.contains('is-drawing')));
await p.mouse.move(box2.x + 200, box2.y + 140); await p.mouse.down(); await p.mouse.move(box2.x + 380, box2.y + 150, { steps: 6 }); await p.mouse.up(); await settle(200);
let LF = await lineFile();
t('a drag draws a trend line, saved in the vault for gold', LF?.XAU_USD?.length === 1 && LF.XAU_USD[0].type === 'trend' && LF.XAU_USD[0].pts.length === 2, JSON.stringify(LF));
t('…and the tool puts itself away', !(await ch()).drawing);
await p.keyboard.press('Escape'); await settle(60);
/* the same drawings on the next gold trade, none on NAS100 */
await go('#/trade/o1', 300); await chartReady();
t('another gold trade shows the same drawing', await p.evaluate(() => document.querySelector('.tc').__chart.lineCount()) === 1);
await go('#/trade/n1', 300); await chartReady();
t('…and the NAS100 chart none of gold’s', await p.evaluate(() => document.querySelector('.tc').__chart.lineCount()) === 0);
t('the drawings are a vault file, so a backup carries them', await p.evaluate(async () => (await import('/js/store.js')).FILES.drawings === 'data/drawings.json'));
await go('#/trade/g1', 300); await chartReady();

/* kept days are read back, not fetched again */
SEEN.length = 0;
await forget();
await go('#/trades', 300); await go('#/trade/g1', 300); await chartReady();
t('opened again after a restart: the finished days from the vault — only today asked for', (await ch())?.bars > 1100 && SEEN.length === 1 && SEEN[0].q.from === String(Date.parse('2026-09-18T00:00:00Z') / 1000), JSON.stringify(SEEN.map(s => s.q.from)));
SEEN.length = 0;
await go('#/trade/o1', 300); await chartReady();
t('another gold trade the same week reads the same days — nothing asked', (await ch())?.bars > 1100 && SEEN.length === 0, String(SEEN.length));

/* closed by hand, with the news */
console.log('closed by hand · break-even · stopped · running · news');
await go('#/trade/n1', 300); await chartReady();
C = await ch();
t('closed by hand: the target stays, an Exit dot where you got out, and its price on the right', JSON.stringify(C.tags) === '["TP","SL","Entry","Exit"]' && JSON.stringify(C.dots) === '["Entry","Exit"]', JSON.stringify(C));
t('its own timeframe, 1m', C.tf === 1);
const scaleWords = await p.evaluate(async () => {
  const c = document.querySelector('.tc').__chart, g = document.querySelector('.tc-canvas').getContext('2d'), seen = [], f = g.fillText;
  g.fillText = function (txt, x, y) { if (x > c.pw) seen.push(String(txt)); return f.apply(this, arguments); };
  c.core.draw(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  g.fillText = f;
  return seen;
});
t('the TP / SL / Entry / Exit tags: just their prices, no words — a narrow price scale', scaleWords.length > 3 && !scaleWords.some(w => /TP|SL|Entry|Exit/.test(w)), JSON.stringify(scaleWords));
t('red-folder news for its currency only — not the ECB, not the holiday, nothing after the prices end',
  JSON.stringify(C.news) === JSON.stringify(['CPI m/m', 'Non-Farm Employment Change', 'Unemployment Rate', 'Average Hourly Earnings m/m']), JSON.stringify(C.news));
await shot('nas');
await p.click('.tc-seg button[data-tf="4H"]'); await settle(200);
const groups = await p.evaluate(() => document.querySelector('.tc').__chart.groups());
t('releases at the same moment share one marker, names stacked', groups.length === 2 && groups.some(g => g.titles.length === 3) && groups.some(g => g.titles.length === 1), JSON.stringify(groups));
t('…and no two markers sit on top of each other', groups.length < 2 || Math.abs(groups[0].x - groups[1].x) >= 8);
t('each release by its short name and currency — every one of them', JSON.stringify(groups.map(g => g.labels)) === JSON.stringify([['USD - CPI'], ['USD - NFP', 'USD - Unemployment', 'USD - AHE']]), JSON.stringify(groups.map(g => g.labels)));
const shorts = await p.evaluate(async () => { const O = await import('/js/chart/overlays.js');
  return ['Core CPI m/m', 'CPI y/y', 'German Prelim CPI m/m', 'Federal Funds Rate', 'FOMC Statement', 'Fed Chair Powell Speaks', 'ECB President Lagarde Speaks', 'ISM Manufacturing PMI', 'Flash Services PMI', 'Advance GDP q/q', 'Core PCE Price Index m/m', 'PPI m/m', 'Unemployment Claims', 'ADP Non-Farm Employment Change', 'FOMC Meeting Minutes', 'Main Refinancing Rate', 'Some Very Long Unknown Release Name'].map(O.shortNews); });
t('…short names: CPI, Core CPI, Rate, Powell, ISM Mfg, GDP, Core PCE…', JSON.stringify(shorts) === JSON.stringify(['Core CPI', 'CPI', 'German CPI', 'Rate', 'Rate', 'Powell', 'Lagarde', 'ISM Mfg', 'Services PMI', 'GDP', 'Core PCE', 'PPI', 'Claims', 'ADP', 'Minutes', 'Rate', 'Some Very Long…']), JSON.stringify(shorts));
await shot('nas-4h');
await go('#/trade/a1', 300); await chartReady();
C = await ch();
t('break-even at the entry: the exit dot sits on the entry price, no extra tag', JSON.stringify(C.tags) === '["TP","SL","Entry"]' && JSON.stringify(C.dots) === '["Entry","Exit"]', JSON.stringify(C.tags));
t('a trade with no timeframe uses the last one chosen (4H)', C.tf === 240, String(C.tf));
await go('#/trade/a2', 300); await chartReady();
C = await ch();
t('break-even a little off the entry: its price gets a tag', JSON.stringify(C.tags) === '["TP","SL","Entry","Exit"]', JSON.stringify(C.tags));
await go('#/trade/g2', 300); await chartReady();
C = await ch();
t('switching to 4H shows the whole week', await (async () => { await p.click('.tc-seg button[data-tf="1m"]'); await settle(100); await p.click('.tc-seg button[data-tf="4H"]'); await settle(150); const c = await ch(); return c.view.start === -1; })());
t('a 4H trade opens on 4H, showing the whole week', C.tf === 240 && C.view.start === -1 && C.view.count >= C.bars, JSON.stringify(C.view));
t('stopped out: no extra tag', JSON.stringify(C.tags) === '["TP","SL","Entry"]', JSON.stringify(C.tags));
await go('#/trade/o1', 300); await chartReady();
C = await ch();
t('a running trade: an entry dot, no exit', JSON.stringify(C.dots) === '["Entry"]', JSON.stringify(C.dots));
await shot('open');

/* the weekly review */
console.log('weekly review');
await go('#/review', 600); await chartReady();
await p.evaluate(() => [...document.querySelectorAll('.rv-item')].find(x => /XAUUSD/.test(x.textContent))?.click());
await settle(300); await chartReady();
const RV = await p.evaluate(() => {
  const slot = document.querySelector('.rv-tchart'), wrap = document.querySelector('.rv-trades'), row = document.querySelector('.rv-row');
  const tc = slot?.querySelector('.tc');
  return { has: !!tc, first: wrap?.firstElementChild === slot, w: slot?.getBoundingClientRect().width, ww: wrap?.clientWidth,
    rowTop: row?.getBoundingClientRect().top, slotBottom: Math.max(slot?.getBoundingClientRect().bottom || 0, tc?.getBoundingClientRect().bottom || 0),
    h: slot?.querySelector('.tc-plot')?.getBoundingClientRect().height, scrolls: getComputedStyle(wrap).overflowY,
    pair: [...(tc?.querySelector('h3')?.childNodes || [])].find(n => n.nodeType === 3)?.textContent };
});
t('a big chart across the top of the weekly review', RV.has && RV.first && Math.abs(RV.w - RV.ww) < 2 && RV.h >= 430 && RV.rowTop >= RV.slotBottom, JSON.stringify(RV));
t('…and the page scrolls down to the trade and its questions', RV.scrolls === 'auto');
t('the review’s gold chart shows the lines drawn on the gold trade — one set', await p.evaluate(() => document.querySelector('.rv-tchart .tc').__chart.lineCount()) === 1);
await p.evaluate(() => { document.querySelector('.rv-tchart .tc').__mark = 1; });
await p.click('.rv-seg button:has-text("Right")').catch(() => {});
await settle(300);
t('answering a question does not rebuild the chart', await p.evaluate(() => document.querySelector('.rv-tchart .tc')?.__mark === 1));
const other = await p.evaluate(() => {
  const items = [...document.querySelectorAll('.rv-item')];
  const i = items.findIndex(x => !x.classList.contains('is-on') && /NAS100/.test(x.textContent));
  items[i]?.click();
  return i;
});
await settle(300); await chartReady();
t('picking another trade puts that trade on the chart', other >= 0 && await p.evaluate(() => [...document.querySelector('.rv-tchart .tc h3').childNodes].find(n => n.nodeType === 3)?.textContent === 'NAS100' && !document.querySelector('.rv-tchart .tc').__mark));
await shot('review');

/* every way it comes up empty */
console.log('empty and wrong');
await go('#/trade/c1', 300); await chartReady();
t('no instrument: says so, asks nothing', /No chart for CORN/.test(await msg()));
MODE = 'down';
await forget();
await p.evaluate(() => { for (const k of [...window.__files.keys()]) if (k.startsWith('candles/NAS100_USD/')) window.__files.delete(k); });
await go('#/trade/n1', 300); await chartReady();
t('offline: says to check the connection, with Try again', /internet/.test(await msg()) && await p.evaluate(() => /Try again/.test(document.querySelector('.tc .tc-btn')?.textContent || '')), await msg());
MODE = 'ok';
await p.click('.tc .tc-btn'); await chartReady();
t('Try again, back online: the chart', (await ch())?.bars > 1000);
await p.evaluate(k => localStorage.setItem('quire:setting:oandaKey', k + 'x'), KEY);
await forget();
await p.evaluate(() => { for (const k of [...window.__files.keys()]) if (k.startsWith('candles/NAS100_USD/')) window.__files.delete(k); });
await go('#/trade/a1', 300); await go('#/trade/n1', 300); await chartReady();
t('a key OANDA refuses: says so, in words', /did not accept that key/.test(await msg()), await msg());
await p.evaluate(k => localStorage.setItem('quire:setting:oandaKey', k), KEY);

/* light theme draws too */
await p.evaluate(() => document.documentElement.dataset.theme = 'light');
await go('#/trade/g1', 300); await chartReady();
await shot('gold-light');
t('the canvas has candles on it (green and red pixels)', await p.evaluate(() => {
  const c = document.querySelector('.tc-canvas'), g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let green = 0, red = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 1] > 150 && d[i] < 60) green++; if (d[i] > 220 && d[i + 1] < 120) red++; }
  return green > 200 && red > 200;
}));

t('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
