# Distributed-Machine Framework Remediation Spec

## Status

Proposal. Derived from a line-level audit of `ActorHost` / `HostedActor` /
`TransactionalDispatcher` / `RemoteMachineTransport` / `RemoteMachineClient` /
`OperationRegistry` (the state-machine layer under `src/distributed_machines/`
and `src/state_machines/`). **Do not rewrite the architecture.** Apply targeted
fixes and add regression tests, in the phase order below.

Guiding constraints (consistent with `plans/state-machines-hardening.md`):

- Keep per-actor serialization (one `TransactionalDispatcher` per key, FIFO).
- Keep post-commit command scheduling, generation fencing, snapshot revisioning,
  and actor-level isolation. These are the parts worth preserving.
- Fixes live inside the kernel where the invariant is violated, not in domain
  definitions, unless the finding is explicitly a domain concern.

## Canonical findings (14)

Numbering follows the audit. Priority grouping matches the review verdict.

---

### Phase 1 — Correctness and crash prevention

#### #5 — Stale-revision validation happens at enqueue, not at commit

**Current.** `HostedActor.enqueueWithAdmission` (`actor_host.ts:403-416`) compares
`expectedActor.snapshotRevision` to `getMetadata().snapshotRevision` _before_
`dispatcher.enqueue` (`:440`). When a command/observer re-entrantly enqueues an
event while the dispatcher is already `processing`, the event is appended to
`pendingEvents` behind already-queued events (`dispatcher.ts:181-207`). Those
queued events commit first and advance the revision, so this event transitions
against revision `N+k` even though it was validated against `N`.

**Invariant.** A dispatch that declares `expectedActor` is validated against the
committed revision _immediately before its transition runs_, inside the
dispatcher's serialized loop — not only at enqueue time.

**Fix (minimal).** Carry `expectedActor` with the queued event; validate it in
`TransactionalDispatcher.processOne` (or a narrow `beforeCommit`-adjacent guard)
right before `transition` is called. Keep the enqueue-time check as an early
rejection optimization. Return the existing `stale-actor-revision` failure so
receipts are unchanged.

**Acceptance.**

- A re-entrant `reject-stale` dispatch (emitted by a command while other events
  are queued) fails with `stale-actor-revision` if the revision advanced, and
  applies only if it matches at transition time.
- Non-re-entrant behavior is byte-for-byte unchanged (receipts, ignore reasons).

**Tests.** `src/distributed_machines/__tests__/actor_host.test.ts`: a command
runner that emits a revision-guarded event after two other events are enqueued.

---

#### #2 — Disposal does not await in-flight command executions

**Current.** `HostedActor.finishDisposal` (`actor_host.ts:686-711`) awaits
lifecycle hooks, timers, tasks, flush, and `dispatcher.dispose()`, but never
joins running command promises. The dispatcher launches commands via
`void execute(command)` (`dispatcher.ts:325-342`, and chat_stream's
`createScheduler` `definition.ts:439-449` runs them concurrently). A command can
still be mid-await on DB I/O when `onDisposed` runs and the actor is removed
from the host, so the command then emits into a dead actor or performs I/O after
cleanup.

**Invariant.** Every command that has begun executing is settled before
`onDisposed` / `notifyDisposed` run and before the actor leaves the host map.
A command's external side effects never interleave with its actor's cleanup.

**Fix (minimal).** Track in-flight command promises in `HostedActor` (the same
pattern as `streamCompletions` in `chat_stream_handlers.ts:387`), and in
`finishDisposal` — after `dispatcher.dispose()` — drain them:
cancellation-first, then a bounded await. Commands that can block on app/DB locks
must be cancellable via their own abort signal so draining cannot deadlock
disposal. Preserve `onDisposed` ordering: it must remain after draining.

**Acceptance.**

- A command awaiting a gate: dispose the actor, then release the gate — assert
  `onDisposed` runs only after the command settles.
- A command that never settles cannot pin disposal past the bound (timeout path
  logged and continues).
- `chat_stream` cancel/delete flows still settle (no deadlock with
  `cancelActiveStreamsForChat`).

**Tests.** `actor_host.test.ts` (dispose mid-command); a chat_stream integration
test asserting delete-during-stream still drains (extend
`src/chat_stream/__tests__/` if needed).

---

#### #3 — Synchronous exceptions after host shutdown

