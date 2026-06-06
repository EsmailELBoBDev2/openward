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
// Clock-tamper detection. A client-only app can't trust the device clock, but
// two signals expose backdating without a server:
//   (1) a record whose time is BEHIND the most recent record, and
//   (2) the wall clock disagreeing with a MONOTONIC clock (performance.now(),
//       which the user can't move) since the session started — this catches a
//       clock change DURING the session in either direction, including the
//       "set the clock to just after the last record" trick that (1) alone misses.
// Neither is preventable in-sandbox; we make the attempt visible & tamper-evident.
const CLOCK_ANOMALY_TOLERANCE_MS = 120000; // 2 minutes (absorbs NTP/drift/suspend)

function _humanizeDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return s + 's';
  const m = Math.round(s / 60);
  if (m < 90) return m + 'm';
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

// Monotonic session anchor (performance.now() is immune to system-clock changes).
let _clockAnchorWall = null;
let _clockAnchorMono = null;
function _monoNow() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
function _computeDrift(anchorWall, anchorMono, nowWall, nowMono) {
  return nowWall - (anchorWall + (nowMono - anchorMono));  // ~0 if the clock only advanced normally
}
function _sessionClockDrift() {
  const nowWall = Date.now(), nowMono = _monoNow();
  if (_clockAnchorWall === null) { _clockAnchorWall = nowWall; _clockAnchorMono = nowMono; return 0; }
  return _computeDrift(_clockAnchorWall, _clockAnchorMono, nowWall, nowMono);
}

// Returns a human description of any clock anomaly, or '' if none. Pure: the
// in-session monotonic drift (ms) is passed in.
function _clockAnomalyNote(timestamp, lastTimestamp, drift) {
  const notes = [];
  if (lastTimestamp) {
    const backMs = Date.parse(lastTimestamp) - Date.parse(timestamp);
    if (backMs > CLOCK_ANOMALY_TOLERANCE_MS) notes.push(`${_humanizeDuration(backMs)} behind the previous record at ${lastTimestamp}`);
  }
  if (typeof drift === 'number' && Math.abs(drift) > CLOCK_ANOMALY_TOLERANCE_MS) {
    notes.push(`clock jumped ${drift < 0 ? 'back' : 'forward'} ${_humanizeDuration(Math.abs(drift))} during this session`);
  }
  return notes.join('; ');
}

// ---- Canonical hash input (delimiter-injection-proof) -----------------------
// The old format joined fields with '|', so moving a '|' between fields (e.g.
// action_type "LOGIN" + detail "SUCCESS"  ->  "LOGIN|S" + "UCCESS") produced an
// identical string and an identical hash — letting an attacker shift data
// between columns while keeping every row_hash (and thus an integrity receipt)
// intact. JSON-encoding the field array escapes any delimiter inside a field, so
// distinct field-tuples can never collide. 'v2' is a domain separator; log_id is
// deliberately NOT in the input so the hash can be computed BEFORE the insert.
function _canonicalHashInput(timestamp, userId, actionType, actionDetail, prevHash) {
  return JSON.stringify(['v2', timestamp, userId, actionType, actionDetail, prevHash]);
}
// Pre-v2 rows were hashed with this ambiguous '|' join (incl. log_id). Kept ONLY
// so existing chains still verify after the upgrade; never used for new writes.
function _legacyHashInput(logId, timestamp, userId, actionType, actionDetail, prevHash) {
  return `${logId}|${timestamp}|${userId}|${actionType}|${actionDetail}|${prevHash}`;
}

// Audit writes form a hash chain, so they MUST be serialized: if two writes
// interleaved at the `await sha256` below, both would read the same prev_hash and
// fork the chain. This promise chain runs them strictly one at a time.
let _bbLock = Promise.resolve();
function logToBlackbox(entry) {
  const run = _bbLock.then(() => _logToBlackboxInner(entry));
  _bbLock = run.then(() => {}, () => {});   // keep the lock alive even if a write throws
  return run;
}

