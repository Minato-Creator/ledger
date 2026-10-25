/* New trade's questions, carried through the app.

   Confidence, feeling after, exit reason, timeframe, mistakes, price
   delivery — and "if held to target" for a trade cut short — read back on
   the trade page, written to and read from the CSV, asked again in the
   weekly review and added up there, filtered on the Trades page, played by
   the Ghost, and counted as clean wins on the dashboard. The small pieces
   are checked by hand first; the pages are then checked against figures
   worked out here without the app's code. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB, makeTrades } from '../fixtures/ghost-fixture.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };
const near = (a, b, e = 1e-9) => a != null && b != null && Math.abs(a - b) < e;

/* ---------- the trades ---------- */
const TFS = ['1m', '5m', '15m'];
const TR = makeTrades().map((x, i) => {
  if (i < 40) return x;                                   // logged before the questions
  const win = x.netResult > 0, loss = x.netResult < 0;
  const q = { confidence: 1 + (i * 7) % 5, emotionAfter: win ? 4 : 2, execTf: TFS[i % 3], delivery: ['good', 'neutral', 'poor'][i % 3],
    exitReason: win ? 'tp' : loss ? 'sl' : 'be', mistakes: i % 4 === 0 ? ['early_entry'] : i % 5 === 0 ? ['wrong_bias', 'bad_sl'] : [] };
  /* Every seventh is cut short by hand, and most of those say what holding would have made. */
  if (i % 7 === 0) {
    q.exitReason = 'manual'; q.mistakes = ['closed_early'];
    if (i % 14 === 0) { q.heldOutcome = 'win'; q.heldR = 3; } else if (i % 21 === 0) { q.heldOutcome = 'loss'; q.heldR = -1; } else if (i % 3 === 0) { q.heldOutcome = 'be'; q.heldR = 0; }
  }
  return { ...x, ...q };
});
const R = x => x.netResult / (ACCT.startingBalance * x.riskPercent / 100);
const RR = (v, d = 1) => `${v > 0.0005 ? '+' : v < -0.0005 ? '−' : ''}${Math.abs(v).toFixed(d)}R`;
const order = TR.slice().sort((a, b) => (a.date + (a.timeOpen || '99:99')).localeCompare(b.date + (b.timeOpen || '99:99')));
const heldR = x => x.heldOutcome === 'be' ? 0 : x.heldOutcome === 'win' ? Math.abs(x.heldR) : x.heldOutcome === 'loss' ? -Math.abs(x.heldR) : null;
const REAL = order.reduce((a, x) => a + R(x), 0);
const HELD_NET = order.reduce((a, x) => a + (x.heldOutcome ? heldR(x) : R(x)), 0);
const HELD_N = order.filter(x => x.heldOutcome).length;
const CONF4 = order.filter(x => x.confidence != null && x.confidence >= 4);
const CLEAN_WINS = TR.filter(x => x.netResult > 0 && Array.isArray(x.mistakes) && !x.mistakes.length);
const ASKED_WINS = TR.filter(x => x.netResult > 0 && Array.isArray(x.mistakes));

const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(new Date('2026-09-20T10:00:00'));
await p.addInitScript(({ ACCT, TR, PB }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: 'R', theme: 'dark', accounts: [ACCT], activeAccountId: 'acc_1' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, TR, PB });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 300) => p.waitForTimeout(ms);
const go = async (h, ms = 500) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };
const onDisk = () => p.evaluate(() => JSON.parse(window.__files.get('data/trades.json')).trades);

