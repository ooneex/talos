# @talosjs/queue

Background job queue for TypeScript — define typed, decorator-registered workers on top of [BullMQ](https://docs.bullmq.io/) and Redis with retries, progress tracking, and full lifecycle events.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **BullMQ-powered** - Durable, Redis-backed queues with retries and backpressure

✅ **Typed jobs** - Generic `Data` and `Output` types flow through `add`, `handler`, and events

✅ **Decorator registration** - Register a queue in the container with a single decorator

✅ **Dependency injection** - Queues are resolved from `@talosjs/container`

✅ **Bulk enqueue** - Add many jobs at once with `addBulk`

✅ **Lifecycle events** - Opt into worker hooks (`onCompleted`, `onFailed`, `onProgress`, and more)

✅ **Typed exceptions** - Failures surface as a `QueueException` carrying context

✅ **Type-Safe** - Full TypeScript support throughout

## Installation

```bash
bun add @talosjs/queue
```

Requires a running Redis instance (BullMQ's backing store).

## Concepts

A **queue** pairs a BullMQ `Queue` (where jobs are enqueued) with a `Worker` (which
processes them). You extend the abstract `Queue` base class, wire both to Redis,
and implement `handler` — the function that runs for each job. Producers call
`add`/`addBulk` to enqueue work; the worker invokes `handler` for each job.

The `Queue` base class provides:

| Member | Purpose |
| --- | --- |
| `add(name, data, opts?)` | Enqueue a single job. |
| `addBulk(jobs)` | Enqueue many jobs in one call. |
| `removeJob(id)` | Remove a job by id. |
| `handler(job)` | Abstract — your processing logic for each job. |
| `registerEvents()` | Wires any declared `on*` hooks to the worker. |
| `close()` | Closes the worker and the queue. |

## Usage

### Define a queue

```typescript
import { decorator, Queue } from '@talosjs/queue';
import { Queue as BullQueue, Worker, type Job } from 'bullmq';

interface EmailData extends Record<string, string> {
  to: string;
  subject: string;
  body: string;
}

@decorator.queue()
export class EmailQueue extends Queue<EmailData, void> {
  private connection = { host: '127.0.0.1', port: 6379 };

  protected queue = new BullQueue<EmailData, void>('email', {
    connection: this.connection,
  });

  protected worker = new Worker<EmailData, void>(
    'email',
    (job) => this.handler(job),
    { connection: this.connection },
  );

  constructor() {
    super();
    this.registerEvents();
  }

  public handler = async (job: Job<EmailData, void>): Promise<void> => {
    await mailer.send(job.data.to, job.data.subject, job.data.body);
  };

  // Optional worker event hooks
  public onCompleted = (job: Job<EmailData, void>): void => {
    logger.info(`Sent email job ${job.id}`);
  };

  public onFailed = (job: Job<EmailData, void> | undefined, error: Error): void => {
    logger.error(`Email job ${job?.id} failed`, error);
  };

  public onError = (error: Error): void => {
    logger.error('Email worker error', error);
  };
}
```

### Enqueue jobs

```typescript
import { container } from '@talosjs/container';

const queue = container.get(EmailQueue);

// A single job
await queue.add('welcome', {
  to: 'user@example.com',
  subject: 'Welcome',
  body: 'Thanks for signing up!',
});

// Many jobs at once
await queue.addBulk([
  { name: 'digest', data: { to: 'a@example.com', subject: 'Digest', body: '…' } },
  { name: 'digest', data: { to: 'b@example.com', subject: 'Digest', body: '…' } },
]);
```

## Lifecycle events

Declare any of the optional `on*` hooks on your queue and call `registerEvents()`
once the worker exists. They map directly to BullMQ
[worker events](https://docs.bullmq.io/guide/workers):

| Hook | Fires when |
| --- | --- |
| `onActive(job, prev)` | A job started processing. |
| `onCompleted(job, result, prev)` | A job finished successfully. |
| `onFailed(job, error, prev)` | A job threw during processing. |
| `onProgress(job, progress)` | A job reported progress via `job.updateProgress`. |
| `onStalled(jobId, prev)` | A job was detected as stalled. |
| `onDrained()` | No more jobs to process. |
| `onPaused()` / `onResumed()` | The worker was paused / resumed. |
| `onClosing(message)` / `onClosed()` | The worker is closing / has closed. |
| `onReady()` | The worker connected to Redis. |
| `onError(error)` | An error occurred in the worker. Always attach this. |

## Error handling

`QueueException` extends `Exception` from `@talosjs/exception` with an
`InternalServerError` (500) status. Throw it from a `handler` to surface a typed,
HTTP-mapped failure carrying contextual `data`.

## API

### `Queue<Data, Output>`

Abstract base class. Subclasses provide `queue`, `worker`, and `handler`, and may
declare optional `on*` event hooks. Provides `add`, `addBulk`, `removeJob`,
`registerEvents`, and `close`.

### `decorator`

- `decorator.queue(scope?)` — registers a queue class in the container. Defaults to `EContainerScope.Singleton`.

### Types

- `IQueue<Data, Output>` — interface implemented by `Queue`.
- `QueueClassType` — constructor type for a queue class.
- `QueueHandlerReturnType<Output>` — the return type of a `handler`.
- `ScalarType` — allowed job-data value type (`boolean | number | bigint | string`).
- `CleanJobType` — job state used when cleaning a queue.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
