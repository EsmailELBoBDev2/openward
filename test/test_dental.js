'use strict';
// OpenSmile dental domain — proves the dental schema, the role triggers, the
// allergy guard, and the core data round-trips on a FRESH install. Executes the
// REAL schema builder (js/db.js) and the REAL allergy matcher (js/allergy-check.js),
// so reverting either breaks this test. Replaces the old hospital schema/seed/
// rbac-trigger tests.
const path = require('path');
const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));
const dbjs = require(path.resolve('js/db.js'));
const { checkDrugAllergy } = require(path.resolve('js/allergy-check.js'));

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
function aborts(label, fn) { try { fn(); fail++; console.error('  FAIL- ' + label + ' (expected ABORT, none thrown)'); } catch (e) { pass++; console.log('  ok  - ' + label); } }
function noThrow(label, fn) { try { fn(); pass++; console.log('  ok  - ' + label); } catch (e) { fail++; console.error('  FAIL- ' + label + ' -> ' + e.message); } }

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });
  const d = new SQL.Database();
  dbjs.__buildFreshSchemaForTest(d);
  const exists = t => d.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`).length > 0;
  const cols = t => { const r = d.exec(`PRAGMA table_info(${t})`); return r.length ? r[0].values.map(v => v[1]) : []; };
  const one = (sql) => { const r = d.exec(sql); return r.length ? r[0].values[0][0] : null; };

  // ---- #1 dental tables present, hospital tables gone ----
  for (const t of ['odontogram', 'perio_chart', 'procedures', 'treatment_plans', 'treatment_plan_items', 'operatories', 'recalls'])
    assert(exists(t), `dental table ${t} exists`);
  for (const t of ['admissions', 'vitals_log', 'lab_orders', 'med_admin_records', 'supply_items', 'consultations', 'surgical_cases'])
    assert(!exists(t), `hospital table ${t} is gone`);

  // ---- #2 prescriptions are patient-linked, no admissions FK ----
  assert(cols('prescriptions').includes('patient_id'), 'prescriptions has patient_id');
  const rxFks = d.exec("PRAGMA foreign_key_list(prescriptions)");
  const rxRefsAdm = rxFks.length && rxFks[0].values.some(v => v[2] === 'admissions');
  assert(!rxRefsAdm, 'prescriptions no longer references admissions');

  // seed a clinic to exercise the triggers
  d.run("INSERT INTO users (user_id, username, password_hash, salt, full_name_ar, full_name_en, role, created_at) VALUES (1,'dr','x','x','د','Dentist','dentist','2026-01-01')");
  d.run("INSERT INTO users (user_id, username, password_hash, salt, full_name_ar, full_name_en, role, created_at) VALUES (2,'hyg','x','x','م','Hygienist','hygienist','2026-01-01')");
  d.run("INSERT INTO users (user_id, username, password_hash, salt, full_name_ar, full_name_en, role, created_at) VALUES (3,'rec','x','x','ر','Reception','receptionist','2026-01-01')");
  d.run("INSERT INTO patients (patient_id, mrn, full_name_ar, full_name_en, date_of_birth, gender, registered_at) VALUES (1,'OS-T1','مريض','Salem','1986-05-20','male','2026-01-01')");
  d.run("INSERT INTO drugs (drug_id, name_generic, name_ar, category, unit, added_at) VALUES (1,'Amoxicillin 500mg','أموكسيسيلين','antibiotic','capsule','2026-01-01')");

  // ---- #3 role triggers ----
  noThrow('a dentist can prescribe', () =>
    d.run("INSERT INTO prescriptions (patient_id, doctor_id, drug_id, drug_name, dose, route, frequency, start_date, prescribed_at) VALUES (1,1,1,'Amoxicillin 500mg','500mg','PO','TID','2026-06-13','2026-06-13')"));
  aborts('a receptionist CANNOT prescribe (trg_rx_doctor_role)', () =>
    d.run("INSERT INTO prescriptions (patient_id, doctor_id, drug_id, drug_name, dose, route, frequency, start_date, prescribed_at) VALUES (1,3,1,'Amoxicillin 500mg','500mg','PO','TID','2026-06-13','2026-06-13')"));
  noThrow('a hygienist can chart a tooth', () =>
    d.run("INSERT INTO odontogram (patient_id, tooth_fdi, status, charted_by, charted_at) VALUES (1,36,'caries',2,'2026-06-13')"));
  aborts('a receptionist CANNOT chart a tooth (trg_chart_author)', () =>
    d.run("INSERT INTO odontogram (patient_id, tooth_fdi, status, charted_by, charted_at) VALUES (1,37,'caries',3,'2026-06-13')"));
  noThrow('a dentist can author a treatment plan', () =>
    d.run("INSERT INTO treatment_plans (patient_id, status, dentist_id, created_at) VALUES (1,'in_progress',1,'2026-06-13')"));
  aborts('a hygienist CANNOT author a treatment plan (trg_plan_author)', () =>
    d.run("INSERT INTO treatment_plans (patient_id, status, dentist_id, created_at) VALUES (1,'in_progress',2,'2026-06-13')"));

  // ---- #4 odontogram + treatment-plan round-trip ----
  assert(one("SELECT status FROM odontogram WHERE patient_id=1 AND tooth_fdi=36") === 'caries', 'odontogram stores the charted status');
  const planId = one("SELECT plan_id FROM treatment_plans WHERE patient_id=1 LIMIT 1");
  d.run(`INSERT INTO treatment_plan_items (plan_id, patient_id, procedure_code, procedure_name_en, tooth_fdi, price, status, dentist_id, created_at) VALUES (${planId},1,'D2391','Composite Filling',36,250,'planned',1,'2026-06-13')`);
  assert(Number(one("SELECT price FROM treatment_plan_items WHERE procedure_code='D2391'")) === 250, 'treatment-plan item keeps its price');
  d.run("UPDATE treatment_plan_items SET status='completed', completed_at='2026-06-13' WHERE procedure_code='D2391'");
  assert(one("SELECT status FROM treatment_plan_items WHERE procedure_code='D2391'") === 'completed', 'a procedure can be marked completed');

  // ---- #5 the allergy guard (the showcase safety moment) ----
  const pen = [{ allergen: 'Penicillin', severity: 'severe' }];
  const amoxHit = checkDrugAllergy('Amoxicillin 500mg', pen);
  assert(!!amoxHit, 'penicillin-allergic patient + amoxicillin -> allergy hit (BLOCK)');
  const clindaHit = checkDrugAllergy('Clindamycin 300mg', pen);
  assert(!clindaHit, 'penicillin-allergic patient + clindamycin -> no hit (safe alternative)');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
