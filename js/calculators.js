// ============================================================
// HIS — Clinical Calculators
// 21 evidence-based medical calculators (incl. WHO weight-for-age z-score,
// Holliday-Segar peds fluids, Naegele EDD/GA). Pure JavaScript, no math from user.
// ============================================================

// WHO Child Growth Standards — weight-for-age LMS (L, M, S) by month, 0–24 mo.
// Source: WHO Child Growth Standards 2006 (the published reference data behind
// every WHO growth chart). M (median) values are the well-established WHO medians;
// L/S drive the tails. WHO reports child growth primarily as z-scores (SD), which
// is what this calculator leads with — percentile is shown as a secondary band.
// VERIFY against who.int / the CDC WHO data files before any clinical deployment
// (same transcription-accuracy caveat as every calculator here).
const WHO_WFA_LMS = {
  male: [
    [0.3487, 3.3464, 0.14602], [0.2297, 4.4709, 0.13395], [0.1970, 5.5675, 0.12385],
    [0.1738, 6.3762, 0.11727], [0.1553, 7.0023, 0.11316], [0.1395, 7.5105, 0.11080],
    [0.1257, 7.9340, 0.10958], [0.1134, 8.2970, 0.10902], [0.1021, 8.6151, 0.10882],
    [0.0917, 8.9014, 0.10881], [0.0820, 9.1649, 0.10891], [0.0730, 9.4122, 0.10906],
    [0.0644, 9.6479, 0.10925], [0.0563, 9.8749, 0.10949], [0.0487, 10.0953, 0.10976],
    [0.0413, 10.3108, 0.11007], [0.0343, 10.5228, 0.11041], [0.0275, 10.7319, 0.11079],
    [0.0211, 10.9385, 0.11119], [0.0148, 11.1430, 0.11164], [0.0087, 11.3462, 0.11211],
    [0.0029, 11.5486, 0.11261], [-0.0028, 11.7504, 0.11314], [-0.0083, 11.9514, 0.11369],
    [-0.0137, 12.1515, 0.11426]
  ],
  female: [
    [0.3809, 3.2322, 0.14171], [0.1714, 4.1873, 0.13724], [0.0962, 5.1282, 0.13000],
    [0.0402, 5.8458, 0.12619], [-0.0050, 6.4237, 0.12402], [-0.0430, 6.8985, 0.12274],
    [-0.0756, 7.2970, 0.12204], [-0.1039, 7.6422, 0.12178], [-0.1288, 7.9487, 0.12181],
    [-0.1507, 8.2254, 0.12199], [-0.1700, 8.4800, 0.12235], [-0.1872, 8.7192, 0.12283],
    [-0.2024, 8.9481, 0.12345], [-0.2158, 9.1699, 0.12420], [-0.2278, 9.3870, 0.12505],
    [-0.2384, 9.6008, 0.12597], [-0.2478, 9.8124, 0.12696], [-0.2562, 10.0226, 0.12798],
    [-0.2637, 10.2315, 0.12903], [-0.2703, 10.4393, 0.13009], [-0.2762, 10.6464, 0.13117],
    [-0.2815, 10.8534, 0.13226], [-0.2862, 11.0608, 0.13336], [-0.2903, 11.2688, 0.13447],
    [-0.2941, 11.4775, 0.13559]
  ]
};
// Standard normal CDF (Abramowitz & Stegun 7.1.26 erf approximation) → percentile.
function _normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
// LMS z-score: linear-interpolate L,M,S between whole months, then Box-Cox.
function whoWeightForAgeZ(sex, ageMonths, weightKg) {
  const tbl = WHO_WFA_LMS[sex];
  if (!tbl || !(weightKg > 0)) return null;
  const a = Math.max(0, Math.min(24, ageMonths));
  const lo = Math.floor(a), hi = Math.min(24, lo + 1), f = a - lo;
  const [L0, M0, S0] = tbl[lo], [L1, M1, S1] = tbl[hi];
  const L = L0 + (L1 - L0) * f, M = M0 + (M1 - M0) * f, S = S0 + (S1 - S0) * f;
  return Math.abs(L) < 1e-7 ? Math.log(weightKg / M) / S : (Math.pow(weightKg / M, L) - 1) / (L * S);
}

