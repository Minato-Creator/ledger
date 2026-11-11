/* Journal → Notes (11 Nov).

   The list (titles and the start of each note), and a note itself: typing,
   the toolbar (headings, size, bold and the rest, text colour, highlight,
   lists, divider), links that open, pictures that float in the text and can
   be dragged, sized and taken out, a TradingView snapshot link turned into
   its chart, and what is kept: clean html with classes and no styles, the
   words for the list and search, the pictures it holds. An empty note is let
   go; a picture taken out is tidied away when the note is left. */
import pw from 'playwright';
import fs from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const FIX = HERE + '../fixtures';
const OUT = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs', 'utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
const PNG = fs.readFileSync(FIX + '/chart-htf.png').toString('base64');

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const b = await pw.chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const SNAPS = [];
await ctx.route(/^https:\/\/s3\.tradingview\.com\/snapshots\/.*/, r => {
  SNAPS.push(r.request().url());
  return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: Buffer.from(PNG, 'base64') });
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(() => {
  if (localStorage.getItem('fakefs')) return;
  localStorage.setItem('fakeroot', 'Vault');
  localStorage.setItem('fakefs', JSON.stringify([['data/accounts.json', JSON.stringify({ version: 2, displayUnit: '$', theme: 'dark',
    accounts: [{ id: 'acc_1', name: 'Funded', currency: 'USD', startingBalance: 100000, defaultRiskPercent: 1, color: '#0988F0',
      openedAt: '2026-09-01', archived: false, weeklyTargetPercent: 0 }], activeAccountId: 'acc_1' })]]));
});
await p.addInitScript(FAKE_FS);
await p.addInitScript(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
await p.goto('http://127.0.0.1:8777/index.html#/notes', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.topbar', { timeout: 8000 });
await p.waitForTimeout(300);

const html = () => p.evaluate(() => document.querySelector('.ne-body').innerHTML);
const kept = () => p.evaluate(() => JSON.parse(window.__files.get('data/notes.json') || '{"notes":[]}'));
const settle = (ms = 900) => p.waitForTimeout(ms);
const choose = w => p.evaluate(w => {
  const tw = document.createTreeWalker(document.querySelector('.ne-body'), NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) { const i = n.data.indexOf(w); if (i >= 0) { getSelection().setBaseAndExtent(n, i, n, i + w.length); return true; } }
  return false;
}, w);
const caretAtEnd = () => p.evaluate(() => {
  const b = document.querySelector('.ne-body'); b.focus();
  const r = document.createRange(); r.selectNodeContents(b.lastElementChild || b); r.collapse(false);
  getSelection().removeAllRanges(); getSelection().addRange(r);
});
const tool = label => p.click(`.ne-tb[aria-label^="${label}"]`);
const copyPicture = () => p.evaluate(async b64 => {
  const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bin], { type: 'image/png' }) })]);
}, PNG);

/* ---------- the list, empty ---------- */
t('Journal has a Notes tab', await p.locator('.subnav >> text=Notes').count() > 0 || await p.locator('a[href="#/notes"]').count() > 0);
t('no notes yet: says so', (await p.textContent('.nt-empty')).includes('No notes yet'));

