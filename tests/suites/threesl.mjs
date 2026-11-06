/* 3SL — Minato's own TradingView indicator (chart/threesl.js), on the trade
   chart and in Replay: the three Perth sessions boxed from their high to
   their low, named on the top right corner, growing with a replay; the
   chart info (the date, the ticker and timeframe) in its place; its
   settings kept for the whole app; its line under the instrument's with
   settings and remove. And the Replay order tags, blue and red whatever
   the win and loss colours. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB } from '../fixtures/ghost-fixture.mjs';
import { KEY, SERIES, oandaRoute } from '../fixtures/oanda-mock.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const perth = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+08:00`) / 1000;
const ORIGIN = Date.UTC(2026, 8, 7) / 1000;
const G_IN = +SERIES.XAU_USD[0][Math.round((perth('2026-09-15', '15:35') - ORIGIN) / 60)].toFixed(2);
const TR = [{ id: 'g1', accountId: 'acc_1', riskPercent: 1, mode: 'live', sessionId: 'ses_l', setupId: 's_fvg', tagIds: [], notes: '',
  pair: 'XAUUSD', side: 'buy', date: '2026-09-15', timeOpen: '15:35', timeClose: '18:50', status: 'closed',
  entryPrice: G_IN, stopLoss: +(G_IN - 4.5).toFixed(2), takeProfit: +(G_IN + 13.5).toFixed(2), exitPrice: +(G_IN + 13.5).toFixed(2), exitReason: 'tp', netResult: 3000, execTf: '5m' }];

const NOW = new Date('2026-09-20T12:00:00+08:00');
const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Australia/Perth' });
await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, oandaRoute([], { mode: 'ok' }));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_|net::|401/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(new Date('2026-09-18T12:00:00+08:00'));
await p.addInitScript(({ ACCT, TR, PB, KEY }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('quire:setting:oandaKey', KEY);
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, TR, PB, KEY });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 250) => p.waitForTimeout(ms);
const go = async (h, ms = 500) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };

/* ===================== by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async ({ day }) => {
  const M = await import('/js/chart/threesl.js');
  const S = M.tslSettings({});
  /* 15-minute candles over one Perth day, each a little higher than the last, so a session's high is its last candle's */
  const t0 = Date.parse(`${day}T00:00:00+08:00`) / 1000, bars = [];
  for (let i = 0; i < 96; i++) { const o = 100 + i; bars.push([t0 + i * 900, o, o + 2, o - 1, o + 1]); }
  const all = M.sessionBoxes(S, bars, 15, 0, 95);
  const at = s => new Date((s + 8 * 3600) * 1000).toISOString().slice(11, 16);
  /* a replay at 21:30: New York is still going */
  const live = M.sessionBoxes(S, bars, 15, 0, 95, 86);
  return {
    boxes: all.map(B => `${B.name} ${at(B.t0)}–${at(B.t1)} ${B.lo}…${B.hi}`),
    live: live.map(B => `${B.name} ${at(B.t1)} ${B.hi}${B.live ? ' live' : ''}`),
    daily: M.sessionBoxes(S, bars, 1440, 0, 95).length,
    tf: [M.tfShort(1), M.tfShort(15), M.tfShort(60), M.tfShort(240), M.tfShort(1440), M.tfLong(1), M.tfLong(15), M.tfLong(60), M.tfLong(240)].join(','),
    l1: M.infoLines(S, 'XAUUSD', 15, Date.parse('2026-11-05T16:46:00+08:00')),
    l2: M.infoLines({ ...S, layout: 'Layout 2' }, 'XAUUSD', 60, Date.parse('2026-11-05T16:46:00+08:00')),
    late: M.infoLines(S, 'XAUUSD', 5, Date.parse('2026-11-05T17:30:00Z')),
    clean: M.tslSettings({ fillT: 140, borderW: -2, layout: 'Layout 9', sessions: [{ from: '7am', name: 'TOKYO' }], nameSize: 'Giant', infoSize: 'x' }),
    defaults: S,
  };
}, { day: '2026-09-15' });
t('three sessions a day, Perth time: ASIA 07–09, LONDON 14–16, NEW YORK 21–23', H.boxes.join(' | ') === 'ASIA 07:00–09:00 127…137 | LONDON 14:00–16:00 155…165 | NEW YORK 21:00–23:00 183…193', H.boxes.join(' | '));
t('in a replay the box stops at the present, and says it is still going', H.live.join(' | ') === 'ASIA 09:00 137 | LONDON 16:00 165 | NEW YORK 21:45 188 live', H.live.join(' | '));
t('nothing on the daily', H.daily === 0);
t('the script’s two timeframe spellings', H.tf === '1M,15M,1H,4H,1D,1 Minute,15 Minutes,1 Hour,4 Hours', H.tf);
t('Layout 1: the date, then the ticker and timeframe', H.l1.join(' / ') === '05/11/2026 / XAUUSD | 15M', H.l1.join(' / '));
t('Layout 2: the ticker, the timeframe in words, the day', H.l2.join(' / ') === 'XAUUSD / 1 Hour / Thu, 05 Nov 2026', H.l2.join(' / '));
t('the date is Perth’s (01:30 on the 6th there)', H.late[0] === '06/11/2026', H.late.join(' / '));
t('the script’s defaults: purple boxes, 0% fill, white Small names, chart info at the bottom middle', H.defaults.sessions.every(s => s.color === '#5A3E85') && H.defaults.fillT === 0 && H.defaults.borderW === 1
  && H.defaults.nameColor === '#FFFFFF' && H.defaults.nameSize === 'Small' && H.defaults.position === 'Bottom Middle' && H.defaults.layout === 'Layout 1' && H.defaults.infoSize === 14, JSON.stringify(H.defaults).slice(0, 160));
