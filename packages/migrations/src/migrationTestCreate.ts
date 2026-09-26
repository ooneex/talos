import { join } from "node:path";

const migrationTestTemplate = `import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { {{NAME}} } from "@module/{{MODULE}}/migrations/{{NAME}}";
import {{MODULE}}Yml from "../../{{MODULE}}.yml";

describe("{{NAME}}", () => {
  test("should have class name starting with 'Migration'", () => {
    expect({{NAME}}.name.startsWith("Migration")).toBe(true);
  });

  test("should have 'up' method", () => {
    expect({{NAME}}.prototype.up).toBeDefined();
    expect(typeof {{NAME}}.prototype.up).toBe("function");
  });

  test("should have 'down' method", () => {
    expect({{NAME}}.prototype.down).toBeDefined();
    expect(typeof {{NAME}}.prototype.down).toBe("function");
  });

  test("should have 'getVersion' method", () => {
    expect({{NAME}}.prototype.getVersion).toBeDefined();
    expect(typeof {{NAME}}.prototype.getVersion).toBe("function");
  });

  test("should have 'getDependencies' method", () => {
    expect({{NAME}}.prototype.getDependencies).toBeDefined();
    expect(typeof {{NAME}}.prototype.getDependencies).toBe("function");
  });

  test("should match the locked hash in {{MODULE}}.yml", async () => {
    const content = await Bun.file(join(import.meta.dir, "../../src/migrations/{{NAME}}.ts")).text();
    const actualHash = new Bun.CryptoHasher("sha256").update(content).digest("hex");

    const lockedMigrations = {{MODULE}}Yml.migrations as Record<string, { hash: string }>;
    const lockedHash = lockedMigrations.{{NAME}}?.hash;
    expect(lockedHash).toBeDefined();
    expect(actualHash).toBe(lockedHash as string);
  });
});
`;

export const migrationTestCreate = async (config: {
  name: string;
  testsDir: string;
  module?: string;
}): Promise<string> => {
  const { name, testsDir, module } = config;
  const testPath = join(process.cwd(), testsDir, `${name}.spec.ts`);

  const testFile = Bun.file(testPath);
  if (await testFile.exists()) return testPath;

  const content = migrationTestTemplate.replace(/\{\{NAME\}\}/g, name).replace(/\{\{MODULE\}\}/g, module ?? "");
  await Bun.write(testPath, content);

  return testPath;
};
