// Validates clock-tamper detection (blackbox.js): backward-vs-last-record AND
// the monotonic in-session drift check that closes the "wait 1 second" bypass.
const path = require('path');
const { _clockAnomalyNote, _computeDrift, _humanizeDuration, CLOCK_ANOMALY_TOLERANCE_MS } = require(path.resolve('js/blackbox.js'));

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

const last = '2026-06-04T12:00:00.000Z';
const minus = (sec) => new Date(Date.parse(last) - sec * 1000).toISOString();
const plus  = (sec) => new Date(Date.parse(last) + sec * 1000).toISOString();

// --- signal 1: time behind the last record ---
let n = _clockAnomalyNote(minus(4 * 3600), last);
assert(n.includes('4h') && n.includes('behind'), 'record 4h before the last one -> flagged ("' + n + '")');
assert(_clockAnomalyNote(minus(30), last) === '', '30s back (within tolerance) -> no anomaly');
assert(_clockAnomalyNote(plus(3600), last) === '', 'record after the last one -> no backward flag');
assert(_clockAnomalyNote(last, null) === '', 'first-ever record -> no anomaly');

// --- signal 2: monotonic in-session drift (the "wait 1 second" bypass) ---
// Session opened at 3pm; performance clock advanced 1h; nurse sets wall clock to
// 9:56am to backdate. Wall now disagrees with monotonic-elapsed by ~6h -> caught,
// even though 9:56am is AFTER the last record (so signal 1 alone would miss it).
const t3pm = Date.parse('2026-06-04T15:00:00Z');
const t956 = Date.parse('2026-06-04T09:56:00Z');
const drift = _computeDrift(t3pm, 0, t956, 3600000);   // anchorWall, anchorMono, nowWall, nowMono(1h)
assert(drift < -5 * 3600000, 'computed drift detects the ~6h backward jump (' + Math.round(drift / 3600000) + 'h)');
const n2 = _clockAnomalyNote('2026-06-04T09:56:00Z', '2026-06-04T09:55:00Z', drift);
assert(n2.includes('jumped back') && n2 !== '', '"set clock to just after last record" still flagged via monotonic drift ("' + n2 + '")');

// normal advancing clock -> no drift, no anomaly
assert(_computeDrift(1000, 500, 61000, 60500) === 0, 'normally advancing clock -> 0 drift');
assert(_clockAnomalyNote(last, last, 0) === '', 'no drift + same time -> no anomaly');
assert(_clockAnomalyNote(last, null, 3 * 3600000).includes('jumped forward'), 'forward jump during session -> flagged');

// --- duration humanizer ---
assert(_humanizeDuration(45000) === '45s', 'humanize 45s');
assert(_humanizeDuration(3 * 60000) === '3m', 'humanize 3m');
assert(_humanizeDuration(4 * 3600000) === '4h', 'humanize 4h');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
