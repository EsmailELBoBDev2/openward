'use strict';
// ============================================================
// OpenWard — shared drug-allergy matcher
//
// ONE curated table used by BOTH layers:
//   - browser UI: loaded before clinical-decision.js/router.js in index.html,
//     defines the global checkDrugAllergy() the prescribe flows call
//   - LAN server: server/server.js require()s this file so the authoritative
//     /api/prescriptions check applies the SAME class logic — previously the
//     server did substring-only matching, so a documented "Penicillin" allergy
//     did NOT block Amoxicillin server-side while the browser warned.
//
// Matching layers (first hit wins):
//   1. direct        — allergen string ⊆ drug name or vice-versa ("Ceftriaxone")
//   2. same-class    — allergen names a class or a class member; drug is in that
//                      class (allergy "penicillin" or "amoxicillin" → ampicillin)
//   3. cross-class   — drug is in a class with documented cross-reactivity to
//                      the allergen's class (penicillin → cephalosporin /
//                      carbapenem; aspirin ↔ other NSAIDs). Returned with
//                      _cross:true so the UI words it as "possible
//                      cross-reactivity", not "documented allergy".
//
// All hits are WARN-with-override, never silent. Cross-reactivity context:
// penicillin→cephalosporin is ~1-2% overall and side-chain dependent (Shenoy
// et al., JAMA 2019); penicillin→carbapenem ~1%. Warning is the safe default
// for a system without side-chain data.
//
// TODO(clinical): table needs pharmacist sign-off before production use.
// ============================================================

// class → member drug-name substrings (lowercase). Members ≥5 chars match by
// substring; shorter members (e.g. 'asa') match whole tokens only, so an
// allergen like "rasagiline" can never class-match as aspirin.
const ALLERGEN_DRUG_MAP = {
  'penicillin':    ['penicillin', 'amoxicillin', 'ampicillin', 'augmentin', 'piperacillin', 'tazocin', 'flucloxacillin', 'cloxacillin'],
  'cephalosporin': ['cefuroxime', 'ceftriaxone', 'cefazolin', 'cephalexin', 'cefepime', 'cefixime', 'ceftazidime', 'cefotaxime'],
  'carbapenem':    ['meropenem', 'imipenem', 'ertapenem'],
  'sulfa':         ['sulfamethoxazole', 'tmp-smx', 'tmp_smx', 'bactrim', 'septra', 'co-trimoxazole', 'cotrimoxazole', 'sulfasalazine', 'sulfadiazine', 'sulfa'],
  // aspirin is kept OUT of the nsaid member list on purpose: aspirin↔NSAID hits
  // route through CROSS_CLASS so the warning honestly says "cross-reactivity"
  // rather than claiming a documented allergy to the exact drug.
  'nsaid':         ['ibuprofen', 'naproxen', 'ketorolac', 'diclofenac', 'celecoxib', 'indomethacin'],
  'aspirin':       ['aspirin', 'asa', 'acetylsalicylic'],
  'ace':           ['lisinopril', 'enalapril', 'captopril', 'ramipril', 'perindopril', 'benazepril'],
  'quinolone':     ['ciprofloxacin', 'levofloxacin', 'moxifloxacin', 'ofloxacin', 'norfloxacin'],
  'macrolide':     ['azithromycin', 'erythromycin', 'clarithromycin'],
  'statin':        ['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin'],
  'opioid':        ['morphine', 'oxycodone', 'hydromorphone', 'fentanyl', 'codeine', 'tramadol', 'pethidine'],
  'iodine':        ['iodine', 'contrast'],
  'latex':         [],   // not a drug match — surfaced on the safety banner instead
};

// documented allergy to KEY class → possible cross-reaction with VALUE classes
const CROSS_CLASS = {
  'penicillin':    ['cephalosporin', 'carbapenem'],
  'cephalosporin': ['penicillin', 'carbapenem'],
  'carbapenem':    ['penicillin', 'cephalosporin'],
  'aspirin':       ['nsaid'],
  'nsaid':         ['aspirin'],
};

