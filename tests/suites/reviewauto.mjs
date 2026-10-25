/* The weekly review, read off the chart — and three small changes to New
   trade that go with it.

   OANDA is faked (tests/fixtures/oanda-mock.mjs). Trades are placed on the
   fake prices by searching them here: a gold long that hits its target, one
   closed by hand that would have gone on to the target, one stopped out
   that then ran to where the target was. What the review should show is
   worked out here too, by a plain re-reading of the same candles, and held
   against what the page says.

   Then New trade: no category picker (it is read from the instrument), no
   mistakes or price delivery on a trade still running, no size on a
   forward test. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB } from '../fixtures/ghost-fixture.mjs';
import { KEY, rowsOf, oandaRoute } from '../fixtures/oanda-mock.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };
const near = (a, b, e = 0.011) => a != null && b != null && Math.abs(a - b) <= e;

/* ---------- placing trades on the fake prices ---------- */
const perth = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+08:00`) / 1000;
const hhmm = s => new Date((s + 8 * 3600) * 1000).toISOString().slice(11, 16);
const XAU = rowsOf('XAU_USD', Date.UTC(2026, 8, 13) / 1000, Date.UTC(2026, 8, 18, 4) / 1000);
const at = s => XAU.findIndex(r => r[0] === s);
const STOP = 3, TARGET = 4.5;                                   // 1 : 1.5, in price
/* first touch after minute index i (exclusive of nothing: i itself included) */
function firstTouch(i, entry, long = true) {
  for (let k = i; k < XAU.length; k++) {
    const [, , h, l] = XAU[k];
    const stop = long ? l <= entry - STOP : h >= entry + STOP, tgt = long ? h >= entry + TARGET : l <= entry - TARGET;
    if (stop) return { what: 'sl', k };
    if (tgt) return { what: 'tp', k };
  }
  return null;
}
function find(test) {
  for (let s = perth('2026-09-15', '15:00'); s < perth('2026-09-15', '23:00'); s += 60) {
    const i = at(s); if (i < 0) continue;
    const got = test(i, XAU[i][1]);
    if (got) return got;
  }
  return null;
}
const WIN = find((i, e) => { const f = firstTouch(i, e); return f && f.what === 'tp' && f.k - i > 20 ? { i, e, out: f.k } : null; });
const MAN = find((i, e) => {
  const x = i + 12; if (!XAU[x]) return null;
  for (let k = i; k <= x; k++) if (XAU[k][3] <= e - STOP || XAU[k][2] >= e + TARGET) return null;     // still in at the exit
  const f = firstTouch(x + 1, e);
  return f && f.what === 'tp' && XAU[x][4] > e ? { i, e, out: x, exitP: XAU[x][4], heldAt: f.k } : null;
});
const SL = find((i, e) => {
  const f = firstTouch(i, e); if (!f || f.what !== 'sl') return null;
  const until = XAU[f.k][0] + 86400;
  for (let k = f.k + 1; k < XAU.length && XAU[k][0] <= until; k++) if (XAU[k][2] >= e + TARGET) return { i, e, out: f.k, reachedAt: XAU[k][0] };
  return null;
});
const FAR = find((i, e) => {
  const f = firstTouch(i, e); if (!f || f.what !== 'sl') return null;
  let best = 0;
  for (let k = i; k <= f.k; k++) best = Math.max(best, XAU[k][2] - e);
  if (best < 3.05 || best >= TARGET) return null;
  const until = XAU[f.k][0] + 86400;
  for (let k = f.k + 1; k < XAU.length && XAU[k][0] <= until; k++) if (XAU[k][2] >= e + TARGET) return null;
  return { i, e, out: f.k };
});
if (!WIN || !MAN || !SL || !FAR) { console.log('could not place the trades on the fake prices', !!WIN, !!MAN, !!SL); process.exit(1); }

/* pips and points as the review rounds them: whole from 100, one decimal from 10, two below */
const pts = n => { const a = Math.abs(n); return a >= 100 ? Math.round(n) : a >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100; };
/* what the review should say, read plainly */
function expect(p, kind) {
  const e = p.e, risk = STOP, inT = XAU[p.i][0], outT = XAU[p.out][0];
  let heat = 0;
  for (let k = p.i; k <= p.out; k++) heat = Math.max(heat, e - XAU[k][3]);
  if (kind === 'sl') heat = risk;
  heat = Math.min(heat, risk);
  let best = 0;
  for (let k = p.i; k < XAU.length && XAU[k][0] <= outT + 86400; k++) {
    if (kind === 'sl') { if (XAU[k][0] <= outT) continue; }
    else if (XAU[k][0] > outT && XAU[k][3] <= e - risk) break;
    best = Math.max(best, XAU[k][2] - e);
  }
  /* stopped, then the target: how far past the stop first (gold in points, a point a dollar) */
  let past = null;
  if (kind === 'sl' && p.reachedAt) {
    let deepest = 0;
    for (let k = p.out; k < XAU.length && XAU[k][0] < p.reachedAt; k++) deepest = Math.max(deepest, (e - risk) - XAU[k][3]);
    past = pts(deepest);
  }
  /* the best it got your way while in — "ran before stopped out" */
  let during = 0;
  for (let k = p.i; k <= p.out; k++) during = Math.max(during, XAU[k][2] - e);
  return { heatR: +(heat / risk).toFixed(2), toStop: pts(risk - heat), availR: +(best / risk).toFixed(2), inT, outT, past, ran: +(during / risk).toFixed(2) };
}
const EW = expect(WIN, 'tp'), EM = expect(MAN, 'manual'), ES = expect(SL, 'sl'), EF = expect(FAR, 'sl');

const base = { accountId: 'acc_1', riskPercent: 1, mode: 'live', sessionId: 'ses_l', setupId: 's_fvg', tagIds: [], notes: '', status: 'closed', side: 'buy', pair: 'XAUUSD', date: '2026-09-15' };
const lvl = e => ({ entryPrice: e, stopLoss: +(e - STOP).toFixed(2), takeProfit: +(e + TARGET).toFixed(2) });
const TR = [
  { ...base, id: 'w', timeOpen: hhmm(EW.inT), timeClose: hhmm(EW.outT), ...lvl(WIN.e), exitPrice: +(WIN.e + TARGET).toFixed(2), exitReason: 'tp', netResult: 1500, mistakes: [] },
  { ...base, id: 'm', timeOpen: hhmm(EM.inT), timeClose: hhmm(EM.outT), ...lvl(MAN.e), exitPrice: MAN.exitP, exitReason: 'manual', netResult: Math.round((MAN.exitP - MAN.e) / STOP * 1000), mistakes: ['closed_early'] },
  { ...base, id: 'f', timeOpen: hhmm(EF.inT), timeClose: hhmm(EF.outT), ...lvl(FAR.e), exitPrice: +(FAR.e - STOP).toFixed(2), exitReason: 'sl', netResult: -1000, mistakes: [] },
  { ...base, id: 's', timeOpen: hhmm(ES.inT), timeClose: hhmm(ES.outT), ...lvl(SL.e), exitPrice: +(SL.e - STOP).toFixed(2), exitReason: 'sl', netResult: -1000, mistakes: [] },
];

const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Australia/Perth' });
const SEEN = [];
await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, oandaRoute(SEEN));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_|401|net::/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(new Date('2026-09-18T12:00:00+08:00'));
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
const settle = (ms = 300) => p.waitForTimeout(ms);
const go = async (h, ms = 500) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };
const disk = id => p.evaluate(id => JSON.parse(window.__files.get('data/trades.json')).trades.find(x => x.id === id), id);
const shot = async n => { try { await p.screenshot({ path: `${OUT}/reviewauto-${n}.png` }); } catch { /* */ } };

/* ===================== the reading, by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async () => {
  const P = await import('/js/tradeplay.js');
  const rows = [];
  /* a long from 100: dips to 98.5, runs to 104, comes back through 97 */
  const path = [100, 99.5, 98.5, 100, 101, 102, 101.5, 103, 104, 103, 100, 98, 96.5, 99, 106];
  path.forEach((v, i) => rows.push([600 + i * 60, v, v + 0.2, v - 0.2, v]));
  const w = { entry: 600, exit: 600 + 5 * 60 };
  const T = { entryPrice: 100, stopLoss: 97, takeProfit: 104.5, exitPrice: 102, side: 'buy', timeOpen: '10:00' };
  const man = P.measure(T, rows, w, 'manual');
  const short = P.measure({ ...T, side: 'sell', stopLoss: 103, takeProfit: 95.5, exitPrice: 99 }, rows.map(([t, o, h, l, c]) => [t, 200 - o, 200 - l, 200 - h, 200 - c]), w, 'manual');
  const both = P.measure({ ...T, takeProfit: 101.5 }, [[600, 100, 100.2, 99.8, 100], [660, 100, 101.6, 96.9, 100]], { entry: 600, exit: 600 }, 'manual');
  const sl = P.measure({ ...T, exitPrice: 97 }, rows, { entry: 600, exit: 600 + 12 * 60 }, 'sl');
  const slShort = P.measure({ ...T, side: 'sell', stopLoss: 103, takeProfit: 95.5, exitPrice: 103 }, rows.map(([t, o, h, l, c]) => [t, 200 - o, 200 - l, 200 - h, 200 - c]), { entry: 600, exit: 600 + 12 * 60 }, 'sl');
  /* stopped and never back to the target */
  const slNever = P.measure({ ...T, exitPrice: 97, takeProfit: 110 }, rows, { entry: 600, exit: 600 + 12 * 60 }, 'sl');
  return { man, short, both, sl, slShort, slNever, pips: [P.inPips(0.00123, 'AUD_USD'), P.inPips(1.25, 'XAU_USD'), P.inPips(12, 'NAS100_USD'), P.inPips(0.123, 'USD_JPY')] };
});
t('heat: the furthest it went against you while in — 1.7 of a 3 stop is 0.57R', near(H.man.heatR, 0.57), String(H.man.heatR));
t('…which is how close it came to the stop: 1.3', near(H.man.toStop, 1.3, 1e-9), String(H.man.toStop));
t('ran your way: to 104.2 before the stop was touched — 1.4R', near(H.man.availR, 1.4), String(H.man.availR));
t('held to target: the stop came first after the exit — −1R', H.man.held?.outcome === 'loss' && H.man.held.r === -1, JSON.stringify(H.man.held));
t('a short reads the same, mirrored', near(H.short.heatR, H.man.heatR) && near(H.short.availR, H.man.availR) && H.short.held?.outcome === 'loss', JSON.stringify(H.short));
t('target and stop in the same minute: the stop, to be safe', H.both.held?.outcome === 'loss', JSON.stringify(H.both.held));
t('stopped out: heat is the whole 1R, and what it did after counts', H.sl.heatR === 1 && near(H.sl.availR, (106.2 - 100) / 3) && H.sl.reachedTarget, JSON.stringify(H.sl));
t('could have made: the best it got, never past the target — 1.4R', near(H.man.couldR, 1.4), String(H.man.couldR));
t('…and the target exactly when price got there — 1.5R, however far it ran after', near(H.sl.couldR, 1.5) && near(H.sl.availR, (106.2 - 100) / 3), JSON.stringify([H.sl.couldR, H.sl.availR]));
t('past the stop: stopped at 97, down to 96.3, then on to the target — 0.7 past', near(H.sl.pastStop, 0.7, 1e-9), String(H.sl.pastStop));
t('…a short reads the same, mirrored', near(H.slShort.pastStop, 0.7, 1e-9), String(H.slShort.pastStop));
t('…and a stop that never went on to the target has none', H.slNever.pastStop === null && H.slNever.fromStop === undefined, JSON.stringify(H.slNever));
t('during the trade: the best it got while you were in — 0.73R', near(H.man.duringR, 0.73), String(H.man.duringR));
t('pips: FX 0.0001, yen 0.01; gold in points of a dollar; indices in points', JSON.stringify(H.pips.map(x => x.n + ' ' + x.unit)) === JSON.stringify(['12.3 pips', '1.25 points', '12 points', '12.3 pips']), JSON.stringify(H.pips));

/* ===================== the review, with a key ===================== */
console.log('the review');
await p.evaluate(k => { localStorage.setItem('quire:setting:oandaKey', k); }, KEY);
await go('#/review', 700);
const pick = async id => {
  const at = TR.find(x => x.id === id).timeOpen;
  await p.evaluate(at => [...document.querySelectorAll('.rv-item')].find(x => x.querySelector('small').textContent.endsWith(at)).click(), at);
  await p.waitForFunction(() => document.querySelector('.rv-facts') && !/reading the prices/.test(document.querySelector('.rv-facts-src')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  await settle(300);
};
const fact = k => p.evaluate(k => { const n = document.querySelector(`.rv-fact[data-fact="${k}"]`); return n ? { v: n.querySelector('b').textContent, note: n.querySelector('small')?.textContent || '' } : null; }, k);
const form = () => p.evaluate(() => [...document.querySelectorAll('.rv-form .rv-f > .k')].map(k => k.textContent));
const inputs = () => p.evaluate(() => [...document.querySelectorAll('.rv-card .rv-num')].map(i => i.getAttribute('aria-label')));
const rr = v => `${v > 0.0005 ? '+' : v < -0.0005 ? '−' : ''}${Math.abs(v).toFixed(1)}R`;

await pick('w');
let f = await fact('heat');
t('target hit: heat read off the chart, as information', f && f.v === (EW.heatR < 0.005 ? 'never against you' : rr(-EW.heatR)), JSON.stringify(f) + ' want ' + EW.heatR);
t('…with how close it came to the stop, in points for gold', EW.heatR < 0.005 || f.note === `came within ${EW.toStop} points of your stop`, f.note + ' want ' + EW.toStop);
t('a target hit shows no "could have made" — it made it', !(await fact('avail')));
t('nothing to type: the numbers are not boxes', (await inputs()).join() === 'Better exit', (await inputs()).join());
t('a winner is not asked right or wrong; better exit, entry, plan and grade are', JSON.stringify(await form()) === JSON.stringify(['Better exit', 'Entry', 'Plan followed', 'Grade']), JSON.stringify(await form()));
let w = await disk('w');
t('what the chart said is kept on the trade', w.review?.chart && near(w.review.chart.heatR, EW.heatR) && w.review.chart.unit === 'points' && !('fromStop' in w.review.chart), JSON.stringify(w.review?.chart));
await shot('win');

await pick('m');
t('closed by hand: held to target, read off the chart', (await fact('held'))?.v === 'Win · +1.5R' && /target hit/.test((await fact('held')).note), JSON.stringify(await fact('held')));
const m = await disk('m');
t('…and written on the trade for the Ghost and the analytics, marked as the chart’s', m.heldOutcome === 'win' && m.heldR === 1.5 && m.heldAuto === true, JSON.stringify([m.heldOutcome, m.heldR, m.heldAuto]));
t('heat too — and no separate "could have made": held to target says it', (await fact('heat'))?.v === (EM.heatR < 0.005 ? 'never against you' : rr(-EM.heatR)) && !(await fact('avail')), JSON.stringify([await fact('heat'), await fact('avail'), EM]));
t('"closed too early" is suggested', await p.evaluate(() => [...document.querySelectorAll('.rv-chips .is-sug')].map(b => b.textContent).join()) === 'Closed too early');
t('a profitable manual close is not asked right or wrong', !(await form()).includes('Direction'));

/* one Edit for the whole box */
await p.click('.rv-facts-edit'); await settle(250);
t('Edit turns the numbers into boxes, filled with what the chart said', JSON.stringify(await inputs()) === JSON.stringify(['Could have made', 'Drawdown']) && !!(await p.$('.rv-facts .rv-held')),
  JSON.stringify(await inputs()));
await p.fill('.rv-num[aria-label="Drawdown"]', '-0.9'); await p.press('.rv-num[aria-label="Drawdown"]', 'Tab'); await settle(250);
t('a typed number wins over the chart', (await disk('m')).review.heat === 0.9);
t('…and "Use the chart" gives the chart’s back', !!(await p.$('.rv-facts-reset')));
await p.click('.rv-facts-reset'); await settle(250);
t('back to the chart', (await disk('m')).review.heat === null);
await p.evaluate(() => [...document.querySelectorAll('.rv-facts .rv-held button')].find(x => x.textContent.trim() === 'BE').click()); await settle(700);
const m2 = await disk('m');
t('changing held to target by hand is yours from then on', m2.heldOutcome === 'be' && m2.heldAuto === false, JSON.stringify([m2.heldOutcome, m2.heldAuto]));
await p.click('.rv-facts-edit'); await settle(250);
/* make it read the chart again, as it would after the trade is edited */
await p.evaluate(async () => { const { store } = await import('/js/store.js'); delete store.trades.find(x => x.id === 'm').review.chart; });
await pick('w'); await pick('m'); await settle(400);
t('…and the chart does not write over it', (await disk('m')).heldOutcome === 'be' && (await fact('held'))?.note === 'your answer', JSON.stringify(await fact('held')));
await shot('manual');

await pick('s');
t('stopped out: "Trade lost", not −1R — and it could have made your target, +1.5R, never more', (await fact('heat'))?.v === 'Trade lost' && (await fact('avail'))?.v === '+1.5R', JSON.stringify([await fact('heat'), await fact('avail'), ES]));
t('no "from your stop" any more', !(await fact('fromstop')));
const PS = await fact('paststop');
t(`how far past the stop before the target: ${ES.past} points, ${ES.past <= 5 ? 'within 5 — counted' : 'over 5 — not counted'}`, PS?.v === `${ES.past} points`
  && (ES.past <= 5 ? /then on to your target/.test(PS.note) : /not counted/.test(PS.note)), JSON.stringify([PS, ES.past]));
const RN = await fact('ran');
t(`ran before stopped out: up ${rr(ES.ran)} while in, then stopped`, RN?.v === (ES.ran < 0.05 ? 'never your way' : rr(ES.ran)) && (ES.ran < 0.05 || RN.note === 'while you were in, then stopped out'), JSON.stringify([RN, ES.ran]));
t('drawdown, not heat', !(await p.evaluate(() => /\bheat\b/i.test(document.querySelector('.rv-card')?.innerText || ''))));
t('the ruler says the trade was lost, not "heat −1.0R"', await p.evaluate(() => /trade lost/.test(document.querySelector('.rv-ruler .key')?.textContent || '') && !/heat/.test(document.querySelector('.rv-ruler .key')?.textContent || '')));
t('…it reached your target after the stop', /reached your target/.test((await fact('avail')).note));
t('a loss is asked right or wrong — already Right, from the chart', (await form())[0] === 'Direction'
  && await p.evaluate(() => document.querySelector('.rv-form .rv-seg .is-on')?.textContent) === 'Right'
  && /reached your target after the stop/.test(await p.evaluate(() => document.querySelector('.rv-autonote')?.textContent)));
t('"stopped, then went my way" is suggested', await p.evaluate(() => [...document.querySelectorAll('.rv-chips .is-sug')].map(b => b.textContent).join()) === 'Stopped, then went my way');
t('no better exit on a stop', !(await form()).includes('Better exit'));
await pick('f');
t('went over 1R your way, turned before the target, stopped: "TP too far" is suggested', await p.evaluate(() => [...document.querySelectorAll('.rv-chips .is-sug')].map(b => b.textContent).join()) === 'TP too far',
  await p.evaluate(() => [...document.querySelectorAll('.rv-chips .is-sug')].map(b => b.textContent).join()));
t('…it is one of the answers to "what happened"', await p.evaluate(() => [...document.querySelectorAll('.rv-chips button')].some(b => b.textContent === 'TP too far')));
t('…and a stop that never went on to the target has nothing past the stop', !(await fact('paststop')));
t(`up ${rr(EF.ran)} and stopped: the trap — ran before stopped out, in yellow`, (await fact('ran'))?.v === rr(EF.ran) && EF.ran >= 1
  && await p.evaluate(() => document.querySelector('.rv-fact[data-fact="ran"]').classList.contains('is-warn')), JSON.stringify([await fact('ran'), EF.ran]));
await pick('s');
await shot('stopped');

/* read once */
const asked = SEEN.length;
await go('#/dashboard', 300); await go('#/review', 600); await pick('w'); await pick('s');
t('read once: going back asks OANDA for nothing', SEEN.length === asked, `${asked} → ${SEEN.length}`);

/* how often a stop was taken by a hair: the Week and Month tabs */
await p.evaluate(async () => { const { store } = await import('/js/store.js'); await store.setTradeReview('w', { what: 'target' }); });
await go('#/review/week', 700);
const tile = () => p.evaluate(() => { const n = [...document.querySelectorAll('.rv-stat')].find(x => x.querySelector('.k').textContent === 'Just past your stop');
  return n && { v: n.querySelector('.v').textContent, s: n.querySelector('.s').textContent, wide: n.classList.contains('is-wide') }; });
let JT = await tile();
const wantN = ES.past <= 5 ? 1 : 0;
t('Week: "Just past your stop" — how many stops went on to the target within 5', JT?.v === String(wantN)
  && (wantN ? JT.s === `of 1 stop that went on to target · XAUUSD ${ES.past} points` : /each more than 5 past/.test(JT.s)), JSON.stringify(JT));
const ranTile = () => p.evaluate(() => { const n = [...document.querySelectorAll('.rv-stat')].find(x => x.querySelector('.k').textContent === 'Ran before stopped out');
  return n && { v: n.querySelector('.v').textContent, s: n.querySelector('.s').textContent }; });
const RB = [ES, EF].filter(x => x.ran >= 1).sort((a, b) => b.ran - a.ran);
let RT = await ranTile();
t(`Week: "Ran before stopped out" — ${RB.length} up 1R or more, then BE or a loss`, RT?.v === String(RB.length)
  && RT.s.endsWith(`most ${rr(RB[0].ran)} XAUUSD`) && RT.s.includes(rr(RB.reduce((a, x) => a + x.ran, 0))), JSON.stringify([RT, RB.map(x => x.ran)]));
await shot('week-paststop');
await p.evaluate(() => [...document.querySelectorAll('.head .seg button')].find(b => b.textContent === 'Month').click()); await settle(600);
JT = await tile();
t('…and the Month tab, beside "Stopped, but right"', JT?.v === String(wantN) && await p.evaluate(() => [...document.querySelectorAll('.rv-mstats .rv-stat .k')].map(k => k.textContent).join()) ===
  'Taken,Win rate,Plan followed,Early entries,Left on the table,Stopped, but right,Just past your stop,Ran before stopped out,Reviewed', JSON.stringify(JT));
t('…and "Ran before stopped out" on the month too', (await ranTile())?.v === String(RB.length));
await go('#/review', 600);

/* without a key */
await p.evaluate(() => { localStorage.removeItem('quire:setting:oandaKey'); });
await p.evaluate(async () => { const { store } = await import('/js/store.js'); for (const x of store.trades) { if (x.review) delete x.review.chart; } });
await go('#/dashboard', 300); await go('#/review', 600); await pick('w');
t('no OANDA key: the boxes are there to fill by hand, and it says why', (await inputs()).includes('Could have made') && /add your OANDA key/.test(await p.evaluate(() => document.querySelector('.rv-facts-src')?.textContent)), JSON.stringify([await inputs(), await p.evaluate(() => document.querySelector('.rv-facts')?.innerText)]));

/* ===================== the outlook ===================== */
console.log('outlook');
await p.evaluate(k => { localStorage.setItem('quire:setting:oandaKey', k); }, KEY);
await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  const day = store.draftOutlook('2026-09-16');
  day.instruments = [{ id: 'ob1', pair: 'XAUUSD', bias: 'long', notes: 'Asia low first.', shots: ['screenshots/outlook-old-1.jpg'] }];
  await store.saveOutlook(day);
});
await go('#/outlook/2026-09-16', 600);
await p.waitForFunction(() => { const c = document.querySelector('.ob-chart .tc'); return c && c.__chart && !c.__chart.loadingMore; }, null, { timeout: 8000 }).catch(() => {});
await settle(300);
const OB = await p.evaluate(() => {
  const c = document.querySelector('.ob-chart .tc')?.__chart;
  const text = document.querySelector('.ob-text').getBoundingClientRect(), chart = document.querySelector('.ob-chart').getBoundingClientRect();
  const v = c?.view, times = c?.barTimes();
  return c && { bars: c.bars, tags: c.tags(), dots: c.dots(), w: [Math.round(text.width), Math.round(chart.width)],
    plot: document.querySelector('.ob-chart .tc-plot').getBoundingClientRect().height,
    from: times[Math.max(0, Math.floor(v.start))], to: times[Math.min(times.length - 1, Math.floor(v.start + v.count) - 1)],
    file: !!document.querySelector('.outlook-block input[type=file]'), older: document.querySelector('.ob-older')?.textContent || '' };
});
t('the outlook shows the instrument’s live chart', OB && OB.bars > 1000, JSON.stringify(OB && OB.bars));
t('…just the chart — no trade on it, no levels', OB && OB.tags.length === 0 && OB.dots.length === 0, JSON.stringify(OB));
t('…opening on the day before and the day itself', OB && OB.from <= Date.parse('2026-09-15T16:00:00Z') / 1000 + 3600 && OB.to >= Date.parse('2026-09-16T12:00:00Z') / 1000,
  JSON.stringify(OB && [new Date(OB.from * 1000).toISOString(), new Date(OB.to * 1000).toISOString()]));
t('half writing, half chart, and tall', OB && Math.abs(OB.w[0] - OB.w[1]) < 4 && OB.plot >= 460, JSON.stringify(OB && [OB.w, OB.plot]));
t('no screenshot to add any more', OB && !OB.file);
t('screenshots added before are still there, behind one line', OB && OB.older === '1 earlier screenshot', OB && OB.older);
await p.click('.ob-chart .tc-play'); await settle(80);
t('replay on the outlook has no "before the entry" — there is no entry', !(await p.$('.ob-chart .tc-entrypick')));
await p.keyboard.press('Escape'); await settle(80);
if (await p.$('.ob-chart .tc-cancelpick')) { await p.click('.ob-chart .tc-cancelpick'); await settle(80); }

/* the outlook's lines are its own: not the trades', and the trades' are not its */
const lineFile = () => p.evaluate(() => { try { return JSON.parse(window.__files.get('data/drawings.json')).lines; } catch { return {}; } });
const obBox = await p.evaluate(() => { const r = document.querySelector('.ob-chart .tc-canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; });
await p.click('.ob-chart .tv-left [data-tool="trend"]'); await settle(80);
await p.mouse.move(obBox.x + 120, obBox.y + 150); await p.mouse.down(); await p.mouse.move(obBox.x + 300, obBox.y + 160, { steps: 6 }); await p.mouse.up(); await settle(200);
await p.keyboard.press('Escape'); await settle(80);
let LF = await lineFile();
t('a line drawn on the outlook is kept for the outlook’s gold', LF['outlook:XAU_USD']?.length === 1 && !LF.XAU_USD?.length, JSON.stringify(Object.keys(LF)));
const goldId = await p.evaluate(async () => (await import('/js/store.js')).store.trades.find(x => x.pair === 'XAUUSD').id);
await go('#/trade/' + goldId, 500);
await p.waitForFunction(() => { const c = document.querySelector('.tc'); return c && c.__chart && !c.__chart.loadingMore; }, null, { timeout: 8000 }).catch(() => {});
t('…and not on a gold trade', await p.evaluate(() => document.querySelector('.tc').__chart.lineCount()) === 0);
const tBox = await p.evaluate(() => { const r = document.querySelector('.tc-canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; });
await p.click('.tc .tv-left [data-tool="trend"]'); await settle(80);
await p.mouse.move(tBox.x + 120, tBox.y + 150); await p.mouse.down(); await p.mouse.move(tBox.x + 300, tBox.y + 160, { steps: 6 }); await p.mouse.up(); await settle(200);
await p.keyboard.press('Escape'); await settle(80);
LF = await lineFile();
t('a line on the trade is kept with the trades', LF.XAU_USD?.length === 1 && LF['outlook:XAU_USD']?.length === 1, JSON.stringify(LF && Object.fromEntries(Object.entries(LF).map(([k, v]) => [k, v.length]))));
await go('#/outlook/2026-09-16', 600);
await p.waitForFunction(() => { const c = document.querySelector('.ob-chart .tc'); return c && c.__chart && !c.__chart.loadingMore; }, null, { timeout: 8000 }).catch(() => {});
t('…and the outlook still shows only its own', await p.evaluate(() => document.querySelector('.ob-chart .tc').__chart.lineCount()) === 1);
await shot('outlook');

/* ===================== New trade ===================== */
console.log('new trade');
await go('#/new', 600);
t('no category picker', !(await p.evaluate(() => [...document.querySelectorAll('.lbl')].some(l => l.textContent === 'Class'))));
const typePair = async v => { await p.fill('.pair-wrap input', v); await settle(80); return p.evaluate(() => { const h = document.querySelector('.pair-class'); return h.hidden ? '' : h.textContent; }); };
t('typing the instrument sets its category', JSON.stringify([await typePair('xauusd'), await typePair('EUR/USD'), await typePair('NAS100'), await typePair('MNQ'), await typePair('')])
  === JSON.stringify(['Commodities', 'Forex', 'Indices', 'Indices', '']), '');
const secs = () => p.evaluate(() => [...document.querySelectorAll('.trade-form .sec:not([hidden]) > .sec-h')].map(h => h.textContent));
const exec = () => p.evaluate(() => !document.querySelector('.trade-form .sec:not([hidden]) .mistakes'));
t('closed: mistakes and price delivery are asked', !(await exec()));
await p.evaluate(() => [...document.querySelectorAll('.trade-form .seg button')].find(b => b.textContent === 'Still open').click()); await settle(150);
t('still open: no mistakes, no price delivery', await exec());
const nums = (await secs()).map(s => s.slice(0, 2));
t('…and the sections count on without a gap', nums.every((n, i) => +n === i + 1), nums.join());
const size = () => p.evaluate(() => [...document.querySelectorAll('.trade-form .lbl')].some(l => l.textContent === 'Size' && l.offsetParent));
t('live: a size box', await size());
await p.evaluate(() => [...document.querySelectorAll('.trade-form .seg button')].find(b => b.textContent === 'Forward test').click()); await settle(150);
t('forward test: no size', !(await size()));
await p.evaluate(() => [...document.querySelectorAll('.trade-form .seg button')].find(b => b.textContent === 'Live').click()); await settle(150);
t('back to live: size again', await size());
/* save a running gold trade */
await typePair('XAUUSD');
for (const [sel, v] of [['Entry', '4050'], ['Stop', '4045'], ['Target', '4060']]) {
  await p.evaluate(([l, v]) => { const lab = [...document.querySelectorAll('.trade-form .lbl')].find(x => x.textContent === l); const i = lab.parentElement.querySelector('input'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]);
}
await p.evaluate(() => { const i = [...document.querySelectorAll('.trade-form input[type="time"]')][0]; i.value = '09:30'; i.dispatchEvent(new Event('input', { bubbles: true })); });
await settle(150);
const saveOff = await p.evaluate(() => document.querySelector('.btn-primary[disabled]') != null);
await p.evaluate(() => [...document.querySelectorAll('.btn-primary')].find(b => /Save as open/.test(b.textContent))?.click()); await settle(700);
const saved = await p.evaluate(() => JSON.parse(window.__files.get('data/trades.json')).trades.find(x => x.status === 'open' && x.entryPrice === 4050));
t('saved with its category read from the instrument', saved?.assetClass === 'Commodities', JSON.stringify(saved ? { assetClass: saved.assetClass } : { saveOff, open: await p.evaluate(() => JSON.parse(window.__files.get('data/trades.json')).trades.filter(x => !['w','m','s'].includes(x.id))), hash: await p.evaluate(() => location.hash), errs: errs.slice(-3) }));
t('a running trade keeps no mistakes or delivery — not asked yet', saved && saved.mistakes === null && saved.delivery === null, JSON.stringify(saved && [saved.mistakes, saved.delivery]));
if (saved) {
  await go('#/trade/' + saved.id, 500);
  t('its page: no price delivery, no mistakes', await p.evaluate(() => {
    const how = document.querySelector('.td-how'); if (!how) return true;
    return ![...how.querySelectorAll('.td-cell .k')].some(k => k.textContent === 'Price delivery') && !how.querySelector('.td-mist');
  }));
}

t('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
