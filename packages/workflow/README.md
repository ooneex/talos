# @talosjs/workflow

Transition-based workflow engine for TypeScript — compose business processes from small, conditional, reversible steps with automatic rollback on failure.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Transition-based** - Break a process into small, focused transitions

✅ **Conditional execution** - Each transition decides whether it runs via `isActive`

✅ **Automatic rollback** - Executed transitions roll back in reverse order when a step fails

✅ **Dependency injection** - Transitions are resolved from `@talosjs/container`

✅ **Decorator registration** - Register workflows and transitions with a single decorator

✅ **Typed exceptions** - Failures surface as a `WorkflowException` carrying context

✅ **Lifecycle events** - React to each step with `onStart`, `onFinish`, and `onFail` hooks

✅ **Async-friendly** - Every transition member may be sync or async

✅ **Type-Safe** - Full TypeScript support with generic `Data` and `Output` types

## Installation

```bash
bun add @talosjs/workflow
```

## Concepts

A **workflow** is an ordered list of **transitions**. When you `run` a workflow:

1. Every transition's `isActive(data, context)` is evaluated to build the list of active transitions.
2. Active transitions run in order. For each one: `onStart` fires, then `handler(data, context)` produces an output, then `onFinish` fires with that output.
3. The output of the **last** executed transition is returned.
4. If a step throws, that transition's `onFail` fires, the transitions executed so far are rolled back in **reverse order**, and a `WorkflowException` is thrown.

A transition implements the `ITransition` interface:

| Member | Purpose |
| --- | --- |
| `getName()` | Unique, human-readable name (used in error messages). |
| `getDescription()` | Short description of what the transition does. |
| `isActive(data, context?)` | Returns whether this transition should run. |
| `handler(data, context?)` | Performs the work and returns the output. |
| `rollback(data, context?)` | Undoes the work if a later transition fails. |
| `onStart(data, context?)` | Fires before the handler runs. |
| `onFinish(data, output, context?)` | Fires after the handler succeeds, with its output. |
| `onFail(data, error, context?)` | Fires when the handler (or a hook) throws, with the error. |

## Usage

### Define transitions

```typescript
import { decorator, type ITransition } from '@talosjs/workflow';

interface OrderData extends Record<string, unknown> {
  orderId: string;
  amount: number;
}

@decorator.transition()
export class ChargePayment implements ITransition<OrderData, string> {
  public getName = () => 'charge-payment';
  public getDescription = () => 'Charges the customer for the order';
  public isActive = (data: OrderData) => data.amount > 0;

  public handler = async (data: OrderData) => {
    const chargeId = await paymentGateway.charge(data.orderId, data.amount);
    return chargeId;
  };

  public rollback = async (data: OrderData) => {
    await paymentGateway.refund(data.orderId);
  };

  public onStart = (data: OrderData) => {
    logger.info(`Charging ${data.amount} for ${data.orderId}`);
  };
  public onFinish = (data: OrderData, chargeId: string) => {
    logger.info(`Charged ${data.orderId} (${chargeId})`);
  };
  public onFail = (data: OrderData, error: unknown) => {
    logger.error(`Charge failed for ${data.orderId}`, error);
  };
}

@decorator.transition()
export class SendReceipt implements ITransition<OrderData, string> {
  public getName = () => 'send-receipt';
  public getDescription = () => 'Emails the receipt to the customer';
  public isActive = () => true;

  public handler = async (data: OrderData) => {
    await mailer.sendReceipt(data.orderId);
    return data.orderId;
  };

  public rollback = () => {};
  public onStart = () => {};
  public onFinish = () => {};
  public onFail = () => {};
}
```

### Define a workflow

```typescript
import {
  decorator,
  Workflow,
  type WorkflowTransitionClassType,
} from '@talosjs/workflow';

@decorator.workflow()
export class CheckoutWorkflow extends Workflow<OrderData, string> {
  public getName = () => 'checkout';
  public getDescription = () => 'Processes an order from payment to receipt';

  public getTransitions = (): WorkflowTransitionClassType[] => [
    ChargePayment,
    SendReceipt,
  ];
}
```

### Run the workflow

```typescript
import { container } from '@talosjs/container';
import { WorkflowException } from '@talosjs/workflow';

const workflow = container.get(CheckoutWorkflow);

try {
  const output = await workflow.run({ orderId: 'ord_123', amount: 4200 });
  console.log(output); // "ord_123" — output of the last executed transition
} catch (error) {
  if (error instanceof WorkflowException) {
    console.error(error.message); // Workflow "checkout" failed at transition "send-receipt".
    console.error(error.data); // { workflow, transition, error }
  }
}
```

### Passing a context

`run` accepts an optional second argument that is forwarded to every transition
member (`isActive`, `handler`, `rollback`, `onStart`, `onFinish`, `onFail`). Use
it for request-scoped values such as the current user or a request id.

```typescript
await workflow.run(
  { orderId: 'ord_123', amount: 4200 },
  { requestId: 'req_1', user: currentUser },
);
```

## Rollback semantics

When a handler throws:

- Only transitions whose handler **completed successfully** are rolled back.
- The transition that threw is **not** rolled back (its work never finished).
- Rollbacks run in **reverse** execution order and are awaited before the
  `WorkflowException` is rethrown.

```text
handler:one → handler:two → handler:failing (throws)
                          ← rollback:two ← rollback:one
```

## Lifecycle events

Each transition exposes three hooks that fire around its `handler`:

- **`onStart(data, context?)`** — runs just before the handler.
- **`onFinish(data, output, context?)`** — runs after the handler resolves, receiving its output.
- **`onFail(data, error, context?)`** — runs when the handler throws, receiving the error, before rollback begins.

The hooks run inside the same guarded step as the handler, so a throw from
`onStart` or `onFinish` is treated like a handler failure: it triggers `onFail`,
rolls back the already-executed transitions, and throws a `WorkflowException`.

```text
onStart → handler → onFinish        (success)
onStart → handler ✗ → onFail        (failure) → rollback → WorkflowException
```

## Error handling

A failed run throws a [`WorkflowException`](./src/WorkflowException.ts) with:

- `message` — e.g. `Workflow "checkout" failed at transition "charge-payment".`
- `key` — `"WORKFLOW_RUN_FAILED"`
- `status` — `500` (Internal Server Error)
- `data` — `{ workflow, transition, error }`, where `error` is the original
  message (non-`Error` throwables are stringified).

## API

### `Workflow<Data, Output>`

Abstract base class. Subclasses implement `getName`, `getDescription`, and
`getTransitions`. Provides `run(data, context?)`.

### `decorator`

- `decorator.workflow(scope?)` — registers a workflow class in the container.
- `decorator.transition(scope?)` — registers a transition class in the container.

Both default to `EContainerScope.Singleton`.

### Types

- `ITransition<Data, Output>` — interface implemented by transitions.
- `IWorkflow<Data, Output>` — interface implemented by `Workflow`.
- `WorkflowTransitionClassType` — constructor type for a transition class.
- `WorkflowClassType` — constructor type for a workflow class.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
