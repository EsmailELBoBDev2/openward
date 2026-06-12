'use strict';
// Pins every clinical calculator's thresholds to the PUBLISHED reference it
// claims to implement, by evaluating the REAL calculators.js (a hand-copy would
// stay green no matter what the source did). Closes the long-standing audit gap
// "non-NEWS2 calculators not verified against citable guidelines".
//
// References asserted here:
//  - APACHE II age points + mortality bands: Knaus et al., Crit Care Med 1985.
//  - MELD formula + 3-month mortality bands: Wiesner et al., Gastroenterology
//    2003 (hospitalized: <10 ~2%, 10-19 ~6%, 20-29 ~20%, 30-39 ~53%, ≥40 ~71%).
//  - BISAP mortality: Gao et al. meta-analysis, PLoS One 2015 (3 -> ~12.7%,
//    4 -> ~30.9%): score 3 must NOT be understated as "5-8%".
//  - Morse Fall Scale: 0-24 low, 25-44 MODERATE (not "low"), ≥45 high.
//  - Wells PE three-tier: low is score < 2 (a 1.5 is LOW, not moderate).
//  - HAS-BLED: ≥3 = high bleeding risk (caution/review, not withhold).
//  - Braden: ≤9 severe, 10-12 high, 13-14 moderate, 15-18 mild, 19-23 no/low.
//  - GCS: 13-15 mild, 9-12 moderate, ≤8 severe.
//  - Cockcroft-Gault + Devine IBW + Mosteller BSA formulas.
const fs = require('fs');
const path = require('path');
const calcSrc = fs.readFileSync(path.resolve('js/calculators.js'), 'utf8');
const CALCS = new Function(calcSrc + '\n;return CLINICAL_CALCULATORS;')();
const by = (id) => CALCS.find(c => c.id === id);

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

// ---- APACHE II (Knaus 1985) ----
{
  const a = by('apache2').calc;
  const pts = (age) => a({ age, aps: 0, chronic: 0 }).value;
  assert(pts(44) === 0 && pts(45) === 2 && pts(55) === 3 && pts(65) === 5 && pts(75) === 6,
    'APACHE II age points: 0/2/3/5/6 at <45/45/55/65/75 (Knaus 1985)');
  assert(/~8%/.test(a({ age: 30, aps: 5, chronic: 0 }).interpretation), 'APACHE II 5-9 pts -> ~8% mortality');
  assert(/~40%/.test(a({ age: 30, aps: 20, chronic: 0 }).interpretation), 'APACHE II 20-24 pts -> ~40% mortality');
  assert(/~85%/.test(a({ age: 80, aps: 30, chronic: 0 }).interpretation), 'APACHE II >=35 pts -> ~85% mortality');
}

// ---- MELD (Wiesner 2003) ----
{
  const m = by('meld').calc;
  // formula: bili 1, INR 1, cr 1 -> 6.43 -> rounds to 6
  assert(m({ cr: 1, bili: 1, inr: 1 }).value === 6, 'MELD floor (all 1.0) = 6 (3.78ln+11.2ln+9.57ln+6.43)');
  assert(m({ cr: 8, bili: 1, inr: 1 }).value === m({ cr: 4, bili: 1, inr: 1 }).value, 'MELD clamps creatinine at 4.0');
  // THE FIX: bands were shifted one tier too pessimistic (a MELD 25 said ~52%)
  const meldFor = (target) => {
    for (const inr of [1, 1.5, 2, 2.5, 3]) for (let b = 1; b < 90; b += 0.05) {
      const r = m({ cr: 1.5, bili: b, inr }); if (r.value === target) return r;
    }
    return null;
  };
  const m15 = meldFor(15), m25 = meldFor(25), m35 = meldFor(35);
  assert(m15 && /~6%/.test(m15.interpretation), `MELD 15 -> ~6% 3-month mortality (10-19 band), got: ${m15 && m15.interpretation}`);
  assert(m25 && /~20%/.test(m25.interpretation), `MELD 25 -> ~20% (20-29 band; was wrongly ~52%), got: ${m25 && m25.interpretation}`);
  assert(m35 && /~53%/.test(m35.interpretation), `MELD 35 -> ~53% (30-39 band; was wrongly ~71%), got: ${m35 && m35.interpretation}`);
}

// ---- BISAP (Gao 2015 meta-analysis) ----
{
  const b = by('bisap').calc;
  const r3 = b({ bun: 1, mental: 1, sirs: 1, age60: 0, pleural: 0 });
  const r4 = b({ bun: 1, mental: 1, sirs: 1, age60: 1, pleural: 0 });
  assert(r3.value === 3 && /8-13/.test(r3.interpretation), 'BISAP 3 -> ~8-13% mortality (was understated as 5-8%)');
  assert(r4.value === 4 && /ICU/.test(r4.interpretation), 'BISAP >=4 -> ICU admission');
}

