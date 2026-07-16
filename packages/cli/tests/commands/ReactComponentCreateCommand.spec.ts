import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test", confirm: false })),
}));

const { ReactComponentCreateCommand } = await import("@/commands/ReactComponentCreateCommand");

const read = (path: string) => Bun.file(path).text();

describe("ReactComponentCreateCommand", () => {
  let command: InstanceType<typeof ReactComponentCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new ReactComponentCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `react-component-${Date.now()}-${Math.random().toString(36).slice(2)}`);

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
      expect(command.getName()).toBe("react:component:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe(
        "Generate a new react component (with test) in a module or feature components folder",
      );
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    const modulePath = (...segments: string[]) => join(testDir, "modules", "ui", ...segments);

    test("should create the component in the module components folder using PascalCase", async () => {
      await command.run({ name: "ButtonBack", module: "ui" });

      const componentPath = modulePath("src", "components", "ButtonBack.tsx");
      expect(existsSync(componentPath)).toBe(true);

      const content = await read(componentPath);
      expect(content).toContain("export const ButtonBack");
      expect(content).toContain("ButtonBackPropsType");
      expect(content).not.toContain("{{NAME}}");
    });

    test("should create the test in the mirrored tests folder with a matching relative import", async () => {
      await command.run({ name: "ButtonBack", module: "ui" });

      const specPath = modulePath("tests", "components", "ButtonBack.spec.tsx");
      expect(existsSync(specPath)).toBe(true);

      const content = await read(specPath);
      expect(content).toContain('/// <reference lib="dom" />');
      expect(content).toContain('from "@testing-library/react"');
      expect(content).toContain('import { ButtonBack } from "../../src/components/ButtonBack"');
      expect(content).toContain('describe("ButtonBack"');
      expect(content).not.toContain("{{NAME}}");
      expect(content).not.toContain("{{IMPORT}}");
    });

    test("should create happydom.ts and bunfig.toml at the module root", async () => {
      await command.run({ name: "ButtonBack", module: "ui" });

      const happydom = await read(modulePath("happydom.ts"));
      expect(happydom).toContain("GlobalRegistrator.register()");
      expect(happydom).toContain('await import("@testing-library/react")');

      const bunfig = await read(modulePath("bunfig.toml"));
      expect(bunfig).toContain('preload = ["./happydom.ts"]');
    });

    test("should scope the component and test to a feature when --feature is passed", async () => {
      await command.run({ name: "AvatarCard", module: "ui", feature: "user-profile" });

      const componentPath = modulePath("src", "features", "user-profile", "components", "AvatarCard.tsx");
      expect(existsSync(componentPath)).toBe(true);

      const specPath = modulePath("tests", "features", "user-profile", "components", "AvatarCard.spec.tsx");
      expect(existsSync(specPath)).toBe(true);

      const content = await read(specPath);
      expect(content).toContain(
        'import { AvatarCard } from "../../../../src/features/user-profile/components/AvatarCard"',
      );
    });

    test("should normalize the name to PascalCase", async () => {
      await command.run({ name: "button-back", module: "ui" });

      expect(existsSync(modulePath("src", "components", "ButtonBack.tsx"))).toBe(true);
    });

    test("should normalize the module name to kebab-case", async () => {
      await command.run({ name: "ButtonBack", module: "AdminPanel" });

      expect(existsSync(join(testDir, "modules", "admin-panel", "src", "components", "ButtonBack.tsx"))).toBe(true);
    });

    test("should normalize the feature name to kebab-case and strip a Feature suffix", async () => {
      await command.run({ name: "AvatarCard", module: "ui", feature: "UserProfileFeature" });

      expect(existsSync(modulePath("src", "features", "user-profile", "components", "AvatarCard.tsx"))).toBe(true);
    });

    test("should install the test dev dependencies with bun add -d", async () => {
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

      await command.run({ name: "ButtonBack", module: "ui" });

      expect(installCalls.length).toBe(1);
      expect(installCalls[0]?.cmd).toContain("-d");
      expect(installCalls[0]?.cmd).toContain("@happy-dom/global-registrator");
      expect(installCalls[0]?.cmd).toContain("@testing-library/react");
      expect(installCalls[0]?.cmd).toContain("@testing-library/jest-dom");
      expect(installCalls[0]?.stderr).toBe("pipe");
    });

    test("should only install the missing test dev dependencies", async () => {
      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify({ name: "test", devDependencies: { "@testing-library/react": "^16.0.0" } }, null, 2),
      );

      const installCalls: string[][] = [];
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? (args[0] as string[]) : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "add") {
          installCalls.push([...cmd]);
        }
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "ButtonBack", module: "ui" });

      expect(installCalls.length).toBe(1);
      expect(installCalls[0]).not.toContain("@testing-library/react");
      expect(installCalls[0]).toContain("@happy-dom/global-registrator");
      expect(installCalls[0]).toContain("@testing-library/jest-dom");
    });

    test("should not install anything when every test dependency is already present", async () => {
      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(
          {
            name: "test",
            devDependencies: {
              "@happy-dom/global-registrator": "^15.0.0",
              "@testing-library/react": "^16.0.0",
              "@testing-library/jest-dom": "^6.0.0",
            },
          },
          null,
          2,
        ),
      );

      const installCalls: string[][] = [];
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? (args[0] as string[]) : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "add") {
          installCalls.push([...cmd]);
        }
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "ButtonBack", module: "ui" });

      expect(installCalls.length).toBe(0);
    });

    test("should not overwrite an existing happydom.ts or bunfig.toml", async () => {
      await Bun.write(modulePath("happydom.ts"), "// custom setup");
      await Bun.write(modulePath("bunfig.toml"), "# custom bunfig");

      await command.run({ name: "ButtonBack", module: "ui" });

      expect(await read(modulePath("happydom.ts"))).toBe("// custom setup");
      expect(await read(modulePath("bunfig.toml"))).toBe("# custom bunfig");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should not override an existing component when the prompt is declined", async () => {
      const componentPath = join(testDir, "modules", "ui", "src", "components", "ButtonBack.tsx");
      await Bun.write(componentPath, "// existing content");

      await command.run({ name: "ButtonBack", module: "ui" });

      expect(await read(componentPath)).toBe("// existing content");
    });

    test("should override an existing component when the override option is passed", async () => {
      const componentPath = join(testDir, "modules", "ui", "src", "components", "ButtonBack.tsx");
      await Bun.write(componentPath, "// existing content");

      await command.run({ name: "ButtonBack", module: "ui", override: true });

      const content = await read(componentPath);
      expect(content).not.toContain("// existing content");
      expect(content).toContain("export const ButtonBack");
    });
  });
});
