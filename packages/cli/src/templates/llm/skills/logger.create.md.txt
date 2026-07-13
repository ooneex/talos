---
name: logger-create
description: Generate a new logger class with its test file, then complete the generated code. Use when creating a new logger that implements the ILogger interface from @talosjs/logger.
allowed-tools: Bash(talos logger:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Logger Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a logger class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the logger-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos logger:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the logger class name, taken from what it logs (e.g., "a logger for audit events" → `Audit`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Logger` suffix automatically, so omit the suffix.

### 2. Complete the logger class

Read `modules/<module>/src/loggers/<Name>Logger.ts`, then implement:

- Implement `init()` to set up the logger (open file handles, configure transports)
- Implement `log`, `debug`, `info`, `success`, `warn`, and `error` with actual logging logic
- **Redact sensitive data before writing.** Never log credentials, tokens, auth headers, or full request/event payloads. Mask or allowlist fields in `data` (passwords, secrets, PII) inside each method, and never interpolate a raw error/exception body that may embed secrets.
- Inject required dependencies via the constructor

```typescript
import type { IException } from "@talosjs/exception";
import { type ILogger, decorator } from "@talosjs/logger";
import type { ScalarType } from "@talosjs/types";

@decorator.logger()
export class <Name>Logger implements ILogger {
  public async init(): Promise<void> {}
  public log(message: string, data?: Record<string, ScalarType>): void {}
  public debug(message: string, data?: Record<string, ScalarType>): void {}
  public info(message: string, data?: Record<string, ScalarType>): void {}
  public success(message: string, data?: Record<string, ScalarType>): void {}
  public warn(message: string, data?: Record<string, ScalarType>): void {}
  public error(message: string | IException, data?: Record<string, ScalarType>): void {}
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/loggers/<Name>Logger.spec.ts`:

**Coverage:** class identity (`name.endsWith("Logger")`, is constructor), `init` exists and returns `Promise`, each log method (`log`, `debug`, `info`, `success`, `warn`, `error`) exists, does not throw with a message string, does not throw with message + data object, `error` does not throw with an `IException`-like object, instance isolation.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>Logger } from "@/loggers/<Name>Logger";

describe("<Name>Logger", () => {
  test("should have class name ending with 'Logger'", () => {
    expect(<Name>Logger.name.endsWith("Logger")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Logger).toBe("function");
  });

  test("should have 'init' method", () => {
    expect(typeof <Name>Logger.prototype.init).toBe("function");
  });

  test("'init' should return a Promise", () => {
    const logger = new <Name>Logger();
    const result = logger.init();
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("should have 'log' method", () => {
    expect(typeof <Name>Logger.prototype.log).toBe("function");
  });

  test("'log' should not throw when called with a message", () => {
    const logger = new <Name>Logger();
    expect(() => logger.log("test message")).not.toThrow();
  });

  test("'log' should not throw when called with a message and data", () => {
    const logger = new <Name>Logger();
    expect(() => logger.log("test message", { key: "value" })).not.toThrow();
  });

  test("should have 'debug' method", () => {
    expect(typeof <Name>Logger.prototype.debug).toBe("function");
  });

  test("'debug' should not throw when called with a message", () => {
    const logger = new <Name>Logger();
    expect(() => logger.debug("debug message")).not.toThrow();
  });

  test("should have 'info' method", () => {
    expect(typeof <Name>Logger.prototype.info).toBe("function");
  });

  test("'info' should not throw when called with a message", () => {
    const logger = new <Name>Logger();
    expect(() => logger.info("info message")).not.toThrow();
  });

  test("should have 'success' method", () => {
    expect(typeof <Name>Logger.prototype.success).toBe("function");
  });

  test("'success' should not throw when called with a message", () => {
    const logger = new <Name>Logger();
    expect(() => logger.success("success message")).not.toThrow();
  });

  test("should have 'warn' method", () => {
    expect(typeof <Name>Logger.prototype.warn).toBe("function");
  });

  test("'warn' should not throw when called with a message", () => {
    const logger = new <Name>Logger();
    expect(() => logger.warn("warn message")).not.toThrow();
  });

  test("should have 'error' method", () => {
    expect(typeof <Name>Logger.prototype.error).toBe("function");
  });

  test("'error' should not throw when called with a string message", () => {
    const logger = new <Name>Logger();
    expect(() => logger.error("error message")).not.toThrow();
  });

  test("'error' should not throw when called with an Error-like object", () => {
    const logger = new <Name>Logger();
    const err = { message: "Something went wrong", stack: "" } as any;
    expect(() => logger.error(err)).not.toThrow();
  });

  test("'error' should not throw when called with a message and data", () => {
    const logger = new <Name>Logger();
    expect(() => logger.error("error message", { code: 500 })).not.toThrow();
  });

  test("should produce independent instances", () => {
    const a = new <Name>Logger();
    const b = new <Name>Logger();
    expect(a).not.toBe(b);
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
