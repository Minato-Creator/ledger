/* The Lab — a Monte Carlo of a prop-firm challenge, played on the journal's
   own trades against rules typed in by hand.

   The engine is checked on histories small enough to work out on paper: a
   pool of one day means every account plays the same days, so the answer is
   a number you can calculate, not a distribution you have to trust. Then the
   page is checked for showing the engine's answer and nothing else. */
import pw from 'playwright';
import fs from 'node:fs';
import * as L from '../../src/js/lab.js';
import { ACCT, TRADES, PB } from '../fixtures/weekly-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };
const near = (a, b, e = 1e-6) => a != null && b != null && Math.abs(a - b) < e;

/* ===================== the engine ===================== */
console.log('engine');
/* $100k, 1% a trade = $1,000 per R. Five traded days a week, so 14 calendar
   days is 10 drawn days and six months is 130. */
const W5 = { perWeek: 5 };
const plan = { riskEval: 1, riskFunded: 1, months: 6 };
const sheet = (patch = {}) => {
  const s = L.blankSheet('Test');
  Object.assign(s, { size: 100000, fee: 500, target1: 10 });
  Object.assign(s.eval, { dd: 10 });
  Object.assign(s.funded, { dd: 10, split: 80, firstDays: 14, everyDays: 14 });
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'eval' || k === 'funded') Object.assign(s[k], v); else s[k] = v;
  }
  return s;
};
const sim = (days, s, runs = 40) => L.simulate(days, L.prepare(s, plan, W5), { runs, seed: 5 });

let r = sim([[1]], sheet());
/* +$1,000 a day: pass on day 10. Funded, a payout every 10 days of $10,000
   at 80% = $8,000; 13 of them in 130 days = $104,000, less the $500 fee. */
t('a steady +1R a day passes in ten days', r.tally.passDays / r.tally.passed === 10);
t('and is paid thirteen times in six months', r.tally.payouts / r.tally.paid === 13);
t('worth $104,000 less the fee', near(r.mean, 103500), r.mean);

r = sim([[-1]], sheet({ eval: { dd: 5 } }));
t('a steady −1R a day hits a 5% drawdown and loses the fee', r.tally.fail.drawdown === 40 && near(r.mean, -500), JSON.stringify(r.tally.fail));

r = sim([[-1, -1, -1]], sheet({ eval: { daily: 2 } }));
t('three losses in a day against a 2% daily limit fail on the second', r.tally.fail.daily === 40);
r = sim([[-1, -1, -1]], sheet({ eval: { daily: 2, dailyMode: 'stop' } }));
t('when the limit only ends the day, the drawdown gets it instead', r.tally.fail.drawdown === 40 && r.tally.fail.daily === 0);

/* +2R then −1.5R every day: up $500 a day, but $1,500 off the day's high. */
const swing = type => sim([[2, -1.5]], sheet({ eval: { dd: 1, ddType: type } }));
t('a 1% static drawdown never sees it — passes on day 17', swing('static').tally.passDays / 40 === 17);
t('an end-of-day trailing one only trails the close — passes too', swing('eod').tally.passDays / 40 === 17);
t('an intraday trailing one trails the high and fails on day one', swing('intraday').tally.fail.drawdown === 40);

r = sim([[6]], sheet());
t('with no consistency rule, +$6,000 days pass on day 2', r.tally.passDays / r.tally.passed === 2);
r = sim([[6]], sheet({ eval: { best: 30 } }));
/* Best day $6,000 must be ≤ 30% of profit: not at $12k or $18k, yes at $24k. */
t('best day ≤ 30% of profit holds it to day 4', r.tally.passDays / r.tally.passed === 4);
r = sim([[6]], sheet({ eval: { minDays: 5 } }));
t('a minimum of five days holds it to day 5', r.tally.passDays / r.tally.passed === 5);
r = sim([[0.1]], sheet({ eval: { limitDays: 30 } }));
t('a 30-day limit fails an account that needs 100 days', r.tally.fail.time === 40);
r = sim([[0.01]], sheet());
t('with no limit, an account not passed in a year stops as "not passed"', r.tally.fail.stale === 40);
r = sim([[1]], sheet({ steps: 2, target2: 5 }));
t('two steps: ten days, then five more', r.tally.passDays / r.tally.passed === 15);