**Current.** `HostedActor.enqueue` (`actor_host.ts:379-380`) evaluates
`this.admission.capture()` outside the try/catch. After the gate is disposed,
`KeyedAdmissionGate.captureGeneration` throws `gate-disposed`
(`keyed_admission_gate.ts:74-77, 365-368`). A retained ref calling `send()` after
`ActorHost.dispose()` therefore throws synchronously in main instead of returning
a `disposed` ticket.

**Invariant.** `send` / `enqueue` / `captureSink` on a disposed host or actor
resolve to a `{ kind: "disposed" }` ticket; they never throw synchronously.

**Fix (minimal).** Move the `admission.capture()` call inside the existing
try/catch (or a new guard) and map `gate-disposed` to a settled `disposed`
ticket. Mirror the same for `captureSink`.

**Acceptance.** `send()` after `dispose()` returns `disposed` with no throw;
before disposal behavior unchanged.

**Tests.** `actor_host.test.ts` (send after host dispose); `dispatcher.test.ts`
(disposed ticket path already exists — assert host-level disposal routes there).

---

#### #11 — Unbounded recursion over renderer data

**Current.** `RemoteMachineTransport` `structuredClone`s and recursively
`deepFreezePreparedValue`s every nested property of a decoded native intent
(`remote_transport.ts:128-147, 578-580`) after only a byte-size check on the
envelope (`:438`). A deeply-nested-but-small renderer payload can overflow the
main-process stack.

**Invariant.** Decoding/freezing renderer-supplied data is bounded in depth and
total work; an over-depth envelope is rejected with an `invalid-event` receipt,
not a stack overflow.

**Fix (minimal).** Replace recursive deep-freeze with an iterative walker that
enforces an explicit depth limit (reuse the budget-walker structure in
`remote_protocol.ts:11-101`). Reject over-depth intents before recursion.

**Acceptance.** A synthetic deeply-nested intent returns `rejected/invalid-event`
and main survives; normal intents unchanged.

**Tests.** `remote_transport.test.ts` (deep-nesting rejection).

---

### Phase 2 — Reliability and observability

#### #1 — Errors are silently discarded in production

**Current.** `ActorHost` is constructed with no `reportError`
(`ipc/services/distributed_machine_actor_host.ts:4-8`), so `HostedActor.reportFailure`
(`actor_host.ts:842-852`) is a no-op. `RemoteMachineTransport` is constructed
with no `onError` (`ipc/services/distributed_machine_host.ts:37-52`), so
broadcast/projection/codec/budget failures are swallowed
(`remote_transport.ts:1330-1341`). A transition that throws, or a snapshot that
fails to project, produces **no log** and the renderer sits on a stale snapshot.

**Invariant.** Every dispatcher-stage failure and every transport
projection/codec/budget failure is observable in production — at minimum logged
with machine id + key + stage — so a desynced renderer is diagnosable.

**Fix (minimal).** Pass a `reportError` to `ActorHost` and an `onError` to
`RemoteMachineTransport` that log via `electron-log`
(`log.scope("distributed-machines")`), including `machineId`, `keyToString(key)`,
and the failure stage. Do not change control flow.

**Acceptance.**

- A forced transition throw produces a structured log line.
- A forced snapshot projection throw produces a log line and the renderer is
  not left silently stale (see cross-layer A1 for the renderer-facing contract).

**Tests.** Unit test the reporter wiring; a test that forces a projection throw
and asserts `onError` is invoked.

---

#### #4 — Admission failures misclassified as `host-disposing`

**Current.** `dispatchOnce` / `receiptFromDispatchTicket` map every
`ActorAdmissionError` that is not instance/revision-stale to `"host-disposing"`
(`remote_transport.ts:977-989, 1064-1077, 814-825`). `key-fenced`,
`stale-admission-generation`, and `untracked-command-completion` all surface as
"host is shutting down", causing the renderer to tear down its store instead of
retrying.

**Invariant.** Each admission error code maps to a distinct receipt reason;
`host-disposing` is reserved for actual disposal.

**Fix (minimal).** Extend the reason mapping so `key-fenced` /
`stale-admission-generation` / `untracked-command-completion` produce a
distinct, retryable reason (e.g. `"fenced"` / `"stale-actor"`), and only a real
disposed condition produces `host-disposing`. Keep the receipt schema backward
compatible (add enum values, or reuse an existing retryable reason).

