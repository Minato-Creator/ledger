/* ============================================================
   acctlogo.js — a firm's mark, and the row for changing it.

   logoTile    the logo he chose for the firm, else the one that came with
               it (media/firms), else its initials on its tint.
   logoRow     the strip in the account sheets that shows it, with Change /
               Add logo (any image; logo.js squares and centres it) and a
               way back to the one it came with.

   acctMark    the logo (or the colour dot, for an account at no firm) beside
               an account's name in the top bar, its menu and the forms.

   The account cards (acctboard.js), the Add account steps (acctnew.js) and
   the top bar (shell.js) use these.
   ============================================================ */
import { el, toast } from '../ui.js';
import { firmKey, firmOf } from '../acctfirms.js';
import { squareLogo } from '../logo.js';

export function logoTile(store, a, size = 46, cls = '') {
  const f = firmOf(a), key = firmKey(a);
  const tile = el('span', { class: 'ab-logo ' + cls, style: { width: size + 'px', height: size + 'px', '--tint': f.tint, fontSize: Math.round(size * 0.34) + 'px' } },
    el('span', { class: 'ab-mono' }, f.mono));
  const put = url => { if (!url) return; tile.replaceChildren(el('img', { src: url, alt: '' })); tile.classList.add('has-img'); };
  const now = key ? store.firmLogoUrlNow(key) : null;
  if (now) put(now);
  else if (key && store.firmLogos[key]) store.firmLogoUrl(key).then(url => put(url || f.logo));
  else if (f.logo) put(f.logo);
  return tile;
}

/** An account's mark where a dot of its colour used to be (the top bar, the
    account menu, "Saving to"): its firm's or broker's logo — or the dot, for
    an account at neither. */
export function acctMark(store, a, size = 18) {
  if (firmKey(a)) return logoTile(store, a, size, 'is-mini acct-logo');
  return el('span', { class: 'acct-dot', style: { background: a.color } });
}

/** @param a  an account, or what one will be ({ firm, firmName, name, color }) */
export function logoRow(store, nav, a, repaint) {
  const key = firmKey(a);
  if (!key) return el('div', { hidden: true });
  const f = firmOf(a);
  const has = !!store.firmLogos[key];               // one he put in himself
  const came = !!f.logo;                            // the one that came with the firm
  const file = el('input', { type: 'file', accept: 'image/*', hidden: true, onChange: async e => {
    const fl = e.target.files[0]; e.target.value = '';
    if (!fl) return;
    if (!/^image\//.test(fl.type)) return toast(`${fl.name} is not a picture`, 'warn');
    try {
      const blob = await squareLogo(fl);
      await store.setFirmLogo(key, blob);
      toast(`${f.name}'s logo is in`);
      repaint(); nav.refresh();
    } catch (err) { toast(err.message || 'That picture could not be used', 'bad'); }
  } });
  return el('div', { class: 'ab-logorow' },
    logoTile(store, a, 44),
    el('div', { class: 'ab-logot' }, el('b', {}, `${f.name} logo`),
      el('span', {}, has ? 'Squared and centred from your image — every account there wears it.'
        : came ? 'Your logo for them. Change it for another image any time.'
        : 'Add their logo — any image of it; Laminar squares it and centres it.')),
    el('button', { class: 'btn btn-quiet', 'data-logo': key, onClick: () => file.click() }, has || came ? 'Change' : 'Add logo'),
    has ? el('button', { class: 'btn btn-quiet', onClick: async () => { await store.removeFirmLogo(key); repaint(); nav.refresh(); } }, came ? 'Use the first one' : 'Remove') : null,
    file);
}
