// ============================================================
// HIS — Easy Features (5-year-old friendly)
// Code Status banner | Drug Reference | Vaccinations | Recently Used | Welcome Tour
// All built with plain JS, no dependencies, simple logic.
// ============================================================

// ============================================================
// CODE STATUS BANNER
// ============================================================
const CODE_STATUS_OPTIONS = [
  { value: 'full',     label_en: 'Full Code',         label_ar: 'إنعاش كامل',     icon: '💚', cls: 'code-status-full' },
  { value: 'dnr',      label_en: 'DNR (Do Not Resuscitate)', label_ar: 'لا إنعاش', icon: '🚫', cls: 'code-status-dnr' },
  { value: 'dni',      label_en: 'DNI (Do Not Intubate)',    label_ar: 'لا تنبيب', icon: '⚠️', cls: 'code-status-dni' },
  { value: 'limited',  label_en: 'Limited (specify)',  label_ar: 'محدود',         icon: '🔄', cls: 'code-status-limited' },
  { value: 'unknown',  label_en: 'Not yet documented', label_ar: 'لم يحدد بعد',   icon: '❓', cls: 'code-status-unknown' }
];

function renderCodeStatusBanner(admissionId, lang) {
  if (!admissionId) return '';
  lang = lang || (typeof currentLanguage === 'function' ? currentLanguage() : 'en');
  const adm = dbGet('SELECT code_status, code_status_set_at FROM admissions WHERE admission_id = ?', [admissionId]);
  const status = (adm && adm.code_status) || 'unknown';
  const opt = CODE_STATUS_OPTIONS.find(o => o.value === status) || CODE_STATUS_OPTIONS[4];
  const label = lang === 'ar' ? opt.label_ar : opt.label_en;
  const setLabel = lang === 'ar' ? 'تعديل' : 'Set / Change';
  return `
    <div class="code-status-banner ${opt.cls}">
      <span class="code-status-icon">${opt.icon}</span>
      <span style="flex:1">
        <strong style="font-size:0.75rem;text-transform:uppercase;opacity:0.8">${lang==='ar'?'حالة الإنعاش':'CODE STATUS'}:</strong>
        <span style="font-size:1.05rem;margin-left:6px">${escapeHtml(label)}</span>
        ${adm && adm.code_status_set_at ? `<small style="opacity:0.7;margin-left:8px">${escapeHtml(adm.code_status_set_at.substring(0,10))}</small>` : ''}
      </span>
      <button class="btn btn-sm" style="background:rgba(255,255,255,0.5);border:1px solid currentColor;color:inherit"
        onclick="showCodeStatusForm(${admissionId})">${setLabel}</button>
    </div>
  `;
}

function showCodeStatusForm(admissionId) {
  const lang = currentLanguage();
  const isAr = lang === 'ar';
  const current = dbGet('SELECT code_status FROM admissions WHERE admission_id = ?', [admissionId]);
  const currentVal = (current && current.code_status) || 'unknown';

  const optionsHtml = CODE_STATUS_OPTIONS.map(o => `
    <label style="display:flex;align-items:center;gap:10px;padding:12px;border:2px solid ${o.value === currentVal ? '#3b82f6' : '#e5e7eb'};border-radius:8px;cursor:pointer;margin-bottom:6px">
      <input type="radio" name="code-status" value="${o.value}" ${o.value === currentVal ? 'checked' : ''} style="width:18px;height:18px">
      <span style="font-size:1.4rem">${o.icon}</span>
      <strong>${escapeHtml(isAr ? o.label_ar : o.label_en)}</strong>
    </label>
  `).join('');

  showModal(`
    <div style="max-width:560px;width:90vw">
      <h2>📋 ${isAr ? 'حالة الإنعاش' : 'Code Status'}</h2>
      <p style="color:#6b7280;font-size:0.9rem;margin-bottom:14px">
        ${isAr ? 'مهم جداً — يحدد إجراءات الإنعاش في حالة توقف القلب.' : 'Critical safety — determines resuscitation actions in cardiac arrest.'}
      </p>
      ${optionsHtml}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
        <button class="btn btn-primary" onclick="saveCodeStatus(${admissionId})">${isAr?'حفظ':'Save'}</button>
      </div>
    </div>
  `);
}

