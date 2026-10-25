/* Prop firms: the most trusted futures and forex firms, their rules and
   fine print, checked against your journal and handed to The Lab.

   The data is checked for shape and sense (a max loss smaller than the
   account, a daily loss smaller than the max loss, ranks in order); the page
   is checked against the data, firm by firm, so every tile reads what the
   research says; the pieces — the cost sums, the journal checks, the Lab
   sheet — are checked by hand. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB, makeTrades } from '../fixtures/ghost-fixture.mjs';
import { FIRMS, CHECKED } from '../../src/js/firms.js';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };
const money = (cur, v) => (v == null ? '—' : (v < 0 ? '−' : '') + cur + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: v % 1 ? 2 : 0 }));

/* ===================== the data ===================== */
console.log('data');
const fut = FIRMS.filter(f => f.market === 'futures'), fx = FIRMS.filter(f => f.market === 'forex');
t('six futures firms and five forex', fut.length === 6 && fx.length === 5, `${fut.length} / ${fx.length}`);
t('Lucid Trading is among the futures firms', fut.some(f => f.id === 'lucid'));
t('ranked 1… in each market, Topstep and FTMO first', [fut, fx].every(l => l.map(f => f.rank).sort((a, b) => a - b).join() === l.map((_, i) => i + 1).join())
  && fut.find(f => f.rank === 1).id === 'topstep' && fx.find(f => f.rank === 1).id === 'ftmo');
t('trust in half stars, highest first', [fut, fx].every(l => l.slice().sort((a, b) => a.rank - b.rank).every((f, i, a) => f.trust * 2 === Math.round(f.trust * 2) && f.trust <= 5 && (!i || a[i - 1].trust >= f.trust))));
t('checked on a date', /^\d{4}-\d{2}-\d{2}$/.test(CHECKED));
const bad = [];
for (const f of FIRMS) {
  if (!f.name || !f.mono || !f.since || !f.rulesUrl || !f.sources?.length) bad.push(f.id + ': identity');
  if (!(f.trustpilot?.score > 0 && f.trustpilot.reviews > 0)) bad.push(f.id + ': trustpilot');
  if (!f.programs?.length) bad.push(f.id + ': programs');
  for (const p of f.programs || []) {
    if (!p.stages?.length || !p.payouts?.length || !['monthly', 'one-time'].includes(p.pricing)) bad.push(`${f.id}/${p.id}: program`);
    for (const s of p.sizes) {
      if (!(s.balance > 0) || !(s.maxLoss > 0) || s.maxLoss >= s.balance) bad.push(`${f.id}/${p.id}/${s.label}: max loss`);
      if (s.dailyLoss != null && !(s.dailyLoss > 0 && s.dailyLoss <= s.maxLoss)) bad.push(`${f.id}/${p.id}/${s.label}: daily`);
      if (s.target != null && !(s.target > 0 && s.target < s.balance)) bad.push(`${f.id}/${p.id}/${s.label}: target`);
      if (s.price != null && !(s.price > 0)) bad.push(`${f.id}/${p.id}/${s.label}: price`);
      if (!['static', 'EOD trailing', 'intraday trailing'].includes(s.maxLossType)) bad.push(`${f.id}/${p.id}/${s.label}: type`);
    }
  }
  if (!(f.rules?.length >= 8)) bad.push(f.id + ': rules');
  for (const r of f.rules) if (!['danger', 'caution', 'info'].includes(r.sev) || !['Official', 'Fine print'].includes(r.src) || !r.title || !r.why) bad.push(f.id + ': rule ' + r.title);
  if (!(f.take?.pros?.length >= 3 && f.take.watch?.length >= 3 && f.take.verdict)) bad.push(f.id + ': take');
}
t('every firm, account and rule is complete and makes sense', bad.length === 0, bad.slice(0, 6).join(' | '));
t('fine print is ordered most dangerous first', FIRMS.every(f => f.rules.every((r, i, a) => !i || ['danger', 'caution', 'info'].indexOf(a[i - 1].sev) <= ['danger', 'caution', 'info'].indexOf(r.sev))),
  FIRMS.filter(f => !f.rules.every((r, i, a) => !i || ['danger', 'caution', 'info'].indexOf(a[i - 1].sev) <= ['danger', 'caution', 'info'].indexOf(r.sev))).map(f => f.id).join());

