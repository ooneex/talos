import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { toPascalCase } from "@talosjs/utils/toPascalCase";
import { askConfirm } from "../prompts/askConfirm";
import { askDatabaseType } from "../prompts/askDatabaseType";
import { askName } from "../prompts/askName";
import pgTemplate from "../templates/database.pg.txt";
import redisTestTemplate from "../templates/database.redis.test.txt";
import redisTemplate from "../templates/database.redis.txt";
import sqliteTemplate from "../templates/database.sqlite.txt";
import testTemplate from "../templates/database.test.txt";
import { ensureModule, LOG_OPTIONS, spawnStep } from "../utils";

type CommandOptionsType = {
  name?: string;
  module?: string;
  override?: boolean;
};

@decorator.command()
export class DatabaseCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "database:create";
  }

  public getDescription(): string {
    return "Generate a new database class";
  }

  public async run(options: T): Promise<void> {
    let { name, module = "shared", override = false } = options;

    if (!name) {
      name = await askName({ message: "Enter database name" });
    }

    name = toPascalCase(name)
      .replace(/DatabaseAdapter$/, "")
      .replace(/Database$/, "");

    const dbType = await askDatabaseType({ message: "Select database type" });
    const template = dbType === "postgres" ? pgTemplate : dbType === "redis" ? redisTemplate : sqliteTemplate;
    const content = template.replace(/{{NAME}}/g, name);

    await ensureModule(module);

    const base = join("modules", module);
    const databaseLocalDir = join(base, "src", "databases");
    const databaseDir = join(process.cwd(), databaseLocalDir);
    const filePath = join(databaseDir, `${name}Database.ts`);

    if (!override && (await Bun.file(filePath).exists())) {
      const shouldOverride = await askConfirm({
        message: `Database "${name}Database" already exists. Override it?`,
        initial: false,
      });

      if (!shouldOverride) {
        return;
      }
    }

    await Bun.write(filePath, content);

    // Generate test file
    const testFileTemplate = dbType === "redis" ? redisTestTemplate : testTemplate;
    const testContent = testFileTemplate.replace(/{{NAME}}/g, name).replace(/{{MODULE}}/g, module);
    const testsLocalDir = join(base, "tests", "databases");
    const testsDir = join(process.cwd(), testsLocalDir);
    const testFilePath = join(testsDir, `${name}Database.spec.ts`);
    await Bun.write(testFilePath, testContent);

    const logger = new TerminalLogger();

    logger.success(`${join(databaseLocalDir, name)}Database.ts created successfully`, undefined, LOG_OPTIONS);

    logger.success(`${join(testsLocalDir, name)}Database.spec.ts created successfully`, undefined, LOG_OPTIONS);

    // Install @talosjs/database dependency if not already installed
    const packageJsonPath = join(process.cwd(), "package.json");
    const packageJson = await Bun.file(packageJsonPath).json();
    const deps = packageJson.dependencies ?? {};
    const devDeps = packageJson.devDependencies ?? {};

    if (!deps["@talosjs/database"] && !devDeps["@talosjs/database"]) {
      await spawnStep(logger, ["bun", "add", "@talosjs/database"], process.cwd(), {
        start: "Installing @talosjs/database...",
        failure: (exitCode) => `Failed to install @talosjs/database (exit code: ${exitCode})`,
      });
    }
  }
}
