import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { askConfirm } from "../prompts/askConfirm";
import { askName } from "../prompts/askName";
import bunfigTemplate from "../templates/react-component.bunfig.txt";
import happydomTemplate from "../templates/react-component.happydom.txt";
import specTemplate from "../templates/react-component.spec.txt";
import componentTemplate from "../templates/react-component.txt";
import { LOG_OPTIONS, spawnStep } from "../utils";

// Dev dependencies required to run happy-dom + React Testing Library specs.
const TEST_DEPENDENCIES = ["@happy-dom/global-registrator", "@testing-library/react", "@testing-library/jest-dom"];

type CommandOptionsType = {
  name?: string;
  module?: string;
  feature?: string;
  override?: boolean;
};

@decorator.command()
export class ReactComponentCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "react:component:create";
  }

  public getDescription(): string {
    return "Generate a new react component (with test) in a module or feature components folder";
  }

  public async run(options: T): Promise<void> {
    let { name, module, feature, override = false } = options;

    if (!name) {
      name = await askName({ message: "Enter component name" });
    }

    if (!module) {
      module = await askName({ message: "Enter spa module name" });
    }

    // Normalize inputs: PascalCase drives the component/file name, kebab-case drives paths.
    const pascalName = toPascalCase(name);
    const moduleName = toKebabCase(toPascalCase(module).replace(/Module$/, ""));
    // When a feature is given, the component is scoped to that feature's folder; the
    // feature name mirrors SpaFeatureCreateCommand's normalization (kebab-case, no suffix).
    const featureName = feature
      ? toKebabCase(
          toPascalCase(feature)
            .replace(/Feature$/, "")
            .replace(/Layout$/, ""),
        )
      : undefined;

    const moduleLocalDir = join("modules", moduleName);

    // Component and its mirrored test path. A feature component nests under
    // features/<feature>/components; otherwise it sits at the module's top level.
    const componentSubDir = featureName ? join("features", featureName, "components") : "components";
    const componentLocalPath = join(moduleLocalDir, "src", componentSubDir, `${pascalName}.tsx`);
    const componentPath = join(process.cwd(), componentLocalPath);

    // Tests live in a tests/ folder that sits next to src/, mirroring the component's path.
    const specLocalPath = join(moduleLocalDir, "tests", componentSubDir, `${pascalName}.spec.tsx`);
    const specPath = join(process.cwd(), specLocalPath);

    // Relative import from the spec back to the component: up out of tests/<subdir>
    // into the module root, then down into src/<subdir>.
    const upToModuleRoot = "../".repeat(componentSubDir.split("/").length + 1);
    const specImport = `${upToModuleRoot}src/${componentSubDir}/${pascalName}`;

    if (!override && (await Bun.file(componentPath).exists())) {
      const shouldOverride = await askConfirm({
        message: `Component "${pascalName}" already exists. Override it?`,
        initial: false,
      });

      if (!shouldOverride) {
        return;
      }
    }

    const componentContent = componentTemplate.replace(/{{NAME}}/g, pascalName);
    const specContent = specTemplate.replace(/{{NAME}}/g, pascalName).replace(/{{IMPORT}}/g, specImport);

    await Promise.all([Bun.write(componentPath, componentContent), Bun.write(specPath, specContent)]);

    const logger = new TerminalLogger();

    logger.success(`${componentLocalPath} created successfully`, undefined, LOG_OPTIONS);
    logger.success(`${specLocalPath} created successfully`, undefined, LOG_OPTIONS);

    // happy-dom preload + bunfig live at the module root and are shared by every
    // component's tests, so only write them once (never override an existing setup).
    const setupFiles: Array<{ localPath: string; content: string }> = [
      { localPath: join(moduleLocalDir, "happydom.ts"), content: happydomTemplate },
      { localPath: join(moduleLocalDir, "bunfig.toml"), content: bunfigTemplate },
    ];

    for (const { localPath, content } of setupFiles) {
      const absolutePath = join(process.cwd(), localPath);
      if (!(await Bun.file(absolutePath).exists())) {
        await Bun.write(absolutePath, content);
        logger.success(`${localPath} created successfully`, undefined, LOG_OPTIONS);
      }
    }

    // Install the testing dev dependencies at the project root if any are missing.
    const packageJsonPath = join(process.cwd(), "package.json");
    const packageJson = await Bun.file(packageJsonPath).json();
    const deps = packageJson.dependencies ?? {};
    const devDeps = packageJson.devDependencies ?? {};

    const missing = TEST_DEPENDENCIES.filter((dependency) => !deps[dependency] && !devDeps[dependency]);

    if (missing.length > 0) {
      await spawnStep(logger, ["bun", "add", "-d", ...missing], process.cwd(), {
        start: `Installing ${missing.join(", ")}...`,
        failure: (exitCode) => `Failed to install test dependencies (exit code: ${exitCode})`,
      });
    }
  }
}
