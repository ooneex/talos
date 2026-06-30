import { container, EContainerScope } from "@talosjs/container";
import type { CacheClassType } from "./types";

export const decorator = {
  cache: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: CacheClassType): void => {
      container.add(target, scope);
    };
  },
};
