/* Settings → Accounts: every account as a card, on three shelves.

   Evaluations, funded and live accounts; the firm's logo (his own image,
   squared and centred), its size, its P&L, what has been paid out, what is
   left after, its balance and peak. Log payout takes money out (Withdraw on
   a live account); Update balance matches the firm's figure; Passed turns an
   evaluation into the funded account it earned; several cards can be ticked
   and paid out at once. */
import pw from 'playwright';
import fs from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const PORT = process.env.QUIRE_PORT || 8777;
const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const A = (id, name, extra = {}) => ({ id, name, currency: 'USD', startingBalance: 50000, defaultRiskPercent: 1, color: '#0988F0',
  openedAt: '2026-08-01', archived: false, weeklyTargetPercent: 0, ...extra });
const ACCOUNTS = [
  A('f1', 'Apex 50K', { kind: 'funded', firm: 'apex' }),
  A('f2', 'Apex 50K #2', { kind: 'funded', firm: 'apex' }),
  A('e1', 'Topstep 50K Combine', { firm: 'topstep' }),               // no kind: read from its name
  A('l1', 'OANDA', { kind: 'live', firm: 'oanda', startingBalance: 10000 }),
  A('x1', 'FTMO Challenge', { kind: 'eval', firm: 'ftmo', archived: true, status: 'blown' }),
];
const T = (id, acc, date, net, extra = {}) => ({ id, accountId: acc, pair: 'XAUUSD', side: 'buy', date, timeOpen: '10:00', timeClose: '11:00',
  riskPercent: 1, netResult: net, status: 'closed', mode: 'live', tagIds: [], shots: [], ...extra });
const TRADES = [T('t1', 'f1', '2026-09-02', 2000), T('t2', 'f1', '2026-09-05', -500), T('t3', 'f1', '2026-09-09', 3547),
  T('t4', 'f1', '2026-09-10', 900, { mode: 'forward' }), T('t5', 'e1', '2026-10-02', 1250), T('t6', 'l1', '2026-10-03', 300)];

const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(({ ACCOUNTS, TRADES }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'AB');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: ACCOUNTS, activeAccountId: 'f1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TRADES })]]));
}, { ACCOUNTS, TRADES });
await p.addInitScript(FAKE_FS);
await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar');
const settle = (ms = 400) => p.waitForTimeout(ms);
const disk = () => p.evaluate(() => JSON.parse(window.__files.get('data/accounts.json')));
const acct = async id => (await disk()).accounts.find(a => a.id === id);
const go = async () => { await p.evaluate(() => { location.hash = '#/settings/accounts'; }); await settle(600); };
const cardText = id => p.evaluate(x => document.querySelector(`.ab-card[data-account="${x}"]`)?.innerText.replace(/\s+/g, ' ') || '', id);
const inSheet = async (fill, button = '.ab-go') => {
  await p.evaluate(([f, btn]) => {
    for (const [sel, v] of Object.entries(f)) { const i = document.querySelector('.sheet:not(.is-out) ' + sel); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }
    document.querySelector('.sheet:not(.is-out) ' + btn).click();
  }, [fill, button]);
  await settle(700);
};

/* ---------- the money, worked out ---------- */
const M = await p.evaluate(async () => { const c = await import('/js/calc.js');
  return c.accountMoney({ startingBalance: 50000, payouts: [{ amount: 300, date: '2026-09-03', at: '12:00:00' }], adjustments: [{ amount: -50, date: '2026-09-04' }] },
    [{ date: '2026-09-02', timeClose: '10:00', netResult: 1000 }, { date: '2026-09-05', timeClose: '10:00', netResult: 500 }]); });
t('the money: P&L, paid out, what is left, balance and peak', M.gross === 1450 && M.paid === 300 && M.after === 1150 && M.balance === 51150 && M.peak === 51150
  && JSON.stringify(M.series) === '[50000,51000,50700,50650,51150]', JSON.stringify(M));
const K = await p.evaluate(async () => { const f = await import('/js/acctfirms.js');
  return [f.kindOf({ name: 'Topstep 50K Combine' }), f.kindOf({ name: 'Apex PA 50K' }), f.kindOf({ name: 'OANDA' }), f.kindOf({ name: 'x', kind: 'eval' }),
          f.suggestName({ name: 'Apex' }, 50000, ['Apex 50K', 'Apex 50K #2']), f.sizeShort(150000)]; });
