/* ============================================================
   share/encode.js — the card as an MP4, one frame at a time.

   Recording the screen as it plays (MediaRecorder) loses frames the moment
   the computer is busy, and a dropped frame is a stutter in the file. So
   the video is made the slow, sure way: each frame is drawn on its own —
   the clip moved to that exact moment first — and handed to the browser's
   H.264 encoder (WebCodecs). The clip's sound is decoded once, cut to the
   trim, set to the chosen level, faded at the ends and encoded as AAC
   (Opus where AAC is not offered). share/mp4.js boxes the two up.

   Returns null when this window has no WebCodecs or no H.264 encoder; the
   sheet then falls back to recording.
   ============================================================ */
import { mp4Writer } from './mp4.js';

export const canEncode = () => typeof VideoEncoder === 'function' && typeof VideoFrame === 'function';

async function videoConfig(w, h, big) {
  const base = { width: w, height: h, framerate: 30, bitrate: big ? 40e6 : 12e6, avc: { format: 'avc' }, latencyMode: 'realtime' };
  const codecs = big ? ['avc1.640033', 'avc1.4D0033', 'avc1.420033'] : ['avc1.640028', 'avc1.4D0028', 'avc1.42002A'];
  for (const codec of codecs) {
    for (const extra of [{ hardwareAcceleration: 'prefer-hardware' }, {}]) {
      const cfg = { ...base, ...extra, codec };
      try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch { /* next */ }
    }
  }
  return null;
}
async function audioConfig(channels) {
  if (typeof AudioEncoder !== 'function') return null;
  for (const codec of ['mp4a.40.2', 'opus']) {
    const cfg = { codec, sampleRate: 48000, numberOfChannels: channels, bitrate: 192000 };
    try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return cfg; } catch { /* next */ }
  }
  return null;
}

/**
 * @param {object} o
 * @param {number} o.w, o.h, o.length (seconds), o.fps
 * @param {(t: number) => Promise<CanvasImageSource>} o.frame   draws the frame at t, returns the canvas
 * @param {(each: (t: number) => Promise<void>, total: number) => Promise<void>} [o.drive]
 *        walks the frames in order, calling each(t) — by default a plain loop;
 *        the sheet's own plays the clip and catches every frame as it comes
 * @param {{ blob: Blob, start: number, len: number, gain: number }|null} o.sound
 * @param {(p: number) => void} o.progress
 * @param {() => boolean} o.stopped
 * @returns {Promise<Blob|null>}
 */
export async function encodeMp4({ w, h, length, fps = 30, big = false, frame, drive, sound, progress = () => {}, stopped = () => false }) {
  if (!canEncode()) return null;
  const vcfg = await videoConfig(w, h, big);
  if (!vcfg) return null;

  /* ---------- sound first: decode, cut, level, fade ---------- */
  let pcm = null, acfg = null;
  if (sound?.blob && sound.gain > 0) {
    try {
      const buf = await sound.blob.arrayBuffer();
      const ctx = new OfflineAudioContext(2, 48000, 48000);
      const all = await ctx.decodeAudioData(buf);
      const ch = Math.min(2, all.numberOfChannels);
      acfg = await audioConfig(ch);
      if (acfg) {
        const a = Math.floor((sound.start || 0) * 48000), n = Math.floor(length * 48000);
        /* the trim, looped when the card runs longer than it */
        const span = Math.max(1, Math.min(Math.floor((sound.len || length) * 48000), all.length - a));
        pcm = [];
        for (let c = 0; c < ch; c++) {
          const src = all.getChannelData(c), out = new Float32Array(n);
          for (let o = 0; o < n; o += span) out.set(src.subarray(a, a + Math.min(span, n - o)), o);
          const fin = Math.min(n, 2400), fout = Math.min(n, 14400);   // 50 ms in, 300 ms out
          for (let i = 0; i < n; i++) {
            let k = sound.gain;
            if (i < fin) k *= i / fin;
            if (i > n - fout) k *= (n - i) / fout;
            out[i] *= k;
          }
          pcm.push(out);
        }
      }
    } catch { pcm = null; acfg = null; }     // a clip with no sound, or one this window cannot decode
  }

  /* ---------- the encoders ---------- */
  const vchunks = [];
  let avcC = null, fail = null;
  const ve = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
      if (meta?.decoderConfig?.description && !avcC) avcC = new Uint8Array(meta.decoderConfig.description);
      vchunks.push({ data, ts: chunk.timestamp, key: chunk.type === 'key' });
    },
    error: e => { fail = e; },
  });
  ve.configure(vcfg);

  const achunks = [];
  let asc = null, preSkip = 312;
  if (pcm && acfg) {
    const ae = new AudioEncoder({
      output: (chunk, meta) => {
        const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        const d = meta?.decoderConfig?.description;
        if (d && !asc) {
          asc = new Uint8Array(d);
          if (acfg.codec === 'opus' && asc.length >= 12 && String.fromCharCode(...asc.slice(0, 8)) === 'OpusHead') preSkip = asc[10] | (asc[11] << 8);
        }
        achunks.push({ data, dur: Math.round((chunk.duration || 0) * 48000 / 1e6) });
      },
      error: e => { fail = e; },
    });
    ae.configure(acfg);
    const step = 4800, n = pcm[0].length, ch = pcm.length;
    for (let i = 0; i < n; i += step) {
      const m = Math.min(step, n - i);
      const data = new Float32Array(m * ch);
      for (let c = 0; c < ch; c++) data.set(pcm[c].subarray(i, i + m), c * m);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: m, numberOfChannels: ch, timestamp: Math.round(i / 48000 * 1e6), data });
      ae.encode(ad); ad.close();
    }
    await ae.flush(); ae.close();
    /* a chunk that did not say how long it was is a standard frame */
    const std = acfg.codec === 'opus' ? 960 : 1024;
    for (const c of achunks) if (!c.dur) c.dur = std;
  }

  /* ---------- the frames ---------- */
  const total = Math.max(1, Math.round(length * fps));
  let i = 0;
  const STOP = new Error('stopped');
  const each = async t => {
    if (stopped()) throw STOP;
    if (fail) throw fail;
    const src = await frame(t);
    const vf = new VideoFrame(src, { timestamp: Math.round(i / fps * 1e6), duration: Math.round(1e6 / fps) });
    ve.encode(vf, { keyFrame: i % (fps * 2) === 0 });
    vf.close();
    i++;
    while (ve.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
    progress(i / total);
  };
  try {
    if (drive) await drive(each, total);
    else for (let k = 0; k < total; k++) await each(k / fps);
  } catch (e) {
    try { ve.close(); } catch { /* fine */ }
    if (e === STOP) return null;
    throw e;
  }
  await ve.flush(); ve.close();
  if (fail) throw fail;
  if (!avcC || !vchunks.length) return null;

  const mux = mp4Writer({
    video: { width: w, height: h, fps, avcC },
    audio: achunks.length ? { codec: acfg.codec === 'opus' ? 'opus' : 'aac', sampleRate: 48000, channels: pcm.length, asc, preSkip } : null,
  });
  for (const c of vchunks) mux.addVideo(c.data, c.ts, c.key);
  for (const c of achunks) mux.addAudio(c.data, c.dur);
  return new Blob([mux.finish()], { type: 'video/mp4' });
}
