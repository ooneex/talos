import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/service.test.txt";
import template from "../templates/service.txt";

@decorator.command()
export class ServiceCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "service:create";
  }

  public getDescription(): string {
    return "Generate a new service class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "Service",
        promptMessage: "Enter service name",
        suffix: "Service",
        template,
        testTemplate,
        dir: "services",
        dependency: "@talosjs/service",
      },
      options,
    );
  }
}
