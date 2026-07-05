import { container } from "@talosjs/container";
import type { ITransition, IWorkflow, WorkflowTransitionClassType } from "./types";
import { WorkflowException } from "./WorkflowException";

export abstract class Workflow<Data extends Record<string, unknown> = Record<string, unknown>, Output = unknown>
  implements IWorkflow<Data, Output>
{
  public abstract getName(): string;

  public abstract getDescription(): string;

  public abstract getTransitions(): WorkflowTransitionClassType[];

  public async run<Context = unknown>(data: Data, context?: Context): Promise<Output> {
    const transitions = this.getTransitions().map((transition) => container.get<ITransition>(transition));

    const activeTransitions: ITransition[] = [];
    for (const transition of transitions) {
      if (await transition.isActive(data, context)) {
        activeTransitions.push(transition);
      }
    }

    const executed: ITransition[] = [];
    let output: Output = undefined as Output;

    for (const transition of activeTransitions) {
      try {
        await transition.onStart(data, context);
        output = (await transition.handler(data, context)) as Output;
        executed.push(transition);
        await transition.onFinish(data, output, context);
      } catch (error) {
        await transition.onFail(data, error, context);
        await this.rollback(executed, data, context);

        throw new WorkflowException(
          `Workflow "${this.getName()}" failed at transition "${transition.getName()}".`,
          "WORKFLOW_RUN_FAILED",
          {
            workflow: this.getName(),
            transition: transition.getName(),
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    return output;
  }

  private async rollback<Context = unknown>(executed: ITransition[], data: Data, context?: Context): Promise<void> {
    for (const transition of [...executed].reverse()) {
      await transition.rollback(data, context);
    }
  }
}
