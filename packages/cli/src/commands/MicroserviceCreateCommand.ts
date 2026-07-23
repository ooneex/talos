import { cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { toSnakeCase } from "@talosjs/utils/toSnakeCase";
import { addPathAlias } from "../moduleRegistry";
import { askName } from "../prompts/askName";
import { templates as bitbucketTemplates } from "../templates/bitbucket/index";
import { templates as githubTemplates } from "../templates/github/index";
import { templates as gitlabTemplates } from "../templates/gitlab/index";
import moduleTemplate from "../templates/module/module.txt";
import testTemplate from "../templates/module/test.txt";
import ymlTemplate from "../templates/module/yml.txt";
import { type CiProviderType, detectCiProvider, ensureBin, LOG_OPTIONS, LOG_OPTIONS_PLAIN, spawnStep } from "../utils";

const MICROSERVICE_REPOSITORY = "https://github.com/ooneex/skeleton.git";
const MICROSERVICE_TEMPLATE_PATH = "modules/microservice";

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

  // Pick the next free port, starting at 8030, so the microservice does not clash
  // with any other microservice already scaffolded in this project.
  private async nextAvailablePort(cwd: string): Promise<number> {
    const used = new Set<number>();
    const modulesDir = join(cwd, "modules");
    const glob = new Bun.Glob("*/.env.yml");

    for await (const match of glob.scan({ cwd: modulesDir, onlyFiles: true })) {
      const content = await Bun.file(join(modulesDir, match)).text();
      const portMatch = content.match(/^\s*port:\s*(\d+)/m);
      if (portMatch) used.add(Number(portMatch[1]));
    }

    let port = 8030;
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

  // Register the microservice pipeline in .gitlab-ci.yml so GitLab picks it up.
  private async addGitlabInclude(gitlabCiPath: string, kebabName: string): Promise<void> {
    const includeLine = `  - local: .gitlab/ci/${kebabName}.yml`;

    if (!(await Bun.file(gitlabCiPath).exists())) {
      await Bun.write(gitlabCiPath, `include:\n${includeLine}\n`);
      return;
    }

    let content = await Bun.file(gitlabCiPath).text();

    // Already declared — nothing to do
    if (content.includes(includeLine)) return;

    if (content.includes("include:")) {
      content = content.replace(/include:\n/, `include:\n${includeLine}\n`);
    } else {
      content = `include:\n${includeLine}\n\n${content.trimStart()}`;
    }

    await Bun.write(gitlabCiPath, content);
  }

  // Scaffold the CI/CD pipeline for the microservice, matching whichever provider
  // the project already uses. Returns the provider, or null when none is configured.
  private async createCiCdFiles(cwd: string, kebabName: string, snakeName: string): Promise<CiProviderType | null> {
    const provider = detectCiProvider(cwd);
    if (!provider) return null;

    const substitute = (template: string): string =>
      template
        .replace(/{{NAME_UPPER}}/g, snakeName.toUpperCase())
        .replace(/{{NAME}}/g, snakeName)
        .replace(/{{name}}/g, kebabName);

    if (provider === "github") {
      await Bun.write(
        join(cwd, ".github", "workflows", `${kebabName}-ci.yml`),
        substitute(githubTemplates.microserviceCi),
      );
      await Bun.write(
        join(cwd, ".github", "workflows", `${kebabName}-production.yml`),
        substitute(githubTemplates.microserviceProduction),
      );
    } else if (provider === "gitlab") {
      await Bun.write(join(cwd, ".gitlab", "ci", `${kebabName}.yml`), substitute(gitlabTemplates.microservice));
      await this.addGitlabInclude(join(cwd, ".gitlab-ci.yml"), kebabName);
    } else {
      await Bun.write(
        join(cwd, ".bitbucket", `${kebabName}-pipelines.yml`),
        substitute(bitbucketTemplates.microservicePipelines),
      );
    }

    return provider;
  }

  public async run(options: T): Promise<void> {
    const { cwd = process.cwd(), silent = false } = options;
    const logger = new TerminalLogger();
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
    const testContent = testTemplate.replace(/{{NAME}}/g, pascalName).replace(/{{name}}/g, kebabName);
    const ymlContent = ymlTemplate.replace(/{{name}}/g, kebabName).replace('type: "module"', 'type: "microservice"');

    // Pull the microservice bootstrap source (index.ts, OnAppStart.ts, Dockerfile,
    // package.json, roles.yml, tsconfig.json) from the upstream skeleton repository
    // instead of bundling static templates in the CLI. The tmp dir includes a random
    // suffix (not just the module name) so concurrent invocations targeting the same
    // module name never clash on the same clone directory.
    const tmpDir = join(tmpdir(), `talos-microservice-${kebabName}-${crypto.randomUUID()}`);
    await rm(tmpDir, { recursive: true, force: true });

    if (!ensureBin(logger, "git", silent)) {
      return;
    }

    const cloned = await spawnStep(
      logger,
      ["git", "clone", "--depth", "1", MICROSERVICE_REPOSITORY, tmpDir],
      cwd,
      {
        start: "Cloning microservice source...",
        failure: (exitCode) => `Failed to clone microservice source (exit code: ${exitCode})`,
      },
      { silent },
    );
    if (!cloned) return;

    const microserviceTemplateDir = join(tmpDir, MICROSERVICE_TEMPLATE_PATH);
    await cp(join(microserviceTemplateDir), moduleDir, { recursive: true });

    await Promise.all([
      rm(join(moduleDir, "src", "MicroserviceModule.ts"), { force: true }),
      rm(join(moduleDir, "tests", "MicroserviceModule.spec.ts"), { force: true }),
      rm(join(moduleDir, "microservice.yml"), { force: true }),
    ]);

    await Promise.all([
      Bun.write(join(srcDir, `${pascalName}Module.ts`), moduleContent),
      Bun.write(join(moduleDir, `${kebabName}.yml`), ymlContent),
      Bun.write(join(testsDir, `${pascalName}Module.spec.ts`), testContent),
    ]);

    // Ensure the package name matches the module's kebab-case name
    const modulePackageJson = await Bun.file(join(moduleDir, "package.json")).json();
    modulePackageJson.name = `@module/${kebabName}`;

    await Promise.all([Bun.write(join(moduleDir, "package.json"), `${JSON.stringify(modulePackageJson, null, 2)}\n`)]);

    // Create the microservice env file at the module root, on its own distinct port.
    // All other values in the template are already set, so only the port needs updating.
    const envExampleContent = await Bun.file(join(tmpDir, ".env.example.yml")).text();
    const port = await this.nextAvailablePort(cwd);
    const envContent = envExampleContent.replace(/^(\s*port:\s*)\d+/m, `$1${port}`);
    await Bun.write(join(moduleDir, ".env.yml"), envContent);

    await rm(tmpDir, { recursive: true, force: true });

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

    // Scaffold the CI/CD pipeline for the microservice, matching the project's
    // provider. Skipped in silent mode (composed/programmatic runs).
    const ciProvider = silent ? null : await this.createCiCdFiles(cwd, kebabName, snakeName);

    if (!silent) {
      logger.success(`modules/${kebabName} created successfully`, undefined, LOG_OPTIONS);

      if (ciProvider) {
        logger.success(`${ciProvider} CI/CD files created for ${kebabName}`, undefined, LOG_OPTIONS);

        if (ciProvider === "bitbucket") {
          logger.info(
            `Merge .bitbucket/${kebabName}-pipelines.yml into bitbucket-pipelines.yml (Bitbucket supports a single pipelines file)`,
            undefined,
            LOG_OPTIONS_PLAIN,
          );
        }
      }
    }
  }
}