r = sim([[1]], sheet({ refund: true }));
t('a refunded fee comes back with the first payout', near(r.mean, 104000), r.mean);
r = sim([[1]], sheet({ activation: 150 }));
t('an activation fee is paid on passing', near(r.mean, 103350), r.mean);
r = sim([[1]], sheet({ funded: { cap: 3000 } }));
t('a payout cap holds each payout to it', near(r.paidOut[0], 13 * 3000 * 0.8), r.paidOut[0]);
r = sim([[1]], sheet({ funded: { minPayout: 20000 } }));
t('a $20,000 minimum waits for $20,000 — six payouts', r.tally.payouts / r.tally.paid === 6 && near(r.paidOut[0], 96000));

/* Trailing end of day, 5%, stopping at the starting balance, payouts only
   once it has, $2,000 left in: first payout day 10 at $110k takes $8,000. */
r = sim([[1]], sheet({ funded: { dd: 5, ddType: 'eod', lock: true, needLock: true, buffer: 2000 } }));
t('a buffer is left above a locked floor', near(r.paidOut[0], 8000 * 0.8 + 12 * 10000 * 0.8), r.paidOut[0]);
/* No lock: the floor is at $105k when the first payout comes, so only
   $5,000 above it can be taken — and every payout after, the same. */
r = sim([[1]], sheet({ funded: { dd: 5, ddType: 'eod' } }));
t('an unlocked trailing floor limits every payout to what is above it', near(r.paidOut[0], 13 * 5000 * 0.8), r.paidOut[0]);

const pr = L.prepare(sheet({ funded: { firstDays: 14 } }), { ...plan, months: 6 }, { perWeek: 5 });
t('14 calendar days at five days a week is ten traded days', pr.F.first === 10);
t('six months at five days a week is 130 traded days', pr.F.horizon === 130);
const pr3 = L.prepare(sheet(), plan, { perWeek: 3 });
t('trading three days a week, the same six months is 78', pr3.F.horizon === 78);

t('a blank sheet says what it still needs', L.missing(L.blankSheet()).join(', ') ===
  'account size, evaluation fee, profit target, evaluation drawdown, funded drawdown, profit split', L.missing(L.blankSheet()).join(', '));
t('two steps need a second target', L.missing(sheet({ steps: 2 })).includes('step 2 target'));
t('a free evaluation is a fee of zero, not a missing one', L.missing(sheet({ fee: 0 })).length === 0);

/* ---------- the sample ---------- */
const sample = L.sampleFrom(ACCT, TRADES);
t('the sample leaves out the open trade', sample.trades === TRADES.length - 1, sample.trades);
const noRisk = L.sampleFrom(ACCT, [...TRADES, { id: 'X', date: '2026-09-22', netResult: 500, riskPercent: null, status: 'closed', mode: 'live' }]);
t('and counts a trade with no R as left out, not as zero', noRisk.skipped === 1 && noRisk.trades === sample.trades);
const d14 = sample.days[sample.dayCount - 1 - 0];
t('trades are grouped into the days they were taken', sample.dayCount === new Set(TRADES.filter(x => x.status !== 'open').map(x => x.date)).size);
const mon = L.sampleFrom(ACCT, TRADES.filter(x => x.date === '2026-09-14'));
/* 14 Sep: FT closed 15:40 (+2), live 17:00 (−1), live 19:00 (−1). */
t('in the order they closed', JSON.stringify(mon.days[0]) === '[2,-1,-1]', JSON.stringify(mon.days[0]));
/* 22 traded days between 11 Aug and 23 Sep (the open trade on the 28th is
   not in the sample): 44 days, 6.3 weeks → 3.5 days a week. */
