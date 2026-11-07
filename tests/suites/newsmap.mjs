/* The News page's map (views/newsmap.js): headlines and red folders placed by
   what they are about; the whole world, still, fitted to the card, with no
   heading, hint, scale or list; black-and-white markers for red folders and
   headlines; a click on one sliding in its news (the map gliding aside so
   nothing is covered), swapping and closing smoothly; Today / This week; no
   zoom and no press effect; and the day headings frosted, not solid black. */
import pw from 'playwright';
import fs from 'node:fs';
const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Australia/Perth' });
/* a Wednesday morning in Perth, every time: "later today" and "well into the week" were taken from
   the real clock, so on a weekend or late at night the red folders fell into the next day or week (7 Nov) */
await ctx.clock.setFixedTime(new Date('2026-11-04T09:00:00+08:00'));
/* the feeds stay out of it: the page works from what it holds */
await ctx.route(/^https:\/\/(investinglive\.com|nfs\.faireconomy\.media)\/.*/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  const now = Date.now(), ago = m => new Date(now - m * 60000).toISOString(), ahead = m => new Date(now + m * 60000).toISOString();
  const A = { id: 'acc_1', name: 'Apex 50K', currency: 'USD', startingBalance: 50000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2026-06-01', archived: false };
  const H = [['Dollar firms ahead of US services data', 'news', 5], ['Gold holds near the highs as yields ease', 'news', 8],
    ['ECB policymakers signal patience on further cuts', 'centralbank', 10], ['EUR/USD option expiries for the New York cut', 'fxorders', 12],
    ['UK gilt yields edge higher', 'news', 14], ['Bank of Japan minutes: board split on the next hike', 'centralbank', 16],
    ['RBA leaves the cash rate on hold', 'centralbank', 18]];
  const items = H.map(([title, category, m], i) => ({ id: 'w' + i, title, link: '', at: ago(m), by: '', summary: '', category }));
  /* two USD red folders later today, one for GBP well into the week */
  const E = [['ISM Services PMI', 'USD', 30], ['ADP Non-Farm Employment Change', 'USD', 20], ['Official Bank Rate', 'GBP', 60 * 40]];
  const events = E.map(([title, country, m]) => ({ id: title, title, country, at: ahead(m), impact: 'High', forecast: '', previous: '' }));
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', accounts: [A], activeAccountId: 'acc_1', theme: 'dark' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: [] })],
    ['data/wire.json', JSON.stringify({ version: 1, fetchedAt: new Date().toISOString(), seenAt: new Date().toISOString(), items })],
    ['data/news.json', JSON.stringify({ version: 1, fetchedAt: new Date().toISOString(), events })]]));
});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });

console.log('  -- what is about where --');
const about = await p.evaluate(async () => {
  const m = await import('/js/views/newsmap.js');
  const k = s => m.regionsOf(s).map(r => r.key).join(',');
  return { pair: k('EUR/USD option expiries for the New York cut'), boj: k('Bank of Japan minutes'), rba: k('RBA leaves the cash rate on hold'),
    plain: k('Gold holds near the highs as yields ease and buyers step in'), us: k('Dollar firms ahead of US services data') };
});
t('a pair names both its places (EUR/USD → Euro area and US)', about.pair === 'US,EU', about.pair);
t('a central bank names its country (Bank of Japan, RBA)', about.boj === 'JP' && about.rba === 'AU', JSON.stringify(about));
t('ordinary words are not places (“us”, “buyers”)', about.plain === '', about.plain);

await p.evaluate(() => { location.hash = '#/wire'; }); await p.waitForTimeout(900);
const M = () => p.evaluate(() => { const c = document.querySelector('.nm-card'); return c && { ranked: c.__map.ranked.map(o => `${o.region.key}:${o.total}:${o.red}`), view: { ...c.__map.view },
  red: c.querySelectorAll('.nm-mk.is-red').length, news: c.querySelectorAll('.nm-mk.is-news').length }; });
let m = await M();
t('the map is on the News page, above the wire', !!m && await p.evaluate(() => { const c = document.querySelector('.nm-card'), r = document.querySelector('.wire-card'); return c.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING; }) > 0);
t('this week: the US first (2 headlines + 2 red folders), then the Euro area, the UK…', m.ranked[0] === 'US:4:2' && m.ranked.includes('EU:2:0') && m.ranked.includes('UK:2:1'), m.ranked.join(' '));
t('a marker on each: ! where a red folder falls, a shield where it is headlines', m.red === 2 && m.news === m.ranked.length - 2, `${m.red} red, ${m.news} headlines`);
const bare = await p.evaluate(() => { const c = document.querySelector('.nm-card');
  return { text: c.querySelector('.nm-seg').parentElement === c && [...c.childNodes].filter(n => !n.classList?.contains('nm-body')).map(n => n.innerText).join(' ').replace(/\s+/g, ' ').trim() + (c.querySelector('.nm-body').innerText.replace(/[!\s]/g, '') ? ' +text' : ''), h2: !!c.querySelector('h2'), list: !!c.querySelector('.nm-list, .nm-pill'), scale: !!c.querySelector('.nm-scale'), call: !!c.querySelector('.nm-call') }; });
