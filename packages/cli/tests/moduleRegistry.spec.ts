import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  addPathAlias,
  addToAppModule,
  addToMicroserviceModule,
  addToSharedModule,
  removePathAlias,
} from "@/moduleRegistry";
import moduleTemplate from "@/templates/module/module.txt";

describe("moduleRegistry", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(process.cwd(), ".temp", `registry-${Date.now()}`);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("addToMicroserviceModule", () => {
    let microserviceModulePath: string;

    beforeEach(async () => {
      microserviceModulePath = join(testDir, "modules", "payment", "src", "PaymentModule.ts");
      await Bun.write(microserviceModulePath, moduleTemplate.replace(/{{NAME}}/g, "Payment"));
    });

    test("should add the import for the registered module", async () => {
      await addToMicroserviceModule(microserviceModulePath, "Blog", "blog");

      const content = await Bun.file(microserviceModulePath).text();
      expect(content).toContain('import { BlogModule } from "@module/blog/BlogModule"');
    });

    test("should spread every field including entities", async () => {
      await addToMicroserviceModule(microserviceModulePath, "Blog", "blog");

      const content = await Bun.file(microserviceModulePath).text();
      expect(content).toContain("...BlogModule.controllers");
      expect(content).toContain("...BlogModule.entities");
      expect(content).toContain("...BlogModule.middlewares");
      expect(content).toContain("...BlogModule.cronJobs");
      expect(content).toContain("...BlogModule.events");
    });

    test("should accumulate multiple modules", async () => {
      await addToMicroserviceModule(microserviceModulePath, "Blog", "blog");
      await addToMicroserviceModule(microserviceModulePath, "Shop", "shop");

      const content = await Bun.file(microserviceModulePath).text();
      expect(content).toContain('import { BlogModule } from "@module/blog/BlogModule"');
      expect(content).toContain('import { ShopModule } from "@module/shop/ShopModule"');
      expect(content).toContain("...BlogModule.entities");
      expect(content).toContain("...ShopModule.entities");
    });

    test("should register entities unlike addToAppModule", async () => {
      const appModulePath = join(testDir, "modules", "app", "src", "AppModule.ts");
      await Bun.write(appModulePath, moduleTemplate.replace(/{{NAME}}/g, "App"));

      await addToAppModule(appModulePath, "Blog", "blog");
      await addToMicroserviceModule(microserviceModulePath, "Blog", "blog");

      const appContent = await Bun.file(appModulePath).text();
      const microserviceContent = await Bun.file(microserviceModulePath).text();
      expect(appContent).not.toContain("...BlogModule.entities");
      expect(microserviceContent).toContain("...BlogModule.entities");
    });
  });

  describe("addToSharedModule", () => {
    test("should spread only entities", async () => {
      const sharedModulePath = join(testDir, "modules", "shared", "src", "SharedModule.ts");
      await Bun.write(sharedModulePath, moduleTemplate.replace(/{{NAME}}/g, "Shared"));

      await addToSharedModule(sharedModulePath, "Blog", "blog");

      const content = await Bun.file(sharedModulePath).text();
      expect(content).toContain("...BlogModule.entities");
      expect(content).not.toContain("...BlogModule.controllers");
    });
  });

  describe("addPathAlias", () => {
    let tsconfigPath: string;

    beforeEach(() => {
      tsconfigPath = join(testDir, "tsconfig.json");
    });

    test("should add the module path mapping", async () => {
      await Bun.write(tsconfigPath, `${JSON.stringify({ compilerOptions: { strict: true } }, null, 2)}\n`);

      await addPathAlias(tsconfigPath, "blog");

      const tsconfig = await Bun.file(tsconfigPath).json();
      expect(tsconfig.compilerOptions.paths["@module/blog/*"]).toEqual(["./modules/blog/src/*"]);
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    test("should create compilerOptions and paths when absent", async () => {
      await Bun.write(tsconfigPath, `${JSON.stringify({}, null, 2)}\n`);

      await addPathAlias(tsconfigPath, "blog");

      const tsconfig = await Bun.file(tsconfigPath).json();
      expect(tsconfig.compilerOptions.paths["@module/blog/*"]).toEqual(["./modules/blog/src/*"]);
    });

    test("should preserve existing path mappings", async () => {
      await Bun.write(
        tsconfigPath,
        `${JSON.stringify({ compilerOptions: { paths: { "@module/shop/*": ["./modules/shop/src/*"] } } }, null, 2)}\n`,
      );

      await addPathAlias(tsconfigPath, "blog");

      const tsconfig = await Bun.file(tsconfigPath).json();
      expect(tsconfig.compilerOptions.paths["@module/shop/*"]).toEqual(["./modules/shop/src/*"]);
      expect(tsconfig.compilerOptions.paths["@module/blog/*"]).toEqual(["./modules/blog/src/*"]);
    });
  });

  describe("removePathAlias", () => {
    let tsconfigPath: string;

    beforeEach(() => {
      tsconfigPath = join(testDir, "tsconfig.json");
    });

    test("should remove only the targeted module path mapping", async () => {
      await Bun.write(
        tsconfigPath,
        `${JSON.stringify(
          {
            compilerOptions: {
              paths: { "@module/blog/*": ["./modules/blog/src/*"], "@module/shop/*": ["./modules/shop/src/*"] },
            },
          },
          null,
          2,
        )}\n`,
      );

      await removePathAlias(tsconfigPath, "blog");

      const tsconfig = await Bun.file(tsconfigPath).json();
      expect(tsconfig.compilerOptions.paths["@module/blog/*"]).toBeUndefined();
      expect(tsconfig.compilerOptions.paths["@module/shop/*"]).toEqual(["./modules/shop/src/*"]);
    });

    test("should be a no-op when the tsconfig does not exist", async () => {
      await expect(removePathAlias(tsconfigPath, "blog")).resolves.toBeUndefined();
      expect(await Bun.file(tsconfigPath).exists()).toBe(false);
    });
  });
});
