// ============================================================
// HIS — Clinical Decision Support
// (Auto-dose calculator, Sepsis alert, Readmission risk)
// ============================================================

// ============================================================
// DRUG DOSING DATABASE
// ============================================================
// Each drug entry has:
//   - default_dose_per_kg (mg/kg, for adult unless noted)
//   - max_single_dose_mg
//   - max_daily_dose_mg
//   - renal_adjustments: array of { min_egfr, max_egfr, factor (0-1) or 'avoid' }
//   - notes
// ============================================================

const DRUG_DOSING = {
  // ---- Common antibiotics ----
  'amoxicillin': {
    name: 'Amoxicillin',
    name_ar: 'أموكسيسيلين',
    default_dose_per_kg: 25,
    max_single_dose_mg: 1000,
    max_daily_dose_mg: 3000,
    frequency: 'every_8h',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 99, factor: 1.0, note: 'No adjustment' },
      { min_egfr: 10, max_egfr: 29, factor: 0.5, note: 'Reduce to 50%, q12h' },
      { min_egfr: 0,  max_egfr: 9,  factor: 0.33, note: 'Reduce to 33%, q24h' }
    ]
  },
  'ceftriaxone': {
    name: 'Ceftriaxone',
    name_ar: 'سيفترياكسون',
    default_dose_per_kg: 30,
    max_single_dose_mg: 2000,
    max_daily_dose_mg: 4000,
    frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No adjustment needed' }
    ]
  },
  'vancomycin': {
    name: 'Vancomycin',
    name_ar: 'فانكومايسين',
    default_dose_per_kg: 15,
    max_single_dose_mg: 2000,
    max_daily_dose_mg: 4000,
    frequency: 'every_12h',
    renal_adjustments: [
      { min_egfr: 50, max_egfr: 99, factor: 1.0,  note: 'q12h' },
      { min_egfr: 20, max_egfr: 49, factor: 1.0,  note: 'q24h' },
      { min_egfr: 0,  max_egfr: 19, factor: 1.0,  note: 'q48-72h, level-guided' }
    ],
    notes: 'Trough monitoring required'
  },
  'enoxaparin': {
    name: 'Enoxaparin',
    name_ar: 'إينوكسابارين',
    default_dose_per_kg: 1.0,
    max_single_dose_mg: 100,
    max_daily_dose_mg: 200,
    frequency: 'every_12h',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 99, factor: 1.0,  note: '1 mg/kg q12h' },
      { min_egfr: 0,  max_egfr: 29, factor: 1.0,  note: '1 mg/kg q24h (renal adjustment)' }
    ],
    notes: 'Avoid if eGFR < 15. Consider UFH instead.'
  },
  // ---- Common drugs ----
  'metformin': {
    name: 'Metformin',
    name_ar: 'ميتفورمين',
    fixed_dose_mg: 500,
    max_daily_dose_mg: 2000,
    frequency: 'twice_daily',
    renal_adjustments: [
      { min_egfr: 60, max_egfr: 999, factor: 1.0, note: 'Standard dose' },
      { min_egfr: 45, max_egfr: 59, factor: 0.75, note: 'Use with caution' },
      { min_egfr: 30, max_egfr: 44, factor: 0.5, note: 'Reduce dose by 50%' },
      { min_egfr: 0,  max_egfr: 29, factor: 0,   note: 'CONTRAINDICATED (eGFR<30)' }
    ]
  },
  'lisinopril': {
    name: 'Lisinopril',
    name_ar: 'ليسينوبريل',
    fixed_dose_mg: 10,
    max_daily_dose_mg: 40,
    frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: 'Standard dose' },
      { min_egfr: 10, max_egfr: 29, factor: 0.5, note: 'Start at 5mg/day' },
      { min_egfr: 0,  max_egfr: 9,  factor: 0.25, note: 'Start at 2.5mg/day' }
    ]
  },
  'gabapentin': {
    name: 'Gabapentin',
    name_ar: 'جابابنتين',
    fixed_dose_mg: 300,
    max_daily_dose_mg: 3600,
    frequency: 'three_times_daily',
    renal_adjustments: [
      { min_egfr: 60, max_egfr: 999, factor: 1.0, note: '300-1200mg TID' },
      { min_egfr: 30, max_egfr: 59,  factor: 0.5, note: '200-700mg BID' },
      { min_egfr: 15, max_egfr: 29,  factor: 0.33, note: '200-700mg daily' },
      { min_egfr: 0,  max_egfr: 14,  factor: 0.16, note: '100-300mg daily' }
    ]
  },
  'paracetamol': {
    name: 'Paracetamol',
    name_ar: 'باراسيتامول',
    default_dose_per_kg: 15,
    max_single_dose_mg: 1000,
    max_daily_dose_mg: 4000,
    frequency: 'every_6h',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: 'q4-6h' },
      { min_egfr: 10, max_egfr: 29, factor: 1.0,  note: 'q6h (no dose reduction)' },
      { min_egfr: 0,  max_egfr: 9,  factor: 1.0,  note: 'q8h' }
    ]
  },
  'ibuprofen': {
    name: 'Ibuprofen',
    name_ar: 'إيبوبروفين',
    default_dose_per_kg: 10,
    max_single_dose_mg: 800,
    max_daily_dose_mg: 2400,
    frequency: 'every_8h',
    renal_adjustments: [
      { min_egfr: 60, max_egfr: 999, factor: 1.0, note: 'Standard dose' },
      { min_egfr: 30, max_egfr: 59, factor: 0.5, note: 'Caution: NSAID + CKD' },
      { min_egfr: 0,  max_egfr: 29, factor: 0,   note: 'AVOID — risk of AKI' }
    ]
  },
  'aspirin': {
    name: 'Aspirin',
    name_ar: 'أسبرين',
    fixed_dose_mg: 81,
    max_daily_dose_mg: 325,
    frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No adjustment for cardioprotective dose' }]
  },
  'morphine': {
    name: 'Morphine',
    name_ar: 'مورفين',
    default_dose_per_kg: 0.1,
    max_single_dose_mg: 10,
    max_daily_dose_mg: 60,
    frequency: 'every_4h',
    renal_adjustments: [
      { min_egfr: 50, max_egfr: 999, factor: 1.0, note: 'Standard dose' },
      { min_egfr: 30, max_egfr: 49, factor: 0.75, note: 'Reduce by 25%' },
      { min_egfr: 10, max_egfr: 29, factor: 0.5,  note: 'Reduce by 50%, careful monitoring' },
      { min_egfr: 0,  max_egfr: 9,  factor: 0.25, note: 'Use 25% — accumulation of metabolites' }
    ]
  },
  // ---- Additional Antibiotics ----
  'azithromycin': {
    name: 'Azithromycin', name_ar: 'أزيثروميسين',
    fixed_dose_mg: 500, max_daily_dose_mg: 500, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment needed' }]
  },
  'levofloxacin': {
    name: 'Levofloxacin', name_ar: 'ليفوفلوكساسين',
    fixed_dose_mg: 750, max_daily_dose_mg: 750, frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 50, max_egfr: 999, factor: 1.0, note: '750mg daily' },
      { min_egfr: 20, max_egfr: 49, factor: 1.0, note: '750mg q48h' },
      { min_egfr: 0,  max_egfr: 19, factor: 0.66, note: '500mg q48h' }
    ],
    notes: 'Prolongs QT — caution with other QT-prolonging drugs'
  },
  'ciprofloxacin': {
    name: 'Ciprofloxacin', name_ar: 'سيبروفلوكساسين',
    fixed_dose_mg: 500, max_daily_dose_mg: 1500, frequency: 'twice_daily',
    renal_adjustments: [
      { min_egfr: 50, max_egfr: 999, factor: 1.0, note: 'Standard dose BID' },
      { min_egfr: 30, max_egfr: 49, factor: 0.75, note: '250-500mg BID' },
      { min_egfr: 0,  max_egfr: 29, factor: 0.5, note: '250-500mg daily' }
    ]
  },
  'metronidazole': {
    name: 'Metronidazole', name_ar: 'ميترونيدازول',
    fixed_dose_mg: 500, max_daily_dose_mg: 1500, frequency: 'every_8h',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'piperacillin_tazobactam': {
    name: 'Piperacillin-Tazobactam', name_ar: 'بيبراسيلين-تازوباكتام',
    fixed_dose_mg: 4500, max_daily_dose_mg: 18000, frequency: 'every_6h',
    renal_adjustments: [
      { min_egfr: 40, max_egfr: 999, factor: 1.0, note: '4.5g q6h' },
      { min_egfr: 20, max_egfr: 39, factor: 0.75, note: '3.375g q6h' },
      { min_egfr: 0,  max_egfr: 19, factor: 0.5, note: '2.25g q6h' }
    ]
  },
  'meropenem': {
    name: 'Meropenem', name_ar: 'ميروبينيم',
    fixed_dose_mg: 1000, max_daily_dose_mg: 6000, frequency: 'every_8h',
    renal_adjustments: [
      { min_egfr: 50, max_egfr: 999, factor: 1.0, note: '1g q8h' },
      { min_egfr: 25, max_egfr: 49, factor: 1.0, note: '1g q12h' },
      { min_egfr: 10, max_egfr: 24, factor: 0.5, note: '500mg q12h' },
      { min_egfr: 0,  max_egfr: 9,  factor: 0.5, note: '500mg q24h' }
    ]
  },
  'cefepime': {
    name: 'Cefepime', name_ar: 'سيفيبيم',
    fixed_dose_mg: 2000, max_daily_dose_mg: 6000, frequency: 'every_8h',
    renal_adjustments: [
      { min_egfr: 60, max_egfr: 999, factor: 1.0, note: 'Standard 2g q8h' },
      { min_egfr: 30, max_egfr: 59, factor: 1.0, note: '2g q12h' },
      { min_egfr: 11, max_egfr: 29, factor: 0.5, note: '1g q12h' },
      { min_egfr: 0,  max_egfr: 10, factor: 0.25, note: '500mg q24h' }
    ]
  },
  'doxycycline': {
    name: 'Doxycycline', name_ar: 'دوكسيسيكلين',
    fixed_dose_mg: 100, max_daily_dose_mg: 200, frequency: 'twice_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'clindamycin': {
    name: 'Clindamycin', name_ar: 'كليندامايسين',
    fixed_dose_mg: 600, max_daily_dose_mg: 2700, frequency: 'every_8h',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'tmp_smx': {
    name: 'Trimethoprim-Sulfamethoxazole', name_ar: 'تريميثوبريم-سلفاميثوكسازول',
    fixed_dose_mg: 160, max_daily_dose_mg: 320, frequency: 'twice_daily',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: 'Standard dose' },
      { min_egfr: 15, max_egfr: 29, factor: 0.5, note: 'Reduce by 50%' },
      { min_egfr: 0,  max_egfr: 14, factor: 0, note: 'AVOID — risk of hyperkalemia/AKI' }
    ]
  },
  // ---- Anticoagulants ----
  'warfarin': {
    name: 'Warfarin', name_ar: 'وارفارين',
    fixed_dose_mg: 5, max_daily_dose_mg: 10, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'INR-guided. Initial 5mg/day' }],
    notes: 'Monitor INR. Many drug interactions.'
  },
  'rivaroxaban': {
    name: 'Rivaroxaban', name_ar: 'ريفاروكسابان',
    fixed_dose_mg: 20, max_daily_dose_mg: 20, frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 50, max_egfr: 999, factor: 1.0, note: '20mg daily with food' },
      { min_egfr: 15, max_egfr: 49, factor: 0.75, note: '15mg daily' },
      { min_egfr: 0,  max_egfr: 14, factor: 0, note: 'AVOID' }
    ]
  },
  'apixaban': {
    name: 'Apixaban', name_ar: 'أبيكسابان',
    fixed_dose_mg: 5, max_daily_dose_mg: 10, frequency: 'twice_daily',
    renal_adjustments: [
      { min_egfr: 25, max_egfr: 999, factor: 1.0, note: '5mg BID (2.5mg if 2 of: age≥80, weight≤60kg, Cr≥1.5)' },
      { min_egfr: 15, max_egfr: 24, factor: 0.5, note: '2.5mg BID' },
      { min_egfr: 0,  max_egfr: 14, factor: 0, note: 'Not recommended' }
    ]
  },
  'heparin': {
    name: 'Heparin (unfractionated)', name_ar: 'هيبارين',
    default_dose_per_kg: 80, max_single_dose_mg: 10000, max_daily_dose_mg: 40000,
    frequency: 'continuous',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment. aPTT-guided.' }]
  },
  // ---- Cardiovascular ----
  'atorvastatin': {
    name: 'Atorvastatin', name_ar: 'أتورفاستاتين',
    fixed_dose_mg: 40, max_daily_dose_mg: 80, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'rosuvastatin': {
    name: 'Rosuvastatin', name_ar: 'روسوفاستاتين',
    fixed_dose_mg: 20, max_daily_dose_mg: 40, frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: 'Standard 10-40mg' },
      { min_egfr: 0,  max_egfr: 29, factor: 0.25, note: 'Start 5mg, max 10mg' }
    ]
  },
  'clopidogrel': {
    name: 'Clopidogrel', name_ar: 'كلوبيدوغريل',
    fixed_dose_mg: 75, max_daily_dose_mg: 75, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: '75mg daily after 300mg loading' }]
  },
  'amlodipine': {
    name: 'Amlodipine', name_ar: 'أملوديبين',
    fixed_dose_mg: 5, max_daily_dose_mg: 10, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'losartan': {
    name: 'Losartan', name_ar: 'لوسارتان',
    fixed_dose_mg: 50, max_daily_dose_mg: 100, frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: '50-100mg daily' },
      { min_egfr: 0,  max_egfr: 29, factor: 0.5, note: 'Start 25mg, monitor K+' }
    ]
  },
  'enalapril': {
    name: 'Enalapril', name_ar: 'إنالابريل',
    fixed_dose_mg: 10, max_daily_dose_mg: 40, frequency: 'twice_daily',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: 'Standard dose' },
      { min_egfr: 10, max_egfr: 29, factor: 0.5, note: 'Start 5mg/day' },
      { min_egfr: 0,  max_egfr: 9, factor: 0.25, note: 'Start 2.5mg/day' }
    ]
  },
  'metoprolol': {
    name: 'Metoprolol', name_ar: 'ميتوبرولول',
    fixed_dose_mg: 50, max_daily_dose_mg: 200, frequency: 'twice_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'bisoprolol': {
    name: 'Bisoprolol', name_ar: 'بيسوبرولول',
    fixed_dose_mg: 5, max_daily_dose_mg: 10, frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 40, max_egfr: 999, factor: 1.0, note: 'Standard dose' },
      { min_egfr: 0,  max_egfr: 39, factor: 0.5, note: 'Max 10mg/day, start lower' }
    ]
  },
  'carvedilol': {
    name: 'Carvedilol', name_ar: 'كارفيديلول',
    fixed_dose_mg: 12.5, max_daily_dose_mg: 50, frequency: 'twice_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'furosemide': {
    name: 'Furosemide', name_ar: 'فوروسيميد',
    fixed_dose_mg: 40, max_daily_dose_mg: 600, frequency: 'twice_daily',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: 'Standard 40-80mg BID' },
      { min_egfr: 0,  max_egfr: 29, factor: 2.0, note: 'May need HIGH doses for diuresis' }
    ]
  },
  'spironolactone': {
    name: 'Spironolactone', name_ar: 'سبيرونولاكتون',
    fixed_dose_mg: 25, max_daily_dose_mg: 100, frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: 'Monitor K+' },
      { min_egfr: 0,  max_egfr: 29, factor: 0, note: 'AVOID — hyperkalemia risk' }
    ]
  },
  'hydrochlorothiazide': {
    name: 'Hydrochlorothiazide', name_ar: 'هيدروكلوروثيازيد',
    fixed_dose_mg: 25, max_daily_dose_mg: 50, frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: 'Standard dose' },
      { min_egfr: 0,  max_egfr: 29, factor: 0, note: 'Ineffective when eGFR<30 — use loop diuretic' }
    ]
  },
  'digoxin': {
    name: 'Digoxin', name_ar: 'ديجوكسين',
    fixed_dose_mg: 0.125, max_daily_dose_mg: 0.25, frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 50, max_egfr: 999, factor: 1.0, note: '0.125-0.25mg daily' },
      { min_egfr: 10, max_egfr: 49, factor: 0.5, note: '0.125mg daily or q48h' },
      { min_egfr: 0,  max_egfr: 9, factor: 0.5, note: '0.125mg q48-72h, level-guided' }
    ],
    notes: 'Narrow therapeutic index — monitor levels'
  },
  'amiodarone': {
    name: 'Amiodarone', name_ar: 'أميودارون',
    fixed_dose_mg: 200, max_daily_dose_mg: 400, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }],
    notes: 'Monitor TFTs, LFTs, pulmonary function annually'
  },
  // ---- Diabetes ----
  'insulin_regular': {
    name: 'Insulin Regular', name_ar: 'إنسولين عادي',
    fixed_dose_mg: 10, max_daily_dose_mg: 100, frequency: 'every_6h',
    renal_adjustments: [
      { min_egfr: 50, max_egfr: 999, factor: 1.0, note: 'Standard dosing' },
      { min_egfr: 10, max_egfr: 49, factor: 0.75, note: 'Reduce 25% — slower clearance' },
      { min_egfr: 0,  max_egfr: 9,  factor: 0.5, note: 'Reduce 50% — risk hypoglycemia' }
    ]
  },
  'glargine': {
    name: 'Insulin Glargine', name_ar: 'إنسولين جلارجين',
    fixed_dose_mg: 20, max_daily_dose_mg: 100, frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 50, max_egfr: 999, factor: 1.0, note: 'Standard dosing' },
      { min_egfr: 10, max_egfr: 49, factor: 0.75, note: 'Reduce 25%' },
      { min_egfr: 0,  max_egfr: 9,  factor: 0.5, note: 'Reduce 50%' }
    ]
  },
  'gliclazide': {
    name: 'Gliclazide', name_ar: 'جليكلازيد',
    fixed_dose_mg: 80, max_daily_dose_mg: 320, frequency: 'twice_daily',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: 'Standard dose' },
      { min_egfr: 0,  max_egfr: 29, factor: 0, note: 'AVOID — risk severe hypoglycemia' }
    ]
  },
  'sitagliptin': {
    name: 'Sitagliptin', name_ar: 'سيتاجليبتين',
    fixed_dose_mg: 100, max_daily_dose_mg: 100, frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 50, max_egfr: 999, factor: 1.0, note: '100mg daily' },
      { min_egfr: 30, max_egfr: 49, factor: 0.5, note: '50mg daily' },
      { min_egfr: 0,  max_egfr: 29, factor: 0.25, note: '25mg daily' }
    ]
  },
  'empagliflozin': {
    name: 'Empagliflozin', name_ar: 'إمباجليفلوزين',
    fixed_dose_mg: 10, max_daily_dose_mg: 25, frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 45, max_egfr: 999, factor: 1.0, note: '10-25mg daily' },
      { min_egfr: 30, max_egfr: 44, factor: 1.0, note: '10mg (no titration up)' },
      { min_egfr: 0,  max_egfr: 29, factor: 0, note: 'Not recommended' }
    ]
  },
  // ---- GI ----
  'omeprazole': {
    name: 'Omeprazole', name_ar: 'أوميبرازول',
    fixed_dose_mg: 20, max_daily_dose_mg: 80, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'pantoprazole': {
    name: 'Pantoprazole', name_ar: 'بانتوبرازول',
    fixed_dose_mg: 40, max_daily_dose_mg: 80, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'ranitidine': {
    name: 'Ranitidine', name_ar: 'رانيتيدين',
    fixed_dose_mg: 150, max_daily_dose_mg: 300, frequency: 'twice_daily',
    renal_adjustments: [
      { min_egfr: 50, max_egfr: 999, factor: 1.0, note: 'Standard dose' },
      { min_egfr: 0,  max_egfr: 49, factor: 0.5, note: 'Reduce 50%' }
    ]
  },
  'ondansetron': {
    name: 'Ondansetron', name_ar: 'أوندانسيترون',
    fixed_dose_mg: 4, max_daily_dose_mg: 16, frequency: 'every_8h',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }],
    notes: 'QT prolongation. Max single IV dose 16mg.'
  },
  'metoclopramide': {
    name: 'Metoclopramide', name_ar: 'ميتوكلوبراميد',
    fixed_dose_mg: 10, max_daily_dose_mg: 40, frequency: 'every_6h',
    renal_adjustments: [
      { min_egfr: 60, max_egfr: 999, factor: 1.0, note: 'Standard' },
      { min_egfr: 30, max_egfr: 59, factor: 0.75, note: 'Reduce 25%' },
      { min_egfr: 0,  max_egfr: 29, factor: 0.5, note: 'Reduce 50%' }
    ]
  },
  'loperamide': {
    name: 'Loperamide', name_ar: 'لوبيراميد',
    fixed_dose_mg: 4, max_daily_dose_mg: 16, frequency: 'as_needed',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  // ---- Respiratory ----
  'salbutamol': {
    name: 'Salbutamol (Albuterol)', name_ar: 'سالبوتامول',
    fixed_dose_mg: 2.5, max_daily_dose_mg: 20, frequency: 'every_4h',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'ipratropium': {
    name: 'Ipratropium', name_ar: 'إيبراتروبيوم',
    fixed_dose_mg: 0.5, max_daily_dose_mg: 2, frequency: 'every_6h',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'budesonide': {
    name: 'Budesonide', name_ar: 'بوديسونيد',
    fixed_dose_mg: 0.5, max_daily_dose_mg: 2, frequency: 'twice_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'montelukast': {
    name: 'Montelukast', name_ar: 'مونتيلوكاست',
    fixed_dose_mg: 10, max_daily_dose_mg: 10, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'prednisone': {
    name: 'Prednisone', name_ar: 'بريدنيزون',
    default_dose_per_kg: 1.0, max_single_dose_mg: 60, max_daily_dose_mg: 60, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  // ---- Neuro / Psych ----
  'lorazepam': {
    name: 'Lorazepam', name_ar: 'لورازيبام',
    fixed_dose_mg: 1, max_daily_dose_mg: 10, frequency: 'every_8h',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: 'Standard dose' },
      { min_egfr: 0,  max_egfr: 29, factor: 0.5, note: 'Reduce — preferred over diazepam in CKD' }
    ]
  },
  'diazepam': {
    name: 'Diazepam', name_ar: 'ديازيبام',
    fixed_dose_mg: 5, max_daily_dose_mg: 40, frequency: 'every_8h',
    renal_adjustments: [
      { min_egfr: 50, max_egfr: 999, factor: 1.0, note: 'Standard dose' },
      { min_egfr: 10, max_egfr: 49, factor: 0.75, note: 'Reduce 25%' },
      { min_egfr: 0,  max_egfr: 9, factor: 0.5, note: 'Reduce 50% — long half-life' }
    ]
  },
  'haloperidol': {
    name: 'Haloperidol', name_ar: 'هالوبيريدول',
    fixed_dose_mg: 2, max_daily_dose_mg: 20, frequency: 'every_8h',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment. ECG QT.' }]
  },
  'quetiapine': {
    name: 'Quetiapine', name_ar: 'كويتيابين',
    fixed_dose_mg: 50, max_daily_dose_mg: 800, frequency: 'twice_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'sertraline': {
    name: 'Sertraline', name_ar: 'سيرترالين',
    fixed_dose_mg: 50, max_daily_dose_mg: 200, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'levetiracetam': {
    name: 'Levetiracetam', name_ar: 'ليفيتيراسيتام',
    fixed_dose_mg: 500, max_daily_dose_mg: 3000, frequency: 'twice_daily',
    renal_adjustments: [
      { min_egfr: 80, max_egfr: 999, factor: 1.0, note: '500-1500mg BID' },
      { min_egfr: 50, max_egfr: 79, factor: 0.66, note: '500-1000mg BID' },
      { min_egfr: 30, max_egfr: 49, factor: 0.5, note: '250-750mg BID' },
      { min_egfr: 0,  max_egfr: 29, factor: 0.33, note: '250-500mg BID' }
    ]
  },
  'phenytoin': {
    name: 'Phenytoin', name_ar: 'فينيتوين',
    fixed_dose_mg: 100, max_daily_dose_mg: 600, frequency: 'every_8h',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'Level-guided, free-fraction higher in CKD' }],
    notes: 'Monitor levels. Many drug interactions.'
  },
  // ---- Other commonly used ----
  'tramadol': {
    name: 'Tramadol', name_ar: 'ترامادول',
    fixed_dose_mg: 50, max_daily_dose_mg: 400, frequency: 'every_6h',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: 'Standard 50-100mg q6h' },
      { min_egfr: 10, max_egfr: 29, factor: 0.75, note: '50-75mg q12h, max 200mg/day' },
      { min_egfr: 0,  max_egfr: 9, factor: 0.5, note: 'Avoid — accumulation of metabolites' }
    ]
  },
  'fentanyl': {
    name: 'Fentanyl', name_ar: 'فنتانيل',
    default_dose_per_kg: 0.001, max_single_dose_mg: 0.1, max_daily_dose_mg: 1, frequency: 'every_1h',
    renal_adjustments: [
      { min_egfr: 50, max_egfr: 999, factor: 1.0, note: 'Standard dosing' },
      { min_egfr: 10, max_egfr: 49, factor: 0.75, note: 'Caution, reduce 25%' },
      { min_egfr: 0,  max_egfr: 9, factor: 0.5, note: 'Reduce 50%' }
    ]
  },
  'ketorolac': {
    name: 'Ketorolac', name_ar: 'كيتورولاك',
    fixed_dose_mg: 30, max_daily_dose_mg: 120, frequency: 'every_6h',
    renal_adjustments: [
      { min_egfr: 60, max_egfr: 999, factor: 1.0, note: 'Standard IV/IM' },
      { min_egfr: 0,  max_egfr: 59, factor: 0, note: 'AVOID — NSAID + renal disease' }
    ],
    notes: 'Max 5 days. Risk GI bleed, AKI.'
  },
  'allopurinol': {
    name: 'Allopurinol', name_ar: 'ألوبيورينول',
    fixed_dose_mg: 300, max_daily_dose_mg: 800, frequency: 'once_daily',
    renal_adjustments: [
      { min_egfr: 60, max_egfr: 999, factor: 1.0, note: '300mg daily' },
      { min_egfr: 30, max_egfr: 59, factor: 0.66, note: '200mg daily' },
      { min_egfr: 10, max_egfr: 29, factor: 0.33, note: '100mg daily' },
      { min_egfr: 0,  max_egfr: 9, factor: 0.16, note: '100mg q48h' }
    ]
  },
  'levothyroxine': {
    name: 'Levothyroxine', name_ar: 'ليفوثيروكسين',
    fixed_dose_mg: 0.1, max_daily_dose_mg: 0.3, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment. TSH-guided.' }]
  },
  'iron_sulfate': {
    name: 'Iron Sulfate', name_ar: 'كبريتات الحديد',
    fixed_dose_mg: 325, max_daily_dose_mg: 975, frequency: 'three_times_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'folic_acid': {
    name: 'Folic Acid', name_ar: 'حمض الفوليك',
    fixed_dose_mg: 5, max_daily_dose_mg: 5, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'vitamin_d': {
    name: 'Vitamin D3 (Cholecalciferol)', name_ar: 'فيتامين د3',
    fixed_dose_mg: 1000, max_daily_dose_mg: 5000, frequency: 'once_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment, but use calcitriol if severe CKD' }]
  },
  'calcium_carbonate': {
    name: 'Calcium Carbonate', name_ar: 'كربونات الكالسيوم',
    fixed_dose_mg: 500, max_daily_dose_mg: 2000, frequency: 'twice_daily',
    renal_adjustments: [{ min_egfr: 0, max_egfr: 999, factor: 1.0, note: 'No renal adjustment' }]
  },
  'magnesium_sulfate': {
    name: 'Magnesium Sulfate', name_ar: 'كبريتات المغنيسيوم',
    fixed_dose_mg: 2000, max_daily_dose_mg: 6000, frequency: 'every_8h',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: 'Standard dose' },
      { min_egfr: 0,  max_egfr: 29, factor: 0.5, note: 'Reduce 50% — risk hypermagnesemia' }
    ]
  },
  'potassium_chloride': {
    name: 'Potassium Chloride', name_ar: 'كلوريد البوتاسيوم',
    fixed_dose_mg: 600, max_daily_dose_mg: 4800, frequency: 'as_needed',
    renal_adjustments: [
      { min_egfr: 30, max_egfr: 999, factor: 1.0, note: 'K-level-guided' },
      { min_egfr: 0,  max_egfr: 29, factor: 0.5, note: 'EXTREME caution — hyperkalemia risk' }
    ]
  }
};

