---
name: talos-architecture
description: Decide which execution architecture to use for a feature — Event-Driven (@talosjs/event), Queue (@talosjs/queue), Workflow (@talosjs/workflow), Cron (@talosjs/cron), or real-time (@talosjs/socket) — and how to combine them.
when_to_use: Use when a request involves background work, multi-step processes, decoupling, scheduling, fan-out/notifications, or "when X happens, do Y".
user-invocable: false
---

# Choosing an Architecture

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

Most features are just a service called from a controller — reach for an architecture only when work is **decoupled, deferred, ordered, scheduled, or pushed**. Pick the smallest fit, then combine (see Combining). See `talos-packages` for the full catalog and `talos-module` for where each artifact lives.

## Decision guide

| The request is about… | Use | Package | Create with |
|---|---|---|---|
| "When X happens, notify/react" — one producer, many independent reactions, fire-and-forget | **Event-Driven** | `@talosjs/event` | `event-create` |
| Deferred or heavy work the caller shouldn't wait for — emails, exports, image/video processing, retries, backpressure | **Queue** | `@talosjs/queue` | `queue-create` |
| A multi-step business process where steps are **ordered** and a failure must **undo** prior steps (saga) | **Workflow** | `@talosjs/workflow` | `workflow-create` + `workflow-transition-create` |
| Recurring/scheduled work on a clock — cleanups, digests, syncs, polling | **Cron** | `@talosjs/cron` | `cron-create` |
| Push to connected clients in real time — chat, live updates, presence, rooms | **Real-time** | `@talosjs/socket` (+ `@talosjs/event` to fan out) | socket controller (see `talos-packages`) |
| A single synchronous request/response with no deferral | **No architecture** — a plain service | `@talosjs/service` | `service-create` |

When two rows apply, they usually **compose** rather than compete (see Combining).

## Event-Driven (`@talosjs/event`)

Redis pub/sub — a producer `publish()`es to a channel; any number of subscribers `handler()` it independently, decoupling a side effect from its trigger.

- **Use when:** the trigger needn't know who reacts; reactions are independent; occasional message loss is tolerable (fire-and-forget, not persisted).
- **Avoid when:** you need retry/durability/guaranteed-once delivery → **Queue**; ordered steps with rollback → **Workflow**.
- Each event is one channel + one `handler()`. Register events in the module's `events` array (see `talos-scaffold`).

## Queue (`@talosjs/queue`)

BullMQ over Redis — the caller `add()`s a job and returns immediately; a worker processes it later with retries and concurrency control. Reads `QUEUE_REDIS_URL` from `AppEnv`.

- **Use when:** work is slow, rate-limited, externally dependent, or must survive a crash and retry; the response must not block on it.
- **Avoid when:** the reaction is instant and durability doesn't matter → **Event** is lighter; steps must roll back as a unit → **Workflow** (a single queue job can *host* a workflow).
- Add typed `add`/`addBulk` wrappers per job type; use `addBulk` for fan-out.

## Workflow (`@talosjs/workflow`)

An ordered list of **transitions**, each conditional (`isActive`), reversible (`rollback`), and DI-resolved. `run()` executes active transitions in order; if any throws, executed ones roll back in **reverse order** and a `WorkflowException` is thrown — the **saga** pattern.

- **Use when:** a process has multiple steps touching different systems (reserve stock → charge card → create shipment) and partial failure must be unwound cleanly.
- **Avoid when:** a single step, or independent steps needing no rollback (use Events/Queue). Long-running steps spanning minutes/hours across processes — model those as Queue jobs that each invoke a workflow.
- Generate the workflow, then one transition per step with `workflow-transition-create`, listed in order in `getTransitions()`.

## Cron (`@talosjs/cron`)

Timezone-aware scheduled jobs with human-readable syntax (`'every 1 hours'`). Use for clock-driven work rather than a user action: cleanups, nightly digests, cache warming, polling an external API.

- **Avoid when:** the work is triggered by a system event (use Events/Queue) — cron is for time, not reactions. Keep `job()` thin: **enqueue** rather than do heavy work inline.

## Real-time (`@talosjs/socket`)

WebSocket server with rooms and pub/sub channels for pushing updates to connected clients: chat, live dashboards, collaborative editing, presence.

- **Avoid when:** clients can poll or request/response suffices. Pair with `@talosjs/event` so backend changes fan out to the right rooms.

## Combining them

Compose along the flow **trigger → decouple → defer → orchestrate → push**:

- **Event → Queue:** an event handler enqueues durable work — publish decouples, queue gives retries/backpressure. *e.g. `OrderPlaced` event → handler adds an `Invoice` job.*
- **Queue → Workflow:** a queue job's processor calls `workflow.run()` — queue provides durability/retry/concurrency, workflow provides ordered steps with rollback. Standard shape for a reliable multi-step background process.
- **Cron → Queue:** the cron job only enqueues (one job, or `addBulk` for fan-out); workers do the work. Decouples scheduling from execution and parallelizes safely.
- **Workflow → Event:** a transition publishes an event on success (e.g. `PaymentCaptured`) so other domains react without the workflow depending on them.
- **Event → Socket:** a domain event handler publishes to a socket room so connected clients update live.

**Canonical end-to-end example — "process a checkout":**
1. Controller validates input, calls a service, returns `202` fast.
2. Service publishes `CheckoutStarted` (**event**) and `add()`s a `Checkout` job (**queue**).
3. The queue worker runs the `Checkout` **workflow**: `ReserveStock → ChargeCard → CreateShipment`, each a transition with a `rollback`.
4. The final transition publishes `CheckoutCompleted` (**event**); a subscriber pushes a live update to the user's **socket** room and another enqueues a confirmation email job.
5. A nightly **cron** enqueues reconciliation jobs for any checkouts left pending.
