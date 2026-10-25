/* Replay, part one: the prices.

   Two years of OANDA one-minute candles per pair, downloaded once into the
   vault as one compact file a month. OANDA is faked (oanda-mock.mjs): the
   same seeded prices every run, and every request it receives is counted,
   so the suite can tell a month asked for from a month read from disk.

   By hand first — the file format round-trips every price exactly, the
   month is split into requests OANDA will answer, the two years are the
   right months — then the page: no key, a download, its progress, what it
   saved, asking again, a day later, stopping, removing, OANDA down. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB } from '../fixtures/ghost-fixture.mjs';
import { KEY, SERIES, rowsOf, oandaRoute } from '../fixtures/oanda-mock.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const NOW = new Date('2026-09-20T12:00:00+08:00');          // Sunday 04:00 UTC, inside the mock's prices
const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Australia/Perth' });
const SEEN = [], STATE = { mode: 'ok' };
const answer = oandaRoute(SEEN, STATE);
await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, async route => {
  if (STATE.slow) await new Promise(r => setTimeout(r, STATE.slow));          // slow enough to press Stop
  return answer(route);
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_|net::|401|internetdisconnected/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(NOW);
await p.addInitScript(({ ACCT, PB }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: 'R', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: [] })], ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, PB });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 300) => p.waitForTimeout(ms);
const go = async (h, ms = 500) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };

/* ===================== by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async () => {
  const R = await import('/js/replaydata.js');
  /* a random walk with real decimals: gold to 3, the pound to 5, the Nasdaq to 1 */
  let a = 3; const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const walk = (base, step, dp, n, t0) => { const out = []; let c = base;
    for (let i = 0; i < n; i++) { const o = c; c = +(o + (rnd() - .5) * step).toFixed(dp);
      out.push([t0 + i * 60 + (i > 500 ? 3600 : 0), o, +(Math.max(o, c) + rnd() * step / 2).toFixed(dp), +(Math.min(o, c) - rnd() * step / 2).toFixed(dp), c]); }
    return out; };
  const t0 = Date.UTC(2026, 7, 3) / 1000;
  const trip = async (rows, inst) => { const raw = R.encodeMonth(inst, '2026-08', rows, true);
    const zipped = await R.pack(raw), back = R.decodeMonth(await R.unpack(zipped));
    return { same: JSON.stringify(back.rows) === JSON.stringify(rows), head: back.head, raw: raw.length, zipped: zipped.length, n: rows.length }; };
  const gold = await trip(walk(4140.52, 1.2, 3, 30000, t0), 'XAU_USD');
  const gbp = await trip(walk(1.27315, 0.0004, 5, 3000, t0), 'GBP_USD');
  const nas = await trip(walk(24100.5, 9, 1, 3000, t0), 'NAS100_USD');
  const empty = await trip([], 'XAU_USD');
  const chunks = R.chunksOf('2026-08', Date.UTC(2026, 9, 1) / 1000);
  const minutes = new Set(); for (const [f, to] of chunks) for (let s = f; s < to; s += 60) minutes.add(s);
  let missed = 0, sats = 0;
  for (let s = Date.UTC(2026, 7, 1) / 1000; s < Date.UTC(2026, 8, 1) / 1000; s += 60) {
    const sat = new Date(s * 1000).getUTCDay() === 6;
    if (sat && minutes.has(s)) sats++;
    if (!sat && !minutes.has(s)) missed++;
  }
  const part = R.chunksOf('2026-09', Date.UTC(2026, 8, 20, 4, 0, 30) / 1000);
  return { gold, gbp, nas, empty, longest: Math.max(...chunks.map(([f, to]) => to - f)) / 60, missed, sats,
    partEnd: part[part.length - 1][1], months: R.monthsWanted(Date.UTC(2026, 8, 20) / 1000) };
});
t('gold to 3 decimals comes back exactly', H.gold.same && H.gold.head.dp === 3, JSON.stringify(H.gold.head));
t('the pound to 5 decimals, the Nasdaq to 1, exactly', H.gbp.same && H.gbp.head.dp === 5 && H.nas.same && H.nas.head.dp === 1);
t('an empty month is a valid file', H.empty.same && H.empty.head.n === 0);
t('a month of gold is small: under 8 bytes a candle after packing', H.gold.zipped / H.gold.n < 8, `${(H.gold.zipped / H.gold.n).toFixed(2)} bytes a candle · ${(H.gold.zipped / 1e3).toFixed(0)} KB for ${H.gold.n} candles`);
t('requests of at most three days — OANDA gives 5,000 candles, three days is 4,320', H.longest <= 3 * 1440, String(H.longest));
t('every minute of the month asked for, except Saturdays', H.missed === 0 && H.sats === 0, `${H.missed} missed · ${H.sats} Saturday minutes asked`);
t('this month stops at the minute we are in', H.partEnd === Date.UTC(2026, 8, 20, 4, 0) / 1000, String(H.partEnd));
t('two years: September 2024 to September 2026, 25 months', H.months.length === 25 && H.months[0] === '2024-09' && H.months[24] === '2026-09', H.months.join(','));

