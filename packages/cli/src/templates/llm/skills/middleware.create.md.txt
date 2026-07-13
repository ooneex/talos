---
name: middleware-create
description: Generate a new middleware class with its test file, then complete the generated code. Use when creating a new HTTP or WebSocket middleware that implements IMiddleware from @talosjs/middleware.
allowed-tools: Bash(talos middleware:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>] [--is-socket=<true|false>]
disallowed-tools: AskUserQuestion
---

# Make Middleware Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a middleware class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the middleware-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos middleware:create --name=<name> --module=<module> --is-socket=<true|false>
```

**Inferring options from the user's request:**

- `--name` — the middleware class name, taken from what it does (e.g., "a middleware that checks auth" → `Auth`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Middleware` suffix automatically, so omit the suffix.
- `--is-socket` — `true` when the user mentions WebSocket/socket/realtime, otherwise `false` (the default). If unspecified, the generator asks interactively.

### 2. Complete the middleware class

Read `modules/<module>/src/middlewares/<Name>Middleware.ts`, then implement:

- Implement `handler()` with actual middleware logic (auth checks, logging, header injection, etc.)
- Inject required dependencies via the constructor

**HTTP middleware:**

```typescript
import type { ContextType } from "@talosjs/controller";
import { decorator, type IMiddleware } from "@talosjs/middleware";

@decorator.middleware()
export class <Name>Middleware implements IMiddleware {
  public async handler(context: ContextType): Promise<ContextType> {
    return context;
  }
}
```

**Socket middleware:**

```typescript
import type { ContextType } from "@talosjs/socket";
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

**Coverage:** class identity (`name.endsWith("Middleware")`, is constructor), `handler` exists, returns a `Promise`, resolves to the same context reference (pass-through), does not replace context with a different object. Add tests for any transformations/auth checks after implementing `handler()`. Instance isolation.

> **Auth/authorization middleware must be able to deny.** The pass-through assertions above only apply to non-gating middleware (logging, header injection). For an auth guard, replace them with tests that assert the handler **rejects/short-circuits** unauthenticated or unauthorized requests (throws or returns a denying context) — a middleware that always passes through is a broken access control.

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

  test("'handler' should resolve to the context object", async () => {
    const middleware = new <Name>Middleware();
    const context = { request: {}, response: { header: () => {} } } as any;
    const result = await middleware.handler(context);
    expect(result).toBe(context);
  });

  test("'handler' should not replace the context with a different object", async () => {
    const middleware = new <Name>Middleware();
    const context = { request: {}, response: { header: () => {} } } as any;
    const returned = await middleware.handler(context);
    expect(returned).toBe(context);
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
