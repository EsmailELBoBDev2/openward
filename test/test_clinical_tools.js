'use strict';
// Cross-role clinical tools (adapted peer features): chart attachments, internal
// referrals, and care-gap dismissals. Proves the schema exists on a FRESH install
// and the core data lifecycles behave. Screen rendering is covered by
// test_views_render (documents / referrals / care-gaps are in renderView).
const path = require('path');
const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));
const dbjs = require(path.resolve('js/db.js'));

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });
  const d = new SQL.Database();
  dbjs.__buildFreshSchemaForTest(d);
  const cols = t => { const r = d.exec(`PRAGMA table_info(${t})`); return r.length ? r[0].values.map(v => v[1]) : []; };
  const has = (t, c) => cols(t).includes(c);
  const tbl = t => d.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`).length > 0;
  const one = (sql, p) => { const r = d.exec(sql, p); return r.length ? r[0].values[0][0] : null; };
  const idxNames = () => { const r = d.exec("SELECT name FROM sqlite_master WHERE type='index'"); return r.length ? r[0].values.map(v => v[0]) : []; };

  // ---- schema ----
  assert(tbl('patient_attachments') && has('patient_attachments', 'data') && has('patient_attachments', 'kind'), 'fresh DB has patient_attachments');
  assert(tbl('referrals') && has('referrals', 'status') && has('referrals', 'to_dept'), 'fresh DB has referrals');
  assert(tbl('care_gap_overrides') && has('care_gap_overrides', 'gap_key'), 'fresh DB has care_gap_overrides');
  const ix = idxNames();
  assert(ix.includes('idx_attach_patient') && ix.includes('idx_referrals_status') && ix.includes('idx_caregap_admission'), 'clinical-tool indexes exist');

  d.run("INSERT INTO patients (patient_id, mrn, full_name_ar, full_name_en, registered_at) VALUES (1,'HIS-T1','مريض','Test','2026-01-01T00:00:00Z')");

  // ---- attachments ----
  d.run("INSERT INTO patient_attachments (patient_id, filename, mime, kind, size_bytes, data, uploaded_at) VALUES (1,'xray.png','image/png','image',1234,'data:image/png;base64,AAAA','2026-06-01T00:00:00Z')");
  assert(one("SELECT kind FROM patient_attachments WHERE patient_id=1") === 'image', 'attachment round-trips with its kind');
  assert(String(one("SELECT data FROM patient_attachments WHERE patient_id=1")).startsWith('data:image/png'), 'attachment stores the data URL');
  d.run("DELETE FROM patient_attachments WHERE patient_id=1");
  assert(one("SELECT COUNT(*) FROM patient_attachments WHERE patient_id=1") === 0, 'attachment delete works');

  // ---- referral lifecycle + inbox filter ----
  d.run("INSERT INTO referrals (patient_id, from_user, to_dept, reason, urgency, status, created_at) VALUES (1, 5, 3, 'Please review cardiac', 'urgent', 'open', '2026-06-01T00:00:00Z')");
  assert(one("SELECT COUNT(*) FROM referrals WHERE to_dept=3 AND status IN ('open','accepted')") === 1, 'open referral shows in dept-3 inbox');
  d.run("UPDATE referrals SET status='accepted', responded_by=9 WHERE to_dept=3");
  assert(one("SELECT status FROM referrals WHERE to_dept=3") === 'accepted', 'referral accept transitions to accepted');
  d.run("UPDATE referrals SET status='completed', response_note='Seen, started beta-blocker' WHERE to_dept=3");
  assert(one("SELECT response_note FROM referrals WHERE to_dept=3") === 'Seen, started beta-blocker', 'referral complete stores response note');
  assert(one("SELECT COUNT(*) FROM referrals WHERE to_dept=3 AND status IN ('open','accepted')") === 0, 'completed referral leaves the inbox');

  // ---- care-gap dismissal ----
  d.run("INSERT INTO care_gap_overrides (admission_id, gap_key, reason, dismissed_by, dismissed_at) VALUES (10, 'vte', 'On therapeutic anticoag already', 7, '2026-06-01T00:00:00Z')");
  const dismissed = new Set(d.exec("SELECT gap_key FROM care_gap_overrides WHERE admission_id=10").flatMap(r => r.values.map(v => v[0])));
  assert(dismissed.has('vte') && !dismissed.has('code_status'), 'dismissed gap is recorded per admission+key (others still open)');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
