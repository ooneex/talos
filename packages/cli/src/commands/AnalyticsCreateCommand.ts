import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/analytics.test.txt";
import template from "../templates/analytics.txt";

@decorator.command()
export class AnalyticsCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "analytics:create";
  }

  public getDescription(): string {
    return "Generate a new analytics class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "Analytics",
        promptMessage: "Enter analytics name",
        suffix: "Analytics",
        template,
        testTemplate,
        dir: "analytics",
        dependency: "@talosjs/analytics",
      },
      options,
    );
  }
}
