/* ============================================================
   questions.js — what New trade asks beyond the numbers.

   How sure you were going in, how it felt coming out, how it ended, what
   it would have made if held, the timeframe, what went wrong and how price
   moved. Pure: the form, the pages, the CSV and the importer all read the
   same lists from here.
   ============================================================ */

/* How sure you were going in, from the trade you should not have taken to
   the one you would take every time. A slide, because it is a feel. */
export const CONFIDENCE = [[1, 'Revenge'], [2, 'Forced'], [3, 'Unsure'], [4, 'Solid'], [5, 'Confident']];
/* How it felt once it was over, from the trade you are furious about to the
   one you would frame. */
export const EMOTION_AFTER = [[1, 'Angry'], [2, 'Regret'], [3, 'Indifferent'], [4, 'Content'], [5, 'Satisfied']];
/* The timeframe you took the entry on. */
export const EXEC_TFS = ['1m', '3m', '5m', '15m', '30m', '1H', '4H', 'D'];
/* What went wrong, if anything. A trade can carry several. */
export const MISTAKES = [['closed_early', 'Closed early'], ['early_entry', 'Early entry'], ['no_confirm', 'No confirmation entry'],
  ['be_early', 'Moved to BE early'], ['bad_sl', 'Bad stop loss'], ['tp_far', 'TP too far'], ['wrong_bias', 'Wrong bias'], ['analysis', 'Analysis mistake']];
/* How cleanly price moved: smooth and readable, or choppy. */
export const DELIVERY = [['good', 'Good'], ['neutral', 'Neutral'], ['poor', 'Poor']];
/* How the trade ended, as opposed to what it made. */
export const EXIT_REASONS = [['tp', 'Take profit'], ['sl', 'Stop loss'], ['be', 'Break-even'], ['manual', 'Closed manually']];

/* When the trade sat against red-folder news that mattered to it. You say,
   because which news moves which pair is your call, not the calendar's:
   before it (the news came after you were out), during it, after it (the
   news was out before you went in), or in between (news on both sides). */
export const NEWS = [['none', 'No news'], ['before', 'Before news'], ['during', 'During news'], ['after', 'After news'], ['between', 'In between']];
/* Whose bank holiday it was, if anyone's. Keyed by the country; the
   calendar feed names them by currency, so each carries its currency too. */
export const HOLIDAYS = [['US', 'United States', 'USD'], ['UK', 'United Kingdom', 'GBP'], ['EU', 'Euro area', 'EUR'], ['JP', 'Japan', 'JPY'],
  ['CA', 'Canada', 'CAD'], ['AU', 'Australia', 'AUD'], ['NZ', 'New Zealand', 'NZD'], ['CH', 'Switzerland', 'CHF'], ['CN', 'China', 'CNY']];
export const holidayName = k => (HOLIDAYS.find(([c]) => c === k) || [])[1] || k;
export const holidayFromCurrency = cur => (HOLIDAYS.find(([, , c]) => c === String(cur || '').toUpperCase()) || [])[0] || null;
/** A bank holiday from the calendar, named for its country: "United Kingdom". */
export const holidayCountry = cur => { const k = holidayFromCurrency(cur); return k ? holidayName(k) : String(cur || '').toUpperCase(); };
/* Red folders and bank holidays are different things: a red folder is a
   high-impact release at a time; a bank holiday is a country closed all day. */
export const isRedFolder = e => e?.impact === 'High';
/* Forex Factory files more than bank holidays in its grey "Holiday" folder —
   the clocks changing ("Daylight Saving Time Shift") comes in it too. Only a
   day the banks are shut is a bank holiday. */
export const isBankHoliday = e => e?.impact === 'Holiday' && /holiday/i.test(e?.title || '');

/* ---------- if held ----------
   What a trade would have made had it been left alone. Asked only of a
   trade that stopped short: closed by hand, or marked closed early or moved
   to break-even early. Kept on the trade as `heldOutcome` and a signed
   `heldR`. */
export const HELD = [['win', 'Win'], ['be', 'BE'], ['loss', 'Loss']];

/** Did this trade stop short, so that "what if you had held it" is a question? */
export function heldAsked(t) {
  if (!t || t.status === 'open') return false;
  const m = Array.isArray(t.mistakes) ? t.mistakes : [];
  return t.exitReason === 'manual' || m.includes('closed_early') || m.includes('be_early');
}

/** A held answer read off a trade, or null when there is not a whole one. */
export function heldOf(t) {
  if (!t || !HELD.some(([k]) => k === t.heldOutcome)) return null;
  if (t.heldOutcome === 'be') return { outcome: 'be', r: 0 };
  const n = Number(t.heldR);
  if (t.heldR == null || t.heldR === '' || !isFinite(n)) return null;
  return { outcome: t.heldOutcome, r: t.heldOutcome === 'win' ? Math.abs(n) : -Math.abs(n) };
}

