import { container } from "@talosjs/container";
import { COMMANDS_CONTAINER } from "./container";
import type { ICommand } from "./types";

export const getCommand = (name: string): ICommand | null => {
  for (const CommandClass of COMMANDS_CONTAINER) {
    const command = container.get(CommandClass);
    if (command.getName() === name) {
      return command;
    }
  }

  return null;
};
