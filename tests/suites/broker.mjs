import { readFileSync, existsSync } from 'fs';
import { parseBrokerCSV, pairFills, cleanSymbol, mapColumns, moneyFor, instrumentsIn } from '../../src/js/broker.js';
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


let fails = 0;
const eq = (a, b, what) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fails++; console.log('FAIL', what, '\n  got     ', JSON.stringify(a), '\n  expected', JSON.stringify(b)); } else console.log('ok  ', what); };

/* A real broker export Minato uploaded once; it is not part of the repository, so on a
   machine without it this suite says so instead of failing. */
const SAMPLE = '/root/.claude/uploads/4feb2eb2-1365-5325-a426-f84cb1fabf62/152ba181-orders_20260909.csv';
if (!existsSync(SAMPLE)) { console.log('skipped — the sample broker export is not on this machine'); process.exit(0); }
const text = readFileSync(SAMPLE, 'utf8');
const r = parseBrokerCSV(text);
console.log('shape', r.shape, 'ok', r.ok, 'reason', r.reason || '-');
console.log('mapped', JSON.stringify(r.mapped));
console.log('skipped', r.skipped.length);
console.log(r.trades.map(t => `${t.date} ${t.timeOpen}->${t.timeClose} ${t.pair} ${t.side} ${t.entryPrice}->${t.exitPrice} x${t.size} pts=${t.points} fee=${t.commission}`).join('\n'));
console.log('stillOpen', JSON.stringify(r.stillOpen));

eq(r.shape, 'orders', 'shape is orders');
eq(r.trades.length, 3, '3 closed trades');
eq(r.stillOpen.length, 1, '1 still open');
eq(r.trades.map(t => t.points), [-7.1, -14.8, 6.9], 'points');
eq(r.trades.map(t => t.side), ['buy','sell','sell'], 'sides');
eq(r.trades.map(t => t.timeOpen), ['17:19','17:54','19:57'], 'open times');
eq(r.trades.map(t => t.timeClose), ['17:54','21:02','23:34'], 'close times');
eq(r.trades[0].pair, 'MGC', 'symbol cleaned');
eq(r.stillOpen[0].side + r.stillOpen[0].price, 'sell4444.9', 'open short');
eq(instrumentsIn(r.trades), [{pair:'MGC',count:3}], 'instruments');
eq(moneyFor(r.trades[2], 10), 6.9*10 - r.trades[2].commission, 'money at $10/pt');
eq(moneyFor(r.trades[2], null), null, 'no money without a point value');

// symbols
eq(cleanSymbol('COMEX:MGC'), 'MGC', 'COMEX:MGC');
eq(cleanSymbol('XAUUSD.pro'), 'XAUUSD', 'XAUUSD.pro');
eq(cleanSymbol('MGC1!'), 'MGC', 'MGC1!');       // 1! is the continuous contract, not the name
eq(cleanSymbol('CME_MINI:NQ1!'), 'NQ', 'CME_MINI:NQ1!');  // a broker prefix can be any length
eq(cleanSymbol(' eurusd '), 'EURUSD', 'eurusd');

// already-paired shape
const paired = `Open Time,Close Time,Symbol,Type,Volume,Open Price,Close Price,Commission,Profit
2026.03.02 14:05,2026.03.02 15:20,EURUSD,buy,1.00,1.0850,1.0870,-3.50,200.00
2026.03.03 09:11,2026.03.03 09:40,XAUUSD,sell,0.50,2310.5,2305.0,-2.00,275.00`;
const p = parseBrokerCSV(paired);
console.log('paired shape', p.shape, p.reason || '', JSON.stringify(p.mapped));
eq(p.shape, 'trades', 'paired detected as trades');
eq(p.trades.length, 2, 'two paired trades');
eq(p.trades.map(t => t.side), ['buy','sell'], 'paired sides');
eq(p.trades.map(t => t.pnl), [200, 275], 'paired pnl used');
eq(moneyFor(p.trades[0], 999), 200, 'file pnl wins over point value');

// date order detection
const mmdd = `Time,Symbol,Qty,Side,Avg Price,Status
03/25/2026 10:00,ES,1,Buy,5000,Filled
03/26/2026 11:00,ES,1,Sell,5010,Filled`;
eq(parseBrokerCSV(mmdd).trades[0].date, '2026-03-25', 'MM/DD detected');
const ddmm = `Time,Symbol,Qty,Side,Avg Price,Status
25/03/2026 10:00,ES,1,Buy,5000,Filled
26/03/2026 11:00,ES,1,Sell,5010,Filled`;
eq(parseBrokerCSV(ddmm).trades[0].date, '2026-03-25', 'DD/MM detected');

// partial fills + reversal
const rev = `Time,Symbol,Qty,Side,Avg Price,Status
2026-01-05 09:00,NQ,2,Buy,20000,Filled
2026-01-05 09:30,NQ,1,Sell,20010,Filled
2026-01-05 10:00,NQ,3,Sell,20020,Filled
2026-01-05 10:30,NQ,2,Buy,20015,Filled`;
const rr = parseBrokerCSV(rev);
console.log(rr.trades.map(t=>`${t.side} ${t.size} ${t.points}`).join(' | '), 'open:', JSON.stringify(rr.stillOpen));
eq(rr.trades.length, 3, 'reversal makes 3 trades');
eq(rr.trades.map(t => t.points), [10, 20, 10], 'reversal points');
eq(rr.stillOpen.length, 0, 'flat at the end');

// junk
eq(parseBrokerCSV('a,b,c\n1,2,3').ok, false, 'rejects an unrelated file');
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
