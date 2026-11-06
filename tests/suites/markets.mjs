/* Plan → Markets (views/markets.js, markets.js): Forex & futures from OANDA
   (his watchlist, DXY worked out), Stocks from Stooq, Crypto from CoinGecko
   or Binance — each a bubble with its logo, name and move, sized by the
   move, green up and red down, each a lit orb on a see-through field; the
   app's own marks for forex (gold's bars), CoinGecko's coins, Elbstream's
   companies (with its credit); drifting slowly without overlapping, never
   scaled at rest; no chips on Forex & futures, the sectors on Stocks; drag one and the rest make
   way; a click opens its card and holds its bubble still (the
   price with its small decimals, the move, a line with a dot and a price
   under the pointer, 1D·1W·1M); what is kept is shown at once; and nothing
   asked of anyone but reads. */
import pw from 'playwright';
import fs from 'node:fs';
import { marketsRoute, FX_MOVES, FX_BASE } from '../fixtures/markets-mock.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const HOSTS = /^https:\/\/(api-fxpractice\.oanda\.com|api\.coingecko\.com|data-api\.binance\.vision|stooq\.com|coin-images\.coingecko\.com|finnhub\.io|api\.elbstream\.com)\/.*/;
const b = await pw.chromium.launch({ executablePath: CHROME });
async function open({ key = 'test-key', fail: no = {}, seen = [], methods = [] } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Australia/Perth' });
  await ctx.route(HOSTS, async (route) => { methods.push(route.request().method()); if (/coin-images/.test(route.request().url())) return route.fulfill({ status: 404, body: '' }); return marketsRoute({ fail: no, seen })(route); });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(({ key }) => {
    if (localStorage.getItem('fakefs')) return;
    localStorage.setItem('fakeroot', 'Vault');
    if (key) localStorage.setItem('quire:setting:oandaKey', key);
    const A = { id: 'acc_1', name: 'Apex 50K', currency: 'USD', startingBalance: 50000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2026-06-01', archived: false };
    localStorage.setItem('fakefs', JSON.stringify([['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', accounts: [A], activeAccountId: 'acc_1', theme: 'dark' })],
      ['data/trades.json', JSON.stringify({ version: 1, trades: [] })]]));
  }, { key });
  await p.addInitScript(FAKE_FS);
  await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.topbar', { timeout: 8000 });
  return { ctx, p, errs, seen, methods };
}
const M = p => p.evaluate(() => { const v = document.querySelector('.mk-view')?.__markets; if (!v) return null;
  const f = document.querySelector('.mk-field').getBoundingClientRect();
  return { tab: v.tab, src: v.data?.source, err: v.error, W: f.width, H: f.height,
    b: v.bubbles().map(n => { const e = document.querySelector(`.mk-b[data-key="${n.key}"]`), cs = getComputedStyle(e);
      return { key: n.key, label: n.it.label, change: n.it.change, x: n.x, y: n.y, r: n.r, tr: n.tr, c: cs.getPropertyValue('--c').trim(), name: e.querySelector('.mk-name').textContent, pct: e.querySelector('.mk-pct').textContent, logo: !!e.querySelector('.mk-logo svg, .mk-logo img, .mk-logo .mk-mono') }; }) }; });
const settle = async (p, ms = 2600) => p.waitForTimeout(ms);
const overlaps = bs => { let n = 0; for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (Math.hypot(bs[i].x - bs[j].x, bs[i].y - bs[j].y) < bs[i].r + bs[j].r - 1.5) n++; return n; };