**Acceptance.** A dispatch during an active fence returns a retryable reason;
renderer does not reset to `unavailable`.

**Tests.** `remote_transport.test.ts` (dispatch under fence), and a renderer
`remote_client.test.ts` assertion that the non-disposing reason does not tear
down the store.

---

#### #9 — Authorization has no timeout

**Current.** `authorizeSubscribe` / `authorizeDispatch` are awaited with no
deadline (`remote_transport.ts:267, 672, 733`), and pending-subscription
accounting is released only in `completeSubscription`'s `finally` (`:375-377`).
A hung DB/network call inside `requireExistingChat` pins the renderer in
"connecting" and consumes a per-window slot per retry.

**Invariant.** Authorization completes or fails within a bounded time; a hung
authorization releases its slot and returns a retryable error.

**Fix (minimal).** Wrap authorization in a deadline (`AbortSignal.timeout` or
`Promise.race` with a timer). On timeout, release accounting and return a
retryable receipt. Make the timeout a transport option with a sane default.

**Acceptance.** A never-resolving authorizer returns after the deadline and the
subscription slot is freed.

**Tests.** `remote_transport.test.ts` (injected hanging authorizer + fake clock).

---

#### #14 — Duplicate subscriptions are not reference-counted

**Current.** A second `subscribe` from the same `webContents` overwrites the
window entry (`remote_transport.ts:362-364` sets `windows.set(sender.id, 1)`),
so one `unsubscribe` (`:1376-1382`) drops the reference and stops snapshot
pushes another subscriber still expects.

**Invariant.** One webContents subscribing twice to the same address is
reference-counted (or deduplicated by a per-caller token); a single unsubscribe
removes only that caller's reference.

**Fix (minimal).** Reference-count per window, or key the subscription by a
caller-supplied token instead of `webContentsId`. Ensure `releaseEntryIfUnused`
only releases when no references remain.

**Acceptance.** Double-subscribe → single-unsubscribe keeps pushes flowing; a
second unsubscribe releases.

**Tests.** `remote_transport.test.ts` (duplicate subscribe/unsubscribe).

---

### Phase 3 — Memory and lifecycle

#### #6 — `untrackedCommandKeys` never cleared per key

**Current.** A legacy command runner returning `void` marks the admission key
(`actor_host.ts:1601-1608`); the set is cleared only by whole-host disposal
(`:1508`). `beginFence` / `beginMachineFence` then permanently reject that key
(`:1003-1023, 1085-1090`), even after the actor is disposed and recreated.

**Invariant.** A key is marked untracked only while its command is actually
untracked-and-running; the mark is cleared when the actor for that key is
disposed (and recreated actors are clean).

**Fix (minimal).** Clear the key's untracked mark on actor disposal, or store the
mark on the `HostedActor` so recreation resets it.

**Acceptance.** Fence succeeds after `dispose` + recreate of the same key.

**Tests.** `actor_host.test.ts` (untracked command → dispose → recreate → fence).

---

#### #7 — Admission-gate entries leak after every fence

**Current.** `KeyedAdmissionGate.trackCaptured` deletes an idle entry only when
its generation equals the default generation (`keyed_admission_gate.ts:218-225`),
but `abort`/`release` always install a fresh generation (`:334, 349`). Each
fence leaves a permanent entry until host shutdown.

**Invariant.** Gate entries are reclaimed when a fence aborts/releases and no
continuations remain, regardless of generation.

**Fix (minimal).** Relax the cleanup predicate to reclaim an idle entry whenever
`active.size === 0` and no fence is active, independent of generation ordinal.

**Acceptance.** Repeated fence cycles keep `inspectEntryCount()` bounded.

**Tests.** `keyed_admission_gate.test.ts` (fence loop, entry count).

---

#### #8 — `actorKeys` (address → canonical key) never released

**Current.** `actorKeys` is set on subscribe (`remote_transport.ts:348`), deleted
only on actor disposal (`:200`) or a disposing outcome (`:1000, 1087`);
`releaseEntryIfUnused` removes the subscription but not the key (`:1384-1388`).
With `idleEviction: retain`, every chat/app key ever subscribed stays resident
for the process lifetime (alongside the memoizing `chatStreamKey` factory,
`chat_stream/transport.ts:23-30`).

**Invariant.** Releasing the last window reference releases the address→key
mapping; memory is bounded by currently-subscribed + live actors.

