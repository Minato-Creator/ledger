/* ============================================================
   shots.js — the two charts behind a trade.

   Every trade gets two slots, and they are deliberately not a gallery:

     LTF — the entry. What you actually saw when you pressed the button.
     HTF — the context. What the trade was inside of.

   Two is the number that makes a journal worth reading back. One is not
   enough to explain a trade; six is a folder nobody opens.

   Screenshots arrive as whatever the operating system's snipping tool
   produced — usually a 2-4MB PNG, often wider than any screen will show it.
   Everything here is about not storing that. A chart is re-encoded to JPEG at
   a size you can still count candles on, which is around a tenth of the
   bytes, and nothing is written until the trade is saved.
   ============================================================ */

/** Where a trade's screenshot lives. Named off the trade, so the folder is
    browsable and nothing is orphaned by a rename. */
import { isTauri } from './fs.js';

export const shotName = (tradeId, slot) => `screenshots/${tradeId}-${slot}.jpg`;

const MAX_EDGE = 2200;          // wider than this is detail no screen shows
const QUALITY = 0.8;            // candles and wick tips still legible
export const MAX_INPUT = 25 * 1024 * 1024;

export const isImage = f => !!f && /^image\//.test(f.type || '');

/**
 * Re-encode a screenshot down to something worth keeping.
 *
 * Returns { blob, width, height, from, to } so the caller can say what it
 * saved rather than guess. If the browser cannot decode the file at all — a
 * HEIC on a machine without the codec, say — this throws with a reason
 * instead of writing a file that will never open.
 */
export async function prepare(file) {
  if (!isImage(file)) throw new Error('That is not an image file.');
  if (file.size > MAX_INPUT) throw new Error('That image is over 25MB — crop it first.');

  const bitmap = await decode(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  /* A dark chart shrunk without smoothing turns to moiré, and the grid is the
     part you are trying to read. */
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise((res, rej) =>
    canvas.toBlob(b => (b ? res(b) : rej(new Error('That image could not be re-saved.'))), 'image/jpeg', QUALITY));

  return { blob, width: w, height: h, from: file.size, to: blob.size };
}

/* createImageBitmap is the fast path and the one that handles large files
   without pinning them in memory twice; the <img> route is the fallback for
   browsers that will not decode a Blob directly. */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const n = new Image();
      n.onload = () => res(n);
      n.onerror = () => rej(new Error('That image could not be read.'));
      n.src = url;
    });
    return img;
  } finally { URL.revokeObjectURL(url); }
}

/** An image on the clipboard, if there is one. Ctrl+V is how a screenshot
    actually reaches a journal — nobody saves it to disk first. */
export function imageOnClipboard(e) {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind === 'file' && /^image\//.test(item.type)) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

/* ---------- a TradingView snapshot link (7 Nov) ----------
   In TradingView, camera → Copy link gives tradingview.com/x/<id>/ — a public
   picture of the chart as it was when taken (unlike a /chart/ layout link,
   which only opens inside TradingView). The picture itself is kept at
   s3.tradingview.com/snapshots/<first letter>/<id>.png. Pasted or dropped on
   a trade's Charts box, the picture is fetched and saved like any screenshot,
   so it stays with the trade even if the link stops working. */
const TV_X = /^\s*https?:\/\/(?:[a-z]{2,3}\.)?tradingview\.com\/x\/([A-Za-z0-9]{4,20})\/?(?:[?#]\S*)?\s*$/;
const TV_S3 = /^\s*https:\/\/s3\.tradingview\.com\/snapshots\/[a-z0-9]\/([A-Za-z0-9]{4,20})\.png\s*$/;
export function snapshotOf(text) {
  const s = String(text || '').trim().split(/\s+/)[0] || '';
  const m = TV_X.exec(s) || TV_S3.exec(s);
  if (!m) return null;
  const id = m[1], at = c => `https://s3.tradingview.com/snapshots/${c}/${id}.png`;
  /* the folder is the id's first letter, written small; as written, should that ever change */
  const images = [...new Set([at(id[0].toLowerCase()), at(id[0])])];
  return { id, link: `https://www.tradingview.com/x/${id}/`, image: images[0], images };
}
async function snapshotBlob(url) {
  if (isTauri()) {
    /* the desktop's own rules keep the page to itself; the shell fetches it (main.rs fetch_image) */
    const b64 = await window.__TAURI__.core.invoke('fetch_image', { url });
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: bytes[0] === 0xFF ? 'image/jpeg' : 'image/png' });
  }
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TradingView said ${res.status}`);
  const blob = await res.blob();
  if (blob.type && !/^image\//.test(blob.type)) throw new Error('TradingView did not send a picture');
  return blob;
}
/** The picture behind a snapshot link, as a file ready for prepare(). */
export async function fetchSnapshot(snap) {
  let last = null;
  for (const url of snap.images || [snap.image]) {
    try {
      const blob = await snapshotBlob(url);
      return new File([blob], `tradingview-${snap.id}.${blob.type === 'image/jpeg' ? 'jpg' : 'png'}`, { type: blob.type || 'image/png' });
    } catch (e) { last = e; }
  }
  throw last || new Error('no picture');
}

/** A file dragged onto something, if it is an image. */
export function imageOnDrop(e) {
  const files = e.dataTransfer && e.dataTransfer.files;
  if (!files || !files.length) return null;
  return isImage(files[0]) ? files[0] : null;
}

/* Object URLs are a leak if nobody revokes them, and a view that rebuilds its
   DOM on every keystroke makes a lot of them. One cache, keyed by the stored
   name, handed out for as long as the app is open. */
const urls = new Map();
export function urlFor(name, blob) {
  if (urls.has(name)) return urls.get(name);
  const url = URL.createObjectURL(blob);
  urls.set(name, url);
  return url;
}
export function forgetUrl(name) {
  const url = urls.get(name);
  if (url) { URL.revokeObjectURL(url); urls.delete(name); }
}

export const readableSize = bytes =>
  bytes == null ? '—'
  : bytes < 1024 ? bytes + ' B'
  : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(0) + ' KB'
  : (bytes / 1024 / 1024).toFixed(1) + ' MB';