t('how often you trade comes from your own calendar', near(sample.perWeek, 22 / (44 / 7), 1e-9), sample.perWeek);

/* ---------- repeatable, and honest about noise ---------- */
const S = sheet();
const a = L.simulate(sample.days, L.prepare(S, plan, sample), { runs: 2000, seed: 11 });
const b2 = L.simulate(sample.days, L.prepare(S, plan, sample), { runs: 2000, seed: 11 });
const c2 = L.simulate(sample.days, L.prepare(S, plan, sample), { runs: 2000, seed: 12 });
t('the same inputs give the same answer, every time', a.mean === b2.mean);
t('a different seed gives a different run', a.mean !== c2.mean);

/* The same kind of trading, seen over 30 days and over 300. */
const coin = n => Array.from({ length: n }, (_, i) => [i % 3 === 0 ? 2.1 : -1]);
const s30 = { days: coin(30), meanR: 0.0333, perWeek: 5, trades: 30, dayCount: 30 };
const s300 = { days: coin(300), meanR: 0.0333, perWeek: 5, trades: 300, dayCount: 300 };
const r30 = L.run(s30, S, plan, { runs: 3000, histories: 30, perHistory: 300, searchRuns: 1500 });
const r300 = L.run(s300, S, plan, { runs: 3000, histories: 30, perHistory: 300, searchRuns: 1500 });
const w30 = r30.evRange[1] - r30.evRange[0], w300 = r300.evRange[1] - r300.evRange[0];
t('the range holds the headline', r30.evRange[0] <= r30.ev && r30.ev <= r30.evRange[1]);
t('ten times the history gives a clearly narrower range', w300 < w30 * 0.6, `${Math.round(w30)} → ${Math.round(w300)}`);

const be = r300.breakEven;
const prep300 = L.prepare(S, plan, s300);
const evAt = sh => L.simulate(s300.days, prep300, { runs: 6000, seed: 99, shift: sh, collect: false }).mean;
t('the break-even line was found', be.status === 'found', be.status);
t('at the break-even edge the average comes to about nothing', Math.abs(evAt(be.shift)) < 1500, Math.round(evAt(be.shift)));
t('a better edge is worth more, a worse one less', evAt(be.shift + 0.15) > 0 && evAt(be.shift - 0.15) < 0);
t('every account ends one of four ways, adding to 100%', near(Object.values(r300.rates).reduce((x, y) => x + y, 0), 1, 1e-9));

/* ===================== the page ===================== */
console.log('\npage');
const br = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await br.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'Australia/Perth' });
const p = await ctx.newPage();
await p.emulateMedia({ reducedMotion: 'reduce' });   // figures read at once; the motion is checked on its own
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(new Date('2026-09-29T10:00:00+08:00'));
await p.addInitScript(({ ACCT, TRADES, PB }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TRADES })],
    ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, TRADES, PB });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });

