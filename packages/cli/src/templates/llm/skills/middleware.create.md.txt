---
name: middleware-create
description: Generate a new middleware class with its test file, then complete the generated code.
when_to_use: Use when creating a new HTTP or WebSocket middleware that implements IMiddleware from @talosjs/middleware.
model: sonnet
effort: medium
allowed-tools: Bash(talos middleware:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>] [--is-socket=<true|false>]
---

# Make Middleware Class

> **Run autonomously — do not ask the user questions;** pick the recommended option and proceed. **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` — check both roots before assuming a path is missing.

Generate a middleware class and test file, then complete the implementation. Follow the shared `talos-scaffold` skill workflow (run-from-root, `--name`/`--module` inference, module registration, lint/format, coding conventions); this covers only the middleware-specific parts.

## Steps

### 1. Infer the options, then run the generator

```bash
talos middleware:create --name=<name> --module=<module> --is-socket=<true|false>
```

- `--name` — class name from what it does ("a middleware that checks auth" → `Auth`). Any casing; the CLI normalizes to PascalCase and appends the `Middleware` suffix, so omit it.
- `--is-socket` — `true` when the user mentions WebSocket/socket/realtime, else `false` (default). If unspecified, the generator asks interactively.

### 2. Complete the middleware class

Read `modules/<module>/src/middlewares/<Name>Middleware.ts`, then:

- Implement `handler()` with the middleware logic (auth checks, logging, header injection, etc.)
- Inject required dependencies via the constructor

Import `ContextType` from `@talosjs/controller` (HTTP) or `@talosjs/socket` (socket) — everything else is identical:

```typescript
import type { ContextType } from "@talosjs/controller"; // or "@talosjs/socket"
import { decorator, type IMiddleware } from "@talosjs/middleware";

@decorator.middleware()
export class <Name>Middleware implements IMiddleware {
  public async handler(context: ContextType): Promise<ContextType> {
    return context;
  }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/middlewares/<Name>Middleware.spec.ts`:

**Coverage:** class identity (`name.endsWith("Middleware")`, is constructor), `handler` exists, returns a `Promise`, resolves to the same context reference (pass-through), instance isolation. Add tests for any transformations/auth checks after implementing `handler()`.

> **Auth/authorization middleware must be able to deny.** Pass-through assertions apply only to non-gating middleware (logging, header injection). For an auth guard, replace them with tests asserting the handler **rejects/short-circuits** unauthenticated or unauthorized requests (throws or returns a denying context) — a middleware that always passes through is broken access control.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>Middleware } from "@/middlewares/<Name>Middleware";

describe("<Name>Middleware", () => {
  test("should have class name ending with 'Middleware'", () => {
    expect(<Name>Middleware.name.endsWith("Middleware")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Middleware).toBe("function");
  });

  test("should have 'handler' method", () => {
    expect(typeof <Name>Middleware.prototype.handler).toBe("function");
  });

  test("'handler' should return a Promise", () => {
    const middleware = new <Name>Middleware();
    const context = {} as any;
    const result = middleware.handler(context);
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("'handler' should resolve to the same context object (pass-through)", async () => {
    const middleware = new <Name>Middleware();
    const context = { request: {}, response: { header: () => {} } } as any;
    expect(await middleware.handler(context)).toBe(context);
  });

  // Add behavior tests after implementing handler()

  test("should produce independent instances", () => {
    const a = new <Name>Middleware();
    const b = new <Name>Middleware();
    expect(a).not.toBe(b);
  });
});
```

### 4. Register the middleware

Add `<Name>Middleware` to the `middlewares` array in `src/<PascalModuleName>Module.ts` (see `talos-scaffold` for the `ModuleType` shape).

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.

