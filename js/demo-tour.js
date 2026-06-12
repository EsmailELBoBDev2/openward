// ============================================================
// GUIDED DEMO TOUR — "follow one patient through the hospital"
// ============================================================
// Demo installs only (never rendered in production or server mode — the
// entry points are gated in setupShowcaseLogin / the boot hook).
//
// The tour registers a REAL patient through the REAL forms and follows him
// across role logins: ER registration → ward-doctor prescribing (including a
// deliberately unsafe order so the visitor sees the app REFUSE it) →
// pharmacy verify/dispense → nurse MAR with the two-identifier check →
// the manager's tamper-evident audit trail. Every click runs the actual
// handlers — nothing is mocked, and the data it creates is ordinary demo
// data in this browser's sandbox.
//
// State lives in localStorage (ow_tour) so the tour survives the login
// switches it performs itself (demo credentials are seed constants).

const TOUR_KEY = 'ow_tour';
const TOUR_PATIENT = {
  nameAr: 'سالم التجريبي', nameEn: 'Salem Al-Demo',
  natId: '1099887766', dob: '1965-04-12',
  complaint: 'Headache and dizziness since this morning — صداع ودوخة منذ الصباح',
};

function tourState() { try { return JSON.parse(localStorage.getItem(TOUR_KEY)) || null; } catch (e) { return null; } }
function tourSave(s) { localStorage.setItem(TOUR_KEY, JSON.stringify(s)); }
function tourIsDemoInstall() {
  if (typeof SERVER_MODE !== 'undefined' && SERVER_MODE) return false;
  try { return typeof dbGet === 'function' && !!dbGet("SELECT user_id FROM users WHERE username = 'dr.omar'"); }
  catch (e) { return false; }
}

// ---- tiny DOM helpers (everything defensive: the tour must never crash the app) ----
function tourSet(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
function tourPickOption(id, needle) {
  const el = document.getElementById(id);
  if (!el) return;
  const n = needle.toLowerCase();
  for (const o of el.options) {
    if ((o.dataset.name || o.textContent || '').toLowerCase().includes(n)) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); return; }
  }
}

