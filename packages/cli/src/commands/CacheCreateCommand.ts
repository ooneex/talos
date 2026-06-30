import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/cache.test.txt";
import template from "../templates/cache.txt";

@decorator.command()
export class CacheCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "cache:create";
  }

  public getDescription(): string {
    return "Generate a new cache class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "Cache",
        promptMessage: "Enter cache name",
        suffix: "Cache",
        template,
        testTemplate,
        dir: "cache",
        dependency: "@talosjs/cache",
      },
      options,
    );
  }
}
