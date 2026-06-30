import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/ai-middleware.test.txt";
import template from "../templates/ai-middleware.txt";

@decorator.command()
export class AiMiddlewareCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "ai:middleware:create";
  }

  public getDescription(): string {
    return "Generate a new AI middleware class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "AI middleware",
        promptMessage: "Enter middleware name",
        suffix: "Middleware",
        template,
        testTemplate,
        dir: "ai/middlewares",
        dependency: "@talosjs/ai",
        templateData: (name) => ({ KEBAB: toKebabCase(name) }),
      },
      options,
    );
  }
}
