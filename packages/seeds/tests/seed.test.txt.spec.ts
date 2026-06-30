import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const templatePath = join(import.meta.dir, "../src/seed.test.txt");

describe("seed.test.txt", () => {
  test("should exist", async () => {
    expect(await Bun.file(templatePath).exists()).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{DATA_FILE}}");
    expect(content).toContain("{{MODULE}}");
  });

  test("should contain test imports", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("describe");
    expect(content).toContain("expect");
    expect(content).toContain("test");
  });

  test("should import seed class from @module path", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@module/{{MODULE}}/seeds/{{NAME}}Seed");
  });

  test("should import lock yml as default import", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import {{MODULE}}Yml from "../../{{MODULE}}.yml"');
  });

  test("should test class name ends with Seed", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('endsWith("Seed")');
  });

  test("should test run method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("prototype.run");
  });

  test("should test isActive method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("prototype.isActive");
  });

  test("should test getDependencies method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("prototype.getDependencies");
  });

  test("should test getEnv method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("prototype.getEnv");
  });

  test("should check data yml file existence using Bun API", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{DATA_FILE}}.yml");
    expect(content).toContain("Bun.file");
    expect(content).toContain("dataFile.exists()");
    expect(content).not.toContain("existsSync");
  });

  test("should contain hash verification test", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("CryptoHasher");
    expect(content).toContain("lockedSeeds");
    expect(content).toContain("locked hash");
    expect(content).toContain("import.meta.dir");
  });
});
