/* Indicators: the Relative Strength Index (TradingView's numbers on the
   same candles), Sessions and News — on the trade chart and in Replay.

   By hand first: the RSI against Wilder's own worked example, computed
   independently here, and the RSI-based moving averages. Then on a gold
   trade's chart: adding it, its pane, its legend, the crosshair across
   panes, its settings (Inputs, Style, Visibility), removing it. Then in a
   Replay session: the Indicators menu, the RSI on the forming candle,
   Sessions and News. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB } from '../fixtures/ghost-fixture.mjs';
import { KEY, SERIES, oandaRoute } from '../fixtures/oanda-mock.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const perth = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+08:00`) / 1000;
const ORIGIN = Date.UTC(2026, 8, 7) / 1000;
const G_IN = +SERIES.XAU_USD[0][Math.round((perth('2026-09-15', '15:35') - ORIGIN) / 60)].toFixed(2);
const TR = [{ id: 'g1', accountId: 'acc_1', riskPercent: 1, mode: 'live', sessionId: 'ses_l', setupId: 's_fvg', tagIds: [], notes: '',
  pair: 'XAUUSD', side: 'buy', date: '2026-09-15', timeOpen: '15:35', timeClose: '18:50', status: 'closed',
  entryPrice: G_IN, stopLoss: +(G_IN - 4.5).toFixed(2), takeProfit: +(G_IN + 13.5).toFixed(2), exitPrice: +(G_IN + 13.5).toFixed(2), exitReason: 'tp', netResult: 3000, execTf: '5m' }];
const NEWS = { version: 1, fetchedAt: '2026-09-18T03:55:00.000Z', events: [
  { id: 'cpi', title: 'CPI m/m', country: 'USD', at: new Date(perth('2026-09-09', '20:30') * 1000).toISOString(), impact: 'High', forecast: '', previous: '' },
  { id: 'eur', title: 'ECB Press Conference', country: 'EUR', at: new Date(perth('2026-09-09', '20:45') * 1000).toISOString(), impact: 'High', forecast: '', previous: '' },
  { id: 'low', title: 'Jobless Claims', country: 'USD', at: new Date(perth('2026-09-09', '20:30') * 1000).toISOString(), impact: 'Medium', forecast: '', previous: '' }] };

const NOW = new Date('2026-09-20T12:00:00+08:00');
const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Australia/Perth' });
await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, oandaRoute([], { mode: 'ok' }));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_|net::|401/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(new Date('2026-09-18T12:00:00+08:00'));
await p.addInitScript(({ ACCT, TR, PB, KEY, NEWS }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('quire:setting:oandaKey', KEY);
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)], ['data/news.json', JSON.stringify(NEWS)]]));
}, { ACCT, TR, PB, KEY, NEWS });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 250) => p.waitForTimeout(ms);
const go = async (h, ms = 500) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };
const shot = async name => { try { await p.screenshot({ path: `${OUT}/indicators-${name}.png` }); } catch { /* fine */ } };