/* ===================== the pieces, by hand ===================== */
console.log('by hand');
const H = await p.evaluate(async () => {
  const Q = await import('/js/questions.js');
  const G = await import('/js/ghost.js');
  const { matchesQuestions } = await import('/js/views/trades.js');
  const { weekHabits } = await import('/js/views/review.js');
  const asked = [
    Q.heldAsked({ status: 'closed', exitReason: 'manual' }), Q.heldAsked({ status: 'closed', exitReason: 'tp', mistakes: ['closed_early'] }),
    Q.heldAsked({ status: 'closed', mistakes: ['be_early'] }), Q.heldAsked({ status: 'closed', exitReason: 'tp', mistakes: ['early_entry'] }),
    Q.heldAsked({ status: 'open', exitReason: 'manual' })];
  const of = [Q.heldOf({ heldOutcome: 'win', heldR: -2.5 }), Q.heldOf({ heldOutcome: 'loss', heldR: 1 }), Q.heldOf({ heldOutcome: 'be', heldR: null }),
    Q.heldOf({ heldOutcome: 'win', heldR: null }), Q.heldOf({ heldOutcome: 'moon', heldR: 2 })];
  const text = [Q.heldText({ outcome: 'win', r: 2.5 }), Q.heldText({ outcome: 'loss', r: -1 }), Q.heldText({ outcome: 'be', r: 0 })];
  const full = { status: 'closed', confidence: 4, emotionAfter: 2, exitReason: 'manual', heldOutcome: 'loss', heldR: 1.5, execTf: '15m', mistakes: ['wrong_bias', 'closed_early'], delivery: 'poor' };
  const cells = Q.questionCells(full);
  const back = Q.readQuestions(Object.fromEntries(Q.QUESTION_COLUMNS.map((k, i) => [k, String(cells[i])])));
  const none = Q.readQuestions({ mistakes: 'None' }), blank = Q.readQuestions({ mistakes: '', confidence: '' });
  const words = Q.readQuestions({ Confidence: 'solid', 'Exit reason': 'TP', execTf: '1h', delivery: 'GOOD', mistakes: 'early entry; junk', heldOutcome: 'Win', heldR: '2' });
  const openCells = Q.questionCells({ status: 'open', confidence: 3, emotionAfter: 4, exitReason: 'tp' });

  /* The ghost: five trades, in a day each. */
  const A = { startingBalance: 100000 };
  const T = (d, net, f) => ({ date: '2026-09-0' + d, timeOpen: '10:00', netResult: net, riskPercent: 1, status: 'closed', ...f });
  const tr = [T(1, 1000, { confidence: 5, execTf: '5m' }), T(2, -1000, { confidence: 2, execTf: '1m' }),
    T(3, 500, { confidence: 4, execTf: '5m', exitReason: 'manual', heldOutcome: 'win', heldR: 3 }),
    T(4, 0, { confidence: 3, mistakes: ['be_early'], heldOutcome: 'loss', heldR: 1 }), T(5, 2000, {})];
  const { rows } = G.rowsFrom(A, tr);
  const keep = R => G.apply(rows, { ...G.blankRules(), ...R }).map(Number).join('');
  const hold = G.run(rows, { ...G.blankRules(), holdToTarget: true });
  const both = G.run(rows, { ...G.blankRules(), holdToTarget: true, minConfidence: 4 });
  const fx = G.run(rows, { ...G.blankRules(), holdToTarget: true }).effects;

  const F = { mistake: 'all', exit: 'all', conf: 'all', tf: 'all' };
  const m = (x, f) => matchesQuestions(x, { ...F, ...f });
  const flt = [m({ mistakes: [] }, { mistake: 'none' }), m({}, { mistake: 'none' }), m({ mistakes: ['bad_sl'] }, { mistake: 'any' }),
    m({ mistakes: ['bad_sl'] }, { mistake: 'early_entry' }), m({ confidence: 4 }, { conf: '4+' }), m({ confidence: 3 }, { conf: '4+' }),
    m({}, { conf: '4+' }), m({ confidence: 2 }, { conf: '2-' }), m({ execTf: '5m' }, { tf: '5m' }), m({ exitReason: 'sl' }, { exit: 'tp' })];

  const row = (o, mi, v) => ({ o, v, r: v, t: { mistakes: mi } });

  const hb = weekHabits(A, [T(1, 1000, { mistakes: [], confidence: 4, emotionAfter: 5 }), T(2, -1000, { mistakes: ['early_entry'], confidence: 2, emotionAfter: 1 }),
    T(3, 500, { mistakes: ['closed_early'], exitReason: 'manual', heldOutcome: 'win', heldR: 3, confidence: 3 }), T(4, 0, {})]);
  return { asked, of, text, cells, back, none, blank, words, openCells,
    keep: { c4: keep({ minConfidence: 4 }), tf: keep({ tfs: ['5m'] }), c5tf: keep({ minConfidence: 5, tfs: ['1m'] }) },
    hold: { net: hold.ghost.net, real: hold.real.net, held: hold.ghost.held, skipped: hold.ghost.skipped, wr: hold.ghost.winRate },
    both: { net: both.ghost.net, trades: both.ghost.trades, held: both.ghost.held }, fx: fx.map(f => [f.key, f.delta, f.note]),
    flt, hb };
});
t('asked when closed by hand, closed early or moved to BE early', JSON.stringify(H.asked) === '[true,true,true,false,false]', JSON.stringify(H.asked));
t('a held win is plus, a held loss minus, whatever sign was typed', near(H.of[0].r, 2.5) && near(H.of[1].r, -1) && H.of[2].r === 0, JSON.stringify(H.of));
t('a win with no number, or a made-up answer, is no answer', H.of[3] === null && H.of[4] === null);
t('read as Win · +2.5R, Loss · −1R, BE · 0R', H.text.join('|') === 'Win · +2.5R|Loss · −1R|BE · 0R', H.text.join('|'));
t('CSV cells are words a person reads', JSON.stringify(H.cells) === JSON.stringify([4, 2, 'Closed manually', 'Loss', -1.5, '15m', 'Closed early;Wrong bias', 'Poor', '', '']), JSON.stringify(H.cells));
t('and read back to the same answers', H.back.confidence === 4 && H.back.emotionAfter === 2 && H.back.exitReason === 'manual' && H.back.heldOutcome === 'loss'
  && H.back.heldR === -1.5 && H.back.execTf === '15m' && JSON.stringify(H.back.mistakes) === '["closed_early","wrong_bias"]' && H.back.delivery === 'poor', JSON.stringify(H.back));
