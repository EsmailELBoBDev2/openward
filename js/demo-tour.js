// ============================================================
// GUIDED DEMO TOUR — "follow one patient through the hospital"
// ============================================================
// Demo installs only (never rendered in production or server mode — the
// entry points are gated in setupShowcaseLogin / the boot hook).
//
// The tour registers a REAL patient through the REAL forms and follows him
// across role logins: ER registration → a deliberately unsafe prescription
// the app REFUSES → the safe one → a stat blood panel + chest X-ray → the
// lab posting a LIFE-THREATENING potassium → the radiologist's report → the
// doctor meeting the red critical-lab banner and acknowledging it on the
// record → pharmacy verify/dispense → bedside MAR with two-identifier
// checks → the manager's tamper-evident audit trail. Every click runs the
// actual handlers — nothing is mocked.
//
// AUTOPLAY: the tour can also drive ITSELF (offer popup → "Sit back").
// Pacing follows interactive-demo research: dwell time derived from text
// length, a simulated cursor travels to each control before it fires, any
// real user click pauses playback (WCAG 2.2.2: pause must always be one
// tap away), and a hidden tab pauses rather than playing to nobody.
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
function tourMonaId() { const r = dbGet("SELECT user_id FROM users WHERE username = 'nurse.mona'"); return r ? r.user_id : null; }

// Fill the LYTE (Electrolytes) result modal: Na/K/Cl/CO2 components, with the
// potassium (component index 1) at a life-threatening 6.8 flagged critical_high.
function tourFillLyteModal() {
  const vals = ['138', '6.8', '101', '22'];
  const flags = ['normal', 'critical_high', 'normal', 'normal'];
  vals.forEach((v, i) => {
    const inp = document.querySelector(`.comp-val[data-idx="${i}"]`);
    const fl = document.querySelector(`.comp-flag[data-idx="${i}"]`);
    if (inp) inp.value = v;
    if (fl) fl.value = flags[i];
  });
}
function tourFillRadModal() {
  const f = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  f('rad-indication', 'Headache, dizziness — pre-admission workup');
  f('rad-technique', 'PA and lateral chest radiograph');
  f('rad-findings-detail', 'Lungs are clear. Cardiomediastinal silhouette within normal limits. No pleural effusion or pneumothorax.');
  f('rad-impression', 'No acute cardiopulmonary process.');
  f('rad-flag', 'normal');
}

