/* ============================================================
   replay.js — reading an FX Replay export.

   FX Replay names its columns dateStart / pair / side / avgRiskReward /
   entryPrice / initialSL / rPnL / balance / initialBalance. Exports change
   over time and other tools name things differently, so every column is
   found by a list of accepted spellings rather than an exact position, and
   a missing optional column is simply absent rather than fatal.

   Two things about the numbers, both deliberate:

   • The dollar columns (rPnL, balance) are read but never compared against
     your live account. Your replay account is a different size, so the same
     trade is a different dollar figure there. R is the only fair unit.

   • avgRiskReward IS the R multiple, used as-is. It is what the replay tool
     measured, and re-deriving it from entryPrice and initialSL would only
     add our rounding to theirs. Those two are kept so the view can show the
     stop distance, not to recompute R.
   ============================================================ */
import { parseCSV } from './csv.js';
import { sessionFor, cleanSymbol } from './calc.js';

const FIELDS = {
  id:      ['id', 'tradeid', 'ticket', 'orderid'],
  status:  ['status', 'state'],
  date:    ['datestart', 'date', 'opendate', 'entrydate', 'opentime', 'entrytime', 'time', 'datetime'],
  dateEnd: ['dateend', 'closedate', 'closetime', 'exittime', 'exitdate'],
  pair:    ['pair', 'symbol', 'instrument', 'ticker', 'market'],
  side:    ['side', 'direction', 'type', 'position', 'longshort'],
  r:       ['avgriskreward', 'riskreward', 'rmultiple', 'rr', 'r', 'realisedrr', 'realizedrr'],
  entry:   ['entryprice', 'avgentry', 'entry', 'openprice', 'avgentryprice'],
  stop:    ['initialsl', 'stoploss', 'sl', 'stop', 'initialstop'],
  exit:    ['exitprice', 'avgexit', 'closeprice', 'avgexitprice', 'avgcloseprice'],
  pnl:     ['rpnl', 'pnl', 'profit', 'netpnl', 'profitloss', 'realisedpnl', 'realizedpnl', 'netprofit'],
  balance: ['balance', 'equity', 'closingbalance', 'currentrealizedbalance', 'currentrealisedbalance'],
  initial: ['initialbalance', 'startingbalance', 'startbalance'],
  size:    ['size', 'lots', 'lotsize', 'positionsize', 'volume', 'quantity', 'amount'],
};

const norm = h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Which CSV header answers to each field we know about. */
export function mapHeaders(headers) {
  const seen = headers.map(h => ({ raw: h, key: norm(h) }));
  const out = {};
  for (const [field, names] of Object.entries(FIELDS)) {
    const exact = seen.find(h => names.includes(h.key));
    out[field] = exact ? exact.raw : null;
  }
  return out;
}

/* FX Replay writes an ISO-ish timestamp. Accept a few other shapes too, but
   never guess between day-first and month-first: an unambiguous ISO date is
   read as ISO, and anything else is only accepted when the day is > 12 so
   there is nothing to guess about. */
function parseStamp(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  // Year first, however it is punctuated: 2026-09-01, 2026/09/01, 2026.09.01
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[T ,]*(\d{1,2})?:?(\d{2})?/);
  if (m) return { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0) };
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})[T ,]*(\d{1,2})?:?(\d{2})?/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) return { y: +m[3], mo: b, d: a, h: +(m[4] || 0), mi: +(m[5] || 0) };
    if (b > 12 && a <= 12) return { y: +m[3], mo: a, d: b, h: +(m[4] || 0), mi: +(m[5] || 0) };
    return null;   // 05/03/2026 could be either — refuse rather than invent
  }
  return null;
}

/** Move a parsed stamp by whole hours and hand back { date, time }. */
/* ============================================================
   Which clock a CSV is written on

   FX Replay writes the clock you were looking at while you took the trade.
   Its export said 2026/09/15 17:14:55 and its own screen said 5:14:55 PM —
   the same instant, on your clock, with nothing to convert. Treating those
   stamps as UTC and adding eight hours moved every backtest into the next
   session, which is how a week that lined up exactly came out as nothing
   matched.

   So an export we recognise as FX Replay's is read exactly as written, and
   no setting can move it. The switch is for the other kind of file — an
   export genuinely written in UTC — and when it is used the machine does the
   conversion, so it stays right through daylight saving at both ends rather
   than being a number somebody typed once.
   ============================================================ */
const FXR_MARKS = ['upnl', 'rpnl', 'avgriskreward', 'maxriskreward',
                   'initialsl', 'amountclosed', 'currentrealizedbalance', 'datestart'];

export function looksLikeFxReplay(headers) {
  const seen = new Set((headers || []).map(h => String(h).toLowerCase().replace(/[^a-z]/g, '')));
  return FXR_MARKS.filter(m => seen.has(m)).length >= 3;
}