t('"None" reads as no mistakes; a blank as never asked', JSON.stringify(H.none) === '{"mistakes":[]}' && JSON.stringify(H.blank) === '{}', JSON.stringify([H.none, H.blank]));
t('words or keys, in any case; junk is dropped', H.words.confidence === 4 && H.words.exitReason === 'tp' && H.words.execTf === '1H' && H.words.delivery === 'good'
  && JSON.stringify(H.words.mistakes) === '["early_entry"]' && H.words.heldR === 2, JSON.stringify(H.words));
t('a running trade exports no feeling after and no exit', H.openCells[0] === 3 && H.openCells[1] === '' && H.openCells[2] === '');
t('ghost: confidence 4+ keeps the 5 and the 4, not the unrated', H.keep.c4 === '10100', H.keep.c4);
t('ghost: only 5m keeps those two', H.keep.tf === '10100', H.keep.tf);
t('ghost: both rules at once', H.keep.c5tf === '00000', H.keep.c5tf);
t('ghost: leave to TP counts the held answers — 1 −1 3 −1 2 = 4R', near(H.hold.net, 4) && near(H.hold.real, 2.5) && H.hold.held === 2 && H.hold.skipped === 0, JSON.stringify(H.hold));
t('ghost: the held loss counts as a loss in the win rate', near(H.hold.wr, 3 / 5), String(H.hold.wr));
t('ghost: holding with confidence 4+ — 1 + 3 = 4R on two trades, one held', near(H.both.net, 4) && H.both.trades === 2 && H.both.held === 1, JSON.stringify(H.both));
t('ghost: holding alone adds 1.5R, two held', H.fx.length === 1 && H.fx[0][0] === 'holdToTarget' && near(H.fx[0][1], 1.5) && H.fx[0][2] === '2 held', JSON.stringify(H.fx));
t('trades filters: clean, any, one mistake, confidence, timeframe, exit', JSON.stringify(H.flt) === '[true,false,true,false,true,false,false,true,true,false]', JSON.stringify(H.flt));
t('week habits: one clean of three asked', H.hb.clean === 1 && H.hb.asked === 3 && near(H.hb.cleanR, 1), JSON.stringify(H.hb));
t('week habits: confidence 3.0 over 3, feeling after 3.0 over 2', near(H.hb.conf, 3) && H.hb.confN === 3 && near(H.hb.feel, 3) && H.hb.feelN === 2);
t('week habits: holding the one cut short would have made 3R, against 0.5R taken', H.hb.held === 1 && near(H.hb.heldWould, 3) && near(H.hb.heldTook, 0.5), JSON.stringify(H.hb));

