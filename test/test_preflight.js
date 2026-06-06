'use strict';
// Proves tools/preflight.js actually CATCHES the exact corruption signatures the
// external reviews keep citing — so a green pre-flight is a meaningful "clean",
// not a no-op. Feeds synthetic corrupt inputs and asserts each is flagged, then
// asserts the real tree on this commit passes.
const pf = require('../tools/preflight.js');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

// Run a single checker over an in-memory string and return its findings.
function detect(fn, src) {
  pf.resetFindings();
  fn('virtual', src);
  return pf.getFindings();
}

// 1. Broken <div> with a missing '>' (the line-128/133 complaint).
{
  const bad = '<body>\n  <div id="x"\n  <div id="y"></div>\n</body>';
  const f = detect(pf.checkHtmlStructure, bad);
  assert(f.some(x => /unterminated <div/.test(x.msg)), 'catches a <div ...> with a missing ">"');
}

// 2. Well-formed divs do NOT false-alarm.
{
  const good = '<body>\n  <div id="x"></div>\n  <div id="y" style="z-index:1000;"></div>\n</body>';
  const f = detect(pf.checkHtmlStructure, good);
  assert(f.length === 0, 'well-formed divs produce no findings');
}

// 3. Overlapping / unbalanced tags.
{
  const bad = '<div><span></div></span>';
  const f = detect(pf.checkHtmlStructure, bad);
  assert(f.some(x => /overlapping|unbalanced|never closed/.test(x.msg)), 'catches overlapping/unbalanced tags');
}

// 4. '<' inside a quoted attribute value is NOT mistaken for a new tag.
{
  const good = '<meta content="default-src \'self\'; x>y ok"><div></div>';
  const f = detect(pf.checkHtmlStructure, good);
  assert(f.length === 0, 'quoted attribute values containing ">" do not break the parser');
}

// 5. Template-literal HTML inside <script> must not be parsed as tags.
{
  const good = '<div></div>\n<script>const s = `<div class="a">${x}</div>`; if (a < b) {}</script>';
  const f = detect(pf.checkHtmlStructure, good);
  assert(f.length === 0, '<script> raw content (HTML in template literals, a<b) is skipped, not tag-parsed');
}

// 6. Inline <script> that does not parse (the "You\\'re" / Missing } complaint).
{
  const bad = "<script>\n  const msg = 'You\\\\'re in';\n</script>";  // -> source contains You\\'re
  const f = detect(pf.checkInlineScripts, bad);
  assert(f.some(x => /does not parse/.test(x.msg)), 'catches an inline <script> with a syntax error (e.g. You\\\\\'re)');
}

// 7. A valid inline <script> parses clean.
{
  const good = "<script>\n  const msg = 'You\\'re in'; function f(){ return `${msg}`; }\n</script>";
  const f = detect(pf.checkInlineScripts, good);
  assert(!f.some(x => /does not parse/.test(x.msg)), 'valid inline <script> (single-backslash You\\\'re, template literal) parses');
}

// 8. A literal "<script>" inside an HTML comment must NOT false-alarm as broken.
{
  const good = '<!-- inline <script> sources are refused by CSP --><script>var a=1;</script>';
  const f = detect(pf.checkInlineScripts, good);
  // (this checker flags literal <script> in comments on purpose — assert THAT, not a parse error)
  assert(f.some(x => /inside an HTML comment/.test(x.msg)) && !f.some(x => /does not parse/.test(x.msg)),
    'literal "<script>" in a comment is reported as a footgun, not as a parse failure');
}

// 9. Copy-paste corruption fingerprints (&#, &amp;#, You\\'re, <).
{
  const cases = [
    ['\\u0026#127942;', /u0026/],
    ['&amp;#127942;', /double-escaped/],
    ['You\\\\\'re officially', /doubled backslash/],
    ['a \\u003c/div\\u003e b', /u003c/],
  ];
  for (const [snippet, want] of cases) {
    const f = detect(pf.checkTextForCorruption, snippet);
    assert(f.some(x => want.test(x.msg)), `corruption scan flags: ${JSON.stringify(snippet)}`);
  }
}

// 10. Clean text produces no corruption findings.
{
  const clean = "const x = '&#127942;'; const y = 'You\\'re in'; // </div> in a comment is fine";
  const f = detect(pf.checkTextForCorruption, clean);
  assert(f.length === 0, 'clean source (real &#127942;, single-backslash, plain </div>) is not flagged');
}

// 11. The REAL tree on this commit passes pre-flight end-to-end.
{
  const f = pf.runAll();
  assert(f.length === 0, 'the actual repository tree passes pre-flight' +
    (f.length ? ' -> ' + f.map(x => `${x.file}:${x.line} ${x.msg}`).join('; ') : ''));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
