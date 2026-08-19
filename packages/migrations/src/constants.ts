import { join } from "node:path";

/**
 * Root of `migration:up`'s per-version run-cache — a workspace-root-relative
 * directory. The CLI's `runModuleScripts` resolves it to a per-module
 * subdirectory (`var/cache/migrations/<module>/`) and passes that to the
 * module's `up`/`down` via `--cache-dir`, which write one JSON file per applied
 * migration version. Namespacing by module keeps two modules'
 * identically-versioned migrations from colliding on the same cache file.
 */
export const MIGRATIONS_CACHE_DIR: string = join("var", "cache", "migrations");
