import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer so the select prompt resolves deterministically
const promptMock = mock(() => Promise.resolve({ destination: "payment" }));
mock.module("enquirer", () => ({ prompt: promptMock }));

const { askDestinationModule, findDestinationModules } = await import("@/prompts/askDestinationModule");

const writeModuleYml = (testDir: string, name: string, type: string) =>
  Bun.write(join(testDir, "modules", name, `${name}.yml`), `type: "${type}"\n`);

describe("askDestinationModule", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(process.cwd(), ".temp", `destination-${Date.now()}`);
    promptMock.mockClear();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("findDestinationModules", () => {
    test("should return only api and microservice modules", async () => {
      await writeModuleYml(testDir, "app", "api");
      await writeModuleYml(testDir, "payment", "microservice");
      await writeModuleYml(testDir, "blog", "module");
      await writeModuleYml(testDir, "shared", "module");

      const result = await findDestinationModules(testDir);
      expect(result).toEqual(["app", "payment"]);
    });

    test("should ignore modules without a yml file", async () => {
      await writeModuleYml(testDir, "app", "api");
      await Bun.write(join(testDir, "modules", "ghost", "src", "GhostModule.ts"), "");

      const result = await findDestinationModules(testDir);
      expect(result).toEqual(["app"]);
    });

    test("should return an empty array when modules directory is missing", async () => {
      const result = await findDestinationModules(testDir);
      expect(result).toEqual([]);
    });
  });

  describe("askDestinationModule", () => {
    test("should fall back to app without prompting when nothing matches", async () => {
      const result = await askDestinationModule({ cwd: testDir });

      expect(result).toBe("app");
      expect(promptMock).not.toHaveBeenCalled();
    });

    test("should prompt and return the selected destination", async () => {
      await writeModuleYml(testDir, "app", "api");
      await writeModuleYml(testDir, "payment", "microservice");

      const result = await askDestinationModule({ cwd: testDir });

      expect(result).toBe("payment");
      expect(promptMock).toHaveBeenCalledTimes(1);
    });
  });
});
