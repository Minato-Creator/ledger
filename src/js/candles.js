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

/** Where the trade sits in time: entry, exit (or now), and the window worth loading. */
export function tradeWindow(t, now = Date.now() / 1000) {
  const entry = localStamp(t.date, t.timeOpen || '00:00');
  let exit = t.status === 'open' ? Math.min(now, entry + DAY) : t.timeClose ? localStamp(t.date, t.timeClose) : entry + 3600;
  if (exit < entry) exit += DAY;                     // closed after midnight
  const from = entry - 8 * 3600, to = Math.min(now, exit + 8 * 3600);
  const days = [];
  for (let d = dayStart(dayOf(from)); d < to; d += DAY) days.push(dayOf(d));
  return { entry, exit, from, to, days };
}

const fileOf = (inst, day) => `candles/${inst}/${day}.json`;

/* Kept only where the journal is a real folder. A journal held inside the
   browser has a few megabytes to its name and would fill up in a week. */
const keeps = () => fs.kind === 'native' || fs.kind === 'browser';

/**
 * One UTC day of 1-minute candles: from the vault if it is there, else from
 * OANDA — kept in the vault once the day is over, so it is never fetched again.
 */
export async function loadDay(store, inst, day, cred, now = Date.now() / 1000) {
  const kept = await store.readJSON(fileOf(inst, day), null);
  if (kept && Array.isArray(kept.candles)) return kept.candles;
  const from = dayStart(day), to = from + DAY;
  if (from > now) return [];
  const rows = parseCandles(await call(`/v3/instruments/${inst}/candles?granularity=M1&price=M&from=${from}&to=${Math.min(to, Math.floor(now))}`, cred));
  if (to <= now - 120 && keeps()) {
    /* One candle to a line: plain to read, and a day is about 60 KB. */
    const body = rows.map(r => '    ' + JSON.stringify(r)).join(',\n');
    await store.writeText(fileOf(inst, day),
      `{\n  "version": 1,\n  "instrument": "${inst}",\n  "day": "${day}",\n  "source": "OANDA mid",\n  "candles": [\n${body}\n  ]\n}\n`);
  }
  return rows;
}

/** Every 1-minute candle the trade's window needs. */
export async function candlesFor(store, trade, cred, now = Date.now() / 1000) {
  const inst = oandaInstrument(trade.pair);
  if (!inst) return { inst: null, rows: [] };
  const w = tradeWindow(trade, now);
  const rows = [];
  for (const day of w.days) rows.push(...(await loadDay(store, inst, day, cred, now)));
  return { inst, rows, ...w };
}

/** 1-minute rows built up into a bigger timeframe, on clock boundaries. */
export function aggregate(rows, minutes) {
  if (minutes <= 1) return rows.slice();
  const size = minutes * 60, out = [];
  let cur = null;
  for (const [t, o, h, l, c] of rows) {
    const b = Math.floor(t / size) * size;
    if (!cur || cur[0] !== b) { cur = [b, o, h, l, c]; out.push(cur); }
    else { if (h > cur[2]) cur[2] = h; if (l < cur[3]) cur[3] = l; cur[4] = c; }
  }
  return out;
}
