import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/permission.test.txt";
import template from "../templates/permission.txt";

@decorator.command()
export class PermissionCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "permission:create";
  }

  public getDescription(): string {
    return "Generate a new permission class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "Permission",
        promptMessage: "Enter permission name",
        suffix: "Permission",
        template,
        testTemplate,
        dir: "permissions",
        dependency: "@talosjs/permission",
      },
      options,
    );
  }
}
