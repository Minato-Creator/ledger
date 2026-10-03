/* ============================================================
   newsday.js — what the calendar says about the day a trade was taken.

   Two questions, kept apart because they are different things:
   • a red folder day — a high-impact release for one of the pair's OWN
     currencies (AUDUSD: AUD or USD; gold and the Nasdaq: USD). A CAD
     release does not make it a news day for AUDUSD.
   • a bank holiday — any country's, because a closed market anywhere thins
     the whole session.

   The calendar can only answer for the weeks it was read. For any other day
   it says nothing, and what was put on the trade by hand stands.
   ============================================================ */
import { oandaInstrument, currenciesOf } from './candles.js';
import { localDay } from './news.js';
import { isRedFolder, isBankHoliday, holidayFromCurrency, holidayName } from './questions.js';

export const pairCurrencies = pair => currenciesOf(oandaInstrument(pair));
/** A bank holiday's key: the country where Quire knows it, else the currency. */
export const holidayKey = cur => holidayFromCurrency(cur) || String(cur || '').toUpperCase();

const DAY = 864e5;
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const dayMs = d => Date.parse(d + 'T00:00:00Z');
const monday = d => { const m = dayMs(d); return iso(m - ((new Date(m).getUTCDay() + 6) % 7) * DAY); };
const sunday = d => iso(dayMs(monday(d)) + 6 * DAY);

/** Whether the calendar was read for the week this day is in. */
export function covers(news, date) {
  if (!date) return false;
  return (news?.spans || []).some(s => date >= monday(localDay(s.from)) && date <= sunday(localDay(s.to)));
}

/** The day's red folders for the pair and its bank holidays, or null when
    the calendar was never read for that day. */
export function dayNews(news, pair, date) {
  if (!covers(news, date)) return null;
  const evs = (news.events || []).filter(e => localDay(e.at) === date);
  const cur = pairCurrencies(pair);
  return { red: evs.filter(e => isRedFolder(e) && cur.includes(e.country)), holidays: evs.filter(isBankHoliday) };
}

/** What is kept on the trade of the release it was taken around. */
export const snapEvent = e => ({ title: e.title, country: e.country, at: e.at });

const AROUND = ['before', 'during', 'after', 'between'];
const sameEv = (a, b) => !!a && !!b && a.title === b.title && a.country === b.country && a.at === b.at;

/**
 * The news and bank holidays of a trade's day, the way every page shows
 * them. Where the calendar was read for that day it answers — whatever was
 * saved on the trade before (an old tick, nothing at all) — so a trade
 * logged before the calendar filled these in reads right without being
 * opened and saved. Where it was not, what is on the trade stands.
 *   events     the red folder(s) for the pair's own currencies: the one you
 *              picked, else every one that day
 *   holidays   country keys ('CA', 'CN', …), any country's
 *   from       'calendar' | 'trade'
 */
export function newsOf(t, news) {
  const d = dayNews(news, t?.pair, t?.date);
  if (d) {
    const picked = d.red.find(e => sameEv(snapEvent(e), t.newsEvent));
    return { events: (picked ? [picked] : d.red).map(snapEvent), holidays: [...new Set(d.holidays.map(e => holidayKey(e.country)))], from: 'calendar' };
  }
  return { events: t?.newsEvent?.title ? [t.newsEvent] : [], holidays: Array.isArray(t?.holidays) ? t.holidays : [], from: 'trade' };
}

/** What kind of day a trade was taken on: { red, holiday }. The calendar
    answers where it can; otherwise what is on the trade. */
export function newsDayOf(t, news) {
  const n = newsOf(t, news);
  if (n.from === 'calendar') return { red: n.events.length > 0, holiday: n.holidays.length > 0 };
  return { red: n.events.length > 0 || AROUND.includes(t.news), holiday: n.holidays.length > 0 };
}

/** The red folder(s) of a trade's day as words: "USD · Core PCE Price Index m/m",
    or several, one after the other. null when there were none. */
export function newsText(t, news) {
  const evs = newsOf(t, news).events;
  if (!evs.length) return null;
  const curs = [...new Set(evs.map(e => e.country).filter(Boolean))];
  return (curs.length ? curs.join(', ') + ' · ' : '') + evs.map(e => e.title).join(', ');
}
/** Its bank holidays as words: "Canada", "China, Canada". null for none. */
export const holidayText = (t, news) => { const h = newsOf(t, news).holidays; return h.length ? h.map(holidayName).join(', ') : null; };
