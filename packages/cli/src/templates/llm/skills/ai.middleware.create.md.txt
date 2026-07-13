---
name: ai-middleware-create
description: Generate a new AI middleware class with its test file, then complete the generated code. Use when creating a chat middleware that implements IMiddleware from @talosjs/ai to observe or transform the chat lifecycle.
allowed-tools: Bash(talos ai:middleware:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make AI Middleware Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate an AI middleware class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, lint/format, and coding conventions); this skill covers only the AI-middleware-specific parts.

> This is chat middleware for `@talosjs/ai` (the chat lifecycle), not HTTP/socket middleware — for that use `middleware-create`.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos ai:middleware:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the middleware class name, taken from what it does (e.g., "a middleware that audits chat runs" → `Audit`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Middleware` suffix automatically. The generated `getName()` returns the `kebab-case` of the name.

### 2. Complete the middleware class

Read `modules/<module>/src/ai/middlewares/<Name>Middleware.ts`. It is scaffolded with the basic lifecycle event hooks (`onStart`, `onFinish`, `onError`) — fill in the ones you need, drop the ones you don't, and add others as required. All hooks are optional; only `getName()` is required. Other common hooks: `onConfig`/`onBeforeModel`, `onChunk`, `onUsage`, and the terminal `onAbort`. Type the hook arguments with the symbols re-exported from `@talosjs/ai` (`ChatMiddlewareContext`, `FinishInfo`, `ErrorInfo`, `AbortInfo`). Inject required dependencies via the constructor with `@inject`.

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

Read and replace `modules/<module>/tests/ai/middlewares/<Name>Middleware.spec.ts`:

**Coverage:** class identity (`name.endsWith("Middleware")`), `getName` returns the expected `kebab-case` identifier, the lifecycle hooks (`onStart`, `onFinish`, `onError`) are present, and the behavior of each implemented hook (assert on a stubbed `ChatMiddlewareContext`).

### 4. Register the middleware on a chat

Add `<Name>Middleware` to the `getMiddlewares()` array of the chat it should apply to.

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
