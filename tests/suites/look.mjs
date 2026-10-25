/* ============================================================
   look.mjs — the Appearance sheet, and the shell around the pages.

   Drives the sheet the way a person would: picks every theme, an accent, a
   text tone, a font, saves a look and wears it again, undoes and redoes,
   sets the money colours, lets the clock choose between two looks, and
   checks each change landed on the page and survives a reload.
   ============================================================ */
import pw from 'playwright';
import fsx from 'node:fs';
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const APP = 'file://' + ROOT + 'Laminar.html';
fsx.mkdirSync(OUT, { recursive: true });

const { chromium } = pw;
const b = await chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.goto(APP, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });

let pass = 0, fail = 0;
const ok = (n, g, w) => { const good = String(g) === String(w); good ? pass++ : fail++; console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${n}  got=${g}${good ? '' : `  want=${w}`}`); };
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x && !c ? ' — ' + x : ''}`); };
const cssVar = v => p.evaluate(x => getComputedStyle(document.documentElement).getPropertyValue(x).trim(), v);
const attr = k => p.evaluate(x => document.documentElement.dataset[x], k);
const lum = sel => p.evaluate(s => { const n = document.querySelector(s); if (!n) return null;
  const [r, g, bl] = getComputedStyle(n).backgroundColor.match(/[\d.]+/g).map(Number); return Math.round(.2126 * r + .7152 * g + .0722 * bl); }, sel);
const click = (sel, wait = 350) => p.evaluate(s => document.querySelector(s)?.click(), sel).then(() => p.waitForTimeout(wait));
const disk = () => p.evaluate(() => JSON.parse(localStorage.getItem('ledger:file:data/accounts.json')));

/* an account and a trade, so the pages have something on them */
await p.locator('.main input[placeholder="Swing account"]').fill('Main');
await p.locator('.main input[inputmode="decimal"]').first().fill('100000');
await p.evaluate(() => [...document.querySelectorAll('.main .btn-primary')].find(x => /Create account/.test(x.textContent)).click());
await p.waitForTimeout(450);
await p.evaluate(() => { location.hash = '#/new'; }); await p.waitForTimeout(400);
await p.locator('.main input').first().fill('XAUUSD');
await p.locator('.main input[placeholder="0.00"]').fill('1500');
await p.evaluate(() => [...document.querySelectorAll('.main button')].find(x => /Save/.test(x.textContent)).click());
await p.waitForTimeout(500);

console.log('  -- the shell --');
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(400);
ok('seven sections in the top bar', await p.evaluate(() => [...document.querySelectorAll('.tb-tab > span:not(.count)')].map(a => a.textContent).join(' · ')),
   'Dashboard · Journal · Plan · Analytics · Lab · Replay · Playbook');
ok('the one you are on is marked', await p.evaluate(() => document.querySelector('.tb-tab.is-on > span:not(.count)')?.textContent), 'Dashboard');
await p.evaluate(() => { location.hash = '#/calendar'; }); await p.waitForTimeout(450);
ok('the calendar is part of the journal', await p.evaluate(() => document.querySelector('.tb-tab.is-on > span:not(.count)')?.textContent), 'Journal');
t('and the journal carries its count', await p.evaluate(() => document.querySelector('.tb-tab.is-on .count')?.textContent === '1'));
ok('and the journal shares its tabs', await p.evaluate(() => [...document.querySelectorAll('.head .sn-tab')].map(a => a.textContent).join(' · ')), 'Trades · Calendar · Review');
ok('with Calendar chosen', await p.evaluate(() => document.querySelector('.head .sn-tab.is-on')?.textContent), 'Calendar');
t('the page title is kept for anything that reads it', await p.evaluate(() => document.querySelector('.head h1.sr-only')?.textContent === 'Calendar'));
await click('.cal-span [data-span="year"]', 450);
t('the year is on the calendar now', await p.evaluate(() => /closed in \d{4}/.test(document.querySelector('.head').innerText)));
await click('.cal-span [data-span="month"]', 300);
await p.evaluate(() => { location.hash = '#/firms'; }); await p.waitForTimeout(450);
ok('the firms sit in the Lab', await p.evaluate(() => document.querySelector('.tb-tab.is-on > span:not(.count)')?.textContent), 'Lab');
t('beside its tools, without a second switch', await p.evaluate(() =>
  [...document.querySelectorAll('.head .sn-tab')].map(a => a.textContent).includes('Firms') && !document.querySelector('.lab-views')));