function saveCodeStatus(admissionId) {
  const sel = document.querySelector('input[name="code-status"]:checked');
  if (!sel) return;
  const user = getCurrentUser();
  dbRun('UPDATE admissions SET code_status = ?, code_status_set_by = ?, code_status_set_at = ? WHERE admission_id = ?',
    [sel.value, user.user_id, nowISO(), admissionId]);
  saveDBToIndexedDB();
  showSuccess(currentLanguage()==='ar' ? 'تم حفظ حالة الإنعاش' : 'Code status saved');
  closeModal();
  // Refresh current view to show new banner
  if (typeof currentView !== 'undefined' && currentView) navigateTo(currentView);
}

// ============================================================
// DRUG REFERENCE — Quick info panel for any drug
// ============================================================
const DRUG_REFERENCE = {
  // Brief reference for common drugs — indication, key SE, monitoring
  'amoxicillin':  { class: 'Beta-lactam antibiotic',     indication: 'Bacterial infections (URI, otitis, UTI, dental)', se: 'Diarrhea, rash, C. diff, allergic reactions', monitor: 'Watch for allergic reaction first 30 min' },
  'ceftriaxone':  { class: '3rd-gen cephalosporin',      indication: 'Severe infections, meningitis, gonorrhea',         se: 'Diarrhea, rash, biliary sludge in neonates', monitor: 'Renal function in CKD' },
  'vancomycin':   { class: 'Glycopeptide antibiotic',    indication: 'MRSA, severe Gram-positive infections, C. diff',  se: 'Red man syndrome, nephrotoxicity, ototoxicity', monitor: 'Trough level (15-20 for serious infx), renal function' },
  'azithromycin': { class: 'Macrolide antibiotic',       indication: 'CAP, atypical pneumonia, STIs, COPD exacerbation', se: 'GI upset, QT prolongation', monitor: 'ECG if other QT-prolonging drugs' },
  'metronidazole':{ class: 'Nitroimidazole antibiotic',  indication: 'Anaerobic infections, C. diff, BV',                se: 'Metallic taste, nausea, disulfiram reaction with alcohol', monitor: 'No alcohol during treatment' },
  'piperacillin_tazobactam': { class: 'Anti-pseudomonal beta-lactam', indication: 'Sepsis, hospital pneumonia, intra-abdominal',  se: 'Diarrhea, AKI when combined with vanc', monitor: 'Renal function, watch for AKI' },
  'meropenem':    { class: 'Carbapenem',                 indication: 'Severe Gram-neg infections, neutropenic fever',    se: 'Seizures (esp renal failure), AKI', monitor: 'Renal function, neuro status' },
  'ciprofloxacin':{ class: 'Fluoroquinolone',            indication: 'UTI, pyelonephritis, intra-abdominal, anthrax',    se: 'Tendon rupture, QT, C. diff, peripheral neuropathy', monitor: 'Tendons, ECG, blood glucose' },
  'levofloxacin': { class: 'Fluoroquinolone',            indication: 'CAP, sinusitis, complicated UTI',                  se: 'Tendon rupture, QT, hypoglycemia in DM',     monitor: 'ECG, glucose, tendons' },

  'aspirin':      { class: 'Antiplatelet',               indication: 'CAD, post-MI, post-stroke prevention',             se: 'GI bleed, increased bleeding, Reye syndrome in kids', monitor: 'Bleeding signs, GI symptoms' },
  'clopidogrel':  { class: 'P2Y12 antiplatelet',         indication: 'Post-PCI, post-stroke, ACS',                       se: 'Bleeding, TTP (rare)',                       monitor: 'Bleeding, CBC' },
  'atorvastatin': { class: 'HMG-CoA reductase inhibitor (statin)', indication: 'Hyperlipidemia, ASCVD prevention',     se: 'Myopathy, hepatotoxicity, new-onset DM',     monitor: 'LFTs at baseline + as indicated, CK if myalgia' },
  'rosuvastatin': { class: 'Statin',                     indication: 'Hyperlipidemia (more potent)',                     se: 'Myopathy, hepatotoxicity',                   monitor: 'Same as atorvastatin' },

  'lisinopril':   { class: 'ACE inhibitor',              indication: 'HTN, CHF, post-MI, diabetic nephropathy',          se: 'Cough, hyperkalemia, AKI, angioedema',       monitor: 'BP, K+, Cr (esp first week)' },
  'enalapril':    { class: 'ACE inhibitor',              indication: 'HTN, CHF',                                          se: 'Cough, hyperkalemia, angioedema',            monitor: 'BP, K+, Cr' },
  'losartan':     { class: 'ARB',                        indication: 'HTN, CHF, diabetic nephropathy (ACE intolerant)',  se: 'Hyperkalemia, AKI (less cough than ACE)',    monitor: 'BP, K+, Cr' },
  'amlodipine':   { class: 'CCB (dihydropyridine)',      indication: 'HTN, angina',                                      se: 'Pedal edema, gingival hyperplasia, headache', monitor: 'BP, edema' },
  'metoprolol':   { class: 'Cardioselective beta-blocker', indication: 'HTN, CHF, post-MI, angina, AFib rate control', se: 'Bradycardia, fatigue, mask hypoglycemia',    monitor: 'HR, BP, CHF symptoms' },
  'bisoprolol':   { class: 'Beta-blocker',               indication: 'HTN, CHF',                                         se: 'Bradycardia, fatigue',                       monitor: 'HR, BP' },
  'carvedilol':   { class: 'Non-selective BB + alpha-blocker', indication: 'CHF, HTN, post-MI',                       se: 'Hypotension, dizziness, bronchospasm',       monitor: 'BP, HR, CHF symptoms' },
  'furosemide':   { class: 'Loop diuretic',              indication: 'CHF, edema, hypertension',                         se: 'Hypokalemia, hyponatremia, ototoxicity, AKI', monitor: 'K+, Mg, Cr, weight, I/O' },
  'spironolactone': { class: 'K-sparing diuretic / aldosterone antagonist', indication: 'CHF, ascites, primary aldosteronism', se: 'Hyperkalemia, gynecomastia', monitor: 'K+, Cr' },
  'hydrochlorothiazide': { class: 'Thiazide diuretic',   indication: 'HTN (first-line per JNC8)',                        se: 'Hypokalemia, hyperuricemia, hyperglycemia',  monitor: 'K+, glucose, uric acid' },
  'digoxin':      { class: 'Cardiac glycoside',          indication: 'AFib (rate), CHF',                                 se: 'GI, vision changes (yellow halos), arrhythmias', monitor: 'Level (0.5-2 ng/mL), K+, Cr' },
  'amiodarone':   { class: 'Class III antiarrhythmic',   indication: 'AFib, V-tach',                                     se: 'Pulmonary fibrosis, hepatic, thyroid (both hyper/hypo), corneal deposits, blue skin', monitor: 'TFT, LFT, PFT, ophthalm annually' },

  'warfarin':     { class: 'Vitamin K antagonist',       indication: 'AFib, DVT/PE, mech valve',                         se: 'Bleeding, skin necrosis, teratogen',          monitor: 'INR weekly initially, target 2-3 (2.5-3.5 mech valve)' },
  'rivaroxaban':  { class: 'DOAC (Factor Xa inhibitor)', indication: 'AFib (CrCl > 15), DVT/PE',                         se: 'Bleeding (less ICH than warfarin)',          monitor: 'Renal function, no routine INR' },
  'apixaban':     { class: 'DOAC (Factor Xa inhibitor)', indication: 'AFib, DVT/PE',                                     se: 'Bleeding (lowest of DOACs)',                 monitor: 'Renal function' },
  'enoxaparin':   { class: 'Low-MW heparin',             indication: 'DVT/PE prophylaxis & treatment, ACS',              se: 'Bleeding, HIT (lower than UFH)',             monitor: 'Anti-Xa if obesity/CKD/preg, platelet for HIT' },
  'heparin':      { class: 'Unfractionated heparin',     indication: 'ACS, PE, bridging anticoag',                       se: 'Bleeding, HIT, osteoporosis (long-term)',    monitor: 'aPTT (1.5-2.5x control), platelets, anti-Xa' },

  'metformin':    { class: 'Biguanide (oral hypoglycemic)', indication: 'T2DM (first-line)',                            se: 'GI upset, lactic acidosis (rare), B12 deficiency', monitor: 'eGFR (>30 to use), B12 annually if long-term' },
  'insulin_regular':{ class: 'Short-acting insulin',     indication: 'DKA, hyperglycemia, surgical patients',            se: 'Hypoglycemia, weight gain, hypokalemia',     monitor: 'Glucose q1-6h, K+ if drip' },
  'glargine':     { class: 'Long-acting insulin',        indication: 'Basal insulin in T1/T2DM',                         se: 'Hypoglycemia',                               monitor: 'Glucose, target individualized' },
  'gliclazide':   { class: 'Sulfonylurea',               indication: 'T2DM',                                             se: 'Hypoglycemia, weight gain',                  monitor: 'Glucose, avoid in CKD' },
  'sitagliptin':  { class: 'DPP-4 inhibitor',            indication: 'T2DM',                                             se: 'Pancreatitis (rare), arthralgia',            monitor: 'Renal function' },
  'empagliflozin':{ class: 'SGLT2 inhibitor',            indication: 'T2DM, CHF (regardless of DM)',                     se: 'UTI, genital mycotic, euglycemic DKA, volume depletion', monitor: 'Renal function, ketones if symptoms' },

  'omeprazole':   { class: 'PPI',                        indication: 'GERD, PUD, stress ulcer prophylaxis',              se: 'Long-term: B12 def, hypomagnesemia, fractures, C. diff', monitor: 'Mg, B12 if long-term' },
  'pantoprazole': { class: 'PPI',                        indication: 'Same as omeprazole, IV use ICU',                   se: 'Same as omeprazole',                         monitor: 'Same' },
  'ondansetron':  { class: '5-HT3 antagonist (antiemetic)', indication: 'Chemotherapy, post-op N/V',                    se: 'Headache, constipation, QT prolongation',    monitor: 'ECG if other QT drugs' },

  'salbutamol':   { class: 'Short-acting beta-2 agonist (SABA)', indication: 'Asthma rescue, COPD',                    se: 'Tremor, tachycardia, hypokalemia',           monitor: 'HR, K+ if frequent' },
  'budesonide':   { class: 'Inhaled corticosteroid',     indication: 'Asthma maintenance',                                se: 'Oral candidiasis, hoarseness',               monitor: 'Rinse mouth after use' },
  'prednisone':   { class: 'Systemic corticosteroid',    indication: 'Inflammatory conditions, asthma exacerbation',     se: 'Hyperglycemia, HTN, infection, osteoporosis, mood changes', monitor: 'Glucose, BP, bone (long-term)' },

  'paracetamol':  { class: 'Analgesic / antipyretic',    indication: 'Pain, fever',                                      se: 'Hepatotoxicity (overdose)',                  monitor: 'Max 4g/day (3g if liver disease)' },
  'ibuprofen':    { class: 'NSAID',                      indication: 'Pain, inflammation, fever',                        se: 'GI bleed, AKI, HTN, increased CV events',    monitor: 'Avoid in CKD, peptic ulcer, pregnancy 3rd tri' },
  'morphine':     { class: 'Opioid agonist',             indication: 'Severe pain',                                      se: 'Respiratory depression, sedation, constipation, addiction', monitor: 'RR, sedation, pain score, bowel function' },
  'tramadol':     { class: 'Atypical opioid + SNRI activity', indication: 'Moderate pain',                              se: 'Seizures, serotonin syndrome with SSRIs, addiction', monitor: 'Avoid with SSRI/SNRI without caution' },

  'lorazepam':    { class: 'Benzodiazepine (intermediate)', indication: 'Anxiety, status epilepticus, alcohol withdrawal', se: 'Sedation, respiratory depression, dependence', monitor: 'RR, sedation' },
  'haloperidol':  { class: 'Typical antipsychotic',      indication: 'Acute agitation, delirium',                        se: 'EPS, dystonia, NMS, QT prolongation',        monitor: 'EPS, ECG' },
  'levetiracetam':{ class: 'Antiepileptic',              indication: 'Seizures (focal & generalized)',                   se: 'Mood changes, agitation, fatigue',           monitor: 'Mood, behavior' }
};

