// ============================================================
// HIS — Smart Suggest Engine
// Non-intrusive context chips, ICD-10 autocomplete,
// procedure hints, drug dose auto-fill
// ============================================================

// ---- ICD-10 Mini Dataset (50 most common hospital diagnoses) ----
const ICD10 = [
  { code: 'J06.9',  en: 'Acute upper respiratory infection',      ar: 'التهاب حاد في الجهاز التنفسي العلوي' },
  { code: 'A09',    en: 'Infectious gastroenteritis',             ar: 'التهاب المعدة والأمعاء المعدي' },
  { code: 'J18.9',  en: 'Pneumonia, unspecified',                 ar: 'التهاب الرئة' },
  { code: 'I10',    en: 'Essential (primary) hypertension',       ar: 'ارتفاع ضغط الدم الأساسي' },
  { code: 'E11.9',  en: 'Type 2 diabetes mellitus',               ar: 'داء السكري من النوع الثاني' },
  { code: 'E11.10', en: 'Diabetic ketoacidosis (DKA)',             ar: 'الحماض الكيتوني السكري' },
  { code: 'I21.9',  en: 'Acute myocardial infarction',            ar: 'احتشاء عضلة القلب الحاد' },
  { code: 'I20.9',  en: 'Angina pectoris',                        ar: 'الذبحة الصدرية' },
  { code: 'I50.9',  en: 'Heart failure, unspecified',             ar: 'قصور القلب' },
  { code: 'I48.91', en: 'Atrial fibrillation',                    ar: 'الرجفان الأذيني' },
  { code: 'I63.9',  en: 'Cerebral infarction / Ischemic stroke',  ar: 'احتشاء دماغي / سكتة دماغية' },
  { code: 'J44.1',  en: 'COPD with acute exacerbation',           ar: 'داء الانسداد الرئوي المزمن مع تفاقم' },
  { code: 'J45.9',  en: 'Asthma, unspecified',                    ar: 'الربو' },
  { code: 'N39.0',  en: 'Urinary tract infection (UTI)',           ar: 'التهاب المسالك البولية' },
  { code: 'N17.9',  en: 'Acute kidney failure',                   ar: 'الفشل الكلوي الحاد' },
  { code: 'N18.9',  en: 'Chronic kidney disease',                 ar: 'مرض الكلى المزمن' },
  { code: 'K35.80', en: 'Acute appendicitis without abscess',     ar: 'التهاب الزائدة الدودية الحاد' },
  { code: 'K80.20', en: 'Cholelithiasis (gallstones)',             ar: 'حصوات المرارة' },
  { code: 'K92.1',  en: 'Upper GI bleeding / Melena',             ar: 'نزيف الجهاز الهضمي العلوي' },
  { code: 'K25.9',  en: 'Gastric ulcer',                          ar: 'قرحة المعدة' },
  { code: 'K29.70', en: 'Gastritis, unspecified',                  ar: 'التهاب المعدة' },
  { code: 'K57.30', en: 'Diverticulitis of large intestine',       ar: 'التهاب رتوج القولون' },
  { code: 'S72.0',  en: 'Fracture of femoral neck',               ar: 'كسر عنق عظم الفخذ' },
  { code: 'M54.5',  en: 'Low back pain',                          ar: 'ألم أسفل الظهر' },
  { code: 'M06.9',  en: 'Rheumatoid arthritis',                   ar: 'التهاب المفاصل الروماتويدي' },
  { code: 'R07.9',  en: 'Chest pain, unspecified',                ar: 'ألم في الصدر' },
  { code: 'R06.0',  en: 'Dyspnoea (shortness of breath)',         ar: 'ضيق التنفس' },
  { code: 'R10.9',  en: 'Unspecified abdominal pain',             ar: 'ألم بطني' },
  { code: 'R50.9',  en: 'Fever, unspecified',                     ar: 'حمى' },
  { code: 'R51',    en: 'Headache',                               ar: 'صداع' },
  { code: 'R55',    en: 'Syncope and collapse',                   ar: 'إغماء وانهيار' },
  { code: 'E86.0',  en: 'Dehydration',                            ar: 'جفاف' },
  { code: 'E03.9',  en: 'Hypothyroidism, unspecified',            ar: 'قصور الغدة الدرقية' },
  { code: 'E05.90', en: 'Hyperthyroidism, unspecified',           ar: 'فرط نشاط الغدة الدرقية' },
  { code: 'G40.9',  en: 'Epilepsy, unspecified',                  ar: 'الصرع' },
  { code: 'L03.9',  en: 'Cellulitis, unspecified',                ar: 'التهاب النسيج الخلوي' },
  { code: 'T14.9',  en: 'Unspecified injury',                     ar: 'إصابة' },
  { code: 'S09.90', en: 'Unspecified head injury',                ar: 'إصابة في الرأس' },
  { code: 'F32.9',  en: 'Major depressive disorder',              ar: 'الاكتئاب الرئيسي' },
  { code: 'O80',    en: 'Normal delivery',                        ar: 'ولادة طبيعية' },
  { code: 'O82',    en: 'Delivery by caesarean section',          ar: 'ولادة قيصرية' },
  { code: 'C34.9',  en: 'Malignant neoplasm of bronchus / lung',  ar: 'سرطان الرئة' },
  { code: 'Z51.11', en: 'Chemotherapy session',                   ar: 'جلسة علاج كيميائي' },
  { code: 'I64',    en: 'Stroke (unspecified haemorrhagic/isch.)',  ar: 'سكتة دماغية' },
  { code: 'K56.60', en: 'Intestinal obstruction',                 ar: 'انسداد معوي' },
  { code: 'J96.0',  en: 'Acute respiratory failure',              ar: 'فشل تنفسي حاد' },
  { code: 'A41.9',  en: 'Sepsis, unspecified',                    ar: 'إنتان الدم' },
  { code: 'D62',    en: 'Acute posthemorrhagic anaemia',          ar: 'فقر الدم الحاد من نزيف' },
  { code: 'Z87.891', en: 'Personal history of surgery',           ar: 'تاريخ جراحي سابق' },
];