/* ===================== by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async () => {
  const R = await import('/js/chart/rsi.js');
  /* Wilder's worked example (New Concepts in Technical Trading Systems; the
     StockCharts table), worked out here the long way: the first average is a
     plain mean of 14 changes, then ((n − 1) × last + this) / n */
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13];
  const n = 14; let g = 0, l = 0; const want = [];
  for (let i = 1; i <= n; i++) { const c = closes[i] - closes[i - 1]; if (c > 0) g += c; else l -= c; }
  let ag = g / n, al = l / n; want.push(100 - 100 / (1 + ag / al));
  for (let i = n + 1; i < closes.length; i++) { const c = closes[i] - closes[i - 1]; ag = (ag * (n - 1) + Math.max(c, 0)) / n; al = (al * (n - 1) + Math.max(-c, 0)) / n; want.push(100 - 100 / (1 + ag / al)); }
  const bars = closes.map((c, i) => [i * 60, c, c, c, c]);
  const S = R.rsiSettings({});
  const got = R.computeRsi(bars, bars.length - 1, S);
  /* the averages of the RSI, by hand */
  const rs = got.rsi.filter(v => v != null);
  const smaBy = rs.slice(0, 14).reduce((a, v) => a + v, 0) / 14;
  const sma5 = R.computeRsi(bars, bars.length - 1, R.rsiSettings({ maType: 'SMA', maLength: 5 })).ma;
  const ema5 = R.computeRsi(bars, bars.length - 1, R.rsiSettings({ maType: 'EMA', maLength: 5 })).ma;
  const wma3 = R.computeRsi(bars, bars.length - 1, R.rsiSettings({ maType: 'WMA', maLength: 3 })).ma;
  const rma5 = R.computeRsi(bars, bars.length - 1, R.rsiSettings({ maType: 'SMMA (RMA)', maLength: 5 })).ma;
  const bb = R.computeRsi(bars, bars.length - 1, R.rsiSettings({ maType: 'SMA + Bollinger Bands', maLength: 5, bbMult: 2 }));
  const first5 = rs.slice(0, 5), mean5 = first5.reduce((a, v) => a + v, 0) / 5;
  const ema6 = (2 / 6) * rs[5] + (1 - 2 / 6) * mean5, rma6 = (1 / 5) * rs[5] + (1 - 1 / 5) * mean5;
  const wmaBy = (rs[0] * 1 + rs[1] * 2 + rs[2] * 3) / 6;
  const sd = Math.sqrt(first5.reduce((a, v) => a + (v - mean5) ** 2, 0) / 5);
  const flat = R.computeRsi([[0, 1, 1, 1, 1], ...Array.from({ length: 20 }, (_, i) => [60 * (i + 1), 2 + i, 2 + i, 2 + i, 2 + i])], 20, S).rsi;
  return { want, got: got.rsi, firstAt: got.rsi.findIndex(v => v != null), sma14: got.ma, smaBy, sma5, ema5, wma3, rma5, bb, mean5, ema6, rma6, wmaBy, sd, flat: flat[20],
    clean: R.rsiSettings({ length: 0, source: 'nope', maType: 'odd', rsi: { color: 5 }, hideOn: [60, 'x'] }) };
});
const near = (a, b2, e = 1e-9) => a != null && Math.abs(a - b2) < e;
t('RSI: Wilder’s worked example — 70.46 on the 15th close, then every one after, to the last digit', H.firstAt === 14 && near(H.got[14], 70.46, 0.005)
  && H.want.every((v, k) => near(H.got[14 + k], v)), JSON.stringify(H.got.slice(14, 18).map(v => v.toFixed(2))));
t('nothing before there are 14 changes', H.got.slice(0, 14).every(v => v === null));
t('only gains: 100', H.flat === 100);
t('the default average: SMA 14 of the RSI', H.sma14[27] != null && H.sma14[26] === null && near(H.sma14[27], H.smaBy), `${H.sma14[27]} vs ${H.smaBy}`);
t('SMA 5', near(H.sma5[18], H.mean5));
t('EMA 5 starts from the SMA, then 2/(n+1)', near(H.ema5[18], H.mean5) && near(H.ema5[19], H.ema6));
t('SMMA (RMA) 5: the same start, then 1/n', near(H.rma5[18], H.mean5) && near(H.rma5[19], H.rma6));
t('WMA 3: weighted 1, 2, 3', near(H.wma3[16], H.wmaBy));
t('Bollinger Bands: the SMA ± 2 standard deviations (population)', near(H.bb.upper[18], H.mean5 + 2 * H.sd) && near(H.bb.lower[18], H.mean5 - 2 * H.sd));
t('settings that make no sense are put right', H.clean.length === 1 && H.clean.source === 'close' && H.clean.maType === 'SMA' && H.clean.rsi.color === '#7E57C2' && JSON.stringify(H.clean.hideOn) === '[60]');

