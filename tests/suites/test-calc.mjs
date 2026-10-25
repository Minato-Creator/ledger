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
const eq=(name,got,want,tol=1e-9)=>{
  const ok = (typeof want==='number' && typeof got==='number') ? Math.abs(got-want)<=tol : got===want;
  ok?pass++:fail++;
  console.log(`${ok?'  ok  ':'  FAIL'}  ${name}  got=${got}  want=${want}`);
};

const acct={id:'a',startingBalance:100000,currency:'USD'};
const T=(o)=>({date:'2026-09-08',riskPercent:0.75,...o});

eq('1R at 0.75% of 100k', c.oneR(acct,T({})), 750);
eq('R of +$1,731.60',     +c.rMultiple(acct,T({netResult:1731.60})).toFixed(2), 2.31);
eq('R of a full stop',    c.rMultiple(acct,T({netResult:-750})), -1);
eq('planned R 12pt stop / 36pt target', c.plannedR(T({entryPrice:3412.80,stopLoss:3400.80,takeProfit:3448.80})), 3);
eq('outcome win',  c.outcome(T({netResult:10})), 'win');
eq('outcome loss', c.outcome(T({netResult:-10})), 'loss');
eq('outcome breakeven', c.outcome(T({netResult:0})), 'breakeven');
eq('duration 09:14 -> 11:38', c.durationMins('09:14','11:38'), 144);
eq('duration wraps midnight', c.durationMins('23:30','00:45'), 75);

const pb={sessions:[
 {id:'pa',name:'Pre-Asia',start:'07:00',end:'09:00'},
 {id:'as',name:'Asia',start:'09:00',end:'15:00'},
 {id:'pl',name:'Pre-London',start:'14:00',end:'16:00'},
 {id:'lo',name:'London',start:'16:00',end:'21:00'},
 {id:'pn',name:'Pre-NY',start:'20:00',end:'21:30'},
 {id:'ny',name:'New York',start:'21:30',end:'04:00'}]};
eq('16:41 is London',   c.sessionFor(pb,'16:41').name, 'London');
eq('03:09 is New York (wraps)', c.sessionFor(pb,'03:09').name, 'New York');
eq('08:00 is Pre-Asia', c.sessionFor(pb,'08:00').name, 'Pre-Asia');
eq('14:30 first match is Asia (overlap)', c.sessionFor(pb,'14:30').name, 'Asia');

// aggregate: 3 wins avg +1000, 2 losses avg -500, 1 breakeven
const trades=[
 T({date:'2026-09-01',netResult:1000}), T({date:'2026-09-02',netResult:1000}),
 T({date:'2026-09-03',netResult:1000}), T({date:'2026-09-04',netResult:-500}),
 T({date:'2026-09-05',netResult:-500}), T({date:'2026-09-06',netResult:0}),
];
const s=c.summarise(acct,trades);
eq('count',s.count,6);
eq('wins/losses/be',`${s.wins}/${s.losses}/${s.breakevens}`,'3/2/1');
eq('net',s.net,2000);
eq('win rate excludes BE',+s.winRate.toFixed(4), +(3/5).toFixed(4));
eq('profit factor',s.profitFactor,3);
eq('expectancy over ALL trades',+s.expectancy.toFixed(4),+(2000/6).toFixed(4));
eq('avg R agrees with expectancy/1R',+s.avgR.toFixed(6),+((2000/6)/750).toFixed(6));
eq('payoff',s.payoff,2);
eq('breakeven win rate',+s.breakEvenWinRate.toFixed(4),+(500/1500).toFixed(4));

// equity + drawdown
const curve=c.equityCurve([
 T({date:'2026-09-01',netResult:1000}),
 T({date:'2026-09-02',netResult:-400}),
 T({date:'2026-09-03',netResult:-440}),
 T({date:'2026-09-04',netResult:900}),
]);
eq('curve length',curve.length,4);
eq('final equity',curve[3].equity,1060);
const dd=c.maxDrawdown(curve);
eq('max drawdown amount',dd.amount,840);
eq('drawdown peak index',dd.fromIndex,0);
eq('drawdown trough index',dd.toIndex,2);

// distribution
const dist=c.rDistribution(acct,[T({netResult:0}),T({netResult:750}),T({netResult:-750}),T({netResult:2000})]);
const get=k=>dist.find(d=>d.key===k).count;
eq('0R bucket holds the breakeven',get('0R'),1);
eq('+1R bucket',get('+1R'),1);
eq('−1R bucket',get('−1R'),1);
eq('≥+2R bucket',get('≥+2R'),1);

// formatting
eq('money +','' + c.money(1731.6), '+$1,731.60');
eq('money −','' + c.money(-385), '−$385.00');
eq('rFmt', c.rFmt(2.3088), '+2.31R');
eq('pct', c.pct(0.6), '60.0%');
eq('shortDate', c.shortDate('2026-09-08'), '08 Sep');
eq('durationFmt', c.durationFmt(144), '2h 24m');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
