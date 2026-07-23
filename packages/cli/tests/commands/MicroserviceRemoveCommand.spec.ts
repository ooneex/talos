import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import moduleTemplate from "@/templates/module/module.txt";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test", confirm: true })),
}));

const { MicroserviceCreateCommand } = await import("@/commands/MicroserviceCreateCommand");
const { MicroserviceRemoveCommand } = await import("@/commands/MicroserviceRemoveCommand");

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

describe("MicroserviceRemoveCommand", () => {
  let makeCommand: InstanceType<typeof MicroserviceCreateCommand>;
  let removeCommand: InstanceType<typeof MicroserviceRemoveCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;
  let originalWhich: typeof Bun.which;

  beforeEach(() => {
    makeCommand = new MicroserviceCreateCommand();
    removeCommand = new MicroserviceRemoveCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `remove-microservice-${Date.now()}-${Math.random().toString(36).slice(2)}`);

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
      expect(removeCommand.getName()).toBe("microservice:remove");
    });

    test("should return correct description", () => {
      expect(removeCommand.getDescription()).toBe("Remove an existing microservice");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, ".gitkeep"), "");
    });

    test("should remove microservice directory", async () => {
      await makeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "billing", "package.json"))).toBe(true);

      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "billing", "package.json"))).toBe(false);
    });

    test("should not fail when microservice does not exist", async () => {
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
      await makeCommand.run({ name: "PaymentGateway", cwd: testDir, silent: true });

      await removeCommand.run({ name: "PaymentGateway", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "payment-gateway", "package.json"))).toBe(false);
    });

    test("should handle Module suffix in name", async () => {
      await makeCommand.run({ name: "BillingModule", cwd: testDir, silent: true });

      await removeCommand.run({ name: "BillingModule", cwd: testDir, silent: true });
      expect(await exists(join(testDir, "modules", "billing", "package.json"))).toBe(false);
    });
  });

  describe("AppModule integration", () => {
    beforeEach(async () => {
      const appModuleContent = moduleTemplate.replace(/{{NAME}}/g, "App");
      await Bun.write(join(testDir, "modules", "app", "src", "AppModule.ts"), appModuleContent);
      await Bun.write(join(testDir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }, null, 2));
    });

    test("should remove import and spreads from AppModule", async () => {
      await makeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "src", "AppModule.ts"));
      expect(content).not.toContain("BillingModule");
      expect(content).not.toContain("@module/billing");
    });

    test("should remove path alias from root tsconfig", async () => {
      await makeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      const tsconfig = JSON.parse(await read(join(testDir, "tsconfig.json")));
      expect(tsconfig.compilerOptions.paths?.["@module/billing/*"]).toBeUndefined();
    });

    test("should leave AppModule untouched when removing a microservice", async () => {
      await makeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Shipping", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      // Microservices are never registered into AppModule, so neither should appear
      const content = await read(join(testDir, "modules", "app", "src", "AppModule.ts"));
      expect(content).not.toContain("BillingModule");
      expect(content).not.toContain("ShippingModule");
    });

    test("should preserve other path aliases when removing one", async () => {
      await makeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Shipping", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      const tsconfig = JSON.parse(await read(join(testDir, "tsconfig.json")));
      expect(tsconfig.compilerOptions.paths?.["@module/billing/*"]).toBeUndefined();
      expect(tsconfig.compilerOptions.paths["@module/shipping/*"]).toEqual(["./modules/shipping/src/*"]);
    });
  });

  describe("SharedModule integration", () => {
    beforeEach(async () => {
      const sharedModuleContent = moduleTemplate.replace(/{{NAME}}/g, "Shared");
      await Bun.write(join(testDir, "modules", "shared", "src", "SharedModule.ts"), sharedModuleContent);
      await Bun.write(join(testDir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }, null, 2));
    });

    test("should remove entities from SharedModule", async () => {
      await makeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "shared", "src", "SharedModule.ts"));
      expect(content).not.toContain("BillingModule");
      expect(content).not.toContain("@module/billing");
    });

    test("should leave SharedModule untouched when removing a microservice", async () => {
      await makeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Shipping", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      // Microservices are never registered into SharedModule, so neither should appear
      const content = await read(join(testDir, "modules", "shared", "src", "SharedModule.ts"));
      expect(content).not.toContain("BillingModule");
      expect(content).not.toContain("ShippingModule");
    });
  });

  describe("app.yml integration", () => {
    test("should remove the microservice declaration", async () => {
      await Bun.write(join(testDir, "modules", "app", "app.yml"), 'name: app\ntype: "api"\n');

      await makeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "app.yml"));
      expect(content).not.toContain('- name: "billing"');
      expect(content).not.toContain("MICROSERVICE_BILLING_URL");
    });

    test("should preserve other microservices when removing one", async () => {
      await Bun.write(join(testDir, "modules", "app", "app.yml"), 'name: app\ntype: "api"\n');

      await makeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Shipping", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "app.yml"));
      expect(content).not.toContain('- name: "billing"');
      expect(content).toContain('- name: "shipping"');
      expect(content).toContain("MICROSERVICE_SHIPPING_URL");
    });
  });

  describe(".env.yml integration", () => {
    test("should remove the microservice entry", async () => {
      await Bun.write(join(testDir, ".env.yml"), 'app:\n  url: ""\n\nmicroservices:\n  billing:\n    url: ""\n');

      await makeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, ".env.yml"));
      expect(content).not.toContain("  billing:");
    });

    test("should preserve other microservice entries when removing one", async () => {
      await Bun.write(
        join(testDir, ".env.yml"),
        'app:\n  url: ""\n\nmicroservices:\n  billing:\n    url: ""\n  shipping:\n    url: ""\n',
      );

      await makeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Shipping", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, ".env.yml"));
      expect(content).not.toContain("  billing:");
      expect(content).toContain("  shipping:");
    });
  });

  describe("docker-compose integration", () => {
    // Microservice services are no longer generated by the create command, but
    // the remove command must still clean up any that were added manually.
    const service = (kebab: string, snake: string, port: number) =>
      [
        `  # ${kebab} microservice`,
        `  ${kebab}:`,
        "    build:",
        "      context: .",
        `      dockerfile: modules/${kebab}/Dockerfile`,
        `    container_name: talos_${snake}`,
        "    ports:",
        `      - "${port}:3500"`,
        "",
      ].join("\n");

    const composeWith = (...services: string[]) =>
      [
        "services:",
        "  postgres:",
        "    image: postgres:18.3-alpine3.23",
        "    container_name: talos_db",
        "",
        ...services,
        "volumes:",
        "  talos_db_data:",
        "",
      ].join("\n");

    test("should remove the microservice service", async () => {
      await Bun.write(
        join(testDir, "modules", "app", "docker-compose.yml"),
        composeWith(service("billing", "billing", 3501)),
      );

      await makeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "docker-compose.yml"));
      expect(content).not.toContain("dockerfile: modules/billing/Dockerfile");
      expect(content).not.toContain("container_name: talos_billing");
      expect(content).toContain("volumes:");
    });

    test("should preserve other services when removing one", async () => {
      await Bun.write(
        join(testDir, "modules", "app", "docker-compose.yml"),
        composeWith(service("billing", "billing", 3501), service("shipping", "shipping", 3502)),
      );

      await makeCommand.run({ name: "Billing", cwd: testDir, silent: true });
      await makeCommand.run({ name: "Shipping", cwd: testDir, silent: true });
      await removeCommand.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "docker-compose.yml"));
      expect(content).not.toContain("dockerfile: modules/billing/Dockerfile");
      expect(content).toContain("dockerfile: modules/shipping/Dockerfile");
      expect(content).toContain("container_name: talos_db");
    });
  });
});
