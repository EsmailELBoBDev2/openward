// ============================================================
// OpenSmile — dental clinical views
// Odontogram, treatment plans, dentist & hygienist workspaces, the manager
// dashboard, and a patient-centric prescribe that reuses checkDrugAllergy()
// from allergy-check.js. The "active patient" is window.SELECTED_PATIENT_ID,
// set by showPatientDetail() (router.js) / the patient pickers here.
// Tooth numbering is FDI / ISO-3950.
// ============================================================

// FDI permanent dentition, laid out as a real chart (patient's right on the left).
const FDI_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const FDI_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

// status -> {color, label en/ar, glyph}
const TOOTH_STATUS = {
  sound:      { c: '#ffffff', en: 'Sound',          ar: 'سليم' },
  caries:     { c: '#ef4444', en: 'Caries',         ar: 'تسوّس' },
  filled:     { c: '#3b82f6', en: 'Filled',         ar: 'محشو' },
  crown:      { c: '#f59e0b', en: 'Crown',          ar: 'تاج' },
  bridge:     { c: '#a855f7', en: 'Bridge',         ar: 'جسر' },
  implant:    { c: '#14b8a6', en: 'Implant',        ar: 'زرعة' },
  missing:    { c: '#9ca3af', en: 'Missing',        ar: 'مفقود' },
  rct:        { c: '#fb923c', en: 'Root canal',     ar: 'علاج عصب' },
  to_extract: { c: '#7f1d1d', en: 'To extract',     ar: 'للخلع' },
  sealant:    { c: '#22c55e', en: 'Sealant',        ar: 'سيلانت' },
  veneer:     { c: '#ec4899', en: 'Veneer',         ar: 'فينير' },
  impacted:   { c: '#92400e', en: 'Impacted',       ar: 'منطمر' },
  fracture:   { c: '#db2777', en: 'Fracture',       ar: 'كسر' },
};

function activePatientId() { return window.SELECTED_PATIENT_ID || null; }
function setActivePatient(id) { window.SELECTED_PATIENT_ID = id; }

function getPatientOr(main, lang, then) {
  const pid = activePatientId();
  if (!pid) { renderPatientPicker(main, lang, then); return null; }
  const p = dbGet('SELECT * FROM patients WHERE patient_id = ?', [pid]);
  if (!p) { setActivePatient(null); renderPatientPicker(main, lang, then); return null; }
  return p;
}

// A "pick a patient" screen (typo-tolerant fuzzy search + branch filter) shown
// when no patient is selected yet — also the dentist/hygienist Patients list.
function renderPatientPicker(main, lang, targetView) {
  const ps = dbAll('SELECT patient_id, mrn, full_name_ar, full_name_en, phone, national_id, date_of_birth, branch FROM patients ORDER BY patient_id DESC');
  const branchOpts = '<option value="">' + (lang === 'ar' ? 'كل الفروع' : 'All branches') + '</option>' +
    (typeof BRANCHES !== 'undefined' ? BRANCHES.map(b => `<option value="${b.key}">${escapeHtml(lang === 'ar' ? b.ar : b.en)}</option>`).join('') : '');
  main.innerHTML = `
    <div class="page-header"><h1>${lang === 'ar' ? 'المرضى' : 'Patients'}</h1></div>
    <div class="card">
      <div class="form-row" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <input type="text" id="pp-filter" class="form-control" placeholder="${lang === 'ar' ? 'بحث بالاسم أو الرقم أو الهاتف… (يتحمّل الأخطاء)' : 'Fuzzy search name / MRN / phone / ID…'}" style="flex:2;min-width:220px">
        <select id="pp-branch" class="form-control" style="flex:1;min-width:160px">${branchOpts}</select>
      </div>
      <div class="table-container"><table><thead><tr>
        <th>${t('mrn')}</th><th>${lang === 'ar' ? 'الاسم' : 'Name'}</th><th>${t('phone')}</th><th>${lang === 'ar' ? 'الفرع' : 'Branch'}</th><th></th>
      </tr></thead><tbody id="pp-rows">
        ${ps.map(p => `<tr data-s="${escapeHtml(((p.full_name_en||'')+' '+(p.full_name_ar||'')+' '+(p.mrn||'')+' '+(p.phone||'')+' '+(p.national_id||'')).toLowerCase())}" data-branch="${escapeHtml(p.branch||'')}">
          <td style="font-family:monospace;font-size:.8rem">${escapeHtml(p.mrn)}</td>
          <td>${escapeHtml(lang==='ar'?p.full_name_ar:(p.full_name_en||p.full_name_ar))}</td>
          <td>${escapeHtml(p.phone||'—')}</td>
          <td><span style="font-size:.78rem;color:#6b7280">${escapeHtml(typeof branchLabel==='function'?branchLabel(p.branch,lang):(p.branch||'—'))}</span></td>
          <td><button class="btn btn-sm btn-primary" onclick="setActivePatient(${p.patient_id});navigateTo('${targetView}')">${lang==='ar'?'فتح':'Open'}</button></td>
        </tr>`).join('')}
      </tbody></table>
      <p id="pp-count" style="color:#9ca3af;font-size:.8rem;margin-top:8px"></p>
      </div>
    </div>`;
  const apply = () => {
    const q = (document.getElementById('pp-filter')||{}).value || '';
    const br = (document.getElementById('pp-branch')||{}).value || '';
    let shown = 0;
    document.querySelectorAll('#pp-rows tr').forEach(tr => {
      const ok = (typeof fuzzyMatch === 'function' ? fuzzyMatch(tr.dataset.s, q) : tr.dataset.s.includes(q.toLowerCase())) && (!br || tr.dataset.branch === br);
      tr.style.display = ok ? '' : 'none'; if (ok) shown++;
    });
    const c = document.getElementById('pp-count'); if (c) c.textContent = `${shown} / ${ps.length}`;
  };
  const f = document.getElementById('pp-filter'); if (f) f.addEventListener('input', apply);
  const b = document.getElementById('pp-branch'); if (b) b.addEventListener('change', apply);
  apply();
}

