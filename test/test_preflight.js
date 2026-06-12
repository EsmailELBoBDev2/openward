'use strict';
// Proves tools/preflight.js actually CATCHES the corruption signatures the
// external reviews keep citing — so a green pre-flight means a meaningful
// "clean", not a no-op. It feeds synthetic corrupt inputs, asserts each is
// flagged, then asserts the real tree on this commit passes.
//
// NOTE: every "corrupt" fixture below is BUILT from char codes (BS = backslash,
// AMP = ampersand) rather than written as a literal. If we wrote the literal
// mangled bytes here, preflight's own corruption scan would (correctly) flag
// THIS file. Building them at runtime keeps the scanner fully honest (no file is
// excluded) while still exercising detection. Do not paste literal mangled
// sequences into this file.
const pf = require('../tools/preflight.js');

const BS = String.fromCharCode(92);   // a single backslash
const AMP = String.fromCharCode(38);  // an ampersand

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

// Run a single checker over an in-memory string and return its findings.
function detect(fn, src) {
  pf.resetFindings();
  fn('virtual', src);
  return pf.getFindings();
}

// 1. Broken <div> with a missing close-bracket (the line 128/133 complaint).
{
  const bad = '<body>\n  <div id="x"\n  <div id="y"></div>\n</body>';
  const f = detect(pf.checkHtmlStructure, bad);
  assert(f.some(x => /unterminated <div/.test(x.msg)), 'catches a <div> with a missing close-bracket');
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

// 4. A close-bracket inside a quoted attribute value is NOT a new tag.
{
  const good = '<meta content="default-src \'self\'; x>y ok"><div></div>';
  const f = detect(pf.checkHtmlStructure, good);
  assert(f.length === 0, 'quoted attribute values containing a close-bracket do not break the parser');
}

// 5. Template-literal HTML inside <script> must not be parsed as tags.
{
  const good = '<div></div>\n<script>const s = `<div class="a">${x}</div>`; if (a < b) {}</script>';
  const f = detect(pf.checkHtmlStructure, good);
  assert(f.length === 0, '<script> raw content (HTML in template literals, a<b) is skipped, not tag-parsed');
}

// 6. Inline <script> that does not parse (a mangled string-escape).
{
  // body becomes a string literal closed early by a doubled backslash before
  // the apostrophe (the classic paste-mangled escape) -> a syntax error.
  const body = "const msg = 'You" + BS + BS + "'re in';";
  const bad = '<script>' + body + '</script>';
  const f = detect(pf.checkInlineScripts, bad);
  assert(f.some(x => /does not parse/.test(x.msg)), 'catches an inline <script> with a broken string-escape');
}

// 7. A valid inline <script> parses clean.
{
  // body becomes:  const msg = 'You\'re in'; (a correctly escaped apostrophe)
  const body = "const msg = 'You" + BS + "'re in'; function f(){ return `${msg}`; }";
  const good = '<script>' + body + '</script>';
  const f = detect(pf.checkInlineScripts, good);
  assert(!f.some(x => /does not parse/.test(x.msg)), 'valid inline <script> (escaped apostrophe, template literal) parses');
}

// 8. A literal script tag inside an HTML comment must NOT false-alarm as broken.
{
  const good = '<!-- inline <script> sources are refused by CSP --><script>var a=1;</script>';
  const f = detect(pf.checkInlineScripts, good);
  // this checker flags a literal script tag in a comment ON PURPOSE — assert THAT, not a parse error
  assert(f.some(x => /inside an HTML comment/.test(x.msg)) && !f.some(x => /does not parse/.test(x.msg)),
    'a literal script tag in a comment is reported as a footgun, not as a parse failure');
}

// 9. Copy-paste corruption fingerprints (each fixture built from char codes).
{
  const cases = [
    [BS + 'u0026#127942;', /u0026/],                       // escaped ampersand entity
    [AMP + 'amp;#127942;', /double-escaped/],              // &amp;#NNN
    ['You' + BS + BS + "'re officially", /doubled backslash/], // word + 2 backslashes + quote + word
    ['a ' + BS + 'u003c/div' + BS + 'u003e b', /u003c/],   // escaped angle brackets
  ];
  let idx = 0;
  for (const [snippet, want] of cases) {
    idx++;
    const f = detect(pf.checkTextForCorruption, snippet);
    assert(f.some(x => want.test(x.msg)), `corruption scan flags fingerprint #${idx}`);
  }
}

// 10. Clean text produces no corruption findings.
{
  // const x = '&#127942;'; const y = 'You\'re in'; // </div> in a comment is fine
  const clean = "const x = '" + AMP + "#127942;'; const y = 'You" + BS + "'re in'; // </div> ok";
  const f = detect(pf.checkTextForCorruption, clean);
  assert(f.length === 0, 'clean source (real entity, escaped apostrophe, plain close tag) is not flagged');
}

// 11. The REAL tree on this commit passes pre-flight end-to-end.
{
  const f = pf.runAll();
  assert(f.length === 0, 'the actual repository tree passes pre-flight' +
    (f.length ? ' -> ' + f.map(x => `${x.file}:${x.line} ${x.msg}`).join('; ') : ''));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
