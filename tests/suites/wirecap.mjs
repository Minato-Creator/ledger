/* Newswire keeps only the 50 newest items. Older ones are deleted, both when
   a fresh fetch is merged in and when a vault saved with more is opened. */
import pw from 'playwright';
import fs from 'node:fs';
import { mergeWire, KEEP_ITEMS } from '../../src/js/wire.js';

const HERE = new URL('.', import.meta.url).pathname;
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

/* 80 items, a minute apart, newest last, all within the last day. */
const now = Date.now();
const item = i => ({ id: 'w' + i, title: 'Headline ' + i, at: new Date(now - (80 - i) * 60000).toISOString(), cat: 'news' });
const many = Array.from({ length: 80 }, (_, i) => item(i));

t('the wire keeps 50', KEEP_ITEMS === 50);
const merged = mergeWire(many.slice(0, 40), many.slice(40));
t('merging a fetch keeps only 50', merged.length === 50, String(merged.length));
t('and they are the newest 50, newest first', merged[0].id === 'w79' && merged[49].id === 'w30', `${merged[0].id} … ${merged[49].id}`);

const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(({ many }) => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark', accounts: [{ id: 'acc_1', name: 'A', currency: 'USD',
      startingBalance: 100000, defaultRiskPercent: 1, color: '#0988F0', openedAt: '2026-09-01', archived: false, weeklyTargetPercent: 0 }], activeAccountId: 'acc_1' })],
    ['data/wire.json', JSON.stringify({ version: 1, fetchedAt: new Date().toISOString(), seenAt: null, items: many })]]));
}, { many });
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
await p.waitForTimeout(500);
const kept = await p.evaluate(async () => { const { store } = await import('/js/store.js'); return store.data.wire.items.map(x => x.id); });
t('a vault saved with 80 is trimmed to 50 on open', kept.length === 50, String(kept.length));
t('keeping the newest', kept[0] === 'w79' && !kept.includes('w29'), `${kept[0]} … ${kept[kept.length - 1]}`);
t('and the trimmed file is what is on disk', await p.evaluate(() => JSON.parse(window.__files.get('data/wire.json')).items.length) === 50);
t('no page errors', errs.length === 0, errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