// Patient header card + a dental safety strip (allergies + flags), reused atop
// every per-patient dental screen.
function dentalPatientHeader(p, lang, activeTab) {
  const age = p.date_of_birth ? Math.floor((Date.now() - new Date(p.date_of_birth)) / 31557600000) : '—';
  const allergies = dbAll('SELECT * FROM patient_allergies WHERE patient_id = ?', [p.patient_id]);
  const flags = dbAll('SELECT * FROM patient_flags WHERE patient_id = ? AND active = 1', [p.patient_id]);
  const conds = dbAll("SELECT * FROM patient_conditions WHERE patient_id = ? AND status = 'active'", [p.patient_id]);
  let strip = '';
  if (allergies.length || flags.length) {
    const chips = [
      ...allergies.map(a => `<span class="badge badge-danger">⚠ ${lang==='ar'?'حساسية':'Allergy'}: ${escapeHtml(a.allergen)}${a.severity?` (${escapeHtml(a.severity)})`:''}</span>`),
      ...flags.map(fl => `<span class="badge ${fl.color==='danger'?'badge-danger':'badge-warning'}">${escapeHtml(lang==='ar'?(fl.label_ar||fl.label_en):fl.label_en)}</span>`),
    ].join(' ');
    strip = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">${chips}</div>`;
  }
  const tabs = [
    ['dr-chart', lang==='ar'?'مخطط الأسنان':'Odontogram'],
    ['dr-plans', lang==='ar'?'الخطة العلاجية':'Treatment Plan'],
  ];
  const condTxt = conds.length ? conds.map(c => escapeHtml(c.display || c.condition_code)).join(', ') : (lang==='ar'?'لا يوجد تاريخ مرضي مسجّل':'No medical history recorded');
  return `
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div>
          <h2 style="margin:0">${escapeHtml(lang==='ar'?p.full_name_ar:(p.full_name_en||p.full_name_ar))}</h2>
          <div style="color:#6b7280;font-size:.85rem">${escapeHtml(p.mrn)} · ${age} ${lang==='ar'?'سنة':'yrs'} · ${escapeHtml(p.gender||'')} · ${escapeHtml(p.phone||'')}</div>
          <div style="color:#6b7280;font-size:.8rem;margin-top:2px">${lang==='ar'?'التاريخ الطبي':'Medical Hx'}: ${condTxt}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-primary" onclick="dentalPrescribe(${p.patient_id})">💊 ${lang==='ar'?'وصفة':'Prescribe'}</button>
          <button class="btn btn-sm btn-secondary" onclick="setActivePatient(null);navigateTo('${activeTab}')">${lang==='ar'?'مريض آخر':'Change patient'}</button>
        </div>
      </div>
    </div>
    ${strip}
    <div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:16px">
      ${tabs.map(([v,l]) => `<button onclick="navigateTo('${v}')" style="padding:10px 18px;border:none;background:none;cursor:pointer;font-weight:600;border-bottom:${activeTab===v?'2px solid var(--primary)':'none'};color:${activeTab===v?'var(--primary)':'var(--text-secondary)'}">${l}</button>`).join('')}
    </div>`;
}

// ---- Dentist / Specialist: patient list ----
function renderDrPatients(main, lang) {
  setActivePatient(null);
  renderPatientPicker(main, lang, 'dr-chart');
  const h = main.querySelector('h1'); if (h) h.textContent = t('my_patients');
}

