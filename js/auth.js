// ============================================================
// HIS — Authentication & Session Management
// ============================================================

const SESSION_KEY = 'his_session_id';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

// ============================================================
// Brute-force protection
// 5 failed attempts within 5 min → lockout for 5 min per account
// GLOBAL cap: 30 failures across all accounts in 5 min → blocked
// (defeats account-cycling: admin1, admin2, admin3... bypass)
//
// Attempts live in the DB (table login_attempts), NOT localStorage: a
// localStorage.clear() in DevTools no longer resets the counter, and the
// lockout survives a page refresh because it is persisted with the database.
// `account` namespaces staff usernames from patient-portal logins, which use
// the key 'patient:<MRN>' (see loginPatient).
// NOTE: this is still a client-only app — a determined user can edit the
// IndexedDB SQLite blob directly — but the cheap localStorage reset is closed.
// ============================================================
const MAX_FAILED_ATTEMPTS = 5;
const MAX_GLOBAL_ATTEMPTS = 30;
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;

function _pruneOldAttempts(now) {
  try { dbRun('DELETE FROM login_attempts WHERE attempt_ms < ?', [now - LOCKOUT_WINDOW_MS]); } catch (e) {}
}

// Returns seconds remaining on the lockout, or 0 if not locked.
function _isLockedOut(account) {
  const now = Date.now();
  _pruneOldAttempts(now);

  // Per-account lockout
  const rows = dbAll('SELECT attempt_ms FROM login_attempts WHERE account = ? ORDER BY attempt_ms', [account]);
  if (rows.length >= MAX_FAILED_ATTEMPTS) {
    const lastFail = rows[rows.length - 1].attempt_ms;
    if (now - lastFail < LOCKOUT_DURATION_MS) {
      return Math.ceil((LOCKOUT_DURATION_MS - (now - lastFail)) / 1000);
    }
  }

  // Global cap — defeats account-cycling (admin, admin1, admin2, ...)
  const g = dbGet('SELECT COUNT(*) AS c FROM login_attempts', []);
  if (g && g.c >= MAX_GLOBAL_ATTEMPTS) {
    return Math.ceil(LOCKOUT_DURATION_MS / 1000);
  }
  return 0;
}

// async: persists immediately so the counter can't be bypassed by refreshing
// before the next autosave fires.
async function _recordFailedLogin(account) {
  try { dbRun('INSERT INTO login_attempts (account, attempt_ms) VALUES (?, ?)', [account, Date.now()]); } catch (e) {}
  await saveDBToIndexedDB();
}

function _clearFailedAttempts(account) {
  try { dbRun('DELETE FROM login_attempts WHERE account = ?', [account]); } catch (e) {}
}

/**
 * Attempt to log in a user
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string, errorKey?: string}>}
 */
