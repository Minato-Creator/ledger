/* Your picture and your banner, and the way to them.

   The picture in the top bar opens Settings. In Settings a picture or a
   video can be your picture (in place of your initials, everywhere they
   show) and your banner (across the top of Settings). Both are kept in the
   vault folder, go with a backup, and come out again cleanly. */
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

/* ---------- the way in ---------- */
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(400);
t('your initials in the top bar, with no ring', await p.evaluate(() => document.querySelector('.tb-you span')?.textContent) === 'MK'
  && await p.evaluate(() => getComputedStyle(document.querySelector('.tb-you')).boxShadow) === 'none');
await p.click('.tb-you'); await p.waitForTimeout(600);
t('pressing them opens Settings, not a menu', await p.evaluate(() => location.hash) === '#/settings' && await p.locator('.sheet').count() === 0);

/* ---------- a picture ---------- */
await choose('.st-avatar-b', 'share-pic.jpg');
let A = await disk();
t('a picture becomes your picture', A.avatar?.kind === 'image' && /^screenshots\/avatar-[a-z0-9]+\.jpg$/.test(A.avatar.file), JSON.stringify(A.avatar && { ...A.avatar, thumb: !!A.avatar.thumb }));
t('…kept in the vault folder', await p.evaluate(f => window.__files.get(f) instanceof Blob, A.avatar?.file));
t('…shown in the top bar in place of your initials', await p.evaluate(() => !!document.querySelector('.tb-you.has-media img.pf-media')));
t('…and on Settings', await p.evaluate(() => !!document.querySelector('.st-avatar.has-media img.pf-media')));
t('…with no ring', await p.evaluate(() => getComputedStyle(document.querySelector('.st-avatar')).boxShadow) === 'none');

/* ---------- a video banner ---------- */
await p.hover('.st-cover'); await p.waitForTimeout(250);
await choose('.st-cover-b', 'share-clip.mp4');
A = await disk();
t('a video becomes your banner', A.banner?.kind === 'video' && /^screenshots\/banner-[a-z0-9]+\.mp4$/.test(A.banner.file), JSON.stringify(A.banner && { ...A.banner, thumb: !!A.banner.thumb }));
t('…playing across the top of Settings, muted', await p.evaluate(() => { const v = document.querySelector('.st-cover.has-media video.pf-media'); return !!v && v.muted && v.loop && !v.paused; }));
t('a backup carries both', await p.evaluate(async ([x, y]) => { const m = await import('/js/store.js'); const n = m.store.shotNames(); return n.includes(x) && n.includes(y); }, [A.avatar.file, A.banner.file]));

/* ---------- a video picture, replacing the still ---------- */
const oldPic = A.avatar.file;
await choose('.st-avatar-b', 'share-clip.mp4');
A = await disk();
t('a video can be your picture too', A.avatar?.kind === 'video' && await p.evaluate(() => !!document.querySelector('.tb-you.has-media video.pf-media')));
t('…and the picture it replaced is gone from the folder', await p.evaluate(f => !window.__files.has(f), oldPic));

/* ---------- leaving and coming back (the test folder keeps no videos over a reload) ---------- */
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(500);
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(700);
t('both are still there after leaving Settings and coming back', await p.evaluate(() => !!document.querySelector('.tb-you.has-media video.pf-media') && !!document.querySelector('.st-cover.has-media video.pf-media')));
t('…read from the vault when they have not been yet', await p.evaluate(async () => { const m = await import('/js/store.js'); return !!(await m.store.profileUrl('banner')); }));

/* ---------- Profile, and taking them away ---------- */
await p.evaluate(() => { location.hash = '#/settings/profile'; }); await p.waitForTimeout(600);
t('Profile has a Picture and a Banner row', await p.locator('[data-pick="avatar"]').count() === 1 && await p.locator('[data-pick="banner"]').count() === 1);
const banFile = A.banner.file, picFile = A.avatar.file;
await p.click('[data-drop="banner"]'); await p.waitForTimeout(500);
await p.click('[data-drop="avatar"]'); await p.waitForTimeout(500);
A = await disk();
t('Remove takes them out of the journal and the folder', !A.avatar && !A.banner && await p.evaluate(([x, y]) => !window.__files.has(x) && !window.__files.has(y), [banFile, picFile]));
t('…and your initials are back', await p.evaluate(() => document.querySelector('.tb-you span')?.textContent === 'MK' && !document.querySelector('.tb-you .pf-media')));

t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
