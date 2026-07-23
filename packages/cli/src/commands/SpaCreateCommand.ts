import { existsSync } from "node:fs";
import { cp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { askDesign } from "../prompts/askDesign";
import { askName } from "../prompts/askName";
import ymlTemplate from "../templates/module/yml.txt";
import { ensureBin, LOG_OPTIONS, spawnStep } from "../utils";
import { DesignCreateCommand } from "./DesignCreateCommand";

const SPA_REPOSITORY = "https://github.com/ooneex/skeleton.git";
const SPA_TEMPLATE_PATH = "modules/spa";

const DEFAULT_PORT = 3030;

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
    const logger = new TerminalLogger();
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

    // Pull the spa source from the upstream repository
    const tmpDir = join(tmpdir(), `talos-spa-${kebabName}`);
    await rm(tmpDir, { recursive: true, force: true });

    if (!ensureBin(logger, "git", silent)) {
      return;
    }

    const cloned = await spawnStep(
      logger,
      ["git", "clone", "--depth", "1", SPA_REPOSITORY, tmpDir],
      cwd,
      {
        start: "Cloning spa source...",
        failure: (exitCode) => `Failed to clone spa source (exit code: ${exitCode})`,
      },
      { silent },
    );
    if (!cloned) return;

    // Copy the whole spa template directory (package.json, tsconfig.json, yml,
    // vite config, public assets, src) as the module content — a spa module is not
    // a scaffolded module class, it's the spa source itself.
    const spaTemplateDir = join(tmpDir, SPA_TEMPLATE_PATH);
    await cp(spaTemplateDir, moduleDir, { recursive: true });

    // Mark the module as a spa module in its yml config, recording the design it uses
    await rm(join(moduleDir, "spa.yml"), { force: true });
    let ymlContent = ymlTemplate.replace('type: "module"', 'type: "spa"');
    if (designKebab) {
      ymlContent = `${ymlContent.trimEnd()}\ndesign: "${designKebab}"\n`;
    }
    await Bun.write(join(moduleDir, `${kebabName}.yml`), ymlContent);

    // Add the spa dev/build/preview scripts, picking a port no other module uses
    const port = findFreePort(await collectUsedPorts(modulesDir));
    const packagePath = join(moduleDir, "package.json");
    const packageJson = await Bun.file(packagePath).json();
    const deps = Object.keys(packageJson.dependencies ?? {});
    const devDeps = Object.keys(packageJson.devDependencies ?? {});
    packageJson.name = `@module/${kebabName}`;
    packageJson.type = "module";
    packageJson.scripts = {
      ...packageJson.scripts,
      dev: `bun --bun run vite --port ${port}`,
      build: "bun --bun run vite build",
      preview: "bun --bun run vite preview",
    };
    await Bun.write(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

    // Rewrite hardcoded `@module/spa` imports (from the template's own module name)
    // to the target module's `@module/{name}` alias. The `spa` segment must be
    // matched exactly (followed by `/` or a closing quote) so it doesn't clobber
    // imports for modules whose name merely starts with "spa".
    const entries = await readdir(srcDir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = join(entry.parentPath, entry.name);
      const content = await Bun.file(filePath).text();
      const rewritten = content.replace(/from "@module\/spa(?=["/])/g, `from "@module/${kebabName}`);
      if (rewritten !== content) {
        await Bun.write(filePath, rewritten);
      }
    }

    // The vite config was already copied to the module root along with the rest of
    // the template. Drop any `@module/*` alias it may already carry (e.g. the
    // template's own default design alias) and set the one matching the chosen design.
    const viteConfigDest = join(moduleDir, "vite.config.ts");
    if (existsSync(viteConfigDest)) {
      const viteContent = await Bun.file(viteConfigDest).text();
      const withoutAlias = viteContent.replace(
        /\n\s*"@module\/[\w-]+":\s*fileURLToPath\(\s*\n?\s*new URL\("\.\.\/[\w-]+\/src",\s*import\.meta\.url\),?\s*\n?\s*\),/g,
        "",
      );
      const withAlias = designKebab
        ? withoutAlias.replace(
            '      "@": fileURLToPath(new URL("./src", import.meta.url)),',
            '      "@": fileURLToPath(new URL("./src", import.meta.url)),\n' +
              `      "@module/${designKebab}": fileURLToPath(\n` +
              `        new URL("../${designKebab}/src", import.meta.url),\n` +
              "      ),",
          )
        : withoutAlias;
      if (withAlias !== viteContent) {
        await Bun.write(viteConfigDest, withAlias);
      }
    }

    // Keep the shared folder tracked while empty; its sub-layers are created on demand
    await Bun.write(join(srcDir, "shared", ".gitkeep"), "");

    if (deps.length > 0) {
      const depsInstalled = await spawnStep(
        logger,
        ["bun", "add", ...deps],
        cwd,
        {
          start: "Installing spa dependencies...",
          failure: (exitCode) => `Failed to install spa dependencies (exit code: ${exitCode})`,
        },
        { silent },
      );
      if (!depsInstalled) return;
    }

    if (devDeps.length > 0) {
      const devDepsInstalled = await spawnStep(
        logger,
        ["bun", "add", "-D", ...devDeps],
        cwd,
        {
          start: "Installing spa dev dependencies...",
          failure: (exitCode) => `Failed to install spa dev dependencies (exit code: ${exitCode})`,
        },
        { silent },
      );
      if (!devDepsInstalled) return;
    }

    await rm(tmpDir, { recursive: true, force: true });

    // Scaffold the chosen design module when it does not already exist
    if (design && designKebab && !existsSync(join(modulesDir, designKebab))) {
      await new DesignCreateCommand().run({ name: design, cwd, silent });
    }

    if (!silent) {
      logger.success(`modules/${kebabName} created successfully`, undefined, LOG_OPTIONS);
    }
  }
}