async function login(username, password) {
  // ---- Brute-force protection ----
  const lockedSec = _isLockedOut(username);
  if (lockedSec > 0) {
    return { success: false, errorKey: 'login_locked', lockedSec };
  }

  const user = dbGet('SELECT * FROM users WHERE username = ?', [username]);

  if (!user) {
    await _recordFailedLogin(username);
    return { success: false, errorKey: 'login_error_cred' };
  }

  // Check password
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.password_hash) {
    await _recordFailedLogin(username);
    return { success: false, errorKey: 'login_error_cred' };
  }

  // Check if active
  if (!user.is_active) {
    return { success: false, errorKey: 'login_error_disabled' };
  }

  // Successful login — clear failed attempts
  _clearFailedAttempts(username);

  // G7 fix: notify if user already has active sessions elsewhere
  const existingSessions = dbAll(`SELECT session_id, login_time FROM sessions WHERE user_id = ? AND expires_at > ?`, [user.user_id, nowISO()]);
  const concurrentCount = existingSessions.length;

  // Create session
  const sessionId = generateUUID();
  const now = nowISO();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  dbRun(`INSERT INTO sessions (session_id, user_id, role, dept_id, login_time, last_active, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, user.user_id, user.role, user.department_id, now, now, expiresAt]
  );

  // Update last_login
  dbRun('UPDATE users SET last_login = ? WHERE user_id = ?', [now, user.user_id]);

  // Store session in localStorage
  localStorage.setItem(SESSION_KEY, sessionId);

  // Get department info for blackbox
  const dept = user.department_id ? dbGet('SELECT * FROM departments WHERE dept_id = ?', [user.department_id]) : null;

  // Log to blackbox
  await logToBlackbox({
    user_id: user.user_id,
    user_name_en: user.full_name_en,
    user_name_ar: user.full_name_ar,
    user_role: user.role,
    dept_id: user.department_id,
    dept_name_en: dept ? dept.name_en : null,
    dept_name_ar: dept ? dept.name_ar : null,
    action_type: 'LOGIN',
    action_detail: `User ${user.full_name_en} (${ROLES[user.role] ? ROLES[user.role].en : user.role}) logged in from department ${dept ? dept.name_en : 'N/A'}`,
    action_detail_ar: `المستخدم ${user.full_name_ar} (${ROLES[user.role] ? ROLES[user.role].ar : user.role}) سجل الدخول من قسم ${dept ? dept.name_ar : 'غير محدد'}`
  });

  saveDBToIndexedDB();

  return { success: true, user, sessionId, concurrentSessions: concurrentCount };
}

/**
 * Log out the current user
 */
async function logout() {
  const session = getCurrentSession();
  if (session) {
    const user = dbGet('SELECT * FROM users WHERE user_id = ?', [session.user_id]);
    const loginTime = new Date(session.login_time);
    const minutes = Math.round((Date.now() - loginTime.getTime()) / 60000);

    // Log to blackbox before destroying session
    if (user) {
      const dept = session.dept_id ? dbGet('SELECT * FROM departments WHERE dept_id = ?', [session.dept_id]) : null;
      await logToBlackbox({
        user_id: session.user_id,
        user_name_en: user.full_name_en,
        user_name_ar: user.full_name_ar,
        user_role: session.role,
        dept_id: session.dept_id,
        dept_name_en: dept ? dept.name_en : null,
        dept_name_ar: dept ? dept.name_ar : null,
        action_type: 'LOGOUT',
        action_detail: `User ${user.full_name_en} logged out after ${minutes} minutes`,
        action_detail_ar: `المستخدم ${user.full_name_ar} سجل الخروج بعد ${minutes} دقيقة`
      });
    }

    // Delete session
    dbRun('DELETE FROM sessions WHERE session_id = ?', [session.session_id]);
  }

  localStorage.removeItem(SESSION_KEY);
  // Clean up background timers (notification inbox poller) to prevent leak between sessions
  if (typeof _inboxRefreshTimer !== 'undefined' && _inboxRefreshTimer) {
    clearInterval(_inboxRefreshTimer);
    _inboxRefreshTimer = null;
  }
  // Hide the inbox UI immediately
  const ib = document.getElementById('staff-inbox-wrap');
  if (ib) ib.style.display = 'none';
  const dd = document.getElementById('staff-inbox-dropdown');
  if (dd) dd.style.display = 'none';
  saveDBToIndexedDB();
}

/**
 * Get current active session, or null if expired/invalid
 * @returns {object|null} session row
 */
function getCurrentSession() {
  const sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) return null;

  const session = dbGet('SELECT * FROM sessions WHERE session_id = ?', [sessionId]);
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }

  // Check expiration
  if (new Date(session.expires_at) < new Date()) {
    dbRun('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
    localStorage.removeItem(SESSION_KEY);
    return null;
  }

  // Update last_active
  dbRun('UPDATE sessions SET last_active = ? WHERE session_id = ?', [nowISO(), sessionId]);

  return session;
}

/**
 * Get current user from session
 * @returns {object|null}
 */
function getCurrentUser() {
  const session = getCurrentSession();
  if (!session) return null;
  return dbGet('SELECT * FROM users WHERE user_id = ?', [session.user_id]);
}

/**
 * Get active sessions count
 * @returns {number}
 */
function getActiveSessionsCount() {
  const row = dbGet('SELECT COUNT(*) as cnt FROM sessions WHERE expires_at > ?', [nowISO()]);
  return row ? row.cnt : 0;
}

/**
 * Create a new user account (IT Admin only)
 * @param {object} userData
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function createUser(userData) {
  // Enforce "IT Admin only". Advisory in a browser-only app (a determined user
  // can bypass client JS — the real fix is a native authority), but no longer a
  // no-op: non-admin callers are refused and the attempt is logged.
  const actor = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (!actor || actor.role !== 'it_admin') {
    try { const r = logAction('USER_CREATE_DENIED', `Blocked account creation by ${actor ? actor.full_name_en + ' (' + actor.role + ')' : 'unauthenticated user'}`); if (r && r.catch) r.catch(() => {}); } catch (e) {}
    return { success: false, errorKey: 'not_authorized' };
  }

  // Check username uniqueness
  const existing = dbGet('SELECT user_id FROM users WHERE username = ?', [userData.username]);
  if (existing) {
    return { success: false, errorKey: 'username_taken' };
  }

  const salt = generateSalt();
  const hash = await hashPassword(userData.password, salt);
  const session = getCurrentSession();

  dbRun(`INSERT INTO users (username, password_hash, salt, full_name_ar, full_name_en, role, department_id, specialization, is_active, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`, [
    userData.username,
    hash,
    salt,
    userData.full_name_ar,
    userData.full_name_en,
    userData.role,
    userData.department_id || null,
    userData.specialization || null,
    session ? session.user_id : null,
    nowISO()
  ]);

  const newUserId = dbLastId();
  const dept = userData.department_id ? dbGet('SELECT * FROM departments WHERE dept_id = ?', [userData.department_id]) : null;

  await logAction(
    'USER_CREATED',
    `IT Admin ${getCurrentUser().full_name_en} created account for ${userData.full_name_en} with role ${ROLES[userData.role] ? ROLES[userData.role].en : userData.role} in department ${dept ? dept.name_en : 'N/A'}`,
    `مدير النظام ${getCurrentUser().full_name_ar} أنشأ حساب ${userData.full_name_ar} بدور ${ROLES[userData.role] ? ROLES[userData.role].ar : userData.role} في قسم ${dept ? dept.name_ar : 'غير محدد'}`
  );

  saveDBToIndexedDB();
  return { success: true, userId: newUserId };
}

/**
 * Update user account (IT Admin only)
 */
async function updateUser(userId, userData) {
  const existingUser = dbGet('SELECT * FROM users WHERE user_id = ?', [userId]);
  if (!existingUser) return { success: false, error: 'User not found' };

  // Check username uniqueness if changed
  if (userData.username !== existingUser.username) {
    const dup = dbGet('SELECT user_id FROM users WHERE username = ? AND user_id != ?', [userData.username, userId]);
    if (dup) return { success: false, errorKey: 'username_taken' };
  }

  let sql = `UPDATE users SET username = ?, full_name_ar = ?, full_name_en = ?, role = ?, department_id = ?, specialization = ? WHERE user_id = ?`;
  let params = [userData.username, userData.full_name_ar, userData.full_name_en, userData.role, userData.department_id || null, userData.specialization || null, userId];

  // If password is being changed
  if (userData.password) {
    const salt = generateSalt();
    const hash = await hashPassword(userData.password, salt);
    sql = `UPDATE users SET username = ?, full_name_ar = ?, full_name_en = ?, role = ?, department_id = ?, specialization = ?, password_hash = ?, salt = ? WHERE user_id = ?`;
    params = [userData.username, userData.full_name_ar, userData.full_name_en, userData.role, userData.department_id || null, userData.specialization || null, hash, salt, userId];
  }

  dbRun(sql, params);

  await logAction(
    'USER_UPDATED',
    `IT Admin ${getCurrentUser().full_name_en} updated account for ${userData.full_name_en}`,
    `مدير النظام ${getCurrentUser().full_name_ar} حدّث حساب ${userData.full_name_ar}`
  );

  saveDBToIndexedDB();
  return { success: true };
}

/**
 * Patient Portal Login
 * Initial credential: MRN + Date of Birth (YYYY-MM-DD)
 * After first login, patient may set a password (future enhancement)
 * @param {string} mrn  - Medical Record Number (e.g., HIS-20260419-00001)
 * @param {string} dob  - Date of birth in YYYY-MM-DD format
 * @returns {Promise<{success: boolean, errorKey?: string}>}
 */
async function loginPatient(mrn, dob, password) {
  // Normalize MRN (uppercase, trim)
  mrn = (mrn || '').trim().toUpperCase();
  dob = (dob || '').trim();

  if (!mrn || !dob) {
    return { success: false, errorKey: 'error_required' };
  }

  // ---- Brute-force protection (same throttle as staff login) ----
  // MRN + DOB are guessable (often printed on wristbands), so the portal must
  // throttle guessing too. Account key is namespaced to avoid colliding with
  // staff usernames.
  const acct = 'patient:' + mrn;
  const lockedSec = _isLockedOut(acct);
  if (lockedSec > 0) {
    return { success: false, errorKey: 'login_locked', lockedSec };
  }

  const patient = dbGet('SELECT * FROM patients WHERE UPPER(mrn) = ?', [mrn]);
  if (!patient) {
    await _recordFailedLogin(acct);
    return { success: false, errorKey: 'patient_login_error' };
  }

  // Verify DOB matches (defense against MRN-only enumeration)
  if (!patient.date_of_birth || patient.date_of_birth !== dob) {
    await _recordFailedLogin(acct);
    return { success: false, errorKey: 'patient_login_error' };
  }

  // Check portal enabled
  if (patient.portal_enabled === 0) {
    return { success: false, errorKey: 'patient_portal_disabled' };
  }

  // MRN + DOB are IDENTITY (printed on the wristband), NOT authentication. If the
  // patient has set a portal password, REQUIRE it. If none is set, MRN+DOB grants
  // access but the caller is told to prompt for setup (mustSetPassword).
  if (patient.portal_password_hash) {
    if (!password) {
      return { success: false, errorKey: 'patient_password_required', needsPassword: true };
    }
    const ph = await hashPassword(password, patient.portal_salt || '');
    if (ph !== patient.portal_password_hash) {
      await _recordFailedLogin(acct);
      return { success: false, errorKey: 'patient_login_error', needsPassword: true };
    }
  }

  // Successful login — clear failed attempts
  _clearFailedAttempts(acct);

  // Create patient "session" (uses same sessions table with role='patient' and dept_id=null)
  // user_id stores patient_id, role='patient' marks this as a portal session
  const sessionId = generateUUID();
  const now = nowISO();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  dbRun(`INSERT INTO sessions (session_id, user_id, role, dept_id, login_time, last_active, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, patient.patient_id, 'patient', null, now, now, expiresAt]
  );

  localStorage.setItem(SESSION_KEY, sessionId);

  // Log to blackbox
  await logToBlackbox({
    user_id: patient.patient_id,
    user_name_en: patient.full_name_en || patient.full_name_ar,
    user_name_ar: patient.full_name_ar,
    user_role: 'patient',
    dept_id: null,
    dept_name_en: 'Patient Portal',
    dept_name_ar: 'بوابة المرضى',
    action_type: 'PORTAL_LOGIN',
    action_detail: `Patient ${patient.full_name_en || patient.full_name_ar} (MRN ${patient.mrn}) logged into Patient Portal`,
    action_detail_ar: `المريض ${patient.full_name_ar} (الرقم الطبي ${patient.mrn}) دخل إلى بوابة المرضى`
  });

  saveDBToIndexedDB();
  return { success: true, patient, sessionId, mustSetPassword: !patient.portal_password_hash };
}

