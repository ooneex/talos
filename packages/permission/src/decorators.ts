import { container, EContainerScope } from "@talosjs/container";
import type { PermissionClassType } from "./types";

export const decorator = {
  permission: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: PermissionClassType): void => {
      container.add(target, scope);
    };
  },
};
