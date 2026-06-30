import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { seedCreate } from "@/seedCreate";

describe("seedCreate", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `seed-create-${Date.now()}`);
    await Bun.write(join(testDir, "seeds", ".gitkeep"), "");
    await Bun.write(join(testDir, "tests", "seeds", ".gitkeep"), "");
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("should create seed file with correct name", async () => {
    await seedCreate({ name: "User" });

    const filePath = join(testDir, "seeds", "UserSeed.ts");
    expect(existsSync(filePath)).toBe(true);

    const content = await Bun.file(filePath).text();
    expect(content).toContain("UserSeed");
  });

  test("should create test file for seed", async () => {
    await seedCreate({ name: "User" });

    const testFilePath = join(testDir, "tests", "seeds", "UserSeed.spec.ts");
    expect(existsSync(testFilePath)).toBe(true);

    const content = await Bun.file(testFilePath).text();
    expect(content).toContain("UserSeed");
  });

  test("should return seed, test and data paths", async () => {
    const result = await seedCreate({ name: "User" });

    expect(result.seedPath).toBe(join("seeds", "UserSeed.ts"));
    expect(result.testPath).toBe(join("tests", "seeds", "UserSeed.spec.ts"));
    expect(result.dataPath).toBe(join("seeds", "user-seed.yml"));
  });

  test("should normalize name with toPascalCase", async () => {
    await seedCreate({ name: "user-role" });

    const filePath = join(testDir, "seeds", "UserRoleSeed.ts");
    expect(existsSync(filePath)).toBe(true);
  });

  test("should remove Seed suffix if provided", async () => {
    await seedCreate({ name: "UserSeed" });

    const filePath = join(testDir, "seeds", "UserSeed.ts");
    expect(existsSync(filePath)).toBe(true);

    const content = await Bun.file(filePath).text();
    expect(content).not.toContain("UserSeedSeed");
  });

  test("should handle lowercase input", async () => {
    await seedCreate({ name: "user" });

    const filePath = join(testDir, "seeds", "UserSeed.ts");
    expect(existsSync(filePath)).toBe(true);
  });

  test("should handle snake_case input", async () => {
    await seedCreate({ name: "user_role" });

    const filePath = join(testDir, "seeds", "UserRoleSeed.ts");
    expect(existsSync(filePath)).toBe(true);
  });

  test("should replace template placeholders correctly", async () => {
    await seedCreate({ name: "User" });

    const filePath = join(testDir, "seeds", "UserSeed.ts");
    const content = await Bun.file(filePath).text();

    expect(content).not.toContain("{{ name }}");
    expect(content).toContain("UserSeed");
  });

  test("should generate seeds root export file", async () => {
    await seedCreate({ name: "User" });

    const seedsFile = join(testDir, "seeds", "seeds.ts");
    expect(existsSync(seedsFile)).toBe(true);

    const content = await Bun.file(seedsFile).text();
    expect(content).toContain("export { UserSeed } from './UserSeed';");
  });

  test("should include all seeds in root export file", async () => {
    await seedCreate({ name: "User" });
    await seedCreate({ name: "Role" });

    const seedsFile = join(testDir, "seeds", "seeds.ts");
    const content = await Bun.file(seedsFile).text();
    expect(content).toContain("export { RoleSeed } from './RoleSeed';");
    expect(content).toContain("export { UserSeed } from './UserSeed';");
  });

  test("should sort exports in root export file", async () => {
    await seedCreate({ name: "User" });
    await seedCreate({ name: "Role" });

    const seedsFile = join(testDir, "seeds", "seeds.ts");
    const content = await Bun.file(seedsFile).text();
    const lines = content.trim().split("\n");
    expect(lines[0]).toContain("RoleSeed");
    expect(lines[1]).toContain("UserSeed");
  });

  test("should use custom seedsDir and testsDir", async () => {
    const customSeedsDir = join("custom", "seeds");
    const customTestsDir = join("custom", "tests");
    await Bun.write(join(testDir, customSeedsDir, ".gitkeep"), "");
    await Bun.write(join(testDir, customTestsDir, ".gitkeep"), "");

    const result = await seedCreate({
      name: "User",
      seedsDir: customSeedsDir,
      testsDir: customTestsDir,
    });

    expect(result.seedPath).toBe(join(customSeedsDir, "UserSeed.ts"));
    expect(result.testPath).toBe(join(customTestsDir, "UserSeed.spec.ts"));
    expect(existsSync(join(testDir, customSeedsDir, "UserSeed.ts"))).toBe(true);
    expect(existsSync(join(testDir, customTestsDir, "UserSeed.spec.ts"))).toBe(true);
  });

  test("should create yml data file with kebab-case name", async () => {
    await seedCreate({ name: "User" });

    const dataFilePath = join(testDir, "seeds", "user-seed.yml");
    expect(existsSync(dataFilePath)).toBe(true);
  });

  test("should create yml data file with correct kebab-case for multi-word name", async () => {
    await seedCreate({ name: "user-role" });

    const dataFilePath = join(testDir, "seeds", "user-role-seed.yml");
    expect(existsSync(dataFilePath)).toBe(true);
  });

  test("should import data from yml file in generated seed", async () => {
    await seedCreate({ name: "User" });

    const filePath = join(testDir, "seeds", "UserSeed.ts");
    const content = await Bun.file(filePath).text();
    expect(content).toContain('import data from "./user-seed.yml"');
  });

  test("should contain seed decorator in generated file", async () => {
    await seedCreate({ name: "User" });

    const filePath = join(testDir, "seeds", "UserSeed.ts");
    const content = await Bun.file(filePath).text();
    expect(content).toContain("@decorator.seed()");
  });

  test("should implement ISeed interface in generated file", async () => {
    await seedCreate({ name: "User" });

    const filePath = join(testDir, "seeds", "UserSeed.ts");
    const content = await Bun.file(filePath).text();
    expect(content).toContain("implements ISeed");
  });

  test("should have seed methods in generated file", async () => {
    await seedCreate({ name: "User" });

    const filePath = join(testDir, "seeds", "UserSeed.ts");
    const content = await Bun.file(filePath).text();
    expect(content).toContain("run");
    expect(content).toContain("isActive");
    expect(content).toContain("getDependencies");
    expect(content).toContain("getEnv");
  });

  test("should replace MODULE placeholder in generated test file", async () => {
    await seedCreate({ name: "User", module: "billing" });

    const testFilePath = join(testDir, "tests", "seeds", "UserSeed.spec.ts");
    const content = await Bun.file(testFilePath).text();
    expect(content).toContain("@module/billing/seeds/");
    expect(content).not.toContain("{{MODULE}}");
  });

  test("should use empty module when not provided in generated test file", async () => {
    await seedCreate({ name: "User" });

    const testFilePath = join(testDir, "tests", "seeds", "UserSeed.spec.ts");
    const content = await Bun.file(testFilePath).text();
    expect(content).toContain("@module//seeds/");
    expect(content).not.toContain("{{MODULE}}");
  });

  test("should have test imports in generated test file", async () => {
    await seedCreate({ name: "User" });

    const testFilePath = join(testDir, "tests", "seeds", "UserSeed.spec.ts");
    const content = await Bun.file(testFilePath).text();
    expect(content).toContain("describe");
    expect(content).toContain("expect");
    expect(content).toContain("test");
  });

  test("should test seed methods in generated test file", async () => {
    await seedCreate({ name: "User" });

    const testFilePath = join(testDir, "tests", "seeds", "UserSeed.spec.ts");
    const content = await Bun.file(testFilePath).text();
    expect(content).toContain("run");
    expect(content).toContain("isActive");
    expect(content).toContain("getDependencies");
  });
});