/**
 * Calculate recommended dose for a drug given patient parameters.
 * @param {string} drugKey - lowercase key in DRUG_DOSING
 * @param {number} weightKg - patient weight in kg
 * @param {number} egfr - estimated GFR (mL/min/1.73m²); null = unknown (assume normal)
 * @returns {object|null} { single_dose_mg, daily_dose_mg, frequency, warnings, raw_dose, factor }
 *
 * NOTE: uses TOTAL body weight for mg/kg drugs. It does NOT adjust for ideal /
 * adjusted body weight (obesity), pediatric weight bands, or non-renal organ
 * function — so it can over-estimate for some agents (e.g. vancomycin, heparin)
 * in obese patients. Estimate only; needs clinician verification (see README).
 */
function calcRecommendedDose(drugKey, weightKg, egfr) {
  const drug = DRUG_DOSING[drugKey.toLowerCase()];
  if (!drug) return null;

  weightKg = parseFloat(weightKg);
  egfr = egfr == null ? null : parseFloat(egfr);

  // Find renal adjustment
  let renalFactor = 1.0;
  let renalNote = null;
  if (egfr != null && drug.renal_adjustments) {
    for (const adj of drug.renal_adjustments) {
      if (egfr >= adj.min_egfr && egfr <= adj.max_egfr) {
        renalFactor = adj.factor;
        renalNote = adj.note;
        break;
      }
    }
  }

  let rawSingle, rawDaily;
  if (drug.default_dose_per_kg && weightKg) {
    rawSingle = drug.default_dose_per_kg * weightKg;
    if (drug.max_single_dose_mg) rawSingle = Math.min(rawSingle, drug.max_single_dose_mg);
  } else if (drug.fixed_dose_mg) {
    rawSingle = drug.fixed_dose_mg;
  } else if (drug.default_dose_per_kg && !weightKg) {
    // Weight-based drug but weight unknown — use max as conservative default with warning
    rawSingle = drug.max_single_dose_mg || (drug.default_dose_per_kg * 70); // 70kg fallback
    return {
      drug_name: drug.name,
      drug_name_ar: drug.name_ar,
      single_dose_mg: Math.round(rawSingle * 10) / 10,
      daily_dose_mg: Math.round(rawSingle * 10) / 10,
      frequency: drug.frequency,
      raw_dose: rawSingle,
      renal_factor: 1,
      warnings: ['Weight UNKNOWN — using 70kg default. ENTER WEIGHT for accurate dose.'],
      contraindicated: false,
      weight_missing: true
    };
  } else {
    return null;
  }

  const adjustedSingle = renalFactor === 0 ? 0 : rawSingle * renalFactor;
  // Estimate daily dose based on frequency
  const freqMap = {
    once_daily: 1, every_24h: 1, qd: 1,
    twice_daily: 2, every_12h: 2, bid: 2,
    three_times_daily: 3, every_8h: 3, tid: 3,
    every_6h: 4, qid: 4,
    every_4h: 6
  };
  const dosesPerDay = freqMap[drug.frequency] || 1;
  let adjustedDaily = adjustedSingle * dosesPerDay;
  if (drug.max_daily_dose_mg && renalFactor !== 0) adjustedDaily = Math.min(adjustedDaily, drug.max_daily_dose_mg);

  const warnings = [];
  if (renalFactor === 0) warnings.push('CONTRAINDICATED: ' + (renalNote || 'Severe renal impairment'));
  if (renalFactor > 0 && renalFactor < 1) warnings.push('Renal dose reduction: ' + renalNote);
  if (!weightKg && drug.default_dose_per_kg) warnings.push('Weight unknown — using fixed dose');
  if (drug.notes) warnings.push(drug.notes);

  return {
    drug_name: drug.name,
    drug_name_ar: drug.name_ar,
    single_dose_mg: Math.round(adjustedSingle * 10) / 10,
    daily_dose_mg: Math.round(adjustedDaily * 10) / 10,
    frequency: drug.frequency,
    raw_dose: Math.round(rawSingle * 10) / 10,
    renal_factor: renalFactor,
    warnings,
    contraindicated: renalFactor === 0
  };
}

