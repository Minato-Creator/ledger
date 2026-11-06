/* ============================================================
   markets.js — the prices behind Plan → Markets: how far each instrument
   has moved today, for the bubbles, and its recent line, for the card.

   Three tabs, three sources, none asking you to sign up (Minato, 6 Nov):
   - Forex & futures: his TradingView watchlist, from OANDA with the key
     Laminar already has — the day is OANDA's (17:00 New York), the move
     against yesterday's close. DXY is not an OANDA instrument, so it is
     worked out from its six pairs with the index's own formula: it moves
     with the real one, but is not ICE's number to the decimal.
   - Stocks: fifty large US companies, from Stooq (no key; prices can lag and
     the service can say no). With a Finnhub key in Settings the quotes come
     from Finnhub instead, live, and nothing else changes. The day's base
     (yesterday's close) is read once a day per company and kept.
   - Crypto: the top coins by size from CoinGecko's keyless API — one request
     gives every coin's price, 24-hour move and a week of hourly prices — or,
     when CoinGecko is busy, Binance's public market data.

   Each tab's last answer is kept on this computer and shown at once; a fresh
   one is asked for only while the tab is open, and never more often than the
   page's own timer. Every request is a read. On the desktop each goes
   through the app's shell, to a host named in its list and nowhere else.
   ============================================================ */
import * as cd from './candles.js';
import { fs } from './fs.js';

/* ---------- what is on each tab ---------- */
/* his watchlist, in his groups (gold is in two of them; it is shown once, in his own) */
export const FOREX = [
  { key: 'XAU_USD', label: 'XAUUSD', name: 'Gold', group: 'Minato', kind: 'metal' },
  { key: 'NAS100_USD', label: 'NAS100', name: 'Nasdaq 100', group: 'Minato', kind: 'index', badge: '100' },
  { key: 'SPX500_USD', label: 'US500', name: 'S&P 500', group: 'Minato', kind: 'index', badge: '500' },
  { key: 'DXY', label: 'DXY', name: 'US Dollar Index', group: 'Minato', kind: 'dxy' },
  { key: 'EUR_USD', label: 'EURUSD', name: 'Euro / US Dollar', group: 'USD' },
  { key: 'GBP_USD', label: 'GBPUSD', name: 'British Pound / US Dollar', group: 'USD' },
  { key: 'AUD_USD', label: 'AUDUSD', name: 'Australian Dollar / US Dollar', group: 'USD' },
  { key: 'NZD_USD', label: 'NZDUSD', name: 'New Zealand Dollar / US Dollar', group: 'JPY' },
  { key: 'CAD_JPY', label: 'CADJPY', name: 'Canadian Dollar / Yen', group: 'JPY' },
  { key: 'NZD_JPY', label: 'NZDJPY', name: 'New Zealand Dollar / Yen', group: 'JPY' },
  { key: 'AUD_JPY', label: 'AUDJPY', name: 'Australian Dollar / Yen', group: 'JPY' },
  { key: 'GBP_JPY', label: 'GBPJPY', name: 'British Pound / Yen', group: 'JPY' },
  { key: 'EUR_JPY', label: 'EURJPY', name: 'Euro / Yen', group: 'JPY' },
  { key: 'USD_JPY', label: 'USDJPY', name: 'US Dollar / Yen', group: 'Others' },
  { key: 'USD_CAD', label: 'USDCAD', name: 'US Dollar / Canadian Dollar', group: 'Others' },
  { key: 'USD_CHF', label: 'USDCHF', name: 'US Dollar / Swiss Franc', group: 'Inverse for EUR/USD' },
];
export const FOREX_GROUPS = ['Minato', 'USD', 'JPY', 'Others', 'Inverse for EUR/USD'];
/* DXY = 50.14348112 × EURUSD^−0.576 × USDJPY^0.136 × GBPUSD^−0.119 × USDCAD^0.091 × USDSEK^0.042 × USDCHF^0.036 */
const DXY_W = [['EUR_USD', -0.576], ['USD_JPY', 0.136], ['GBP_USD', -0.119], ['USD_CAD', 0.091], ['USD_SEK', 0.042], ['USD_CHF', 0.036]];
const DXY_K = 50.14348112;
export const dxyOf = px => DXY_K * DXY_W.reduce((m, [k, w]) => m * Math.pow(px[k], w), 1);

