/* Stand-ins for the four sources behind Plan → Markets, each in its own
   format: OANDA's daily and intraday candles, CoinGecko's coin list and
   market chart, Binance's 24-hour tickers, and Yahoo Finance's spark quotes
   (twenty a request at most, as the real one insists) and daily chart; and
   Elbstream's company logos. The forex moves are Minato's
   watchlist as he showed it (6 Nov). */
export const FX_MOVES = { XAU_USD: -0.28, NAS100_USD: 2.18, SPX500_USD: 0.87, EUR_USD: -0.35, GBP_USD: -0.42, AUD_USD: -0.76, NZD_USD: -0.82,
  CAD_JPY: -0.05, NZD_JPY: -0.44, AUD_JPY: -0.41, GBP_JPY: -0.05, EUR_JPY: 0.01, USD_JPY: 0.37, USD_CAD: 0.41, USD_CHF: 0.15, USD_SEK: 0.2, DXY: 0.35 };
export const FX_BASE = { XAU_USD: 4075.08, NAS100_USD: 27139.0, SPX500_USD: 6890.4, EUR_USD: 1.1532, GBP_USD: 1.3091, AUD_USD: 0.6498, NZD_USD: 0.5655,
  CAD_JPY: 108.95, NZD_JPY: 86.71, AUD_JPY: 99.62, GBP_JPY: 200.71, EUR_JPY: 176.82, USD_JPY: 153.32, USD_CAD: 1.4073, USD_CHF: 0.8062, USD_SEK: 9.512, DXY: 99.868 };
/* the forex tab's symbols as Yahoo writes them (markets.js FOREX `yahoo`) */
const FX_YAHOO = { 'GC=F': 'XAU_USD', 'NQ=F': 'NAS100_USD', 'ES=F': 'SPX500_USD', 'DX-Y.NYB': 'DXY' };
const fxOfYahoo = sym => FX_YAHOO[sym] || (/^([A-Z]{3})([A-Z]{3})=X$/.test(sym) ? sym.replace(/^([A-Z]{3})([A-Z]{3})=X$/, '$1_$2') : null);
export const COINS = [
  ['bitcoin', 'btc', 'Bitcoin', 104250, 2.1, 2.07e12], ['ethereum', 'eth', 'Ethereum', 2593.16, 0.23, 3.1e11], ['tether', 'usdt', 'Tether', 1.0, 0.01, 1.8e11],
  ['ripple', 'xrp', 'XRP', 2.31, -1.4, 1.3e11], ['binancecoin', 'bnb', 'BNB', 951.2, 0.6, 1.3e11], ['solana', 'sol', 'Solana', 162.5, 4.2, 9.0e10],
  ['usd-coin', 'usdc', 'USDC', 1.0, 0.0, 7.5e10], ['dogecoin', 'doge', 'Dogecoin', 0.171, -3.1, 2.6e10], ['wrapped-bitcoin', 'wbtc', 'Wrapped Bitcoin', 104100, 2.0, 1.3e10],
  ['cardano', 'ada', 'Cardano', 0.552, -2.2, 2.0e10], ['tron', 'trx', 'TRON', 0.291, 0.4, 2.7e10], ['chainlink', 'link', 'Chainlink', 15.42, 1.7, 1.0e10],
  ['avalanche-2', 'avax', 'Avalanche', 17.9, -0.9, 7.6e9], ['sui', 'sui', 'Sui', 2.12, 6.4, 7.5e9], ['shiba-inu', 'shib', 'Shiba Inu', 0.0000098, -1.1, 5.8e9],
];
export const LOGO_OK = ['AAPL', 'NVDA'];
export const STOCK_MOVES = { AAPL: 1.2, MSFT: -0.4, NVDA: 3.4, TSLA: -2.6, AMZN: 0.8, META: 1.9, 'BRK.B': 0.2, JPM: -0.7, XOM: -1.8, LLY: 2.2 };

