/* ============================================================
   replaydata.js — the prices Replay plays back.

   Two years of OANDA one-minute mid candles per pair, downloaded once and
   kept in the vault under replay/prices/<INSTRUMENT>/<YYYY-MM>.qrc — one
   file a month. Replay never reaches the internet mid-session: what it
   plays is what is on disk.

   A month is a few hundred kilobytes, not the 1.5 MB the trade chart's
   day files add up to:
     • every number is a whole number — a price times 10^decimals, a time
       in minutes — so nothing is spelled out in text;
     • each candle is written as the difference from the one before it
       (minutes since the last candle, open against the last close, high,
       low and close against the open), so most numbers are small;
     • and the month is gzipped where the computer can do it (every
       current browser and the desktop app's webview can).
   A file starts with its own little description — instrument, month,
   decimals, count, whether the month was over when it was saved — so it
   can be read without the index.

   The index (replay/prices/index.json) is only a summary for the Data
   screen: which months each pair has, their size, when they were saved.
   ============================================================ */
import { fs } from './fs.js';
import { call, parseCandles, explain, useLocalPrices } from './candles.js';

export const ROOT = 'replay/prices';
export const MONTHS_BACK = 24;                   // two years, plus the month we are in — the default
/* How far back to keep: two years unless asked for more (the index remembers it). */
export const HISTORY = [2, 5, 10];
export const historyOf = ix => (HISTORY.includes(ix?.years) ? ix.years : 2);
const INDEX = `${ROOT}/index.json`;
const MAGIC = [0x51, 0x52, 0x43, 0x31];          // "QRC1"
const MIN = 60, DAY = 86400;

/* ---------- months ---------- */
export const monthKey = s => new Date(s * 1000).toISOString().slice(0, 7);
export const monthStart = key => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, 1) / 1000;
export const monthEnd = key => Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 1) / 1000;
/** Every month from `years` back (two by default) to this one, oldest first. */
export function monthsWanted(now = Date.now() / 1000, years = 2) {
  const d = new Date(now * 1000), out = [];
  for (let k = years * 12; k >= 0; k--) out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1)).toISOString().slice(0, 7));
  return out;
}
export const fileOf = (inst, month) => `${ROOT}/${inst}/${month}.qrc`;

/* ---------- the file format ---------- */
const decimalsIn = v => { const s = String(v); const i = s.indexOf('.'); return i < 0 ? 0 : Math.min(6, s.length - i - 1); };

/** Rows [[t, o, h, l, c], …] → the bytes of a month file (before gzip). */
export function encodeMonth(inst, month, rows, complete) {
  let dp = 0;
  for (const r of rows) for (let k = 1; k < 5; k++) dp = Math.max(dp, decimalsIn(r[k]));
  const scale = 10 ** dp, I = v => Math.round(v * scale);
  const head = new TextEncoder().encode(JSON.stringify({ inst, month, dp, n: rows.length, complete: !!complete, source: 'OANDA mid M1' }));
  const buf = new ArrayBuffer(4 + 4 + head.length + rows.length * 20);
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  u8.set(MAGIC, 0); dv.setUint32(4, head.length, true); u8.set(head, 8);
  let at = 8 + head.length, prevT = monthStart(month) / MIN, prevC = 0;
  for (const [t, o, h, l, c] of rows) {
    const tm = Math.round(t / MIN), O = I(o), H = I(h), L = I(l), C = I(c);
    dv.setInt32(at, tm - prevT, true); dv.setInt32(at + 4, O - prevC, true);
    dv.setInt32(at + 8, H - O, true); dv.setInt32(at + 12, O - L, true); dv.setInt32(at + 16, C - O, true);
    at += 20; prevT = tm; prevC = C;
  }
  return u8;
}

/** The bytes of a month file → { head, rows }. */
export function decodeMonth(u8) {
  if (MAGIC.some((b, i) => u8[i] !== b)) throw new Error('Not a Laminar price file.');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const hl = dv.getUint32(4, true);
  const head = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + hl)));
  const scale = 10 ** head.dp, rows = new Array(head.n);
  let at = 8 + hl, t = monthStart(head.month) / MIN, c = 0;
  for (let i = 0; i < head.n; i++) {
    t += dv.getInt32(at, true);
    const O = c + dv.getInt32(at + 4, true), H = O + dv.getInt32(at + 8, true), L = O - dv.getInt32(at + 12, true), C = O + dv.getInt32(at + 16, true);
    rows[i] = [t * MIN, O / scale, H / scale, L / scale, C / scale];
    c = C; at += 20;
  }
  return { head, rows };
}