async function _logToBlackboxInner(entry) {
  const timestamp = nowISO();

  const lastRow = dbGet('SELECT row_hash, timestamp FROM audit_log ORDER BY log_id DESC LIMIT 1');
  const prevHash = lastRow ? lastRow.row_hash : 'GENESIS';

  // Fold any clock anomaly into action_detail — it is part of the signed row_hash,
  // so a backdated entry can't be made to look clean without breaking verification.
  let action_detail = entry.action_detail;
  let action_detail_ar = entry.action_detail_ar || null;
  const anomaly = _clockAnomalyNote(timestamp, lastRow ? lastRow.timestamp : null, _sessionClockDrift());
  if (anomaly) {
    action_detail += ` [⚠ CLOCK ANOMALY: ${anomaly}]`;
    if (action_detail_ar) action_detail_ar += ` [⚠ خلل بالساعة: ${anomaly}]`;
  }

  // Compute the hash BEFORE writing, so a half-hashed row ('COMPUTING') can never
  // be persisted by a concurrent save during the await. Single INSERT with the
  // final hash — no placeholder, no follow-up UPDATE.
  const rowHash = await sha256(_canonicalHashInput(timestamp, entry.user_id, entry.action_type, action_detail, prevHash));

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
    rowHash
  ]);

  const logId = dbLastId();
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

    // Accept the canonical (v2) hash; fall back to the legacy '|' format so chains
    // written before the canonicalization upgrade still verify.
    const canonical = await sha256(_canonicalHashInput(row.timestamp, row.user_id, row.action_type, row.action_detail, row.prev_hash));
    let ok = (row.row_hash === canonical);
    if (!ok) {
      const legacy = await sha256(_legacyHashInput(row.log_id, row.timestamp, row.user_id, row.action_type, row.action_detail, row.prev_hash));
      ok = (row.row_hash === legacy);
    }
    if (!ok) {
      return { valid: false, brokenAt: row.log_id, totalRows: rows.length, reason: 'row_hash mismatch' };
    }

    prevHash = row.row_hash;
  }

  return { valid: true, brokenAt: null, totalRows: rows.length };
}

// ---- External-anchor integrity receipt --------------------------------------
// A keyless SHA-256 hash chain is tamper-EVIDENT only against PARTIAL edits: an
// insider with DB write access can rewrite a row AND recompute every downstream
// hash, after which verifyBlackboxIntegrity() passes (there is no secret key to
// forge). The only client-side defense is to record this receipt OUT OF BAND
// (print it, email compliance, write it down). verifyAgainstReceipt() later
// detects a recompute — the head hash at the receipt's log_id will have changed —
// or a truncation (the row count dropped).
function getIntegrityReceipt() {
  const head = dbGet('SELECT log_id, row_hash FROM audit_log ORDER BY log_id DESC LIMIT 1');
  const c = dbGet('SELECT COUNT(*) AS c FROM audit_log');
  return {
    head_log_id: head ? head.log_id : 0,
    head_hash: head ? head.row_hash : 'GENESIS',
    log_count: c ? c.c : 0,
    generated_at: nowISO()
  };
}

// Internal chain check PLUS comparison against a previously-recorded receipt —
// the only way to catch a full recompute. Returns the internal result extended
// with { matchesReceipt, receiptReason }.
async function verifyAgainstReceipt(receipt) {
  const internal = await verifyBlackboxIntegrity();
  let matchesReceipt = null, receiptReason = null;
  if (receipt && typeof receipt.head_log_id === 'number') {
    matchesReceipt = true;
    const c = dbGet('SELECT COUNT(*) AS c FROM audit_log');
    const count = c ? c.c : 0;
    if (count < receipt.log_count) {
      matchesReceipt = false; receiptReason = 'rows removed since the receipt (truncation)';
    } else {
      const at = dbGet('SELECT row_hash FROM audit_log WHERE log_id = ?', [receipt.head_log_id]);
      if (!at) { matchesReceipt = false; receiptReason = 'the receipt head row is missing'; }
      else if (at.row_hash !== receipt.head_hash) { matchesReceipt = false; receiptReason = 'history at/before the receipt was rewritten'; }
    }
  }
  return Object.assign({}, internal, { matchesReceipt, receiptReason });
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
// The audit trail is oversight-only. In a browser-only app this gate is advisory
// (a determined user can bypass client JS — the real fix is a native authority,
// see README), but it removes the trivially-open read and records denied attempts.
const AUDIT_READ_ROLES = ['it_admin', 'hospital_manager', 'consultant'];
function canReadAudit() {
  const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (u && AUDIT_READ_ROLES.includes(u.role)) return true;
  if (typeof logAction === 'function') {
    try { const r = logAction('AUDIT_ACCESS_DENIED', `Blocked audit-log read by ${u ? u.full_name_en + ' (' + u.role + ')' : 'unauthenticated user'}`); if (r && r.catch) r.catch(() => {}); } catch (e) {}
  }
  return false;
}

function queryBlackbox(filters = {}) {
  if (!canReadAudit()) return [];
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
  if (!canReadAudit()) return 0;
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
  module.exports = {
    _clockAnomalyNote, _humanizeDuration, _computeDrift, CLOCK_ANOMALY_TOLERANCE_MS,
    _canonicalHashInput, _legacyHashInput,
    logToBlackbox, verifyBlackboxIntegrity, getIntegrityReceipt, verifyAgainstReceipt
  };
}
