/* Sharing a trade: the sheet, the card, the candles, your clips, and the
   three files it makes.

   OANDA is the shared stand-in (fixtures/oanda-mock.mjs). The clip is a
   four-second test pattern with a tone under it (fixtures/share-clip.mp4).
   Downloads are caught by Playwright and opened again here: a PNG of the
   right size, a GIF that is a GIF, a video with something in it. */
import pw from 'playwright';
import fs from 'node:fs';
import { ACCT, PB } from '../fixtures/ghost-fixture.mjs';
import { KEY, SERIES, rowsOf, oandaRoute } from '../fixtures/oanda-mock.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const PORT = process.env.QUIRE_PORT || 8777;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

/* ---------- trades on the fake prices (Perth is UTC+8) ---------- */
const perth = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+08:00`) / 1000;
const priceAt = (inst, s) => rowsOf(inst, s, s + 60)[0]?.[1];
const G_IN = priceAt('XAU_USD', perth('2026-09-15', '15:35'));
const G_OUT = priceAt('XAU_USD', perth('2026-09-15', '17:10'));
const N_IN = priceAt('NAS100_USD', perth('2026-09-16', '21:40'));
const base = { accountId: 'acc_1', riskPercent: 1, mode: 'live', sessionId: 'ses_l', setupId: 's_fvg', tagIds: [], notes: '' };
const TR = [
  { ...base, id: 'g1', pair: 'XAUUSD', side: 'buy', date: '2026-09-15', timeOpen: '15:35', timeClose: '17:10', status: 'closed',
    entryPrice: G_IN, stopLoss: +(G_IN - 4.5).toFixed(2), takeProfit: +(G_IN + 13.5).toFixed(2), exitPrice: G_OUT,
    exitReason: 'manual', netResult: 1234.5, size: 1, sizeUnit: 'lots', execTf: '5m' },
  { ...base, id: 'n1', pair: 'NAS100', side: 'sell', date: '2026-09-16', timeOpen: '21:40', timeClose: '22:55', status: 'closed', sessionId: 'ses_n',
    entryPrice: N_IN, stopLoss: +(N_IN + 25).toFixed(1), takeProfit: +(N_IN - 75).toFixed(1), exitPrice: +(N_IN + 25).toFixed(1),
    exitReason: 'sl', netResult: -1000, size: 2, sizeUnit: 'contracts' },
  { ...base, id: 'x1', pair: 'XAUUSD', side: 'buy', date: '2026-09-15', status: 'closed', netResult: 300 },        // no times
  { ...base, id: 'c1', pair: 'CORN', side: 'buy', date: '2026-09-15', timeOpen: '10:00', timeClose: '11:00', status: 'closed', netResult: 500 },
  { ...base, id: 'o1', pair: 'XAUUSD', side: 'buy', date: '2026-09-18', timeOpen: '09:00', status: 'open', netResult: 0 },
];

const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1440, height: 980 }, timezoneId: 'Australia/Perth', acceptDownloads: true });
const SEEN = [];
await ctx.route(/https:\/\/api-fx(practice|trade)\.oanda\.com\/.*/, oandaRoute(SEEN));
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_|401|net::/.test(m.text())) errs.push(m.text()); });
await p.clock.setFixedTime(new Date('2026-09-18T12:00:00+08:00'));
await p.addInitScript(({ ACCT, TR, PB, KEY }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('quire:setting:oandaKey', KEY);
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', accounts: [ACCT], activeAccountId: 'acc_1', userName: 'Minato Kaze', userColour: '#F4624A' })],
    ['data/trades.json', JSON.stringify({ version: 1, trades: TR })], ['data/playbook.json', JSON.stringify(PB)]]));
}, { ACCT, TR, PB, KEY });
await p.addInitScript(FAKE_FS);
await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
const settle = (ms = 300) => p.waitForTimeout(ms);
const go = async (h, ms = 500) => { await p.evaluate(x => { location.hash = x; }, h); await settle(ms); };
const sh = () => p.evaluate(() => document.querySelector('.sh')?.__share?.state || null);
const accounts = () => p.evaluate(() => JSON.parse(window.__files.get('data/accounts.json') || '{}'));
const shot = async name => { try { await p.screenshot({ path: `${OUT}/share-${name}.png` }); } catch { /* fine */ } };
const ready = () => p.waitForFunction(() => { const s = document.querySelector('.sh')?.__share?.state; return s && s.load !== 'loading'; }, null, { timeout: 8000 }).catch(() => {});
/* how much of the preview is drawn: the share of pixels that are not transparent */
const inked = () => p.evaluate(() => {
  const cv = document.querySelector('.sh-canvas'); if (!cv || !cv.width) return 0;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 64) if (d[i] > 0) n++;
  return n / (d.length / 64);
});
const close = async () => { await p.keyboard.press('Escape'); await settle(400); };

/* ===================== where it is offered ===================== */
console.log('where it is offered');
await go('#/trade/g1', 900);
t('a closed trade has a Share button on its page', await p.locator('.td-share').count() === 1);
await go('#/trade/o1', 600);
t('an open one does not', await p.locator('.td-share').count() === 0);
await go('#/trades', 700);
t('closed rows carry a share icon', await p.locator('.tbl-row .row-share').count() >= 3, String(await p.locator('.tbl-row .row-share').count()));
await p.locator('.tbl-row .row-share').first().click();
await settle(500);
t('…which opens the sheet without leaving the list', await p.locator('.sheet.is-share').count() === 1 && await p.evaluate(() => location.hash) === '#/trades');
await close();

/* ===================== the sheet and the card ===================== */
console.log('the sheet');
await go('#/trade/g1', 900);
await p.click('.td-share');
await ready(); await settle(3800);
let S = await sh();
t('the candles load from OANDA', S?.load === 'ok' && S.bars > 20, JSON.stringify(S));
t('Auto picks a timeframe that fits the trade (95 minutes → 5m)', S?.tf === 5, String(S?.tf));
t('OANDA was asked with the key', SEEN.some(r => r.auth === `Bearer ${KEY}` && /XAU_USD/.test(r.path)));
t('the card is drawn', (await inked()) > 0.9, String(await inked()));
const M = await p.evaluate(() => { const m = document.querySelector('.sh').__share.model(); return { symbol: m.symbol, meta: m.meta, figure: m.figure, stats: m.stats, name: m.name, initials: m.initials, tagline: m.tagline }; });
t('it says what the trade is', M.symbol === 'XAUUSD' && M.meta === 'LONG · SEP 15' && M.figure === '+$1,234.50', JSON.stringify(M));
t('the numbers under it: entry, exit, size, return', JSON.stringify(M.stats.map(x => x[0])) === '["Entry","Exit","Size","Return"]' && M.stats[2][1] === '1 lot', JSON.stringify(M.stats));
t('and who: your name from Settings, the setup and session', M.name === 'Minato Kaze' && M.initials === 'MK' && M.tagline === 'FVG continuation · London', JSON.stringify(M));
await shot('sheet');

/* timeframes */
await p.click('.sh-tf [data-tf="1m"]'); await settle(300);
S = await sh();
t('1m: more candles', S.tf === 1 && S.bars > 100, `${S.tf} ${S.bars}`);
await p.click('.sh-tf [data-tf="15m"]'); await settle(300);
S = await sh();
t('15m: fewer', S.tf === 15 && S.bars < 40, `${S.tf} ${S.bars}`);
t('…and it is remembered', (await accounts()).share?.prefs?.tf === '15m');
await p.click('.sh-tf [data-tf="auto"]'); await settle(300);

/* format */
console.log('format');
await p.click('.sh-tabs [data-tab="format"]'); await settle(300);
await p.click('[data-pref="unit"] [data-v="R"]'); await settle(200);
let fig = await p.evaluate(() => document.querySelector('.sh').__share.model().figure);
t('Show R puts the R up big', /R$/.test(fig), fig);
await p.click('[data-pref="unit"] [data-v="%"]'); await settle(200);
fig = await p.evaluate(() => document.querySelector('.sh').__share.model().figure);
t('Show % puts it as a share of the account', fig === '+1.23%', fig);
await p.click('[data-pref="unit"] [data-v="$"]'); await settle(200);
await p.click('[data-pref="style"] [data-v="line"]'); await settle(200);
t('Style: a line', (await sh()).prefs.style === 'line');
await p.click('[data-pref="style"] [data-v="pnl"]'); await settle(200);
t('P&L only leaves the candles and the numbers off', await p.evaluate(() => document.querySelector('.sh').__share.model().chart === null)
  && await p.locator('[data-pref="stats"].is-dim').count() === 1);
await p.click('[data-pref="style"] [data-v="candles"]'); await settle(200);
await p.click('[data-pref="size"] [data-v="square"]'); await settle(400);
let cs = await p.evaluate(() => { const c = document.querySelector('.sh-canvas'); return c.width / c.height; });
t('Square makes a square card', Math.abs(cs - 1) < 0.02, String(cs));
await p.click('[data-pref="size"] [data-v="portrait"]'); await settle(400);
cs = await p.evaluate(() => { const c = document.querySelector('.sh-canvas'); return c.width / c.height; });
t('Portrait is 9:16', Math.abs(cs - 1080 / 1920) < 0.02, String(cs));
await settle(3600);
await shot('portrait');
await p.click('[data-pref="size"] [data-v="landscape"]'); await settle(300);
t('every choice is kept for next time', (await accounts()).share?.prefs?.size === 'landscape' && (await accounts()).share?.prefs?.style === 'candles');

/* ===================== backgrounds ===================== */
console.log('backgrounds');
await p.click('.sh-tabs [data-tab="background"]'); await settle(300);
t('five made here, to start with', await p.locator('.sh-tile[data-bg^="original:"]').count() === 5);
await p.click('.sh-tile[data-bg="original:aurora"]'); await settle(400);
t('choosing one', (await sh()).bg === 'original:aurora' && await p.locator('.sh-tile.is-on[data-bg="original:aurora"]').count() === 1);
await p.click('.sh-tile[data-bg="original:paper"]'); await settle(3800);
await shot('paper');

await p.setInputFiles('.sh-pane input[type=file]', [HERE + '../fixtures/share-clip.mp4']);
await p.waitForFunction(() => (document.querySelector('.sh')?.__share?.state?.bg || '').startsWith('clip_'), null, { timeout: 15000 }).catch(() => {});
await settle(800);
let A = await accounts();
const clip = A.share?.clips?.[0];
t('a clip of your own is added', !!clip && clip.kind === 'video' && /^screenshots\/share-[a-z0-9]+\.mp4$/.test(clip.file), JSON.stringify(clip && { ...clip, thumb: !!clip.thumb }));
t('…named from its file, with its length and a still', clip?.name === 'Share Clip' && Math.abs(clip.dur - 4) < 0.2 && /^data:image\/jpeg/.test(clip.thumb || ''));
t('…kept in the vault folder', await p.evaluate(f => window.__files.get(f) instanceof Blob, clip?.file));
t('…and chosen', (await sh()).bg === clip?.id && await p.locator(`.sh-tile.is-on[data-bg="${clip?.id}"]`).count() === 1);
t('a backup of the vault carries it', await p.evaluate(async f => { const m = await import('/js/store.js'); return m.store.shotNames().includes(f); }, clip?.file));
t('the clip plays behind the card', await p.evaluate(() => { const v = document.querySelector('.sh').__share.model().bg.el; return !!v && v.tagName === 'VIDEO' && v.readyState >= 2; }));
await settle(1500);
await shot('clip');

/* adjust */
console.log('adjust');
await p.click('.sh-tabs [data-tab="adjust"]'); await settle(500);
t('a clip can be trimmed, moved, dimmed and turned up', await p.locator('.sh-trim').count() === 1 && await p.locator('.sh-range').count() === 2);
const tb = await p.locator('.sh-trim').boundingBox();
/* the window starts as the whole clip: pull its end in to half, then slide it along */
await p.mouse.move(tb.x + tb.width - 4, tb.y + tb.height / 2);
await p.mouse.down(); await p.mouse.move(tb.x + tb.width * 0.5, tb.y + tb.height / 2, { steps: 5 }); await p.mouse.up();
await settle(300);
A = await accounts();
t('pulling in the end shortens the clip', Math.abs(A.share.clips[0].len - 2) < 0.15 && A.share.clips[0].start === 0, JSON.stringify([A.share.clips[0].start, A.share.clips[0].len]));
await p.mouse.move(tb.x + tb.width * 0.25, tb.y + tb.height / 2);
await p.mouse.down(); await p.mouse.move(tb.x + tb.width * 0.5, tb.y + tb.height / 2, { steps: 5 }); await p.mouse.up();
await settle(400);
A = await accounts();
t('sliding the window moves the trim, and it is kept', Math.abs(A.share.clips[0].start - 1) < 0.15 && Math.abs(A.share.clips[0].len - 2) < 0.15, JSON.stringify([A.share.clips[0].start, A.share.clips[0].len]));
t('…and says where it is', /0:01\.\d to 0:03\.\d · 2\.\ds/.test(await p.locator('.sh-trimk').innerText()), await p.locator('.sh-trimk').innerText());
await p.evaluate(() => { const r = document.querySelectorAll('.sh-range')[0]; r.value = '0.6'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
await settle(300);
t('dim is kept with the clip', Math.abs((await accounts()).share.clips[0].dim - 0.6) < 1e-9);
const cb = await p.locator('.sh-canvas').boundingBox();
await p.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await p.mouse.down();
await p.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2 + 30, { steps: 5 }); await p.mouse.up();
await settle(300);
/* a 16:9 clip on a wider card is cropped top and bottom, so it moves up and down */
t('dragging the card moves the clip behind it', (await accounts()).share.clips[0].fy !== 0.5 && (await accounts()).share.clips[0].fx === 0.5, JSON.stringify([(await accounts()).share.clips[0].fx, (await accounts()).share.clips[0].fy]));
await p.click('.sh-center'); await settle(200);
t('Center puts it back', (await accounts()).share.clips[0].fy === 0.5);

/* ===================== out ===================== */
console.log('out');
const grab = async (sel, ms) => {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: ms }), p.click(sel)]);
  const path = `${OUT}/share-out-${dl.suggestedFilename()}`;
  await dl.saveAs(path);
  return { name: dl.suggestedFilename(), path, bytes: fs.readFileSync(path) };
};
const png = await grab('.sh-out[data-out="photo"]', 10000);
const pw2 = png.bytes.readUInt32BE(16), ph2 = png.bytes.readUInt32BE(20);
t('Photo: a PNG at full size', png.name === 'XAUUSD-2026-09-15.png' && pw2 === 1920 && ph2 === 1008, `${png.name} ${pw2}×${ph2}`);

const gif = await grab('.sh-out[data-out="gif"]', 60000);
const gw = gif.bytes.readUInt16LE(6), gh = gif.bytes.readUInt16LE(8);
const frames = (() => { let n = 0; const B = gif.bytes; for (let i = 0; i < B.length - 3; i++) if (B[i] === 0x21 && B[i + 1] === 0xF9 && B[i + 2] === 4) n++; return n; })();
t('GIF: a GIF, 720 wide, animated', gif.bytes.slice(0, 6).toString() === 'GIF89a' && gw === 720 && gh === 378 && frames > 30 && gif.bytes[gif.bytes.length - 1] === 0x3B,
  `${gw}×${gh}, ${frames} frames, ${gif.bytes.length} bytes`);

/* the recording runs as long as the trimmed clip: two seconds */
const vid = await grab('.sh-out[data-out="video"]', 40000);
const isMp4 = vid.bytes.slice(4, 8).toString() === 'ftyp', isWebm = vid.bytes.readUInt32BE(0) === 0x1A45DFA3;
t('Video: an MP4 (or WebM where MP4 cannot be written) with something in it', (isMp4 || isWebm) && vid.bytes.length > 20000, `${vid.name} ${vid.bytes.length} bytes`);
fs.writeFileSync(`${OUT}/share-video-path.txt`, vid.path);

/* ===================== when there are no candles ===================== */
console.log('without candles');
await close();
await go('#/trade/x1', 800);
await p.click('.td-share'); await ready(); await settle(300);
t('a trade with no times says what to add', /entry and exit times/.test(await p.locator('.sh-tfnote').innerText()), await p.locator('.sh-tfnote').innerText());
t('…and the card is still drawn', (await inked()) > 0.9);
await close();
await go('#/trade/c1', 800);
await p.click('.td-share'); await ready(); await settle(300);
t('an instrument OANDA does not have says so', /no chart for CORN/.test(await p.locator('.sh-tfnote').innerText()), await p.locator('.sh-tfnote').innerText());
await close();
await p.evaluate(() => localStorage.removeItem('quire:setting:oandaKey'));
await go('#/trade/n1', 800);
await p.click('.td-share'); await ready(); await settle(300);
t('no key: says where to add it', /OANDA key in Settings/.test(await p.locator('.sh-tfnote').innerText()) && await p.locator('.sh-tfnote .sh-link').count() === 1);
await close();

/* ===================== a video: a line, and its sound ===================== */
console.log('a video and its sound');
await go('#/trade/g1', 800);
await p.click('.td-share'); await ready(); await settle(800);
const snd = () => p.evaluate(() => document.querySelector('.sh').__share.sound);
t('on a video the chart is a line unless you say otherwise', await p.evaluate(() => document.querySelector('.sh').__share.model().opts.style) === 'line'
  && (await sh()).prefs.style === 'candles', JSON.stringify((await sh()).prefs.style));
await p.click('.sh-tabs [data-tab="format"]'); await settle(300);
t('…and Format says so', await p.locator('.sh-seg[data-pref="clipStyle"] button.is-on').innerText() === 'Line');
await p.click('.sh-seg[data-pref="clipStyle"] [data-v="candles"]'); await settle(400);
t('choosing Candles on a video is kept for videos', (await accounts()).share.prefs.clipStyle === 'candles'
  && await p.evaluate(() => document.querySelector('.sh').__share.model().opts.style) === 'candles');
await p.click('.sh-seg[data-pref="clipStyle"] [data-v="line"]'); await settle(400);
await p.click('.sh-tabs [data-tab="background"]'); await settle(300);
await p.setInputFiles('.sh-pane input[type=file]', [HERE + '../fixtures/share-clip.mp4']);
await p.waitForFunction(id => { const b = document.querySelector('.sh')?.__share?.state?.bg || ''; return b.startsWith('clip_') && b !== id; }, clip.id, { timeout: 15000 }).catch(() => {});
await settle(800);
const clip2 = (await accounts()).share.clips[1];
t('a second clip is added and chosen', !!clip2 && (await sh()).bg === clip2.id);
await p.click('.sh-sound'); await settle(500);
let S2 = await snd();
t('sound on: the clip on the card is heard', S2.monitor && S2.clips.some(c => c.id === clip2.id && c.playing && !c.muted && c.gain > 0), JSON.stringify(S2));
await p.click(`.sh-tile[data-bg="${clip.id}"]`); await settle(1200);
S2 = await snd();
t('changing clips: the new one is heard straight away', S2.on === clip.id && S2.clips.some(c => c.id === clip.id && c.playing && !c.muted && c.gain > 0), JSON.stringify(S2));
t('…and the old one is silent', S2.clips.filter(c => c.id !== clip.id).every(c => !c.playing || c.gain === 0), JSON.stringify(S2));
await p.click(`.sh-tile[data-bg="${clip2.id}"]`); await settle(1200);
await p.click('.sh-remove'); await settle(150); await p.click('.sh-remove'); await settle(900);
S2 = await snd();
t('removing the clip that is playing stops its sound', !S2.clips.some(c => c.id === clip2.id) && S2.clips.every(c => !c.playing || c.gain === 0), JSON.stringify(S2));
t('…and it is gone from the list and the folder', (await accounts()).share.clips.length === 1 && await p.evaluate(f => !window.__files.has(f), clip2.file));
await p.click(`.sh-tile[data-bg="${clip.id}"]`); await settle(800);
await p.click('.sh-sound'); await settle(200);
await close();

/* ===================== removing a clip ===================== */
console.log('removing');
await p.evaluate(k => localStorage.setItem('quire:setting:oandaKey', k), KEY);
await go('#/trade/g1', 800);
await p.click('.td-share'); await ready(); await settle(600);
await p.click('.sh-tabs [data-tab="background"]'); await settle(300);
await p.click('.sh-remove'); await settle(150); await p.click('.sh-remove'); await settle(700);
A = await accounts();
t('Remove takes it out of the list and the folder', (A.share.clips || []).length === 0 && await p.evaluate(f => !window.__files.has(f), clip?.file));
t('…and the card falls back to one made here', (await sh()).bg.startsWith('original:'));
await close();

/* ===================== a phone ===================== */
console.log('a phone');
await p.setViewportSize({ width: 390, height: 844 });
await go('#/trade/g1', 900);
await p.click('.td-share'); await ready(); await settle(3700);
const fits = await p.evaluate(() => { const c = document.querySelector('.sh-canvas').getBoundingClientRect(), s = document.querySelector('.sheet.is-share').getBoundingClientRect(); return c.left >= s.left && c.right <= s.right + 0.5 && s.width <= innerWidth; });
t('on a phone the card fits the sheet', fits);
await shot('phone');
await close();

t('no console or page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
console.log(`${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