/* ===================== New trade: the if-held box ===================== */
console.log('new trade');
await go('#/new');
const heldShown = () => p.evaluate(() => { const b = document.querySelector('.held-block'); return !!b && !b.hidden; });
const clickXr = (scope, l) => p.evaluate(([s, l]) => [...document.querySelectorAll(s + ' .xr')].find(b => b.textContent === l).click(), [scope, l]);
t('no if-held box on a fresh trade', !(await heldShown()));
await clickXr('[aria-label="Exit reason"]', 'Take profit'); await settle(80);
t('none for a trade that hit target', !(await heldShown()));
await clickXr('[aria-label="Exit reason"]', 'Closed manually'); await settle(80);
t('closing by hand opens it', await heldShown());
await clickXr('[aria-label="Exit reason"]', 'Closed manually'); await settle(80);
t('and taking that back closes it', !(await heldShown()));
await clickXr('.mistakes', 'Moved to BE early'); await settle(80);
t('moved to BE early opens it too', await heldShown());
await clickXr('.held-chips', 'Loss'); await settle(80);
t('a loss starts at 1R, the stop', await p.inputValue('.held-r') === '1' && await p.evaluate(() => document.querySelector('.held-sign').textContent) === '−');
await clickXr('.held-chips', 'Win'); await settle(80);
await p.fill('.held-r', '2.5'); await settle(60);
t('a win reads +', await p.evaluate(() => document.querySelector('.held-sign').textContent) === '+');
await p.evaluate(() => [...document.querySelectorAll('.trade-form .seg button')].find(b => b.textContent === 'Still open').click()); await settle(120);
t('a running trade is not asked', !(await heldShown()));
await p.evaluate(() => [...document.querySelectorAll('.trade-form .seg button')].find(b => b.textContent === 'Closed').click()); await settle(120);
t('and closing it asks again, keeping the answer', await heldShown() && await p.inputValue('.held-r') === '2.5');
await p.fill('.main input[placeholder="XAUUSD"]', 'HELD1');
await p.fill('.main input[placeholder="0.00"]', '400');
await settle(150);
await p.evaluate(() => [...document.querySelectorAll('.head button')].find(b => /^Save/.test(b.textContent.trim())).click()); await settle(700);
let mine = (await onDisk()).find(x => x.pair === 'HELD1');
t('saved on the trade: a win of +2.5R if held', mine?.heldOutcome === 'win' && mine?.heldR === 2.5, JSON.stringify(mine && [mine.heldOutcome, mine.heldR]));

/* Edit it: the question no longer applies, so the answer goes. */
await go('#/edit/' + mine.id, 600);
t('editing opens with the answer in place', await heldShown() && await p.inputValue('.held-r') === '2.5'
  && await p.evaluate(() => document.querySelector('.held-chips .is-on')?.textContent) === 'Win');
await clickXr('.mistakes', 'Moved to BE early'); await settle(80);
await p.evaluate(() => [...document.querySelectorAll('.head button')].find(b => /^Save/.test(b.textContent.trim())).click()); await settle(700);
mine = (await onDisk()).find(x => x.pair === 'HELD1');
t('with nothing cut short any more, the held answer is cleared', mine.heldOutcome === null && mine.heldR === null, JSON.stringify([mine.heldOutcome, mine.heldR]));

/* ===================== the trade page ===================== */
console.log('trade page');
const showcase = TR.find(x => x.heldOutcome === 'win' && x.mistakes?.length);
await go('#/trade/' + showcase.id);
const how = await p.evaluate(() => ({ cells: [...document.querySelectorAll('.td-cell')].map(c => [c.querySelector('.k').textContent, c.querySelector('b').textContent]),
  chips: [...document.querySelectorAll('.td-chip')].map(c => c.textContent) }));
