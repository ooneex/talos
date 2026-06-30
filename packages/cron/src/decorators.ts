import { container, EContainerScope } from "@talosjs/container";
import type { CronClassType } from "./types";

export const decorator = {
  cron: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: CronClassType): void => {
      container.add(target, scope);
    };
  },
};
