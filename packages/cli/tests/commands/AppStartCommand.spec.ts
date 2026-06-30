import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

type ConcurrentlyCall = {
  commands: { name: string; command: string; cwd: string; prefixColor: string }[];
  options: { prefix?: string; killOthersOn?: string[] };
};

let concurrentlyCalls: ConcurrentlyCall[] = [];
let concurrentlyResult: Promise<unknown> = Promise.resolve([]);

mock.module("concurrently", () => ({
  default: (commands: ConcurrentlyCall["commands"], options: ConcurrentlyCall["options"]) => {
    concurrentlyCalls.push({ commands, options });
    return { result: concurrentlyResult, commands: [] };
  },
}));

const { AppStartCommand } = await import("@/commands/AppStartCommand");

describe("AppStartCommand", () => {
  let command: InstanceType<typeof AppStartCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;
  let spawnCalls: { cmd: string[]; cwd: string }[];

  beforeEach(() => {
    command = new AppStartCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `app-start-${Date.now()}`);
    spawnCalls = [];
    concurrentlyCalls = [];
    concurrentlyResult = Promise.resolve([]);

    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
      const opts = (Array.isArray(args[0]) ? args[1] : args[0]) as { cwd?: string } | undefined;
      if (Array.isArray(cmd)) {
        spawnCalls.push({ cmd: [...(cmd as string[])], cwd: (opts?.cwd as string) ?? "" });
      }
      return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  const writeModule = async (name: string, type: string): Promise<string> => {
    const moduleDir = join(testDir, "modules", name);
    await Bun.write(join(moduleDir, "package.json"), JSON.stringify({ name: `@acme/${name}` }));
    await Bun.write(join(moduleDir, `${name}.yml`), `type: "${type}"\n`);
    return moduleDir;
  };

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("app:start");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Start the application");
    });
  });

  describe("run()", () => {
    test("should error when app module does not exist", async () => {
      await Bun.write(join(testDir, ".gitkeep"), "");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(0);
      expect(concurrentlyCalls).toHaveLength(0);
    });

    test("should run docker compose then start modules concurrently", async () => {
      const appDir = await writeModule("app", "api");
      await Bun.write(join(appDir, "docker-compose.yml"), "version: '3'");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]?.cmd).toEqual(["docker", "compose", "up", "-d"]);
      expect(spawnCalls[0]?.cwd).toBe(appDir);

      expect(concurrentlyCalls).toHaveLength(1);
      expect(concurrentlyCalls[0]?.commands).toEqual([
        {
          name: "app",
          prefixColor: "cyan",
          cwd: testDir,
          command: `bun --hot run ${join(appDir, "src", "index.ts")}`,
        },
      ]);
      expect(concurrentlyCalls[0]?.options).toEqual({ prefix: "name", killOthersOn: ["failure"] });
    });

    test("should skip docker compose when no docker-compose.yml", async () => {
      await writeModule("app", "api");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(0);
      expect(concurrentlyCalls).toHaveLength(1);
    });

    test("should not start modules when docker compose fails", async () => {
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
        const opts = (Array.isArray(args[0]) ? args[1] : args[0]) as { cwd?: string } | undefined;
        if (Array.isArray(cmd)) {
          spawnCalls.push({ cmd: [...(cmd as string[])], cwd: (opts?.cwd as string) ?? "" });
        }
        return { exited: Promise.resolve(1) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      const appDir = await writeModule("app", "api");
      await Bun.write(join(appDir, "docker-compose.yml"), "version: '3'");
      process.chdir(testDir);

      await command.run();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]?.cmd).toEqual(["docker", "compose", "up", "-d"]);
      expect(concurrentlyCalls).toHaveLength(0);
    });

    test("should run api, microservice and spa modules with matching commands", async () => {
      await writeModule("app", "api");
      const billingDir = await writeModule("billing", "microservice");
      const dashboardDir = await writeModule("dashboard", "spa");
      process.chdir(testDir);

      await command.run();

      expect(concurrentlyCalls).toHaveLength(1);
      const byName = Object.fromEntries(concurrentlyCalls[0]?.commands.map((c) => [c.name, c]) ?? []);

      expect(byName.billing).toMatchObject({
        prefixColor: "magenta",
        cwd: testDir,
        command: `bun --hot run ${join(billingDir, "src", "index.ts")}`,
      });
      expect(byName.dashboard).toMatchObject({
        prefixColor: "green",
        cwd: dashboardDir,
        command: "bun run dev",
      });
    });

    test("should ignore modules that are not runnable", async () => {
      await writeModule("app", "api");
      await writeModule("shared", "module");
      await writeModule("ui", "design");
      process.chdir(testDir);

      await command.run();

      expect(concurrentlyCalls[0]?.commands.map((c) => c.name)).toEqual(["app"]);
    });

    test("should error when no runnable modules are found", async () => {
      const appDir = join(testDir, "modules", "app");
      await Bun.write(join(appDir, "package.json"), JSON.stringify({ name: "@acme/app" }));
      await writeModule("shared", "module");
      process.chdir(testDir);

      await command.run();

      expect(concurrentlyCalls).toHaveLength(0);
    });

    test("should run only api modules when --api flag is set", async () => {
      const appDir = await writeModule("app", "api");
      const orderDir = await writeModule("order", "api");
      await writeModule("billing", "microservice");
      await writeModule("dashboard", "spa");
      process.chdir(testDir);

      await command.run({ api: true });

      expect(concurrentlyCalls).toHaveLength(1);
      const byName = Object.fromEntries(concurrentlyCalls[0]?.commands.map((c) => [c.name, c]) ?? []);
      expect(Object.keys(byName).sort()).toEqual(["app", "order"]);
      expect(byName.app).toEqual({
        name: "app",
        prefixColor: "cyan",
        cwd: testDir,
        command: `bun --hot run ${join(appDir, "src", "index.ts")}`,
      });
      expect(byName.order).toEqual({
        name: "order",
        prefixColor: "cyan",
        cwd: testDir,
        command: `bun --hot run ${join(orderDir, "src", "index.ts")}`,
      });
    });

    test("should run only the named api modules when --api=name1,name2 is set", async () => {
      await writeModule("app", "api");
      const orderDir = await writeModule("order", "api");
      await writeModule("invoice", "api");
      await writeModule("billing", "microservice");
      process.chdir(testDir);

      await command.run({ api: "order" });

      expect(concurrentlyCalls).toHaveLength(1);
      expect(concurrentlyCalls[0]?.commands).toEqual([
        {
          name: "order",
          prefixColor: "cyan",
          cwd: testDir,
          command: `bun --hot run ${join(orderDir, "src", "index.ts")}`,
        },
      ]);
    });

    test("should run multiple named api modules and ignore whitespace", async () => {
      await writeModule("app", "api");
      const orderDir = await writeModule("order", "api");
      const invoiceDir = await writeModule("invoice", "api");
      process.chdir(testDir);

      await command.run({ api: " order , invoice " });

      const byName = Object.fromEntries(concurrentlyCalls[0]?.commands.map((c) => [c.name, c]) ?? []);
      expect(Object.keys(byName).sort()).toEqual(["invoice", "order"]);
      expect(byName.order).toEqual({
        name: "order",
        prefixColor: "cyan",
        cwd: testDir,
        command: `bun --hot run ${join(orderDir, "src", "index.ts")}`,
      });
      expect(byName.invoice).toEqual({
        name: "invoice",
        prefixColor: "cyan",
        cwd: testDir,
        command: `bun --hot run ${join(invoiceDir, "src", "index.ts")}`,
      });
    });

    test("should error when no api module matches --api=name", async () => {
      await writeModule("app", "api");
      await writeModule("billing", "microservice");
      process.chdir(testDir);

      await command.run({ api: "unknown" });

      expect(concurrentlyCalls).toHaveLength(0);
    });

    test("should run only microservice modules when --microservice flag is set", async () => {
      await writeModule("app", "api");
      const billingDir = await writeModule("billing", "microservice");
      const notifyDir = await writeModule("notify", "microservice");
      await writeModule("dashboard", "spa");
      process.chdir(testDir);

      await command.run({ microservice: true });

      const byName = Object.fromEntries(concurrentlyCalls[0]?.commands.map((c) => [c.name, c]) ?? []);
      expect(Object.keys(byName).sort()).toEqual(["billing", "notify"]);
      expect(byName.billing).toEqual({
        name: "billing",
        prefixColor: "magenta",
        cwd: testDir,
        command: `bun --hot run ${join(billingDir, "src", "index.ts")}`,
      });
      expect(byName.notify).toEqual({
        name: "notify",
        prefixColor: "magenta",
        cwd: testDir,
        command: `bun --hot run ${join(notifyDir, "src", "index.ts")}`,
      });
    });

    test("should run only the named microservice modules when --microservice=name is set", async () => {
      await writeModule("app", "api");
      const billingDir = await writeModule("billing", "microservice");
      await writeModule("notify", "microservice");
      process.chdir(testDir);

      await command.run({ microservice: "billing" });

      expect(concurrentlyCalls[0]?.commands).toEqual([
        {
          name: "billing",
          prefixColor: "magenta",
          cwd: testDir,
          command: `bun --hot run ${join(billingDir, "src", "index.ts")}`,
        },
      ]);
    });

    test("should run only spa modules when --spa flag is set", async () => {
      await writeModule("app", "api");
      await writeModule("billing", "microservice");
      const dashboardDir = await writeModule("dashboard", "spa");
      const adminDir = await writeModule("admin", "spa");
      process.chdir(testDir);

      await command.run({ spa: true });

      const byName = Object.fromEntries(concurrentlyCalls[0]?.commands.map((c) => [c.name, c]) ?? []);
      expect(Object.keys(byName).sort()).toEqual(["admin", "dashboard"]);
      expect(byName.dashboard).toEqual({
        name: "dashboard",
        prefixColor: "green",
        cwd: dashboardDir,
        command: "bun run dev",
      });
      expect(byName.admin).toEqual({
        name: "admin",
        prefixColor: "green",
        cwd: adminDir,
        command: "bun run dev",
      });
    });

    test("should run only the named spa modules when --spa=name is set", async () => {
      await writeModule("app", "api");
      const dashboardDir = await writeModule("dashboard", "spa");
      await writeModule("admin", "spa");
      process.chdir(testDir);

      await command.run({ spa: "dashboard" });

      expect(concurrentlyCalls[0]?.commands).toEqual([
        {
          name: "dashboard",
          prefixColor: "green",
          cwd: dashboardDir,
          command: "bun run dev",
        },
      ]);
    });

    test("should union the selections when several type flags are combined", async () => {
      const appDir = await writeModule("app", "api");
      await writeModule("billing", "microservice");
      const dashboardDir = await writeModule("dashboard", "spa");
      process.chdir(testDir);

      await command.run({ api: true, spa: true });

      const byName = Object.fromEntries(concurrentlyCalls[0]?.commands.map((c) => [c.name, c]) ?? []);
      expect(Object.keys(byName).sort()).toEqual(["app", "dashboard"]);
      expect(byName.app).toEqual({
        name: "app",
        prefixColor: "cyan",
        cwd: testDir,
        command: `bun --hot run ${join(appDir, "src", "index.ts")}`,
      });
      expect(byName.dashboard).toEqual({
        name: "dashboard",
        prefixColor: "green",
        cwd: dashboardDir,
        command: "bun run dev",
      });
    });

    test("should set exit code when a module fails", async () => {
      await writeModule("app", "api");
      concurrentlyResult = Promise.reject([{ exitCode: 1 }]);
      // Mark as handled so the pending rejection is not reported before run() awaits it
      concurrentlyResult.catch(() => {});
      process.chdir(testDir);

      await command.run();

      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });
  });
});
