import { cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { removeFromAppModule, removeFromSharedModule } from "../moduleRegistry";
import { askName } from "../prompts/askName";
import { LOG_OPTIONS, spawnStep } from "../utils";
import { ModuleCreateCommand } from "./ModuleCreateCommand";

const DESIGN_REPOSITORY = "https://github.com/talos/skeleton-design.git";

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
    const { cwd = process.cwd(), silent = false } = options;
    let { name } = options;
    const logger = new TerminalLogger();

    if (!name) {
      name = await askName({ message: "Enter design name" });
    }

    const pascalName = toPascalCase(name).replace(/Module$/, "");
    const kebabName = toKebabCase(pascalName);

    const moduleDir = join(cwd, "modules", kebabName);
    const srcDir = join(moduleDir, "src");

    // Scaffold the base module (package.json, tsconfig.json, yml, tests, registration)
    await new ModuleCreateCommand().run({ name, cwd, silent: true });

    // A design module must not be registered into AppModule or SharedModule
    await removeFromAppModule(join(cwd, "modules", "app", "src", "AppModule.ts"), pascalName, kebabName);
    await removeFromSharedModule(join(cwd, "modules", "shared", "src", "SharedModule.ts"), pascalName, kebabName);

    // Drop the scaffolded module class — the design source provides its own src content —
    // along with the now-orphaned spec that imported it
    await rm(join(srcDir, `${pascalName}Module.ts`), { force: true });
    await rm(join(moduleDir, "tests", `${pascalName}Module.spec.ts`), { force: true });

    // Mark the module as a design module in its yml config
    const ymlPath = join(moduleDir, `${kebabName}.yml`);
    if (await Bun.file(ymlPath).exists()) {
      const ymlContent = await Bun.file(ymlPath).text();
      await Bun.write(ymlPath, ymlContent.replace('type: "module"', 'type: "design"'));
    }

    // Pull the design source from the upstream repository
    const tmpDir = join(tmpdir(), `talos-design-${kebabName}`);
    await rm(tmpDir, { recursive: true, force: true });

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

    // Use the repository's src as the module src content
    await cp(join(tmpDir, "src"), srcDir, { recursive: true });

    // Install the design dependencies from the root of the project
    const designPackage = await Bun.file(join(tmpDir, "package.json")).json();
    const deps = Object.keys(designPackage.dependencies ?? {});
    const devDeps = Object.keys(designPackage.devDependencies ?? {});

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

    if (!silent) {
      logger.success(`modules/${kebabName} created successfully`, undefined, LOG_OPTIONS);
    }
  }
}
