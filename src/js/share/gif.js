/* ============================================================
   share/gif.js — an animated GIF, written here rather than borrowed.

   The app runs offline and as one file, so there is no library to fetch.
   A GIF is a small format: a header, then for each frame a palette of up to
   256 colours, the pixels as indexes into it, LZW-compressed.

   Each frame gets its own palette (a "local colour table"), cut from that
   frame's own colours by median cut: the colours are counted on a 5-bit
   grid, and the busiest box is split at its median along its longest side
   until there are 256 boxes. Every pixel then takes its box's average —
   no nearest-colour search, so a frame quantises in a few milliseconds.
   ============================================================ */

/**
 * @param {number} w  width in pixels
 * @param {number} h  height in pixels
 * @param {object} [o]
 * @param {number} [o.delay]  hundredths of a second per frame
 * @returns {{ add(rgba: Uint8ClampedArray, delay?: number): void, finish(): Uint8Array }}
 */
export function gifWriter(w, h, { delay = 8 } = {}) {
  const out = new Bytes();
  out.str('GIF89a');
  out.u16(w); out.u16(h);
  out.byte(0x70);            // no global palette; 8 bits of colour resolution
  out.byte(0); out.byte(0);  // background, aspect
  /* loop for ever (the NETSCAPE2.0 extension) */
  out.byte(0x21); out.byte(0xFF); out.byte(11); out.str('NETSCAPE2.0');
  out.byte(3); out.byte(1); out.u16(0); out.byte(0);

  return {
    add(rgba, d = delay) {
      const { palette, index } = quantise(rgba, w * h, w);
      /* graphic control: the delay, no transparency, leave the frame in place */
      out.byte(0x21); out.byte(0xF9); out.byte(4); out.byte(0x04); out.u16(d); out.byte(0); out.byte(0);
      /* the image, with its own 256-colour table */
      out.byte(0x2C); out.u16(0); out.u16(0); out.u16(w); out.u16(h); out.byte(0x87);
      for (let i = 0; i < 256; i++) { out.byte(palette[i * 3]); out.byte(palette[i * 3 + 1]); out.byte(palette[i * 3 + 2]); }
      out.byte(8);
      lzw(index, 8, out);
    },
    finish() { out.byte(0x3B); return out.done(); },
  };
}

/* ---------- colours: median cut on a 5-bit grid ---------- */
function quantise(rgba, n, w4) {
  const hist = new Uint32Array(32768);
  const bin = new Uint16Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const k = ((rgba[p] >> 3) << 10) | ((rgba[p + 1] >> 3) << 5) | (rgba[p + 2] >> 3);
    bin[i] = k; hist[k]++;
  }
  const used = [];
  for (let k = 0; k < 32768; k++) if (hist[k]) used.push(k);
  const cols = Uint16Array.from(used);
  const R = k => k >> 10, G = k => (k >> 5) & 31, B = k => k & 31;

  /* a box is a run of `cols`; split the one holding the most pixels with room to split */
  const boxes = [mkBox(0, cols.length)];
  function mkBox(a, z) {
    let r0 = 31, r1 = 0, g0 = 31, g1 = 0, b0 = 31, b1 = 0, count = 0;
    for (let i = a; i < z; i++) {
      const k = cols[i], r = R(k), g = G(k), b = B(k);
      if (r < r0) r0 = r; if (r > r1) r1 = r; if (g < g0) g0 = g; if (g > g1) g1 = g; if (b < b0) b0 = b; if (b > b1) b1 = b;
      count += hist[k];
    }
    return { a, z, count, span: Math.max(r1 - r0, g1 - g0, b1 - b0), axis: r1 - r0 >= g1 - g0 && r1 - r0 >= b1 - b0 ? 0 : g1 - g0 >= b1 - b0 ? 1 : 2 };
  }
  while (boxes.length < 256) {
    let best = -1, bestScore = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.z - b.a < 2 || b.span === 0) continue;
      const score = b.count * (b.span + 1);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) break;
    const b = boxes[best];
    const key = b.axis === 0 ? R : b.axis === 1 ? G : B;
    const part = Array.from(cols.subarray(b.a, b.z)).sort((x, y) => key(x) - key(y));
    cols.set(part, b.a);
    let half = b.count / 2, acc = 0, cut = b.a + 1;
    for (let i = b.a; i < b.z - 1; i++) { acc += hist[cols[i]]; if (acc >= half) { cut = i + 1; break; } }
    cut = Math.max(b.a + 1, Math.min(b.z - 1, cut));
    boxes.splice(best, 1, mkBox(b.a, cut), mkBox(cut, b.z));
  }

  const palette = new Uint8Array(768);
  const lut = new Uint8Array(32768);
  boxes.forEach((b, bi) => {
    let r = 0, g = 0, bb = 0, c = 0;
    for (let i = b.a; i < b.z; i++) {
      const k = cols[i], w = hist[k];
      r += (R(k) * 8 + 4) * w; g += (G(k) * 8 + 4) * w; bb += (B(k) * 8 + 4) * w; c += w;
      lut[k] = bi;
    }
    if (c) { palette[bi * 3] = Math.round(r / c); palette[bi * 3 + 1] = Math.round(g / c); palette[bi * 3 + 2] = Math.round(bb / c); }
  });
  /* a light ordered dither, so a glow fades instead of stepping */
  const index = new Uint8Array(n);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cl = v => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const x = i % w4, y = (i / w4) | 0;
    const d = (BAYER[(y & 3) * 4 + (x & 3)] - 7.5) * 0.6;
    const k = ((cl(rgba[p] + d) >> 3) << 10) | ((cl(rgba[p + 1] + d) >> 3) << 5) | (cl(rgba[p + 2] + d) >> 3);
    index[i] = hist[k] ? lut[k] : lut[bin[i]];
  }
  return { palette, index };
}

/* ---------- LZW, as GIF wants it: variable-width codes, little-endian bits ---------- */
function lzw(index, minSize, out) {
  const clear = 1 << minSize, eoi = clear + 1;
  let size = minSize + 1, next = eoi + 1;
  let dict = new Map();
  const block = [];
  let acc = 0, bits = 0;
  const emit = code => {
    acc |= code << bits; bits += size;
    while (bits >= 8) { block.push(acc & 255); acc >>>= 8; bits -= 8; }
  };
  emit(clear);
  let prefix = index[0];
  for (let i = 1; i < index.length; i++) {
    const k = index[i];
    const key = prefix * 256 + k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << size) && size < 12) size++;
    } else {
      emit(clear);
      dict = new Map(); size = minSize + 1; next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) block.push(acc & 255);
  for (let i = 0; i < block.length; i += 255) {
    const len = Math.min(255, block.length - i);
    out.byte(len);
    for (let j = 0; j < len; j++) out.byte(block[i + j]);
  }
  out.byte(0);
}

/* ---------- a growing byte buffer ---------- */
class Bytes {
  constructor() { this.buf = new Uint8Array(1 << 20); this.n = 0; }
  byte(b) {
    if (this.n >= this.buf.length) { const nb = new Uint8Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; }
    this.buf[this.n++] = b;
  }
  u16(v) { this.byte(v & 255); this.byte((v >> 8) & 255); }
  str(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  done() { return this.buf.slice(0, this.n); }
}