/** "+2.5R if held", "BE if held", "−1R if held". */
export function heldText(h) {
  if (!h) return '—';
  if (h.outcome === 'be') return 'BE · 0R';
  const n = Math.abs(h.r);
  return `${h.outcome === 'win' ? 'Win · +' : 'Loss · −'}${+n.toFixed(2)}R`;
}


/* ---------- in a spreadsheet ----------
   The same answers as columns, written in words a person reads (labels, not
   keys) and read back from either. Several mistakes share one cell with ';'
   between them, the way tags do; "None" means none were made. */
export const QUESTION_COLUMNS = ['confidence', 'emotionAfter', 'exitReason', 'heldOutcome', 'heldR', 'execTf', 'mistakes', 'delivery', 'news', 'holidays'];

const labelOf = (list, k) => (list.find(([v]) => v === k) || [])[1] ?? '';
const keyOf = (list, text) => {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return null;
  const hit = list.find(([k, label]) => String(k).toLowerCase() === s || String(label).toLowerCase() === s);
  return hit ? hit[0] : null;
};

/** One trade's answers, in QUESTION_COLUMNS order, ready for a CSV row. */
export function questionCells(t) {
  const open = t.status === 'open';
  const h = heldOf(t);
  return [
    t.confidence ?? '',
    open ? '' : t.emotionAfter ?? '',
    open ? '' : labelOf(EXIT_REASONS, t.exitReason),
    h ? labelOf(HELD, h.outcome) : '',
    h ? h.r : '',
    t.execTf ?? '',
    !Array.isArray(t.mistakes) ? '' : t.mistakes.length ? MISTAKES.filter(([k]) => t.mistakes.includes(k)).map(([, n]) => n).join(';') : 'None',
    labelOf(DELIVERY, t.delivery),
    labelOf(NEWS, t.news),
    Array.isArray(t.holidays) ? t.holidays.map(holidayName).join(';') : '',
  ];
}

/**
 * The answers on a row read from a CSV, as trade fields. Anything blank or
 * not recognised is left off rather than guessed at; a sheet without these
 * columns gives back nothing at all.
 */
export function readQuestions(row) {
  const by = new Map(Object.keys(row || {}).map(k => [k.toLowerCase().replace(/[^a-z]/g, ''), row[k]]));
  const get = name => by.get(name.toLowerCase());
  const out = {};
  const scale = v => { const n = Number(String(v ?? '').trim()); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };
  const conf = scale(get('confidence')) ?? keyOf(CONFIDENCE, get('confidence'));
  if (conf != null) out.confidence = conf;
  const feel = scale(get('emotionAfter')) ?? keyOf(EMOTION_AFTER, get('emotionAfter'));
  if (feel != null) out.emotionAfter = feel;
  const xr = keyOf(EXIT_REASONS, get('exitReason'));
  if (xr) out.exitReason = xr;
  const tf = EXEC_TFS.find(v => v.toLowerCase() === String(get('execTf') ?? '').trim().toLowerCase());
  if (tf) out.execTf = tf;
  const dl = keyOf(DELIVERY, get('delivery'));
  if (dl) out.delivery = dl;
  /* "None" is an answer — nothing went wrong — and a blank is not: that
     trade was never asked. */
  const mc = String(get('mistakes') ?? '').trim();
  if (/^none$/i.test(mc)) out.mistakes = [];
  else if (mc) {
    const ks = mc.split(/[;|]/).map(x => keyOf(MISTAKES, x)).filter(Boolean);
    if (ks.length) out.mistakes = MISTAKES.map(([k]) => k).filter(k => ks.includes(k));
  }
  const nw = keyOf(NEWS, get('news'));
  if (nw) out.news = nw;
  const hc = String(get('holidays') ?? '').trim();
  if (hc) {
    const ks = hc.split(/[;|]/).map(x => keyOf(HOLIDAYS.map(([k, n]) => [k, n]), x) || holidayFromCurrency(x)).filter(Boolean);
    if (ks.length) out.holidays = HOLIDAYS.map(([k]) => k).filter(k => ks.includes(k));
  }
  const ho = keyOf(HELD, get('heldOutcome'));
  if (ho) {
    const h = heldOf({ heldOutcome: ho, heldR: String(get('heldR') ?? '').trim() === '' ? null : Number(String(get('heldR')).replace(/[−–]/g, '-')) });
    if (h) { out.heldOutcome = h.outcome; out.heldR = h.r; }
  }
  return out;
}