// common misspellings → canonical class
const TYPO_ALIASES = {
  'pencilin': 'penicillin', 'pencillin': 'penicillin', 'penisilin': 'penicillin', 'penicilin': 'penicillin',
  'sulpha': 'sulfa', 'sulph': 'sulfa',
  'asprin': 'aspirin', 'aspirine': 'aspirin',
  'cefalosporin': 'cephalosporin', 'cephalo': 'cephalosporin',
  'morphin': 'opioid', 'codien': 'opioid',
};

// ------------------------------------------------------------
// Arabic allergen support. The registration form's placeholder literally
// suggests 'بنسلين', but every layer above is Latin-script — an
// Arabic-entered allergen matched NOTHING, silently disabling the whole
// allergy guard for Arabic users. Keys are stored NORMALIZED (see
// _normalizeArabic); values are canonical Latin terms fed back through the
// regular matching pipeline. Substring scan, so 'البنسلين' / 'حساسية بنسلين'
// also hit.
// ------------------------------------------------------------
const ARABIC_ALIASES = {
  'بنسلين': 'penicillin', 'بنسيلين': 'penicillin', 'بنيسيلين': 'penicillin',
  'اموكسيسيلين': 'amoxicillin', 'اموكسيل': 'amoxicillin', 'امبيسيلين': 'ampicillin', 'اوجمنتين': 'augmentin',
  'سيفالوسبورين': 'cephalosporin', 'سيفترياكسون': 'ceftriaxone', 'سيفوروكسيم': 'cefuroxime',
  'سيفازولين': 'cefazolin', 'سيفالكسين': 'cephalexin',
  'ميروبينيم': 'meropenem', 'ايميبينيم': 'imipenem',
  'سلفا': 'sulfa', 'سولفا': 'sulfa', 'باكتريم': 'bactrim', 'سلفاميثوكسازول': 'sulfamethoxazole', 'كوتريموكسازول': 'cotrimoxazole',
  'ايبوبروفين': 'ibuprofen', 'بروفين': 'ibuprofen', 'ديكلوفيناك': 'diclofenac', 'فولتارين': 'diclofenac',
  'نابروكسين': 'naproxen', 'كيتورولاك': 'ketorolac', 'سيليكوكسيب': 'celecoxib',
  'اسبرين': 'aspirin', 'اسبيرين': 'aspirin',
  'ليزينوبريل': 'lisinopril', 'كابتوبريل': 'captopril', 'انالابريل': 'enalapril', 'راميبريل': 'ramipril',
  'سيبروفلوكساسين': 'ciprofloxacin', 'سيبرو': 'ciprofloxacin', 'ليفوفلوكساسين': 'levofloxacin', 'كينولون': 'quinolone',
  'ازيثروميسين': 'azithromycin', 'اريثروميسين': 'erythromycin', 'كلاريثروميسين': 'clarithromycin',
  'ستاتين': 'statin', 'اتورفاستاتين': 'atorvastatin', 'سيمفاستاتين': 'simvastatin', 'روزوفاستاتين': 'rosuvastatin',
  'مورفين': 'morphine', 'كودين': 'codeine', 'كودايين': 'codeine', 'ترامادول': 'tramadol',
  'فنتانيل': 'fentanyl', 'بيثيدين': 'pethidine', 'اوكسيكودون': 'oxycodone', 'افيون': 'opioid',
  'يود': 'iodine', 'صبغه': 'contrast',
  'لاتكس': 'latex', 'لاتيكس': 'latex', 'مطاط': 'latex',
};

const _ARABIC_RE = /[؀-ۿ]/;

// strip diacritics/tatweel, unify hamza-carriers and taa-marbuta so spelling
// variants (أموكسيسيلين / اموكسيسيلين, صبغة / صبغه) hit the same alias key
function _normalizeArabic(s) {
  return s
    .replace(/[ً-ْٰ]/g, '')  // harakat / dagger alif
    .replace(/ـ/g, '')                 // tatweel
    .replace(/[آأإ]/g, 'ا')  // آ أ إ → ا
    .replace(/ة/g, 'ه')           // ة → ه
    .replace(/ى/g, 'ي')           // ى → ي
    .replace(/ؤ/g, 'و')           // ؤ → و
    .replace(/ئ/g, 'ي');          // ئ → ي
}

