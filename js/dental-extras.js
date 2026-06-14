// ============================================================
// OpenSmile — practice-management extras
// Back-office + chairside features layered on top of the core dental views:
//   • Manager Reports  — day-sheet close, A/R aging, per-dentist production,
//                        specialist referral due-backs
//   • Inventory        — chairside supply stock with low-stock flagging
//   • Waitlist         — patients wanting an earlier slot if a chair frees up
//   • Lab cases        — crown/denture/aligner round-trip tracking
//   • LA max-dose calc — local-anaesthetic safety helper (mg/kg → carpules)
//   • Plan present mode + signature pad + treatment acceptance
//   • Book-recall-at-checkout, installment plans, family ledger
// Reuses the same helpers as dental-views.js (escapeHtml, showModal, dbAll/
// dbRun, logAction, dlog, branchLabel, normalizeEgPhone). Money is SAR to match
// the procedure catalog. Clinical content is AI-drafted demo — a licensed
// dentist must review dosing/prices before real use.
// ============================================================

function _money(n, lang) { return Number(n || 0).toLocaleString() + ' ' + ((lang || currentLanguage()) === 'ar' ? 'ر.س' : 'SAR'); }
function _today() { return new Date().toISOString().slice(0, 10); }
function _addDays(iso, n) { return new Date(new Date(iso).getTime() + n * 86400000).toISOString().slice(0, 10); }
function _addMonths(iso, m) { const d = new Date(iso); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); }

