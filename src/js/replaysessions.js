/* ============================================================
   replaysessions.js — Replay's sessions and groups.

   Kept in the vault in data/replay.json beside the old FX Replay weeks
   (still read, never shown):
     groups:   [{ id, name, collapsed, at }]
     sessions: [{ id, name, groupId, inst, from, to, at, layout, tfs,
                  balance, risk, riskMode, trades, created, opened, finished }]
     settings: { balance, risk, riskMode }   — what a new session starts with
   Times are unix seconds. `at` is the replay's moment: everything after it
   does not exist on the session's charts yet.

   A session is one pair over one period. It sits in one group or none.
   Nothing here ever reaches the journal.
   ============================================================ */
import * as cd from './candles.js';

export const pairName = inst => (inst === 'NAS100_USD' ? 'NAS100' : String(inst).replace('_', ''));
export const DEFAULT_SETTINGS = { balance: 100000, risk: 1, riskMode: '%' };
const DAY = 86400;
const id = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const data = store => store.data.replay;
export const settingsOf = store => ({ ...DEFAULT_SETTINGS, ...(data(store).settings || {}) });
export const sessionsOf = store => data(store).sessions;
export const groupsOf = store => data(store).groups;
export const sessionById = (store, sid) => sessionsOf(store).find(s => s.id === sid) || null;
const save = store => store.save('replay');

/** Make the file's Replay part whole (used by the store's heal). Returns true when it changed. */
export function healReplay(r) {
  let changed = false;
  if (!Array.isArray(r.groups)) { r.groups = []; changed = true; }
  if (!Array.isArray(r.sessions)) { r.sessions = []; changed = true; }
  if (!r.settings || typeof r.settings !== 'object' || Array.isArray(r.settings)) { r.settings = { ...DEFAULT_SETTINGS }; changed = true; }
  const ok = r.sessions.filter(s => s && s.id && s.inst && [s.from, s.to].every(Number.isFinite) && s.to > s.from);
  if (ok.length !== r.sessions.length) { r.sessions = ok; changed = true; }
  const groupIds = new Set(r.groups.filter(g => g && g.id).map(g => g.id));
  if (groupIds.size !== r.groups.length) { r.groups = r.groups.filter(g => g && g.id); changed = true; }
  for (const s of r.sessions) {
    if (!Number.isFinite(s.at) || s.at < s.from || s.at > s.to) { s.at = Math.min(Math.max(Number(s.at) || s.from, s.from), s.to); changed = true; }
    if (s.groupId && !groupIds.has(s.groupId)) { s.groupId = null; changed = true; }
    if (!Array.isArray(s.trades)) { s.trades = []; changed = true; }
    if (![1, 2, 3, 4].includes(s.layout)) { s.layout = 1; changed = true; }
    if (!Array.isArray(s.tfs) || s.tfs.length !== 4) { s.tfs = [5, 60, 240, 15]; changed = true; }
    if (!s.ind || typeof s.ind !== 'object' || Array.isArray(s.ind)) { s.ind = { sessions: true, news: true, rsi: false }; changed = true; }
  }
  return changed;
}

/* ---------- sessions ---------- */
export async function createSession(store, { name, inst, from, to, groupId = null, balance, risk, riskMode }) {
  const st = settingsOf(store);
  const s = { id: id('rs'), name: String(name || '').trim() || 'Session', groupId: groupId || null, inst, from, to, at: from,
    layout: 1, tfs: [5, 60, 240, 15], ind: { sessions: true, news: true, rsi: false }, balance: Number.isFinite(balance) ? balance : st.balance,
    risk: Number.isFinite(risk) ? risk : st.risk, riskMode: riskMode || st.riskMode,
    trades: [], created: new Date().toISOString(), opened: null, finished: false };
  sessionsOf(store).push(s);
  await save(store);
  return s;
}
export async function updateSession(store, sid, patch) {
  const s = sessionById(store, sid);
  if (!s) return null;
  Object.assign(s, patch);
  await save(store);
  return s;
}
export async function duplicateSession(store, sid) {
  const s = sessionById(store, sid);
  if (!s) return null;
  const copy = { ...structuredClone(s), id: id('rs'), name: `${s.name} (copy)`, at: s.from, trades: [], created: new Date().toISOString(), opened: null, finished: false };
  sessionsOf(store).push(copy);
  await save(store);
  return copy;
}
/** A session goes, and the drawings made in it with it. */
export async function deleteSession(store, sid) {
  const r = data(store);
  r.sessions = r.sessions.filter(s => s.id !== sid);
  const lines = store.data.drawings?.lines;
  if (lines && lines[drawKey(sid)]) { delete lines[drawKey(sid)]; await store.save('drawings'); }
  await save(store);
}
export const drawKey = sid => `replay:${sid}`;