/**
 * Set/change the current patient's portal password — real authentication layered
 * on top of the MRN+DOB identity check. Salted SHA-256 (same as staff accounts).
 */
async function setPatientPortalPassword(patientId, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    return { success: false, errorKey: 'password_too_short' };
  }
  const salt = generateSalt();
  const hash = await hashPassword(newPassword, salt);
  dbRun('UPDATE patients SET portal_password_hash = ?, portal_salt = ? WHERE patient_id = ?', [hash, salt, patientId]);
  await logToBlackbox({
    user_id: patientId, user_role: 'patient',
    user_name_en: 'Patient', user_name_ar: 'مريض',
    dept_name_en: 'Patient Portal', dept_name_ar: 'بوابة المرضى',
    action_type: 'PORTAL_PASSWORD_SET',
    action_detail: 'Patient set or updated their portal password',
    action_detail_ar: 'قام المريض بتعيين أو تحديث كلمة مرور البوابة'
  });
  saveDBToIndexedDB();
  return { success: true };
}

/**
 * Get current patient (when logged in via Patient Portal)
 * Returns null if not a patient session.
 */
function getCurrentPatient() {
  const session = getCurrentSession();
  if (!session || session.role !== 'patient') return null;
  return dbGet('SELECT * FROM patients WHERE patient_id = ?', [session.user_id]);
}

/**
 * Toggle user active status
 */
async function toggleUserActive(userId) {
  const user = dbGet('SELECT * FROM users WHERE user_id = ?', [userId]);
  if (!user) return;

  const newStatus = user.is_active ? 0 : 1;
  dbRun('UPDATE users SET is_active = ? WHERE user_id = ?', [newStatus, userId]);

  const actionType = newStatus ? 'USER_ENABLED' : 'USER_DISABLED';
  const admin = getCurrentUser();
  await logAction(
    actionType,
    `IT Admin ${admin.full_name_en} ${newStatus ? 'enabled' : 'disabled'} account for ${user.full_name_en}`,
    `مدير النظام ${admin.full_name_ar} ${newStatus ? 'فعّل' : 'عطّل'} حساب ${user.full_name_ar}`
  );

  saveDBToIndexedDB();
}