const settle = (ms = 300) => p.waitForTimeout(ms);
const text = sel => p.evaluate(s => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() ?? null, sel);
const hash = () => p.evaluate(() => location.hash);
const answered = () => p.waitForSelector('.lab-answer', { timeout: 15000 }).then(() => true, () => false);
const filed = () => p.evaluate(() => {
  const rows = JSON.parse(localStorage.getItem('fakefs') || '[]');
  const hit = rows.find(r => r[0] === 'data/lab.json');
  return hit ? JSON.parse(hit[1]) : null;
});
const strip = () => p.evaluate(() => [...document.querySelectorAll('.lab-strip .i b')].map(b => b.textContent.trim()));
const labelled = label => `.lab-f[data-need="${label.toLowerCase()}"] input`;
/* Type into a field and commit it the way a person does — Tab to the next. */
const type = async (label, v, nth = 0) => {
  const h = (await p.$$(labelled(label)))[nth];
  await h.click(); await h.fill(String(v)); await p.keyboard.press('Tab'); await settle(120);
};
const toRules = async () => { await p.click('.lab-rules-btn'); await settle(350); };
const done = async () => { await p.click('.head .btn-primary'); await settle(350); };
const seen = sel => p.evaluate(s => {
  const n = document.querySelector(s); if (!n) return 'missing';
  const pe = n.style.pointerEvents; n.style.pointerEvents = 'auto';
  try {
    const r = n.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return 'no size';
    if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) return 'off screen';
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !(hit === n || n.contains(hit))) return 'covered by ' + (hit?.className?.baseVal ?? hit?.className ?? hit?.tagName);
    for (let a = n.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const bx = a.getBoundingClientRect();
      if (r.top < bx.top - 1 || r.bottom > bx.bottom + 1 || r.left < bx.left - 1 || r.right > bx.right + 1) return 'clipped by ' + a.className;
    }
    return 'ok';
  } finally { n.style.pointerEvents = pe; }
}, sel);
/* The page's short money, to compare against the engine. */
const k$ = (v, { sign = false, short = false } = {}) => {
  const a = Math.abs(v);
  const pre = a < 0.5 ? '' : v < 0 ? '−' : sign ? '+' : '';
  const body = a >= (short ? 1000 : 10000) ? `${(a / 1000).toFixed(a >= 100000 ? 0 : 1)}k` : Math.round(a).toLocaleString('en-US');
  return `${pre}$${body}`;
};

const nav = await p.evaluate(() => [...document.querySelectorAll('.tb-tab')].map(a => a.textContent.trim()));
t('The Lab is in the top bar, after Analytics', nav.indexOf('Lab') === nav.indexOf('Analytics') + 1, nav.join(' / '));
await p.evaluate(() => { location.hash = '#/lab/prop'; }); await settle(600);

/* ---------- nothing filled in ---------- */
t('with no firm, it says what to do rather than showing a number', /No firm yet/.test(await text('.lab-body') || ''));
t('it reads live trades by default', await text('.lab-source .is-on') === 'Live');
t('the strip counts them: 15 live trades over 13 days, the open one left out', (await strip()).slice(0, 2).join(' ') === '15 13', (await strip()).join(' '));
t('and gives the edge with its margin', /^± 0\.\d\d$/.test(await text('.lab-strip .pm') || ''), await text('.lab-strip .pm'));
t('the answer page has no form on it', await p.evaluate(() => !document.querySelector('.lab-view input')));

await p.click('.lab-prompt .btn-primary'); await settle(350);
t('the prompt opens the rules, a page of their own', await hash() === '#/lab/rules', await hash());
t('the top bar still marks the Lab', await text('.tb-tab.is-on') === 'Lab');
await p.click('.lab-new'); await settle(300);
t('a new firm starts blank, and the page says how much is left', await text('.lab-status') === '6 to fill in', await text('.lab-status'));
t('nothing about the firm is filled in for you', await p.evaluate(() =>
  [...document.querySelectorAll('.lab-rcard')].filter(c => c.querySelector('h2')?.textContent !== 'Your plan')
    .flatMap(c => [...c.querySelectorAll('input')]).every(i => i.value === '')));
t('the required fields are picked out while empty', await p.evaluate(() => document.querySelectorAll('.lab-f.is-req.is-empty').length) === 6,
  await p.evaluate(() => document.querySelectorAll('.lab-f.is-req.is-empty').length));

/* ---------- filling it in ---------- */
await type('Account size', '100,000');
t('a typed field keeps the keyboard — Tab lands in the next field, the page is not rebuilt',
  await p.evaluate(() => document.activeElement?.closest('.lab-f')?.dataset.need) === 'evaluation fee',
  await p.evaluate(() => document.activeElement?.closest('.lab-f')?.dataset.need));
