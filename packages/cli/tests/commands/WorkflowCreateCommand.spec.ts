import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { WorkflowCreateCommand } = await import("@/commands/WorkflowCreateCommand");

describe("WorkflowCreateCommand", () => {
  let command: InstanceType<typeof WorkflowCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new WorkflowCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `workflow-${Date.now()}`);

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
      expect(command.getName()).toBe("workflow:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new workflow class");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "workflows", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "workflows", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate workflow file with the Workflow suffix", async () => {
      await command.run({ name: "OrderProcessing" });

      const filePath = join(testDir, "modules", "shared", "src", "workflows", "OrderProcessingWorkflow.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("class OrderProcessingWorkflow extends Workflow");
      expect(content).not.toContain("{{NAME}}");
    });

    test("should set the workflow name to the kebab-case of the class name", async () => {
      await command.run({ name: "OrderProcessing" });

      const filePath = join(testDir, "modules", "shared", "src", "workflows", "OrderProcessingWorkflow.ts");
      const content = await Bun.file(filePath).text();
      expect(content).toContain('getName = (): string => "order-processing"');
      expect(content).not.toContain("{{KEBAB}}");
    });

    test("should generate a test file for the workflow", async () => {
      await command.run({ name: "OrderProcessing" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "workflows", "OrderProcessingWorkflow.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("@module/shared/workflows/OrderProcessingWorkflow");
    });
  });
});
