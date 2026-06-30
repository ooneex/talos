import { join } from "node:path";
import { envConfig } from "@talosjs/app-env";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { rolesConfig } from "@talosjs/role";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { toSnakeCase } from "@talosjs/utils/toSnakeCase";
import { addModuleScope, addPathAlias } from "../moduleRegistry";
import { askName } from "../prompts/askName";
import dockerfileTemplate from "../templates/app/Dockerfile.txt";
import indexTemplate from "../templates/app/index.ts.txt";
import onAppStartTemplate from "../templates/app/OnAppStart.ts.txt";
import moduleTemplate from "../templates/module/module.txt";
import packageTemplate from "../templates/module/package.txt";
import testTemplate from "../templates/module/test.txt";
import tsconfigTemplate from "../templates/module/tsconfig.txt";
import ymlTemplate from "../templates/module/yml.txt";
import { LOG_OPTIONS, toYaml } from "../utils";

type CommandOptionsType = {
  name?: string;
  cwd?: string;
  silent?: boolean;
};

@decorator.command()
export class MicroserviceCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "microservice:create";
  }

  public getDescription(): string {
    return "Generate a new microservice";
  }

  private async declareInAppYml(appYmlPath: string, kebabName: string, constName: string): Promise<void> {
    let content = await Bun.file(appYmlPath).text();

    // Already declared — nothing to do
    if (content.includes(`- name: "${kebabName}"`)) return;

    const envVar = `MICROSERVICE_${constName}_URL`;
    const item = `  # ${kebabName} microservice\n  - name: "${kebabName}"\n    url: ${envVar} # env var name\n`;

    if (content.includes("microservices:")) {
      // Append the new entry right after the microservices list header
      content = content.replace(/microservices:\n/, `microservices:\n${item}`);
    } else {
      // Add the microservices section at the end of the file
      content = `${content.trimEnd()}\n\nmicroservices:\n${item}`;
    }

    await Bun.write(appYmlPath, content);
  }

  // Pick the next free port so the microservice does not clash with the API (3000)
  // or any other microservice already scaffolded in this project.
  private async nextAvailablePort(cwd: string): Promise<number> {
    const used = new Set<number>([3000]);
    const modulesDir = join(cwd, "modules");
    const glob = new Bun.Glob("*/.env.yml");

    for await (const match of glob.scan({ cwd: modulesDir, onlyFiles: true })) {
      const content = await Bun.file(join(modulesDir, match)).text();
      const portMatch = content.match(/^\s*port:\s*(\d+)/m);
      if (portMatch) used.add(Number(portMatch[1]));
    }

    let port = 3001;
    while (used.has(port)) port++;

    return port;
  }

  private async addToEnvYml(envYmlPath: string, kebabName: string): Promise<void> {
    let content = await Bun.file(envYmlPath).text();

    const entry = `  ${kebabName}:\n    url: ""\n`;

    if (content.includes("microservices:")) {
      // Already declared — nothing to do
      if (new RegExp(`microservices:[\\s\\S]*?\\n  ${kebabName}:`).test(content)) return;
      // Append the new entry right after the microservices map header
      content = content.replace(/microservices:\n/, `microservices:\n${entry}`);
    } else {
      // Add the microservices section at the end of the file
      content = `${content.trimEnd()}\n\nmicroservices:\n${entry}`;
    }

    await Bun.write(envYmlPath, content);
  }

  public async run(options: T): Promise<void> {
    const { cwd = process.cwd(), silent = false } = options;
    let { name } = options;

    if (!name) {
      name = await askName({ message: "Enter microservice name" });
    }

    const pascalName = toPascalCase(name).replace(/Module$/, "");
    const kebabName = toKebabCase(pascalName);
    const snakeName = toSnakeCase(pascalName);

    const moduleDir = join(cwd, "modules", kebabName);
    const srcDir = join(moduleDir, "src");
    const testsDir = join(moduleDir, "tests");

    const moduleContent = moduleTemplate.replace(/{{NAME}}/g, pascalName);
    const packageContent = packageTemplate.replace(/{{NAME}}/g, kebabName);
    const testContent = testTemplate.replace(/{{NAME}}/g, pascalName).replace(/{{name}}/g, kebabName);
    const ymlContent = ymlTemplate.replace(/{{name}}/g, kebabName).replace('type: "module"', 'type: "microservice"');

    await Bun.write(join(srcDir, `${pascalName}Module.ts`), moduleContent);
    await Bun.write(join(moduleDir, "roles.yml"), `${toYaml(rolesConfig)}\n`);
    await Bun.write(join(moduleDir, "package.json"), packageContent);
    await Bun.write(join(moduleDir, "tsconfig.json"), tsconfigTemplate);
    await Bun.write(join(moduleDir, `${kebabName}.yml`), ymlContent);
    await Bun.write(join(testsDir, `${pascalName}Module.spec.ts`), testContent);

    // Add the microservice entrypoint and start hook (the index template targets
    // the app module, so point it at this microservice's own module)
    const indexContent = indexTemplate.replace(/AppModule/g, `${pascalName}Module`);
    await Bun.write(join(srcDir, "index.ts"), indexContent);
    await Bun.write(join(srcDir, "OnAppStart.ts"), onAppStartTemplate);

    // Add a Dockerfile so the microservice can be built and deployed independently
    const dockerfileContent = dockerfileTemplate
      .replace(/{{NAME}}/g, snakeName)
      .replace(/modules\/app\//g, `modules/${kebabName}/`);
    await Bun.write(join(moduleDir, "Dockerfile"), dockerfileContent);

    // Create the microservice env file at the module root, on its own distinct port
    const envData = structuredClone(envConfig) as {
      app: { port: number };
      cache: { redis: { url: string } };
      pubsub: { redis: { url: string } };
      rate_limit: { redis: { url: string } };
      database: { url: string; redis: { url: string } };
      [key: string]: unknown;
    };
    envData.app.port = await this.nextAvailablePort(cwd);

    envData.cache.redis.url = "redis://localhost:6379";
    envData.pubsub.redis.url = "redis://localhost:6379";
    envData.rate_limit.redis.url = "redis://localhost:6379";
    envData.database.url = "postgresql://talos:talos@localhost:5432/talos";
    envData.database.redis.url = "redis://localhost:6379";

    await Bun.write(join(moduleDir, ".env.yml"), `${toYaml(envData)}\n`);

    // A microservice must not be registered into AppModule or SharedModule
    if (kebabName !== "app") {
      // Declare the microservice in the app module config so the API can reach it
      const appYmlPath = join(cwd, "modules", "app", "app.yml");
      if (await Bun.file(appYmlPath).exists()) {
        await this.declareInAppYml(appYmlPath, kebabName, snakeName.toUpperCase());
      }

      // Add the microservice URL env var to the project root env config
      const envYmlPath = join(cwd, ".env.yml");
      if (await Bun.file(envYmlPath).exists()) {
        await this.addToEnvYml(envYmlPath, kebabName);
      }
    }

    // Add path alias in app module tsconfig
    const appTsconfigPath = join(cwd, "tsconfig.json");
    if (await Bun.file(appTsconfigPath).exists()) {
      await addPathAlias(appTsconfigPath, kebabName);
    }

    // Add module scope to commitlint config if it exists
    const commitlintPath = join(cwd, ".commitlintrc.ts");
    if (await Bun.file(commitlintPath).exists()) {
      await addModuleScope(commitlintPath, kebabName);
    }

    if (!silent) {
      const logger = new TerminalLogger();

      logger.success(`modules/${kebabName} created successfully`, undefined, LOG_OPTIONS);
    }
  }
}
