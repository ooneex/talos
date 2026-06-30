import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

// Mock ensureModule to avoid creating full module structure in tests
mock.module("@/utils", () => ({
  ensureModule: mock(() => Promise.resolve()),
}));

const { CommandCreateCommand } = await import("@/commands/CommandCreateCommand");

describe("CommandCreateCommand", () => {
  let command: InstanceType<typeof CommandCreateCommand>;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    command = new CommandCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `command-${Date.now()}`);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("command:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new command class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "commands", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "commands", ".gitkeep"), "");
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "commands", "DeployCommand.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Deploy", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("Deploy");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "commands", "DeployCommand.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Deploy" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "commands", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "commands", ".gitkeep"), "");
      process.chdir(testDir);
    });

    test("should generate command file with correct name", async () => {
      await command.run({ name: "Deploy" });

      const filePath = join(testDir, "modules", "shared", "src", "commands", "DeployCommand.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("DeployCommand");
    });

    test("should generate test file for command", async () => {
      await command.run({ name: "Deploy" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "commands", "DeployCommand.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("DeployCommand");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "run-migrations" });

      const filePath = join(testDir, "modules", "shared", "src", "commands", "RunMigrationsCommand.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should remove Command suffix if provided", async () => {
      await command.run({ name: "DeployCommand" });

      const filePath = join(testDir, "modules", "shared", "src", "commands", "DeployCommand.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("DeployCommandCommand");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "deploy" });

      const filePath = join(testDir, "modules", "shared", "src", "commands", "DeployCommand.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "run_task" });

      const filePath = join(testDir, "modules", "shared", "src", "commands", "RunTaskCommand.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "Deploy" });

      const filePath = join(testDir, "modules", "shared", "src", "commands", "DeployCommand.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).not.toContain("{{COMMAND_NAME}}");
      expect(content).not.toContain("{{COMMAND_DESCRIPTION}}");
      expect(content).toContain("Deploy");
    });

    test("should set colon-separated command name", async () => {
      await command.run({ name: "RunMigrations" });

      const filePath = join(testDir, "modules", "shared", "src", "commands", "RunMigrationsCommand.ts");
      const content = await Bun.file(filePath).text();

      expect(content).toContain("run:migrations");
    });

    test("should generate commands root export file", async () => {
      await command.run({ name: "Deploy" });

      const commandsFile = join(testDir, "modules", "shared", "src", "commands", "commands.ts");
      expect(existsSync(commandsFile)).toBe(true);

      const content = await Bun.file(commandsFile).text();
      expect(content).toContain("export { DeployCommand } from './DeployCommand';");
    });

    test("should include all commands in root export file", async () => {
      await command.run({ name: "Deploy" });
      await command.run({ name: "Build" });

      const commandsFile = join(testDir, "modules", "shared", "src", "commands", "commands.ts");
      const content = await Bun.file(commandsFile).text();
      expect(content).toContain("export { BuildCommand } from './BuildCommand';");
      expect(content).toContain("export { DeployCommand } from './DeployCommand';");
    });

    test("should sort exports in root export file", async () => {
      await command.run({ name: "Deploy" });
      await command.run({ name: "Build" });

      const commandsFile = join(testDir, "modules", "shared", "src", "commands", "commands.ts");
      const content = await Bun.file(commandsFile).text();
      const lines = content.trim().split("\n");
      expect(lines[0]).toContain("BuildCommand");
      expect(lines[1]).toContain("DeployCommand");
    });

    test("should create bin/command/run.ts if it does not exist", async () => {
      await command.run({ name: "Deploy" });

      const binFile = join(testDir, "modules", "shared", "bin", "command", "run.ts");
      expect(await Bun.file(binFile).exists()).toBe(true);
      const content = await Bun.file(binFile).text();
      expect(content).toContain("run");
    });

    test("should not overwrite bin/command/run.ts if it already exists", async () => {
      const binFile = join(testDir, "modules", "shared", "bin", "command", "run.ts");
      await Bun.write(binFile, "// custom content");

      await command.run({ name: "Deploy" });

      const content = await Bun.file(binFile).text();
      expect(content).toBe("// custom content");
    });
  });

  describe("run() with module option", () => {
    const moduleName = "auth";

    beforeEach(async () => {
      const moduleDir = join(testDir, "modules", moduleName);
      await Bun.write(join(moduleDir, "src", "commands", ".gitkeep"), "");
      await Bun.write(join(moduleDir, "tests", "commands", ".gitkeep"), "");
      process.chdir(testDir);
    });

    test("should generate in module directory when module option is provided", async () => {
      await command.run({ name: "Login", module: moduleName });

      const filePath = join(testDir, "modules", moduleName, "src", "commands", "LoginCommand.ts");
      expect(existsSync(filePath)).toBe(true);

      const testFilePath = join(testDir, "modules", moduleName, "tests", "commands", "LoginCommand.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);
    });

    test("should generate commands root export file in module directory", async () => {
      await command.run({ name: "Login", module: moduleName });

      const commandsFile = join(testDir, "modules", moduleName, "src", "commands", "commands.ts");
      expect(existsSync(commandsFile)).toBe(true);

      const content = await Bun.file(commandsFile).text();
      expect(content).toContain("export { LoginCommand } from './LoginCommand';");
    });

    test("should create bin/command/run.ts in module directory", async () => {
      await command.run({ name: "Login", module: moduleName });

      const binFile = join(testDir, "modules", moduleName, "bin", "command", "run.ts");
      expect(await Bun.file(binFile).exists()).toBe(true);
      const content = await Bun.file(binFile).text();
      expect(content).toContain("run");
      expect(content).toContain(`@module/${moduleName}/commands/commands`);
    });
  });
});
