/* A stand-in for OANDA's candles endpoint, for the suites that need prices.
   One-minute mid candles from a seeded random walk, closed at the weekend the
   way the FX market is. Same prices every run. */
export const KEY = 'demo-0123456789abcdef-0123456789abcdef';
export const ORIGIN = Date.UTC(2026, 8, 7) / 1000;               // Mon 7 Sep 2026, 00:00 UTC
export const MINS = 16 * 1440;

function walk(seed, base, vol) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const out = new Float64Array(MINS + 1); out[0] = base;
  for (let i = 1; i <= MINS; i++) out[i] = out[i - 1] + (rnd() - 0.5) * vol;
  return out;
}
export const SERIES = { XAU_USD: [walk(7, 4080, 0.9), 2], NAS100_USD: [walk(11, 24100, 9), 1], AUD_USD: [walk(13, 0.6612, 0.00012), 5] };
export const closedAt = s => { const d = new Date(s * 1000), dow = d.getUTCDay(), h = d.getUTCHours(); return dow === 6 || (dow === 0 && h < 22) || (dow === 5 && h >= 21); };

/** The candle rows exactly as the app will parse them: [t, o, h, l, c]. */
export function rowsOf(inst, from, to) {
  const [w, dp] = SERIES[inst];
  const r = v => +v.toFixed(dp);
  const out = [];
  for (let s = Math.ceil(from / 60) * 60; s < to; s += 60) {
    if (closedAt(s)) continue;
    const i = (s - ORIGIN) / 60;
    if (i < 0 || i >= MINS) continue;
    const o = w[i], c = w[i + 1], span = Math.abs(c - o) * 0.6 + (w[0] * 0.00004);
    out.push([s, r(o), r(Math.max(o, c) + span), r(Math.min(o, c) - span), r(c)]);
  }
  return out;
}

/** A Playwright route handler answering both OANDA hosts. */
export function oandaRoute(SEEN = [], state = { mode: 'ok' }, keys = { practice: KEY }) {
  return async route => {
    const req = route.request(), u = new URL(req.url());
    const auth = req.headers()['authorization'] || '';
    SEEN.push({ host: u.host, path: u.pathname, q: Object.fromEntries(u.searchParams), auth });
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    if (state.mode === 'down') return route.abort('internetdisconnected');
    if (auth !== `Bearer ${keys.practice}`) return json(401, { errorMessage: 'Insufficient authorization to perform request.' });
    const m = u.pathname.match(/^\/v3\/instruments\/([A-Z0-9_]+)\/candles$/);
    if (!m || !SERIES[m[1]]) return json(400, { errorMessage: 'Invalid instrument' });
    const dp = SERIES[m[1]][1];
    const from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const rows = u.searchParams.get('count') ? rowsOf(m[1], Date.UTC(2026, 8, 18, 3, 55) / 1000, Date.UTC(2026, 8, 18, 4) / 1000) : rowsOf(m[1], from, to);
    return json(200, { instrument: m[1], granularity: 'M1',
      candles: rows.map(([t, o, h, l, c]) => ({ complete: true, volume: 10, time: `${t}.000000000`, mid: { o: o.toFixed(dp), h: h.toFixed(dp), l: l.toFixed(dp), c: c.toFixed(dp) } })) });
  };
}
