import pw from 'playwright';
import fs from 'node:fs';
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

const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

// ---- seed a realistic year-to-date of trades -------------------------------
const SESSIONS = [
  ['ses_pre_asia','07:30'],['ses_asia','09:15'],['ses_pre_london','13:20'],['ses_london','15:05'],
  ['ses_pre_ny','18:30'],['ses_ny','20:10'],['ses_pre_lc','21:20'],['ses_lc','22:40'],
];
const SETUPS = ['s_sweep','s_drive','s_fvg','s_ote'];
const PAIRS = [['XAUUSD','buy'],['EURUSD','sell'],['NAS100','buy'],['GBPUSD','buy'],['XAGUSD','sell']];
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const trades = [];
const start = new Date(Date.UTC(2026, 5, 1));
for (let d = 0; d < 100; d++) {
  const day = new Date(start.getTime() + d * 864e5);
  const dow = day.getUTCDay();
  if (dow === 0 || dow === 6) continue;
  if (rnd() < 0.35) continue;
  const n = 1 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const [pair, side] = PAIRS[Math.floor(rnd() * PAIRS.length)];
    const [sid, t0] = SESSIONS[Math.floor(rnd() * SESSIONS.length)];
    const roll = rnd();
    const risk = [0.5, 0.75, 1][Math.floor(rnd() * 3)];
    const oneR = 100000 * risk / 100;
    let net;
    if (roll < 0.08) net = 0;                                   // break-even
    else if (roll < 0.52) net = +oneR * (0.8 + rnd() * 2.2);    // win
    else net = -oneR * (0.6 + rnd() * 0.45);                    // loss
    const [h, m] = t0.split(':').map(Number);
    const close = String(h + (rnd() < 0.5 ? 0 : 1)).padStart(2,'0') + ':' + String((m + 25) % 60).padStart(2,'0');
    trades.push({
      id: 't_' + d + '_' + k, accountId: 'acc_1',
      date: day.toISOString().slice(0,10), timeOpen: t0, timeClose: close,
      pair, side, sessionId: sid, sessionAuto: true,
      riskPercent: risk, netResult: Math.round(net * 100) / 100,
      setupId: SETUPS[Math.floor(rnd() * SETUPS.length)],
      tagIds: rnd() < 0.5 ? ['tg_a'] : (rnd() < 0.5 ? ['tg_fomo'] : []),
      followedPlan: rnd() < 0.75, notes: rnd() < 0.6 ? 'clean read on the sweep' : '',
    });
  }
}
const PB = { version: 2,
  setups: [{id:'s_sweep',name:'London sweep',color:'#0988F0',rules:[]},{id:'s_drive',name:'Opening drive',color:'#18AC65',rules:[]},
           {id:'s_fvg',name:'FVG retrace',color:'#FFB800',rules:[]},{id:'s_ote',name:'OTE',color:'#F4624A',rules:[]}],
  tagGroups: [{id:'g_exec',name:'Execution',tags:[{id:'tg_a',name:'a-setup'},{id:'tg_fomo',name:'fomo'}]}],
  sessions: [
    {id:'ses_pre_asia',name:'Pre-Asia',start:'07:00',end:'08:00'},{id:'ses_asia',name:'Asia',start:'08:00',end:'12:00'},
    {id:'ses_pre_london',name:'Pre-London',start:'13:00',end:'14:00'},{id:'ses_london',name:'London Open',start:'14:00',end:'17:00'},
    {id:'ses_pre_ny',name:'Pre-NY',start:'18:00',end:'19:00'},{id:'ses_ny',name:'New York Open',start:'19:00',end:'22:00'},
    {id:'ses_pre_lc',name:'Pre-London Close',start:'21:00',end:'22:00'},{id:'ses_lc',name:'London Close',start:'22:00',end:'00:00'}],
  rules: { maxTradesPerDay: 3, dailyLossCapPercent: 3 } };

const errors = [];
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.addInitScript(({ trades, PB }) => {
  localStorage.setItem('fakeroot','SeedFolder');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:1,accounts:[{id:'acc_1',name:'Main funded',currency:'USD',startingBalance:100000,defaultRiskPercent:0.75,color:'#0988F0',openedAt:'2026-06-01',archived:false}],activeAccountId:'acc_1'})],
    ['data/playbook.json', JSON.stringify(PB)],
    ['data/trades.json', JSON.stringify({version:1,trades})],
  ]));
}, { trades, PB });
await page.addInitScript(FAKE_FS);
await page.goto('http://127.0.0.1:8777/index.html', { waitUntil:'domcontentloaded' });
await page.waitForSelector('.welcome-title, .topbar', { timeout: 8000 });
console.log(`seeded ${trades.length} trades`);

