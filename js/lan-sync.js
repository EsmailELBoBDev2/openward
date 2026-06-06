'use strict';
/*
 * LAN Sync (EXPERIMENTAL) — Yjs-style peer-to-peer state sharing, vendor-free.
 *
 * Goal: let multiple browsers on the same hospital LAN share some state WITHOUT a
 * local server, using a CRDT so concurrent edits merge deterministically.
 *
 * HONEST LIMITS (read before using for anything that matters):
 *  - This is a Last-Writer-Wins CRDT. Concurrent edits CONVERGE, but LWW means a
 *    losing write is DISCARDED. It therefore CANNOT enforce an invariant like
 *    "bed 12A is taken by exactly one patient" — two nurses can both win locally
 *    and one assignment is silently dropped. So this is for ADVISORY / soft state
 *    (handoff notes, presence, a shared scratch board), NEVER for the authoritative
 *    patient/bed/stock/MRN records. Those need a server (see server/).
 *  - WebRTC needs a SIGNALING rendezvous to introduce peers. There is no
 *    truly-serverless cross-device path: you either run a tiny signaling server on
 *    the LAN or use a public one. The BroadcastChannel transport below needs no
 *    signaling but only links tabs/windows in the SAME browser on the SAME machine.
 *  - All peers must be online together to converge (no offline catch-up store).
 *
 * The CRDT engine here is pure and unit-tested (test/test_lan_sync.js). Transports
 * are pluggable; a real Yjs + y-webrtc provider can replace this later unchanged
 * at the call sites.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node tests
  else root.LANSync = api;                                                     // browser global
})(typeof self !== 'undefined' ? self : this, function () {

  // ---- CRDT core: a map of LWW-Registers --------------------------------------
  // Each key -> { v, t, n, del }: value, hybrid timestamp, node id, tombstone.
  // Merge wins on higher t; ties broken by higher node id => commutative,
  // associative, idempotent => all replicas that see the same ops converge.
  function makeStore(nodeId) {
    const state = new Map();
    let lastT = 0;
    function tick(now) { const c = (now == null ? Date.now() : now); lastT = Math.max(c, lastT + 1); return lastT; }
    function dominates(a, b) { return !b || a.t > b.t || (a.t === b.t && String(a.n) > String(b.n)); }

    return {
      nodeId,
      set(key, value, now) { const e = { v: value, t: tick(now), n: nodeId, del: false }; state.set(key, e); return e; },
      del(key, now) { const e = { v: null, t: tick(now), n: nodeId, del: true }; state.set(key, e); return e; },
      get(key) { const e = state.get(key); return e && !e.del ? e.v : undefined; },
      has(key) { const e = state.get(key); return !!(e && !e.del); },
      // live values only (tombstones hidden)
      entries() { const o = {}; for (const [k, e] of state) if (!e.del) o[k] = e.v; return o; },
      // merge one incoming register; returns true iff our state changed
      mergeEntry(key, e) {
        const cur = state.get(key);
        if (dominates(e, cur)) {
          state.set(key, { v: e.v, t: e.t, n: e.n, del: !!e.del });
          if (e.t > lastT) lastT = e.t;            // keep our clock monotonic vs peers
          return true;
        }
        return false;
      },
      // full state (incl. tombstones) for catch-up; and merge of same
      snapshot() { const o = {}; for (const [k, e] of state) o[k] = e; return o; },
      mergeSnapshot(snap) { let changed = false; for (const k in snap) if (this.mergeEntry(k, snap[k])) changed = true; return changed; },
    };
  }

  // ---- transports -------------------------------------------------------------
  // A transport is { send(msg), onMessage(cb), close() }. Messages are plain JSON
  // {type:'op'|'hello'|'state', ...}. The engine below is transport-agnostic.

  // Same-machine, no signaling: links tabs/windows of the SAME browser only.
  function broadcastChannelTransport(room) {
    if (typeof BroadcastChannel === 'undefined') return null;
    const ch = new BroadcastChannel('openward-lan-' + room);
    let handler = null;
    ch.onmessage = (ev) => { if (handler) handler(ev.data); };
    return { send: (m) => ch.postMessage(m), onMessage: (cb) => { handler = cb; }, close: () => ch.close() };
  }

  // Cross-device on the LAN. REQUIRES a signaling server URL (the unavoidable
  // rendezvous). Left as an explicit factory so the dependency is obvious; wire a
  // real Yjs y-webrtc provider or a minimal WebRTC mesh here.
  function webrtcTransport(/* room, signalingUrl */) {
    throw new Error('LANSync.webrtcTransport: cross-device sync needs a signaling server URL. ' +
      'Run a LAN signaling rendezvous (or drop in Yjs y-webrtc) and implement this transport. ' +
      'No signaling = no cross-device WebRTC; this is the documented "near, not full" limit.');
  }

  // ---- engine: store + transport + subscribers --------------------------------
  function connect(room, opts) {
    opts = opts || {};
    const nodeId = opts.nodeId || (Math.random().toString(36).slice(2) + Date.now().toString(36));
    const store = makeStore(nodeId);
    const subs = new Set();
    const transport = opts.transport || broadcastChannelTransport(room);
    if (!transport) {
      // No transport available (e.g. no BroadcastChannel): degrade to local-only.
      return { local: true, store, set: (k, v) => store.set(k, v), del: (k) => store.del(k),
        get: (k) => store.get(k), entries: () => store.entries(), subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); }, close: () => {} };
    }
    function notify() { const snap = store.entries(); subs.forEach((cb) => { try { cb(snap); } catch (e) {} }); }
    transport.onMessage((msg) => {
      if (!msg) return;
      if (msg.type === 'op' && msg.key) { if (store.mergeEntry(msg.key, msg.entry)) notify(); }
      else if (msg.type === 'hello') { transport.send({ type: 'state', from: nodeId, snap: store.snapshot() }); }
      else if (msg.type === 'state' && msg.snap) { if (store.mergeSnapshot(msg.snap)) notify(); }
    });
    transport.send({ type: 'hello', from: nodeId });   // ask peers for their state
    return {
      nodeId, store,
      set(key, value) { const e = store.set(key, value); transport.send({ type: 'op', key, entry: e }); notify(); return e; },
      del(key) { const e = store.del(key); transport.send({ type: 'op', key, entry: e }); notify(); },
      get(key) { return store.get(key); },
      entries() { return store.entries(); },
      subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
      close() { transport.close(); subs.clear(); },
    };
  }

  return { makeStore, connect, broadcastChannelTransport, webrtcTransport };
});
