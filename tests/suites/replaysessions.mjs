/* Replay, part four: the home page, groups and sessions, and inside a
   session — full screen, the replay moving through time, layouts, the
   floating bars, the bottom panel, Session finished.

   Prices come from the OANDA mock (oanda-mock.mjs: 7 to 23 Sep 2026),
   downloaded into the vault the way the Data page does it. By hand first —
   the file healing itself, the next session open and next day, the candles
   as they were at a moment — then the pages. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB } from '../fixtures/ghost-fixture.mjs';
import { KEY, oandaRoute } from '../fixtures/oanda-mock.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const NOW = new Date('2026-09-20T12:00:00+08:00');
const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Australia/Perth' });
await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, oandaRoute([], { mode: 'ok' }));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_|net::|401/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(NOW);
await p.addInitScript(({ ACCT, PB, KEY }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('quire:setting:oandaKey', KEY);
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: [] })], ['data/playbook.json', JSON.stringify(PB)],
    ['data/replay.json', JSON.stringify({ version: 1, weeks: { '2026-W30': { kept: true } } })]]));
}, { ACCT, PB, KEY });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 250) => p.waitForTimeout(ms);
const go = async (h, ms = 500) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };
const shot = async name => { try { await p.screenshot({ path: `${OUT}/replaysessions-${name}.png` }); } catch { /* fine */ } };
const file = () => p.evaluate(() => JSON.parse(window.__files.get('data/replay.json')));
const RS = () => p.evaluate(() => { const s = document.querySelector('.rs')?.__session; return s ? { T: s.T, playing: s.playing, speed: s.speed, charts: s.charts, active: s.active, bare: s.bare, panel: s.panel, first: s.first, last: s.last } : null; });
const sessionReady = async () => { await p.waitForFunction(() => !!document.querySelector('.rs')?.__session, null, { timeout: 10000 }).catch(() => {}); await settle(300); };
const Z = s => Date.parse(s) / 1000;

/* ===================== by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async () => {
  const S = await import('/js/replaysessions.js'), V = await import('/js/views/replaysession.js');
  const r = { weeks: {}, sessions: [{ id: 'a', inst: 'XAU_USD', from: 100, to: 50, at: 1 }, { id: 'b', inst: 'XAU_USD', from: 1000, to: 5000, at: 9999, groupId: 'gone' }, null], groups: [{ id: 'g' }, { name: 'no id' }] };
  const changed = S.healReplay(r);
  const pb = [{ name: 'Asia', start: '06:00', end: '10:00' }, { name: 'London', start: '15:00', end: '19:00' }, { name: 'New York', start: '20:00', end: '23:59' }];
  const Zp = s => Date.parse(s) / 1000;
  const fri = Zp('2026-09-18T22:30:00+08:00');                   // Friday evening in Perth
  const rows = [];
  for (let i = 0; i < 180; i++) { const t = Zp('2026-09-15T10:00:00Z') + i * 60; rows.push([t, 100 + i, 100.5 + i, 99.5 + i, 100.2 + i]); }
  const F = V.makeFeed(rows);
  const T = Zp('2026-09-15T10:37:00Z');
  const k = F.barIdx(60, T), part = F.partial(60, k, T), whole = F.barsOf(60)[k];
  const st = S.statsOf([{ balance: 100000, trades: [{ closed: true, r: 2, pnl: 2000 }, { closed: true, r: -1, pnl: -1000 }, { closed: false, r: 5 }] }, { balance: 100000, trades: [{ closed: true, r: 0, pnl: 0 }] }]);
  const st2 = S.statsOf([{ balance: 100000, trades: [] }, { balance: 50000, trades: [] }]);
  return { changed, r, london: S.nextSessionOpen(pb, Zp('2026-09-15T14:00:00+08:00')), asiaMonday: S.nextSessionOpen(pb, fri, ['Asia']),
    nextDay: S.nextDay(Zp('2026-09-15T12:00:00Z')), nextDayFri: S.nextDay(Zp('2026-09-18T12:00:00Z')),
    closed: [S.closedAt(Zp('2026-09-19T12:00:00Z')), S.closedAt(Zp('2026-09-16T12:00:00Z')), S.closedAt(Zp('2026-09-20T22:00:00Z'))],
    part, whole, k, lastIn: F.lastRowIn(60, k), st, st2, pair: [S.pairName('NAS100_USD'), S.pairName('XAU_USD')] };
});
t('the file mends itself: bad sessions out, a moment inside its period, unknown groups let go', H.changed && H.r.sessions.length === 1 && H.r.sessions[0].at === 5000 && H.r.sessions[0].groupId === null
  && H.r.groups.length === 1 && Array.isArray(H.r.sessions[0].trades) && H.r.sessions[0].layout === 1 && H.r.settings.balance === 100000 && 'weeks' in H.r, JSON.stringify(H.r));
t('next London open after 14:00 Perth: 15:00 the same day', H.london.name === 'London' && H.london.t === Z('2026-09-15T15:00:00+08:00'), JSON.stringify(H.london));
t('next Asia open from a Friday evening: Monday’s — not the weekend', H.asiaMonday.t === Z('2026-09-21T06:00:00+08:00'), new Date(H.asiaMonday.t * 1000).toISOString());
t('next day: the 17:00 New York open (21:00 UTC in September)', H.nextDay === Z('2026-09-15T21:00:00Z'), new Date(H.nextDay * 1000).toISOString());
t('…from a Friday, Sunday’s open', H.nextDayFri === Z('2026-09-20T21:00:00Z'), new Date(H.nextDayFri * 1000).toISOString());
t('the market is shut on Saturday, open midweek and on Sunday evening New York', JSON.stringify(H.closed) === '[true,false,false]', JSON.stringify(H.closed));
t('an hour candle at 10:37: open at 10:00, high and low so far, close at 10:37', H.part[0] === Z('2026-09-15T10:00:00Z') && H.part[1] === 100 && H.part[2] === 137.5 && H.part[3] === 99.5 && H.part[4] === 137.2
  && H.whole[4] === 159.2, JSON.stringify([H.part, H.whole]));
t('…the last minute in that hour is 10:59', H.lastIn === Z('2026-09-15T10:59:00Z'));
t('a group adds up: closed trades only, R and dollars, win rate', H.st.trades === 3 && H.st.r === 1 && H.st.usd === 1000 && H.st.won === 1 && H.st.lost === 1 && H.st.be === 1 && Math.abs(H.st.winRate - 1 / 3) < 1e-9 && H.st.sameBalance && !H.st2.sameBalance, JSON.stringify(H.st));
t('names: NAS100, XAUUSD', H.pair.join() === 'NAS100,XAUUSD');

/* prices into the vault, the way the Data page does it */
await p.evaluate(async now => { const R = await import('/js/replaydata.js'), C = await import('/js/candles.js'); await R.downloadPair('XAU_USD', await C.getKey(), { now }); }, NOW.getTime() / 1000);

