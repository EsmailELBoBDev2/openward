#!/usr/bin/env node
'use strict';
/*
 * OpenWard pre-flight checker — a deterministic, all-local "is the source
 * actually intact?" gate. No server, no deps, pure Node. Run it before trusting
 * ANY review of the tree:
 *
 *     node tools/preflight.js
 *
 * It exists because external reviewers kept reporting "broken at boot" against a
 * STALE / copy-paste-corrupted local checkout. A human (or an AI) eyeballing a
 * file can be wrong about whether it parses; this script can't. Green here means
 * the tree on THIS commit is structurally sound. Red prints the exact file:line.
 *
 * Four layers:
 *   A. HTML tag structure — balanced tags, no unterminated <div ...  (no '>').
 *   B. Inline <script> blocks in index.html actually parse (comments stripped
 *      first, so a literal "<script>" inside a <!-- comment --> is not a tag).
 *   C. `node --check` on every js/*.js (real syntax check, same as the user's
 *      "node --check js/*.js").
 *   D. Copy-paste corruption fingerprints across all tracked text files:
 *      & / < / > literals, &amp;#NNN double-escaped entities,
 *      and word\\'word doubled-backslash mangling (e.g. You\\'re).
 *
 * Exit 0 = clean, exit 1 = problems (with a per-finding report).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const rel = p => path.relative(ROOT, p) || p;
const read = p => fs.readFileSync(p, 'utf8');

let findings = [];
function fail(file, line, msg) { findings.push({ file, line, msg }); }
function resetFindings() { findings = []; }

// Map a character offset in a string to a 1-based line number.
function lineAt(src, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

// ----------------------------------------------------------------------------
// Layer A — HTML tag-structure validation
// ----------------------------------------------------------------------------
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr', '!doctype']);
// Elements whose CONTENT is raw text (may contain '<'/'>' that are NOT tags):
const RAWTEXT = new Set(['script', 'style', 'textarea', 'title']);

function checkHtmlStructure(file, srcOverride) {
  const src = srcOverride != null ? srcOverride : read(file);
  const n = src.length;
  const stack = [];          // { name, line }
  let i = 0;

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt === -1) break;
    i = lt;

    // Comment / doctype / CDATA bang-tags.
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end === -1) { fail(rel(file), lineAt(src, i), 'unterminated HTML comment <!-- with no -->'); return; }
      i = end + 3; continue;
    }
    if (src[i + 1] === '!') {            // <!DOCTYPE ...> etc.
      const end = src.indexOf('>', i);
      if (end === -1) { fail(rel(file), lineAt(src, i), 'unterminated <! ...> declaration'); return; }
      i = end + 1; continue;
    }

    const isEnd = src[i + 1] === '/';
    const nameStart = i + (isEnd ? 2 : 1);
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(src.slice(nameStart, nameStart + 60));
    if (!nameMatch) { i = lt + 1; continue; }   // a bare '<' in text (e.g. "a < b") — not a tag
    const name = nameMatch[0].toLowerCase();

    // Scan to the tag's closing '>', honoring quoted attribute values. If we hit
    // another unquoted '<' first, the tag was never closed — THE classic
    // "<div ...  (missing >)" corruption.
    let j = nameStart + nameMatch[0].length;
    let quote = null, selfClose = false, closed = false;
    for (; j < n; j++) {
      const c = src[j];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '<') {
        fail(rel(file), lineAt(src, i),
          `unterminated <${name}…> tag (next '<' seen at line ${lineAt(src, j)} before its '>') — likely a corrupted/missing '>'`);
        return;
      }
      if (c === '>') { selfClose = src[j - 1] === '/'; closed = true; break; }
    }
    if (!closed) { fail(rel(file), lineAt(src, i), `unterminated <${name}…> tag — reached end of file without '>'`); return; }
    i = j + 1;

    if (isEnd) {
      if (stack.length === 0) { fail(rel(file), lineAt(src, lt), `stray </${name}> — no matching open tag`); continue; }
      const top = stack[stack.length - 1];
      if (top.name !== name) {
        fail(rel(file), lineAt(src, lt), `</${name}> closes <${top.name}> (opened at line ${top.line}) — overlapping/unbalanced tags`);
        // pop anyway to keep scanning useful
        stack.pop();
      } else {
        stack.pop();
      }
      continue;
    }

    // Start tag.
    if (RAWTEXT.has(name) && !selfClose) {
      // Skip raw content to the matching close tag; '<' and '>' inside don't count.
      const close = new RegExp('</' + name + '\\s*>', 'i');
      const m = close.exec(src.slice(i));
      if (!m) { fail(rel(file), lineAt(src, lt), `unterminated <${name}> … no </${name}>`); return; }
      i += m.index + m[0].length;
      continue;
    }
    if (VOID.has(name) || selfClose) continue;   // no close expected
    stack.push({ name, line: lineAt(src, lt) });
  }

  for (const t of stack) fail(rel(file), t.line, `<${t.name}> never closed`);
}

// ----------------------------------------------------------------------------
// Layer B — inline <script> blocks parse (comments stripped first)
// ----------------------------------------------------------------------------
function checkInlineScripts(file, srcOverride) {
  const html = srcOverride != null ? srcOverride : read(file);
  const noComments = html.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' ')); // keep line numbers
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, count = 0;
  while ((m = re.exec(noComments))) {
    count++;
    const body = m[1];
    const bodyOffset = m.index + m[0].indexOf('>') + 1;
    try { new vm.Script(body); }
    catch (e) { fail(rel(file), lineAt(html, bodyOffset), `inline <script> #${count} does not parse: ${e.message}`); }
  }
  if (count === 0) fail(rel(file), 1, 'no inline <script> found to check (expected at least one)');
  // Inverse footgun: a literal "<script" left inside a real comment trips naive scanners.
  const comments = (html.match(/<!--[\s\S]*?-->/g) || []).join('\n');
  if (/<\/?script/i.test(comments))
    fail(rel(file), 1, 'literal "<script>" left inside an HTML comment (will false-alarm naive reviewers)');
}

// ----------------------------------------------------------------------------
// Layer C — node --check on every js/*.js
// ----------------------------------------------------------------------------
function checkJsSyntax() {
  const jsDir = path.join(ROOT, 'js');
  if (!fs.existsSync(jsDir)) return;
  for (const f of fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort()) {
    const full = path.join(jsDir, f);
    try { execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' }); }
    catch (e) {
      const out = (e.stderr || e.stdout || Buffer.from('')).toString();
      const lm = /:(\d+)\b/.exec(out.split('\n')[0] || '');
      fail('js/' + f, lm ? Number(lm[1]) : 0, 'node --check failed: ' + (out.split('\n').find(l => /SyntaxError/.test(l)) || out.split('\n')[0] || 'syntax error').trim());
    }
  }
}

// ----------------------------------------------------------------------------
// Layer D — copy-paste corruption fingerprints over tracked text files
// ----------------------------------------------------------------------------
const CORRUPTION = [
  { re: /\\u0026/g, why: 'literal "\\u0026" — an "&" entity that got escaped on paste' },
  { re: /\\u003c/gi, why: 'literal "\\u003c" — a "<" that got escaped on paste' },
  { re: /\\u003e/gi, why: 'literal "\\u003e" — a ">" that got escaped on paste' },
  { re: /&amp;#\d/g, why: 'double-escaped HTML entity "&amp;#NNN" (should be "&#NNN")' },
  { re: /[A-Za-z]\\\\'[A-Za-z]/g, why: 'doubled backslash inside a word (e.g. You\\\\\'re) — paste mangling' },
];
const TEXT_EXT = new Set(['.html', '.htm', '.js', '.css', '.md', '.json', '.py', '.yml', '.yaml', '.txt', '.svg']);

function trackedTextFiles() {
  try {
    return execFileSync('git', ['ls-files'], { cwd: ROOT })
      .toString().split('\n').filter(Boolean)
      .filter(f => TEXT_EXT.has(path.extname(f).toLowerCase()));
  } catch { return []; }
}

// Scan a single string for every corruption fingerprint (unit-testable).
function checkTextForCorruption(name, src) {
  for (const { re, why } of CORRUPTION) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) fail(name, lineAt(src, m.index), `corruption: ${why}`);
  }
}

function checkCorruption() {
  for (const f of trackedTextFiles()) {
    const full = path.join(ROOT, f);
    let src;
    try { src = read(full); } catch { continue; }
    // Don't scan THIS checker (it intentionally contains the signatures above).
    if (path.resolve(full) === path.resolve(__filename)) continue;
    checkTextForCorruption(f, src);
  }
}

// ----------------------------------------------------------------------------
// Run (only as a CLI; when require()'d by the test the checkers are exported)
// ----------------------------------------------------------------------------
function runAll() {
  resetFindings();
  const indexHtml = path.join(ROOT, 'index.html');
  if (fs.existsSync(indexHtml)) {
    checkHtmlStructure(indexHtml);
    checkInlineScripts(indexHtml);
  }
  checkJsSyntax();
  checkCorruption();
  return findings;
}

if (require.main === module) {
  runAll();
  const head = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch { return 'no-git'; } })();
  console.log(`OpenWard pre-flight @ ${head}`);
  if (findings.length === 0) {
    console.log('PASS — HTML structure balanced, inline scripts parse, js/*.js syntax OK, no paste-corruption signatures.');
    process.exit(0);
  } else {
    console.error(`FAIL — ${findings.length} problem(s):`);
    for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.msg}`);
    process.exit(1);
  }
}

module.exports = {
  runAll,
  resetFindings,
  getFindings: () => findings,
  checkHtmlStructure,
  checkInlineScripts,
  checkTextForCorruption,
};
