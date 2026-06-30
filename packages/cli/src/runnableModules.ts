import { readdir } from "node:fs/promises";
import { join } from "node:path";

export type RunnableModuleType = "api" | "microservice" | "spa";

export type RunnableModule = {
  name: string;
  type: RunnableModuleType;
  dir: string;
};

const RUNNABLE_TYPES = new Set<RunnableModuleType>(["api", "microservice", "spa"]);

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
  const modules: RunnableModule[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dir = join(modulesDir, entry.name);
    const type = await readModuleType(dir, entry.name);

    if (type && RUNNABLE_TYPES.has(type as RunnableModuleType)) {
      modules.push({ name: entry.name, type: type as RunnableModuleType, dir });
    }
  }

  return modules;
};

// Per-type filters from the `--api`, `--microservice` and `--spa` flags. A bare flag
// (boolean true) keeps every module of that type, while `--api=a,b` keeps only the
// named ones.
export type ModuleFilters = Partial<Record<RunnableModuleType, boolean | string | undefined>>;

// Restrict the discovered modules to those requested via the type flags. When several
// flags are given the selections are unioned (in discovery order). Returns `modules`
// unchanged when no type flag is set.
export const selectModules = (modules: RunnableModule[], filters: ModuleFilters): RunnableModule[] => {
  // For each requested type, "all" keeps every module of that type, a Set keeps only
  // the named ones. Types absent from the map were not requested.
  const namesByType = new Map<RunnableModuleType, Set<string> | "all">();

  for (const [type, value] of Object.entries(filters) as [RunnableModuleType, boolean | string | undefined][]) {
    if (value === undefined || value === false) continue;

    namesByType.set(
      type,
      typeof value === "string"
        ? new Set(
            value
              .split(",")
              .map((name) => name.trim())
              .filter(Boolean),
          )
        : "all",
    );
  }

  // No type flag set: run every discovered module.
  if (namesByType.size === 0) return modules;

  return modules.filter((module) => {
    const names = namesByType.get(module.type);
    if (!names) return false;
    return names === "all" || names.has(module.name);
  });
};

// True when at least one of the `--api`, `--microservice` or `--spa` flags was set.
export const hasModuleFilter = (filters: ModuleFilters): boolean =>
  Object.values(filters).some((value) => value !== undefined && value !== false);
