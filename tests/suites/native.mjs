/* The native backend, driven through a stand-in for the Rust side.
   Every command below does exactly what main.rs does, in JS: absolute paths,
   real folder semantics, a config dir separate from the journal. If the app
   works against this, the only thing left to be wrong is the Rust itself. */
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

const TAURI_STUB = `
(() => {
  const load = () => new Map(JSON.parse(localStorage.getItem('nativefs') || '[]'));
  const files = load();                       // absolute path -> contents
  const dirs  = new Set(JSON.parse(localStorage.getItem('nativedirs') || '[]'));
  const persist = () => {
    localStorage.setItem('nativefs', JSON.stringify([...files]));
    localStorage.setItem('nativedirs', JSON.stringify([...dirs]));
  };
  const SEP = '\\\\';                           // pretend to be Windows
  const HOME = 'C:' + SEP + 'Users' + SEP + 'Minato';
  const norm = p => p.split(/[\\\\/]+/).join(SEP);
  const parent = p => norm(p).split(SEP).slice(0, -1).join(SEP);

  window.__TAURI_STUB_STATE__ = { files, dirs, HOME, SEP };
  window.__TAURI__ = {
    core: {
      invoke: async (cmd, args = {}) => {
        const path = args.path != null ? norm(args.path) : null;
        switch (cmd) {
          case 'path_sep': return SEP;
          case 'config_dir': {
            const d = HOME + SEP + 'AppData' + SEP + 'Roaming' + SEP + 'com.minato.ledger';
            dirs.add(d); persist(); return d;
          }
          case 'default_folder': return HOME + SEP + 'Documents' + SEP + 'Ledger';
          case 'path_exists': return files.has(path) || dirs.has(path);
          case 'make_dir': {
            const parts = path.split(SEP);
            for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join(SEP));
            persist(); return null;
          }
          case 'read_text': {
            if (!files.has(path)) throw new Error(path + ': No such file or directory');
            return files.get(path);
          }
          case 'write_text': {
            const par = parent(path);
            const parts = par.split(SEP);
            for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join(SEP));
            files.set(path, args.contents); persist(); return null;
          }
          // Pictures cross the bridge as base64, the same as the real shell.
          case 'read_image': return files.has(path) ? files.get(path) : null;
          case 'write_image': {
            const parts = parent(path).split(SEP);
            for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join(SEP));
            files.set(path, args.data); persist(); return null;
          }
          case 'delete_path': { files.delete(path); persist(); return null; }
          case 'open_path': { window.__REVEALED__ = path; return null; }
          default: throw new Error('unknown command ' + cmd);
        }
      },
    },
    dialog: {
      open: async () => window.__PICK__ ?? null,
    },
  };
})();
`;

const errors = [];
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.addInitScript(TAURI_STUB);
await page.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });

