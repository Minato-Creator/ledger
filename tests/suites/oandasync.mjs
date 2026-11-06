/* The OANDA sync, against a fake OANDA: the trades come in with their times,
   prices, size, result, the stop they began with and the target; a second
   sync adds only what is new and finishes what was open; what you added to a
   trade stays; demo trades say Demo; nothing but reading is ever asked. */
import pw from 'playwright';
import fs from 'node:fs';
const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const ACC = '101-011-1234567-001', KEY = 'demo-0123456789abcdef-0123456789abcdef';
const S = iso => String(Date.parse(iso) / 1000);                 // OANDA's UNIX times
/* what the fake account holds; the second sync sees `later` */
const BASE = {
  trades: [
    /* a long on gold: in 15:35, out 18:50 Perth (07:35 → 10:50 UTC), +$250 realised, −$3.20 financing; stop began at 3990, moved to 4000 */
    { id: '41', instrument: 'XAU_USD', price: '4000.00', openTime: S('2026-09-15T07:35:00Z'), initialUnits: '50', currentUnits: '0', state: 'CLOSED',
      realizedPL: '250.0000', financing: '-3.2000', dividendAdjustment: '0', averageClosePrice: '4005.00', closeTime: S('2026-09-15T10:50:00Z'),
      stopLossOrder: { price: '4000.00', state: 'CANCELLED' }, takeProfitOrder: { price: '4005.00', state: 'FILLED' } },
    /* a short on EURUSD, still open */
    { id: '45', instrument: 'EUR_USD', price: '1.17000', openTime: S('2026-09-16T13:05:00Z'), initialUnits: '-200000', currentUnits: '-200000', state: 'OPEN',
      realizedPL: '0', financing: '0', unrealizedPL: '40', stopLossOrder: { price: '1.17200' }, takeProfitOrder: { price: '1.16500' } },
  ],
  transactions: [
    { id: '3', type: 'TRANSFER_FUNDS', amount: '100000.0000', fundingReason: 'CLIENT_FUNDING', time: S('2026-09-01T00:00:00Z') },   // the demo's first money
    { id: '40', type: 'MARKET_ORDER' },
    { id: '42', type: 'STOP_LOSS_ORDER', tradeID: '41', price: '3990.00', reason: 'ON_FILL' },
    { id: '43', type: 'TAKE_PROFIT_ORDER', tradeID: '41', price: '4005.00', reason: 'ON_FILL' },
    { id: '44', type: 'STOP_LOSS_ORDER', tradeID: '41', price: '4000.00', reason: 'REPLACEMENT' },
    { id: '46', type: 'STOP_LOSS_ORDER', tradeID: '45', price: '1.17200', reason: 'ON_FILL' },
  ],
  last: 46,
};
const later = structuredClone(BASE);
later.trades[1] = { ...later.trades[1], currentUnits: '0', state: 'CLOSED', realizedPL: '600.0000', financing: '-1.0000', averageClosePrice: '1.16700', closeTime: S('2026-09-16T15:20:00Z') };
later.trades.unshift({ id: '48', instrument: 'NAS100_USD', price: '24500.0', openTime: S('2026-09-17T13:30:00Z'), initialUnits: '2', currentUnits: '0', state: 'CLOSED',
  realizedPL: '-80.0000', financing: '0', averageClosePrice: '24460.0', closeTime: S('2026-09-17T13:55:00Z') });
later.transactions.push({ id: '47', type: 'TRANSFER_FUNDS', amount: '5000.0000', fundingReason: 'CLIENT_FUNDING', time: S('2026-09-17T01:00:00Z') });   // topped up
later.transactions.push({ id: '49', type: 'STOP_LOSS_ORDER', tradeID: '48', price: '24460.0', reason: 'ON_FILL' });
later.last = 49;

let BOOK = BASE;
const SEEN = [];
async function oanda(route) {
  const req = route.request(), url = new URL(req.url());
  SEEN.push({ method: req.method(), host: url.host, path: url.pathname + url.search, auth: req.headers().authorization });
  const json = body => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (url.pathname === '/v3/accounts') return json({ accounts: [{ id: ACC, tags: [] }] });
  if (url.pathname === `/v3/accounts/${ACC}/summary`) return json({ account: { id: ACC, currency: 'USD', balance: '100765.8000', pl: '770.0000', financing: '-4.2000', commission: '0', lastTransactionID: String(BOOK.last) } });
  if (url.pathname === `/v3/accounts/${ACC}/trades`) return json({ trades: BOOK.trades, lastTransactionID: String(BOOK.last) });
  if (url.pathname === `/v3/accounts/${ACC}/transactions/idrange`) {
    const a = +url.searchParams.get('from'), b = +url.searchParams.get('to');
    return json({ transactions: BOOK.transactions.filter(x => +x.id >= a && +x.id <= b), lastTransactionID: String(BOOK.last) });
  }
  return route.fulfill({ status: 404, body: '{}' });
}

