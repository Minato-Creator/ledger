/* ============================================================
   acctfirms.js — the firms and brokers an account can be at.

   The prop firms he trades with (futures and forex) and the brokers his
   live accounts are at, each with a short name for the chip on a card
   ("Apex 50K #2"), the sizes it sells, and a tint for the glow on its card.

   The marks are not drawn here. The logos are images he made and sent
   (src/media/firms/*.png, squared and centred by logo.js); he can
   put his own in place of any of them, or add one for a firm that has none,
   in the account sheet (store.setFirmLogo), and every account at that firm
   wears it. A firm with neither shows its initials on its tint. Anything not
   listed is "Other", named by hand.
   ============================================================ */

export const ACCOUNT_KINDS = [
  ['eval', 'Evaluation', 'EVAL'],
  ['funded', 'Funded', 'FUNDED'],
  ['live', 'Live', 'LIVE'],
];

/* the colours an account can wear, and the currencies it can be in */
export const ACCOUNT_COLOURS = ['#0988F0', '#18AC65', '#FFB800', '#F4624A', '#7C5CFF', '#9A9A9A'];
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'JPY'];
/* sizes to offer for a prop firm that is not listed */
export const COMMON_SIZES = [5000, 10000, 25000, 50000, 100000, 150000, 200000];

export const ACCOUNT_FIRMS = [
  /* futures prop firms */
  { id: 'apex', logo: 'media/firms/apex.png',        name: 'Apex',            full: 'Apex Trader Funding', group: 'futures', mono: 'AP', tint: '#2C4BD8', sizes: [25000, 50000, 100000, 150000, 250000, 300000] },
  { id: 'topstep', logo: 'media/firms/topstep.png',     name: 'Topstep',         full: 'Topstep',             group: 'futures', mono: 'TS', tint: '#6B7280', sizes: [50000, 100000, 150000] },
  { id: 'lucid', logo: 'media/firms/lucid.png',       name: 'Lucid',           full: 'Lucid Trading',       group: 'futures', mono: 'LT', tint: '#3B82F6', sizes: [25000, 50000, 100000, 150000] },
  { id: 'tradeify', logo: 'media/firms/tradeify.png',    name: 'Tradeify',        full: 'Tradeify',            group: 'futures', mono: 'TF', tint: '#7C5CFF', sizes: [25000, 50000, 100000, 150000] },
  { id: 'mffu', logo: 'media/firms/mffu.png',        name: 'MyFundedFutures', full: 'MyFundedFutures',     group: 'futures', mono: 'MF', tint: '#14A06B', sizes: [25000, 50000, 100000, 150000], short: 'MFFU' },
  /* forex prop firms */
  { id: 'ftmo', logo: 'media/firms/ftmo.png',        name: 'FTMO',            full: 'FTMO',                group: 'forex',   mono: 'FT', tint: '#2F6FED', sizes: [10000, 25000, 50000, 100000, 200000] },
  { id: 'the5ers', logo: 'media/firms/the5ers.png',     name: 'The5ers',         full: 'The5ers',             group: 'forex',   mono: '5%', tint: '#F59E0B', sizes: [5000, 20000, 60000, 100000] , short: '5ers' },
  { id: 'fundingpips', logo: 'media/firms/fundingpips.png', name: 'FundingPips',     full: 'FundingPips',         group: 'forex',   mono: 'FP', tint: '#0EA5E9', sizes: [5000, 10000, 25000, 50000, 100000] },
  { id: 'alphacapital', logo: 'media/firms/alphacapital.png',name: 'Alpha Capital',   full: 'Alpha Capital Group', group: 'forex',   mono: 'AC', tint: '#16A34A', sizes: [5000, 10000, 25000, 50000, 100000, 200000], short: 'Alpha' },
  /* brokers, for live accounts */
  { id: 'oanda', logo: 'media/firms/oanda.png',       name: 'OANDA',           full: 'OANDA',               group: 'broker',  mono: 'OA', tint: '#9CA3AF', trades: 'Forex and CFDs' },
  { id: 'pepperstone', logo: 'media/firms/pepperstone.png', name: 'Pepperstone',     full: 'Pepperstone',         group: 'broker',  mono: 'PS', tint: '#2563EB', trades: 'Forex and CFDs' },
  { id: 'tradovate', logo: 'media/firms/tradovate.png', name: 'Tradovate', full: 'Tradovate', group: 'broker', mono: 'TV', tint: '#12305C', trades: 'Futures' },
  { id: 'fusion', logo: 'media/firms/fusion.png',      name: 'Fusion Markets',  full: 'Fusion Markets',      group: 'broker',  mono: 'FM', tint: '#E11D48', short: 'Fusion', trades: 'Forex and CFDs' },
];

