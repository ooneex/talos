import { container } from "@talosjs/container";
import { MIGRATIONS_CONTAINER } from "./container";
import type { IMigration } from "./types";

export const getMigrations = (): IMigration[] => {
  const migrationInstances = MIGRATIONS_CONTAINER.map((MigrationClass) => {
    return container.get(MigrationClass);
  });

  return migrationInstances.sort((a, b) => Number(a.getVersion()) - Number(b.getVersion()));
};
