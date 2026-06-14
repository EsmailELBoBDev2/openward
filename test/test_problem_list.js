'use strict';
// Coded, dated problem list + patient flags (Feature 3). Proves the schema the
// problem-list UI relies on: the new patient_conditions columns and the
// patient_flags table exist on a FRESH install, the migrations are idempotent,
// and the active/resolved lifecycle + the active-flag filter behave correctly.
const path = require('path');
const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));
const dbjs = require(path.resolve('js/db.js'));

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
function noThrow(label, fn) { try { fn(); pass++; console.log('  ok  - ' + label); } catch (e) { fail++; console.error('  FAIL- ' + label + ' -> ' + e.message); } }

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });
  const d = new SQL.Database();
  dbjs.__buildFreshSchemaForTest(d);

  const cols = t => { const r = d.exec(`PRAGMA table_info(${t})`); return r.length ? r[0].values.map(v => v[1]) : []; };
  const has = (t, c) => cols(t).includes(c);
  const tableExists = t => d.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`).length > 0;
  const one = (sql, p) => { const r = d.exec(sql, p); return r.length ? r[0].values[0][0] : null; };

  // ---- #1: fresh schema has the coded-problem-list columns + flags table -----
  assert(has('patient_conditions', 'code_system') && has('patient_conditions', 'display')
    && has('patient_conditions', 'onset_date') && has('patient_conditions', 'resolved_date')
    && has('patient_conditions', 'status'), 'fresh patient_conditions has the coded/dated columns');
  assert(tableExists('patient_flags') && has('patient_flags', 'label_en') && has('patient_flags', 'color') && has('patient_flags', 'active'),
    'fresh DB has the patient_flags table');
  const idx = d.exec("SELECT name FROM sqlite_master WHERE type='index'");
  const idxNames = idx.length ? idx[0].values.map(v => v[0]) : [];
  assert(idxNames.includes('idx_pc_patient_status') && idxNames.includes('idx_pflags_patient'),
    'fresh DB has the problem-list/flag indexes');

  // a patient to attach problems/flags to (FK target)
  d.run("INSERT INTO patients (patient_id, mrn, full_name_ar, full_name_en, date_of_birth, gender, registered_at) VALUES (1,'HIS-T1','مريض','Test',  '1990-01-01','male','2026-01-01T00:00:00Z')");

  // ---- #2: ICD-coded problem round-trips -------------------------------------
  d.run("INSERT INTO patient_conditions (patient_id, condition_code, code_system, display, severity, onset_date, status, added_at) VALUES (1,'E11.9','icd10','Type 2 diabetes mellitus','moderate','2025-06-01','active','2026-01-02T00:00:00Z')");
  assert(one("SELECT code_system FROM patient_conditions WHERE condition_code='E11.9'") === 'icd10', 'ICD-coded problem stores code_system=icd10');
  assert(one("SELECT display FROM patient_conditions WHERE condition_code='E11.9'") === 'Type 2 diabetes mellitus', 'problem stores its display label');

  // legacy token row (no status) — must still count as ACTIVE via COALESCE
  d.run("INSERT INTO patient_conditions (patient_id, condition_code, added_at) VALUES (1,'cardiac','2026-01-02T00:00:00Z')");
  const activeCount = one("SELECT COUNT(*) FROM patient_conditions WHERE patient_id=1 AND COALESCE(status,'active') <> 'resolved'");
  assert(activeCount === 2, 'active list includes both the ICD row and the legacy (NULL-status) row');

  // ---- #3: resolve lifecycle -------------------------------------------------
  d.run("UPDATE patient_conditions SET status='resolved', resolved_date='2026-02-01' WHERE condition_code='E11.9'");
  assert(one("SELECT COUNT(*) FROM patient_conditions WHERE patient_id=1 AND status='resolved'") === 1, 'resolved problem leaves the active list');
  assert(one("SELECT resolved_date FROM patient_conditions WHERE condition_code='E11.9'") === '2026-02-01', 'resolve sets resolved_date');
  assert(one("SELECT COUNT(*) FROM patient_conditions WHERE patient_id=1 AND COALESCE(status,'active') <> 'resolved'") === 1, 'one active problem remains after resolve');

  // ---- #4: patient flags + active filter -------------------------------------
  d.run("INSERT INTO patient_flags (patient_id, label_en, label_ar, color, created_at, active) VALUES (1,'Fall risk','خطر السقوط','warn','2026-01-03T00:00:00Z',1)");
  d.run("INSERT INTO patient_flags (patient_id, label_en, color, created_at, active) VALUES (1,'Old flag','info','2026-01-03T00:00:00Z',0)");
  assert(one("SELECT COUNT(*) FROM patient_flags WHERE patient_id=1 AND active=1") === 1, 'only active flags surface (banner query)');
  assert(one("SELECT label_ar FROM patient_flags WHERE patient_id=1 AND active=1") === 'خطر السقوط', 'flag keeps its Arabic label');

  // ---- #5: migrations are idempotent (re-run on the SAME db, no throw) --------
  noThrow('re-running createAllTables + migrations is idempotent', () => dbjs.__buildFreshSchemaForTest(d));
  assert(one("SELECT COUNT(*) FROM patient_conditions WHERE patient_id=1") === 2, 'data survives a second migration pass');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