// ---- Common Surgical Procedures with estimated durations ----
const PROCEDURES = [
  { en: 'Appendectomy',                         ar: 'استئصال الزائدة الدودية',    duration: 60  },
  { en: 'Laparoscopic cholecystectomy',          ar: 'استئصال المرارة بالمنظار',   duration: 75  },
  { en: 'Open cholecystectomy',                  ar: 'استئصال المرارة المفتوح',    duration: 90  },
  { en: 'Coronary angiography',                  ar: 'قسطرة قلبية تشخيصية',       duration: 45  },
  { en: 'Percutaneous coronary intervention (PCI)', ar: 'قسطرة قلبية علاجية',    duration: 90  },
  { en: 'Coronary artery bypass graft (CABG)',   ar: 'مجازة شريانية إكليلية',     duration: 240 },
  { en: 'Total hip replacement',                 ar: 'استبدال مفصل الورك الكلي',  duration: 120 },
  { en: 'Total knee replacement',                ar: 'استبدال مفصل الركبة الكلي', duration: 120 },
  { en: 'Femoral neck ORIF',                     ar: 'تثبيت كسر عنق الفخذ',      duration: 90  },
  { en: 'Inguinal hernia repair',                ar: 'إصلاح فتق الأربية',         duration: 60  },
  { en: 'Umbilical hernia repair',               ar: 'إصلاح الفتق السري',         duration: 45  },
  { en: 'Cesarean section',                      ar: 'ولادة قيصرية',              duration: 60  },
  { en: 'Tonsillectomy',                         ar: 'استئصال اللوزتين',          duration: 45  },
  { en: 'Total thyroidectomy',                   ar: 'استئصال الغدة الدرقية كاملاً', duration: 120 },
  { en: 'Partial thyroidectomy',                 ar: 'استئصال جزئي للغدة الدرقية', duration: 90 },
  { en: 'Modified radical mastectomy',           ar: 'استئصال الثدي الجذري المعدّل', duration: 120 },
  { en: 'Right hemicolectomy',                   ar: 'استئصال نصف القولون الأيمن', duration: 180 },
  { en: 'Sigmoid colectomy',                     ar: 'استئصال القولون السيني',     duration: 180 },
  { en: 'Lumbar discectomy',                     ar: 'استئصال غضروف الظهر القطني', duration: 90 },
  { en: 'Craniotomy',                            ar: 'فتح الجمجمة',              duration: 240 },
  { en: 'Tracheostomy',                          ar: 'فتح القصبة الهوائية',       duration: 45  },
  { en: 'Upper GI endoscopy',                    ar: 'تنظير الجهاز الهضمي العلوي', duration: 20 },
  { en: 'Colonoscopy',                           ar: 'تنظير القولون',            duration: 30  },
  { en: 'Cataract extraction with IOL',          ar: 'عملية المياه البيضاء',      duration: 30  },
  { en: 'Skin graft',                            ar: 'ترقيع الجلد',              duration: 90  },
];