// Latin candidate terms for an Arabic-containing allergen string
function _arabicCandidates(allergenLower) {
  const norm = _normalizeArabic(allergenLower);
  const out = [];
  for (const [ar, latin] of Object.entries(ARABIC_ALIASES)) {
    if (norm.includes(ar) && !out.includes(latin)) out.push(latin);
  }
  return out;
}

// Levenshtein distance, early-out above 2 — tolerates 1-2 typos in class names.
function _lev(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array(n + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  return dp[n];
}

// member match: long members by substring, short ones (like 'asa') token-exact
function _memberHit(text, member) {
  if (member.length >= 5) return text.includes(member);
  return text.split(/[^a-z0-9]+/).includes(member);
}

// classes an allergen string belongs to — by class NAME (incl. typo/fuzzy) or by
// being a MEMBER of the class (allergy recorded as "Amoxicillin" → penicillin).
function _classesOfAllergen(allergenLower) {
  const out = [];
  for (const [classKey, members] of Object.entries(ALLERGEN_DRUG_MAP)) {
    if (allergenLower.includes(classKey)) { out.push(classKey); continue; }
    if (allergenLower.length >= 5 && _lev(allergenLower, classKey) <= 2) { out.push(classKey); continue; }
    if (members.some(m => _memberHit(allergenLower, m))) out.push(classKey);
  }
  return out;
}

/**
 * Returns the matching patient_allergies row (or a copy with _cross/_cross_note
 * for a cross-reactivity hit), or null when no conflict.
 * @param {string} drugName
 * @param {Array<{allergen:string}>} allergies
 */
function checkDrugAllergy(drugName, allergies) {
  if (!allergies || !allergies.length) return null;
  const drugLower = (drugName || '').trim().toLowerCase();
  if (!drugLower) return null;

  for (const a of allergies) {
    let allergenLower = (a.allergen || '').trim().toLowerCase();
    if (!allergenLower) continue;
    if (TYPO_ALIASES[allergenLower]) allergenLower = TYPO_ALIASES[allergenLower];

    // Arabic-entered allergens are translated to canonical Latin terms and run
    // through the same pipeline. The original string stays a candidate too
    // (mixed-script entries like "بنسلين / penicillin").
    const candidates = [allergenLower];
    if (_ARABIC_RE.test(allergenLower)) {
      for (const c of _arabicCandidates(allergenLower)) {
        if (!candidates.includes(c)) candidates.push(c);
      }
    }

    for (const cand of candidates) {
      // 1. direct substring, both directions (≥4 chars so "asa"-like fragments
      //    can't false-positive inside unrelated words)
      if (cand.length >= 4 && drugLower.includes(cand)) return a;
      if (drugLower.length >= 4 && cand.includes(drugLower)) return a;

      const classes = _classesOfAllergen(cand);

      // 2. same-class: drug is a member of a class the allergen names/belongs to
      for (const ck of classes) {
        if (ALLERGEN_DRUG_MAP[ck].some(m => _memberHit(drugLower, m))) return a;
      }

      // 3. cross-class: drug is in a class cross-reactive with the allergen's class
      for (const ck of classes) {
        for (const xc of (CROSS_CLASS[ck] || [])) {
          if (ALLERGEN_DRUG_MAP[xc].some(m => _memberHit(drugLower, m))) {
            return Object.assign({}, a, { _cross: true, _cross_note: ck + ' → ' + xc });
          }
        }
      }
    }
  }
  return null;
}

// Node (server + tests); the browser just gets the top-level function.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkDrugAllergy, ALLERGEN_DRUG_MAP, CROSS_CLASS, ARABIC_ALIASES, _normalizeArabic };
}
