// Validates the shared drug-allergy matcher (js/allergy-check.js) used by BOTH
// the browser prescribe flows and the server's authoritative /api/prescriptions
// check. Regression guard for the server's old substring-only matching, which
// let Amoxicillin past a documented "Penicillin" allergy.
const { checkDrugAllergy } = require('../js/allergy-check.js');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
const A = (name) => [{ allergen: name, severity: 'severe', reaction: 'rash' }];

// --- direct matches ---
assert(!!checkDrugAllergy('Ceftriaxone', A('Ceftriaxone')), 'exact allergen = drug name');
assert(!!checkDrugAllergy('Amoxicillin/Clavulanate', A('amoxicillin')), 'allergen substring of combination drug');

// --- THE FIX: class membership (this is what the server used to miss) ---
assert(!!checkDrugAllergy('Amoxicillin', A('Penicillin')), 'penicillin allergy catches Amoxicillin (class)');
assert(!!checkDrugAllergy('Piperacillin/Tazobactam', A('Penicillin')), 'penicillin allergy catches Pip-Tazo (class)');
assert(!!checkDrugAllergy('Trimethoprim/Sulfamethoxazole', A('Sulfa')), 'sulfa allergy catches TMP-SMX');
assert(!!checkDrugAllergy('Ibuprofen', A('NSAID')), 'NSAID class allergy catches ibuprofen');
const member = checkDrugAllergy('Ampicillin', A('Amoxicillin'));
assert(!!member && !member._cross, 'allergy recorded as a MEMBER (Amoxicillin) catches a sibling (Ampicillin) as same-class, not cross');

// --- typo tolerance ---
assert(!!checkDrugAllergy('Amoxicillin', A('Pencillin')), "typo 'Pencillin' still catches Amoxicillin");
assert(!!checkDrugAllergy('Ibuprofen', A('asprin')), "typo 'asprin' resolves to aspirin and cross-flags ibuprofen");

// --- cross-reactivity (flagged, overridable, honestly worded) ---
const x1 = checkDrugAllergy('Ceftriaxone', A('Penicillin'));
assert(!!x1 && x1._cross === true, 'penicillin allergy cross-flags Ceftriaxone (cephalosporin)');
const x2 = checkDrugAllergy('Meropenem', A('Penicillin'));
assert(!!x2 && x2._cross === true, 'penicillin allergy cross-flags Meropenem (carbapenem)');
const x3 = checkDrugAllergy('Ibuprofen', A('Aspirin'));
assert(!!x3 && x3._cross === true, 'aspirin allergy cross-flags Ibuprofen (NSAID)');
const x4 = checkDrugAllergy('Amoxicillin', A('Ceftriaxone'));
assert(!!x4 && x4._cross === true, 'cephalosporin (member) allergy cross-flags Amoxicillin');

// --- no false positives ---
assert(checkDrugAllergy('Paracetamol', A('Penicillin')) === null, 'penicillin allergy does NOT flag Paracetamol');
assert(checkDrugAllergy('Amoxicillin', A('Peanuts')) === null, 'food allergy does NOT flag a drug');
assert(checkDrugAllergy('Morphine', A('Latex')) === null, 'latex allergy does NOT flag a drug');
assert(checkDrugAllergy('Rasagiline', A('asa')) === null, "short allergen 'asa' is token-matched — does not hit rAS Agiline");
assert(checkDrugAllergy('Metformin', A('NSAID')) === null, 'NSAID allergy does NOT flag metformin');

// --- ARABIC allergens (the registration form's placeholder literally suggests
// 'بنسلين'; before the alias layer every Arabic-entered allergen matched NOTHING) ---
assert(!!checkDrugAllergy('Amoxicillin', A('بنسلين')), 'Arabic penicillin (بنسلين) catches Amoxicillin');
assert(!!checkDrugAllergy('Amoxicillin', A('البنسلين')), 'Arabic with definite article (البنسلين) still matches');
assert(!!checkDrugAllergy('Amoxicillin', A('أموكسيسيلين')), 'hamza spelling variant normalizes (أموكسيسيلين)');
const arCross = checkDrugAllergy('Ceftriaxone', A('بنسلين'));
assert(!!arCross && arCross._cross === true, 'Arabic penicillin -> ceftriaxone flags CROSS-reactivity');
assert(!!checkDrugAllergy('Ibuprofen', A('بروفين')), 'Arabic brand-style بروفين catches ibuprofen');
assert(checkDrugAllergy('Paracetamol', A('بنسلين')) === null, 'Arabic allergen does NOT false-positive on unrelated drug');

// --- robustness ---
assert(checkDrugAllergy('', A('Penicillin')) === null, 'empty drug name -> null');
assert(checkDrugAllergy('Amoxicillin', []) === null, 'no allergies -> null');
assert(checkDrugAllergy('Amoxicillin', [{ allergen: '' }]) === null, 'blank allergen -> null');

// --- drug-vs-CONDITION contraindications (utils.js checkDrugConditionInteractions) ---
// This checker sat fully built but UNWIRED for the app's whole life; it is now
// called by checkInteractionsAndPrescribe AND the order-set batch path. Eval the
// real source and guard the wiring so it can never silently fall out again.
{
  const fs = require('fs');
  const utilsSrc = fs.readFileSync(require('path').resolve(__dirname, '../js/utils.js'), 'utf8');
  const slice = utilsSrc.slice(utilsSrc.indexOf('function checkDrugConditionInteractions'));
  const fnSrc = slice.slice(0, slice.indexOf('\n}') + 2);
  const checkDrugConditionInteractions = new Function('return ' + fnSrc)();
  const w1 = checkDrugConditionInteractions('Metformin 500mg', ['renal_failure']);
  assert(w1.length === 1 && w1[0].severity === 'red', 'metformin + renal failure -> RED contraindication');
  const w2 = checkDrugConditionInteractions('Ibuprofen 400mg', ['cardiac']);
  assert(w2.length === 1 && w2[0].severity === 'yellow', 'NSAID + cardiac disease -> YELLOW warning');
  const w3 = checkDrugConditionInteractions('Bisoprolol 5mg', ['asthma']);
  assert(w3.length === 1 && w3[0].severity === 'red' && !!w3[0].message_ar, 'beta-blocker + asthma -> RED, bilingual message');
  assert(checkDrugConditionInteractions('Paracetamol 500mg', ['renal_failure', 'cardiac', 'asthma']).length === 0, 'paracetamol -> no false positives');
  // wiring guard: the live dental prescribe path must consult the checker. (The
  // hospital checkInteractionsAndPrescribe/order-set paths were removed in the
  // dental pivot; doDentalPrescribe in dental-views.js is the live prescribe.)
  const dvSrc = fs.readFileSync(require('path').resolve(__dirname, '../js/dental-views.js'), 'utf8');
  const after = dvSrc.slice(dvSrc.indexOf('async function doDentalPrescribe'));
  const fnBody = after.slice(0, after.indexOf('\nfunction ') >= 0 ? after.indexOf('\nfunction ') : after.length);
  assert(/checkDrugConditionInteractions\(/.test(fnBody), 'doDentalPrescribe consults drug-vs-condition contraindications');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
