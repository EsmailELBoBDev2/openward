// ============================================================
// HIS — Router & Dashboard Renderer
// ============================================================
//
// 📑 TABLE OF CONTENTS (run `grep -n '^// ====' js/router.js` for current line numbers)
//
//  ┌─ Routing ─────────────────────────────────────────────────────────┐
//  │   ~L10   Global Patient Search (top-header bar)                    │
//  │   ~L75   routeToDashboard / showLoginScreen                        │
//  │   ~L138  Sidebar rendering per role                                │
//  │   ~L300  navigateToDefault / navigateTo (view dispatch)            │
//  └────────────────────────────────────────────────────────────────────┘
//  ┌─ IT Admin & Hospital Manager ────────────────────────────────────┐
//  │   ~L445  IT ADMIN — User Management (Staff/Patients tabs)         │
//  │   ~L689  IT ADMIN — Departments & Settings                        │
//  │   ~L730  HM — Overview                                            │
//  │   ~L762  HM — Blackbox Viewer / Audit                             │
//  └────────────────────────────────────────────────────────────────────┘
//  ┌─ Clinical: ER, Consultant, Doctor ───────────────────────────────┐
//  │   ~L961  ER — Patient Registration (smart trigger + isolation)    │
//  │   ~L1567 ER — Active Cases                                        │
//  │   ~L1602 Consultant — Dept Patients & Case Assignment             │
//  │   ~L1689 Consultant — ROUNDING MODE (new May2026)                 │
//  │   ~L1811 Doctor — My Patients (renderDocPatients, showPatientDetail)│
//  │   ~L2016 Doctor — Write Prescription (allergy + DDI checks)       │
//  │   ~L2224 Doctor — Order Labs                                      │
//  │   ~L2467 Doctor — Consultation Notes                              │
//  │   ~L5625 Doctor — Discharge Summary (cross-dept warning)          │
//  └────────────────────────────────────────────────────────────────────┘
//  ┌─ Nursing ────────────────────────────────────────────────────────┐
//  │   ~L3180 Senior Nurse — Ward, Assign (workload card), Supply      │
//  │   ~L3360 Nurse — Patients (attention widget, MAR embed)           │
//  │   ~L5035 Triage Nurse — Pre-arrival Board (new May2026)           │
//  │   ~L7016 MAR — Medication Administration Record (high-alert wit.) │
//  │   ~L7239 Critical Lab Value Acknowledgment                        │
//  │   ~L7384 Nursing Assessments (Braden, Morse, GCS, Pain)           │
//  │   ~L7802 Fluid Balance / I&O                                      │
//  │   ~L9269 Nursing Care Plan (NANDA/NIC/NOC)                        │
//  └────────────────────────────────────────────────────────────────────┘
//  ┌─ Pharmacy & Lab ─────────────────────────────────────────────────┐
//  │   ~L4210 Pharmacist — Queue (batch verify, refuse-with-reason)    │
//  │   ~L4600 Lab Tech — Pending Samples (specimen rejection)          │
//  │   ~L2683 QR Code Scanner / ~L2783 NFC                             │
//  └────────────────────────────────────────────────────────────────────┘
//  ┌─ Cross-cutting & Other roles ────────────────────────────────────┐
//  │   ~L2850 Nosocomial (HAI) Infections                              │
//  │   ~L5275 Radiologist — Pending Imaging                            │
//  │   ~L5385 Receptionist Views                                       │
//  │   ~L5766 Bed Management                                           │
//  │   ~L5841 Appointments                                             │
//  │   ~L6017 Billing                                                  │
//  │   ~L6223 Surgical Scheduling                                      │
//  │   ~L6414 Dietary / Nutrition                                      │
//  │   ~L6701 Social Work (with discharge transport prep)              │
//  │   ~L8119 QR Wristband Print                                       │
//  │   ~L8209 CODE BLUE / Rapid Response (intervention timestamps)     │
//  │   ~L8396 Vital Signs Trend Chart                                  │
//  │   ~L8491 Patient Clinical Timeline                                │
//  │   ~L8583 Medication Reconciliation                                │
//  │   ~L8710 Patient Portal (overview/visits/labs+interp/Rx+refill/   │
//  │          messages/appointments+book)                              │
//  │   ~L9391 HM Analytics Dashboard (Chart.js)                        │
//  └────────────────────────────────────────────────────────────────────┘
//
// 🛡️ Safety helpers (in js/utils.js):
//   renderSafetyBanner()  — sticky allergies+isolation+code-status+HAI+crit-labs
//   renderPatientStory()  — one-line patient summary
//   help(termKey)         — (?) tooltip from 22-term MEDICAL_GLOSSARY
//   requireReasonToDecline() — universal alert-with-reason pattern → audit log
//
// 🔒 Schema constraints (triggers + partial unique indexes) live in js/db.js
//    migrations block. Search `CREATE TRIGGER` and `CREATE UNIQUE INDEX`.
//
// ============================================================

let currentView = null;

/**
 * After login, route to the correct dashboard based on role
 */
// ============================================================
// Global Patient Search — top-header bar, jumps to any patient
// ============================================================
// ============================================================
// Staff Notification Inbox — surfaces [→ user:X] routed messages
// (STEMI/Stroke pages, refill requests, targeted portal messages)
// ============================================================
let _inboxRefreshTimer = null;
function initStaffInbox() {
  refreshStaffInbox();
  // Refresh every 30s
  if (_inboxRefreshTimer) clearInterval(_inboxRefreshTimer);
  _inboxRefreshTimer = setInterval(refreshStaffInbox, 30000);
}

function refreshStaffInbox() {
  const session = getCurrentSession();
  if (!session) return;
  const tag = '[→ user:' + session.user_id + ']';
  const unread = dbAll(
    `SELECT msg_id, subject, body, sent_at, from_type FROM portal_messages
     WHERE subject LIKE ? AND read_at IS NULL
     ORDER BY sent_at DESC LIMIT 30`,
    ['%' + tag + '%']);
  const badge = document.getElementById('staff-inbox-badge');
  if (badge) {
    if (unread.length > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = unread.length > 9 ? '9+' : String(unread.length);
    } else {
      badge.style.display = 'none';
    }
  }
}

function toggleStaffInbox() {
  const dd = document.getElementById('staff-inbox-dropdown');
  if (!dd) return;
  if (dd.style.display === 'block') { dd.style.display = 'none'; return; }
  const lang = currentLanguage();
  const session = getCurrentSession();
  if (!session) return;
  const tag = '[→ user:' + session.user_id + ']';
  const all = dbAll(
    `SELECT msg_id, subject, body, sent_at, from_type, read_at FROM portal_messages
     WHERE subject LIKE ? ORDER BY sent_at DESC LIMIT 30`, ['%' + tag + '%']);
  if (all.length === 0) {
    dd.innerHTML = `<div style="padding:16px;color:#888;font-size:0.85rem;text-align:center;">${lang === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}</div>`;
  } else {
    dd.innerHTML = all.map(m => {
      const cleanSubj = (m.subject || '').replace(/\s*\[→ user:\d+\]\s*/, '');
      const unread = !m.read_at;
      const isSystem = m.from_type === 'system';
      return `<div onclick="markInboxRead(${m.msg_id})" style="padding:10px 14px;border-bottom:1px solid #f3f4f6;cursor:pointer;background:${unread ? '#fff5f5' : '#fff'};">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:${unread ? '700' : '500'};font-size:0.85rem;color:${isSystem && unread ? '#dc2626' : '#111'};overflow:hidden;text-overflow:ellipsis;">${unread ? '● ' : ''}${escapeHtml(cleanSubj)}</div>
            <div style="font-size:0.75rem;color:#666;margin-top:2px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${escapeHtml((m.body || '').slice(0, 200))}</div>
            <div style="font-size:0.7rem;color:#888;margin-top:4px;">${formatDateTime(m.sent_at)}</div>
          </div>
        </div>
      </div>`;
    }).join('');
  }
  dd.style.display = 'block';
}

async function markInboxRead(msgId) {
  dbRun('UPDATE portal_messages SET read_at = ? WHERE msg_id = ? AND read_at IS NULL', [nowISO(), msgId]);
  saveDBToIndexedDB();
  refreshStaffInbox();
  toggleStaffInbox(); // close
  setTimeout(toggleStaffInbox, 50); // reopen with updated state
}

let _globalSearchInited = false;
function initGlobalSearch() {
  if (_globalSearchInited) return;
  _globalSearchInited = true;
  const input = document.getElementById('global-search');
  const results = document.getElementById('global-search-results');
  if (!input || !results) return;

  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = input.value.trim();
      if (q.length < 2) { results.style.display = 'none'; results.innerHTML = ''; return; }
      const lang = currentLanguage();
      const like = '%' + q.toUpperCase() + '%';
      const matches = dbAll(`SELECT p.patient_id, p.mrn, p.full_name_ar, p.full_name_en, p.date_of_birth, p.gender,
        a.admission_id, a.bed_number, a.status as adm_status, d.name_ar as dept_ar, d.name_en as dept_en
        FROM patients p
        LEFT JOIN admissions a ON a.patient_id = p.patient_id AND a.status = 'active'
        LEFT JOIN departments d ON a.dept_id = d.dept_id
        WHERE UPPER(p.mrn) LIKE ? OR UPPER(p.full_name_ar) LIKE ? OR UPPER(p.full_name_en) LIKE ? OR UPPER(p.national_id) LIKE ?
        ORDER BY (a.admission_id IS NOT NULL) DESC, p.patient_id DESC LIMIT 10`,
        [like, like, like, like]);
      if (!matches.length) {
        results.innerHTML = `<div style="padding:12px;color:#888;font-size:0.85rem;">${lang === 'ar' ? 'لا توجد نتائج' : 'No results'}</div>`;
        results.style.display = 'block';
        return;
      }
      results.innerHTML = matches.map(p => {
        const name = lang === 'ar' ? p.full_name_ar : (p.full_name_en || p.full_name_ar);
        const action = p.admission_id ? `showPatientDetail(${p.patient_id}, ${p.admission_id});` : `alert('${lang === 'ar' ? 'لا يوجد دخول نشط' : 'No active admission'}');`;
        const statusBadge = p.adm_status === 'active'
          ? `<span class="badge badge-success" style="font-size:0.7rem;">${lang === 'ar' ? 'منوّم' : 'admitted'}</span>`
          : `<span class="badge badge-secondary" style="font-size:0.7rem;">${lang === 'ar' ? 'خارجي' : 'OPD'}</span>`;
        return `<div onclick="document.getElementById('global-search').value='';document.getElementById('global-search-results').style.display='none';${action.replace(/'/g, '&#39;')}"
          style="padding:10px 14px;border-bottom:1px solid #f3f4f6;cursor:pointer;display:flex;align-items:center;gap:10px;"
          onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:0.88rem;">${escapeHtml(name)} ${statusBadge}</div>
            <div style="font-size:0.75rem;color:#666;">${p.mrn} ${p.bed_number ? '• ' + escapeHtml(p.bed_number) : ''} ${p.dept_en ? '• ' + (lang === 'ar' ? p.dept_ar : p.dept_en) : ''}</div>
          </div>
        </div>`;
      }).join('');
      results.style.display = 'block';
    }, 180);
  });
  // Close on click outside
  document.addEventListener('click', e => {
    if (!e.target.closest('#global-search-wrap')) results.style.display = 'none';
  });
  // ESC to close
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; results.style.display = 'none'; }
  });
}

function routeToDashboard() {
  const session = getCurrentSession();
  if (!session) {
    showLoginScreen();
    return;
  }

  const lang = currentLanguage();
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-layout').classList.add('active');

  // Patient session handling
  if (session.role === 'patient') {
    const patient = getCurrentPatient();
    if (!patient) {
      showLoginScreen();
      return;
    }
    document.getElementById('header-user-name').textContent = lang === 'ar'
      ? patient.full_name_ar
      : (patient.full_name_en || patient.full_name_ar);
    document.getElementById('header-user-role').textContent = lang === 'ar'
      ? 'بوابة المرضى'
      : 'Patient Portal';
    renderSidebar('patient');
    navigateToDefault('patient');
    // Hide Code Blue FAB, global search, and staff inbox for patients
    const fab = document.getElementById('code-blue-fab');
    if (fab) fab.style.display = 'none';
    const gs = document.getElementById('global-search-wrap');
    if (gs) gs.style.display = 'none';
    const ib = document.getElementById('staff-inbox-wrap');
    if (ib) ib.style.display = 'none';
    return;
  }

  // Show + wire global search + notification inbox for staff
  const gsWrap = document.getElementById('global-search-wrap');
  if (gsWrap) {
    gsWrap.style.display = 'block';
    initGlobalSearch();
  }
  const ibWrap = document.getElementById('staff-inbox-wrap');
  if (ibWrap) {
    ibWrap.style.display = 'block';
    initStaffInbox();
  }

  // Staff session
  const user = getCurrentUser();
  if (!user) {
    showLoginScreen();
    return;
  }
  document.getElementById('header-user-name').textContent = lang === 'ar' ? user.full_name_ar : user.full_name_en;
  document.getElementById('header-user-role').textContent = ROLES[user.role] ? ROLES[user.role][lang] : user.role;

  renderSidebar(session.role);
  navigateToDefault(session.role);
  // Show Code Blue FAB for clinical roles
  const clinicalRoles = ['doctor','consultant','emergency_doctor','nurse','senior_nurse'];
  if (clinicalRoles.includes(session.role)) showCodeBlueButton();
  // Show calculators FAB for clinical + pharmacist
  if (typeof showCalculatorsButton === 'function') showCalculatorsButton();
  // Show first-time welcome tour for new users
  if (typeof maybeShowWelcomeTour === 'function') setTimeout(maybeShowWelcomeTour, 800);
}

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-layout').classList.remove('active');
}

// ============================================================
// Sidebar rendering per role
// ============================================================

function renderSidebar(role) {
  const lang = currentLanguage();
  const nav = document.getElementById('sidebar-nav');
  let items = [];

  switch (role) {
    case 'it_admin':
      items = [
        { id: 'it-users',     icon: '&#128101;', label: t('user_management') },
        { id: 'it-depts',     icon: '&#127970;', label: t('dept_setup') },
        { id: 'it-settings',  icon: '&#9881;',   label: t('system_settings') },
      ];
      break;
    case 'hospital_manager':
      // Stripped: hm-analytics + hm-reports merged into hm-overview (was 6 items, now 4).
      // Reason: managers want a single dashboard, not 3 separate views with overlapping info.
      items = [
        { id: 'hm-overview',  icon: '&#128202;', label: t('overview') },
        { id: 'hm-beds',      icon: '&#127916;', label: t('hm_beds') },
        { id: 'hm-blackbox',  icon: '&#128274;', label: t('blackbox_viewer') },
      ];
      break;
    case 'consultant': {
      items = [
        { id: 'con-patients', icon: '&#128101;', label: t('my_dept_patients') },
        { id: 'con-rounds',   icon: '&#127973;', label: lang === 'ar' ? 'وضع الجولة' : 'Rounding Mode' },  // NEW
        { id: 'con-assign',   icon: '&#128203;', label: t('case_assignment') },
        { id: 'con-staff',    icon: '&#128100;', label: t('staff_overview') },
      ];
      const conUser = getCurrentUser();
      if (conUser && conUser.department_id === 3) {
        items.splice(1, 0, { id: 'con-surgical', icon: '&#129656;', label: t('surgical_schedule') });
      }
      break;
    }
    case 'doctor': {
      // Stripped: doc-rx and doc-labs removed from sidebar.
      // Reason: writing Rx / ordering labs without patient context is the WRONG mental model
      // and removes our allergy/DDI safety checks. Doctors should always click patient → action.
      items = [
        { id: 'doc-patients',      icon: '&#128101;', label: t('my_patients') },
        { id: 'doc-appointments',  icon: '&#128197;', label: t('doc_appointments') },
        { id: 'doc-consult',       icon: '&#128203;', label: t('my_consultations') },
        { id: 'doc-discharge',     icon: '&#128196;', label: lang === 'ar' ? 'ملخص التخريج' : 'Discharge Summary' },
      ];
      const docUser = getCurrentUser();
      if (docUser && docUser.department_id === 3) {
        items.splice(1, 0, { id: 'doc-surgical', icon: '&#129656;', label: t('surgical_schedule') });
      }
      break;
    }
    case 'emergency_doctor':
      items = [
        { id: 'er-register',  icon: '&#10133;',  label: t('register_patient') },
        { id: 'er-cases',     icon: '&#128101;', label: t('active_cases') },
      ];
      break;
    case 'triage_nurse':
      // NEW role (was missing — Maria persona had no home before)
      items = [
        { id: 'tn-arrivals', icon: '&#128657;', label: lang === 'ar' ? 'الوصول والفرز' : 'Arrivals & Triage' },
        { id: 'tn-register', icon: '&#10133;',  label: t('register_patient') },
        { id: 'tn-queue',    icon: '&#128101;', label: lang === 'ar' ? 'قائمة الانتظار' : 'Waiting Queue' },
      ];
      break;
    case 'senior_nurse':
      // Stripped: sn-beds removed (bed view is admin-level, fits hospital manager).
      // Senior nurse cares about THEIR ward — sn-ward shows beds in their dept already.
      items = [
        { id: 'sn-ward',    icon: '&#127973;', label: t('ward_overview') },
        { id: 'sn-assign',  icon: '&#128203;', label: t('nurse_assignment') },
        { id: 'sn-supply',  icon: '&#128230;', label: t('supply_stock') },
      ];
      break;
    case 'nurse':
      items = [
        { id: 'nr-patients',    icon: '&#128101;', label: t('my_patients') },
        { id: 'nr-tasks',       icon: '&#9745;',   label: t('my_tasks') },
        { id: 'nr-mar',         icon: '&#128138;', label: t('mar_title') },
        { id: 'nr-assessments', icon: '&#128203;', label: t('assessments_title') },
        { id: 'nr-fluids',      icon: '&#128167;', label: t('fluid_balance_title') },
        { id: 'nr-shift',       icon: '&#128340;', label: t('end_of_shift') },
      ];
      break;
    case 'pharmacist': {
      const unverifiedCount = dbGet(`SELECT COUNT(*) as c FROM prescriptions WHERE status='active' AND verified_at IS NULL`);
      const uvc = unverifiedCount ? unverifiedCount.c : 0;
      items = [
        { id: 'ph-queue',     icon: '&#128203;', label: t('prescription_queue') + (uvc > 0 ? ` <span class="sidebar-badge">${uvc}</span>` : '') },
        { id: 'ph-inventory', icon: '&#128230;', label: t('drug_inventory') },
        { id: 'ph-receive',   icon: '&#128229;', label: t('receive_stock') },
        { id: 'ph-log',       icon: '&#128196;', label: t('dispensing_log') },
      ];
      break;
    }
    case 'lab_technician':
      items = [
        { id: 'lt-pending',   icon: '&#128300;', label: t('lab_pending_samples') },
        { id: 'lt-results',   icon: '&#128203;', label: t('lab_results_entry') },
        { id: 'lt-history',   icon: '&#128196;', label: t('lab_history') },
      ];
      break;
    case 'radiologist':
      items = [
        { id: 'rad-pending',  icon: '&#128225;', label: t('rad_pending') },
        { id: 'rad-results',  icon: '&#128203;', label: t('rad_results') },
      ];
      break;
    case 'receptionist':
      items = [
        { id: 'rcp-queue',        icon: '&#128101;', label: t('rcp_queue') },
        { id: 'rcp-register',     icon: '&#10133;',  label: t('rcp_register') },
        { id: 'rcp-appointments', icon: '&#128197;', label: t('rcp_appointments') },
        { id: 'rcp-billing',      icon: '&#128181;', label: t('rcp_billing') },
      ];
      break;
    case 'dietitian':
      items = [
        { id: 'dt-orders',      icon: '&#127858;', label: t('diet_orders') },
        { id: 'dt-meals',       icon: '&#127869;', label: t('meal_tracking') },
        { id: 'dt-assessments', icon: '&#128203;', label: t('nutrition_assessment') },
      ];
      break;
    case 'social_worker':
      items = [
        { id: 'sw-cases',     icon: '&#128101;', label: t('sw_cases') },
        { id: 'sw-new',       icon: '&#10133;',  label: t('sw_new_case') },
        { id: 'sw-discharge', icon: '&#128196;', label: t('sw_discharge_plan') },
      ];
      break;
    case 'patient': {
      // Patient portal — patient sees only their OWN data
      const patient = getCurrentPatient();
      let unreadMsgs = 0;
      if (patient) {
        const r = dbGet(
          `SELECT COUNT(*) as c FROM portal_messages WHERE patient_id = ? AND from_type='staff' AND read_at IS NULL`,
          [patient.patient_id]
        );
        unreadMsgs = r ? r.c : 0;
      }
      items = [
        { id: 'pp-overview',     icon: '&#127968;', label: t('pp_overview') },
        { id: 'pp-visits',       icon: '&#128196;', label: t('pp_visits') },
        { id: 'pp-labs',         icon: '&#128300;', label: t('pp_labs') },
        { id: 'pp-prescriptions',icon: '&#128138;', label: t('pp_prescriptions') },
        { id: 'pp-appointments', icon: '&#128197;', label: t('pp_appointments') },
        { id: 'pp-messages',     icon: '&#128172;', label: t('pp_messages') + (unreadMsgs > 0 ? ` <span class="sidebar-badge">${unreadMsgs}</span>` : '') },
      ];
      break;
    }
  }

  nav.innerHTML = items.map(item => {
    // Labels may contain trusted HTML (e.g. sidebar-badge span) — split on first <
    const labelHtml = item.label.includes('<')
      ? escapeHtml(item.label.split('<')[0]) + '<' + item.label.split('<').slice(1).join('<')
      : escapeHtml(item.label);
    return `<li><button class="nav-btn" data-view="${item.id}" onclick="navigateTo('${item.id}')">
      <span class="nav-icon">${item.icon}</span> ${labelHtml}
    </button></li>`;
  }).join('');
}

function navigateToDefault(role) {
  const defaults = {
    it_admin:         'it-users',
    hospital_manager: 'hm-overview',
    consultant:       'con-patients',
    doctor:           'doc-patients',
    emergency_doctor: 'er-register',
    triage_nurse:     'tn-arrivals',
    senior_nurse:     'sn-ward',
    nurse:            'nr-patients',
    pharmacist:       'ph-queue',
    lab_technician:   'lt-pending',
    radiologist:      'rad-pending',
    receptionist:     'rcp-queue',
    dietitian:        'dt-orders',
    social_worker:    'sw-cases',
    patient:          'pp-overview',
  };
  navigateTo(defaults[role] || 'it-users');
}

function navigateTo(viewId) {
  currentView = viewId;
  // Update active nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });

  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="text-center mt-3"><div class="spinner"></div></div>';

  // Close sidebar on mobile
  document.getElementById('app-sidebar').classList.remove('open');

  // Render view
  setTimeout(() => renderView(viewId), 50);
}

function renderView(viewId) {
  const main = document.getElementById('main-content');
  const lang = currentLanguage();

  switch (viewId) {
    // ---- IT Admin ----
    case 'it-users':    renderITUsers(main, lang); break;
    case 'it-depts':    renderITDepts(main, lang); break;
    case 'it-settings': renderITSettings(main, lang); break;

    // ---- Hospital Manager ----
    case 'hm-overview':  renderHMOverview(main, lang); break;
    case 'hm-analytics': renderHMAnalytics(main, lang); break;
    case 'hm-beds':      renderBedMap(main, lang); break;
    case 'hm-or':        renderSurgicalSchedule(main, lang, true); break;
    case 'hm-blackbox':  renderHMBlackbox(main, lang); break;
    case 'hm-reports':   renderHMReports(main, lang); break;

    // ---- Consultant ----
    case 'con-patients': renderConPatients(main, lang); break;
    case 'con-rounds':   renderConRounds(main, lang); break;  // NEW: scrollable rounding view
    case 'con-assign':   renderConAssign(main, lang); break;
    case 'con-staff':    renderConStaff(main, lang); break;

    // ---- Doctor ----
    case 'doc-patients':     renderDocPatients(main, lang); break;
    case 'doc-appointments': renderDocAppointments(main, lang); break;
    case 'doc-rx':           renderDocRx(main, lang); break;
    case 'doc-labs':         renderDocLabs(main, lang); break;
    case 'doc-consult':      renderDocConsult(main, lang); break;
    case 'doc-discharge': renderDocDischarge(main, lang); break;

    // ---- Emergency Doctor ----
    case 'er-register':  renderERRegister(main, lang); break;
    case 'er-cases':     renderERCases(main, lang); break;

    // Triage nurse (NEW role)
    case 'tn-arrivals':  renderTNArrivals(main, lang); break;
    case 'tn-register':  renderERRegister(main, lang); break;  // reuse ER register form
    case 'tn-queue':     renderTNQueue(main, lang); break;

    // ---- Senior Nurse ----
    case 'sn-ward':   renderSNWard(main, lang); break;
    case 'sn-beds':   renderBedManagement(main, lang); break;
    case 'sn-assign': renderSNAssign(main, lang); break;
    case 'sn-supply': renderSNSupply(main, lang); break;

    // ---- Nurse ----
    case 'nr-patients':    renderNRPatients(main, lang); break;
    case 'nr-tasks':       renderNRTasks(main, lang); break;
    case 'nr-mar':         renderNRMAR(main, lang); break;
    case 'nr-assessments': renderNRAssessments(main, lang); break;
    case 'nr-fluids':      renderNRFluids(main, lang); break;
    case 'nr-shift':       renderNRShift(main, lang); break;

    // ---- Pharmacist ----
    case 'ph-queue':     renderPHQueue(main, lang); break;
    case 'ph-inventory': renderPHInventory(main, lang); break;
    case 'ph-receive':   renderPHReceive(main, lang); break;
    case 'ph-log':       renderPHLog(main, lang); break;

    // ---- Lab Technician ----
    case 'lt-pending':  renderLTPending(main, lang); break;
    case 'lt-results':  renderLTResults(main, lang); break;
    case 'lt-history':  renderLTHistory(main, lang); break;

    // ---- Radiologist ----
    case 'rad-pending': renderRadPending(main, lang); break;
    case 'rad-results': renderRadResults(main, lang); break;

    // ---- Receptionist ----
    case 'rcp-queue':        renderRCPQueue(main, lang); break;
    case 'rcp-register':     renderRCPRegister(main, lang); break;
    case 'rcp-appointments': renderRCPAppointments(main, lang); break;
    case 'rcp-billing':      renderRCPBilling(main, lang); break;

    // ---- Surgical ----
    case 'doc-surgical':
    case 'con-surgical': renderSurgicalSchedule(main, lang, false); break;

    // ---- Dietitian ----
    case 'dt-orders':      renderDTOrders(main, lang); break;
    case 'dt-meals':       renderDTMeals(main, lang); break;
    case 'dt-assessments': renderDTAssessments(main, lang); break;

    // ---- Social Worker ----
    case 'sw-cases':     renderSWCases(main, lang); break;
    case 'sw-new':       renderSWNew(main, lang); break;
    case 'sw-discharge': renderSWDischarge(main, lang); break;

    // ---- Patient Portal ----
    case 'pp-overview':      renderPPOverview(main, lang); break;
    case 'pp-visits':        renderPPVisits(main, lang); break;
    case 'pp-labs':          renderPPLabs(main, lang); break;
    case 'pp-prescriptions': renderPPPrescriptions(main, lang); break;
    case 'pp-appointments':  renderPPAppointments(main, lang); break;
    case 'pp-messages':      renderPPMessages(main, lang); break;

    default:
      main.innerHTML = `<div class="empty-state"><div class="empty-icon">&#128679;</div><p>${t('loading')}</p></div>`;
  }
}

// ============================================================
// IT ADMIN — User Management
// ============================================================

function renderITUsers(main, lang, activeTab) {
  activeTab = activeTab || 'staff';
  const users = dbAll('SELECT u.*, d.name_en as dept_name_en, d.name_ar as dept_name_ar FROM users u LEFT JOIN departments d ON u.department_id = d.dept_id ORDER BY u.user_id');
  const patients = dbAll('SELECT patient_id, mrn, full_name_ar, full_name_en, date_of_birth, gender, phone, portal_enabled, registered_at FROM patients ORDER BY patient_id DESC');
  const totalUsers = users.length;
  const activeSessions = getActiveSessionsCount();

  const staffTab   = activeTab === 'staff'   ? 'tab-active' : '';
  const patientTab = activeTab === 'patients' ? 'tab-active' : '';

  main.innerHTML = `
    <div class="page-header">
      <h1>${t('user_management')}</h1>
      ${activeTab === 'staff' ? `<button class="btn btn-primary" onclick="showAddUserForm()">${t('add_user')}</button>` : ''}
    </div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">${totalUsers}</div><div class="stat-label">${t('total_users')}</div></div>
      <div class="stat-card"><div class="stat-value">${activeSessions}</div><div class="stat-label">${t('active_sessions')}</div></div>
      <div class="stat-card"><div class="stat-value">${patients.length}</div><div class="stat-label">${lang === 'ar' ? 'إجمالي المرضى' : 'Total Patients'}</div></div>
      <div class="stat-card"><div class="stat-value">${patients.filter(p => p.portal_enabled).length}</div><div class="stat-label">${lang === 'ar' ? 'بوابة مفعّلة' : 'Portal Enabled'}</div></div>
    </div>
    <div id="user-form-container"></div>
    <div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:16px;">
      <button class="tab-btn ${staffTab}" onclick="renderITUsers(document.getElementById('main-content'), currentLanguage(), 'staff')"
        style="padding:10px 20px;border:none;background:none;cursor:pointer;font-weight:600;border-bottom:${activeTab==='staff'?'2px solid var(--primary)':'none'};color:${activeTab==='staff'?'var(--primary)':'var(--text-secondary)'};">
        &#128101; ${t('hospital_staff')}
      </button>
      <button class="tab-btn ${patientTab}" onclick="renderITUsers(document.getElementById('main-content'), currentLanguage(), 'patients')"
        style="padding:10px 20px;border:none;background:none;cursor:pointer;font-weight:600;border-bottom:${activeTab==='patients'?'2px solid var(--primary)':'none'};color:${activeTab==='patients'?'var(--primary)':'var(--text-secondary)'};">
        &#128116; ${t('patient_accounts')}
      </button>
    </div>

    ${activeTab === 'staff' ? `
    <div class="table-container">
      <table>
        <thead><tr>
          <th>#</th>
          <th>${t('username_label')}</th>
          <th>${t('full_name_ar')}</th>
          <th>${t('full_name_en')}</th>
          <th>${t('role_label')}</th>
          <th>${t('department')}</th>
          <th>${t('status')}</th>
          <th>${t('actions')}</th>
        </tr></thead>
        <tbody>
          ${users.map(u => `<tr>
            <td>${u.user_id}</td>
            <td>${escapeHtml(u.username)}</td>
            <td>${escapeHtml(u.full_name_ar)}</td>
            <td>${escapeHtml(u.full_name_en)}</td>
            <td>${ROLES[u.role] ? ROLES[u.role][lang] : u.role}</td>
            <td>${lang === 'ar' ? (u.dept_name_ar || '—') : (u.dept_name_en || '—')}</td>
            <td><span class="badge ${u.is_active ? 'badge-success' : 'badge-danger'}">${u.is_active ? t('active') : t('inactive')}</span></td>
            <td>
              <button class="btn btn-sm btn-secondary" onclick="showEditUserForm(${u.user_id})">${t('edit_btn')}</button>
              <button class="btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-success'}" onclick="handleToggleUser(${u.user_id})">${u.is_active ? t('disable_btn') : t('enable_btn')}</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : `
    <div class="table-container">
      <table>
        <thead><tr>
          <th>${t('mrn')}</th>
          <th>${t('full_name_ar')}</th>
          <th>${t('full_name_en')}</th>
          <th>${t('date_of_birth')}</th>
          <th>${t('phone')}</th>
          <th>${t('portal_status')}</th>
          <th>${t('actions')}</th>
        </tr></thead>
        <tbody>
          ${patients.map(p => `<tr>
            <td><span style="font-family:monospace;font-size:0.8rem;">${escapeHtml(p.mrn)}</span></td>
            <td>${escapeHtml(p.full_name_ar)}</td>
            <td>${escapeHtml(p.full_name_en || '—')}</td>
            <td>${p.date_of_birth || '—'}</td>
            <td>${escapeHtml(p.phone || '—')}</td>
            <td><span class="badge ${p.portal_enabled ? 'badge-success' : 'badge-secondary'}">${p.portal_enabled ? t('portal_enabled_lbl') : t('portal_disabled_lbl')}</span></td>
            <td>
              <button class="btn btn-sm ${p.portal_enabled ? 'btn-danger' : 'btn-success'}" onclick="handleTogglePatientPortal(${p.patient_id})">
                ${p.portal_enabled ? (lang === 'ar' ? 'إيقاف البوابة' : 'Disable Portal') : (lang === 'ar' ? 'تفعيل البوابة' : 'Enable Portal')}
              </button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}

async function handleTogglePatientPortal(patientId) {
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  if (!patient) return;
  const newStatus = patient.portal_enabled ? 0 : 1;
  dbRun('UPDATE patients SET portal_enabled = ? WHERE patient_id = ?', [newStatus, patientId]);
  const lang = currentLanguage();
  await logAction('PORTAL_TOGGLED',
    `IT Admin toggled portal for patient ${patient.full_name_en || patient.full_name_ar} (MRN: ${patient.mrn}) → ${newStatus ? 'enabled' : 'disabled'}`,
    null, patientId, patient.full_name_ar, patient.mrn
  );
  saveDBToIndexedDB();
  renderITUsers(document.getElementById('main-content'), lang, 'patients');
}

function showAddUserForm() {
  const lang = currentLanguage();
  const depts = dbAll('SELECT * FROM departments ORDER BY dept_id');
  const container = document.getElementById('user-form-container');

  const deptOptions = depts.map(d => `<option value="${d.dept_id}">${lang === 'ar' ? escapeHtml(d.name_ar) : escapeHtml(d.name_en)}</option>`).join('');
  const roleOptions = Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v[lang]}</option>`).join('');

  container.innerHTML = `
    <div class="card mb-3">
      <div class="card-header"><h3>${t('add_user')}</h3></div>
      <form id="add-user-form" onsubmit="handleAddUser(event)">
        <div class="form-row">
          <div class="form-group"><label>${t('username_label')} *</label><input type="text" id="new-username" required minlength="3"></div>
          <div class="form-group"><label>${t('password_new')} *</label><input type="password" id="new-password" required minlength="6"></div>
          <div class="form-group"><label>${t('password_confirm')} *</label><input type="password" id="new-password-confirm" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('full_name_ar')} *</label><input type="text" id="new-name-ar" required dir="rtl"></div>
          <div class="form-group"><label>${t('full_name_en')} *</label><input type="text" id="new-name-en" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('role_label')} *</label><select id="new-role" required><option value="">${t('select_role')}</option>${roleOptions}</select></div>
          <div class="form-group"><label>${t('department')}</label><select id="new-dept"><option value="">—</option>${deptOptions}</select></div>
          <div class="form-group"><label>${t('specialization')}</label><input type="text" id="new-spec"></div>
        </div>
        <div class="flex gap-1">
          <button type="submit" class="btn btn-primary">${t('save_btn')}</button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('user-form-container').innerHTML=''">${t('cancel_btn')}</button>
        </div>
      </form>
    </div>
  `;
}

async function handleAddUser(e) {
  e.preventDefault();
  const pw = document.getElementById('new-password').value;
  const pwc = document.getElementById('new-password-confirm').value;
  if (pw !== pwc) { showError(t('password_mismatch')); return; }
  if (pw.length < 6) { showError(t('password_min')); return; }

  const result = await createUser({
    username: document.getElementById('new-username').value.trim(),
    password: pw,
    full_name_ar: document.getElementById('new-name-ar').value.trim(),
    full_name_en: document.getElementById('new-name-en').value.trim(),
    role: document.getElementById('new-role').value,
    department_id: document.getElementById('new-dept').value || null,
    specialization: document.getElementById('new-spec').value.trim() || null,
  });

  if (result.success) {
    showSuccess(t('user_created_success', { name: document.getElementById('new-name-en').value }));
    navigateTo('it-users');
  } else {
    showError(t(result.errorKey || 'error_generic'));
  }
}

function showEditUserForm(userId) {
  const user = dbGet('SELECT * FROM users WHERE user_id = ?', [userId]);
  if (!user) return;

  const lang = currentLanguage();
  const depts = dbAll('SELECT * FROM departments ORDER BY dept_id');
  const container = document.getElementById('user-form-container');

  const deptOptions = depts.map(d => `<option value="${d.dept_id}" ${d.dept_id === user.department_id ? 'selected' : ''}>${lang === 'ar' ? escapeHtml(d.name_ar) : escapeHtml(d.name_en)}</option>`).join('');
  const roleOptions = Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === user.role ? 'selected' : ''}>${v[lang]}</option>`).join('');

  container.innerHTML = `
    <div class="card mb-3">
      <div class="card-header"><h3>${t('edit_user')}: ${escapeHtml(user.full_name_en)}</h3></div>
      <form id="edit-user-form" onsubmit="handleEditUser(event, ${userId})">
        <div class="form-row">
          <div class="form-group"><label>${t('username_label')} *</label><input type="text" id="edit-username" value="${escapeHtml(user.username)}" required></div>
          <div class="form-group"><label>${t('password_new')} (${lang === 'ar' ? 'اتركه فارغاً لعدم التغيير' : 'leave blank to keep'})</label><input type="password" id="edit-password"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('full_name_ar')} *</label><input type="text" id="edit-name-ar" value="${escapeHtml(user.full_name_ar)}" required dir="rtl"></div>
          <div class="form-group"><label>${t('full_name_en')} *</label><input type="text" id="edit-name-en" value="${escapeHtml(user.full_name_en)}" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('role_label')} *</label><select id="edit-role" required>${roleOptions}</select></div>
          <div class="form-group"><label>${t('department')}</label><select id="edit-dept"><option value="">—</option>${deptOptions}</select></div>
          <div class="form-group"><label>${t('specialization')}</label><input type="text" id="edit-spec" value="${escapeHtml(user.specialization || '')}"></div>
        </div>
        <div class="flex gap-1">
          <button type="submit" class="btn btn-primary">${t('save_btn')}</button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('user-form-container').innerHTML=''">${t('cancel_btn')}</button>
        </div>
      </form>
    </div>
  `;
}

async function handleEditUser(e, userId) {
  e.preventDefault();
  const pw = document.getElementById('edit-password').value;

  const result = await updateUser(userId, {
    username: document.getElementById('edit-username').value.trim(),
    password: pw || null,
    full_name_ar: document.getElementById('edit-name-ar').value.trim(),
    full_name_en: document.getElementById('edit-name-en').value.trim(),
    role: document.getElementById('edit-role').value,
    department_id: document.getElementById('edit-dept').value || null,
    specialization: document.getElementById('edit-spec').value.trim() || null,
  });

  if (result.success) {
    showSuccess(t('user_updated_success', { name: document.getElementById('edit-name-en').value }));
    navigateTo('it-users');
  } else {
    showError(t(result.errorKey || 'error_generic'));
  }
}

function handleToggleUser(userId) {
  const user = dbGet('SELECT * FROM users WHERE user_id = ?', [userId]);
  if (!user) return;
  const lang = currentLanguage();
  const name = lang === 'ar' ? user.full_name_ar : user.full_name_en;
  const msg = user.is_active ? t('confirm_disable_user', { name }) : t('confirm_enable_user', { name });
  showConfirm(msg, async () => {
    await toggleUserActive(userId);
    showSuccess(t('success_updated'));
    navigateTo('it-users');
  });
}

// ============================================================
// IT ADMIN — Departments & Settings
// ============================================================

function renderITDepts(main, lang) {
  const depts = dbAll('SELECT * FROM departments ORDER BY dept_id');
  main.innerHTML = `
    <div class="page-header"><h1>${t('dept_setup')}</h1></div>
    <div class="table-container">
      <table>
        <thead><tr><th>#</th><th>${lang === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}</th><th>${lang === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'}</th><th>${lang === 'ar' ? 'النوع' : 'Type'}</th></tr></thead>
        <tbody>${depts.map(d => `<tr><td>${d.dept_id}</td><td>${escapeHtml(d.name_ar)}</td><td>${escapeHtml(d.name_en)}</td><td><span class="badge badge-info">${d.type}</span></td></tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderITSettings(main, lang) {
  const ar = lang === 'ar';
  const encOn = (typeof encIsActive === 'function') && encIsActive();
  main.innerHTML = `
    <div class="page-header"><h1>${t('system_settings')}</h1></div>
    <div class="card">
      <div class="form-section">
        <h3>${ar ? 'النسخ الاحتياطي' : 'Database Backup'}</h3>
        <p class="mb-2">${ar ? 'تحميل نسخة احتياطية من قاعدة البيانات أو استعادة واحدة سابقة.' : 'Download a backup of the database or restore a previous one.'}</p>
        <div class="flex gap-1 flex-wrap">
          <button class="btn btn-primary" onclick="downloadBackup()">${t('download_backup')}</button>
          <label class="btn btn-secondary" style="cursor:pointer">${t('restore_backup')} <input type="file" accept=".sqlite,.db" style="display:none" onchange="handleRestore(this.files[0])"></label>
        </div>
        <p style="font-size:0.8rem;color:#888;margin-top:8px">${ar ? 'ملاحظة: ملف النسخة الاحتياطية المُنزّل غير مشفّر.' : 'Note: the downloaded backup file itself is not encrypted.'}</p>
      </div>
    </div>
    <div class="card">
      <div class="form-section">
        <h3>🔒 ${ar ? 'تشفير بيانات هذا الجهاز' : 'Encryption at rest'}</h3>
        <p class="mb-2">${ar
          ? 'تشفير قاعدة البيانات المحفوظة في هذا المتصفّح بكلمة مرور، فلا تُقرأ إذا سُرق الجهاز أو نُسخ الملف.'
          : 'Encrypt the database stored in this browser with a passphrase, so it is unreadable if the device is stolen or the file is copied.'}</p>
        <div style="display:inline-block;padding:8px 14px;border-radius:8px;font-weight:700;margin-bottom:12px;background:${encOn ? '#e7f7ed' : '#fdecec'};color:${encOn ? '#137333' : '#a50e0e'}">
          ${encOn ? (ar ? 'الحالة: مُفعّل ✓' : 'Status: ON ✓') : (ar ? 'الحالة: غير مُفعّل' : 'Status: OFF')}
        </div>
        <div>
          <button class="btn ${encOn ? 'btn-secondary' : 'btn-primary'}" onclick="toggleDeviceEncryption()">
            ${encOn ? (ar ? 'إيقاف التشفير' : 'Disable encryption') : (ar ? 'تفعيل التشفير' : 'Enable encryption')}
          </button>
        </div>
        <p style="font-size:0.8rem;color:#888;margin-top:12px;line-height:1.5">
          ${ar
            ? '⚠️ يحمي البيانات عند التخزين فقط، لا يحمي جلسة مفتوحة بالفعل (DevTools). لا يمكن استعادة كلمة المرور إذا نُسيت — ستحتاج إلى مسح بيانات الجهاز.'
            : '⚠️ Protects data at rest only — not an already-unlocked session (DevTools). A forgotten passphrase cannot be recovered; you would have to erase this device\'s data.'}
        </p>
      </div>
    </div>
  `;
}

async function handleRestore(file) {
  if (!file) return;
  showConfirm(currentLanguage() === 'ar' ? 'هل أنت متأكد من استعادة النسخة الاحتياطية؟ سيتم استبدال البيانات الحالية.' : 'Are you sure you want to restore this backup? Current data will be replaced.', async () => {
    await restoreBackup(file);
    location.reload();
  });
}

// ============================================================
// HOSPITAL MANAGER — Overview
// ============================================================

function renderHMOverview(main, lang) {
  const totalPatients = dbGet('SELECT COUNT(*) as cnt FROM admissions WHERE status = ?', ['active']);
  const totalStaff = dbGet('SELECT COUNT(*) as cnt FROM users WHERE is_active = 1');
  const totalAlerts = dbGet("SELECT COUNT(*) as cnt FROM audit_log WHERE action_type LIKE '%ALERT%'");

  const deptStats = dbAll(`SELECT d.name_ar, d.name_en, COUNT(a.admission_id) as cnt
    FROM departments d LEFT JOIN admissions a ON d.dept_id = a.dept_id AND a.status = 'active'
    WHERE d.type = 'clinical' GROUP BY d.dept_id ORDER BY d.dept_id`);

  main.innerHTML = `
    <div class="page-header"><h1>${t('overview')}</h1></div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">${totalPatients ? totalPatients.cnt : 0}</div><div class="stat-label">${t('total_admitted')}</div></div>
      <div class="stat-card"><div class="stat-value">${totalStaff ? totalStaff.cnt : 0}</div><div class="stat-label">${t('active_staff')}</div></div>
      <div class="stat-card"><div class="stat-value">${totalAlerts ? totalAlerts.cnt : 0}</div><div class="stat-label">${t('alerts_count')}</div></div>
    </div>
    <div class="card">
      <div class="card-header"><h3>${lang === 'ar' ? 'المرضى حسب القسم' : 'Patients by Department'}</h3></div>
      <div class="table-container">
        <table>
          <thead><tr><th>${t('department')}</th><th>${t('total_admitted')}</th></tr></thead>
          <tbody>${deptStats.map(d => `<tr><td>${lang === 'ar' ? d.name_ar : d.name_en}</td><td>${d.cnt}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================================
// HOSPITAL MANAGER — Blackbox Viewer
// ============================================================

function renderHMBlackbox(main, lang) {
  // Log that manager opened the blackbox
  logAction('BLACKBOX_VIEWED', `Hospital Manager ${getCurrentUser().full_name_en} opened Blackbox Audit Log. Filter applied: none`, `مدير المستشفى ${getCurrentUser().full_name_ar} فتح سجل المراجعة`);

  const users = dbAll('SELECT DISTINCT user_id, user_name_en, user_name_ar FROM audit_log ORDER BY user_name_en');
  const depts = dbAll('SELECT * FROM departments ORDER BY dept_id');
  const actionTypes = dbAll('SELECT DISTINCT action_type FROM audit_log ORDER BY action_type');

  main.innerHTML = `
    <div class="page-header"><h1>${t('blackbox_viewer')}</h1></div>
    <div class="card mb-3">
      <div class="form-row">
        <div class="form-group"><label>${t('filter_by_date')} (${lang === 'ar' ? 'من' : 'From'})</label><input type="date" id="bb-date-from"></div>
        <div class="form-group"><label>${t('filter_by_date')} (${lang === 'ar' ? 'إلى' : 'To'})</label><input type="date" id="bb-date-to"></div>
        <div class="form-group"><label>${t('filter_by_user')}</label><select id="bb-user"><option value="">—</option>${users.map(u => `<option value="${u.user_id}">${lang === 'ar' ? escapeHtml(u.user_name_ar) : escapeHtml(u.user_name_en)}</option>`).join('')}</select></div>
        <div class="form-group"><label>${t('filter_by_dept')}</label><select id="bb-dept"><option value="">—</option>${depts.map(d => `<option value="${d.dept_id}">${lang === 'ar' ? escapeHtml(d.name_ar) : escapeHtml(d.name_en)}</option>`).join('')}</select></div>
        <div class="form-group"><label>${t('filter_by_action')}</label><select id="bb-action"><option value="">—</option>${actionTypes.map(a => `<option value="${a.action_type}">${a.action_type}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('search_btn')}</label><input type="search" id="bb-search" placeholder="${lang === 'ar' ? 'بحث في التفاصيل...' : 'Search details...'}"></div>
      </div>
      <div class="flex gap-1">
        <button class="btn btn-primary" onclick="applyBlackboxFilter()">${t('filter_btn')}</button>
        <button class="btn btn-secondary" onclick="clearBlackboxFilter()">${t('clear_btn')}</button>
        <button class="btn btn-info" onclick="verifyBlackbox()">${lang === 'ar' ? 'تحقق من السلامة' : 'Verify Integrity'}</button>
      </div>
    </div>
    <div id="bb-integrity-result"></div>
    <div id="bb-results"></div>
  `;

  applyBlackboxFilter();
}

function applyBlackboxFilter() {
  const lang = currentLanguage();
  // Defensive: if not on the blackbox page, just return
  const dateFromEl = document.getElementById('bb-date-from');
  const resultsEl = document.getElementById('bb-results');
  if (!dateFromEl || !resultsEl) return;
  const val = id => { const el = document.getElementById(id); return el ? (el.value || undefined) : undefined; };
  const filters = {
    dateFrom:   val('bb-date-from'),
    dateTo:     val('bb-date-to'),
    userId:     val('bb-user'),
    deptId:     val('bb-dept'),
    actionType: val('bb-action'),
    search:     val('bb-search'),
    limit: 100,
  };

  const rows = queryBlackbox(filters);
  const total = queryBlackboxCount(filters);

  document.getElementById('bb-results').innerHTML = `
    <p class="mb-1 text-muted">${lang === 'ar' ? `عرض ${rows.length} من ${total} سجل` : `Showing ${rows.length} of ${total} records`}</p>
    <div class="table-container">
      <table>
        <thead><tr>
          <th>#</th>
          <th>${t('timestamp_col')}</th>
          <th>${t('user_col')}</th>
          <th>${t('role_col')}</th>
          <th>${t('dept_col')}</th>
          <th>${t('patient_col')}</th>
          <th>${t('action_col')}</th>
          <th>${t('details')}</th>
        </tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td>${r.log_id}</td>
          <td style="white-space:nowrap">${formatDateTime(r.timestamp)}</td>
          <td>${lang === 'ar' ? escapeHtml(r.user_name_ar) : escapeHtml(r.user_name_en)}</td>
          <td>${ROLES[r.user_role] ? ROLES[r.user_role][lang] : r.user_role}</td>
          <td>${lang === 'ar' ? (r.dept_name_ar || '—') : (r.dept_name_en || '—')}</td>
          <td>${r.patient_name ? escapeHtml(r.patient_name) + (r.patient_mrn ? ' (' + r.patient_mrn + ')' : '') : '—'}</td>
          <td><span class="badge badge-neutral">${r.action_type}</span></td>
          <td>${lang === 'ar' ? escapeHtml(r.action_detail_ar || r.action_detail) : escapeHtml(r.action_detail)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

function clearBlackboxFilter() {
  document.getElementById('bb-date-from').value = '';
  document.getElementById('bb-date-to').value = '';
  document.getElementById('bb-user').value = '';
  document.getElementById('bb-dept').value = '';
  document.getElementById('bb-action').value = '';
  document.getElementById('bb-search').value = '';
  applyBlackboxFilter();
}

async function verifyBlackbox() {
  const lang = currentLanguage();
  const result = await verifyBlackboxIntegrity();
  const el = document.getElementById('bb-integrity-result');
  if (result.valid) {
    el.innerHTML = `<div class="card mb-2" style="background:var(--success-light);border-left:4px solid var(--success);padding:16px;">
      <strong>${lang === 'ar' ? 'سلامة السجل: سليم' : 'Integrity Check: PASSED'}</strong> — ${result.totalRows} ${lang === 'ar' ? 'سجل تم التحقق منه' : 'records verified'}
    </div>`;
  } else {
    el.innerHTML = `<div class="card mb-2" style="background:var(--danger-light);border-left:4px solid var(--danger);padding:16px;">
      <strong>${lang === 'ar' ? 'سلامة السجل: فشل' : 'Integrity Check: FAILED'}</strong> — ${lang === 'ar' ? 'خلل في السجل رقم' : 'Broken at log_id'} ${result.brokenAt} (${result.reason})
    </div>`;
  }
}

function renderHMReports(main, lang) {
  const totalPatients = dbGet('SELECT COUNT(*) as c FROM patients').c;
  const activeAdmissions = dbGet('SELECT COUNT(*) as c FROM admissions WHERE status = ?', ['active']).c;
  const dischargedToday = dbGet("SELECT COUNT(*) as c FROM admissions WHERE status = 'discharged' AND discharged_at >= ?", [new Date().toISOString().substring(0,10)]).c;
  const admittedToday = dbGet("SELECT COUNT(*) as c FROM admissions WHERE admitted_at >= ?", [new Date().toISOString().substring(0,10)]).c;
  const pendingLabs = dbGet("SELECT COUNT(*) as c FROM lab_orders WHERE status IN ('ordered','collected','received')").c;
  const completedLabs = dbGet("SELECT COUNT(*) as c FROM lab_orders WHERE status = 'resulted'").c;
  const pendingRx = dbGet("SELECT COUNT(*) as c FROM prescriptions WHERE status = 'active'").c;
  const unpaidInvoices = dbGet("SELECT COUNT(*) as c FROM invoices WHERE status = 'unpaid'") || {c:0};
  const totalRevenue = dbGet("SELECT COALESCE(SUM(total),0) as s FROM invoices WHERE status = 'paid'") || {s:0};

  // Department census
  const deptCensus = dbAll(`SELECT d.name_en, d.name_ar, COUNT(a.admission_id) as cnt
    FROM departments d LEFT JOIN admissions a ON d.dept_id = a.dept_id AND a.status = 'active'
    WHERE d.type = 'clinical' GROUP BY d.dept_id HAVING cnt > 0 ORDER BY cnt DESC`);

  // LOS analytics
  const avgLOSRow = dbGet(`SELECT AVG(CAST((julianday(discharged_at) - julianday(admitted_at)) AS REAL)) as avg_los
    FROM admissions WHERE status = 'discharged' AND discharged_at IS NOT NULL`);
  const avgLOS = (avgLOSRow && avgLOSRow.avg_los) ? avgLOSRow.avg_los.toFixed(1) : '—';

  const longStays = dbAll(`SELECT a.bed_number, a.admitted_at, d.name_en as dept_en, d.name_ar as dept_ar,
    p.full_name_ar, p.full_name_en,
    CAST((julianday('now') - julianday(a.admitted_at)) AS INTEGER) as los_days
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id
    JOIN departments d ON a.dept_id = d.dept_id
    WHERE a.status = 'active' ORDER BY los_days DESC LIMIT 5`);

  main.innerHTML = `
    <div class="page-header"><h1>${t('reports')}</h1></div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">${totalPatients}</div><div class="stat-label">${lang==='ar'?'إجمالي المرضى المسجلين':'Total Registered Patients'}</div></div>
      <div class="stat-card"><div class="stat-value">${activeAdmissions}</div><div class="stat-label">${lang==='ar'?'مرضى منومون حالياً':'Currently Admitted'}</div></div>
      <div class="stat-card"><div class="stat-value">${admittedToday}</div><div class="stat-label">${lang==='ar'?'تنويمات اليوم':'Admitted Today'}</div></div>
      <div class="stat-card"><div class="stat-value">${dischargedToday}</div><div class="stat-label">${lang==='ar'?'تخريجات اليوم':'Discharged Today'}</div></div>
    </div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">${pendingLabs}</div><div class="stat-label">${lang==='ar'?'تحاليل قيد الانتظار':'Pending Lab Orders'}</div></div>
      <div class="stat-card"><div class="stat-value">${completedLabs}</div><div class="stat-label">${lang==='ar'?'تحاليل مكتملة':'Completed Labs'}</div></div>
      <div class="stat-card"><div class="stat-value">${pendingRx}</div><div class="stat-label">${lang==='ar'?'وصفات نشطة':'Active Prescriptions'}</div></div>
      <div class="stat-card"><div class="stat-value">${(totalRevenue.s || 0).toFixed(0)} ${lang==='ar'?'ر.س':'SAR'}</div><div class="stat-label">${lang==='ar'?'إيرادات محصلة':'Collected Revenue'}</div></div>
    </div>

    <h2 style="margin-top:1.5rem">${lang==='ar'?'التعداد حسب القسم':'Census by Department'}</h2>
    ${deptCensus.length === 0 ? `<p>${t('no_data')}</p>` : `
    <div class="table-container"><table>
      <thead><tr><th>${lang==='ar'?'القسم':'Department'}</th><th>${lang==='ar'?'عدد المرضى':'Patients'}</th><th>${lang==='ar'?'الإشغال':'Occupancy'}</th></tr></thead>
      <tbody>${deptCensus.map(d => `<tr>
        <td>${lang==='ar'?escapeHtml(d.name_ar):escapeHtml(d.name_en)}</td>
        <td><strong>${d.cnt}</strong></td>
        <td><div style="background:#e5e7eb;border-radius:4px;height:8px;width:100px;display:inline-block;vertical-align:middle">
          <div style="width:${Math.min(100, d.cnt*10)}%;background:#3b82f6;height:8px;border-radius:4px"></div>
        </div></td>
      </tr>`).join('')}</tbody>
    </table></div>`}

    <h2 style="margin-top:2rem">${lang==='ar'?'تحليل مدة الإقامة (LOS)':'Length of Stay (LOS) Analytics'}</h2>
    <div class="stat-cards" style="margin-bottom:1rem">
      <div class="stat-card">
        <div class="stat-value">${avgLOS}</div>
        <div class="stat-label">${lang==='ar'?'متوسط مدة الإقامة (أيام)':'Average LOS (days)'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${longStays.length > 0 ? longStays[0].los_days : '—'}</div>
        <div class="stat-label">${lang==='ar'?'أطول إقامة حالية (أيام)':'Longest Current Stay (days)'}</div>
      </div>
    </div>
    ${longStays.length === 0 ? `<p class="text-muted">${t('no_data')}</p>` : `
    <div class="table-container"><table>
      <thead><tr>
        <th>${lang==='ar'?'المريض':'Patient'}</th>
        <th>${lang==='ar'?'القسم':'Department'}</th>
        <th>${lang==='ar'?'السرير':'Bed'}</th>
        <th>${lang==='ar'?'تاريخ التنويم':'Admitted'}</th>
        <th>${lang==='ar'?'مدة الإقامة (أيام)':'LOS (days)'}</th>
      </tr></thead>
      <tbody>${longStays.map(s => `<tr>
        <td>${lang==='ar'?escapeHtml(s.full_name_ar):escapeHtml(s.full_name_en||s.full_name_ar)}</td>
        <td>${lang==='ar'?escapeHtml(s.dept_ar):escapeHtml(s.dept_en)}</td>
        <td>${escapeHtml(s.bed_number||'—')}</td>
        <td>${s.admitted_at ? s.admitted_at.substring(0,10) : '—'}</td>
        <td><strong style="color:${s.los_days > 14 ? 'var(--danger)' : s.los_days > 7 ? 'var(--warning)' : 'inherit'}">${s.los_days}</strong></td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
}

// ============================================================
// EMERGENCY DOCTOR — Patient Registration
// ============================================================

function renderERRegister(main, lang) {
  const depts = dbAll("SELECT * FROM departments WHERE type = 'clinical' ORDER BY dept_id");
  const deptOptions = depts.map(d => `<option value="${d.dept_id}">${lang === 'ar' ? escapeHtml(d.name_ar) : escapeHtml(d.name_en)}</option>`).join('');
  const condOptions = Object.entries(CONDITIONS).map(([k, v]) => `<label><input type="checkbox" name="conditions" value="${k}"> ${v[lang]}</label>`).join('');
  const bloodOptions = ['unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => `<option value="${b}">${b === 'unknown' ? t('blood_unknown') : b}</option>`).join('');

  main.innerHTML = `
    <div class="page-header"><h1>${t('register_patient')}</h1></div>
    <form id="register-patient-form" onsubmit="handleRegisterPatient(event)">
      <div class="card mb-3">
        <div class="form-section">
          <h3>${t('patient_info')}</h3>
          <div class="form-row">
            <div class="form-group"><label>${t('patient_name_ar')} *</label><input type="text" id="reg-name-ar" required dir="rtl" placeholder="${lang === 'ar' ? 'مثال: محمد أحمد علي' : 'e.g. محمد أحمد علي'}"></div>
            <div class="form-group"><label>${t('patient_name_en')}</label><input type="text" id="reg-name-en" placeholder="${lang === 'ar' ? 'مثال: Mohamed Ahmed Ali' : 'e.g. Mohamed Ahmed Ali'}"></div>
            <div class="form-group"><label>${t('national_id')}</label><input type="text" id="reg-national-id" placeholder="${lang === 'ar' ? 'رقم الهوية' : 'National ID Number'}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>${t('date_of_birth')}</label><input type="date" id="reg-dob"></div>
            <div class="form-group"><label>${t('gender')} *</label><select id="reg-gender" required><option value="">${lang === 'ar' ? 'اختر' : 'Select'}</option><option value="male">${t('male')}</option><option value="female">${t('female')}</option></select></div>
            <div class="form-group"><label>${t('blood_type')}</label><select id="reg-blood">${bloodOptions}</select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>${t('phone')}</label><input type="tel" id="reg-phone" placeholder="05xxxxxxxx"></div>
          </div>
          <div class="form-row" style="background:#f8f9fa;border-radius:8px;padding:10px 12px;margin-top:4px;">
            <div style="width:100%;font-size:0.8rem;font-weight:600;color:#6c757d;margin-bottom:6px;">${t('emergency_contact')} — ${lang === 'ar' ? 'جهة الاتصال في حالات الطوارئ' : 'Person to contact in emergencies'}</div>
            <div class="form-group"><label>${t('ec_name')}</label><input type="text" id="reg-ec-name" placeholder="${lang === 'ar' ? 'محمد أحمد' : 'John Doe'}"></div>
            <div class="form-group"><label>${t('ec_phone')}</label><input type="tel" id="reg-ec-phone" placeholder="05xxxxxxxx"></div>
            <div class="form-group"><label>${t('ec_relation')}</label>
              <select id="reg-ec-relation">
                <option value="">${lang === 'ar' ? '-- اختر --' : '-- Select --'}</option>
                ${['spouse','parent','child','sibling','relative','friend','guardian','other'].map(r => {
                  const labels = {spouse:{ar:'زوج/زوجة',en:'Spouse'},parent:{ar:'أب/أم',en:'Parent'},child:{ar:'ابن/بنت',en:'Child'},sibling:{ar:'أخ/أخت',en:'Sibling'},relative:{ar:'قريب',en:'Relative'},friend:{ar:'صديق',en:'Friend'},guardian:{ar:'وليّ أمر',en:'Guardian'},other:{ar:'أخرى',en:'Other'}};
                  return `<option value="${r}">${labels[r][lang]}</option>`;
                }).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="form-section">
          <h3>${lang === 'ar' ? 'تصنيف الحالة (الفرز)' : 'Triage Assessment'}</h3>
          <div class="form-row">
            <div class="form-group">
              <label>${lang === 'ar' ? 'مستوى الفرز (ESI) *' : 'Triage Level (ESI) *'}</label>
              <select id="reg-triage" required>
                <option value="">${lang === 'ar' ? '-- اختر --' : '-- Select --'}</option>
                <option value="1" style="color:#dc2626">ESI 1 — ${lang === 'ar' ? 'إنعاش (خطر فوري على الحياة)' : 'Resuscitation (Immediate life threat)'}</option>
                <option value="2" style="color:#ea580c">ESI 2 — ${lang === 'ar' ? 'طوارئ (حالة خطرة)' : 'Emergent (High risk / severe pain)'}</option>
                <option value="3" style="color:#ca8a04">ESI 3 — ${lang === 'ar' ? 'مستعجل (يحتاج موارد)' : 'Urgent (Needs resources)'}</option>
                <option value="4" style="color:#16a34a">ESI 4 — ${lang === 'ar' ? 'أقل استعجالاً (مورد واحد)' : 'Less Urgent (One resource)'}</option>
                <option value="5" style="color:#2563eb">ESI 5 — ${lang === 'ar' ? 'غير مستعجل (لا يحتاج موارد)' : 'Non-Urgent (No resources needed)'}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${lang === 'ar' ? 'طريقة الوصول' : 'Mode of Arrival'}</label>
              <select id="reg-arrival">
                <option value="walk_in">${lang === 'ar' ? 'حضور مباشر' : 'Walk-in'}</option>
                <option value="ambulance">${lang === 'ar' ? 'إسعاف' : 'Ambulance'}</option>
                <option value="referral">${lang === 'ar' ? 'تحويل من منشأة أخرى' : 'Referral from another facility'}</option>
                <option value="police">${lang === 'ar' ? 'شرطة / حوادث' : 'Police / Trauma'}</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${lang === 'ar' ? 'مقياس الألم (0-10)' : 'Pain Scale (0-10)'}</label>
              <input type="number" id="reg-pain" min="0" max="10" placeholder="0-10">
            </div>
            <div class="form-group">
              <label>${lang === 'ar' ? 'مقياس غلاسكو (GCS)' : 'Glasgow Coma Scale (GCS)'}</label>
              <input type="number" id="reg-gcs" min="3" max="15" placeholder="3-15" value="15">
            </div>
            <div class="form-group">
              <label>${lang === 'ar' ? 'الوعي' : 'Consciousness'}</label>
              <select id="reg-consciousness">
                <option value="alert">${lang === 'ar' ? 'واعي ومتجاوب' : 'Alert & Oriented'}</option>
                <option value="verbal">${lang === 'ar' ? 'يستجيب للصوت' : 'Responds to Voice'}</option>
                <option value="pain">${lang === 'ar' ? 'يستجيب للألم' : 'Responds to Pain'}</option>
                <option value="unresponsive">${lang === 'ar' ? 'لا يستجيب' : 'Unresponsive'}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="form-section">
          <h3>${t('chief_complaint')}</h3>
          <div class="form-group">
            <label>${t('chief_complaint')} * — ${lang === 'ar' ? 'اكتب الشكوى الرئيسية التي أتى بها المريض' : 'Write the main reason the patient came to the emergency room'}</label>
            <textarea id="reg-complaint" required rows="3" placeholder="${lang === 'ar' ? 'مثال: ألم شديد في الصدر منذ 3 ساعات مع ضيق تنفس' : 'e.g. Severe chest pain for 3 hours with shortness of breath'}"></textarea>
          </div>
          <div class="form-group">
            <label>${t('initial_diagnosis')} — ${lang === 'ar' ? 'التشخيص المبدئي بعد الفحص' : 'Initial assessment after examination'}</label>
            <textarea id="reg-diagnosis" rows="3" placeholder="${lang === 'ar' ? 'مثال: اشتباه متلازمة شريانية حادة (ACS)\nالتشخيص التفريقي: احتشاء عضلة القلب، ذبحة صدرية غير مستقرة' : 'e.g. Suspected Acute Coronary Syndrome (ACS)\nDifferential: MI, Unstable Angina'}"></textarea>
          </div>
          <div class="form-group">
            <label>${t('disposition_plan')} — ${lang === 'ar' ? 'ما هي الخطة التالية للمريض؟' : 'What is the next step for this patient?'}</label>
            <textarea id="reg-disposition" rows="2" placeholder="${lang === 'ar' ? 'مثال: تنويم في العناية المركزة للمراقبة. طلب تروبونين وتخطيط قلب. استشارة قسم القلب.' : 'e.g. Admit to ICU for monitoring. Order troponin + ECG. Cardiology consult requested.'}"></textarea>
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="form-section">
          <h3>${t('conditions')} — ${lang === 'ar' ? 'الأمراض المزمنة المعروفة' : 'Known Chronic Conditions'}</h3>
          <div class="checkbox-group">${condOptions}</div>
        </div>
      </div>

      <div class="card mb-3" style="border-left:4px solid #dc3545;">
        <div class="form-section">
          <h3 style="color:#dc3545;">${t('communicable_diseases')} <span style="font-size:0.75rem;font-weight:400;color:#6c757d;">${lang === 'ar' ? '(الإبلاغ إلزامي وفق اللوائح الصحية)' : '(Mandatory reporting per health regulations)'}</span></h3>
          <p style="font-size:0.82rem;color:#888;margin-bottom:10px;">${t('communicable_diseases_hint')}</p>
          <div class="checkbox-group" style="column-count:2;">
            ${Object.entries(COMMUNICABLE_DISEASES).map(([k, v]) =>
              `<label style="color:#dc3545;"><input type="checkbox" name="comm_diseases" value="${k}"> ${v[lang]}</label>`
            ).join('')}
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="form-section">
          <h3>${t('allergies')}</h3>
          <div id="allergy-list"></div>
          <button type="button" class="btn btn-sm btn-secondary mt-1" onclick="addAllergyRow()">${lang === 'ar' ? '+ إضافة حساسية' : '+ Add Allergy'}</button>
        </div>
      </div>

      <div class="card mb-3">
        <div class="form-section">
          <h3>${lang === 'ar' ? 'بيانات التنويم' : 'Admission Details'}</h3>
          <div class="form-row">
            <div class="form-group"><label>${t('admit_to')} *</label><select id="reg-dept" required>${deptOptions}</select></div>
            <div class="form-group"><label>${t('bed_number')}</label><input type="text" id="reg-bed" placeholder="${lang === 'ar' ? 'مثال: A-12' : 'e.g. A-12'}"></div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <div class="checkbox-group">
                <label><input type="checkbox" id="reg-ventilator"> ${t('on_ventilator')}</label>
                <label><input type="checkbox" id="reg-post-surgery"> ${t('post_surgery')}</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="form-section">
          <h3>${lang === 'ar' ? 'العلامات الحيوية الأولية' : 'Initial Vital Signs'}</h3>
          <div class="form-row">
            <div class="form-group"><label>${t('bp_systolic')} (mmHg)</label><input type="number" id="reg-bp-sys" min="40" max="300" placeholder="120"></div>
            <div class="form-group"><label>${t('bp_diastolic')} (mmHg)</label><input type="number" id="reg-bp-dia" min="20" max="200" placeholder="80"></div>
            <div class="form-group"><label>${t('heart_rate')} (bpm)</label><input type="number" id="reg-hr" min="20" max="300" placeholder="80"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>${t('temperature')} (&deg;C)</label><input type="number" id="reg-temp" step="0.1" min="30" max="45" placeholder="37.0"></div>
            <div class="form-group"><label>${t('o2_saturation')} (%)</label><input type="number" id="reg-o2" min="0" max="100" placeholder="98"></div>
            <div class="form-group"><label>${t('rbs_value')} (mg/dL)</label><input type="number" id="reg-rbs" min="0" max="1000" placeholder=""></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>${t('weight')} (kg)</label><input type="number" id="reg-weight" step="0.1" min="0" max="500" placeholder=""></div>
            <div class="form-group"><label>${t('height')} (cm)</label><input type="number" id="reg-height" step="0.1" min="0" max="300" placeholder=""></div>
          </div>
        </div>
      </div>

      <button type="submit" class="btn btn-lg btn-primary w-full">${t('register_btn')}</button>
    </form>
    <div id="reg-result" class="mt-3"></div>
  `;

  // Wire ICD-10 autocomplete on the diagnosis + complaint fields
  if (typeof attachICD10Autocomplete === 'function') {
    attachICD10Autocomplete('reg-diagnosis');
    attachICD10Autocomplete('reg-complaint');
  }
}

function addAllergyRow() {
  const lang = currentLanguage();
  const container = document.getElementById('allergy-list');
  const idx = container.children.length;
  const div = document.createElement('div');
  div.className = 'form-row mb-1';
  div.innerHTML = `
    <div class="form-group"><label>${t('allergen')}</label><input type="text" class="allergy-name" placeholder="${lang === 'ar' ? 'مثال: بنسلين' : 'e.g. Penicillin'}"></div>
    <div class="form-group"><label>${t('reaction')}</label>
      <select class="allergy-reaction">
        <option value="rash">${t('react_rash')}</option>
        <option value="anaphylaxis">${t('react_anaphylaxis')}</option>
        <option value="nausea">${t('react_nausea')}</option>
        <option value="swelling">${t('react_swelling')}</option>
        <option value="breathing">${t('react_breathing')}</option>
        <option value="other">${t('react_other')}</option>
      </select>
    </div>
    <div class="form-group"><label>${t('severity')}</label>
      <select class="allergy-severity">
        <option value="mild">${t('sev_mild')}</option>
        <option value="moderate">${t('sev_moderate')}</option>
        <option value="severe">${t('sev_severe')}</option>
        <option value="life_threatening">${t('sev_life_threatening')}</option>
      </select>
    </div>
    <div class="form-group" style="align-self:end"><button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.form-row').remove()">&#10005;</button></div>
  `;
  container.appendChild(div);
}

async function handleRegisterPatient(e) {
  e.preventDefault();
  const lang = currentLanguage();
  const session = getCurrentSession();
  const user = getCurrentUser();
  if (!user) { showError(lang === 'ar' ? 'انتهت الجلسة' : 'Session expired'); return; }

  // DUPLICATE PATIENT CHECK — prevent re-registering same person
  const nationalId = (document.getElementById('reg-national-id')?.value || '').trim();
  const nameAr     = (document.getElementById('reg-name-ar')?.value || '').trim();
  const phone      = (document.getElementById('reg-phone')?.value || '').trim();
  const dob        = (document.getElementById('reg-dob')?.value || '').trim();

  // A2 fix: reject empty/whitespace-only name
  if (!nameAr || nameAr.length < 2) {
    showError(lang === 'ar' ? 'الاسم العربي مطلوب (حرفان على الأقل)' : 'Arabic name is required (min 2 characters)');
    return;
  }
  // A3 fix: reject future DOB and absurdly old DOB
  if (dob) {
    const today = new Date().toISOString().slice(0, 10);
    if (dob > today) {
      showError(lang === 'ar' ? 'تاريخ الميلاد في المستقبل غير مسموح' : 'Date of birth cannot be in the future');
      return;
    }
    const year = parseInt(dob.slice(0, 4));
    if (year < 1900) {
      showError(lang === 'ar' ? `سنة الميلاد ${year} غير معقولة — يرجى التحقق` : `DOB year ${year} is implausible — please verify`);
      return;
    }
  }
  // A8 fix: validate phone format if provided
  if (phone && !/^[+0-9\s\-()]{6,20}$/.test(phone)) {
    showError(lang === 'ar' ? 'تنسيق الهاتف غير صحيح — استخدم أرقام فقط' : 'Phone format invalid — use digits, +, -, (), spaces only');
    return;
  }

  let dup = null;
  if (nationalId) {
    dup = dbGet('SELECT patient_id, mrn, full_name_ar, full_name_en FROM patients WHERE national_id = ?', [nationalId]);
  }
  if (!dup && nameAr && phone) {
    // fallback: name + phone match
    dup = dbGet('SELECT patient_id, mrn, full_name_ar, full_name_en FROM patients WHERE full_name_ar = ? AND phone = ?', [nameAr, phone]);
  }
  if (dup) {
    const dupName = lang === 'ar' ? dup.full_name_ar : (dup.full_name_en || dup.full_name_ar);
    const msg = lang === 'ar'
      ? `يوجد مريض مسجل مسبقاً بنفس البيانات: ${dupName} (${dup.mrn}).\nهل تريد إكمال التسجيل كمريض جديد على أي حال؟`
      : `A patient with these details already exists: ${dupName} (${dup.mrn}).\nContinue and register as a NEW patient anyway?`;
    showConfirm(msg, () => continueRegistration(lang, session, user));
    return;
  }

  await continueRegistration(lang, session, user);
}

async function continueRegistration(lang, session, user) {
  // Gather conditions
  const checkedConds = Array.from(document.querySelectorAll('input[name="conditions"]:checked')).map(cb => cb.value);

  // Gather allergies
  const allergyRows = document.querySelectorAll('#allergy-list .form-row');
  const allergies = [];
  allergyRows.forEach(row => {
    const name = row.querySelector('.allergy-name').value.trim();
    if (name) {
      allergies.push({
        allergen: name,
        reaction: row.querySelector('.allergy-reaction').value,
        severity: row.querySelector('.allergy-severity').value,
      });
    }
  });

  const deptId = parseInt(document.getElementById('reg-dept').value);

  // Run PIE for suggestions
  const pieSuggestions = runPIE(
    null,
    checkedConds,
    allergies,
    [],
    {
      dept_id: deptId,
      on_ventilator: document.getElementById('reg-ventilator').checked,
      post_surgery: document.getElementById('reg-post-surgery').checked,
    }
  );

  // Separate display suggestions from alerts
  const reviewItems = pieSuggestions.filter(s => !s.type || s.type === 'select');
  const alertItems = pieSuggestions.filter(s => s.type === 'pharmacy_alert' || s.type === 'clinical_suggestion');

  // Show alerts first
  alertItems.forEach(a => {
    const msg = lang === 'ar' ? (a.message_ar || a.message) : a.message;
    if (a.severity === 'yellow') showYellowAlert(msg, () => {});
    else if (a.severity === 'blue') showBlueAlert(msg);
  });

  // Show review panel and proceed on confirm
  if (reviewItems.length > 0) {
    showReviewPanel(reviewItems, async (finalValues) => {
      await doRegisterPatient(finalValues, checkedConds, allergies, user, session);
    });
  } else {
    await doRegisterPatient({}, checkedConds, allergies, user, session);
  }
}

async function doRegisterPatient(pieValues, conditions, allergies, user, session) {
  const lang = currentLanguage();

  // 1. Insert patient
  const nameAr = document.getElementById('reg-name-ar').value.trim();
  const nameEn = document.getElementById('reg-name-en').value.trim();
  const complaint = document.getElementById('reg-complaint').value.trim();
  const diagnosis = document.getElementById('reg-diagnosis').value.trim();

  const ecName     = (document.getElementById('reg-ec-name')?.value || '').trim();
  const ecPhone    = (document.getElementById('reg-ec-phone')?.value || '').trim();
  const ecRelation = (document.getElementById('reg-ec-relation')?.value || '');
  const ecLegacy   = [ecName, ecPhone, ecRelation].filter(Boolean).join(' - ');

  dbRun(`INSERT INTO patients (mrn, national_id, full_name_ar, full_name_en, date_of_birth, gender, blood_type, phone,
    emergency_contact, emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    registered_by, registered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'TEMP',
    document.getElementById('reg-national-id').value.trim() || null,
    nameAr, nameEn || null,
    document.getElementById('reg-dob').value || null,
    document.getElementById('reg-gender').value,
    document.getElementById('reg-blood').value || 'unknown',
    document.getElementById('reg-phone').value.trim() || null,
    ecLegacy || null, ecName || null, ecPhone || null, ecRelation || null,
    session.user_id, nowISO()
  ]);

  const patientId = dbLastId();
  const mrn = generateMRN(patientId);
  dbRun('UPDATE patients SET mrn = ? WHERE patient_id = ?', [mrn, patientId]);

  // Communicable diseases — save with category='communicable'
  const commDiseaseEls = document.querySelectorAll('input[name="comm_diseases"]:checked');
  const commDiseases = Array.from(commDiseaseEls).map(el => el.value);
  for (const cd of commDiseases) {
    dbRun('INSERT INTO patient_conditions (patient_id, condition_code, category, added_by, added_at) VALUES (?, ?, \'communicable\', ?, ?)',
      [patientId, cd, session.user_id, nowISO()]);
  }
  // F1b fix: isolation precaution alert for selected diseases
  const ISOLATION_MAP = {
    tuberculosis: { type: 'airborne',  ar: 'عزل تنفسي (هواء)', en: 'AIRBORNE isolation (negative-pressure room, N95 mask)' },
    covid19:      { type: 'droplet',   ar: 'عزل رذاذي',         en: 'DROPLET isolation (surgical mask, single room)' },
    influenza:    { type: 'droplet',   ar: 'عزل رذاذي',         en: 'DROPLET isolation (surgical mask)' },
    meningitis:   { type: 'droplet',   ar: 'عزل رذاذي',         en: 'DROPLET isolation until 24h of antibiotics' },
    mrsa:         { type: 'contact',   ar: 'عزل تلامسي',        en: 'CONTACT isolation (gown + gloves)' },
    vre:          { type: 'contact',   ar: 'عزل تلامسي',        en: 'CONTACT isolation (gown + gloves)' },
    c_diff:       { type: 'contact',   ar: 'عزل تلامسي + غسل الأيدي بالصابون', en: 'CONTACT isolation + soap-and-water hand wash (alcohol does not kill spores)' },
    scabies:      { type: 'contact',   ar: 'عزل تلامسي',        en: 'CONTACT isolation' },
  };
  const isolationNeeded = commDiseases.filter(cd => ISOLATION_MAP[cd]);
  if (isolationNeeded.length > 0) {
    const alerts = isolationNeeded.map(cd => {
      const i = ISOLATION_MAP[cd];
      const dis = COMMUNICABLE_DISEASES[cd][lang];
      return `<li><strong style="color:#dc3545;">${dis}</strong>: ${i[lang]}</li>`;
    }).join('');
    setTimeout(() => showRedAlert(
      (lang === 'ar' ? '⚠️ تحذير عزل — هذا المريض يحتاج احتياطات خاصة:' : '⚠️ ISOLATION WARNING — this patient requires special precautions:') +
      `<ul style="text-align:left;margin-top:8px;">${alerts}</ul>` +
      (lang === 'ar' ? '<p style="margin-top:8px;font-size:0.85rem;">يرجى تحديث رقم السرير لغرفة عزل مناسبة.</p>' : '<p style="margin-top:8px;font-size:0.85rem;">Please update bed assignment to an appropriate isolation room.</p>'),
      async (reason) => {
        await logAction('ISOLATION_ACKNOWLEDGED',
          `${user.full_name_en} acknowledged isolation precautions for patient ${nameEn || nameAr} (MRN ${mrn}): ${isolationNeeded.join(', ')}. Reason/action: ${reason}`,
          null, patientId, nameEn || nameAr, mrn);
      }
    ), 1000);
  }

  // Rich QR code data for scanning
  const allergyRows = document.querySelectorAll('.allergy-row');
  const allergyList = Array.from(allergyRows).map(row => {
    const inputs = row.querySelectorAll('input, select');
    return inputs[0]?.value || '';
  }).filter(Boolean);

  const qrData = JSON.stringify({
    type: 'patient',
    v: 2,
    patient_id: patientId,
    mrn,
    name_ar: nameAr,
    name_en: nameEn || nameAr,
    dob: document.getElementById('reg-dob').value || null,
    gender: document.getElementById('reg-gender').value,
    blood_type: document.getElementById('reg-blood').value || 'unknown',
    allergies: allergyList,
    ec_name: ecName || null,
    ec_phone: ecPhone || null,
    ec_relation: ecRelation || null,
    conditions: conditions,
    comm_diseases: commDiseases,
    registered_at: nowISO(),
  });
  dbRun('UPDATE patients SET qr_code_data = ? WHERE patient_id = ?', [qrData, patientId]);

  // 2. Insert conditions
  for (const cond of conditions) {
    dbRun('INSERT INTO patient_conditions (patient_id, condition_code, category, added_by, added_at) VALUES (?, ?, \'chronic\', ?, ?)',
      [patientId, cond, session.user_id, nowISO()]);
  }

  // 3. Insert allergies
  for (const a of allergies) {
    dbRun('INSERT INTO patient_allergies (patient_id, allergen, reaction, severity, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?)',
      [patientId, a.allergen, a.reaction, a.severity, session.user_id, nowISO()]);
  }

  // 4. Create admission
  const deptId = parseInt(document.getElementById('reg-dept').value);
  const complexityScore = pieValues.complexity_score || 1;
  const dietCode = pieValues.diet_code || 'REG';
  const bedNum = document.getElementById('reg-bed').value.trim() || null;

  // E1 fix: prevent double-booking a bed
  if (bedNum) {
    const conflict = dbGet(`SELECT a.admission_id, p.full_name_ar, p.full_name_en, p.mrn
      FROM admissions a JOIN patients p ON a.patient_id = p.patient_id
      WHERE a.bed_number = ? AND a.status = 'active' AND a.dept_id = ?`, [bedNum, deptId]);
    if (conflict) {
      const occName = lang === 'ar' ? conflict.full_name_ar : (conflict.full_name_en || conflict.full_name_ar);
      showError(lang === 'ar'
        ? `السرير ${bedNum} مشغول حالياً بالمريض ${occName} (${conflict.mrn}). الرجاء اختيار سرير آخر.`
        : `Bed ${bedNum} is currently occupied by patient ${occName} (${conflict.mrn}). Please choose another bed.`);
      // Roll back the patient insert
      dbRun('DELETE FROM patients WHERE patient_id = ?', [patientId]);
      return;
    }
  }

  dbRun(`INSERT INTO admissions (patient_id, dept_id, bed_number, admitted_by, admitted_at, status, complexity_score, diet_code, chief_complaint, initial_diagnosis, disposition_plan, on_ventilator, post_surgery)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`, [
    patientId, deptId, bedNum,
    session.user_id, nowISO(),
    complexityScore, dietCode,
    complaint, diagnosis || null,
    document.getElementById('reg-disposition').value.trim() || null,
    document.getElementById('reg-ventilator').checked ? 1 : 0,
    document.getElementById('reg-post-surgery').checked ? 1 : 0,
  ]);
  const admissionId = dbLastId();

  // 5. Record initial vitals if provided
  const bpSys = document.getElementById('reg-bp-sys').value;
  const bpDia = document.getElementById('reg-bp-dia').value;
  const hr = document.getElementById('reg-hr').value;
  const temp = document.getElementById('reg-temp').value;
  const o2 = document.getElementById('reg-o2').value;
  if (bpSys || hr || temp || o2) {
    dbRun(`INSERT INTO vitals_log (admission_id, recorded_by, recorded_at, bp_systolic, bp_diastolic, heart_rate, temperature, o2_sat, weight_kg, height_cm, rbs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      admissionId, session.user_id, nowISO(),
      bpSys || null, bpDia || null, hr || null, temp || null, o2 || null,
      document.getElementById('reg-weight').value || null,
      document.getElementById('reg-height').value || null,
      document.getElementById('reg-rbs').value || null,
    ]);
  }

  // 6. Blackbox
  const dept = dbGet('SELECT * FROM departments WHERE dept_id = ?', [deptId]);
  await logAction('PATIENT_REGISTERED',
    `Emergency Doctor ${user.full_name_en} registered patient ${nameEn || nameAr} (MRN: ${mrn}) with chief complaint: ${complaint} and initial diagnosis: ${diagnosis || 'N/A'}`,
    `دكتور الطوارئ ${user.full_name_ar} سجل المريض ${nameAr} (رقم الملف: ${mrn}) بشكوى: ${complaint}`,
    patientId, nameEn || nameAr, mrn
  );

  // Log conditions
  for (const c of conditions) {
    await logAction('CONDITION_ADDED',
      `${user.full_name_en} added condition ${CONDITIONS[c] ? CONDITIONS[c].en : c} to patient ${nameEn || nameAr} (MRN: ${mrn})`,
      `${user.full_name_ar} أضاف حالة ${CONDITIONS[c] ? CONDITIONS[c].ar : c} للمريض ${nameAr}`,
      patientId, nameEn || nameAr, mrn
    );
  }

  // Log allergies
  for (const a of allergies) {
    await logAction('ALLERGY_ADDED',
      `${user.full_name_en} flagged allergy to ${a.allergen} (severity: ${a.severity}) for patient ${nameEn || nameAr}`,
      `${user.full_name_ar} سجل حساسية من ${a.allergen} (شدة: ${a.severity}) للمريض ${nameAr}`,
      patientId, nameEn || nameAr, mrn
    );
  }

  await saveDBToIndexedDB();

  // Show success with MRN and QR
  showSuccess(t('patient_registered') + ' — MRN: ' + mrn);
  document.getElementById('reg-result').innerHTML = `
    <div class="card" style="background:var(--success-light); border-left: 4px solid var(--success); padding: 20px;">
      <h3>${t('patient_registered')}</h3>
      <p><strong>${t('mrn')}:</strong> ${mrn}</p>
      <p><strong>${lang === 'ar' ? 'الاسم' : 'Name'}:</strong> ${escapeHtml(nameAr)} ${nameEn ? '(' + escapeHtml(nameEn) + ')' : ''}</p>
      <p><strong>${t('department')}:</strong> ${lang === 'ar' ? dept.name_ar : dept.name_en}</p>
      <p><strong>${t('diet_code')}:</strong> ${dietCode} — ${DIET_CODES[dietCode] ? DIET_CODES[dietCode][lang] : dietCode}</p>
      <p><strong>${t('complexity')}:</strong> ${complexityScore}/5</p>
      <div id="patient-qr" class="qr-container mt-2"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <button class="btn btn-primary" onclick="navigateTo('er-register')">${lang === 'ar' ? 'تسجيل مريض آخر' : 'Register Another Patient'}</button>
        <button class="btn btn-secondary" onclick="writeNFCWristband(${patientId})" style="background:#7c3aed;border-color:#7c3aed;color:#fff;">&#128248; ${t('write_nfc')}</button>
      </div>
    </div>
  `;

  // Generate QR code
  if (typeof QRCode !== 'undefined') {
    new QRCode(document.getElementById('patient-qr'), {
      text: qrData, width: 128, height: 128,
      colorDark: '#000', colorLight: '#fff',
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  // Smart chief-complaint detection — suggest matching order set
  const complaintLower = (complaint || '').toLowerCase();
  const SMART_TRIGGERS = [
    { regex: /chest pain|ألم.*صدر|الم.*صدر|chest.*pressure|tightness/i, setKey: 'chest_pain', label: { ar: 'بروتوكول ألم الصدر / ACS', en: 'Chest Pain / ACS Protocol' } },
    { regex: /stroke|سكتة|cva|hemiplegia|facial droop|slurred speech/i, setKey: 'stroke', label: { ar: 'بروتوكول السكتة الدماغية', en: 'Stroke Protocol' } },
    { regex: /sepsis|septic|fever.*hypotension|qsofa|عفونة|تعفن/i, setKey: 'sepsis', label: { ar: 'بروتوكول الإنتان', en: 'Sepsis Protocol' } },
    { regex: /dka|diabetic ketoacidosis|hyperglycemia.*[3-9]\d\d|سكري.*حاد/i, setKey: 'dka', label: { ar: 'بروتوكول الحماض السكري', en: 'DKA Protocol' } },
  ];
  const matched = SMART_TRIGGERS.find(t => t.regex.test(complaintLower));
  if (matched && typeof ORDER_SETS !== 'undefined' && ORDER_SETS[matched.setKey]) {
    setTimeout(() => {
      const overlay = document.createElement('div');
      overlay.className = 'alert-overlay';
      overlay.innerHTML = `
        <div class="alert-modal" style="max-width:520px;">
          <div style="padding:18px 22px;">
            <h3 style="color:#3b82f6;margin-bottom:8px;">&#128161; ${lang === 'ar' ? 'اقتراح ذكي' : 'Smart Suggestion'}</h3>
            <p style="font-size:0.92rem;margin-bottom:14px;">
              ${lang === 'ar'
                ? `الشكوى تطابق بروتوكول <strong>${matched.label.ar}</strong>. هل ترغب بتطبيقه الآن؟ سيتم إنشاء الفحوصات والأدوية والمهام تلقائياً.`
                : `Chief complaint matches the <strong>${matched.label.en}</strong>. Apply now to auto-create labs, meds, and tasks?`}
            </p>
            <div style="background:#f8fafc;padding:10px;border-radius:6px;font-size:0.82rem;margin-bottom:12px;">
              <div>&#129514; ${ORDER_SETS[matched.setKey].labs.length} ${lang === 'ar' ? 'فحوصات' : 'labs'}</div>
              <div>&#128138; ${ORDER_SETS[matched.setKey].meds.length} ${lang === 'ar' ? 'أدوية' : 'meds'}</div>
              <div>&#128203; ${ORDER_SETS[matched.setKey].tasks.length} ${lang === 'ar' ? 'مهام' : 'tasks'}</div>
            </div>
            <textarea id="smart-decline" rows="1" style="display:none;width:100%;border:1px solid #ccc;border-radius:6px;padding:8px;margin-bottom:8px;font-size:0.85rem;" placeholder="${lang === 'ar' ? 'سبب الرفض (مطلوب)...' : 'Reason for declining (required)...'}"></textarea>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <button class="btn btn-secondary" id="ss-decline">${lang === 'ar' ? 'رفض' : 'Decline'}</button>
              <button class="btn btn-primary" id="ss-apply">${lang === 'ar' ? 'تطبيق البروتوكول' : 'Apply Protocol'}</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      document.getElementById('ss-apply').onclick = () => {
        overlay.remove();
        if (typeof handleApplyOrderSet === 'function') {
          handleApplyOrderSet(matched.setKey, patientId, admissionId);
        }
      };
      document.getElementById('ss-decline').onclick = async () => {
        const txt = document.getElementById('smart-decline');
        if (txt.style.display === 'none') {
          txt.style.display = 'block';
          txt.focus();
          return;
        }
        const reason = txt.value.trim();
        if (!reason || reason.length < 4) { showError(lang === 'ar' ? 'سبب الرفض مطلوب' : 'Reason required'); return; }
        overlay.remove();
        if (typeof logAction === 'function') {
          await logAction('SMART_SUGGESTION_DECLINED',
            `${user.full_name_en} declined ${matched.label.en} suggestion for patient ${nameEn || nameAr} (MRN ${mrn}). Reason: ${reason}`,
            null, patientId, nameEn || nameAr, mrn);
        }
      };
    }, 1200);
  }
}

// ============================================================
// EMERGENCY DOCTOR — Active Cases
// ============================================================

function renderERCases(main, lang) {
  const session = getCurrentSession();
  const cases = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn, d.name_ar as dept_ar, d.name_en as dept_en
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id JOIN departments d ON a.dept_id = d.dept_id
    WHERE a.admitted_by = ? ORDER BY a.admitted_at DESC`, [session.user_id]);

  main.innerHTML = `
    <div class="page-header"><h1>${t('active_cases')}</h1></div>
    ${cases.length === 0 ? `<div class="empty-state"><div class="empty-icon">&#128203;</div><p>${t('no_data')}</p></div>` : `
    <div class="table-container">
      <table>
        <thead><tr>
          <th>${t('mrn')}</th><th>${lang === 'ar' ? 'الاسم' : 'Name'}</th><th>${t('department')}</th>
          <th>${t('chief_complaint')}</th><th>${t('complexity')}</th><th>${t('diet_code')}</th>
          <th>${t('status')}</th><th>${t('date')}</th>
        </tr></thead>
        <tbody>${cases.map(c => `<tr>
          <td>${c.mrn}</td>
          <td>${lang === 'ar' ? escapeHtml(c.full_name_ar) : escapeHtml(c.full_name_en || c.full_name_ar)}</td>
          <td>${lang === 'ar' ? c.dept_ar : c.dept_en}</td>
          <td>${escapeHtml(c.chief_complaint || '—')}</td>
          <td>${c.complexity_score}/5</td>
          <td><span class="badge badge-info">${c.diet_code}</span></td>
          <td><span class="badge ${c.status === 'active' ? 'badge-success' : 'badge-neutral'}">${c.status}</span></td>
          <td>${formatDateTime(c.admitted_at)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`}
  `;
}

// ============================================================
// CONSULTANT — Department Patients & Case Assignment
// ============================================================

function renderConPatients(main, lang) {
  const session = getCurrentSession();
  const patients = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn,
    ca.doctor_id, u.full_name_ar as doc_ar, u.full_name_en as doc_en
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN case_assignments ca ON a.admission_id = ca.admission_id
    LEFT JOIN users u ON ca.doctor_id = u.user_id
    WHERE a.dept_id = ? AND a.status = 'active' ORDER BY a.admitted_at DESC`, [session.dept_id]);

  main.innerHTML = `
    <div class="page-header"><h1>${t('my_dept_patients')}</h1></div>
    ${patients.length === 0 ? `<div class="empty-state"><div class="empty-icon">&#128101;</div><p>${t('no_data')}</p></div>` : `
    <div class="table-container">
      <table>
        <thead><tr><th>${t('mrn')}</th><th>${lang === 'ar' ? 'الاسم' : 'Name'}</th><th>${t('chief_complaint')}</th><th>${t('complexity')}</th><th>${t('assigned_to')}</th><th>${t('bed_number')}</th></tr></thead>
        <tbody>${patients.map(p => `<tr class="${!p.doctor_id ? 'text-warning' : ''}">
          <td>${p.mrn}</td>
          <td>${lang === 'ar' ? escapeHtml(p.full_name_ar) : escapeHtml(p.full_name_en || p.full_name_ar)}</td>
          <td>${escapeHtml(p.chief_complaint || '—')}</td>
          <td>${p.complexity_score}/5</td>
          <td>${p.doctor_id ? (lang === 'ar' ? escapeHtml(p.doc_ar) : escapeHtml(p.doc_en)) : '<span class="badge badge-warning">' + t('unassigned') + '</span>'}</td>
          <td>${p.bed_number || '—'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`}
  `;
}

function renderConAssign(main, lang) {
  const session = getCurrentSession();
  const unassigned = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN case_assignments ca ON a.admission_id = ca.admission_id
    WHERE a.dept_id = ? AND a.status = 'active' AND ca.id IS NULL ORDER BY a.admitted_at`, [session.dept_id]);

  const doctors = dbAll("SELECT * FROM users WHERE role = 'doctor' AND department_id = ? AND is_active = 1", [session.dept_id]);
  const docOptions = doctors.map(d => `<option value="${d.user_id}">${lang === 'ar' ? escapeHtml(d.full_name_ar) : escapeHtml(d.full_name_en)}</option>`).join('');

  main.innerHTML = `
    <div class="page-header"><h1>${t('case_assignment')}</h1></div>
    ${unassigned.length === 0 ? `<div class="empty-state"><div class="empty-icon">&#9989;</div><p>${lang === 'ar' ? 'جميع الحالات معينة' : 'All cases are assigned'}</p></div>` : `
    <div class="table-container">
      <table>
        <thead><tr><th>${t('mrn')}</th><th>${lang === 'ar' ? 'الاسم' : 'Name'}</th><th>${t('chief_complaint')}</th><th>${t('assign_to_doctor')}</th><th>${t('actions')}</th></tr></thead>
        <tbody>${unassigned.map(p => `<tr>
          <td>${p.mrn}</td>
          <td>${lang === 'ar' ? escapeHtml(p.full_name_ar) : escapeHtml(p.full_name_en || p.full_name_ar)}</td>
          <td>${escapeHtml(p.chief_complaint || '—')}</td>
          <td><select id="assign-doc-${p.admission_id}"><option value="">—</option>${docOptions}</select></td>
          <td><button class="btn btn-sm btn-primary" onclick="handleAssignCase(${p.admission_id}, ${p.patient_id})">${t('assign_btn')}</button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`}
  `;
}

async function handleAssignCase(admissionId, patientId) {
  const lang = currentLanguage();
  const docId = document.getElementById('assign-doc-' + admissionId)?.value;
  if (!docId) { showError(t('error_required')); return; }

  const user = getCurrentUser();
  if (!user) { showError(lang === 'ar' ? 'انتهت الجلسة' : 'Session expired'); return; }

  const doctor  = dbGet('SELECT * FROM users WHERE user_id = ? AND is_active = 1', [docId]);
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  if (!doctor)  { showError(lang === 'ar' ? 'الطبيب غير موجود أو غير نشط' : 'Doctor not found or inactive'); return; }
  if (!patient) { showError(lang === 'ar' ? 'المريض غير موجود' : 'Patient not found'); return; }

  dbRun('INSERT INTO case_assignments (admission_id, doctor_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?)',
    [admissionId, docId, user.user_id, nowISO()]);

  await logAction('CASE_ASSIGNED',
    `Consultant ${user.full_name_en} assigned patient ${patient.full_name_en || patient.full_name_ar} to Doctor ${doctor.full_name_en}`,
    `الاستشاري ${user.full_name_ar} عيّن المريض ${patient.full_name_ar} للدكتور ${doctor.full_name_ar}`,
    patientId, patient.full_name_en || patient.full_name_ar, patient.mrn
  );

  showSuccess(t('case_assigned_success'));
  saveDBToIndexedDB();
  navigateTo('con-assign');
}

// ============================================================
// CONSULTANT — Rounding Mode (NEW)
// Compresses 12 patient × 4 clicks → single scrollable view with
// inline note-writing. Fills Khalid persona's gap.
// ============================================================
function renderConRounds(main, lang) {
  const session = getCurrentSession();
  // Consultant sees all active patients in their dept
  const patients = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id, p.date_of_birth, p.gender
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id
    WHERE a.dept_id = ? AND a.status = 'active' ORDER BY a.bed_number`, [session.dept_id]);

  main.innerHTML = `
    <div class="page-header">
      <h1>&#127973; ${lang === 'ar' ? 'وضع الجولة' : 'Rounding Mode'}</h1>
      <span style="color:#666;font-size:0.9rem;">${patients.length} ${lang === 'ar' ? 'مريض' : 'patients'}</span>
    </div>
    <p style="color:#666;font-size:0.85rem;margin-bottom:14px;">
      ${lang === 'ar' ? 'كل مريض يظهر في بطاقة واحدة: السن، الشكوى، السوابق، العلامات الحيوية، آخر مذكرة، حقل لكتابة مذكرة جديدة. لا حاجة للتنقل بين الشاشات.' : 'Each patient as a single card with story, vitals trend, last note, and inline new-note field. No screen-hopping needed.'}
    </p>
    ${patients.length === 0 ? `<div class="empty-state"><p>${t('no_data')}</p></div>` : ''}
    <div style="display:flex;flex-direction:column;gap:14px;">
      ${patients.map(p => renderRoundCard(p, lang)).join('')}
    </div>
  `;
}

function renderRoundCard(p, lang) {
  const recentVitals = dbAll(`SELECT * FROM vitals_log WHERE admission_id=? ORDER BY recorded_at DESC LIMIT 1`, [p.admission_id])[0];
  const lastNote = dbGet(`SELECT c.*, u.full_name_en as doc_en FROM consultations c LEFT JOIN users u ON c.doctor_id=u.user_id WHERE c.admission_id=? ORDER BY c.created_at DESC LIMIT 1`, [p.admission_id]);
  const activeRxCt = dbGet(`SELECT COUNT(*) AS c FROM prescriptions WHERE admission_id=? AND status='active'`, [p.admission_id]).c;
  const pendingLabsCt = dbGet(`SELECT COUNT(*) AS c FROM lab_orders WHERE admission_id=? AND status IN ('ordered','collected','received')`, [p.admission_id]).c;
  const allergies = dbAll(`SELECT allergen FROM patient_allergies WHERE patient_id=?`, [p.patient_id]);
  const commCt = dbGet("SELECT COUNT(*) AS c FROM patient_conditions WHERE patient_id=? AND category='communicable'", [p.patient_id]).c;

  // Age
  let age = '';
  if (p.date_of_birth) {
    const y = Math.floor((Date.now() - new Date(p.date_of_birth).getTime()) / 31557600000);
    age = y + (lang === 'ar' ? ' سنة' : 'y');
  }

  const news2Color = recentVitals && recentVitals.news2_score !== null
    ? (recentVitals.news2_score >= 7 ? '#dc2626' : recentVitals.news2_score >= 5 ? '#f59e0b' : '#10b981')
    : '#888';

  return `<div class="card" style="padding:14px;border-left:5px solid ${news2Color};">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
      <div style="flex:1;min-width:220px;">
        <div style="font-size:1.05rem;font-weight:700;">
          ${escapeHtml(lang === 'ar' ? p.full_name_ar : (p.full_name_en || p.full_name_ar))}
          <span style="color:#666;font-weight:400;font-size:0.85rem;">• ${age} ${p.gender ? (p.gender === 'male' ? 'M' : 'F') : ''} • Bed ${escapeHtml(p.bed_number || '—')} • ${escapeHtml(p.mrn)}</span>
        </div>
        <div style="font-size:0.85rem;color:#444;margin-top:4px;">${escapeHtml(p.chief_complaint || '—')}</div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
          ${allergies.length ? `<span class="spb-badge spb-allergy">&#9888; ${allergies.length} ${lang === 'ar' ? 'حساسية' : 'allergies'}</span>` : ''}
          ${commCt ? `<span class="spb-badge" style="background:#dc2626;color:#fff;">&#9763; ${commCt} ${lang === 'ar' ? 'معدٍ' : 'comm'}</span>` : ''}
          <span class="spb-badge" style="background:#dbeafe;color:#1e40af;">&#128138; ${activeRxCt} Rx</span>
          ${pendingLabsCt ? `<span class="spb-badge" style="background:#fef3c7;color:#92400e;">&#129514; ${pendingLabsCt} ${lang === 'ar' ? 'فحص' : 'pending'}</span>` : ''}
        </div>
      </div>
      <div style="text-align:center;min-width:120px;">
        <div style="font-size:0.7rem;color:#666;text-transform:uppercase;">${lang === 'ar' ? 'العلامات' : 'Latest vitals'}</div>
        ${recentVitals ? `
          <div style="font-size:0.82rem;line-height:1.3;">
            BP ${recentVitals.bp_systolic || '—'}/${recentVitals.bp_diastolic || '—'}<br>
            HR ${recentVitals.heart_rate || '—'} • T ${recentVitals.temperature || '—'}°<br>
            SpO₂ ${recentVitals.o2_sat || '—'}%
          </div>
          ${recentVitals.news2_score !== null && recentVitals.news2_score !== undefined ? `<div style="margin-top:4px;"><span class="badge" style="background:${news2Color};color:#fff;">NEWS2 ${recentVitals.news2_score}</span></div>` : ''}
        ` : `<em style="color:#888;font-size:0.8rem;">${lang === 'ar' ? 'لا توجد' : 'none'}</em>`}
      </div>
    </div>
    ${lastNote ? `<div style="margin-top:10px;padding:8px;background:#f8fafc;border-radius:6px;font-size:0.82rem;">
      <strong style="color:#1e40af;">${lang === 'ar' ? 'آخر مذكرة' : 'Last note'}</strong>
      <span style="color:#888;"> — ${escapeHtml(lastNote.doc_en || '')} ${formatDateTime(lastNote.created_at)}</span>
      <div style="margin-top:4px;color:#333;">${escapeHtml((lastNote.assessment || lastNote.plan || '').slice(0, 200))}${(lastNote.assessment || lastNote.plan || '').length > 200 ? '...' : ''}</div>
    </div>` : ''}
    <div style="margin-top:10px;display:flex;gap:8px;align-items:flex-start;">
      <textarea id="round-note-${p.admission_id}" rows="2" placeholder="${lang === 'ar' ? 'مذكرة جديدة (S/A/P)...' : 'Quick progress note (S/A/P)...'}" style="flex:1;border:1px solid #ccc;border-radius:6px;padding:8px;font-size:0.88rem;"></textarea>
      <button class="btn btn-primary btn-sm" onclick="saveRoundingNote(${p.admission_id}, ${p.patient_id})">${lang === 'ar' ? 'حفظ' : 'Save'}</button>
      <button class="btn btn-secondary btn-sm" onclick="showPatientDetail(${p.patient_id}, ${p.admission_id})">${lang === 'ar' ? 'فتح كامل' : 'Open full'}</button>
    </div>
  </div>`;
}

async function saveRoundingNote(admissionId, patientId) {
  const lang = currentLanguage();
  const user = getCurrentUser();
  const txt = document.getElementById(`round-note-${admissionId}`).value.trim();
  if (!txt) { showError(lang === 'ar' ? 'المذكرة فارغة' : 'Note is empty'); return; }
  if (txt.length < 10) { showError(lang === 'ar' ? 'مذكرة أقصر من اللازم' : 'Note too short'); return; }
  dbRun(`INSERT INTO consultations (admission_id, doctor_id, consult_type, assessment, plan, created_at) VALUES (?, ?, 'rounds', ?, ?, ?)`,
    [admissionId, user.user_id, txt, txt, nowISO()]);
  const patient = dbGet('SELECT full_name_en, mrn FROM patients WHERE patient_id = ?', [patientId]);
  await logAction('ROUNDING_NOTE',
    `Consultant ${user.full_name_en} wrote rounding note for ${patient.full_name_en} (MRN ${patient.mrn})`,
    null, patientId, patient.full_name_en, patient.mrn);
  saveDBToIndexedDB();
  document.getElementById(`round-note-${admissionId}`).value = '';
  showSuccess(lang === 'ar' ? 'تم حفظ المذكرة' : 'Note saved');
}

function renderConStaff(main, lang) {
  const session = getCurrentSession();
  const staff = dbAll('SELECT * FROM users WHERE department_id = ? AND is_active = 1 ORDER BY role, full_name_en', [session.dept_id]);

  main.innerHTML = `
    <div class="page-header"><h1>${t('staff_overview')}</h1></div>
    <div class="table-container">
      <table>
        <thead><tr><th>${lang === 'ar' ? 'الاسم' : 'Name'}</th><th>${t('role_label')}</th><th>${t('specialization')}</th></tr></thead>
        <tbody>${staff.map(s => `<tr>
          <td>${lang === 'ar' ? escapeHtml(s.full_name_ar) : escapeHtml(s.full_name_en)}</td>
          <td>${ROLES[s.role] ? ROLES[s.role][lang] : s.role}</td>
          <td>${escapeHtml(s.specialization || '—')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

// ============================================================
// DOCTOR — My Patients, Prescriptions, Labs, Consultations
// ============================================================

function renderDocPatients(main, lang) {
  const session = getCurrentSession();
  const patients = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id
    FROM case_assignments ca JOIN admissions a ON ca.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    WHERE ca.doctor_id = ? AND a.status = 'active' ORDER BY a.admitted_at DESC`, [session.user_id]);

  main.innerHTML = `
    <div class="page-header"><h1>${t('my_patients')}</h1></div>
    ${patients.length === 0 ? `<div class="empty-state"><div class="empty-icon">&#128101;</div><p>${t('no_data')}</p></div>` : `
    <div class="table-container">
      <table>
        <thead><tr>
          <th>${t('mrn')}</th><th>${lang === 'ar' ? 'الاسم' : 'Name'}</th><th>${t('chief_complaint')}</th>
          <th>${t('bed_number')}</th><th>${t('complexity')}</th><th>${t('diet_code')}</th><th>${t('actions')}</th>
        </tr></thead>
        <tbody>${patients.map(p => `<tr>
          <td>${p.mrn}</td>
          <td>${lang === 'ar' ? escapeHtml(p.full_name_ar) : escapeHtml(p.full_name_en || p.full_name_ar)}</td>
          <td>${escapeHtml(p.chief_complaint || '—')}</td>
          <td>${p.bed_number || '—'}</td>
          <td>${p.complexity_score}/5</td>
          <td><span class="badge badge-info">${p.diet_code}</span></td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="showPatientDetail(${p.patient_id}, ${p.admission_id})">${t('details')}</button>
          </td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`}
  `;
}

function showPatientDetail(patientId, admissionId) {
  const lang = currentLanguage();
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  const admission = dbGet('SELECT a.*, d.name_ar, d.name_en FROM admissions a JOIN departments d ON a.dept_id = d.dept_id WHERE a.admission_id = ?', [admissionId]);
  const conditions = dbAll('SELECT * FROM patient_conditions WHERE patient_id = ?', [patientId]);
  const allergies = dbAll('SELECT * FROM patient_allergies WHERE patient_id = ?', [patientId]);
  const vitals = dbAll('SELECT * FROM vitals_log WHERE admission_id = ? ORDER BY recorded_at DESC LIMIT 5', [admissionId]);
  const rxs = dbAll('SELECT * FROM prescriptions WHERE admission_id = ? ORDER BY prescribed_at DESC', [admissionId]);
  const labs = dbAll('SELECT * FROM lab_orders WHERE admission_id = ? ORDER BY ordered_at DESC', [admissionId]);
  const consults = dbAll('SELECT c.*, u.full_name_en, u.full_name_ar FROM consultations c JOIN users u ON c.doctor_id = u.user_id WHERE c.admission_id = ? ORDER BY c.created_at DESC', [admissionId]);

  // Critical unacknowledged lab results
  const criticalUnacked = dbAll(`
    SELECT lo.*, u.full_name_en as ordered_by_en, u.full_name_ar as ordered_by_ar
    FROM lab_orders lo
    LEFT JOIN users u ON lo.doctor_id = u.user_id
    LEFT JOIN lab_critical_acks lca ON lo.order_id = lca.order_id
    WHERE lo.admission_id = ? AND lo.is_critical = 1 AND lo.status = 'resulted' AND lca.ack_id IS NULL
    ORDER BY lo.resulted_at
  `, [admissionId]);

  const main = document.getElementById('main-content');
  main.innerHTML = `
    ${renderSafetyBanner(patientId, admissionId, lang)}
    ${renderPatientStory(patientId, admissionId, lang)}
    <div style="display:none;"><!-- legacy banner removed; now using renderSafetyBanner -->
      <span class="spb-name">${lang === 'ar' ? escapeHtml(patient.full_name_ar) : escapeHtml(patient.full_name_en || patient.full_name_ar)}</span>
      <span class="spb-mrn">• ${patient.mrn}</span>
      ${admission.bed_number ? `<span class="spb-badge spb-bed">&#128717; ${escapeHtml(admission.bed_number)}</span>` : ''}
      ${patient.blood_type && patient.blood_type !== 'unknown' ? `<span class="spb-badge spb-blood">&#129656; ${escapeHtml(patient.blood_type)}</span>` : ''}
      ${allergies.map(a => `<span class="spb-badge spb-allergy">&#9888; ${escapeHtml(a.allergen)}</span>`).join('')}
      <span class="spb-actions no-print">
        <button class="btn btn-sm btn-secondary" onclick="navigateTo('doc-patients')">${t('back_btn')}</button>
      </span>
    </div>

    <div class="page-header no-print">
      <h1>${lang === 'ar' ? escapeHtml(patient.full_name_ar) : escapeHtml(patient.full_name_en || patient.full_name_ar)} — ${patient.mrn}</h1>
    </div>

    ${typeof renderCodeStatusBanner === 'function' ? renderCodeStatusBanner(admissionId, lang) : ''}

    ${criticalUnacked.length ? `
    <div class="critical-lab-banner" id="critical-banner-${admissionId}">
      <div class="critical-lab-header">
        <span class="critical-lab-icon">&#9888;</span>
        <strong>${t('critical_lab_alert')}</strong>
        <span class="badge badge-danger" style="margin-left:8px">${criticalUnacked.length} ${lang==='ar'?'نتيجة':'result(s)'}</span>
      </div>
      ${criticalUnacked.map(lab => `
        <div class="critical-lab-item" id="critical-item-${lab.order_id}">
          <div class="critical-lab-info">
            <strong>${escapeHtml(lab.test_name)}</strong>
            <span class="flag-critical_high" style="margin:0 8px">${escapeHtml(lab.result_value || '—')} ${escapeHtml(lab.result_unit || '')}</span>
            <span class="text-muted" style="font-size:0.8rem">${formatDateTime(lab.resulted_at)}</span>
          </div>
          <button class="btn btn-sm btn-danger" onclick="showCriticalAckModal(${lab.order_id}, '${escapeHtml(lab.test_name).replace(/'/g,'')}', ${patientId}, ${admissionId})">
            ${t('critical_ack_btn')}
          </button>
        </div>
      `).join('')}
    </div>` : ''}

    <div class="stat-cards">
      <div class="stat-card"><div class="stat-label">${t('department')}</div><div class="stat-value" style="font-size:1.2rem">${lang === 'ar' ? admission.name_ar : admission.name_en}</div></div>
      <div class="stat-card"><div class="stat-label">${t('bed_number')}</div><div class="stat-value" style="font-size:1.2rem">${admission.bed_number || '—'}</div></div>
      <div class="stat-card"><div class="stat-label">${t('diet_code')}</div><div class="stat-value" style="font-size:1.2rem">${admission.diet_code}</div></div>
      <div class="stat-card"><div class="stat-label">${t('complexity')}</div><div class="stat-value" style="font-size:1.2rem">${admission.complexity_score}/5</div></div>
    </div>

    <div class="card mb-3">
      <div class="card-header"><h3>${t('conditions')} — ${lang === 'ar' ? 'أمراض مزمنة' : 'Chronic Conditions'}</h3></div>
      ${conditions.filter(c => !c.category || c.category === 'chronic').length
        ? conditions.filter(c => !c.category || c.category === 'chronic').map(c => `<span class="badge badge-warning mb-1" style="margin-right:6px">${CONDITIONS[c.condition_code] ? CONDITIONS[c.condition_code][lang] : c.condition_code}</span>`).join('')
        : '<p class="text-muted">' + t('no_data') + '</p>'}
      ${conditions.filter(c => c.category === 'communicable').length ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #f87171;">
          <div style="font-size:0.8rem;font-weight:700;color:#dc2626;margin-bottom:6px;">&#9888; ${t('communicable_diseases')}</div>
          ${conditions.filter(c => c.category === 'communicable').map(c => `<span class="badge mb-1" style="background:#dc2626;color:#fff;margin-right:6px;">${COMMUNICABLE_DISEASES[c.condition_code] ? COMMUNICABLE_DISEASES[c.condition_code][lang] : c.condition_code}</span>`).join('')}
        </div>` : ''}
      ${(() => {
        const hai = dbAll('SELECT * FROM nosocomial_infections WHERE admission_id = ?', [admission.admission_id]);
        return hai.length ? `
          <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #f87171;">
            <div style="font-size:0.8rem;font-weight:700;color:#7c3aed;margin-bottom:6px;">&#127861; ${t('nosocomial_infections')}</div>
            ${hai.map(n => `<span class="badge mb-1" style="background:#7c3aed;color:#fff;margin-right:6px;">${NOSOCOMIAL_TYPES[n.infection_type]?.[lang] || n.infection_type}${n.pathogen ? ' — ' + n.pathogen : ''}${n.is_isolated ? ' [ISOLATED]' : ''}</span>`).join('')}
          </div>` : '';
      })()}
    </div>

    <div class="card mb-3">
      <div class="card-header"><h3>${t('allergies')}</h3></div>
      ${allergies.length ? allergies.map(a => `<span class="badge badge-danger mb-1" style="margin-right:6px">${escapeHtml(a.allergen)} (${a.severity})</span>`).join('') : '<p class="text-muted">' + t('no_data') + '</p>'}
    </div>

    <div class="card mb-3">
      <div class="card-header">
        <h3>${lang === 'ar' ? 'آخر العلامات الحيوية' : 'Recent Vitals'}</h3>
      </div>
      ${vitals.length ? `<table><thead><tr><th>${t('date')}</th><th>BP</th><th>HR</th><th>Temp</th><th>O2%</th><th>RR</th><th>RBS</th><th>NEWS2</th></tr></thead>
        <tbody>${vitals.map(v => {
          const news = v.news2_score;
          const newsBg = news>=7?'#dc3545':news>=5?'#fd7e14':news>=1?'#ffc107':'#28a745';
          const newsColor = news>=5?'#fff':'#333';
          return `<tr>
            <td>${formatDateTime(v.recorded_at)}</td>
            <td>${v.bp_systolic||'—'}/${v.bp_diastolic||'—'}</td>
            <td>${v.heart_rate||'—'}</td>
            <td>${v.temperature||'—'}</td>
            <td>${v.o2_sat||'—'}%${v.on_o2?'<span title="On O2" style="color:#007bff;margin-left:3px;">🫁</span>':''}</td>
            <td>${v.resp_rate||'—'}</td>
            <td>${v.rbs||'—'}</td>
            <td>${news!=null?`<span class="news2-badge" style="background:${newsBg};color:${newsColor};padding:2px 8px;border-radius:10px;font-weight:700;">${news}</span>`:'—'}</td>
          </tr>`;
        }).join('')}</tbody></table>` : '<p class="text-muted">' + t('no_data') + '</p>'}
    </div>

    <div class="card mb-3">
      <div class="card-header"><h3>${t('prescription')}</h3></div>
      ${rxs.length ? `<table><thead><tr><th>${t('drug_name')}</th><th>${t('dose')}</th><th>${t('route')}</th><th>${t('frequency')}</th><th>${t('status')}</th></tr></thead>
        <tbody>${rxs.map(r => `<tr><td>${escapeHtml(r.drug_name)}</td><td>${escapeHtml(r.dose)}</td><td>${r.route}</td><td>${r.frequency}</td><td><span class="badge ${r.status === 'active' ? 'badge-success' : 'badge-neutral'}">${r.status}</span></td></tr>`).join('')}</tbody></table>` : '<p class="text-muted">' + t('no_data') + '</p>'}
    </div>

    <div class="card mb-3">
      <div class="card-header"><h3>${t('order_labs')}</h3></div>
      ${labs.length ? `<table><thead><tr><th>${t('lab_test_name')}</th><th>${t('lab_priority')}</th><th>${t('status')}</th><th>${lang === 'ar' ? 'النتيجة' : 'Result'}</th></tr></thead>
        <tbody>${labs.map(l => `<tr><td>${escapeHtml(l.test_name)}</td><td>${l.priority}</td><td><span class="badge badge-info">${l.status}</span></td><td>${l.result_value ? escapeHtml(l.result_value) + ' ' + (l.result_unit || '') : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="text-muted">' + t('no_data') + '</p>'}
    </div>

    <div class="card mb-3">
      <div class="card-header"><h3>${t('my_consultations')}</h3></div>
      ${consults.length ? consults.map(c => `
        <div class="card mb-1" style="background: var(--bg)">
          <p><strong>${c.consult_type}</strong> — ${formatDateTime(c.created_at)} — ${lang === 'ar' ? escapeHtml(c.full_name_ar) : escapeHtml(c.full_name_en)}</p>
          ${c.subjective ? '<p><strong>S:</strong> ' + escapeHtml(c.subjective) + '</p>' : ''}
          ${c.objective ? '<p><strong>O:</strong> ' + escapeHtml(c.objective) + '</p>' : ''}
          ${c.assessment ? '<p><strong>A:</strong> ' + escapeHtml(c.assessment) + '</p>' : ''}
          ${c.plan ? '<p><strong>P:</strong> ' + escapeHtml(c.plan) + '</p>' : ''}
        </div>
      `).join('') : '<p class="text-muted">' + t('no_data') + '</p>'}
    </div>

    <div class="flex gap-1 flex-wrap">
      <button class="btn btn-primary" onclick="showRxForm(${patientId}, ${admissionId})">${t('write_prescription')}</button>
      <button class="btn btn-info" onclick="showLabForm(${patientId}, ${admissionId})">${t('order_labs')}</button>
      <button class="btn btn-success" onclick="showConsultForm(${patientId}, ${admissionId})">${t('new_consultation')}</button>
      <button class="btn btn-warning" onclick="showDischargeForm(${patientId}, ${admissionId})">${t('discharge_patient')}</button>
      <button class="btn btn-secondary" onclick="showDietOrderForm(${patientId}, ${admissionId})">&#127858; ${t('order_diet')}</button>
      <button class="btn btn-danger" onclick="showOrderSetPanel(${patientId}, ${admissionId})" style="background:#6f42c1;border-color:#6f42c1;">&#9889; ${t('order_sets_title')}</button>
      <button class="btn btn-secondary" onclick="printWristband(${patientId}, ${admissionId})" style="background:#20c997;border-color:#20c997;color:#fff;">&#128203; ${lang==='ar'?'طباعة سوار':'Print Wristband'}</button>
      <button class="btn btn-secondary" onclick="writeNFCWristband(${patientId})" style="background:#7c3aed;border-color:#7c3aed;color:#fff;">&#128248; ${t('write_nfc')}</button>
      <button class="btn btn-secondary" onclick="showNosocomialForm(${patientId}, ${admissionId}, '${escapeHtml((patient.full_name_en||'').replace(/'/g,"\\'")||'')}', '${escapeHtml(patient.full_name_ar.replace(/'/g,"\\'"))}')" style="background:#dc3545;border-color:#dc3545;color:#fff;">&#127861; ${t('add_nosocomial')}</button>
      <button class="btn btn-secondary" onclick="showPatientTimeline(${patientId}, ${admissionId})" style="background:#343a40;border-color:#343a40;color:#fff;">&#128197; ${lang==='ar'?'السجل الزمني':'Timeline'}</button>
      <button class="btn btn-secondary" onclick="showMedReconciliation(${patientId}, ${admissionId})" style="background:#e83e8c;border-color:#e83e8c;color:#fff;">&#128138; ${lang==='ar'?'مطابقة الأدوية':'Med Reconciliation'}</button>
      <button class="btn btn-secondary" onclick="showVaccinationsForm(${patientId}, '${escapeHtml(lang==='ar'?patient.full_name_ar:(patient.full_name_en||patient.full_name_ar)).replace(/'/g,'&apos;')}')" style="background:#0ea5e9;border-color:#0ea5e9;color:#fff;">&#128137; ${lang==='ar'?'التطعيمات':'Vaccinations'}</button>
    </div>
    <div id="doc-action-form" class="mt-3"></div>
    <div class="card mt-3" id="vitals-chart-card" style="padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h4 style="margin:0;">${lang==='ar'?'مخطط العلامات الحيوية':'Vitals Trend Chart'}</h4>
        <small style="color:#666;">${lang==='ar'?'آخر 20 قراءة':'Last 20 readings'}</small>
      </div>
      <div id="vitals-chart-container" style="min-height:50px;"></div>
    </div>
  `;
  // Render chart after DOM is painted
  requestAnimationFrame(() => renderVitalsChart(admissionId, 'vitals-chart-container'));
}

// ============================================================
// DOCTOR — Write Prescription
// ============================================================

function renderDocRx(main, lang) {
  const session = getCurrentSession();
  const patients = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id
    FROM case_assignments ca JOIN admissions a ON ca.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    WHERE ca.doctor_id = ? AND a.status = 'active'`, [session.user_id]);

  if (!patients.length) { main.innerHTML = `<div class="page-header"><h1>${t('write_prescription')}</h1></div><div class="empty-state"><p>${t('no_data')}</p></div>`; return; }

  const drugs = dbAll('SELECT * FROM drugs ORDER BY name_generic');
  const drugOptions = drugs.map(d => `<option value="${d.drug_id}" data-name="${escapeHtml(d.name_generic)}">${d.name_generic}${d.name_brand ? ' (' + d.name_brand + ')' : ''} — ${d.name_ar || ''}</option>`).join('');
  const patientOptions = patients.map(p => `<option value="${p.admission_id}" data-pid="${p.patient_id}">${escapeHtml(p.mrn)} — ${lang === 'ar' ? escapeHtml(p.full_name_ar) : escapeHtml(p.full_name_en || p.full_name_ar)}</option>`).join('');
  const routeOptions = ['oral','iv','im','sc','sublingual','topical','inhaled','pr','ng_tube'].map(r => `<option value="${r}">${LANG['route_' + r] ? LANG['route_' + r][lang] : r}</option>`).join('');
  const freqOptions = ['once_daily','twice_daily','three_times_daily','four_times_daily','every_6h','every_8h','every_12h','as_needed','stat','once'].map(f => `<option value="${f}">${LANG['freq_' + f] ? LANG['freq_' + f][lang] : f}</option>`).join('');
  const durOptions = ['3_days','5_days','7_days','14_days','until_review','ongoing','custom'].map(d => `<option value="${d}">${LANG['dur_' + d] ? LANG['dur_' + d][lang] : d}</option>`).join('');

  main.innerHTML = `
    <div class="page-header"><h1>${t('write_prescription')}</h1></div>
    <div class="card">
      <form onsubmit="handlePrescribe(event)">
        <div class="form-row">
          <div class="form-group"><label>${t('patient_col')} *</label><select id="rx-patient" required>${patientOptions}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('drug_name')} *</label><select id="rx-drug" required><option value="">—</option>${drugOptions}</select></div>
          <div class="form-group"><label>${t('dose')} *</label><input type="text" id="rx-dose" required placeholder="${lang === 'ar' ? 'مثال: 500mg' : 'e.g. 500mg'}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('route')} *</label><select id="rx-route" required>${routeOptions}</select></div>
          <div class="form-group"><label>${t('frequency')} *</label><select id="rx-freq" required>${freqOptions}</select></div>
          <div class="form-group"><label>${t('duration')}</label><select id="rx-dur">${durOptions}</select></div>
        </div>
        <div class="form-group"><label>${t('notes')}</label><textarea id="rx-notes" rows="2"></textarea></div>
        <button type="submit" class="btn btn-primary">${t('prescribe_btn')}</button>
      </form>
    </div>
  `;
}

// Drug-class allergen matcher: returns true if patient is allergic to this drug.
// B1d/e fix: trim allergen, lowercase, AND fuzzy-match common typos.
function checkDrugAllergy(drugName, allergies) {
  if (!allergies || !allergies.length) return null;
  const drugLower = (drugName || '').trim().toLowerCase();
  // Map of allergen substrings → drug name substrings that should trigger
  const ALLERGEN_DRUG_MAP = {
    'penicillin':   ['penicillin', 'amoxicillin', 'ampicillin', 'augmentin', 'piperacillin'],
    'sulfa':        ['sulfamethoxazole', 'bactrim', 'septra', 'sulfasalazine', 'sulfa'],
    'nsaid':        ['ibuprofen', 'naproxen', 'ketorolac', 'diclofenac', 'celecoxib', 'indomethacin'],
    'aspirin':      ['aspirin', 'asa', 'acetylsalicylic'],
    'ace':          ['lisinopril', 'enalapril', 'captopril', 'ramipril', 'perindopril', 'benazepril'],
    'cephalosporin':['cefuroxime', 'ceftriaxone', 'cefazolin', 'cephalexin', 'cefepime'],
    'statin':       ['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin'],
    'opioid':       ['morphine', 'oxycodone', 'hydromorphone', 'fentanyl', 'codeine', 'tramadol'],
    'iodine':       ['iodine', 'contrast'],
    'latex':        [], // not a drug match
  };
  // Common typo aliases — map misspellings to canonical class
  const TYPO_ALIASES = {
    'pencilin': 'penicillin', 'pencillin': 'penicillin', 'penisilin': 'penicillin', 'penicilin': 'penicillin',
    'sulpha': 'sulfa', 'sulph': 'sulfa',
    'asprin': 'aspirin', 'aspirine': 'aspirin',
    'cefalosporin': 'cephalosporin', 'cephalo': 'cephalosporin',
    'morphin': 'opioid', 'codien': 'opioid',
  };
  // Levenshtein distance ≤ 2 for short tokens
  const lev = (a, b) => {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 2) return 99;
    const dp = Array(n + 1).fill(0).map((_, i) => i);
    for (let i = 1; i <= m; i++) {
      let prev = dp[0]; dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = dp[j];
        dp[j] = a[i-1] === b[j-1] ? prev : Math.min(prev, dp[j], dp[j-1]) + 1;
        prev = tmp;
      }
    }
    return dp[n];
  };
  for (const a of allergies) {
    let allergenLower = (a.allergen || '').trim().toLowerCase();
    if (!allergenLower) continue;
    // Resolve typo alias
    if (TYPO_ALIASES[allergenLower]) allergenLower = TYPO_ALIASES[allergenLower];

    // Direct substring match
    if (drugLower.includes(allergenLower)) return a;
    // Class-based match
    for (const [classKey, drugs] of Object.entries(ALLERGEN_DRUG_MAP)) {
      if (allergenLower.includes(classKey)) {
        if (drugs.some(d => drugLower.includes(d))) return a;
      }
      // Fuzzy: allergen ≤ 2 edits from a class key
      if (allergenLower.length >= 5 && lev(allergenLower, classKey) <= 2) {
        if (drugs.some(d => drugLower.includes(d))) return Object.assign({}, a, { _fuzzy: true, _matched_class: classKey });
      }
    }
  }
  return null;
}

async function handlePrescribe(e) {
  e.preventDefault();
  const lang = currentLanguage();
  const user = getCurrentUser();
  if (!user) { showError(lang === 'ar' ? 'انتهت الجلسة' : 'Session expired'); return; }

  const admissionId = document.getElementById('rx-patient').value;
  const drugId = document.getElementById('rx-drug').value;
  const drugOption = document.getElementById('rx-drug').selectedOptions[0];
  if (!drugOption) { showError(lang === 'ar' ? 'يرجى اختيار دواء' : 'Please select a drug'); return; }
  const drugName = drugOption.dataset.name;
  const dose = document.getElementById('rx-dose').value.trim();
  const route = document.getElementById('rx-route').value;
  const freq = document.getElementById('rx-freq').value;
  const dur = document.getElementById('rx-dur').value;
  const notes = document.getElementById('rx-notes').value.trim();

  if (!dose) { showError(lang === 'ar' ? 'الجرعة مطلوبة' : 'Dose is required'); return; }

  const admission = dbGet('SELECT a.*, p.* FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.admission_id = ?', [admissionId]);
  if (!admission) { showError(lang === 'ar' ? 'الإدخال غير موجود' : 'Admission not found'); return; }

  // ALLERGY CHECK — patient safety guard rail
  const patientAllergies = dbAll('SELECT * FROM patient_allergies WHERE patient_id = ?', [admission.patient_id]);
  const allergyMatch = checkDrugAllergy(drugName, patientAllergies);
  if (allergyMatch) {
    const sev = (allergyMatch.severity || '').toLowerCase();
    const isLifeThreatening = sev === 'life_threatening' || sev === 'severe' || sev === 'anaphylaxis';
    const msg = lang === 'ar'
      ? `&#9888; تنبيه حساسية! المريض لديه حساسية من: ${escapeHtml(allergyMatch.allergen)} (${escapeHtml(allergyMatch.severity || '—')}). التفاعل: ${escapeHtml(allergyMatch.reaction || '—')}`
      : `&#9888; ALLERGY ALERT! Patient has documented allergy to: ${escapeHtml(allergyMatch.allergen)} (${escapeHtml(allergyMatch.severity || '—')}). Reaction: ${escapeHtml(allergyMatch.reaction || '—')}`;
    if (isLifeThreatening) {
      // Hard stop with override-with-reason
      showRedAlert(msg, async (reason) => {
        await logAction('ALLERGY_OVERRIDE',
          `${user.full_name_en} overrode ALLERGY ALERT for ${admission.full_name_en || admission.full_name_ar} (${allergyMatch.allergen} → ${drugName}). Reason: ${reason}`,
          null, admission.patient_id, admission.full_name_en || admission.full_name_ar, admission.mrn);
        await checkInteractionsAndPrescribe(admissionId, drugId, drugName, dose, route, freq, dur, notes, admission, user);
      });
      return;
    } else {
      // Soft warning with confirm
      showYellowAlert(msg, async () => {
        await logAction('ALLERGY_WARN',
          `${user.full_name_en} acknowledged allergy warning for ${admission.full_name_en || admission.full_name_ar} (${allergyMatch.allergen} → ${drugName})`,
          null, admission.patient_id, admission.full_name_en || admission.full_name_ar, admission.mrn);
        await checkInteractionsAndPrescribe(admissionId, drugId, drugName, dose, route, freq, dur, notes, admission, user);
      });
      return;
    }
  }

  await checkInteractionsAndPrescribe(admissionId, drugId, drugName, dose, route, freq, dur, notes, admission, user);
}

async function checkInteractionsAndPrescribe(admissionId, drugId, drugName, dose, route, freq, dur, notes, admission, user) {
  // Check drug interactions with current prescriptions
  const currentRxs = dbAll("SELECT drug_id FROM prescriptions WHERE admission_id = ? AND status = 'active'", [admissionId]);
  for (const rx of currentRxs) {
    const interaction = dbGet('SELECT * FROM drug_interactions WHERE (drug_a_id = ? AND drug_b_id = ?) OR (drug_a_id = ? AND drug_b_id = ?)',
      [drugId, rx.drug_id, rx.drug_id, drugId]);
    if (interaction) {
      const lang = currentLanguage();
      const msg = lang === 'ar' ? (interaction.description_ar || interaction.description) : interaction.description;
      if (interaction.severity === 'red') {
        showRedAlert(msg, async (reason) => {
          await logAction('ALERT_OVERRIDDEN',
            `${user.full_name_en} overrode RED ALERT for patient ${admission.full_name_en || admission.full_name_ar}: ${interaction.description}. Override reason: ${reason}`,
            null, admission.patient_id, admission.full_name_en || admission.full_name_ar, admission.mrn);
          await doInsertPrescription(admissionId, drugId, drugName, dose, route, freq, dur, notes, admission, user);
        });
        return;
      } else if (interaction.severity === 'yellow') {
        showYellowAlert(msg, async () => {
          await doInsertPrescription(admissionId, drugId, drugName, dose, route, freq, dur, notes, admission, user);
        });
        return;
      } else {
        showBlueAlert(msg);
      }
    }
  }

  await doInsertPrescription(admissionId, drugId, drugName, dose, route, freq, dur, notes, admission, user);
}

async function doInsertPrescription(admissionId, drugId, drugName, dose, route, freq, dur, notes, admission, user) {
  const now = nowISO();
  dbRun(`INSERT INTO prescriptions (admission_id, doctor_id, drug_id, drug_name, dose, route, frequency, duration, start_date, status, prescribed_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [admissionId, user.user_id, drugId, drugName, dose, route, freq, dur, now.slice(0, 10), now, notes || null]);

  await logAction('PRESCRIPTION_ISSUED',
    `Doctor ${user.full_name_en} prescribed ${drugName} ${dose} ${route} ${freq} for patient ${admission.full_name_en || admission.full_name_ar}`,
    `الدكتور ${user.full_name_ar} وصف ${drugName} ${dose} للمريض ${admission.full_name_ar}`,
    admission.patient_id, admission.full_name_en || admission.full_name_ar, admission.mrn);

  showSuccess(t('rx_issued'));
  saveDBToIndexedDB();
  navigateTo('doc-rx');
}

// ============================================================
// DOCTOR — Order Labs
// ============================================================

function renderDocLabs(main, lang) {
  const session = getCurrentSession();
  const patients = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id
    FROM case_assignments ca JOIN admissions a ON ca.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    WHERE ca.doctor_id = ? AND a.status = 'active'`, [session.user_id]);

  if (!patients.length) { main.innerHTML = `<div class="page-header"><h1>${t('order_labs')}</h1></div><div class="empty-state"><p>${t('no_data')}</p></div>`; return; }

  const patientOptions = patients.map(p => `<option value="${p.admission_id}" data-pid="${p.patient_id}">${escapeHtml(p.mrn)} — ${lang === 'ar' ? escapeHtml(p.full_name_ar) : escapeHtml(p.full_name_en || p.full_name_ar)}</option>`).join('');

  // Get unique categories from catalog
  const categories = [...new Set(LAB_TEST_CATALOG.map(t => t.cat))];
  const catOptions = categories.map(c => `<option value="${c}">${t('cat_' + c) || c}</option>`).join('');

  // Smart suggestions for selected patient
  const firstP = patients[0];
  const condRows = dbAll('SELECT condition_code FROM patient_conditions WHERE patient_id = ?', [firstP.patient_id]);
  const conditions = condRows.map(r => r.condition_code);
  const allergies = dbAll('SELECT * FROM patient_allergies WHERE patient_id = ?', [firstP.patient_id]);
  const pieSuggestions = runPIE({date_of_birth: firstP.date_of_birth}, conditions, allergies, [], firstP);
  const labSugs = pieSuggestions.find(s => s.type === 'lab_suggestions');

  let suggestionsHtml = '';
  if (labSugs && labSugs.labs.length > 0) {
    suggestionsHtml = `<div class="card mb-3"><h3>${t('smart_suggested_labs')}</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
      ${labSugs.labs.map(l => {
        const test = LAB_TEST_CATALOG.find(t => t.code === l.code);
        const testName = test ? (lang === 'ar' ? test.name_ar : test.name_en) : l.code;
        const reason = lang === 'ar' ? l.reason_ar : l.reason_en;
        return `<button type="button" class="btn btn-sm btn-outline" onclick="addSuggestedLab('${l.code}')" title="${escapeHtml(reason)}">${escapeHtml(testName)}</button>`;
      }).join('')}
      </div></div>`;
  }

  // Recent lab results
  const recentLabs = dbAll(`SELECT lo.*, p.full_name_ar, p.full_name_en, p.mrn FROM lab_orders lo
    JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id
    WHERE lo.doctor_id = ? AND lo.status = 'resulted' ORDER BY lo.resulted_at DESC LIMIT 10`, [session.user_id]);

  let resultsHtml = '';
  if (recentLabs.length > 0) {
    resultsHtml = `<div class="card mt-3"><h3>${t('lab_view_results')}</h3>
      <div class="table-container"><table><thead><tr><th>${t('patient_col')}</th><th>${t('lab_test_name')}</th><th>${t('lab_result_value')}</th><th>${t('lab_result_flag')}</th><th>${t('date')}</th></tr></thead>
      <tbody>${recentLabs.map(l => {
        const flag = l.result_flag || 'normal';
        return `<tr class="lab-result-row"><td>${lang === 'ar' ? escapeHtml(l.full_name_ar) : escapeHtml(l.full_name_en || l.full_name_ar)}</td>
          <td>${escapeHtml(l.test_name)}</td>
          <td>${l.result_value === 'See details' ? `<button class="btn btn-sm btn-info" onclick="showLabDetails(${l.order_id})">${t('details')}</button>` : escapeHtml(l.result_value || '—')}</td>
          <td><span class="flag-${flag}">${t('lab_flag_' + flag.replace('critical_','')) || flag}</span></td>
          <td>${formatDateTime(l.resulted_at)}</td></tr>`;
      }).join('')}</tbody></table></div></div>`;
  }

  main.innerHTML = `
    <div class="page-header"><h1>${t('order_labs')}</h1></div>
    ${suggestionsHtml}
    <div class="card mb-3">
      <form onsubmit="handleOrderLab(event)">
        <div class="form-row">
          <div class="form-group"><label>${t('patient_col')} *</label>
            <select id="lab-patient" required onchange="updateLabSuggestions()">${patientOptions}</select></div>
        </div>
        <h4 style="margin-bottom:12px">${lang === 'ar' ? 'اختر التحاليل' : 'Select Tests'}</h4>
        <div class="cascading-select">
          <div class="form-group"><label>${t('lab_category')}</label>
            <select id="lab-cat" onchange="updateLabSubcategories()">
              <option value="">${t('lab_select_category')}</option>${catOptions}
            </select>
          </div>
          <div class="form-group"><label>${t('lab_subcategory')}</label>
            <select id="lab-subcat" onchange="updateLabTests()" disabled>
              <option value="">${t('lab_select_subcategory')}</option>
            </select>
          </div>
          <div class="form-group"><label>${t('lab_test_name')}</label>
            <select id="lab-test-select" onchange="onLabTestSelected()" disabled>
              <option value="">${t('lab_select_test')}</option>
            </select>
          </div>
        </div>
        <div id="lab-prep-box"></div>
        <div id="lab-selected-tests" style="margin-bottom:12px"></div>
        <div class="form-row">
          <div class="form-group"><label>${t('lab_priority')}</label>
            <select id="lab-priority"><option value="routine">${t('lab_routine')}</option><option value="urgent">${t('lab_urgent')}</option><option value="stat">${t('lab_stat')}</option></select>
          </div>
        </div>
        <div class="form-group"><label>${t('notes')}</label><textarea id="lab-notes" rows="2"></textarea></div>
        <button type="submit" class="btn btn-primary">${t('order_lab_btn')}</button>
      </form>
    </div>
    ${resultsHtml}
  `;
}

// Selected lab tests queue
let _selectedLabTests = [];

function updateLabSubcategories() {
  const cat = document.getElementById('lab-cat').value;
  const lang = currentLanguage();
  const subSelect = document.getElementById('lab-subcat');
  const testSelect = document.getElementById('lab-test-select');
  document.getElementById('lab-prep-box').innerHTML = '';

  if (!cat) { subSelect.innerHTML = `<option value="">${t('lab_select_subcategory')}</option>`; subSelect.disabled = true; testSelect.innerHTML = `<option value="">${t('lab_select_test')}</option>`; testSelect.disabled = true; return; }

  const subs = [...new Set(LAB_TEST_CATALOG.filter(t => t.cat === cat).map(t => t.sub))];
  subSelect.innerHTML = `<option value="">${t('lab_select_subcategory')}</option>` +
    subs.map(s => `<option value="${s}">${t('subcat_' + s) || s}</option>`).join('');
  subSelect.disabled = false;
  testSelect.innerHTML = `<option value="">${t('lab_select_test')}</option>`;
  testSelect.disabled = true;
}

function updateLabTests() {
  const cat = document.getElementById('lab-cat').value;
  const sub = document.getElementById('lab-subcat').value;
  const lang = currentLanguage();
  const testSelect = document.getElementById('lab-test-select');
  document.getElementById('lab-prep-box').innerHTML = '';

  if (!sub) { testSelect.innerHTML = `<option value="">${t('lab_select_test')}</option>`; testSelect.disabled = true; return; }

  const tests = LAB_TEST_CATALOG.filter(t => t.cat === cat && t.sub === sub);
  testSelect.innerHTML = `<option value="">${t('lab_select_test')}</option>` +
    tests.map(t => `<option value="${t.code}">${lang === 'ar' ? t.name_ar : t.name_en}</option>`).join('');
  testSelect.disabled = false;
}

function onLabTestSelected() {
  const code = document.getElementById('lab-test-select').value;
  const lang = currentLanguage();
  if (!code) { document.getElementById('lab-prep-box').innerHTML = ''; return; }

  const test = LAB_TEST_CATALOG.find(t => t.code === code);
  if (!test) return;

  // Show prep notes
  const prep = lang === 'ar' ? test.prep_ar : test.prep_en;
  if (prep) {
    document.getElementById('lab-prep-box').innerHTML = `<div class="prep-notes-box"><span class="prep-icon">&#9888;</span> <strong>${t('lab_prep_notes')}:</strong> ${escapeHtml(prep)}${test.container ? `<br><strong>${t('lab_container')}:</strong> ${escapeHtml(test.container)}` : ''}</div>`;
  } else {
    document.getElementById('lab-prep-box').innerHTML = '';
  }

  // Add to selected list
  if (!_selectedLabTests.find(t => t.code === code)) {
    _selectedLabTests.push(test);
    renderSelectedLabTests();
  }

  // Reset selects
  document.getElementById('lab-test-select').value = '';
}

function addSuggestedLab(code) {
  if (_selectedLabTests.find(t => t.code === code)) return;
  const test = LAB_TEST_CATALOG.find(t => t.code === code);
  if (test) {
    _selectedLabTests.push(test);
    renderSelectedLabTests();
  }
}

function removeSelectedLab(code) {
  _selectedLabTests = _selectedLabTests.filter(t => t.code !== code);
  renderSelectedLabTests();
}

function renderSelectedLabTests() {
  const lang = currentLanguage();
  const container = document.getElementById('lab-selected-tests');
  if (!_selectedLabTests.length) { container.innerHTML = ''; return; }
  container.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px">${_selectedLabTests.map(t =>
    `<span class="badge badge-info" style="font-size:0.85rem;padding:6px 12px;cursor:pointer" onclick="removeSelectedLab('${t.code}')" title="${lang === 'ar' ? 'اضغط للإزالة' : 'Click to remove'}">
      ${lang === 'ar' ? t.name_ar : t.name_en} &times;</span>`
  ).join('')}</div>`;
}

function updateLabSuggestions() {
  // Could dynamically update suggestions when patient changes
}

async function handleOrderLab(e) {
  e.preventDefault();
  const user = getCurrentUser();
  const admissionId = document.getElementById('lab-patient').value;
  const priority = document.getElementById('lab-priority').value;
  const notes = document.getElementById('lab-notes').value.trim();

  if (!_selectedLabTests.length) { showError(t('error_required')); return; }

  const admission = dbGet('SELECT a.*, p.* FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.admission_id = ?', [admissionId]);
  const lang = currentLanguage();

  for (const test of _selectedLabTests) {
    const testName = lang === 'ar' ? test.name_ar : test.name_en;
    const prepNotes = lang === 'ar' ? test.prep_ar : test.prep_en;

    // Cardiology procedures skip specimen collection — go directly to 'received' for result entry
    const initStatus = test.cat === 'cardiology' ? 'received' : 'ordered';
    dbRun('INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, category, subcategory, specimen_type, priority, status, ordered_at, received_at, prep_notes, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [admissionId, user.user_id, testName, test.code, test.cat, test.sub, test.specimen, priority, initStatus, nowISO(), test.cat === 'cardiology' ? nowISO() : null, prepNotes || null, notes || null]);

    await logAction('LAB_ORDERED',
      `Doctor ${user.full_name_en} ordered ${test.name_en} (${priority}) for patient ${admission.full_name_en || admission.full_name_ar}`,
      null, admission.patient_id, admission.full_name_en || admission.full_name_ar, admission.mrn);
  }

  _selectedLabTests = [];
  showSuccess(t('lab_ordered_success'));
  saveDBToIndexedDB();
  navigateTo('doc-labs');
}

function showLabDetails(orderId) {
  const lang = currentLanguage();
  const details = dbAll('SELECT * FROM lab_result_details WHERE order_id = ?', [orderId]);
  if (!details.length) { showInfo(lang === 'ar' ? 'لا توجد تفاصيل' : 'No detailed results'); return; }

  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  overlay.innerHTML = `<div class="alert-modal" style="max-width:600px">
    <h2>${t('lab_view_results')}</h2>
    <div class="table-container"><table><thead><tr><th>${t('lab_component')}</th><th>${t('lab_result_value')}</th><th>${t('lab_unit')}</th><th>${t('lab_ref_range')}</th><th>${t('lab_result_flag')}</th></tr></thead>
    <tbody>${details.map(d => `<tr class="lab-result-row">
      <td>${lang === 'ar' ? escapeHtml(d.component_ar || d.component_en) : escapeHtml(d.component_en)}</td>
      <td><strong>${escapeHtml(d.value || '—')}</strong></td><td>${escapeHtml(d.unit || '')}</td>
      <td>${escapeHtml(d.ref_range || '')}</td>
      <td><span class="flag-${d.flag || 'normal'}">${escapeHtml(d.flag || 'normal')}</span></td>
    </tr>`).join('')}</tbody></table></div>
    <div class="alert-buttons"><button class="btn btn-secondary" onclick="this.closest('.alert-overlay').remove()">${t('close_btn')}</button></div>
  </div>`;
  document.body.appendChild(overlay);
}

// ============================================================
// DOCTOR — Consultation Notes
// ============================================================

function renderDocConsult(main, lang) {
  const session = getCurrentSession();
  const patients = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id
    FROM case_assignments ca JOIN admissions a ON ca.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    WHERE ca.doctor_id = ? AND a.status = 'active'`, [session.user_id]);

  if (!patients.length) { main.innerHTML = `<div class="page-header"><h1>${t('my_consultations')}</h1></div><div class="empty-state"><p>${t('no_data')}</p></div>`; return; }

  const patientOptions = patients.map(p => `<option value="${p.admission_id}" data-pid="${p.patient_id}">${escapeHtml(p.mrn)} — ${lang === 'ar' ? escapeHtml(p.full_name_ar) : escapeHtml(p.full_name_en || p.full_name_ar)}</option>`).join('');

  main.innerHTML = `
    <div class="page-header"><h1>${t('new_consultation')}</h1></div>
    <div class="card">
      <form onsubmit="handleConsultation(event)">
        <div class="form-row">
          <div class="form-group"><label>${t('patient_col')} *</label><select id="con-patient" required>${patientOptions}</select></div>
          <div class="form-group"><label>${lang === 'ar' ? 'نوع الاستشارة' : 'Consultation Type'} *</label>
            <select id="con-type" required>
              <option value="initial">${t('consult_initial')}</option>
              <option value="follow_up">${t('consult_followup')}</option>
              <option value="specialist">${t('consult_specialist')}</option>
              <option value="discharge">${t('consult_discharge')}</option>
            </select>
          </div>
        </div>
        <div class="form-group"><label>${t('subjective')}</label><textarea id="con-subj" rows="3" placeholder="${lang === 'ar' ? 'مثال: المريض يشكو من ألم متواصل في البطن منذ 3 أيام، يزداد بعد الأكل، مصحوب بغثيان' : 'e.g. Patient complains of continuous abdominal pain for 3 days, worsening after meals, associated with nausea'}"></textarea></div>
        <div class="form-group"><label>${t('objective')}</label><textarea id="con-obj" rows="3" placeholder="${lang === 'ar' ? 'مثال: البطن مؤلم عند الجس في الربع العلوي الأيمن. علامة Murphy إيجابية. لا توجد حرارة.' : 'e.g. Abdomen tender in RUQ. Positive Murphy sign. No fever. Bowel sounds present.'}"></textarea></div>
        <div class="form-group"><label>${t('assessment')}</label><textarea id="con-assess" rows="3" placeholder="${lang === 'ar' ? 'مثال: اشتباه التهاب المرارة الحاد\nالتشخيص التفريقي: حصوات مرارية، قرحة معدية' : 'e.g. Suspected acute cholecystitis\nDDx: Cholelithiasis, Peptic ulcer disease'}"></textarea></div>
        <div class="form-group"><label>${t('plan')}</label><textarea id="con-plan" rows="3" placeholder="${lang === 'ar' ? 'مثال:\n1. صيام (NPO)\n2. سوائل وريدية NS 1000mL / 8 ساعات\n3. مسكن: باراسيتامول 1غ وريدي كل 8 ساعات\n4. طلب تصوير بالموجات فوق الصوتية\n5. استشارة جراحة' : 'e.g.\n1. NPO\n2. IV fluids NS 1000mL over 8hrs\n3. Analgesia: Paracetamol 1g IV q8h\n4. Order abdominal ultrasound\n5. Surgical consult'}"></textarea></div>
        <button type="submit" class="btn btn-primary">${t('save_btn')}</button>
      </form>
    </div>
  `;
}

async function handleConsultation(e) {
  e.preventDefault();
  const user = getCurrentUser();
  const admissionId = document.getElementById('con-patient').value;
  const admission = dbGet('SELECT a.*, p.* FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.admission_id = ?', [admissionId]);

  dbRun(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    admissionId, user.user_id,
    document.getElementById('con-type').value,
    document.getElementById('con-subj').value.trim() || null,
    document.getElementById('con-obj').value.trim() || null,
    document.getElementById('con-assess').value.trim() || null,
    document.getElementById('con-plan').value.trim() || null,
    nowISO()
  ]);

  await logAction('CONSULTATION_ADDED',
    `Doctor ${user.full_name_en} wrote ${document.getElementById('con-type').value} consultation for patient ${admission.full_name_en || admission.full_name_ar}`,
    null, admission.patient_id, admission.full_name_en || admission.full_name_ar, admission.mrn);

  showSuccess(t('success_saved'));
  saveDBToIndexedDB();
  navigateTo('doc-consult');
}

// Discharge form
function showDischargeForm(patientId, admissionId) {
  const lang = currentLanguage();
  const container = document.getElementById('doc-action-form');

  // Compute readmission risk so the doctor sees it BEFORE discharging
  const riskWidgetHtml = typeof renderReadmissionRiskWidget === 'function'
    ? renderReadmissionRiskWidget(admissionId, lang)
    : '';

  container.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>${t('discharge_patient')}</h3></div>
      <form onsubmit="handleDischarge(event, ${patientId}, ${admissionId})">
        ${riskWidgetHtml}
        <div class="card mb-3" style="border-left:4px solid #fd7e14;background:#fffbf0;">
          <h4 style="color:#fd7e14;margin-bottom:10px;">&#9989; ${t('pre_discharge_checklist')}</h4>
          <p style="color:#666;font-size:0.85rem;margin-bottom:10px;">${t('pre_discharge_hint')}</p>
          ${[
            ['dc-chk-diagnosis', 'dc_chk_diagnosis'],
            ['dc-chk-meds', 'dc_chk_meds'],
            ['dc-chk-followup', 'dc_chk_followup'],
            ['dc-chk-education', 'dc_chk_education'],
            ['dc-chk-referrals', 'dc_chk_referrals'],
            ['dc-chk-transport', 'dc_chk_transport'],
          ].map(([id, key]) => `
            <label style="display:flex;align-items:center;gap:10px;margin-bottom:8px;cursor:pointer;padding:8px;border-radius:6px;background:#fff;">
              <input type="checkbox" id="${id}" style="width:18px;height:18px;" required>
              <span>${t(key)}</span>
            </label>
          `).join('')}
        </div>
        <div class="form-group"><label>${t('discharge_diagnosis')} *</label><textarea id="dc-diag" required rows="2" placeholder="${lang === 'ar' ? 'التشخيص النهائي عند الخروج' : 'Final diagnosis at discharge'}"></textarea></div>
        <div class="form-group"><label>${t('discharge_instructions')}</label><textarea id="dc-instructions" rows="3" placeholder="${lang === 'ar' ? 'تعليمات المتابعة بعد الخروج' : 'Post-discharge follow-up instructions'}"></textarea></div>
        <div class="form-group"><label>${t('followup_date')}</label><input type="date" id="dc-followup"></div>
        ${(() => {
          const pt = dbGet('SELECT emergency_contact_name, emergency_contact_phone, emergency_contact_relation FROM patients WHERE patient_id = ?', [patientId]);
          const hasEc = pt && (pt.emergency_contact_name || pt.emergency_contact_phone);
          return `<div class="card mb-2" style="background:#f0f7ff;border-left:3px solid #0d6efd;padding:12px;">
            <h4 style="margin-bottom:8px;">${t('dc_transport_person')}</h4>
            <p style="font-size:0.82rem;color:#666;margin-bottom:10px;">${lang === 'ar' ? 'سيُدرج اسم ورقم مستلم المريض في ملخص الخروج' : 'Transport person details will appear on the discharge summary'}</p>
            <div class="form-row">
              <div class="form-group"><label>${t('dc_transport_name')}</label><input type="text" id="dc-transport-name" value="${hasEc ? escapeHtml(pt.emergency_contact_name || '') : ''}" placeholder="${lang === 'ar' ? 'اسم المستلِم' : 'Receiving person name'}"></div>
              <div class="form-group"><label>${t('dc_transport_phone')}</label><input type="tel" id="dc-transport-phone" value="${hasEc ? escapeHtml(pt.emergency_contact_phone || '') : ''}" placeholder="05xxxxxxxx"></div>
              <div class="form-group"><label>${t('dc_transport_relation')}</label><input type="text" id="dc-transport-relation" value="${hasEc ? escapeHtml(pt.emergency_contact_relation || '') : ''}" placeholder="${lang === 'ar' ? 'أخ، زوجة، ابن...' : 'Spouse, Son, Friend...'}"></div>
            </div>
          </div>`;
        })()}
        <div class="flex gap-1">
          <button type="submit" class="btn btn-warning">${t('discharge_patient')}</button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('doc-action-form').innerHTML=''">${t('cancel_btn')}</button>
        </div>
      </form>
    </div>
  `;
}

async function handleDischarge(e, patientId, admissionId) {
  e.preventDefault();
  const lang = currentLanguage();
  const user = getCurrentUser();
  if (!user) { showError(lang === 'ar' ? 'انتهت الجلسة' : 'Session expired'); return; }

  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  if (!patient) { showError(lang === 'ar' ? 'المريض غير موجود' : 'Patient not found'); return; }

  // K2 fix: warn if discharging doctor is from a different dept than the admission
  const admForDept = dbGet('SELECT dept_id FROM admissions WHERE admission_id = ?', [admissionId]);
  if (admForDept && admForDept.dept_id && user.department_id && admForDept.dept_id !== user.department_id && user.role !== 'consultant') {
    const admDept = dbGet('SELECT name_en, name_ar FROM departments WHERE dept_id = ?', [admForDept.dept_id]);
    const userDept = dbGet('SELECT name_en, name_ar FROM departments WHERE dept_id = ?', [user.department_id]);
    const msg = lang === 'ar'
      ? `أنت من قسم <strong>${userDept ? userDept.name_ar : '?'}</strong> ولكن المريض في قسم <strong>${admDept ? admDept.name_ar : '?'}</strong>. هل أنت متأكد؟`
      : `You are in <strong>${userDept ? userDept.name_en : '?'}</strong> but patient is in <strong>${admDept ? admDept.name_en : '?'}</strong>. Cross-department discharge — proceed?`;
    return requireReasonToDecline(msg, `Cross-dept discharge: ${patient.mrn} by ${user.full_name_en}`,
      async () => { await _doDischargeFromForm(e, patientId, admissionId, patient, user, lang); },
      async (_reason) => { /* declined */ }
    );
  }
  await _doDischargeFromForm(e, patientId, admissionId, patient, user, lang);
}

async function _doDischargeFromForm(e, patientId, admissionId, patient, user, lang) {

  const diag = (document.getElementById('dc-diag')?.value || '').trim();
  if (!diag) { showError(lang === 'ar' ? 'التشخيص مطلوب' : 'Diagnosis required'); return; }

  // GUARD: Check for active orders before discharge
  const activeRx   = dbGet(`SELECT COUNT(*) as c FROM prescriptions WHERE admission_id = ? AND status = 'active'`, [admissionId]).c;
  const pendingLabs = dbGet(`SELECT COUNT(*) as c FROM lab_orders   WHERE admission_id = ? AND status IN ('ordered','collected','received')`, [admissionId]).c;
  const pendingTasks = dbGet(`SELECT COUNT(*) as c FROM nursing_tasks WHERE admission_id = ? AND status = 'pending'`, [admissionId]).c;

  const proceedDischarge = async () => {
    // Auto-close any remaining active orders (audit-friendly)
    if (activeRx > 0) {
      dbRun(`UPDATE prescriptions SET status = 'discontinued' WHERE admission_id = ? AND status = 'active'`, [admissionId]);
    }
    if (pendingLabs > 0) {
      dbRun(`UPDATE lab_orders SET status = 'cancelled' WHERE admission_id = ? AND status IN ('ordered','collected','received')`, [admissionId]);
    }
    if (pendingTasks > 0) {
      dbRun(`UPDATE nursing_tasks SET status = 'cancelled' WHERE admission_id = ? AND status = 'pending'`, [admissionId]);
    }

    // Compute & store readmission risk
    let riskScore = null, riskLevel = null, riskFactorsJson = null;
    if (typeof calcReadmissionRisk === 'function') {
      const risk = calcReadmissionRisk(admissionId);
      riskScore = risk.score;
      riskLevel = risk.level;
      riskFactorsJson = JSON.stringify(risk.factors);
    }

    dbRun(`UPDATE admissions SET status='discharged', discharged_at=?,
        readmission_risk_score=?, readmission_risk_level=?, readmission_risk_factors=?
        WHERE admission_id=?`,
      [nowISO(), riskScore, riskLevel, riskFactorsJson, admissionId]);

    const transportName     = (document.getElementById('dc-transport-name')?.value || '').trim();
    const transportPhone    = (document.getElementById('dc-transport-phone')?.value || '').trim();
    const transportRelation = (document.getElementById('dc-transport-relation')?.value || '').trim();
    const transportNote     = transportName ? `\n\n${lang === 'ar' ? 'مستلِم المريض' : 'Discharge Transport'}: ${transportName}${transportPhone ? ' — ' + transportPhone : ''}${transportRelation ? ' (' + transportRelation + ')' : ''}` : '';

    dbRun(`INSERT INTO consultations (admission_id, doctor_id, consult_type, assessment, plan, created_at) VALUES (?, ?, 'discharge', ?, ?, ?)`,
      [admissionId, user.user_id, diag, ((document.getElementById('dc-instructions')?.value || '').trim() + transportNote), nowISO()]);

    await logAction('PATIENT_DISCHARGED',
      `Doctor ${user.full_name_en} discharged patient ${patient.full_name_en || patient.full_name_ar} (MRN: ${patient.mrn}). Auto-closed: ${activeRx} Rx, ${pendingLabs} labs, ${pendingTasks} tasks`,
      null, patientId, patient.full_name_en || patient.full_name_ar, patient.mrn);

    showSuccess(lang === 'ar' ? 'تم خروج المريض بنجاح' : 'Patient discharged successfully');
    saveDBToIndexedDB();
    setTimeout(() => navigateTo('doc-patients'), 500);
  };

  // If there are pending items, ask for confirmation
  if (activeRx > 0 || pendingLabs > 0 || pendingTasks > 0) {
    const items = [];
    if (activeRx > 0)      items.push(`${activeRx} ${lang === 'ar' ? 'وصفة نشطة' : 'active prescription(s)'}`);
    if (pendingLabs > 0)   items.push(`${pendingLabs} ${lang === 'ar' ? 'فحص معلق' : 'pending lab(s)'}`);
    if (pendingTasks > 0)  items.push(`${pendingTasks} ${lang === 'ar' ? 'مهمة معلقة' : 'pending task(s)'}`);
    const msg = lang === 'ar'
      ? `يوجد لدى المريض: ${items.join('، ')}.\nسيتم إغلاقها تلقائياً عند الخروج. هل تريد المتابعة؟`
      : `This patient has: ${items.join(', ')}.\nThey will be auto-closed on discharge. Continue?`;
    showConfirm(msg, proceedDischarge);
  } else {
    await proceedDischarge();
  }
}

// ============================================================
// QR Code Scanner (HTML5 BarcodeDetector / jsQR fallback)
// ============================================================

function showQRScanner(onResult) {
  const lang = currentLanguage();
  const overlay = document.createElement('div');
  overlay.id = 'qr-scanner-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:95%;text-align:center;">
      <h3 style="margin-bottom:12px;">${t('scan_qr')}</h3>
      <p style="color:#666;font-size:0.85rem;margin-bottom:16px;">${t('qr_scan_hint')}</p>
      <div style="position:relative;width:100%;max-width:360px;margin:0 auto;">
        <video id="qr-video" style="width:100%;border-radius:8px;background:#000;" autoplay playsinline muted></video>
        <canvas id="qr-canvas" style="display:none;"></canvas>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:60%;height:60%;border:2px solid #00c851;border-radius:8px;pointer-events:none;"></div>
      </div>
      <p id="qr-status" style="margin-top:12px;color:#888;font-size:0.85rem;">${lang === 'ar' ? 'جارٍ تشغيل الكاميرا...' : 'Starting camera...'}</p>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">
        <input type="text" id="qr-manual-input" placeholder="${lang === 'ar' ? 'أو أدخل MRN يدوياً' : 'Or enter MRN manually'}" style="border:1px solid #ccc;border-radius:6px;padding:8px 12px;width:200px;">
        <button onclick="handleQRManualInput()" class="btn btn-primary btn-sm">${lang === 'ar' ? 'بحث' : 'Search'}</button>
      </div>
      <button onclick="closeQRScanner()" class="btn btn-secondary mt-2" style="margin-top:12px;">${t('cancel_btn')}</button>
    </div>
  `;
  document.body.appendChild(overlay);
  window._qrScannerCallback = onResult;

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      const video = document.getElementById('qr-video');
      if (!video) return;
      video.srcObject = stream;
      window._qrStream = stream;

      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const scan = () => {
          if (!document.getElementById('qr-scanner-overlay')) return;
          detector.detect(video).then(codes => {
            if (codes.length > 0) {
              closeQRScanner();
              processQRResult(codes[0].rawValue, onResult);
            } else {
              requestAnimationFrame(scan);
            }
          }).catch(() => requestAnimationFrame(scan));
        };
        video.addEventListener('loadedmetadata', scan);
        document.getElementById('qr-status').textContent = lang === 'ar' ? 'وجّه الكاميرا نحو رمز QR' : 'Point camera at QR code';
      } else {
        document.getElementById('qr-status').textContent = lang === 'ar' ? 'مسح QR غير مدعوم — استخدم الإدخال اليدوي' : 'QR scan not supported — use manual input';
      }
    })
    .catch(() => {
      document.getElementById('qr-status').textContent = lang === 'ar' ? 'تعذر الوصول للكاميرا — استخدم الإدخال اليدوي' : 'Camera unavailable — use manual input';
    });
}

function handleQRManualInput() {
  const val = (document.getElementById('qr-manual-input')?.value || '').trim();
  if (!val) return;
  closeQRScanner();
  processQRResult(val, window._qrScannerCallback);
}

function closeQRScanner() {
  if (window._qrStream) {
    window._qrStream.getTracks().forEach(t => t.stop());
    window._qrStream = null;
  }
  const el = document.getElementById('qr-scanner-overlay');
  if (el) el.remove();
}

function processQRResult(raw, callback) {
  const lang = currentLanguage();
  let data = null;
  // Try JSON parse (our QR format)
  try { data = JSON.parse(raw); } catch(e) {}

  if (data && data.type === 'patient' && data.mrn) {
    const patient = dbGet('SELECT * FROM patients WHERE mrn = ?', [data.mrn]);
    if (patient) {
      showSuccess(lang === 'ar' ? `تم التعرف على المريض: ${patient.full_name_ar}` : `Patient identified: ${patient.full_name_en || patient.full_name_ar}`);
      if (typeof callback === 'function') callback(patient, data);
      return;
    }
  }
  // Try as plain MRN string
  const patient = dbGet('SELECT * FROM patients WHERE UPPER(mrn) = ?', [raw.toUpperCase()]);
  if (patient) {
    showSuccess(lang === 'ar' ? `تم التعرف على المريض: ${patient.full_name_ar}` : `Patient identified: ${patient.full_name_en || patient.full_name_ar}`);
    if (typeof callback === 'function') callback(patient, null);
    return;
  }
  showError(lang === 'ar' ? 'لم يُعثر على مريض بهذا الرمز' : 'No patient found for this QR code');
}

// ============================================================
// NFC — Read / Write patient wristband
// ============================================================

async function writeNFCWristband(patientId) {
  const lang = currentLanguage();
  if (!('NDEFReader' in window)) {
    showError(t('nfc_not_supported'));
    return;
  }
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  if (!patient) return;
  const conds = dbAll('SELECT condition_code, category FROM patient_conditions WHERE patient_id = ?', [patientId]);
  const allergies = dbAll('SELECT allergen, severity FROM patient_allergies WHERE patient_id = ?', [patientId]);

  const nfcData = {
    type: 'patient',
    v: 2,
    patient_id: patient.patient_id,
    mrn: patient.mrn,
    name_ar: patient.full_name_ar,
    name_en: patient.full_name_en || patient.full_name_ar,
    dob: patient.date_of_birth,
    gender: patient.gender,
    blood_type: patient.blood_type,
    ec_name: patient.emergency_contact_name,
    ec_phone: patient.emergency_contact_phone,
    ec_relation: patient.emergency_contact_relation,
    allergies: allergies.map(a => a.allergen),
    conditions: conds.filter(c => c.category === 'chronic').map(c => c.condition_code),
    comm_diseases: conds.filter(c => c.category === 'communicable').map(c => c.condition_code),
  };

  try {
    showSuccess(t('nfc_writing'));
    const ndef = new NDEFReader();
    await ndef.write({ records: [{ recordType: 'text', data: JSON.stringify(nfcData) }] });
    showSuccess(t('nfc_success'));
  } catch(err) {
    showError(lang === 'ar' ? `فشل الكتابة: ${err.message}` : `NFC write failed: ${err.message}`);
  }
}

async function readNFCWristband(onResult) {
  const lang = currentLanguage();
  if (!('NDEFReader' in window)) {
    showError(t('nfc_not_supported'));
    return;
  }
  showSuccess(t('nfc_reading'));
  try {
    const ndef = new NDEFReader();
    await ndef.scan();
    ndef.onreading = ({ message }) => {
      for (const record of message.records) {
        if (record.recordType === 'text') {
          const text = new TextDecoder().decode(record.data);
          processQRResult(text, onResult);
          return;
        }
      }
    };
  } catch(err) {
    showError(lang === 'ar' ? `فشل قراءة NFC: ${err.message}` : `NFC read failed: ${err.message}`);
  }
}

// ============================================================
// Nosocomial (Hospital-Acquired) Infections
// ============================================================

function showNosocomialForm(patientId, admissionId, patientNameEn, patientNameAr) {
  const lang = currentLanguage();
  const existing = dbAll('SELECT n.*, u.full_name_en as doc_en FROM nosocomial_infections n LEFT JOIN users u ON n.identified_by = u.user_id WHERE n.admission_id = ?', [admissionId]);
  const typeOptions = Object.entries(NOSOCOMIAL_TYPES).map(([k, v]) => `<option value="${k}">${v[lang]}</option>`).join('');

  const modal = document.createElement('div');
  modal.id = 'nosocomial-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px;max-width:600px;width:100%;max-height:90vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="color:#dc3545;">${t('nosocomial_infections')}</h3>
        <button onclick="document.getElementById('nosocomial-modal').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;">&times;</button>
      </div>
      <p style="color:#666;font-size:0.85rem;margin-bottom:16px;">${lang === 'ar' ? 'المريض: ' : 'Patient: '}<strong>${lang === 'ar' ? patientNameAr : (patientNameEn || patientNameAr)}</strong></p>

      ${existing.length > 0 ? `
        <div style="margin-bottom:16px;">
          <h4 style="margin-bottom:8px;">${lang === 'ar' ? 'العدوى المسجّلة' : 'Recorded Infections'}</h4>
          ${existing.map(n => `
            <div style="background:#fff5f5;border-left:3px solid #dc3545;padding:10px;border-radius:6px;margin-bottom:8px;">
              <strong>${NOSOCOMIAL_TYPES[n.infection_type] ? NOSOCOMIAL_TYPES[n.infection_type][lang] : n.infection_type}</strong>
              ${n.pathogen ? ` — ${n.pathogen}` : ''}
              ${n.is_isolated ? ` <span style="background:#dc3545;color:#fff;border-radius:4px;padding:1px 6px;font-size:0.75rem;">${lang === 'ar' ? 'معزول' : 'ISOLATED'}</span>` : ''}
              <div style="font-size:0.8rem;color:#888;margin-top:4px;">${lang === 'ar' ? 'بتاريخ' : 'Identified'}: ${n.identified_at.split('T')[0]} ${n.doc_en ? '— ' + n.doc_en : ''}</div>
              ${n.treatment ? `<div style="font-size:0.82rem;margin-top:2px;">${lang === 'ar' ? 'العلاج: ' : 'Treatment: '}${n.treatment}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : `<p style="color:#888;font-style:italic;margin-bottom:16px;">${t('no_nosocomial')}</p>`}

      <form id="nosocomial-form" onsubmit="handleNosocomialSave(event, ${patientId}, ${admissionId})">
        <h4 style="margin-bottom:10px;">${t('add_nosocomial')}</h4>
        <div class="form-row">
          <div class="form-group">
            <label>${t('hai_infection_type')} *</label>
            <select id="hai-type" required>${typeOptions}</select>
          </div>
          <div class="form-group">
            <label>${t('hai_pathogen')} <span style="font-size:0.8rem;color:#888;">(${lang === 'ar' ? 'اختياري' : 'optional'})</span></label>
            <input type="text" id="hai-pathogen" placeholder="${lang === 'ar' ? 'مثال: Klebsiella, E.coli' : 'e.g. Klebsiella, E.coli'}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label><input type="checkbox" id="hai-isolated"> ${t('hai_isolated')}</label>
          </div>
        </div>
        <div class="form-group">
          <label>${t('hai_treatment')}</label>
          <textarea id="hai-treatment" rows="2" placeholder="${lang === 'ar' ? 'الأدوية والإجراءات المتخذة' : 'Medications and measures taken'}"></textarea>
        </div>
        <div class="form-group">
          <label>${t('notes_label')}</label>
          <textarea id="hai-notes" rows="2"></textarea>
        </div>
        <div class="flex gap-1">
          <button type="submit" class="btn btn-danger">${lang === 'ar' ? 'تسجيل العدوى' : 'Record Infection'}</button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('nosocomial-modal').remove()">${t('cancel_btn')}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
}

async function handleNosocomialSave(e, patientId, admissionId) {
  e.preventDefault();
  const lang = currentLanguage();
  const user = getCurrentUser();
  if (!user) return;

  const infType   = document.getElementById('hai-type').value;
  const pathogen  = document.getElementById('hai-pathogen').value.trim() || null;
  const isolated  = document.getElementById('hai-isolated').checked ? 1 : 0;
  const treatment = document.getElementById('hai-treatment').value.trim() || null;
  let notes       = document.getElementById('hai-notes').value.trim() || null;

  // F3 fix: if admission is discharged, require reason in notes (back-dating documentation)
  const admission = dbGet('SELECT status, discharged_at FROM admissions WHERE admission_id = ?', [admissionId]);
  if (admission && admission.status === 'discharged') {
    if (!notes || notes.length < 10) {
      showError(lang === 'ar'
        ? 'المريض مخرّج. يجب ذكر سبب التوثيق المتأخر (10 أحرف على الأقل) في حقل الملاحظات.'
        : 'Patient is already discharged. You MUST state the reason for late documentation (≥10 chars) in Notes.');
      return;
    }
    notes = '[POST-DISCHARGE BACKFILL] ' + notes;
  }

  dbRun(`INSERT INTO nosocomial_infections (admission_id, patient_id, infection_type, pathogen, identified_at, identified_by, is_isolated, treatment, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [admissionId, patientId, infType, pathogen, nowISO(), user.user_id, isolated, treatment, notes]);

  await logAction('HAI_RECORDED',
    `Dr. ${user.full_name_en} recorded HAI: ${NOSOCOMIAL_TYPES[infType]?.en || infType}${pathogen ? ' (' + pathogen + ')' : ''} for patient (admission ${admissionId})${admission && admission.status === 'discharged' ? ' [POST-DISCHARGE]' : ''}`,
    null, patientId, null, null);

  saveDBToIndexedDB();
  document.getElementById('nosocomial-modal').remove();
  showSuccess(lang === 'ar' ? 'تم تسجيل العدوى المكتسبة' : 'Hospital-acquired infection recorded');
}

// Inline Rx/Lab forms from detail view
function showRxForm(patientId, admissionId) {
  const lang = currentLanguage();
  const drugs = dbAll('SELECT * FROM drugs ORDER BY name_generic');
  // B8 fix: show stock + high-alert flag in drug dropdown so doctor sees BEFORE choosing
  const drugOptions = drugs.map(d => {
    const stockMark = (d.stock_qty !== null && d.stock_qty !== undefined && d.stock_qty <= 0)
      ? ' [' + (lang === 'ar' ? 'غير متوفر' : 'OUT OF STOCK') + ']'
      : (d.stock_qty !== null && d.stock_qty < (d.min_threshold || 10)) ? ' [' + (lang === 'ar' ? 'مخزون منخفض' : 'LOW STOCK ' + d.stock_qty) + ']' : '';
    const haMark = d.is_high_alert ? ' ⚠️' : '';
    return `<option value="${d.drug_id}" data-name="${escapeHtml(d.name_generic)}" data-stock="${d.stock_qty || 0}" data-high="${d.is_high_alert ? 1 : 0}">${d.name_generic}${d.name_brand ? ' (' + d.name_brand + ')' : ''}${stockMark}${haMark}</option>`;
  }).join('');
  const routeOptions = ['oral','iv','im','sc','sublingual','topical','inhaled','pr','ng_tube'].map(r => `<option value="${r}">${LANG['route_' + r] ? LANG['route_' + r][lang] : r}</option>`).join('');
  const freqOptions = ['once_daily','twice_daily','three_times_daily','four_times_daily','every_6h','every_8h','every_12h','as_needed','stat','once'].map(f => `<option value="${f}">${LANG['freq_' + f] ? LANG['freq_' + f][lang] : f}</option>`).join('');

  // Get patient weight & eGFR for auto-dose calculator
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  const weight = patient?.weight_kg || '';
  const egfr   = patient?.egfr || '';

  const container = document.getElementById('doc-action-form');
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>${t('write_prescription')}</h3></div>
      <form onsubmit="handleInlineRx(event, ${patientId}, ${admissionId})">
        <div class="form-row" style="background:#f9fafb;padding:8px 12px;border-radius:6px;margin-bottom:12px">
          <div class="form-group" style="margin:0"><label style="font-size:0.85rem">${t('autodose_weight')}</label><input type="number" id="irx-weight" value="${weight}" step="0.1" placeholder="kg" style="max-width:120px"></div>
          <div class="form-group" style="margin:0"><label style="font-size:0.85rem">${t('autodose_egfr')}</label><input type="number" id="irx-egfr" value="${egfr}" step="1" placeholder="mL/min" style="max-width:120px"></div>
          <div style="display:flex;align-items:end;font-size:0.75rem;color:#6b7280">
            ${lang==='ar'?'(تُستخدم لحساب الجرعة الذكية)':'(used for smart dose calculation)'}
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('drug_name')} *</label><select id="irx-drug" required><option value="">—</option>${drugOptions}</select></div>
          <div class="form-group"><label>${t('dose')} *</label>
            <input type="text" id="irx-dose" required placeholder="500mg">
            <div id="irx-dose-hint"></div>
          </div>
        </div>
        <div id="irx-autodose-widget"></div>
        <div class="form-row">
          <div class="form-group"><label>${t('route')} *</label><select id="irx-route" required>${routeOptions}</select></div>
          <div class="form-group"><label>${t('frequency')} *</label><select id="irx-freq" required>${freqOptions}</select></div>
        </div>
        <div class="flex gap-1">
          <button type="submit" class="btn btn-primary">${t('prescribe_btn')}</button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('doc-action-form').innerHTML=''">${t('cancel_btn')}</button>
        </div>
      </form>
    </div>
  `;

  // Wire context chips + dose hint + auto-dose widget
  requestAnimationFrame(() => {
    if (typeof getRxContextChips === 'function') {
      const chips = getRxContextChips(patientId, admissionId);
      const card = container.querySelector('.card');
      if (card && chips.length) showContextChips(card, chips);
    }
    const drugSel = document.getElementById('irx-drug');
    if (drugSel && typeof showDrugDoseChip === 'function') {
      drugSel.addEventListener('change', () => {
        const name = drugSel.selectedOptions[0]?.dataset?.name || '';
        showDrugDoseChip(name, 'irx-dose', 'irx-route', 'irx-freq',
          document.getElementById('irx-dose-hint'));
        // Also trigger auto-dose calc
        if (typeof renderAutoDoseWidget === 'function') {
          // Synthesize a "drug input" by writing to a hidden field
          let hiddenDrugInput = document.getElementById('irx-drug-name-hidden');
          if (!hiddenDrugInput) {
            hiddenDrugInput = document.createElement('input');
            hiddenDrugInput.type = 'hidden';
            hiddenDrugInput.id = 'irx-drug-name-hidden';
            document.querySelector('#doc-action-form .card form').appendChild(hiddenDrugInput);
          }
          hiddenDrugInput.value = name;
          renderAutoDoseWidget('irx-autodose-widget', {
            drugInputId: 'irx-drug-name-hidden',
            weightInputId: 'irx-weight',
            egfrInputId: 'irx-egfr',
            doseInputId: 'irx-dose',
            freqInputId: 'irx-freq'
          });
        }
      });
    }
    // Trigger re-calc on weight/egfr change
    ['irx-weight','irx-egfr'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => {
        if (typeof renderAutoDoseWidget === 'function' && document.getElementById('irx-drug-name-hidden')) {
          renderAutoDoseWidget('irx-autodose-widget', {
            drugInputId: 'irx-drug-name-hidden',
            weightInputId: 'irx-weight',
            egfrInputId: 'irx-egfr',
            doseInputId: 'irx-dose',
            freqInputId: 'irx-freq'
          });
        }
      });
    });
  });
}

async function handleInlineRx(e, patientId, admissionId) {
  e.preventDefault();
  const user = getCurrentUser();
  const lang = currentLanguage();
  const drugOption = document.getElementById('irx-drug').selectedOptions[0];
  if (!drugOption || !drugOption.dataset.name) { showError(lang==='ar'?'يرجى اختيار دواء':'Please select a drug'); return; }
  const drugName = drugOption.dataset.name;
  const drugId = document.getElementById('irx-drug').value;
  const dose = document.getElementById('irx-dose').value.trim();
  const route = document.getElementById('irx-route').value;
  const freq = document.getElementById('irx-freq').value;
  const admission = dbGet('SELECT a.*, p.* FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.admission_id = ?', [admissionId]);

  // Allergy check
  const patientAllergies = dbAll('SELECT * FROM patient_allergies WHERE patient_id = ?', [patientId]);
  const allergyMatch = checkDrugAllergy(drugName, patientAllergies);
  if (allergyMatch) {
    const sev = (allergyMatch.severity || '').toLowerCase();
    const isLifeThreatening = sev === 'life_threatening' || sev === 'severe' || sev === 'anaphylaxis';
    const msg = lang === 'ar'
      ? `تنبيه حساسية! المريض لديه حساسية من: ${escapeHtml(allergyMatch.allergen)} (${escapeHtml(allergyMatch.severity || '—')})`
      : `ALLERGY ALERT! Patient allergic to: ${escapeHtml(allergyMatch.allergen)} (${escapeHtml(allergyMatch.severity || '—')})`;
    if (isLifeThreatening) {
      showRedAlert(msg, async (reason) => {
        await logAction('ALLERGY_OVERRIDE', `${user.full_name_en} overrode allergy alert (${allergyMatch.allergen} → ${drugName}). Reason: ${reason}`, null, patientId, '', '');
        await checkInteractionsAndPrescribe(admissionId, drugId, drugName, dose, route, freq, '7_days', '', admission, user);
        showPatientDetail(patientId, admissionId);
      });
      return;
    } else {
      showYellowAlert(msg, async () => {
        await checkInteractionsAndPrescribe(admissionId, drugId, drugName, dose, route, freq, '7_days', '', admission, user);
        showPatientDetail(patientId, admissionId);
      });
      return;
    }
  }
  await checkInteractionsAndPrescribe(admissionId, drugId, drugName, dose, route, freq, '7_days', '', admission, user);
  showPatientDetail(patientId, admissionId);
}

function showLabForm(patientId, admissionId) {
  const lang = currentLanguage();
  const testOptions = LAB_TESTS.map(lt => `<option value="${lt.code}">${lang === 'ar' ? lt.name_ar : lt.name_en}</option>`).join('');
  const container = document.getElementById('doc-action-form');
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>${t('order_labs')}</h3></div>
      <form onsubmit="handleInlineLab(event, ${patientId}, ${admissionId})">
        <div class="form-group"><label>${t('lab_test_name')} *</label><select id="ilab-test" multiple required style="min-height:150px">${testOptions}</select></div>
        <div class="form-group"><label>${t('lab_priority')}</label>
          <select id="ilab-priority"><option value="routine">${t('lab_routine')}</option><option value="urgent">${t('lab_urgent')}</option><option value="stat">${t('lab_stat')}</option></select>
        </div>
        <div class="flex gap-1">
          <button type="submit" class="btn btn-primary">${t('order_lab_btn')}</button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('doc-action-form').innerHTML=''">${t('cancel_btn')}</button>
        </div>
      </form>
    </div>
  `;
}

async function handleInlineLab(e, patientId, admissionId) {
  e.preventDefault();
  const user = getCurrentUser();
  const selectedTests = Array.from(document.getElementById('ilab-test').selectedOptions).map(o => o.value);
  const priority = document.getElementById('ilab-priority').value;
  const admission = dbGet('SELECT a.*, p.* FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.admission_id = ?', [admissionId]);
  const lang = currentLanguage();

  for (const code of selectedTests) {
    const test = LAB_TESTS.find(t => t.code === code);
    const testName = test ? (lang === 'ar' ? test.name_ar : test.name_en) : code;
    dbRun('INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, priority, status, ordered_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [admissionId, user.user_id, testName, code, priority, 'ordered', nowISO()]);
  }

  showSuccess(t('lab_ordered_success'));
  saveDBToIndexedDB();
  showPatientDetail(patientId, admissionId);
}

function showConsultForm(patientId, admissionId) {
  const lang = currentLanguage();
  const container = document.getElementById('doc-action-form');
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>${t('new_consultation')}</h3></div>
      <form onsubmit="handleInlineConsult(event, ${patientId}, ${admissionId})">
        <div class="form-group"><label>${lang === 'ar' ? 'نوع الاستشارة' : 'Type'}</label>
          <select id="icon-type"><option value="follow_up">${t('consult_followup')}</option><option value="initial">${t('consult_initial')}</option><option value="specialist">${t('consult_specialist')}</option></select>
        </div>
        <div class="form-group"><label>S — ${t('subjective')}</label><textarea id="icon-subj" rows="2"></textarea></div>
        <div class="form-group"><label>O — ${t('objective')}</label><textarea id="icon-obj" rows="2"></textarea></div>
        <div class="form-group"><label>A — ${t('assessment')}</label><textarea id="icon-assess" rows="2"></textarea></div>
        <div class="form-group"><label>P — ${t('plan')}</label><textarea id="icon-plan" rows="2"></textarea></div>
        <div class="flex gap-1">
          <button type="submit" class="btn btn-primary">${t('save_btn')}</button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('doc-action-form').innerHTML=''">${t('cancel_btn')}</button>
        </div>
      </form>
    </div>
  `;
}

async function handleInlineConsult(e, patientId, admissionId) {
  e.preventDefault();
  const user = getCurrentUser();
  const admission = dbGet('SELECT a.*, p.* FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.admission_id = ?', [admissionId]);
  dbRun(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [admissionId, user.user_id, document.getElementById('icon-type').value,
     document.getElementById('icon-subj').value.trim() || null, document.getElementById('icon-obj').value.trim() || null,
     document.getElementById('icon-assess').value.trim() || null, document.getElementById('icon-plan').value.trim() || null, nowISO()]);

  showSuccess(t('success_saved'));
  saveDBToIndexedDB();
  showPatientDetail(patientId, admissionId);
}

// ============================================================
// SENIOR NURSE — Ward, Assignment, Supply
// ============================================================

function renderSNWard(main, lang) {
  const session = getCurrentSession();
  const patients = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn,
    na.nurse_id, nu.full_name_ar as nurse_ar, nu.full_name_en as nurse_en
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN nurse_assignments na ON a.admission_id = na.admission_id AND na.shift_date = date('now')
    LEFT JOIN users nu ON na.nurse_id = nu.user_id
    WHERE a.dept_id = ? AND a.status = 'active' ORDER BY a.bed_number`, [session.dept_id]);

  main.innerHTML = `
    <div class="page-header"><h1>${t('ward_overview')}</h1></div>
    ${patients.length === 0 ? `<div class="empty-state"><p>${t('no_data')}</p></div>` : `
    <div class="table-container">
      <table>
        <thead><tr><th>${t('bed_number')}</th><th>${t('mrn')}</th><th>${lang === 'ar' ? 'الاسم' : 'Name'}</th><th>${t('complexity')}</th><th>${t('diet_code')}</th><th>${t('assigned_nurse')}</th></tr></thead>
        <tbody>${patients.map(p => `<tr>
          <td>${p.bed_number || '—'}</td>
          <td>${p.mrn}</td>
          <td>${lang === 'ar' ? escapeHtml(p.full_name_ar) : escapeHtml(p.full_name_en || p.full_name_ar)}</td>
          <td>${p.complexity_score}/5</td>
          <td><span class="badge badge-info">${p.diet_code}</span></td>
          <td>${p.nurse_id ? (lang === 'ar' ? escapeHtml(p.nurse_ar) : escapeHtml(p.nurse_en)) : '<span class="badge badge-warning">' + t('unassigned') + '</span>'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`}
  `;
}

function renderSNAssign(main, lang) {
  const session = getCurrentSession();
  const unassigned = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN nurse_assignments na ON a.admission_id = na.admission_id AND na.shift_date = date('now')
    WHERE a.dept_id = ? AND a.status = 'active' AND na.assignment_id IS NULL`, [session.dept_id]);

  const nurses = dbAll("SELECT * FROM users WHERE role = 'nurse' AND department_id = ? AND is_active = 1", [session.dept_id]);
  const nurseOptions = nurses.map(n => `<option value="${n.user_id}">${lang === 'ar' ? escapeHtml(n.full_name_ar) : escapeHtml(n.full_name_en)}</option>`).join('');
  const shiftOptions = `<option value="morning">${t('shift_morning')}</option><option value="afternoon">${t('shift_afternoon')}</option><option value="night">${t('shift_night')}</option>`;

  // Workload dashboard (Sara persona): show each nurse's load today
  const workload = nurses.map(n => {
    const assigned = dbAll(`SELECT a.admission_id, a.complexity_score FROM nurse_assignments na
      JOIN admissions a ON na.admission_id = a.admission_id
      WHERE na.nurse_id = ? AND na.shift_date = date('now') AND a.status = 'active'`, [n.user_id]);
    const totalCx = assigned.reduce((s, x) => s + (x.complexity_score || 1), 0);
    return { nurse: n, count: assigned.length, totalCx, avgCx: assigned.length ? (totalCx / assigned.length).toFixed(1) : 0 };
  });
  workload.sort((a, b) => a.totalCx - b.totalCx);  // lightest-loaded first
  const maxCx = Math.max(...workload.map(w => w.totalCx), 1);

  const workloadCard = `
    <div class="card mb-3" style="border-left:4px solid #3b82f6;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="margin:0;">&#128202; ${lang === 'ar' ? 'حِمل العمل الحالي' : 'Current Workload'}</h3>
        <span style="font-size:0.82rem;color:#666;">${lang === 'ar' ? 'الأخف عبئاً أولاً' : 'Lightest-loaded first'}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;">
        ${workload.map(w => {
          const pct = (w.totalCx / maxCx) * 100;
          const color = w.totalCx > 12 ? '#dc2626' : w.totalCx > 8 ? '#f59e0b' : '#10b981';
          return `<div style="background:#f9fafb;border-radius:8px;padding:10px;">
            <div style="font-weight:600;font-size:0.88rem;">${escapeHtml(lang === 'ar' ? w.nurse.full_name_ar : w.nurse.full_name_en)}</div>
            <div style="font-size:0.78rem;color:#666;margin-bottom:6px;">
              ${w.count} ${lang === 'ar' ? 'مريض' : 'pts'} • ${lang === 'ar' ? 'متوسط' : 'avg'} ${w.avgCx} • ${lang === 'ar' ? 'إجمالي' : 'total cx'} ${w.totalCx}
            </div>
            <div style="background:#e5e7eb;height:6px;border-radius:3px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${color};"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  main.innerHTML = `
    <div class="page-header"><h1>${t('nurse_assignment')}</h1></div>
    ${workloadCard}
    ${unassigned.length === 0 ? `<div class="empty-state"><p>${lang === 'ar' ? 'جميع المرضى معينين' : 'All patients are assigned'}</p></div>` : `
    <div class="table-container">
      <table>
        <thead><tr><th>${t('mrn')}</th><th>${lang === 'ar' ? 'الاسم' : 'Name'}</th><th>${t('complexity')} ${help('ESI')}</th><th>${lang === 'ar' ? 'الممرض/ة' : 'Nurse'}</th><th>${lang === 'ar' ? 'المناوبة' : 'Shift'}</th><th>${t('actions')}</th></tr></thead>
        <tbody>${unassigned.map(p => {
          const cxBadge = p.complexity_score >= 4
            ? `<span class="badge" style="background:#dc2626;color:#fff;">${p.complexity_score}/5 ${lang === 'ar' ? '— حرج' : '— CRIT'}</span>`
            : p.complexity_score === 3 ? `<span class="badge badge-warning">${p.complexity_score}/5</span>`
            : `<span class="badge badge-info">${p.complexity_score}/5</span>`;
          return `<tr>
            <td>${p.mrn}</td>
            <td>${lang === 'ar' ? escapeHtml(p.full_name_ar) : escapeHtml(p.full_name_en || p.full_name_ar)}</td>
            <td>${cxBadge}</td>
            <td><select id="nassign-${p.admission_id}"><option value="">—</option>${nurseOptions}</select></td>
            <td><select id="nshift-${p.admission_id}">${shiftOptions}</select></td>
            <td><button class="btn btn-sm btn-primary" onclick="handleAssignNurse(${p.admission_id}, ${p.patient_id})">${t('assign_btn')}</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`}
  `;
}

async function handleAssignNurse(admissionId, patientId) {
  const lang = currentLanguage();
  const nurseId = document.getElementById('nassign-' + admissionId).value;
  if (!nurseId) { showError(t('error_required')); return; }
  const shift = document.getElementById('nshift-' + admissionId).value;
  const user = getCurrentUser();
  const nurse = dbGet('SELECT * FROM users WHERE user_id = ?', [nurseId]);
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  const admission = dbGet('SELECT * FROM admissions WHERE admission_id = ?', [admissionId]);

  // Warn if junior nurse (account < 6 months) is being assigned to critical patient (complexity >= 4)
  let isJunior = false;
  if (nurse.created_at) {
    const daysOld = (Date.now() - new Date(nurse.created_at).getTime()) / (24 * 3600 * 1000);
    isJunior = daysOld < 180;
  }
  // Also warn for current load > 8 cx points
  const curLoad = dbGet(`SELECT COALESCE(SUM(a.complexity_score), 0) AS total FROM nurse_assignments na JOIN admissions a ON na.admission_id=a.admission_id WHERE na.nurse_id=? AND na.shift_date=date('now') AND a.status='active'`, [nurseId]).total;

  const warnings = [];
  if (isJunior && admission.complexity_score >= 4) {
    warnings.push(lang === 'ar'
      ? `الممرض/ة ${nurse.full_name_ar} حديث/ة التعيين (<6 شهور)، والمريض حرج (${admission.complexity_score}/5).`
      : `Nurse ${nurse.full_name_en} is junior (<6mo), and patient is critical (${admission.complexity_score}/5).`);
  }
  if (curLoad + admission.complexity_score > 12) {
    warnings.push(lang === 'ar'
      ? `إضافة هذا المريض سترفع حِمل الممرض/ة إلى ${curLoad + admission.complexity_score} نقطة تعقيد (يفضّل ≤ 12).`
      : `This assignment will bring nurse total complexity load to ${curLoad + admission.complexity_score} (recommended ≤ 12).`);
  }

  const doAssign = async () => {
    dbRun('INSERT INTO nurse_assignments (admission_id, nurse_id, shift, shift_date, assigned_by, assigned_at) VALUES (?, ?, ?, date(?), ?, ?)',
      [admissionId, nurseId, shift, nowISO(), user.user_id, nowISO()]);
    await logAction('NURSE_ASSIGNED',
      `Senior Nurse ${user.full_name_en} assigned patient ${patient.full_name_en || patient.full_name_ar} (cx ${admission.complexity_score}) to Nurse ${nurse.full_name_en} for ${shift} shift on ${new Date().toISOString().slice(0,10)}${warnings.length ? ' [WARNINGS PRESENT]' : ''}`,
      null, patientId, patient.full_name_en || patient.full_name_ar, patient.mrn);
    showSuccess(t('success_saved'));
    saveDBToIndexedDB();
    navigateTo('sn-assign');
  };

  if (warnings.length > 0) {
    requireReasonToDecline(
      (lang === 'ar' ? '<strong>تنبيه التعيين:</strong>' : '<strong>Assignment warning:</strong>') + '<ul style="margin-top:6px;">' + warnings.map(w => '<li>' + w + '</li>').join('') + '</ul>',
      `Assign nurse ${nurse.full_name_en} to patient ${patient.mrn}`,
      doAssign,
      async (_reason) => { /* declined → don't assign */ }
    );
    return;
  }
  await doAssign();
}

function renderSNSupply(main, lang) {
  const session = getCurrentSession();
  const stock = dbAll(`SELECT si.*, COALESCE(ds.qty, 0) as qty, COALESCE(ds.min_threshold, 5) as threshold
    FROM supply_items si LEFT JOIN dept_supply_stock ds ON si.item_id = ds.item_id AND ds.dept_id = ?
    ORDER BY si.category, si.name_en`, [session.dept_id]);

  main.innerHTML = `
    <div class="page-header"><h1>${t('supply_stock')}</h1></div>
    <div class="table-container">
      <table>
        <thead><tr><th>${lang === 'ar' ? 'المستلزم' : 'Item'}</th><th>${lang === 'ar' ? 'الفئة' : 'Category'}</th><th>${t('quantity')}</th><th>${t('min_threshold')}</th><th>${t('status')}</th></tr></thead>
        <tbody>${stock.map(s => `<tr class="${s.qty <= s.threshold ? 'text-danger' : ''}">
          <td>${lang === 'ar' ? escapeHtml(s.name_ar) : escapeHtml(s.name_en)}</td>
          <td>${s.category}</td>
          <td>${s.qty}</td>
          <td>${s.threshold}</td>
          <td>${s.qty <= s.threshold ? '<span class="badge badge-danger">' + t('low_stock_alert') + '</span>' : '<span class="badge badge-success">OK</span>'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

// ============================================================
// NURSE — Patients, Tasks, Shift
// ============================================================

function renderNRPatients(main, lang) {
  const session = getCurrentSession();
  const today = new Date().toISOString().slice(0, 10);
  const patients = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id,
    na.assignment_id, na.transferred_from, na.acknowledged_at,
    fromU.full_name_en as transferred_from_en, fromU.full_name_ar as transferred_from_ar
    FROM nurse_assignments na
    JOIN admissions a ON na.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN users fromU ON na.transferred_from = fromU.user_id
    WHERE na.nurse_id = ? AND na.shift_date = ? AND a.status = 'active' ORDER BY a.bed_number`, [session.user_id, today]);

  // "What needs my attention?" widget — top 3 priorities right now
  const admissionIds = patients.map(p => p.admission_id);
  const priorities = computeNurseAttention(admissionIds, session.user_id);

  main.innerHTML = `
    <div class="page-header"><h1>${t('my_patients')}</h1></div>
    ${renderAttentionWidget(priorities, lang)}
    ${patients.length === 0 ? `<div class="empty-state"><p>${t('no_data')}</p></div>` : `
    <div class="table-container">
      <table>
        <thead><tr>
          <th>${t('bed_number')}</th><th>${t('mrn')}</th><th>${lang === 'ar' ? 'الاسم' : 'Name'}</th>
          <th>${lang === 'ar' ? 'الحالة' : 'Status'}</th>
          <th>${t('complexity')}</th><th>${t('diet_code')}</th><th>${t('actions')}</th>
        </tr></thead>
        <tbody>${patients.map(p => {
          const flags = quickPatientFlags(p.patient_id, p.admission_id, lang);
          const isTransferred = p.transferred_from && !p.acknowledged_at;
          const transferBadge = isTransferred
            ? `<div style="margin-top:4px;"><span class="badge" style="background:#7c3aed;color:#fff;animation:pulse 1.5s infinite;">${lang === 'ar' ? `&#128257; جديد — من ${escapeHtml(p.transferred_from_ar || '?')}` : `&#128257; NEW — from ${escapeHtml(p.transferred_from_en || '?')}`}</span>
                <button class="btn btn-sm" style="background:#7c3aed;border-color:#7c3aed;color:#fff;font-size:0.7rem;padding:2px 8px;margin-left:6px;" onclick="acknowledgeHandoff(${p.assignment_id})">${lang === 'ar' ? '&check; استلام' : '&check; Acknowledge'}</button></div>`
            : '';
          return `<tr ${isTransferred ? 'style="background:#faf5ff;"' : ''}>
            <td>${p.bed_number || '—'}</td><td>${p.mrn}</td>
            <td>${lang === 'ar' ? escapeHtml(p.full_name_ar) : escapeHtml(p.full_name_en || p.full_name_ar)}${transferBadge}</td>
            <td>${flags}</td>
            <td>${p.complexity_score}/5</td>
            <td><span class="badge badge-info">${p.diet_code}</span></td>
            <td><button class="btn btn-sm btn-primary" onclick="showNurseActions(${p.admission_id}, ${p.patient_id})">${t('details')}</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`}
  `;
}

// Quick flags shown next to patient name on the list — gives nurse at-a-glance status
function quickPatientFlags(patientId, admissionId, lang) {
  const flags = [];
  const allergies = dbGet('SELECT COUNT(*) AS c FROM patient_allergies WHERE patient_id=?', [patientId]).c;
  if (allergies > 0) flags.push(`<span class="badge badge-danger" title="${lang==='ar'?'حساسية':'Allergies'}" style="margin-right:2px;">&#9888; ${allergies}</span>`);

  const commCt = dbGet("SELECT COUNT(*) AS c FROM patient_conditions WHERE patient_id=? AND category='communicable'", [patientId]).c;
  if (commCt > 0) flags.push(`<span class="badge" style="background:#dc2626;color:#fff;margin-right:2px;" title="${lang==='ar'?'مرض معدٍ':'Communicable'}">&#9763;</span>`);

  const haiCt = dbGet('SELECT COUNT(*) AS c FROM nosocomial_infections WHERE admission_id=?', [admissionId]).c;
  if (haiCt > 0) flags.push(`<span class="badge" style="background:#fd7e14;color:#fff;margin-right:2px;" title="HAI">&#127861;</span>`);

  const critUnack = dbGet(`SELECT COUNT(*) AS c FROM lab_orders lo LEFT JOIN lab_critical_acks lca ON lo.order_id=lca.order_id WHERE lo.admission_id=? AND lo.is_critical=1 AND lo.status='resulted' AND lca.ack_id IS NULL`, [admissionId]).c;
  if (critUnack > 0) flags.push(`<span class="badge" style="background:#dc2626;color:#fff;margin-right:2px;font-weight:700;animation:pulse 1.5s infinite;" title="${lang==='ar'?'نتائج حرجة':'Critical labs'}">&#128680;</span>`);

  const lastVit = dbGet('SELECT recorded_at FROM vitals_log WHERE admission_id=? ORDER BY recorded_at DESC LIMIT 1', [admissionId]);
  if (lastVit) {
    const hoursAgo = (Date.now() - new Date(lastVit.recorded_at).getTime()) / 3600000;
    if (hoursAgo >= 4) flags.push(`<span class="badge badge-warning" title="${lang==='ar'?'علامات حيوية متأخرة':'Vitals overdue'}">&#9201; ${Math.floor(hoursAgo)}h</span>`);
  } else {
    flags.push(`<span class="badge badge-warning" title="${lang==='ar'?'لا علامات حيوية':'No vitals'}">&#9201; —</span>`);
  }

  return flags.length ? flags.join('') : `<span style="color:#16a34a;font-size:1rem;" title="OK">&check;</span>`;
}

// Compute the top 3-5 things this nurse needs to do right now
function computeNurseAttention(admissionIds, nurseId) {
  if (!admissionIds.length) return [];
  const placeholders = admissionIds.map(() => '?').join(',');
  const out = [];
  const lang = currentLanguage();

  // 1. Critical labs unacknowledged on assigned patients
  const critLabs = dbAll(`SELECT lo.order_id, lo.test_name, lo.admission_id, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id, a.bed_number
    FROM lab_orders lo
    JOIN admissions a ON lo.admission_id=a.admission_id
    JOIN patients p ON a.patient_id=p.patient_id
    LEFT JOIN lab_critical_acks lca ON lo.order_id=lca.order_id
    WHERE lo.admission_id IN (${placeholders})
      AND lo.is_critical=1 AND lo.status='resulted' AND lca.ack_id IS NULL
    LIMIT 5`, admissionIds);
  for (const l of critLabs) {
    out.push({
      sev: 'red',
      icon: '&#128680;',
      title: lang === 'ar' ? `نتيجة حرجة: ${l.test_name}` : `Critical lab: ${l.test_name}`,
      subtitle: `${lang === 'ar' ? l.full_name_ar : (l.full_name_en || l.full_name_ar)} • ${l.bed_number || '—'}`,
      action: `showPatientDetail(${l.patient_id}, ${l.admission_id})`,
      actionLabel: lang === 'ar' ? 'مراجعة' : 'Review',
    });
  }

  // 2. MAR doses due within next hour
  const nowIso = new Date().toISOString();
  const inOneHour = new Date(Date.now() + 3600000).toISOString();
  const dueMar = dbAll(`SELECT mar.mar_id, mar.drug_name, mar.dose, mar.scheduled_time, mar.admission_id, p.full_name_ar, p.full_name_en, p.patient_id, a.bed_number
    FROM med_admin_records mar
    JOIN admissions a ON mar.admission_id=a.admission_id
    JOIN patients p ON a.patient_id=p.patient_id
    WHERE mar.admission_id IN (${placeholders}) AND mar.status='pending'
      AND mar.scheduled_time <= ? ORDER BY mar.scheduled_time LIMIT 5`, [...admissionIds, inOneHour]);
  for (const m of dueMar) {
    const overdue = new Date(m.scheduled_time) < new Date(nowIso);
    out.push({
      sev: overdue ? 'red' : 'yellow',
      icon: '&#128138;',
      title: lang === 'ar' ? `${m.drug_name} ${m.dose} — ${overdue ? 'متأخرة' : 'موعد قريب'}` : `${m.drug_name} ${m.dose} — ${overdue ? 'OVERDUE' : 'due soon'}`,
      subtitle: `${lang === 'ar' ? m.full_name_ar : (m.full_name_en || m.full_name_ar)} • ${m.bed_number || '—'}`,
      action: `navigateTo('nr-mar')`,
      actionLabel: lang === 'ar' ? 'إعطاء' : 'Administer',
    });
  }

  // 3. Vitals overdue (>4h since last)
  const fourHoursAgo = new Date(Date.now() - 4 * 3600000).toISOString();
  const stale = dbAll(`SELECT a.admission_id, p.full_name_ar, p.full_name_en, p.patient_id, a.bed_number,
    (SELECT MAX(recorded_at) FROM vitals_log WHERE admission_id=a.admission_id) AS last_vital
    FROM admissions a JOIN patients p ON a.patient_id=p.patient_id
    WHERE a.admission_id IN (${placeholders})
    HAVING last_vital IS NULL OR last_vital < ?
    LIMIT 5`, [...admissionIds, fourHoursAgo]);
  for (const s of stale) {
    out.push({
      sev: 'yellow',
      icon: '&#128202;',
      title: lang === 'ar' ? 'علامات حيوية متأخرة' : 'Vitals overdue',
      subtitle: `${lang === 'ar' ? s.full_name_ar : (s.full_name_en || s.full_name_ar)} • ${s.bed_number || '—'}`,
      action: `showNurseActions(${s.admission_id}, ${s.patient_id})`,
      actionLabel: lang === 'ar' ? 'فتح' : 'Open',
    });
  }

  // 4. Pending lab collections
  const pendingLabs = dbAll(`SELECT lo.order_id, lo.test_name, lo.priority, lo.admission_id, p.full_name_ar, p.full_name_en, p.patient_id, a.bed_number
    FROM lab_orders lo JOIN admissions a ON lo.admission_id=a.admission_id
    JOIN patients p ON a.patient_id=p.patient_id
    WHERE lo.admission_id IN (${placeholders}) AND lo.status='ordered' AND (lo.category IS NULL OR lo.category NOT IN ('radiology','cardiology'))
    ORDER BY CASE lo.priority WHEN 'stat' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END
    LIMIT 5`, admissionIds);
  for (const l of pendingLabs) {
    out.push({
      sev: l.priority === 'stat' ? 'red' : l.priority === 'urgent' ? 'yellow' : 'blue',
      icon: '&#129514;',
      title: lang === 'ar' ? `سحب: ${l.test_name}` : `Collect: ${l.test_name}`,
      subtitle: `${lang === 'ar' ? l.full_name_ar : (l.full_name_en || l.full_name_ar)} • ${l.bed_number || '—'} • ${l.priority.toUpperCase()}`,
      action: `showNurseActions(${l.admission_id}, ${l.patient_id})`,
      actionLabel: lang === 'ar' ? 'سحب' : 'Collect',
    });
  }

  // Sort by severity, then truncate
  const sevRank = { red: 0, yellow: 1, blue: 2 };
  out.sort((a, b) => (sevRank[a.sev] || 3) - (sevRank[b.sev] || 3));
  return out.slice(0, 6);
}

function renderAttentionWidget(items, lang) {
  if (!items.length) {
    return `<div style="background:#ecfdf5;border-left:4px solid #10b981;padding:12px 16px;border-radius:8px;margin-bottom:16px;">
      <strong style="color:#065f46;">&check; ${lang === 'ar' ? 'لا توجد مهام عاجلة الآن' : 'No urgent items right now'}</strong>
      <p style="margin-top:4px;color:#047857;font-size:0.85rem;">${lang === 'ar' ? 'استمر بالرعاية الروتينية. سيظهر التنبيه هنا فور ظهور أي مهمة عاجلة.' : 'Continue routine care. New urgent items will appear here automatically.'}</p>
    </div>`;
  }
  const sevColor = { red: '#dc2626', yellow: '#f59e0b', blue: '#3b82f6' };
  return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:18px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:1.2rem;">&#128276;</span>
      <strong style="font-size:1rem;">${lang === 'ar' ? 'ماذا يحتاج انتباهك الآن؟' : 'What needs your attention now?'}</strong>
      <span style="margin-left:auto;background:#fef2f2;color:#991b1b;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;">${items.length}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;">
      ${items.map(it => `<div style="border-left:4px solid ${sevColor[it.sev] || '#888'};padding:8px 10px;background:#fafafa;border-radius:0 6px 6px 0;display:flex;align-items:center;gap:10px;">
        <span style="font-size:1.2rem;">${it.icon}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.85rem;font-weight:600;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.title}</div>
          <div style="font-size:0.75rem;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.subtitle}</div>
        </div>
        <button class="btn btn-sm btn-primary" style="flex-shrink:0;font-size:0.75rem;padding:4px 10px;" onclick="${it.action}">${it.actionLabel} &rarr;</button>
      </div>`).join('')}
    </div>
  </div>`;
}

function showNurseActions(admissionId, patientId) {
  const lang = currentLanguage();
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  const main = document.getElementById('main-content');

  // Patient warnings
  const warningsHtml = renderPatientWarningsHTML(patientId, lang);

  // Pending lab collections for this patient
  const pendingLabs = dbAll(`SELECT * FROM lab_orders WHERE admission_id = ? AND status = 'ordered' ORDER BY CASE priority WHEN 'stat' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, ordered_at`, [admissionId]);
  let pendingLabsHtml = '';
  if (pendingLabs.length > 0) {
    pendingLabsHtml = `<div class="card mb-3">
      <div class="card-header"><h3>${t('lab_pending_collection')}</h3></div>
      <div class="table-container"><table><thead><tr><th>${t('lab_test_name')}</th><th>${t('lab_priority')}</th><th>${t('lab_prep_notes')}</th><th>${t('lab_container')}</th><th>${t('actions')}</th></tr></thead>
      <tbody>${pendingLabs.map(l => {
        const test = typeof LAB_TEST_CATALOG !== 'undefined' ? LAB_TEST_CATALOG.find(t => t.code === l.test_code) : null;
        const prep = l.prep_notes || (test ? (lang === 'ar' ? test.prep_ar : test.prep_en) : '');
        const container = test ? test.container : '';
        const priBadge = l.priority === 'stat' ? 'badge-danger' : l.priority === 'urgent' ? 'badge-warning' : 'badge-neutral';
        return `<tr>
          <td>${escapeHtml(l.test_name)}</td>
          <td><span class="badge ${priBadge}">${l.priority.toUpperCase()}</span></td>
          <td>${prep ? `<span class="text-warning">${escapeHtml(prep)}</span>` : '—'}</td>
          <td>${container ? escapeHtml(container) : '—'}</td>
          <td><button class="btn btn-sm btn-success" onclick="handleMarkCollected(${l.order_id}, ${admissionId}, ${patientId})">${t('lab_mark_collected')}</button></td>
        </tr>`;
      }).join('')}</tbody></table></div></div>`;
  }

  // Nursing procedure guide
  const procCategories = typeof NURSING_PROCEDURES !== 'undefined' ? [...new Set(NURSING_PROCEDURES.map(p => p.cat))] : [];
  let procGuideHtml = '';
  if (procCategories.length > 0) {
    const catOpts = procCategories.map(c => `<option value="${c}">${t('proc_cat_' + c) || c}</option>`).join('');
    procGuideHtml = `<div class="card mb-3">
      <div class="card-header"><h3>${t('proc_guide')}</h3></div>
      <div class="form-row">
        <div class="form-group"><label>${lang === 'ar' ? 'فئة الإجراء' : 'Procedure Category'}</label>
          <select id="proc-cat" onchange="updateProcList()"><option value="">${t('proc_select')}</option>${catOpts}</select></div>
        <div class="form-group"><label>${lang === 'ar' ? 'الإجراء' : 'Procedure'}</label>
          <select id="proc-select" onchange="showProcedureSteps(${admissionId}, ${patientId})" disabled><option value="">${t('proc_select')}</option></select></div>
      </div>
      <div id="proc-steps-container"></div>
    </div>`;
  }

  // Embedded MAR (round-1 gap fix): show today's active meds inline so nurse doesn't have to leave the chart
  const todayMar = dbAll(`SELECT p.rx_id, p.drug_name, p.dose, p.route, p.frequency, p.verified_at,
    d.is_high_alert,
    (SELECT status FROM med_admin_records WHERE prescription_id = p.rx_id ORDER BY administered_at DESC LIMIT 1) AS last_status,
    (SELECT administered_at FROM med_admin_records WHERE prescription_id = p.rx_id ORDER BY administered_at DESC LIMIT 1) AS last_time
    FROM prescriptions p LEFT JOIN drugs d ON p.drug_id = d.drug_id
    WHERE p.admission_id = ? AND p.status = 'active' ORDER BY p.prescribed_at DESC`, [admissionId]);
  const marHtml = todayMar.length === 0 ? '' : `
    <div class="card mb-3" style="border-left:4px solid #3b82f6;">
      <div class="card-header" style="background:#eff6ff;display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;">&#128138; ${lang === 'ar' ? 'سجل الأدوية (MAR) اليوم' : 'Medication Administration (MAR) — Today'}</h3>
        <button class="btn btn-sm btn-primary" onclick="navigateTo('nr-mar')">${lang === 'ar' ? 'فتح MAR الكامل' : 'Open full MAR'}</button>
      </div>
      <div class="table-container" style="margin:0;">
        <table>
          <thead><tr>
            <th>${lang === 'ar' ? 'الدواء' : 'Drug'}</th>
            <th>${lang === 'ar' ? 'الجرعة' : 'Dose'}</th>
            <th>${lang === 'ar' ? 'المسار' : 'Route'}</th>
            <th>${lang === 'ar' ? 'التكرار' : 'Freq'}</th>
            <th>${lang === 'ar' ? 'آخر إعطاء' : 'Last given'}</th>
            <th>${lang === 'ar' ? 'الحالة' : 'Status'}</th>
            <th>${t('actions')}</th>
          </tr></thead>
          <tbody>${todayMar.map(m => {
            const verBadge = m.verified_at
              ? '<span class="badge badge-success">&check;</span>'
              : '<span class="badge ph-badge-pending">&#128274;</span>';
            const haBadge = m.is_high_alert ? ' <span style="color:#dc2626;font-size:0.7rem;">⚠HA</span>' : '';
            const lastStatusBadge = m.last_status === 'given' ? 'badge-success' : m.last_status === 'held' ? 'badge-danger' : m.last_status === 'refused' ? 'badge-warning' : 'badge-neutral';
            return `<tr>
              <td><strong>${escapeHtml(m.drug_name)}</strong>${haBadge}</td>
              <td>${escapeHtml(m.dose)}</td>
              <td>${m.route}</td>
              <td>${escapeHtml(m.frequency || '—')}</td>
              <td style="font-size:0.78rem;">${m.last_time ? formatDateTime(m.last_time) : '—'}</td>
              <td>${verBadge} ${m.last_status ? `<span class="badge ${lastStatusBadge}">${t('mar_' + m.last_status) || m.last_status}</span>` : ''}</td>
              <td>${m.verified_at
                ? `<button class="btn btn-sm btn-primary" onclick="showMARLogForm(${m.rx_id}, ${admissionId}, '${escapeHtml(m.drug_name).replace(/'/g,'')}', '${escapeHtml(m.dose).replace(/'/g,'')}', '${m.route}')">${lang === 'ar' ? 'إعطاء' : 'Give'}</button>`
                : `<button class="btn btn-sm btn-secondary" disabled style="opacity:0.5;cursor:not-allowed;" title="${lang === 'ar' ? 'بانتظار اعتماد الصيدلة' : 'Awaiting pharmacist verify'}">&#128274;</button>`}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>`;

  main.innerHTML = `
    ${renderSafetyBanner(patientId, admissionId, lang)}
    ${renderPatientStory(patientId, admissionId, lang)}
    <div class="page-header">
      <h1>${lang === 'ar' ? escapeHtml(patient.full_name_ar) : escapeHtml(patient.full_name_en || patient.full_name_ar)} — ${patient.mrn}</h1>
      <button class="btn btn-secondary" onclick="navigateTo('nr-patients')">${t('back_btn')}</button>
    </div>
    ${marHtml}
    ${warningsHtml}
    ${pendingLabsHtml}
    <div class="card mb-3">
      <h3>${t('task_vitals_check')}</h3>
      <form onsubmit="handleRecordVitals(event, ${admissionId}, ${patientId})">
        <div class="form-row">
          <div class="form-group"><label>${t('bp_systolic')} (mmHg)</label><input type="number" id="nv-sys" placeholder="120"></div>
          <div class="form-group"><label>${t('bp_diastolic')} (mmHg)</label><input type="number" id="nv-dia" placeholder="80"></div>
          <div class="form-group"><label>${t('heart_rate')} (bpm)</label><input type="number" id="nv-hr" placeholder="80"></div>
          <div class="form-group"><label>${t('temperature')} (&deg;C)</label><input type="number" step="0.1" id="nv-temp" placeholder="37.0"></div>
          <div class="form-group"><label>${t('o2_saturation')} (%)</label><input type="number" id="nv-o2" placeholder="98"></div>
          <div class="form-group"><label>${t('rbs_value')} (mg/dL)</label><input type="number" id="nv-rbs" placeholder=""></div>
          <div class="form-group"><label>${t('resp_rate')} (${lang==='ar'?'نفس/دقيقة':'breaths/min'})</label><input type="number" id="nv-rr" placeholder="16"></div>
          <div class="form-group" style="align-self:flex-end;padding-bottom:8px;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="nv-o2-supp" style="width:20px;height:20px;">
              <span>${t('on_o2_supplement')}</span>
            </label>
          </div>
          <div class="form-group"><label>${t('consciousness_level')}</label>
            <select id="nv-consciousness">
              <option value="alert">${t('consciousness_alert')}</option>
              <option value="voice">${t('consciousness_voice')}</option>
              <option value="pain">${t('consciousness_pain')}</option>
              <option value="unresponsive">${t('consciousness_unresponsive')}</option>
            </select>
          </div>
        </div>
        <button type="submit" class="btn btn-primary">${t('save_btn')}</button>
      </form>
    </div>
    <div class="card mb-3">
      <h3>${lang === 'ar' ? 'تسجيل مهمة' : 'Log a Task'}</h3>
      <form onsubmit="handleNursingTask(event, ${admissionId}, ${patientId})">
        <div class="form-row">
          <div class="form-group"><label>${lang === 'ar' ? 'نوع المهمة' : 'Task Type'}</label>
            <select id="nt-type">
              <option value="repositioning">${t('task_repositioning')}</option>
              <option value="medication_given">${t('task_medication_given')}</option>
              <option value="iv_check">${t('task_iv_check')}</option>
              <option value="fluid_intake">${t('task_fluid_intake')}</option>
              <option value="urine_output">${t('task_urine_output')}</option>
              <option value="wound_care">${t('task_wound_care')}</option>
              <option value="hygiene">${t('task_hygiene')}</option>
              <option value="blood_sugar_check">${t('task_blood_sugar')}</option>
              <option value="patient_education">${t('task_education')}</option>
            </select>
          </div>
        </div>
        <div class="form-group"><label>${t('notes')}</label><textarea id="nt-notes" rows="2"></textarea></div>
        <button type="submit" class="btn btn-primary">${t('mark_done')}</button>
      </form>
    </div>
    ${procGuideHtml}
  `;
}

async function handleMarkCollected(orderId, admissionId, patientId) {
  const user = getCurrentUser();
  const order = dbGet('SELECT * FROM lab_orders WHERE order_id = ?', [orderId]);
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);

  dbRun('UPDATE lab_orders SET status = ?, collected_by = ?, collected_at = ? WHERE order_id = ?',
    ['collected', user.user_id, nowISO(), orderId]);

  await logAction('LAB_COLLECTED',
    `Nurse ${user.full_name_en} collected sample for ${order.test_name} from patient ${patient.full_name_en || patient.full_name_ar}`,
    null, patientId, patient.full_name_en || patient.full_name_ar, patient.mrn);

  showSuccess(t('lab_collected_success'));
  saveDBToIndexedDB();
  showNurseActions(admissionId, patientId);
}

function updateProcList() {
  const cat = document.getElementById('proc-cat').value;
  const lang = currentLanguage();
  const procSelect = document.getElementById('proc-select');
  document.getElementById('proc-steps-container').innerHTML = '';

  if (!cat) { procSelect.innerHTML = `<option value="">${t('proc_select')}</option>`; procSelect.disabled = true; return; }

  const procs = NURSING_PROCEDURES.filter(p => p.cat === cat);
  procSelect.innerHTML = `<option value="">${t('proc_select')}</option>` +
    procs.map(p => `<option value="${p.code}">${lang === 'ar' ? p.name_ar : p.name_en}</option>`).join('');
  procSelect.disabled = false;
}

function showProcedureSteps(admissionId, patientId) {
  const code = document.getElementById('proc-select').value;
  const lang = currentLanguage();
  const container = document.getElementById('proc-steps-container');
  if (!code) { container.innerHTML = ''; return; }

  const proc = NURSING_PROCEDURES.find(p => p.code === code);
  if (!proc) return;

  const steps = lang === 'ar' ? proc.steps_ar : proc.steps_en;
  const warnings = lang === 'ar' ? proc.warnings_ar : proc.warnings_en;

  let html = `<div class="procedure-checklist mt-2">`;
  steps.forEach((step, i) => {
    html += `<div class="procedure-step" id="proc-step-${i}">
      <span class="step-number">${i + 1}</span>
      <span class="step-text">${escapeHtml(step)}</span>
      <button class="btn btn-sm btn-success step-check" onclick="markProcStep(${i}, ${steps.length}, '${code}', ${admissionId})">${t('proc_step_done')}</button>
    </div>`;
  });
  html += '</div>';

  if (warnings && warnings.length > 0) {
    html += `<div class="procedure-warnings"><h4>${t('proc_warnings')}</h4><ul>${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`;
  }

  html += `<div class="mt-2"><button class="btn btn-primary" onclick="completeProcedure('${code}', ${admissionId})">${t('proc_complete')}</button></div>`;
  container.innerHTML = html;
}

function markProcStep(stepIdx, totalSteps, code, admissionId) {
  const stepEl = document.getElementById('proc-step-' + stepIdx);
  if (stepEl) {
    stepEl.classList.add('step-done');
    stepEl.querySelector('.step-check').disabled = true;
  }
}

async function completeProcedure(code, admissionId) {
  const user = getCurrentUser();
  const admission = dbGet('SELECT a.*, p.* FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.admission_id = ?', [admissionId]);
  const proc = NURSING_PROCEDURES.find(p => p.code === code);

  dbRun('INSERT INTO nursing_procedure_log (procedure_code, admission_id, nurse_id, started_at, completed_at, status) VALUES (?, ?, ?, ?, ?, ?)',
    [code, admissionId, user.user_id, nowISO(), nowISO(), 'completed']);

  await logAction('PROCEDURE_COMPLETED',
    `Nurse ${user.full_name_en} completed procedure: ${proc ? proc.name_en : code} for patient ${admission.full_name_en || admission.full_name_ar}`,
    null, admission.patient_id, admission.full_name_en || admission.full_name_ar, admission.mrn);

  showSuccess(t('proc_completed'));
  saveDBToIndexedDB();
}

function calcNEWS2(sys, hr, temp, o2, rr, onO2, consciousness) {
  let score = 0;
  // Respiratory rate
  if (rr !== null) {
    if (rr <= 8) score += 3;
    else if (rr <= 11) score += 1;
    else if (rr <= 20) score += 0;
    else if (rr <= 24) score += 2;
    else score += 3;
  }
  // O2 saturation (Scale 1)
  if (o2 !== null) {
    if (o2 <= 91) score += 3;
    else if (o2 <= 93) score += 2;
    else if (o2 <= 95) score += 1;
    else score += 0;
  }
  // On supplemental O2
  if (onO2) score += 2;
  // Systolic BP
  if (sys !== null) {
    if (sys <= 90) score += 3;
    else if (sys <= 100) score += 2;
    else if (sys <= 110) score += 1;
    else if (sys <= 219) score += 0;
    else score += 3;
  }
  // Heart rate
  if (hr !== null) {
    if (hr <= 40) score += 3;
    else if (hr <= 50) score += 1;
    else if (hr <= 90) score += 0;
    else if (hr <= 110) score += 1;
    else if (hr <= 130) score += 2;
    else score += 3;
  }
  // Consciousness (AVPU)
  if (consciousness && consciousness !== 'alert') score += 3;
  // Temperature
  if (temp !== null) {
    if (temp <= 35.0) score += 3;
    else if (temp <= 36.0) score += 1;
    else if (temp <= 38.0) score += 0;
    else if (temp <= 39.0) score += 1;
    else score += 2;
  }
  return score;
}

function calcQSOFA(sys, rr, consciousness) {
  let score = 0;
  if (rr !== null && rr >= 22) score++;
  if (sys !== null && sys <= 100) score++;
  if (consciousness && consciousness !== 'alert') score++;
  return score;
}

async function handleRecordVitals(e, admissionId, patientId) {
  e.preventDefault();
  const user = getCurrentUser();
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);

  const sys = parseInt(document.getElementById('nv-sys').value) || null;
  const dia = parseInt(document.getElementById('nv-dia').value) || null;
  const hr = parseInt(document.getElementById('nv-hr').value) || null;
  const temp = parseFloat(document.getElementById('nv-temp').value) || null;
  const o2 = parseInt(document.getElementById('nv-o2').value) || null;
  const rbs = document.getElementById('nv-rbs').value || null;
  const rr = parseInt(document.getElementById('nv-rr').value) || null;
  const onO2 = document.getElementById('nv-o2-supp').checked ? 1 : 0;
  const consciousness = document.getElementById('nv-consciousness').value;

  const news2 = calcNEWS2(sys, hr, temp, o2, rr, onO2, consciousness);
  const qsofa = calcQSOFA(sys, rr, consciousness);

  dbRun(`INSERT INTO vitals_log (admission_id, recorded_by, recorded_at, bp_systolic, bp_diastolic, heart_rate, temperature, o2_sat, rbs, resp_rate, on_o2, consciousness, news2_score, qsofa_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [admissionId, user.user_id, nowISO(), sys, dia, hr, temp, o2, rbs, rr, onO2, consciousness, news2, qsofa]);

  await logAction('VITALS_RECORDED',
    `Nurse ${user.full_name_en} recorded vitals for patient ${patient.full_name_en || patient.full_name_ar}: BP=${sys||'—'}/${dia||'—'} HR=${hr||'—'} Temp=${temp||'—'} O2=${o2||'—'}% RR=${rr||'—'} NEWS2=${news2} qSOFA=${qsofa}`,
    null, patientId, patient.full_name_en || patient.full_name_ar, patient.mrn);

  saveDBToIndexedDB();

  // Get the just-inserted vitals_id for sepsis alert linking
  const newVitalsRow = dbGet('SELECT MAX(id) as id FROM vitals_log WHERE admission_id = ?', [admissionId]);
  const vitalsId = newVitalsRow ? newVitalsRow.id : null;

  // ---- SEPSIS AUTO-ALERT ----
  // Use the integrated clinical decision module
  if (typeof maybeShowSepsisAlert === 'function') {
    const sepsisShown = maybeShowSepsisAlert(admissionId, vitalsId, {
      temp, hr, rr, sbp: sys, consciousness, qsofa_score: qsofa, news2_score: news2
    });
    if (sepsisShown) {
      // Sepsis alert took over the UI — skip the regular NEWS2/qSOFA modals
      return;
    }
  }

  // Show alert based on scores
  if (qsofa >= 2) {
    showModal(`
      <div style="border:3px solid #dc3545;border-radius:8px;padding:20px;text-align:center;">
        <div style="font-size:2.5rem;">🚨</div>
        <h2 style="color:#dc3545;">${t('qsofa_alert_title')}</h2>
        <p style="font-size:1.1rem;">${t('qsofa_alert_body')}</p>
        <div style="background:#fff3cd;border-radius:6px;padding:12px;margin:12px 0;">
          <strong>${lang==='ar'?'النتيجة':'Score'}: qSOFA = ${qsofa}/3</strong><br>
          ${rr>=22?'✓ RR ≥ 22':''}  ${sys<=100?'✓ SBP ≤ 100':''}  ${consciousness!=='alert'?'✓ '+t('consciousness_'+consciousness):''}
        </div>
        <p style="color:#666;font-size:0.9rem;">${t('qsofa_action')}</p>
        <button class="btn btn-danger" onclick="closeModal()">${t('understood')}</button>
      </div>
    `);
  } else if (news2 >= 7) {
    showModal(`
      <div style="border:3px solid #dc3545;border-radius:8px;padding:20px;text-align:center;">
        <div style="font-size:2.5rem;">⚠️</div>
        <h2 style="color:#dc3545;">${t('news2_high_title')}</h2>
        <p>${t('news2_high_body')}</p>
        <div class="news2-badge news2-high" style="font-size:1.5rem;margin:12px auto;">NEWS2 = ${news2}</div>
        <p style="color:#666;font-size:0.9rem;">${t('news2_high_action')}</p>
        <button class="btn btn-danger" onclick="closeModal()">${t('understood')}</button>
      </div>
    `);
  } else if (news2 >= 5) {
    showModal(`
      <div style="border:3px solid #fd7e14;border-radius:8px;padding:20px;text-align:center;">
        <div style="font-size:2.5rem;">⚠️</div>
        <h2 style="color:#fd7e14;">${t('news2_medium_title')}</h2>
        <p>${t('news2_medium_body')}</p>
        <div class="news2-badge news2-medium" style="font-size:1.5rem;margin:12px auto;">NEWS2 = ${news2}</div>
        <p style="color:#666;font-size:0.9rem;">${t('news2_medium_action')}</p>
        <button class="btn btn-primary" onclick="closeModal()">${t('understood')}</button>
      </div>
    `);
  } else {
    showSuccess(t('vitals_recorded') + ` — NEWS2: ${news2}`);
  }
}

async function handleNursingTask(e, admissionId, patientId) {
  e.preventDefault();
  const user = getCurrentUser();
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  const taskType = document.getElementById('nt-type').value;
  const notes = document.getElementById('nt-notes').value.trim();

  dbRun('INSERT INTO nursing_tasks (admission_id, nurse_id, task_type, task_detail, status, done_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [admissionId, user.user_id, taskType, notes, 'done', nowISO(), notes || null]);

  const taskLabel = LANG['task_' + taskType] ? LANG['task_' + taskType].en : taskType;
  await logAction('NURSING_TASK',
    `Nurse ${user.full_name_en} completed task: ${taskLabel} for patient ${patient.full_name_en || patient.full_name_ar} at ${new Date().toLocaleTimeString()}`,
    null, patientId, patient.full_name_en || patient.full_name_ar, patient.mrn);

  showSuccess(t('success_saved'));
  saveDBToIndexedDB();
  document.getElementById('nt-notes').value = '';
}

function renderNRTasks(main, lang) {
  const session = getCurrentSession();
  const today = new Date().toISOString().slice(0, 10);
  const tasks = dbAll(`SELECT nt.*, p.full_name_ar, p.full_name_en, p.mrn
    FROM nursing_tasks nt
    JOIN admissions a ON nt.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    WHERE nt.nurse_id = ? AND date(nt.done_at) = ? ORDER BY nt.done_at DESC`, [session.user_id, today]);

  main.innerHTML = `
    <div class="page-header"><h1>${t('my_tasks')}</h1></div>
    ${tasks.length === 0 ? `<div class="empty-state"><p>${t('no_data')}</p></div>` : `
    <div class="table-container">
      <table>
        <thead><tr><th>${lang === 'ar' ? 'الاسم' : 'Patient'}</th><th>${lang === 'ar' ? 'المهمة' : 'Task'}</th><th>${t('status')}</th><th>${t('time')}</th></tr></thead>
        <tbody>${tasks.map(tk => `<tr>
          <td>${lang === 'ar' ? escapeHtml(tk.full_name_ar) : escapeHtml(tk.full_name_en || tk.full_name_ar)}</td>
          <td>${LANG['task_' + tk.task_type] ? LANG['task_' + tk.task_type][lang] : tk.task_type}</td>
          <td><span class="badge badge-success">${t('task_done')}</span></td>
          <td>${formatDateTime(tk.done_at)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`}
  `;
}

function renderNRShift(main, lang) {
  const session = getCurrentSession();
  const today   = new Date().toISOString().slice(0, 10);

  // Pull assigned patients for auto-population of S and B
  const assignments = dbAll(
    `SELECT na.admission_id, p.full_name_en, p.full_name_ar, p.mrn, a.bed_number, a.initial_diagnosis, a.chief_complaint
     FROM nurse_assignments na
     JOIN admissions a  ON na.admission_id = a.admission_id
     JOIN patients   p  ON a.patient_id    = p.patient_id
     WHERE na.nurse_id = ? AND na.shift_date = ? AND a.status = 'active'`,
    [session.user_id, today]
  );

  // Build auto-text for Situation (current status per patient)
  const situationLines = assignments.map(a => {
    const name = lang === 'ar' ? a.full_name_ar : (a.full_name_en || a.full_name_ar);
    return `• ${name} (${a.mrn})${a.bed_number ? ' — ' + a.bed_number : ''}: ${lang === 'ar' ? 'مستقر' : 'Stable'}`;
  }).join('\n') || (lang === 'ar' ? 'لا يوجد مرضى معيّنون اليوم' : 'No assigned patients today');

  // Build auto-text for Background
  const backgroundLines = assignments.map(a => {
    const name = lang === 'ar' ? a.full_name_ar : (a.full_name_en || a.full_name_ar);
    const dx   = a.initial_diagnosis || a.chief_complaint || '—';
    return `• ${name}: ${dx}`;
  }).join('\n') || '—';

  // Get other on-duty nurses in this dept for the transfer dropdown
  const userDept = dbGet('SELECT department_id FROM users WHERE user_id = ?', [session.user_id]);
  const otherNurses = userDept ? dbAll(
    `SELECT user_id, full_name_en, full_name_ar FROM users WHERE role IN ('nurse','senior_nurse') AND department_id = ? AND is_active = 1 AND user_id != ? ORDER BY full_name_en`,
    [userDept.department_id, session.user_id]
  ) : [];

  // Transfer panel — checkboxes per patient + target nurse + shift
  const transferPanel = assignments.length > 0 ? `
    <div class="card mb-3" style="border-left:4px solid #7c3aed;background:#faf5ff;">
      <h3 style="color:#7c3aed;margin-bottom:8px;">&#128257; ${lang === 'ar' ? 'تحويل المرضى للمناوبة القادمة' : 'Transfer Patients to Incoming Shift'}</h3>
      <p style="color:#666;font-size:0.85rem;margin-bottom:12px;">${lang === 'ar' ? 'اختر المرضى الذين تريد تحويلهم، ثم الممرضة المستلمة والمناوبة.' : 'Select patients to transfer, then choose receiving nurse and shift.'}</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;margin-bottom:12px;">
        ${assignments.map(a => `<label style="display:flex;align-items:center;gap:8px;background:#fff;padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid #e9d5ff;">
          <input type="checkbox" class="transfer-cb" data-aid="${a.admission_id}" checked>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.85rem;font-weight:600;">${escapeHtml(lang === 'ar' ? a.full_name_ar : (a.full_name_en || a.full_name_ar))}</div>
            <div style="font-size:0.72rem;color:#666;">${a.bed_number || '—'} • ${a.mrn}</div>
          </div>
        </label>`).join('')}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${lang === 'ar' ? 'الممرضة المستلمة' : 'Receiving Nurse'} *</label>
          <select id="transfer-to">
            <option value="">${lang === 'ar' ? '-- اختر --' : '-- Select --'}</option>
            ${otherNurses.map(n => `<option value="${n.user_id}">${escapeHtml(lang === 'ar' ? n.full_name_ar : n.full_name_en)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>${lang === 'ar' ? 'مناوبة المستلِم' : 'Receiving Shift'}</label>
          <select id="transfer-shift">
            <option value="morning">${t('shift_morning')}</option>
            <option value="afternoon">${t('shift_afternoon')}</option>
            <option value="night">${t('shift_night')}</option>
          </select>
        </div>
        <div class="form-group" style="align-self:end;">
          <button type="button" class="btn btn-primary" onclick="handleShiftTransfer()">&#128257; ${lang === 'ar' ? 'تحويل المختار' : 'Transfer Selected'}</button>
        </div>
      </div>
    </div>` : '';

  main.innerHTML = `
    <div class="page-header">
      <h1>${t('end_of_shift')}</h1>
      <small class="text-muted">${lang === 'ar' ? 'نموذج SBAR — وضعية / خلفية / تقييم / توصية' : 'SBAR Format — Situation / Background / Assessment / Recommendation'}</small>
    </div>

    ${transferPanel}

    <form onsubmit="handleSBARHandover(event)">
      <div class="sbar-grid">
        <div class="sbar-section sbar-s">
          <span class="sbar-label">${lang === 'ar' ? 'S — الوضعية' : 'S — Situation'}</span>
          <div class="sbar-value">
            <small class="text-muted d-block mb-1">${lang === 'ar' ? 'الحالة الراهنة — (تلقائي من المهام)' : 'Current status — auto-populated from assignments'}</small>
            <pre style="font-family:inherit;font-size:0.85rem;white-space:pre-wrap;margin:0">${escapeHtml(situationLines)}</pre>
          </div>
        </div>
        <div class="sbar-section sbar-b">
          <span class="sbar-label">${lang === 'ar' ? 'B — الخلفية' : 'B — Background'}</span>
          <div class="sbar-value">
            <small class="text-muted d-block mb-1">${lang === 'ar' ? 'تشخيص وسبب الدخول — (تلقائي)' : 'Diagnoses / reason for admission — auto-populated'}</small>
            <pre style="font-family:inherit;font-size:0.85rem;white-space:pre-wrap;margin:0">${escapeHtml(backgroundLines)}</pre>
          </div>
        </div>
        <div class="sbar-section sbar-a">
          <span class="sbar-label">${lang === 'ar' ? 'A — التقييم' : 'A — Assessment'}</span>
          <textarea id="sbar-assessment" rows="5" required
            placeholder="${lang === 'ar'
              ? 'مثال:\n• السرير A-5: حرارة 38.5 — تم إبلاغ الطبيب\n• السرير B-2: IV تم تغييره، يحتاج متابعة\n• السرير C-1: رفض الوجبة، مزاج منخفض'
              : 'e.g.\n• Bed A-5: Fever 38.5 — Dr. notified\n• Bed B-2: IV changed, needs 4h follow-up\n• Bed C-1: Refused meals, low mood'}"></textarea>
        </div>
        <div class="sbar-section sbar-r">
          <span class="sbar-label">${lang === 'ar' ? 'R — التوصية' : 'R — Recommendation'}</span>
          <textarea id="sbar-recommendation" rows="5"
            placeholder="${lang === 'ar'
              ? 'مثال:\n• مراقبة حرارة السرير A-5 كل ساعة\n• فحص موقع IV في السرير B-2 بعد 4 ساعات\n• إبلاغ الطبيب إذا أكمل C-1 رفض الوجبات'
              : 'e.g.\n• Monitor Bed A-5 temp hourly\n• Check Bed B-2 IV site in 4 hours\n• Notify MD if Bed C-1 continues to refuse meals'}"></textarea>
        </div>
      </div>
      <div class="card mb-3" style="border-left:4px solid #28a745;background:#f8fff9;">
        <h3 style="color:#28a745;margin-bottom:12px;">&#9989; ${t('handoff_checklist')}</h3>
        <p style="color:#666;font-size:0.85rem;margin-bottom:12px;">${t('handoff_checklist_hint')}</p>
        ${[
          ['chk-vitals', 'sbar_chk_vitals'],
          ['chk-meds', 'sbar_chk_meds'],
          ['chk-pending', 'sbar_chk_pending'],
          ['chk-alerts', 'sbar_chk_alerts'],
          ['chk-family', 'sbar_chk_family'],
        ].map(([id, key]) => `
          <label class="sbar-checklist-item" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;cursor:pointer;padding:8px;border-radius:6px;background:#fff;">
            <input type="checkbox" id="${id}" style="width:18px;height:18px;" required>
            <span>${t(key)}</span>
          </label>
        `).join('')}
      </div>
      <div class="flex gap-1 mt-2">
        <button type="submit" class="btn btn-primary">${t('submit_btn')}</button>
        <button type="button" class="btn btn-secondary no-print" onclick="window.print()">&#128438; ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
      </div>
    </form>
  `;
}

async function acknowledgeHandoff(assignmentId) {
  const lang = currentLanguage();
  const user = getCurrentUser();
  if (!user) return;
  // SECURITY FIX: only the assigned nurse can acknowledge — prevents anyone with the
  // assignment_id from marking it acknowledged
  const a = dbGet('SELECT na.*, u.full_name_en as from_en FROM nurse_assignments na LEFT JOIN users u ON na.transferred_from = u.user_id WHERE na.assignment_id = ?', [assignmentId]);
  if (!a) return;
  if (a.nurse_id !== user.user_id) {
    showError(lang === 'ar' ? 'لا يمكنك تأكيد تسليم لممرضة أخرى' : 'You can only acknowledge handoffs assigned to you');
    return;
  }
  dbRun('UPDATE nurse_assignments SET acknowledged_at = ? WHERE assignment_id = ? AND nurse_id = ?', [nowISO(), assignmentId, user.user_id]);
  await logAction('HANDOFF_ACKNOWLEDGED',
    `Nurse ${user.full_name_en} acknowledged handoff from ${a.from_en || '?'} for admission ${a.admission_id}`);
  saveDBToIndexedDB();
  showSuccess(lang === 'ar' ? 'تم تأكيد استلام المريض' : 'Handoff acknowledged');
  navigateTo('nr-patients');
}

async function handleShiftTransfer() {
  const lang = currentLanguage();
  const user = getCurrentUser();
  const toId = parseInt(document.getElementById('transfer-to').value) || 0;
  const shift = document.getElementById('transfer-shift').value;
  if (!toId) { showError(lang === 'ar' ? 'اختر الممرضة المستلمة' : 'Select receiving nurse'); return; }
  const selected = Array.from(document.querySelectorAll('.transfer-cb:checked')).map(cb => parseInt(cb.dataset.aid));
  if (!selected.length) { showError(lang === 'ar' ? 'اختر مريضاً واحداً على الأقل' : 'Select at least one patient'); return; }

  const targetNurse = dbGet('SELECT * FROM users WHERE user_id = ?', [toId]);
  const today = new Date().toISOString().slice(0, 10);
  let transferred = 0;
  for (const aid of selected) {
    // Remove the outgoing nurse's assignment for today (if it's the same date)
    dbRun(`DELETE FROM nurse_assignments WHERE admission_id = ? AND nurse_id = ? AND shift_date = ?`, [aid, user.user_id, today]);
    // Add the incoming nurse with transferred_from tag (so they see "NEW — acknowledge" badge)
    dbRun(`INSERT INTO nurse_assignments (admission_id, nurse_id, shift, shift_date, assigned_by, assigned_at, transferred_from, acknowledged_at)
      VALUES (?, ?, ?, date(?), ?, ?, ?, NULL)`,
      [aid, toId, shift, nowISO(), user.user_id, nowISO(), user.user_id]);
    transferred++;
  }
  await logAction('SHIFT_TRANSFER',
    `Nurse ${user.full_name_en} transferred ${transferred} patient(s) to Nurse ${targetNurse ? targetNurse.full_name_en : '?'} for ${shift} shift on ${today}`);
  saveDBToIndexedDB();
  showSuccess(lang === 'ar' ? `تم تحويل ${transferred} مريض` : `${transferred} patient(s) transferred`);
  navigateTo('nr-shift');
}

async function handleSBARHandover(e) {
  e.preventDefault();
  const lang  = currentLanguage();
  const user  = getCurrentUser();
  const session = getCurrentSession();
  const today = new Date().toISOString().slice(0, 10);

  const assessment     = (document.getElementById('sbar-assessment')?.value || '').trim();
  const recommendation = (document.getElementById('sbar-recommendation')?.value || '').trim();

  if (!assessment) {
    showError(lang === 'ar' ? 'يرجى ملء خانة التقييم على الأقل' : 'Please fill in the Assessment field at minimum');
    return;
  }

  const notes = `[SBAR Handover]\nAssessment: ${assessment}\nRecommendation: ${recommendation || '—'}`;

  const assignments = dbAll(
    'SELECT admission_id FROM nurse_assignments WHERE nurse_id = ? AND shift_date = ?',
    [session.user_id, today]
  );

  if (assignments.length === 0) {
    // Still log even if no assignments (e.g. float nurse)
    dbRun(
      'INSERT INTO nursing_tasks (admission_id, nurse_id, task_type, task_detail, status, done_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [null, user.user_id, 'handover_note', notes, 'done', nowISO(), notes]
    );
  } else {
    for (const a of assignments) {
      dbRun(
        'INSERT INTO nursing_tasks (admission_id, nurse_id, task_type, task_detail, status, done_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [a.admission_id, user.user_id, 'handover_note', notes, 'done', nowISO(), notes]
      );
    }
  }

  await logAction('NURSING_TASK', `Nurse ${user.full_name_en} submitted SBAR handover`);
  showSuccess(lang === 'ar' ? 'تم إرسال ملاحظات التسليم بنجاح' : 'SBAR Handover submitted successfully');
  saveDBToIndexedDB();
  document.getElementById('sbar-assessment').value     = '';
  const recEl = document.getElementById('sbar-recommendation');
  if (recEl) recEl.value = '';
}

// Legacy alias kept so any old onsubmit="handleHandover(event)" still works
async function handleHandover(e) { return handleSBARHandover(e); }

// ============================================================
// PHARMACIST — Queue, Inventory, Receive, Log
// ============================================================

function renderPHQueue(main, lang) {
  const rxs = dbAll(`SELECT rx.*, p.full_name_ar, p.full_name_en, p.mrn, u.full_name_en as doc_en, u.full_name_ar as doc_ar,
    v.full_name_en as verifier_en, v.full_name_ar as verifier_ar
    FROM prescriptions rx JOIN admissions a ON rx.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    JOIN users u ON rx.doctor_id = u.user_id
    LEFT JOIN users v ON rx.verified_by = v.user_id
    WHERE rx.status = 'active' ORDER BY rx.prescribed_at DESC`);

  const pending  = rxs.filter(r => !r.verified_at);
  const verified = rxs.filter(r =>  r.verified_at);

  main.innerHTML = `
    <div class="page-header">
      <h1>${t('prescription_queue')}</h1>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="batchVerifyRx()" id="batch-verify-btn" style="display:none;">&check; <span id="batch-count">0</span> ${lang === 'ar' ? 'تحقق دفعة' : 'Batch Verify'}</button>
        <button class="btn btn-secondary btn-sm" onclick="showQRScanner(function(pt){ showSuccess((currentLanguage()==='ar'?'المريض: ':'Patient: ')+(pt.full_name_en||pt.full_name_ar)+' — '+pt.mrn); })" style="background:#7c3aed;border-color:#7c3aed;color:#fff;">&#128247; ${t('scan_qr')}</button>
        <button class="btn btn-secondary btn-sm" onclick="readNFCWristband(function(pt){ showSuccess((currentLanguage()==='ar'?'المريض: ':'Patient: ')+(pt.full_name_en||pt.full_name_ar)); })" style="background:#0ea5e9;border-color:#0ea5e9;color:#fff;">&#128248; ${t('read_nfc')}</button>
      </div>
    </div>
    <div class="stat-cards" style="margin-bottom:1rem">
      <div class="stat-card">
        <div class="stat-value">${pending.length}</div>
        <div class="stat-label">${lang === 'ar' ? 'بانتظار التحقق' : 'Pending Verification'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${verified.length}</div>
        <div class="stat-label">${lang === 'ar' ? 'جاهزة للصرف' : 'Ready to Dispense'}</div>
      </div>
    </div>
    ${rxs.length === 0 ? `<div class="empty-state"><p>${t('no_data')}</p></div>` : `
    <div class="table-container">
      <table>
        <thead><tr>
          <th style="width:30px;"><input type="checkbox" id="batch-all" onchange="toggleAllBatchVerify(this)" title="${lang === 'ar' ? 'اختر الكل' : 'Select all'}"></th>
          <th>${t('patient_col')}</th><th>${t('mrn')}</th><th>${t('drug_name')}</th>
          <th>${t('dose')}</th><th>${t('route')}</th><th>${t('frequency')}</th>
          <th>${lang === 'ar' ? 'الطبيب' : 'Doctor'}</th>
          <th>${lang === 'ar' ? 'الحالة' : 'Status'}</th>
          <th>${t('actions')}</th>
        </tr></thead>
        <tbody>${rxs.map(rx => {
          const isVerified = !!rx.verified_at;
          const statusBadge = isVerified
            ? `<span class="badge ph-badge-verified">✓ ${lang === 'ar' ? 'تم التحقق' : 'Verified'}</span>`
            : `<span class="badge ph-badge-pending">${lang === 'ar' ? 'بانتظار التحقق' : 'Needs Verify'}</span>`;
          const actionBtn = isVerified
            ? `<button class="btn btn-sm btn-success" onclick="handleDispense(${rx.rx_id})">${t('dispense_btn')}</button>`
            : `<div style="display:flex;gap:4px;flex-wrap:wrap;"><button class="btn btn-sm btn-primary" onclick="handleVerifyRx(${rx.rx_id})">${lang === 'ar' ? '&check; تحقق' : '&check; Verify'}</button><button class="btn btn-sm btn-danger" onclick="handleRefuseRx(${rx.rx_id})" style="background:#ef4444;border-color:#ef4444;">${lang === 'ar' ? '&times; رفض' : '&times; Refuse'}</button></div>`;
          const cb = isVerified ? '' : `<input type="checkbox" class="batch-cb" data-rxid="${rx.rx_id}" onchange="updateBatchCount()">`;
          return `<tr>
            <td>${cb}</td>
            <td>${lang === 'ar' ? escapeHtml(rx.full_name_ar) : escapeHtml(rx.full_name_en || rx.full_name_ar)}</td>
            <td>${rx.mrn}</td>
            <td><strong>${escapeHtml(rx.drug_name)}</strong></td>
            <td>${escapeHtml(rx.dose)}</td>
            <td>${rx.route}</td>
            <td>${rx.frequency}</td>
            <td>${lang === 'ar' ? escapeHtml(rx.doc_ar) : escapeHtml(rx.doc_en)}</td>
            <td>${statusBadge}${isVerified && rx.verifier_en ? `<br><small class="text-muted">${lang==='ar'?escapeHtml(rx.verifier_ar):escapeHtml(rx.verifier_en)}</small>` : ''}</td>
            <td>${actionBtn}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`}
  `;
}

function toggleAllBatchVerify(masterCb) {
  document.querySelectorAll('.batch-cb').forEach(cb => cb.checked = masterCb.checked);
  updateBatchCount();
}
function updateBatchCount() {
  const n = document.querySelectorAll('.batch-cb:checked').length;
  const btn = document.getElementById('batch-verify-btn');
  const ct = document.getElementById('batch-count');
  if (btn && ct) {
    btn.style.display = n > 0 ? 'inline-block' : 'none';
    ct.textContent = n;
  }
}

async function batchVerifyRx() {
  const lang = currentLanguage();
  const ids = Array.from(document.querySelectorAll('.batch-cb:checked')).map(cb => parseInt(cb.dataset.rxid));
  if (!ids.length) return;
  const user = getCurrentUser();
  // Check for allergy conflicts upfront — collect any that need review
  const flagged = [];
  for (const id of ids) {
    const rx = dbGet('SELECT * FROM prescriptions WHERE rx_id = ?', [id]);
    if (!rx || rx.verified_at) continue;
    const patient = dbGet(`SELECT p.* FROM prescriptions rx JOIN admissions a ON rx.admission_id=a.admission_id JOIN patients p ON a.patient_id=p.patient_id WHERE rx.rx_id=?`, [id]);
    const allergies = dbAll('SELECT * FROM patient_allergies WHERE patient_id = ?', [patient.patient_id]);
    if (typeof checkDrugAllergy === 'function') {
      const m = checkDrugAllergy(rx.drug_name, allergies);
      if (m) flagged.push({ rxId: id, drug: rx.drug_name, patient: patient.full_name_en || patient.full_name_ar, allergen: m.allergen });
    }
  }
  if (flagged.length > 0) {
    const msg = (lang === 'ar' ? 'تعارض حساسية في:' : 'Allergy conflict in:') + '<ul>' +
      flagged.map(f => `<li>${escapeHtml(f.patient)} — ${escapeHtml(f.drug)} (${lang === 'ar' ? 'حساس من' : 'allergic to'} ${escapeHtml(f.allergen)})</li>`).join('') + '</ul>' +
      (lang === 'ar' ? 'سيتم استبعاد هذه الوصفات من التحقق الدفعة. تحقق منها فردياً.' : 'These will be EXCLUDED from batch verify. Verify them individually.');
    showRedAlert(msg, async () => {
      const flaggedIds = new Set(flagged.map(f => f.rxId));
      const safeIds = ids.filter(id => !flaggedIds.has(id));
      await _doBatchVerify(safeIds, user);
    });
    return;
  }
  await _doBatchVerify(ids, user);
}

async function _doBatchVerify(ids, user) {
  const lang = currentLanguage();
  const now = nowISO();
  let ok = 0;
  for (const id of ids) {
    const rx = dbGet('SELECT * FROM prescriptions WHERE rx_id = ? AND verified_at IS NULL', [id]);
    if (!rx) continue;
    dbRun('UPDATE prescriptions SET verified_by = ?, verified_at = ? WHERE rx_id = ? AND verified_at IS NULL', [user.user_id, now, id]);
    ok++;
  }
  await logAction('RX_BATCH_VERIFIED', `Pharmacist ${user.full_name_en} batch-verified ${ok} prescription(s)`);
  saveDBToIndexedDB();
  showSuccess(lang === 'ar' ? `تم التحقق من ${ok} وصفة` : `${ok} prescription(s) verified`);
  navigateTo('ph-queue');
}

async function handleVerifyRx(rxId) {
  const lang = currentLanguage();
  const user = getCurrentUser();
  const rx = dbGet('SELECT * FROM prescriptions WHERE rx_id = ?', [rxId]);
  if (!rx) return;
  // Prevent double-verify race (B7 fix)
  if (rx.verified_at) {
    const v = dbGet('SELECT full_name_en FROM users WHERE user_id = ?', [rx.verified_by]);
    showError(lang === 'ar'
      ? `سبق التحقق بواسطة ${v ? v.full_name_en : 'مستخدم آخر'} في ${rx.verified_at}`
      : `Already verified by ${v ? v.full_name_en : 'someone'} at ${rx.verified_at}`);
    return;
  }
  // Re-check patient allergies at verify time — pharmacist's last line of defense
  const patient = dbGet(`SELECT p.* FROM prescriptions rx JOIN admissions a ON rx.admission_id=a.admission_id JOIN patients p ON a.patient_id=p.patient_id WHERE rx.rx_id=?`, [rxId]);
  if (patient && typeof checkDrugAllergy === 'function') {
    const allergies = dbAll('SELECT * FROM patient_allergies WHERE patient_id = ?', [patient.patient_id]);
    const match = checkDrugAllergy(rx.drug_name, allergies);
    if (match) {
      const msg = lang === 'ar'
        ? `&#9888; تنبيه! المريض ${escapeHtml(patient.full_name_ar)} لديه حساسية من <strong>${escapeHtml(match.allergen)}</strong> — والدواء الموصوف <strong>${escapeHtml(rx.drug_name)}</strong>. هل أنت متأكد من التحقق؟`
        : `&#9888; ALERT: Patient ${escapeHtml(patient.full_name_en || patient.full_name_ar)} has documented allergy to <strong>${escapeHtml(match.allergen)}</strong> — but prescribed drug is <strong>${escapeHtml(rx.drug_name)}</strong>. Verify anyway?`;
      requireReasonToDecline(msg, `Pharmacist verify of Rx ${rxId} despite ${match.allergen} allergy`,
        async () => { /* Accepted = pharmacist confirmed safe (e.g. desensitization protocol) */ await _doVerifyRx(rxId, rx, patient, user, lang); },
        async (reason) => { /* Declined = pharmacist refuses */ await _doRefuseRx(rxId, rx, patient, user, lang, `Allergy cross-check: ${reason}`); }
      );
      return;
    }
  }
  await _doVerifyRx(rxId, rx, patient, user, lang);
}

async function _doVerifyRx(rxId, rx, patient, user, lang) {
  dbRun('UPDATE prescriptions SET verified_by = ?, verified_at = ? WHERE rx_id = ? AND verified_at IS NULL',
    [user.user_id, nowISO(), rxId]);
  await logAction('RX_VERIFIED',
    `Pharmacist ${user.full_name_en} verified ${rx.drug_name} ${rx.dose} for patient ${patient ? (patient.full_name_en || patient.full_name_ar) : ''}`,
    null, patient ? patient.patient_id : null, patient ? (patient.full_name_en || patient.full_name_ar) : null, patient ? patient.mrn : null);
  showSuccess(lang === 'ar' ? 'تم التحقق من الوصفة' : 'Prescription verified — ready to dispense');
  saveDBToIndexedDB();
  navigateTo('ph-queue');
}

async function handleRefuseRx(rxId) {
  const lang = currentLanguage();
  const user = getCurrentUser();
  const rx = dbGet('SELECT * FROM prescriptions WHERE rx_id = ?', [rxId]);
  if (!rx) return;
  const patient = dbGet(`SELECT p.* FROM prescriptions rx JOIN admissions a ON rx.admission_id=a.admission_id JOIN patients p ON a.patient_id=p.patient_id WHERE rx.rx_id=?`, [rxId]);

  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  overlay.innerHTML = `
    <div class="alert-modal" style="max-width:500px;">
      <div style="padding:20px;">
        <h3 style="color:#dc2626;margin-bottom:10px;">${lang === 'ar' ? 'رفض الوصفة' : 'Refuse Prescription'}</h3>
        <div style="background:#fef2f2;padding:10px;border-radius:6px;margin-bottom:14px;font-size:0.88rem;">
          <strong>${escapeHtml(rx.drug_name)} ${escapeHtml(rx.dose)} ${rx.route}</strong><br>
          <span style="color:#666;">${lang === 'ar' ? 'للمريض' : 'For'}: ${escapeHtml(patient ? (lang === 'ar' ? patient.full_name_ar : (patient.full_name_en || patient.full_name_ar)) : '—')}</span>
        </div>
        <label style="font-size:0.85rem;font-weight:600;">${lang === 'ar' ? 'سبب الرفض' : 'Reason for refusal'} *</label>
        <select id="refuse-reason-cat" style="width:100%;border:1px solid #ccc;border-radius:6px;padding:8px;margin:6px 0 10px;font-size:0.9rem;">
          <option value="">${lang === 'ar' ? '-- اختر --' : '-- Select --'}</option>
          <option value="allergy">${lang === 'ar' ? 'حساسية موثقة' : 'Documented allergy'}</option>
          <option value="interaction">${lang === 'ar' ? 'تداخل دوائي خطير' : 'Severe drug interaction'}</option>
          <option value="contraindicated">${lang === 'ar' ? 'موانع استعمال' : 'Contraindicated for condition'}</option>
          <option value="dose_error">${lang === 'ar' ? 'خطأ في الجرعة' : 'Dose error / out of range'}</option>
          <option value="not_available">${lang === 'ar' ? 'غير متوفر' : 'Not available / out of stock'}</option>
          <option value="duplicate">${lang === 'ar' ? 'وصفة مكررة' : 'Duplicate prescription'}</option>
          <option value="other">${lang === 'ar' ? 'أخرى' : 'Other'}</option>
        </select>
        <textarea id="refuse-reason-detail" rows="3" style="width:100%;border:1px solid #ccc;border-radius:6px;padding:8px;font-size:0.9rem;" placeholder="${lang === 'ar' ? 'تفاصيل إضافية (مطلوبة)' : 'Additional details (required)'}"></textarea>
        <p style="font-size:0.78rem;color:#666;margin-top:6px;">${lang === 'ar' ? 'سيتم إخطار الطبيب الواصف ويسجل في السجل التدقيقي.' : 'The prescribing doctor will be notified, and this will be logged in the audit trail.'}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
          <button class="btn btn-secondary" onclick="this.closest('.alert-overlay').remove()">${t('cancel_btn')}</button>
          <button class="btn btn-danger" id="refuse-confirm-btn" style="background:#dc2626;">${lang === 'ar' ? 'تأكيد الرفض' : 'Confirm Refusal'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('refuse-confirm-btn').onclick = async () => {
    const cat = document.getElementById('refuse-reason-cat').value;
    const detail = document.getElementById('refuse-reason-detail').value.trim();
    if (!cat) { showError(lang === 'ar' ? 'يجب اختيار فئة' : 'Select a category'); return; }
    if (detail.length < 5) { showError(lang === 'ar' ? 'التفاصيل مطلوبة' : 'Details required'); return; }
    overlay.remove();
    await _doRefuseRx(rxId, rx, patient, user, lang, `${cat}: ${detail}`);
  };
}

async function _doRefuseRx(rxId, rx, patient, user, lang, reasonText) {
  dbRun(`UPDATE prescriptions SET status = 'refused', notes = COALESCE(notes, '') || ' [REFUSED: ' || ? || ']' WHERE rx_id = ?`, [reasonText, rxId]);
  await logAction('RX_REFUSED',
    `Pharmacist ${user.full_name_en} REFUSED ${rx.drug_name} ${rx.dose} for patient ${patient ? (patient.full_name_en || patient.full_name_ar) : ''}. Reason: ${reasonText}`,
    null, patient ? patient.patient_id : null, patient ? (patient.full_name_en || patient.full_name_ar) : null, patient ? patient.mrn : null);
  showSuccess(lang === 'ar' ? 'تم رفض الوصفة وإخطار الطبيب' : 'Prescription refused and prescriber notified');
  saveDBToIndexedDB();
  navigateTo('ph-queue');
}

async function handleDispense(rxId) {
  const lang = currentLanguage();
  const user = getCurrentUser();
  if (!user) { showError(lang === 'ar' ? 'انتهت الجلسة' : 'Session expired'); return; }

  const rx = dbGet(`SELECT rx.*, p.*, a.admission_id FROM prescriptions rx
    JOIN admissions a ON rx.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id WHERE rx.rx_id = ?`, [rxId]);
  if (!rx) { showError(lang === 'ar' ? 'الوصفة غير موجودة' : 'Prescription not found'); return; }

  // GUARD: Must be verified before dispensing
  if (!rx.verified_at) {
    showError(lang === 'ar'
      ? 'يجب التحقق من الوصفة قبل الصرف'
      : 'Prescription must be verified before dispensing');
    return;
  }

  // GUARD: Don't dispense the same Rx twice
  if (rx.status === 'dispensed') {
    showError(lang === 'ar'
      ? 'تم صرف هذه الوصفة بالفعل'
      : 'This prescription has already been dispensed');
    return;
  }

  if (rx.status !== 'active') {
    showError(lang === 'ar' ? 'الوصفة غير نشطة' : 'Prescription is not active');
    return;
  }

  const drug = dbGet('SELECT * FROM drugs WHERE drug_id = ?', [rx.drug_id]);

  // GUARD: Stock must exist and not go negative
  if (drug && drug.stock_qty <= 0) {
    showError(lang === 'ar' ? 'المخزون فارغ!' : 'Out of stock!');
    return;
  }

  // Deduct stock (with floor at 0)
  if (drug) {
    const newQty = Math.max(0, drug.stock_qty - 1);
    dbRun('UPDATE drugs SET stock_qty = ? WHERE drug_id = ?', [newQty, rx.drug_id]);
    dbRun('INSERT INTO stock_transactions (drug_id, txn_type, qty_change, qty_after, performed_by, performed_at) VALUES (?, ?, ?, ?, ?, ?)',
      [rx.drug_id, 'dispense', -1, newQty, user.user_id, nowISO()]);
  }

  // Log dispensing
  dbRun('INSERT INTO dispensing_log (prescription_id, drug_id, patient_id, qty_dispensed, dispensed_by, dispensed_at) VALUES (?, ?, ?, ?, ?, ?)',
    [rxId, rx.drug_id, rx.patient_id, 1, user.user_id, nowISO()]);

  // Mark prescription as dispensed (prevents double-dispense)
  dbRun(`UPDATE prescriptions SET status = 'dispensed' WHERE rx_id = ?`, [rxId]);

  await logAction('DRUG_DISPENSED',
    `Pharmacist ${user.full_name_en} dispensed 1 ${drug ? drug.unit : 'unit'} of ${rx.drug_name} for patient ${rx.full_name_en || rx.full_name_ar}`,
    null, rx.patient_id, rx.full_name_en || rx.full_name_ar, rx.mrn);

  showSuccess(t('dispensed_success'));
  saveDBToIndexedDB();
  navigateTo('ph-queue');
}

function renderPHInventory(main, lang) {
  const drugs = dbAll('SELECT * FROM drugs ORDER BY category, name_generic');

  main.innerHTML = `
    <div class="page-header"><h1>${t('drug_inventory')}</h1></div>
    <div class="table-container">
      <table>
        <thead><tr><th>${lang === 'ar' ? 'الاسم العلمي' : 'Generic Name'}</th><th>${lang === 'ar' ? 'الاسم التجاري' : 'Brand'}</th><th>${lang === 'ar' ? 'الاسم (عربي)' : 'Arabic'}</th><th>${lang === 'ar' ? 'الفئة' : 'Category'}</th><th>${t('stock_qty')}</th><th>${t('min_threshold')}</th><th>${t('status')}</th></tr></thead>
        <tbody>${drugs.map(d => `<tr class="${d.stock_qty <= d.min_threshold ? 'text-danger' : ''}">
          <td>${escapeHtml(d.name_generic)}</td>
          <td>${escapeHtml(d.name_brand || '—')}</td>
          <td>${escapeHtml(d.name_ar || '—')}</td>
          <td>${d.category}</td>
          <td>${d.stock_qty}</td>
          <td>${d.min_threshold}</td>
          <td>${d.stock_qty <= d.min_threshold ? '<span class="badge badge-danger">' + t('low_stock_alert') + '</span>' : '<span class="badge badge-success">OK</span>'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderPHReceive(main, lang) {
  const drugs = dbAll('SELECT * FROM drugs ORDER BY name_generic');
  const drugOptions = drugs.map(d => `<option value="${d.drug_id}">${d.name_generic}${d.name_brand ? ' (' + d.name_brand + ')' : ''}</option>`).join('');

  main.innerHTML = `
    <div class="page-header"><h1>${t('receive_stock')}</h1></div>
    <div class="card">
      <form onsubmit="handleReceiveStock(event)">
        <div class="form-row">
          <div class="form-group"><label>${t('drug_name')} *</label><select id="rcv-drug" required><option value="">—</option>${drugOptions}</select></div>
          <div class="form-group"><label>${t('qty_to_receive')} *</label><input type="number" id="rcv-qty" required min="1"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('batch_number')}</label><input type="text" id="rcv-batch"></div>
          <div class="form-group"><label>${t('expiry_date')}</label><input type="date" id="rcv-expiry"></div>
        </div>
        <button type="submit" class="btn btn-primary">${t('save_btn')}</button>
      </form>
    </div>
  `;
}

async function handleReceiveStock(e) {
  e.preventDefault();
  const user = getCurrentUser();
  const drugId = document.getElementById('rcv-drug').value;
  const qty = parseInt(document.getElementById('rcv-qty').value);
  const batch = document.getElementById('rcv-batch').value.trim();
  const expiry = document.getElementById('rcv-expiry').value;

  const drug = dbGet('SELECT * FROM drugs WHERE drug_id = ?', [drugId]);
  const newQty = drug.stock_qty + qty;
  dbRun('UPDATE drugs SET stock_qty = ? WHERE drug_id = ?', [newQty, drugId]);

  dbRun('INSERT INTO stock_transactions (drug_id, txn_type, qty_change, qty_after, batch_no, expiry_date, performed_by, performed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [drugId, 'receive', qty, newQty, batch || null, expiry || null, user.user_id, nowISO()]);

  await logAction('STOCK_RECEIVED',
    `Pharmacist ${user.full_name_en} received ${qty} units of ${drug.name_generic} — Batch ${batch || 'N/A'} — Expiry ${expiry || 'N/A'}`,
    null);

  showSuccess(t('stock_received_success'));
  saveDBToIndexedDB();
  navigateTo('ph-receive');
}

function renderPHLog(main, lang) {
  const logs = dbAll(`SELECT dl.*, d.name_generic, p.full_name_ar, p.full_name_en, p.mrn, u.full_name_en as pharm_en, u.full_name_ar as pharm_ar
    FROM dispensing_log dl JOIN drugs d ON dl.drug_id = d.drug_id
    JOIN patients p ON dl.patient_id = p.patient_id
    JOIN users u ON dl.dispensed_by = u.user_id
    ORDER BY dl.dispensed_at DESC LIMIT 100`);

  main.innerHTML = `
    <div class="page-header"><h1>${t('dispensing_log')}</h1></div>
    ${logs.length === 0 ? `<div class="empty-state"><p>${t('no_data')}</p></div>` : `
    <div class="table-container">
      <table>
        <thead><tr><th>${t('date')}</th><th>${t('drug_name')}</th><th>${t('patient_col')}</th><th>${t('mrn')}</th><th>${lang === 'ar' ? 'الصيدلاني' : 'Pharmacist'}</th><th>${t('quantity')}</th></tr></thead>
        <tbody>${logs.map(l => `<tr>
          <td>${formatDateTime(l.dispensed_at)}</td>
          <td>${escapeHtml(l.name_generic)}</td>
          <td>${lang === 'ar' ? escapeHtml(l.full_name_ar) : escapeHtml(l.full_name_en || l.full_name_ar)}</td>
          <td>${l.mrn}</td>
          <td>${lang === 'ar' ? escapeHtml(l.pharm_ar) : escapeHtml(l.pharm_en)}</td>
          <td>${l.qty_dispensed}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`}
  `;
}

// ============================================================
// LAB TECHNICIAN — Pending Samples
// ============================================================

function renderLTPending(main, lang) {
  const collected = dbAll(`SELECT lo.*, p.full_name_ar, p.full_name_en, p.mrn, u.full_name_en as nurse_en, u.full_name_ar as nurse_ar
    FROM lab_orders lo JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN users u ON lo.collected_by = u.user_id
    WHERE lo.status = 'collected' AND (lo.category IS NULL OR lo.category != 'radiology' AND lo.category != 'cardiology') ORDER BY CASE lo.priority WHEN 'stat' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, lo.collected_at`);

  const received = dbAll(`SELECT lo.*, p.full_name_ar, p.full_name_en, p.mrn
    FROM lab_orders lo JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id
    WHERE lo.status = 'received' AND (lo.category IS NULL OR lo.category != 'radiology' AND lo.category != 'cardiology') ORDER BY CASE lo.priority WHEN 'stat' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, lo.received_at`);

  main.innerHTML = `
    <div class="page-header">
      <h1>${t('lab_pending_samples')}</h1>
      <button class="btn btn-secondary btn-sm" onclick="showQRScanner(function(pt){ showSuccess((currentLanguage()==='ar'?'المريض: ':'Patient: ')+(pt.full_name_en||pt.full_name_ar)+' — '+pt.mrn); })" style="background:#7c3aed;border-color:#7c3aed;color:#fff;">&#128247; ${t('scan_qr')}</button>
    </div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">${collected.length}</div><div class="stat-label">${t('lab_pending_receipt')}</div></div>
      <div class="stat-card"><div class="stat-value">${received.length}</div><div class="stat-label">${t('lab_pending_result')}</div></div>
    </div>

    ${collected.length > 0 ? `<div class="card mb-3"><h3>${t('lab_pending_receipt')}</h3>
    <div class="table-container"><table><thead><tr><th>${t('patient_col')}</th><th>${t('mrn')}</th><th>${t('lab_test_name')}</th><th>${t('lab_priority')}</th><th>${t('lab_specimen')}</th><th>${lang === 'ar' ? 'سحبت بواسطة' : 'Collected By'}</th><th>${t('actions')}</th></tr></thead>
    <tbody>${collected.map(l => {
      const priBadge = l.priority === 'stat' ? 'badge-danger' : l.priority === 'urgent' ? 'badge-warning' : 'badge-neutral';
      return `<tr>
        <td>${lang === 'ar' ? escapeHtml(l.full_name_ar) : escapeHtml(l.full_name_en || l.full_name_ar)}</td>
        <td>${l.mrn}</td><td>${escapeHtml(l.test_name)}</td>
        <td><span class="badge ${priBadge}">${l.priority.toUpperCase()}</span></td>
        <td>${escapeHtml(l.specimen_type || '—')}</td>
        <td>${lang === 'ar' ? escapeHtml(l.nurse_ar || '') : escapeHtml(l.nurse_en || '')}</td>
        <td><button class="btn btn-sm btn-primary" onclick="handleLabReceive(${l.order_id})">${t('lab_mark_received')}</button></td>
      </tr>`;
    }).join('')}</tbody></table></div></div>` : ''}

    ${received.length > 0 ? `<div class="card mb-3"><h3>${t('lab_pending_result')}</h3>
    <div class="table-container"><table><thead><tr><th>${t('patient_col')}</th><th>${t('mrn')}</th><th>${t('lab_test_name')}</th><th>${t('lab_priority')}</th><th>${t('actions')}</th></tr></thead>
    <tbody>${received.map(l => {
      const priBadge = l.priority === 'stat' ? 'badge-danger' : l.priority === 'urgent' ? 'badge-warning' : 'badge-neutral';
      return `<tr>
        <td>${lang === 'ar' ? escapeHtml(l.full_name_ar) : escapeHtml(l.full_name_en || l.full_name_ar)}</td>
        <td>${l.mrn}</td><td>${escapeHtml(l.test_name)}</td>
        <td><span class="badge ${priBadge}">${l.priority.toUpperCase()}</span></td>
        <td>
          <button class="btn btn-sm btn-success" onclick="showLabResultForm(${l.order_id})">${t('lab_enter_result')}</button>
          <button class="btn btn-sm btn-danger" onclick="showRejectSpecimenForm(${l.order_id})" style="background:#ef4444;border-color:#ef4444;">${lang === 'ar' ? 'رفض العينة' : 'Reject Specimen'}</button>
        </td>
      </tr>`;
    }).join('')}</tbody></table></div></div>` : ''}

    ${collected.length === 0 && received.length === 0 ? `<div class="empty-state"><p>${t('no_data')}</p></div>` : ''}
  `;
}

// Lab specimen rejection workflow (P0 fix from persona simulation — Khaled)
function showRejectSpecimenForm(orderId) {
  const lang = currentLanguage();
  const order = dbGet(`SELECT lo.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id,
    doc.full_name_en as doc_en FROM lab_orders lo
    JOIN admissions a ON lo.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN users doc ON lo.doctor_id = doc.user_id
    WHERE lo.order_id = ?`, [orderId]);
  if (!order) return;

  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  overlay.innerHTML = `
    <div class="alert-modal" style="max-width:520px;">
      <div style="padding:20px;">
        <h3 style="color:#dc2626;margin-bottom:10px;">${lang === 'ar' ? 'رفض العينة' : 'Reject Specimen'}</h3>
        <div style="background:#fef2f2;padding:10px;border-radius:6px;margin-bottom:14px;font-size:0.88rem;">
          <strong>${escapeHtml(order.test_name)}</strong><br>
          <span style="color:#666;">${lang === 'ar' ? 'للمريض' : 'For'}: ${escapeHtml(lang === 'ar' ? order.full_name_ar : (order.full_name_en || order.full_name_ar))} (${order.mrn})</span><br>
          <span style="color:#666;">${lang === 'ar' ? 'طلبها' : 'Ordered by'}: ${escapeHtml(order.doc_en || '—')}</span>
        </div>
        <label style="font-size:0.85rem;font-weight:600;">${lang === 'ar' ? 'سبب الرفض' : 'Rejection reason'} *</label>
        <select id="rej-reason" style="width:100%;border:1px solid #ccc;border-radius:6px;padding:8px;margin:6px 0 10px;font-size:0.9rem;">
          <option value="">${lang === 'ar' ? '-- اختر --' : '-- Select --'}</option>
          <option value="hemolysis">${lang === 'ar' ? 'انحلال دم (Hemolysis)' : 'Hemolysis'}</option>
          <option value="clotted">${lang === 'ar' ? 'متجلطة (Clotted)' : 'Clotted'}</option>
          <option value="qns">${lang === 'ar' ? 'كمية غير كافية (QNS)' : 'QNS — Quantity Not Sufficient'}</option>
          <option value="wrong_tube">${lang === 'ar' ? 'أنبوب خاطئ' : 'Wrong tube type'}</option>
          <option value="contaminated">${lang === 'ar' ? 'ملوثة' : 'Contaminated'}</option>
          <option value="mislabeled">${lang === 'ar' ? 'تسمية خاطئة' : 'Mislabeled / unlabeled'}</option>
          <option value="lipemic">${lang === 'ar' ? 'دهنية (Lipemic)' : 'Lipemic'}</option>
          <option value="expired_tube">${lang === 'ar' ? 'أنبوب منتهي الصلاحية' : 'Expired tube'}</option>
          <option value="other">${lang === 'ar' ? 'أخرى' : 'Other'}</option>
        </select>
        <textarea id="rej-detail" rows="2" style="width:100%;border:1px solid #ccc;border-radius:6px;padding:8px;font-size:0.9rem;" placeholder="${lang === 'ar' ? 'تفاصيل إضافية' : 'Additional details'}"></textarea>
        <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:0.88rem;cursor:pointer;">
          <input type="checkbox" id="rej-redraw" checked>
          ${lang === 'ar' ? 'إنشاء طلب جديد تلقائياً (سحب عينة جديدة)' : 'Auto-create redraw order (request new specimen)'}
        </label>
        <p style="font-size:0.78rem;color:#666;margin-top:6px;">${lang === 'ar' ? 'سيتم إخطار الطبيب الواصف والممرضة المسؤولة عبر سجل المراجعة.' : 'Ordering doctor and assigned nurse will be notified via audit log + portal_messages.'}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
          <button class="btn btn-secondary" onclick="this.closest('.alert-overlay').remove()">${t('cancel_btn')}</button>
          <button class="btn btn-danger" onclick="confirmRejectSpecimen(${orderId})" style="background:#dc2626;">${lang === 'ar' ? 'تأكيد الرفض' : 'Confirm Rejection'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function confirmRejectSpecimen(orderId) {
  const lang = currentLanguage();
  const user = getCurrentUser();
  const reason = document.getElementById('rej-reason').value;
  const detail = document.getElementById('rej-detail').value.trim();
  const redraw = document.getElementById('rej-redraw').checked;
  if (!reason) { showError(lang === 'ar' ? 'اختر سبباً' : 'Select a reason'); return; }
  const order = dbGet(`SELECT lo.*, p.full_name_en, p.full_name_ar, p.mrn, p.patient_id FROM lab_orders lo
    JOIN admissions a ON lo.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id WHERE lo.order_id = ?`, [orderId]);

  // Mark specimen rejected
  dbRun(`UPDATE lab_orders SET status = 'rejected', rejected_at = ?, rejected_by = ?, rejection_reason = ? WHERE order_id = ?`,
    [nowISO(), user.user_id, reason + (detail ? ' — ' + detail : ''), orderId]);

  // Auto-create redraw order if requested
  let redrawId = null;
  if (redraw) {
    dbRun(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, category, subcategory, specimen_type, priority, status, ordered_at, prep_notes, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'urgent', 'ordered', ?, ?, ?)`,
      [order.admission_id, order.doctor_id, order.test_name, order.test_code, order.category, order.subcategory, order.specimen_type, nowISO(),
       order.prep_notes, (lang === 'ar' ? '[إعادة سحب] العينة السابقة رُفضت: ' : '[REDRAW] Previous specimen rejected: ') + reason]);
    redrawId = dbLastId();
  }

  // Notify ordering doctor via portal_messages (also use logAction for audit)
  await logAction('SPECIMEN_REJECTED',
    `Lab tech ${user.full_name_en} rejected ${order.test_name} for patient ${order.full_name_en || order.full_name_ar} (MRN ${order.mrn}). Reason: ${reason}${detail ? ' — ' + detail : ''}${redraw ? '. Redraw order #' + redrawId + ' created.' : ''}`,
    null, order.patient_id, order.full_name_en || order.full_name_ar, order.mrn);

  saveDBToIndexedDB();
  document.querySelector('.alert-overlay')?.remove();
  showSuccess(lang === 'ar'
    ? `تم الرفض${redraw ? ' وأنشئ طلب إعادة سحب' : ''}`
    : `Rejected${redraw ? ' and redraw order created' : ''}. Doctor will see audit notification.`);
  navigateTo('lt-pending');
}

async function handleLabReceive(orderId) {
  const user = getCurrentUser();
  const order = dbGet(`SELECT lo.*, p.full_name_en, p.full_name_ar, p.mrn, p.patient_id FROM lab_orders lo
    JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id WHERE lo.order_id = ?`, [orderId]);

  dbRun('UPDATE lab_orders SET status = ?, received_by = ?, received_at = ? WHERE order_id = ?',
    ['received', user.user_id, nowISO(), orderId]);

  await logAction('LAB_RECEIVED',
    `Lab tech ${user.full_name_en} received sample for ${order.test_name} from patient ${order.full_name_en || order.full_name_ar}`,
    null, order.patient_id, order.full_name_en || order.full_name_ar, order.mrn);

  showSuccess(t('lab_received_success'));
  saveDBToIndexedDB();
  navigateTo('lt-pending');
}

function showLabResultForm(orderId) {
  const lang = currentLanguage();
  const order = dbGet(`SELECT lo.*, p.full_name_ar, p.full_name_en, p.mrn FROM lab_orders lo
    JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id WHERE lo.order_id = ?`, [orderId]);
  if (!order) return;

  const catalogTest = typeof LAB_TEST_CATALOG !== 'undefined' ? LAB_TEST_CATALOG.find(t => t.code === order.test_code) : null;
  const components = catalogTest && catalogTest.components ? catalogTest.components : null;

  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';

  let formHtml = '';
  if (components) {
    formHtml = `<table class="w-full"><thead><tr><th>${t('lab_component')}</th><th>${t('lab_result_value')}</th><th>${t('lab_unit')}</th><th>${t('lab_ref_range')}</th><th>${t('lab_result_flag')}</th></tr></thead><tbody>`;
    components.forEach((c, i) => {
      formHtml += `<tr>
        <td>${lang === 'ar' ? escapeHtml(c.ar || c.en) : escapeHtml(c.en)}</td>
        <td><input type="text" class="comp-val" data-idx="${i}" style="width:100px"></td>
        <td>${escapeHtml(c.unit || '')}</td><td>${escapeHtml(c.ref || '')}</td>
        <td><select class="comp-flag" data-idx="${i}">
          <option value="normal">${t('lab_flag_normal')}</option><option value="high">${t('lab_flag_high')}</option>
          <option value="low">${t('lab_flag_low')}</option><option value="critical_high">${t('lab_flag_critical')}</option><option value="critical_low">${t('lab_flag_critical')}</option>
        </select></td></tr>`;
    });
    formHtml += '</tbody></table>';
  } else {
    formHtml = `<div class="form-group"><label>${t('lab_result_value')}</label><input type="text" id="lr-value"></div>
      <div class="form-row"><div class="form-group"><label>${t('lab_unit')}</label><input type="text" id="lr-unit"></div>
      <div class="form-group"><label>${t('lab_result_flag')}</label><select id="lr-flag">
        <option value="normal">${t('lab_flag_normal')}</option><option value="high">${t('lab_flag_high')}</option>
        <option value="low">${t('lab_flag_low')}</option><option value="critical_high">${t('lab_flag_critical')}</option>
      </select></div></div>`;
  }

  overlay.innerHTML = `<div class="alert-modal" style="max-width:700px">
    <h2>${t('lab_enter_result')} — ${escapeHtml(order.test_name)}</h2>
    <p class="text-muted mb-2">${lang === 'ar' ? escapeHtml(order.full_name_ar) : escapeHtml(order.full_name_en || order.full_name_ar)} (${order.mrn})</p>
    ${formHtml}
    <div class="form-group mt-2"><label>${t('notes')}</label><textarea id="lr-notes" rows="2"></textarea></div>
    <div class="alert-buttons">
      <button class="btn btn-primary" id="lr-submit-btn">${t('save_btn')}</button>
      <button class="btn btn-secondary" onclick="this.closest('.alert-overlay').remove()">${t('cancel_btn')}</button>
    </div></div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#lr-submit-btn').addEventListener('click', async () => {
    const user = getCurrentUser();
    const notes = overlay.querySelector('#lr-notes').value.trim();

    if (components) {
      const vals = overlay.querySelectorAll('.comp-val');
      const flags = overlay.querySelectorAll('.comp-flag');
      let overallFlag = 'normal';
      components.forEach((c, i) => {
        const val = vals[i].value;
        const flag = flags[i].value;
        if (flag.includes('critical')) overallFlag = flag;
        else if (flag !== 'normal' && overallFlag === 'normal') overallFlag = flag;
        dbRun('INSERT INTO lab_result_details (order_id, component_en, component_ar, value, unit, ref_range, flag) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [orderId, c.en, c.ar || c.en, val, c.unit || '', c.ref || '', flag]);
      });
      dbRun('UPDATE lab_orders SET status = ?, resulted_by = ?, resulted_at = ?, result_value = ?, result_flag = ?, result_notes = ?, is_critical = ? WHERE order_id = ?',
        ['resulted', user.user_id, nowISO(), 'See details', overallFlag, notes || null, overallFlag.includes('critical') ? 1 : 0, orderId]);
    } else {
      const val = overlay.querySelector('#lr-value').value;
      const unit = overlay.querySelector('#lr-unit').value;
      const flag = overlay.querySelector('#lr-flag').value;
      dbRun('UPDATE lab_orders SET status = ?, resulted_by = ?, resulted_at = ?, result_value = ?, result_unit = ?, result_flag = ?, result_notes = ?, is_critical = ? WHERE order_id = ?',
        ['resulted', user.user_id, nowISO(), val, unit, flag, notes || null, flag.includes('critical') ? 1 : 0, orderId]);
    }

    const patient = dbGet(`SELECT p.* FROM lab_orders lo JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id WHERE lo.order_id = ?`, [orderId]);
    await logAction('LAB_RESULTED',
      `Lab tech ${user.full_name_en} entered results for ${order.test_name} for patient ${patient ? (patient.full_name_en || patient.full_name_ar) : ''}`,
      null, patient ? patient.patient_id : null, patient ? (patient.full_name_en || patient.full_name_ar) : '', patient ? patient.mrn : '');

    overlay.remove();
    showSuccess(t('lab_resulted_success'));
    saveDBToIndexedDB();
    navigateTo('lt-pending');
  });
}

function renderLTResults(main, lang) {
  const received = dbAll(`SELECT lo.*, p.full_name_ar, p.full_name_en, p.mrn
    FROM lab_orders lo JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id
    WHERE lo.status = 'received' AND (lo.category IS NULL OR lo.category != 'radiology' AND lo.category != 'cardiology') ORDER BY CASE lo.priority WHEN 'stat' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, lo.received_at`);

  const cardiology = dbAll(`SELECT lo.*, p.full_name_ar, p.full_name_en, p.mrn
    FROM lab_orders lo JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id
    WHERE lo.status = 'received' AND lo.category = 'cardiology' ORDER BY CASE lo.priority WHEN 'stat' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, lo.received_at`);

  const renderTable = (items, isCardiology) => {
    if (!items.length) return '';
    return `<div class="table-container"><table><thead><tr>
      <th>${t('patient_col')}</th><th>${t('mrn')}</th><th>${t('lab_test_name')}</th>
      <th>${t('lab_priority')}</th><th>${t('actions')}</th>
    </tr></thead>
    <tbody>${items.map(l => {
      const priBadge = l.priority === 'stat' ? 'badge-danger' : l.priority === 'urgent' ? 'badge-warning' : 'badge-neutral';
      return `<tr>
        <td>${lang === 'ar' ? escapeHtml(l.full_name_ar) : escapeHtml(l.full_name_en || l.full_name_ar)}</td>
        <td>${l.mrn}</td><td>${escapeHtml(l.test_name)}</td>
        <td><span class="badge ${priBadge}">${l.priority.toUpperCase()}</span></td>
        <td><button class="btn btn-sm btn-success" onclick="${isCardiology ? 'showECGResultForm' : 'showLabResultForm'}(${l.order_id})">${t('lab_enter_result')}</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  };

  main.innerHTML = `
    <div class="page-header"><h1>${t('lab_results_entry')}</h1></div>
    ${cardiology.length > 0 ? `
      <div class="card mb-3" style="border-left:4px solid #dc3545;">
        <div class="card-header" style="background:#fff5f5;"><h3 style="color:#dc3545;">&#9829; ${t('cat_cardiology')} — ${lang === 'ar' ? 'رسم القلب والإجراءات القلبية' : 'ECG & Cardiac Procedures'}</h3></div>
        ${renderTable(cardiology, true)}
      </div>` : ''}
    ${received.length > 0 ? `
      <h3 style="margin-bottom:8px;">${lang === 'ar' ? 'تحاليل مستلمة — انتظار الإدخال' : 'Received Samples — Awaiting Results'}</h3>
      ${renderTable(received, false)}` : ''}
    ${!received.length && !cardiology.length ? `<div class="empty-state"><p>${t('no_data')}</p></div>` : ''}
  `;
}

function showECGResultForm(orderId) {
  const lang = currentLanguage();
  const order = dbGet(`SELECT lo.*, p.full_name_ar, p.full_name_en, p.mrn, p.date_of_birth, p.gender
    FROM lab_orders lo JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id
    WHERE lo.order_id = ?`, [orderId]);
  if (!order) return;

  const testEntry = LAB_TEST_CATALOG.find(t => t.code === order.test_code);
  const components = testEntry?.components || [];

  const modal = document.createElement('div');
  modal.id = 'ecg-result-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px;max-width:640px;width:100%;max-height:90vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="color:#dc3545;">&#9829; ${escapeHtml(order.test_name)}</h3>
        <button onclick="document.getElementById('ecg-result-modal').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;">&times;</button>
      </div>
      <div style="background:#f8f9fa;padding:10px;border-radius:6px;margin-bottom:16px;font-size:0.85rem;">
        <strong>${lang === 'ar' ? 'المريض' : 'Patient'}:</strong> ${lang === 'ar' ? escapeHtml(order.full_name_ar) : escapeHtml(order.full_name_en || order.full_name_ar)}
        &nbsp;|&nbsp; <strong>MRN:</strong> ${escapeHtml(order.mrn)}
        &nbsp;|&nbsp; <strong>${lang === 'ar' ? 'الجنس' : 'Gender'}:</strong> ${order.gender || '—'}
      </div>
      <form id="ecg-result-form">
        ${components.length > 0 ? `
          <h4 style="margin-bottom:12px;">${lang === 'ar' ? 'نتائج التخطيط' : 'ECG Parameters'}</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
            ${components.map((c, i) => `
              <div class="form-group" style="margin:0;">
                <label style="font-size:0.82rem;">${lang === 'ar' ? c.ar : c.en}${c.unit ? ' (' + c.unit + ')' : ''}${c.ref ? ' <span style="color:#888;font-weight:400;">[' + c.ref + ']</span>' : ''}</label>
                ${c.en === 'Interpretation' || c.en === 'ST Segment' || c.en === 'T-wave' || c.ar === 'التفسير الكلي'
                  ? `<textarea class="ecg-component" data-idx="${i}" rows="2" style="width:100%;border:1px solid #ccc;border-radius:4px;padding:6px;" placeholder="${lang === 'ar' ? c.ar : c.en}"></textarea>`
                  : `<input type="text" class="ecg-component" data-idx="${i}" style="width:100%;border:1px solid #ccc;border-radius:4px;padding:6px;" placeholder="${c.ref || ''}">`}
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="form-group">
          <label>${lang === 'ar' ? 'ملاحظات إضافية' : 'Additional Notes'}</label>
          <textarea id="ecg-notes" rows="2" style="width:100%;border:1px solid #ccc;border-radius:4px;padding:6px;"></textarea>
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="ecg-critical"> ${lang === 'ar' ? 'نتيجة حرجة — يستدعي إبلاغ فوري' : 'Critical Result — Requires immediate notification'}</label>
        </div>
        <div class="flex gap-1">
          <button type="button" class="btn btn-success" onclick="handleECGResultSave(${orderId})">${t('save_btn')}</button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('ecg-result-modal').remove()">${t('cancel_btn')}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
}

async function handleECGResultSave(orderId) {
  const lang = currentLanguage();
  const user = getCurrentUser();
  if (!user) return;

  const order = dbGet('SELECT * FROM lab_orders WHERE order_id = ?', [orderId]);
  const testEntry = LAB_TEST_CATALOG.find(t => t.code === order.test_code);
  const components = testEntry?.components || [];
  const compEls = document.querySelectorAll('.ecg-component');
  const notes = document.getElementById('ecg-notes')?.value.trim() || '';
  const isCritical = document.getElementById('ecg-critical')?.checked ? 1 : 0;

  // Build structured result
  const results = {};
  compEls.forEach(el => {
    const idx = parseInt(el.dataset.idx);
    if (components[idx]) {
      results[components[idx].en] = el.value.trim();
    }
  });
  const interpretation = results['Interpretation'] || '';
  const resultValue = interpretation || Object.entries(results).filter(([k,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' | ');
  const resultDetails = JSON.stringify(results);

  dbRun(`UPDATE lab_orders SET status='resulted', result_value=?, result_notes=?, notes=?, is_critical=?, resulted_at=?, resulted_by=? WHERE order_id=?`,
    [resultValue, resultDetails, notes, isCritical, nowISO(), user.user_id, orderId]);

  const patient = dbGet(`SELECT p.* FROM lab_orders lo JOIN admissions a ON lo.admission_id=a.admission_id JOIN patients p ON a.patient_id=p.patient_id WHERE lo.order_id=?`, [orderId]);
  await logAction('ECG_RESULTED',
    `${user.full_name_en} entered ${order.test_name} result for ${patient?.full_name_en || ''}. ${isCritical ? 'CRITICAL' : ''}`,
    null, patient?.patient_id, patient?.full_name_en, patient?.mrn);

  saveDBToIndexedDB();
  document.getElementById('ecg-result-modal')?.remove();
  showSuccess(lang === 'ar' ? 'تم حفظ نتيجة رسم القلب' : 'ECG result saved successfully');
  renderLTResults(document.getElementById('main-content'), lang);
}

function renderLTHistory(main, lang) {
  const results = dbAll(`SELECT lo.*, p.full_name_ar, p.full_name_en, p.mrn, u.full_name_en as tech_en, u.full_name_ar as tech_ar
    FROM lab_orders lo JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN users u ON lo.resulted_by = u.user_id
    WHERE lo.status = 'resulted' AND (lo.category IS NULL OR lo.category != 'radiology' AND lo.category != 'cardiology') ORDER BY lo.resulted_at DESC LIMIT 50`);

  main.innerHTML = `
    <div class="page-header"><h1>${t('lab_history')}</h1></div>
    ${results.length === 0 ? `<div class="empty-state"><p>${t('no_data')}</p></div>` : `
    <div class="table-container"><table><thead><tr>
      <th>${t('date')}</th><th>${t('patient_col')}</th><th>${t('lab_test_name')}</th>
      <th>${t('lab_result_value')}</th><th>${lang === 'ar' ? 'المرجع' : 'Reference'}</th>
      <th>${t('lab_result_flag')}</th>
      <th title="${lang === 'ar' ? 'وقت الاستجابة (من الأمر إلى النتيجة)' : 'Turnaround time: order → result'}">${lang === 'ar' ? 'وقت الاستجابة' : 'TAT'}</th>
      <th>${lang === 'ar' ? 'بواسطة' : 'By'}</th>
    </tr></thead>
    <tbody>${results.map(l => {
      const flag = l.result_flag || 'normal';
      const test = typeof LAB_TEST_CATALOG !== 'undefined' ? LAB_TEST_CATALOG.find(t => t.code === l.test_code) : null;
      const refRange = test && test.components ? test.components.map(c => c.en + ': ' + c.ref).join(', ') : '';
      const tat = (typeof calcTAT === 'function') ? calcTAT(l.ordered_at, l.resulted_at) : null;
      return `<tr class="lab-result-row">
        <td>${formatDateTime(l.resulted_at)}</td>
        <td>${lang === 'ar' ? escapeHtml(l.full_name_ar) : escapeHtml(l.full_name_en || l.full_name_ar)}</td>
        <td>${escapeHtml(l.test_name)}</td>
        <td>${l.result_value === 'See details' ? `<button class="btn btn-sm btn-info" onclick="showLabDetails(${l.order_id})">${t('details')}</button>` : escapeHtml(l.result_value || '—')}</td>
        <td>${refRange || '—'}</td>
        <td><span class="flag-${flag}">${flag}</span></td>
        <td>${(typeof tatBadge === 'function') ? tatBadge(tat) : '—'}</td>
        <td>${lang === 'ar' ? escapeHtml(l.tech_ar || '') : escapeHtml(l.tech_en || '')}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`}
  `;
}

function showLabDetails(orderId) {
  const lang = currentLanguage();
  const details = dbAll('SELECT * FROM lab_result_details WHERE order_id = ?', [orderId]);
  if (!details.length) { showInfo(lang === 'ar' ? 'لا توجد تفاصيل' : 'No detailed results'); return; }

  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  overlay.innerHTML = `<div class="alert-modal" style="max-width:600px">
    <h2>${t('lab_view_results')}</h2>
    <div class="table-container"><table><thead><tr><th>${t('lab_component')}</th><th>${t('lab_result_value')}</th><th>${t('lab_unit')}</th><th>${t('lab_ref_range')}</th><th>${t('lab_result_flag')}</th></tr></thead>
    <tbody>${details.map(d => `<tr class="lab-result-row">
      <td>${lang === 'ar' ? escapeHtml(d.component_ar || d.component_en) : escapeHtml(d.component_en)}</td>
      <td><strong>${escapeHtml(d.value || '—')}</strong></td><td>${escapeHtml(d.unit || '')}</td>
      <td>${escapeHtml(d.ref_range || '')}</td>
      <td><span class="flag-${d.flag || 'normal'}">${escapeHtml(d.flag || 'normal')}</span></td>
    </tr>`).join('')}</tbody></table></div>
    <div class="alert-buttons"><button class="btn btn-secondary" onclick="this.closest('.alert-overlay').remove()">${t('close_btn')}</button></div>
  </div>`;
  document.body.appendChild(overlay);
}

// ============================================================
// TRIAGE NURSE — Pre-arrival board + Waiting Queue (NEW)
// Fills the Maria-persona gap: visible role with pre-arrival workflow
// ============================================================

function renderTNArrivals(main, lang) {
  const arrivals = dbAll(`SELECT a.*, u.full_name_en as creator_en, u.full_name_ar as creator_ar
    FROM incoming_arrivals a LEFT JOIN users u ON a.created_by = u.user_id
    WHERE a.status = 'pending' ORDER BY
      CASE a.severity WHEN 'stemi' THEN 1 WHEN 'stroke' THEN 1 WHEN 'critical' THEN 2 WHEN 'urgent' THEN 3 ELSE 4 END,
      a.eta_minutes ASC NULLS LAST, a.created_at DESC`);

  const sevBadge = sev => {
    const map = {
      stemi:    { ar: 'STEMI - فتح مختبر القسطرة', en: 'STEMI — Cath Lab',   color: '#dc2626' },
      stroke:   { ar: 'سكتة - تنبيه فريق',         en: 'STROKE — Team Alert', color: '#dc2626' },
      critical: { ar: 'حرج',                       en: 'Critical',            color: '#dc2626' },
      urgent:   { ar: 'عاجل',                      en: 'Urgent',              color: '#f59e0b' },
      stable:   { ar: 'مستقر',                     en: 'Stable',              color: '#10b981' },
    };
    const m = map[sev] || { ar: sev, en: sev, color: '#888' };
    return `<span class="badge" style="background:${m.color};color:#fff;font-weight:700;">${lang === 'ar' ? m.ar : m.en}</span>`;
  };

  main.innerHTML = `
    <div class="page-header">
      <h1>&#128657; ${lang === 'ar' ? 'لوحة الوصول والفرز' : 'Arrivals & Triage Board'}</h1>
      <button class="btn btn-primary" onclick="showAddArrivalForm()">${lang === 'ar' ? '+ تسجيل وصول قادم' : '+ Pre-Register Arrival'}</button>
    </div>
    <p style="color:#666;font-size:0.88rem;margin-bottom:14px;">
      ${lang === 'ar' ? 'سجّل المرضى القادمين قبل وصولهم (الإسعاف، الاتصال المسبق، التحويل). فعّل بروتوكولات الفريق للحالات الحرجة.' : 'Pre-register patients before they arrive (ambulance, phoned-in, transfers). Trigger team protocols for critical cases.'}
    </p>
    <div id="tn-add-arrival"></div>
    ${arrivals.length === 0
      ? `<div class="empty-state"><p>${lang === 'ar' ? 'لا توجد حالات وصول قادمة. اضغط "تسجيل وصول قادم" عند تلقي اتصال.' : 'No incoming arrivals. Press "Pre-Register Arrival" when notified.'}</p></div>`
      : `<div class="table-container"><table>
          <thead><tr>
            <th>${sevBadge('').replace(/<[^>]+>/g, '') ? lang === 'ar' ? 'الخطورة' : 'Severity' : ''}</th>
            <th>${lang === 'ar' ? 'الوصف' : 'Label'}</th>
            <th>${lang === 'ar' ? 'الشكوى' : 'Complaint'}</th>
            <th>${lang === 'ar' ? 'وسيلة' : 'Mode'}</th>
            <th>${lang === 'ar' ? 'الوصول خلال' : 'ETA'}</th>
            <th>${lang === 'ar' ? 'سجّل بواسطة' : 'By'}</th>
            <th>${t('actions')}</th>
          </tr></thead>
          <tbody>${arrivals.map(a => `<tr>
            <td>${sevBadge(a.severity)}</td>
            <td>${escapeHtml(a.patient_label || '—')} ${a.age_guess ? `<small style="color:#888">(${a.age_guess}${lang === 'ar' ? ' سنة' : 'y'} ${a.gender_guess || ''})</small>` : ''}</td>
            <td>${escapeHtml(a.chief_complaint || '—')}</td>
            <td>${escapeHtml(a.mode || '—')}</td>
            <td>${a.eta_minutes !== null && a.eta_minutes !== undefined ? a.eta_minutes + ' ' + (lang === 'ar' ? 'د' : 'min') : '—'}</td>
            <td><small>${lang === 'ar' ? escapeHtml(a.creator_ar || '') : escapeHtml(a.creator_en || '')}</small></td>
            <td>
              <button class="btn btn-sm btn-success" onclick="convertArrivalToPatient(${a.arrival_id})">${lang === 'ar' ? 'وصل ← تسجيل' : 'Arrived → Register'}</button>
              <button class="btn btn-sm btn-secondary" onclick="cancelArrival(${a.arrival_id})">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
            </td>
          </tr>`).join('')}</tbody>
        </table></div>`}
  `;
}

function showAddArrivalForm() {
  const lang = currentLanguage();
  document.getElementById('tn-add-arrival').innerHTML = `
    <div class="card mb-3" style="border-left:4px solid #dc2626;">
      <form onsubmit="handleAddArrival(event)">
        <div class="form-row">
          <div class="form-group">
            <label>${lang === 'ar' ? 'وسيلة الوصول *' : 'Mode of arrival *'}</label>
            <select id="ar-mode" required>
              <option value="ambulance">${lang === 'ar' ? 'إسعاف' : 'Ambulance'}</option>
              <option value="walk_in">${lang === 'ar' ? 'حضور مباشر' : 'Walk-in'}</option>
              <option value="referral">${lang === 'ar' ? 'تحويل من منشأة' : 'Referral'}</option>
              <option value="police">${lang === 'ar' ? 'شرطة / حوادث' : 'Police / trauma'}</option>
            </select>
          </div>
          <div class="form-group">
            <label>${lang === 'ar' ? 'الخطورة *' : 'Severity *'}</label>
            <select id="ar-sev" required>
              <option value="stemi">STEMI ${lang === 'ar' ? '— تنبيه فوري لمختبر القسطرة' : '— immediate Cath Lab alert'}</option>
              <option value="stroke">${lang === 'ar' ? 'سكتة — تنبيه فريق السكتات' : 'Stroke — alert stroke team'}</option>
              <option value="critical">${lang === 'ar' ? 'حرج' : 'Critical'}</option>
              <option value="urgent" selected>${lang === 'ar' ? 'عاجل' : 'Urgent'}</option>
              <option value="stable">${lang === 'ar' ? 'مستقر' : 'Stable'}</option>
            </select>
          </div>
          <div class="form-group">
            <label>${lang === 'ar' ? 'الوصول خلال (دقائق)' : 'ETA (minutes)'}</label>
            <input type="number" id="ar-eta" min="0" max="120" placeholder="5">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${lang === 'ar' ? 'وصف المريض' : 'Patient label'}</label><input type="text" id="ar-label" placeholder="${lang === 'ar' ? 'مثال: ذكر 55 سنة' : 'e.g. M 55yo'}"></div>
          <div class="form-group"><label>${lang === 'ar' ? 'العمر التقريبي' : 'Approx age'}</label><input type="number" id="ar-age" min="0" max="120"></div>
          <div class="form-group">
            <label>${lang === 'ar' ? 'الجنس' : 'Gender'}</label>
            <select id="ar-gender"><option value="">—</option><option value="male">${t('male')}</option><option value="female">${t('female')}</option></select>
          </div>
        </div>
        <div class="form-group">
          <label>${lang === 'ar' ? 'الشكوى الرئيسية' : 'Chief complaint'}</label>
          <textarea id="ar-cc" rows="2" placeholder="${lang === 'ar' ? 'مثال: ألم صدر منذ ساعة، تعرّق' : 'e.g. Chest pain 1h, diaphoresis'}"></textarea>
        </div>
        <div class="form-group">
          <label>${lang === 'ar' ? 'ملاحظات المسعف / المُتصل' : 'Paramedic / caller notes'}</label>
          <textarea id="ar-notes" rows="2" placeholder="${lang === 'ar' ? 'مثال: ضغط 90/60، نبض 120، أعطي أسبرين' : 'e.g. BP 90/60, HR 120, ASA given'}"></textarea>
        </div>
        <div class="flex gap-1">
          <button type="submit" class="btn btn-primary">${lang === 'ar' ? 'سجّل الوصول' : 'Save Arrival'}</button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('tn-add-arrival').innerHTML=''">${t('cancel_btn')}</button>
        </div>
      </form>
    </div>`;
}

async function handleAddArrival(e) {
  e.preventDefault();
  const lang = currentLanguage();
  const user = getCurrentUser();
  const mode = document.getElementById('ar-mode').value;
  const sev = document.getElementById('ar-sev').value;
  const eta = document.getElementById('ar-eta').value;
  const label = document.getElementById('ar-label').value.trim();
  const age = document.getElementById('ar-age').value;
  const gender = document.getElementById('ar-gender').value;
  const cc = document.getElementById('ar-cc').value.trim();
  const notes = document.getElementById('ar-notes').value.trim();

  dbRun(`INSERT INTO incoming_arrivals (mode, patient_label, age_guess, gender_guess, chief_complaint, severity, eta_minutes, paramedic_notes, created_by, created_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [mode, label || null, age ? parseInt(age) : null, gender || null, cc || null, sev, eta ? parseInt(eta) : null, notes || null, user.user_id, nowISO()]);

  await logAction('ARRIVAL_PRE_REGISTERED',
    `Triage nurse ${user.full_name_en} pre-registered ${sev.toUpperCase()} arrival via ${mode}: ${cc || label || '—'} ETA ${eta || '?'}min`);
  saveDBToIndexedDB();

  // For STEMI/Stroke: REAL auto-page (creates audit-logged in-app notifications for clinical staff)
  if (sev === 'stemi' || sev === 'stroke') {
    const subject = sev === 'stemi'
      ? '🚨 STEMI ALERT — incoming patient'
      : '🚨 STROKE ALERT — incoming patient';
    const body = (lang === 'ar'
      ? `وصول قادم (${eta || '?'} دقائق):\n${label || 'مريض غير محدد'}${age ? ', ' + age + ' سنة' : ''}${gender ? ', ' + (gender === 'male' ? 'ذكر' : 'أنثى') : ''}\n\nالشكوى: ${cc || '—'}\n\nملاحظات: ${notes || '—'}\n\n${sev === 'stemi' ? 'تنبيه: تنشيط مختبر القسطرة — هدف 90 دقيقة من الباب إلى البالون.' : 'تنبيه: تنشيط فريق السكتات — CT دماغ بدون صبغة جاهز.'}`
      : `Incoming arrival (${eta || '?'} min ETA):\n${label || 'unspecified patient'}${age ? ', ' + age + 'yo' : ''}${gender ? ', ' + gender : ''}\n\nComplaint: ${cc || '—'}\n\nNotes: ${notes || '—'}\n\n${sev === 'stemi' ? 'ALERT: Cath Lab activation — target 90-min door-to-balloon.' : 'ALERT: Stroke team — CT head non-contrast on standby.'}`);
    // Page all active doctors + senior nurses + on-shift nurses in clinical depts
    const team = dbAll(`SELECT user_id, full_name_en, role FROM users
      WHERE role IN ('doctor','consultant','emergency_doctor','senior_nurse','nurse') AND is_active = 1
      LIMIT 50`);
    let paged = 0;
    for (const member of team) {
      // Use a system_notifications-style row via portal_messages with from_type='system' (legacy table reuse — patient_id = arrival_id as locator)
      dbRun(`INSERT INTO portal_messages (patient_id, from_type, from_id, subject, body, sent_at)
        VALUES (?, 'system', ?, ?, ?, ?)`,
        [member.user_id, user.user_id, subject + ' [→ user:' + member.user_id + ']', body, nowISO()]);
      paged++;
    }
    await logAction('TEAM_PAGED',
      `Triage nurse ${user.full_name_en} auto-paged ${paged} clinical staff for ${sev.toUpperCase()} arrival: ${cc || label || '—'}`);
    saveDBToIndexedDB();
    // Visual confirmation
    const teamMsg = sev === 'stemi'
      ? (lang === 'ar' ? `&#128680; تم إخطار <strong>${paged}</strong> من الفريق السريري لـ STEMI. هدف ELT < 90 دقيقة.` : `&#128680; <strong>${paged}</strong> clinical staff paged for STEMI. Target door-to-balloon < 90 min.`)
      : (lang === 'ar' ? `&#128680; تم إخطار <strong>${paged}</strong> من الفريق السريري لسكتة. CT دماغ بدون صبغة جاهز.` : `&#128680; <strong>${paged}</strong> clinical staff paged for STROKE. CT head non-contrast on standby.`);
    showRedAlert(teamMsg, () => {});
  }
  navigateTo('tn-arrivals');
}

async function cancelArrival(arrivalId) {
  const lang = currentLanguage();
  showConfirm(lang === 'ar' ? 'إلغاء هذه الحالة؟' : 'Cancel this arrival?', async () => {
    dbRun(`UPDATE incoming_arrivals SET status = 'cancelled' WHERE arrival_id = ?`, [arrivalId]);
    saveDBToIndexedDB();
    navigateTo('tn-arrivals');
  });
}

async function convertArrivalToPatient(arrivalId) {
  const lang = currentLanguage();
  const ar = dbGet('SELECT * FROM incoming_arrivals WHERE arrival_id = ?', [arrivalId]);
  if (!ar) return;
  // Pre-fill the registration form with arrival data
  sessionStorage.setItem('arrival_prefill', JSON.stringify(ar));
  navigateTo('tn-register');
  // Wait for DOM and pre-fill
  setTimeout(() => {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    setVal('reg-complaint', ar.chief_complaint || '');
    setVal('reg-name-ar', ar.patient_label || '');
    if (ar.gender_guess) setVal('reg-gender', ar.gender_guess);
    // Severity → ESI level
    const esiMap = { stemi: '1', stroke: '1', critical: '2', urgent: '3', stable: '4' };
    setVal('reg-triage', esiMap[ar.severity] || '3');
    setVal('reg-arrival', ar.mode);
    if (ar.paramedic_notes) {
      const dispEl = document.getElementById('reg-disposition');
      if (dispEl) dispEl.value = (lang === 'ar' ? 'ملاحظات المسعف: ' : 'Paramedic notes: ') + ar.paramedic_notes;
    }
    // Mark the arrival as converting (will be finalized when registration succeeds)
    dbRun(`UPDATE incoming_arrivals SET status = 'converting' WHERE arrival_id = ?`, [arrivalId]);
    saveDBToIndexedDB();
    showSuccess(lang === 'ar' ? 'تم نقل البيانات إلى نموذج التسجيل' : 'Arrival data loaded into registration form');
  }, 300);
}

function renderTNQueue(main, lang) {
  // Patients registered but not yet seen by ER doctor
  const waiting = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id,
    (SELECT MIN(c.created_at) FROM consultations c WHERE c.admission_id = a.admission_id) as first_consult
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id
    WHERE a.status = 'active' AND a.dept_id IN (SELECT dept_id FROM departments WHERE LOWER(name_en) LIKE '%emergency%' OR LOWER(name_en) LIKE '%er%')
    ORDER BY a.complexity_score DESC, a.admitted_at ASC`);

  main.innerHTML = `
    <div class="page-header"><h1>${lang === 'ar' ? 'قائمة انتظار الفرز' : 'Triage Waiting Queue'}</h1></div>
    ${waiting.length === 0 ? `<div class="empty-state"><p>${lang === 'ar' ? 'لا يوجد منتظرون' : 'No patients waiting'}</p></div>`
    : `<div class="table-container"><table>
        <thead><tr>
          <th>ESI</th>
          <th>${lang === 'ar' ? 'الاسم' : 'Name'}</th>
          <th>${t('mrn')}</th>
          <th>${t('chief_complaint')}</th>
          <th>${lang === 'ar' ? 'الانتظار' : 'Waiting'}</th>
          <th>${lang === 'ar' ? 'الحالة' : 'Seen?'}</th>
        </tr></thead>
        <tbody>${waiting.map(w => {
          const waitMin = Math.floor((Date.now() - new Date(w.admitted_at).getTime()) / 60000);
          const esiColor = w.complexity_score >= 4 ? '#dc2626' : w.complexity_score === 3 ? '#f59e0b' : '#10b981';
          return `<tr>
            <td><span class="badge" style="background:${esiColor};color:#fff;">${6 - w.complexity_score}</span></td>
            <td>${lang === 'ar' ? escapeHtml(w.full_name_ar) : escapeHtml(w.full_name_en || w.full_name_ar)}</td>
            <td>${w.mrn}</td>
            <td>${escapeHtml(w.chief_complaint || '—')}</td>
            <td><strong style="color:${waitMin > 30 ? '#dc2626' : waitMin > 15 ? '#f59e0b' : '#10b981'};">${waitMin} ${lang === 'ar' ? 'د' : 'min'}</strong></td>
            <td>${w.first_consult ? `<span class="badge badge-success">&check;</span>` : `<span class="badge badge-warning">${lang === 'ar' ? 'بانتظار طبيب' : 'awaiting MD'}</span>`}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`}
  `;
}

// ============================================================
// RADIOLOGIST — Pending Imaging
// ============================================================

function renderRadPending(main, lang) {
  const pending = dbAll(`SELECT lo.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id,
    doc.full_name_en as doc_en, doc.full_name_ar as doc_ar
    FROM lab_orders lo JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN users doc ON lo.doctor_id = doc.user_id
    WHERE lo.category = 'radiology' AND lo.status IN ('ordered','collected','received') ORDER BY CASE lo.priority WHEN 'stat' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, lo.ordered_at`);

  main.innerHTML = `
    <div class="page-header"><h1>${t('rad_pending')}</h1></div>
    ${pending.length === 0 ? `<div class="empty-state"><p>${t('no_data')}</p></div>` : `
    <div class="table-container"><table><thead><tr><th>${t('patient_col')}</th><th>${t('mrn')}</th><th>${t('lab_test_name')}</th><th>${t('lab_priority')}</th><th>${t('lab_prep_notes')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr></thead>
    <tbody>${pending.map(l => {
      const priBadge = l.priority === 'stat' ? 'badge-danger' : l.priority === 'urgent' ? 'badge-warning' : 'badge-neutral';
      const statusBadge = 'badge-' + l.status;
      return `<tr>
        <td>${lang === 'ar' ? escapeHtml(l.full_name_ar) : escapeHtml(l.full_name_en || l.full_name_ar)}</td>
        <td>${l.mrn}</td><td>${escapeHtml(l.test_name)}</td>
        <td><span class="badge ${priBadge}">${l.priority.toUpperCase()}</span></td>
        <td>${l.prep_notes ? `<span class="text-warning">${escapeHtml(l.prep_notes)}</span>` : '—'}</td>
        <td><span class="badge ${statusBadge}">${l.status}</span></td>
        <td><button class="btn btn-sm btn-success" onclick="showRadResultForm(${l.order_id})">${t('lab_enter_result')}</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`}
  `;
}

function showRadResultForm(orderId) {
  const lang = currentLanguage();
  const order = dbGet(`SELECT lo.*, p.full_name_ar, p.full_name_en, p.mrn FROM lab_orders lo
    JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id WHERE lo.order_id = ?`, [orderId]);

  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  overlay.innerHTML = `<div class="alert-modal" style="max-width:600px">
    <h2>${t('rad_report')} — ${escapeHtml(order.test_name)}</h2>
    <p class="text-muted mb-2">${lang === 'ar' ? escapeHtml(order.full_name_ar) : escapeHtml(order.full_name_en || order.full_name_ar)} (${order.mrn})</p>
    <div class="form-group"><label>${lang === 'ar' ? 'المعلومات السريرية' : 'Clinical Indication'}</label><input type="text" id="rad-indication" placeholder="${lang === 'ar' ? 'السبب السريري للفحص' : 'Clinical reason for examination'}"></div>
    <div class="form-group"><label>${lang === 'ar' ? 'التقنية' : 'Technique'}</label><input type="text" id="rad-technique" placeholder="${lang === 'ar' ? 'مثال: أشعة سينية PA و جانبية' : 'e.g. PA and lateral radiographs'}"></div>
    <div class="form-group"><label>${lang === 'ar' ? 'مقارنة' : 'Comparison'}</label><input type="text" id="rad-comparison" placeholder="${lang === 'ar' ? 'مقارنة بفحص سابق إن وجد' : 'Comparison with prior study if available'}"></div>
    <div class="form-group"><label>${lang === 'ar' ? 'النتائج' : 'Findings'}</label><textarea id="rad-findings-detail" rows="4" placeholder="${lang === 'ar' ? 'صف النتائج بالتفصيل...' : 'Describe findings in detail...'}"></textarea></div>
    <div class="form-group"><label>${lang === 'ar' ? 'الانطباع / الخلاصة' : 'Impression'}</label><textarea id="rad-impression" rows="2" placeholder="${lang === 'ar' ? 'الخلاصة التشخيصية' : 'Diagnostic conclusion'}"></textarea></div>
    <div class="form-group"><label>${lang === 'ar' ? 'التوصيات' : 'Recommendations'}</label><input type="text" id="rad-recommendations" placeholder="${lang === 'ar' ? 'متابعة أو فحوصات إضافية' : 'Follow-up or additional studies'}"></div>
    <div class="form-group"><label>${t('lab_result_flag')}</label>
      <select id="rad-flag"><option value="normal">${t('lab_flag_normal')}</option><option value="high">${lang === 'ar' ? 'غير طبيعي' : 'Abnormal'}</option><option value="critical">${t('lab_flag_critical')}</option></select></div>
    <div class="alert-buttons">
      <button class="btn btn-primary" id="rad-submit">${t('save_btn')}</button>
      <button class="btn btn-secondary" onclick="this.closest('.alert-overlay').remove()">${t('cancel_btn')}</button>
    </div></div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#rad-submit').addEventListener('click', async () => {
    const user = getCurrentUser();
    const indication = overlay.querySelector('#rad-indication').value.trim();
    const technique = overlay.querySelector('#rad-technique').value.trim();
    const comparison = overlay.querySelector('#rad-comparison').value.trim();
    const findingsDetail = overlay.querySelector('#rad-findings-detail').value.trim();
    const impression = overlay.querySelector('#rad-impression').value.trim();
    const recommendations = overlay.querySelector('#rad-recommendations').value.trim();
    const findings = [
      indication ? (lang === 'ar' ? 'المعلومات السريرية: ' : 'Indication: ') + indication : '',
      technique ? (lang === 'ar' ? 'التقنية: ' : 'Technique: ') + technique : '',
      comparison ? (lang === 'ar' ? 'مقارنة: ' : 'Comparison: ') + comparison : '',
      findingsDetail ? (lang === 'ar' ? 'النتائج: ' : 'Findings: ') + findingsDetail : '',
      impression ? (lang === 'ar' ? 'الانطباع: ' : 'Impression: ') + impression : '',
      recommendations ? (lang === 'ar' ? 'التوصيات: ' : 'Recommendations: ') + recommendations : '',
    ].filter(s => s).join('\n');
    const flag = overlay.querySelector('#rad-flag').value;

    dbRun('UPDATE lab_orders SET status = ?, resulted_by = ?, resulted_at = ?, result_value = ?, result_flag = ?, is_critical = ? WHERE order_id = ?',
      ['resulted', user.user_id, nowISO(), findings, flag, flag === 'critical' ? 1 : 0, orderId]);

    const patient = dbGet(`SELECT p.* FROM lab_orders lo JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id WHERE lo.order_id = ?`, [orderId]);
    await logAction('RADIOLOGY_RESULTED',
      `Radiologist ${user.full_name_en} reported results for ${order.test_name} for patient ${patient ? (patient.full_name_en || patient.full_name_ar) : ''}`,
      null, patient ? patient.patient_id : null, patient ? (patient.full_name_en || patient.full_name_ar) : '', patient ? patient.mrn : '');

    overlay.remove();
    showSuccess(t('lab_resulted_success'));
    saveDBToIndexedDB();
    navigateTo('rad-pending');
  });
}

function renderRadResults(main, lang) {
  const results = dbAll(`SELECT lo.*, p.full_name_ar, p.full_name_en, p.mrn, u.full_name_en as rad_en, u.full_name_ar as rad_ar
    FROM lab_orders lo JOIN admissions a ON lo.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN users u ON lo.resulted_by = u.user_id
    WHERE lo.category = 'radiology' AND lo.status = 'resulted' ORDER BY lo.resulted_at DESC LIMIT 50`);

  main.innerHTML = `
    <div class="page-header"><h1>${t('rad_results')}</h1></div>
    ${results.length === 0 ? `<div class="empty-state"><p>${t('no_data')}</p></div>` : `
    <div class="table-container"><table><thead><tr><th>${t('date')}</th><th>${t('patient_col')}</th><th>${t('lab_test_name')}</th><th>${t('rad_report')}</th><th>${t('lab_result_flag')}</th></tr></thead>
    <tbody>${results.map(l => {
      const flag = l.result_flag || 'normal';
      return `<tr class="lab-result-row">
        <td>${formatDateTime(l.resulted_at)}</td>
        <td>${lang === 'ar' ? escapeHtml(l.full_name_ar) : escapeHtml(l.full_name_en || l.full_name_ar)}</td>
        <td>${escapeHtml(l.test_name)}</td>
        <td style="max-width:300px">${escapeHtml(l.result_value || '—')}</td>
        <td><span class="flag-${flag}">${flag}</span></td>
      </tr>`;
    }).join('')}</tbody></table></div>`}
  `;
}

// ============================================================
// RECEPTIONIST VIEWS
// ============================================================

function renderRCPQueue(main, lang) {
  const visits = dbAll(`
    SELECT v.*, d.name_en as dept_en, d.name_ar as dept_ar
    FROM outpatient_visits v
    LEFT JOIN departments d ON v.dept_id = d.dept_id
    WHERE v.status IN ('waiting','in_progress')
    ORDER BY v.registered_at ASC
  `);

  const statusBadge = (s) => {
    const map = { waiting: 'badge-ordered', in_progress: 'badge-collected' };
    const label = { waiting: lang==='ar'?'بانتظار':'Waiting', in_progress: lang==='ar'?'قيد التقييم':'In Progress' };
    return `<span class="badge ${map[s]||''}">${label[s]||s}</span>`;
  };

  const rows = visits.map(v => `
    <tr>
      <td>${escapeHtml(lang==='ar'?v.patient_name_ar:v.patient_name_en)}</td>
      <td>${escapeHtml(v.national_id||'—')}</td>
      <td>${escapeHtml(lang==='ar'?(v.dept_ar||'—'):(v.dept_en||'—'))}</td>
      <td>${escapeHtml(v.chief_complaint||'—')}</td>
      <td>${escapeHtml(v.visit_type==='appointment'?(lang==='ar'?'موعد':'Appointment'):(lang==='ar'?'حضور مباشر':'Walk-in'))}</td>
      <td>${statusBadge(v.status)}</td>
      <td>${escapeHtml(v.registered_at.substring(0,16).replace('T',' '))}</td>
      <td>
        ${v.status==='waiting'?`<button class="btn btn-sm btn-primary" onclick="handleCheckIn(${v.visit_id})">${lang==='ar'?'استدعاء':'Call In'}</button>`:''}
        ${v.status==='in_progress'?`<button class="btn btn-sm btn-success" onclick="handleVisitDone(${v.visit_id})">${lang==='ar'?'إنهاء':'Done'}</button>`:''}
      </td>
    </tr>
  `).join('');

  main.innerHTML = `
    <div class="page-header">
      <h1>${lang==='ar'?'قائمة المرضى - العيادات الخارجية':'Outpatient Queue'}</h1>
      <button class="btn btn-primary" onclick="navigateTo('rcp-register')">${lang==='ar'?'+ تسجيل مريض':'+ Register Patient'}</button>
    </div>
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-number">${visits.filter(v=>v.status==='waiting').length}</div>
        <div class="stat-label">${lang==='ar'?'بانتظار':'Waiting'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${visits.filter(v=>v.status==='in_progress').length}</div>
        <div class="stat-label">${lang==='ar'?'قيد التقييم':'In Progress'}</div>
      </div>
    </div>
    ${visits.length===0?`<div class="empty-state"><div class="empty-icon">🎉</div><p>${lang==='ar'?'لا يوجد مرضى بانتظار حالياً':'No patients waiting'}</p></div>`:`
    <table class="data-table">
      <thead><tr>
        <th>${lang==='ar'?'اسم المريض':'Patient Name'}</th>
        <th>${lang==='ar'?'رقم الهوية':'National ID'}</th>
        <th>${lang==='ar'?'القسم':'Department'}</th>
        <th>${lang==='ar'?'الشكوى':'Complaint'}</th>
        <th>${lang==='ar'?'نوع الزيارة':'Visit Type'}</th>
        <th>${lang==='ar'?'الحالة':'Status'}</th>
        <th>${lang==='ar'?'وقت التسجيل':'Registered At'}</th>
        <th>${lang==='ar'?'إجراء':'Action'}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`}
  `;
}

function handleCheckIn(visitId) {
  dbRun(`UPDATE outpatient_visits SET status='in_progress' WHERE visit_id=?`, [visitId]);
  saveDBToIndexedDB();
  navigateTo('rcp-queue');
}

function handleVisitDone(visitId) {
  dbRun(`UPDATE outpatient_visits SET status='done' WHERE visit_id=?`, [visitId]);
  saveDBToIndexedDB();
  navigateTo('rcp-queue');
}

function renderRCPRegister(main, lang) {
  const depts = dbAll(`SELECT dept_id, name_ar, name_en FROM departments WHERE type='clinical' ORDER BY name_en`);
  const deptOpts = depts.map(d=>`<option value="${d.dept_id}">${escapeHtml(lang==='ar'?d.name_ar:d.name_en)}</option>`).join('');

  main.innerHTML = `
    <div class="page-header">
      <h1>${lang==='ar'?'تسجيل مريض جديد':'Register New Patient'}</h1>
      <button class="btn btn-secondary" onclick="navigateTo('rcp-queue')">${lang==='ar'?'رجوع':'Back'}</button>
    </div>
    <form onsubmit="handleRCPRegister(event)" class="form-card">
      <div class="form-row">
        <div class="form-group">
          <label>${lang==='ar'?'الاسم بالعربي *':'Name (Arabic) *'}</label>
          <input type="text" id="rcp-name-ar" required placeholder="${lang==='ar'?'الاسم الكامل':'Full name in Arabic'}">
        </div>
        <div class="form-group">
          <label>${lang==='ar'?'الاسم بالإنجليزي':'Name (English)'}</label>
          <input type="text" id="rcp-name-en" placeholder="Full name in English">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${lang==='ar'?'رقم الهوية':'National ID'}</label>
          <input type="text" id="rcp-nid" placeholder="1xxxxxxxxx" maxlength="10">
        </div>
        <div class="form-group">
          <label>${lang==='ar'?'رقم الجوال':'Phone'}</label>
          <input type="text" id="rcp-phone" placeholder="05xxxxxxxx">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${lang==='ar'?'تاريخ الميلاد':'Date of Birth'}</label>
          <input type="date" id="rcp-dob">
        </div>
        <div class="form-group">
          <label>${lang==='ar'?'الجنس':'Gender'}</label>
          <select id="rcp-gender">
            <option value="male">${lang==='ar'?'ذكر':'Male'}</option>
            <option value="female">${lang==='ar'?'أنثى':'Female'}</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${lang==='ar'?'القسم المطلوب':'Department'}</label>
          <select id="rcp-dept">
            <option value="">${lang==='ar'?'-- اختر القسم --':'-- Select Department --'}</option>
            ${deptOpts}
          </select>
        </div>
        <div class="form-group">
          <label>${lang==='ar'?'نوع الزيارة':'Visit Type'}</label>
          <select id="rcp-type">
            <option value="walk_in">${lang==='ar'?'حضور مباشر':'Walk-in'}</option>
            <option value="appointment">${lang==='ar'?'موعد مسبق':'Appointment'}</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${lang==='ar'?'طريقة الدفع':'Payment'}</label>
          <select id="rcp-payment" onchange="toggleInsurance()">
            <option value="insurance">${lang==='ar'?'تأمين':'Insurance'}</option>
            <option value="cash">${lang==='ar'?'نقدي':'Cash'}</option>
          </select>
        </div>
        <div class="form-group" id="rcp-ins-group">
          <label>${lang==='ar'?'شركة التأمين':'Insurance Company'}</label>
          <select id="rcp-insurance">
            <option value="BUPA">BUPA Arabia</option>
            <option value="Tawuniya">Tawuniya</option>
            <option value="MedGulf">MedGulf</option>
            <option value="AXA">AXA Cooperative</option>
            <option value="SAICO">SAICO</option>
            <option value="Other">${lang==='ar'?'أخرى':'Other'}</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>${lang==='ar'?'الشكوى الرئيسية *':'Chief Complaint *'}</label>
        <textarea id="rcp-complaint" rows="2" required placeholder="${lang==='ar'?'صف شكوى المريض...':'Describe the complaint...'}"></textarea>
      </div>
      <div class="form-group">
        <label>${lang==='ar'?'ملاحظات':'Notes'}</label>
        <textarea id="rcp-notes" rows="2"></textarea>
      </div>
      <button type="submit" class="btn btn-primary">${lang==='ar'?'تسجيل المريض':'Register Patient'}</button>
    </form>
  `;
}

function toggleInsurance() {
  const pay = document.getElementById('rcp-payment')?.value;
  const grp = document.getElementById('rcp-ins-group');
  if (grp) grp.style.display = pay === 'insurance' ? '' : 'none';
}

async function handleRCPRegister(e) {
  e.preventDefault();
  const lang = currentLanguage();
  const session = getCurrentSession();
  const nameAr = document.getElementById('rcp-name-ar').value.trim();
  const nameEn = document.getElementById('rcp-name-en').value.trim() || nameAr;
  const nid    = document.getElementById('rcp-nid').value.trim();
  const phone  = document.getElementById('rcp-phone').value.trim();
  const dob    = document.getElementById('rcp-dob').value;
  const gender = document.getElementById('rcp-gender').value;
  const deptId = document.getElementById('rcp-dept').value || null;
  const type   = document.getElementById('rcp-type').value;
  const payment= document.getElementById('rcp-payment').value;
  const insco  = payment==='insurance' ? document.getElementById('rcp-insurance').value : null;
  const complaint = document.getElementById('rcp-complaint').value.trim();
  const notes  = document.getElementById('rcp-notes').value.trim();

  dbRun(`INSERT INTO outpatient_visits
    (patient_name_ar, patient_name_en, national_id, phone, dob, gender, dept_id, registered_by, registered_at, chief_complaint, visit_type, payment_type, insurance_company, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'waiting',?)`,
    [nameAr, nameEn, nid||null, phone||null, dob||null, gender, deptId, session.user_id, nowISO(), complaint, type, payment, insco, notes||null]
  );
  await saveDBToIndexedDB();
  showSuccess(lang==='ar'?'تم تسجيل المريض بنجاح':'Patient registered successfully');
  navigateTo('rcp-queue');
}

function renderRCPDone(main, lang) {
  const visits = dbAll(`
    SELECT v.*, d.name_en as dept_en, d.name_ar as dept_ar
    FROM outpatient_visits v
    LEFT JOIN departments d ON v.dept_id = d.dept_id
    WHERE v.status = 'done'
    ORDER BY v.registered_at DESC
    LIMIT 50
  `);

  const rows = visits.map(v=>`
    <tr>
      <td>${escapeHtml(lang==='ar'?v.patient_name_ar:v.patient_name_en)}</td>
      <td>${escapeHtml(v.national_id||'—')}</td>
      <td>${escapeHtml(lang==='ar'?(v.dept_ar||'—'):(v.dept_en||'—'))}</td>
      <td>${escapeHtml(v.chief_complaint||'—')}</td>
      <td>${escapeHtml(v.registered_at.substring(0,16).replace('T',' '))}</td>
    </tr>
  `).join('');

  main.innerHTML = `
    <h1>${lang==='ar'?'الزيارات المكتملة':'Completed Visits'}</h1>
    ${visits.length===0?`<div class="empty-state"><div class="empty-icon">📋</div><p>${lang==='ar'?'لا توجد زيارات مكتملة':'No completed visits'}</p></div>`:`
    <table class="data-table">
      <thead><tr>
        <th>${lang==='ar'?'المريض':'Patient'}</th>
        <th>${lang==='ar'?'الهوية':'ID'}</th>
        <th>${lang==='ar'?'القسم':'Dept'}</th>
        <th>${lang==='ar'?'الشكوى':'Complaint'}</th>
        <th>${lang==='ar'?'الوقت':'Time'}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`}
  `;
}

// ============================================================
// DOCTOR — Discharge Summary
// ============================================================

function renderDocDischarge(main, lang) {
  const user = getCurrentUser();
  const activePatients = dbAll(`
    SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id,
           d.name_en as dept_en, d.name_ar as dept_ar
    FROM admissions a
    JOIN patients p ON a.patient_id = p.patient_id
    JOIN departments d ON a.dept_id = d.dept_id
    JOIN case_assignments ca ON ca.admission_id = a.admission_id
    WHERE a.status = 'active' AND ca.doctor_id = ?
    ORDER BY a.admitted_at DESC
  `, [user.user_id]);

  main.innerHTML = `
    <div class="page-header"><h1>${lang==='ar'?'ملخص التخريج':'Discharge Summary'}</h1></div>
    ${activePatients.length === 0 ? `<div class="empty-state"><p>${lang==='ar'?'لا يوجد مرضى منومون حالياً':'No admitted patients'}</p></div>` : `
    <div class="hint-box" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin-bottom:1rem">
      <strong>${lang==='ar'?'💡 تذكير:':'💡 Reminder:'}</strong>
      ${lang==='ar'?'ملخص التخريج وثيقة طبية رسمية. تأكد من اكتمال كل الحقول قبل تخريج المريض.':'The discharge summary is an official medical document. Ensure all fields are complete before discharging.'}
    </div>
    <div class="table-container"><table>
      <thead><tr>
        <th>${lang==='ar'?'السرير':'Bed'}</th>
        <th>${lang==='ar'?'المريض':'Patient'}</th>
        <th>MRN</th>
        <th>${lang==='ar'?'القسم':'Dept'}</th>
        <th>${lang==='ar'?'التشخيص':'Diagnosis'}</th>
        <th>${lang==='ar'?'مدة التنويم':'LOS'}</th>
        <th>${lang==='ar'?'إجراء':'Action'}</th>
      </tr></thead>
      <tbody>${activePatients.map(p => {
        const los = Math.floor((Date.now() - new Date(p.admitted_at).getTime()) / 86400000);
        return `<tr>
          <td>${escapeHtml(p.bed_number||'—')}</td>
          <td><strong>${escapeHtml(lang==='ar'?p.full_name_ar:p.full_name_en)}</strong></td>
          <td>${escapeHtml(p.mrn)}</td>
          <td>${escapeHtml(lang==='ar'?p.dept_ar:p.dept_en)}</td>
          <td>${escapeHtml((p.initial_diagnosis||'—').substring(0,50))}${(p.initial_diagnosis||'').length>50?'…':''}</td>
          <td>${los} ${lang==='ar'?'يوم':'days'}</td>
          <td><button class="btn btn-sm btn-primary" onclick="showDischargeSummaryForm(${p.admission_id})">${lang==='ar'?'كتابة ملخص':'Write Summary'}</button></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>`}
  `;
}

function showDischargeSummaryForm(admissionId) {
  const lang = currentLanguage();
  const admission = dbGet(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id,
    d.name_en as dept_en, d.name_ar as dept_ar
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id
    JOIN departments d ON a.dept_id = d.dept_id WHERE a.admission_id = ?`, [admissionId]);
  if (!admission) return;

  const rxs = dbAll(`SELECT drug_name, dose, frequency, route FROM prescriptions WHERE admission_id = ? AND status = 'active'`, [admissionId]);
  const rxList = rxs.map(r => `${r.drug_name} ${r.dose} ${r.route} ${r.frequency}`).join('\n');

  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  overlay.innerHTML = `<div class="alert-modal" style="max-width:700px;max-height:90vh;overflow-y:auto">
    <h2>${lang==='ar'?'ملخص التخريج':'Discharge Summary'}</h2>
    <p class="text-muted mb-2">${lang==='ar'?escapeHtml(admission.full_name_ar):escapeHtml(admission.full_name_en)} — ${admission.mrn} — ${lang==='ar'?escapeHtml(admission.dept_ar):escapeHtml(admission.dept_en)}</p>

    <div class="form-group"><label>${lang==='ar'?'تشخيص التخريج *':'Discharge Diagnosis *'}</label>
      <textarea id="dc-diagnosis" rows="2" required placeholder="${lang==='ar'?'التشخيص النهائي عند التخريج':'Final diagnosis at discharge'}">${escapeHtml(admission.initial_diagnosis||'')}</textarea></div>

    <div class="form-group"><label>${lang==='ar'?'ملخص الإقامة':'Hospital Course Summary'}</label>
      <textarea id="dc-course" rows="3" placeholder="${lang==='ar'?'ملخص ما تم خلال فترة التنويم (الفحوصات، العلاج، الاستجابة)':'Summary of hospital stay (investigations, treatment, response)'}">${escapeHtml(admission.chief_complaint||'')}</textarea></div>

    <div class="form-group"><label>${lang==='ar'?'حالة المريض عند التخريج':'Condition at Discharge'}</label>
      <select id="dc-condition">
        <option value="improved">${lang==='ar'?'تحسن':'Improved'}</option>
        <option value="stable">${lang==='ar'?'مستقر':'Stable'}</option>
        <option value="unchanged">${lang==='ar'?'بدون تغيير':'Unchanged'}</option>
        <option value="ama">${lang==='ar'?'خروج ضد النصيحة الطبية':'Against Medical Advice (AMA)'}</option>
      </select></div>

    <div class="form-group"><label>${lang==='ar'?'أدوية التخريج':'Discharge Medications'}</label>
      <textarea id="dc-medications" rows="3" placeholder="${lang==='ar'?'اسم الدواء - الجرعة - الطريقة - التكرار - المدة':'Drug - Dose - Route - Frequency - Duration'}">${escapeHtml(rxList)}</textarea></div>

    <div class="form-group"><label>${lang==='ar'?'النظام الغذائي':'Diet Instructions'}</label>
      <input type="text" id="dc-diet" placeholder="${lang==='ar'?'مثال: نظام غذائي منخفض الملح':'e.g. Low salt diet'}"></div>

    <div class="form-group"><label>${lang==='ar'?'محددات النشاط':'Activity Restrictions'}</label>
      <input type="text" id="dc-activity" placeholder="${lang==='ar'?'مثال: راحة تامة أسبوعين، تجنب رفع الأثقال':'e.g. Bed rest 2 weeks, avoid heavy lifting'}"></div>

    <div class="form-group"><label>${lang==='ar'?'تعليمات المتابعة':'Follow-up Instructions'}</label>
      <textarea id="dc-followup" rows="2" placeholder="${lang==='ar'?'مثال: مراجعة العيادة بعد أسبوع. إعادة تحليل CBC بعد 3 أيام.':'e.g. Clinic follow-up in 1 week. Repeat CBC in 3 days.'}">${escapeHtml(admission.disposition_plan||'')}</textarea></div>

    <div class="form-group"><label>${lang==='ar'?'أسباب العودة للطوارئ':'Return Precautions'}</label>
      <textarea id="dc-return" rows="2" placeholder="${lang==='ar'?'ارجع فوراً إذا: حمى عالية، ألم شديد، ضيق تنفس، نزيف':'Return immediately if: high fever, severe pain, shortness of breath, bleeding'}"></textarea></div>

    <div class="alert-buttons">
      <button class="btn btn-primary" id="dc-submit">${lang==='ar'?'تخريج المريض':'Discharge Patient'}</button>
      <button class="btn btn-secondary no-print" onclick="window.print()">&#128438; ${lang==='ar'?'طباعة':'Print'}</button>
      <button class="btn btn-secondary" onclick="this.closest('.alert-overlay').remove()">${t('cancel_btn')}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#dc-submit').addEventListener('click', async () => {
    const diagnosis = overlay.querySelector('#dc-diagnosis').value.trim();
    if (!diagnosis) { showError(lang==='ar'?'التشخيص مطلوب':'Diagnosis is required'); return; }

    const user = getCurrentUser();
    const summary = [
      (lang==='ar'?'تشخيص التخريج: ':'Discharge Dx: ') + diagnosis,
      (lang==='ar'?'ملخص الإقامة: ':'Course: ') + (overlay.querySelector('#dc-course').value.trim()||'—'),
      (lang==='ar'?'الحالة عند التخريج: ':'Condition: ') + overlay.querySelector('#dc-condition').value,
      (lang==='ar'?'أدوية التخريج: ':'Medications: ') + (overlay.querySelector('#dc-medications').value.trim()||'None'),
      (lang==='ar'?'النظام الغذائي: ':'Diet: ') + (overlay.querySelector('#dc-diet').value.trim()||'Regular'),
      (lang==='ar'?'محددات النشاط: ':'Activity: ') + (overlay.querySelector('#dc-activity').value.trim()||'As tolerated'),
      (lang==='ar'?'تعليمات المتابعة: ':'Follow-up: ') + (overlay.querySelector('#dc-followup').value.trim()||'—'),
      (lang==='ar'?'أسباب العودة: ':'Return if: ') + (overlay.querySelector('#dc-return').value.trim()||'—'),
    ].join('\n');

    // Auto-close any remaining active orders
    const activeRx    = dbGet(`SELECT COUNT(*) as c FROM prescriptions WHERE admission_id = ? AND status = 'active'`, [admissionId]).c;
    const pendingLabs = dbGet(`SELECT COUNT(*) as c FROM lab_orders   WHERE admission_id = ? AND status IN ('ordered','collected','received')`, [admissionId]).c;
    if (activeRx > 0)    dbRun(`UPDATE prescriptions SET status = 'discontinued' WHERE admission_id = ? AND status = 'active'`, [admissionId]);
    if (pendingLabs > 0) dbRun(`UPDATE lab_orders SET status = 'cancelled' WHERE admission_id = ? AND status IN ('ordered','collected','received')`, [admissionId]);

    dbRun(`UPDATE admissions SET status='discharged', discharged_at=?, disposition_plan=?, initial_diagnosis=? WHERE admission_id=?`,
      [nowISO(), summary, diagnosis, admissionId]);

    await logAction('PATIENT_DISCHARGED',
      `Dr. ${user.full_name_en} discharged patient ${admission.full_name_en||admission.full_name_ar} (${admission.mrn}). Dx: ${diagnosis}. Auto-closed ${activeRx} Rx, ${pendingLabs} labs`,
      null, admission.patient_id, admission.full_name_en||admission.full_name_ar, admission.mrn);

    overlay.remove();
    showSuccess(lang==='ar'?'تم تخريج المريض بنجاح':'Patient discharged successfully');
    await saveDBToIndexedDB();
    setTimeout(() => navigateTo('doc-discharge'), 500);
  });
}

// ============================================================
// BED MANAGEMENT (Senior Nurse + Hospital Manager)
// ============================================================

function renderBedManagement(main, lang) {
  const beds = dbAll(`
    SELECT a.bed_number, a.dept_id, a.status, a.complexity_score, a.initial_diagnosis,
           p.full_name_ar, p.full_name_en, p.mrn,
           d.name_en as dept_en, d.name_ar as dept_ar,
           a.admitted_at, a.admission_id
    FROM admissions a
    JOIN patients p ON a.patient_id = p.patient_id
    JOIN departments d ON a.dept_id = d.dept_id
    WHERE a.status = 'active'
    ORDER BY d.dept_id, a.bed_number
  `);

  const total = beds.length;
  const byDept = {};
  beds.forEach(b => {
    const key = lang === 'ar' ? b.dept_ar : b.dept_en;
    if (!byDept[key]) byDept[key] = [];
    byDept[key].push(b);
  });

  const deptSections = Object.entries(byDept).map(([dept, patients]) => `
    <div class="card mb-2">
      <div class="card-header"><strong>${escapeHtml(dept)}</strong> <span class="badge badge-info">${patients.length} ${lang==='ar'?'مريض':'patients'}</span></div>
      <div class="bed-grid">
        ${patients.map(b => `
          <div class="bed-card occupied">
            <div class="bed-label">${escapeHtml(b.bed_number||'?')}</div>
            <div class="bed-patient">${escapeHtml(lang==='ar'?b.full_name_ar:b.full_name_en)}</div>
            <div class="bed-mrn">MRN: ${escapeHtml(b.mrn)}</div>
            <div class="bed-dx" title="${escapeHtml(b.initial_diagnosis||'')}">${escapeHtml((b.initial_diagnosis||'—').substring(0,40))}${(b.initial_diagnosis||'').length>40?'…':''}</div>
            <div class="bed-days">${Math.floor((Date.now()-new Date(b.admitted_at).getTime())/86400000)}d</div>
            <button class="btn btn-sm btn-danger mt-1" onclick="handleBedDischarge(${b.admission_id})">${lang==='ar'?'تخريج':'Discharge'}</button>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  main.innerHTML = `
    <div class="page-header">
      <h1>${t('sn_beds')}</h1>
    </div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">${lang==='ar'?'أسرة مشغولة':'Occupied Beds'}</div></div>
    </div>
    ${total === 0 ? `<div class="empty-state"><p>${t('no_data')}</p></div>` : deptSections}
  `;
}

function renderBedMap(main, lang) {
  renderBedManagement(main, lang);
}

async function handleBedDischarge(admissionId) {
  const lang = currentLanguage();
  showConfirm(lang==='ar'?'هل تريد تخريج هذا المريض؟':'Discharge this patient?', async () => {
    const user = getCurrentUser();
    const admission = dbGet('SELECT a.*, p.full_name_en, p.full_name_ar, p.mrn, p.patient_id FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.admission_id = ?', [admissionId]);
    dbRun(`UPDATE admissions SET status='discharged', discharged_at=? WHERE admission_id=?`, [nowISO(), admissionId]);
    if (admission) {
      await logAction('PATIENT_DISCHARGED',
        `${user.full_name_en} discharged patient ${admission.full_name_en||admission.full_name_ar} from bed ${admission.bed_number}`,
        null, admission.patient_id, admission.full_name_en||admission.full_name_ar, admission.mrn);
    }
    showSuccess(lang==='ar'?'تم تخريج المريض':'Patient discharged');
    saveDBToIndexedDB();
    navigateTo(currentView);
  });
}

// ============================================================
// APPOINTMENTS (Receptionist + Doctor)
// ============================================================

function renderRCPAppointments(main, lang) {
  const today = new Date().toISOString().substring(0,10);
  const appts = dbAll(`
    SELECT a.*, d.name_en as dept_en, d.name_ar as dept_ar,
           u.full_name_en as doc_en, u.full_name_ar as doc_ar
    FROM appointments a
    LEFT JOIN departments d ON a.dept_id = d.dept_id
    LEFT JOIN users u ON a.doctor_id = u.user_id
    WHERE a.appt_date >= ? AND a.status != 'cancelled'
    ORDER BY a.appt_date, a.appt_time
  `, [today]);

  const statusBadge = s => {
    const map = { scheduled:'badge-ordered', done:'badge-success', cancelled:'badge-danger', 'no-show':'badge-resulted' };
    const lbl = { scheduled: lang==='ar'?'مجدول':'Scheduled', done: lang==='ar'?'تم':'Done', cancelled: lang==='ar'?'ملغي':'Cancelled', 'no-show': lang==='ar'?'لم يحضر':'No Show' };
    return `<span class="badge ${map[s]||''}">${lbl[s]||s}</span>`;
  };

  main.innerHTML = `
    <div class="page-header">
      <h1>${t('rcp_appointments')}</h1>
      <button class="btn btn-primary" onclick="showApptForm()">${lang==='ar'?'+ موعد جديد':'+ New Appointment'}</button>
    </div>
    <div id="appt-form-container"></div>
    ${appts.length === 0 ? `<div class="empty-state"><p>${lang==='ar'?'لا توجد مواعيد قادمة':'No upcoming appointments'}</p></div>` : `
    <div class="table-container"><table>
      <thead><tr>
        <th>${lang==='ar'?'التاريخ':'Date'}</th>
        <th>${lang==='ar'?'الوقت':'Time'}</th>
        <th>${lang==='ar'?'المريض':'Patient'}</th>
        <th>${lang==='ar'?'القسم':'Dept'}</th>
        <th>${lang==='ar'?'الطبيب':'Doctor'}</th>
        <th>${lang==='ar'?'السبب':'Reason'}</th>
        <th>${lang==='ar'?'الحالة':'Status'}</th>
        <th>${lang==='ar'?'إجراء':'Action'}</th>
      </tr></thead>
      <tbody>${appts.map(a => `<tr>
        <td>${escapeHtml(a.appt_date)}</td>
        <td>${escapeHtml(a.appt_time)}</td>
        <td>
          <strong>${escapeHtml(lang==='ar'?a.patient_name_ar:a.patient_name_en)}</strong>
          ${a.national_id?`<br><small>${escapeHtml(a.national_id)}</small>`:''}
        </td>
        <td>${escapeHtml(lang==='ar'?(a.dept_ar||'—'):(a.dept_en||'—'))}</td>
        <td>${escapeHtml(lang==='ar'?(a.doc_ar||'—'):(a.doc_en||'—'))}</td>
        <td>${escapeHtml(a.reason||'—')}</td>
        <td>${statusBadge(a.status)}</td>
        <td>
          ${a.status==='scheduled'?`
            <button class="btn btn-sm btn-success" onclick="handleApptDone(${a.appt_id})">${lang==='ar'?'تم':'Done'}</button>
            <button class="btn btn-sm btn-danger" onclick="handleApptCancel(${a.appt_id})">${lang==='ar'?'إلغاء':'Cancel'}</button>
          `:'—'}
        </td>
      </tr>`).join('')}
      </tbody>
    </table></div>`}
  `;
}

function showApptForm() {
  const lang = currentLanguage();
  const depts = dbAll(`SELECT dept_id, name_ar, name_en FROM departments WHERE type='clinical' ORDER BY name_en`);
  const doctors = dbAll(`SELECT user_id, full_name_ar, full_name_en FROM users WHERE role IN ('doctor','consultant') AND is_active=1 ORDER BY full_name_en`);
  const today = new Date().toISOString().substring(0,10);

  const deptOpts = `<option value="">${lang==='ar'?'-- اختر القسم --':'-- Select Dept --'}</option>` +
    depts.map(d=>`<option value="${d.dept_id}">${escapeHtml(lang==='ar'?d.name_ar:d.name_en)}</option>`).join('');
  const docOpts = `<option value="">${lang==='ar'?'-- اختياري --':'-- Optional --'}</option>` +
    doctors.map(d=>`<option value="${d.user_id}">${escapeHtml(lang==='ar'?d.full_name_ar:d.full_name_en)}</option>`).join('');

  document.getElementById('appt-form-container').innerHTML = `
    <div class="card mb-3">
      <div class="card-header"><h3>${lang==='ar'?'موعد جديد':'New Appointment'}</h3></div>
      <form onsubmit="handleAddAppt(event)">
        <div class="form-row">
          <div class="form-group"><label>${lang==='ar'?'الاسم (عربي) *':'Name (Arabic) *'}</label><input type="text" id="appt-name-ar" required></div>
          <div class="form-group"><label>${lang==='ar'?'الاسم (إنجليزي)':'Name (English)'}</label><input type="text" id="appt-name-en"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${lang==='ar'?'رقم الهوية':'National ID'}</label><input type="text" id="appt-nid" maxlength="10"></div>
          <div class="form-group"><label>${lang==='ar'?'الجوال':'Phone'}</label><input type="text" id="appt-phone"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${lang==='ar'?'القسم *':'Department *'}</label><select id="appt-dept" required>${deptOpts}</select></div>
          <div class="form-group"><label>${lang==='ar'?'الطبيب':'Doctor'}</label><select id="appt-doctor">${docOpts}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${lang==='ar'?'التاريخ *':'Date *'}</label><input type="date" id="appt-date" required min="${today}"></div>
          <div class="form-group"><label>${lang==='ar'?'الوقت *':'Time *'}</label><input type="time" id="appt-time" required></div>
        </div>
        <div class="form-group"><label>${lang==='ar'?'السبب':'Reason'}</label><input type="text" id="appt-reason"></div>
        <div class="flex gap-1">
          <button type="submit" class="btn btn-primary">${t('save_btn')}</button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('appt-form-container').innerHTML=''">${t('cancel_btn')}</button>
        </div>
      </form>
    </div>
  `;
}

async function handleAddAppt(e) {
  e.preventDefault();
  const session = getCurrentSession();
  const user = getCurrentUser();
  const nameAr = document.getElementById('appt-name-ar').value.trim();
  const nameEn = document.getElementById('appt-name-en').value.trim() || nameAr;
  dbRun(`INSERT INTO appointments (patient_name_ar, patient_name_en, national_id, phone, dept_id, doctor_id, appt_date, appt_time, reason, created_by, created_at, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'scheduled')`,
    [nameAr, nameEn,
     document.getElementById('appt-nid').value.trim()||null,
     document.getElementById('appt-phone').value.trim()||null,
     document.getElementById('appt-dept').value,
     document.getElementById('appt-doctor').value||null,
     document.getElementById('appt-date').value,
     document.getElementById('appt-time').value,
     document.getElementById('appt-reason').value.trim()||null,
     session.user_id, nowISO()]);
  await logAction('APPOINTMENT_CREATED', `${user.full_name_en} scheduled appointment for ${nameEn} on ${document.getElementById('appt-date').value}`);
  await saveDBToIndexedDB();
  showSuccess(currentLanguage()==='ar'?'تم إنشاء الموعد':'Appointment created');
  navigateTo('rcp-appointments');
}

function handleApptDone(apptId) {
  dbRun(`UPDATE appointments SET status='done' WHERE appt_id=?`, [apptId]);
  saveDBToIndexedDB();
  navigateTo('rcp-appointments');
}

function handleApptCancel(apptId) {
  const lang = currentLanguage();
  showConfirm(lang==='ar'?'إلغاء هذا الموعد؟':'Cancel this appointment?', () => {
    dbRun(`UPDATE appointments SET status='cancelled' WHERE appt_id=?`, [apptId]);
    saveDBToIndexedDB();
    navigateTo('rcp-appointments');
  });
}

function renderDocAppointments(main, lang) {
  const user = getCurrentUser();
  const today = new Date().toISOString().substring(0,10);
  const appts = dbAll(`
    SELECT a.*, d.name_en as dept_en, d.name_ar as dept_ar
    FROM appointments a
    LEFT JOIN departments d ON a.dept_id = d.dept_id
    WHERE a.doctor_id = ? AND a.appt_date >= ? AND a.status != 'cancelled'
    ORDER BY a.appt_date, a.appt_time
  `, [user.user_id, today]);

  main.innerHTML = `
    <div class="page-header"><h1>${t('doc_appointments')}</h1></div>
    ${appts.length === 0 ? `<div class="empty-state"><p>${lang==='ar'?'لا توجد مواعيد قادمة':'No upcoming appointments'}</p></div>` : `
    <div class="table-container"><table>
      <thead><tr>
        <th>${lang==='ar'?'التاريخ':'Date'}</th>
        <th>${lang==='ar'?'الوقت':'Time'}</th>
        <th>${lang==='ar'?'المريض':'Patient'}</th>
        <th>${lang==='ar'?'السبب':'Reason'}</th>
        <th>${lang==='ar'?'الحالة':'Status'}</th>
      </tr></thead>
      <tbody>${appts.map(a=>`<tr>
        <td>${escapeHtml(a.appt_date)}</td>
        <td>${escapeHtml(a.appt_time)}</td>
        <td><strong>${escapeHtml(lang==='ar'?a.patient_name_ar:a.patient_name_en)}</strong>${a.national_id?`<br><small>${escapeHtml(a.national_id)}</small>`:''}</td>
        <td>${escapeHtml(a.reason||'—')}</td>
        <td><span class="badge ${a.status==='scheduled'?'badge-ordered':'badge-success'}">${a.status==='scheduled'?(lang==='ar'?'مجدول':'Scheduled'):(lang==='ar'?'تم':'Done')}</span></td>
      </tr>`).join('')}
      </tbody>
    </table></div>`}
  `;
}

// ============================================================
// BILLING (Receptionist)
// ============================================================

function renderRCPBilling(main, lang) {
  const invoices = dbAll(`
    SELECT i.*, d.name_en as dept_en, d.name_ar as dept_ar
    FROM invoices i
    LEFT JOIN departments d ON i.dept_id = d.dept_id
    ORDER BY i.created_at DESC LIMIT 100
  `);

  const statusBadge = s => s === 'paid'
    ? `<span class="badge badge-success">${lang==='ar'?'مدفوع':'Paid'}</span>`
    : `<span class="badge badge-danger">${lang==='ar'?'غير مدفوع':'Unpaid'}</span>`;

  main.innerHTML = `
    <div class="page-header">
      <h1>${t('rcp_billing')}</h1>
      <button class="btn btn-primary" onclick="showBillingForm()">${lang==='ar'?'+ فاتورة جديدة':'+ New Invoice'}</button>
    </div>
    <div id="billing-form-container"></div>
    ${invoices.length === 0 ? `<div class="empty-state"><p>${lang==='ar'?'لا توجد فواتير':'No invoices yet'}</p></div>` : `
    <div class="table-container"><table>
      <thead><tr>
        <th>#</th>
        <th>${lang==='ar'?'المريض':'Patient'}</th>
        <th>${lang==='ar'?'القسم':'Dept'}</th>
        <th>${lang==='ar'?'التاريخ':'Date'}</th>
        <th>${lang==='ar'?'الإجمالي':'Total'}</th>
        <th>${lang==='ar'?'طريقة الدفع':'Payment'}</th>
        <th>${lang==='ar'?'الحالة':'Status'}</th>
        <th>${lang==='ar'?'إجراء':'Action'}</th>
      </tr></thead>
      <tbody>${invoices.map(inv=>`<tr>
        <td>${inv.invoice_id}</td>
        <td><strong>${escapeHtml(lang==='ar'?inv.patient_name_ar:inv.patient_name_en)}</strong>${inv.national_id?`<br><small>${escapeHtml(inv.national_id)}</small>`:''}</td>
        <td>${escapeHtml(lang==='ar'?(inv.dept_ar||'—'):(inv.dept_en||'—'))}</td>
        <td>${escapeHtml(inv.visit_date)}</td>
        <td><strong>${inv.total.toFixed(2)} ${lang==='ar'?'ر.س':'SAR'}</strong></td>
        <td>${escapeHtml(inv.insurance_company||inv.payment_type)}</td>
        <td>${statusBadge(inv.status)}</td>
        <td>${inv.status==='unpaid'?`<button class="btn btn-sm btn-success" onclick="handleMarkPaid(${inv.invoice_id})">${lang==='ar'?'تحصيل':'Collect'}</button>`:'—'}</td>
      </tr>`).join('')}
      </tbody>
    </table></div>`}
  `;
}

function showBillingForm() {
  const lang = currentLanguage();
  const depts = dbAll(`SELECT dept_id, name_ar, name_en FROM departments WHERE type='clinical' ORDER BY name_en`);
  const today = new Date().toISOString().substring(0,10);

  const deptOpts = `<option value="">${lang==='ar'?'-- اختر --':'-- Select --'}</option>` +
    depts.map(d=>`<option value="${d.dept_id}">${escapeHtml(lang==='ar'?d.name_ar:d.name_en)}</option>`).join('');

  document.getElementById('billing-form-container').innerHTML = `
    <div class="card mb-3">
      <div class="card-header"><h3>${lang==='ar'?'فاتورة جديدة':'New Invoice'}</h3></div>
      <form onsubmit="handleCreateInvoice(event)">
        <div class="form-row">
          <div class="form-group"><label>${lang==='ar'?'الاسم (عربي) *':'Name (Arabic) *'}</label><input type="text" id="bill-name-ar" required></div>
          <div class="form-group"><label>${lang==='ar'?'الاسم (إنجليزي)':'Name (English)'}</label><input type="text" id="bill-name-en"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${lang==='ar'?'رقم الهوية':'National ID'}</label><input type="text" id="bill-nid" maxlength="10"></div>
          <div class="form-group"><label>${lang==='ar'?'القسم':'Department'}</label><select id="bill-dept">${deptOpts}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${lang==='ar'?'التاريخ *':'Date *'}</label><input type="date" id="bill-date" required value="${today}"></div>
          <div class="form-group">
            <label>${lang==='ar'?'طريقة الدفع':'Payment Type'}</label>
            <select id="bill-payment" onchange="toggleBillInsurance()">
              <option value="insurance">${lang==='ar'?'تأمين':'Insurance'}</option>
              <option value="cash">${lang==='ar'?'نقدي':'Cash'}</option>
            </select>
          </div>
        </div>
        <div class="form-group" id="bill-ins-group">
          <label>${lang==='ar'?'شركة التأمين':'Insurance Company'}</label>
          <select id="bill-insurance">
            <option value="BUPA">BUPA Arabia</option>
            <option value="Tawuniya">Tawuniya</option>
            <option value="MedGulf">MedGulf</option>
            <option value="AXA">AXA Cooperative</option>
            <option value="SAICO">SAICO</option>
            <option value="Other">${lang==='ar'?'أخرى':'Other'}</option>
          </select>
        </div>
        <hr>
        <h4>${lang==='ar'?'البنود':'Line Items'}</h4>
        <div id="bill-items">
          <div class="form-row bill-item-row">
            <div class="form-group" style="flex:3"><label>${lang==='ar'?'الخدمة (عربي)':'Service (Arabic)'}</label><input type="text" class="item-ar" required></div>
            <div class="form-group" style="flex:3"><label>${lang==='ar'?'الخدمة (إنجليزي)':'Service (English)'}</label><input type="text" class="item-en" required></div>
            <div class="form-group" style="flex:1"><label>${lang==='ar'?'الكمية':'Qty'}</label><input type="number" class="item-qty" value="1" min="1"></div>
            <div class="form-group" style="flex:2"><label>${lang==='ar'?'السعر':'Price (SAR)'}</label><input type="number" class="item-price" step="0.01" min="0" oninput="updateBillTotal()"></div>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-secondary mb-2" onclick="addBillItem()">${lang==='ar'?'+ إضافة بند':'+ Add Item'}</button>
        <div class="form-group"><strong>${lang==='ar'?'الإجمالي:':'Total:'} <span id="bill-total">0.00</span> ${lang==='ar'?'ر.س':'SAR'}</strong></div>
        <div class="flex gap-1">
          <button type="submit" class="btn btn-primary">${lang==='ar'?'إنشاء الفاتورة':'Create Invoice'}</button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('billing-form-container').innerHTML=''">${t('cancel_btn')}</button>
        </div>
      </form>
    </div>
  `;
}

function toggleBillInsurance() {
  const val = document.getElementById('bill-payment').value;
  document.getElementById('bill-ins-group').style.display = val === 'insurance' ? '' : 'none';
}

function addBillItem() {
  const lang = currentLanguage();
  const container = document.getElementById('bill-items');
  const row = document.createElement('div');
  row.className = 'form-row bill-item-row';
  row.innerHTML = `
    <div class="form-group" style="flex:3"><input type="text" class="item-ar" placeholder="${lang==='ar'?'الخدمة (عربي)':'Service (Arabic)'}" required></div>
    <div class="form-group" style="flex:3"><input type="text" class="item-en" placeholder="${lang==='ar'?'الخدمة (إنجليزي)':'Service (English)'}" required></div>
    <div class="form-group" style="flex:1"><input type="number" class="item-qty" value="1" min="1"></div>
    <div class="form-group" style="flex:2"><input type="number" class="item-price" step="0.01" min="0" oninput="updateBillTotal()"></div>
    <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.bill-item-row').remove(); updateBillTotal()">✕</button>
  `;
  container.appendChild(row);
}

function updateBillTotal() {
  let total = 0;
  document.querySelectorAll('.bill-item-row').forEach(row => {
    const qty = parseFloat(row.querySelector('.item-qty')?.value || 1);
    const price = parseFloat(row.querySelector('.item-price')?.value || 0);
    total += qty * price;
  });
  const el = document.getElementById('bill-total');
  if (el) el.textContent = total.toFixed(2);
}

async function handleCreateInvoice(e) {
  e.preventDefault();
  const session = getCurrentSession();
  const user = getCurrentUser();
  const lang = currentLanguage();

  const nameAr = document.getElementById('bill-name-ar').value.trim();
  const nameEn = document.getElementById('bill-name-en').value.trim() || nameAr;
  const nid    = document.getElementById('bill-nid').value.trim() || null;
  const deptId = document.getElementById('bill-dept').value || null;
  const date   = document.getElementById('bill-date').value;
  const payment= document.getElementById('bill-payment').value;
  const insco  = payment === 'insurance' ? document.getElementById('bill-insurance').value : null;

  const rows = document.querySelectorAll('.bill-item-row');
  const items = [];
  let total = 0;
  rows.forEach(row => {
    const ar    = row.querySelector('.item-ar')?.value.trim();
    const en    = row.querySelector('.item-en')?.value.trim();
    const qty   = parseInt(row.querySelector('.item-qty')?.value || 1);
    const price = parseFloat(row.querySelector('.item-price')?.value || 0);
    if (ar && price >= 0) {
      items.push({ ar, en: en||ar, qty, price, lineTotal: qty * price });
      total += qty * price;
    }
  });

  if (items.length === 0) { showError(lang==='ar'?'أضف بنداً واحداً على الأقل':'Add at least one item'); return; }

  dbRun(`INSERT INTO invoices (patient_name_ar, patient_name_en, national_id, dept_id, visit_date, subtotal, total, payment_type, insurance_company, status, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,'unpaid',?,?)`,
    [nameAr, nameEn, nid, deptId, date, total, total, payment, insco, session.user_id, nowISO()]);
  const invoiceId = dbLastId();

  for (const item of items) {
    dbRun(`INSERT INTO invoice_items (invoice_id, description_en, description_ar, qty, unit_price, total_price) VALUES (?,?,?,?,?,?)`,
      [invoiceId, item.en, item.ar, item.qty, item.price, item.lineTotal]);
  }

  await logAction('INVOICE_CREATED',
    `${user.full_name_en} created invoice #${invoiceId} for ${nameEn} — Total: ${total.toFixed(2)} SAR`,
    null, null, nameEn, nid || '');
  await saveDBToIndexedDB();
  showSuccess(lang==='ar'?'تم إنشاء الفاتورة':'Invoice created');
  navigateTo('rcp-billing');
}

async function handleMarkPaid(invoiceId) {
  const lang = currentLanguage();
  showConfirm(lang==='ar'?'تأكيد تحصيل الفاتورة؟':'Confirm payment collection?', async () => {
    const user = getCurrentUser();
    const inv = dbGet('SELECT * FROM invoices WHERE invoice_id=?', [invoiceId]);
    dbRun(`UPDATE invoices SET status='paid' WHERE invoice_id=?`, [invoiceId]);
    if (inv) {
      await logAction('INVOICE_PAID',
        `${user.full_name_en} collected payment for invoice #${invoiceId} — ${inv.patient_name_en}, ${inv.total.toFixed(2)} SAR`);
    }
    await saveDBToIndexedDB();
    showSuccess(lang==='ar'?'تم تسجيل الدفع':'Payment recorded');
    navigateTo('rcp-billing');
  });
}

// ============================================================
// SURGICAL SCHEDULING / OR MANAGEMENT
// ============================================================

function renderSurgicalSchedule(main, lang, readOnly) {
  const today = new Date().toISOString().slice(0,10);
  const cases = dbAll(`SELECT sc.*, p.full_name_ar, p.full_name_en, p.mrn,
    u.full_name_ar as surgeon_ar, u.full_name_en as surgeon_en
    FROM surgical_cases sc
    JOIN patients p ON sc.patient_id = p.patient_id
    JOIN users u ON sc.surgeon_id = u.user_id
    ORDER BY sc.scheduled_date DESC, sc.scheduled_time`);

  const todayCases = cases.filter(c => c.scheduled_date === today);
  const scheduled = cases.filter(c => c.status === 'scheduled');
  const inProg = cases.filter(c => c.status === 'in_progress');
  const completed = cases.filter(c => c.status === 'completed');

  const statusBadge = (s) => {
    const map = { scheduled:'badge-info', pre_op:'badge-warning', in_progress:'badge-danger', completed:'badge-success', cancelled:'badge-neutral' };
    const label = t('surg_'+s);
    return `<span class="badge ${map[s]||'badge-neutral'}">${label}</span>`;
  };

  main.innerHTML = `
    <div class="page-header">
      <h1>${readOnly ? t('or_calendar') : t('surgical_schedule')}</h1>
      ${!readOnly ? `<button class="btn btn-primary" onclick="showSurgicalForm()">&#10133; ${t('book_surgery')}</button>` : ''}
    </div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">${todayCases.length}</div><div class="stat-label">${t('surgeries_today')}</div></div>
      <div class="stat-card"><div class="stat-value">${scheduled.length}</div><div class="stat-label">${t('total_scheduled')}</div></div>
      <div class="stat-card"><div class="stat-value">${inProg.length}</div><div class="stat-label">${t('total_in_progress')}</div></div>
      <div class="stat-card"><div class="stat-value">${completed.length}</div><div class="stat-label">${t('total_completed')}</div></div>
    </div>
    <div class="table-container">
      <table><thead><tr>
        <th>${t('patient_name')}</th><th>MRN</th><th>${t('procedure_name')}</th>
        <th>${t('or_room')}</th><th>${t('scheduled_date')}</th><th>${t('scheduled_time')}</th>
        <th>${t('anesthesia_type')}</th><th>${t('status')}</th>
        ${!readOnly ? '<th>'+t('actions')+'</th>' : ''}
      </tr></thead><tbody>
        ${cases.length ? cases.map(c => `<tr class="surg-status-${c.status}">
          <td>${lang==='ar'?c.full_name_ar:c.full_name_en}</td>
          <td>${c.mrn}</td>
          <td>${escapeHtml(c.procedure_name)}</td>
          <td>${c.or_room}</td>
          <td>${c.scheduled_date}</td>
          <td>${c.scheduled_time}</td>
          <td>${t('anesthesia_'+c.anesthesia_type.toLowerCase()) || c.anesthesia_type}</td>
          <td>${statusBadge(c.status)}</td>
          ${!readOnly ? `<td>
            ${c.status==='scheduled' ? `<button class="btn btn-sm btn-warning" onclick="handleUpdateSurgeryStatus(${c.case_id},'pre_op')">${t('start_pre_op')}</button>
              <button class="btn btn-sm btn-danger" onclick="handleUpdateSurgeryStatus(${c.case_id},'cancelled')">${t('cancel_surgery')}</button>` : ''}
            ${c.status==='pre_op' ? `<button class="btn btn-sm btn-danger" onclick="handleUpdateSurgeryStatus(${c.case_id},'in_progress')">${t('begin_surgery')}</button>` : ''}
            ${c.status==='in_progress' ? `<button class="btn btn-sm btn-success" onclick="handleCompleteSurgery(${c.case_id})">${t('complete_surgery')}</button>` : ''}
          </td>` : ''}
        </tr>`).join('') : `<tr><td colspan="${readOnly?8:9}" class="text-center text-muted">${t('no_data')}</td></tr>`}
      </tbody></table>
    </div>
    <div id="surgical-form-area"></div>
  `;
}

function showSurgicalForm() {
  const lang = currentLanguage();
  const patients = dbAll(`SELECT a.admission_id, a.bed_number, p.patient_id, p.full_name_ar, p.full_name_en, p.mrn
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.status='active' ORDER BY p.full_name_en`);
  const surgeons = dbAll(`SELECT user_id, full_name_ar, full_name_en FROM users
    WHERE role IN ('consultant','doctor') AND department_id = 3 AND is_active=1`);

  const area = document.getElementById('surgical-form-area');
  area.innerHTML = `
    <div class="card mt-2">
      <div class="card-header"><h3>${t('book_surgery')}</h3></div>
      <form onsubmit="handleBookSurgery(event)">
        <div class="form-row">
          <div class="form-group"><label>${t('patient_name')}</label>
            <select name="admission_id" required>${patients.map(p =>
              `<option value="${p.admission_id}">${lang==='ar'?escapeHtml(p.full_name_ar):escapeHtml(p.full_name_en)} (${escapeHtml(p.mrn)}) - ${escapeHtml(p.bed_number)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>${t('procedure_name')}</label><input name="procedure_name" id="surg-procedure" required autocomplete="off"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('anesthesia_type')}</label>
            <select name="anesthesia_type">
              <option value="General">${t('anesthesia_general')}</option>
              <option value="Spinal">${t('anesthesia_spinal')}</option>
              <option value="Epidural">${t('anesthesia_epidural')}</option>
              <option value="Local">${t('anesthesia_local')}</option>
              <option value="Regional">${t('anesthesia_regional')}</option>
              <option value="Sedation">${t('anesthesia_sedation')}</option>
            </select></div>
          <div class="form-group"><label>${t('or_room')}</label>
            <select name="or_room"><option>OR-1</option><option>OR-2</option><option>OR-3</option></select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('scheduled_date')}</label><input type="date" name="scheduled_date" required></div>
          <div class="form-group"><label>${t('scheduled_time')}</label><input type="time" name="scheduled_time" required></div>
          <div class="form-group"><label>${t('estimated_duration')}</label><input type="number" name="duration" value="60" min="15" max="720"></div>
        </div>
        <div class="form-group"><label>${t('pre_op_diagnosis')}</label><textarea name="pre_op_diagnosis" rows="2"></textarea></div>
        ${surgeons.length > 1 ? `<div class="form-group"><label>${lang==='ar'?'الجراح':'Surgeon'}</label>
          <select name="surgeon_id">${surgeons.map(s =>
            `<option value="${s.user_id}">${lang==='ar'?escapeHtml(s.full_name_ar):escapeHtml(s.full_name_en)}</option>`).join('')}
          </select></div>` : `<input type="hidden" name="surgeon_id" value="${surgeons[0]?.user_id || ''}">`}
        <div class="form-section"><h4>${t('pre_op_checklist')}</h4>
          <div class="pre-op-checklist">
            <label><input type="checkbox" name="consent_signed"><span>${t('consent_signed')}</span></label>
            <label><input type="checkbox" name="site_marked"><span>${t('site_marked')}</span></label>
            <label><input type="checkbox" name="npo_verified"><span>${t('npo_verified')}</span></label>
            <label><input type="checkbox" name="blood_type_confirmed"><span>${t('blood_type_confirmed')}</span></label>
            <label><input type="checkbox" name="allergies_reviewed"><span>${t('allergies_reviewed')}</span></label>
          </div>
        </div>
        <div class="form-group"><label>${t('surgical_team_notes')}</label><textarea name="surgical_team_notes" rows="2"></textarea></div>
        <div class="form-group"><label>${t('equipment_notes')}</label><textarea name="equipment_notes" rows="2"></textarea></div>
        <button type="submit" class="btn btn-primary">${t('book_surgery')}</button>
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('surgical-form-area').innerHTML=''">${t('cancel_btn')}</button>
      </form>
    </div>`;

  // Wire procedure autocomplete + duration auto-fill
  requestAnimationFrame(() => {
    const procInput = document.getElementById('surg-procedure');
    const durInput  = area.querySelector('[name="duration"]');
    if (procInput && typeof attachProcedureAutocomplete === 'function') {
      attachProcedureAutocomplete(procInput, durInput);
    }
  });
}

async function handleBookSurgery(e) {
  e.preventDefault();
  const f = e.target;
  const lang = currentLanguage();
  const user = getCurrentUser();
  const admRow = dbGet('SELECT patient_id FROM admissions WHERE admission_id=?', [f.admission_id.value]);
  dbRun(`INSERT INTO surgical_cases (patient_id, admission_id, surgeon_id, procedure_name, anesthesia_type, or_room,
    scheduled_date, scheduled_time, estimated_duration_min, pre_op_diagnosis, consent_signed, site_marked, npo_verified,
    blood_type_confirmed, allergies_reviewed, surgical_team_notes, equipment_notes, status, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [admRow.patient_id, +f.admission_id.value, +f.surgeon_id.value, f.procedure_name.value, f.anesthesia_type.value,
     f.or_room.value, f.scheduled_date.value, f.scheduled_time.value, +f.duration.value, f.pre_op_diagnosis.value,
     f.consent_signed.checked?1:0, f.site_marked.checked?1:0, f.npo_verified.checked?1:0,
     f.blood_type_confirmed.checked?1:0, f.allergies_reviewed.checked?1:0,
     f.surgical_team_notes.value, f.equipment_notes.value, 'scheduled', user.user_id, nowISO()]);
  await logAction('SURGERY_BOOKED', `${user.full_name_en} booked surgery: ${f.procedure_name.value} in ${f.or_room.value}`);
  await saveDBToIndexedDB();
  showSuccess(t('surgery_booked'));
  renderSurgicalSchedule(document.getElementById('main-content'), lang, false);
}

async function handleUpdateSurgeryStatus(caseId, newStatus) {
  const lang = currentLanguage();
  const user = getCurrentUser();
  dbRun('UPDATE surgical_cases SET status=? WHERE case_id=?', [newStatus, caseId]);
  await logAction('SURGERY_STATUS_UPDATED', `${user.full_name_en} updated surgery #${caseId} to ${newStatus}`);
  await saveDBToIndexedDB();
  showSuccess(t('surgery_updated'));
  renderSurgicalSchedule(document.getElementById('main-content'), lang, false);
}

function handleCompleteSurgery(caseId) {
  const lang = currentLanguage();
  const main = document.getElementById('surgical-form-area');
  main.innerHTML = `
    <div class="card mt-2">
      <div class="card-header"><h3>${t('complete_surgery')}</h3></div>
      <form onsubmit="submitCompleteSurgery(event, ${caseId})">
        <div class="form-group"><label>${t('post_op_notes')}</label><textarea name="post_op_notes" rows="3" required></textarea></div>
        <div class="form-group"><label>${t('complications_lbl')}</label><textarea name="complications" rows="2" placeholder="${lang==='ar'?'لا يوجد':'None'}"></textarea></div>
        <button type="submit" class="btn btn-success">${t('complete_surgery')}</button>
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('surgical-form-area').innerHTML=''">${t('cancel_btn')}</button>
      </form>
    </div>`;
}

async function submitCompleteSurgery(e, caseId) {
  e.preventDefault();
  const f = e.target;
  const lang = currentLanguage();
  const user = getCurrentUser();
  dbRun('UPDATE surgical_cases SET status=?, post_op_notes=?, complications=? WHERE case_id=?',
    ['completed', f.post_op_notes.value, f.complications.value || null, caseId]);
  await logAction('SURGERY_COMPLETED', `${user.full_name_en} completed surgery #${caseId}`);
  await saveDBToIndexedDB();
  showSuccess(t('surgery_updated'));
  renderSurgicalSchedule(document.getElementById('main-content'), lang, false);
}

// ============================================================
// DIETARY / NUTRITION MANAGEMENT
// ============================================================

function renderDTOrders(main, lang) {
  const orders = dbAll(`SELECT do.*, a.bed_number, p.full_name_ar, p.full_name_en, p.mrn,
    d.name_ar as dept_ar, d.name_en as dept_en
    FROM diet_orders do JOIN admissions a ON do.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id JOIN departments d ON a.dept_id = d.dept_id
    WHERE a.status='active' ORDER BY do.ordered_at DESC`);

  const active = orders.filter(o => o.status === 'active');
  const npo = active.filter(o => o.diet_type === 'NPO');
  const diabetic = active.filter(o => o.diet_type === 'Diabetic');
  const cardiac = active.filter(o => o.diet_type === 'Cardiac');

  main.innerHTML = `
    <div class="page-header"><h1>${t('diet_orders')}</h1></div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">${active.length}</div><div class="stat-label">${t('active_orders')}</div></div>
      <div class="stat-card"><div class="stat-value">${npo.length}</div><div class="stat-label">${t('diet_npo')}</div></div>
      <div class="stat-card"><div class="stat-value">${diabetic.length}</div><div class="stat-label">${t('diet_diabetic')}</div></div>
      <div class="stat-card"><div class="stat-value">${cardiac.length}</div><div class="stat-label">${t('diet_cardiac')}</div></div>
    </div>
    ${active.length ? active.map(o => `
      <div class="diet-card diet-${o.diet_type.toLowerCase()}">
        <div class="flex justify-between items-center">
          <div>
            <strong>${lang==='ar'?o.full_name_ar:o.full_name_en}</strong> (${o.mrn})
            <span class="badge badge-info">${o.bed_number}</span>
            <span class="badge badge-neutral">${lang==='ar'?o.dept_ar:o.dept_en}</span>
          </div>
          <span class="badge ${o.diet_type==='NPO'?'badge-danger':'badge-success'}">${t('diet_'+o.diet_type.toLowerCase()) || o.diet_type}</span>
        </div>
        <div class="sw-field-grid mt-1">
          ${o.calorie_target ? `<div class="sw-field"><div class="sw-field-label">${t('calorie_target')}</div>${o.calorie_target} kcal</div>` : ''}
          ${o.restrictions ? `<div class="sw-field"><div class="sw-field-label">${t('restrictions')}</div>${escapeHtml(o.restrictions)}</div>` : ''}
          ${o.food_allergies ? `<div class="sw-field"><div class="sw-field-label">${t('food_allergies')}</div>${escapeHtml(o.food_allergies)}</div>` : ''}
          ${o.special_instructions ? `<div class="sw-field"><div class="sw-field-label">${t('special_instructions')}</div>${escapeHtml(o.special_instructions)}</div>` : ''}
        </div>
        <div class="mt-1">
          <button class="btn btn-sm btn-danger" onclick="handleDiscontinueDiet(${o.order_id})">${t('discontinue')}</button>
        </div>
      </div>
    `).join('') : `<div class="empty-state"><p>${t('no_data')}</p></div>`}
  `;
}

async function handleDiscontinueDiet(orderId) {
  const lang = currentLanguage();
  const user = getCurrentUser();
  showConfirm(lang==='ar'?'إيقاف هذه الحمية؟':'Discontinue this diet order?', async () => {
    dbRun("UPDATE diet_orders SET status='discontinued' WHERE order_id=?", [orderId]);
    await logAction('DIET_DISCONTINUED', `${user.full_name_en} discontinued diet order #${orderId}`);
    await saveDBToIndexedDB();
    showSuccess(lang==='ar'?'تم إيقاف الحمية':'Diet order discontinued');
    navigateTo('dt-orders');
  });
}

function renderDTMeals(main, lang) {
  const orders = dbAll(`SELECT do.*, p.full_name_ar, p.full_name_en, p.mrn, a.bed_number
    FROM diet_orders do JOIN admissions a ON do.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    WHERE do.status='active' AND a.status='active' ORDER BY p.full_name_en`);

  const logs = dbAll(`SELECT ml.*, p.full_name_ar as pname_ar, p.full_name_en as pname_en
    FROM meal_log ml JOIN admissions a ON ml.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    ORDER BY ml.recorded_at DESC LIMIT 20`);

  main.innerHTML = `
    <div class="page-header"><h1>${t('meal_tracking')}</h1></div>
    <div class="card mb-2">
      <div class="card-header"><h3>${t('active_orders')} — ${t('log_meal')}</h3></div>
      <div class="table-container"><table><thead><tr>
        <th>${t('patient_name')}</th><th>MRN</th><th>${t('bed')}</th><th>${t('diet_type')}</th><th>${t('actions')}</th>
      </tr></thead><tbody>
        ${orders.map(o => `<tr>
          <td>${lang==='ar'?o.full_name_ar:o.full_name_en}</td><td>${o.mrn}</td><td>${o.bed_number}</td>
          <td><span class="badge ${o.diet_type==='NPO'?'badge-danger':'badge-info'}">${o.diet_type}</span></td>
          <td><button class="btn btn-sm btn-primary" onclick="showMealLogForm(${o.order_id}, ${o.admission_id})">${t('log_meal')}</button></td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>
    <div id="meal-form-area"></div>
    <div class="card">
      <div class="card-header"><h3>${lang==='ar'?'سجل الوجبات الأخيرة':'Recent Meal Logs'}</h3></div>
      <div class="table-container"><table><thead><tr>
        <th>${t('patient_name')}</th><th>${t('meal_type')}</th><th>${t('items_served')}</th>
        <th>${t('intake_percentage')}</th><th>${t('notes')}</th>
      </tr></thead><tbody>
        ${logs.map(l => `<tr>
          <td>${lang==='ar'?l.pname_ar:l.pname_en}</td>
          <td>${t('meal_'+l.meal_type)}</td>
          <td>${escapeHtml(l.items_served||'')}</td>
          <td><span class="intake-${l.intake_pct}">${l.intake_pct}% <span class="intake-bar"><span class="intake-bar-fill"></span></span></span></td>
          <td>${escapeHtml(l.notes||'')}</td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>
  `;
}

function showMealLogForm(orderId, admissionId) {
  const lang = currentLanguage();
  const area = document.getElementById('meal-form-area');
  area.innerHTML = `
    <div class="card mb-2">
      <form onsubmit="handleLogMeal(event, ${orderId}, ${admissionId})">
        <div class="form-row">
          <div class="form-group"><label>${t('meal_type')}</label>
            <select name="meal_type">
              <option value="breakfast">${t('meal_breakfast')}</option>
              <option value="lunch">${t('meal_lunch')}</option>
              <option value="dinner">${t('meal_dinner')}</option>
              <option value="snack">${t('meal_snack')}</option>
            </select></div>
          <div class="form-group"><label>${t('intake_percentage')}</label>
            <select name="intake_pct">
              <option value="0">0%</option><option value="25">25%</option>
              <option value="50">50%</option><option value="75" selected>75%</option>
              <option value="100">100%</option>
            </select></div>
        </div>
        <div class="form-group"><label>${t('items_served')}</label><textarea name="items_served" rows="2" required></textarea></div>
        <div class="form-group"><label>${t('notes')}</label><textarea name="notes" rows="1"></textarea></div>
        <button type="submit" class="btn btn-primary">${t('log_meal')}</button>
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('meal-form-area').innerHTML=''">${t('cancel_btn')}</button>
      </form>
    </div>`;
}

async function handleLogMeal(e, orderId, admissionId) {
  e.preventDefault();
  const f = e.target;
  const lang = currentLanguage();
  const user = getCurrentUser();
  dbRun(`INSERT INTO meal_log (diet_order_id, admission_id, meal_type, items_served, intake_pct, notes, recorded_by, recorded_at)
    VALUES (?,?,?,?,?,?,?,?)`,
    [orderId, admissionId, f.meal_type.value, f.items_served.value, +f.intake_pct.value, f.notes.value, user.user_id, nowISO()]);
  await logAction('MEAL_LOGGED', `${user.full_name_en} logged ${f.meal_type.value} — ${f.intake_pct.value}% intake`);
  await saveDBToIndexedDB();
  showSuccess(t('meal_logged'));
  renderDTMeals(document.getElementById('main-content'), lang);
}

function renderDTAssessments(main, lang) {
  const assessments = dbAll(`SELECT na.*, p.full_name_ar, p.full_name_en, p.mrn, a.bed_number
    FROM nutrition_assessments na JOIN admissions a ON na.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id ORDER BY na.assessed_at DESC`);

  const patients = dbAll(`SELECT a.admission_id, a.bed_number, p.full_name_ar, p.full_name_en, p.mrn
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.status='active' ORDER BY p.full_name_en`);

  main.innerHTML = `
    <div class="page-header">
      <h1>${t('nutrition_assessment')}</h1>
      <button class="btn btn-primary" onclick="document.getElementById('assessment-form').style.display='block'">&#10133; ${t('new_assessment')}</button>
    </div>
    <div id="assessment-form" class="card mb-2" style="display:none">
      <div class="card-header"><h3>${t('new_assessment')}</h3></div>
      <form onsubmit="handleNutritionAssessment(event)">
        <div class="form-row">
          <div class="form-group"><label>${t('patient_name')}</label>
            <select name="admission_id" required>${patients.map(p =>
              `<option value="${p.admission_id}">${lang==='ar'?escapeHtml(p.full_name_ar):escapeHtml(p.full_name_en)} (${escapeHtml(p.mrn)}) - ${escapeHtml(p.bed_number)}</option>`).join('')}
            </select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('weight_kg')}</label><input type="number" name="weight_kg" step="0.1" required onchange="calcBMI(this.form)"></div>
          <div class="form-group"><label>${t('height_cm')}</label><input type="number" name="height_cm" step="0.1" required onchange="calcBMI(this.form)"></div>
          <div class="form-group"><label>${t('bmi_label')}</label><input type="text" name="bmi" readonly></div>
        </div>
        <div class="form-group"><label>${t('nutritional_risk')}</label>
          <select name="nutritional_risk">
            <option value="low">${t('risk_low')}</option>
            <option value="moderate">${t('risk_moderate')}</option>
            <option value="high">${t('risk_high')}</option>
          </select></div>
        <div class="form-group"><label>${t('notes')}</label><textarea name="assessment_notes" rows="3"></textarea></div>
        <button type="submit" class="btn btn-primary">${t('save_btn')}</button>
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('assessment-form').style.display='none'">${t('cancel_btn')}</button>
      </form>
    </div>
    <div class="table-container"><table><thead><tr>
      <th>${t('patient_name')}</th><th>MRN</th><th>${t('bed')}</th>
      <th>${t('weight_kg')}</th><th>${t('height_cm')}</th><th>${t('bmi_label')}</th>
      <th>${t('nutritional_risk')}</th><th>${t('notes')}</th>
    </tr></thead><tbody>
      ${assessments.length ? assessments.map(a => `<tr>
        <td>${lang==='ar'?a.full_name_ar:a.full_name_en}</td><td>${a.mrn}</td><td>${a.bed_number}</td>
        <td>${a.weight_kg}</td><td>${a.height_cm}</td>
        <td><strong>${a.bmi ? a.bmi.toFixed(1) : '-'}</strong></td>
        <td><span class="badge ${a.nutritional_risk==='high'?'badge-danger':a.nutritional_risk==='moderate'?'badge-warning':'badge-success'}">${t('risk_'+a.nutritional_risk)}</span></td>
        <td>${escapeHtml(a.assessment_notes||'')}</td>
      </tr>`).join('') : `<tr><td colspan="8" class="text-center text-muted">${t('no_data')}</td></tr>`}
    </tbody></table></div>
  `;
}

function calcBMI(form) {
  const w = parseFloat(form.weight_kg.value);
  const h = parseFloat(form.height_cm.value);
  if (w > 0 && h > 0) {
    form.bmi.value = (w / ((h/100) * (h/100))).toFixed(1);
  }
}

async function handleNutritionAssessment(e) {
  e.preventDefault();
  const f = e.target;
  const lang = currentLanguage();
  const user = getCurrentUser();
  const w = parseFloat(f.weight_kg.value);
  const h = parseFloat(f.height_cm.value);
  const bmi = w / ((h/100)*(h/100));
  dbRun(`INSERT INTO nutrition_assessments (admission_id, weight_kg, height_cm, bmi, nutritional_risk, assessment_notes, assessed_by, assessed_at)
    VALUES (?,?,?,?,?,?,?,?)`,
    [+f.admission_id.value, w, h, Math.round(bmi*10)/10, f.nutritional_risk.value, f.assessment_notes.value, user.user_id, nowISO()]);
  await logAction('NUTRITION_ASSESSED', `${user.full_name_en} completed nutritional assessment, BMI: ${bmi.toFixed(1)}`);
  await saveDBToIndexedDB();
  showSuccess(t('assessment_saved'));
  renderDTAssessments(document.getElementById('main-content'), lang);
}

function showDietOrderForm(patientId, admissionId) {
  const lang = currentLanguage();
  const area = document.getElementById('doc-action-form');
  area.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>&#127858; ${t('order_diet')}</h3></div>
      <form onsubmit="handleDietOrder(event, ${patientId}, ${admissionId})">
        <div class="form-row">
          <div class="form-group"><label>${t('diet_type')}</label>
            <select name="diet_type">
              <option value="Regular">${t('diet_regular')}</option>
              <option value="Diabetic">${t('diet_diabetic')}</option>
              <option value="Cardiac">${t('diet_cardiac')}</option>
              <option value="Renal">${t('diet_renal')}</option>
              <option value="Low_Sodium">${t('diet_low_sodium')}</option>
              <option value="Soft">${t('diet_soft')}</option>
              <option value="Liquid">${t('diet_liquid')}</option>
              <option value="NPO">${t('diet_npo')}</option>
              <option value="Halal">${t('diet_halal')}</option>
              <option value="Pediatric">${t('diet_pediatric')}</option>
            </select></div>
          <div class="form-group"><label>${t('calorie_target')}</label><input type="number" name="calorie_target" value="2000" min="500" max="4000"></div>
        </div>
        <div class="form-group"><label>${t('food_allergies')}</label><input name="food_allergies"></div>
        <div class="form-group"><label>${t('restrictions')}</label><textarea name="restrictions" rows="2"></textarea></div>
        <div class="form-group"><label>${t('special_instructions')}</label><textarea name="special_instructions" rows="2"></textarea></div>
        <button type="submit" class="btn btn-primary">${t('order_diet')}</button>
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('doc-action-form').innerHTML=''">${t('cancel_btn')}</button>
      </form>
    </div>`;

  // Wire diet suggestion chip based on patient diagnosis
  requestAnimationFrame(() => {
    if (typeof getDietSuggestionChip === 'function') {
      const chip = getDietSuggestionChip(admissionId, (diet) => {
        const sel = area.querySelector('[name="diet_type"]');
        if (sel) { sel.value = diet; pulse(sel); }
      });
      const card = area.querySelector('.card');
      if (card && chip) showContextChips(card, [chip]);
    }
  });
}

async function handleDietOrder(e, patientId, admissionId) {
  e.preventDefault();
  const f = e.target;
  const lang = currentLanguage();
  const user = getCurrentUser();
  // Discontinue any existing active diet order for this admission
  dbRun("UPDATE diet_orders SET status='discontinued' WHERE admission_id=? AND status='active'", [admissionId]);
  dbRun(`INSERT INTO diet_orders (admission_id, diet_type, food_allergies, calorie_target, restrictions, special_instructions, ordered_by, ordered_at, status)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [admissionId, f.diet_type.value, f.food_allergies.value||null, +f.calorie_target.value, f.restrictions.value||null,
     f.special_instructions.value||null, user.user_id, nowISO(), 'active']);
  await logAction('DIET_ORDER_PLACED', `${user.full_name_en} placed ${f.diet_type.value} diet order`);
  await saveDBToIndexedDB();
  showSuccess(t('diet_order_placed'));
  showPatientDetail(patientId, admissionId);
}

// ============================================================
// SOCIAL WORK / CASE MANAGEMENT
// ============================================================

function renderSWCases(main, lang) {
  const cases = dbAll(`SELECT sw.*, p.full_name_ar, p.full_name_en, p.mrn, a.bed_number,
    d.name_ar as dept_ar, d.name_en as dept_en
    FROM social_work_cases sw JOIN patients p ON sw.patient_id = p.patient_id
    JOIN admissions a ON sw.admission_id = a.admission_id
    JOIN departments d ON a.dept_id = d.dept_id
    WHERE sw.status IN ('open','in_progress') ORDER BY sw.created_at DESC`);

  const highRisk = cases.filter(c => c.risk_level === 'high');
  const medRisk = cases.filter(c => c.risk_level === 'medium');
  const followUp = cases.filter(c => c.follow_up_needed === 1);

  main.innerHTML = `
    <div class="page-header"><h1>${t('sw_cases')}</h1></div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">${cases.length}</div><div class="stat-label">${t('open_cases')}</div></div>
      <div class="stat-card"><div class="stat-value">${highRisk.length}</div><div class="stat-label">${t('high_risk')}</div></div>
      <div class="stat-card"><div class="stat-value">${medRisk.length}</div><div class="stat-label">${t('medium_risk')}</div></div>
      <div class="stat-card"><div class="stat-value">${followUp.length}</div><div class="stat-label">${t('needs_follow_up')}</div></div>
    </div>
    ${cases.length ? cases.map(c => {
      const contacts = dbAll('SELECT * FROM sw_contacts WHERE case_id=? ORDER BY contact_date DESC', [c.case_id]);
      const statusMap = { open: 'badge-info', in_progress: 'badge-warning', resolved: 'badge-success', closed: 'badge-neutral' };
      return `
      <div class="sw-case-card risk-${c.risk_level}">
        <div class="flex justify-between items-center flex-wrap">
          <div>
            <strong style="font-size:1.1rem">${lang==='ar'?c.full_name_ar:c.full_name_en}</strong> (${c.mrn})
            <span class="badge badge-info">${c.bed_number}</span>
            <span class="badge badge-neutral">${lang==='ar'?c.dept_ar:c.dept_en}</span>
          </div>
          <div>
            <span class="badge ${c.risk_level==='high'?'badge-danger':c.risk_level==='medium'?'badge-warning':'badge-success'}">${t('risk_'+c.risk_level)}</span>
            <span class="badge ${statusMap[c.status]}">${t('sw_case_'+c.status)}</span>
          </div>
        </div>
        <div class="sw-field-grid mt-1">
          <div class="sw-field"><div class="sw-field-label">${t('living_situation')}</div>${t('live_'+c.living_situation)}</div>
          <div class="sw-field"><div class="sw-field-label">${t('support_system')}</div>${t('support_'+c.support_system)}</div>
          <div class="sw-field"><div class="sw-field-label">${t('insurance_status')}</div>${t('ins_'+c.insurance_status)}</div>
          <div class="sw-field"><div class="sw-field-label">${t('follow_up_needed')}</div>${c.follow_up_needed ? '&#9989; '+t('yes') : t('no')}</div>
        </div>
        ${c.psychosocial_assessment ? `<div class="mt-1"><strong>${t('psychosocial_assessment')}:</strong><p style="font-size:0.875rem;margin:4px 0">${escapeHtml(c.psychosocial_assessment).substring(0,300)}${c.psychosocial_assessment.length>300?'...':''}</p></div>` : ''}
        ${c.discharge_needs ? `<div class="mt-1"><strong>${t('discharge_needs')}:</strong><p style="font-size:0.875rem;margin:4px 0">${escapeHtml(c.discharge_needs)}</p></div>` : ''}
        ${c.referrals ? `<div class="mt-1"><strong>${t('referrals_lbl')}:</strong> <span style="font-size:0.875rem">${escapeHtml(c.referrals)}</span></div>` : ''}
        ${contacts.length ? `
          <div class="mt-1"><strong>${t('contact_history')}</strong></div>
          <div class="sw-contact-timeline">
            ${contacts.map(ct => `<div class="sw-contact-item">
              <span class="badge badge-neutral">${t('contact_'+ct.contact_type.replace('-','_'))}</span>
              <span class="text-muted" style="font-size:0.75rem">${ct.contact_date.substring(0,10)}</span><br>
              ${escapeHtml(ct.notes||'').substring(0,200)}${(ct.notes||'').length>200?'...':''}
            </div>`).join('')}
          </div>
        ` : ''}
        <div class="flex gap-1 mt-1">
          <button class="btn btn-sm btn-primary" onclick="showSWContactForm(${c.case_id})">${t('log_contact')}</button>
          ${c.status==='open' ? `<button class="btn btn-sm btn-warning" onclick="handleSWStatus(${c.case_id},'in_progress')">${t('update_status')}</button>` : ''}
          <button class="btn btn-sm btn-success" onclick="handleSWStatus(${c.case_id},'resolved')">${t('close_case')}</button>
        </div>
        <div id="sw-contact-form-${c.case_id}"></div>
      </div>`;
    }).join('') : `<div class="empty-state"><p>${t('no_data')}</p></div>`}
  `;
}

function showSWContactForm(caseId) {
  const lang = currentLanguage();
  const area = document.getElementById('sw-contact-form-'+caseId);
  area.innerHTML = `
    <div class="card mt-1">
      <form onsubmit="handleLogSWContact(event, ${caseId})">
        <div class="form-row">
          <div class="form-group"><label>${t('contact_type')}</label>
            <select name="contact_type">
              <option value="face_to_face">${t('contact_face')}</option>
              <option value="phone">${t('contact_phone')}</option>
              <option value="family_meeting">${t('contact_family_meeting')}</option>
              <option value="community">${t('contact_community')}</option>
            </select></div>
          <div class="form-group"><label>${t('scheduled_date')}</label>
            <input type="date" name="contact_date" value="${new Date().toISOString().slice(0,10)}"></div>
        </div>
        <div class="form-group"><label>${t('notes')}</label><textarea name="notes" rows="3" required></textarea></div>
        <button type="submit" class="btn btn-primary">${t('log_contact')}</button>
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('sw-contact-form-${caseId}').innerHTML=''">${t('cancel_btn')}</button>
      </form>
    </div>`;
}

async function handleLogSWContact(e, caseId) {
  e.preventDefault();
  const f = e.target;
  const lang = currentLanguage();
  const user = getCurrentUser();
  dbRun(`INSERT INTO sw_contacts (case_id, contact_type, contact_date, notes, recorded_by, recorded_at) VALUES (?,?,?,?,?,?)`,
    [caseId, f.contact_type.value, f.contact_date.value, f.notes.value, user.user_id, nowISO()]);
  dbRun('UPDATE social_work_cases SET updated_at=? WHERE case_id=?', [nowISO(), caseId]);
  await logAction('SW_CONTACT_LOGGED', `${user.full_name_en} logged ${f.contact_type.value} contact for case #${caseId}`);
  await saveDBToIndexedDB();
  showSuccess(t('sw_contact_logged'));
  renderSWCases(document.getElementById('main-content'), lang);
}

async function handleSWStatus(caseId, newStatus) {
  const lang = currentLanguage();
  const user = getCurrentUser();
  dbRun('UPDATE social_work_cases SET status=?, updated_at=? WHERE case_id=?', [newStatus, nowISO(), caseId]);
  await logAction('SW_STATUS_UPDATED', `${user.full_name_en} updated case #${caseId} to ${newStatus}`);
  await saveDBToIndexedDB();
  showSuccess(t('surgery_updated'));
  navigateTo('sw-cases');
}

function renderSWNew(main, lang) {
  const patients = dbAll(`SELECT a.admission_id, a.bed_number, p.patient_id, p.full_name_ar, p.full_name_en, p.mrn
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.status='active' ORDER BY p.full_name_en`);

  main.innerHTML = `
    <div class="page-header"><h1>${t('sw_new_case')}</h1></div>
    <div class="card">
      <form onsubmit="handleCreateSWCase(event)">
        <div class="form-group"><label>${t('patient_name')}</label>
          <select name="admission_id" required>${patients.map(p =>
            `<option value="${p.admission_id}" data-pid="${p.patient_id}">${lang==='ar'?escapeHtml(p.full_name_ar):escapeHtml(p.full_name_en)} (${escapeHtml(p.mrn)}) - ${escapeHtml(p.bed_number)}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>${t('psychosocial_assessment')}</label>
          <textarea name="psychosocial_assessment" rows="5" required placeholder="${lang==='ar'?'وصف شامل للوضع النفسي والاجتماعي للمريض...':'Comprehensive description of patient psychosocial status...'}"></textarea></div>
        <div class="form-row">
          <div class="form-group"><label>${t('nutritional_risk')}</label>
            <select name="risk_level">
              <option value="low">${t('risk_low')}</option>
              <option value="medium">${t('risk_moderate')}</option>
              <option value="high">${t('risk_high')}</option>
            </select></div>
          <div class="form-group"><label>${t('living_situation')}</label>
            <select name="living_situation">
              <option value="independent">${t('live_independent')}</option>
              <option value="with_family">${t('live_with_family')}</option>
              <option value="assisted_living">${t('live_assisted')}</option>
              <option value="homeless">${t('live_homeless')}</option>
            </select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('support_system')}</label>
            <select name="support_system">
              <option value="strong">${t('support_strong')}</option>
              <option value="moderate">${t('support_moderate')}</option>
              <option value="limited">${t('support_limited')}</option>
              <option value="none">${t('support_none')}</option>
            </select></div>
          <div class="form-group"><label>${t('insurance_status')}</label>
            <select name="insurance_status">
              <option value="insured">${t('ins_insured')}</option>
              <option value="uninsured">${t('ins_uninsured')}</option>
              <option value="pending">${t('ins_pending')}</option>
            </select></div>
        </div>
        <div class="form-group"><label>${t('discharge_needs')}</label><textarea name="discharge_needs" rows="3"></textarea></div>
        <div class="form-group"><label>${t('referrals_lbl')}</label><textarea name="referrals" rows="2" placeholder="${lang==='ar'?'العلاج الطبيعي، الطب النفسي، الرعاية المنزلية...':'Physical Therapy, Psychiatry, Home Health...'}"></textarea></div>
        <div class="form-group"><label><input type="checkbox" name="follow_up_needed" checked> ${t('follow_up_needed')}</label></div>
        <button type="submit" class="btn btn-primary">${t('save_btn')}</button>
      </form>
    </div>
  `;
}

async function handleCreateSWCase(e) {
  e.preventDefault();
  const f = e.target;
  const lang = currentLanguage();
  const user = getCurrentUser();
  const sel = f.admission_id;
  const patientId = sel.options[sel.selectedIndex].dataset.pid;
  dbRun(`INSERT INTO social_work_cases (admission_id, patient_id, social_worker_id, psychosocial_assessment, risk_level,
    living_situation, support_system, insurance_status, discharge_needs, referrals, follow_up_needed, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [+f.admission_id.value, +patientId, user.user_id, f.psychosocial_assessment.value, f.risk_level.value,
     f.living_situation.value, f.support_system.value, f.insurance_status.value, f.discharge_needs.value||null,
     f.referrals.value||null, f.follow_up_needed.checked?1:0, 'open', nowISO()]);
  await logAction('SW_CASE_CREATED', `${user.full_name_en} created social work case for patient`);
  await saveDBToIndexedDB();
  showSuccess(t('sw_case_created'));
  navigateTo('sw-cases');
}

function renderSWDischarge(main, lang) {
  const cases = dbAll(`SELECT sw.*, p.full_name_ar, p.full_name_en, p.mrn, a.bed_number,
    d.name_ar as dept_ar, d.name_en as dept_en
    FROM social_work_cases sw JOIN patients p ON sw.patient_id = p.patient_id
    JOIN admissions a ON sw.admission_id = a.admission_id
    JOIN departments d ON a.dept_id = d.dept_id
    WHERE sw.follow_up_needed = 1 AND sw.status IN ('open','in_progress')
    ORDER BY sw.risk_level DESC, sw.created_at`);

  main.innerHTML = `
    <div class="page-header"><h1>${t('sw_discharge_plan')}</h1></div>
    ${cases.length ? cases.map(c => {
      const contacts = dbAll('SELECT * FROM sw_contacts WHERE case_id=? ORDER BY contact_date DESC LIMIT 3', [c.case_id]);
      return `
      <div class="sw-case-card risk-${c.risk_level}">
        <div class="flex justify-between items-center">
          <strong>${lang==='ar'?c.full_name_ar:c.full_name_en}</strong> (${c.mrn}) — ${c.bed_number}
          <span class="badge ${c.risk_level==='high'?'badge-danger':'badge-warning'}">${t('risk_'+c.risk_level)}</span>
        </div>
        ${c.discharge_needs ? `<div class="mt-1"><strong>${t('discharge_needs')}:</strong><p style="font-size:0.875rem">${escapeHtml(c.discharge_needs)}</p></div>` : ''}
        ${c.referrals ? `<div class="mt-1"><strong>${t('referrals_lbl')}:</strong> ${escapeHtml(c.referrals)}</div>` : ''}
        ${contacts.length ? `<div class="mt-1"><strong>${t('contact_history')} (${lang==='ar'?'آخر':'latest'} ${contacts.length})</strong>
          <div class="sw-contact-timeline">${contacts.map(ct =>
            `<div class="sw-contact-item"><span class="badge badge-neutral">${t('contact_'+ct.contact_type)}</span> ${ct.contact_date.substring(0,10)}<br>${escapeHtml(ct.notes||'').substring(0,150)}</div>`
          ).join('')}</div></div>` : ''}
        <div class="flex gap-1 mt-1">
          <button class="btn btn-sm btn-primary" onclick="showSWContactForm(${c.case_id})">${t('log_contact')}</button>
          <button class="btn btn-sm" style="background:#7c3aed;border-color:#7c3aed;color:#fff;" onclick="prepareSWDischargeTransport(${c.case_id}, ${c.patient_id}, ${c.admission_id})">&#128666; ${lang === 'ar' ? 'تجهيز نقل التخريج' : 'Prepare Discharge Transport'}</button>
          <button class="btn btn-sm btn-success" onclick="handleSWStatus(${c.case_id},'resolved')">${t('close_case')}</button>
        </div>
        <div id="sw-contact-form-${c.case_id}"></div>
      </div>`;
    }).join('') : `<div class="empty-state"><p>${lang==='ar'?'لا توجد حالات تحتاج تخطيط تخريج':'No cases needing discharge planning'}</p></div>`}
  `;
}

// Social worker → discharge transport integration
async function prepareSWDischargeTransport(caseId, patientId, admissionId) {
  const lang = currentLanguage();
  const user = getCurrentUser();
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  if (!patient) return;
  const swCase = dbGet('SELECT * FROM social_work_cases WHERE case_id = ?', [caseId]);

  const ec = {
    name: patient.emergency_contact_name || '',
    phone: patient.emergency_contact_phone || '',
    relation: patient.emergency_contact_relation || '',
    legacy: patient.emergency_contact || '',
  };
  const hasAnyEc = ec.name || ec.phone || ec.legacy;

  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  overlay.innerHTML = `
    <div class="alert-modal" style="max-width:560px;">
      <div style="padding:20px;">
        <h3 style="color:#7c3aed;margin-bottom:10px;">&#128666; ${lang === 'ar' ? 'تجهيز خطة نقل التخريج' : 'Prepare Discharge Transport Plan'}</h3>
        <div style="background:#faf5ff;padding:10px;border-radius:6px;margin-bottom:14px;font-size:0.88rem;">
          <strong>${escapeHtml(lang === 'ar' ? patient.full_name_ar : (patient.full_name_en || patient.full_name_ar))}</strong> — ${escapeHtml(patient.mrn)}
        </div>
        <p style="font-size:0.85rem;color:#666;margin-bottom:10px;">
          ${hasAnyEc
            ? (lang === 'ar' ? 'جهة الاتصال للطوارئ موجودة. هل تريد استخدامها كمستلِم التخريج؟' : 'Emergency contact on file. Use it as the discharge transport person?')
            : (lang === 'ar' ? '⚠ لا توجد جهة اتصال للطوارئ مسجّلة. ستحتاج لإدخال يدوي عند التخريج.' : '⚠ No emergency contact on file. Manual entry needed at discharge.')}
        </p>
        <div class="form-row">
          <div class="form-group"><label>${lang === 'ar' ? 'اسم المستلِم' : 'Receiver name'}</label><input type="text" id="swdt-name" value="${escapeHtml(ec.name || ec.legacy)}"></div>
          <div class="form-group"><label>${lang === 'ar' ? 'الهاتف' : 'Phone'}</label><input type="tel" id="swdt-phone" value="${escapeHtml(ec.phone)}"></div>
          <div class="form-group"><label>${lang === 'ar' ? 'الصلة' : 'Relation'}</label><input type="text" id="swdt-rel" value="${escapeHtml(ec.relation)}"></div>
        </div>
        <div class="form-group">
          <label>${lang === 'ar' ? 'وسيلة النقل' : 'Transport mode'}</label>
          <select id="swdt-mode">
            <option value="family_car">${lang === 'ar' ? 'سيارة العائلة' : 'Family car'}</option>
            <option value="ambulance">${lang === 'ar' ? 'إسعاف' : 'Ambulance (non-emergency)'}</option>
            <option value="wheelchair_van">${lang === 'ar' ? 'سيارة كرسي متحرك' : 'Wheelchair-accessible van'}</option>
            <option value="taxi">${lang === 'ar' ? 'سيارة أجرة' : 'Taxi'}</option>
            <option value="other">${lang === 'ar' ? 'أخرى' : 'Other'}</option>
          </select>
        </div>
        <div class="form-group">
          <label>${lang === 'ar' ? 'ملاحظات إضافية (احتياجات منزلية، رعاية منزلية، إلخ)' : 'Additional notes (home care, follow-up, etc.)'}</label>
          <textarea id="swdt-notes" rows="3" placeholder="${lang === 'ar' ? 'مثال: رعاية منزلية تأتي 3 مرات أسبوعياً. الجارة ستكون متاحة في النهار.' : 'e.g. Home health 3x/wk. Neighbor available daytime.'}"></textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
          <button class="btn btn-secondary" onclick="this.closest('.alert-overlay').remove()">${t('cancel_btn')}</button>
          <button class="btn btn-primary" onclick="confirmSWDischargeTransport(${caseId}, ${patientId}, ${admissionId})">${lang === 'ar' ? 'حفظ خطة النقل' : 'Save Transport Plan'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function confirmSWDischargeTransport(caseId, patientId, admissionId) {
  const lang = currentLanguage();
  const user = getCurrentUser();
  const name = document.getElementById('swdt-name').value.trim();
  const phone = document.getElementById('swdt-phone').value.trim();
  const rel = document.getElementById('swdt-rel').value.trim();
  const mode = document.getElementById('swdt-mode').value;
  const notes = document.getElementById('swdt-notes').value.trim();
  if (!name || !phone) { showError(lang === 'ar' ? 'الاسم والهاتف مطلوبان' : 'Name and phone required'); return; }

  // Update patient's emergency_contact_* fields so discharge form auto-fills correctly
  dbRun(`UPDATE patients SET emergency_contact_name = ?, emergency_contact_phone = ?, emergency_contact_relation = ?, emergency_contact = ? WHERE patient_id = ?`,
    [name, phone, rel || null, `${name} - ${phone}${rel ? ' (' + rel + ')' : ''}`, patientId]);

  // Append to SW case discharge_needs as structured note
  const transportNote = `[TRANSPORT PLAN ${new Date().toISOString().slice(0,10)}] Mode: ${mode}. Receiver: ${name} (${phone})${rel ? ', ' + rel : ''}.${notes ? ' Notes: ' + notes : ''}`;
  dbRun(`UPDATE social_work_cases SET discharge_needs = COALESCE(discharge_needs || char(10), '') || ? WHERE case_id = ?`, [transportNote, caseId]);

  // Log contact for audit
  dbRun(`INSERT INTO sw_contacts (case_id, contact_type, contact_date, notes, social_worker_id) VALUES (?, 'transport_arranged', ?, ?, ?)`,
    [caseId, nowISO(), transportNote, user.user_id]);

  await logAction('SW_TRANSPORT_PLANNED',
    `Social worker ${user.full_name_en} arranged discharge transport for case ${caseId} (mode: ${mode}, receiver: ${name})`,
    null, patientId, null, null);

  saveDBToIndexedDB();
  document.querySelector('.alert-overlay')?.remove();
  showSuccess(lang === 'ar' ? 'تم حفظ خطة النقل. ستظهر تلقائياً في نموذج التخريج.' : 'Transport plan saved. Will auto-fill on discharge form.');
}

// ============================================================
// MAR — Medication Administration Record
// ============================================================

function renderNRMAR(main, lang) {
  const user = getCurrentUser();
  if (!user) return;

  // Get all active admissions for this nurse's department
  const dept = dbGet('SELECT department_id FROM users WHERE user_id = ?', [user.user_id]);
  const deptId = dept ? dept.department_id : null;

  const rxRows = dbAll(`
    SELECT p.*, pa.full_name_ar, pa.full_name_en, pa.mrn,
      a.bed_number, a.admission_id,
      u.full_name_en as doc_en, u.full_name_ar as doc_ar,
      v.full_name_en as verifier_en
    FROM prescriptions p
    JOIN admissions a ON p.admission_id = a.admission_id
    JOIN patients pa ON a.patient_id = pa.patient_id
    JOIN users u ON p.doctor_id = u.user_id
    LEFT JOIN users v ON p.verified_by = v.user_id
    WHERE a.status = 'active' AND p.status = 'active'
      ${deptId ? 'AND a.dept_id = ?' : ''}
    ORDER BY a.bed_number, p.prescribed_at DESC
  `, deptId ? [deptId] : []);

  // Group by patient
  const byPatient = {};
  for (const rx of rxRows) {
    const key = rx.admission_id;
    if (!byPatient[key]) byPatient[key] = { name: lang==='ar'?rx.full_name_ar:rx.full_name_en, mrn: rx.mrn, bed: rx.bed_number, admId: rx.admission_id, rxs: [] };
    byPatient[key].rxs.push(rx);
  }

  // Stats
  const today = new Date().toISOString().slice(0,10);
  const givenToday   = dbGet(`SELECT COUNT(*) as c FROM med_admin_records WHERE status='given' AND administered_at LIKE ?`, [today+'%']);
  const pendingCount = dbGet(`SELECT COUNT(*) as c FROM med_admin_records WHERE status='pending' AND (administered_at IS NULL)`);
  const heldCount    = dbGet(`SELECT COUNT(*) as c FROM med_admin_records WHERE status='held' AND administered_at LIKE ?`, [today+'%']);

  main.innerHTML = `
    <div class="page-header">
      <h1>${t('mar_title')}</h1>
    </div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value text-success">${givenToday ? givenToday.c : 0}</div><div class="stat-label">${t('mar_given_count')}</div></div>
      <div class="stat-card"><div class="stat-value text-warning">${Object.values(byPatient).reduce((s,p)=>s+p.rxs.length,0)}</div><div class="stat-label">${t('mar_pending_count')}</div></div>
      <div class="stat-card"><div class="stat-value text-danger">${heldCount ? heldCount.c : 0}</div><div class="stat-label">${t('mar_held_count')}</div></div>
    </div>

    ${Object.keys(byPatient).length === 0 ? `<div class="empty-state"><p>${t('no_data')}</p></div>` :
      Object.values(byPatient).map(pt => `
        <div class="mar-patient-block" id="mar-block-${pt.admId}">
          <div class="mar-patient-header">
            <strong>${escapeHtml(pt.name)}</strong>
            <span class="spb-badge spb-bed" style="margin-left:8px">&#128717; ${escapeHtml(pt.bed||'')}</span>
            <span class="text-muted" style="font-size:0.85rem;margin-left:8px">${pt.mrn}</span>
          </div>
          <div class="table-container" style="margin:0">
          <table>
            <thead><tr>
              <th>${t('mar_drug')}</th>
              <th>${t('mar_dose')}</th>
              <th>${t('mar_route')}</th>
              <th>${t('mar_prescribed_by')}</th>
              <th>${lang==='ar'?'آخر إعطاء':'Last Given'}</th>
              <th>${t('mar_status')}</th>
              <th>${lang==='ar'?'الصيدلة':'Pharmacy'}</th>
              <th>${t('actions')}</th>
            </tr></thead>
            <tbody>${pt.rxs.map(rx => {
              const lastMar = dbGet(`SELECT * FROM med_admin_records WHERE prescription_id=? ORDER BY administered_at DESC LIMIT 1`, [rx.rx_id]);
              const lastStatus = lastMar ? lastMar.status : 'pending';
              const lastTime = lastMar && lastMar.administered_at ? formatDateTime(lastMar.administered_at) : '—';
              const statusBadge = lastStatus === 'given' ? 'badge-success' : lastStatus === 'held' ? 'badge-danger' : lastStatus === 'refused' ? 'badge-warning' : 'badge-neutral';
              const isVerified = !!rx.verified_at;
              const pharmBadge = isVerified
                ? `<span class="badge badge-success" title="${rx.verifier_en||''}">✓ ${lang==='ar'?'مُعتمد':'Verified'}</span>`
                : `<span class="badge ph-badge-pending">⏳ ${lang==='ar'?'بانتظار الصيدلة':'Awaiting Pharmacy'}</span>`;
              const actionBtn = isVerified
                ? `<button class="btn btn-sm btn-primary" onclick="showMARLogForm(${rx.rx_id}, ${pt.admId}, '${escapeHtml(rx.drug_name).replace(/'/g,'')}', '${escapeHtml(rx.dose)}', '${rx.route}')">${t('mar_log_btn')}</button>`
                : `<button class="btn btn-sm btn-secondary" disabled title="${lang==='ar'?'يجب أن يعتمد الصيدلاني أولاً':'Pharmacist must verify first'}" style="cursor:not-allowed;opacity:0.5;">🔒 ${lang==='ar'?'ينتظر':'Locked'}</button>`;
              return `<tr style="${!isVerified?'background:#fff8f8;':''}">
                <td><strong>${escapeHtml(rx.drug_name)}</strong></td>
                <td>${escapeHtml(rx.dose)}</td>
                <td>${rx.route}</td>
                <td style="font-size:0.8rem">${lang==='ar'?escapeHtml(rx.doc_ar):escapeHtml(rx.doc_en)}</td>
                <td style="font-size:0.8rem">${lastTime}</td>
                <td><span class="badge ${statusBadge}">${t('mar_'+lastStatus)}</span></td>
                <td>${pharmBadge}</td>
                <td>${actionBtn}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
          </div>
        </div>
      `).join('')
    }
  `;
}

function showMARLogForm(rxId, admissionId, drugName, dose, route) {
  const lang = currentLanguage();
  // Hard guard — pharmacy must verify before nurse can administer
  const rx = dbGet('SELECT p.verified_at, p.drug_id, d.is_high_alert FROM prescriptions p LEFT JOIN drugs d ON p.drug_id = d.drug_id WHERE p.rx_id=?', [rxId]);
  if (!rx || !rx.verified_at) {
    showError(lang==='ar'
      ? '🔒 هذا الدواء لم يُعتمد من الصيدلية بعد. يرجى انتظار تحقق الصيدلاني.'
      : '🔒 This medication has not been verified by pharmacy yet. Administration is blocked until pharmacist approves.');
    return;
  }
  const isHighAlert = !!(rx && rx.is_high_alert);
  // K1 fix: for high-alert meds (insulin/opioids/heparin/warfarin/KCl), second nurse witness required
  const currentUser = getCurrentUser();
  const otherNurses = isHighAlert
    ? dbAll(`SELECT user_id, full_name_en, full_name_ar FROM users WHERE role IN ('nurse','senior_nurse') AND is_active = 1 AND user_id != ? ORDER BY full_name_en`, [currentUser ? currentUser.user_id : 0])
    : [];

  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  const now = new Date();
  const localNow = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0,16);

  overlay.innerHTML = `
    <div class="alert-modal" style="max-width:540px">
      <h2>${t('mar_log_btn')}${isHighAlert ? ' ⚠️' : ''}</h2>
      <p class="text-muted">${escapeHtml(drugName)} — ${escapeHtml(dose)} — ${route}</p>
      ${isHighAlert ? `<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:10px 14px;border-radius:6px;margin-bottom:12px;font-size:0.88rem;color:#991b1b;">
        <strong>⚠️ ${lang === 'ar' ? 'دواء عالي التحذير' : 'HIGH-ALERT MEDICATION'}</strong><br>
        ${lang === 'ar' ? 'يتطلب توقيع ممرضة ثانية للتحقق المزدوج (إجراء سلامة)' : 'Second-nurse witness required (Joint Commission double-check)'}
      </div>` : ''}
      <div class="form-group">
        <label>${t('mar_status')}</label>
        <select id="mar-status">
          <option value="given">${t('mar_given')}</option>
          <option value="held">${t('mar_held')}</option>
          <option value="refused">${t('mar_refused')}</option>
        </select>
      </div>
      <div class="form-group">
        <label>${t('mar_given_at')}</label>
        <input type="datetime-local" id="mar-time" value="${localNow}">
      </div>
      ${isHighAlert ? `<div class="form-group" id="mar-witness-group">
        <label>${lang === 'ar' ? 'الممرضة الشاهدة (مطلوبة)' : 'Witness Nurse (required)'} *</label>
        <select id="mar-witness" required>
          <option value="">${lang === 'ar' ? '-- اختر ممرضة ثانية --' : '-- Select second nurse --'}</option>
          ${otherNurses.map(n => `<option value="${n.user_id}">${escapeHtml(lang === 'ar' ? n.full_name_ar : n.full_name_en)}</option>`).join('')}
        </select>
      </div>` : ''}
      <div class="form-group" id="mar-hold-reason-group" style="display:none">
        <label>${t('mar_hold_reason')} *</label>
        <input type="text" id="mar-hold-reason" placeholder="${lang==='ar'?'سبب الحجب أو الرفض':'Reason for hold/refusal'}">
      </div>
      <div class="form-group">
        <label>${t('mar_notes')}</label>
        <textarea id="mar-notes" rows="2"></textarea>
      </div>
      <div class="alert-buttons">
        <button class="btn btn-primary" id="mar-save-btn">${t('save_btn')}</button>
        <button class="btn btn-secondary" onclick="this.closest('.alert-overlay').remove()">${t('cancel_btn')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#mar-status').addEventListener('change', function() {
    overlay.querySelector('#mar-hold-reason-group').style.display = (this.value !== 'given') ? 'block' : 'none';
  });

  overlay.querySelector('#mar-save-btn').addEventListener('click', async () => {
    await handleLogMAR(overlay, rxId, admissionId, drugName, dose, route);
  });
}

async function handleLogMAR(overlay, rxId, admissionId, drugName, dose, route) {
  const user = getCurrentUser();
  if (!user) return;
  const status = overlay.querySelector('#mar-status').value;
  const timeVal = overlay.querySelector('#mar-time').value;
  const holdReason = overlay.querySelector('#mar-hold-reason') ? overlay.querySelector('#mar-hold-reason').value.trim() : '';
  const notes = overlay.querySelector('#mar-notes').value.trim();

  if (status !== 'given' && !holdReason) {
    showError(currentLanguage() === 'ar' ? 'يرجى ذكر سبب الحجب أو الرفض' : 'Please enter a reason for hold/refusal');
    return;
  }

  // K1 fix: enforce witness for high-alert meds (only when given)
  const witnessEl = overlay.querySelector('#mar-witness');
  let witnessId = null;
  if (witnessEl && status === 'given') {
    witnessId = parseInt(witnessEl.value) || null;
    if (!witnessId) {
      showError(currentLanguage() === 'ar' ? 'يجب اختيار ممرضة شاهدة للأدوية عالية التحذير' : 'Witness nurse required for high-alert medications');
      return;
    }
    if (witnessId === user.user_id) {
      showError(currentLanguage() === 'ar' ? 'الممرضة الشاهدة يجب أن تكون شخصاً آخر' : 'Witness must be a different nurse');
      return;
    }
  }

  const adminAt = timeVal ? new Date(timeVal).toISOString() : nowISO();

  dbRun(`INSERT INTO med_admin_records (prescription_id, admission_id, drug_name, dose, route, administered_at, administered_by, status, hold_reason, notes, witnessed_by, witnessed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [rxId, admissionId, drugName, dose, route, adminAt, user.user_id, status, holdReason || null, notes || null, witnessId, witnessId ? nowISO() : null]);

  const witnessNote = witnessId
    ? ` [witnessed by user_id=${witnessId}]`
    : '';
  await logAction('MAR_LOGGED',
    `Nurse ${user.full_name_en} logged ${status} for ${drugName} ${dose}${witnessNote}`,
    null, null, null, null);

  saveDBToIndexedDB();
  broadcastUpdate('med_admin_records');
  overlay.remove();
  showSuccess(t('mar_logged'));
  renderNRMAR(document.getElementById('main-content'), currentLanguage());
}

// ============================================================
// Critical Lab Value Acknowledgment
// ============================================================

function showCriticalAckModal(orderId, testName, patientId, admissionId) {
  const lang = currentLanguage();
  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';

  overlay.innerHTML = `
    <div class="alert-modal critical-ack-modal" style="max-width:520px">
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:3rem">&#9888;</div>
        <h2 style="color:#dc2626">${t('critical_lab_alert')}</h2>
        <p class="text-muted">${escapeHtml(testName)}</p>
      </div>
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px;margin-bottom:16px">
        <p style="color:#991b1b;font-size:0.9rem">
          ${lang==='ar'
            ? 'هذه النتيجة تتطلب اتخاذ إجراء فوري. يرجى مراجعة المريض وتوثيق الإجراء المتخذ.'
            : 'This result requires immediate clinical action. Please review the patient and document the action taken.'}
        </p>
      </div>
      <div class="form-group">
        <label>${t('critical_ack_comment')} *</label>
        <textarea id="ack-comment" rows="3" placeholder="${lang==='ar'?'مثال: تم مراجعة المريض، تم إعطاء دواء X، تم إبلاغ الطبيب المناوب...':'e.g. Patient reviewed, medication X given, on-call notified...'}"></textarea>
      </div>
      <div class="alert-buttons">
        <button class="btn btn-danger" id="ack-confirm-btn">&#9989; ${t('critical_ack_btn')}</button>
        <button class="btn btn-secondary" onclick="this.closest('.alert-overlay').remove()">${t('cancel_btn')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#ack-confirm-btn').addEventListener('click', async () => {
    await handleAckCritical(overlay, orderId, testName, patientId, admissionId);
  });
}

async function handleAckCritical(overlay, orderId, testName, patientId, admissionId) {
  const user = getCurrentUser();
  if (!user) return;
  const comment = overlay.querySelector('#ack-comment').value.trim();
  if (!comment) {
    showError(currentLanguage() === 'ar' ? 'يرجى توثيق الإجراء المتخذ' : 'Please document the action taken');
    return;
  }

  // Check already acked
  const existing = dbGet('SELECT ack_id FROM lab_critical_acks WHERE order_id = ?', [orderId]);
  if (!existing) {
    dbRun('INSERT INTO lab_critical_acks (order_id, doctor_id, acked_at, comments) VALUES (?, ?, ?, ?)',
      [orderId, user.user_id, nowISO(), comment]);
  }

  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  await logAction('CRITICAL_LAB_ACKED',
    `${user.full_name_en} acknowledged critical lab: ${testName} — Action: ${comment}`,
    null, patientId, patient ? (patient.full_name_en || patient.full_name_ar) : '', patient ? patient.mrn : '');

  saveDBToIndexedDB();
  broadcastUpdate('lab_critical_acks');
  overlay.remove();
  showSuccess(t('critical_ack_done'));

  // Remove the specific critical item from the banner (live update without full re-render)
  const item = document.getElementById(`critical-item-${orderId}`);
  if (item) {
    item.style.transition = 'opacity 0.4s';
    item.style.opacity = '0';
    setTimeout(() => {
      item.remove();
      const banner = document.getElementById(`critical-banner-${admissionId}`);
      if (banner && !banner.querySelector('.critical-lab-item')) banner.remove();
    }, 400);
  }
}

// ============================================================
// BroadcastChannel — Live Updates Across Tabs
// ============================================================

const HIS_CHANNEL = (function() {
  try {
    const ch = new BroadcastChannel('his_live_updates');
    ch.onmessage = function(e) {
      const { table, view } = e.data || {};
      handleLiveUpdate(table, view);
    };
    return ch;
  } catch (err) {
    console.warn('[HIS] BroadcastChannel not supported, live updates disabled');
    return null;
  }
})();

function broadcastUpdate(table) {
  if (HIS_CHANNEL) {
    HIS_CHANNEL.postMessage({ table, view: currentView, ts: Date.now() });
  }
}

// Map tables to views that care about them
const TABLE_VIEW_MAP = {
  prescriptions:       ['ph-queue', 'doc-patients', 'nr-patients', 'nr-mar', 'lt-pending'],
  lab_orders:          ['lt-pending', 'lt-results', 'doc-patients', 'nr-tasks'],
  lab_critical_acks:   ['doc-patients', 'lt-history'],
  med_admin_records:   ['nr-mar', 'nr-tasks'],
  admissions:          ['sn-ward', 'sn-beds', 'hm-beds', 'doc-patients', 'nr-patients', 'hm-overview'],
  nursing_tasks:       ['nr-tasks', 'sn-ward'],
  vitals_log:          ['nr-patients', 'doc-patients'],
  consultations:       ['doc-patients', 'con-patients'],
  diet_orders:         ['dt-orders', 'dt-meals'],
  meal_log:            ['dt-meals'],
  social_work_cases:   ['sw-cases', 'sw-discharge'],
  surgical_cases:      ['hm-or', 'con-surgical', 'doc-surgical'],
  outpatient_visits:   ['rcp-queue'],
  dispensing_log:      ['ph-log', 'ph-queue'],
};

let _liveUpdateThrottle = null;
function handleLiveUpdate(table, senderView) {
  // Don't react to own broadcasts (already re-rendered locally)
  if (senderView === currentView) return;

  // '_any_' = generic update from saveDBToIndexedDB wrapper — always refresh
  const affectedViews = TABLE_VIEW_MAP[table] || [];
  if (table !== '_any_' && !affectedViews.includes(currentView)) return;

  // Throttle: don't re-render more than once per 1.5s
  if (_liveUpdateThrottle) return;
  _liveUpdateThrottle = setTimeout(() => {
    _liveUpdateThrottle = null;
    // Show a subtle refresh indicator
    const indicator = document.createElement('div');
    indicator.className = 'live-update-indicator';
    indicator.textContent = currentLanguage() === 'ar' ? '🔄 تحديث مباشر' : '🔄 Live update';
    document.body.appendChild(indicator);
    setTimeout(() => indicator.remove(), 2000);

    // Re-render current view
    renderView(currentView);
  }, 300);
}

// ============================================================
// NURSING ASSESSMENTS (Braden, Morse Fall, GCS, Pain NRS)
// ============================================================
function renderNRAssessments(main, lang) {
  const session = getCurrentSession();
  // Get patients assigned to this nurse via nurse_assignments table
  const myPatients = dbAll(`
    SELECT DISTINCT a.admission_id, a.bed_number, p.patient_id, p.full_name_ar, p.full_name_en, p.mrn
    FROM admissions a
    JOIN patients p ON a.patient_id = p.patient_id
    JOIN nurse_assignments na ON a.admission_id = na.admission_id
    WHERE a.status='active' AND na.nurse_id=?
    ORDER BY a.bed_number`, [session.user_id]);

  const recentAssessments = dbAll(`
    SELECT ca.*, p.full_name_ar, p.full_name_en
    FROM clinical_assessments ca
    JOIN admissions a ON ca.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    JOIN nurse_assignments na ON a.admission_id = na.admission_id
    WHERE na.nurse_id=?
    ORDER BY ca.assessed_at DESC LIMIT 20`, [session.user_id]);

  const riskBadge = (level) => {
    const colors = { high: '#dc3545', medium: '#fd7e14', low: '#28a745', normal: '#17a2b8' };
    return `<span class="badge" style="background:${colors[level]||'#6c757d'}">${t('risk_'+level)||level}</span>`;
  };

  main.innerHTML = `
    <div class="page-header"><h1>${t('assessments_title')}</h1></div>
    <div class="card mb-3">
      <h3>${t('new_assessment')}</h3>
      <div style="display:flex;flex-wrap:wrap;gap:12px;">
        ${myPatients.map(p => `
          <div class="assessment-patient-card">
            <div style="font-weight:600;margin-bottom:6px;">${lang==='ar'?escapeHtml(p.full_name_ar):escapeHtml(p.full_name_en||p.full_name_ar)}</div>
            <div style="color:#666;font-size:0.85rem;margin-bottom:10px;">${t('bed')}: ${p.bed_number} | MRN: ${p.mrn}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              <button class="btn btn-sm btn-primary" onclick="showBradenForm(${p.admission_id}, '${escapeHtml(p.full_name_ar||'')}', '${escapeHtml(p.full_name_en||'')}')">🛏 ${t('braden_scale')}</button>
              <button class="btn btn-sm btn-warning" onclick="showMorseForm(${p.admission_id}, '${escapeHtml(p.full_name_ar||'')}', '${escapeHtml(p.full_name_en||'')}')">🚶 ${t('morse_fall')}</button>
              <button class="btn btn-sm btn-info" onclick="showGCSForm(${p.admission_id}, '${escapeHtml(p.full_name_ar||'')}', '${escapeHtml(p.full_name_en||'')}')">🧠 ${t('gcs_scale')}</button>
              <button class="btn btn-sm btn-secondary" onclick="showPainForm(${p.admission_id}, '${escapeHtml(p.full_name_ar||'')}', '${escapeHtml(p.full_name_en||'')}')">💊 ${t('pain_nrs')}</button>
              <button class="btn btn-sm btn-success" onclick="showCarePlanForm(${p.admission_id}, '${escapeHtml(p.full_name_ar||'')}', '${escapeHtml(p.full_name_en||'')}')">📋 ${t('care_plan_title')}</button>
            </div>
          </div>
        `).join('')}
        ${myPatients.length===0 ? `<p style="color:#666;">${t('no_assigned_patients')}</p>` : ''}
      </div>
    </div>
    <div class="card">
      <h3>${t('assessment_history')}</h3>
      ${recentAssessments.length===0 ? `<p style="color:#666;">${t('no_data')}</p>` : `
      <table>
        <thead><tr><th>${t('patient')}</th><th>${t('type')}</th><th>${t('score')}</th><th>${t('risk_level')}</th><th>${t('time')}</th></tr></thead>
        <tbody>${recentAssessments.map(a => {
          const name = lang==='ar' ? escapeHtml(a.full_name_ar) : escapeHtml(a.full_name_en||a.full_name_ar);
          const typeLabel = { braden: t('braden_scale'), morse: t('morse_fall'), gcs: t('gcs_scale'), pain: t('pain_nrs') }[a.assess_type] || a.assess_type;
          return `<tr>
            <td>${name}</td>
            <td>${typeLabel}</td>
            <td><strong>${a.score}</strong></td>
            <td>${riskBadge(a.risk_level)}</td>
            <td>${formatDateTime(a.assessed_at)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`}
    </div>
  `;
}

function showBradenForm(admissionId, nameAr, nameEn) {
  const lang = currentLanguage();
  const name = lang==='ar' ? nameAr : (nameEn||nameAr);
  const overlay = showModal(`
    <div class="assessment-modal">
      <h2>🛏 ${t('braden_scale')} — ${escapeHtml(name)}</h2>
      <p style="color:#666;font-size:0.9rem;">${t('braden_hint')}</p>
      <div class="assessment-grid">
        ${[
          ['braden_sensory','sensory',[['1',t('braden_s1')],['2',t('braden_s2')],['3',t('braden_s3')],['4',t('braden_s4')]]],
          ['braden_moisture','moisture',[['1',t('braden_m1')],['2',t('braden_m2')],['3',t('braden_m3')],['4',t('braden_m4')]]],
          ['braden_activity','activity',[['1',t('braden_a1')],['2',t('braden_a2')],['3',t('braden_a3')],['4',t('braden_a4')]]],
          ['braden_mobility','mobility',[['1',t('braden_mo1')],['2',t('braden_mo2')],['3',t('braden_mo3')],['4',t('braden_mo4')]]],
          ['braden_nutrition','nutrition',[['1',t('braden_n1')],['2',t('braden_n2')],['3',t('braden_n3')],['4',t('braden_n4')]]],
          ['braden_friction','friction',[['1',t('braden_f1')],['2',t('braden_f2')],['3',t('braden_f3')]]],
        ].map(([labelKey, id, opts]) => `
          <div class="assessment-section">
            <label><strong>${t(labelKey)}</strong></label>
            <select id="br-${id}" onchange="updateBradenTotal()">
              ${opts.map(([v,l]) => `<option value="${v}">${v} — ${l}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>
      <div class="assessment-total" id="braden-total-display">
        ${lang==='ar'?'المجموع':'Total'}: <strong id="braden-total">18</strong>/23
        <span id="braden-risk-badge" style="margin-${lang==='ar'?'right':'left'}:10px;"></span>
      </div>
      <div class="form-group" style="margin-top:10px;">
        <label>${t('notes')}</label>
        <textarea id="br-notes" rows="2" style="width:100%;"></textarea>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
        <button class="btn btn-primary" onclick="handleBradenSave(${admissionId})">${t('save_btn')}</button>
      </div>
    </div>
  `);
  updateBradenTotal();
}

function updateBradenTotal() {
  const ids = ['sensory','moisture','activity','mobility','nutrition','friction'];
  let total = 0;
  ids.forEach(id => {
    const el = document.getElementById('br-'+id);
    if (el) total += parseInt(el.value)||0;
  });
  const totEl = document.getElementById('braden-total');
  const badgeEl = document.getElementById('braden-risk-badge');
  if (totEl) totEl.textContent = total;
  if (badgeEl) {
    let risk, color, label;
    if (total <= 9) { risk='high'; color='#dc3545'; label=t('risk_high'); }
    else if (total <= 12) { risk='high'; color='#dc3545'; label=t('risk_high'); }
    else if (total <= 14) { risk='medium'; color='#fd7e14'; label=t('risk_medium'); }
    else { risk='low'; color='#28a745'; label=t('risk_low'); }
    badgeEl.innerHTML = `<span class="badge" style="background:${color}">${label}</span>`;
  }
}

async function handleBradenSave(admissionId) {
  const user = getCurrentUser();
  const ids = ['sensory','moisture','activity','mobility','nutrition','friction'];
  let total = 0;
  const details = {};
  ids.forEach(id => {
    const val = parseInt(document.getElementById('br-'+id)?.value)||0;
    details[id] = val;
    total += val;
  });
  const notes = document.getElementById('br-notes')?.value.trim()||'';
  let risk;
  if (total <= 12) risk='high';
  else if (total <= 14) risk='medium';
  else risk='low';
  details.notes = notes;

  dbRun(`INSERT INTO clinical_assessments (admission_id, assess_type, score, risk_level, details_json, assessed_by, assessed_at)
    VALUES (?, 'braden', ?, ?, ?, ?, ?)`,
    [admissionId, total, risk, JSON.stringify(details), user.user_id, nowISO()]);

  saveDBToIndexedDB();
  closeModal();
  if (risk === 'high') {
    showModal(`<div style="text-align:center;padding:20px;">
      <div style="font-size:2rem;">⚠️</div>
      <h3 style="color:#dc3545;">${t('braden_high_risk_alert')}</h3>
      <p>${t('braden_high_risk_action')}</p>
      <button class="btn btn-primary" onclick="closeModal()">${t('understood')}</button>
    </div>`);
  } else {
    showSuccess(t('assessment_saved') + ` — Braden: ${total} (${risk})`);
    navigateTo('nr-assessments');
  }
}

function showMorseForm(admissionId, nameAr, nameEn) {
  const lang = currentLanguage();
  const name = lang==='ar' ? nameAr : (nameEn||nameAr);
  showModal(`
    <div class="assessment-modal">
      <h2>🚶 ${t('morse_fall')} — ${escapeHtml(name)}</h2>
      <div class="assessment-grid">
        <div class="assessment-section">
          <label><strong>${t('morse_history')}</strong></label>
          <select id="mo-history"><option value="0">${t('no')} (0)</option><option value="25">${t('yes')} (25)</option></select>
        </div>
        <div class="assessment-section">
          <label><strong>${t('morse_diagnosis')}</strong></label>
          <select id="mo-diag"><option value="0">${t('no')} (0)</option><option value="15">${t('yes')} (15)</option></select>
        </div>
        <div class="assessment-section">
          <label><strong>${t('morse_ambulatory')}</strong></label>
          <select id="mo-amb">
            <option value="0">${t('morse_amb_none')} (0)</option>
            <option value="15">${t('morse_amb_aid')} (15)</option>
            <option value="30">${t('morse_amb_furniture')} (30)</option>
          </select>
        </div>
        <div class="assessment-section">
          <label><strong>${t('morse_iv')}</strong></label>
          <select id="mo-iv"><option value="0">${t('no')} (0)</option><option value="20">${t('yes')} (20)</option></select>
        </div>
        <div class="assessment-section">
          <label><strong>${t('morse_gait')}</strong></label>
          <select id="mo-gait">
            <option value="0">${t('morse_gait_normal')} (0)</option>
            <option value="10">${t('morse_gait_weak')} (10)</option>
            <option value="20">${t('morse_gait_impaired')} (20)</option>
          </select>
        </div>
        <div class="assessment-section">
          <label><strong>${t('morse_mental')}</strong></label>
          <select id="mo-mental">
            <option value="0">${t('morse_mental_oriented')} (0)</option>
            <option value="15">${t('morse_mental_overestimate')} (15)</option>
          </select>
        </div>
      </div>
      <div class="assessment-total">
        ${lang==='ar'?'المجموع':'Total'}: <strong id="morse-total">0</strong>/125
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
        <button class="btn btn-primary" onclick="handleMorseSave(${admissionId})">${t('save_btn')}</button>
      </div>
    </div>
  `);
  ['history','diag','amb','iv','gait','mental'].forEach(id => {
    document.getElementById('mo-'+id)?.addEventListener('change', () => {
      const ids = ['history','diag','amb','iv','gait','mental'];
      let t2 = 0;
      ids.forEach(i => t2 += parseInt(document.getElementById('mo-'+i)?.value)||0);
      const el = document.getElementById('morse-total');
      if (el) el.textContent = t2;
    });
  });
}

async function handleMorseSave(admissionId) {
  const user = getCurrentUser();
  const ids = ['history','diag','amb','iv','gait','mental'];
  let total = 0;
  const details = {};
  ids.forEach(id => {
    const val = parseInt(document.getElementById('mo-'+id)?.value)||0;
    details[id] = val;
    total += val;
  });
  const risk = total >= 45 ? 'high' : total >= 25 ? 'medium' : 'low';

  dbRun(`INSERT INTO clinical_assessments (admission_id, assess_type, score, risk_level, details_json, assessed_by, assessed_at)
    VALUES (?, 'morse', ?, ?, ?, ?, ?)`,
    [admissionId, total, risk, JSON.stringify(details), user.user_id, nowISO()]);

  saveDBToIndexedDB();
  closeModal();
  if (risk === 'high') {
    showModal(`<div style="text-align:center;padding:20px;">
      <div style="font-size:2rem;">⚠️</div>
      <h3 style="color:#dc3545;">${t('morse_high_risk_alert')}</h3>
      <p>${t('morse_high_risk_action')}</p>
      <button class="btn btn-primary" onclick="closeModal()">${t('understood')}</button>
    </div>`);
  } else {
    showSuccess(t('assessment_saved') + ` — Morse: ${total} (${risk})`);
    navigateTo('nr-assessments');
  }
}

function showGCSForm(admissionId, nameAr, nameEn) {
  const lang = currentLanguage();
  const name = lang==='ar' ? nameAr : (nameEn||nameAr);
  showModal(`
    <div class="assessment-modal">
      <h2>🧠 ${t('gcs_scale')} — ${escapeHtml(name)}</h2>
      <div class="assessment-grid">
        <div class="assessment-section">
          <label><strong>${t('gcs_eyes')}</strong></label>
          <select id="gcs-eyes" onchange="updateGCSTotal()">
            <option value="4">4 — ${t('gcs_e4')}</option>
            <option value="3">3 — ${t('gcs_e3')}</option>
            <option value="2">2 — ${t('gcs_e2')}</option>
            <option value="1">1 — ${t('gcs_e1')}</option>
          </select>
        </div>
        <div class="assessment-section">
          <label><strong>${t('gcs_verbal')}</strong></label>
          <select id="gcs-verbal" onchange="updateGCSTotal()">
            <option value="5">5 — ${t('gcs_v5')}</option>
            <option value="4">4 — ${t('gcs_v4')}</option>
            <option value="3">3 — ${t('gcs_v3')}</option>
            <option value="2">2 — ${t('gcs_v2')}</option>
            <option value="1">1 — ${t('gcs_v1')}</option>
          </select>
        </div>
        <div class="assessment-section">
          <label><strong>${t('gcs_motor')}</strong></label>
          <select id="gcs-motor" onchange="updateGCSTotal()">
            <option value="6">6 — ${t('gcs_m6')}</option>
            <option value="5">5 — ${t('gcs_m5')}</option>
            <option value="4">4 — ${t('gcs_m4')}</option>
            <option value="3">3 — ${t('gcs_m3')}</option>
            <option value="2">2 — ${t('gcs_m2')}</option>
            <option value="1">1 — ${t('gcs_m1')}</option>
          </select>
        </div>
      </div>
      <div class="assessment-total" id="gcs-total-display">
        GCS: <strong id="gcs-total">15</strong>/15 — <span id="gcs-severity"></span>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
        <button class="btn btn-primary" onclick="handleGCSSave(${admissionId})">${t('save_btn')}</button>
      </div>
    </div>
  `);
  updateGCSTotal();
}

function updateGCSTotal() {
  const e = parseInt(document.getElementById('gcs-eyes')?.value)||4;
  const v = parseInt(document.getElementById('gcs-verbal')?.value)||5;
  const m = parseInt(document.getElementById('gcs-motor')?.value)||6;
  const total = e + v + m;
  const totEl = document.getElementById('gcs-total');
  const sevEl = document.getElementById('gcs-severity');
  if (totEl) totEl.textContent = total;
  if (sevEl) {
    if (total <= 8) sevEl.innerHTML = `<span style="color:#dc3545;font-weight:600;">${t('gcs_severe')}</span>`;
    else if (total <= 12) sevEl.innerHTML = `<span style="color:#fd7e14;font-weight:600;">${t('gcs_moderate')}</span>`;
    else sevEl.innerHTML = `<span style="color:#28a745;font-weight:600;">${t('gcs_mild')}</span>`;
  }
}

async function handleGCSSave(admissionId) {
  const user = getCurrentUser();
  const eyes = parseInt(document.getElementById('gcs-eyes')?.value)||4;
  const verbal = parseInt(document.getElementById('gcs-verbal')?.value)||5;
  const motor = parseInt(document.getElementById('gcs-motor')?.value)||6;
  const total = eyes + verbal + motor;
  const risk = total <= 8 ? 'high' : total <= 12 ? 'medium' : 'low';
  const details = { eyes, verbal, motor };

  dbRun(`INSERT INTO clinical_assessments (admission_id, assess_type, score, risk_level, details_json, assessed_by, assessed_at)
    VALUES (?, 'gcs', ?, ?, ?, ?, ?)`,
    [admissionId, total, risk, JSON.stringify(details), user.user_id, nowISO()]);

  saveDBToIndexedDB();
  closeModal();
  if (total <= 8) {
    showModal(`<div style="text-align:center;padding:20px;">
      <div style="font-size:2rem;">🚨</div>
      <h3 style="color:#dc3545;">${t('gcs_severe_alert')}</h3>
      <p>${t('gcs_severe_action')}</p>
      <button class="btn btn-danger" onclick="closeModal()">${t('understood')}</button>
    </div>`);
  } else {
    showSuccess(t('assessment_saved') + ` — GCS: ${total}/15`);
    navigateTo('nr-assessments');
  }
}

function showPainForm(admissionId, nameAr, nameEn) {
  const lang = currentLanguage();
  const name = lang==='ar' ? nameAr : (nameEn||nameAr);
  showModal(`
    <div class="assessment-modal">
      <h2>💊 ${t('pain_nrs')} — ${escapeHtml(name)}</h2>
      <div style="text-align:center;margin:20px 0;">
        <div class="pain-scale-row">
          ${[0,1,2,3,4,5,6,7,8,9,10].map(n => {
            const bg = n<=3?'#28a745':n<=6?'#fd7e14':'#dc3545';
            return `<button type="button" class="pain-btn" id="pain-btn-${n}" onclick="selectPain(${n})" style="background:${bg};">${n}</button>`;
          }).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:#666;margin-top:4px;">
          <span>${lang==='ar'?'لا ألم':'No Pain'}</span>
          <span>${lang==='ar'?'ألم متوسط':'Moderate'}</span>
          <span>${lang==='ar'?'أشد ألم':'Worst Pain'}</span>
        </div>
        <div style="margin-top:16px;font-size:1.1rem;"><strong>${lang==='ar'?'المختار':'Selected'}: <span id="pain-selected" style="font-size:1.5rem;">—</span></strong></div>
        <input type="hidden" id="pain-score" value="">
      </div>
      <div class="form-group">
        <label>${t('pain_location')||'Location'}</label>
        <input type="text" id="pain-location" placeholder="${lang==='ar'?'مثال: صدر، بطن':'e.g. chest, abdomen'}">
      </div>
      <div class="form-group">
        <label>${t('notes')}</label>
        <textarea id="pain-notes" rows="2" style="width:100%;"></textarea>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
        <button class="btn btn-primary" onclick="handlePainSave(${admissionId})">${t('save_btn')}</button>
      </div>
    </div>
  `);
}

function selectPain(n) {
  document.querySelectorAll('.pain-btn').forEach(btn => btn.style.opacity='0.5');
  const btn = document.getElementById('pain-btn-'+n);
  if (btn) btn.style.opacity='1';
  document.getElementById('pain-score').value = n;
  document.getElementById('pain-selected').textContent = n;
}

async function handlePainSave(admissionId) {
  const user = getCurrentUser();
  const score = parseInt(document.getElementById('pain-score')?.value);
  if (isNaN(score)) { showError(currentLanguage()==='ar'?'الرجاء اختيار مستوى الألم':'Please select a pain level'); return; }
  const location = document.getElementById('pain-location')?.value.trim()||'';
  const notes = document.getElementById('pain-notes')?.value.trim()||'';
  const risk = score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';
  const details = { score, location, notes };

  dbRun(`INSERT INTO clinical_assessments (admission_id, assess_type, score, risk_level, details_json, assessed_by, assessed_at)
    VALUES (?, 'pain', ?, ?, ?, ?, ?)`,
    [admissionId, score, risk, JSON.stringify(details), user.user_id, nowISO()]);

  saveDBToIndexedDB();
  closeModal();
  showSuccess(t('assessment_saved') + ` — ${t('pain_nrs')}: ${score}/10`);
  navigateTo('nr-assessments');
}

// ============================================================
// FLUID BALANCE / I&O CHARTING
// ============================================================
function renderNRFluids(main, lang) {
  const session = getCurrentSession();
  const myPatients = dbAll(`
    SELECT DISTINCT a.admission_id, a.bed_number, p.patient_id, p.full_name_ar, p.full_name_en, p.mrn
    FROM admissions a
    JOIN patients p ON a.patient_id = p.patient_id
    JOIN nurse_assignments na ON a.admission_id = na.admission_id
    WHERE a.status='active' AND na.nurse_id=?
    ORDER BY a.bed_number`, [session.user_id]);

  const today = new Date().toISOString().slice(0,10);

  const rows = myPatients.map(p => {
    const intake = dbAll(`SELECT SUM(amount_ml) as total FROM fluid_balance
      WHERE admission_id=? AND type='intake' AND date(recorded_at)=?`, [p.admission_id, today]);
    const output = dbAll(`SELECT SUM(amount_ml) as total FROM fluid_balance
      WHERE admission_id=? AND type='output' AND date(recorded_at)=?`, [p.admission_id, today]);
    const inTotal = intake[0]?.total || 0;
    const outTotal = output[0]?.total || 0;
    const balance = inTotal - outTotal;
    const balColor = balance < -500 ? '#dc3545' : balance > 1000 ? '#fd7e14' : '#28a745';
    return { ...p, inTotal, outTotal, balance, balColor };
  });

  main.innerHTML = `
    <div class="page-header"><h1>${t('fluid_balance_title')}</h1><span style="color:#666;font-size:0.9rem;">${today}</span></div>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>${t('patient')}</th>
            <th>${t('bed')}</th>
            <th style="color:#17a2b8;">${t('fluid_intake')}</th>
            <th style="color:#6c757d;">${t('fluid_output')}</th>
            <th>${t('fluid_balance')}</th>
            <th>${t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td>${lang==='ar'?escapeHtml(r.full_name_ar):escapeHtml(r.full_name_en||r.full_name_ar)}<br><small>${r.mrn}</small></td>
            <td>${r.bed_number}</td>
            <td style="color:#17a2b8;font-weight:600;">${r.inTotal} mL</td>
            <td style="color:#6c757d;font-weight:600;">${r.outTotal} mL</td>
            <td style="color:${r.balColor};font-weight:700;">${r.balance >= 0 ? '+' : ''}${r.balance} mL</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="showFluidLogForm(${r.admission_id}, '${lang==='ar'?escapeHtml(r.full_name_ar):escapeHtml(r.full_name_en||r.full_name_ar)}', 'intake')">${t('log_intake')}</button>
              <button class="btn btn-sm btn-secondary" onclick="showFluidLogForm(${r.admission_id}, '${lang==='ar'?escapeHtml(r.full_name_ar):escapeHtml(r.full_name_en||r.full_name_ar)}', 'output')">${t('log_output')}</button>
              <button class="btn btn-sm btn-info" onclick="showFluidDetails(${r.admission_id}, '${lang==='ar'?escapeHtml(r.full_name_ar):escapeHtml(r.full_name_en||r.full_name_ar)}')">${t('details')}</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function showFluidLogForm(admissionId, patientName, type) {
  const lang = currentLanguage();
  const intakeCategories = ['iv_fluid','oral','tube_feeding','blood_products','other_intake'];
  const outputCategories = ['urine','drain','wound','emesis','blood_loss','other_output'];
  const categories = type === 'intake' ? intakeCategories : outputCategories;
  const title = type === 'intake' ? t('log_intake') : t('log_output');

  showModal(`
    <div style="padding:20px;max-width:400px;">
      <h2>${title} — ${escapeHtml(patientName)}</h2>
      <div class="form-group">
        <label>${t('category')}</label>
        <select id="fl-cat">
          ${categories.map(c => `<option value="${c}">${t('fluid_cat_'+c)||c.replace(/_/g,' ')}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>${t('amount_ml')}</label>
        <input type="number" id="fl-amount" placeholder="250" min="1" max="5000">
      </div>
      <div class="form-group">
        <label>${t('shift')}</label>
        <select id="fl-shift">
          <option value="morning">${t('shift_morning')}</option>
          <option value="evening">${t('shift_evening')}</option>
          <option value="night">${t('shift_night')}</option>
        </select>
      </div>
      <div class="form-group">
        <label>${t('notes')}</label>
        <textarea id="fl-notes" rows="2" style="width:100%;"></textarea>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
        <button class="btn btn-primary" onclick="handleFluidLog(${admissionId}, '${type}')">${t('save_btn')}</button>
      </div>
    </div>
  `);
}

async function handleFluidLog(admissionId, type) {
  const user = getCurrentUser();
  const amount = parseFloat(document.getElementById('fl-amount')?.value);
  if (!amount || amount <= 0) { showError(currentLanguage()==='ar'?'الرجاء إدخال الكمية':'Please enter amount'); return; }
  const category = document.getElementById('fl-cat')?.value;
  const shift = document.getElementById('fl-shift')?.value;
  const notes = document.getElementById('fl-notes')?.value.trim()||'';

  dbRun(`INSERT INTO fluid_balance (admission_id, type, category, amount_ml, recorded_by, recorded_at, shift, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [admissionId, type, category, amount, user.user_id, nowISO(), shift, notes||null]);

  saveDBToIndexedDB();
  closeModal();
  showSuccess(t('fluid_logged') + ` — ${amount} mL`);
  navigateTo('nr-fluids');
}

function showFluidDetails(admissionId, patientName) {
  const lang = currentLanguage();
  const today = new Date().toISOString().slice(0,10);
  const records = dbAll(`SELECT fb.*, u.full_name_en, u.full_name_ar FROM fluid_balance fb
    JOIN users u ON fb.recorded_by = u.user_id
    WHERE fb.admission_id=? AND date(fb.recorded_at)=?
    ORDER BY fb.recorded_at DESC`, [admissionId, today]);

  const intake = records.filter(r=>r.type==='intake').reduce((s,r)=>s+r.amount_ml,0);
  const output = records.filter(r=>r.type==='output').reduce((s,r)=>s+r.amount_ml,0);
  const balance = intake - output;
  const balColor = balance < -500 ? '#dc3545' : balance > 1000 ? '#fd7e14' : '#28a745';

  showModal(`
    <div style="padding:20px;max-width:600px;max-height:70vh;overflow-y:auto;">
      <h2>${t('fluid_balance_title')} — ${escapeHtml(patientName)}</h2>
      <div style="display:flex;gap:20px;margin-bottom:16px;text-align:center;">
        <div style="flex:1;background:#e8f4f8;border-radius:8px;padding:12px;">
          <div style="font-size:0.85rem;color:#666;">${t('fluid_intake')}</div>
          <div style="font-size:1.5rem;font-weight:700;color:#17a2b8;">${intake} mL</div>
        </div>
        <div style="flex:1;background:#f5f5f5;border-radius:8px;padding:12px;">
          <div style="font-size:0.85rem;color:#666;">${t('fluid_output')}</div>
          <div style="font-size:1.5rem;font-weight:700;color:#6c757d;">${output} mL</div>
        </div>
        <div style="flex:1;background:#f5f5f5;border-radius:8px;padding:12px;">
          <div style="font-size:0.85rem;color:#666;">${t('fluid_balance')}</div>
          <div style="font-size:1.5rem;font-weight:700;color:${balColor};">${balance>=0?'+':''}${balance} mL</div>
        </div>
      </div>
      <table>
        <thead><tr><th>${t('time')}</th><th>${t('type')}</th><th>${t('category')}</th><th>${t('amount_ml')}</th></tr></thead>
        <tbody>${records.map(r => `<tr>
          <td>${formatDateTime(r.recorded_at)}</td>
          <td><span class="badge" style="background:${r.type==='intake'?'#17a2b8':'#6c757d'}">${r.type}</span></td>
          <td>${t('fluid_cat_'+r.category)||r.category}</td>
          <td>${r.amount_ml} mL</td>
        </tr>`).join('')}</tbody>
      </table>
      <div style="margin-top:16px;text-align:right;">
        <button class="btn btn-secondary" onclick="closeModal()">${t('close_btn')||'Close'}</button>
      </div>
    </div>
  `);
}

// ============================================================
// ORDER SETS
// ============================================================
const ORDER_SETS = {
  dka: {
    en: 'DKA Protocol',
    ar: 'بروتوكول الحماض الكيتوني',
    icon: '🩸',
    labs: ['Blood Glucose', 'BMP (Electrolytes)', 'Blood Gas (ABG)', 'Urine Ketones', 'CBC'],
    meds: [
      { drug: 'Normal Saline 0.9%', dose: '1L/hr x 1hr then 500mL/hr', route: 'IV', frequency: 'stat' },
      { drug: 'Regular Insulin', dose: '0.1 units/kg/hr', route: 'IV', frequency: 'continuous' },
      { drug: 'Potassium Chloride', dose: 'per protocol', route: 'IV', frequency: 'q4h' },
    ],
    tasks: ['Monitor glucose q1h', 'Monitor electrolytes q2h', 'Strict I&O', 'Monitor for cerebral edema'],
    diet: 'NPO until resolved',
  },
  sepsis: {
    en: 'Sepsis Bundle (Hour-1)',
    ar: 'بروتوكول الإنتان (الساعة الأولى)',
    icon: '🦠',
    labs: ['Blood Cultures x2', 'Lactate Level', 'CBC', 'CMP', 'Procalcitonin', 'Urinalysis'],
    meds: [
      { drug: 'Broad-spectrum Antibiotics', dose: 'per protocol', route: 'IV', frequency: 'stat' },
      { drug: 'Normal Saline 0.9%', dose: '30mL/kg bolus', route: 'IV', frequency: 'stat' },
    ],
    tasks: ['Blood cultures BEFORE antibiotics', 'Measure lactate', 'Apply vasopressors if MAP < 65', 'Reassess fluid responsiveness'],
    diet: 'NPO pending evaluation',
  },
  stroke: {
    en: 'Acute Stroke Protocol',
    ar: 'بروتوكول السكتة الدماغية الحادة',
    icon: '🧠',
    labs: ['CBC', 'PT/INR', 'BMP', 'Blood Glucose', 'Troponin', 'ECG'],
    meds: [
      { drug: 'Aspirin', dose: '325mg', route: 'PO', frequency: 'stat (if hemorrhage excluded)' },
      { drug: 'tPA (Alteplase)', dose: 'per protocol', route: 'IV', frequency: 'stat (if eligible)' },
    ],
    tasks: ['Urgent CT head non-contrast', 'Neurology consult', 'NPO until swallow assessment', 'Monitor BP q15min', 'Foley catheter'],
    diet: 'NPO – swallow screen first',
  },
  chest_pain: {
    en: 'Chest Pain / ACS Protocol',
    ar: 'بروتوكول ألم الصدر / متلازمة الشريان التاجي',
    icon: '❤️',
    labs: ['Troponin (serial)', 'BNP', 'CBC', 'BMP', 'Lipid Panel', 'ECG x3'],
    meds: [
      { drug: 'Aspirin', dose: '325mg', route: 'PO', frequency: 'stat' },
      { drug: 'Nitroglycerin SL', dose: '0.4mg q5min x3', route: 'SL', frequency: 'prn pain' },
      { drug: 'Heparin', dose: 'per ACS protocol', route: 'IV', frequency: 'continuous' },
      { drug: 'Morphine', dose: '2-4mg', route: 'IV', frequency: 'prn pain' },
    ],
    tasks: ['12-lead ECG within 10 minutes', 'Continuous cardiac monitoring', 'Cardiology consult', 'Bed rest', 'IV access x2'],
    diet: 'NPO for possible cath',
  },
};

function showOrderSetPanel(patientId, admissionId) {
  const lang = currentLanguage();
  showModal(`
    <div style="padding:20px;max-width:600px;max-height:75vh;overflow-y:auto;">
      <h2>${t('order_sets_title')}</h2>
      <p style="color:#666;font-size:0.9rem;">${t('order_sets_hint')}</p>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px;">
        ${Object.entries(ORDER_SETS).map(([key, os]) => `
          <div class="order-set-card" id="os-${key}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-size:1.1rem;font-weight:700;">${os.icon} ${lang==='ar'?os.ar:os.en}</div>
                <div style="margin-top:6px;font-size:0.85rem;color:#555;">
                  <span style="margin-${lang==='ar'?'left':'right'}:12px;">🧪 ${os.labs.length} ${lang==='ar'?'فحوصات':'labs'}</span>
                  <span style="margin-${lang==='ar'?'left':'right'}:12px;">💊 ${os.meds.length} ${lang==='ar'?'أدوية':'meds'}</span>
                  <span>📋 ${os.tasks.length} ${lang==='ar'?'مهام':'tasks'}</span>
                </div>
              </div>
              <button class="btn btn-sm btn-primary" onclick="confirmApplyOrderSet('${key}', ${patientId}, ${admissionId})">${t('apply_btn')||'Apply'}</button>
            </div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:16px;text-align:right;">
        <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
      </div>
    </div>
  `);
}

function confirmApplyOrderSet(setName, patientId, admissionId) {
  const lang = currentLanguage();
  const os = ORDER_SETS[setName];
  if (!os) return;
  closeModal();
  setTimeout(() => {
    showModal(`
      <div style="padding:20px;max-width:500px;">
        <h2>${t('confirm_apply_set')||'Apply Order Set'}</h2>
        <h3 style="color:#007bff;">${os.icon} ${lang==='ar'?os.ar:os.en}</h3>
        <div style="background:#f8f9fa;border-radius:8px;padding:12px;margin:12px 0;font-size:0.9rem;">
          <div><strong>🧪 ${lang==='ar'?'الفحوصات':'Labs'}:</strong> ${os.labs.join(', ')}</div>
          <div style="margin-top:6px;"><strong>💊 ${lang==='ar'?'الأدوية':'Meds'}:</strong> ${os.meds.map(m=>m.drug+' '+m.dose).join(', ')}</div>
          <div style="margin-top:6px;"><strong>📋 ${lang==='ar'?'المهام':'Tasks'}:</strong> ${os.tasks.join(', ')}</div>
          <div style="margin-top:6px;"><strong>🍽️ ${lang==='ar'?'النظام الغذائي':'Diet'}:</strong> ${os.diet}</div>
        </div>
        <p style="color:#dc3545;font-size:0.9rem;"><strong>⚠️ ${lang==='ar'?'سيتم تسجيل جميع الأوامر في سجل المريض':'All orders will be logged to the patient record'}</strong></p>
        <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
          <button class="btn btn-danger" onclick="handleApplyOrderSet('${setName}', ${patientId}, ${admissionId})">${t('confirm_btn')||'Confirm & Apply'}</button>
        </div>
      </div>
    `);
  }, 100);
}

async function handleApplyOrderSet(setName, patientId, admissionId) {
  const user = getCurrentUser();
  const os = ORDER_SETS[setName];
  if (!os) return;
  const lang = currentLanguage();

  // Log order set application
  dbRun(`INSERT INTO order_set_log (admission_id, set_name, applied_by, applied_at) VALUES (?, ?, ?, ?)`,
    [admissionId, setName, user.user_id, nowISO()]);

  // Create lab orders
  os.labs.forEach(labName => {
    dbRun(`INSERT INTO lab_orders (admission_id, ordered_by, test_name, priority, status, ordered_at)
      VALUES (?, ?, ?, 'stat', 'pending', ?)`,
      [admissionId, user.user_id, labName, nowISO()]);
  });

  // Create prescriptions
  os.meds.forEach(med => {
    dbRun(`INSERT INTO prescriptions (admission_id, prescribed_by, drug_name, dose, route, frequency, status, prescribed_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [admissionId, user.user_id, med.drug, med.dose, med.route, med.frequency, nowISO()]);
  });

  // Log tasks as nursing tasks
  os.tasks.forEach(task => {
    dbRun(`INSERT INTO nursing_tasks (admission_id, nurse_id, task_type, task_detail, status, done_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [admissionId, user.user_id, 'order_set_task', task, 'pending', nowISO(), task]);
  });

  const setLabel = lang==='ar' ? os.ar : os.en;
  await logAction('ORDER_SET_APPLIED',
    `${user.full_name_en} applied order set: ${setLabel} (${os.labs.length} labs, ${os.meds.length} meds, ${os.tasks.length} tasks)`,
    null, patientId, '', '');

  saveDBToIndexedDB();
  closeModal();
  showSuccess(`✅ ${setLabel} ${lang==='ar'?'تم تطبيق البروتوكول':'protocol applied'} — ${os.labs.length} labs, ${os.meds.length} meds`);
}

// ============================================================
// QR WRISTBAND PRINT
// ============================================================
function printWristband(patientId, admissionId) {
  const lang = currentLanguage();
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  const admission = dbGet(`SELECT a.*, d.name_en as dept_en, d.name_ar as dept_ar
    FROM admissions a JOIN departments d ON a.dept_id = d.dept_id
    WHERE a.admission_id = ?`, [admissionId]);
  if (!patient || !admission) return;

  const name = lang==='ar' ? patient.full_name_ar : (patient.full_name_en || patient.full_name_ar);
  const dob = patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('en-GB') : '—';
  const dept = lang==='ar' ? admission.dept_ar : admission.dept_en;
  const admitted = admission.admitted_at ? new Date(admission.admitted_at).toLocaleDateString('en-GB') : '—';
  const allergies = dbAll('SELECT allergen FROM patient_allergies WHERE patient_id = ?', [patientId]);
  const allergyText = allergies.length ? allergies.map(a=>a.allergen).join(', ') : (lang==='ar'?'لا توجد':'None');
  const commDiseases = dbAll("SELECT condition_code FROM patient_conditions WHERE patient_id = ? AND category = 'communicable'", [patientId]);
  const commText = commDiseases.length ? commDiseases.map(c => COMMUNICABLE_DISEASES[c.condition_code] ? COMMUNICABLE_DISEASES[c.condition_code].en : c.condition_code).join(', ') : null;
  const ecName = patient.emergency_contact_name || patient.emergency_contact;
  const ecPhone = patient.emergency_contact_phone;

  // Simple barcode-like visual using MRN characters
  const barcodeHtml = patient.mrn.split('').map(c =>
    `<div style="display:inline-block;width:${2+Math.random()*3}px;height:40px;background:#000;margin:0 1px;vertical-align:bottom;"></div>`
  ).join('') + `<div style="font-size:10px;text-align:center;letter-spacing:3px;margin-top:2px;">${patient.mrn}</div>`;

  const wristbandHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Wristband — ${patient.mrn}</title>
      <style>
        @page { size: 25cm 10cm; margin: 0; }
        body { margin: 0; font-family: Arial, sans-serif; }
        .wristband {
          width: 24cm; height: 8.5cm;
          border: 2px solid #333;
          border-radius: 12px;
          padding: 10px 16px;
          display: flex;
          align-items: stretch;
          gap: 10px;
          margin: 5mm;
          box-sizing: border-box;
          background: #fff;
        }
        .wb-main { flex: 1; }
        .wb-name { font-size: 22px; font-weight: 900; margin-bottom: 4px; }
        .wb-mrn { font-size: 18px; color: #007bff; font-weight: 700; margin-bottom: 6px; }
        .wb-row { font-size: 13px; margin-bottom: 3px; }
        .wb-allergy { background: #dc3545; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 700; margin-top: 6px; display: inline-block; }
        .wb-barcode { text-align: center; padding: 8px; border-left: 2px dashed #ccc; display: flex; flex-direction: column; justify-content: center; min-width: 80px; }
        .wb-hospital { font-size: 11px; color: #666; text-align: center; margin-top: 8px; }
        @media print { body { -webkit-print-color-adjust: exact; } }
      </style>
    </head>
    <body>
      <div class="wristband">
        <div class="wb-main">
          <div class="wb-name">${name}</div>
          <div class="wb-mrn">MRN: ${patient.mrn}</div>
          <div class="wb-row">📅 DOB: ${dob}</div>
          <div class="wb-row">🛏️ ${lang==='ar'?'السرير':'Bed'}: ${admission.bed_number || '—'} &nbsp;|&nbsp; 🏥 ${dept}</div>
          <div class="wb-row">📅 ${lang==='ar'?'تاريخ الدخول':'Admitted'}: ${admitted}</div>
          ${patient.blood_type && patient.blood_type !== 'unknown' ? `<div class="wb-row">🩸 ${lang==='ar'?'فصيلة الدم':'Blood Type'}: <strong>${patient.blood_type}</strong></div>` : ''}
          <div class="wb-allergy">⚠️ ${lang==='ar'?'الحساسية':'Allergy'}: ${allergyText}</div>
          ${commText ? `<div class="wb-allergy" style="background:#7c3aed;margin-top:4px;">&#128252; ${lang==='ar'?'أمراض معدية':'Communicable'}: ${commText}</div>` : ''}
          ${ecName ? `<div class="wb-row" style="margin-top:4px;">&#128222; ${lang==='ar'?'طوارئ':'EC'}: ${ecName}${ecPhone ? ' — ' + ecPhone : ''}</div>` : ''}
          <div class="wb-hospital">Hospital Information System</div>
        </div>
        <div class="wb-barcode">
          ${barcodeHtml}
        </div>
      </div>
      <script>window.onload = function(){ window.print(); setTimeout(window.close, 500); }<\/script>
    </body>
    </html>
  `;

  const win = window.open('', '_blank', 'width=1000,height=400');
  if (win) {
    win.document.write(wristbandHtml);
    win.document.close();
  } else {
    showError(lang==='ar'?'يرجى السماح بالنوافذ المنبثقة':'Please allow popups for this site');
  }
}

// ============================================================
// CODE BLUE / RAPID RESPONSE
// ============================================================
function showCodeBlueButton() {
  // Floating global button — injected once on login
  if (document.getElementById('code-blue-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'code-blue-fab';
  fab.innerHTML = '🚨 CODE BLUE';
  fab.title = 'Activate Code Blue / Rapid Response';
  fab.onclick = () => showCodeBlueForm();
  document.body.appendChild(fab);
}

function showCodeBlueForm() {
  const lang = currentLanguage();
  const admissions = dbAll(`SELECT a.admission_id, a.bed_number, p.full_name_ar, p.full_name_en, p.mrn
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id
    WHERE a.status='admitted' ORDER BY a.bed_number`);

  showModal(`
    <div style="padding:20px;max-width:480px;text-align:center;">
      <div style="font-size:3rem;animation:criticalPulse 1s infinite;">🚨</div>
      <h2 style="color:#dc3545;font-size:1.6rem;margin:8px 0;">${lang==='ar'?'تفعيل كود الطوارئ':'ACTIVATE EMERGENCY CODE'}</h2>
      <div style="display:flex;gap:10px;justify-content:center;margin:16px 0;flex-wrap:wrap;">
        <button class="btn btn-danger code-type-btn" onclick="selectCodeType('code_blue', this)" style="font-size:1rem;">💙 Code Blue<br><small>Cardiac/Respiratory Arrest</small></button>
        <button class="btn btn-warning code-type-btn" onclick="selectCodeType('rapid_response', this)" style="font-size:1rem;background:#fd7e14;">⚡ Rapid Response<br><small>Acute Deterioration</small></button>
        <button class="btn btn-secondary code-type-btn" onclick="selectCodeType('code_stroke', this)" style="font-size:1rem;">🧠 Code Stroke<br><small>Suspected Stroke</small></button>
      </div>
      <input type="hidden" id="cb-type" value="code_blue">
      <div class="form-group" style="text-align:${lang==='ar'?'right':'left'};">
        <label>${lang==='ar'?'المريض (اختياري)':'Patient (optional)'}</label>
        <select id="cb-patient">
          <option value="">${lang==='ar'?'— تحديد لاحقاً —':'— Identify Later —'}</option>
          ${admissions.map(a => `<option value="${a.admission_id}|${a.mrn}">${escapeHtml(a.bed_number||'?')} — ${lang==='ar'?escapeHtml(a.full_name_ar):escapeHtml(a.full_name_en||a.full_name_ar)} (${escapeHtml(a.mrn)})</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="text-align:${lang==='ar'?'right':'left'};">
        <label>${lang==='ar'?'الموقع':'Location'}</label>
        <input type="text" id="cb-location" placeholder="${lang==='ar'?'مثال: جناح B، غرفة 12':'e.g. Ward B, Room 12'}">
      </div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;">
        <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
        <button class="btn btn-danger" style="font-size:1.1rem;padding:12px 28px;" onclick="activateCodeBlue()">🚨 ${lang==='ar'?'تفعيل الآن':'ACTIVATE NOW'}</button>
      </div>
    </div>
  `);
}

function selectCodeType(type, btn) {
  document.getElementById('cb-type').value = type;
  document.querySelectorAll('.code-type-btn').forEach(b => b.style.outline = 'none');
  btn.style.outline = '3px solid #333';
}

async function activateCodeBlue() {
  const user = getCurrentUser();
  const lang = currentLanguage();
  const type = document.getElementById('cb-type').value;
  const patientVal = document.getElementById('cb-patient').value;
  const location = document.getElementById('cb-location').value.trim();

  let admissionId = null, patientId = null, mrn = '';
  if (patientVal) {
    const parts = patientVal.split('|');
    admissionId = parseInt(parts[0]) || null;
    mrn = parts[1] || '';
    if (admissionId) {
      const adm = dbGet('SELECT patient_id FROM admissions WHERE admission_id=?', [admissionId]);
      if (adm) patientId = adm.patient_id;
    }
  }

  const now = nowISO();
  dbRun(`INSERT INTO code_blue_events (patient_id, admission_id, location, event_type, initiated_by, initiated_at)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [patientId, admissionId, location||null, type, user.user_id, now]);

  const typeLabel = { code_blue:'Code Blue', rapid_response:'Rapid Response', code_stroke:'Code Stroke' }[type] || type;
  await logAction('CODE_BLUE',
    `🚨 ${typeLabel} activated by ${user.full_name_en} at ${location||'unspecified location'}${mrn?' — Patient MRN: '+mrn:''}`,
    null, patientId, '', mrn);

  saveDBToIndexedDB();

  // Broadcast to all tabs
  broadcastUpdate('code_blue_events');

  closeModal();

  // Show full-screen alert WITH intervention timeline (P0 fix from sim)
  const newEventId = dbGet('SELECT event_id FROM code_blue_events ORDER BY event_id DESC LIMIT 1').event_id;
  const alert = document.createElement('div');
  alert.id = 'code-blue-alert';
  alert.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(220,53,69,0.95);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;color:#fff;text-align:center;padding:24px;overflow-y:auto;">
      <div style="font-size:3.5rem;animation:criticalPulse 0.5s infinite;">🚨</div>
      <div style="font-size:2rem;font-weight:900;letter-spacing:2px;margin:8px 0;">${typeLabel.toUpperCase()}</div>
      <div style="font-size:1rem;opacity:0.9;">${location ? (lang==='ar'?'الموقع: ':'Location: ')+location : ''} • ${new Date().toLocaleTimeString()}</div>

      <div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:16px;margin-top:16px;width:100%;max-width:560px;">
        <div style="font-weight:700;margin-bottom:10px;font-size:1.05rem;">${lang==='ar'?'سجّل التوقيتات أثناء الإنعاش (اضغط عند حدوث كل تدخل)':'Log timestamps as interventions happen (tap when each occurs)'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button id="cb-ts-cpr"   onclick="logCBTimestamp(${newEventId}, 'cpr_started_at', this)" style="background:#fff;color:#dc3545;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;font-size:0.9rem;">▶ ${lang==='ar'?'بدء الإنعاش (CPR)':'Start CPR'}</button>
          <button id="cb-ts-epi"   onclick="logCBTimestamp(${newEventId}, 'first_epinephrine_at', this)" style="background:#fff;color:#dc3545;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;font-size:0.9rem;">💉 ${lang==='ar'?'أول أدرينالين':'First Epinephrine'}</button>
          <button id="cb-ts-defib" onclick="logCBTimestamp(${newEventId}, 'defibrillation_at', this)" style="background:#fff;color:#dc3545;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;font-size:0.9rem;">⚡ ${lang==='ar'?'صدمة كهربائية':'Defibrillation'}</button>
          <button id="cb-ts-intub" onclick="logCBTimestamp(${newEventId}, 'intubation_at', this)" style="background:#fff;color:#dc3545;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;font-size:0.9rem;">🫁 ${lang==='ar'?'تنبيب':'Intubation'}</button>
          <button id="cb-ts-rosc"  onclick="logCBTimestamp(${newEventId}, 'rosc_at', this)" style="grid-column:1/-1;background:#10b981;color:#fff;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;font-size:0.9rem;">💚 ${lang==='ar'?'عودة الدورة الدموية (ROSC)':'ROSC (Return of Spontaneous Circulation)'}</button>
        </div>
        <p style="font-size:0.75rem;margin-top:8px;opacity:0.85;">${lang==='ar'?'كل ضغطة تسجّل التوقيت الحالي تلقائياً في السجل الطبي.':'Each tap auto-records current time to the medical record.'}</p>
      </div>

      <button onclick="resolveCodeBlue()" style="margin-top:20px;background:#fff;color:#dc3545;border:none;padding:14px 32px;border-radius:8px;font-size:1.05rem;font-weight:700;cursor:pointer;">
        ✓ ${lang==='ar'?'تم الحل':'Mark Resolved'}
      </button>
    </div>
  `;
  document.body.appendChild(alert);
}

async function logCBTimestamp(eventId, column, btn) {
  const lang = currentLanguage();
  // `column` is interpolated into the SQL below, so whitelist it — never trust
  // the identifier even though every caller currently passes a hardcoded literal.
  const CB_TIMESTAMP_COLUMNS = ['cpr_started_at', 'first_epinephrine_at', 'defibrillation_at', 'intubation_at', 'rosc_at'];
  if (!CB_TIMESTAMP_COLUMNS.includes(column)) {
    console.error('[logCBTimestamp] rejected unknown column:', column);
    return;
  }
  // Check if already logged
  const existing = dbGet(`SELECT ${column} FROM code_blue_events WHERE event_id = ?`, [eventId]);
  if (existing && existing[column]) {
    showError(lang === 'ar' ? 'سُجّل مسبقاً في ' + existing[column].slice(11, 19) : 'Already logged at ' + existing[column].slice(11, 19));
    return;
  }
  const now = nowISO();
  dbRun(`UPDATE code_blue_events SET ${column} = ? WHERE event_id = ?`, [now, eventId]);
  const user = getCurrentUser();
  await logAction('CODE_BLUE_INTERVENTION',
    `${user.full_name_en} logged ${column.replace('_at','').replace(/_/g,' ').toUpperCase()} at ${now.slice(11, 19)} for code blue ${eventId}`);
  saveDBToIndexedDB();
  if (btn) {
    btn.style.background = '#10b981';
    btn.style.color = '#fff';
    btn.innerHTML = '✓ ' + (btn.innerText || btn.textContent) + '  @' + now.slice(11, 19);
    btn.disabled = true;
    btn.style.opacity = '0.7';
  }
}

function resolveCodeBlue() {
  const lang = currentLanguage();
  const alert = document.getElementById('code-blue-alert');
  if (alert) alert.remove();

  // Update last code blue event with resolved time
  const lastEvent = dbGet(`SELECT event_id FROM code_blue_events ORDER BY event_id DESC LIMIT 1`);
  if (lastEvent) {
    showModal(`
      <div style="padding:20px;max-width:420px;">
        <h2>✅ ${lang==='ar'?'إغلاق الحالة':'Resolve Code'}</h2>
        <div class="form-group">
          <label>${lang==='ar'?'النتيجة':'Outcome'}</label>
          <select id="cb-outcome">
            <option value="resuscitated">${lang==='ar'?'تم الإنعاش':'Resuscitated / Stabilized'}</option>
            <option value="transferred_icu">${lang==='ar'?'نقل إلى العناية المركزة':'Transferred to ICU'}</option>
            <option value="false_alarm">${lang==='ar'?'إنذار كاذب':'False Alarm'}</option>
            <option value="deceased">${lang==='ar'?'وفاة':'Deceased'}</option>
            <option value="other">${lang==='ar'?'أخرى':'Other'}</option>
          </select>
        </div>
        <div class="form-group">
          <label>${lang==='ar'?'ملاحظات':'Notes'}</label>
          <textarea id="cb-notes" rows="3" style="width:100%;"></textarea>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
          <button class="btn btn-primary" onclick="saveCodeBlueOutcome(${lastEvent.event_id})">${lang==='ar'?'حفظ':'Save'}</button>
        </div>
      </div>
    `);
  }
}

async function saveCodeBlueOutcome(eventId) {
  const outcome = document.getElementById('cb-outcome')?.value;
  const notes = document.getElementById('cb-notes')?.value.trim()||'';
  dbRun(`UPDATE code_blue_events SET outcome=?, notes=?, resolved_at=? WHERE event_id=?`,
    [outcome, notes||null, nowISO(), eventId]);
  saveDBToIndexedDB();
  closeModal();
  showSuccess(currentLanguage()==='ar'?'تم إغلاق الحالة':'Code event closed');
}

// ============================================================
// VITAL SIGNS TREND CHART (Canvas sparkline)
// ============================================================
function renderVitalsChart(admissionId, containerId) {
  const vitals = dbAll(`SELECT * FROM vitals_log WHERE admission_id=? ORDER BY recorded_at ASC LIMIT 20`, [admissionId]);
  if (vitals.length < 2) return; // need at least 2 points

  const container = document.getElementById(containerId);
  if (!container) return;

  const W = container.clientWidth || 500;
  const H = 160;
  const PAD = { top: 20, right: 20, bottom: 30, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = '100%';
  container.innerHTML = '';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Series definitions
  const series = [
    { key: 'bp_systolic',  color: '#dc3545', label: 'SBP',  min: 60,  max: 200 },
    { key: 'heart_rate',   color: '#007bff', label: 'HR',   min: 40,  max: 160 },
    { key: 'o2_sat',       color: '#28a745', label: 'SpO₂', min: 80,  max: 100 },
    { key: 'temperature',  color: '#fd7e14', label: 'Temp', min: 34,  max: 41 },
  ];

  // Background
  ctx.fillStyle = '#f8f9fa';
  ctx.roundRect(0, 0, W, H, 8);
  ctx.fill();

  // Grid lines
  ctx.strokeStyle = '#dee2e6';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (plotH / 4) * i;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
  }

  // X axis labels (time)
  ctx.fillStyle = '#6c757d';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  vitals.forEach((v, i) => {
    if (i % Math.max(1, Math.floor(vitals.length / 5)) !== 0) return;
    const x = PAD.left + (i / (vitals.length - 1)) * plotW;
    const label = new Date(v.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    ctx.fillText(label, x, H - 5);
  });

  // Draw each series
  series.forEach(s => {
    const pts = vitals.map((v, i) => {
      const val = parseFloat(v[s.key]);
      if (isNaN(val)) return null;
      const x = PAD.left + (i / (vitals.length - 1)) * plotW;
      const y = PAD.top + plotH - ((val - s.min) / (s.max - s.min)) * plotH;
      return { x, y, val };
    }).filter(Boolean);

    if (pts.length < 1) return;

    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Dots
    pts.forEach(p => {
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    });
  });

  // Legend
  let lx = PAD.left;
  series.forEach(s => {
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, PAD.top - 14, 10, 10);
    ctx.fillStyle = '#333';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(s.label, lx + 13, PAD.top - 5);
    lx += 60;
  });
}

// ============================================================
// PATIENT CLINICAL TIMELINE
// ============================================================
function showPatientTimeline(patientId, admissionId) {
  const lang = currentLanguage();

  // Gather all clinical events
  const events = [];

  const admission = dbGet(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id
    WHERE a.admission_id=?`, [admissionId]);
  if (admission) events.push({ ts: admission.admitted_at, icon: '🏥', type: 'admission',
    text_en: `Admitted — ${admission.chief_complaint||''}`,
    text_ar: `دخول — ${admission.chief_complaint||''}`, color: '#007bff' });

  dbAll(`SELECT * FROM vitals_log WHERE admission_id=? ORDER BY recorded_at`, [admissionId]).forEach(v => {
    const news = v.news2_score;
    const newsTxt = news != null ? ` (NEWS2: ${news})` : '';
    events.push({ ts: v.recorded_at, icon: '❤️', type: 'vitals',
      text_en: `Vitals: BP ${v.bp_systolic||'—'}/${v.bp_diastolic||'—'} HR ${v.heart_rate||'—'} Temp ${v.temperature||'—'} SpO₂ ${v.o2_sat||'—'}%${newsTxt}`,
      text_ar: `علامات حيوية: ضغط ${v.bp_systolic||'—'}/${v.bp_diastolic||'—'} نبض ${v.heart_rate||'—'} حرارة ${v.temperature||'—'}${newsTxt}`,
      color: news >= 7 ? '#dc3545' : news >= 5 ? '#fd7e14' : '#6c757d' });
  });

  dbAll(`SELECT lo.*, u.full_name_en FROM lab_orders lo LEFT JOIN users u ON lo.doctor_id=u.user_id WHERE lo.admission_id=? ORDER BY lo.ordered_at`, [admissionId]).forEach(l => {
    events.push({ ts: l.ordered_at, icon: '🧪', type: 'lab',
      text_en: `Lab ordered: ${l.test_name} (${l.priority})`,
      text_ar: `طلب فحص: ${l.test_name}`, color: '#17a2b8' });
    if (l.resulted_at) events.push({ ts: l.resulted_at, icon: l.is_critical?'🚨':'📋', type: 'lab_result',
      text_en: `Result: ${l.test_name} = ${l.result_value||'—'} ${l.result_unit||''}${l.is_critical?' ⚠️ CRITICAL':''}`,
      text_ar: `نتيجة: ${l.test_name} = ${l.result_value||'—'}${l.is_critical?' ⚠️ حرج':''}`,
      color: l.is_critical ? '#dc3545' : '#28a745' });
  });

  dbAll(`SELECT rx.*, u.full_name_en FROM prescriptions rx LEFT JOIN users u ON rx.doctor_id=u.user_id WHERE rx.admission_id=? ORDER BY rx.prescribed_at`, [admissionId]).forEach(rx => {
    events.push({ ts: rx.prescribed_at, icon: '💊', type: 'rx',
      text_en: `Prescribed: ${rx.drug_name} ${rx.dose} ${rx.route} ${rx.frequency}`,
      text_ar: `وصفة: ${rx.drug_name} ${rx.dose}`, color: '#6f42c1' });
  });

  dbAll(`SELECT ca.*, u.full_name_en FROM consultations ca JOIN users u ON ca.doctor_id=u.user_id WHERE ca.admission_id=? ORDER BY ca.created_at`, [admissionId]).forEach(c => {
    events.push({ ts: c.created_at, icon: '👨‍⚕️', type: 'consult',
      text_en: `Consultation (${c.consult_type}): ${(c.assessment||'').substring(0,80)}`,
      text_ar: `استشارة (${c.consult_type}): ${(c.assessment||'').substring(0,80)}`, color: '#20c997' });
  });

  dbAll(`SELECT nt.*, u.full_name_en FROM nursing_tasks nt JOIN users u ON nt.nurse_id=u.user_id WHERE nt.admission_id=? ORDER BY nt.done_at`, [admissionId]).forEach(nt => {
    if (nt.task_type === 'handover_note' || nt.task_type === 'order_set_task') return;
    events.push({ ts: nt.done_at, icon: '🩺', type: 'task',
      text_en: `Nursing: ${(LANG['task_'+nt.task_type]?.en||nt.task_type)}${nt.notes?' — '+nt.notes.substring(0,60):''}`,
      text_ar: `تمريض: ${(LANG['task_'+nt.task_type]?.ar||nt.task_type)}`, color: '#fd7e14' });
  });

  dbAll(`SELECT * FROM clinical_assessments WHERE admission_id=? ORDER BY assessed_at`, [admissionId]).forEach(ca => {
    const typeLabel = { braden:'Braden', morse:'Morse Fall', gcs:'GCS', pain:'Pain NRS' }[ca.assess_type]||ca.assess_type;
    events.push({ ts: ca.assessed_at, icon: '📊', type: 'assessment',
      text_en: `Assessment: ${typeLabel} = ${ca.score} (${ca.risk_level})`,
      text_ar: `تقييم: ${typeLabel} = ${ca.score} (${ca.risk_level})`, color: '#e83e8c' });
  });

  if (admission?.discharged_at) {
    events.push({ ts: admission.discharged_at, icon: '🏠', type: 'discharge',
      text_en: 'Patient discharged', text_ar: 'خروج المريض', color: '#28a745' });
  }

  // Sort by timestamp
  events.sort((a, b) => (a.ts||'') < (b.ts||'') ? -1 : 1);

  const name = lang==='ar' ? admission?.full_name_ar : (admission?.full_name_en||admission?.full_name_ar||'');
  showModal(`
    <div style="padding:20px;max-width:640px;max-height:80vh;overflow-y:auto;">
      <h2>📅 ${lang==='ar'?'السجل الزمني للمريض':'Clinical Timeline'} — ${escapeHtml(name||'')}</h2>
      <div class="clinical-timeline">
        ${events.length === 0 ? `<p>${t('no_data')}</p>` :
          events.map(ev => `
            <div class="ct-event">
              <div class="ct-dot" style="background:${ev.color};"></div>
              <div class="ct-content">
                <div class="ct-time">${ev.ts ? formatDateTime(ev.ts) : '—'}</div>
                <div class="ct-text">${ev.icon} ${escapeHtml(lang==='ar'?ev.text_ar:ev.text_en)}</div>
              </div>
            </div>
          `).join('')}
      </div>
      <div style="text-align:right;margin-top:16px;">
        <button class="btn btn-secondary" onclick="closeModal()">${t('close_btn')||'Close'}</button>
      </div>
    </div>
  `);
}

// ============================================================
// MEDICATION RECONCILIATION
// ============================================================
function showMedReconciliation(patientId, admissionId) {
  const lang = currentLanguage();
  const patient = dbGet('SELECT * FROM patients WHERE patient_id=?', [patientId]);
  const homeMeds = dbAll(`SELECT hm.*, u.full_name_en FROM home_medications hm
    JOIN users u ON hm.recorded_by=u.user_id
    WHERE hm.patient_id=? ORDER BY hm.recorded_at`, [patientId]);
  const activeRx = dbAll(`SELECT * FROM prescriptions WHERE admission_id=? AND status='active'`, [admissionId]);

  const name = lang==='ar' ? patient?.full_name_ar : (patient?.full_name_en||patient?.full_name_ar||'');

  showModal(`
    <div style="padding:20px;max-width:680px;max-height:80vh;overflow-y:auto;">
      <h2>💊 ${lang==='ar'?'مطابقة الأدوية':'Medication Reconciliation'} — ${escapeHtml(name||'')}</h2>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0;">
        <div>
          <h4 style="color:#6f42c1;border-bottom:2px solid #6f42c1;padding-bottom:6px;">${lang==='ar'?'أدوية المنزل':'Home Medications'}</h4>
          ${homeMeds.length === 0 ? `<p style="color:#999;font-size:0.9rem;">${lang==='ar'?'لم يتم التوثيق بعد':'Not documented yet'}</p>` :
            homeMeds.map(m => `
              <div class="hm-card ${m.reconciled ? 'hm-reconciled' : ''}">
                <div style="font-weight:600;">${escapeHtml(m.drug_name)}</div>
                <div style="font-size:0.85rem;color:#555;">${m.dose||'—'} ${m.route||''} ${m.frequency||''}</div>
                ${m.reason ? `<div style="font-size:0.8rem;color:#888;">${lang==='ar'?'لـ':'For:'} ${escapeHtml(m.reason)}</div>` : ''}
                ${m.reconciled
                  ? `<span class="badge badge-success" style="margin-top:4px;">✓ ${m.reconcile_action||'Reconciled'}</span>`
                  : `<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">
                      <button class="btn btn-sm btn-success" onclick="reconcileMed(${m.hm_id}, 'continue', ${admissionId})">${lang==='ar'?'استمرار':'Continue'}</button>
                      <button class="btn btn-sm btn-warning" onclick="reconcileMed(${m.hm_id}, 'modified', ${admissionId})">${lang==='ar'?'تعديل':'Modify'}</button>
                      <button class="btn btn-sm btn-danger" onclick="reconcileMed(${m.hm_id}, 'hold', ${admissionId})">${lang==='ar'?'إيقاف':'Hold'}</button>
                    </div>`
                }
              </div>
            `).join('')}
          <button class="btn btn-sm btn-primary" style="margin-top:10px;" onclick="showAddHomeMedForm(${patientId}, ${admissionId})">
            + ${lang==='ar'?'إضافة دواء منزلي':'Add Home Med'}
          </button>
        </div>
        <div>
          <h4 style="color:#007bff;border-bottom:2px solid #007bff;padding-bottom:6px;">${lang==='ar'?'الأدوية الحالية في المستشفى':'Current Inpatient Meds'}</h4>
          ${activeRx.length === 0 ? `<p style="color:#999;font-size:0.9rem;">${lang==='ar'?'لا توجد وصفات نشطة':'No active prescriptions'}</p>` :
            activeRx.map(rx => `
              <div class="hm-card">
                <div style="font-weight:600;">${escapeHtml(rx.drug_name)}</div>
                <div style="font-size:0.85rem;color:#555;">${escapeHtml(rx.dose)} ${rx.route} ${rx.frequency}</div>
                <span class="badge badge-success">Active</span>
              </div>
            `).join('')}
        </div>
      </div>
      <div style="text-align:right;">
        <button class="btn btn-secondary" onclick="closeModal()">${t('close_btn')||'Close'}</button>
      </div>
    </div>
  `);
}

async function reconcileMed(hmId, action, admissionId) {
  const user = getCurrentUser();
  dbRun(`UPDATE home_medications SET reconciled=1, reconcile_action=?, reconciled_by=?, reconciled_at=? WHERE hm_id=?`,
    [action, user.user_id, nowISO(), hmId]);
  saveDBToIndexedDB();
  // Refresh the modal
  const hm = dbGet('SELECT patient_id FROM home_medications WHERE hm_id=?', [hmId]);
  if (hm) showMedReconciliation(hm.patient_id, admissionId);
}

function showAddHomeMedForm(patientId, admissionId) {
  const lang = currentLanguage();
  closeModal();
  setTimeout(() => showModal(`
    <div style="padding:20px;max-width:420px;">
      <h2>+ ${lang==='ar'?'إضافة دواء منزلي':'Add Home Medication'}</h2>
      <div class="form-group">
        <label>${lang==='ar'?'اسم الدواء *':'Drug Name *'}</label>
        <input type="text" id="hm-drug" placeholder="${lang==='ar'?'مثال: أسبرين':'e.g. Aspirin'}">
      </div>
      <div class="form-row">
        <div class="form-group"><label>${lang==='ar'?'الجرعة':'Dose'}</label><input type="text" id="hm-dose" placeholder="81mg"></div>
        <div class="form-group"><label>${lang==='ar'?'الطريق':'Route'}</label>
          <select id="hm-route">
            <option value="oral">${lang==='ar'?'فموي':'Oral'}</option>
            <option value="iv">IV</option>
            <option value="topical">${lang==='ar'?'موضعي':'Topical'}</option>
            <option value="inhaled">${lang==='ar'?'استنشاق':'Inhaled'}</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>${lang==='ar'?'التكرار':'Frequency'}</label>
        <select id="hm-freq">
          <option value="once_daily">${lang==='ar'?'مرة يومياً':'Once daily'}</option>
          <option value="twice_daily">${lang==='ar'?'مرتين يومياً':'Twice daily'}</option>
          <option value="three_times_daily">${lang==='ar'?'ثلاث مرات يومياً':'Three times daily'}</option>
          <option value="as_needed">${lang==='ar'?'عند الحاجة':'As needed'}</option>
        </select>
      </div>
      <div class="form-group"><label>${lang==='ar'?'السبب/الإشارة':'Reason / Indication'}</label><input type="text" id="hm-reason"></div>
      <div class="form-group"><label>${lang==='ar'?'الطبيب الواصف':'Prescriber'}</label><input type="text" id="hm-prescriber" placeholder="${lang==='ar'?'طبيب العيادة الخارجية':'Outpatient physician'}"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
        <button class="btn btn-primary" onclick="saveHomeMed(${patientId}, ${admissionId})">${t('save_btn')}</button>
      </div>
    </div>
  `), 150);
}

async function saveHomeMed(patientId, admissionId) {
  const user = getCurrentUser();
  const drugName = document.getElementById('hm-drug')?.value.trim();
  if (!drugName) { showError(currentLanguage()==='ar'?'اسم الدواء مطلوب':'Drug name required'); return; }
  const dose = document.getElementById('hm-dose')?.value.trim()||null;
  const route = document.getElementById('hm-route')?.value;
  const freq = document.getElementById('hm-freq')?.value;
  const reason = document.getElementById('hm-reason')?.value.trim()||null;
  const prescriber = document.getElementById('hm-prescriber')?.value.trim()||null;

  dbRun(`INSERT INTO home_medications (patient_id, admission_id, drug_name, dose, route, frequency, reason, prescriber, recorded_by, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [patientId, admissionId, drugName, dose, route, freq, reason, prescriber, user.user_id, nowISO()]);

  saveDBToIndexedDB();
  closeModal();
  setTimeout(() => showMedReconciliation(patientId, admissionId), 150);
}

// ============================================================
// PATIENT PORTAL — Patient self-service views
// ============================================================

function renderPPOverview(main, lang) {
  const patient = getCurrentPatient();
  if (!patient) { main.innerHTML = `<div class="empty-state"><p>${t('patient_login_required')}</p></div>`; return; }

  // Get latest visit/admission
  const activeAdm = dbGet(`SELECT a.*, d.name_ar as dept_ar, d.name_en as dept_en
    FROM admissions a LEFT JOIN departments d ON a.dept_id = d.dept_id
    WHERE a.patient_id = ? AND a.status='active' ORDER BY a.admitted_at DESC LIMIT 1`, [patient.patient_id]);

  // Count various items
  const labCount     = dbGet(`SELECT COUNT(*) as c FROM lab_orders lo JOIN admissions a ON lo.admission_id=a.admission_id WHERE a.patient_id = ? AND lo.status='resulted'`, [patient.patient_id]);
  const rxCount      = dbGet(`SELECT COUNT(*) as c FROM prescriptions p JOIN admissions a ON p.admission_id=a.admission_id WHERE a.patient_id = ? AND p.status='active'`, [patient.patient_id]);
  const apptCount    = dbGet(`SELECT COUNT(*) as c FROM appointments WHERE national_id = ? AND status='scheduled' AND appt_date >= ?`,
    [patient.national_id || '__none__', new Date().toISOString().substring(0,10)]);
  const unreadMsgs   = dbGet(`SELECT COUNT(*) as c FROM portal_messages WHERE patient_id = ? AND from_type='staff' AND read_at IS NULL`, [patient.patient_id]);

  // Allergies & conditions
  const allergies = dbAll(`SELECT * FROM patient_allergies WHERE patient_id = ?`, [patient.patient_id]);
  const conditions = dbAll(`SELECT * FROM patient_conditions WHERE patient_id = ?`, [patient.patient_id]);

  const greeting = lang === 'ar'
    ? `مرحباً، ${patient.full_name_ar.split(' ')[0]}!`
    : `Welcome back, ${(patient.full_name_en || patient.full_name_ar).split(' ')[0]}!`;

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="font-size:1.6rem">&#128075; ${escapeHtml(greeting)}</h1>
        <p style="color:#6b7280;margin-top:4px">
          ${lang==='ar' ? `الرقم الطبي: <strong>${escapeHtml(patient.mrn)}</strong>` : `Medical Record Number: <strong>${escapeHtml(patient.mrn)}</strong>`}
        </p>
      </div>
    </div>

    ${activeAdm ? `
      <div class="card" style="background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;border:none;margin-bottom:16px">
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <div style="opacity:0.9;font-size:0.85rem;margin-bottom:4px">${lang==='ar'?'أنت حالياً في:':'You are currently admitted to:'}</div>
              <div style="font-size:1.4rem;font-weight:700">${escapeHtml(lang==='ar'?activeAdm.dept_ar:activeAdm.dept_en)}</div>
              ${activeAdm.bed_number ? `<div style="opacity:0.9;font-size:0.9rem;margin-top:4px">${lang==='ar'?'السرير:':'Bed:'} <strong>${escapeHtml(activeAdm.bed_number)}</strong></div>` : ''}
            </div>
            <div style="text-align:right">
              <div style="opacity:0.9;font-size:0.85rem">${lang==='ar'?'تاريخ الدخول':'Admitted'}</div>
              <div style="font-size:1.1rem;font-weight:600">${escapeHtml(activeAdm.admitted_at.substring(0,10))}</div>
            </div>
          </div>
        </div>
      </div>
    ` : ''}

    <div class="stats-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px">
      <div class="stat-card" style="cursor:pointer" onclick="navigateTo('pp-labs')">
        <div style="font-size:2rem;margin-bottom:4px">&#128300;</div>
        <div style="font-size:1.4rem;font-weight:700">${labCount?labCount.c:0}</div>
        <div style="color:#6b7280;font-size:0.85rem">${lang==='ar'?'نتائج المختبر':'Lab Results'}</div>
      </div>
      <div class="stat-card" style="cursor:pointer" onclick="navigateTo('pp-prescriptions')">
        <div style="font-size:2rem;margin-bottom:4px">&#128138;</div>
        <div style="font-size:1.4rem;font-weight:700">${rxCount?rxCount.c:0}</div>
        <div style="color:#6b7280;font-size:0.85rem">${lang==='ar'?'الأدوية النشطة':'Active Medications'}</div>
      </div>
      <div class="stat-card" style="cursor:pointer" onclick="navigateTo('pp-appointments')">
        <div style="font-size:2rem;margin-bottom:4px">&#128197;</div>
        <div style="font-size:1.4rem;font-weight:700">${apptCount?apptCount.c:0}</div>
        <div style="color:#6b7280;font-size:0.85rem">${lang==='ar'?'مواعيد قادمة':'Upcoming Appointments'}</div>
      </div>
      <div class="stat-card" style="cursor:pointer" onclick="navigateTo('pp-messages')">
        <div style="font-size:2rem;margin-bottom:4px">&#128172;</div>
        <div style="font-size:1.4rem;font-weight:700">${unreadMsgs?unreadMsgs.c:0}</div>
        <div style="color:#6b7280;font-size:0.85rem">${lang==='ar'?'رسائل غير مقروءة':'Unread Messages'}</div>
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-header"><h3>&#129505; ${lang==='ar'?'معلوماتي الصحية الأساسية':'My Health Summary'}</h3></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px">
          <div><div style="color:#6b7280;font-size:0.8rem">${lang==='ar'?'تاريخ الميلاد':'Date of Birth'}</div><div style="font-weight:600">${escapeHtml(patient.date_of_birth||'—')}</div></div>
          <div><div style="color:#6b7280;font-size:0.8rem">${lang==='ar'?'الجنس':'Gender'}</div><div style="font-weight:600">${escapeHtml(patient.gender||'—')}</div></div>
          <div><div style="color:#6b7280;font-size:0.8rem">${lang==='ar'?'فصيلة الدم':'Blood Type'}</div><div style="font-weight:600;color:#dc2626">${escapeHtml(patient.blood_type||'—')}</div></div>
          <div><div style="color:#6b7280;font-size:0.8rem">${lang==='ar'?'الهاتف':'Phone'}</div><div style="font-weight:600">${escapeHtml(patient.phone||'—')}</div></div>
          <div><div style="color:#6b7280;font-size:0.8rem">${lang==='ar'?'الوزن':'Weight'}</div><div style="font-weight:600">${patient.weight_kg?patient.weight_kg+' kg':'—'}</div></div>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
      <div class="card">
        <div class="card-header" style="background:#fef2f2;border-bottom:2px solid #fecaca">
          <h3>&#9888;&#65039; ${lang==='ar'?'الحساسيات':'Allergies'}</h3>
        </div>
        <div class="card-body">
          ${allergies.length === 0
            ? `<p style="color:#6b7280">${lang==='ar'?'لا توجد حساسيات مسجلة':'No known allergies'}</p>`
            : allergies.map(a => `
              <div style="padding:8px;border-left:4px solid #dc2626;background:#fef2f2;border-radius:4px;margin-bottom:6px">
                <div style="font-weight:600;color:#7f1d1d">${escapeHtml(a.allergen)}</div>
                ${a.reaction ? `<div style="font-size:0.85rem;color:#991b1b">${escapeHtml(a.reaction)}</div>` : ''}
                ${a.severity ? `<span class="badge badge-danger" style="margin-top:4px">${escapeHtml(a.severity)}</span>` : ''}
              </div>`).join('')
          }
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>&#129656; ${lang==='ar'?'حالاتي الطبية':'My Conditions'}</h3></div>
        <div class="card-body">
          ${conditions.length === 0
            ? `<p style="color:#6b7280">${lang==='ar'?'لا توجد حالات مزمنة مسجلة':'No chronic conditions on record'}</p>`
            : conditions.map(c => {
                const cd = (typeof CONDITIONS !== 'undefined' && CONDITIONS[c.condition_code])
                  ? CONDITIONS[c.condition_code][lang]
                  : c.condition_code;
                return `<div style="padding:6px 0;border-bottom:1px solid #f3f4f6">
                  <span style="font-weight:500">${escapeHtml(cd)}</span>
                  ${c.severity ? `<span class="badge badge-warning" style="margin-left:8px">${escapeHtml(c.severity)}</span>` : ''}
                </div>`;
              }).join('')
          }
        </div>
      </div>
    </div>
  `;
}

function renderPPVisits(main, lang) {
  const patient = getCurrentPatient();
  if (!patient) { main.innerHTML = `<div class="empty-state"><p>${t('patient_login_required')}</p></div>`; return; }

  const visits = dbAll(`
    SELECT a.*, d.name_ar as dept_ar, d.name_en as dept_en
    FROM admissions a
    LEFT JOIN departments d ON a.dept_id = d.dept_id
    WHERE a.patient_id = ?
    ORDER BY a.admitted_at DESC
  `, [patient.patient_id]);

  main.innerHTML = `
    <div class="page-header"><h1>&#128196; ${t('pp_visits')}</h1></div>
    ${visits.length === 0 ? `<div class="empty-state"><p>${lang==='ar'?'لا توجد زيارات سابقة':'No previous visits'}</p></div>` : `
      <div style="display:flex;flex-direction:column;gap:12px">
        ${visits.map(v => `
          <div class="card">
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
                <div>
                  <div style="font-size:1.2rem;font-weight:600">${escapeHtml(lang==='ar'?v.dept_ar:v.dept_en)}</div>
                  ${v.bed_number ? `<div style="color:#6b7280;font-size:0.9rem;margin-top:4px">${lang==='ar'?'السرير':'Bed'}: ${escapeHtml(v.bed_number)}</div>` : ''}
                </div>
                <div style="text-align:right">
                  <span class="badge ${v.status==='active'?'badge-success':'badge-secondary'}">
                    ${v.status==='active' ? (lang==='ar'?'منوّم حالياً':'Currently Admitted') : (lang==='ar'?'مخرّج':'Discharged')}
                  </span>
                </div>
              </div>
              <hr style="margin:12px 0">
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
                <div><div style="color:#6b7280;font-size:0.75rem">${lang==='ar'?'تاريخ الدخول':'Admitted'}</div><div style="font-weight:600">${escapeHtml(v.admitted_at.substring(0,16).replace('T',' '))}</div></div>
                ${v.discharged_at ? `<div><div style="color:#6b7280;font-size:0.75rem">${lang==='ar'?'تاريخ الخروج':'Discharged'}</div><div style="font-weight:600">${escapeHtml(v.discharged_at.substring(0,16).replace('T',' '))}</div></div>` : ''}
              </div>
              ${v.chief_complaint ? `<div style="margin-top:12px;padding:8px;background:#f9fafb;border-radius:6px">
                <div style="color:#6b7280;font-size:0.75rem;margin-bottom:2px">${lang==='ar'?'الشكوى الرئيسية':'Chief Complaint'}</div>
                <div>${escapeHtml(v.chief_complaint)}</div>
              </div>` : ''}
              ${v.initial_diagnosis ? `<div style="margin-top:8px;padding:8px;background:#f0f9ff;border-radius:6px;border-left:4px solid #0ea5e9">
                <div style="color:#0c4a6e;font-size:0.75rem;margin-bottom:2px">${lang==='ar'?'التشخيص':'Diagnosis'}</div>
                <div>${escapeHtml(v.initial_diagnosis)}</div>
              </div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

// Plain-English lab interpretation (patient-friendly)
function ppInterpretLab(testName, flag, value, lang) {
  if (!flag || flag === 'normal') {
    return lang === 'ar'
      ? '<span style="color:#10b981;">&check; نتيجتك ضمن المعدل الطبيعي. لا حاجة للقلق.</span>'
      : '<span style="color:#10b981;">&check; Your result is within the normal range. No action needed.</span>';
  }
  const isCritical = /critical/i.test(flag);
  const isHigh = /high/i.test(flag);
  const isLow  = /low/i.test(flag);
  const tName = (testName || '').toUpperCase();

  // Test-specific friendly explanations
  if (/HEMOGLOBIN|HB|HGB/.test(tName)) {
    if (isLow) return lang === 'ar' ? '<span style="color:#f59e0b;">⚠ هيموغلوبين منخفض — قد يشير لفقر دم. قد تشعر بإرهاق. ناقش مع طبيبك.</span>' : '<span style="color:#f59e0b;">⚠ Low hemoglobin — could mean anemia. May cause fatigue. Discuss with your doctor.</span>';
    if (isHigh) return lang === 'ar' ? '<span style="color:#f59e0b;">⚠ هيموغلوبين مرتفع — قد يحتاج فحوصات إضافية.</span>' : '<span style="color:#f59e0b;">⚠ Elevated hemoglobin — may need further evaluation.</span>';
  }
  if (/POTASSIUM|K\b/.test(tName)) {
    if (isCritical) return lang === 'ar' ? '<span style="color:#dc2626;font-weight:600;">&#128680; بوتاسيوم حرج — يؤثر على نظم القلب. تواصل مع طوارئ المستشفى فوراً!</span>' : '<span style="color:#dc2626;font-weight:600;">&#128680; Critical potassium — affects heart rhythm. Contact your hospital/ED immediately!</span>';
    if (isHigh) return lang === 'ar' ? '<span style="color:#dc2626;">⚠ بوتاسيوم مرتفع — يحتاج تقييم سريع.</span>' : '<span style="color:#dc2626;">⚠ Elevated potassium — needs prompt evaluation.</span>';
    if (isLow)  return lang === 'ar' ? '<span style="color:#f59e0b;">⚠ بوتاسيوم منخفض — قد يسبب ضعفاً وتشنجات.</span>' : '<span style="color:#f59e0b;">⚠ Low potassium — may cause weakness/cramps.</span>';
  }
  if (/GLUCOSE|GLUC|FBS|RBS/.test(tName)) {
    if (isHigh) return lang === 'ar' ? '<span style="color:#f59e0b;">⚠ سكر مرتفع — راقب علامات السكري (عطش، تبول كثير، إرهاق).</span>' : '<span style="color:#f59e0b;">⚠ Elevated glucose — watch for diabetes signs (thirst, frequent urination, fatigue).</span>';
    if (isLow)  return lang === 'ar' ? '<span style="color:#dc2626;">⚠ سكر منخفض — تناول شيئاً سكرياً فوراً وتواصل مع طبيبك.</span>' : '<span style="color:#dc2626;">⚠ Low glucose — eat something sweet immediately and contact your doctor.</span>';
  }
  if (/TROPONIN/.test(tName)) {
    if (isHigh || isCritical) return lang === 'ar' ? '<span style="color:#dc2626;font-weight:600;">&#128680; تروبونين مرتفع — قد يدل على إجهاد القلب. اتجه للطوارئ فوراً!</span>' : '<span style="color:#dc2626;font-weight:600;">&#128680; Elevated troponin — may indicate heart strain. Go to ED immediately!</span>';
  }
  if (/CREATININE|CR/.test(tName)) {
    if (isHigh) return lang === 'ar' ? '<span style="color:#f59e0b;">⚠ كرياتينين مرتفع — وظائف الكلى تحتاج متابعة.</span>' : '<span style="color:#f59e0b;">⚠ Elevated creatinine — kidney function needs follow-up.</span>';
  }
  if (/INR/.test(tName)) {
    if (isHigh) return lang === 'ar' ? '<span style="color:#dc2626;">⚠ INR مرتفع — خطر نزيف. تواصل مع طبيب التخثر.</span>' : '<span style="color:#dc2626;">⚠ Elevated INR — bleeding risk. Contact your anticoagulation clinic.</span>';
    if (isLow)  return lang === 'ar' ? '<span style="color:#f59e0b;">⚠ INR منخفض — خطر تجلط. ناقش مع طبيبك.</span>' : '<span style="color:#f59e0b;">⚠ Low INR — clotting risk. Discuss with your doctor.</span>';
  }
  // Generic fallback
  if (isCritical) return lang === 'ar' ? '<span style="color:#dc2626;font-weight:600;">&#128680; نتيجة حرجة — تواصل مع طبيبك فوراً أو اتجه للطوارئ.</span>' : '<span style="color:#dc2626;font-weight:600;">&#128680; Critical result — contact your doctor immediately or go to the ED.</span>';
  if (isHigh)     return lang === 'ar' ? '<span style="color:#f59e0b;">⚠ النتيجة أعلى من المعدل — ناقش مع طبيبك.</span>' : '<span style="color:#f59e0b;">⚠ Result is higher than normal — discuss with your doctor.</span>';
  if (isLow)      return lang === 'ar' ? '<span style="color:#f59e0b;">⚠ النتيجة أقل من المعدل — ناقش مع طبيبك.</span>' : '<span style="color:#f59e0b;">⚠ Result is lower than normal — discuss with your doctor.</span>';
  return '';
}

function renderPPLabs(main, lang) {
  const patient = getCurrentPatient();
  if (!patient) { main.innerHTML = `<div class="empty-state"><p>${t('patient_login_required')}</p></div>`; return; }

  const labs = dbAll(`
    SELECT lo.*, u.full_name_ar as ordered_by_ar, u.full_name_en as ordered_by_en
    FROM lab_orders lo
    JOIN admissions a ON lo.admission_id = a.admission_id
    LEFT JOIN users u ON lo.doctor_id = u.user_id
    WHERE a.patient_id = ? AND lo.status='resulted'
    ORDER BY lo.resulted_at DESC LIMIT 50
  `, [patient.patient_id]);

  main.innerHTML = `
    <div class="page-header"><h1>&#128300; ${t('pp_labs')}</h1></div>
    ${labs.length === 0 ? `<div class="empty-state"><p>${lang==='ar'?'لا توجد نتائج مختبر':'No lab results available'}</p></div>` : `
      <p style="color:#666;font-size:0.88rem;margin-bottom:12px;">${lang === 'ar' ? 'انقر على ▸ بجانب أي نتيجة لمعرفة معناها بلغة بسيطة.' : 'Click ▸ next to any result for a plain-English explanation.'}</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${labs.map((lo, i) => {
          const interpretation = ppInterpretLab(lo.test_name, lo.result_flag, lo.result_value, lang);
          const borderColor = /critical/i.test(lo.result_flag || '') ? '#dc2626' : /high|low/i.test(lo.result_flag || '') ? '#f59e0b' : '#10b981';
          return `<div style="background:#fff;border-left:4px solid ${borderColor};border-radius:8px;padding:12px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
            <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="document.getElementById('ppi-${i}').style.display = document.getElementById('ppi-${i}').style.display === 'none' ? 'block' : 'none';">
              <div style="flex:1;">
                <strong>${escapeHtml(lo.test_name)}</strong>
                ${lo.is_critical ? `<span class="badge badge-danger" style="margin-left:6px;">${lang==='ar'?'حرج':'CRITICAL'}</span>` : ''}
                <div style="margin-top:4px;font-size:0.95rem;">${escapeHtml(lo.result_value || '—')}${lo.result_unit ? ' ' + escapeHtml(lo.result_unit) : ''}
                  ${lo.result_flag ? `<span class="badge badge-warning" style="margin-left:6px;">${escapeHtml(lo.result_flag)}</span>` : ''}</div>
                <div style="font-size:0.78rem;color:#888;margin-top:4px;">${(lo.resulted_at || '').substring(0, 16).replace('T', ' ')} • ${escapeHtml(lang === 'ar' ? (lo.ordered_by_ar || '—') : (lo.ordered_by_en || '—'))}</div>
              </div>
              <span style="font-size:1.2rem;color:#666;">▸</span>
            </div>
            <div id="ppi-${i}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px dashed #e5e7eb;font-size:0.88rem;line-height:1.5;">
              <strong style="color:#3b82f6;">${lang === 'ar' ? 'ماذا تعني هذه النتيجة؟' : 'What does this mean?'}</strong><br>
              ${interpretation || (lang === 'ar' ? 'النتيجة ضمن النطاق الطبيعي للفحص.' : 'Result is within typical range for this test.')}
              <p style="margin-top:8px;font-size:0.78rem;color:#888;">${lang === 'ar' ? 'هذا التفسير عام. اسأل طبيبك دائماً للحالة الخاصة بك.' : 'This is a general explanation. Always ask your doctor about your specific case.'}</p>
            </div>
          </div>`;
        }).join('')}
      </div>
    `}
  `;
}

function renderPPPrescriptions(main, lang) {
  const patient = getCurrentPatient();
  if (!patient) { main.innerHTML = `<div class="empty-state"><p>${t('patient_login_required')}</p></div>`; return; }

  const rxs = dbAll(`
    SELECT p.*, u.full_name_ar as dr_ar, u.full_name_en as dr_en
    FROM prescriptions p
    JOIN admissions a ON p.admission_id = a.admission_id
    LEFT JOIN users u ON p.doctor_id = u.user_id
    WHERE a.patient_id = ?
    ORDER BY p.prescribed_at DESC LIMIT 50
  `, [patient.patient_id]);

  const active = rxs.filter(r => r.status === 'active');
  const past   = rxs.filter(r => r.status !== 'active');

  const rxCard = r => `
    <div class="card mb-2" style="border-left:4px solid ${r.status==='active'?'#10b981':'#9ca3af'}">
      <div class="card-body" style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:1.1rem;font-weight:600">${escapeHtml(r.drug_name)}</div>
            <div style="color:#6b7280;font-size:0.9rem;margin-top:2px">${escapeHtml(r.dose||'')} • ${escapeHtml(r.route||'')} • ${escapeHtml(r.frequency||'')}</div>
          </div>
          <span class="badge ${r.status==='active'?'badge-success':'badge-secondary'}">
            ${r.status==='active'?(lang==='ar'?'فعّال':'Active'):(lang==='ar'?'منتهي':'Completed')}
          </span>
        </div>
        <div style="margin-top:8px;font-size:0.85rem;color:#6b7280">
          ${lang==='ar'?'وصفه':'Prescribed by'}: <strong>${escapeHtml(lang==='ar'?(r.dr_ar||'—'):(r.dr_en||'—'))}</strong>
          • ${escapeHtml((r.prescribed_at||'').substring(0,10))}
        </div>
        ${r.status === 'active' ? `<div style="margin-top:10px;text-align:right;">
          <button class="btn btn-sm btn-primary" onclick="requestRxRefill(${r.rx_id})">&#128189; ${lang === 'ar' ? 'طلب إعادة صرف' : 'Request Refill'}</button>
        </div>` : ''}
      </div>
    </div>`;

  main.innerHTML = `
    <div class="page-header"><h1>&#128138; ${t('pp_prescriptions')}</h1></div>
    ${active.length > 0 ? `<h3 style="margin:8px 0">${lang==='ar'?'الأدوية النشطة':'Active Medications'} (${active.length})</h3>${active.map(rxCard).join('')}` : ''}
    ${past.length > 0 ? `<h3 style="margin:16px 0 8px">${lang==='ar'?'سجل الأدوية السابقة':'Previous Medications'}</h3>${past.map(rxCard).join('')}` : ''}
    ${rxs.length === 0 ? `<div class="empty-state"><p>${lang==='ar'?'لا توجد وصفات طبية':'No prescriptions on record'}</p></div>` : ''}
  `;
}

function renderPPAppointments(main, lang) {
  const patient = getCurrentPatient();
  if (!patient) { main.innerHTML = `<div class="empty-state"><p>${t('patient_login_required')}</p></div>`; return; }

  const appts = dbAll(`
    SELECT a.*, d.name_ar as dept_ar, d.name_en as dept_en, u.full_name_ar as dr_ar, u.full_name_en as dr_en
    FROM appointments a
    LEFT JOIN departments d ON a.dept_id = d.dept_id
    LEFT JOIN users u ON a.doctor_id = u.user_id
    WHERE (a.national_id = ? AND a.national_id IS NOT NULL AND a.national_id != '')
       OR a.patient_name_ar = ?
       OR a.patient_name_en = ?
    ORDER BY a.appt_date DESC, a.appt_time DESC LIMIT 50
  `, [patient.national_id || '___none___', patient.full_name_ar, patient.full_name_en || '___none___']);

  const today = new Date().toISOString().substring(0,10);
  const upcoming = appts.filter(a => a.appt_date >= today && a.status === 'scheduled');
  const past     = appts.filter(a => a.appt_date < today || a.status !== 'scheduled');

  const apptCard = a => `
    <div class="card mb-2">
      <div class="card-body" style="padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-size:1.05rem;font-weight:600">${escapeHtml(lang==='ar'?a.dept_ar:a.dept_en)}</div>
            ${a.dr_en ? `<div style="color:#6b7280;font-size:0.9rem;margin-top:2px">${lang==='ar'?'مع':'with'} <strong>${escapeHtml(lang==='ar'?a.dr_ar:a.dr_en)}</strong></div>` : ''}
            ${a.reason ? `<div style="color:#6b7280;font-size:0.85rem;margin-top:4px">${escapeHtml(a.reason)}</div>` : ''}
          </div>
          <div style="text-align:right">
            <div style="font-size:1.1rem;font-weight:600;color:#3b82f6">${escapeHtml(a.appt_date)}</div>
            <div style="color:#6b7280">${escapeHtml(a.appt_time)}</div>
            <span class="badge badge-info" style="margin-top:4px">${escapeHtml(a.status)}</span>
          </div>
        </div>
      </div>
    </div>`;

  main.innerHTML = `
    <div class="page-header">
      <h1>&#128197; ${t('pp_appointments')}</h1>
      <button class="btn btn-primary" onclick="showPPBookAppt()">&#128197; ${lang === 'ar' ? '+ حجز موعد جديد' : '+ Request New Appointment'}</button>
    </div>
    <div id="pp-book-appt-form"></div>
    ${upcoming.length > 0 ? `<h3 style="margin:8px 0">${lang==='ar'?'مواعيد قادمة':'Upcoming Appointments'} (${upcoming.length})</h3>${upcoming.map(apptCard).join('')}` : ''}
    ${past.length > 0 ? `<h3 style="margin:16px 0 8px">${lang==='ar'?'سجل المواعيد':'Past Appointments'}</h3>${past.map(apptCard).join('')}` : ''}
    ${appts.length === 0 ? `<div class="empty-state"><p>${lang==='ar'?'لا توجد مواعيد':'No appointments on record'}</p><p style="color:#6b7280;font-size:0.85rem;margin-top:8px">${lang==='ar'?'اتصل بقسم الاستقبال لجدولة موعد':'Contact reception to schedule an appointment'}</p></div>` : ''}
  `;
}

function renderPPMessages(main, lang) {
  const patient = getCurrentPatient();
  if (!patient) { main.innerHTML = `<div class="empty-state"><p>${t('patient_login_required')}</p></div>`; return; }

  // Mark staff-to-patient messages as read on view
  dbRun(`UPDATE portal_messages SET read_at = ? WHERE patient_id = ? AND from_type='staff' AND read_at IS NULL`,
    [nowISO(), patient.patient_id]);
  saveDBToIndexedDB();

  const msgs = dbAll(`
    SELECT pm.*, u.full_name_ar as sender_ar, u.full_name_en as sender_en, u.role as sender_role
    FROM portal_messages pm
    LEFT JOIN users u ON pm.from_id = u.user_id AND pm.from_type='staff'
    WHERE pm.patient_id = ?
    ORDER BY pm.sent_at DESC LIMIT 100
  `, [patient.patient_id]);

  main.innerHTML = `
    <div class="page-header">
      <h1>&#128172; ${t('pp_messages')}</h1>
      <button class="btn btn-primary" onclick="showPPNewMessage()">+ ${lang==='ar'?'رسالة جديدة':'New Message'}</button>
    </div>
    <div id="pp-message-form-container"></div>
    ${msgs.length === 0 ? `<div class="empty-state"><p>${lang==='ar'?'لا توجد رسائل':'No messages yet'}</p></div>` : `
      <div style="display:flex;flex-direction:column;gap:12px">
        ${msgs.map(m => {
          const isPatient = m.from_type === 'patient';
          return `
          <div class="card" style="border-left:4px solid ${isPatient?'#3b82f6':'#10b981'};${isPatient?'margin-left:40px':''}">
            <div class="card-body" style="padding:12px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <strong>${isPatient ? (lang==='ar'?'أنت':'You') : escapeHtml(lang==='ar'?(m.sender_ar||'الطاقم الطبي'):(m.sender_en||'Care Team'))}</strong>
                <span style="color:#6b7280;font-size:0.8rem">${escapeHtml(m.sent_at.substring(0,16).replace('T',' '))}</span>
              </div>
              ${m.subject ? `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(m.subject)}</div>` : ''}
              <div style="white-space:pre-wrap">${escapeHtml(m.body)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `}
  `;
}

function showPPNewMessage() {
  const lang = currentLanguage();
  const patient = getCurrentPatient();
  // Find doctors who have consulted on patient's previous admissions
  const careTeam = patient ? dbAll(`SELECT DISTINCT u.user_id, u.full_name_ar, u.full_name_en, u.role, d.name_ar as dept_ar, d.name_en as dept_en
    FROM consultations c JOIN users u ON c.doctor_id = u.user_id
    JOIN admissions a ON c.admission_id = a.admission_id
    LEFT JOIN departments d ON a.dept_id = d.dept_id
    WHERE a.patient_id = ? AND u.is_active = 1
    ORDER BY u.full_name_en LIMIT 15`, [patient.patient_id]) : [];

  document.getElementById('pp-message-form-container').innerHTML = `
    <div class="card mb-3">
      <div class="card-header"><h3>${lang==='ar'?'رسالة جديدة إلى فريقي الطبي':'New Message to My Care Team'}</h3></div>
      <div class="card-body">
        ${careTeam.length > 0 ? `
        <div class="form-group">
          <label>${lang === 'ar' ? 'المستلِم (طبيب محدد أو الفريق)' : 'Recipient (specific doctor or care team)'}</label>
          <select id="pp-msg-recipient">
            <option value="">${lang === 'ar' ? 'الفريق الطبي (افتراضي)' : 'My Care Team (default)'}</option>
            ${careTeam.map(d => `<option value="${d.user_id}">${escapeHtml(lang === 'ar' ? d.full_name_ar : d.full_name_en)} — ${ROLES[d.role] ? ROLES[d.role][lang] : d.role}${d.dept_en ? ' (' + escapeHtml(lang === 'ar' ? d.dept_ar : d.dept_en) + ')' : ''}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="form-group">
          <label>${lang==='ar'?'الموضوع':'Subject'}</label>
          <input type="text" id="pp-msg-subject" placeholder="${lang==='ar'?'مثال: استفسار حول الدواء':'e.g. Question about my medication'}">
        </div>
        <div class="form-group">
          <label>${lang==='ar'?'الرسالة':'Message'} *</label>
          <textarea id="pp-msg-body" rows="5" required></textarea>
        </div>
        <p style="color:#6b7280;font-size:0.8rem;margin-bottom:12px">
          &#9888;&#65039; ${lang==='ar'
            ? 'هذه الرسائل ليست للطوارئ. في حالات الطوارئ اتصل بالطوارئ فوراً.'
            : 'These messages are not for emergencies. For urgent issues, call emergency services immediately.'}
        </p>
        <button class="btn btn-primary" onclick="sendPPMessage()">${lang==='ar'?'إرسال':'Send'}</button>
        <button class="btn btn-secondary" onclick="document.getElementById('pp-message-form-container').innerHTML=''">${t('cancel_btn')}</button>
      </div>
    </div>
  `;
}

function sendPPMessage() {
  const patient = getCurrentPatient();
  if (!patient) return;
  const lang = currentLanguage();
  const subject = (document.getElementById('pp-msg-subject').value || '').trim();
  const body    = (document.getElementById('pp-msg-body').value || '').trim();
  const recipEl = document.getElementById('pp-msg-recipient');
  const recipientId = recipEl ? (parseInt(recipEl.value) || null) : null;
  if (!body) {
    showError(lang==='ar'?'الرسالة مطلوبة':'Message is required');
    return;
  }
  const subjectWithRoute = subject + (recipientId ? ` [→ user:${recipientId}]` : '');
  dbRun(`INSERT INTO portal_messages (patient_id, from_type, from_id, subject, body, sent_at)
    VALUES (?, 'patient', ?, ?, ?, ?)`,
    [patient.patient_id, patient.patient_id, subjectWithRoute || null, body, nowISO()]);
  saveDBToIndexedDB();
  showSuccess(lang==='ar'?'تم إرسال الرسالة':'Message sent');
  navigateTo('pp-messages');
}

// Patient portal: book new appointment (status=requested → receptionist confirms)
function showPPBookAppt() {
  const lang = currentLanguage();
  const depts = dbAll(`SELECT dept_id, name_ar, name_en FROM departments WHERE type='clinical' ORDER BY name_en`);
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('pp-book-appt-form').innerHTML = `
    <div class="card mb-3" style="border-left:4px solid #3b82f6;">
      <div class="card-header"><h3>${lang === 'ar' ? 'طلب موعد جديد' : 'Request New Appointment'}</h3></div>
      <div class="card-body">
        <p style="font-size:0.85rem;color:#666;margin-bottom:12px;">${lang === 'ar' ? 'سيتم إرسال طلبك إلى الاستقبال للتأكيد وتخصيص الطبيب.' : 'Your request will be sent to reception for confirmation and provider assignment.'}</p>
        <div class="form-row">
          <div class="form-group">
            <label>${lang === 'ar' ? 'القسم' : 'Department'} *</label>
            <select id="ppba-dept" required>
              <option value="">${lang === 'ar' ? '-- اختر --' : '-- Select --'}</option>
              ${depts.map(d => `<option value="${d.dept_id}">${escapeHtml(lang === 'ar' ? d.name_ar : d.name_en)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>${lang === 'ar' ? 'تاريخ مفضل' : 'Preferred date'} *</label>
            <input type="date" id="ppba-date" min="${today}" required>
          </div>
          <div class="form-group">
            <label>${lang === 'ar' ? 'وقت مفضل' : 'Preferred time'}</label>
            <select id="ppba-time">
              <option value="08:00">08:00 — ${lang === 'ar' ? 'صباحاً' : 'morning'}</option>
              <option value="10:00">10:00</option>
              <option value="13:00" selected>13:00 — ${lang === 'ar' ? 'ظهراً' : 'midday'}</option>
              <option value="15:00">15:00</option>
              <option value="17:00">17:00 — ${lang === 'ar' ? 'مساءً' : 'evening'}</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>${lang === 'ar' ? 'سبب الزيارة' : 'Reason for visit'} *</label>
          <textarea id="ppba-reason" rows="2" required placeholder="${lang === 'ar' ? 'مثال: متابعة ضغط الدم، حالة جديدة، تجديد وصفة...' : 'e.g. BP follow-up, new symptom, prescription refill...'}"></textarea>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="submitPPBookAppt()">${lang === 'ar' ? 'إرسال الطلب' : 'Submit Request'}</button>
          <button class="btn btn-secondary" onclick="document.getElementById('pp-book-appt-form').innerHTML=''">${t('cancel_btn')}</button>
        </div>
      </div>
    </div>`;
}

async function submitPPBookAppt() {
  const lang = currentLanguage();
  const patient = getCurrentPatient();
  if (!patient) return;
  const deptId = parseInt(document.getElementById('ppba-dept').value);
  const date = document.getElementById('ppba-date').value;
  const time = document.getElementById('ppba-time').value;
  const reason = document.getElementById('ppba-reason').value.trim();
  if (!deptId || !date || !reason) { showError(lang === 'ar' ? 'يرجى ملء جميع الحقول' : 'Please fill all required fields'); return; }
  dbRun(`INSERT INTO appointments (patient_name_ar, patient_name_en, national_id, mrn, dept_id, appt_date, appt_time, reason, status, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, NULL)`,
    [patient.full_name_ar, patient.full_name_en, patient.national_id, patient.mrn, deptId, date, time, reason, nowISO()]);
  await logAction('APPOINTMENT_REQUESTED',
    `Patient ${patient.full_name_en || patient.full_name_ar} (MRN ${patient.mrn}) requested appointment for ${date} ${time} — ${reason}`,
    null, patient.patient_id, patient.full_name_en || patient.full_name_ar, patient.mrn);
  saveDBToIndexedDB();
  showSuccess(lang === 'ar' ? 'تم إرسال طلب الموعد. ستتواصل معك الاستقبال للتأكيد.' : 'Appointment request sent. Reception will contact you to confirm.');
  navigateTo('pp-appointments');
}

// Patient portal: request refill on an active prescription
async function requestRxRefill(rxId) {
  const lang = currentLanguage();
  const patient = getCurrentPatient();
  if (!patient) return;
  const rx = dbGet('SELECT p.*, u.full_name_en as dr_en FROM prescriptions p LEFT JOIN users u ON p.doctor_id = u.user_id WHERE p.rx_id = ?', [rxId]);
  if (!rx) return;
  // Create a portal_message addressed to the prescribing doctor
  const subj = (lang === 'ar' ? 'طلب إعادة صرف' : 'Refill request') + ': ' + rx.drug_name;
  const body = (lang === 'ar'
    ? `يطلب المريض ${patient.full_name_ar} (MRN: ${patient.mrn}) إعادة صرف الدواء التالي:\n\nالدواء: ${rx.drug_name}\nالجرعة: ${rx.dose}\nالمسار: ${rx.route}\nالتكرار: ${rx.frequency}\n\nالطبيب الواصف: ${rx.dr_en || '—'}`
    : `Patient ${patient.full_name_en || patient.full_name_ar} (MRN: ${patient.mrn}) requests a refill:\n\nMedication: ${rx.drug_name}\nDose: ${rx.dose}\nRoute: ${rx.route}\nFrequency: ${rx.frequency}\n\nPrescribed by: ${rx.dr_en || '—'}`);
  dbRun(`INSERT INTO portal_messages (patient_id, from_type, from_id, subject, body, sent_at) VALUES (?, 'patient', ?, ?, ?, ?)`,
    [patient.patient_id, patient.patient_id, subj + (rx.doctor_id ? ` [→ user:${rx.doctor_id}]` : ''), body, nowISO()]);
  // Audit
  await logAction('REFILL_REQUESTED',
    `Patient ${patient.full_name_en || patient.full_name_ar} (MRN ${patient.mrn}) requested refill of ${rx.drug_name} ${rx.dose}`,
    null, patient.patient_id, patient.full_name_en || patient.full_name_ar, patient.mrn);
  saveDBToIndexedDB();
  showSuccess(lang === 'ar' ? 'تم إرسال طلب إعادة الصرف لطبيبك' : 'Refill request sent to your doctor');
}

// ============================================================
// NURSING CARE PLAN (NANDA/NIC/NOC)
// ============================================================

function showCarePlanForm(admissionId, nameAr, nameEn) {
  const lang = currentLanguage();
  const name = lang === 'ar' ? nameAr : (nameEn || nameAr);

  // Get existing care plans for this admission
  const existingPlans = dbAll(
    `SELECT cp.*, u.full_name_ar as creator_ar, u.full_name_en as creator_en
     FROM nursing_care_plans cp
     LEFT JOIN users u ON cp.created_by = u.user_id
     WHERE cp.admission_id = ? ORDER BY cp.created_at DESC`,
    [admissionId]
  );

  const existingHtml = existingPlans.length === 0
    ? `<p style="color:#6b7280">${lang==='ar'?'لا توجد خطط رعاية حالياً':'No active care plans yet'}</p>`
    : existingPlans.map(p => {
        const statusBadge = p.status === 'resolved'
          ? `<span class="badge badge-success">${lang==='ar'?'منتهي':'Resolved'}</span>`
          : `<span class="badge badge-info">${lang==='ar'?'نشط':'Active'}</span>`;
        return `<div class="card mb-2" style="border-left:4px solid #10b981">
          <div class="card-body" style="padding:10px 14px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px">
              <strong>NANDA ${escapeHtml(p.nanda_code)}: ${escapeHtml(p.nanda_label || '—')}</strong>
              ${statusBadge}
            </div>
            ${p.nic_label ? `<div style="font-size:0.85rem;color:#1e40af;margin-top:4px"><strong>NIC ${escapeHtml(p.nic_code||'')}:</strong> ${escapeHtml(p.nic_label)}</div>` : ''}
            ${p.noc_label ? `<div style="font-size:0.85rem;color:#7c3aed;margin-top:2px"><strong>NOC ${escapeHtml(p.noc_code||'')}:</strong> ${escapeHtml(p.noc_label)}</div>` : ''}
            ${p.goal_text ? `<div style="margin-top:6px;padding:6px 10px;background:#f9fafb;border-radius:4px;font-size:0.85rem">${escapeHtml(p.goal_text)}</div>` : ''}
            <div style="font-size:0.75rem;color:#6b7280;margin-top:6px">
              ${escapeHtml(lang==='ar'?(p.creator_ar||'—'):(p.creator_en||'—'))} • ${escapeHtml(p.created_at.substring(0,16).replace('T',' '))}
              ${p.status === 'active' ? `<button class="btn btn-sm" style="background:#10b981;color:white;margin-left:8px;font-size:0.75rem" onclick="resolveCarePlan(${p.plan_id}, ${admissionId}, '${escapeHtml(nameAr||'')}', '${escapeHtml(nameEn||'')}')">${lang==='ar'?'تم الحل':'Mark Resolved'}</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');

  showModal(`
    <div style="max-width:760px;width:90vw">
      <h2>📋 ${t('care_plan_title')} — ${escapeHtml(name)}</h2>
      <p style="color:#6b7280;font-size:0.9rem">${lang==='ar'?'خطة رعاية تمريضية باستخدام تصنيف NANDA-I و NIC و NOC':'Standardized nursing care plan using NANDA-I, NIC, NOC'}</p>

      <h3 style="margin-top:12px;font-size:1rem">${lang==='ar'?'الخطط الحالية':'Current Plans'}</h3>
      <div style="max-height:240px;overflow-y:auto;padding-right:4px">
        ${existingHtml}
      </div>

      <hr style="margin:16px 0">
      <h3 style="font-size:1rem">${t('add_care_plan')}</h3>
      <form id="care-plan-form" onsubmit="event.preventDefault(); saveCarePlan(${admissionId}, '${escapeHtml(nameAr||'')}', '${escapeHtml(nameEn||'')}')">
        <div class="form-group">
          <label>${t('nanda_label')} *</label>
          <select id="cp-nanda" required>
            <option value="">${lang==='ar'?'— اختر التشخيص —':'— Select diagnosis —'}</option>
            ${nandaOptions(lang)}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>${t('nic_label')}</label>
            <select id="cp-nic">
              <option value="">—</option>
              ${nicOptions(lang)}
            </select>
          </div>
          <div class="form-group">
            <label>${t('noc_label')}</label>
            <select id="cp-noc">
              <option value="">—</option>
              ${nocOptions(lang)}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>${t('care_plan_goal')}</label>
          <textarea id="cp-goal" rows="3" placeholder="${lang==='ar'?'مثال: تخفيف الألم إلى أقل من 3/10 خلال 24 ساعة':'e.g. Reduce pain to <3/10 within 24 hours'}"></textarea>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
          <button type="submit" class="btn btn-primary">${t('save_btn')}</button>
        </div>
      </form>
    </div>
  `);
}

function saveCarePlan(admissionId, nameAr, nameEn) {
  const user = getCurrentUser();
  const lang = currentLanguage();
  const nandaVal = document.getElementById('cp-nanda').value;
  if (!nandaVal) { showError(lang==='ar'?'اختر تشخيص NANDA':'Select NANDA diagnosis'); return; }

  const [nandaCode, nandaLabel] = nandaVal.split('|');
  const nicVal = document.getElementById('cp-nic').value || '';
  const nocVal = document.getElementById('cp-noc').value || '';
  const [nicCode, nicLabel] = nicVal ? nicVal.split('|') : ['', ''];
  const [nocCode, nocLabel] = nocVal ? nocVal.split('|') : ['', ''];
  const goal = (document.getElementById('cp-goal').value || '').trim();

  dbRun(`INSERT INTO nursing_care_plans
    (admission_id, nanda_code, nanda_label, nic_code, nic_label, noc_code, noc_label, goal_text, status, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [admissionId, nandaCode, nandaLabel, nicCode||null, nicLabel||null, nocCode||null, nocLabel||null, goal||null, user.user_id, nowISO()]);

  saveDBToIndexedDB();
  showSuccess(t('success_saved'));
  closeModal();
  setTimeout(() => showCarePlanForm(admissionId, nameAr, nameEn), 200);
}

function resolveCarePlan(planId, admissionId, nameAr, nameEn) {
  dbRun(`UPDATE nursing_care_plans SET status='resolved', resolved_at=? WHERE plan_id=?`,
    [nowISO(), planId]);
  saveDBToIndexedDB();
  showSuccess('Care plan resolved');
  closeModal();
  setTimeout(() => showCarePlanForm(admissionId, nameAr, nameEn), 200);
}

// ============================================================
// HOSPITAL MANAGER — Analytics Dashboard (Chart.js)
// ============================================================

let _analyticsCharts = []; // track to destroy on re-render

function _destroyAnalyticsCharts() {
  _analyticsCharts.forEach(c => { try { c.destroy(); } catch(e) {} });
  _analyticsCharts = [];
}

function _analyticsPeriodDays() {
  const sel = document.getElementById('analytics-period');
  return parseInt(sel?.value || '30');
}

function renderHMAnalytics(main, lang) {
  _destroyAnalyticsCharts();

  main.innerHTML = `
    <div class="page-header">
      <h1>📈 ${t('hm_analytics')}</h1>
      <div>
        <label style="margin-right:8px;color:#6b7280;font-size:0.85rem">${lang==='ar'?'الفترة:':'Period:'}</label>
        <select id="analytics-period" onchange="renderHMAnalytics(document.getElementById('main-content'), currentLanguage())">
          <option value="7">${t('analytics_period_7d')}</option>
          <option value="30" selected>${t('analytics_period_30d')}</option>
          <option value="90">${t('analytics_period_90d')}</option>
        </select>
      </div>
    </div>

    <!-- ---- KPI strip ---- -->
    <div id="kpi-strip" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px"></div>

    <!-- ---- Charts grid ---- -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px">
      <div class="card"><div class="card-header"><h3>📊 ${t('analytics_census')}</h3></div>
        <div class="card-body"><canvas id="chart-census" height="180"></canvas></div></div>
      <div class="card"><div class="card-header"><h3>🏥 ${t('analytics_dept_occ')}</h3></div>
        <div class="card-body"><canvas id="chart-dept" height="180"></canvas></div></div>
      <div class="card"><div class="card-header"><h3>⏱️ ${t('analytics_los')}</h3></div>
        <div class="card-body"><canvas id="chart-los" height="180"></canvas></div></div>
      <div class="card"><div class="card-header"><h3>🎯 ${t('analytics_readmit')}</h3></div>
        <div class="card-body"><canvas id="chart-readmit" height="180"></canvas></div></div>
      <div class="card"><div class="card-header"><h3>🧪 ${t('analytics_critical_labs')}</h3></div>
        <div class="card-body"><canvas id="chart-labs" height="180"></canvas></div></div>
      <div class="card"><div class="card-header"><h3>🚨 ${t('analytics_sepsis')}</h3></div>
        <div class="card-body"><canvas id="chart-sepsis" height="180"></canvas></div></div>
      <div class="card"><div class="card-header"><h3>💊 ${t('analytics_rx_verify')}</h3></div>
        <div class="card-body"><canvas id="chart-rx" height="180"></canvas></div></div>
      <div class="card"><div class="card-header"><h3>🩺 ${t('analytics_top_diag')}</h3></div>
        <div class="card-body"><canvas id="chart-diag" height="180"></canvas></div></div>
    </div>
  `;

  // Wait for canvas elements to mount, then render
  requestAnimationFrame(() => _renderAllAnalyticsCharts(lang));
}

function _renderAllAnalyticsCharts(lang) {
  if (typeof Chart === 'undefined') {
    console.error('[Analytics] Chart.js not loaded');
    return;
  }

  const days = _analyticsPeriodDays();
  const sinceISO = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const isAr = lang === 'ar';

  // ---- KPI Strip ----
  _renderKPIStrip(sinceISO, lang);

  // ---- Chart 1: Census Over Time (line) ----
  _renderCensusChart(days, isAr);

  // ---- Chart 2: Department Occupancy (bar) ----
  _renderDeptOccupancy(isAr);

  // ---- Chart 3: Average LOS (bar) ----
  _renderLOSChart(sinceISO, isAr);

  // ---- Chart 4: Readmission Risk Distribution (doughnut) ----
  _renderReadmitChart(sinceISO, isAr);

  // ---- Chart 5: Critical Labs Per Day (line) ----
  _renderCriticalLabsChart(days, isAr);

  // ---- Chart 6: Sepsis Alerts ----
  _renderSepsisChart(days, isAr);

  // ---- Chart 7: Rx Verification Time ----
  _renderRxVerifyChart(sinceISO, isAr);

  // ---- Chart 8: Top Diagnoses ----
  _renderTopDiagnosesChart(sinceISO, isAr);
}

// ============================================================
// KPI Strip
// ============================================================
function _renderKPIStrip(sinceISO, lang) {
  const totalAdmits = dbGet(`SELECT COUNT(*) as c FROM admissions WHERE admitted_at >= ?`, [sinceISO]);
  const totalDischarges = dbGet(`SELECT COUNT(*) as c FROM admissions WHERE discharged_at >= ?`, [sinceISO]);
  const currentOccupied = dbGet(`SELECT COUNT(*) as c FROM admissions WHERE status='active'`);
  const sepsisCount = dbGet(`SELECT COUNT(*) as c FROM sepsis_alerts WHERE triggered_at >= ?`, [sinceISO]);
  const codeBlueCount = dbGet(`SELECT COUNT(*) as c FROM code_blue_events WHERE initiated_at >= ?`, [sinceISO]);
  const criticalLabs = dbGet(`SELECT COUNT(*) as c FROM lab_orders WHERE is_critical=1 AND resulted_at >= ?`, [sinceISO]);
  const avgLOS = dbGet(`SELECT AVG(julianday(discharged_at)-julianday(admitted_at)) as a FROM admissions WHERE discharged_at IS NOT NULL AND discharged_at >= ?`, [sinceISO]);
  const highRiskDischarges = dbGet(`SELECT COUNT(*) as c FROM admissions WHERE readmission_risk_level='high' AND discharged_at >= ?`, [sinceISO]);

  const kpis = [
    { icon: '🏥', label: lang==='ar'?'إدخالات':'Admissions', value: totalAdmits?.c || 0, color: '#3b82f6' },
    { icon: '✅', label: lang==='ar'?'مخرجات':'Discharges', value: totalDischarges?.c || 0, color: '#10b981' },
    { icon: '🛏', label: lang==='ar'?'إشغال حالي':'Currently Occupied', value: currentOccupied?.c || 0, color: '#f59e0b' },
    { icon: '⏱️', label: lang==='ar'?'متوسط الإقامة':'Avg LOS', value: avgLOS?.a ? avgLOS.a.toFixed(1) + (lang==='ar'?' يوم':' d') : '—', color: '#8b5cf6' },
    { icon: '🚨', label: lang==='ar'?'تنبيهات إنتان':'Sepsis Alerts', value: sepsisCount?.c || 0, color: '#dc2626' },
    { icon: '💔', label: 'Code Blue', value: codeBlueCount?.c || 0, color: '#991b1b' },
    { icon: '🧪', label: lang==='ar'?'نتائج حرجة':'Critical Labs', value: criticalLabs?.c || 0, color: '#ea580c' },
    { icon: '⚠️', label: lang==='ar'?'مخرجات عالية الخطر':'High-Risk Discharges', value: highRiskDischarges?.c || 0, color: '#be123c' },
  ];

  document.getElementById('kpi-strip').innerHTML = kpis.map(k => `
    <div class="card" style="border-left:4px solid ${k.color};padding:14px;text-align:center">
      <div style="font-size:1.5rem;margin-bottom:4px">${k.icon}</div>
      <div style="font-size:1.6rem;font-weight:700;color:${k.color}">${k.value}</div>
      <div style="font-size:0.75rem;color:#6b7280;margin-top:2px">${k.label}</div>
    </div>
  `).join('');
}

// ============================================================
// Chart 1: Census Over Time (line)
// ============================================================
function _renderCensusChart(days, isAr) {
  const labels = [];
  const data = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400 * 1000);
    const dayStr = d.toISOString().substring(0, 10);
    labels.push(dayStr.substring(5)); // MM-DD
    // Count patients admitted before/on this day and not discharged before this day
    const row = dbGet(`SELECT COUNT(*) as c FROM admissions
      WHERE date(admitted_at) <= ?
        AND (discharged_at IS NULL OR date(discharged_at) > ?)`,
      [dayStr, dayStr]);
    data.push(row?.c || 0);
  }

  const ctx = document.getElementById('chart-census');
  if (!ctx) return;
  _analyticsCharts.push(new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: isAr ? 'المرضى المنومون' : 'Patients in Hospital',
        data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  }));
}

// ============================================================
// Chart 2: Department Occupancy (horizontal bar)
// ============================================================
function _renderDeptOccupancy(isAr) {
  const rows = dbAll(`
    SELECT d.name_${isAr?'ar':'en'} as name, COUNT(a.admission_id) as c
    FROM departments d
    LEFT JOIN admissions a ON d.dept_id = a.dept_id AND a.status='active'
    WHERE d.type='clinical'
    GROUP BY d.dept_id
    HAVING c > 0
    ORDER BY c DESC LIMIT 10
  `);

  const ctx = document.getElementById('chart-dept');
  if (!ctx) return;
  _analyticsCharts.push(new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.name),
      datasets: [{
        label: isAr ? 'المرضى' : 'Patients',
        data: rows.map(r => r.c),
        backgroundColor: '#10b981',
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  }));
}

// ============================================================
// Chart 3: Average LOS by Department (bar)
// ============================================================
function _renderLOSChart(sinceISO, isAr) {
  const rows = dbAll(`
    SELECT d.name_${isAr?'ar':'en'} as name,
           AVG(julianday(a.discharged_at) - julianday(a.admitted_at)) as los
    FROM admissions a
    JOIN departments d ON a.dept_id = d.dept_id
    WHERE a.discharged_at IS NOT NULL AND a.discharged_at >= ?
    GROUP BY d.dept_id
    ORDER BY los DESC LIMIT 8
  `, [sinceISO]);

  const ctx = document.getElementById('chart-los');
  if (!ctx) return;
  _analyticsCharts.push(new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.name),
      datasets: [{
        label: isAr ? 'متوسط الأيام' : 'Avg Days',
        data: rows.map(r => Math.round(r.los * 10) / 10),
        backgroundColor: '#8b5cf6',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  }));
}

// ============================================================
// Chart 4: Readmission Risk Distribution (doughnut)
// ============================================================
function _renderReadmitChart(sinceISO, isAr) {
  const counts = { low: 0, medium: 0, high: 0, unscored: 0 };
  const rows = dbAll(`SELECT readmission_risk_level FROM admissions WHERE discharged_at >= ?`, [sinceISO]);
  rows.forEach(r => {
    const lvl = r.readmission_risk_level || 'unscored';
    counts[lvl] = (counts[lvl] || 0) + 1;
  });

  const ctx = document.getElementById('chart-readmit');
  if (!ctx) return;
  _analyticsCharts.push(new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [
        isAr ? 'منخفض' : 'Low',
        isAr ? 'متوسط' : 'Medium',
        isAr ? 'مرتفع' : 'High',
        isAr ? 'غير محسوب' : 'Unscored'
      ],
      datasets: [{
        data: [counts.low, counts.medium, counts.high, counts.unscored],
        backgroundColor: ['#10b981', '#f59e0b', '#dc2626', '#9ca3af']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { boxWidth: 14 } } }
    }
  }));
}

// ============================================================
// Chart 5: Critical Labs Per Day (line)
// ============================================================
function _renderCriticalLabsChart(days, isAr) {
  const labels = [];
  const data = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400 * 1000);
    const dayStr = d.toISOString().substring(0, 10);
    labels.push(dayStr.substring(5));
    const row = dbGet(`SELECT COUNT(*) as c FROM lab_orders WHERE is_critical=1 AND date(resulted_at) = ?`, [dayStr]);
    data.push(row?.c || 0);
  }

  const ctx = document.getElementById('chart-labs');
  if (!ctx) return;
  _analyticsCharts.push(new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: isAr ? 'نتائج حرجة' : 'Critical Results',
        data,
        backgroundColor: '#dc2626',
        borderRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  }));
}

// ============================================================
// Chart 6: Sepsis Alerts (mixed: bar + acknowledge time)
// ============================================================
function _renderSepsisChart(days, isAr) {
  const alerts = dbAll(`SELECT severity, triggered_at, acknowledged_at FROM sepsis_alerts WHERE triggered_at >= ?`,
    [new Date(Date.now() - days * 86400 * 1000).toISOString()]);

  const severityCounts = { high: 0, moderate: 0 };
  let ackTimes = [];

  alerts.forEach(a => {
    severityCounts[a.severity || 'moderate'] = (severityCounts[a.severity || 'moderate'] || 0) + 1;
    if (a.acknowledged_at && a.triggered_at) {
      const mins = (new Date(a.acknowledged_at) - new Date(a.triggered_at)) / 60000;
      ackTimes.push(mins);
    }
  });

  const avgAck = ackTimes.length > 0 ? (ackTimes.reduce((a,b)=>a+b,0)/ackTimes.length) : 0;

  const ctx = document.getElementById('chart-sepsis');
  if (!ctx) return;

  // If no data, show placeholder
  if (alerts.length === 0) {
    ctx.parentElement.innerHTML = `<div style="padding:40px;text-align:center;color:#9ca3af">
      <div style="font-size:2rem;margin-bottom:8px">✅</div>
      <div>${isAr?'لا توجد تنبيهات إنتان في هذه الفترة':'No sepsis alerts in this period'}</div>
    </div>`;
    return;
  }

  _analyticsCharts.push(new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [
        isAr ? 'عالي الخطورة' : 'High',
        isAr ? 'متوسط الخطورة' : 'Moderate'
      ],
      datasets: [{
        data: [severityCounts.high || 0, severityCounts.moderate || 0],
        backgroundColor: ['#dc2626', '#f59e0b']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 14 } },
        title: { display: true, text: `${isAr?'متوسط زمن الاستجابة':'Avg ack time'}: ${avgAck.toFixed(1)} min` }
      }
    }
  }));
}

// ============================================================
// Chart 7: Rx Verification Time (avg minutes by pharmacist)
// ============================================================
function _renderRxVerifyChart(sinceISO, isAr) {
  const rows = dbAll(`
    SELECT u.full_name_${isAr?'ar':'en'} as name,
      AVG((julianday(p.verified_at) - julianday(p.prescribed_at)) * 24 * 60) as mins,
      COUNT(*) as c
    FROM prescriptions p
    JOIN users u ON p.verified_by = u.user_id
    WHERE p.verified_at IS NOT NULL AND p.verified_at >= ?
    GROUP BY p.verified_by
    ORDER BY mins ASC LIMIT 10
  `, [sinceISO]);

  const ctx = document.getElementById('chart-rx');
  if (!ctx) return;

  if (rows.length === 0) {
    ctx.parentElement.innerHTML = `<div style="padding:40px;text-align:center;color:#9ca3af">
      <div style="font-size:2rem;margin-bottom:8px">💊</div>
      <div>${isAr?'لا توجد بيانات تحقق في هذه الفترة':'No verification data in this period'}</div>
    </div>`;
    return;
  }

  _analyticsCharts.push(new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.name + ' (' + r.c + ')'),
      datasets: [{
        label: isAr ? 'دقائق' : 'Minutes',
        data: rows.map(r => Math.round(r.mins || 0)),
        backgroundColor: rows.map(r => (r.mins || 0) > 30 ? '#dc2626' : (r.mins || 0) > 15 ? '#f59e0b' : '#10b981'),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  }));
}

// ============================================================
// Chart 8: Top Diagnoses (horizontal bar)
// ============================================================
function _renderTopDiagnosesChart(sinceISO, isAr) {
  const rows = dbAll(`
    SELECT initial_diagnosis as dx, COUNT(*) as c
    FROM admissions
    WHERE initial_diagnosis IS NOT NULL AND initial_diagnosis != '' AND admitted_at >= ?
    GROUP BY initial_diagnosis
    ORDER BY c DESC LIMIT 8
  `, [sinceISO]);

  const ctx = document.getElementById('chart-diag');
  if (!ctx) return;

  if (rows.length === 0) {
    ctx.parentElement.innerHTML = `<div style="padding:40px;text-align:center;color:#9ca3af">${isAr?'لا توجد بيانات تشخيصات':'No diagnosis data'}</div>`;
    return;
  }

  // Truncate long diagnoses for display
  const truncate = s => s.length > 40 ? s.substring(0, 37) + '...' : s;

  _analyticsCharts.push(new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => truncate(r.dx)),
      datasets: [{
        label: isAr ? 'حالات' : 'Cases',
        data: rows.map(r => r.c),
        backgroundColor: '#0ea5e9',
        borderRadius: 3
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  }));
}

// ============================================================
// CLINICAL CALCULATORS — Modal accessible from any clinical view
// ============================================================

function showCalculatorsMenu() {
  const lang = currentLanguage();
  const categories = [...new Set(CLINICAL_CALCULATORS.map(c => c.category))];
  const isAr = lang === 'ar';

  const html = `
    <div style="max-width:760px;width:90vw">
      <h2>🧮 ${isAr?'الحاسبات الطبية':'Clinical Calculators'}</h2>
      <p style="color:#6b7280;font-size:0.9rem">
        ${isAr ? 'احسبها لي. لا داعي لحفظ المعادلات — اختر الحاسبة وأدخل الأرقام.' : 'No need to memorize formulas. Pick a calculator, enter the numbers.'}
      </p>
      <div style="margin-top:14px">
        ${categories.map(cat => `
          <h3 style="margin:14px 0 6px;font-size:0.95rem;color:#1e40af;border-bottom:2px solid #e5e7eb;padding-bottom:4px">${escapeHtml(cat)}</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px">
            ${CLINICAL_CALCULATORS.filter(c => c.category === cat).map(c => `
              <button class="btn calc-card-btn" style="text-align:left;padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;color:#1f2937;display:flex;gap:8px;align-items:center"
                onclick="showCalculator('${c.id}')">
                <span style="font-size:1.4rem">${c.icon}</span>
                <span style="font-size:0.85rem;font-weight:500">${escapeHtml(isAr ? c.name_ar : c.name_en)}</span>
              </button>
            `).join('')}
          </div>
        `).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')||'Close'}</button>
      </div>
    </div>
  `;
  showModal(html);
}

function showCalculator(calcId) {
  const lang = currentLanguage();
  const isAr = lang === 'ar';
  const calc = CLINICAL_CALCULATORS.find(c => c.id === calcId);
  if (!calc) return;

  closeModal();

  const inputsHtml = calc.inputs.map(inp => {
    if (inp.type === 'checkbox') {
      return `<label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;margin-bottom:6px">
        <input type="checkbox" id="calc-${inp.id}" style="width:18px;height:18px">
        <span>${escapeHtml(isAr ? inp.label_ar : inp.label_en)}${inp.points?` <small style="color:#6b7280">(+${inp.points})</small>`:''}</span>
      </label>`;
    }
    if (inp.type === 'select') {
      return `<div class="form-group">
        <label>${escapeHtml(isAr ? inp.label_ar : inp.label_en)}</label>
        <select id="calc-${inp.id}" onchange="runCalculator('${calc.id}')">
          <option value="">—</option>
          ${inp.options.map(o => `<option value="${o[0]}">${escapeHtml(o[1])}</option>`).join('')}
        </select>
      </div>`;
    }
    return `<div class="form-group">
      <label>${escapeHtml(isAr ? inp.label_ar : inp.label_en)}</label>
      <input type="${inp.type}" id="calc-${inp.id}" ${inp.step?`step="${inp.step}"`:''} ${inp.min!=null?`min="${inp.min}"`:''} ${inp.max!=null?`max="${inp.max}"`:''} oninput="runCalculator('${calc.id}')">
    </div>`;
  }).join('');

  showModal(`
    <div style="max-width:600px;width:90vw">
      <h2>${calc.icon} ${escapeHtml(isAr ? calc.name_ar : calc.name_en)}</h2>
      <div id="calc-result" style="margin:14px 0;padding:14px;background:#f9fafb;border-radius:8px;border-left:6px solid #9ca3af;min-height:60px">
        <div style="color:#9ca3af;text-align:center">${isAr?'أدخل القيم أعلاه للحساب':'Enter values above to calculate'}</div>
      </div>
      ${inputsHtml}
      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px">
        <button class="btn btn-secondary" onclick="showCalculatorsMenu()">← ${isAr?'العودة':'Back'}</button>
        <button class="btn btn-primary" onclick="runCalculator('${calc.id}')">${isAr?'احسب':'Calculate'}</button>
      </div>
    </div>
  `);

  // Auto-trigger checkboxes re-calc
  calc.inputs.forEach(inp => {
    if (inp.type === 'checkbox') {
      const el = document.getElementById('calc-' + inp.id);
      if (el) el.addEventListener('change', () => runCalculator(calc.id));
    }
  });
}

function runCalculator(calcId) {
  const calc = CLINICAL_CALCULATORS.find(c => c.id === calcId);
  if (!calc) return;
  const lang = currentLanguage();
  const isAr = lang === 'ar';

  const values = {};
  let allFilled = true;
  for (const inp of calc.inputs) {
    const el = document.getElementById('calc-' + inp.id);
    if (!el) continue;
    if (inp.type === 'checkbox') {
      values[inp.id] = el.checked;
    } else if (el.value === '') {
      allFilled = false;
    } else {
      values[inp.id] = inp.type === 'number' ? parseFloat(el.value) : el.value;
    }
  }

  const resultEl = document.getElementById('calc-result');
  if (!resultEl) return;
  if (!allFilled) {
    resultEl.innerHTML = `<div style="color:#9ca3af;text-align:center">${isAr?'أدخل جميع القيم':'Fill in all values'}</div>`;
    resultEl.style.borderLeftColor = '#9ca3af';
    return;
  }

  try {
    const result = calc.calc(values);
    resultEl.style.borderLeftColor = result.color || '#3b82f6';
    resultEl.innerHTML = `
      <div style="text-align:center">
        <div style="font-size:3rem;font-weight:700;color:${result.color || '#1f2937'};line-height:1">
          ${result.value} <span style="font-size:1rem;color:#6b7280">${result.unit || ''}</span>
        </div>
        ${result.interpretation ? `<div style="margin-top:8px;font-size:0.95rem;color:#374151">${escapeHtml(result.interpretation)}</div>` : ''}
      </div>
    `;
  } catch (e) {
    resultEl.innerHTML = `<div style="color:#dc2626">${isAr?'خطأ في الحساب':'Calculation error'}: ${e.message}</div>`;
  }
}

// Floating "Calculators" button — show for clinical roles
function showCalculatorsButton() {
  if (document.getElementById('calc-fab')) return;
  const session = (typeof getCurrentSession === 'function') ? getCurrentSession() : null;
  if (!session) return;
  const clinicalRoles = ['doctor','consultant','emergency_doctor','nurse','senior_nurse','pharmacist'];
  if (!clinicalRoles.includes(session.role)) return;

  const btn = document.createElement('button');
  btn.id = 'calc-fab';
  btn.className = 'calc-fab';
  btn.innerHTML = '🧮';
  btn.title = currentLanguage()==='ar' ? 'الحاسبات الطبية' : 'Clinical Calculators';
  btn.onclick = showCalculatorsMenu;
  document.body.appendChild(btn);
}
