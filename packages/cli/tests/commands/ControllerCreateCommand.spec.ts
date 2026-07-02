import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import moduleTemplate from "@/templates/module/module.txt";

// Mock enquirer before importing commands - return proper values for prompts
const promptMock = mock(() =>
  Promise.resolve({
    name: "test",
    routeName: "api.test.index",
    method: "GET",
    path: "/test",
    confirm: false,
  }),
);

mock.module("enquirer", () => ({
  prompt: promptMock,
}));

const { ControllerCreateCommand } = await import("@/commands/ControllerCreateCommand");

const exists = (path: string) => Bun.file(path).exists();

describe("ControllerCreateCommand", () => {
  let command: InstanceType<typeof ControllerCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new ControllerCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `controller-${Date.now()}`);

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
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("controller:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new controller class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "controllers", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "controllers", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "controllers", "UserController.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "User", isSocket: false, override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("User");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "controllers", "UserController.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "User", isSocket: false });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run() with HTTP controller", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "controllers", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "controllers", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate controller file with correct name", async () => {
      await command.run({
        name: "User",
        isSocket: false,
      });

      const filePath = join(testDir, "modules", "shared", "src", "controllers", "UserController.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("UserController");
    });

    test("should install the dependency silently without inheriting output", async () => {
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

      await command.run({ name: "User", isSocket: false });

      expect(installCalls.length).toBeGreaterThan(0);
      expect(installCalls[0]?.stderr).toBe("pipe");
    });

    test("should generate test file for controller", async () => {
      await command.run({
        name: "User",
        isSocket: false,
      });

      const testFilePath = join(testDir, "modules", "shared", "tests", "controllers", "UserController.spec.ts");
      expect(await exists(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("UserController");
    });

    test("should include route type in controller file", async () => {
      await command.run({
        name: "User",
        isSocket: false,
      });

      const filePath = join(testDir, "modules", "shared", "src", "controllers", "UserController.ts");
      const content = await Bun.file(filePath).text();
      expect(content).toContain("export type ApiTestIndexRouteType");
      expect(content).not.toContain("{{TYPE_NAME}}");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({
        name: "user-profile",
        isSocket: false,
      });

      const filePath = join(testDir, "modules", "shared", "src", "controllers", "UserProfileController.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should remove Controller suffix if provided", async () => {
      await command.run({
        name: "UserController",
        isSocket: false,
      });

      const filePath = join(testDir, "modules", "shared", "src", "controllers", "UserController.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("UserControllerController");
    });

    test("should replace all placeholders in template", async () => {
      await command.run({
        name: "Product",
        isSocket: false,
      });

      const filePath = join(testDir, "modules", "shared", "src", "controllers", "ProductController.ts");
      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("{{NAME}}");
      expect(content).not.toContain("{{ROUTE_NAME}}");
      expect(content).not.toContain("{{ROUTE_PATH}}");
      expect(content).not.toContain("{{ROUTE_METHOD}}");
      expect(content).not.toContain("{{TYPE_NAME}}");
      expect(content).toContain("ProductController");
      expect(content).toContain("api.test.index");
      expect(content).toContain("/test");
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "controllers", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "controllers", ".gitkeep"), "");

      await command.run({ name: "User", module: "user-profile", isSocket: false });

      const testFilePath = join(testDir, "modules", "user-profile", "tests", "controllers", "UserController.spec.ts");
      expect(await exists(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/controllers/UserController");
    });
  });

  describe("run() with Socket controller", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "controllers", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "controllers", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate socket controller file", async () => {
      await command.run({
        name: "Chat",
        isSocket: true,
      });

      const filePath = join(testDir, "modules", "shared", "src", "controllers", "ChatController.ts");
      expect(await exists(filePath)).toBe(true);
    });

    test("should generate test file for socket controller", async () => {
      await command.run({
        name: "Notification",
        isSocket: true,
      });

      const testFilePath = join(testDir, "modules", "shared", "tests", "controllers", "NotificationController.spec.ts");
      expect(await exists(testFilePath)).toBe(true);
    });

    test("should use socket template for socket controller", async () => {
      await command.run({
        name: "Realtime",
        isSocket: true,
      });

      const filePath = join(testDir, "modules", "shared", "src", "controllers", "RealtimeController.ts");
      expect(await exists(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("RealtimeController");
      expect(content).toContain("IController");
      expect(content).toContain("implements IController");
      expect(content).toContain("context.channel.send");
    });
  });

  describe("Module integration (default shared module)", () => {
    beforeEach(async () => {
      const moduleContent = moduleTemplate.replace(/{{NAME}}/g, "Shared");
      await Bun.write(join(testDir, "modules", "shared", "src", "SharedModule.ts"), moduleContent);
      await Bun.write(join(testDir, "modules", "shared", "src", "controllers", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "controllers", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should add import and class to module controllers array", async () => {
      await command.run({ name: "CreatePost", isSocket: false });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).toContain('import { CreatePostController } from "./controllers/CreatePostController"');
      expect(content).toContain("CreatePostController");
      // Should be in the controllers array
      expect(content).toMatch(/controllers:\s*\[.*CreatePostController.*\]/s);
    });

    test("should accumulate multiple controllers in module", async () => {
      await command.run({ name: "CreatePost", isSocket: false });
      await command.run({ name: "ListPost", isSocket: false });

      const content = await Bun.file(join(testDir, "modules", "shared", "src", "SharedModule.ts")).text();
      expect(content).toContain('import { CreatePostController } from "./controllers/CreatePostController"');
      expect(content).toContain('import { ListPostController } from "./controllers/ListPostController"');
      expect(content).toMatch(/controllers:\s*\[.*CreatePostController.*ListPostController.*\]/s);
    });
  });

  describe("Module integration (with module parameter)", () => {
    beforeEach(async () => {
      testDir = join(originalCwd, ".temp", `controller-module-${Date.now()}`);
      const moduleContent = moduleTemplate.replace(/{{NAME}}/g, "Blog");
      await Bun.write(join(testDir, "modules", "blog", "src", "BlogModule.ts"), moduleContent);
      await Bun.write(join(testDir, "modules", "blog", "src", "controllers", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "blog", "tests", "controllers", ".gitkeep"), "");
      await Bun.write(
        join(testDir, "modules", "blog", "package.json"),
        JSON.stringify({ name: "@module/blog" }, null, 2),
      );
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate files under modules directory", async () => {
      await command.run({ name: "CreatePost", module: "blog", isSocket: false });

      const controllerPath = join(testDir, "modules", "blog", "src", "controllers", "CreatePostController.ts");
      expect(await exists(controllerPath)).toBe(true);

      const testFilePath = join(testDir, "modules", "blog", "tests", "controllers", "CreatePostController.spec.ts");
      expect(await exists(testFilePath)).toBe(true);
    });

    test("should add import and class to module controllers array", async () => {
      await command.run({ name: "CreatePost", module: "blog", isSocket: false });

      const content = await Bun.file(join(testDir, "modules", "blog", "src", "BlogModule.ts")).text();
      expect(content).toContain('import { CreatePostController } from "./controllers/CreatePostController"');
      expect(content).toContain("CreatePostController");
      expect(content).toMatch(/controllers:\s*\[.*CreatePostController.*\]/s);
    });

    test("should accumulate multiple controllers in module", async () => {
      await command.run({ name: "CreatePost", module: "blog", isSocket: false });
      await command.run({ name: "ListPost", module: "blog", isSocket: false });

      const content = await Bun.file(join(testDir, "modules", "blog", "src", "BlogModule.ts")).text();
      expect(content).toContain('import { CreatePostController } from "./controllers/CreatePostController"');
      expect(content).toContain('import { ListPostController } from "./controllers/ListPostController"');
      expect(content).toMatch(/controllers:\s*\[.*CreatePostController.*ListPostController.*\]/s);
    });
  });
});
