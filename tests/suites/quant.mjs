/* The Lab → Quant: Minato's strategy as rules — quant.js (Version 3 and the
   older rule sets) and quant13.js (Version 1 and 2, his risk entry).
   Structure is checked on candles built to have one answer; the whole run
   is checked against the rules' invariants on real gold prices when they
   are on this machine (QUIRE_GOLD, a folder of Replay's XAU_USD .qrc files). */
import fs from 'node:fs';
import zlib from 'node:zlib';
globalThis.window ??= globalThis; globalThis.localStorage ??= { getItem: () => null, setItem() {} };
const Q = await import('../../src/js/quant.js');
const rd = await import('../../src/js/replaydata.js');
const { rolloverOf } = await import('../../src/js/candles.js');

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

/* ---------- structure ---------- */
console.log('structure');
const bar = (i, o, h, l, c) => [i * 60, o, h, l, c];
/* up to a swing high at 105 (bar 3), down to 100 (bar 6), then the break */
const base = [[100, 101, 99, 100.5], [100.5, 102, 100, 101.5], [101.5, 103, 101, 102.5], [102.5, 105, 102, 104], [104, 104.5, 102, 102.5],
  [102.5, 103, 101, 101.5], [101.5, 102, 100, 101], [101, 102.5, 100.5, 102], [102, 104, 101.5, 103.5]];
const mk = extra => [...base, ...extra].map((r, i) => bar(i, ...r));
const wick = Q.structure(mk([[103.5, 106, 103, 104.5], [104.5, 104.8, 103.5, 104], [104, 104.5, 103, 103.5]]), 60);
t('a wick past the swing high is a sweep, not a break', !wick.events.length && wick.dir[wick.dir.length - 1] === 0);
const weak = Q.structure(mk([[104.6, 106, 103.6, 105.2], [105.2, 105.5, 104, 104.5], [104.5, 105, 104, 104.2]]), 60);
t('closing past it with a body under half the candle is not a break either', !weak.events.length);
const S = Q.structure(mk([[103.5, 107, 103.4, 106.8], [106.8, 107.5, 106, 107], [107, 108, 106.5, 107.5]]), 60);
t('a full-bodied close past it breaks structure up', S.events.length === 1 && S.events[0].dir === 1 && S.events[0].level === 105);
t('   and the low that caused it is protected', S.events[0].prot.p === 100 && S.prot[S.prot.length - 1].p === 100);
const gap = Q.structure(mk([[105.5, 106, 105.2, 105.3], [105.3, 105.6, 105, 105.4], [105.4, 105.8, 105.1, 105.5]]), 60);
t('a candle that opens and closes past it after a gap has closed past it', gap.events.length === 1 && gap.events[0].dir === 1);
const ch = Q.structure(mk([[103.5, 107, 103.4, 106.8], [106.8, 107.5, 106, 107], [107, 107.2, 103, 103.5], [103.5, 104, 99, 99.2], [99.2, 99.5, 98.5, 99]]), 60);
t('a full close under the protected low turns it down', ch.events.length === 2 && ch.events[1].kind === 'choch' && ch.events[1].dir === -1);
t('   with the high that caused it protected', ch.prot[ch.prot.length - 1].p === 107.5);

