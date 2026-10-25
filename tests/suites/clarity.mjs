/* Clear glass without outlines, and how clear it is.

   Clear: no shadow behind the writing, one quiet hairline round a panel,
   sheets that are glass too, and a Clarity slider (only while Clear is on)
   that thins or thickens the tint and the blur as you drag it and is kept.
   The Custom tab's preview is one picture with the video playing in it, not
   a small still tiled. */
import pw from 'playwright';
import fs from 'node:fs';
import { openLook, closeLook, setGlass } from './lookhelp.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const PORT = process.env.QUIRE_PORT || 8777;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const acc = JSON.stringify({ version: 2, displayUnit: '$', theme: 'light', background: 'moon', glass: 'clear', glassNudged: true,
  accounts: [{ id: 'acc_1', name: 'A', currency: 'USD', startingBalance: 100000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2026-09-01', archived: false, weeklyTargetPercent: 0 }],
  activeAccountId: 'acc_1' });
const trades = JSON.stringify({ version: 1, trades: [{ id: 't1', accountId: 'acc_1', date: '2026-10-20', pair: 'EURUSD', side: 'buy', netResult: 500, riskPercent: 1, status: 'closed' },
  { id: 't2', accountId: 'acc_1', date: '2026-10-21', pair: 'XAUUSD', side: 'sell', netResult: -300, riskPercent: 1, status: 'closed' }] });

const b = await pw.chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(([a, tr]) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'CL');
  localStorage.setItem('fakefs', JSON.stringify([['data/accounts.json', a], ['data/trades.json', tr]]));
}, [acc, trades]);
await p.addInitScript(FAKE_FS);
await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar');
await p.waitForTimeout(800);
const disk = () => p.evaluate(() => JSON.parse(window.__files.get('data/accounts.json')));
const alphaOf = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return 1; const v = m[1].split(/[ ,/]+/).filter(Boolean); return v.length > 3 ? Number(v[3]) : 1; };
const card = () => p.evaluate(() => { const c = getComputedStyle(document.querySelector('.main .card'));
  return { bg: c.backgroundColor, border: c.borderTopWidth, shadow: c.boxShadow, blur: c.backdropFilter }; });

/* ---------- no outlines ---------- */
t('Clear is on', await p.evaluate(() => document.documentElement.dataset.glassKind) === 'clear');
t('no shadow behind the writing', await p.evaluate(() => getComputedStyle(document.querySelector('.main')).textShadow) === 'none'
  && await p.evaluate(() => getComputedStyle(document.querySelector('.main .card h2, .main .card .kpi-val, .main .card') ).textShadow) === 'none');
let C = await card();
t('a panel has one half-pixel edge and no lit lip or drop shadow', /0px 0px 0px 0\.5px inset/.test(C.shadow) && C.shadow.split('inset').length === 2
  && alphaOf(await p.evaluate(() => getComputedStyle(document.querySelector('.main .card')).borderTopColor)) === 0, JSON.stringify(C));
t('…and that edge is quiet', alphaOf(C.shadow.match(/rgba?\([^)]+\)/)?.[0]) <= 0.3, C.shadow);
t('your picture in the top bar has no ring', await p.evaluate(() => getComputedStyle(document.querySelector('.tb-you')).boxShadow) === 'none');

/* ---------- Clarity ---------- */
await openLook(p, 'custom');
t('Clarity shows while Clear is on', await p.locator('.lk-clarity').count() === 1);
const a0 = alphaOf((await card()).bg);
await p.evaluate(() => { const r = document.querySelector('.lk-clarity'); r.value = '1'; r.dispatchEvent(new Event('input', { bubbles: true })); });
await p.waitForTimeout(700);     // the panels ease into it
const a1 = alphaOf((await card()).bg);
t('dragging it clearer thins the panels at once', a1 < a0 - 0.1, `${a0} → ${a1}`);
await p.evaluate(() => { const r = document.querySelector('.lk-clarity'); r.value = '0'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
await p.waitForTimeout(800);
const a2 = alphaOf((await card()).bg);
t('…and less clear thickens them', a2 > a0 + 0.1, `${a0} → ${a2}`);
t('it is kept', (await disk()).clarity === 0);
t('it says how clear', /0%/.test(await p.locator('.lk-clarity + .lk-val').innerText()));

/* ---------- the preview ---------- */
const prev = await p.evaluate(() => { const m = document.querySelector('.lk-bgprev .lk-mini-app'); const cs = getComputedStyle(m);
  return { size: cs.backgroundSize, video: !!m.querySelector('video.lk-ma-v'), fit: m.querySelector('video.lk-ma-v') ? getComputedStyle(m.querySelector('video.lk-ma-v')).objectFit : '' }; });
t('the preview is one picture filling the frame, not a small one tiled', prev.size === 'cover', JSON.stringify(prev));
t('…with the video itself in it', prev.video && prev.fit === 'cover', JSON.stringify(prev));

/* ---------- the sheet is glass too ---------- */
const sheetA = alphaOf(await p.evaluate(() => getComputedStyle(document.querySelector('.sheet.is-look')).backgroundColor));
t('with Clear the sheets are see-through', sheetA < 1, String(sheetA));
await closeLook(p);
await setGlass(p, true);
await openLook(p, 'custom');
t('Clarity is not offered for Frosted', await p.locator('.lk-clarity').count() === 0);
t('…and Frosted sheets are solid', alphaOf(await p.evaluate(() => getComputedStyle(document.querySelector('.sheet.is-look')).backgroundColor)) === 1);
await closeLook(p);
await setGlass(p, 'clear');
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('.topbar'); await p.waitForTimeout(600);
t('Clarity comes back after a reload', await p.evaluate(() => document.documentElement.style.getPropertyValue('--clear-k')) === '0');

t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
