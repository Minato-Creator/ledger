/* A journal file that cannot be opened cleanly is never written over
   (store.readFile, 7 Nov). Minato lost his trades when a trades.json left
   half-written by a crash read back as an empty journal, and opening wrote
   that empty journal over it. Here:
   - damaged, with the copy from before the last save (.bak): that copy opens,
     the damaged one is kept as .damaged, and the file is put right;
   - damaged, with only a daily copy in data/backups: the newest one opens;
   - damaged with no copy anywhere: the file is left exactly as it was — on
     opening, on a save, and the OANDA sync does not run — and a notice says so;
   - a clean opening makes the day's copy, once a day;
   - a new vault (nothing there) still starts empty, as before;
   - on the desktop, a file that is there but cannot be read is left alone,
     and a setting is not saved over a settings file that cannot be read. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB, makeTrades } from '../fixtures/ghost-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const TR = makeTrades();
const GOOD = JSON.stringify({ version: 1, trades: TR }, null, 2);
const HALF = GOOD.slice(0, Math.floor(GOOD.length / 2));          // a save cut off part way
const ACCOUNTS = JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1',
  oanda: { accountId: '101-001-1-001', laminarId: 'acc_1', lastTxn: 5, auto: true } });

const b = await pw.chromium.launch({ executablePath: CHROME });
async function open(files, { key = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: 'Australia/Perth' });
  const oanda = [];
  await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, r => { oanda.push(r.request().url()); return r.fulfill({ status: 500, body: '{}' }); });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(({ files, key }) => {
    if (localStorage.getItem('fakefs')) return;
    localStorage.setItem('fakeroot', 'Vault');
    if (key) localStorage.setItem('quire:setting:oandaKey', key);
    localStorage.setItem('fakefs', JSON.stringify(files));
  }, { files, key });
  await p.addInitScript(FAKE_FS);
  await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.topbar', { timeout: 10000 });
  await p.waitForTimeout(700);
  const disk = () => p.evaluate(() => Object.fromEntries(JSON.parse(localStorage.getItem('fakefs'))));
  const count = () => p.evaluate(() => document.querySelector('.tb-tab[href="#/trades"] .count')?.textContent);
  return { ctx, p, errs, oanda, disk, count };
}

console.log('damaged, with the copy from before the last save');
let S = await open([['data/accounts.json', ACCOUNTS], ['data/trades.json', HALF], ['data/trades.json.bak', GOOD], ['data/playbook.json', JSON.stringify(PB)]]);
let D = await S.disk();
t('the copy opens: every trade there', await S.count() === String(TR.length), await S.count());
t('…the file is put right from it', D['data/trades.json'] && JSON.parse(D['data/trades.json']).trades.length === TR.length);
t('…and the damaged one is kept beside it, as it was', D['data/trades.json.damaged'] === HALF);
t('…and it says so', await S.p.evaluate(() => /damaged — Laminar opened the last good copy/.test(document.querySelector('#toast')?.innerText || '')), await S.p.evaluate(() => document.querySelector('#toast')?.innerText));
t('no page errors', S.errs.length === 0, S.errs.slice(0, 2).join(' | '));
await S.ctx.close();

console.log('damaged, with only a daily copy');
const older = JSON.stringify({ version: 1, trades: TR.slice(0, 5) });
S = await open([['data/accounts.json', ACCOUNTS], ['data/trades.json', '   '], ['data/playbook.json', JSON.stringify(PB)],
  ['data/backups/index.json', JSON.stringify({ 'trades-Mon': '2026-11-02', 'trades-Thu': '2026-11-05' })],
  ['data/backups/trades-Mon.json', JSON.stringify({ version: 1, trades: TR.slice(0, 2) })], ['data/backups/trades-Thu.json', older]]);
t('the newest daily copy opens (Thursday’s, not Monday’s)', await S.count() === '5', await S.count());
await S.ctx.close();

console.log('damaged, with no copy anywhere');
S = await open([['data/accounts.json', ACCOUNTS], ['data/trades.json', HALF], ['data/playbook.json', JSON.stringify(PB)]], { key: 'k-123' });
D = await S.disk();
t('the file is left exactly as it was on opening', D['data/trades.json'] === HALF);
t('…a notice says it could not be opened and is being left alone', await S.p.evaluate(() => { const n = document.querySelector('.file-notice'); return !!n && /could not open your trades file/.test(n.innerText) && /data\/backups/.test(n.innerText); }),
  await S.p.evaluate(() => document.querySelector('.file-notice')?.innerText));
await S.p.evaluate(async () => { const { store } = await import('/js/store.js'); store.data.trades.trades.push({ id: 'x1', accountId: 'acc_1', date: '2026-11-07', status: 'closed', netResult: 1 }); await store.save('trades'); });
D = await S.disk();
t('…a save does not write over it either', D['data/trades.json'] === HALF);
t('…the OANDA sync does not run on opening', S.oanda.length === 0, String(S.oanda.length));
t('…the other files open and save as usual', await S.p.evaluate(async () => { const { store } = await import('/js/store.js'); store.data.accounts.displayUnit = '%'; await store.save('accounts'); return JSON.parse(JSON.parse(localStorage.getItem('fakefs')).find(([k]) => k === 'data/accounts.json')[1]).displayUnit === '%'; }));
await S.ctx.close();

console.log('a clean opening keeps a copy a day');
S = await open([['data/accounts.json', ACCOUNTS.replace('"auto":true', '"auto":false')], ['data/trades.json', GOOD], ['data/playbook.json', JSON.stringify(PB)]]);
await S.p.evaluate(async () => { const { store } = await import('/js/store.js'); await store.dailyDone; });
D = await S.disk();
const day = await S.p.evaluate(() => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()]);
const idx = JSON.parse(D['data/backups/index.json'] || '{}');
t(`today’s copy of the trades, as they were on disk (trades-${day}.json)`, D[`data/backups/trades-${day}.json`] === GOOD, Object.keys(D).filter(k => /backups/.test(k)).join(', '));
t('…the accounts and the playbook too, and the day noted', !!D[`data/backups/accounts-${day}.json`] && !!D[`data/backups/playbook-${day}.json`] && idx[`trades-${day}`] === await S.p.evaluate(async () => (await import('/js/store.js')).todayISO()));
await S.p.evaluate(d => { const m = new Map(JSON.parse(localStorage.getItem('fakefs'))); m.set(`data/backups/trades-${d}.json`, 'MARK'); localStorage.setItem('fakefs', JSON.stringify([...m])); }, day);
await S.p.reload({ waitUntil: 'domcontentloaded' }); await S.p.waitForSelector('.topbar'); await S.p.waitForTimeout(700);
await S.p.evaluate(async () => { const { store } = await import('/js/store.js'); await store.dailyDone; });
D = await S.disk();
t('…once a day: opening again the same day leaves it', D[`data/backups/trades-${day}.json`] === 'MARK');
await S.ctx.close();

console.log('a file not there yet');
S = await open([['data/accounts.json', ACCOUNTS.replace('"auto":true', '"auto":false')]]);
D = await S.disk();
t('no trades file yet: it starts empty and writes it, as before — no notice', D['data/trades.json'] && JSON.parse(D['data/trades.json']).trades.length === 0
  && await S.p.evaluate(() => !document.querySelector('.file-notice')), String(D['data/trades.json']).slice(0, 60));
await S.ctx.close();

console.log('the desktop: a file there that cannot be read');
const ROOT = 'C:\\Users\\Minato\\Documents\\Quire';
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(({ root, files }) => {
  const disk = { files: {}, dirs: [root] };
  for (const [name, text] of files) disk.files[root + '\\' + name.replace(/\//g, '\\')] = text;
  disk.files['C:\\cfg\\ledger.json'] = JSON.stringify({ folder: root, oandaKey: 'k-keep' });
  window.__disk = disk; window.__writes = [];
  const locked = p => p.endsWith('\\data\\trades.json') || (window.__lockCfg && p === 'C:\\cfg\\ledger.json');
  const cmds = {
    path_sep: () => '\\', config_dir: () => 'C:\\cfg', default_folder: () => root,
    read_text: ({ path }) => { if (locked(path)) throw new Error(path + ': The process cannot access the file because it is being used by another process. (os error 32)'); if (!(path in disk.files)) throw new Error('missing ' + path); return disk.files[path]; },
    write_text: ({ path, contents }) => { window.__writes.push(path); disk.files[path] = contents; },
    read_image: () => null, write_image: () => {}, delete_path: () => {}, open_path: () => {},
    make_dir: ({ path }) => { if (!disk.dirs.includes(path)) disk.dirs.push(path); },
    path_exists: ({ path }) => disk.dirs.includes(path) || Object.keys(disk.files).some(k => k === path || k.startsWith(path + '\\')),
    rename_dir: () => { throw new Error('no'); }, fetch_text: () => { throw new Error('offline'); }, fetch_oanda: () => { throw new Error('offline'); },
  };
  window.__TAURI__ = { core: { invoke: async (cmd, args = {}) => { if (!cmds[cmd]) throw new Error('no command ' + cmd); return cmds[cmd](args); } } };
}, { root: ROOT, files: [['data/accounts.json', ACCOUNTS], ['data/trades.json', GOOD], ['data/playbook.json', JSON.stringify(PB)]] });
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 10000 }); await p.waitForTimeout(700);
const w = await p.evaluate(() => ({ writes: window.__writes, same: window.__disk.files['C:\\Users\\Minato\\Documents\\Quire\\data\\trades.json'] }));
t('held open by something else: never written to, still all there', !w.writes.some(x => /\\data\\trades\.json$/.test(x)) && w.same === GOOD, JSON.stringify(w.writes.filter(x => /trades/.test(x))));
t('…and the notice says so', await p.evaluate(() => /could not open your trades file/.test(document.querySelector('.file-notice')?.innerText || '')));
const cfg = await p.evaluate(async () => {
  window.__lockCfg = true;
  const { fs } = await import('/js/fs.js');
  const r = await fs.setSetting('finnhubKey', 'abc').then(() => 'saved', e => 'refused: ' + e.message);
  window.__lockCfg = false;
  return { r, cfg: JSON.parse(window.__disk.files['C:\\cfg\\ledger.json']) };
});
t('a setting is not saved over a settings file that cannot be read (your OANDA key and folder stay)', /^refused/.test(cfg.r) && cfg.cfg.oandaKey === 'k-keep' && cfg.cfg.folder === ROOT, JSON.stringify(cfg));
const cfg2 = await p.evaluate(async () => { const { fs } = await import('/js/fs.js'); await fs.setSetting('finnhubKey', 'abc'); return JSON.parse(window.__disk.files['C:\\cfg\\ledger.json']); });
t('…and once it can be read again, the setting joins the others', cfg2.finnhubKey === 'abc' && cfg2.oandaKey === 'k-keep' && cfg2.folder === ROOT, JSON.stringify(cfg2));
t('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
