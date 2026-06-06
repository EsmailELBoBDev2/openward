'use strict';
// Central authorization. Checked on the SERVER for every protected route — not
// sidebar visibility. (In the browser app, "authz" was just which buttons
// rendered; anyone with DevTools bypassed it. Here the client is untrusted.)

const ROLE_CAPS = {
  it_admin:         ['users:manage', 'audit:read', 'system:admin'],
  hospital_manager: ['audit:read', 'patients:read', 'reports:read'],
  consultant:       ['patients:read', 'patients:write', 'orders:write'],
  doctor:           ['patients:read', 'patients:write', 'orders:write'],
  er_doctor:        ['patients:read', 'patients:write', 'orders:write'],
  senior_nurse:     ['patients:read', 'vitals:write', 'mar:write'],
  nurse:            ['patients:read', 'vitals:write', 'mar:write'],
  pharmacist:       ['patients:read', 'rx:verify'],
  patient:          ['portal:self'],
};

function can(role, cap) {
  const caps = ROLE_CAPS[role];
  return !!caps && caps.includes(cap);
}

// ABAC scoping: which patients may this user load? Returns a SQL fragment + params
// joined against `admissions a`. Managers/IT see all; clinicians see their own
// attending list or department; everyone else sees none. (Assignment tables make
// this richer in a later slice; the point is scoping happens on the server.)
function patientScopeWhere(user) {
  if (user.role === 'it_admin' || can(user.role, 'audit:read')) return { sql: '1=1', params: [] };
  if (['doctor', 'consultant', 'er_doctor'].includes(user.role)) return { sql: 'a.attending_id = ?', params: [user.user_id] };
  if (user.department_id != null) return { sql: 'a.dept_id = ?', params: [user.department_id] };
  return { sql: '0=1', params: [] };
}

module.exports = { ROLE_CAPS, can, patientScopeWhere };
