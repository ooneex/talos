import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const mockPrompt = mock(({ name }: { name: string }) => {
  if (name === "title") return Promise.resolve({ title: "Test Issue" });
  if (name === "state") return Promise.resolve({ state: "Todo" });
  if (name === "priority") return Promise.resolve({ priority: "Medium" });
  if (name === "labels") return Promise.resolve({ labels: [] as string[] });
  return Promise.resolve({ description: "Test description" });
});

mock.module("enquirer", () => ({ prompt: mockPrompt }));

const { IssueCreateCommand } = await import("@/commands/IssueCreateCommand");

describe("IssueCreateCommand", () => {
  let command: InstanceType<typeof IssueCreateCommand>;
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    command = new IssueCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `issue-create-${Date.now()}`);
    await Bun.write(join(testDir, "modules", "shared", "issues", ".gitkeep"), "");
    process.chdir(testDir);
    mockPrompt.mockClear();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("issue:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Create a YAML skeleton file for a new issue");
    });
  });

  describe("run() - non-interactive (default)", () => {
    test("should create YAML file without prompting for issue fields", async () => {
      await command.run({ title: "My Issue" });

      const files = await readdir(join(testDir, "modules", "shared", "issues"));
      const ymlFiles = files.filter((f) => f.endsWith(".yml"));
      expect(ymlFiles.length).toBe(1);

      const calls = mockPrompt.mock.calls as unknown as Array<[{ name: string }]>;
      const inputCalls = calls.filter((c) => ["title", "state", "priority", "description"].includes(c[0]?.name ?? ""));
      expect(inputCalls.length).toBe(0);
    });

    test("should write provided values to YAML", async () => {
      await command.run({ title: "My Issue", description: "My desc" });

      const files = await readdir(join(testDir, "modules", "shared", "issues"));
      const ymlFile = files.find((f) => f.endsWith(".yml")) ?? "";
      const content = await Bun.file(join(testDir, "modules", "shared", "issues", ymlFile)).text();

      expect(content).toMatch(/id: "[A-F]{3}-\d{6}"/);
      expect(content).toContain('module: "shared"');
      expect(content).toContain('title: "My Issue"');
      expect(content).toContain("description: |");
      expect(content).toContain("  My desc");
    });

    test("should use null for omitted title and description", async () => {
      await command.run({});

      const files = await readdir(join(testDir, "modules", "shared", "issues"));
      const ymlFile = files.find((f) => f.endsWith(".yml")) ?? "";
      const content = await Bun.file(join(testDir, "modules", "shared", "issues", ymlFile)).text();

      expect(content).toContain("title: null");
      expect(content).toContain("description: null");
    });

    test("should auto-generate id when not provided", async () => {
      await command.run({});

      const files = await readdir(join(testDir, "modules", "shared", "issues"));
      const ymlFiles = files.filter((f) => f.endsWith(".yml"));
      expect(ymlFiles.length).toBe(1);
      expect(ymlFiles[0]).toMatch(/^[A-F]{3}-\d{6}\.yml$/);
    });

    test("should end YAML content with newline", async () => {
      await command.run({ title: "Title" });

      const files = await readdir(join(testDir, "modules", "shared", "issues"));
      const ymlFile = files.find((f) => f.endsWith(".yml")) ?? "";
      const content = await Bun.file(join(testDir, "modules", "shared", "issues", ymlFile)).text();

      expect(content.endsWith("\n")).toBe(true);
    });

    test("should place file under module/issues/ when module is provided", async () => {
      await Bun.write(join(testDir, "modules", "my-module", "issues", ".gitkeep"), "");

      await command.run({ title: "Title", module: "my-module" });

      const files = await readdir(join(testDir, "modules", "my-module", "issues"));
      const ymlFiles = files.filter((f) => f.endsWith(".yml"));
      expect(ymlFiles.length).toBe(1);

      const content = await Bun.file(join(testDir, "modules", "my-module", "issues", ymlFiles[0] ?? "")).text();
      expect(content).toContain('module: "my-module"');
    });
  });

  describe("run() - interactive", () => {
    test("should prompt for title, state, priority, description, and labels", async () => {
      await command.run({ interactive: true });

      const calls = mockPrompt.mock.calls as unknown as Array<[{ name: string }]>;
      const inputCalls = calls.filter((c) =>
        ["title", "state", "priority", "description", "labels"].includes(c[0]?.name ?? ""),
      );
      expect(inputCalls.length).toBe(5);
    });

    test("should create YAML file using prompted values", async () => {
      await command.run({ interactive: true });

      const files = await readdir(join(testDir, "modules", "shared", "issues"));
      const ymlFiles = files.filter((f) => f.endsWith(".yml"));
      expect(ymlFiles.length).toBe(1);
    });

    test("should write prompted values to YAML", async () => {
      await command.run({ interactive: true });

      const files = await readdir(join(testDir, "modules", "shared", "issues"));
      const ymlFile = files.find((f) => f.endsWith(".yml")) ?? "";
      const content = await Bun.file(join(testDir, "modules", "shared", "issues", ymlFile)).text();

      expect(content).toContain('title: "Test Issue"');
      expect(content).toContain("description: |");
      expect(content).toContain("  Test description");
    });
  });
});