// ============================================================
// MANAGER REPORTS — day-sheet, A/R aging, per-dentist production, referrals
// ============================================================
function renderMgrReports(main, lang) {
  const ar = lang === 'ar';
  const today = _today();

  // ---- Day-sheet: today's collections by method + today's appointment tally ----
  const todaysInv = dbAll("SELECT * FROM invoices WHERE visit_date = ?", [today]);
  const collectedToday = todaysInv.reduce((s, i) => s + (i.paid_amount || 0), 0);
  const billedToday = todaysInv.reduce((s, i) => s + (i.total || 0), 0);
  const byMethod = {};
  todaysInv.forEach(i => { const m = i.payment_type || 'cash'; byMethod[m] = (byMethod[m] || 0) + (i.paid_amount || 0); });
  const apptStats = dbAll("SELECT status, COUNT(*) n FROM appointments WHERE appt_date = ? GROUP BY status", [today]);
  const methodLabel = (m) => ({ cash: ar ? 'نقدي' : 'Cash', card: ar ? 'بطاقة' : 'Card', mobile_wallet: ar ? 'محفظة' : 'Wallet', instapay: 'InstaPay', insurance: ar ? 'تأمين' : 'Insurance' })[m] || m;

  // ---- A/R aging: unpaid balances bucketed by invoice age ----
  const open = dbAll("SELECT *, (total - paid_amount) bal FROM invoices WHERE status != 'paid' AND (total - paid_amount) > 0");
  const buckets = { d0: 0, d30: 0, d60: 0, d90: 0 };
  open.forEach(i => {
    const age = Math.floor((Date.now() - new Date(i.visit_date).getTime()) / 86400000);
    if (age <= 30) buckets.d0 += i.bal; else if (age <= 60) buckets.d30 += i.bal; else if (age <= 90) buckets.d60 += i.bal; else buckets.d90 += i.bal;
  });
  const owes = open.slice().sort((a, b) => b.bal - a.bal).slice(0, 12);

  // ---- Per-dentist production (completed plan items credited to the dentist) ----
  const byDentist = dbAll(`SELECT u.full_name_en, u.full_name_ar, COUNT(*) n, COALESCE(SUM(ti.price),0) total
    FROM treatment_plan_items ti JOIN users u ON u.user_id = ti.dentist_id
    WHERE ti.status = 'completed' GROUP BY ti.dentist_id ORDER BY total DESC`);

  // ---- Specialist referrals due back in our chair ----
  const refs = dbAll(`SELECT r.*, p.full_name_en, p.full_name_ar, p.phone, u.full_name_en ref_en
    FROM referrals r JOIN patients p ON p.patient_id = r.patient_id LEFT JOIN users u ON u.user_id = r.from_user
    WHERE r.due_back_date IS NOT NULL AND r.status != 'closed' ORDER BY r.due_back_date`);

  main.innerHTML = `
    <div class="page-header"><h1>📈 ${ar ? 'التقارير' : 'Reports'}</h1>
      <button class="btn btn-sm btn-secondary" onclick="window.print()">🖨 ${ar ? 'طباعة' : 'Print'}</button></div>

    <div class="card">
      <h3 style="margin-top:0">🧾 ${ar ? 'إغلاق اليومية' : 'Day-sheet'} — ${today}</h3>
      <div class="stat-cards">
        <div class="stat-card"><div class="stat-value">${_money(collectedToday, lang)}</div><div class="stat-label">${ar ? 'محصّل اليوم' : 'Collected today'}</div></div>
        <div class="stat-card"><div class="stat-value">${_money(billedToday, lang)}</div><div class="stat-label">${ar ? 'مفوتر اليوم' : 'Billed today'}</div></div>
        <div class="stat-card"><div class="stat-value">${todaysInv.length}</div><div class="stat-label">${ar ? 'فواتير اليوم' : 'Invoices today'}</div></div>
      </div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:10px">
        <div style="flex:1;min-width:220px">
          <strong style="font-size:.85rem">${ar ? 'حسب طريقة الدفع' : 'By payment method'}</strong>
          ${Object.keys(byMethod).length ? Object.entries(byMethod).map(([m, v]) => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f3f4f6"><span>${escapeHtml(methodLabel(m))}</span><strong>${_money(v, lang)}</strong></div>`).join('') : `<p class="muted">${ar ? 'لا تحصيل اليوم' : 'Nothing collected today'}</p>`}
        </div>
        <div style="flex:1;min-width:220px">
          <strong style="font-size:.85rem">${ar ? 'مواعيد اليوم' : "Today's appointments"}</strong>
          ${apptStats.length ? apptStats.map(a => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f3f4f6"><span>${escapeHtml(a.status)}</span><strong>${a.n}</strong></div>`).join('') : `<p class="muted">${ar ? 'لا مواعيد' : 'No appointments'}</p>`}
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top:0">💰 ${ar ? 'تقادم الذمم (المستحقات)' : 'Accounts-receivable aging'}</h3>
      <div class="stat-cards">
        <div class="stat-card"><div class="stat-value">${_money(buckets.d0, lang)}</div><div class="stat-label">0–30 ${ar ? 'يوم' : 'days'}</div></div>
        <div class="stat-card"><div class="stat-value">${_money(buckets.d30, lang)}</div><div class="stat-label">31–60</div></div>
        <div class="stat-card"><div class="stat-value">${_money(buckets.d60, lang)}</div><div class="stat-label">61–90</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#ef4444">${_money(buckets.d90, lang)}</div><div class="stat-label">90+ ${ar ? 'يوم' : 'days'}</div></div>
      </div>
      ${owes.length ? `<div class="table-container" style="margin-top:8px"><table><thead><tr><th>${ar ? 'المريض' : 'Patient'}</th><th>${ar ? 'الفاتورة' : 'Invoice'}</th><th>${ar ? 'التاريخ' : 'Date'}</th><th>${ar ? 'المتبقي' : 'Balance'}</th></tr></thead><tbody>
        ${owes.map(i => `<tr><td>${escapeHtml(ar ? i.patient_name_ar : i.patient_name_en)}</td><td>#${i.invoice_id}</td><td>${i.visit_date}</td><td><strong>${_money(i.bal, lang)}</strong></td></tr>`).join('')}
      </tbody></table></div>` : `<p class="muted">${ar ? 'لا مستحقات مفتوحة' : 'No open balances'}</p>`}
    </div>

    <div class="card">
      <h3 style="margin-top:0">🦷 ${ar ? 'الإنتاج حسب الطبيب' : 'Production by dentist'}</h3>
      ${byDentist.length ? byDentist.map(d => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f3f4f6"><span>${escapeHtml(ar ? (d.full_name_ar || d.full_name_en) : d.full_name_en)} <span style="color:#9ca3af">(${d.n})</span></span><strong>${_money(d.total, lang)}</strong></div>`).join('') : `<p class="muted">${ar ? 'لا إجراءات مكتملة' : 'No completed procedures'}</p>`}
    </div>

    <div class="card">
      <h3 style="margin-top:0">↩️ ${ar ? 'إحالات الأخصائيين (العودة)' : 'Specialist referrals — due back'}</h3>
      ${refs.length ? `<div class="table-container"><table><thead><tr><th>${ar ? 'المريض' : 'Patient'}</th><th>${ar ? 'السبب' : 'Reason'}</th><th>${ar ? 'العودة' : 'Due back'}</th><th>${ar ? 'الحالة' : 'Status'}</th></tr></thead><tbody>
        ${refs.map(r => `<tr ${r.due_back_date <= today ? 'style="background:#fef2f2"' : ''}><td>${escapeHtml(ar ? r.full_name_ar : r.full_name_en)}</td><td>${escapeHtml(r.reason || '—')}</td><td>${r.due_back_date}${r.due_back_date <= today ? ` <span class="badge badge-danger">${ar ? 'مستحق' : 'due'}</span>` : ''}</td><td><span class="badge badge-info">${escapeHtml(r.status)}</span></td></tr>`).join('')}
      </tbody></table></div>` : `<p class="muted">${ar ? 'لا إحالات قيد المتابعة' : 'No referrals being tracked'}</p>`}
    </div>`;
}

// ============================================================
// INVENTORY — chairside supply stock
// ============================================================
function renderInventory(main, lang) {
  const ar = lang === 'ar';
  const rows = dbAll('SELECT * FROM inventory ORDER BY (qty <= reorder_level) DESC, category, name_en');
  const low = rows.filter(r => r.qty <= r.reorder_level).length;
  main.innerHTML = `
    <div class="page-header"><h1>📦 ${ar ? 'المخزون' : 'Inventory'}</h1>
      <button class="btn btn-sm btn-primary" onclick="openInvItem()">+ ${ar ? 'صنف' : 'Item'}</button></div>
    ${low ? `<div class="card" style="border-inline-start:4px solid #f59e0b"><strong>⚠ ${low}</strong> ${ar ? 'صنف عند/تحت حد إعادة الطلب' : 'item(s) at or below reorder level'}</div>` : ''}
    <div class="card">
      ${rows.length ? `<div class="table-container"><table><thead><tr><th>${ar ? 'الصنف' : 'Item'}</th><th>${ar ? 'الفئة' : 'Category'}</th><th>${ar ? 'الفرع' : 'Branch'}</th><th>${ar ? 'الكمية' : 'Qty'}</th><th>${ar ? 'حد الطلب' : 'Reorder'}</th><th></th></tr></thead><tbody>
        ${rows.map(r => { const lowRow = r.qty <= r.reorder_level; return `<tr ${lowRow ? 'style="background:#fffbeb"' : ''}>
          <td>${escapeHtml(ar ? (r.name_ar || r.name_en) : r.name_en)}${lowRow ? ` <span class="badge badge-warning">${ar ? 'منخفض' : 'low'}</span>` : ''}</td>
          <td>${escapeHtml(r.category || '—')}</td>
          <td><small>${escapeHtml(typeof branchLabel === 'function' ? branchLabel(r.branch, lang) : (r.branch || '—'))}</small></td>
          <td><strong>${Number(r.qty)}</strong> <small style="color:#9ca3af">${escapeHtml(r.unit || '')}</small></td>
          <td>${Number(r.reorder_level)}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary" onclick="adjustInv(${r.item_id},-1)">−</button>
            <button class="btn btn-sm btn-secondary" onclick="adjustInv(${r.item_id},1)">+</button>
            <button class="btn btn-sm btn-secondary" onclick="openInvItem(${r.item_id})">✎</button>
          </td></tr>`; }).join('')}
      </tbody></table></div>` : emptyState(ar ? 'لا أصناف بعد' : 'No items yet')}
    </div>`;
}
function openInvItem(itemId) {
  const ar = currentLanguage() === 'ar';
  const it = itemId ? dbGet('SELECT * FROM inventory WHERE item_id = ?', [itemId]) : null;
  const branchOpts = (typeof BRANCHES !== 'undefined' ? BRANCHES : []).map(b => `<option value="${b.key}" ${it && it.branch === b.key ? 'selected' : ''}>${escapeHtml(ar ? b.ar : b.en)}</option>`).join('');
  showModal(`<h2 style="margin-top:0">${it ? (ar ? 'تعديل صنف' : 'Edit item') : (ar ? 'صنف جديد' : 'New item')}</h2>
    <div class="form-row"><div class="form-group"><label>${ar ? 'الاسم (EN)' : 'Name (EN)'}</label><input id="iv-en" value="${it ? escapeHtml(it.name_en || '') : ''}"></div>
      <div class="form-group"><label>${ar ? 'الاسم (AR)' : 'Name (AR)'}</label><input id="iv-ar" value="${it ? escapeHtml(it.name_ar || '') : ''}"></div></div>
    <div class="form-row"><div class="form-group"><label>${ar ? 'الفئة' : 'Category'}</label><input id="iv-cat" value="${it ? escapeHtml(it.category || '') : ''}"></div>
      <div class="form-group"><label>${ar ? 'الوحدة' : 'Unit'}</label><input id="iv-unit" value="${it ? escapeHtml(it.unit || 'pcs') : 'pcs'}"></div></div>
    <div class="form-row"><div class="form-group"><label>${ar ? 'الكمية' : 'Qty'}</label><input id="iv-qty" type="number" value="${it ? Number(it.qty) : 0}"></div>
      <div class="form-group"><label>${ar ? 'حد إعادة الطلب' : 'Reorder level'}</label><input id="iv-re" type="number" value="${it ? Number(it.reorder_level) : 0}"></div>
      <div class="form-group"><label>${ar ? 'الفرع' : 'Branch'}</label><select id="iv-branch">${branchOpts}</select></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button class="btn btn-secondary" onclick="closeModal()">${t('cancel') || 'Cancel'}</button>
      <button class="btn btn-primary" onclick="saveInvItem(${itemId || 0})">${ar ? 'حفظ' : 'Save'}</button></div>`, { maxWidth: 560 });
}
function saveInvItem(itemId) {
  const ar = currentLanguage() === 'ar'; const u = getCurrentUser();
  const en = document.getElementById('iv-en').value.trim();
  if (!en) { showError(ar ? 'الاسم مطلوب' : 'Name required'); return; }
  const v = (id) => document.getElementById(id).value.trim();
  const qty = parseFloat(v('iv-qty')) || 0, re = parseFloat(v('iv-re')) || 0;
  try {
    if (itemId) dbRun('UPDATE inventory SET name_en=?, name_ar=?, category=?, unit=?, qty=?, reorder_level=?, branch=?, updated_by=?, updated_at=? WHERE item_id=?',
      [en, v('iv-ar'), v('iv-cat'), v('iv-unit') || 'pcs', qty, re, document.getElementById('iv-branch').value, u.user_id, nowISO(), itemId]);
    else dbRun('INSERT INTO inventory (name_en, name_ar, category, unit, qty, reorder_level, branch, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [en, v('iv-ar'), v('iv-cat'), v('iv-unit') || 'pcs', qty, re, document.getElementById('iv-branch').value, u.user_id, nowISO()]);
    logAction('INVENTORY_SAVED', `${u.full_name_en} ${itemId ? 'updated' : 'added'} inventory item ${en}`);
    dlog('inventory.save', { itemId, en, qty, re }); saveDBToIndexedDB(); closeModal(); navigateTo('mgr-inventory');
  } catch (e) { derr('inventory.save', e); showError(e.message); }
}
function adjustInv(itemId, delta) {
  const u = getCurrentUser();
  try {
    dbRun('UPDATE inventory SET qty = MAX(0, qty + ?), updated_by=?, updated_at=? WHERE item_id=?', [delta, u.user_id, nowISO(), itemId]);
    dlog('inventory.adjust', { itemId, delta }); saveDBToIndexedDB(); navigateTo('mgr-inventory');
  } catch (e) { derr('inventory.adjust', e); }
}

// ============================================================
// WAITLIST — fill cancellations
// ============================================================
function renderWaitlist(main, lang) {
  const ar = lang === 'ar';
  const rows = dbAll(`SELECT w.*, p.full_name_en, p.full_name_ar, p.phone FROM waitlist w JOIN patients p ON p.patient_id = w.patient_id
    WHERE w.status IN ('waiting','contacted') ORDER BY (w.priority='high') DESC, w.created_at`);
  const remind = encodeURIComponent(ar ? 'من عيادة الأسنان: تشاغر موعد أقرب. هل ترغب بحجزه؟' : 'Dental clinic: an earlier slot just opened — would you like it?');
  main.innerHTML = `
    <div class="page-header"><h1>⏱ ${ar ? 'قائمة الانتظار' : 'Waitlist'}</h1>
      <button class="btn btn-sm btn-primary" onclick="openAddWaitlist()">+ ${ar ? 'إضافة' : 'Add'}</button></div>
    <div class="card">
      ${rows.length ? `<div class="table-container"><table><thead><tr><th>${ar ? 'المريض' : 'Patient'}</th><th>${ar ? 'السبب' : 'Reason'}</th><th>${ar ? 'المفضّل' : 'Prefers'}</th><th>${ar ? 'الأولوية' : 'Priority'}</th><th>${ar ? 'الحالة' : 'Status'}</th><th></th></tr></thead><tbody>
        ${rows.map(w => `<tr ${w.priority === 'high' ? 'style="background:#fff7ed"' : ''}>
          <td>${escapeHtml(ar ? w.full_name_ar : w.full_name_en)}<br><small style="color:#9ca3af">${escapeHtml(w.phone || '')}</small></td>
          <td>${escapeHtml(w.reason || '—')}</td><td>${escapeHtml(w.preferred || '—')}</td>
          <td>${w.priority === 'high' ? `<span class="badge badge-danger">${ar ? 'عاجل' : 'high'}</span>` : `<span class="badge badge-secondary">${ar ? 'عادي' : 'normal'}</span>`}</td>
          <td><span class="badge badge-info">${escapeHtml(w.status)}</span></td>
          <td style="white-space:nowrap">
            ${w.phone ? `<a class="btn btn-sm btn-success" target="_blank" rel="noopener" href="https://wa.me/${normalizeEgPhone(w.phone)}?text=${remind}" onclick="waitlistAction(${w.wait_id},'contacted')">📱</a>` : ''}
            <button class="btn btn-sm btn-primary" onclick="waitlistAction(${w.wait_id},'booked')">${ar ? 'حجز' : 'Booked'}</button>
            <button class="btn btn-sm btn-secondary" onclick="waitlistAction(${w.wait_id},'removed')">✕</button>
          </td></tr>`).join('')}
      </tbody></table></div>` : emptyState(ar ? 'لا أحد في الانتظار' : 'Nobody waiting')}
    </div>`;
}
function openAddWaitlist() {
  const ar = currentLanguage() === 'ar';
  const ps = dbAll('SELECT patient_id, full_name_en, full_name_ar, mrn, branch FROM patients ORDER BY full_name_en');
  const opts = ps.map(p => `<option value="${p.patient_id}" data-branch="${escapeHtml(p.branch || '')}">${escapeHtml(ar ? p.full_name_ar : p.full_name_en)} — ${escapeHtml(p.mrn)}</option>`).join('');
  showModal(`<h2 style="margin-top:0">${ar ? 'إضافة لقائمة الانتظار' : 'Add to waitlist'}</h2>
    <div class="form-group"><label>${ar ? 'المريض' : 'Patient'}</label><select id="wl-pat">${opts}</select></div>
    <div class="form-group"><label>${ar ? 'السبب' : 'Reason'}</label><input id="wl-reason" placeholder="${ar ? 'مثل: ألم — يريد موعداً أقرب' : 'e.g. Pain — wants earlier slot'}"></div>
    <div class="form-row"><div class="form-group"><label>${ar ? 'الوقت المفضّل' : 'Preferred time'}</label><input id="wl-pref" placeholder="${ar ? 'صباحاً' : 'Mornings'}"></div>
      <div class="form-group"><label>${ar ? 'الأولوية' : 'Priority'}</label><select id="wl-prio"><option value="normal">${ar ? 'عادي' : 'Normal'}</option><option value="high">${ar ? 'عاجل' : 'High'}</option></select></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button class="btn btn-secondary" onclick="closeModal()">${t('cancel') || 'Cancel'}</button>
      <button class="btn btn-primary" onclick="saveWaitlist()">${ar ? 'إضافة' : 'Add'}</button></div>`, { maxWidth: 520 });
}
function saveWaitlist() {
  const ar = currentLanguage() === 'ar'; const u = getCurrentUser();
  const sel = document.getElementById('wl-pat'); const o = sel.selectedOptions[0];
  if (!o) { showError(ar ? 'اختر مريضاً' : 'Pick a patient'); return; }
  try {
    dbRun('INSERT INTO waitlist (patient_id, reason, preferred, priority, branch, status, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [parseInt(o.value, 10), document.getElementById('wl-reason').value.trim(), document.getElementById('wl-pref').value.trim(), document.getElementById('wl-prio').value, o.dataset.branch || null, 'waiting', u.user_id, nowISO()]);
    logAction('WAITLIST_ADD', `${u.full_name_en} added a patient to the waitlist`);
    dlog('waitlist.add', { patientId: o.value }); saveDBToIndexedDB(); closeModal(); navigateTo('rcp-waitlist');
  } catch (e) { derr('waitlist.add', e); showError(e.message); }
}
function waitlistAction(waitId, status) {
  const u = getCurrentUser();
  try {
    dbRun('UPDATE waitlist SET status=? WHERE wait_id=?', [status, waitId]);
    logAction('WAITLIST_UPDATE', `${u.full_name_en} marked a waitlist entry ${status}`);
    dlog('waitlist.update', { waitId, status }); saveDBToIndexedDB();
    if (status === 'booked') showSuccess(currentLanguage() === 'ar' ? 'تم — احجز الموعد من شاشة المواعيد' : 'Done — now book the slot in Appointments');
    navigateTo('rcp-waitlist');
  } catch (e) { derr('waitlist.update', e); }
}

// ============================================================
// LAB CASES — crown/denture/aligner round-trip
// ============================================================
const LAB_FLOW = ['sent', 'at_lab', 'received', 'fitted'];
function _labStatusLabel(s, ar) { return ({ sent: ar ? 'مُرسل' : 'Sent', at_lab: ar ? 'في المعمل' : 'At lab', received: ar ? 'مُستلم' : 'Received', fitted: ar ? 'مُركّب' : 'Fitted', remake: ar ? 'إعادة' : 'Remake' })[s] || s; }
function renderLabCases(main, lang) {
  const ar = lang === 'ar';
  const today = _today();
  const rows = dbAll(`SELECT c.*, p.full_name_en, p.full_name_ar, u.full_name_en dent_en FROM lab_cases c
    JOIN patients p ON p.patient_id = c.patient_id LEFT JOIN users u ON u.user_id = c.dentist_id
    ORDER BY (c.status IN ('sent','at_lab')) DESC, c.due_date`);
  const stBadge = (s) => s === 'fitted' ? `<span class="badge badge-success">${_labStatusLabel(s, ar)}</span>` : s === 'received' ? `<span class="badge badge-warning">${_labStatusLabel(s, ar)}</span>` : `<span class="badge badge-info">${_labStatusLabel(s, ar)}</span>`;
  main.innerHTML = `
    <div class="page-header"><h1>🦷 ${ar ? 'حالات المعمل' : 'Lab cases'}</h1>
      <button class="btn btn-sm btn-primary" onclick="openAddLabCase()">+ ${ar ? 'حالة' : 'Case'}</button></div>
    <div class="card">
      ${rows.length ? `<div class="table-container"><table><thead><tr><th>${ar ? 'المريض' : 'Patient'}</th><th>${ar ? 'النوع' : 'Type'}</th><th>${ar ? 'الأسنان' : 'Teeth'}</th><th>${ar ? 'المعمل' : 'Lab'}</th><th>${ar ? 'الاستحقاق' : 'Due'}</th><th>${ar ? 'الحالة' : 'Status'}</th><th></th></tr></thead><tbody>
        ${rows.map(c => `<tr ${(c.due_date && c.due_date <= today && (c.status === 'sent' || c.status === 'at_lab')) ? 'style="background:#fef2f2"' : ''}>
          <td>${escapeHtml(ar ? c.full_name_ar : c.full_name_en)}</td>
          <td>${escapeHtml(c.case_type || '—')}${c.shade ? ` <small style="color:#9ca3af">${escapeHtml(c.shade)}</small>` : ''}</td>
          <td>${escapeHtml(c.tooth_refs || '—')}</td><td>${escapeHtml(c.lab_name || '—')}</td>
          <td>${c.due_date || '—'}</td><td>${stBadge(c.status)}</td>
          <td style="white-space:nowrap">${LAB_FLOW.indexOf(c.status) >= 0 && c.status !== 'fitted' ? `<button class="btn btn-sm btn-success" onclick="labCaseAdvance(${c.case_id})">${ar ? 'التالي ▸' : 'Advance ▸'}</button>` : ''}</td>
        </tr>`).join('')}
      </tbody></table></div>` : emptyState(ar ? 'لا حالات معمل' : 'No lab cases')}
    </div>`;
}
function openAddLabCase() {
  const ar = currentLanguage() === 'ar';
  const ps = dbAll('SELECT patient_id, full_name_en, full_name_ar, mrn FROM patients ORDER BY full_name_en');
  const opts = ps.map(p => `<option value="${p.patient_id}">${escapeHtml(ar ? p.full_name_ar : p.full_name_en)} — ${escapeHtml(p.mrn)}</option>`).join('');
  showModal(`<h2 style="margin-top:0">${ar ? 'حالة معمل جديدة' : 'New lab case'}</h2>
    <div class="form-group"><label>${ar ? 'المريض' : 'Patient'}</label><select id="lc-pat">${opts}</select></div>
    <div class="form-row"><div class="form-group"><label>${ar ? 'النوع' : 'Type'}</label><input id="lc-type" placeholder="${ar ? 'تاج / جسر / طقم' : 'Crown / Bridge / Denture'}"></div>
      <div class="form-group"><label>${ar ? 'الأسنان' : 'Teeth'}</label><input id="lc-teeth" placeholder="14"></div>
      <div class="form-group"><label>${ar ? 'اللون' : 'Shade'}</label><input id="lc-shade" placeholder="A2"></div></div>
    <div class="form-row"><div class="form-group"><label>${ar ? 'المعمل' : 'Lab'}</label><input id="lc-lab" placeholder="Cairo Dental Lab"></div>
      <div class="form-group"><label>${ar ? 'تاريخ العودة' : 'Due date'}</label><input id="lc-due" type="date" value="${_addDays(_today(), 7)}"></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button class="btn btn-secondary" onclick="closeModal()">${t('cancel') || 'Cancel'}</button>
      <button class="btn btn-primary" onclick="saveLabCase()">${ar ? 'إرسال للمعمل' : 'Send to lab'}</button></div>`, { maxWidth: 600 });
}
function saveLabCase() {
  const ar = currentLanguage() === 'ar'; const u = getCurrentUser();
  const o = document.getElementById('lc-pat').selectedOptions[0];
  if (!o) { showError(ar ? 'اختر مريضاً' : 'Pick a patient'); return; }
  const v = (id) => document.getElementById(id).value.trim();
  try {
    dbRun('INSERT INTO lab_cases (patient_id, lab_name, case_type, tooth_refs, shade, sent_date, due_date, status, dentist_id, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [parseInt(o.value, 10), v('lc-lab'), v('lc-type'), v('lc-teeth'), v('lc-shade'), _today(), document.getElementById('lc-due').value, 'sent', u.user_id, u.user_id, nowISO()]);
    logAction('LAB_CASE_SENT', `${u.full_name_en} sent a ${v('lc-type') || 'lab'} case to ${v('lc-lab') || 'the lab'}`, null, parseInt(o.value, 10));
    dlog('labcase.add', { patientId: o.value, type: v('lc-type') }); saveDBToIndexedDB(); closeModal(); navigateTo('lab-cases');
  } catch (e) { derr('labcase.add', e); showError(e.message); }
}
function labCaseAdvance(caseId) {
  const c = dbGet('SELECT * FROM lab_cases WHERE case_id=?', [caseId]); if (!c) return;
  const next = LAB_FLOW[Math.min(LAB_FLOW.indexOf(c.status) + 1, LAB_FLOW.length - 1)];
  const u = getCurrentUser();
  try {
    dbRun('UPDATE lab_cases SET status=?, received_date=COALESCE(received_date, ?) WHERE case_id=?', [next, next === 'received' ? _today() : null, caseId]);
    logAction('LAB_CASE_UPDATE', `${u.full_name_en} advanced lab case #${caseId} to ${next}`, null, c.patient_id);
    dlog('labcase.advance', { caseId, next }); saveDBToIndexedDB(); navigateTo('lab-cases');
  } catch (e) { derr('labcase.advance', e); }
}