function getDrugReference(drugKey) {
  if (!drugKey) return null;
  return DRUG_REFERENCE[drugKey.toLowerCase()] || null;
}

function showDrugReference(drugKey, drugLabel) {
  const ref = getDrugReference(drugKey);
  const lang = currentLanguage();
  const isAr = lang === 'ar';
  const label = drugLabel || drugKey;

  if (!ref) {
    showModal(`
      <div>
        <h2>💊 ${escapeHtml(label)}</h2>
        <p style="color:#9ca3af">${isAr?'لا توجد معلومات مرجعية':'No reference info available'}</p>
        <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')||'Close'}</button>
      </div>
    `);
    return;
  }

  showModal(`
    <div style="max-width:560px">
      <h2>💊 ${escapeHtml(label)}</h2>
      <p style="color:#3b82f6;margin:0 0 14px;font-weight:500">${escapeHtml(ref.class)}</p>
      <div style="display:grid;gap:12px">
        <div style="padding:10px;background:#f0fdf4;border-left:4px solid #10b981;border-radius:6px">
          <strong style="color:#065f46;font-size:0.8rem;text-transform:uppercase">${isAr?'الاستطباب':'Indication'}</strong>
          <div style="margin-top:4px">${escapeHtml(ref.indication)}</div>
        </div>
        <div style="padding:10px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px">
          <strong style="color:#7f1d1d;font-size:0.8rem;text-transform:uppercase">${isAr?'الآثار الجانبية':'Side Effects'}</strong>
          <div style="margin-top:4px">${escapeHtml(ref.se)}</div>
        </div>
        <div style="padding:10px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:6px">
          <strong style="color:#1e40af;font-size:0.8rem;text-transform:uppercase">${isAr?'المراقبة':'Monitoring'}</strong>
          <div style="margin-top:4px">${escapeHtml(ref.monitor)}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-primary" onclick="closeModal()">${isAr?'حسناً':'Got it'}</button>
      </div>
    </div>
  `);
}

