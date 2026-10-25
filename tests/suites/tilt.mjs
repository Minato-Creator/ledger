import * as c from '../../src/js/calc.js';
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

let pass=0, fail=0;
const ok=(n,g,w)=>{const good=String(g)===String(w); good?pass++:fail++; console.log(`  ${good?'ok  ':'FAIL'}  ${n}  got=${g}${good?'':`  want=${w}`}`);};
const A = { startingBalance: 100000, currency: 'USD', defaultRiskPercent: 0.75 };
// 1R = $750 at 0.75%
const T = (date, open, close, net, risk = 0.75) =>
  ({ id: date + open, date, timeOpen: open, timeClose: close, netResult: net, riskPercent: risk });

console.log('  -- ordering --');
const shuffled = [T('2026-09-02','10:00','10:30',100), T('2026-09-01','16:00','16:30',-750), T('2026-09-01','09:00','09:30',750)];
ok('sorts by date then entry time', c.chronological(shuffled).map(t=>t.timeOpen).join(','), '09:00,16:00,10:00');
ok('a trade with no entry time still sorts by date',
   c.chronological([T('2026-09-02','',null,5), T('2026-09-01','23:00',null,5)]).map(t=>t.date).join(','), '2026-09-01,2026-09-02');

console.log('  -- what follows a loss --');
const day = [
  T('2026-09-01','09:00','09:30',  750),   // win
  T('2026-09-01','10:00','10:20', -750),   // LOSS
  T('2026-09-01','10:35','11:00', -750),   // 15 min later — inside the window
  T('2026-09-01','14:00','14:30',  1500),  // 3h after that loss — after a loss, but not quick
  T('2026-09-02','09:00','09:30', -750),   // LOSS
  T('2026-09-03','09:00','09:30',  750),   // next day — after a loss, never "quick"
];
const r = c.afterLoss(A, day, { windowMins: 30 });
ok('three trades followed a loss', r.next.count, 3);
ok('one of them was a re-entry inside 30 min', r.quick.count, 1);
ok('the quick one is the 10:35', r.quickTrades[0].timeOpen, '10:35');
ok('the window is measured from the CLOSE of the loss', c.afterLoss(A, [
     T('2026-09-01','10:00','11:00',-750),      // closes at 11:00
     T('2026-09-01','11:20','11:40', 750),      // 20 min after the close
   ], { windowMins: 30 }).quick.count, 1);
ok('...so a long hold does not count as a fast re-entry', c.afterLoss(A, [
     T('2026-09-01','10:00','13:00',-750),      // closes at 13:00
     T('2026-09-01','13:45','14:00', 750),      // 45 min after
   ], { windowMins: 30 }).quick.count, 0);
ok('a next-day trade is never quick', r.quickTrades.every(t => t.date === '2026-09-01'), true);
ok('after-loss net is right', r.next.net, -750 + 1500 + 750);
ok('and its R total too', r.next.netR.toFixed(2), ((-750 + 1500 + 750) / 750).toFixed(2));
ok('baseline covers everything', r.all.count, 6);

console.log('  -- sizing up --');
const up = [T('2026-09-01','09:00','09:30',-750, 0.5), T('2026-09-01','10:00','10:30', 750, 1.5),
            T('2026-09-01','11:00','11:30',-500, 1.5), T('2026-09-01','12:00','12:30', 100, 1.5)];
const ru = c.afterLoss(A, up);
ok('sized up after the first loss', ru.sizedUp, 1);
ok('out of two chances', ru.sizedUpOf, 2);
ok('a same-size re-entry is not sizing up',
   c.afterLoss(A, [T('2026-09-01','09:00','09:30',-750,1), T('2026-09-01','10:00','10:30',50,1)]).sizedUp, 0);

console.log('  -- losing runs --');
ok('longest losing run', c.afterLoss(A, [
  T('2026-09-01','09:00',null,-1), T('2026-09-01','10:00',null,-1), T('2026-09-01','11:00',null,-1),
  T('2026-09-01','12:00',null, 5), T('2026-09-01','13:00',null,-1), T('2026-09-01','14:00',null,-1),
]).worstStreak, 3);
ok('a break-even neither breaks nor extends the run', c.afterLoss(A, [
  T('2026-09-01','09:00',null,-1), T('2026-09-01','10:00',null, 0), T('2026-09-01','11:00',null,-1),
]).worstStreak, 2);
ok('no losses means no run', c.afterLoss(A, [T('2026-09-01','09:00',null,5)]).worstStreak, 0);

console.log('  -- degenerate input --');
const empty = c.afterLoss(A, []);
ok('no trades is not a crash', empty.next.count, 0);
ok('one trade has nothing after it', c.afterLoss(A, [T('2026-09-01','09:00',null,-750)]).next.count, 0);
ok('and no sizing sample either', c.afterLoss(A, [T('2026-09-01','09:00',null,-750)]).sizedUpOf, 0);

console.log(`\n${pass} passed, ${fail} failed`);
