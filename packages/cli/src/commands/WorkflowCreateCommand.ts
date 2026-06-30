import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/workflow.test.txt";
import template from "../templates/workflow.txt";

@decorator.command()
export class WorkflowCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "workflow:create";
  }

  public getDescription(): string {
    return "Generate a new workflow class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "Workflow",
        promptMessage: "Enter workflow name",
        suffix: "Workflow",
        template,
        testTemplate,
        dir: "workflows",
        dependency: "@talosjs/workflow",
        templateData: (name) => ({ KEBAB: toKebabCase(name) }),
      },
      options,
    );
  }
}