/* ---------- a new note ---------- */
await p.click('.nt-new');
await p.waitForSelector('.ne-body');
await p.waitForTimeout(250);
t('New note opens it, with the caret in the title', await p.evaluate(() => document.activeElement?.classList.contains('ne-title') && /^#\/notes\/note_/.test(location.hash)));
await p.keyboard.type('Red folder days');
await p.keyboard.press('Enter');
t('Enter in the title goes on to the writing', await p.evaluate(() => document.activeElement?.classList.contains('ne-body')));
/* the toolbar is there only while writing (11 Nov) */
const toolbar = () => p.evaluate(() => { const t = document.querySelector('.ne-tools-in'), st = getComputedStyle(t); return { shown: document.querySelector('.ne-tools').classList.contains('is-shown'), vis: st.visibility, pe: st.pointerEvents }; });
await p.waitForTimeout(350);
let tb = await toolbar();
t('writing: the toolbar is there', tb.shown && tb.vis === 'visible' && tb.pe === 'auto', JSON.stringify(tb));
await p.keyboard.type('No new trades fifteen minutes either side of NFP, CPI or FOMC.');
await p.keyboard.press('Enter');
await p.keyboard.type('## What to do instead');
await p.keyboard.press('Enter');
await p.keyboard.type('Move the stop to break-even before the number. Times are on www.forexfactory.com/calendar every week. ');
await p.keyboard.press('Enter');
await p.keyboard.type('- Check the calendar every morning');
await p.keyboard.press('Enter');
await p.keyboard.type('Mark the red folders');
await p.keyboard.press('Enter'); await p.keyboard.press('Enter');
await p.keyboard.type('1. First the number');
await p.keyboard.press('Enter'); await p.keyboard.press('Enter');
await p.keyboard.type('## After the number');
await p.keyboard.press('Enter');
await p.keyboard.type('Wait for the first 5m candle to close.');
let h = await html();
t('"## " makes a Section heading', (h.match(/<h2>/g) || []).length === 2, h.slice(0, 200));
t('"- " makes a bulleted list, on its own (not inside a paragraph)', /<\/p><ul><li>Check the calendar every morning<\/li><li>Mark the red folders<\/li><\/ul>/.test(h));
t('"1. " makes a numbered list', /<ol><li>First the number<\/li><\/ol>/.test(h));
t('a web address typed, then a space, becomes a link', /<a href="https:\/\/www\.forexfactory\.com\/calendar">www\.forexfactory\.com\/calendar<\/a>/.test(h));
t('no <p> holds a list or a heading', await p.evaluate(() => !document.querySelector('.ne-body p ul, .ne-body p ol, .ne-body p h2')));
t('Sections are numbered in circles in the margin', await p.evaluate(() => {
  const hs = document.querySelectorAll('.ne-body h2');
  const st = getComputedStyle(hs[0], '::before');
  return /counter\(ne-sec\)/.test(st.content) && st.position === 'absolute' && parseFloat(st.left) < 0 && st.borderRadius === '50%';
}));

/* ---------- the toolbar ---------- */
await choose('fifteen minutes'); await tool('Bold');
await choose('NFP'); await tool('Italic');
await choose('CPI'); await tool('Underline');
await choose('FOMC'); await tool('Strikethrough');
h = await html();
t('Bold, italic, underline, strikethrough', /<b>fifteen minutes<\/b>/.test(h) && /<i>NFP<\/i>/.test(h) && /<u>CPI<\/u>/.test(h) && /<(strike|s)>FOMC<\/(strike|s)>/.test(h), h.slice(0, 260));
t('…and the toolbar shows what the caret is in', await p.evaluate(() => document.querySelector('.ne-tb[aria-label^="Strikethrough"]').classList.contains('is-on')));

await choose('break-even before'); await tool('Text colour'); await p.click('.ne-sw-tc[data-c="yellow"]');
await choose('the number.'); await tool('Text colour'); await p.click('.ne-sw-hl[data-c="green"]');
await choose('Times are on'); await tool('Text size'); await p.click('.ne-pop-size .ne-item:nth-child(3)');
h = await html();
t('text colour is a class, not a style', /<span class="tc-yellow">break-even before<\/span>/.test(h), h.match(/tc-[a-z]+[^<]*/)?.[0]);
t('highlight is a class', /<span class="hl-green">the number\.<\/span>/.test(h));
t('size is a class', /<span class="fs-l">Times are on<\/span>/.test(h));
t('nothing written as an inline style or a <font>', await p.evaluate(() => !document.querySelector('.ne-body font, .ne-body [style]:not(.ne-img)')));
t('the colours really show', await p.evaluate(() => {
  const y = getComputedStyle(document.querySelector('.ne-body .tc-yellow')).color, g = getComputedStyle(document.querySelector('.ne-body .hl-green')).backgroundColor;
  const l = parseFloat(getComputedStyle(document.querySelector('.ne-body .fs-l')).fontSize);
  return y !== getComputedStyle(document.querySelector('.ne-body p')).color && g !== 'rgba(0, 0, 0, 0)' && l > 18;
}));
/* the default colour on part of a coloured run cuts it out, and leaves the rest */
await choose('even'); await tool('Text colour'); await p.click('.ne-sw-tc[data-c="none"]');
h = await html();
t('Default colour on part of a coloured run takes only that part out', /<span class="tc-yellow">break-<\/span>even<span class="tc-yellow"> before<\/span>/.test(h), h.match(/break-.{0,80}/)?.[0]);
await choose('the number.'); await tool('Text colour'); await p.click('.ne-sw-hl[data-c="none"]');
t('No highlight takes the highlight off', !/hl-green/.test(await html()));
await choose('Times'); await tool('Text size'); await p.click('.ne-pop-size .ne-item:nth-child(2)');
h = await html();
t('Normal size on part of a larger run', /Times<span class="fs-l"> are on<\/span>/.test(h), h.match(/Times.{0,60}/)?.[0]);

/* paragraph styles from the menu */
await choose('Wait for the first'); await p.click('.ne-tb[aria-label="Paragraph style"]');
await p.click('.ne-item-h3');
t('Subheading from the paragraph menu', /<h3>Wait for the first 5m candle to close\.<\/h3>/.test(await html()));
t('…and the menu button names it', (await p.textContent('.ne-tb-label')) === 'Subheading');
await p.click('.ne-tb[aria-label="Paragraph style"]'); await p.click('.ne-item-blockquote');
t('Quote', /<blockquote>Wait for the first/.test(await html()));
await p.click('.ne-tb[aria-label="Paragraph style"]'); await p.click('.ne-item-p');
t('Text puts it back', /<p>Wait for the first 5m candle to close\.<\/p>/.test(await html()));
await caretAtEnd(); await tool('Divider');
t('Divider', /<hr>/.test(await html()));

/* ---------- links ---------- */
await choose('NFP'); await p.keyboard.press('Control+K');
await p.waitForSelector('.ne-pop-link input');
t('Ctrl+K opens the link box with the cursor in it', await p.evaluate(() => document.activeElement?.matches('.ne-pop-link input')));
await p.keyboard.type('investing.com/economic-calendar/nonfarm-payrolls-227');
await p.keyboard.press('Enter');
h = await html();
t('the words chosen become the link, https added', /<a href="https:\/\/investing\.com\/economic-calendar\/nonfarm-payrolls-227"><i>NFP<\/i><\/a>/.test(h) || /<i><a href="https:\/\/investing\.com\/economic-calendar\/nonfarm-payrolls-227">NFP<\/a><\/i>/.test(h), h.slice(0, 300));
t('a link is underlined', await p.evaluate(() => getComputedStyle(document.querySelector('.ne-body a')).textDecorationLine.includes('underline')));
await p.click('.ne-body a[href*="investing"]');
t('clicking a link opens it', (await p.evaluate(() => window.__opened)).includes('https://investing.com/economic-calendar/nonfarm-payrolls-227'));
await p.hover('.ne-body a[href*="forexfactory"]');
await p.waitForSelector('.ne-bubble', { timeout: 2000 }).catch(() => {});
t('hovering a link shows where it goes', (await p.textContent('.ne-bubble-host').catch(() => '')) === 'forexfactory.com');
await p.click('.ne-bubble button:has-text("Remove")');
t('…and Remove takes the link off, keeping the words', await p.evaluate(() => !document.querySelector('.ne-body a[href*="forexfactory"]') && document.querySelector('.ne-body').textContent.includes('www.forexfactory.com/calendar')));

/* ---------- pasting ---------- */
await caretAtEnd(); await p.keyboard.press('Enter');
await p.evaluate(() => {
  const dt = new DataTransfer();
  dt.setData('text/html', '<meta charset="utf-8"><style>p{color:red}</style><p style="color:red" onclick="alert(1)">From a <b>page</b> <img src="https://example.com/x.png"><script>window.__bad=1</script><a href="javascript:alert(1)">bad</a> <a href="https://example.com/ok" target="_blank">good</a></p>');
  dt.setData('text/plain', 'From a page bad good');
  document.querySelector('.ne-body').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
h = await html();
t('pasted html is cleaned: no styles, scripts, images or handlers', !/style=|onclick|<script|<img(?! alt="")|javascript:|target=/.test(h.replace(/<span class="ne-img"[\s\S]*?<\/span>/g, '')) && /From a <b>page<\/b>/.test(h) && /<a href="https:\/\/example\.com\/ok">good<\/a>/.test(h), h.slice(-300));
t('…and nothing in it ran', await p.evaluate(() => !window.__bad));
await caretAtEnd(); await p.keyboard.press('Enter');
await p.evaluate(x => navigator.clipboard.writeText(x), 'Gold news: https://www.forexfactory.com/news thanks');
await p.keyboard.press('Control+V'); await p.waitForTimeout(150);
t('pasted words with a web address in them: the address is a link', /<a href="https:\/\/www\.forexfactory\.com\/news">https:\/\/www\.forexfactory\.com\/news<\/a> thanks/.test(await html()));

/* ---------- pictures ---------- */
await caretAtEnd(); await p.keyboard.press('Enter');
await copyPicture();
await p.keyboard.press('Control+V');
await p.waitForSelector('.ne-img img[src^="blob:"]', { timeout: 4000 }).catch(() => {});
let pic = await p.evaluate(() => { const s = document.querySelector('.ne-img'); return s && { shot: s.dataset.shot, side: s.dataset.float, w: s.dataset.w, ce: s.contentEditable }; });
t('a pasted picture goes in the note, saved to screenshots/', !!pic && /^screenshots\/note_[a-z0-9]+-[a-z0-9]+\.(jpg|png)$/.test(pic.shot) && await p.evaluate(n => window.__files.get(n) instanceof Blob, pic.shot), JSON.stringify(pic));
t('…on its own line, the width of the column', pic?.side === 'center' && pic?.w === '100' && pic?.ce === 'false');
await p.keyboard.type('Written under the picture.');
t('the caret carries on after it', /Written under the picture\./.test(await html()));

/* the picture's own bar: wrap left, wrap right */
await p.click('.ne-img img');
t('clicking a picture chooses it, with its bar', await p.locator('.ne-img.is-on .ne-imgbar').count() === 1);
await p.click('.ne-imgbar button[data-side="left"]');
pic = await p.evaluate(() => { const s = document.querySelector('.ne-img'); return { side: s.dataset.float, w: s.dataset.w, f: getComputedStyle(s).float }; });
t('Wrap left floats it left at under half the width', pic.side === 'left' && pic.f === 'left' && +pic.w <= 60, JSON.stringify(pic));

/* drag it into a paragraph, in the right third: it floats right there, and the words go round it
   (a tall window, so the paragraph and the picture are both on screen) */
await p.setViewportSize({ width: 1440, height: 2200 });
await p.waitForTimeout(150);
const target = await p.evaluate(() => {
  const para = [...document.querySelectorAll('.ne-body p')].find(x => x.textContent.startsWith('No new trades'));
  const r = document.createRange(); const tn = para.lastChild.nodeType === 3 ? para.lastChild : para.firstChild;
  r.setStart(tn, 0); r.setEnd(tn, 1); const rc = r.getBoundingClientRect(); const col = document.querySelector('.ne-body').getBoundingClientRect();
  return { y: rc.top + rc.height / 2, x: col.right - 40 };
});
const from = await p.locator('.ne-img img').boundingBox();
await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await p.mouse.down();
for (let i = 1; i <= 16; i++) {
  await p.mouse.move(from.x + from.width / 2 + (target.x - from.x - from.width / 2) * i / 16, from.y + from.height / 2 + (target.y - from.y - from.height / 2) * i / 16);
  await p.waitForTimeout(25);
}
await p.mouse.up(); await p.waitForTimeout(200);
pic = await p.evaluate(() => { const s = document.querySelector('.ne-img'); const para = s.closest('p'); const up = []; for (let n = s.parentNode; n && !n.classList?.contains('ne-body'); n = n.parentNode) up.push(n.nodeName); return { side: s.dataset.float, f: getComputedStyle(s).float, para: para?.textContent.slice(0, 20), up: up.join('>'), prev: s.previousSibling?.textContent?.slice(-20), next: s.nextSibling?.textContent?.slice(0, 20) }; });
t('dragged to the right of a paragraph: it moves there and floats right', pic.side === 'right' && pic.f === 'right' && pic.para === 'No new trades fiftee', JSON.stringify(pic));
t('…and the writing beside it wraps round it, to its left', await p.evaluate(() => {
  const s = document.querySelector('.ne-img'), sr = s.getBoundingClientRect();
  const tw = document.createTreeWalker(document.querySelector('.ne-body'), NodeFilter.SHOW_TEXT);
  const beside = [];
  for (let n; (n = tw.nextNode());) {
    const r = document.createRange(); r.selectNodeContents(n);
    for (const x of r.getClientRects()) if (x.width > 2 && x.top < sr.bottom - 4 && x.bottom > sr.top + 4) beside.push(x);
  }
  return beside.length >= 3 && beside.every(x => x.right <= sr.left + 1);
}));
await p.screenshot({ path: OUT + '/notes-wrap.png' });
await p.setViewportSize({ width: 1440, height: 900 });
await p.waitForTimeout(150);

/* size it from the corner */
const before = await p.evaluate(() => +document.querySelector('.ne-img').dataset.w);
await p.hover('.ne-img img');
const grip = await p.locator('.ne-img .ne-grip').boundingBox();
await p.mouse.move(grip.x + 8, grip.y + 8); await p.mouse.down();
await p.mouse.move(grip.x - 80, grip.y + 8, { steps: 6 }); await p.mouse.up();
const after = await p.evaluate(() => +document.querySelector('.ne-img').dataset.w);
t('the corner handle sizes it (a right float grows to the left)', after > before, `${before} → ${after}`);

/* ---------- a TradingView chart ---------- */
await caretAtEnd(); await p.keyboard.press('Enter');
await p.evaluate(x => navigator.clipboard.writeText(x), 'https://www.tradingview.com/x/krNx1I9g/');
await p.keyboard.press('Control+V');
await p.waitForFunction(() => document.querySelectorAll('.ne-img[data-link] img[src^="blob:"]').length === 1, null, { timeout: 4000 }).catch(() => {});
t('a TradingView snapshot link pasted becomes the chart', await p.locator('.ne-img[data-link="https://www.tradingview.com/x/krNx1I9g/"]').count() === 1 && SNAPS.some(u => u.endsWith('/k/krNx1I9g.png')));
await p.click('.ne-tb[aria-label="Add a TradingView chart"]');
await p.keyboard.type('https://www.tradingview.com/chart/PIS3D2DQ/'); await p.keyboard.press('Enter');
t('the chart button explains a layout link instead of adding nothing silently', /layout link/.test(await p.textContent('.ne-pop-link .ne-hint')) && await p.locator('.ne-img').count() === 2);
await p.keyboard.press('Escape');

/* ---------- kind and pin ---------- */
await p.click('.ne-kind[data-kind="watch"]');
await p.click('.ne-pin');
await settle();

/* ---------- what is kept ---------- */
let k = (await kept()).notes[0];
t('kept: title, kind and pin', k?.title === 'Red folder days' && k.kind === 'watch' && k.pinned === true, JSON.stringify({ title: k?.title, kind: k?.kind, pinned: k?.pinned }));
t('kept html is clean: no style, contenteditable, blob or <img>', k && !/style=|contenteditable|blob:|<img|<font/.test(k.html), k?.html.match(/style=[^>]*|contenteditable|blob:|<img|<font/)?.[0]);
t('…with the pictures as placeholders that say where and how', k && (k.html.match(/<span class="ne-img" data-shot="screenshots\/[^"]+" data-float="(left|right|center)" data-w="\d+"/g) || []).length === 2);
t('kept text: the words without the markup, a space between paragraphs', k && k.text.startsWith('No new trades fifteen minutes either side of NFP, CPI or FOMC. What to do instead'), k?.text.slice(0, 90));
t('kept images: both pictures', k && k.images.length === 2 && k.images.every(n => n.startsWith('screenshots/')));

/* ---------- drawn again while writing: nothing lost, the caret where it was ---------- */
await caretAtEnd();
const bodyBefore = await p.evaluateHandle(() => document.querySelector('.ne-body'));
await p.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
await p.waitForTimeout(150);
await p.keyboard.type(' Still here.');
const again = await p.evaluate(b0 => [document.querySelector('.ne-body') === b0, document.activeElement === b0], bodyBefore);
const tail = (await html()).slice(-80);
t('the page drawn again keeps the same page and the caret', again[0] && again[1] && /Still here\.<\/p>$/.test(tail), JSON.stringify(again) + ' ' + tail);

/* ---------- take a picture out, leave: its file goes ---------- */
const chartShot = await p.evaluate(() => document.querySelector('.ne-img[data-link]').dataset.shot);
await p.click('.ne-img[data-link] img');
await p.keyboard.press('Delete');
t('Delete takes a chosen picture out', await p.locator('.ne-img').count() === 1);
await p.click('.ne-back');
await p.waitForSelector('.nt-card');
await settle(400);
t('…and leaving the note tidies its file away', await p.evaluate(n => !window.__files.has(n), chartShot));

/* ---------- the list ---------- */
const card = await p.evaluate(() => { const c = document.querySelector('.nt-card'); return c && { title: c.querySelector('.nt-title').textContent, body: c.querySelector('.nt-body').textContent, tag: c.querySelector('.nt-tag')?.textContent, pin: !!c.querySelector('.nt-pin'), pics: c.querySelector('.nt-pics')?.textContent }; });
t('the list shows the title, the start of what it says, its kind, pin and pictures',
  card?.title === 'Red folder days' && card.body.startsWith('No new trades fifteen minutes') && card.tag === 'Watch out' && card.pin && card.pics === '1', JSON.stringify(card));
await p.fill('.nt-search input', 'forexfactory');
t('search reads what notes say', await p.locator('.nt-card').count() === 1);
await p.fill('.nt-search input', 'nothing like this');
t('…and says when nothing matches', (await p.textContent('.nt-empty')).includes('Nothing matches'));
await p.fill('.nt-search input', '');

/* reopened: built again from what was kept, pictures and all */
await p.click('.nt-card');
await p.waitForSelector('.ne-body');
await p.waitForFunction(() => document.querySelector('.ne-img img')?.src.startsWith('blob:'), null, { timeout: 3000 }).catch(() => {});
tb = await toolbar();
t('reopened to read: no toolbar', !tb.shown && tb.vis === 'hidden' && tb.pe === 'none', JSON.stringify(tb));
const spaceBefore = await p.evaluate(() => document.querySelector('.ne-title').getBoundingClientRect().top);
await p.click('.ne-body h2');
await p.waitForTimeout(350);
tb = await toolbar();
t('a click in the writing brings it back', tb.shown && tb.vis === 'visible', JSON.stringify(tb));
t('…without moving the page', await p.evaluate(() => document.querySelector('.ne-title').getBoundingClientRect().top) === spaceBefore);
await p.click('.ne-tb[aria-label="Text colour and highlight"]');
await p.waitForTimeout(150);
t('it stays while one of its menus is open', (await toolbar()).shown && await p.locator('.ne-pop-colour').count() === 1);
await p.keyboard.press('Escape');
await p.click('.ne-title');
await p.waitForTimeout(350);
t('into the title: it goes', !(await toolbar()).shown);
await p.click('.ne-body h2'); await p.waitForTimeout(100);
{ const bar = await p.locator('.ne-bar').boundingBox(); await p.mouse.click(bar.x + bar.width / 2, bar.y + bar.height / 2); }
await p.waitForTimeout(350);
t('a click away from the note: it goes', !(await toolbar()).shown);
t('reopened, the picture is back where it was', await p.evaluate(() => { const s = document.querySelector('.ne-img'); return s?.dataset.float === 'right' && s.closest('p')?.textContent.startsWith('No new trades') && s.querySelector('img').src.startsWith('blob:'); }));
t('…and the formatting with it', /<span class="tc-yellow">break-<\/span>/.test(await html()) && (await html()).includes('<h2>What to do instead</h2>'));
await p.screenshot({ path: OUT + '/notes-page.png' });

/* ---------- an empty note is let go ---------- */
await p.click('.ne-back'); await p.waitForSelector('.nt-card');
await p.click('.nt-new'); await p.waitForSelector('.ne-body');
const emptyId = await p.evaluate(() => decodeURIComponent(location.hash.split('/')[2]));
await p.click('.ne-back'); await p.waitForSelector('.nt-card');
await settle(400);
t('a new note left empty is not kept', await p.locator('.nt-card').count() === 1 && !(await kept()).notes.some(n => n.id === emptyId));

/* ---------- delete, with its pictures ---------- */
await p.click('.nt-card'); await p.waitForSelector('.ne-body');
const shots = await p.evaluate(() => [...document.querySelectorAll('.ne-img')].map(s => s.dataset.shot));
await p.click('.ne-del');
t('Delete asks once more', (await p.textContent('.ne-del')).includes('Delete this note?'));
await p.click('.ne-del');
await p.waitForSelector('.nt-empty');
await settle(400);
t('deleted: gone from the list and the file, its pictures with it', (await kept()).notes.length === 0 && await p.evaluate(ns => ns.every(n => !window.__files.has(n)), shots));

t('no errors on the page', errs.length === 0, errs.join(' | '));
console.log(`\n  ${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
