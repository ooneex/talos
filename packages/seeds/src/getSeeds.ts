import { container } from "@talosjs/container";
import { SEEDS_CONTAINER } from "./container";
import type { Environment, ISeed } from "./types";

export const getSeeds = async (): Promise<ISeed[]> => {
  const currentEnv = Bun.env.APP_ENV as Environment | undefined;
  const seeds: ISeed[] = [];

  for (const SeedClass of SEEDS_CONTAINER) {
    const seed = container.get(SeedClass);
    if (!(await seed.isActive())) continue;

    const allowedEnvs = await seed.getEnv();
    if (allowedEnvs.length > 0 && currentEnv && !allowedEnvs.includes(currentEnv)) continue;

    seeds.push(seed);
  }

  return seeds;
};
