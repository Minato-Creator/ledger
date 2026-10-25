/* ============================================================
   clip.js — small things done to a video file: how long it runs, its best
   still, a strip of stills, moving it to a moment. Used by the share sheet
   (views/share.js) and the backgrounds (views/appearance.js).
   ============================================================ */

export function seek(v, t) {
  return new Promise(res => {
    const target = Math.max(0, Math.min((v.duration || t) - 0.05, t));
    if (Math.abs(v.currentTime - target) < 0.01 && v.readyState >= 2) return res();
    const done = () => { v.removeEventListener('seeked', done); clearTimeout(timer); res(); };
    const timer = setTimeout(done, 1500);
    v.addEventListener('seeked', done);
    v.currentTime = target;
  });
}

/** How long a clip runs, and its best still — never a black one. */
export async function probeVideo(blob) {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url;
  try {
    const ok = await new Promise(res => {
      v.onloadeddata = () => res(true); v.onerror = () => res(false);
      setTimeout(() => res(v.readyState >= 2), 10000);
    });
    if (!ok || !Number.isFinite(v.duration)) return null;
    const dur = v.duration;
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 136;
    const g = cv.getContext('2d', { willReadFrequently: true });
    let best = null, bestScore = -1;
    for (const f of [0.12, 0.25, 0.4, 0.55, 0.7, 0.85]) {
      await seek(v, dur * f);
      cover(g, v, 240, 136);
      const s = score(g.getImageData(0, 0, 240, 136).data);
      if (s > bestScore) { bestScore = s; best = cv.toDataURL('image/jpeg', 0.75); }
    }
    return { dur: Math.round(dur * 100) / 100, thumb: best };
  } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); }
}

export async function probeImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 136;
    cover(cv.getContext('2d'), img, 240, 136);
    return { dur: 0, thumb: cv.toDataURL('image/jpeg', 0.75) };
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

/* A still's interest: contrast and light, so a black or flat frame loses. */
export function score(d) {
  let sum = 0, sq = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += y; sq += y * y; n++; }
  const mean = sum / n, sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
  return mean < 18 ? sd * 0.2 : sd + Math.min(mean, 160) * 0.25;
}

export function cover(g, src, w, h) {
  const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight;
  const k = Math.max(w / sw, h / sh);
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.drawImage(src, (w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k);
}

/* evenly spaced stills along a clip, for the trim strip */
export async function stills(blob, count, w, h) {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url;
  const out = [];
  try {
    const ok = await new Promise(res => { v.onloadeddata = () => res(true); v.onerror = () => res(false); setTimeout(() => res(v.readyState >= 2), 10000); });
    if (!ok) return out;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    for (let i = 0; i < count; i++) {
      await seek(v, v.duration * (i + 0.5) / count);
      cover(g, v, w, h);
      out.push(cv.toDataURL('image/jpeg', 0.6));
    }
  } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); }
  return out;
}

/** A name from a file's name: wall-street.mp4 → Wall Street. */
/* The wallpaper site a download is named after (mylivewallpapers-com-…,
   …-moewalls-com, or "Mylivewallpapers.C" once cut short) is not its name. */
const SITE = /(^|[\s_.-])(www[\s_.-])?[a-z0-9]+(?:[\s_-](?:com|net|org|io)|\.(?:com|net|org|io|co|c))(?=$|[\s_.-])/gi;
export const tidyName = name => String(name || '').replace(SITE, ' ').replace(/\s+/g, ' ').trim();
export const nameFrom = file => tidyName(String(file).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))
  .replace(/\.+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  .replace(/\b([a-z])/g, (_, a) => a.toUpperCase()) || 'Clip';
