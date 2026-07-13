---
name: ai-tool-create
description: Generate a new AI tool class with its test file, then complete the generated code. Use when creating a function-calling tool that implements ITool from @talosjs/ai for use by a chat.
allowed-tools: Bash(talos ai:tool:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make AI Tool Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate an AI tool class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, lint/format, and coding conventions); this skill covers only the AI-tool-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos ai:tool:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the tool class name, taken from what it does (e.g., "a tool that searches the web" → `WebSearch`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Tool` suffix automatically. The generated `getName()` returns the `snake_case` of the name (`web_search`) — the identifier the model uses to call the tool.

### 2. Complete the tool class

Read `modules/<module>/src/ai/tools/<Name>Tool.ts`, then implement:

- Refine the input type and `getInputSchema()` to match the arguments the model must supply (use `@talosjs/validation`'s `Assert`).
- Write a clear `getDescription()` — the model relies on it to decide when to call the tool.
- Implement `handler()` with the real work. Inject required dependencies (clients, env) via the constructor with `@inject`.
- **Guard side-effecting tools.** The input schema validates argument *shape*, not *authority*. For any handler that mutates state or reaches sensitive data (send email, delete/update records, spend money), enforce the requesting user's authorization inside the handler, apply least privilege to injected clients, and gate destructive actions behind confirmation — a prompt-injected model can call the tool with attacker-chosen arguments (OWASP LLM excessive agency / confused deputy).

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

Read and replace `modules/<module>/tests/ai/tools/<Name>Tool.spec.ts`:

**Coverage:** class identity (`name.endsWith("Tool")`), `getName` returns the expected `snake_case` identifier, `getDescription` is non-empty, `getInputSchema` validates good input and rejects bad input, `handler` returns the expected result for representative arguments (mock external dependencies).

### 4. Register the tool on a chat

Add `<Name>Tool` to the `getTools()` array of the chat that should be able to call it.

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
