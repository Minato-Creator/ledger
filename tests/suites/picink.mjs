/* The writing on the picture: the top bar and the top of every page, which
   sit straight on the video. Appearance → Custom → Text: Auto (reads the
   picture: white on a dark one, black on a light one), White, Black, Grey
   (the softer of the two) or Theme (the theme's own). Panels keep the
   theme's writing whatever is chosen. A soft shade runs down from the top. */
import pw from 'playwright';
import fs from 'node:fs';
import { openLook, closeLook } from './lookhelp.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const PORT = process.env.QUIRE_PORT || 8777;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const seed = extra => JSON.stringify({ version: 2, displayUnit: '$', glassNudged: true,
  accounts: [{ id: 'acc_1', name: 'A', currency: 'USD', startingBalance: 100000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2026-09-01', archived: false, weeklyTargetPercent: 0 }],
  activeAccountId: 'acc_1', ...extra });
const trades = JSON.stringify({ version: 1, trades: [{ id: 't1', accountId: 'acc_1', date: '2026-10-20', pair: 'EURUSD', side: 'buy', netResult: 500, riskPercent: 1, status: 'closed' }] });

const b = await pw.chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
async function open(accounts) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(([a, tr]) => {
    if (localStorage.getItem('fakefs')) return;
    localStorage.setItem('fakeroot', 'PI');
    localStorage.setItem('fakefs', JSON.stringify([['data/accounts.json', a], ['data/trades.json', tr]]));
  }, [accounts, trades]);
  await p.addInitScript(FAKE_FS);
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.topbar');
  await p.waitForTimeout(900);
  return { p, errs };
}
const luma = c => { const [r, g, bl] = String(c).match(/[\d.]+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255; };
const state = p => p.evaluate(() => ({
  ink: document.documentElement.dataset.picInk || null, shade: document.documentElement.dataset.shade || null,
  h1: getComputedStyle(document.querySelector('.head h1')).color,
  tab: getComputedStyle(document.querySelector('.tb-tab:not(.is-on)')).color,
  inCard: getComputedStyle(document.querySelector('.main .card h2, .main .card .eyebrow, .main .card') ).color,
}));

/* ---------- the rule itself ---------- */
{
  const { p } = await open(seed({}));
  const R = await p.evaluate(async () => { const m = await import('/js/store.js');
    return [m.picInkFor('auto', 0.9, true, 0.3), m.picInkFor('auto', 0.15, true, 0.3), m.picInkFor('auto', 0.9, false, 0.6), m.picInkFor('auto', 0.95, false, 0.1),
            m.picInkFor('grey', 0.9, true, 0.2), m.picInkFor('grey', 0.1, false, 0.4), m.picInkFor('white', 0.99, true, 0), m.picInkFor('theme', 0.5, true, 0)]; });
  t('Auto: black on a light picture, white on a dark one', R[0] === 'black' && R[1] === 'white', JSON.stringify(R));
  t('…counting Dim: a bright picture held well down takes white', R[2] === 'white' && R[3] === 'black', JSON.stringify(R));
  t('Grey: dark grey on light, light grey on dark', R[4] === 'grey-d' && R[5] === 'grey-l');
  t('White is white, Theme is the theme’s', R[6] === 'white' && R[7] === null);
  t('no background: nothing is changed', await p.evaluate(() => !document.documentElement.dataset.picInk && !document.documentElement.dataset.shade));
  await openLook(p, 'custom');
  t('…and Text is not offered without a background', await p.locator('.lk-pic-ink').count() === 0);
  await closeLook(p);
  await p.close();
}

/* ---------- a bright picture on a light look ---------- */
{
  const { p, errs } = await open(seed({ theme: 'light', background: 'torii', glass: 'clear' }));
  let S = await state(p);
  t('Auto on a bright picture writes black', S.ink === 'black' && S.shade === 'light', JSON.stringify(S));
  t('…the heading and the top bar are dark', luma(S.h1) < 0.2 && luma(S.tab) < 0.35, `${S.h1} ${S.tab}`);
  const cardInk = S.inCard;

  await openLook(p, 'custom');
  t('Text is offered with a background', await p.locator('.lk-pic-ink .seg button').count() === 5);
  t('…Auto is chosen to begin with', await p.locator('.lk-pic-ink .seg button.is-on').innerText() === 'Auto');
  await p.evaluate(() => [...document.querySelectorAll('.lk-pic-ink .seg button')].find(x => x.textContent === 'White').click());
  await p.waitForTimeout(500);
  await closeLook(p);
  S = await state(p);
  t('White: the heading and the top bar turn white', S.ink === 'white' && luma(S.h1) > 0.95 && luma(S.tab) > 0.6, JSON.stringify(S));
  t('…with a dark shade behind them', S.shade === 'dark');
  t('…and on Clear the see-through panels follow: dark, with light writing', luma(S.inCard) > 0.9 && luma(cardInk) < 0.2
    && await p.evaluate(() => 'picFlip' in document.documentElement.dataset), `${cardInk} → ${S.inCard}`);
  t('…and it is kept', await p.evaluate(() => JSON.parse(window.__files.get('data/accounts.json')).picInk) === 'white');

  await openLook(p, 'custom');
  await p.evaluate(() => [...document.querySelectorAll('.lk-pic-ink .seg button')].find(x => x.textContent === 'Grey').click());
  await p.waitForTimeout(500);
  await closeLook(p);
  S = await state(p);
  t('Grey on a bright picture: a dark grey, softer than black', S.ink === 'grey-d' && luma(S.h1) > 0.15 && luma(S.h1) < 0.4, JSON.stringify(S));

  await openLook(p, 'custom');
  await p.evaluate(() => [...document.querySelectorAll('.lk-pic-ink .seg button')].find(x => x.textContent === 'Theme').click());
  await p.waitForTimeout(500);
  await closeLook(p);
  S = await state(p);
  t('Theme: the theme’s own writing, with its shade', S.ink === null && S.shade === 'light', JSON.stringify(S));
  t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.close();
}

/* ---------- the same picture on a dark look ---------- */
{
  const { p } = await open(seed({ theme: 'dark', look: { theme: 'midnight' }, background: 'torii', glass: 'clear' }));
  const S = await state(p);
  t('on Midnight the picture is held down hard, so Auto writes white', S.ink === 'white' && S.shade === 'dark' && luma(S.h1) > 0.95, JSON.stringify(S));
  t('the little controls up there take a backing to match', await p.evaluate(() => {
    const s = document.querySelector('.head .seg, .main .seg'); return s ? getComputedStyle(s).backgroundColor : '';
  }).then(c => /rgba\(10, 10, 12/.test(c)));
  await p.close();
}

/* ---------- a dark look over a bright picture barely dimmed: Clear's panels turn ---------- */
{
  const { p } = await open(seed({ theme: 'dark', look: { theme: 'midnight' }, background: 'torii', bgDim: 0.15, glass: 'clear' }));
  const S = await state(p);
  const flip = () => p.evaluate(() => 'picFlip' in document.documentElement.dataset);
  t('black writing on the picture', S.ink === 'black', JSON.stringify(S));
  t('…and the see-through panels are drawn light, with dark writing in them', await flip() && luma(S.inCard) < 0.3
    && await p.evaluate(() => { const c = getComputedStyle(document.querySelector('.main .card')).backgroundColor; return /^rgba\(255, 255, 255/.test(c); }), S.inCard);
  await openLook(p, 'custom');
  await p.evaluate(() => [...document.querySelectorAll('.lk-pic-ink .seg button')].find(x => x.textContent === 'Theme').click());
  await p.waitForTimeout(500);
  await closeLook(p);
  t('Theme puts the panels back to the theme’s', !(await flip()) && luma((await state(p)).inCard) > 0.8);
  await openLook(p, 'custom');
  await p.evaluate(() => [...document.querySelectorAll('.lk-glass .seg button, .lk-sec .seg button')].find(x => x.textContent === 'Frosted')?.click());
  await p.waitForTimeout(500);
  await p.evaluate(() => [...document.querySelectorAll('.lk-pic-ink .seg button')].find(x => x.textContent === 'Black').click());
  await p.waitForTimeout(500);
  await closeLook(p);
  t('on Frosted the panels are their own ground: they stay the theme’s', luma((await state(p)).inCard) > 0.8 && (await state(p)).ink === 'black');
  await p.close();
}

console.log(`${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