// ---- the script: one step = one beat of the story ----
// step: { role:[user,pw,labelEn,labelAr], view, title:{en,ar}, body:{en,ar},
//         mode:'click'|'auto'|'info'|'final', enter(s), auto(s),
//         target(s) -> CSS selector|Element|null, targets:[...] (rotating
//         spotlight), done(s) -> bool }
const TOUR_STEPS = [
  { // THE LOGIN PAGE — the tour literally starts at the front door
    role: null, view: null, mode: 'info',
    ch: { en: '🚪 The door', ar: '🚪 الباب' },
    title: { en: 'Every story starts at this door', ar: 'كل قصة تبدأ من هذا الباب' },
    body: {
      en: 'This login page is the only entrance. In demo mode the spotlight shows you three things: the <strong>role picker</strong> (hop into any of 14 staff roles, no passwords to remember), the <strong>Patient Portal</strong> toggle (patients have a door too), and the <strong>production switch</strong> — one click wipes the demo and builds a real, zero-default-credential install.<br><br>Press <strong>Next</strong> and we’ll follow one patient through all of it.',
      ar: 'صفحة الدخول هذه هي المدخل الوحيد. في الوضع التجريبي تريك الإضاءة ثلاثة أشياء: <strong>قائمة الأدوار</strong> (ادخل بأي دور من ١٤ دوراً بلا كلمات مرور)، وزر <strong>بوابة المريض</strong> (للمرضى بابهم أيضاً)، و<strong>مفتاح التشغيل الفعلي</strong> — ضغطة واحدة تمسح التجربة وتبني نسخة حقيقية بلا حسابات افتراضية.<br><br>اضغط <strong>التالي</strong> لنتبع مريضاً واحداً عبر كل شيء.',
    },
    targets: ['#demo-persona', '#login-patient-btn', '#prod-setup-btn'],
    target() { return null; }, done() { return false; },
  },
  { // the ambulance calls ahead — triage pre-registers
    role: ['nurse.noura', 'nurse123', 'Triage Nurse', 'ممرضة الفرز'],
    view: 'tn-arrivals', mode: 'click',
    ch: { en: '🚑 Arrival', ar: '🚑 الوصول' },
    title: { en: 'The ambulance calls ahead', ar: 'الإسعاف يتصل مسبقاً' },
    body: {
      en: 'Triage nurse Noura takes the radio call: male, 61, headache and dizziness, 7 minutes out. I filled the pre-arrival board — severity, ETA, paramedic notes.<br><br>👉 <strong>Click “Add” to post it</strong> — the whole ER sees him coming before the doors open.',
      ar: 'ممرضة الفرز نورة تتلقى نداء اللاسلكي: ذكر، ٦١ عاماً، صداع ودوخة، يصل خلال ٧ دقائق. عبّأتُ لوحة ما قبل الوصول — الخطورة، وقت الوصول، ملاحظات المسعفين.<br><br>👉 <strong>اضغطي «إضافة»</strong> — كل قسم الطوارئ يراه قادماً قبل أن تُفتح الأبواب.',
    },
    enter() {
      setTimeout(() => {
        if (!document.querySelector('#tn-add-arrival form') && typeof showAddArrivalForm === 'function') showAddArrivalForm();
        setTimeout(() => {
          tourSet('ar-mode', 'ambulance'); tourSet('ar-sev', 'urgent'); tourSet('ar-eta', '7');
          tourSet('ar-label', TOUR_PATIENT.nameEn); tourSet('ar-age', '61'); tourSet('ar-gender', 'male');
          tourSet('ar-cc', TOUR_PATIENT.complaint); tourSet('ar-notes', 'BP 132/86, HR 88 en route');
        }, 300);
      }, 350);
    },
    auto() { const f = document.querySelector('#tn-add-arrival form'); if (f) f.requestSubmit(); },
    target() { return '#tn-add-arrival form button[type="submit"]'; },
    done(s) {
      const a = dbGet("SELECT arrival_id FROM incoming_arrivals WHERE patient_label = ? AND status = 'pending' ORDER BY arrival_id DESC LIMIT 1", [TOUR_PATIENT.nameEn]);
      if (!a) return false;
      s.arrivalId = a.arrival_id; tourSave(s); return true;
    },
  },
  { // the board hand-off
    role: ['nurse.noura', 'nurse123', 'Triage Nurse', 'ممرضة الفرز'],
    view: 'tn-arrivals', mode: 'info',
    ch: { en: '🚑 Arrival', ar: '🚑 الوصول' },
    title: { en: 'One tap when the doors open', ar: 'لمسة واحدة حين تُفتح الأبواب' },
    body: {
      en: 'There he is on the board, sorted by severity and ETA. When the ambulance pulls in, that green <strong>“Arrived → Register”</strong> button carries everything — name, complaint, paramedic notes, suggested triage level — straight into the registration form. Nothing retyped.<br><br>We’ll let <strong>Dr. Omar</strong> take it from here — press <strong>Next</strong>.',
      ar: 'ها هو على اللوحة، مرتباً بالخطورة ووقت الوصول. حين تصل سيارة الإسعاف، زر <strong>«وصل → تسجيل»</strong> الأخضر ينقل كل شيء — الاسم والشكوى وملاحظات المسعفين ومستوى الفرز المقترح — مباشرة إلى نموذج التسجيل. لا شيء يُكتب مرتين.<br><br>سنترك الأمر لـ<strong>د. عمر</strong> — اضغطي <strong>التالي</strong>.',
    },
    target(s) { return `[onclick*="convertArrivalToPatient(${s.arrivalId})"]`; },
    done() { return false; },
  },
  { // ER registration (the visitor presses the real Register button)
    role: ['dr.omar', 'doctor123', 'ER Doctor', 'طبيب الطوارئ'],
    view: 'er-register', mode: 'click',
    ch: { en: '🚑 Arrival', ar: '🚑 الوصول' },
    title: { en: 'A patient arrives at the ER', ar: 'مريض يصل إلى الطوارئ' },
    body: {
      en: 'I pre-filled the arrival form for <strong>Salem Al-Demo</strong> — note the documented <strong>Penicillin allergy</strong> and <strong>cardiac condition</strong>; they matter later. Admitting to Internal Medicine.<br><br>👉 <strong>Click the big “Register” button</strong> — then watch the app <em>review its own suggestions with you</em> (diet, complexity — derived from his conditions) and confirm them.',
      ar: 'عبّأتُ نموذج الوصول للمريض <strong>سالم التجريبي</strong> — لاحظ <strong>حساسية البنسلين</strong> الموثقة و<strong>المرض القلبي</strong>؛ سيهمّان لاحقاً. التنويم في الباطنة.<br><br>👉 <strong>اضغط زر «تسجيل» الكبير</strong> — ثم لاحظ كيف <em>يقترح النظام تلقائياً</em> (التغذية، درجة التعقيد) وأكّد الاقتراحات.',
    },
    enter(s) {
      tourSet('reg-name-ar', TOUR_PATIENT.nameAr); tourSet('reg-name-en', TOUR_PATIENT.nameEn);
      tourSet('reg-national-id', s.natId || TOUR_PATIENT.natId); tourSet('reg-dob', TOUR_PATIENT.dob);
      tourSet('reg-gender', 'male'); tourSet('reg-triage', '3');
      tourSet('reg-complaint', TOUR_PATIENT.complaint);
      tourSet('reg-bed', s.bed || 'B-300');
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
      const p = dbGet('SELECT p.patient_id, p.mrn, a.admission_id FROM patients p JOIN admissions a ON a.patient_id = p.patient_id WHERE p.national_id = ? ORDER BY a.admission_id DESC LIMIT 1', [s.natId || TOUR_PATIENT.natId]);
      if (!p) return false;
      s.patientId = p.patient_id; s.admissionId = p.admission_id; s.mrn = p.mrn; tourSave(s);
      return true;
    },
  },
  { // open the chart, meet the safety banner
    role: ['dr.omar', 'doctor123', 'ER Doctor', 'طبيب الطوارئ'],
    view: 'er-cases', mode: 'click',
    title: { en: 'Open Salem’s chart', ar: 'افتح ملف سالم' },
    body: {
      en: 'Salem is in the ER case list now.<br><br>👉 <strong>Click his “Details” button</strong> — and notice the red <strong>safety banner</strong>: the Penicillin allergy follows him to every screen, no one has to remember it.',
      ar: 'سالم الآن في قائمة حالات الطوارئ.<br><br>👉 <strong>اضغط زر «تفاصيل»</strong> — ولاحظ <strong>شريط الأمان</strong> الأحمر: حساسية البنسلين ترافقه في كل شاشة.',
    },
    auto(s) { if (typeof showPatientDetail === 'function') showPatientDetail(s.patientId, s.admissionId); },
    target(s) { return `[onclick*="showPatientDetail(${s.patientId},"]`; },
    done() { const m = document.getElementById('main-content'); return !!(m && /Penicillin/.test(m.innerHTML)); },
  },
  { // look around the ER: the features that are ALWAYS one tap away
    role: ['dr.omar', 'doctor123', 'ER Doctor', 'طبيب الطوارئ'],
    view: 'er-cases', mode: 'info',
    title: { en: 'Always within reach', ar: 'دائماً في المتناول' },
    body: {
      en: 'Watch the spotlight rotate — these live on <em>every</em> screen:<br>🚨 <strong>Code Blue</strong> — one tap summons the resus team with the patient context attached.<br>🧮 <strong>Clinical calculators</strong> — NEWS2, GCS, MELD, Wells… 18 of them, citation-pinned.<br>🔍 <strong>Global search</strong> — any patient by name or MRN from anywhere.',
      ar: 'تابع الإضاءة المتنقلة — هذه متوفرة في <em>كل</em> شاشة:<br>🚨 <strong>النداء الأزرق</strong> — لمسة واحدة تستدعي فريق الإنعاش مع سياق المريض.<br>🧮 <strong>الحاسبات السريرية</strong> — NEWS2 وGCS وMELD وغيرها، 18 حاسبة موثقة المراجع.<br>🔍 <strong>البحث الشامل</strong> — أي مريض بالاسم أو الرقم الطبي من أي مكان.',
    },
    targets: ['#code-blue-fab', '#calc-fab', '#global-search'],
    target() { return null; }, done() { return false; },
  },
  { // the consultant hands the case to a ward doctor — for real, through the UI
    role: ['dr.ahmed', 'doctor123', 'Consultant', 'استشاري الباطنة'],
    view: 'con-assign', mode: 'click',
    ch: { en: '🩺 The ward', ar: '🩺 الجناح' },
    title: { en: 'The consultant staffs the case', ar: 'الاستشاري يوزّع الحالة' },
    body: {
      en: 'Salem landed in Internal Medicine, so consultant Dr. Ahmed sees him in the <strong>unassigned cases</strong> list. I picked <strong>Dr. Sarah</strong> from his ward team.<br><br>👉 <strong>Click “Assign”</strong> — from this moment Salem appears in her patient list, her prescription pad, and her lab form.',
      ar: 'وصل سالم إلى الباطنة، فيراه الاستشاري د. أحمد في قائمة <strong>الحالات غير الموزعة</strong>. اخترتُ <strong>د. سارة</strong> من فريق جناحه.<br><br>👉 <strong>اضغط «إسناد»</strong> — من هذه اللحظة يظهر سالم في قائمتها ووصفاتها وطلبات فحوصاتها.',
    },
    enter(s) {
      setTimeout(() => {
        const doc = dbGet("SELECT user_id FROM users WHERE username = 'dr.sarah'");
        const sel = document.getElementById('assign-doc-' + s.admissionId);
        if (sel && doc) { sel.value = String(doc.user_id); sel.dispatchEvent(new Event('change', { bubbles: true })); }
      }, 350);
    },
    auto(s) {
      const doc = dbGet("SELECT user_id FROM users WHERE username = 'dr.sarah'");
      const sel = document.getElementById('assign-doc-' + s.admissionId);
      if (sel && doc && !sel.value) sel.value = String(doc.user_id);
      if (typeof handleAssignCase === 'function') handleAssignCase(s.admissionId, s.patientId);
    },
    target(s) { return `[onclick*="handleAssignCase(${s.admissionId},"]`; },
    done(s) {
      const doc = dbGet("SELECT user_id FROM users WHERE username = 'dr.sarah'");
      return !!(doc && dbGet('SELECT id FROM case_assignments WHERE admission_id = ? AND doctor_id = ?', [s.admissionId, doc.user_id]));
    },
  },
  { // the unsafe order (the app must refuse)
    role: ['dr.sarah', 'doctor123', 'Ward Doctor', 'طبيبة الجناح'],
    view: 'doc-rx', mode: 'click',
    ch: { en: '🩺 The ward', ar: '🩺 الجناح' },
    title: { en: 'Try to prescribe the WRONG drug', ar: 'جرّب وصف الدواء الخاطئ' },
    body: {
      en: 'You are Dr. Sarah on the ward now (the tour assigned Salem to her). I selected <strong>Amoxicillin</strong> — a penicillin-class drug for a patient with a <strong>documented penicillin allergy</strong>.<br><br>👉 <strong>Click “Prescribe”.</strong> The app should stop you. That is the point.',
      ar: 'أنت الآن د. سارة في الجناح (الجولة أسندت سالم إليها). اخترتُ <strong>أموكسيسيلين</strong> — من فئة البنسلين لمريض لديه <strong>حساسية بنسلين موثقة</strong>.<br><br>👉 <strong>اضغط «وصف الدواء».</strong> يجب أن يوقفك النظام — وهذا هو المطلوب.',
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
  { // read the refusal, take the way out
    role: ['dr.sarah', 'doctor123', 'Ward Doctor', 'طبيبة الجناح'],
    view: 'doc-rx', mode: 'click',
    ch: { en: '🩺 The ward', ar: '🩺 الجناح' },
    title: { en: 'The app said no', ar: 'النظام رفض' },
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
  { // the safe order goes through (watch me)
    role: ['dr.sarah', 'doctor123', 'Ward Doctor', 'طبيبة الجناح'],
    view: 'doc-rx', mode: 'auto',
    ch: { en: '🩺 The ward', ar: '🩺 الجناح' },
    title: { en: 'Order the right drug', ar: 'وصف الدواء الصحيح' },
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
  { // NEW — order the workup: stat bloods + a chest X-ray, one submit
    role: ['dr.sarah', 'doctor123', 'Ward Doctor', 'طبيبة الجناح'],
    view: 'doc-labs', mode: 'click',
    ch: { en: '🩺 The ward', ar: '🩺 الجناح' },
    title: { en: 'Order the workup — bloods + X-ray', ar: 'اطلب الفحوصات — دم وأشعة' },
    body: {
      en: 'Headache and dizziness in a cardiac patient deserve a workup. I queued a <strong>stat Electrolytes panel</strong> (Na, K, Cl, CO₂) and a <strong>Chest X-ray (أشعة)</strong> — one form, one click, and each lands in the right department’s queue.<br><br>👉 <strong>Click “Order”.</strong>',
      ar: 'صداع ودوخة عند مريض قلبي يستحقان فحوصات. جهّزتُ <strong>أملاح الدم العاجلة</strong> (صوديوم، بوتاسيوم، كلور) و<strong>أشعة سينية للصدر</strong> — نموذج واحد، ضغطة واحدة، وكلٌّ يصل إلى طابور قسمه.<br><br>👉 <strong>اضغط «طلب».</strong>',
    },
    enter(s) {
      setTimeout(() => {
        if (typeof _selectedLabTests !== 'undefined') _selectedLabTests.length = 0;   // defensively clear stale picks
        tourSet('lab-patient', String(s.admissionId));
        if (typeof addSuggestedLab === 'function') { addSuggestedLab('LYTE'); addSuggestedLab('CXR'); }
        tourSet('lab-priority', 'stat');
      }, 350);
    },
    auto() { const f = document.querySelector('form[onsubmit="handleOrderLab(event)"]'); if (f) f.requestSubmit(); },
    target() { return 'form[onsubmit="handleOrderLab(event)"] button[type="submit"]'; },
    done(s) {
      const lyte = dbGet("SELECT order_id FROM lab_orders WHERE admission_id = ? AND test_code = 'LYTE' ORDER BY order_id DESC LIMIT 1", [s.admissionId]);
      const cxr = dbGet("SELECT order_id FROM lab_orders WHERE admission_id = ? AND test_code = 'CXR' ORDER BY order_id DESC LIMIT 1", [s.admissionId]);
      if (!lyte || !cxr) return false;
      s.lyteId = lyte.order_id; s.cxrId = cxr.order_id; tourSave(s); return true;
    },
  },
  { // the doctor also writes the diet order (cardiac patient ≠ regular tray)
    role: ['dr.sarah', 'doctor123', 'Ward Doctor', 'طبيبة الجناح'],
    view: 'doc-patients', mode: 'click',
    ch: { en: '🩺 The ward', ar: '🩺 الجناح' },
    title: { en: 'Feed the heart right', ar: 'غذاء يناسب القلب' },
    body: {
      en: 'Treatment isn’t only pills. Salem is a cardiac patient, so I opened his chart and picked a <strong>Cardiac diet</strong> (the form even suggests it from his diagnosis).<br><br>👉 <strong>Click “Order Diet”</strong> — the kitchen and the dietitian see it instantly.',
      ar: 'العلاج ليس حبوباً فقط. سالم مريض قلب، لذا فتحتُ ملفه واخترتُ <strong>حمية قلبية</strong> (النموذج يقترحها من تشخيصه).<br><br>👉 <strong>اضغط «طلب الحمية»</strong> — المطبخ وأخصائية التغذية يريانها فوراً.',
    },
    enter(s) {
      setTimeout(() => {
        if (typeof showPatientDetail === 'function') showPatientDetail(s.patientId, s.admissionId);
        setTimeout(() => {
          const btn = document.querySelector(`[onclick*="showDietOrderForm(${s.patientId},"]`);
          if (btn) btn.click();
          setTimeout(() => {
            const sel = document.querySelector('#doc-action-form select[name="diet_type"]');
            if (sel) { sel.value = 'Cardiac'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
          }, 300);
        }, 400);
      }, 350);
    },
    auto(s) {
      const f = document.querySelector('#doc-action-form form');
      if (f) {
        const sel = f.querySelector('select[name="diet_type"]');
        if (sel && sel.value !== 'Cardiac') sel.value = 'Cardiac';
        f.requestSubmit(); return;
      }
      const btn = document.querySelector(`[onclick*="showDietOrderForm(${s.patientId},"]`);
      if (btn) btn.click();
      else if (typeof showPatientDetail === 'function') showPatientDetail(s.patientId, s.admissionId);
    },
    target(s) {
      const f = document.querySelector('#doc-action-form form');
      if (f) return f.querySelector('button[type="submit"]');
      return document.querySelector(`[onclick*="showDietOrderForm(${s.patientId},"]`) || `[onclick*="showPatientDetail(${s.patientId},"]`;
    },
    done(s) {
      const o = dbGet("SELECT order_id FROM diet_orders WHERE admission_id = ? AND status = 'active' AND diet_type = 'Cardiac' ORDER BY order_id DESC LIMIT 1", [s.admissionId]);
      if (!o) return false;
      s.dietOrderId = o.order_id; tourSave(s); return true;
    },
  },
  { // the senior nurse staffs Salem's bedside care
    role: ['nurse.fatima', 'nurse123', 'Senior Nurse', 'الممرضة الأولى'],
    view: 'sn-assign', mode: 'click',
    ch: { en: '🩺 The ward', ar: '🩺 الجناح' },
    title: { en: 'Every patient gets a named nurse', ar: 'لكل مريض ممرضة مسؤولة' },
    body: {
      en: 'Senior nurse Fatima runs the shift board. Salem shows up as <strong>unassigned</strong>; I picked <strong>nurse Mona</strong> for the morning shift.<br><br>👉 <strong>Click “Assign”</strong> — Salem now appears on Mona’s personal worklist, with her “what needs me now” widget watching his results.',
      ar: 'الممرضة الأولى فاطمة تدير لوحة الوردية. يظهر سالم <strong>غير مُسنَد</strong>؛ اخترتُ <strong>الممرضة منى</strong> لوردية الصباح.<br><br>👉 <strong>اضغطي «إسناد»</strong> — يظهر سالم الآن في قائمة منى الشخصية، وأداة «ما يحتاجني الآن» تراقب نتائجه.',
    },
    enter(s) {
      setTimeout(() => {
        const mona = tourMonaId();
        const sel = document.getElementById('nassign-' + s.admissionId);
        if (sel && mona) { sel.value = String(mona); sel.dispatchEvent(new Event('change', { bubbles: true })); }
      }, 350);
    },
    auto(s) {
      const mona = tourMonaId();
      const sel = document.getElementById('nassign-' + s.admissionId);
      if (sel && mona && !sel.value) sel.value = String(mona);
      if (typeof handleAssignNurse === 'function') handleAssignNurse(s.admissionId, s.patientId);
      // junior-nurse/high-complexity warning modal: take the safe "action taken" path
      setTimeout(() => { const ok = document.getElementById('rd-accept-btn'); if (ok) ok.click(); }, 400);
    },
    target(s) {
      const ok = document.getElementById('rd-accept-btn');
      if (ok) return ok;
      const sel = document.getElementById('nassign-' + s.admissionId);
      return sel ? sel.closest('tr').querySelector('button.btn-primary') : null;
    },
    done(s) { return !!dbGet("SELECT assignment_id FROM nurse_assignments WHERE admission_id = ? AND shift_date = date('now')", [s.admissionId]); },
  },
  { // the lab receives the specimen
    role: ['lab.nasser', 'lab123', 'Lab Technician', 'تقني المختبر'],
    view: 'lt-pending', mode: 'click',
    ch: { en: '🧪 Lab & imaging', ar: '🧪 المختبر والأشعة' },
    title: { en: 'The specimen reaches the lab', ar: 'العينة تصل المختبر' },
    body: {
      en: 'You are the lab now. Salem’s nurse already drew the blood (status: <em>collected</em>) — the lab logs it in before anything gets measured, so a lost tube is impossible to miss.<br><br>👉 <strong>Click “Mark Received”</strong> on Salem’s stat Electrolytes.',
      ar: 'أنت المختبر الآن. ممرضة سالم سحبت العينة بالفعل (الحالة: <em>مسحوبة</em>) — والمختبر يسجّل استلامها قبل أي قياس، فلا تضيع أنبوبة دون أن يُلاحظ.<br><br>👉 <strong>اضغط «تأكيد الاستلام»</strong> على عينة سالم العاجلة.',
    },
    enter(s) {
      // the ward nurse drew the sample — stage the 'collected' hop (narrated above)
      const o = dbGet('SELECT status FROM lab_orders WHERE order_id = ?', [s.lyteId]);
      if (o && o.status === 'ordered') {
        dbRun("UPDATE lab_orders SET status = 'collected', collected_by = ?, collected_at = ? WHERE order_id = ?", [tourMonaId(), nowISO(), s.lyteId]);
        saveDBToIndexedDB();
        navigateTo('lt-pending');
      }
    },
    auto(s) { if (typeof handleLabReceive === 'function') handleLabReceive(s.lyteId); },
    target(s) { return `[onclick*="handleLabReceive(${s.lyteId})"]`; },
    done(s) { const o = dbGet('SELECT status FROM lab_orders WHERE order_id = ?', [s.lyteId]); return !!(o && (o.status === 'received' || o.status === 'resulted')); },
  },
  { // NEW — enter the result: a life-threatening potassium
    role: ['lab.nasser', 'lab123', 'Lab Technician', 'تقني المختبر'],
    view: 'lt-pending', mode: 'click',
    ch: { en: '🧪 Lab & imaging', ar: '🧪 المختبر والأشعة' },
    title: { en: 'A dangerous number — potassium 6.8', ar: 'رقم خطير — بوتاسيوم ٦٫٨' },
    body: {
      en: 'I opened the result panel and typed the values: sodium and chloride normal — but <strong>potassium 6.8 mEq/L</strong> (normal 3.5–5.1), flagged <strong>critical high</strong>. That level can stop a heart.<br><br>👉 <strong>Click “Save”</strong> and watch the system take it from here.',
      ar: 'فتحتُ نافذة النتائج وأدخلت القيم: الصوديوم والكلور طبيعيان — لكن <strong>البوتاسيوم 6.8</strong> (الطبيعي 3.5–5.1) بعلامة <strong>حرج مرتفع</strong>. هذا المستوى قد يوقف القلب.<br><br>👉 <strong>اضغط «حفظ»</strong> وشاهد النظام يتولى الأمر.',
    },
    enter(s) {
      setTimeout(() => {
        if (!document.getElementById('lr-submit-btn') && typeof showLabResultForm === 'function') showLabResultForm(s.lyteId);
        setTimeout(tourFillLyteModal, 350);
      }, 400);
    },
    auto(s) {
      const save = document.getElementById('lr-submit-btn');
      if (save) { tourFillLyteModal(); save.click(); return; }
      if (typeof showLabResultForm === 'function') { showLabResultForm(s.lyteId); setTimeout(() => { tourFillLyteModal(); }, 350); }
    },
    target(s) { return document.getElementById('lr-submit-btn') || `[onclick*="showLabResultForm(${s.lyteId})"]`; },
    done(s) { const o = dbGet('SELECT status, is_critical FROM lab_orders WHERE order_id = ?', [s.lyteId]); return !!(o && o.status === 'resulted' && o.is_critical === 1); },
  },
  { // NEW — the radiologist reads the X-ray
    role: ['rad.mohammed', 'rad123', 'Radiologist', 'أخصائي الأشعة'],
    view: 'rad-pending', mode: 'click',
    ch: { en: '🧪 Lab & imaging', ar: '🧪 المختبر والأشعة' },
    title: { en: 'Reading the X-ray', ar: 'قراءة الأشعة' },
    body: {
      en: 'You are the radiologist. Salem’s chest film is in the worklist (stat orders jump the queue). I drafted the report — clear lungs, no acute process.<br><br>👉 <strong>Click “Save”</strong> to file it. The ordering doctor sees the report the moment it’s in.',
      ar: 'أنت أخصائي الأشعة. صورة صدر سالم في قائمة العمل (الطلبات العاجلة تتقدم الطابور). كتبتُ التقرير — رئتان سليمتان، لا علّة حادة.<br><br>👉 <strong>اضغط «حفظ»</strong> لاعتماده. الطبيب يرى التقرير فور حفظه.',
    },
    enter(s) {
      setTimeout(() => {
        if (!document.getElementById('rad-submit') && typeof showRadResultForm === 'function') showRadResultForm(s.cxrId);
        setTimeout(tourFillRadModal, 350);
      }, 400);
    },
    auto(s) {
      const save = document.getElementById('rad-submit');
      if (save) { tourFillRadModal(); save.click(); return; }
      if (typeof showRadResultForm === 'function') { showRadResultForm(s.cxrId); setTimeout(tourFillRadModal, 350); }
    },
    target(s) { return document.getElementById('rad-submit') || `[onclick*="showRadResultForm(${s.cxrId})"]`; },
    done(s) { const o = dbGet('SELECT status FROM lab_orders WHERE order_id = ?', [s.cxrId]); return !!(o && o.status === 'resulted'); },
  },
  { // NEW — the red flag finds the doctor
    role: ['dr.sarah', 'doctor123', 'Ward Doctor', 'طبيبة الجناح'],
    view: 'doc-patients', mode: 'click',
    ch: { en: '🚨 The catch', ar: '🚨 الإنذار' },
    title: { en: 'The red flag finds the doctor', ar: 'العلامة الحمراء تصل الطبيبة' },
    body: {
      en: 'Dr. Sarah is back. That potassium is on Salem’s chart now — flagged, pulsing, impossible to scroll past.<br><br>👉 <strong>Open Salem’s “Details”</strong>: a red <strong>CRITICAL LAB</strong> banner is waiting at the top (and his nurse sees a 🚨 flag on her list too — the X-ray report is filed right below it).',
      ar: 'عادت د. سارة. ذلك البوتاسيوم الآن على ملف سالم — مُعلَّم، نابض، يستحيل تجاوزه.<br><br>👉 <strong>افتح «تفاصيل» سالم</strong>: شريط <strong>فحص حرج</strong> أحمر بانتظارك أعلى الملف (وممرضته ترى علامة 🚨 في قائمتها أيضاً — وتقرير الأشعة محفوظ تحته).',
    },
    auto(s) { if (typeof showPatientDetail === 'function') showPatientDetail(s.patientId, s.admissionId); },
    target(s) { return document.getElementById(`critical-banner-${s.admissionId}`) || `[onclick*="showPatientDetail(${s.patientId},"]`; },
    done(s) { return !!document.getElementById(`critical-banner-${s.admissionId}`); },
  },
  { // NEW — acknowledge it, on the record
    role: ['dr.sarah', 'doctor123', 'Ward Doctor', 'طبيبة الجناح'],
    view: 'doc-patients', mode: 'click',
    ch: { en: '🚨 The catch', ar: '🚨 الإنذار' },
    title: { en: 'Acknowledge it — on the record', ar: 'أقرّ بها — في السجل' },
    body: {
      en: 'Critical results demand a named human response. <strong>Click “Acknowledge This Result”</strong> — a comment is <em>required</em> (I drafted one: repeat sample, start the hyperkalemia protocol), and the acknowledgement is written to the permanent audit chain with your name on it.',
      ar: 'النتائج الحرجة تتطلب رداً بشرياً مسمّى. <strong>اضغط «الإقرار بهذه النتيجة»</strong> — التعليق <em>إلزامي</em> (كتبتُ واحداً: إعادة العينة وبدء بروتوكول فرط البوتاسيوم)، ويُسجَّل الإقرار في سلسلة التدقيق الدائمة باسمك.',
    },
    enter() { /* the banner is already on screen from the previous beat */ },
    auto(s) {
      const confirmBtn = document.getElementById('ack-confirm-btn');
      if (confirmBtn) {
        const c = document.getElementById('ack-comment');
        if (c && !c.value) c.value = 'Reviewed. Repeating sample to exclude hemolysis; starting hyperkalemia protocol (ECG, calcium gluconate, insulin/dextrose).';
        confirmBtn.click(); return;
      }
      const ackBtn = document.querySelector(`[onclick*="showCriticalAckModal(${s.lyteId},"]`);
      if (ackBtn) ackBtn.click();
      else if (typeof showPatientDetail === 'function') showPatientDetail(s.patientId, s.admissionId);
    },
    target(s) {
      const confirmBtn = document.getElementById('ack-confirm-btn');
      if (confirmBtn) {
        const c = document.getElementById('ack-comment');
        if (c && !c.value) c.value = 'Reviewed. Repeating sample to exclude hemolysis; starting hyperkalemia protocol (ECG, calcium gluconate, insulin/dextrose).';
        return confirmBtn;
      }
      return `[onclick*="showCriticalAckModal(${s.lyteId},"]`;
    },
    done(s) { return !!dbGet('SELECT ack_id FROM lab_critical_acks WHERE order_id = ?', [s.lyteId]); },
  },
  { // pharmacist verifies
    role: ['pharm.ali', 'pharm123', 'Pharmacist', 'الصيدلاني'],
    view: 'ph-queue', mode: 'click',
    ch: { en: '💊 Pharmacy', ar: '💊 الصيدلية' },
    title: { en: 'Pharmacy is the second pair of eyes', ar: 'الصيدلية عين ثانية' },
    body: {
      en: 'You are the pharmacist now — and there is Salem’s Paracetamol, waiting. Pharmacy re-runs the allergy check independently before anything reaches a nurse.<br><br>👉 <strong>Click “✓ Verify”</strong> on Salem’s order.',
      ar: 'أنت الصيدلاني الآن — وهذه وصفة سالم بانتظارك. الصيدلية تعيد فحص الحساسية باستقلالية قبل أن يصل أي دواء للتمريض.<br><br>👉 <strong>اضغط «تحقق»</strong> على وصفة سالم.',
    },
    auto(s) { if (typeof handleVerifyRx === 'function') handleVerifyRx(s.rxId); },
    target(s) { return `[onclick*="handleVerifyRx(${s.rxId})"]`; },
    done(s) { const rx = dbGet('SELECT verified_at FROM prescriptions WHERE rx_id = ?', [s.rxId]); return !!(rx && rx.verified_at); },
  },
  { // dispense (stock-guarded)
    role: ['pharm.ali', 'pharm123', 'Pharmacist', 'الصيدلاني'],
    view: 'ph-queue', mode: 'click',
    ch: { en: '💊 Pharmacy', ar: '💊 الصيدلية' },
    title: { en: 'Dispense it', ar: 'صرف الدواء' },
    body: {
      en: 'Verified → now dispense. Dispensing atomically claims the order and deducts stock — two pharmacists can’t double-dispense the same order even by clicking at the same instant.<br><br>👉 <strong>Click “Dispense”.</strong>',
      ar: 'تم التحقق → الآن الصرف. الصرف يحجز الوصفة ويخصم المخزون بعملية واحدة — لا يمكن لصيدليين صرف نفس الوصفة مرتين حتى لو ضغطا معاً.<br><br>👉 <strong>اضغط «صرف».</strong>',
    },
    auto(s) { if (typeof handleDispense === 'function') handleDispense(s.rxId); },
    target(s) { return `[onclick*="handleDispense(${s.rxId})"]`; },
    done(s) { const rx = dbGet("SELECT status FROM prescriptions WHERE rx_id = ?", [s.rxId]); return !!(rx && rx.status === 'dispensed'); },
  },
  { // look around the pharmacy
    role: ['pharm.ali', 'pharm123', 'Pharmacist', 'الصيدلاني'],
    view: 'ph-queue', mode: 'info',
    ch: { en: '💊 Pharmacy', ar: '💊 الصيدلية' },
    title: { en: 'More in the pharmacy', ar: 'المزيد في الصيدلية' },
    body: {
      en: 'The spotlight is rotating through the rest of the pharmacist\'s world: 📦 <strong>live inventory</strong> with low-stock thresholds, 📥 <strong>receive stock</strong>, and the 📜 <strong>dispense log</strong> — every pill accounted for.<br><br>Press <strong>Next</strong> to follow Salem\'s dose to the ward.',
      ar: 'الإضاءة تتنقل عبر بقية عالم الصيدلاني: 📦 <strong>مخزون حيّ</strong> مع حدود النقص، 📥 <strong>استلام مخزون</strong>، و📜 <strong>سجل الصرف</strong> — كل حبة محسوبة.<br><br>اضغط <strong>التالي</strong> لمتابعة جرعة سالم إلى الجناح.',
    },
    targets: ['.nav-btn[data-view="ph-inventory"]', '.nav-btn[data-view="ph-receive"]', '.nav-btn[data-view="ph-log"]'],
    target() { return null; }, done() { return false; },
  },
  { // Mona's landing list — the assignment did something real
    role: ['nurse.mona', 'nurse123', 'Ward Nurse', 'ممرضة الجناح'],
    view: 'nr-patients', mode: 'info',
    ch: { en: '🛏️ Bedside', ar: '🛏️ بجانب السرير' },
    title: { en: 'Mona’s shift list knows him already', ar: 'قائمة منى تعرفه بالفعل' },
    body: {
      en: 'This is nurse Mona’s own landing page. Salem is on it <em>because Fatima assigned him</em> — and look at the <strong>“What needs your attention”</strong> widget: his unacknowledged-then-acked critical lab put him at the top, and his row carries the 🚨 flag. Nobody had to brief her.<br><br>Press <strong>Next</strong> to give his dose.',
      ar: 'هذه صفحة الممرضة منى. سالم فيها <em>لأن فاطمة أسندته إليها</em> — وانظري إلى أداة <strong>«ما يحتاج انتباهك»</strong>: فحصه الحرج وضعه في الصدارة، وصفّه يحمل علامة 🚨. لم يحتج أحد لإطلاعها.<br><br>اضغطي <strong>التالي</strong> لإعطاء جرعته.',
    },
    target(s) { return `[onclick*="showNurseActions(${s.admissionId},"]`; },
    done() { return false; },
  },
  { // nurse charts it on the MAR (two identifiers!)
    role: ['nurse.mona', 'nurse123', 'Ward Nurse', 'ممرضة الجناح'],
    view: 'nr-mar', mode: 'click',
    ch: { en: '🛏️ Bedside', ar: '🛏️ بجانب السرير' },
    title: { en: 'Give the dose — to the RIGHT patient', ar: 'إعطاء الجرعة — للمريض الصحيح' },
    body: {
      en: 'You are Salem’s nurse (her landing list flags his 🚨 critical lab too). Open the charting dialog and look at the top: <strong>name + MRN + date of birth</strong> — two-identifier verification against the wristband (room numbers don’t count). Mark it <em>Given</em> and save.<br><br>👉 <strong>Click “Log” on Salem’s Paracetamol, then Save.</strong>',
      ar: 'أنتِ ممرضة سالم (قائمتها تُظهر علامة 🚨 لفحصه الحرج أيضاً). افتحي نافذة التوثيق وانظري أعلاها: <strong>الاسم + الرقم الطبي + تاريخ الميلاد</strong> — تحقق بمعرّفين مقابل سوار المعصم. اختاري <em>أُعطي</em> واحفظي.<br><br>👉 <strong>اضغطي «إعطاء» على باراسيتامول سالم ثم احفظي.</strong>',
    },
    auto(s) {
      if (document.getElementById('mar-save-btn')) { document.getElementById('mar-save-btn').click(); return; }
      const btn = document.querySelector(`[onclick*="showMARLogForm(${s.rxId},"]`); if (btn) btn.click();
      setTimeout(() => { const sv = document.getElementById('mar-save-btn'); if (sv) sv.click(); }, 700);
    },
    target(s) { return document.getElementById('mar-save-btn') || `[onclick*="showMARLogForm(${s.rxId},"]`; },
    done(s) { return !!dbGet("SELECT mar_id FROM med_admin_records WHERE prescription_id = ? AND status = 'given' LIMIT 1", [s.rxId]); },
  },
  { // look around the nurse's world
    role: ['nurse.mona', 'nurse123', 'Ward Nurse', 'ممرضة الجناح'],
    view: 'nr-mar', mode: 'info',
    ch: { en: '🛏️ Bedside', ar: '🛏️ بجانب السرير' },
    title: { en: 'A nurse\'s shift, organized', ar: 'وردية الممرضة، منظمة' },
    body: {
      en: 'Beyond the MAR, the spotlight shows the nurse\'s other tools: ✅ <strong>prioritized tasks</strong> (a "what needs me now" list — unacked critical labs come first), 💧 <strong>fluids I/O balance</strong>, 📋 <strong>assessments</strong> (Morse falls, Braden, pain) — and the 🧮 calculators are right there too.<br><br><strong>Next</strong>: the view from the top.',
      ar: 'إلى جانب سجل الإعطاء، تعرض الإضاءة بقية أدوات الممرضة: ✅ <strong>مهام مرتّبة بالأولوية</strong> (الفحوصات الحرجة غير المُقرّة أولاً)، 💧 <strong>ميزان السوائل</strong>، 📋 <strong>التقييمات</strong> — والحاسبات 🧮 في المتناول أيضاً.<br><br><strong>التالي</strong>: المشهد من الأعلى.',
    },
    targets: ['.nav-btn[data-view="nr-tasks"]', '.nav-btn[data-view="nr-fluids"]', '.nav-btn[data-view="nr-assessments"]', '#calc-fab'],
    target() { return null; }, done() { return false; },
  },
  { // the dietitian logs how Salem actually ate
    role: ['diet.amira', 'diet123', 'Dietitian', 'أخصائية التغذية'],
    view: 'dt-meals', mode: 'click',
    ch: { en: '🥗 Allied care', ar: '🥗 الرعاية المساندة' },
    title: { en: 'The cardiac tray, accounted for', ar: 'وجبة القلب، محسوبة' },
    body: {
      en: 'Dietitian Amira sees Dr. Sarah’s <strong>Cardiac diet order</strong> in her worklist. Lunch went out — I filled the meal log (what was served, how much he ate).<br><br>👉 <strong>Click “Log Meal”</strong> — intake percentages feed nutrition assessments and flag patients who stop eating.',
      ar: 'أخصائية التغذية أميرة ترى <strong>حمية القلب</strong> التي طلبتها د. سارة في قائمتها. خرجت وجبة الغداء — عبّأتُ سجل الوجبة (ماذا قُدّم وكم أكل).<br><br>👉 <strong>اضغطي «تسجيل وجبة»</strong> — نسب التناول تغذي تقييمات التغذية وتكشف من توقف عن الأكل.',
    },
    enter(s) {
      setTimeout(() => {
        if (!document.querySelector('#meal-form-area form') && typeof showMealLogForm === 'function') showMealLogForm(s.dietOrderId, s.admissionId);
        setTimeout(() => {
          const f = document.querySelector('#meal-form-area form');
          if (f) {
            const items = f.querySelector('textarea[name="items_served"]');
            if (items && !items.value) items.value = 'Low-sodium grilled chicken, brown rice, steamed vegetables, fruit';
            const mt = f.querySelector('select[name="meal_type"]'); if (mt) mt.value = 'lunch';
          }
        }, 300);
      }, 350);
    },
    auto(s) {
      const f = document.querySelector('#meal-form-area form');
      if (f) {
        const items = f.querySelector('textarea[name="items_served"]');
        if (items && !items.value) items.value = 'Low-sodium grilled chicken, brown rice, steamed vegetables, fruit';
        f.requestSubmit(); return;
      }
      if (typeof showMealLogForm === 'function') showMealLogForm(s.dietOrderId, s.admissionId);
    },
    target(s) {
      const f = document.querySelector('#meal-form-area form');
      if (f) return f.querySelector('button[type="submit"]');
      return `[onclick*="showMealLogForm(${s.dietOrderId},"]`;
    },
    done(s) { return !!dbGet('SELECT log_id FROM meal_log WHERE diet_order_id = ? ORDER BY log_id DESC LIMIT 1', [s.dietOrderId]); },
  },
  { // the social worker opens discharge planning
    role: ['sw.hessa', 'social123', 'Social Worker', 'الأخصائية الاجتماعية'],
    view: 'sw-new', mode: 'click',
    ch: { en: '🥗 Allied care', ar: '🥗 الرعاية المساندة' },
    title: { en: 'Discharge starts on day one', ar: 'التخطيط للخروج يبدأ من اليوم الأول' },
    body: {
      en: 'Social worker Hessa opens a case the day Salem is admitted — home situation, support system, insurance — so discharge day never becomes a scramble.<br><br>👉 <strong>Click “Create Case”</strong>. It lands on her caseload board with a risk level and a paper trail.',
      ar: 'الأخصائية الاجتماعية حصة تفتح ملفاً يوم دخول سالم — وضع السكن، الدعم الأسري، التأمين — حتى لا يتحول يوم الخروج إلى ارتباك.<br><br>👉 <strong>اضغطي «إنشاء حالة»</strong>. تظهر على لوحة حالاتها بمستوى خطورة ومسار موثق.',
    },
    enter(s) {
      setTimeout(() => {
        const f = document.querySelector('form[onsubmit="handleCreateSWCase(event)"]');
        if (!f) return;
        const adm = f.querySelector('select[name="admission_id"]');
        if (adm) { adm.value = String(s.admissionId); adm.dispatchEvent(new Event('change', { bubbles: true })); }
        const psy = f.querySelector('textarea[name="psychosocial_assessment"]');
        if (psy && !psy.value) psy.value = 'Lives alone; daughter nearby visits weekly. Independent in daily activities before admission. Needs medication-routine education and a follow-up plan before discharge.';
        const risk = f.querySelector('select[name="risk_level"]'); if (risk) risk.value = 'medium';
        const liv = f.querySelector('select[name="living_situation"]'); if (liv && liv.options.length) liv.selectedIndex = Math.min(1, liv.options.length - 1);
      }, 400);
    },
    auto() { const f = document.querySelector('form[onsubmit="handleCreateSWCase(event)"]'); if (f) f.requestSubmit(); },
    target() { const f = document.querySelector('form[onsubmit="handleCreateSWCase(event)"]'); return f ? f.querySelector('button[type="submit"]') : null; },
    done(s) {
      const c = dbGet("SELECT case_id FROM social_work_cases WHERE admission_id = ? ORDER BY case_id DESC LIMIT 1", [s.admissionId]);
      if (!c) return false;
      s.swCaseId = c.case_id; tourSave(s); return true;
    },
  },
  { // the front desk books the follow-up — linked by national ID
    role: ['reception.sara', 'recept123', 'Receptionist', 'موظفة الاستقبال'],
    view: 'rcp-appointments', mode: 'click',
    ch: { en: '🗂️ Front desk', ar: '🗂️ الاستقبال' },
    title: { en: 'Book the follow-up before he leaves', ar: 'احجزي المراجعة قبل خروجه' },
    body: {
      en: 'Reception books Salem a cardiology follow-up for next week. I typed his <strong>national ID</strong> — watch the appointment link itself to his chart automatically (his MRN attaches; it shows up in his patient portal too).<br><br>👉 <strong>Click “Add”.</strong>',
      ar: 'الاستقبال يحجز لسالم مراجعة قلبية الأسبوع القادم. أدخلتُ <strong>رقم هويته</strong> — لاحظي كيف يرتبط الموعد بملفه تلقائياً (رقمه الطبي يلتصق به؛ ويظهر في بوابة المريض أيضاً).<br><br>👉 <strong>اضغطي «إضافة».</strong>',
    },
    enter(s) {
      setTimeout(() => {
        if (!document.querySelector('#appt-form-container form') && typeof showApptForm === 'function') showApptForm();
        setTimeout(() => {
          tourSet('appt-name-ar', TOUR_PATIENT.nameAr); tourSet('appt-name-en', TOUR_PATIENT.nameEn);
          tourSet('appt-nid', s.natId || TOUR_PATIENT.natId);
          tourPickOption('appt-dept', 'internal'); tourPickOption('appt-doctor', 'sarah');
          const d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
          tourSet('appt-date', d); tourSet('appt-time', '10:00');
          tourSet('appt-reason', 'Cardiology follow-up — post hyperkalemia');
        }, 300);
      }, 350);
    },
    auto() { const f = document.querySelector('#appt-form-container form'); if (f) f.requestSubmit(); },
    target() {
      const f = document.querySelector('#appt-form-container form');
      if (f) return f.querySelector('button[type="submit"]');
      return 'button[onclick="showApptForm()"]';
    },
    done(s) { return !!dbGet("SELECT appt_id FROM appointments WHERE national_id = ? AND status = 'scheduled' ORDER BY appt_id DESC LIMIT 1", [s.natId || TOUR_PATIENT.natId]); },
  },
  { // the manager sees everything in the audit trail
    role: ['manager', 'manager123', 'Hospital Manager', 'مدير المستشفى'],
    view: 'hm-blackbox', mode: 'info',
    ch: { en: '🏛️ Oversight', ar: '🏛️ الإشراف' },
    title: { en: 'Everything you did is on the record', ar: 'كل ما فعلته مسجَّل' },
    body: {
      en: 'The manager’s “black box”: registration, the <strong>refused Amoxicillin alert</strong>, the orders, the <strong>critical-lab acknowledgement</strong>, the X-ray report, the dispense, the MAR entry — every step you just took, hash-chained so silent edits are detectable. This audit trail is the spine of the whole system.<br><br>Press <strong>Next</strong>.',
      ar: '«الصندوق الأسود» للمدير: التسجيل، <strong>تنبيه الأموكسيسيلين المرفوض</strong>، الطلبات، <strong>إقرار الفحص الحرج</strong>، تقرير الأشعة، الصرف، توثيق الإعطاء — كل خطوة قمت بها الآن، مسلسلة التجزئة بحيث يُكشف أي تعديل خفي.<br><br>اضغط <strong>التالي</strong>.',
    },
    target() { return '#main-content table'; },
    done() { return false; },
  },
  { // look around the manager's cockpit
    role: ['manager', 'manager123', 'Hospital Manager', 'مدير المستشفى'],
    view: 'hm-overview', mode: 'info',
    ch: { en: '🏛️ Oversight', ar: '🏛️ الإشراف' },
    title: { en: 'The manager\'s cockpit', ar: 'قمرة قيادة المدير' },
    body: {
      en: 'The spotlight tours the oversight tools: 📊 <strong>live analytics</strong> (admissions, LOS, critical labs — lazy-loaded charts), 🛏️ <strong>the bed map</strong>, and 📑 <strong>reports</strong>. The manager sees the hospital, not patient charts — oversight roles deliberately have no prescribing or charting rights.',
      ar: 'الإضاءة تستعرض أدوات الإشراف: 📊 <strong>تحليلات حيّة</strong>، 🛏️ <strong>خريطة الأسرّة</strong>، و📑 <strong>التقارير</strong>. المدير يرى المستشفى لا ملفات المرضى — أدوار الإشراف بلا صلاحيات وصف أو توثيق عمداً.',
    },
    targets: ['.nav-btn[data-view="hm-analytics"]', '.nav-btn[data-view="hm-beds"]', '.nav-btn[data-view="hm-reports"]'],
    target() { return null; }, done() { return false; },
  },
  { // IT keeps the lights on
    role: ['admin', 'HIS@2024', 'IT Admin', 'مدير النظام'],
    view: 'it-settings', mode: 'info',
    ch: { en: '🏛️ Oversight', ar: '🏛️ الإشراف' },
    title: { en: 'The quiet role that protects it all', ar: 'الدور الهادئ الذي يحمي كل شيء' },
    body: {
      en: 'IT admin tools, spotlit in turn: <strong>device encryption</strong> (AES-256 at rest, passphrase-locked on logout), <strong>one-click backup</strong> of the whole database, and <strong>user management</strong> — create staff, disable accounts, audit access. And remember the login page’s 🚀 button: production mode starts with zero default credentials.',
      ar: 'أدوات مدير النظام بالتناوب: <strong>تشفير الجهاز</strong> (AES-256 للبيانات المخزنة، يُقفل بعبارة سر عند الخروج)، <strong>نسخة احتياطية بضغطة واحدة</strong> لقاعدة البيانات كاملة، و<strong>إدارة المستخدمين</strong>. وتذكّر زر 🚀 في شاشة الدخول: وضع التشغيل الفعلي يبدأ بلا أي حسابات افتراضية.',
    },
    targets: ['button[onclick="toggleDeviceEncryption()"]', 'button[onclick="downloadBackup()"]', '.nav-btn[data-view="it-users"]'],
    target() { return null; }, done() { return false; },
  },
  { // Salem himself logs in from home
    role: null, view: null, mode: 'auto',
    ch: { en: '🧍 The patient', ar: '🧍 المريض' },
    title: { en: 'Salem checks his own record', ar: 'سالم يطالع ملفه بنفسه' },
    body: {
      en: 'The last login belongs to the patient. Watch — Salem signs into the <strong>Patient Portal</strong> from home with nothing but the <strong>MRN and date of birth printed on his wristband</strong>. No app store, no setup.',
      ar: 'آخر تسجيل دخول للمريض نفسه. شاهد — سالم يدخل <strong>بوابة المريض</strong> من منزله بلا شيء سوى <strong>الرقم الطبي وتاريخ الميلاد المطبوعَين على سوار معصمه</strong>. لا متجر تطبيقات، لا إعداد.',
    },
    enter(s) {
      (async () => {
        try {
          const sess = (typeof getCurrentSession === 'function') ? getCurrentSession() : null;
          if (sess && sess.role === 'patient') return;
          try { await logout(); } catch (e) {}
          const r = await loginPatient(s.mrn, TOUR_PATIENT.dob, '');
          if (r && r.success) routeToDashboard();
        } catch (e) { console.warn('[tour] portal login failed', e); }
      })();
    },
    auto(s) { const st = tourState(); const sp = st && TOUR_STEPS[st.i]; if (sp && sp.enter) sp.enter(s); },
    target() { return null; },
    done() { const sess = (typeof getCurrentSession === 'function') ? getCurrentSession() : null; return !!(sess && sess.role === 'patient'); },
  },
  { // what the patient sees
    role: null, view: 'pp-labs', mode: 'info',
    ch: { en: '🧍 The patient', ar: '🧍 المريض' },
    title: { en: 'His results, in plain words', ar: 'نتائجه، بلغة بسيطة' },
    body: {
      en: 'Salem sees his own labs — including the <strong>critical potassium</strong>, marked in red, with a plain-language explanation instead of jargon. His prescriptions, visits, and the <strong>follow-up appointment reception just booked</strong> are all here too. Transparency is also care.<br><br>Press <strong>Next</strong> for the wrap-up.',
      ar: 'يرى سالم فحوصاته بنفسه — بما فيها <strong>البوتاسيوم الحرج</strong> بعلامة حمراء وشرح مبسّط بلا مصطلحات. وصفاته وزياراته و<strong>موعد المراجعة الذي حجزه الاستقبال للتو</strong> كلها هنا أيضاً. الشفافية رعاية أيضاً.<br><br>اضغط <strong>التالي</strong> للختام.',
    },
    target() { return document.querySelector('#main-content .badge.badge-danger') || '.nav-btn[data-view="pp-labs"]'; },
    done() { return false; },
  },
  { // finale
    role: null, view: null, mode: 'final',
    ch: { en: '🎉 Wrap-up', ar: '🎉 الختام' },
    title: { en: '🎉 One patient. Every role. Zero paper.', ar: '🎉 مريض واحد. كل الأدوار. بلا ورق.' },
    body: {
      en: 'Ambulance call → triage board → registration → consultant hand-off → a <strong>blocked unsafe prescription</strong> → the safe one → stat bloods + أشعة → a <strong>critical potassium caught and acknowledged on the record</strong> → the X-ray read → pharmacy double-check → a named nurse + two-identifier bedside charting → a cardiac diet, logged meals, discharge planning → a linked follow-up booking → the manager’s tamper-evident audit of every step → and Salem reading it all himself.<br><br><strong>Fifteen logins. Every role in the hospital. Every guard rail live.</strong><br><br>Explore freely with the role picker — or flip it to production:',
      ar: 'نداء إسعاف → لوحة الفرز → تسجيل → إسناد الاستشاري → <strong>إيقاف وصفة خاطئة</strong> → الوصفة الآمنة → دم عاجل وأشعة → <strong>بوتاسيوم حرج اكتُشف وأُقرّ به في السجل</strong> → قراءة الأشعة → تدقيق الصيدلية → ممرضة مسؤولة وتوثيق بمعرّفين → حمية قلبية ووجبات مسجلة وتخطيط للخروج → موعد مراجعة مرتبط بالملف → سجل تدقيق محصَّن لكل خطوة → وسالم يقرأ كل ذلك بنفسه.<br><br><strong>خمسة عشر تسجيل دخول. كل أدوار المستشفى. كل الحواجز حيّة.</strong><br><br>استكشف بحرية من قائمة الأدوار — أو حوّله للتشغيل الفعلي:',
    },
    target() { return null; },
    done() { return false; },
  },
];

// ---- engine ----
let _tourTimer = null;
let _tourHighlighted = null;
let _tourRunToken = 0;    // stale async runSteps (double-clicks, debug calls) go inert
let _tourSpotIdx = 0;     // rotating-spotlight position for steps with `targets: [...]`
let _tourShownAt = 0;     // when the current step's panel rendered (autoplay read-beat)
let _tourLastFire = 0;    // last autoplay action time (gentle retry pacing)

// Autoplay dwell: text-length-derived (Storylane/Arcade-style "auto-delay"),
// floored so even tiny steps get a readable beat, capped so nothing drags.
function _tourReadMs(step) {
  const ar = currentLanguage() === 'ar';
  const len = String(ar ? step.body.ar : step.body.en).replace(/<[^>]*>/g, '').length;
  return Math.max(3200, Math.min(9500, 2400 + 24 * len));
}

// Pops once after a fresh Demo install (and never again unless forced):
// the visitor chooses hands-on or sit-back autoplay.
function demoTourOffer(force) {
  if (!tourIsDemoInstall() || tourState()) return;
  if (!force && localStorage.getItem('ow_tour_offered')) return;
  if (typeof getCurrentSession === 'function' && getCurrentSession()) return;   // already inside the app
  if (document.getElementById('tour-offer-overlay')) return;
  localStorage.setItem('ow_tour_offered', '1');
  const ar = currentLanguage() === 'ar';
  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  overlay.id = 'tour-offer-overlay';
  overlay.innerHTML = `
    <div class="alert-modal" style="max-width:480px;text-align:center">
      <div style="font-size:2.5rem">🎬</div>
      <h2 style="margin:6px 0 8px">${ar ? 'جولة إرشادية؟' : 'Want the guided tour?'}</h2>
      <p class="text-muted" style="font-size:0.9rem;margin-bottom:16px">${ar
        ? 'تابع مريضاً واحداً من باب الطوارئ حتى سجل التدقيق — عبر سبعة أدوار: تسجيل، وصفة يرفضها النظام، دم وأشعة، بوتاسيوم حرج، صيدلية، تمريض، وإدارة.'
        : 'Follow one patient from the ER door to the audit log — across seven staff roles: registration, a prescription the app refuses, bloods + X-ray, a critical potassium, pharmacy, nursing, and management.'}</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-primary" onclick="this.closest('.alert-overlay').remove(); demoTourStart('step')">${ar ? '▶ ابدأ الجولة — هي تعمل وأنت تقرأ وتضغط «متابعة»' : '▶ Start the tour — it does the work, you just press Continue'}</button>
        <button class="btn btn-secondary btn-sm" onclick="this.closest('.alert-overlay').remove(); demoTourStart('auto')">${ar ? '🤖 تلقائي بالكامل — أشاهد فقط' : '🤖 Fully automatic — I\'ll just watch'}</button>
        <button class="btn btn-secondary btn-sm" onclick="this.closest('.alert-overlay').remove(); demoTourStart('manual')">${ar ? '🖱️ يدوي — أنا أضغط أزرار التطبيق بنفسي' : '🖱️ Hands-on — I\'ll click the app myself'}</button>
        <button class="btn btn-secondary btn-sm" onclick="this.closest('.alert-overlay').remove()">${ar ? 'أستكشف بنفسي' : 'I\'ll explore on my own'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function demoTourStart(pace) {
  if (!tourIsDemoInstall()) return;
  // pace: 'step' (default — the tour acts, the visitor reads + presses
  // Continue), 'auto' (fully timer-driven), 'manual' (visitor clicks the
  // real app controls). Legacy booleans from old callers still map sanely.
  if (pace === true) pace = 'auto';
  if (!pace || pace === false) pace = 'step';
  // Per-run patient identity: a REPLAY must register a fresh Salem (a reused
  // national id would make step 1 auto-skip, and a reused bed would trip the
  // bed-conflict guard against the previous run's Salem).
  const nonce = String(Date.now()).slice(-6);
  tourSave({ i: 0, pace, auto: pace === 'auto', natId: '10998' + nonce, bed: 'B-3' + nonce.slice(-2) });
  demoTourRunStep();
}

// Continue button (step pace): the visitor read the beat — now the tour
// performs it. Arms the tick's action loop (which retries multi-phase
// modals); info beats just advance.
function demoTourContinue() {
  const s = tourState(); if (!s) return;
  const step = TOUR_STEPS[s.i]; if (!step) return;
  if (step.mode === 'info') { _tourAdvance(); return; }
  s.armed = true; tourSave(s);
  _tourLastFire = 0;             // fire on the next tick, no extra wait
  const btn = document.getElementById('tour-continue-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + (currentLanguage() === 'ar' ? 'يعمل…' : 'working…'); }
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
  _tourCursorHide();
  const p = document.getElementById('tour-panel'); if (p) p.remove();
}

function demoTourToggleAuto() {
  const s = tourState(); if (!s) return;
  const isAuto = (s.pace || (s.auto ? 'auto' : '')) === 'auto';
  s.pace = isAuto ? 'step' : 'auto';
  s.auto = !isAuto; s.armed = false; tourSave(s);
  if (isAuto) _tourCursorHide();
  _tourShownAt = Date.now();   // give a fresh read-beat on resume
  const step = TOUR_STEPS[s.i];
  if (step) _tourRenderPanel(step, s);
}

function _tourClearHighlight() {
  if (_tourHighlighted) { try { _tourHighlighted.classList.remove('tour-spot'); } catch (e) {} _tourHighlighted = null; }
}

// ---- the guide window MOVES to its target (driver.js-style popover) ----
// Side order below → above → right → left, clamped to the viewport; when no
// target (or nothing fits) the panel rests in its corner. CSS transitions on
// left/top make the moves glide.
function _tourPositionPanel(target) {
  const panel = document.getElementById('tour-panel');
  if (!panel) return;
  const park = () => { panel.classList.remove('tour-anchored'); panel.style.left = panel.style.top = panel.style.right = panel.style.bottom = ''; };
  try {
    if (!target || !target.getBoundingClientRect) { park(); return; }
    const r = target.getBoundingClientRect();
    if (!r.width && !r.height) { park(); return; }
    const pw = panel.offsetWidth || 340, ph = panel.offsetHeight || 240;
    const gap = 16, vw = window.innerWidth, vh = window.innerHeight;
    let top, left;
    if (r.bottom + gap + ph <= vh) { top = r.bottom + gap; left = r.left + r.width / 2 - pw / 2; }
    else if (r.top - gap - ph >= 0) { top = r.top - gap - ph; left = r.left + r.width / 2 - pw / 2; }
    else if (r.right + gap + pw <= vw) { top = r.top + r.height / 2 - ph / 2; left = r.right + gap; }
    else if (r.left - gap - pw >= 0) { top = r.top + r.height / 2 - ph / 2; left = r.left - gap - pw; }
    else { park(); return; }   // huge/centered target — corner is less intrusive
    left = Math.max(10, Math.min(left, vw - pw - 10));
    top = Math.max(10, Math.min(top, vh - ph - 10));
    panel.classList.add('tour-anchored');
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
    panel.style.left = left + 'px'; panel.style.top = top + 'px';
  } catch (e) { park(); }
}

// ---- simulated cursor (autoplay): eases to the control, pulses, then acts ----
function _tourCursorEl() {
  let c = document.getElementById('tour-cursor');
  if (!c) {
    c = document.createElement('div');
    c.id = 'tour-cursor';
    c.textContent = '👆';
    document.body.appendChild(c);
  }
  return c;
}
function _tourCursorHide() { const c = document.getElementById('tour-cursor'); if (c) c.remove(); }
function _tourCursorTo(el, thenFn) {
  try {
    // Hidden tab (kiosk warm-up, background window): browsers throttle nested
    // timers hard — skip the animation and act immediately.
    if (typeof document !== 'undefined' && document.hidden) { thenFn(); return; }
    if (!el || !el.getBoundingClientRect) { thenFn(); return; }
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) { thenFn(); return; }
    const c = _tourCursorEl();
    c.style.left = (r.left + r.width / 2) + 'px';
    c.style.top = (r.top + r.height / 2) + 'px';
    setTimeout(() => {
      c.classList.add('tour-cursor-click');
      setTimeout(() => { c.classList.remove('tour-cursor-click'); thenFn(); }, 280);
    }, 700);
  } catch (e) { thenFn(); }
}

async function demoTourRunStep() {
  const s = tourState(); if (!s) return;
  const step = TOUR_STEPS[s.i]; if (!step) { demoTourEnd(); return; }
  const token = ++_tourRunToken;

  // become the right persona (demo constants — this is the whole point of a
  // demo install). role:null = a pre-login beat on the login screen itself.
  try {
    if (step.role) {
      const sess = (typeof getCurrentSession === 'function') ? getCurrentSession() : null;
      // patient sessions carry a PATIENT id in user_id — looking it up in the
      // users table could collide with a staff id and skip a needed login
      const me = (sess && sess.role !== 'patient') ? dbGet('SELECT username FROM users WHERE user_id = ?', [sess.user_id]) : null;
      if (!me || me.username !== step.role[0]) {
        const r = await login(step.role[0], step.role[1]);
        if (!r || !r.success) { demoTourEnd(); return; }
        routeToDashboard();
        await new Promise(r2 => setTimeout(r2, 350));
      }
    }
  } catch (e) { demoTourEnd(); return; }

  if (token !== _tourRunToken) return;   // a newer runStep superseded this one
  if (step.view && (typeof currentView === 'undefined' || currentView !== step.view)) navigateTo(step.view);
  await new Promise(r => setTimeout(r, 450));
  if (token !== _tourRunToken) return;
  try { if (step.enter) step.enter(s); } catch (e) { console.warn('[tour] enter failed', e); }
  _tourRenderPanel(step, s);
  _tourShownAt = Date.now();

  if (_tourTimer) clearInterval(_tourTimer);
  _tourSpotIdx = 0;
  _tourTimer = setInterval(() => _tourTick(step), 900);
  _tourTick(step);
}

function _tourTick(step) {
  const s = tourState();
  if (!s || TOUR_STEPS[s.i] !== step) return;
  // (re-)apply the highlight — view re-renders wipe it. Steps with a
  // `targets` array get a ROTATING spotlight (one element per tick).
  let liveTarget = null;
  try {
    if (step.targets && step.targets.length) {
      let t = null;
      for (let k = 0; k < step.targets.length && !t; k++) {
        t = document.querySelector(step.targets[_tourSpotIdx % step.targets.length]);
        if (!t) _tourSpotIdx++;   // missing element (e.g. FAB hidden) — try the next
      }
      _tourSpotIdx++;
      if (t && t !== _tourHighlighted) { _tourClearHighlight(); t.classList.add('tour-spot'); _tourHighlighted = t; }
    } else {
      let t = step.target ? step.target(s) : null;
      if (typeof t === 'string') t = document.querySelector(t);
      liveTarget = t;
      if (t && t !== _tourHighlighted) { _tourClearHighlight(); t.classList.add('tour-spot'); t.scrollIntoView({ block: 'center', behavior: 'smooth' }); _tourHighlighted = t; }
      if (!t) _tourClearHighlight();
    }
    _tourPositionPanel(_tourHighlighted);   // the guide window follows its target
  } catch (e) {}
  // SELF-DRIVING: the tour performs the step via the simulated cursor.
  //  - pace 'auto': fires after a text-length read-beat (timer-driven).
  //  - pace 'step': fires once the visitor pressed Continue (s.armed).
  // The retry cadence (2.6s) makes multi-phase steps (register→review,
  // ack-button→ack-modal) progress phase by phase; done() still gates advance.
  try {
    const pace = s.pace || (s.auto ? 'auto' : 'manual');
    const wants = step.mode !== 'final' && (
      (pace === 'auto' && Date.now() - _tourShownAt > _tourReadMs(step)) ||
      (pace === 'step' && s.armed)
    );
    if (wants && Date.now() - _tourLastFire > 2600) {
      _tourLastFire = Date.now();
      const act = () => {
        try {
          if (step.mode === 'info') _tourAdvance();
          else if (step.auto) step.auto(s);
        } catch (e) {}
      };
      _tourCursorTo(liveTarget || _tourHighlighted, act);
    }
  } catch (e) {}
  // auto-advance the moment the real-world effect is in the database
  try { if (step.done && step.done(s)) _tourAdvance(); } catch (e) {}
}

function _tourAdvance() {
  const s = tourState(); if (!s) return;
  if (_tourTimer) { clearInterval(_tourTimer); _tourTimer = null; }
  _tourClearHighlight();
  s.i += 1; s.armed = false; tourSave(s);   // each beat re-arms via its own Continue
  if (s.i >= TOUR_STEPS.length) { demoTourEnd(); return; }
  // hand off via microtask: it escapes the tick's call stack (and its
  // try/catch) like setTimeout(0) would, but is IMMUNE to background-tab
  // timer throttling, which delayed setTimeout(0) by up to a minute in
  // hidden tabs (kiosk warm-up, preview harnesses).
  queueMicrotask(() => demoTourRunStep());
}

// Self-heal watchdog: the tour must never silently stall. If state says a tour
// is active but no step-loop is ticking (a runStep died mid-flight — e.g. an
// exception inside a view handler it triggered), re-enter the current step.
if (typeof window !== 'undefined' && typeof setInterval === 'function') {
  setInterval(() => {
    try { if (!_tourTimer && tourState() && tourIsDemoInstall()) demoTourRunStep(); } catch (e) {}
  }, 2500);
}

// Autoplay etiquette (research-backed): a real user click takes over playback
// (Arcade's yield-on-interact), and a hidden tab pauses instead of playing on
// to nobody (plus WCAG 2.2.2 — motion must be pausable).
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('pointerdown', (e) => {
    try {
      const s = tourState();
      if (!s || (s.pace || (s.auto ? 'auto' : '')) !== 'auto') return;
      if (e.target.closest && (e.target.closest('#tour-panel') || e.target.closest('#tour-offer-overlay'))) return;
      if (!e.isTrusted) return;   // the tour's own synthetic clicks don't pause it
      s.pace = 'step'; s.auto = false; s.armed = false; tourSave(s);   // yield: downgrade to Continue-paced
      _tourCursorHide();
      const step = TOUR_STEPS[s.i]; if (step) _tourRenderPanel(step, s);
    } catch (err) {}
  }, true);
  document.addEventListener('visibilitychange', () => {
    try {
      if (document.visibilityState !== 'hidden') return;
      const s = tourState();
      if (s && (s.pace === 'auto' || s.auto)) { s.pace = 'step'; s.auto = false; s.armed = false; tourSave(s); _tourCursorHide(); }
    } catch (err) {}
  });
}

function _tourRenderPanel(step, s) {
  const ar = currentLanguage() === 'ar';
  let panel = document.getElementById('tour-panel');
  if (!panel) { panel = document.createElement('div'); panel.id = 'tour-panel'; document.body.appendChild(panel); }
  const dots = TOUR_STEPS.map((_, i) => `<span class="tour-dot${i === s.i ? ' active' : ''}"></span>`).join('');
  const roleBadge = step.role
    ? `${ar ? step.role[3] : step.role[2]} · ${step.role[0]}`
    : (step.ch ? (ar ? step.ch.ar : step.ch.en) : 'OpenWard');
  const chChip = step.ch ? `<span style="background:#eef2ff;color:#3730a3;border-radius:12px;padding:2px 8px;font-size:0.68rem;font-weight:600;margin-inline-start:6px">${ar ? step.ch.ar : step.ch.en}</span>` : '';
  const counter = `${s.i + 1} / ${TOUR_STEPS.length}`;
  const pace = s.pace || (s.auto ? 'auto' : 'manual');
  const paceChip = pace === 'auto' ? (ar ? ' · تلقائي ▶' : ' · AUTO ▶') : '';
  const autoBtn = step.mode === 'final' ? '' : (pace === 'auto'
    ? `<button class="btn btn-sm btn-secondary" onclick="demoTourToggleAuto()">⏸ ${ar ? 'إيقاف مؤقت' : 'Pause'}</button>`
    : `<button class="btn btn-sm btn-secondary" onclick="demoTourToggleAuto()" style="font-size:0.7rem">🤖 ${ar ? 'تلقائي كامل' : 'Full auto'}</button>`);
  // pace 'step': ONE uniform button — read, press Continue, watch the tour act
  const continueBtn = (pace === 'step' && step.mode !== 'final')
    ? `<button class="btn btn-primary" id="tour-continue-btn" onclick="demoTourContinue()" ${s.armed ? 'disabled' : ''} style="flex:1">${s.armed ? '⏳ ' + (ar ? 'يعمل…' : 'working…') : (step.mode === 'info' ? (ar ? 'متابعة ←' : 'Continue →') : '▶ ' + (ar ? 'متابعة — نفّذها' : 'Continue — do it'))}</button>`
    : '';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div class="tour-panel-role">🎬 ${roleBadge}${step.role ? chChip : ''}</div>
      <div style="font-size:0.72rem;color:var(--text-secondary);white-space:nowrap">${counter}${step.mode !== 'final' ? paceChip : ''}</div>
    </div>
    ${step.role ? `<div style="font-size:0.7rem;color:var(--text-secondary);margin:4px 0 2px">🔑 ${ar ? 'سجّلتُ دخولك بـ' : 'I logged you in with'} <code>${step.role[0]} / ${step.role[1]}</code> ${ar ? '(حسابات تجريبية)' : '(demo credentials)'}</div>` : ''}
    <h3>${ar ? step.title.ar : step.title.en}</h3>
    <p>${ar ? step.body.ar : step.body.en}</p>
    <div class="tour-panel-dots">${dots}</div>
    <div class="tour-panel-btns">
      ${continueBtn}
      ${pace === 'manual' && step.mode === 'click' ? `<button class="btn btn-sm btn-secondary" onclick="(function(){var st=tourState();var sp=TOUR_STEPS[st.i];try{sp.auto(st);}catch(e){}})()">${ar ? '🤖 افعلها عني' : '🤖 Do it for me'}</button>` : ''}
      ${pace === 'manual' && step.mode === 'info' ? `<button class="btn btn-sm btn-primary" onclick="_tourAdvance()">${ar ? 'التالي ←' : 'Next →'}</button>` : ''}
      ${step.mode !== 'final' && pace !== 'manual' ? autoBtn : ''}
      ${step.mode === 'final' ? `<button class="btn btn-sm btn-primary" onclick="demoTourEnd();switchToProduction()">${ar ? '🚀 جهّزه للتشغيل الفعلي' : '🚀 Set up for production'}</button>` : ''}
      ${step.mode === 'final' ? `<button class="btn btn-sm btn-secondary" onclick="demoTourEnd();demoTourOffer(true)">${ar ? '🔁 إعادة الجولة' : '🔁 Replay'}</button>` : ''}
      <button class="btn btn-sm btn-secondary" onclick="demoTourEnd()">${ar ? 'إنهاء' : 'End'}</button>
    </div>`;
}
