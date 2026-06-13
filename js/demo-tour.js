// ============================================================
// GUIDED DEMO TOUR — "follow one toothache through the dental clinic"
// ============================================================
// Demo installs only (never rendered in production or server mode — the
// entry points are gated in setupShowcaseLogin / the boot hook).
//
// The tour registers a REAL patient through the REAL forms and follows him
// across role logins: reception registration (creates the record + queues
// him) → hygienist records a penicillin allergy → the dentist charts caries
// on tooth 36, builds a costed treatment plan, has an <strong>amoxicillin Rx
// REFUSED</strong> by the allergy guard, prescribes the safe clindamycin
// instead, and completes the filling → reception invoices + books a 6-month
// recall → the manager's dashboard + tamper-evident audit of every step →
// Salem reading his own plan, prescription and bill in the portal. Every
// click runs the actual handlers — nothing is mocked.
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
  natId: '1099887766', dob: '1986-05-20',
  complaint: 'Pain in a lower-left back tooth for two days — ألم في ضرس خلفي سفلي منذ يومين',
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
// ---- dental tour helpers ----
function tourClearOverlays() { try { closeModal(); } catch (e) {} document.querySelectorAll('.alert-overlay').forEach(el => { try { el.remove(); } catch (e) {} }); }
function tourOpenForPatient(view, pid) { try { window.SELECTED_PATIENT_ID = pid; navigateTo(view); } catch (e) {} }