/* gzip where the computer can; a file says by its first two bytes whether it is */
const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
async function pipe(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
export async function pack(u8) { return canZip() ? pipe(u8, new CompressionStream('gzip')) : u8; }
export async function unpack(u8) { return u8[0] === 0x1f && u8[1] === 0x8b ? pipe(u8, new DecompressionStream('gzip')) : u8; }

/* ---------- the index ---------- */
let index = null;
export async function readIndex() {
  if (index) return index;
  try { index = JSON.parse(await fs.readText(INDEX)); } catch { index = null; }
  if (!index || typeof index !== 'object' || typeof index.pairs !== 'object') index = { version: 1, pairs: {} };
  return index;
}
async function writeIndex() { await fs.writeText(INDEX, JSON.stringify(index, null, 2)); }
export function forgetIndex() { index = null; memo.clear(); }
/** Keep 2, 5 or 10 years. More: the older months show as missing, to download. Fewer: nothing saved is deleted. */
export async function setHistory(years) {
  const ix = await readIndex();
  ix.years = HISTORY.includes(years) ? years : 2;
  await writeIndex();
  return ix;
}

/** What the Data screen shows for a pair. */
export function pairStatus(ix, inst, now = Date.now() / 1000) {
  const want = monthsWanted(now, historyOf(ix)), have = ix.pairs[inst]?.months || {};
  const done = want.filter(m => have[m] && (have[m].complete || m === monthKey(now)));
  const missing = want.filter(m => !have[m] || (!have[m].complete && m !== monthKey(now)));
  const stale = have[monthKey(now)] && !have[monthKey(now)].complete
    && now - Date.parse(have[monthKey(now)].at) / 1000 > DAY;   // this month, saved more than a day ago
  const bytes = Object.values(have).reduce((a, m) => a + (m.bytes || 0), 0);
  const candles = Object.values(have).reduce((a, m) => a + (m.n || 0), 0);
  return { want, have, done: done.length, missing, stale: !!stale, bytes, candles,
    from: Object.keys(have).sort()[0] || null, to: Object.keys(have).sort().pop() || null };
}

/* ---------- downloading ---------- */
/* OANDA hands out at most 5,000 candles a request; three days is 4,320 at
   most. Saturdays, when the market is shut all day, are not asked for. */
export function chunksOf(month, now = Date.now() / 1000) {
  const out = [], end = Math.min(monthEnd(month), Math.floor(now / MIN) * MIN);
  let from = null, days = 0;
  for (let d = monthStart(month); d < end; d += DAY) {
    const sat = new Date(d * 1000).getUTCDay() === 6;
    if (sat) { if (from != null) { out.push([from, d]); from = null; days = 0; } continue; }
    if (from == null) from = d;
    if (++days === 3) { out.push([from, Math.min(d + DAY, end)]); from = null; days = 0; }
  }
  if (from != null) out.push([from, end]);
  return out;
}

/** A month's rows written to its file and the index. */
async function saveMonth(inst, month, rows, now) {
  const complete = monthEnd(month) <= now - 120;
  const bytes = await pack(encodeMonth(inst, month, rows, complete));
  await fs.writeImage(fileOf(inst, month), new Blob([bytes], { type: 'application/octet-stream' }));
  const ix = await readIndex();
  const p = ix.pairs[inst] || (ix.pairs[inst] = { months: {} });
  p.months[month] = { n: rows.length, bytes: bytes.length, complete, at: new Date(now * 1000).toISOString() };
  await writeIndex();
  memo.delete(inst + '/' + month);
}
/** The candles OANDA has for a stretch of a month, in chunks it will serve. */
async function fetchSpan(inst, month, cred, from0, { now, signal }) {
  const rows = [];
  for (let [from, to] of chunksOf(month, now)) {
    if (to <= from0) continue;
    from = Math.max(from, from0);
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    const got = parseCandles(await call(`/v3/instruments/${inst}/candles?granularity=M1&price=M&from=${from}&to=${to}`, cred));
    for (const r of got) if (r[0] >= from && r[0] < to && (!rows.length || r[0] > rows[rows.length - 1][0])) rows.push(r);
  }
  return rows;
}

/** One month, fetched whole and saved. */
export async function fetchMonth(inst, month, cred, { now = Date.now() / 1000, signal } = {}) {
  const rows = await fetchSpan(inst, month, cred, monthStart(month), { now, signal });
  await saveMonth(inst, month, rows, now);
  return rows.length;
}

/**
 * One month brought up to now: what is saved stays, and only the candles
 * after its last one are asked for and added — the file grows, it is never
 * fetched twice. A month not saved yet is fetched whole.
 */
export async function growMonth(inst, month, cred, { now = Date.now() / 1000, signal } = {}) {
  const old = (await readMonth(inst, month)) || [];
  const from0 = old.length ? old[old.length - 1][0] + MIN : monthStart(month);
  const add = await fetchSpan(inst, month, cred, from0, { now, signal });
  const rows = old.concat(add.filter(r => !old.length || r[0] > old[old.length - 1][0]));
  await saveMonth(inst, month, rows, now);
  return add.length;
}

/**
 * Bring a pair up to date: every missing month, and this month grown if it
 * was saved more than a day ago. Months already complete are never fetched
 * twice. `onProgress({ month, done, total })` after each month.
 */
export async function downloadPair(inst, cred, { now = Date.now() / 1000, signal, onProgress } = {}) {
  const st = pairStatus(await readIndex(), inst, now);
  const cur = monthKey(now);
  const todo = [...st.missing];
  if (!st.have[cur] || st.stale) { if (!todo.includes(cur)) todo.push(cur); }
  let done = 0;
  for (const m of todo) {
    await growMonth(inst, m, cred, { now, signal });
    onProgress?.({ month: m, done: ++done, total: todo.length });
  }
  return todo.length;
}

/** Forget a pair: its files and its line in the index. */
export async function removePair(inst) {
  const ix = await readIndex();
  for (const m of Object.keys(ix.pairs[inst]?.months || {})) {
    try { await fs.deleteImage(fileOf(inst, m)); } catch { /* already gone */ }
    memo.delete(inst + '/' + m);
  }
  delete ix.pairs[inst];
  await writeIndex();
}

/* ---------- reading back ---------- */
const memo = new Map();
/** A month's rows from disk (null if it was never downloaded). */
export async function readMonth(inst, month) {
  const k = inst + '/' + month;
  if (memo.has(k)) return memo.get(k);
  const blob = await fs.readImage(fileOf(inst, month));
  if (!blob) return null;
  const { rows } = decodeMonth(await unpack(new Uint8Array(await blob.arrayBuffer())));
  memo.set(k, rows);
  if (memo.size > 6) memo.delete(memo.keys().next().value);  // a few months in memory, no more
  return rows;
}

/**
 * One UTC day from the download, when it holds all of it — a finished month,
 * or this month saved after that day ended. null otherwise, and the charts
 * go to OANDA for it as before. Every chart in the app reads through this
 * (candles.js `loadDay`), so a pair downloaded here is kept once, in one
 * growing set of month files (growFor below).
 */
export async function dayFromDownload(inst, day, now = Date.now() / 1000) {
  const meta = (await readIndex()).pairs[inst]?.months?.[day.slice(0, 7)];
  if (!meta) return null;
  const from = Date.parse(day + 'T00:00:00Z') / 1000, to = from + DAY;
  if (to > now - 120) return null;                                   // today: always from OANDA
  if (!meta.complete && !(to <= Date.parse(meta.at) / 1000 - 120)) return null;
  const rows = await readMonth(inst, day.slice(0, 7));
  if (!rows) return null;
  let lo = 0, hi = rows.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m][0] < from) lo = m + 1; else hi = m; }
  const out = [];
  for (let i = lo; i < rows.length && rows[i][0] < to; i++) out.push(rows[i]);
  return out;
}
/**
 * A chart wants a finished day of a downloaded pair that the download does
 * not hold yet (it was last updated before that day): the download grows
 * to now — its missing months, and the month we are in from its last
 * candle — so the day is read from it. One run at a time per pair.
 * false when the pair is not downloaded or the day is outside its two years.
 */
