/* The monthly certificate: opened from the year on the Calendar, and the horses as a share background. */
import pw from 'playwright';
import fs from 'node:fs';
const HERE = new URL('.', import.meta.url).pathname;
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = pw;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs','utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

// September loses 900; October makes 4,280 over 14 trades (10 wins, 4 losses), 1% risked on each.
const trades = []; let n = 0;
const add = (ym, results) => results.forEach((r, i) => trades.push({ id: 't' + (++n), accountId: 'acc_1', assetClass: 'Forex', pair: 'XAUUSD',
  side: i % 2 ? 'sell' : 'buy', date: `${ym}-${String(2 + i).padStart(2, '0')}`, timeOpen: '09:15', timeClose: '10:00', status: 'closed',
  riskPercent: 1, netResult: r, tagIds: [], notes: '', setupId: null, sessionId: null }));
add('2026-09', [-500, 300, -700]);
add('2026-10', [900, 800, -500, 700, 600, -400, 900, 500, -600, 480, 400, -500, 600, 400]);

const b = await chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1580, height: 980 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
let pass = 0, fail = 0; const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };

await p.addInitScript(({ trades }) => {
  localStorage.setItem('fakeroot', 'Cert');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', userName: 'Minato', accounts: [{ id: 'acc_1', name: 'Prop 100k', currency: 'USD', startingBalance: 100000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2025-11-01', archived: false, weeklyTargetPercent: 0 }], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades })],
  ]));
}, { trades });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar');
await p.evaluate(() => location.hash = '#/calendar'); await p.waitForTimeout(450);
await p.evaluate(() => document.querySelector('.cal-span [data-span="year"]').click());
await p.waitForTimeout(800);

t('each traded month is a button on the chart', await p.locator('.yr-hit').count() === 2);
t('the chart says what a click does', /certificate/i.test(await p.locator('.yr-hint').innerText()));
await p.click('.yr-hit[data-month="9"]'); await p.waitForTimeout(300);
t('a losing month opens nothing…', await p.locator('.sheet.is-cert').count() === 0);
t('…and says why', /ended in profit/.test(await p.locator('#toast').innerText().catch(() => '')));
await p.click('.yr-hit[data-month="10"]'); await p.waitForTimeout(1200);
t('a month in profit opens its certificate', await p.locator('.sheet.is-cert .cert-canvas').count() === 1);
const m = await p.evaluate(() => document.querySelector('.sheet.is-cert .cert').__cert.model);
t('it names the month', m.month === 'October 2026', m.month);
t('the profit is the month\'s own', m.amount === '$4,280.00', m.amount);
t('presented to the name in the app', m.name === 'Minato', m.name);
t('return is of the starting balance', m.ret === '+4.28%', m.ret);
t('win rate from its wins and losses', m.rate === '71%', m.rate);
t('R earned is there', /^[+−-]?\d+(\.\d)?R$/.test(m.r), m.r);
const px = await p.evaluate(() => {
  const cv = document.querySelector('.cert-canvas'), g = cv.getContext('2d');
  const at = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3);
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let dark = 0, colour = 0;
  for (let i = 0; i < d.length; i += 16) { if (d[i] < 140) dark++; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 60) colour++; }
  return { w: cv.width, h: cv.height, corner: at(4, 4), right: at(Math.round(cv.width * 0.93), Math.round(cv.height * 0.6)), dark, colour };
});
t('the page is landscape, blue on the left', px.w === 2400 && px.h === 1696 && px.corner[2] > 200 && px.corner[0] < 90, JSON.stringify(px.corner));
t('and warm white on the right', px.right.every(v => v > 225), JSON.stringify(px.right));
t('the mark and the words are drawn on it', px.dark > 20000, String(px.dark));
await p.screenshot({ path: OUT + '/cert.png' });
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click('.sheet.is-cert [data-out="save"]')]);
t('Save picture gives a PNG named for the month', dl.suggestedFilename() === 'Laminar-October-2026.png', dl.suggestedFilename());
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
t('Escape closes it', await p.locator('.sheet.is-cert').count() === 0);
await p.focus('.yr-hit[data-month="10"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
t('Enter on a month opens it too', await p.locator('.sheet.is-cert').count() === 1);
await p.keyboard.press('Escape'); await p.waitForTimeout(500);

// ---- the whole year ----
t('the year has its own button, top right', await p.locator('.head .yr-cert').count() === 1);
await p.click('.head .yr-cert'); await p.waitForTimeout(350);
t('it offers the year or a month', await p.locator('.pop-cert-menu .pop-item').count() === 2
  && await p.locator('.pop-cert-menu [data-go="Yearly certificate"]').count() === 1
  && await p.locator('.pop-cert-menu [data-go="Monthly certificate"]').count() === 1);
await p.click('.pop-cert-menu [data-go="Monthly certificate"]'); await p.waitForTimeout(300);
t('Monthly lists the months in profit, and only those', (await p.locator('.pop-cert-menu .pop-item').evaluateAll(n => n.map(b => b.dataset.month).join())) === '10');
await p.click('.pop-cert-menu [data-month="10"]'); await p.waitForTimeout(900);
t('picking one opens that month', (await p.evaluate(() => document.querySelector('.sheet.is-cert .cert').__cert.model.month)) === 'October 2026');
t('and the menu has gone', await p.locator('.pop-cert-menu').count() === 0);
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
await p.click('.head .yr-cert'); await p.waitForTimeout(350);
await p.click('.pop-cert-menu [data-go="Yearly certificate"]'); await p.waitForTimeout(900);
const ym = await p.evaluate(() => document.querySelector('.sheet.is-cert .cert').__cert.model);
t('it is the year\'s certificate', ym.month === '2026' && ym.kind === 'Yearly profit', ym.month + ' / ' + ym.kind);
t('the year\'s profit is its months added up', ym.amount === '$3,380.00', ym.amount);
t('and its win rate is over all its trades', ym.rate === '65%', ym.rate);
t('its title says yearly', /Yearly certificate/.test(await p.locator('.sheet.is-cert h2').innerText()));
const [ydl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click('.sheet.is-cert [data-out="save"]')]);
t('saved under the year', ydl.suggestedFilename() === 'Laminar-2026.png', ydl.suggestedFilename());
await p.keyboard.press('Escape'); await p.waitForTimeout(500);

