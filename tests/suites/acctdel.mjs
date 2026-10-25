/* Settings, and the accounts page: an account can be archived — put away,
   everything kept — or deleted, for good, with its trades and their charts.
   The two are different buttons that say different words. */
import pw from 'playwright';
import fs from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const A = (id, name, extra = {}) => ({ id, name, currency: 'USD', startingBalance: 100000, defaultRiskPercent: 1,
  color: '#0988F0', openedAt: '2026-08-01', archived: false, weeklyTargetPercent: 0, ...extra });
const T = (id, acc, extra = {}) => ({ id, accountId: acc, pair: 'XAUUSD', side: 'buy', date: '2026-09-15', timeOpen: '15:00',
  timeClose: '16:00', riskPercent: 1, netResult: 500, status: 'closed', mode: 'live', tagIds: [], shots: [], ...extra });
const ACCOUNTS = [A('acc_a', 'Funded 100k'), A('acc_b', 'Challenge 50k'), A('acc_c', 'Old one', { archived: true })];
const TRADES = [
  T('a1', 'acc_a', { shots: ['screenshots/a1-1.jpg', 'screenshots/a1-2.jpg'] }),
  T('a2', 'acc_a', { status: 'open', netResult: null }),
  T('a3', 'acc_a', { mode: 'forward', netResult: null, rMultiple: 2 }),
  T('b1', 'acc_b'), T('b2', 'acc_b', { netResult: -300, shots: ['screenshots/b2-1.jpg'] }),
  T('c1', 'acc_c'),
];

const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({ ACCOUNTS, TRADES }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: ACCOUNTS, activeAccountId: 'acc_a' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TRADES })],
    ['screenshots/a1-1.jpg', 'x'], ['screenshots/a1-2.jpg', 'x'], ['screenshots/b2-1.jpg', 'x']]));
}, { ACCOUNTS, TRADES });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });

const settle = (ms = 350) => p.waitForTimeout(ms);
const disk = () => p.evaluate(() => ({
  accounts: JSON.parse(window.__files.get('data/accounts.json')),
  trades: JSON.parse(window.__files.get('data/trades.json')).trades,
  files: [...window.__files.keys()],
}));
/* The two buttons in the row a name is in. In Settings the name is in an
   input, so its value is read as well as the text. The nearest ancestor that
   holds the name, without holding a second pair of buttons, is the row. */
const FIND = `(n) => {
  const says = el => (el.innerText + ' ' + [...el.querySelectorAll('input')].map(i => i.value).join(' ')).includes(n);
  for (const box of document.querySelectorAll('.acct-actions')) {
    for (let a = box.parentElement; a; a = a.parentElement) {
      if (a.querySelectorAll('.acct-actions').length > 1) break;      // left the row
      if (says(a)) return box;
    }
  }
  return null;
}`;
const buttons = name => p.evaluate(({ n, F }) => {
  const box = eval(F)(n);
  return box ? [...box.querySelectorAll('button')].map(b => b.textContent.trim()) : null;
}, { n: name, F: FIND });
const click = (name, label) => p.evaluate(({ n, l, F }) => {
  const box = eval(F)(n);
  [...box.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(l)).click();
}, { n: name, l: label, F: FIND });

await p.evaluate(() => { location.hash = '#/settings/accounts'; }); await settle(600);

/* ---------- the two buttons ---------- */
t('an account in Settings offers Archive and Delete', JSON.stringify(await buttons('Funded 100k')) === '["Archive","Delete"]', JSON.stringify(await buttons('Funded 100k')));
t('an archived one offers Restore and Delete', JSON.stringify(await buttons('Old one')) === '["Restore","Delete"]', JSON.stringify(await buttons('Old one')));
t('the bin icon that only ever archived is gone', await p.evaluate(() =>
  ![...document.querySelectorAll('.main button')].some(b => /Archive — it stays/.test(b.title))));

