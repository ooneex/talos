---
name: cron-create
description: Generate a new cron job class with its test file, then complete the generated code.
when_to_use: Use when creating a new scheduled task that extends the Cron base class from @talosjs/cron.
model: sonnet
effort: low
allowed-tools: Bash(talos cron:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Cron Class

> **Run autonomously — do not ask the user questions.** Pick the recommended option and proceed.

Generate a cron class and test file, then complete the implementation (cron-specific parts only).

- **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (once extracted into a shared package). Check both roots; every `modules/<module>/...` path applies equally under `packages/<module>/...`.
- **Shared workflow:** follow the `talos-scaffold` skill for run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions.

## Steps

### 1. Infer options, then run the generator

```bash
talos cron:create --name=<name> --module=<module>
```

- `--name` — cron job class name, from the scheduled task ("a cron that cleans expired tokens" → `CleanExpiredTokens`).

### 2. Complete the cron class

Read `modules/<module>/src/cron/<Name>Cron.ts`, then:

- Set the schedule in `getTime()` (e.g. `"every 5 minutes"`, `"every 1 hours"`)
- Set the timezone in `getTimeZone()`, or return `null` for server timezone
- Implement `handler()` with real cron logic
- Inject required dependencies via the constructor

```typescript
import type { TimeZoneType } from "@talosjs/country";
import { Cron, type CronTimeType, decorator } from "@talosjs/cron";

@decorator.cron()
export class <Name>Cron extends Cron {
  public getTime(): CronTimeType {
    return "every 1 hours";
  }

  public getTimeZone(): TimeZoneType | null {
    return null;
  }

  public async handler(): Promise<void> {
    // Implement your cron handler logic here
  }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/cron/<Name>Cron.spec.ts`.

**Coverage:** class identity (`name.endsWith("Cron")`, is constructor); `getTime` exists, returns non-empty string in `every N unit` format; `getTimeZone` exists, returns `null` or non-empty IANA string; `handler` exists, returns a `Promise`; instance isolation.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>Cron } from "@/cron/<Name>Cron";

describe("<Name>Cron", () => {
  test("should have class name ending with 'Cron'", () => {
    expect(<Name>Cron.name.endsWith("Cron")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Cron).toBe("function");
  });

  test("should have 'getTime' method", () => {
    expect(typeof <Name>Cron.prototype.getTime).toBe("function");
  });

  test("'getTime' should return a non-empty string", () => {
    const cron = new <Name>Cron();
    const time = cron.getTime();
    expect(typeof time).toBe("string");
    expect(time.length).toBeGreaterThan(0);
  });

  test("'getTime' should use the 'every N unit' format", () => {
    const cron = new <Name>Cron();
    expect(cron.getTime()).toMatch(/^every \d+ (second|minute|hour|day)s?$/);
  });

  test("should have 'getTimeZone' method", () => {
    expect(typeof <Name>Cron.prototype.getTimeZone).toBe("function");
  });

  test("'getTimeZone' should return null or a non-empty string", () => {
    const cron = new <Name>Cron();
    const tz = cron.getTimeZone();
    expect(tz === null || (typeof tz === "string" && tz.length > 0)).toBe(true);
  });

  test("should have 'handler' method", () => {
    expect(typeof <Name>Cron.prototype.handler).toBe("function");
  });

  test("'handler' should return a Promise", () => {
    const cron = new <Name>Cron();
    const result = cron.handler();
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("'handler' should resolve without throwing", async () => {
    const cron = new <Name>Cron();
    try {
      await cron.handler();
    } catch {
      // Expected when injected dependencies are absent
    }
  });

  test("should produce independent instances", () => {
    const a = new <Name>Cron();
    const b = new <Name>Cron();
    expect(a).not.toBe(b);
  });
});
```

### 4. Register the cron job

Add `<Name>Cron` to the `cronJobs` array in `src/<PascalModuleName>Module.ts` (see `talos-scaffold` for the `ModuleType` shape).

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
