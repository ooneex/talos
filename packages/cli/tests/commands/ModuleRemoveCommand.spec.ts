import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import moduleTemplate from "@/templates/module/module.txt";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test", confirm: true })),
}));

const { ModuleCreateCommand } = await import("@/commands/ModuleCreateCommand");
const { ModuleRemoveCommand } = await import("@/commands/ModuleRemoveCommand");
const { MicroserviceCreateCommand } = await import("@/commands/MicroserviceCreateCommand");

const exists = (path: string) => Bun.file(path).exists();
const read = (path: string) => Bun.file(path).text();

// Source files the mocked clone of the microservice repository exposes
const MICROSERVICE_INDEX_CONTENT = `import { App } from "@talosjs/app";
import { AppModule } from "./AppModule";
import { OnAppStart } from "./OnAppStart";

const app = new App({
  middlewares: AppModule.middlewares,
  cronJobs: AppModule.cronJobs,
  onStart: OnAppStart,
});

await app.run();
`;
const MICROSERVICE_ON_APP_START_CONTENT = `import { decorator, type IAppEventStart } from "@talosjs/app";
import type { Server } from "bun";

@decorator.app.event.start()
export class OnAppStart implements IAppEventStart {
  public handle(_server: Server<unknown>): void | Promise<void> {}
}
`;
const MICROSERVICE_DOCKERFILE_CONTENT = `# {{NAME}} backend
# docker build -f modules/app/Dockerfile --target production -t {{NAME}}:latest .
COPY modules/app/ ./modules/app/
`;