const growing = new Map();
export function growFor(inst, day, cred, now = Date.now() / 1000) {
  const run = (growing.get(inst) || Promise.resolve()).then(async () => {
    const ix = await readIndex();
    const have = ix.pairs[inst]?.months;
    if (!have || !Object.keys(have).length) return false;
    const want = monthsWanted(now, historyOf(ix)), dayM = day.slice(0, 7);
    if (!want.includes(dayM)) return false;
    const dayEnd = Date.parse(day + 'T00:00:00Z') / 1000 + DAY;
    for (const m of want) {
      if (m > dayM) break;
      const meta = have[m];
      const covered = meta && (meta.complete || Date.parse(meta.at) / 1000 - 120 >= Math.min(monthEnd(m), dayEnd));
      if (!covered) await growMonth(inst, m, cred, { now });
    }
    return true;
  });
  growing.set(inst, run.catch(() => {}));
  return run;
}
useLocalPrices({ read: dayFromDownload, grow: growFor });

/** Every saved candle between two moments, in order. */
export async function candlesBetween(inst, from, to) {
  const out = [];
  for (let m = monthKey(from); monthStart(m) < to; m = monthKey(monthEnd(m))) {
    const rows = await readMonth(inst, m);
    if (rows) for (const r of rows) if (r[0] >= from && r[0] < to) out.push(r);
  }
  return out;
}

export { explain };
