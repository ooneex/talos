import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { DatabaseCreateCommand } = await import("@/commands/DatabaseCreateCommand");

describe("DatabaseCreateCommand", () => {
  let command: InstanceType<typeof DatabaseCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new DatabaseCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `database-${Date.now()}`);

    // Mock Bun.spawn to avoid running bun add in tests
    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
      if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "add") {
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }
      return originalSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("database:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new database class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "databases", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "databases", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "databases", "PostgresDatabase.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Postgres", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("Postgres");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "databases", "PostgresDatabase.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Postgres" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "databases", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "databases", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate database file with correct name", async () => {
      await command.run({ name: "Postgres" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "PostgresDatabase.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("PostgresDatabase");
    });

    test("should generate test file for database", async () => {
      await command.run({ name: "Postgres" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "databases", "PostgresDatabase.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("PostgresDatabase");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "my-sql" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "MySqlDatabase.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should install the dependency silently without inheriting output", async () => {
      const installCalls: { cmd: string[]; stderr: unknown }[] = [];
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? (args[0] as string[]) : (args[0] as { cmd?: string[] })?.cmd;
        const opts = args[1] as { stderr?: unknown } | undefined;
        if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "add") {
          installCalls.push({ cmd: [...cmd], stderr: opts?.stderr });
          return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
        }
        return originalSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
      }) as typeof Bun.spawn;

      await command.run({ name: "Postgres" });

      expect(installCalls.length).toBeGreaterThan(0);
      expect(installCalls[0]?.stderr).toBe("pipe");
    });

    test("should remove Database suffix if provided", async () => {
      await command.run({ name: "PostgresDatabase" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "PostgresDatabase.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("PostgresDatabaseDatabase");
    });

    test("should remove DatabaseAdapter suffix if provided", async () => {
      await command.run({ name: "PostgresDatabaseAdapter" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "PostgresDatabase.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("PostgresDatabaseAdapterDatabase");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "mongodb" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "MongodbDatabase.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "time_scale" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "TimeScaleDatabase.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "Redis" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "RedisDatabase.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).toContain("Redis");
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "databases", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "databases", ".gitkeep"), "");

      await command.run({ name: "Postgres", module: "user-profile" });

      const testFilePath = join(testDir, "modules", "user-profile", "tests", "databases", "PostgresDatabase.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/databases/PostgresDatabase");
    });
  });

  describe("redis database type", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "databases", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "databases", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);

      // Select "redis" when prompted for the database type
      mock.module("enquirer", () => ({
        prompt: mock(() => Promise.resolve({ name: "Test", type: "redis" })),
      }));
    });

    afterEach(() => {
      // Restore the default prompt mock for the rest of the suite
      mock.module("enquirer", () => ({
        prompt: mock(() => Promise.resolve({ name: "Test" })),
      }));
    });

    test("should generate a database class extending RedisDatabase", async () => {
      await command.run({ name: "Session" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "SessionDatabase.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("extends RedisDatabase");
      expect(content).toContain('import { RedisDatabase, decorator } from "@talosjs/database"');
      expect(content).not.toContain("{{NAME}}");
    });

    test("should generate a redis test file using getClient", async () => {
      await command.run({ name: "Session" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "databases", "SessionDatabase.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("getClient");
      expect(content).not.toContain("getSource");
    });
  });
});
