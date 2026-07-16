---
name: ai-tool-create
description: Generate a new AI tool class with its test file, then complete the generated code.
when_to_use: Use when creating a function-calling tool that implements ITool from @talosjs/ai for use by a chat.
model: sonnet
effort: medium
allowed-tools: Bash(talos ai:tool:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make AI Tool Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing.

Generate an AI tool class and test file, then complete the implementation. Follow the `talos-scaffold` skill for the shared workflow (run-from-root, `--name`/`--module` inference, lint/format, conventions); this covers only AI-tool specifics.

## Steps

### 1. Infer options, then run the generator

```bash
talos ai:tool:create --name=<name> --module=<module>
```

- `--name` — tool class name from what it does ("a tool that searches the web" → `WebSearch`). Any casing; the CLI normalizes to PascalCase and appends the `Tool` suffix. The generated `getName()` returns the `snake_case` of the name (`web_search`) — the identifier the model uses to call the tool.

### 2. Complete the tool class

Read `modules/<module>/src/ai/tools/<Name>Tool.ts`, then implement:

- Refine the input type and `getInputSchema()` to match the arguments the model must supply (use `@talosjs/validation`'s `Assert`).
- Write a clear `getDescription()` — the model relies on it to decide when to call the tool.
- Implement `handler()` with the real work. Inject dependencies (clients, env) via the constructor with `@inject`.
- **Guard side-effecting tools.** The input schema validates argument *shape*, not *authority*. For any handler that mutates state or reaches sensitive data (send email, delete/update records, spend money): enforce the requesting user's authorization inside the handler, apply least privilege to injected clients, and gate destructive actions behind confirmation — a prompt-injected model can call the tool with attacker-chosen arguments (OWASP LLM excessive agency / confused deputy).

```typescript
import { inject } from "@talosjs/container";
import { decorator } from "@talosjs/ai";
import type { ITool } from "@talosjs/ai";
import { Assert, type AssertType } from "@talosjs/validation";

export type <Name>ToolInputType = {
  query: string;
};

@decorator.tool()
export class <Name>Tool implements ITool<<Name>ToolInputType, Promise<unknown>> {
  public getName = (): string => "<snake_name>";

  public getDescription = (): string => "Describe precisely what this tool does and when to use it.";

  public getInputSchema = (): AssertType =>
    Assert({
      query: "string > 0",
    });

  public handler = async (param: <Name>ToolInputType): Promise<unknown> => {
    const { query } = param;

    return query;
  };
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/ai/tools/<Name>Tool.spec.ts`.

**Coverage:** class identity (`name.endsWith("Tool")`); `getName` returns the expected `snake_case` identifier; `getDescription` non-empty; `getInputSchema` accepts good input, rejects bad; `handler` returns the expected result for representative arguments (mock external dependencies).

### 4. Register the tool on a chat

Add `<Name>Tool` to the `getTools()` array of the chat that should call it.

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