/* ---------- a run on real gold ---------- */
const DIR = process.env.QUIRE_GOLD || '/mnt/user-data/uploads/prices/XAU_USD';
if (!fs.existsSync(DIR)) { console.log(`\n${pass} passed, ${fail} failed`); console.log('skipped — no XAU_USD prices on this machine for the full run'); process.exit(fail ? 1 : 0); }
console.log('two years of gold');
const rows = [];
/* the last 25 months — what the page reads, and what every version was first measured on — however much more is downloaded */
const MONTHS = fs.readdirSync(DIR).filter(f => f.endsWith('.qrc')).sort().slice(-25);
for (const f of MONTHS) {
  let u8 = fs.readFileSync(DIR + '/' + f);
  if (u8[0] === 0x1f && u8[1] === 0x8b) u8 = zlib.gunzipSync(u8);
  for (const r of rd.decodeMonth(new Uint8Array(u8.buffer, u8.byteOffset, u8.byteLength)).rows) rows.push(r);
}
const R = Q.backtest(rows), T = R.trades;
t('it takes trades', T.length > 10, T.length);
t('the same prices give the same trades', JSON.stringify(Q.backtest(rows).trades.map(x => [x.openT, x.r])) === JSON.stringify(T.map(x => [x.openT, x.r])));
t('never more than 1R lost — unless the market opened past the stop (a gap), and then filled at that open', T.every(x => x.r >= -1 - 1e-9 || (x.gap && x.exit === rows.find(r => r[0] === x.closeT)[1])));
t('every trade had at least 1.5R to its target', T.every(x => x.rr >= 1.5 - 1e-9));
t('wins are worth exactly their planned R, break-evens nothing, stops 1R (gaps aside)', T.every(x => x.why === 'tp' ? Math.abs(x.r - x.rr) < 1e-6 : x.why === 'be' ? Math.abs(x.r) < 1e-9 || (x.gap && x.r < 0) : x.r === -1 || x.gap));
t('break-even only once the close that broke the 5m swing was in profit', T.filter(x => x.be).every(x => { const b = R.frames[5].bars.find(q => q[0] + 300 === x.be.t); return b && (x.dir > 0 ? b[4] > x.entry : b[4] < x.entry); }));
t('the target formed before the first sweep', T.every(x => x.tpT < x.s1.t));
t('the stop sits beyond every sweep', T.every(x => (x.dir > 0 ? x.sl < x.sweepX && x.sl < x.s1.p && x.sl < x.s2.p : x.sl > x.sweepX && x.sl > x.s1.p && x.sl > x.s2.p)));
t('the double confirmation comes in order: sweep, re-sweep, rejection, entry', T.every(x => x.s1.t < x.s2.t && x.s2.t <= x.rej.t && x.rej.t < x.openT));
t('the double confirmation is at least 12 entry candles from its first low to the sweep', T.every(x => x.s2.i - x.s1.i >= 12));
t('one trade at a time', T.every((x, i) => !i || x.openT > T[i - 1].closeT));
t('nothing opened around the 5pm New York close', T.every(x => { const a = rolloverOf(x.openT); return x.openT - a >= 3600 && a + 86400 - x.openT >= 1800; }));
t('pro-trend: every long while the 15m was up, every short while it was down', T.every(x => {
  const F = R.frames[15]; let k = -1; for (let i = 0; i < F.bars.length && F.bars[i][0] + 900 <= x.openT; i++) k = i; return F.dir[k] === x.dir; }));
