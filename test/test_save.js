// Validates the saveDBToIndexedDB coalescing state machine (db.js) with a
// mocked async "write" (IndexedDB isn't available in Node). Mirrors the exact
// control flow: dirty flag, single in-flight promise, while-loop re-flush.
let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- state machine under test (mirror of db.js) ---
let _dbDirty = true;     // true at boot, like db.js
let _savePromise = null;
let writeCount = 0;
const written = [];
let currentData = 'v0';  // stands in for the live DB contents

function dbRun(v) { currentData = v; _dbDirty = true; }  // mutation -> marks dirty

async function saveDBToIndexedDB() {
  if (!_dbDirty) return;
  if (_savePromise) return _savePromise;
  _savePromise = (async () => {
    try {
      while (_dbDirty) {
        _dbDirty = false;
        const data = currentData;     // synchronous snapshot (== db.export())
        await sleep(20);              // async IndexedDB write
        writeCount++; written.push(data);
      }
    } finally { _savePromise = null; }
  })();
  return _savePromise;
}

(async () => {
  // 1) boot is dirty -> first save writes once; a second save with no mutation is a no-op
  await saveDBToIndexedDB();
  assert(writeCount === 1 && written[written.length - 1] === 'v0', 'boot: first save writes once');
  await saveDBToIndexedDB();
  assert(writeCount === 1, 'no mutation: save is a no-op (no redundant blob write)');

  // 2) a mutation makes the next save write exactly once
  dbRun('v1');
  await saveDBToIndexedDB();
  assert(writeCount === 2 && written[written.length - 1] === 'v1', 'after mutation: one save -> one write');

  // 3) concurrent saves during one in-flight write coalesce into a single write
  dbRun('v2');
  await Promise.all([saveDBToIndexedDB(), saveDBToIndexedDB(), saveDBToIndexedDB()]);
  assert(writeCount === 3 && written[written.length - 1] === 'v2', '3 concurrent saves coalesce into 1 write');

  // 4) a mutation that lands DURING the in-flight write triggers a re-flush,
  //    and the awaited save resolves only after the newest data is written.
  //    Real flow is always mutate-then-save, so snapshot 'v3a' is taken now:
  const before = writeCount;
  dbRun('v3a');                    // mutation
  const p = saveDBToIndexedDB();   // begins writing snapshot 'v3a' (sync snapshot)
  await sleep(5);                  // we're now inside the 20ms write of v3a
  dbRun('v3b');                    // second mutation lands mid-write -> must force another flush
  saveDBToIndexedDB();            // coalesced into the in-flight promise
  await p;                         // must resolve only after v3b is persisted
  assert(written[written.length - 1] === 'v3b', 'mid-write mutation re-flushes: last write is newest data');
  assert(writeCount === before + 2, 'mid-write mutation causes exactly one extra flush');
  assert(_savePromise === null && _dbDirty === false, 'state clean after drain');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
