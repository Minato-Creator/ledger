/* Analytics → Overview and Timing, redrawn.

   Every figure on both pages is worked out again here, from the trades,
   without the app's code, and the page has to agree: the six tiles, the
   equity curve under the crosshair, every bin of the R spread, each setup
   and instrument, every cell of the week, each session, and the first trade
   of a day against the fourth. The small pieces the pages are built from
   are checked by hand on trades short enough to add up in your head. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB, makeTrades } from '../fixtures/ghost-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

/* ---------- the trades, and every number worked out again ---------- */
const TR = makeTrades();
const key = x => x.date + (x.timeOpen || '99:99');
const seq = TR.slice().sort((a, b) => key(a).localeCompare(key(b)));
const N = seq.length;
const $ = v => { const a = Math.round(Math.abs(v)); const s = '$' + a.toLocaleString('en-US'); return a === 0 ? s : (v < 0 ? '−' : '+') + s; };
const R2 = v => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2) + 'R';
const outcome = x => (x.netResult > 0 ? 'win' : x.netResult < 0 ? 'loss' : 'be');
const net = seq.reduce((a, x) => a + x.netResult, 0);
const wins = seq.filter(x => outcome(x) === 'win').length, losses = seq.filter(x => outcome(x) === 'loss').length;
let eq = 0, peak = 0, worst = 0;
const cum = seq.map(x => { eq += x.netResult; peak = Math.max(peak, eq); worst = Math.min(worst, eq - peak); return { eq, dd: eq - peak }; });
let bw = 0, bl = 0, run = 0, kind = null;
for (const x of seq) { const o = outcome(x); if (o === kind) run++; else { kind = o; run = 1; } if (o === 'win') bw = Math.max(bw, run); else bl = Math.max(bl, run); }
const dow = d => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;

/* A readout, one string per row: "+$4,100 net", "7 trades · 43% won". */
const ROWS = `n => [...n.children].map(c => c.children.length ? [...c.children].map(x => x.textContent).filter(Boolean).join(' ') : c.textContent)`;
const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
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

/* ===================== the pieces, by hand ===================== */
console.log('pieces');
const pieces = await p.evaluate(async () => {
  const O = await import('/js/views/an-overview.js');
  const Tm = await import('/js/views/an-timing.js');
  const K = { valueOf: t => t.netResult };
  const A = { startingBalance: 100000 };
  const T = (date, time, n) => ({ date, timeOpen: time, timeClose: time, netResult: n, riskPercent: 1, status: 'closed' });
  /* +2, −1, −3, +1, +4 — a high of 2, down to −2, back to 3. */
  const tr = [T('2026-09-14', '15:00', 2), T('2026-09-14', '16:00', -1), T('2026-09-15', '09:00', -3),
              T('2026-09-15', '10:00', 1), T('2026-09-16', '15:30', 4)];
  const rows = O.sequence(A, tr, K);
  const dd = O.deepest(rows);
  const st = O.streaks(rows);
  const B = O.rBins([-1, -1, -0.9, -0.1, 0, 0.1, 2.2, 3]);
  for (const r of [-1, -1, -0.9, -0.1, 0, 0.1, 2.2, 3]) B.place(r).count++;
  const G = Tm.grid(Tm.timed(A, tr, K));
  const P = Tm.positions(Tm.timed(A, tr, K));
  /* A fall that starts before the first trade: the high it fell from is the start. */
  const early = O.deepest(O.sequence(A, [T('2026-09-14', '15:00', -2), T('2026-09-14', '16:00', 1)], K));
  return {
    eq: rows.map(x => x.eq), dd: rows.map(x => x.dd), deep: dd, st, early,
    bins: { w: B.w, mids: B.bins.map(x => x.mid), counts: B.bins.map(x => x.count) },
    grid: { days: G.days, cols: G.cols, mon15: G.cells[0][15 - G.cols[0]], tue9: G.cells[1][9 - G.cols[0]], wed: G.byDay[2], h15: G.byHour[15 - G.cols[0]] },
    pos: P.map(x => [x.pos, x.count, x.net]),
  };
});
t('equity is the running total', JSON.stringify(pieces.eq) === '[2,1,-2,-1,3]', JSON.stringify(pieces.eq));
t('drawdown is the distance below the last high', JSON.stringify(pieces.dd) === '[0,-1,-4,-3,0]', JSON.stringify(pieces.dd));
t('the deepest fall is −4, from the first trade to the third', pieces.deep.amount === -4 && pieces.deep.from === 0 && pieces.deep.to === 2, JSON.stringify(pieces.deep));
t('a fall from the very start is measured from the start', pieces.early.amount === -2 && pieces.early.from === -1, JSON.stringify(pieces.early));
t('streaks: two wins, two losses, and on two wins now', pieces.st.bestW === 2 && pieces.st.bestL === 2 && pieces.st.now === 2 && pieces.st.nowKind === 'win', JSON.stringify(pieces.st));
t('R bins are a quarter wide when the spread is small', pieces.bins.w === 0.25, String(pieces.bins.w));
t('and every result lands in exactly one', pieces.bins.counts.reduce((a, b) => a + b, 0) === 8);
const atBin = m => pieces.bins.counts[pieces.bins.mids.findIndex(x => Math.abs(x - m) < 1e-9)];
t('each bin is centred on its value: −1 and −0.9 together', atBin(-1) === 3, JSON.stringify(pieces.bins));
t('−0.1, 0 and +0.1 all in the middle one', atBin(0) === 3, JSON.stringify(pieces.bins));
t('+2.2 in the +2.25 bin, not the +2', atBin(2.25) === 1 && atBin(2) === 0, JSON.stringify(pieces.bins));
t('the week runs Mon–Fri and from the first hour traded to the last', JSON.stringify(pieces.grid.days) === '[0,1,2,3,4]'
  && pieces.grid.cols[0] === 9 && pieces.grid.cols[pieces.grid.cols.length - 1] === 16, JSON.stringify(pieces.grid.cols));
