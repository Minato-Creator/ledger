/* ============================================================
   store.js — the journal as plain files in a folder.

   Where those files physically live, and how they are read, is fs.js's
   problem: native through Rust, or the browser's File System Access API.
   This file only knows about accounts, trades, playbook and replay.
   ============================================================ */

import { sessionFor, UNITS, todayISO } from './calc.js';
import { fs, isTauri } from './fs.js';
export { todayISO, isTauri };

export const FILES = {
  accounts: 'accounts.json',
  trades:   'trades.json',
  playbook: 'playbook.json',
  replay:   'replay/weeks.json',
};

export function isSupported() { return fs.isSupported(); }

/* ---------- the store ---------- */
class Store {
  constructor() {
    this.data = null;          // { accounts, trades, playbook, replay }
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(fn => fn(this.data)); }

  /* Try to reconnect to the folder chosen last time, without prompting.
     Returns 'connected' | 'needs-permission' | 'none'. */
  async tryRestore() {
    const state = await fs.tryRestore();
    if (state === 'connected') await this.load();
    return state;
  }

  /* Re-ask for permission on the remembered folder (needs a user gesture). */
  async regrant() {
    if (!(await fs.regrant())) return false;
    await this.load();
    return true;
  }

  /* Pick a folder (needs a user gesture). */
  async connect() {
    if (!(await fs.connect())) return false;
    await this.load();
    return true;
  }

  async forget() { await fs.forget(); this.data = null; }

  get folderName() { return fs.folderName; }
  get folderPath() { return fs.folderPath; }
  get isNative()   { return fs.kind === 'native'; }

  /* ---------- files ----------
     A name may carry folder segments, e.g. 'replay/weeks.json'. A file that
     is not there yet, or that somebody has emptied or mangled by hand, comes
     back as the fallback rather than throwing — the folder is the user's to
     poke at, and a bad file should not brick the app. */
  async readJSON(name, fallback) {
    let text;
    try { text = await fs.readText(name); }
    catch { return structuredClone(fallback); }
    if (!text || !text.trim()) return structuredClone(fallback);
    try { return JSON.parse(text); }
    catch { return structuredClone(fallback); }
  }

  async writeJSON(name, value) { return fs.writeText(name, JSON.stringify(value, null, 2)); }
  async writeText(name, text)  { return fs.writeText(name, text); }
  async ensureDir(name)        { return fs.ensureDir(name); }

  /* ---------- load / save ---------- */
  async load() {
    await this.ensureDir('replay');
    const [accounts, trades, playbook, replay] = await Promise.all([
      this.readJSON(FILES.accounts, defaultAccounts()),
      this.readJSON(FILES.trades,   { version: 1, trades: [] }),
      this.readJSON(FILES.playbook, defaultPlaybook()),
      this.readJSON(FILES.replay,   { version: 1, weeks: {} }),
    ]);
    this.data = { accounts, trades, playbook, replay };
    this.migrate();

    // A brand new folder gets its scaffolding written out immediately, so the
    // user can see real files appear rather than wondering if it worked.
    await Promise.all([
      this.writeJSON(FILES.accounts, accounts),
      this.writeJSON(FILES.trades, trades),
      this.writeJSON(FILES.playbook, playbook),
      this.writeJSON(FILES.replay, replay),
      this.ensureDir('screenshots'),
    ]);
    if (this.pendingMigration) { this.pendingMigration = false; }
    this.emit();
  }

  /* Folders written by an earlier version get brought up to date in place.
     Sessions are replaced wholesale and every trade's session is worked out
     again from its open time, so nothing ends up pointing at an id that has
     gone. Setups, tags and rules are left exactly as they are. */
  migrate() {
    const pb = this.data.playbook;
    if ((pb.version || 1) < 2) {
      pb.sessions = DEFAULT_SESSIONS();
      pb.version = 2;
      for (const t of this.data.trades.trades) {
        t.sessionId = t.timeOpen ? (sessionFor(pb, t.timeOpen)?.id ?? null) : null;
      }
      this.pendingMigration = true;
    }
    // Accounts v2 — a display unit for the whole app, and a weekly target
    // per account (kept as a percentage so it scales with the account's size).
    const ac = this.data.accounts;
    if ((ac.version || 1) < 2) {
      ac.displayUnit = ac.displayUnit || '$';
      for (const a of ac.accounts) if (a.weeklyTargetPercent == null) a.weeklyTargetPercent = 0;
      ac.version = 2;
      this.pendingMigration = true;
    }
    // v3 — replay comparison settings live beside the sessions they depend on.
    if ((pb.version || 1) < 3) {
      pb.replay = pb.replay || { windowMins: 15, csvOffsetHours: 8 };
      pb.version = 3;
      this.pendingMigration = true;
    }
  }

  async save(which) {
    const map = { accounts: FILES.accounts, trades: FILES.trades, playbook: FILES.playbook, replay: FILES.replay };
    await this.writeJSON(map[which], this.data[which]);
    this.emit();
  }

