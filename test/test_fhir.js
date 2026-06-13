'use strict';
// FHIR R4 read facade: proves the /api/fhir endpoints shape existing OpenWard data
// into valid R4 resources, enforce auth + RBAC + department scoping, audit reads,
// and that the pure mappers in js/fhir-map.js produce the expected JSON shapes.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

process.env.OPENWARD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-fhir-'));
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';
process.env.OPENWARD_DEMO = '1';   // uses the seeded demo accounts (er.doc / consultant)

const server = require('../server/server.js');
const fhir = require('../js/fhir-map.js');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

function makeClient(base) {
  let cookie = '';
  return async (method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch (e) {}
    return { status: res.status, json, contentType: res.headers.get('content-type') };
  };
}

// ---------- pure mapper unit tests (no HTTP) ----------
function mapperUnitTests() {
  console.log('  -- pure mappers --');
  const p = fhir.patientResource({ patient_id: 5, mrn: 'HIS-1', national_id: 'N9', full_name_en: 'John Q Doe', full_name_ar: 'جون', date_of_birth: '2000-01-02', gender: 'female', phone: '555' });
  assert(p.resourceType === 'Patient' && p.id === '5', 'patientResource: type+id');
  assert(p.identifier.some(i => i.system === fhir.SYS.mrn && i.value === 'HIS-1'), 'patientResource: MRN identifier');
  assert(p.gender === 'female' && p.birthDate === '2000-01-02', 'patientResource: gender + birthDate');
  assert(p.name[0].family === 'Doe' && Array.isArray(p.name[0].given), 'patientResource: name split into family/given');

  const icd = fhir.conditionResource({ id: 1, patient_id: 5, condition_code: 'E11.9', display: 'Type 2 diabetes' });
  assert(icd.code.coding[0].system === fhir.SYS.icd10 && icd.code.coding[0].code === 'E11.9', 'conditionResource: ICD-10 coding');
  assert(icd.clinicalStatus.coding[0].code === 'active', 'conditionResource: defaults to active');

  const legacy = fhir.conditionResource({ id: 2, patient_id: 5, condition_code: 'cardiac' });
  assert(!legacy.code.coding && legacy.code.text === 'Cardiac', 'conditionResource: legacy token -> humanized text, no coding');

  const resolved = fhir.conditionResource({ id: 3, patient_id: 5, condition_code: 'I10', status: 'resolved', resolved_date: '2020-01-01' });
  assert(resolved.clinicalStatus.coding[0].code === 'resolved' && resolved.abatementDateTime === '2020-01-01', 'conditionResource: resolved -> abatementDateTime');

  const obs = fhir.vitalsToObservations({ vitals_id: 7, admission_id: 3, recorded_at: '2026-01-01T00:00:00Z', heart_rate: 80, bp_systolic: 120, bp_diastolic: 80 }, 5);
  assert(obs.length === 2, 'vitalsToObservations: BP panel + heart rate = 2 observations');
  const bp = obs.find(o => o.code.coding[0].code === '85354-9');
  assert(bp && bp.component.length === 2, 'vitalsToObservations: BP has systolic+diastolic components');
  assert(obs.every(o => o.category[0].coding[0].code === 'vital-signs'), 'vitalsToObservations: vital-signs category');

  const mr = fhir.medicationRequestResource({ rx_id: 9, admission_id: 3, drug_name: 'Aspirin', dose: '81 mg', route: 'PO', frequency: 'daily', status: 'active', prescribed_at: '2026-01-01T00:00:00Z' }, 5);
  assert(mr.status === 'active' && mr.medicationCodeableConcept.text === 'Aspirin', 'medicationRequestResource: status + drug');
  assert(mr.dosageInstruction[0].text.includes('81 mg'), 'medicationRequestResource: dosage text');

  assert(fhir.fhirGender('M') === 'male' && fhir.fhirGender('') === 'unknown' && fhir.fhirGender('Female') === 'female', 'fhirGender mapping');
  assert(fhir.searchBundle([{ resourceType: 'Patient', id: '1' }]).total === 1, 'searchBundle: total counts entries');
  assert(fhir.operationOutcome('error', 'x', 'y').resourceType === 'OperationOutcome', 'operationOutcome shape');
  assert(fhir.labObservation({ detail_id: 1, component_en: 'Potassium', value: '6.2', unit: 'mmol/L', flag: 'critical-high' }, 5).interpretation[0].coding[0].code === 'HH', 'labObservation: critical-high -> HH interpretation');
}