t('Mon 15:00 holds the +2', pieces.grid.mon15.count === 1 && pieces.grid.mon15.net === 2);
t('Tue 09:00 holds the −3', pieces.grid.tue9.count === 1 && pieces.grid.tue9.net === -3);
t('Wednesday adds to +4, and 15:00 across the week to +6', pieces.grid.wed.net === 4 && pieces.grid.h15.net === 6 && pieces.grid.h15.count === 2);
t('first trades of the day: three, making +3', JSON.stringify(pieces.pos[0]) === '[1,3,3]', JSON.stringify(pieces.pos));
t('second trades: two, making zero', JSON.stringify(pieces.pos[1]) === '[2,2,0]', JSON.stringify(pieces.pos));

/* ===================== Overview ===================== */
console.log('overview');
await p.evaluate(() => { location.hash = '#/analytics'; }); await p.waitForTimeout(600);
await p.evaluate(() => [...document.querySelectorAll('.head :is(.seg, .an-tabs) button')].find(b => b.textContent.trim() === 'Overview').click());
await p.evaluate(() => [...document.querySelectorAll('.head :is(.seg, .an-tabs) button')].find(b => b.textContent.trim() === 'All').click());
await p.waitForTimeout(900);

const tiles = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.an-tile')].map(n =>
  [n.querySelector('.k').textContent, { v: n.querySelector('.v').textContent, s: n.querySelector('.s').textContent }])));
t('six figures across the top', Object.keys(tiles).length === 6, Object.keys(tiles).join(', '));
t('Net is every trade added up', tiles.Net?.v === $(net), `${tiles.Net?.v} vs ${$(net)}`);
t('Win rate counts wins against losses', tiles['Win rate']?.v === (wins / (wins + losses) * 100).toFixed(1) + '%' && tiles['Win rate'].s.startsWith(`${wins}W · ${losses}L`), JSON.stringify(tiles['Win rate']));
t('Expectancy is the net over the count', tiles.Expectancy?.v === $(net / N), `${tiles.Expectancy?.v} vs ${$(net / N)}`);
t('Max drawdown is the deepest fall from a high', tiles['Max drawdown']?.v === $(worst), `${tiles['Max drawdown']?.v} vs ${$(worst)}`);
t('and says where you are now', tiles['Max drawdown']?.s === (cum[N - 1].dd < 0 ? `now ${$(cum[N - 1].dd)}` : 'at a high'), tiles['Max drawdown']?.s);
t('Streaks are the longest runs', tiles.Streaks?.v.replace(/\s/g, '') === `${bw}W/${bl}L`, tiles.Streaks?.v);
t('each figure but one carries its curve, and streaks their tape', await p.evaluate(() =>
  document.querySelectorAll('.an-tile .an-spark').length === 5 && document.querySelectorAll('.an-tile .an-tape rect').length === 40));

