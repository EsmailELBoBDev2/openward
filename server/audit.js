'use strict';
// Append-only audit with an HMAC chain. Unlike the browser app's keyless SHA-256
// chain (which a DB-editing insider could recompute), the signing key lives
// OUTSIDE the database — in an env var or a 0600 key file owned by the service
// account. Someone who can edit audit_log still can't forge a valid HMAC.
// Canonical JSON input (no delimiter ambiguity).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadKey(dataDir) {
  if (process.env.OPENWARD_AUDIT_KEY) return Buffer.from(process.env.OPENWARD_AUDIT_KEY, 'utf8');
  const keyPath = path.join(dataDir, 'audit.key');
  try {
    return fs.readFileSync(keyPath);
  } catch (e) {
    const k = crypto.randomBytes(32);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(keyPath, k, { mode: 0o600 });
    return k;
  }
}

function rowHmac(key, logId, ts, userId, action, detail, prevHash) {
  const input = JSON.stringify(['v1', logId, ts, userId ?? null, action, detail || '', prevHash]);
  return crypto.createHmac('sha256', key).update(input).digest('hex');
}

// Single INSERT with the final hash (no 'COMPUTING' placeholder). node:sqlite is
// synchronous so the MAX(log_id)+1 read and the INSERT cannot interleave; wrap in
// a transaction once this goes multi-process.
function appendAudit(db, key, { user_id, action, detail }, now = Date.now()) {
  const ts = new Date(now).toISOString();
  const last = db.prepare('SELECT row_hash FROM audit_log ORDER BY log_id DESC LIMIT 1').get();
  const prevHash = last ? last.row_hash : 'GENESIS';
  const logId = (db.prepare('SELECT COALESCE(MAX(log_id),0) m FROM audit_log').get().m) + 1;
  const rowHash = rowHmac(key, logId, ts, user_id, action, detail, prevHash);
  db.prepare('INSERT INTO audit_log (log_id,ts,user_id,action,detail,prev_hash,row_hash) VALUES (?,?,?,?,?,?,?)')
    .run(logId, ts, user_id ?? null, action, detail || '', prevHash, rowHash);
  return logId;
}

function verifyAuditChain(db, key) {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY log_id ASC').all();
  let prev = 'GENESIS';
  for (const r of rows) {
    if (r.prev_hash !== prev) return { valid: false, brokenAt: r.log_id, reason: 'prev_hash mismatch' };
    if (r.row_hash !== rowHmac(key, r.log_id, r.ts, r.user_id, r.action, r.detail, r.prev_hash))
      return { valid: false, brokenAt: r.log_id, reason: 'row_hash mismatch' };
    prev = r.row_hash;
  }
  return { valid: true, count: rows.length };
}

module.exports = { loadKey, appendAudit, verifyAuditChain, rowHmac };
