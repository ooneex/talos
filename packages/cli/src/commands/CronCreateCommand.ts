import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/cron.test.txt";
import template from "../templates/cron.txt";

@decorator.command()
export class CronCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "cron:create";
  }

  public getDescription(): string {
    return "Generate a new cron class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "Cron",
        promptMessage: "Enter cron name",
        suffix: "Cron",
        template,
        testTemplate,
        dir: "crons",
        moduleField: "cronJobs",
        dependency: "@talosjs/cron",
      },
      options,
    );
  }
}
