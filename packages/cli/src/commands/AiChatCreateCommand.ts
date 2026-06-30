import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/ai-chat.test.txt";
import template from "../templates/ai-chat.txt";

@decorator.command()
export class AiChatCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "ai:chat:create";
  }

  public getDescription(): string {
    return "Generate a new AI chat class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "AI chat",
        promptMessage: "Enter chat name",
        suffix: "Chat",
        template,
        testTemplate,
        dir: "ai/chats",
        dependency: "@talosjs/ai",
      },
      options,
    );
  }
}