const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Australia/Perth' });
await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, oanda);
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(({ KEY }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('quire:setting:oandaKey', KEY);
  const A = { id: 'acc_1', name: 'Apex 50K', currency: 'USD', startingBalance: 50000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2026-06-01', archived: false };
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', accounts: [A], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: [{ id: 'apex-1', accountId: 'acc_1', pair: 'USDJPY', side: 'buy', status: 'closed', date: '2026-09-10', timeOpen: '09:00', timeClose: '10:00',
      entryPrice: 150, exitPrice: 150.5, stopLoss: 149.5, size: 1, riskPercent: 1, netResult: 300, tags: [] }] })]]));
}, { KEY });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const files = () => p.evaluate(() => Object.fromEntries(JSON.parse(localStorage.getItem('fakefs')).map(([k, v]) => [k, JSON.parse(v)])));

console.log('  -- the card --');
await p.evaluate(() => { location.hash = '#/import'; }); await p.waitForTimeout(500);
t('Import trades offers OANDA, with the kind of key it has', await p.evaluate(() => /OANDA/.test(document.querySelector('.im-oanda')?.innerText) && /demo key/.test(document.querySelector('.im-oanda').innerText)));
t('…and says it only reads', await p.evaluate(() => /only reads/.test(document.querySelector('.im-oanda').innerText)));
await p.evaluate(() => { location.hash = '#/trades'; }); await p.waitForTimeout(500);
const before = await p.evaluate(() => document.querySelectorAll('.main .tbl-row').length);
await p.evaluate(() => { location.hash = '#/import'; }); await p.waitForTimeout(500);
t('nothing asked of OANDA until you press it', SEEN.length === 0);

console.log('  -- the first sync --');
await p.click('.im-oanda-go'); await p.waitForTimeout(1500);
let F = await files();
const acct = F['data/accounts.json'].accounts.find(a => a.firm === 'oanda');
t('a journal account of its own, OANDA Demo, at OANDA', acct && acct.name === 'OANDA Demo' && acct.kind === 'live' && acct.currency === 'USD', JSON.stringify(acct));
t('…starting where the account began (balance less what it made)', acct && Math.abs(acct.startingBalance - 100000) < 0.01, String(acct?.startingBalance));
t('…opened on the day of its first trade', acct?.openedAt === '2026-09-15', String(acct?.openedAt));
t('…its first money in is where it began, not a deposit on top', !(acct?.adjustments || []).length, JSON.stringify(acct?.adjustments));
t('you stay on the account you were on, not moved to the new one', F['data/accounts.json'].activeAccountId === 'acc_1', String(F['data/accounts.json'].activeAccountId));
t('…your own trades untouched', F['data/trades.json'].trades.some(x => x.id === 'apex-1' && x.accountId === 'acc_1'));
t('…and the word says where the new ones went', await p.evaluate(() => /in OANDA Demo — open it from the account switcher/.test(document.querySelector('#toast')?.innerText || '')), await p.evaluate(() => document.querySelector('#toast')?.innerText));
await p.evaluate(() => { location.hash = '#/trades'; }); await p.waitForTimeout(600);
t('…so the journal still shows your trades', before >= 1 && await p.evaluate(n => document.querySelectorAll('.main .tbl-row').length === n && /USDJPY|USD\/JPY/.test(document.querySelector('.main').innerText), before), String(before));
await p.evaluate(() => { location.hash = '#/import'; }); await p.waitForTimeout(500);
t('the card offers a way across to them', await p.evaluate(() => !!document.querySelector('.im-oanda-see')));
await p.click('.im-oanda-see'); await p.waitForTimeout(700);
t('…which opens OANDA Demo in the journal', await p.evaluate(async () => { const { store } = await import('/js/store.js'); return store.activeAccount?.name === 'OANDA Demo' && location.hash === '#/trades'; }));
const T = id => F['data/trades.json'].trades.find(x => x.id === `oanda-${ACC}-${id}`);
const g = T('41');
t('the gold trade came in', !!g && g.accountId === acct.id && g.pair === 'XAUUSD' && g.side === 'buy' && g.assetClass === 'Commodities', JSON.stringify(g));
t('…with its times in your time (Perth)', g?.date === '2026-09-15' && g.timeOpen === '15:35' && g.timeClose === '18:50', JSON.stringify(g && [g.date, g.timeOpen, g.timeClose]));
t('…its prices in and out', g?.entryPrice === 4000 && g.exitPrice === 4005);
t('…its size in lots (50 oz = 0.5)', g?.size === 0.5 && g.sizeUnit === 'lots', JSON.stringify(g && [g.size, g.sizeUnit]));
t('…its result, financing included', g?.netResult === 246.8, String(g?.netResult));
t('…the stop it began with, not where it was moved to', g?.stopLoss === 3990 && g.takeProfit === 4005, JSON.stringify(g && [g.stopLoss, g.takeProfit]));
t('…so its R is the R taken: 10 points × 50 oz = $500 risk on $100k = 0.5%', Math.abs((g?.riskPercent ?? 0) - 0.5) < 1e-6, String(g?.riskPercent));
t('…and it is marked as a demo trade', g?.demo === true && g.source === 'OANDA demo');
const e = T('45');
t('the open short came in open, with its stop and target', e?.status === 'open' && e.side === 'sell' && e.pair === 'EURUSD' && e.size === 2 && e.stopLoss === 1.172 && e.takeProfit === 1.165 && e.netResult == null, JSON.stringify(e));
t('only reading was ever asked, and only of the demo host, with the key', SEEN.every(s => s.method === 'GET' && s.host === 'api-fxpractice.oanda.com' && s.auth === 'Bearer ' + KEY), JSON.stringify(SEEN.map(s => s.method + ' ' + s.path)));
t('the link is kept: account, where the trades went, how far it read', F['data/accounts.json'].oanda?.accountId === ACC && F['data/accounts.json'].oanda.laminarId === acct.id && F['data/accounts.json'].oanda.lastTxn === 46, JSON.stringify(F['data/accounts.json'].oanda));