t('break-even only after the entry', T.every(x => !x.be || (x.be.t > x.openT && x.be.t <= x.closeT + 60)));
const S2 = Q.stats(T);
const RW = Q.backtest(rows, { htf: true, htfK: 5 });
t('4H windows: every trade against the 15m sits inside a 4H NC window its way', RW.trades.filter(x => x.via === '4H NC').every(x => RW.windows.some(w => w.d === x.dir && w.from <= x.openT && x.openT < w.to + 60)) && RW.trades.some(x => x.via === '4H NC'));
t('   a window opens on a sweep without a full close past the swing', RW.windows.every(w => (w.d > 0 ? w.x < w.swept.p : w.x > w.swept.p)));
const RS = Q.backtest(rows, { sessions: [[420, 720], [780, 1020]], maxPerDay: 3, dayLossR: 3 });
const mins = t => Math.floor(((t + 8 * 3600) % 86400) / 60), dayK = t => Math.floor((t + 8 * 3600) / 86400);
t('sessions: every trade opens in Pre-Asia, Asia, Pre-London or London (UTC+8)', RS.trades.length > 50 && RS.trades.every(x => { const m = mins(x.openT); return (m >= 420 && m < 720) || (m >= 780 && m < 1020); }));
const perDay = {}; for (const x of RS.trades) (perDay[dayK(x.openT)] ||= []).push(x.r);
t('   at most 3 a day, and none after −3R that day', Object.values(perDay).every(a => a.length <= 3 && a.slice(0, -1).reduce((p, r) => p + r, 0) > -3 - 1e-9));
/* the older rule sets, still the engine behind Version 3 and any copy of it: Version 8's 1m confirmation, the stop past the protected level, a fixed 1.5R */
const VV0 = await import('../../src/js/quantversions.js');
const OLD = { v5: { pickR: true, reentry: 2, divAll: true }, v8: { pickR: true, reentry: 2, tier3: false, dcBars: 40, confirm: true, stopLevel: true, fixedR: 1.5 } };
OLD.v10 = { ...OLD.v8, confirmMins: 120, int15Agree: true }; OLD.v11 = { ...OLD.v10, h1Agree: true };
const optOld = id => VV0.optionsOf({ settings: { ...VV0.BASE, ...OLD[id] } });
const R8 = Q.backtest(rows, optOld('v8')), T8 = R8.trades, S8 = Q.stats(T8);
t('Version 8: the double confirmation is at least 40 entry candles', T8.length > 50 && T8.every(x => x.s2.i - x.s1.i >= 40), T8.length);
t('   every trade waited for its 1m internal break: the swing it broke was made before the entry, and it opened after the rejection candle', T8.every(x => x.conf && x.conf.t < x.openT && x.rej.t < x.openT && x.conf.t >= x.s1.t));
t('   the stop sits past the protected level and the sweep', T8.every(x => (x.dir > 0 ? x.sl < x.level.p && x.sl < x.sweepX : x.sl > x.level.p && x.sl > x.sweepX)));
t('   wins are exactly 1.5R, losses 1R, break-evens nothing (gaps aside)', T8.every(x => x.fixed && (x.why === 'tp' ? Math.abs(x.r - 1.5) < 1e-6 : x.gap || (x.why === 'be' ? Math.abs(x.r) < 1e-9 : x.r === -1))));
t('   one trade at a time, break-even only after the entry, the old versions untouched', T8.every((x, i) => (!i || x.openT > T8[i - 1].closeT) && (!x.be || x.be.t > x.openT)) && !T.some(x => x.conf || x.fixed));
t('   a win rate of 40–50% or better, in both years', [T8.filter(x => x.openT < 1759276800), T8.filter(x => x.openT >= 1759276800)].every(a => Q.stats(a).winRate >= 0.4), (S8.winRate * 100).toFixed(0) + '%');
const R10 = Q.backtest(rows, optOld('v10')), T10 = R10.trades;
const R11 = Q.backtest(rows, optOld('v11')), T11 = R11.trades;
const dirOf = (S, t) => { let k = -1; for (let i = 0; i < S.bars.length && S.bars[i][0] + S.size <= t; i++) k = i; return k < 0 ? 0 : S.dir[k]; };
const H1 = Q.structure((await import('../../src/js/candles.js')).aggregate(rows, 60), 3600, { K: 2 });
t('Version 10: the 15m internal structure pointed the trade\'s way at every rejection close', T10.length > 50 && T10.every(x => dirOf(R10.frames.int15, x.rej.t + (x.etf * 60)) === x.dir), T10.length);
t('Version 11: and the 1H too', T11.length > 30 && T11.every(x => dirOf(H1, x.rej.t + (x.etf * 60)) === x.dir && dirOf(R11.frames.int15, x.rej.t + (x.etf * 60)) === x.dir), T11.length);
t('   both at 40%+ won in each year', [T10, T11].every(T => [T.filter(x => x.openT < 1759276800), T.filter(x => x.openT >= 1759276800)].every(a => Q.stats(a).winRate >= 0.4)));
const V3 = VV0.BUILTIN.find(v => v.id === 'q3');
const R12 = Q.backtest(rows, VV0.optionsOf(V3)), T12 = R12.trades;
t('Version 3 (A+ 1H): timeframes ×4 — structure on 1H and 20m, entries on 12m and 20m candles', T12.length > 5 && T12.every(x => [12, 20].includes(x.etf) && [20, 60].includes(x.tf) && x.rej.t % (x.etf * 60) === 0), T12.length);
t('   its divergence rule is "at least 3 of 4", and the old rule sets are untouched by the scale', VV0.optionsOf(V3).divAll === 3 && optOld('v5').divAll === 4 && T.every(x => [3, 5].includes(x.etf)));
t('the figures add up', Math.abs(S2.total - T.reduce((a, x) => a + x.r, 0)) < 1e-9 && S2.won + S2.lost + S2.be === T.length);
console.log(`  ${T.length} trades · ${S2.total.toFixed(1)}R · PF ${S2.pf.toFixed(2)}`);

