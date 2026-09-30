/* ============================================================
   Archive, or delete

   Two ways to be done with an account, and they are not the same thing.

   Archive puts it away: it leaves the switcher and the totals, and it and
   every trade in it stay in the journal, ready to come back with one click.
   That is the right answer almost every time — a blown challenge is still a
   record of how you traded.

   Delete is for good: the account, every trade in it, open or closed, live
   or tested, and their charts. So it asks first, and the question says how
   many trades go with it. Nothing is left pointing at an account that no
   longer exists.

   Shared by Settings and the accounts page, so the two never disagree about
   what either button does.
   ============================================================ */
import { el, toast, confirmButton } from '../ui.js';

export function accountActions(store, nav, a) {
  const n = store.everyTradeFor(a.id).length;
  const trades = k => `${k} trade${k === 1 ? '' : 's'}`;
  const after = () => { if (!store.accounts.length) nav.go('#/accounts'); else nav.refresh(); };

  return el('div', { class: 'acct-actions' },
    el('button', { type: 'button', class: 'acct-act',
      title: a.archived ? 'Bring it back into the switcher' : 'Put it away — it and its trades stay in the journal',
      onClick: async e => {
        e.stopPropagation();
        const was = a.archived;
        await store.updateAccount(a.id, { archived: !was });
        toast(was ? `Restored ${a.name}` : `Archived ${a.name}`);
        after();
      } }, a.archived ? 'Restore' : 'Archive'),
    confirmButton({
      label: 'Delete',
      armedLabel: n ? `Delete + ${trades(n)}` : 'Confirm delete',
      title: 'Delete this account and every trade in it, for good',
      armedTitle: 'Click again to delete for good — Archive keeps it instead',
      className: 'acct-act is-delete', armedClassName: 'acct-act is-delete is-armed', armedStyle: {},
      onConfirm: async () => {
        const gone = await store.deleteAccount(a.id);
        toast(`Deleted ${a.name}${gone ? ` and ${trades(gone)}` : ''}`);
        after();
      } }));
}
