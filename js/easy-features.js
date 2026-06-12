// ============================================================
// HIS — Easy Features (5-year-old friendly)
// Code Status banner | Vaccinations | Welcome Tour
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

  const today = todayISO();

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
        <button class="btn btn-primary" onclick="saveVaccination(${patientId}, '${jsAttr(patientName)}')">${isAr?'حفظ':'Save Vaccine'}</button>
      </div>
    </div>
  `);
}

async function saveVaccination(patientId, patientName) {
  const ar = currentLanguage()==='ar';
  const user = getCurrentUser();
  const name = (document.getElementById('vac-name')?.value || '').trim();
  if (!name) { showError(ar?'اسم اللقاح مطلوب':'Vaccine name required'); return; }
  const dose = parseInt(document.getElementById('vac-dose')?.value) || 1;
  const date = document.getElementById('vac-date')?.value;
  const site = document.getElementById('vac-site')?.value;
  const lot  = document.getElementById('vac-lot')?.value || null;
  const next = document.getElementById('vac-next')?.value || null;

  // Wrap the write: if the INSERT throws (constraint, quota, etc.) the clinician
  // must see a failure, NOT a "saved" toast that hides a dropped vaccine record
  // (which risks a double-dose later). Await the persist so the row is durable
  // before we report success.
  try {
    dbRun(`INSERT INTO vaccinations (patient_id, vaccine_name, dose_number, administered_at, site, lot_number, administered_by, next_due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [patientId, name, dose, date + 'T' + new Date().toTimeString().substring(0,8), site, lot, user.user_id, next]);
    await saveDBToIndexedDB();
  } catch (e) {
    console.error('Vaccination save failed:', e);
    showError(ar ? 'فشل حفظ التطعيم — لم يُسجَّل' : 'Failed to save vaccination — NOT recorded');
    return;
  }
  showSuccess(ar ? 'تم حفظ التطعيم' : 'Vaccination saved');
  closeModal();
  setTimeout(() => showVaccinationsForm(patientId, patientName), 200);
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