/** A stamp put on your clock, given which clock it was written on. */
export function onClock(st, clock) {
  const p = n => String(n).padStart(2, '0');
  /* Already yours: read as written. Not a conversion — a conversion is what
     put these trades eight hours out. */
  if (clock !== 'utc') {
    return { date: `${st.y}-${p(st.mo)}-${p(st.d)}`, time: `${p(st.h)}:${p(st.mi)}` };
  }
  const d = new Date(Date.UTC(st.y, st.mo - 1, st.d, st.h, st.mi));
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
           time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

export function shiftStamp(st, hours) {
  const t = Date.UTC(st.y, st.mo - 1, st.d, st.h, st.mi) + hours * 3600e3;
  const d = new Date(t);
  const p = n => String(n).padStart(2, '0');
  return { date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
           time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
}

const SHORT = /^(s|sell|short|down|▼|-1)$/i;

function toNumber(v) {
  if (v == null) return null;
  const s = String(v).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1').replace(/R$/i, '');
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  return Number(s);
}

/**
 * Turn CSV text into replay trades on your clock.
 *
 * Returns { trades, skipped, headers, mapped, missing } — never throws on a
 * bad row. A row we cannot read is counted and reported, not dropped silently.
 */
export function parseReplayCSV(text, playbook, opts = {}) {
  const records = parseCSV(text);
  if (!records.length) return { trades: [], skipped: [], headers: [], mapped: {}, missing: ['date', 'pair', 'side', 'r'],
                                source: 'generic', clock: 'local' };

  const headers = Object.keys(records[0]);
  const source = looksLikeFxReplay(headers) ? 'fxreplay' : 'generic';
  /* An FX Replay export is on your clock whatever the switch says — the file
     itself is the evidence, and a setting cannot make it otherwise. */
  const clock = source === 'fxreplay' ? 'local' : (opts.clock === 'utc' ? 'utc' : 'local');
  /* The old hours-to-add form, kept so a caller that means a raw shift still
     gets one. Nothing in the app passes it. */
  const put = opts.offsetHours != null ? (st => shiftStamp(st, opts.offsetHours))
                                       : (st => onClock(st, clock));

  const mapped = mapHeaders(headers);
  const missing = ['date', 'pair', 'side', 'r'].filter(f => !mapped[f]);
  if (missing.length) return { trades: [], skipped: [], headers, mapped, missing, source, clock };

  const get = (rec, f) => (mapped[f] ? rec[mapped[f]] : '');
  const trades = [], skipped = [];

  records.forEach((rec, i) => {
    const status = String(get(rec, 'status') || '').trim().toLowerCase();
    if (status && !/^(closed|close|filled|complete[d]?)$/.test(status)) {
      skipped.push({ row: i + 2, why: `still ${status}` }); return;
    }
    const st = parseStamp(get(rec, 'date'));
    if (!st) { skipped.push({ row: i + 2, why: 'could not read the date' }); return; }
    /* FX Replay writes the platform's own name — OANDA:XAUUSD. The journal
       keeps the instrument, not the platform, so it reads the same as the
       trade you typed and can be matched against it. */
    const pair = cleanSymbol(get(rec, 'pair'));
    if (!pair) { skipped.push({ row: i + 2, why: 'no instrument' }); return; }
    const r = toNumber(get(rec, 'r'));
    if (r == null) { skipped.push({ row: i + 2, why: 'no R multiple' }); return; }

    const { date, time } = put(st);
    const endRaw = mapped.dateEnd ? parseStamp(get(rec, 'dateEnd')) : null;
    const end = endRaw ? put(endRaw) : null;

    trades.push({
      id: 'rp_' + (String(get(rec, 'id') || '').trim() || date + '_' + time.replace(':', '') + '_' + i),
      date, timeOpen: time, timeClose: end ? end.time : null,
      pair, side: SHORT.test(String(get(rec, 'side')).trim()) ? 'sell' : 'buy',
      rMultiple: r,
      entryPrice: toNumber(get(rec, 'entry')),
      stopPrice: toNumber(get(rec, 'stop')),
      exitPrice: toNumber(get(rec, 'exit')),
      pnl: toNumber(get(rec, 'pnl')),
      size: toNumber(get(rec, 'size')),
      sessionId: sessionFor(playbook, time)?.id ?? null,
    });
  });

  const initial = toNumber(get(records[0], 'initial'));
  return { trades, skipped, headers, mapped, missing: [], initialBalance: initial, source, clock };
}

/* ---------- ISO weeks ----------
   Monday-first, matching the calendar. A week is identified as 2026-W36 so
   the files sort themselves in the folder. */
export function isoWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7;              // Mon = 0
  dt.setUTCDate(dt.getUTCDate() - day + 3);          // the Thursday of this week
  const year = dt.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((dt - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function weekKey(y, w) { return `${y}-W${String(w).padStart(2, '0')}`; }

/** Monday and Sunday of an ISO week, as YYYY-MM-DD. */
export function weekRange(key) {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const mondayW1 = new Date(jan4);
  mondayW1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const start = new Date(mondayW1);
  start.setUTCDate(mondayW1.getUTCDate() + (w - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const iso = d => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

/** How many ISO weeks a year has — 52, or 53 when it starts or leaps onto a Thursday. */
export function weeksInYear(y) {
  const dow = n => (new Date(Date.UTC(n, 0, 1)).getUTCDay() + 6) % 7;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return dow(y) === 3 || (leap && dow(y) === 2) ? 53 : 52;
}

export function groupByWeek(trades) {
  const m = new Map();
  for (const t of trades) {
    const k = isoWeek(t.date);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(t);
  }
  return m;
}
