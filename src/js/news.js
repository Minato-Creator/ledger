/* ============================================================
   news.js — the economic calendar, from Forex Factory's own feed.

   This is the only thing in Quire that comes from somewhere else. Everything
   about it is shaped by that:

   • It reads a feed Forex Factory publishes for the purpose, rather than
     scraping their site. Scraping breaks, and is against their terms.

   • The feed carries a full timestamp with an offset —
     "2026-09-24T01:30:00-04:00" — so an event is a real instant, not a
     wall-clock time in somebody else's city. It is turned into your own local
     time by the machine, which means it stays right through their daylight
     saving and yours, without anyone choosing a number.

   • What is fetched is kept in the vault. The calendar you last saw is still
     there on a plane, and the app says when it was fetched rather than
     letting last week's figures pass for today's.

   • Nothing about you is sent. It is one GET for a public file.
   ============================================================ */

export const FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

/* Red folder and bank holiday only. The feed carries four levels; the other
   two are noise on a morning you are planning a trade. */
export const KEPT = new Set(['High', 'Holiday']);

/** How long a fetched copy is treated as current. */
export const FRESH_MINS = 15;

/**
 * Read the feed's rows into something the app can hold.
 *
 * A row we cannot make sense of is dropped rather than shown as a wrong time
 * — an event at the wrong hour is worse than no event.
 */
export function parseFeed(text) {
  let rows;
  try { rows = JSON.parse(text); } catch { throw new Error('That feed did not come back as JSON.'); }
  if (!Array.isArray(rows)) throw new Error('That feed was not a list of events.');

  const out = [];
  for (const r of rows) {
    if (!r || !r.title || !r.date) continue;
    const at = new Date(r.date);
    if (isNaN(at)) continue;
    const impact = String(r.impact || '').trim();
    if (!KEPT.has(impact)) continue;
    /* a clock change sits in the same grey folder: not a bank holiday, not news */
    if (impact === 'Holiday' && !/holiday/i.test(String(r.title))) continue;
    out.push({
      id: `${r.date}|${r.country || ''}|${r.title}`,
      title: String(r.title).trim(),
      country: String(r.country || '').trim().toUpperCase(),
      at: at.toISOString(),
      impact,
      forecast: String(r.forecast ?? '').trim(),
      previous: String(r.previous ?? '').trim(),
    });
  }
  out.sort((a, b) => a.at.localeCompare(b.at));
  return out;
}

/* ---------- reading the feed ----------
   On the desktop the shell fetches it, because a webview will not make a
   cross-site request without the other end's permission and the shell has no
   such rule. In a browser the page asks directly, which works or does not
   depending on what the feed allows — and when it does not, that is reported
   as what it is rather than as an empty calendar. */
export async function fetchFeed() {
  if (typeof window !== 'undefined' && window.__TAURI__) {
    return window.__TAURI__.core.invoke('fetch_text', { url: FEED });
  }
  const res = await fetch(FEED, { cache: 'no-store' });
  if (!res.ok) throw new Error(`The feed answered ${res.status}.`);
  return res.text();
}

/* ---------- which events belong to a day ----------
   The day is yours, not the feed's. An event at 23:30 New York on Thursday is
   Friday lunchtime in Perth, and it belongs on Friday's page. */
