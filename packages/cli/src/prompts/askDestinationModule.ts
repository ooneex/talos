import { readdirSync } from "node:fs";
import { join } from "node:path";
import { prompt } from "./prompt";

// Only modules that can host other modules are valid destinations
const DESTINATION_TYPES = ["api", "microservice"] as const;

/**
 * Scan the workspace `modules/` directory and return the kebab-case names of
 * every module whose yml declares an `api` or `microservice` type.
 */
export const findDestinationModules = async (cwd: string): Promise<string[]> => {
  const modulesDir = join(cwd, "modules");

  let names: string[];
  try {
    names = readdirSync(modulesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  const destinations: string[] = [];
  for (const name of names) {
    const ymlFile = Bun.file(join(modulesDir, name, `${name}.yml`));
    if (!(await ymlFile.exists())) continue;

    const type = (await ymlFile.text()).match(/type:\s*"([^"]+)"/)?.[1];
    if (type && DESTINATION_TYPES.includes(type as (typeof DESTINATION_TYPES)[number])) {
      destinations.push(name);
    }
  }

  return destinations.sort();
};

/**
 * Ask which module the new module should be registered into, suggesting only
 * `api` and `microservice` modules. Falls back to `app` when nothing matches.
 */
export const askDestinationModule = async (config: { cwd: string; message?: string }): Promise<string> => {
  const choices = await findDestinationModules(config.cwd);

  if (choices.length === 0) return "app";

  const response = await prompt<{ destination: string }>({
    type: "select",
    name: "destination",
    message: config.message ?? "Select destination module",
    choices,
    initial: Math.max(choices.indexOf("app"), 0),
  });

  return response.destination;
};
