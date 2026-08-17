import { container } from "@talosjs/container";
import { SEEDS_CONTAINER } from "./container";
import type { Environment, ISeed } from "./types";

export const getSeeds = async (): Promise<ISeed[]> => {
  const currentEnv = Bun.env.APP_ENV as Environment | undefined;

  const candidates = await Promise.all(
    // talos-ignore perf.await-in-loop: the callbacks run under Promise.all — every seed is inspected in parallel
    // talos-ignore perf.scan-in-loop: the scan is over one seed's own environment list, a handful of entries
    SEEDS_CONTAINER.map(async (SeedClass) => {
      const seed = container.get(SeedClass);
      if (!(await seed.isActive())) return undefined;

      const allowedEnvs = await seed.getEnv();
      if (allowedEnvs.length > 0 && currentEnv && !allowedEnvs.includes(currentEnv)) return undefined;

      return seed;
    }),
  );

  return candidates.filter((seed): seed is ISeed => seed !== undefined);
};
