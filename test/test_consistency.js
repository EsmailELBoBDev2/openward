'use strict';
// Cross-file consistency guards for three "silent regression" bugs that don't
// throw a parse error but quietly do the wrong thing at runtime:
//   1. The code-status SAFETY banner (utils.js) must key off the SAME values the
//      code-status picker writes (easy-features.js). A mismatch = a patient set
//      to "Full Code"/"Limited" shows NO badge on the safety bar.
//   2. The post-vitals "just-inserted row" lookup (router.js) must use the real
//      PK column (vitals_id). MAX(id) threw "no such column: id".
//   3. The login "Reset" button (index.html) must wipe the WHOLE local store,
//      not just the legacy 'main' key, or generational snapshots reload the
//      "deleted" data.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// ---- 1. code-status banner keys ⊆ picker values --------------------------
const ef = read('js/easy-features.js');
const utils = read('js/utils.js');

// Picker option values: the CODE_STATUS_OPTIONS array entries `value: '...'`.
const pickerVals = new Set();
const valRe = /\bvalue:\s*'([^']+)'/g;
let mm;
while ((mm = valRe.exec(ef))) pickerVals.add(mm[1]);
assert(pickerVals.has('full') && pickerVals.has('dnr') && pickerVals.has('dni') && pickerVals.has('limited'),
  `picker defines full/dnr/dni/limited (got: ${[...pickerVals].join(',')})`);

// Banner lookup keys: the object literal assigned to codeStatusLbl.
const blk = utils.match(/codeStatusLbl\s*=\s*\{([\s\S]*?)\}\s*\[/);
assert(!!blk, 'found codeStatusLbl lookup object in utils.js');
const bannerKeys = new Set();
if (blk) { const kRe = /(\w+)\s*:\s*\{/g; let km; while ((km = kRe.exec(blk[1]))) bannerKeys.add(km[1]); }
const orphanKeys = [...bannerKeys].filter(k => !pickerVals.has(k));
assert(orphanKeys.length === 0,
  `every banner key maps to a real picker value` + (orphanKeys.length ? ` (orphans: ${orphanKeys.join(',')})` : ''));
// The actionable ones must actually render.
['full', 'dnr', 'dni', 'limited'].forEach(k =>
  assert(bannerKeys.has(k), `safety banner renders code-status "${k}"`));

// ---- 2. vitals "last row" lookup uses the real PK column -----------------
const router = read('js/router.js');
const dbjs = read('js/db.js');
assert(/vitals_id\s+INTEGER PRIMARY KEY/.test(dbjs), 'vitals_log PK column is vitals_id');
assert(!/MAX\(id\)\s+(?:as|AS)\s+id\s+FROM\s+vitals_log/i.test(router),
  'no MAX(id) FROM vitals_log (would throw "no such column: id")');
assert(/MAX\(vitals_id\)[\s\S]{0,20}FROM\s+vitals_log/i.test(router),
  'vitals row lookup uses MAX(vitals_id)');

// ---- 3. Reset wipes the whole store, not just legacy 'main' --------------
const html = read('index.html');
const clearFn = html.match(/async function clearDatabase\(\)[\s\S]*?\n    \}/);
assert(!!clearFn, 'found clearDatabase() in index.html');
if (clearFn) {
  assert(/wipeLocalDatabase\s*\(/.test(clearFn[0]) || /objectStore\('databases'\)\.clear\(\)/.test(clearFn[0]),
    'clearDatabase() clears the whole store (wipeLocalDatabase / .clear())');
  assert(!/\.delete\('main'\)/.test(clearFn[0]),
    'clearDatabase() does NOT delete only the legacy \'main\' key');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