/* The crosshair on the equity curve. */
const readout = () => p.evaluate(() => { const n = [...document.querySelectorAll('.lab-read')].find(x => !x.hidden); return n ? n.innerText : null; });
const visible = () => p.evaluate(() => {
  const n = [...document.querySelectorAll('.lab-read')].find(x => !x.hidden);
  if (!n) return 'none';
  n.style.pointerEvents = 'auto';
  const r = n.getBoundingClientRect();
  const hits = [[r.left + 4, r.top + 4], [r.right - 4, r.bottom - 4]].every(([x, y]) => n.contains(document.elementFromPoint(x, y)));
  n.style.pointerEvents = '';
  return hits && r.right <= innerWidth && r.bottom <= innerHeight ? 'ok' : `clipped ${JSON.stringify(r)}`;
});
const eqBox = await p.evaluate(() => { const r = document.querySelector('.an-equity .lab-hit').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
for (const k of [0, Math.floor(N / 2), N - 1]) {
  await p.mouse.move(eqBox.x + ((k + 1) / N) * eqBox.w - 0.5, eqBox.y + eqBox.h / 3);
  await p.waitForTimeout(60);
  const txt = await readout();
  t(`the crosshair at trade ${k + 1} reads that trade's equity`, txt && txt.includes(`trade ${k + 1}`) && txt.includes($(cum[k].eq)),
    `${(txt || '').replace(/\n/g, ' | ')} — want ${$(cum[k].eq)}`);
  t('   its drawdown', txt && txt.includes(cum[k].dd < 0 ? $(cum[k].dd) : 'at high'));
  t('   and what the trade itself did', txt && txt.includes($(seq[k].netResult)));
}
t('and the readout is on screen, over everything', await visible() === 'ok', await visible());
await p.mouse.move(5, 5);

/* The R spread: each bin's count, read off its own readout. */
const bins = await p.evaluate((ROWS) => { const rowsOf = eval(ROWS);
  const out = [];
  for (const h of document.querySelectorAll('.an-dist .an-hit')) {
    h.dispatchEvent(new PointerEvent('pointerenter'));
    const n = [...document.querySelectorAll('.an-dist .lab-read')].find(x => !x.hidden);
    const lines = rowsOf(n);
    out.push({ head: lines[0], count: Number(lines[1].split(' ')[0]) });
    h.dispatchEvent(new PointerEvent('pointerleave'));
  }
  return out;
}, ROWS);
t('the bins hold every trade once', bins.reduce((a, x) => a + x.count, 0) === N, `${bins.reduce((a, x) => a + x.count, 0)} of ${N}`);
const fullLoss = seq.filter(x => x.netResult === -1000).length;
const lossBin = bins.find(x => /^−1\.\d\d to −0\.\d\dR$/.test(x.head) && x.head.startsWith('−1.'));
t('the −1R bin holds every full loss', lossBin?.count === fullLoss, `${JSON.stringify(lossBin)} vs ${fullLoss}`);
t('bars are drawn only where there is something', await p.evaluate(() => document.querySelectorAll('.an-dist .an-bin').length) === bins.filter(x => x.count).length);
t('the three averages are marked', await p.evaluate(() => document.querySelectorAll('.an-dist .an-mark').length === 3 && /expectancy/.test(document.querySelector('.an-dist .an-marks').innerText)));

/* Setups and instruments. */
const by = (k) => { const m = new Map(); for (const x of seq) { const g = m.get(x[k]) || { n: 0, net: 0, w: 0, l: 0 }; g.n++; g.net += x.netResult; if (x.netResult > 0) g.w++; else if (x.netResult < 0) g.l++; m.set(x[k], g); } return m; };
const setups = by('setupId'), pairs = by('pair');
const board = await p.evaluate(() => [...document.querySelectorAll('.an-board .an-brow')].map(r => r.innerText.replace(/\n/g, ' | ')));
t('By setup: one row a setup, best first', board.length === setups.size && /FVG continuation/.test(board[0]) === (setups.get('s_fvg').net >= setups.get('s_sweep').net), board.join(' ‖ '));
for (const [id, g] of setups) {
  const name = PB.setups.find(s => s.id === id).name;
  const row = board.find(r => r.startsWith(name));
  t(`   ${name}: ${g.n} trades, ${Math.round(g.w / (g.w + g.l) * 100)}% won`, row && row.includes(`${g.n} · ${Math.round(g.w / (g.w + g.l) * 100)}%`), row);
}
t('   one line each in the race, in the setup\'s own colour', await p.evaluate(() =>
  [...document.querySelectorAll('.an-setups .an-race')].map(n => n.style.stroke).sort().join(',')) ===
  PB.setups.map(s => s.color).map(h => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`).sort().join(','));
const inst = await p.evaluate(() => [...document.querySelectorAll('.an-inst .an-irow:not(.is-head)')].map(r => r.innerText.replace(/\n/g, ' | ')));
t('By instrument: one row each', inst.length === pairs.size, inst.join(' ‖ '));
for (const [pair, g] of pairs) {
  const row = inst.find(r => r.startsWith(pair));
  t(`   ${pair}: ${$(g.net)} over ${g.n}`, row && row.includes($(g.net)) && row.includes(`${g.n} trades`) && row.includes(`${Math.round(g.w / (g.w + g.l) * 100)}%`), row);
}
await p.screenshot({ path: OUT + '/anviz-overview.png' });

/* ===================== Timing ===================== */
console.log('timing');
await p.evaluate(() => [...document.querySelectorAll('.head :is(.seg, .an-tabs) button')].find(b => b.textContent.trim() === 'Timing').click());
await p.waitForTimeout(900);
const hours = seq.map(x => Number(x.timeOpen.slice(0, 2)));
const h0 = Math.min(...hours), h1 = Math.max(...hours);
const cells = await p.evaluate((ROWS) => { const rowsOf = eval(ROWS);
  const out = [];
  for (const c of document.querySelectorAll('.an-heat .an-cell')) {
    c.dispatchEvent(new PointerEvent('pointerenter'));
    const n = [...document.querySelectorAll('.an-heat .lab-read')].find(x => !x.hidden);
    out.push(rowsOf(n));
    c.dispatchEvent(new PointerEvent('pointerleave'));
  }
  return out;
}, ROWS);
t('a cell for every weekday and every hour between the first and last', cells.length === 5 * (h1 - h0 + 1), `${cells.length} vs ${5 * (h1 - h0 + 1)}`);
let cellTotal = 0, bad = [];
const DAYNAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
for (const lines of cells) {
  const [dn, hr] = lines[0].split(' · ');
  const d = DAYNAMES.indexOf(dn), h = Number(hr.slice(0, 2));
  const mine = seq.filter(x => dow(x.date) === d && Number(x.timeOpen.slice(0, 2)) === h);
  const n = mine.length ? Number(lines[2].split(' ')[0]) : 0;
  cellTotal += n;
  if (mine.length && (lines[1] !== $(mine.reduce((a, x) => a + x.netResult, 0)) + ' net' || n !== mine.length)) bad.push(lines.join('/'));
  if (!mine.length && lines[1] !== 'no trades') bad.push(lines.join('/'));
}
t('every cell\'s total and count is right', bad.length === 0, bad.slice(0, 3).join(' ‖ '));
t('and between them they hold every trade', cellTotal === N, `${cellTotal} of ${N}`);
const lit = await p.evaluate(() => [...document.querySelectorAll('.an-heat .an-cell')].map(c => ({ e: c.classList.contains('is-empty'), f: getComputedStyle(c).fill })));
t('an hour with trades is lit, and an empty one is not', lit.every(x => x.e ? /128, 128, 128/.test(x.f) : !/128, 128, 128/.test(x.f)), JSON.stringify(lit.slice(0, 3)));
const dayLbls = await p.evaluate(() => [...document.querySelectorAll('.an-heat .an-marg-lbl')].map(n => n.textContent));
const dayNet = [0, 1, 2, 3, 4].map(d => seq.filter(x => dow(x.date) === d).reduce((a, x) => a + x.netResult, 0));
const short = v => { const a = Math.abs(v); const b = a >= 1000 ? '$' + (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : '$' + Math.round(a); return (v < 0 ? '−' : '+') + b; };
t('each day\'s total down the right', JSON.stringify(dayLbls) === JSON.stringify(dayNet.map(short)), `${dayLbls.join(' ')} vs ${dayNet.map(short).join(' ')}`);
t('your sessions are marked over the hours they cover', await p.evaluate(() =>
  [...document.querySelectorAll('.an-heat .an-sess-lbl')].map(n => n.textContent).sort().join(',')) === 'London,New York');

const sess = await p.evaluate(() => [...document.querySelectorAll('.an-stile')].map(n => n.innerText.replace(/\n/g, ' | ')));
const sesBy = by('sessionId');
t('By session: a tile each', sess.length === sesBy.size, sess.join(' ‖ '));
for (const [id, g] of sesBy) {
  const name = PB.sessions.find(s => s.id === id).name;
  const tile = sess.find(x => x.startsWith(name));
  t(`   ${name}: ${$(g.net)}, ${g.n} trades`, tile && tile.includes($(g.net)) && tile.includes(`${g.n} trades`), tile);
}

/* The first trade of the day against the rest. */
const seen = new Map(), pos = [0, 1, 2, 3].map(() => ({ n: 0, net: 0 }));
for (const x of seq) { const k = (seen.get(x.date) || 0) + 1; seen.set(x.date, k); const g = pos[Math.min(k, 4) - 1]; g.n++; g.net += x.netResult; }
const cols = await p.evaluate((ROWS) => { const rowsOf = eval(ROWS);
  const out = [];
  for (const h of document.querySelectorAll('.an-pos .an-hit')) {
    h.dispatchEvent(new PointerEvent('pointerenter'));
    out.push(rowsOf([...document.querySelectorAll('.an-pos .lab-read')].find(x => !x.hidden)));
    h.dispatchEvent(new PointerEvent('pointerleave'));
  }
  return out;
}, ROWS);
t('one column for each position in the day', cols.length === pos.filter(g => g.n).length, String(cols.length));
pos.forEach((g, i) => {
  const c = cols[i];
  t(`   ${['1st', '2nd', '3rd', '4th or later'][i]}: ${$(g.net / g.n)} on average over ${g.n}`,
    c && c[1].startsWith($(g.net / g.n)) && c[2].startsWith($(g.net)) && c[2].endsWith(`across ${g.n}`), (c || []).join(' / '));
});
t('a dot for every trade with a close time', await p.evaluate(() => document.querySelectorAll('.an-hold .an-dot').length) === seq.filter(x => x.timeClose).length);

/* The nearest dot answers the pointer. */
const dot = await p.evaluate(() => { const r = document.querySelector('.an-hold .an-dot').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await p.mouse.move(dot.x + 3, dot.y + 2); await p.waitForTimeout(60);
const dotTxt = await readout();
t('pointing at a dot names the trade and how long it was held', !!dotTxt && /held/.test(dotTxt) && /result/.test(dotTxt), dotTxt);
t('and its readout is on screen', await visible() === 'ok', await visible());
await p.mouse.move(5, 5);
await p.screenshot({ path: OUT + '/anviz-timing.png' });

/* In R. */
await p.evaluate(() => [...document.querySelectorAll('.unit-switch button')].find(b => b.textContent.trim() === 'R').click());
await p.waitForTimeout(700);
const netR = seq.reduce((a, x) => a + x.netResult / 1000, 0);
const sesR = await p.evaluate(() => [...document.querySelectorAll('.an-stile b')].map(n => n.textContent));
t('switched to R, the sessions read in R', sesR.every(s => /R$/.test(s)), sesR.join(' '));
await p.evaluate(() => [...document.querySelectorAll('.head :is(.seg, .an-tabs) button')].find(b => b.textContent.trim() === 'Overview').click());
await p.waitForTimeout(700);
const netTile = await p.evaluate(() => document.querySelector('.an-tile .v').textContent);
t('and the Net tile in R', netTile === R2(netR), `${netTile} vs ${R2(netR)}`);
t('its axis says 0R, not 0.0R', await p.evaluate(() => [...document.querySelectorAll('.an-equity .lab-tick')].some(n => n.textContent === '0R')
  && ![...document.querySelectorAll('.main .lab-tick')].some(n => /\.0R$/.test(n.textContent))));

/* ===================== nothing to go on ===================== */
console.log('bare');
const p2 = await b.newPage({ viewport: { width: 1280, height: 800 } });
p2.on('pageerror', e => errs.push(e.message));
await p2.addInitScript(({ ACCT }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  const T = (id, date, n) => ({ id, accountId: 'acc_1', date, pair: 'XAUUSD', side: 'buy', netResult: n, status: 'closed', mode: 'live', tagIds: [] });
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: [T('x', '2026-09-28', 400), T('y', '2026-09-29', -150)] })]]));
}, { ACCT });
await p2.addInitScript(FAKE_FS);
await p2.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p2.waitForSelector('.topbar', { timeout: 8000 });
await p2.evaluate(() => { location.hash = '#/analytics'; }); await p2.waitForTimeout(700);
const bare = await p2.evaluate(() => document.querySelector('.main').innerText);
t('two trades with no risk or times: Overview still draws', /Equity/.test(bare) && /\+\$250/.test(bare), bare.slice(0, 120));
t('   and the R spread says what it needs', /Needs a risk %/.test(bare));
await p2.evaluate(() => [...document.querySelectorAll('.head :is(.seg, .an-tabs) button')].find(b => b.textContent.trim() === 'Timing').click());
await p2.waitForTimeout(600);
const bareT = await p2.evaluate(() => document.querySelector('.main').innerText);
t('   Timing asks for open times instead of drawing an empty week', /Add an open time/.test(bareT) && /Needs an open and a close time/.test(bareT));

t('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