// ============================================================
// LOCAL-ANAESTHETIC MAX-DOSE CALCULATOR (chairside safety helper)
// Standard maxima (with vasoconstrictor); a licensed dentist must confirm for
// the individual patient. Carpule = 1.8 mL.
// ============================================================
const LA_AGENTS = [
  { k: 'lido2', en: 'Lidocaine 2% + epi', ar: 'ليدوكايين 2% + أدرينالين', mgPerKg: 7, absMax: 500, mgPerCarpule: 36 },
  { k: 'artic4', en: 'Articaine 4% + epi', ar: 'أرتيكايين 4% + أدرينالين', mgPerKg: 7, absMax: 500, mgPerCarpule: 72 },
  { k: 'mepiv3', en: 'Mepivacaine 3% (plain)', ar: 'ميبيفاكايين 3%', mgPerKg: 6.6, absMax: 400, mgPerCarpule: 54 },
];
function openLaCalc(patientId) {
  const ar = currentLanguage() === 'ar';
  const p = patientId ? dbGet('SELECT weight_kg FROM patients WHERE patient_id=?', [patientId]) : null;
  const opts = LA_AGENTS.map(a => `<option value="${a.k}">${escapeHtml(ar ? a.ar : a.en)}</option>`).join('');
  showModal(`<h2 style="margin-top:0">💉 ${ar ? 'حاسبة جرعة المخدر' : 'Local-anaesthetic max dose'}</h2>
    <div class="form-row"><div class="form-group"><label>${ar ? 'وزن المريض (كجم)' : 'Patient weight (kg)'}</label><input id="la-wt" type="number" min="1" value="${p && p.weight_kg ? Number(p.weight_kg) : ''}" oninput="laCalcCompute()"></div>
      <div class="form-group"><label>${ar ? 'المخدر' : 'Agent'}</label><select id="la-agent" onchange="laCalcCompute()">${opts}</select></div></div>
    <div id="la-out" style="margin-top:6px"></div>
    <p style="color:#9ca3af;font-size:.75rem">${ar ? 'قيم استرشادية مع مضيّق وعائي (كبسولة 1.8 مل). يجب أن يؤكدها طبيب مرخّص لكل حالة.' : 'Guideline maxima with vasoconstrictor (1.8 mL carpule). A licensed dentist must confirm for each patient.'}</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px"><button class="btn btn-secondary" onclick="closeModal()">${ar ? 'إغلاق' : 'Close'}</button></div>`, { maxWidth: 520 });
  laCalcCompute();
}
function laCalcCompute() {
  const ar = currentLanguage() === 'ar';
  const out = document.getElementById('la-out'); if (!out) return;
  const wt = parseFloat(document.getElementById('la-wt').value);
  const a = LA_AGENTS.find(x => x.k === document.getElementById('la-agent').value) || LA_AGENTS[0];
  if (!wt || wt <= 0) { out.innerHTML = `<p class="muted">${ar ? 'أدخل الوزن لحساب الحد الأقصى.' : 'Enter a weight to compute the maximum.'}</p>`; return; }
  const byWeight = a.mgPerKg * wt;
  const maxMg = Math.min(byWeight, a.absMax);
  const carpules = Math.floor(maxMg / a.mgPerCarpule);
  const capped = byWeight > a.absMax;
  out.innerHTML = `<div class="card" style="background:var(--bg-soft,#f9fafb);margin:0">
    <div style="font-size:1.4rem;font-weight:700;color:var(--primary)">${carpules} ${ar ? 'كبسولة' : 'carpules'}</div>
    <div style="font-size:.85rem;color:#374151">${ar ? 'الحد الأقصى' : 'Max'} ≈ ${Math.round(maxMg)} mg ${capped ? `<span class="badge badge-warning">${ar ? 'محدود بالسقف المطلق' : 'absolute cap'}</span>` : `(${a.mgPerKg} mg/kg × ${wt} kg)`}</div>
    <div style="font-size:.78rem;color:#9ca3af">${a.mgPerCarpule} mg / ${ar ? 'كبسولة' : 'carpule'}</div></div>`;
}

