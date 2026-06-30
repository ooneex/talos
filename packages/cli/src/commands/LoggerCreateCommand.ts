import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/logger.test.txt";
import template from "../templates/logger.txt";

@decorator.command()
export class LoggerCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "logger:create";
  }

  public getDescription(): string {
    return "Generate a new logger class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "Logger",
        promptMessage: "Enter logger name",
        suffix: "Logger",
        template,
        testTemplate,
        dir: "loggers",
        dependency: "@talosjs/logger",
      },
      options,
    );
  }
}
