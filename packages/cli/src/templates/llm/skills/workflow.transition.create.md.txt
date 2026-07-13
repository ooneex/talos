---
name: workflow-transition-create
description: Generate a new workflow transition class with its test file, then complete the generated code. Use when adding a single conditional, reversible step that implements ITransition from @talosjs/workflow for use inside a workflow.
allowed-tools: Bash(talos workflow:transition:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Workflow Transition Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a workflow transition class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, lint/format, and coding conventions); this skill covers only the transition-specific parts.

> A transition is one step of a `workflow:create` workflow. Generate the workflow first (or alongside), then list this transition in its `getTransitions()`.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos workflow:transition:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the transition class name, taken from the action it performs (e.g., "charge the card" → `ChargeCard`, "reserve stock" → `ReserveStock`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Transition` suffix automatically. The generated `getName()` returns the `kebab-case` of the name.

### 2. Complete the transition class

Read `modules/<module>/src/workflows/transitions/<Name>Transition.ts`, then implement its members. Use the same `Data` type the workflow threads through its transitions, and type the second generic with the transition's `Output`. Inject required dependencies (clients, repositories) via the constructor with `@inject`.

- `isActive(data, context?)` — guard deciding whether this transition runs; return `false` to skip it.
- `handler(data, context?)` — the work; its return value becomes the transition's `Output`.
- `rollback(data, context?)` — undo `handler`'s effects. The workflow calls it on the executed transitions, in reverse order, when a later step throws.
- `onStart` / `onFinish(data, output, context?)` / `onFail(data, error, context?)` — optional lifecycle hooks; the scaffold leaves them as no-ops, fill in the ones you need.

```typescript
import { inject } from "@talosjs/container";
import type { ITransition } from "@talosjs/workflow";
import { decorator } from "@talosjs/workflow";

export type <Name>TransitionDataType = {
  orderId: string;
};

@decorator.transition()
export class <Name>Transition implements ITransition<<Name>TransitionDataType, string> {
  public getName = (): string => "<kebab-name>";

  public getDescription = (): string => "Charge the customer's card for the order.";

  public isActive = (data: <Name>TransitionDataType): boolean => data.orderId.length > 0;

  public handler = async (data: <Name>TransitionDataType): Promise<string> => {
    // Perform the step and return its output.
    return data.orderId;
  };

  public rollback = async (data: <Name>TransitionDataType): Promise<void> => {
    // Undo handler() — refund the charge, release the reservation, etc.
  };

  public onStart = async (data: <Name>TransitionDataType): Promise<void> => {};

  public onFinish = async (data: <Name>TransitionDataType, output: string): Promise<void> => {};

  public onFail = async (data: <Name>TransitionDataType, error: unknown): Promise<void> => {};
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/workflows/transitions/<Name>Transition.spec.ts`:

**Coverage:** class identity (`name.endsWith("Transition")`), `getName` returns the expected `kebab-case` identifier, `getDescription` is non-empty, `isActive` returns the right boolean for representative data, `handler` returns the expected output (mock external dependencies), `rollback` undoes the effect, and any implemented lifecycle hook. Resolve the transition from `container` when it has DI dependencies.

### 4. Register the transition on a workflow

Add `<Name>Transition` to the `getTransitions()` array of the workflow that should run it, in the correct order.

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