/* ===================== on the trade chart ===================== */
console.log('on the trade chart');
await go('#/trade/g1', 400);
await p.waitForFunction(() => { const c = document.querySelector('.tc'); return c && c.__chart && !c.__chart.loadingMore; }, null, { timeout: 10000 }).catch(() => {});
await settle(300);
const ch = () => p.evaluate(() => { const c = document.querySelector('.tc').__chart; return { ph: c.ph, areas: c.core.areas(), shows: c.shows, tf: c.tf }; });
const legend = () => p.evaluate(() => { const l = document.querySelector('.tc .rsi-legend'); return l && !l.hidden ? l.textContent : null; });
const ph0 = (await ch()).ph;
await p.click('.tc-ind'); await settle(80);
t('Indicators: the Relative Strength Index, Sessions, News', await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mlabel')].map(x => x.textContent).join() === 'Relative Strength Index,Sessions,News · red folders'));
await p.click('.tv-menu .tc-ind-rsi'); await settle(250);
let C = await ch();
t('the RSI comes in its own pane under the candles, the time scale still at the bottom', C.areas.length === 1 && C.areas[0].key === 'rsi' && C.ph < ph0 - 60 && C.areas[0].top > C.ph && C.shows.rsi, JSON.stringify(C));
t('…remembered for the trade charts', await p.evaluate(() => localStorage.getItem('quire:chartRsi')) === '1');
const last = await p.evaluate(async () => {
  const c = document.querySelector('.tc').__chart, R = await import('/js/chart/rsi.js');
  const bars = c.core.bars, k = c.core.limit();
  /* the long way, on the chart's own 5m closes */
  let ag = 0, al = 0; const n = 14;
  for (let i = 1; i <= n; i++) { const d = bars[i][4] - bars[i - 1][4]; if (d > 0) ag += d; else al -= d; }
  ag /= n; al /= n;
  for (let i = n + 1; i <= k; i++) { const d = bars[i][4] - bars[i - 1][4]; ag = (ag * (n - 1) + Math.max(d, 0)) / n; al = (al * (n - 1) + Math.max(-d, 0)) / n; }
  return { mine: 100 - 100 / (1 + ag / al), shown: c.rsi.values().rsi };
});
t('its value on the newest candle is Wilder’s RSI of the chart’s closes', near(last.shown, last.mine, 1e-9), JSON.stringify(last));
t('the legend: RSI 14 close SMA 14, the two values', /^RSI 14 close SMA 14/.test(await legend()) && (await legend()).includes(last.shown.toFixed(2)), await legend());
await shot('rsi');
/* the crosshair goes through both panes; in the RSI pane it reads the RSI */
const box = await p.evaluate(() => { const r = document.querySelector('.tc-canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; });
const rsiMid = C.areas[0].top + C.areas[0].h / 2;
await p.mouse.move(box.x + 300, box.y + rsiMid); await settle(150);
const hovered = await p.evaluate(x => { const c = document.querySelector('.tc').__chart, g = c.core.geom(); const i = Math.floor(g.iX(x)); return { i, v: c.rsi.series().rsi[i] }; }, 300);
t('hover the RSI pane: its legend reads the candle under the crosshair', (await legend()).includes(hovered.v.toFixed(2)), `${await legend()} vs ${hovered.v}`);
const labelPx = await p.evaluate(({ y }) => { const c = document.querySelector('.tc-canvas'), k = devicePixelRatio || 1, ch = document.querySelector('.tc').__chart; return [...c.getContext('2d').getImageData(Math.round((ch.pw + 5) * k), Math.round(y * k), 1, 1).data]; }, { y: rsiMid });
const LABEL = await p.evaluate(() => { const h = document.querySelector('.tc').__chart.core.palette().label.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); });
t('…and its value is tagged on the RSI pane’s own scale', Math.abs(labelPx[0] - LABEL[0]) < 8 && Math.abs(labelPx[1] - LABEL[1]) < 8, JSON.stringify([labelPx, LABEL]));
/* dragging in the RSI pane moves time, not prices */
const y0 = await p.evaluate(() => ({ ...document.querySelector('.tc').__chart.yRange, s: document.querySelector('.tc').__chart.view.start }));
await p.mouse.down(); await p.mouse.move(box.x + 420, box.y + rsiMid + 40, { steps: 5 }); await p.mouse.up(); await settle(150);
const y1 = await p.evaluate(() => ({ ...document.querySelector('.tc').__chart.yRange, s: document.querySelector('.tc').__chart.view.start }));
t('dragging in the RSI pane moves time; the candles’ prices stay', y1.s < y0.s - 3 && y1.lo === y0.lo && y1.hi === y0.hi, JSON.stringify([y0, y1]));
/* the line above the RSI: drag it down for a smaller pane, kept */
C = await ch();
const lineY = C.areas[0].top - 1;
await p.mouse.move(box.x + 300, box.y + lineY); await settle(80);
t('over the line above the RSI: the up-down resize pointer', await p.evaluate(() => document.querySelector('.tc .tc-plot').classList.contains('on-divider') && getComputedStyle(document.querySelector('.tc .tc-canvas')).cursor === 'row-resize'));
await p.mouse.down(); await p.mouse.move(box.x + 300, box.y + lineY + 40, { steps: 6 }); await settle(60);
const midDrag = await ch();
await p.mouse.up(); await settle(200);
const C2 = await ch();
const kept = await p.evaluate(() => JSON.parse(window.__files.get('data/drawings.json')).rsi?.height);
t('drag it down: the RSI pane shorter, the candles taller — as you drag', midDrag.areas[0].h < C.areas[0].h - 30 && midDrag.ph > C.ph + 30, JSON.stringify([C.areas[0].h, midDrag.areas[0].h]));
t('…kept when let go', Math.abs(C2.areas[0].h - midDrag.areas[0].h) <= 1 && kept > 0.05 && kept < 0.2, String(kept));
await p.mouse.move(box.x + 300, box.y + C2.areas[0].top - 1); await p.mouse.down(); await p.mouse.move(box.x + 300, box.y + C2.areas[0].top - 61, { steps: 6 }); await p.mouse.up(); await settle(200);
t('…and up again: taller', (await ch()).areas[0].h > C2.areas[0].h + 45);
/* settings */
console.log('RSI settings');
await p.hover('.tc .rsi-legend'); await p.click('.tc .rsi-legend .rsi-settings'); await settle(150);
t('⚙ on the legend: RSI settings — Inputs, Style, Visibility', await p.evaluate(() => [...document.querySelectorAll('.rsi-dialog .tv-dtab')].map(x => x.textContent).join() === 'Inputs,Style,Visibility'));
await p.click('.rsi-dialog .tv-dtab[data-tab="inputs"]'); await settle(60);
await p.fill('.rsi-length', '7'); await p.press('.rsi-length', 'Tab'); await settle(150);
t('Length 7 shows at once', /^RSI 7 close/.test(await legend()), await legend());
await p.click('.rsi-dialog .tv-cancel'); await settle(150);
t('…Cancel puts 14 back', /^RSI 14 close/.test(await legend()));
await p.hover('.tc .rsi-legend'); await p.click('.tc .rsi-legend .rsi-settings'); await settle(150);
await p.fill('.rsi-length', '21'); await p.press('.rsi-length', 'Tab');
await p.selectOption('.rsi-source', 'hlc3'); await p.selectOption('.rsi-matype', 'EMA'); await settle(100);
await p.fill('.rsi-malength', '9'); await p.press('.rsi-malength', 'Tab'); await settle(100);
await p.click('.rsi-dialog .tv-dtab[data-tab="style"]'); await settle(60);
await p.fill('.rsi-upper', '80'); await p.press('.rsi-upper', 'Tab'); await p.fill('.rsi-lower', '20'); await p.press('.rsi-lower', 'Tab'); await settle(80);
await p.click('.rsi-dialog .tv-ok'); await settle(200);
const saved = await p.evaluate(() => JSON.parse(window.__files.get('data/drawings.json')).rsi);
t('Ok: length 21 on (H+L+C)/3, an EMA 9, bands 80 / 20 — kept in the vault for every chart', saved?.length === 21 && saved.source === 'hlc3' && saved.maType === 'EMA' && saved.maLength === 9 && saved.bands.upper === 80 && saved.bands.lower === 20, JSON.stringify(saved));
t('…the legend says so', /^RSI 21 hlc3 EMA 9/.test(await legend()), await legend());
const ticksNow = await p.evaluate(() => { const c = document.querySelector('.tc').__chart; return c.rsi.ticks({ lo: 0, hi: 100 }); });
t('…the bands on its scale: 80, 50, 20', JSON.stringify(ticksNow) === '[80,50,20]', JSON.stringify(ticksNow));
await p.hover('.tc .rsi-legend'); await p.click('.tc .rsi-legend .rsi-settings'); await settle(150);
await p.click('.rsi-dialog .tv-dtab[data-tab="style"]'); await p.click('.rsi-s-ma'); await settle(80);
await p.click('.rsi-dialog .tv-dtab[data-tab="visibility"]'); await p.click('.rsi-v-5m'); await settle(80);
await p.click('.rsi-dialog .tv-ok'); await settle(200);
C = await ch();
t('Visibility: off on 5m — the pane goes there', C.tf === 5 && C.areas.length === 0, JSON.stringify(C.areas));
await p.click('.tc-seg button[data-tf="15m"]'); await settle(200);
t('…and is there on 15m, without its average', (await ch()).areas.length === 1 && (await p.evaluate(() => document.querySelectorAll('.tc .rsi-legend b').length)) === 1);
await p.hover('.tc .rsi-legend'); await p.click('.tc .rsi-legend .rsi-settings'); await settle(150);
await p.click('.rsi-defaults'); await p.click('.rsi-dialog .tv-ok'); await settle(200);
t('Defaults: back to RSI 14 close SMA 14', /^RSI 14 close SMA 14/.test(await legend()) && (await p.evaluate(() => JSON.parse(window.__files.get('data/drawings.json')).rsi.length)) === 14);
await p.hover('.tc .rsi-legend'); await p.click('.tc .rsi-legend .rsi-remove'); await settle(200);
t('× on the legend takes it off, and that is remembered', (await ch()).areas.length === 0 && await p.evaluate(() => localStorage.getItem('quire:chartRsi')) === '0');

/* ===================== in Replay ===================== */
console.log('in Replay');
await p.clock.setFixedTime(NOW);
await p.evaluate(async now => { const R = await import('/js/replaydata.js'), Cd = await import('/js/candles.js'); await R.downloadPair('XAU_USD', await Cd.getKey(), { now }); }, NOW.getTime() / 1000);
await go('#/replay', 400);
const SID = await p.evaluate(async () => {
  const S = await import('/js/replaysessions.js'), { store } = await import('/js/store.js');
  return (await S.createSession(store, { name: 'RSI practice', inst: 'XAU_USD', from: Date.parse('2026-09-08T00:00:00+08:00') / 1000, to: Date.parse('2026-09-17T23:59:00+08:00') / 1000 })).id;
});
await go('#/replay/session/' + SID, 300);
await p.waitForFunction(() => !!document.querySelector('.rs')?.__session, null, { timeout: 10000 }); await settle(400);
await p.evaluate(() => document.querySelector('.rs').__session.moveTo(Date.parse('2026-09-09T21:07:00+08:00') / 1000)); await settle(300);
const RS = () => p.evaluate(() => { const s = document.querySelector('.rs').__session; return { ind: s.ind, c: s.charts[0], T: s.T }; });
let R = await RS();
t('a session starts with Sessions and News on, the RSI off', JSON.stringify(R.ind) === '{"sessions":true,"news":true,"rsi":false}' && R.c.areas.length === 0);
t('News: red folders for the pair’s own currency only — CPI, not the ECB or a medium one', JSON.stringify(R.c.groups.map(g => g.titles)) === '[["CPI m/m"]]', JSON.stringify(R.c.groups));
await p.click('.rs-top .rs-ind'); await settle(80);
t('the Indicators button in the top bar', await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mlabel')].map(x => x.textContent).join() === 'Relative Strength Index,Sessions,News · red folders'));
await p.click('.tv-menu .rs-ind-rsi'); await settle(300);
R = await RS();
t('the RSI in its pane, kept with the session', R.c.areas.length === 1 && R.ind.rsi === true);
await settle(700);
t('…saved', (await p.evaluate(id => JSON.parse(window.__files.get('data/replay.json')).sessions.find(s => s.id === id).ind.rsi, SID)) === true);
const forming = await p.evaluate(async () => {
  const s = document.querySelector('.rs').__session, R = await import('/js/chart/rsi.js'), c = s.charts[0];
  const bars = s.core().bars.slice(0, c.k + 1);              // the forming candle as shown
  const v = R.computeRsi(bars, c.k, R.rsiSettings({})).rsi[c.k];
  return { shown: c.rsi.rsi, v, partialClose: c.last[4] };
});
t('in a replay the RSI counts the forming candle as far as it has got — nothing after', near(forming.shown, forming.v), JSON.stringify(forming));
const before = (await RS()).c.rsi.rsi;
await p.click('.rs-bar .rs-fwd'); await settle(200);
t('…and moves with the replay', (await RS()).c.rsi.rsi !== before);
await shot('replay');
/* Sessions on and off */
const lit = () => p.evaluate(() => { const c = document.querySelector('.rs-pane .tc-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
const withS = await lit();
await p.click('.rs-top .rs-ind'); await p.click('.tv-menu .rs-ind-sessions'); await settle(250);
const noS = await lit();
t('Sessions off: the Playbook sessions are no longer shaded', noS < withS - 2000 && (await RS()).ind.sessions === false, `${withS} → ${noS}`);
await p.click('.rs-top .rs-ind'); await p.click('.tv-menu .rs-ind-news'); await settle(250);
t('News off: no marks', (await RS()).c.groups.length === 0);
await p.click('.rs-top .rs-exit'); await settle(300);

t('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
