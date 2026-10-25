/* The drawing tools, TradingView's way: Trend line, Rectangle, Callout,
   Long and Short position — down the left of every chart.

   By hand first: a line from the old Line tool reads as a dotted trend line,
   the position tool's size and amounts the OANDA way, what price did inside
   a position, the time boxes in the chart's timezone. Then on a gold trade:
   drawing (click–click, drag, Shift), the magnet, selecting, dragging a
   handle or the whole thing, the floating toolbar, the settings dialog,
   templates, visibility by timeframe, locking, the favourites bar, the
   right-click menu, hiding and removing. */
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
const priceAt = s => SERIES.XAU_USD[0][Math.round((s - ORIGIN) / 60)];
const G_IN = +priceAt(perth('2026-09-15', '15:35')).toFixed(2);
const TR = [{ id: 'g1', accountId: 'acc_1', riskPercent: 1, mode: 'live', sessionId: 'ses_l', setupId: 's_fvg', tagIds: [], notes: '',
  pair: 'XAUUSD', side: 'buy', date: '2026-09-15', timeOpen: '15:35', timeClose: '18:50', status: 'closed',
  entryPrice: G_IN, stopLoss: +(G_IN - 4.5).toFixed(2), takeProfit: +(G_IN + 13.5).toFixed(2), exitPrice: +(G_IN + 13.5).toFixed(2),
  exitReason: 'tp', netResult: 3000, execTf: '5m' }];
const OLD = { id: 'old1', t1: perth('2026-09-15', '13:00'), t2: perth('2026-09-15', '14:30'), p: +(G_IN + 3).toFixed(2), label: 'BOS', at: '2026-09-30T00:00:00Z' };

const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Australia/Perth' });
await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, oandaRoute([], { mode: 'ok' }));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_|401|net::/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(new Date('2026-09-18T12:00:00+08:00'));
await p.addInitScript(({ ACCT, TR, PB, OLD, KEY }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('quire:setting:oandaKey', KEY);
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)],
    ['data/drawings.json', JSON.stringify({ version: 1, lines: { XAU_USD: [OLD] } })]]));
}, { ACCT, TR, PB, OLD, KEY });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 200) => p.waitForTimeout(ms);
const go = async (h, ms = 500) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };
const chartReady = async () => { await p.waitForFunction(() => { const c = document.querySelector('.tc'); return c && c.__chart && !c.__chart.loadingMore; }, null, { timeout: 10000 }).catch(() => {}); await settle(250); };
/* what the canvas was asked to draw, while spying */
const spy = () => p.evaluate(() => {
  const P = CanvasRenderingContext2D.prototype;
  if (!P.__spied) {
    P.__spied = true;
    for (const m of ['stroke', 'fillRect', 'fill', 'fillText', 'clearRect']) {
      const f = P[m];
      P[m] = function (...a) { if (window.__spy) window.__spy.push({ m, dash: this.getLineDash().join(), cap: this.lineCap, fill: this.fillStyle, stroke: this.strokeStyle, text: m === 'fillText' ? String(a[0]) : null, x: m === 'fillText' ? a[1] : m === 'clearRect' ? a[0] : null, y: m === 'clearRect' ? a[1] : null }); return f.apply(this, a); };
    }
  }
  window.__spy = [];
});
const spied = async () => { await settle(120); return p.evaluate(() => { const s = window.__spy; window.__spy = null; return s; }); };
const redraw = () => p.evaluate(() => document.querySelector('.tc').__chart.core.draw());
const shot = async name => { try { await p.screenshot({ path: `${OUT}/drawings-${name}.png` }); } catch { /* fine */ } };
const file = () => p.evaluate(() => { try { return JSON.parse(window.__files.get('data/drawings.json')); } catch { return null; } });
const gold = async () => (await file())?.lines?.XAU_USD || [];
const C = () => p.evaluate(() => { const c = document.querySelector('.tc').__chart; return { tool: c.drawing, sel: c.dr.selected, hidden: c.dr.hidden, shapes: c.dr.shapes(), count: c.lineCount(), tf: c.tf }; });

