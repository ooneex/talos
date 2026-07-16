---
name: flag-create
description: Generate a new feature flag class with its test file, then complete the generated code.
when_to_use: Use when creating a new feature flag that implements the IFeatureFlag interface from @talosjs/feature-flag.
model: sonnet
effort: low
allowed-tools: Bash(talos flag:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Feature Flag Class

> **Run autonomously — do not ask the user questions.** Pick the recommended option and proceed.

Generate a feature flag class and test file, then complete the implementation (feature-flag-specific parts only). Follow the shared `talos-scaffold` skill for run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions.

- **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (once extracted into a shared package). Check both roots before assuming a path is missing.

## Steps

### 1. Infer the options from the request, then run the generator

```bash
talos flag:create --name=<name> --module=<module>
```

- `--name` — feature flag class name, from the feature it gates (e.g. "a flag for the new checkout" → `NewCheckout`). Any casing; the CLI normalizes to PascalCase and appends the `FeatureFlag` suffix, so omit it.

### 2. Complete the feature flag class

Read `modules/<module>/src/feature-flag/<Name>FeatureFlag.ts`, then:

- Set a unique, stable key in `getKey()` (kebab-case, pre-filled from the name)
- Describe the flag's purpose in `getDescription()`
- Implement `isEnabled()` with real gating logic (env vars, config, rollout rules, injected dependencies)

```typescript
import { inject } from "@talosjs/container";
import { decorator, type IFeatureFlag } from "@talosjs/feature-flag";

@decorator.featureFlag()
export class <Name>FeatureFlag implements IFeatureFlag {
  public getKey(): string {
    return "<kebab-name>";
  }

  public getDescription(): string {
    return "Describe what this flag controls";
  }

  public async isEnabled(): Promise<boolean> {
    return false;
  }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/feature-flag/<Name>FeatureFlag.spec.ts`.

**Coverage:** class identity (`name.endsWith("FeatureFlag")`, is constructor); `getKey` exists, returns non-empty string; `getDescription` exists, returns a string; `isEnabled` exists, resolves to a boolean; instance isolation.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>FeatureFlag } from "@/feature-flag/<Name>FeatureFlag";

describe("<Name>FeatureFlag", () => {
  test("should have class name ending with 'FeatureFlag'", () => {
    expect(<Name>FeatureFlag.name.endsWith("FeatureFlag")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>FeatureFlag).toBe("function");
  });

  test("'getKey' should exist and return a non-empty string", () => {
    expect(typeof <Name>FeatureFlag.prototype.getKey).toBe("function");
    const key = new <Name>FeatureFlag().getKey();
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  test("'getDescription' should exist and return a string", () => {
    expect(typeof <Name>FeatureFlag.prototype.getDescription).toBe("function");
    expect(typeof new <Name>FeatureFlag().getDescription()).toBe("string");
  });

  test("'isEnabled' should exist and resolve to a boolean", async () => {
    expect(typeof <Name>FeatureFlag.prototype.isEnabled).toBe("function");
    expect(typeof (await new <Name>FeatureFlag().isEnabled())).toBe("boolean");
  });

  test("should produce independent instances", () => {
    const a = new <Name>FeatureFlag();
    const b = new <Name>FeatureFlag();
    expect(a).not.toBe(b);
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
