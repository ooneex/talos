import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/event.test.txt";
import template from "../templates/event.txt";

type CommandOptionsType = ScaffoldOptionsType & {
  channel?: string;
};

@decorator.command()
export class EventCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "event:create";
  }

  public getDescription(): string {
    return "Generate a new event class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "Event",
        promptMessage: "Enter name",
        suffix: "Event",
        stripSuffixes: ["Event", "PubSub"],
        template,
        testTemplate,
        dir: "events",
        moduleField: "events",
        dependency: "@talosjs/event",
        templateData: (name) => ({ CHANNEL: options.channel ?? toKebabCase(name) }),
      },
      options,
    );
  }
}