function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
const GRAN = { M15: 900, H1: 3600, H4: 14400, D: 86400 };
/* a walk ending at `end`, `n` steps of `step` seconds back from now */
export function walk(key, end, n, step, now, vol = 0.0015) {
  const r = rnd(hash(key) + n), out = [];
  let p = end;
  for (let i = 0; i < n; i++) { out.unshift([now - i * step, p]); p *= 1 + (r() - 0.5) * vol * 2; }
  return out;
}
const dec = inst => (/JPY/.test(inst) ? 3 : /XAU|NAS|SPX/.test(inst) ? (/XAU/.test(inst) ? 3 : 1) : 5);
export function oandaCandles(inst, gran, count, now = Math.floor(Date.now() / 1000)) {
  const end = FX_BASE[inst];
  if (end == null) return null;
  if (gran === 'D') {
    const prev = end / (1 + FX_MOVES[inst] / 100), f = v => v.toFixed(dec(inst));
    return [{ complete: true, volume: 1, time: String(now - 86400) + '.000000000', mid: { o: f(prev * 0.999), h: f(prev * 1.003), l: f(prev * 0.996), c: f(prev) } },
      { complete: false, volume: 1, time: String(now - 3600) + '.000000000', mid: { o: f(prev), h: f(Math.max(prev, end) * 1.001), l: f(Math.min(prev, end) * 0.999), c: f(end) } }].slice(-count);
  }
  return walk(inst + gran, end, count, GRAN[gran], now).map(([t, p]) => { const f = v => v.toFixed(dec(inst));
    return { complete: true, volume: 1, time: String(t) + '.000000000', mid: { o: f(p), h: f(p * 1.0004), l: f(p * 0.9996), c: f(p) } }; });
}
export function geckoMarkets(now = Date.now()) {
  return COINS.map(([id, symbol, name, price, ch, cap], i) => ({ id, symbol, name, image: `https://coin-images.coingecko.com/coins/images/${i + 1}/large/${id}.png`,
    current_price: price, market_cap: cap, market_cap_rank: i + 1, price_change_percentage_24h: ch,
    sparkline_in_7d: { price: walk(id, price, 168, 3600, Math.floor(now / 1000), 0.004).map(p => p[1]) } }));
}
const stockBase = l => 40 + (Math.abs(hash(l)) % 460) + 0.37;
const stockMove = l => STOCK_MOVES[l] ?? ((Math.abs(hash(l + 'm')) % 300) / 100 - 1.5);
/* Yahoo writes BRK.B as BRK-B */
export function yahooMeta(sym, now = Math.floor(Date.now() / 1000)) {
  /* a forex-tab symbol: his watchlist's price now (FX_BASE) and move (FX_MOVES), as OANDA's stand-in has them */
  const fx = fxOfYahoo(sym);
  if (fx && FX_BASE[fx] != null) {
    const price = FX_BASE[fx], prev = price / (1 + FX_MOVES[fx] / 100);
    return { currency: 'USD', symbol: sym, instrumentType: fx === 'DXY' ? 'INDEX' : 'CURRENCY', regularMarketTime: now, regularMarketPrice: price,
      regularMarketChangePercent: +FX_MOVES[fx].toFixed(4), chartPreviousClose: +prev.toFixed(5), dataGranularity: '1d', range: '1d' };
  }
  const l = sym.replace('-', '.'), prev = stockBase(l), mv = stockMove(l);
  return { currency: 'USD', symbol: sym, instrumentType: 'EQUITY', regularMarketTime: now, regularMarketPrice: +(prev * (1 + mv / 100)).toFixed(2),
    regularMarketChangePercent: +mv.toFixed(3), chartPreviousClose: +prev.toFixed(2), priceHint: 2, dataGranularity: '1d', range: '1d' };
}
export function yahooSpark(symbols, now = Math.floor(Date.now() / 1000)) {
  return { spark: { result: symbols.map(s => { const meta = yahooMeta(s, now);
    return { symbol: s, response: [{ meta, timestamp: [now], indicators: { quote: [{ close: [meta.regularMarketPrice] }] } }] }; }), error: null } };
}
/* a company's daily closes, with one day missing its close (as Yahoo's data sometimes is) */
export function yahooChart(sym, range = '1mo', now = Math.floor(Date.now() / 1000), interval = '1d') {
  const step = { '15m': 900, '60m': 3600, '1h': 3600 }[interval] || 86400, meta = yahooMeta(sym, now);
  const n = step === 900 ? 96 : step === 3600 ? (range === '5d' ? 120 : 480) : ({ '1mo': 22, '3mo': 63, '1y': 251 }[range] || 22);
  const pts = walk(sym + range + interval, meta.regularMarketPrice, n, step, now, step === 86400 ? 0.012 : 0.002);
  const close = pts.map(([, p], i) => (i === 3 ? null : +p.toFixed(2)));
  return { chart: { result: [{ meta: { ...meta, range }, timestamp: pts.map(([t]) => t), indicators: { quote: [{ close }] } }], error: null } };
}

