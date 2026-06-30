import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { VectorDatabaseCreateCommand } = await import("@/commands/VectorDatabaseCreateCommand");

describe("VectorDatabaseCreateCommand", () => {
  let command: InstanceType<typeof VectorDatabaseCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new VectorDatabaseCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `vector-database-${Date.now()}`);

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
      expect(command.getName()).toBe("vector-database:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new vector database class");
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
      const filePath = join(testDir, "modules", "shared", "src", "databases", "EmbeddingsVectorDatabase.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Embeddings", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("Embeddings");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "databases", "EmbeddingsVectorDatabase.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Embeddings" });

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

    test("should generate vector database file with correct name", async () => {
      await command.run({ name: "Knowledge" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "KnowledgeVectorDatabase.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("KnowledgeVectorDatabase");
    });

    test("should generate test file for vector database", async () => {
      await command.run({ name: "Knowledge" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "databases", "KnowledgeVectorDatabase.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("KnowledgeVectorDatabase");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "my-knowledge" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "MyKnowledgeVectorDatabase.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should remove VectorDatabase suffix if provided", async () => {
      await command.run({ name: "KnowledgeVectorDatabase" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "KnowledgeVectorDatabase.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("KnowledgeVectorDatabaseVectorDatabase");
    });

    test("should remove Database suffix if provided", async () => {
      await command.run({ name: "KnowledgeDatabase" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "KnowledgeVectorDatabase.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("KnowledgeDatabaseVectorDatabase");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "product" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "ProductVectorDatabase.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "knowledge_base" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "KnowledgeBaseVectorDatabase.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "Document" });

      const filePath = join(testDir, "modules", "shared", "src", "databases", "DocumentVectorDatabase.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).toContain("Document");
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "databases", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "databases", ".gitkeep"), "");

      await command.run({ name: "Knowledge", module: "user-profile" });

      const testFilePath = join(
        testDir,
        "modules",
        "user-profile",
        "tests",
        "databases",
        "KnowledgeVectorDatabase.spec.ts",
      );
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/databases/KnowledgeVectorDatabase");
    });
  });
});