// ---- Drug → suggested dose/route/frequency ----
const DRUG_DOSE_HINTS = {
  'paracetamol':   { dose: '1g',        route: 'oral',    freq: 'four_times_daily' },
  'acetaminophen': { dose: '1g',        route: 'oral',    freq: 'four_times_daily' },
  'ibuprofen':     { dose: '400mg',     route: 'oral',    freq: 'three_times_daily' },
  'amoxicillin':   { dose: '500mg',     route: 'oral',    freq: 'three_times_daily' },
  'augmentin':     { dose: '1g',        route: 'oral',    freq: 'twice_daily' },
  'metformin':     { dose: '500mg',     route: 'oral',    freq: 'twice_daily' },
  'amlodipine':    { dose: '5mg',       route: 'oral',    freq: 'once_daily' },
  'atorvastatin':  { dose: '40mg',      route: 'oral',    freq: 'once_daily' },
  'omeprazole':    { dose: '20mg',      route: 'oral',    freq: 'once_daily' },
  'pantoprazole':  { dose: '40mg',      route: 'oral',    freq: 'once_daily' },
  'metoprolol':    { dose: '25mg',      route: 'oral',    freq: 'twice_daily' },
  'furosemide':    { dose: '40mg',      route: 'oral',    freq: 'once_daily' },
  'enoxaparin':    { dose: '40mg',      route: 'sc',      freq: 'once_daily' },
  'heparin':       { dose: '5000 IU',   route: 'sc',      freq: 'three_times_daily' },
  'morphine':      { dose: '5mg',       route: 'im',      freq: 'every_6h' },
  'tramadol':      { dose: '50mg',      route: 'oral',    freq: 'three_times_daily' },
  'ondansetron':   { dose: '4mg',       route: 'iv',      freq: 'every_8h' },
  'dexamethasone': { dose: '8mg',       route: 'iv',      freq: 'twice_daily' },
  'vancomycin':    { dose: '1g',        route: 'iv',      freq: 'every_12h' },
  'ceftriaxone':   { dose: '2g',        route: 'iv',      freq: 'once_daily' },
  'cefazolin':     { dose: '1g',        route: 'iv',      freq: 'three_times_daily' },
  'ciprofloxacin': { dose: '500mg',     route: 'oral',    freq: 'twice_daily' },
  'insulin':       { dose: '10 IU',     route: 'sc',      freq: 'three_times_daily' },
  'warfarin':      { dose: '5mg',       route: 'oral',    freq: 'once_daily' },
  'aspirin':       { dose: '100mg',     route: 'oral',    freq: 'once_daily' },
  'clopidogrel':   { dose: '75mg',      route: 'oral',    freq: 'once_daily' },
  'salbutamol':    { dose: '2.5mg',     route: 'inhaled', freq: 'as_needed' },
  'prednisolone':  { dose: '40mg',      route: 'oral',    freq: 'once_daily' },
  'metronidazole': { dose: '500mg',     route: 'iv',      freq: 'three_times_daily' },
};

