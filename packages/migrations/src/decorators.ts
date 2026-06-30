import { container, EContainerScope } from "@talosjs/container";
import { MIGRATIONS_CONTAINER } from "./container";
import type { MigrationClassType } from "./types";

export const decorator = {
  migration: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: MigrationClassType): void => {
      container.add(target, scope);
      MIGRATIONS_CONTAINER.push(target);
    };
  },
};
