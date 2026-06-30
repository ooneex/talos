import { container, EContainerScope } from "@talosjs/container";
import type { RepositoryClassType } from "./types";

export const decorator = {
  repository: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: RepositoryClassType): void => {
      container.add(target, scope);
    };
  },
};