// ---- the script: one step = one beat of the story ----
// step: { role:[user,pw,labelEn,labelAr], view, title:{en,ar}, body:{en,ar},
//         mode:'click'|'auto'|'info'|'final', enter(s), auto(s),
//         target(s) -> CSS selector|Element|null, done(s) -> bool }
const TOUR_STEPS = [
  { // 0 — ER registration (the visitor presses the real Register button)
    role: ['dr.omar', 'doctor123', 'ER Doctor', 'طبيب الطوارئ'],
    view: 'er-register', mode: 'click',
    title: { en: '1 · A patient arrives at the ER', ar: '١ · مريض يصل إلى الطوارئ' },
    body: {
      en: 'I pre-filled the arrival form for <strong>Salem Al-Demo</strong> — note the documented <strong>Penicillin allergy</strong> and <strong>cardiac condition</strong>; they matter later. Admitting to Internal Medicine.<br><br>👉 <strong>You do it: click the big “Register” button</strong> — then watch the app <em>review its own suggestions with you</em> (diet, complexity — derived from his conditions) and confirm them.',
      ar: 'عبّأتُ نموذج الوصول للمريض <strong>سالم التجريبي</strong> — لاحظ <strong>حساسية البنسلين</strong> الموثقة و<strong>المرض القلبي</strong>؛ سيهمّان لاحقاً. التنويم في الباطنة.<br><br>👉 <strong>دورك: اضغط زر «تسجيل» الكبير</strong> — ثم لاحظ كيف <em>يقترح النظام تلقائياً</em> (التغذية، درجة التعقيد — من حالته المرضية) وأكّد الاقتراحات.',
    },
    enter() {
      tourSet('reg-name-ar', TOUR_PATIENT.nameAr); tourSet('reg-name-en', TOUR_PATIENT.nameEn);
      tourSet('reg-national-id', TOUR_PATIENT.natId); tourSet('reg-dob', TOUR_PATIENT.dob);
      tourSet('reg-gender', 'male'); tourSet('reg-triage', '3');
      tourSet('reg-complaint', TOUR_PATIENT.complaint);
      tourSet('reg-bed', 'B-300');
      tourSet('reg-bp-sys', '132'); tourSet('reg-bp-dia', '86'); tourSet('reg-hr', '88');
      tourSet('reg-temp', '37.2'); tourSet('reg-o2', '97');
      tourPickOption('reg-dept', 'internal');
      const cond = document.querySelector('input[name="conditions"][value="cardiac"]');
      if (cond && !cond.checked) cond.click();
      if (typeof addAllergyRow === 'function' && document.querySelectorAll('#allergy-list .allergy-name').length === 0) {
        addAllergyRow();
        const rows = document.querySelectorAll('#allergy-list .form-row');
        const row = rows[rows.length - 1];
        if (row) {
          const name = row.querySelector('.allergy-name'); if (name) name.value = 'Penicillin';
          const sev = row.querySelector('.allergy-severity'); if (sev) sev.value = 'severe';
          const rea = row.querySelector('.allergy-reaction'); if (rea) rea.value = 'anaphylaxis';
        }
      }
    },
    auto() {
      const review = document.querySelector('.review-confirm-btn');
      if (review) { review.click(); return; }   // phase 2: confirm the smart-review panel
      const f = document.getElementById('register-patient-form'); if (f) f.requestSubmit();
      setTimeout(() => { const r2 = document.querySelector('.review-confirm-btn'); if (r2) r2.click(); }, 900);
    },
    target() { return document.querySelector('.review-confirm-btn') || '#register-patient-form button[type="submit"]'; },
    done(s) {
      const p = dbGet('SELECT p.patient_id, p.mrn, a.admission_id FROM patients p JOIN admissions a ON a.patient_id = p.patient_id WHERE p.national_id = ? ORDER BY a.admission_id DESC LIMIT 1', [TOUR_PATIENT.natId]);
      if (!p) return false;
      s.patientId = p.patient_id; s.admissionId = p.admission_id; s.mrn = p.mrn; tourSave(s);
      return true;
    },
  },
  { // 1 — open the chart, meet the safety banner
    role: ['dr.omar', 'doctor123', 'ER Doctor', 'طبيب الطوارئ'],
    view: 'er-cases', mode: 'click',
    title: { en: '2 · Open Salem’s chart', ar: '٢ · افتح ملف سالم' },
    body: {
      en: 'Salem is in the ER case list now.<br><br>👉 <strong>Click his “Details” button</strong> — and notice the red <strong>safety banner</strong>: the Penicillin allergy follows him to every screen, no one has to remember it.',
      ar: 'سالم الآن في قائمة حالات الطوارئ.<br><br>👉 <strong>اضغط زر «تفاصيل»</strong> — ولاحظ <strong>شريط الأمان</strong> الأحمر: حساسية البنسلين ترافقه في كل شاشة.',
    },
    auto(s) { if (typeof showPatientDetail === 'function') showPatientDetail(s.patientId, s.admissionId); },
    target(s) { return `[onclick*="showPatientDetail(${s.patientId},"]`; },
    done() { const m = document.getElementById('main-content'); return !!(m && /Penicillin/.test(m.innerHTML)); },
  },
  { // 2 — look around the ER: the features that are ALWAYS one tap away
    role: ['dr.omar', 'doctor123', 'ER Doctor', 'طبيب الطوارئ'],
    view: 'er-cases', mode: 'info',
    title: { en: '3 · Always within reach', ar: '٣ · دائماً في المتناول' },
    body: {
      en: 'Watch the spotlight rotate — these live on <em>every</em> screen:<br>🚨 <strong>Code Blue</strong> — one tap summons the resus team with the patient context attached.<br>🧮 <strong>Clinical calculators</strong> — NEWS2, GCS, MELD, Wells… 18 of them, citation-pinned.<br>🔍 <strong>Global search</strong> — any patient by name or MRN from anywhere.',
      ar: 'تابع الإضاءة المتنقلة — هذه متوفرة في <em>كل</em> شاشة:<br>🚨 <strong>النداء الأزرق</strong> — لمسة واحدة تستدعي فريق الإنعاش مع سياق المريض.<br>🧮 <strong>الحاسبات السريرية</strong> — NEWS2 وGCS وMELD وغيرها، 18 حاسبة موثقة المراجع.<br>🔍 <strong>البحث الشامل</strong> — أي مريض بالاسم أو الرقم الطبي من أي مكان.',
    },
    targets: ['#code-blue-fab', '#calc-fab', '#global-search'],
    target() { return null; }, done() { return false; },
  },
  { // 3 — the unsafe order (the app must refuse)
    role: ['dr.sarah', 'doctor123', 'Ward Doctor', 'طبيبة الجناح'],
    view: 'doc-rx', mode: 'click',
    title: { en: '4 · Try to prescribe the WRONG drug', ar: '٤ · جرّب وصف الدواء الخاطئ' },
    body: {
      en: 'You are Dr. Sarah on the ward now (the tour assigned Salem to her). I selected <strong>Amoxicillin</strong> — a penicillin-class drug for a patient with a <strong>documented penicillin allergy</strong>.<br><br>👉 <strong>You do it: click “Prescribe”.</strong> The app should stop you. That is the point.',
      ar: 'أنت الآن د. سارة في الجناح (الجولة أسندت سالم إليها). اخترتُ <strong>أموكسيسيلين</strong> — من فئة البنسلين لمريض لديه <strong>حساسية بنسلين موثقة</strong>.<br><br>👉 <strong>دورك: اضغط «وصف الدواء».</strong> يجب أن يوقفك النظام — وهذا هو المطلوب.',
    },
    enter(s) {
      // the consultant hand-off, done for real: Salem is now Dr. Sarah's case
      const doc = dbGet("SELECT user_id FROM users WHERE username = 'dr.sarah'");
      const consult = dbGet("SELECT user_id FROM users WHERE username = 'dr.ahmed'");
      if (doc && !dbGet('SELECT id FROM case_assignments WHERE admission_id = ? AND doctor_id = ?', [s.admissionId, doc.user_id])) {
        dbRun('INSERT INTO case_assignments (admission_id, doctor_id, assigned_by, assigned_at) VALUES (?,?,?,?)',
          [s.admissionId, doc.user_id, (consult || doc).user_id, nowISO()]);
        saveDBToIndexedDB();
        navigateTo('doc-rx');   // re-render now that the assignment exists
      }
      setTimeout(() => {
        const sel = document.getElementById('rx-patient');
        if (sel) sel.value = String(s.admissionId);
        tourPickOption('rx-drug', 'amoxicillin');
        tourSet('rx-dose', '500mg'); tourSet('rx-route', 'oral'); tourSet('rx-freq', 'three_times_daily');
      }, 350);
    },
    auto() { const f = document.querySelector('#rx-drug') && document.querySelector('#rx-drug').closest('form'); if (f) f.requestSubmit(); },
    target() { const d = document.getElementById('rx-drug'); return d ? d.closest('form').querySelector('button[type="submit"]') : null; },
    done() { const o = document.querySelector('.alert-overlay'); return !!(o && /allerg|حساسية/i.test(o.textContent)); },
  },
  { // 3 — read the refusal, take the way out
    role: ['dr.sarah', 'doctor123', 'Ward Doctor', 'طبيبة الجناح'],
    view: 'doc-rx', mode: 'click',
    title: { en: '5 · The app said no', ar: '٥ · النظام رفض' },
    body: {
      en: 'This is the <strong>red allergy alert</strong>: it names the allergen, the severity, and demands a <em>typed reason</em> from anyone who overrides it — which lands in the permanent audit log.<br><br>👉 <strong>Choose the safe way out (Cancel / decline)</strong> and we’ll order something sensible instead.',
      ar: 'هذا هو <strong>تنبيه الحساسية الأحمر</strong>: يذكر المادة والشدة ويطلب <em>سبباً مكتوباً</em> من أي شخص يتجاوزه — ويُسجَّل في سجل التدقيق الدائم.<br><br>👉 <strong>اختر الخيار الآمن (إلغاء)</strong> وسنصف بديلاً مناسباً.',
    },
    auto() { const o = document.querySelector('.alert-overlay'); if (!o) return; const btns = [...o.querySelectorAll('button')]; const c = btns.find(b => /cancel|إلغاء|decline|رفض/i.test(b.textContent)); if (c) c.click(); },
    target() { const o = document.querySelector('.alert-overlay'); if (!o) return null; const btns = [...o.querySelectorAll('button')]; return btns.find(b => /cancel|إلغاء|decline|رفض/i.test(b.textContent)) || null; },
    done(s) {
      return !document.querySelector('.alert-overlay')
        && !dbGet("SELECT rx_id FROM prescriptions WHERE admission_id = ? AND drug_name LIKE '%moxicillin%'", [s.admissionId]);
    },
  },
  { // 4 — the safe order goes through (watch me)
    role: ['dr.sarah', 'doctor123', 'Ward Doctor', 'طبيبة الجناح'],
    view: 'doc-rx', mode: 'auto',
    title: { en: '6 · Order the right drug', ar: '٦ · وصف الدواء الصحيح' },
    body: {
      en: 'Watch — I’m prescribing <strong>Paracetamol 500mg</strong> instead: no allergy match, no condition conflict, so it goes straight through to the pharmacy queue.',
      ar: 'شاهد — أصف الآن <strong>باراسيتامول 500mg</strong>: لا حساسية ولا تعارض مع حالته، فيمرّ مباشرة إلى طابور الصيدلية.',
    },
    enter(s) {
      try { dbRun("UPDATE drugs SET stock_qty = 200 WHERE name_generic LIKE '%Paracetamol%' AND stock_qty < 10"); } catch (e) {}
      setTimeout(() => {
        const sel = document.getElementById('rx-patient'); if (sel) sel.value = String(s.admissionId);
        tourPickOption('rx-drug', 'paracetamol');
        tourSet('rx-dose', '500mg'); tourSet('rx-route', 'oral'); tourSet('rx-freq', 'three_times_daily');
        const f = sel && sel.closest('form'); if (f) setTimeout(() => f.requestSubmit(), 600);
      }, 350);
    },
    target() { return null; },
    done(s) {
      const rx = dbGet("SELECT rx_id FROM prescriptions WHERE admission_id = ? AND drug_name LIKE '%aracetamol%' ORDER BY rx_id DESC LIMIT 1", [s.admissionId]);
      if (!rx) return false;
      s.rxId = rx.rx_id; tourSave(s); return true;
    },
  },
  { // 5 — pharmacist verifies
    role: ['pharm.ali', 'pharm123', 'Pharmacist', 'الصيدلاني'],
    view: 'ph-queue', mode: 'click',
    title: { en: '7 · Pharmacy is the second pair of eyes', ar: '٧ · الصيدلية عين ثانية' },
    body: {
      en: 'You are the pharmacist now — and there is Salem’s Paracetamol, waiting. Pharmacy re-runs the allergy check independently before anything reaches a nurse.<br><br>👉 <strong>Click “✓ Verify”</strong> on Salem’s order.',
      ar: 'أنت الصيدلاني الآن — وهذه وصفة سالم بانتظارك. الصيدلية تعيد فحص الحساسية باستقلالية قبل أن يصل أي دواء للتمريض.<br><br>👉 <strong>اضغط «تحقق»</strong> على وصفة سالم.',
    },
    auto(s) { if (typeof handleVerifyRx === 'function') handleVerifyRx(s.rxId); },
    target(s) { return `[onclick*="handleVerifyRx(${s.rxId})"]`; },
    done(s) { const rx = dbGet('SELECT verified_at FROM prescriptions WHERE rx_id = ?', [s.rxId]); return !!(rx && rx.verified_at); },
  },
  { // 6 — dispense (stock-guarded)
    role: ['pharm.ali', 'pharm123', 'Pharmacist', 'الصيدلاني'],
    view: 'ph-queue', mode: 'click',
    title: { en: '8 · Dispense it', ar: '٨ · صرف الدواء' },
    body: {
      en: 'Verified → now dispense. Dispensing atomically claims the order and deducts stock — two pharmacists can’t double-dispense the same order even by clicking at the same instant.<br><br>👉 <strong>Click “Dispense”.</strong>',
      ar: 'تم التحقق → الآن الصرف. الصرف يحجز الوصفة ويخصم المخزون بعملية واحدة — لا يمكن لصيدليين صرف نفس الوصفة مرتين حتى لو ضغطا معاً.<br><br>👉 <strong>اضغط «صرف».</strong>',
    },
    auto(s) { if (typeof handleDispense === 'function') handleDispense(s.rxId); },
    target(s) { return `[onclick*="handleDispense(${s.rxId})"]`; },
    done(s) { const rx = dbGet("SELECT status FROM prescriptions WHERE rx_id = ?", [s.rxId]); return !!(rx && rx.status === 'dispensed'); },
  },
  { // — look around the pharmacy
    role: ['pharm.ali', 'pharm123', 'Pharmacist', 'الصيدلاني'],
    view: 'ph-queue', mode: 'info',
    title: { en: '9 · More in the pharmacy', ar: '٩ · المزيد في الصيدلية' },
    body: {
      en: 'The spotlight is rotating through the rest of the pharmacist\'s world: 📦 <strong>live inventory</strong> with low-stock thresholds, 📥 <strong>receive stock</strong>, and the 📜 <strong>dispense log</strong> — every pill accounted for.<br><br>Press <strong>Next</strong> to follow Salem\'s dose to the ward.',
      ar: 'الإضاءة تتنقل عبر بقية عالم الصيدلاني: 📦 <strong>مخزون حيّ</strong> مع حدود النقص، 📥 <strong>استلام مخزون</strong>، و📜 <strong>سجل الصرف</strong> — كل حبة محسوبة.<br><br>اضغط <strong>التالي</strong> لمتابعة جرعة سالم إلى الجناح.',
    },
    targets: ['.nav-btn[data-view="ph-inventory"]', '.nav-btn[data-view="ph-receive"]', '.nav-btn[data-view="ph-log"]'],
    target() { return null; }, done() { return false; },
  },
  { // — nurse charts it on the MAR (two identifiers!)
    role: ['nurse.mona', 'nurse123', 'Ward Nurse', 'ممرضة الجناح'],
    view: 'nr-mar', mode: 'click',
    title: { en: '10 · Give the dose — to the RIGHT patient', ar: '١٠ · إعطاء الجرعة — للمريض الصحيح' },
    body: {
      en: 'You are Salem’s nurse. Open the charting dialog and look at the top: <strong>name + MRN + date of birth</strong> — two-identifier verification against the wristband (room numbers don’t count). Mark it <em>Given</em> and save.<br><br>👉 <strong>Click “Log” on Salem’s Paracetamol, then Save.</strong>',
      ar: 'أنت ممرضة سالم. افتحي نافذة التوثيق وانظري أعلاها: <strong>الاسم + الرقم الطبي + تاريخ الميلاد</strong> — تحقق بمعرّفين مقابل سوار المعصم (رقم الغرفة لا يُعتد به). اختاري <em>أُعطي</em> واحفظي.<br><br>👉 <strong>اضغطي «إعطاء» على باراسيتامول سالم ثم احفظي.</strong>',
    },
    auto(s) {
      if (document.getElementById('mar-save-btn')) { document.getElementById('mar-save-btn').click(); return; }
      const btn = document.querySelector(`[onclick*="showMARLogForm(${s.rxId},"]`); if (btn) btn.click();
      setTimeout(() => { const sv = document.getElementById('mar-save-btn'); if (sv) sv.click(); }, 700);
    },
    target(s) { return document.getElementById('mar-save-btn') || `[onclick*="showMARLogForm(${s.rxId},"]`; },
    done(s) { return !!dbGet("SELECT mar_id FROM med_admin_records WHERE prescription_id = ? AND status = 'given' LIMIT 1", [s.rxId]); },
  },
  { // — look around the nurse's world
    role: ['nurse.mona', 'nurse123', 'Ward Nurse', 'ممرضة الجناح'],
    view: 'nr-mar', mode: 'info',
    title: { en: '11 · A nurse\'s shift, organized', ar: '١١ · وردية الممرضة، منظمة' },
    body: {
      en: 'Beyond the MAR, the spotlight shows the nurse\'s other tools: ✅ <strong>prioritized tasks</strong> (a "what needs me now" list), 💧 <strong>fluids I/O balance</strong>, 📋 <strong>assessments</strong> (Morse falls, Braden, pain) — and the 🧮 calculators are right there too.<br><br><strong>Next</strong>: the view from the top.',
      ar: 'إلى جانب سجل الإعطاء، تعرض الإضاءة بقية أدوات الممرضة: ✅ <strong>مهام مرتّبة بالأولوية</strong>، 💧 <strong>ميزان السوائل</strong>، 📋 <strong>التقييمات</strong> (مورس، برادن، الألم) — والحاسبات 🧮 في المتناول أيضاً.<br><br><strong>التالي</strong>: المشهد من الأعلى.',
    },
    targets: ['.nav-btn[data-view="nr-tasks"]', '.nav-btn[data-view="nr-fluids"]', '.nav-btn[data-view="nr-assessments"]', '#calc-fab'],
    target() { return null; }, done() { return false; },
  },
  { // — the manager sees everything in the audit trail
    role: ['manager', 'manager123', 'Hospital Manager', 'مدير المستشفى'],
    view: 'hm-blackbox', mode: 'info',
    title: { en: '12 · Everything you did is on the record', ar: '١٢ · كل ما فعلته مسجَّل' },
    body: {
      en: 'The manager’s “black box”: registration, the <strong>refused Amoxicillin alert</strong>, the prescription, the verification, the dispense, the MAR entry — every step you just took, hash-chained so silent edits are detectable. This audit trail is the spine of the whole system.<br><br>Press <strong>Next</strong> for the finale.',
      ar: '«الصندوق الأسود» للمدير: التسجيل، <strong>تنبيه الأموكسيسيلين المرفوض</strong>، الوصفة، التحقق، الصرف، توثيق الإعطاء — كل خطوة قمت بها الآن، مسلسلة التجزئة بحيث يُكشف أي تعديل خفي.<br><br>اضغط <strong>التالي</strong> للختام.',
    },
    target() { return '#main-content table'; },
    done() { return false; },   // advances via the Next button
  },
  { // — look around the manager's cockpit
    role: ['manager', 'manager123', 'Hospital Manager', 'مدير المستشفى'],
    view: 'hm-overview', mode: 'info',
    title: { en: '13 · The manager\'s cockpit', ar: '١٣ · قمرة قيادة المدير' },
    body: {
      en: 'The spotlight tours the oversight tools: 📊 <strong>live analytics</strong> (admissions, LOS, critical labs — lazy-loaded charts), 🛏️ <strong>the bed map</strong>, and 📑 <strong>reports</strong>. The manager sees the hospital, not patient charts — oversight roles deliberately have no prescribing or charting rights.',
      ar: 'الإضاءة تستعرض أدوات الإشراف: 📊 <strong>تحليلات حيّة</strong> (التنويمات، مدة الإقامة، الفحوصات الحرجة)، 🛏️ <strong>خريطة الأسرّة</strong>، و📑 <strong>التقارير</strong>. المدير يرى المستشفى لا ملفات المرضى — أدوار الإشراف بلا صلاحيات وصف أو توثيق عمداً.',
    },
    targets: ['.nav-btn[data-view="hm-analytics"]', '.nav-btn[data-view="hm-beds"]', '.nav-btn[data-view="hm-reports"]'],
    target() { return null; }, done() { return false; },
  },
  { // — finale
    role: ['manager', 'manager123', 'Hospital Manager', 'مدير المستشفى'],
    view: 'hm-overview', mode: 'final',
    title: { en: '🎉 That was the whole loop', ar: '🎉 هذه هي الدورة كاملة' },
    body: {
      en: 'Arrival → chart → a blocked unsafe order → the safe one → pharmacy double-check → bedside two-identifier charting → tamper-evident audit. One patient, five roles, every guard rail live.<br><br>Keep exploring with the role picker on the login screen — or, when it’s time to run this for real:',
      ar: 'وصول → ملف → إيقاف وصفة خاطئة → الوصفة الآمنة → تدقيق الصيدلية → توثيق بمعرّفين عند السرير → سجل تدقيق مُحصَّن. مريض واحد، خمسة أدوار، وكل حواجز الأمان حيّة.<br><br>واصل الاستكشاف من قائمة الأدوار في شاشة الدخول — أو حين يحين وقت التشغيل الفعلي:',
    },
    target() { return null; },
    done() { return false; },
  },
];

