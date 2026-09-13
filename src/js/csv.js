/* ============================================================
   csv.js — the whole journal as one flat sheet.
   Same shape as the FX Replay export: account name, currency and
   starting balance repeat on every row, which is what lets a
   single file rebuild accounts, setups and tags on a fresh machine.
   ============================================================ */
import * as c from './calc.js';

export const COLUMNS = [
  'id','account','accountCurrency','accountStartingBalance','date','timeOpen','timeClose',
  'pair','assetClass','side','session','entryPrice','stopLoss','takeProfit','exitPrice',
  'size','sizeUnit','riskPercent','netResult','rMultiple','outcome','setup','tags','grade','notes',
  /* Added after the first release. An older backup has no such column and
     reads back as closed, which is what every trade in it was. */
  'status',
];

const q = v => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(store, accountIds = null) {
  const accounts = new Map(store.allAccounts.map(a => [a.id, a]));
  const setups = new Map(store.playbook.setups.map(s => [s.id, s]));
  const sessions = new Map(store.playbook.sessions.map(s => [s.id, s]));
  const tags = new Map(store.playbook.tagGroups.flatMap(g => g.tags).map(t => [t.id, t]));

  const rows = store.trades
    .filter(t => !accountIds || accountIds.includes(t.accountId))
    .sort((a, b) => (a.date + (a.timeOpen || '')).localeCompare(b.date + (b.timeOpen || '')));

  const lines = [COLUMNS.join(',')];
  for (const t of rows) {
    const a = accounts.get(t.accountId);
    const open = t.status === 'open';
    const r = a ? c.rMultiple(a, t) : null;
    lines.push([
      t.id, a?.name, a?.currency, a?.startingBalance, t.date, t.timeOpen, t.timeClose,
      t.pair, t.assetClass, t.side, sessions.get(t.sessionId)?.name,
      t.entryPrice, t.stopLoss, t.takeProfit, t.exitPrice, t.size, t.sizeUnit,
      t.riskPercent,
      /* A running trade exports with its result, R and outcome left blank,
         because it has none. Writing a zero would make the backup disagree
         with the journal it came from. */
      open ? '' : t.netResult, open || r == null ? '' : r.toFixed(4), open ? '' : c.outcome(t),
      setups.get(t.setupId)?.name,
      (t.tagIds || []).map(id => tags.get(id)?.name).filter(Boolean).join(';'),
      t.grade, t.notes, open ? 'open' : 'closed',
    ].map(q).join(','));
  }
  return lines.join('\n') + '\n';
}

/* A CSV parser that copes with quoted fields, embedded commas and newlines. */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(x => x !== '')) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/** Work out what an import would do, without writing anything. */
export function planImport(store, records) {
  const existingIds = new Set(store.trades.map(t => t.id));
  const accountsByName = new Map(store.allAccounts.map(a => [a.name.toLowerCase(), a]));
  const setupsByName = new Map(store.playbook.setups.map(s => [s.name.toLowerCase(), s]));
  const tagsByName = new Map(store.playbook.tagGroups.flatMap(g => g.tags).map(t => [t.name.toLowerCase(), t]));

  const newAccounts = new Map(), newSetups = new Set(), newTags = new Set();
  let add = 0, skip = 0; const problems = [];

  records.forEach((r, i) => {
    const open = String(r.status || '').toLowerCase() === 'open';
    if (!r.date || !r.pair || (!open && (r.netResult === '' || r.netResult == null))) {
      problems.push({ line: i + 2, why: 'missing date, pair or netResult' }); return;
    }
    if (r.id && existingIds.has(r.id)) { skip++; return; }
    add++;
    const an = (r.account || 'Imported').toLowerCase();
    if (!accountsByName.has(an) && !newAccounts.has(an)) {
      newAccounts.set(an, { name: r.account || 'Imported', currency: r.accountCurrency || 'USD',
                            startingBalance: Number(r.accountStartingBalance) || 0 });
    }
    if (r.setup && !setupsByName.has(r.setup.toLowerCase())) newSetups.add(r.setup);
    (r.tags || '').split(';').map(t => t.trim()).filter(Boolean)
      .forEach(t => { if (!tagsByName.has(t.toLowerCase())) newTags.add(t); });
  });

  return { add, skip, problems, newAccounts: [...newAccounts.values()], newSetups: [...newSetups], newTags: [...newTags] };
}

/** Apply an import. Rule: a row whose id is already here is skipped; nothing is deleted. */
export async function applyImport(store, records) {
  const plan = planImport(store, records);

  for (const a of plan.newAccounts) await store.addAccount({ ...a, defaultRiskPercent: 1 });
  const accountsByName = new Map(store.allAccounts.map(a => [a.name.toLowerCase(), a]));

  for (const name of plan.newSetups) {
    store.playbook.setups.push({ id: 's_' + crypto.randomUUID().slice(0, 6), name, color: '#0988F0', rules: [] });
  }
  for (const name of plan.newTags) {
    store.playbook.tagGroups[0].tags.push({ id: 'tg_' + crypto.randomUUID().slice(0, 6), name });
  }
  if (plan.newSetups.length || plan.newTags.length) await store.save('playbook');

  const setupsByName = new Map(store.playbook.setups.map(s => [s.name.toLowerCase(), s]));
  const tagsByName = new Map(store.playbook.tagGroups.flatMap(g => g.tags).map(t => [t.name.toLowerCase(), t]));
  const sessionsByName = new Map(store.playbook.sessions.map(s => [s.name.toLowerCase(), s]));
  const existingIds = new Set(store.trades.map(t => t.id));

  let added = 0;
  for (const r of records) {
    const open = String(r.status || '').toLowerCase() === 'open';
    if (!r.date || !r.pair || (!open && (r.netResult === '' || r.netResult == null))) continue;
    if (r.id && existingIds.has(r.id)) continue;
    const acc = accountsByName.get((r.account || 'Imported').toLowerCase());
    if (!acc) continue;
    store.data.trades.trades.push({
      id: r.id || ('t_' + crypto.randomUUID().slice(0, 8)),
      accountId: acc.id,
      date: r.date, timeOpen: r.timeOpen || null, timeClose: r.timeClose || null,
      pair: r.pair, assetClass: r.assetClass || null, side: r.side === 'sell' ? 'sell' : 'buy',
      sessionId: sessionsByName.get((r.session || '').toLowerCase())?.id || null,
      entryPrice: num(r.entryPrice), stopLoss: num(r.stopLoss), takeProfit: num(r.takeProfit), exitPrice: num(r.exitPrice),
      size: num(r.size), sizeUnit: r.sizeUnit || null,
      riskPercent: Number(r.riskPercent) || acc.defaultRiskPercent || 1,
      netResult: open ? null : (Number(r.netResult) || 0),
      status: open ? 'open' : 'closed',
      /* A break-even can carry a non-zero amount, so the label has to come
         back from the file rather than be re-derived from the number. */
      outcome: String(r.outcome || '').toLowerCase() === 'breakeven' ? 'breakeven' : null,
      setupId: setupsByName.get((r.setup || '').toLowerCase())?.id || null,
      tagIds: (r.tags || '').split(';').map(t => t.trim()).filter(Boolean)
                .map(t => tagsByName.get(t.toLowerCase())?.id).filter(Boolean),
      grade: r.grade || null, notes: r.notes || '',
      createdAt: new Date().toISOString(),
    });
    added++;
  }
  await store.save('trades');
  return { ...plan, added };
}

const num = v => { const n = Number(v); return v === '' || v == null || !isFinite(n) ? null : n; };
