import { container } from "@talosjs/container";
import { MIGRATIONS_CONTAINER } from "./container";
import type { IMigration, MigrationClassType } from "./types";

/**
 * Every registered migration, ordered by version and shifted so a migration
 * always comes after the ones it declares in `getDependencies()`.
 *
 * Dependencies declare *ordering*, not extra work: a dependency is itself a
 * registered migration that the runner applies exactly once. Versions are
 * timestamps and you can only depend on a migration that already exists, so
 * ascending version already places a dependency first — the pass below makes
 * that guarantee explicit rather than implied.
 *
 * A `getDependencies()` that resolves asynchronously keeps the version order
 * alone, so callers still get a plain array instead of a promise.
 */
export const getMigrations = (): IMigration[] => {
  const instanceByClass = new Map<MigrationClassType, IMigration>();

  for (const MigrationClass of MIGRATIONS_CONTAINER) {
    instanceByClass.set(MigrationClass, container.get(MigrationClass));
  }

  const byVersion = [...instanceByClass.values()].sort((a, b) => Number(a.getVersion()) - Number(b.getVersion()));

  const ordered: IMigration[] = [];
  const placed = new Set<IMigration>();
  const placing = new Set<IMigration>();

  const place = (migration: IMigration): void => {
    // `placing` also breaks a dependency cycle: the migration already being
    // placed keeps its version position instead of recursing forever.
    if (placed.has(migration) || placing.has(migration)) {
      return;
    }

    placing.add(migration);

    const dependencies = migration.getDependencies();

    if (Array.isArray(dependencies)) {
      for (const dependency of dependencies) {
        const dependencyMigration = instanceByClass.get(dependency);

        if (dependencyMigration) {
          place(dependencyMigration);
        }
      }
    }

    placing.delete(migration);
    placed.add(migration);
    ordered.push(migration);
  };

  for (const migration of byVersion) {
    place(migration);
  }

  return ordered;
};
