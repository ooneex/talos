import { container, EContainerScope } from "@talosjs/container";
import type { StorageClassType } from "./types";

export const decorator = {
  storage: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: StorageClassType): void => {
      container.add(target, scope);
    };
  },
};