const cell = k => (how.cells.find(c => c[0] === k) || [])[1];
const CONF = ['Revenge', 'Forced', 'Unsure', 'Solid', 'Confident'], FEEL = ['Angry', 'Regret', 'Indifferent', 'Content', 'Satisfied'];
t('the trade page reads back confidence', cell('Confidence') === `${showcase.confidence} · ${CONF[showcase.confidence - 1]}`, cell('Confidence'));
t('and how it felt after', cell('Feeling after') === `${showcase.emotionAfter} · ${FEEL[showcase.emotionAfter - 1]}`, cell('Feeling after'));
t('how it ended, and what holding would have made', cell('Exit') === 'Closed manually' && cell('If held to target') === 'Win · +3R', JSON.stringify(how.cells));
t('the timeframe and price delivery', cell('Timeframe') === showcase.execTf && cell('Price delivery').toLowerCase() === showcase.delivery);
t('its mistakes, by name', JSON.stringify(how.chips) === '["Closed early"]', JSON.stringify(how.chips));
const clean = TR.find(x => Array.isArray(x.mistakes) && !x.mistakes.length);
await go('#/trade/' + clean.id);
t('a clean trade says so', (await p.evaluate(() => document.querySelector('.td-clean')?.textContent)) === 'None — a clean trade');
t('and has no if-held line it was never asked', !(await p.evaluate(() => [...document.querySelectorAll('.td-cell .k')].some(k => k.textContent === 'If held to target'))));
await go('#/trade/' + TR[0].id);
t('a trade from before the questions has no card for them', !(await p.$('.td-how')));

/* ===================== the CSV ===================== */
console.log('csv');
const csv = await p.evaluate(async () => { const { toCSV } = await import('/js/csv.js'); const { store } = await import('/js/store.js'); return toCSV(store); });
const lines = csv.trim().split('\n'); const head = lines[0].split(',');
t('the sheet has a column for each question', ['confidence', 'emotionAfter', 'exitReason', 'heldOutcome', 'heldR', 'execTf', 'mistakes', 'delivery'].every(k => head.includes(k)), head.slice(-8).join(','));
const parsed = await p.evaluate(async text => {
  const { parseCSV } = await import('/js/csv.js'); const { parseBrokerCSV } = await import('/js/broker.js');
  const rows = parseCSV(text); const out = parseBrokerCSV(text);
  return { rows: rows.map(r => ({ id: r.id, ex: r.exitReason, m: r.mistakes, ho: r.heldOutcome, hr: r.heldR })), ok: out.ok, q: out.trades.map(x => x.questions || null) };
}, csv);
const rowOf = id => parsed.rows.find(r => r.id === id);
t('an exported trade carries its answers in words', rowOf(showcase.id).ex === 'Closed manually' && rowOf(showcase.id).m === 'Closed early' && rowOf(showcase.id).ho === 'Win' && rowOf(showcase.id).hr === '3',
  JSON.stringify(rowOf(showcase.id)));
t('a clean one says None; an old one is blank', rowOf(clean.id).m === 'None' && rowOf(TR[0].id).m === '' && rowOf(TR[0].id).ex === '');
const withQ = parsed.q.filter(Boolean);
t('the importer reads the answers back from a Quire sheet', parsed.ok && withQ.length === TR.length - 40 + 1, `${withQ.length} of ${parsed.q.length}`);
t('every one as it was', withQ.some(q => q.heldOutcome === 'win' && q.heldR === 3 && q.exitReason === 'manual' && JSON.stringify(q.mistakes) === '["closed_early"]'));

