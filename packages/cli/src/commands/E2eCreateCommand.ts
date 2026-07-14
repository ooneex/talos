import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { askConfirm } from "../prompts/askConfirm";
import { askName } from "../prompts/askName";
import { installDependency, type ScaffoldOptionsType } from "../scaffold";
import specTemplate from "../templates/e2e.spec.txt";
import configTemplate from "../templates/playwright.config.txt";
import { ensureModule, LOG_OPTIONS, spawnStep } from "../utils";

/**
 * Scaffold a Playwright end-to-end test inside a module's `e2e/` folder, adding
 * a `playwright.config.ts` alongside it. `@playwright/test` is installed at the
 * project root as a dev dependency when missing and the Playwright browsers are
 * downloaded via `bunx playwright install`.
 */
@decorator.command()
export class E2eCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "e2e:create";
  }

  public getDescription(): string {
    return "Generate a new Playwright e2e test";
  }

  public async run(options: T): Promise<void> {
    let { name, module = "shared", override = false } = options;

    if (!name) {
      name = await askName({ message: "Enter e2e test name" });
    }

    name = toPascalCase(name);
    for (const suffix of ["Spec", "E2e"]) {
      name = name.replace(new RegExp(`${suffix}$`), "");
    }

    await ensureModule(module);

    const base = join("modules", module);
    const e2eLocalDir = join(base, "e2e");
    const specLocalPath = join(e2eLocalDir, `${name}.spec.ts`);
    const specPath = join(process.cwd(), specLocalPath);

    if (!override && (await Bun.file(specPath).exists())) {
      const shouldOverride = await askConfirm({
        message: `E2E test "${name}.spec.ts" already exists. Override it?`,
        initial: false,
      });

      if (!shouldOverride) {
        return;
      }
    }

    await Bun.write(specPath, specTemplate);

    const logger = new TerminalLogger();
    logger.success(`${specLocalPath} created successfully`, undefined, LOG_OPTIONS);

    // Add the Playwright config to the module once, without overriding an existing one.
    const configLocalPath = join(base, "playwright.config.ts");
    const configPath = join(process.cwd(), configLocalPath);
    if (!(await Bun.file(configPath).exists())) {
      await Bun.write(configPath, configTemplate);
      logger.success(`${configLocalPath} created successfully`, undefined, LOG_OPTIONS);
    }

    // Register the `e2e` script in the module's package.json when it is missing.
    const packageJsonPath = join(process.cwd(), base, "package.json");
    if (await Bun.file(packageJsonPath).exists()) {
      const packageJson = await Bun.file(packageJsonPath).json();
      const scripts = packageJson.scripts ?? {};

      if (!scripts.e2e) {
        packageJson.scripts = { ...scripts, e2e: "bunx playwright test" };
        await Bun.write(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
        logger.success(`${join(base, "package.json")} updated with the e2e script`, undefined, LOG_OPTIONS);
      }
    }

    // Install Playwright at the project root and download its browsers.
    await installDependency("@playwright/test", true);
    await spawnStep(logger, ["bunx", "playwright", "install"], process.cwd(), {
      start: "Installing Playwright browsers...",
      success: "Playwright browsers installed",
      failure: (exitCode) => `Failed to install Playwright browsers (exit code: ${exitCode})`,
    });
  }
}
