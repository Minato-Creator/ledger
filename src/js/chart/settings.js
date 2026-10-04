/* ============================================================
   chart/settings.js — how every chart looks: TradingView's Chart Settings.

   One set for the whole app (the trade page, the weekly review, the Outlook
   and Replay all read it), kept in the vault in data/drawings.json under
   `settings`, so it travels with a backup. Saved templates sit beside it
   under `settingTemplates`.

   While the dialog is open the charts show the draft (preview); Cancel puts
   the saved one back, Ok keeps the draft.
   ============================================================ */

export const TV_UP = '#089981', TV_DOWN = '#F23645';

export const DEFAULTS = Object.freeze({
  candles: {
    mode: 'quire',                                   // 'quire' = the app's profit / loss colours; 'custom'
    body:   { on: true, up: TV_UP, down: TV_DOWN },
    border: { on: true, up: TV_UP, down: TV_DOWN },
    wick:   { on: true, up: TV_UP, down: TV_DOWN },
  },
  precision: 'default',                              // or 0…8 decimals
  timezone: 'local',
  status: { symbol: true, ohlc: true, change: true },
  scales: { textSize: 12, lastLine: false, lastLabel: true },
  trading: { lines: true, pnl: true },                       // Replay: positions and orders on the chart   // Minato: no dotted line through the chart
  canvas: {
    bg: 'quire', bgColor: '#111312', bgColor2: '#1A1D1C',   // 'quire' | 'solid' | 'gradient'
    grid: { vert: false, horz: false, color: 'rgba(128, 128, 128, 0.12)' },   // Minato asked the grid gone
    cross: { color: '#8B918F', width: 1, style: 'dashed' },                   // 'solid' | 'dashed' | 'dotted'
    margins: { top: 10, bottom: 8, right: 10 },                               // %, %, bars
  },
});

export const TIMEZONES = [
  ['local', 'Your computer'], ['UTC', 'UTC'],
  ['America/New_York', 'New York'], ['America/Chicago', 'Chicago'], ['Europe/London', 'London'],
  ['Europe/Berlin', 'Frankfurt'], ['Asia/Dubai', 'Dubai'], ['Asia/Singapore', 'Singapore'],
  ['Asia/Hong_Kong', 'Hong Kong'], ['Asia/Tokyo', 'Tokyo'], ['Australia/Perth', 'Perth'], ['Australia/Sydney', 'Sydney'],
];
export const TEXT_SIZES = [10, 11, 12, 13, 14, 16];

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
/** `over` laid on `base`, key by key; anything of the wrong kind is ignored. */
export function merge(base, over) {
  const out = structuredClone(base);
  if (!isObj(over)) return out;
  for (const k of Object.keys(out)) {
    if (!(k in over)) continue;
    if (isObj(out[k])) out[k] = merge(out[k], over[k]);
    else if (typeof over[k] === typeof out[k] || (k === 'precision' && Number.isInteger(over[k]) && over[k] >= 0 && over[k] <= 8)) out[k] = over[k];
  }
  return out;
}

/* ---------- live: the settings every chart paints with ---------- */
let saved = null, shown = null;
const listeners = new Set();
export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const tell = () => { for (const fn of [...listeners]) { try { fn(shown); } catch { /* a chart that went away */ } } };

export function chartSettings(store) {
  const raw = store?.data?.drawings?.settings;
  if (!saved || saved.__raw !== raw) { saved = merge(DEFAULTS, raw); Object.defineProperty(saved, '__raw', { value: raw }); shown = null; }
  return shown || saved;
}
/** Charts show `draft` until it is saved or dropped. */
export function preview(draft) { shown = draft; tell(); }
export function dropPreview() { shown = null; tell(); }
export async function saveSettings(store, s) {
  const d = store.data.drawings;
  d.settings = structuredClone(s);
  saved = null; shown = null;
  await store.save('drawings');
  tell();
}

/* ---------- templates (Template ▾ in the dialog) ---------- */
export const templateNames = store => Object.keys(store?.data?.drawings?.settingTemplates || {}).sort((a, b) => a.localeCompare(b));
export const templateOf = (store, name) => merge(DEFAULTS, store?.data?.drawings?.settingTemplates?.[name]);
export async function saveTemplate(store, name, s) {
  const d = store.data.drawings;
  (d.settingTemplates ||= {})[name] = structuredClone(s);
  await store.save('drawings');
}
export async function dropTemplate(store, name) {
  delete store.data.drawings.settingTemplates?.[name];
  await store.save('drawings');
}

/* ---------- time in the chosen zone ----------
   A moment's offset from UTC in the zone, asked of Intl once an hour of
   time and remembered: the time scale reads thousands of candles a frame. */
const fmts = new Map(), offs = new Map();
export function offsetOf(tz, T) {
  if (!tz || tz === 'local') return -new Date(T * 1000).getTimezoneOffset() * 60;
  if (tz === 'UTC') return 0;
  const hour = Math.floor(T / 3600), k = tz + '|' + hour;
  let o = offs.get(k);
  if (o != null) return o;
  let f = fmts.get(tz);
  if (!f) {
    try { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); }
    catch { f = null; }
    fmts.set(tz, f);
  }
  if (!f) return -new Date(T * 1000).getTimezoneOffset() * 60;
  const p = Object.fromEntries(f.formatToParts(new Date(hour * 3600 * 1000)).map(x => [x.type, x.value]));
  o = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) / 1000 - hour * 3600;
  if (offs.size > 5000) offs.clear();
  offs.set(k, o);
  return o;
}
/** The wall clock in the zone, as a Date read with getUTC…(). */
export const wall = (tz, T) => new Date((T + offsetOf(tz, T)) * 1000);
export function tzLabel(tz, now = Date.now() / 1000) {
  const name = TIMEZONES.find(([k]) => k === tz)?.[1] || tz;
  const o = offsetOf(tz, now) / 60, h = Math.trunc(Math.abs(o) / 60), m = Math.abs(o) % 60;
  return `(UTC${o < 0 ? '−' : '+'}${h}${m ? ':' + String(m).padStart(2, '0') : ''}) ${name}`;
}
