---
name: ai-chat-create
description: Generate a new AI chat class with its test file, then complete the generated code.
when_to_use: Use when creating a chat that extends the Chat base class from @talosjs/ai (model, system prompts, tools, middlewares).
model: sonnet
effort: medium
allowed-tools: Bash(talos ai:chat:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make AI Chat Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing.

Generate an AI chat class and test file, then complete the implementation. Follow the `talos-scaffold` skill for the shared workflow (run-from-root, `--name`/`--module` inference, lint/format, conventions); this covers only AI-chat specifics.

## Steps

### 1. Infer options, then run the generator

```bash
talos ai:chat:create --name=<name> --module=<module>
```

- `--name` — chat class name from its purpose ("a chat that answers support questions" → `Support`). Any casing; the CLI normalizes to PascalCase and appends the `Chat` suffix, so omit it.

**Decide whether tools or middlewares are needed** — read the request; don't generate them by default.

- Tools — when the chat must act or fetch data beyond text generation ("look up an order", "search the docs", "send an email", "query the database"). One tool per distinct capability; else `getTools()` stays empty.
- Middlewares — for cross-cutting behavior on every run ("log each request", "rate-limit", "redact PII", "check authorization"); else `getMiddlewares()` stays empty.

If ambiguous, ask the user rather than guess. For each needed tool/middleware, generate it first with `ai-tool-create` / `ai-middleware-create`, then reference the class in `getTools()` / `getMiddlewares()`.

### 2. Complete the chat class

Read `modules/<module>/src/ai/chats/<Name>Chat.ts`, then implement:

- `getModel()` — the OpenRouter model id in `provider/model` form (e.g. `anthropic/claude-sonnet-4.5`).
- `getSystemPrompts()` — the system prompts that define the chat's behavior.
- `getTools()` — the tool classes the model may call (generate with `ai-tool-create`).
- `getMiddlewares()` — the middleware classes applied to every run (generate with `ai-middleware-create`).

```typescript
import { Chat, decorator } from "@talosjs/ai";
import type { AiMiddlewareClassType, AiToolClassType } from "@talosjs/ai";

@decorator.chat()
export class <Name>Chat extends Chat {
  public getModel = (): string => "anthropic/claude-sonnet-4.5";

  public getSystemPrompts = (): string[] => ["You are a helpful assistant."];

  public getTools = (): AiToolClassType[] => [];

  public getMiddlewares = (): AiMiddlewareClassType[] => [];
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/ai/chats/<Name>Chat.spec.ts`.

**Coverage:** class identity (`name.endsWith("Chat")`); `getModel` returns a non-empty `provider/model` string; `getSystemPrompts`/`getTools`/`getMiddlewares` return arrays; `run` and `stream` exist. After implementing, add assertions for the specific model, prompts, and tools.

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
