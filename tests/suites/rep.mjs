import { isoWeek, weekRange, weeksInYear, parseReplayCSV, shiftStamp, mapHeaders, looksLikeFxReplay, onClock } from '../../src/js/replay.js';
let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}  want=${w}`);};

// ISO weeks — cross-checked against the ISO-8601 definition
ok('2026-01-01 is W01', isoWeek('2026-01-01'), '2026-W01');
ok('2026-08-31 is W36', isoWeek('2026-08-31'), '2026-W36');
ok('2026-09-04 is W36', isoWeek('2026-09-04'), '2026-W36');
ok('2026-09-07 is W37', isoWeek('2026-09-07'), '2026-W37');
ok('2027-01-03 belongs to 2026-W53', isoWeek('2027-01-03'), '2026-W53');
ok('2021-01-01 belongs to 2020-W53', isoWeek('2021-01-01'), '2020-W53');
ok('2024-12-30 is 2025-W01', isoWeek('2024-12-30'), '2025-W01');
ok('W36 starts Mon 31 Aug', weekRange('2026-W36').start, '2026-08-31');
ok('W36 ends Sun 06 Sep', weekRange('2026-W36').end, '2026-09-06');
ok('2026 has 53 weeks', weeksInYear(2026), 53);
ok('2025 has 52 weeks', weeksInYear(2025), 52);
ok('2020 has 53 weeks', weeksInYear(2020), 53);
// every week key round-trips through its own range
let rt = true;
for (const y of [2024,2025,2026,2027]) for (let w=1; w<=weeksInYear(y); w++) {
  const k = `${y}-W${String(w).padStart(2,'0')}`;
  if (isoWeek(weekRange(k).start) !== k || isoWeek(weekRange(k).end) !== k) { rt = false; console.log('   broke at', k); }
}
ok('every week of 2024-27 round-trips', rt, true);

// UTC → Perth
ok('UTC 20:41 +8 rolls to next day', JSON.stringify(shiftStamp({y:2026,mo:9,d:3,h:20,mi:41}, 8)), '{"date":"2026-09-04","time":"04:41"}');
ok('UTC 08:41 +8 stays', JSON.stringify(shiftStamp({y:2026,mo:9,d:3,h:8,mi:41}, 8)), '{"date":"2026-09-03","time":"16:41"}');

const PB = { sessions: [
  {id:'ses_london',name:'London Open',start:'14:00',end:'17:00'},
  {id:'ses_ny',name:'New York Open',start:'19:00',end:'22:00'}] };

const CSV = `dateStart,dateEnd,pair,side,avgRiskReward,entryPrice,initialSL,rPnL,balance,initialBalance
2026-09-01T08:41:00,2026-09-01T10:02:00,XAU/USD,Short,3.47,3421.50,3433.10,3470.00,103470.00,100000
2026-09-02T08:09:00,2026-09-02T08:44:00,XAU/USD,Long,-1.00,3402.10,3391.00,-1000.00,102470.00,100000
2026-09-03T19:09:00,2026-09-03T21:30:00,XAU/USD,Long,4.69,3455.00,3444.20,4690.00,107160.00,100000
2026-09-03T14:29:00,,EUR/USD,Buy,0.00,1.0821,1.0798,0.00,107160.00,100000
not-a-date,,XAU/USD,Long,1.2,,,,,100000
2026-09-04T15:19:00,,,Long,1.2,,,,,100000`;

const res = parseReplayCSV(CSV, PB, { offsetHours: 8 });
ok('4 usable rows', res.trades.length, 4);
ok('2 rows skipped', res.skipped.length, 2);
ok('bad date is named', res.skipped[0].why, 'could not read the date');
ok('missing pair is named', res.skipped[1].why, 'no instrument');
ok('nothing reported missing', res.missing.length, 0);
ok('initialBalance read', res.initialBalance, 100000);
const t0 = res.trades[0];
ok('08:41 UTC becomes 16:41', t0.timeOpen, '16:41');
ok('date holds', t0.date, '2026-09-01');
ok('Short becomes sell', t0.side, 'sell');
ok('R used as-is', t0.rMultiple, 3.47);
ok('16:41 lands in London Open', t0.sessionId, 'ses_london');
ok('close time shifted too', t0.timeClose, '18:02');
ok('19:09 UTC → 03:09 next day', res.trades[2].timeOpen, '03:09');
ok('and rolls the date forward', res.trades[2].date, '2026-09-04');
ok('03:09 is outside every killzone', res.trades[2].sessionId, 'null');
ok('Buy becomes buy', res.trades[3].side, 'buy');
ok('a 0.00R row is kept', res.trades[3].rMultiple, 0);
ok('stop price read', t0.stopPrice, 3433.1);

// header tolerance
const ALT = `Symbol,Direction,Open Time,R:R\nEURUSD,Sell,2026-09-01 10:00,2.5`;
const alt = parseReplayCSV(ALT, PB, { offsetHours: 0 });
ok('other spellings still map', alt.trades.length, 1);
ok('and read correctly', alt.trades[0].pair + '/' + alt.trades[0].side + '/' + alt.trades[0].rMultiple, 'EURUSD/sell/2.5');

// a file with no R column is refused as a whole, not row by row
const NOR = `dateStart,pair,side\n2026-09-01T10:00:00,XAUUSD,Long`;
ok('a file with no R is refused', parseReplayCSV(NOR, PB).missing.join(), 'r');

// ambiguous day/month is refused rather than guessed
const AMB = `dateStart,pair,side,avgRiskReward\n05/03/2026 10:00,XAUUSD,Long,1.5\n25/03/2026 10:00,XAUUSD,Long,1.5`;
const amb = parseReplayCSV(AMB, PB, { offsetHours: 0 });
ok('ambiguous 05/03 refused', amb.skipped.length, 1);
ok('unambiguous 25/03 read as 25 March', amb.trades[0].date, '2026-03-25');

// ---- the real FX Replay export, verbatim -----------------------------------
// Its dates are year-first with slashes (2026/09/01 08:41:00), which is the
// shape that used to be refused.
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

const PB8 = { sessions: [
  {id:'ses_pre_asia',name:'Pre-Asia',start:'07:00',end:'08:00'},{id:'ses_asia',name:'Asia',start:'08:00',end:'12:00'},
  {id:'ses_pre_london',name:'Pre-London',start:'13:00',end:'14:00'},{id:'ses_london',name:'London Open',start:'14:00',end:'17:00'},
  {id:'ses_pre_ny',name:'Pre-NY',start:'18:00',end:'19:00'},{id:'ses_ny',name:'New York Open',start:'19:00',end:'22:00'},
  {id:'ses_pre_lc',name:'Pre-London Close',start:'21:00',end:'22:00'},{id:'ses_lc',name:'London Close',start:'22:00',end:'00:00'}]};
/* ---------- a real FX Replay export ----------
   The file below is one of Minato's own weeks, byte for byte. FX Replay
   writes the clock he was looking at, so every time here must come out of
   the app exactly as it went into the file. Reading them as UTC and adding
   eight hours is the bug this guards: it moved every backtest into the next
   session and a week that lined up exactly came out as nothing matched. */
const REAL = fsx.readFileSync(FIX + '/fxreplay-real.csv', 'utf8');
const real = parseReplayCSV(REAL, PB8);
ok('real export: nothing missing', real.missing.length, 0);
ok('real export: nothing skipped', real.skipped.length, 0);
ok('real export: 5 trades', real.trades.length, 5);
ok('real export: recognised as FX Replay', real.source, 'fxreplay');
ok('real export: read on your own clock', real.clock, 'local');
ok('real export: 08:41 in the file is 08:41 in the app',
   real.trades[0].date + ' ' + real.trades[0].timeOpen, '2026-09-01 08:41');
ok('real export: and its close time too', real.trades[0].timeClose, '15:39');
ok('real export: 19:09 stays on the 2nd rather than rolling over',
   real.trades[2].date + ' ' + real.trades[2].timeOpen, '2026-09-02 19:09');
ok('real export: the last one too', real.trades[4].date + ' ' + real.trades[4].timeOpen, '2026-09-04 15:19');
ok('real export: the session comes from that time', real.trades[0].sessionId, 'ses_asia');
ok('real export: sell read', real.trades[0].side, 'sell');
ok('real export: R from avgRiskReward', real.trades[0].rMultiple, 3.47);
ok('real export: id comes from the export', real.trades[0].id, 'rp_267272277');
ok('real export: initialBalance', real.initialBalance, 100000);
ok('real export: avgClosePrice maps to exit', real.trades[0].exitPrice, 4415.915);
ok('real export: amount maps to size', real.trades[0].size, 89);
ok('real export: every row is week 36', [...new Set(real.trades.map(t => isoWeek(t.date)))].join(), '2026-W36');
ok('real export: ids are stable across two reads',
   parseReplayCSV(REAL, PB8).trades[3].id, real.trades[3].id);

/* And no setting can move it: the file says what it is. */
const forced = parseReplayCSV(REAL, PB8, { clock: 'utc' });
ok('asking for UTC cannot shift an FX Replay export',
   forced.trades[0].date + ' ' + forced.trades[0].timeOpen, '2026-09-01 08:41');
ok('and it says which clock it actually used', forced.clock, 'local');

/* A file that is not FX Replay's is taken at its word. */
const GEN = `date,pair,side,r\n2026/09/03 20:41:00,XAUUSD,buy,2`;
ok('a plain CSV is not mistaken for an FX Replay export', parseReplayCSV(GEN, PB8).source, 'generic');
ok('and is read as written by default',
   parseReplayCSV(GEN, PB8).trades[0].date + ' ' + parseReplayCSV(GEN, PB8).trades[0].timeOpen,
   '2026-09-03 20:41');
ok('a plain CSV in UTC is put on the machine\'s clock, whatever that is', (() => {
  const t = parseReplayCSV(GEN, PB8, { clock: 'utc' }).trades[0];
  const d = new Date(Date.UTC(2026, 8, 3, 20, 41));
  const p = n => String(n).padStart(2, '0');
  return t.date + ' ' + t.timeOpen ===
    `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
})(), true);

ok('the header signature is what tells them apart',
   looksLikeFxReplay(['id','dateStart','dateEnd','pair','uPnL','rPnL','avgRiskReward']), true);
ok('and a short generic header is not it', looksLikeFxReplay(['date','pair','side','r']), false);

// an open position is skipped, and says so
const OPEN = `id,dateStart,pair,side,avgRiskReward,status\n1,2026/09/01 08:41:00,XAUUSD,buy,0,open`;
const op = parseReplayCSV(OPEN, PB8);
ok('an open trade is skipped', op.trades.length, 0);
ok('and the reason is named', op.skipped[0].why, 'still open');

console.log(`\n${pass} passed, ${fail} failed`);
