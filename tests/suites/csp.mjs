/* The desktop app runs under a Content Security Policy the browser build does
   not. A screenshot reaches an <img> as a blob: URL, so this checks the policy
   actually allows one — before ten minutes of CI says otherwise. */
import pw from 'playwright';
import fs from 'node:fs';
import fsx from 'node:fs';
/* ---- where this suite finds things ----------------------------------
   Paths are worked out from this file rather than typed in, so the suite
   runs from wherever the repository happens to sit. The browser is
   Playwright's own unless QUIRE_CHROMIUM names another; screenshots go to
   a scratch folder outside the repository. */
const HERE = new URL('.', import.meta.url).pathname;
const ROOT = new URL('../../', import.meta.url).pathname;
const FIX  = HERE + '../fixtures';
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const APP = 'file://' + ROOT + 'Laminar.html';
fsx.mkdirSync(OUT, { recursive: true });

const conf = JSON.parse(fs.readFileSync(ROOT + 'src-tauri/tauri.conf.json','utf8'));
const csp = conf.app.security.csp;
const OLD = csp.replace('data: blob:', 'data:');
const b = await pw.chromium.launch({ executablePath: CHROME });
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

async function blobImageLoads(policy) {
  const p = await b.newPage();
  await p.setContent(`<meta http-equiv="Content-Security-Policy" content="${policy}"><div id=out></div>`);
  const ok = await p.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    canvas.getContext('2d').fillRect(0, 0, 8, 8);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg'));
    const url = URL.createObjectURL(blob);
    return new Promise(res => {
      const img = new Image();
      img.onload = () => res(true);
      img.onerror = () => res(false);
      img.src = url;
      setTimeout(() => res(false), 1500);
    });
  });
  await p.close();
  return ok;
}
/* A clip (the share sheet, your own background videos) plays from a blob: URL
   too, which media-src has to allow — default-src alone does not. */
async function blobVideoLoads(policy) {
  const p = await b.newPage();
  await p.setContent(`<meta http-equiv="Content-Security-Policy" content="${policy}"><div id=out></div>`);
  const bytes = fs.readFileSync(FIX + '/share-clip.mp4').toString('base64');
  const ok = await p.evaluate(async b64 => {
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([u], { type: 'video/mp4' }));
    return new Promise(res => {
      const v = document.createElement('video');
      v.muted = true;
      v.onloadeddata = () => res(true);
      v.onerror = () => res(false);
      v.src = url;
      setTimeout(() => res(false), 3000);
    });
  }, bytes);
  await p.close();
  return ok;
}
console.log('   policy:', csp);
t('without media-src a clip would not play', (await blobVideoLoads(csp.replace(/; media-src[^;]*/, ''))) === false);
t('the shipped policy lets a clip play from a blob', (await blobVideoLoads(csp)) === true);
t('the old policy would have blocked every screenshot', (await blobImageLoads(OLD)) === false);
t('the shipped policy lets a blob image load', (await blobImageLoads(csp)) === true);
t('and it still refuses anything off the machine', /default-src 'self'/.test(csp));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
