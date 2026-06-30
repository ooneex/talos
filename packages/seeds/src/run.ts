import { parseArgs } from "node:util";
import { container } from "@talosjs/container";
import type { IException } from "@talosjs/exception";
import { TerminalLogger } from "@talosjs/logger";
import { getSeeds } from "./getSeeds";
import type { ISeed } from "./types";

const runSeed = async (seed: ISeed): Promise<void> => {
  const data = [];

  const dependencies = await seed.getDependencies();

  for (const dependency of dependencies) {
    const dep = container.get(dependency);
    data.push(await runSeed(dep));
  }

  await seed.run(data);
};

export const run = async (): Promise<void> => {
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

  const seeds = await getSeeds();
  const logger = new TerminalLogger();

  if (seeds.length === 0) {
    logger.info("No seeds found\n", undefined, {
      showTimestamp: false,
      showArrow: false,
      useSymbol: true,
    });
    return;
  }

  if (values.drop) {
    const database = container.getConstant<{ drop: () => Promise<void> }>("database");
    if (database) {
      await database.drop();
      logger.info("Database dropped\n", undefined, {
        showTimestamp: false,
        showArrow: false,
        useSymbol: true,
      });
    }
  }

  logger.info(`Running ${seeds.length} seed(s)...\n`, undefined, {
    showTimestamp: false,
    showArrow: false,
    useSymbol: true,
  });

  for (const seed of seeds) {
    const seedName = seed.constructor.name;

    try {
      await runSeed(seed);
      logger.success(`Seed ${seedName} completed\n`, undefined, {
        showTimestamp: false,
        showArrow: false,
        useSymbol: true,
      });
    } catch (error) {
      logger.error(`Seed ${seedName} failed\n`, undefined, {
        showTimestamp: false,
        showArrow: false,
        useSymbol: true,
      });
      logger.error(error as IException);
      process.exit(1);
    }
  }

  try {
    const database = container.getConstant<{ close: () => Promise<void> }>("database");
    if (database) {
      await database.close();
    }
  } catch {
    // No database constant registered — nothing to close
  }
};
