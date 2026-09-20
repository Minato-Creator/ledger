/* ============================================================
   broker.js — reading a CSV out of a broker or prop firm.

   Every platform exports something different, so this makes as few
   assumptions as it can get away with:

   • Columns are found by a list of accepted spellings, never by position.
   • Two shapes are recognised. Some platforms hand you TRADES — one row,
     both prices, often a P&L. Others hand you ORDERS — every fill and every
     cancellation, and the trades have to be reconstructed from them.
   • Dates are the usual minefield. 09/09 tells you nothing, so the format is
     decided by scanning the WHOLE file for a day above 12 rather than
     guessing row by row and ending up with a mix.
   • Money is never invented. A points move is not a dollar amount until you
     say what a point is worth, and that stays your answer to give.
   ============================================================ */
import { parseCSV } from './csv.js';
import { parseNumber, cleanSymbol } from './calc.js';
export { cleanSymbol };

const norm = h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const FIELDS = {
  time:      ['time', 'date', 'datetime', 'datetime', 'ordertime', 'filltime', 'executiontime',
              'transactiontime', 'transactiondate', 'placedtime', 'opentime', 'entrytime',
              'timestamp', 'tradedate', 'closedate', 'closetime'],
  /* Some exports — Quire's own among them — keep the day in one column and
     the clock in another. Where that happens the two are put back together. */
  openTime:  ['timeopen', 'opentime', 'entrytime', 'timein', 'openclock'],
  closeTime: ['closetime', 'timeclose', 'exittime', 'closedate', 'exitdate', 'dateclosed', 'timeclosed'],
  symbol:    ['symbol', 'instrument', 'contract', 'ticker', 'market', 'product', 'pair', 'asset'],
  qty:       ['qty', 'quantity', 'size', 'volume', 'lots', 'filledqty', 'amount', 'contracts',
              'positionsize', 'shares', 'units'],
  side:      ['side', 'action', 'direction', 'buysell', 'bs', 'ordersid', 'type', 'longshort',
              'positiontype', 'tradetype'],
  price:     ['avgprice', 'fillprice', 'price', 'executedprice', 'avgfillprice', 'averageprice',
              'entryprice', 'openprice', 'avgentryprice', 'filledprice'],
  exitPrice: ['exitprice', 'closeprice', 'avgexit', 'avgcloseprice', 'avgexitprice', 'sellprice'],
  pnl:       ['pnl', 'realizedpnl', 'realisedpnl', 'netpnl', 'profit', 'profitloss', 'netprofit',
              'grossp l', 'grosspl', 'netpl', 'rpnl', 'result', 'netresult'],
  commission:['commission', 'commissions', 'fee', 'fees', 'comm', 'brokerage'],
  status:    ['status', 'state', 'orderstatus', 'filled'],
  orderType: ['ordertype', 'type', 'ordkind'],
};

export function mapColumns(headers) {
  const seen = headers.map(h => ({ raw: h, key: norm(h) }));
  const out = {};
  for (const [field, names] of Object.entries(FIELDS)) {
    // longest matching alias wins, so "avgprice" beats a bare "price"
    let best = null;
    for (const h of seen) {
      const i = names.indexOf(h.key);
      if (i === -1) continue;
      if (!best || i < best.i) best = { raw: h.raw, i };
    }
    out[field] = best ? best.raw : null;
  }
  // A column can only answer one question. `type` is a common alias for both
  // side and order type; if a real side column exists, let it have it.
  if (out.side && out.orderType && out.side === out.orderType) out.orderType = null;
  if (out.time && out.closeTime && out.time === out.closeTime) out.closeTime = null;
  if (out.time && out.openTime && out.time === out.openTime) out.openTime = null;
  return out;
}

/* ---------- dates ----------
   Decided once for the file, applied to every row. */
function detectDayFirst(values) {
  let dayFirst = null;
  for (const v of values) {
    const m = String(v).match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (!m) continue;
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) return true;      // 25/03 — unambiguous
    if (b > 12 && a <= 12) return false;     // 03/25 — unambiguous
  }
  return dayFirst;                            // null: never resolved, all ambiguous
}

function parseStamp(raw, dayFirst, clock) {
  const s = String(raw || '').trim();
  if (!s) return null;
  /* The clock comes from the stamp itself where there is one, and from its own
     column where the export keeps them apart. */
  const time = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
    || String(clock || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const hh = time ? +time[1] : 0, mi = time ? +time[2] : 0;

  let iso = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return { y: +iso[1], mo: +iso[2], d: +iso[3], hh, mi };

  const m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) return null;
  let a = +m[1], b = +m[2], y = +m[3];
  if (y < 100) y += 2000;
  let d, mo;
  if (a > 12) { d = a; mo = b; }
  else if (b > 12) { mo = a; d = b; }
  else if (dayFirst === true) { d = a; mo = b; }
  else if (dayFirst === false) { mo = a; d = b; }
  else { d = a; mo = b; }            // wholly ambiguous file — say so upstream
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d, hh, mi };
}

