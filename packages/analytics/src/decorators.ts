import { container, EContainerScope } from "@talosjs/container";
import type { AnalyticsClassType } from "./types";

export const decorator = {
  analytics: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: AnalyticsClassType): void => {
      container.add(target, scope);
    };
  },
};
