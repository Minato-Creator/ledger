import pw from 'playwright';
import fsx from 'node:fs';
/* ---- where this suite finds things ----------------------------------
   Paths are worked out from this file rather than typed in, so the suite
   runs from wherever the repository happens to sit. The browser is
   Playwright's own unless QUIRE_CHROMIUM names another; screenshots go to
   a scratch folder outside the repository. */
const HERE = new URL('.', import.meta.url).pathname;
const ROOT = new URL('../../', import.meta.url).pathname;
const FIX  = HERE + '../fixtures';
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const APP = 'file://' + ROOT + 'Laminar.html';
fsx.mkdirSync(OUT, { recursive: true });

const { chromium } = pw;

const FAKE_FS = `
// In-memory stand-in for the File System Access API so this flow can be driven
// headlessly. The real browser hands back the same shapes.
(() => {
  const load = () => new Map(JSON.parse(localStorage.getItem('fakefs') || '[]'));
  // Blobs cannot go through JSON, so only the text files are persisted; a
  // screenshot lives for as long as the page does, which is all a test needs.
  const persist = m => localStorage.setItem('fakefs',
    JSON.stringify([...m].filter(([, v]) => typeof v === 'string')));
  const files = load();
  const makeFile = (path, name) => ({
    kind:'file', name,
    async getFile(){
      const v = files.get(path);
      if (v instanceof Blob) return v;
      return { text: async () => v ?? '' };
    },
    async createWritable(){
      let buf = '', blob = null;
      return {
        write: async d => { if (d instanceof Blob) blob = d; else buf += typeof d==='string'?d:String(d); },
        close: async () => { files.set(path, blob || buf); persist(files); },
      };
    },
  });
  // Directories namespace their files, the way a real filesystem does, so
  // 'data/replay.json' cannot be confused with a 'replay.json' at the root.
  const makeDir = (name, prefix='') => ({
    kind:'directory', name,
    async queryPermission(){ return 'granted'; },
    async requestPermission(){ return 'granted'; },
    async getFileHandle(n, opts={}) {
      const path = prefix + n;
      if (!files.has(path) && !opts.create) { const e=new Error('nope'); e.name='NotFoundError'; throw e; }
      if (!files.has(path)) { files.set(path,''); persist(files); }
      return makeFile(path, n);
    },
    async removeEntry(n) { files.delete(prefix + n); persist(files); },
    async getDirectoryHandle(n){ return makeDir(n, prefix + n + '/'); },
  });
  window.__files = files;

  // Minimal in-memory IndexedDB. The real one structured-clones values; a real
  // FileSystemDirectoryHandle survives that, our stand-in would not.
  const mem = new Map();
  const req = (result) => { const r = { result }; setTimeout(() => r.onsuccess && r.onsuccess({ target: r }), 0); return r; };
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: {
    open() {
      const db = {
        createObjectStore(){ return {}; },
        transaction(){ return { objectStore(){ return {
          get: k => req(localStorage.getItem('fakeroot') ? makeDir(localStorage.getItem('fakeroot')) : undefined),
          put: (v, k) => { localStorage.setItem('fakeroot', v.name); return req(undefined); },
          delete: k => { localStorage.removeItem('fakeroot'); return req(undefined); },
        }; } }; },
      };
      const r = { result: db };
      setTimeout(() => { r.onupgradeneeded && r.onupgradeneeded({ target: r }); r.onsuccess && r.onsuccess({ target: r }); }, 0);
      return r;
    },
  } });
  window.showDirectoryPicker = async () => makeDir('LedgerTest');
})();
`;

const errors = [];
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.addInitScript(FAKE_FS);

const step = async (name, fn) => { try { await fn(); console.log('  ok    ' + name); } catch (e) { console.log('  FAIL  ' + name + ' — ' + e.message); if (errors.length) console.log('  page errors:\n    ' + errors.join('\n    ')); throw e; } };

await page.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'networkidle' });

// A first-time visitor is never asked to pick a folder before they have seen
// anything — they land in the app, on this browser's storage.
await step('no gate for a newcomer', async () => {
  await page.waitForSelector('.welcome-title', { timeout: 5000 });
  if (await page.locator('.gate').count()) throw new Error('a gate appeared');
});
await page.screenshot({ path: '/tmp/shot-gate.png' });

// The folder is an upgrade offered in Settings, and everything already written
// comes with it.
await step('choose folder', async () => {
  await page.evaluate(() => { location.hash = '#/settings/vault'; });
  await page.waitForTimeout(400);
  /* The head pill is gone: the Vault card owns the folder now. */
  await page.getByRole('button', { name: /Move vault/ }).click();
  await page.waitForTimeout(600);
  await page.waitForSelector('text=LedgerTest', { timeout: 5000 });
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForSelector('.welcome-title, .topbar', { timeout: 5000 });
});

await step('first run goes straight to setting up an account', async () => {
  await page.waitForSelector('text=Set up your first account', { timeout: 4000 });
});

await step('create an account', async () => {
  await page.getByPlaceholder('Swing account').fill('Main funded');
  await page.locator('.main input[inputmode="decimal"]').first().fill('100000');
  await page.locator('.field[inputmode="decimal"]').nth(1).fill('0.75');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForSelector('text=No trades on Main funded yet', { timeout: 4000 });
});

