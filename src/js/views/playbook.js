import { el, icon, toast, confirmButton, sortable } from '../ui.js';
import * as c from '../calc.js';
import { DEFAULT_SESSIONS } from '../store.js';

const SWATCHES = ['#0988F0', '#18AC65', '#FFB800', '#F4624A', '#9A9A9A', '#E9E9E9'];

export function playbook(store, nav) {
  const pb = store.playbook;
  const acct = store.activeAccount;

  const save = async () => { await store.save('playbook'); nav.refresh(); };

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Playbook'),
    el('span', { class: 'sub' }, 'Shared across every account'),
  );

  /* ---------- setups ---------- */
  const usage = (setupId) => store.trades.filter(t => t.setupId === setupId).length;

  const setupRow = (s) => {
    const used = usage(s.id);
    const stats = c.summarise(acct, store.tradesFor(acct.id).filter(t => t.setupId === s.id));

    const name = el('input', {
      class: 'm', value: s.name,
      style: { fontSize: '14px', color: 'var(--ink)', background: 'transparent', width: '100%' },
      onChange: async e => {
        const v = e.target.value.trim();
        if (!v) { e.target.value = s.name; return; }
        s.name = v; await save();          // renaming keeps every trade filed under it
      },
    });

    const swatches = el('div', { style: { display: 'flex', gap: '5px', flex: 'none' } },
      ...SWATCHES.map(col => el('button', {
        title: 'Recolour',
        style: { width: '16px', height: '16px', borderRadius: '5px', background: col,
                 boxShadow: s.color === col ? '0 0 0 2px var(--grey-9), 0 0 0 3px #fff' : 'none' },
        onClick: async () => { s.color = col; await save(); } })));

    return el('div', { style: { background: 'var(--grey-9)', borderRadius: '24px', padding: '13px 16px',
                                display: 'flex', flexDirection: 'column', gap: '9px' } },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
        el('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: s.color, flex: 'none' } }),
        el('div', { style: { minWidth: 0, flex: '1' } }, name),
        used && stats.count
          ? el('span', { class: 'm', style: { fontSize: '12.5px', flex: 'none',
              color: stats.net > 0 ? 'var(--green)' : stats.net < 0 ? 'var(--orange)' : 'var(--grey-2)' } },
              c.money(stats.net, { currency: acct.currency, decimals: 0 }))
          : null),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
        el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)', flex: '1', minWidth: 0,
                                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
          !used ? 'not used yet'
                : used === stats.count ? `${used} trade${used === 1 ? '' : 's'}`
                : `${used} trade${used === 1 ? '' : 's'} · ${stats.count} here`),
        swatches,
        el('button', { title: used ? `Used by ${used} trade${used === 1 ? '' : 's'}` : 'Delete',
          style: { width: '26px', height: '26px', borderRadius: '9px', background: 'var(--grey-7)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' },
          onClick: () => confirmDelete(s, used) }, icon('trash', 12, 'var(--grey-5)', 1.8))),
    );
  };

  const setupList = el('div', { style: { marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '7px', overflowY: 'auto' } });
  const paintSetups = () => setupList.replaceChildren(
    ...pb.setups.map(setupRow),
    el('button', { style: { border: '1px dashed var(--grey-6)', borderRadius: '24px', padding: '15px 18px',
                            display: 'flex', alignItems: 'center', gap: '11px', width: '100%' },
      onClick: addSetup }, icon('plus', 16, 'var(--grey-5)', 2),
      el('span', { class: 'm', style: { fontSize: '12.5px', color: 'var(--grey-5)' } }, 'New setup')),

  );

  async function addSetup() {
    const name = await inlineInput(setupList, 'Name this setup');
    if (!name) { paintSetups(); return; }
    pb.setups.push({ id: 's_' + crypto.randomUUID().slice(0, 6), name, color: SWATCHES[pb.setups.length % SWATCHES.length], rules: [] });
    await save();
  }

  /* Deleting something your history points at is the one destructive act here,
     so it asks, and it says exactly what it will do to those trades. */
  function confirmDelete(s, used) {
    const box = el('div', { style: { background: 'var(--grey-7)', borderRadius: '24px', padding: '15px 18px',
                                     boxShadow: 'inset 0 0 0 1px var(--orange)' } },
      el('div', { style: { fontSize: '12.5px', lineHeight: 1.55, color: 'var(--ink-2)' } },
        used ? [`Delete “${s.name}”? `, el('span', { class: 'm', style: { color: 'var(--ink)' } }, `${used} trade${used === 1 ? '' : 's'}`),
                ' use it — they will be kept and left with no setup.']
             : [`Delete “${s.name}”?`]),
      el('div', { style: { marginTop: '12px', display: 'flex', gap: '7px' } },
        el('button', { class: 'btn btn-quiet', onClick: () => paintSetups() }, 'Cancel'),
        el('button', { class: 'btn', style: { background: 'var(--orange)', color: '#202020' },
          onClick: async () => {
            for (const t of store.trades) if (t.setupId === s.id) t.setupId = null;
            pb.setups = pb.setups.filter(x => x.id !== s.id);
            await store.save('trades');
            await save();
            toast(`Deleted ${s.name}`);
          } }, 'Delete')));
    setupList.replaceChildren(box);
  }
  paintSetups();

  const setupsCard = el('section', { class: 'card', style: { flex: '1', minWidth: 0, padding: '24px 26px', maxHeight: '100%' } },
    el('h2', {}, 'Setups'),
    setupList,
  );

  /* ---------- tags ----------
     Your groups in your order, and the tags in your order inside them.
     Neither is alphabetical and neither is by how often you use them: the
     order is the shape of how you read a chart — what you look at first,
     then next — and nothing in the data knows that. So it is set by hand,
     and nothing here ever rearranges it behind you.  */
  const tagsCard = el('section', { class: 'card', style: { flex: '1', minWidth: 0, padding: '24px 26px' } });

  /* An order comes back off the page as a list of ids, and the real list is
     rebuilt from it. Anything the page did not name keeps its place at the
     end: rearranging is never allowed to drop something. */
  const reorderBy = (list, ids) => {
    const by = new Map(list.map(x => [x.id, x]));
    const out = [];
    for (const id of ids) if (by.has(id)) { out.push(by.get(id)); by.delete(id); }
    for (const x of list) if (by.has(x.id)) out.push(x);
    return out;
  };

  /* A reorder writes the playbook and repaints this card only. The full
     refresh every other edit does would be correct and would also take the
     keyboard off the handle you are holding — which turns moving a group
     four places into four separate hunts for its grip. */
  const saveOrder = async (focusId) => {
    await store.save('playbook');
    paintTags();
    if (!focusId) return;
    const id = window.CSS && CSS.escape ? CSS.escape(focusId) : focusId;
    const moved = tagsCard.querySelector(`[data-sortid="${id}"]`);
    (moved?.querySelector('.grip') || moved)?.focus?.();
  };

  function paintTags() {
    /* No overflow of its own: a box that scrolls in one direction clips the
       other as well, and the grips live in the margin beside the list. The
       card grows and the page scrolls instead, which is what you want with
       fifteen groups anyway. */
    const groupList = el('div', { style: { marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '15px' } },
      ...pb.tagGroups.map(groupNode));
    sortable(groupList, { onDrop: async (ids, moved) => {
      pb.tagGroups = reorderBy(pb.tagGroups, ids);
      await saveOrder(moved);
    } });

    tagsCard.replaceChildren(
      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } },
        el('h2', {}, 'Tags'),
        el('span', { class: 'note' }, pb.tagGroups.length > 1 ? 'drag to reorder' : '')),
      groupList,
      el('button', { class: 'tag-add', style: { marginTop: '15px', alignSelf: 'flex-start', borderRadius: 'var(--r-btn)', padding: '7px 14px' },
        onClick: async () => {
          const name = await inlineInput(tagsCard, 'Name this group');
          if (!name) return paintTags();
          pb.tagGroups.push({ id: 'g_' + crypto.randomUUID().slice(0, 6), name, tags: [] });
          await save();
        } }, '+ new group'),
    );
  }

  /* One group: its handle, its name, and its tags. */
  function groupNode(g) {
    const tagWrap = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '5px' } },
      ...g.tags.map(t => tagChip(g, t)),
      el('button', { class: 'tag-add', onClick: () => addTag(g) }, '+'));
    sortable(tagWrap, { onDrop: async (ids, moved) => {
      g.tags = reorderBy(g.tags, ids);
      await saveOrder(moved);
    } });

    return el('div', { class: 'sort-item', dataset: { sortid: g.id } },
      el('div', { class: 'sort-head', style: { position: 'relative', display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '9px' } },
        el('button', { class: 'grip', type: 'button', dataset: { grip: '1' },
          title: 'Drag this group where you want it — or hold it and use the arrow keys',
          'aria-label': `Move the ${g.name} group` }, icon('grip', 13, 'var(--ink-4)', 2.6)),
        el('input', { class: 'eyebrow', value: g.name,
          style: { background: 'transparent', width: '140px' },
          onChange: async e => { g.name = e.target.value.trim() || g.name; await save(); } }),
        confirmButton({
          label: 'remove group', armedLabel: 'confirm remove',
          className: 'm', style: { marginLeft: 'auto', fontSize: '10.5px', color: 'var(--grey-5)' },
          armedStyle: { marginLeft: 'auto', fontSize: '10.5px', color: 'var(--orange)' },
          onArm: () => { if (g.tags.length) toast('Empty the group first', 'warn'); },
          onConfirm: async () => {
            if (g.tags.length) return toast('Empty the group first', 'warn');
            pb.tagGroups = pb.tagGroups.filter(x => x.id !== g.id); await save();
          } })),
      tagWrap);
  }

  /* A tag is its own handle — it is too small to carry one — so it takes the
     drag itself and its × is left out of it. */
  function tagChip(g, t) {
    return el('span', { class: 'tag sort-tag', tabindex: '0',
      dataset: { sortid: t.id, grip: '1' },
      title: 'Drag to reorder — or use the arrow keys',
      style: { display: 'inline-flex', alignItems: 'center', gap: '7px' } },
      t.name,
      /* Deleting a tag takes it off every trade that carried it, so
         the × arms into a word and says how many that is. */
      confirmButton({
        label: '×', title: 'Remove',
        armedLabel: (() => { const n = store.trades.filter(x => (x.tagIds || []).includes(t.id)).length;
          return n ? `delete · ${n} trade${n === 1 ? '' : 's'}` : 'delete?'; })(),
        style: { color: 'var(--grey-5)', fontSize: '13px', lineHeight: 1 },
        armedStyle: { color: 'var(--orange)', fontSize: '10.5px', lineHeight: 1 },
        onConfirm: async () => {
          const used = store.trades.filter(x => (x.tagIds || []).includes(t.id)).length;
          for (const x of store.trades) if ((x.tagIds || []).includes(t.id)) x.tagIds = x.tagIds.filter(i => i !== t.id);
          g.tags = g.tags.filter(x => x.id !== t.id);
          if (used) await store.save('trades');
          await save();
        } }));
  }

  async function addTag(g) {
    const name = await inlineInput(tagsCard, 'Name this tag');
    if (!name) return paintTags();
    g.tags.push({ id: 'tg_' + crypto.randomUUID().slice(0, 6), name });
    await save();
  }
  paintTags();

  /* ---------- risk rules ---------- */
  const stepper = (value, onChange, fmt = v => String(v), stepBy = 1, min = 0) =>
    el('div', { class: 'stepper', style: { marginLeft: 'auto' } },
      el('button', { onClick: () => onChange(Math.max(min, +(value - stepBy).toFixed(2))) }, icon('minus', 11, 'var(--grey-2)', 2.6)),
      el('span', { class: 'val' }, fmt(value)),
      el('button', { onClick: () => onChange(+(value + stepBy).toFixed(2)) }, icon('plus', 11, 'var(--grey-2)', 2.6)));

  const ruleRow = (label, node) => el('div', { style: { display: 'flex', alignItems: 'center' } },
    el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-5)' } }, label), node);

  const rulesCard = el('section', { class: 'card', style: { flex: 'none', padding: '24px 26px' } },
    el('h2', {}, 'Risk rules'),
    el('div', { style: { marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '13px' } },
      ruleRow('Default risk per trade', stepper(Number(acct.defaultRiskPercent) || 0,
        async v => { await store.updateAccount(acct.id, { defaultRiskPercent: v }); nav.refresh(); },
        v => v.toFixed(2) + '%', 0.05)),
      ruleRow('Max trades per day', stepper(Number(pb.rules.maxTradesPerDay) || 0,
        async v => { pb.rules.maxTradesPerDay = Math.round(v); await save(); }, v => String(Math.round(v)), 1, 1)),
      ruleRow('Daily loss cap', stepper(Number(pb.rules.dailyLossCapPercent) || 0,
        async v => { pb.rules.dailyLossCapPercent = v; await save(); }, v => v.toFixed(2) + '%', 0.25)),
      ruleRow('Weekly target', stepper(Number(acct.weeklyTargetPercent) || 0,
        async v => { await store.updateAccount(acct.id, { weeklyTargetPercent: Math.max(0, v) }); nav.refresh(); },
        v => v > 0 ? v.toFixed(2) + '%' : 'none', 0.25)),
    ),
  );

  /* ---------- sessions ---------- */
  const sessionsCard = el('section', { class: 'card', style: { flex: 'none', padding: '24px 22px', maxHeight: '100%' } });
  function paintSessions() {
    const timeField = (val, set) => el('input', {
      type: 'time', value: val, class: 'm',
      style: { background: 'var(--grey-7)', borderRadius: '10px', padding: '5px 7px', fontSize: '11.5px',
               color: 'var(--ink)', flex: 'none', width: '110px' },
      onChange: async e => { set(e.target.value); await save(); } });

    sessionsCard.replaceChildren(
      el('h2', { title: 'A trade is labelled by its entry time, exactly. Where sessions overlap the first in this list wins. Changing anything here relabels every trade.' }, 'Sessions'),
      el('div', { style: { marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' } },
        ...pb.sessions.map((s, i) => el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          el('input', { class: 'm', value: s.name,
            title: s.name,
            style: { fontSize: '12px', color: 'var(--ink)', background: 'transparent', width: '100px', flex: 'none' },
            onChange: async e => { s.name = e.target.value.trim() || s.name; await save(); } }),
          timeField(s.start, v => s.start = v),
          el('span', { class: 'm', style: { fontSize: '10px', color: 'var(--grey-5)' } }, '–'),
          timeField(s.end, v => s.end = v),
          confirmButton({
            label: '×', title: 'Remove',
            armedLabel: (() => { const n = store.trades.filter(t => t.sessionId === s.id).length;
              return n ? `delete · ${n} trade${n === 1 ? '' : 's'}` : 'delete?'; })(),
            style: { marginLeft: 'auto', color: 'var(--grey-5)', fontSize: '14px' },
            armedStyle: { marginLeft: 'auto', color: 'var(--orange)', fontSize: '10.5px' },
            onConfirm: async () => {
              for (const t of store.trades) if (t.sessionId === s.id) t.sessionId = null;
              pb.sessions.splice(i, 1);
              await store.save('trades'); await save();
            } })))),
      el('div', { style: { marginTop: '14px', display: 'flex', gap: '7px', flexWrap: 'wrap' } },
        el('button', { class: 'tag-add', onClick: async () => {
          const name = await inlineInput(sessionsCard, 'Name this session');
          if (!name) return paintSessions();
          pb.sessions.push({ id: 'ses_' + crypto.randomUUID().slice(0, 6), name, start: '00:00', end: '01:00' });
          await save();
        } }, '+ add session'),
        el('button', { class: 'tag-add', onClick: async () => {
          pb.sessions = DEFAULT_SESSIONS();
          for (const t of store.trades) t.sessionId = t.timeOpen ? (c.sessionFor(pb, t.timeOpen)?.id ?? null) : null;
          await store.save('trades'); await save();
          toast('Sessions reset to the killzone defaults');
        } }, 'reset to killzones'),
        el('button', { class: 'tag-add', title: 'When New York moves between EDT and EST everything shifts an hour on your clock',
          onClick: async () => {
            for (const s of pb.sessions) { s.start = shiftHour(s.start, 1); s.end = shiftHour(s.end, 1); }
            for (const t of store.trades) t.sessionId = t.timeOpen ? (c.sessionFor(pb, t.timeOpen)?.id ?? null) : null;
            await store.save('trades'); await save();
            toast('Every session moved an hour later');
          } }, 'shift +1h'),
        el('button', { class: 'tag-add', onClick: async () => {
          for (const s of pb.sessions) { s.start = shiftHour(s.start, -1); s.end = shiftHour(s.end, -1); }
          for (const t of store.trades) t.sessionId = t.timeOpen ? (c.sessionFor(pb, t.timeOpen)?.id ?? null) : null;
          await store.save('trades'); await save();
          toast('Every session moved an hour earlier');
        } }, 'shift −1h')),
    );
  }
  paintSessions();

  return el('div', { class: 'view' }, head,
    el('div', { class: 'row', style: { flex: '1', alignItems: 'flex-start', minHeight: 0, overflowY: 'auto' } },
      setupsCard,
      tagsCard,
      /* Timing and risk are the two things you set once and then live with,
         so they sit together down the right. Tags get the middle to
         themselves — it is the column that grows. */
      el('div', { style: { width: '424px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px' } },
        sessionsCard, rulesCard)));
}

function shiftHour(hhmm, by) {
  const [h, m] = hhmm.split(':').map(Number);
  const nh = (((h + by) % 24) + 24) % 24;
  return `${String(nh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* An inline field instead of window.prompt — it never blocks the page. */
function inlineInput(host, placeholder) {
  return new Promise(resolve => {
    const input = el('input', { class: 'field', placeholder,
      style: { height: '34px', fontSize: '12px', marginTop: '8px' } });
    host.append(input); input.focus();
    let done = false;
    const finish = v => { if (done) return; done = true; input.remove(); resolve(v); };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') finish(input.value.trim() || null);
      if (e.key === 'Escape') finish(null);
    });
    input.addEventListener('blur', () => setTimeout(() => finish(input.value.trim() || null), 120));
  });
}
