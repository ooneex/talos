import { parseArgs } from "node:util";
import { container } from "@talosjs/container";
import type { IException } from "@talosjs/exception";
import { getSeeds } from "./getSeeds";
import { COLORS, colorize, formatDuration, runLogger, SYMBOLS } from "./runLogger";
import type { ISeed } from "./types";

type SeedRunOptionsType = {
  drop?: boolean;
};

/**
 * Runs one seed and records what it returned.
 *
 * Only this seed's own `run()` is called here. Its dependencies are registered
 * seeds too, already run on their own earlier turn — `getSeeds` orders them
 * ahead of it — so their results are read back from `resultBySeed` instead of
 * being re-produced. Re-running one would duplicate the rows it wrote.
 *
 * A dependency that was skipped (inactive, or excluded by the current
 * environment) has no recorded result and comes through as `undefined`, keeping
 * `data` aligned with the declaration order.
 */
const runSeed = async (seed: ISeed, resultBySeed: Map<ISeed, unknown>): Promise<void> => {
  const dependencies = await seed.getDependencies();
  const data = dependencies.map((dependency) => resultBySeed.get(container.get(dependency)));

  resultBySeed.set(seed, await seed.run(data));
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
    },
    strict: false,
    allowPositionals: true,
  });

  return {
    drop: Boolean(values.drop),
  };
};

export const run = async (): Promise<void> => {
  const options = readOptions();
  const seeds = await getSeeds();

  if (seeds.length === 0) {
    runLogger.persist(colorize(`${SYMBOLS.skipped} No seeds found`, COLORS.dim));
    return;
  }

  if (options.drop) {
    const database = container.getConstant<{ drop: () => Promise<void> }>("database");
    if (database) {
      await database.drop();
      runLogger.persist(colorize(`${SYMBOLS.success} Database dropped`, COLORS.success));
    }
  }

  // What each seed returned, so a later seed can read the results of the
  // dependencies it declares without running them a second time.
  const resultBySeed = new Map<ISeed, unknown>();

  // talos-ignore perf.await-in-loop: seeds write to the same database in order — running them together would race
  for (const seed of seeds) {
    const seedName = seed.constructor.name;
    const startedAt = performance.now();
    try {
      await runSeed(seed, resultBySeed);

      runLogger.persist(
        colorize(`${SYMBOLS.success} `, COLORS.success) +
          seedName +
          colorize(`  ${formatDuration(Math.round(performance.now() - startedAt))}`, COLORS.dim),
      );
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
