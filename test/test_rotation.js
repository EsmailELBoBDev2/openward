// Validates generational (time-spaced) backup snapshots + recovery (db.js) using
// the REAL functions, an in-memory store mock, real sql.js + real crypto-store.
const path = require('path');
const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));
const cryptoMod = require(path.resolve('js/crypto-store.js'));
for (const k of Object.keys(cryptoMod)) global[k] = cryptoMod[k];
const { loadDatabaseWithRecovery, _persistBlobTiered } = require(path.resolve('js/db.js'));

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
function makeStore() {
  const map = new Map();
  return { map,
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async batch(puts, deletes) { (puts || []).forEach(([k, v]) => map.set(k, v)); (deletes || []).forEach(k => map.delete(k)); },
    async clear() { map.clear(); } };
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });
  const TIERS = [{ key: 'db_snap_min', spacingMs: 60000 }];  // single tier, controlled clock
  const exportTagged = (tag) => { const d = new SQL.Database(); d.run('CREATE TABLE t (k TEXT)'); d.run("INSERT INTO t VALUES ('" + tag + "')"); return d.export().buffer; };
  const exportEmpty  = () => { const d = new SQL.Database(); d.run('CREATE TABLE t (k TEXT)'); return d.export().buffer; }; // valid db, no rows (logical "corruption")
  const tagOf = (buf) => { const d = new SQL.Database(new Uint8Array(buf)); const r = d.exec('SELECT k FROM t LIMIT 1'); return r.length ? r[0].values[0][0] : null; };

  // 1) THE ROAST'S SCENARIO: a burst of bad saves can't clobber the older snapshot
  {
    const s = makeStore();
    let saved = await _persistBlobTiered(s, exportTagged('good'), {}, 0, TIERS);      // current+snap = good @0
    saved = await _persistBlobTiered(s, exportEmpty(), saved, 100, TIERS);            // bad burst, within cadence
    saved = await _persistBlobTiered(s, exportEmpty(), saved, 200, TIERS);
    saved = await _persistBlobTiered(s, exportEmpty(), saved, 300, TIERS);
    assert(tagOf(s.map.get('db_current')) === null, 'burst overwrote "current" (data gone there)');
    assert(tagOf(s.map.get('db_snap_min')) === 'good', 'older snapshot SURVIVED the burst (recoverable) — fixes the ring-wipe flaw');
    // after the cadence elapses, the snapshot refreshes
    saved = await _persistBlobTiered(s, exportTagged('good2'), saved, 60000, TIERS);
    assert(saved['db_snap_min'] === 60000 && tagOf(s.map.get('db_snap_min')) === 'good2', 'snapshot refreshes once its cadence elapses');
  }

  // 2) Recovery loads the newest readable version
  {
    const s = makeStore();
    let saved = await _persistBlobTiered(s, exportTagged('A'), {}, 0, TIERS);
    saved = await _persistBlobTiered(s, exportTagged('B'), saved, 100, TIERS);
    const opened = await loadDatabaseWithRecovery(SQL, s);
    assert(opened && tagOf(opened.export().buffer) === 'B', 'recovery loads newest version (B)');
  }

  // 3) Corrupt "current" -> auto-falls back to the snapshot
  {
    const s = makeStore();
    let saved = await _persistBlobTiered(s, exportTagged('keep'), {}, 0, TIERS);     // snap = keep @0
    saved = await _persistBlobTiered(s, exportTagged('newer'), saved, 100, TIERS);   // current = newer, snap stays keep
    s.map.set('db_current', new Uint8Array([1, 2, 3, 4]).buffer);                    // corrupt newest
    const opened = await loadDatabaseWithRecovery(SQL, s);
    assert(opened && tagOf(opened.export().buffer) === 'keep', 'corrupt current -> recovers the snapshot');
  }

  // 4) Encrypted: corrupt newest envelope -> falls back to snapshot
  {
    const s = makeStore();
    await cryptoMod.encEnable('pp');
    let saved = await _persistBlobTiered(s, await cryptoMod.encEncrypt(new Uint8Array(exportTagged('e1'))), {}, 0, TIERS);
    saved = await _persistBlobTiered(s, await cryptoMod.encEncrypt(new Uint8Array(exportTagged('e2'))), saved, 100, TIERS);
    const bad = await cryptoMod.encEncrypt(new Uint8Array(exportTagged('e2'))); new Uint8Array(bad.data)[0] ^= 0xff;
    s.map.set('db_current', bad);
    const opened = await loadDatabaseWithRecovery(SQL, s);
    assert(opened && tagOf(opened.export().buffer) === 'e1', 'encrypted: corrupt current -> recovers snapshot (e1)');
    cryptoMod.encDisable();
  }

  // 5) Legacy migration: v1 ring and single-key 'main' load and clean up on next save
  {
    const s = makeStore();
    s.map.set('db_0', exportTagged('ring0')); s.map.set('db_1', exportTagged('ring1'));
    s.map.set('meta', { v: 1, current: 1, ring: 3 });
    let opened = await loadDatabaseWithRecovery(SQL, s);
    assert(opened && tagOf(opened.export().buffer) === 'ring1', 'v1 ring loads newest slot');
    await _persistBlobTiered(s, exportTagged('mig'), {}, 0, TIERS);
    assert(!s.map.has('db_0') && !s.map.has('db_1') && s.map.get('meta').v === 2, 'v1 ring keys dropped, meta upgraded to v2');

    const s2 = makeStore();
    s2.map.set('main', exportTagged('legacy'));
    opened = await loadDatabaseWithRecovery(SQL, s2);
    assert(opened && tagOf(opened.export().buffer) === 'legacy', 'legacy single-key "main" loads');
    await _persistBlobTiered(s2, exportTagged('m2'), {}, 0, TIERS);
    assert(!s2.map.has('main'), 'legacy "main" dropped after migrate');
  }

  // 6) Empty store -> null (caller seeds fresh)
  assert((await loadDatabaseWithRecovery(SQL, makeStore())) === null, 'empty store -> null (fresh seed)');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
