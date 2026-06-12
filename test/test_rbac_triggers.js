'use strict';
// RBAC at the data layer: the role triggers added in the role-alignment pass
// must refuse a wrong-role actor id on the highest-stakes columns, in the SAME
// schema both the browser and server/server.js build (server reuses db.js).
// Positive controls prove the right role still works (not a vacuous pass);
// nonexistent-user controls prove the COALESCE pattern closed the NULL hole.
const path = require('path');
const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));
const dbjs = require(path.resolve('js/db.js'));

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
function allows(label, fn) { try { fn(); pass++; console.log('  ok  - ' + label); } catch (e) { fail++; console.error('  FAIL- ' + label + ' -> unexpectedly blocked: ' + e.message); } }
function blocks(label, msgPart, fn) {
  try { fn(); fail++; console.error('  FAIL- ' + label + ' -> unexpectedly ALLOWED'); }
  catch (e) {
    if (String(e.message).includes(msgPart)) { pass++; console.log('  ok  - ' + label); }
    else { fail++; console.error('  FAIL- ' + label + ' -> blocked but wrong error: ' + e.message); }
  }
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });
  const d = new SQL.Database();
  dbjs.__buildFreshSchemaForTest(d);

  // one user per role under test
  const mkUser = (id, uname, role) =>
    d.run(`INSERT INTO users (user_id, username, password_hash, salt, full_name_ar, full_name_en, role, is_active, created_at)
           VALUES (${id}, '${uname}', 'x', 'x', 'م', '${uname}', '${role}', 1, '2026-06-12T00:00:00Z')`);
  mkUser(1, 'doc', 'doctor');
  mkUser(2, 'nurse', 'nurse');
  mkUser(3, 'pharm', 'pharmacist');
  mkUser(4, 'labtech', 'lab_technician');
  d.run("INSERT INTO drugs (drug_id, name_generic, unit) VALUES (1, 'Aspirin', 'mg')");
  // a real ACTIVE admission to order against — the discharge-block triggers now
  // refuse a dangling admission_id outright (COALESCE), so orders need a parent
  d.run("INSERT INTO departments (dept_id, name_ar, name_en, type) VALUES (1, 'طوارئ', 'ER', 'emergency')");
  d.run("INSERT INTO patients (patient_id, mrn, full_name_ar, registered_at) VALUES (1, 'HIS-1', 'مريض', '2026-06-12T00:00:00Z')");
  d.run("INSERT INTO admissions (admission_id, patient_id, dept_id, admitted_at, status) VALUES (1, 1, 1, '2026-06-12T00:00:00Z', 'active')");

  // ---- discharge-block triggers: NULL-skip closed (COALESCE) ------------------
  blocks('rx on a NONEXISTENT admission refused (trg_rx_block_discharged, no NULL hole)', 'nonexistent', () =>
    d.run("INSERT INTO prescriptions (admission_id, doctor_id, drug_id, drug_name, dose, route, frequency, start_date, status, prescribed_at) VALUES (999, 1, 1, 'Aspirin', '81mg', 'PO', 'daily', '2026-06-12', 'active', '2026-06-12T08:00:00Z')"));
  blocks('lab on a NONEXISTENT admission refused (trg_lab_block_discharged, no NULL hole)', 'nonexistent', () =>
    d.run("INSERT INTO lab_orders (admission_id, doctor_id, test_name, priority, status, ordered_at) VALUES (999, 1, 'CBC', 'routine', 'ordered', '2026-06-12T08:00:00Z')"));

  // ---- lab_orders.doctor_id: doctor role only --------------------------------
  allows('doctor can order a lab', () =>
    d.run("INSERT INTO lab_orders (admission_id, doctor_id, test_name, priority, status, ordered_at) VALUES (1, 1, 'CBC', 'routine', 'ordered', '2026-06-12T08:00:00Z')"));
  blocks('nurse id refused in lab_orders.doctor_id', 'doctor role', () =>
    d.run("INSERT INTO lab_orders (admission_id, doctor_id, test_name, priority, status, ordered_at) VALUES (1, 2, 'CBC', 'routine', 'ordered', '2026-06-12T08:00:00Z')"));
  blocks('NONEXISTENT id refused in lab_orders.doctor_id (COALESCE, no NULL hole)', 'doctor role', () =>
    d.run("INSERT INTO lab_orders (admission_id, doctor_id, test_name, priority, status, ordered_at) VALUES (1, 999, 'CBC', 'routine', 'ordered', '2026-06-12T08:00:00Z')"));

  // ---- prescriptions.verified_by: pharmacist only (INSERT and UPDATE) --------
  allows('doctor prescribes (verified_by NULL at insert)', () =>
    d.run("INSERT INTO prescriptions (rx_id, admission_id, doctor_id, drug_id, drug_name, dose, route, frequency, start_date, status, prescribed_at) VALUES (1, 1, 1, 1, 'Aspirin', '81mg', 'PO', 'daily', '2026-06-12', 'active', '2026-06-12T08:00:00Z')"));
  blocks('nurse id refused in verified_by via UPDATE', 'pharmacist', () =>
    d.run("UPDATE prescriptions SET verified_by = 2, verified_at = '2026-06-12T09:00:00Z' WHERE rx_id = 1"));
  blocks('doctor id refused in verified_by via UPDATE (prescriber cannot self-verify)', 'pharmacist', () =>
    d.run("UPDATE prescriptions SET verified_by = 1, verified_at = '2026-06-12T09:00:00Z' WHERE rx_id = 1"));
  allows('pharmacist verifies via UPDATE', () =>
    d.run("UPDATE prescriptions SET verified_by = 3, verified_at = '2026-06-12T09:00:00Z' WHERE rx_id = 1"));
  blocks('nurse id refused in verified_by at INSERT (bridge-style direct write)', 'pharmacist', () =>
    d.run("INSERT INTO prescriptions (rx_id, admission_id, doctor_id, drug_id, drug_name, dose, route, frequency, start_date, status, prescribed_at, verified_by) VALUES (2, 1, 1, 1, 'Aspirin', '81mg', 'PO', 'daily', '2026-06-12', 'active', '2026-06-12T08:00:00Z', 2)"));

  // ---- dispensing_log.dispensed_by: pharmacist only ---------------------------
  allows('pharmacist dispenses', () =>
    d.run("INSERT INTO dispensing_log (prescription_id, drug_id, patient_id, qty_dispensed, dispensed_by, dispensed_at) VALUES (1, 1, 1, 30, 3, '2026-06-12T10:00:00Z')"));
  blocks('nurse id refused in dispensed_by', 'pharmacist', () =>
    d.run("INSERT INTO dispensing_log (prescription_id, drug_id, patient_id, qty_dispensed, dispensed_by, dispensed_at) VALUES (1, 1, 1, 30, 2, '2026-06-12T10:00:00Z')"));
  blocks('NONEXISTENT id refused in dispensed_by', 'pharmacist', () =>
    d.run("INSERT INTO dispensing_log (prescription_id, drug_id, patient_id, qty_dispensed, dispensed_by, dispensed_at) VALUES (1, 1, 1, 30, 999, '2026-06-12T10:00:00Z')"));

  // ---- med_admin_records.administered_by: clinical staff only -----------------
  allows('nurse charts a MAR row', () =>
    d.run("INSERT INTO med_admin_records (prescription_id, admission_id, drug_name, dose, route, status, administered_at, administered_by) VALUES (1, 1, 'Aspirin', '81mg', 'PO', 'given', '2026-06-12T10:30:00Z', 2)"));
  allows('doctor charts a MAR row', () =>
    d.run("INSERT INTO med_admin_records (prescription_id, admission_id, drug_name, dose, route, status, administered_at, administered_by) VALUES (1, 1, 'Aspirin', '81mg', 'PO', 'given', '2026-06-12T10:35:00Z', 1)"));
  blocks('pharmacist id refused in administered_by (dispenses, does not administer)', 'clinical staff', () =>
    d.run("INSERT INTO med_admin_records (prescription_id, admission_id, drug_name, dose, route, status, administered_at, administered_by) VALUES (1, 1, 'Aspirin', '81mg', 'PO', 'given', '2026-06-12T10:40:00Z', 3)"));
  blocks('lab tech id refused in administered_by', 'clinical staff', () =>
    d.run("INSERT INTO med_admin_records (prescription_id, admission_id, drug_name, dose, route, status, administered_at, administered_by) VALUES (1, 1, 'Aspirin', '81mg', 'PO', 'given', '2026-06-12T10:45:00Z', 4)"));

  // ---- the handler-side guards exist in the source (drift guard) -------------
  const fs = require('fs');
  const routerSrc = fs.readFileSync(path.resolve('js/router.js'), 'utf8');
  ok(/function requireRole\(/.test(routerSrc), 'router.js defines the requireRole() handler guard');
  for (const [fn, roleHint] of [
    ['handleVerifyRx', "'pharmacist'"], ['batchVerifyRx', "'pharmacist'"], ['handleDispense', "'pharmacist'"], ['handleRefuseRx', "'pharmacist'"],
    ['handlePrescribe', 'DOCTOR_ROLES'], ['handleOrderLab', 'DOCTOR_ROLES'], ['handleInlineLab', 'DOCTOR_ROLES'], ['handleDischarge', 'DOCTOR_ROLES'],
  ]) {
    const m = routerSrc.match(new RegExp('async function ' + fn + '\\([\\s\\S]{0,600}?requireRole\\((\\[[^\\]]*\\]|DOCTOR_ROLES)'));
    ok(m && m[1].includes(roleHint.replace(/'/g, "'")), `${fn} guards with requireRole(${roleHint})`);
  }
  // order-set apply branches on role instead of crashing on the rx trigger
  ok(/handleApplyOrderSet[\s\S]{0,900}?DOCTOR_ROLES\.includes\(user\.role\)/.test(routerSrc),
    'handleApplyOrderSet routes non-doctor applies to order_set_exceptions');
  // portal: refill is ownership-scoped, booking is capped
  ok(/requestRxRefill[\s\S]{0,700}?JOIN admissions a ON p\.admission_id = a\.admission_id[\s\S]{0,200}?a\.patient_id = \?/.test(routerSrc),
    'requestRxRefill scopes the rx lookup to the logged-in patient (IDOR guard)');
  ok(/submitPPBookAppt[\s\S]{0,1200}?requested_by_patient_id = \? AND substr\(created_at, 1, 10\) = \?/.test(routerSrc),
    'submitPPBookAppt enforces the per-day request cap');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
