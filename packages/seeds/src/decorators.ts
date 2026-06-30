import { container, EContainerScope } from "@talosjs/container";
import { SEEDS_CONTAINER } from "./container";
import type { SeedClassType } from "./types";

export const decorator = {
  seed: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: SeedClassType): void => {
      container.add(target, scope);
      SEEDS_CONTAINER.push(target);
    };
  },
};
