---
name: workflow-create
description: Generate a new workflow class with its test file, then complete the generated code. Use when orchestrating a multi-step business process from @talosjs/workflow — a sequence of conditional, reversible transitions with automatic rollback on failure.
allowed-tools: Bash(talos workflow:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Workflow Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a workflow class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, lint/format, and coding conventions); this skill covers only the workflow-specific parts.

> A workflow orchestrates an ordered list of **transitions**. Generate each step with `workflow:transition:create`, then list them in `getTransitions()`. The base `Workflow.run()` executes the active transitions in order and rolls the executed ones back in reverse when any step fails.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos workflow:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the workflow class name, taken from the process it drives (e.g., "a checkout workflow" → `Checkout`, "process an order" → `OrderProcessing`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Workflow` suffix automatically. The generated `getName()` returns the `kebab-case` of the name.

### 2. Complete the workflow class

Read `modules/<module>/src/workflows/<Name>Workflow.ts`, then:

- Replace the `{{NAME}}WorkflowDataType` alias with the real shape of the data threaded through every transition (the `Data` generic).
- Write a clear `getDescription()`.
- List the transition classes in `getTransitions()`, in the order they should run. Transitions are resolved from `@talosjs/container`, so return the class references only — never instances.

```typescript
import type { WorkflowTransitionClassType } from "@talosjs/workflow";
import { decorator, Workflow } from "@talosjs/workflow";
import { ChargeCardTransition } from "./transitions/ChargeCardTransition";
import { ReserveStockTransition } from "./transitions/ReserveStockTransition";

export type <Name>WorkflowDataType = {
  orderId: string;
};

@decorator.workflow()
export class <Name>Workflow extends Workflow<<Name>WorkflowDataType> {
  public getName = (): string => "<kebab-name>";

  public getDescription = (): string => "Reserve stock, then charge the customer's card.";

  public getTransitions = (): WorkflowTransitionClassType[] => [ReserveStockTransition, ChargeCardTransition];
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/workflows/<Name>Workflow.spec.ts`:

**Coverage:** class identity (`name.endsWith("Workflow")`), `getName` returns the expected `kebab-case` identifier, `getDescription` is non-empty, `getTransitions` returns the expected ordered list, and an end-to-end `run()` that asserts the output for representative data (and that a failing transition rolls back the executed ones in reverse). Resolve the workflow from `container` when its transitions need DI dependencies; mock those dependencies.

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
