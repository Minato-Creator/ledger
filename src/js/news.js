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
