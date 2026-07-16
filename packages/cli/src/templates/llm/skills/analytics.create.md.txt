---
name: analytics-create
description: Generate a new analytics class with its test file, then complete the generated code.
when_to_use: Use when creating a new analytics tracking class that uses the @talosjs/analytics package.
model: sonnet
effort: low
allowed-tools: Bash(talos analytics:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Analytics Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing.

Generate an analytics class and test file, then complete the implementation. Follow the `talos-scaffold` skill for the shared workflow (run-from-root, `--name`/`--module` inference, module registration, lint/format, conventions); this covers only analytics specifics.

## Steps

### 1. Infer options, then run the generator

```bash
talos analytics:create --name=<name> --module=<module>
```

- `--name` — analytics class name from what is tracked ("analytics for page views" → `PageView`). Any casing; the CLI normalizes to PascalCase and appends the `Analytics` suffix, so omit the suffix.

### 2. Complete the analytics class

Read `modules/<module>/src/analytics/<Name>Analytics.ts`, then implement:

- Implement `capture` with the actual tracking logic.
- Define a proper `CaptureOptionsType` instead of `Record<string, unknown>` — allowlist only the non-PII fields you send; never forward raw payloads, credentials, or personal data to a third-party tracker, and don't log the full options object.

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

Read and replace `modules/<module>/tests/analytics/<Name>Analytics.spec.ts`.

**Coverage:** class identity (`name.endsWith("Analytics")`, is constructor); `capture` exists, is synchronous (returns `void`), doesn't throw with empty or valid options; instance isolation. After implementing `capture`, add spy tests on the underlying tracker.

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

  test("'capture' should not throw with an empty object", () => {
    const analytics = new <Name>Analytics();
    expect(() => analytics.capture({} as any)).not.toThrow();
  });

  test("'capture' should not throw with valid options", () => {
    const analytics = new <Name>Analytics();
    expect(() => analytics.capture({ event: "page_view", userId: "u1" } as any)).not.toThrow();
  });

  test("'capture' should return void", () => {
    const analytics = new <Name>Analytics();
    expect(analytics.capture({ event: "click" } as any)).toBeUndefined();
  });

  // Add spy tests on the underlying tracker after implementing capture()

  test("should produce independent instances", () => {
    expect(new <Name>Analytics()).not.toBe(new <Name>Analytics());
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
