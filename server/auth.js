'use strict';
// Server-side authentication. Passwords use scrypt (a real memory-hard KDF via
// Node's built-in crypto — no native dep). Argon2id is the ideal and can be
// swapped in if `argon2` is installed; scrypt is the dependency-free baseline and
// is a genuine password KDF (unlike the browser app's salted SHA-256).
const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const SESSION_MS = 8 * 60 * 60 * 1000;  // absolute lifetime
const IDLE_MS    = 30 * 60 * 1000;      // idle timeout
const MAX_FAILS  = 5;
const WINDOW_MS  = 5 * 60 * 1000;
const LOCK_MS    = 5 * 60 * 1000;
const MIN_PW     = 12;                   // NIST-ish floor for server-set passwords

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(pw, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${dk.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const dk = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length, { N: +N, r: +r, p: +p });
    return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
  } catch (e) { return false; }
}

// ---- server-side throttling (stored in DB, outside any browser's control) ----
function isLockedOut(db, account, now = Date.now()) {
  db.prepare('DELETE FROM login_attempts WHERE attempt_ms < ?').run(now - WINDOW_MS);
  const fails = db.prepare('SELECT COUNT(*) c FROM login_attempts WHERE account=? AND success=0').get(account).c;
  if (fails >= MAX_FAILS) {
    const last = db.prepare('SELECT MAX(attempt_ms) m FROM login_attempts WHERE account=? AND success=0').get(account).m;
    if (last && now - last < LOCK_MS) return Math.ceil((LOCK_MS - (now - last)) / 1000);
  }
  return 0;
}
function recordAttempt(db, account, success, now = Date.now()) {
  db.prepare('INSERT INTO login_attempts (account, attempt_ms, success) VALUES (?,?,?)').run(account, now, success ? 1 : 0);
}

// ---- sessions (server-held; the browser only gets an opaque cookie id) ----
function createSession(db, userId, now = Date.now()) {
  const sid = crypto.randomBytes(32).toString('base64url');
  const iso = new Date(now).toISOString();
  db.prepare('INSERT INTO sessions (session_id,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)')
    .run(sid, userId, iso, new Date(now + SESSION_MS).toISOString(), iso);
  return sid;
}
// Validates: exists, not expired, not idle-timed-out, AND the user is still
// active. Disabling a user therefore revokes live sessions on next request —
// fixing the browser app's "is_active checked only at login".
function getSessionUser(db, sid, now = Date.now()) {
  if (!sid) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE session_id=?').get(sid);
  if (!s) return null;
  if (Date.parse(s.expires_at) < now || now - Date.parse(s.last_seen_at) > IDLE_MS) {
    destroySession(db, sid); return null;
  }
  const u = db.prepare('SELECT * FROM users WHERE user_id=?').get(s.user_id);
  if (!u || !u.is_active) { destroySession(db, sid); return null; }
  db.prepare('UPDATE sessions SET last_seen_at=? WHERE session_id=?').run(new Date(now).toISOString(), sid);
  return u;
}
function destroySession(db, sid) { db.prepare('DELETE FROM sessions WHERE session_id=?').run(sid); }
function revokeUserSessions(db, userId) { db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId); }

function createUser(db, { username, password, full_name, role, department_id }, now = Date.now()) {
  if (!password || password.length < MIN_PW) { const e = new Error('password_too_short'); e.code = 'WEAK_PW'; throw e; }
  const r = db.prepare(
    'INSERT INTO users (username,password_hash,full_name,role,department_id,is_active,created_at) VALUES (?,?,?,?,?,1,?)'
  ).run(username, hashPassword(password), full_name || '', role, department_id ?? null, new Date(now).toISOString());
  return Number(r.lastInsertRowid);
}
function setUserActive(db, userId, active) {
  db.prepare('UPDATE users SET is_active=? WHERE user_id=?').run(active ? 1 : 0, userId);
  if (!active) revokeUserSessions(db, userId);   // immediate revocation on disable
}

module.exports = {
  hashPassword, verifyPassword, isLockedOut, recordAttempt,
  createSession, getSessionUser, destroySession, revokeUserSessions,
  createUser, setUserActive, SESSION_MS, IDLE_MS, MIN_PW, MAX_FAILS,
};