t('an account from before is read from its name; names number themselves', JSON.stringify(K) === '["eval","funded","live","eval","Apex 50K #3","150K"]', JSON.stringify(K));
const G = await p.evaluate(async () => { const f = await import('/js/acctfirms.js');
  return ['Apex 50K', 'Topstep 50K Combine', 'Funding Pips 10k', 'My Funded Futures', 'OANDA', 'Alpha Futures 50K', 'Swing account', 'Apexx'].map(f.guessFirm); });
t('…and the firm it is at, from its name', JSON.stringify(G) === '["apex","topstep","fundingpips","mffu","oanda",null,null,null]', JSON.stringify(G));
t('the top bar wears the firm’s logo, not a colour', await p.evaluate(() =>
  /media\/firms\/apex\.png$/.test(document.querySelector('.tb-acct .acct-logo img')?.getAttribute('src') || '') && !document.querySelector('.tb-acct .acct-dot')));
await p.click('.tb-acct'); await settle(400);
const menu = await p.evaluate(() => [...document.querySelectorAll('.pop-accounts .pop-item')].slice(0, 4).map(x => x.querySelector('.acct-logo img')?.getAttribute('src')?.match(/firms\/(\w+)\.png/)?.[1] || (x.querySelector('.acct-dot') ? 'dot' : '?')));
t('…and so does every account in its menu', JSON.stringify(menu) === '["apex","apex","topstep","oanda"]', JSON.stringify(menu));
await p.keyboard.press('Escape'); await settle(300);

/* ---------- the shelves ---------- */
await go();
t('the prop firms come with his logos', await p.evaluate(() => ['f1', 'e1'].every(x => /media\/firms\/(apex|topstep)\.png$/.test(document.querySelector(`.ab-card[data-account="${x}"] .ab-logo.has-img img`)?.getAttribute('src') || ''))));
t('…and the brokers with theirs', /media\/firms\/oanda\.png$/.test(await p.evaluate(() => document.querySelector('.ab-card[data-account="l1"] .ab-logo.has-img img')?.getAttribute('src') || '')));
t('a firm with none shows its initials', await p.evaluate(async () => { const { logoTile } = await import('/js/views/acctlogo.js'); const { store } = await import('/js/store.js');
  return logoTile(store, { firm: 'other', firmName: 'Bulenox' }, 40).textContent === 'B'; }));
const shelves = await p.evaluate(() => [...document.querySelectorAll('.ab-shelf')].map(s => [s.dataset.shelf, s.querySelectorAll('.ab-card').length]));
t('evals, funded, live — and the put-away ones folded', JSON.stringify(shelves) === '[["eval",1],["funded",2],["live",1],["archived",0]]', JSON.stringify(shelves));
let txt = await cardText('f1');
t('a funded card: firm, badge, size, its name, the account, the P&L', /Apex/.test(txt) && /FUNDED/.test(txt) && /\$50,000 account/.test(txt) && /Apex 50K/.test(txt) && /\+\$5,047/.test(txt), txt);
t('…a forward test is not money', !/\+\$5,947/.test(txt));
t('…with its balance and its peak, and a line of it', /Balance \$55,047 · Peak \$55,047/.test(txt) && await p.evaluate(() => !!document.querySelector('.ab-card[data-account="f1"] svg.ab-spark path')), txt);
t('the one you are on says so', await p.evaluate(() => document.querySelector('.ab-card[data-account="f1"]').classList.contains('is-active')));
t('an eval has Passed where a payout would be', /EVAL/.test(await cardText('e1')) && /Passed/.test(await cardText('e1')) && !/Log payout/.test(await cardText('e1')));
t('a live account withdraws', /LIVE/.test(await cardText('l1')) && /Withdraw/.test(await cardText('l1')) && /Withdrawn/i.test(await cardText('l1')));

