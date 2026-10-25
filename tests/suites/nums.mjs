import { parseNumber, parseNumberOrNull } from '../../src/js/calc.js';
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

let pass=0, fail=0;
const ok=(input,want)=>{const g=parseNumber(input); const good=String(g)===String(want); good?pass++:fail++;
  const shown = (input === undefined ? 'undefined' : JSON.stringify(input) ?? String(input));
  console.log(`  ${good?'ok  ':'FAIL'}  ${shown.padEnd(16)} -> ${String(g).padEnd(12)}${good?'':' want '+want}`);};

console.log('  -- the ways people write twenty-five thousand --');
ok('25000', 25000); ok('25 000', 25000); ok('25,000', 25000); ok('$25000', 25000);
ok('$25 000', 25000); ok('$25,000', 25000); ok(' 25000 ', 25000); ok('25 000', 25000);
ok('A$25,000', 25000); ok('25000 AUD', 25000); ok("25'000", 25000);

console.log('  -- decimals survive --');
ok('1234.56', 1234.56); ok('$1,234.56', 1234.56); ok('1 234.56', 1234.56); ok('0.75', 0.75); ok('.5', 0.5);

console.log('  -- negatives, however they are written --');
ok('-750', -750); ok('−750', -750); ok('(750)', -750); ok('($1,750.50)', -1750.5); ok('-$1,750.50', -1750.5);

console.log('  -- the ambiguous comma --');
ok('25,5', 25.5);        // one comma, two digits after: a decimal comma
ok('25,50', 25.5);
ok('25,500', 25500);     // three digits after: thousands
ok('1,234,567', 1234567);
ok('1.234,56', 1234.56);      // European: the later mark is the decimal point
ok('1,234.56', 1234.56);      // and the other way round

console.log('  -- stray units --');
ok('0.75%', 0.75); ok('2.31R', 2.31); ok('+2.31R', 2.31);

console.log('  -- rubbish is null, never 0 and never NaN --');
ok('', 'null'); ok('   ', 'null'); ok('abc', 'null'); ok('$', 'null'); ok('--5', 'null');
ok('1.2.3', 'null'); ok(null, 'null'); ok(undefined, 'null');
// Malformed grouping is forgiven rather than refused — someone typing this
// meant 25000. The form echoes back what it read, so the guess is never silent.
ok('25,00,0', 25000);
ok(NaN, 'null'); ok(Infinity, 'null');
ok(25000, 25000);   // a real number passes through

console.log('  -- blank is "not set", not an error --');
const b = parseNumberOrNull('');   console.log(`  ${b===null?'ok  ':'FAIL'}  blank -> null`); b===null?pass++:fail++;
const d = parseNumberOrNull('$1 200'); console.log(`  ${d===1200?'ok  ':'FAIL'}  "$1 200" -> ${d}`); d===1200?pass++:fail++;
console.log(`\n${pass} passed, ${fail} failed`);