/* ===================== the weekly review ===================== */
console.log('review');
await p.evaluate(async () => { const { store } = await import('/js/store.js'); await store.deleteTrade(store.trades.find(x => x.pair === 'HELD1').id); });
const WK = TR.filter(x => x.date >= '2026-09-14' && x.date <= '2026-09-20').sort((a, b) => (a.date + a.timeOpen).localeCompare(b.date + b.timeOpen));
await go('#/review', 700);
const iCut = WK.findIndex(x => x.exitReason === 'manual');
const iTp = WK.findIndex(x => x.exitReason === 'tp');
await p.evaluate(i => document.querySelectorAll('.rv-item')[i].click(), iTp); await settle(300);
const pills = await p.evaluate(() => [...document.querySelectorAll('.rv-from .rv-pill')].map(x => x.textContent));
const tp = WK[iTp];
t('the review shows what was logged with the trade', pills.includes(`In${tp.confidence} · ${CONF[tp.confidence - 1]}`) && pills.includes('ExitTake profit') && pills.includes(`TF${tp.execTf}`), pills.join(' | '));
t('a trade that hit target is not asked if held', !(await p.$('.rv-held')));
await p.evaluate(() => [...document.querySelectorAll('.rv-chips button')].find(b => b.textContent === 'Closed too early').click()); await settle(300);
t('nor is it asked because the review says closed too early — only a trade closed by hand is', !(await p.$('.rv-held')));
await p.evaluate(() => [...document.querySelectorAll('.rv-chips button')].find(b => b.textContent === 'Closed too early').click()); await settle(300);
if (iCut >= 0) {
  await p.evaluate(i => document.querySelectorAll('.rv-item')[i].click(), iCut); await settle(300);
  t('a trade closed by hand is asked if held', !!(await p.$('.rv-held')));
  await p.evaluate(() => [...document.querySelectorAll('.rv-held .xr')].find(b => b.textContent === 'Loss').click()); await settle(600);
  const cut = (await onDisk()).find(x => x.id === WK[iCut].id);
  t('answering it in the review saves it on the trade', cut.heldOutcome === 'loss' && cut.heldR === -1, JSON.stringify([cut.heldOutcome, cut.heldR]));
  WK[iCut] = { ...WK[iCut], heldOutcome: 'loss', heldR: -1 };
} else t('the week has a trade closed by hand', false);

await go('#/review/week', 700);
if (!(await p.$('.rv-habits'))) {
  /* Nothing reviewed yet: mark one so the week adds up. */
  await go('#/review', 500);
  await p.evaluate(() => [...document.querySelectorAll('.rv-chips button')].find(b => b.textContent === 'Hit target').click()); await settle(300);
  await go('#/review/week', 700);
}
const hab = await p.evaluate(() => [...document.querySelectorAll('.rv-hb')].map(x => [x.querySelector('.k').textContent, x.querySelector('.v')?.textContent ?? null, x.querySelector('.s')?.textContent ?? '']));
const hv = k => hab.find(h => h[0] === k) || [];
const wkAsked = WK.filter(x => Array.isArray(x.mistakes)), wkClean = wkAsked.filter(x => !x.mistakes.length);
t('the week counts its clean trades', hv('Clean trades')[1] === `${wkClean.length} of ${wkAsked.length}`, JSON.stringify(hv('Clean trades')));
const wkConf = WK.filter(x => x.confidence != null).map(x => x.confidence);
t('and how sure you were going in, on average', hv('Going in')[1] === (wkConf.reduce((a, x) => a + x, 0) / wkConf.length).toFixed(1), JSON.stringify(hv('Going in')));
const wkHeld = WK.filter(x => x.heldOutcome);
const diff = wkHeld.reduce((a, x) => a + heldR(x) - R(x), 0);
t('and what holding would have changed', wkHeld.length ? hv('If held')[1] === RR(diff) : hv('If held')[1] === '—', JSON.stringify(hv('If held')) + ' want ' + RR(diff));
const mlist = await p.evaluate(() => [...document.querySelectorAll('.rv-mlist span')].map(x => x.textContent));
const wkM = {}; for (const x of wkAsked) for (const m of x.mistakes) wkM[m] = (wkM[m] || 0) + 1;
t('and which mistakes came up, most first', mlist.length === Math.min(5, Object.keys(wkM).length) && Number(mlist[0]?.match(/^(\d+)×/)?.[1]) === Math.max(...Object.values(wkM), 0), mlist.join(' | '));

