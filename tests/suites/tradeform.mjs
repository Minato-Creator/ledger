/* New trade, rearranged into numbered sections, with two new things asked:
   how confident you were going in (a slide, 1 revenge to 5 confident) and
   how the trade ended (take profit, stop loss, break-even, closed
   manually). Both have to save, come back on edit, and stay out of the way
   of a trade that is still running. */
import pw from 'playwright';
import fs from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const OLD = { id: 't_old', accountId: 'acc_1', pair: 'XAUUSD', side: 'buy', date: '2026-09-15', timeOpen: '15:00', timeClose: '16:00',
  riskPercent: 1, netResult: -1000, status: 'closed', mode: 'live', tagIds: [], shots: [], confidence: 4, exitReason: 'sl',
  emotionAfter: 4, execTf: '1H', mistakes: ['tp_far', 'junk'], delivery: 'good' };
const ODD = { ...OLD, id: 't_odd', confidence: 9, exitReason: 'moon' };

const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(({ OLD, ODD }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [{ id: 'acc_1', name: 'Funded', currency: 'USD',
      startingBalance: 100000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2026-09-01', archived: false, weeklyTargetPercent: 0 }], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: [OLD, ODD] })]]));
}, { OLD, ODD });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 300) => p.waitForTimeout(ms);
const text = s => p.evaluate(x => document.querySelector(x)?.innerText.replace(/\s+/g, ' ').trim() ?? null, s);
const onDisk = () => p.evaluate(() => JSON.parse(window.__files.get('data/trades.json')).trades);
const confWord = () => text('.conf-word'); const afterWord = () => p.evaluate(() => document.querySelectorAll('.conf-word')[1]?.textContent);
const onIn = sel => p.evaluate(s => [...document.querySelectorAll(s + ' .xr.is-on')].map(b => b.textContent), sel);
const clickIn = (sel, l) => p.evaluate(([s, l]) => [...document.querySelectorAll(s + ' .xr')].find(b => b.textContent === l).click(), [sel, l]);
const xrOn = () => p.evaluate(() => [...document.querySelectorAll('[aria-label="Exit reason"] .xr.is-on')].map(b => b.textContent));
const clickXr = l => p.evaluate(l => [...document.querySelectorAll('[aria-label="Exit reason"] .xr')].find(b => b.textContent === l).click(), l);

/* ---------- the layout ---------- */
await p.evaluate(() => { location.hash = '#/new'; }); await settle(700);
const secs = await p.evaluate(() => [...document.querySelectorAll('.trade-form .sec-h')].map(h => h.querySelector('i').textContent + ' ' + h.querySelector('span').textContent));
t('the form is eleven numbered sections, in order', JSON.stringify(secs) === JSON.stringify(
  ['01 The trade', '02 Prices', '03 Timing & size', '04 Outcome', '05 Context', '06 Mindset', '07 Execution', '08 News', '09 Tags', '10 Charts', '11 Notes']), JSON.stringify(secs));
const cols = await p.evaluate(() => [...document.querySelectorAll('.trade-form > .col')].map(c => [...c.querySelectorAll('.sec-h > span:not(.sec-count)')].map(s => s.textContent).join(',')));
t('the trade on the left, how it went on the right', cols[0] === 'The trade,Prices,Timing & size,Outcome,Context' && cols[1] === 'Mindset,Execution,News,Tags', JSON.stringify(cols));
t('charts and notes run across the foot, full width', await p.evaluate(() => {
  const w = document.querySelector('.tf-wide'), f = document.querySelector('.trade-form');
  return !!w && [...w.querySelectorAll('.sec-h > span:not(.sec-count)')].map(s => s.textContent).join() === 'Charts,Notes'
    && w.getBoundingClientRect().width > f.clientWidth - 80 && w.getBoundingClientRect().top >= document.querySelector('.trade-form > .col').getBoundingClientRect().bottom - 1; }));
t('exit reason sits in Outcome, with the result it explains', /EXIT REASON/i.test(await p.evaluate(() =>
  [...document.querySelectorAll('.band.sec')].find(b => /Outcome/.test(b.querySelector('.sec-h').innerText)).innerText)));

/* ---------- confidence ---------- */
t('confidence starts unrated, not at 3', await confWord() === 'Not rated' && await p.evaluate(() => document.querySelector('.conf').classList.contains('is-unset')));
t('five stops, named from revenge to confident', (await text('.conf-ticks')) === '1 Revenge 2 Forced 3 Unsure 4 Solid 5 Confident', await text('.conf-ticks'));
await p.evaluate(() => [...document.querySelectorAll('.conf-ticks button')][0].click()); await settle(150);
t('picking 1 says Revenge', await confWord() === 'Revenge' && await p.$eval('.conf-range', r => r.value) === '1');
await p.focus('.conf-range'); await p.keyboard.press('ArrowRight'); await settle(150);
t('the slide moves it along, one stop at a time', await confWord() === 'Forced' && await p.$eval('.conf-range', r => r.value) === '2');
await p.evaluate(() => document.querySelector('.conf-x').click()); await settle(150);
t('and × takes it back to unrated', await confWord() === 'Not rated');
const box = await p.$eval('.conf-range', r => { const b = r.getBoundingClientRect(); return { x: b.left, y: b.top + b.height / 2, w: b.width }; });
await p.mouse.click(box.x + box.w - 4, box.y); await settle(200);
t('clicking the bar sets it too', await confWord() === 'Confident', await confWord());
/* A real drag, end to end: the slider must not be redrawn under the pointer. */
await p.mouse.move(box.x + box.w - 4, box.y); await p.mouse.down();
for (let i = 1; i <= 12; i++) { await p.mouse.move(box.x + box.w - 4 - (box.w - 8) * i / 12, box.y); await p.waitForTimeout(15); }
await p.mouse.up(); await settle(150);
t('dragging it all the way back lands on 1, Revenge', await confWord() === 'Revenge', await confWord());
await p.mouse.down(); await p.mouse.move(box.x + box.w - 4, box.y, { steps: 10 }); await p.mouse.up(); await settle(150);

/* ---------- exit reason ---------- */
t('four ways a trade can end — trailed is gone', (await p.evaluate(() => [...document.querySelectorAll('[aria-label="Exit reason"] .xr')].map(b => b.textContent).join('|'))) === 'Take profit|Stop loss|Break-even|Closed manually');
await clickXr('Stop loss'); await settle(120);
t('one can be picked', JSON.stringify(await xrOn()) === '["Stop loss"]');
await clickXr('Take profit'); await settle(120);
t('and only one at a time', JSON.stringify(await xrOn()) === '["Take profit"]');
await clickXr('Take profit'); await settle(120);
t('picking it again clears it', (await xrOn()).length === 0);
await clickXr('Stop loss'); await settle(120);

/* A running trade has not ended, so it is not asked how. */
await p.evaluate(() => [...document.querySelectorAll('.trade-form .seg button')].find(b => b.textContent === 'Still open').click()); await settle(200);
t('Still open hides the exit reason', await p.evaluate(() => document.querySelector('[aria-label="Exit reason"]').closest('[hidden]') !== null));
t('and how it felt after — it is not over yet', await p.evaluate(() => document.querySelectorAll('.conf')[1].closest('[hidden]') !== null));
await p.evaluate(() => [...document.querySelectorAll('.trade-form .seg button')].find(b => b.textContent === 'Closed').click()); await settle(200);
t('Closed brings it back, as it was', JSON.stringify(await xrOn()) === '["Stop loss"]' && await p.evaluate(() => !document.querySelector('[aria-label="Exit reason"]').closest('[hidden]')));

/* ---------- feeling after, timeframe, mistakes, delivery ---------- */
t('feeling after is a slide too, angry to satisfied', (await p.evaluate(() => document.querySelectorAll('.conf-ticks')[1].innerText.replace(/\s+/g, ' ').trim())) === '1 Angry 2 Regret 3 Indifferent 4 Content 5 Satisfied');
t('and starts unrated', await afterWord() === 'Not rated');
await p.evaluate(() => [...document.querySelectorAll('.conf-ticks')[1].querySelectorAll('button')][1].click()); await settle(120);
t('picking 2 says Regret', await afterWord() === 'Regret');
t('the execution timeframe offers 1m to daily', (await p.evaluate(() => [...document.querySelectorAll('.xr.is-tf')].map(b => b.textContent).join(' '))) === '1m 3m 5m 15m 30m 1H 4H D');
await p.evaluate(() => [...document.querySelectorAll('.xr.is-tf')].find(b => b.textContent === '5m').click()); await settle(100);
await p.evaluate(() => [...document.querySelectorAll('.xr.is-tf')].find(b => b.textContent === '15m').click()); await settle(100);
t('one timeframe at a time', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.xr.is-tf.is-on')].map(b => b.textContent))) === '["15m"]');
t('eight mistakes to pick from, the last an analysis mistake', (await p.evaluate(() => [...document.querySelectorAll('.mistakes .xr')].map(b => b.textContent).join('|'))) ===
  'Closed early|Early entry|No confirmation entry|Moved to BE early|Bad stop loss|TP too far|Wrong bias|Analysis mistake');
await clickIn('.mistakes', 'Early entry'); await clickIn('.mistakes', 'Wrong bias'); await clickIn('.mistakes', 'Bad stop loss'); await settle(120);
t('several mistakes can be picked at once', JSON.stringify(await onIn('.mistakes')) === '["Early entry","Bad stop loss","Wrong bias"]', JSON.stringify(await onIn('.mistakes')));
await clickIn('.mistakes', 'Bad stop loss'); await settle(100);
t('and one taken off again', JSON.stringify(await onIn('.mistakes')) === '["Early entry","Wrong bias"]');
t('price delivery is three buttons, not a slide', (await p.evaluate(() => [...document.querySelectorAll('.delivery .xr')].map(b => b.textContent).join('|'))) === 'Good|Neutral|Poor'
  && !(await p.$('.delivery input[type=range]')));
await clickIn('.delivery', 'Good'); await clickIn('.delivery', 'Poor'); await settle(100);
t('one of them at a time', JSON.stringify(await onIn('.delivery')) === '["Poor"]');

/* ---------- saving ---------- */
await p.fill('.main input[placeholder="XAUUSD"]', 'NAS100');
await p.fill('.main input[placeholder="0.00"]', '1500');
await settle(200);
await p.evaluate(() => [...document.querySelectorAll('.head button')].find(b => /^Save/.test(b.textContent.trim())).click()); await settle(700);
const saved = (await onDisk()).find(x => x.pair === 'NAS100');
t('a new trade saves its confidence and how it ended', saved?.confidence === 5 && saved?.exitReason === 'sl', JSON.stringify(saved && { c: saved.confidence, x: saved.exitReason }));
t('and how it felt after, its timeframe, its mistakes and the delivery', saved?.emotionAfter === 2 && saved?.execTf === '15m'
  && JSON.stringify(saved?.mistakes) === '["early_entry","wrong_bias"]' && saved?.delivery === 'poor',
  JSON.stringify(saved && { e: saved.emotionAfter, tf: saved.execTf, m: saved.mistakes, d: saved.delivery }));

/* ---------- editing ---------- */
await p.evaluate(() => { location.hash = '#/edit/t_old'; }); await settle(700);
t('an old trade opens with what it had: 4, Solid, Stop loss', await confWord() === 'Solid' && await text('.conf-n') === '4' && JSON.stringify(await xrOn()) === '["Stop loss"]');
t('and Content after, 1H, TP too far, Good — a mistake it does not know is dropped', await afterWord() === 'Content'
  && JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.xr.is-tf.is-on')].map(b => b.textContent))) === '["1H"]'
  && JSON.stringify(await onIn('.mistakes')) === '["TP too far"]' && JSON.stringify(await onIn('.delivery')) === '["Good"]');
await p.evaluate(() => [...document.querySelectorAll('.conf-ticks button')][1].click());
await clickXr('Closed manually'); await settle(150);
await p.evaluate(() => [...document.querySelectorAll('.head button')].find(b => /^Save/.test(b.textContent.trim())).click()); await settle(700);
let old = (await onDisk()).find(x => x.id === 't_old');
t('and keeps the changes', old.confidence === 2 && old.exitReason === 'manual', JSON.stringify({ c: old.confidence, x: old.exitReason }));
t('without touching anything else on it', old.netResult === -1000 && old.pair === 'XAUUSD' && old.timeOpen === '15:00');

await p.evaluate(() => { location.hash = '#/edit/t_odd'; }); await settle(700);
t('a value that is not one of the choices opens as unset', await confWord() === 'Not rated' && (await xrOn()).length === 0);

/* Reopening a closed trade as running drops the way it ended. */
await p.evaluate(() => { location.hash = '#/edit/t_old'; }); await settle(700);
await p.evaluate(() => [...document.querySelectorAll('.trade-form .seg button')].find(b => b.textContent === 'Still open').click()); await settle(200);
await p.evaluate(() => [...document.querySelectorAll('.head button')].find(b => /^Save/.test(b.textContent.trim())).click()); await settle(700);
old = (await onDisk()).find(x => x.id === 't_old');
t('a trade saved as still running has no exit reason', old.status === 'open' && old.exitReason === null, JSON.stringify({ s: old.status, x: old.exitReason }));
t('and no feeling after', old.emotionAfter === null);
t('but keeps how confident you were', old.confidence === 2);

await p.evaluate(() => { location.hash = '#/new'; }); await settle(600);
await p.screenshot({ path: OUT + '/tradeform.png' });
t('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
