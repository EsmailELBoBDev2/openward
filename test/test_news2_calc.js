// Validates the standalone NEWS2 quick-reference calculator by evaluating the
// REAL calculators.js source and calling its news2 entry's calc() — a hand-copy
// here would stay green no matter what calculators.js did. Regression guard for
// the hypothermia bug: temperature <=35.0 must score 3 (RCP NEWS2 2017), not 2.
const fs = require('fs');
const path = require('path');
const calcSrc = fs.readFileSync(path.resolve('js/calculators.js'), 'utf8');
const CLINICAL_CALCULATORS = new Function(calcSrc + '\n;return CLINICAL_CALCULATORS;')();
const news2 = CLINICAL_CALCULATORS.find(c => c.id === 'news2');
if (!news2) { console.error('  FAIL- news2 entry not found in calculators.js'); process.exit(1); }
const newsCalc = (i) => news2.calc(i).value;

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
// All-normal baseline (alert ticked), vary one field.
const base = { rr: 16, sat: 98, on_o2: false, temp: 37, sbp: 120, hr: 70, alert: true };
const withTemp = (t) => newsCalc(Object.assign({}, base, { temp: t }));

// --- THE FIX: hypothermia <=35.0 scores 3, not 2 ---
assert(withTemp(35.0) === 3, 'temp 35.0 (hypothermia) -> 3 (was wrongly 2)');
assert(withTemp(34.0) === 3, 'temp 34.0 -> 3');
// --- the rest of the temperature curve (asymmetric) ---
assert(withTemp(35.5) === 1, 'temp 35.5 -> 1');
assert(withTemp(36.0) === 1, 'temp 36.0 -> 1');
assert(withTemp(37.0) === 0, 'temp 37.0 (normal) -> 0');
assert(withTemp(38.0) === 0, 'temp 38.0 -> 0');
assert(withTemp(38.5) === 1, 'temp 38.5 -> 1');
assert(withTemp(39.0) === 1, 'temp 39.0 -> 1');
assert(withTemp(39.5) === 2, 'temp 39.5 (high fever) -> 2');

// --- spot-check the other (already-correct) parameters didn't regress ---
assert(newsCalc(Object.assign({}, base, { rr: 26 })) === 3, 'RR 26 -> 3');
assert(newsCalc(Object.assign({}, base, { rr: 20 })) === 0, 'RR 20 -> 0 (12-20 band)');
assert(newsCalc(Object.assign({}, base, { hr: 95 })) === 1, 'HR 95 -> 1 (91-110 band)');
assert(newsCalc(Object.assign({}, base, { hr: 70 })) === 0, 'HR 70 -> 0 (51-90 band)');
assert(newsCalc(Object.assign({}, base, { sbp: 95 })) === 2, 'SBP 95 -> 2');
assert(newsCalc(Object.assign({}, base, { alert: false })) === 3, 'not alert -> 3');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
