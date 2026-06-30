import { container, EContainerScope } from "@talosjs/container";
import { COMMANDS_CONTAINER } from "./container";
import type { CommandClassType } from "./types";

export const decorator = {
  command: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (command: CommandClassType): void => {
      container.add(command, scope);
      COMMANDS_CONTAINER.push(command);
    };
  },
};