/* ===================== the page, no key ===================== */
console.log('the page');
await go('#/replay', 700);
t('Replay is the new page — the CSV comparison is gone', await p.evaluate(() => document.querySelector('.head h1')?.textContent === 'Replay' && !document.querySelector('input[type=file]')));
await go('#/replay/data', 700);
t('…its price data on Replay → Data', await p.evaluate(() => document.querySelector('.head h1')?.textContent === 'Data' && !!document.querySelector('.rp-data')));
t('no OANDA key: it says where to add one, and nothing can be downloaded', /Add your OANDA key/.test(await p.evaluate(() => document.querySelector('.rp-nokey')?.textContent || ''))
  && await p.evaluate(() => [...document.querySelectorAll('.rp-chip')].every(b => b.disabled)));
t('the usual pairs are offered', await p.evaluate(() => [...document.querySelectorAll('.rp-chip')].map(b => b.textContent).join()) === 'XAUUSD,NAS100,AUDUSD,USDJPY,EURUSD,NZDUSD,GBPUSD');

/* ===================== a download ===================== */
await p.evaluate(k => localStorage.setItem('quire:setting:oandaKey', k), KEY);
await p.evaluate(async () => { const m = await import('/js/views/replay.js'); });
await go('#/dashboard', 200); await go('#/replay/data', 600);
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('.topbar'); await go('#/replay/data', 700);
t('with a key the pairs can be downloaded', await p.evaluate(() => !document.querySelector('.rp-nokey') && [...document.querySelectorAll('.rp-chip')].every(b => !b.disabled)));
SEEN.length = 0;
await p.click('.rp-chip[data-inst="XAU_USD"]');
await p.waitForSelector('.rp-row[data-inst="XAU_USD"] .rp-prog', { timeout: 5000 }).catch(() => {});
const sawProgress = await p.evaluate(() => !!document.querySelector('.rp-row[data-inst="XAU_USD"] .rp-prog'));
await p.waitForFunction(() => /Up to date/.test(document.querySelector('.rp-row[data-inst="XAU_USD"]')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
t('it shows progress while it downloads', sawProgress);
const row = await p.evaluate(() => [...document.querySelectorAll('.rp-row[data-inst="XAU_USD"] > span')].map(s => s.textContent));
t('then the row: XAUUSD, 25 of 25 months, Sep 2024 – Sep 2026, its size, up to date', row[0] === 'XAUUSD' && row[1] === '25 of 25' && row[2] === 'Sep 2024 – Sep 2026' && /KB|MB/.test(row[3])
  && /Up to date/.test(await p.evaluate(() => document.querySelector('.rp-row[data-inst="XAU_USD"]').textContent)), JSON.stringify(row));
const asked = SEEN.filter(x => /XAU_USD/.test(x.path));
t('every request is one-minute mid prices, three days at most, with the key', asked.length > 100 && asked.every(x => x.q.granularity === 'M1' && x.q.price === 'M' && +x.q.to - +x.q.from <= 3 * 86400 && x.auth === `Bearer ${KEY}`), String(asked.length));
const D = await p.evaluate(async () => {
  const R = await import('/js/replaydata.js');
  R.forgetIndex();
  const ix = await R.readIndex(), m = ix.pairs.XAU_USD.months;
  const sep = await R.readMonth('XAU_USD', '2026-09'), aug = await R.readMonth('XAU_USD', '2026-08');
  const span = await R.candlesBetween('XAU_USD', Date.UTC(2026, 8, 14) / 1000, Date.UTC(2026, 8, 16) / 1000);
  return { months: Object.keys(m).length, sepComplete: m['2026-09'].complete, augComplete: m['2025-08'].complete, sepN: sep.length, augN: aug.length,
    sep: sep.slice(0, 3), sepLast: sep[sep.length - 1], span: span.length, spanFirst: span[0], spanLast: span[span.length - 1],
    files: [...window.__files.keys()].filter(k => k.startsWith('replay/prices/XAU_USD/')).length };
});
const MS = Date.UTC(2026, 8, 1) / 1000, NOWS = NOW.getTime() / 1000;
const want = rowsOf('XAU_USD', MS, Math.floor(NOWS / 60) * 60);
t('one file a month in the vault, 25 of them, and the index', D.files === 25 && D.months === 25, `${D.files} files`);
t('a past month is saved as complete; this month is not', D.augComplete && !D.sepComplete);
t('September read back is exactly OANDA’s candles, every one', D.sepN === want.length && JSON.stringify(D.sep) === JSON.stringify(want.slice(0, 3)) && JSON.stringify(D.sepLast) === JSON.stringify(want[want.length - 1]),
  `${D.sepN} vs ${want.length}`);
const wantSpan = rowsOf('XAU_USD', Date.UTC(2026, 8, 14) / 1000, Date.UTC(2026, 8, 16) / 1000);
t('any stretch of time reads back in order', D.span === wantSpan.length && JSON.stringify(D.spanFirst) === JSON.stringify(wantSpan[0]) && JSON.stringify(D.spanLast) === JSON.stringify(wantSpan[wantSpan.length - 1]), `${D.span} vs ${wantSpan.length}`);
await p.screenshot({ path: OUT + '/replay-data.png' });

/* asked again straight away: nothing to fetch */
SEEN.length = 0;
const n0 = await p.evaluate(async k => (await import('/js/replaydata.js')).downloadPair('XAU_USD', { key: k, live: false }), KEY);
t('asked again: nothing is fetched — every month is saved', n0 === 0 && SEEN.length === 0, `${n0} months · ${SEEN.length} requests`);
/* every chart in the app reads a downloaded day from here: one copy, no request */
SEEN.length = 0;
const CH = await p.evaluate(async k => {
  const C = await import('/js/candles.js'), { store } = await import('/js/store.js');
  C.forgetCandles();
  const cred = { key: k, live: false };
  const past = await C.loadDay(store, 'XAU_USD', '2026-09-15', cred);
  const dayFile = await store.readJSON('candles/XAU_USD/2026-09-15.json', null);
  const today = await C.loadDay(store, 'XAU_USD', '2026-09-20', cred);
  const other = await C.loadDay(store, 'NAS100_USD', '2026-09-15', cred);
  return { n: past.length, first: past[0], last: past.at(-1), dayFile: !!dayFile, today: today.length, other: other.length };
}, KEY);
const want15 = rowsOf('XAU_USD', Date.UTC(2026, 8, 15) / 1000, Date.UTC(2026, 8, 16) / 1000);
const asked15 = SEEN.filter(x => /XAU_USD/.test(x.path) && +x.q.from < Date.UTC(2026, 8, 16) / 1000 && +x.q.to > Date.UTC(2026, 8, 15) / 1000).length;
t('a chart asking for a downloaded day reads it from the download: the same candles, no request, no second copy',
  CH.n === want15.length && JSON.stringify(CH.first) === JSON.stringify(want15[0]) && JSON.stringify(CH.last) === JSON.stringify(want15.at(-1)) && asked15 === 0 && !CH.dayFile, JSON.stringify([CH, asked15]));
t('…today, and pairs not downloaded, still come from OANDA', CH.other > 0 && SEEN.some(x => /XAU_USD/.test(x.path) && +x.q.to > Date.UTC(2026, 8, 20) / 1000) && SEEN.some(x => /NAS100_USD/.test(x.path)), JSON.stringify(SEEN.map(x => x.path)));
/* a day and a bit later: only this month, again */
SEEN.length = 0;
const n1 = await p.evaluate(async k => (await import('/js/replaydata.js')).downloadPair('XAU_USD', { key: k, live: false }, { now: Date.parse('2026-09-21T06:00:00Z') / 1000 }), KEY);
t('a day later only this month is fetched again', n1 === 1 && SEEN.every(x => +x.q.from >= Date.UTC(2026, 8, 1) / 1000), `${n1} months · ${SEEN.length} requests`);
/* two days on: a chart wants a day the download does not reach — the download grows, from its last candle */
SEEN.length = 0;
const GW = await p.evaluate(async k => {
  const C = await import('/js/candles.js'), R = await import('/js/replaydata.js'), { store } = await import('/js/store.js');
  C.forgetCandles();
  const before = (await R.readIndex()).pairs.XAU_USD.months['2026-09'].n;
  const now = Date.parse('2026-09-22T06:00:00Z') / 1000;
  const rows = await C.loadDay(store, 'XAU_USD', '2026-09-21', { key: k, live: false }, now);
  const after = (await R.readIndex()).pairs.XAU_USD.months['2026-09'];
  const dayFile = await store.readJSON('candles/XAU_USD/2026-09-21.json', null);
  const month = await R.readMonth('XAU_USD', '2026-09');
  const ts = month.map(r => r[0]);
  return { n: rows.length, first: rows[0], before, after: after.n, at: after.at, dayFile: !!dayFile, sorted: ts.every((t, i) => !i || t > ts[i - 1]) };
}, KEY);
const want21 = rowsOf('XAU_USD', Date.UTC(2026, 8, 21) / 1000, Date.UTC(2026, 8, 22) / 1000);
const firstAsk = Math.min(...SEEN.filter(x => /XAU_USD/.test(x.path)).map(x => +x.q.from));
t('a chart wanting a day after the last update: the download grows to now — only the candles after its last one asked for — and the day is read from it',
  GW.n === want21.length && JSON.stringify(GW.first) === JSON.stringify(want21[0]) && firstAsk >= Date.UTC(2026, 8, 18, 20, 0) / 1000 && GW.after > GW.before && GW.at === '2026-09-22T06:00:00.000Z' && !GW.dayFile && GW.sorted,
  JSON.stringify([GW, new Date(firstAsk * 1000).toISOString(), SEEN.length]));

/* stopping halfway keeps what was saved */
SEEN.length = 0; STATE.slow = 25;
await p.click('.rp-chip[data-inst="NAS100_USD"]');
await p.waitForFunction(() => /\b[3-9] of \d+ months|1\d of \d+ months/.test(document.querySelector('.rp-row[data-inst="NAS100_USD"] .rp-prog')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
await p.click('.rp-row[data-inst="NAS100_USD"] .rp-prog .btn'); await settle(800); STATE.slow = 0;
const stopped = await p.evaluate(() => document.querySelector('.rp-row[data-inst="NAS100_USD"]')?.textContent || '');
const nasMonths = await p.evaluate(async () => Object.keys((await (await import('/js/replaydata.js')).readIndex()).pairs.NAS100_USD?.months || {}).length);
t('Stop halts it; the months already saved stay, the rest are still to get', nasMonths > 0 && nasMonths < 25 && /months? to get/.test(stopped) && /Update/.test(stopped), `${nasMonths} months · ${stopped.slice(0, 80)}`);

/* OANDA unreachable: the row says so */
STATE.mode = 'down';
await p.click('.rp-row[data-inst="NAS100_USD"] .rp-get');
await p.waitForSelector('.rp-row[data-inst="NAS100_USD"] .rp-err', { timeout: 8000 }).catch(() => {});
t('OANDA unreachable: the row says why, in words', /Could not reach OANDA/.test(await p.evaluate(() => document.querySelector('.rp-row[data-inst="NAS100_USD"] .rp-err')?.textContent || '')));
STATE.mode = 'ok';

/* a pair typed in */
await p.fill('.rp-add-in', 'aud/usd'); await p.press('.rp-add-in', 'Enter');
await p.waitForFunction(() => /Up to date/.test(document.querySelector('.rp-row[data-inst="AUD_USD"]')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
t('a pair typed in any way ("aud/usd") is found and downloaded', /AUDUSD/.test(await p.evaluate(() => document.querySelector('.rp-row[data-inst="AUD_USD"]')?.textContent || '')));
await p.fill('.rp-add-in', 'not a pair'); await p.press('.rp-add-in', 'Enter'); await settle(200);
t('a name OANDA has no instrument for is turned away', /no instrument/.test(await p.evaluate(() => document.getElementById('toast')?.textContent || '')));

/* removing */
await p.click('.rp-row[data-inst="AUD_USD"] .rp-del'); await p.click('.rp-row[data-inst="AUD_USD"] .rp-del'); await settle(500);
const gone = await p.evaluate(async () => ({ row: !!document.querySelector('.rp-row[data-inst="AUD_USD"]'),
  files: [...window.__files.keys()].filter(k => k.startsWith('replay/prices/AUD_USD/')).length,
  ix: !!(await (await import('/js/replaydata.js')).readIndex()).pairs.AUD_USD }));
t('Remove (asked twice) deletes the pair’s files and its row', !gone.row && gone.files === 0 && !gone.ix, JSON.stringify(gone));
t('…and AUDUSD is offered again', await p.evaluate(() => !!document.querySelector('.rp-chip[data-inst="AUD_USD"]')));

/* more history: 5 years */
const W5 = await p.evaluate(async () => { const R = await import('/js/replaydata.js'); const m = R.monthsWanted(Date.UTC(2026, 8, 20) / 1000, 5); return { n: m.length, first: m[0], last: m[m.length - 1] }; });
t('five years: September 2021 to September 2026, 61 months', W5.n === 61 && W5.first === '2021-09' && W5.last === '2026-09', JSON.stringify(W5));
t('History offers 2, 5 and 10 years, 2 chosen', await p.evaluate(() => [...document.querySelectorAll('.rp-years button')].map(b => b.textContent + (b.classList.contains('is-on') ? '*' : '')).join()) === '2 years*,5 years,10 years');
await p.click('.rp-years button[data-years="5"]'); await settle(500);
const gold5 = await p.evaluate(() => document.querySelector('.rp-row[data-inst="XAU_USD"]')?.textContent || '');
t('choosing 5 years: XAUUSD now has 36 older months to get, and the vault remembers it', /25 of 61/.test(gold5) && /36 months to get/.test(gold5)
  && await p.evaluate(async () => JSON.parse(window.__files.get('replay/prices/index.json')).years === 5), gold5.slice(0, 90));
const before5 = SEEN.length;
await p.click('.rp-row[data-inst="XAU_USD"] .rp-get');
/* while it downloads, another page is left alone: not drawn again after every month */
await p.evaluate(() => { location.hash = '#/calendar'; }); await settle(300);
await p.evaluate(() => { document.querySelector('.view').dataset.mark = 'kept'; });
const months0 = await p.evaluate(async () => Object.keys((await (await import('/js/replaydata.js')).readIndex()).pairs.XAU_USD.months).length);
await settle(1500);
const bg = await p.evaluate(async () => ({ kept: document.querySelector('.view')?.dataset.mark === 'kept',
  months: Object.keys((await (await import('/js/replaydata.js')).readIndex()).pairs.XAU_USD.months).length }));
t('a download going on in the background does not redraw the page you are on', bg.kept && bg.months > months0, JSON.stringify({ months0, ...bg }));
await p.evaluate(() => { location.hash = '#/replay/data'; }); await settle(300);
await p.waitForFunction(() => /Up to date/.test(document.querySelector('.rp-row[data-inst="XAU_USD"]')?.textContent || ''), null, { timeout: 60000 }).catch(() => {});
const after5 = await p.evaluate(() => document.querySelector('.rp-row[data-inst="XAU_USD"]')?.textContent || '');
t('Update gets only the older months: 61 of 61, Sep 2021 – Sep 2026', /61 of 61/.test(after5) && /Sep 2021 – Sep 2026/.test(after5) && SEEN.slice(before5).every(x => +x.q.from < Date.UTC(2024, 8, 1) / 1000), after5.slice(0, 90));
await p.click('.rp-years button[data-years="2"]'); await settle(500);
t('back to 2 years: nothing is deleted, the row reads 25 of 25', /25 of 25/.test(await p.evaluate(() => document.querySelector('.rp-row[data-inst="XAU_USD"]')?.textContent || ''))
  && await p.evaluate(() => [...window.__files.keys()].filter(k => k.startsWith('replay/prices/XAU_USD/')).length) === 61);

t('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