/* ---------- groups ---------- */
export async function createGroup(store, name) {
  const g = { id: id('rg'), name: String(name || '').trim() || 'Group', collapsed: false, at: new Date().toISOString() };
  groupsOf(store).push(g);
  await save(store);
  return g;
}
export async function updateGroup(store, gid, patch) {
  const g = groupsOf(store).find(x => x.id === gid);
  if (!g) return null;
  Object.assign(g, patch);
  await save(store);
  return g;
}
/** Delete a group: 'all' takes its sessions too; 'move' leaves them, ungrouped. */
export async function deleteGroup(store, gid, how = 'move') {
  const r = data(store);
  for (const s of [...r.sessions].filter(x => x.groupId === gid)) {
    if (how === 'all') await deleteSession(store, s.id);
    else s.groupId = null;
  }
  r.groups = r.groups.filter(g => g.id !== gid);
  await save(store);
}

/* ---------- what a session or group adds up to (trades come with stage 5) ---------- */
export function statsOf(sessions) {
  const trades = sessions.flatMap(s => (s.trades || []).filter(t => t.closed).map(t => ({ ...t, balance: s.balance })));
  const won = trades.filter(t => t.pnl > 0).length, lost = trades.filter(t => t.pnl < 0).length;
  const r = trades.reduce((a, t) => a + (Number(t.r) || 0), 0);
  const usd = trades.reduce((a, t) => a + (Number(t.pnl) || 0), 0);
  const balances = new Set(sessions.map(s => s.balance));
  const pct = sessions.reduce((a, s) => a + (s.trades || []).filter(t => t.closed).reduce((b, t) => b + (Number(t.pnl) || 0) / (s.balance || 1) * 100, 0), 0);
  return { trades: trades.length, won, lost, be: trades.length - won - lost, winRate: trades.length ? won / trades.length : null, r, usd, pct, sameBalance: balances.size <= 1 };
}
export const progressOf = s => Math.max(0, Math.min(1, (s.at - s.from) / Math.max(1, s.to - s.from)));

/* ---------- moving through time ---------- */
/** The next start of a Playbook session (Asia, London, New York…) after `T`, on a weekday. */
export function nextSessionOpen(playbookSessions, T, names = null) {
  let best = null;
  for (let k = 0; k <= 8; k++) {
    const d = new Date((T + k * DAY) * 1000);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const s of playbookSessions || []) {
      if (!s.start || (names && !names.includes(s.name))) continue;
      const a = cd.localStamp(day, s.start);
      if (a <= T || closedAt(a)) continue;
      if (!best || a < best.t) best = { t: a, name: s.name };
    }
    if (best) return best;
  }
  return best;
}
/** The next trading day's open: 17:00 New York, skipping the weekend. */
export function nextDay(T) {
  let a = cd.rolloverOf(T) + DAY;
  for (let k = 0; k < 4 && closedAt(a + 60); k++) a = cd.rolloverOf(a + DAY + 3600);
  return a;
}
/** The FX market is shut from Friday's close to Sunday's open (New York time). */
export function closedAt(T) {
  const ny = new Date(new Date(T * 1000).toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dow = ny.getDay(), h = ny.getHours();
  return dow === 6 || (dow === 5 && h >= 17) || (dow === 0 && h < 17);
}