// ============================================================
// VACCINATIONS — Track vaccines per patient
// ============================================================
const COMMON_VACCINES = [
  { code: 'covid19',     name_en: 'COVID-19 Vaccine',                 name_ar: 'لقاح كوفيد-19',                  schedule: 'As per national schedule' },
  { code: 'flu',         name_en: 'Influenza (Annual)',                name_ar: 'الإنفلونزا (سنوي)',              schedule: 'Annual, all ages' },
  { code: 'tdap',        name_en: 'Tdap (Tetanus/Diphtheria/Pertussis)', name_ar: 'Tdap', schedule: 'Every 10 years' },
  { code: 'hepb',        name_en: 'Hepatitis B',                       name_ar: 'التهاب الكبد B',                schedule: '3-dose series' },
  { code: 'mmr',         name_en: 'MMR (Measles/Mumps/Rubella)',       name_ar: 'الحصبة/النكاف/الحصبة الألمانية', schedule: '2 doses childhood' },
  { code: 'varicella',   name_en: 'Varicella (Chickenpox)',            name_ar: 'الجدري المائي',                  schedule: '2 doses' },
  { code: 'pcv13',       name_en: 'Pneumococcal (PCV13)',              name_ar: 'المكورات الرئوية (PCV13)',       schedule: 'Adults ≥65, certain comorbidities' },
  { code: 'ppsv23',      name_en: 'Pneumococcal (PPSV23)',             name_ar: 'المكورات الرئوية (PPSV23)',      schedule: 'Adults ≥65 + at-risk' },
  { code: 'shingrix',    name_en: 'Zoster (Shingrix)',                  name_ar: 'الهربس النطاقي',                schedule: 'Adults ≥50, 2 doses' },
  { code: 'hpv',         name_en: 'HPV (Human Papillomavirus)',        name_ar: 'فيروس الورم الحليمي',           schedule: 'Ages 9-26, 2-3 doses' },
  { code: 'meningococcal',name_en: 'Meningococcal',                     name_ar: 'السحائي',                       schedule: 'Adolescents + at-risk' },
  { code: 'hepa',        name_en: 'Hepatitis A',                       name_ar: 'التهاب الكبد A',                schedule: '2 doses' },
];