// ============================================================
// TREATMENT-PLAN PRESENT MODE + SIGNATURE + ACCEPTANCE
// ============================================================
function presentTreatmentPlan(patientId) {
  const lang = currentLanguage(); const ar = lang === 'ar';
  const p = dbGet('SELECT * FROM patients WHERE patient_id=?', [patientId]); if (!p) return;
  const items = dbAll("SELECT * FROM treatment_plan_items WHERE patient_id=? AND status IN ('planned','in_progress') ORDER BY phase, created_at", [patientId]);
  const plan = dbGet("SELECT * FROM treatment_plans WHERE patient_id=? ORDER BY (status IN ('proposed','accepted','in_progress')) DESC, created_at DESC LIMIT 1", [patientId]);
  const total = items.reduce((s, i) => s + (i.price || 0), 0);
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header"><h1>🪥 ${ar ? 'خطتك العلاجية' : 'Your treatment plan'}</h1>
      <div style="display:flex;gap:6px"><button class="btn btn-sm btn-secondary" onclick="window.print()">🖨</button>
        <button class="btn btn-sm btn-secondary" onclick="navigateTo('dr-plans')">${ar ? 'رجوع' : 'Back'}</button></div></div>
    <div class="card" style="max-width:680px;margin:0 auto">
      <div style="text-align:center;border-bottom:2px solid var(--primary);padding-bottom:8px;margin-bottom:12px">
        <div style="font-size:1.2rem;font-weight:700">${escapeHtml(getSetting('clinic_name', 'OpenSmile Dental'))}</div>
        <div style="color:#6b7280">${escapeHtml(ar ? p.full_name_ar : (p.full_name_en || p.full_name_ar))} · ${escapeHtml(p.mrn)}</div>
      </div>
      ${items.length ? `<table style="width:100%;border-collapse:collapse">
        <thead><tr style="text-align:${ar ? 'right' : 'left'};border-bottom:1px solid #e5e7eb"><th style="padding:6px">${ar ? 'الإجراء' : 'Procedure'}</th><th style="padding:6px">${ar ? 'السن' : 'Tooth'}</th><th style="padding:6px;text-align:${ar ? 'left' : 'right'}">${ar ? 'التكلفة' : 'Cost'}</th></tr></thead>
        <tbody>${items.map(i => `<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:6px">${escapeHtml(ar ? (i.procedure_name_ar || i.procedure_name_en) : i.procedure_name_en)}</td><td style="padding:6px">${i.tooth_fdi || '—'}</td><td style="padding:6px;text-align:${ar ? 'left' : 'right'}">${_money(i.price, lang)}</td></tr>`).join('')}</tbody>
        <tfoot><tr style="font-weight:700;border-top:2px solid #e5e7eb"><td style="padding:8px" colspan="2">${ar ? 'الإجمالي' : 'Total'}</td><td style="padding:8px;text-align:${ar ? 'left' : 'right'}">${_money(total, lang)}</td></tr></tfoot>
      </table>
      <div style="text-align:center;margin-top:18px">
        ${plan && plan.accepted_at ? `<div class="badge badge-success" style="font-size:.9rem">✓ ${ar ? 'قبل المريض الخطة في' : 'Accepted on'} ${String(plan.accepted_at).slice(0, 10)}</div>`
          : `<button class="btn btn-primary" onclick="openPlanSignature(${patientId}, ${plan ? plan.plan_id : 'null'})">✍️ ${ar ? 'موافقة وتوقيع المريض' : 'Patient accepts & signs'}</button>`}
      </div>` : `<p class="muted" style="text-align:center">${ar ? 'لا توجد بنود مقترحة لعرضها' : 'No proposed procedures to present'}</p>`}
    </div>`;
}

// Signature pad — reused for plan acceptance and generic consent. Context held
// in _sigCtx; the canvas captures pointer strokes and is stored as a
// patient_attachment (kind 'signature'/'consent').
let _sigCtx = null;
function openPlanSignature(patientId, planId) { _sigCtx = { kind: 'plan', patientId, planId }; _openSignatureModal(currentLanguage() === 'ar' ? 'توقيع الموافقة على الخطة' : 'Sign to accept the plan'); }
function openConsentSignature(patientId) { _sigCtx = { kind: 'consent', patientId, planId: null }; _openSignatureModal(currentLanguage() === 'ar' ? 'توقيع الموافقة' : 'Consent signature'); }
function _openSignatureModal(title) {
  const ar = currentLanguage() === 'ar';
  showModal(`<h2 style="margin-top:0">✍️ ${escapeHtml(title)}</h2>
    <p style="color:#6b7280;font-size:.82rem;margin-top:0">${ar ? 'وقّع بإصبعك أو الفأرة في الإطار.' : 'Sign with finger or mouse inside the box.'}</p>
    <canvas id="sig-pad" width="520" height="180" style="width:100%;max-width:520px;border:1px dashed #9ca3af;border-radius:8px;background:var(--white);touch-action:none"></canvas>
    <div style="display:flex;gap:8px;justify-content:space-between;margin-top:10px">
      <button class="btn btn-secondary" onclick="sigClear()">${ar ? 'مسح' : 'Clear'}</button>
      <div style="display:flex;gap:8px"><button class="btn btn-secondary" onclick="closeModal()">${t('cancel') || 'Cancel'}</button>
      <button class="btn btn-primary" onclick="saveSignature()">${ar ? 'حفظ التوقيع' : 'Save signature'}</button></div>
    </div>`, { maxWidth: 580 });
  _setupSigCanvas();
}
let _sigDrawn = false;
function _setupSigCanvas() {
  const c = document.getElementById('sig-pad'); if (!c) return;
  const ctx = c.getContext('2d'); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111827';
  _sigDrawn = false; let drawing = false;
  const pos = (e) => { const r = c.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) }; };
  const start = (e) => { drawing = true; _sigDrawn = true; const pt = pos(e); ctx.beginPath(); ctx.moveTo(pt.x, pt.y); e.preventDefault(); };
  const move = (e) => { if (!drawing) return; const pt = pos(e); ctx.lineTo(pt.x, pt.y); ctx.stroke(); e.preventDefault(); };
  const end = () => { drawing = false; };
  c.addEventListener('mousedown', start); c.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
  c.addEventListener('touchstart', start, { passive: false }); c.addEventListener('touchmove', move, { passive: false }); c.addEventListener('touchend', end);
}
function sigClear() { const c = document.getElementById('sig-pad'); if (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); _sigDrawn = false; } }
function saveSignature() {
  const ar = currentLanguage() === 'ar'; const u = getCurrentUser();
  if (!_sigCtx) return;
  if (!_sigDrawn) { showError(ar ? 'يرجى التوقيع أولاً' : 'Please sign first'); return; }
  const c = document.getElementById('sig-pad'); const dataUrl = c.toDataURL('image/png');
  try {
    dbRun('INSERT INTO patient_attachments (patient_id, filename, mime, kind, size_bytes, data, note, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [_sigCtx.patientId, 'signature.png', 'image/png', _sigCtx.kind === 'plan' ? 'signature' : 'consent', dataUrl.length, dataUrl, _sigCtx.kind === 'plan' ? 'Treatment plan acceptance' : 'Consent', u.user_id, nowISO()]);
    const attachId = dbLastId();
    if (_sigCtx.kind === 'plan' && _sigCtx.planId) {
      dbRun("UPDATE treatment_plans SET status='accepted', accepted_at=?, accepted_by=?, signature_attach_id=? WHERE plan_id=?", [nowISO(), _sigCtx.patientId, attachId, _sigCtx.planId]);
      dbRun("UPDATE treatment_plan_items SET status='planned' WHERE plan_id=? AND status='proposed'", [_sigCtx.planId]);
    }
    logAction(_sigCtx.kind === 'plan' ? 'PLAN_ACCEPTED' : 'CONSENT_SIGNED', `${u.full_name_en} captured a ${_sigCtx.kind === 'plan' ? 'treatment-plan acceptance' : 'consent'} signature`, null, _sigCtx.patientId);
    dlog('signature.save', { kind: _sigCtx.kind, patientId: _sigCtx.patientId }); saveDBToIndexedDB(); closeModal();
    showSuccess(ar ? 'تم حفظ التوقيع' : 'Signature saved');
    if (_sigCtx.kind === 'plan') presentTreatmentPlan(_sigCtx.patientId);
  } catch (e) { derr('signature.save', e); showError(e.message); }
}

// ============================================================
// BOOK-RECALL-AT-CHECKOUT — offered right after an invoice is created, so the
// next recall is booked while the patient is still at the desk.
// ============================================================
function offerBookRecall(patientId) {
  if (!patientId) return;
  const ar = currentLanguage() === 'ar';
  const p = dbGet('SELECT full_name_en, full_name_ar FROM patients WHERE patient_id=?', [patientId]); if (!p) return;
  showModal(`<h2 style="margin-top:0">⏭ ${ar ? 'حجز المراجعة القادمة الآن' : 'Book the next recall now'}</h2>
    <p style="color:#6b7280;font-size:.85rem;margin-top:0">${ar ? 'حجز المراجعة عند الخروج يرفع نسبة العودة كثيراً مقابل «سنتصل بك لاحقاً».' : 'Booking at checkout lifts return rates far above “we’ll call you later”.'}</p>
    <div class="form-row"><div class="form-group"><label>${ar ? 'النوع' : 'Type'}</label><select id="br-type"><option value="checkup">${ar ? 'فحص دوري' : 'Checkup'}</option><option value="perio_maintenance">${ar ? 'صيانة لثة' : 'Perio maintenance'}</option><option value="ortho_review">${ar ? 'مراجعة تقويم' : 'Ortho review'}</option></select></div>
      <div class="form-group"><label>${ar ? 'بعد (شهور)' : 'In (months)'}</label><select id="br-months"><option value="3">3</option><option value="6" selected>6</option><option value="12">12</option></select></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-secondary" onclick="closeModal()">${ar ? 'لاحقاً' : 'Skip'}</button>
      <button class="btn btn-primary" onclick="doBookRecall(${patientId})">${ar ? 'حجز' : 'Book it'}</button></div>`, { maxWidth: 520 });
}
function doBookRecall(patientId) {
  const ar = currentLanguage() === 'ar'; const u = getCurrentUser();
  const type = document.getElementById('br-type').value;
  const months = parseInt(document.getElementById('br-months').value, 10) || 6;
  const due = _addMonths(_today(), months);
  try {
    dbRun("INSERT INTO recalls (patient_id, type, due_date, status, created_at, notes) VALUES (?,?,?,?,?,?)", [patientId, type, due, 'scheduled', nowISO(), 'Booked at checkout']);
    logAction('RECALL_BOOKED', `${u.full_name_en} booked a ${type} recall for ${due} at checkout`, null, patientId);
    dlog('recall.bookedAtCheckout', { patientId, type, due }); saveDBToIndexedDB(); closeModal();
    showSuccess(ar ? `تم الحجز للمراجعة في ${due}` : `Recall booked for ${due}`);
  } catch (e) { derr('recall.book', e); showError(e.message); }
}

// ============================================================
// INSTALLMENT PLAN — split a big invoice into dated payments.
// ============================================================
function openInstallmentPlan(invoiceId) {
  const ar = currentLanguage() === 'ar';
  const inv = dbGet('SELECT * FROM invoices WHERE invoice_id=?', [invoiceId]); if (!inv) return;
  const bal = (inv.total || 0) - (inv.paid_amount || 0);
  const existing = dbAll('SELECT * FROM installments WHERE invoice_id=? ORDER BY seq', [invoiceId]);
  showModal(`<h2 style="margin-top:0">💳 ${ar ? 'خطة تقسيط' : 'Installment plan'} — #${invoiceId}</h2>
    <p style="color:#6b7280;font-size:.85rem;margin-top:0">${ar ? 'المتبقي' : 'Balance'}: <strong>${_money(bal, currentLanguage())}</strong></p>
    ${existing.length ? `<div class="table-container" style="margin-bottom:10px"><table><thead><tr><th>#</th><th>${ar ? 'الاستحقاق' : 'Due'}</th><th>${ar ? 'المبلغ' : 'Amount'}</th><th>${ar ? 'الحالة' : 'Status'}</th><th></th></tr></thead><tbody>
      ${existing.map(x => `<tr><td>${x.seq}</td><td>${x.due_date}</td><td>${_money(x.amount, currentLanguage())}</td><td>${x.status === 'paid' ? `<span class="badge badge-success">${ar ? 'مدفوع' : 'paid'}</span>` : `<span class="badge badge-info">${ar ? 'مستحق' : 'due'}</span>`}</td>
        <td>${x.status !== 'paid' ? `<button class="btn btn-sm btn-success" onclick="payInstallment(${x.inst_id})">${ar ? 'تحصيل' : 'Collect'}</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
    ${bal > 0 ? `<div class="form-row"><div class="form-group"><label>${ar ? 'عدد الأقساط' : 'Number of payments'}</label><input id="inst-n" type="number" min="2" max="24" value="3"></div>
      <div class="form-group"><label>${ar ? 'يبدأ' : 'Starting'}</label><input id="inst-start" type="date" value="${_today()}"></div>
      <div class="form-group"><label>${ar ? 'كل (شهور)' : 'Every (months)'}</label><input id="inst-gap" type="number" min="1" value="1"></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button class="btn btn-secondary" onclick="closeModal()">${t('cancel') || 'Cancel'}</button>
      <button class="btn btn-primary" onclick="createInstallments(${invoiceId})">${ar ? 'إنشاء الجدول' : 'Create schedule'}</button></div>`
      : `<div style="text-align:right;margin-top:8px"><button class="btn btn-secondary" onclick="closeModal()">${ar ? 'إغلاق' : 'Close'}</button></div>`}`, { maxWidth: 600 });
}
function createInstallments(invoiceId) {
  const ar = currentLanguage() === 'ar'; const u = getCurrentUser();
  const inv = dbGet('SELECT * FROM invoices WHERE invoice_id=?', [invoiceId]); if (!inv) return;
  const bal = (inv.total || 0) - (inv.paid_amount || 0);
  const n = Math.max(2, Math.min(24, parseInt(document.getElementById('inst-n').value, 10) || 3));
  const start = document.getElementById('inst-start').value || _today();
  const gap = Math.max(1, parseInt(document.getElementById('inst-gap').value, 10) || 1);
  const each = Math.floor((bal / n) * 100) / 100;
  try {
    dbRun('DELETE FROM installments WHERE invoice_id=? AND status=?', [invoiceId, 'due']);
    for (let i = 0; i < n; i++) {
      const amt = i === n - 1 ? Math.round((bal - each * (n - 1)) * 100) / 100 : each;
      dbRun('INSERT INTO installments (invoice_id, patient_id, seq, due_date, amount, status, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
        [invoiceId, inv.patient_id, i + 1, _addMonths(start, i * gap), amt, 'due', u.user_id, nowISO()]);
    }
    logAction('INSTALLMENTS_CREATED', `${u.full_name_en} created a ${n}-payment plan on invoice #${invoiceId}`, null, inv.patient_id);
    dlog('installments.create', { invoiceId, n, bal }); saveDBToIndexedDB(); closeModal();
    showSuccess(ar ? 'تم إنشاء جدول التقسيط' : 'Installment plan created');
    navigateTo('rcp-billing');
  } catch (e) { derr('installments.create', e); showError(e.message); }
}
function payInstallment(instId) {
  const u = getCurrentUser();
  const x = dbGet('SELECT * FROM installments WHERE inst_id=?', [instId]); if (!x) return;
  try {
    dbRun("UPDATE installments SET status='paid', paid_at=? WHERE inst_id=?", [nowISO(), instId]);
    dbRun('UPDATE invoices SET paid_amount = MIN(total, paid_amount + ?) WHERE invoice_id=?', [x.amount, x.invoice_id]);
    const inv = dbGet('SELECT * FROM invoices WHERE invoice_id=?', [x.invoice_id]);
    if (inv && inv.paid_amount >= inv.total) dbRun("UPDATE invoices SET status='paid' WHERE invoice_id=?", [x.invoice_id]);
    else dbRun("UPDATE invoices SET status='partial' WHERE invoice_id=?", [x.invoice_id]);
    logAction('INSTALLMENT_PAID', `${u.full_name_en} collected installment #${x.seq} (${x.amount}) on invoice #${x.invoice_id}`, null, x.patient_id);
    dlog('installment.pay', { instId, amount: x.amount }); saveDBToIndexedDB();
    openInstallmentPlan(x.invoice_id);
  } catch (e) { derr('installment.pay', e); showError(e.message); }
}

// ============================================================
// FAMILY LEDGER — link members to a guarantor; show the household balance.
// ============================================================
function openLinkFamily(patientId) {
  const ar = currentLanguage() === 'ar';
  const cur = dbGet('SELECT guarantor_id FROM patients WHERE patient_id=?', [patientId]);
  const others = dbAll('SELECT patient_id, full_name_en, full_name_ar, mrn FROM patients WHERE patient_id != ? ORDER BY full_name_en', [patientId]);
  const opts = `<option value="">${ar ? '— يدفع عن نفسه —' : '— bills to self —'}</option>` + others.map(p => `<option value="${p.patient_id}" ${cur && cur.guarantor_id === p.patient_id ? 'selected' : ''}>${escapeHtml(ar ? p.full_name_ar : p.full_name_en)} — ${escapeHtml(p.mrn)}</option>`).join('');
  showModal(`<h2 style="margin-top:0">👪 ${ar ? 'ربط الحساب العائلي' : 'Family ledger'}</h2>
    <p style="color:#6b7280;font-size:.85rem;margin-top:0">${ar ? 'من يتحمّل فواتير هذا المريض؟' : 'Who pays this patient’s bills?'}</p>
    <div class="form-group"><label>${ar ? 'الضامن (وليّ الحساب)' : 'Guarantor'}</label><select id="fam-guar">${opts}</select></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button class="btn btn-secondary" onclick="closeModal()">${t('cancel') || 'Cancel'}</button>
      <button class="btn btn-primary" onclick="saveFamilyLink(${patientId})">${ar ? 'حفظ' : 'Save'}</button></div>`, { maxWidth: 520 });
}
function saveFamilyLink(patientId) {
  const u = getCurrentUser();
  const g = document.getElementById('fam-guar').value;
  try {
    dbRun('UPDATE patients SET guarantor_id=? WHERE patient_id=?', [g ? parseInt(g, 10) : null, patientId]);
    logAction('FAMILY_LINK', `${u.full_name_en} ${g ? 'linked' : 'unlinked'} a family guarantor`, null, patientId);
    dlog('family.link', { patientId, guarantor: g || null }); saveDBToIndexedDB(); closeModal();
    showSuccess(currentLanguage() === 'ar' ? 'تم الحفظ' : 'Saved');
    if (typeof currentView === 'string') navigateTo(currentView);
  } catch (e) { derr('family.link', e); showError(e.message); }
}

// ============================================================
// REFER TO SPECIALIST — creates a referral with a due-back date (shown in the
// manager's Reports). Lightweight; the clinical detail lives in the chart.
// ============================================================
function openReferSpecialist(patientId) {
  const ar = currentLanguage() === 'ar';
  const specs = dbAll("SELECT user_id, full_name_en, full_name_ar, specialization FROM users WHERE role IN ('specialist') AND is_active=1");
  const opts = specs.map(s => `<option value="${s.user_id}">${escapeHtml(ar ? s.full_name_ar : s.full_name_en)}${s.specialization ? ` — ${escapeHtml(s.specialization)}` : ''}</option>`).join('');
  showModal(`<h2 style="margin-top:0">↪️ ${ar ? 'إحالة لأخصائي' : 'Refer to specialist'}</h2>
    <div class="form-group"><label>${ar ? 'الأخصائي' : 'Specialist'}</label><select id="rf-spec">${opts || `<option value="">${ar ? 'لا يوجد' : 'None'}</option>`}</select></div>
    <div class="form-group"><label>${ar ? 'السبب' : 'Reason'}</label><input id="rf-reason" placeholder="${ar ? 'مثل: خلع ضرس عقل منطمر' : 'e.g. Impacted wisdom tooth'}"></div>
    <div class="form-group"><label>${ar ? 'تاريخ العودة المتوقع' : 'Expected back on'}</label><input id="rf-due" type="date" value="${_addDays(_today(), 30)}"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button class="btn btn-secondary" onclick="closeModal()">${t('cancel') || 'Cancel'}</button>
      <button class="btn btn-primary" onclick="saveReferral(${patientId})">${ar ? 'إحالة' : 'Refer'}</button></div>`, { maxWidth: 520 });
}
function saveReferral(patientId) {
  const ar = currentLanguage() === 'ar'; const u = getCurrentUser();
  const spec = document.getElementById('rf-spec').value;
  const reason = document.getElementById('rf-reason').value.trim();
  if (!reason) { showError(ar ? 'السبب مطلوب' : 'Reason required'); return; }
  try {
    dbRun('INSERT INTO referrals (patient_id, from_user, reason, urgency, status, created_at, due_back_date) VALUES (?,?,?,?,?,?,?)',
      [patientId, u.user_id, reason, 'routine', 'open', nowISO(), document.getElementById('rf-due').value]);
    logAction('REFERRAL_MADE', `${u.full_name_en} referred a patient to a specialist: ${reason}`, null, patientId);
    dlog('referral.make', { patientId, spec }); saveDBToIndexedDB(); closeModal();
    showSuccess(ar ? 'تمت الإحالة' : 'Referral created');
  } catch (e) { derr('referral.make', e); showError(e.message); }
}
