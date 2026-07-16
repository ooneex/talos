---
name: service-create
description: Generate a new service class with its test file, then complete the generated code.
when_to_use: Use when creating a new business logic service that implements IService from @talosjs/service.
model: sonnet
effort: medium
allowed-tools: Bash(talos service:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Service Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

Generate a service class and test file, then complete the implementation. Follow the `talos-scaffold` skill workflow (run-from-root, `--name`/`--module` inference, module registration, lint/format, conventions); this covers only the service-specific parts.

- **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing.

## Steps

### 1. Infer the options from the request, then run the generator

```bash
talos service:create --name=<name> --module=<module>
```

- `--name` — service class name, from what it does ("a service that computes invoices" → `Invoice`). Any casing; the CLI normalizes to PascalCase and appends the `Service` suffix, so omit the suffix.

### 2. Complete the service class

Read `modules/<module>/src/services/<Name>Service.ts`, then:

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

  test("'execute' should return a Promise with and without args", () => {
    const service = new <Name>Service();
    for (const result of [service.execute(), service.execute({ key: "value" })]) {
      expect(result).toBeInstanceOf(Promise);
      result.catch(() => {});
    }
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
