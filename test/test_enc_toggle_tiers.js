'use strict';
// Disabling device encryption must not leave OLDER generational snapshot tiers
// encrypted. _persistBlobTiered() only rewrites db_current plus tiers whose
// cadence elapsed, so after a disable the hour/day tiers could stay AES-GCM
// envelopes — and loadDatabaseWithRecovery() used to hard-require unlock when
// ANY candidate was an envelope, with a prompt whose only escape is a full
// device wipe. Net: disable encryption, forget the passphrase, reboot ->
// locked out of a perfectly readable plaintext database. (Enable had the
// mirror bug: stale PLAINTEXT tiers defeating encryption-at-rest.)
//
// Two fixes under test, exercised against the REAL functions:
//   1. toggleDeviceEncryption() calls resetSnapshotCadence() so the post-
//      toggle save rewrites EVERY tier in the new format in one transaction.
//   2. Defense-in-depth for stores written BEFORE fix 1: boot unlock is LAZY —
//      it prompts only when an envelope must actually be read, never merely
//      because a stale older tier exists under a readable plaintext copy.
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));
const cryptoMod = require(path.resolve('js/crypto-store.js'));
for (const k of Object.keys(cryptoMod)) global[k] = cryptoMod[k];
const { loadDatabaseWithRecovery, _persistBlobTiered, DB_SNAPSHOT_TIERS } = require(path.resolve('js/db.js'));

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
function makeStore() {
  const map = new Map();
  return { map,
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async batch(puts, deletes) { (puts || []).forEach(([k, v]) => map.set(k, v)); (deletes || []).forEach(k => map.delete(k)); },
    async clear() { map.clear(); } };
}

const cryptoSrc = fs.readFileSync(path.resolve('js/crypto-store.js'), 'utf8');