// ---- engine ----
let _tourTimer = null;
let _tourHighlighted = null;
let _tourRunToken = 0;   // stale async runSteps (double-clicks, debug calls) go inert
let _tourSpotIdx = 0;    // rotating-spotlight position for steps with `targets: [...]`

// Pops once after a fresh Demo install (and never again): "want the tour?"
function demoTourOffer() {
  if (!tourIsDemoInstall() || tourState()) return;
  if (localStorage.getItem('ow_tour_offered')) return;
  if (typeof getCurrentSession === 'function' && getCurrentSession()) return;   // already inside the app
  localStorage.setItem('ow_tour_offered', '1');
  const ar = currentLanguage() === 'ar';
  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  overlay.innerHTML = `
    <div class="alert-modal" style="max-width:460px;text-align:center">
      <div style="font-size:2.5rem">🎬</div>
      <h2 style="margin:6px 0 8px">${ar ? 'جولة إرشادية؟' : 'Want the guided tour?'}</h2>
      <p class="text-muted" style="font-size:0.9rem;margin-bottom:16px">${ar
        ? 'تابع مريضاً واحداً من باب الطوارئ حتى سجل التدقيق — عبر خمسة أدوار. أنا أقود وأبدّل تسجيلات الدخول، وأنت تضغط الأزرار المهمة (بما فيها الزر الذي سيرفضه النظام عمداً).'
        : 'Follow one patient from the ER door to the audit log — across five staff roles. I drive and switch the logins; you press the buttons that matter (including the one the app will refuse, on purpose).'}</p>
      <div class="alert-buttons" style="justify-content:center">
        <button class="btn btn-primary" onclick="this.closest('.alert-overlay').remove(); demoTourStart()">${ar ? '🎬 ابدأ الجولة' : '🎬 Start the tour'}</button>
        <button class="btn btn-secondary" onclick="this.closest('.alert-overlay').remove()">${ar ? 'أستكشف بنفسي' : 'I\'ll explore on my own'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function demoTourStart() {
  if (!tourIsDemoInstall()) return;
  tourSave({ i: 0 });
  demoTourRunStep();
}

function demoTourMaybeResume() {
  const s = tourState();
  if (!s || typeof s.i !== 'number' || !tourIsDemoInstall()) return;
  demoTourRunStep();
}

function demoTourEnd() {
  localStorage.removeItem(TOUR_KEY);
  if (_tourTimer) { clearInterval(_tourTimer); _tourTimer = null; }
  _tourClearHighlight();
  const p = document.getElementById('tour-panel'); if (p) p.remove();
}

function _tourClearHighlight() {
  if (_tourHighlighted) { try { _tourHighlighted.classList.remove('tour-spot'); } catch (e) {} _tourHighlighted = null; }
}

async function demoTourRunStep() {
  const s = tourState(); if (!s) return;
  const step = TOUR_STEPS[s.i]; if (!step) { demoTourEnd(); return; }
  const token = ++_tourRunToken;

  // become the right persona (demo constants — this is the whole point of a demo install)
  try {
    const sess = (typeof getCurrentSession === 'function') ? getCurrentSession() : null;
    const me = sess ? dbGet('SELECT username FROM users WHERE user_id = ?', [sess.user_id]) : null;
    if (!me || me.username !== step.role[0]) {
      const r = await login(step.role[0], step.role[1]);
      if (!r || !r.success) { demoTourEnd(); return; }
      routeToDashboard();
      await new Promise(r2 => setTimeout(r2, 350));
    }
  } catch (e) { /* login machinery missing — bail quietly */ demoTourEnd(); return; }

  if (token !== _tourRunToken) return;   // a newer runStep superseded this one
  if (typeof currentView === 'undefined' || currentView !== step.view) navigateTo(step.view);
  await new Promise(r => setTimeout(r, 450));
  if (token !== _tourRunToken) return;
  try { if (step.enter) step.enter(s); } catch (e) { console.warn('[tour] enter failed', e); }
  _tourRenderPanel(step, s);

  if (_tourTimer) clearInterval(_tourTimer);
  _tourSpotIdx = 0;
  _tourTimer = setInterval(() => _tourTick(step), 900);
  _tourTick(step);

  // 'auto' steps perform themselves after the visitor has a beat to read
  if (step.mode === 'auto') setTimeout(() => { try { step.auto(s); } catch (e) {} }, 1600);
}

function _tourTick(step) {
  const s = tourState();
  if (!s || TOUR_STEPS[s.i] !== step) return;
  // (re-)apply the highlight — view re-renders wipe it. Steps with a
  // `targets` array get a ROTATING spotlight (one element per tick).
  try {
    let t = null;
    if (step.targets && step.targets.length) {
      for (let k = 0; k < step.targets.length && !t; k++) {
        t = document.querySelector(step.targets[_tourSpotIdx % step.targets.length]);
        if (!t) _tourSpotIdx++;   // missing element (e.g. FAB hidden) — try the next
      }
      _tourSpotIdx++;
      if (t && t !== _tourHighlighted) { _tourClearHighlight(); t.classList.add('tour-spot'); _tourHighlighted = t; }
      // (no scrollIntoView for spotlights — the rotation shouldn't yank the page around)
    } else {
      t = step.target ? step.target(s) : null;
      if (typeof t === 'string') t = document.querySelector(t);
      if (t && t !== _tourHighlighted) { _tourClearHighlight(); t.classList.add('tour-spot'); t.scrollIntoView({ block: 'center', behavior: 'smooth' }); _tourHighlighted = t; }
      if (!t) _tourClearHighlight();
    }
  } catch (e) {}
  // auto-advance the moment the real-world effect is in the database
  try { if (step.done && step.done(s)) _tourAdvance(); } catch (e) {}
}

function _tourAdvance() {
  const s = tourState(); if (!s) return;
  if (_tourTimer) { clearInterval(_tourTimer); _tourTimer = null; }
  _tourClearHighlight();
  s.i += 1; tourSave(s);
  if (s.i >= TOUR_STEPS.length) { demoTourEnd(); return; }
  // run outside the tick's call stack (and its try/catch) so a throw inside
  // the next step can't be swallowed into a silent stall
  setTimeout(() => demoTourRunStep(), 0);
}

// Self-heal watchdog: the tour must never silently stall. If state says a tour
// is active but no step-loop is ticking (a runStep died mid-flight — e.g. an
// exception inside a view handler it triggered), re-enter the current step.
if (typeof window !== 'undefined' && typeof setInterval === 'function') {
  setInterval(() => {
    try { if (!_tourTimer && tourState() && tourIsDemoInstall()) demoTourRunStep(); } catch (e) {}
  }, 2500);
}

function _tourRenderPanel(step, s) {
  const ar = currentLanguage() === 'ar';
  let panel = document.getElementById('tour-panel');
  if (!panel) { panel = document.createElement('div'); panel.id = 'tour-panel'; document.body.appendChild(panel); }
  const dots = TOUR_STEPS.map((_, i) => `<span class="tour-dot${i === s.i ? ' active' : ''}"></span>`).join('');
  const roleBadge = `${ar ? step.role[3] : step.role[2]} · ${step.role[0]}`;
  panel.innerHTML = `
    <div class="tour-panel-role">🎬 ${roleBadge}</div>
    <div style="font-size:0.7rem;color:var(--text-secondary);margin:4px 0 2px">🔑 ${ar ? 'سجّلتُ دخولك بـ' : 'I logged you in with'} <code>${step.role[0]} / ${step.role[1]}</code> ${ar ? '(حسابات تجريبية)' : '(demo credentials)'}</div>
    <h3>${ar ? step.title.ar : step.title.en}</h3>
    <p>${ar ? step.body.ar : step.body.en}</p>
    <div class="tour-panel-dots">${dots}</div>
    <div class="tour-panel-btns">
      ${step.mode === 'click' ? `<button class="btn btn-sm btn-secondary" onclick="(function(){var st=tourState();var sp=TOUR_STEPS[st.i];try{sp.auto(st);}catch(e){}})()">${ar ? '🤖 افعلها عني' : '🤖 Do it for me'}</button>` : ''}
      ${step.mode === 'info' ? `<button class="btn btn-sm btn-primary" onclick="_tourAdvance()">${ar ? 'التالي ←' : 'Next →'}</button>` : ''}
      ${step.mode === 'final' ? `<button class="btn btn-sm btn-primary" onclick="demoTourEnd();switchToProduction()">${ar ? '🚀 جهّزه للتشغيل الفعلي' : '🚀 Set up for production'}</button>` : ''}
      <button class="btn btn-sm btn-secondary" onclick="demoTourEnd()">${ar ? 'إنهاء الجولة' : 'End tour'}</button>
    </div>`;
}