const S = (label, name, sector) => ({ key: label, label, name, sector, stooq: label.toLowerCase().replace('.', '-') + '.us' });
export const STOCKS = [
  ...[['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'Nvidia'], ['AVGO', 'Broadcom'], ['ORCL', 'Oracle'], ['AMD', 'AMD'], ['ADBE', 'Adobe'],
    ['CRM', 'Salesforce'], ['INTC', 'Intel'], ['QCOM', 'Qualcomm'], ['CSCO', 'Cisco'], ['PLTR', 'Palantir']].map(([l, n]) => S(l, n, 'Technology')),
  ...[['GOOGL', 'Alphabet'], ['META', 'Meta'], ['NFLX', 'Netflix'], ['DIS', 'Disney'], ['T', 'AT&T']].map(([l, n]) => S(l, n, 'Communication')),
  ...[['AMZN', 'Amazon'], ['TSLA', 'Tesla'], ['HD', 'Home Depot'], ['MCD', 'McDonald’s'], ['NKE', 'Nike'], ['SBUX', 'Starbucks']].map(([l, n]) => S(l, n, 'Consumer')),
  ...[['WMT', 'Walmart'], ['COST', 'Costco'], ['PG', 'Procter & Gamble'], ['KO', 'Coca-Cola'], ['PEP', 'PepsiCo']].map(([l, n]) => S(l, n, 'Everyday goods')),
  ...[['BRK.B', 'Berkshire Hathaway'], ['JPM', 'JPMorgan'], ['V', 'Visa'], ['MA', 'Mastercard'], ['BAC', 'Bank of America'], ['GS', 'Goldman Sachs'],
    ['MS', 'Morgan Stanley'], ['WFC', 'Wells Fargo']].map(([l, n]) => S(l, n, 'Financials')),
  ...[['LLY', 'Eli Lilly'], ['UNH', 'UnitedHealth'], ['JNJ', 'Johnson & Johnson'], ['ABBV', 'AbbVie'], ['MRK', 'Merck'], ['PFE', 'Pfizer'], ['TMO', 'Thermo Fisher']].map(([l, n]) => S(l, n, 'Health')),
  ...[['XOM', 'Exxon'], ['CVX', 'Chevron'], ['COP', 'ConocoPhillips']].map(([l, n]) => S(l, n, 'Energy')),
  ...[['GE', 'GE Aerospace'], ['CAT', 'Caterpillar'], ['BA', 'Boeing'], ['UPS', 'UPS']].map(([l, n]) => S(l, n, 'Industrials')),
];
export const SECTORS = ['Technology', 'Communication', 'Consumer', 'Everyday goods', 'Financials', 'Health', 'Energy', 'Industrials'];
/* A company's logo by its ticker, from Elbstream: no key, straight into an
   <img>. Its free use asks for a visible link back, which the Stocks tab
   carries under the bubbles. */
export const LOGOS = 'https://api.elbstream.com/logos/symbol/';
export const stockLogo = label => LOGOS + encodeURIComponent(label);

export const CRYPTO_COUNT = 30;
/* coins that do not move (stablecoins) or are another coin wrapped or staked: dead bubbles, left out */
const NOT_COINS = new Set(['usdt', 'usdc', 'dai', 'fdusd', 'tusd', 'usde', 'usdd', 'pyusd', 'usds', 'busd', 'usd1', 'rlusd', 'gusd', 'frax', 'lusd', 'eurc', 'usdy',
  'usdtb', 'susde', 'buidl', 'usd0', 'bfusd', 'usdf', 'usdg', 'usdx', 'xaut', 'paxg', 'wbtc', 'weth', 'steth', 'wsteth', 'weeth', 'cbbtc', 'wbeth', 'reth', 'meth', 'lbtc',
  'solvbtc', 'jitosol', 'bnsol', 'msol', 'ezeth', 'rseth', 'tbtc', 'cmeth', 'wbnb', 'clbtc', 'btcb', 'stsol', 'lseth', 'oseth', 'wavax', 'wtrx', 'figr_heloc']);
const notACoin = c => NOT_COINS.has(String(c.symbol).toLowerCase()) || /wrapped|staked|bridged|liquid staking|\bstable/i.test(c.name || '')
  || (Math.abs((c.price || 0) - 1) < 0.02 && Math.abs(c.change || 0) < 0.4);
/* when CoinGecko says no and nothing is kept yet: Binance's markets for the usual top coins */
const FALLBACK_COINS = ['BTC', 'ETH', 'XRP', 'BNB', 'SOL', 'DOGE', 'ADA', 'TRX', 'LINK', 'AVAX', 'SUI', 'XLM', 'TON', 'SHIB', 'HBAR', 'DOT', 'BCH', 'LTC', 'UNI',
  'NEAR', 'APT', 'ICP', 'PEPE', 'AAVE', 'ETC', 'POL', 'ARB', 'OP', 'FIL', 'ATOM'];
const COIN_NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', XRP: 'XRP', BNB: 'BNB', SOL: 'Solana', DOGE: 'Dogecoin', ADA: 'Cardano', TRX: 'TRON', LINK: 'Chainlink',
  AVAX: 'Avalanche', SUI: 'Sui', XLM: 'Stellar', TON: 'Toncoin', SHIB: 'Shiba Inu', HBAR: 'Hedera', DOT: 'Polkadot', BCH: 'Bitcoin Cash', LTC: 'Litecoin',
  UNI: 'Uniswap', NEAR: 'NEAR', APT: 'Aptos', ICP: 'Internet Computer', PEPE: 'Pepe', AAVE: 'Aave', ETC: 'Ethereum Classic', POL: 'POL', ARB: 'Arbitrum',
  OP: 'Optimism', FIL: 'Filecoin', ATOM: 'Cosmos' };

