// Validates jsAttr() — the escaper for values embedded in a single-quoted JS
// string inside a double-quoted HTML attribute, e.g. onclick="fn('${jsAttr(x)}')".
// Regression guard for the broken &apos;/&#39; and quote-stripping patterns that
// previously broke names like O'Brien and risked breaking out of the JS string.
//
// NOTE: expected values are built from BS (a single backslash via char code 92)
// so this source file never contains a literal backslash-backslash-quote run,
// which tools/preflight.js (rightly) flags as paste-corruption.
const { jsAttr } = require('../js/utils.js');
const BS = String.fromCharCode(92);   // one backslash

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

// 1. A real apostrophe name is JS-escaped (backslash + quote), NOT entity-encoded
//    (&#39;/&apos;, which the HTML parser would decode back into a breaking quote)
//    and NOT stripped (which silently mangles names like O'Brien -> OBrien).
assert(jsAttr("O'Brien") === "O" + BS + "'Brien", "apostrophe is JS-escaped, not entity-encoded or stripped");
assert(!/&(#39|apos);/.test(jsAttr("O'Brien")), "no HTML entity that the parser would decode back into a breaking quote");

// 2. An injection attempt cannot close the JS string then run code — the quote
//    that would close it is backslash-escaped.
assert(jsAttr("');alert(document.cookie)//") === BS + "');alert(document.cookie)//",
  "injection payload neutralised (closing quote is escaped)");

// 3. A double quote must stay inside the surrounding double-quoted attribute.
assert(jsAttr('a"b') === 'a&quot;b', 'double quote -> &quot; so the HTML attribute does not close early');

// 4. HTML metacharacters are escaped so they can't open a tag in the attribute value.
assert(jsAttr('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;', '< and > escaped');
assert(jsAttr('Tom & Jerry') === 'Tom &amp; Jerry', 'ampersand escaped first (so later entities are not double-decoded)');

// 5. Backslash is doubled so it cannot escape our quote-escaping.
assert(jsAttr('a' + BS + 'b') === 'a' + BS + BS + 'b', 'backslash doubled for the JS string literal');
assert(jsAttr('a' + BS + "'b") === 'a' + BS + BS + BS + "'b", 'backslash-then-quote: both escaped independently');

// 6. null/undefined are safe.
assert(jsAttr(null) === '', 'null -> empty string');
assert(jsAttr(undefined) === '', 'undefined -> empty string');

// 7. SOURCE SCAN: escapeHtml() inside a single-quoted inline-handler argument is
// the recurring XSS-class bug (an apostrophe in a patient name closes the JS
// string — audit passes 8/10 found these one at a time). Those positions must
// use jsAttr(). The regex provably catches the last real instance fixed
// (showFluidDetails, router.js) — if this fires, switch that site to jsAttr().
const fs = require('fs');
const path = require('path');
const HANDLER_ANTIPATTERN = /on(?:click|change|submit|input|blur)="[^"\n]*'\$\{[^}\n]*escapeHtml\(/;
for (const f of ['router.js', 'clinical-decision.js', 'utils.js', 'easy-features.js', 'smart-phrases.js', 'calculators.js']) {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'js', f), 'utf8');
  const m = src.match(HANDLER_ANTIPATTERN);
  assert(!m, `js/${f}: no escapeHtml() inside a quoted inline-handler arg (use jsAttr)` + (m ? ` — found: ${m[0].slice(0, 80)}` : ''));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
