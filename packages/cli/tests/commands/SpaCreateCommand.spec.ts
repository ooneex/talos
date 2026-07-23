import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import moduleTemplate from "@/templates/module/module.txt";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { SpaCreateCommand } = await import("@/commands/SpaCreateCommand");

const exists = (path: string) => Bun.file(path).exists();
const read = (path: string) => Bun.file(path).text();

// Source files and dependencies the mocked clone of the spa repository exposes
const SPA_SRC_FILE = "App.tsx";
const SPA_SRC_CONTENT = "export const App = () => null;\n";
// A source file using a hardcoded `@module/spa` import (the template's own module
// name), which must be rewritten to the target module's `@module/{name}` alias.
const SPA_SELF_IMPORT_FILE = join("pages", "Home.tsx");
const SPA_SELF_IMPORT_CONTENT = 'import { cn } from "@module/spa/utils/cn";\nexport const Home = () => cn("home");\n';
// A minimal but realistic vite config exposing the `resolve.alias` block the
// command extends with a `@module/{design}` alias when a design is selected.
const SPA_VITE_CONFIG_CONTENT = `import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
`;
const SPA_DEPENDENCIES = { react: "^18.0.0" };
const SPA_DEV_DEPENDENCIES = { typescript: "^5.0.0" };
// A static asset file the mocked clone's public dir exposes, which must be copied
// into the module's public dir as-is.
const SPA_PUBLIC_FILE = "favicon.ico";
const SPA_PUBLIC_CONTENT = "fake-favicon-bytes";
// Fake source file content the mocked clone of the design repository exposes.
const DESIGN_SRC_CONTENT = "export const design = true;\n";