// ---- Diet suggestion rules based on diagnosis keywords ----
// Keywords include common clinical abbreviations. Short ASCII abbreviations
// (dm, mi, chf, htn...) are matched on word boundaries by keywordMatches() so
// they don't false-trigger inside words like "admission"; Arabic keywords are
// matched as substrings. NOTE: this is a lightweight heuristic, not a clinical
// terminology service (SNOMED CT / ICD) — needs clinician review for real use.
const DIET_SUGGEST_RULES = [
  { keywords: ['diabetes', 'diabetic', 'hyperglycemia', 'hyperglycaemia', 'dka', 't1dm', 't2dm', 'dm1', 'dm2', 'niddm', 'iddm', 'dm', 'سكري', 'سكر'], diet: 'Diabetic' },
  { keywords: ['cardiac', 'heart failure', 'coronary', 'myocardial', 'chf', 'cad', 'ihd', 'acs', 'stemi', 'nstemi', 'angina', 'mi', 'قلب', 'قصور القلب'], diet: 'Cardiac' },
  { keywords: ['renal', 'kidney', 'nephropathy', 'ckd', 'aki', 'esrd', 'dialysis', 'hemodialysis', 'haemodialysis', 'كلى', 'كلوي', 'فشل كلوي'], diet: 'Renal' },
  { keywords: ['liver', 'hepatic', 'cirrhosis', 'hepatitis', 'nafld', 'nash', 'ascites', 'كبد', 'تليف'], diet: 'Hepatic' },
  { keywords: ['npo', 'nil by mouth', 'pre-op', 'preoperative', 'nothing by mouth', 'صائم'], diet: 'NPO' },
  { keywords: ['hypertension', 'blood pressure', 'htn', 'high bp', 'ضغط'], diet: 'Low_Sodium' },
  { keywords: ['dysphagia', 'swallow', 'stroke', 'cva', 'صعوبة البلع', 'سكتة', 'بلع'], diet: 'Soft' },
  { keywords: ['cancer', 'chemotherapy', 'malnutrition', 'malignancy', 'cachexia', 'سرطان', 'كيماوي', 'سوء التغذية'], diet: 'High_Calorie' },
];

// Word-boundary-aware keyword match. ASCII keywords match as whole tokens so
// short abbreviations (dm, mi) don't fire inside "admission"/"family"; non-ASCII
// (Arabic) keywords use substring matching (\b is ASCII-only in JS regex).
function keywordMatches(text, kw) {
  if (/[^\x00-\x7f]/.test(kw)) return text.includes(kw);
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?:^|[^a-z0-9])' + esc + '(?:$|[^a-z0-9])').test(text);
}


// ============================================================
// Core: Autocomplete Dropdown
// ============================================================

/**
 * Attaches a searchable suggestion dropdown to a text <input>.
 * @param {HTMLInputElement} inputEl
 * @param {Array<{label, value, sublabel?}>} items
 * @param {{onSelect?, maxResults?, minChars?}} opts
 */
