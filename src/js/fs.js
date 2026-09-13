/* ============================================================
   fs.js — where the journal actually lives.

   Two backends behind one interface, because the same app runs two ways:

   • Native (Tauri). The folder is an ordinary absolute path and the app
     reads and writes it through four small Rust commands. No permission
     prompt, no picker on startup, no localhost — it opens on your journal.

   • Browser. The File System Access API, with the folder handle kept in
     IndexedDB so it survives a reload. Chrome and Edge only, and the browser
     re-asks for permission once per session; that is the browser's rule, not
     ours.

   Everything above this file — every view, every calculation — is identical
   either way. That is the point of the split.
   ============================================================ */

export const isTauri = () => typeof window !== 'undefined' && !!window.__TAURI__;

/* A page opened by double-clicking has no origin a browser will trust with a
   folder, and no server behind it. It still has storage, though, so the app
   runs — it just keeps the same files inside the browser instead of on disk. */
const onFileProtocol = () => typeof location !== 'undefined' && location.protocol === 'file:';
const pickerAvailable = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/* An embedded page can never open a folder picker — Chrome refuses it outright
   in a cross-origin frame. The API is still sitting there on `window`, so
   feature-detection alone would offer a button that throws when pressed. */
const embedded = () => { try { return window.self !== window.top; } catch { return true; } };

/* Storage can be present and still refuse to work — a file:// page in a Chrome
   that blocks site data, or a private window. Ask it, do not assume. */
const storageWorks = () => {
  try { localStorage.setItem('ledger:probe', '1'); localStorage.removeItem('ledger:probe'); return true; }
  catch { return false; }
};

/* ============================================================
   Where screenshots go when there is no folder to put them in

   Chart screenshots are the one thing in a journal that is not small. A
   couple of them outweighs every trade you will ever type, so they never go
   near the JSON files and never near localStorage, whose few megabytes a
   single screenshot could eat. They go in IndexedDB, which is measured in
   hundreds of megabytes, and they go in as Blobs rather than as base64 —
   base64 costs a third more for nothing.

   A backend with a real folder ignores all of this and writes real files.
   ============================================================ */
const SHOT_DB = 'ledger-shots', SHOT_STORE = 'shots';

function shotDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(SHOT_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(SHOT_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const shotOp = (mode, fn) => shotDb().then(db => new Promise((res, rej) => {
  const req = fn(db.transaction(SHOT_STORE, mode).objectStore(SHOT_STORE));
  req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
}));
const shotStore = {
  async read(name)        { return (await shotOp('readonly',  s => s.get(name))) || null; },
  async write(name, blob) { await shotOp('readwrite', s => s.put(blob, name)); },
  async remove(name)      { await shotOp('readwrite', s => s.delete(name)); },
};

/* Last resort: the app runs, nothing survives the tab closing, and the Backup
   screen says so. Better than a dead page. */
function memoryBackend() {
  const files = new Map();
  return {
    kind: 'memory',
    isSupported: () => true,
    get folderName() { return 'Nowhere'; },
    get folderPath() { return 'not being saved'; },
    async tryRestore() { return 'connected'; },
    async regrant() { return true; },
    async connect() { return false; },
    async forget() { files.clear(); },
    async readText(name) {
      if (!files.has(name)) { const e = new Error(name); e.name = 'NotFoundError'; throw e; }
      return files.get(name);
    },
    async writeText(name, contents) { files.set(name, contents); },
    async ensureDir() {},
    async exists(name) { return files.has(name); },
    async readImage(name) { return files.get('img:' + name) || null; },
    async writeImage(name, blob) { files.set('img:' + name, blob); },
    async deleteImage(name) { files.delete('img:' + name); },
  };
}

/* ============================================================
   Native
   ============================================================ */
const CONFIG_FILE = 'ledger.json';        // remembers which folder you chose

function tauriBackend() {
  const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
  let root = null;                        // absolute path to the journal folder
  let sep = '/';

  const join = (...parts) => parts.filter(Boolean).join(sep);
  const resolve = name => join(root, ...String(name).split('/'));

  const configPath = async () => join(await invoke('config_dir'), CONFIG_FILE);

  async function readConfig() {
    try { return JSON.parse(await invoke('read_text', { path: await configPath() })); }
    catch { return {}; }
  }
  async function writeConfig(cfg) {
    await invoke('write_text', { path: await configPath(), contents: JSON.stringify(cfg, null, 2) });
  }

  return {
    kind: 'native',
    isSupported: () => true,
    get folderName() { return root ? root.split(/[\\/]/).filter(Boolean).pop() : null; },
    get folderPath() { return root; },

    /* There is nothing to restore permission for and nothing to ask. If a
       folder was chosen before we use it; otherwise we make the default one
       and get on with it. */
    async tryRestore() {
      sep = await invoke('path_sep');
      const cfg = await readConfig();
      root = cfg.folder && await invoke('path_exists', { path: cfg.folder })
        ? cfg.folder
        : await invoke('default_folder');
      await invoke('make_dir', { path: root });
      if (cfg.folder !== root) await writeConfig({ ...cfg, folder: root });
      return 'connected';
    },

    async regrant() { return true; },

    /* Only reached when you deliberately move the journal somewhere else. */
    async connect() {
      const picked = await window.__TAURI__.dialog.open({ directory: true, multiple: false, title: 'Choose a folder for your journal' });
      if (!picked) return false;
      root = picked;
      await invoke('make_dir', { path: root });
      await writeConfig({ folder: root });
      return true;
    },

    async forget() { root = null; await writeConfig({}); },

    async readText(name) { return invoke('read_text', { path: resolve(name) }); },
    async writeText(name, contents) { return invoke('write_text', { path: resolve(name), contents }); },
    async ensureDir(name) { return invoke('make_dir', { path: resolve(name) }); },
    async exists(name) { return invoke('path_exists', { path: resolve(name) }); },

    /* Screenshots cross the bridge as base64, because that is what a JSON IPC
       call can carry, and land as real image files you can open from the
       folder. An older build of the app has no such command; rather than lose
       the screenshot, it goes to IndexedDB and appears in the app all the
       same — it just is not a file in the folder until the app is rebuilt. */
    async readImage(name) {
      if (!nativeImages) return shotStore.read(name);
      try {
        const b64 = await invoke('read_image', { path: resolve(name) });
        return b64 ? base64ToBlob(b64) : null;
      } catch (e) {
        if (missingCommand(e)) { nativeImages = false; return shotStore.read(name); }
        return null;
      }
    },
    async writeImage(name, blob) {
      if (nativeImages) {
        try {
          await invoke('write_image', { path: resolve(name), data: await blobToBase64(blob) });
          return;
        } catch (e) {
          if (!missingCommand(e)) throw e;
          nativeImages = false;
        }
      }
      return shotStore.write(name, blob);
    },
    async deleteImage(name) {
      if (nativeImages) {
        try { await invoke('delete_path', { path: resolve(name) }); return; }
        catch (e) { if (!missingCommand(e)) return; nativeImages = false; }
      }
      return shotStore.remove(name);
    },
  };
}

/* Tauri reports an unknown command rather than throwing something typed, so
   this is matched on the message. Checked once and remembered. */
let nativeImages = true;
const missingCommand = e => /not found|unknown command|not allowed/i.test(String(e && e.message || e));

const blobToBase64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});
function base64ToBlob(b64, type = 'image/jpeg') {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/* ============================================================
   Browser
   ============================================================ */
const IDB_NAME = 'ledger-handle', IDB_STORE = 'handles', HANDLE_KEY = 'root';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const idbOp = (mode, fn) => idb().then(db => new Promise((res, rej) => {
  const req = fn(db.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
  req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
}));
const idbGet = k => idbOp('readonly',  s => s.get(k));
const idbSet = (k, v) => idbOp('readwrite', s => s.put(v, k));
const idbDel = k => idbOp('readwrite', s => s.delete(k));

function browserBackend() {
  let root = null;                        // FileSystemDirectoryHandle

  const granted = async (handle, mode = 'readwrite') =>
    !!handle && (await handle.queryPermission({ mode })) === 'granted';

  /* A name may carry folder segments, e.g. 'replay/weeks.json'. */
  async function dirFor(name, create) {
    const parts = String(name).split('/');
    let dir = root;
    for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg, { create });
    return { dir, base: parts[parts.length - 1] };
  }

  return {
    kind: 'browser',
    isSupported: () => typeof window !== 'undefined' && 'showDirectoryPicker' in window,
    get folderName() { return root ? root.name : null; },
    get folderPath() { return root ? root.name : null; },

    async tryRestore() {
      const handle = await idbGet(HANDLE_KEY);
      if (!handle) return 'none';
      root = handle;
      return (await granted(handle)) ? 'connected' : 'needs-permission';
    },

    async regrant() {
      if (!root) return false;
      if (await granted(root)) return true;
      return (await root.requestPermission({ mode: 'readwrite' })) === 'granted';
    },

    async connect() {
      const handle = await window.showDirectoryPicker({ id: 'ledger-journal', mode: 'readwrite' });
      if (!handle) return false;
      if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return false;
      root = handle;
      await idbSet(HANDLE_KEY, handle);
      return true;
    },

    async forget() { await idbDel(HANDLE_KEY); root = null; },

    async readText(name) {
      const { dir, base } = await dirFor(name, false);
      const fh = await dir.getFileHandle(base);
      return (await fh.getFile()).text();
    },
    async writeText(name, contents) {
      const { dir, base } = await dirFor(name, true);
      const fh = await dir.getFileHandle(base, { create: true });
      const w = await fh.createWritable();
      await w.write(contents);
      await w.close();
    },
    async ensureDir(name) {
      let dir = root;
      for (const seg of String(name).split('/')) dir = await dir.getDirectoryHandle(seg, { create: true });
    },
    async exists(name) {
      try { await this.readText(name); return true; } catch { return false; }
    },

    /* A folder can hold a picture as easily as it can hold a line of JSON, so
       here a screenshot is simply a file in `screenshots/`. */
    async readImage(name) {
      try {
        const { dir, base } = await dirFor(name, false);
        return await (await dir.getFileHandle(base)).getFile();
      } catch { return null; }
    },
    async writeImage(name, blob) {
      const { dir, base } = await dirFor(name, true);
      const fh = await dir.getFileHandle(base, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
    },
    async deleteImage(name) {
      try {
        const { dir, base } = await dirFor(name, false);
        await dir.removeEntry(base);
      } catch { /* already gone is the outcome we wanted */ }
    },
  };
}

/* ============================================================
   Browser storage — the fallback with no folder at all

   Same files, same names, same contents; they just live under localStorage
   keys instead of on disk. This is what runs when the page was double-clicked
   rather than served, and on browsers without the folder API at all.

   The honest cost, and the app says so on the Backup screen: this data belongs
   to one browser on one machine. Clearing site data clears the journal. Export
   is the way out, not a nicety.
   ============================================================ */
const LOCAL_PREFIX = 'ledger:file:';

function localBackend() {
  const key = name => LOCAL_PREFIX + String(name);
  return {
    kind: 'local',
    isSupported: () => true,
    get folderName() { return 'This computer'; },
    get folderPath() { return 'browser storage'; },

    async tryRestore() { return 'connected'; },   // nothing to ask, nothing to restore
    async regrant() { return true; },
    async connect() { return false; },            // there is no folder to choose
    async forget() {
      for (const k of Object.keys(localStorage)) if (k.startsWith(LOCAL_PREFIX)) localStorage.removeItem(k);
    },

    /* Everything being held here, so it can be carried over to a real folder
       rather than left behind. */
    list() {
      return Object.keys(localStorage)
        .filter(k => k.startsWith(LOCAL_PREFIX))
        .map(k => k.slice(LOCAL_PREFIX.length));
    },

    async readText(name) {
      const v = localStorage.getItem(key(name));
      if (v == null) { const e = new Error(name + ': not found'); e.name = 'NotFoundError'; throw e; }
      return v;
    },
    async writeText(name, contents) { localStorage.setItem(key(name), contents); },
    async ensureDir() { /* there are no folders here — a name is just a name */ },
    async exists(name) { return localStorage.getItem(key(name)) != null; },

    /* Not in localStorage. A screenshot would eat the whole quota. */
    readImage:   name => shotStore.read(name),
    writeImage:  (name, blob) => shotStore.write(name, blob),
    deleteImage: name => shotStore.remove(name),
  };
}

/* Pick the best backend this page is actually allowed to use. A folder beats
   browser storage, and browser storage beats nothing — but only where each is
   permitted, not merely where the API exists. */
function chooseBackend() {
  /* A preview build keeps nothing, so it opens on the welcome screen every
     time. It is how you look at first-run without wiping a real journal. */
  if (typeof window !== 'undefined' && window.__LEDGER_PREVIEW__) return memoryBackend();
  if (isTauri()) return tauriBackend();
  const canPick = pickerAvailable() && !onFileProtocol() && !embedded();
  if (canPick) return browserBackend();
  return storageWorks() ? localBackend() : memoryBackend();
}

let active = chooseBackend();

/* One object the rest of the app talks to. It delegates, so `connect()` can
   trade up to a real folder mid-session without anything above noticing. */
export const fs = {
  get kind()       { return active.kind; },
  get folderName() { return active.folderName; },
  get folderPath() { return active.folderPath; },
  /* Native has its own picker and none of the browser's restrictions, so it
     can always choose. Everywhere else it depends on what the page is allowed
     to do. */
  get canChooseFolder() {
    return active.kind === 'native' || (pickerAvailable() && !onFileProtocol() && !embedded());
  },
  isSupported: () => active.isSupported(),

  /* Someone opening this for the first time has no folder to restore and no
     reason to be asked for one before they have seen anything — a folder
     picker is a strange first screen. They start on this browser's own
     storage, and Settings offers the folder to anyone who wants it.

     Coming back to a folder you DID choose is a different thing: that is your
     journal, sitting there, one click away, and it is worth the ask. */
  async tryRestore() {
    const state = await active.tryRestore();
    if (state === 'none' && active.kind === 'browser' && storageWorks()) {
      active = localBackend();
      return active.tryRestore();
    }
    return state;
  },
  regrant:     () => active.regrant(),
  forget:      () => active.forget(),
  readText:  n => active.readText(n),
  writeText: (n, c) => active.writeText(n, c),
  ensureDir: n => active.ensureDir(n),
  exists:    n => active.exists(n),
  readImage:   n => active.readImage(n),
  writeImage:  (n, b) => active.writeImage(n, b),
  deleteImage: n => active.deleteImage(n),

  async connect() {
    /* Native opens the operating system's own folder chooser. Sending it down
       the browser path would reach for showDirectoryPicker, which no desktop
       webview has — the journal could never be moved. */
    if (active.kind === 'native') return active.connect();
    if (!this.canChooseFolder) return false;
    if (active.kind === 'browser') return active.connect();

    const prev = active;
    const next = browserBackend();
    if (!(await next.connect())) return false;
    /* Whatever was already written comes along. Choosing a folder should feel
       like moving house, not like starting over — and a journal that appeared
       to empty itself would be the worst possible way to learn that. Anything
       already in the folder is left alone. */
    if (typeof prev.list === 'function') {
      for (const name of prev.list()) {
        try {
          if (await next.exists(name)) continue;
          await next.writeText(name, await prev.readText(name));
        } catch { /* one unreadable file is not a reason to abandon the move */ }
      }
    }
    active = next;
    return true;
  },
};
