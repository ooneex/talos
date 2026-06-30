import { container, EContainerScope } from "@talosjs/container";
import type { VectorDatabaseClassType } from "./types";

export const decorator = {
  vectorDatabase: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: VectorDatabaseClassType): void => {
      container.add(target, scope);
    };
  },
};