/* ===================== Trades: filters ===================== */
console.log('trades');
await go('#/trades', 500);
const count = () => p.evaluate(() => document.querySelectorAll('.tbl-body > *').length);
const sel = async (first, v) => { await p.evaluate(([f, v]) => { const s = [...document.querySelectorAll('.tr-bar select')].find(x => x.options[0].text === f); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, [first, v]); await settle(250); };
const allN = await count();
await sel('Mistakes · all', 'none');
const nowTR = await onDisk();
const closed = nowTR.filter(x => x.status !== 'open');
t('clean only', await count() === closed.filter(x => Array.isArray(x.mistakes) && !x.mistakes.length).length, String(await count()));
await sel('Mistakes · all', 'early_entry');
t('one mistake', await count() === closed.filter(x => x.mistakes?.includes('early_entry')).length);
await sel('Mistakes · all', 'all');
await sel('Confidence · all', '4+');
t('confidence 4 and up', await count() === closed.filter(x => x.confidence >= 4).length);
await sel('Exit · all', 'tp');
t('with take profit as well', await count() === closed.filter(x => x.confidence >= 4 && x.exitReason === 'tp').length);
await sel('TF · all', '5m');
t('and on the 5m', await count() === closed.filter(x => x.confidence >= 4 && x.exitReason === 'tp' && x.execTf === '5m').length);
t('a filter on is lit', await p.evaluate(() => [...document.querySelectorAll('.tr-bar select')].filter(s => s.value !== 'all').length) === 3);
await p.evaluate(() => document.querySelector('.tr-clear').click()); await settle(250);
t('Clear puts every filter back', await count() === allN && !(await p.$('.tr-clear')));
const barOK = await p.evaluate(() => { const bar = document.querySelector('.tr-bar'); return bar.scrollWidth <= bar.clientWidth + 1; });
t('the filter bar fits', barOK);

/* ===================== the Ghost ===================== */
console.log('ghost');
await go('#/lab/ghost', 700);
const toggle = l => p.evaluate(l => [...document.querySelectorAll('.gh-toggle')].find(b => b.textContent.includes(l)).click(), l);
const netTile = () => p.evaluate(() => document.querySelector('.gh-tile .v').textContent);
const GO = (await onDisk()).filter(x => x.status !== 'open').sort((a, b) => (a.date + (a.timeOpen || '99:99')).localeCompare(b.date + (b.timeOpen || '99:99')));
await toggle('Leave trades to TP'); await settle(300);
const gHeld = GO.reduce((a, x) => a + (x.heldOutcome ? heldR(x) : R(x)), 0);
t('leave trades to TP: the held answers in place of what was taken', await netTile() === RR(gHeld), `${await netTile()} want ${RR(gHeld)}`);
t('and it says how many it held', (await p.evaluate(() => [...document.querySelectorAll('.gh-tile')][4].querySelector('.s').textContent)) === `of ${GO.length} · ${GO.filter(x => x.heldOutcome).length} held`);
await toggle('Leave trades to TP'); await settle(200);
await toggle('Only confidence'); await settle(300);
const g4 = GO.filter(x => x.confidence >= 4).reduce((a, x) => a + R(x), 0);
t('only confidence 4+', await netTile() === RR(g4), `${await netTile()} want ${RR(g4)}`);
await toggle('Only confidence'); await settle(200);
await p.evaluate(() => [...document.querySelectorAll('.gh-chips')].find(c => /timeframes/i.test(c.textContent)).querySelectorAll('.gh-chip').forEach(b => b.textContent === '15m' && b.click())); await settle(300);
const g15 = GO.filter(x => x.execTf === '15m').reduce((a, x) => a + R(x), 0);
t('only 15m entries', await netTile() === RR(g15), `${await netTile()} want ${RR(g15)}`);

/* ===================== the dashboard ===================== */
console.log('dashboard');
await go('#/dashboard', 500);
await p.evaluate(() => [...document.querySelectorAll('.head .seg button')].find(b => b.textContent.trim() === 'All').click()); await settle(400);
/* Clean wins left the dashboard (Minato, Laminar 3.1). */
t('the dashboard no longer shows clean wins', await p.evaluate(() => ![...document.querySelectorAll('.db-stat .k2')].some(x => x.textContent === 'Clean wins')));
t('(the fixture has both kinds)', CLEAN_WINS.length && ASKED_WINS.length > CLEAN_WINS.length);
await p.setViewportSize({ width: 1280, height: 800 }); await settle(400);
t('the edge card still fits at 1280×800', await p.evaluate(() => { const c = document.querySelector('.db-edge'); return c.scrollHeight <= c.clientHeight + 1; }));

t('no page errors', errs.length === 0, errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
