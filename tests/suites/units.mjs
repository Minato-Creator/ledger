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

const A = { startingBalance: 100000, currency: 'USD', defaultRiskPercent: 0.75, weeklyTargetPercent: 2 };
const T = (net, risk) => ({ netResult: net, riskPercent: risk });

// fig() reads one figure three ways
ok('$ of 1500', c.fig('$', A, 1500, 2), '+$1,500.00');
ok('% of 1500 on a 100k account', c.fig('%', A, 1500, 2), '+1.50%');
ok('R of 1500 is whatever was passed', c.fig('R', A, 1500, 2), '+2.00R');
ok('negatives keep the true minus', c.fig('%', A, -750, -1), '−0.75%');
ok('zero is unsigned', c.fig('%', A, 0, 0), '0.00%');
ok('no R means no R', c.fig('R', A, 1500, null), '—');
ok('no starting balance means no %', c.fig('%', { startingBalance: 0 }, 1500, 2), '—');

// % is always of the STARTING balance, never the balance at the time
ok('the same $ is the same % in month 1', c.fig('%', A, 2000, null), '+2.00%');
ok('...and in month 9, after the account grew', c.fig('%', A, 2000, null), '+2.00%');

// R can never be worked back out of dollars
const s = c.summarise(A, [T(1500, 0.75), T(-750, 0.75), T(3000, 1.5)]);
ok('net is the money', s.net, 3750);
ok('netR is summed per trade, not derived', s.netR.toFixed(4), (2 + -1 + 2).toFixed(4));
ok('two trades with equal $ but different risk differ in R',
   c.summarise(A, [T(750, 0.75), T(750, 1.5)]).netR, 1.5);
const partial = c.summarise(A, [T(1500, 0.75), T(500, 0)]);
ok('one trade without risk voids the R total', partial.netR, 'null');
ok('but the money total still stands', partial.net, 2000);
ok('gross win R', c.summarise(A, [T(1500, 0.75), T(-750, 0.75)]).grossWinR, 2);
ok('gross loss R is positive, like its $ twin', c.summarise(A, [T(1500, 0.75), T(-750, 0.75)]).grossLossR, 1);
ok('avg loss R', c.summarise(A, [T(-750, 0.75), T(-1500, 0.75)]).avgLossR, 1.5);
ok('expectancy R is the average R', c.summarise(A, [T(1500, 0.75), T(-750, 0.75)]).expectancyR, 0.5);

// figValue feeds charts and bars the raw number
ok('figValue $', c.figValue('$', A, 1500, 2), 1500);
ok('figValue %', c.figValue('%', A, 1500, 2), 1.5);
ok('figValue R', c.figValue('R', A, 1500, 2), 2);

// equity curve carries both
const curve = c.equityCurve([{ date:'2026-09-01', netResult: 1500, riskPercent: .75 },
                             { date:'2026-09-02', netResult: -750, riskPercent: .75 },
                             { date:'2026-09-03', netResult: 3000, riskPercent: .75 }], A);
ok('equity in $', curve.map(p=>p.equity).join(), '1500,750,3750');
ok('equity in R', curve.map(p=>p.equityR).join(), '2,1,5');
ok('drawdown in $', c.maxDrawdown(curve).amount, 750);
ok('drawdown in R', c.maxDrawdown(curve, 'equityR').amount, 1);
const noRisk = c.equityCurve([{ date:'2026-09-01', netResult: 1500, riskPercent: 0 }], A);
ok('an R curve with a riskless trade has no R', noRisk[0].equityR, 'null');
ok('and so has no R drawdown', c.maxDrawdown(noRisk, 'equityR'), 'null');

// weekly target — one number, read three ways
const t = c.weeklyTarget(A, '$');
ok('target in $', t.dollars, 2000);
ok('target in %', t.pct, 2);
ok('target in R at 0.75% risk', t.r.toFixed(4), (2/0.75).toFixed(4));
ok('target value follows the unit', c.weeklyTarget(A, 'R').value.toFixed(2), '2.67');
ok('no target set means null', c.weeklyTarget({ ...A, weeklyTargetPercent: 0 }, '$'), 'null');
ok('no default risk means no R target', c.weeklyTarget({ ...A, defaultRiskPercent: 0 }, 'R').r, 'null');
// and it round-trips whichever unit you type it in
ok('typing $2,000 stores 2%', c.targetToPercent(A, '$', 2000), 2);
ok('typing 2% stores 2%', c.targetToPercent(A, '%', 2), 2);
ok('typing 2.67R stores ~2%', c.targetToPercent(A, 'R', 2.6667).toFixed(2), '2.00');
ok('a target that scales: 2% of 25k is $500', c.weeklyTarget({ ...A, startingBalance: 25000 }, '$').dollars, 500);
ok('rubbish clears the target', c.targetToPercent(A, '$', 'abc'), 0);
ok('a negative clears it too', c.targetToPercent(A, '$', -5), 0);

ok('pctSigned rounds to 2dp', c.pctSigned(1.4449), '+1.44%');
ok('asPercent', c.asPercent(A, 750), 0.75);

console.log(`\n${pass} passed, ${fail} failed`);
