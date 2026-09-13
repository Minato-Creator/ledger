/* ============================================================
   build-single.mjs — the whole app as one .html file.

   A double-clicked page cannot import a second file: the browser treats
   file:// as an opaque origin and CORS blocks every `import`. So the modules
   are folded into one script here.

   Each module keeps its own scope — they are wrapped, not concatenated —
   because view files legitimately reuse local names (`row`, `stat`,
   `withinPeriod`), and flattening them into one scope would silently pick
   the wrong one. That kind of bug does not throw; it just draws the wrong
   thing.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';

const SRC = new URL('./src/', import.meta.url).pathname;
const ENTRY = 'js/app.js';

const seen = new Map();       // rel path -> { id, code, deps }
const order = [];             // dependency-first

const idFor = rel => '__m_' + rel.replace(/[^a-z0-9]/gi, '_');

function parse(rel) {
  if (seen.has(rel)) return seen.get(rel);
  const abs = path.join(SRC, rel);
  let code = fs.readFileSync(abs, 'utf8');
  const deps = [];

  // ---- imports -> destructuring from the module's export object ----------
  code = code.replace(
    /^import\s+(?:(\*\s+as\s+(\w+))|(\{[^}]*\}))\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
    (_all, _star, ns, named, spec) => {
      const depRel = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      deps.push(depRel);
      const id = idFor(depRel);
      return ns ? `const ${ns} = ${id};`
                : `const ${named.replace(/\s+as\s+/g, ': ')} = ${id};`;
    });

  // ---- re-exports: `export { a, b };` -----------------------------------
  const reExports = [];
  code = code.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_all, names) => {
    names.split(',').map(s => s.trim()).filter(Boolean).forEach(n => reExports.push(n));
    return '';
  });

  // ---- declarations: strip the keyword, remember the name ---------------
  const exported = [...reExports];
  code = code.replace(/^export\s+(async\s+)?(function|const|let|class)\s+(\w+)/gm,
    (_all, asyncKw, kind, name) => { exported.push(name); return `${asyncKw || ''}${kind} ${name}`; });

  if (/^export\s/m.test(code)) {
    throw new Error(`${rel}: an export form the bundler does not handle:\n  ` +
      code.match(/^export\s.*/m)[0]);
  }

  for (const d of deps) parse(d);          // depth first, so deps come first
  const mod = { rel, id: idFor(rel), code, deps, exported: [...new Set(exported)] };
  seen.set(rel, mod);
  order.push(mod);
  return mod;
}

parse(ENTRY);

const modules = order.map(m => `
/* ---- ${m.rel} ${'-'.repeat(Math.max(0, 60 - m.rel.length))} */
const ${m.id} = (() => {
${m.code}
return { ${m.exported.join(', ')} };
})();`).join('\n');

// ---- assemble the page -------------------------------------------------
const preview = process.argv.includes('--preview');
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(SRC, 'css/app.css'), 'utf8');

let out = html
  .replace(/<link[^>]+href="css\/app\.css"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace(/<script[^>]*src="js\/app\.js"[^>]*><\/script>/,
    () => `<script>\n${preview ? 'window.__LEDGER_PREVIEW__ = true;\n' : ''}(() => {\n"use strict";\n${modules}\n})();\n</script>`);

/* Check the TAGS are gone, not the strings — the bundler writes each module's
   path into a comment, so "js/app.js" legitimately appears in the output. */
if (/<link[^>]+href="css\//.test(out) || /<script[^>]+src="js\//.test(out)) {
  throw new Error('index.html did not have the shapes the bundler expected — nothing was inlined');
}
if (!out.includes('<style>') || !out.includes('__m_js_app_js')) {
  throw new Error('the CSS or the modules did not make it into the page');
}

const outName = preview ? 'Ledger-preview.html' : 'Ledger.html';
if (preview) out = out.replace(/<title>[^<]*<\/title>/, '<title>Ledger — preview</title>');
fs.writeFileSync(new URL('./' + outName, import.meta.url).pathname, out);
console.log(`bundled ${order.length} modules`);
console.log(order.map(m => '  ' + m.rel).join('\n'));
console.log(`\n${outName}  ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB`);
