// Validates the improved diet-suggestion matcher (suggest.js): abbreviations
// now match, and short ASCII abbreviations don't false-fire inside other words.
const path = require('path');
const { keywordMatches, DIET_SUGGEST_RULES } = require(path.resolve('js/suggest.js'));

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

// Mirror getDietSuggestionChip's matching: lowercase text, find first rule.
function suggestDiet(diagnosisText) {
  const text = (diagnosisText || '').toLowerCase();
  const rule = DIET_SUGGEST_RULES.find(r => r.keywords.some(k => keywordMatches(text, k)));
  return rule ? rule.diet : null;
}

// --- abbreviations now resolve to the right diet ---
assert(suggestDiet('T2DM, poorly controlled') === 'Diabetic', 'T2DM -> Diabetic');
assert(suggestDiet('hx of NIDDM') === 'Diabetic', 'NIDDM -> Diabetic');
assert(suggestDiet('Type 2 diabetes mellitus') === 'Diabetic', 'spelled-out diabetes -> Diabetic');
assert(suggestDiet('old MI, now CHF') === 'Cardiac', 'MI/CHF -> Cardiac');
assert(suggestDiet('NSTEMI ruled in') === 'Cardiac', 'NSTEMI -> Cardiac');
assert(suggestDiet('CKD stage 4') === 'Renal', 'CKD -> Renal');
assert(suggestDiet('on hemodialysis') === 'Renal', 'hemodialysis -> Renal');
assert(suggestDiet('HTN crisis') === 'Low_Sodium', 'HTN -> Low_Sodium');
assert(suggestDiet('acute CVA') === 'Soft', 'CVA -> Soft');
assert(suggestDiet('known malignancy, cachexia') === 'High_Calorie', 'malignancy -> High_Calorie');

// --- Arabic still works (substring path) ---
assert(suggestDiet('مريض سكري') === 'Diabetic', 'Arabic سكري -> Diabetic');
assert(suggestDiet('قصور القلب') === 'Cardiac', 'Arabic قصور القلب -> Cardiac');

// --- the key win: short abbreviations DON'T false-fire inside other words ---
assert(suggestDiet('routine admission for elective surgery') === null, '"admission" does NOT trigger dm/Diabetic');
assert(suggestDiet('family history noted') === null, '"family" does NOT trigger mi/Cardiac');
assert(suggestDiet('random observation') === null, '"random" does NOT trigger dm/Diabetic');
assert(suggestDiet('no relevant findings') === null, 'benign note -> no suggestion');

// --- whole-word abbreviations still match at boundaries ---
assert(keywordMatches('h/o dm', 'dm') === true, '"dm" as a token matches');
assert(keywordMatches('admission', 'dm') === false, '"dm" inside "admission" does not match');
assert(keywordMatches('dka today', 'dka') === true, '"dka" matches at start');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
