import { container, EContainerScope } from "@talosjs/container";
import type { QueueClassType } from "./types";

export const decorator = {
  queue: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: QueueClassType): void => {
      container.add(target, scope);
    };
  },
};
