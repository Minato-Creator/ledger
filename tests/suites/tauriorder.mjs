/* The desktop shell's commands now run off the window's thread (7 Nov), so
   they can finish in any order — the main thread no longer lines them up.
   fs.js keeps calls on one file in the order they were made: three quick
   saves of the same file leave the last one on disk even when the shell
   finishes the first one last; calls on different files still run side by
   side; and the journal opens and saves normally on a shell that answers
   slowly and out of order.

   The shell is faked, as in renamevault: an in-memory disk behind the same
   commands main.rs exposes, each answering after its own delay. */
import pw from 'playwright';
import { ACCT, PB, makeTrades } from '../fixtures/ghost-fixture.mjs';

const CHROME = process.env.QUIRE_CHROMIUM || undefined;
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const ROOT = 'C:\\Users\\Minato\\Documents\\Quire';
const TR = makeTrades();

const SHELL = ({ root, files }) => {
  const disk = { files: {}, dirs: [root] };
  for (const [name, text] of files) disk.files[root + '\\' + name.replace(/\//g, '\\')] = text;
  disk.files['C:\\cfg\\ledger.json'] = JSON.stringify({ folder: root });
  window.__disk = disk;
  window.__log = [];
  /* how long each command takes: set by the test; by default a little, at random */
  window.__delay = () => Math.random() * 25;
  const cmds = {
    path_sep: () => '\\',
    config_dir: () => 'C:\\cfg',
    default_folder: () => root,
    read_text: ({ path }) => { if (!(path in disk.files)) throw new Error('missing ' + path); return disk.files[path]; },
    write_text: ({ path, contents }) => { disk.files[path] = contents; },
    read_image: () => null,
    write_image: ({ path, data }) => { disk.files[path] = data; },
    delete_path: ({ path }) => { delete disk.files[path]; },
    open_path: () => {},
    make_dir: ({ path }) => { if (!disk.dirs.includes(path)) disk.dirs.push(path); },
    path_exists: ({ path }) => disk.dirs.includes(path) || Object.keys(disk.files).some(k => k === path || k.startsWith(path + '\\')),
    rename_dir: () => { throw new Error('not here'); },
    fetch_text: () => { throw new Error('offline'); },
    fetch_oanda: () => { throw new Error('offline'); },
  };
  let n = 0;
  window.__TAURI__ = { core: { invoke: (cmd, args = {}) => {
    if (!cmds[cmd]) return Promise.reject(new Error('no command ' + cmd));
    const id = ++n, wait = window.__delay(cmd, args, id);
    window.__log.push(['start', id, cmd, args.path || '']);
    /* the work happens when the call finishes, like a write landing on disk */
    return new Promise((res, rej) => setTimeout(() => {
      window.__log.push(['end', id, cmd, args.path || '']);
      try { res(cmds[cmd](args)); } catch (e) { rej(e); }
    }, wait));
  } } };
};

const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(SHELL, { root: ROOT, files: [
  ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
  ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)]] });
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 10000 });
await p.waitForTimeout(500);

console.log('a shell that answers slowly and out of order');
t('the journal opens from it, every trade there', await p.evaluate(() => document.querySelector('.tb-tab[href="#/trades"] .count')?.textContent) === String(TR.length));

console.log('one file, in the order asked');
const one = await p.evaluate(async root => {
  const { fs } = await import('/js/fs.js');
  /* the first save takes longest, the last is quickest: unqueued, the oldest would land last */
  let k = 0; window.__delay = cmd => (cmd === 'write_text' ? [240, 120, 10][k++ % 3] : 5);
  window.__log.length = 0;
  await Promise.all([fs.writeText('data/order.json', 'first'), fs.writeText('data/order.json', 'second'), fs.writeText('data/order.json', 'third')]);
  const ends = window.__log.filter(x => x[0] === 'end').map(x => x[1]);
  const starts = window.__log.filter(x => x[0] === 'start').map(x => x[1]);
  return { onDisk: window.__disk.files[root + '\\data\\order.json'], ends, starts };
}, ROOT);
t('three quick saves of one file leave the last on disk', one.onDisk === 'third', JSON.stringify(one));
t('…each starting only when the one before it has finished', JSON.stringify(one.ends) === JSON.stringify(one.starts) && one.ends.length === 3, JSON.stringify(one));

const two = await p.evaluate(async () => {
  const { fs } = await import('/js/fs.js');
  window.__delay = cmd => (cmd === 'write_text' ? 150 : 5);
  const t0 = performance.now();
  await Promise.all([fs.writeText('data/a.json', 'a'), fs.writeText('data/b.json', 'b'), fs.writeText('data/c.json', 'c')]);
  return performance.now() - t0;
});
t('different files still go side by side, not one after another', two < 300, two.toFixed(0) + ' ms for three 150 ms writes');

const fails = await p.evaluate(async root => {
  const { fs } = await import('/js/fs.js');
  window.__delay = () => 5;
  const r1 = await fs.readText('data/nothing-here.json').then(() => 'read', e => 'refused: ' + e.message);
  await fs.writeText('data/nothing-here.json', 'now it is');
  return { r1, after: window.__disk.files[root + '\\data\\nothing-here.json'], exists: await fs.exists('data/nothing-here.json') };
}, ROOT);
t('a call that fails does not hold up the next one on that file', /^refused/.test(fails.r1) && fails.after === 'now it is' && fails.exists === true, JSON.stringify(fails));

console.log('the journal saving through it');
const saved = await p.evaluate(async root => {
  const { store } = await import('/js/store.js');
  let k = 0; window.__delay = cmd => (cmd === 'write_text' ? [200, 20][k++ % 2] : 5);
  store.data.accounts.accounts[0].name = 'Apex 50K (older)';
  const a = store.save('accounts');
  store.data.accounts.accounts[0].name = 'Apex 50K (newer)';
  const b2 = store.save('accounts');
  await Promise.all([a, b2]);
  return JSON.parse(window.__disk.files[root + '\\data\\accounts.json']).accounts[0].name;
}, ROOT);
t('two quick saves of your accounts: the newer one is what is kept', saved === 'Apex 50K (newer)', saved);

t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
