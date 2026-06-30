export interface ITransition<
  Data extends Record<string, unknown> = Record<string, unknown>,
  Output = unknown,
> {
  getName: () => string;
  getDescription: () => string;
  isActive: <Context = unknown>(
    data: Data,
    context?: Context,
  ) => Promise<boolean> | boolean;
  handler: <Context = unknown>(
    data: Data,
    context?: Context,
  ) => Promise<Output> | Output;
  rollback: <Context = unknown>(
    data: Data,
    context?: Context,
  ) => Promise<void> | void;
  onStart: <Context = unknown>(
    data: Data,
    context?: Context,
  ) => Promise<void> | void;
  onFinish: <Context = unknown>(
    data: Data,
    output: Output,
    context?: Context,
  ) => Promise<void> | void;
  onFail: <Context = unknown>(
    data: Data,
    error: unknown,
    context?: Context,
  ) => Promise<void> | void;
}

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type WorkflowTransitionClassType = new (...args: any[]) => ITransition;

export interface IWorkflow<
  Data extends Record<string, unknown> = Record<string, unknown>,
  Output = unknown,
> {
  getName: () => string;
  getDescription: () => string;
  getTransitions: () => WorkflowTransitionClassType[];
  run: <Context = unknown>(
    data: Data,
    context?: Context,
  ) => Promise<Output> | Output;
}

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type WorkflowClassType = new (...args: any[]) => IWorkflow;
