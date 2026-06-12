// Validates the encryption-at-rest core (crypto-store.js) against Node's Web
// Crypto (same API the browser uses). Data-integrity critical: a decrypt bug
// would mean unreadable patient data.
const path = require('path');
const c = require(path.resolve('js/crypto-store.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ok  - ' + msg); } else { fail++; console.error('  FAIL- ' + msg); } }
function bytesEqual(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

(async () => {
  // A realistic-ish "DB blob": SQLite header bytes + random payload
  const plain = new Uint8Array(64 * 1024);
  crypto.getRandomValues(plain);
  const header = new TextEncoder().encode('SQLite format 3\0');
  plain.set(header, 0);

  // 1) active flag starts off
  assert(c.encIsActive() === false, 'encryption inactive before enable');

  // 2) enable -> encrypt -> envelope shape is correct and structured-clone-safe
  await c.encEnable('correct horse battery staple');
  assert(c.encIsActive() === true, 'encIsActive() true after enable');
  const env = await c.encEncrypt(plain);
  assert(c.encIsEnvelope(env), 'encEncrypt produces a recognized envelope');
  assert(env.salt instanceof Uint8Array && env.iv instanceof Uint8Array, 'salt & iv are Uint8Array');
  assert(env.data instanceof ArrayBuffer, 'ciphertext is an ArrayBuffer');
  assert(!bytesEqual(new Uint8Array(env.data).subarray(0, 16), header), 'ciphertext does NOT contain the plaintext SQLite header');

  // 3) round-trip with the correct passphrase reproduces the EXACT bytes
  const back = await c.encDecrypt(env);
  assert(bytesEqual(back, plain), 'decrypt with same session key reproduces exact bytes');

  // 4) a raw ArrayBuffer (legacy unencrypted blob) is NOT mistaken for an envelope
  assert(c.encIsEnvelope(plain.buffer) === false, 'raw ArrayBuffer is not an envelope');
  assert(c.encIsEnvelope(null) === false && c.encIsEnvelope(undefined) === false, 'null/undefined are not envelopes');

  // 5) wrong passphrase fails to decrypt (GCM auth-tag mismatch -> throws)
  await c.encUnlock('WRONG passphrase entirely', env.salt);
  let threw = false;
  try { await c.encDecrypt(env); } catch (e) { threw = true; }
  assert(threw, 'wrong passphrase: decrypt throws (cannot read data)');

  // 6) re-unlocking with the right passphrase + salt recovers the data
  await c.encUnlock('correct horse battery staple', env.salt);
  const back2 = await c.encDecrypt(env);
  assert(bytesEqual(back2, plain), 'correct passphrase re-unlock recovers exact bytes');

  // 7) two encryptions of the same data use different IVs (nonce uniqueness)
  const env2 = await c.encEncrypt(plain);
  assert(!bytesEqual(env.iv, env2.iv), 'each encryption uses a fresh random IV');

  // 8) disable clears the active flag AND makes the key unusable. The logout
  //    purge (auth.js logout -> encDisable + reload) relies on this: after
  //    encDisable() there is no path that can encrypt with a stale key.
  c.encDisable();
  assert(c.encIsActive() === false, 'encIsActive() false after disable');
  let lockedThrew = false;
  try { await c.encEncrypt(plain); } catch (e) { lockedThrew = true; }
  assert(lockedThrew, 'encEncrypt throws after disable (key truly purged, not just flagged)');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
