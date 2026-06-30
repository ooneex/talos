import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { commandCreate } from "@/commandCreate";

describe("commandCreate", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `command-create-${Date.now()}`);
    await Bun.write(join(testDir, "src", "commands", ".gitkeep"), "");
    await Bun.write(join(testDir, "tests", "commands", ".gitkeep"), "");
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("should create command file with correct name", async () => {
    await commandCreate({ name: "Deploy", module: "video" });

    const filePath = join(testDir, "src", "commands", "DeployCommand.ts");
    expect(existsSync(filePath)).toBe(true);

    const content = await Bun.file(filePath).text();
    expect(content).toContain("DeployCommand");
  });

  test("should create test file for command", async () => {
    await commandCreate({ name: "Deploy", module: "video" });

    const testFilePath = join(testDir, "tests", "commands", "DeployCommand.spec.ts");
    expect(existsSync(testFilePath)).toBe(true);

    const content = await Bun.file(testFilePath).text();
    expect(content).toContain("DeployCommand");
  });

  test("should return command and test paths", async () => {
    const result = await commandCreate({ name: "Deploy", module: "video" });

    expect(result.commandPath).toBe(join("src", "commands", "DeployCommand.ts"));
    expect(result.testPath).toBe(join("tests", "commands", "DeployCommand.spec.ts"));
  });

  test("should normalize name with toPascalCase", async () => {
    await commandCreate({ name: "run-migrations", module: "video" });

    const filePath = join(testDir, "src", "commands", "RunMigrationsCommand.ts");
    expect(existsSync(filePath)).toBe(true);
  });

  test("should remove Command suffix if provided", async () => {
    await commandCreate({ name: "DeployCommand", module: "video" });

    const filePath = join(testDir, "src", "commands", "DeployCommand.ts");
    expect(existsSync(filePath)).toBe(true);

    const content = await Bun.file(filePath).text();
    expect(content).not.toContain("DeployCommandCommand");
  });

  test("should handle lowercase input", async () => {
    await commandCreate({ name: "deploy", module: "video" });

    const filePath = join(testDir, "src", "commands", "DeployCommand.ts");
    expect(existsSync(filePath)).toBe(true);
  });

  test("should handle snake_case input", async () => {
    await commandCreate({ name: "run_task", module: "video" });

    const filePath = join(testDir, "src", "commands", "RunTaskCommand.ts");
    expect(existsSync(filePath)).toBe(true);
  });

  test("should replace template placeholders correctly", async () => {
    await commandCreate({ name: "Deploy", module: "video" });

    const filePath = join(testDir, "src", "commands", "DeployCommand.ts");
    const content = await Bun.file(filePath).text();

    expect(content).not.toContain("{{NAME}}");
    expect(content).not.toContain("{{COMMAND_NAME}}");
    expect(content).not.toContain("{{COMMAND_DESCRIPTION}}");
    expect(content).toContain("Deploy");
  });

  test("should set colon-separated command name", async () => {
    await commandCreate({ name: "RunMigrations", module: "video" });

    const filePath = join(testDir, "src", "commands", "RunMigrationsCommand.ts");
    const content = await Bun.file(filePath).text();

    expect(content).toContain("run:migrations");
  });

  test("should generate commands root export file", async () => {
    await commandCreate({ name: "Deploy", module: "video" });

    const commandsFile = join(testDir, "src", "commands", "commands.ts");
    expect(existsSync(commandsFile)).toBe(true);

    const content = await Bun.file(commandsFile).text();
    expect(content).toContain("export { DeployCommand } from './DeployCommand';");
  });

  test("should include all commands in root export file", async () => {
    await commandCreate({ name: "Deploy", module: "video" });
    await commandCreate({ name: "Build", module: "video" });

    const commandsFile = join(testDir, "src", "commands", "commands.ts");
    const content = await Bun.file(commandsFile).text();
    expect(content).toContain("export { BuildCommand } from './BuildCommand';");
    expect(content).toContain("export { DeployCommand } from './DeployCommand';");
  });

  test("should sort exports in root export file", async () => {
    await commandCreate({ name: "Deploy", module: "video" });
    await commandCreate({ name: "Build", module: "video" });

    const commandsFile = join(testDir, "src", "commands", "commands.ts");
    const content = await Bun.file(commandsFile).text();
    const lines = content.trim().split("\n");
    expect(lines[0]).toContain("BuildCommand");
    expect(lines[1]).toContain("DeployCommand");
  });

  test("should use custom commandDir and testsDir", async () => {
    const customCommandDir = join("custom", "commands");
    const customTestsDir = join("custom", "tests");
    await Bun.write(join(testDir, customCommandDir, ".gitkeep"), "");
    await Bun.write(join(testDir, customTestsDir, ".gitkeep"), "");

    const result = await commandCreate({
      name: "Deploy",
      module: "video",
      commandDir: customCommandDir,
      testsDir: customTestsDir,
    });

    expect(result.commandPath).toBe(join(customCommandDir, "DeployCommand.ts"));
    expect(result.testPath).toBe(join(customTestsDir, "DeployCommand.spec.ts"));
    expect(existsSync(join(testDir, customCommandDir, "DeployCommand.ts"))).toBe(true);
    expect(existsSync(join(testDir, customTestsDir, "DeployCommand.spec.ts"))).toBe(true);
  });

  test("should contain command decorator in generated file", async () => {
    await commandCreate({ name: "Deploy", module: "video" });

    const filePath = join(testDir, "src", "commands", "DeployCommand.ts");
    const content = await Bun.file(filePath).text();
    expect(content).toContain("@decorator.command()");
  });

  test("should implement ICommand interface in generated file", async () => {
    await commandCreate({ name: "Deploy", module: "video" });

    const filePath = join(testDir, "src", "commands", "DeployCommand.ts");
    const content = await Bun.file(filePath).text();
    expect(content).toContain("implements ICommand");
  });

  test("should have command methods in generated file", async () => {
    await commandCreate({ name: "Deploy", module: "video" });

    const filePath = join(testDir, "src", "commands", "DeployCommand.ts");
    const content = await Bun.file(filePath).text();
    expect(content).toContain("getName");
    expect(content).toContain("getDescription");
    expect(content).toContain("run");
  });

  test("should have test imports in generated test file", async () => {
    await commandCreate({ name: "Deploy", module: "video" });

    const testFilePath = join(testDir, "tests", "commands", "DeployCommand.spec.ts");
    const content = await Bun.file(testFilePath).text();
    expect(content).toContain("describe");
    expect(content).toContain("expect");
    expect(content).toContain("test");
  });

  test("should replace module placeholder in generated test file", async () => {
    await commandCreate({ name: "Deploy", module: "MyVideo" });

    const testFilePath = join(testDir, "tests", "commands", "DeployCommand.spec.ts");
    const content = await Bun.file(testFilePath).text();
    expect(content).not.toContain("{{MODULE}}");
    expect(content).toContain("@module/my-video/commands/DeployCommand");
  });

  test("should test command methods in generated test file", async () => {
    await commandCreate({ name: "Deploy", module: "video" });

    const testFilePath = join(testDir, "tests", "commands", "DeployCommand.spec.ts");
    const content = await Bun.file(testFilePath).text();
    expect(content).toContain("getName");
    expect(content).toContain("getDescription");
    expect(content).toContain("run");
  });

  test("should instantiate command in generated test file", async () => {
    await commandCreate({ name: "Deploy", module: "video" });

    const testFilePath = join(testDir, "tests", "commands", "DeployCommand.spec.ts");
    const content = await Bun.file(testFilePath).text();
    expect(content).toContain("new DeployCommand()");
    expect(content).toContain("toBeInstanceOf(DeployCommand)");
  });

  test("should test run returns Promise in generated test file", async () => {
    await commandCreate({ name: "Deploy", module: "video" });

    const testFilePath = join(testDir, "tests", "commands", "DeployCommand.spec.ts");
    const content = await Bun.file(testFilePath).text();
    expect(content).toContain("toBeInstanceOf(Promise)");
  });
});