await step('the account is listed and active', async () => {
  await page.evaluate(() => location.hash = '#/accounts');
  await page.waitForSelector('text=ACTIVE', { timeout: 4000 });
  const t = await page.locator('.view').innerText();
  if (!t.includes('Started $100,000')) throw new Error('starting balance not shown');
});
await page.screenshot({ path: '/tmp/shot-accounts.png' });

await step('log a trade', async () => {
  await page.evaluate(() => location.hash = '#/new');
  await page.waitForSelector('.trade-strip', { timeout: 4000 });
  await page.getByPlaceholder('XAUUSD').fill('XAUUSD');
  await page.locator('input[type="time"]').first().fill('09:14');
  await page.locator('input[type="time"]').nth(1).fill('11:38');
  const nums = page.locator('.field[inputmode="decimal"]');
  await nums.nth(0).fill('3412.80');   // entry
  await nums.nth(1).fill('3400.80');   // stop
  await nums.nth(2).fill('3448.80');   // target
  await nums.nth(3).fill('3441.80');   // exit
  await nums.nth(4).fill('0.60');      // size
  await page.getByPlaceholder('0.00').fill('1731.60');
  await page.waitForTimeout(200);
});

await step('R is computed live as +2.31R', async () => {
  // The live maths reads along the top of the page rather than down the side.
  const strip = await page.locator('.trade-strip').innerText();
  if (!strip.includes('2.31')) throw new Error('strip showed ' + strip.replace(/\n/g, ' | '));
});

await step('1R shown as $750.00', async () => {
  const txt = await page.locator('text=$750.00').first().innerText();
  if (!txt.includes('750')) throw new Error(txt);
});
await page.screenshot({ path: '/tmp/shot-newtrade.png' });

await step('save the trade', async () => {
  await page.getByRole('button', { name: 'Save trade' }).click();
  await page.waitForSelector('.tbl-row', { timeout: 4000 });
});
await page.screenshot({ path: '/tmp/shot-trades.png' });

await step('trade log shows it', async () => {
  const row = await page.locator('.tbl-row').first().innerText();
  for (const want of ['XAUUSD', '2.31', '1,731.60']) if (!row.includes(want)) throw new Error(`row missing ${want}: ${row}`);
});

await step('dashboard KPIs are real', async () => {
  await page.evaluate(() => location.hash = '#/');
  await page.waitForSelector('.kpi-val', { timeout: 4000 });
  const t = await page.locator('.view').innerText();
  for (const want of ['+$1,731.60', '100.0%', '+2.31R']) if (!t.includes(want)) throw new Error('dashboard missing ' + want);
});
await page.screenshot({ path: '/tmp/shot-dashboard.png' });

await step('it was written to the folder as real JSON', async () => {
  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('fakefs')).find(([k]) => k === 'data/trades.json')[1]);
  const data = JSON.parse(raw);
  if (data.trades.length !== 1) throw new Error('expected 1 trade in trades.json');
  const t = data.trades[0];
  if (t.netResult !== 1731.6 || t.riskPercent !== 0.75 || t.pair !== 'XAUUSD') throw new Error(JSON.stringify(t));
});

await step('session was derived from the open time', async () => {
  const t = JSON.parse(await page.evaluate(() => JSON.parse(localStorage.getItem('fakefs')).find(([k]) => k === 'data/trades.json')[1])).trades[0];
  if (t.sessionId !== 'ses_asia') throw new Error('session was ' + t.sessionId + ' (09:14 should land in Asia)');
});

await step('data survives a reload', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.welcome-title, .topbar', { timeout: 5000 });
  const t = await page.locator('.view').innerText();
  if (!t.includes('1,731.60')) throw new Error('trade did not come back after reload');
});

await step('export produces a parseable CSV', async () => {
  await page.evaluate(() => location.hash = '#/settings');
  await page.waitForSelector('text=Vault', { timeout: 4000 });
  const csv = await page.evaluate(async () => {
    const { toCSV } = await import('./js/csv.js');
    const { store } = await import('./js/store.js');
    return toCSV(store, null);
  });
  const lines = csv.trim().split('\n');
  if (lines.length !== 2) throw new Error('expected header + 1 row, got ' + lines.length);
  if (!lines[0].startsWith('id,account,accountCurrency')) throw new Error('bad header');
  if (!lines[1].includes('Main funded') || !lines[1].includes('1731.6')) throw new Error('bad row: ' + lines[1]);
});
await page.screenshot({ path: '/tmp/shot-settings.png' });

await step('that CSV can be read back in through the importer', async () => {
  const res = await page.evaluate(async () => {
    const { toCSV } = await import('./js/csv.js');
    const { parseBrokerCSV } = await import('./js/broker.js');
    const { store } = await import('./js/store.js');
    const out = parseBrokerCSV(toCSV(store, null));
    return { ok: out.ok, n: out.trades.length, pnl: out.trades[0]?.pnl ?? null };
  });
  if (!res.ok || res.n !== 1) throw new Error(JSON.stringify(res));
});

console.log('\nconsole errors: ' + (errors.length ? '\n  ' + errors.join('\n  ') : 'none'));
await browser.close();
process.exit(errors.length ? 1 : 0);
