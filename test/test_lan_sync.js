'use strict';
// CRDT core + transport of the experimental LAN P2P sync (js/lan-sync.js). Proves
// the merge is convergent/commutative/idempotent (what makes peer sync safe), that
// LWW + tombstones behave, and that two clients on one room actually exchange state
// over a transport (BroadcastChannel, which Node provides globally).
const LANSync = require('../js/lan-sync.js');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
// order-insensitive compare of {key:value} maps (CRDT state is a set of pairs)
const norm = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
const eq = (a, b) => norm(a) === norm(b);

// 1. basic set/get/delete
{
  const s = LANSync.makeStore('A');
  s.set('name', 'Ali', 100);
  assert(s.get('name') === 'Ali', 'set then get');
  s.del('name', 200);
  assert(s.get('name') === undefined && !s.has('name'), 'delete hides the value (tombstone)');
}

// 2. LWW: higher timestamp wins regardless of merge order
{
  const a = LANSync.makeStore('A'); const b = LANSync.makeStore('B');
  const eA = a.set('bed', '12A', 100);
  const eB = b.set('bed', '12B', 200);
  a.mergeEntry('bed', eB); b.mergeEntry('bed', eA);
  assert(a.get('bed') === '12B' && b.get('bed') === '12B', 'higher timestamp wins on both replicas');
}

// 3. timestamp tie broken deterministically by node id
{
  const a = LANSync.makeStore('A'); const b = LANSync.makeStore('Z');
  const eA = a.set('k', 'fromA', 500);
  const eB = b.set('k', 'fromZ', 500);
  a.mergeEntry('k', eB); b.mergeEntry('k', eA);
  assert(a.get('k') === 'fromZ' && b.get('k') === 'fromZ', 'equal-timestamp tie broken by node id (both agree)');
}

// 4. convergence: interleaved ops + snapshot exchange => identical state
{
  const a = LANSync.makeStore('A'); const b = LANSync.makeStore('B');
  a.set('x', 1, 10); a.set('y', 99, 50);
  b.set('y', 2, 20); b.set('z', 7, 30);
  b.mergeSnapshot(a.snapshot()); a.mergeSnapshot(b.snapshot());
  assert(eq(a.entries(), b.entries()), 'after exchanging snapshots both replicas hold identical state');
  assert(a.get('y') === 99, 'the higher-timestamp write (y=99@50) wins over y=2@20');
}

// 5. commutativity + idempotency
{
  const base = () => { const s = LANSync.makeStore('A'); s.set('p', 'one', 1); s.set('q', 'two', 2); return s; };
  const peer = LANSync.makeStore('B'); peer.set('q', 'TWO', 3); peer.set('r', 'three', 4);
  const snap = peer.snapshot();
  const s1 = base(); s1.mergeSnapshot(snap); const after1 = s1.entries();
  const changedAgain = s1.mergeSnapshot(snap);
  assert(!changedAgain && eq(s1.entries(), after1), 'merging the same snapshot twice changes nothing (idempotent)');
  const s2 = base(); s2.mergeEntry('r', snap.r); s2.mergeEntry('q', snap.q);
  assert(eq(s1.entries(), s2.entries()), 'merge result is independent of order (commutative)');
}

// 6. delete converges too
{
  const a = LANSync.makeStore('A'); const b = LANSync.makeStore('B');
  a.set('note', 'hi', 100); b.mergeSnapshot(a.snapshot());
  assert(b.get('note') === 'hi', 'value replicated to peer');
  const d = a.del('note', 200); b.mergeEntry('note', d);
  assert(!b.has('note'), 'delete (tombstone) replicates to peer');
}

// 7. REAL transport: two connect() clients in one room exchange state over
//    BroadcastChannel (Node provides it), incl. the hello/state catch-up handshake.
(async () => {
  const c1 = LANSync.connect('test-room', { nodeId: 'n1' });
  c1.set('greeting', 'hello-from-1');                 // set BEFORE c2 joins
  const c2 = LANSync.connect('test-room', { nodeId: 'n2' });
  await new Promise(r => setTimeout(r, 40));          // let hello/state + ops deliver
  assert(!c1.local && !c2.local, 'connect() used a real transport (BroadcastChannel), not local-only');
  assert(c2.get('greeting') === 'hello-from-1', 'a late-joining client catches up via the hello/state handshake');
  c2.set('ack', 'ok-from-2');
  await new Promise(r => setTimeout(r, 40));
  assert(c1.get('ack') === 'ok-from-2', 'a live op on one client propagates to the other (peer sync works)');
  c1.close(); c2.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