t('no heading, no hint, no 1–10 scale, no list of names, no callout — only Today / This week', bare.text === 'Today This week' && !bare.h2 && !bare.list && !bare.scale && !bare.call, JSON.stringify(bare));
const fits = await p.evaluate(() => { const c = document.querySelector('.nm-card'), { view: v, box } = c.__map, b = c.querySelector('.nm-body');
  const L = box.x0 * v.s + v.ox, R = box.x1 * v.s + v.ox, T = box.y0 * v.s + v.oy, B = box.y1 * v.s + v.oy;
  /* and nothing of the land in the canvas's outer rows: the top and bottom are sea */
  const cv = c.querySelector('.nm-canvas'), g = cv.getContext('2d'), edge = y => { const d = g.getImageData(0, y, cv.width, 1).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 90) n++; return n; };
  return { L, R, T, B, W: b.clientWidth, H: b.clientHeight, top: edge(2), bottom: edge(cv.height - 3) }; });
t('the whole world fits: Greenland to Cape Horn inside the card, nothing cut at the top or bottom', fits.L >= 0 && fits.R <= fits.W && fits.T >= 0 && fits.B <= fits.H && fits.top === 0 && fits.bottom === 0, JSON.stringify(fits));
const dots = await p.evaluate(() => { const c = document.querySelector('.nm-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, tint = 0;
  for (let i = 0; i < d.length; i += 4 * 7) if (d[i + 3] > 30) { n++; if (Math.abs(d[i] - d[i + 1]) > 6 || Math.abs(d[i + 1] - d[i + 2]) > 6) tint++; } return { n, tint }; });
t('the world is drawn in dots', dots.n > 3000, String(dots.n));
t('…in black and white: not a tinted dot among them', dots.tint === 0, JSON.stringify(dots));
const mk = await p.evaluate(() => [...document.querySelectorAll('.nm-mk, .nm-mk i')].map(n => { const cs = getComputedStyle(n); return [cs.backgroundColor, cs.color, cs.borderColor]; }).flat()
  .filter(c => { const v = (c.match(/\d+(\.\d+)?/g) || []).map(Number); return v.length >= 3 && (Math.abs(v[0] - v[1]) > 6 || Math.abs(v[1] - v[2]) > 6); }));
t('…and so are the markers', mk.length === 0, mk.join(' '));
const ms = await p.evaluate(() => { const c = document.querySelector('.nm-card'), t0 = performance.now(); c.__map.draw(); return Math.round(performance.now() - t0); });
t('drawing it takes well under a second', ms < 600, ms + ' ms');

console.log('  -- no zoom, no press effect --');
const box = await p.locator('.nm-body').boundingBox();
const v0 = JSON.stringify((await M()).view);
await p.mouse.move(box.x + 300, box.y + 200);
for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, -200); await p.waitForTimeout(30); }
await p.mouse.down(); await p.mouse.move(box.x + 200, box.y + 160, { steps: 5 });
const held = await p.evaluate(() => { const b = document.querySelector('.nm-body'), cs = getComputedStyle(b); return { t: cs.transform, o: cs.opacity, sh: cs.boxShadow, cv: document.querySelector('.nm-canvas').style.transform }; });
await p.mouse.up(); await p.waitForTimeout(200);
t('scrolling and dragging leave it where it is', JSON.stringify((await M()).view) === v0 && held.cv === '', v0);
t('holding the mouse down on it: nothing grows, dims or lifts', held.t === 'none' && held.o === '1' && held.sh === 'none', JSON.stringify(held));

console.log('  -- a marker\'s news --');
const us = () => p.locator('.nm-mk[data-key="US"]');
const pop = () => p.evaluate(() => { const o = document.querySelector('.nm-pop'); return o && { head: o.querySelector('.nm-pop-head strong').textContent, note: o.querySelector('.nm-pop-note').textContent,
  red: [...o.querySelectorAll('.nm-pop-row.is-red .nm-pop-what')].map(n => n.firstChild.textContent), news: [...o.querySelectorAll('.nm-pop-row:not(.is-red) .nm-pop-what')].map(n => n.textContent),
  op: +getComputedStyle(o).opacity, in: o.classList.contains('is-in'),
  inMap: (() => { const a = o.getBoundingClientRect(), b = document.querySelector('.nm-body').getBoundingClientRect(); return a.left >= b.left && a.right <= b.right + 0.5 && a.top >= b.top && a.bottom <= b.bottom + 0.5; })(),
  covers: [...document.querySelectorAll('.nm-mk')].filter(k => { const a = o.getBoundingClientRect(), r = k.getBoundingClientRect(); return r.right > a.left && r.left < a.right && r.bottom > a.top && r.top < a.bottom; }).map(k => k.dataset.key),
  on: document.querySelector('.nm-mk[data-key="US"]').classList.contains('is-on') }; });