/* ===================== by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async () => {
  const D = await import('/js/chart/drawings.js'), DD = await import('/js/chart/drawdialog.js');
  const old = D.normalize({ id: 'x', t1: 100, t2: 200, p: 5, label: 'BOS' });
  const pos = (type, entry, tp, sl, inputs) => ({ type, pts: [{ t: 0, p: entry }, { t: 600, p: entry }], tp, sl, inputs });
  const gold = D.positionNumbers('XAU_USD', pos('long', 4000, 4030, 3990, { account: 100000, risk: 1, riskMode: '%' }));
  const goldShort = D.positionNumbers('XAU_USD', pos('short', 4000, 3970, 4010, { account: 50000, risk: 250, riskMode: '$' }));
  const jpy = D.positionNumbers('USD_JPY', pos('long', 150, 151, 149.5, { account: 100000, risk: 1, riskMode: '%' }));
  const cross = D.positionNumbers('EUR_GBP', pos('long', 0.85, 0.86, 0.845, { account: 100000, risk: 1, riskMode: '%' }));
  const rows = [[0, 4000, 4001, 3999, 4000], [60, 4000, 4005, 3995, 4004], [120, 4004, 4031, 4003, 4030], [180, 4030, 4031, 3980, 3990]];
  const L = pos('long', 4000, 4030, 3990);
  const both = [[0, 4000, 4035, 3985, 4000]];
  return { old, gold: { qty: gold.qty, stop: gold.stopAmt, target: gold.targetAmt, rr: gold.rr, cur: gold.cur, pnl: gold.pnl(4010) },
    short: { qty: goldShort.qty, pnl: goldShort.pnl(3990), rr: goldShort.rr },
    jpy: { qty: jpy.qty, stop: jpy.stopAmt, cur: jpy.cur }, cross: { cur: cross.cur, stop: cross.stopAmt },
    target: D.positionOutcome(rows, L), stop: D.positionOutcome(rows, pos('long', 4000, 4100, 3996)), sameBar: D.positionOutcome(both, L),
    open: D.positionOutcome(rows.slice(0, 2), L), until: D.positionOutcome(rows, L, 60),
    tz: [DD.toLocalInput('Australia/Perth', Date.UTC(2026, 8, 15, 7, 35) / 1000), DD.fromLocalInput('Australia/Perth', '2026-09-15T15:35'),
      DD.toLocalInput('America/New_York', Date.UTC(2026, 8, 15, 7, 35) / 1000), DD.fromLocalInput('America/New_York', '2026-09-15T03:35')],
    defaults: ['trend', 'rect', 'callout', 'long'].map(k => Object.keys(D.defaultsOf(k).style).length > 0),
    posStyle: D.defaultsOf('long').style,
    migrated: D.normalize({ id: 'p', type: 'short', pts: [{ t: 0, p: 1 }, { t: 60, p: 1 }], tp: 0.9, sl: 1.1, style: { profit: 'rgba(8, 153, 129, 0.2)', stop: 'rgba(242, 54, 69, 0.2)', textColor: '#FFFFFF' } }).style,
    kept: D.normalize({ id: 'q', type: 'long', pts: [{ t: 0, p: 1 }, { t: 60, p: 1 }], tp: 1.1, sl: 0.9, style: { profit: 'rgba(0, 0, 255, 0.3)' } }).style,
    ink: await import('/js/chart/core.js').then(K => ['#FFFFFF', '#F5F5F5', '#18AC65', '#F4624A', '#000000', 'rgba(255, 255, 255, 1)', '#FFB800'].map(K.inkOn)),
  };
});
t('a position’s colours are the candles’ by default (auto), the old fixed ones become that too; a colour of its own stays',
  H.posStyle.profit === 'auto' && H.posStyle.stop === 'auto' && H.posStyle.textColor === 'auto' && H.migrated.profit === 'auto' && H.migrated.stop === 'auto' && H.migrated.textColor === 'auto'
  && H.kept.profit === 'rgba(0, 0, 255, 0.3)' && H.kept.stop === 'auto', JSON.stringify([H.posStyle, H.migrated, H.kept]));
t('text on a colour: dark on white or light ones, white on the rest', JSON.stringify(H.ink) === JSON.stringify(['#131722', '#131722', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#131722', '#131722']), JSON.stringify(H.ink));
t('a line from the old Line tool reads as a dotted trend line, its label above it', H.old.type === 'trend' && H.old.style.dash === 'dotted' && H.old.text.value === 'BOS'
  && H.old.text.v === 'top' && H.old.pts[0].t === 100 && H.old.pts[1].t === 200 && H.old.pts.every(x => x.p === 5), JSON.stringify(H.old));
t('Long gold, 1% of $100,000 risked over $10: 100 oz; target $3,000, stop $1,000, 3 : 1', Math.abs(H.gold.qty - 100) < 1e-9 && Math.abs(H.gold.target - 3000) < 1e-6
  && Math.abs(H.gold.stop - 1000) < 1e-6 && Math.abs(H.gold.rr - 3) < 1e-9 && H.gold.cur === 'USD' && Math.abs(H.gold.pnl - 1000) < 1e-6, JSON.stringify(H.gold));
t('Short gold, $250 risked over $10: 25 oz; $10 lower is +$250', Math.abs(H.short.qty - 25) < 1e-9 && Math.abs(H.short.pnl - 250) < 1e-6 && Math.abs(H.short.rr - 3) < 1e-9, JSON.stringify(H.short));
t('USDJPY: yen turned into dollars through the price — the stop still costs the 1%', Math.abs(H.jpy.stop - 1000) < 1e-6 && H.jpy.cur === 'USD', JSON.stringify(H.jpy));
t('EURGBP: no dollars in it — amounts said in pounds', H.cross.cur === 'GBP' && Math.abs(H.cross.stop - 1000) < 1e-6, JSON.stringify(H.cross));
t('what price did: the target, the candle that reached it', H.target?.state === 'target' && H.target.t === 120 && H.target.p === 4030, JSON.stringify(H.target));
t('…the stop', H.stop?.state === 'stop' && H.stop.t === 60 && H.stop.p === 3996, JSON.stringify(H.stop));
t('…both in one candle: the stop', H.sameBar?.state === 'stop', JSON.stringify(H.sameBar));
t('…neither yet: open, at the last close', H.open?.state === 'open' && H.open.p === 4004 && H.open.t === 60, JSON.stringify(H.open));
t('…only up to the replay’s moment', H.until?.state === 'open' && H.until.t === 60, JSON.stringify(H.until));
t('Coordinates: times shown and read in the chart’s timezone', JSON.stringify(H.tz) === JSON.stringify(['2026-09-15T15:35', Date.UTC(2026, 8, 15, 7, 35) / 1000, '2026-09-15T03:35', Date.UTC(2026, 8, 15, 7, 35) / 1000]), JSON.stringify(H.tz));

/* ===================== on the chart ===================== */
console.log('on the chart');
await go('#/trade/g1', 400); await chartReady();
let box = await p.evaluate(() => { const r = document.querySelector('.tc-canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const G = () => p.evaluate(() => { const g = document.querySelector('.tc').__chart.core.geom(); return { pw: g.pw, ph: g.ph, start: g.start, spacing: g.spacing, lo: g.lo, hi: g.hi }; });
/* a moment and price → where it is on screen, the way the drawings place points (the middle of the candle) */
const at = (T, price) => p.evaluate(({ T, price }) => { const c = document.querySelector('.tc').__chart.core, g = c.geom(); return { x: g.xT(T) + g.spacing / 2, y: g.Y(price) }; }, { T, price });
let S = await C();
t('the old line is there, now a trend line', S.count === 1 && S.shapes.some(s => s.id === 'old1'));
const tools = await p.evaluate(() => [...document.querySelectorAll('.tc .tv-left .tv-lb')].map(b => b.title));
t('down the left: cross, Trend line, Rectangle, Callout, Long, Short, magnet, hide, remove — no highlighter', tools.slice(0, 6).join() === 'Cross,Trend line,Rectangle,Callout,Long position,Short position' && tools.length === 9, tools.join(' | '));

/* click–click */
await p.click('.tv-left [data-tool="trend"]'); await settle(60);
await p.mouse.click(box.x + 120, box.y + 120); await settle(80);
await p.mouse.move(box.x + 260, box.y + 90, { steps: 4 }); await settle(80);
S = await C();
t('click once: the line follows the pointer from there', S.tool === 'trend' && await p.evaluate(() => document.querySelector('.tc').__chart.dr.pending));
await p.mouse.click(box.x + 260, box.y + 90); await settle(200);
let L = await gold();
const T1 = L.find(d => d.type === 'trend' && d.id !== 'old1');
t('click again: the trend line is made and saved', L.length === 2 && T1 && T1.pts[1].t > T1.pts[0].t && T1.pts[1].p > T1.pts[0].p, JSON.stringify(T1));
S = await C();
t('…the tool puts itself away and the new line is selected, with its toolbar', !S.tool && S.sel === T1.id && await p.evaluate(() => !document.querySelector('.tc .tv-ftb').hidden));
await shot('trend');
const g0 = await G();

/* Shift keeps it flat */
await p.click('.tv-left [data-tool="trend"]'); await settle(60);
await p.keyboard.down('Shift');
await p.mouse.move(box.x + 140, box.y + 200); await p.mouse.down(); await p.mouse.move(box.x + 300, box.y + 150, { steps: 6 }); await p.mouse.up(); await settle(200);
await p.keyboard.up('Shift');
L = await gold();
const flat = L.at(-1);
t('Shift while drawing: the line stays flat', flat.type === 'trend' && flat.pts[0].p === flat.pts[1].p && flat.pts[1].t > flat.pts[0].t, JSON.stringify(flat.pts));

/* the magnet */
const bar = await p.evaluate(() => { const c = document.querySelector('.tc').__chart, g = c.core.geom(); const i = Math.floor(g.start + g.count * 0.55); return { i, b: c.barAt(i) }; });
const hi = await at(bar.b[0], bar.b[2]);
await p.click('.tv-left [data-tool="trend"]');
await p.mouse.move(box.x + hi.x, box.y + hi.y - 6); await p.mouse.down(); await p.mouse.move(box.x + hi.x + 120, box.y + hi.y - 60, { steps: 4 }); await p.mouse.up(); await settle(200);
L = await gold();
t('magnet off: the point stays where you put it', Math.abs(L.at(-1).pts[0].p - bar.b[2]) > 1e-6, `${L.at(-1).pts[0].p} vs high ${bar.b[2]}`);
await p.click('.tv-left [data-tool="magnet"]'); await settle(80);
t('the magnet switches on, kept in the vault', (await file()).tools?.magnet === true && await p.evaluate(() => document.querySelector('.tv-left [data-tool="magnet"]').classList.contains('is-on')));
await p.click('.tv-left [data-tool="trend"]');
await p.mouse.move(box.x + hi.x, box.y + hi.y - 6); await p.mouse.down(); await p.mouse.move(box.x + hi.x + 120, box.y + hi.y - 60, { steps: 4 }); await p.mouse.up(); await settle(200);
L = await gold();
t('magnet on: near the high, the point snaps onto it', Math.abs(L.at(-1).pts[0].p - bar.b[2]) < 1e-9 && L.at(-1).pts[0].t === bar.b[0], `${L.at(-1).pts[0].p} vs ${bar.b[2]}`);
await p.click('.tv-left [data-tool="trend"]');
await p.mouse.move(box.x + hi.x, box.y + hi.y - 40); await p.mouse.down(); await p.mouse.move(box.x + hi.x + 120, box.y + hi.y - 90, { steps: 4 }); await p.mouse.up(); await settle(200);
L = await gold();
t('…the weak magnet: 40px above the high, it does not', Math.abs(L.at(-1).pts[0].p - bar.b[2]) > 1e-6);
await p.click('.tv-left [data-tool="magnet"]', { button: 'right' }); await settle(80);
t('right-click the magnet: Weak magnet or Strong magnet', await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mlabel')].map(x => x.textContent).join() === 'Weak magnet,Strong magnet'));
await p.click('.tv-menu .tv-m-strong'); await settle(80);
t('…Strong, kept', (await file()).tools?.magnetMode === 'strong' && (await file()).tools?.magnet === true && await p.evaluate(() => document.querySelector('.tv-left [data-tool="magnet"]').classList.contains('is-strong')));
await p.click('.tv-left [data-tool="trend"]');
await p.mouse.move(box.x + hi.x, box.y + hi.y - 40); await p.mouse.down(); await p.mouse.move(box.x + hi.x + 120, box.y + hi.y - 90, { steps: 4 }); await p.mouse.up(); await settle(200);
L = await gold();
t('the strong magnet: 40px above, still onto the high — always the nearest of open, high, low, close', Math.abs(L.at(-1).pts[0].p - bar.b[2]) < 1e-9, `${L.at(-1).pts[0].p} vs ${bar.b[2]}`);
await p.click('.tv-left [data-tool="magnet"]', { button: 'right' }); await p.click('.tv-menu .tv-m-weak'); await settle(80);
await p.click('.tv-left [data-tool="magnet"]'); await settle(80);
/* tidy: keep only the old line and the first one — select, Delete */
await p.keyboard.press('Escape');
await p.mouse.move(box.x + 5, box.y + 5);
for (const d of (await gold()).filter(d => d.id !== 'old1' && d.id !== T1.id)) {
  await p.evaluate(id => document.querySelector('.tc').__chart.dr.select(id), d.id);
  await p.keyboard.press('Delete'); await settle(120);
}
L = await gold();
t('Delete removes the selected drawing', L.length === 2 && L.some(d => d.id === T1.id), JSON.stringify(L.map(d => d.id)));
await p.keyboard.press('Control+z'); await settle(150);
const L2 = await gold();
t('Ctrl+Z: the last one deleted comes back', L2.length === 3, JSON.stringify(L2.map(d => d.id)));
await p.keyboard.press('Control+y'); await settle(150);
t('…Ctrl+Y: gone again', (await gold()).length === 2);
await p.keyboard.press('Control+Shift+z'); await settle(150);
t('…Ctrl+Shift+Z does nothing more to redo', (await gold()).length === 2);
await p.evaluate(id => document.querySelector('.tc').__chart.dr.select(id), T1.id); await settle(60);
await p.keyboard.press('Control+c'); await p.keyboard.press('Control+v'); await settle(200);
const L3 = await gold(), pasted = L3.at(-1);
t('Ctrl+C, Ctrl+V: a copy, in the same place, selected', L3.length === 3 && pasted.id !== T1.id && JSON.stringify(pasted.pts) === JSON.stringify(L3.find(d => d.id === T1.id).pts) && pasted.type === 'trend' && (await C()).sel === pasted.id, JSON.stringify(pasted));
await p.keyboard.press('Control+z'); await settle(150);
t('…and Ctrl+Z takes the copy away', (await gold()).length === 2 && !(await gold()).some(d => d.id === pasted.id));
await p.keyboard.press('Escape'); await settle(60);

/* selecting, handles, dragging */
let a1 = await at(T1.pts[1].t, T1.pts[1].p), a0 = await at(T1.pts[0].t, T1.pts[0].p);
await p.mouse.click(box.x + 5, box.y + box.h / 2); await settle(80);
t('a click on empty chart lets go', !(await C()).sel && await p.evaluate(() => document.querySelector('.tc .tv-ftb').hidden));
const mid = { x: (a0.x + a1.x) / 2, y: (a0.y + a1.y) / 2 };
await p.mouse.move(box.x + mid.x, box.y + mid.y); await settle(80);
t('over a drawing the pointer says it can be picked', await p.evaluate(() => document.querySelector('.tc-plot').dataset.cursor === 'pointer'));
await p.mouse.click(box.x + mid.x, box.y + mid.y); await settle(100);
S = await C();
t('click it: selected — two round handles at its ends', S.sel === T1.id && S.shapes.find(s => s.id === T1.id).handles.length === 2);
await p.mouse.move(box.x + a1.x, box.y + a1.y); await settle(60);
t('…over a handle, the move pointer', await p.evaluate(() => document.querySelector('.tc-plot').dataset.cursor === 'move'));
await p.mouse.down(); await p.mouse.move(box.x + a1.x + 60, box.y + a1.y + 40, { steps: 5 }); await p.mouse.up(); await settle(200);
let T1b = (await gold()).find(d => d.id === T1.id);
t('drag a handle: that end moves, the other stays', T1b.pts[0].t === T1.pts[0].t && T1b.pts[0].p === T1.pts[0].p && T1b.pts[1].t > T1.pts[1].t && T1b.pts[1].p < T1.pts[1].p, JSON.stringify([T1.pts, T1b.pts]));
a0 = await at(T1b.pts[0].t, T1b.pts[0].p); a1 = await at(T1b.pts[1].t, T1b.pts[1].p);
const m2 = { x: (a0.x + a1.x) / 2, y: (a0.y + a1.y) / 2 };
const sp = (await G()).spacing;
await p.mouse.move(box.x + m2.x, box.y + m2.y); await p.mouse.down(); await p.mouse.move(box.x + m2.x + sp * 5, box.y + m2.y + 30, { steps: 5 });
const moving = await p.evaluate(() => ({ cur: getComputedStyle(document.querySelector('.tc .tc-canvas')).cursor, lines: !!document.querySelector('.tc').__chart.core.hover }));
await p.mouse.up(); await settle(200);
t('moving a drawing: the plain crosshair pointer', moving.cur === 'crosshair', JSON.stringify(moving));
let T1c = (await gold()).find(d => d.id === T1.id);
const dpx = T1c.pts[0].p - T1b.pts[0].p, dpx2 = T1c.pts[1].p - T1b.pts[1].p;
t('drag the line: all of it moves — five candles on, the same distance down at both ends', T1c.pts[0].t - T1b.pts[0].t === 25 * 60 && T1c.pts[1].t - T1b.pts[1].t === 25 * 60 && dpx < 0 && Math.abs(dpx - dpx2) < 1e-6,
  JSON.stringify([T1b.pts, T1c.pts]));
t('the chart did not move under it', Math.abs((await G()).start - g0.start) < 1e-6);
await p.keyboard.press('Control+z'); await settle(150);
t('Ctrl+Z puts a moved drawing back where it was', JSON.stringify((await gold()).find(d => d.id === T1.id).pts) === JSON.stringify(T1b.pts));
await p.keyboard.press('Control+y'); await settle(150);
t('…Ctrl+Y moves it again', JSON.stringify((await gold()).find(d => d.id === T1.id).pts) === JSON.stringify(T1c.pts));

/* the floating toolbar */
console.log('floating toolbar');
const ftb = await p.evaluate(() => [...document.querySelectorAll('.tc .tv-ftb > *')].map(x => x.className.match(/tv-f-\w+|tv-grip/)?.[0] || x.className));
t('the floating toolbar: grip, template, colour, text, thickness, style, settings, visibility, lock, delete', ftb.join() === 'tv-grip,tv-f-tmpl,tv-f-color,tv-f-text,tv-f-width,tv-f-dash,tv-f-settings,tv-f-vis,tv-f-lock,tv-f-del', ftb.join());
t('…and nothing else in it — no stray words', await p.evaluate(() => !/null|undefined/.test(document.querySelector('.tc .tv-ftb').textContent)), await p.evaluate(() => document.querySelector('.tc .tv-ftb').textContent));
await p.click('.tv-ftb .tv-f-color'); await settle(80);
await p.click('.tv-pal-c[data-c="#F23645"]'); await settle(150);
await p.click('.tv-ftb .tv-f-width'); await settle(80);
const widths = await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mlabel')].map(x => x.textContent).join());
await p.click('.tv-menu .tv-mi:nth-child(4)'); await settle(150);
await p.click('.tv-ftb .tv-f-dash'); await settle(80);
await p.click('.tv-menu .tv-mi:nth-child(3)'); await settle(150);
let T = (await gold()).find(d => d.id === T1.id);
t('thickness: from half a pixel', widths === '0.5px,1px,2px,3px,4px', widths);
t('colour, thickness and style from the toolbar, saved', T.style.color === '#F23645' && T.style.width === 3 && T.style.dash === 'dotted', JSON.stringify(T.style));
await spy(); await redraw();
const dots = (await spied()).filter(c => c.m === 'stroke' && c.stroke.toLowerCase() === '#f23645');
t('dotted: square dots with a small gap between, TradingView’s way (not round dots that run together)', dots.some(c => c.dash.startsWith('3,4.8')) && dots.every(c => c.cap === 'butt'), JSON.stringify(dots.slice(0, 3)));
await p.click('.tv-ftb .tv-f-lock'); await settle(150);
T = (await gold()).find(d => d.id === T1.id);
const a2 = await at(T.pts[0].t, T.pts[0].p), a3 = await at(T.pts[1].t, T.pts[1].p);
await p.mouse.move(box.x + (a2.x + a3.x) / 2, box.y + (a2.y + a3.y) / 2); await p.mouse.down(); await p.mouse.move(box.x + (a2.x + a3.x) / 2 + 80, box.y + (a2.y + a3.y) / 2 + 40, { steps: 5 }); await p.mouse.up(); await settle(200);
const Tl = (await gold()).find(d => d.id === T1.id);
t('locked: it will not move', T.locked && JSON.stringify(Tl.pts) === JSON.stringify(T.pts));
await p.click('.tv-ftb .tv-f-lock'); await settle(150);
t('…unlocked again', !(await gold()).find(d => d.id === T1.id).locked);

/* templates */
await p.click('.tv-ftb .tv-f-tmpl'); await settle(80);
t('Template: Save Drawing Template As…, Apply Default Drawing Template', await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mlabel')].map(x => x.textContent).join() === 'Save Drawing Template As…,Apply Default Drawing Template'));
await p.click('.tv-menu .tv-dt-save'); await settle(80);
await p.fill('.tv-dt-name', 'red dotted'); await p.click('.tv-dt-ok'); await settle(150);
t('…saved by name for trend lines', (await file()).drawTemplates?.trend?.['red dotted']?.style?.color === '#F23645');
await p.click('.tv-ftb .tv-f-tmpl'); await settle(80);
await p.click('.tv-menu .tv-dt-default'); await settle(150);
T = (await gold()).find(d => d.id === T1.id);
t('Apply Default: TradingView’s blue, 2px, solid', T.style.color === '#2962FF' && T.style.width === 2 && T.style.dash === 'solid', JSON.stringify(T.style));
await p.click('.tv-ftb .tv-f-tmpl'); await settle(80);
await p.click('.tv-menu .tv-dt-item[data-name="red dotted"]'); await settle(150);
T = (await gold()).find(d => d.id === T1.id);
t('…and the saved one puts it back', T.style.color === '#F23645' && T.style.dash === 'dotted');

/* the settings dialog */
console.log('settings');
const c0 = await at(T.pts[0].t, T.pts[0].p), c1 = await at(T.pts[1].t, T.pts[1].p);
await p.mouse.dblclick(box.x + (c0.x + c1.x) / 2, box.y + (c0.y + c1.y) / 2); await settle(150);
t('double-click: Trend line settings — Style, Text, Coordinates, Visibility', await p.evaluate(() => /Trend line/.test(document.querySelector('.tv-ddialog .tv-dhead').textContent)
  && [...document.querySelectorAll('.tv-ddialog .tv-dtab')].map(b => b.textContent).join() === 'Style,Text,Coordinates,Visibility'));
await p.click('.tv-ddialog .tv-dtab[data-tab="text"]'); await settle(80);
await p.fill('.tv-t-value', 'BOS'); await settle(80);
await p.click('.tv-t-bold'); await p.selectOption('.tv-t-v', 'bottom'); await settle(80);
await p.selectOption('.tv-t-v', 'middle'); await settle(80);
await spy(); await redraw();
const holes = (await spied()).filter(c => c.m === 'clearRect' && (c.x !== 0 || c.y !== 0));
t('text in the middle of the line: the line breaks around it, no box cut out behind it', holes.length === 0, JSON.stringify(holes.slice(0, 2)));
await p.selectOption('.tv-t-v', 'bottom'); await settle(60);
t('Text: shows on the chart as you type (not saved yet)', (await gold()).find(d => d.id === T1.id).text.value === '' && await p.evaluate(() => !!document.querySelector('.tv-ddialog')));
await p.click('.tv-ddialog .tv-cancel'); await settle(150);
t('Cancel: nothing kept', (await gold()).find(d => d.id === T1.id).text.value === '');
await p.mouse.dblclick(box.x + (c0.x + c1.x) / 2, box.y + (c0.y + c1.y) / 2); await settle(150);
await p.click('.tv-ddialog .tv-dtab[data-tab="text"]'); await settle(80);
await p.fill('.tv-t-value', 'BOS'); await p.click('.tv-t-bold'); await p.selectOption('.tv-t-h', 'right'); await settle(60);
await p.click('.tv-ddialog .tv-dtab[data-tab="style"]'); await settle(60);
await p.click('.tv-s-extr'); await p.click('.tv-s-middle'); await p.click('.tv-s-labels'); await settle(60);
await p.click('.tv-ddialog .tv-dtab[data-tab="coords"]'); await settle(60);
await p.fill('.tv-c-p1', String(+(T.pts[0].p + 1).toFixed(2))); await p.press('.tv-c-p1', 'Tab'); await settle(60);
await p.click('.tv-ddialog .tv-dtab[data-tab="visibility"]'); await settle(60);
await p.click('.tv-v-1H'); await settle(60);
await p.click('.tv-ddialog .tv-ok'); await settle(200);
T = (await gold()).find(d => d.id === T1.id);
t('Ok: text BOS in bold to the right, extended right, middle point, price labels, a new price for #1, hidden on 1H',
  T.text.value === 'BOS' && T.text.bold && T.text.h === 'right' && T.style.extR && T.style.middle && T.style.labels
  && Math.abs(T.pts[0].p - (T1c.pts[0].p + 1)) < 0.011 && JSON.stringify(T.hideOn) === '[60]', JSON.stringify(T));
await shot('bos');
const tagsNow = await p.evaluate(() => document.querySelector('.tc').__chart.core.geom().aw);
t('price labels on the scale for its two points', tagsNow > 0 && (await p.evaluate(() => { const c = document.querySelector('.tc').__chart; return c.dr.tags().length; })) === 2);
await p.click('.tc-seg button[data-tf="1H"]'); await settle(150);
t('Visibility: on 1H it is not drawn', !(await C()).shapes.some(s => s.id === T1.id));
await p.click('.tc-seg button[data-tf="5m"]'); await settle(150);
t('…on 5m it is', (await C()).shapes.some(s => s.id === T1.id));
/* the next trend line starts in the last style used */
await p.click('.tv-left [data-tool="trend"]');
await p.mouse.move(box.x + 100, box.y + 250); await p.mouse.down(); await p.mouse.move(box.x + 200, box.y + 240, { steps: 4 }); await p.mouse.up(); await settle(200);
const T2 = (await gold()).at(-1);
t('a new trend line starts in the style used last — but with no text', T2.style.color === '#F23645' && T2.style.dash === 'dotted' && T2.text.value === '' && T2.text.bold, JSON.stringify(T2.style));
await p.keyboard.press('Delete'); await settle(150);

/* rectangle */
console.log('rectangle · callout · positions');
await p.click('.tv-left [data-tool="rect"]');
await p.mouse.move(box.x + 330, box.y + 80); await p.mouse.down(); await p.mouse.move(box.x + 470, box.y + 170, { steps: 6 }); await p.mouse.up(); await settle(200);
const R = (await gold()).at(-1);
t('Rectangle: dragged corner to corner, TradingView’s purple', R.type === 'rect' && R.style.color === '#9C27B0' && /156, 39, 176, 0.2/.test(R.style.fill) && R.pts[0].p > R.pts[1].p, JSON.stringify(R));
S = await C();
t('…eight handles: the corners and the sides', S.shapes.find(s => s.id === R.id).handles.length === 8);
const br = S.shapes.find(s => s.id === R.id).handles.find(h => h.key === 'br');
await p.mouse.move(box.x + br.x, box.y + br.y); await p.mouse.down(); await p.mouse.move(box.x + br.x + 50, box.y + br.y + 30, { steps: 4 }); await p.mouse.up(); await settle(200);
const R2 = (await gold()).find(d => d.id === R.id);
t('…dragging the bottom-right corner makes it bigger that way only', R2.pts[0].t === R.pts[0].t && R2.pts[0].p === R.pts[0].p && R2.pts[1].t > R.pts[1].t && R2.pts[1].p < R.pts[1].p, JSON.stringify([R.pts, R2.pts]));
t('…its toolbar has a background colour too', await p.evaluate(() => !!document.querySelector('.tv-ftb .tv-f-fill')));

/* callout */
await p.click('.tv-left [data-tool="callout"]');
await p.mouse.move(box.x + 520, box.y + 200); await p.mouse.down(); await p.mouse.move(box.x + 560, box.y + 120, { steps: 4 }); await p.mouse.up(); await settle(250);
t('Callout: made, and its Text opens with the words ready to type over', await p.evaluate(() => !!document.querySelector('.tv-ddialog') && document.activeElement?.classList.contains('tv-t-value')));
await p.keyboard.type('Asia high'); await p.click('.tv-ddialog .tv-ok'); await settle(200);
const CO = (await gold()).at(-1);
t('…the words kept', CO.type === 'callout' && CO.text.value === 'Asia high', JSON.stringify(CO.text));

/* long position */
await p.click('.tv-left [data-tool="long"]');
const lgAt = { x: 160, y: 200 };
await p.mouse.click(box.x + lgAt.x, box.y + lgAt.y); await settle(250);
const LG = (await gold()).at(-1);
t('Long position: one click — target above, stop below, twice as far', LG.type === 'long' && LG.tp > LG.pts[0].p && LG.sl < LG.pts[0].p && Math.abs((LG.tp - LG.pts[0].p) / (LG.pts[0].p - LG.sl) - 2) < 0.02 && LG.pts[1].t > LG.pts[0].t, JSON.stringify(LG));
t('…sized from your account: $100,000, 1%', LG.inputs.account === 100000 && LG.inputs.risk === 1 && LG.inputs.riskMode === '%');
S = await C();
t('…square handles: entry, target, stop, and the right edge', S.shapes.find(s => s.id === LG.id).handles.map(h => h.key).join() === 'entry,tp,sl,end');
await shot('long');
await spy(); await redraw();
const fills = await spied();
const K = await p.evaluate(async () => { const c = document.querySelector('.tc').__chart.core, P = c.palette(), M = await import('/js/chart/core.js'); return { up: M.withAlpha(P.up, 0.2), down: M.withAlpha(P.down, 0.2) }; });
t('…its zones in the candles’ colours', fills.some(c => c.m === 'fillRect' && c.fill === K.up) && fills.some(c => c.m === 'fillRect' && c.fill === K.down) && !fills.some(c => c.fill === 'rgba(8, 153, 129, 0.2)'), JSON.stringify(K));
const tpH = S.shapes.find(s => s.id === LG.id).handles.find(h => h.key === 'tp');
const tagsBefore = await p.evaluate(() => document.querySelector('.tc').__chart.dr.tags().length);
await p.mouse.move(box.x + tpH.x, box.y + tpH.y); await p.mouse.down(); await p.mouse.move(box.x + tpH.x, box.y + tpH.y - 30, { steps: 4 }); await settle(80);
await spy(); await redraw();
const midDraw = await spied();
const midTags = await p.evaluate(() => { const c = document.querySelector('.tc').__chart; return { tags: c.dr.tags(), up: c.core.palette().up, pw: c.core.geom().pw }; });
t('dragging the target: a dotted line right across at it, its price on the scale', midTags.tags.length === tagsBefore + 1 && midTags.tags.at(-1).bg === midTags.up && midDraw.some(c => c.m === 'stroke' && c.dash === '2,2' && c.stroke.toLowerCase() === midTags.up.toLowerCase()), JSON.stringify(midTags.tags));
await p.mouse.up(); await settle(200);
t('…gone when let go', (await p.evaluate(() => document.querySelector('.tc').__chart.dr.tags().length)) === tagsBefore);
const LG2 = (await gold()).find(d => d.id === LG.id);
t('drag the target up: further away, entry and stop where they were', LG2.tp > LG.tp && LG2.sl === LG.sl && LG2.pts[0].p === LG.pts[0].p);
const slH = (await C()).shapes.find(s => s.id === LG.id).handles.find(h => h.key === 'sl');
await p.mouse.move(box.x + slH.x, box.y + slH.y); await p.mouse.down(); await p.mouse.move(box.x + slH.x, box.y + slH.y - 200, { steps: 6 }); await p.mouse.up(); await settle(200);
const LG3 = (await gold()).find(d => d.id === LG.id);
t('a long’s stop cannot go above its entry', LG3.sl < LG3.pts[0].p, JSON.stringify([LG3.sl, LG3.pts[0].p]));
t('…its toolbar says nothing stray', await p.evaluate(() => !/null|undefined/.test(document.querySelector('.tc .tv-ftb').textContent)));
t('its toolbar: no colour or text — template, settings, visibility, lock, delete', await p.evaluate(() => [...document.querySelectorAll('.tv-ftb > *')].map(x => x.className.match(/tv-f-\w+|tv-grip/)?.[0]).join() === 'tv-grip,tv-f-tmpl,tv-f-settings,tv-f-vis,tv-f-lock,tv-f-del'));
await p.click('.tv-ftb .tv-f-settings'); await settle(150);
t('its settings open on Inputs: account size and risk', await p.evaluate(() => [...document.querySelectorAll('.tv-ddialog .tv-dtab')].map(b => b.textContent).join() === 'Inputs,Style,Coordinates,Visibility' && !!document.querySelector('.tv-in-account')));
await p.fill('.tv-in-risk', '250'); await p.press('.tv-in-risk', 'Tab'); await p.click('.tv-in-mode [data-v="$"]'); await settle(60);
await p.click('.tv-ddialog .tv-dtab[data-tab="style"]'); await p.click('.tv-s-always'); await settle(60);
await p.click('.tv-ddialog .tv-ok'); await settle(200);
const LG4 = (await gold()).find(d => d.id === LG.id);
t('…risk $250, stats always shown', LG4.inputs.risk === 250 && LG4.inputs.riskMode === '$' && LG4.style.always === true, JSON.stringify([LG4.inputs, LG4.style.always]));
/* white candles: the price on the scale in dark text */
const lastTxt = await p.evaluate(() => {
  const c = document.querySelector('.tc').__chart.core, S = c.settings;
  window.__was = structuredClone(S.candles);
  S.candles = { mode: 'custom', body: { on: true, up: '#FFFFFF', down: '#FFFFFF' }, border: { on: true, up: '#FFFFFF', down: '#FFFFFF' }, wick: { on: true, up: '#FFFFFF', down: '#FFFFFF' } };
  return c.geom().pw;
});
await spy(); await redraw();
const onScale = (await spied()).filter(c => c.m === 'fillText' && c.x > lastTxt);
await p.evaluate(() => { const c = document.querySelector('.tc').__chart.core; c.settings.candles = window.__was; c.draw(); });
t('white candles: the price tag on the scale is white, its price dark — readable', onScale.some(c => c.fill === '#131722'), JSON.stringify(onScale.slice(0, 6)));
/* short */
await p.click('.tv-left [data-tool="short"]');
await p.mouse.click(box.x + 420, box.y + 230); await settle(250);
const SH = (await gold()).at(-1);
t('Short position: target below, stop above', SH.type === 'short' && SH.tp < SH.pts[0].p && SH.sl > SH.pts[0].p, JSON.stringify(SH));
await shot('positions');

/* favourites */
console.log('favourites · menus · hiding');
await p.click('.tv-left [data-tool="rect"]', { button: 'right' }); await settle(80);
t('right-click a tool: Add to favorites', await p.evaluate(() => document.querySelector('.tv-menu .tv-m-fav')?.textContent.includes('Add to favorites')));
await p.click('.tv-menu .tv-m-fav'); await settle(150);
t('…a floating favourites bar with it, starred on the left too', await p.evaluate(() => { const f = document.querySelector('.tc .tv-fav'); return !f.hidden && [...f.querySelectorAll('.tv-fb')].map(b => b.dataset.tool).join() === 'rect'; })
  && await p.evaluate(() => document.querySelector('.tv-left [data-tool="rect"]').classList.contains('is-fav')) && JSON.stringify((await file()).tools.favourites) === '["rect"]');
await p.click('.tc .tv-fav .tv-fb[data-tool="rect"]'); await settle(60);
t('a favourite click arms the tool', (await C()).tool === 'rect');
await p.keyboard.press('Escape'); await settle(60);
t('Esc puts it away', !(await C()).tool);
const fg = await p.evaluate(() => { const r = document.querySelector('.tc .tv-fav .tv-grip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await p.mouse.move(fg.x, fg.y); await p.mouse.down(); await p.mouse.move(fg.x - 150, fg.y + 120, { steps: 6 }); await p.mouse.up(); await settle(150);
const favPos = (await file()).tools.favPos;
const favBox = await p.evaluate(() => { const r = document.querySelector('.tc .tv-fav').getBoundingClientRect(), q = document.querySelector('.tc .tc-plot').getBoundingClientRect(); return { x: r.left - q.left, y: r.top - q.top }; });
t('drag its grip: it moves on the chart, and where it is is kept', favPos && favPos.y > 0.2 && favBox.y > 100, JSON.stringify([favPos, favBox]));
await go('#/trades', 300); await go('#/trade/g1', 300); await chartReady();
const favBox2 = await p.evaluate(() => { const r = document.querySelector('.tc .tv-fav').getBoundingClientRect(), q = document.querySelector('.tc .tc-plot').getBoundingClientRect(); return { x: r.left - q.left, y: r.top - q.top }; });
t('…still there when the chart opens again', Math.abs(favBox2.x - favBox.x) < 2 && Math.abs(favBox2.y - favBox.y) < 2, JSON.stringify([favBox, favBox2]));
await p.click('.tv-left [data-tool="rect"]', { button: 'right' }); await p.click('.tv-menu .tv-m-fav'); await settle(120);
t('Remove from favorites: the bar goes', await p.evaluate(() => document.querySelector('.tc .tv-fav').hidden));

/* the right-click menu on a drawing */
box = await p.evaluate(() => { const r = document.querySelector('.tc-canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const rr = (await C()).shapes.find(s => s.id === R.id).handles.find(h => h.key === 'l');
await p.mouse.click(box.x + rr.x + 20, box.y + rr.y, { button: 'right' }); await settle(120);
const items = await p.evaluate(() => [...document.querySelectorAll('.tv-menu .tv-mlabel')].map(x => x.textContent));
t('right-click a drawing: its settings, lock, remove — then hide or remove them all', items.includes('Rectangle settings…') && items.includes('Lock') && items.includes('Remove') && items.includes('Hide drawings') && items.some(x => /^Remove \d+ drawings$/.test(x)), items.join(' | '));
await p.click('.tv-menu .tv-m-dremove'); await settle(150);
t('…Remove takes just that one', !(await gold()).some(d => d.id === R.id) && (await gold()).length === 5, String((await gold()).length));
await p.click('.tv-left [data-tool="eye"]'); await settle(120);
t('the eye hides every drawing, keeps them', (await C()).hidden && (await C()).shapes.length === 0 && (await gold()).length === 5);
await p.click('.tv-left [data-tool="eyeOff"]'); await settle(120);
t('…and shows them again', !(await C()).hidden && (await C()).shapes.length >= 4);
await p.click('.tv-left [data-tool="trash"]'); await settle(100);
t('the bin asks first', /Remove all 5 drawings on this chart\?/.test(await p.evaluate(() => document.querySelector('.tv-menu .tv-mhead')?.textContent || '')));
await p.click('.tv-menu .tv-m-remove-no'); await settle(100);
t('…Cancel keeps them', (await gold()).length === 5);

/* replay: what is drawn after the replay's moment does not show yet */
await p.click('.tc-play'); await settle(80);
await p.click('.tc-entrypick'); await settle(150);
const shown = (await C()).shapes.map(s => s.id);
t('in a replay, drawings that start after its moment wait', !shown.includes(SH.id) || (await gold()).find(d => d.id === SH.id).pts[0].t <= await p.evaluate(() => { const c = document.querySelector('.tc').__chart; return c.barAt(c.upto)[0] + 300; }));
await p.click('.tc-endr'); await settle(100);

/* the old line is still the old line, now saved the new way once changed */
t('the old line kept its label and place', (await gold()).find(d => d.id === 'old1')?.label === 'BOS');

t('no errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