/**
 * Render an inline auto-dose widget inside a div.
 * @param {string} containerId - DOM id to render into
 * @param {object} opts - { patientId, drugInputId, weightInputId, egfrInputId, doseInputId, freqInputId }
 */
function renderAutoDoseWidget(containerId, opts) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const lang = currentLanguage();

  function update() {
    const drugInput = document.getElementById(opts.drugInputId);
    const weightInput = document.getElementById(opts.weightInputId);
    const egfrInput = document.getElementById(opts.egfrInputId);
    if (!drugInput) return;

    const drug = (drugInput.value || '').trim().toLowerCase().split(' ')[0]; // first word
    const weight = parseFloat(weightInput?.value);
    const egfr = egfrInput?.value ? parseFloat(egfrInput.value) : null;

    if (!drug || !DRUG_DOSING[drug]) {
      container.innerHTML = '';
      return;
    }
    const result = calcRecommendedDose(drug, weight, egfr);
    if (!result) { container.innerHTML = ''; return; }

    const drugLabel = lang === 'ar' ? result.drug_name_ar : result.drug_name;
    const warnHtml = result.warnings.map(w => {
      const cls = w.includes('CONTRAINDICATED') ? 'autodose-warning' : 'autodose-warning';
      const style = w.includes('CONTRAINDICATED')
        ? 'background:#fee2e2;color:#7f1d1d;font-weight:600'
        : '';
      return `<div class="${cls}" style="${style}">&#9888;&#65039; ${escapeHtml(w)}</div>`;
    }).join('');

    container.innerHTML = `
      <div class="autodose-widget">
        <h4>&#129524; ${lang==='ar'?'حاسبة الجرعة الذكية':'Smart Dose Calculator'}: ${escapeHtml(drugLabel)}</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <div style="color:#1e40af;font-size:0.8rem">${lang==='ar'?'جرعة مفردة موصى بها':'Recommended single dose'}</div>
            <div style="font-size:1.2rem;font-weight:700">${result.single_dose_mg} mg</div>
          </div>
          <div>
            <div style="color:#1e40af;font-size:0.8rem">${lang==='ar'?'إجمالي يومي مقدر':'Estimated daily dose'}</div>
            <div style="font-size:1.2rem;font-weight:700">${result.daily_dose_mg} mg</div>
          </div>
        </div>
        <div style="font-size:0.85rem;color:#6b7280;margin-top:6px">
          ${lang==='ar'?'الإيقاع المقترح':'Suggested frequency'}: <strong>${escapeHtml(result.frequency)}</strong>
          ${result.renal_factor < 1 ? ` • <span style="color:#dc2626">${lang==='ar'?'مع تعديل كلوي':'with renal adjustment'}</span>` : ''}
        </div>
        ${warnHtml}
        <div style="font-size:0.75rem;color:#92400e;background:#fffbeb;border-radius:6px;padding:6px 8px;margin-top:6px">
          ${lang==='ar'
            ? '⚠️ تقدير مبدئي بحسب وزن الجسم الكلي. تحقّق من الجرعة حسب الوزن المثالي/المعدّل في حالات السمنة، وجرعات الأطفال، ووظيفة الكلى، ودليل المستشفى قبل الوصف.'
            : '⚠️ Rough estimate using total body weight. Verify against ideal/adjusted body weight (obesity), pediatric dosing, renal function, and your formulary before prescribing.'}
        </div>
        ${!result.contraindicated && opts.doseInputId ? `
          <button type="button" class="btn btn-sm btn-primary" style="margin-top:8px"
                  onclick="document.getElementById('${opts.doseInputId}').value='${result.single_dose_mg}mg'; ${opts.freqInputId?`document.getElementById('${opts.freqInputId}').value='${result.frequency}';`:''}">
            ${lang==='ar'?'استخدم هذه الجرعة':'Use this dose'}
          </button>
        ` : ''}
      </div>
    `;
  }

  // Hook input listeners
  [opts.drugInputId, opts.weightInputId, opts.egfrInputId].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.autodoseHooked) {
      el.addEventListener('input', update);
      el.dataset.autodoseHooked = '1';
    }
  });

  // Initial render
  update();
}