**Fix (minimal).** Delete `actorKeys` for the address when the last window
unsubscribes; optionally bound the memoizing key factories.

**Acceptance.** Subscribe → unsubscribe removes the mapping.

**Tests.** `remote_transport.test.ts` (unsubscribe releases key mapping).

---

### Phase 4 — API contract cleanup

#### #10 — `canonicalizeKeyAfterAuthorization` cannot actually canonicalize

**Current.** After authorization the transport requires the canonical key to
produce the same domain address _and_ byte-identical v8 encoding
(`remote_transport.ts:275-290`); dispatch uses the subscription's stored key, so
any machine wanting to fold aliases/legacy key forms fails on subscribe.

**Fix (either, prefer the first).**

1. Relax the post-authorization check to domain-address (`keyToString`) equality
   and route dispatch through the canonical key.
2. If no machine needs aliasing today, remove the hook and document the
   restriction explicitly rather than leaving a misleading API.

**Acceptance.** A test machine with a key alias either folds correctly, or the
field is removed from the public type.

**Tests.** `remote_transport.test.ts` (alias key).

---

#### #12 — Unused lifecycle policy fields

**Current.** `rendererOwnership`, `survivesRendererReload`, `restartPersistence`,
and the `persistence` policy are never read at runtime (renderer-reload survival
is emergent from `idleEviction: retain` + window unregister). The async
hydration/persistence wave is documented as not-yet-built
(`definition.ts:131-139`).

**Fix (minimal).** Remove the unused fields from the public lifecycle/persistence
contract until the guarantees exist, and add a doc comment noting the emergent
survival mechanism. Do not attempt to implement persistence now.

**Acceptance.** `npm run ts` passes with the fields gone; grep confirms no dead
reads.

**Tests.** Type-level only (no runtime test).

---

#### #13 — `transactionSequence` counts attempts, not commits

**Current.** `transactionSequence` increments in the transition callback _before_
`definition.transition` runs (`actor_host.ts:290-293`), so it counts transition
attempts including throws and ignored events, yet is exposed on receipts and
snapshots (`remote_transport.ts:1028-1037`).

**Fix (minimal).** Rename to `transitionAttempts` (or move the increment to the
post-commit path) so the name matches the semantics, and update consumers. If no
consumer compares it, renaming is a safe cleanup.

**Acceptance.** Receipts/snapshots expose a monotonically-committed (or clearly
attempt-based) sequence; no silent semantic ambiguity.

**Tests.** `dispatcher.test.ts` / `actor_host.test.ts` (ignored event vs commit).

---

## Additional cross-layer findings (not in the 14)

These surfaced in the same audit and are at least as severe; schedule them in
Phase 1 or 2 rather than dropping them.

#### A1 — Codec runs before authorization (main-thread DoS)

`prepareDispatchIdentity` runs the key/event codec (`remote_transport.ts:570-577`)
and fingerprints (v8-serialize + SHA-256, `:581-583, 1148-1168`) _before_
`authorizeDispatch` (`:672` legacy / `:733` native). `chat_stream` allows a
48 MiB intent (`chat_stream/transport.ts:17`), so a compromised renderer can pin
main with schema-valid 48 MiB `SUBMIT`s before the authorization DB read denies
them.

**Invariant.** Cheap, coarse authorization (envelope type + key + a small
structural budget) runs before full codec parse / serialization / hashing of
renderer-controlled bodies.

**Fix (minimal).** Authorize the key + envelope type first; enforce a small
pre-auth body budget; then run the full codec. Do not reorder the _existing_
domain authorization (which already runs after codec and is fine to keep as the
deep check).

**Tests.** `remote_transport.test.ts` (oversize body rejected pre-auth).

#### A2 — Tracked completion can hang the UI forever

Outcome loss is silent: oversize/codec-failure outcomes only call `onError`
(`remote_transport.ts:859-868`), and the renderer drops bad outcomes without
removing its listener (`remote_client.ts:511-521`). A transport disconnect after
admission has no replay, and `pendingOutcome` deadlocks when the committing actor
instance differs from the observed one (`request_actor.ts:198-205`).

**Invariant.** Every tracked operation reaches a renderer-visible terminal state
(outcome, rejection, or a bounded timeout) — no leak, no permanent `running`.

