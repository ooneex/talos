import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/workflow-transition.test.txt";
import template from "../templates/workflow-transition.txt";

@decorator.command()
export class WorkflowTransitionCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType>
  implements ICommand<T>
{
  public getName(): string {
    return "workflow:transition:create";
  }

  public getDescription(): string {
    return "Generate a new workflow transition class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "Workflow transition",
        promptMessage: "Enter transition name",
        suffix: "Transition",
        template,
        testTemplate,
        dir: "workflows/transitions",
        dependency: "@talosjs/workflow",
        templateData: (name) => ({ KEBAB: toKebabCase(name) }),
      },
      options,
    );
  }
}
