import { container, EContainerScope } from "@talosjs/container";
import type { AppEventStartClassType, AppEventStopClassType } from "./types";

export const decorator = {
  app: {
    event: {
      start: (scope: EContainerScope = EContainerScope.Singleton) => {
        return (target: AppEventStartClassType): void => {
          container.add(target, scope);
        };
      },
      stop: (scope: EContainerScope = EContainerScope.Singleton) => {
        return (target: AppEventStopClassType): void => {
          container.add(target, scope);
        };
      },
    },
  },
};