// ---- the dental story: one toothache, every role, nothing mocked ----
const TOUR_STEPS = [
  { // login door
    role: null, view: null, mode: 'info',
    ch: { en: '🚪 The door', ar: '🚪 الباب' },
    title: { en: 'Every visit starts at this door', ar: 'كل زيارة تبدأ من هذا الباب' },
    body: {
      en: 'This is the only way in. In demo mode the spotlight shows three things: the <strong>role picker</strong> (jump into any of the clinic’s staff roles, no passwords), the <strong>Patient Portal</strong> toggle (patients have a door too), and the <strong>production switch</strong> — one click wipes the demo and builds a real, zero-default-credential clinic.<br><br>Press <strong>Next</strong> and we’ll follow one patient — a toothache — through the whole clinic.',
      ar: 'هذا هو المدخل الوحيد. في الوضع التجريبي تُظهر الإضاءة ثلاثة أشياء: <strong>قائمة الأدوار</strong> (ادخل بأي دور بلا كلمات مرور)، وزر <strong>بوابة المريض</strong>، و<strong>مفتاح التشغيل الفعلي</strong> — ضغطة تمسح التجربة وتبني عيادة حقيقية بلا حسابات افتراضية.<br><br>اضغط <strong>التالي</strong> لنتابع مريضاً واحداً بألم أسنان عبر العيادة كلها.',
    },
    targets: ['#demo-persona', '#login-patient-btn', '#prod-setup-btn'],
    target() { return null; }, done() { return false; },
  },
  { // reception registers Salem
    role: ['reception', 'recept123', 'Receptionist', 'موظف الاستقبال'],
    view: 'rcp-register', mode: 'click',
    ch: { en: '🛎️ Front desk', ar: '🛎️ الاستقبال' },
    title: { en: 'A new patient walks in with a toothache', ar: 'مريض جديد يدخل بألم أسنان' },
    body: {
      en: 'Receptionist Sara greets Salem and registers him — name, ID, phone, and his complaint: pain in a lower-left molar for two days. I’ve filled the form.<br><br>👉 <strong>Click “Register Patient”</strong> — this creates his record (with a brand-new MRN) and drops him into the chair queue.',
      ar: 'موظفة الاستقبال سارة تستقبل سالم وتسجّله — الاسم، الهوية، الهاتف، وشكواه: ألم في ضرس خلفي سفلي منذ يومين. عبّأتُ النموذج.<br><br>👉 <strong>اضغطي «تسجيل المريض»</strong> — يُنشئ ملفه برقم طبي جديد ويضعه في قائمة الكراسي.',
    },
    enter() {
      setTimeout(() => {
        tourSet('rcp-name-ar', TOUR_PATIENT.nameAr); tourSet('rcp-name-en', TOUR_PATIENT.nameEn);
        tourSet('rcp-nid', TOUR_PATIENT.natId); tourSet('rcp-phone', '0551112233');
        tourSet('rcp-dob', TOUR_PATIENT.dob); tourSet('rcp-gender', 'male');
        tourPickOption('rcp-dept', 'general'); tourSet('rcp-complaint', TOUR_PATIENT.complaint);
      }, 300);
    },
    auto() { const el = document.getElementById('rcp-name-ar'); const f = el && el.closest('form'); if (f) f.requestSubmit(); },
    target() { return '#main-content form button[type="submit"]'; },
    done(s) { const p = dbGet('SELECT patient_id, mrn FROM patients WHERE national_id = ?', [TOUR_PATIENT.natId]); if (!p) return false; s.patientId = p.patient_id; s.mrn = p.mrn; tourSave(s); return true; },
  },
  { // the queue
    role: ['reception', 'recept123', 'Receptionist', 'موظف الاستقبال'],
    view: 'rcp-queue', mode: 'info',
    ch: { en: '🛎️ Front desk', ar: '🛎️ الاستقبال' },
    title: { en: 'He’s in the queue', ar: 'دخل قائمة الانتظار' },
    body: {
      en: 'Salem now shows on the live queue every clinician can see. Reception’s part is done — over to the clinical team.<br><br>Press <strong>Next</strong>.',
      ar: 'سالم يظهر الآن في قائمة الانتظار التي يراها كل أعضاء الفريق. انتهى دور الاستقبال — لننتقل للفريق العلاجي.<br><br>اضغط <strong>التالي</strong>.',
    },
    target() { return '#main-content table'; }, done() { return false; },
  },
  { // hygienist records penicillin allergy
    role: ['hyg.mona', 'nurse123', 'Hygienist', 'أخصائية صحة الأسنان'],
    view: 'asst-intake', mode: 'click',
    ch: { en: '🪥 Intake', ar: '🪥 الاستقبال الطبي' },
    title: { en: 'The one fact that changes everything', ar: 'المعلومة التي تغيّر كل شيء' },
    body: {
      en: 'Hygienist Mona takes Salem’s medical history. He mentions a <strong>penicillin allergy</strong> — a rash and facial swelling once. She records it. Watch how this single entry guards a prescription a few minutes from now.<br><br>👉 <strong>Click “Save”.</strong>',
      ar: 'أخصائية صحة الأسنان منى تأخذ التاريخ الطبي لسالم. يذكر <strong>حساسية من البنسلين</strong> — طفح وتورّم في الوجه سابقاً. تسجّلها. لاحظ كيف يحمي هذا الإدخال وصفةً بعد دقائق.<br><br>👉 <strong>اضغطي «حفظ».</strong>',
    },
    enter(s) { tourOpenForPatient('asst-intake', s.patientId); setTimeout(() => { if (typeof openAddAllergy === 'function') openAddAllergy(s.patientId); setTimeout(() => { tourSet('al-name', 'Penicillin'); tourSet('al-react', 'Rash and facial swelling'); tourSet('al-sev', 'severe'); }, 320); }, 480); },
    auto(s) { if (typeof saveAllergy === 'function') saveAllergy(s.patientId); },
    target() { return '.generic-modal .btn-primary'; },
    done(s) { return !!dbGet("SELECT id FROM patient_allergies WHERE patient_id=? AND allergen='Penicillin'", [s.patientId]); },
  },
  { // dentist charts the caries
    role: ['dr.omar', 'doctor123', 'Dentist', 'طبيب الأسنان'],
    view: 'dr-chart', mode: 'click',
    ch: { en: '🦷 The chair', ar: '🦷 الكرسي' },
    title: { en: 'Charting the bad tooth', ar: 'تسجيل السن المصابة' },
    body: {
      en: 'Dr. Omar examines Salem and finds <strong>deep decay in tooth 36</strong> — the lower-left first molar (FDI numbering). He charts it on the odontogram with a single click; the allergy and his medical history ride along the top of the screen the whole time.<br><br>👉 <strong>Click “Save”.</strong>',
      ar: 'الدكتور عمر يفحص سالم ويجد <strong>تسوّساً عميقاً في السن 36</strong> — الرحى الأولى السفلية اليسرى (ترقيم FDI). يسجّلها على مخطط الأسنان بنقرة واحدة، والحساسية والتاريخ الطبي يظهران أعلى الشاشة طوال الوقت.<br><br>👉 <strong>اضغط «حفظ».</strong>',
    },
    enter(s) { tourOpenForPatient('dr-chart', s.patientId); setTimeout(() => { if (typeof openToothEditor === 'function') openToothEditor(36); setTimeout(() => { tourSet('te-status', 'caries'); tourSet('te-surfaces', 'O'); tourSet('te-note', 'Deep occlusal caries, symptomatic'); }, 320); }, 480); },
    auto() { if (typeof saveToothStatus === 'function') saveToothStatus(36); },
    target() { return '.generic-modal .btn-primary'; },
    done(s) { return !!dbGet('SELECT chart_id FROM odontogram WHERE patient_id=? AND tooth_fdi=36', [s.patientId]); },
  },
  { // dentist builds the plan
    role: ['dr.omar', 'doctor123', 'Dentist', 'طبيب الأسنان'],
    view: 'dr-plans', mode: 'click',
    ch: { en: '🦷 The chair', ar: '🦷 الكرسي' },
    title: { en: 'A plan, with a price', ar: 'خطة، بسعرها' },
    body: {
      en: 'He proposes a <strong>composite filling on 36</strong>. The procedure and its price come straight from the clinic’s catalog — so Salem sees exactly what it costs before anything starts.<br><br>👉 <strong>Click “Add”.</strong>',
      ar: 'يقترح <strong>حشوة كمبوزيت للسن 36</strong>. الإجراء وسعره يأتيان مباشرة من كتالوج العيادة — فيرى سالم التكلفة بوضوح قبل أن يبدأ أي شيء.<br><br>👉 <strong>اضغط «إضافة».</strong>',
    },
    enter(s) { tourOpenForPatient('dr-plans', s.patientId); setTimeout(() => { if (typeof openAddPlanItem === 'function') openAddPlanItem(s.patientId); setTimeout(() => { tourPickOption('pi-proc', 'D2391'); tourSet('pi-tooth', '36'); if (typeof planItemProcChanged === 'function') planItemProcChanged(); }, 320); }, 480); },
    auto(s) { if (typeof saveAddPlanItem === 'function') saveAddPlanItem(s.patientId); },
    target() { return '.generic-modal .btn-primary'; },
    done(s) { const it = dbGet("SELECT item_id FROM treatment_plan_items WHERE patient_id=? AND procedure_code='D2391' ORDER BY item_id DESC LIMIT 1", [s.patientId]); if (!it) return false; s.fillingItemId = it.item_id; tourSave(s); return true; },
  },
  { // the app blocks the unsafe Rx
    role: ['dr.omar', 'doctor123', 'Dentist', 'طبيب الأسنان'],
    view: 'dr-chart', mode: 'click',
    ch: { en: '⛔ The guard rail', ar: '⛔ الحاجز' },
    title: { en: 'The app refuses the wrong drug', ar: 'النظام يرفض الدواء الخاطئ' },
    body: {
      en: 'Post-op, Dr. Omar reaches for <strong>amoxicillin</strong> — a penicillin. The instant he tries, OpenSmile <strong>stops him cold</strong>: Salem is penicillin-allergic, severe. Nobody had to remember the allergy — the record did, and it refuses to let it through quietly.<br><br>👉 <strong>Watch the block.</strong>',
      ar: 'بعد العلاج يهمّ الدكتور عمر بوصف <strong>أموكسيسيلين</strong> — وهو من البنسلين. لحظة محاولته <strong>يوقفه النظام تماماً</strong>: سالم لديه حساسية شديدة من البنسلين. لم يحتج أحد لتذكّر الحساسية — السجلّ تذكّرها ورفض تمريرها بصمت.<br><br>👉 <strong>شاهد المنع.</strong>',
    },
    enter(s) { tourClearOverlays(); tourOpenForPatient('dr-chart', s.patientId); setTimeout(() => { if (typeof dentalPrescribe === 'function') dentalPrescribe(s.patientId); setTimeout(() => { const sel = document.getElementById('dp-drug'); if (sel) { const a = [...sel.options].find(o => /Amoxicillin 500/.test(o.textContent)); if (a) sel.value = a.value; } tourSet('dp-dose', '500 mg'); tourSet('dp-freq', 'TID'); }, 320); }, 480); },
    auto(s) { if (typeof doDentalPrescribe === 'function') doDentalPrescribe(s.patientId); },
    target() { return '.alert-overlay'; },
    done() { return !!document.querySelector('.alert-overlay'); },
  },
  { // safe alternative
    role: ['dr.omar', 'doctor123', 'Dentist', 'طبيب الأسنان'],
    view: 'dr-chart', mode: 'click',
    ch: { en: '✅ The safe one', ar: '✅ البديل الآمن' },
    title: { en: 'The safe alternative goes straight through', ar: 'البديل الآمن يمرّ مباشرة' },
    body: {
      en: 'He backs out and prescribes <strong>clindamycin</strong> instead — a safe choice for a penicillin allergy. Same two clicks, no warning at all. The guard rail only fires when it should, so it never becomes noise to click past.<br><br>👉 <strong>Click “Prescribe”.</strong>',
      ar: 'يتراجع ويصف <strong>كليندامايسين</strong> بدلاً منه — خيار آمن مع حساسية البنسلين. النقرتان نفسهما، بلا أي تحذير. الحاجز يعمل فقط عند الحاجة، فلا يتحوّل إلى إزعاج يُتجاوز.<br><br>👉 <strong>اضغط «وصف».</strong>',
    },
    enter(s) { tourClearOverlays(); tourOpenForPatient('dr-chart', s.patientId); setTimeout(() => { if (typeof dentalPrescribe === 'function') dentalPrescribe(s.patientId); setTimeout(() => { const sel = document.getElementById('dp-drug'); if (sel) { const c = [...sel.options].find(o => /Clindamycin/.test(o.textContent)); if (c) sel.value = c.value; } tourSet('dp-dose', '300 mg'); tourSet('dp-freq', 'TID'); }, 320); }, 480); },
    auto(s) { if (typeof doDentalPrescribe === 'function') doDentalPrescribe(s.patientId); },
    target() { return '.generic-modal .btn-primary'; },
    done(s) { return !!dbGet("SELECT rx_id FROM prescriptions WHERE patient_id=? AND drug_name LIKE 'Clindamycin%'", [s.patientId]); },
  },
  { // complete the filling
    role: ['dr.omar', 'doctor123', 'Dentist', 'طبيب الأسنان'],
    view: 'dr-plans', mode: 'click',
    ch: { en: '🦷 The chair', ar: '🦷 الكرسي' },
    title: { en: 'Filling done', ar: 'تمّت الحشوة' },
    body: {
      en: 'Dr. Omar places the filling and marks it <strong>complete</strong>. The procedure flips to “done” and its value rolls straight into the day’s production — which the manager will see in a moment.<br><br>👉 <strong>Click “Complete”.</strong>',
      ar: 'الدكتور عمر يضع الحشوة ويعلّمها <strong>مكتملة</strong>. ينتقل الإجراء إلى «تمّ» وتُحتسب قيمته فوراً في إنتاج اليوم — الذي سيراه المدير بعد قليل.<br><br>👉 <strong>اضغط «تم».</strong>',
    },
    enter(s) { tourOpenForPatient('dr-plans', s.patientId); },
    auto(s) { if (s.fillingItemId && typeof completePlanItem === 'function') completePlanItem(s.fillingItemId); },
    target() { return '#main-content .btn-success'; },
    done(s) { const it = dbGet('SELECT status FROM treatment_plan_items WHERE item_id=?', [s.fillingItemId]); return !!(it && it.status === 'completed'); },
  },
  { // reception bills + recall
    role: ['reception', 'recept123', 'Receptionist', 'موظف الاستقبال'],
    view: 'rcp-billing', mode: 'info',
    ch: { en: '💳 Checkout', ar: '💳 المحاسبة' },
    title: { en: 'Checkout, and a 6-month recall', ar: 'الدفع، وموعد مراجعة بعد ٦ أشهر' },
    body: {
      en: 'Back at the front desk the completed filling is invoiced and paid (250 SAR, cash), and Salem is booked for a <strong>6-month recall</strong> so he doesn’t slip through the cracks.<br><br>Press <strong>Next</strong>.',
      ar: 'عند الاستقبال تُحرَّر فاتورة الحشوة وتُدفع (٢٥٠ ر.س نقداً)، ويُحجز لسالم <strong>موعد مراجعة بعد ٦ أشهر</strong> حتى لا يُنسى.<br><br>اضغط <strong>التالي</strong>.',
    },
    enter(s) {
      try {
        if (s.patientId && !dbGet("SELECT invoice_id FROM invoices WHERE patient_id=? AND notes='tour'", [s.patientId])) {
          const p = dbGet('SELECT * FROM patients WHERE patient_id=?', [s.patientId]);
          const u = dbGet("SELECT user_id FROM users WHERE username='reception'");
          dbRun("INSERT INTO invoices (patient_id, patient_name_ar, patient_name_en, national_id, dept_id, visit_date, subtotal, discount, total, paid_amount, payment_type, status, created_by, created_at, notes) VALUES (?,?,?,?,1,?,250,0,250,250,'cash','paid',?,?, 'tour')", [s.patientId, p.full_name_ar, p.full_name_en, p.national_id, new Date().toISOString().slice(0, 10), u ? u.user_id : 1, nowISO()]);
          const inv = dbLastId();
          dbRun("INSERT INTO invoice_items (invoice_id, description_en, description_ar, qty, unit_price, total_price) VALUES (?, 'Composite Filling — Posterior','حشوة كمبوزيت خلفية',1,250,250)", [inv]);
          dbRun("INSERT INTO recalls (patient_id, type, due_date, status, created_at) VALUES (?, 'checkup', ?, 'due', ?)", [s.patientId, new Date(Date.now() + 182 * 86400000).toISOString().slice(0, 10), nowISO()]);
          saveDBToIndexedDB();
        }
      } catch (e) {}
    },
    target() { return '#main-content'; }, done() { return false; },
  },
  { // manager dashboard
    role: ['manager', 'manager123', 'Clinic Manager', 'مدير العيادة'],
    view: 'mgr-overview', mode: 'info',
    ch: { en: '📊 The owner', ar: '📊 المدير' },
    title: { en: 'The whole day on one screen', ar: 'اليوم كله في شاشة واحدة' },
    body: {
      en: 'The clinic manager opens the dashboard: today’s appointments, recalls due, and <strong>money collected vs. outstanding</strong> — including the filling Salem just paid for. Production is tracked by specialty, not guesswork.<br><br>Press <strong>Next</strong>.',
      ar: 'مدير العيادة يفتح لوحة المتابعة: مواعيد اليوم، الاستدعاءات المستحقة، و<strong>المحصَّل مقابل المتبقّي</strong> — بما في ذلك حشوة سالم التي دُفعت للتو. الإنتاج يُتابَع حسب التخصص، لا بالتخمين.<br><br>اضغط <strong>التالي</strong>.',
    },
    targets: ['#main-content .stat-card'], target() { return null; }, done() { return false; },
  },
  { // manager audit log
    role: ['manager', 'manager123', 'Clinic Manager', 'مدير العيادة'],
    view: 'mgr-audit', mode: 'info',
    ch: { en: '🔒 The black box', ar: '🔒 الصندوق الأسود' },
    title: { en: 'Every step, signed and unerasable', ar: 'كل خطوة موثّقة ولا تُمحى' },
    body: {
      en: 'And here is the heart of it: a <strong>tamper-evident audit log</strong>. Salem’s registration, the recorded allergy, the charting, the costed plan, the <strong>blocked amoxicillin</strong>, the clindamycin, the completed filling, the invoice — every action, who did it and when, hash-chained so it can’t be quietly rewritten. This is what the manager actually watches.<br><br>Press <strong>Next</strong>.',
      ar: 'وهنا جوهر النظام: <strong>سجل تدقيق محصَّن ضد العبث</strong>. تسجيل سالم، الحساسية المسجّلة، التخطيط على الأسنان، الخطة بسعرها، <strong>منع الأموكسيسيلين</strong>، الكليندامايسين، الحشوة المكتملة، الفاتورة — كل فعل، ومن قام به ومتى، مربوط بسلسلة تجزئة لا تُعاد كتابتها بصمت. هذا ما يراقبه المدير فعلاً.<br><br>اضغط <strong>التالي</strong>.',
    },
    target() { return '#main-content table'; }, done() { return false; },
  },
  { // patient portal login
    role: null, view: null, mode: 'auto',
    ch: { en: '🧍 The patient', ar: '🧍 المريض' },
    title: { en: 'Salem checks his own record', ar: 'سالم يطالع ملفه بنفسه' },
    body: {
      en: 'The last login belongs to Salem. From home, with nothing but the <strong>MRN and date of birth on his appointment card</strong>, he opens the Patient Portal — no app store, no setup.',
      ar: 'آخر تسجيل دخول لسالم نفسه. من منزله، بلا شيء سوى <strong>الرقم الطبي وتاريخ الميلاد المطبوعَين على بطاقة موعده</strong>، يفتح بوابة المريض — لا متجر تطبيقات ولا إعداد.',
    },
    enter(s) { (async () => { try { const sess = (typeof getCurrentSession === 'function') ? getCurrentSession() : null; if (sess && sess.role === 'patient') return; try { await logout(); } catch (e) {} const r = await loginPatient(s.mrn, TOUR_PATIENT.dob, ''); if (r && r.success) routeToDashboard(); } catch (e) { console.warn('[tour] portal login failed', e); } })(); },
    auto(s) { const st = tourState(); const sp = st && TOUR_STEPS[st.i]; if (sp && sp.enter) sp.enter(s); },
    target() { return null; }, done() { const sess = (typeof getCurrentSession === 'function') ? getCurrentSession() : null; return !!(sess && sess.role === 'patient'); },
  },
  { // what the patient sees
    role: null, view: 'pp-overview', mode: 'info',
    ch: { en: '🧍 The patient', ar: '🧍 المريض' },
    title: { en: 'His plan and his bill, in plain words', ar: 'خطته وفاتورته بلغة بسيطة' },
    body: {
      en: 'Salem sees his <strong>treatment plan</strong>, his <strong>clindamycin prescription</strong>, the paid invoice, and his upcoming <strong>recall</strong> — everything the clinic just did for him, on his own phone, in plain language. Transparency is part of care.<br><br>Press <strong>Next</strong> for the wrap-up.',
      ar: 'يرى سالم <strong>خطته العلاجية</strong>، و<strong>وصفة الكليندامايسين</strong>، والفاتورة المدفوعة، و<strong>موعد المراجعة</strong> القادم — كل ما فعلته العيادة له، على هاتفه، بلغة بسيطة. الشفافية جزء من الرعاية.<br><br>اضغط <strong>التالي</strong> للختام.',
    },
    target() { return '#main-content .stat-card'; }, done() { return false; },
  },
  { // finale
    role: null, view: null, mode: 'final',
    ch: { en: '🎉 Wrap-up', ar: '🎉 الختام' },
    title: { en: '🎉 One toothache. Every role. Zero paper.', ar: '🎉 ألم أسنان واحد. كل الأدوار. بلا ورق.' },
    body: {
      en: 'Walk-in → registration with a new MRN → a recorded penicillin allergy → an odontogram finding on tooth 36 → a costed treatment plan → a <strong>blocked amoxicillin</strong> → the safe clindamycin → a completed filling → checkout + a 6-month recall → the manager’s production view and <strong>tamper-evident audit</strong> → and Salem reading it all himself.<br><br><strong>Seven logins. Every role in the clinic. The safety guard live.</strong><br><br>Explore freely with the role picker — or switch it to production:',
      ar: 'دخول مباشر → تسجيل برقم طبي جديد → تسجيل حساسية البنسلين → اكتشاف على مخطط الأسنان في السن 36 → خطة علاجية بسعرها → <strong>منع الأموكسيسيلين</strong> → كليندامايسين الآمن → حشوة مكتملة → دفع وموعد مراجعة بعد ٦ أشهر → لوحة الإنتاج وسجل التدقيق المحصَّن لدى المدير → وسالم يقرأ كل ذلك بنفسه.<br><br><strong>سبعة تسجيلات دخول. كل أدوار العيادة. حاجز الأمان حيّ.</strong><br><br>استكشف بحرية من قائمة الأدوار — أو حوّله للتشغيل الفعلي:',
    },
    target() { return null; }, done() { return false; },
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
        ? 'تابع مريضاً واحداً بألم أسنان عبر العيادة كلها — من الاستقبال إلى سجل التدقيق: تسجيل، تسجيل حساسية البنسلين، تخطيط الأسنان وخطة علاجية، وصفة يرفضها النظام ثم البديل الآمن، فاتورة وموعد مراجعة، ثم مراجعة المدير، وبوابة المريض.'
        : 'Follow one toothache through the whole clinic — from the front desk to the audit log: registration, a recorded penicillin allergy, the odontogram + a costed plan, a prescription the app refuses (and the safe alternative), an invoice + recall, the manager review, and the patient portal.'}</p>
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
    : (step.ch ? (ar ? step.ch.ar : step.ch.en) : 'OpenSmile');
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
