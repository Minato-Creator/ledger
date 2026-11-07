/* Your journal, found (app.js findYourJournal, 7 Nov). The desktop app lost
   track of Minato's vault and opened a new, empty journal while his trades
   sat in D:\bagus\Documents\Ledger Vault. On the desktop, a journal that opens
   with no trades of your own (synced OANDA ones do not count) looks for
   another on the computer that has some, and opens the one with the most —
   keeping the OANDA key and the other settings, leaving the empty journal as
   it was, and only once. A journal with trades of its own never looks.

   The shell is faked (as in renamevault): an in-memory disk behind the same
   commands main.rs exposes, find_vaults included. */
import pw from 'playwright';
import { ACCT, PB, makeTrades } from '../fixtures/ghost-fixture.mjs';

const CHROME = process.env.QUIRE_CHROMIUM || undefined;
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const EMPTY = 'C:\\Users\\bagus\\Documents\\Ledger', REAL = 'D:\\bagus\\Documents\\Ledger Vault', SMALL = 'C:\\Users\\bagus\\Desktop\\Old journal';
const TR = makeTrades();
const OANDA_ACCT = { id: 'acc_oa', name: 'OANDA Demo', currency: 'USD', startingBalance: 100000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2026-11-01', archived: false };
const synced = [{ id: 'oanda-101-7', oanda: { id: '7' }, accountId: 'acc_oa', pair: 'EURUSD', side: 'buy', status: 'closed', date: '2026-11-05', netResult: 12, tagIds: [] }];
const vault = (root, accounts, trades) => [
  [root + '\\vault.json', JSON.stringify({ kind: 'quire-vault', version: 1, app: 'Laminar' })],
  [root + '\\data\\accounts.json', JSON.stringify(accounts)],
  [root + '\\data\\trades.json', JSON.stringify({ version: 1, trades })],
  [root + '\\data\\playbook.json', JSON.stringify(PB)]];
const DISK = [
  ...vault(EMPTY, { version: 2, displayUnit: '$', theme: 'dark', accounts: [OANDA_ACCT], activeAccountId: 'acc_oa' }, synced),
  ...vault(REAL, { version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1', tradeScope: 'all' }, TR),
  ...vault(SMALL, { version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' }, TR.slice(0, 2))];

const SHELL = ({ disk0, cfg0 }) => {
  if (!sessionStorage.getItem('disk')) sessionStorage.setItem('disk', JSON.stringify({ files: Object.fromEntries(disk0), dirs: [] }));
  if (!sessionStorage.getItem('cfg')) sessionStorage.setItem('cfg', JSON.stringify(cfg0));
  const disk = JSON.parse(sessionStorage.getItem('disk'));
  disk.files['C:\\cfg\\ledger.json'] = sessionStorage.getItem('cfg');
  const keep = () => { sessionStorage.setItem('disk', JSON.stringify(disk)); sessionStorage.setItem('cfg', disk.files['C:\\cfg\\ledger.json']); };
  window.__disk = disk; window.__calls = [];
  const cmds = {
    path_sep: () => '\\', config_dir: () => 'C:\\cfg', default_folder: () => 'C:\\Users\\bagus\\Documents\\Quire',
    read_text: ({ path }) => { if (!(path in disk.files)) throw new Error('missing ' + path); return disk.files[path]; },
    write_text: ({ path, contents }) => { disk.files[path] = contents; keep(); },
    read_image: () => null, write_image: () => {}, delete_path: ({ path }) => { delete disk.files[path]; keep(); }, open_path: () => {},
    make_dir: ({ path }) => { if (!disk.dirs.includes(path)) disk.dirs.push(path); keep(); },
    path_exists: ({ path }) => disk.dirs.includes(path) || Object.keys(disk.files).some(k => k === path || k.startsWith(path + '\\')),
    rename_dir: () => { throw new Error('no'); }, fetch_text: () => { throw new Error('offline'); }, fetch_oanda: () => { throw new Error('offline'); },
    find_vaults: () => ['C:\\Users\\bagus\\Documents\\Ledger', 'D:\\bagus\\Documents\\Ledger Vault', 'C:\\Users\\bagus\\Desktop\\Old journal'],
  };
  window.__TAURI__ = { core: { invoke: async (cmd, args = {}) => { window.__calls.push(cmd); if (!cmds[cmd]) throw new Error('no command ' + cmd); return cmds[cmd](args); } } };
};

const b = await pw.chromium.launch({ executablePath: CHROME });
async function open(cfg0) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(SHELL, { disk0: DISK, cfg0 });
  await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.topbar', { timeout: 10000 });
  await p.waitForTimeout(900);
  const state = () => p.evaluate(async () => {
    const { store } = await import('/js/store.js');
    return { folder: store.folderPath, own: store.trades.filter(x => !x.oanda).length, cfg: JSON.parse(window.__disk.files['C:\\cfg\\ledger.json']),
      calls: window.__calls.filter(c => c === 'find_vaults').length, toast: document.querySelector('#toast')?.innerText || '' };
  });
  return { ctx, p, errs, state };
}

console.log('an empty journal opens while yours is elsewhere');
let S = await open({ folder: EMPTY, oandaKey: 'k-keep', oandaLive: false });
let st = await S.state();
t('Laminar opens yours instead — the one with the most of your trades', st.folder === REAL && st.own === TR.length, JSON.stringify({ folder: st.folder, own: st.own }));
t('…and says so, naming where it is and that the empty one is left alone', /Your journal is back/.test(st.toast) && st.toast.includes(REAL) && /left as it was/.test(st.toast), st.toast);
t('…the settings now point at it, your OANDA key kept, and it is remembered', st.cfg.folder === REAL && st.cfg.oandaKey === 'k-keep' && st.cfg.vaultFound === REAL, JSON.stringify(st.cfg));
t('…the empty journal untouched: its one synced trade still all it holds', await S.p.evaluate(e => JSON.parse(window.__disk.files[e + '\\data\\trades.json']).trades.length === 1, EMPTY));
t('…the screen shows your trades', await S.p.evaluate(() => document.querySelector('.tb-tab[href="#/trades"] .count')?.textContent) === String(TR.length));
await S.p.reload({ waitUntil: 'domcontentloaded' }); await S.p.waitForSelector('.topbar'); await S.p.waitForTimeout(900);
st = await S.state();
t('opening again: straight into yours, no looking around', st.folder === REAL && st.calls === 0, JSON.stringify({ folder: st.folder, calls: st.calls }));
t('no page errors', S.errs.length === 0, S.errs.slice(0, 2).join(' | '));
await S.ctx.close();

console.log('once only');
S = await open({ folder: EMPTY, oandaKey: 'k-keep', vaultFound: REAL });
st = await S.state();
t('an empty journal you went back to on purpose is left open', st.folder === EMPTY, st.folder);
await S.ctx.close();

console.log('a journal with trades of its own');
S = await open({ folder: SMALL });
st = await S.state();
t('never looks for another, even when a bigger one is on the computer', st.folder === SMALL && st.calls === 0 && st.own === 2, JSON.stringify({ folder: st.folder, calls: st.calls }));
await S.ctx.close();

console.log('choosing a folder (Move vault, first run)');
S = await open({ folder: SMALL, oandaKey: 'k-keep', finnhubKey: 'f-keep' });
const kept = await S.p.evaluate(async () => { const { fs } = await import('/js/fs.js'); await fs.adopt('C:\\Users\\bagus\\Documents\\Fresh'); return JSON.parse(window.__disk.files['C:\\cfg\\ledger.json']); });
t('the folder changes and every other setting stays (it used to keep the folder alone)', kept.folder === 'C:\\Users\\bagus\\Documents\\Fresh' && kept.oandaKey === 'k-keep' && kept.finnhubKey === 'f-keep', JSON.stringify(kept));
await S.ctx.close();

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
