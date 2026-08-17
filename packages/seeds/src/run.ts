import { parseArgs } from "node:util";
import { container } from "@talosjs/container";
import type { IException } from "@talosjs/exception";
import { getSeeds } from "./getSeeds";
import { COLORS, colorize, formatDuration, runLogger, SYMBOLS } from "./runLogger";
import { computeSeedHash, isSeedCached, seedCacheDir, writeSeedCache } from "./seedCache";
import type { ISeed } from "./types";

type SeedRunOptionsType = {
  drop?: boolean;
  noCache?: boolean;
  cacheDir?: string | undefined;
};

const runSeed = async (seed: ISeed): Promise<void> => {
  const data = [];

  const dependencies = await seed.getDependencies();

  // talos-ignore perf.await-in-loop: dependencies seed in declaration order — each one may rely on the data the last wrote
  for (const dependency of dependencies) {
    const dep = container.get(dependency);
    data.push(await runSeed(dep));
  }

  await seed.run(data);
};

// Best-effort close of the registered database connection. Never throws — a
// module without a `database` constant simply has nothing to close.
const closeDatabase = async (): Promise<void> => {
  try {
    const database = container.getConstant<{ close: () => Promise<void> }>("database");
    if (database) {
      await database.close();
    }
  } catch {
    // No database constant registered — nothing to close
  }
};

const readOptions = (): SeedRunOptionsType => {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      drop: {
        type: "boolean",
      },
      "no-cache": {
        type: "boolean",
      },
      "cache-dir": {
        type: "string",
      },
    },
    strict: false,
    allowPositionals: true,
  });

  return {
    drop: Boolean(values.drop),
    noCache: Boolean(values["no-cache"]),
    cacheDir: values["cache-dir"] as string | undefined,
  };
};

const warmSeedCache = async (
  seeds: ISeed[],
  env: string | undefined,
  cacheDir: string,
  cacheEnabled: boolean,
): Promise<{
  hashByName: Map<string, string>;
  cachedNames: Set<string>;
}> => {
  const hashByName = new Map<string, string>();
  const cachedNames = new Set<string>();

  if (!cacheEnabled) {
    return { hashByName, cachedNames };
  }

  await Promise.all(
    // talos-ignore perf.await-in-loop: the callbacks run under Promise.all — the cache lookups are already parallel
    seeds.map(async (seed) => {
      const name = seed.constructor.name;
      const hash = computeSeedHash(seed, env);
      hashByName.set(name, hash);
      if (await isSeedCached(cacheDir, name, hash)) {
        cachedNames.add(name);
      }
    }),
  );

  return { hashByName, cachedNames };
};

const cacheAppliedSeed = async (
  cacheEnabled: boolean,
  cacheDir: string,
  hashByName: Map<string, string>,
  seedName: string,
): Promise<void> => {
  const hash = hashByName.get(seedName);
  if (cacheEnabled && hash) {
    await writeSeedCache(cacheDir, seedName, hash);
  }
};

const logCachedSeeds = (seeds: ISeed[]): void => {
  for (const seed of seeds) {
    runLogger.persist(
      colorize(`${SYMBOLS.success} `, COLORS.success) +
        seed.constructor.name +
        colorize("  up to date (cached)", COLORS.dim),
    );
  }
};

export const run = async (config?: { cacheDir?: string }): Promise<void> => {
  const options = readOptions();
  const seeds = await getSeeds();

  if (seeds.length === 0) {
    runLogger.persist(colorize(`${SYMBOLS.skipped} No seeds found`, COLORS.dim));
    return;
  }

  // Per-seed run cache: a seed whose code is unchanged since its last successful
  // run — for the same environment — is skipped. `--drop` rebuilds the database
  // (so a hit would wrongly skip re-seeding) and `--no-cache` is the escape
  // hatch — both disable it. Entries live under `var/cache/seeds`.
  const env = Bun.env.APP_ENV;
  const cacheEnabled = !options.drop && !options.noCache;
  // The runner (`seed:run`) passes an explicit, per-module cache directory under
  // the workspace root; fall back to the cwd-relative default when `run` is
  // invoked directly.
  const cacheDir = config?.cacheDir || options.cacheDir || seedCacheDir();
  const { hashByName, cachedNames } = await warmSeedCache(seeds, env, cacheDir, cacheEnabled);

  // Fast path: when every seed has already run unchanged, there is nothing to
  // do — report each as cached and return.
  if (cachedNames.size === seeds.length) {
    logCachedSeeds(seeds);
    await closeDatabase();
    return;
  }

  if (options.drop) {
    const database = container.getConstant<{ drop: () => Promise<void> }>("database");
    if (database) {
      await database.drop();
      runLogger.persist(colorize(`${SYMBOLS.success} Database dropped`, COLORS.success));
    }
  }

  // talos-ignore perf.await-in-loop: seeds write to the same database in order — running them together would race
  for (const seed of seeds) {
    const seedName = seed.constructor.name;

    if (cachedNames.has(seedName)) {
      runLogger.persist(
        colorize(`${SYMBOLS.success} `, COLORS.success) + seedName + colorize("  up to date (cached)", COLORS.dim),
      );
      continue;
    }

    const startedAt = performance.now();
    try {
      await runSeed(seed);

      runLogger.persist(
        colorize(`${SYMBOLS.success} `, COLORS.success) +
          seedName +
          colorize(`  ${formatDuration(Math.round(performance.now() - startedAt))}`, COLORS.dim),
      );

      // Only cache once the seed has run successfully.
      await cacheAppliedSeed(cacheEnabled, cacheDir, hashByName, seedName);
    } catch (error) {
      runLogger.persist(
        colorize(`${SYMBOLS.error} `, COLORS.error) +
          seedName +
          colorize("  failed", COLORS.error) +
          colorize(`  ${formatDuration(Math.round(performance.now() - startedAt))}`, COLORS.dim),
      );
      const detail = (error as IException)?.message ?? String(error);
      runLogger.persist(...detail.split("\n").map((line) => `${colorize("┃", COLORS.error)} ${line}`));
      await closeDatabase();
      process.exit(1);
    }
  }

  await closeDatabase();
};