// Helper: build datalist of available drugs for autocomplete
function autoDoseAvailableDrugs() {
  return Object.entries(DRUG_DOSING).map(([k, v]) => ({ key: k, name: v.name, name_ar: v.name_ar }));
}

// ============================================================
// SEPSIS AUTO-ALERT  (SCREENING ONLY — not a diagnosis)
// ============================================================
// Triggered when vitals are recorded. This is a bedside *screen* that prompts
// review; it does NOT diagnose sepsis.
//   - qSOFA ≥ 2 (resp_rate ≥ 22, SBP ≤ 100, AVPU not "alert") — Sepsis-3 screen
//   - SIRS (temp; HR ≥ 90; RR ≥ 20) is shown as a legacy adjunct signal only.
//     SIRS was REMOVED from the Sepsis-3 definition (Singer et al., JAMA 2016);
//     qSOFA is a screening prompt, NOT a diagnostic criterion. True Sepsis-3 =
//     suspected infection + an acute rise in the full SOFA score ≥ 2.
// TODO(clinical): full SOFA + infection-suspicion gating needs MD / clinical
//   informaticist sign-off before any real use (see README "Read this first").
// ============================================================

/**
 * Check vitals for sepsis criteria.
 * @param {object} vitals - { temp, hr, rr, sbp, consciousness, qsofa_score }
 * @returns {object|null} { severity, criteria_met, score } or null
 */
function checkSepsisCriteria(vitals) {
  const v = vitals;
  let qsofa = 0;
  if (v.rr != null && v.rr >= 22) qsofa++;
  if (v.sbp != null && v.sbp <= 100) qsofa++;
  if (v.consciousness && v.consciousness !== 'alert') qsofa++;

  // Use stored score if higher
  if (v.qsofa_score != null && v.qsofa_score > qsofa) qsofa = v.qsofa_score;

  const sirsMet = [];
  if (v.temp != null && (v.temp >= 38 || v.temp <= 36)) sirsMet.push('temperature');
  if (v.hr   != null && v.hr >= 90) sirsMet.push('heart_rate');
  if (v.rr   != null && v.rr >= 20) sirsMet.push('respiratory_rate');

  let severity = null;
  let criteria_met = [];

  if (qsofa >= 2) {
    severity = 'high';
    criteria_met.push(`qSOFA = ${qsofa}/3`);
  }
  if (sirsMet.length >= 2) {
    criteria_met.push(`SIRS criteria: ${sirsMet.join(', ')}`);
    if (!severity) severity = 'moderate';
  }

  if (!severity) return null;
  return { severity, criteria_met, qsofa, sirs_count: sirsMet.length };
}

/**
 * Show sepsis alert banner and log to DB.
 * Called from vitals recording flow.
 */