**Fix (minimal).** Emit a rejection/error envelope when the outcome cannot be
encoded (instead of silent `onError`); add a bounded completion timeout on the
renderer; release `pendingOutcome` when the observed actor instance changes.

**Tests.** `operation_registry.test.ts`, `request_actor`/`use_machine_mutation`
tests (oversize outcome, disconnect, actor-instance mismatch).

#### A3 — Receipt revision never advances client metadata

`remote_client.ts:913-923` returns the receipt and leaves `metadata` untouched,
so a second dispatch issued right after an `applied` receipt re-sends the stale
`expectedRevision` and self-inflicts `revision-conflict`.

**Invariant.** An `applied` receipt's `revision`/`transactionSequence` advance
the client's observed revision (or the client otherwise avoids reusing a stale
revision for the immediately-following dispatch).

**Tests.** `remote_client.test.ts` (back-to-back dispatches).

---

## Command-concurrency audit (additional concern)

The dispatcher serializes **state transitions**, not **external side effects**.
Commands in one batch may run concurrently (`definition.ts:439-449`), and
`chat_stream` fire-and-forgets the long-running `admit-and-start`
(`definition.ts:195`). Two commands can concurrently write the same message row,
mutate the session queue, or produce streaming output.

Add a dedicated audit covering four properties, and encode each as an invariant

- test:

1. **Ordering.** State-changing commands that touch the same shared resource must
   serialize on a domain-level lock (the queue already uses `withChatQueueLock`,
   `chat_stream/queue_lock.ts`; verify message-row writes and `finalize` are
   covered). Document which resources are last-writer-wins by design.

2. **Cancellation.** Cancelling a command must be idempotent and must not leave
   partial side effects unaccounted. `cancelTrackedStreams` already drains
   `streamCompletions` (`chat_stream_handlers.ts:598-602`); verify
   `admit-and-start` and `finalize` honor the same drain.

3. **Idempotency.** Command execution must be idempotent under retry/replay.
   Admission already dedupes via `payloadHash` (`persistence.ts:64-71`); verify
   `markIntentTerminal` / `finalize` are safe if re-driven.

4. **Ownership.** Every command must carry the `invocationRef`/`operationId` it
   acts on and reject stale correlation (transitions already use
   `sameInvocationRef`; verify the command side matches).

**Deliverable.** A short `plans/` note (this section expanded) plus integration
tests for the two commands that currently overlap: concurrent
`mutate-queue` + `finalize`, and cancel-during-`admit-and-start`.

---

## Test inventory (summary)

| Finding | Test file                                                     | Case                                    |
| ------- | ------------------------------------------------------------- | --------------------------------------- |
| #5      | `distributed_machines/__tests__/actor_host.test.ts`           | re-entrant revision-guarded dispatch    |
| #2      | `actor_host.test.ts`, chat_stream integration                 | dispose mid-command drain               |
| #3      | `actor_host.test.ts`                                          | send after host dispose                 |
| #11     | `remote_transport.test.ts`                                    | deep-nesting rejection                  |
| #1      | reporter unit + `remote_transport.test.ts`                    | forced transition/projection throw logs |
| #4      | `remote_transport.test.ts`, `remote_client.test.ts`           | fenced dispatch reason + no teardown    |
| #9      | `remote_transport.test.ts`                                    | hanging authorizer timeout              |
| #14     | `remote_transport.test.ts`                                    | duplicate subscribe ref-count           |
| #6      | `actor_host.test.ts`                                          | untracked → recreate → fence            |
| #7      | `keyed_admission_gate.test.ts`                                | fence loop entry bound                  |
| #8      | `remote_transport.test.ts`                                    | unsubscribe releases key                |
| #10     | `remote_transport.test.ts`                                    | alias key (or field removed)            |
| #13     | `dispatcher.test.ts`                                          | ignored vs commit sequence              |
| A1      | `remote_transport.test.ts`                                    | oversize body pre-auth                  |
| A2      | `operation_registry.test.ts`, `use_machine_mutation.test.tsx` | outcome loss / disconnect / mismatch    |
| A3      | `remote_client.test.ts`                                       | back-to-back dispatch revision          |

## Out of scope / explicitly preserved

- No generic controller / no XState (per `machine-followup.md`).
- No rewrite of `TransactionalDispatcher`'s core loop.
- No persistence/hydration implementation (the "wave" stays deferred).
- No change to the `chat_stream` transition semantics or wire protocol version.
