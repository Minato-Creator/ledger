/* ============================================================
   vault.js — a whole journal in one file.

   A vault is a folder; an exported vault is that folder as a ZIP. Not a
   private container format, a real ZIP: you can double-click it, look inside,
   pull one screenshot out. A backup you cannot open without the app that
   wrote it is a backup you have to trust rather than check.

   The ZIP is written by hand because the app ships as a single file with no
   libraries beside it, and because the format's stored-entry path is small
   enough to be worth owning. JSON is deflated where the browser will do it;
   screenshots are stored as they are, being JPEG already.
   ============================================================ */

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ZIP stores the clock in the shape MS-DOS used in 1980. A file dated
   "1996-08-00" in a listing looks like a mistake, so it is worth the six
   lines to write the real one. */
function dosStamp(d = new Date()) {
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date, time };
}

/* ---------- CRC-32, which ZIP requires per entry ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const deflateWorks = () => typeof CompressionStream === 'function';
const inflateWorks = () => typeof DecompressionStream === 'function';

async function through(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
const deflate = bytes => through(bytes, new CompressionStream('deflate-raw'));
const inflate = bytes => through(bytes, new DecompressionStream('deflate-raw'));

/* ---------- writing ---------- */

/**
 * Build a ZIP from `[{ name, bytes }]`.
 *
 * Every entry carries its size and checksum in its own header, so the file is
 * valid for anything that reads ZIPs — Explorer, Finder, unzip, this app.
 */
export async function zip(entries) {
  const parts = [], central = [];
  const { date, time } = dosStamp();
  let offset = 0;

  for (const { name, bytes } of entries) {
    const nameBytes = enc.encode(name);
    const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const sum = crc32(raw);

    /* Deflate is worth it on JSON and pointless on a JPEG, which is already
       compressed — trying costs time and usually makes the entry bigger. */
    let body = raw, method = 0;
    if (deflateWorks() && /\.json$/i.test(name) && raw.length > 256) {
      const packed = await deflate(raw);
      if (packed.length < raw.length) { body = packed; method = 8; }
    }

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);            // version needed
    lv.setUint16(6, 0x0800, true);        // UTF-8 names
    lv.setUint16(8, method, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, sum, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    parts.push(local, body);

    const dir = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, method, true);
    dv.setUint16(12, time, true);
    dv.setUint16(14, date, true);
    dv.setUint32(16, sum, true);
    dv.setUint32(20, body.length, true);
    dv.setUint32(24, raw.length, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint32(42, offset, true);
    dir.set(nameBytes, 46);
    central.push(dir);

    offset += local.length + body.length;
  }

  const dirSize = central.reduce((n, d) => n + d.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

/* ---------- reading ---------- */

/**
 * Read a ZIP into `[{ name, bytes }]`.
 *
 * The central directory is the index, so a file that has been unzipped and
 * zipped again by something else still reads — which matters, because someone
 * WILL open their vault, look at it, and zip it back up.
 */
export async function unzip(blob) {
  const all = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(all.buffer);

  let end = -1;
  for (let i = all.length - 22; i >= 0 && i > all.length - 66000; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('That is not a vault file.');

  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = [];

  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('That vault file is damaged.');
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const plain = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const start = view.getUint32(at + 42, true);
    const name = dec.decode(all.subarray(at + 46, at + 46 + nameLen));

    const lNameLen = view.getUint16(start + 26, true);
    const lExtraLen = view.getUint16(start + 28, true);
    const from = start + 30 + lNameLen + lExtraLen;
    let bytes = all.subarray(from, from + packed);

    if (method === 8) {
      if (!inflateWorks()) throw new Error('This browser cannot read a compressed vault.');
      bytes = await inflate(bytes);
    } else if (method !== 0) {
      throw new Error('That vault uses a compression this app does not read.');
    }
    if (plain && bytes.length !== plain) throw new Error(`${name} came out the wrong size.`);

    if (!name.endsWith('/')) out.push({ name, bytes });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export const bytesOfText = text => enc.encode(text);
export const textOfBytes = bytes => dec.decode(bytes);