function maybeShowSepsisAlert(admissionId, vitalsId, vitalsObj) {
  const check = checkSepsisCriteria(vitalsObj);
  if (!check) return false;

  const lang = currentLanguage();

  // Log to DB
  try {
    dbRun(`INSERT INTO sepsis_alerts (admission_id, vitals_id, qsofa_score, news2_score, temp, severity, triggered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [admissionId, vitalsId || null, check.qsofa, vitalsObj.news2_score || null,
       vitalsObj.temp || null, check.severity, nowISO()]);
    saveDBToIndexedDB();
  } catch (e) {
    console.warn('[Sepsis] Failed to log alert:', e);
  }

  // Show banner alert
  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  overlay.innerHTML = `
    <div class="alert-modal" style="max-width:520px;border:3px solid #dc2626">
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-size:3rem">&#128680;</div>
        <h2 style="color:#dc2626;margin:8px 0">${lang==='ar'?'تنبيه: احتمالية إنتان (Sepsis)':'SEPSIS ALERT: HIGH PRIORITY'}</h2>
      </div>
      <p style="font-weight:600;margin-bottom:12px">${lang==='ar'?'تم رصد معايير الإنتان:':'Sepsis screening criteria met:'}</p>
      <ul style="background:#fef2f2;padding:12px 28px;border-radius:6px;margin-bottom:12px">
        ${check.criteria_met.map(c => `<li>${escapeHtml(c)}</li>`).join('')}
      </ul>
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:10px 12px;border-radius:6px;font-size:0.9rem">
        <strong>${lang==='ar'?'الإجراءات الموصى بها (Sepsis-6):':'Recommended actions (Sepsis-6):'}</strong>
        <ol style="margin:6px 0 0 20px;padding:0">
          <li>${lang==='ar'?'إعطاء أوكسجين عالي التركيز':'Give high-flow oxygen'}</li>
          <li>${lang==='ar'?'سحب مزرعة دم وفحوصات':'Take blood cultures + labs (lactate)'}</li>
          <li>${lang==='ar'?'بدء مضادات حيوية وريدية':'Start IV broad-spectrum antibiotics'}</li>
          <li>${lang==='ar'?'بدء السوائل الوريدية':'Begin IV fluid resuscitation'}</li>
          <li>${lang==='ar'?'قياس مستوى اللاكتات':'Check serum lactate'}</li>
          <li>${lang==='ar'?'قياس ساعي للبول (foley)':'Monitor hourly urine output (foley)'}</li>
        </ol>
      </div>
      <div class="alert-buttons" style="margin-top:14px">
        <button class="btn btn-primary" onclick="acknowledgeSepsisAlert(${admissionId}); this.closest('.alert-overlay').remove()">
          ${lang==='ar'?'تأكيد التنبيه وبدء التقييم':'Acknowledge & Start Workup'}
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return true;
}

async function acknowledgeSepsisAlert(admissionId) {
  const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (!user) return;
  dbRun(`UPDATE sepsis_alerts SET acknowledged_by = ?, acknowledged_at = ?, action_taken = ?
    WHERE admission_id = ? AND acknowledged_at IS NULL`,
    [user.user_id, nowISO(), 'workup_initiated', admissionId]);
  saveDBToIndexedDB();
  if (typeof showSuccess === 'function') showSuccess('Sepsis alert acknowledged');
}

// ============================================================
// READMISSION RISK SCORE (HOSPITAL Score - simplified)
// ============================================================
// Factors:
//   - Hemoglobin <12: +1
//   - Discharge from oncology service: +2
//   - Length of stay ≥5 days: +2
//   - Procedure during stay: +1
//   - Number of ED visits in past 12mo: +1 each (max 4)
//   - Age ≥65: +1
//   - Chronic conditions ≥2: +2
// Risk levels:  0-4 Low, 5-8 Medium, 9+ High
// ============================================================

/**
 * Calculate readmission risk score for an admission about to be discharged.
 * @param {number} admissionId
 * @returns {object} { score, level, factors }
 */
function calcReadmissionRisk(admissionId) {
  const adm = dbGet(`SELECT a.*, p.date_of_birth FROM admissions a
    LEFT JOIN patients p ON a.patient_id = p.patient_id WHERE a.admission_id = ?`, [admissionId]);
  if (!adm) return { score: 0, level: 'low', factors: [] };

  const factors = [];
  let score = 0;

  // Age
  if (adm.date_of_birth) {
    const age = Math.floor((Date.now() - new Date(adm.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000));
    if (age >= 65) {
      score += 1;
      factors.push({ factor: 'age_65', label_en: `Age ≥65 (${age})`, label_ar: `العمر ≥65 (${age})`, points: 1 });
    }
  }

  // Length of stay
  if (adm.admitted_at) {
    const admittedDate = new Date(adm.admitted_at);
    const endDate = adm.discharged_at ? new Date(adm.discharged_at) : new Date();
    const losDays = Math.ceil((endDate - admittedDate) / (24 * 3600 * 1000));
    if (losDays >= 5) {
      score += 2;
      factors.push({ factor: 'long_stay', label_en: `Length of stay ≥5 days (${losDays} days)`, label_ar: `مدة الإقامة ≥5 أيام (${losDays} يوم)`, points: 2 });
    }
  }

  // Chronic conditions count
  const conds = dbAll('SELECT * FROM patient_conditions WHERE patient_id = ?', [adm.patient_id]);
  if (conds.length >= 2) {
    score += 2;
    factors.push({ factor: 'multimorbidity', label_en: `Multimorbidity (${conds.length} chronic conditions)`, label_ar: `أمراض متعددة (${conds.length} حالات مزمنة)`, points: 2 });
  }

  // Critical lab values during admission
  const criticalLabs = dbGet(`SELECT COUNT(*) as c FROM lab_orders WHERE admission_id = ? AND is_critical = 1`, [admissionId]);
  if (criticalLabs && criticalLabs.c > 0) {
    score += 2;
    factors.push({ factor: 'critical_labs', label_en: `Critical lab values during stay (${criticalLabs.c})`, label_ar: `نتائج مختبر حرجة خلال الإقامة (${criticalLabs.c})`, points: 2 });
  }

  // Active code blue event
  const codeBlue = dbGet(`SELECT COUNT(*) as c FROM code_blue_events WHERE admission_id = ?`, [admissionId]);
  if (codeBlue && codeBlue.c > 0) {
    score += 3;
    factors.push({ factor: 'code_blue', label_en: 'Code Blue event during admission', label_ar: 'حدث Code Blue أثناء الإدخال', points: 3 });
  }

  // High-risk department (ICU)
  if (adm.dept_id === 4) {
    score += 2;
    factors.push({ factor: 'icu_stay', label_en: 'ICU admission', label_ar: 'إقامة في العناية المركزة', points: 2 });
  }

  // Active prescriptions ≥5 (polypharmacy)
  const rxCount = dbGet(`SELECT COUNT(*) as c FROM prescriptions WHERE admission_id = ? AND status='active'`, [admissionId]);
  if (rxCount && rxCount.c >= 5) {
    score += 1;
    factors.push({ factor: 'polypharmacy', label_en: `Polypharmacy (${rxCount.c} active meds)`, label_ar: `تعدد الأدوية (${rxCount.c} أدوية فعالة)`, points: 1 });
  }

  // Determine risk level
  let level = 'low';
  if (score >= 9) level = 'high';
  else if (score >= 5) level = 'medium';

  return { score, level, factors };
}

/**
 * Render readmission risk widget for discharge summary.
 */
function renderReadmissionRiskWidget(admissionId, lang) {
  const result = calcReadmissionRisk(admissionId);
  lang = lang || currentLanguage();
  const cls = 'readmit-risk-' + (result.level === 'medium' ? 'med' : result.level);
  const levelLabel = lang === 'ar'
    ? { low: 'منخفض', medium: 'متوسط', high: 'مرتفع' }[result.level]
    : { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' }[result.level];
  const levelColor = { low: '#10b981', medium: '#f59e0b', high: '#dc2626' }[result.level];

  return `
    <div class="readmit-risk-card ${cls}">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <h4>${lang==='ar'?'مؤشر خطر إعادة الإدخال خلال 30 يوماً':'30-Day Readmission Risk Score'}</h4>
          <div style="font-size:0.85rem;color:#6b7280;margin-top:2px">
            ${lang==='ar'?'محسوب آلياً بناءً على عوامل المريض':'Computed automatically based on patient factors'}
          </div>
        </div>
        <div style="text-align:center">
          <div class="risk-score-num">${result.score}</div>
          <div style="font-weight:600;color:${levelColor};text-transform:uppercase">${escapeHtml(levelLabel)}</div>
        </div>
      </div>
      ${result.factors.length > 0 ? `
        <hr style="margin:10px 0;border-color:rgba(0,0,0,0.08)">
        <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px">${lang==='ar'?'العوامل المساهمة:':'Contributing factors:'}</div>
        ${result.factors.map(f => `
          <div class="risk-factor">• ${escapeHtml(lang==='ar'?f.label_ar:f.label_en)} <small style="color:#6b7280">(+${f.points})</small></div>
        `).join('')}
      ` : `<div class="risk-factor" style="margin-top:8px;color:#10b981">${lang==='ar'?'لا توجد عوامل خطر مهمة':'No significant risk factors'}</div>`}
      ${result.level !== 'low' ? `
        <div style="margin-top:12px;padding:10px;background:rgba(255,255,255,0.6);border-radius:6px;font-size:0.85rem">
          <strong>${lang==='ar'?'توصيات:':'Recommendations:'}</strong>
          <ul style="margin:4px 0 0 20px;padding:0">
            ${result.level === 'high' ? `
              <li>${lang==='ar'?'اتصال متابعة خلال 48 ساعة':'Follow-up call within 48 hours'}</li>
              <li>${lang==='ar'?'إحالة للزيارات المنزلية':'Refer to home health services'}</li>
            ` : ''}
            <li>${lang==='ar'?'متابعة خلال أسبوع مع طبيب الرعاية الأولية':'PCP follow-up within 1 week'}</li>
            <li>${lang==='ar'?'تثقيف المريض حول علامات التحذير':'Patient education on warning signs'}</li>
            <li>${lang==='ar'?'مراجعة جميع الأدوية':'Medication reconciliation review'}</li>
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

// ============================================================
// NANDA / NIC / NOC — Standardized Nursing Terminology
// ============================================================
// Source: NANDA-I 2024-2026 (subset of most common diagnoses)
// ============================================================

const NANDA_DIAGNOSES = [
  // ---- Pain & Comfort ----
  { code: '00132', label_en: 'Acute Pain',                    label_ar: 'ألم حاد' },
  { code: '00133', label_en: 'Chronic Pain',                  label_ar: 'ألم مزمن' },
  { code: '00214', label_en: 'Impaired Comfort',              label_ar: 'ضعف الراحة' },
  { code: '00255', label_en: 'Chronic Pain Syndrome',         label_ar: 'متلازمة الألم المزمن' },
  { code: '00256', label_en: 'Labor Pain',                    label_ar: 'ألم المخاض' },
  // ---- Fluid & Electrolyte ----
  { code: '00027', label_en: 'Deficient Fluid Volume',        label_ar: 'نقص حجم السوائل' },
  { code: '00028', label_en: 'Risk for Deficient Fluid Volume', label_ar: 'خطر نقص حجم السوائل' },
  { code: '00026', label_en: 'Excess Fluid Volume',           label_ar: 'زيادة حجم السوائل' },
  { code: '00025', label_en: 'Risk for Imbalanced Fluid Volume', label_ar: 'خطر اختلال توازن السوائل' },
  { code: '00195', label_en: 'Risk for Electrolyte Imbalance',label_ar: 'خطر اختلال الكهارل' },
  // ---- Respiratory ----
  { code: '00032', label_en: 'Ineffective Breathing Pattern', label_ar: 'نمط تنفس غير فعّال' },
  { code: '00031', label_en: 'Ineffective Airway Clearance',  label_ar: 'تطهير غير فعّال للممرات الهوائية' },
  { code: '00033', label_en: 'Impaired Spontaneous Ventilation', label_ar: 'ضعف التهوية التلقائية' },
  { code: '00030', label_en: 'Impaired Gas Exchange',         label_ar: 'ضعف تبادل الغازات' },
  { code: '00039', label_en: 'Risk for Aspiration',           label_ar: 'خطر الشفط' },
  // ---- Cardiovascular ----
  { code: '00029', label_en: 'Decreased Cardiac Output',      label_ar: 'انخفاض الناتج القلبي' },
  { code: '00240', label_en: 'Risk for Decreased Cardiac Tissue Perfusion', label_ar: 'خطر انخفاض تروية القلب' },
  { code: '00200', label_en: 'Risk for Decreased Cardiac Output', label_ar: 'خطر انخفاض الناتج القلبي' },
  { code: '00204', label_en: 'Ineffective Tissue Perfusion',  label_ar: 'تروية أنسجة غير فعّالة' },
  { code: '00203', label_en: 'Risk for Ineffective Renal Perfusion', label_ar: 'خطر تروية كلوية غير فعّالة' },
  { code: '00201', label_en: 'Risk for Ineffective Cerebral Tissue Perfusion', label_ar: 'خطر تروية دماغية غير فعّالة' },
  // ---- Skin & Tissue ----
  { code: '00046', label_en: 'Impaired Skin Integrity',       label_ar: 'ضعف سلامة الجلد' },
  { code: '00047', label_en: 'Risk for Impaired Skin Integrity', label_ar: 'خطر ضعف سلامة الجلد' },
  { code: '00044', label_en: 'Impaired Tissue Integrity',     label_ar: 'ضعف سلامة الأنسجة' },
  { code: '00249', label_en: 'Risk for Pressure Ulcer',       label_ar: 'خطر قرحة الفراش' },
  { code: '00045', label_en: 'Impaired Oral Mucous Membrane', label_ar: 'ضعف الغشاء المخاطي الفموي' },
  // ---- Infection & Immunity ----
  { code: '00004', label_en: 'Risk for Infection',            label_ar: 'خطر العدوى' },
  { code: '00266', label_en: 'Risk for Surgical Site Infection', label_ar: 'خطر عدوى موقع الجراحة' },
  { code: '00181', label_en: 'Contamination',                 label_ar: 'التلوث' },
  // ---- Thermoregulation ----
  { code: '00007', label_en: 'Hyperthermia',                  label_ar: 'فرط الحرارة' },
  { code: '00006', label_en: 'Hypothermia',                   label_ar: 'انخفاض الحرارة' },
  { code: '00008', label_en: 'Ineffective Thermoregulation',  label_ar: 'تنظيم حراري غير فعّال' },
  // ---- Mobility & Activity ----
  { code: '00085', label_en: 'Impaired Physical Mobility',    label_ar: 'ضعف الحركة الجسدية' },
  { code: '00091', label_en: 'Impaired Bed Mobility',         label_ar: 'ضعف الحركة في السرير' },
  { code: '00088', label_en: 'Impaired Walking',              label_ar: 'ضعف المشي' },
  { code: '00040', label_en: 'Risk for Disuse Syndrome',      label_ar: 'خطر متلازمة عدم الاستعمال' },
  { code: '00093', label_en: 'Fatigue',                       label_ar: 'الإجهاد' },
  { code: '00050', label_en: 'Disturbed Energy Field',        label_ar: 'اضطراب مجال الطاقة' },
  { code: '00155', label_en: 'Risk for Falls',                label_ar: 'خطر السقوط' },
  { code: '00303', label_en: 'Risk for Adult Falls',          label_ar: 'خطر سقوط البالغين' },
  // ---- Self-Care ----
  { code: '00109', label_en: 'Self-Care Deficit (Bathing)',   label_ar: 'قصور الرعاية الذاتية (الاستحمام)' },
  { code: '00108', label_en: 'Self-Care Deficit (Dressing)',  label_ar: 'قصور الرعاية الذاتية (اللبس)' },
  { code: '00102', label_en: 'Self-Care Deficit (Feeding)',   label_ar: 'قصور الرعاية الذاتية (التغذية)' },
  { code: '00110', label_en: 'Self-Care Deficit (Toileting)', label_ar: 'قصور الرعاية الذاتية (المرحاض)' },
  // ---- Nutrition ----
  { code: '00002', label_en: 'Imbalanced Nutrition: Less than body requirements', label_ar: 'سوء تغذية: أقل من احتياج الجسم' },
  { code: '00001', label_en: 'Imbalanced Nutrition: More than body requirements', label_ar: 'سوء تغذية: أكثر من احتياج الجسم' },
  { code: '00163', label_en: 'Readiness for Enhanced Nutrition', label_ar: 'الاستعداد لتعزيز التغذية' },
  { code: '00103', label_en: 'Impaired Swallowing',           label_ar: 'ضعف البلع' },
  { code: '00179', label_en: 'Risk for Unstable Blood Glucose', label_ar: 'خطر سكر دم غير مستقر' },
  // ---- Elimination ----
  { code: '00011', label_en: 'Constipation',                  label_ar: 'الإمساك' },
  { code: '00013', label_en: 'Diarrhea',                      label_ar: 'الإسهال' },
  { code: '00014', label_en: 'Bowel Incontinence',            label_ar: 'سلس البراز' },
  { code: '00016', label_en: 'Impaired Urinary Elimination',  label_ar: 'ضعف الإخراج البولي' },
  { code: '00020', label_en: 'Functional Urinary Incontinence', label_ar: 'سلس بولي وظيفي' },
  { code: '00023', label_en: 'Urinary Retention',             label_ar: 'احتباس البول' },
  // ---- Sleep ----
  { code: '00198', label_en: 'Disturbed Sleep Pattern',       label_ar: 'اضطراب نمط النوم' },
  { code: '00095', label_en: 'Insomnia',                      label_ar: 'الأرق' },
  // ---- Neurological / Sensory ----
  { code: '00128', label_en: 'Acute Confusion',               label_ar: 'تشوش حاد' },
  { code: '00129', label_en: 'Chronic Confusion',             label_ar: 'تشوش مزمن' },
  { code: '00122', label_en: 'Disturbed Sensory Perception',  label_ar: 'اضطراب الإدراك الحسي' },
  { code: '00131', label_en: 'Impaired Memory',               label_ar: 'ضعف الذاكرة' },
  { code: '00051', label_en: 'Impaired Verbal Communication', label_ar: 'ضعف التواصل اللفظي' },
  // ---- Psychosocial ----
  { code: '00146', label_en: 'Anxiety',                       label_ar: 'القلق' },
  { code: '00147', label_en: 'Death Anxiety',                 label_ar: 'قلق الموت' },
  { code: '00148', label_en: 'Fear',                          label_ar: 'الخوف' },
  { code: '00069', label_en: 'Ineffective Coping',            label_ar: 'تأقلم غير فعّال' },
  { code: '00074', label_en: 'Compromised Family Coping',     label_ar: 'تأقلم أسري متأثر' },
  { code: '00120', label_en: 'Situational Low Self-Esteem',   label_ar: 'تدني تقدير الذات الظرفي' },
  { code: '00119', label_en: 'Chronic Low Self-Esteem',       label_ar: 'تدني تقدير الذات المزمن' },
  { code: '00118', label_en: 'Disturbed Body Image',          label_ar: 'اضطراب صورة الجسم' },
  { code: '00136', label_en: 'Grieving',                      label_ar: 'الحزن' },
  { code: '00138', label_en: 'Risk for Other-Directed Violence', label_ar: 'خطر العنف الموجه للآخرين' },
  { code: '00140', label_en: 'Risk for Self-Directed Violence', label_ar: 'خطر العنف الموجه للذات' },
  { code: '00150', label_en: 'Risk for Suicide',              label_ar: 'خطر الانتحار' },
  { code: '00184', label_en: 'Readiness for Enhanced Decision-Making', label_ar: 'الاستعداد لتعزيز اتخاذ القرار' },
  // ---- Knowledge & Teaching ----
  { code: '00126', label_en: 'Deficient Knowledge',           label_ar: 'نقص المعرفة' },
  { code: '00161', label_en: 'Readiness for Enhanced Knowledge', label_ar: 'الاستعداد لتعزيز المعرفة' },
  { code: '00079', label_en: 'Noncompliance',                 label_ar: 'عدم الالتزام' },
  // ---- Maternal/Newborn ----
  { code: '00208', label_en: 'Readiness for Enhanced Childbearing Process', label_ar: 'الاستعداد لتعزيز عملية الولادة' },
  { code: '00221', label_en: 'Ineffective Childbearing Process', label_ar: 'عملية الولادة غير الفعالة' },
  { code: '00104', label_en: 'Ineffective Breastfeeding',     label_ar: 'الرضاعة الطبيعية غير الفعالة' },
  { code: '00106', label_en: 'Readiness for Enhanced Breastfeeding', label_ar: 'الاستعداد لتعزيز الرضاعة الطبيعية' },
  // ---- Family/Role ----
  { code: '00060', label_en: 'Interrupted Family Processes',  label_ar: 'عمليات أسرية متقطعة' },
  { code: '00061', label_en: 'Caregiver Role Strain',         label_ar: 'إجهاد دور مقدم الرعاية' },
  // ---- Safety ----
  { code: '00035', label_en: 'Risk for Injury',               label_ar: 'خطر الإصابة' },
  { code: '00086', label_en: 'Risk for Peripheral Neurovascular Dysfunction', label_ar: 'خطر خلل عصبي وعائي طرفي' },
  { code: '00038', label_en: 'Risk for Physical Trauma',      label_ar: 'خطر الصدمة الجسدية' },
  { code: '00154', label_en: 'Wandering',                     label_ar: 'التجول' },
  // ---- Sexuality ----
  { code: '00059', label_en: 'Sexual Dysfunction',            label_ar: 'الخلل الجنسي' },
  // ---- Spirituality ----
  { code: '00066', label_en: 'Spiritual Distress',            label_ar: 'الضيق الروحي' },
  { code: '00068', label_en: 'Readiness for Enhanced Spiritual Well-Being', label_ar: 'الاستعداد لتعزيز الرفاه الروحي' },
];

const NIC_INTERVENTIONS = [
  // ---- Pain Management ----
  { code: '1400', label_en: 'Pain Management',          label_ar: 'إدارة الألم' },
  { code: '1410', label_en: 'Pain Management: Acute',   label_ar: 'إدارة الألم: حاد' },
  { code: '1415', label_en: 'Pain Management: Chronic', label_ar: 'إدارة الألم: مزمن' },
  { code: '2210', label_en: 'Analgesic Administration', label_ar: 'إعطاء المسكنات' },
  { code: '6482', label_en: 'Environmental Management: Comfort', label_ar: 'إدارة البيئة: الراحة' },
  // ---- Fluid Management ----
  { code: '4120', label_en: 'Fluid Management',         label_ar: 'إدارة السوائل' },
  { code: '4130', label_en: 'Fluid Monitoring',         label_ar: 'مراقبة السوائل' },
  { code: '4140', label_en: 'Fluid Resuscitation',      label_ar: 'إنعاش السوائل' },
  { code: '4180', label_en: 'Hypervolemia Management',  label_ar: 'إدارة فرط حجم الدم' },
  { code: '2080', label_en: 'Fluid/Electrolyte Management', label_ar: 'إدارة السوائل/الكهارل' },
  // ---- Respiratory ----
  { code: '3320', label_en: 'Oxygen Therapy',           label_ar: 'العلاج بالأكسجين' },
  { code: '3140', label_en: 'Airway Management',        label_ar: 'إدارة مجرى الهواء' },
  { code: '3160', label_en: 'Airway Suctioning',        label_ar: 'شفط المجرى الهوائي' },
  { code: '3180', label_en: 'Artificial Airway Management', label_ar: 'إدارة المجرى الهوائي الاصطناعي' },
  { code: '3200', label_en: 'Aspiration Precautions',   label_ar: 'احتياطات الشفط' },
  { code: '3350', label_en: 'Respiratory Monitoring',   label_ar: 'مراقبة التنفس' },
  { code: '3300', label_en: 'Mechanical Ventilation Management', label_ar: 'إدارة التهوية الميكانيكية' },
  // ---- Cardiac ----
  { code: '4040', label_en: 'Cardiac Care',             label_ar: 'الرعاية القلبية' },
  { code: '4046', label_en: 'Cardiac Care (Acute)',     label_ar: 'الرعاية القلبية الحادة' },
  { code: '4044', label_en: 'Cardiac Care (Rehabilitative)', label_ar: 'الرعاية القلبية التأهيلية' },
  { code: '4220', label_en: 'Peripheral Sensation Management', label_ar: 'إدارة الإحساس الطرفي' },
  { code: '4090', label_en: 'Dysrhythmia Management',   label_ar: 'إدارة اضطراب النظم' },
  { code: '4250', label_en: 'Shock Management',         label_ar: 'إدارة الصدمة' },
  // ---- Skin ----
  { code: '3540', label_en: 'Pressure Ulcer Prevention',label_ar: 'الوقاية من قرح الفراش' },
  { code: '3520', label_en: 'Pressure Ulcer Care',      label_ar: 'العناية بقرحة الفراش' },
  { code: '3590', label_en: 'Skin Surveillance',        label_ar: 'مراقبة الجلد' },
  { code: '3660', label_en: 'Wound Care',               label_ar: 'العناية بالجرح' },
  { code: '3500', label_en: 'Pressure Management',      label_ar: 'إدارة الضغط' },
  // ---- Infection ----
  { code: '6540', label_en: 'Infection Control',        label_ar: 'مكافحة العدوى' },
  { code: '6550', label_en: 'Infection Protection',     label_ar: 'الحماية من العدوى' },
  { code: '2440', label_en: 'IV Therapy Maintenance',   label_ar: 'صيانة العلاج الوريدي' },
  { code: '6520', label_en: 'Health Screening',         label_ar: 'الفحص الصحي' },
  // ---- Vital Signs / Monitoring ----
  { code: '6680', label_en: 'Vital Signs Monitoring',   label_ar: 'مراقبة العلامات الحيوية' },
  { code: '2620', label_en: 'Neurological Monitoring',  label_ar: 'المراقبة العصبية' },
  { code: '3900', label_en: 'Temperature Regulation',   label_ar: 'تنظيم درجة الحرارة' },
  // ---- Mobility ----
  { code: '0221', label_en: 'Exercise Therapy: Ambulation', label_ar: 'علاج تمارين: المشي' },
  { code: '0224', label_en: 'Exercise Therapy: Joint Mobility', label_ar: 'علاج تمارين: حركة المفاصل' },
  { code: '0202', label_en: 'Energy Management',        label_ar: 'إدارة الطاقة' },
  { code: '0840', label_en: 'Positioning',              label_ar: 'تغيير الوضعية' },
  { code: '0846', label_en: 'Positioning: Wheelchair',  label_ar: 'تغيير الوضعية: كرسي متحرك' },
  // ---- Safety ----
  { code: '6490', label_en: 'Fall Prevention',          label_ar: 'الوقاية من السقوط' },
  { code: '6580', label_en: 'Physical Restraint',       label_ar: 'التقييد الجسدي' },
  { code: '6500', label_en: 'Safety Surveillance',      label_ar: 'مراقبة السلامة' },
  // ---- Self-Care ----
  { code: '1801', label_en: 'Self-Care Assistance: Bathing/Hygiene', label_ar: 'مساعدة الرعاية الذاتية: الاستحمام' },
  { code: '1802', label_en: 'Self-Care Assistance: Dressing/Grooming', label_ar: 'مساعدة الرعاية الذاتية: اللبس' },
  { code: '1803', label_en: 'Self-Care Assistance: Feeding', label_ar: 'مساعدة الرعاية الذاتية: التغذية' },
  { code: '1804', label_en: 'Self-Care Assistance: Toileting', label_ar: 'مساعدة الرعاية الذاتية: المرحاض' },
  // ---- Nutrition ----
  { code: '1100', label_en: 'Nutrition Management',     label_ar: 'إدارة التغذية' },
  { code: '1860', label_en: 'Swallowing Therapy',       label_ar: 'علاج البلع' },
  { code: '1056', label_en: 'Enteral Tube Feeding',     label_ar: 'التغذية الأنبوبية المعوية' },
  { code: '1240', label_en: 'Weight Gain Assistance',   label_ar: 'مساعدة على اكتساب الوزن' },
  { code: '1280', label_en: 'Weight Reduction Assistance', label_ar: 'مساعدة على تقليل الوزن' },
  // ---- Elimination ----
  { code: '0450', label_en: 'Constipation Management',  label_ar: 'إدارة الإمساك' },
  { code: '0460', label_en: 'Diarrhea Management',      label_ar: 'إدارة الإسهال' },
  { code: '0570', label_en: 'Urinary Bladder Training', label_ar: 'تدريب المثانة البولية' },
  { code: '0590', label_en: 'Urinary Elimination Management', label_ar: 'إدارة الإخراج البولي' },
  // ---- Sleep ----
  { code: '1850', label_en: 'Sleep Enhancement',        label_ar: 'تعزيز النوم' },
  // ---- Psychosocial ----
  { code: '5230', label_en: 'Coping Enhancement',       label_ar: 'تعزيز التأقلم' },
  { code: '5820', label_en: 'Anxiety Reduction',        label_ar: 'تقليل القلق' },
  { code: '5240', label_en: 'Counseling',               label_ar: 'الإرشاد' },
  { code: '5290', label_en: 'Grief Work Facilitation',  label_ar: 'تسهيل عمل الحزن' },
  { code: '6160', label_en: 'Crisis Intervention',      label_ar: 'تدخل الأزمة' },
  { code: '6650', label_en: 'Surveillance',             label_ar: 'المراقبة' },
  { code: '6340', label_en: 'Suicide Prevention',       label_ar: 'الوقاية من الانتحار' },
  // ---- Teaching ----
  { code: '5602', label_en: 'Teaching: Disease Process',label_ar: 'التعليم: مسار المرض' },
  { code: '5616', label_en: 'Teaching: Prescribed Medication', label_ar: 'التعليم: الدواء الموصوف' },
  { code: '5614', label_en: 'Teaching: Prescribed Diet',label_ar: 'التعليم: الحمية الموصوفة' },
  { code: '5612', label_en: 'Teaching: Prescribed Activity/Exercise', label_ar: 'التعليم: النشاط/التمارين' },
  { code: '5620', label_en: 'Teaching: Procedure/Treatment', label_ar: 'التعليم: الإجراء/العلاج' },
  { code: '5510', label_en: 'Health Education',         label_ar: 'التعليم الصحي' },
  // ---- Maternal/Newborn ----
  { code: '6720', label_en: 'High-Risk Pregnancy Care', label_ar: 'رعاية الحمل عالي الخطورة' },
  { code: '6800', label_en: 'High-Risk Pregnancy Care', label_ar: 'رعاية الحمل عالي الخطورة' },
  { code: '5244', label_en: 'Lactation Counseling',     label_ar: 'إرشاد الرضاعة' },
  { code: '6850', label_en: 'Childbirth Preparation',   label_ar: 'التحضير للولادة' },
  // ---- Family ----
  { code: '7140', label_en: 'Family Support',           label_ar: 'دعم الأسرة' },
  { code: '7040', label_en: 'Caregiver Support',        label_ar: 'دعم مقدم الرعاية' },
  { code: '7110', label_en: 'Family Integrity Promotion', label_ar: 'تعزيز تكامل الأسرة' },
  // ---- Emergency / End-of-life ----
  { code: '6320', label_en: 'Resuscitation',            label_ar: 'الإنعاش' },
  { code: '5260', label_en: 'Dying Care',               label_ar: 'رعاية الاحتضار' },
  { code: '6324', label_en: 'Resuscitation: Neonate',   label_ar: 'الإنعاش: حديثي الولادة' },
  // ---- Medication ----
  { code: '2300', label_en: 'Medication Administration',label_ar: 'إعطاء الدواء' },
  { code: '2380', label_en: 'Medication Management',    label_ar: 'إدارة الأدوية' },
  { code: '2395', label_en: 'Medication Reconciliation',label_ar: 'مطابقة الأدوية' },
];

const NOC_OUTCOMES = [
  // ---- Pain ----
  { code: '2102', label_en: 'Pain Level',                label_ar: 'مستوى الألم' },
  { code: '1605', label_en: 'Pain Control',              label_ar: 'التحكم بالألم' },
  { code: '2101', label_en: 'Pain: Disruptive Effects',  label_ar: 'الألم: الآثار المعطلة' },
  { code: '2103', label_en: 'Symptom Severity',          label_ar: 'شدة الأعراض' },
  // ---- Fluid Balance ----
  { code: '0601', label_en: 'Fluid Balance',             label_ar: 'توازن السوائل' },
  { code: '0602', label_en: 'Hydration',                 label_ar: 'الإماهة' },
  { code: '0606', label_en: 'Electrolyte and Acid/Base Balance', label_ar: 'توازن الكهارل والحمض القاعدي' },
  // ---- Respiratory ----
  { code: '0403', label_en: 'Respiratory Status: Ventilation', label_ar: 'الحالة التنفسية: التهوية' },
  { code: '0402', label_en: 'Respiratory Status: Gas Exchange', label_ar: 'الحالة التنفسية: تبادل الغازات' },
  { code: '0410', label_en: 'Respiratory Status: Airway Patency', label_ar: 'الحالة التنفسية: انفتاح المجرى' },
  { code: '0411', label_en: 'Respiratory Status',        label_ar: 'الحالة التنفسية' },
  // ---- Cardiac ----
  { code: '0405', label_en: 'Cardiopulmonary Status',    label_ar: 'الحالة القلبية الرئوية' },
  { code: '0400', label_en: 'Cardiac Pump Effectiveness',label_ar: 'فعالية مضخة القلب' },
  { code: '0407', label_en: 'Tissue Perfusion: Peripheral', label_ar: 'تروية الأنسجة: الطرفية' },
  { code: '0406', label_en: 'Tissue Perfusion: Cellular',label_ar: 'تروية الأنسجة: الخلوية' },
  { code: '0414', label_en: 'Cardiac Tissue Perfusion',  label_ar: 'تروية القلب' },
  { code: '0413', label_en: 'Cerebral Tissue Perfusion', label_ar: 'تروية الدماغ' },
  // ---- Skin/Tissue ----
  { code: '1101', label_en: 'Tissue Integrity: Skin and Mucous Membranes', label_ar: 'سلامة الأنسجة: الجلد والأغشية المخاطية' },
  { code: '1102', label_en: 'Wound Healing: Primary Intention', label_ar: 'التئام الجرح: النية الأولية' },
  { code: '1103', label_en: 'Wound Healing: Secondary Intention', label_ar: 'التئام الجرح: النية الثانوية' },
  { code: '1100', label_en: 'Oral Health',               label_ar: 'صحة الفم' },
  // ---- Infection ----
  { code: '0703', label_en: 'Infection Severity',        label_ar: 'شدة العدوى' },
  { code: '1908', label_en: 'Risk Detection',            label_ar: 'الكشف عن المخاطر' },
  { code: '1924', label_en: 'Risk Control: Infectious Process', label_ar: 'التحكم بالمخاطر: العدوى' },
  // ---- Thermoregulation ----
  { code: '0800', label_en: 'Thermoregulation',          label_ar: 'تنظيم الحرارة' },
  { code: '0801', label_en: 'Thermoregulation: Newborn', label_ar: 'تنظيم الحرارة: حديثي الولادة' },
  // ---- Mobility ----
  { code: '0208', label_en: 'Mobility',                  label_ar: 'القدرة على الحركة' },
  { code: '0207', label_en: 'Movement Coordination',     label_ar: 'تنسيق الحركة' },
  { code: '0212', label_en: 'Coordinated Movement',      label_ar: 'الحركة المنسقة' },
  { code: '0001', label_en: 'Endurance',                 label_ar: 'القدرة على التحمل' },
  { code: '0007', label_en: 'Fatigue Level',             label_ar: 'مستوى الإرهاق' },
  // ---- Safety ----
  { code: '1909', label_en: 'Risk Control: Falls',       label_ar: 'التحكم بالمخاطر: السقوط' },
  { code: '1912', label_en: 'Falls Occurrence',          label_ar: 'حدوث السقوط' },
  { code: '1828', label_en: 'Knowledge: Fall Prevention',label_ar: 'المعرفة: الوقاية من السقوط' },
  // ---- Self-Care ----
  { code: '0300', label_en: 'Self-Care: Activities of Daily Living', label_ar: 'الرعاية الذاتية: الأنشطة اليومية' },
  { code: '0301', label_en: 'Self-Care: Bathing',        label_ar: 'الرعاية الذاتية: الاستحمام' },
  { code: '0302', label_en: 'Self-Care: Dressing',       label_ar: 'الرعاية الذاتية: اللبس' },
  { code: '0303', label_en: 'Self-Care: Eating',         label_ar: 'الرعاية الذاتية: الأكل' },
  { code: '0310', label_en: 'Self-Care: Toileting',      label_ar: 'الرعاية الذاتية: المرحاض' },
  // ---- Nutrition ----
  { code: '1010', label_en: 'Swallowing Status',         label_ar: 'حالة البلع' },
  { code: '1004', label_en: 'Nutritional Status',        label_ar: 'الحالة التغذوية' },
  { code: '1006', label_en: 'Weight: Body Mass',         label_ar: 'الوزن: كتلة الجسم' },
  { code: '1009', label_en: 'Nutritional Status: Nutrient Intake', label_ar: 'الحالة التغذوية: تناول العناصر' },
  // ---- Elimination ----
  { code: '0501', label_en: 'Bowel Elimination',         label_ar: 'الإخراج الأمعائي' },
  { code: '0503', label_en: 'Urinary Elimination',       label_ar: 'الإخراج البولي' },
  // ---- Sleep ----
  { code: '0004', label_en: 'Sleep',                     label_ar: 'النوم' },
  { code: '0003', label_en: 'Rest',                      label_ar: 'الراحة' },
  // ---- Cognition / Sensory ----
  { code: '0901', label_en: 'Cognitive Orientation',     label_ar: 'التوجه المعرفي' },
  { code: '0900', label_en: 'Cognition',                 label_ar: 'الإدراك' },
  { code: '0908', label_en: 'Memory',                    label_ar: 'الذاكرة' },
  { code: '0902', label_en: 'Communication',             label_ar: 'التواصل' },
  // ---- Psychosocial ----
  { code: '1402', label_en: 'Anxiety Self-Control',      label_ar: 'التحكم الذاتي بالقلق' },
  { code: '1404', label_en: 'Fear Self-Control',         label_ar: 'التحكم الذاتي بالخوف' },
  { code: '1300', label_en: 'Acceptance: Health Status', label_ar: 'تقبل الحالة الصحية' },
  { code: '1302', label_en: 'Coping',                    label_ar: 'التأقلم' },
  { code: '1305', label_en: 'Psychosocial Adjustment: Life Change', label_ar: 'التكيف النفسي الاجتماعي' },
  { code: '1206', label_en: 'Risk for Suicide',          label_ar: 'خطر الانتحار' },
  { code: '1409', label_en: 'Depression Self-Control',   label_ar: 'التحكم الذاتي بالاكتئاب' },
  { code: '1205', label_en: 'Self-Esteem',               label_ar: 'تقدير الذات' },
  { code: '1200', label_en: 'Body Image',                label_ar: 'صورة الجسم' },
  // ---- Knowledge ----
  { code: '1803', label_en: 'Knowledge: Disease Process',label_ar: 'المعرفة: مسار المرض' },
  { code: '1808', label_en: 'Knowledge: Medication',     label_ar: 'المعرفة: الدواء' },
  { code: '1802', label_en: 'Knowledge: Diet',           label_ar: 'المعرفة: الحمية' },
  { code: '1805', label_en: 'Knowledge: Health Behavior',label_ar: 'المعرفة: السلوك الصحي' },
  { code: '1813', label_en: 'Knowledge: Treatment Regimen', label_ar: 'المعرفة: نظام العلاج' },
  // ---- Family ----
  { code: '2602', label_en: 'Family Functioning',        label_ar: 'الأداء الأسري' },
  { code: '2208', label_en: 'Caregiver Stressors',       label_ar: 'ضغوط مقدم الرعاية' },
  // ---- Maternal ----
  { code: '1000', label_en: 'Breastfeeding Establishment: Infant', label_ar: 'تأسيس الرضاعة الطبيعية: الرضيع' },
  { code: '1001', label_en: 'Breastfeeding Establishment: Maternal', label_ar: 'تأسيس الرضاعة الطبيعية: الأم' },
  { code: '1008', label_en: 'Nutritional Status: Food & Fluid Intake', label_ar: 'الحالة التغذوية: تناول الطعام والسوائل' },
];

// Helper to get options for dropdowns
function nandaOptions(lang) {
  lang = lang || 'en';
  return NANDA_DIAGNOSES.map(d => `<option value="${d.code}|${escapeHtml(d.label_en)}">${escapeHtml(d.code)} — ${escapeHtml(lang==='ar'?d.label_ar:d.label_en)}</option>`).join('');
}
function nicOptions(lang) {
  lang = lang || 'en';
  return NIC_INTERVENTIONS.map(d => `<option value="${d.code}|${escapeHtml(d.label_en)}">${escapeHtml(d.code)} — ${escapeHtml(lang==='ar'?d.label_ar:d.label_en)}</option>`).join('');
}
function nocOptions(lang) {
  lang = lang || 'en';
  return NOC_OUTCOMES.map(d => `<option value="${d.code}|${escapeHtml(d.label_en)}">${escapeHtml(d.code)} — ${escapeHtml(lang==='ar'?d.label_ar:d.label_en)}</option>`).join('');
}
