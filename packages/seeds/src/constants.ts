import { join } from "node:path";

/**
 * Root of `seed:run`'s per-seed run-cache — a workspace-root-relative directory.
 * The CLI's `runModuleScripts` resolves it to a per-module subdirectory
 * (`var/cache/seeds/<module>/`) and passes that to the module's `run` via
 * `--cache-dir`, which writes one JSON file per seed that has run. Namespacing
 * by module keeps two modules' identically-named seeds from colliding on the
 * same cache file.
 */
export const SEEDS_CACHE_DIR: string = join("var", "cache", "seeds");