/* ---------- archive keeps everything ---------- */
await click('Challenge 50k', 'Archive'); await settle();
let d = await disk();
t('Archive puts it away', d.accounts.accounts.find(a => a.id === 'acc_b').archived === true);
t('and keeps every one of its trades', d.trades.filter(x => x.accountId === 'acc_b').length === 2);
t('it now offers Restore', JSON.stringify(await buttons('Challenge 50k')) === '["Restore","Delete"]');
await click('Challenge 50k', 'Restore'); await settle();
t('Restore brings it back', (await disk()).accounts.accounts.find(a => a.id === 'acc_b').archived === false);

/* ---------- delete asks, and says what it will take ---------- */
await click('Challenge 50k', 'Delete'); await settle(200);
t('Delete asks first, and counts the trades that go with it', (await buttons('Challenge 50k'))?.[1] === 'Delete + 2 trades', JSON.stringify(await buttons('Challenge 50k')));
t('nothing is gone yet', (await disk()).accounts.accounts.length === 3);
await p.mouse.click(700, 60); await settle(200);
t('clicking anywhere else lets it go', (await buttons('Challenge 50k'))?.[1] === 'Delete');
await click('Challenge 50k', 'Delete'); await settle(150);
await click('Challenge 50k', 'Delete +'); await settle(500);
d = await disk();
t('a second click deletes the account', !d.accounts.accounts.some(a => a.id === 'acc_b'), d.accounts.accounts.map(a => a.id).join(','));
t('and every trade in it', !d.trades.some(x => x.accountId === 'acc_b'), d.trades.map(x => x.id).join(','));
t('and the charts those trades carried', !d.files.includes('screenshots/b2-1.jpg'));
t('while every other account keeps its trades and charts', d.trades.filter(x => x.accountId === 'acc_a').length === 3
  && d.files.includes('screenshots/a1-1.jpg') && d.trades.some(x => x.id === 'c1'));
t('it is gone from the page', await buttons('Challenge 50k') === null);
t('and the toast says what went', /Deleted Challenge 50k and 2 trades/.test(await p.evaluate(() => document.getElementById('toast')?.textContent || '')),
  await p.evaluate(() => document.getElementById('toast')?.textContent));

/* ---------- the accounts page has the same two ---------- */
await p.evaluate(() => { location.hash = '#/accounts'; }); await settle(500);
t('the accounts page offers the same two', JSON.stringify(await buttons('Funded 100k')) === '["Archive","Delete"]', JSON.stringify(await buttons('Funded 100k')));
const activeBefore = (await disk()).accounts.activeAccountId;
await click('Old one', 'Restore'); await settle();
t('pressing one does not also switch to that account', (await disk()).accounts.activeAccountId === activeBefore);
t('(and it did restore it)', (await disk()).accounts.accounts.find(a => a.id === 'acc_c').archived === false);

/* ---------- deleting the account you are on ---------- */
await click('Funded 100k', 'Delete'); await settle(150);
t('the count includes open trades and forward tests', (await buttons('Funded 100k'))?.[1] === 'Delete + 3 trades', JSON.stringify(await buttons('Funded 100k')));
await click('Funded 100k', 'Delete +'); await settle(500);
d = await disk();
t('the active account can be deleted too', !d.accounts.accounts.some(a => a.id === 'acc_a'));
t('with its open trade, its forward test, and both charts', !d.trades.some(x => x.accountId === 'acc_a')
  && !d.files.includes('screenshots/a1-1.jpg') && !d.files.includes('screenshots/a1-2.jpg'));
t('and the app moves to the account that is left', d.accounts.activeAccountId === 'acc_c', d.accounts.activeAccountId);
t('which the top bar now shows', /Old one/.test(await p.evaluate(() => document.querySelector('.tb-acct')?.innerText || '')));

/* ---------- the last one ---------- */
await click('Old one', 'Delete'); await settle(150);
await click('Old one', 'Delete +'); await settle(600);
d = await disk();
t('the last account can go as well', d.accounts.accounts.length === 0 && d.trades.length === 0);
t('and the app asks for a new first account rather than breaking', await p.evaluate(() =>
  /Set up your first account|New account|Your accounts/i.test(document.querySelector('.main')?.innerText || document.body.innerText)));

await p.screenshot({ path: OUT + '/acctdel.png' });
t('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
