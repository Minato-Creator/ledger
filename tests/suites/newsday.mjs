/* News on a trade, read off the calendar.

   • The calendar keeps the weeks it has read: a new week is added, the same
     week read again replaces itself, nothing is lost.
   • A red folder counts only for the pair's own currencies — a CAD release
     is not news for AUDUSD. A bank holiday counts from anywhere: the CAD
     holiday on 30 Sep is a bank holiday day for USDJPY.
   • New trade fills in the release and the holiday; several releases, you
     pick one; a day the calendar never read, you say.
   • Analytics → Execution: News — red folder day, bank holiday, no news —
     with R, how many trades and how often they won. Expected figures are
     worked out here from the trades, not with the app's code. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB } from '../fixtures/ghost-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };
const rr = v => `${v > 0.0005 ? '+' : v < -0.0005 ? '−' : ''}${Math.abs(v).toFixed(1)}R`;

/* ---------- the calendar: two weeks, read one after the other ---------- */
const E = (title, country, ny, impact = 'High') => ({ id: `${ny}|${country}|${title}`, title, country, at: new Date(ny).toISOString(), impact, forecast: '', previous: '' });
const LAST_WEEK = [
  E('Bank Holiday', 'JPY', '2026-09-22T00:00:00-04:00', 'Holiday'),          // Perth 22 Sep 12:00
  E('CPI m/m', 'USD', '2026-09-23T08:30:00-04:00'),                          // Perth 23 Sep 20:30
];
const THIS_WEEK = [
  E('BOJ Policy Rate', 'JPY', '2026-09-28T23:00:00-04:00'),                  // Perth 29 Sep 11:00
  E('Bank Holiday', 'CAD', '2026-09-30T00:00:00-04:00', 'Holiday'),          // Perth 30 Sep 12:00
  E('Core PCE Price Index m/m', 'USD', '2026-09-30T08:30:00-04:00'),         // Perth 30 Sep 20:30
  E('Retail Sales m/m', 'AUD', '2026-09-30T21:30:00-04:00'),                 // Perth 1 Oct 09:30
  E('GDP m/m', 'CAD', '2026-10-01T08:30:00-04:00'),                          // Perth 1 Oct 20:30
  E('Bank Holiday', 'CNY', '2026-10-01T19:01:00-04:00', 'Holiday'),          // Perth 2 Oct 07:01 — as the feed has it
  E('Non-Farm Employment Change', 'USD', '2026-10-02T08:30:00-04:00'),       // Perth 2 Oct 20:30
  E('Unemployment Rate', 'USD', '2026-10-02T08:30:00-04:00'),
  E('Daylight Saving Time Shift', 'AUD', '2026-10-03T12:00:00-04:00', 'Holiday'),   // the clocks change: not a bank holiday
];
const KEPT_WEEK = THIS_WEEK.filter(e => !/Daylight/.test(e.title));
const ALL_N = LAST_WEEK.length + KEPT_WEEK.length;

/* ---------- the trades ---------- */
const base = { accountId: 'acc_1', riskPercent: 1, mode: 'live', sessionId: 'ses_l', setupId: 's_fvg', tagIds: [], notes: '', status: 'closed', side: 'buy', timeOpen: '15:30', timeClose: '16:30' };
const T = (id, pair, date, R, extra = {}) => ({ ...base, id, pair, date, netResult: R * 1000, ...extra });
const TR = [
  T('u1', 'USDJPY', '2026-09-30', 2, { holidays: ['AU', 'US'], news: 'before' }),   // ticked by mistake: the calendar says Canada
  T('a1', 'AUDUSD', '2026-10-01', -1),
  T('n1', 'NZDUSD', '2026-10-01', 1),       // a CAD and an AUD release that day — neither is NZD or USD
  T('x1', 'XAUUSD', '2026-10-02', 3),
  T('j1', 'USDJPY', '2026-09-29', -1),
  T('o1', 'AUDUSD', '2026-09-23', 1.5),     // last week, kept
  T('o2', 'EURUSD', '2026-09-22', -1),      // Japan's holiday counts for anyone
  T('h1', 'AUDUSD', '2026-09-10', -1, { news: 'during' }),             // never read: what the trade says
  T('h2', 'AUDUSD', '2026-09-11', 0.5, { holidays: ['US'] }),
  T('h3', 'AUDUSD', '2026-09-09', -1),
  /* logged before the calendar filled these in: the US ticked by mistake, no news */
  T('k1', 'NAS100', '2026-10-02', -1, { holidays: ['US'], news: 'before', timeOpen: '08:15', timeClose: '15:45' }),
];
const KIND = { red: ['u1', 'a1', 'x1', 'j1', 'o1', 'h1', 'k1'], holiday: ['u1', 'o2', 'h2', 'x1', 'k1'], quiet: ['n1', 'h3'] };
const R = id => TR.find(x => x.id === id).netResult / 1000;
const EXP = Object.fromEntries(Object.entries(KIND).map(([k, ids]) => [k, { n: ids.length, sum: ids.reduce((a, id) => a + R(id), 0),
  won: Math.round(ids.filter(id => R(id) > 0).length / ids.filter(id => R(id) !== 0).length * 100) + '%' }]));

