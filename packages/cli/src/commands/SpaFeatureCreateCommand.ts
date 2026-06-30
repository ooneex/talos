import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { askConfirm } from "../prompts/askConfirm";
import { askName } from "../prompts/askName";
import errorLayoutTemplate from "../templates/spa/spa-feature.error-layout.txt";
import layoutTemplate from "../templates/spa/spa-feature.layout.txt";
import mutationTemplate from "../templates/spa/spa-feature.mutation.txt";
import notFoundLayoutTemplate from "../templates/spa/spa-feature.not-found-layout.txt";
import queryTemplate from "../templates/spa/spa-feature.query.txt";
import routeTemplate from "../templates/spa/spa-feature.route.txt";
import skeletonLayoutTemplate from "../templates/spa/spa-feature.skeleton-layout.txt";
import { createSpinner, LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  name?: string;
  module?: string;
  override?: boolean;
};

@decorator.command()
export class SpaFeatureCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "spa:feature:create";
  }

  public getDescription(): string {
    return "Generate a new spa feature (route, layout, hooks and folders)";
  }

  public async run(options: T): Promise<void> {
    let { name, module, override = false } = options;

    if (!name) {
      name = await askName({ message: "Enter feature name" });
    }

    if (!module) {
      module = await askName({ message: "Enter spa module name" });
    }

    // Normalize inputs: PascalCase drives class/component names, kebab-case drives paths.
    const pascalName = toPascalCase(name)
      .replace(/Feature$/, "")
      .replace(/Layout$/, "");
    const kebabName = toKebabCase(pascalName);
    const camelName = pascalName.charAt(0).toLowerCase() + pascalName.slice(1);
    const moduleName = toKebabCase(toPascalCase(module).replace(/Module$/, ""));

    const render = (template: string): string =>
      template
        .replace(/{{NAME}}/g, pascalName)
        .replace(/{{CAMEL}}/g, camelName)
        .replace(/{{KEBAB}}/g, kebabName);

    const srcLocalDir = join("modules", moduleName, "src");

    const layoutsLocalDir = join(srcLocalDir, "features", kebabName, "layouts");
    const layoutLocalPath = join(layoutsLocalDir, `${pascalName}Layout.tsx`);
    const layoutPath = join(process.cwd(), layoutLocalPath);

    if (!override && (await Bun.file(layoutPath).exists())) {
      const shouldOverride = await askConfirm({
        message: `Feature "${kebabName}" already exists. Override it?`,
        initial: false,
      });

      if (!shouldOverride) {
        return;
      }
    }

    const featureLocalDir = join(srcLocalDir, "features", kebabName);

    // Route (kebab-case) in the routes folder
    const routeLocalPath = join(srcLocalDir, "routes", `${kebabName}.tsx`);
    await Bun.write(join(process.cwd(), routeLocalPath), render(routeTemplate));

    // Layouts (PascalCase) in the feature's layouts folder: the page layout plus
    // the route's pending (skeleton), error and not-found boundaries.
    const notFoundLayoutLocalPath = join(layoutsLocalDir, `${pascalName}NotFoundLayout.tsx`);
    const errorLayoutLocalPath = join(layoutsLocalDir, `${pascalName}ErrorLayout.tsx`);
    const skeletonLayoutLocalPath = join(layoutsLocalDir, `${pascalName}SkeletonLayout.tsx`);
    await Bun.write(layoutPath, render(layoutTemplate));
    await Bun.write(join(process.cwd(), notFoundLayoutLocalPath), render(notFoundLayoutTemplate));
    await Bun.write(join(process.cwd(), errorLayoutLocalPath), render(errorLayoutTemplate));
    await Bun.write(join(process.cwd(), skeletonLayoutLocalPath), render(skeletonLayoutTemplate));

    // TanStack Query custom hooks: one query example, one mutation example
    const queryLocalPath = join(featureLocalDir, "hooks", `useGet${pascalName}.ts`);
    const mutationLocalPath = join(featureLocalDir, "hooks", `useUpdate${pascalName}.ts`);
    await Bun.write(join(process.cwd(), queryLocalPath), render(queryTemplate));
    await Bun.write(join(process.cwd(), mutationLocalPath), render(mutationTemplate));

    const logger = new TerminalLogger();

    logger.success(`${routeLocalPath} created successfully`, undefined, LOG_OPTIONS);
    logger.success(`${layoutLocalPath} created successfully`, undefined, LOG_OPTIONS);
    logger.success(`${notFoundLayoutLocalPath} created successfully`, undefined, LOG_OPTIONS);
    logger.success(`${errorLayoutLocalPath} created successfully`, undefined, LOG_OPTIONS);
    logger.success(`${skeletonLayoutLocalPath} created successfully`, undefined, LOG_OPTIONS);
    logger.success(`${queryLocalPath} created successfully`, undefined, LOG_OPTIONS);
    logger.success(`${mutationLocalPath} created successfully`, undefined, LOG_OPTIONS);

    // Install @tanstack/react-query dependency if not already installed
    const packageJsonPath = join(process.cwd(), "package.json");
    const packageJson = await Bun.file(packageJsonPath).json();
    const deps = packageJson.dependencies ?? {};
    const devDeps = packageJson.devDependencies ?? {};

    if (!deps["@tanstack/react-query"] && !devDeps["@tanstack/react-query"]) {
      const spinner = createSpinner("Installing @tanstack/react-query...");
      const install = Bun.spawn(["bun", "add", "@tanstack/react-query"], {
        cwd: process.cwd(),
        stdout: "ignore",
        stderr: "ignore",
      });
      await install.exited;
      spinner.stop();
    }
  }
}
