/* ============================================================
   candles.js — the day's price, for looking at a trade on a chart.

   Candles come from OANDA, with your own free demo key (kept on this
   computer, never in the vault). They are for looking only: a broker's
   prices are never quite another's, so nothing in the journal is ever
   worked out from them.

   One-minute candles are fetched a UTC day at a time and kept in the vault
   as plain JSON — candles/XAU_USD/2026-09-15.json — so a day is downloaded
   once and works offline after. Bigger timeframes are built from those.
   ============================================================ */
import { fs, isTauri } from './fs.js';

/* ---------- which instrument ---------- */
const FX = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'ZAR', 'MXN', 'PLN', 'TRY', 'CNH', 'CZK', 'HUF'];
const NAMED = {
  NAS100: 'NAS100_USD', NAS: 'NAS100_USD', USTEC: 'NAS100_USD', US100: 'NAS100_USD', NDX: 'NAS100_USD', NQ: 'NAS100_USD', MNQ: 'NAS100_USD',
  US30: 'US30_USD', DJ30: 'US30_USD', YM: 'US30_USD', MYM: 'US30_USD',
  SPX500: 'SPX500_USD', US500: 'SPX500_USD', SPX: 'SPX500_USD', ES: 'SPX500_USD', MES: 'SPX500_USD',
  GER40: 'DE30_EUR', DE40: 'DE30_EUR', DE30: 'DE30_EUR', DAX: 'DE30_EUR',
  UK100: 'UK100_GBP', FTSE: 'UK100_GBP', JP225: 'JP225_USD', NIKKEI: 'JP225_USD', AUS200: 'AU200_AUD', AU200: 'AU200_AUD',
  GOLD: 'XAU_USD', GC: 'XAU_USD', MGC: 'XAU_USD', SILVER: 'XAG_USD', SI: 'XAG_USD',
  USOIL: 'WTICO_USD', WTI: 'WTICO_USD', CL: 'WTICO_USD', MCL: 'WTICO_USD', UKOIL: 'BCO_USD', BRENT: 'BCO_USD',
  BTCUSD: 'BTC_USD', ETHUSD: 'ETH_USD',
};

/** The OANDA name for a pair as you log it, or null when there is none. */
export function oandaInstrument(pair) {
  const p = String(pair || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!p) return null;
  if (NAMED[p]) return NAMED[p];
  const m = p.match(/^(XAU|XAG|XPT|XPD)(USD|EUR|AUD|GBP|JPY|CHF)$/);
  if (m) return `${m[1]}_${m[2]}`;
  if (p.length === 6 && FX.includes(p.slice(0, 3)) && FX.includes(p.slice(3))) return `${p.slice(0, 3)}_${p.slice(3)}`;
  return null;
}

/** The currencies whose news moves this instrument. */
export function currenciesOf(inst) {
  if (!inst) return [];
  const [a, b] = inst.split('_');
  return [...new Set([FX.includes(a) ? a : null, FX.includes(b) ? b : null].filter(Boolean))];
}

/** How many decimals a price is shown with. */
export function decimalsOf(inst) {
  if (!inst) return 2;
  const [a, b] = inst.split('_');
  if (b === 'JPY') return 3;
  if (FX.includes(a) && FX.includes(b)) return 5;
  if (/^X(AU|AG|PT|PD)$/.test(a)) return 2;
  return 1;
}

/* ---------- your key ---------- */
export async function getKey() {
  const key = await fs.getSetting('oandaKey');
  const live = (await fs.getSetting('oandaLive')) === '1';
  return key ? { key, live } : null;
}
export async function setKey(key, live = false) {
  await fs.setSetting('oandaKey', key ? String(key).trim() : null);
  await fs.setSetting('oandaLive', key && live ? '1' : null);
}

/* ---------- talking to OANDA ---------- */
/* The desktop app asks its own shell, which only ever calls OANDA. In a
   browser the page asks OANDA directly — which works only where OANDA lets
   a web page call it. */
