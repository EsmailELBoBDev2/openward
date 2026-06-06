# LAN Sync (experimental) — browser-only peer sharing, no local server

You asked for multi-device **without running a server** — pure browser/web. This is
the honest best-effort for that: a small **CRDT** (`js/lan-sync.js`) that lets
browsers share *soft* state and merge concurrent edits deterministically. It is
the "P2P LAN (Yjs-style CRDT)" option, built vendor-free so it works offline; real
Yjs + y-webrtc can be dropped in later behind the same API.

## What it is

- A **Last-Writer-Wins CRDT map**: `set(key,value)`, `del(key)`, `get(key)`,
  `entries()`, `subscribe(cb)`. Concurrent edits from many peers **converge** to the
  same state (proven in `test/test_lan_sync.js`: convergent, commutative,
  idempotent, tombstones).
- **Pluggable transport.** Default is **BroadcastChannel** — needs **no signaling**
  and syncs **tabs/windows of the same browser on the same machine** in real time.

```js
const room = LANSync.connect('handoff', { nodeId: myId });
room.subscribe(state => render(state));      // re-render on any peer change
room.set('note-12A', 'NPO after midnight');  // shared with peers
```

## The two limits you accepted ("near, not full")

1. **Cross-*device* needs a signaling rendezvous.** WebRTC can't introduce peers by
   itself, so true cross-PC sync needs *something* to run (a tiny LAN signaling
   server, or a public one). There is **no** zero-process cross-device path —
   that's physics, not laziness. `LANSync.webrtcTransport()` is left as an explicit,
   documented hook for that piece (it throws until you wire signaling / Yjs).
2. **It is ADVISORY only — never the source of truth for beds/stock/MRNs.** LWW
   *discards* the losing side of a concurrent edit, so two nurses can both "win"
   locally and one bed assignment is silently dropped. A CRDT **cannot enforce
   "bed 12A is taken once."** Use it for handoff notes, announcements, presence — soft
   state where convergence is fine and a lost edit isn't dangerous. For authoritative
   records you need the server (`server/`), which is the only way to guarantee
   uniqueness/atomicity.

## How to use each tier

| You want… | Use | Server? |
|---|---|---|
| Same-machine, multiple tabs, shared soft state | `LANSync.connect()` (BroadcastChannel) | none |
| Cross-PC soft state on the LAN | `LANSync` + a WebRTC transport + signaling rendezvous | a small signaling process |
| Authoritative shared records (beds, stock, orders) safely | `server/` (`/api`) | one process owns the DB |

## Status

- ✅ CRDT engine + BroadcastChannel transport, unit-tested (same-machine sync works now).
- ⬜ A WebRTC transport (needs signaling) — not implemented; documented hook only.
- ⬜ Wiring an **advisory** UI panel (e.g. a shift-handoff board) onto `LANSync`.

Tell me which advisory board to wire (handoff notes / announcements / bed-status
*display*), and whether you want me to add a minimal LAN signaling option, and I'll
build that next.
