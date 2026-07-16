---
name: event-create
description: Generate a new PubSub event class with its test file, then complete the generated code.
when_to_use: Use when creating a new publish/subscribe event that extends PubSub from @talosjs/event.
model: sonnet
effort: low
allowed-tools: Bash(talos event:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>] [--channel=<channel>]
---

# Make PubSub Event Class

> **Run autonomously — do not ask the user questions.** Pick the recommended option and proceed.

Generate a PubSub event class and test file, then complete the implementation (pubsub-specific parts only).

- **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (once extracted into a shared package). Check both roots; every `modules/<module>/...` path applies equally under `packages/<module>/...`.
- **Shared workflow:** follow the `talos-scaffold` skill for run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions.

## Steps

### 1. Infer options, then run the generator

```bash
talos event:create --name=<name> --module=<module> --channel=<channel>
```

- `--name` — event class name, from the event it represents ("an event when a user is created" → `UserCreated`). Any casing; the CLI normalizes to PascalCase and appends the `Event` suffix, so omit it.
- `--channel` — optional; pass only if the user names a specific channel. Defaults to the kebab-case name (`UserCreated` → `user-created`).

### 2. Complete the PubSub event class

Read `modules/<module>/src/events/<Name>Event.ts`, then:

- Define a proper data type instead of `Record<string, ScalarType>`
- Implement `handler()` with real event-handling logic
- Set the channel name in `getChannel()`

```typescript
import { inject } from "@talosjs/container";
import type { ScalarType } from "@talosjs/types";
import { decorator, RedisPubSub, RedisPubSubClient } from "@talosjs/event";

@decorator.event()
export class <Name>Event<Data extends Record<string, ScalarType> = Record<string, ScalarType>> extends RedisPubSub<Data> {
  constructor(
    @inject(RedisPubSubClient)
    client: RedisPubSubClient<Data>,
  ) {
    super(client);
  }

  public getChannel(): string {
    return "<channel>";
  }

  public async handler(context: { data: Data; channel: string }): Promise<void> {
    // TODO: Implement handler logic here.
    // Do NOT log the full context/data — event payloads may carry secrets or PII.
    // If logging is needed, log only context.channel and non-sensitive identifiers.
  }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/events/<Name>Event.spec.ts`.

**Coverage:** class identity (`name.endsWith("Event")`, is constructor); `getChannel` exists, returns non-empty string consistently; `handler` exists, returns `Promise`; inherited methods (`publish`, `subscribe`, `unsubscribe`, `unsubscribeAll`) all exist. After implementing: add a test verifying `handler` calls the injected service's `execute` with event data.

```typescript
import { describe, expect, mock, test } from "bun:test";
import { <Name>Event } from "@/events/<Name>Event";

describe("<Name>Event", () => {
  test("should have class name ending with 'Event'", () => {
    expect(<Name>Event.name.endsWith("Event")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Event).toBe("function");
  });

  test("should have 'getChannel' method", () => {
    expect(typeof <Name>Event.prototype.getChannel).toBe("function");
  });

  test("'getChannel' should return a non-empty string", () => {
    const event = Object.create(<Name>Event.prototype) as <Name>Event;
    const channel = event.getChannel();
    expect(typeof channel).toBe("string");
    expect(channel.length).toBeGreaterThan(0);
  });

  test("'getChannel' should return the same value on repeated calls", () => {
    const event = Object.create(<Name>Event.prototype) as <Name>Event;
    expect(event.getChannel()).toBe(event.getChannel());
  });

  test("should have 'handler' method", () => {
    expect(typeof <Name>Event.prototype.handler).toBe("function");
  });

  test("'handler' should return a Promise", () => {
    const mockClient = {
      subscribe: mock(() => Promise.resolve()),
      publish: mock(() => Promise.resolve()),
      unsubscribe: mock(() => Promise.resolve()),
      unsubscribeAll: mock(() => Promise.resolve()),
    };
    const event = new <Name>Event(mockClient as any);
    const result = event.handler({ data: {} as any, channel: event.getChannel() });
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("should have 'publish' method", () => {
    expect(typeof <Name>Event.prototype.publish).toBe("function");
  });

  test("should have 'subscribe' method", () => {
    expect(typeof <Name>Event.prototype.subscribe).toBe("function");
  });

  test("should have 'unsubscribe' method", () => {
    expect(typeof <Name>Event.prototype.unsubscribe).toBe("function");
  });

  test("should have 'unsubscribeAll' method", () => {
    expect(typeof <Name>Event.prototype.unsubscribeAll).toBe("function");
  });

  // Add handler behavior test after implementing (verify service.execute called with event data)
});
```

### 4. Register the event

Add `<Name>Event` to the `events` array in `src/<PascalModuleName>Module.ts` (see `talos-scaffold` for the `ModuleType` shape).

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
