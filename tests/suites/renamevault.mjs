/* A journal folder made while the app was called Ledger is renamed to
   "Quire" the first time the desktop app opens it — and only then: a folder
   you named yourself, a "Quire" already sitting beside it, or a rename the
   system refuses all leave everything exactly where it was.

   The desktop shell is faked here — an in-memory disk behind the same
   commands main.rs exposes — so the page runs its real native code path. */
import pw from 'playwright';
import { ACCT, PB, makeTrades } from '../fixtures/ghost-fixture.mjs';

const CHROME = process.env.QUIRE_CHROMIUM || undefined;
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const DOCS = 'C:\\Users\\Minato\\Documents';
const TR = makeTrades();

/* The fake shell. The disk lives in localStorage so a reload sees it. */
const SHELL = ({ folder, files, extraDirs, refuse }) => {
  const KEY = 'fakedisk';
  if (!localStorage.getItem(KEY)) {
    const disk = { files: {}, dirs: [...extraDirs] };
    for (const [name, text] of files) disk.files[folder + '\\' + name.replace(/\//g, '\\')] = text;
    disk.files['C:\\cfg\\ledger.json'] = JSON.stringify({ folder });
    localStorage.setItem(KEY, JSON.stringify(disk));
  }
  const load = () => JSON.parse(localStorage.getItem(KEY));
  const save = d => localStorage.setItem(KEY, JSON.stringify(d));
  window.__renames = [];
  const cmds = {
    path_sep: () => '\\',
    config_dir: () => 'C:\\cfg',
    default_folder: () => DOCS_ + '\\Quire',
    read_text: ({ path }) => { const d = load(); if (!(path in d.files)) throw new Error('missing ' + path); return d.files[path]; },
    write_text: ({ path, contents }) => { const d = load(); d.files[path] = contents; save(d); },
    read_image: () => null,
    write_image: ({ path, data }) => { const d = load(); d.files[path] = data; save(d); },
    delete_path: ({ path }) => { const d = load(); delete d.files[path]; save(d); },
    open_path: () => {},
    make_dir: ({ path }) => { const d = load(); if (!d.dirs.includes(path)) d.dirs.push(path); save(d); },
    path_exists: ({ path }) => { const d = load(); return d.dirs.includes(path) || Object.keys(d.files).some(k => k === path || k.startsWith(path + '\\')); },
    rename_dir: ({ from, to }) => {
      window.__renames.push([from, to]);
      if (refuse) throw new Error('the system said no');
      const d = load();
      if (d.dirs.includes(to) || Object.keys(d.files).some(k => k.startsWith(to + '\\'))) throw new Error('exists');
      const moved = {};
      for (const [k, v] of Object.entries(d.files)) moved[k.startsWith(from + '\\') ? to + k.slice(from.length) : k] = v;
      d.files = moved; d.dirs = d.dirs.map(x => (x === from || x.startsWith(from + '\\') ? to + x.slice(from.length) : x));
      save(d);
    },
    fetch_text: () => { throw new Error('offline'); },
  };
  const DOCS_ = 'C:\\Users\\Minato\\Documents';
  window.__TAURI__ = { core: { invoke: async (cmd, args = {}) => {
    if (!cmds[cmd]) throw new Error('no command ' + cmd);
    return cmds[cmd](args);
  } } };
};

async function scenario(title, { folderName, extraDirs = [], refuse = false }) {
  console.log(title);
  const folder = DOCS + '\\' + folderName;
  const files = [
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)]];
  const b = await pw.chromium.launch({ executablePath: CHROME });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(SHELL, { folder, files, extraDirs, refuse });
  await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.topbar', { timeout: 8000 });
  await p.waitForTimeout(400);
  const disk = await p.evaluate(() => JSON.parse(localStorage.getItem('fakedisk')));
  const out = { disk, renames: await p.evaluate(() => window.__renames),
    vault: await p.evaluate(async () => { const { store } = await import('/js/store.js'); return store.folderName || ''; }),
    count: await p.evaluate(() => document.querySelector('.tb-tab[href="#/trades"] .count')?.textContent), errs };
  await b.close();
  return out;
}

const has = (disk, path) => path in disk.files;
const cfgOf = disk => JSON.parse(disk.files['C:\\cfg\\ledger.json']).folder;

let R = await scenario('a folder still called Ledger', { folderName: 'Ledger' });
t('it is renamed to Quire, beside where it was', JSON.stringify(R.renames) === JSON.stringify([[DOCS + '\\Ledger', DOCS + '\\Quire']]), JSON.stringify(R.renames));
t('every file came with it', has(R.disk, DOCS + '\\Quire\\data\\trades.json') && has(R.disk, DOCS + '\\Quire\\data\\accounts.json')
  && !Object.keys(R.disk.files).some(k => k.startsWith(DOCS + '\\Ledger\\')));
t('the app remembers the new name', cfgOf(R.disk) === DOCS + '\\Quire', cfgOf(R.disk));
t('and opens the journal from it, every trade there', R.count === String(TR.length) && /Quire/.test(R.vault), R.count);
t('no errors', R.errs.length === 0, R.errs.join(' | '));

R = await scenario('a folder you named yourself', { folderName: 'Trading journal' });
t('is left alone', R.renames.length === 0 && cfgOf(R.disk) === DOCS + '\\Trading journal' && R.count === String(TR.length));

R = await scenario('a Ledger folder with a Quire already beside it', { folderName: 'Ledger', extraDirs: [DOCS + '\\Quire'] });
t('is not renamed over it', R.renames.length === 0 && cfgOf(R.disk) === DOCS + '\\Ledger' && R.count === String(TR.length) && /Ledger/.test(R.vault));

R = await scenario('a rename the system refuses (a file held open)', { folderName: 'Ledger', refuse: true });
t('opens the journal where it was, as before', R.renames.length === 1 && cfgOf(R.disk) === DOCS + '\\Ledger' && R.count === String(TR.length), JSON.stringify({ cfg: cfgOf(R.disk), n: R.count }));
t('without an error', R.errs.length === 0, R.errs.join(' | '));

console.log(`\n${pass} passed, ${fail} failed`);
