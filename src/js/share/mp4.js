/* ============================================================
   share/mp4.js — an MP4 file, put together here.

   The video is H.264 from the browser's own encoder (WebCodecs), the sound
   AAC or Opus; this only boxes them up. Everything is in memory by the end,
   so the file is written in one go with the index (moov) first — a file
   that starts playing before it has finished downloading.

   Each sample is its own chunk: a longer index, a simpler file, and
   nothing a player cares about.
   ============================================================ */

/**
 * @param {object} o
 * @param {object} o.video  { width, height, fps, avcC: Uint8Array }
 * @param {object} [o.audio] { codec: 'aac'|'opus', sampleRate, channels, asc?: Uint8Array, preSkip? }
 */
export function mp4Writer({ video, audio = null }) {
  const vs = [];    // { data, pts (in 1/fps units × 1000), key }
  const as = [];    // { data, dur (samples) }
  return {
    addVideo(data, ptsUs, key) { vs.push({ data, pts: ptsUs, key: !!key }); },
    addAudio(data, durSamples) { as.push({ data, dur: durSamples }); },
    get videoCount() { return vs.length; },
    finish() { return build(video, audio, vs, as); },
  };
}

/* ---------- byte helpers ---------- */
const u8 = n => [n & 255];
const u16 = n => [(n >> 8) & 255, n & 255];
const u24 = n => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const str = s => [...s].map(ch => ch.charCodeAt(0) & 255);
function cat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const bytes = a => (a instanceof Uint8Array ? a : Uint8Array.from(a));
function box(type, ...parts) {
  const body = cat(parts.map(bytes));
  return cat([bytes([...u32(body.length + 8), ...str(type)]), body]);
}
const full = (type, version, flags, ...parts) => box(type, [version, ...u24(flags)], ...parts);
const MATRIX = [...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];

/* ---------- the file ---------- */
function build(video, audio, vs, as) {
  const fps = video.fps || 30;
  const vScale = fps * 1000, vDur = 1000;              // each frame is 1000 ticks
  const vTotal = vs.length * vDur;
  const aScale = audio ? (audio.codec === 'opus' ? 48000 : audio.sampleRate) : 1;
  const aTotal = as.reduce((s, x) => s + x.dur, 0);
  const movieMs = Math.max(Math.round(vTotal / vScale * 1000), audio ? Math.round(aTotal / aScale * 1000) : 0);

  const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
  const moovFor = (vOff, aOff) => box('moov',
    full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(movieMs), u32(0x00010000), u16(0x0100), new Array(10).fill(0),
      MATRIX, new Array(24).fill(0), u32(audio && as.length ? 3 : 2)),
    videoTrak(video, vs, vScale, vDur, movieMs, vOff),
    audio && as.length ? audioTrak(audio, as, aScale, movieMs, aOff) : new Uint8Array(0));

  /* the index's size does not depend on the offsets' values, so measure it once */
  const probe = moovFor(vs.map(() => 0), as.map(() => 0));
  let at = ftyp.length + probe.length + 8;
  const vOff = vs.map(s => { const o = at; at += s.data.length; return o; });
  const aOff = as.map(s => { const o = at; at += s.data.length; return o; });
  const moov = moovFor(vOff, aOff);
  const mdatLen = at - ftyp.length - moov.length;
  const mdat = cat([bytes([...u32(mdatLen), ...str('mdat')]), ...vs.map(s => s.data), ...as.map(s => s.data)]);
  return cat([ftyp, moov, mdat]);
}

function tkhd(id, durMs, w, h, isAudio) {
  return full('tkhd', 0, 3, u32(0), u32(0), u32(id), u32(0), u32(durMs), new Array(8).fill(0),
    u16(0), u16(isAudio ? 1 : 0), u16(isAudio ? 0x0100 : 0), u16(0), MATRIX, u32(w << 16), u32(h << 16));
}
const mdhd = (scale, dur) => full('mdhd', 0, 0, u32(0), u32(0), u32(scale), u32(dur), u16(0x55C4), u16(0));
const hdlr = (type, name) => full('hdlr', 0, 0, u32(0), str(type), new Array(12).fill(0), str(name), [0]);
const dinf = () => box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
const stsc1 = () => full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1));
const stsz = list => full('stsz', 0, 0, u32(0), u32(list.length), ...list.map(s => u32(s.data.length)));
const stco = offs => full('stco', 0, 0, u32(offs.length), ...offs.map(o => u32(o)));
/* runs of equal durations, as stts wants them */
function stts(durs) {
  const runs = [];
  for (const d of durs) { const last = runs[runs.length - 1]; if (last && last[1] === d) last[0]++; else runs.push([1, d]); }
  return full('stts', 0, 0, u32(runs.length), ...runs.map(([n, d]) => [...u32(n), ...u32(d)]));
}