await us().click(); await p.waitForTimeout(60);
const early = await pop();
await p.waitForTimeout(600);
let q = await pop();
t('clicking the US marker slides its news in (part way at first, then all there)', early && early.op < 0.95 && q && q.op === 1 && q.in && q.head === 'United States' && q.on, JSON.stringify({ early: early && early.op, now: q && q.op }));
t('…its red folders, soonest first', q && q.red.join(' | ') === 'ADP Non-Farm Employment Change | ISM Services PMI', q && q.red.join(' | '));
t('…and its headlines, newest first', q && q.news.join(' | ') === 'Dollar firms ahead of US services data | EUR/USD option expiries for the New York cut', q && q.news.join(' | '));
t('…inside the card, covering no marker', q && q.inMap && q.covers.length === 0, JSON.stringify(q && q.covers));
const narrow = await p.evaluate(async () => { const c = document.querySelector('.nm-card'); c.style.width = '980px'; await new Promise(r => setTimeout(r, 900));
  const st = getComputedStyle(c.querySelector('.nm-stage')).transform, o = c.querySelector('.nm-pop').getBoundingClientRect();
  const hit = [...c.querySelectorAll('.nm-mk')].filter(k => { const r = k.getBoundingClientRect(); return r.right > o.left && r.left < o.right && r.bottom > o.top && r.top < o.bottom; }).map(k => k.dataset.key);
  c.style.width = ''; await new Promise(r => setTimeout(r, 700)); return { st, hit }; });
t('on a narrower card the map glides left to make room', narrow.st !== 'none' && narrow.hit.length === 0, JSON.stringify(narrow));
const h0 = await p.evaluate(() => document.querySelector('.nm-pop').offsetHeight);
await p.locator('.nm-mk[data-key="UK"]').click(); await p.waitForTimeout(90);
const mid = await p.evaluate(() => ({ h: document.querySelector('.nm-pop').offsetHeight, n: document.querySelectorAll('.nm-pop').length }));
await p.waitForTimeout(500);
q = await pop();
const h1 = await p.evaluate(() => document.querySelector('.nm-pop').offsetHeight);
t('another marker swaps it for that place, the panel easing to its new height', q && q.head === 'United Kingdom' && q.red.length === 1 && mid.n === 1 && h1 < h0 && mid.h < h0 && mid.h > h1, JSON.stringify({ h0, mid: mid.h, h1 }));
await p.keyboard.press('Escape'); await p.waitForTimeout(40);
const going = await pop();
await p.waitForTimeout(400);
t('Escape puts it away — fading out, then gone', going && !going.in && !(await pop()), JSON.stringify(going && { op: going.op, in: going.in }));
await us().click(); await p.waitForTimeout(450);
await us().click(); await p.waitForTimeout(450);
t('a second click on the same marker closes it', !(await pop()));
await us().click(); await p.waitForTimeout(450);
await p.mouse.click(box.x + 40, box.y + box.height - 30); await p.waitForTimeout(450);
t('a click on the map itself closes it', !(await pop()));
await us().click(); await p.waitForTimeout(450);
await p.click('.nm-seg button:first-child'); await p.waitForTimeout(400);
q = await pop();
t('it stays open when the page redraws (Today), without coming in again', q && q.head === 'United States' && /^Today/.test(q.note) && q.op === 1, JSON.stringify(q));
await p.keyboard.press('Escape');

console.log('  -- today --');
m = await M();
t('Today leaves out the red folder later in the week', !m.ranked.some(r => r.startsWith('UK:2')) && m.ranked.some(r => r.startsWith('UK:1:0')), m.ranked.join(' '));
await p.click('.nm-seg button:last-child'); await p.waitForTimeout(500);

console.log('  -- the day headings --');
/* the same fill as the chips in every look (translucent under glass, a soft grey when solid), frosted and rounded — not the card's own black */
const dh = await p.evaluate(() => { const a = el => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, blur: cs.backdropFilter || cs.webkitBackdropFilter, radius: cs.borderRadius }; };
  return { chip: getComputedStyle(document.querySelector('.wire-chip:not(.is-on)')).backgroundColor, card: getComputedStyle(document.querySelector('.wire-card')).backgroundColor,
    wire: a(document.querySelector('.wire-day')), week: document.querySelector('.rf-week-day') ? a(document.querySelector('.rf-week-day')) : null }; });
t('the day headings: the chips’ fill, frosted and rounded, not a solid block', dh.wire.bg === dh.chip && dh.wire.bg !== dh.card && /blur/.test(dh.wire.blur) && dh.wire.radius !== '0px'
  && (!dh.week || (dh.week.bg === dh.chip && /blur/.test(dh.week.blur))), JSON.stringify(dh));

t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
