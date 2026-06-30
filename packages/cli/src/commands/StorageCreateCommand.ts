import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { toSnakeCase } from "@talosjs/utils/toSnakeCase";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/storage.test.txt";
import template from "../templates/storage.txt";

@decorator.command()
export class StorageCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "storage:create";
  }

  public getDescription(): string {
    return "Generate a new storage class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "Storage",
        promptMessage: "Enter storage name",
        suffix: "Storage",
        template,
        testTemplate,
        dir: "storage",
        dependency: "@talosjs/storage",
        templateData: (name) => ({ NAME_UPPER: toSnakeCase(name).toUpperCase() }),
      },
      options,
    );
  }
}