function videoTrak(v, vs, scale, frameDur, movieMs, offs) {
  const name = new Array(32).fill(0);
  const label = str('Laminar');
  name[0] = label.length; label.forEach((c, i) => { name[i + 1] = c; });
  const avc1 = box('avc1', new Array(6).fill(0), u16(1), u16(0), u16(0), new Array(12).fill(0),
    u16(v.width), u16(v.height), u32(0x00480000), u32(0x00480000), u32(0), u16(1), name, u16(0x0018), u16(0xFFFF),
    box('avcC', v.avcC));
  /* presentation times in frame ticks; a B-frame would need ctts — written only if the encoder used them */
  const pts = vs.map(s => Math.round(s.pts / 1e6 * scale));
  const dts = vs.map((_, i) => i * frameDur);
  const offsets = pts.map((p, i) => p - dts[i]);
  const needCtts = offsets.some(o => o !== 0);
  const keys = vs.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
  const stbl = box('stbl',
    full('stsd', 0, 0, u32(1), avc1),
    stts(vs.map(() => frameDur)),
    needCtts ? full('ctts', 1, 0, u32(offsets.length), ...offsets.map(o => [...u32(1), ...u32(o)])) : new Uint8Array(0),
    keys.length && keys.length < vs.length ? full('stss', 0, 0, u32(keys.length), ...keys.map(k => u32(k))) : new Uint8Array(0),
    stsc1(), stsz(vs), stco(offs));
  return box('trak',
    tkhd(1, movieMs, v.width, v.height, false),
    box('mdia', mdhd(scale, vs.length * frameDur), hdlr('vide', 'VideoHandler'),
      box('minf', full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)), dinf(), stbl)));
}

function audioTrak(a, as, scale, movieMs, offs) {
  const ch = a.channels || 2;
  const head = [...new Array(6).fill(0), ...u16(1), ...new Array(8).fill(0), ...u16(ch), ...u16(16), ...u16(0), ...u16(0), ...u32(scale << 16 >>> 0)];
  let entry;
  if (a.codec === 'opus') {
    entry = box('Opus', head, box('dOps', [0, ch, ...u16(a.preSkip ?? 312), ...u32(a.sampleRate || 48000), ...u16(0), 0]));
  } else {
    const asc = a.asc && a.asc.length ? [...a.asc] : ascFor(a.sampleRate, ch);
    const dsi = [0x05, asc.length, ...asc];
    const dcd = [0x04, 13 + dsi.length, 0x40, 0x15, ...u24(0), ...u32(256000), ...u32(192000), ...dsi];
    const sl = [0x06, 1, 0x02];
    const es = [0x03, 3 + dcd.length + sl.length, ...u16(0), 0, ...dcd, ...sl];
    entry = box('mp4a', head, full('esds', 0, 0, es));
  }
  const stbl = box('stbl', full('stsd', 0, 0, u32(1), entry), stts(as.map(s => s.dur)), stsc1(), stsz(as), stco(offs));
  return box('trak',
    tkhd(2, movieMs, 0, 0, true),
    box('mdia', mdhd(scale, as.reduce((s, x) => s + x.dur, 0)), hdlr('soun', 'SoundHandler'),
      box('minf', full('smhd', 0, 0, u16(0), u16(0)), dinf(), stbl)));
}

/* AAC-LC's two-byte AudioSpecificConfig, for when the encoder did not give one */
function ascFor(rate, ch) {
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  const fi = Math.max(0, rates.indexOf(rate));
  return [(2 << 3) | (fi >> 1), ((fi & 1) << 7) | (ch << 3)];
}