function showVaccinationsForm(patientId, patientName) {
  const lang = currentLanguage();
  const isAr = lang === 'ar';

  const records = dbAll(`SELECT v.*, u.full_name_${isAr?'ar':'en'} as nurse_name
    FROM vaccinations v LEFT JOIN users u ON v.administered_by = u.user_id
    WHERE v.patient_id = ? ORDER BY v.administered_at DESC`, [patientId]);

  const recordsHtml = records.length === 0
    ? `<p style="color:#9ca3af;text-align:center;padding:20px">${isAr?'لا توجد لقاحات مسجلة':'No vaccinations on record'}</p>`
    : `<table style="width:100%;font-size:0.85rem">
        <thead><tr style="background:#f9fafb">
          <th style="text-align:left;padding:6px">${isAr?'اللقاح':'Vaccine'}</th>
          <th style="text-align:left;padding:6px">${isAr?'الجرعة':'Dose'}</th>
          <th style="text-align:left;padding:6px">${isAr?'التاريخ':'Date'}</th>
          <th style="text-align:left;padding:6px">${isAr?'بواسطة':'By'}</th>
        </tr></thead>
        <tbody>${records.map(r => `<tr>
          <td style="padding:6px;border-top:1px solid #f3f4f6"><strong>${escapeHtml(r.vaccine_name)}</strong>${r.next_due_date?`<br><small style="color:#6b7280">Next due: ${escapeHtml(r.next_due_date)}</small>`:''}</td>
          <td style="padding:6px;border-top:1px solid #f3f4f6">#${r.dose_number || 1}</td>
          <td style="padding:6px;border-top:1px solid #f3f4f6">${escapeHtml((r.administered_at||'').substring(0,10))}</td>
          <td style="padding:6px;border-top:1px solid #f3f4f6">${escapeHtml(r.nurse_name || '—')}</td>
        </tr>`).join('')}</tbody>
      </table>`;

  const vaccineOptions = COMMON_VACCINES.map(v => `<option value="${escapeHtml(isAr ? v.name_ar : v.name_en)}">${escapeHtml(isAr ? v.name_ar : v.name_en)}</option>`).join('');

  const today = new Date().toISOString().substring(0, 10);

  showModal(`
    <div style="max-width:680px;width:90vw">
      <h2>💉 ${isAr?'سجل التطعيمات':'Vaccination Record'} — ${escapeHtml(patientName)}</h2>

      <h3 style="margin:14px 0 6px;font-size:0.95rem">${isAr?'السجل الحالي':'Current Record'}</h3>
      <div style="max-height:240px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px">${recordsHtml}</div>

      <h3 style="margin:16px 0 6px;font-size:0.95rem">+ ${isAr?'إضافة تطعيم':'Add Vaccine'}</h3>
      <div class="form-row">
        <div class="form-group">
          <label>${isAr?'اللقاح':'Vaccine'} *</label>
          <input type="text" id="vac-name" list="vac-list" required>
          <datalist id="vac-list">${vaccineOptions}</datalist>
        </div>
        <div class="form-group" style="max-width:100px">
          <label>${isAr?'الجرعة #':'Dose #'}</label>
          <input type="number" id="vac-dose" value="1" min="1" max="10">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${isAr?'تاريخ الإعطاء':'Date Given'} *</label>
          <input type="date" id="vac-date" value="${today}" required>
        </div>
        <div class="form-group">
          <label>${isAr?'الموقع':'Site'}</label>
          <select id="vac-site">
            <option value="left_deltoid">${isAr?'الكتف الأيسر':'Left Deltoid'}</option>
            <option value="right_deltoid">${isAr?'الكتف الأيمن':'Right Deltoid'}</option>
            <option value="left_thigh">${isAr?'الفخذ الأيسر':'Left Thigh'}</option>
            <option value="right_thigh">${isAr?'الفخذ الأيمن':'Right Thigh'}</option>
            <option value="oral">${isAr?'فموي':'Oral'}</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${isAr?'رقم الدفعة':'Lot #'}</label>
          <input type="text" id="vac-lot">
        </div>
        <div class="form-group">
          <label>${isAr?'الجرعة القادمة':'Next Due'}</label>
          <input type="date" id="vac-next">
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
        <button class="btn btn-primary" onclick="saveVaccination(${patientId}, '${escapeHtml(patientName).replace(/'/g, '&apos;')}')">${isAr?'حفظ':'Save Vaccine'}</button>
      </div>
    </div>
  `);
}

