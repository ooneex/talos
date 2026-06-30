import { container, EContainerScope } from "@talosjs/container";
import type { ServiceClassType } from "./types";

export const decorator = {
  service: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: ServiceClassType): void => {
      container.add(target, scope);
    };
  },
};