/* ---------- Log payout ---------- */
await p.click('.ab-card[data-account="f1"] .ab-pay'); await settle();
t('Log payout asks how much, and shows the balance it leaves', await p.evaluate(() => /Balance now \$55,047/.test(document.querySelector('.sheet .ab-echo').textContent)));
await inSheet({ '.ab-amount': '3 000' });
let a = await acct('f1');
t('the payout is kept on the account', a.payouts?.length === 1 && a.payouts[0].amount === 3000, JSON.stringify(a.payouts));
await settle(900);                                      // the figures count down to it
txt = await cardText('f1');
t('the card: paid out $3,000, $2,047 after payouts, the balance down by it', /PAYOUTS \$3,000/.test(txt) && /\+\$2,047/.test(txt) && /Balance \$52,047 · Peak \$55,047/.test(txt), txt);
const tb = await p.evaluate(() => document.querySelector('.tb-acct').textContent.replace(/\s+/g, ' '));
t('the top bar balance drops by it too', /\$52,047/.test(tb), tb);

/* ---------- Update balance ---------- */
await p.click('.ab-card[data-account="l1"] .ab-upd'); await settle();
await inSheet({ '.ab-amount': '10 250' });
a = await acct('l1');
t('Update balance keeps a dated correction', a.adjustments?.length === 1 && a.adjustments[0].amount === -50, JSON.stringify(a.adjustments));
t('…and the balance reads what was typed', /Balance \$10,250/.test(await cardText('l1')), await cardText('l1'));

/* ---------- several at once ---------- */
await p.click('.ab-shelf[data-shelf="funded"] .ab-select'); await settle(300);
await p.click('.ab-card[data-account="f1"] .ab-stats'); await p.click('.ab-card[data-account="f2"] .ab-stats'); await settle(300);
t('ticking cards for a payout', await p.evaluate(() => document.querySelectorAll('.ab-card.is-sel').length) === 2
  && /2 selected/.test(await p.evaluate(() => document.querySelector('.ab-selbar').innerText)));
await p.evaluate(() => [...document.querySelectorAll('.ab-selbar button')].find(x => /Log payout/.test(x.textContent)).click()); await settle();
await inSheet({ '.ab-amount': '500' });
t('one payout logged on each', (await acct('f1')).payouts.length === 2 && (await acct('f2')).payouts?.length === 1 && (await acct('f2')).payouts[0].amount === 500);
t('…and the active account did not change', (await disk()).activeAccountId === 'f1');

/* ---------- the edit sheet: history, logo ---------- */
await p.click('.ab-card[data-account="f1"] .ab-edit'); await settle(500);
t('editing shows what was paid out, newest first', await p.evaluate(() => document.querySelectorAll('.sheet .ab-hrow').length) === 2);
await p.evaluate(() => document.querySelector('.sheet .ab-hrow .ab-hx').click()); await settle(500);
t('a payout taken back is gone', (await acct('f1')).payouts.length === 1);
const png = await p.evaluate(async () => {
  const cv = document.createElement('canvas'); cv.width = 600; cv.height = 200; const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 600, 200); g.fillStyle = '#1f3bd6'; g.fillRect(220, 60, 160, 80);
  return cv.toDataURL('image/png').split(',')[1];
});
fs.writeFileSync(OUT + '/ab-logo.png', Buffer.from(png, 'base64'));
const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.sheet [data-logo="apex"]')]);
await fc.setFiles(OUT + '/ab-logo.png'); await settle(1200);
const logos = (await disk()).firmLogos || {};
t('a logo of his own is kept for the firm', /^screenshots\/logo-apex-[a-z0-9]+\.png$/.test(logos.apex || ''), JSON.stringify(logos));
const sq = await p.evaluate(async f => { const m = await import('/js/store.js'); const u = await m.store.firmLogoUrl('apex');
  const im = new Image(); im.src = u; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0); const corner = [...g.getImageData(2, 2, 1, 1).data]; const mid = [...g.getImageData(im.width / 2, im.height / 2, 1, 1).data];
  return { w: im.width, h: im.height, corner, mid, kept: m.store.shotNames().includes(f) }; }, logos.apex);
t('…squared and centred, on its own background', sq.w === 256 && sq.h === 256 && sq.corner[0] > 240 && sq.mid[2] > 180 && sq.mid[0] < 60, JSON.stringify(sq));
t('…and a backup carries it', sq.kept);
await p.keyboard.press('Escape'); await settle(400);
t('every account at that firm wears it, in place of the one it came with', await p.evaluate(() => ['f1', 'f2'].every(x => /^blob:/.test(document.querySelector(`.ab-card[data-account="${x}"] .ab-logo.has-img img`)?.getAttribute('src') || ''))));

