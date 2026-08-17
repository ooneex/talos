import { container } from "@talosjs/container";
import { SEEDS_CONTAINER } from "./container";
import type { Environment, ISeed, SeedClassType } from "./types";

/**
 * Every active seed, in registration order and shifted so a seed always comes
 * after the ones it declares in `getDependencies()`.
 *
 * Dependencies declare *ordering*, not extra work: a dependency is itself a
 * registered seed that the runner runs exactly once, on its own turn. A seed
 * registered twice, or reached as a dependency of several others, still appears
 * once in the returned list.
 *
 * A dependency that is inactive — or excluded by the current environment — is
 * not placed at all; it never runs, so there is nothing to order against.
 */
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

      return [SeedClass, seed] as const;
    }),
  );

  const instanceByClass = new Map<SeedClassType, ISeed>();

  for (const candidate of candidates) {
    if (candidate) {
      instanceByClass.set(candidate[0], candidate[1]);
    }
  }

  // `getDependencies()` may resolve asynchronously; collect every declaration
  // up front so the ordering pass below stays synchronous.
  const dependenciesBySeed = new Map<ISeed, SeedClassType[]>();

  await Promise.all(
    // talos-ignore perf.await-in-loop: the callbacks run under Promise.all — every declaration is resolved in parallel
    [...instanceByClass.values()].map(async (seed) => {
      dependenciesBySeed.set(seed, await seed.getDependencies());
    }),
  );

  const ordered: ISeed[] = [];
  const placed = new Set<ISeed>();
  const placing = new Set<ISeed>();

  const place = (seed: ISeed): void => {
    // `placing` also breaks a dependency cycle: the seed already being placed
    // keeps its registration position instead of recursing forever.
    if (placed.has(seed) || placing.has(seed)) {
      return;
    }

    placing.add(seed);

    for (const dependency of dependenciesBySeed.get(seed) ?? []) {
      const dependencySeed = instanceByClass.get(dependency);

      if (dependencySeed) {
        place(dependencySeed);
      }
    }

    placing.delete(seed);
    placed.add(seed);
    ordered.push(seed);
  };

  for (const seed of instanceByClass.values()) {
    place(seed);
  }

  return ordered;
};
