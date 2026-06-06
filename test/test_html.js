'use strict';
// Front-door guard: confirm index.html's REAL inline scripts parse. HTML comments
// are stripped first (a literal "<script>" written inside a <!-- comment --> is
// not code — naive extractors, including some external reviewers', false-alarm on
// it). This is the "inline-script syntax check before every release" guard.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const noComments = html.replace(/<!--[\s\S]*?-->/g, '');           // browsers ignore comment contents
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;    // inline (non-src) scripts only

let i = 0, m;
while ((m = re.exec(noComments))) {
  i++;
  let ok = true, msg = '';
  try { new vm.Script(m[1]); } catch (e) { ok = false; msg = e.message; }
  assert(ok, `inline <script> #${i} parses` + (ok ? '' : ` -> ${msg}`));
}
assert(i > 0, `found ${i} real inline script(s) to check`);

// And the inverse footgun: the source should not contain an angle-bracketed
// "<script" inside a comment that trips naive scanners.
const comments = (html.match(/<!--[\s\S]*?-->/g) || []).join('\n');
assert(!/<\/?script/i.test(comments), 'no literal "<script>" left inside HTML comments (avoids false "broken" alarms)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
