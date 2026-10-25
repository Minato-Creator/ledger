/* Settings → Appearance: profit and loss colours, each from a dropdown over
   one shared palette. Any colour can be either — a red profit is allowed —
   and the greys come in many shades. */
import pw from 'playwright';
import fs from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(() => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark',
    colours: { profit: '#18AC65', loss: '#123456' },
    accounts: [{ id: 'acc_1', name: 'Funded', currency: 'USD', startingBalance: 100000, defaultRiskPercent: 1, color: '#0988F0',
      openedAt: '2026-09-01', archived: false, weeklyTargetPercent: 0 }], activeAccountId: 'acc_1' })]]));
});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(500);

/* The money colours live on the Appearance sheet's Money tab now: one row
   each for a win, a loss and a break-even, and one palette that opens under
   whichever row you press. */
const LABEL = { profit: 'Win', loss: 'Loss', flat: 'Break-even' };
const sheetUp = async () => {
  if (await p.evaluate(() => !!document.querySelector('.sheet.is-look'))) return;
  await p.evaluate(() => document.querySelector('.st-row[data-row="Appearance"]').click()); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('.lk-tabs [data-tab="money"]').click()); await p.waitForTimeout(300);
};
const row = w => `[data-money="${w}"]`;
const tag = () => p.evaluate(L => { for (const r of document.querySelectorAll('.lk-money-row'))
  r.setAttribute('data-money', Object.keys(L).find(k => L[k] === r.querySelector('.lk-money-t b')?.textContent) || ''); }, LABEL);
const open = async w => { await tag(); await p.evaluate(s => document.querySelector(s + ' .lk-money-b').click(), row(w)); await p.waitForTimeout(250); await tag(); };
const isOpen = async w => { await tag(); return p.evaluate(s => !!document.querySelector(s + '.is-open .lk-palette'), row(w)); };
const label = async w => { await tag(); return p.evaluate(s => document.querySelector(s + ' .lk-money-hex').textContent, row(w)); };
const pick = async (w, name) => { if (!(await isOpen(w))) await open(w); await p.evaluate(n => document.querySelector(`.lk-palette .lk-pal[aria-label="${n}"]`).click(), name); await p.waitForTimeout(450); };
const cssVar = n => p.evaluate(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), n);
const disk = () => p.evaluate(() => JSON.parse(window.__files.get('data/accounts.json')).colours);
await sheetUp();

/* ---------- one palette, offered to every row ---------- */
await open('profit');
const names = () => p.evaluate(() => [...document.querySelectorAll('.lk-palette .lk-pal')].map(n => n.getAttribute('aria-label')));
const pn = await names();
await open('loss');
const ln = await names();
t('profit and loss offer exactly the same colours', JSON.stringify(pn) === JSON.stringify(ln), `${pn.length} vs ${ln.length}`);
t('and plenty of them', pn.length >= 60, String(pn.length));
t('no name is used twice', new Set(pn).size === pn.length);
const greys = await p.evaluate(() => { const f = [...document.querySelectorAll('.lk-palette .lk-pal-fam')].pop();
  return f.querySelector('.lk-pal-k').textContent + ':' + f.querySelectorAll('.lk-pal').length; });
t('with a whole family of greys', /^Greys:(\d+)$/.test(greys) && Number(greys.split(':')[1]) >= 10, greys);
t('greens and reds sit in both lists', ['Green', 'Red', 'Coral', 'Emerald'].every(n => pn.includes(n) && ln.includes(n)));

/* ---------- the rows ---------- */
await open('loss');
t('a second press shuts it again', !(await isOpen('loss')));
t('the row names the colour you have', (await label('profit')) === 'Green', await label('profit'));
t('a colour saved before this palette is shown by its code', (await label('loss')) === '#123456', await label('loss'));
await open('profit');
t('a press opens it', await isOpen('profit'));
t('the one in use is marked', await p.evaluate(() => document.querySelector('.lk-palette .lk-pal.is-on')?.getAttribute('aria-label')) === 'Green');
await open('loss');
t('opening one shuts the other', await isOpen('loss') && !(await isOpen('profit')));

/* ---------- any colour can be anything ---------- */
await pick('profit', 'Red');
t('red can mean profit', (await cssVar('--profit')).toUpperCase() === '#E5342B' && (await label('profit')) === 'Red');
await pick('loss', 'Green');
t('and green can mean loss', (await cssVar('--loss')).toUpperCase() === '#18AC65' && (await label('loss')) === 'Green');
t('picking shuts the palette', !(await isOpen('loss')));
t('the channels follow, for every tint', (await cssVar('--loss-rgb')).replace(/\s/g, '') === '24,172,101', await cssVar('--loss-rgb'));
await pick('profit', 'Slate');
t('a grey can be chosen too', (await cssVar('--profit')).toUpperCase() === '#64748B');
t('both are written to disk', JSON.stringify(await disk()) === JSON.stringify({ profit: '#64748B', loss: '#18AC65' }), JSON.stringify(await disk()));
t('break-even starts on the theme grey', (await label('flat')) === 'Theme grey', await label('flat'));
await pick('flat', 'Cornflower');
t('and can have a colour of its own', (await cssVar('--flat')).toUpperCase() === '#3B82F6');
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
t('Escape puts the sheet away', await p.evaluate(() => !document.querySelector('.sheet.is-look')));
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('.topbar'); await p.waitForTimeout(400);
t('and they survive a restart', (await cssVar('--profit')).toUpperCase() === '#64748B' && (await cssVar('--loss')).toUpperCase() === '#18AC65');
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(400);
await sheetUp();
t('the rows say so', (await label('profit')) === 'Slate' && (await label('loss')) === 'Green');

await open('loss'); await p.waitForTimeout(200);
await p.screenshot({ path: OUT + '/pnlcolours.png' });
t('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
