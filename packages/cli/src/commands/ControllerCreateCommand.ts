import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import type { HttpMethodType } from "@talosjs/types";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { trim } from "@talosjs/utils/trim";
import { askConfirm } from "../prompts/askConfirm";
import { askName } from "../prompts/askName";
import { askRouteMethod } from "../prompts/askRouteMethod";
import { askRouteName } from "../prompts/askRouteName";
import { askRoutePath } from "../prompts/askRoutePath";
import { addClassToModule } from "../scaffold";
import socketTemplate from "../templates/controller.socket.txt";
import testTemplate from "../templates/controller.test.txt";
import template from "../templates/controller.txt";
import { createSpinner, ensureModule, LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  name?: string;
  module?: string;
  isSocket?: boolean;
  override?: boolean;
  route?: {
    name?: string;
    path?: `/${string}`;
    method?: HttpMethodType;
  };
};

@decorator.command()
export class ControllerCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "controller:create";
  }

  public getDescription(): string {
    return "Generate a new controller class";
  }

  public async run(options: T): Promise<void> {
    let { name, module = "shared", isSocket, override = false } = options;

    if (!name) {
      name = await askName({ message: "Enter controller name" });
    }

    if (isSocket === undefined) {
      isSocket = await askConfirm({ message: "Is this a socket controller?" });
    }

    name = toPascalCase(name).replace(/Controller$/, "");

    const { route = {} } = options;
    const selectedTemplate = isSocket ? socketTemplate : template;
    let content: string = selectedTemplate.replaceAll("{{NAME}}", name);

    if (!route.name) {
      route.name = await askRouteName({ message: "Enter route name (e.g., api.user.create)" });
    }

    const routeTypeName = toPascalCase(route.name);

    content = content.replaceAll("{{ROUTE_NAME}}", route.name).replaceAll("{{TYPE_NAME}}", routeTypeName);

    if (!route.path) {
      route.path = (await askRoutePath({ message: "Enter route path", initial: "/" })) as `/${string}`;
    }

    const routePath = `/${toKebabCase(trim(route.path, "/"))}`;
    content = content.replaceAll("{{ROUTE_PATH}}", routePath);

    if (!isSocket && !route.method) {
      route.method = (await askRouteMethod({ message: "Enter route method" })) as HttpMethodType;
    }

    if (!isSocket && route.method) {
      content = content.replaceAll("{{ROUTE_METHOD}}", route.method.toLowerCase());
    }

    await ensureModule(module);

    const base = join("modules", module);
    const controllersLocalDir = join(base, "src", "controllers");
    const controllersDir = join(process.cwd(), controllersLocalDir);
    const filePath = join(controllersDir, `${name}Controller.ts`);

    if (!override && (await Bun.file(filePath).exists())) {
      const shouldOverride = await askConfirm({
        message: `Controller "${name}Controller" already exists. Override it?`,
        initial: false,
      });

      if (!shouldOverride) {
        return;
      }
    }

    await Bun.write(filePath, content);

    // Generate test file
    const testContent = testTemplate.replace(/{{NAME}}/g, name).replace(/{{MODULE}}/g, module);
    const testsLocalDir = join(base, "tests", "controllers");
    const testsDir = join(process.cwd(), testsLocalDir);
    const testFilePath = join(testsDir, `${name}Controller.spec.ts`);
    await Bun.write(testFilePath, testContent);

    const modulePascalName = toPascalCase(module);
    const modulePath = join(process.cwd(), base, "src", `${modulePascalName}Module.ts`);
    if (await Bun.file(modulePath).exists()) {
      await addClassToModule(modulePath, `${name}Controller`, "controllers", "controllers");
    }

    const logger = new TerminalLogger();

    logger.success(`${join(controllersLocalDir, name)}Controller.ts created successfully`, undefined, LOG_OPTIONS);

    logger.success(`${join(testsLocalDir, name)}Controller.spec.ts created successfully`, undefined, LOG_OPTIONS);

    // Install @talosjs/controller dependency if not already installed
    const packageJsonPath = join(process.cwd(), "package.json");
    const packageJson = await Bun.file(packageJsonPath).json();
    const deps = packageJson.dependencies ?? {};
    const devDeps = packageJson.devDependencies ?? {};

    if (!deps["@talosjs/controller"] && !devDeps["@talosjs/controller"]) {
      const spinner = createSpinner("Installing @talosjs/controller...");
      const install = Bun.spawn(["bun", "add", "@talosjs/controller"], {
        cwd: process.cwd(),
        stdout: "ignore",
        stderr: "ignore",
      });
      await install.exited;
      spinner.stop();
    }
  }
}
