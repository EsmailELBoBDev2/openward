'use strict';
// OpenWard hospital-local service entry point.
//   node --experimental-sqlite server/index.js
// Browsers connect to this service; it owns the DB, auth, RBAC and audit.
// For production, terminate TLS with a local/private-CA cert (reverse proxy or
// pass key/cert here) so the LAN traffic and the Secure cookie are encrypted.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openDb } = require('./db');
const auth = require('./auth');
const audit = require('./audit');
const { createServer } = require('./http');

const DATA_DIR = process.env.OPENWARD_DATA || path.join(__dirname, 'data');
const STATIC_DIR = path.join(__dirname, '..');   // serves the existing UI for now
const PORT = +(process.env.PORT || 8090);

// First-run only: create an admin. No credentials are hardcoded — the password
// comes from OPENWARD_ADMIN_PASSWORD, or a random one is generated and shown once.
function ensureAdmin(db) {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return null;
  const pw = process.env.OPENWARD_ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  auth.createUser(db, { username: 'admin', password: pw, full_name: 'System Administrator', role: 'it_admin' });
  return process.env.OPENWARD_ADMIN_PASSWORD ? null : pw;
}

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = openDb(path.join(DATA_DIR, 'openward.db'));
  const auditKey = audit.loadKey(DATA_DIR);
  const genPw = ensureAdmin(db);
  if (genPw) console.log(`\n  First-run admin: username "admin"  password: ${genPw}\n  (shown once — set OPENWARD_ADMIN_PASSWORD to choose your own)\n`);
  createServer({ db, auditKey, staticDir: STATIC_DIR })
    .listen(PORT, () => console.log(`OpenWard local service: http://localhost:${PORT}  (use a local TLS cert in production)`));
}

if (require.main === module) main();
module.exports = { main, ensureAdmin };
