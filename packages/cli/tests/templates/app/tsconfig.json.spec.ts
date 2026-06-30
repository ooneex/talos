import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("tsconfig.json.txt", () => {
  const templatePath = join(templatesDir, "app", "tsconfig.json.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should be valid JSON", async () => {
    const content = await Bun.file(templatePath).text();
    const config = JSON.parse(content);
    expect(config).toBeDefined();
    expect(config.compilerOptions).toBeDefined();
  });

  test("should have correct compiler options", async () => {
    const content = await Bun.file(templatePath).text();
    const opts = JSON.parse(content).compilerOptions;

    expect(opts.jsx).toBe("react-jsx");
    expect(opts.lib).toEqual(["ES2022", "DOM", "DOM.Iterable"]);
    expect(opts.target).toBe("ES2022");
    expect(opts.module).toBe("ESNext");
    expect(opts.moduleDetection).toBe("force");
    expect(opts.allowJs).toBe(true);
    expect(opts.moduleResolution).toBe("bundler");
    expect(opts.allowImportingTsExtensions).toBe(true);
    expect(opts.verbatimModuleSyntax).toBe(true);
    expect(opts.noEmit).toBe(true);
  });

  test("should enable decorators", async () => {
    const content = await Bun.file(templatePath).text();
    const opts = JSON.parse(content).compilerOptions;

    expect(opts.emitDecoratorMetadata).toBe(true);
    expect(opts.experimentalDecorators).toBe(true);
  });

  test("should disable specific strict options", async () => {
    const content = await Bun.file(templatePath).text();
    const opts = JSON.parse(content).compilerOptions;

    expect(opts.noPropertyAccessFromIndexSignature).toBe(false);
    expect(opts.strictPropertyInitialization).toBe(false);
  });

  test("should have correct paths mappings", async () => {
    const content = await Bun.file(templatePath).text();
    const opts = JSON.parse(content).compilerOptions;

    expect(opts.paths).toEqual({
      "@module/app/*": ["./modules/app/src/*"],
      "@module/shared/*": ["./modules/shared/src/*"],
    });
  });

  test("should have bun types", async () => {
    const content = await Bun.file(templatePath).text();
    const opts = JSON.parse(content).compilerOptions;

    expect(opts.types).toEqual(["bun"]);
  });

  test("should have correct include paths", async () => {
    const content = await Bun.file(templatePath).text();
    const config = JSON.parse(content);

    expect(config.include).toEqual(["**/*.ts", "**/*.tsx"]);
  });

  test("should have correct exclude paths", async () => {
    const content = await Bun.file(templatePath).text();
    const config = JSON.parse(content);

    expect(config.exclude).toEqual(["node_modules", ".github", ".husky", ".nx", ".zed", ".vscode"]);
  });
});
