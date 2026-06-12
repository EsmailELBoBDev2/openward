'use strict';
// Validates the saveDBToIndexedDB coalescing state machine against the REAL
// db.js source: the save cluster (dirty flag, in-flight coalescing promise,
// while-loop re-flush, tiered persist, failure re-dirty, multi-tab clobber
// detection) is sliced out of js/db.js and evaluated with a mocked IndexedDB.
// The previous version of this test asserted against a hand-copied mirror of
// the control flow, which stayed green no matter what db.js actually did.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

// ---- slice the real save cluster out of db.js -------------------------------
const dbSrc = fs.readFileSync(path.resolve('js/db.js'), 'utf8');
const start = dbSrc.indexOf("const DB_META_KEY");
const end = dbSrc.indexOf('// Collect saved versions newest-first');
if (start < 0 || end < 0 || end <= start) { console.error('  FAIL- could not slice the save cluster from js/db.js'); process.exit(1); }
const slice = dbSrc.slice(start, end);

// ---- fake IndexedDB good enough for db.js's idbStore adapter -----------------
function makeBacking() {
  const backing = { map: new Map(), failNextBatch: false, batchCount: 0 };
  backing.fakeIDB = {
    transaction() {
      const tx = { error: null, oncomplete: null, onerror: null };
      const ops = [];
      tx.objectStore = () => ({
        get(key) {
          const req = { onsuccess: null, onerror: null, result: undefined };
          queueMicrotask(() => { req.result = backing.map.has(key) ? backing.map.get(key) : undefined; if (req.onsuccess) req.onsuccess(); });
          return req;
        },
        // IndexedDB structured-clones on write — storing by reference would let
        // a later mutation of the stored value alias the caller's live object
        put(v, k) { ops.push(['put', k, typeof v === 'object' && v !== null ? structuredClone(v) : v]); },
        delete(k) { ops.push(['del', k]); },
        clear() { ops.push(['clear']); },
      });
      queueMicrotask(() => queueMicrotask(() => {
        if (backing.failNextBatch && ops.some(o => o[0] === 'put')) {
          backing.failNextBatch = false;
          tx.error = new Error('injected IndexedDB failure');
          if (tx.onerror) tx.onerror();
          return;
        }
        if (ops.some(o => o[0] === 'put')) backing.batchCount++;
        for (const op of ops) {
          if (op[0] === 'put') backing.map.set(op[1], op[2]);
          else if (op[0] === 'del') backing.map.delete(op[1]);
          else backing.map.clear();
        }
        if (tx.oncomplete) tx.oncomplete();
      }));
      return tx;
    }
  };
  return backing;
}

// ---- build a harness over the REAL source ------------------------------------
function makeHarness() {
  const backing = makeBacking();
  const errors = [];
  const mockDb = { data: 'v0', export() { return { buffer: this.data, length: 1 }; } };
  const factory = new Function(
    'openIDB', 'SERVER_MODE', 'db', 'showError', 'currentLanguage',
    slice + `
    ;return {
      saveDBToIndexedDB, markDbDirty, resetSnapshotCadence, _persistBlobTiered, idbStore,
      getDirty: () => _dbDirty, getSavePromise: () => _savePromise
    };`
  );
  const api = factory(async () => backing.fakeIDB, false, mockDb, (m) => errors.push(m), () => 'en');
  return { api, backing, errors, mockDb };
}

(async () => {
  // sanity: the slice really contains the function under test (marker drift guard)
  assert(/async function saveDBToIndexedDB/.test(slice), 'slice contains the real saveDBToIndexedDB');

  // 1) boot is dirty -> first save writes once; second save with no mutation no-ops
  {
    const { api, backing } = makeHarness();
    await api.saveDBToIndexedDB();
    assert(backing.batchCount === 1 && backing.map.get('db_current') === 'v0', 'boot: first save persists the blob once');
    await api.saveDBToIndexedDB();
    assert(backing.batchCount === 1, 'no mutation: save is a no-op (no redundant blob write)');
  }

  // 2) a mutation makes the next save write exactly once, with the new data
  {
    const { api, backing, mockDb } = makeHarness();
    await api.saveDBToIndexedDB();
    mockDb.data = 'v1'; api.markDbDirty();
    await api.saveDBToIndexedDB();
    assert(backing.batchCount === 2 && backing.map.get('db_current') === 'v1', 'after mutation: one save -> one write with the latest data');
  }

  // 3) concurrent callers coalesce into the in-flight write
  {
    const { api, backing } = makeHarness();
    await Promise.all([api.saveDBToIndexedDB(), api.saveDBToIndexedDB(), api.saveDBToIndexedDB()]);
    assert(backing.batchCount === 1, '3 concurrent saves coalesce into 1 write');
    assert(api.getSavePromise() === null && api.getDirty() === false, 'state clean after drain');
  }

  // 4) FAILED write re-dirties: data stays flagged unsaved and the NEXT save
  //    retries. (Regression guard: _dbDirty=false used to be consumed before
  //    the await, so one failed IndexedDB write silently dropped everything.)
  {
    const { api, backing, errors, mockDb } = makeHarness();
    await api.saveDBToIndexedDB();
    mockDb.data = 'v1'; api.markDbDirty();
    backing.failNextBatch = true;
    await api.saveDBToIndexedDB();
    assert(api.getDirty() === true, 'failed persist re-arms _dbDirty (no silent dataloss)');
    assert(errors.some(m => /FAILED|فشل/i.test(m)), 'failed persist surfaces a visible error');
    assert(backing.map.get('db_current') === 'v0', 'store still holds the pre-failure blob');
    await api.saveDBToIndexedDB();
    assert(backing.map.get('db_current') === 'v1', 'next save retries and lands the data');
  }

  // 5) multi-tab clobber detection: a NEWER stamp in the store than our last
  //    write means another tab persisted since — warn loudly (we cannot merge)
  {
    const { api, backing, errors, mockDb } = makeHarness();
    await api.saveDBToIndexedDB();
    const meta = backing.map.get('meta');
    meta.saved['db_current'] = Date.now() + 60000;   // another tab "wrote" after us
    backing.map.set('meta', meta);
    mockDb.data = 'v2'; api.markDbDirty();
    await api.saveDBToIndexedDB();
    assert(errors.some(m => /another tab|تبويب آخر/i.test(m)), 'overwriting a newer write from another tab raises the warning');
    assert(backing.map.get('db_current') === 'v2', 'the save itself still proceeds (last-writer-wins, but warned)');
  }

  // 6) re-dirty during the in-flight write -> while-loop flushes again before resolving
  {
    const { api, backing, mockDb } = makeHarness();
    const p = api.saveDBToIndexedDB();          // begins writing snapshot 'v0'
    mockDb.data = 'v1'; api.markDbDirty();      // lands while the write is in flight
    await p;                                    // must resolve only after v1 persisted
    assert(backing.map.get('db_current') === 'v1', 'mid-write mutation re-flushes: last write is newest data');
    assert(backing.batchCount === 2, 'mid-write mutation causes exactly one extra flush');
    assert(api.getSavePromise() === null && api.getDirty() === false, 'state clean after drain');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
