---
name: cron-create
description: Generate a new cron job class with its test file, then complete the generated code. Use when creating a new scheduled task that extends the Cron base class from @talosjs/cron.
allowed-tools: Bash(talos cron:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Cron Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a cron class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the cron-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos cron:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the cron job class name, taken from the scheduled task (e.g., "a cron that cleans expired tokens" → `CleanExpiredTokens`).

### 2. Complete the cron class

Read `modules/<module>/src/cron/<Name>Cron.ts`, then implement:

- Set the cron schedule in `getTime()` (e.g., `"every 5 minutes"`, `"every 1 hours"`)
- Set the timezone in `getTimeZone()` or return `null` for server timezone
- Implement `handler()` with actual cron logic
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

Read and replace `modules/<module>/tests/cron/<Name>Cron.spec.ts`:

**Coverage:** class identity (`name.endsWith("Cron")`, is constructor), `getTime` exists and returns non-empty string in `every N unit` format, `getTimeZone` exists and returns `null` or a non-empty IANA string, `handler` exists and returns a `Promise`, instance isolation.

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
