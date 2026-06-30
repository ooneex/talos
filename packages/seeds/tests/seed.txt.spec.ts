import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatePath = join(import.meta.dir, "../src/seed.txt");

describe("seed.txt", () => {
  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{ name }}");
    expect(content).toContain("{{ dataFile }}");
  });

  test("should contain seed decorator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@decorator.seed()");
  });

  test("should implement ISeed interface", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("implements ISeed");
  });

  test("should have run method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("async run<T>(): Promise<T>");
  });

  test("should have isActive method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("isActive(): boolean");
  });

  test("should have getDependencies method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("async getDependencies(): Promise<SeedClassType[]>");
  });

  test("should import data from yml file", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import data from "./{{ dataFile }}.yml"');
  });

  test("should import decorator and types from @talosjs/seeds", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("@talosjs/seeds");
    expect(content).toContain("decorator");
    expect(content).toContain("ISeed");
    expect(content).toContain("SeedClassType");
  });

  test("should import Environment as a type from @talosjs/seeds", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("type Environment");
  });

  test("should have getEnv method", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("getEnv(): Environment[]");
  });
});