  /* ---------- accessors ---------- */
  get accounts()      { return this.data.accounts.accounts.filter(a => !a.archived); }
  get allAccounts()   { return this.data.accounts.accounts; }
  get activeAccount() {
    const id = this.data.accounts.activeAccountId;
    return this.accounts.find(a => a.id === id) || this.accounts[0] || null;
  }
  get trades()        { return this.data.trades.trades; }
  get playbook()      { return this.data.playbook; }
  get replayWeeks()   { return this.data.replay.weeks; }

  tradesFor(accountId) {
    return this.trades
      .filter(t => t.accountId === accountId)
      .sort((a, b) => (b.date + (b.timeClose || '')).localeCompare(a.date + (a.timeClose || '')));
  }

  /* Which unit every figure is read in. A display preference, so it lives
     with the account list rather than with any one account. */
  get displayUnit() { return this.data.accounts.displayUnit || '$'; }
  async setDisplayUnit(u) {
    this.data.accounts.displayUnit = UNITS.includes(u) ? u : '$';
    await this.save('accounts');
  }

  async setActiveAccount(id) {
    this.data.accounts.activeAccountId = id;
    await this.save('accounts');
  }

  async addAccount(acc) {
    const account = {
      id: 'acc_' + crypto.randomUUID().slice(0, 8),
      name: acc.name.trim(),
      currency: acc.currency || 'USD',
      startingBalance: Number(acc.startingBalance) || 0,
      defaultRiskPercent: Number(acc.defaultRiskPercent) || 1,
      color: acc.color || '#0988F0',
      openedAt: acc.openedAt || todayISO(),
      weeklyTargetPercent: Number(acc.weeklyTargetPercent) || 0,   // 0 = no target set
      archived: false,
    };
    this.data.accounts.accounts.push(account);
    this.data.accounts.activeAccountId = account.id;
    await this.save('accounts');
    return account;
  }

  async updateAccount(id, patch) {
    const a = this.data.accounts.accounts.find(x => x.id === id);
    if (!a) return;
    Object.assign(a, patch);
    await this.save('accounts');
  }

  async addTrade(t) {
    const trade = { id: 't_' + crypto.randomUUID().slice(0, 8), createdAt: new Date().toISOString(), ...t };
    this.data.trades.trades.push(trade);
    await this.save('trades');
    return trade;
  }

  async updateTrade(id, patch) {
    const t = this.trades.find(x => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    await this.save('trades');
  }

  async deleteTrade(id) {
    this.data.trades.trades = this.trades.filter(t => t.id !== id);
    await this.save('trades');
  }
}

function defaultAccounts() {
  return { version: 2, accounts: [], activeAccountId: null, displayUnit: '$' };
}

/* Sessions are Perth-anchored by default; every one of these is editable
   in the playbook, and nothing in the app hardcodes them. */
/* ICT killzones, expressed on a Perth (AWST, UTC+8) clock.
   These are the New-York-on-EDT figures. When New York goes back to EST the
   whole set shifts one hour later in Perth — every one of these is editable
   in the playbook, so that is a one-off nudge twice a year.

     Kill zone      New York        Perth (EDT)     Perth (EST)
     Asia           20:00-00:00     08:00-12:00     09:00-13:00
     London Open    02:00-05:00     14:00-17:00     15:00-18:00
     New York Open  07:00-10:00     19:00-22:00     20:00-23:00
     London Close   10:00-12:00     22:00-00:00     23:00-01:00

   A pre-session is the hour before its killzone opens. Pre-London Close sits
   inside the New York Open window; the first match in this list wins, so a
   trade at 21:30 is labelled New York Open. Reorder them to change that. */
export function DEFAULT_SESSIONS() {
  return [
    { id: 'ses_pre_asia',   name: 'Pre-Asia',         start: '07:00', end: '08:00' },
    { id: 'ses_asia',       name: 'Asia',             start: '08:00', end: '12:00' },
    { id: 'ses_pre_london', name: 'Pre-London',       start: '13:00', end: '14:00' },
    { id: 'ses_london',     name: 'London Open',      start: '14:00', end: '17:00' },
    { id: 'ses_pre_ny',     name: 'Pre-NY',           start: '18:00', end: '19:00' },
    { id: 'ses_ny',         name: 'New York Open',    start: '19:00', end: '22:00' },
    { id: 'ses_pre_lc',     name: 'Pre-London Close', start: '21:00', end: '22:00' },
    { id: 'ses_lc',         name: 'London Close',     start: '22:00', end: '00:00' },
  ];
}

const PLAYBOOK_VERSION = 3;

function defaultPlaybook() {
  return {
    version: PLAYBOOK_VERSION,
    setups: [],
    tagGroups: [
      { id: 'g_exec',    name: 'Execution', tags: [] },
      { id: 'g_mistake', name: 'Mistakes',  tags: [] },
      { id: 'g_context', name: 'Context',   tags: [] },
    ],
    sessions: DEFAULT_SESSIONS(),
    rules: { maxTradesPerDay: 3, dailyLossCapPercent: 3 },
    replay: { windowMins: 15, csvOffsetHours: 8 },
  };
}

export const store = new Store();