function saveVaccination(patientId, patientName) {
  const user = getCurrentUser();
  const name = (document.getElementById('vac-name')?.value || '').trim();
  if (!name) { showError(currentLanguage()==='ar'?'اسم اللقاح مطلوب':'Vaccine name required'); return; }
  const dose = parseInt(document.getElementById('vac-dose')?.value) || 1;
  const date = document.getElementById('vac-date')?.value;
  const site = document.getElementById('vac-site')?.value;
  const lot  = document.getElementById('vac-lot')?.value || null;
  const next = document.getElementById('vac-next')?.value || null;

  dbRun(`INSERT INTO vaccinations (patient_id, vaccine_name, dose_number, administered_at, site, lot_number, administered_by, next_due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [patientId, name, dose, date + 'T' + new Date().toTimeString().substring(0,8), site, lot, user.user_id, next]);
  saveDBToIndexedDB();
  showSuccess(currentLanguage()==='ar' ? 'تم حفظ التطعيم' : 'Vaccination saved');
  closeModal();
  setTimeout(() => showVaccinationsForm(patientId, patientName), 200);
}

// ============================================================
// RECENTLY USED / FAVORITES — localStorage based
// ============================================================
function _recentKey(category) {
  const user = getCurrentUser();
  return `his_recent_${category}_${user?user.user_id:'anon'}`;
}

function addToRecent(category, item) {
  if (!item) return;
  const key = _recentKey(category);
  let list = [];
  try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
  // Remove if already present
  list = list.filter(i => (typeof i === 'string' ? i : i.value) !== (typeof item === 'string' ? item : item.value));
  // Add to front
  list.unshift(item);
  // Keep top 10
  list = list.slice(0, 10);
  try { localStorage.setItem(key, JSON.stringify(list)); } catch(e) {}
}

function getRecent(category) {
  const key = _recentKey(category);
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return []; }
}

function renderRecentStrip(category, label, onClickFn) {
  const items = getRecent(category);
  if (items.length === 0) return '';
  return `
    <div class="recent-strip">
      <span class="recent-strip-label">${escapeHtml(label)}:</span>
      ${items.map(it => {
        const display = typeof it === 'string' ? it : it.label;
        const value   = typeof it === 'string' ? it : it.value;
        return `<button class="recent-chip" onclick="${onClickFn}('${escapeHtml(value).replace(/'/g, '&apos;')}')">${escapeHtml(display)}</button>`;
      }).join('')}
    </div>
  `;
}

// ============================================================
// FIRST-TIME USER WELCOME TOUR
// ============================================================
function maybeShowWelcomeTour() {
  const user = getCurrentUser ? getCurrentUser() : null;
  if (!user) return;
  const seenKey = `his_tour_seen_${user.user_id}`;
  if (localStorage.getItem(seenKey)) return;
  showWelcomeTour();
}

function showWelcomeTour(stepIdx) {
  stepIdx = stepIdx || 0;
  const lang = currentLanguage();
  const isAr = lang === 'ar';
  const user = getCurrentUser();
  const userFirstName = (isAr ? user.full_name_ar : user.full_name_en).split(' ').slice(0, 2).join(' ');

  const steps = [
    {
      icon: '👋',
      title_en: `Welcome to HIS, ${userFirstName}!`,
      title_ar: `أهلاً بك في النظام، ${userFirstName}!`,
      body_en: 'This system is built to be SIMPLE. We treat you like a new staff member — everything is auto-filled, color-coded, and explains itself.',
      body_ar: 'هذا النظام مصمم ليكون سهلاً. نتعامل معك كموظف جديد — كل شيء يملأ تلقائياً وملوّن ويشرح نفسه.'
    },
    {
      icon: '🧭',
      title_en: 'Side menu = your role',
      title_ar: 'القائمة الجانبية = دورك',
      body_en: 'The left menu shows ONLY what your role can do. You won\'t see things that don\'t apply to you. Click any item to start.',
      body_ar: 'القائمة على اليسار تُظهر فقط ما يخص دورك. لن ترى أشياء لا تنطبق عليك. اضغط أي عنصر للبدء.'
    },
    {
      icon: '🧮',
      title_en: 'Floating Calculator (bottom-left)',
      title_ar: 'حاسبة عائمة (أسفل اليسار)',
      body_en: 'Need to calculate BMI, CHA₂DS₂-VASc, GCS, MELD? Click the blue 🧮 button bottom-left. 18 calculators, no math memorization needed.',
      body_ar: 'تحتاج حساب BMI أو GCS أو MELD؟ اضغط الزر الأزرق 🧮 أسفل اليسار. 18 حاسبة جاهزة.'
    },
    {
      icon: '⚡',
      title_en: 'Smart Phrases — type "/"',
      title_ar: 'القوالب الذكية — اكتب "/"',
      body_en: 'In any text field type "/" then a name (like /pain or /chf). Pick from the popup and Enter to insert a full template. 52 templates ready.',
      body_ar: 'في أي حقل نص اكتب "/" متبوعاً باسم (مثل /pain). اختر من القائمة واضغط Enter لإدراج قالب كامل. 52 قالب جاهز.'
    },
    {
      icon: '🚨',
      title_en: 'Code Blue — bottom-right',
      title_ar: 'Code Blue — أسفل اليمين',
      body_en: 'For cardiac arrest emergencies — the red button activates a hospital-wide alert. Practice with caution.',
      body_ar: 'لحالات السكتة القلبية الطارئة — الزر الأحمر يطلق إنذار في كامل المستشفى. تدرب بحذر.'
    },
    {
      icon: '⌨️',
      title_en: 'Keyboard shortcuts: ?',
      title_ar: 'اختصارات لوحة المفاتيح: ?',
      body_en: 'Press the ? key (anywhere outside text fields) to see all shortcuts. Press Esc to close any dialog.',
      body_ar: 'اضغط ? (خارج حقول النص) لرؤية كل الاختصارات. Esc لإغلاق أي نافذة.'
    },
    {
      icon: '🎯',
      title_en: "You're all set!",
      title_ar: 'أنت جاهز!',
      body_en: "If you ever feel stuck: hover anything for tooltips, press ?, or just click around. Nothing breaks. Mistakes can be undone. You got this!",
      body_ar: 'إذا شعرت بالضياع: مرّر الفأرة على أي شيء للتلميح، اضغط ?, أو فقط اضغط حولك. لا شيء يكسر. يمكن التراجع. أنت قادر!'
    }
  ];

  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;

  // Remove existing tour
  document.querySelectorAll('.tour-overlay').forEach(o => o.remove());

  const overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  overlay.innerHTML = `
    <div class="tour-card">
      <div style="font-size:3rem;margin-bottom:8px">${step.icon}</div>
      <h2>${escapeHtml(isAr ? step.title_ar : step.title_en)}</h2>
      <p style="margin:12px 0 0">${escapeHtml(isAr ? step.body_ar : step.body_en)}</p>
      <div class="tour-progress">
        ${steps.map((_, i) => `<span class="tour-dot ${i === stepIdx ? 'active' : ''}"></span>`).join('')}
      </div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:14px">
        <button class="btn btn-secondary" onclick="dismissWelcomeTour()">${isAr?'تخطّى':'Skip'}</button>
        ${stepIdx > 0 ? `<button class="btn btn-secondary" onclick="showWelcomeTour(${stepIdx-1})">← ${isAr?'السابق':'Back'}</button>` : ''}
        <button class="btn btn-primary" onclick="${isLast ? 'dismissWelcomeTour()' : `showWelcomeTour(${stepIdx+1})`}">
          ${isLast ? (isAr?'ابدأ! 🚀':'Get Started! 🚀') : (isAr?'التالي →':'Next →')}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function dismissWelcomeTour() {
  const user = getCurrentUser();
  if (user) localStorage.setItem(`his_tour_seen_${user.user_id}`, '1');
  document.querySelectorAll('.tour-overlay').forEach(o => o.remove());
}

// Allow user to manually re-open the tour from help menu
function restartWelcomeTour() {
  const user = getCurrentUser();
  if (user) localStorage.removeItem(`his_tour_seen_${user.user_id}`);
  showWelcomeTour();
}
