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
      // escape LIKE wildcards so a literal '%'/'_' in the query (or an MRN
      // containing '_') doesn't match everything / the wrong rows
      const like = '%' + q.toUpperCase().replace(/[\\%_]/g, m => '\\' + m) + '%';
      const matches = dbAll(`SELECT p.patient_id, p.mrn, p.full_name_ar, p.full_name_en, p.date_of_birth, p.gender, p.phone
        FROM patients p
        WHERE UPPER(p.mrn) LIKE ? ESCAPE '\\' OR UPPER(p.full_name_ar) LIKE ? ESCAPE '\\' OR UPPER(p.full_name_en) LIKE ? ESCAPE '\\' OR UPPER(p.national_id) LIKE ? ESCAPE '\\'
        ORDER BY p.patient_id DESC LIMIT 10`,
        [like, like, like, like]);
      if (!matches.length) {
        results.innerHTML = `<div style="padding:12px;color:#888;font-size:0.85rem;">${lang === 'ar' ? 'لا توجد نتائج' : 'No results'}</div>`;
        results.style.display = 'block';
        return;
      }
      results.innerHTML = matches.map(p => {
        const name = lang === 'ar' ? p.full_name_ar : (p.full_name_en || p.full_name_ar);
        return `<div onclick="document.getElementById('global-search').value='';document.getElementById('global-search-results').style.display='none';showPatientDetail(${p.patient_id});"
          style="padding:10px 14px;border-bottom:1px solid #f3f4f6;cursor:pointer;display:flex;align-items:center;gap:10px;"
          onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:0.88rem;">${escapeHtml(name)}</div>
            <div style="font-size:0.75rem;color:#666;">${escapeHtml(p.mrn)} ${p.phone ? '• ' + escapeHtml(p.phone) : ''}</div>
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

  // Patient session — portal (re-added as a "future online" concept; the patient
  // sees only their own record).
  if (session.role === 'patient') {
    const patient = getCurrentPatient();
    if (!patient) { showLoginScreen(); return; }
    document.getElementById('header-user-name').textContent = lang === 'ar' ? patient.full_name_ar : (patient.full_name_en || patient.full_name_ar);
    document.getElementById('header-user-role').textContent = lang === 'ar' ? 'بوابة المرضى' : 'Patient Portal';
    renderSidebar('patient');
    navigateToDefault('patient');
    const gs = document.getElementById('global-search-wrap'); if (gs) gs.style.display = 'none';
    const ib = document.getElementById('staff-inbox-wrap'); if (ib) ib.style.display = 'none';
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
  // Show first-time welcome tour for new users
  if (typeof maybeShowWelcomeTour === 'function') setTimeout(maybeShowWelcomeTour, 800);
}

// Open a patient's record. Clinical staff land on the odontogram/chart; front
// desk lands on the patient's appointments. The selected id is module-level so
// the per-patient dental views (Phase 5) can read it.
window.SELECTED_PATIENT_ID = null;
function showPatientDetail(patientId) {
  window.SELECTED_PATIENT_ID = patientId;
  const role = (typeof getCurrentUser === 'function' && getCurrentUser()) ? getCurrentUser().role : null;
  if (['dentist', 'specialist', 'hygienist'].includes(role)) navigateTo('dr-chart');
  else if (role === 'receptionist') navigateTo('rcp-appointments');
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
        { id: 'it-users',       icon: '&#128101;', label: t('user_management') },
        { id: 'it-specialties', icon: '&#129463;', label: t('specialty_setup') },
        { id: 'it-settings',    icon: '&#9881;',   label: t('system_settings') },
      ];
      break;
    case 'clinic_manager':
      items = [
        { id: 'mgr-overview', icon: '&#128202;', label: t('overview') },
        { id: 'mgr-audit',    icon: '&#128274;', label: t('blackbox_viewer') },
      ];
      break;
    // Dentist and Specialist share the clinical chair: odontogram, plans, Rx, schedule.
    case 'dentist':
    case 'specialist':
      items = [
        { id: 'dr-patients',     icon: '&#128101;', label: t('my_patients') },
        { id: 'dr-chart',        icon: '&#129463;', label: t('odontogram_nav') },
        { id: 'dr-plans',        icon: '&#128203;', label: t('treatment_plans_nav') },
        { id: 'dr-appointments', icon: '&#128197;', label: t('doc_appointments') },
      ];
      break;
    case 'hygienist':
      items = [
        { id: 'asst-patients', icon: '&#128101;', label: t('my_patients') },
        { id: 'asst-intake',   icon: '&#128203;', label: t('intake_nav') },
        { id: 'asst-perio',    icon: '&#129463;', label: t('perio_nav') },
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
    case 'patient': {
      // Patient portal — the patient sees only their OWN record (mirrors what the
      // clinic did). Re-added as a "future online" concept; LAN demo uses MRN+DOB.
      const patient = getCurrentPatient();
      let unreadMsgs = 0;
      if (patient) {
        const r = dbGet(`SELECT COUNT(*) as c FROM portal_messages WHERE patient_id = ? AND from_type='staff' AND read_at IS NULL`, [patient.patient_id]);
        unreadMsgs = r ? r.c : 0;
      }
      items = [
        { id: 'pp-overview',     icon: '&#127968;', label: t('pp_overview') },
        { id: 'pp-visits',       icon: '&#128203;', label: t('pp_visits') },
        { id: 'pp-labs',         icon: '&#129463;', label: t('pp_labs') },
        { id: 'pp-prescriptions',icon: '&#128138;', label: t('pp_prescriptions') },
        { id: 'pp-appointments', icon: '&#128197;', label: t('pp_appointments') },
        { id: 'pp-messages',     icon: '&#128172;', label: t('pp_messages') + (unreadMsgs > 0 ? ` <span class="sidebar-badge">${unreadMsgs}</span>` : '') },
      ];
      break;
    }
  }

  // Patient-safety incident reporting is cross-role: every staff member can file
  // one (appended here instead of duplicating into each role's menu); managers
  // and IT also get the review queue.
  if (role && role !== 'patient') {
    items.push({ id: 'incident-report', icon: '&#9888;', label: t('incident_report_nav') });
    if (role === 'clinic_manager' || role === 'it_admin') {
      items.push({ id: 'incident-queue', icon: '&#128203;', label: t('incident_queue_nav') });
    }
  }

  // Cross-role clinical tools: the Patient File (X-rays/scans/notes) and the
  // Recalls list (who is due + one-tap WhatsApp reminder).
  const CLINICAL_NAV = ['dentist', 'specialist', 'hygienist'];
  if (CLINICAL_NAV.includes(role)) {
    items.push({ id: 'documents', icon: '&#128193;', label: t('documents_nav') });
    items.push({ id: 'recalls', icon: '&#9200;', label: t('recalls_nav') });
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
    it_admin:       'it-users',
    clinic_manager: 'mgr-overview',
    dentist:        'dr-patients',
    specialist:     'dr-patients',
    hygienist:      'asst-patients',
    receptionist:   'rcp-queue',
    patient:        'pp-overview',
  };
  navigateTo(defaults[role] || 'it-users');
}

// Central view authorization. Every navigateTo target is a role-prefixed view and
// each role owns exactly one prefix (these mirror renderSidebar), so this map is
// the single source of truth for "who may open which view". Advisory in a
// browser-only app — a determined user can bypass client JS, so the real boundary
// needs a native authority (see README) — but it stops a patient session from
// rendering staff views (and vice-versa) instead of trusting the menu alone.
const VIEW_PREFIX_ROLES = {
  'it-':   ['it_admin'],
  'mgr-':  ['clinic_manager'],
  'dr-':   ['dentist', 'specialist'],
  'asst-': ['hygienist'],
  'rcp-':  ['receptionist'],
  'pp-':   ['patient'],
  // Patient-safety incident reporting is cross-role: any staff member may FILE
  // one; only oversight reviews/closes. These are full view ids (not shared
  // stems), so startsWith resolves each to its own role set.
  'incident-report': ['it_admin', 'clinic_manager', 'dentist', 'specialist', 'hygienist', 'receptionist'],
  'incident-queue':  ['it_admin', 'clinic_manager'],
  // Cross-role clinical tools (full view ids used as their own prefix keys).
  'documents': ['dentist', 'specialist', 'hygienist'],
  'recalls':   ['dentist', 'specialist', 'hygienist'],
};

function canAccessView(viewId, role) {
  if (!role) return false;
  const prefix = Object.keys(VIEW_PREFIX_ROLES).find(p => viewId.startsWith(p));
  if (!prefix) return true;            // unknown/non-prefixed view: don't block (renders the safe default)
  return VIEW_PREFIX_ROLES[prefix].includes(role);
}

// Handler-level role guard — defense in depth BEHIND the view dispatcher.
// The dispatcher stops wrong-role navigation, but mutating handlers are global
// functions: a stale onclick, a shared view, or a future refactor can reach
// them with the wrong role and write a row whose actor column lies about who
// is clinically allowed to act (e.g. a nurse id in prescriptions.verified_by).
// These fail closed with an audited denial; the role triggers in db.js enforce
// the same rule at the data layer in BOTH browser and server mode.
const DOCTOR_ROLES = ['dentist', 'specialist'];
function requireRole(allowedRoles, actionLabel) {
  const sess = (typeof getCurrentSession === 'function') ? getCurrentSession() : null;
  const role = sess ? sess.role : null;
  if (role && allowedRoles.includes(role)) return true;
  showError(currentLanguage() === 'ar' ? 'هذا الإجراء غير مسموح لدورك الوظيفي' : 'Your role is not authorized for this action');
  try { const r = logAction('ACTION_DENIED', `Role ${role || 'none'} blocked from ${actionLabel}`); if (r && r.catch) r.catch(() => {}); } catch (e) {}
  return false;
}

function navigateTo(viewId) {
  // Central authorization gate (see VIEW_PREFIX_ROLES).
  const sess = (typeof getCurrentSession === 'function') ? getCurrentSession() : null;
  const role = sess ? sess.role : null;
  if (!canAccessView(viewId, role)) {
    const denied = document.getElementById('main-content');
    if (denied) denied.innerHTML = `<div class="empty-state"><div class="empty-icon">&#128683;</div><p>${t('not_authorized')}</p></div>`;
    try { const r = logAction('VIEW_ACCESS_DENIED', `Blocked ${role || 'unauthenticated user'} from view ${viewId}`); if (r && r.catch) r.catch(() => {}); } catch (e) {}
    return;
  }

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
  setTimeout(() => {
    renderView(viewId);
    // a11y: move focus to the freshly-rendered view so screen-reader and
    // keyboard users land on the new content — unless the view already focused
    // something specific (e.g. a search box).
    const m = document.getElementById('main-content');
    if (m && !m.contains(document.activeElement)) {
      m.setAttribute('tabindex', '-1');
      m.focus({ preventScroll: true });
    }
  }, 50);
}

// Phase-1 scaffold: a friendly "coming next phase" card so every new dental
// view id renders something instead of falling through to the default. Each of
// these gets a real renderer in Phase 5.
function renderPlaceholder(main, lang, titleEn, titleAr) {
  const title = lang === 'ar' ? titleAr : titleEn;
  const note = lang === 'ar'
    ? 'هذه الشاشة قيد الإنشاء — ستتوفّر في المرحلة التالية من تحويل العيادة.'
    : 'This screen is being built — it arrives in the next phase of the clinic conversion.';
  main.innerHTML = `<div class="page-header"><h1>${escapeHtml(title)}</h1></div>
    <div class="empty-state"><div class="empty-icon">&#129463;</div><p>${escapeHtml(note)}</p></div>`;
}

