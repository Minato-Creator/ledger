/* ============================================================
   oandabtn.js — the Sync button at the top of the Journal.

   OANDA's mark, "Sync", and how long ago it last did. It shows once there
   is an OANDA key (Settings → Charts & prices), whichever account you are
   reading: the trades always go into the OANDA account (oandasync.js), so
   from another account it says where they went. While it works the mark
   gives way to a turning ring; then the page is drawn again with whatever
   arrived.
   ============================================================ */
import { el, icon, toast } from '../ui.js';
import * as cd from '../candles.js';
import { syncOanda } from '../oandasync.js';
import { ago } from '../wire.js';
import { logoTile } from './acctlogo.js';

let busy = false;
let hasKey = null;          // known after the first look, so the header never shifts as it appears

export function oandaSyncButton(store, nav) {
  const link = store.data.accounts?.oanda || null;
  const mark = logoTile(store, { firm: 'oanda', name: 'OANDA' }, 20, 'is-mini jr-sync-logo');
  const when = el('small', { class: 'jr-sync-when' }, busy ? 'syncing…' : link?.syncedAt ? ago(link.syncedAt) : 'not yet');
  const btn = el('button', { class: 'jr-sync' + (busy ? ' is-busy' : ''), hidden: hasKey !== true, title: 'Bring in your OANDA trades',
      onClick: () => run() },
    el('span', { class: 'jr-sync-m' }, mark, el('span', { class: 'jr-sync-spin', 'aria-hidden': 'true' }, icon('refresh', 13, 'currentColor', 2))),
    el('span', { class: 'jr-sync-t' }, 'Sync'), when);
  /* only with a key to sync with */
  cd.getKey().then(k => { hasKey = !!k; btn.hidden = !k; }).catch(() => {});

  async function run() {
    if (busy) return;
    busy = true; btn.classList.add('is-busy'); when.textContent = 'syncing…';
    try {
      const r = await syncOanda(store);
      const here = store.activeAccount?.id === r.account.id;
      toast(!r.added && !r.updated ? 'Up to date — nothing new on OANDA'
        : `${r.added ? `${r.added} new` : ''}${r.added && r.updated ? ', ' : ''}${r.updated ? `${r.updated} brought up to date` : ''}${here ? '' : ` in ${r.account.name} — open it from the account switcher at the top`}`);
    } catch (e) {
      toast(/401|403|unauthori|insufficient/i.test(String(e?.message)) ? cd.explain(e) : (e?.message || 'Could not reach OANDA'), 'bad');
    } finally {
      busy = false;
      nav.refresh();
    }
  }
  return btn;
}