const pad = n => String(n).padStart(2, '0');
const shift = (st, hours) => {
  const t = Date.UTC(st.y, st.mo - 1, st.d, st.hh, st.mi) + hours * 3600e3;
  const x = new Date(t);
  return { date: `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`,
           time: `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`,
           stamp: t };
};

const SHORT = /^(s|sell|short|sld|sell short|sellshort|-1)$/i;
const isFilled = v => {
  const t = String(v || '').trim().toLowerCase();
  if (!t) return true;                       // no status column: assume it happened
  return /fill|execut|closed|complete|done/.test(t) && !/cancel|reject|expire|pending|working|new/.test(t);
};

/**
 * Read a broker CSV. Returns the shape it found and the closed trades in it.
 *
 *   shape 'trades' — each row was already a round trip
 *   shape 'orders' — rows were fills, and positions were matched FIFO
 */
export function parseBrokerCSV(text, { offsetHours = 0 } = {}) {
  const rows = parseCSV(text);
  if (!rows.length) return { ok: false, reason: 'That file has no rows in it.', trades: [], skipped: [] };

  const headers = Object.keys(rows[0]);
  const col = mapColumns(headers);
  const get = (r, f) => (col[f] ? r[col[f]] : '');

  if (!col.time)   return { ok: false, reason: 'No date or time column found.', headers, mapped: col, trades: [], skipped: [] };
  if (!col.symbol) return { ok: false, reason: 'No instrument column found.', headers, mapped: col, trades: [], skipped: [] };
  if (!col.side)   return { ok: false, reason: 'No buy/sell column found.', headers, mapped: col, trades: [], skipped: [] };

  const dayFirst = detectDayFirst(rows.map(r => get(r, 'time')));
  const ambiguousDates = dayFirst === null;

  /* Already-paired rows carry both ends of the trade, or a realised P&L.
     Anything else is a list of fills we have to reconstruct from. */
  const shape = (col.exitPrice || (col.pnl && col.closeTime)) ? 'trades' : 'orders';
  const skipped = [];

  if (shape === 'trades') {
    const trades = [];
    rows.forEach((r, i) => {
      const st = parseStamp(get(r, 'time'), dayFirst, get(r, 'openTime'));
      if (!st) { skipped.push({ row: i + 2, why: 'could not read the date' }); return; }
      const open = shift(st, offsetHours);
      /* A close column that is only a clock — "10:00" — belongs to the day the
         trade opened on. Reading it as no time at all would throw away the
         one thing it was telling you. */
      const closeRaw = col.closeTime ? String(get(r, 'closeTime') || '').trim() : '';
      let cs = closeRaw ? parseStamp(closeRaw, dayFirst) : null;
      if (!cs && /^\d{1,2}:\d{2}/.test(closeRaw)) {
        const m = closeRaw.match(/(\d{1,2}):(\d{2})/);
        cs = { ...st, hh: +m[1], mi: +m[2] };
      }
      const close = cs ? shift(cs, offsetHours) : null;
      trades.push({
        date: open.date, timeOpen: open.time, timeClose: close ? close.time : null,
        pair: cleanSymbol(get(r, 'symbol')),
        side: SHORT.test(String(get(r, 'side')).trim()) ? 'sell' : 'buy',
        entryPrice: parseNumber(get(r, 'price')),
        exitPrice: parseNumber(get(r, 'exitPrice')),
        size: parseNumber(get(r, 'qty')),
        commission: parseNumber(get(r, 'commission')) ?? 0,
        pnl: col.pnl ? parseNumber(get(r, 'pnl')) : null,
      });
    });
    return finish(trades, { ok: true, shape, headers, mapped: col, skipped, ambiguousDates });
  }

  /* ---------- orders: rebuild the positions ---------- */
  const fills = [];
  rows.forEach((r, i) => {
    if (!isFilled(get(r, 'status'))) { skipped.push({ row: i + 2, why: 'not a fill' }); return; }
    const st = parseStamp(get(r, 'time'), dayFirst, get(r, 'openTime'));
    if (!st) { skipped.push({ row: i + 2, why: 'could not read the date' }); return; }
    const price = parseNumber(get(r, 'price'));
    if (price == null) { skipped.push({ row: i + 2, why: 'no fill price' }); return; }
    const qty = Math.abs(parseNumber(get(r, 'qty')) ?? 1) || 1;
    const when = shift(st, offsetHours);
    fills.push({
      ...when, symbol: cleanSymbol(get(r, 'symbol')),
      side: SHORT.test(String(get(r, 'side')).trim()) ? 'sell' : 'buy',
      qty, price, commission: Math.abs(parseNumber(get(r, 'commission')) ?? 0),
    });
  });

  return finish(pairFills(fills), { ok: true, shape, headers, mapped: col, skipped, ambiguousDates, fills: fills.length });
}

/**
 * Turn a list of fills into closed trades, first in first out, per instrument.
 *
 * A fill on the opposite side closes what is open before it opens anything
 * new, and a fill big enough to do both does both — which is what a reversal
 * looks like in an order log. Whatever is still open at the end is reported
 * separately rather than invented into a trade.
 */
