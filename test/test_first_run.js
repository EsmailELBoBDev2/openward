'use strict';
// First-run PRODUCTION install regression test.
//
// A production install must come up with ZERO default credentials: seedData
// ({demo:false}) seeds reference data only (departments, formulary, supplies),
// and the operator-made admin from createFirstAdmin() is the only account.
// Also guards the first-run DETECTION contract: initDB flags first-run on
// "no users", not "no DB blob", so a refresh between schema creation and the
// Demo/Production choice can't brick the install.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

(async () => {
  const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });

  const dbSource = fs.readFileSync('js/db.js', 'utf8');
  const code = ['js/lang.js', 'js/utils.js', 'js/allergy-check.js']
    .map(f => fs.readFileSync(f, 'utf8')).join('\n;\n') + '\n;\n' + dbSource;
  const fakeModule = { exports: {} };
  const fakeStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const factory = new Function('module', 'localStorage', 'window', 'document', 'indexedDB',
    code + `
    ;return {
      prodInstall: async (sqlDb, username, password) => {
        db = sqlDb;
        saveDBToIndexedDB = async () => {};   // no IndexedDB in Node
        createAllTables();
        applySchemaMigrations();
        DB_NEEDS_FIRST_RUN = true;            // what initDB sets on a fresh DB
        await completeFirstRun('production', { username, password });
        return { db, firstRunDone: !DB_NEEDS_FIRST_RUN };
      },
      badAdmin: async (sqlDb, username, password) => {
        db = sqlDb;
        let err = null;
        try { await createFirstAdmin(username, password); } catch (e) { err = e; }
        return err && err.message;
      },
      verify: async (pw, salt, hash) => (await verifyPassword(pw, salt, hash)).ok,
    };`);

  const api = factory(fakeModule, fakeStorage, undefined, undefined, undefined);
  const d = new SQL.Database();

  let err = null, result = null;
  try { result = await api.prodInstall(d, 'Ward.Admin', 'S3cure-Ward-2026'); } catch (e) { err = e; }
  assert(!err, 'production install completes on a brand-new DB' + (err ? ' -> ' + err.message : ''));
  if (err) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }
  assert(result.firstRunDone, 'completeFirstRun clears the first-run flag');

  const count = (q) => d.exec(q)[0].values[0][0];
  // Reference data present — the app must be usable (admit somewhere, prescribe something)
  assert(count('SELECT COUNT(*) FROM departments') >= 10, 'production seed includes departments');
  assert(count('SELECT COUNT(*) FROM drugs') >= 10, 'production seed includes the formulary');
  // ZERO default credentials — the operator-created admin is the ONLY account
  assert(count('SELECT COUNT(*) FROM users') === 1, 'production install has exactly ONE account (the created admin)');
  const row = d.exec("SELECT username, role, password_hash, salt FROM users")[0].values[0];
  assert(row[0] === 'ward.admin' && row[1] === 'it_admin', 'created admin is it_admin with normalized username');
  assert(count("SELECT COUNT(*) FROM users WHERE username IN ('admin','dr.omar','nurse.fatima')") === 0, 'no demo accounts (admin/HIS@2024 etc.) exist in production');
  assert(count('SELECT COUNT(*) FROM patients') === 0, 'no fake patients in production');
  const okPw = await api.verify('S3cure-Ward-2026', row[3], row[2]);
  const badPw = await api.verify('HIS@2024', row[3], row[2]);
  assert(okPw === true && badPw === false, 'created admin password verifies (and the demo password does NOT)');

  // Validation: weak/invalid admin credentials are refused
  const d2 = new SQL.Database();
  d2.run('CREATE TABLE users (user_id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT, salt TEXT, full_name_ar TEXT, full_name_en TEXT, role TEXT, department_id INTEGER, is_active INTEGER, created_at TEXT)');
  assert(/10 characters/.test(await api.badAdmin(d2, 'goodname', 'short')), 'createFirstAdmin refuses a password under 10 chars');
  assert(/Username/.test(await api.badAdmin(d2, '!!', 'long-enough-pass')), 'createFirstAdmin refuses an invalid username');

  // Detection contract: initDB must flag first-run by "no users", and the boot
  // script must gate login + show the chooser (source guards against regression).
  const idx = fs.readFileSync('index.html', 'utf8');
  assert(/_freshDb \|\| !dbGet\('SELECT user_id FROM users LIMIT 1'\)/.test(dbSource), 'initDB detects first-run by NO USERS (refresh mid-choice cannot brick the install)');
  assert(/DB_NEEDS_FIRST_RUN\s*\)\s*{\s*showFirstRunChooser\(\)/.test(idx.replace(/\n/g, ' ')) || /showFirstRunChooser\(\);/.test(idx), 'boot shows the first-run chooser');
  assert(/loginBtn\.disabled = \(typeof DB_NEEDS_FIRST_RUN/.test(idx), 'login stays gated while first-run is pending');
  assert(/\.alert-overlay:not\(#first-run-overlay\)/.test(idx), 'Escape key cannot dismiss the first-run chooser (would strand a disabled login)');
  // Help modal must not print demo credentials unconditionally
  assert(/demoInstall \? `/.test(idx) && /dr\.omar/.test(idx), 'Help modal gates demo credentials on a demo install');

  // Showcase login: the persona picker renders ONLY on demo installs, and
  // production browser installs keep the (true) local-only storage warning.
  const showcase = idx.slice(idx.indexOf('function setupShowcaseLogin'), idx.indexOf('function switchToProduction'));
  assert(/dr\.omar/.test(showcase) && /if \(!demo\) return;/.test(showcase), 'persona picker is gated on the demo install check (production gets NO quick-logins)');
  assert(/SERVER_MODE/.test(showcase) && /central hospital server/.test(showcase), 'server mode replaces the (false-there) local-only notice with the central-server notice');
  assert(/ow_first_run/.test(idx.slice(idx.indexOf('function switchToProduction'))) && /localStorage\.getItem\('ow_first_run'\) === 'production'/.test(idx), 'one-click production switch wipes demo data and lands directly on the admin-creation form');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('  FAIL- harness error: ' + e.message); process.exit(1); });