describe("SpaCreateCommand", () => {
  let command: InstanceType<typeof SpaCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;
  let originalWhich: typeof Bun.which;
  let spawnCalls: { cmd: string[]; cwd: string; stderr?: unknown }[];

  beforeEach(() => {
    command = new SpaCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `spa-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    spawnCalls = [];

    // Pretend `git` is installed so tests never depend on the host PATH; the
    // missing-binary case is exercised explicitly below.
    originalWhich = Bun.which;
    Bun.which = (() => "/usr/bin/git") as typeof Bun.which;

    // Stub Bun.spawn so "git clone" materializes a fake repository and "bun add" is a no-op
    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = args[0] as string[];
      const opts = args[1] as { cwd?: string; stderr?: unknown } | undefined;
      spawnCalls.push({ cmd: [...cmd], cwd: opts?.cwd ?? "", stderr: opts?.stderr });

      if (cmd[0] === "git" && cmd[1] === "clone") {
        const dest = cmd[cmd.length - 1] as string;

        if (dest.includes("talos-spa-")) {
          const spaTemplateDir = join(dest, "modules", "spa");
          mkdirSync(join(spaTemplateDir, "src", "pages"), { recursive: true });
          writeFileSync(join(spaTemplateDir, "src", SPA_SRC_FILE), SPA_SRC_CONTENT);
          writeFileSync(join(spaTemplateDir, "src", SPA_SELF_IMPORT_FILE), SPA_SELF_IMPORT_CONTENT);
          writeFileSync(join(spaTemplateDir, "vite.config.ts"), SPA_VITE_CONFIG_CONTENT);
          writeFileSync(join(spaTemplateDir, "tsconfig.json"), JSON.stringify({ extends: "../../tsconfig.json" }));
          writeFileSync(join(spaTemplateDir, "spa.yml"), 'type: "spa"\ndesign: "design"\n');
          mkdirSync(join(spaTemplateDir, "public"), { recursive: true });
          writeFileSync(join(spaTemplateDir, "public", SPA_PUBLIC_FILE), SPA_PUBLIC_CONTENT);
          writeFileSync(
            join(spaTemplateDir, "package.json"),
            JSON.stringify({
              name: "@module/spa",
              scripts: {
                test: "bun test tests",
                lint: "tsc --noEmit && bunx biome lint",
                fmt: "bunx biome check --write",
              },
              dependencies: SPA_DEPENDENCIES,
              devDependencies: SPA_DEV_DEPENDENCIES,
            }),
          );
        } else {
          // DesignCreateCommand clones the shared skeleton repo and copies its
          // whole design template dir (src, package.json, design.yml, tsconfig.json).
          const designTemplateDir = join(dest, "modules", "design");
          const designSrcDir = join(designTemplateDir, "src");
          mkdirSync(designSrcDir, { recursive: true });
          writeFileSync(join(designSrcDir, "index.ts"), DESIGN_SRC_CONTENT);
          writeFileSync(
            join(designTemplateDir, "package.json"),
            JSON.stringify({ name: "@module/design", dependencies: {}, devDependencies: {} }),
          );
          writeFileSync(join(designTemplateDir, "design.yml"), 'type: "design"\n');
          writeFileSync(join(designTemplateDir, "tsconfig.json"), JSON.stringify({ extends: "../../tsconfig.json" }));
        }
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
      expect(command.getName()).toBe("spa:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new spa module");
    });
  });

  describe("run() - git guard", () => {
    test("should fail without cloning when git is not installed", async () => {
      Bun.which = (() => null) as typeof Bun.which;

      await command.run({ name: "Spa", cwd: testDir });

      expect(spawnCalls.some((call) => call.cmd[0] === "git")).toBe(false);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });
  });

  describe("run() - file generation", () => {
    test("should generate package.json with kebab name", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "spa", "package.json");
      expect(await exists(filePath)).toBe(true);
      expect(await read(filePath)).toContain("@module/spa");
    });

    test("should generate tsconfig.json", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "modules", "spa", "tsconfig.json"))).toBe(true);
    });

    test("should generate yml file with spa type", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "spa", "spa.yml");
      expect(await exists(filePath)).toBe(true);

      const content = await read(filePath);
      expect(content).toContain('type: "spa"');
      expect(content).not.toContain('type: "module"');
    });

    test("should remove the scaffolded module class file", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "modules", "spa", "src", "SpaModule.ts"))).toBe(false);
    });

    test("should remove the orphaned module spec file", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "modules", "spa", "tests", "SpaModule.spec.ts"))).toBe(false);
    });
  });

  describe("package.json scripts", () => {
    test("should add dev, build and preview scripts", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const pkg = JSON.parse(await read(join(testDir, "modules", "spa", "package.json")));
      expect(pkg.scripts.dev).toBe("bun --bun run vite --port 3030");
      expect(pkg.scripts.build).toBe("bun --bun run vite build");
      expect(pkg.scripts.preview).toBe("bun --bun run vite preview");
    });

    test("should mark the package as an ES module", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const pkg = JSON.parse(await read(join(testDir, "modules", "spa", "package.json")));
      expect(pkg.type).toBe("module");
    });

    test("should set the package name to @module/{name}", async () => {
      await command.run({ name: "MyApp", cwd: testDir, silent: true });

      const pkg = JSON.parse(await read(join(testDir, "modules", "my-app", "package.json")));
      expect(pkg.name).toBe("@module/my-app");
    });

    test("should keep the scaffolded test and lint scripts", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const pkg = JSON.parse(await read(join(testDir, "modules", "spa", "package.json")));
      expect(pkg.scripts.test).toBeDefined();
      expect(pkg.scripts.lint).toBeDefined();
    });

    test("should pick a free port when 3030 is already used by another module", async () => {
      const otherPkg = { name: "@module/other", scripts: { dev: "bun --bun run vite --port 3030" } };
      mkdirSync(join(testDir, "modules", "other"), { recursive: true });
      writeFileSync(join(testDir, "modules", "other", "package.json"), JSON.stringify(otherPkg));

      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const pkg = JSON.parse(await read(join(testDir, "modules", "spa", "package.json")));
      expect(pkg.scripts.dev).toBe("bun --bun run vite --port 3031");
    });

    test("should skip consecutive used ports", async () => {
      for (const [name, port] of [
        ["alpha", 3030],
        ["beta", 3031],
      ] as const) {
        mkdirSync(join(testDir, "modules", name), { recursive: true });
        writeFileSync(
          join(testDir, "modules", name, "package.json"),
          JSON.stringify({ name: `@module/${name}`, scripts: { dev: `bun --bun run vite --port ${port}` } }),
        );
      }

      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const pkg = JSON.parse(await read(join(testDir, "modules", "spa", "package.json")));
      expect(pkg.scripts.dev).toBe("bun --bun run vite --port 3032");
    });
  });

  describe("spa source content", () => {
    test("should copy the repository src into the module src", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "spa", "src", SPA_SRC_FILE);
      expect(await exists(filePath)).toBe(true);
      expect(await read(filePath)).toBe(SPA_SRC_CONTENT);
    });

    test("should rewrite hardcoded `@module/spa` imports to the target module's `@module/{name}` alias", async () => {
      await command.run({ name: "MyApp", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "my-app", "src", SPA_SELF_IMPORT_FILE);
      const content = await read(filePath);
      expect(content).toContain('from "@module/my-app/utils/cn"');
      expect(content).not.toContain('from "@module/spa/');
    });

    test("should leave source files without `@module/spa` imports unchanged", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "spa", "src", SPA_SRC_FILE);
      expect(await read(filePath)).toBe(SPA_SRC_CONTENT);
    });

    test("should copy the repository vite config into the module root", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "spa", "vite.config.ts");
      expect(await exists(filePath)).toBe(true);
      expect(await read(filePath)).toBe(SPA_VITE_CONFIG_CONTENT);
    });

    test("should clone the spa repository", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const cloneCall = spawnCalls.find((call) => call.cmd[0] === "git" && call.cmd[1] === "clone");
      expect(cloneCall).toBeDefined();
      expect(cloneCall?.cmd).toContain("https://github.com/ooneex/skeleton.git");
    });

    test("should run clone and installs silently without inheriting output", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const setupCalls = spawnCalls.filter(
        (call) =>
          (call.cmd[0] === "git" && call.cmd[1] === "clone") || (call.cmd[0] === "bun" && call.cmd[1] === "add"),
      );
      expect(setupCalls.length).toBeGreaterThan(0);
      for (const call of setupCalls) {
        expect(call.stderr).toBe("pipe");
      }
    });
  });

  describe("shared folder", () => {
    test("should create a shared folder with a .gitkeep file", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const gitkeep = join(testDir, "modules", "spa", "src", "shared", ".gitkeep");
      expect(await exists(gitkeep)).toBe(true);
      expect(await read(gitkeep)).toBe("");
    });

    test("should not pre-create shared sub-folders", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      for (const subDir of [
        "assets",
        "components",
        "hooks",
        "layouts",
        "services",
        "store",
        "styles",
        "types",
        "utils",
      ]) {
        const gitkeep = join(testDir, "modules", "spa", "src", "shared", subDir, ".gitkeep");
        expect(await exists(gitkeep)).toBe(false);
      }
    });
  });

  describe("public folder", () => {
    test("should copy the repository's public dir into the module root", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const filePath = join(testDir, "modules", "spa", "public", SPA_PUBLIC_FILE);
      expect(await exists(filePath)).toBe(true);
      expect(await read(filePath)).toBe(SPA_PUBLIC_CONTENT);
    });
  });

  describe("dependency installation", () => {
    test("should install dependencies from the spa package.json at the project root", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const depsCall = spawnCalls.find(
        (call) => call.cmd[0] === "bun" && call.cmd[1] === "add" && call.cmd[2] !== "-D",
      );
      expect(depsCall).toBeDefined();
      expect(depsCall?.cmd).toContain("react");
      expect(depsCall?.cmd).not.toContain("react@^18.0.0");
      expect(depsCall?.cwd).toBe(testDir);
    });

    test("should install devDependencies from the spa package.json at the project root", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const devDepsCall = spawnCalls.find(
        (call) => call.cmd[0] === "bun" && call.cmd[1] === "add" && call.cmd[2] === "-D",
      );
      expect(devDepsCall).toBeDefined();
      expect(devDepsCall?.cmd).toContain("typescript");
      expect(devDepsCall?.cmd).not.toContain("typescript@^5.0.0");
      expect(devDepsCall?.cwd).toBe(testDir);
    });
  });

  describe("name normalization", () => {
    test("should normalize name to kebab-case for directory", async () => {
      await command.run({ name: "SpaShell", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "modules", "spa-shell", "spa-shell.yml"))).toBe(true);
    });

    test("should strip Module suffix from provided name", async () => {
      await command.run({ name: "SpaModule", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "modules", "spa", "package.json"))).toBe(true);
    });

    test("should prompt for name when not provided", async () => {
      await command.run({ cwd: testDir, silent: true });

      // enquirer mock resolves { name: "Test" }
      expect(await exists(join(testDir, "modules", "test", "test.yml"))).toBe(true);
    });
  });

  describe("design option", () => {
    test("should record the chosen design in the spa yml", async () => {
      await command.run({ name: "Spa", design: "Design", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "spa", "spa.yml"));
      expect(content).toContain('type: "spa"');
      expect(content).toContain('design: "design"');
    });

    test("should scaffold the design module when it does not exist", async () => {
      await command.run({ name: "Spa", design: "Design", cwd: testDir, silent: true });

      const designYml = join(testDir, "modules", "design", "design.yml");
      expect(await exists(designYml)).toBe(true);
      expect(await read(designYml)).toContain('type: "design"');

      const designCloneCall = spawnCalls.find(
        (call) =>
          call.cmd[0] === "git" && call.cmd[1] === "clone" && call.cmd.some((arg) => arg.includes("talos-design-")),
      );
      expect(designCloneCall).toBeDefined();
    });

    test("should reuse an existing design module without re-scaffolding it", async () => {
      mkdirSync(join(testDir, "modules", "my-design"), { recursive: true });
      writeFileSync(join(testDir, "modules", "my-design", "my-design.yml"), 'type: "design"\n');

      await command.run({ name: "Spa", design: "MyDesign", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "spa", "spa.yml"));
      expect(content).toContain('design: "my-design"');

      const designCloneCall = spawnCalls.find(
        (call) =>
          call.cmd[0] === "git" && call.cmd[1] === "clone" && call.cmd.some((arg) => arg.includes("talos-design-")),
      );
      expect(designCloneCall).toBeUndefined();
    });

    test("should not add a design entry when no design is provided", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "spa", "spa.yml"));
      expect(content).not.toContain("design:");
    });

    test("should add a design alias to the module vite config", async () => {
      await command.run({ name: "Spa", design: "Design", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "spa", "vite.config.ts"));
      expect(content).toContain('"@module/design": fileURLToPath(');
      expect(content).toContain('new URL("../design/src", import.meta.url)');
      // The original `@` alias must be preserved alongside the new one
      expect(content).toContain('"@": fileURLToPath(new URL("./src", import.meta.url))');
    });

    test("should point the design alias at the chosen design module", async () => {
      mkdirSync(join(testDir, "modules", "my-design"), { recursive: true });
      writeFileSync(join(testDir, "modules", "my-design", "my-design.yml"), 'type: "design"\n');

      await command.run({ name: "Spa", design: "MyDesign", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "spa", "vite.config.ts"));
      expect(content).toContain('"@module/my-design": fileURLToPath(');
      expect(content).toContain('new URL("../my-design/src", import.meta.url)');
    });

    test("should not add a design alias when no design is provided", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "spa", "vite.config.ts"));
      expect(content).toBe(SPA_VITE_CONFIG_CONTENT);
      expect(content).not.toContain("@module/");
    });
  });

  describe("AppModule integration", () => {
    beforeEach(async () => {
      const appModuleContent = moduleTemplate.replace(/{{NAME}}/g, "App");
      await Bun.write(join(testDir, "modules", "app", "src", "AppModule.ts"), appModuleContent);
    });

    test("should not register the spa module into AppModule", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "app", "src", "AppModule.ts"));
      expect(content).not.toContain("SpaModule");
    });
  });

  describe("SharedModule integration", () => {
    beforeEach(async () => {
      const sharedModuleContent = moduleTemplate.replace(/{{NAME}}/g, "Shared");
      await Bun.write(join(testDir, "modules", "shared", "src", "SharedModule.ts"), sharedModuleContent);
    });

    test("should not register the spa module into SharedModule", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const content = await read(join(testDir, "modules", "shared", "src", "SharedModule.ts"));
      expect(content).not.toContain("SpaModule");
    });
  });

  describe("tsconfig integration", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }, null, 2));
    });

    test("should register the spa module path alias in the root tsconfig paths", async () => {
      await command.run({ name: "Spa", cwd: testDir, silent: true });

      const tsconfig = JSON.parse(await read(join(testDir, "tsconfig.json")));
      expect(tsconfig.compilerOptions.paths?.["@module/spa/*"]).toEqual(["./modules/spa/src/*"]);
    });

    test("should not create a root tsconfig when it does not exist", async () => {
      rmSync(join(testDir, "tsconfig.json"), { force: true });

      await command.run({ name: "Spa", cwd: testDir, silent: true });

      expect(await exists(join(testDir, "tsconfig.json"))).toBe(false);
    });
  });
});