t('thousands separators are read', (await filed())?.firms?.[0]?.size === 100000, (await filed())?.firms?.[0]?.size);
await type('Profit target', '10');
t('a percentage shows what it is in money', await p.$eval('.lab-f[data-need="profit target"] .lab-hint', n => n.textContent) === '$10.0k');
await type('Evaluation fee', 'abc');
t('something that is not a number is refused and the field put back', await p.$eval(labelled('Evaluation fee'), i => i.value) === '');
await type('Evaluation fee', '579');
await type('Max drawdown', '10', 0);
await type('Max drawdown', '10', 1);
await type('Profit split', '90');
t('once the rules that decide it are in, the page says so', await text('.lab-status') === 'ready', await text('.lab-status'));

await done();
t('Done goes back to the answer', await hash() === '#/lab/prop');
await settle(300);
t('15 live trades over 13 days is enough now (10 is the floor): it answers', await answered());
const L0 = await import('../../src/js/lab.js');
t('the floor is 10 trades over 5 days', L0.MIN_TRADES === 10 && L0.MIN_DAYS === 5);

await p.evaluate(() => [...document.querySelectorAll('.lab-source button')].find(b => b.textContent === 'Both').click());
await settle(300);
t('Both brings in the forward tests: 27 trades over 22 days', (await strip()).slice(0, 2).join(' ') === '27 22', (await strip()).join(' '));
t('and the answer arrives without pressing anything', await answered());
t('the source is kept', (await filed())?.source === 'both');

/* ---------- the play: every time the page is opened (Laminar 3.1), not on a redraw ---------- */
await p.emulateMedia({ reducedMotion: 'no-preference' });
await p.evaluate(() => { location.hash = '#/analytics'; }); await settle(300);
await p.evaluate(() => { location.hash = '#/lab/prop'; }); await answered(); await settle(100);
const pp1 = await p.evaluate(() => !!document.querySelector('.lab-tiles.mo-play'));
await p.evaluate(() => { location.hash = '#/analytics'; }); await settle(300);
await p.evaluate(() => { location.hash = '#/lab/prop'; }); await answered(); await settle(100);
const pp2 = await p.evaluate(() => !!document.querySelector('.lab-tiles.mo-play') || !!document.querySelector('.lab-svgwrap.mo-play'));
await settle(2600);
await p.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange'))); await answered(); await settle(100);
const pp2b = await p.evaluate(() => !!document.querySelector('.lab-tiles.mo-play') || !!document.querySelector('.lab-svgwrap.mo-play'));
t('the answer plays when the page is opened, again when you come back, and not on a redraw with nothing changed', pp1 && pp2 && !pp2b, JSON.stringify({ pp1, pp2, pp2b }));
await p.evaluate(() => [...document.querySelectorAll('.lab-source button')].find(b => b.textContent === 'Live').click()); await answered(); await settle(100);
const pp3 = await p.evaluate(() => !!document.querySelector('.lab-tiles.mo-play'));
await p.emulateMedia({ reducedMotion: 'reduce' });
await p.evaluate(() => [...document.querySelectorAll('.lab-source button')].find(b => b.textContent === 'Both').click()); await answered(); await settle(100);
t('   a change that makes a new answer plays it again', pp3);
await p.emulateMedia({ reducedMotion: 'reduce' });

/* ---------- the answer is the engine's answer ---------- */
const firm = (await filed()).firms[0];
const both = L.sampleFrom(ACCT, TRADES);
const expect = L.run(both, firm, { riskEval: 1, riskFunded: 1, months: 6 });
const tiles = await text('.lab-tiles');
t('the headline is exactly what the engine says', tiles.includes(k$(expect.ev, { sign: true })), `${tiles} / expected ${k$(expect.ev, { sign: true })}`);
t('with its range underneath', tiles.includes(`${k$(expect.evRange[0], { sign: true, short: true })} to ${k$(expect.evRange[1], { sign: true, short: true })}`), tiles);
t('pass rate', tiles.includes((expect.passRate * 100).toFixed(1) + '%'));
t('paid rate', tiles.includes((expect.paidRate * 100).toFixed(1) + '%'));
t('the break-even edge, next to yours', /BREAK-EVEN EDGE [<>]?\s?[+−]\d\.\d\dR yours [+−]\d\.\d\dR/.test(tiles), tiles);
const ends = await p.evaluate(() => [...document.querySelectorAll('.lab-orow b')].map(b => parseFloat(b.textContent)));
t('the outcomes add up to 100%', Math.abs(ends.reduce((x, y) => x + y, 0) - 100) < 0.25, ends.join(' + '));
t('the answer is on screen and uncovered', await seen('.lab-tile .v') === 'ok', await seen('.lab-tile .v'));
const wordy = await p.evaluate(() => [...document.querySelectorAll('.lab-answer *')]
  .filter(n => n.children.length === 0 && (n.textContent || '').trim().split(/\s+/).length > 12).map(n => n.textContent.trim()));
