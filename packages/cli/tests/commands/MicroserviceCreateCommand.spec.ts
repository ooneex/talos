import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import dockerfileTemplate from "@/templates/app/Dockerfile.txt";
import onAppStartTemplate from "@/templates/app/OnAppStart.ts.txt";
import moduleTemplate from "@/templates/module/module.txt";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { MicroserviceCreateCommand } = await import("@/commands/MicroserviceCreateCommand");

const exists = (path: string) => Bun.file(path).exists();
const read = (path: string) => Bun.file(path).text();

describe("MicroserviceCreateCommand", () => {
  let command: InstanceType<typeof MicroserviceCreateCommand>;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    command = new MicroserviceCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `microservice-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("microservice:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new microservice");
    });
  });

  describe("run() - file generation", () => {
    test("should generate module class file in src", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "billing", "src", "BillingModule.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await read(filePath);
      expect(content).toContain("BillingModule");
    });

    test("should generate package.json with kebab name", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "billing", "package.json");
      expect(await exists(filePath)).toBe(true);
      expect(await read(filePath)).toContain("@module/billing");
    });

    test("should generate tsconfig.json", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "modules", "billing", "tsconfig.json"))).toBe(true);
    });

    test("should generate test file in tests dir", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "billing", "tests", "BillingModule.spec.ts");
      expect(await exists(filePath)).toBe(true);
      expect(await read(filePath)).toContain('import { BillingModule } from "@module/billing/BillingModule"');
    });

    test("should generate yml file with microservice type", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "billing", "billing.yml");
      expect(await exists(filePath)).toBe(true);

      const content = await read(filePath);
      expect(content).toContain('type: "microservice"');
      expect(content).not.toContain('type: "module"');
    });

    test("should generate index.ts pointing at the microservice module", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "billing", "src", "index.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await read(filePath);
      expect(content).toContain('import { BillingModule } from "./BillingModule"');
      expect(content).toContain("BillingModule.middlewares");
      expect(content).not.toContain("AppModule");
    });

    test("should generate OnAppStart.ts from template", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "billing", "src", "OnAppStart.ts");
      expect(await exists(filePath)).toBe(true);
      expect(await read(filePath)).toBe(onAppStartTemplate);
    });

    test("should generate Dockerfile with snake name and module path", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "billing", "Dockerfile");
      expect(await exists(filePath)).toBe(true);

      const content = await read(filePath);
      const expected = dockerfileTemplate
        .replace(/{{NAME}}/g, "billing")
        .replace(/modules\/app\//g, "modules/billing/");
      expect(content).toBe(expected);
      expect(content).toContain("docker build -f modules/billing/Dockerfile");
      expect(content).not.toContain("{{NAME}}");
      expect(content).not.toContain("modules/app/");
    });

    test("should generate roles.yml at the module root", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "billing", "roles.yml");
      expect(await exists(filePath)).toBe(true);
    });

    test("should write roles.yml in block-style YAML with role entries and hierarchy", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "billing", "roles.yml"));
      expect(content).not.toMatch(/^\{/);
      expect(content).toMatch(/^roles:$/m);
      expect(content).toMatch(/^hierarchy:$/m);
      expect(content).toContain("ROLE_GUEST");
      expect(content).toContain("ROLE_SUPER_ADMIN");
      expect(content).toMatch(/inherits:\n {6}- ROLE_/m);
    });
  });

  describe("name normalization", () => {
    test("should normalize name to kebab-case for directory", async () => {
      await command.run({ name: "PaymentGateway", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "modules", "payment-gateway", "src", "PaymentGatewayModule.ts"))).toBe(true);
    });

    test("should normalize name to PascalCase for class", async () => {
      await command.run({ name: "payment-gateway", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "payment-gateway", "src", "PaymentGatewayModule.ts"));
      expect(content).toContain("PaymentGatewayModule");
    });

    test("should strip Module suffix from provided name", async () => {
      await command.run({ name: "BillingModule", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "billing", "src", "BillingModule.ts");
      expect(await exists(filePath)).toBe(true);
      expect(await read(filePath)).not.toContain("BillingModuleModule");
    });

    test("should derive snake_case env var for multi-word name in Dockerfile", async () => {
      await command.run({ name: "PaymentGateway", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "payment-gateway", "Dockerfile"));
      expect(content).toContain("payment_gateway backend");
    });

    test("should prompt for name when not provided", async () => {
      await command.run({ cwd: testDir, silent: true });

      // enquirer mock resolves { name: "Test" }
      expect(await exists(join(testDir, "modules", "test", "src", "TestModule.ts"))).toBe(true);
    });
  });

  describe("AppModule integration", () => {
    beforeEach(async () => {
      const appModuleContent = moduleTemplate.replace(/{{NAME}}/g, "App");
      await Bun.write(join(testDir, "modules", "app", "src", "AppModule.ts"), appModuleContent);
    });

    test("should not register the microservice into AppModule", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "src", "AppModule.ts"));
      expect(content).not.toContain("BillingModule");
      expect(content).not.toContain("@module/billing");
    });

    test("should not register multiple microservices into AppModule", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });
      await command.run({ name: "Shipping", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "src", "AppModule.ts"));
      expect(content).not.toContain("BillingModule");
      expect(content).not.toContain("ShippingModule");
    });

    test("should not touch AppModule when creating the app microservice", async () => {
      const original = await read(join(testDir, "modules", "app", "src", "AppModule.ts"));

      await command.run({ name: "App", cwd: testDir, silent: true });

      expect(await read(join(testDir, "modules", "app", "src", "AppModule.ts"))).toBe(original);
    });
  });

  describe("SharedModule integration", () => {
    beforeEach(async () => {
      const sharedModuleContent = moduleTemplate.replace(/{{NAME}}/g, "Shared");
      await Bun.write(join(testDir, "modules", "shared", "src", "SharedModule.ts"), sharedModuleContent);
    });

    test("should not register the microservice into SharedModule", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "shared", "src", "SharedModule.ts"));
      expect(content).not.toContain("BillingModule");
      expect(content).not.toContain("@module/billing");
    });

    test("should not register the shared microservice into itself", async () => {
      const original = await read(join(testDir, "modules", "shared", "src", "SharedModule.ts"));

      await command.run({ name: "Shared", cwd: testDir, silent: true });

      expect(await read(join(testDir, "modules", "shared", "src", "SharedModule.ts"))).toBe(original);
    });
  });

  describe("root tsconfig path alias", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }, null, 2));
    });

    test("should add a path alias for the microservice", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const tsconfig = JSON.parse(await read(join(testDir, "tsconfig.json")));
      expect(tsconfig.compilerOptions.paths["@module/billing/*"]).toEqual(["./modules/billing/src/*"]);
    });
  });

  describe("app.yml declaration", () => {
    test("should append a microservices section when none exists", async () => {
      await Bun.write(join(testDir, "modules", "app", "app.yml"), 'name: app\ntype: "api"\n');

      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "app.yml"));
      expect(content).toContain("microservices:");
      expect(content).toContain('- name: "billing"');
      expect(content).toContain("url: MICROSERVICE_BILLING_URL");
    });

    test("should derive an upper snake_case env var for multi-word names", async () => {
      await Bun.write(join(testDir, "modules", "app", "app.yml"), "name: app\n\nmicroservices:\n");

      await command.run({ name: "PaymentGateway", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "app.yml"));
      expect(content).toContain('- name: "payment-gateway"');
      expect(content).toContain("url: MICROSERVICE_PAYMENT_GATEWAY_URL");
    });

    test("should not duplicate an already declared microservice", async () => {
      await Bun.write(join(testDir, "modules", "app", "app.yml"), "name: app\n\nmicroservices:\n");

      await command.run({ name: "Billing", cwd: testDir, silent: true });
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "app.yml"));
      expect(content.match(/- name: "billing"/g)).toHaveLength(1);
    });
  });

  describe(".env.yml integration", () => {
    test("should append a microservices map when none exists", async () => {
      await Bun.write(join(testDir, ".env.yml"), 'app:\n  url: ""\n');

      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, ".env.yml"));
      expect(content).toContain("microservices:");
      expect(content).toContain("  billing:");
      expect(content).toContain('    url: ""');
    });

    test("should not duplicate an already declared microservice", async () => {
      await Bun.write(join(testDir, ".env.yml"), "microservices:\n");

      await command.run({ name: "Billing", cwd: testDir, silent: true });
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, ".env.yml"));
      expect(content.match(/ {2}billing:/g)).toHaveLength(1);
    });

    test("should not write to the shared module .env.yml", async () => {
      await Bun.write(join(testDir, ".env.yml"), 'app:\n  url: ""\n');
      await Bun.write(join(testDir, "modules", "shared", ".env.yml"), 'app:\n  url: ""\n');

      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const rootContent = await read(join(testDir, ".env.yml"));
      const sharedContent = await read(join(testDir, "modules", "shared", ".env.yml"));
      expect(rootContent).toContain("  billing:");
      expect(sharedContent).not.toContain("  billing:");
    });
  });

  describe("module env file", () => {
    test("should create a .env.yml at the module root", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "billing", ".env.yml");
      expect(await exists(filePath)).toBe(true);

      const content = await read(filePath);
      expect(content).toContain("app:");
      expect(content).toContain("port:");
    });

    test("should populate the module .env.yml with default connection URLs", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "billing", ".env.yml"));
      expect(content).toContain("postgresql://talos:talos@localhost:5432/talos");
      expect(content).toContain("redis://localhost:6379");
    });

    test("should assign a distinct port instead of the default 3000", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "billing", ".env.yml"));
      const port = Number(content.match(/^\s*port:\s*(\d+)/m)?.[1]);
      expect(port).toBe(3001);
    });

    test("should give each microservice its own port", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: true });
      await command.run({ name: "Shipping", cwd: testDir, silent: true });

      const billing = await read(join(testDir, "modules", "billing", ".env.yml"));
      const shipping = await read(join(testDir, "modules", "shipping", ".env.yml"));

      const billingPort = Number(billing.match(/^\s*port:\s*(\d+)/m)?.[1]);
      const shippingPort = Number(shipping.match(/^\s*port:\s*(\d+)/m)?.[1]);

      expect(billingPort).toBe(3001);
      expect(shippingPort).toBe(3002);
    });
  });

  describe("CI/CD integration", () => {
    test("should create GitHub workflows for the microservice when the project uses GitHub", async () => {
      await Bun.write(join(testDir, ".github", "workflows", ".gitkeep"), "");

      await command.run({ name: "Billing", cwd: testDir, silent: false });

      const ciPath = join(testDir, ".github", "workflows", "billing-ci.yml");
      const productionPath = join(testDir, ".github", "workflows", "billing-production.yml");
      expect(await exists(ciPath)).toBe(true);
      expect(await exists(productionPath)).toBe(true);

      const ci = await read(ciPath);
      expect(ci).toContain("talos docker:publish --modules billing");
      expect(ci).not.toContain("{{name}}");
      expect(ci).not.toContain("{{NAME}}");

      const production = await read(productionPath);
      expect(production).toContain("uses: ./.github/workflows/billing-ci.yml");
      expect(production).toContain("vars.PRODUCTION_URL_BILLING }}");
      expect(production).toContain("talos docker:publish --modules billing");
    });

    test("should create a GitLab pipeline and register the include when the project uses GitLab", async () => {
      await Bun.write(join(testDir, ".gitlab-ci.yml"), "include:\n  - local: .gitlab/ci/ci.yml\n");

      await command.run({ name: "Billing", cwd: testDir, silent: false });

      const pipelinePath = join(testDir, ".gitlab", "ci", "billing.yml");
      expect(await exists(pipelinePath)).toBe(true);

      const pipeline = await read(pipelinePath);
      expect(pipeline).toContain("billing-build-image:");
      expect(pipeline).toContain("talos docker:publish --modules billing");
      expect(pipeline).toContain("$PRODUCTION_URL_BILLING");
      expect(pipeline).not.toContain("{{name}}");
      expect(pipeline).not.toContain("{{NAME}}");

      const gitlabCi = await read(join(testDir, ".gitlab-ci.yml"));
      expect(gitlabCi).toContain("- local: .gitlab/ci/billing.yml");
    });

    test("should not duplicate the GitLab include on repeated runs", async () => {
      await Bun.write(join(testDir, ".gitlab-ci.yml"), "include:\n  - local: .gitlab/ci/ci.yml\n");

      await command.run({ name: "Billing", cwd: testDir, silent: false });
      await command.run({ name: "Billing", cwd: testDir, silent: false });

      const gitlabCi = await read(join(testDir, ".gitlab-ci.yml"));
      expect(gitlabCi.match(/- local: \.gitlab\/ci\/billing\.yml/g)).toHaveLength(1);
    });

    test("should create a Bitbucket pipeline reference when the project uses Bitbucket", async () => {
      await Bun.write(join(testDir, "bitbucket-pipelines.yml"), "image: oven/bun:latest\n");

      await command.run({ name: "Billing", cwd: testDir, silent: false });

      const referencePath = join(testDir, ".bitbucket", "billing-pipelines.yml");
      expect(await exists(referencePath)).toBe(true);

      const reference = await read(referencePath);
      expect(reference).toContain("talos docker:publish --modules billing");
      expect(reference).toContain("&billing-build-image");
      expect(reference).not.toContain("{{name}}");
      expect(reference).not.toContain("{{NAME}}");
    });

    test("should not create CI/CD files when no provider is configured", async () => {
      await command.run({ name: "Billing", cwd: testDir, silent: false });

      expect(await exists(join(testDir, ".github"))).toBe(false);
      expect(await exists(join(testDir, ".gitlab"))).toBe(false);
      expect(await exists(join(testDir, ".bitbucket"))).toBe(false);
    });

    test("should skip CI/CD file creation in silent mode", async () => {
      await Bun.write(join(testDir, ".github", "workflows", ".gitkeep"), "");

      await command.run({ name: "Billing", cwd: testDir, silent: true });

      expect(await exists(join(testDir, ".github", "workflows", "billing-ci.yml"))).toBe(false);
    });
  });

  describe("missing optional targets", () => {
    test("should still generate the microservice when no app/shared/config files exist", async () => {
      await Bun.write(join(testDir, ".gitkeep"), "");

      await command.run({ name: "Billing", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "modules", "billing", "src", "BillingModule.ts"))).toBe(true);
      expect(await exists(join(testDir, "modules", "app", "src", "AppModule.ts"))).toBe(false);
    });
  });
});
