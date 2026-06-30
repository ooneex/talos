import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import moduleTemplate from "@/templates/module/module.txt";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { SdkCreateCommand } = await import("@/commands/SdkCreateCommand");

const httpController = `import { Route } from "@talosjs/routing";

export type GrantEntitlementRouteType = {
  params: { id: string };
  payload: { scopes: { name: string; level: number }[] };
  queries: null;
  response: { granted: boolean };
};

@Route.post("/entitlement/grants", {
  name: "entitlement.grant",
  version: 2,
  description: "Grant an entitlement",
  roles: ["ROLE_ADMIN", "ROLE_USER"],
})
export class GrantEntitlementController {}
`;

const socketController = `import { Route } from "@talosjs/routing";

export type ConnectChatRouteType = {
  params: null;
  payload: { room: string };
  queries: null;
  response: { connected: boolean };
};

@Route.socket("/chat/connect", {
  name: "chat.connect",
  version: 1,
  description: "Connect to chat",
  roles: [],
})
export class ConnectChatController {}
`;

const plainController = `export class HelperController {
  public help(): string {
    return "not a route controller";
  }
}
`;

describe("SdkCreateCommand", () => {
  let command: InstanceType<typeof SdkCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(async () => {
    command = new SdkCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `sdk-${Date.now()}`);

    await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "MyApp" }, null, 2));

    // Every project has an `app` module of type `api` (created by AppInitCommand);
    // it is the default SDK target and aggregates the backend `module`/`api` modules.
    await Bun.write(join(testDir, "modules", "app", "app.yml"), `type: "api"\n`);

    // Mock Bun.spawn to avoid running bun add in tests
    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
      if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "add") {
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }
      return originalSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("sdk:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a browser SDK from module controllers");
    });
  });

  describe("run()", () => {
    test("should generate an SDK file for a module with an HTTP controller", async () => {
      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );

      await command.run({ cwd: testDir, silent: true });

      const sdkFile = join(testDir, "modules", "sdk", "src", "entitlement.ts");
      expect(existsSync(sdkFile)).toBe(true);

      const content = await Bun.file(sdkFile).text();
      expect(content).toContain("export const entitlement = {");
      expect(content).toContain('key: "entitlement.grant"');
      expect(content).toContain("version: 2");
      expect(content).toContain('description: "Grant an entitlement"');
      expect(content).toContain('roles: ["ROLE_ADMIN", "ROLE_USER"]');
      expect(content).toContain('endpoint: "/<prefix>/v2/entitlement/grants"');
      // Module prefix is stripped from the key to derive the SDK method name
      expect(content).toContain("grant: (");
      expect(content).toContain("use fetch api according to controller definition");
    });

    test("should add baseURL to every generated method input", async () => {
      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );

      await command.run({ cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "sdk", "src", "entitlement.ts")).text();
      expect(content).toContain("baseURL: string;");
    });

    test("should require a bearerToken in the input of auth-guarded routes", async () => {
      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );

      await command.run({ cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "sdk", "src", "entitlement.ts")).text();
      expect(content).toContain("bearerToken: string;");
    });

    test("should omit bearerToken from the input of public routes", async () => {
      await Bun.write(
        join(testDir, "modules", "chat", "src", "controllers", "ConnectChatController.ts"),
        socketController,
      );

      await command.run({ cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "sdk", "src", "chat.ts")).text();
      expect(content).toContain("baseURL: string;");
      expect(content).not.toContain("bearerToken: string;");
    });

    test("should install dependencies silently without inheriting output", async () => {
      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );

      const installCalls: { cmd: string[]; stderr: unknown }[] = [];
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? (args[0] as string[]) : (args[0] as { cmd?: string[] })?.cmd;
        const opts = args[1] as { stderr?: unknown } | undefined;
        if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "add") {
          installCalls.push({ cmd: [...cmd], stderr: opts?.stderr });
          return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
        }
        return originalSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
      }) as typeof Bun.spawn;

      await command.run({ cwd: testDir, silent: true });

      expect(installCalls.length).toBeGreaterThan(0);
      for (const call of installCalls) {
        expect(call.stderr).toBe("ignore");
      }
    });

    test("should install the runtime dependencies the generated SDK files import", async () => {
      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );

      const installCalls: string[][] = [];
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? (args[0] as string[]) : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "add") {
          installCalls.push([...cmd]);
          return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
        }
        return originalSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
      }) as typeof Bun.spawn;

      await command.run({ cwd: testDir, silent: true });

      const runtimeDeps = installCalls.find((cmd) => cmd[1] === "add" && !cmd.includes("-D"));
      expect(runtimeDeps).toContain("@talosjs/fetcher");
      expect(runtimeDeps).toContain("@talosjs/http-response");
      expect(runtimeDeps).toContain("@talosjs/socket-client");
    });

    test("should install bunup as a dev dependency", async () => {
      const installCalls: string[][] = [];
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? (args[0] as string[]) : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "add") {
          installCalls.push([...cmd]);
          return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
        }
        return originalSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
      }) as typeof Bun.spawn;

      await command.run({ cwd: testDir, silent: true });

      expect(installCalls.some((cmd) => cmd.includes("-D") && cmd.includes("bunup"))).toBe(true);
    });

    test("should mark socket controllers as socket in the generated api", async () => {
      await Bun.write(
        join(testDir, "modules", "chat", "src", "controllers", "ConnectChatController.ts"),
        socketController,
      );

      await command.run({ cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "sdk", "src", "chat.ts")).text();
      expect(content).toContain("use socket api according to controller definition");
      expect(content).toContain('key: "chat.connect"');
      expect(content).toContain("roles: []");
    });

    test("should skip controller files that are not route controllers", async () => {
      await Bun.write(
        join(testDir, "modules", "billing", "src", "controllers", "HelperController.ts"),
        plainController,
      );

      await command.run({ cwd: testDir, silent: true });

      expect(existsSync(join(testDir, "modules", "sdk", "src", "billing.ts"))).toBe(false);
    });

    test("should preserve nested braces inside the route type declaration", async () => {
      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );

      await command.run({ cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "sdk", "src", "entitlement.ts")).text();
      expect(content).toContain("payload: { scopes: { name: string; level: number }[] };");
      expect(content).toContain("type GrantEntitlementRouteType = {");
    });

    test("should use the full key as method name when it lacks the module prefix", async () => {
      const controller = httpController
        .replace('name: "entitlement.grant"', 'name: "auth.login"')
        .replace("GrantEntitlementRouteType", "LoginRouteType")
        .replace("GrantEntitlementController", "LoginController");
      await Bun.write(join(testDir, "modules", "billing", "src", "controllers", "LoginController.ts"), controller);

      await command.run({ cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "sdk", "src", "billing.ts")).text();
      expect(content).toContain("authLogin: (");
      expect(content).toContain('key: "auth.login"');
    });

    test("should preserve an existing controller's hand-written api body on regeneration", async () => {
      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );

      await command.run({ cwd: testDir, silent: true });

      // Simulate the developer completing the generated api method.
      const sdkFile = join(testDir, "modules", "sdk", "src", "entitlement.ts");
      const original = await Bun.file(sdkFile).text();
      const completed = original.replace('throw new Error("Not implemented");', "return { granted: true } as never;");
      await Bun.write(sdkFile, completed);

      await command.run({ cwd: testDir, silent: true });

      const content = await Bun.file(sdkFile).text();
      expect(content).toContain("return { granted: true } as never;");
      expect(content).not.toContain('throw new Error("Not implemented");');
      // The existing controller is not duplicated.
      expect(content.match(/key: "entitlement.grant"/g)?.length).toBe(1);
    });

    test("should inject a newly added controller while keeping the existing ones", async () => {
      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );

      await command.run({ cwd: testDir, silent: true });

      // Add a second controller to the same module, then regenerate.
      const revokeController = httpController
        .replace('name: "entitlement.grant"', 'name: "entitlement.revoke"')
        .replace(/GrantEntitlementRouteType/g, "RevokeEntitlementRouteType")
        .replace("GrantEntitlementController", "RevokeEntitlementController");
      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "RevokeEntitlementController.ts"),
        revokeController,
      );

      await command.run({ cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "sdk", "src", "entitlement.ts")).text();
      expect(content).toContain("grant: (");
      expect(content).toContain("revoke: (");
      expect(content).toContain('key: "entitlement.grant"');
      expect(content).toContain('key: "entitlement.revoke"');
      expect(content).toContain("type RevokeEntitlementRouteType = {");
    });

    test("should aggregate generated modules in index.ts", async () => {
      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );
      await Bun.write(
        join(testDir, "modules", "chat", "src", "controllers", "ConnectChatController.ts"),
        socketController,
      );

      await command.run({ cwd: testDir, silent: true });

      const index = await Bun.file(join(testDir, "modules", "sdk", "src", "index.ts")).text();
      expect(index).toContain('import { chat } from "./chat";');
      expect(index).toContain('import { entitlement } from "./entitlement";');
      expect(index).toMatch(/export const sdk = \{\s*\n\s*chat,\s*\n\s*entitlement,\s*\n\};/);
    });

    test("should generate an empty sdk index when no module has controllers", async () => {
      await Bun.write(join(testDir, "modules", "billing", "src", ".gitkeep"), "");

      await command.run({ cwd: testDir, silent: true });

      const index = await Bun.file(join(testDir, "modules", "sdk", "src", "index.ts")).text();
      expect(index).toContain("export const sdk = {");
      expect(index).not.toContain("import {");
    });

    test("should scope the sdk package name from the root package.json", async () => {
      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );

      await command.run({ cwd: testDir, silent: true });

      const packageJson = await Bun.file(join(testDir, "modules", "sdk", "package.json")).json();
      expect(packageJson.name).toBe("@my-app/sdk");
    });

    test("should write the bunup config for the sdk module", async () => {
      await command.run({ cwd: testDir, silent: true });

      const config = await Bun.file(join(testDir, "modules", "sdk", "bunup.config.ts")).text();
      expect(config).toContain('target: "browser"');
    });

    test("should mark the module yml as an sdk type", async () => {
      await command.run({ cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "sdk", "sdk.yml")).text();
      expect(content).toContain('type: "sdk"');
      expect(content).not.toContain('type: "module"');
    });

    test("should record the target module in the sdk yml", async () => {
      await command.run({ module: "payments", cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "sdk", "sdk.yml")).text();
      expect(content).toContain('target: "payments"');
    });

    test("should default the sdk yml target to app", async () => {
      await command.run({ cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "sdk", "sdk.yml")).text();
      expect(content).toContain('target: "app"');
    });
  });

  describe("name option", () => {
    test("should generate the module under the provided kebab-cased name", async () => {
      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );

      await command.run({ name: "ClientSdk", cwd: testDir, silent: true });

      expect(existsSync(join(testDir, "modules", "client-sdk", "src", "entitlement.ts"))).toBe(true);
      expect(existsSync(join(testDir, "modules", "client-sdk", "client-sdk.yml"))).toBe(true);
    });

    test("should scope the package name with the provided name", async () => {
      await command.run({ name: "ClientSdk", cwd: testDir, silent: true });

      const packageJson = await Bun.file(join(testDir, "modules", "client-sdk", "package.json")).json();
      expect(packageJson.name).toBe("@my-app/client-sdk");
    });

    test("should strip a trailing Module suffix from the provided name", async () => {
      await command.run({ name: "SdkModule", cwd: testDir, silent: true });

      expect(existsSync(join(testDir, "modules", "sdk", "sdk.yml"))).toBe(true);
    });
  });

  describe("module option", () => {
    const writeModuleYml = (kebab: string, type: string) =>
      Bun.write(join(testDir, "modules", kebab, `${kebab}.yml`), `type: "${type}"\n`);

    test("should collect every module and api controller when targeting an api module", async () => {
      await writeModuleYml("entitlement", "module");
      await writeModuleYml("billing", "api");
      await writeModuleYml("payments", "microservice");

      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );
      await Bun.write(
        join(testDir, "modules", "billing", "src", "controllers", "GrantEntitlementController.ts"),
        httpController.replace("GrantEntitlementController", "BillController"),
      );
      await Bun.write(
        join(testDir, "modules", "payments", "src", "controllers", "GrantEntitlementController.ts"),
        httpController.replace("GrantEntitlementController", "PayController"),
      );

      await command.run({ module: "app", cwd: testDir, silent: true });

      expect(existsSync(join(testDir, "modules", "sdk", "src", "entitlement.ts"))).toBe(true);
      expect(existsSync(join(testDir, "modules", "sdk", "src", "billing.ts"))).toBe(true);
      // A microservice module is not part of an api-target SDK.
      expect(existsSync(join(testDir, "modules", "sdk", "src", "payments.ts"))).toBe(false);
    });

    test("should aggregate from any api-typed target, not just the app", async () => {
      await writeModuleYml("gateway", "api");
      await writeModuleYml("entitlement", "module");
      await writeModuleYml("payments", "microservice");

      await Bun.write(
        join(testDir, "modules", "gateway", "src", "controllers", "GrantEntitlementController.ts"),
        httpController.replace("GrantEntitlementController", "GatewayController"),
      );
      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );
      await Bun.write(
        join(testDir, "modules", "payments", "src", "controllers", "GrantEntitlementController.ts"),
        httpController.replace("GrantEntitlementController", "PayController"),
      );

      await command.run({ module: "gateway", cwd: testDir, silent: true });

      expect(existsSync(join(testDir, "modules", "sdk", "src", "gateway.ts"))).toBe(true);
      expect(existsSync(join(testDir, "modules", "sdk", "src", "entitlement.ts"))).toBe(true);
      expect(existsSync(join(testDir, "modules", "sdk", "src", "payments.ts"))).toBe(false);
    });

    test("should collect only the target microservice's controllers", async () => {
      await writeModuleYml("entitlement", "module");
      await writeModuleYml("payments", "microservice");

      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );
      await Bun.write(
        join(testDir, "modules", "payments", "src", "controllers", "GrantEntitlementController.ts"),
        httpController.replace("GrantEntitlementController", "PayController"),
      );

      await command.run({ module: "payments", cwd: testDir, silent: true });

      expect(existsSync(join(testDir, "modules", "sdk", "src", "payments.ts"))).toBe(true);
      // Other modules are excluded when targeting a single microservice.
      expect(existsSync(join(testDir, "modules", "sdk", "src", "entitlement.ts"))).toBe(false);
    });

    test("should default to the app target when no module is provided", async () => {
      await writeModuleYml("entitlement", "module");
      await writeModuleYml("payments", "microservice");

      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );
      await Bun.write(
        join(testDir, "modules", "payments", "src", "controllers", "GrantEntitlementController.ts"),
        httpController.replace("GrantEntitlementController", "PayController"),
      );

      await command.run({ cwd: testDir, silent: true });

      expect(existsSync(join(testDir, "modules", "sdk", "src", "entitlement.ts"))).toBe(true);
      expect(existsSync(join(testDir, "modules", "sdk", "src", "payments.ts"))).toBe(false);
    });

    test("should ignore non-backend modules when targeting an api module", async () => {
      await writeModuleYml("design-system", "design");
      await writeModuleYml("dashboard", "spa");

      await Bun.write(
        join(testDir, "modules", "design-system", "src", "controllers", "GrantEntitlementController.ts"),
        httpController.replace("GrantEntitlementController", "DesignController"),
      );
      await Bun.write(
        join(testDir, "modules", "dashboard", "src", "controllers", "GrantEntitlementController.ts"),
        httpController.replace("GrantEntitlementController", "DashboardController"),
      );

      await command.run({ module: "app", cwd: testDir, silent: true });

      expect(existsSync(join(testDir, "modules", "sdk", "src", "design-system.ts"))).toBe(false);
      expect(existsSync(join(testDir, "modules", "sdk", "src", "dashboard.ts"))).toBe(false);
    });

    test("should generate an empty index when the target microservice has no controllers", async () => {
      await writeModuleYml("entitlement", "module");
      await writeModuleYml("payments", "microservice");

      await Bun.write(
        join(testDir, "modules", "entitlement", "src", "controllers", "GrantEntitlementController.ts"),
        httpController,
      );

      await command.run({ module: "payments", cwd: testDir, silent: true });

      const index = await Bun.file(join(testDir, "modules", "sdk", "src", "index.ts")).text();
      expect(index).toContain("export const sdk = {");
      expect(index).not.toContain("import {");
    });
  });

  describe("AppModule integration", () => {
    beforeEach(async () => {
      const appModuleContent = moduleTemplate.replace(/{{NAME}}/g, "App");
      await Bun.write(join(testDir, "modules", "app", "src", "AppModule.ts"), appModuleContent);
    });

    test("should not register the sdk module into AppModule", async () => {
      await command.run({ cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "app", "src", "AppModule.ts")).text();
      expect(content).not.toContain("SdkModule");
    });
  });

  describe("SharedModule integration", () => {
    beforeEach(async () => {
      const sharedModuleContent = moduleTemplate.replace(/{{NAME}}/g, "Shared");
      await Bun.write(join(testDir, "modules", "shared", "src", "SharedModule.ts"), sharedModuleContent);
    });

    test("should not register the sdk module into SharedModule", async () => {
      await command.run({ cwd: testDir, silent: true });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).not.toContain("SdkModule");
    });
  });

  describe("parseController", () => {
    const parse = (content: string, moduleName: string) =>
      // @ts-expect-error accessing private method for testing
      command.parseController(content, moduleName);

    test("should return null for a file without a route type or decorator", () => {
      expect(parse(plainController, "billing")).toBeNull();
    });

    test("should parse the controller definition", () => {
      const definition = parse(httpController, "entitlement");

      expect(definition).toEqual({
        method: "grant",
        key: "entitlement.grant",
        version: 2,
        description: "Grant an entitlement",
        roles: ["ROLE_ADMIN", "ROLE_USER"],
        path: "/entitlement/grants",
        isSocket: false,
        typeName: "GrantEntitlementRouteType",
        typeDeclaration: expect.stringContaining("type GrantEntitlementRouteType = {"),
      });
    });

    test("should keep nested braces balanced in the type declaration", () => {
      const definition = parse(httpController, "entitlement");

      expect(definition?.typeDeclaration).toContain("scopes: { name: string; level: number }[]");
      expect(definition?.typeDeclaration.endsWith("};")).toBe(true);
    });

    test("should detect socket routes", () => {
      const definition = parse(socketController, "chat");

      expect(definition?.isSocket).toBe(true);
      expect(definition?.method).toBe("connect");
    });

    test("should return null when the decorator config has no name", () => {
      const withoutName = httpController.replace('name: "entitlement.grant",', "");
      expect(parse(withoutName, "entitlement")).toBeNull();
    });
  });

  describe("matchBalanced", () => {
    const matchBalanced = (text: string, openIndex: number) =>
      // @ts-expect-error accessing private method for testing
      command.matchBalanced(text, openIndex);

    test("should return the inner body of a balanced block", () => {
      const result = matchBalanced("{ a: { b: 1 } }", 0);
      expect(result?.body).toBe(" a: { b: 1 } ");
    });

    test("should return null for an unbalanced block", () => {
      expect(matchBalanced("{ a: { b: 1 }", 0)).toBeNull();
    });
  });
});