/* ---------- Version 1 and 2: the risk entry (quant13.js) ---------- */
console.log('Version 1 and 2 — the risk entry');
const E13 = await import('../../src/js/quant13.js');
const T13 = await import('../../src/js/quant10.js');
const P13 = E13.prepare13(rows);
const V1 = VV0.BUILTIN.find(v => v.id === 'q1'), V2 = VV0.BUILTIN.find(v => v.id === 'q2');
const { engine: _e1, ...o1 } = VV0.optionsOf(V1), { engine: _e2, ...o2 } = VV0.optionsOf(V2);
const A1 = E13.run13(P13, 'XAU_USD', o1).trades, A2 = E13.run13(P13, 'XAU_USD', o2).trades;
t('Version 1 takes risk entries only, at MTF levels', A1.length > 10 && A1.every(x => x.kind === 'risk' && ['IPL', 'PL'].includes(x.level.src)), A1.length);
t('   each for a reason: empty space behind the level, or divergence on 3+ of 4', A1.every(x => /empty space|divergence [34]\/4/.test(x.because)));
t('   the stop past the sweep, every target 1.5R or more, wins worth exactly their planned R', A1.every(x => (x.dir > 0 ? x.sl < x.sweepX : x.sl > x.sweepX) && x.rr >= 1.5 - 1e-9 && (x.why !== 'tp' || Math.abs(x.r - x.rr) < 1e-6)));
t('   the DC in order — reaction low, sweep, rejection, entry — and one trade at a time', A1.every((x, i) => x.s1.t < x.s2.t && x.s2.t <= x.rej.t && x.rej.t < x.openT && (!i || x.openT > A1[i - 1].closeT)));
t('   never more than 1R lost (unless the market opened past the stop — then at that open), nothing opened around the 5pm New York close', A1.every(x => (x.r >= -1 - 1e-9 || (x.gap && x.exit === rows.find(r => r[0] === x.closeT)[1])) && (() => { const a = rolloverOf(x.openT); return x.openT - a >= 3600 && a + 86400 - x.openT >= 1800; })()));
t('   the same prices give the same trades', JSON.stringify(E13.run13(P13, 'XAU_USD', o1).trades.map(x => [x.openT, x.r])) === JSON.stringify(A1.map(x => [x.openT, x.r])));
const inWin = t => E13.OPENS.some(([tz, open]) => { const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t * 1000)); const m = +f.find(p => p.type === 'hour').value * 60 + +f.find(p => p.type === 'minute').value; return m >= open - 60 && m < open + 60; });
const perSess = {}; for (const x of A2) perSess[x.session] = (perSess[x.session] || 0) + 1;
t('Version 2 (3SL): every trade opens within an hour of the Tokyo, London or New York open', A2.length > 3 && A2.every(x => x.session && inWin(x.openT)), A2.length);
t('   at most one a session, and fewer trades than Version 1', Object.values(perSess).every(n => n === 1) && A2.length < A1.length);
t('   the windows keep each market\'s own clock (London 8:00 is 07:00 UTC in summer, 08:00 in winter)', E13.sessionOf(Date.parse('2026-06-10T06:30:00Z') / 1000)?.startsWith('London') && !E13.sessionOf(Date.parse('2026-01-14T06:30:00Z') / 1000)?.startsWith('London') && E13.sessionOf(Date.parse('2026-01-14T07:30:00Z') / 1000)?.startsWith('London'));
/* ten years, a year at a time */
const plan = T13.planYears(MONTHS.map(f => f.slice(0, 7)));
t('ten years: the years follow on, each with its warm-up before it', plan.length >= 2 && plan.every((y, i) => !i || y.keepFrom === plan[i - 1].keepTo) && plan.every(y => y.months[0] < new Date(y.keepFrom * 1000).toISOString().slice(0, 7)), plan.map(y => y.year).join(','));
const days = T13.dailyOf(rows, rolloverOf), vs = T13.volSurface(days);
t('   the volatility surface: a value for every lookback at every month end, all of them sane', vs.dates.length >= 3 && vs.z.every(r => r.length === T13.LOOKBACKS.length && r.every(v => v > 1 && v < 200)), `${vs.dates.length} months`);
const hy = T13.holdYearly(days.map(d => [d[0], d[1], d[4]]));
t('   buy and hold, a year: from its first open to its last close', [...hy.values()].every(v => Number.isFinite(v)) && hy.size >= 2);

