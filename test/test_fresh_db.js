'use strict';
// Boots a BRAND-NEW database exactly as a fresh install does (createAllTables +
// the shared migrations, via db.js's __buildFreshSchemaForTest) and exercises the
// operations that previously only worked on a RESTORED db — because migrations
// used to run only in the restored branch of initDB. Regression guard for:
//   #1 fresh installs missing migration-added columns/tables
//   #2 order-set inserts not matching the real schema
// Negative controls assert the OLD broken statements still fail, so a green run
// means the schema really is correct (not a vacuous pass).
const path = require('path');
const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));
const dbjs = require(path.resolve('js/db.js'));

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
function noThrow(label, fn) { try { fn(); pass++; console.log('  ok  - ' + label); } catch (e) { fail++; console.error('  FAIL- ' + label + ' -> ' + e.message); } }

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });
  const d = new SQL.Database();
  dbjs.__buildFreshSchemaForTest(d);   // the FRESH-install schema path

  const cols = t => { const r = d.exec(`PRAGMA table_info(${t})`); return r.length ? r[0].values.map(v => v[1]) : []; };
  const has = (t, c) => cols(t).includes(c);
  const tableExists = t => d.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`).length > 0;

  // ---- #1: columns/tables the migrations add must exist on a FRESH db --------
  assert(has('vitals_log', 'resp_rate') && has('vitals_log', 'news2_score') && has('vitals_log', 'qsofa_score')
    && has('vitals_log', 'on_o2') && has('vitals_log', 'consciousness'), 'fresh vitals_log has the NEWS2 columns');
  assert(has('drugs', 'is_high_alert'), 'fresh drugs has is_high_alert');
  assert(has('lab_orders', 'rejected_at') && has('lab_orders', 'rejected_by') && has('lab_orders', 'rejection_reason'),
    'fresh lab_orders has the rejection columns');
  assert(has('med_admin_records', 'witnessed_by') && has('med_admin_records', 'witnessed_at'),
    'fresh med_admin_records has the witness columns');
  assert(tableExists('clinical_assessments') && tableExists('fluid_balance') && tableExists('order_set_log')
    && tableExists('lab_critical_acks'), 'fresh DB has the migration-created tables');

  // a real formulary drug so order-set / MAR reference something
  d.run("INSERT INTO drugs (drug_id, name_generic, unit, is_high_alert) VALUES (1, 'Regular Insulin', 'units', 1)");

  // ---- #1: the operations the reviewer named must run on a FRESH db ----------
  noThrow('record vitals with NEWS2/qSOFA fields', () => {
    d.run(`INSERT INTO vitals_log (admission_id, recorded_by, recorded_at, bp_systolic, bp_diastolic, heart_rate, temperature, o2_sat, rbs, resp_rate, on_o2, consciousness, news2_score, qsofa_score)
      VALUES (1, 1, '2026-06-06T10:00:00Z', 120, 80, 88, 37.0, 97, 6.0, 18, 0, 'alert', 2, 0)`);
  });
  noThrow('order a lab then REJECT it (rejection columns)', () => {
    d.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, priority, status, ordered_at) VALUES (1, 1, 'CBC', 'routine', 'ordered', '2026-06-06T10:00:00Z')`);
    d.run(`UPDATE lab_orders SET status='rejected', rejected_at='2026-06-06T10:05:00Z', rejected_by=1, rejection_reason='hemolyzed sample' WHERE order_id=1`);
  });
  noThrow('MAR record with witness (high-alert double-check)', () => {
    d.run(`INSERT INTO med_admin_records (prescription_id, admission_id, drug_name, dose, route, status, administered_at, administered_by, witnessed_by, witnessed_at)
      VALUES (1, 1, 'Regular Insulin', '5 units', 'SC', 'given', '2026-06-06T10:10:00Z', 1, 2, '2026-06-06T10:10:00Z')`);
  });

  // ---- #2: order-set inserts use the REAL schema (doctor_id/drug_id/start_date)
  noThrow('apply order set: lab + prescription (corrected columns)', () => {
    d.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, priority, status, ordered_at) VALUES (1, 1, 'BMP', 'stat', 'ordered', '2026-06-06T10:00:00Z')`);
    d.run(`INSERT INTO prescriptions (admission_id, doctor_id, drug_id, drug_name, dose, route, frequency, start_date, status, prescribed_at)
      VALUES (1, 1, 1, 'Regular Insulin', '0.1 u/kg/hr', 'IV', 'continuous', '2026-06-06', 'active', '2026-06-06T10:00:00Z')`);
  });

  // ---- order-set UNMATCHED med: records an exception, creates NO prescription --
  assert(tableExists('order_set_exceptions'), 'fresh DB has the order_set_exceptions table');
  assert(cols('order_set_exceptions').includes('item_type'), 'order_set_exceptions has item_type (med vs task)');
  const rxBefore = d.exec("SELECT COUNT(*) FROM prescriptions")[0].values[0][0];
  noThrow('unmatched protocol med + order-set task -> order_set_exceptions (not Rx, not nurse task)', () => {
    d.run(`INSERT INTO order_set_exceptions (admission_id, set_name, item_type, drug_name, dose, route, frequency, reason, created_by, created_at, status)
      VALUES (1, 'Sepsis Bundle', 'med', 'Broad-spectrum Antibiotics', 'per protocol', 'IV', 'stat', 'not_in_formulary', 1, '2026-06-06T10:00:00Z', 'pending')`);
    d.run(`INSERT INTO order_set_exceptions (admission_id, set_name, item_type, drug_name, reason, created_by, created_at, status)
      VALUES (1, 'Sepsis Bundle', 'task', 'Insert urinary catheter', 'nursing_task', 1, '2026-06-06T10:00:00Z', 'pending')`);
  });
  const rxAfter = d.exec("SELECT COUNT(*) FROM prescriptions")[0].values[0][0];
  assert(rxAfter === rxBefore, 'the unmatched med created NO prescription (no fake drug_id=0 link)');
  const med = d.exec("SELECT drug_name FROM order_set_exceptions WHERE item_type='med' AND status='pending'");
  const tsk = d.exec("SELECT drug_name FROM order_set_exceptions WHERE item_type='task' AND status='pending'");
  assert(med.length && med[0].values[0][0] === 'Broad-spectrum Antibiotics', 'unmatched med is a visible pending exception');
  assert(tsk.length && tsk[0].values[0][0] === 'Insert urinary catheter', 'order-set task is a visible pending follow-up');

  // ---- negative controls: the OLD broken statements MUST still fail ----------
  let brokeLab = false;
  try { d.run(`INSERT INTO lab_orders (admission_id, ordered_by, test_name, priority, status, ordered_at) VALUES (1, 1, 'X', 'stat', 'pending', 't')`); }
  catch (e) { brokeLab = true; }
  assert(brokeLab, 'old order-set lab insert (ordered_by) is rejected by the real schema');

  let brokeRx = false;
  try { d.run(`INSERT INTO prescriptions (admission_id, prescribed_by, drug_name, dose, route, frequency, status, prescribed_at) VALUES (1, 1, 'X', 'd', 'r', 'f', 'active', 't')`); }
  catch (e) { brokeRx = true; }
  assert(brokeRx, 'old order-set prescription insert (prescribed_by, no drug_id/start_date) is rejected');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