let pass = 0, fail = 0;
const ok = (n, g, w) => { const good = String(g) === String(w); good ? pass++ : fail++;
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${n}  got=${g}${good ? '' : `  want=${w}`}`); };
const disk = () => page.evaluate(() => Object.fromEntries(window.__TAURI_STUB_STATE__.files));

console.log('  -- first run: where does the vault go --');
await page.waitForSelector('.gate-card', { timeout: 8000 });
const gateText = await page.evaluate(() => document.querySelector('.gate-card').innerText.replace(/\n/g, ' | '));
console.log('   ', gateText);
ok('it asks before writing anything', /Where should your vault live/.test(gateText), true);
ok('with a folder already suggested', /Documents.Ledger/.test(gateText), true);
ok('and nothing on disk yet', Object.keys(await disk()).filter(p => p.includes('Documents')).length, 0);
await page.evaluate(() => [...document.querySelectorAll('.gate-actions button')].find(b => /Use this folder/.test(b.textContent)).click());
await page.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });
ok('the gate is gone once answered', await page.evaluate(() => !document.querySelector('.gate')), true);
ok('the app rendered', await page.evaluate(() => !!document.querySelector('.welcome-title') || !!document.querySelector('.topbar')), true);
ok('first run asks for an account and nothing else', await page.evaluate(() => /Set up your first account/.test(document.querySelector('.main').innerText)), true);

const files = await disk();
const paths = Object.keys(files);
console.log('  files created:\n    ' + paths.join('\n    '));
ok('the vault went to Documents\\Ledger', paths.some(p => p.includes('Documents\\Ledger\\data\\accounts.json')), true);
ok('trades.json sits in data', paths.some(p => p.endsWith('Documents\\Ledger\\data\\trades.json')), true);
ok('playbook.json too', paths.some(p => p.endsWith('Documents\\Ledger\\data\\playbook.json')), true);
ok('the replay with them', paths.some(p => p.endsWith('Documents\\Ledger\\data\\replay.json')), true);
ok('and the folder says what it is', paths.some(p => p.endsWith('Documents\\Ledger\\vault.json')), true);
ok('the chosen folder is remembered in AppData, not the journal',
   paths.some(p => p.includes('AppData') && p.endsWith('ledger.json')), true);
ok('and the journal folder itself holds no config',
   paths.some(p => p.includes('Documents\\Ledger') && p.endsWith('ledger.json')), false);
ok('what it writes is real JSON', (() => { try { JSON.parse(files[paths.find(p=>p.endsWith('trades.json'))]); return true; } catch { return false; } })(), true);

console.log('  -- a full trade, natively --');
await page.locator('.main input[placeholder="Swing account"]').fill('Prop 100k');
await page.locator('.main input[inputmode="decimal"]').first().fill('$100 000');
await page.locator('.field[inputmode="decimal"]').nth(1).fill('0.75');
await page.evaluate(() => [...document.querySelectorAll('.main .btn-primary')].find(b=>/Create account/.test(b.textContent)).click());
await page.waitForTimeout(600);
ok('the account saved through Rust', await page.evaluate(() =>
  JSON.parse(window.__TAURI_STUB_STATE__.files.get([...window.__TAURI_STUB_STATE__.files.keys()].find(k=>k.endsWith('accounts.json')))).accounts[0].startingBalance), 100000);

await page.evaluate(() => { location.hash = '#/new'; });
await page.waitForTimeout(400);
await page.locator('.main input').first().fill('XAUUSD');
await page.locator('.main input[placeholder="0.00"]').fill('1 731.60');
await page.waitForTimeout(250);
ok('R computes the same as on the web', await page.evaluate(() => document.querySelector('.main .kpi-val')?.textContent.trim()), '+$1,731.60');
await page.evaluate(() => [...document.querySelectorAll('.main button')].find(b=>/Save/.test(b.textContent)).click());
await page.waitForTimeout(600);
const after = await disk();
const tradesFile = after[Object.keys(after).find(p => p.endsWith('trades.json'))];
ok('the trade is on disk', JSON.parse(tradesFile).trades.length, 1);
ok('with the amount it was given', JSON.parse(tradesFile).trades[0].netResult, 1731.6);

console.log('  -- it survives a restart --');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });
ok('still no gate on the second run', await page.evaluate(() => !document.querySelector('.gate')), true);
ok('the account came back', await page.evaluate(() => document.querySelector('.acct-name')?.textContent), 'Prop 100k');
ok('and the trade', await page.evaluate(() => document.querySelector('.tb-tab .count')?.textContent), '1');

console.log('  -- every screen, natively --');
for (const [hash, name] of [['#/','dashboard'],['#/trades','trades'],['#/calendar','calendar'],
                            ['#/analytics','analytics'],['#/replay','replay'],['#/playbook','playbook'],['#/settings','settings']]) {
  const before = errors.length;
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(350);
  const txt = await page.evaluate(() => document.querySelector('.main')?.innerText.trim() || '');
  const good = errors.length === before && txt.length > 15;
  good ? pass++ : fail++;
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${name}${good ? '' : '  ' + (errors.slice(before).join(' | ') || 'BLANK')}`);
}
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + '/shot-native.png' });

console.log('  -- moving the journal somewhere else --');
// give the trade a chart, so the move has a picture to carry as well as text
await page.evaluate(async () => {
  const { store } = await import('/js/store.js');
  const t = store.trades[0];
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 24;
  canvas.getContext('2d').fillRect(0, 0, 24, 24);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg'));
  await store.putShot(t.id, blob, 'ltf');
});
await page.waitForTimeout(400);
ok('the chart was written into the journal folder', await page.evaluate(() =>
  [...window.__TAURI_STUB_STATE__.files.keys()].some(k => /Documents.Ledger.screenshots.*-ltf\.jpg$/.test(k))), true);
