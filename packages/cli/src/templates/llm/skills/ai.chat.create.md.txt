---
name: ai-chat-create
description: Generate a new AI chat class with its test file, then complete the generated code. Use when creating a chat that extends the Chat base class from @talosjs/ai (model, system prompts, tools, middlewares).
allowed-tools: Bash(talos ai:chat:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make AI Chat Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate an AI chat class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, lint/format, and coding conventions); this skill covers only the AI-chat-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos ai:chat:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the chat class name, taken from its purpose (e.g., "a chat that answers support questions" → `Support`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Chat` suffix automatically, so omit the suffix.

**Inferring whether tools or middlewares are needed:**

Read the user's request to decide whether the chat needs tools, middlewares, or neither — do not generate them by default.

- Tools — needed when the chat must take actions or fetch data beyond plain text generation (e.g. "look up an order", "search the docs", "send an email", "query the database"). Each distinct capability is one tool. If none of these apply, the chat needs no tools and `getTools()` stays empty.
- Middlewares — needed when the request implies cross-cutting behavior applied to every run (e.g. "log each request", "rate-limit", "redact PII", "check the user is authorized"). If nothing like this is mentioned, the chat needs no middlewares and `getMiddlewares()` stays empty.

When the request is ambiguous about either, ask the user instead of guessing. For each tool or middleware you decide is needed, generate it first with the `ai-tool-create` / `ai-middleware-create` skill, then reference the generated class in `getTools()` / `getMiddlewares()`.

### 2. Complete the chat class

Read `modules/<module>/src/ai/chats/<Name>Chat.ts`, then implement:

- Set `getModel()` to the OpenRouter model id in `provider/model` form (e.g. `anthropic/claude-sonnet-4.5`).
- Add the system prompts that define the chat's behavior in `getSystemPrompts()`.
- List the tool classes the model may call in `getTools()` (generate them with `ai-tool-create`).
- List the middleware classes applied to every run in `getMiddlewares()` (generate them with `ai-middleware-create`).

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

Read and replace `modules/<module>/tests/ai/chats/<Name>Chat.spec.ts`:

**Coverage:** class identity (`name.endsWith("Chat")`), `getModel` returns a non-empty `provider/model` string, `getSystemPrompts`/`getTools`/`getMiddlewares` return arrays, `run` and `stream` exist. Add assertions for the specific model, prompts, and tools after implementing the class.

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