const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}/shot-${name}.png` }); };

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };

/* A value that was never meant to be read out loud. replaceChildren turns a
   null into the word "null", template strings turn undefined into "undefined",
   and either one is a bug the moment a person can see it. */
const strays = () => page.evaluate(() => {
  const bad = /^(null|undefined|NaN|\[object Object\]|false)$/;
  const w = document.createTreeWalker(document.querySelector('.main') || document.body, NodeFilter.SHOW_TEXT);
  const out = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const s = (n.nodeValue || '').trim();
    if (bad.test(s)) out.push((n.parentElement?.className || n.parentElement?.tagName || '?') + ' → ' + s);
  }
  return out;
});

const visit = async (hash, name) => {
  const before = errors.length;
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(500);
  const main = await page.evaluate(() => document.querySelector('.main')?.innerText.slice(0, 400) || '(empty)');
  const ok = errors.length === before && main !== '(empty)' && main.length > 20;
  t(`${name}  [${main.split('\n').filter(Boolean).slice(0,3).join(' / ')}]`, ok,
    ok ? '' : 'errors: ' + errors.slice(before).join(' | '));
  const st = await strays();
  t(`${name}: nothing on the page reads "null" or "undefined"`, st.length === 0, st.join(' | '));
  await shot(name);
};

await visit('#/', 'dashboard');
await visit('#/trades', 'trades');
await visit('#/calendar', 'calendar');
await visit('#/analytics', 'analytics-overview');
for (const t of ['weekly','timing','discipline']) {
  const before = errors.length;
  await page.evaluate(label => {
    const b = [...document.querySelectorAll('.seg button, .seg a, button')].find(x => new RegExp(label,'i').test(x.textContent));
    b && b.click();
  }, t);
  await page.waitForTimeout(450);
  console.log(`${errors.length === before ? '  ok  ' : '  FAIL'}  analytics tab: ${t}`);
  if (errors.length !== before) console.log('     ' + errors.slice(before).join(' | '));
  await shot('analytics-' + t);
}
await visit('#/new', 'new-trade');
await visit('#/outlook', 'outlook');
await visit('#/playbook', 'playbook');
await visit('#/lab', 'the-lab');
await visit('#/lab/prop', 'the-lab-prop');
await visit('#/lab/ghost', 'the-lab-ghost');
await visit('#/lab/rules', 'the-lab-rules');
await visit('#/replay', 'replay');
await visit('#/settings', 'settings');

// ---- the same screens in every unit ---------------------------------------
const setUnit = async (unit) => {
  await page.evaluate(u => {
    const b = [...document.querySelectorAll('.unit-switch button')].find(x => x.textContent.trim() === u);
    if (!b) throw new Error('no unit button for ' + u);
    b.click();
  }, unit);
  await page.waitForTimeout(400);
};
for (const unit of ['%', 'R', '$']) {
  await setUnit(unit);
  const stamped = await page.evaluate(() =>
    document.querySelector('.unit-switch button.is-on')?.textContent.trim());
  console.log(`${stamped === unit ? '  ok  ' : '  FAIL'}  unit switch sticks: ${unit}`);
  for (const [hash, name] of [['#/', 'dashboard'], ['#/trades', 'trades'], ['#/calendar', 'calendar'],
                              ['#/analytics', 'analytics'], ['#/replay', 'replay'], ['#/playbook', 'playbook']]) {
    const before = errors.length;
    await page.evaluate(h => { location.hash = h; }, hash);
    await page.waitForTimeout(400);
    const txt = await page.evaluate(() => document.querySelector('.main')?.innerText || '');
    // a page reading in % or R must not still be showing dollar amounts in its headline figures
    const kpis = await page.evaluate(() => [...document.querySelectorAll('.kpi-val')].map(n => n.innerText.trim()).join(' | '));
    const leaked = unit !== '$' && /\$[\d,]/.test(kpis);
    const ok = errors.length === before && txt.length > 20 && !leaked;
    console.log(`${ok ? '  ok  ' : '  FAIL'}  ${unit} · ${name}${kpis ? '  [' + kpis + ']' : ''}`);
    if (errors.length !== before) console.log('     ' + errors.slice(before).join(' | '));
  }
  await page.evaluate(() => { location.hash = '#/calendar'; });
  await page.waitForTimeout(400);
  await shot('unit-' + (unit === '%' ? 'pct' : unit === 'R' ? 'r' : 'dollar') + '-calendar');
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(400);
  await shot('unit-' + (unit === '%' ? 'pct' : unit === 'R' ? 'r' : 'dollar') + '-dashboard');
}

t('no console or page errors anywhere', errors.length === 0, errors.join(' | ') || 'clean');
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