// ---- Morse Fall Scale ----
{
  const mo = by('morse').calc;
  const r30 = mo({ history: 1, secondary: 0, ambulatory_aid: '0', iv: 0, gait: '0', mental: '0' });   // 25 pts
  assert(r30.value === 25 && /Moderate/.test(r30.interpretation), 'Morse 25-44 is MODERATE risk (was labeled "Low")');
  const r65 = mo({ history: 1, secondary: 1, ambulatory_aid: '0', iv: 1, gait: '0', mental: '0' });    // 60 pts
  assert(r65.value === 60 && /High/.test(r65.interpretation), 'Morse >=45 is high risk');
  const r0 = mo({ history: 0, secondary: 0, ambulatory_aid: '0', iv: 0, gait: '0', mental: '0' });
  assert(r0.value === 0 && /Low/.test(r0.interpretation), 'Morse 0-24 is low risk');
}

// ---- Wells PE (three-tier) ----
{
  const w = by('tropwells').calc;
  const r = w({ dvt_signs: 0, pe_likely: 0, hr100: 1, immob: 0, prev_pe: 0, hemop: 0, cancer: 0 });   // 1.5
  assert(r.value === 1.5 && /Low/.test(r.interpretation), 'Wells 1.5 is LOW probability (low tier is < 2, was <= 1)');
  const r2 = w({ dvt_signs: 0, pe_likely: 0, hr100: 1, immob: 0, prev_pe: 0, hemop: 1, cancer: 0 });  // 2.5
  assert(/Moderate/.test(r2.interpretation), 'Wells 2.5 is moderate');
  const r7 = w({ dvt_signs: 1, pe_likely: 1, hr100: 1, immob: 0, prev_pe: 0, hemop: 0, cancer: 0 });  // 7.5
  assert(/High/.test(r7.interpretation), 'Wells > 6 is high');
}

// ---- HAS-BLED ----
{
  const h = by('hasbled').calc;
  const r3 = h({ h: 1, a: 1, s: 1, b: 0, l: 0, e: 0, d: 0 });
  assert(r3.value === 3 && /High/.test(r3.interpretation), 'HAS-BLED 3 -> HIGH bleeding risk (>=3 convention)');
  assert(/withhold/.test(r3.interpretation), 'HAS-BLED high-risk text warns it is NOT a reason to withhold anticoagulation by itself');
}

// ---- Braden ----
{
  const br = by('braden').calc;
  const score = (n) => ({ sensory: n[0], moisture: n[1], activity: n[2], mobility: n[3], nutrition: n[4], friction: n[5] });
  assert(/Severe/.test(br.call(null, score([1, 1, 1, 1, 1, 1])).interpretation), 'Braden 6 (<=9) severe risk');
  assert(/Moderate/.test(br.call(null, score([3, 2, 2, 2, 2, 2])).interpretation), 'Braden 13 moderate risk');
  assert(/No risk/.test(br.call(null, score([4, 4, 4, 4, 4, 3])).interpretation), 'Braden 23 no risk');
}

// ---- GCS ----
{
  const g = by('gcs').calc;
  assert(/Mild/.test(g({ eye: '4', verbal: '4', motor: '6' }).interpretation), 'GCS 14 mild');
  assert(/Moderate/.test(g({ eye: '3', verbal: '3', motor: '4' }).interpretation), 'GCS 10 moderate');
  assert(/Severe/.test(g({ eye: '1', verbal: '2', motor: '4' }).interpretation), 'GCS 7 (<=8) severe');
}

// ---- formulas: Cockcroft-Gault, Devine, Mosteller ----
{
  const cg = by('crcl').calc({ age: 60, weight: 72, sCr: 1.0, sex: 'male' });
  assert(cg.value === '80', `Cockcroft-Gault (60y, 72kg, Cr 1.0, M) = 80 mL/min, got ${cg.value}`);
  const ibw = by('ibw').calc({ height: 170, sex: 'male' });   // 66.93in -> 50 + 2.3*6.93
  assert(Math.abs(parseFloat(ibw.value) - 65.9) < 0.2, `Devine IBW 170cm male ~65.9kg, got ${ibw.value}`);
  const bsa = by('bsa').calc({ weight: 70, height: 170 });
  assert(Math.abs(parseFloat(bsa.value) - 1.82) < 0.02, `Mosteller BSA 70kg/170cm ~1.82m², got ${bsa.value}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
