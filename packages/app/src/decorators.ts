import { container, EContainerScope } from "@talosjs/container";
import type { AppEventStartClassType } from "./types";

export const decorator = {
  app: {
    event: {
      start: (scope: EContainerScope = EContainerScope.Singleton) => {
        return (target: AppEventStartClassType): void => {
          container.add(target, scope);
        };
      },
    },
  },
};
