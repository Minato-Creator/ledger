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
  };
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
  };
}

export const fs = isTauri() ? tauriBackend() : browserBackend();
