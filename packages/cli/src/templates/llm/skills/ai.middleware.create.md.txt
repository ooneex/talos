---
name: ai-middleware-create
description: Generate a new AI middleware class with its test file, then complete the generated code.
when_to_use: Use when creating a chat middleware that implements IMiddleware from @talosjs/ai to observe or transform the chat lifecycle.
model: sonnet
effort: low
allowed-tools: Bash(talos ai:middleware:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make AI Middleware Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing.

Generate an AI middleware class and test file, then complete the implementation. Follow the `talos-scaffold` skill for the shared workflow (run-from-root, `--name`/`--module` inference, lint/format, conventions); this covers only AI-middleware specifics.

> This is chat middleware for `@talosjs/ai` (the chat lifecycle), not HTTP/socket middleware — for that use `middleware-create`.

## Steps

### 1. Infer options, then run the generator

```bash
talos ai:middleware:create --name=<name> --module=<module>
```

- `--name` — middleware class name from what it does ("a middleware that audits chat runs" → `Audit`). Any casing; the CLI normalizes to PascalCase and appends the `Middleware` suffix. The generated `getName()` returns the `kebab-case` of the name.

### 2. Complete the middleware class

Read `modules/<module>/src/ai/middlewares/<Name>Middleware.ts`. It's scaffolded with basic lifecycle hooks (`onStart`, `onFinish`, `onError`) — fill in what you need, drop the rest, add others as required. All hooks are optional; only `getName()` is required. Other common hooks: `onConfig`/`onBeforeModel`, `onChunk`, `onUsage`, and the terminal `onAbort`. Type hook arguments with the symbols re-exported from `@talosjs/ai` (`ChatMiddlewareContext`, `FinishInfo`, `ErrorInfo`, `AbortInfo`). Inject dependencies via the constructor with `@inject`.

```typescript
import type { ChatMiddlewareContext, ErrorInfo, FinishInfo, IMiddleware } from "@talosjs/ai";
import { decorator } from "@talosjs/ai";

@decorator.middleware()
export class <Name>Middleware implements IMiddleware {
  /** Lifecycle events recorded during the chat run. Replace with your own logger or metrics sink. */
  public readonly events: string[] = [];

  public getName = (): string => "<kebab-name>";

  public onStart = (ctx: ChatMiddlewareContext): void => {
    // Runs once when the chat run starts.
    this.events.push(`start: ${ctx.requestId} on ${ctx.model}`);
  };

  public onFinish = (ctx: ChatMiddlewareContext, info: FinishInfo): void => {
    // Runs once when the chat run completes successfully.
    this.events.push(`finish: ${ctx.requestId} in ${info.duration}ms`);
  };

  public onError = (ctx: ChatMiddlewareContext, info: ErrorInfo): void => {
    // Runs once when the chat run fails with an unhandled error.
    // Log structured, non-sensitive error metadata — a raw error body can embed
    // provider keys or user PII. Prefer name/code over the full message/stack.
    const errorName = info.error instanceof Error ? info.error.name : "UnknownError";
    this.events.push(`error: ${ctx.requestId} after ${info.duration}ms (${errorName})`);
  };
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/ai/middlewares/<Name>Middleware.spec.ts`.

**Coverage:** class identity (`name.endsWith("Middleware")`); `getName` returns the expected `kebab-case` identifier; lifecycle hooks (`onStart`, `onFinish`, `onError`) present; behavior of each implemented hook (assert on a stubbed `ChatMiddlewareContext`).

### 4. Register the middleware on a chat

Add `<Name>Middleware` to the `getMiddlewares()` array of the chat it applies to.

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