/* ---------- a new account: one question at a time, the way LiquidJournal asks ---------- */
const wiz = () => p.evaluate(() => {
  const sh = document.querySelector('.sheet.is-wiz:not(.is-out)');
  return sh ? { step: sh.dataset.step, title: sh.querySelector('.sheet-title h2').textContent, head: sh.querySelector('.aw-title')?.textContent || '',
    firms: [...sh.querySelectorAll('[data-firm]')].map(x => x.dataset.firm), rail: [...sh.querySelectorAll('.aw-step')].map(x => x.innerText.replace(/\s+/g, ' ').trim()) } : null; });
const press = async (sel, ms = 350) => { await p.click('.sheet.is-wiz:not(.is-out) ' + sel); await settle(ms); };
await p.click('.ab-new'); await settle(500);
let W = await wiz();
t('a new account asks first: a prop firm, or live', W?.step === 'start' && W.title === 'Add account'
  && await p.evaluate(() => ['prop', 'live'].every(x => !!document.querySelector(`.sheet .aw-pick[data-path="${x}"]`))), JSON.stringify(W));
await press('.aw-pick[data-path="live"]');
W = await wiz();
t('Live goes straight to the brokers, with what each trades', W.step === 'broker' && W.title === 'Add a live account'
  && ['oanda', 'pepperstone', 'tradovate', 'fusion', 'other'].every(x => W.firms.includes(x)) && !W.firms.includes('apex')
  && /Futures/.test(await p.evaluate(() => document.querySelector('.sheet .aw-btile[data-firm="tradovate"]').innerText)), JSON.stringify(W));
await press('.aw-back');
await press('.aw-pick[data-path="prop"]');
W = await wiz();
t('a prop firm asks Futures or CFD, with how many firms each', W.step === 'market' && W.title === 'Add a prop firm account'
  && await p.evaluate(() => /5 firms/i.test(document.querySelector('.sheet .aw-market[data-market="futures"]').innerText)
    && /4 firms/i.test(document.querySelector('.sheet .aw-market[data-market="forex"]').innerText)
    && /CFD/.test(document.querySelector('.sheet .aw-market[data-market="forex"]').innerText)), JSON.stringify(W));
await press('.aw-market[data-market="forex"]');
W = await wiz();
t('CFD shows the forex firms, and only them', W.step === 'firm' && ['ftmo', 'the5ers', 'fundingpips', 'alphacapital'].every(x => W.firms.includes(x)) && !W.firms.includes('apex'), JSON.stringify(W.firms));
await press('.aw-change');
await press('.aw-market[data-market="futures"]');
await p.fill('.sheet .aw-search input', 'my'); await settle(200);
W = await wiz();
t('Futures shows the futures firms, and the search finds one', W.step === 'firm' && JSON.stringify(W.firms) === '["mffu","other"]', JSON.stringify(W.firms));
await p.fill('.sheet .aw-search input', ''); await settle(200);
await press('.aw-ftile[data-firm="apex"]');
W = await wiz();
t('picking a firm moves on to its plans', W.step === 'plan' && /^Apex · Pick a plan$/.test(W.head) && /Firm Apex · Futures/.test(W.rail[0])
  && await p.evaluate(() => document.querySelector('.sheet .ab-kinds .is-on')?.dataset.kind === 'eval'
    && [...document.querySelectorAll('.sheet .aw-size[data-size]')].map(x => x.dataset.size).join() === '25000,50000,100000,150000,250000,300000'), JSON.stringify(W));
await p.click('.sheet .aw-go, .sheet .ab-go'); await settle(200);
t('Continue with no size says what is missing', /size/i.test(await p.evaluate(() => document.querySelector('.sheet .aw-foot .missing-note').textContent)));
await press('.ab-kinds [data-kind="funded"]');
await press('.aw-size[data-size="100000"]');
W = await wiz();
t('a size moves on, and names the account', W.step === 'name' && await p.evaluate(() => document.querySelector('.sheet .ab-namein').value === 'Apex 100K')
  && /Plan Funded · \$100K/.test(W.rail[1]), JSON.stringify(W));
