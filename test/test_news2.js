// Validates NEWS2 Scale 1 vs Scale 2 against the REAL router.js calcNEWS2 —
// extracted from the source text and evaluated, so a regression in the real
// scoring code fails THIS test. (The previous hand-copied mirror stayed green
// no matter what router.js did.)
const fs = require('fs');
const path = require('path');
const routerSrc = fs.readFileSync(path.resolve('js/router.js'), 'utf8');
const fnStart = routerSrc.indexOf('function calcNEWS2(');
if (fnStart < 0) { console.error('  FAIL- calcNEWS2 not found in js/router.js'); process.exit(1); }
const fnEnd = routerSrc.indexOf('\n}', fnStart);   // first column-0 close brace = end of this top-level function
const calcNEWS2 = new Function(routerSrc.slice(fnStart, fnEnd + 2) + '\n;return calcNEWS2;')();

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
// SpO2-only contribution helper: only o2 (+ onO2) set, everything else neutral.
const spo2 = (o2, onO2, scale) => calcNEWS2(null, null, null, o2, null, onO2, 'alert', scale).score;

// --- Scale 1 SpO2 bands (default) ---
assert(spo2(90, 0, 1) === 3, 'Scale 1: SpO2 90 -> 3');
assert(spo2(92, 0, 1) === 2, 'Scale 1: SpO2 92 -> 2');
assert(spo2(94, 0, 1) === 1, 'Scale 1: SpO2 94 -> 1');
assert(spo2(97, 0, 1) === 0, 'Scale 1: SpO2 97 -> 0');

// --- Scale 2 SpO2 bands (target 88-92) ---
assert(spo2(90, 0, 2) === 0, 'Scale 2: SpO2 90 on air -> 0 (target range)');
assert(spo2(88, 0, 2) === 0, 'Scale 2: SpO2 88 on air -> 0');
assert(spo2(87, 0, 2) === 1, 'Scale 2: SpO2 87 -> 1');
assert(spo2(85, 0, 2) === 2, 'Scale 2: SpO2 85 -> 2');
assert(spo2(82, 0, 2) === 3, 'Scale 2: SpO2 82 -> 3');
// high SpO2 only penalised on supplemental oxygen
assert(spo2(98, 0, 2) === 0, 'Scale 2: SpO2 98 on AIR -> 0');
assert(spo2(94, 1, 2) === 1 + 2, 'Scale 2: SpO2 94 on O2 -> 1 (+2 for being on O2)');
assert(spo2(96, 1, 2) === 2 + 2, 'Scale 2: SpO2 96 on O2 -> 2 (+2 on O2)');
assert(spo2(98, 1, 2) === 3 + 2, 'Scale 2: SpO2 98 on O2 -> 3 over-oxygenation (+2 on O2)');

// --- THE FIX: a stable COPD patient on home O2 false-alarms on Scale 1, not Scale 2 ---
// RR18, SpO2 89 on O2, HR88, BP125, temp37, alert
const s1 = calcNEWS2(125, 88, 37, 89, 18, 1, 'alert', 1);
const s2 = calcNEWS2(125, 88, 37, 89, 18, 1, 'alert', 2);
assert(s1.score === 5, 'stable COPD on Scale 1 = 5 -> crosses the >=5 alert threshold (false alarm): ' + s1.score);
assert(s2.score === 2, 'same patient on Scale 2 = 2 -> no false alarm: ' + s2.score);
assert(s1.score >= 5 && s2.score < 5, 'Scale 2 removes the COPD false alarm (alarm-fatigue fix)');

// --- a genuinely deteriorating reading still scores on both scales ---
assert(calcNEWS2(85, 130, 39.5, 84, 26, 1, 'voice', 2).score >= 7, 'true deterioration still scores high on Scale 2');

// --- RED SCORE: a single parameter scoring 3 must flag escalation at low aggregate ---
const apnoea = calcNEWS2(120, 70, 37, 98, 8, 0, 'alert', 1);   // RR 8 alone
assert(apnoea.score === 3 && apnoea.red === true, 'isolated RR 8: aggregate 3 but red=true (single-param escalation)');
const brady = calcNEWS2(120, 40, 37, 98, 16, 0, 'alert', 1);   // HR 40 alone
assert(brady.score === 3 && brady.red === true, 'isolated HR 40: red=true');
const hypo = calcNEWS2(120, 70, 35.0, 98, 16, 0, 'alert', 1);  // temp 35.0 alone
assert(hypo.score === 3 && hypo.red === true, 'isolated temp 35.0: red=true');
const confused = calcNEWS2(120, 70, 37, 98, 16, 0, 'voice', 1);
assert(confused.red === true, 'non-alert consciousness: red=true');
const normal = calcNEWS2(120, 70, 37, 98, 16, 0, 'alert', 1);
assert(normal.score === 0 && normal.red === false, 'all-normal: score 0, red=false');
const onlyO2 = calcNEWS2(120, 70, 37, 98, 16, 1, 'alert', 1);
assert(onlyO2.score === 2 && onlyO2.red === false, 'supplemental O2 alone (+2) is NOT a red score');
const mediums = calcNEWS2(95, 115, 37, 92, 16, 0, 'alert', 1); // SBP 95 (+2), HR 115 (+2), SpO2 92 (+2) = 6, no single 3
assert(mediums.score === 6 && mediums.red === false, 'aggregate 6 from three 2s: red=false (aggregate threshold handles it)');

// --- charted ZERO vitals must score maximum, not be skipped (parseInt||null fix) ---
const arrest = calcNEWS2(0, 0, 37, 98, 0, 0, 'alert', 1);  // SBP 0, HR 0, RR 0
assert(arrest.score === 9 && arrest.red === true, 'charted zeros (SBP/HR/RR = 0) score 3 each, not "not measured"');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
