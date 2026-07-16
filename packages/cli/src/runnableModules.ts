import { readdir } from "node:fs/promises";
import { join } from "node:path";

export type RunnableModuleType = "api" | "microservice" | "spa" | "storybook" | "swagger";

export type RunnableModule = {
  name: string;
  type: RunnableModuleType;
  dir: string;
};

const RUNNABLE_TYPES = new Set<RunnableModuleType>(["api", "microservice", "spa", "storybook", "swagger"]);

// Read the `type` declared in a module's `<name>.yml` config, or null when absent.
const readModuleType = async (moduleDir: string, name: string): Promise<string | null> => {
  const ymlFile = Bun.file(join(moduleDir, `${name}.yml`));
  if (!(await ymlFile.exists())) return null;

  const match = (await ymlFile.text()).match(/^type:\s*"?([a-z]+)"?/m);
  return match?.[1] ?? null;
};

// Discover every spa, microservice and api module under `modules/`.
export const collectRunnableModules = async (modulesDir: string): Promise<RunnableModule[]> => {
  const entries = await readdir(modulesDir, { withFileTypes: true });

  // Read every module's config concurrently; entries order is preserved so
  // discovery order stays deterministic.
  const modules = await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory()) return null;

      const dir = join(modulesDir, entry.name);
      const type = await readModuleType(dir, entry.name);

      return type && RUNNABLE_TYPES.has(type as RunnableModuleType)
        ? { name: entry.name, type: type as RunnableModuleType, dir }
        : null;
    }),
  );

  return modules.filter((module): module is RunnableModule => module !== null);
};
