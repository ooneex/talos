import { existsSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { removeFromAppModule, removeFromSharedModule, removePathAlias } from "../moduleRegistry";
import { askDesign } from "../prompts/askDesign";
import { askName } from "../prompts/askName";
import { createSpinner, LOG_OPTIONS } from "../utils";
import { DesignCreateCommand } from "./DesignCreateCommand";
import { ModuleCreateCommand } from "./ModuleCreateCommand";

const SPA_REPOSITORY = "https://github.com/talos/skeleton-spa.git";

const DEFAULT_PORT = 5000;

// Collect every port already referenced by a module's package.json scripts so a new
// spa module doesn't clash on a port that another module already serves.
const collectUsedPorts = async (modulesDir: string): Promise<Set<number>> => {
  const used = new Set<number>();

  if (!existsSync(modulesDir)) {
    return used;
  }

  const glob = new Bun.Glob("*/package.json");
  for await (const match of glob.scan({ cwd: modulesDir, onlyFiles: true })) {
    const packageJson = await Bun.file(join(modulesDir, match)).json();
    const scripts: Record<string, string> = packageJson.scripts ?? {};
    for (const script of Object.values(scripts)) {
      for (const portMatch of script.matchAll(/--port\s+(\d+)/g)) {
        used.add(Number(portMatch[1]));
      }
    }
  }

  return used;
};

// Pick the first free port at or above the default, skipping any already in use.
const findFreePort = (usedPorts: Set<number>): number => {
  let port = DEFAULT_PORT;
  while (usedPorts.has(port)) {
    port++;
  }
  return port;
};

// Collect the kebab-case names of every design module already present so the spa
// can offer them as choices instead of always scaffolding a fresh one.
const collectDesignModules = async (modulesDir: string): Promise<string[]> => {
  const designs: string[] = [];

  if (!existsSync(modulesDir)) {
    return designs;
  }

  const glob = new Bun.Glob("*/*.yml");
  for await (const match of glob.scan({ cwd: modulesDir, onlyFiles: true })) {
    const [folder] = match.split("/");
    if (!folder) {
      continue;
    }
    const content = await Bun.file(join(modulesDir, match)).text();
    if (content.includes('type: "design"')) {
      designs.push(folder);
    }
  }

  return designs;
};

type CommandOptionsType = {
  name?: string;
  cwd?: string;
  silent?: boolean;
  design?: string;
};

@decorator.command()
export class SpaCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "spa:create";
  }

  public getDescription(): string {
    return "Generate a new spa module";
  }

  public async run(options: T): Promise<void> {
    const { cwd = process.cwd(), silent = false } = options;
    let { name, design } = options;

    if (!name) {
      name = await askName({ message: "Enter spa name" });
    }

    const pascalName = toPascalCase(name).replace(/Module$/, "");
    const kebabName = toKebabCase(pascalName);

    const moduleDir = join(cwd, "modules", kebabName);
    const srcDir = join(moduleDir, "src");
    const modulesDir = join(cwd, "modules");

    // Resolve the design module the spa should use — either an existing one chosen
    // interactively or a new name to scaffold via the design:create command.
    if (!design && !silent) {
      design = await askDesign({ existing: await collectDesignModules(modulesDir) });
    }
    const designKebab = design ? toKebabCase(toPascalCase(design).replace(/Module$/, "")) : undefined;

    // Scaffold the base module (package.json, tsconfig.json, yml, tests, registration)
    await new ModuleCreateCommand().run({ name, cwd, silent: true });

    // A spa module must not be registered into AppModule or SharedModule
    await removeFromAppModule(join(cwd, "modules", "app", "src", "AppModule.ts"), pascalName, kebabName);
    await removeFromSharedModule(join(cwd, "modules", "shared", "src", "SharedModule.ts"), pascalName, kebabName);

    // A spa module must not be registered in the root tsconfig.json paths
    await removePathAlias(join(cwd, "tsconfig.json"), kebabName);

    // Drop the scaffolded module class — the spa source provides its own src content —
    // along with the now-orphaned spec that imported it
    await rm(join(srcDir, `${pascalName}Module.ts`), { force: true });
    await rm(join(moduleDir, "tests", `${pascalName}Module.spec.ts`), { force: true });

    // Mark the module as a spa module in its yml config, recording the design it uses
    const ymlPath = join(moduleDir, `${kebabName}.yml`);
    if (await Bun.file(ymlPath).exists()) {
      const ymlContent = await Bun.file(ymlPath).text();
      let updated = ymlContent.replace('type: "module"', 'type: "spa"');
      if (designKebab) {
        updated = `${updated.trimEnd()}\ndesign: "${designKebab}"\n`;
      }
      await Bun.write(ymlPath, updated);
    }

    // Add the spa dev/build/preview scripts, picking a port no other module uses
    const port = findFreePort(await collectUsedPorts(modulesDir));
    const packagePath = join(moduleDir, "package.json");
    const packageJson = await Bun.file(packagePath).json();
    packageJson.scripts = {
      ...packageJson.scripts,
      dev: `bun --bun run vite --port ${port}`,
      build: "bun --bun run vite build",
      preview: "bun --bun run vite preview",
    };
    await Bun.write(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

    // Pull the spa source from the upstream repository
    const tmpDir = join(tmpdir(), `talos-spa-${kebabName}`);
    await rm(tmpDir, { recursive: true, force: true });

    const cloneSpinner = silent ? null : createSpinner("Cloning spa source...");
    const clone = Bun.spawn(["git", "clone", "--depth", "1", SPA_REPOSITORY, tmpDir], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await clone.exited;
    cloneSpinner?.stop();

    // Use the repository's src as the module src content
    await cp(join(tmpDir, "src"), srcDir, { recursive: true });

    // Ensure every shared sub-layer exists, keeping empty folders tracked via .gitkeep
    const sharedSubDirs = ["assets", "components", "hooks", "layouts", "services", "store", "styles", "types", "utils"];
    for (const subDir of sharedSubDirs) {
      await Bun.write(join(srcDir, "shared", subDir, ".gitkeep"), "");
    }

    // Install the spa dependencies from the root of the project
    const spaPackage = await Bun.file(join(tmpDir, "package.json")).json();
    const deps = Object.keys(spaPackage.dependencies ?? {});
    const devDeps = Object.keys(spaPackage.devDependencies ?? {});

    if (deps.length > 0) {
      const depsSpinner = silent ? null : createSpinner("Installing spa dependencies...");
      const addDeps = Bun.spawn(["bun", "add", ...deps], { cwd, stdout: "ignore", stderr: "ignore" });
      await addDeps.exited;
      depsSpinner?.stop();
    }

    if (devDeps.length > 0) {
      const devDepsSpinner = silent ? null : createSpinner("Installing spa dev dependencies...");
      const addDevDeps = Bun.spawn(["bun", "add", "-D", ...devDeps], { cwd, stdout: "ignore", stderr: "ignore" });
      await addDevDeps.exited;
      devDepsSpinner?.stop();
    }

    await rm(tmpDir, { recursive: true, force: true });

    // Scaffold the chosen design module when it does not already exist
    if (design && designKebab && !existsSync(join(modulesDir, designKebab))) {
      await new DesignCreateCommand().run({ name: design, cwd, silent });
    }

    if (!silent) {
      const logger = new TerminalLogger();

      logger.success(`modules/${kebabName} created successfully`, undefined, LOG_OPTIONS);
    }
  }
}
