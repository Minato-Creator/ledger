/* ============================================================
   logo.js — any image of a firm's logo, made into a square tile.

   People save logos however a site hands them out: a wide wordmark on
   white, an app icon with rounded see-through corners, a mark on its brand
   colour with acres of margin. This finds the mark itself and centres it
   on a square:

     · the background is read from the four corners — see-through, or one
       colour (kept, so a mark on its brand colour stays on it);
     · the mark's box is every pixel that is not that background;
     · an icon that already fills its own box (a rounded square, see-through
       round it or saved on white) is used edge to edge; anything else sits
       at 72% of the square, centred;
     · a mark with no background of its own gets one it reads on — white
       under a dark mark, near-black under a light one;
     · a picture whose corners disagree (a photo) is simply cut square
       from the middle.

   Out comes a 256 px PNG.
   ============================================================ */

const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** @returns {Promise<Blob>} a square PNG */
export async function squareLogo(file, { size = 256 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    let w = img.naturalWidth || 512, h = img.naturalHeight || 512;
    const k = Math.min(1, 1024 / Math.max(w, h));
    w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    const sg = src.getContext('2d', { willReadFrequently: true });
    sg.drawImage(img, 0, 0, w, h);
    const d = sg.getImageData(0, 0, w, h).data;
    const px = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };

    const out = document.createElement('canvas');
    out.width = out.height = size;
    const g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';

    /* the background, from the corners */
    const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
    const clear = corners.filter(c => c[3] < 24).length >= 3;
    const solid = corners.filter(c => c[3] >= 24);
    const agree = solid.length && solid.every(c => dist(c, solid[0]) < 48);
    if (!clear && !agree) {
      /* a picture: cut a square from its middle */
      const s = Math.min(w, h);
      g.drawImage(src, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
      return await toBlob(out);
    }
    const bg = clear ? null : solid.reduce((m, c) => [m[0] + c[0] / solid.length, m[1] + c[1] / solid.length, m[2] + c[2] / solid.length], [0, 0, 0]);

    /* the mark's box, and what it is made of */
    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0, lsum = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, a = d[i + 3];
        if (a < 24) continue;
        if (bg && dist([d[i], d[i + 1], d[i + 2]], bg) < 48) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        n++; lsum += lum(d[i], d[i + 1], d[i + 2]);
      }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;

    /* an icon that fills its own box goes edge to edge — on a see-through
       background, or an app icon saved on white that fills most of the picture */
    let filled = 0;
    for (let y = y0; y < y0 + bh; y += 2) for (let x = x0; x < x0 + bw; x += 2) {
      const i = (y * w + x) * 4;
      if (d[i + 3] >= 24 && (!bg || dist([d[i], d[i + 1], d[i + 2]], bg) >= 48)) filled++;
    }
    const cover = filled / (Math.ceil(bh / 2) * Math.ceil(bw / 2));
    const square = bw / bh > 0.8 && bw / bh < 1.25;
    const icon = square && cover > 0.82 && (clear || (bw / w > 0.8 && bh / h > 0.8));

    if (bg && !icon) { g.fillStyle = `rgb(${bg.map(Math.round).join(',')})`; g.fillRect(0, 0, size, size); }
    else if (!bg && !icon) { g.fillStyle = (n ? lsum / n : 0) < 0.5 ? '#FFFFFF' : '#121317'; g.fillRect(0, 0, size, size); }

    const fill = icon ? 1 : 0.72;
    const scale = (size * fill) / Math.max(bw, bh);
    const dw = bw * scale, dh = bh * scale;
    g.drawImage(src, x0, y0, bw, bh, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return await toBlob(out);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = c => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('That picture could not be saved'))), 'image/png'));
