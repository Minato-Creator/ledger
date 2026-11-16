/* Your profile card at the top of Settings → Profile: banner, picture, name, @name, a line about you,
   and two counts that each open the one account there is, Laminar's own. */
import pw from 'playwright';
import fs from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const FIX = HERE + '../fixtures/';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const PORT = process.env.QUIRE_PORT || 8777;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const acc = JSON.stringify({ version: 2, displayUnit: '$', theme: 'light', userName: 'Minato Kaze',
  accounts: [{ id: 'acc_1', name: 'A', currency: 'USD', startingBalance: 100000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2026-09-01', archived: false, weeklyTargetPercent: 0 }],
  activeAccountId: 'acc_1' });

const b = await pw.chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(a => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'PF');
  localStorage.setItem('fakefs', JSON.stringify([['data/accounts.json', a], ['data/trades.json', JSON.stringify({ version: 1, trades: [] })]]));
}, acc);
await p.addInitScript(FAKE_FS);
await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar');
await p.waitForTimeout(600);
const disk = () => p.evaluate(() => JSON.parse(window.__files.get('data/accounts.json')));
const choose = async (sel, file) => {
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(sel)]);
  await fc.setFiles(FIX + file);
  await p.waitForTimeout(2200);
};


const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const go = async h => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(600); };
await go('#/settings/profile');
const card = () => p.evaluate(() => { const q = s => document.querySelector('.pf-card ' + s)?.textContent.trim() ?? null;
  return { name: q('.pf-name'), handle: q('.pf-handle'), bio: q('.pf-bio'), counts: [...document.querySelectorAll('.pf-card .pf-count')].map(x => x.textContent.trim()),
    first: document.querySelector('.st-col')?.firstElementChild?.classList.contains('pf-card') }; });
let c = await card();
t('your profile card is at the top of the Profile page', c.first === true);
t('it carries your name and an @name made from it', c.name === 'Minato Kaze' && c.handle === '@minatokaze', JSON.stringify(c));
t('and reads 1 Following and 1 Followers', JSON.stringify(c.counts) === JSON.stringify(['1 Following', '1 Followers']), JSON.stringify(c.counts));
t('a banner and a picture, each with its own button', await p.evaluate(() => !!document.querySelector('.pf-card .pf-banner [data-pick="banner"]') && !!document.querySelector('.pf-card .pf-pic-w [data-pick="avatar"]')));
const lay = await p.evaluate(() => { const b = document.querySelector('.pf-card .pf-banner').getBoundingClientRect(), a = document.querySelector('.pf-card .pf-pic').getBoundingClientRect(); return a.top < b.bottom && a.bottom > b.bottom && Math.abs(a.width - a.height) < 1; });
t('the picture is round and sits across the banner’s lower edge', lay);

await p.fill('[data-field="handle"]', '@Minato.FX!!'); await p.press('[data-field="handle"]', 'Tab'); await p.waitForTimeout(500);
await p.fill('[data-field="bio"]', 'Gold and NAS100.   London open only.'); await p.press('[data-field="bio"]', 'Tab'); await p.waitForTimeout(500);
c = await card();
t('an @name you type is tidied and shown', c.handle === '@minato.fx', c.handle);
t('and so is the description', c.bio === 'Gold and NAS100. London open only.', c.bio);
const d = await disk();
t('both are kept with your journal', d.userHandle === 'minato.fx' && d.userBio === 'Gold and NAS100. London open only.', JSON.stringify([d.userHandle, d.userBio]));

for (const which of ['followers', 'following']) {
  await p.click(`.pf-count[data-count="${which}"]`); await p.waitForTimeout(450);
  const list = await p.evaluate(() => ({ title: document.querySelector('.sheet.is-follow h2')?.textContent, rows: [...document.querySelectorAll('.sheet.is-follow .pf-acct')].map(x => x.querySelector('.pf-acct-n').textContent.trim() + ' ' + x.querySelector('.pf-acct-h').textContent),
    tick: !!document.querySelector('.sheet.is-follow .pf-acct .pf-tick'), pill: document.querySelector('.sheet.is-follow .pf-following')?.textContent }));
  t(`${which}: one account, Laminar, with its tick, marked Following`, list.title.toLowerCase() === which && list.rows.length === 1 && list.rows[0] === 'Laminar @laminar' && list.tick && list.pill === 'Following', JSON.stringify(list));
  if (which === 'followers') { await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
}
await p.click('.sheet.is-follow .pf-acct'); await p.waitForTimeout(700);
const lam = await p.evaluate(() => { const s = document.querySelector('.sheet.is-profile'); if (!s) return null; const img = s.querySelector('.pf-banner img');
  return { name: s.querySelector('.pf-name').textContent.trim(), handle: s.querySelector('.pf-handle').textContent, bio: s.querySelector('.pf-bio').textContent, tick: !!s.querySelector('.pf-name .pf-tick'),
    tickBg: getComputedStyle(s.querySelector('.pf-tick')).backgroundColor, pill: s.querySelector('.pf-following').textContent, pillTag: s.querySelector('.pf-following').tagName, banner: !!img && img.naturalWidth > 0, listGone: !document.querySelector('.sheet.is-follow:not(.is-out)') }; });
t('pressing it opens Laminar’s profile', !!lam && lam.name === 'Laminar' && lam.handle === '@laminar' && lam.bio.length > 10 && lam.banner && lam.listGone, JSON.stringify(lam));
t('with a blue tick', !!lam && lam.tick && lam.tickBg === 'rgb(29, 155, 240)', lam && lam.tickBg);
t('and Following, which is not a button: it cannot be undone', !!lam && lam.pill === 'Following' && lam.pillTag === 'SPAN');
await p.click('.sheet.is-profile .pf-following'); await p.waitForTimeout(300);
t('pressing it changes nothing', await p.evaluate(() => document.querySelector('.sheet.is-profile .pf-following')?.textContent) === 'Following');
await p.screenshot({ path: OUT + '/profile-laminar.png' });
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
t('Escape closes it', await p.evaluate(() => !document.querySelector('.sheet')));
await p.screenshot({ path: OUT + '/profile-card.png' });
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('.topbar'); await go('#/settings/profile');
c = await card();
t('opened again, the card is as it was left', c.handle === '@minato.fx' && /Gold and NAS100/.test(c.bio));
t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