const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Australia/Perth' });
await ctx.route(/faireconomy|forexfactory/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_|net::/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(new Date('2026-10-03T12:00:00+08:00'));
await p.addInitScript(({ ACCT, TR, PB }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: 'R', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, TR, PB });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 300) => p.waitForTimeout(ms);
const go = async (h, ms = 500) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };
const onDisk = () => p.evaluate(() => JSON.parse(window.__files.get('data/trades.json')).trades);

/* ===================== the calendar keeps its weeks ===================== */
console.log('history');
const K = await p.evaluate(async ({ LAST_WEEK, THIS_WEEK }) => {
  const { store } = await import('/js/store.js');
  await store.saveNews(LAST_WEEK);
  await store.saveNews(THIS_WEEK);
  const after = store.news.events.map(e => e.id);
  /* the same week read again, one release revised: replaced, not doubled */
  await store.saveNews(THIS_WEEK.map(e => e.title === 'GDP m/m' ? { ...e, forecast: '0.1%' } : e));
  const disk = JSON.parse(window.__files.get('data/news.json'));
  /* an empty read keeps everything */
  await store.saveNews([]);
  return { after, again: store.news.events.length, gdp: store.news.events.find(e => e.title === 'GDP m/m').forecast,
    spans: disk.spans.length, disk: disk.events.length, empty: store.news.events.length };
}, { LAST_WEEK, THIS_WEEK });
t('a new week is added to the old one, not swapped for it', K.after.length === ALL_N && LAST_WEEK.every(e => K.after.includes(e.id)), String(K.after.length));
t('the same week read again replaces itself', K.again === ALL_N && K.gdp === '0.1%', `${K.again} ${K.gdp}`);
t('…and is written down, with the two weeks it covers', K.disk === ALL_N && K.spans === 2, `${K.disk} ${K.spans}`);
t('a read that came back empty loses nothing', K.empty === ALL_N, String(K.empty));