(async () => {
  mapperUnitTests();

  await server.init();
  const httpServer = server.start();
  if (!httpServer.listening) await new Promise(r => httpServer.once('listening', r));
  const base = `http://127.0.0.1:${httpServer.address().port}`;
  console.log('  -- HTTP facade --');

  const D = makeClient(base);   // er.doc — emergency_doctor, dept 1 (CLINICAL: view_chart)
  const C = makeClient(base);   // consultant — dept 2 (CLINICAL, but different dept)
  const X = makeClient(base);   // unauthenticated

  // unauthenticated is blocked before any FHIR logic
  assert((await X('GET', '/api/fhir/metadata')).status === 401, 'unauthenticated FHIR is 401');

  assert((await D('POST', '/api/login', { username: 'er.doc', password: 'doctor123' })).status === 200, 'er.doc logs in');

  // er.doc registers a patient -> active admission in dept 1 (er.doc's dept)
  const reg = await D('POST', '/api/patients', { full_name_ar: 'سالم تجريبي', full_name_en: 'Salem Test', dept_id: 1, bed_number: 'F1', gender: 'male', date_of_birth: '1981-03-15' });
  assert(reg.status === 201, 'er.doc registers a patient');
  const pid = reg.json.patient_id, mrn = reg.json.mrn;
  const detail = await D('GET', `/api/patients/${pid}`);
  const aid = detail.json.admission.admission_id;
  assert(!!aid, 'patient has an active admission');

  // seed clinical data through the existing endpoints / bridge
  assert((await D('POST', '/api/vitals', { admission_id: aid, bp_systolic: 120, bp_diastolic: 80, heart_rate: 88, temperature: 37.2, o2_sat: 97, resp_rate: 18 })).status === 201, 'vitals recorded');
  assert((await D('POST', '/api/prescriptions', { admission_id: aid, drug_id: 1, dose: '500 mg', route: 'PO', frequency: 'q8h' })).status === 201, 'paracetamol prescribed');
  assert((await D('POST', '/api/db/exec', { sql: "INSERT INTO patient_conditions (patient_id, condition_code, category, severity, added_at) VALUES (?, 'E11.9', 'chronic', 'moderate', ?)", params: [pid, new Date().toISOString()] })).status === 200, 'condition (E11.9) inserted via bridge');
  assert((await D('POST', '/api/db/exec', { sql: "INSERT INTO patient_allergies (patient_id, allergen, reaction, severity, added_at) VALUES (?, 'Peanut', 'hives', 'moderate', ?)", params: [pid, new Date().toISOString()] })).status === 200, 'allergy (Peanut) inserted via bridge');

  // metadata / CapabilityStatement
  const meta = await D('GET', '/api/fhir/metadata');
  assert(meta.status === 200 && meta.json.resourceType === 'CapabilityStatement', 'metadata is a CapabilityStatement');
  assert(/application\/fhir\+json/.test(meta.contentType || ''), 'metadata served as application/fhir+json');
  const advertised = meta.json.rest[0].resource.map(r => r.type);
  assert(['Patient', 'Condition', 'AllergyIntolerance', 'MedicationRequest', 'Observation', 'Encounter'].every(t => advertised.includes(t)), 'metadata advertises all 6 resources');

  // Patient read by id
  const pat = await D('GET', `/api/fhir/Patient/${pid}`);
  assert(pat.status === 200 && pat.json.resourceType === 'Patient' && pat.json.id === String(pid), 'Patient/{id} read');
  assert(pat.json.identifier.some(i => i.value === mrn) && pat.json.birthDate === '1981-03-15' && pat.json.gender === 'male', 'Patient has MRN identifier + birthDate + gender');

  // Patient search by identifier (MRN)
  const psearch = await D('GET', `/api/fhir/Patient?identifier=${encodeURIComponent(mrn)}`);
  assert(psearch.status === 200 && psearch.json.resourceType === 'Bundle' && psearch.json.total >= 1, 'Patient?identifier= returns a searchset Bundle');
  assert(psearch.json.entry[0].resource.id === String(pid), 'Patient search matched the right patient');

  // Observation (vitals)
  const obs = await D('GET', `/api/fhir/Observation?patient=${pid}`);
  assert(obs.status === 200 && obs.json.resourceType === 'Bundle' && obs.json.total >= 2, 'Observation?patient= returns vitals as a Bundle');
  const codes = obs.json.entry.map(e => e.resource.code.coding[0].code);
  assert(codes.includes('8867-4') && codes.includes('85354-9'), 'Observation includes heart-rate (8867-4) + BP panel (85354-9)');

  // MedicationRequest
  const mr = await D('GET', `/api/fhir/MedicationRequest?patient=${pid}`);
  assert(mr.status === 200 && mr.json.total >= 1 && /Paracetamol/i.test(mr.json.entry[0].resource.medicationCodeableConcept.text), 'MedicationRequest returns the prescription');

  // Condition (ICD-10 coded)
  const cond = await D('GET', `/api/fhir/Condition?patient=${pid}`);
  assert(cond.status === 200 && cond.json.total >= 1, 'Condition?patient= returns a Bundle');
  assert(cond.json.entry[0].resource.code.coding[0].system === fhir.SYS.icd10 && cond.json.entry[0].resource.code.coding[0].code === 'E11.9', 'Condition carries ICD-10 coding (E11.9)');

  // AllergyIntolerance
  const allg = await D('GET', `/api/fhir/AllergyIntolerance?patient=${pid}`);
  assert(allg.status === 200 && allg.json.total >= 1 && allg.json.entry[0].resource.code.text === 'Peanut', 'AllergyIntolerance returns the allergy');

  // Encounter
  const enc = await D('GET', `/api/fhir/Encounter?patient=${pid}`);
  assert(enc.status === 200 && enc.json.total >= 1 && enc.json.entry[0].resource.status === 'in-progress', 'Encounter returns the active admission (in-progress)');

  // ---- error + scoping behaviour ----
  assert((await D('GET', '/api/fhir/Frobnicate?patient=1')).status === 404, 'unsupported resource type -> 404');
  assert((await D('GET', '/api/fhir/Frobnicate?patient=1')).json.resourceType === 'OperationOutcome', 'unsupported resource -> OperationOutcome');
  assert((await D('GET', '/api/fhir/Condition')).status === 400, 'clinical search without ?patient -> 400');
  assert((await D('GET', '/api/fhir/Patient/99999')).status === 404, 'Patient read of missing id -> 404');
  assert((await D('POST', '/api/fhir/Patient/' + pid)).status === 405, 'write to the read-only facade -> 405');

  // department scoping: consultant (dept 2) cannot read this dept-1 patient's chart
  assert((await C('POST', '/api/login', { username: 'consultant', password: 'doctor123' })).status === 200, 'consultant logs in');
  const denied = await C('GET', `/api/fhir/Condition?patient=${pid}`);
  assert(denied.status === 403 && denied.json.resourceType === 'OperationOutcome', 'out-of-department FHIR read is 403 (OperationOutcome)');

  // every legitimate FHIR read is audited; er.doc isn't oversight (so /api/audit is
  // forbidden), but it can read the action type it caused via the bridge.
  const auditQ = await D('POST', '/api/db/query', { sql: "SELECT action_type FROM audit_log WHERE action_type='FHIR_READ' LIMIT 1" });
  assert(auditQ.status === 200 && auditQ.json.rows.length >= 1, 'FHIR reads are audited (FHIR_READ row present)');

  httpServer.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
