/* ============================================================
   oandasync.js — your OANDA trades, brought into the journal.

   With the OANDA key you already gave for the charts (Settings → Charts &
   prices), Laminar reads your own account: which accounts the key can see,
   one account's summary, its trades, and its transactions by number. It
   only ever reads — the desktop app refuses anything else (main.rs,
   check_oanda_path) — so a key that could trade is never used to.

   What comes across, per trade: the instrument, buy or sell, the size, the
   time and price in and out, the result in the account's money (financing
   included), and the stop and target. The stop is the one the trade was
   opened with, read off the transactions, so a stop later moved to the
   entry does not shrink the risk: the R is the R you took.

   Each trade is kept as `oanda-<account>-<trade>`, so syncing again adds
   only what is new, finishes what was still open, and never makes a second
   copy. The OANDA side is written over on every sync; what you add to a
   trade (the setup, notes, screenshots, how it felt) is never touched.

   They go into a journal account of their own, made on the first sync and
   named for the account (OANDA Demo, or OANDA). A trade from a demo
   (practice) account carries `demo: true`, and the journal says so.

   Money put in or taken out (OANDA's TRANSFER_FUNDS — a deposit, or a demo
   topped up or reset) is read too: the first one is where the account
   began, every later one a funding entry on the journal account, so the
   balance matches OANDA's while the P&L and percentages stay the trading's.
   ============================================================ */
import * as cd from './candles.js';
import { pad2, sessionFor } from './calc.js';

const PAGE = 500;              // trades a request (OANDA's most)
const TX_PAGE = 1000;          // transactions a request
const MAX_TRADE_PAGES = 20;    // 10,000 trades a sync at most
const MAX_TX_PAGES = 30;       // and 30,000 transactions; the rest wait for the next sync