describe("ModuleRemoveCommand", () => {
  let makeCommand: InstanceType<typeof ModuleCreateCommand>;
  let removeCommand: InstanceType<typeof ModuleRemoveCommand>;
  let makeMicroservice: InstanceType<typeof MicroserviceCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;
  let originalWhich: typeof Bun.which;

  beforeEach(() => {
    makeCommand = new ModuleCreateCommand();
    removeCommand = new ModuleRemoveCommand();
    makeMicroservice = new MicroserviceCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `remove-module-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    // Pretend `git` is installed so tests never depend on the host PATH.
    originalWhich = Bun.which;
    Bun.which = (() => "/usr/bin/git") as typeof Bun.which;

    // Stub Bun.spawn so "git clone" materializes a fake repository and "bun add" is a no-op
    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = args[0] as string[];

      if (cmd[0] === "git" && cmd[1] === "clone") {
        const dest = cmd[cmd.length - 1] as string;
        const templateDir = join(dest, "modules", "microservice");
        mkdirSync(join(templateDir, "src"), { recursive: true });
        writeFileSync(join(dest, ".env.example.yml"), "app:\n  env: local\nport: 3000\n");
        writeFileSync(join(templateDir, "src", "index.ts"), MICROSERVICE_INDEX_CONTENT);
        writeFileSync(join(templateDir, "src", "OnAppStart.ts"), MICROSERVICE_ON_APP_START_CONTENT);
        writeFileSync(join(templateDir, "Dockerfile"), MICROSERVICE_DOCKERFILE_CONTENT);
        writeFileSync(join(templateDir, "roles.yml"), "roles:\n  GUEST: ROLE_GUEST\nhierarchy:\n  ROLE_GUEST: {}\n");
        writeFileSync(join(templateDir, "tsconfig.json"), '{"extends": "../../tsconfig.json"}');
        writeFileSync(
          join(templateDir, "package.json"),
          JSON.stringify({ name: "@module/microservice", dependencies: {}, devDependencies: {} }),
        );
      }

      return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    Bun.which = originalWhich;
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(removeCommand.getName()).toBe("module:remove");
    });

    test("should return correct description", () => {
      expect(removeCommand.getDescription()).toBe("Remove an existing module");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, ".gitkeep"), "");
    });

    test("should remove module directory", async () => {
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "blog", "package.json"))).toBe(true);

      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "blog", "package.json"))).toBe(false);
    });

    test("should not fail when module does not exist", async () => {
      await removeCommand.run({ name: "NonExistent", cwd: testDir, silent: true });
    });

    test("should not remove app module", async () => {
      await makeCommand.run({ name: "App", cwd: testDir, silent: true });

      await removeCommand.run({ name: "App", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "app", "package.json"))).toBe(true);
    });

    test("should not remove shared module", async () => {
      await makeCommand.run({ name: "Shared", cwd: testDir, silent: true });

      await removeCommand.run({ name: "Shared", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "shared", "package.json"))).toBe(true);
    });

    test("should normalize name to kebab-case", async () => {
      await makeCommand.run({ name: "UserProfile", cwd: testDir, silent: true });

      await removeCommand.run({ name: "UserProfile", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "user-profile", "package.json"))).toBe(false);
    });

    test("should handle Module suffix in name", async () => {
      await makeCommand.run({ name: "BlogModule", cwd: testDir, silent: true });

      await removeCommand.run({ name: "BlogModule", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "blog", "package.json"))).toBe(false);
    });
  });

  describe("AppModule integration", () => {
    beforeEach(async () => {
      const appModuleContent = moduleTemplate.replace(/{{NAME}}/g, "App");
      await Bun.write(join(testDir, "modules", "app", "src", "AppModule.ts"), appModuleContent);
      await Bun.write(join(testDir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }, null, 2));
    });

    test("should remove import and spreads from AppModule", async () => {
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "app", "src", "AppModule.ts")).text();
      expect(content).not.toContain("BlogModule");
      expect(content).not.toContain("@module/blog");
    });

    test("should remove path alias from root tsconfig", async () => {
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "tsconfig.json")).text();
      const tsconfig = JSON.parse(content);
      expect(tsconfig.compilerOptions.paths?.["@module/blog/*"]).toBeUndefined();
    });

    test("should preserve other modules when removing one", async () => {
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Shop", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "app", "src", "AppModule.ts")).text();
      expect(content).not.toContain("BlogModule");
      expect(content).toContain('import { ShopModule } from "@module/shop/ShopModule"');
      expect(content).toContain("...ShopModule.controllers");
      expect(content).toContain("...ShopModule.middlewares");
      expect(content).toContain("...ShopModule.cronJobs");
      expect(content).toContain("...ShopModule.events");
    });

    test("should preserve other path aliases when removing one", async () => {
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Shop", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "tsconfig.json")).text();
      const tsconfig = JSON.parse(content);
      expect(tsconfig.compilerOptions.paths?.["@module/blog/*"]).toBeUndefined();
      expect(tsconfig.compilerOptions.paths["@module/shop/*"]).toEqual(["./modules/shop/src/*"]);
    });
  });

  describe("SharedModule integration", () => {
    beforeEach(async () => {
      const appModuleContent = moduleTemplate.replace(/{{NAME}}/g, "App");
      await Bun.write(join(testDir, "modules", "app", "src", "AppModule.ts"), appModuleContent);
      await Bun.write(join(testDir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }, null, 2));
    });

    test("should remove entities from SharedModule", async () => {
      await makeCommand.run({ name: "Shared", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).not.toContain("BlogModule");
      expect(content).not.toContain("@module/blog");
    });

    test("should preserve other module entities in SharedModule", async () => {
      await makeCommand.run({ name: "Shared", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Shop", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).not.toContain("BlogModule");
      expect(content).toContain('import { ShopModule } from "@module/shop/ShopModule"');
      expect(content).toContain("...ShopModule.entities");
    });
  });

  describe("app.yml integration", () => {
    test("should remove the microservice declaration when removing a microservice", async () => {
      await Bun.write(join(testDir, "modules", "app", "app.yml"), 'name: app\ntype: "api"\n');

      await makeMicroservice.run({ name: "Billing", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "app.yml"));
      expect(content).not.toContain('- name: "billing"');
      expect(content).not.toContain("MICROSERVICE_BILLING_URL");
    });

    test("should preserve other microservices when removing one", async () => {
      await Bun.write(join(testDir, "modules", "app", "app.yml"), 'name: app\ntype: "api"\n');

      await makeMicroservice.run({ name: "Billing", cwd: testDir, silent: true });
      await makeMicroservice.run({ name: "Shipping", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "app.yml"));
      expect(content).not.toContain('- name: "billing"');
      expect(content).toContain('- name: "shipping"');
      expect(content).toContain("MICROSERVICE_SHIPPING_URL");
    });

    test("should leave app.yml untouched when removing a regular module", async () => {
      await Bun.write(join(testDir, "modules", "app", "app.yml"), 'name: app\ntype: "api"\n');

      await makeMicroservice.run({ name: "Billing", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Blog", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Blog", cwd: testDir, silent: true });

      // Removing the plain module must not touch the microservice declaration
      const content = await read(join(testDir, "modules", "app", "app.yml"));
      expect(content).toContain('- name: "billing"');
      expect(content).toContain("MICROSERVICE_BILLING_URL");
    });
  });
});
