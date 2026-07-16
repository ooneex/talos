---
name: workflow-transition-create
description: Generate a new workflow transition class with its test file, then complete the generated code.
when_to_use: Use when adding a single conditional, reversible step that implements ITransition from @talosjs/workflow for use inside a workflow.
model: sonnet
effort: medium
allowed-tools: Bash(talos workflow:transition:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Workflow Transition Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing.

Generate a workflow transition class and test file, then complete the implementation. Follow the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, lint/format, conventions); this covers only the transition-specific parts.

> A transition is one step of a `workflow:create` workflow. Generate the workflow first (or alongside), then list this transition in its `getTransitions()`.

## Steps

### 1. Infer options, then run the generator

```bash
talos workflow:transition:create --name=<name> --module=<module>
```

- `--name` — transition class name from the action it performs ("charge the card" → `ChargeCard`, "reserve stock" → `ReserveStock`). Any casing; the CLI normalizes to PascalCase and appends the `Transition` suffix. The generated `getName()` returns the `kebab-case` of the name.

### 2. Complete the transition class

Read `modules/<module>/src/workflows/transitions/<Name>Transition.ts`, then implement its members. Use the same `Data` type the workflow threads through its transitions, and type the second generic with the transition's `Output`. Inject dependencies (clients, repositories) via the constructor with `@inject`.

- `isActive(data, context?)` — guard deciding whether this transition runs; return `false` to skip it.
- `handler(data, context?)` — the work; its return value becomes the transition's `Output`.
- `rollback(data, context?)` — undo `handler`'s effects. The workflow calls it on the executed transitions, in reverse order, when a later step throws.
- `onStart` / `onFinish(data, output, context?)` / `onFail(data, error, context?)` — optional lifecycle hooks; scaffolded as no-ops, fill in the ones you need.

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

Read and replace `modules/<module>/tests/workflows/transitions/<Name>Transition.spec.ts`.

**Coverage:** class identity (`name.endsWith("Transition")`); `getName` returns the expected `kebab-case` identifier; `getDescription` is non-empty; `isActive` returns the right boolean for representative data; `handler` returns the expected output (mock external dependencies); `rollback` undoes the effect; any implemented lifecycle hook. Resolve the transition from `container` when it has DI dependencies.

### 4. Register the transition on a workflow

Add `<Name>Transition` to the `getTransitions()` array of the workflow that should run it, in the correct order.

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