const num = v => (v == null || v === '' ? null : Number(v));
const secs = v => (v == null ? null : /^\d+(\.\d+)?$/.test(String(v)) ? Number(v) : Date.parse(v) / 1000);
const localDate = T => { const d = new Date(T * 1000); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const localTime = T => { const d = new Date(T * 1000); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

/** OANDA's instrument name as you would write it: EUR_USD → EURUSD, NAS100_USD → NAS100. */
export function pairOf(inst) {
  const [a, b] = String(inst || '').split('_');
  if (!b) return a || '';
  if (/^(XAU|XAG|XPT|XPD)$/.test(a) || /^[A-Z]{3}$/.test(a) && /^[A-Z]{3}$/.test(b)) return a + b;
  const named = { NAS100: 'NAS100', SPX500: 'SPX500', US30: 'US30', DE30: 'GER40', UK100: 'UK100', JP225: 'JP225', AU200: 'AUS200', WTICO: 'USOIL', BCO: 'UKOIL' };
  return named[a] || a + b;
}
export function assetClassOf(inst) {
  const [a, b] = String(inst || '').split('_');
  if (/^(XAU|XAG|XPT|XPD|WTICO|BCO|NATGAS|CORN|SOYBN|WHEAT|SUGAR|XCU)$/.test(a)) return 'Commodities';
  if (/^[A-Z]{3}$/.test(a) && /^[A-Z]{3}$/.test(b) && !/^(BTC|ETH|LTC|BCH)$/.test(a)) return 'Forex';
  return 'Indices';
}
/** OANDA counts units; the journal reads lots where lots are the way it is said. */
export function sizeOf(inst, units) {
  const u = Math.abs(units);
  const cls = assetClassOf(inst), [a] = String(inst).split('_');
  if (cls === 'Forex') return { size: +(u / 100000).toFixed(2), sizeUnit: 'lots' };
  if (a === 'XAU') return { size: +(u / 100).toFixed(2), sizeUnit: 'lots' };
  return { size: u, sizeUnit: 'units' };
}

/* ---------- reading ---------- */
async function get(path, cred) { return JSON.parse(await cd.call(path, cred)); }

/** Every trade on the account, newest first, a page at a time. */
async function allTrades(acc, cred) {
  const out = [];
  let before = null;
  for (let page = 0; page < MAX_TRADE_PAGES; page++) {
    const j = await get(`/v3/accounts/${acc}/trades?state=ALL&count=${PAGE}${before ? `&beforeID=${before}` : ''}`, cred);
    const got = j.trades || [];
    out.push(...got);
    if (got.length < PAGE) break;
    before = Math.min(...got.map(t => Number(t.id))) - 1;
    if (!(before > 0)) break;
  }
  return out;
}

/** The stop and target each trade began with, and the money moved in or out, from the transactions after `from`. */
async function firstLevels(acc, cred, from, to) {
  const first = new Map();     // tradeID -> { sl, tp }
  const funds = [];            // { id, T, amount, why }, oldest first
  let lo = from, pages = 0;
  while (lo <= to && pages < MAX_TX_PAGES) {
    const hi = Math.min(to, lo + TX_PAGE - 1);
    const j = await get(`/v3/accounts/${acc}/transactions/idrange?from=${lo}&to=${hi}`, cred);
    for (const x of j.transactions || []) {
      if (x.type === 'TRANSFER_FUNDS' && num(x.amount)) funds.push({ id: String(x.id), T: secs(x.time), amount: num(x.amount), why: x.fundingReason || '' });
      const id = x.tradeID;
      if (!id) continue;
      const f = first.get(id) || {};
      if ((x.type === 'STOP_LOSS_ORDER' || x.type === 'GUARANTEED_STOP_LOSS_ORDER') && f.sl == null && num(x.price) != null) f.sl = num(x.price);
      if (x.type === 'TAKE_PROFIT_ORDER' && f.tp == null && num(x.price) != null) f.tp = num(x.price);
      first.set(id, f);
    }
    lo = hi + 1; pages++;
  }
  return { first, funds, upTo: lo - 1 };
}

/* a funding entry on the journal account, dated in your time like the trades */
const FUND_WHY = { CLIENT_FUNDING: 'OANDA', ACCOUNT_TRANSFER: 'OANDA transfer', DIVISION_MIGRATION: 'OANDA', SITE_MIGRATION: 'OANDA', ADJUSTMENT: 'OANDA adjustment' };
const fundingOf = x => {
  const d = new Date((x.T || Date.now() / 1000) * 1000);
  return { id: 'oanda-tx-' + x.id, kind: 'funding', amount: Math.round(x.amount * 100) / 100, date: localDate(d / 1000),
    at: `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`, note: FUND_WHY[x.why] || 'OANDA' };
};

/* ---------- one OANDA trade, as a journal trade ---------- */
export function toJournal(o, { accountId, acctKey, startingBalance, demo, first, playbook }) {
  const inst = o.instrument;
  const units = num(o.initialUnits) || 0;
  const open = o.state !== 'CLOSED';
  const T0 = secs(o.openTime), T1 = open ? null : secs(o.closeTime);
  const entry = num(o.price), exit = open ? null : num(o.averageClosePrice);
  const sl = first?.sl ?? num(o.stopLossOrder?.price) ?? num(o.guaranteedStopLossOrder?.price);
  const tp = first?.tp ?? num(o.takeProfitOrder?.price);
  const net = open ? null : (num(o.realizedPL) || 0) + (num(o.financing) || 0) + (num(o.dividendAdjustment) || 0);
  /* the risk in the account's money: the stop's distance, at what a point
     was worth on this very trade (its result over its move) */
  let riskPercent = null;
  if (!open && sl != null && entry != null && exit != null && exit !== entry && startingBalance > 0) {
    const perPoint = Math.abs((num(o.realizedPL) || 0) / ((exit - entry) * units));
    const risk = Math.abs(entry - sl) * Math.abs(units) * perPoint;
    if (isFinite(risk) && risk > 0) riskPercent = +(risk / startingBalance * 100).toFixed(4);
  }
  const date = localDate(T0), timeOpen = localTime(T0);
  const session = playbook ? sessionFor(playbook, timeOpen) : null;
  return {
    id: `oanda-${acctKey}-${o.id}`,
    oanda: { account: acctKey, trade: String(o.id) },
    accountId, demo: !!demo, source: demo ? 'OANDA demo' : 'OANDA',
    assetClass: assetClassOf(inst), pair: pairOf(inst), side: units < 0 ? 'sell' : 'buy',
    date, timeOpen, timeClose: T1 != null ? localTime(T1) : null,
    ...(T1 != null && localDate(T1) !== date ? { closeDate: localDate(T1) } : {}),
    entryPrice: entry, exitPrice: exit, stopLoss: sl, takeProfit: tp,
    ...sizeOf(inst, units),
    status: open ? 'open' : 'closed',
    netResult: net, riskPercent,
    sessionId: session ? session.id : null, sessionAuto: true,
  };
}
/* what OANDA owns on a trade, written over on every sync */
const THEIRS = ['oanda', 'accountId', 'demo', 'source', 'assetClass', 'pair', 'side', 'date', 'timeOpen', 'timeClose', 'closeDate',
  'entryPrice', 'exitPrice', 'size', 'sizeUnit', 'status', 'netResult'];
/* …and what it only fills in: once a trade is closed and has a stop, a
   target and a risk, a change you made to them stands */
const FILLS = ['stopLoss', 'takeProfit', 'riskPercent'];

/* ---------- the sync ---------- */
/**
 * Bring the account's trades in. Returns { added, updated, open, account }.
 * Throws with a plain-words message when it cannot.
 */
export async function syncOanda(store, { onStep } = {}) {
  const cred = await cd.getKey();
  if (!cred) throw new Error('Add your OANDA key first — Settings → Charts & prices.');
  const step = s => { try { onStep?.(s); } catch { /* only a progress note */ } };
  const A = store.data.accounts;
  const link = A.oanda && typeof A.oanda === 'object' ? A.oanda : {};

  step('Finding your account…');
  const list = (await get('/v3/accounts', cred)).accounts || [];
  if (!list.length) throw new Error('That key can see no OANDA account.');
  const acc = (link.accountId && list.find(a => a.id === link.accountId)) ? link.accountId : list[0].id;
  const sum = (await get(`/v3/accounts/${acc}/summary`, cred)).account || {};
  const last = Number(sum.lastTransactionID) || 0;
  const demo = !cred.live;

  step('Reading your trades…');
  const trades = await allTrades(acc, cred);

  step('Reading your stops…');
  const from = link.accountId === acc && Number(link.lastTxn) > 0 ? Number(link.lastTxn) + 1 : 1;
  const { first, funds, upTo } = last >= from ? await firstLevels(acc, cred, from, last) : { first: new Map(), funds: [], upTo: Number(link.lastTxn) || 0 };

  /* the journal account they go into: the one linked before, else a new one,
     opened on the day of its first trade */
  let jr = link.laminarId && A.accounts.find(a => a.id === link.laminarId);
  let later = funds;
  if (!jr) {
    const balance = num(sum.balance) || 0;
    const made = (num(sum.pl) || 0) + (num(sum.financing) || 0) - Math.abs(num(sum.commission) || 0);
    const firstT = Math.min(...trades.map(o => secs(o.openTime)).filter(Number.isFinite));
    /* where it began: the balance less what the trading made and less every
       top-up after the first money in (that one is the start itself) */
    later = from === 1 ? funds.slice(1) : funds;
    const toppedUp = later.reduce((s, x) => s + x.amount, 0);
    const start = Math.round((balance - made - toppedUp) * 100) / 100;
    /* made beside the others, not switched to: the journal stays on the account you were reading
       (a sync that jumped to the new account looked like every other trade had gone) */
    const reading = A.activeAccountId;
    jr = await store.addAccount({ name: demo ? 'OANDA Demo' : 'OANDA', currency: sum.currency || 'USD',
      startingBalance: start > 0 ? start : balance, kind: 'live', firm: 'oanda', defaultRiskPercent: 1,
      ...(Number.isFinite(firstT) ? { openedAt: localDate(firstT) } : {}) });
    if (reading && A.accounts.some(a => a.id === reading)) A.activeAccountId = reading;
  }
  /* each top-up, withdrawal or reset once, as funding (never as profit) */
  const seen = new Set((jr.adjustments || []).map(x => x.id));
  const fresh = later.map(fundingOf).filter(x => !seen.has(x.id));
  if (fresh.length) jr.adjustments = [...(jr.adjustments || []), ...fresh];

  /* in, without a second copy of anything */
  const byId = new Map(store.data.trades.trades.map(t => [t.id, t]));
  let added = 0, updated = 0, open = 0;
  for (const o of trades) {
    if (!o.id || !o.instrument || !o.openTime) continue;
    const id = `oanda-${acc}-${o.id}`;
    const had = byId.get(id);
    const known = had ? { sl: had.stopLoss ?? undefined, tp: had.takeProfit ?? undefined } : null;
    const t = toJournal(o, { accountId: jr.id, acctKey: acc, startingBalance: jr.startingBalance, demo,
      first: first.get(String(o.id)) || known, playbook: store.playbook });
    if (t.status === 'open') open++;
    if (!had) {
      store.data.trades.trades.push({ ...t, createdAt: new Date().toISOString(), setupId: null, tagIds: [], grade: null, notes: '' });
      added++;
    } else {
      const keys = [...THEIRS, ...FILLS], before = JSON.stringify(keys.map(k => had[k]));
      /* still open, or arriving in another account (its risk is a share of that account's balance): filled again */
      const wasOpen = had.status === 'open', moved = had.accountId !== t.accountId;
      for (const k of FILLS) if (t[k] != null && (had[k] == null || wasOpen || moved)) had[k] = t[k];
      for (const k of THEIRS) { if (k in t) had[k] = t[k]; else delete had[k]; }
      if (had.sessionAuto !== false) had.sessionId = t.sessionId;
      if (JSON.stringify(keys.map(k => had[k])) !== before) updated++;
    }
  }
  A.oanda = { ...link, accountId: acc, laminarId: jr.id, live: !!cred.live, lastTxn: upTo, syncedAt: new Date().toISOString(),
    auto: link.auto !== false };
  await store.save('trades');
  await store.save('accounts');
  return { added, updated, open, funded: fresh.length, account: jr };
}

/** Whether a sync should run by itself when the journal opens. */
export const autoSyncs = store => !!(store.data.accounts?.oanda?.laminarId && store.data.accounts.oanda.auto !== false);
