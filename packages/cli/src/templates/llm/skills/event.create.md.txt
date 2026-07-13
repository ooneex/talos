---
name: event-create
description: Generate a new PubSub event class with its test file, then complete the generated code. Use when creating a new publish/subscribe event that extends PubSub from @talosjs/event.
allowed-tools: Bash(talos event:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>] [--channel=<channel>]
disallowed-tools: AskUserQuestion
---

# Make PubSub Event Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a PubSub event class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the pubsub-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos event:create --name=<name> --module=<module> --channel=<channel>
```

**Inferring options from the user's request:**

- `--name` — the event class name, taken from the event it represents (e.g., "an event when a user is created" → `UserCreated`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Event` suffix automatically, so omit the suffix.
- `--channel` — optional; pass only if the user names a specific channel. Otherwise omit and it defaults to the kebab-case form of the name (e.g., `UserCreated` → `user-created`).

### 2. Complete the PubSub event class

Read `modules/<module>/src/events/<Name>Event.ts`, then implement:

- Define a proper data type instead of `Record<string, ScalarType>`
- Implement `handler()` with actual event handling logic
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

Read and replace `modules/<module>/tests/events/<Name>Event.spec.ts`:

**Coverage:** class identity (`name.endsWith("Event")`, is constructor), `getChannel` exists and returns non-empty string consistently, `handler` exists and returns `Promise`, inherited methods (`publish`, `subscribe`, `unsubscribe`, `unsubscribeAll`) all exist. After implementing: add a test verifying `handler` calls the injected service's `execute` with event data.

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
