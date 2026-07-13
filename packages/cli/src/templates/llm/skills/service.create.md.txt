---
name: service-create
description: Generate a new service class with its test file, then complete the generated code. Use when creating a new business logic service that implements IService from @talosjs/service.
allowed-tools: Bash(talos service:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Service Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a service class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the service-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos service:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the service class name, taken from what it does (e.g., "a service that computes invoices" → `Invoice`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Service` suffix automatically, so omit the suffix.

### 2. Complete the service class

Read `modules/<module>/src/services/<Name>Service.ts`, then implement:

- Define a proper `ServiceDataType` instead of `Record<string, unknown>`
- Implement `execute()` with actual business logic
- Inject required dependencies via the constructor

```typescript
import { type IService, decorator } from "@talosjs/service";

type ServiceDataType = Record<string, unknown>;

@decorator.service()
export class <Name>Service implements IService {
  public async execute(data?: ServiceDataType): Promise<void> {
    // TODO: Implement service logic
  }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/services/<Name>Service.spec.ts`:

**Coverage:** class identity (`name.endsWith("Service")`, is constructor), `execute` exists and returns `Promise` (with and without args), awaitable, instance isolation. Add one test per meaningful behavior after implementing `execute()`.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>Service } from "@/services/<Name>Service";

describe("<Name>Service", () => {
  test("should have class name ending with 'Service'", () => {
    expect(<Name>Service.name.endsWith("Service")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Service).toBe("function");
  });

  test("should have 'execute' method", () => {
    expect(typeof <Name>Service.prototype.execute).toBe("function");
  });

  test("'execute' should return a Promise when called with no arguments", () => {
    const service = new <Name>Service();
    const result = service.execute();
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("'execute' should return a Promise when called with data", () => {
    const service = new <Name>Service();
    const result = service.execute({ key: "value" });
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("'execute' result should be awaitable", async () => {
    const service = new <Name>Service();
    try {
      await service.execute();
    } catch {
      // Expected when dependencies are not injected — still validates the Promise contract
    }
  });

  // Add business logic tests after implementing execute()

  test("should produce independent instances", () => {
    const a = new <Name>Service();
    const b = new <Name>Service();
    expect(a).not.toBe(b);
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
