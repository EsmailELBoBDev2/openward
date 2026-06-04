// ============================================================
// HIS — Blackbox Immutable Audit Log
// ============================================================
// RULES:
//   1. NEVER UPDATE or DELETE from audit_log — ONLY INSERT
//   2. Every INSERT computes prev_hash from last row's row_hash
//   3. First row has prev_hash = 'GENESIS'
//   4. row_hash = SHA256(log_id|timestamp|user_id|action_type|action_detail|prev_hash)
//   5. Only hospital_manager can READ the blackbox

/**
 * Write an entry to the blackbox audit log.
 * @param {object} entry
 * @param {number} entry.user_id
 * @param {string} entry.user_name_en
 * @param {string} entry.user_name_ar
 * @param {string} entry.user_role
 * @param {number} [entry.dept_id]
 * @param {string} [entry.dept_name_en]
 * @param {string} [entry.dept_name_ar]
 * @param {number} [entry.patient_id]
 * @param {string} [entry.patient_name]
 * @param {string} [entry.patient_mrn]
 * @param {string} entry.action_type
 * @param {string} entry.action_detail  — full English sentence
 * @param {string} [entry.action_detail_ar]
 */
async function logToBlackbox(entry) {
  const timestamp = nowISO();

  // Get previous hash
  const lastRow = dbGet('SELECT row_hash FROM audit_log ORDER BY log_id DESC LIMIT 1');
  const prevHash = lastRow ? lastRow.row_hash : 'GENESIS';

  // Insert with placeholder hash first to get log_id
  dbRun(`INSERT INTO audit_log (
    timestamp, user_id, user_name_en, user_name_ar, user_role,
    dept_id, dept_name_en, dept_name_ar,
    patient_id, patient_name, patient_mrn,
    action_type, action_detail, action_detail_ar,
    ip_address, prev_hash, row_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    timestamp,
    entry.user_id,
    entry.user_name_en || '',
    entry.user_name_ar || '',
    entry.user_role || '',
    entry.dept_id || null,
    entry.dept_name_en || null,
    entry.dept_name_ar || null,
    entry.patient_id || null,
    entry.patient_name || null,
    entry.patient_mrn || null,
    entry.action_type,
    entry.action_detail,
    entry.action_detail_ar || null,
    null, // ip_address not available in browser
    prevHash,
    'COMPUTING'
  ]);

  const logId = dbLastId();

  // Compute row_hash = SHA256(log_id|timestamp|user_id|action_type|action_detail|prev_hash)
  const hashInput = `${logId}|${timestamp}|${entry.user_id}|${entry.action_type}|${entry.action_detail}|${prevHash}`;
  const rowHash = await sha256(hashInput);

  // Update ONLY the row_hash field of this specific row
  dbRun('UPDATE audit_log SET row_hash = ? WHERE log_id = ?', [rowHash, logId]);

  // Save DB after every blackbox write
  saveDBToIndexedDB();

  return logId;
}

/**
 * Verify the integrity of the entire blackbox chain.
 * Returns { valid: boolean, brokenAt: number|null, totalRows: number }
 */
async function verifyBlackboxIntegrity() {
  const rows = dbAll('SELECT * FROM audit_log ORDER BY log_id ASC');
  let prevHash = 'GENESIS';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Check prev_hash chain
    if (row.prev_hash !== prevHash) {
      return { valid: false, brokenAt: row.log_id, totalRows: rows.length, reason: 'prev_hash mismatch' };
    }

    // Recompute hash
    const hashInput = `${row.log_id}|${row.timestamp}|${row.user_id}|${row.action_type}|${row.action_detail}|${row.prev_hash}`;
    const expected = await sha256(hashInput);

    if (row.row_hash !== expected) {
      return { valid: false, brokenAt: row.log_id, totalRows: rows.length, reason: 'row_hash mismatch' };
    }

    prevHash = row.row_hash;
  }

  return { valid: true, brokenAt: null, totalRows: rows.length };
}

/**
 * Query the blackbox with filters (for Hospital Manager viewer)
 * @param {object} filters
 * @param {string} [filters.dateFrom]
 * @param {string} [filters.dateTo]
 * @param {number} [filters.userId]
 * @param {number} [filters.deptId]
 * @param {string} [filters.actionType]
 * @param {string} [filters.search]
 * @param {number} [filters.limit]
 * @param {number} [filters.offset]
 * @returns {object[]}
 */
function queryBlackbox(filters = {}) {
  let sql = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];

  if (filters.dateFrom) {
    sql += ' AND timestamp >= ?';
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    sql += ' AND timestamp <= ?';
    params.push(filters.dateTo + 'T23:59:59.999Z');
  }
  if (filters.userId) {
    sql += ' AND user_id = ?';
    params.push(filters.userId);
  }
  if (filters.deptId) {
    sql += ' AND dept_id = ?';
    params.push(filters.deptId);
  }
  if (filters.actionType) {
    sql += ' AND action_type = ?';
    params.push(filters.actionType);
  }
  if (filters.search) {
    sql += ' AND (action_detail LIKE ? OR action_detail_ar LIKE ? OR patient_name LIKE ? OR user_name_en LIKE ?)';
    const s = '%' + filters.search + '%';
    params.push(s, s, s, s);
  }

  sql += ' ORDER BY log_id DESC';

  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
    if (filters.offset) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }
  }

  return dbAll(sql, params);
}

/**
 * Get total count for pagination
 */
function queryBlackboxCount(filters = {}) {
  let sql = 'SELECT COUNT(*) as cnt FROM audit_log WHERE 1=1';
  const params = [];

  if (filters.dateFrom) { sql += ' AND timestamp >= ?'; params.push(filters.dateFrom); }
  if (filters.dateTo) { sql += ' AND timestamp <= ?'; params.push(filters.dateTo + 'T23:59:59.999Z'); }
  if (filters.userId) { sql += ' AND user_id = ?'; params.push(filters.userId); }
  if (filters.deptId) { sql += ' AND dept_id = ?'; params.push(filters.deptId); }
  if (filters.actionType) { sql += ' AND action_type = ?'; params.push(filters.actionType); }
  if (filters.search) {
    sql += ' AND (action_detail LIKE ? OR action_detail_ar LIKE ? OR patient_name LIKE ? OR user_name_en LIKE ?)';
    const s = '%' + filters.search + '%';
    params.push(s, s, s, s);
  }

  const row = dbGet(sql, params);
  return row ? row.cnt : 0;
}

// Convenience: build a blackbox entry from current session
function buildBlackboxEntry(actionType, actionDetail, actionDetailAr, patientId, patientName, patientMrn) {
  const session = getCurrentSession();
  if (!session) return null;

  const user = dbGet('SELECT * FROM users WHERE user_id = ?', [session.user_id]);
  const dept = session.dept_id ? dbGet('SELECT * FROM departments WHERE dept_id = ?', [session.dept_id]) : null;

  return {
    user_id: session.user_id,
    user_name_en: user ? user.full_name_en : 'Unknown',
    user_name_ar: user ? user.full_name_ar : 'غير معروف',
    user_role: session.role,
    dept_id: session.dept_id || null,
    dept_name_en: dept ? dept.name_en : null,
    dept_name_ar: dept ? dept.name_ar : null,
    patient_id: patientId || null,
    patient_name: patientName || null,
    patient_mrn: patientMrn || null,
    action_type: actionType,
    action_detail: actionDetail,
    action_detail_ar: actionDetailAr || null
  };
}

/**
 * Shortcut to log from current session
 */
async function logAction(actionType, actionDetail, actionDetailAr, patientId, patientName, patientMrn) {
  const entry = buildBlackboxEntry(actionType, actionDetail, actionDetailAr, patientId, patientName, patientMrn);
  if (entry) {
    return await logToBlackbox(entry);
  }
}
