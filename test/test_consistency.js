'use strict';
// Cross-file consistency guards for three "silent regression" bugs that don't
// throw a parse error but quietly do the wrong thing at runtime:
//   1. The code-status SAFETY banner (utils.js) must key off the SAME values the
//      code-status picker writes (easy-features.js). A mismatch = a patient set
//      to "Full Code"/"Limited" shows NO badge on the safety bar.
//   2. The post-vitals "just-inserted row" lookup (router.js) must use the real
//      PK column (vitals_id). MAX(id) threw "no such column: id".
//   3. The login "Reset" button (index.html) must wipe the WHOLE local store,
//      not just the legacy 'main' key, or generational snapshots reload the
//      "deleted" data.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// ---- 1. code-status banner keys ⊆ picker values --------------------------
const ef = read('js/easy-features.js');
const utils = read('js/utils.js');

// Picker option values: the CODE_STATUS_OPTIONS array entries `value: '...'`.
const pickerVals = new Set();
const valRe = /\bvalue:\s*'([^']+)'/g;
let mm;
while ((mm = valRe.exec(ef))) pickerVals.add(mm[1]);
assert(pickerVals.has('full') && pickerVals.has('dnr') && pickerVals.has('dni') && pickerVals.has('limited'),
  `picker defines full/dnr/dni/limited (got: ${[...pickerVals].join(',')})`);

