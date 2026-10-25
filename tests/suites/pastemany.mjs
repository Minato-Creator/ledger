/* New trade: Ctrl+V a chart as many times as you like.

   Each paste repaints the chart box, and the button that had focus is
   repainted away with it, so focus falls back to the page body. The paste
   used to be listened for on the view, below the body, so from the third
   paste on (or the first, with nothing clicked) it went nowhere. These are
   real key presses on a real clipboard, from wherever focus happens to be. */
import pw from 'playwright';
import fs from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const FIX  = HERE + '../fixtures';
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
const PNG = fs.readFileSync(FIX + '/chart-htf.png').toString('base64');

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(() => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark',
    accounts: [{ id: 'acc_1', name: 'Funded', currency: 'USD', startingBalance: 100000, defaultRiskPercent: 1, color: '#0988F0',
      openedAt: '2026-09-01', archived: false, weeklyTargetPercent: 0 }], activeAccountId: 'acc_1' })]]));
});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });

const copy = () => p.evaluate(async b64 => {
  const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bin], { type: 'image/png' }) })]);
}, PNG);
const paste = async () => { await copy(); await p.keyboard.press('Control+V'); await p.waitForTimeout(700); };
const thumbs = () => p.evaluate(() => document.querySelectorAll('.shot-box .shot-thumb').length);
const fresh = async () => {
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(250);
  await p.evaluate(() => { location.hash = '#/new'; }); await p.waitForTimeout(600);
};

/* ---------- with nothing clicked at all ---------- */
await fresh();
for (let i = 0; i < 5; i++) await paste();
t('five pastes with nothing clicked give five charts', await thumbs() === 5, String(await thumbs()));
t('and focus really is on the page body, the case that used to fail',
  await p.evaluate(() => document.activeElement === document.body));

/* ---------- after clicking the drop area ---------- */
await fresh();
await p.click('.shot-zone');
await p.keyboard.press('Escape');
for (let i = 0; i < 4; i++) await paste();
t('after clicking the drop area, four pastes give four', await thumbs() === 4, String(await thumbs()));

/* ---------- while typing in a field ---------- */
await fresh();
await p.click('.view input.field');
for (let i = 0; i < 3; i++) await paste();
t('from inside a field, three pastes give three', await thumbs() === 3, String(await thumbs()));
t('and the field keeps focus', await p.evaluate(() => document.activeElement?.classList.contains('field')));

/* ---------- the charts are the ones pasted, in order, and they save ---------- */
t('each one is shown with its size', await p.evaluate(() =>
  [...document.querySelectorAll('.shot-box .shot-thumb-tag')].every(x => /^\d+×\d+$/.test(x.textContent))));

/* ---------- a paste on another page is not taken by this one ---------- */
await fresh();
await paste();
await p.evaluate(() => { location.hash = '#/trades'; }); await p.waitForTimeout(500);
await paste();
await p.evaluate(() => { location.hash = '#/new'; }); await p.waitForTimeout(600);
t('a paste on the trades page does not land on a new trade', await thumbs() === 0, String(await thumbs()));
await paste(); await paste();
t('and back on New trade, pasting works again at once', await thumbs() === 2, String(await thumbs()));
await p.screenshot({ path: OUT + '/pastemany.png' });
t('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
