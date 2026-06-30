import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/queue.test.txt";
import template from "../templates/queue.txt";

@decorator.command()
export class QueueCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "queue:create";
  }

  public getDescription(): string {
    return "Generate a new queue class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "Queue",
        promptMessage: "Enter queue name",
        suffix: "Queue",
        template,
        testTemplate,
        dir: "queues",
        dependency: "@talosjs/queue",
      },
      options,
    );
  }
}
