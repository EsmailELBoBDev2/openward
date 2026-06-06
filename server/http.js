'use strict';
// HTTP layer (Node built-in http). The browser is an untrusted client: every
// protected route validates the server session and checks the RBAC capability
// here, server-side. Sessions are opaque HttpOnly cookies; the DB never leaves
// the service.
const http = require('http');
const fs = require('fs');
const path = require('path');
const auth = require('./auth');
const rbac = require('./rbac');
const audit = require('./audit');

const COOKIE = 'ow_sid';
const SECHEADERS = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function readJson(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let data = '', size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { req.destroy(); reject(new Error('too_large')); } else data += c; });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function sendJson(res, code, obj, extra) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, SECHEADERS, extra || {}));
  res.end(JSON.stringify(obj));
}
const publicUser = u => ({ user_id: u.user_id, username: u.username, full_name: u.full_name, role: u.role, department_id: u.department_id });

async function handle(req, res, db, auditKey, staticDir) {
  const url = new URL(req.url, 'http://localhost');
  const secure = !!req.socket.encrypted;                       // Secure cookie only over TLS
  const cookieAttrs = `HttpOnly; SameSite=Strict; Path=/${secure ? '; Secure' : ''}`;
  if (url.pathname.startsWith('/api/')) return api(req, res, db, auditKey, url, cookieAttrs);
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  return serveStatic(res, staticDir, url.pathname);
}

async function api(req, res, db, auditKey, url, cookieAttrs) {
  const sid = parseCookies(req)[COOKIE];
  const p = url.pathname;

  if (p === '/api/login' && req.method === 'POST') {
    let body; try { body = await readJson(req); } catch (e) { return sendJson(res, 400, { error: 'bad_json' }); }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const locked = auth.isLockedOut(db, username);
    if (locked > 0) return sendJson(res, 429, { error: 'locked', retryAfterSec: locked });
    const u = username ? db.prepare('SELECT * FROM users WHERE username=?').get(username) : null;
    if (!u || !u.is_active || !auth.verifyPassword(password, u.password_hash)) {
      auth.recordAttempt(db, username, false);
      audit.appendAudit(db, auditKey, { user_id: u ? u.user_id : null, action: 'LOGIN_FAILED', detail: username });
      return sendJson(res, 401, { error: 'invalid_credentials' });
    }
    auth.recordAttempt(db, username, true);
    const newSid = auth.createSession(db, u.user_id);
    audit.appendAudit(db, auditKey, { user_id: u.user_id, action: 'LOGIN', detail: u.username });
    return sendJson(res, 200, { user: publicUser(u) },
      { 'Set-Cookie': `${COOKIE}=${newSid}; ${cookieAttrs}; Max-Age=${Math.floor(auth.SESSION_MS / 1000)}` });
  }

  if (p === '/api/logout' && req.method === 'POST') {
    const u = auth.getSessionUser(db, sid);
    if (sid) auth.destroySession(db, sid);
    if (u) audit.appendAudit(db, auditKey, { user_id: u.user_id, action: 'LOGOUT', detail: u.username });
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; ${cookieAttrs}; Max-Age=0` });
  }

  // --- everything below requires a valid session ---
  const user = auth.getSessionUser(db, sid);
  if (!user) return sendJson(res, 401, { error: 'unauthenticated' });

  if (p === '/api/me' && req.method === 'GET') return sendJson(res, 200, { user: publicUser(user) });

  if (p === '/api/patients' && req.method === 'GET') {
    if (!rbac.can(user.role, 'patients:read')) return sendJson(res, 403, { error: 'forbidden' });
    const scope = rbac.patientScopeWhere(user);
    const rows = db.prepare(
      `SELECT p.patient_id, p.mrn, p.full_name, p.dob FROM patients p
         LEFT JOIN admissions a ON a.patient_id = p.patient_id AND a.status='active'
        WHERE ${scope.sql} GROUP BY p.patient_id ORDER BY p.full_name`
    ).all(...scope.params);
    audit.appendAudit(db, auditKey, { user_id: user.user_id, action: 'PATIENTS_READ', detail: `n=${rows.length}` });
    return sendJson(res, 200, { patients: rows });
  }

  if (p === '/api/audit' && req.method === 'GET') {
    if (!rbac.can(user.role, 'audit:read')) return sendJson(res, 403, { error: 'forbidden' });
    const rows = db.prepare('SELECT log_id, ts, user_id, action, detail FROM audit_log ORDER BY log_id DESC LIMIT 200').all();
    return sendJson(res, 200, { audit: rows, integrity: audit.verifyAuditChain(db, auditKey) });
  }

  return sendJson(res, 404, { error: 'not_found' });
}

function serveStatic(res, staticDir, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = path.normalize(path.join(staticDir, rel));
  if (!full.startsWith(path.normalize(staticDir + path.sep))) { res.writeHead(403, SECHEADERS); return res.end('forbidden'); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404, SECHEADERS); return res.end('not found'); }
    res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' }, SECHEADERS));
    res.end(buf);
  });
}

function createServer(ctx) {
  const { db, auditKey, staticDir } = ctx;
  return http.createServer((req, res) => {
    handle(req, res, db, auditKey, staticDir).catch(() => { try { sendJson(res, 500, { error: 'server_error' }); } catch (e) {} });
  });
}

module.exports = { createServer, handle, COOKIE };
