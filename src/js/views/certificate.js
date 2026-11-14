/* ============================================================
   certificate.js — a month's profit, as a certificate to keep or share.

   Opened from the year on the Calendar: click a month that ended in profit
   and its certificate rises in the middle of the window, filled in from
   that month's own trades. Save it as a picture, or copy it to paste
   somewhere.

   The page itself is drawn by share/cert.js; this is the sheet around it.
   ============================================================ */
import { el, icon, toast } from '../ui.js';
import * as c from '../calc.js';
import { sheet } from '../sheet.js';
import { drawCert, certAssets, CERT_W, CERT_H } from '../share/cert.js';
import { saveOut } from './share.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** A certificate is for a month that made money. */
export const canCertify = row => !!row && row.count > 0 && row.net > 0;

/** What the page says, from one month's row of the year (analytics.js monthRows) —
    or from the whole year, a row of the same shape marked `whole`. */
export function certModel(store, acct, year, row) {
  const decided = row.wins + row.losses;
  return {
    month: row.whole ? String(year) : `${MONTHS[row.m]} ${year}`,
    kind: row.whole ? 'Yearly profit' : 'Monthly profit',
    amount: c.money(row.net, { currency: acct?.currency, sign: false, decimals: 2 }),
    name: store.userName,
    ret: c.pctSigned(c.asPercent(acct, row.net)),
    r: row.r == null ? '—' : c.rFmt(row.r, 1),
    rate: decided ? Math.round(row.wins / decided * 100) + '%' : '—',
    font: getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif',
  };
}

export function openCertificate(store, acct, year, row) {
  if (!canCertify(row)) { toast(`A certificate is for a ${row?.whole ? 'year' : 'month'} that ended in profit`); return null; }
  const m = certModel(store, acct, year, row);
  const canvas = el('canvas', { class: 'cert-canvas', width: CERT_W * 2, height: CERT_H * 2 });
  const paint = () => drawCert(canvas.getContext('2d'), canvas.width, canvas.height, m);
  const body = el('div', { class: 'sh cert' });
  const api = sheet({ cls: 'is-cert', body, label: `${m.month} certificate` });

  let busy = false;
  const picture = async () => {
    const cv = el('canvas', { width: CERT_W * 3, height: CERT_H * 3 });
    drawCert(cv.getContext('2d'), cv.width, cv.height, m);
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    if (!blob) throw new Error('The picture could not be made');
    return blob;
  };
  const run = async (fn) => {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (e) { toast(e?.message || 'That did not work', 'warn'); } finally { busy = false; }
  };
  const save = () => run(async () => {
    await saveOut(await picture(), row.whole ? `Laminar-${year}.png` : `Laminar-${MONTHS[row.m]}-${year}.png`, 'Picture', 'png');
  });
  const copy = () => run(async () => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('This window cannot copy pictures — save it instead');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': await picture() })]);
    toast('Copied');
  });

  body.append(
    el('div', { class: 'sh-head' },
      el('h2', {}, row.whole ? 'Yearly certificate' : 'Monthly certificate'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'sheet-x', 'aria-label': 'Close', onClick: () => api.close() }, icon('close', 14, 'currentColor', 2))),
    el('div', { class: 'cert-stage' }, canvas),
    el('div', { class: 'sh-foot cert-foot' },
      el('button', { class: 'sh-out is-main', 'data-out': 'save', onClick: save }, icon('download', 15, 'currentColor', 2), 'Save picture'),
      el('button', { class: 'sh-out', 'data-out': 'copy', onClick: copy }, icon('copy', 15, 'currentColor', 2), 'Copy')));

  /* drawn at once, then again when the wordmark and the fonts are in */
  paint();
  certAssets().then(img => { m.wordmark = img; if (api.panel.isConnected) paint(); });
  document.fonts?.ready?.then(() => { if (api.panel.isConnected) paint(); });
  api.__cert = { model: m, canvas };
  body.__cert = api.__cert;
  return api;
}