function renderView(viewId) {
  const main = document.getElementById('main-content');
  const lang = currentLanguage();

  switch (viewId) {
    // ============================================================
    // OpenSmile (dental) views. Phase-1 skeleton: real screens are
    // reused where they already fit; the rest are placeholders that
    // get their real renderers in Phase 5.
    // ============================================================
    case 'it-specialties': renderITDepts(main, lang); break;   // departments table → dental specialties
    case 'mgr-overview':   renderMgrOverview(main, lang); break;
    case 'mgr-audit':      renderHMBlackbox(main, lang); break; // the "manager who sees the logs"
    case 'dr-patients':    renderDrPatients(main, lang); break;
    case 'dr-chart':       renderOdontogram(main, lang); break;
    case 'dr-plans':       renderTreatmentPlans(main, lang); break;
    case 'dr-appointments':renderDrAppointments(main, lang); break;
    case 'asst-patients':  renderAsstPatients(main, lang); break;
    case 'asst-intake':    renderAsstIntake(main, lang); break;
    case 'asst-perio':     renderAsstPerio(main, lang); break;

    // ---- IT Admin ----
    case 'it-users':    renderITUsers(main, lang); break;
    case 'it-depts':    renderITDepts(main, lang); break;
    case 'it-settings': renderITSettings(main, lang); break;

    // ---- Receptionist (front desk: queue, register, schedule, billing) ----
    case 'rcp-queue':        renderRCPQueue(main, lang); break;
    case 'rcp-register':     renderRCPRegister(main, lang); break;
    case 'rcp-appointments': renderRCPAppointments(main, lang); break;
    case 'rcp-billing':      renderRCPBilling(main, lang); break;

    // ---- Patient-safety incident reporting (file = all staff; queue = manager) ----
    case 'incident-report': renderIncidentReport(main, lang); break;
    case 'incident-queue':  renderIncidentQueue(main, lang); break;

    // ---- Cross-role clinical tools (dental) ----
    case 'documents': renderDocuments(main, lang); break;   // Patient File (X-rays/scans/notes)
    case 'recalls':   renderRecalls(main, lang); break;     // recare list + WhatsApp reminders

    // ---- Patient Portal (re-added as a "future online" concept; mirrors the record) ----
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
  // Disabling the portal must also kill any live patient session, otherwise the
  // patient stays logged in until the session expires. (Patient sessions are
  // stored with role='patient' and user_id = patient_id.)
  if (!newStatus) dbRun("DELETE FROM sessions WHERE user_id = ? AND role = 'patient'", [patientId]);
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
  if (pw.length < 8) { showError(t('password_min')); return; }

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
  const labWa = getSetting('lab_whatsapp', '');
  const ownerWa = getSetting('owner_whatsapp', '');
  const clinicName = getSetting('clinic_name', ar ? 'عيادة OpenSmile' : 'OpenSmile Dental');
  const defBranch = getSetting('default_branch', 'tagamo3');
  const debugOn = (typeof OPENSMILE_DEBUG !== 'undefined') ? OPENSMILE_DEBUG : true;
  const branchOpts = BRANCHES.map(b => `<option value="${b.key}" ${b.key === defBranch ? 'selected' : ''}>${escapeHtml(ar ? b.ar : b.en)}</option>`).join('');
  main.innerHTML = `
    <div class="page-header"><h1>${t('system_settings')}</h1></div>
    <div class="card">
      <div class="form-section">
        <h3>🦷 ${ar ? 'إعدادات العيادة' : 'Clinic Settings'}</h3>
        <div class="form-row">
          <div class="form-group"><label>${ar ? 'اسم العيادة' : 'Clinic name'}</label><input type="text" id="set-clinic-name" value="${escapeHtml(clinicName)}"></div>
          <div class="form-group"><label>${ar ? 'الفرع الافتراضي' : 'Default branch'}</label><select id="set-branch">${branchOpts}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${ar ? 'واتساب المعمل (للأشعة/الصور)' : 'Lab WhatsApp (for images)'}</label>
            <input type="tel" id="set-lab-wa" placeholder="+20 1X XXXX XXXX" value="${escapeHtml(labWa ? egDisplay(labWa) : '')}">
            <small style="color:#6b7280">${ar ? 'رقم مصري — يُحفظ دائماً ببادئة +20' : 'Egyptian number — always stored with the +20 prefix'}</small></div>
          <div class="form-group"><label>${ar ? 'واتساب المالك (للتأكيد)' : 'Owner WhatsApp (for confirmations)'}</label>
            <input type="tel" id="set-owner-wa" placeholder="+20 1X XXXX XXXX" value="${escapeHtml(ownerWa ? egDisplay(ownerWa) : '')}"></div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0"><input type="checkbox" id="set-debug" ${debugOn ? 'checked' : ''}> ${ar ? 'تسجيل خطوات التصحيح في الـ Console' : 'Log debug steps to the console'}</label>
        <button class="btn btn-primary" onclick="saveClinicSettings()">${ar ? 'حفظ الإعدادات' : 'Save settings'}</button>
      </div>
    </div>
    <div class="card">
      <div class="form-section">
        <h3>💬 ${ar ? 'ربط واتساب' : 'WhatsApp Integration'}</h3>
        <p class="mb-2" style="font-size:.85rem;color:#6b7280">${ar
          ? 'احفظ أرقام الواتساب أعلاه (المعمل والمالك). امسح رمز QR التالي لفتح محادثة واتساب مع العيادة مباشرة (للمرضى أو المعمل). الإرسال التلقائي للصور يتم تفعيله على خادم العيادة المحلي (LAN) لاحقاً عبر ربط الجهاز.'
          : 'Save the WhatsApp numbers above (lab + owner). Scan the QR below to open a WhatsApp chat with the clinic directly (for patients or the lab). Fully automatic image sending is enabled later on the LAN server by linking a device.'}</p>
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
          <div id="wa-qr" style="background:var(--white);padding:8px;border-radius:8px;display:inline-block"></div>
          <button class="btn btn-secondary" onclick="renderWhatsAppQR()">${ar ? 'إنشاء / تحديث رمز QR' : 'Generate / refresh QR'}</button>
        </div>
        <p id="wa-qr-note" style="font-size:.78rem;color:#9ca3af;margin-top:8px"></p>
      </div>
    </div>
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

function saveClinicSettings() {
  const lang = currentLanguage();
  try {
    setSetting('clinic_name', document.getElementById('set-clinic-name').value.trim());
    setSetting('default_branch', document.getElementById('set-branch').value);
    setSetting('lab_whatsapp', normalizeEgPhone(document.getElementById('set-lab-wa').value));
    setSetting('owner_whatsapp', normalizeEgPhone(document.getElementById('set-owner-wa').value));
    const dbg = document.getElementById('set-debug').checked;
    if (typeof setDebug === 'function') setDebug(dbg);
    saveDBToIndexedDB();
    dlog('settings.saved', { branch: getSetting('default_branch'), lab: getSetting('lab_whatsapp'), owner: getSetting('owner_whatsapp'), debug: dbg });
    showSuccess(lang === 'ar' ? 'تم حفظ الإعدادات' : 'Settings saved');
    navigateTo('it-settings');
  } catch (e) { derr('settings.save', e); showError(e.message); }
}

// Render a scannable QR of the clinic's WhatsApp (wa.me/<owner>) so patients or
// the lab can open a chat by scanning. Uses the bundled qrcode.js. Browser-only:
// this is "open a chat", not auto-send — true device-linking/auto-send lives on
// the LAN server (WhatsApp Cloud API) later.
function renderWhatsAppQR() {
  const lang = currentLanguage(); const ar = lang === 'ar';
  const box = document.getElementById('wa-qr'); const note = document.getElementById('wa-qr-note');
  if (!box) return;
  box.innerHTML = '';
  const num = getSetting('owner_whatsapp', '') || getSetting('lab_whatsapp', '');
  if (!num) { if (note) note.textContent = ar ? 'احفظ رقم واتساب المالك أولاً ثم أنشئ الرمز.' : 'Save the owner WhatsApp number first, then generate the QR.'; return; }
  const url = `https://wa.me/${num}`;
  try {
    if (typeof QRCode === 'undefined') { if (note) note.textContent = 'QR library not loaded.'; return; }
    new QRCode(box, { text: url, width: 168, height: 168, correctLevel: QRCode.CorrectLevel.M });
    if (note) note.textContent = (ar ? 'يفتح محادثة مع: ' : 'Opens a chat with: ') + egDisplay(num);
    dlog('whatsapp.qr', { url });
  } catch (e) { derr('whatsapp.qr', e); if (note) note.textContent = e.message; }
}

// ============================================================
// HOSPITAL MANAGER — Blackbox Viewer
// ============================================================

function renderHMBlackbox(main, lang) {
  // Log that manager opened the blackbox
  logAction('BLACKBOX_VIEWED', `Clinic Manager ${getCurrentUser().full_name_en} opened the Audit Log.`, `مدير العيادة ${getCurrentUser().full_name_ar} فتح سجل المراجعة`);

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
        <button class="btn btn-secondary" onclick="exportIntegrityReceipt()">${lang === 'ar' ? 'تصدير إيصال السلامة' : 'Export receipt'}</button>
        <button class="btn btn-secondary" onclick="verifyReceiptPrompt()">${lang === 'ar' ? 'تحقق مقابل إيصال' : 'Verify vs receipt'}</button>
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
      <div style="font-size:0.8rem;color:#92400e;margin-top:8px;line-height:1.5">
        ${lang === 'ar'
          ? '⚠ هذا يثبت فقط أن السلسلة متسقة داخلياً. لا يمكنه كشف إعادة كتابة كاملة وإعادة حساب من شخص لديه صلاحية الكتابة على قاعدة البيانات (لا يوجد مفتاح سري). للحماية الحقيقية: صدّر «إيصال السلامة» واحفظه خارج الجهاز، ثم استخدم «تحقق مقابل إيصال».'
          : '⚠ This only proves the chain is internally self-consistent. It CANNOT detect a full rewrite-and-recompute by someone with database write access (there is no secret key). For real tamper-evidence: export an integrity receipt, store it out of band, and later use "Verify vs receipt".'}
      </div>
    </div>`;
  } else {
    el.innerHTML = `<div class="card mb-2" style="background:var(--danger-light);border-left:4px solid var(--danger);padding:16px;">
      <strong>${lang === 'ar' ? 'سلامة السجل: فشل' : 'Integrity Check: FAILED'}</strong> — ${lang === 'ar' ? 'خلل في السجل رقم' : 'Broken at log_id'} ${result.brokenAt} (${escapeHtml(result.reason)})
    </div>`;
  }
}

// Export the chain head + count as a receipt to be recorded OUT OF BAND. A keyless
// hash chain can be fully recomputed by anyone with DB access; an externally-held
// receipt is the only client-side way to later detect that recompute.
function exportIntegrityReceipt() {
  const lang = currentLanguage();
  const receipt = getIntegrityReceipt();
  const json = JSON.stringify(receipt, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `openward_integrity_receipt_${receipt.generated_at.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showModal(`
    <h2 style="margin-top:0">🧾 ${lang === 'ar' ? 'إيصال سلامة السجل' : 'Audit-log integrity receipt'}</h2>
    <p style="color:#555">${lang === 'ar'
      ? 'احفظ هذا الإيصال خارج الجهاز (اطبعه أو أرسله للجهة المختصة). لاحقاً، إذا أُعيدت كتابة السجل، فلن يتطابق عبر «تحقق مقابل إيصال».'
      : 'Keep this receipt OFF the device (print it, or email compliance). Later, if the log is rewritten, it will not match under "Verify vs receipt".'}</p>
    <textarea readonly rows="7" style="width:100%;font-family:monospace;font-size:0.85rem">${escapeHtml(json)}</textarea>
    <div class="flex gap-1" style="justify-content:flex-end;margin-top:8px"><button class="btn btn-primary" onclick="closeModal()">${t('close_btn')}</button></div>
  `, { maxWidth: 540 });
}

// Check the chain against a previously-saved receipt — the only way to catch a
// full recompute that internal verification would pass.
function verifyReceiptPrompt() {
  const lang = currentLanguage();
  const overlay = showModal(`
    <h2 style="margin-top:0">🧾 ${lang === 'ar' ? 'تحقق مقابل إيصال محفوظ' : 'Verify against a saved receipt'}</h2>
    <p style="color:#555">${lang === 'ar' ? 'الصق محتوى إيصال السلامة الذي حفظته سابقاً.' : 'Paste the integrity receipt you saved earlier.'}</p>
    <textarea id="receipt-input" rows="7" style="width:100%;font-family:monospace;font-size:0.85rem" placeholder='{ "head_log_id": ..., "head_hash": "...", "log_count": ... }'></textarea>
    <div id="receipt-verify-result" style="margin-top:8px"></div>
    <div class="flex gap-1" style="justify-content:flex-end;margin-top:8px">
      <button class="btn btn-secondary" onclick="closeModal()">${t('cancel_btn')}</button>
      <button class="btn btn-primary" id="receipt-verify-btn">${lang === 'ar' ? 'تحقق' : 'Verify'}</button>
    </div>
  `, { maxWidth: 540 });
  overlay.querySelector('#receipt-verify-btn').addEventListener('click', async () => {
    const out = overlay.querySelector('#receipt-verify-result');
    let receipt;
    try { receipt = JSON.parse(overlay.querySelector('#receipt-input').value.trim()); }
    catch (e) { out.innerHTML = `<span style="color:var(--danger)">${lang === 'ar' ? 'إيصال غير صالح' : 'Invalid receipt JSON'}</span>`; return; }
    const r = await verifyAgainstReceipt(receipt);
    if (r.valid && r.matchesReceipt) {
      out.innerHTML = `<div style="color:var(--success);font-weight:600">✓ ${lang === 'ar' ? 'مطابق: لم تتغيّر السلسلة منذ الإيصال.' : 'Match — the chain is unchanged since the receipt.'}</div>`;
    } else {
      const reason = r.receiptReason || r.reason || (lang === 'ar' ? 'فشل التحقق الداخلي' : 'internal verification failed');
      out.innerHTML = `<div style="color:var(--danger);font-weight:700">✗ ${lang === 'ar' ? 'تحذير: تم العبث بالسجل' : 'TAMPERING DETECTED'} — ${escapeHtml(reason)}</div>`;
    }
  });
}

function renderHMReports(main, lang) {
  const totalPatients = dbGet('SELECT COUNT(*) as c FROM patients').c;
  const activeAdmissions = dbGet('SELECT COUNT(*) as c FROM admissions WHERE status = ?', ['active']).c;
  const dischargedToday = dbGet("SELECT COUNT(*) as c FROM admissions WHERE status = 'discharged' AND discharged_at >= ?", [todayISO()]).c;
  const admittedToday = dbGet("SELECT COUNT(*) as c FROM admissions WHERE admitted_at >= ?", [todayISO()]).c;
  const pendingLabs = dbGet("SELECT COUNT(*) as c FROM lab_orders WHERE status IN ('ordered','collected','received')").c;
  const completedLabs = dbGet("SELECT COUNT(*) as c FROM lab_orders WHERE status = 'resulted'").c;
  const pendingRx = dbGet("SELECT COUNT(*) as c FROM prescriptions WHERE status = 'active'").c;
  const unpaidInvoices = dbGet("SELECT COUNT(*) as c FROM invoices WHERE status = 'unpaid'") || {c:0};
  const totalRevenue = dbGet("SELECT COALESCE(SUM(total),0) as s FROM invoices WHERE status = 'paid'") || {s:0};

  // Department census
  const deptCensus = dbAll(`SELECT d.name_en, d.name_ar, COUNT(a.admission_id) as cnt
    FROM departments d LEFT JOIN admissions a ON d.dept_id = a.dept_id AND a.status = 'active'
    WHERE d.type NOT IN ('admin','support') GROUP BY d.dept_id HAVING cnt > 0 ORDER BY cnt DESC`);

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
// DOCTOR — Write Prescription
// ============================================================

function renderDocRx(main, lang) {
  const session = getCurrentSession();
  const patients = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id
    FROM case_assignments ca JOIN admissions a ON ca.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    WHERE ca.doctor_id = ? AND a.status = 'active'`, [session.user_id]);

  if (!patients.length) { main.innerHTML = `<div class="page-header"><h1>${t('write_prescription')}</h1></div>${emptyState()}`; return; }

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

// Drug-class allergen matcher: checkDrugAllergy() now lives in
// js/allergy-check.js (loaded before this file) so the LAN server can require()
// the SAME curated table — previously the server's "authoritative" check was
// substring-only and let Amoxicillin past a documented Penicillin allergy. The
// shared version also adds cross-reactivity hits (penicillin → cephalosporin /
// carbapenem, aspirin ↔ NSAIDs) returned with _cross:true.

async function handlePrescribe(e) {
  e.preventDefault();
  const lang = currentLanguage();
  const user = getCurrentUser();
  if (!user) { showError(lang === 'ar' ? 'انتهت الجلسة' : 'Session expired'); return; }
  if (!requireRole(DOCTOR_ROLES, 'prescribing')) return;

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
    // RAW text only: showRedAlert/showYellowAlert escapeHtml() the whole message
    // themselves (and render their own ⚠ icon). Pre-escaping here double-escaped
    // the highest-severity bedside alert — the &#9888; entity displayed as
    // literal text and an allergen like "Penicillin & Sulfa" rendered as
    // "Penicillin &amp; Sulfa".
    const msg = allergyMatch._cross
      ? (lang === 'ar'
        ? `تحسس تصالبي محتمل! المريض لديه حساسية موثقة من: ${allergyMatch.allergen} (${allergyMatch.severity || '—'}) وهذا الدواء من فئة قد تتفاعل معها (${allergyMatch._cross_note}).`
        : `POSSIBLE CROSS-REACTIVITY! Patient has a documented allergy to ${allergyMatch.allergen} (${allergyMatch.severity || '—'}) and this drug is in a potentially cross-reactive class (${allergyMatch._cross_note}).`)
      : (lang === 'ar'
        ? `تنبيه حساسية! المريض لديه حساسية من: ${allergyMatch.allergen} (${allergyMatch.severity || '—'}). التفاعل: ${allergyMatch.reaction || '—'}`
        : `ALLERGY ALERT! Patient has documented allergy to: ${allergyMatch.allergen} (${allergyMatch.severity || '—'}). Reaction: ${allergyMatch.reaction || '—'}`);
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
  // Collect interactions against ALL current prescriptions BEFORE alerting.
  // Returning on the first hit let a RED interaction later in the rx list slip
  // through unacknowledged once a milder one was confirmed.
  const currentRxs = dbAll("SELECT drug_id FROM prescriptions WHERE admission_id = ? AND status = 'active'", [admissionId]);
  const seen = new Set();
  const interactions = [];
  for (const rx of currentRxs) {
    const interaction = dbGet('SELECT * FROM drug_interactions WHERE (drug_a_id = ? AND drug_b_id = ?) OR (drug_a_id = ? AND drug_b_id = ?)',
      [drugId, rx.drug_id, rx.drug_id, drugId]);
    if (interaction && !seen.has(interaction.id)) {
      seen.add(interaction.id);
      interactions.push(interaction);
    }
  }

  // Drug-vs-CONDITION contraindications (metformin/renal failure, NSAID/renal,
  // beta-blocker/asthma, opioid/liver, warfarin/liver …) ride the same alert
  // pipeline as drug-drug hits: worst severity wins, red requires an
  // override-with-reason. The checker (utils.js) keys off the same
  // patient_conditions.condition_code values the registration form writes.
  const condCodes = dbAll('SELECT condition_code FROM patient_conditions WHERE patient_id = ?', [admission.patient_id]).map(r => r.condition_code);
  checkDrugConditionInteractions(drugName, condCodes).forEach((w, i) => {
    interactions.push({ id: 'cond-' + i, severity: w.severity, description: w.message_en, description_ar: w.message_ar });
  });

  if (interactions.length) {
    const lang = currentLanguage();
    const rank = s => s === 'red' ? 2 : s === 'yellow' ? 1 : 0;
    interactions.sort((a, b) => rank(b.severity) - rank(a.severity));
    const worst = interactions[0];
    const msg = interactions.map(i => lang === 'ar' ? (i.description_ar || i.description) : i.description).join(' • ');
    const logList = interactions.map(i => i.description).join('; ');
    if (worst.severity === 'red') {
      showRedAlert(msg, async (reason) => {
        await logAction('ALERT_OVERRIDDEN',
          `${user.full_name_en} overrode RED ALERT for patient ${admission.full_name_en || admission.full_name_ar}: ${logList}. Override reason: ${reason}`,
          null, admission.patient_id, admission.full_name_en || admission.full_name_ar, admission.mrn);
        await doInsertPrescription(admissionId, drugId, drugName, dose, route, freq, dur, notes, admission, user);
      });
      return;
    } else if (worst.severity === 'yellow') {
      showYellowAlert(msg, async () => {
        await doInsertPrescription(admissionId, drugId, drugName, dose, route, freq, dur, notes, admission, user);
      });
      return;
    } else {
      showBlueAlert(msg);
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
// DOCTOR / CONSULTANT — Problem List (ICD-10 coded) + Patient Flags
// ============================================================

// Patients this clinician can chart against: case-assigned active patients first
// (same source as the Rx/labs screens); if none are assigned, fall back to all
// active admissions so a consultant covering the department still has a worklist.
function _problemListPatients(session) {
  const uid = session ? session.user_id : 0;
  let rows = dbAll(`SELECT DISTINCT p.patient_id, p.mrn, p.full_name_ar, p.full_name_en
    FROM case_assignments ca JOIN admissions a ON ca.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    WHERE ca.doctor_id = ? AND a.status = 'active' ORDER BY p.patient_id DESC`, [uid]);
  if (!rows.length) rows = dbAll(`SELECT DISTINCT p.patient_id, p.mrn, p.full_name_ar, p.full_name_en
    FROM patients p JOIN admissions a ON a.patient_id = p.patient_id
    WHERE a.status = 'active' ORDER BY p.patient_id DESC LIMIT 200`);
  return rows;
}

// Human label for a condition row: explicit display, else the ICD-10 dataset's
// localized name, else the humanized legacy token.
function _conditionLabel(c, lang) {
  if (c.display) return c.display;
  if (typeof ICD10 !== 'undefined') {
    const hit = ICD10.find(e => e.code === c.condition_code);
    if (hit) return lang === 'ar' ? hit.ar : hit.en;
  }
  return String(c.condition_code || '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

const FLAG_COLOR_HEX = { info: '#0ea5e9', warn: '#d97706', danger: '#dc2626' };

function renderProblemListBody(pid, lang) {
  const patient = dbGet('SELECT patient_id, mrn, full_name_ar, full_name_en FROM patients WHERE patient_id = ?', [pid]);
  if (!patient) return emptyState();
  const active = dbAll("SELECT * FROM patient_conditions WHERE patient_id = ? AND COALESCE(status,'active') <> 'resolved' ORDER BY id DESC", [pid]);
  const resolved = dbAll("SELECT * FROM patient_conditions WHERE patient_id = ? AND status = 'resolved' ORDER BY resolved_date DESC, id DESC", [pid]);
  const flags = dbAll('SELECT * FROM patient_flags WHERE patient_id = ? AND active = 1 ORDER BY flag_id DESC', [pid]);
  const icdOptions = (typeof ICD10 !== 'undefined' ? ICD10 : []).map(e =>
    `<option value="${escapeHtml(e.code)}">${escapeHtml(e.code)} — ${lang === 'ar' ? escapeHtml(e.ar) : escapeHtml(e.en)}</option>`).join('');
  const sevOptions = ['mild', 'moderate', 'severe'].map(s => `<option value="${s}">${t('sev_' + s)}</option>`).join('');

  const activeRows = active.length ? active.map(c => {
    const coded = /^[A-Za-z]\d/.test(c.condition_code || '');
    return `<tr>
      <td>${coded ? `<code>${escapeHtml(c.condition_code)}</code> ` : ''}${escapeHtml(_conditionLabel(c, lang))}</td>
      <td>${c.severity ? escapeHtml(t('sev_' + c.severity)) : '—'}</td>
      <td>${c.onset_date ? escapeHtml(String(c.onset_date).slice(0, 10)) : '—'}</td>
      <td><button class="btn btn-sm btn-secondary" onclick="resolveProblem(${c.id}, ${pid})">${t('pl_resolve')}</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="4" class="muted">${t('pl_no_problems')}</td></tr>`;

  const resolvedRows = resolved.map(c => {
    const coded = /^[A-Za-z]\d/.test(c.condition_code || '');
    return `<tr class="muted">
      <td>${coded ? `<code>${escapeHtml(c.condition_code)}</code> ` : ''}${escapeHtml(_conditionLabel(c, lang))}</td>
      <td>${c.resolved_date ? escapeHtml(String(c.resolved_date).slice(0, 10)) : '—'}</td>
    </tr>`;
  }).join('');

  const flagChips = flags.length ? flags.map(f =>
    `<span class="spb-badge" style="background:${FLAG_COLOR_HEX[f.color] || FLAG_COLOR_HEX.info};color:#fff;">&#9873; ${escapeHtml(lang === 'ar' && f.label_ar ? f.label_ar : f.label_en)}<button onclick="removeFlag(${f.flag_id}, ${pid})" title="${t('pl_flag_remove')}" style="background:none;border:none;color:#fff;cursor:pointer;font-size:1.1em;margin-${lang === 'ar' ? 'right' : 'left'}:4px;">&times;</button></span>`).join(' ')
    : `<span class="muted">${t('pl_no_flags')}</span>`;

  return `
    <div class="card">
      <h3>${t('pl_active_problems')}</h3>
      <table class="table">
        <thead><tr><th>${t('pl_problem')}</th><th>${t('pl_severity')}</th><th>${t('pl_onset')}</th><th></th></tr></thead>
        <tbody>${activeRows}</tbody>
      </table>
      <form onsubmit="addProblem(event, ${pid})" class="form-row" style="margin-top:12px;align-items:flex-end;">
        <div class="form-group" style="flex:2;">
          <label>${t('pl_add_problem')}</label>
          <input type="text" id="pl-code" list="pl-icd-list" autocomplete="off" placeholder="${t('pl_search_icd')}">
          <datalist id="pl-icd-list">${icdOptions}</datalist>
        </div>
        <div class="form-group"><label>${t('pl_severity')}</label><select id="pl-severity"><option value="">—</option>${sevOptions}</select></div>
        <div class="form-group"><label>${t('pl_onset')}</label><input type="date" id="pl-onset"></div>
        <div class="form-group"><button type="submit" class="btn btn-primary">${t('pl_add_btn')}</button></div>
      </form>
    </div>
    ${resolved.length ? `<div class="card"><h3>${t('pl_resolved')}</h3>
      <table class="table"><thead><tr><th>${t('pl_problem')}</th><th>${t('pl_resolved_on')}</th></tr></thead><tbody>${resolvedRows}</tbody></table></div>` : ''}
    <div class="card">
      <h3>${t('pl_flags')}</h3>
      <div style="margin-bottom:10px;">${flagChips}</div>
      <form onsubmit="addFlag(event, ${pid})" class="form-row" style="align-items:flex-end;">
        <div class="form-group" style="flex:2;"><label>${t('pl_flag_label')}</label><input type="text" id="pl-flag-label" maxlength="40" placeholder="${lang === 'ar' ? 'مثال: خطر السقوط' : 'e.g. Fall risk'}"></div>
        <div class="form-group"><label>${t('pl_flag_label_ar')}</label><input type="text" id="pl-flag-label-ar" maxlength="40"></div>
        <div class="form-group"><label>${t('pl_flag_color')}</label><select id="pl-flag-color">
          <option value="info">${t('pl_color_info')}</option>
          <option value="warn">${t('pl_color_warn')}</option>
          <option value="danger">${t('pl_color_danger')}</option>
        </select></div>
        <div class="form-group"><button type="submit" class="btn btn-primary">${t('pl_add_flag')}</button></div>
      </form>
    </div>`;
}

function renderProblemList(main, lang) {
  const session = getCurrentSession();
  const patients = _problemListPatients(session);
  if (!patients.length) { main.innerHTML = `<div class="page-header"><h1>${t('problem_list')}</h1></div>${emptyState()}`; return; }
  const pid = patients[0].patient_id;
  const patOptions = patients.map(p =>
    `<option value="${p.patient_id}">${escapeHtml(p.mrn)} — ${lang === 'ar' ? escapeHtml(p.full_name_ar) : escapeHtml(p.full_name_en || p.full_name_ar)}</option>`).join('');
  main.innerHTML = `
    <div class="page-header"><h1>${t('problem_list')}</h1></div>
    <div class="card">
      <div class="form-group"><label>${t('patient_col')}</label>
        <select id="pl-patient" onchange="navigateProblemList(this.value)">${patOptions}</select></div>
    </div>
    <div id="pl-body">${renderProblemListBody(pid, lang)}</div>`;
}

function navigateProblemList(pid) {
  const body = document.getElementById('pl-body');
  if (body) body.innerHTML = renderProblemListBody(parseInt(pid, 10), currentLanguage());
}

async function addProblem(e, pid) {
  e.preventDefault();
  const lang = currentLanguage();
  if (!requireRole(DOCTOR_ROLES, 'editing the problem list')) return;
  const user = getCurrentUser();
  const raw = (document.getElementById('pl-code').value || '').trim();
  const severity = document.getElementById('pl-severity').value || null;
  const onset = document.getElementById('pl-onset').value || null;
  if (!raw) { showError(lang === 'ar' ? 'أدخل رمز ICD-10 أو تشخيصًا' : 'Enter an ICD-10 code or diagnosis'); return; }
  // Match against the curated ICD-10 set (by code or localized name); otherwise
  // record it as a free-text problem so nothing is lost.
  let code = raw, display = raw, codeSystem = 'text';
  if (typeof ICD10 !== 'undefined') {
    const hit = ICD10.find(en => en.code.toLowerCase() === raw.toLowerCase()
      || en.en.toLowerCase() === raw.toLowerCase() || en.ar === raw);
    if (hit) { code = hit.code; display = lang === 'ar' ? hit.ar : hit.en; codeSystem = 'icd10'; }
  }
  const patient = dbGet('SELECT mrn, full_name_en, full_name_ar FROM patients WHERE patient_id = ?', [pid]);
  dbRun(`INSERT INTO patient_conditions (patient_id, condition_code, code_system, display, severity, onset_date, status, added_by, added_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [pid, code, codeSystem, display, severity, onset, user ? user.user_id : null, nowISO()]);
  await logAction('PROBLEM_ADDED', `Added problem ${display} (${code}) to the problem list`,
    `أضيف تشخيص ${display} (${code}) لقائمة المشاكل`, pid, patient ? (patient.full_name_en || patient.full_name_ar) : null, patient ? patient.mrn : null);
  showSuccess(t('problem_added'));
  saveDBToIndexedDB();
  navigateProblemList(pid);
}

async function resolveProblem(id, pid) {
  if (!requireRole(DOCTOR_ROLES, 'resolving a problem')) return;
  const cond = dbGet('SELECT * FROM patient_conditions WHERE id = ?', [id]);
  if (!cond) return;
  const patient = dbGet('SELECT mrn, full_name_en, full_name_ar FROM patients WHERE patient_id = ?', [pid]);
  dbRun("UPDATE patient_conditions SET status = 'resolved', resolved_date = ? WHERE id = ?", [nowISO().slice(0, 10), id]);
  await logAction('PROBLEM_RESOLVED', `Resolved problem ${cond.display || cond.condition_code}`,
    `تم حل تشخيص ${cond.display || cond.condition_code}`, pid, patient ? (patient.full_name_en || patient.full_name_ar) : null, patient ? patient.mrn : null);
  showSuccess(t('problem_resolved'));
  saveDBToIndexedDB();
  navigateProblemList(pid);
}

async function addFlag(e, pid) {
  e.preventDefault();
  const lang = currentLanguage();
  if (!requireRole(DOCTOR_ROLES, 'adding a patient flag')) return;
  const user = getCurrentUser();
  const labelEn = (document.getElementById('pl-flag-label').value || '').trim();
  const labelAr = (document.getElementById('pl-flag-label-ar').value || '').trim();
  const color = document.getElementById('pl-flag-color').value || 'info';
  if (!labelEn && !labelAr) { showError(lang === 'ar' ? 'أدخل نص العلامة' : 'Enter a flag label'); return; }
  const patient = dbGet('SELECT mrn, full_name_en, full_name_ar FROM patients WHERE patient_id = ?', [pid]);
  dbRun('INSERT INTO patient_flags (patient_id, label_en, label_ar, color, created_by, created_at, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
    [pid, labelEn || labelAr, labelAr || null, color, user ? user.user_id : null, nowISO()]);
  await logAction('FLAG_ADDED', `Added patient flag "${labelEn || labelAr}"`, `أضيفت علامة المريض "${labelAr || labelEn}"`,
    pid, patient ? (patient.full_name_en || patient.full_name_ar) : null, patient ? patient.mrn : null);
  showSuccess(t('flag_added'));
  saveDBToIndexedDB();
  navigateProblemList(pid);
}

async function removeFlag(flagId, pid) {
  if (!requireRole(DOCTOR_ROLES, 'removing a patient flag')) return;
  const patient = dbGet('SELECT mrn, full_name_en, full_name_ar FROM patients WHERE patient_id = ?', [pid]);
  dbRun('UPDATE patient_flags SET active = 0 WHERE flag_id = ?', [flagId]);
  await logAction('FLAG_REMOVED', `Removed patient flag #${flagId}`, `أزيلت علامة المريض #${flagId}`,
    pid, patient ? (patient.full_name_en || patient.full_name_ar) : null, patient ? patient.mrn : null);
  showSuccess(t('flag_removed'));
  saveDBToIndexedDB();
  navigateProblemList(pid);
}

// ============================================================
// INTERNAL REFERRAL / CONSULT REQUEST (LAN adaptation of OSCAR messaging)
// ============================================================
const REFERRAL_ROLES = ['dentist', 'specialist'];

function renderReferrals(main, lang) {
  const session = getCurrentSession();
  const user = getCurrentUser();
  const myDept = user ? user.department_id : null;
  const patients = _problemListPatients(session);
  const depts = dbAll('SELECT dept_id, name_ar, name_en FROM departments ORDER BY dept_id');
  const patOptions = patients.map(p => `<option value="${p.patient_id}">${escapeHtml(p.mrn)} — ${lang === 'ar' ? escapeHtml(p.full_name_ar) : escapeHtml(p.full_name_en || p.full_name_ar)}</option>`).join('');
  const deptOptions = depts.map(d => `<option value="${d.dept_id}">${lang === 'ar' ? escapeHtml(d.name_ar) : escapeHtml(d.name_en)}</option>`).join('');
  const nameOf = (en, ar) => escapeHtml(lang === 'ar' ? (ar || en || '') : (en || ar || ''));

  const inbox = myDept ? dbAll(`SELECT r.*, p.mrn, p.full_name_ar, p.full_name_en, uf.full_name_en AS fe, uf.full_name_ar AS fa
    FROM referrals r JOIN patients p ON r.patient_id = p.patient_id LEFT JOIN users uf ON uf.user_id = r.from_user
    WHERE r.to_dept = ? AND r.status IN ('open','accepted') ORDER BY r.referral_id DESC`, [myDept]) : [];
  const sent = user ? dbAll(`SELECT r.*, p.mrn, p.full_name_ar, p.full_name_en, d.name_en AS dne, d.name_ar AS dna
    FROM referrals r JOIN patients p ON r.patient_id = p.patient_id LEFT JOIN departments d ON d.dept_id = r.to_dept
    WHERE r.from_user = ? ORDER BY r.referral_id DESC LIMIT 50`, [user.user_id]) : [];

  const inboxRows = inbox.length ? inbox.map(r => `<tr>
      <td>${escapeHtml(r.mrn)} — ${nameOf(r.full_name_en, r.full_name_ar)}</td>
      <td>${nameOf(r.fe, r.fa)}</td>
      <td>${r.urgency === 'urgent' ? `<span class="spb-badge" style="background:#dc2626;color:#fff;">${t('ref_urgent')}</span>` : t('ref_routine')}</td>
      <td>${escapeHtml(r.reason || '')}</td>
      <td>${t('ref_status_' + r.status)}</td>
      <td><input type="text" id="ref-note-${r.referral_id}" placeholder="${t('ref_response')}" style="max-width:150px;">
        ${r.status === 'open' ? `<button class="btn btn-sm btn-secondary" onclick="respondReferral(${r.referral_id},'accept')">${t('ref_accept')}</button>` : ''}
        <button class="btn btn-sm btn-primary" onclick="respondReferral(${r.referral_id},'complete')">${t('ref_complete')}</button>
        <button class="btn btn-sm btn-danger" onclick="respondReferral(${r.referral_id},'decline')">${t('ref_decline')}</button></td>
    </tr>`).join('') : `<tr><td colspan="6" class="muted">${t('ref_none')}</td></tr>`;

  const sentRows = sent.length ? sent.map(r => `<tr>
      <td>${escapeHtml(r.mrn)} — ${nameOf(r.full_name_en, r.full_name_ar)}</td>
      <td>${nameOf(r.dne, r.dna)}</td>
      <td>${t('ref_status_' + r.status)}</td>
      <td>${escapeHtml(r.reason || '')}</td>
      <td>${r.response_note ? escapeHtml(r.response_note) : '—'}</td>
    </tr>`).join('') : `<tr><td colspan="5" class="muted">${t('ref_none')}</td></tr>`;

  main.innerHTML = `
    <div class="page-header"><h1>${t('referrals_title')}</h1></div>
    <div class="card">
      <h3>${t('ref_new')}</h3>
      <form onsubmit="createReferral(event)">
        <div class="form-row">
          <div class="form-group" style="flex:2;"><label>${t('ref_patient')} *</label><select id="ref-patient" required>${patOptions}</select></div>
          <div class="form-group"><label>${t('ref_to_dept')} *</label><select id="ref-dept" required>${deptOptions}</select></div>
          <div class="form-group"><label>${t('ref_urgency')}</label><select id="ref-urgency"><option value="routine">${t('ref_routine')}</option><option value="urgent">${t('ref_urgent')}</option></select></div>
        </div>
        <div class="form-group"><label>${t('ref_specialty')}</label><input type="text" id="ref-specialty" maxlength="60"></div>
        <div class="form-group"><label>${t('ref_reason')} *</label><textarea id="ref-reason" rows="2" required></textarea></div>
        <button type="submit" class="btn btn-primary">${t('ref_submit')}</button>
      </form>
    </div>
    <div class="card"><h3>${t('ref_inbox')}</h3>
      <table class="table"><thead><tr><th>${t('ref_patient')}</th><th>${t('ref_from')}</th><th>${t('ref_urgency')}</th><th>${t('ref_reason')}</th><th>${t('status')}</th><th></th></tr></thead><tbody>${inboxRows}</tbody></table></div>
    <div class="card"><h3>${t('ref_outbox')}</h3>
      <table class="table"><thead><tr><th>${t('ref_patient')}</th><th>${t('ref_to_dept')}</th><th>${t('status')}</th><th>${t('ref_reason')}</th><th>${t('ref_response')}</th></tr></thead><tbody>${sentRows}</tbody></table></div>`;
}

async function createReferral(e) {
  e.preventDefault();
  const lang = currentLanguage();
  if (!requireRole(REFERRAL_ROLES, 'creating a referral')) return;
  const user = getCurrentUser();
  const pid = parseInt(document.getElementById('ref-patient').value, 10);
  const dept = parseInt(document.getElementById('ref-dept').value, 10) || null;
  const urgency = document.getElementById('ref-urgency').value || 'routine';
  const specialty = document.getElementById('ref-specialty').value.trim() || null;
  const reason = document.getElementById('ref-reason').value.trim();
  if (!pid || !reason) { showError(lang === 'ar' ? 'المريض والسبب مطلوبان' : 'Patient and reason are required'); return; }
  const adm = dbGet("SELECT admission_id FROM admissions WHERE patient_id = ? AND status='active' ORDER BY admission_id DESC LIMIT 1", [pid]);
  const patient = dbGet('SELECT mrn, full_name_en, full_name_ar FROM patients WHERE patient_id = ?', [pid]);
  dbRun('INSERT INTO referrals (patient_id, admission_id, from_user, to_dept, to_specialty, reason, urgency, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [pid, adm ? adm.admission_id : null, user ? user.user_id : null, dept, specialty, reason, urgency, 'open', nowISO()]);
  await logAction('REFERRAL_CREATED', `Referred patient to dept ${dept} (${urgency}): ${reason}`, `إحالة المريض للقسم ${dept}`, pid, patient ? (patient.full_name_en || patient.full_name_ar) : null, patient ? patient.mrn : null);
  showSuccess(t('ref_sent'));
  saveDBToIndexedDB();
  renderView('referrals');
}

async function respondReferral(id, action) {
  if (!requireRole(REFERRAL_ROLES, 'responding to a referral')) return;
  const user = getCurrentUser();
  const noteEl = document.getElementById('ref-note-' + id);
  const note = noteEl ? noteEl.value.trim() : '';
  const status = action === 'accept' ? 'accepted' : (action === 'complete' ? 'completed' : 'declined');
  const ref = dbGet('SELECT patient_id FROM referrals WHERE referral_id = ?', [id]);
  dbRun('UPDATE referrals SET status = ?, responded_by = ?, response_note = COALESCE(NULLIF(?, \'\'), response_note), responded_at = ? WHERE referral_id = ?',
    [status, user ? user.user_id : null, note, nowISO(), id]);
  await logAction('REFERRAL_UPDATED', `Referral #${id} -> ${status}${note ? ': ' + note : ''}`, `تحديث الإحالة #${id}`, ref ? ref.patient_id : null);
  showSuccess(t('ref_updated'));
  saveDBToIndexedDB();
  renderView('referrals');
}

// ============================================================
// CARE-GAP / PREVENTIVE REMINDERS (decision-rules in the safety-nudge style)
// ============================================================
const CAREGAP_ROLES = ['doctor', 'consultant', 'emergency_doctor', 'triage_nurse', 'senior_nurse', 'nurse'];
const CARE_GAP_LABELS = { code_status: 'cg_code_status', vte: 'cg_vte', vitals: 'cg_vitals', allergy: 'cg_allergy', vaccine: 'cg_vaccine' };

function computeCareGaps(a) {
  const dismissed = new Set(dbAll('SELECT gap_key FROM care_gap_overrides WHERE admission_id = ?', [a.admission_id]).map(r => r.gap_key));
  const gaps = [];
  const add = k => { if (!dismissed.has(k)) gaps.push(k); };
  if (!a.code_status || a.code_status === 'unknown') add('code_status');
  const cutoff24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  if (a.admitted_at && a.admitted_at < cutoff24) {
    const anticoag = dbGet(`SELECT 1 AS x FROM prescriptions WHERE admission_id = ? AND status='active' AND (
      lower(drug_name) LIKE '%heparin%' OR lower(drug_name) LIKE '%enoxaparin%' OR lower(drug_name) LIKE '%warfarin%' OR
      lower(drug_name) LIKE '%apixaban%' OR lower(drug_name) LIKE '%rivaroxaban%' OR lower(drug_name) LIKE '%dabigatran%' OR
      lower(drug_name) LIKE '%dalteparin%' OR lower(drug_name) LIKE '%fondaparinux%')`, [a.admission_id]);
    if (!anticoag) add('vte');
  }
  const cutoff12 = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const lastV = dbGet('SELECT MAX(recorded_at) AS m FROM vitals_log WHERE admission_id = ?', [a.admission_id]);
  if (!lastV || !lastV.m || lastV.m < cutoff12) add('vitals');
  if (!dbGet('SELECT 1 AS x FROM patient_allergies WHERE patient_id = ?', [a.patient_id])) add('allergy');
  if (dbGet('SELECT 1 AS x FROM vaccinations WHERE patient_id = ? AND next_due_date IS NOT NULL AND next_due_date <= ?', [a.patient_id, todayISO()])) add('vaccine');
  return gaps;
}

function renderCareGaps(main, lang) {
  const session = getCurrentSession();
  const uid = session ? session.user_id : 0;
  let adms = dbAll(`SELECT a.admission_id, a.patient_id, a.code_status, a.admitted_at, p.mrn, p.full_name_ar, p.full_name_en
    FROM case_assignments ca JOIN admissions a ON ca.admission_id = a.admission_id JOIN patients p ON a.patient_id = p.patient_id
    WHERE ca.doctor_id = ? AND a.status='active' ORDER BY a.admission_id DESC`, [uid]);
  if (!adms.length) adms = dbAll(`SELECT a.admission_id, a.patient_id, a.code_status, a.admitted_at, p.mrn, p.full_name_ar, p.full_name_en
    FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.status='active' ORDER BY a.admission_id DESC LIMIT 100`);
  let blocks = '';
  for (const a of adms) {
    const gaps = computeCareGaps(a);
    if (!gaps.length) continue;
    const name = lang === 'ar' ? a.full_name_ar : (a.full_name_en || a.full_name_ar);
    const chips = gaps.map(k => `<div style="margin:4px 0;">
      <span class="spb-badge" style="background:#d97706;color:#fff;">&#9889; ${t(CARE_GAP_LABELS[k])}</span>
      <button class="btn btn-sm btn-secondary" onclick="dismissCareGap(${a.admission_id}, '${k}', ${a.patient_id})">${t('cg_dismiss')}</button>
    </div>`).join('');
    blocks += `<div class="card"><strong>${escapeHtml(a.mrn)} — ${escapeHtml(name)}</strong>${chips}</div>`;
  }
  main.innerHTML = `
    <div class="page-header"><h1>${t('care_gaps_title')}</h1></div>
    ${blocks || `<div class="card"><p class="muted">${t('cg_none')}</p></div>`}`;
}

async function dismissCareGap(admissionId, gapKey, pid) {
  const lang = currentLanguage();
  if (!requireRole(CAREGAP_ROLES, 'dismissing a care gap')) return;
  const reason = (typeof prompt === 'function') ? prompt(t('cg_dismiss_reason')) : '';
  if (reason === null) return;   // cancelled
  const user = getCurrentUser();
  const patient = pid ? dbGet('SELECT mrn, full_name_en, full_name_ar FROM patients WHERE patient_id = ?', [pid]) : null;
  dbRun('INSERT INTO care_gap_overrides (admission_id, gap_key, reason, dismissed_by, dismissed_at) VALUES (?,?,?,?,?)',
    [admissionId, gapKey, reason || null, user ? user.user_id : null, nowISO()]);
  await logAction('CARE_GAP_DISMISSED', `Dismissed care gap '${gapKey}' for admission ${admissionId}${reason ? ': ' + reason : ''}`,
    `تم تجاهل تذكير الرعاية`, pid || null, patient ? (patient.full_name_en || patient.full_name_ar) : null, patient ? patient.mrn : null);
  showSuccess(t('cg_dismissed'));
  saveDBToIndexedDB();
  renderView('care-gaps');
}

// ============================================================
// CHART DOCUMENTS / ATTACHMENTS (LAN-only: bytes live in the one server DB)
// ============================================================
const ATTACH_ROLES = ['dentist', 'specialist', 'hygienist'];
const ATTACH_MAX_BYTES = 1200 * 1024;   // ~1.2MB/image for the browser/IndexedDB demo
const ATTACH_KINDS = [
  { key: 'scan_3d',       en: '3D Scan',        ar: 'مسح ثلاثي الأبعاد' },
  { key: 'xray',          en: 'X-ray',          ar: 'أشعة' },
  { key: 'photo',         en: 'Intraoral Photo', ar: 'صورة داخل الفم' },
  { key: 'document',      en: 'Document',       ar: 'مستند' },
  { key: 'payment_proof', en: 'Payment Proof',  ar: 'إثبات دفع' },
];
function attKindLabel(k, lang) { const x = ATTACH_KINDS.find(a => a.key === k); return x ? (lang === 'ar' ? x.ar : x.en) : (k || ''); }

function renderDocumentsBody(pid, lang) {
  const ar = lang === 'ar';
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [pid]);
  if (!patient) return emptyState();
  const age = patient.date_of_birth ? Math.floor((Date.now() - new Date(patient.date_of_birth)) / 31557600000) : '—';
  const rows = dbAll('SELECT attach_id, filename, mime, kind, size_bytes, data, note, uploaded_at FROM patient_attachments WHERE patient_id = ? ORDER BY attach_id DESC', [pid]);
  const isImg = (a) => /^data:image\//.test(a.data || '');
  const items = rows.length ? rows.map(a => {
    const kb = a.size_bytes ? Math.max(1, Math.round(a.size_bytes / 1024)) + ' KB' : '';
    const preview = isImg(a)
      ? `<img src="${a.data}" alt="${escapeHtml(a.filename || '')}" style="width:100%;max-height:180px;object-fit:cover;border-radius:6px;margin-bottom:6px;">`
      : `<div style="font-size:2em;">${a.kind === 'document' ? '&#128196;' : '&#128206;'}</div>`;
    return `<div class="card" style="display:inline-block;vertical-align:top;width:240px;margin:6px;">
      ${preview}
      <div><span class="badge badge-info">${escapeHtml(attKindLabel(a.kind, lang))}</span></div>
      <div><strong>${escapeHtml(a.filename || '(file)')}</strong></div>
      <div class="muted" style="font-size:.8em;">${escapeHtml(String(a.uploaded_at || '').slice(0, 16).replace('T', ' '))} • ${kb}</div>
      ${a.note ? `<div style="font-size:.85em;">${escapeHtml(a.note)}</div>` : ''}
      <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">
        ${isImg(a) ? `<button class="btn btn-sm btn-success" onclick="sendImageToLab(${a.attach_id}, ${pid})">&#128228; ${ar ? 'إرسال للمعمل' : 'Send to lab'}</button>` : ''}
        <a class="btn btn-sm btn-secondary" href="${a.data}" download="${escapeHtml(a.filename || 'file')}">${ar ? 'تنزيل' : 'Download'}</a>
        <button class="btn btn-sm btn-danger" onclick="deleteAttachment(${a.attach_id}, ${pid})">${ar ? 'حذف' : 'Delete'}</button>
      </div>
    </div>`;
  }).join('') : `<p class="muted">${ar ? 'لا توجد ملفات بعد' : 'No files yet'}</p>`;
  const kindOpts = ATTACH_KINDS.map(k => `<option value="${k.key}">${escapeHtml(ar ? k.ar : k.en)}</option>`).join('');
  const isVisiting = patient.branch && patient.branch !== getSetting('default_branch', 'tagamo3');
  const staleBanner = isVisiting ? `<div style="background:#fffbeb;border:1px solid #fcd34d;color:#92400e;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:.85rem">
      &#9888; ${ar ? `الفرع الأساسي لهذا المريض هو «${escapeHtml(branchLabel(patient.branch, lang))}». إن تم تحديث ملفه هناك، استورد أحدث نسخة لضمان أنه محدّث.` : `This patient's home branch is "${escapeHtml(branchLabel(patient.branch, lang))}". If their record was updated there, import the latest file to be sure it's up to date.`}
    </div>` : '';
  return `
    ${staleBanner}
    <input type="file" id="import-pf-file" accept="application/json,.json" style="display:none" onchange="handleImportPatientFile(this.files[0])">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <h3 style="margin:0">&#129463; ${ar ? 'ملف المريض' : 'Patient File'} — ${escapeHtml(ar ? patient.full_name_ar : (patient.full_name_en || patient.full_name_ar))}
          <span class="muted" style="font-weight:400;font-size:.75em;">${escapeHtml(patient.mrn)} · ${age} ${ar ? 'سنة' : 'yrs'}${patient.branch ? ' · ' + escapeHtml(branchLabel(patient.branch, lang)) : ''}</span></h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm btn-secondary" onclick="exportPatientFile(${pid})">&#128229; ${ar ? 'تصدير' : 'Export'}</button>
          <button class="btn btn-sm btn-success" onclick="sharePatientFileWhatsApp(${pid})">&#128228; ${ar ? 'مشاركة واتساب' : 'Share via WhatsApp'}</button>
          <button class="btn btn-sm btn-secondary" onclick="triggerImportPatientFile()">&#128228; ${ar ? 'استيراد ملف' : 'Import file'}</button>
        </div>
      </div>
      <div class="form-group" style="margin-top:10px"><label>&#128221; ${ar ? 'ملاحظات خاصة / مشاكل حالية / حساسية لأدوية' : 'Special notes / current issues / drug sensitivities'}</label>
        <textarea id="pf-notes" rows="2" placeholder="${ar ? 'أي ملاحظات مهمة…' : 'Any important notes…'}">${escapeHtml(patient.notes || '')}</textarea>
        <button class="btn btn-sm btn-secondary" style="margin-top:6px" onclick="savePatientNotes(${pid})">${ar ? 'حفظ الملاحظات' : 'Save notes'}</button>
      </div>
    </div>
    <div class="card">
      <h3>${ar ? 'رفع صور / أشعة / مسح' : 'Upload images / X-rays / scans'}</h3>
      <p class="muted">${ar ? 'اختر صورة أو أكثر؛ تُحفظ في ملف المريض ويمكن إرسالها للمعمل عبر واتساب.' : 'Select one or more images; they are saved to the patient file and can be sent to the lab via WhatsApp.'}</p>
      <div class="form-row" style="align-items:flex-end;">
        <div class="form-group"><label>${ar ? 'النوع' : 'Type'}</label><select id="att-kind">${kindOpts}</select></div>
        <div class="form-group" style="flex:2;"><label>${ar ? 'الملفات (صورة أو أكثر)' : 'Files (one or more)'}</label><input type="file" id="att-file" accept="image/*,application/pdf" multiple></div>
        <div class="form-group" style="flex:1;"><label>${ar ? 'ملاحظة' : 'Note'}</label><input type="text" id="att-note" maxlength="120"></div>
        <div class="form-group"><button class="btn btn-primary" onclick="uploadAttachment(${pid})">&#11014; ${ar ? 'رفع' : 'Upload'}</button></div>
      </div>
    </div>
    <div>${items}</div>`;
}

function renderDocuments(main, lang) {
  const ar = lang === 'ar';
  const patients = dbAll('SELECT patient_id, mrn, full_name_ar, full_name_en FROM patients ORDER BY patient_id DESC');
  if (!patients.length) { main.innerHTML = `<div class="page-header"><h1>${ar ? 'ملف المريض' : 'Patient File'}</h1></div>${emptyState()}`; return; }
  const sel = window.SELECTED_PATIENT_ID;
  const pid = (sel && patients.some(p => p.patient_id === sel)) ? sel : patients[0].patient_id;
  const patOptions = patients.map(p =>
    `<option value="${p.patient_id}" ${p.patient_id === pid ? 'selected' : ''}>${escapeHtml(p.mrn)} — ${escapeHtml(ar ? p.full_name_ar : (p.full_name_en || p.full_name_ar))}</option>`).join('');
  main.innerHTML = `
    <div class="page-header"><h1>&#128193; ${ar ? 'ملف المريض' : 'Patient File'}</h1></div>
    <div class="card">
      <div class="form-group"><label>${ar ? 'المريض' : 'Patient'}</label>
        <select id="doc-att-patient" onchange="navigateDocuments(this.value)">${patOptions}</select></div>
    </div>
    <div id="doc-att-body">${renderDocumentsBody(pid, lang)}</div>`;
}

function navigateDocuments(pid) {
  const body = document.getElementById('doc-att-body');
  if (body) body.innerHTML = renderDocumentsBody(parseInt(pid, 10), currentLanguage());
}

// Multi-file upload: each image/PDF saved to the patient file with its kind.
function uploadAttachment(pid) {
  const lang = currentLanguage(); const ar = lang === 'ar';
  if (!requireRole(ATTACH_ROLES, 'uploading a document')) return;
  const input = document.getElementById('att-file');
  const note = (document.getElementById('att-note').value || '').trim();
  const kind = (document.getElementById('att-kind') || {}).value || 'photo';
  const files = input && input.files ? [...input.files] : [];
  if (!files.length) { showError(ar ? 'اختر ملفًا أو أكثر' : 'Choose one or more files'); return; }
  const user = getCurrentUser();
  const patient = dbGet('SELECT mrn, full_name_en, full_name_ar FROM patients WHERE patient_id = ?', [pid]);
  let processed = 0, ok = 0, skipped = 0;
  const finalize = () => {
    if (++processed < files.length) return;
    saveDBToIndexedDB();
    if (ok) showSuccess((ar ? 'تم رفع ' : 'Uploaded ') + ok + (ar ? ' ملف' : ' file(s)') + (skipped ? (ar ? ` (تم تخطّي ${skipped})` : ` (${skipped} skipped)`) : ''));
    else showError(ar ? 'لم يُرفع أي ملف (الحجم أو النوع غير مسموح)' : 'Nothing uploaded (size/type not allowed)');
    navigateDocuments(pid);
  };
  files.forEach(f => {
    if (f.size > ATTACH_MAX_BYTES || !/^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i.test(f.type)) {
      derr('attach.rejected', new Error(`${f.name} (${Math.round(f.size / 1024)}KB ${f.type})`)); skipped++; finalize(); return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        dbRun('INSERT INTO patient_attachments (patient_id, filename, mime, kind, size_bytes, data, note, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?,?,?,?)',
          [pid, f.name, f.type, kind, f.size, String(reader.result || ''), note || null, user ? user.user_id : null, nowISO()]);
        await logAction('ATTACHMENT_ADDED', `Uploaded ${kind} "${f.name}" (${Math.round(f.size / 1024)}KB)`, `أُرفق ملف "${f.name}"`, pid, patient ? (patient.full_name_en || patient.full_name_ar) : null, patient ? patient.mrn : null);
        dlog('attach.uploaded', { pid, kind, name: f.name, kb: Math.round(f.size / 1024) }); ok++;
      } catch (e) { derr('attach.save', e); }
      finalize();
    };
    reader.onerror = () => { derr('attach.read', new Error(f.name)); finalize(); };
    reader.readAsDataURL(f);
  });
}

function savePatientNotes(pid) {
  const lang = currentLanguage();
  try {
    const notes = (document.getElementById('pf-notes').value || '').trim();
    dbRun('UPDATE patients SET notes = ? WHERE patient_id = ?', [notes || null, pid]);
    dlog('patient.notesSaved', { pid, len: notes.length });
    saveDBToIndexedDB();
    showSuccess(lang === 'ar' ? 'تم حفظ الملاحظات' : 'Notes saved');
  } catch (e) { derr('patient.notes', e); showError(e.message); }
}

// Send a saved image to the lab via WhatsApp. Browser-only: wa.me can't attach
// a file, so we download the image (for the user to attach) and open the lab
// chat pre-filled with the patient context. The LAN server can later swap this
// for a true Cloud-API auto-send (see sendImageToLab in server mode).
function sendImageToLab(attachId, pid) {
  const lang = currentLanguage(); const ar = lang === 'ar';
  const a = dbGet('SELECT * FROM patient_attachments WHERE attach_id = ?', [attachId]);
  const p = dbGet('SELECT * FROM patients WHERE patient_id = ?', [pid]);
  if (!a || !p) { showError(ar ? 'الصورة غير موجودة' : 'Image not found'); return; }
  const lab = getSetting('lab_whatsapp', '');
  if (!lab) { showError(ar ? 'أضف رقم واتساب المعمل من الإعدادات أولاً' : 'Set the lab WhatsApp number in Settings first'); navigateTo('it-settings'); return; }
  const owner = getSetting('owner_whatsapp', '');
  const age = p.date_of_birth ? Math.floor((Date.now() - new Date(p.date_of_birth)) / 31557600000) : '';
  const lines = [
    (ar ? '🦷 ' : '🦷 ') + getSetting('clinic_name', 'OpenSmile Dental'),
    (ar ? 'المريض: ' : 'Patient: ') + (ar ? p.full_name_ar : (p.full_name_en || p.full_name_ar)),
    (ar ? 'الرقم الطبي: ' : 'MRN: ') + p.mrn,
    age ? (ar ? 'العمر: ' : 'Age: ') + age : '',
    p.branch ? (ar ? 'الفرع: ' : 'Branch: ') + branchLabel(p.branch, lang) : '',
    (ar ? 'نوع الصورة: ' : 'Image type: ') + attKindLabel(a.kind, lang),
    a.note ? (ar ? 'ملاحظة: ' : 'Note: ') + a.note : '',
    p.notes ? (ar ? 'ملاحظات طبية: ' : 'Clinical notes: ') + p.notes : '',
    '',
    ar ? '⬇️ الصورة قيد التنزيل — يُرجى إرفاقها في هذه المحادثة.' : '⬇️ The image is downloading — please attach it to this chat.',
    owner ? (ar ? `يرجى تأكيد الاستلام للدكتور على ${egDisplay(owner)} (اتصال أو رسالة).` : `Please confirm receipt to the doctor at ${egDisplay(owner)} (call or message).`) : '',
  ].filter(Boolean);
  try { const link = document.createElement('a'); link.href = a.data; link.download = a.filename || 'image'; document.body.appendChild(link); link.click(); link.remove(); }
  catch (e) { derr('lab.download', e); }
  logAction('LAB_IMAGE_SHARED', `Shared ${a.kind} of ${p.full_name_en || p.full_name_ar} to lab WhatsApp ${egDisplay(lab)}`, `مشاركة صورة مع المعمل`, pid, p.full_name_en, p.mrn);
  dlog('whatsapp.sendToLab', { lab: egDisplay(lab), pid, attachId, kind: a.kind });
  try { window.open(`https://wa.me/${lab}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank'); } catch (e) { derr('lab.waOpen', e); }
  showSuccess(ar ? 'تم تنزيل الصورة وفتح واتساب — أرفق الصورة وأرسلها' : 'Image downloaded + WhatsApp opened — attach the image and send');
}

// ============================================================
// MULTI-BRANCH TRANSFER — export/import a patient file as JSON, share via
// WhatsApp, with an "is this up to date?" check. Browser-only and zero-infra:
// no ports, no VPN — you move the .json yourself (WhatsApp/USB) and the
// receiving branch imports it. A live auto-sync (Tailscale/Cloudflare Tunnel)
// is a later, optional add-on.
// ============================================================
function exportPatientFile(pid) {
  try {
    const p = dbGet('SELECT * FROM patients WHERE patient_id = ?', [pid]);
    if (!p) { showError('Patient not found'); return null; }
    const file = {
      app: 'OpenSmile', schema: 1, exported_at: nowISO(),
      source_branch: getSetting('default_branch', 'tagamo3'),
      source_clinic: getSetting('clinic_name', 'OpenSmile Dental'),
      patient: p,
      conditions: dbAll('SELECT * FROM patient_conditions WHERE patient_id=?', [pid]),
      allergies: dbAll('SELECT * FROM patient_allergies WHERE patient_id=?', [pid]),
      flags: dbAll('SELECT * FROM patient_flags WHERE patient_id=?', [pid]),
      odontogram: dbAll('SELECT * FROM odontogram WHERE patient_id=?', [pid]),
      perio: dbAll('SELECT * FROM perio_chart WHERE patient_id=?', [pid]),
      plans: dbAll('SELECT * FROM treatment_plans WHERE patient_id=?', [pid]),
      plan_items: dbAll('SELECT * FROM treatment_plan_items WHERE patient_id=?', [pid]),
      prescriptions: dbAll('SELECT * FROM prescriptions WHERE patient_id=?', [pid]),
      recalls: dbAll('SELECT * FROM recalls WHERE patient_id=?', [pid]),
      attachments: dbAll('SELECT * FROM patient_attachments WHERE patient_id=?', [pid]),
    };
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `OpenSmile-${(p.mrn || pid)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    logAction('PATIENT_EXPORTED', `Exported patient file ${p.mrn}`, null, pid, p.full_name_en, p.mrn);
    dlog('transfer.export', { pid, mrn: p.mrn, attachments: file.attachments.length });
    return file;
  } catch (e) { derr('transfer.export', e); showError(e.message); return null; }
}

function sharePatientFileWhatsApp(pid) {
  const ar = currentLanguage() === 'ar';
  const p = dbGet('SELECT * FROM patients WHERE patient_id=?', [pid]); if (!p) return;
  exportPatientFile(pid);   // downloads the .json for manual attach (wa.me can't attach files)
  const num = getSetting('owner_whatsapp', '');
  const lines = [
    '🦷 ' + (ar ? 'ملف مريض من ' : 'Patient file from ') + getSetting('clinic_name', 'OpenSmile') + ' (' + branchLabel(getSetting('default_branch', 'tagamo3'), currentLanguage()) + ')',
    (ar ? 'المريض: ' : 'Patient: ') + (ar ? p.full_name_ar : (p.full_name_en || p.full_name_ar)) + ' — ' + p.mrn,
    '',
    ar ? '⬇️ الملف (.json) قيد التنزيل — أرفقه هنا ليستورده الفرع الآخر.' : '⬇️ The file (.json) is downloading — attach it here so the other branch can import it.',
  ];
  const url = (num ? `https://wa.me/${num}` : 'https://wa.me/') + '?text=' + encodeURIComponent(lines.join('\n'));
  dlog('transfer.share', { pid, to: num ? egDisplay(num) : '(pick contact)' });
  try { window.open(url, '_blank'); } catch (e) { derr('transfer.share', e); }
  showSuccess(ar ? 'تم تنزيل الملف وفتح واتساب — أرفق الملف وأرسل' : 'File downloaded + WhatsApp opened — attach the file and send');
}

function triggerImportPatientFile() { const i = document.getElementById('import-pf-file'); if (i) i.click(); }
function handleImportPatientFile(file) {
  if (!file) return; const ar = currentLanguage() === 'ar';
  const reader = new FileReader();
  reader.onload = () => { try { importPatientFile(JSON.parse(String(reader.result || '{}'))); } catch (e) { derr('transfer.import.parse', e); showError(ar ? 'ملف غير صالح' : 'Invalid file'); } };
  reader.onerror = () => showError(ar ? 'تعذّرت قراءة الملف' : 'Could not read the file');
  reader.readAsText(file);
}

// Best-effort "last touched" timestamp for the local copy (for the update-check).
function _patientLastStamp(pid) {
  let best = '';
  ['SELECT MAX(charted_at) m FROM odontogram WHERE patient_id=?', 'SELECT MAX(created_at) m FROM treatment_plan_items WHERE patient_id=?',
   'SELECT MAX(prescribed_at) m FROM prescriptions WHERE patient_id=?', 'SELECT MAX(added_at) m FROM patient_allergies WHERE patient_id=?',
   'SELECT MAX(uploaded_at) m FROM patient_attachments WHERE patient_id=?', 'SELECT registered_at m FROM patients WHERE patient_id=?']
    .forEach(q => { try { const r = dbGet(q, [pid]); if (r && r.m && r.m > best) best = r.m; } catch (e) {} });
  return best;
}

function importPatientFile(data) {
  const ar = currentLanguage() === 'ar';
  if (!data || data.app !== 'OpenSmile' || !data.patient) { showError(ar ? 'هذا ليس ملف OpenSmile' : 'Not an OpenSmile patient file'); return; }
  const src = data.patient;
  const existing = src.national_id ? dbGet('SELECT * FROM patients WHERE national_id=?', [src.national_id])
    : (src.mrn ? dbGet('SELECT * FROM patients WHERE mrn=?', [src.mrn]) : null);
  const go = () => doImportPatientFile(data, existing);
  if (existing) {
    const localStamp = _patientLastStamp(existing.patient_id);
    if (localStamp && data.exported_at && localStamp > data.exported_at) {
      showConfirm(ar
        ? `⚠️ يوجد سجل محلي لهذا المريض وقد يكون أحدث من الملف (محلي ${localStamp.slice(0, 10)} مقابل الملف ${String(data.exported_at).slice(0, 10)}). الكتابة فوقه على أي حال؟`
        : `⚠️ A local record exists and looks NEWER than this file (local ${localStamp.slice(0, 10)} vs file ${String(data.exported_at).slice(0, 10)}). Overwrite anyway?`, go);
      return;
    }
    showConfirm(ar ? 'سيتم تحديث سجل هذا المريض من الملف. متابعة؟' : 'This overwrites the patient record from the file. Continue?', go);
    return;
  }
  go();
}

function doImportPatientFile(data, existing) {
  const ar = currentLanguage() === 'ar'; const u = getCurrentUser();
  try {
    const src = data.patient; let pid;
    if (existing) {
      pid = existing.patient_id;
      dbRun('UPDATE patients SET full_name_ar=?, full_name_en=?, date_of_birth=?, gender=?, phone=?, branch=?, notes=? WHERE patient_id=?',
        [src.full_name_ar, src.full_name_en, src.date_of_birth, src.gender, src.phone, src.branch || getSetting('default_branch', 'tagamo3'), src.notes || null, pid]);
      ['patient_conditions', 'patient_allergies', 'patient_flags', 'odontogram', 'perio_chart', 'treatment_plan_items', 'treatment_plans', 'prescriptions', 'recalls', 'patient_attachments']
        .forEach(tbl => { try { dbRun('DELETE FROM ' + tbl + ' WHERE patient_id=?', [pid]); } catch (e) {} });
    } else {
      let mrn = src.mrn;
      if (!mrn || dbGet('SELECT 1 x FROM patients WHERE mrn=?', [mrn])) mrn = `OS-${nowISO().slice(0, 10).replace(/-/g, '')}-${String((dbGet('SELECT COUNT(*) c FROM patients').c || 0) + 1).padStart(5, '0')}`;
      dbRun('INSERT INTO patients (mrn, national_id, full_name_ar, full_name_en, date_of_birth, gender, phone, branch, notes, registered_by, registered_at, portal_enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',
        [mrn, src.national_id || null, src.full_name_ar, src.full_name_en, src.date_of_birth, src.gender, src.phone, src.branch || getSetting('default_branch', 'tagamo3'), src.notes || null, u ? u.user_id : null, nowISO()]);
      pid = dbLastId();
    }
    // Authors come from another branch → blank them (or use a local dentist for Rx) to satisfy the role triggers.
    const dentist = (u && ['dentist', 'specialist'].includes(u.role)) ? u.user_id : ((dbGet("SELECT user_id FROM users WHERE role IN ('dentist','specialist') LIMIT 1") || {}).user_id || null);
    (data.conditions || []).forEach(c => dbRun('INSERT INTO patient_conditions (patient_id,condition_code,category,severity,notes,display,onset_date,resolved_date,status,added_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [pid, c.condition_code, c.category, c.severity, c.notes, c.display, c.onset_date, c.resolved_date, c.status || 'active', c.added_at || nowISO()]));
    (data.allergies || []).forEach(a => dbRun('INSERT INTO patient_allergies (patient_id,allergen,reaction,severity,added_at) VALUES (?,?,?,?,?)', [pid, a.allergen, a.reaction, a.severity, a.added_at || nowISO()]));
    (data.flags || []).forEach(f => dbRun('INSERT INTO patient_flags (patient_id,label_en,label_ar,color,created_at,active) VALUES (?,?,?,?,?,?)', [pid, f.label_en, f.label_ar, f.color, f.created_at || nowISO(), f.active == null ? 1 : f.active]));
    (data.odontogram || []).forEach(o => dbRun('INSERT INTO odontogram (patient_id,tooth_fdi,surfaces,status,note,charted_by,charted_at) VALUES (?,?,?,?,?,NULL,?)', [pid, o.tooth_fdi, o.surfaces, o.status, o.note, o.charted_at || nowISO()]));
    (data.perio || []).forEach(o => dbRun('INSERT INTO perio_chart (patient_id,tooth_fdi,pockets,bleeding,recession,mobility,charted_by,charted_at) VALUES (?,?,?,?,?,?,NULL,?)', [pid, o.tooth_fdi, o.pockets, o.bleeding, o.recession, o.mobility, o.charted_at || nowISO()]));
    const planMap = {};
    (data.plans || []).forEach(pl => { dbRun('INSERT INTO treatment_plans (patient_id,title_en,title_ar,status,dentist_id,created_at,notes) VALUES (?,?,?,?,NULL,?,?)', [pid, pl.title_en, pl.title_ar, pl.status, pl.created_at || nowISO(), pl.notes]); planMap[pl.plan_id] = dbLastId(); });
    (data.plan_items || []).forEach(it => { const np = planMap[it.plan_id]; if (!np) return; dbRun('INSERT INTO treatment_plan_items (plan_id,patient_id,procedure_code,procedure_name_en,procedure_name_ar,tooth_fdi,surfaces,price,status,dentist_id,completed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?)', [np, pid, it.procedure_code, it.procedure_name_en, it.procedure_name_ar, it.tooth_fdi, it.surfaces, it.price, it.status, it.completed_at, it.created_at || nowISO()]); });
    (data.prescriptions || []).forEach(r => { if (!dentist) return; dbRun('INSERT INTO prescriptions (patient_id,admission_id,doctor_id,drug_id,drug_name,dose,route,frequency,duration,start_date,status,prescribed_at) VALUES (?,NULL,?,?,?,?,?,?,?,?,?,?)', [pid, dentist, r.drug_id, r.drug_name, r.dose, r.route, r.frequency, r.duration, r.start_date, r.status || 'active', r.prescribed_at || nowISO()]); });
    (data.recalls || []).forEach(r => dbRun('INSERT INTO recalls (patient_id,type,due_date,status,created_at,notes) VALUES (?,?,?,?,?,?)', [pid, r.type, r.due_date, r.status || 'due', r.created_at || nowISO(), r.notes]));
    (data.attachments || []).forEach(a => dbRun('INSERT INTO patient_attachments (patient_id,filename,mime,kind,size_bytes,data,note,uploaded_by,uploaded_at) VALUES (?,?,?,?,?,?,?,NULL,?)', [pid, a.filename, a.mime, a.kind, a.size_bytes, a.data, a.note, a.uploaded_at || nowISO()]));
    logAction('PATIENT_IMPORTED', `Imported patient file ${src.mrn} from ${data.source_clinic || data.source_branch || '?'}`, null, pid, src.full_name_en, src.mrn);
    dlog('transfer.import', { pid, from: data.source_branch, exported_at: data.exported_at });
    saveDBToIndexedDB();
    if (typeof setActivePatient === 'function') setActivePatient(pid);
    showSuccess(ar ? 'تم استيراد ملف المريض' : 'Patient file imported');
    navigateTo('documents');
  } catch (e) { derr('transfer.import', e); showError(e.message); }
}

async function deleteAttachment(id, pid) {
  const lang = currentLanguage();
  if (!requireRole(ATTACH_ROLES, 'deleting a document')) return;
  if (typeof confirm === 'function' && !confirm(lang === 'ar' ? 'حذف هذا المستند؟' : 'Delete this document?')) return;
  const a = dbGet('SELECT filename FROM patient_attachments WHERE attach_id = ?', [id]);
  const patient = dbGet('SELECT mrn, full_name_en, full_name_ar FROM patients WHERE patient_id = ?', [pid]);
  dbRun('DELETE FROM patient_attachments WHERE attach_id = ?', [id]);
  await logAction('ATTACHMENT_DELETED', `Deleted document "${a ? a.filename : id}"`, `حُذف مستند`, pid, patient ? (patient.full_name_en || patient.full_name_ar) : null, patient ? patient.mrn : null);
  showSuccess(t('att_deleted'));
  saveDBToIndexedDB();
  navigateDocuments(pid);
}

// ============================================================
// PATIENT-SAFETY INCIDENT REPORTING (file = all staff; queue = manager)
// ============================================================

const INCIDENT_TYPES = ['fall', 'medication', 'near_miss', 'equipment', 'pressure_injury', 'other'];
const INCIDENT_SEVERITIES = ['no_harm', 'low', 'moderate', 'severe', 'sentinel'];
const INCIDENT_SEV_COLOR = { no_harm: '#10b981', low: '#0ea5e9', moderate: '#d97706', severe: '#fd7e14', sentinel: '#dc2626' };
let _incidentFilter = 'open';

function renderIncidentReport(main, lang) {
  const typeOpts = INCIDENT_TYPES.map(x => `<option value="${x}">${t('inc_type_' + x)}</option>`).join('');
  const sevOpts = INCIDENT_SEVERITIES.map(x => `<option value="${x}">${t('inc_sev_' + x)}</option>`).join('');
  const patients = dbAll(`SELECT DISTINCT p.patient_id, p.mrn, p.full_name_ar, p.full_name_en
    FROM patients p JOIN admissions a ON a.patient_id = p.patient_id
    WHERE a.status = 'active' ORDER BY p.patient_id DESC LIMIT 200`);
  const patientOpts = `<option value="">${t('inc_no_patient')}</option>` + patients.map(p =>
    `<option value="${p.patient_id}">${escapeHtml(p.mrn)} — ${lang === 'ar' ? escapeHtml(p.full_name_ar) : escapeHtml(p.full_name_en || p.full_name_ar)}</option>`).join('');
  main.innerHTML = `
    <div class="page-header"><h1>${t('incident_report_title')}</h1></div>
    <div class="card">
      <p class="muted">${t('incident_report_intro')}</p>
      <form onsubmit="fileIncident(event)">
        <div class="form-row">
          <div class="form-group"><label>${t('inc_type')} *</label><select id="inc-type" required>${typeOpts}</select></div>
          <div class="form-group"><label>${t('inc_severity')} *</label><select id="inc-severity" required>${sevOpts}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('inc_occurred_at')}</label><input type="datetime-local" id="inc-occurred"></div>
          <div class="form-group"><label>${t('inc_location')}</label><input type="text" id="inc-location" maxlength="80"></div>
        </div>
        <div class="form-group"><label>${t('inc_patient')}</label><select id="inc-patient">${patientOpts}</select></div>
        <div class="form-group"><label>${t('inc_description')} *</label><textarea id="inc-description" rows="3" required></textarea></div>
        <div class="form-group"><label>${t('inc_immediate_action')}</label><textarea id="inc-action" rows="2"></textarea></div>
        <div class="form-group"><label><input type="checkbox" id="inc-anon"> ${t('inc_anonymous_opt')}</label></div>
        <button type="submit" class="btn btn-primary">${t('inc_submit')}</button>
      </form>
    </div>`;
}

function renderIncidentQueueBody(filter, lang) {
  const where = (filter && filter !== 'all') ? "WHERE ir.status = ?" : "";
  const rows = dbAll(`SELECT ir.*, p.mrn AS patient_mrn, u.full_name_en AS rep_en, u.full_name_ar AS rep_ar
    FROM incident_reports ir
    LEFT JOIN patients p ON p.patient_id = ir.patient_id
    LEFT JOIN users u ON u.user_id = ir.reported_by
    ${where} ORDER BY ir.incident_id DESC`, filter && filter !== 'all' ? [filter] : []);
  if (!rows.length) return emptyState(t('inc_none'));
  const body = rows.map(r => {
    const sevColor = INCIDENT_SEV_COLOR[r.severity] || '#64748b';
    const reporter = r.reported_by ? escapeHtml(lang === 'ar' ? (r.rep_ar || r.rep_en) : (r.rep_en || r.rep_ar)) : `<em>${t('inc_anonymous')}</em>`;
    const when = r.occurred_at ? escapeHtml(String(r.occurred_at).slice(0, 16).replace('T', ' ')) : '—';
    let action = '';
    if (r.status === 'open') {
      action = `<button class="btn btn-sm btn-secondary" onclick="reviewIncident(${r.incident_id})">${t('inc_start_review')}</button>`;
    } else if (r.status === 'under_review') {
      action = `<input type="text" id="inc-note-${r.incident_id}" placeholder="${t('inc_review_notes')}" style="max-width:180px;">
        <button class="btn btn-sm btn-primary" onclick="closeIncident(${r.incident_id})">${t('inc_close')}</button>`;
    } else if (r.status === 'closed') {
      action = `<span class="muted">${r.review_notes ? escapeHtml(r.review_notes) : t('inc_closed')}</span>`;
    }
    return `<tr>
      <td><span class="spb-badge" style="background:${sevColor};color:#fff;">${t('inc_sev_' + r.severity)}</span></td>
      <td>${t('inc_type_' + r.type) || escapeHtml(r.type)}</td>
      <td>${when}<br><span class="muted">${escapeHtml(r.location || '')}</span></td>
      <td>${r.patient_mrn ? escapeHtml(r.patient_mrn) : '—'}</td>
      <td>${reporter}</td>
      <td>${escapeHtml(r.description || '')}</td>
      <td>${t('inc_status_' + r.status) || escapeHtml(r.status)}</td>
      <td>${action}</td>
    </tr>`;
  }).join('');
  return `<table class="table">
    <thead><tr><th>${t('inc_severity')}</th><th>${t('inc_type')}</th><th>${t('inc_occurred_at')}</th><th>${t('patient_col')}</th><th>${t('inc_reporter')}</th><th>${t('inc_description')}</th><th>${t('status')}</th><th></th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

function renderIncidentQueue(main, lang) {
  const statuses = ['open', 'under_review', 'closed', 'all'];
  const filterOpts = statuses.map(s => `<option value="${s}"${s === _incidentFilter ? ' selected' : ''}>${t('inc_status_' + s) || s}</option>`).join('');
  main.innerHTML = `
    <div class="page-header"><h1>${t('incident_queue_title')}</h1></div>
    <div class="card">
      <div class="form-group"><label>${t('inc_filter_status')}</label>
        <select id="inc-filter" onchange="navigateIncidentQueue(this.value)">${filterOpts}</select></div>
    </div>
    <div class="card"><div id="inc-queue-body">${renderIncidentQueueBody(_incidentFilter, lang)}</div></div>`;
}

function navigateIncidentQueue(status) {
  _incidentFilter = status;
  const body = document.getElementById('inc-queue-body');
  if (body) body.innerHTML = renderIncidentQueueBody(status, currentLanguage());
}

async function fileIncident(e) {
  e.preventDefault();
  const lang = currentLanguage();
  const sess = getCurrentSession();
  if (!sess || sess.role === 'patient') { showError(lang === 'ar' ? 'يلزم تسجيل دخول طاقم' : 'Staff login required'); return; }
  const user = getCurrentUser();
  const type = document.getElementById('inc-type').value;
  const severity = document.getElementById('inc-severity').value;
  const occurred = document.getElementById('inc-occurred').value || null;
  const location = document.getElementById('inc-location').value.trim() || null;
  const pidRaw = document.getElementById('inc-patient').value;
  const patientId = pidRaw ? parseInt(pidRaw, 10) : null;
  const description = document.getElementById('inc-description').value.trim();
  const action = document.getElementById('inc-action').value.trim() || null;
  const anon = document.getElementById('inc-anon').checked;
  if (!description) { showError(lang === 'ar' ? 'الوصف مطلوب' : 'Description is required'); return; }
  // anonymous => reported_by NULL in the report row (de-identified for reviewers),
  // but the audit log still records who filed it.
  const reportedBy = anon ? null : (user ? user.user_id : null);
  dbRun(`INSERT INTO incident_reports (type, severity, occurred_at, location, patient_id, description, immediate_action, reported_by, reported_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
    [type, severity, occurred, location, patientId, description, action, reportedBy, nowISO()]);
  await logAction('INCIDENT_FILED', `Filed a ${severity} ${type} incident report${anon ? ' (anonymous to reviewers)' : ''}`,
    `تم تسجيل بلاغ حادثة (${type})${anon ? ' (مجهول للمراجعين)' : ''}`, patientId);
  showSuccess(t('inc_filed'));
  saveDBToIndexedDB();
  renderView('incident-report');
}

async function reviewIncident(id) {
  if (!requireRole(['hospital_manager', 'it_admin'], 'reviewing an incident')) return;
  const user = getCurrentUser();
  dbRun("UPDATE incident_reports SET status = 'under_review', reviewed_by = ? WHERE incident_id = ?", [user ? user.user_id : null, id]);
  await logAction('INCIDENT_REVIEW_STARTED', `Started review of incident #${id}`, `بدأت مراجعة الحادثة #${id}`);
  showSuccess(t('inc_review_started'));
  saveDBToIndexedDB();
  navigateIncidentQueue(_incidentFilter);
}

async function closeIncident(id) {
  if (!requireRole(['hospital_manager', 'it_admin'], 'closing an incident')) return;
  const user = getCurrentUser();
  const noteEl = document.getElementById('inc-note-' + id);
  const notes = noteEl ? noteEl.value.trim() : '';
  dbRun("UPDATE incident_reports SET status = 'closed', reviewed_by = ?, review_notes = ?, closed_at = ? WHERE incident_id = ?",
    [user ? user.user_id : null, notes || null, nowISO(), id]);
  await logAction('INCIDENT_CLOSED', `Closed incident #${id}${notes ? ': ' + notes : ''}`, `أُغلقت الحادثة #${id}`);
  showSuccess(t('inc_closed_ok'));
  saveDBToIndexedDB();
  navigateIncidentQueue(_incidentFilter);
}

// ============================================================
// PATIENT SUMMARY EXPORT (offline CCD-like portable document; no internet/HIE)
// ============================================================
function _summaryAge(dob, lang) {
  if (!dob) return '';
  const y = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return y >= 0 ? (y + (lang === 'ar' ? ' سنة' : 'y')) : '';
}

// The inner sections — shared by the on-screen view and the downloaded file.
function buildSummaryInner(pid, lang) {
  const p = dbGet('SELECT * FROM patients WHERE patient_id = ?', [pid]);
  if (!p) return emptyState();
  const adm = dbGet("SELECT * FROM admissions WHERE patient_id = ? AND status='active' ORDER BY admission_id DESC LIMIT 1", [pid])
    || dbGet('SELECT * FROM admissions WHERE patient_id = ? ORDER BY admission_id DESC LIMIT 1', [pid]);
  const allergies = dbAll('SELECT * FROM patient_allergies WHERE patient_id = ?', [pid]);
  const problems = dbAll("SELECT * FROM patient_conditions WHERE patient_id = ? AND COALESCE(status,'active') <> 'resolved' ORDER BY id DESC", [pid]);
  const meds = dbAll("SELECT rx.* FROM prescriptions rx JOIN admissions a ON a.admission_id = rx.admission_id WHERE a.patient_id = ? AND rx.status='active' ORDER BY rx.rx_id DESC", [pid]);
  const vitals = adm ? dbGet('SELECT * FROM vitals_log WHERE admission_id = ? ORDER BY vitals_id DESC LIMIT 1', [adm.admission_id]) : null;
  const labs = dbAll(`SELECT d.component_en, d.component_ar, d.value, d.unit, d.flag, lo.resulted_at
    FROM lab_result_details d JOIN lab_orders lo ON lo.order_id = d.order_id JOIN admissions a ON a.admission_id = lo.admission_id
    WHERE a.patient_id = ? ORDER BY d.detail_id DESC LIMIT 12`, [pid]);
  const encounters = dbAll('SELECT * FROM admissions WHERE patient_id = ? ORDER BY admission_id DESC LIMIT 10', [pid]);
  const name = lang === 'ar' ? p.full_name_ar : (p.full_name_en || p.full_name_ar);
  const li = arr => arr.length ? '<ul>' + arr.join('') + '</ul>' : `<p class="muted">—</p>`;

  const allergyList = li(allergies.map(a => `<li>${escapeHtml(a.allergen)}${a.reaction ? ' — ' + escapeHtml(a.reaction) : ''}${a.severity ? ' (' + escapeHtml(a.severity) + ')' : ''}</li>`));
  const problemList = li(problems.map(c => { const coded = /^[A-Za-z]\d/.test(c.condition_code || ''); return `<li>${coded ? '[' + escapeHtml(c.condition_code) + '] ' : ''}${escapeHtml(_conditionLabel(c, lang))}</li>`; }));
  const medList = li(meds.map(m => `<li>${escapeHtml(m.drug_name)} ${escapeHtml(m.dose || '')} ${escapeHtml(m.route || '')} ${escapeHtml(m.frequency || '')}</li>`));
  const vitalsHtml = vitals
    ? `<p>${vitals.bp_systolic ? `BP ${escapeHtml(String(vitals.bp_systolic))}/${escapeHtml(String(vitals.bp_diastolic || ''))} · ` : ''}${vitals.heart_rate ? `HR ${escapeHtml(String(vitals.heart_rate))} · ` : ''}${vitals.temperature ? `T ${escapeHtml(String(vitals.temperature))}°C · ` : ''}${vitals.o2_sat ? `SpO₂ ${escapeHtml(String(vitals.o2_sat))}%` : ''}<br><span class="muted">${escapeHtml(String(vitals.recorded_at || '').slice(0, 16).replace('T', ' '))}</span></p>`
    : `<p class="muted">—</p>`;
  const labsHtml = li(labs.map(l => `<li>${escapeHtml(lang === 'ar' ? (l.component_ar || l.component_en) : l.component_en)}: ${escapeHtml(String(l.value ?? ''))} ${escapeHtml(l.unit || '')}${l.flag && l.flag !== 'normal' ? ' (' + escapeHtml(l.flag) + ')' : ''}</li>`));
  const encList = li(encounters.map(e => `<li>${escapeHtml(String(e.admitted_at || '').slice(0, 10))}${e.discharged_at ? ' → ' + escapeHtml(String(e.discharged_at).slice(0, 10)) : ' (' + t('inc_status_open') + ')'} — ${escapeHtml(e.chief_complaint || e.initial_diagnosis || '')}</li>`));

  return `
    <div class="summary-head">
      <h2>${escapeHtml(name)}</h2>
      <p>${t('mrn') || 'MRN'}: ${escapeHtml(p.mrn)} · ${escapeHtml(p.date_of_birth || '')} ${_summaryAge(p.date_of_birth, lang) ? '(' + _summaryAge(p.date_of_birth, lang) + ')' : ''} · ${escapeHtml(p.gender || '')}${p.blood_type && p.blood_type !== 'unknown' ? ' · ' + escapeHtml(p.blood_type) : ''}</p>
    </div>
    <h3>${t('sum_allergies')}</h3>${allergyList}
    <h3>${t('sum_problems')}</h3>${problemList}
    <h3>${t('sum_meds')}</h3>${medList}
    <h3>${t('sum_vitals')}</h3>${vitalsHtml}
    <h3>${t('sum_labs')}</h3>${labsHtml}
    <h3>${t('sum_encounters')}</h3>${encList}`;
}

// Wrap the inner sections in a fully self-contained HTML file for offline carry
// (USB, attach to an email by hand) — the no-internet stand-in for a CCDA/HIE feed.
function buildSummaryDoc(pid, lang) {
  const p = dbGet('SELECT mrn FROM patients WHERE patient_id = ?', [pid]);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const css = `body{font-family:system-ui,Arial,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1e293b}h1{font-size:1.3em}h2{margin:.2em 0}h3{margin-top:1.2em;border-bottom:1px solid #cbd5e1;padding-bottom:2px;color:#0f172a}.muted{color:#64748b}ul{margin:.3em 0}.summary-head{border-bottom:2px solid #1e3a8a;padding-bottom:8px}.disclaimer{margin-top:24px;font-size:.85em;color:#64748b;border-top:1px solid #e2e8f0;padding-top:8px}`;
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t('summary_title')} — ${escapeHtml(p ? p.mrn : '')}</title><style>${css}</style></head><body>
    <h1>OpenWard — ${t('summary_title')}</h1>
    ${buildSummaryInner(pid, lang)}
    <p class="disclaimer">${t('sum_generated')} ${escapeHtml(new Date().toISOString().slice(0, 16).replace('T', ' '))} · ${t('sum_disclaimer')}</p>
  </body></html>`;
}

function renderPatientSummary(main, lang) {
  const session = getCurrentSession();
  const patients = _problemListPatients(session);
  if (!patients.length) { main.innerHTML = `<div class="page-header"><h1>${t('summary_title')}</h1></div>${emptyState()}`; return; }
  const pid = patients[0].patient_id;
  const patOptions = patients.map(p => `<option value="${p.patient_id}">${escapeHtml(p.mrn)} — ${lang === 'ar' ? escapeHtml(p.full_name_ar) : escapeHtml(p.full_name_en || p.full_name_ar)}</option>`).join('');
  main.innerHTML = `
    <div class="page-header"><h1>${t('summary_title')}</h1></div>
    <div class="card no-print">
      <div class="form-row" style="align-items:flex-end;">
        <div class="form-group" style="flex:2;"><label>${t('patient_col')}</label><select id="summary-patient" onchange="navigateSummary(this.value)">${patOptions}</select></div>
        <div class="form-group"><button class="btn btn-secondary" onclick="printSummary()">${t('sum_print')}</button></div>
        <div class="form-group"><button class="btn btn-primary" onclick="downloadSummary()">${t('sum_download')}</button></div>
      </div>
      <p class="muted">${t('sum_intro')}</p>
    </div>
    <div class="card" id="summary-body">${buildSummaryInner(pid, lang)}</div>`;
}

function navigateSummary(pid) {
  const body = document.getElementById('summary-body');
  if (body) body.innerHTML = buildSummaryInner(parseInt(pid, 10), currentLanguage());
}

function _summarySelectedPid() {
  const sel = document.getElementById('summary-patient');
  return sel ? parseInt(sel.value, 10) : null;
}

function printSummary() { if (typeof window !== 'undefined' && window.print) window.print(); }

async function downloadSummary() {
  const lang = currentLanguage();
  const pid = _summarySelectedPid();
  if (!pid) return;
  const p = dbGet('SELECT mrn, full_name_en, full_name_ar FROM patients WHERE patient_id = ?', [pid]);
  const doc = buildSummaryDoc(pid, lang);
  try {
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'summary-' + (p ? p.mrn : pid) + '.html';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) { showError(lang === 'ar' ? 'تعذّر التنزيل' : 'Could not generate the file'); return; }
  await logAction('SUMMARY_EXPORTED', `Exported clinical summary document`, `تصدير ملخص سريري`, pid, p ? (p.full_name_en || p.full_name_ar) : null, p ? p.mrn : null);
  showSuccess(t('sum_exported'));
}

function renderDocLabs(main, lang) {
  const session = getCurrentSession();
  const patients = dbAll(`SELECT a.*, p.full_name_ar, p.full_name_en, p.mrn, p.patient_id
    FROM case_assignments ca JOIN admissions a ON ca.admission_id = a.admission_id
    JOIN patients p ON a.patient_id = p.patient_id
    WHERE ca.doctor_id = ? AND a.status = 'active'`, [session.user_id]);

  if (!patients.length) { main.innerHTML = `<div class="page-header"><h1>${t('order_labs')}</h1></div>${emptyState()}`; return; }

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
  if (!requireRole(DOCTOR_ROLES, 'lab ordering')) return;
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
// QR Code Scanner (HTML5 BarcodeDetector / jsQR fallback)
// ============================================================

function showQRScanner(onResult) {
  const lang = currentLanguage();
  const overlay = document.createElement('div');
  overlay.id = 'qr-scanner-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:12px;padding:24px;max-width:420px;width:95%;text-align:center;">
      <h3 style="margin-bottom:12px;">${t('scan_qr')}</h3>
      <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px;">${t('qr_scan_hint')}</p>
      <div style="position:relative;width:100%;max-width:360px;margin:0 auto;">
        <video id="qr-video" style="width:100%;border-radius:8px;background:#000;" autoplay playsinline muted></video>
        <canvas id="qr-canvas" style="display:none;"></canvas>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:60%;height:60%;border:2px solid #00c851;border-radius:8px;pointer-events:none;"></div>
      </div>
      <p id="qr-status" style="margin-top:12px;color:var(--text-secondary);font-size:0.85rem;">${lang === 'ar' ? 'جارٍ تشغيل الكاميرا...' : 'Starting camera...'}</p>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">
        <input type="text" id="qr-manual-input" placeholder="${lang === 'ar' ? 'أو أدخل MRN يدوياً' : 'Or enter MRN manually'}" style="border:1px solid var(--border);border-radius:6px;padding:8px 12px;width:200px;">
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
  const depts = dbAll(`SELECT dept_id, name_ar, name_en FROM departments WHERE type NOT IN ('admin','support') ORDER BY name_en`);
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
          <label>${lang==='ar'?'التخصص':'Specialty'}</label>
          <select id="rcp-dept">
            <option value="">${lang==='ar'?'-- اختر التخصص --':'-- Select Specialty --'}</option>
            ${deptOpts}
          </select>
        </div>
        <div class="form-group">
          <label>🦷 ${lang==='ar'?'الفرع':'Branch'}</label>
          <select id="rcp-branch">
            ${(typeof BRANCHES!=='undefined'?BRANCHES:[]).map(b=>`<option value="${b.key}" ${b.key===getSetting('default_branch','tagamo3')?'selected':''}>${escapeHtml(lang==='ar'?b.ar:b.en)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
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
            <option value="cash">${lang==='ar'?'نقدي':'Cash'}</option>
            <option value="mobile_wallet">${lang==='ar'?'محفظة إلكترونية':'Mobile Wallet'}</option>
            <option value="instapay">${lang==='ar'?'انستاباي':'InstaPay'}</option>
            <option value="insurance">${lang==='ar'?'تأمين':'Insurance'}</option>
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

  // Reuse an existing patient record if this national id is already on file;
  // otherwise create one (a clinic registration IS a patient record, with an MRN).
  let patientId = null;
  if (nid) { const ex = dbGet('SELECT patient_id FROM patients WHERE national_id = ?', [nid]); if (ex) patientId = ex.patient_id; }
  const branch = (document.getElementById('rcp-branch') || {}).value || getSetting('default_branch', 'tagamo3');
  if (!patientId) {
    const today = nowISO().slice(0, 10).replace(/-/g, '');
    const seq = (dbGet('SELECT COUNT(*) c FROM patients').c || 0) + 1;
    const mrn = `OS-${today}-${String(seq).padStart(5, '0')}`;
    dbRun(`INSERT INTO patients (mrn, national_id, full_name_ar, full_name_en, date_of_birth, gender, phone, branch, registered_by, registered_at, portal_enabled)
      VALUES (?,?,?,?,?,?,?,?,?,?,1)`, [mrn, nid || null, nameAr, nameEn, dob || null, gender, phone || null, branch, session.user_id, nowISO()]);
    patientId = dbLastId();
    dlog('reception.register', { patientId, mrn, branch });
  }
  dbRun(`INSERT INTO outpatient_visits
    (patient_id, patient_name_ar, patient_name_en, national_id, phone, dob, gender, dept_id, registered_by, registered_at, chief_complaint, visit_type, payment_type, insurance_company, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'waiting',?)`,
    [patientId, nameAr, nameEn, nid||null, phone||null, dob||null, gender, deptId, session.user_id, nowISO(), complaint, type, payment, insco, notes||null]
  );
  await saveDBToIndexedDB();
  showSuccess(lang==='ar'?'تم تسجيل المريض بنجاح':'Patient registered successfully');
  navigateTo('rcp-queue');
}

// ============================================================
// APPOINTMENTS (Receptionist + Doctor)
// ============================================================

function renderRCPAppointments(main, lang) {
  const today = todayISO();
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
    ${appts.length === 0 ? `${emptyState(lang==='ar'?'لا توجد مواعيد قادمة':'No upcoming appointments')}` : `
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
  const depts = dbAll(`SELECT dept_id, name_ar, name_en FROM departments WHERE type NOT IN ('admin','support') ORDER BY name_en`);
  const doctors = dbAll(`SELECT user_id, full_name_ar, full_name_en FROM users WHERE role IN ('doctor','consultant') AND is_active=1 ORDER BY full_name_en`);
  const today = todayISO();

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
  const nid = document.getElementById('appt-nid').value.trim() || null;
  // Link to a registered patient by national id when possible: the portal's
  // "My Appointments" matches on strong identifiers only (never name — name
  // matching leaked same-named patients' visit reasons), so storing the MRN
  // here keeps reception-booked appointments visible to the right patient.
  const linked = nid ? dbGet(`SELECT mrn FROM patients WHERE national_id = ?`, [nid]) : null;
  dbRun(`INSERT INTO appointments (patient_name_ar, patient_name_en, national_id, mrn, phone, dept_id, doctor_id, appt_date, appt_time, reason, created_by, created_at, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'scheduled')`,
    [nameAr, nameEn, nid,
     linked ? linked.mrn : null,
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
  const today = todayISO();
  const appts = dbAll(`
    SELECT a.*, d.name_en as dept_en, d.name_ar as dept_ar
    FROM appointments a
    LEFT JOIN departments d ON a.dept_id = d.dept_id
    WHERE a.doctor_id = ? AND a.appt_date >= ? AND a.status != 'cancelled'
    ORDER BY a.appt_date, a.appt_time
  `, [user.user_id, today]);

  main.innerHTML = `
    <div class="page-header"><h1>${t('doc_appointments')}</h1></div>
    ${appts.length === 0 ? `${emptyState(lang==='ar'?'لا توجد مواعيد قادمة':'No upcoming appointments')}` : `
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
    ${invoices.length === 0 ? `${emptyState(lang==='ar'?'لا توجد فواتير':'No invoices yet')}` : `
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
  const depts = dbAll(`SELECT dept_id, name_ar, name_en FROM departments WHERE type NOT IN ('admin','support') ORDER BY name_en`);
  const today = todayISO();

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
          <div class="form-group"><label>${lang==='ar'?'التخصص':'Specialty'}</label><select id="bill-dept">${deptOpts}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${lang==='ar'?'التاريخ *':'Date *'}</label><input type="date" id="bill-date" required value="${today}"></div>
          <div class="form-group">
            <label>${lang==='ar'?'طريقة الدفع':'Payment Method'}</label>
            <select id="bill-payment" onchange="toggleBillPayment()">
              <option value="cash">${lang==='ar'?'نقدي':'Cash'}</option>
              <option value="mobile_wallet">${lang==='ar'?'محفظة إلكترونية':'Mobile Wallet'}</option>
              <option value="instapay">${lang==='ar'?'انستاباي':'InstaPay'}</option>
              <option value="insurance">${lang==='ar'?'تأمين':'Insurance'}</option>
            </select>
          </div>
        </div>
        <div class="form-group" id="bill-ins-group" style="display:none">
          <label>${lang==='ar'?'شركة التأمين':'Insurance Company'}</label>
          <select id="bill-insurance">
            <option value="BUPA">BUPA Arabia</option>
            <option value="Tawuniya">Tawuniya</option>
            <option value="MedGulf">MedGulf</option>
            <option value="AXA">AXA Cooperative</option>
            <option value="Other">${lang==='ar'?'أخرى':'Other'}</option>
          </select>
        </div>
        <div class="form-group" id="bill-proof-group" style="display:none">
          <label>📎 ${lang==='ar'?'إثبات الدفع (صورة المحفظة / انستاباي)':'Payment proof (wallet / InstaPay screenshot)'}</label>
          <input type="file" id="bill-proof" accept="image/*">
        </div>
        <hr>
        <h4>${lang==='ar'?'البنود — اختر من الإجراءات الشائعة أو «أخرى»':'Line items — pick a common procedure or "Other"'}</h4>
        <div id="bill-items">
          <div class="form-row bill-item-row">
            <div class="form-group" style="flex:3"><label>${lang==='ar'?'الإجراء':'Procedure'}</label><select class="item-proc" onchange="billItemPicked(this)">${billProcOptions(lang)}</select></div>
            <div class="form-group" style="flex:2"><label>${lang==='ar'?'الوصف (عربي)':'Desc (Arabic)'}</label><input type="text" class="item-ar" required></div>
            <div class="form-group" style="flex:2"><label>${lang==='ar'?'الوصف (إنجليزي)':'Desc (English)'}</label><input type="text" class="item-en"></div>
            <div class="form-group" style="flex:1"><label>${lang==='ar'?'الكمية':'Qty'}</label><input type="number" class="item-qty" value="1" min="1" oninput="updateBillTotal()"></div>
            <div class="form-group" style="flex:1"><label>${lang==='ar'?'السعر':'Price'}</label><input type="number" class="item-price" step="0.01" min="0" oninput="updateBillTotal()"></div>
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

function toggleBillPayment() {
  const val = document.getElementById('bill-payment').value;
  const ins = document.getElementById('bill-ins-group'); if (ins) ins.style.display = val === 'insurance' ? '' : 'none';
  const proof = document.getElementById('bill-proof-group'); if (proof) proof.style.display = (val === 'mobile_wallet' || val === 'instapay') ? '' : 'none';
}

// Common dental procedures for billing, grouped by category, from the catalog
// (e.g. حشو ضرس / Filling, خلع ضرس / Extraction …) + an "Other / custom" catch-all.
function billProcOptions(lang) {
  const procs = dbAll('SELECT code, name_en, name_ar, category, default_price FROM procedures WHERE active = 1 ORDER BY category, name_en');
  const byCat = {};
  procs.forEach(p => { (byCat[p.category] = byCat[p.category] || []).push(p); });
  const catLabel = { diagnostic: ['Diagnostic', 'تشخيص'], preventive: ['Preventive', 'وقاية'], restorative: ['Restorative (fillings)', 'حشوات'], endodontic: ['Endodontics', 'علاج عصب'], periodontic: ['Periodontics', 'لثة'], oral_surgery: ['Oral Surgery', 'جراحة الفم'], prosthodontic: ['Prosthodontics', 'تركيبات'], orthodontic: ['Orthodontics', 'تقويم'], cosmetic: ['Cosmetic', 'تجميل'] };
  let html = `<option value="">${lang === 'ar' ? '— اختر إجراء —' : '— Pick a procedure —'}</option>`;
  Object.keys(byCat).forEach(cat => {
    const g = (catLabel[cat] ? (lang === 'ar' ? catLabel[cat][1] : catLabel[cat][0]) : cat);
    html += `<optgroup label="${escapeHtml(g)}">` +
      byCat[cat].map(p => `<option value="${escapeHtml(p.code)}" data-en="${jsAttr(p.name_en)}" data-ar="${jsAttr(p.name_ar)}" data-price="${p.default_price}">${escapeHtml(lang === 'ar' ? p.name_ar : p.name_en)}</option>`).join('') +
      `</optgroup>`;
  });
  html += `<option value="__other__">${lang === 'ar' ? '✏️ أخرى / مخصص' : '✏️ Other / custom'}</option>`;
  return html;
}
function billItemPicked(sel) {
  const row = sel.closest('.bill-item-row'); if (!row) return;
  const o = sel.selectedOptions[0];
  if (o && o.value && o.value !== '__other__') {
    row.querySelector('.item-en').value = o.dataset.en || '';
    row.querySelector('.item-ar').value = o.dataset.ar || '';
    row.querySelector('.item-price').value = o.dataset.price || '';
  } else if (o && o.value === '__other__') {
    row.querySelector('.item-en').value = ''; row.querySelector('.item-ar').value = ''; row.querySelector('.item-price').value = '';
    row.querySelector('.item-ar').focus();
  }
  updateBillTotal();
}

function addBillItem() {
  const lang = currentLanguage();
  const container = document.getElementById('bill-items');
  const row = document.createElement('div');
  row.className = 'form-row bill-item-row';
  row.innerHTML = `
    <div class="form-group" style="flex:3"><select class="item-proc" onchange="billItemPicked(this)">${billProcOptions(lang)}</select></div>
    <div class="form-group" style="flex:2"><input type="text" class="item-ar" placeholder="${lang==='ar'?'الوصف (عربي)':'Desc (Arabic)'}" required></div>
    <div class="form-group" style="flex:2"><input type="text" class="item-en" placeholder="${lang==='ar'?'الوصف (إنجليزي)':'Desc (English)'}"></div>
    <div class="form-group" style="flex:1"><input type="number" class="item-qty" value="1" min="1" oninput="updateBillTotal()"></div>
    <div class="form-group" style="flex:1"><input type="number" class="item-price" step="0.01" min="0" oninput="updateBillTotal()"></div>
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

  // Link to an existing patient by national id (so the proof image + invoice attach to the record).
  const pat = nid ? dbGet('SELECT patient_id, branch FROM patients WHERE national_id = ?', [nid]) : null;
  const patientId = pat ? pat.patient_id : null;
  dbRun(`INSERT INTO invoices (patient_id, patient_name_ar, patient_name_en, national_id, dept_id, visit_date, subtotal, total, payment_type, insurance_company, status, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,'unpaid',?,?)`,
    [patientId, nameAr, nameEn, nid, deptId, date, total, total, payment, insco, session.user_id, nowISO()]);
  const invoiceId = dbLastId();

  for (const item of items) {
    dbRun(`INSERT INTO invoice_items (invoice_id, description_en, description_ar, qty, unit_price, total_price) VALUES (?,?,?,?,?,?)`,
      [invoiceId, item.en, item.ar, item.qty, item.price, item.lineTotal]);
  }

  // Payment proof (mobile wallet / InstaPay screenshot) — saved to the patient
  // file and linked to the invoice. Needs a resolved patient (FK target).
  const proofInput = document.getElementById('bill-proof');
  const proofFile = proofInput && proofInput.files && proofInput.files[0];
  if (proofFile && (payment === 'mobile_wallet' || payment === 'instapay')) {
    if (patientId && proofFile.size <= ATTACH_MAX_BYTES) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          dbRun('INSERT INTO patient_attachments (patient_id, filename, mime, kind, size_bytes, data, note, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?,?,?,?)',
            [patientId, proofFile.name, proofFile.type, 'payment_proof', proofFile.size, String(reader.result || ''), `${payment} — invoice #${invoiceId}`, user.user_id, nowISO()]);
          dbRun('UPDATE invoices SET proof_attach_id = ? WHERE invoice_id = ?', [dbLastId(), invoiceId]);
          dlog('billing.proofSaved', { invoiceId, patientId, payment }); saveDBToIndexedDB();
        } catch (er) { derr('billing.proof', er); }
      };
      reader.readAsDataURL(proofFile);
    } else { showToast(lang==='ar'?'تعذّر حفظ إثبات الدفع (ربط المريض بالهوية مطلوب)':'Proof not saved (link a registered patient via National ID)', 'warn'); }
  }

  await logAction('INVOICE_CREATED',
    `${user.full_name_en} created invoice #${invoiceId} for ${nameEn} — ${total.toFixed(2)} SAR (${payment})`,
    null, patientId, nameEn, nid || '');
  dlog('billing.invoiceCreated', { invoiceId, patientId, total, payment, items: items.length });
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
// BroadcastChannel — Live Updates Across Tabs
// ============================================================

const HIS_CHANNEL = (function() {
  try {
    const ch = new BroadcastChannel('his_live_updates');
    ch.onmessage = function(e) {
      const { table, view, type } = e.data || {};
      // Multi-tab presence handshake (local mode only). Each tab holds its own
      // sql.js copy and full-DB saves are last-writer-wins — split-tab editing
      // can silently lose committed writes. Server mode is exempt: one shared
      // DB behind /api, tabs are just views.
      if (type === 'tab-hello' || type === 'tab-here') {
        if (typeof SERVER_MODE !== 'undefined' && SERVER_MODE) return;
        if (type === 'tab-hello') { try { ch.postMessage({ type: 'tab-here' }); } catch (err) {} }
        _warnMultiTab();
        return;
      }
      handleLiveUpdate(table, view);
    };
    try { ch.postMessage({ type: 'tab-hello' }); } catch (err) {}
    return ch;
  } catch (err) {
    console.warn('[HIS] BroadcastChannel not supported, live updates disabled');
    return null;
  }
})();

let _multiTabWarned = false;
function _warnMultiTab() {
  if (_multiTabWarned) return;
  _multiTabWarned = true;
  const ar = currentLanguage() === 'ar';
  const banner = document.createElement('div');
  banner.id = 'multi-tab-warning';
  banner.setAttribute('style', 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#b91c1c;color:#fff;padding:8px 14px;font-size:0.9rem;display:flex;gap:10px;align-items:center;justify-content:center;');
  banner.innerHTML = `<span>&#9888; ${ar
    ? 'OpenWard مفتوح في تبويب آخر — التعديل من تبويبين قد يفقد بيانات محفوظة. استخدم تبويباً واحداً للإدخال.'
    : 'OpenWard is open in another tab — editing in two tabs can lose saved data. Use ONE tab for data entry.'}</span>
    <button onclick="this.parentNode.remove()" style="background:transparent;border:1px solid #fff;color:#fff;border-radius:4px;padding:2px 10px;cursor:pointer;">${ar ? 'فهمت' : 'Got it'}</button>`;
  document.body.appendChild(banner);
}

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
    // Never yank the view out from under active data entry: a re-render
    // destroys every in-progress form field. If the user is focused in an
    // input or a modal/alert is open, show the indicator as a hint only.
    const ae = document.activeElement;
    const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable);
    const modalOpen = document.querySelector('.modal-overlay, .alert-overlay');

    // Show a subtle refresh indicator
    const indicator = document.createElement('div');
    indicator.className = 'live-update-indicator';
    indicator.textContent = (typing || modalOpen)
      ? (currentLanguage() === 'ar' ? '🔄 تحديثات متاحة' : '🔄 Updates available')
      : (currentLanguage() === 'ar' ? '🔄 تحديث مباشر' : '🔄 Live update');
    document.body.appendChild(indicator);
    setTimeout(() => indicator.remove(), 2000);

    if (typing || modalOpen) return;

    // Re-render current view
    renderView(currentView);
  }, 300);
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

  // Escape every patient-controlled field: this HTML is written into a print
  // window with win.document.write(), so an unescaped name/allergen/EC value
  // containing markup would execute there (stored XSS via the wristband).
  const name = escapeHtml(lang==='ar' ? patient.full_name_ar : (patient.full_name_en || patient.full_name_ar));
  const dob = patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('en-GB') : '—';
  const dept = escapeHtml(lang==='ar' ? admission.dept_ar : admission.dept_en);
  const admitted = admission.admitted_at ? new Date(admission.admitted_at).toLocaleDateString('en-GB') : '—';
  const allergies = dbAll('SELECT allergen FROM patient_allergies WHERE patient_id = ?', [patientId]);
  const allergyText = allergies.length ? escapeHtml(allergies.map(a=>a.allergen).join(', ')) : (lang==='ar'?'لا توجد':'None');
  const commDiseases = dbAll("SELECT condition_code FROM patient_conditions WHERE patient_id = ? AND category = 'communicable'", [patientId]);
  const commText = commDiseases.length ? escapeHtml(commDiseases.map(c => COMMUNICABLE_DISEASES[c.condition_code] ? COMMUNICABLE_DISEASES[c.condition_code].en : c.condition_code).join(', ')) : null;
  const ecName = escapeHtml(patient.emergency_contact_name || patient.emergency_contact || '');
  const ecPhone = escapeHtml(patient.emergency_contact_phone || '');
  const mrnEsc = escapeHtml(patient.mrn);
  const bedEsc = escapeHtml(admission.bed_number || '—');
  const bloodEsc = escapeHtml(patient.blood_type || '');

  // Simple barcode-like visual using MRN characters
  const barcodeHtml = patient.mrn.split('').map(c =>
    `<div style="display:inline-block;width:${2+Math.random()*3}px;height:40px;background:#000;margin:0 1px;vertical-align:bottom;"></div>`
  ).join('') + `<div style="font-size:10px;text-align:center;letter-spacing:3px;margin-top:2px;">${mrnEsc}</div>`;

  const wristbandHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Wristband — ${mrnEsc}</title>
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
          <div class="wb-mrn">MRN: ${mrnEsc}</div>
          <div class="wb-row">📅 DOB: ${dob}</div>
          <div class="wb-row">🛏️ ${lang==='ar'?'السرير':'Bed'}: ${bedEsc} &nbsp;|&nbsp; 🏥 ${dept}</div>
          <div class="wb-row">📅 ${lang==='ar'?'تاريخ الدخول':'Admitted'}: ${admitted}</div>
          ${patient.blood_type && patient.blood_type !== 'unknown' ? `<div class="wb-row">🩸 ${lang==='ar'?'فصيلة الدم':'Blood Type'}: <strong>${bloodEsc}</strong></div>` : ''}
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
// PATIENT PORTAL — Patient self-service views
// ============================================================

function renderPPOverview(main, lang) {
  const patient = getCurrentPatient();
  if (!patient) { main.innerHTML = emptyState(t('patient_login_required')); return; }
  const pid = patient.patient_id;
  const money = (n) => Number(n || 0).toLocaleString() + ' ' + (lang === 'ar' ? 'ر.س' : 'SAR');
  const planItems = dbGet("SELECT COUNT(*) c FROM treatment_plan_items WHERE patient_id=? AND status IN ('planned','in_progress')", [pid]).c;
  const rxCount = dbGet("SELECT COUNT(*) c FROM prescriptions WHERE patient_id=? AND status='active'", [pid]).c;
  const apptCount = dbGet("SELECT COUNT(*) c FROM appointments WHERE patient_id=? AND status IN ('scheduled','checked_in') AND appt_date >= ?", [pid, todayISO()]).c;
  const unread = dbGet("SELECT COUNT(*) c FROM portal_messages WHERE patient_id=? AND from_type='staff' AND read_at IS NULL", [pid]).c;
  const nextAppt = dbGet("SELECT a.*, u.full_name_en doc_en, u.full_name_ar doc_ar FROM appointments a LEFT JOIN users u ON u.user_id=a.doctor_id WHERE a.patient_id=? AND a.appt_date >= ? AND a.status IN ('scheduled','checked_in') ORDER BY a.appt_date, a.appt_time LIMIT 1", [pid, todayISO()]);
  const allergies = dbAll('SELECT * FROM patient_allergies WHERE patient_id=?', [pid]);
  const conditions = dbAll("SELECT * FROM patient_conditions WHERE patient_id=? AND status='active'", [pid]);
  const recall = dbGet("SELECT * FROM recalls WHERE patient_id=? AND status IN ('due','scheduled') ORDER BY due_date LIMIT 1", [pid]);
  const greeting = lang === 'ar' ? 'مرحباً، ' + patient.full_name_ar.split(' ')[0] + '!' : 'Welcome back, ' + (patient.full_name_en || patient.full_name_ar).split(' ')[0] + '!';
  main.innerHTML = '' +
    '<div class="page-header"><div><h1 style="font-size:1.6rem">&#128075; ' + escapeHtml(greeting) + '</h1>' +
    '<p style="color:#6b7280;margin-top:4px">' + (lang === 'ar' ? 'الرقم الطبي: ' : 'MRN: ') + '<strong>' + escapeHtml(patient.mrn) + '</strong></p></div></div>' +
    (nextAppt ? '<div class="card" style="background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;border:none;margin-bottom:16px"><div class="card-body" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:center">' +
      '<div><div style="opacity:.9;font-size:.85rem">' + (lang === 'ar' ? 'موعدك القادم' : 'Your next appointment') + '</div>' +
      '<div style="font-size:1.3rem;font-weight:700">' + escapeHtml(nextAppt.reason || (lang === 'ar' ? 'كشف' : 'Visit')) + '</div>' +
      '<div style="opacity:.9">' + (lang === 'ar' ? 'مع ' : 'with ') + escapeHtml(lang === 'ar' ? (nextAppt.doc_ar || '') : (nextAppt.doc_en || '')) + '</div></div>' +
      '<div style="text-align:right"><div style="font-size:1.2rem;font-weight:700">' + nextAppt.appt_date + '</div><div>' + nextAppt.appt_time + '</div></div></div></div>' : '') +
    (recall && recall.status === 'due' ? '<div class="card" style="background:#fffbeb;border:1px solid #fcd34d;color:#92400e;margin-bottom:16px"><div class="card-body">&#9200; ' +
      (lang === 'ar' ? 'حان موعد المراجعة الدورية (' + recall.due_date + '). يُنصح بحجز موعد.' : 'You are due for a recall checkup (' + recall.due_date + '). Please book an appointment.') + '</div></div>' : '') +
    '<div class="stats-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px">' +
      '<div class="stat-card" style="cursor:pointer" onclick="navigateTo(\'pp-labs\')"><div style="font-size:2rem">&#129463;</div><div style="font-size:1.4rem;font-weight:700">' + planItems + '</div><div style="color:#6b7280;font-size:.85rem">' + (lang === 'ar' ? 'بنود العلاج' : 'Treatment items') + '</div></div>' +
      '<div class="stat-card" style="cursor:pointer" onclick="navigateTo(\'pp-prescriptions\')"><div style="font-size:2rem">&#128138;</div><div style="font-size:1.4rem;font-weight:700">' + rxCount + '</div><div style="color:#6b7280;font-size:.85rem">' + (lang === 'ar' ? 'الأدوية' : 'Medications') + '</div></div>' +
      '<div class="stat-card" style="cursor:pointer" onclick="navigateTo(\'pp-appointments\')"><div style="font-size:2rem">&#128197;</div><div style="font-size:1.4rem;font-weight:700">' + apptCount + '</div><div style="color:#6b7280;font-size:.85rem">' + (lang === 'ar' ? 'مواعيد قادمة' : 'Upcoming') + '</div></div>' +
      '<div class="stat-card" style="cursor:pointer" onclick="navigateTo(\'pp-messages\')"><div style="font-size:2rem">&#128172;</div><div style="font-size:1.4rem;font-weight:700">' + unread + '</div><div style="color:#6b7280;font-size:.85rem">' + (lang === 'ar' ? 'رسائل' : 'Messages') + '</div></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">' +
      '<div class="card"><div class="card-header" style="background:#fef2f2;border-bottom:2px solid #fecaca"><h3>&#9888;&#65039; ' + (lang === 'ar' ? 'الحساسيات' : 'Allergies') + '</h3></div><div class="card-body">' +
        (allergies.length ? allergies.map(a => '<div style="padding:8px;border-left:4px solid #dc2626;background:#fef2f2;border-radius:4px;margin-bottom:6px"><div style="font-weight:600;color:#7f1d1d">' + escapeHtml(a.allergen) + '</div>' + (a.severity ? '<span class="badge badge-danger">' + escapeHtml(a.severity) + '</span>' : '') + '</div>').join('') : '<p style="color:#6b7280">' + (lang === 'ar' ? 'لا توجد حساسيات' : 'No known allergies') + '</p>') +
      '</div></div>' +
      '<div class="card"><div class="card-header"><h3>&#129658; ' + (lang === 'ar' ? 'حالاتي الطبية' : 'My conditions') + '</h3></div><div class="card-body">' +
        (conditions.length ? conditions.map(c => '<div style="padding:6px 0;border-bottom:1px solid #f3f4f6">' + escapeHtml(c.display || c.condition_code) + '</div>').join('') : '<p style="color:#6b7280">' + (lang === 'ar' ? 'لا يوجد' : 'None on record') + '</p>') +
      '</div></div>' +
    '</div>';
}

function renderPPVisits(main, lang) {
  const patient = getCurrentPatient();
  if (!patient) { main.innerHTML = emptyState(t('patient_login_required')); return; }
  // Mirror the clinical history the dentist recorded (what was done each visit).
  const historyHtml = (typeof clinicalHistoryHtml === 'function') ? clinicalHistoryHtml(patient.patient_id, lang) : '';
  main.innerHTML = '<div class="page-header"><h1>' + (lang === 'ar' ? 'سجلّي العلاجي' : 'My Clinical History') + '</h1></div>' +
    '<div class="card"><p class="muted" style="margin-top:0">' + (lang === 'ar' ? 'ما تمّ في كل زيارة، كما سجّله طبيبك:' : 'What was done at each visit, as recorded by your dentist:') + '</p>' + historyHtml + '</div>';
}

// pp-labs is repurposed as the patient's Treatment Plan view.
function renderPPLabs(main, lang) {
  const patient = getCurrentPatient();
  if (!patient) { main.innerHTML = emptyState(t('patient_login_required')); return; }
  const money = (n) => Number(n || 0).toLocaleString() + ' ' + (lang === 'ar' ? 'ر.س' : 'SAR');
  const items = dbAll("SELECT * FROM treatment_plan_items WHERE patient_id=? ORDER BY status, created_at", [patient.patient_id]);
  const planned = items.filter(i => i.status === 'planned' || i.status === 'in_progress').reduce((s, i) => s + (i.price || 0), 0);
  const stBadge = (s) => s === 'completed' ? '<span class="badge badge-success">' + (lang === 'ar' ? 'مكتمل' : 'Done') + '</span>' : s === 'in_progress' ? '<span class="badge badge-warning">' + (lang === 'ar' ? 'جارٍ' : 'In progress') + '</span>' : '<span class="badge badge-info">' + (lang === 'ar' ? 'مقترح' : 'Planned') + '</span>';
  main.innerHTML = '<div class="page-header"><h1>' + (lang === 'ar' ? 'خطتي العلاجية' : 'My Treatment Plan') + '</h1></div>' +
    '<div class="card"><p style="color:#6b7280;margin-top:0">' + (lang === 'ar' ? 'إجمالي العلاج المخطط المتبقّي: ' : 'Estimated remaining treatment: ') + '<strong>' + money(planned) + '</strong></p>' +
    (items.length ? '<div class="table-container"><table><thead><tr><th>' + (lang === 'ar' ? 'الإجراء' : 'Procedure') + '</th><th>' + (lang === 'ar' ? 'السن' : 'Tooth') + '</th><th>' + (lang === 'ar' ? 'التكلفة' : 'Cost') + '</th><th>' + (lang === 'ar' ? 'الحالة' : 'Status') + '</th></tr></thead><tbody>' +
      items.map(i => '<tr><td>' + escapeHtml(lang === 'ar' ? (i.procedure_name_ar || i.procedure_name_en) : i.procedure_name_en) + '</td><td>' + (i.tooth_fdi || '—') + '</td><td>' + money(i.price) + '</td><td>' + stBadge(i.status) + '</td></tr>').join('') + '</tbody></table></div>' : emptyState(lang === 'ar' ? 'لا توجد خطة علاجية' : 'No treatment plan yet')) + '</div>';
}

function renderPPPrescriptions(main, lang) {
  const patient = getCurrentPatient();
  if (!patient) { main.innerHTML = emptyState(t('patient_login_required')); return; }
  const rxs = dbAll("SELECT * FROM prescriptions WHERE patient_id=? ORDER BY prescribed_at DESC", [patient.patient_id]);
  main.innerHTML = '<div class="page-header"><h1>' + (lang === 'ar' ? 'أدويتي' : 'My Medications') + '</h1></div><div class="card">' +
    (rxs.length ? '<div class="table-container"><table><thead><tr><th>' + (lang === 'ar' ? 'الدواء' : 'Medication') + '</th><th>' + (lang === 'ar' ? 'الجرعة' : 'Dose') + '</th><th>' + (lang === 'ar' ? 'التكرار' : 'Frequency') + '</th><th>' + (lang === 'ar' ? 'الحالة' : 'Status') + '</th></tr></thead><tbody>' +
      rxs.map(r => '<tr><td>' + escapeHtml(r.drug_name) + '</td><td>' + escapeHtml(r.dose || '—') + '</td><td>' + escapeHtml(r.frequency || '—') + '</td><td><span class="badge ' + (r.status === 'active' ? 'badge-success' : 'badge-secondary') + '">' + escapeHtml(r.status) + '</span></td></tr>').join('') + '</tbody></table></div>' : emptyState(lang === 'ar' ? 'لا توجد أدوية' : 'No medications')) + '</div>';
}

function renderPPAppointments(main, lang) {
  const patient = getCurrentPatient();
  if (!patient) { main.innerHTML = emptyState(t('patient_login_required')); return; }
  const appts = dbAll("SELECT a.*, u.full_name_en doc_en, u.full_name_ar doc_ar FROM appointments a LEFT JOIN users u ON u.user_id=a.doctor_id WHERE a.patient_id=? ORDER BY a.appt_date DESC", [patient.patient_id]);
  const today = todayISO();
  main.innerHTML = '<div class="page-header"><h1>' + (lang === 'ar' ? 'مواعيدي' : 'My Appointments') + '</h1><button class="btn btn-primary" onclick="showPPBookAppt()">+ ' + (lang === 'ar' ? 'حجز موعد' : 'Request appointment') + '</button></div><div class="card">' +
    (appts.length ? '<div class="table-container"><table><thead><tr><th>' + (lang === 'ar' ? 'التاريخ' : 'Date') + '</th><th>' + (lang === 'ar' ? 'الوقت' : 'Time') + '</th><th>' + (lang === 'ar' ? 'السبب' : 'Reason') + '</th><th>' + (lang === 'ar' ? 'الطبيب' : 'Dentist') + '</th><th>' + (lang === 'ar' ? 'الحالة' : 'Status') + '</th></tr></thead><tbody>' +
      appts.map(a => '<tr ' + (a.appt_date >= today && a.status !== 'completed' ? 'style="background:#eff6ff"' : '') + '><td>' + a.appt_date + '</td><td>' + a.appt_time + '</td><td>' + escapeHtml(a.reason || '—') + '</td><td>' + escapeHtml(lang === 'ar' ? (a.doc_ar || '—') : (a.doc_en || '—')) + '</td><td><span class="badge badge-info">' + escapeHtml(a.status) + '</span></td></tr>').join('') + '</tbody></table></div>' : emptyState(lang === 'ar' ? 'لا مواعيد' : 'No appointments')) + '</div>';
}


function renderPPMessages(main, lang) {
  const patient = getCurrentPatient();
  if (!patient) { main.innerHTML = `${emptyState(t('patient_login_required'))}`; return; }

  // Mark staff-to-patient messages as read on view
  dbRun(`UPDATE portal_messages SET read_at = ? WHERE patient_id = ? AND from_type='staff' AND read_at IS NULL`,
    [nowISO(), patient.patient_id]);
  saveDBToIndexedDB();

  // from_type filter is defense-in-depth: staff STEMI/stroke pages were stored
  // in this same table keyed by staff USER id, and users.user_id can collide
  // with patients.patient_id (independent AUTOINCREMENTs) — an unrelated patient
  // could read an incoming patient's full clinical page in their own inbox.
  const msgs = dbAll(`
    SELECT pm.*, u.full_name_ar as sender_ar, u.full_name_en as sender_en, u.role as sender_role
    FROM portal_messages pm
    LEFT JOIN users u ON pm.from_id = u.user_id AND pm.from_type='staff'
    WHERE pm.patient_id = ? AND pm.from_type IN ('staff','patient')
    ORDER BY pm.sent_at DESC LIMIT 100
  `, [patient.patient_id]);

  main.innerHTML = `
    <div class="page-header">
      <h1>&#128172; ${t('pp_messages')}</h1>
      <button class="btn btn-primary" onclick="showPPNewMessage()">+ ${lang==='ar'?'رسالة جديدة':'New Message'}</button>
    </div>
    <div id="pp-message-form-container"></div>
    ${msgs.length === 0 ? `${emptyState(lang==='ar'?'لا توجد رسائل':'No messages yet')}` : `
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
  const depts = dbAll(`SELECT dept_id, name_ar, name_en FROM departments WHERE type NOT IN ('admin','support') ORDER BY name_en`);
  const today = todayISO();
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
  // Cap portal requests at 5/day per patient: an unbounded loop (or an angry
  // thumb) flooding 'requested' rows is a reception-queue DoS, and rows have
  // no delete flow. Counted by creation day, not appt_date, so spreading the
  // requested dates doesn't dodge the cap.
  const todayReqs = dbGet(`SELECT COUNT(*) AS c FROM appointments WHERE requested_by_patient_id = ? AND substr(created_at, 1, 10) = ?`,
    [patient.patient_id, todayISO()]);
  if (todayReqs && todayReqs.c >= 5) {
    showError(lang === 'ar' ? 'وصلت للحد الأقصى من طلبات المواعيد اليوم (5) — تواصل مع الاستقبال' : 'Daily appointment-request limit reached (5) — please contact reception');
    return;
  }
  // created_by is NOT NULL and references staff users; 0 marks patient-originated rows
  dbRun(`INSERT INTO appointments (patient_name_ar, patient_name_en, national_id, mrn, dept_id, appt_date, appt_time, reason, status, created_at, created_by, requested_by_patient_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, 0, ?)`,
    [patient.full_name_ar, patient.full_name_en, patient.national_id, patient.mrn, deptId, date, time, reason, nowISO(), patient.patient_id]);
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
  // Ownership check (IDOR guard): only a prescription on one of THIS patient's
  // admissions — a tampered rx_id must not leak another patient's drug/dose/
  // doctor into the message body or the audit row.
  const rx = dbGet(`SELECT p.*, u.full_name_en as dr_en FROM prescriptions p
    JOIN admissions a ON p.admission_id = a.admission_id
    LEFT JOIN users u ON p.doctor_id = u.user_id
    WHERE p.rx_id = ? AND a.patient_id = ?`, [rxId, patient.patient_id]);
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
