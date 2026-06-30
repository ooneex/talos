import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { askConfirm } from "../prompts/askConfirm";
import { askName } from "../prompts/askName";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import socketTemplate from "../templates/middleware.socket.txt";
import testTemplate from "../templates/middleware.test.txt";
import template from "../templates/middleware.txt";

type CommandOptionsType = ScaffoldOptionsType & {
  isSocket?: boolean;
};

@decorator.command()
export class MiddlewareCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "middleware:create";
  }

  public getDescription(): string {
    return "Generate a new middleware class";
  }

  public async run(options: T): Promise<void> {
    let { name, isSocket } = options;

    if (!name) {
      name = await askName({ message: "Enter middleware name" });
    }

    if (isSocket === undefined) {
      isSocket = await askConfirm({ message: "Is this a socket middleware?" });
    }

    await scaffoldResource(
      {
        label: "Middleware",
        promptMessage: "Enter middleware name",
        suffix: "Middleware",
        template: isSocket ? socketTemplate : template,
        testTemplate,
        dir: "middlewares",
        moduleField: "middlewares",
        dependency: "@talosjs/middleware",
      },
      { ...options, name },
    );
  }
}
