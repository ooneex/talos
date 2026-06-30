import { container, EContainerScope } from "@talosjs/container";
import type { EventClassType } from "./types";

export const decorator = {
  event: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: EventClassType): void => {
      container.add(target, scope);
    };
  },
};