/* ===================== by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async () => {
  const N = await import('/js/newsday.js');
  const { store } = await import('/js/store.js');
  const d = (pair, date) => { const x = N.dayNews(store.news, pair, date); return x && { red: x.red.map(e => e.country + ' ' + e.title), hol: x.holidays.map(e => N.holidayKey(e.country)) }; };
  return {
    cur: ['AUDUSD', 'XAUUSD', 'NAS100', 'USDJPY', 'EUR/USD'].map(x => N.pairCurrencies(x).join('+')),
    u1: d('USDJPY', '2026-09-30'), a1: d('AUDUSD', '2026-10-01'), n1: d('NZDUSD', '2026-10-01'), x1: d('XAUUSD', '2026-10-02'),
    sun: d('AUDUSD', '2026-10-04'), old: d('AUDUSD', '2026-09-10'),
    kinds: Object.fromEntries(store.trades.map(t => [t.id, N.newsDayOf(t, store.news)])),
    feed: (await import('/js/news.js')).parseFeed(JSON.stringify([
      { title: 'Daylight Saving Time Shift', country: 'AUD', date: '2026-10-03T12:00:00-04:00', impact: 'Holiday' },
      { title: 'Bank Holiday', country: 'CNY', date: '2026-10-01T19:01:00-04:00', impact: 'Holiday' }])),
  };
});
t('a pair’s own currencies; gold and the Nasdaq are USD', H.cur.join() === 'AUD+USD,USD,USD,USD+JPY,EUR+USD', H.cur.join());
t('30 Sep, USDJPY: Core PCE, and Canada’s bank holiday', JSON.stringify(H.u1) === JSON.stringify({ red: ['USD Core PCE Price Index m/m'], hol: ['CA'] }), JSON.stringify(H.u1));
t('1 Oct, AUDUSD: the AUD release, not the CAD one', JSON.stringify(H.a1?.red) === '["AUD Retail Sales m/m"]', JSON.stringify(H.a1));
t('1 Oct, NZDUSD: nothing — neither release is its currency', H.n1 && H.n1.red.length === 0 && H.n1.hol.length === 0, JSON.stringify(H.n1));
t('2 Oct, XAUUSD: both USD releases, and China’s bank holiday', H.x1?.red.length === 2 && JSON.stringify(H.x1.hol) === '["CN"]', JSON.stringify(H.x1));
t('a quiet day in a week that was read says nothing on, not unknown', H.sun && H.sun.red.length === 0, JSON.stringify(H.sun));
t('the clocks changing (4 Oct) is not a bank holiday', H.sun && H.sun.hol.length === 0, JSON.stringify(H.sun));
t('…nor kept from the feed at all', H.feed.length === 1 && H.feed[0].title === 'Bank Holiday', JSON.stringify(H.feed));
t('a day never read is unknown', H.old === null);
const kindOf = id => Object.entries(KIND).filter(([k, ids]) => ids.includes(id)).map(([k]) => k);
const got = id => [H.kinds[id].red ? 'red' : null, H.kinds[id].holiday ? 'holiday' : null].filter(Boolean);
t('every trade, the kind of day it was', TR.every(x => JSON.stringify(got(x.id).length ? got(x.id) : ['quiet']) === JSON.stringify(kindOf(x.id))),
  JSON.stringify(Object.fromEntries(TR.map(x => [x.id, got(x.id)]))));

/* ===================== Analytics → Execution ===================== */
console.log('analytics');
await go('#/analytics', 400);
const click = label => p.evaluate(l => [...document.querySelectorAll('.head .seg button')].find(b => b.textContent.trim() === l)?.click(), label);
await click('All'); await settle(200);
await click('Execution'); await settle(500);
const card = await p.evaluate(() => { const c = document.querySelector('.ex-newsdays'); if (!c) return null;
  return { h: c.querySelector('h2').textContent, cols: [...c.querySelectorAll('.is-cols span')].map(x => x.textContent).filter(Boolean),
    rows: [...c.querySelectorAll('[data-day]')].map(r => ({ k: r.dataset.day, nm: r.querySelector('.nm').textContent, r: r.querySelector('b').textContent,
      n: r.querySelector('.n').textContent, w: r.querySelector('.w').textContent })) }; });
t('the card is called News, where Bank holidays was', card?.h === 'News' && !(await p.evaluate(() => [...document.querySelectorAll('.an-body h2')].some(h => h.textContent === 'Bank holidays'))), card?.h);
t('three rows: red folder day, bank holiday, no news', card?.rows.map(r => r.nm).join() === 'Red folder day,Bank holiday,No news', card?.rows.map(r => r.nm).join());
t('…under R, Trades, Won', card?.cols.join() === 'R,Trades,Won', card?.cols.join());
for (const r of card?.rows || []) {
  const e = EXP[r.k];
  t(`${r.nm}: ${rr(e.sum)}, ${e.n} trades, ${e.won} won`, r.r === rr(e.sum) && r.n === String(e.n) && r.w === e.won, JSON.stringify(r));
}
await p.evaluate(() => document.querySelector('.ex-newsdays').scrollIntoView({ block: 'center' })); await settle(150);
await p.screenshot({ path: OUT + '/newsday-analytics.png' });