/* ===================== the home page ===================== */
console.log('home');
await go('#/replay', 600);
t('no sessions yet: says so, with New session', await p.evaluate(() => /No sessions yet/.test(document.querySelector('.rp-emptycard')?.textContent || '') && !!document.querySelector('.rp-emptycard .rp-new-session')));
t('the header: Data (pairs, size), Settings, + New group, + New session', await p.evaluate(() => /Data · 1 pair/.test(document.querySelector('.rp-data-btn').textContent)
  && !!document.querySelector('.head .rp-settings-btn') && !!document.querySelector('.head .rp-new-group') && !!document.querySelector('.head .rp-new-session')));
t('the tiles: sessions, trades, total, win rate, last opened, continue', await p.evaluate(() => [...document.querySelectorAll('.rp-tiles .rp-k')].map(x => x.textContent).join() === 'Sessions,Trades,Total,Win rate,Last opened,Continue'));
await p.click('.rp-data-btn'); await settle(300);
t('Data opens the price data on its own page', await p.evaluate(() => location.hash === '#/replay/data' && !!document.querySelector('.rp-data .rp-row[data-inst="XAU_USD"]')));
await p.click('.rp-back'); await settle(300);
await p.click('.rp-settings-btn'); await settle(120);
await p.fill('.rp-set-balance', '50000'); await p.fill('.rp-set-risk', '0.5'); await p.click('.rp-set-ok'); await settle(200);
t('Settings: what a new session starts with, kept in the vault', JSON.stringify((await file()).settings) === '{"balance":50000,"risk":0.5,"riskMode":"%"}', JSON.stringify((await file()).settings));
t('…the old FX Replay weeks are left as they were', (await file()).weeks['2026-W30']?.kept === true);
await p.click('.head .rp-new-group'); await settle(120);
await p.fill('.rp-name-in', 'London sweeps'); await p.click('.rp-name-ok'); await settle(250);
const G1 = (await file()).groups[0];
t('+ New group: named, saved, shown with nothing in it yet', G1?.name === 'London sweeps' && await p.evaluate(id => !!document.querySelector(`.rp-group[data-group="${id}"] .rp-gempty`), G1.id));
/* a click that draws the page again keeps it scrolled where it was */
await p.addStyleTag({ content: '.rp-body { max-height:90px !important; } .rp-body > * { flex-shrink:0 !important; }' }); await settle(100);
const sc0 = await p.evaluate(() => { const b = document.querySelector('.rp-body'); b.scrollTop = b.scrollHeight; return [b.scrollTop, document.scrollingElement.scrollHeight - innerHeight]; });
await p.evaluate(id => document.querySelector(`.rp-group[data-group="${id}"] .rp-gtoggle`).click(), G1.id); await settle(250);
const sc1 = await p.evaluate(() => document.querySelector('.rp-body').scrollTop);
t('folding a group (the page drawn again): the list stays scrolled where it was, not back to the top', sc0[0] > 40 && sc1 > 40, JSON.stringify([sc0, sc1]));
await p.evaluate(() => document.querySelectorAll('style').forEach(x => { if (/max-height:90px/.test(x.textContent)) x.remove(); }));
await p.evaluate(id => document.querySelector(`.rp-group[data-group="${id}"] .rp-gtoggle`).click(), G1.id); await settle(250);
await p.click('.head .rp-new-session'); await settle(150);
t('+ New session: name, pair, group, period, balance and risk — from the settings', await p.evaluate(() => {
  const q = s => document.querySelector(s);
  return q('.rp-ns-pair').value === 'XAU_USD' && q('.rp-ns-balance').value === '50000' && q('.rp-ns-risk').value === '0.5' && [...q('.rp-ns-group').options].map(o => o.textContent).join() === 'No group,London sweeps';
}));
await p.fill('.rp-ns-from', '2026-09-08'); await p.fill('.rp-ns-to', '2026-09-05'); await p.click('.rp-ns-ok'); await settle(120);
t('an end before the start is refused, in words', /end after it starts/.test(await p.evaluate(() => document.querySelector('.rp-ns-note').textContent)));
await p.fill('.rp-ns-from', '2024-01-02'); await p.fill('.rp-ns-to', '2024-01-05'); await p.click('.rp-ns-ok'); await settle(120);
t('a period before the saved prices is refused, saying what is saved', /prices are saved from/.test(await p.evaluate(() => document.querySelector('.rp-ns-note').textContent)), await p.evaluate(() => document.querySelector('.rp-ns-note').textContent));
await p.fill('.rp-ns-name', 'London sweeps — Sep'); await p.selectOption('.rp-ns-group', G1.id);
await p.fill('.rp-ns-from', '2026-09-08'); await p.fill('.rp-ns-to', '2026-09-17'); await p.click('.rp-ns-ok');
await sessionReady();
const S1 = (await file()).sessions[0];
t('Create and open: saved — XAUUSD, 8 to 17 Sep, in the group, $50,000 at 0.5%', S1 && S1.inst === 'XAU_USD' && S1.groupId === G1.id && S1.from === Z('2026-09-08T00:00:00+08:00') && S1.to === Z('2026-09-17T23:59:00+08:00')
  && S1.balance === 50000 && S1.risk === 0.5 && S1.at === S1.from, JSON.stringify(S1));

