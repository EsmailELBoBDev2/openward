'use strict';
// Dark-mode ratchet: JS-injected inline styles must not introduce NEW opaque
// white surfaces. Hardcoded `background:#fff` ignores the theme variables, so it
// stays white in dark mode (and any inheriting text on a flipped parent goes
// invisible). Card/surface backgrounds must use var(--white) / var(--bg) so they
// flip with @media (prefers-color-scheme: dark).
//
// Two deliberate exceptions are allowed:
//   1. Code Blue emergency buttons — white buttons with RED text (color:#dc3545)
//      on a full-red emergency overlay; that high-contrast is intentional.
//   2. The print wristband — its white background is a CSS rule inside a <style>
//      block (printed on white), NOT a style="" attribute, so it is naturally
//      out of scope for this inline-attribute scan.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

const jsDir = path.join(__dirname, '..', 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();

// An inline style="" attribute whose background is OPAQUE white (#fff / #ffffff /
// white) — not a semantic tint like #fff5f5 (the negative lookahead rejects a
// following hex digit).
const WHITE_BG = /style="[^"]*background(?:-color)?:\s*(?:#fff(?![0-9a-fA-F])|#ffffff(?![0-9a-fA-F])|white\b)[^"]*"/gi;

const violations = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    WHITE_BG.lastIndex = 0;
    let m;
    while ((m = WHITE_BG.exec(line))) {
      const attr = m[0];
      const isEmergencyButton = /color:\s*#dc3545/i.test(attr); // Code Blue exception
      if (!isEmergencyButton) violations.push(`js/${f}:${i + 1}  ${attr.slice(0, 90)}…`);
    }
  });
}

assert(violations.length === 0,
  'no NEW hardcoded opaque-white inline surfaces (use var(--white)/var(--bg))' +
  (violations.length ? '\n      ' + violations.join('\n      ') : ''));

// Sanity: the theme variables this relies on must exist in both light and dark.
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'main.css'), 'utf8');
assert(/--white\s*:/.test(css), 'css defines --white (light)');
assert(/@media\s*\(prefers-color-scheme:\s*dark\)/.test(css), 'css has a dark-mode media block');
const darkBlock = (css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*?\n\}/) || [''])[0];
assert(/--white\s*:/.test(darkBlock) && /--bg\s*:/.test(darkBlock) && /--text\s*:/.test(darkBlock),
  'dark-mode block overrides --white, --bg and --text');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