/* ===================== the page ===================== */
const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
const TR = makeTrades();
await p.addInitScript(({ ACCT, TR, PB }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, TR, PB });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 250) => p.waitForTimeout(ms);

/* ===================== by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async () => {
  const V = await import('/js/views/firms.js');
  const { FIRMS } = await import('/js/firms.js');
  const F = id => FIRMS.find(f => f.id === id);
  const ts = F('topstep'), ftmo = F('ftmo');
  const cost3 = V.costs(ts, '50K', 3).map(r => [r.name, r.total]);
  const cost1 = V.costs(F('mffu'), '25K', 2).map(r => [r.name, r.total]);
  const A = { startingBalance: 100000, defaultRiskPercent: 1 };
  const T = (d, net, f = {}) => ({ date: d, timeOpen: '10:00', netResult: net, riskPercent: 1, status: 'closed', ...f });
  /* −1 −1 −1 +2 · −1 −1 | best day +3, worst −2 */
  const tr = [T('2026-09-01', -1000), T('2026-09-01', -1000), T('2026-09-02', -1000), T('2026-09-03', 2000), T('2026-09-03', 1000), T('2026-09-04', -1000, { news: 'during' }), T('2026-09-05', -1000)];
  const size = ts.programs[0].sizes[0];           // 50K, $2,000 max loss, best day < 55% of $3,000
  const J = V.journalChecks(A, tr, size, ts.rules);
  const sTs = V.sheetFor(ts, ts.programs[0], size);
  const f100 = ftmo.programs[0].sizes.find(s => s.label === '100K');
  const sF = V.sheetFor(ftmo, ftmo.programs[0], f100);
  const sF1 = V.sheetFor(ftmo, ftmo.programs[1], ftmo.programs[1].sizes[0]);
  return { cost3, cost1, J: { longest: J.longest, survive: J.survive, worst: J.worst, best: J.best, share: J.share, limit: J.limit, during: J.duringNews, newsRule: J.newsRule, risk: J.risk },
    sTs: { size: sTs.size, fee: sTs.fee, act: sTs.activation, steps: sTs.steps, t1: sTs.target1, dd: sTs.eval.dd, type: sTs.eval.ddType, lock: sTs.eval.lock, best: sTs.eval.best, split: sTs.funded.split, min: sTs.eval.minDays },
    sF: { steps: sF.steps, t1: sF.target1, t2: sF.target2, dd: sF.eval.dd, type: sF.eval.ddType, daily: sF.eval.daily, min: sF.eval.minDays, split: sF.funded.split, refund: sF.refund, fee: sF.fee },
    sF1: { steps: sF1.steps, refund: sF1.refund, type: sF1.eval.ddType },
    pct: [V.pctIn('best day < 55% of target'), V.pctIn('none'), V.pctIn('40% in evaluation only')] };
});
t('three months of the Combine: 3 × $49 + $149 = $296, or 3 × $95 = $285', JSON.stringify(H.cost3) === JSON.stringify([['Trading Combine', 296], ['Trading Combine · No activation fee', 285]]), JSON.stringify(H.cost3));
t('a one-time fee is paid once per attempt', H.cost1.every(([, v]) => v > 0) && H.cost1[0][1] === 2 * FIRMS.find(f => f.id === 'mffu').programs[0].sizes[0].price, JSON.stringify(H.cost1));
t('journal: risk is 1% of the firm’s account, $500 on a 50K', H.J.risk === 500);
t('journal: the longest losing run is 3, and $2,000 takes 3', H.J.longest === 3 && H.J.survive === 3, JSON.stringify(H.J));
t('journal: worst day −$1,000, best day +$1,500', H.J.worst === -1000 && H.J.best === 1500);
t('journal: best day against a rule written on the target: 1,500 / 3,000 = 50% of 55%', H.J.share === 0.5 && H.J.limit === 55);
t('journal: one trade logged during news, and Topstep has a news rule', H.J.during === 1 && H.J.newsRule === true);
t('percentages read out of rule text', JSON.stringify(H.pct) === '[55,null,40]');
t('Lab sheet · Topstep 50K: $49 fee, $149 activation, 6% target, 4% trailing at the close, locked', H.sTs.size === 50000 && H.sTs.fee === 49 && H.sTs.act === 149
  && H.sTs.steps === 1 && H.sTs.t1 === 6 && H.sTs.dd === 4 && H.sTs.type === 'eod' && H.sTs.lock === true && H.sTs.best === 55 && H.sTs.split === 90 && H.sTs.min === 2, JSON.stringify(H.sTs));
