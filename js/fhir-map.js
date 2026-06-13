'use strict';
/*
 * FHIR R4 resource mappers — PURE functions that turn an OpenWard DB row into a
 * FHIR R4 resource. No DB access, no HTTP, no side effects: the server fetches
 * rows (and enforces auth/RBAC/scoping/audit) and hands them here only to shape
 * the JSON. Keeping the mapping pure is what lets test/test_fhir.js assert the
 * resource shapes without standing up the HTTP layer.
 *
 * This is a READ-ONLY interoperability facade (FHIR search/read). It maps the
 * tables that already exist; it does NOT add clinical meaning. FHIR writes,
 * SMART-on-FHIR scopes, and HL7v2/CCDA are deliberately out of scope here.
 */

// Coding systems (canonical FHIR/HL7 URIs where one exists; local urns otherwise).
const SYS = {
  icd10:        'http://hl7.org/fhir/sid/icd-10',
  loinc:        'http://loinc.org',
  mrn:          'urn:openward:mrn',
  nationalId:   'urn:openward:national-id',
  condClinical: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  condVerif:    'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  allgClinical: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
  obsCategory:  'http://terminology.hl7.org/CodeSystem/observation-category',
  interp:       'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
  actCode:      'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  ucum:         'http://unitsofmeasure.org',
};
const FHIR_VERSION = '4.0.1';
const SOFTWARE = { name: 'OpenWard', version: '0.0.0' };