// ---- Odontogram workspace ----
function latestToothStatus(patientId) {
  const rows = dbAll('SELECT tooth_fdi, status, surfaces, note FROM odontogram WHERE patient_id = ? ORDER BY charted_at ASC', [patientId]);
  const map = {};
  rows.forEach(r => { map[r.tooth_fdi] = r; });
  return map;
}
function toothBox(fdi, st, lang) {
  const meta = st ? TOOTH_STATUS[st.status] : null;
  const bg = meta ? meta.c : '#ffffff';
  const fg = (meta && ['#ffffff'].includes(meta.c)) ? '#111' : (meta ? '#fff' : '#111');
  const title = meta ? (lang==='ar'?meta.ar:meta.en) : '';
  return `<div onclick="openToothEditor(${fdi})" title="${escapeHtml(title)}" style="cursor:pointer;width:34px;text-align:center;border:1px solid #d1d5db;border-radius:6px;padding:4px 2px;background:${bg};color:${fg}">
    <div style="font-size:.62rem;font-weight:700">${fdi}</div>
    <div style="font-size:1.1rem;line-height:1">🦷</div>
    ${st && st.surfaces ? `<div style="font-size:.55rem">${escapeHtml(st.surfaces)}</div>` : ''}
  </div>`;
}
function renderOdontogram(main, lang) {
  const p = getPatientOr(main, lang, 'dr-chart'); if (!p) return;
  const map = latestToothStatus(p.patient_id);
  const row = (teeth) => `<div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">${teeth.map(f => toothBox(f, map[f], lang)).join('')}</div>`;
  const legend = Object.entries(TOOTH_STATUS).filter(([k]) => k !== 'sound').map(([k, m]) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;font-size:.72rem;margin-right:8px"><span style="width:12px;height:12px;border-radius:3px;background:${m.c};border:1px solid #ccc;display:inline-block"></span>${lang==='ar'?m.ar:m.en}</span>`).join('');
  const charted = dbAll('SELECT o.*, u.full_name_en, u.full_name_ar FROM odontogram o LEFT JOIN users u ON u.user_id=o.charted_by WHERE o.patient_id=? ORDER BY o.charted_at DESC LIMIT 12', [p.patient_id]);
  main.innerHTML = `
    <div class="page-header"><h1>${t('odontogram_nav')}</h1></div>
    ${dentalPatientHeader(p, lang, 'dr-chart')}
    <div class="card">
      <p style="color:#6b7280;font-size:.82rem;margin-top:0">${lang==='ar'?'انقر على أي سن لتسجيل حالته. الترقيم حسب نظام FDI.':'Click any tooth to chart its status. Numbering is FDI/ISO-3950.'}</p>
      <div style="margin:14px 0">${row(FDI_UPPER)}<div style="height:8px"></div>${row(FDI_LOWER)}</div>
      <div style="border-top:1px solid #eee;padding-top:8px">${legend}</div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">${lang==='ar'?'آخر ما سُجّل':'Recent charting'}</h3>
      ${charted.length ? `<div class="table-container"><table><thead><tr><th>${lang==='ar'?'السن':'Tooth'}</th><th>${lang==='ar'?'الحالة':'Status'}</th><th>${lang==='ar'?'الأسطح':'Surfaces'}</th><th>${lang==='ar'?'ملاحظة':'Note'}</th><th>${lang==='ar'?'بواسطة':'By'}</th></tr></thead><tbody>
        ${charted.map(c => `<tr><td>${c.tooth_fdi}</td><td>${escapeHtml(lang==='ar'?(TOOTH_STATUS[c.status]?.ar||c.status):(TOOTH_STATUS[c.status]?.en||c.status))}</td><td>${escapeHtml(c.surfaces||'—')}</td><td>${escapeHtml(c.note||'—')}</td><td>${escapeHtml(lang==='ar'?(c.full_name_ar||'—'):(c.full_name_en||'—'))}</td></tr>`).join('')}
      </tbody></table></div>` : emptyState(lang==='ar'?'لا يوجد':'Nothing charted yet')}
    </div>`;
}
function openToothEditor(fdi) {
  const lang = currentLanguage();
  const pid = activePatientId(); if (!pid) return;
  const cur = dbGet('SELECT * FROM odontogram WHERE patient_id=? AND tooth_fdi=? ORDER BY charted_at DESC LIMIT 1', [pid, fdi]);
  const opts = Object.entries(TOOTH_STATUS).map(([k, m]) => `<option value="${k}" ${cur && cur.status===k?'selected':''}>${lang==='ar'?m.ar:m.en}</option>`).join('');
  showModal(`
    <h2 style="margin-top:0">${lang==='ar'?'تسجيل السن':'Chart tooth'} <span style="color:var(--primary)">${fdi}</span></h2>
    <div class="form-group"><label>${lang==='ar'?'الحالة':'Status'}</label><select id="te-status">${opts}</select></div>
    <div class="form-group"><label>${lang==='ar'?'الأسطح (مثل MOD)':'Surfaces (e.g. MOD)'}</label><input id="te-surfaces" value="${cur?escapeHtml(cur.surfaces||''):''}" placeholder="M O D B L"></div>
    <div class="form-group"><label>${lang==='ar'?'ملاحظة':'Note'}</label><input id="te-note" value="${cur?escapeHtml(cur.note||''):''}"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-secondary" onclick="closeModal()">${t('cancel')||'Cancel'}</button>
      <button class="btn btn-primary" onclick="saveToothStatus(${fdi})">${lang==='ar'?'حفظ':'Save'}</button>
    </div>`, { maxWidth: 460 });
}
function saveToothStatus(fdi) {
  const pid = activePatientId(); const u = getCurrentUser();
  if (!pid || !u) return;
  const status = document.getElementById('te-status').value;
  const surfaces = document.getElementById('te-surfaces').value.trim() || null;
  const note = document.getElementById('te-note').value.trim() || null;
  try {
    db.run('INSERT INTO odontogram (patient_id, tooth_fdi, surfaces, status, note, charted_by, charted_at) VALUES (?,?,?,?,?,?,?)', [pid, fdi, surfaces, status, note, u.user_id, nowISO()]);
    logAction('TOOTH_CHARTED', `${u.full_name_en} charted tooth ${fdi} as ${status}`, null, pid);
    dlog('chart.tooth', { pid, fdi, status, surfaces });
    saveDBToIndexedDB();
    closeModal();
    navigateTo('dr-chart');
  } catch (e) { derr('chart.tooth', e); showError(e.message); }
}

// ---- Treatment plan ----
function renderTreatmentPlans(main, lang) {
  const p = getPatientOr(main, lang, 'dr-plans'); if (!p) return;
  const plans = dbAll('SELECT * FROM treatment_plans WHERE patient_id = ? ORDER BY created_at DESC', [p.patient_id]);
  const items = dbAll('SELECT * FROM treatment_plan_items WHERE patient_id = ? ORDER BY status, created_at', [p.patient_id]);
  const money = (n) => (lang==='ar'?'':'') + Number(n||0).toLocaleString() + ' ' + (lang==='ar'?'ر.س':'SAR');
  const totalPlanned = items.filter(i => i.status==='planned').reduce((s,i)=>s+(i.price||0),0);
  const totalDone = items.filter(i => i.status==='completed').reduce((s,i)=>s+(i.price||0),0);
  const stBadge = (s) => s==='completed' ? `<span class="badge badge-success">${lang==='ar'?'مكتمل':'Done'}</span>`
    : s==='in_progress' ? `<span class="badge badge-warning">${lang==='ar'?'جارٍ':'In progress'}</span>`
    : s==='cancelled' ? `<span class="badge badge-secondary">${lang==='ar'?'ملغي':'Cancelled'}</span>`
    : `<span class="badge badge-info">${lang==='ar'?'مخطط':'Planned'}</span>`;
  main.innerHTML = `
    <div class="page-header"><h1>${t('treatment_plans_nav')}</h1></div>
    ${dentalPatientHeader(p, lang, 'dr-plans')}
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">${money(totalPlanned)}</div><div class="stat-label">${lang==='ar'?'مخطط':'Planned'}</div></div>
      <div class="stat-card"><div class="stat-value">${money(totalDone)}</div><div class="stat-label">${lang==='ar'?'مكتمل':'Completed'}</div></div>
      <div class="stat-card"><div class="stat-value">${plans.length}</div><div class="stat-label">${lang==='ar'?'خطط':'Plans'}</div></div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">${lang==='ar'?'بنود العلاج':'Procedures'}</h3>
        <button class="btn btn-sm btn-primary" onclick="openAddPlanItem(${p.patient_id})">+ ${lang==='ar'?'إضافة إجراء':'Add procedure'}</button></div>
      ${items.length ? `<div class="table-container"><table><thead><tr><th>${lang==='ar'?'الإجراء':'Procedure'}</th><th>${lang==='ar'?'السن':'Tooth'}</th><th>${lang==='ar'?'السعر':'Price'}</th><th>${lang==='ar'?'الحالة':'Status'}</th><th></th></tr></thead><tbody>
        ${items.map(i => `<tr>
          <td>${escapeHtml(lang==='ar'?(i.procedure_name_ar||i.procedure_name_en):i.procedure_name_en)}${i.procedure_code?` <span style="color:#9ca3af;font-size:.75rem">${escapeHtml(i.procedure_code)}</span>`:''}</td>
          <td>${i.tooth_fdi||'—'}</td><td>${money(i.price)}</td><td>${stBadge(i.status)}</td>
          <td>${i.status!=='completed' && i.status!=='cancelled' ? `<button class="btn btn-sm btn-success" onclick="completePlanItem(${i.item_id})">${lang==='ar'?'تم':'Complete'}</button>`:''}</td>
        </tr>`).join('')}
      </tbody></table></div>` : emptyState(lang==='ar'?'لا توجد بنود':'No procedures yet')}
    </div>`;
}
function openAddPlanItem(patientId) {
  const lang = currentLanguage();
  const procs = dbAll('SELECT * FROM procedures WHERE active=1 ORDER BY category, name_en');
  const opts = procs.map(pr => `<option value="${escapeHtml(pr.code)}" data-price="${pr.default_price}" data-en="${escapeHtml(pr.name_en)}" data-ar="${escapeHtml(pr.name_ar)}" data-ts="${pr.tooth_specific}">${escapeHtml(pr.code)} — ${escapeHtml(lang==='ar'?pr.name_ar:pr.name_en)} (${pr.default_price})</option>`).join('');
  showModal(`
    <h2 style="margin-top:0">${lang==='ar'?'إضافة إجراء للخطة':'Add procedure to plan'}</h2>
    <div class="form-group"><label>${lang==='ar'?'الإجراء':'Procedure'}</label><select id="pi-proc" onchange="planItemProcChanged()">${opts}</select></div>
    <div class="form-row">
      <div class="form-group"><label>${lang==='ar'?'رقم السن (FDI)':'Tooth (FDI)'}</label><input id="pi-tooth" placeholder="e.g. 36"></div>
      <div class="form-group"><label>${lang==='ar'?'السعر':'Price'}</label><input id="pi-price" type="number"></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-secondary" onclick="closeModal()">${t('cancel')||'Cancel'}</button>
      <button class="btn btn-primary" onclick="saveAddPlanItem(${patientId})">${lang==='ar'?'إضافة':'Add'}</button>
    </div>`, { maxWidth: 520 });
  planItemProcChanged();
}
function planItemProcChanged() {
  const sel = document.getElementById('pi-proc'); if (!sel) return;
  const o = sel.selectedOptions[0]; if (!o) return;
  document.getElementById('pi-price').value = o.dataset.price;
  const tooth = document.getElementById('pi-tooth');
  tooth.disabled = o.dataset.ts === '0';
  if (o.dataset.ts === '0') tooth.value = '';
}
function saveAddPlanItem(patientId) {
  const lang = currentLanguage(); const u = getCurrentUser();
  const sel = document.getElementById('pi-proc'); const o = sel.selectedOptions[0];
  const tooth = document.getElementById('pi-tooth').value.trim();
  const price = parseFloat(document.getElementById('pi-price').value) || 0;
  let plan = dbGet("SELECT plan_id FROM treatment_plans WHERE patient_id=? AND status IN ('proposed','accepted','in_progress') ORDER BY created_at DESC LIMIT 1", [patientId]);
  let planId;
  if (plan) planId = plan.plan_id;
  else {
    db.run('INSERT INTO treatment_plans (patient_id, title_en, title_ar, status, dentist_id, created_at) VALUES (?,?,?,?,?,?)', [patientId, 'Treatment plan', 'خطة علاجية', 'in_progress', u.user_id, nowISO()]);
    planId = dbLastId();
  }
  db.run(`INSERT INTO treatment_plan_items (plan_id, patient_id, procedure_code, procedure_name_en, procedure_name_ar, tooth_fdi, price, status, dentist_id, created_at)
    VALUES (?,?,?,?,?,?,?, 'planned', ?, ?)`, [planId, patientId, o.value, o.dataset.en, o.dataset.ar, tooth ? parseInt(tooth, 10) : null, price, u.user_id, nowISO()]);
  logAction('PLAN_ITEM_ADDED', `${u.full_name_en} added ${o.dataset.en}${tooth?` on tooth ${tooth}`:''} to treatment plan`, null, patientId);
  dlog('plan.addItem', { patientId, code: o.value, tooth, price });
  saveDBToIndexedDB(); closeModal(); navigateTo('dr-plans');
}
function completePlanItem(itemId) {
  const u = getCurrentUser();
  db.run("UPDATE treatment_plan_items SET status='completed', completed_at=? WHERE item_id=?", [nowISO(), itemId]);
  const it = dbGet('SELECT * FROM treatment_plan_items WHERE item_id=?', [itemId]);
  logAction('PROCEDURE_DONE', `${u.full_name_en} completed ${it ? it.procedure_name_en : 'procedure'}`, null, it ? it.patient_id : null);
  dlog('plan.completeItem', { itemId, procedure: it ? it.procedure_name_en : null });
  saveDBToIndexedDB(); navigateTo('dr-plans');
}

// ---- Dentist appointments ----
function renderDrAppointments(main, lang) {
  const u = getCurrentUser();
  const today = new Date().toISOString().slice(0, 10);
  const appts = dbAll(`SELECT a.*, o.name_en op_en, o.name_ar op_ar FROM appointments a LEFT JOIN operatories o ON o.operatory_id=a.operatory_id
    WHERE a.doctor_id = ? AND a.appt_date >= ? ORDER BY a.appt_date, a.appt_time`, [u.user_id, today]);
  main.innerHTML = `
    <div class="page-header"><h1>${t('doc_appointments')}</h1></div>
    <div class="card">${appts.length ? `<div class="table-container"><table><thead><tr>
      <th>${lang==='ar'?'التاريخ':'Date'}</th><th>${lang==='ar'?'الوقت':'Time'}</th><th>${lang==='ar'?'المريض':'Patient'}</th><th>${lang==='ar'?'الإجراء':'Procedure'}</th><th>${lang==='ar'?'الكرسي':'Chair'}</th><th>${lang==='ar'?'الحالة':'Status'}</th></tr></thead><tbody>
      ${appts.map(a => `<tr ${a.appt_date===today?'style="background:#eff6ff"':''}>
        <td>${a.appt_date}</td><td>${a.appt_time}</td>
        <td>${escapeHtml(lang==='ar'?a.patient_name_ar:a.patient_name_en)}</td>
        <td>${escapeHtml(a.reason||'—')}</td>
        <td>${escapeHtml(lang==='ar'?(a.op_ar||'—'):(a.op_en||'—'))}</td>
        <td><span class="badge badge-info">${escapeHtml(a.status)}</span></td></tr>`).join('')}
    </tbody></table></div>` : emptyState(lang==='ar'?'لا مواعيد':'No upcoming appointments')}</div>`;
}

// ---- Patient-centric prescribe (reuses checkDrugAllergy + drug_interactions) ----
function dentalPrescribe(patientId) {
  const lang = currentLanguage();
  if (!['dentist','specialist'].includes((getCurrentUser()||{}).role)) { showError(lang==='ar'?'الوصف للأطباء فقط':'Only dentists may prescribe'); return; }
  const drugs = dbAll("SELECT * FROM drugs WHERE category IN ('antibiotic','analgesic','antiseptic','antifungal','anxiolytic','corticosteroid','local_anesthetic') ORDER BY category, name_generic");
  const opts = drugs.map(d => `<option value="${d.drug_id}" data-name="${escapeHtml(d.name_generic)}">${escapeHtml(d.name_generic)}${d.name_brand?` (${escapeHtml(d.name_brand)})`:''}</option>`).join('');
  showModal(`
    <h2 style="margin-top:0">💊 ${lang==='ar'?'وصفة طبية':'Prescribe'}</h2>
    <div class="form-group"><label>${t('drug_name')}</label><select id="dp-drug"><option value="">—</option>${opts}</select></div>
    <div class="form-row">
      <div class="form-group"><label>${t('dose')||'Dose'}</label><input id="dp-dose" placeholder="500 mg"></div>
      <div class="form-group"><label>${lang==='ar'?'التكرار':'Frequency'}</label><input id="dp-freq" placeholder="TID"></div>
      <div class="form-group"><label>${lang==='ar'?'المدة':'Duration'}</label><input id="dp-dur" placeholder="5 days"></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-secondary" onclick="closeModal()">${t('cancel')||'Cancel'}</button>
      <button class="btn btn-primary" onclick="doDentalPrescribe(${patientId})">${t('prescribe_btn')||'Prescribe'}</button>
    </div>`, { maxWidth: 560 });
}
async function doDentalPrescribe(patientId) {
  const lang = currentLanguage(); const u = getCurrentUser();
  const sel = document.getElementById('dp-drug'); const o = sel.selectedOptions[0];
  if (!o || !o.value) { showError(lang==='ar'?'اختر دواء':'Pick a drug'); return; }
  const drugId = o.value, drugName = o.dataset.name;
  const dose = document.getElementById('dp-dose').value.trim() || '—';
  const freq = document.getElementById('dp-freq').value.trim() || '—';
  const dur = document.getElementById('dp-dur').value.trim() || null;
  const p = dbGet('SELECT * FROM patients WHERE patient_id=?', [patientId]);
  const allergies = dbAll('SELECT * FROM patient_allergies WHERE patient_id = ?', [patientId]);
  const match = (typeof checkDrugAllergy === 'function') ? checkDrugAllergy(drugName, allergies) : null;
  const commit = async () => {
    db.run(`INSERT INTO prescriptions (patient_id, admission_id, doctor_id, drug_id, drug_name, dose, route, frequency, duration, start_date, status, prescribed_at)
      VALUES (?, NULL, ?, ?, ?, ?, 'PO', ?, ?, ?, 'active', ?)`, [patientId, u.user_id, drugId, drugName, dose, freq, dur, new Date().toISOString().slice(0,10), nowISO()]);
    logAction('RX_PRESCRIBED', `${u.full_name_en} prescribed ${drugName} ${dose} ${freq} to ${p.full_name_en||p.full_name_ar}`, null, patientId, p.full_name_en, p.mrn);
    dlog('rx.prescribe', { patientId, drugName, dose, freq, allergyHit: !!match });
    saveDBToIndexedDB(); closeModal(); showSuccess(lang==='ar'?'تمت الوصفة':'Prescribed'); navigateTo(currentView);
  };
  if (match) {
    const sev = (match.severity||'').toLowerCase();
    const hard = ['severe','life_threatening','anaphylaxis'].includes(sev) || match._cross;
    dlog('rx.allergyBlock', { patientId, drugName, allergen: match.allergen, severity: match.severity, hard });
    const msg = lang==='ar'
      ? `تنبيه حساسية! المريض لديه حساسية من ${match.allergen} (${match.severity||'—'}). ${match._cross?'وهذا الدواء قد يتفاعل تصالبياً.':''}`
      : `ALLERGY ALERT! Patient is allergic to ${match.allergen} (${match.severity||'—'}). ${match._cross?'This drug may cross-react.':''}`;
    if (hard && typeof showRedAlert === 'function') {
      showRedAlert(msg, async (reason) => { await logAction('ALLERGY_OVERRIDE', `${u.full_name_en} overrode allergy (${match.allergen} → ${drugName}). Reason: ${reason}`, null, patientId, p.full_name_en, p.mrn); await commit(); });
      return;
    } else if (typeof showYellowAlert === 'function') {
      showYellowAlert(msg, async () => { await logAction('ALLERGY_WARN', `${u.full_name_en} acknowledged allergy warning (${match.allergen} → ${drugName})`, null, patientId, p.full_name_en, p.mrn); await commit(); });
      return;
    }
  }
  await commit();
}

// ---- Hygienist / Assistant ----
function renderAsstPatients(main, lang) { setActivePatient(null); renderPatientPicker(main, lang, 'asst-intake'); const h = main.querySelector('h1'); if (h) h.textContent = t('my_patients'); }

function renderAsstIntake(main, lang) {
  const p = getPatientOr(main, lang, 'asst-intake'); if (!p) return;
  const allergies = dbAll('SELECT * FROM patient_allergies WHERE patient_id=?', [p.patient_id]);
  const conds = dbAll("SELECT * FROM patient_conditions WHERE patient_id=? ORDER BY added_at DESC", [p.patient_id]);
  main.innerHTML = `
    <div class="page-header"><h1>${t('intake_nav')}</h1></div>
    ${dentalPatientHeader(p, lang, 'dr-chart')}
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">${lang==='ar'?'الحساسية':'Allergies'}</h3>
        <button class="btn btn-sm btn-primary" onclick="openAddAllergy(${p.patient_id})">+ ${lang==='ar'?'إضافة':'Add'}</button></div>
      ${allergies.length ? `<ul>${allergies.map(a => `<li>${escapeHtml(a.allergen)} — ${escapeHtml(a.reaction||'')} <span class="badge badge-danger">${escapeHtml(a.severity||'')}</span></li>`).join('')}</ul>` : `<p style="color:#6b7280">${lang==='ar'?'لا توجد حساسية مسجلة':'No known allergies'}</p>`}
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">${lang==='ar'?'التاريخ الطبي':'Medical history'}</h3>
        <button class="btn btn-sm btn-primary" onclick="openAddCondition(${p.patient_id})">+ ${lang==='ar'?'إضافة':'Add'}</button></div>
      ${conds.length ? `<ul>${conds.map(c => `<li>${escapeHtml(c.display||c.condition_code)} ${c.status==='resolved'?`<span class="badge badge-secondary">${lang==='ar'?'محلول':'resolved'}</span>`:''}</li>`).join('')}</ul>` : `<p style="color:#6b7280">${lang==='ar'?'لا يوجد':'None recorded'}</p>`}
    </div>`;
}
function openAddAllergy(patientId) {
  const lang = currentLanguage();
  showModal(`<h2 style="margin-top:0">${lang==='ar'?'إضافة حساسية':'Add allergy'}</h2>
    <div class="form-group"><label>${lang==='ar'?'المادة':'Allergen'}</label><input id="al-name" placeholder="${lang==='ar'?'مثل: بنسلين':'e.g. Penicillin'}"></div>
    <div class="form-row"><div class="form-group"><label>${lang==='ar'?'التفاعل':'Reaction'}</label><input id="al-react"></div>
    <div class="form-group"><label>${lang==='ar'?'الشدة':'Severity'}</label><select id="al-sev"><option value="mild">${lang==='ar'?'خفيف':'mild'}</option><option value="moderate">${lang==='ar'?'متوسط':'moderate'}</option><option value="severe">${lang==='ar'?'شديد':'severe'}</option></select></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn btn-secondary" onclick="closeModal()">${t('cancel')||'Cancel'}</button><button class="btn btn-primary" onclick="saveAllergy(${patientId})">${lang==='ar'?'حفظ':'Save'}</button></div>`, { maxWidth: 480 });
}
function saveAllergy(patientId) {
  const lang = currentLanguage(); const u = getCurrentUser();
  const name = document.getElementById('al-name').value.trim();
  if (!name) { showError(lang==='ar'?'المادة مطلوبة':'Allergen required'); return; }
  db.run('INSERT INTO patient_allergies (patient_id, allergen, reaction, severity, added_by, added_at) VALUES (?,?,?,?,?,?)', [patientId, name, document.getElementById('al-react').value.trim(), document.getElementById('al-sev').value, u.user_id, nowISO()]);
  logAction('ALLERGY_ADDED', `${u.full_name_en} recorded allergy: ${name}`, null, patientId);
  dlog('intake.allergy', { patientId, allergen: name, severity: document.getElementById('al-sev').value });
  saveDBToIndexedDB(); closeModal(); navigateTo('asst-intake');
}
function openAddCondition(patientId) {
  const lang = currentLanguage();
  showModal(`<h2 style="margin-top:0">${lang==='ar'?'إضافة حالة طبية':'Add medical condition'}</h2>
    <div class="form-group"><label>${lang==='ar'?'الوصف':'Description'}</label><input id="co-disp" placeholder="${lang==='ar'?'مثل: سكري':'e.g. Diabetes'}"></div>
    <div class="form-group"><label>${lang==='ar'?'الرمز (ICD-10، اختياري)':'Code (ICD-10, optional)'}</label><input id="co-code"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn btn-secondary" onclick="closeModal()">${t('cancel')||'Cancel'}</button><button class="btn btn-primary" onclick="saveCondition(${patientId})">${lang==='ar'?'حفظ':'Save'}</button></div>`, { maxWidth: 480 });
}
function saveCondition(patientId) {
  const lang = currentLanguage(); const u = getCurrentUser();
  const disp = document.getElementById('co-disp').value.trim();
  if (!disp) { showError(lang==='ar'?'الوصف مطلوب':'Description required'); return; }
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, category, display, status, added_by, added_at) VALUES (?,?,?,?, 'active', ?, ?)", [patientId, document.getElementById('co-code').value.trim() || disp, 'chronic', disp, u.user_id, nowISO()]);
  logAction('CONDITION_ADDED', `${u.full_name_en} recorded condition: ${disp}`, null, patientId);
  saveDBToIndexedDB(); closeModal(); navigateTo('asst-intake');
}
function renderAsstPerio(main, lang) {
  const p = getPatientOr(main, lang, 'asst-perio'); if (!p) return;
  const rows = dbAll('SELECT * FROM perio_chart WHERE patient_id=? ORDER BY tooth_fdi', [p.patient_id]);
  main.innerHTML = `
    <div class="page-header"><h1>${t('perio_nav')}</h1></div>
    ${dentalPatientHeader(p, lang, 'asst-intake')}
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">${lang==='ar'?'قياسات اللثة':'Pocket depths'}</h3>
        <button class="btn btn-sm btn-primary" onclick="openAddPerio(${p.patient_id})">+ ${lang==='ar'?'إضافة سن':'Add tooth'}</button></div>
      ${rows.length ? `<div class="table-container"><table><thead><tr><th>${lang==='ar'?'السن':'Tooth'}</th><th>${lang==='ar'?'الجيوب (6 مواضع)':'Pockets (6 sites)'}</th><th>${lang==='ar'?'نزيف':'BoP'}</th><th>${lang==='ar'?'الحركة':'Mobility'}</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${r.tooth_fdi}</td><td>${escapeHtml(r.pockets||'—')}</td><td>${escapeHtml(r.bleeding||'—')}</td><td>${r.mobility ?? '—'}</td></tr>`).join('')}
      </tbody></table></div>` : emptyState(lang==='ar'?'لا قياسات':'No measurements yet')}
    </div>`;
}
function openAddPerio(patientId) {
  const lang = currentLanguage();
  showModal(`<h2 style="margin-top:0">${lang==='ar'?'قياس لثة':'Perio measurement'}</h2>
    <div class="form-row"><div class="form-group"><label>${lang==='ar'?'السن (FDI)':'Tooth (FDI)'}</label><input id="pe-tooth" placeholder="36"></div>
    <div class="form-group"><label>${lang==='ar'?'الحركة (0-3)':'Mobility (0-3)'}</label><input id="pe-mob" type="number" min="0" max="3"></div></div>
    <div class="form-group"><label>${lang==='ar'?'الجيوب (6 أرقام مفصولة بفاصلة)':'Pockets (6 comma-separated)'}</label><input id="pe-pockets" placeholder="3,2,3,4,3,2"></div>
    <div class="form-group"><label>${lang==='ar'?'النزيف (6 قيم 0/1)':'Bleeding (6 of 0/1)'}</label><input id="pe-bleed" placeholder="0,0,1,1,0,0"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn btn-secondary" onclick="closeModal()">${t('cancel')||'Cancel'}</button><button class="btn btn-primary" onclick="savePerio(${patientId})">${lang==='ar'?'حفظ':'Save'}</button></div>`, { maxWidth: 520 });
}
function savePerio(patientId) {
  const u = getCurrentUser();
  const tooth = parseInt(document.getElementById('pe-tooth').value, 10);
  if (!tooth) { showError('Tooth required'); return; }
  db.run('INSERT INTO perio_chart (patient_id, tooth_fdi, pockets, bleeding, mobility, charted_by, charted_at) VALUES (?,?,?,?,?,?,?)',
    [patientId, tooth, document.getElementById('pe-pockets').value.trim(), document.getElementById('pe-bleed').value.trim(), parseInt(document.getElementById('pe-mob').value, 10) || 0, u.user_id, nowISO()]);
  logAction('PERIO_CHARTED', `${u.full_name_en} charted perio on tooth ${tooth}`, null, patientId);
  saveDBToIndexedDB(); closeModal(); navigateTo('asst-perio');
}