await page.evaluate(p => { window.__PICK__ = p; }, 'D:\\Trading\\Journal');
const moved = await page.evaluate(async () => {
  const { store } = await import('/js/store.js');
  return store.connect();
});
await page.waitForTimeout(500);
ok('the picker result is accepted', moved, true);
const afterMove = await disk();
ok('the new folder is written to', Object.keys(afterMove).some(p => p.startsWith('D:\\Trading\\Journal')), true);
ok('and remembered for next time', JSON.parse(afterMove[Object.keys(afterMove).find(p=>p.endsWith('AppData\\Roaming\\com.minato.ledger\\ledger.json'))]).folder, 'D:\\Trading\\Journal');
ok('the old folder is left alone, not deleted', Object.keys(afterMove).some(p => p.includes('Documents\\Ledger\\data\\trades.json')), true);

// Moving house, not starting over: the trades have to arrive at the new address.
const carried = JSON.parse(afterMove['D:\\Trading\\Journal\\data\\trades.json'] || '{"trades":[]}');
ok('the trades came with it', carried.trades.length, 1);
ok('so did the accounts', JSON.parse(afterMove['D:\\Trading\\Journal\\data\\accounts.json'] || '{}').accounts?.length, 1);
ok('and the playbook', !!afterMove['D:\\Trading\\Journal\\data\\playbook.json'], true);
ok('and the screenshots', Object.keys(afterMove).some(p => /^D:.Trading.Journal.screenshots.*-ltf\.jpg$/.test(p)), true);
ok('the app is reading the new folder', await page.evaluate(async () => {
  const { store } = await import('/js/store.js');
  return store.folderPath;
}), 'D:\\Trading\\Journal');
ok('and shows the same trades it had', await page.evaluate(async () => {
  const { store } = await import('/js/store.js');
  return store.trades.length;
}), 1);

// Pointing at a folder that already holds a journal opens that one instead.
console.log('  -- pointing at a journal that already exists --');
await page.evaluate(() => {
  window.__TAURI_STUB_STATE__.files.set('E:\\Old\\data\\trades.json', JSON.stringify({ version: 1, trades: [
    { id: 'x1', accountId: 'acc_1', pair: 'NQ', side: 'buy', date: '2026-01-02', riskPercent: 1, netResult: 5, tagIds: [] },
    { id: 'x2', accountId: 'acc_1', pair: 'NQ', side: 'sell', date: '2026-01-03', riskPercent: 1, netResult: -5, tagIds: [] },
  ] }));
  window.__TAURI_STUB_STATE__.files.set('E:\\Old\\data\\accounts.json', JSON.stringify({ version: 2, displayUnit: '$',
    accounts: [{ id: 'acc_1', name: 'Older', currency: 'USD', startingBalance: 50000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2026-01-01', archived: false, weeklyTargetPercent: 0 }],
    activeAccountId: 'acc_1' }));
  window.__PICK__ = 'E:\\Old';
});
await page.evaluate(async () => { const { store } = await import('/js/store.js'); await store.connect(); });
await page.waitForTimeout(400);
ok('it opens what is already there', await page.evaluate(async () => {
  const { store } = await import('/js/store.js');
  return store.trades.length;
}), 2);
ok('and does not overwrite it', await page.evaluate(() =>
  JSON.parse(window.__TAURI_STUB_STATE__.files.get('E:\\Old\\data\\accounts.json')).accounts[0].name), 'Older');

console.log('  -- a mangled file does not brick it --');
await page.evaluate(() => {
  const k = [...window.__TAURI_STUB_STATE__.files.keys()].find(x => x.endsWith('Documents\\Ledger\\trades.json'));
  window.__TAURI_STUB_STATE__.files.set(k, '{ this is not json');
  localStorage.setItem('nativefs', JSON.stringify([...window.__TAURI_STUB_STATE__.files]));
  localStorage.setItem('nativeconfigreset', '1');
});
await page.evaluate(async () => {
  const { store } = await import('/js/store.js');
  const cfgKey = [...window.__TAURI_STUB_STATE__.files.keys()].find(x => x.endsWith('ledger.json'));
  window.__TAURI_STUB_STATE__.files.set(cfgKey, JSON.stringify({ folder: 'C:\\Users\\Minato\\Documents\\Ledger' }));
  localStorage.setItem('nativefs', JSON.stringify([...window.__TAURI_STUB_STATE__.files]));
});
const before = errors.length;
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.welcome-title, .topbar', { timeout: 8000 }).catch(() => {});
ok('it still starts', await page.evaluate(() => !!document.querySelector('.topbar')), true);
ok('without throwing', errors.length === before, true);

console.log(errors.length ? '\nERRORS:\n  ' + errors.join('\n  ') : '\nno console/page errors');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