// Banner lookup keys: the object literal assigned to codeStatusLbl.
const blk = utils.match(/codeStatusLbl\s*=\s*\{([\s\S]*?)\}\s*\[/);
assert(!!blk, 'found codeStatusLbl lookup object in utils.js');
const bannerKeys = new Set();
if (blk) { const kRe = /(\w+)\s*:\s*\{/g; let km; while ((km = kRe.exec(blk[1]))) bannerKeys.add(km[1]); }
const orphanKeys = [...bannerKeys].filter(k => !pickerVals.has(k));
assert(orphanKeys.length === 0,
  `every banner key maps to a real picker value` + (orphanKeys.length ? ` (orphans: ${orphanKeys.join(',')})` : ''));
// The actionable ones must actually render.
['full', 'dnr', 'dni', 'limited'].forEach(k =>
  assert(bannerKeys.has(k), `safety banner renders code-status "${k}"`));

// ---- 2. vitals "last row" lookup uses the real PK column -----------------
const router = read('js/router.js');
const dbjs = read('js/db.js');
assert(/vitals_id\s+INTEGER PRIMARY KEY/.test(dbjs), 'vitals_log PK column is vitals_id');
assert(!/MAX\(id\)\s+(?:as|AS)\s+id\s+FROM\s+vitals_log/i.test(router),
  'no MAX(id) FROM vitals_log (would throw "no such column: id")');
assert(/MAX\(vitals_id\)[\s\S]{0,20}FROM\s+vitals_log/i.test(router),
  'vitals row lookup uses MAX(vitals_id)');

// ---- 3. Reset wipes the whole store, not just legacy 'main' --------------
const html = read('index.html');
const clearFn = html.match(/async function clearDatabase\(\)[\s\S]*?\n    \}/);
assert(!!clearFn, 'found clearDatabase() in index.html');
if (clearFn) {
  assert(/wipeLocalDatabase\s*\(/.test(clearFn[0]) || /objectStore\('databases'\)\.clear\(\)/.test(clearFn[0]),
    'clearDatabase() clears the whole store (wipeLocalDatabase / .clear())');
  assert(!/\.delete\('main'\)/.test(clearFn[0]),
    'clearDatabase() does NOT delete only the legacy \'main\' key');
}

// ---- 4. Central view gate: no role is locked out of its own landing view ----
// (navigateTo() now enforces VIEW_PREFIX_ROLES; a typo there could lock a role
// out of the very view it lands on after login.)
{
  const r = read('js/router.js');
  const defM = r.match(/const defaults = \{([\s\S]*?)\};/);
  const mapM = r.match(/const VIEW_PREFIX_ROLES = \{([\s\S]*?)\};/);
  assert(!!defM && !!mapM, 'router.js has both the defaults map and VIEW_PREFIX_ROLES');
  if (defM && mapM) {
    const defs = [...defM[1].matchAll(/(\w+):\s*'([\w-]+)'/g)].map(m => [m[1], m[2]]);
    const map = {};
    for (const m of mapM[1].matchAll(/'([a-z]+-)':\s*\[([^\]]*)\]/g)) map[m[1]] = m[2].match(/[a-z_]+/g) || [];
    const lockouts = defs.filter(([role, view]) => {
      const p = Object.keys(map).find(p => view.startsWith(p));
      return !p || !map[p].includes(role);
    });
    assert(defs.length >= 15, `found ${defs.length} role default views`);
    assert(lockouts.length === 0,
      'every role can access its default view' + (lockouts.length ? ' (locked out: ' + lockouts.map(l => l.join('->')).join(', ') + ')' : ''));
  }
}

// ---- 5. High-alert meds: dose calculator must NOT auto-fill them -------------
{
  const cd = read('js/clinical-decision.js');
  const setM = cd.match(/const HIGH_ALERT_DRUGS = new Set\(\[([\s\S]*?)\]\)/);
  assert(!!setM, 'clinical-decision.js defines HIGH_ALERT_DRUGS');
  if (setM) {
    const keys = (setM[1].match(/'[a-z_]+'/g) || []).map(s => s.replace(/'/g, ''));
    ['insulin_regular', 'morphine', 'heparin', 'warfarin', 'potassium_chloride'].forEach(k =>
      assert(keys.includes(k), `HIGH_ALERT_DRUGS includes ${k}`));
  }
  // The one-click auto-fill (sets the dose input .value) must be gated by the set.
  assert(/HIGH_ALERT_DRUGS\.has\(drug\)\s*\n?\s*\?/.test(cd) || /HIGH_ALERT_DRUGS\.has\(drug\)/.test(cd),
    'dose auto-fill is guarded by HIGH_ALERT_DRUGS.has(drug)');
}

// ---- 6. Order sets: unmatched meds -> exceptions, and honest counts ----------
{
  const r = read('js/router.js');
  const fn = r.match(/async function handleApplyOrderSet\([\s\S]*?\n\}/);
  assert(!!fn, 'found handleApplyOrderSet()');
  if (fn) {
    const body = fn[0];
    assert(/order_set_exceptions/.test(body), 'unmatched order-set meds go to order_set_exceptions');
    assert(!/INSERT INTO nursing_tasks/.test(body),
      'order sets no longer write nursing_tasks (which were doctor-owned + shown-as-done)');
    assert(/'task'/.test(body), 'order-set tasks are recorded as pending follow-ups (item_type task)');
    assert(/createdRx/.test(body) && /manualMeds/.test(body), 'tracks createdRx vs manualMeds');
    assert(!/\$\{os\.meds\.length\} meds`/.test(body), 'success/audit no longer reports os.meds.length as "meds" (would over-count)');
  }
}

// ---- 7. MAR lifecycle: dispensed meds stay administrable -------------------
// handleDispense() flips prescriptions.status 'active' -> 'dispensed'. If a MAR
// surface filters p.status = 'active' only, every med disappears from the MAR
// the moment pharmacy dispenses it and can never be charted. Both MAR queries
// (full MAR view + embedded MAR on the nurse patient chart) must include both.
{
  const r = read('js/router.js');
  assert(/UPDATE prescriptions SET status = 'dispensed'/.test(r),
    'dispense flow marks prescriptions dispensed (precondition for this guard)');
  const marQueries = r.match(/p\.status IN \('active', ?'dispensed'\)/g) || [];
  assert(marQueries.length >= 2,
    `both MAR surfaces include dispensed meds (found ${marQueries.length} of 2 IN ('active','dispensed') filters)`);

  // No med_admin_records query may filter status='pending': nothing ever writes
  // pending rows (the only INSERT charts given/held/refused), so such a query
  // silently matches zero rows forever — that's how the "doses due" nurse alert
  // was dead on arrival.
  const pendingMar = r.match(/FROM med_admin_records[\s\S]{0,200}?status\s*=\s*'pending'/g) || [];
  assert(pendingMar.length === 0,
    'no med_admin_records query filters the never-written status=pending');

  // The save handler must re-validate against the DB, not trust render-time args:
  // the admission can be discharged / the order discontinued while the form is open.
  const fn = r.match(/async function handleLogMAR\([\s\S]*?\n\}/);
  assert(!!fn, 'found handleLogMAR()');
  if (fn) {
    assert(/JOIN admissions/.test(fn[0]) && /adm_status/.test(fn[0]),
      'handleLogMAR re-reads the rx + admission at save time (TOCTOU guard)');
    assert(/fresh\.drug_name/.test(fn[0]),
      'handleLogMAR charts the DB values, not the render-time snapshot args');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
