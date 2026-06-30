import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { PermissionCreateCommand } = await import("@/commands/PermissionCreateCommand");

const exists = (path: string) => Bun.file(path).exists();

describe("PermissionCreateCommand", () => {
  let command: InstanceType<typeof PermissionCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new PermissionCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `permission-${Date.now()}`);

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
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("permission:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new permission class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "permissions", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "permissions", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "permissions", "AdminPermission.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Admin", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("Admin");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "permissions", "AdminPermission.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Admin" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "permissions", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "permissions", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate permission file with correct name", async () => {
      await command.run({ name: "Admin" });

      const filePath = join(testDir, "modules", "shared", "src", "permissions", "AdminPermission.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("AdminPermission");
    });

    test("should generate test file for permission", async () => {
      await command.run({ name: "Admin" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "permissions", "AdminPermission.spec.ts");
      expect(await exists(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("AdminPermission");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "super-admin" });

      const filePath = join(testDir, "modules", "shared", "src", "permissions", "SuperAdminPermission.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should remove Permission suffix if provided", async () => {
      await command.run({ name: "AdminPermission" });

      const filePath = join(testDir, "modules", "shared", "src", "permissions", "AdminPermission.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("AdminPermissionPermission");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "moderator" });

      const filePath = join(testDir, "modules", "shared", "src", "permissions", "ModeratorPermission.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "content_manager" });

      const filePath = join(testDir, "modules", "shared", "src", "permissions", "ContentManagerPermission.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "Editor" });

      const filePath = join(testDir, "modules", "shared", "src", "permissions", "EditorPermission.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).toContain("Editor");
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "permissions", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "permissions", ".gitkeep"), "");

      await command.run({ name: "Admin", module: "user-profile" });

      const testFilePath = join(testDir, "modules", "user-profile", "tests", "permissions", "AdminPermission.spec.ts");
      expect(await exists(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/permissions/AdminPermission");
    });
  });
});
