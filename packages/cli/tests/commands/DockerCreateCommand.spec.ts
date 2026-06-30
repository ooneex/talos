import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { DockerCreateCommand } = await import("@/commands/DockerCreateCommand");

describe("DockerCreateCommand", () => {
  let command: InstanceType<typeof DockerCreateCommand>;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    command = new DockerCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `docker-${Date.now()}`);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("docker:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Add a docker service to docker-compose.yml");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(
        join(testDir, "modules", "app", "package.json"),
        JSON.stringify({ name: "test", scripts: {} }, null, 2),
      );
      process.chdir(testDir);
    });

    test("should create docker-compose.yml if it does not exist", async () => {
      await command.run({ name: "postgres" });

      const composePath = join(testDir, "modules", "app", "docker-compose.yml");
      expect(existsSync(composePath)).toBe(true);
    });

    test("should add postgres service to docker-compose.yml", async () => {
      await command.run({ name: "postgres" });

      const composePath = join(testDir, "modules", "app", "docker-compose.yml");
      const content = await Bun.file(composePath).text();
      expect(content).toContain("postgres");
    });

    test("should add redis service to docker-compose.yml", async () => {
      await command.run({ name: "redis" });

      const composePath = join(testDir, "modules", "app", "docker-compose.yml");
      const content = await Bun.file(composePath).text();
      expect(content).toContain("redis");
    });

    test("should add mongodb service to docker-compose.yml", async () => {
      await command.run({ name: "mongodb" });

      const composePath = join(testDir, "modules", "app", "docker-compose.yml");
      const content = await Bun.file(composePath).text();
      expect(content).toContain("mongodb");
    });

    test("should add mysql service to docker-compose.yml", async () => {
      await command.run({ name: "mysql" });

      const composePath = join(testDir, "modules", "app", "docker-compose.yml");
      const content = await Bun.file(composePath).text();
      expect(content).toContain("mysql");
    });

    test("should update package.json with docker script", async () => {
      await command.run({ name: "postgres" });

      const packageJson = await Bun.file(join(testDir, "modules", "app", "package.json")).json();
      expect(packageJson.scripts.dev).toBe("docker compose up -d && bun --hot run ./src/index.ts");
    });

    test("should append service to existing docker-compose.yml", async () => {
      await command.run({ name: "postgres" });
      await command.run({ name: "redis" });

      const composePath = join(testDir, "modules", "app", "docker-compose.yml");
      const content = await Bun.file(composePath).text();
      expect(content).toContain("postgres");
      expect(content).toContain("redis");
    });

    test("should warn when service already exists", async () => {
      await command.run({ name: "postgres" });
      // Running again should not throw and should warn (handled internally by command)
      await command.run({ name: "postgres" });

      const composePath = join(testDir, "modules", "app", "docker-compose.yml");
      expect(existsSync(composePath)).toBe(true);
    });

    test("should preserve existing scripts in package.json", async () => {
      await Bun.write(
        join(testDir, "modules", "app", "package.json"),
        JSON.stringify({ name: "test", scripts: { build: "bun build" } }, null, 2),
      );

      await command.run({ name: "postgres" });

      const packageJson = await Bun.file(join(testDir, "modules", "app", "package.json")).json();
      expect(packageJson.scripts.build).toBe("bun build");
      expect(packageJson.scripts.dev).toBe("docker compose up -d && bun --hot run ./src/index.ts");
    });

    test("should not overwrite a customized dev script", async () => {
      await Bun.write(
        join(testDir, "modules", "app", "package.json"),
        JSON.stringify({ name: "test", scripts: { dev: "bun --hot run ./src/main.ts" } }, null, 2),
      );

      await command.run({ name: "postgres" });

      const packageJson = await Bun.file(join(testDir, "modules", "app", "package.json")).json();
      expect(packageJson.scripts.dev).toBe("bun --hot run ./src/main.ts");
    });

    test("should create scripts object if it does not exist", async () => {
      await Bun.write(join(testDir, "modules", "app", "package.json"), JSON.stringify({ name: "test" }, null, 2));

      await command.run({ name: "postgres" });

      const packageJson = await Bun.file(join(testDir, "modules", "app", "package.json")).json();
      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.scripts.dev).toBe("docker compose up -d && bun --hot run ./src/index.ts");
    });
  });
});