// ---- small helpers ----------------------------------------------------------
function trimOrNull(v) { const s = (v == null ? '' : String(v)).trim(); return s || null; }
function humanize(token) { return String(token || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function isIcd10(code) { return /^[A-Za-z]\d/.test(String(code || '')); }   // I10, E11.9, J45.9 — not legacy tokens like "cardiac"

function fhirGender(g) {
  const s = String(g || '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (s[0] === 'm' || s.includes('ذكر')) return 'male';
  if (s[0] === 'f' || s.includes('أنث') || s.includes('انث')) return 'female';
  return 'other';
}
// reaction.severity is the small R4 value set: mild | moderate | severe
function reactionSeverity(sev) {
  const s = String(sev || '').toLowerCase();
  if (!s) return undefined;
  if (s.includes('anaphyl') || s.includes('severe') || s.includes('شديد')) return 'severe';
  if (s.includes('mod') || s.includes('متوسط')) return 'moderate';
  return 'mild';
}
// lab flag -> v3 ObservationInterpretation code
function interpretationCode(flag) {
  const s = String(flag || '').toLowerCase();
  if (s.includes('crit')) return s.includes('low') ? 'LL' : (s.includes('high') ? 'HH' : 'AA');
  if (s.includes('high') || s === 'h') return 'H';
  if (s.includes('low') || s === 'l') return 'L';
  if (s === 'abnormal' || s.includes('abn')) return 'A';
  return null;   // normal / unknown -> omit interpretation
}

// ---- Patient ----------------------------------------------------------------
function patientResource(p) {
  if (!p) return null;
  const identifier = [];
  if (trimOrNull(p.mrn))         identifier.push({ use: 'official', type: { text: 'Medical Record Number' }, system: SYS.mrn, value: String(p.mrn) });
  if (trimOrNull(p.national_id)) identifier.push({ system: SYS.nationalId, value: String(p.national_id) });
  const name = [];
  const en = trimOrNull(p.full_name_en);
  const ar = trimOrNull(p.full_name_ar);
  if (en) {
    const parts = en.split(/\s+/);
    name.push({ use: 'official', text: en, family: parts.length > 1 ? parts[parts.length - 1] : parts[0], given: parts.length > 1 ? parts.slice(0, -1) : undefined });
  }
  if (ar) name.push({ use: 'official', text: ar, extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/translation', valueCode: 'ar' }] });
  const r = { resourceType: 'Patient', id: String(p.patient_id), identifier, name, gender: fhirGender(p.gender) };
  if (trimOrNull(p.date_of_birth)) r.birthDate = String(p.date_of_birth).slice(0, 10);
  if (trimOrNull(p.phone)) r.telecom = [{ system: 'phone', value: String(p.phone), use: 'mobile' }];
  return r;
}

// ---- Condition (problem list) ----------------------------------------------
function conditionResource(c) {
  if (!c) return null;
  const display = trimOrNull(c.display) || (isIcd10(c.condition_code) ? String(c.condition_code) : humanize(c.condition_code));
  const code = { text: display };
  if (isIcd10(c.condition_code)) code.coding = [{ system: SYS.icd10, code: String(c.condition_code), display }];
  const resolved = String(c.status || '').toLowerCase() === 'resolved' || trimOrNull(c.resolved_date);
  const r = {
    resourceType: 'Condition',
    id: String(c.id),
    clinicalStatus: { coding: [{ system: SYS.condClinical, code: resolved ? 'resolved' : 'active' }] },
    verificationStatus: { coding: [{ system: SYS.condVerif, code: 'confirmed' }] },
    code,
    subject: { reference: 'Patient/' + c.patient_id },
  };
  if (trimOrNull(c.onset_date))    r.onsetDateTime = String(c.onset_date);
  if (trimOrNull(c.resolved_date)) r.abatementDateTime = String(c.resolved_date);
  if (trimOrNull(c.added_at))      r.recordedDate = String(c.added_at);
  return r;
}

// ---- AllergyIntolerance -----------------------------------------------------
function allergyResource(a) {
  if (!a) return null;
  const r = {
    resourceType: 'AllergyIntolerance',
    id: String(a.id),
    clinicalStatus: { coding: [{ system: SYS.allgClinical, code: 'active' }] },
    type: 'allergy',
    code: { text: String(a.allergen) },
    patient: { reference: 'Patient/' + a.patient_id },
  };
  if (reactionSeverity(a.severity) === 'severe') r.criticality = 'high';
  if (trimOrNull(a.reaction)) {
    const reaction = { manifestation: [{ text: String(a.reaction) }] };
    const sev = reactionSeverity(a.severity);
    if (sev) reaction.severity = sev;
    r.reaction = [reaction];
  }
  if (trimOrNull(a.added_at)) r.recordedDate = String(a.added_at);
  return r;
}

// ---- MedicationRequest ------------------------------------------------------
function medicationRequestResource(rx, patientId) {
  if (!rx) return null;
  const STATUS = { active: 'active', discontinued: 'stopped', stopped: 'stopped', completed: 'completed', held: 'on-hold', cancelled: 'cancelled' };
  const dosageText = [rx.dose, rx.route, rx.frequency].map(trimOrNull).filter(Boolean).join(' ');
  const r = {
    resourceType: 'MedicationRequest',
    id: String(rx.rx_id),
    status: STATUS[String(rx.status || '').toLowerCase()] || 'unknown',
    intent: 'order',
    medicationCodeableConcept: { text: String(rx.drug_name) },
    subject: { reference: 'Patient/' + patientId },
  };
  if (rx.admission_id != null) r.encounter = { reference: 'Encounter/' + rx.admission_id };
  if (trimOrNull(rx.prescribed_at) || trimOrNull(rx.start_date)) r.authoredOn = String(rx.prescribed_at || rx.start_date);
  if (dosageText) {
    const dosage = { text: dosageText };
    if (trimOrNull(rx.route))     dosage.route = { text: String(rx.route) };
    if (trimOrNull(rx.frequency)) dosage.timing = { code: { text: String(rx.frequency) } };
    r.dosageInstruction = [dosage];
  }
  return r;
}

// ---- Observation: vitals ----------------------------------------------------
// One vitals_log row holds several measurements; FHIR wants one Observation per
// measurement (blood pressure is a single Observation with two components).
const VITAL_SPECS = [
  { field: 'heart_rate',  loinc: '8867-4',  text: 'Heart rate',        unit: '/min', ucum: '/min' },
  { field: 'resp_rate',   loinc: '9279-1',  text: 'Respiratory rate',  unit: '/min', ucum: '/min' },
  { field: 'temperature', loinc: '8310-5',  text: 'Body temperature',  unit: 'Cel',  ucum: 'Cel' },
  { field: 'o2_sat',      loinc: '59408-5', text: 'Oxygen saturation', unit: '%',    ucum: '%' },
  { field: 'rbs',         loinc: '2339-0',  text: 'Glucose [Mass/Vol]', unit: 'mg/dL', ucum: 'mg/dL' },
  { field: 'weight_kg',   loinc: '29463-7', text: 'Body weight',       unit: 'kg',   ucum: 'kg' },
  { field: 'height_cm',   loinc: '8302-2',  text: 'Body height',       unit: 'cm',   ucum: 'cm' },
];
function vitalSignBase(v, patientId, idSuffix, code, codeText) {
  const r = {
    resourceType: 'Observation',
    id: 'vitals-' + v.vitals_id + '-' + idSuffix,
    status: 'final',
    category: [{ coding: [{ system: SYS.obsCategory, code: 'vital-signs', display: 'Vital Signs' }] }],
    code,
    subject: { reference: 'Patient/' + patientId },
  };
  if (v.admission_id != null) r.encounter = { reference: 'Encounter/' + v.admission_id };
  if (trimOrNull(v.recorded_at)) r.effectiveDateTime = String(v.recorded_at);
  if (codeText) r.code.text = codeText;
  return r;
}
function vitalsToObservations(v, patientId) {
  if (!v) return [];
  const out = [];
  // Blood pressure panel (one Observation, two components)
  const sys = Number(v.bp_systolic), dia = Number(v.bp_diastolic);
  if (Number.isFinite(sys) || Number.isFinite(dia)) {
    const bp = vitalSignBase(v, patientId, 'bp',
      { coding: [{ system: SYS.loinc, code: '85354-9', display: 'Blood pressure panel' }] }, 'Blood pressure');
    bp.component = [];
    if (Number.isFinite(sys)) bp.component.push({ code: { coding: [{ system: SYS.loinc, code: '8480-6', display: 'Systolic blood pressure' }] }, valueQuantity: { value: sys, unit: 'mmHg', system: SYS.ucum, code: 'mm[Hg]' } });
    if (Number.isFinite(dia)) bp.component.push({ code: { coding: [{ system: SYS.loinc, code: '8462-4', display: 'Diastolic blood pressure' }] }, valueQuantity: { value: dia, unit: 'mmHg', system: SYS.ucum, code: 'mm[Hg]' } });
    out.push(bp);
  }
  for (const spec of VITAL_SPECS) {
    if (!(spec.field in v) || v[spec.field] == null || v[spec.field] === '') continue;
    const n = Number(v[spec.field]);
    if (!Number.isFinite(n)) continue;
    const o = vitalSignBase(v, patientId, spec.field,
      { coding: [{ system: SYS.loinc, code: spec.loinc, display: spec.text }] }, spec.text);
    o.valueQuantity = { value: n, unit: spec.unit, system: SYS.ucum, code: spec.ucum };
    out.push(o);
  }
  return out;
}

// ---- Observation: lab result component -------------------------------------
function labObservation(d, patientId) {
  if (!d) return null;
  const r = {
    resourceType: 'Observation',
    id: 'lab-' + d.detail_id,
    status: 'final',
    category: [{ coding: [{ system: SYS.obsCategory, code: 'laboratory', display: 'Laboratory' }] }],
    code: { text: String(d.component_en || d.component_ar || 'Lab result') },
    subject: { reference: 'Patient/' + patientId },
  };
  if (d.admission_id != null) r.encounter = { reference: 'Encounter/' + d.admission_id };
  if (trimOrNull(d.effective)) r.effectiveDateTime = String(d.effective);
  const num = Number(d.value);
  if (trimOrNull(d.unit) && Number.isFinite(num)) r.valueQuantity = { value: num, unit: String(d.unit) };
  else if (trimOrNull(d.value)) r.valueString = String(d.value);
  if (trimOrNull(d.ref_range)) r.referenceRange = [{ text: String(d.ref_range) }];
  const ic = interpretationCode(d.flag);
  if (ic) r.interpretation = [{ coding: [{ system: SYS.interp, code: ic }] }];
  return r;
}

// ---- Encounter --------------------------------------------------------------
function encounterResource(a) {
  if (!a) return null;
  const status = String(a.status || '').toLowerCase() === 'active' && !a.discharged_at ? 'in-progress' : 'finished';
  const r = {
    resourceType: 'Encounter',
    id: String(a.admission_id),
    status,
    class: { system: SYS.actCode, code: 'IMP', display: 'inpatient encounter' },
    subject: { reference: 'Patient/' + a.patient_id },
  };
  const period = {};
  if (trimOrNull(a.admitted_at))   period.start = String(a.admitted_at);
  if (trimOrNull(a.discharged_at)) period.end = String(a.discharged_at);
  if (period.start || period.end) r.period = period;
  if (trimOrNull(a.chief_complaint)) r.reasonCode = [{ text: String(a.chief_complaint) }];
  return r;
}

// ---- Bundle / OperationOutcome / CapabilityStatement -----------------------
function searchBundle(resources, baseUrl) {
  const list = (resources || []).filter(Boolean);
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: list.length,
    entry: list.map(r => {
      const e = { resource: r };
      if (baseUrl) e.fullUrl = baseUrl.replace(/\/$/, '') + '/' + r.resourceType + '/' + r.id;
      return e;
    }),
  };
}
function operationOutcome(severity, code, diagnostics) {
  return { resourceType: 'OperationOutcome', issue: [{ severity, code, diagnostics: diagnostics || code }] };
}
const SUPPORTED = ['Patient', 'Condition', 'AllergyIntolerance', 'MedicationRequest', 'Observation', 'Encounter'];
function capabilityStatement(now) {
  return {
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: (now || new Date().toISOString()).slice(0, 10),
    kind: 'instance',
    software: SOFTWARE,
    implementation: { description: 'OpenWard FHIR R4 read-only facade' },
    fhirVersion: FHIR_VERSION,
    format: ['json', 'application/fhir+json'],
    rest: [{
      mode: 'server',
      documentation: 'Read-only. Search by patient (clinical resources) or id/identifier (Patient).',
      resource: SUPPORTED.map(type => ({
        type,
        interaction: type === 'Patient'
          ? [{ code: 'read' }, { code: 'search-type' }]
          : [{ code: 'search-type' }],
        searchParam: type === 'Patient'
          ? [{ name: 'identifier', type: 'token' }]
          : [{ name: 'patient', type: 'reference' }],
      })),
    }],
  };
}

// Server-only module (not loaded in index.html), but guard the export the same
// way the other dual-use sources (utils.js, allergy-check.js) do.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SYS, SUPPORTED, FHIR_VERSION,
    isIcd10, fhirGender, reactionSeverity, interpretationCode,
    patientResource, conditionResource, allergyResource, medicationRequestResource,
    vitalsToObservations, labObservation, encounterResource,
    searchBundle, operationOutcome, capabilityStatement,
  };
}