const CLINICAL_CALCULATORS = [
  // ---- Anthropometric ----
  {
    id: 'bmi',
    category: 'Anthropometric',
    name_en: 'Body Mass Index (BMI)',
    name_ar: 'مؤشر كتلة الجسم',
    icon: '⚖️',
    inputs: [
      { id: 'weight', label_en: 'Weight (kg)', label_ar: 'الوزن (كجم)', type: 'number', step: 0.1 },
      { id: 'height', label_en: 'Height (cm)', label_ar: 'الطول (سم)', type: 'number', step: 0.1 }
    ],
    calc: (i) => {
      const bmi = i.weight / Math.pow(i.height / 100, 2);
      let cat = '', color = '';
      if (bmi < 18.5)      { cat = 'Underweight'; color = '#3b82f6'; }
      else if (bmi < 25)   { cat = 'Normal weight'; color = '#10b981'; }
      else if (bmi < 30)   { cat = 'Overweight'; color = '#f59e0b'; }
      else if (bmi < 35)   { cat = 'Obesity Class I'; color = '#ef4444'; }
      else if (bmi < 40)   { cat = 'Obesity Class II'; color = '#dc2626'; }
      else                 { cat = 'Obesity Class III'; color = '#991b1b'; }
      return { value: bmi.toFixed(1), unit: 'kg/m²', interpretation: cat, color };
    }
  },
  {
    id: 'ibw',
    category: 'Anthropometric',
    name_en: 'Ideal Body Weight (Devine)',
    name_ar: 'الوزن المثالي',
    icon: '🎯',
    inputs: [
      { id: 'height', label_en: 'Height (cm)', label_ar: 'الطول (سم)', type: 'number', step: 0.1 },
      { id: 'sex', label_en: 'Sex', label_ar: 'الجنس', type: 'select', options: [['male','Male / ذكر'], ['female','Female / أنثى']] }
    ],
    calc: (i) => {
      const heightInches = i.height / 2.54;
      const inchesOver5ft = Math.max(0, heightInches - 60);
      const ibw = (i.sex === 'male' ? 50 : 45.5) + (2.3 * inchesOver5ft);
      return { value: ibw.toFixed(1), unit: 'kg', interpretation: 'Use for drug dosing in obesity' };
    }
  },
  {
    id: 'bsa',
    category: 'Anthropometric',
    name_en: 'Body Surface Area (Mosteller)',
    name_ar: 'مساحة سطح الجسم',
    icon: '📐',
    inputs: [
      { id: 'weight', label_en: 'Weight (kg)', label_ar: 'الوزن (كجم)', type: 'number', step: 0.1 },
      { id: 'height', label_en: 'Height (cm)', label_ar: 'الطول (سم)', type: 'number', step: 0.1 }
    ],
    calc: (i) => {
      const bsa = Math.sqrt((i.weight * i.height) / 3600);
      return { value: bsa.toFixed(2), unit: 'm²', interpretation: 'For chemotherapy & cardiac index' };
    }
  },

  // ---- Renal ----
  {
    id: 'crcl',
    category: 'Renal',
    name_en: 'Creatinine Clearance (Cockcroft-Gault)',
    name_ar: 'تصفية الكرياتينين',
    icon: '🫘',
    inputs: [
      { id: 'age', label_en: 'Age (years)', label_ar: 'العمر (سنوات)', type: 'number' },
      { id: 'weight', label_en: 'Weight (kg)', label_ar: 'الوزن (كجم)', type: 'number', step: 0.1 },
      { id: 'sCr', label_en: 'Serum Creatinine (mg/dL)', label_ar: 'كرياتينين المصل', type: 'number', step: 0.01 },
      { id: 'sex', label_en: 'Sex', label_ar: 'الجنس', type: 'select', options: [['male','Male / ذكر'], ['female','Female / أنثى']] }
    ],
    calc: (i) => {
      const crcl = ((140 - i.age) * i.weight / (72 * i.sCr)) * (i.sex === 'female' ? 0.85 : 1);
      let interp = '', color = '';
      if (crcl >= 90)       { interp = 'Normal'; color = '#10b981'; }
      else if (crcl >= 60)  { interp = 'Mildly decreased'; color = '#84cc16'; }
      else if (crcl >= 30)  { interp = 'Moderately decreased — adjust meds'; color = '#f59e0b'; }
      else if (crcl >= 15)  { interp = 'Severely decreased'; color = '#ef4444'; }
      else                  { interp = 'Kidney failure'; color = '#7f1d1d'; }
      return { value: crcl.toFixed(0), unit: 'mL/min', interpretation: interp, color };
    }
  },

  // ---- Cardiology ----
  {
    id: 'chads2vasc',
    category: 'Cardiology',
    name_en: 'CHA₂DS₂-VASc (Stroke risk in AFib)',
    name_ar: 'تقييم خطر السكتة في الرجفان الأذيني',
    icon: '❤️',
    inputs: [
      { id: 'chf', label_en: 'CHF / LV dysfunction', label_ar: 'فشل قلبي', type: 'checkbox', points: 1 },
      { id: 'htn', label_en: 'Hypertension', label_ar: 'ارتفاع ضغط الدم', type: 'checkbox', points: 1 },
      { id: 'age75', label_en: 'Age ≥ 75 years', label_ar: 'العمر ≥ 75', type: 'checkbox', points: 2 },
      { id: 'dm', label_en: 'Diabetes', label_ar: 'سكري', type: 'checkbox', points: 1 },
      { id: 'stroke', label_en: 'Prior stroke/TIA/thromboembolism', label_ar: 'سكتة سابقة', type: 'checkbox', points: 2 },
      { id: 'vasc', label_en: 'Vascular disease (CAD/PAD/MI)', label_ar: 'مرض وعائي', type: 'checkbox', points: 1 },
      { id: 'age65', label_en: 'Age 65-74 years', label_ar: 'العمر 65-74', type: 'checkbox', points: 1 },
      { id: 'female', label_en: 'Female sex', label_ar: 'أنثى', type: 'checkbox', points: 1 }
    ],
    calc: (i) => {
      let score = 0;
      if (i.chf) score += 1;
      if (i.htn) score += 1;
      if (i.age75) score += 2;
      if (i.dm) score += 1;
      if (i.stroke) score += 2;
      if (i.vasc) score += 1;
      if (i.age65) score += 1;
      if (i.female) score += 1;
      let interp = '', color = '';
      if (score === 0)      { interp = 'Low risk — no anticoagulation'; color = '#10b981'; }
      else if (score === 1) { interp = 'Consider anticoagulation'; color = '#f59e0b'; }
      else                  { interp = 'Anticoagulation recommended (DOAC preferred)'; color = '#dc2626'; }
      return { value: score, unit: 'points', interpretation: interp, color };
    }
  },
  {
    id: 'hasbled',
    category: 'Cardiology',
    name_en: 'HAS-BLED (Bleeding risk)',
    name_ar: 'تقييم خطر النزيف',
    icon: '🩸',
    inputs: [
      { id: 'h', label_en: 'Hypertension (SBP > 160)', label_ar: 'ارتفاع ضغط', type: 'checkbox', points: 1 },
      { id: 'a', label_en: 'Abnormal renal/liver function', label_ar: 'خلل كلى/كبد', type: 'checkbox', points: 1 },
      { id: 's', label_en: 'Stroke history', label_ar: 'سكتة سابقة', type: 'checkbox', points: 1 },
      { id: 'b', label_en: 'Bleeding history/predisposition', label_ar: 'تاريخ نزيف', type: 'checkbox', points: 1 },
      { id: 'l', label_en: 'Labile INR', label_ar: 'INR غير مستقر', type: 'checkbox', points: 1 },
      { id: 'e', label_en: 'Elderly (>65)', label_ar: 'كبار السن (>65)', type: 'checkbox', points: 1 },
      { id: 'd', label_en: 'Drugs (NSAIDs/antiplatelets) / Alcohol', label_ar: 'أدوية/كحول', type: 'checkbox', points: 1 }
    ],
    calc: (i) => {
      const score = ['h','a','s','b','l','e','d'].filter(k => i[k]).length;
      let interp = '', color = '';
      if (score < 3)        { interp = 'Low bleeding risk'; color = '#10b981'; }
      else                  { interp = 'High bleeding risk (≥3) — caution, regular review; not a reason to withhold anticoagulation by itself'; color = '#dc2626'; }
      return { value: score, unit: 'points', interpretation: interp, color };
    }
  },
  {
    id: 'tropwells',
    category: 'Cardiology',
    name_en: "Wells' Criteria for PE",
    name_ar: 'معايير ويلز للانصمام الرئوي',
    icon: '🫁',
    inputs: [
      { id: 'dvt_signs', label_en: 'Clinical signs of DVT', label_ar: 'علامات تجلط الأوردة العميقة', type: 'checkbox', points: 3 },
      { id: 'pe_likely', label_en: 'PE more likely than alternate dx', label_ar: 'انصمام رئوي أكثر احتمالاً', type: 'checkbox', points: 3 },
      { id: 'hr100', label_en: 'Heart rate > 100', label_ar: 'النبض > 100', type: 'checkbox', points: 1.5 },
      { id: 'immob', label_en: 'Immobilization or surgery ≤ 4 wks', label_ar: 'عدم حركة/جراحة', type: 'checkbox', points: 1.5 },
      { id: 'prev_pe', label_en: 'Previous DVT/PE', label_ar: 'انصمام/تجلط سابق', type: 'checkbox', points: 1.5 },
      { id: 'hemop', label_en: 'Hemoptysis', label_ar: 'نفث دم', type: 'checkbox', points: 1 },
      { id: 'cancer', label_en: 'Active malignancy', label_ar: 'سرطان نشط', type: 'checkbox', points: 1 }
    ],
    calc: (i) => {
      let score = 0;
      if (i.dvt_signs) score += 3;
      if (i.pe_likely) score += 3;
      if (i.hr100) score += 1.5;
      if (i.immob) score += 1.5;
      if (i.prev_pe) score += 1.5;
      if (i.hemop) score += 1;
      if (i.cancer) score += 1;
      let interp = '', color = '';
      if (score < 2)       { interp = 'Low probability — consider D-dimer'; color = '#10b981'; }
      else if (score <= 6) { interp = 'Moderate probability — D-dimer/CT-PA'; color = '#f59e0b'; }
      else                 { interp = 'High probability — CT-PA, consider empiric anticoagulation'; color = '#dc2626'; }
      return { value: score, unit: 'points', interpretation: interp, color };
    }
  },

  // ---- Neurology / ICU ----
  {
    id: 'gcs',
    category: 'Neurology / ICU',
    name_en: 'Glasgow Coma Scale (GCS)',
    name_ar: 'مقياس غلاسكو للغيبوبة',
    icon: '🧠',
    inputs: [
      { id: 'eye',   label_en: 'Eye opening',     label_ar: 'فتح العين',     type: 'select', options: [['4','Spontaneous (4)'],['3','To voice (3)'],['2','To pain (2)'],['1','None (1)']] },
      { id: 'verbal',label_en: 'Verbal response', label_ar: 'الاستجابة اللفظية', type: 'select', options: [['5','Oriented (5)'],['4','Confused (4)'],['3','Inappropriate (3)'],['2','Incomprehensible (2)'],['1','None (1)']] },
      { id: 'motor', label_en: 'Motor response',  label_ar: 'الاستجابة الحركية', type: 'select', options: [['6','Obeys commands (6)'],['5','Localizes pain (5)'],['4','Withdraws (4)'],['3','Flexion (3)'],['2','Extension (2)'],['1','None (1)']] }
    ],
    calc: (i) => {
      const score = parseInt(i.eye) + parseInt(i.verbal) + parseInt(i.motor);
      let interp = '', color = '';
      if (score >= 13)      { interp = 'Mild TBI'; color = '#10b981'; }
      else if (score >= 9)  { interp = 'Moderate TBI'; color = '#f59e0b'; }
      else                  { interp = 'Severe TBI — consider intubation'; color = '#dc2626'; }
      return { value: score, unit: '/15', interpretation: interp, color };
    }
  },
  {
    id: 'nihss',
    category: 'Neurology / ICU',
    name_en: 'NIH Stroke Scale (Simplified)',
    name_ar: 'مقياس السكتة (مبسط)',
    icon: '🧬',
    inputs: [
      { id: 'loc', label_en: 'LOC (0=alert, 3=unresponsive)', label_ar: 'الوعي', type: 'number', min: 0, max: 3 },
      { id: 'gaze', label_en: 'Gaze (0=normal, 2=forced)',     label_ar: 'النظر', type: 'number', min: 0, max: 2 },
      { id: 'visual', label_en: 'Visual fields (0-3)',           label_ar: 'المجال البصري', type: 'number', min: 0, max: 3 },
      { id: 'facial', label_en: 'Facial palsy (0-3)',            label_ar: 'شلل وجهي', type: 'number', min: 0, max: 3 },
      { id: 'motor_arm', label_en: 'Motor arm L+R (0-8 total)',  label_ar: 'حركة الذراع', type: 'number', min: 0, max: 8 },
      { id: 'motor_leg', label_en: 'Motor leg L+R (0-8 total)',  label_ar: 'حركة الساق', type: 'number', min: 0, max: 8 },
      { id: 'sensory', label_en: 'Sensory (0-2)',                label_ar: 'الإحساس', type: 'number', min: 0, max: 2 },
      { id: 'language', label_en: 'Language (0-3)',              label_ar: 'اللغة', type: 'number', min: 0, max: 3 },
      { id: 'dysarthria', label_en: 'Dysarthria (0-2)',          label_ar: 'عسر النطق', type: 'number', min: 0, max: 2 },
      { id: 'neglect', label_en: 'Neglect (0-2)',                label_ar: 'إهمال', type: 'number', min: 0, max: 2 }
    ],
    calc: (i) => {
      const sum = Object.values(i).reduce((a,b) => a + (parseFloat(b) || 0), 0);
      let interp = '', color = '';
      if (sum === 0)        { interp = 'No stroke symptoms'; color = '#10b981'; }
      else if (sum <= 4)    { interp = 'Minor stroke'; color = '#84cc16'; }
      else if (sum <= 15)   { interp = 'Moderate stroke'; color = '#f59e0b'; }
      else if (sum <= 20)   { interp = 'Moderate-severe stroke'; color = '#ef4444'; }
      else                  { interp = 'Severe stroke'; color = '#7f1d1d'; }
      return { value: sum, unit: '/42', interpretation: interp, color };
    }
  },
  {
    id: 'apache2',
    category: 'Neurology / ICU',
    name_en: 'APACHE II (ICU mortality estimate)',
    name_ar: 'APACHE II - مقياس الوفيات في العناية',
    icon: '🏥',
    inputs: [
      { id: 'age', label_en: 'Age (years)', label_ar: 'العمر', type: 'number' },
      { id: 'aps', label_en: 'Acute Physiology Score (0-60)', label_ar: 'درجة الفسيولوجيا', type: 'number', min: 0, max: 60 },
      { id: 'chronic', label_en: 'Chronic health points (0/2/5)', label_ar: 'درجة الأمراض المزمنة', type: 'number', min: 0, max: 5 }
    ],
    calc: (i) => {
      let agePts = 0;
      if (i.age >= 75)      agePts = 6;
      else if (i.age >= 65) agePts = 5;
      else if (i.age >= 55) agePts = 3;
      else if (i.age >= 45) agePts = 2;
      const total = (parseFloat(i.aps) || 0) + agePts + (parseFloat(i.chronic) || 0);
      // Mortality % estimate
      let mortality = 4;
      if (total >= 35)      mortality = 85;
      else if (total >= 30) mortality = 75;
      else if (total >= 25) mortality = 55;
      else if (total >= 20) mortality = 40;
      else if (total >= 15) mortality = 25;
      else if (total >= 10) mortality = 15;
      else if (total >= 5)  mortality = 8;
      let color = mortality > 40 ? '#dc2626' : mortality > 15 ? '#f59e0b' : '#10b981';
      return { value: total, unit: 'pts', interpretation: `Predicted mortality ~${mortality}%`, color };
    }
  },

  // ---- Sepsis / Critical Care ----
  {
    id: 'qsofa',
    category: 'Sepsis / Critical Care',
    name_en: 'qSOFA (Sepsis screen)',
    name_ar: 'qSOFA - فحص الإنتان',
    icon: '🚨',
    inputs: [
      { id: 'rr', label_en: 'Respiratory rate ≥ 22', label_ar: 'تنفس ≥ 22', type: 'checkbox', points: 1 },
      { id: 'sbp', label_en: 'Systolic BP ≤ 100 mmHg', label_ar: 'ضغط ≤ 100', type: 'checkbox', points: 1 },
      { id: 'mental', label_en: 'Altered mental status', label_ar: 'تغير حالة الوعي', type: 'checkbox', points: 1 }
    ],
    calc: (i) => {
      const score = (i.rr?1:0) + (i.sbp?1:0) + (i.mental?1:0);
      let interp = '', color = '';
      if (score >= 2) { interp = 'High risk — full sepsis workup. Consider ICU.'; color = '#dc2626'; }
      else            { interp = 'Lower risk — continue monitoring'; color = '#10b981'; }
      return { value: score, unit: '/3', interpretation: interp, color };
    }
  },
  {
    id: 'news2',
    category: 'Sepsis / Critical Care',
    name_en: 'NEWS2 (Early warning score)',
    name_ar: 'NEWS2 - الإنذار المبكر',
    icon: '⚠️',
    inputs: [
      { id: 'rr', label_en: 'Respiratory rate (/min)', label_ar: 'التنفس', type: 'number' },
      { id: 'sat', label_en: 'O₂ saturation (%)', label_ar: 'الأكسجين', type: 'number' },
      { id: 'temp', label_en: 'Temperature (°C)', label_ar: 'الحرارة', type: 'number', step: 0.1 },
      { id: 'sbp', label_en: 'Systolic BP', label_ar: 'الضغط الانقباضي', type: 'number' },
      { id: 'hr', label_en: 'Heart rate', label_ar: 'النبض', type: 'number' },
      { id: 'on_o2', label_en: 'On supplemental O₂', label_ar: 'على أكسجين', type: 'checkbox' },
      { id: 'alert', label_en: 'Patient alert (vs confused/unresponsive)', label_ar: 'يقظ', type: 'checkbox' }
    ],
    calc: (i) => {
      let s = 0;
      // RR
      if (i.rr <= 8 || i.rr >= 25) s += 3;
      else if (i.rr >= 21) s += 2;
      else if (i.rr <= 11) s += 1;
      // SaO2 — Scale 1 only (non-COPD). For chronic hypercapnic patients (COPD,
      // SpO2 target 88–92%) use the bedside vitals entry, which applies NEWS2
      // Scale 2; this quick-reference widget does not expose a scale toggle.
      if (i.sat <= 91) s += 3;
      else if (i.sat <= 93) s += 2;
      else if (i.sat <= 95) s += 1;
      // Supp O2
      if (i.on_o2) s += 2;
      // Temp — RCP NEWS2 (2017): hypothermia <=35.0 scores 3 (the max sub-score),
      // NOT 2. The high-fever end (>=39.1) scores 2; the parameter is asymmetric.
      if (i.temp <= 35.0) s += 3;
      else if (i.temp <= 36.0) s += 1;
      else if (i.temp <= 38.0) s += 0;
      else if (i.temp <= 39.0) s += 1;
      else s += 2;
      // SBP
      if (i.sbp <= 90 || i.sbp >= 220) s += 3;
      else if (i.sbp <= 100) s += 2;
      else if (i.sbp <= 110) s += 1;
      // HR
      if (i.hr <= 40 || i.hr >= 131) s += 3;
      else if (i.hr >= 111) s += 2;
      else if (i.hr >= 91 || i.hr <= 50) s += 1;
      // Consciousness
      if (!i.alert) s += 3;

      let interp = '', color = '';
      if (s === 0)       { interp = 'Low risk — routine monitoring'; color = '#10b981'; }
      else if (s <= 4)   { interp = 'Low-medium — increase frequency'; color = '#84cc16'; }
      else if (s <= 6)   { interp = 'Medium — urgent senior review'; color = '#f59e0b'; }
      else               { interp = 'High — emergency response (ICU consult)'; color = '#dc2626'; }
      return { value: s, unit: 'pts', interpretation: interp, color };
    }
  },

  // ---- Hepatology / GI ----
  {
    id: 'meld',
    category: 'Hepatology / GI',
    name_en: 'MELD Score (Liver transplant)',
    name_ar: 'مقياس MELD لزراعة الكبد',
    icon: '🫀',
    inputs: [
      { id: 'cr', label_en: 'Creatinine (mg/dL)', label_ar: 'كرياتينين', type: 'number', step: 0.01 },
      { id: 'bili', label_en: 'Bilirubin (mg/dL)', label_ar: 'بيليروبين', type: 'number', step: 0.01 },
      { id: 'inr', label_en: 'INR', label_ar: 'INR', type: 'number', step: 0.01 }
    ],
    calc: (i) => {
      const cr = Math.max(1, Math.min(4, i.cr));
      const bili = Math.max(1, i.bili);
      const inr = Math.max(1, i.inr);
      const meld = Math.round(3.78 * Math.log(bili) + 11.2 * Math.log(inr) + 9.57 * Math.log(cr) + 6.43);
      // 3-month mortality bands per Wiesner et al. 2003 (hospitalized):
      // <10 ~1.9%, 10-19 ~6.0%, 20-29 ~19.6%, 30-39 ~52.6%, ≥40 ~71.3%.
      let interp = '', color = '';
      if (meld < 10)      { interp = 'Mortality ~2% at 3 months — low priority'; color = '#10b981'; }
      else if (meld < 20) { interp = 'Mortality ~6% at 3 months'; color = '#84cc16'; }
      else if (meld < 30) { interp = 'Mortality ~20% at 3 months'; color = '#f59e0b'; }
      else if (meld < 40) { interp = 'Mortality ~53% at 3 months'; color = '#ef4444'; }
      else                { interp = 'Mortality ~71% at 3 months — high priority'; color = '#7f1d1d'; }
      return { value: meld, unit: 'pts', interpretation: interp, color };
    }
  },
  {
    id: 'bisap',
    category: 'Hepatology / GI',
    name_en: 'BISAP (Pancreatitis severity)',
    name_ar: 'BISAP - شدة التهاب البنكرياس',
    icon: '🥞',
    inputs: [
      { id: 'bun', label_en: 'BUN > 25', label_ar: 'يوريا > 25', type: 'checkbox' },
      { id: 'mental', label_en: 'Impaired mental status', label_ar: 'تغير الوعي', type: 'checkbox' },
      { id: 'sirs', label_en: 'SIRS criteria met (≥2)', label_ar: 'معايير SIRS', type: 'checkbox' },
      { id: 'age60', label_en: 'Age > 60', label_ar: 'العمر > 60', type: 'checkbox' },
      { id: 'pleural', label_en: 'Pleural effusion on imaging', label_ar: 'انصباب جنبي', type: 'checkbox' }
    ],
    calc: (i) => {
      const score = Object.values(i).filter(v => v).length;
      let interp = '', color = '';
      if (score <= 2)      { interp = 'Mortality < 2% — outpatient possible'; color = '#10b981'; }
      else if (score === 3){ interp = 'Mortality ~8-13%'; color = '#f59e0b'; }
      else                 { interp = 'Mortality ~20-30% — ICU admission'; color = '#dc2626'; }
      return { value: score, unit: '/5', interpretation: interp, color };
    }
  },

  // ---- Pediatric ----
  {
    id: 'pews',
    category: 'Pediatric',
    name_en: 'Pediatric Early Warning Score',
    name_ar: 'الإنذار المبكر للأطفال',
    icon: '👶',
    inputs: [
      { id: 'behavior', label_en: 'Behavior (0=playing, 3=lethargic/unresponsive)', label_ar: 'السلوك', type: 'number', min: 0, max: 3 },
      { id: 'cardio',   label_en: 'Cardiovascular (0=pink, 3=pale or cap refill ≥5s)', label_ar: 'الدورة الدموية', type: 'number', min: 0, max: 3 },
      { id: 'resp',     label_en: 'Respiratory (0=normal, 3=≥20 above normal or retractions)', label_ar: 'التنفس', type: 'number', min: 0, max: 3 }
    ],
    calc: (i) => {
      const sum = (parseFloat(i.behavior)||0) + (parseFloat(i.cardio)||0) + (parseFloat(i.resp)||0);
      let interp = '', color = '';
      if (sum === 0)      { interp = 'Routine monitoring'; color = '#10b981'; }
      else if (sum <= 2)  { interp = 'Increased monitoring q2h'; color = '#84cc16'; }
      else if (sum <= 4)  { interp = 'Notify charge nurse'; color = '#f59e0b'; }
      else                { interp = 'Urgent — RRT activation'; color = '#dc2626'; }
      return { value: sum, unit: 'pts', interpretation: interp, color };
    }
  },

  // ---- Obstetrics ----
  {
    id: 'apgar',
    category: 'Obstetrics',
    name_en: 'APGAR Score (Newborn)',
    name_ar: 'مقياس أبجار لحديث الولادة',
    icon: '👶',
    inputs: [
      { id: 'appearance', label_en: 'Appearance (color)', label_ar: 'اللون', type: 'select', options: [['0','Blue/pale (0)'],['1','Body pink, extremities blue (1)'],['2','All pink (2)']] },
      { id: 'pulse',      label_en: 'Pulse',              label_ar: 'النبض', type: 'select', options: [['0','Absent (0)'],['1','< 100 (1)'],['2','> 100 (2)']] },
      { id: 'grimace',    label_en: 'Grimace (reflex)',   label_ar: 'الانعكاس', type: 'select', options: [['0','No response (0)'],['1','Grimace (1)'],['2','Cry/cough (2)']] },
      { id: 'activity',   label_en: 'Activity (tone)',    label_ar: 'النشاط', type: 'select', options: [['0','Limp (0)'],['1','Some flexion (1)'],['2','Active motion (2)']] },
      { id: 'respiration',label_en: 'Respiration',        label_ar: 'التنفس', type: 'select', options: [['0','Absent (0)'],['1','Slow/irregular (1)'],['2','Good cry (2)']] }
    ],
    calc: (i) => {
      const sum = parseInt(i.appearance) + parseInt(i.pulse) + parseInt(i.grimace) + parseInt(i.activity) + parseInt(i.respiration);
      let interp = '', color = '';
      if (sum >= 7)      { interp = 'Normal'; color = '#10b981'; }
      else if (sum >= 4) { interp = 'Moderate distress — assist'; color = '#f59e0b'; }
      else               { interp = 'Severe distress — resuscitate'; color = '#dc2626'; }
      return { value: sum, unit: '/10', interpretation: interp, color };
    }
  },

  // ---- Pain ----
  {
    id: 'morse',
    category: 'Nursing',
    name_en: 'Morse Fall Risk Scale',
    name_ar: 'مقياس Morse لخطر السقوط',
    icon: '🚶',
    inputs: [
      { id: 'history', label_en: 'History of falling (within 3 months)', label_ar: 'تاريخ سقوط', type: 'checkbox', points: 25 },
      { id: 'secondary', label_en: 'Secondary diagnosis', label_ar: 'تشخيص ثانوي', type: 'checkbox', points: 15 },
      { id: 'ambulatory_aid', label_en: 'Ambulatory aid (crutches/cane/walker)', label_ar: 'وسيلة مساعدة', type: 'select', options: [['0','None / Bed rest (0)'], ['15','Crutches/Cane/Walker (15)'], ['30','Furniture (30)']] },
      { id: 'iv', label_en: 'IV therapy / heparin lock', label_ar: 'وريد محيطي', type: 'checkbox', points: 20 },
      { id: 'gait', label_en: 'Gait', label_ar: 'المشية', type: 'select', options: [['0','Normal / Bedrest (0)'],['10','Weak (10)'],['20','Impaired (20)']] },
      { id: 'mental', label_en: 'Mental status', label_ar: 'الحالة العقلية', type: 'select', options: [['0','Oriented to own ability (0)'],['15','Forgets limitations (15)']] }
    ],
    calc: (i) => {
      let s = 0;
      if (i.history) s += 25;
      if (i.secondary) s += 15;
      s += parseInt(i.ambulatory_aid) || 0;
      if (i.iv) s += 20;
      s += parseInt(i.gait) || 0;
      s += parseInt(i.mental) || 0;
      let interp = '', color = '';
      if (s < 25)      { interp = 'Low risk — standard care'; color = '#10b981'; }
      else if (s < 45) { interp = 'Moderate risk — standard fall precautions'; color = '#f59e0b'; }
      else             { interp = 'High risk — implement high-fall precautions'; color = '#dc2626'; }
      return { value: s, unit: 'pts', interpretation: interp, color };
    }
  },
  {
    id: 'braden',
    category: 'Nursing',
    name_en: 'Braden Pressure Ulcer Risk',
    name_ar: 'مقياس Braden لقرح الفراش',
    icon: '🛏',
    inputs: [
      { id: 'sensory', label_en: 'Sensory perception (1=none, 4=no impairment)', label_ar: 'الإدراك', type: 'number', min: 1, max: 4 },
      { id: 'moisture', label_en: 'Moisture (1=constantly moist, 4=rarely)', label_ar: 'الرطوبة', type: 'number', min: 1, max: 4 },
      { id: 'activity', label_en: 'Activity (1=bedfast, 4=walks frequently)', label_ar: 'النشاط', type: 'number', min: 1, max: 4 },
      { id: 'mobility', label_en: 'Mobility (1=immobile, 4=no limit)', label_ar: 'الحركة', type: 'number', min: 1, max: 4 },
      { id: 'nutrition', label_en: 'Nutrition (1=very poor, 4=excellent)', label_ar: 'التغذية', type: 'number', min: 1, max: 4 },
      { id: 'friction', label_en: 'Friction/Shear (1=problem, 3=no problem)', label_ar: 'الاحتكاك', type: 'number', min: 1, max: 3 }
    ],
    calc: (i) => {
      const s = ['sensory','moisture','activity','mobility','nutrition','friction'].reduce((a,k) => a + (parseInt(i[k])||0), 0);
      let interp = '', color = '';
      if (s >= 19)      { interp = 'No risk'; color = '#10b981'; }
      else if (s >= 15) { interp = 'Mild risk — turn q2-4h'; color = '#84cc16'; }
      else if (s >= 13) { interp = 'Moderate risk — turn q2h, special mattress'; color = '#f59e0b'; }
      else if (s >= 10) { interp = 'High risk — turn q1-2h, monitor closely'; color = '#ef4444'; }
      else              { interp = 'Severe risk — air mattress, q1h turning'; color = '#7f1d1d'; }
      return { value: s, unit: '/23', interpretation: interp, color };
    }
  },

  // ---- Pediatric / Obstetric (exact, formula-based — no growth-curve LMS data,
  //      which would need a clinician-validated dataset import, not code) ----
  {
    id: 'peds_fluids',
    category: 'Pediatric',
    name_en: 'Pediatric Maintenance Fluids (Holliday–Segar)',
    name_ar: 'سوائل الصيانة للأطفال (هوليداي-سيغار)',
    icon: '🍼',
    inputs: [
      { id: 'weight', label_en: 'Weight (kg)', label_ar: 'الوزن (كجم)', type: 'number', step: 0.1, min: 0.5, max: 80 }
    ],
    // Holliday & Segar, Pediatrics 1957. Daily: 100/50/20 mL/kg for the first
    // 10/next 10/remaining kg. Hourly "4-2-1" rule: 4/2/1 mL/kg/hr.
    calc: (i) => {
      const w = i.weight;
      const day = w <= 10 ? w * 100 : (w <= 20 ? 1000 + (w - 10) * 50 : 1500 + (w - 20) * 20);
      const hr  = w <= 10 ? w * 4   : (w <= 20 ? 40 + (w - 10) * 2   : 60 + (w - 20) * 1);
      return { value: Math.round(hr), unit: 'mL/hr', interpretation: `${Math.round(day)} mL/day (4-2-1 rule, Holliday–Segar 1957)`, color: '#0ea5e9' };
    }
  },
  {
    id: 'ob_edd',
    category: 'Obstetric',
    name_en: 'EDD & Gestational Age (Naegele, from LMP)',
    name_ar: 'موعد الولادة وعمر الحمل (نيغيله من آخر دورة)',
    icon: '🤰',
    inputs: [
      { id: 'lmp', label_en: 'Last menstrual period (LMP)', label_ar: 'تاريخ آخر دورة شهرية', type: 'date' }
    ],
    // Naegele's rule: EDD = LMP + 280 days. GA = days since LMP (weeks+days).
    calc: (i) => {
      const lmp = new Date(i.lmp + 'T00:00:00Z');
      if (isNaN(lmp.getTime())) return { value: '—', interpretation: 'Enter a valid LMP date', color: '#9ca3af' };
      const edd = new Date(lmp.getTime() + 280 * 86400000);
      const eddISO = edd.toISOString().slice(0, 10);
      const gaDays = Math.floor((Date.now() - lmp.getTime()) / 86400000);
      if (gaDays < 0) return { value: '—', unit: '', interpretation: `LMP is in the future — EDD ${eddISO}`, color: '#9ca3af' };
      const wk = Math.floor(gaDays / 7), dy = gaDays % 7;
      const tri = wk < 14 ? '1st' : (wk < 28 ? '2nd' : '3rd');
      const color = gaDays > 294 ? '#dc2626' : '#10b981';   // >42wk = post-term
      return { value: `${wk}+${dy}`, unit: 'weeks', interpretation: `EDD ${eddISO} · ${tri} trimester (Naegele's rule)`, color };
    }
  },
  {
    id: 'peds_wfa',
    category: 'Pediatric',
    name_en: 'Weight-for-Age z-score (WHO, 0–24 mo)',
    name_ar: 'الوزن مقابل العمر (منظمة الصحة العالمية، 0–24 شهر)',
    icon: '📈',
    inputs: [
      { id: 'sex', label_en: 'Sex', label_ar: 'الجنس', type: 'select', options: [['male', 'Male / ذكر'], ['female', 'Female / أنثى']] },
      { id: 'age', label_en: 'Age (months, 0–24)', label_ar: 'العمر (أشهر)', type: 'number', step: 0.5, min: 0, max: 24 },
      { id: 'weight', label_en: 'Weight (kg)', label_ar: 'الوزن (كجم)', type: 'number', step: 0.05, min: 0.5, max: 30 }
    ],
    // WHO reports child growth as z-scores (SD); percentile band is secondary.
    calc: (i) => {
      const z = whoWeightForAgeZ(i.sex, i.age, i.weight);
      if (z == null) return { value: '—', interpretation: 'Enter sex, age (0–24mo) and weight', color: '#9ca3af' };
      let band = '', color = '';
      if (z < -3)      { band = 'Severely underweight (< −3 SD)'; color = '#7f1d1d'; }
      else if (z < -2) { band = 'Underweight (−3 to −2 SD)'; color = '#ef4444'; }
      else if (z <= 2) { band = 'Normal weight-for-age (−2 to +2 SD)'; color = '#10b981'; }
      else if (z <= 3) { band = 'High weight-for-age (+2 to +3 SD)'; color = '#f59e0b'; }
      else             { band = 'Very high (> +3 SD)'; color = '#dc2626'; }
      const pct = Math.round(_normCdf(z) * 100);
      const pctStr = pct < 1 ? '<1st' : (pct > 99 ? '>99th' : pct + 'th');
      return { value: z.toFixed(2), unit: 'SD (z)', interpretation: `${band} · ~${pctStr} centile (WHO WFA)`, color };
    }
  }
];