export const localDay = (iso) => {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const localTime = (iso) => {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function eventsOn(events, date) {
  return (events || []).filter(e => localDay(e.at) === date);
}

/** Minutes until an event, negative once it has been and gone. */
export const minutesTo = (iso, now = Date.now()) => Math.round((new Date(iso) - now) / 60000);

/** "in 25m", "in 3h 10m", "now", "2h ago" — the shape a trader reads at a glance. */
export function whenText(iso, now = Date.now()) {
  const m = minutesTo(iso, now);
  const a = Math.abs(m);
  const body = a < 1 ? 'now'
    : a < 60 ? `${a}m`
    : a < 60 * 24 ? `${Math.floor(a / 60)}h ${a % 60}m`.replace(' 0m', '')
    : `${Math.round(a / 60 / 24)}d`;
  if (body === 'now') return 'now';
  return m > 0 ? `in ${body}` : `${body} ago`;
}

/* ---------- the week ----------
   The feed is this week, so there is no week to work out: grouping what came
   back by day is the whole job. Days with nothing on them are left out —
   a Tuesday with no red folders is not a row, it is a Tuesday. */
export function eventsByDay(events) {
  const days = new Map();
  for (const e of events || []) {
    const d = localDay(e.at);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(e);
  }
  for (const list of days.values()) list.sort((a, b) => a.at.localeCompare(b.at));
  return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/* ---------- one fetch, two pages ----------
   The outlook strip and the newswire both want this calendar. Neither should
   be the one that owns it, and neither should fetch it twice in a minute
   because you walked from one to the other. */
export async function ensureNews(store, { force = false } = {}) {
  const age = store.newsAge();
  if (!force && age != null && age < FRESH_MINS && store.news.events.length) return store.news;
  try {
    const events = parseFeed(await fetchFeed());
    return await store.saveNews(events);
  } catch (e) {
    await store.newsFailed(e.message);
    throw e;
  }
}

/* ---------- short names ----------
   A red folder by the name traders use for it — "CPI", "NFP", "Rate",
   "Powell" — with its currency in front: "USD - NFP". The full title still
   shows on hover and in the add-trade form. Forex Factory's high-impact
   releases come from a few dozen recurring families (inflation, jobs,
   growth, PMIs, central banks and their speakers, sentiment); anything not
   in the table keeps its own title, trimmed. */
const SHORT = [
  [/\bADP\b/i, 'ADP'], [/non-?farm|\bNFP\b/i, 'NFP'], [/average hourly earnings/i, 'AHE'], [/average earnings index/i, 'Earnings'],
  [/employment cost index/i, 'ECI'], [/wage price index/i, 'WPI'],
  [/unemployment claims|jobless claims/i, 'Claims'], [/unemployment (rate|change)/i, 'Unemployment'], [/claimant count/i, 'Claimant'],
  [/JOLTS/i, 'JOLTS'], [/employment change/i, 'Jobs'],
  [/core PCE/i, 'Core PCE'], [/\bPCE\b/i, 'PCE'], [/trimmed mean CPI/i, 'Trimmed CPI'], [/core CPI/i, 'Core CPI'], [/\bCPI\b/i, 'CPI'],
  [/core PPI/i, 'Core PPI'], [/\bPPI\b/i, 'PPI'],
  [/core retail sales/i, 'Core Retail'], [/retail sales/i, 'Retail Sales'], [/\bGDP\b/i, 'GDP'],
  [/ISM manufacturing/i, 'ISM Mfg'], [/ISM services|ISM non-manufacturing/i, 'ISM Services'], [/manufacturing PMI/i, 'Mfg PMI'], [/services PMI/i, 'Services PMI'],
  [/meeting minutes|\bminutes\b/i, 'Minutes'], [/press conference/i, 'Press Conf'], [/monetary policy (statement|report|summary)/i, 'Policy'],
  [/rate statement/i, 'Rate Stmt'],
  [/FOMC statement|funds rate|refinancing rate|bank rate|cash rate|overnight rate|policy rate|interest rate|deposit rate/i, 'Rate'],
  [/^(?:\w+ )?(?:chair|gov(?:ernor)?|president) (\w+) speaks/i, m => m[1]], [/^(\w+) speaks/i, m => m[1]],
  [/consumer confidence/i, 'Confidence'], [/consumer sentiment/i, 'Sentiment'], [/empire state/i, 'Empire'], [/philly fed/i, 'Philly Fed'],
  [/trade balance/i, 'Trade Bal'], [/industrial production/i, 'Ind Prod'], [/durable goods/i, 'Durables'], [/tankan/i, 'Tankan'],
  [/housing starts/i, 'Housing'], [/building permits/i, 'Permits'], [/(existing|new|pending) home sales/i, 'Home Sales'],
];
const PLACES = /^(German|French|Italian|Spanish|Tokyo|Chinese|Swiss)\b/i;
/** "Core CPI m/m" → "Core CPI"; "Fed Chair Powell Speaks" → "Powell". */
export function shortNews(title) {
  const t = String(title || '');
  const place = (t.match(PLACES) || [])[1];
  for (const [re, out] of SHORT) {
    const m = t.match(re);
    if (m) { const s = typeof out === 'function' ? out(m) : out; return place && !/speaks/i.test(t) ? `${place} ${s}` : s; }
  }
  const bare = t.replace(/\b(m\/m|y\/y|q\/q|prelim|flash|advance|final|revised)\b/gi, '').replace(/\s+/g, ' ').trim();
  return bare.length > 16 ? bare.slice(0, 15).trim() + '…' : bare;
}
/** A release as it is shown: its currency, then its short name — "USD - NFP". */
export const newsLabel = ev => `${ev.country ? ev.country + ' - ' : ''}${shortNews(ev.title)}`;