// ---- Clinic manager dashboard ----
function renderMgrOverview(main, lang) {
  const today = new Date().toISOString().slice(0, 10);
  const money = (n) => Number(n||0).toLocaleString() + ' ' + (lang==='ar'?'ر.س':'SAR');
  const patients = dbGet('SELECT COUNT(*) c FROM patients').c;
  const apptToday = dbGet('SELECT COUNT(*) c FROM appointments WHERE appt_date = ?', [today]).c;
  const recallsDue = dbGet("SELECT COUNT(*) c FROM recalls WHERE status='due' AND due_date <= ?", [today]).c;
  const collected = dbGet('SELECT COALESCE(SUM(paid_amount),0) s FROM invoices').s;
  const outstanding = dbGet("SELECT COALESCE(SUM(total - paid_amount),0) s FROM invoices WHERE status != 'paid'").s;
  const sched = dbAll(`SELECT a.*, u.full_name_en doc_en, u.full_name_ar doc_ar, o.name_en op_en, o.name_ar op_ar
    FROM appointments a LEFT JOIN users u ON u.user_id=a.doctor_id LEFT JOIN operatories o ON o.operatory_id=a.operatory_id
    WHERE a.appt_date=? ORDER BY a.appt_time`, [today]);
  const recalls = dbAll("SELECT r.*, p.full_name_en, p.full_name_ar, p.phone FROM recalls r JOIN patients p ON p.patient_id=r.patient_id WHERE r.status='due' AND r.due_date <= ? ORDER BY r.due_date LIMIT 10", [today]);
  // production by procedure category (completed plan items)
  const byCat = dbAll("SELECT pr.category, COALESCE(SUM(ti.price),0) total, COUNT(*) n FROM treatment_plan_items ti LEFT JOIN procedures pr ON pr.code=ti.procedure_code WHERE ti.status='completed' GROUP BY pr.category ORDER BY total DESC");
  // patients per branch
  const byBranch = dbAll('SELECT branch, COUNT(*) n FROM patients GROUP BY branch ORDER BY n DESC');
  main.innerHTML = `
    <div class="page-header"><h1>${lang==='ar'?'لوحة العيادة':'Clinic Dashboard'}</h1></div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">${patients}</div><div class="stat-label">${lang==='ar'?'المرضى':'Patients'}</div></div>
      <div class="stat-card"><div class="stat-value">${apptToday}</div><div class="stat-label">${lang==='ar'?'مواعيد اليوم':'Today’s appts'}</div></div>
      <div class="stat-card"><div class="stat-value">${recallsDue}</div><div class="stat-label">${lang==='ar'?'استدعاءات مستحقة':'Recalls due'}</div></div>
      <div class="stat-card"><div class="stat-value">${money(collected)}</div><div class="stat-label">${lang==='ar'?'المحصّل':'Collected'}</div></div>
      <div class="stat-card"><div class="stat-value">${money(outstanding)}</div><div class="stat-label">${lang==='ar'?'مستحقات':'Outstanding'}</div></div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">${lang==='ar'?'جدول اليوم':'Today’s schedule'}</h3>
      ${sched.length ? `<div class="table-container"><table><thead><tr><th>${lang==='ar'?'الوقت':'Time'}</th><th>${lang==='ar'?'المريض':'Patient'}</th><th>${lang==='ar'?'الطبيب':'Dentist'}</th><th>${lang==='ar'?'الإجراء':'Procedure'}</th><th>${lang==='ar'?'الكرسي':'Chair'}</th><th>${lang==='ar'?'الحالة':'Status'}</th></tr></thead><tbody>
        ${sched.map(a => `<tr><td>${a.appt_time}</td><td>${escapeHtml(lang==='ar'?a.patient_name_ar:a.patient_name_en)}</td><td>${escapeHtml(lang==='ar'?(a.doc_ar||'—'):(a.doc_en||'—'))}</td><td>${escapeHtml(a.reason||'—')}</td><td>${escapeHtml(lang==='ar'?(a.op_ar||'—'):(a.op_en||'—'))}</td><td><span class="badge badge-info">${escapeHtml(a.status)}</span></td></tr>`).join('')}
      </tbody></table></div>` : emptyState(lang==='ar'?'لا مواعيد اليوم':'No appointments today')}
    </div>
    <div class="form-row" style="display:flex;gap:16px;flex-wrap:wrap">
      <div class="card" style="flex:1;min-width:280px">
        <h3 style="margin-top:0">${lang==='ar'?'الإنتاج حسب التخصص':'Production by category'}</h3>
        ${byCat.length ? byCat.map(c => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f3f4f6"><span>${escapeHtml(c.category||'—')} <span style="color:#9ca3af">(${c.n})</span></span><strong>${money(c.total)}</strong></div>`).join('') : `<p style="color:#6b7280">${lang==='ar'?'لا يوجد':'No completed procedures'}</p>`}
      </div>
      <div class="card" style="flex:1;min-width:280px">
        <h3 style="margin-top:0">${lang==='ar'?'استدعاءات مستحقة':'Recalls due'}</h3>
        ${recalls.length ? recalls.map(r => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f3f4f6"><span>${escapeHtml(lang==='ar'?r.full_name_ar:(r.full_name_en||r.full_name_ar))} <span style="color:#9ca3af;font-size:.8rem">${escapeHtml(r.type)}</span></span><span style="color:#ef4444">${r.due_date}</span></div>`).join('') : `<p style="color:#6b7280">${lang==='ar'?'لا يوجد':'None due'}</p>`}
      </div>
      <div class="card" style="flex:1;min-width:240px">
        <h3 style="margin-top:0">${lang==='ar'?'المرضى حسب الفرع':'Patients by branch'}</h3>
        ${byBranch.length ? byBranch.map(b => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f3f4f6"><span>${escapeHtml(typeof branchLabel==='function'?branchLabel(b.branch,lang):(b.branch||'—'))}</span><strong>${b.n}</strong></div>`).join('') : `<p style="color:#6b7280">—</p>`}
      </div>
    </div>`;
}
