'use strict';
// Patient-portal self-booking (submitPPBookAppt, js/router.js): the INSERT used
// to reference an `mrn` column the appointments table never had, and bound NULL
// into created_by (INTEGER NOT NULL) — so every portal booking threw and no row
// was created. Guards the fix:
//   #1 migrations add appointments.mrn and appointments.requested_by_patient_id
//   #2 the portal INSERT (created_by = 0 sentinel) succeeds — SQL is SLICED OUT
//      OF js/router.js at test time, so drift in the real code fails here
//   #3 renderPPAppointments' lookup finds the new 'requested' row — same slicing
// Negative control: created_by NULL must still be rejected, so the NOT NULL
// constraint wasn't loosened to make the insert pass.
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));
const dbjs = require(path.resolve('js/db.js'));

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
function noThrow(label, fn) { try { fn(); pass++; console.log('  ok  - ' + label); } catch (e) { fail++; console.error('  FAIL- ' + label + ' -> ' + e.message); } }

// ---- slice the REAL SQL out of router.js (no hand-copied reimplementation) ----
const routerSrc = fs.readFileSync(path.resolve('js/router.js'), 'utf8');
function fnSlice(name) {
  const i = routerSrc.search(new RegExp(`(?:async )?function ${name}\\(`));
  if (i < 0) throw new Error(`function ${name} not found in router.js`);
  const rest = routerSrc.slice(i + 1);
  const end = rest.search(/\n(?:async )?function /);
  return routerSrc.slice(i, end < 0 ? routerSrc.length : i + 1 + end);
}
const insertSql = (fnSlice('submitPPBookAppt').match(/dbRun\(`(INSERT INTO appointments[\s\S]*?)`/) || [])[1];
const listSql = (fnSlice('renderPPAppointments').match(/`(\s*SELECT[\s\S]*?FROM appointments[\s\S]*?LIMIT \d+\s*)`/) || [])[1];

(async () => {
  assert(!!insertSql, 'sliced the portal-booking INSERT out of submitPPBookAppt (router.js)');
  assert(!!listSql, "sliced the portal listing SELECT out of renderPPAppointments (router.js)");
  if (!insertSql || !listSql) { console.error('router.js drifted — update the slicing regexes'); process.exit(1); }
  // The strong-identifier-only WHERE is itself the fix for a cross-patient leak:
  // matching on patient_name_ar/_en leaked same-named patients' appointments
  // (incl. visit reason). The SELECT list may name full_name_* (doctor labels);
  // the WHERE clause must not match on patient names.
  assert(!/patient_name/.test(listSql.slice(listSql.indexOf('WHERE'))), 'portal listing WHERE uses strong identifiers only (no name matching)');

  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });
  const d = new SQL.Database();
  dbjs.__buildFreshSchemaForTest(d);

  const cols = t => { const r = d.exec(`PRAGMA table_info(${t})`); return r.length ? r[0].values.map(v => v[1]) : []; };

  // ---- #1: migration columns exist on a fresh db ----------------------------
  assert(cols('appointments').includes('mrn'), 'appointments has mrn');
  assert(cols('appointments').includes('requested_by_patient_id'), 'appointments has requested_by_patient_id');

  d.run("INSERT INTO departments (dept_id, name_ar, name_en, type) VALUES (3, 'الباطنة', 'Internal Medicine', 'clinical')");

  // ---- #2: the portal INSERT, executed exactly as router.js issues it -------
  // bind order mirrors the call site: [name_ar, name_en, national_id, mrn,
  // deptId, date, time, reason, nowISO(), patient_id]
  noThrow('portal booking INSERT from the live source succeeds (created_by = 0 sentinel)', () => {
    d.run(insertSql,
      ['أحمد علي', 'Ahmed Ali', '29001011234567', 'MRN-0042', 3, '2026-06-20', '13:00', 'BP follow-up', '2026-06-11T10:00:00Z', 7]);
  });

  // ---- #3: renderPPAppointments' live lookup finds the requested row --------
  const r = d.exec(listSql, [7, '29001011234567', 'MRN-0042']);
  assert(r.length === 1 && r[0].values.length === 1, 'patient portal listing returns exactly the new row');
  if (r.length) {
    const row = {};
    r[0].columns.forEach((c, i) => { if (!(c in row)) row[c] = r[0].values[0][i]; });
    assert(row.status === 'requested', "row status is 'requested'");
    assert(row.mrn === 'MRN-0042', 'row carries the patient MRN');
    assert(row.requested_by_patient_id === 7, 'requested_by_patient_id records the requester');
    assert(row.created_by === 0, 'created_by is the 0 sentinel, not a staff user');
  }

  // ---- negative control: the OLD broken bind must still fail ----------------
  let brokeNull = false;
  try {
    d.run(`INSERT INTO appointments (patient_name_ar, patient_name_en, national_id, mrn, dept_id, appt_date, appt_time, reason, status, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, NULL)`,
      ['أحمد علي', 'Ahmed Ali', '29001011234567', 'MRN-0042', 3, '2026-06-21', '10:00', 'x', '2026-06-11T10:00:00Z']);
  } catch (e) { brokeNull = true; }
  assert(brokeNull, 'created_by NULL is still rejected (NOT NULL kept)');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
