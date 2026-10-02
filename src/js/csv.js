/* ============================================================
   csv.js — the whole journal as one flat sheet.

   One way out, for a spreadsheet. Bringing a journal back is the vault's
   job, not this file's: a sheet of text cannot carry the charts. The
   importer does read the question columns back (questions.js), so trades
   brought in from a Quire sheet keep their answers. parseCSV
   stays because the broker importer and the replay importer both read
   other people's files with it.
   ============================================================ */
import * as c from './calc.js';
import { QUESTION_COLUMNS, questionCells } from './questions.js';

export const COLUMNS = [
  'id','account','accountCurrency','accountStartingBalance','date','timeOpen','timeClose',
  'pair','assetClass','side','session','entryPrice','stopLoss','takeProfit','exitPrice',
  'size','sizeUnit','riskPercent','netResult','rMultiple','outcome','setup','tags','grade','notes',
  /* Added after the first release. An older backup has no such column and
     reads back as closed, which is what every trade in it was. */
  'status',
  /* Also added later. Blank, or anything but 'forward', reads as a live
     trade — which is what every trade written before this column was. */
  'mode',
  /* And the questions New trade asks beyond the numbers — confidence, how
     it felt after, how it ended, what it would have made if held, the
     timeframe, mistakes and price delivery. Blank where never answered. */
  ...QUESTION_COLUMNS,
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
      t.mode === 'forward' ? 'forward' : 'live',
      ...questionCells(t),
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
