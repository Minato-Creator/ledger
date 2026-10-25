/* A realistic stretch of live trading and forward testing, Aug–Sep 2026,
   shared by the look-at-it script and the test suite. */
export const ACCT = {id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
  color:'#18AC65',openedAt:'2026-07-01',archived:false,weeklyTargetPercent:2};
let n = 0;
const L = (date, timeOpen, timeClose, pair, side, net, risk = 1, extra = {}) =>
  ({ id: 'L' + (++n), accountId: 'acc_1', date, timeOpen, timeClose, pair, side, netResult: net, riskPercent: risk,
     entryPrice: 1, stopLoss: 1, exitPrice: 1, status: 'closed', mode: 'live', tagIds: [], setupId: 's_a', notes: '', ...extra });
const F = (date, timeOpen, timeClose, pair, side, r, extra = {}) =>
  ({ id: 'F' + (++n), accountId: 'acc_1', date, timeOpen, timeClose, pair, side, netResult: null, rMultiple: r,
     riskPercent: 1, status: 'closed', mode: 'forward', tagIds: [], setupId: 's_b', notes: '', ...extra });
export const TRADES = [
  // W33 10–16 Aug
  L('2026-08-11','15:10','16:00','XAUUSD','buy', 1200), L('2026-08-12','21:00','21:40','NAS100','sell', -1000),
  // W34 17–23 Aug
  L('2026-08-18','15:30','16:10','XAUUSD','buy', 2000), L('2026-08-19','15:30','16:10','AUDUSD','sell', 1000),
  F('2026-08-20','16:00','17:00','XAUUSD','buy', 2.1),
  // W35 24–30 Aug
  L('2026-08-25','15:05','15:50','XAUUSD','buy', -1000), L('2026-08-25','16:30','17:10','XAUUSD','buy', -1000),
  L('2026-08-27','21:10','22:00','NAS100','buy', 3000),
  F('2026-08-26','15:00','16:00','NAS100','buy', -1), F('2026-08-28','15:00','16:00','NAS100','buy', 1.5),
  // W36 31 Aug – 6 Sep
  L('2026-09-01','15:00','16:00','XAUUSD','sell', 1500, 1.5), F('2026-09-02','15:00','16:00','AUDUSD','buy', 3),
  // W37 7–13 Sep  — forward tests only
  F('2026-09-08','15:00','16:00','XAUUSD','buy', -1), F('2026-09-09','15:00','16:00','XAUUSD','buy', -1),
  F('2026-09-10','15:00','16:00','XAUUSD','buy', 2.5),
  // W38 14–20 Sep  — the busy one
  L('2026-09-14','16:00','17:00','XAUUSD','buy', -1000), L('2026-09-14','18:00','19:00','XAUUSD','sell', -1000),
  L('2026-09-15','16:00','17:00','NAS100','buy', 2500), L('2026-09-16','16:00','17:00','AUDUSD','sell', -500, 0.5),
  L('2026-09-17','16:00','17:00','XAUUSD','buy', 20, 1, { outcome: 'breakeven' }),
  L('2026-09-18','21:30','22:30','NAS100','sell', 1800),
  F('2026-09-14','15:00','15:40','XAUUSD','buy', 2), F('2026-09-15','15:00','15:40','XAUUSD','sell', -1),
  F('2026-09-16','15:00','15:40','NAS100','buy', 1.2), F('2026-09-19','10:00','11:00','XAUUSD','buy', 0.5),
  // W39 21–27 Sep
  L('2026-09-22','15:00','16:00','XAUUSD','buy', 900), F('2026-09-23','15:00','16:00','XAUUSD','buy', -1),
  // W40 28 Sep – 4 Oct (the current week, today is 29 Sep) — one open live trade
  L('2026-09-28','15:00','','XAUUSD','buy', null, 1.25, { status: 'open', exitPrice: null }),
];
export const PB = { version: 4,
  setups: [{ id: 's_a', name: 'FVG continuation', color: '#0988F0', rules: [] },
           { id: 's_b', name: 'Liquidity sweep', color: '#18AC65', rules: [] }],
  sessions: [{ id: 'ses_l', name: 'London', start: '15:00', end: '19:00' }],
  tagGroups: [], rules: { maxTradesPerDay: 3, dailyLossCapPercent: 2 }, replay: { windowMins: 15, csvClock: 'local' } };
