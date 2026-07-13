---
name: flag-create
description: Generate a new feature flag class with its test file, then complete the generated code. Use when creating a new feature flag that implements the IFeatureFlag interface from @talosjs/feature-flag.
allowed-tools: Bash(talos flag:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Feature Flag Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a feature flag class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the feature-flag-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos flag:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the feature flag class name, taken from the feature it gates (e.g., "a flag for the new checkout" → `NewCheckout`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `FeatureFlag` suffix automatically, so omit the suffix.

### 2. Complete the feature flag class

Read `modules/<module>/src/feature-flag/<Name>FeatureFlag.ts`, then implement:

- Set a unique, stable key in `getKey()` (kebab-case, pre-filled from the name)
- Describe the flag's purpose in `getDescription()`
- Implement `isEnabled()` with the actual gating logic (env vars, config, rollout rules, injected dependencies)

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

Read and replace `modules/<module>/tests/feature-flag/<Name>FeatureFlag.spec.ts`:

**Coverage:** class identity (`name.endsWith("FeatureFlag")`, is constructor), `getKey` exists and returns a non-empty string, `getDescription` exists and returns a string, `isEnabled` exists and resolves to a boolean, instance isolation.

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

  test("should have 'getKey' method", () => {
    expect(typeof <Name>FeatureFlag.prototype.getKey).toBe("function");
  });

  test("'getKey' should return a non-empty string", () => {
    const flag = new <Name>FeatureFlag();
    const key = flag.getKey();
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  test("should have 'getDescription' method", () => {
    expect(typeof <Name>FeatureFlag.prototype.getDescription).toBe("function");
  });

  test("'getDescription' should return a string", () => {
    const flag = new <Name>FeatureFlag();
    expect(typeof flag.getDescription()).toBe("string");
  });

  test("should have 'isEnabled' method", () => {
    expect(typeof <Name>FeatureFlag.prototype.isEnabled).toBe("function");
  });

  test("'isEnabled' should resolve to a boolean", async () => {
    const flag = new <Name>FeatureFlag();
    expect(typeof (await flag.isEnabled())).toBe("boolean");
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