console.log('  -- in the journal --');
await p.evaluate(() => { location.hash = '#/trades'; }); await p.waitForTimeout(600);
t('the journal shows the OANDA account, Demo beside its trades', await p.evaluate(() => document.querySelectorAll('.main .demo-tag').length >= 1 && /Demo/i.test(document.querySelector('.main .demo-tag').textContent)));
/* a trade taken today says Today where its date would be (a sync puts the real date back) */
await p.evaluate(async id => { const { store, todayISO } = await import('/js/store.js'); await store.updateTrade(id, { date: todayISO() }); }, `oanda-${ACC}-41`);
await p.evaluate(() => { location.hash = '#/calendar'; }); await p.waitForTimeout(300);
await p.evaluate(() => { location.hash = '#/trades'; }); await p.waitForTimeout(600);
t('today’s trade says Today in the Date column, the others their dates', await p.evaluate(() => {
  const rows = [...document.querySelectorAll('.main .tbl-row')], tagged = rows.filter(r => r.querySelector('.today-tag'));
  return tagged.length === 1 && /XAUUSD/.test(tagged[0].innerText) && /Today/i.test(tagged[0].querySelector('.td .today-tag, .today-tag').textContent);
}), await p.evaluate(() => [...document.querySelectorAll('.main .tbl-row')].map(r => r.innerText.replace(/\n/g, ' ')).join(' || ')));
await p.evaluate(id => { location.hash = '#/trade/' + id; }, `oanda-${ACC}-41`); await p.waitForTimeout(600);
t('…and on the trade itself', await p.evaluate(() => !!document.querySelector('.head .demo-tag')));