/* ---------- the page ---------- */
console.log('the page');
const pw = (await import('playwright')).default;
const FAKE_FS = fs.readFileSync(new URL('./e2e.mjs', import.meta.url).pathname, 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
const files = MONTHS.map(f => [f, fs.readFileSync(DIR + '/' + f).toString('base64')]);
const months = Object.fromEntries(files.map(([f]) => [f.slice(0, 7), { complete: true, at: '2026-10-09T00:00:00Z' }]));
const b = await pw.chromium.launch({ executablePath: process.env.QUIRE_CHROMIUM || undefined });
const p = await b.newPage({ viewport: { width: 1680, height: 1050 } });
await p.emulateMedia({ reducedMotion: 'reduce' });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([['data/accounts.json', JSON.stringify({ version: 2, theme: 'dark', accounts: [{ id: 'a', name: 'A', balance: 100000, defaultRiskPercent: 1 }], activeAccountId: 'a' })]]));
});
await p.addInitScript(FAKE_FS);
await p.addInitScript(() => { window.__long = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch { /* no long-task timing */ } });
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 10000 });
await p.evaluate(({ files, months }) => {
  window.__files.set('replay/prices/index.json', JSON.stringify({ version: 1, pairs: { XAU_USD: { months } } }));
  for (const [f, b64] of files) { const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); window.__files.set('replay/prices/XAU_USD/' + f, new Blob([u8])); }
}, { files, months });
await p.evaluate(async () => { (await import('/js/replaydata.js')).forgetIndex(); location.hash = '#/lab/quant'; });
const shown = await p.waitForSelector('.qt-tiles', { timeout: 60000 }).then(() => true, () => false);
t('it runs in the app on the downloaded prices', shown);
const tiles = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.qt-tile')].map(n => [n.querySelector('.rp-k').textContent, n.querySelector('.rp-tv').textContent])));
t('   Version 1 open, the same trades as the engine', tiles.Trades === String(A1.length), JSON.stringify(tiles));
await p.evaluate(() => document.querySelector('.qt-li[data-id="1"]').click()); await p.waitForTimeout(700);
t('picking a trade draws it on its own chart', await p.evaluate(() => /Trade 1 ·/.test(document.querySelector('.qt-side h2').textContent) && !!document.querySelector('.qt-side canvas')));
/* versions */
const vers = await p.evaluate(() => [...document.querySelectorAll('.qt-ver option')].map(o => o.textContent));
t('three built-in versions, Version 1 open', vers.join('|') === 'Version 1 · Risk entries|Version 2 · Risk entries · 3SL|Version 3 · A+ 1H' && await p.$eval('.qt-ver', s => s.selectedOptions[0].textContent) === 'Version 1 · Risk entries', vers.join('|'));
const VV = await import('../../src/js/quantversions.js');
t('a version\'s prompt is its rules in words, from its own settings', /risk entry/.test(VV.BUILTIN[0].prompt) && !/3SL:/.test(VV.BUILTIN[0].prompt) && /3SL:/.test(VV.BUILTIN[1].prompt) && VV.BUILTIN[2].prompt.includes(`swings ${VV.BUILTIN[2].settings.KX} candles either side`) && /Divergence required/.test(VV.BUILTIN[2].prompt));
t('an old pick (Version 12) opens Version 1', VV.currentOf({ quant: { current: 'v12' } }).id === 'q1');
await p.waitForFunction(() => document.querySelectorAll('.qt-crow:not(.is-head) .qt-wait').length === 0, null, { timeout: 300000 });
const cmp = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.qt-crow:not(.is-head)')].map(r => [r.children[0].textContent, r.children[1].textContent])));
const longest = await p.evaluate(() => Math.max(0, ...window.__long));
t('the page never freezes while every version runs: the runs happen beside it (no task over 1.5 s)', longest < 1500, `${Math.round(longest)} ms longest`);
t('every version is run on the same prices and compared', Object.keys(cmp).length === 3 && cmp['Version 1 · Risk entries'] === String(A1.length) && cmp['Version 2 · Risk entries · 3SL'] === String(A2.length) && cmp['Version 3 · A+ 1H'] === String(T12.length), JSON.stringify(cmp));
await p.click('.qt-new'); await p.waitForSelector('.qt-tiles', { timeout: 60000 }); await p.waitForTimeout(300);
const made = await p.evaluate(() => ({ name: document.querySelector('.qt-version h2').textContent, open: document.querySelector('.qt-more').open,
  saved: JSON.parse(window.__files.get('data/lab.json') || '{}').quant?.versions?.map(v => v.name) }));
