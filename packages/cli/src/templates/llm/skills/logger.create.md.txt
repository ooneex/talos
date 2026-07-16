---
name: logger-create
description: Generate a new logger class with its test file, then complete the generated code.
when_to_use: Use when creating a new logger that implements the ILogger interface from @talosjs/logger.
model: sonnet
effort: low
allowed-tools: Bash(talos logger:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Logger Class

> **Run autonomously — do not ask the user questions.** Pick the recommended option and proceed.

Generate a logger class and test file, then complete the implementation (logger-specific parts only). Follow the shared `talos-scaffold` skill for run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions.

**Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (once extracted into a shared package). Check both roots; every `modules/<module>/...` path applies equally under `packages/<module>/...`.

## Steps

### 1. Infer the options from the request, then run the generator

```bash
talos logger:create --name=<name> --module=<module>
```

- `--name` — logger class name, from what it logs (e.g. "a logger for audit events" → `Audit`). Any casing; the CLI normalizes to PascalCase and appends the `Logger` suffix, so omit it.

### 2. Complete the logger class

Read `modules/<module>/src/loggers/<Name>Logger.ts`, then:

- Implement `init()` to set up the logger (open file handles, configure transports)
- Implement `log`, `debug`, `info`, `success`, `warn`, `error` with real logging logic
- Inject required dependencies via the constructor
- **Redact sensitive data before writing.** Never log credentials, tokens, auth headers, or full request/event payloads. Mask or allowlist fields in `data` (passwords, secrets, PII) inside each method, and never interpolate a raw error/exception body that may embed secrets.

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

Read and replace `modules/<module>/tests/loggers/<Name>Logger.spec.ts`.

**Coverage:** class identity (`name.endsWith("Logger")`, is constructor); `init` exists, returns `Promise`; each log method (`log`, `debug`, `info`, `success`, `warn`, `error`) exists and does not throw with a message string or message + data object; `error` also does not throw with an `IException`-like object; instance isolation.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>Logger } from "@/loggers/<Name>Logger";

const methods = ["log", "debug", "info", "success", "warn"] as const;

describe("<Name>Logger", () => {
  test("class name ends with 'Logger' and is a constructor", () => {
    expect(<Name>Logger.name.endsWith("Logger")).toBe(true);
    expect(typeof <Name>Logger).toBe("function");
  });

  test("'init' exists and returns a Promise", () => {
    const logger = new <Name>Logger();
    expect(typeof logger.init).toBe("function");
    const result = logger.init();
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test.each(methods)("'%s' exists and does not throw with a message or message + data", (method) => {
    const logger = new <Name>Logger();
    expect(typeof logger[method]).toBe("function");
    expect(() => logger[method]("message")).not.toThrow();
    expect(() => logger[method]("message", { key: "value" })).not.toThrow();
  });

  test("'error' does not throw with a string, an IException-like object, or message + data", () => {
    const logger = new <Name>Logger();
    expect(typeof logger.error).toBe("function");
    expect(() => logger.error("error message")).not.toThrow();
    expect(() => logger.error({ message: "boom", stack: "" } as any)).not.toThrow();
    expect(() => logger.error("error message", { code: 500 })).not.toThrow();
  });

  test("should produce independent instances", () => {
    expect(new <Name>Logger()).not.toBe(new <Name>Logger());
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
