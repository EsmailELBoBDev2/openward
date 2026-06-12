'use strict';
// Boot guard: load every external js/ script in the SAME order index.html does,
// into ONE shared global context (like the browser). Per-file `node --check`
// cannot catch a cross-file top-level collision such as two files each declaring
// `const PBKDF2_ITERATIONS` — that throws "Identifier ... has already been
// declared" only when both run in the same scope. This test reproduces that.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// External scripts in document order (our own js/ only; vendor/ is third-party).
const srcs = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m => m[1])
  .filter(s => s.startsWith('js/'));
assert(srcs.length >= 10, `found ${srcs.length} js/ <script> tags in index.html`);

// A permissive browser-ish global so top-level code doesn't ReferenceError; the
// point is to surface DECLARATION collisions, not to run the app.
const noop = () => {};
const elStub = () => ({ classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, setAttribute: noop, appendChild: noop, style: {}, dataset: {}, focus: noop, querySelectorAll: () => [], remove: noop });
const docStub = { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: elStub, body: null, documentElement: { setAttribute: noop, style: {} }, cookie: '' };
const storageStub = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };

const g = {
  console, crypto: globalThis.crypto, TextEncoder, TextDecoder,
  setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
  requestAnimationFrame: noop, queueMicrotask: (cb) => cb,
  document: docStub, localStorage: storageStub, sessionStorage: storageStub,
  navigator: { language: 'en', userAgent: 'node' },
  location: { href: 'file://', search: '', hash: '', reload: noop, assign: noop },
  history: { length: 1, back: noop, pushState: noop, replaceState: noop },
  indexedDB: { open: () => ({}) },
  alert: noop, confirm: () => true, prompt: () => null,
  fetch: () => Promise.resolve({}),
  initSqlJs: () => Promise.resolve({}), QRCode: function () {}, Chart: function () {},
};
const ctx = vm.createContext(g);
g.window = g; g.self = g; g.globalThis = g;   // window === global, as in a browser

let loadError = null;
for (const src of srcs) {
  const code = fs.readFileSync(path.join(root, src), 'utf8');
  try {
    vm.runInContext(code, ctx, { filename: src });
  } catch (e) {
    loadError = `${src}: ${e.message}`;
    break;
  }
}
assert(!loadError, 'all js/ scripts load together in one global scope without error'
  + (loadError ? ` -> ${loadError}` : ''));

// Negative control: two scripts each declaring the same top-level const in one
// shared context MUST collide — proving this test would catch a regression like
// the PBKDF2_ITERATIONS one (not a vacuous pass).
let caught = false;
const probe = vm.createContext({});
try {
  vm.runInContext('const DUP_PROBE = 1;', probe);
  vm.runInContext('const DUP_PROBE = 2;', probe);
} catch (e) { caught = /already been declared/.test(e.message); }
assert(caught, 'detector is real: a duplicate top-level const across scripts is caught');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