/* ===================== inside a session ===================== */
console.log('inside a session');
t('the session opens full screen over the app — no sidebar', await p.evaluate(() => {
  const rs = document.querySelector('.rs'); if (!rs) return false;
  const r = rs.getBoundingClientRect(), hit = document.elementFromPoint(60, 300);
  return r.width === innerWidth && r.height === innerHeight && rs.contains(hit) && location.hash.startsWith('#/replay/session/');
}));
const top = await p.evaluate(() => ({ name: document.querySelector('.rs-name b').textContent, group: document.querySelector('.rs-name span').textContent,
  pair: document.querySelector('.rs-pair').textContent, bal: document.querySelector('.rs-bal b').textContent, risk: document.querySelector('.rs-risk b').textContent,
  tfs: [...document.querySelectorAll('.rs-tfs button')].map(x => x.textContent).join(), exit: !!document.querySelector('.rs-top .rs-exit') }));
t('the top bar: name and group, the pair, timeframes, balance, risk, Exit', top.name === 'London sweeps — Sep' && top.group === 'London sweeps' && top.pair === 'XAUUSD' && top.bal === '$50,000.00'
  && top.risk === '0.5%' && top.tfs === '1m,3m,5m,15m,30m,1H,4H,D' && top.exit, JSON.stringify(top));