/* ===================== an old trade reads right without being edited ===================== */
console.log('old trade');
await go('#/trade/k1', 500);
let kc = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.td-cell')].map(c => [c.querySelector('.k').textContent, c.querySelector('b').textContent])));
t('2 Oct NAS100, logged with the US ticked and no news: the page shows the USD red folders', kc.News === 'USD - NFP+1 more', JSON.stringify(kc));
t('…and China’s bank holiday, not the United States', kc['Bank holiday'] === 'China', kc['Bank holiday']);
t('…without the trade being opened and saved', JSON.stringify((await onDisk()).find(x => x.id === 'k1').holidays) === '["US"]');
await go('#/review', 700);
await p.evaluate(() => [...document.querySelectorAll('.rv-item')].find(x => /NAS100/.test(x.textContent))?.click()); await settle(400);
const kp = await p.evaluate(() => [...document.querySelectorAll('.rv-pill')].map(x => x.textContent));
t('the weekly review says the same', kp.includes('Red folderUSD - NFP, USD - Unemployment') && kp.includes('Bank holidayChina') && !kp.some(x => /United States/.test(x)), JSON.stringify(kp));
await go('#/trades', 500);
await p.evaluate(() => { const s = [...document.querySelectorAll('.tr-bar select')].find(x => x.options[0].text === 'News · all'); s.value = 'holiday'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await settle(300);
const hn = await p.evaluate(() => document.querySelectorAll('.tbl-body > *').length);
t('Trades → bank holiday: the calendar’s days', hn === KIND.holiday.length, `${hn} vs ${KIND.holiday.length}`);
await p.evaluate(() => { const s = [...document.querySelectorAll('.tr-bar select')].find(x => x.options[0].text === 'News · all'); s.value = 'all'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await settle(200);

/* ===================== the wire lists this week only ===================== */
await go('#/wire', 900);
const wk = await p.evaluate(() => [...document.querySelectorAll('.rf-week-ev .ttl')].map(x => x.textContent));
t('the wire’s week is this week, not every week kept — and no clock change', wk.length === KEPT_WEEK.length && !wk.some(x => /CPI m\/m|Daylight/.test(x)), wk.join(' | '));

/* ===================== New trade ===================== */
console.log('new trade');
await go('#/new', 500);
const setPair = async v => { await p.fill('.main input[placeholder="XAUUSD"]', v); await settle(120); };
const setDate = async v => { await p.fill('.trade-form input[type=date]', v); await settle(120); };
const pickState = () => p.evaluate(() => { const [rf, hol] = document.querySelectorAll('.news-pick');
  return { from: rf.dataset.from, chips: [...rf.querySelectorAll('.xr.is-rf')].map(b => b.textContent + (b.classList.contains('is-on') ? '*' : '')),
    rfText: rf.innerText.replace(/\s+/g, ' ').trim(), hol: hol.innerText.trim() }; });
await setDate('2026-09-30'); await setPair('USDJPY');
let s = await pickState();
t('30 Sep, USDJPY: Core PCE filled in', s.from === 'calendar' && s.chips.join() === '20:30 USD · Core PCE Price Index m/m*', JSON.stringify(s.chips));
t('…and the bank holiday is Canada’s', s.hol === 'Canada', s.hol);
await setDate('2026-10-01'); await setPair('AUDUSD');
s = await pickState();
t('1 Oct, AUDUSD: the AUD release only', s.chips.join() === '09:30 AUD · Retail Sales m/m*' && s.rfText === '09:30 AUD · Retail Sales m/m' && s.hol === 'N/A', JSON.stringify(s));
await setPair('NZDUSD');
s = await pickState();
t('1 Oct, NZDUSD: N/A, and says why', /^N\/A no red folder for NZD or USD that day$/.test(s.rfText) && s.chips.length === 0, s.rfText);
await setDate('2026-10-02'); await setPair('XAUUSD');
s = await pickState();
t('2 Oct, gold: two USD releases, none chosen for you', s.chips.length === 2 && s.chips.every(x => !x.endsWith('*')) && /pick the one that mattered/.test(s.rfText), JSON.stringify(s));
await p.evaluate(() => [...document.querySelectorAll('.xr.is-rf')].find(b => /Non-Farm/.test(b.textContent)).click()); await settle(80);
s = await pickState();
t('…you pick one', s.chips.filter(x => x.endsWith('*')).join() === '20:30 USD · Non-Farm Employment Change*' && !/pick the one/.test(s.rfText), JSON.stringify(s.chips));
await p.evaluate(() => document.querySelector('.news-pick').scrollIntoView({ block: 'center' })); await settle(150);
await p.screenshot({ path: OUT + '/newsday-newtrade.png' });
await p.fill('.main input[placeholder="0.00"]', '1500'); await settle(150);
await p.evaluate(() => [...document.querySelectorAll('.head button')].find(b => /^Save/.test(b.textContent.trim())).click()); await settle(700);
const mine = (await onDisk()).find(x => x.pair === 'XAUUSD' && x.date === '2026-10-02' && x.id !== 'x1');
const NFP = THIS_WEEK.find(e => /Non-Farm/.test(e.title));
t('saved with the release and China’s holiday', JSON.stringify(mine?.newsEvent) === JSON.stringify({ title: NFP.title, country: 'USD', at: NFP.at }) && JSON.stringify(mine?.holidays) === '["CN"]',
  JSON.stringify(mine && [mine.newsEvent, mine.holidays]));
await go('#/trade/' + mine.id, 500);
const cells = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.td-cell')].map(c => [c.querySelector('.k').textContent, c.querySelector('b').textContent])));
t('the trade page: News and Bank holiday', cells.News === 'USD - NFP+1 more' && cells['Bank holiday'] === 'China', JSON.stringify(cells));
await p.evaluate(() => document.querySelector('.td-cell.is-many').click()); await settle(150);
const allNews = await p.evaluate(() => ({ evs: [...document.querySelectorAll('.td-news-all:not([hidden]) .td-news-ev')].map(x => x.textContent), more: document.querySelector('.td-news-more').textContent, tip: document.querySelector('.td-news-ev')?.title }));
await p.locator('.td-how').screenshot({ path: OUT + '/newsday-trade-news.png' }).catch(() => {});
t('…click it: every red folder that day, short, with its time — the one picked first, the full title on hover', allNews.evs.length === 2 && /USD - NFP$/.test(allNews.evs[0]) && /USD - Unemployment$/.test(allNews.evs[1]) && allNews.more === 'less' && /Non-Farm Employment Change/.test(allNews.tip), JSON.stringify(allNews));
await p.evaluate(() => document.querySelector('.td-cell.is-many').click()); await settle(100);
t('…and again to fold them away', await p.evaluate(() => document.querySelector('.td-news-all').hidden && document.querySelector('.td-news-more').textContent === '+1 more'));

/* the trade ticked AU and US by mistake: opening it puts the calendar right */
await go('#/edit/u1', 500);
s = await pickState();
t('editing the 30 Sep trade: Canada, not Australia and the US', s.hol === 'Canada' && s.chips.join() === '20:30 USD · Core PCE Price Index m/m*', JSON.stringify(s));
await p.evaluate(() => [...document.querySelectorAll('.head button')].find(b => /^Save/.test(b.textContent.trim())).click()); await settle(700);
const u1 = (await onDisk()).find(x => x.id === 'u1');
t('…and saved that way', JSON.stringify(u1.holidays) === '["CA"]' && u1.newsEvent?.title === 'Core PCE Price Index m/m', JSON.stringify([u1.holidays, u1.newsEvent]));
await go('#/trade/u1', 500);
const c2 = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.td-cell')].map(c => [c.querySelector('.k').textContent, c.querySelector('b').textContent])));
t('the trade page reads it back', c2['News timing'] === 'Before news' && c2.News === 'USD - Core PCE' && c2['Bank holiday'] === 'Canada', JSON.stringify(c2));

/* a day the calendar never read: say it yourself */
await go('#/new', 500);
await setDate('2026-09-10'); await setPair('AUDUSD');
s = await pickState();
t('a day never read: you type the release and choose the holiday', s.from === 'hand' && !!(await p.$('.news-pick input.news-text')) && !!(await p.$('.news-pick select.news-sel')), JSON.stringify(s));
await p.evaluate(() => document.querySelector('.news-pick').scrollIntoView({ block: 'center' })); await settle(150);
await p.screenshot({ path: OUT + '/newsday-byhand.png' });
await p.fill('.news-pick input.news-text', 'Employment Change (AUD)');
await p.selectOption('.news-pick select.news-sel', 'AU');
await p.fill('.main input[placeholder="0.00"]', '500'); await settle(150);
await p.evaluate(() => [...document.querySelectorAll('.head button')].find(b => /^Save/.test(b.textContent.trim())).click()); await settle(700);
const hand = (await onDisk()).find(x => x.pair === 'AUDUSD' && x.date === '2026-09-10' && x.id !== 'h1');
t('…and it is kept', hand?.newsEvent?.title === 'Employment Change (AUD)' && JSON.stringify(hand?.holidays) === '["AU"]', JSON.stringify(hand && [hand.newsEvent, hand.holidays]));

t('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