// ---- the horses behind a shared trade ----
await p.evaluate(() => location.hash = '#/trade/t10'); await p.waitForTimeout(700);
await p.click('.td-share'); await p.waitForSelector('.sheet.is-share'); await p.waitForTimeout(600);
t('Horses is one of the backgrounds made here', await p.locator('.sh-tile[data-bg="original:horses"]').count() === 1);
await p.click('.sh-tile[data-bg="original:horses"]'); await p.waitForTimeout(4200);
t('choosing it', (await p.evaluate(() => document.querySelector('.sheet.is-share .sh').__share.state.bg)) === 'original:horses');
const card = await p.evaluate(() => {
  const cv = document.querySelector('.sh-canvas'), g = cv.getContext('2d');
  const c = [...g.getImageData(cv.width >> 1, 4, 1, 1).data].slice(0, 3);   // clear of the rounded corners
  return { c };
});
t('the card is on light paper', card.c.every(v => v > 215), JSON.stringify(card.c));
await p.screenshot({ path: OUT + '/cert-share.png' });
/* The single-file build only carries the first name of `export const a = 1, b = 2`, which once left the
   certificate's canvas at the default height in the built app while the source ran fine. */
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : e.name.endsWith('.js') ? [d + '/' + e.name] : []);
const pairs = walk(HERE + '../../src/js').filter(f => /^export (const|let) \w+ = [^;(\[{'"`]*, \w+ = /m.test(fs.readFileSync(f, 'utf8')));
t('no export declares two names on one line', pairs.length === 0, pairs.join(' '));
const built = fs.readFileSync(HERE + '../../Laminar.html', 'utf8');
t('the built app knows the page\'s height', /CERT_H/.test(built) && !/CERT_W = 1200, CERT_H/.test(built));
// ---- the certificate's blue page behind a shared trade ----
t('Blue is one of the backgrounds made here', await p.locator('.sh-tile[data-bg="original:blue"]').count() === 1);
await p.click('.sh-tile[data-bg="original:blue"]'); await p.waitForTimeout(4200);
const blue = await p.evaluate(() => { const cv = document.querySelector('.sh-canvas'), g = cv.getContext('2d'); const at = (fx, fy) => [...g.getImageData(Math.round(cv.width * fx), Math.round(cv.height * fy), 1, 1).data].slice(0, 3);
  return { bg: document.querySelector('.sheet.is-share .sh').__share.state.bg, left: at(0.02, 0.5), right: at(0.98, 0.5) }; });
t('choosing it: blue on the left, pale on the right', blue.bg === 'original:blue' && blue.left[2] > 180 && blue.left[0] < 110 && blue.right.every(v => v > 200), JSON.stringify(blue));
await p.screenshot({ path: OUT + '/cert-share-blue.png' });
t('no errors', errs.length === 0, errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
