// Validates NEWS2 Scale 1 vs Scale 2 (router.js calcNEWS2). Faithful copy of the
// pure function (router.js can't be required in Node) — the COPD alarm-fatigue fix.
function calcNEWS2(sys, hr, temp, o2, rr, onO2, consciousness, scale) {
  scale = (scale === 2) ? 2 : 1;
  let score = 0;
  if (rr !== null) { if (rr <= 8) score += 3; else if (rr <= 11) score += 1; else if (rr <= 20) score += 0; else if (rr <= 24) score += 2; else score += 3; }
  if (o2 !== null) {
    if (scale === 2) {
      if (o2 <= 83) score += 3; else if (o2 <= 85) score += 2; else if (o2 <= 87) score += 1; else if (o2 <= 92) score += 0;
      else if (onO2) { if (o2 <= 94) score += 1; else if (o2 <= 96) score += 2; else score += 3; }
    } else {
      if (o2 <= 91) score += 3; else if (o2 <= 93) score += 2; else if (o2 <= 95) score += 1; else score += 0;
    }
  }
  if (onO2) score += 2;
  if (sys !== null) { if (sys <= 90) score += 3; else if (sys <= 100) score += 2; else if (sys <= 110) score += 1; else if (sys <= 219) score += 0; else score += 3; }
  if (hr !== null) { if (hr <= 40) score += 3; else if (hr <= 50) score += 1; else if (hr <= 90) score += 0; else if (hr <= 110) score += 1; else if (hr <= 130) score += 2; else score += 3; }
  if (consciousness && consciousness !== 'alert') score += 3;
  if (temp !== null) { if (temp <= 35.0) score += 3; else if (temp <= 36.0) score += 1; else if (temp <= 38.0) score += 0; else if (temp <= 39.0) score += 1; else score += 2; }
  return score;
}

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
// SpO2-only contribution helper: only o2 (+ onO2) set, everything else neutral.
const spo2 = (o2, onO2, scale) => calcNEWS2(null, null, null, o2, null, onO2, 'alert', scale);

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
assert(s1 === 5, 'stable COPD on Scale 1 = 5 -> crosses the >=5 alert threshold (false alarm): ' + s1);
assert(s2 === 2, 'same patient on Scale 2 = 2 -> no false alarm: ' + s2);
assert(s1 >= 5 && s2 < 5, 'Scale 2 removes the COPD false alarm (alarm-fatigue fix)');

// --- a genuinely deteriorating reading still scores on both scales ---
assert(calcNEWS2(85, 130, 39.5, 84, 26, 1, 'voice', 2) >= 7, 'true deterioration still scores high on Scale 2');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