t('New version makes Version 4 from the one open, saved in the vault, its settings showing', made.name === 'Version 4' && made.open && made.saved?.join() === 'Version 4', JSON.stringify(made));
const before = await p.$eval('.qt-tile .rp-tv', n => n.textContent);
await p.fill('.qt-knob[data-k="isoAtr"] input', '1'); await p.press('.qt-knob[data-k="isoAtr"] input', 'Tab');
await p.waitForFunction(b => { const n = document.querySelector('.qt-tile .rp-tv'); return n && n.textContent !== b; }, before, { timeout: 60000 }).catch(() => {});
const after = await p.evaluate(() => ({ total: document.querySelector('.qt-tile .rp-tv').textContent, prompt: document.querySelector('.qt-prompt').value,
  saved: JSON.parse(window.__files.get('data/lab.json') || '{}').quant?.versions?.[0]?.settings?.isoAtr }));
t('turning a setting runs it again, rewrites its prompt and saves it', after.total !== before && /no other MTF level within 1 ATR/.test(after.prompt) && after.saved === 1, JSON.stringify({ before, ...after, prompt: undefined }));
await p.selectOption('.qt-ver', 'q3'); await p.waitForSelector('.qt-tiles', { timeout: 60000 }); await p.waitForTimeout(300);
t('a built-in version shows its settings but cannot be changed', await p.evaluate(() => [...document.querySelectorAll('.qt-knob input, .qt-knob button')].every(x => x.disabled) && document.querySelector('.qt-prompt').readOnly && !document.querySelector('.qt-del')));
/* ten years, every year, volatility */
await p.waitForFunction(() => { const n = document.querySelector('.q10-panel[data-inst="XAU_USD"] .q10-ph'); return n && /^XAUUSD\d+ years$/.test(n.textContent); }, null, { timeout: 300000 }).catch(() => {});
const ten = await p.evaluate(() => ({ head: document.querySelector('.q10-panel[data-inst="XAU_USD"] .q10-ph')?.textContent, lines: document.querySelectorAll('.q10-panel[data-inst="XAU_USD"] .q10-line').length, ends: [...document.querySelectorAll('.q10-panel[data-inst="XAU_USD"] .q10-endlab')].map(n => n.textContent) }));
t('Ten years: the pair, every version as a line, its total at the end', /years$/.test(ten.head || '') && ten.lines === 3 && ten.ends.length === 3, JSON.stringify(ten));
const yb = await p.evaluate(() => ({ bars: document.querySelectorAll('.q10-years .q10-bar').length, chips: [...document.querySelectorAll('.q10:nth-of-type(n) .q10-chips .chip')].map(c => c.textContent) }));
t('Every year: four bars a year — the three versions and buy & hold', yb.bars > 0 && yb.bars % 4 === 0, JSON.stringify(yb));
const vol = await p.$('.q10-3d canvas');
t('Volatility: a surface on a canvas', !!vol);
if (vol) {
  await vol.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  const shot1 = await vol.screenshot();
  const bb = await vol.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.move(bb.x + bb.width / 2 + 160, bb.y + bb.height / 2 + 90, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(300);
  const shot2 = await vol.screenshot();
  t('   dragging turns it', !shot1.equals(shot2));
  await p.focus('.q10-3d'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(200);
  t('   and so do the arrow keys', !(await vol.screenshot()).equals(shot2));
}
t('no page errors', !errs.length, errs.join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