await p.evaluate(() => { location.hash = '#/analytics'; }); await p.waitForTimeout(400);
t('Analytics no longer has a Year tab', await p.evaluate(() => ![...document.querySelectorAll('.head .seg button')].some(b => b.textContent === 'Year')));

console.log('  -- opening the sheet --');
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(400);
await click('.st-row[data-row="Appearance"]', 600);
t('Appearance opens as a sheet', await p.evaluate(() => !!document.querySelector('.sheet.is-look')));
ok('four tabs', await p.evaluate(() => [...document.querySelectorAll('.lk-tabs .sn-tab')].map(x => x.textContent).join(' · ')), 'Themes · Colours · Custom · Money');
ok('a new journal opens on Light', await attr('look'), 'light');
ok('five themes to choose from', await p.evaluate(() => document.querySelectorAll('.lk-theme').length), 5);
const lightFrame = await lum('body');
t('Light is light', lightFrame > 200, String(lightFrame));

console.log('  -- themes --');
for (const [id, dark] of [['midnight', true], ['onyx', true], ['platinum', false], ['graphite', false], ['light', false]]) {
  await click(`.lk-theme[data-theme-id="${id}"]`, 750);
  ok(`${id}: on the page`, await attr('look'), id);
  ok(`${id}: dark rules ${dark ? 'on' : 'off'}`, await attr('theme'), dark ? 'dark' : 'light');
  const card = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--card').trim());
  const ink = await cssVar('--ink');
  const contrast = await p.evaluate(([a, b]) => {
    const L = h => { const [r, g, bl] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * bl; };
    const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  }, [card, ink]);
  t(`${id}: ink reads on its cards (${contrast.toFixed(1)}:1)`, contrast >= 7);
}
ok('the choice is written to the vault', (await disk()).look.theme, 'light');

console.log('  -- undo and redo --');
await click('.lk-theme[data-theme-id="midnight"]', 750);
await click('.lk-actions .lk-icon[aria-label="Undo"]', 750);
ok('undo goes back', await attr('look'), 'light');
await click('.lk-actions .lk-icon[aria-label="Redo"]', 750);
ok('redo comes forward', await attr('look'), 'midnight');
await click('.lk-theme[data-theme-id="light"]', 750);

console.log('  -- colours --');
await click('.lk-tabs [data-tab="colours"]', 400);
await click('.lk-dot[aria-label="Blue"]', 1300);
ok('accent follows', await cssVar('--accent'), '#2563EB');
ok('and the primary buttons wear it', await p.evaluate(() => getComputedStyle(document.querySelector('.lk-save')).backgroundColor), 'rgb(37, 99, 235)');
await p.evaluate(() => [...document.querySelectorAll('.lk-opts .lk-opt')].find(b => /Navy/.test(b.textContent))?.click()); await p.waitForTimeout(500);
ok('text tone follows', (await cssVar('--ink')).toUpperCase(), '#0F1C36');
await p.evaluate(() => [...document.querySelectorAll('.lk-fonts .lk-font')].find(b => /Geist/.test(b.textContent))?.click()); await p.waitForTimeout(500);
ok('the font changes', await attr('font'), 'geist');
t('everywhere', /Geist/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)));
await p.evaluate(() => [...document.querySelectorAll('.lk-opts .lk-opt')].find(b => /Accent/.test(b.textContent))?.click()); await p.waitForTimeout(500);
t('lines can take the accent', /37, 99, 235/.test(await cssVar('--line')), await cssVar('--line'));