t('no sentences of explanation on the answer page', wordy.length === 0, wordy.join(' | '));

/* ---------- the charts ---------- */
t('ninety accounts are drawn through the evaluation', await p.evaluate(() => document.querySelectorAll('.lab-paths path.lab-path').length) === 90);
t('with the target and the floor across them', await p.evaluate(() =>
  !!document.querySelector('.lab-paths .lab-level.is-target') && !!document.querySelector('.lab-paths .lab-level.is-floor')));
t('the payout curve has its median marked', /median \$/.test(await p.evaluate(() => document.querySelector('.lab-payout svg')?.textContent || '')));
t('the edge curve marks break-even and your edge', await p.evaluate(() =>
  !!document.querySelector('.lab-edge .lab-you') && /you [+−]\d\.\d\dR/.test(document.querySelector('.lab-edge svg').textContent)));
const hb = await p.$eval('.lab-paths .lab-hit', n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await p.mouse.move(hb.x + hb.w * 0.3, hb.y + hb.h / 2); await settle(150);
const read = await text('.lab-paths .lab-read');
t('pointing at a day reads out how every account stood by then', /^Day \d+ [\d.]+% passed [\d.]+% failed [\d.]+% still going$/.test(read || ''), read);
t('the readout is on screen and uncovered', await seen('.lab-paths .lab-read') === 'ok', await seen('.lab-paths .lab-read'));
/* Far right, where every failure there will be has happened, the readout
   must match the engine's own running shares for that day — including the
   failures, which are what "still going" is left after. */
await p.mouse.move(hb.x + hb.w * 0.97, hb.y + hb.h / 2); await settle(150);
const late = await text('.lab-paths .lab-read');
const day = Number((late || '').match(/^Day (\d+)/)?.[1]);
const cum = expect.evalChart.cum;
const at = arr => arr[Math.min(arr.length - 1, day)];
const pct1 = v => (v * 100).toFixed(1) + '%';
const want = `Day ${day} ${pct1(at(cum.pass))} passed ${pct1(at(cum.fail))} failed ${pct1(Math.max(0, 1 - at(cum.pass) - at(cum.fail)))} still going`;
t('and it is the engine\'s own count for that day', late === want && at(cum.fail) > 0, `${late} / ${want}`);
const eb = await p.$eval('.lab-edge .lab-hit', n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await p.mouse.move(eb.x + eb.w * 0.5, eb.y + eb.h / 2); await settle(150);
t('the edge curve reads out what an evaluation is worth at any edge', /[+−]\d\.\d\dR a trade [+−]?\$[\d,.k]+ per evaluation/.test(await text('.lab-edge .lab-read') || ''), await text('.lab-edge .lab-read'));
await p.mouse.move(5, 5);

/* ---------- the rules change the answer ---------- */
const before = await text('.lab-tile .v');
await toRules();
t('Rules opens the rule sheet', await hash() === '#/lab/rules');
await p.evaluate(() => [...document.querySelectorAll('.lab-seg button')].find(b => b.textContent === '2-step').click());
await settle(250);
t('two steps asks for a second target', await p.$(labelled('Step 2 target')) !== null && await text('.lab-status') === '1 to fill in');
await done();
t('and the answer waits for it', /step 2 target/.test(await text('.lab-body') || ''), await text('.lab-body'));
await toRules();
await type('Step 2 target', '5');
await done();
await answered();
t('changing the rules gives a new answer', await text('.lab-tile .v') !== before, `${before} → ${await text('.lab-tile .v')}`);
t('and the evaluation chart says it shows step 1', /Evaluation · step 1/.test(await text('.lab-paths') || ''));

await toRules();
await p.selectOption('.lab-rcard .lab-f select >> nth=0', 'eod');
await settle(200);
t('a trailing drawdown offers to stop at the starting balance', /Trailing stops at starting balance/.test(await text('.lab-rules') || ''));
await p.selectOption('.lab-rcard .lab-f select >> nth=1', 'eod');
await settle(200);
await p.evaluate(() => [...document.querySelectorAll('.lab-toggle')].filter(b => /Trailing stops/.test(b.textContent))[1].click());
await settle(200);
t('a locked funded floor offers "pay only once it reaches the start"', /Pay only once the floor reaches the start/.test(await text('.lab-rules') || ''));
t('and every change is saved as it is made', (await filed()).firms[0].funded.lock === true && (await filed()).firms[0].steps === 2);
await done();

/* ---------- it follows the journal ---------- */
await answered();
await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  store.trades.push({ id: 'NEW', accountId: 'acc_1', date: '2026-09-29', timeOpen: '15:00', timeClose: '16:00', pair: 'XAUUSD',
    side: 'buy', netResult: 3000, riskPercent: 1, status: 'closed', mode: 'live', tagIds: [] });
  location.hash = '#/trades';
});
await settle(300);
await p.evaluate(() => { location.hash = '#/lab/prop'; }); await settle(300);
t('a newly logged trade is in the next answer by itself', (await strip()).slice(0, 2).join(' ') === '28 23', (await strip()).join(' '));
t('and the answer is worked out again', await answered());

