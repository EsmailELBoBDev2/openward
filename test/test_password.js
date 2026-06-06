'use strict';
// Password hashing (utils.js): PBKDF2-HMAC-SHA256 with backward-compatible
// verification of legacy salted-SHA-256 hashes and upgrade-on-success. Guards
// the #6 fix (fast SHA-256 -> slow salted KDF).
const u = require('../js/utils.js');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

(async () => {
  const salt = u.generateSalt();

  // 1. hashPassword now produces a self-describing PBKDF2 hash (NOT bare SHA-256).
  const h = await u.hashPassword('S3cret!pass', salt);
  assert(/^pbkdf2\$\d+\$[0-9a-f]{64}$/.test(h), 'hashPassword returns pbkdf2$<iters>$<hex>');
  assert(parseInt(h.split('$')[1], 10) >= 210000, 'uses >= 210k iterations (OWASP 2023)');
  assert(h !== await u.sha256(salt + ':' + 'S3cret!pass'), 'is not a bare salted SHA-256');

  // 2. correct password verifies; wrong password does not.
  let v = await u.verifyPassword('S3cret!pass', salt, h);
  assert(v.ok && !v.needsUpgrade, 'correct password verifies against PBKDF2 hash (no upgrade needed)');
  v = await u.verifyPassword('wrong', salt, h);
  assert(!v.ok, 'wrong password is rejected');

  // 3. salt matters (same password, different salt -> different hash).
  const h2 = await u.hashPassword('S3cret!pass', u.generateSalt());
  assert(h2.split('$')[2] !== h.split('$')[2], 'different salt yields a different digest');

  // 4. legacy salted-SHA-256 hashes still verify AND signal needsUpgrade.
  const legacy = await u.sha256(salt + ':' + 'OldPassw0rd');
  v = await u.verifyPassword('OldPassw0rd', salt, legacy);
  assert(v.ok && v.needsUpgrade, 'legacy salted-SHA-256 verifies and is flagged for upgrade');
  v = await u.verifyPassword('nope', salt, legacy);
  assert(!v.ok, 'wrong password against a legacy hash is rejected');

  // 5. re-hashing the upgraded password yields a PBKDF2 hash that verifies.
  const upgraded = await u.hashPassword('OldPassw0rd', salt);
  v = await u.verifyPassword('OldPassw0rd', salt, upgraded);
  assert(v.ok && !v.needsUpgrade && upgraded.startsWith('pbkdf2$'), 'upgraded hash is PBKDF2 and verifies');

  // 6. a hash made with fewer iterations verifies but is flagged for upgrade.
  const weak = `pbkdf2$1000$${await u.pbkdf2Hex('S3cret!pass', salt, 1000)}`;
  v = await u.verifyPassword('S3cret!pass', salt, weak);
  assert(v.ok && v.needsUpgrade, 'a lower-iteration PBKDF2 hash verifies and is flagged for upgrade');

  // 7. timing-safe compare basics.
  assert(u.timingSafeEqualHex('abcd', 'abcd') === true, 'timingSafeEqualHex: equal');
  assert(u.timingSafeEqualHex('abcd', 'abce') === false, 'timingSafeEqualHex: unequal');
  assert(u.timingSafeEqualHex('abc', 'abcd') === false, 'timingSafeEqualHex: length mismatch');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