export function pairFills(fills) {
  const byTime = fills.slice().sort((a, b) => a.stamp - b.stamp);
  const books = new Map();                    // symbol -> open lots, oldest first
  const trades = [], open = [];

  for (const f of byTime) {
    if (!books.has(f.symbol)) books.set(f.symbol, []);
    const book = books.get(f.symbol);
    let left = f.qty;
    const perUnitFee = f.qty ? f.commission / f.qty : 0;

    while (left > 0 && book.length && book[0].side !== f.side) {
      const lot = book[0];
      const take = Math.min(left, lot.qty);
      const points = lot.side === 'buy' ? (f.price - lot.price) : (lot.price - f.price);
      trades.push({
        date: lot.date, timeOpen: lot.time,
        closeDate: f.date, timeClose: f.time,
        pair: f.symbol, side: lot.side,
        entryPrice: lot.price, exitPrice: f.price,
        size: take, points: +(points * take).toFixed(6),
        commission: +((lot.perUnitFee + perUnitFee) * take).toFixed(4),
      });
      lot.qty -= take; left -= take;
      if (lot.qty <= 1e-9) book.shift();
    }
    if (left > 0) book.push({ ...f, qty: left, perUnitFee });
  }

  for (const [symbol, book] of books)
    for (const lot of book) open.push({ symbol, side: lot.side, qty: lot.qty, price: lot.price, date: lot.date, time: lot.time });

  trades.sort((a, b) => (a.date + a.timeOpen).localeCompare(b.date + b.timeOpen));
  return { trades, stillOpen: open };
}

function finish(result, meta) {
  const { trades, stillOpen } = Array.isArray(result) ? { trades: result, stillOpen: [] } : result;
  return { ...meta, trades, stillOpen: stillOpen || [] };
}

/** Every instrument the import touched, so each can be given a point value. */
export function instrumentsIn(trades) {
  const m = new Map();
  for (const t of trades) m.set(t.pair, (m.get(t.pair) || 0) + 1);
  return [...m.entries()].map(([pair, count]) => ({ pair, count }));
}

/**
 * What a trade made, once you have said what a point is worth.
 * Commission comes off, because that is money that actually left.
 */
export function moneyFor(trade, pointValue) {
  if (trade.pnl != null) return trade.pnl;                 // the file already knew
  const v = Number(pointValue);
  if (!isFinite(v) || v <= 0) return null;
  const points = trade.points != null ? trade.points
    : trade.entryPrice != null && trade.exitPrice != null
      ? (trade.side === 'buy' ? trade.exitPrice - trade.entryPrice : trade.entryPrice - trade.exitPrice) * (trade.size || 1)
      : null;
  if (points == null) return null;
  return +(points * v - (trade.commission || 0)).toFixed(2);
}

/* ------------------------------------------------------------------
   Sensible starting points, not answers.

   Futures contracts have published point values, so offering one saves
   typing — but it is offered as a filled-in field you can see and change,
   never as a number quietly applied behind your back. Anything not on this
   list arrives blank and stays blank until you say what it is worth.
   ------------------------------------------------------------------ */
const CONTRACTS = {
  ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5,
  GC: 100, MGC: 10, SI: 5000, SIL: 1000, HG: 25000, MHG: 2500,
  CL: 1000, MCL: 100, NG: 10000, QG: 2500,
  ZB: 1000, ZN: 1000, ZF: 1000, ZT: 2000,
  '6E': 125000, '6B': 62500, '6J': 12500000, '6A': 100000, '6C': 100000,
  M6E: 12500, M6A: 10000, MBT: 0.1, BTC: 5, MET: 0.1,
};

const stripMonth = s => String(s || '').toUpperCase().replace(/[FGHJKMNQUVXZ]\d{1,2}$/, '');

export function suggestedPointValue(pair) {
  const s = stripMonth(pair);
  return CONTRACTS[s] ?? null;
}

const FX = /^(AUD|CAD|CHF|EUR|GBP|JPY|NZD|USD|SGD|HKD|NOK|SEK|MXN|ZAR|TRY|CNH)(AUD|CAD|CHF|EUR|GBP|JPY|NZD|USD|SGD|HKD|NOK|SEK|MXN|ZAR|TRY|CNH)$/;
const METAL = /^(XAU|XAG|XPT|XPD|GOLD|SILVER|GC|MGC|SI|SIL|HG|MHG|CL|MCL|NG)/;
const INDEX = /^(ES|MES|NQ|MNQ|YM|MYM|RTY|M2K|US30|US100|US500|NAS|SPX|DAX|GER|UK100|FTSE|JP225|NIK|HSI|AUS200)/;

/** A first guess at the asset class, so the class chip is not always wrong. */
export function guessAssetClass(pair) {
  const s = stripMonth(pair);
  if (FX.test(s)) return 'Forex';
  if (INDEX.test(s)) return 'Indices';
  if (METAL.test(s)) return 'Commodities';
  return 'Futures';
}
