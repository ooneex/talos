import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { migrationTestCreate } from "@/migrationTestCreate";

describe("migrationTestCreate", () => {
  let testDir: string;
  let originalCwd: string;
  let sequence = 0;

  beforeEach(() => {
    originalCwd = process.cwd();
    sequence += 1;
    testDir = join(originalCwd, ".temp", `migration-test-create-${sequence}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("should write a spec that substitutes the migration name and module", async () => {
    const name = "Migration20260926081000000";
    const testPath = await migrationTestCreate({
      name,
      testsDir: "tests/migrations",
      module: "billing",
    });

    expect(testPath).toBe(join(testDir, "tests/migrations", `${name}.spec.ts`));

    const content = await Bun.file(testPath).text();
    expect(content).not.toContain("{{NAME}}");
    expect(content).not.toContain("{{MODULE}}");
    expect(content).toContain(`import { ${name} } from "@module/billing/migrations/${name}"`);
    expect(content).toContain('import billingYml from "../../billing.yml"');
    expect(content).toContain(`describe("${name}", () => {`);
    expect(content).toContain(`lockedMigrations.${name}?.hash`);
    expect(content).toContain("prototype.up");
    expect(content).toContain("prototype.down");
    expect(content).toContain("prototype.getVersion");
    expect(content).toContain("prototype.getDependencies");
    expect(content).toContain('startsWith("Migration")');
  });

  test("should leave the module segment empty when module is omitted", async () => {
    const name = "Migration20260926081000001";
    const testPath = await migrationTestCreate({
      name,
      testsDir: "tests/migrations",
    });

    const content = await Bun.file(testPath).text();
    expect(content).toContain(`from "@module//migrations/${name}"`);
    expect(content).toContain('import Yml from "../../.yml"');
    expect(content).toContain(`lockedMigrations.${name}?.hash`);
  });

  test("should keep an existing spec and return its path", async () => {
    const relativePath = join("tests/migrations", "MigrationKeep.spec.ts");
    const existing = "export const kept = true;\n";
    await Bun.write(join(testDir, relativePath), existing);

    const testPath = await migrationTestCreate({
      name: "MigrationKeep",
      testsDir: "tests/migrations",
      module: "billing",
    });

    expect(testPath).toBe(join(testDir, relativePath));
    expect(await Bun.file(testPath).text()).toBe(existing);
  });
});