/* ---------- it survives a restart ---------- */
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
await p.evaluate(() => { location.hash = '#/lab/rules'; }); await settle(400);
t('after a restart the firm and its rules are still there',
  await p.$eval('.lab-name', i => i.value) === 'Firm 1' && await p.$eval(labelled('Step 2 target'), i => i.value) === '5');

/* ---------- several firms, and deleting one ---------- */
await p.click('.lab-new'); await settle(200);
t('a second firm can be added', (await filed()).firms.length === 2);
await p.fill('.lab-name', 'The other one'); await p.keyboard.press('Enter'); await settle(200);
t('and named', (await filed()).firms[1].name === 'The other one');
await done();
t('with two firms, the answer page lets you pick between them', await p.evaluate(() =>
  [...document.querySelectorAll('.lab-firm option')].map(o => o.textContent).join(',')) === 'Firm 1,The other one');
await toRules();
await p.click('.lab-del'); await settle(150);
t('delete asks first', (await filed()).firms.length === 2 && /Confirm delete/.test(await text('.lab-del') || ''));
await p.click('.lab-del'); await settle(300);
t('and then deletes', (await filed()).firms.length === 1 && (await filed()).firms[0].name === 'Firm 1');
t('and the rules go back to the firm that is left', await p.$eval('.lab-name', i => i.value) === 'Firm 1');

/* ---------- a sheet written by hand, or by an older copy ---------- */
await p.evaluate(async () => {
  const { store } = await import('/js/store.js');
  store.data.lab = { firms: [{ id: 'old', name: 'Old', size: 50000, eval: { dd: 5 } }], source: 'sideways' };
  store.heal();
});
const healed = await p.evaluate(async () => { const { store } = await import('/js/store.js'); return store.data.lab; });
t('an incomplete sheet is filled out with empty fields, keeping what it had',
  healed.firms[0].size === 50000 && healed.firms[0].eval.dd === 5 && healed.firms[0].eval.ddType === 'static' && healed.firms[0].funded.split === null);
t('an unknown source reads as live', healed.source === 'live');
t('and a missing plan gets the default', healed.plan && healed.plan.months === 6);

await p.screenshot({ path: OUT + '/lab.png' });
t('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await br.close();