console.log('  -- money --');
await click('.lk-tabs [data-tab="money"]', 400);
await p.evaluate(() => [...document.querySelectorAll('.lk-money-b')].find(b => /Win/.test(b.textContent))?.click()); await p.waitForTimeout(300);
await click('.lk-pal[aria-label="Purple"]', 600);
ok('win colour follows', await cssVar('--profit'), '#7C5CFF');
await p.evaluate(() => [...document.querySelectorAll('.lk-money-b')].find(b => /Break-even/.test(b.textContent))?.click()); await p.waitForTimeout(300);
await click('.lk-pal[aria-label="Cornflower"]', 600);
ok('break-even has a colour of its own', await cssVar('--flat'), '#3B82F6');
await p.evaluate(() => [...document.querySelectorAll('.lk-preset')].find(b => /Classic/.test(b.textContent))?.click()); await p.waitForTimeout(600);
ok('a set puts them back in one click', await cssVar('--profit'), '#18AC65');
t('including break-even, back to the theme grey', (await cssVar('--flat')) !== '#3B82F6', await cssVar('--flat'));

console.log('  -- saved looks, and day and night --');
await click('.lk-tabs [data-tab="themes"]', 400);
const saveAs = async name => {
  await click('.lk-save', 300);
  await p.locator('.lk-name input').fill(name);
  await p.locator('.lk-name input').press('Enter');
  await p.waitForTimeout(450);
};
await saveAs('Day');
await click('.lk-theme[data-theme-id="midnight"]', 750);
await saveAs('Night');
ok('two looks saved', await p.evaluate(() => document.querySelectorAll('.lk-saved-row').length), 2);
await p.evaluate(() => [...document.querySelectorAll('.lk-saved-row')].find(r => /Day/.test(r.textContent))?.querySelector('.lk-apply')?.click());
await p.waitForTimeout(800);
ok('wearing one puts it all back', await attr('look'), 'light');
ok('accent included', await cssVar('--accent'), '#2563EB');

const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const now = new Date(await p.evaluate(() => Date.now()));
const ids = await p.evaluate(() => [...document.querySelectorAll('.lk-select')][0] && [...document.querySelectorAll('.lk-select')[0].options].map(o => [o.value, o.textContent]));
const idOf = name => ids.find(([, n]) => n === name)?.[0];
await p.locator('.lk-select[aria-label="Day look"]').selectOption(idOf('Day')); await p.waitForTimeout(400);
await p.locator('.lk-select[aria-label="Night look"]').selectOption(idOf('Night')); await p.waitForTimeout(400);
/* Night began an hour ago and day is two hours off, so it is night now. */
await p.locator('.lk-time[aria-label="Night starts"]').fill(hm(new Date(now.getTime() - 3600e3))); await p.waitForTimeout(400);
await p.locator('.lk-time[aria-label="Day starts"]').fill(hm(new Date(now.getTime() + 7200e3))); await p.waitForTimeout(400);
await click('.lk-toggle', 800);
ok('the clock picks the night look', await attr('look'), 'midnight');
ok('and the schedule is kept', (await disk()).lookSchedule.on, true);
await click('.lk-toggle', 800);
ok('switched off, your own look comes back', await attr('look'), 'light');

console.log('  -- it sticks, and it resets --');
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
t('Escape closes the sheet', await p.evaluate(() => !document.querySelector('.sheet.is-look')));
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });
ok('theme survived a reload', await attr('look'), 'light');
ok('accent survived', await cssVar('--accent'), '#2563EB');
ok('font survived', await attr('font'), 'geist');
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(400);
await click('.st-row[data-row="Appearance"]', 600);
await click('.lk-reset', 900);
ok('reset: Light', await attr('look'), 'light');
ok('reset: Jakarta', await attr('font'), 'jakarta');
ok('reset: mono accent', (await cssVar('--accent')).toUpperCase(), '#0E0F11');
t('reset keeps your saved looks', (await disk()).looks.length === 2);
ok('no errors', errs.length, 0);
if (errs.length) console.log(errs.slice(0, 5).join('\n'));
await p.screenshot({ path: `${OUT}/look-sheet.png` });
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