export const FIRM_GROUPS = [['futures', 'Futures prop firms'], ['forex', 'CFD prop firms'], ['broker', 'Brokers']];

/* What a prop account trades — the first thing the Add account steps ask,
   because the firms (and their rules) are different. */
export const MARKETS = [
  { id: 'futures', name: 'Futures', blurb: 'NQ, ES, CL and other CME contracts.' },
  { id: 'forex',   name: 'CFD',     blurb: 'Forex, indices and gold.' },
];
export const firmsIn = group => ACCOUNT_FIRMS.filter(f => f.group === group);

export const findFirm = id => ACCOUNT_FIRMS.find(f => f.id === id) || null;

/* An account from before firms were picked is read from its name — "Apex 50K",
   "Topstep 50K Combine", "OANDA" — so it still wears its firm's logo. Only
   whole words count (or a long name run together: "fundingpips10k"), and
   "Alpha" alone is not enough (Alpha Capital is not Alpha Futures). */
const words = s => ' ' + String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
let NAMES = null;
export function guessFirm(name) {
  NAMES ||= ACCOUNT_FIRMS.map(f => [f.id, [...new Set([f.name, f.full, f.short, f.id].filter(Boolean)
    .map(x => words(x).trim()).filter(x => x.length >= 4 && x !== 'alpha'))]]);
  const w = words(name), flat = w.replace(/ /g, '');
  for (const [id, keys] of NAMES) for (const k of keys) {
    if (w.includes(' ' + k + ' ')) return id;
    const kf = k.replace(/ /g, '');
    if ((k.includes(' ') || kf.length >= 7) && flat.includes(kf)) return id;
  }
  return null;
}

/** The listed firm an account is at: the one picked, else the one its name says. */
export const firmIdOf = a => (a?.firm && a.firm !== 'other' ? (findFirm(a.firm) ? a.firm : null) : !a?.firm && !a?.firmName ? guessFirm(a?.name) : null);

/** The key a firm's logo is kept under: its id, or 'other:<name>' for one named by hand. */
export const firmKey = a => firmIdOf(a) || (a?.firmName ? 'other:' + String(a.firmName).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null);

/** What an account is at, for its card: { name, short, mono, tint } — even with no firm. */
export function firmOf(a) {
  const f = findFirm(firmIdOf(a));
  if (f) return { name: f.name, short: f.short || f.name, mono: f.mono, tint: f.tint, group: f.group, logo: f.logo || null };
  const n = String(a?.firmName || '').trim();
  if (n) return { name: n, short: n, mono: monoOf(n), tint: '#8B8F98', group: 'other' };
  return { name: a?.name || 'Account', short: a?.name || 'Account', mono: monoOf(a?.name || 'A'), tint: a?.color || '#8B8F98', group: 'other' };
}
const monoOf = s => String(s).split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

/** Which kind an account is. Accounts from before kinds existed are read from their name. */
export function kindOf(a) {
  if (a && ['eval', 'funded', 'live'].includes(a.kind)) return a.kind;
  const n = String(a?.name || '').toLowerCase();
  if (/\b(eval|evaluation|challenge|combine|phase|step ?[12]|verification)\b/.test(n)) return 'eval';
  if (/\b(funded|pa|express|master)\b/.test(n)) return 'funded';
  return 'live';
}

/** "50K", "100K", "1.5M", or the full figure when it is not round. */
export function sizeShort(n) {
  n = Number(n) || 0;
  if (n >= 1e6 && n % 1e5 === 0) return `${n / 1e6}M`;
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}K`;
  return n.toLocaleString('en-US');
}

/** A name for a new account: "Apex 50K", "Apex 50K #2" when that is taken. */
export function suggestName(firm, size, taken = []) {
  const base = `${firm.short || firm.name}${size ? ' ' + sizeShort(size) : ''}`.trim();
  const has = new Set(taken.map(x => x.toLowerCase()));
  if (!has.has(base.toLowerCase())) return base;
  for (let i = 2; i < 200; i++) if (!has.has(`${base} #${i}`.toLowerCase())) return `${base} #${i}`;
  return base;
}