/* ---------- asking ---------- */
const isTauri = () => typeof window !== 'undefined' && !!window.__TAURI__;
const CG = 'https://api.coingecko.com/api/v3', BN = 'https://data-api.binance.vision/api/v3', SQ = 'https://stooq.com', FH = 'https://finnhub.io/api/v1';
async function getText(url) {
  if (isTauri()) return window.__TAURI__.core.invoke('fetch_text', { url });
  const res = await fetch(url, { cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) throw new Error(`${new URL(url).host} said ${res.status}`);
  return text;
}
const getJSON = async url => {
  const t = await getText(url);
  try { return JSON.parse(t); } catch { throw new Error(`${new URL(url).host} did not answer with prices`); }
};
/* a few at a time, in order, so a list of requests is never a burst */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: e }; } }
  }));
  return out;
}
const pct = (now, base) => (Number.isFinite(now) && Number.isFinite(base) && base ? (now - base) / base * 100 : null);

/* ---------- kept on this computer ---------- */
const KEEP = tab => `laminar:markets:${tab}`;
export function kept(tab) {
  try { const v = JSON.parse(localStorage.getItem(KEEP(tab)) || 'null'); return v && Array.isArray(v.items) ? v : null; } catch { return null; }
}
function keep(tab, v) { try { localStorage.setItem(KEEP(tab), JSON.stringify(v)); } catch { /* storage full or off: shown, not kept */ } }

/* ---------- Forex & futures ---------- */
async function oandaDaily(cred, inst) {
  const rows = cd.parseCandles(await cd.call(`/v3/instruments/${inst}/candles?granularity=D&count=2&price=M`, cred));
  if (!rows.length) throw new Error(`no prices for ${inst}`);
  const last = rows[rows.length - 1], prev = rows.length > 1 ? rows[rows.length - 2] : null;
  return { price: last[4], base: prev ? prev[4] : last[1], at: last[0] };
}
export async function loadForex() {
  const cred = await cd.getKey();
  if (!cred) throw Object.assign(new Error('Add your OANDA key in Settings → Charts & prices to see these.'), { needsKey: true });
  const insts = [...new Set([...FOREX.filter(f => f.kind !== 'dxy').map(f => f.key), ...DXY_W.map(([k]) => k)])];
  const got = await pool(insts, 4, inst => oandaDaily(cred, inst));
  const by = new Map(insts.map((k, i) => [k, got[i]]));
  const failed = insts.filter(k => by.get(k)?.error);
  if (failed.length === insts.length) throw new Error(cd.explain(by.get(insts[0]).error));
  const items = FOREX.map(f => {
    if (f.kind === 'dxy') {
      const ok = DXY_W.every(([k]) => by.get(k) && !by.get(k).error);
      if (!ok) return null;
      const now = dxyOf(Object.fromEntries(DXY_W.map(([k]) => [k, by.get(k).price]))), base = dxyOf(Object.fromEntries(DXY_W.map(([k]) => [k, by.get(k).base])));
      return { ...f, price: now, change: pct(now, base), dp: 3 };
    }
    const r = by.get(f.key);
    if (!r || r.error) return null;
    return { ...f, price: r.price, change: pct(r.price, r.base), dp: cd.decimalsOf(f.key) };
  }).filter(Boolean);
  const v = { at: Date.now(), source: 'OANDA', items };
  keep('forex', v);
  return v;
}

