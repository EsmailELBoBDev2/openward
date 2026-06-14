'use strict';
// Patient-safety incident reporting (Feature 2). Proves the incident_reports
// schema the report/queue screens rely on exists on a FRESH install, that a
// filed incident round-trips, that an ANONYMOUS report leaves reported_by NULL
// (de-identified for reviewers), and that the open -> under_review -> closed
// lifecycle behaves. The render smoke test for both screens is covered by
// test_views_render (incident-report / incident-queue are in renderView).
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
  const tableExists = t => d.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`).length > 0;
  const one = (sql, p) => { const r = d.exec(sql, p); return r.length ? r[0].values[0][0] : null; };

  // ---- #1: fresh schema has incident_reports + its columns + index ----------
  assert(tableExists('incident_reports'), 'fresh DB has incident_reports');
  assert(['type', 'severity', 'description', 'reported_by', 'reported_at', 'status', 'reviewed_by', 'review_notes', 'closed_at', 'patient_id'].every(c => has('incident_reports', c)),
    'incident_reports has all required columns');
  const idx = d.exec("SELECT name FROM sqlite_master WHERE type='index'");
  assert((idx.length ? idx[0].values.map(v => v[0]) : []).includes('idx_incident_status_sev'), 'incident status/severity index exists');

  // a patient + reporter to reference
  d.run("INSERT INTO patients (patient_id, mrn, full_name_ar, full_name_en, registered_at) VALUES (1,'HIS-T1','مريض','Test','2026-01-01T00:00:00Z')");

  // ---- #2: a filed incident round-trips -------------------------------------
  d.run("INSERT INTO incident_reports (type, severity, occurred_at, location, patient_id, description, immediate_action, reported_by, reported_at, status) VALUES ('fall','low','2026-06-01T03:00:00Z','Ward B',1,'Patient slipped, no injury','Assessed, bed alarm on',42,'2026-06-01T03:10:00Z','open')");
  assert(one("SELECT COUNT(*) FROM incident_reports WHERE type='fall' AND severity='low'") === 1, 'filed incident is retrievable');
  assert(one("SELECT reported_by FROM incident_reports WHERE type='fall'") === 42, 'named report records the reporter');
  assert(one("SELECT status FROM incident_reports WHERE type='fall'") === 'open', 'new incident starts open');

  // ---- #3: anonymous report leaves reported_by NULL -------------------------
  d.run("INSERT INTO incident_reports (type, severity, description, reported_by, reported_at, status) VALUES ('near_miss','no_harm','10x heparin caught at second check', NULL, '2026-06-01T04:00:00Z','open')");
  assert(one("SELECT reported_by FROM incident_reports WHERE type='near_miss'") === null, 'anonymous report has NULL reported_by');

  // ---- #4: open -> under_review -> closed lifecycle -------------------------
  d.run("UPDATE incident_reports SET status='under_review', reviewed_by=7 WHERE type='fall'");
  assert(one("SELECT status FROM incident_reports WHERE type='fall'") === 'under_review', 'review moves incident to under_review');
  d.run("UPDATE incident_reports SET status='closed', review_notes='Root cause: footwear; education given', closed_at='2026-06-02T09:00:00Z' WHERE type='fall'");
  assert(one("SELECT status FROM incident_reports WHERE type='fall'") === 'closed', 'close moves incident to closed');
  assert(one("SELECT review_notes FROM incident_reports WHERE type='fall'") === 'Root cause: footwear; education given', 'close stores review notes');
  assert(one("SELECT closed_at FROM incident_reports WHERE type='fall'") === '2026-06-02T09:00:00Z', 'close stamps closed_at');

  // ---- #5: status filter (the queue's default 'open' view) ------------------
  assert(one("SELECT COUNT(*) FROM incident_reports WHERE status='open'") === 1, "filter status='open' returns only the open one");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