t('…with other names to pick from', await p.evaluate(() => [...document.querySelectorAll('.sheet .aw-schip')].map(x => x.textContent).join('|') === 'Apex 100K|Apex Funded|Apex 100K Funded'));
await p.fill('.sheet .aw-balin', '101,250'); await settle(150);
t('the card it will make is shown as it is filled in', /Apex.*FUNDED.*\$100,000 account.*Apex 100K.*\$101,250/s.test(await p.evaluate(() => document.querySelector('.sheet .aw-preview').innerText.replace(/\s+/g, ' '))));
await press('.ab-go');
W = await wiz();
const sumText = await p.evaluate(() => document.querySelector('.sheet .aw-dl').innerText.replace(/\s+/g, ' '));
t('a last look before it is made', W.step === 'confirm' && /Account type Funded/.test(sumText) && /Trades Futures/.test(sumText) && /Account size \$100,000/.test(sumText) && /Balance today \$101,250/.test(sumText), sumText);
await press('.aw-step[data-step="plan"] button');
t('a step already done goes back to it, keeping what was picked', (await wiz()).step === 'plan' && await p.evaluate(() => document.querySelector('.sheet .aw-size.is-on')?.dataset.size === '100000'));
await press('.aw-size[data-size="100000"]'); await press('.ab-go');
await press('.ab-go', 800);
const made = (await disk()).accounts.find(x => x.name === 'Apex 100K');
t('it is created funded, at Apex, at 100K', made?.kind === 'funded' && made.firm === 'apex' && made.startingBalance === 100000, JSON.stringify(made));
t('…its balance today kept as a correction', made?.adjustments?.length === 1 && made.adjustments[0].amount === 1250, JSON.stringify(made?.adjustments));
t('…and is on the funded shelf', await p.evaluate(id => !!document.querySelector(`.ab-shelf[data-shelf="funded"] .ab-card[data-account="${id}"]`), made?.id));

/* a live one, at a broker that is not listed */
await p.click('.ab-new'); await settle(500);
await press('.aw-pick[data-path="live"]');
await press('.aw-btile[data-firm="other"]');
await p.fill('.sheet .ab-othername', 'IC Markets'); await settle(150);
t('another broker is typed in, and the name follows it', await p.evaluate(() => document.querySelector('.sheet .ab-namein').value === 'IC Markets Live'));
await p.fill('.sheet .ab-sizein', '$5 000'); await settle(100);
await press('.ab-go'); await press('.ab-go', 800);
const lv = (await disk()).accounts.find(x => x.name === 'IC Markets Live');
t('a live account at it is made', lv?.kind === 'live' && lv.firm === 'other' && lv.firmName === 'IC Markets' && lv.startingBalance === 5000 && !lv.adjustments?.length, JSON.stringify(lv));

/* ---------- Passed, and blown ---------- */
await p.click('.ab-card[data-account="e1"] .ab-pass'); await settle(200);
await p.click('.ab-card[data-account="e1"] .ab-pass'); await settle(700);
const D = await disk();
const e1 = D.accounts.find(x => x.id === 'e1'), earned = D.accounts.find(x => x.name === 'Topstep 50K');
t('Passed puts the evaluation away as passed', e1.archived && e1.status === 'passed');
t('…and starts the funded account it earned, and you are on it', earned?.kind === 'funded' && earned.firm === 'topstep' && earned.startingBalance === 50000 && D.activeAccountId === earned?.id, JSON.stringify(earned));
await p.click(`.ab-card[data-account="${made.id}"] .ab-edit`); await settle(450);
await p.evaluate(() => [...document.querySelectorAll('.sheet .ab-away button')].find(x => x.textContent.trim() === 'Blown').click()); await settle(200);
await p.evaluate(() => [...document.querySelectorAll('.sheet .ab-away button')].find(x => /Mark it blown/.test(x.textContent)).click()); await settle(700);
const blown = await acct(made.id);
t('Blown puts it away, marked blown, trades kept', blown.archived && blown.status === 'blown');
await p.evaluate(() => document.querySelector('.ab-shelf[data-shelf="archived"] .ab-shelf-t').click()); await settle(400);
t('the put-away shelf opens to show them, badged', /BLOWN/.test(await cardText(made.id)) && /PASSED/.test(await cardText('e1')) && /BLOWN/.test(await cardText('x1')));

/* ---------- a card is a way to switch ---------- */
await p.click('.ab-card[data-account="l1"] .ab-stats'); await settle(500);
t('pressing a card makes it the account you are on', (await disk()).activeAccountId === 'l1' && /OANDA/.test(await p.evaluate(() => document.querySelector('.tb-acct').innerText)));

await p.screenshot({ path: OUT + '/acctboard.png' });
t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