/* ===================== forex & futures ===================== */
console.log('forex & futures');
let S = await open();
let { p } = S;
await p.evaluate(() => { location.hash = '#/wire'; }); await p.waitForTimeout(300);
t('Plan: News · Outlook · Markets', await p.evaluate(() => [...document.querySelectorAll('.head .sn-tab')].map(a => a.textContent).join(' · ')) === 'News · Outlook · Markets');
await p.evaluate(() => { location.hash = '#/markets'; }); await settle(p);
let m = await M(p);
t('Markets opens on Forex & futures, from OANDA', m && m.tab === 'forex' && m.src === 'OANDA', JSON.stringify(m && { tab: m.tab, src: m.src, err: m.err }));
t('his watchlist: 16 bubbles (gold once, US100 and NAS100 one, US500 is SPX500, DXY worked out)', m.b.length === 16
  && ['XAUUSD', 'NAS100', 'US500', 'DXY', 'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'CADJPY', 'NZDJPY', 'AUDJPY', 'GBPJPY', 'EURJPY', 'USDJPY', 'USDCAD', 'USDCHF'].every(l => m.b.some(x => x.label === l)), m.b.map(x => x.label).join(','));
const off = m.b.filter(x => x.key !== 'DXY' && Math.abs(x.change - FX_MOVES[x.key]) > 0.011);
t('each move is today’s against yesterday’s close', off.length === 0, JSON.stringify(off.map(x => [x.key, x.change])));
const dxy = m.b.find(x => x.key === 'DXY');
t('DXY from its six pairs and the index’s formula: +0.35%, as his TradingView showed', dxy && Math.abs(dxy.change - 0.35) < 0.02 && dxy.pct === '+0.35%', JSON.stringify(dxy && dxy.change));
const lvl = await p.evaluate(async base => { const M2 = await import('/js/markets.js'); return M2.dxyOf(base); }, FX_BASE);
t('…and at a sensible level (about 99)', lvl > 95 && lvl < 105, String(lvl));
const big = [...m.b].sort((a, c) => c.tr - a.tr);
t('the further the move, the bigger the bubble: NAS100 (+2.18%) biggest, EURJPY (+0.01%) smallest', big[0].label === 'NAS100' && big[big.length - 1].label === 'EURJPY', big.map(x => x.label).join(','));
t('green up, red down', m.b.every(x => x.c === (x.change > 0.005 ? '#2FD07F' : x.change < -0.005 ? '#F0544F' : '#8A8F98')), JSON.stringify(m.b.map(x => [x.label, x.c]).slice(0, 4)));
t('each with a logo, its name and its move', m.b.every(x => x.logo && x.name === x.label && /^[+−]\d+\.\d\d%$/.test(x.pct)), JSON.stringify(m.b.find(x => !x.logo || !/%$/.test(x.pct))));
t('…the logo shown on every bubble, the smallest too', await p.evaluate(() => [...document.querySelectorAll('.mk-b .mk-logo')].every(e => e.getBoundingClientRect().width >= 12 && getComputedStyle(e).display !== 'none')));
const worst = (() => { const o = []; for (let i = 0; i < m.b.length; i++) for (let j = i + 1; j < m.b.length; j++) { const a = m.b[i], c3 = m.b[j], d = a.r + c3.r - Math.hypot(a.x - c3.x, a.y - c3.y); if (d > 1.5) o.push(`${a.label}/${c3.label} ${d.toFixed(1)} (${a.r.toFixed(0)},${a.tr.toFixed(0)})`); } return o.join('; '); })();
t('settled: none overlapping, all inside the field', overlaps(m.b) === 0 && m.b.every(x => x.x - x.r >= 0 && x.y - x.r >= 0 && x.x + x.r <= m.W + 0.5 && x.y + x.r <= m.H + 0.5), `${overlaps(m.b)} overlapping: ${worst}`);
t('…each only ever moved (to a fraction of a pixel), never scaled, so it stays sharp (no blur until a hover)', await p.evaluate(() => [...document.querySelectorAll('.mk-b')].every(e => /^translate\([-\d.]+px, ?[-\d.]+px\)$/.test(e.style.transform) && !e.querySelector('.mk-b-in').style.scale && getComputedStyle(e).willChange === 'transform')));
const look = await p.evaluate(() => { const f = getComputedStyle(document.querySelector('.mk-field')), o = getComputedStyle(document.querySelector('.mk-b[data-key="NAS100_USD"] .mk-b-in'));
  return { bg: f.backgroundColor, img: f.backgroundImage, sh: f.boxShadow, orb: (o.backgroundImage.match(/radial-gradient/g) || []).length, rim: (o.boxShadow.match(/inset/g) || []).length }; });
t('the field is see-through: no panel, no edge', look.bg === 'rgba(0, 0, 0, 0)' && look.img === 'none' && look.sh === 'none', JSON.stringify(look));
t('each bubble a lit orb: light, shade and depth, a rim', look.orb === 3 && look.rim >= 3, JSON.stringify(look));
const marks = await p.evaluate(() => { const q = k => document.querySelector(`.mk-b[data-key="${k}"] .mk-logo`);
  return { gold: q('XAU_USD').querySelectorAll('.pmark .pm-disc polygon').length, nas: q('NAS100_USD').querySelector('.pm-disc')?.dataset.g, spx: q('SPX500_USD').querySelector('.pm-disc')?.dataset.g,
    dxy: q('DXY').querySelector('.pm-disc')?.dataset.g, eur: q('EUR_USD').querySelectorAll('.pmark.is-pair .pm-disc').length }; });
t('the app’s own marks: gold’s three bars, 100, 500, $, and a pair’s two flags', marks.gold === 3 && marks.nas === '100' && marks.spx === '500' && marks.dxy === '$' && marks.eur === 2, JSON.stringify(marks));
const at = () => p.evaluate(() => document.querySelector('.mk-view').__markets.bubbles().map(n => [n.key, n.x, n.y]));
const s0 = await at(); await p.waitForTimeout(1000); const s1 = await at();
const moved = s0.map(([k, x, y], i) => Math.hypot(s1[i][1] - x, s1[i][2] - y));
t('they keep drifting, slowly (a few pixels a second, none racing)', moved.filter(d => d > 1).length >= 12 && Math.max(...moved) < 40, moved.map(d => d.toFixed(1)).join(' '));
t('…and still none overlapping', overlaps((await M(p)).b) === 0);
const glide = await p.evaluate(() => new Promise(res => { const v = document.querySelector('.mk-view').__markets, out = [];
  const tick = ts => { out.push({ t: ts, b: v.bubbles().map(n => [n.x, n.y]), tf: [...document.querySelectorAll('.mk-b')].map(e => e.style.transform) }); if (out.length < 90) requestAnimationFrame(tick); else res(out); };
  requestAnimationFrame(tick); }));
let same = 0, all = 0, jolt = 0;
for (let f = 2; f < glide.length; f++) for (let i = 0; i < glide[f].b.length; i++) {
  all++; if (glide[f].tf[i] === glide[f - 1].tf[i]) same++;
  const d1 = (glide[f - 1].t - glide[f - 2].t) / 1000, d2 = (glide[f].t - glide[f - 1].t) / 1000;
  if (d1 > 0.025 || d2 > 0.025 || !d1 || !d2) continue;
  const [x0, y0] = glide[f - 2].b[i], [x1, y1] = glide[f - 1].b[i], [x2, y2] = glide[f].b[i];
  jolt = Math.max(jolt, Math.hypot((x2 - x1) / d2 - (x1 - x0) / d1, (y2 - y1) / d2 - (y1 - y0) / d1) / ((d1 + d2) / 2));
}
t('…smoothly: drawn a little further on every frame (to a fraction of a pixel, no hops), and no jolts', same / all < 0.05 && jolt < 150, `${same}/${all} frames unmoved, sharpest change ${jolt.toFixed(0)} px/s²`);
t('the field reaches the bottom of the window', m.H > 600, String(m.H));
t('only reads: GETs to OANDA’s candles, the day’s two candles each (the 15 and USD/SEK for DXY)', S.methods.every(x => x === 'GET') && S.seen.every(u => /oanda\.com\/v3\/instruments\/[A-Z0-9_]+\/candles$/.test(u)) && S.seen.length === 16, `${S.seen.length} requests`);

console.log('  -- no chips --');
t('Forex & futures: no group chips, his whole watchlist at once (Minato, 7 Nov)', await p.evaluate(() => !document.querySelector('.mk-chips, .mk-chip')) && (await M(p)).b.length === 16);

console.log('  -- drag one --');
m = await M(p);
const nas = m.b.find(x => x.label === 'NAS100'), fb = await p.locator('.mk-field').boundingBox();
await p.mouse.move(fb.x + nas.x, fb.y + nas.y); await p.mouse.down();
await p.mouse.move(fb.x + 120, fb.y + 120, { steps: 12 });
const mid = await M(p);
await p.mouse.up(); await settle(p, 2200);
const after = await M(p);
const held = mid.b.find(x => x.label === 'NAS100');
t('dragging moves it under the pointer, the others making way', Math.hypot(held.x - 120, held.y - 120) < held.r + 30 && overlaps(after.b) === 0, JSON.stringify({ x: held.x, y: held.y }));
t('…and a drag opens no card', !(await p.evaluate(() => !!document.querySelector('.mk-card'))));

console.log('  -- its card --');
await p.click('.mk-b[data-key="XAU_USD"]', { force: true }); await p.waitForTimeout(700);
const card = () => p.evaluate(() => { const c = document.querySelector('.mk-card'); if (!c) return null;
  return { in: c.classList.contains('is-in'), name: c.querySelector('.mk-c-names strong').textContent, label: c.querySelector('.mk-c-names span').textContent,
    price: c.querySelector('.mk-c-price').textContent, small: c.querySelector('.mk-c-price small').textContent, chg: c.querySelector('.mk-c-chg').textContent,
    line: !!c.querySelector('.mk-line path[stroke]'), dot: c.querySelector('.mk-dot')?.style.left, tip: c.querySelector('.mk-tip:not([hidden])')?.textContent || '',
    ranges: [...c.querySelectorAll('.mk-ranges button')].map(x => x.textContent + (x.classList.contains('is-on') ? '*' : '')).join(' '),
    inField: (() => { const a = c.getBoundingClientRect(), f = document.querySelector('.mk-field').getBoundingClientRect(); return a.left >= f.left && a.right <= f.right && a.top >= f.top && a.bottom <= f.bottom; })(),
    on: document.querySelector('.mk-b.is-on')?.dataset.key || null }; });
let c = await card();
t('a click opens its card: Gold, XAUUSD, its bubble ringed', c && c.in && c.name === 'Gold' && c.label === 'XAUUSD' && c.on === 'XAU_USD', JSON.stringify(c));
t('…the price with its small decimals (4,075 .08)', c && c.price === '4,075.08' && c.small === '.08', c && c.price);
t('…the move, down, today', c && /0\.28%/.test(c.chg) && /today/.test(c.chg), c && c.chg);
t('…its line, the dot at the latest, a price and a time over it', c && c.line && c.dot && /^4,0\d\d\.\d{2}/.test(c.tip) && /\d{1,2} \w{3}, \d\d:\d\d/.test(c.tip), c && c.tip);
t('…1D · 1W · 1M, 1D first; inside the field', c && c.ranges === '1D* 1W 1M' && c.inField, c && c.ranges);
t('…its line with no gridlines: just the fill and the line', await p.evaluate(() => { const g = document.querySelector('.mk-card .mk-line'); return !!g && !g.querySelector('.mk-grid') && g.querySelectorAll('path').length === 2; }));
const g0 = (await at()).find(x => x[0] === 'XAU_USD'); await p.waitForTimeout(800); const g1 = (await at()).find(x => x[0] === 'XAU_USD');
t('…and its bubble holds still while the card is open', Math.hypot(g1[1] - g0[1], g1[2] - g0[2]) < 1.5, JSON.stringify([g0, g1]));
const cb = await p.locator('.mk-c-chart').boundingBox();
await p.mouse.move(cb.x + cb.width * 0.3, cb.y + cb.height / 2); await p.waitForTimeout(150);
const c2 = await card();
t('the pointer over the line moves the dot and the price with it', c2.dot !== c.dot && c2.tip !== c.tip, `${c.dot} → ${c2.dot}`);
const before1W = S.seen.length;
await p.click('.mk-ranges [data-range="1W"]'); await p.waitForTimeout(500);
t('1W asks for the week’s hourly candles', S.seen.length === before1W + 1 && (await card()).ranges === '1D 1W* 1M');
await p.keyboard.press('Escape'); await p.waitForTimeout(50);
const going = await p.evaluate(() => { const c3 = document.querySelector('.mk-card'); return c3 ? c3.classList.contains('is-in') : null; });
await p.waitForTimeout(350);
t('Escape: it fades out, then is gone', going === false && !(await card()));
await p.click('.mk-b[data-key="DXY"]', { force: true }); await p.waitForTimeout(700);
c = await card();
t('DXY’s card: its line worked out from its six pairs', c && c.name === 'US Dollar Index' && c.line && /^\d{2,3}\.\d{3}/.test(c.tip), JSON.stringify(c && { tip: c.tip }));
await p.mouse.click(fb.x + 8, fb.y + 8); await p.waitForTimeout(350);
t('a click on the field itself closes it', !(await card()));
t('no page errors', S.errs.length === 0, S.errs.slice(0, 2).join(' | '));
await S.ctx.close();

console.log('  -- motion off --');
S = await open(); p = S.p;
await p.evaluate(() => { location.hash = '#/markets'; }); await settle(p, 1200);
await p.evaluate(() => { document.documentElement.dataset.motion = 'off'; location.hash = '#/wire'; }); await p.waitForTimeout(300);
await p.evaluate(() => { document.documentElement.dataset.motion = 'off'; location.hash = '#/markets'; }); await p.waitForTimeout(500);
const q0 = await M(p); await p.waitForTimeout(900); const q1 = await M(p);
t('Motion off: all at their sizes, apart, and still', q0.b.length === 16 && q0.b.every(x => x.r === x.tr) && overlaps(q0.b) === 0 && q0.b.every((x, i) => x.x === q1.b[i].x && x.y === q1.b[i].y));
await S.ctx.close();

/* ===================== kept, and no key ===================== */
console.log('kept, and no key');
S = await open(); p = S.p;
await p.evaluate(() => { location.hash = '#/markets'; }); await settle(p, 1500);
await p.evaluate(() => { localStorage.setItem('laminar:markets:forex', JSON.stringify({ ...JSON.parse(localStorage.getItem('laminar:markets:forex')), at: Date.now() })); });
const n0 = S.seen.length;
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('.topbar'); await p.evaluate(() => { location.hash = '#/markets'; }); await p.waitForTimeout(400);
m = await M(p);
t('what was kept shows at once, without asking again while it is fresh', m.b.length === 16 && S.seen.length === n0, `${S.seen.length - n0} asked`);
await S.ctx.close();
S = await open({ key: null }); p = S.p;
await p.evaluate(() => { location.hash = '#/markets'; }); await settle(p, 1200);
const nk = await p.evaluate(() => ({ empty: document.querySelector('.mk-empty:not([hidden])')?.innerText || '', btn: !!document.querySelector('.mk-empty .btn') }));
t('no OANDA key: it says where to add one, with a way there', /OANDA key/.test(nk.empty) && nk.btn, JSON.stringify(nk));
await S.ctx.close();

/* ===================== crypto ===================== */
console.log('crypto');
S = await open(); p = S.p;
await p.evaluate(() => { location.hash = '#/markets'; }); await settle(p, 800);
await p.click('.mk-tabs [data-tab="crypto"]'); await settle(p);
m = await M(p);
t('Crypto: from CoinGecko, no key, one request', m.tab === 'crypto' && m.src === 'CoinGecko' && S.seen.filter(u => /coingecko\.com\/api\/v3\/coins\/markets/.test(u)).length === 1, JSON.stringify({ src: m.src }));
t('stablecoins and wrapped coins left out (no USDT, USDC, WBTC)', !m.b.some(x => ['USDT', 'USDC', 'WBTC'].includes(x.label)) && m.b.length === 12, m.b.map(x => x.label).join(','));
t('SUI (+6.4%) the biggest', [...m.b].sort((a, c2x) => c2x.tr - a.tr)[0].label === 'SUI');
const coin = await p.evaluate(() => ({ img: document.querySelector('.mk-b[data-key="bitcoin"] .mk-logo img')?.getAttribute('src') || '', sol: !!document.querySelector('.mk-b[data-key="solana"] .mk-logo .pmark svg') }));
t('each coin wears CoinGecko’s picture of it', /^https:\/\/coin-images\.coingecko\.com\/coins\/images\/1\/large\/bitcoin\.png$/.test(coin.img) || coin.sol, coin.img);
t('a picture that will not load falls back to the app’s own mark', coin.sol);
await p.click('.mk-b[data-key="ethereum"]', { force: true }); await p.waitForTimeout(700);
c = await card();
t('ETH’s card, as the reference: Ethereum, ETH, $2,593.16, ▲ 0.23%, last 24 hours', c && c.name === 'Ethereum' && c.label === 'ETH' && c.price === '$2,593.16' && /0\.23%/.test(c.chg) && /24 hours/.test(c.chg) && c.line, JSON.stringify(c));
const n1 = S.seen.length;
await p.click('.mk-ranges [data-range="1W"]'); await p.waitForTimeout(400);
t('1D and 1W come with the list (no request)', S.seen.length === n1);
await p.click('.mk-ranges [data-range="1M"]'); await p.waitForTimeout(500);
t('1M asks CoinGecko for the month', S.seen.length === n1 + 1 && /market_chart$/.test(S.seen[S.seen.length - 1]), S.seen[S.seen.length - 1]);
await p.keyboard.press('Escape');
t('no page errors', S.errs.length === 0, S.errs.slice(0, 2).join(' | '));
await S.ctx.close();
S = await open({ fail: { coingecko: true } }); p = S.p;
await p.evaluate(() => { location.hash = '#/markets'; }); await settle(p, 600);
await p.click('.mk-tabs [data-tab="crypto"]'); await settle(p);
m = await M(p);
t('CoinGecko busy: Binance’s public prices instead', m.src === 'Binance' && m.b.length >= 10 && m.b.some(x => x.label === 'BTC'), JSON.stringify({ src: m.src, n: m.b.length, err: m.err }));
await S.ctx.close();

/* ===================== stocks ===================== */
console.log('stocks');
S = await open(); p = S.p;
await p.evaluate(() => { location.hash = '#/markets'; }); await settle(p, 600);
await p.click('.mk-tabs [data-tab="stocks"]'); await settle(p, 4500);
m = await M(p);
t('Stocks: fifty US companies, from Stooq, no key', m.tab === 'stocks' && m.src === 'Stooq' && m.b.length === 50, JSON.stringify({ src: m.src, n: m.b.length, err: m.err }));
const nv = m.b.find(x => x.label === 'NVDA'), aa = m.b.find(x => x.label === 'AAPL');
t('each against yesterday’s close (read once a day and kept)', nv && Math.abs(nv.change - 3.4) < 0.02 && aa && Math.abs(aa.change - 1.2) < 0.02, JSON.stringify([nv?.change, aa?.change]));
t('one request for all fifty prices', S.seen.filter(u => u === 'stooq.com/q/l/').length === 1);
t('all fifty wear a logo (a picture or their ticker chip), the smallest too', await p.evaluate(() => { const ls = [...document.querySelectorAll('.mk-b .mk-logo')]; return ls.length === 50 && ls.every(e => e.getBoundingClientRect().width >= 12 && getComputedStyle(e).display !== 'none' && e.querySelector('img, .mk-mono')); }));
const co = await p.evaluate(() => { const q = k => document.querySelector(`.mk-b[data-key="${k}"] .mk-logo`), cr = document.querySelector('.mk-credit.is-logos');
  return { aapl: q('AAPL').querySelector('img')?.getAttribute('src'), aok: q('AAPL').querySelector('img')?.naturalWidth > 0, msft: q('MSFT').querySelector('.mk-mono')?.dataset.l, brk: q('BRK.B').querySelector('.mk-mono')?.dataset.l,
    credit: cr?.textContent, href: cr?.querySelector('a')?.getAttribute('href'), size: cr ? parseFloat(getComputedStyle(cr).fontSize) : 0 }; });
t('each company’s logo by its ticker, from Elbstream (no key)', co.aapl === 'https://api.elbstream.com/logos/symbol/AAPL' && co.aok, JSON.stringify(co));
t('…its ticker on a plain chip when there is none', co.msft === 'MSFT' && co.brk === 'BRKB', JSON.stringify(co));
t('…and Elbstream credited with a link, at 12 pt as its free use asks', co.credit === 'Logos by Elbstream' && co.href === 'https://elbstream.com' && co.size >= 16, JSON.stringify(co));
t('the sectors as groups', await p.evaluate(() => [...document.querySelectorAll('.mk-chip')].map(x => x.textContent).join(',')) === 'All,Technology,Communication,Consumer,Everyday goods,Financials,Health,Energy,Industrials');
await p.click('.mk-chip[data-group="Energy"]'); await settle(p, 1600);
t('Energy: Exxon, Chevron, ConocoPhillips', (await M(p)).b.map(x => x.label).sort().join(',') === 'COP,CVX,XOM');
await p.click('.mk-chip[data-group="All"]'); await settle(p, 1600);
await p.click('.mk-b[data-key="NVDA"]', { force: true }); await p.waitForTimeout(800);
c = await card();
t('NVDA’s card: 1M · 3M · 1Y of daily closes', c && c.name === 'Nvidia' && c.ranges === '1M* 3M 1Y' && c.line && /^\$\d/.test(c.price), JSON.stringify(c));
t('no page errors', S.errs.length === 0, S.errs.slice(0, 2).join(' | '));
await S.ctx.close();
S = await open({ fail: { stooq: true } }); p = S.p;
await p.evaluate(() => { location.hash = '#/markets'; }); await settle(p, 600);
await p.click('.mk-tabs [data-tab="stocks"]'); await settle(p, 1500);
const sq = await p.evaluate(() => document.querySelector('.mk-empty:not([hidden])')?.innerText || '');
t('Stooq turning requests away: said plainly, with the steadier way', /Stooq/.test(sq) && /Finnhub/.test(sq), sq);

console.log('  -- a Finnhub key, later --');
await p.evaluate(() => { window.__finnhubGap = 0; location.hash = '#/settings/charts'; }); await p.waitForTimeout(500);
const fh = await p.evaluate(() => [...document.querySelectorAll('.ok-card h2')].map(h => h.textContent).join(' · '));
t('Settings → Charts & prices: the OANDA key, then an optional one for stock prices', fh === 'Charts · Stock prices (optional)', fh);
await p.fill('.fh-card input', 'abcdef1234567890xyz'); await p.click('.fh-save'); await p.waitForTimeout(300);
t('…saved on this computer, not in the vault', await p.evaluate(() => localStorage.getItem('quire:setting:finnhubKey')) === 'abcdef1234567890xyz');
await p.evaluate(() => { location.hash = '#/markets'; }); await p.waitForTimeout(400);
await p.click('.mk-tabs [data-tab="forex"]'); await p.waitForTimeout(400);
await p.click('.mk-tabs [data-tab="stocks"]'); await settle(p, 3500);
m = await M(p);
const nv2 = m.b.find(x => x.label === 'NVDA');
t('with it, the Stocks tab’s quotes come from Finnhub, live; nothing else changes', m.src === 'Finnhub' && m.b.length === 50 && nv2 && Math.abs(nv2.change - 3.45) < 0.01
  && S.seen.filter(u => u === 'finnhub.io/api/v1/quote').length === 50, JSON.stringify({ src: m.src, n: m.b.length, nv: nv2?.change, err: m.err }));
await S.ctx.close();

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
