import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { toSnakeCase } from "@talosjs/utils/toSnakeCase";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/ai-tool.test.txt";
import template from "../templates/ai-tool.txt";

@decorator.command()
export class AiToolCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "ai:tool:create";
  }

  public getDescription(): string {
    return "Generate a new AI tool class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "AI tool",
        promptMessage: "Enter tool name",
        suffix: "Tool",
        template,
        testTemplate,
        dir: "ai/tools",
        dependency: "@talosjs/ai",
        templateData: (name) => ({ SNAKE: toSnakeCase(name) }),
      },
      options,
    );
  }
}