/* ---------- Crypto ---------- */
export async function loadCrypto() {
  try {
    const list = await getJSON(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=60&page=1&sparkline=true&price_change_percentage=24h`);
    if (!Array.isArray(list)) throw new Error('CoinGecko did not answer with coins');
    const items = list.map(c => ({ key: c.id, label: String(c.symbol || '').toUpperCase(), name: c.name, image: c.image || '', price: +c.current_price,
      change: Number.isFinite(+c.price_change_percentage_24h) ? +c.price_change_percentage_24h : null, cap: +c.market_cap || 0,
      week: Array.isArray(c.sparkline_in_7d?.price) ? c.sparkline_in_7d.price.map(Number).filter(Number.isFinite) : [] }))
      .filter(c => c.label && Number.isFinite(c.price) && !notACoin(c)).slice(0, CRYPTO_COUNT);
    if (!items.length) throw new Error('CoinGecko gave no coins');
    const v = { at: Date.now(), source: 'CoinGecko', items };
    keep('crypto', v);
    return v;
  } catch (e) {
    /* CoinGecko busy or not answering: Binance's own markets, for the coins we had (or the usual ones) */
    const had = kept('crypto')?.items?.map(c => ({ label: c.label, name: c.name, image: c.image, key: c.key })) || FALLBACK_COINS.map(l => ({ label: l, name: COIN_NAMES[l] || l, key: l.toLowerCase() }));
    const all = await getJSON(`${BN}/ticker/24hr?type=MINI`).catch(() => { throw e; });
    const by = new Map((Array.isArray(all) ? all : []).map(t => [t.symbol, t]));
    const items = had.map(c => {
      const t = by.get(c.label + 'USDT');
      if (!t) return null;
      const price = +t.lastPrice, open = +t.openPrice;
      return { ...c, price, change: pct(price, open), binance: c.label + 'USDT' };
    }).filter(c => c && Number.isFinite(c.price));
    if (!items.length) throw e;
    const v = { at: Date.now(), source: 'Binance', items };
    keep('crypto', v);
    return v;
  }
}

/* ---------- Stocks ---------- */
/** Stooq's CSV, as rows of { header: value }, with its N/D left out. */
export function parseCsv(text) {
  const lines = String(text || '').trim().split(/\r?\n/);
  if (lines.length < 2 || /<html|<!doctype/i.test(lines[0])) return [];
  const head = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map(l => { const v = l.split(','); return Object.fromEntries(head.map((h, i) => [h, v[i]?.trim()])); });
}
const ymd = d => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const BASES = 'laminar:markets:stock-bases';
/* yesterday's close for each company, read once a day and kept: { day, close: { AAPL: 268.1, … } } */
async function stockBases(today) {
  let b = null;
  try { b = JSON.parse(localStorage.getItem(BASES) || 'null'); } catch { /* none */ }
  if (!b || b.day !== today) b = { day: today, close: {} };
  const need = STOCKS.filter(s => !(s.key in b.close));
  if (need.length) {
    const to = new Date(), from = new Date(Date.now() - 12 * 86400e3);
    await pool(need, 3, async s => {
      const rows = parseCsv(await getText(`${SQ}/q/d/l/?s=${s.stooq}&i=d&d1=${ymd(from)}&d2=${ymd(to)}`));
      /* the last full day before today's (Stooq's dates are the exchange's) */
      const done = rows.filter(r => r.date && r.date.replace(/-/g, '') < today && Number.isFinite(+r.close));
      if (done.length) b.close[s.key] = +done[done.length - 1].close;
    });
    try { localStorage.setItem(BASES, JSON.stringify(b)); } catch { /* not kept */ }
  }
  return b.close;
}
export async function loadStocks() {
  const fh = await fs.getSetting('finnhubKey').catch(() => null);
  if (fh) {
    /* Finnhub: each quote carries its own move (dp) against yesterday's close — one company a request, spaced under its 60 a minute */
    const got = await pool(STOCKS, 2, async s => {
      const q = await getJSON(`${FH}/quote?symbol=${encodeURIComponent(s.key)}&token=${encodeURIComponent(fh)}`);
      await new Promise(r => setTimeout(r, window.__finnhubGap ?? 1100));
      if (!q || !Number.isFinite(+q.c) || +q.c === 0) throw new Error('no quote');
      return { ...s, price: +q.c, change: Number.isFinite(+q.dp) ? +q.dp : pct(+q.c, +q.pc) };
    });
    const items = got.filter(x => x && !x.error);
    if (items.length) { const v = { at: Date.now(), source: 'Finnhub', items }; keep('stocks', v); return v; }
  }
  const rows = parseCsv(await getText(`${SQ}/q/l/?s=${STOCKS.map(s => s.stooq).join('+')}&f=sd2t2ohlcv&h&e=csv`));
  if (!rows.length) throw new Error('Stooq did not answer with prices. It sometimes turns requests away; a Finnhub key in Settings is the steadier way.');
  const bySym = new Map(rows.map(r => [String(r.symbol || '').toLowerCase(), r]));
  const day = rows.map(r => (r.date || '').replace(/-/g, '')).filter(Boolean).sort().pop() || ymd(new Date());
  const bases = await stockBases(day).catch(() => ({}));
  const items = STOCKS.map(s => {
    const r = bySym.get(s.stooq);
    const price = r ? +r.close : NaN, open = r ? +r.open : NaN;
    if (!Number.isFinite(price)) return null;
    const base = bases[s.key];
    return { ...s, price, change: Number.isFinite(base) ? pct(price, base) : pct(price, open), sinceOpen: !Number.isFinite(base) };
  }).filter(Boolean);
  if (!items.length) throw new Error('Stooq had no prices for these companies just now.');
  const v = { at: Date.now(), source: 'Stooq', items };
  keep('stocks', v);
  return v;
}

export const loaders = { forex: loadForex, stocks: loadStocks, crypto: loadCrypto };
/* how often a tab asks again while it is open */
export const EVERY = { forex: 60e3, stocks: 5 * 60e3, crypto: 3 * 60e3 };

/* ---------- the card's line: [unix seconds, price] ---------- */
export const RANGES = { forex: [['1D', 'M15', 96], ['1W', 'H1', 120], ['1M', 'H4', 180]], crypto: [['1D'], ['1W'], ['1M']], stocks: [['1M', 31], ['3M', 92], ['1Y', 366]] };
const lines = new Map();
export async function lineFor(tab, item, range) {
  const id = `${tab}:${item.key}:${range}`, hit = lines.get(id);
  if (hit && Date.now() - hit.at < 2 * 60e3) return hit.pts;
  const pts = await (tab === 'forex' ? forexLine(item, range) : tab === 'crypto' ? cryptoLine(item, range) : stockLine(item, range));
  lines.set(id, { at: Date.now(), pts });
  return pts;
}
async function forexLine(item, range) {
  const [, gran, count] = RANGES.forex.find(([r]) => r === range);
  const cred = await cd.getKey();
  if (!cred) throw new Error('No OANDA key');
  const get = async inst => cd.parseCandles(await cd.call(`/v3/instruments/${inst}/candles?granularity=${gran}&count=${count}&price=M`, cred));
  if (item.kind !== 'dxy') return (await get(item.key)).map(r => [r[0], r[4]]);
  /* DXY: its six pairs, candle by candle where all six have one */
  const sets = await pool(DXY_W.map(([k]) => k), 3, get);
  const maps = sets.map(rows => new Map((rows || []).map(r => [r[0], r[4]])));
  return (sets[0] || []).map(r => r[0]).filter(t => maps.every(m => m.has(t)))
    .map(t => [t, dxyOf(Object.fromEntries(DXY_W.map(([k], i) => [k, maps[i].get(t)])))]);
}
async function cryptoLine(item, range) {
  if (item.binance || !item.week?.length || range === '1M') {
    if (!item.binance && item.key) {
      try {
        const j = await getJSON(`${CG}/coins/${encodeURIComponent(item.key)}/market_chart?vs_currency=usd&days=${range === '1D' ? 1 : range === '1W' ? 7 : 30}`);
        if (Array.isArray(j?.prices) && j.prices.length) return j.prices.map(([ms, p]) => [Math.floor(ms / 1000), +p]);
      } catch { /* Binance next */ }
    }
    const [iv, n] = range === '1D' ? ['15m', 96] : range === '1W' ? ['1h', 168] : ['4h', 180];
    const k = await getJSON(`${BN}/klines?symbol=${item.binance || item.label + 'USDT'}&interval=${iv}&limit=${n}`);
    return (Array.isArray(k) ? k : []).map(r => [Math.floor(r[0] / 1000), +r[4]]);
  }
  /* the week of hourly prices came with the list: the last day of it, or all of it */
  const w = item.week, end = Math.floor(Date.now() / 1000), step = 7 * 86400 / Math.max(1, w.length - 1);
  const pts = w.map((p, i) => [Math.round(end - (w.length - 1 - i) * step), p]);
  return range === '1D' ? pts.slice(-25) : pts;
}
async function stockLine(item, range) {
  const days = RANGES.stocks.find(([r]) => r === range)[1];
  const to = new Date(), from = new Date(Date.now() - days * 86400e3);
  const rows = parseCsv(await getText(`${SQ}/q/d/l/?s=${item.stooq}&i=d&d1=${ymd(from)}&d2=${ymd(to)}`));
  return rows.filter(r => r.date && Number.isFinite(+r.close)).map(r => [Date.parse(r.date + 'T21:00:00Z') / 1000, +r.close]);
}