function createAutocomplete(inputEl, items, opts) {
  const onSelect   = (opts && opts.onSelect)    || null;
  const maxResults = (opts && opts.maxResults)  || 6;
  const minChars   = (opts && opts.minChars)    || 2;

  const dropdown = document.createElement('ul');
  dropdown.className = 'suggest-dropdown';
  dropdown.style.display = 'none';
  // a11y: expose the combobox/listbox relationship to screen readers
  const acId = 'ac-' + Math.random().toString(36).slice(2, 9);
  dropdown.id = acId;
  dropdown.setAttribute('role', 'listbox');
  inputEl.setAttribute('role', 'combobox');
  inputEl.setAttribute('aria-autocomplete', 'list');
  inputEl.setAttribute('aria-expanded', 'false');
  inputEl.setAttribute('aria-controls', acId);

  const parent = inputEl.parentNode;
  parent.style.position = 'relative';
  parent.appendChild(dropdown);

  let activeIdx = -1;

  function setActive(idx, els) {
    activeIdx = idx;
    els.forEach((el, i) => {
      const on = i === idx;
      el.classList.toggle('active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (idx >= 0 && els[idx]) inputEl.setAttribute('aria-activedescendant', els[idx].id);
    else inputEl.removeAttribute('aria-activedescendant');
  }

  function setExpanded(open) {
    inputEl.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) inputEl.removeAttribute('aria-activedescendant');
  }

  function renderDropdown(matches) {
    dropdown.innerHTML = matches.slice(0, maxResults).map((item, i) => `
      <li class="suggest-item${i === activeIdx ? ' active' : ''}" id="${acId}-opt-${i}" role="option" aria-selected="${i === activeIdx ? 'true' : 'false'}" data-idx="${i}">
        <span class="suggest-item-main">${escapeHtml(item.label)}</span>
        ${item.sublabel ? `<span class="suggest-item-sub">${escapeHtml(item.sublabel)}</span>` : ''}
      </li>`).join('');
    dropdown.style.display = matches.length ? 'block' : 'none';
    setExpanded(matches.length > 0);

    dropdown.querySelectorAll('.suggest-item').forEach((el, i) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(matches[i]);
      });
    });
  }

  function pick(item) {
    inputEl.value = item.value;
    dropdown.style.display = 'none';
    activeIdx = -1;
    setExpanded(false);
    if (onSelect) onSelect(item);
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim().toLowerCase();
    if (q.length < minChars) { dropdown.style.display = 'none'; return; }
    const matches = items.filter(item =>
      (item.label  && item.label.toLowerCase().includes(q)) ||
      (item.sublabel && item.sublabel.toLowerCase().includes(q)) ||
      (item.value  && item.value.toLowerCase().includes(q))
    );
    renderDropdown(matches);
  });

  inputEl.addEventListener('keydown', (e) => {
    const visible = dropdown.style.display !== 'none';
    const els = dropdown.querySelectorAll('.suggest-item');
    if (!visible) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(activeIdx + 1, els.length - 1), els);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIdx - 1, 0), els);
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      els[activeIdx].dispatchEvent(new MouseEvent('mousedown'));
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      setExpanded(false);
    }
  });

  inputEl.addEventListener('blur', () => {
    setTimeout(() => { dropdown.style.display = 'none'; activeIdx = -1; setExpanded(false); }, 150);
  });

  return {
    update(newItems) { items = newItems; }
  };
}


// ============================================================
// Context Chips
// ============================================================

/**
 * Renders a row of context hint chips at the top of a container.
 * Chips are small colored pills — informational or clickable.
 * @param {HTMLElement} containerEl — target container (prepended)
 * @param {Array<{icon, label, type, tooltip?, onClick?}>} chips
 *        type: 'warn' | 'info' | 'hint'
 */
function showContextChips(containerEl, chips) {
  if (!chips || !chips.length || !containerEl) return;
  const prev = containerEl.querySelector('.context-chips-row');
  if (prev) prev.remove();

  const row = document.createElement('div');
  row.className = 'context-chips-row';

  chips.forEach(chip => {
    const el = document.createElement('span');
    el.className = `context-chip context-chip-${chip.type || 'info'}`;
    if (chip.tooltip) el.title = chip.tooltip;
    if (chip.onClick) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', chip.onClick);
    }
    el.textContent = (chip.icon ? chip.icon + ' ' : '') + chip.label;
    row.appendChild(el);
  });

  // Insert as first child
  containerEl.insertBefore(row, containerEl.firstChild);
}


// ============================================================
// ICD-10 Autocomplete for Textarea
// ============================================================

/**
 * Adds a small ICD-10 search input above a textarea.
 * Selecting a code appends it to the textarea (new line).
 * @param {string} textareaId
 */
function attachICD10Autocomplete(textareaId) {
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;

  const lang = (typeof currentLanguage === 'function') ? currentLanguage() : 'en';
  const parent = textarea.parentNode;

  // Wrapper for the search input
  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'icd10-search-wrapper';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'icd10-search-input';
  searchInput.placeholder = lang === 'ar' ? '🔍 ابحث برمز ICD-10...' : '🔍 Search ICD-10 code to insert...';
  searchInput.autocomplete = 'off';
  searchWrapper.appendChild(searchInput);

  parent.insertBefore(searchWrapper, textarea);

  const items = ICD10.map(e => ({
    label: `[${e.code}] ${lang === 'ar' ? e.ar : e.en}`,
    sublabel: lang === 'ar' ? e.en : e.ar,
    value: `[${e.code}] ${lang === 'ar' ? e.ar : e.en}`,
  }));

  createAutocomplete(searchInput, items, {
    maxResults: 7,
    minChars: 2,
    onSelect(item) {
      const existing = textarea.value.trim();
      textarea.value = existing ? existing + '\n' + item.value : item.value;
      searchInput.value = '';
      textarea.focus();
    },
  });
}


