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
// Clock-tamper detection. This is a client-only app, so the device clock cannot
// be trusted; but a clock moved BACKWARD past the most recent record is the
// signature of a backdating attempt. We can't prevent it without a server — we
// flag it (tolerance below absorbs normal NTP/drift corrections).
const CLOCK_ANOMALY_TOLERANCE_MS = 120000; // 2 minutes

function _humanizeDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return s + 's';
  const m = Math.round(s / 60);
  if (m < 90) return m + 'm';
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

// Returns a human duration string if the device clock moved meaningfully BEHIND
// the last record (a backdating signal), or '' otherwise. Pure — exposed for tests.
function _clockAnomalyNote(timestamp, lastTimestamp) {
  if (!lastTimestamp) return '';
  const backMs = Date.parse(lastTimestamp) - Date.parse(timestamp);
  return backMs > CLOCK_ANOMALY_TOLERANCE_MS ? _humanizeDuration(backMs) : '';
}

async function logToBlackbox(entry) {
  const timestamp = nowISO();

  // Get previous hash + timestamp (timestamp is also used for clock-tamper check)
  const lastRow = dbGet('SELECT row_hash, timestamp FROM audit_log ORDER BY log_id DESC LIMIT 1');
  const prevHash = lastRow ? lastRow.row_hash : 'GENESIS';

  // If the device clock has moved backward vs. the last record, fold a note into
  // action_detail. Because action_detail is part of the signed row_hash, the
  // anomaly becomes permanent and tamper-evident in the chain — a backdated
  // entry can't be made to look clean without breaking hash verification.
  let action_detail = entry.action_detail;
  let action_detail_ar = entry.action_detail_ar || null;
  if (lastRow && lastRow.timestamp) {
    const h = _clockAnomalyNote(timestamp, lastRow.timestamp);
    if (h) {
      action_detail += ` [⚠ CLOCK ANOMALY: device clock ${h} BEHIND the previous record at ${lastRow.timestamp}]`;
      if (action_detail_ar) action_detail_ar += ` [⚠ خلل بالساعة: ساعة الجهاز متأخرة ${h} عن آخر سجل في ${lastRow.timestamp}]`;
    }
  }

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
    action_detail,
    action_detail_ar,
    null, // ip_address not available in browser
    prevHash,
    'COMPUTING'
  ]);

  const logId = dbLastId();

  // Compute row_hash = SHA256(log_id|timestamp|user_id|action_type|action_detail|prev_hash)
  const hashInput = `${logId}|${timestamp}|${entry.user_id}|${entry.action_type}|${action_detail}|${prevHash}`;
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

// Node test harness only (the browser has no `module`):
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _clockAnomalyNote, _humanizeDuration, CLOCK_ANOMALY_TOLERANCE_MS };
}