t('Lab sheet · FTMO 2-step 100K: two steps 10% then 5%, 10% static, 5% daily, 4 days, 80%, refunded', H.sF.steps === 2 && H.sF.t1 === 10 && H.sF.t2 === 5 && H.sF.dd === 10
  && H.sF.type === 'static' && H.sF.daily === 5 && H.sF.min === 4 && H.sF.split === 80 && H.sF.refund === true && H.sF.fee === 540, JSON.stringify(H.sF));
t('Lab sheet · FTMO 1-step: one step, trailing, not refunded', H.sF1.steps === 1 && H.sF1.refund === false && H.sF1.type === 'eod', JSON.stringify(H.sF1));

/* ===================== the page ===================== */
console.log('page');
await p.evaluate(() => { location.hash = '#/firms'; }); await settle(600);
const navNames = await p.evaluate(() => [...document.querySelectorAll('.head .sn-tab')].map(a => a.textContent.trim()));
t('the firms sit last in the Lab, after its tools', navNames[navNames.length - 1] === 'Firms' && navNames[0] === 'Monte Carlo', navNames.join(' / '));
const rail = () => p.evaluate(() => [...document.querySelectorAll('.pf-firm .n1')].map(n => n.textContent));
t('futures first, most trusted at the top', (await rail()).join() === fut.sort((a, b) => a.rank - b.rank).map(f => f.name).join(), (await rail()).join());
t('each with its stars', await p.evaluate(() => document.querySelectorAll('.pf-firm .stars').length) === 6
  && await p.evaluate(() => document.querySelector('.pf-firm .stars').querySelectorAll('.f').length) === 5);
await p.evaluate(() => [...document.querySelectorAll('.head .seg button')].find(b => /Forex/.test(b.textContent)).click()); await settle(300);
t('the Forex tab lists the five forex firms, FTMO first', (await rail()).join() === fx.sort((a, b) => a.rank - b.rank).map(f => f.name).join());
t('and opens on FTMO', await p.evaluate(() => document.querySelector('.pf-id h2').firstChild.textContent) === 'FTMO');

const tileVals = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.pf-tiles .lab-tile')].map(x => [x.querySelector('.k').textContent, x.querySelector('.v').firstChild.textContent])));
const segClick = (label, which) => p.evaluate(([l, w]) => { const segs = [...document.querySelectorAll('.pf-pick .seg')]; const s = w === 'size' ? segs[segs.length - 1] : segs[0];
  [...s.querySelectorAll('button')].find(b => b.textContent === l).click(); }, [label, which]);
/* Every firm, every program, its first size: the tiles read the data. */
const mismatches = [];
for (const f of FIRMS) {
  await p.evaluate(id => { location.hash = '#/firms/' + id; }, f.id); await settle(200);
  for (const pr of f.programs) {
    if (f.programs.length > 1) { await segClick(pr.name, 'program'); await settle(120); }
    const s = pr.sizes[pr.sizes.length - 1];
    await segClick(s.label, 'size'); await settle(120);
    const v = await tileVals(), cur = pr.currency || '$';
    const want = { Cost: s.price == null ? 'See site' : money(cur, s.price), 'Max loss': money(cur, s.maxLoss), 'Profit target': s.target == null ? 'None' : money(cur, s.target),
      'Daily loss': s.dailyLoss != null ? money(cur, s.dailyLoss) : null };
    for (const [k, w] of Object.entries(want)) if (w != null && v[k] !== w) mismatches.push(`${f.id}/${pr.id}/${s.label} ${k}: ${v[k]} ≠ ${w}`);
  }
}
t('every firm’s tiles read its own numbers, account by account', mismatches.length === 0, mismatches.slice(0, 4).join(' | '));