/** A Playwright route handler for all four; `fail` names sources that should say no (e.g. { coingecko: true }). */
export function marketsRoute({ fail = {}, seen = [] } = {}) {
  return async route => {
    const u = new URL(route.request().url());
    seen.push(u.host + u.pathname);
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/oanda\.com$/.test(u.host)) {
      const m = u.pathname.match(/^\/v3\/instruments\/([A-Z0-9_]+)\/candles$/);
      if (!m) return route.fulfill({ status: 404, body: '{}' });
      const c = oandaCandles(m[1], u.searchParams.get('granularity'), +u.searchParams.get('count') || 2);
      return c ? json({ instrument: m[1], granularity: u.searchParams.get('granularity'), candles: c }) : route.fulfill({ status: 400, body: '{"errorMessage":"Invalid instrument"}' });
    }
    if (u.host === 'api.coingecko.com') {
      if (fail.coingecko) return route.fulfill({ status: 429, body: '{"status":{"error_code":429}}' });
      if (u.pathname.endsWith('/coins/markets')) return json(geckoMarkets());
      const mc = u.pathname.match(/\/coins\/([^/]+)\/market_chart$/);
      if (mc) { const c = COINS.find(x => x[0] === mc[1]); const days = +u.searchParams.get('days') || 1;
        return json({ prices: walk(mc[1] + days, c ? c[3] : 1, days * 24, 3600, Math.floor(Date.now() / 1000), 0.006).map(([t, p]) => [t * 1000, p]) }); }
    }
    if (u.host === 'data-api.binance.vision') {
      if (u.pathname.endsWith('/ticker/24hr')) return json(COINS.map(([, s, , price, ch]) => ({ symbol: s.toUpperCase() + 'USDT', openPrice: String(price / (1 + ch / 100)), lastPrice: String(price) })));
      if (u.pathname.endsWith('/klines')) { const s = u.searchParams.get('symbol'), c = COINS.find(x => x[1].toUpperCase() + 'USDT' === s);
        return json(walk(s, c ? c[3] : 1, +u.searchParams.get('limit') || 96, 3600, Math.floor(Date.now() / 1000), 0.006).map(([t, p]) => [t * 1000, String(p), String(p), String(p), String(p), '1'])); }
    }
    if (u.host === 'query1.finance.yahoo.com') {
      if (fail.yahoo) return route.fulfill({ status: 429, contentType: 'text/plain', body: 'Edge: Too Many Requests' });
      if (u.pathname === '/v7/finance/spark') {
        const syms = (u.searchParams.get('symbols') || '').split(',').filter(Boolean);
        if (syms.length > 20) return route.fulfill({ status: 400, contentType: 'application/json',
          body: JSON.stringify({ spark: { result: null, error: { code: 'Bad Request', description: 'Number of symbols needs to be less than or equal to 20' } } }) });
        return json(yahooSpark(syms));
      }
      const ch = u.pathname.match(/^\/v8\/finance\/chart\/([^/]+)$/);
      if (ch) return json(yahooChart(decodeURIComponent(ch[1]), u.searchParams.get('range') || '1mo', undefined, u.searchParams.get('interval') || '1d'));
    }
    /* a company's logo: a plain square for two of them, none for the rest (so the ticker chip shows) */
    if (u.host === 'api.elbstream.com') {
      const t = decodeURIComponent(u.pathname.split('/').pop());
      if (LOGO_OK.includes(t)) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" rx="2" fill="#3366ff"/></svg>` });
      return route.fulfill({ status: 404, body: '' });
    }
    if (u.host === 'finnhub.io' && u.pathname === '/api/v1/quote') {
      const l = u.searchParams.get('symbol'), prev = 40 + (Math.abs(hash(l)) % 460) + 0.37, mv = (STOCK_MOVES[l] ?? 0.5) + 0.05;
      return json({ c: +(prev * (1 + mv / 100)).toFixed(2), d: 1, dp: mv, h: 0, l: 0, o: prev, pc: prev, t: Math.floor(Date.now() / 1000) });
    }
    return route.fulfill({ status: 404, body: '' });
  };
}