let R = await RS();
t('it starts at the first candle of the period', R.T === Z('2026-09-08T00:00:00+08:00') && R.first === R.T, `${new Date(R.T * 1000).toISOString()}`);
t('…on 5m, and nothing after the moment is on the chart', R.charts[0].tf === 5 && R.charts[0].last[0] <= R.T && R.charts[0].last[0] > R.T - 300, JSON.stringify(R.charts[0]));
t('…with the prices before it for context (all the mock has: 16 hours of 5m candles)', await p.evaluate(() => { const c = document.querySelector('.rs').__session.charts[0]; return c.k >= 185; }));
t('the drawing tools down the left, the replay bar on the chart, the panel underneath', await p.evaluate(() => !!document.querySelector('.rs-left .tv-left') && !!document.querySelector('.rs-stage .rs-bar .rs-pp')
  && /Positions · 0/.test(document.querySelector('.rs-panel').textContent) && /History · 0/.test(document.querySelector('.rs-panel').textContent) && /Session stats/.test(document.querySelector('.rs-panel').textContent)));
await shot('open');

/* one candle at a time */
const T0 = R.T;
await p.click('.rs-bar .rs-fwd'); await settle(100);
R = await RS();
t('one candle forward: the 5m candle finishes (its last minute)', R.T === T0 + 240, `${R.T - T0}`);
await p.click('.rs-bar .rs-fwd'); await settle(100);
R = await RS();
t('…and the next one', R.T === T0 + 540);
await p.click('.rs-bar .rs-back'); await settle(100);
t('one candle back', (await RS()).T === T0 + 240);
await p.mouse.move(700, 400);
await p.keyboard.press('ArrowRight'); await settle(80);
t('→ steps forward too', (await RS()).T === T0 + 540);
await p.keyboard.press('ArrowLeft'); await settle(80);
t('← steps back', (await RS()).T === T0 + 240);
/* playing */
await p.click('.rs-bar .rs-speed'); await settle(80);
t('speeds: candles a second, 0.5× to 10×', await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mlabel')].map(x => x.textContent).join() === '0.5×,1×,2×,3×,5×,10×'));
await p.click('.tv-menu .tv-mi:nth-child(7)'); await settle(80);
const P0 = (await RS()).T;
await p.click('.rs-bar .rs-pp'); await settle(1100);
const P1 = await RS();
t('Play at 10×: about ten 5m candles a second', P1.playing && (P1.T - P0) / 300 >= 7 && (P1.T - P0) / 300 <= 12, `${(P1.T - P0) / 300} candles, speed ${P1.speed}`);
await p.keyboard.press(' '); await settle(150);
const P2 = await RS(); await settle(500); const P3 = await RS();
t('space pauses — it holds still', !P2.playing && P3.T === P2.T);
t('…and where it got to is saved', (await file()).sessions[0].at === P3.T);
/* the forming candle: half way through an hour */
const MID = Z('2026-09-08T03:37:00+08:00');
await p.evaluate(T => document.querySelector('.rs').__session.moveTo(T), MID); await settle(150);
await p.click('.rs-tfs button[data-tf="1H"]'); await settle(200);
R = await RS();
const hourly = await p.evaluate(T => {
  const s = document.querySelector('.rs').__session, rows = s.feed.rows, c = s.charts[0];
  const start = c.last[0];
  const inside = rows.filter(r => r[0] >= start && r[0] <= T);
  const whole = rows.filter(r => r[0] >= start && r[0] < start + 3600);
  return { last: c.last, open: inside[0][1], high: Math.max(...inside.map(r => r[2])), low: Math.min(...inside.map(r => r[3])), close: inside.at(-1)[4], start, n: inside.length, fullClose: whole.at(-1)[4] };
}, R.T);
t('1H: the same moment; the hour is still forming — only its minutes up to now, not the rest of it', R.T === MID && hourly.n === 38 && hourly.last[4] !== hourly.fullClose && R.charts[0].tf === 60 && hourly.last[1] === hourly.open && hourly.last[2] === hourly.high
  && hourly.last[3] === hourly.low && hourly.last[4] === hourly.close && hourly.start <= R.T && R.T < hourly.start + 3600, JSON.stringify(hourly));
await p.click('.rs-bar .rs-fwd'); await settle(120);
R = await RS();
t('on 1H a step is an hour: the forming hour finishes', (R.T + 60) % 3600 === 0 && R.T > MID, new Date(R.T * 1000).toISOString());

/* each step: the chart's timeframe, or a set time — down to 15 seconds, ticks inside the minute */
await p.click('.rs-tfs button[data-tf="15m"]'); await settle(150);
t('the step button says TF: a step is the chart’s candle', await p.evaluate(() => document.querySelector('.rs-bar .rs-step').textContent === 'TF'));
await p.click('.rs-bar .rs-step'); await settle(80);
t('Each step: the chart’s timeframe, or 15 seconds up to 4 hours', await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mlabel')].map(x => x.textContent).join() === 'Chart’s timeframe,15 seconds,1 minute,5 minutes,15 minutes,30 minutes,1 hour,4 hours'));
await p.click('.tv-menu .rs-st-025'); await settle(80);
const Q = async () => p.evaluate(() => { const s = document.querySelector('.rs').__session; return { T: s.T, price: s.price(), last: s.charts[0].last, when: document.querySelector('.rs-when').textContent, label: document.querySelector('.rs-step').textContent, step: s.step }; });
const q0 = await Q();
const ticks = [];
for (let k = 0; k < 4; k++) { await p.click('.rs-bar .rs-fwd'); await settle(60); ticks.push(await Q()); }
const trow = await p.evaluate(T => { const s = document.querySelector('.rs').__session; return s.feed.rows.find(r => r[0] > T); }, q0.T);
const tpath = trow[4] >= trow[1] ? [trow[1], trow[3], trow[2], trow[4]] : [trow[1], trow[2], trow[3], trow[4]];
t('…the price on each tick', ticks.map(x => x.price).join() === tpath.join() && ticks.map(x => x.T - trow[0]).join() === '-45,-30,-15,0', JSON.stringify([ticks.map(x => x.price), tpath, ticks.map(x => x.T - trow[0])]));
t('…the 15m candle moves with them, still forming', ticks.every(x => x.last[4] === x.price && x.last[0] <= trow[0] && x.last[0] > trow[0] - 900)
  && ticks[1].last[3] <= tpath[1] && ticks[1].last[2] >= tpath[1], JSON.stringify(ticks.map(x => x.last)));
t('…the time with its seconds; the button says 15s', ticks[1].label === '15s' && /:\d\d:15$/.test(ticks[1].when) && /:\d\d:45$/.test(ticks[3].when), ticks.map(x => x.when).join(' | '));
await p.click('.rs-bar .rs-back'); await settle(80);
t('a step back: the tick before', (await Q()).T === ticks[2].T && (await Q()).price === ticks[2].price);
await p.click('.rs-bar .rs-speed'); await p.click('.tv-menu .tv-mi:nth-child(7)'); await settle(60);
const t0 = (await Q()).T;
await p.click('.rs-bar .rs-pp'); await settle(1100);
await p.keyboard.press(' '); await settle(100);
const played = ((await Q()).T - t0) / 15;
t('playing at 10×: about ten 15-second ticks a second', played >= 7 && played <= 14, String(played));
t('…where it got to, inside a minute, is saved and kept', (await file()).sessions[0].at === (await Q()).T);
await p.click('.rs-bar .rs-step'); await p.click('.tv-menu .rs-st-5'); await settle(60);
await p.click('.rs-bar .rs-fwd'); await settle(80);
let q5 = await Q();
await p.click('.rs-bar .rs-fwd'); await settle(80);
const q6 = await Q();
t('5 minutes on the 15m chart: each step five minutes', (q5.T + 60) % 300 === 0 && q6.T - q5.T === 300 && q5.label === '5m', `${q5.T} ${q6.T}`);
await p.click('.rs-bar .rs-step'); await p.click('.tv-menu .rs-st-tf'); await settle(60);
await p.click('.rs-bar .rs-fwd'); await settle(80);
t('back to the chart’s timeframe: a step is the 15m candle', ((await Q()).T + 60) % 900 === 0);

/* following: after a reset the view moves with the candles; moved by hand, it stays put */
const lastX = () => p.evaluate(() => { const s = document.querySelector('.rs').__session, c = s.core(), k = s.charts[0].k; return { x: c.geom().xI(k), start: c.geom().start }; });
await p.evaluate(() => document.querySelector('.rs').__session.core().reset()); await settle(150);
const f0 = await lastX();
for (let k = 0; k < 3; k++) { await p.click('.rs-bar .rs-fwd'); await settle(60); }
const f1 = await lastX();
t('after Reset chart view, stepping on: the chart follows — the newest candle stays where it was', Math.abs(f1.x - f0.x) < 1 && f1.start > f0.start, JSON.stringify([f0, f1]));
const pbox = await p.evaluate(() => { const r = document.querySelector('.rs-pane .tc-canvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 }; });
await p.mouse.move(pbox.x, pbox.y); await p.mouse.down(); await p.mouse.move(pbox.x + 150, pbox.y, { steps: 5 }); await p.mouse.up(); await settle(100);
const f2 = await lastX();
for (let k = 0; k < 3; k++) { await p.click('.rs-bar .rs-fwd'); await settle(60); }
const f3 = await lastX();
t('moved by hand: free — the view stays put while the candles go on', Math.abs(f3.start - f2.start) < 1e-6 && f3.x > f2.x + 1, JSON.stringify([f2, f3]));
await p.evaluate(() => document.querySelector('.rs').__session.core().reset()); await settle(150);
const f4 = await lastX();
await p.click('.rs-bar .rs-fwd'); await settle(60);
t('…Reset chart view: following again', Math.abs((await lastX()).x - f4.x) < 1);
await p.click('.rs-tfs button[data-tf="5m"]'); await settle(150);

/* jumping */
await p.click('.rs-bar .rs-jump'); await settle(100);
const jumps = await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mlabel')].map(x => x.textContent));
t('Jump to: a date and time, the next Playbook session opens, the next day', jumps[0] === 'Date and time…' && jumps.includes('Next London open') && jumps.includes('Next New York open') && jumps.at(-1) === 'Next day', jumps.join(' | '));
await p.click('.tv-menu .tv-mi:has-text("Next London open")'); await settle(200);
R = await RS();
t('Next London open: the replay stops on the minute before 15:00 Perth', new Date((R.T + 60) * 1000).toLocaleTimeString('en-GB', { timeZone: 'Australia/Perth', hour: '2-digit', minute: '2-digit' }) === '15:00', new Date(R.T * 1000).toISOString());
const beforeDay = R.T;
await p.click('.rs-bar .rs-jump'); await p.click('.tv-menu .rs-j-day'); await settle(200);
R = await RS();
t('Next day: the minute before 17:00 New York', R.T + 60 === (await p.evaluate(async T => (await import('/js/replaysessions.js')).nextDay(T), beforeDay)), new Date(R.T * 1000).toISOString());
await p.click('.rs-bar .rs-jump'); await p.click('.tv-menu .rs-j-date'); await settle(150);
await p.fill('.rs-date-in', '2026-09-10T09:30'); await p.click('.rs-date-go'); await settle(200);
R = await RS();
t('Date and time: there', R.T === Z('2026-09-10T09:30:00+08:00'), new Date(R.T * 1000).toISOString());

/* layouts */
await p.click('.rs-layout'); await settle(80);
await p.click('.tv-menu .rs-l2'); await settle(400);
R = await RS();
t('Layout: two charts on the same moment — 5m and 1H', R.charts.length === 2 && R.charts[0].tf === 5 && R.charts[1].tf === 60 && R.charts.every(c => c.last[0] <= R.T), JSON.stringify(R.charts.map(c => c.tf)));
const pane2 = await p.evaluate(() => { const r = document.querySelector('.rs-pane[data-slot="1"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await p.mouse.click(pane2.x, pane2.y); await settle(150);
t('press the second: it is the one the top bar works on', (await RS()).active === 1 && await p.evaluate(() => document.querySelector('.rs-tfs .is-on').dataset.tf === '1H' && document.querySelector('.rs-pane[data-slot="1"]').classList.contains('is-active')));
await p.click('.rs-tfs button[data-tf="15m"]'); await settle(800);
t('…its timeframe changes, the first stays', (await RS()).charts[1].tf === 15 && (await RS()).charts[0].tf === 5 && JSON.stringify((await file()).sessions[0].tfs.slice(0, 2)) === '[5,15]');
await p.click('.rs-bar .rs-fwd'); await settle(150);
R = await RS();
t('a step moves both charts (by the active one’s candle)', (R.T + 60) % 900 === 0 && R.charts.every(c => c.last[0] <= R.T && c.last[0] > R.T - c.tf * 60), JSON.stringify(R.charts.map(c => c.last[0])));
await p.click('.rs-layout'); await p.click('.tv-menu .rs-l4'); await settle(400);
t('four charts', (await RS()).charts.length === 4 && await p.evaluate(() => document.querySelectorAll('.rs-grid .rs-pane').length === 4));
await shot('four');
await p.click('.rs-layout'); await p.click('.tv-menu .rs-l1'); await settle(800);
t('back to one, and the layout is kept', (await RS()).charts.length === 1 && (await file()).sessions[0].layout === 1);

/* full screen */
await p.click('.rs-top .rs-full'); await settle(250);
const bare = await p.evaluate(() => { const vis = s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && !e.hidden; };
  return { top: vis('.rs-top'), left: vis('.rs-left'), panel: vis('.rs-panel'), bar: vis('.rs-bar'), tfbar: vis('.rs-tfbar'), ohlc: vis('.rs .tv-ohlc'), sym: document.querySelector('.rs .tv-sym')?.textContent }; });
t('full screen: no top bar, tools or panel — the replay bar and a timeframe bar stay; top left only the pair and timeframe', !bare.top && !bare.left && !bare.panel && bare.bar && bare.tfbar && !bare.ohlc && bare.sym === 'XAUUSD · 5m · OANDA', JSON.stringify(bare));
await shot('fullscreen');
await p.mouse.move(700, 400);
await p.keyboard.press('Escape'); await settle(200);
t('Esc leaves full screen', !(await RS()).bare && await p.evaluate(() => getComputedStyle(document.querySelector('.rs-top')).display !== 'none'));
/* the replay bar moves */
const gb = await p.evaluate(() => { const r = document.querySelector('.rs-bar .tv-grip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await p.mouse.move(gb.x, gb.y); await p.mouse.down(); await p.mouse.move(gb.x - 300, gb.y - 250, { steps: 6 }); await p.mouse.up(); await settle(150);
const bpos = await p.evaluate(() => JSON.parse(localStorage.getItem('quire:rsBar')));
const bbox = await p.evaluate(() => { const r = document.querySelector('.rs-bar').getBoundingClientRect(); return { x: r.left, y: r.top }; });
t('the replay bar can be dragged anywhere on the chart; where is kept', bpos && bpos.y < 0.7 && Math.abs(bbox.y - (gb.y - 250 - 14)) < 30, JSON.stringify([bpos, bbox]));
/* the panel */
const hb = await p.evaluate(() => { const r = document.querySelector('.rs-handle').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 4 }; });
await p.mouse.move(hb.x, hb.y); await p.mouse.down(); await p.mouse.move(hb.x, hb.y + 300, { steps: 6 }); await p.mouse.up(); await settle(150);
t('the panel’s handle: dragged down, it shuts', (await RS()).panel === 0 && await p.evaluate(() => document.querySelector('.rs-panel').classList.contains('is-shut')));
await p.click('.rs-ptab[data-tab="stats"]'); await settle(150);
t('…a tab opens it again — Session stats', (await RS()).panel > 100 && /Trades/.test(await p.evaluate(() => document.querySelector('.rs-pbody').textContent)));
/* drawings belong to the session */
const cb = await p.evaluate(() => { const r = document.querySelector('.rs-pane .tc-canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; });
await p.click('.rs-left .tv-left [data-tool="trend"]');
await p.mouse.move(cb.x + 300, cb.y + 200); await p.mouse.down(); await p.mouse.move(cb.x + 500, cb.y + 150, { steps: 5 }); await p.mouse.up(); await settle(200);
const lines = await p.evaluate(() => JSON.parse(window.__files.get('data/drawings.json')).lines);
t('a line drawn in the session is the session’s own — not gold’s', lines[`replay:${S1.id}`]?.length === 1 && !lines.XAU_USD?.length, JSON.stringify(Object.keys(lines)));
await p.mouse.move(700, 400); await p.keyboard.press('Escape');

/* Exit, and back */
const Tleft = (await RS()).T;
await p.click('.rs-top .rs-exit'); await settle(400);
t('Exit: back to Replay', await p.evaluate(() => !document.querySelector('.rs') && location.hash === '#/replay'));
const row = await p.evaluate(id => { const r = document.querySelector(`.rp-srow[data-session="${id}"]`); return r && { text: r.textContent, open: r.querySelector('.rp-open').textContent, pct: r.querySelector('.rp-progress span').textContent }; }, S1.id);
t('the session row: where you are, the progress, ▶ Continue', row && /Thu 10 Sep 2026/.test(row.text) && row.open === '▶ Continue' && parseInt(row.pct) > 0, JSON.stringify(row));
t('Last opened and Continue know it', await p.evaluate(() => /London sweeps — Sep/.test(document.querySelector('.rp-t-last').textContent) && !document.querySelector('.rp-continue').disabled));
await shot('home');
await p.click('.rp-continue'); await sessionReady();
t('Continue opens it where you left it', (await RS())?.T === Tleft);
/* the end of the period */
await p.evaluate(() => { const s = document.querySelector('.rs').__session; s.moveTo(s.last - 600); });
await settle(150);
await p.click('.rs-bar .rs-speed'); await p.click('.tv-menu .tv-mi:nth-child(7)'); await settle(60);
await p.click('.rs-bar .rs-pp'); await settle(1200);
t('at the end of the period it stops: Session finished, with Go to analytics', !(await RS()).playing && (await RS()).T === (await RS()).last
  && await p.evaluate(() => /Session finished/.test(document.querySelector('.rs-finished')?.textContent || '') && !!document.querySelector('.rs-finished .rs-to-analytics')));
t('…and the session is marked finished', (await file()).sessions[0].finished === true);
await shot('finished');
await p.click('.rs-finished .rs-to-analytics'); await settle(400);
t('Go to analytics: that session’s analytics page', await p.evaluate(id => location.hash === '#/replay/analytics/' + id && !document.querySelector('.rs') && /London sweeps — Sep/.test(document.querySelector('.head h1').textContent), S1.id));
await go('#/replay', 400);

/* ===================== managing sessions and groups ===================== */
console.log('managing');
const more = async id => { await p.click(`.rp-srow[data-session="${id}"] .rp-smore`); await settle(100); };
await more(S1.id);
t('⋯ on a session: Rename, Move to group ›, Duplicate, Delete session…', await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mlabel')].map(x => x.textContent).join() === 'Rename,Move to group ›,Duplicate,Delete session…'));
await p.click('.tv-menu .rp-m-rename'); await settle(100);
await p.fill('.rp-name-in', 'Sweeps A'); await p.keyboard.press('Enter'); await settle(250);
t('Rename', (await file()).sessions[0].name === 'Sweeps A');
await more(S1.id); await p.click('.tv-menu .rp-m-dup'); await settle(250);
const F2 = await file();
t('Duplicate: a copy from the start, no trades, not finished', F2.sessions.length === 2 && F2.sessions[1].name === 'Sweeps A (copy)' && F2.sessions[1].at === F2.sessions[1].from && !F2.sessions[1].finished && F2.sessions[1].groupId === G1.id);
const S2 = F2.sessions[1];
await more(S2.id); await p.click('.tv-menu .rp-m-move'); await settle(100);
t('Move to group ›: No group and the groups', await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mlabel')].map(x => x.textContent).join() === 'No group,London sweeps'));
await p.click('.tv-menu .rp-m-to-none'); await settle(250);
t('…moved: under No group', (await file()).sessions[1].groupId === null && await p.evaluate(id => !!document.querySelector(`.rp-group[data-group="none"] .rp-srow[data-session="${id}"]`), S2.id));
await p.click(`.rp-group[data-group="${G1.id}"] .rp-gtoggle`); await settle(200);
t('a group folds away, and stays folded', (await file()).groups[0].collapsed === true && await p.evaluate(id => !document.querySelector(`.rp-group[data-group="${id}"] .rp-srow`), G1.id));
await p.click(`.rp-group[data-group="${G1.id}"] .rp-gtoggle`); await settle(200);
await more(S2.id); await p.click('.tv-menu .rp-m-delete'); await settle(120);
t('Delete session asks first', /Delete “Sweeps A \(copy\)”\?/.test(await p.evaluate(() => document.querySelector('.rp-modal h2').textContent)));
await p.click('.rp-modal .btn.is-danger'); await settle(250);
t('…and deletes it', (await file()).sessions.length === 1);
/* a group with a session in it */
await p.click(`.rp-group[data-group="${G1.id}"] .rp-gmore`); await settle(100);
await p.click('.tv-menu .rp-m-gdelete'); await settle(120);
t('Delete group asks: delete everything inside, or move the sessions out', await p.evaluate(() => !!document.querySelector('.rp-modal .rp-g-move') && !!document.querySelector('.rp-modal .rp-g-all')));
await p.click('.rp-modal .rp-g-move'); await settle(250);
let F3 = await file();
t('Move the sessions out: the group goes, its session stays under No group', F3.groups.length === 0 && F3.sessions.length === 1 && F3.sessions[0].groupId === null);
await p.click('.head .rp-new-group'); await p.fill('.rp-name-in', 'Asia'); await p.click('.rp-name-ok'); await settle(250);
const G2 = (await file()).groups[0];
await more(S1.id); await p.click('.tv-menu .rp-m-move'); await p.click('.tv-menu .rp-m-to'); await settle(250);
await p.click(`.rp-group[data-group="${G2.id}"] .rp-gmore`); await p.click('.tv-menu .rp-m-gdelete'); await settle(120);
await p.click('.rp-modal .rp-g-all'); await settle(300);
F3 = await file();
const L2 = await p.evaluate(() => JSON.parse(window.__files.get('data/drawings.json')).lines);
t('Delete everything inside: the group, its session and the session’s drawings', F3.groups.length === 0 && F3.sessions.length === 0 && !Object.keys(L2).some(k => k.startsWith('replay:')), JSON.stringify(Object.keys(L2)));
t('the page says there are no sessions again', await p.evaluate(() => /No sessions yet/.test(document.querySelector('.rp-emptycard')?.textContent || '')));

t('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