await p.evaluate(() => { location.hash = '#/firms/topstep'; }); await settle(300);
await segClick('Trading Combine', 'program'); await segClick('100K', 'size'); await settle(150);
let v = await tileVals();
t('Topstep 100K: $99 a month, $6,000 target, $3,000 max loss', v.Cost === '$99' && v['Profit target'] === '$6,000' && v['Max loss'] === '$3,000', JSON.stringify(v));
t('the deep link opened Futures', await p.evaluate(() => document.querySelector('.head .seg .is-on').textContent.startsWith('Futures')));
await segClick('50K', 'size'); await settle(150);
await p.evaluate(() => { const r = document.querySelector('.pf-range'); r.value = 3; r.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(200);
const bars = await p.evaluate(() => [...document.querySelectorAll('.pf-bar')].map(b => [b.querySelector('.nm').textContent, b.querySelector('b').textContent, b.classList.contains('best')]));
t('cost over three months, the cheaper one marked', JSON.stringify(bars) === JSON.stringify([['Trading Combine', '$296', false], ['Trading Combine · No activation fee', '$285', true]]), JSON.stringify(bars));

const ruleCount = () => p.evaluate(() => document.querySelectorAll('.pf-rule').length);
const ts = FIRMS.find(f => f.id === 'topstep');
t('the fine print lists every rule', await ruleCount() === ts.rules.length);
await p.evaluate(() => [...document.querySelectorAll('.pf-fine .filters button')].find(b => /Ends the account/.test(b.textContent)).click()); await settle(200);
t('and filters to what ends the account', await ruleCount() === ts.rules.filter(r => r.sev === 'danger').length && await p.evaluate(() => [...document.querySelectorAll('.pf-rule')].every(r => r.classList.contains('danger'))));
await p.evaluate(() => [...document.querySelectorAll('.pf-fine .filters button')].find(b => /^All/.test(b.textContent)).click()); await settle(200);
t('each rule says where it came from', await p.evaluate(() => [...document.querySelectorAll('.pf-rule .src')].map(s => s.textContent)).then(a => a.join() === ts.rules.map(r => r.src).join()));
t('Quire’s take at the bottom: pros, watch-outs and a verdict', await p.evaluate(() => {
  const take = document.querySelector('.pf-take'); const cards = [...document.querySelectorAll('.pf-main > .card')];
  return !!take && cards.indexOf(take) >= cards.length - 2 && take.querySelectorAll('.is-pro .pf-ti').length >= 3 && take.querySelectorAll('.is-watch .pf-ti').length >= 3 && !!take.querySelector('.pf-verdictline'); }));
t('your journal is checked against the account', await p.evaluate(() => document.querySelectorAll('.pf-chk').length) >= 3);

/* Into The Lab, once — a second click updates the same sheet. */
await p.evaluate(() => [...document.querySelectorAll('.pf-hero button')].find(b => /Use in The Lab/.test(b.textContent)).click()); await settle(500);
t('Use in The Lab opens the rule sheet', await p.evaluate(() => location.hash) === '#/lab/rules');
let lab = await p.evaluate(() => JSON.parse(window.__files.get('data/lab.json')));
const name = 'Topstep · Trading Combine · 50K';
t('with a sheet for this account, chosen', lab.firms.filter(f => f.name === name).length === 1 && lab.firms.find(f => f.name === name).id === lab.firmId && lab.firms.find(f => f.name === name).size === 50000);
await p.evaluate(() => { location.hash = '#/firms/topstep'; }); await settle(300);
await p.evaluate(() => [...document.querySelectorAll('.pf-hero button')].find(b => /Use in The Lab/.test(b.textContent)).click()); await settle(500);
lab = await p.evaluate(() => JSON.parse(window.__files.get('data/lab.json')));
t('using it again does not add a second', lab.firms.filter(f => f.name === name).length === 1);

await p.setViewportSize({ width: 1280, height: 800 });
for (const id of ['lucid', 'fundingpips']) {
  await p.evaluate(x => { location.hash = '#/firms/' + x; }, id); await settle(400);
  const fit = await p.evaluate(() => [...document.querySelectorAll('.pf-main > *, .pf-rail, .head')].filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.className));
  t(`${id} fits at 1280 with nothing spilling sideways`, fit.length === 0, fit.join());
}
t('no page errors', errs.length === 0, errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
