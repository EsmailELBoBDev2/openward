// ============================================================
// HIS — Authentication & Session Management
// ============================================================

const SESSION_KEY = 'his_session_id';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

// ============================================================
// Brute-force protection
// 5 failed attempts within 5 min → lockout for 5 min per username
// PERSISTED to localStorage so F5/new tab doesn't reset the counter (G1 fix)
// GLOBAL cap: 30 failures across all usernames in 5 min → blocked
// (defeats username-cycling: admin1, admin2, admin3... bypass)
// ============================================================
const ATTEMPTS_KEY = 'his_login_attempts';
const MAX_FAILED_ATTEMPTS = 5;
const MAX_GLOBAL_ATTEMPTS = 30;
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;

function _loadAttempts() {
  try { return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{}'); } catch(e) { return {}; }
}
function _saveAttempts(obj) {
  try { localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(obj)); } catch(e) {}
}

function _isLockedOut(username) {
  const now = Date.now();
  const data = _loadAttempts();
  const userAttempts = (data[username] || []).filter(t => now - t < LOCKOUT_WINDOW_MS);
  data[username] = userAttempts;

  // Per-username lockout
  if (userAttempts.length >= MAX_FAILED_ATTEMPTS) {
    const lastFail = userAttempts[userAttempts.length - 1];
    if (now - lastFail < LOCKOUT_DURATION_MS) {
      _saveAttempts(data);
      return Math.ceil((LOCKOUT_DURATION_MS - (now - lastFail)) / 1000);
    }
  }

  // Global cap — prevents username-cycling (admin, admin1, admin2, ...)
  let globalCount = 0;
  for (const u of Object.keys(data)) {
    data[u] = (data[u] || []).filter(t => now - t < LOCKOUT_WINDOW_MS);
    globalCount += data[u].length;
  }
  _saveAttempts(data);
  if (globalCount >= MAX_GLOBAL_ATTEMPTS) {
    return Math.ceil(LOCKOUT_DURATION_MS / 1000);
  }
  return 0;
}

function _recordFailedLogin(username) {
  const data = _loadAttempts();
  if (!data[username]) data[username] = [];
  data[username].push(Date.now());
  _saveAttempts(data);
}

function _clearFailedAttempts(username) {
  const data = _loadAttempts();
  delete data[username];
  _saveAttempts(data);
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
    _recordFailedLogin(username);
    return { success: false, errorKey: 'login_error_cred' };
  }

  // Check password
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.password_hash) {
    _recordFailedLogin(username);
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
async function loginPatient(mrn, dob) {
  // Normalize MRN (uppercase, trim)
  mrn = (mrn || '').trim().toUpperCase();
  dob = (dob || '').trim();

  if (!mrn || !dob) {
    return { success: false, errorKey: 'error_required' };
  }

  const patient = dbGet('SELECT * FROM patients WHERE UPPER(mrn) = ?', [mrn]);
  if (!patient) {
    return { success: false, errorKey: 'patient_login_error' };
  }

  // Verify DOB matches (defense against MRN-only enumeration)
  if (!patient.date_of_birth || patient.date_of_birth !== dob) {
    return { success: false, errorKey: 'patient_login_error' };
  }

  // Check portal enabled
  if (patient.portal_enabled === 0) {
    return { success: false, errorKey: 'patient_portal_disabled' };
  }

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
  return { success: true, patient, sessionId };
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