// ============================================================
// Procedure Autocomplete for Surgical Scheduling
// ============================================================

/**
 * Attaches procedure name autocomplete to the surgical form.
 * Also fills estimated duration automatically on selection.
 * @param {HTMLInputElement} inputEl  — procedure_name text input
 * @param {HTMLInputElement} durationEl — duration number input
 */
function attachProcedureAutocomplete(inputEl, durationEl) {
  if (!inputEl) return;
  const lang = (typeof currentLanguage === 'function') ? currentLanguage() : 'en';

  const items = PROCEDURES.map(p => ({
    label: lang === 'ar' ? p.ar : p.en,
    sublabel: (lang === 'ar' ? p.en : p.ar) + ' — ' + p.duration + ' min',
    value: lang === 'ar' ? p.ar : p.en,
    _proc: p,
  }));

  createAutocomplete(inputEl, items, {
    maxResults: 6,
    minChars: 2,
    onSelect(item) {
      if (durationEl && item._proc) {
        durationEl.value = item._proc.duration;
        // Brief highlight to show it was auto-filled
        durationEl.classList.add('suggest-autofilled');
        setTimeout(() => durationEl.classList.remove('suggest-autofilled'), 1200);
      }
    },
  });
}


// ============================================================
// Drug Dose Hints
// ============================================================

/**
 * When a drug is selected in an Rx form, show a "Suggested dose" chip
 * that fills dose/route/frequency on click.
 * @param {string} drugName — generic name from the drug option
 * @param {string} doseId   — ID of the dose input
 * @param {string} routeId  — ID of the route select
 * @param {string} freqId   — ID of the freq select
 * @param {HTMLElement} chipTarget — element to put the chip in
 */
function showDrugDoseChip(drugName, doseId, routeId, freqId, chipTarget) {
  // Remove previous dose chip
  const prev = chipTarget && chipTarget.querySelector('.dose-hint-chip');
  if (prev) prev.remove();

  if (!drugName) return;
  const key = drugName.toLowerCase().trim();
  const hint = Object.keys(DRUG_DOSE_HINTS).find(k => key.includes(k));
  if (!hint) return;

  const h = DRUG_DOSE_HINTS[hint];
  const lang = (typeof currentLanguage === 'function') ? currentLanguage() : 'en';
  const label = lang === 'ar'
    ? `💡 اقتراح: ${h.dose} · ${h.route} · (انقر للتطبيق)`
    : `💡 Suggested: ${h.dose} · ${h.route} · ${h.freq.replace(/_/g,' ')} — click to apply`;

  const chip = document.createElement('span');
  chip.className = 'context-chip context-chip-hint dose-hint-chip';
  chip.style.cursor = 'pointer';
  chip.title = lang === 'ar' ? 'انقر لتعبئة الجرعة والطريق والتكرار تلقائياً' : 'Click to auto-fill dose, route, and frequency';
  chip.textContent = label;

  chip.addEventListener('click', () => {
    const doseEl  = document.getElementById(doseId);
    const routeEl = document.getElementById(routeId);
    const freqEl  = document.getElementById(freqId);
    if (doseEl)  { doseEl.value  = h.dose;  pulse(doseEl); }
    if (routeEl) { routeEl.value = h.route; pulse(routeEl); }
    if (freqEl)  { freqEl.value  = h.freq;  pulse(freqEl); }
    chip.remove();
  });

  if (chipTarget) chipTarget.appendChild(chip);
}

function pulse(el) {
  el.classList.add('suggest-autofilled');
  setTimeout(() => el.classList.remove('suggest-autofilled'), 1200);
}


// ============================================================
// Patient Context Chips (for Rx forms)
// ============================================================

/**
 * Build context chips for a patient's prescription form.
 * Shows allergies (red warning) and current meds (grey info).
 */
