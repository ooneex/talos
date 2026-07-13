---
name: analytics-create
description: Generate a new analytics class with its test file, then complete the generated code. Use when creating a new analytics tracking class that uses the @talosjs/analytics package.
allowed-tools: Bash(talos analytics:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Analytics Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate an analytics class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the analytics-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos analytics:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the analytics class name, taken from what is tracked (e.g., "analytics for page views" → `PageView`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Analytics` suffix automatically, so omit the suffix.

### 2. Complete the analytics class

Read `modules/<module>/src/analytics/<Name>Analytics.ts`, then implement:

- Implement `capture` with actual analytics tracking logic
- Define a proper `CaptureOptionsType` instead of `Record<string, unknown>` — allowlist only the non-PII fields you intend to send; never forward raw payloads, credentials, or personal data to a third-party tracker, and do not log the full options object

```typescript
import { type IAnalytics, decorator } from "@talosjs/analytics";

type CaptureOptionsType = Record<string, unknown>;

@decorator.analytics()
export class <Name>Analytics<T extends CaptureOptionsType = CaptureOptionsType> implements IAnalytics<T> {
  public capture(options: T): void {
    // console.log("Analytics captured:", options);
  }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/analytics/<Name>Analytics.spec.ts`:

**Coverage:** class identity (`name.endsWith("Analytics")`, is constructor), `capture` exists, is synchronous (returns `void`), does not throw with empty or valid options, instance isolation. Add spy tests on the underlying tracker after implementing `capture`.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>Analytics } from "@/analytics/<Name>Analytics";

describe("<Name>Analytics", () => {
  test("should have class name ending with 'Analytics'", () => {
    expect(<Name>Analytics.name.endsWith("Analytics")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Analytics).toBe("function");
  });

  test("should have 'capture' method", () => {
    expect(typeof <Name>Analytics.prototype.capture).toBe("function");
  });

  test("'capture' should not throw when called with an empty object", () => {
    const analytics = new <Name>Analytics();
    expect(() => analytics.capture({} as any)).not.toThrow();
  });

  test("'capture' should not throw when called with valid options", () => {
    const analytics = new <Name>Analytics();
    expect(() => analytics.capture({ event: "page_view", userId: "u1" } as any)).not.toThrow();
  });

  test("'capture' should return void", () => {
    const analytics = new <Name>Analytics();
    const result = analytics.capture({ event: "click" } as any);
    expect(result).toBeUndefined();
  });

  // Add spy tests on the underlying tracker after implementing capture()

  test("should produce independent instances", () => {
    const a = new <Name>Analytics();
    const b = new <Name>Analytics();
    expect(a).not.toBe(b);
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
