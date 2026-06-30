import { container, EContainerScope } from "@talosjs/container";
import type { AuthClassType } from "./types";

export const decorator = {
  auth: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: AuthClassType): void => {
      container.add(target, scope);
    };
  },
};