async function call(path, cred) {
  if (isTauri()) return window.__TAURI__.core.invoke('fetch_oanda', { path, token: cred.key, live: !!cred.live });
  const host = cred.live ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
  const res = await fetch(host + path, { headers: { Authorization: `Bearer ${cred.key}`, 'Accept-Datetime-Format': 'UNIX' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`OANDA said ${res.status}: ${text.slice(0, 200)}`);
  return text;
}

/** OANDA's candles, as [unix seconds, open, high, low, close] rows. */
export function parseCandles(text) {
  const j = typeof text === 'string' ? JSON.parse(text) : text;
  const out = [];
  for (const c of j.candles || []) {
    const p = c.mid || c.bid || c.ask;
    if (!p) continue;
    const t = /^\d+(\.\d+)?$/.test(String(c.time)) ? Math.floor(Number(c.time)) : Math.floor(Date.parse(c.time) / 1000);
    const row = [t, +p.o, +p.h, +p.l, +p.c];
    if (row.every(Number.isFinite)) out.push(row);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

/** A plain-words reason for something going wrong with OANDA. */
export function explain(err) {
  const m = String(err?.message || err || '');
  if (/401|403|unauthori|invalid.*token|insufficient/i.test(m)) return 'OANDA did not accept that key. Check it in Settings — and whether it is a demo (practice) or live key.';
  if (/404|instrument/i.test(m)) return 'OANDA has no prices for this instrument.';
  if (/failed to fetch|network|dns|timed? ?out|connection/i.test(m)) return 'Could not reach OANDA. Check your internet connection.';
  return m || 'Something went wrong getting prices.';
}

/** Checks a key by asking for the last five minutes of gold. */
export async function testKey(cred) {
  const rows = parseCandles(await call('/v3/instruments/XAU_USD/candles?granularity=M1&count=5&price=M', cred));
  return rows.length > 0;
}

/* ---------- days ---------- */
const DAY = 86400;
export const dayOf = t => new Date(t * 1000).toISOString().slice(0, 10);
const dayStart = day => Date.parse(day + 'T00:00:00Z') / 1000;

/** Local date + "HH:MM" → unix seconds, on this computer's clock. */
export function localStamp(date, time) {
  const [y, m, d] = String(date).split('-').map(Number);
  const [hh, mm] = String(time || '00:00').split(':').map(Number);
  return Math.floor(new Date(y, m - 1, d, hh || 0, mm || 0).getTime() / 1000);
}

/** Where the trade sits in time: entry, exit (or now), and 8 hours either side. */
export function tradeWindow(t, now = Date.now() / 1000) {
  const entry = localStamp(t.date, t.timeOpen || '00:00');
  let exit = t.status === 'open' ? Math.min(now, entry + DAY) : t.timeClose ? localStamp(t.date, t.timeClose) : entry + 3600;
  if (exit < entry) exit += DAY;                     // closed after midnight
  const from = entry - 8 * 3600, to = Math.min(now, exit + 8 * 3600);
  const days = [];
  for (let d = dayStart(dayOf(from)); d < to; d += DAY) days.push(dayOf(d));
  return { entry, exit, from, to, days };
}

/* Sunday 00:00 UTC of the week a moment falls in. The FX week opens on
   Sunday evening New York time, which is still Sunday in UTC. */
function sundayOf(s) {
  const d = new Date(s * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000 - d.getUTCDay() * DAY;
}

/**
 * The whole trading week the trade sits in — Sunday's open to Friday's
 * close — so a 4H or daily chart shows the week's structure, and every other
 * trade on the same instrument that week reads the same days. A trade held
 * over a weekend gets both weeks.
 */
export function weekWindow(t, now = Date.now() / 1000) {
  const w = tradeWindow(t, now);
  const from = sundayOf(w.entry);
  const to = Math.min(now, sundayOf(w.exit) + 6 * DAY);   // Saturday 00:00 UTC
  const days = [];
  for (let d = from; d < to; d += DAY) if (new Date(d * 1000).getUTCDay() !== 6) days.push(dayOf(d));
  return { entry: w.entry, exit: w.exit, from, to, days };
}

const fileOf = (inst, day) => `candles/${inst}/${day}.json`;

/* Kept only where the journal is a real folder. A journal held inside the
   browser has a few megabytes to its name and would fill up in a week. */
const keeps = () => fs.kind === 'native' || fs.kind === 'browser';

/* Days already read this session, so moving between trades of the same week
   reads nothing twice. A day still running is asked for again after a minute. */
const memory = new Map();
export function forgetCandles() { memory.clear(); }

/**
 * One UTC day of 1-minute candles: from the vault if it is there, else from
 * OANDA — kept in the vault once the day is over, so it is never fetched again.
 */
export async function loadDay(store, inst, day, cred, now = Date.now() / 1000) {
  const key = inst + '/' + day;
  const seen = memory.get(key);
  if (seen && (seen.done || now - seen.at < 60)) return seen.rows;
  const kept = await store.readJSON(fileOf(inst, day), null);
  if (kept && Array.isArray(kept.candles)) { memory.set(key, { rows: kept.candles, done: true, at: now }); return kept.candles; }
  const from = dayStart(day), to = from + DAY;
  if (from > now) return [];
  const rows = parseCandles(await call(`/v3/instruments/${inst}/candles?granularity=M1&price=M&from=${from}&to=${Math.min(to, Math.floor(now))}`, cred));
  const done = to <= now - 120;
  if (done && keeps()) {
    /* One candle to a line: plain to read, and a day is about 60 KB. */
    const body = rows.map(r => '    ' + JSON.stringify(r)).join(',\n');
    await store.writeText(fileOf(inst, day),
      `{\n  "version": 1,\n  "instrument": "${inst}",\n  "day": "${day}",\n  "source": "OANDA mid",\n  "candles": [\n${body}\n  ]\n}\n`);
  }
  memory.set(key, { rows, done, at: now });
  return rows;
}

/**
 * The calendar month the trade is in, as whole trading weeks: from the week
 * holding the 1st to the week holding the last day, and always the trade's
 * own week, never past now. About 22 trading days, ~1.5 MB a pair.
 */
export function monthWindow(t, now = Date.now() / 1000) {
  const w = weekWindow(t, now);
  /* the month on your calendar — the trade's own date */
  const [y, m] = String(t.date).split('-').map(Number);
  const first = Date.UTC(y, m - 1, 1) / 1000;
  const last = Date.UTC(y, m, 0) / 1000;
  const from = Math.min(sundayOf(first), w.from);
  const to = Math.min(now, Math.max(sundayOf(last) + 6 * DAY, w.to));
  const days = [];
  for (let x = from; x < to; x += DAY) if (new Date(x * 1000).getUTCDay() !== 6) days.push(dayOf(x));
  return { from, to, days, mid: first + 14 * DAY };
}

/** Several days, three asked for at a time, as one run of rows. */
export async function loadDays(store, inst, days, cred, now = Date.now() / 1000) {
  const got = new Array(days.length);
  let next = 0;
  const worker = async () => { while (next < days.length) { const i = next++; got[i] = await loadDay(store, inst, days[i], cred, now); } };
  await Promise.all([worker(), worker(), worker()]);
  return got.flat();
}

/**
 * The trade's week first, so the chart is up quickly; the rest of its month
 * is named in `rest` for the chart to fetch behind it.
 */
export async function candlesFor(store, trade, cred, now = Date.now() / 1000) {
  const inst = oandaInstrument(trade.pair);
  if (!inst) return { inst: null, rows: [] };
  const w = weekWindow(trade, now), month = monthWindow(trade, now);
  const rows = await loadDays(store, inst, w.days, cred, now);
  const rest = month.days.filter(d => !w.days.includes(d));
  return { inst, rows, ...w, month, rest };
}

/* ---------- New York's trading day ----------
   4-hour and daily candles start at 17:00 New York, where the FX day rolls
   over — the way OANDA and TradingView draw them. */
let nyFmt = null;
const nyCache = new Map();
function nyOffset(s) {
  const hour = Math.floor(s / 3600);
  if (nyCache.has(hour)) return nyCache.get(hour);
  let off = -4 * 3600;
  try {
    nyFmt ||= new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const g = {};
    for (const p of nyFmt.formatToParts(new Date(hour * 3600 * 1000))) g[p.type] = +p.value;
    off = Date.UTC(g.year, g.month - 1, g.day, g.hour % 24, g.minute, g.second) / 1000 - hour * 3600;
  } catch { /* keep the summer offset */ }
  nyCache.set(hour, off);
  return off;
}
/** When the trading day holding this moment began: 17:00 New York. */
export function rolloverOf(s) {
  const off = nyOffset(s), local = s + off;
  return Math.floor((local - 17 * 3600) / DAY) * DAY + 17 * 3600 - off;
}
/** The trading day a daily candle belongs to, as YYYY-MM-DD. */
export const tradingDayOf = s => dayOf(rolloverOf(s) + 12 * 3600);

/** 1-minute rows built up into a bigger timeframe: on the clock up to 1H,
    from New York's 17:00 rollover for 4H and daily. */
export function aggregate(rows, minutes) {
  if (minutes <= 1) return rows.slice();
  const size = minutes * 60, out = [];
  const bucket = minutes >= 240
    ? t => { const a = rolloverOf(t); return a + Math.floor((t - a) / size) * size; }
    : t => Math.floor(t / size) * size;
  let cur = null;
  for (const [t, o, h, l, c] of rows) {
    const b = bucket(t);
    if (!cur || cur[0] !== b) { cur = [b, o, h, l, c]; out.push(cur); }
    else { if (h > cur[2]) cur[2] = h; if (l < cur[3]) cur[3] = l; cur[4] = c; }
  }
  return out;
}