// Build toggleDeviceEncryption() from the real crypto-store.js source with
// instrumented stubs (same technique as test_logout_purge.js for auth.js).
// The saveDBToIndexedDB stub reproduces the real one's persistence semantics —
// encrypt-if-active, then the REAL _persistBlobTiered against the harness's
// saved-timestamps map, which the resetSnapshotCadence stub clears exactly
// like the real helper clears db.js's _dbSaved.
function makeToggleHarness(store) {
  const events = [];
  const h = { clock: 0, saved: {}, blob: null, events };
  let api;
  const stubs = {
    window: { crypto: globalThis.crypto, confirm: () => { events.push('confirm'); return true; } },
    currentLanguage: () => 'en',
    showError: (m) => events.push('error:' + m),
    showSuccess: (m) => events.push('success:' + m),
    navigateTo: () => {},
    currentView: null,
    showModal: () => { throw new Error('passphrase modal must not open in the disable flow'); },
    closeModal: () => {},
    markDbDirty: () => events.push('markDirty'),
    resetSnapshotCadence: () => { h.saved = {}; events.push('resetCadence'); },
    saveDBToIndexedDB: async () => {
      events.push(api.encIsActive() ? 'save:encrypted' : 'save:plaintext');
      const toStore = api.encIsActive() ? await api.encEncrypt(h.blob) : h.blob.buffer;
      h.saved = await _persistBlobTiered(store, toStore, h.saved, h.clock, DB_SNAPSHOT_TIERS);
    }
  };
  const names = Object.keys(stubs);
  const factory = new Function(...names, cryptoSrc + '\n;return { toggleDeviceEncryption, encEnable, encEncrypt, encIsActive };');
  api = factory(...names.map(n => stubs[n]));
  h.api = api;
  h.save = stubs.saveDBToIndexedDB;
  return h;
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });
  const taggedBytes = (tag) => { const d = new SQL.Database(); d.run('CREATE TABLE t (k TEXT)'); d.run("INSERT INTO t VALUES ('" + tag + "')"); return d.export(); };
  const tagOf = (openedDb) => { const r = openedDb.exec('SELECT k FROM t LIMIT 1'); return r.length ? r[0].values[0][0] : null; };
  const realBootUnlock = cryptoMod.encBootUnlockMulti;

  // --- 1) Disable flow: EVERY persisted slot is rewritten plaintext ---
  {
    const store = makeStore();
    const h = makeToggleHarness(store);
    await h.api.encEnable('pp-disable-test');
    h.blob = taggedBytes('v1'); h.clock = 0;    await h.save();   // all tiers seeded as envelopes
    h.blob = taggedBytes('v2'); h.clock = 1000; await h.save();   // within every cadence: only db_current refreshed
    assert(cryptoMod.encIsEnvelope(store.map.get('db_snap_hour')) && cryptoMod.encIsEnvelope(store.map.get('db_snap_day')),
      'precondition: hour/day tiers hold envelopes going into the disable');

    h.clock = 2000;
    await h.api.toggleDeviceEncryption();
    assert(h.events.includes('confirm') && !h.api.encIsActive(), 'toggle confirmed and deactivated the session key');
    assert(h.events.includes('resetCadence') && h.events.indexOf('resetCadence') < h.events.indexOf('save:plaintext'),
      'snapshot cadence is reset BEFORE the plaintext save (full-tier rewrite)');
    const leftovers = [...store.map.entries()].filter(([k, v]) => k !== 'meta' && cryptoMod.encIsEnvelope(v)).map(([k]) => k);
    assert(leftovers.length === 0, 'after disable: NO persisted candidate is an envelope (was: ' + (leftovers.join(',') || 'none') + ')');

    // Boot proof: recovery opens the plaintext DB with the unlock prompt NEVER invoked.
    let prompts = 0;
    global.encBootUnlockMulti = async () => { prompts++; return true; };
    const opened = await loadDatabaseWithRecovery(SQL, store);
    assert(opened && tagOf(opened) === 'v2', 'boot after disable: newest plaintext copy loads');
    assert(prompts === 0, 'boot after disable: unlock prompt never invoked');
    global.encBootUnlockMulti = realBootUnlock;
  }

  // --- 2) Source guard: the ENABLE branch resets the cadence too (stale
  //        plaintext tiers after enabling would defeat encryption-at-rest).
  //        Behavioral enable-path coverage needs the DOM passphrase modal, so
  //        assert the glue at source level, per test_consistency conventions.
  {
    const body = cryptoSrc.slice(cryptoSrc.indexOf('async function toggleDeviceEncryption'));
    const branches = body.split('} else {');
    assert(branches.length >= 2, 'toggleDeviceEncryption has the expected enable/disable branches');
    for (const [i, name] of [[0, 'disable'], [1, 'enable']]) {
      const r = branches[i].indexOf('resetSnapshotCadence');
      const s = branches[i].indexOf('saveDBToIndexedDB');
      assert(r !== -1 && s !== -1 && r < s, name + ' branch calls resetSnapshotCadence() before saveDBToIndexedDB()');
    }
  }

  // --- 3) Defense-in-depth: store written BEFORE fix 1 (plaintext current,
  //        stale encrypted tier) must boot WITHOUT prompting — the exact
  //        forgotten-passphrase lockout scenario.
  const TIERS = [{ key: 'db_snap_min', spacingMs: 60000 }];
  const legacy = makeStore();
  let envSalt;
  {
    await cryptoMod.encEnable('old-forgotten-pass');
    const env = await cryptoMod.encEncrypt(taggedBytes('enc-old'));
    envSalt = env.salt;
    let saved = await _persistBlobTiered(legacy, env, {}, 0, TIERS);                          // current + snap = envelope
    cryptoMod.encDisable();                                                                   // pre-fix disable: key gone...
    saved = await _persistBlobTiered(legacy, taggedBytes('plain-new').buffer, saved, 100, TIERS); // ...but only db_current rewritten
    assert(cryptoMod.encIsEnvelope(legacy.map.get('db_snap_min')) && !cryptoMod.encIsEnvelope(legacy.map.get('db_current')),
      'precondition: plaintext current over a stale encrypted tier');

    let prompts = 0;
    global.encBootUnlockMulti = async () => { prompts++; return true; };
    const opened = await loadDatabaseWithRecovery(SQL, legacy);
    assert(opened && tagOf(opened) === 'plain-new', 'boot loads the readable plaintext copy');
    assert(prompts === 0, 'stale encrypted tier does NOT trigger the unlock prompt (no lockout/wipe ultimatum)');
    global.encBootUnlockMulti = realBootUnlock;
  }

  // --- 4) ...but when the envelope MUST be read (plaintext copy corrupt), the
  //        unlock still runs — lazy, not skipped — so nothing recoverable is lost.
  {
    legacy.map.set('db_current', new Uint8Array([9, 9, 9, 9]).buffer);   // corrupt the plaintext newest
    let prompts = 0;
    global.encBootUnlockMulti = async () => {                            // simulate the user entering the old passphrase
      prompts++;
      await cryptoMod.encUnlock('old-forgotten-pass', envSalt);
      return true;
    };
    const opened = await loadDatabaseWithRecovery(SQL, legacy);
    assert(opened && tagOf(opened) === 'enc-old', 'corrupt plaintext copy: falls back to the encrypted tier');
    assert(prompts === 1, 'unlock prompt runs exactly once, only when an envelope must be read');
    global.encBootUnlockMulti = realBootUnlock;
    cryptoMod.encDisable();
  }

  // --- 5) Reset escape hatch survives the lazy restructure: choosing "reset"
  //        at the prompt still wipes the device and seeds fresh.
  {
    const s = makeStore();
    await cryptoMod.encEnable('whatever');
    await _persistBlobTiered(s, await cryptoMod.encEncrypt(taggedBytes('locked')), {}, 0, TIERS);
    cryptoMod.encDisable();
    global.encBootUnlockMulti = async () => false;                       // user chose "Reset (erase device data)"
    const opened = await loadDatabaseWithRecovery(SQL, s);
    assert(opened === null && s.map.size === 0, 'reset at the unlock prompt still wipes all persisted copies');
    global.encBootUnlockMulti = realBootUnlock;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
