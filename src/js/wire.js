/* ============================================================
   wire.js — the newswire, from investingLive's own feeds.

   The economic calendar tells you what is scheduled. This tells you what
   happened. They are different things and they live on different pages: the
   calendar belongs in the morning's outlook, the wire is a page you scroll.

   Everything about this is shaped by whose feed it is:

   • It reads the RSS investingLive publish for the purpose, on a page that
     lists the feed URLs. It is not scraped. Scraping breaks, and it is not
     ours to take.

   • Every item keeps its own source feed, so the category is known from
     where it came rather than guessed from its words.

   • pubDate is RFC 2822 with a zone — "Fri, 25 Sep 2026 14:00:09 GMT" — so
     an item is a real instant. The machine puts it on your clock, which
     means it stays right through their daylight saving and yours. No number
     is typed anywhere, and there is nothing to set.

   • What is fetched is kept in the vault, newest first and capped. The wire
     you last saw is still there on a plane, and the page says when it was
     read rather than letting last night's headlines pass for this morning's.

   • Nothing about you is sent. Each one is a GET for a public file.
   ============================================================ */

const BASE = 'https://investinglive.com/feed';

/* The categories, in the order they read on the page. `all` is the one the
   live refresh uses: it carries every category and is one request rather
   than seven, which is the difference between keeping a page fresh and
   hammering somebody else's server every three minutes. */
export const FEEDS = [
  { key: 'all',        url: `${BASE}/`,                  label: 'Everything', live: true, hidden: true },
  { key: 'news',       url: `${BASE}/news/`,             label: 'News' },
  { key: 'fxorders',   url: `${BASE}/forexorders/`,      label: 'FX orders' },
  { key: 'centralbank',url: `${BASE}/centralbank/`,      label: 'Central banks' },
  { key: 'technical',  url: `${BASE}/technicalanalysis/`,label: 'Technicals' },
  { key: 'crypto',     url: `${BASE}/cryptocurrency/`,   label: 'Crypto' },
  { key: 'education',  url: `${BASE}/education/`,        label: 'Education' },
];

/** The feeds a full read walks — everything except the live one. */
export const DEEP_FEEDS = FEEDS.filter(f => !f.hidden);
export const LIVE_FEED = FEEDS.find(f => f.live);

/** How long a fetched copy is treated as current. */
export const FRESH_MINS = 3;

/** How much of the wire the vault keeps: the 50 newest. Anything older is
    deleted — it is history, and history belongs to investingLive's own site
    rather than to your journal. */
export const KEEP_ITEMS = 50;
export const KEEP_DAYS = 10;

/* The category an item carries when the feed it came from is the mixed one.
   RSS lets an item name several; the first one that is a category we show
   wins, and anything else falls back to News rather than inventing a bin. */
const BY_FEED_NAME = {
  'news': 'news',
  'forex': 'news',
  'forex orders': 'fxorders',
  'central banks': 'centralbank',
  'central bank': 'centralbank',
  'technical analysis': 'technical',
  'cryptocurrency': 'crypto',
  'crypto': 'crypto',
  'education': 'education',
  'commodities': 'news',
  'stocks': 'news',
};

export function categoryFrom(names, fallback = 'news') {
  for (const n of names || []) {
    const hit = BY_FEED_NAME[String(n).trim().toLowerCase()];
    if (hit) return hit;
  }
  return fallback;
}

export const labelFor = (key) => (FEEDS.find(f => f.key === key) || {}).label || 'News';

/* ---------- reading the XML ----------
   RSS is simple enough that a real parser is the right tool rather than a
   clever regular expression: a headline can contain an ampersand, a
   description arrives wrapped in CDATA, and both of those break the clever
   version quietly and at the worst moment. */