console.log('  -- you add to a trade, then it syncs again --');
await p.evaluate(async id => { const { store } = await import('/js/store.js'); await store.updateTrade(id, { notes: 'clean sweep', setupId: 'set_x', stopLoss: 3992 }); }, `oanda-${ACC}-41`);
BOOK = later; SEEN.length = 0;
await p.evaluate(() => { location.hash = '#/import'; }); await p.waitForTimeout(500);
t('synced once, the card says where they went', await p.evaluate(() => /Into OANDA Demo · 2 trades/.test(document.querySelector('.im-oanda').innerText)), await p.evaluate(() => document.querySelector('.im-oanda').innerText.replace(/\n/g, ' | ')));
await p.click('.im-oanda-go'); await p.waitForTimeout(1500);
F = await files();
t('no second copy of anything', F['data/trades.json'].trades.filter(x => x.oanda).length === 3, String(F['data/trades.json'].trades.filter(x => x.oanda).length));
const e2 = T('45');
t('the open one is finished: out, with its result', e2?.status === 'closed' && e2.exitPrice === 1.167 && e2.netResult === 599 && e2.timeClose === '23:20', JSON.stringify(e2 && [e2.status, e2.exitPrice, e2.netResult, e2.timeClose]));
const n = T('48');
t('the new one is added', n?.pair === 'NAS100' && n.netResult === -80 && n.stopLoss === 24460 && n.assetClass === 'Indices' && n.sizeUnit === 'units', JSON.stringify(n));
const g2 = T('41');
t('what you added stays: notes, setup, the stop you set', g2?.notes === 'clean sweep' && g2.setupId === 'set_x' && g2.stopLoss === 3992, JSON.stringify(g2 && [g2.notes, g2.setupId, g2.stopLoss]));
const ac2 = F['data/accounts.json'].accounts.find(a => a.firm === 'oanda');
const fund = (ac2?.adjustments || []).filter(x => x.kind === 'funding');
t('a demo topped up comes across as funding, dated in your time', fund.length === 1 && fund[0].amount === 5000 && fund[0].date === '2026-09-17' && fund[0].id === 'oanda-tx-47', JSON.stringify(ac2?.adjustments));
const m2 = await p.evaluate(async id => { const { store } = await import('/js/store.js'); const a = store.data.accounts.accounts.find(x => x.id === id); const m = store.moneyOf(a); return { gross: m.gross, funded: m.funded, balance: m.balance }; }, ac2?.id);
t('…the balance takes it, the P&L does not', m2.funded === 5000 && Math.abs(m2.balance - (100000 + m2.gross + 5000)) < 0.01 && m2.gross < 1000, JSON.stringify(m2));
t('…and only the new transactions were read', SEEN.filter(s => /idrange/.test(s.path)).every(s => /from=47&/.test(s.path)), JSON.stringify(SEEN.filter(s => /idrange/.test(s.path)).map(s => s.path)));

console.log('  -- by itself, when the journal opens --');
BOOK = structuredClone(later); BOOK.trades.unshift({ id: '50', instrument: 'GBP_USD', price: '1.33000', openTime: S('2026-09-18T07:00:00Z'), initialUnits: '100000', currentUnits: '0', state: 'CLOSED',
  realizedPL: '120.0000', financing: '0', averageClosePrice: '1.33120', closeTime: S('2026-09-18T08:00:00Z') }); BOOK.last = 51;
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('.topbar'); await p.waitForTimeout(1500);
F = await files();
t('a new trade arrives without a press', !!T('50') && T('50').pair === 'GBPUSD', JSON.stringify(T('50')));
await p.evaluate(async () => { const { store } = await import('/js/store.js'); store.data.accounts.oanda.auto = false; await store.save('accounts'); });
BOOK = structuredClone(BOOK); BOOK.trades.unshift({ ...BOOK.trades[0], id: '52' }); SEEN.length = 0;
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('.topbar'); await p.waitForTimeout(1200);
t('switched off, it waits for the button', SEEN.length === 0);

console.log('  -- the Journal’s own Sync --');
await p.evaluate(async () => { const { store } = await import('/js/store.js'); await store.setActiveAccount('acc_1'); });
await p.evaluate(() => { location.hash = '#/trades'; }); await p.waitForTimeout(600);
t('the Journal has a Sync button, with OANDA’s mark and when it last ran', await p.evaluate(() => { const b = document.querySelector('.main .head .jr-sync'); return !!b && !b.hidden && !!b.querySelector('.ab-logo') && /Sync/.test(b.innerText) && /ago|just now/.test(b.innerText); }));
await p.click('.jr-sync'); await p.waitForTimeout(1500);
F = await files();
t('pressing it brings the new trade in', !!T('52'), String(F['data/trades.json'].trades.filter(x => x.oanda).length));
t('…and the top-up is not taken twice', F['data/accounts.json'].accounts.find(a => a.firm === 'oanda').adjustments.filter(x => x.kind === 'funding').length === 1);
t('…from another account it stays there, your trades still on screen', F['data/accounts.json'].activeAccountId === 'acc_1'
  && await p.evaluate(() => /USDJPY|USD\/JPY/.test(document.querySelector('.main').innerText) && /in OANDA Demo/.test(document.querySelector('#toast')?.innerText || '')));

console.log('  -- a key OANDA will not take --');
await p.unroute?.(/x/);
await ctx.unroute(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, oanda);
await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, r => r.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, body: '{"errorMessage":"Insufficient authorization to perform request."}' }));
await p.evaluate(() => { location.hash = '#/import'; }); await p.waitForTimeout(500);
await p.click('.im-oanda-go'); await p.waitForTimeout(1000);
t('it says so in plain words', await p.evaluate(() => /did not accept that key/.test(document.querySelector('#toast')?.innerText || document.body.innerText)));

t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