function getRxContextChips(patientId, admissionId) {
  const lang = (typeof currentLanguage === 'function') ? currentLanguage() : 'en';
  const chips = [];

  // Allergies — always show, always red
  const allergies = (typeof dbAll === 'function')
    ? dbAll('SELECT * FROM patient_allergies WHERE patient_id = ?', [patientId])
    : [];
  allergies.forEach(a => {
    chips.push({
      icon: '⚠️',
      label: (lang === 'ar' ? 'حساسية: ' : 'Allergy: ') + a.allergen,
      type: 'warn',
      tooltip: a.reaction
        ? (lang === 'ar' ? 'التفاعل: ' : 'Reaction: ') + a.reaction
        : (lang === 'ar' ? 'حساسية موثقة' : 'Documented allergy'),
    });
  });

  // Current active meds — grey info
  const currentRxs = (typeof dbAll === 'function')
    ? dbAll("SELECT drug_name, dose FROM prescriptions WHERE admission_id = ? AND status = 'active'", [admissionId])
    : [];
  if (currentRxs.length > 0) {
    const names = currentRxs.slice(0, 3).map(r => r.drug_name).join(', ')
      + (currentRxs.length > 3 ? ` +${currentRxs.length - 3}` : '');
    chips.push({
      icon: '💊',
      label: (lang === 'ar' ? 'أدوية نشطة: ' : 'Active meds: ') + names,
      type: 'info',
      tooltip: currentRxs.map(r => `${r.drug_name} ${r.dose}`).join('\n'),
    });
  }

  return chips;
}


// ============================================================
// Diet Suggestion Chip (for Diet Order forms)
// ============================================================

/**
 * Returns a single clickable chip suggesting a diet type
 * based on the patient's admission diagnosis, or null.
 * @param {number} admissionId
 * @param {Function} onApply — called with diet value string
 */
function getDietSuggestionChip(admissionId, onApply) {
  const lang = (typeof currentLanguage === 'function') ? currentLanguage() : 'en';
  const admission = (typeof dbGet === 'function')
    ? dbGet('SELECT initial_diagnosis, chief_complaint FROM admissions WHERE admission_id = ?', [admissionId])
    : null;
  if (!admission) return null;

  const text = ((admission.initial_diagnosis || '') + ' ' + (admission.chief_complaint || '')).toLowerCase();
  if (!text.trim()) return null;

  const rule = DIET_SUGGEST_RULES.find(r => r.keywords.some(k => keywordMatches(text, k)));
  if (!rule) return null;

  const dietLabel = rule.diet.replace(/_/g, ' ');
  return {
    icon: '💡',
    label: (lang === 'ar' ? 'اقتراح بناءً على التشخيص: ' : 'Suggested based on diagnosis: ') + dietLabel,
    type: 'hint',
    tooltip: (lang === 'ar' ? 'انقر لاختيار النظام الغذائي تلقائياً' : 'Click to auto-select this diet'),
    onClick() { if (onApply) onApply(rule.diet); },
  };
}


// ============================================================
// TAT (Turnaround Time) Helpers  — for Lab history
// ============================================================

/**
 * Calculate lab TAT in decimal hours.
 * @param {string} orderedAt  — ISO timestamp
 * @param {string} resultedAt — ISO timestamp
 * @returns {number|null}
 */
function calcTAT(orderedAt, resultedAt) {
  if (!orderedAt || !resultedAt) return null;
  const ms = new Date(resultedAt) - new Date(orderedAt);
  return ms > 0 ? ms / 3600000 : null;
}

/**
 * Render a colored TAT badge.
 * Green ≤ 4h · Yellow 4-8h · Red > 8h
 */
function tatBadge(hours) {
  if (hours === null || hours === undefined) return '<span class="text-muted">—</span>';
  const h = hours.toFixed(1);
  if (hours <= 4)  return `<span class="badge tat-ok">${h}h</span>`;
  if (hours <= 8)  return `<span class="badge tat-warn">${h}h</span>`;
  return `<span class="badge tat-late">${h}h</span>`;
}

// Node test harness only (the browser has no `module`):
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { keywordMatches, DIET_SUGGEST_RULES };
}