export function parseWire(text, feedKey = 'news') {
  if (typeof DOMParser === 'undefined') throw new Error('No XML parser here.');
  const doc = new DOMParser().parseFromString(String(text || ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('That feed did not come back as XML.');

  /* Tag names are matched on their local name rather than through a
     selector: an RSS item's author arrives as <dc:creator>, and a CSS
     selector cannot name a prefixed tag in an XML document at all. */
  const kids = (node, name) => [...node.children].filter(c => c.localName === name);
  const text_ = (node, name) => {
    const n = kids(node, name)[0];
    return n ? (n.textContent || '').trim() : '';
  };

  const items = [...doc.getElementsByTagName('item')];
  if (!items.length && !/^(rss|feed|RDF)$/.test(doc.documentElement?.localName || '')) {
    throw new Error('That feed was not a list of headlines.');
  }

  const out = [];
  for (const it of items) {
    const title = text_(it, 'title');
    const when = text_(it, 'pubDate') || text_(it, 'date');
    const at = new Date(when);
    /* A headline at the wrong hour is worse than no headline, and one with
       no title is nothing at all. Either way it is dropped, not shown. */
    if (!title || isNaN(at)) continue;

    const link = text_(it, 'link');
    const cats = kids(it, 'category').map(c => (c.textContent || '').trim());

    out.push({
      id: text_(it, 'guid') || link || `${when}|${title}`,
      title,
      link,
      at: at.toISOString(),
      by: text_(it, 'creator') || '',
      /* The body is kept short. The wire is a list you scan; the whole
         article is on their site, and this is a journal, not a reader. */
      summary: clean(text_(it, 'description')).slice(0, 420),
      category: feedKey === 'all' ? categoryFrom(cats) : feedKey,
    });
  }
  out.sort((a, b) => b.at.localeCompare(a.at));
  return out;
}

/** A description with its markup taken out and its spacing settled. */
export function clean(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- merging ----------
   A headline arrives on the mixed feed and again on its own category's, so
   the same item is read twice on purpose. Merging keeps the one that knows
   its category rather than whichever happened to land second. */
export function mergeWire(existing, incoming) {
  const by = new Map();
  for (const it of existing || []) if (it && it.id) by.set(it.id, it);
  for (const it of incoming || []) {
    if (!it || !it.id) continue;
    const had = by.get(it.id);
    if (!had) { by.set(it.id, it); continue; }
    /* The category comes from whichever copy was filed by investingLive
       rather than read off a tag — but the rest is taken from either, since
       the same headline can arrive with a summary on one feed and without
       one on the other, and the version with the story in it is the one
       worth keeping. */
    const keep = had.filed ? had : it;
    const other = had.filed ? it : had;
    by.set(it.id, {
      ...other, ...keep,
      summary: keep.summary || other.summary,
      link: keep.link || other.link,
      by: keep.by || other.by,
    });
  }
  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  return [...by.values()]
    .filter(it => new Date(it.at) >= cutoff)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, KEEP_ITEMS);
}

/* ---------- reading the feed ----------
   On the desktop the shell fetches it, because a webview will not make a
   cross-site request without the other end's permission and the shell has no
   such rule. In a browser the page asks directly, which works or does not
   depending on what the feed allows — and when it does not, that is reported
   as what it is rather than as an empty page. */
export async function fetchFeed(url) {
  if (typeof window !== 'undefined' && window.__TAURI__) {
    return window.__TAURI__.core.invoke('fetch_text', { url });
  }
  let res;
  /* A browser's own words for a failed request are "Failed to fetch", which
     tells you nothing about what happened or whose fault it is. */
  try { res = await fetch(url, { cache: 'no-store' }); }
  catch { throw new Error('could not be reached'); }
  if (!res.ok) throw new Error(`answered ${res.status}`);
  return res.text();
}

/**
 * Read one feed and hand back its items, each knowing where it came from.
 * A feed that will not answer throws with its own name attached, so a page
 * can say which one failed rather than that "the wire" did.
 */
export async function readFeed(feed) {
  let text;
  try { text = await fetchFeed(feed.url); }
  catch (e) { throw new Error(`${feed.label} ${e.message || e}`); }
  const items = parseWire(text, feed.key);
  /* An item off a category feed was filed there by investingLive. One off
     the mixed feed had its category read from a tag, which is a guess. */
  if (!feed.live) for (const it of items) it.filed = true;
  return items;
}

/* ---------- reading it back ---------- */
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

/** "just now", "12m ago", "3h ago", "2d ago" — how a wire is read. */
export function ago(iso, now = Date.now()) {
  const m = Math.round((now - new Date(iso)) / 60000);
  if (!isFinite(m)) return '';
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h ago`;
  return `${Math.round(m / 60 / 24)}d ago`;
}

/** Group into days, newest day first, newest item first inside each. */
export function byDay(items) {
  const days = new Map();
  for (const it of items || []) {
    const d = localDay(it.at);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(it);
  }
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}
