import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

// Mock @talosjs/migrations to prevent actual migration file creation
mock.module("@talosjs/migrations", () => ({
  migrationCreate: mock(() => Promise.resolve({ migrationPath: "src/migrations/Migration00000000000000.ts" })),
}));

// Mock ensureModule to avoid creating full module structure in tests
mock.module("@/utils", () => ({
  ensureModule: mock(() => Promise.resolve()),
  LOG_OPTIONS: { showTimestamp: false, showArrow: false, useSymbol: true },
}));

const { MigrationCreateCommand } = await import("@/commands/MigrationCreateCommand");

describe("MigrationCreateCommand", () => {
  let command: InstanceType<typeof MigrationCreateCommand>;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    command = new MigrationCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `migration-${Date.now()}`);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("migration:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new migration file");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "migrations", ".gitkeep"), "");
      process.chdir(testDir);
    });

    test("should create bin/migration/up.ts if it does not exist", async () => {
      await command.run({});

      const binFile = join(testDir, "modules", "shared", "bin", "migration", "up.ts");
      expect(await Bun.file(binFile).exists()).toBe(true);
      const content = await Bun.file(binFile).text();
      expect(content).toContain("up");
    });

    test("should not overwrite bin/migration/up.ts if it already exists", async () => {
      const binFile = join(testDir, "modules", "shared", "bin", "migration", "up.ts");
      await Bun.write(binFile, "// custom content");

      await command.run({});

      const content = await Bun.file(binFile).text();
      expect(content).toBe("// custom content");
    });

    test("should create bin/migration/down.ts if it does not exist", async () => {
      await command.run({});

      const binFile = join(testDir, "modules", "shared", "bin", "migration", "down.ts");
      expect(await Bun.file(binFile).exists()).toBe(true);
      const content = await Bun.file(binFile).text();
      expect(content).toContain("down");
    });

    test("should not overwrite bin/migration/down.ts if it already exists", async () => {
      const binFile = join(testDir, "modules", "shared", "bin", "migration", "down.ts");
      await Bun.write(binFile, "// custom content");

      await command.run({});

      const content = await Bun.file(binFile).text();
      expect(content).toBe("// custom content");
    });
  });

  describe("run() with module option", () => {
    const moduleName = "billing";

    beforeEach(async () => {
      const moduleDir = join(testDir, "modules", moduleName);
      await Bun.write(join(moduleDir, "src", "migrations", ".gitkeep"), "");
      process.chdir(testDir);
    });

    test("should create bin/migration/up.ts in module directory", async () => {
      await command.run({ module: moduleName });

      const binFile = join(testDir, "modules", moduleName, "bin", "migration", "up.ts");
      expect(await Bun.file(binFile).exists()).toBe(true);
      const content = await Bun.file(binFile).text();
      expect(content).toContain("up");
      expect(content).toContain(`@module/${moduleName}/migrations/migrations`);
    });

    test("should create bin/migration/down.ts in module directory", async () => {
      await command.run({ module: moduleName });

      const binFile = join(testDir, "modules", moduleName, "bin", "migration", "down.ts");
      expect(await Bun.file(binFile).exists()).toBe(true);
      const content = await Bun.file(binFile).text();
      expect(content).toContain("down");
      expect(content).toContain(`@module/${moduleName}/migrations/migrations`);
    });
  });
});
