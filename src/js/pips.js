/* ============================================================
   pips.js — what a pip is, and what a fair spread and stop buffer are,
   for every market Quant can trade. The engines count spread and the
   buffer past a sweep in pips; this turns them into price.
   ============================================================ */

/* pip size in price */
const PIP = {
  XAU_USD: 0.1, XAG_USD: 0.01,
  NAS100_USD: 1, SPX500_USD: 0.1, US30_USD: 1, DE30_EUR: 1, UK100_GBP: 1, JP225_USD: 1, AU200_AUD: 1,
  WTICO_USD: 0.01, BCO_USD: 0.01, BTC_USD: 1, ETH_USD: 0.1,
};
/* a typical OANDA spread, in pips — what every entry pays */
const SPREAD = {
  XAU_USD: 3, XAG_USD: 2.5, EUR_USD: 1.2, GBP_USD: 1.8, AUD_USD: 1.4, NZD_USD: 2, USD_JPY: 1.4, USD_CAD: 2, USD_CHF: 1.8,
  EUR_JPY: 2, GBP_JPY: 3, AUD_JPY: 2, EUR_GBP: 1.5, NAS100_USD: 1.5, SPX500_USD: 5, US30_USD: 3, DE30_EUR: 2, UK100_GBP: 2,
  JP225_USD: 10, AU200_AUD: 2, WTICO_USD: 3, BCO_USD: 3, BTC_USD: 50, ETH_USD: 30,
};
/* how far past the sweep the stop goes, in pips */
const BUF = { XAU_USD: 2 };

export function pipOf(inst) {
  if (PIP[inst] != null) return PIP[inst];
  const [, q] = String(inst || '').split('_');
  return q === 'JPY' ? 0.01 : 0.0001;
}
export const spreadOf = inst => SPREAD[inst] ?? 1.5;
export const bufOf = inst => BUF[inst] ?? 1;
/** XAU_USD → XAUUSD */
export const nameOf = inst => String(inst || '').replace('_', '');
