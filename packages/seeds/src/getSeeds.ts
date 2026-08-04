import { container } from "@talosjs/container";
import { SEEDS_CONTAINER } from "./container";
import type { Environment, ISeed } from "./types";

export const getSeeds = async (): Promise<ISeed[]> => {
  const currentEnv = Bun.env.APP_ENV as Environment | undefined;

  const candidates = await Promise.all(
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