t('settings that make no sense are put right', H.clean.fillT === 100 && H.clean.borderW === 0 && H.clean.layout === 'Layout 1' && H.clean.sessions[0].from === '07:00' && H.clean.sessions[0].name === 'TOKYO'
  && H.clean.nameSize === 'Small' && H.clean.infoSize === 14, JSON.stringify(H.clean).slice(0, 200));

/* ===================== on the trade chart ===================== */
console.log('on the trade chart');
await go('#/trade/g1', 400);
await p.waitForFunction(() => { const c = document.querySelector('.tc'); return c && c.__chart && !c.__chart.loadingMore; }, null, { timeout: 10000 }).catch(() => {});
await settle(300);
const ch = () => p.evaluate(() => { const c = document.querySelector('.tc').__chart; return { shows: c.shows, boxes: c.tslBoxes(), tf: c.tf }; });
const leg = () => p.evaluate(() => { const l = document.querySelector('.tc .tsl-legend'); return l && !l.hidden ? { text: l.querySelector('.tv-pname').textContent, top: l.offsetTop } : null; });
await p.click('.tc-ind'); await settle(80);
t('3SL is in Indicators, last', await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mlabel')].map(x => x.textContent).pop()) === '3SL');
await p.click('.tv-menu .tc-ind-3sl'); await settle(300);
let C = await ch();
t('turned on, it boxes the sessions on the chart', C.shows.tsl === true && C.boxes.length > 0 && C.boxes.every(B => ['ASIA', 'LONDON', 'NEW YORK'].includes(B.name)), JSON.stringify(C.boxes.map(B => B.name)));
const day = await p.evaluate(() => { const c = document.querySelector('.tc').__chart, B = c.tslBoxes().filter(x => x.name === 'LONDON').pop(); if (!B) return null;
  const bars = c.barTimes().map((T, i) => [T, c.barAt(i)]).filter(([T]) => T >= B.t0 && T < B.t1).map(([, b]) => b);
  return { B, hi: Math.max(...bars.map(b => b[2])), lo: Math.min(...bars.map(b => b[3])), n: bars.length }; });
t('a box runs from its high to its low', !!day && Math.abs(day.B.hi - day.hi) < 1e-9 && Math.abs(day.B.lo - day.lo) < 1e-9 && day.n > 0, JSON.stringify(day && { hi: day.B.hi, lo: day.B.lo, wantHi: day.hi, wantLo: day.lo }));
/* how much of a box's rectangle is the script's purple (a candle drawn over it is not) */
const purple = name => p.evaluate(n => {
  const card = document.querySelector('.tc'), c = card.__chart, cv = card.querySelector('.tc-canvas'), dpr = cv.width / cv.clientWidth;
  /* the one on screen (the list starts a day back, so a session begun off the left edge is whole) */
  const B = c.tslBoxes().filter(x => x.name === n).find(x => c.xy(x.t0, x.hi).x >= 0 && c.xy(x.t1, x.lo).x <= c.pw);
  const a = c.xy(B.t0, B.hi), z = c.xy(B.t1, B.lo);
  const x0 = Math.round(a.x * dpr), y0 = Math.round(a.y * dpr), w = Math.max(1, Math.round((z.x - a.x) * dpr)), h = Math.max(1, Math.round((z.y - a.y) * dpr));
  const d = cv.getContext('2d').getImageData(x0, y0, w, h).data;
  let n2 = 0, all = 0;
  for (let i = 0; i < d.length; i += 4) { all++; if (Math.abs(d[i] - 0x5A) < 24 && Math.abs(d[i + 1] - 0x3E) < 24 && Math.abs(d[i + 2] - 0x85) < 24 && d[i + 3] > 200) n2++; }
  return { share: +(n2 / all).toFixed(2), w: z.x - a.x, h: z.y - a.y };
}, name);
const px = await purple('LONDON');
t('…in the script’s purple, filled (0% transparency), the candles over it', px.share > 0.4 && px.w > 4 && px.h > 4, JSON.stringify(px));
let L = await leg();
t('its name sits at the top left (the trade page’s chart has no status line), with settings and remove', L && L.text === '3SL' && L.top >= 6 && await p.locator('.tc .tsl-legend .tsl-settings').count() === 1, JSON.stringify(L));
t('…and it is remembered', await p.evaluate(() => localStorage.getItem('quire:chart3sl')) === '1');

/* its settings */
await p.hover('.tc .tsl-legend'); await p.click('.tc .tsl-legend .tsl-settings'); await settle(200);
t('Settings: Inputs, Style, Chart info', await p.evaluate(() => [...document.querySelectorAll('.tsl-dialog .tv-dtab')].map(x => x.textContent).join()) === 'Inputs,Style,Chart info');
t('…the three sessions, Perth time, with their names and colours', await p.evaluate(() => [0, 1, 2].map(i => `${document.querySelector('.tsl-from-' + i).value}-${document.querySelector('.tsl-to-' + i).value} ${document.querySelector('.tsl-name-' + i).value}`).join(', '))
  === '07:00-09:00 ASIA, 14:00-16:00 LONDON, 21:00-23:00 NEW YORK');
await p.fill('.tsl-name-1', 'LDN'); await p.locator('.tsl-name-1').dispatchEvent('change');
await p.click('.tsl-dialog .tv-dtab[data-tab="style"]'); await settle(80);
await p.fill('.tsl-fill', '80'); await p.locator('.tsl-fill').dispatchEvent('change');
await p.click('.tsl-dialog .tv-dtab[data-tab="info"]'); await settle(80);
await p.selectOption('.tsl-layout', 'Layout 2'); await settle(80);
await p.click('.tsl-dialog .tv-ok'); await settle(300);
const saved = await p.evaluate(() => JSON.parse(window.__files.get('data/drawings.json')).tsl);
t('Ok keeps them, for the whole app', saved?.sessions?.[1]?.name === 'LDN' && saved.fillT === 80 && saved.layout === 'Layout 2', JSON.stringify(saved && { n: saved.sessions[1].name, f: saved.fillT, l: saved.layout }));
C = await ch();
t('…and the chart takes them at once', C.boxes.some(B => B.name === 'LDN') && !C.boxes.some(B => B.name === 'LONDON'));
const lighter = await purple('LDN');
t('…80% fill transparency: only its border is the full purple now', lighter.share < 0.15 && lighter.share > 0, JSON.stringify(lighter));
await p.hover('.tc .tsl-legend'); await p.click('.tc .tsl-legend .tsl-settings'); await settle(200);
await p.click('.tsl-dialog .tsl-defaults'); await p.click('.tsl-dialog .tv-ok'); await settle(250);
t('Defaults puts the script’s own back', (await p.evaluate(() => JSON.parse(window.__files.get('data/drawings.json')).tsl.sessions[1].name)) === 'LONDON');
await p.hover('.tc .tsl-legend'); await p.click('.tc .tsl-legend .tsl-remove'); await settle(250);
C = await ch();
t('× takes it off the chart', C.shows.tsl === false && C.boxes.length === 0 && !(await leg()));

/* ===================== in Replay ===================== */
console.log('in Replay');
await p.clock.setFixedTime(NOW);
await p.evaluate(async now => { const R = await import('/js/replaydata.js'), Cd = await import('/js/candles.js'); await R.downloadPair('XAU_USD', await Cd.getKey(), { now }); }, NOW.getTime() / 1000);
await go('#/replay', 400);
const SID = await p.evaluate(async () => {
  const S = await import('/js/replaysessions.js'), { store } = await import('/js/store.js');
  return (await S.createSession(store, { name: '3SL practice', inst: 'XAU_USD', from: Date.parse('2026-09-08T00:00:00+08:00') / 1000, to: Date.parse('2026-09-17T23:59:00+08:00') / 1000 })).id;
});
await go('#/replay/session/' + SID, 300);
await p.waitForFunction(() => !!document.querySelector('.rs')?.__session, null, { timeout: 10000 }); await settle(400);
await p.evaluate(() => document.querySelector('.rs').__session.moveTo(Date.parse('2026-09-09T21:20:00+08:00') / 1000)); await settle(300);
await p.click('.rs-top .rs-ind'); await settle(80);
t('3SL is in Replay’s Indicators too', await p.locator('.tv-menu .rs-ind-tsl').count() === 1);
await p.click('.tv-menu .rs-ind-tsl'); await settle(300);
const ny = () => p.evaluate(() => document.querySelector('.rs').__session.charts[0].tsl.find(B => B.name === 'NEW YORK' && B.live));
const n1 = await ny();
const hm = T => new Date((T + 8 * 3600) * 1000).toISOString().slice(11, 16);
t('at 21:20 New York is boxed from 21:00 as far as it has got, and still going', !!n1 && hm(n1.t0) === '21:00' && hm(n1.t1) <= '21:30', JSON.stringify(n1 && { t0: hm(n1.t0), t1: hm(n1.t1) }));
await p.evaluate(() => document.querySelector('.rs').__session.moveTo(Date.parse('2026-09-09T22:10:00+08:00') / 1000)); await settle(300);
const n2 = await ny();
t('…and it grows with the replay', !!n2 && n2.t0 === n1.t0 && n2.t1 > n1.t1 && n2.hi >= n1.hi && n2.lo <= n1.lo, JSON.stringify(n2));
await p.waitForFunction(id => JSON.parse(window.__files.get('data/replay.json') || '{}').sessions?.find(s => s.id === id)?.ind?.tsl === true, SID, { timeout: 5000 }).catch(() => {});
t('…kept with the session', (await p.evaluate(id => JSON.parse(window.__files.get('data/replay.json')).sessions.find(s => s.id === id).ind.tsl, SID)) === true);
const mk = await p.evaluate(() => { const b = document.querySelector('.rs-bar'), m = b?.querySelector('.rs-mark'); if (!m) return null;
  const r = m.getBoundingClientRect(), w = b.querySelector('.rs-when').getBoundingClientRect(), br = b.getBoundingClientRect();
  return { last: b.lastElementChild === m, after: r.left >= w.right, inside: r.right <= br.right, h: Math.round(m.querySelector('svg').getBoundingClientRect().height) }; });
t('the floating bar ends with the Laminar mark, after the time', mk && mk.last && mk.after && mk.inside && mk.h === 16, JSON.stringify(mk));
const gr = await p.evaluate(() => { const g = document.querySelector('.rs-bar .tv-grip'), sv = g?.querySelector('svg'); if (!sv) return null;
  const dots = [...sv.querySelectorAll('circle')].map(c => c.getBoundingClientRect());
  return { first: g.parentElement.firstElementChild === g, dots: dots.length, across: new Set(dots.map(r => Math.round(r.left))).size, down: new Set(dots.map(r => Math.round(r.top))).size,
    size: +dots[0].width.toFixed(1), colour: getComputedStyle(g).color }; });
t('the bar starts with six dots to drag it by, two across and three down, big enough to see', gr && gr.first && gr.dots === 6 && gr.across === 2 && gr.down === 3 && gr.size >= 2, JSON.stringify(gr));
t('its name is on the Replay chart as well', await p.evaluate(() => { const l = document.querySelector('.rs-pane .tsl-legend'); return !!l && !l.hidden; }));

/* ===================== the Replay order tags ===================== */
console.log('the order tags');
const tags = await p.evaluate(() => {
  document.documentElement.style.setProperty('--profit', '#FFFFFF');
  const host = document.querySelector('.rs-pane') || document.body;
  const mk = (kind, up) => { const n = document.createElement('div'); n.className = 'rt-cl is-' + kind;
    n.innerHTML = `<span class="rt-qty is-${kind}">30.0</span><span class="rt-pnl ${up ? 'is-up' : 'is-down'}">x</span>`; host.append(n); return n; };
  const out = {};
  for (const [k, up] of [['tp', true], ['e', true], ['e', false], ['sl', false]]) {
    const n = mk(k, up), q = getComputedStyle(n.querySelector('.rt-qty')), v = getComputedStyle(n.querySelector('.rt-pnl'));
    out[`${k}${up ? '+' : '-'}`] = [q.backgroundColor, q.color, v.backgroundColor, v.color]; n.remove();
  }
  document.documentElement.style.removeProperty('--profit');
  return out;
});
const BLUE = 'rgb(41, 98, 255)', RED = 'rgb(224, 50, 43)', W = 'rgb(255, 255, 255)';
t('with a white win colour the target tag is blue, its writing white', tags['tp+'][0] === BLUE && tags['tp+'][1] === W && tags['tp+'][2] === BLUE && tags['tp+'][3] === W, JSON.stringify(tags['tp+']));
t('the position: blue, its profit blue, its loss red', tags['e+'][0] === BLUE && tags['e+'][2] === BLUE && tags['e-'][2] === RED, JSON.stringify([tags['e+'], tags['e-']]));
t('the stop: red', tags['sl-'][0] === RED && tags['sl-'][2] === RED, JSON.stringify(tags['sl-']));

t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
