import { cp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { addPathAlias } from "../moduleRegistry";
import { ensureBin, LOG_OPTIONS, spawnStep } from "../utils";

const DESIGN_REPOSITORY = "https://github.com/ooneex/skeleton.git";
const DESIGN_TEMPLATE_PATH = "modules/design";

type CommandOptionsType = {
  name?: string;
  cwd?: string;
  silent?: boolean;
};

@decorator.command()
export class DesignCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "design:create";
  }

  public getDescription(): string {
    return "Generate a new design module";
  }

  public async run(options: T): Promise<void> {
    const { cwd = process.cwd(), silent = false, name = "design" } = options;
    const logger = new TerminalLogger();

    const pascalName = toPascalCase(name).replace(/Module$/, "");
    const kebabName = toKebabCase(pascalName);

    const moduleDir = join(cwd, "modules", kebabName);
    const srcDir = join(moduleDir, "src");

    // Pull the design source from the upstream repository. The tmp dir includes a
    // random suffix (not just the module name) so concurrent invocations targeting
    // the same module name never clash on the same clone directory.
    const tmpDir = join(tmpdir(), `talos-design-${kebabName}-${crypto.randomUUID()}`);
    await rm(tmpDir, { recursive: true, force: true });

    if (!ensureBin(logger, "git", silent)) {
      return;
    }

    const cloned = await spawnStep(
      logger,
      ["git", "clone", "--depth", "1", DESIGN_REPOSITORY, tmpDir],
      cwd,
      {
        start: "Cloning design source...",
        failure: (exitCode) => `Failed to clone design source (exit code: ${exitCode})`,
      },
      { silent },
    );
    if (!cloned) return;

    // Copy the whole design template directory (package.json, tsconfig.json, yml,
    // src) as the module content — a design module is not a scaffolded module class,
    // it's the design system source itself.
    const designTemplateDir = join(tmpDir, DESIGN_TEMPLATE_PATH);
    await cp(designTemplateDir, moduleDir, { recursive: true });

    // Rename the template's `design.yml` to match the module's kebab-case name
    const templateYmlPath = join(moduleDir, "design.yml");
    const ymlPath = join(moduleDir, `${kebabName}.yml`);
    if (templateYmlPath !== ymlPath && (await Bun.file(templateYmlPath).exists())) {
      const ymlContent = await Bun.file(templateYmlPath).text();
      await Bun.write(ymlPath, ymlContent);
      await rm(templateYmlPath, { force: true });
    }

    // Ensure the package name matches the module's kebab-case name
    const packagePath = join(moduleDir, "package.json");
    const packageJson = await Bun.file(packagePath).json();
    const deps = Object.keys(packageJson.dependencies ?? {});
    const devDeps = Object.keys(packageJson.devDependencies ?? {});
    packageJson.name = `@module/${kebabName}`;
    await Bun.write(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

    // Rewrite hardcoded `@module/design` imports (from the template's own module name)
    // to the target module's `@module/{name}` alias. The `design` segment must be
    // matched exactly (followed by `/` or a closing quote) so it doesn't clobber
    // imports for modules whose name merely starts with "design".
    const entries = await readdir(srcDir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = join(entry.parentPath, entry.name);
      const content = await Bun.file(filePath).text();
      const rewritten = content.replace(/from "@module\/design(?=["/])/g, `from "@module/${kebabName}`);
      if (rewritten !== content) {
        await Bun.write(filePath, rewritten);
      }
    }

    // Install the design dependencies from the root of the project
    if (deps.length > 0) {
      const depsInstalled = await spawnStep(
        logger,
        ["bun", "add", ...deps],
        cwd,
        {
          start: "Installing design dependencies...",
          failure: (exitCode) => `Failed to install design dependencies (exit code: ${exitCode})`,
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
          start: "Installing design dev dependencies...",
          failure: (exitCode) => `Failed to install design dev dependencies (exit code: ${exitCode})`,
        },
        { silent },
      );
      if (!devDepsInstalled) return;
    }

    await rm(tmpDir, { recursive: true, force: true });

    // Add path alias in app module tsconfig
    const appTsconfigPath = join(cwd, "tsconfig.json");
    if (await Bun.file(appTsconfigPath).exists()) {
      await addPathAlias(appTsconfigPath, kebabName);
    }

    if (!silent) {
      logger.success(`modules/${kebabName} created successfully`, undefined, LOG_OPTIONS);
    }
  }
}
