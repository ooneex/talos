import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/feature-flag.test.txt";
import template from "../templates/feature-flag.txt";

@decorator.command()
export class FeatureFlagCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "flag:create";
  }

  public getDescription(): string {
    return "Generate a new feature flag class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "Feature flag",
        promptMessage: "Enter name",
        suffix: "FeatureFlag",
        template,
        testTemplate,
        dir: "flags",
        testsDir: "feature-flag",
        dependency: "@talosjs/feature-flag",
        templateData: (name) => ({ KEY: toKebabCase(name) }),
      },
      options,
    );
  }
}
