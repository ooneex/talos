import { container, EContainerScope } from "@talosjs/container";
import type { RepositoryClassType } from "./types";

export const decorator = {
  repository: (scope: EContainerScope = EContainerScope.Singleton) => {
    return <TCriteria>(target: RepositoryClassType<TCriteria>): void => {
      container.add(target, scope);
    };
  },
};
