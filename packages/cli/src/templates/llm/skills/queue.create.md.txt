---
name: queue-create
description: Generate a new queue class with its test file, then complete the generated code. Use when creating a new BullMQ-backed job queue that extends Queue from @talosjs/queue.
allowed-tools: Bash(talos queue:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Queue Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a queue class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the queue-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos queue:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the queue class name, taken from the jobs it carries (e.g., "a queue for sending emails" → `Email`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Queue` suffix automatically, so omit the suffix.

### 2. Complete the queue class

Read `modules/<module>/src/queues/<Name>Queue.ts`, then implement:

- Add typed `add`/`addBulk` wrappers for the jobs this queue carries, or use the inherited `add`, `addBulk`, `removeJob`, and `close` methods directly
- `Queue` reads `QUEUE_REDIS_URL` from the injected `AppEnv`, so ensure that environment variable is set

```typescript
import { decorator, Queue } from "@talosjs/queue";

@decorator.queue()
export class <Name>Queue extends Queue {
  // Add custom queue logic here, or use the inherited
  // add, addBulk, removeJob and close methods.
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/queues/<Name>Queue.spec.ts`:

**Coverage:** class identity (`name.endsWith("Queue")`, is constructor), the inherited `add`, `addBulk`, and `removeJob` methods exist on the prototype. Avoid instantiating directly in unit tests — the constructor opens a Redis connection; assert against the prototype or inject a mocked `AppEnv` instead.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>Queue } from "@/queues/<Name>Queue";

describe("<Name>Queue", () => {
  test("should have class name ending with 'Queue'", () => {
    expect(<Name>Queue.name.endsWith("Queue")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Queue).toBe("function");
  });

  test("should have 'add' method", () => {
    expect(typeof <Name>Queue.prototype.add).toBe("function");
  });

  test("should have 'addBulk' method", () => {
    expect(typeof <Name>Queue.prototype.addBulk).toBe("function");
  });

  test("should have 'removeJob' method", () => {
    expect(typeof <Name>Queue.prototype.removeJob).toBe("function");
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
